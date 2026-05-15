-- ============================================================
-- MIGRACIÓN: Motor de Publicación Social — Fase 1
-- Fecha: 2026-05-16
-- Versión: v4.329
-- ============================================================
-- Cambios:
--   1. SocialAccount: nuevos campos para soportar Page tokens y IG Business
--      (pageId, permissions, metadata, lastVerifiedAt, tokenVersion) +
--      índices y unique constraint.
--   2. Nueva tabla SocialPublication: contenedor de las publicaciones que se
--      van a distribuir a redes sociales. Es la base para Phase 2 (publish
--      inmediato) y Phase 3 (scheduling).
--   3. Tabla join implícita `_SocialAccountToSocialPublication` para la
--      relación many-to-many entre cuentas y publicaciones (qué cuentas
--      reciben qué publicación).
--
-- Esta migración es ADITIVA — no rompe filas existentes. Las cuentas de
-- SocialAccount creadas con la implementación previa (que sólo guardaba el
-- token del usuario, no de la página) van a quedar con tokenVersion=0 y
-- platform="facebook"; el usuario tendrá que reconectarse para obtener los
-- tokens de Page y conectar Instagram.
--
-- IMPORTANTE: requiere que TOKEN_ENCRYPTION_KEY esté configurada en Vercel
-- antes de hacer cualquier nueva conexión social. Ver server/lib/tokenCrypto.js
-- para generar la key.
-- ============================================================

-- 1. Extender SocialAccount con los campos nuevos.
ALTER TABLE "SocialAccount" ADD COLUMN IF NOT EXISTS "pageId"          TEXT;
ALTER TABLE "SocialAccount" ADD COLUMN IF NOT EXISTS "permissions"     TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "SocialAccount" ADD COLUMN IF NOT EXISTS "metadata"        JSONB;
ALTER TABLE "SocialAccount" ADD COLUMN IF NOT EXISTS "lastVerifiedAt"  TIMESTAMP(3);
ALTER TABLE "SocialAccount" ADD COLUMN IF NOT EXISTS "tokenVersion"    INTEGER NOT NULL DEFAULT 0;

-- Unique: no duplicar la misma cuenta de la misma plataforma para el mismo
-- club. Se hace en dos pasos por si ya hay duplicados (los descartamos del
-- índice; reconnect los limpia).
DO $$ BEGIN
    CREATE UNIQUE INDEX "SocialAccount_clubId_platform_platformId_key"
        ON "SocialAccount" ("clubId", "platform", "platformId");
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
    CREATE INDEX "SocialAccount_clubId_status_idx"
        ON "SocialAccount" ("clubId", "status");
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

-- 2. Nueva tabla SocialPublication.
CREATE TABLE IF NOT EXISTS "SocialPublication" (
    "id"                TEXT NOT NULL,
    "clubId"            TEXT NOT NULL,
    "userId"            TEXT,
    "caption"           TEXT,
    "platformCopies"    JSONB,
    "imageUrl"          TEXT,
    "imageUrlLandscape" TEXT,
    "mediaType"         TEXT NOT NULL DEFAULT 'image',
    "videoProjectId"    TEXT,
    "targetAccounts"    JSONB NOT NULL,
    "status"            TEXT NOT NULL DEFAULT 'draft',
    "scheduledFor"      TIMESTAMP(3),
    "publishedAt"       TIMESTAMP(3),
    "sourceImageId"     TEXT,
    "generatedBy"       TEXT,
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"         TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialPublication_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
    ALTER TABLE "SocialPublication"
        ADD CONSTRAINT "SocialPublication_clubId_fkey"
        FOREIGN KEY ("clubId") REFERENCES "Club"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "SocialPublication"
        ADD CONSTRAINT "SocialPublication_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "SocialPublication_clubId_status_idx"
    ON "SocialPublication" ("clubId", "status");

CREATE INDEX IF NOT EXISTS "SocialPublication_scheduledFor_idx"
    ON "SocialPublication" ("scheduledFor");

-- 3. Join table para relación M2M SocialAccount ↔ SocialPublication.
CREATE TABLE IF NOT EXISTS "_SocialAccountToSocialPublication" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_SocialAccountToSocialPublication_AB_pkey" PRIMARY KEY ("A","B")
);

CREATE INDEX IF NOT EXISTS "_SocialAccountToSocialPublication_B_index"
    ON "_SocialAccountToSocialPublication" ("B");

DO $$ BEGIN
    ALTER TABLE "_SocialAccountToSocialPublication"
        ADD CONSTRAINT "_SocialAccountToSocialPublication_A_fkey"
        FOREIGN KEY ("A") REFERENCES "SocialAccount"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "_SocialAccountToSocialPublication"
        ADD CONSTRAINT "_SocialAccountToSocialPublication_B_fkey"
        FOREIGN KEY ("B") REFERENCES "SocialPublication"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
