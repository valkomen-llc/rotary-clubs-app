// Crea en runtime, de forma perezosa e idempotente, la tabla del módulo
// "Generador de Outros IA".
//
// POR QUÉ: tras el incidente del 2026-07-13 el build ya NO ejecuta
// `prisma db push` (regla durable, ver CLAUDE.md). Por eso las tablas nuevas no
// se crean solas en producción. Mismo patrón que BannerTemplate, las
// ProjectFair* y las de Capacitaciones: CREATE TABLE IF NOT EXISTS +
// ALTER ... ADD COLUMN IF NOT EXISTS. Nunca DROP, nunca TRUNCATE.
//
// Al no estar en schema.prisma, `OutroProject` es una de las tablas que protege
// scripts/db-push-guard.mjs: un `npm run db:push` avisa antes de borrarla.
import db from './db.js';

let _ready = false;

export async function ensureOutroSchema() {
    if (_ready) return;
    await db.query(`
        CREATE TABLE IF NOT EXISTS "OutroProject" (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            "clubId" TEXT,
            "userId" TEXT,
            "userEmail" TEXT,
            "organizationName" TEXT,

            -- Origen visual
            "sourceImageUrl" TEXT NOT NULL,
            "sourceMediaId" TEXT,
            "sourceReport" JSONB,

            -- Configuración pedida por el usuario
            style TEXT NOT NULL DEFAULT 'institucional',
            format TEXT NOT NULL DEFAULT '9:16',
            "speechText" TEXT,
            "speechUsed" TEXT,
            voice JSONB NOT NULL DEFAULT '{}'::jsonb,
            config JSONB NOT NULL DEFAULT '{}'::jsonb,

            -- Motor
            engine TEXT NOT NULL DEFAULT 'kling',
            "engineModel" TEXT,
            prompt TEXT,
            "kieJobId" TEXT,
            "kieRaw" JSONB,

            -- Ciclo de vida
            status TEXT NOT NULL DEFAULT 'pending',
            "statusDetail" TEXT,
            attempts INTEGER NOT NULL DEFAULT 0,

            -- Resultado
            "videoUrl" TEXT,
            "s3Key" TEXT,
            "providerUrl" TEXT,
            "durationSec" DOUBLE PRECISION,
            width INTEGER,
            height INTEGER,
            "bitrateKbps" INTEGER,
            "sizeBytes" BIGINT,
            "hasAudio" BOOLEAN,
            quality JSONB,

            -- Trazabilidad
            "creditsEstimated" INTEGER NOT NULL DEFAULT 0,
            "mediaId" TEXT,
            "parentId" TEXT,
            version TEXT,
            "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS "OutroProject_clubId_idx" ON "OutroProject"("clubId");
        CREATE INDEX IF NOT EXISTS "OutroProject_status_idx" ON "OutroProject"(status);
        CREATE INDEX IF NOT EXISTS "OutroProject_kieJobId_idx" ON "OutroProject"("kieJobId");
        CREATE INDEX IF NOT EXISTS "OutroProject_createdAt_idx" ON "OutroProject"("createdAt" DESC);
    `);
    _ready = true;
}
