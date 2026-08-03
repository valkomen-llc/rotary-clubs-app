// ════════════════════════════════════════════════════════════════════════════
// SEO Inteligente — ESQUEMA EN RUNTIME
//
// Crea las tablas del módulo de forma perezosa e idempotente, igual que
// `ensureTranslationSchema`, `ensureReelSchema` y las del registro de eventos.
//
// POR QUÉ EN RUNTIME Y NO EN PRISMA: tras el incidente del 2026-07-13 el build
// ya NO ejecuta `prisma db push` (regla durable, ver CLAUDE.md). Al no estar en
// `schema.prisma`, estas seis tablas quedan además protegidas por
// `scripts/db-push-guard.mjs`, que compara la base contra el schema y avisa
// antes de borrar nada. Nunca DROP, nunca TRUNCATE.
//
// La comprobación previa evita ~30 viajes a la base en cada arranque en frío.
// OJO: la lista de objetos NO es un número de versión — enumera lo que este
// archivo crea de verdad, y hay que ampliarla al agregar uno nuevo o la
// comprobación lo dará por presente.
// ════════════════════════════════════════════════════════════════════════════

import db from './db.js';

let _ready = false;

const TABLES = [
    'SeoSiteConfig', 'SeoPageMeta', 'SeoAudit', 'SeoIssue', 'SeoKeyword', 'SeoMetric',
];

const COLUMNS = [
    ['SeoSiteConfig', 'config'],
    ['SeoPageMeta', 'source'],
    ['SeoPageMeta', 'indexable'],
    ['SeoAudit', 'axisScores'],
    ['SeoAudit', 'healthScore'],
    ['SeoIssue', 'recommendation'],
    ['SeoIssue', 'status'],
    ['SeoKeyword', 'provenance'],
    ['SeoMetric', 'provenance'],
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

export async function ensureSeoSchema() {
    if (_ready) return;
    if (await alreadyDone()) { _ready = true; return; }

    // ── Configuración global del sitio ───────────────────────────────────────
    // Una fila por sitio. `config` es un documento JSON y no columnas sueltas
    // por el mismo motivo que el grafo de los recorridos del CRM: se lee y se
    // escribe siempre entero, y normalizarlo obligaría a migrar el esquema cada
    // vez que aparezca un ajuste nuevo, sin ganar ninguna consulta.
    await db.query(`
        CREATE TABLE IF NOT EXISTS "SeoSiteConfig" (
            "clubId"      TEXT PRIMARY KEY,
            "config"      JSONB NOT NULL DEFAULT '{}'::jsonb,
            "autoMode"    BOOLEAN NOT NULL DEFAULT true,
            "lastAuditAt" TIMESTAMPTZ,
            "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),
            "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    `);

    // ── Metadatos por página ─────────────────────────────────────────────────
    // La clave es (clubId, path) y no el id de la entidad, a propósito: hay
    // páginas fijas que no tienen fila en ninguna tabla (`/quienes-somos`) y
    // las hay dinámicas que sí. La dirección es lo único que TODAS tienen.
    //
    // `source` distingue lo que escribió una persona de lo que propuso la IA.
    // Es lo que permite la regla de abajo: una revisión automática JAMÁS pisa
    // una edición manual. Mismo criterio que las traducciones aprobadas.
    await db.query(`
        CREATE TABLE IF NOT EXISTS "SeoPageMeta" (
            "id"          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            "clubId"      TEXT NOT NULL,
            "path"        TEXT NOT NULL,
            "kind"        TEXT,
            "title"       TEXT,
            "description" TEXT,
            "image"       TEXT,
            "canonical"   TEXT,
            "keywords"    TEXT[] NOT NULL DEFAULT '{}',
            "indexable"   BOOLEAN,
            "priority"    NUMERIC(2,1),
            "changefreq"  TEXT,
            "schema"      JSONB,
            "source"      TEXT NOT NULL DEFAULT 'ai',
            "aiModel"     TEXT,
            "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),
            "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),
            UNIQUE ("clubId", "path")
        )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS "SeoPageMeta_club_idx" ON "SeoPageMeta" ("clubId")`);

    // ── Una pasada de auditoría ──────────────────────────────────────────────
    await db.query(`
        CREATE TABLE IF NOT EXISTS "SeoAudit" (
            "id"           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            "clubId"       TEXT NOT NULL,
            "status"       TEXT NOT NULL DEFAULT 'running',
            "trigger"      TEXT NOT NULL DEFAULT 'manual',
            "score"        INTEGER,
            "healthScore"  INTEGER,
            "axisScores"   JSONB NOT NULL DEFAULT '{}'::jsonb,
            "pagesScanned" INTEGER NOT NULL DEFAULT 0,
            "issuesCount"  INTEGER NOT NULL DEFAULT 0,
            "criticalCount" INTEGER NOT NULL DEFAULT 0,
            "summary"      JSONB NOT NULL DEFAULT '{}'::jsonb,
            "notes"        TEXT[] NOT NULL DEFAULT '{}',
            "error"        TEXT,
            "startedAt"    TIMESTAMPTZ NOT NULL DEFAULT now(),
            "finishedAt"   TIMESTAMPTZ
        )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS "SeoAudit_club_started_idx" ON "SeoAudit" ("clubId", "startedAt" DESC)`);

    // ── Hallazgos ────────────────────────────────────────────────────────────
    // El hallazgo Y su recomendación viven en la MISMA fila. Separarlos en dos
    // tablas daría dos verdades sobre el mismo problema y obligaría a
    // sincronizar el estado ("¿está resuelto el hallazgo o la recomendación?").
    // La IA no descubre el problema: lo REDACTA. Quien lo descubre es la
    // auditoría determinista.
    await db.query(`
        CREATE TABLE IF NOT EXISTS "SeoIssue" (
            "id"             TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            "auditId"        TEXT NOT NULL,
            "clubId"         TEXT NOT NULL,
            "path"           TEXT NOT NULL,
            "code"           TEXT NOT NULL,
            "axis"           TEXT NOT NULL,
            "severity"       TEXT NOT NULL,
            "impact"         INTEGER NOT NULL DEFAULT 0,
            "effort"         TEXT NOT NULL DEFAULT 'auto',
            "autoFixable"    BOOLEAN NOT NULL DEFAULT false,
            "evidence"       JSONB NOT NULL DEFAULT '{}'::jsonb,
            "recommendation" TEXT,
            "proposedValue"  JSONB,
            "status"         TEXT NOT NULL DEFAULT 'open',
            "resolvedAt"     TIMESTAMPTZ,
            "createdAt"      TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS "SeoIssue_audit_idx" ON "SeoIssue" ("auditId")`);
    await db.query(`CREATE INDEX IF NOT EXISTS "SeoIssue_club_status_idx" ON "SeoIssue" ("clubId", "status", "impact" DESC)`);

    // ── Palabras clave ───────────────────────────────────────────────────────
    // `provenance` es obligatorio y sin valor por defecto cómodo: obliga a
    // declarar de dónde salió cada número. Un volumen `estimated` es la opinión
    // de un modelo, no un dato de mercado, y el panel lo pinta distinto.
    await db.query(`
        CREATE TABLE IF NOT EXISTS "SeoKeyword" (
            "id"          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            "clubId"      TEXT NOT NULL,
            "keyword"     TEXT NOT NULL,
            "kind"        TEXT NOT NULL DEFAULT 'secondary',
            "intent"      TEXT,
            "volume"      INTEGER,
            "difficulty"  INTEGER,
            "competition" TEXT,
            "provenance"  TEXT NOT NULL DEFAULT 'estimated',
            "targetPath"  TEXT,
            "priority"    INTEGER NOT NULL DEFAULT 0,
            "position"    NUMERIC(5,1),
            "positionAt"  TIMESTAMPTZ,
            "notes"       TEXT,
            "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),
            "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),
            UNIQUE ("clubId", "keyword")
        )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS "SeoKeyword_club_idx" ON "SeoKeyword" ("clubId", "priority" DESC)`);

    // ── Histórico ────────────────────────────────────────────────────────────
    // Una fila por sitio, día, fuente y métrica. Es lo que sostiene el
    // comparativo mensual y las curvas del tablero.
    //
    // `path` forma parte de la clave y admite cadena vacía para las métricas del
    // sitio entero: en Postgres un NULL nunca es igual a otro NULL, así que con
    // `path` nulo el UNIQUE no impediría duplicados y cada barrido insertaría
    // otra fila del mismo día.
    await db.query(`
        CREATE TABLE IF NOT EXISTS "SeoMetric" (
            "id"         TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            "clubId"     TEXT NOT NULL,
            "date"       DATE NOT NULL,
            "source"     TEXT NOT NULL,
            "metric"     TEXT NOT NULL,
            "path"       TEXT NOT NULL DEFAULT '',
            "value"      DOUBLE PRECISION,
            "provenance" TEXT NOT NULL DEFAULT 'measured',
            "meta"       JSONB NOT NULL DEFAULT '{}'::jsonb,
            "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT now(),
            UNIQUE ("clubId", "date", "source", "metric", "path")
        )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS "SeoMetric_club_date_idx" ON "SeoMetric" ("clubId", "date" DESC)`);

    _ready = true;
}

export default ensureSeoSchema;
