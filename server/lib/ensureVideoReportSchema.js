// ════════════════════════════════════════════════════════════════════
// Video Informe IA — Esquema Runtime (PostgreSQL)
// v4.1100.0
//
// Crea de forma perezosa e idempotente las tablas del nuevo módulo
// "Video Informe IA":
//   - VideoReportProject: proyecto maestro con contexto editorial, brief y hechos
//   - VideoReportVersion: versiones editables (v1, v2, vFinal) sin pisar el trabajo
//   - VideoReportScene: escenas individuales con locución, motion y fuentes
//   - VideoReportRender: renders asíncronos derivados (MP4 por formato/resolución)
//
// Regla durable (CLAUDE.md): Fuera de Prisma para no arriesgar migraciones
// automáticas destructivas. Protegido en db-push-guard.mjs.
// ════════════════════════════════════════════════════════════════════

import db from './db.js';

let _ready = false;

const EXPECTED_TABLES = [
    'VideoReportProject',
    'VideoReportVersion',
    'VideoReportScene',
    'VideoReportRender'
];

export async function ensureVideoReportSchema() {
    if (_ready) return;

    try {
        const { rows } = await db.query(
            `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename = ANY($1)`,
            [EXPECTED_TABLES]
        );
        if (rows.length === EXPECTED_TABLES.length) {
            _ready = true;
            return;
        }
    } catch {
        /* Si falla la lectura del catálogo, ejecutamos las sentencias DDL directamente */
    }

    // 1. Proyecto maestro
    await db.query(`
        CREATE TABLE IF NOT EXISTS "VideoReportProject" (
            id TEXT PRIMARY KEY,
            "campaignId" TEXT NOT NULL,
            "clubId" TEXT,
            "tenantId" TEXT,
            "districtId" TEXT,
            title TEXT NOT NULL,
            objective TEXT NOT NULL DEFAULT 'informe_final',
            audience TEXT NOT NULL DEFAULT 'publico_general',
            format TEXT NOT NULL DEFAULT '16:9',
            "targetDurationSec" INT NOT NULL DEFAULT 120,
            tone TEXT NOT NULL DEFAULT 'institucional',
            "productionMode" TEXT NOT NULL DEFAULT 'equilibrado',
            "editorialContext" TEXT,
            "factualSnapshot" JSONB NOT NULL DEFAULT '{}'::jsonb,
            config JSONB NOT NULL DEFAULT '{}'::jsonb,
            status TEXT NOT NULL DEFAULT 'draft',
            "createdBy" TEXT,
            "createdByName" TEXT,
            "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS "idx_video_report_project_campaign" ON "VideoReportProject"("campaignId");
        CREATE INDEX IF NOT EXISTS "idx_video_report_project_club" ON "VideoReportProject"("clubId");
        CREATE INDEX IF NOT EXISTS "idx_video_report_project_status" ON "VideoReportProject"(status);
    `);

    // 2. Versiones del proyecto (Separación de versiones para no sobrescribir)
    await db.query(`
        CREATE TABLE IF NOT EXISTS "VideoReportVersion" (
            id TEXT PRIMARY KEY,
            "projectId" TEXT NOT NULL REFERENCES "VideoReportProject"(id) ON DELETE CASCADE,
            "versionNumber" INT NOT NULL DEFAULT 1,
            label TEXT NOT NULL DEFAULT 'Versión 1',
            script JSONB NOT NULL DEFAULT '{}'::jsonb,
            "voiceConfig" JSONB NOT NULL DEFAULT '{"provider":"elevenlabs","voice":"es_latam","speed":1.0}'::jsonb,
            "musicConfig" JSONB NOT NULL DEFAULT '{"style":"institucional","volume":0.20,"ducking":true}'::jsonb,
            "outroConfig" JSONB NOT NULL DEFAULT '{}'::jsonb,
            "subtitlesConfig" JSONB NOT NULL DEFAULT '{"enabled":true,"style":"institucional"}'::jsonb,
            "isCurrent" BOOLEAN NOT NULL DEFAULT true,
            "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS "idx_video_report_version_project" ON "VideoReportVersion"("projectId");
    `);

    // 3. Escenas de la versión
    await db.query(`
        CREATE TABLE IF NOT EXISTS "VideoReportScene" (
            id TEXT PRIMARY KEY,
            "versionId" TEXT NOT NULL REFERENCES "VideoReportVersion"(id) ON DELETE CASCADE,
            "projectId" TEXT NOT NULL,
            "sortOrder" INT NOT NULL DEFAULT 0,
            chapter TEXT NOT NULL DEFAULT 'Apertura',
            "sceneType" TEXT NOT NULL DEFAULT 'image',
            "durationSec" FLOAT NOT NULL DEFAULT 6.0,
            "narrationText" TEXT NOT NULL DEFAULT '',
            "voiceAudioUrl" TEXT,
            "voiceAudioDurationSec" FLOAT,
            "onScreenTitle" TEXT,
            "onScreenSubtitle" TEXT,
            "onScreenDataValue" TEXT,
            "onScreenDataLabel" TEXT,
            "mediaUrl" TEXT,
            "mediaId" TEXT,
            "thumbUrl" TEXT,
            "motionType" TEXT NOT NULL DEFAULT 'ken_burns',
            "engineMode" TEXT NOT NULL DEFAULT 'motion',
            "aiTaskId" TEXT,
            "aiVideoUrl" TEXT,
            "creditsEstimated" INT NOT NULL DEFAULT 0,
            "creditsUsed" INT NOT NULL DEFAULT 0,
            "factSource" JSONB,
            config JSONB NOT NULL DEFAULT '{}'::jsonb,
            "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS "idx_video_report_scene_version" ON "VideoReportScene"("versionId", "sortOrder");
    `);

    // 4. Renders y salidas de video
    await db.query(`
        CREATE TABLE IF NOT EXISTS "VideoReportRender" (
            id TEXT PRIMARY KEY,
            "versionId" TEXT NOT NULL REFERENCES "VideoReportVersion"(id) ON DELETE CASCADE,
            "projectId" TEXT NOT NULL,
            "clubId" TEXT,
            format TEXT NOT NULL DEFAULT '16:9',
            resolution TEXT NOT NULL DEFAULT '1080p',
            status TEXT NOT NULL DEFAULT 'queued',
            progress INT NOT NULL DEFAULT 0,
            "statusNote" TEXT,
            "videoUrl" TEXT,
            "s3Key" TEXT,
            "thumbUrl" TEXT,
            "durationSec" FLOAT,
            bytes INT,
            "creditsUsed" INT NOT NULL DEFAULT 0,
            "renderPlan" JSONB,
            error TEXT,
            "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            "completedAt" TIMESTAMP WITH TIME ZONE
        );

        CREATE INDEX IF NOT EXISTS "idx_video_report_render_version" ON "VideoReportRender"("versionId");
        CREATE INDEX IF NOT EXISTS "idx_video_report_render_status" ON "VideoReportRender"(status);
    `);

    _ready = true;
    console.log('[VIDEO REPORT] ensureVideoReportSchema inicializado con éxito');
}

export default ensureVideoReportSchema;
