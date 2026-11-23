// ════════════════════════════════════════════════════════════════════
// Sitio web de Club Platform — el esquema, en runtime (v4.1348.0)
//
// SEIS tablas fuera de Prisma, todas con prefijo `PlatformSite`. Sin claves
// foráneas hacia tablas existentes y SIN columna `clubId`: el sitio
// institucional no es un tenant. Ninguna consulta de un sitio de club puede
// alcanzarlas por su alcance, y ninguna de éstas lee datos privados de un club.
//
//   PlatformSite          la fila ÚNICA del sitio (id = 'main'): borrador,
//                         versión publicada, revisión, dominio público
//   PlatformSiteVersion   cada publicación, inmutable (para revertir)
//   PlatformSiteEvent     la bitácora: quién hizo qué y cuándo
//   PlatformSiteMember    editores y revisores (el administrador central no va aquí)
//   PlatformSiteLead      solicitudes del formulario público (datos personales: PRIVADOS)
//   PlatformSiteDaily     visitas por día y página, sin IP ni datos personales
//
// Están en la lista del guardián de `db:push` y en la de CLAUDE.md.
// ════════════════════════════════════════════════════════════════════
import db from './db.js';

let _ready = false;

// ⚠️ TODO `ADD COLUMN` VA ENUMERADO ACÁ (la trampa de v4.908): `CREATE TABLE
// IF NOT EXISTS` no amplía una tabla que ya existe.
export const OWNED_COLUMNS = {
    PlatformSite: [],
    PlatformSiteVersion: [],
    PlatformSiteEvent: [],
    PlatformSiteMember: [],
    PlatformSiteLead: [],
    PlatformSiteDaily: [],
};
export const PLATFORM_SITE_TABLES = Object.keys(OWNED_COLUMNS);

export async function ensurePlatformSiteSchema() {
    if (_ready) return;
    const { rows } = await db.query(
        `SELECT COUNT(*)::int AS tablas FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = ANY($1)`,
        [PLATFORM_SITE_TABLES]
    );
    if (rows[0]?.tablas === PLATFORM_SITE_TABLES.length) { _ready = true; return; }

    await db.query(`
        CREATE TABLE IF NOT EXISTS "PlatformSite" (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL DEFAULT 'Club Platform for Rotary',
            "siteType" TEXT NOT NULL DEFAULT 'platform',
            "schemaVersion" INTEGER NOT NULL DEFAULT 1,
            draft JSONB NOT NULL,
            published JSONB,
            "draftVersion" INTEGER NOT NULL DEFAULT 1,
            "publishedVersion" INTEGER,
            "publishedDraftVersion" INTEGER,
            "requireReview" BOOLEAN NOT NULL DEFAULT TRUE,
            "reviewStatus" TEXT NOT NULL DEFAULT 'draft',
            "reviewedVersion" INTEGER,
            "reviewNote" TEXT,
            "reviewedBy" TEXT,
            "reviewedByName" TEXT,
            "reviewedAt" TIMESTAMPTZ,
            "publicHost" TEXT NOT NULL DEFAULT 'clubplatform.org',
            "publicLive" BOOLEAN NOT NULL DEFAULT FALSE,
            "liveAt" TIMESTAMPTZ,
            "liveByName" TEXT,
            "createdBy" TEXT,
            "createdByName" TEXT,
            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            "updatedBy" TEXT,
            "updatedByName" TEXT,
            "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            "publishedBy" TEXT,
            "publishedByName" TEXT,
            "publishedAt" TIMESTAMPTZ
        )
    `);
    await db.query(`
        CREATE TABLE IF NOT EXISTS "PlatformSiteVersion" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            "siteId" TEXT NOT NULL,
            version INTEGER NOT NULL,
            config JSONB NOT NULL,
            summary JSONB NOT NULL DEFAULT '[]'::jsonb,
            note TEXT,
            "restoredFrom" INTEGER,
            "publishedBy" TEXT,
            "publishedByName" TEXT,
            "publishedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE ("siteId", version)
        )
    `);
    await db.query(`
        CREATE TABLE IF NOT EXISTS "PlatformSiteEvent" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            "siteId" TEXT NOT NULL,
            action TEXT NOT NULL,
            "actorId" TEXT,
            "actorName" TEXT,
            detail JSONB NOT NULL DEFAULT '{}'::jsonb,
            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS "PlatformSiteEvent_site_idx" ON "PlatformSiteEvent" ("siteId", "createdAt" DESC)`);
    await db.query(`
        CREATE TABLE IF NOT EXISTS "PlatformSiteMember" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            "siteId" TEXT NOT NULL,
            "userId" TEXT,
            email TEXT NOT NULL,
            name TEXT,
            role TEXT NOT NULL,
            "grantedBy" TEXT,
            "grantedByName" TEXT,
            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE ("siteId", email)
        )
    `);
    await db.query(`
        CREATE TABLE IF NOT EXISTS "PlatformSiteLead" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            "siteId" TEXT NOT NULL,
            name TEXT NOT NULL,
            email TEXT NOT NULL,
            organization TEXT,
            "roleTitle" TEXT,
            country TEXT,
            phone TEXT,
            message TEXT,
            "pagePath" TEXT,
            "consentText" TEXT,
            "consentAt" TIMESTAMPTZ,
            status TEXT NOT NULL DEFAULT 'nueva',
            note TEXT,
            "handledByName" TEXT,
            "handledAt" TIMESTAMPTZ,
            "notifiedAt" TIMESTAMPTZ,
            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS "PlatformSiteLead_site_idx" ON "PlatformSiteLead" ("siteId", "createdAt" DESC)`);
    await db.query(`
        CREATE TABLE IF NOT EXISTS "PlatformSiteDaily" (
            "siteId" TEXT NOT NULL,
            day DATE NOT NULL,
            path TEXT NOT NULL,
            views INTEGER NOT NULL DEFAULT 0,
            visitors INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY ("siteId", day, path)
        )
    `);
    _ready = true;
}

export default ensurePlatformSiteSchema;
