// ════════════════════════════════════════════════════════════════════════════
// AI Agent Command Center — memoria y conocimiento por alcances (v4.1318.0)
//
// Los ámbitos del plan §16 sobre los Cerebros existentes:
//   global     memorias del maestro SIN club ni distrito (documentación general);
//   distrital  el cerebro del distrito del sitio;
//   club/sitio el cerebro del propio sitio;
//   operativa  lo que guardan las ejecuciones (AgentRun/AgentRunStep), con
//              retención (`retentionDays` en Ajustes).
// Un agente busca SÓLO en esos ámbitos de SU instalación (`knowledge_search`):
// nunca en el cerebro de otro sitio. Cada resultado cita su fuente
// (sourceType/sourceId) para que lo dicho se pueda verificar.
// ════════════════════════════════════════════════════════════════════════════
import db from './db.js';
import { searchMemories } from '../services/brainService.js';
import { vectorStatus, ensureVectorSupport, backfillVectors } from './brainVector.js';

/** Los cerebros que puede consultar un agente de este sitio. */
export async function knowledgeBrainsForSite(siteId) {
    const out = { site: null, district: null, master: null };
    try {
        const site = (await db.query(`SELECT id, "districtId" FROM "Club" WHERE id::text = $1`, [String(siteId)])).rows[0];
        const brains = (await db.query(
            `SELECT id, "clubId", "districtId", "isMaster" FROM "Brain"
              WHERE "isMaster" OR "clubId" = $1 OR ($2::text IS NOT NULL AND "districtId" = $2)`, [String(siteId), site?.districtId || null])).rows;
        out.site = brains.find(b => b.clubId && String(b.clubId) === String(siteId)) || null;
        out.district = brains.find(b => b.districtId && site?.districtId && String(b.districtId) === String(site.districtId)) || null;
        out.master = brains.find(b => b.isMaster) || null;
    } catch { /* sin cerebros: sin conocimiento, no es un error */ }
    return out;
}

/** El recorte del maestro para un sitio: sólo lo GLOBAL. */
export const GLOBAL_ONLY = { OR: [{ clubId: null, districtId: null }] };

/**
 * Busca en el conocimiento AUTORIZADO de un sitio y devuelve resultados con su
 * fuente. `search` se inyecta en las pruebas.
 */
export async function searchKnowledgeForSite(siteId, query, { k = 6, search = searchMemories } = {}) {
    const b = await knowledgeBrainsForSite(siteId);
    const lookups = [];
    if (b.site) lookups.push(search({ brainId: b.site.id, query, k }).then(r => r.map(x => ({ ...x, scope: 'sitio' }))));
    if (b.district) lookups.push(search({ brainId: b.district.id, query, k: Math.ceil(k / 2) }).then(r => r.map(x => ({ ...x, scope: 'distrito' }))));
    if (b.master) lookups.push(search({ brainId: b.master.id, query, k: Math.ceil(k / 2), scopeWhere: GLOBAL_ONLY }).then(r => r.map(x => ({ ...x, scope: 'global' }))));
    const all = (await Promise.all(lookups.map(p => p.catch(() => [])))).flat();
    const seen = new Set();
    return all
        .sort((a, c) => (c.score || 0) - (a.score || 0))
        .filter(r => { const key = `${r.memory.sourceType}:${r.memory.sourceId}`; if (seen.has(key)) return false; seen.add(key); return true; })
        .slice(0, k)
        .map(r => ({
            scope: r.scope, score: Math.round((r.score || 0) * 1000) / 1000, title: r.memory.title, kind: r.memory.kind,
            source: { type: r.memory.sourceType || null, id: r.memory.sourceId || null }, excerpt: String(r.memory.content || '').slice(0, 500),
        }));
}

/** El estado de la memoria para el panel. `siteId` = sólo lo de ese sitio. */
export async function memoryOverview({ siteId = null } = {}) {
    const q = async (sql, p = []) => { try { return (await db.query(sql, p)).rows; } catch { return []; } };
    const where = siteId ? `WHERE m."clubId" = $1` : '';
    const params = siteId ? [String(siteId)] : [];
    const [byKind, totals, masterPrivate, vector] = await Promise.all([
        q(`SELECT b.kind AS "brainKind", b."isMaster", COUNT(m.id)::int AS memories, COUNT(m.id) FILTER (WHERE cardinality(m.embedding) = 0)::int AS "withoutEmbedding"
             FROM "BrainMemory" m JOIN "Brain" b ON b.id = m."brainId" ${where} GROUP BY b.kind, b."isMaster" ORDER BY memories DESC`, params),
        q(`SELECT COUNT(*)::int AS memories, COUNT(DISTINCT m."brainId")::int AS brains FROM "BrainMemory" m ${where}`, params),
        siteId ? Promise.resolve([{ n: 0 }]) : q(`SELECT COUNT(*)::int AS n FROM "BrainMemory" m JOIN "Brain" b ON b.id = m."brainId" WHERE b."isMaster" AND (m."clubId" IS NOT NULL OR m."districtId" IS NOT NULL)`),
        vectorStatus({ fresh: true }),
    ]);
    let vectorRows = null;
    if (vector.available) vectorRows = (await q(`SELECT COUNT(*)::int AS n FROM "BrainMemoryVector"`))[0]?.n ?? null;
    return { byKind, totals: totals[0] || { memories: 0, brains: 0 }, masterPrivateCopies: masterPrivate[0]?.n || 0, vector: { ...vector, rows: vectorRows } };
}

/**
 * Quita del maestro las COPIAS de memorias de sitios (heredadas de cuando el
 * maestro recibía todo). Sólo borra la copia si el original existe en el
 * cerebro del sitio o del distrito (misma fuente): no se pierde información.
 */
export async function purgeMasterPrivateCopies({ dryRun = true } = {}) {
    const base = `FROM "BrainMemory" mm JOIN "Brain" b ON b.id = mm."brainId" AND b."isMaster"
                  WHERE (mm."clubId" IS NOT NULL OR mm."districtId" IS NOT NULL)
                    AND EXISTS (SELECT 1 FROM "BrainMemory" o JOIN "Brain" ob ON ob.id = o."brainId" AND NOT ob."isMaster"
                                 WHERE o."sourceType" IS NOT DISTINCT FROM mm."sourceType" AND o."sourceId" IS NOT DISTINCT FROM mm."sourceId")`;
    const count = (await db.query(`SELECT COUNT(*)::int AS n ${base}`)).rows[0].n;
    const orphans = (await db.query(`SELECT COUNT(*)::int AS n FROM "BrainMemory" mm JOIN "Brain" b ON b.id = mm."brainId" AND b."isMaster" WHERE (mm."clubId" IS NOT NULL OR mm."districtId" IS NOT NULL)`)).rows[0].n - count;
    if (dryRun) return { dryRun: true, removable: count, keptWithoutOriginal: orphans };
    const del = await db.query(`DELETE FROM "BrainMemory" WHERE id IN (SELECT mm.id ${base})`);
    await db.query(`UPDATE "Brain" b SET "memoryCount" = (SELECT COUNT(*) FROM "BrainMemory" m WHERE m."brainId" = b.id) WHERE b."isMaster"`).catch(() => {});
    return { dryRun: false, removed: del.rowCount, keptWithoutOriginal: orphans };
}

/** Retención de la memoria OPERATIVA. Devuelve lo que se purgó. */
export async function purgeOperationalMemory({ retentionDays = 180 } = {}) {
    const days = Math.min(3650, Math.max(30, Number(retentionDays) || 180));
    const steps = await db.query(`DELETE FROM "AgentRunStep" WHERE "runId" IN (SELECT id FROM "AgentRun" WHERE "startedAt" < NOW() - ($1::int * INTERVAL '1 day'))`, [days]);
    const runs = await db.query(`DELETE FROM "AgentRun" WHERE "startedAt" < NOW() - ($1::int * INTERVAL '1 day')`, [days]);
    const events = await db.query(`DELETE FROM "AgentEvent" WHERE "processedAt" IS NOT NULL AND "createdAt" < NOW() - INTERVAL '30 days'`);
    // El detalle de consumo vive 400 días; el agregado diario, siempre.
    const usage = await db.query(`DELETE FROM "AiUsageEvent" WHERE "createdAt" < NOW() - INTERVAL '400 days'`).catch(() => ({ rowCount: 0 }));
    return { retentionDays: days, steps: steps.rowCount, runs: runs.rowCount, events: events.rowCount, usageEvents: usage.rowCount };
}

export { ensureVectorSupport, backfillVectors, vectorStatus };
