// ════════════════════════════════════════════════════════════════════════════
// Crea en runtime, de forma perezosa e idempotente, las tablas del módulo de
// traducción. v4.661
//
// POR QUÉ EN RUNTIME: tras el incidente del 2026-07-13 el build ya NO ejecuta
// `prisma db push` (regla durable, ver CLAUDE.md), así que las tablas nuevas no
// se crean solas en producción. Mismo patrón que BannerTemplate, las
// ProjectFair*, OutroProject y las del registro de eventos:
// CREATE TABLE IF NOT EXISTS + ADD COLUMN IF NOT EXISTS. Nunca DROP, nunca
// TRUNCATE.
//
// Al no estar en schema.prisma, `Translation` y `TranslationEvent` quedan
// protegidas por scripts/db-push-guard.mjs, que compara la base contra el schema
// de forma dinámica: un `npm run db:push` avisa antes de borrarlas.
//
// La comprobación previa (v4.659) evita 20 viajes a la base en cada arranque en
// frío. OJO: la lista de objetos NO es un número de versión — enumera lo que
// este archivo crea de verdad, y hay que ampliarla al agregar uno nuevo o la
// comprobación lo dará por presente.
import db from './db.js';

let _ready = false;

const TABLES = ['Translation', 'TranslationEvent'];
const COLUMNS = [
    ['Translation', 'kind'],
    ['Translation', 'version'],
    ['Translation', 'approvedBy'],
    ['Translation', 'lastUsedAt'],
    ['Translation', 'useCount'],
    ['Translation', 'sourceLang'],
    ['TranslationEvent', 'durationMs'],
];

async function alreadyDone() {
    try {
        const [t, c] = await Promise.all([
            db.query(
                `SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename = ANY($1)`,
                [TABLES],
            ),
            db.query(
                `SELECT table_name, column_name FROM information_schema.columns
                  WHERE table_schema='public' AND table_name = ANY($1)`,
                [TABLES],
            ),
        ]);
        if (t.rows.length < TABLES.length) return false;
        const have = new Set(c.rows.map(r => `${r.table_name}.${r.column_name}`));
        return COLUMNS.every(([tbl, col]) => have.has(`${tbl}.${col}`));
    } catch {
        return false; // ante la duda, ejecutar: todo es idempotente
    }
}

export async function ensureTranslationSchema() {
    if (_ready) return;
    if (await alreadyDone()) { _ready = true; return; }

    // ── La caché de traducciones ──────────────────────────────────────────
    // La llave es (sourceHash, targetLang). `sourceHash` es SHA-256 del texto
    // ORIGINAL COMPLETO, no de un recorte: hasta v4.660 la clave era el texto
    // truncado a 120 caracteres, así que dos textos con el mismo comienzo —dos
    // párrafos de un mismo evento, por ejemplo— compartían fila y el segundo se
    // mostraba con la traducción del primero.
    //
    // Que la llave sea el hash del contenido es además lo que da la
    // INVALIDACIÓN gratis: si el administrador edita el texto original, su hash
    // cambia, no encuentra fila y se traduce de nuevo. La fila vieja queda
    // huérfana y el panel la puede purgar por `lastUsedAt`.
    await db.query(`
        CREATE TABLE IF NOT EXISTS "Translation" (
            id            TEXT PRIMARY KEY,
            "sourceHash"  TEXT NOT NULL,
            "sourceText"  TEXT NOT NULL,
            "sourceLang"  TEXT NOT NULL DEFAULT 'es',
            "targetLang"  TEXT NOT NULL,
            value         TEXT NOT NULL,

            -- 'auto' | 'manual' | 'approved' | 'failed'  (translationSpec.STATUSES)
            -- 'manual' y 'approved' NO los pisa el proveedor.
            status        TEXT NOT NULL DEFAULT 'auto',
            -- 'system' | 'managed' | 'opaque'
            kind          TEXT NOT NULL DEFAULT 'managed',
            provider      TEXT,

            -- Sube en cada reescritura del valor. Sirve para la auditoría:
            -- version 3 = a este texto se le corrigió la traducción dos veces.
            version       INTEGER NOT NULL DEFAULT 1,

            "approvedBy"  TEXT,
            "approvedAt"  TIMESTAMPTZ,

            -- Para purgar lo que ya nadie pide sin tocar lo vivo.
            "lastUsedAt"  TIMESTAMPTZ DEFAULT NOW(),
            "useCount"    INTEGER NOT NULL DEFAULT 0,

            "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);

    // Columnas nuevas sobre una tabla que ya exista de un despliegue anterior.
    for (const [col, ddl] of [
        ['kind', `ALTER TABLE "Translation" ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'managed'`],
        ['version', `ALTER TABLE "Translation" ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1`],
        ['approvedBy', `ALTER TABLE "Translation" ADD COLUMN IF NOT EXISTS "approvedBy" TEXT`],
        ['approvedAt', `ALTER TABLE "Translation" ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMPTZ`],
        ['lastUsedAt', `ALTER TABLE "Translation" ADD COLUMN IF NOT EXISTS "lastUsedAt" TIMESTAMPTZ DEFAULT NOW()`],
        ['useCount', `ALTER TABLE "Translation" ADD COLUMN IF NOT EXISTS "useCount" INTEGER NOT NULL DEFAULT 0`],
        ['sourceLang', `ALTER TABLE "Translation" ADD COLUMN IF NOT EXISTS "sourceLang" TEXT NOT NULL DEFAULT 'es'`],
        ['provider', `ALTER TABLE "Translation" ADD COLUMN IF NOT EXISTS provider TEXT`],
    ]) {
        await db.query(ddl).catch(e => {
            console.error(`[translation-schema] columna ${col}:`, e.message);
        });
    }

    await db.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS "Translation_key_idx"
            ON "Translation" ("sourceHash", "targetLang")
    `);
    // El panel lista por idioma y estado; la purga ordena por antigüedad de uso.
    await db.query(`
        CREATE INDEX IF NOT EXISTS "Translation_lang_status_idx"
            ON "Translation" ("targetLang", status)
    `);
    await db.query(`
        CREATE INDEX IF NOT EXISTS "Translation_lastused_idx"
            ON "Translation" ("lastUsedAt")
    `);

    // ── La auditoría ──────────────────────────────────────────────────────
    // Una fila por LLAMADA al proveedor (no por texto): qué idioma, qué
    // proveedor, cuántos textos y caracteres, cuánto tardó y si falló.
    // Es lo que alimenta las métricas y la lista de errores del panel.
    await db.query(`
        CREATE TABLE IF NOT EXISTS "TranslationEvent" (
            id            TEXT PRIMARY KEY,
            "sourceLang"  TEXT NOT NULL DEFAULT 'es',
            "targetLang"  TEXT NOT NULL,
            provider      TEXT,
            -- 'ok' | 'error' | 'edit' | 'approve' | 'purge'
            result        TEXT NOT NULL,
            error         TEXT,
            "textCount"   INTEGER NOT NULL DEFAULT 0,
            chars         INTEGER NOT NULL DEFAULT 0,
            "durationMs"  INTEGER,
            actor         TEXT,
            "sourceHash"  TEXT,
            page          TEXT,
            "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);
    await db.query(`ALTER TABLE "TranslationEvent" ADD COLUMN IF NOT EXISTS "durationMs" INTEGER`)
        .catch(() => { });
    await db.query(`
        CREATE INDEX IF NOT EXISTS "TranslationEvent_created_idx"
            ON "TranslationEvent" ("createdAt" DESC)
    `);
    await db.query(`
        CREATE INDEX IF NOT EXISTS "TranslationEvent_result_idx"
            ON "TranslationEvent" (result, "createdAt" DESC)
    `);

    _ready = true;
}

export default ensureTranslationSchema;
