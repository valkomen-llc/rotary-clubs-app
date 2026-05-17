-- ============================================================
-- MIGRACIÓN: Club.category — Sub-tipos institucionales
-- Fecha: 2026-05-16
-- Versión: v4.342
-- ============================================================
-- Agrega columna `category` a Club. Default 'club'. Sub-tipos:
--
--   club              Club Rotario tradicional (default)
--   association       Asociación (ej: COLROTARIOS)
--   exchange_program  Programa de intercambio (ej: RYE4281)
--   event             Evento puntual
--   conference        Conferencia
--   project_fair      Feria de proyectos
--   foundation        Fundación
--
-- Auto-detección desde el name por patrones conocidos. Resto queda 'club'.
-- El admin puede ajustar manualmente vía SQL si la heurística falla.
--
-- Aditivo e idempotente. No afecta clubs ya correctamente categorizados.
-- ============================================================

-- 1. Columna nueva
ALTER TABLE "Club" ADD COLUMN IF NOT EXISTS "category" TEXT NOT NULL DEFAULT 'club';

-- 2. Auto-detección por nombre. Cada UPDATE solo toca filas que siguen como
--    'club' (default), así que es seguro correr múltiples veces.

-- Asociaciones: COLROTARIOS y cualquier nombre que empiece por "Asociación"
UPDATE "Club"
SET "category" = 'association'
WHERE "category" = 'club'
  AND (
       UPPER("name") LIKE 'COLROTARIOS%'
    OR UPPER("name") LIKE 'ASOCIAC%'
    OR UPPER("name") LIKE 'ASSOC%'
  );

-- Programas de intercambio: RYE*, Rotary Youth Exchange, Intercambio
UPDATE "Club"
SET "category" = 'exchange_program'
WHERE "category" = 'club'
  AND (
       UPPER("name") LIKE 'RYE%'
    OR UPPER("name") LIKE '%YOUTH EXCHANGE%'
    OR UPPER("name") LIKE '%INTERCAMBIO%'
  );

-- Conferencias
UPDATE "Club"
SET "category" = 'conference'
WHERE "category" = 'club'
  AND (
       UPPER("name") LIKE '%CONFERENCE%'
    OR UPPER("name") LIKE '%CONFERENCIA%'
  );

-- Ferias de proyectos
UPDATE "Club"
SET "category" = 'project_fair'
WHERE "category" = 'club'
  AND (
       UPPER("name") LIKE '%FERIA%'
    OR UPPER("name") LIKE '%PROJECT FAIR%'
  );

-- Eventos puntuales (heurística amplia, ajustar a mano si hace falta)
UPDATE "Club"
SET "category" = 'event'
WHERE "category" = 'club'
  AND (
       UPPER("name") LIKE '%EVENT%'
    OR UPPER("name") LIKE '%EVENTO%'
  );

-- Fundaciones
UPDATE "Club"
SET "category" = 'foundation'
WHERE "category" = 'club'
  AND (
       UPPER("name") LIKE '%FOUNDATION%'
    OR UPPER("name") LIKE '%FUNDACI%'
  );

CREATE INDEX IF NOT EXISTS "Club_category_idx" ON "Club" ("category");
