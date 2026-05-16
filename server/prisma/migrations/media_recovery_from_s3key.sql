-- ============================================================
-- MIGRACIÓN: Media Library — Recovery backfill desde s3Key
-- Fecha: 2026-05-16
-- Versión: v4.341
-- ============================================================
-- Problema: la migración inicial de v4.339 solo asignaba sourceType='club'
-- a las imágenes con clubId NOT NULL. Pero muchas imágenes históricas
-- tienen clubId=NULL aunque s3Key sí incluye el clubId en el path
-- ("clubs/<uuid>/images/..."). Resultado: los clubs aparecían con 0
-- imágenes aunque tenían contenido.
--
-- Este script recupera la asociación leyendo el segundo segmento del
-- s3Key cuando matchea un club real. Aditivo e idempotente.
-- ============================================================

-- 1. Recovery: extraer clubId desde s3Key cuando el path matchea un club real
UPDATE "Media" m
SET
    "sourceType"  = 'club',
    "sourceId"    = SPLIT_PART(m."s3Key", '/', 2),
    "clubId"      = SPLIT_PART(m."s3Key", '/', 2),
    "sourceLabel" = c."name"
FROM "Club" c
WHERE c."id" = SPLIT_PART(m."s3Key", '/', 2)
  AND m."sourceType" = 'platform'
  AND m."s3Key" LIKE 'clubs/%/%'
  AND SPLIT_PART(m."s3Key", '/', 2) NOT IN ('global', '');

-- 2. Diagnostic helper — count Media per club after the backfill (read-only,
-- just for verification — feel free to skip when running)
-- SELECT c."name", COUNT(m."id") AS images
-- FROM "Club" c
-- LEFT JOIN "Media" m ON m."sourceType" = 'club' AND m."sourceId" = c."id"
-- GROUP BY c."name"
-- ORDER BY images DESC LIMIT 20;
