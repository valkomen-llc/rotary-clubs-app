// ════════════════════════════════════════════════════════════════════════════
// Memoria de los Cerebros — búsqueda vectorial con pgvector (v4.1318.0)
//
// Hasta aquí la búsqueda semántica traía hasta 5.000 memorias del cerebro y
// calculaba el coseno en JavaScript. Con pgvector la ordena la base, con un
// índice HNSW, y el recorte de alcance va en el mismo SQL.
//
// ⚠️ NO SE TOCA "BrainMemory" (es un modelo de Prisma: una columna agregada en
// runtime la borraría el próximo `db push`). Los vectores viven en una tabla
// LATERAL, "BrainMemoryVector", creada en runtime y protegida por el guardián.
//
// ⚠️ ES OPT-IN: se activa desde el Command Center (Conocimiento) sólo si la
// base permite `CREATE EXTENSION vector`. Apagada o sin extensión, la búsqueda
// de siempre sigue igual. Cualquier error del camino vectorial cae al de
// siempre: nunca deja a un agente sin memoria.
// ════════════════════════════════════════════════════════════════════════════
import db from './db.js';

export const VECTOR_DIM = 768;
let _status = null; // { enabled, available, at }

/** Traduce el recorte de alcance (`masterMemoryWhere`) a SQL. Puro. */
export function scopeToSql(scopeWhere, startIndex = 1, alias = 'm') {
    if (!scopeWhere || !Array.isArray(scopeWhere.OR)) return { sql: '', params: [] };
    const parts = []; const params = [];
    let i = startIndex;
    for (const c of scopeWhere.OR) {
        if (c.clubId === null && c.districtId === null) parts.push(`(${alias}."clubId" IS NULL AND ${alias}."districtId" IS NULL)`);
        else if (c.clubId) { parts.push(`${alias}."clubId" = $${i++}`); params.push(String(c.clubId)); }
        else if (c.districtId) { parts.push(`${alias}."districtId" = $${i++}`); params.push(String(c.districtId)); }
    }
    return parts.length ? { sql: ` AND (${parts.join(' OR ')})`, params } : { sql: '', params: [] };
}

/** Vector de Postgres a partir de un arreglo de números. Puro. */
export function toVectorLiteral(arr) {
    if (!Array.isArray(arr) || arr.length !== VECTOR_DIM || arr.some(x => !Number.isFinite(Number(x)))) return null;
    return `[${arr.map(Number).join(',')}]`;
}

async function settingEnabled() {
    try {
        const { rows } = await db.query(`SELECT value FROM "AgentSetting" WHERE key = 'platform'`);
        return Boolean(rows[0]?.value?.vectorSearch);
    } catch { return false; }
}

/** Olvida el estado cacheado (al cambiar el ajuste en esta instancia). */
export function resetVectorStatus() { _status = null; }

/** ¿Está activo el camino vectorial? Cacheado 60 s. */
export async function vectorStatus({ fresh = false } = {}) {
    if (!fresh && _status && Date.now() - _status.at < 60_000) return _status;
    let available = false;
    try {
        const { rows } = await db.query(`SELECT to_regclass('public."BrainMemoryVector"') IS NOT NULL AS t, EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') AS e`);
        available = Boolean(rows[0]?.t && rows[0]?.e);
    } catch { available = false; }
    _status = { available, enabled: available && await settingEnabled(), at: Date.now() };
    return _status;
}

/** Crea la extensión y la tabla lateral. Devuelve { ok, reason }. */
export async function ensureVectorSupport() {
    try {
        await db.query(`CREATE EXTENSION IF NOT EXISTS vector`);
    } catch (e) {
        return { ok: false, reason: `La base no permite pgvector: ${e.message}` };
    }
    await db.query(`
        CREATE TABLE IF NOT EXISTS "BrainMemoryVector" (
            "memoryId" TEXT PRIMARY KEY,
            "brainId" TEXT NOT NULL,
            "clubId" TEXT,
            "districtId" TEXT,
            embedding vector(${VECTOR_DIM}) NOT NULL,
            "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS "BrainMemoryVector_brain_idx" ON "BrainMemoryVector" ("brainId")`);
    await db.query(`CREATE INDEX IF NOT EXISTS "BrainMemoryVector_hnsw" ON "BrainMemoryVector" USING hnsw (embedding vector_cosine_ops)`).catch(() => {});
    _status = null;
    return { ok: true };
}

/** Copia a la tabla lateral los vectores que faltan o cambiaron. Por lotes. */
export async function backfillVectors({ limit = 2000 } = {}) {
    const st = await vectorStatus({ fresh: true });
    if (!st.available) return { ok: false, copied: 0, reason: 'pgvector no está activo.' };
    const { rowCount } = await db.query(
        `INSERT INTO "BrainMemoryVector" ("memoryId", "brainId", "clubId", "districtId", embedding, "updatedAt")
         SELECT m.id, m."brainId", m."clubId", m."districtId", ('[' || array_to_string(m.embedding, ',') || ']')::vector, m."updatedAt"
           FROM "BrainMemory" m
           LEFT JOIN "BrainMemoryVector" v ON v."memoryId" = m.id
          WHERE cardinality(m.embedding) = ${VECTOR_DIM} AND (v."memoryId" IS NULL OR v."updatedAt" < m."updatedAt")
          ORDER BY m."updatedAt" DESC
          LIMIT $1
         ON CONFLICT ("memoryId") DO UPDATE SET embedding = EXCLUDED.embedding, "brainId" = EXCLUDED."brainId", "clubId" = EXCLUDED."clubId", "districtId" = EXCLUDED."districtId", "updatedAt" = EXCLUDED."updatedAt"`,
        [Math.min(10_000, limit)]);
    // Lo que se borró de BrainMemory sale también de la tabla lateral.
    await db.query(`DELETE FROM "BrainMemoryVector" v WHERE NOT EXISTS (SELECT 1 FROM "BrainMemory" m WHERE m.id = v."memoryId")`);
    const left = await db.query(`SELECT COUNT(*)::int AS n FROM "BrainMemory" m LEFT JOIN "BrainMemoryVector" v ON v."memoryId" = m.id WHERE cardinality(m.embedding) = ${VECTOR_DIM} AND v."memoryId" IS NULL`);
    return { ok: true, copied: rowCount, pending: left.rows[0].n };
}

/**
 * Búsqueda vectorial. Devuelve [{ memory, score }] o null si el camino
 * vectorial no está activo (quien llama usa el de siempre).
 */
export async function vectorSearch({ brainId = null, qVec, k = 8, kind = null, scopeWhere = null }) {
    const st = await vectorStatus();
    if (!st.enabled) return null;
    const lit = toVectorLiteral(qVec);
    if (!lit) return null;
    try {
        const params = [lit];
        let where = 'WHERE 1=1';
        if (brainId) { params.push(String(brainId)); where += ` AND v."brainId" = $${params.length}`; }
        if (kind) { params.push(String(kind)); where += ` AND m.kind = $${params.length}`; }
        const scope = scopeToSql(scopeWhere, params.length + 1);
        params.push(...scope.params);
        params.push(Math.min(50, Math.max(1, Number(k) || 8)));
        const { rows } = await db.query(
            `SELECT m.*, 1 - (v.embedding <=> $1::vector) AS score
               FROM "BrainMemoryVector" v JOIN "BrainMemory" m ON m.id = v."memoryId"
              ${where}${scope.sql}
              ORDER BY v.embedding <=> $1::vector LIMIT $${params.length}`, params);
        return rows.map(({ score, embedding, ...memory }) => ({ memory, score: Number(score) }));
    } catch (e) {
        console.warn('[brainVector] búsqueda vectorial falló; se usa la de siempre:', e.message);
        return null;
    }
}
