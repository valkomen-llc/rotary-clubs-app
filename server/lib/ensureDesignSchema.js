// Crea en runtime, de forma perezosa e idempotente, la tabla del módulo
// "Plantillas IA".
//
// POR QUÉ: tras el incidente del 2026-07-13 el build ya NO ejecuta
// `prisma db push` (regla durable, ver CLAUDE.md). Por eso las tablas nuevas no
// se crean solas en producción. Mismo patrón que BannerTemplate, OutroProject y
// las ProjectFair*: CREATE TABLE IF NOT EXISTS + ADD COLUMN IF NOT EXISTS.
// Nunca DROP, nunca TRUNCATE.
//
// Al no estar en schema.prisma, `DesignProject` queda protegida por
// scripts/db-push-guard.mjs: un `npm run db:push` avisa antes de borrarla.
//
// La comprobación previa (una consulta al catálogo) es la regla de rendimiento
// de v4.659: estas sentencias son idempotentes pero no gratis, y las pagaba la
// primera visita tras un arranque en frío.
import db from './db.js';

let _ready = false;

export async function ensureDesignSchema() {
    if (_ready) return;

    const { rows } = await db.query(
        `SELECT to_regclass('public."DesignProject"') IS NOT NULL AS tabla,
                EXISTS (SELECT 1 FROM information_schema.columns
                         WHERE table_name = 'DesignProject' AND column_name = 'copy') AS copy_col`
    );
    if (rows[0]?.tabla && rows[0]?.copy_col) { _ready = true; return; }

    await db.query(`
        CREATE TABLE IF NOT EXISTS "DesignProject" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            title TEXT NOT NULL DEFAULT 'Diseño sin título',

            -- Quién lo hizo y para quién. "clubId" es el sitio que EDITA;
            -- "subjectClubId" es el club al que se felicita. No son lo mismo:
            -- el Distrito genera piezas para sus clubes.
            "clubId" TEXT,
            "subjectClubId" TEXT,
            "userId" TEXT,
            "userEmail" TEXT,

            "templateId" TEXT NOT NULL,
            category TEXT NOT NULL DEFAULT 'aniversario',
            format TEXT NOT NULL DEFAULT 'post_1_1',

            -- El documento completo del editor (grafo de escena) y las
            -- variables con las que se compiló. Se guarda ENTERO, como el grafo
            -- de un recorrido del CRM: se lee y se escribe siempre completo, y
            -- normalizarlo obligaría a migrar el esquema cada vez que aparezca
            -- un tipo de nodo nuevo.
            document JSONB NOT NULL DEFAULT '{}'::jsonb,
            variables JSONB NOT NULL DEFAULT '{}'::jsonb,
            branding JSONB NOT NULL DEFAULT '{}'::jsonb,

            -- Material de publicación (título, hashtags, CTA, alt). Distinto
            -- del mensaje IMPRESO, que vive dentro de `document`.
            copy JSONB NOT NULL DEFAULT '{}'::jsonb,

            -- Resultado exportado, cuando se guarda en la Biblioteca.
            "imageUrl" TEXT,
            "mediaId" TEXT,
            "thumbUrl" TEXT,

            status TEXT NOT NULL DEFAULT 'draft',
            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    `);

    // Aditivas: una instalación anterior a una columna nueva se completa sola.
    for (const col of [
        `ADD COLUMN IF NOT EXISTS copy JSONB NOT NULL DEFAULT '{}'::jsonb`,
        `ADD COLUMN IF NOT EXISTS "subjectClubId" TEXT`,
        `ADD COLUMN IF NOT EXISTS "thumbUrl" TEXT`,
        `ADD COLUMN IF NOT EXISTS "mediaId" TEXT`,
    ]) {
        await db.query(`ALTER TABLE "DesignProject" ${col};`).catch(() => {});
    }

    await db.query(`CREATE INDEX IF NOT EXISTS "DesignProject_club_idx" ON "DesignProject" ("clubId", "updatedAt" DESC);`);
    await db.query(`CREATE INDEX IF NOT EXISTS "DesignProject_subject_idx" ON "DesignProject" ("subjectClubId");`);

    _ready = true;
}

export default ensureDesignSchema;
