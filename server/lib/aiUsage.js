// ════════════════════════════════════════════════════════════════════════════
// Consumo de IA — medición de cada llamada a un modelo (v4.1316.0)
//
// Pedido del cliente: «un módulo de consumo para poder medir». Cada llamada que
// pasa por el enrutador de modelos (`ai-router.js`) o por el Model Gateway de
// los agentes (`agentGateway.js`) deja UNA fila en `AiUsageEvent` (proveedor,
// modelo, función, sitio, tokens, costo estimado, latencia, éxito) y suma en
// `AiUsageDaily`, el agregado por día que lee el panel sin recorrer eventos.
//
// La ATRIBUCIÓN (qué función y qué sitio gastó) viaja en un AsyncLocalStorage:
// quien llama envuelve su trabajo en `withAiContext({ feature, siteId, … })` y
// toda llamada a un modelo que ocurra adentro —aunque sea tres funciones más
// abajo— queda atribuida, sin pasar parámetros por quince firmas.
//
// ⚠️ MEDIR NUNCA ROMPE LO MEDIDO: `recordAiUsage` no lanza y tiene tope de
// tiempo. Una base lenta no puede demorar la respuesta de un agente.
//
// ⚠️ EL COSTO ES UNA ESTIMACIÓN: tokens × precio de `AiModelPrice`, una tabla
// editable desde el panel con precios de referencia. La factura real la emite
// cada proveedor; el panel lo dice.
// ════════════════════════════════════════════════════════════════════════════
import { AsyncLocalStorage } from 'node:async_hooks';
import db from './db.js';

const als = new AsyncLocalStorage();

/** Ejecuta `fn` con un contexto de atribución. Se anida: lo interno gana. */
export function withAiContext(ctx, fn) {
    const parent = als.getStore() || {};
    return als.run({ ...parent, ...cleanContext(ctx) }, fn);
}
export function currentAiContext() { return als.getStore() || {}; }

/**
 * Fija el contexto para el RESTO de la cadena asíncrona actual (un manejador de
 * Express). Para no reestructurar rutas existentes: una línea al inicio basta.
 */
export function enterAiContext(ctx) {
    const parent = als.getStore() || {};
    als.enterWith({ ...parent, ...cleanContext(ctx) });
}

function cleanContext(ctx = {}) {
    const out = {};
    for (const k of ['feature', 'siteId', 'installationId', 'runId', 'userId']) {
        if (ctx[k] != null && ctx[k] !== '') out[k] = String(ctx[k]).slice(0, 120);
    }
    return out;
}

// ── Funciones que consumen (lista ABIERTA: un nombre nuevo se muestra tal cual) ──
export const FEATURE_LABELS = {
    agents: 'Agentes IA (motor de ejecución)',
    'agents.chat': 'Agentes IA (chat)',
    'agents.workflow': 'Agentes IA (workflows)',
    router: 'Otras funciones de IA',
    'whatsapp.agent': 'Agente de WhatsApp',
    'brain.chat': 'Cerebro del sitio',
    'project_fair.translation': 'Feria de Proyectos (traducción de expedientes)',
};

// ── Precios de referencia (USD por millón de tokens) ───────────────────
// Editables en «Consumo de IA → Precios». Son de referencia y pueden quedar
// viejos: la plataforma los muestra como ESTIMACIÓN.
export const DEFAULT_PRICES = [
    { model: 'gemini-2.5-flash', provider: 'google', inputPerMTok: 0.30, outputPerMTok: 2.50 },
    { model: 'gemini-2.5-pro', provider: 'google', inputPerMTok: 1.25, outputPerMTok: 10.00 },
    { model: 'gemini-2.0-flash', provider: 'google', inputPerMTok: 0.10, outputPerMTok: 0.40 },
    { model: 'gemini-2.0-flash-lite', provider: 'google', inputPerMTok: 0.075, outputPerMTok: 0.30 },
    { model: 'gpt-4o', provider: 'openai', inputPerMTok: 2.50, outputPerMTok: 10.00 },
    { model: 'gpt-4o-mini', provider: 'openai', inputPerMTok: 0.15, outputPerMTok: 0.60 },
    { model: 'gpt-4-turbo-preview', provider: 'openai', inputPerMTok: 10.00, outputPerMTok: 30.00 },
    { model: 'gpt-3.5-turbo', provider: 'openai', inputPerMTok: 0.50, outputPerMTok: 1.50 },
    { model: 'claude-3-5-sonnet-20241022', provider: 'anthropic', inputPerMTok: 3.00, outputPerMTok: 15.00 },
    { model: 'claude-3-haiku-20240307', provider: 'anthropic', inputPerMTok: 0.25, outputPerMTok: 1.25 },
    { model: 'mistral-large-latest', provider: 'mistral', inputPerMTok: 2.00, outputPerMTok: 6.00 },
];

/** Costo estimado. Puro. Un modelo sin precio cuesta 0 y se marca `priced: false`. */
export function estimateCostUsd({ model, inputTokens = 0, outputTokens = 0 }, prices = DEFAULT_PRICES) {
    const p = prices.find(x => x.model === model) || prices.find(x => model && String(model).startsWith(x.model));
    if (!p) return { costUsd: 0, priced: false };
    const cost = (Number(inputTokens) || 0) / 1e6 * Number(p.inputPerMTok || 0) + (Number(outputTokens) || 0) / 1e6 * Number(p.outputPerMTok || 0);
    return { costUsd: Math.round(cost * 1e6) / 1e6, priced: true };
}

/** Tokens de la respuesta de cada proveedor, normalizados. Puro. */
export function usageFromResponse(provider, data) {
    if (!data || typeof data !== 'object') return { inputTokens: 0, outputTokens: 0 };
    if (provider === 'google') {
        const u = data.usageMetadata || {};
        return { inputTokens: Number(u.promptTokenCount) || 0, outputTokens: (Number(u.candidatesTokenCount) || 0) + (Number(u.thoughtsTokenCount) || 0) };
    }
    if (provider === 'anthropic') {
        const u = data.usage || {};
        return { inputTokens: Number(u.input_tokens) || 0, outputTokens: Number(u.output_tokens) || 0 };
    }
    const u = data.usage || {};
    return { inputTokens: Number(u.prompt_tokens) || 0, outputTokens: Number(u.completion_tokens) || 0 };
}

// ── Esquema ────────────────────────────────────────────────────────────
export const OWNED_COLUMNS = { AiUsageEvent: [], AiUsageDaily: [], AiModelPrice: [] };
let _ready = false;

export async function ensureAiUsageSchema() {
    if (_ready) return;
    await db.query(`
        CREATE TABLE IF NOT EXISTS "AiUsageEvent" (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            provider TEXT,
            model TEXT,
            feature TEXT NOT NULL DEFAULT 'router',
            "siteId" TEXT,
            "installationId" TEXT,
            "runId" TEXT,
            "userId" TEXT,
            "inputTokens" INT NOT NULL DEFAULT 0,
            "outputTokens" INT NOT NULL DEFAULT 0,
            "costUsd" NUMERIC(14,6) NOT NULL DEFAULT 0,
            priced BOOLEAN NOT NULL DEFAULT true,
            "latencyMs" INT,
            ok BOOLEAN NOT NULL DEFAULT true,
            error TEXT
        )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS "AiUsageEvent_created_idx" ON "AiUsageEvent" ("createdAt" DESC)`);
    await db.query(`CREATE INDEX IF NOT EXISTS "AiUsageEvent_site_idx" ON "AiUsageEvent" ("siteId", "createdAt" DESC)`);
    await db.query(`
        CREATE TABLE IF NOT EXISTS "AiUsageDaily" (
            day DATE NOT NULL,
            "siteId" TEXT NOT NULL DEFAULT '',
            provider TEXT NOT NULL DEFAULT '',
            model TEXT NOT NULL DEFAULT '',
            feature TEXT NOT NULL DEFAULT '',
            calls INT NOT NULL DEFAULT 0,
            errors INT NOT NULL DEFAULT 0,
            "inputTokens" BIGINT NOT NULL DEFAULT 0,
            "outputTokens" BIGINT NOT NULL DEFAULT 0,
            "costUsd" NUMERIC(16,6) NOT NULL DEFAULT 0,
            PRIMARY KEY (day, "siteId", provider, model, feature)
        )
    `);
    await db.query(`
        CREATE TABLE IF NOT EXISTS "AiModelPrice" (
            model TEXT PRIMARY KEY,
            provider TEXT,
            "inputPerMTok" NUMERIC(12,4) NOT NULL DEFAULT 0,
            "outputPerMTok" NUMERIC(12,4) NOT NULL DEFAULT 0,
            "updatedBy" TEXT,
            "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);
    _ready = true;
}

let _prices = null;
let _pricesAt = 0;
export async function currentPrices() {
    if (_prices && Date.now() - _pricesAt < 300_000) return _prices;
    try {
        await ensureAiUsageSchema();
        const { rows } = await db.query(`SELECT model, provider, "inputPerMTok", "outputPerMTok", "updatedAt" FROM "AiModelPrice"`);
        const saved = new Map(rows.map(r => [r.model, { ...r, inputPerMTok: Number(r.inputPerMTok), outputPerMTok: Number(r.outputPerMTok), custom: true }]));
        _prices = [...DEFAULT_PRICES.filter(p => !saved.has(p.model)).map(p => ({ ...p, custom: false })), ...saved.values()];
    } catch {
        _prices = DEFAULT_PRICES.map(p => ({ ...p, custom: false }));
    }
    _pricesAt = Date.now();
    return _prices;
}

export async function savePrice({ model, provider, inputPerMTok, outputPerMTok }, user) {
    await ensureAiUsageSchema();
    const m = String(model || '').trim().slice(0, 120);
    if (!m) throw new Error('Falta el modelo.');
    const i = Number(inputPerMTok); const o = Number(outputPerMTok);
    if (!Number.isFinite(i) || !Number.isFinite(o) || i < 0 || o < 0 || i > 1000 || o > 1000) throw new Error('Precio inválido (USD por millón de tokens, entre 0 y 1000).');
    await db.query(
        `INSERT INTO "AiModelPrice" (model, provider, "inputPerMTok", "outputPerMTok", "updatedBy", "updatedAt") VALUES ($1, $2, $3, $4, $5, NOW())
         ON CONFLICT (model) DO UPDATE SET provider = EXCLUDED.provider, "inputPerMTok" = EXCLUDED."inputPerMTok", "outputPerMTok" = EXCLUDED."outputPerMTok", "updatedBy" = EXCLUDED."updatedBy", "updatedAt" = NOW()`,
        [m, provider ? String(provider).slice(0, 40) : null, i, o, user?.id || null]
    );
    _prices = null;
    return currentPrices();
}

/**
 * Registra una llamada. NUNCA lanza; tope de 1,5 s. Devuelve la fila o null.
 * `meter` = { provider, model, inputTokens, outputTokens, latencyMs, ok, error }.
 */
export async function recordAiUsage(meter = {}, ctx = currentAiContext()) {
    const work = (async () => {
        await ensureAiUsageSchema();
        const prices = await currentPrices();
        const { costUsd, priced } = estimateCostUsd(meter, prices);
        const feature = String(ctx.feature || meter.feature || 'router').slice(0, 80);
        const siteId = ctx.siteId || meter.siteId || null;
        const row = [
            meter.provider || null, meter.model || null, feature, siteId, ctx.installationId || null, ctx.runId || null, ctx.userId || null,
            Math.max(0, Math.round(Number(meter.inputTokens) || 0)), Math.max(0, Math.round(Number(meter.outputTokens) || 0)),
            costUsd, priced, meter.latencyMs != null ? Math.round(meter.latencyMs) : null, meter.ok !== false,
            meter.error ? String(meter.error).slice(0, 500) : null,
        ];
        const ins = await db.query(
            `INSERT INTO "AiUsageEvent" (provider, model, feature, "siteId", "installationId", "runId", "userId", "inputTokens", "outputTokens", "costUsd", priced, "latencyMs", ok, error)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING id, "costUsd"`, row);
        await db.query(
            `INSERT INTO "AiUsageDaily" (day, "siteId", provider, model, feature, calls, errors, "inputTokens", "outputTokens", "costUsd")
             VALUES ((NOW() AT TIME ZONE 'America/Bogota')::date, $1, $2, $3, $4, 1, $5, $6, $7, $8)
             ON CONFLICT (day, "siteId", provider, model, feature) DO UPDATE SET
                calls = "AiUsageDaily".calls + 1, errors = "AiUsageDaily".errors + EXCLUDED.errors,
                "inputTokens" = "AiUsageDaily"."inputTokens" + EXCLUDED."inputTokens",
                "outputTokens" = "AiUsageDaily"."outputTokens" + EXCLUDED."outputTokens",
                "costUsd" = "AiUsageDaily"."costUsd" + EXCLUDED."costUsd"`,
            [siteId || '', meter.provider || '', meter.model || '', feature, meter.ok === false ? 1 : 0, row[7], row[8], costUsd]
        );
        return ins.rows[0];
    })();
    try {
        return await Promise.race([work, new Promise(r => setTimeout(() => r(null), 1500))]);
    } catch (err) {
        console.warn('[aiUsage] no se pudo registrar:', err?.message);
        return null;
    }
}

// ── Lecturas para el panel ─────────────────────────────────────────────
const daysOf = (d) => Math.min(366, Math.max(1, Number(d) || 30));

export async function usageSummary({ days = 30, siteId = null } = {}) {
    await ensureAiUsageSchema();
    const n = daysOf(days);
    const where = [`day >= (NOW() AT TIME ZONE 'America/Bogota')::date - ($1::int - 1)`];
    const params = [n];
    if (siteId) { params.push(String(siteId)); where.push(`"siteId" = $${params.length}`); }
    const W = 'WHERE ' + where.join(' AND ');
    const sum = `SUM(calls)::int AS calls, SUM(errors)::int AS errors, SUM("inputTokens")::bigint AS "inputTokens", SUM("outputTokens")::bigint AS "outputTokens", SUM("costUsd")::float AS "costUsd"`;
    const [tot, byDay, byModel, byFeature, bySite] = await Promise.all([
        db.query(`SELECT ${sum} FROM "AiUsageDaily" ${W}`, params),
        db.query(`SELECT day, ${sum} FROM "AiUsageDaily" ${W} GROUP BY day ORDER BY day`, params),
        db.query(`SELECT provider, model, ${sum} FROM "AiUsageDaily" ${W} GROUP BY provider, model ORDER BY "costUsd" DESC NULLS LAST`, params),
        db.query(`SELECT feature, ${sum} FROM "AiUsageDaily" ${W} GROUP BY feature ORDER BY "costUsd" DESC NULLS LAST`, params),
        siteId ? Promise.resolve({ rows: [] }) : db.query(
            `SELECT d."siteId", c.name AS "siteName", c.type AS "siteType", SUM(d.calls)::int AS calls, SUM(d.errors)::int AS errors,
                    SUM(d."inputTokens")::bigint AS "inputTokens", SUM(d."outputTokens")::bigint AS "outputTokens", SUM(d."costUsd")::float AS "costUsd"
               FROM "AiUsageDaily" d LEFT JOIN "Club" c ON c.id::text = d."siteId" ${W.replace(/day >=/, 'd.day >=')}
              GROUP BY d."siteId", c.name, c.type ORDER BY "costUsd" DESC NULLS LAST LIMIT 50`, params).catch(() => ({ rows: [] })),
    ]);
    const unpriced = await db.query(`SELECT DISTINCT model FROM "AiUsageEvent" WHERE priced = false AND "createdAt" > NOW() - ($1::int * INTERVAL '1 day') LIMIT 20`, [n]);
    const num = (r) => ({ ...r, inputTokens: Number(r.inputTokens || 0), outputTokens: Number(r.outputTokens || 0), costUsd: Number(r.costUsd || 0), calls: Number(r.calls || 0), errors: Number(r.errors || 0) });
    return {
        days: n,
        totals: num(tot.rows[0] || {}),
        byDay: byDay.rows.map(num),
        byModel: byModel.rows.map(num),
        byFeature: byFeature.rows.map(r => ({ ...num(r), label: FEATURE_LABELS[r.feature] || r.feature })),
        bySite: bySite.rows.map(num),
        unpricedModels: unpriced.rows.map(r => r.model).filter(Boolean),
    };
}

export async function recentUsageEvents({ limit = 50, siteId = null } = {}) {
    await ensureAiUsageSchema();
    const { rows } = await db.query(
        `SELECT * FROM "AiUsageEvent" ${siteId ? 'WHERE "siteId" = $2' : ''} ORDER BY "createdAt" DESC LIMIT $1`,
        siteId ? [Math.min(500, limit), String(siteId)] : [Math.min(500, limit)]
    );
    return rows.map(r => ({ ...r, costUsd: Number(r.costUsd) }));
}

/** Gasto del mes en curso de una instalación (para presupuestos). */
export async function monthSpendUsd({ installationId = null, siteId = null } = {}) {
    await ensureAiUsageSchema();
    const col = installationId ? '"installationId"' : '"siteId"';
    const val = installationId || siteId;
    if (!val) return 0;
    const { rows } = await db.query(
        `SELECT COALESCE(SUM("costUsd"), 0)::float AS usd FROM "AiUsageEvent"
          WHERE ${col} = $1 AND "createdAt" >= date_trunc('month', NOW() AT TIME ZONE 'America/Bogota') AT TIME ZONE 'America/Bogota'`,
        [String(val)]
    );
    return Number(rows[0]?.usd || 0);
}
