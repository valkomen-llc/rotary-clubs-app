// ════════════════════════════════════════════════════════════════════════════
// Curaduría Visual Inteligente — Esquema de Base de Datos en Runtime (v4.1210.0)
//
// Crea y asegura las 5 tablas del motor de curaduría, recomendaciones, bloqueos,
// historial de versiones y trazabilidad de publicaciones.
// ════════════════════════════════════════════════════════════════════════════

import db from './db.js';

let _schemaReady = false;

export const CURATION_TABLES = [
    'SiteImageCurationConfig',
    'SiteImageCandidate',
    'SiteImageRecommendation',
    'SiteImageLock',
    'SiteImageHistory',
];

export async function ensureVisualCurationSchema() {
    if (_schemaReady) return;

    try {
        const { rows } = await db.query(`
            SELECT to_regclass('public."SiteImageCurationConfig"') IS NOT NULL AS c1,
                   to_regclass('public."SiteImageCandidate"') IS NOT NULL AS c2,
                   to_regclass('public."SiteImageRecommendation"') IS NOT NULL AS c3,
                   to_regclass('public."SiteImageLock"') IS NOT NULL AS c4,
                   to_regclass('public."SiteImageHistory"') IS NOT NULL AS c5
        `);

        if (rows[0]?.c1 && rows[0]?.c2 && rows[0]?.c3 && rows[0]?.c4 && rows[0]?.c5) {
            _schemaReady = true;
            return;
        }

        // 1. Configuración de curaduría por tenant
        await db.query(`
            CREATE TABLE IF NOT EXISTS "SiteImageCurationConfig" (
                "clubId" TEXT PRIMARY KEY,
                enabled BOOLEAN NOT NULL DEFAULT FALSE,
                mode TEXT NOT NULL DEFAULT 'recommendation',
                "intervalDays" INTEGER NOT NULL DEFAULT 15,
                "targetContainers" JSONB NOT NULL DEFAULT '["hero", "foundation", "join"]'::jsonb,
                weights JSONB NOT NULL DEFAULT '{"institutional":0.3,"technical":0.2,"composition":0.2,"containerFit":0.2,"narrative":0.1}'::jsonb,
                "lastRunAt" TIMESTAMPTZ,
                "nextRunAt" TIMESTAMPTZ,
                "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
        `);

        // 2. Fotografías candidatas analizadas (caché incremental)
        await db.query(`
            CREATE TABLE IF NOT EXISTS "SiteImageCandidate" (
                id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
                "clubId" TEXT NOT NULL,
                "submissionId" TEXT,
                "fileId" TEXT,
                "s3Key" TEXT,
                url TEXT NOT NULL,
                filename TEXT,
                title TEXT,
                club TEXT,
                "activityDate" TEXT,
                "technicalMetrics" JSONB NOT NULL DEFAULT '{}'::jsonb,
                "semanticAnalysis" JSONB NOT NULL DEFAULT '{}'::jsonb,
                "consentVerified" BOOLEAN NOT NULL DEFAULT TRUE,
                "involvesMinors" BOOLEAN NOT NULL DEFAULT FALSE,
                "parentalConsentVerified" BOOLEAN NOT NULL DEFAULT FALSE,
                hash TEXT,
                "analyzedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS "SiteImageCandidate_clubId_idx" ON "SiteImageCandidate" ("clubId");
            CREATE INDEX IF NOT EXISTS "SiteImageCandidate_submissionId_idx" ON "SiteImageCandidate" ("submissionId");
            CREATE INDEX IF NOT EXISTS "SiteImageCandidate_url_idx" ON "SiteImageCandidate" (url);
        `);

        // 3. Recomendaciones editoriales generadas por la IA
        await db.query(`
            CREATE TABLE IF NOT EXISTS "SiteImageRecommendation" (
                id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
                "clubId" TEXT NOT NULL,
                "candidateId" TEXT REFERENCES "SiteImageCandidate"(id) ON DELETE CASCADE,
                "containerKey" TEXT NOT NULL,
                "slotIndex" INTEGER NOT NULL DEFAULT 0,
                score INTEGER NOT NULL DEFAULT 0,
                breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
                reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
                facts JSONB NOT NULL DEFAULT '[]'::jsonb,
                interpretation TEXT,
                "cropSuggested" JSONB NOT NULL DEFAULT '{}'::jsonb,
                status TEXT NOT NULL DEFAULT 'pending',
                "rejectionReason" TEXT,
                "approvedBy" TEXT,
                "approvedAt" TIMESTAMPTZ,
                "publishedAt" TIMESTAMPTZ,
                "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS "SiteImageRecommendation_club_container_idx" ON "SiteImageRecommendation" ("clubId", "containerKey", "slotIndex");
            CREATE INDEX IF NOT EXISTS "SiteImageRecommendation_status_idx" ON "SiteImageRecommendation" (status);
        `);

        // 4. Bloqueo de slots (para evitar rotación automática de imágenes manuales fijas)
        await db.query(`
            CREATE TABLE IF NOT EXISTS "SiteImageLock" (
                id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
                "clubId" TEXT NOT NULL,
                "containerKey" TEXT NOT NULL,
                "slotIndex" INTEGER NOT NULL DEFAULT 0,
                "lockedBy" TEXT,
                reason TEXT,
                "lockedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                CONSTRAINT "SiteImageLock_slot_unique" UNIQUE ("clubId", "containerKey", "slotIndex")
            );
        `);

        // 5. Historial, auditoría y trazabilidad con soporte de rollback
        await db.query(`
            CREATE TABLE IF NOT EXISTS "SiteImageHistory" (
                id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
                "clubId" TEXT NOT NULL,
                "containerKey" TEXT NOT NULL,
                "slotIndex" INTEGER NOT NULL DEFAULT 0,
                "previousUrl" TEXT,
                "newUrl" TEXT NOT NULL,
                "candidateId" TEXT,
                "submissionId" TEXT,
                "clubName" TEXT,
                action TEXT NOT NULL,
                reason TEXT,
                "actorId" TEXT,
                "actorName" TEXT,
                "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS "SiteImageHistory_club_idx" ON "SiteImageHistory" ("clubId", "createdAt" DESC);
        `);

        // Habilitar por defecto para el Distrito 4281 (flagship pilot)
        const d4281Id = '8aa470c5-0a5a-4a8d-b872-38645b8b9f3a';
        await db.query(`
            INSERT INTO "SiteImageCurationConfig" ("clubId", enabled, mode, "intervalDays", "targetContainers")
            VALUES ($1, TRUE, 'recommendation', 15, '["hero", "foundation", "join"]'::jsonb)
            ON CONFLICT ("clubId") DO NOTHING
        `, [d4281Id]).catch(() => {});

        _schemaReady = true;
    } catch (err) {
        console.error('[visual-curation] Error asegurando esquema:', err);
        throw err;
    }
}
