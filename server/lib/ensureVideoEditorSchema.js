// ════════════════════════════════════════════════════════════════════════════
// Esquema del Editor de Video Profesional — v4.1141.0
//
// Crea en runtime, de forma perezosa e idempotente, la tabla del módulo
// "Editor de Video" dentro de Estudio de Contenido.
//
// Sigue la regla durable del repositorio: CREATE TABLE IF NOT EXISTS +
// ALTER ... ADD COLUMN IF NOT EXISTS. Nunca DROP, nunca TRUNCATE.
// Almacena proyectos de video multipista, clips, subtítulos IA, transcripciones,
// traducciones y estado de renderizado asíncrono.
// ════════════════════════════════════════════════════════════════════════════

import db from './db.js';

let _ready = false;

export async function ensureVideoEditorSchema() {
    if (_ready) return;
    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS "VideoEditorProject" (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                "clubId" TEXT,
                "userId" TEXT,
                "userEmail" TEXT,
                "organizationName" TEXT,

                -- Configuración del proyecto
                format TEXT NOT NULL DEFAULT '16:9',
                resolution TEXT NOT NULL DEFAULT '1080p',
                duration DOUBLE PRECISION NOT NULL DEFAULT 0,
                fps INTEGER NOT NULL DEFAULT 30,

                -- Estructura de la línea de tiempo multipista
                tracks JSONB NOT NULL DEFAULT '[]'::jsonb,
                clips JSONB NOT NULL DEFAULT '[]'::jsonb,
                subtitles JSONB NOT NULL DEFAULT '{}'::jsonb,
                transcript JSONB NOT NULL DEFAULT '{}'::jsonb,
                transitions JSONB NOT NULL DEFAULT '[]'::jsonb,
                config JSONB NOT NULL DEFAULT '{}'::jsonb,

                -- Ciclo de vida y estados
                status TEXT NOT NULL DEFAULT 'draft',
                "renderStatus" TEXT NOT NULL DEFAULT 'idle',
                "renderProgress" INTEGER NOT NULL DEFAULT 0,
                "renderStage" TEXT,
                "errorDetail" TEXT,

                -- Resultado del render y exportación
                "videoUrl" TEXT,
                "s3Key" TEXT,
                "thumbUrl" TEXT,
                width INTEGER,
                height INTEGER,
                "sizeBytes" BIGINT,

                "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );

            -- Columnas aditivas para retrocompatibilidad absoluta
            ALTER TABLE "VideoEditorProject" ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT 'Proyecto sin título';
            ALTER TABLE "VideoEditorProject" ADD COLUMN IF NOT EXISTS "clubId" TEXT;
            ALTER TABLE "VideoEditorProject" ADD COLUMN IF NOT EXISTS "userId" TEXT;
            ALTER TABLE "VideoEditorProject" ADD COLUMN IF NOT EXISTS "userEmail" TEXT;
            ALTER TABLE "VideoEditorProject" ADD COLUMN IF NOT EXISTS "organizationName" TEXT;
            ALTER TABLE "VideoEditorProject" ADD COLUMN IF NOT EXISTS format TEXT NOT NULL DEFAULT '16:9';
            ALTER TABLE "VideoEditorProject" ADD COLUMN IF NOT EXISTS resolution TEXT NOT NULL DEFAULT '1080p';
            ALTER TABLE "VideoEditorProject" ADD COLUMN IF NOT EXISTS duration DOUBLE PRECISION NOT NULL DEFAULT 0;
            ALTER TABLE "VideoEditorProject" ADD COLUMN IF NOT EXISTS fps INTEGER NOT NULL DEFAULT 30;
            ALTER TABLE "VideoEditorProject" ADD COLUMN IF NOT EXISTS tracks JSONB NOT NULL DEFAULT '[]'::jsonb;
            ALTER TABLE "VideoEditorProject" ADD COLUMN IF NOT EXISTS clips JSONB NOT NULL DEFAULT '[]'::jsonb;
            ALTER TABLE "VideoEditorProject" ADD COLUMN IF NOT EXISTS subtitles JSONB NOT NULL DEFAULT '{}'::jsonb;
            ALTER TABLE "VideoEditorProject" ADD COLUMN IF NOT EXISTS transcript JSONB NOT NULL DEFAULT '{}'::jsonb;
            ALTER TABLE "VideoEditorProject" ADD COLUMN IF NOT EXISTS transitions JSONB NOT NULL DEFAULT '[]'::jsonb;
            ALTER TABLE "VideoEditorProject" ADD COLUMN IF NOT EXISTS config JSONB NOT NULL DEFAULT '{}'::jsonb;
            ALTER TABLE "VideoEditorProject" ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'draft';
            ALTER TABLE "VideoEditorProject" ADD COLUMN IF NOT EXISTS "renderStatus" TEXT NOT NULL DEFAULT 'idle';
            ALTER TABLE "VideoEditorProject" ADD COLUMN IF NOT EXISTS "renderProgress" INTEGER NOT NULL DEFAULT 0;
            ALTER TABLE "VideoEditorProject" ADD COLUMN IF NOT EXISTS "renderStage" TEXT;
            ALTER TABLE "VideoEditorProject" ADD COLUMN IF NOT EXISTS "errorDetail" TEXT;
            ALTER TABLE "VideoEditorProject" ADD COLUMN IF NOT EXISTS "videoUrl" TEXT;
            ALTER TABLE "VideoEditorProject" ADD COLUMN IF NOT EXISTS "s3Key" TEXT;
            ALTER TABLE "VideoEditorProject" ADD COLUMN IF NOT EXISTS "thumbUrl" TEXT;
            ALTER TABLE "VideoEditorProject" ADD COLUMN IF NOT EXISTS width INTEGER;
            ALTER TABLE "VideoEditorProject" ADD COLUMN IF NOT EXISTS height INTEGER;
            ALTER TABLE "VideoEditorProject" ADD COLUMN IF NOT EXISTS "sizeBytes" BIGINT;
            ALTER TABLE "VideoEditorProject" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW();
            ALTER TABLE "VideoEditorProject" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW();

            -- Índices para búsquedas multi-tenant rápidas
            CREATE INDEX IF NOT EXISTS "VideoEditorProject_clubId_idx" ON "VideoEditorProject" ("clubId");
            CREATE INDEX IF NOT EXISTS "VideoEditorProject_userId_idx" ON "VideoEditorProject" ("userId");
            CREATE INDEX IF NOT EXISTS "VideoEditorProject_status_idx" ON "VideoEditorProject" (status);
            CREATE INDEX IF NOT EXISTS "VideoEditorProject_updatedAt_idx" ON "VideoEditorProject" ("updatedAt" DESC);
        `);
        _ready = true;
    } catch (err) {
        console.error('[VideoEditorSchema] Error initializing schema:', err);
        throw err;
    }
}
