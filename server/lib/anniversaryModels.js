// ════════════════════════════════════════════════════════════════════
// Aniversarios IA — la I/O del motor y del benchmark
// v4.897.0
//
// Lee y escribe. NO decide: el criterio —catálogo, elegibilidad, pesos,
// puntuación, recomendación, fallback— vive en `anniversaryEngineSpec.js`,
// que es puro y tiene pruebas.
//
// ── LA CONFIGURACIÓN DEL MOTOR VIVE APARTE DE LAS INSTRUCCIONES ─────
//
// Columna `engine` de `AnniversaryConfig`, fuera de `draft`/`published`:
// cambiar el modelo es una decisión TÉCNICA que aplica en el acto y no
// reescribe la dirección de arte ni crea una versión editorial. La traza de
// qué generó cada pieza no se pierde por eso: viaja en el sello `engine` de
// la propia pieza, que es el registro de auditoría (req. 21).
//
// ── LA LECTURA DEL MOTOR NUNCA LANZA HACIA EL CAMINO PÚBLICO ────────
//
// `readEngineConfig` corre en el despacho de cada generación: una columna
// ilegible degrada a la configuración por defecto —que es el modelo de
// siempre—, no tumba la pieza de un visitante.
// ════════════════════════════════════════════════════════════════════
import db from './db.js';
import { ensureConfigRow } from './anniversaryStore.js';
import { ensureAnniversarySchema } from './ensureAnniversarySchema.js';
import { normalizeEngineConfig, normalizeWeights } from './anniversaryEngineSpec.js';

// ─── La configuración del motor ────────────────────────────────────────

export const readEngineConfig = async (clubId = null) => {
    try {
        const row = await ensureConfigRow(clubId);
        return { row, engine: normalizeEngineConfig(row.engine) };
    } catch (e) {
        console.error('[anniversaryModels] readEngineConfig:', e.message);
        return { row: null, engine: normalizeEngineConfig(null) };
    }
};

export const saveEngineConfig = async (clubId, raw) => {
    const row = await ensureConfigRow(clubId);
    const engine = normalizeEngineConfig(raw);
    const { rows } = await db.query(
        `UPDATE "AnniversaryConfig" SET engine = $1::jsonb, "updatedAt" = NOW() WHERE id = $2 RETURNING *`,
        [JSON.stringify(engine), row.id]
    );
    return { row: rows[0], engine };
};

// ─── El benchmark ──────────────────────────────────────────────────────

export const createBenchmark = async ({ configId, models, photos, weights = null, createdBy = null }) => {
    await ensureAnniversarySchema();
    const { rows } = await db.query(
        `INSERT INTO "AnniversaryBenchmark" ("configId", status, models, photos, weights, "createdBy")
         VALUES ($1, 'running', $2::jsonb, $3::jsonb, $4::jsonb, $5)
         RETURNING *`,
        [configId || null, JSON.stringify(models), JSON.stringify(photos),
            weights ? JSON.stringify(normalizeWeights(weights)) : null, createdBy]
    );
    return rows[0];
};

export const readBenchmark = async (id) => {
    await ensureAnniversarySchema();
    const { rows } = await db.query(`SELECT * FROM "AnniversaryBenchmark" WHERE id = $1`, [String(id || '')]);
    return rows[0] || null;
};

export const listBenchmarks = async (configId, limit = 10) => {
    await ensureAnniversarySchema();
    const { rows } = await db.query(
        `SELECT id, status, models, weights, notes, "createdBy", "createdAt", "finishedAt"
           FROM "AnniversaryBenchmark"
          WHERE "configId" IS NOT DISTINCT FROM $1
          ORDER BY "createdAt" DESC
          LIMIT $2`,
        [configId || null, Math.min(50, Math.max(1, Number(limit) || 10))]
    );
    return rows;
};

export const finishBenchmark = async (id, status = 'done') => {
    const { rows } = await db.query(
        `UPDATE "AnniversaryBenchmark" SET status = $1, "finishedAt" = NOW() WHERE id = $2 RETURNING *`,
        [status, String(id || '')]
    );
    return rows[0] || null;
};

// ─── Resultados (una fila por modelo × fotografía) ─────────────────────

export const createBenchResult = async ({ benchmarkId, model, photoIndex, taskId = null, status = 'pending', error = null }) => {
    const { rows } = await db.query(
        `INSERT INTO "AnniversaryBenchmarkResult"
             ("benchmarkId", model, "photoIndex", "taskId", status, error, "dispatchedAt")
         VALUES ($1, $2, $3, $4, $5, $6, NOW())
         RETURNING *`,
        [benchmarkId, model, photoIndex, taskId, status, error]
    );
    return rows[0];
};

export const listBenchResults = async (benchmarkId) => {
    const { rows } = await db.query(
        `SELECT * FROM "AnniversaryBenchmarkResult"
          WHERE "benchmarkId" = $1
          ORDER BY "photoIndex" ASC, model ASC`,
        [String(benchmarkId || '')]
    );
    return rows;
};

/** Escritura parcial de un resultado. Lista CERRADA de campos, como la de las
 *  piezas: sin ella, cualquier clave del cuerpo entraría al SQL. */
const RESULT_FIELDS = new Set(['status', 'imageUrl', 'latencyMs', 'error', 'auto', 'vote', 'taskId']);
const RESULT_JSON = new Set(['auto']);

export const updateBenchResult = async (id, patch) => {
    const sets = [];
    const params = [];
    for (const [k, v] of Object.entries(patch || {})) {
        if (!RESULT_FIELDS.has(k)) continue;
        params.push(RESULT_JSON.has(k) ? JSON.stringify(v ?? null) : v);
        sets.push(`"${k}" = $${params.length}${RESULT_JSON.has(k) ? '::jsonb' : ''}`);
    }
    if (!sets.length) return null;
    params.push(String(id || ''));
    const { rows } = await db.query(
        `UPDATE "AnniversaryBenchmarkResult" SET ${sets.join(', ')}, "updatedAt" = NOW()
          WHERE id = $${params.length} RETURNING *`, params
    );
    return rows[0] || null;
};

/**
 * Reclama UN resultado pendiente para sondearlo. El reclamo va sobre el
 * estado (`pending` → `polling` no existe: acá el candado es que el UPDATE
 * condicional del cierre sólo cierra una vez) — dos sondeos del mismo
 * benchmark pueden mirar la misma tarea, pero sólo uno la CIERRA:
 * `WHERE status = 'pending'` en el UPDATE final es el candado real, y es la
 * misma forma que `ingestScene` en Reels.
 */
export const closeBenchResult = async (id, patch) => {
    const sets = [];
    const params = [];
    for (const [k, v] of Object.entries(patch || {})) {
        if (!RESULT_FIELDS.has(k)) continue;
        params.push(RESULT_JSON.has(k) ? JSON.stringify(v ?? null) : v);
        sets.push(`"${k}" = $${params.length}${RESULT_JSON.has(k) ? '::jsonb' : ''}`);
    }
    if (!sets.length) return null;
    params.push(String(id || ''));
    const { rows } = await db.query(
        `UPDATE "AnniversaryBenchmarkResult" SET ${sets.join(', ')}, "updatedAt" = NOW()
          WHERE id = $${params.length} AND status = 'pending' RETURNING *`, params
    );
    return rows[0] || null;
};

export default {
    readEngineConfig, saveEngineConfig,
    createBenchmark, readBenchmark, listBenchmarks, finishBenchmark,
    createBenchResult, listBenchResults, updateBenchResult, closeBenchResult,
};
