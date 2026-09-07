// ════════════════════════════════════════════════════════════════════════════
// Analítica de un artículo — el esquema, en runtime (v4.1000)
//
// Mismo reparto que las Redirecciones de Enlaces (v4.993), por el mismo
// motivo: los EVENTOS crudos crecen con el tráfico y el AGREGADO diario es lo
// que se lee para pintar totales y series; los desgloses (fuente, dispositivo,
// país) leen eventos acotados por `(postId, createdAt)`.
//
// ⚠️ LA IP NO SE GUARDA EN NINGUNA PARTE. `visitorKey` es un hash con sal
// (`visitorKeyFor`, el mismo de los enlaces). El país y la ciudad salen de las
// cabeceras del borde, que no exigen conservar la dirección.
//
// `Post` NO gana ni una columna (regla de `logo_intl`, v4.699). El vínculo va
// por `postId` desde acá, y todo lo que se lee se acota además por `clubId`.
// ════════════════════════════════════════════════════════════════════════════
import db from './db.js';

let _ready = false;

export async function ensureArticleAnalyticsSchema() {
    if (_ready) return;
    const { rows } = await db.query(`
        SELECT to_regclass('public."ArticleViewEvent"') IS NOT NULL AS e,
               to_regclass('public."ArticleViewDaily"') IS NOT NULL AS d,
               to_regclass('public."ArticleViewVisitor"') IS NOT NULL AS v
    `);
    if (rows[0]?.e && rows[0]?.d && rows[0]?.v) { _ready = true; return; }

    await db.query(`
        CREATE TABLE IF NOT EXISTS "ArticleViewEvent" (
            id TEXT PRIMARY KEY,
            "postId" TEXT NOT NULL,
            "clubId" TEXT,
            -- view | leave | click. viewId ata la salida y los clics a su vista.
            kind TEXT NOT NULL DEFAULT 'view',
            "viewId" TEXT NOT NULL DEFAULT '',
            "visitorKey" TEXT NOT NULL DEFAULT '',
            "isNewVisitor" BOOLEAN NOT NULL DEFAULT FALSE,
            referrer TEXT NOT NULL DEFAULT '',
            "referrerHost" TEXT NOT NULL DEFAULT '',
            "sourceKind" TEXT NOT NULL DEFAULT 'directo',
            "sourceLabel" TEXT NOT NULL DEFAULT '',
            "utmSource" TEXT NOT NULL DEFAULT '',
            "utmMedium" TEXT NOT NULL DEFAULT '',
            "utmCampaign" TEXT NOT NULL DEFAULT '',
            "utmContent" TEXT NOT NULL DEFAULT '',
            "utmTerm" TEXT NOT NULL DEFAULT '',
            device TEXT NOT NULL DEFAULT '',
            browser TEXT NOT NULL DEFAULT '',
            os TEXT NOT NULL DEFAULT '',
            country TEXT NOT NULL DEFAULT '',
            city TEXT NOT NULL DEFAULT '',
            "durationSec" INTEGER NOT NULL DEFAULT 0,
            "scrollPct" INTEGER NOT NULL DEFAULT 0,
            target TEXT NOT NULL DEFAULT '',
            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS "ArticleViewEvent_post_idx" ON "ArticleViewEvent" ("postId", "createdAt" DESC);`);

    await db.query(`
        CREATE TABLE IF NOT EXISTS "ArticleViewDaily" (
            "postId" TEXT NOT NULL,
            "clubId" TEXT,
            day DATE NOT NULL,
            views INTEGER NOT NULL DEFAULT 0,
            uniques INTEGER NOT NULL DEFAULT 0,
            clicks INTEGER NOT NULL DEFAULT 0,
            -- El tiempo de lectura: suma de segundos y cuántas salidas lo
            -- reportaron. El promedio es seconds/samples, nunca views.
            seconds BIGINT NOT NULL DEFAULT 0,
            samples INTEGER NOT NULL DEFAULT 0,
            bots INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY ("postId", day)
        );
    `);

    await db.query(`
        CREATE TABLE IF NOT EXISTS "ArticleViewVisitor" (
            "postId" TEXT NOT NULL,
            "visitorKey" TEXT NOT NULL,
            "firstSeenAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            "lastSeenAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            views INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY ("postId", "visitorKey")
        );
    `);
    _ready = true;
}

export default ensureArticleAnalyticsSchema;
