-- ============================================================
-- MIGRACIÓN: SocialPublication — Library + Scheduling
-- Fecha: 2026-05-17
-- Versión: v4.345
-- ============================================================
-- Cambios:
--   1. SocialPublication.timezone (IANA tz para scheduling)
--   2. SocialPublication.aiModelImage (motor de imagen usado)
--   3. SocialPublication.aiModelCopy  (motor de copy usado)
--   4. Índice (status, scheduledFor) — usado por el cron worker para
--      encontrar publicaciones programadas próximas a publicarse.
--
-- Aditiva, idempotente.
-- ============================================================

ALTER TABLE "SocialPublication" ADD COLUMN IF NOT EXISTS "timezone"     TEXT;
ALTER TABLE "SocialPublication" ADD COLUMN IF NOT EXISTS "aiModelImage" TEXT;
ALTER TABLE "SocialPublication" ADD COLUMN IF NOT EXISTS "aiModelCopy"  TEXT;

CREATE INDEX IF NOT EXISTS "SocialPublication_status_scheduledFor_idx"
    ON "SocialPublication" ("status", "scheduledFor");
