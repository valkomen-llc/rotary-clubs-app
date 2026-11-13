#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// AI Agent Command Center — Fases 5–6: piloto controlado y escalamiento
// (v4.1319.0). npm run test:agents:scale — sin base.
// ════════════════════════════════════════════════════════════════════
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const REPO = decodeURIComponent(new URL('..', import.meta.url).pathname).replace(/\/$/, '');
const read = (p) => readFileSync(`${REPO}/${p}`, 'utf8');
let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); n++; };

const S = await import(`${REPO}/server/lib/agentScaleSpec.js`);
const W = await import(`${REPO}/server/lib/agentRuntimeSpec.js`);

// ─── 1. Constructor: validación ───────────────────────────────────────
const ctx = { templateKeys: ['k'], cadenceOk: (c) => /^daily@/.test(c), eventTypes: ['fair_submission.created'] };
const good = { trigger: { kind: 'manual' }, steps: [{ type: 'tool', tool: 'events_list' }, { type: 'stop_if_empty', path: 'steps.1.events' }, { type: 'agent', templateKey: 'k', prompt: 'Resume {{steps.1.events}} por favor' }, { type: 'approval', tool: 'content_publish_news', args: { postId: '{{steps.3.id}}' } }] };
eq(S.validateDefinition(good, ctx).ok, true, 'un workflow lineal válido');
const errs = (def) => S.validateDefinition(def, ctx).errors.join(' | ');
ok(/al menos un paso/.test(errs({ steps: [] })), 'sin pasos no hay workflow');
ok(/Máximo 12/.test(errs({ steps: Array(13).fill({ type: 'tool', tool: 'site_context' }) })), 'tope de 12 pasos');
ok(/aprobación/.test(errs({ steps: [{ type: 'tool', tool: 'content_publish_news' }] })), 'una acción N3 NUNCA va como herramienta directa');
ok(/N0/.test(errs({ steps: [{ type: 'approval', tool: 'site_context' }] })), 'una aprobación es sólo para N2/N3');
ok(/delegación/.test(errs({ steps: [{ type: 'tool', tool: 'delegate_task' }] })), 'la delegación no entra al constructor');
ok(/anteriores/.test(errs({ steps: [{ type: 'agent', templateKey: 'k', prompt: 'usa {{steps.2.text}} ahora' }, { type: 'tool', tool: 'site_context' }] })), 'no se lee un paso posterior: no hay saltos hacia atrás ni bucles');
ok(/anteriores/.test(errs({ steps: [{ type: 'agent', templateKey: 'k', prompt: 'usa {{steps.1.text}} ahora' }] })), 'ni el propio paso');
ok(/condición mira un paso anterior/.test(errs({ steps: [{ type: 'stop_if_empty', path: 'steps.1.x' }] })), 'la condición mira hacia atrás');
ok(/no existe o no está publicado/.test(errs({ steps: [{ type: 'agent', templateKey: 'otro', prompt: 'algo largo aquí' }] })), 'sólo agentes publicados');
ok(/qué debe hacer/.test(errs({ steps: [{ type: 'agent', templateKey: 'k', prompt: 'x' }] })), 'el agente necesita instrucciones');
ok(/tipo desconocido/.test(errs({ steps: [{ type: 'loop' }] })), 'no hay paso de bucle');
ok(/programación/.test(errs({ trigger: { kind: 'schedule', cadence: 'nunca' }, steps: [{ type: 'tool', tool: 'site_context' }] })), 'programación válida');
ok(/evento no existe/.test(errs({ trigger: { kind: 'event', event: 'x' }, steps: [{ type: 'tool', tool: 'site_context' }] })), 'evento conocido');
ok(!JSON.stringify(W.TOOL_CATALOG.map(t => t.parameters)).includes('siteId'), 'ningún paso puede elegir el sitio (no hay siteId en ningún esquema)');

// ─── 2. Plantillas y condición ────────────────────────────────────────
eq(S.resolveTemplate({ t: 'Hola {{input.n}}', a: ['{{steps.1.x}}'], o: '{{steps.1.list}}' }, { input: { n: 'Ana' }, steps: { 1: { x: 3, list: [1] } } }), { t: 'Hola Ana', a: ['3'], o: '[1]' }, 'plantillas en textos, listas y objetos');
eq(S.resolveTemplate('{{steps.9.nada}}', { steps: {} }), '', 'lo que no existe queda vacío');
eq([S.isEmptyValue(0), S.isEmptyValue([]), S.isEmptyValue({}), S.isEmptyValue(' '), S.isEmptyValue(null), S.isEmptyValue([0]), S.isEmptyValue(false)], [true, true, true, true, true, false, false], 'qué es «vacío»');
eq(S.readPath({ a: { b: [{ c: 7 }] } }, 'a.b.0.c'), 7, 'rutas con índices');

// ─── 3. Hallazgos calificables ────────────────────────────────────────
const fin = S.findingsOf({ kind: 'finance_review', findings: [{ kind: 'unbalanced', ref: 'tx1', evidence: 'e' }] });
eq(fin.map(f => f.ref), ['fin:unbalanced:tx1'], 'la referencia sale del caso, no de la posición');
eq(S.findingsOf({ kind: 'event_registration_review', events: [{ eventId: 'e1', findings: [{ kind: 'missing_receipt', source: 'X', registrationId: 'r1', evidence: 'e' }] }] })[0].ref, 'reg:e1:X:r1:missing_receipt', 'inscripciones');
eq(S.findingsOf({ kind: 'fair_submission_review', submissions: [{ ref: 'FP-1', missing: [], issues: [] }, { ref: 'FP-2', missing: [{ label: 'x' }], issues: [] }] }).map(f => f.ref), ['sub:FP-2'], 'sólo las postulaciones con algo que revisar');
eq(S.findingsOf({ kind: 'custom' }), [], 'un informe sin hallazgos (se califica completo con «run»)');
eq(S.findingsCount(null), 0, 'sin informe, cero');

// ─── 4. Métricas y veredicto del piloto ───────────────────────────────
const m = S.pilotMetrics({
    runs: [{ status: 'succeeded', findings: 4 }, { status: 'succeeded', findings: 6 }, { status: 'failed', findings: 0 }],
    feedback: [...Array(7).fill({ verdict: 'useful' }), { verdict: 'not_useful' }, { verdict: 'false_positive' }, { verdict: 'false_positive' }],
    costUsd: 3, sites: 2, minutesPerFinding: 6,
    approvals: [{ status: 'executed' }, { status: 'rejected' }, { status: 'pending' }],
});
eq([m.runs, m.findings, m.rated, m.usefulRate, m.falsePositiveRate, m.estimatedMinutesSaved, m.costPerSite, m.approvalsDecided, m.approvalsRejectedRate], [3, 10, 10, 0.7, 0.2, 42, 1.5, 2, 0.5], 'las métricas del plan, exactas');
eq(Math.round(m.successRate * 100), 67, 'tasa de éxito');
eq(S.pilotVerdict(m, { minRated: 20 }).status, 'insufficient', 'con pocas opiniones no hay veredicto');
eq(S.pilotVerdict(m, { minRated: 10 }).status, 'pass', '70 % útiles y 20 % falsos positivos: pasa');
eq(S.pilotVerdict(m, { minRated: 10, maxFalsePositive: 0.1 }).status, 'review', 'con un tope más estricto, a revisar');
eq(S.pilotMetrics({}).usefulRate, null, 'sin datos, sin tasas (no un 0 engañoso)');

// ─── 5. Membresía: SÓLO agregados ─────────────────────────────────────
const now = new Date('2026-11-11T12:00:00Z');
const day = (d) => new Date(now.getTime() - d * 86400_000).toISOString();
const rows = [
    { name: 'Ana', isActive: true, isBoard: true, boardRole: 'Presidente', image: 'a', description: 'x', createdAt: day(400), updatedAt: day(400) },
    { name: 'Beto', isActive: false, createdAt: day(400), updatedAt: day(10) },
    { name: 'Carla', isActive: false, createdAt: day(400), updatedAt: day(20) },
    { name: 'Dani', isActive: true, isHonorary: true, createdAt: day(5), updatedAt: day(5) },
];
const mem = S.reviewMembership(rows, now);
eq([mem.metrics.total, mem.metrics.active, mem.metrics.board, mem.metrics.honorary, mem.metrics.newLast90, mem.metrics.deactivatedLast90], [4, 2, 1, 1, 1, 2], 'cifras');
ok(!/Ana|Beto|Carla|Dani/.test(JSON.stringify(mem)), 'ningún nombre en el resultado');
ok(mem.aggregatedOnly && mem.findings.some(f => f.area === 'tendencia'), 'la tendencia se ve sin nombrar a nadie');
eq(S.reviewMembership([], now).findings[0].area, 'datos', 'sin socios cargados, se dice');
eq(W.toolByKey('membership_summary').risk, 'N0', 'Membresía sólo lee');
ok(W.WORKFLOWS.membership_review.never.some(x => /Perfilar/.test(x)), 'nunca perfila personas');
ok(W.PILOT_TEMPLATES.some(p => p.key === 'pilot-membresia' && p.tools.every(([, mode]) => mode === 'read')), 'la plantilla piloto de Membresía sólo lee');

// ─── 6. Invariantes ───────────────────────────────────────────────────
const ex = read('server/lib/agentToolExecutors.js');
const memSql = ex.slice(ex.indexOf('async membership_summary'), ex.indexOf('async content_create_news_draft'));
ok(!/\bname\b|email|phone/.test(memSql.split('FROM')[0]), 'la consulta de Membresía no lee nombres ni contactos');
ok(/WHERE "clubId" = \$1`, \[ctx\.siteId\]/.test(memSql), '…y sólo del sitio de la instalación');
const rt = read('server/lib/agentRuntimeStore.js');
ok(/startsWith\('custom:'\)\) \{\s*const \{ runCustomWorkflow \}/.test(rt), 'los workflows del constructor entran por runWorkflow (programaciones y eventos incluidos)');
ok(/WHEN 'array' THEN jsonb_array_length/.test(rt), 'el listado ya no castea una lista a número');
const st = read('server/lib/agentScaleStore.js');
ok(/if \(!tool \|\| !\['N0', 'N1'\]\.includes\(tool\.risk\)\)/.test(st) && /if \(!tool \|\| !\['N2', 'N3'\]\.includes\(tool\.risk\)\)/.test(st), 'el motor vuelve a comprobar el riesgo de cada paso al ejecutar');
ok(/const toolCtx = \{ siteId: String\(site\.id\), approved: false \};/.test(st), 'el sitio del paso es el de la ejecución, nunca aprobado de antemano');
ok(/await checkBudgets\(\{ installation: inst \}\)/.test(st) && /settings\.killSwitch/.test(st), 'presupuestos e interruptor también en el constructor');
const routes = read('server/routes/agentCenter.js');
for (const r of ["router.get('/pilots'", "router.post('/pilots'", "router.get('/pilots/:id'", "router.put('/pilots/:id'", "router.post('/pilots/:id/conclude'"]) {
    const line = routes.split('\n').find(l => l.startsWith(r));
    ok(line && /platformOnly/.test(line), `${r}: sólo la plataforma`);
}
ok(/router\.post\('\/workflow-runs\/:id\/feedback', wrap\(async \(req, res\) => \{ ownOr404\(req/.test(routes), 'calificar exige que el informe sea del sitio');
const guard = read('scripts/db-push-guard.mjs');
const claude = read('CLAUDE.md');
for (const t of ['AgentPilot', 'AgentFeedback', 'AgentCustomWorkflow', 'AgentCustomWorkflowVersion']) ok(guard.includes(t) && claude.includes('`' + t + '`'), `${t} protegida`);
const ens = read('server/lib/ensureAgentCenterSchema.js');
for (const t of ['AgentPilot', 'AgentFeedback', 'AgentCustomWorkflow', 'AgentCustomWorkflowVersion']) ok(new RegExp(`${t}: \\[\\]`).test(ens), `${t} en OWNED_COLUMNS`);

console.log(`✓ test-agents-scale: ${n} comprobaciones`);
