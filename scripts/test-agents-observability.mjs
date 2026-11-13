#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// AI Agent Command Center — Fase 4: memoria por alcances, observabilidad y
// revisión financiera (v4.1318.0). npm run test:agents:observability — sin base.
// ════════════════════════════════════════════════════════════════════
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const REPO = decodeURIComponent(new URL('..', import.meta.url).pathname).replace(/\/$/, '');
const read = (p) => readFileSync(`${REPO}/${p}`, 'utf8');
let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); n++; };

const O = await import(`${REPO}/server/lib/agentObservabilitySpec.js`);
const V = await import(`${REPO}/server/lib/brainVector.js`);
const W = await import(`${REPO}/server/lib/agentRuntimeSpec.js`);
const RS = await import(`${REPO}/server/lib/agentRegistrySpec.js`);

// ─── 1. Presupuestos ──────────────────────────────────────────────────
eq(O.sanitizeBudgets({ platformMonthlyUsd: '50', sites: { a: 10, b: 0, c: 'x' } }), { platformMonthlyUsd: 50, sites: { a: 10 } }, 'topes válidos; 0 o inválido = quitar');
eq(O.sanitizeBudgets({ sites: { a: 0 } }, { sites: { a: 10, b: 5 } }).sites, { b: 5 }, 'quitar el tope de un sitio');
ok(O.budgetDecision([{ scope: 'site', label: 'del sitio', limit: 10, spent: 3 }]).ok, 'bajo el tope: sigue');
const d = O.budgetDecision([{ scope: 'installation', label: 'del agente', limit: 5, spent: 1 }, { scope: 'platform', label: 'de la plataforma', limit: 100, spent: 100 }]);
ok(!d.ok && d.scope === 'platform' && /de la plataforma agotado/.test(d.reason), 'el primer tope alcanzado manda y se dice cuál');

// ─── 2. Alertas ───────────────────────────────────────────────────────
const al = O.evaluateAlerts({
    budgets: [{ scope: 'site', key: 's1', siteId: 's1', label: 'del sitio', limit: 10, spent: 8.5 }, { scope: 'platform', key: 'all', label: 'de la plataforma', limit: 100, spent: 120 }, { scope: 'installation', key: 'i9', limit: 10, spent: 1, label: 'del agente' }],
    errorRates: [{ installationId: 'i1', siteId: 's1', agentName: 'Validación', runs: 10, failed: 4 }, { installationId: 'i2', runs: 3, failed: 3 }],
    deadTasks: 2, expiredApprovals: 0, stalledTasks: 1,
    providerFailures: [{ provider: 'google', model: 'gemini-2.5-flash', n: 5, sample: '401 API key not valid' }],
});
const kinds = al.map(a => a.kind).sort();
eq(kinds, ['budget_exhausted', 'budget_warning', 'dead_tasks', 'error_rate', 'provider_failure', 'stalled_tasks'], 'cada hecho, su alerta; lo que no cumple, nada');
ok(!al.some(a => a.installationId === 'i2'), 'con menos de 5 ejecuciones no hay alerta de tasa de error (no hay señal)');
ok(!al.some(a => a.dedupeKey === 'budget:installation:i9'), 'un presupuesto al 10 % no alerta');
eq(new Set(al.map(a => a.dedupeKey)).size, al.length, 'una llave por condición (sin duplicados)');
ok(al.every(a => ['high', 'medium', 'low'].includes(a.severity) && a.message), 'toda alerta trae severidad y mensaje');
ok(O.isAccountError('Google (Gemini) rechazó la petición por un problema de FACTURACIÓN') && O.isAccountError('HTTP 401'), 'errores de cuenta');
ok(!O.isAccountError('timeout'), 'un timeout no es un problema de cuenta');

// ─── 3. Vectores ──────────────────────────────────────────────────────
eq(V.scopeToSql({ OR: [{ clubId: null, districtId: null }, { clubId: 'A' }, { districtId: 'D' }] }, 3), { sql: ' AND ((m."clubId" IS NULL AND m."districtId" IS NULL) OR m."clubId" = $3 OR m."districtId" = $4)', params: ['A', 'D'] }, 'el recorte de alcance se traduce a SQL parametrizado');
eq(V.scopeToSql(null), { sql: '', params: [] }, 'sin recorte, nada');
eq(V.toVectorLiteral([1, 2]), null, 'dimensión equivocada: no hay vector');
ok(V.toVectorLiteral(Array(768).fill(0.5)).startsWith('[0.5,'), 'vector de 768');
eq(V.toVectorLiteral(Array(768).fill('x')), null, 'valores no numéricos: no hay vector');

// ─── 4. Revisión financiera (sólo lectura) ────────────────────────────
const fin = W.reviewFinance({ unbalanced: [{ id: 'tx1', kind: 'contribution', currency: 'COP', total: 5000 }], orphanReversals: [{ id: 'tx2', reverses: 'tx-no' }], paidWithoutSupport: [{ ref: 'R-1', source: 'Inscripción a evento', status: 'paid', amount: 100 }] });
eq(fin.map(f => f.kind), ['unbalanced', 'orphan_reversal', 'paid_without_support'], 'descuadre primero');
ok(fin.every(f => f.ref && f.evidence), 'cada hallazgo cita su referencia');
eq(W.toolByKey('finance_review').risk, 'N0', 'la revisión financiera es SÓLO lectura');
ok(W.WORKFLOWS.finance_review.never.some(x => /saldos/.test(x)), 'nunca modifica saldos');
ok(!('siteId' in W.toolByKey('knowledge_search').parameters.properties), 'buscar conocimiento NO recibe el sitio');

// ─── 5. Ajustes ───────────────────────────────────────────────────────
eq(RS.sanitizeSettings({ retentionDays: 5 }).retentionDays, 30, 'retención mínima de 30 días');
eq(RS.sanitizeSettings({ retentionDays: 99999 }).retentionDays, 3650, 'máximo 10 años');
eq(RS.SETTINGS_DEFAULTS.vectorSearch, false, 'pgvector es opt-in');

// ─── 6. Invariantes ───────────────────────────────────────────────────
const bs = read('server/services/brainService.js');
ok(/const targets = \(clubId \|\| districtId\) \? \[site, district\]\.filter\(Boolean\) : \[master\];/.test(bs), 'el maestro SÓLO recibe lo global');
ok(/signal: AbortSignal\.timeout\(15_000\)/.test(bs), 'los embeddings tienen tope de tiempo');
ok(/feature: 'brain\.embedding'/.test(bs), 'y se miden en Consumo de IA');
ok(/const v = await vectorSearch\(\{ brainId, qVec, k, kind, scopeWhere \}\);\s*if \(v\) return v;/.test(bs), 'con pgvector activo se usa; si no, lo de siempre');
const schema = read('server/prisma/schema.prisma');
ok(!/BrainMemoryVector/.test(schema) && !/vector\(/.test(schema), 'los vectores NO tocan el modelo de Prisma (tabla lateral)');
const brains = read('server/routes/brains.js');
ok(/brainId: isSuperAdmin\(req\) \? null : master\.id/.test(brains), 'la plataforma busca en todos los cerebros; los demás, en el maestro recortado');
const guard = read('scripts/db-push-guard.mjs');
const claude = read('CLAUDE.md');
for (const t of ['AgentAlert', 'BrainMemoryVector']) ok(guard.includes(t) && claude.includes('`' + t + '`'), `${t} protegida`);
const rt = read('server/lib/agentRuntimeStore.js');
ok(/const budget = await checkBudgets\(\{ installation: inst \}\);/.test(rt), 'el runtime revisa los tres presupuestos');
ok(/computeAlerts\(\)/.test(rt) && /purgeOperationalMemory/.test(rt), 'el tick calcula alertas y aplica la retención');
const mem = read('server/lib/agentMemory.js');
ok(/scopeWhere: GLOBAL_ONLY/.test(mem), 'del maestro, un agente sólo ve lo global');
ok(/AND EXISTS \(SELECT 1 FROM "BrainMemory" o/.test(mem), 'limpiar el maestro sólo quita copias con original');
const routes = read('server/routes/agentCenter.js');
for (const r of ["router.post('/memory/vector/enable'", "router.post('/memory/purge-master'", "router.put('/budgets'", "router.post('/alerts/compute'"]) {
    const line = routes.split('\n').find(l => l.startsWith(r));
    ok(line && /platformOnly/.test(line), `${r}: sólo la plataforma`);
}
ok(/const dryRun = req\.body\?\.confirm !== 'LIMPIAR';/.test(routes), 'limpiar el maestro exige escribir LIMPIAR');

console.log(`✓ test-agents-observability: ${n} comprobaciones`);
