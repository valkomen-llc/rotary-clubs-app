-- ============================================================
-- MIGRACIÓN: SocialPublication.imageUrlInstagram
-- Fecha: 2026-05-18
-- Versión: v4.381
-- ============================================================
-- Agrega el slot para la imagen formato Instagram (2:3, 1080×1620),
-- separada de imageUrl (4:5 para FB/LinkedIn) y de imageUrlLandscape
-- (3:2 para X).
--
-- Aditiva, idempotente. Filas existentes quedan con imageUrlInstagram=NULL;
-- el frontend hace fallback a imageUrl si la version IG no existe.
-- ============================================================

ALTER TABLE "SocialPublication" ADD COLUMN IF NOT EXISTS "imageUrlInstagram" TEXT;
