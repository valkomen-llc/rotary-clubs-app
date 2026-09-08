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
                      AND column_name = 'originalS3Key') AS has_original,
            EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = 'Media'
                      AND column_name = 'thumbUrl') AS has_thumb,
            EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = 'Media'
                      AND column_name = 'trim') AS has_trim,
            EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = 'Media'
                      AND column_name = 'focal') AS has_focal,
            EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = 'MediaFolder'
                      AND column_name = 'sourceId') AS has_source,
            -- OJO: estas dos entraban en el mismo bloque que sourceId y por
            -- eso funcionaban POR CASUALIDAD. Comprobar una y dar las otras
            -- por puestas vale mientras nadie agregue una cuarta a ese ALTER;
            -- el dia que la agregue, el ALTER no correria nunca. Es la trampa
            -- que v4.987 encontro con la columna feed. Se enumeran todas.
            EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = 'MediaFolder'
                      AND column_name = 'sourceType') AS has_source_type,
            EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = 'MediaFolder'
                      AND column_name = 'campaignId') AS has_campaign
    `);
    // La lista de objetos que se comprueban NO es un número de versión: enumera
    // lo que este archivo crea de verdad, y hay que ampliarla al agregar uno
    // nuevo o la comprobación rápida lo dará por presente y no se creará nunca.
    if (rows[0]?.has_table && rows[0]?.has_column && rows[0]?.has_original && rows[0]?.has_thumb && rows[0]?.has_trim && rows[0]?.has_focal && rows[0]?.has_source && rows[0]?.has_source_type && rows[0]?.has_campaign) {
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
        ALTER TABLE "Media" ADD COLUMN IF NOT EXISTS "thumbUrl" TEXT;
        ALTER TABLE "Media" ADD COLUMN IF NOT EXISTS "trim" JSONB;
        ALTER TABLE "Media" ADD COLUMN IF NOT EXISTS "focal" JSONB;
        -- El encuadre se resuelve POR URL (regla de v4.967: la relación con la
        -- Biblioteca no se duplica), y esa consulta la paga cada visita de un
        -- artículo. Sin índice sería un recorrido de toda la tabla del sitio.
        CREATE INDEX IF NOT EXISTS "Media_url_idx" ON "Media"(url);
    `);

    // ── De dónde salió una carpeta (v4.1004) ──────────────────────────
    //
    // ⚠️ LA RELACIÓN VA POR ID, NUNCA POR NOMBRE. La carpeta de una solicitud
    // se crea sola y su nombre se deriva del título —que se recorta a 60
    // caracteres, que se corrige, y que dos solicitudes pueden compartir—: con
    // el nombre como llave, un reproceso encontraría la carpeta de otra
    // solicitud o ninguna, y el fallo sería MUDO — una carpeta nueva por
    // intento, con el material repartido entre ellas.
    //
    // `sourceType` acá NO es el de `Media`, y no se reutiliza aquel nombre por
    // casualidad: en `Media` significa DE QUIÉN es el archivo
    // (club/district/project/platform) y lo consume el filtro por sitio del
    // selector. Acá significa QUÉ ORIGINÓ la carpeta. Son dos preguntas
    // distintas sobre dos tablas distintas.
    //
    // ADITIVO: toda carpeta creada a mano queda con los tres campos en NULL y
    // se comporta exactamente como antes.
    await db.query(`
        ALTER TABLE "MediaFolder" ADD COLUMN IF NOT EXISTS "sourceType" TEXT;
        ALTER TABLE "MediaFolder" ADD COLUMN IF NOT EXISTS "sourceId" TEXT;
        ALTER TABLE "MediaFolder" ADD COLUMN IF NOT EXISTS "campaignId" TEXT;
    `);

    // Una solicitud tiene UNA carpeta por sitio. Es lo que hace idempotente al
    // workflow: dos vueltas del cron, el sondeo del navegador y el botón manual
    // resuelven la misma fila en vez de crear tres carpetas.
    //
    // Es PARCIAL —las carpetas de siempre tienen `sourceId` NULL y en Postgres
    // NULL nunca es igual a NULL, así que sin el predicado ninguna chocaría
    // consigo misma pero el índice cargaría con todas—, y por serlo NO se usa
    // `ON CONFLICT` contra él: tendría que repetir su predicado o la sentencia
    // falla entera (el error real de v4.648). La resolución hace SELECT →
    // INSERT → y ante el choque vuelve a leer.
    await db.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS "MediaFolder_source_key"
            ON "MediaFolder"(COALESCE("clubId", ''), "sourceType", "sourceId")
            WHERE "sourceId" IS NOT NULL;
        CREATE INDEX IF NOT EXISTS "MediaFolder_campaign_idx"
            ON "MediaFolder"("campaignId") WHERE "campaignId" IS NOT NULL;
    `);

    _ready = true;
}

export default ensureMediaFolderSchema;
