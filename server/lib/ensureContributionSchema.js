// Crea en runtime, de forma perezosa e idempotente, las tablas del módulo
// «Campañas de Contribución».
//
// POR QUÉ RUNTIME: tras el incidente del 2026-07-13 el build ya NO ejecuta
// `prisma db push` (regla durable, ver CLAUDE.md), así que las tablas nuevas
// no se crean solas en producción. Mismo patrón que BannerTemplate,
// DesignProject y las ProjectFair*: CREATE TABLE IF NOT EXISTS + ADD COLUMN
// IF NOT EXISTS. Nunca DROP, nunca TRUNCATE. Y sobre todo: NINGÚN cambio en
// schema.prisma — una columna declarada y todavía inexistente tumbaría de un
// 500 a todo consumidor Prisma desde el primer despliegue (regla de
// `logo_intl`, v4.699).
//
// Al no estar en schema.prisma, las cinco tablas quedan protegidas por
// scripts/db-push-guard.mjs: un `npm run db:push` avisa antes de borrarlas.
//
// La comprobación previa (una consulta al catálogo) es la regla de
// rendimiento de v4.659. La lista de objetos comprobados NO es un número de
// versión: enumera los objetos reales del archivo — al agregar una tabla o
// columna hay que agregarla acá, o la comprobación rápida la da por presente
// y no se crea nunca.
import db from './db.js';

let _ready = false;

export async function ensureContributionSchema() {
    if (_ready) return;

    const { rows } = await db.query(
        `SELECT to_regclass('public."ContributionCampaign"') IS NOT NULL AS campania,
                to_regclass('public."ContributionCenter"') IS NOT NULL AS centro,
                to_regclass('public."ContributionCampaignOverride"') IS NOT NULL AS override,
                to_regclass('public."ContributionCampaignHistory"') IS NOT NULL AS historial,
                to_regclass('public."ContributionCampaignMetric"') IS NOT NULL AS metrica`
    );
    if (rows[0]?.campania && rows[0]?.centro && rows[0]?.override
        && rows[0]?.historial && rows[0]?.metrica) { _ready = true; return; }

    // ── La campaña ────────────────────────────────────────────────────
    //
    // El contenido es un DOCUMENTO (JSONB entero), como el grafo de un
    // recorrido del CRM: normalizarlo a columnas obligaría a migrar el
    // esquema con cada sección nueva sin ganar ninguna consulta. Lo que SÍ
    // es columna es lo que se filtra o se ordena: estado, fechas, prioridad.
    await db.query(`
        CREATE TABLE IF NOT EXISTS "ContributionCampaign" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            slug TEXT NOT NULL,
            name TEXT NOT NULL,
            "campaignType" TEXT NOT NULL DEFAULT 'otro',

            -- Lo GUARDADO; lo efectivo se deriva al leer con las fechas
            -- (contributionSpec.effectiveStatus). Sin cron.
            status TEXT NOT NULL DEFAULT 'draft',
            "startAt" TIMESTAMPTZ,
            "endAt" TIMESTAMPTZ,
            priority INTEGER NOT NULL DEFAULT 0,

            content JSONB NOT NULL DEFAULT '{}'::jsonb,
            stats JSONB NOT NULL DEFAULT '[]'::jsonb,
            targeting JSONB NOT NULL DEFAULT '{}'::jsonb,

            -- A qué club entra el dinero. NULL = al sitio que pinta la
            -- campaña (cada club recauda lo suyo, como hoy).
            "recipientClubId" TEXT,

            "createdBy" TEXT,
            "updatedBy" TEXT,
            "publishedAt" TIMESTAMPTZ,
            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    `);
    await db.query(`CREATE UNIQUE INDEX IF NOT EXISTS "ContributionCampaign_slug_key" ON "ContributionCampaign" (slug);`);
    await db.query(`CREATE INDEX IF NOT EXISTS "ContributionCampaign_status_idx" ON "ContributionCampaign" (status, "updatedAt" DESC);`);

    // ── Centros de acopio ─────────────────────────────────────────────
    //
    // Estructurados, nunca un textarea: la ciudad agrupa, el subgrupo
    // («Norte»/«Centro»/«Sur») ordena dentro de Cali, y `clubId` distingue
    // los centros CENTRALES (NULL) de los que un sitio agrega localmente.
    await db.query(`
        CREATE TABLE IF NOT EXISTS "ContributionCenter" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            "campaignId" TEXT NOT NULL,
            city TEXT NOT NULL,
            "groupLabel" TEXT,
            name TEXT,
            address TEXT NOT NULL,
            complement TEXT,
            schedule TEXT,
            "contactName" TEXT,
            phone TEXT,
            notes TEXT,
            lat DOUBLE PRECISION,
            lng DOUBLE PRECISION,
            active BOOLEAN NOT NULL DEFAULT true,
            "sortOrder" INTEGER NOT NULL DEFAULT 0,
            "clubId" TEXT,
            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS "ContributionCenter_campaign_idx" ON "ContributionCenter" ("campaignId", city, "sortOrder");`);

    // ── Sobrescritura local ───────────────────────────────────────────
    //
    // SOLO las claves de OVERRIDE_WHITELIST (lo impone el endpoint con
    // sanitizeOverride — patrón stripProtected). Una fila por sitio.
    await db.query(`
        CREATE TABLE IF NOT EXISTS "ContributionCampaignOverride" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            "campaignId" TEXT NOT NULL,
            "clubId" TEXT NOT NULL,
            content JSONB NOT NULL DEFAULT '{}'::jsonb,
            "updatedBy" TEXT,
            "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE ("campaignId", "clubId")
        );
    `);

    // ── Auditoría ─────────────────────────────────────────────────────
    //
    // Quién creó, quién modificó, qué cambió, cuándo se publicó y cuándo se
    // pausó. Mismo criterio que EventRegistrationHistory: el estado no se
    // escribe sin historial.
    await db.query(`
        CREATE TABLE IF NOT EXISTS "ContributionCampaignHistory" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            "campaignId" TEXT NOT NULL,
            action TEXT NOT NULL,
            actor TEXT,
            detail JSONB NOT NULL DEFAULT '{}'::jsonb,
            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS "ContributionCampaignHistory_campaign_idx" ON "ContributionCampaignHistory" ("campaignId", "createdAt" DESC);`);

    // ── Métricas ──────────────────────────────────────────────────────
    //
    // Contadores DIARIOS agregados (view, cta_donate_click, checkout_started,
    // donation_completed…), no una fila por visita: UPSERT con incremento.
    // Sin PII. La conversión que salga de acá es ATRIBUCIÓN, no causalidad
    // (regla del CRM), y la UI lo dirá así cuando llegue el panel (Fase 5).
    await db.query(`
        CREATE TABLE IF NOT EXISTS "ContributionCampaignMetric" (
            "campaignId" TEXT NOT NULL,
            "clubId" TEXT NOT NULL,
            date DATE NOT NULL,
            type TEXT NOT NULL,
            count INTEGER NOT NULL DEFAULT 0,
            "amountSum" DOUBLE PRECISION NOT NULL DEFAULT 0,
            currency TEXT,
            PRIMARY KEY ("campaignId", "clubId", date, type)
        );
    `);

    _ready = true;
}

export default ensureContributionSchema;
