// ════════════════════════════════════════════════════════════════════
// De dónde salió una publicación — `SocialPublicationOrigin` (v4.967)
//
// POR QUÉ NO ES UNA COLUMNA DE `SocialPublication`. Era el camino corto y es el
// riesgo de despliegue que documenta la regla de `logo_intl` (v4.699): el build
// NO ejecuta `prisma db push` desde el incidente del 2026-07-13, así que una
// columna declarada en `schema.prisma` y todavía inexistente en la base deja en
// 500 a todo consumidor Prisma hasta que alguien la cree a mano, y ese «hasta
// que alguien» no tiene fecha. `socialPublication.findMany` se llama SIN
// `select` en la Biblioteca de Publicaciones y en el cron de programadas: lo
// que caería es el listado y la publicación automática de lo agendado.
//
// Es exactamente la decisión de `EcosystemClone` (v4.749): «`Project` no tiene
// columna Json donde meter la procedencia y añadirle una es el riesgo que
// documenta la regla de logo_intl». Una tabla creada en runtime no lo tiene.
//
// SÓLO AGREGA CONTEXTO: la publicación existe y se lista igual sin su fila.
// Toda lectura DEGRADA a null — esto corre en el camino de generar y publicar,
// y una traza que no se puede leer no puede costar una publicación.
//
// La tabla vive FUERA de Prisma y está en la lista de `scripts/db-push-guard.mjs`.
// ════════════════════════════════════════════════════════════════════
import db from './db.js';

let _ready = false;

export async function ensurePublicationOriginSchema() {
    if (_ready) return;

    // Comprobar antes de ejecutar (regla de rendimiento de v4.659). La lista de
    // objetos comprobados NO es un número de versión: enumera lo que este
    // archivo crea de verdad, y hay que ampliarla al agregar uno nuevo o el
    // atajo lo dará por presente y no se creará nunca (la trampa de v4.908).
    const { rows } = await db.query(`
        SELECT
            EXISTS (SELECT 1 FROM pg_tables
                    WHERE schemaname = 'public' AND tablename = 'SocialPublicationOrigin') AS has_table
    `);
    if (rows[0]?.has_table) { _ready = true; return; }

    await db.query(`
        CREATE TABLE IF NOT EXISTS "SocialPublicationOrigin" (
            "publicationId" TEXT PRIMARY KEY,
            "clubId"        TEXT,
            "publicationType" TEXT,
            "campaignId"    TEXT,
            "campaignSlug"  TEXT,
            "campaignName"  TEXT,
            "objective"     TEXT,
            "audience"      TEXT,
            "language"      TEXT,
            "additionalContext" TEXT,
            "mediaIds"      TEXT[] NOT NULL DEFAULT '{}',
            "mediaUrls"     TEXT[] NOT NULL DEFAULT '{}',
            "platforms"     TEXT[] NOT NULL DEFAULT '{}',
            "config"        JSONB,
            "issues"        JSONB,
            "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS "SocialPublicationOrigin_campaignId_idx"
            ON "SocialPublicationOrigin"("campaignId");
        CREATE INDEX IF NOT EXISTS "SocialPublicationOrigin_club_type_idx"
            ON "SocialPublicationOrigin"("clubId", "publicationType");
    `);

    _ready = true;
}

export default ensurePublicationOriginSchema;
