// Crea en runtime, de forma perezosa e idempotente, lo que necesitan las
// carpetas de la Librería de Medios.
//
// POR QUÉ EN RUNTIME: tras el incidente del 2026-07-13 el build ya NO ejecuta
// `prisma db push` (regla durable, ver CLAUDE.md), así que una tabla nueva no
// aparece sola en producción. Mismo patrón que `BannerTemplate`, las
// `ProjectFair*` y las del Creador de Reels: CREATE TABLE IF NOT EXISTS +
// ADD COLUMN IF NOT EXISTS. Nunca DROP, nunca TRUNCATE.
//
// DOS PIEZAS Y DOS REGLAS DISTINTAS:
//
//   1. `MediaFolder` es tabla NUEVA y vive FUERA de Prisma, como manda la
//      sección de base de datos de CLAUDE.md. Queda protegida por
//      `scripts/db-push-guard.mjs`, que compara lo que hay en la base contra
//      los modelos del schema.
//
//   2. `Media."folderId"` es una columna sobre una tabla que SÍ es de Prisma y
//      que tiene datos de producción. Por eso va declarada TAMBIÉN en
//      `schema.prisma`: el guardián compara TABLAS, no columnas, así que una
//      columna que existiera sólo acá la borraría el primer `npm run db:push`
//      sin que nada avisara. Es la misma regla que ya siguen las columnas
//      nuevas de `WhatsAppContact` y `WhatsAppMessageLog`.
//
// La columna se AGREGA; `Media` jamás se recrea.
import db from './db.js';

let _ready = false;

export async function ensureMediaFolderSchema() {
    if (_ready) return;

    // Comprobar antes de ejecutar (regla de rendimiento de v4.659): estas
    // sentencias son idempotentes pero no gratis, y las paga la primera visita
    // tras un arranque en frío. Dos consultas al catálogo deciden si hay algo
    // que hacer.
    const { rows } = await db.query(`
        SELECT
            EXISTS (SELECT 1 FROM pg_tables
                    WHERE schemaname = 'public' AND tablename = 'MediaFolder') AS has_table,
            EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = 'Media'
                      AND column_name = 'folderId') AS has_column,
            EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = 'Media'
                      AND column_name = 'originalS3Key') AS has_original
    `);
    // La lista de objetos que se comprueban NO es un número de versión: enumera
    // lo que este archivo crea de verdad, y hay que ampliarla al agregar uno
    // nuevo o la comprobación rápida lo dará por presente y no se creará nunca.
    if (rows[0]?.has_table && rows[0]?.has_column && rows[0]?.has_original) {
        _ready = true;
        return;
    }

    await db.query(`
        CREATE TABLE IF NOT EXISTS "MediaFolder" (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            "clubId" TEXT,
            "parentId" TEXT,
            "createdBy" TEXT,
            "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS "MediaFolder_clubId_idx" ON "MediaFolder"("clubId");
        CREATE INDEX IF NOT EXISTS "MediaFolder_parentId_idx" ON "MediaFolder"("parentId");
    `);

    // Dos carpetas hermanas no pueden llamarse igual. Son DOS índices porque en
    // Postgres NULL nunca es igual a NULL: con un solo índice sobre
    // (clubId, parentId, name) las carpetas de la RAÍZ —que tienen parentId
    // NULL— no chocarían nunca entre sí, que es justo donde más se repite un
    // nombre. Lo mismo con "clubId" en el sitio de la plataforma.
    //
    // Son PARCIALES, así que cualquier ON CONFLICT contra ellos tendría que
    // repetir su predicado o la sentencia falla entera (error real, corregido
    // en v4.648). Por eso el alta comprueba el duplicado explícitamente y
    // devuelve un 409 redactado, en vez de apoyarse en ON CONFLICT.
    await db.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS "MediaFolder_root_name_key"
            ON "MediaFolder"(COALESCE("clubId", ''), LOWER(name))
            WHERE "parentId" IS NULL;

        CREATE UNIQUE INDEX IF NOT EXISTS "MediaFolder_child_name_key"
            ON "MediaFolder"(COALESCE("clubId", ''), "parentId", LOWER(name))
            WHERE "parentId" IS NOT NULL;
    `);

    // La columna que ata un archivo a su carpeta. Sin FK a propósito: `Media`
    // la gobierna Prisma y `MediaFolder` no, así que una restricción declarada
    // sólo acá sería otra cosa que `db push` podría quitar sin avisar. La
    // integridad la sostiene el borrado de carpeta, que sube sus archivos al
    // padre antes de borrar, y `buildFolderTree`, que muestra en la raíz lo que
    // apunte a una carpeta inexistente en vez de esconderlo.
    await db.query(`
        ALTER TABLE "Media" ADD COLUMN IF NOT EXISTS "folderId" TEXT;
        CREATE INDEX IF NOT EXISTS "Media_folderId_idx" ON "Media"("folderId");
        ALTER TABLE "Media" ADD COLUMN IF NOT EXISTS "originalS3Key" TEXT;
    `);

    _ready = true;
}

export default ensureMediaFolderSchema;
