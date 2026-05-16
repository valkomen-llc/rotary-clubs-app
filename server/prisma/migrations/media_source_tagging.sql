-- ============================================================
-- MIGRACIÓN: Media Library Source Tagging — v4.339
-- Fecha: 2026-05-16
-- ============================================================
-- Cambios:
--   1. Media: nuevos campos sourceType, sourceId, sourceLabel
--   2. Backfill automático de filas existentes:
--      - Si clubId existe → sourceType='club', sourceId=clubId,
--        sourceLabel=club.name
--      - Si no → sourceType='platform' (assets globales)
--   3. Índices para filtrado eficiente
--
-- Aditiva e idempotente. Compatible con filas existentes.
-- ============================================================

ALTER TABLE "Media" ADD COLUMN IF NOT EXISTS "sourceType"  TEXT DEFAULT 'platform';
ALTER TABLE "Media" ADD COLUMN IF NOT EXISTS "sourceId"    TEXT;
ALTER TABLE "Media" ADD COLUMN IF NOT EXISTS "sourceLabel" TEXT;

-- Backfill: media con clubId conocido → owner es el club
UPDATE "Media" m
SET
    "sourceType"  = 'club',
    "sourceId"    = m."clubId",
    "sourceLabel" = c."name"
FROM "Club" c
WHERE m."clubId" = c."id"
  AND m."sourceType" IS NULL
  AND m."clubId" IS NOT NULL;

-- Backfill: media sin clubId → platform (assets globales del SaaS)
UPDATE "Media"
SET "sourceType" = 'platform'
WHERE "sourceType" IS NULL
  AND "clubId" IS NULL;

-- Catch-all: cualquier residual queda como platform para no dejar nulls
UPDATE "Media" SET "sourceType" = 'platform' WHERE "sourceType" IS NULL;

CREATE INDEX IF NOT EXISTS "Media_sourceType_sourceId_idx"
    ON "Media" ("sourceType", "sourceId");

CREATE INDEX IF NOT EXISTS "Media_clubId_idx"
    ON "Media" ("clubId");
