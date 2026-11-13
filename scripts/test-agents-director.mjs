#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// Dirección IA — el criterio y sus invariantes (v4.1329.0). Sin base ni red.
// Va en `prebuild`. La prueba con base: `npm run test:agents:director:e2e`.
// ════════════════════════════════════════════════════════════════════
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const REPO = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const read = (p) => readFileSync(`${REPO}/${p}`, 'utf8');
const S = await import(`${REPO}/server/lib/agentDirectorSpec.js`);
const RS = await import(`${REPO}/server/lib/agentRuntimeSpec.js`);
let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); n++; };

// ── 1. Interpretación: los cinco casos del pedido ────────────────────
const cases = [
    ['Necesito analizar todos los proyectos postulados a la feria, revisar la información diligenciada, identificar datos faltantes y preparar un resumen para el comité organizador.', ['fair_review']],
    ['Necesito traducir los proyectos postulados para preparar las libretas y documentos de la feria.', ['fair_translation']],
    ['Analiza las inscripciones de la conferencia distrital y prepara un informe de registros pendientes de validación.', ['registrations']],
    ['Prepara un comunicado institucional sobre los avances de los proyectos sociales del distrito.', ['communication']],
    ['Analiza la participación de los clubes del distrito y recomiéndame acciones para mejorar el involucramiento.', null],
];
for (const [text, expected] of cases) {
    const i = S.interpretObjective(text);
    if (expected) eq(i.capabilities, expected, `«${text.slice(0, 50)}…» → ${expected}`);
    else ok(i.capabilities.includes('membership') || i.capabilities.includes('district_report'), 'participación de clubes → membresía o informe distrital');
}
for (const q of S.QUICK_ACTIONS) eq(S.interpretObjective(q.text).capabilities[0], q.key, `acceso rápido «${q.label}» se interpreta como sí mismo`);
const vague = S.interpretObjective('Hola, ¿me ayudas con algo importante hoy?');
ok(vague.capabilities.length === 0 && vague.clarify.length >= 2, 'sin coincidencia: preguntas, no un plan inventado');
ok(S.interpretObjective('corto').errors.length === 1, 'objetivo demasiado corto');
eq(S.interpretObjective('Revisa esto que necesito para el comité', { forced: ['finance', 'nada'] }).capabilities, ['finance'], 'un acceso rápido elegido manda; lo desconocido se ignora');
ok(S.interpretObjective('Analiza y traduce al inglés los proyectos postulados con sus faltantes').capabilities.includes('fair_review'), 'pedir análisis Y traducción conserva ambos');
ok(S.interpretObjective('a'.repeat(5000) + ' feria').errors.length === 1, 'tope de largo');

// ── 2. El plan ───────────────────────────────────────────────────────
const tools = RS.TOOL_CATALOG;
const site = { id: 'f1', name: 'Feria' };
const activeDirector = { installed: true, state: 'active', installationId: 'd1', model: 'm' };
const instProj = { id: 'i1', team: 'proyectos', enabled: true, state: 'active', templateName: 'Evaluación', templateKey: 'pilot-evaluacion-postulaciones' };
const plan = S.buildPlan({ interpretation: S.interpretObjective(cases[0][0]), site, siteType: 'Feria de Proyectos', policy: { enabled: true }, director: activeDirector, installations: [instProj], catalog: { proyectos: [{ id: 't1', key: 'agency-project-manager', name: 'Project Manager', role: 'Manages projects' }, { id: 't2', key: 'agency-chef', name: 'Chef', role: 'cooks' }] }, workflows: RS.WORKFLOWS, tools, price: { model: 'm', inputPerMTok: 1, outputPerMTok: 2 } });
eq(plan.blockers, [], 'sin bloqueos con Director activo y tipo integrado');
eq(plan.steps.map(s => s.workflowKey), ['fair_submission_review'], 'un paso: el workflow existente');
ok(plan.steps[0].agent?.installationId === 'i1' && plan.steps[0].ai, 'el agente del equipo encendido redacta');
ok(plan.specialists.find(s => s.team === 'proyectos').suggested.some(t => t.key === 'agency-project-manager') && !plan.specialists.find(s => s.team === 'proyectos').suggested.some(t => t.key === 'agency-chef'), 'propone especialistas del catálogo que encajan, no cualquiera');
ok(plan.cost.usd > 0 && plan.cost.estimated, 'costo estimado con precio de referencia');
ok(S.estimateCost({ aiSteps: 1, price: null }).usd === null, 'sin precio no se inventa un costo');
ok(plan.approvals[0].at === 'plan' && plan.approvals.at(-1).at === 'review', 'aprobación del plan y revisión del entregable');
ok(plan.risks.some(r => /DATOS, nunca como instrucciones/.test(r)), 'la regla de inyección queda escrita en el plan');
const noDir = S.buildPlan({ interpretation: S.interpretObjective(cases[0][0]), site, policy: { enabled: true }, director: { installed: false }, workflows: RS.WORKFLOWS, tools });
ok(noDir.blockers.some(b => /no está instalado/.test(b)), 'sin Director: bloqueo');
const notActive = S.buildPlan({ interpretation: S.interpretObjective(cases[0][0]), site, policy: { enabled: true }, director: { installed: true, state: 'installed', stateLabel: 'Instalado', reason: 'Falta elegir un responsable.' }, workflows: RS.WORKFLOWS, tools });
ok(notActive.blockers.some(b => /Instalado.*responsable/.test(b)), 'instalado no es activo');
const teamOff = S.buildPlan({ interpretation: S.interpretObjective(cases[0][0]), site, policy: { enabled: true }, director: activeDirector, workflows: RS.WORKFLOWS, tools, teamsAllowed: (t) => t !== 'proyectos' });
ok(teamOff.blockers.some(b => /«proyectos» no está permitido/.test(b)), 'equipo no permitido por el tipo de sitio: bloqueo');
const noAgent = S.buildPlan({ interpretation: S.interpretObjective(cases[0][0]), site, policy: { enabled: true }, director: activeDirector, installations: [], workflows: RS.WORKFLOWS, tools });
ok(!noAgent.steps[0].ai && noAgent.warnings.some(w => /sin resumen con IA/.test(w)), 'sin especialista: corre igual y avisa que no habrá resumen');
const tr = S.buildPlan({ interpretation: S.interpretObjective(cases[1][0]), site, policy: { enabled: true }, director: activeDirector, workflows: RS.WORKFLOWS, tools });
eq(tr.steps.map(s => [s.kind, s.dependsOn]), [['tool', []], ['handoff', ['s1']]], 'traducción: lectura y luego el trabajo humano, con dependencia');
const bad = S.buildPlan({ interpretation: { text: 'x', capabilities: ['fair_review'] }, site, policy: { enabled: true }, director: activeDirector, workflows: {}, tools });
ok(bad.blockers.some(b => /no existe/.test(b)), 'un workflow inexistente bloquea');

// Cada paso de cada capacidad apunta a algo REAL del runtime.
for (const c of S.CAPABILITIES) for (const s of c.steps) {
    if (s.kind === 'workflow') ok(Boolean(RS.WORKFLOWS[s.workflowKey]), `${c.key}: el workflow ${s.workflowKey} existe`);
    if (s.kind === 'tool') ok(RS.toolByKey(s.tool)?.risk === 'N0', `${c.key}: ${s.tool} existe y es de lectura`);
    if (s.kind === 'handoff') ok(/^\/admin\//.test(s.href), `${c.key}: el trabajo humano enlaza a su módulo`);
    for (const t of s.tools || []) ok(Boolean(RS.toolByKey(t)), `${c.key}: la herramienta ${t} existe`);
}

// ── 3. Pasos, estados y entregable ───────────────────────────────────
const steps = [{ id: 's1', status: 'done', dependsOn: [] }, { id: 's2', status: 'pending', dependsOn: ['s1'] }, { id: 's3', status: 'pending', dependsOn: ['s2'] }];
eq(S.nextStep({ steps }).id, 's2', 'el siguiente es el primero con dependencias terminadas');
eq(S.nextStep({ steps: [{ id: 'a', status: 'failed', dependsOn: [] }, { id: 'b', status: 'pending', dependsOn: ['a'] }] }), null, 'si su dependencia falló, no avanza');
ok(!S.planFinished({ steps }) && S.planFinished({ steps: [{ status: 'done' }, { status: 'handoff' }] }), 'terminado = hecho o para una persona');
ok(S.canTransitionPlan('pending_approval', 'approved') && !S.canTransitionPlan('draft', 'approved') && !S.canTransitionPlan('cancelled', 'approved') && !S.canTransitionPlan('completed', 'running'), 'transiciones: no se aprueba un borrador ni revive lo cerrado');
eq(S.stepInput({ inputFrom: 'brief' }, { objective: 'Comunicado X' }), { brief: 'Comunicado X' }, 'el input sale del objetivo guardado');
eq(S.stepInput({ inputFrom: null }, { objective: 'x' }), {}, 'sin input: nada');
const sum = S.summarizeStepResult({ kind: 'workflow' }, { report: { kind: 'fair_submission_review', submissions: [{ ref: 'FP-1', project: { name: 'P' }, missing: [{ label: 'Presupuesto' }], issues: [{ evidence: 'FDD 10%' }] }], complete: 0, withMissing: 1, withIssues: 1 } });
ok(sum.findings === 2 && sum.items[0].detail.includes('Falta: Presupuesto'), 'resumen de la revisión de postulaciones');
const d = S.consolidateDeliverable({ objective: 'o', interpreted: ['A'], steps: [{ id: 's1', label: 'L', kind: 'workflow', status: 'done', summary: sum, workflowRunId: 'w1' }, { id: 's2', label: 'H', kind: 'handoff', status: 'handoff', href: '/admin/x' }] }, { costUsd: 0.5 });
ok(d.totalFindings === 2 && d.pendingHuman.length === 1 && d.sections[0].source.id === 'w1' && /Nada se aprobó/.test(d.disclaimer), 'entregable: hallazgos, fuente de cada sección, lo pendiente y lo que NO se hizo');

// ── 4. Herramientas y expediente ─────────────────────────────────────
ok(RS.toolByKey('fair_translation_status')?.risk === 'N0' && !('siteId' in (RS.toolByKey('fair_translation_status').parameters.properties || {})), 'estado de traducción: N0 y sin siteId en su esquema');
eq(S.DIRECTOR_TEMPLATE.toolRequests.map(t => t.mode), ['read', 'read', 'read', 'read'], 'el Director sólo pide lecturas');
ok(S.DIRECTOR_TEMPLATE.toolRequests.every(t => RS.toolByKey(t.tool)?.risk === 'N0'), 'y todas son N0');
const dossier = { groups: [
    { source: 'submission', key: 'submission', sections: [{ fields: [{ type: 'text', filled: false, label: 'X' }] }] },
    { source: 'form', key: 'fdd', title: 'FDD', started: true, completionPct: 40, sections: [
        { title: 'Presupuesto', fields: [{ type: 'currency', filled: false, label: 'Monto' }, { type: 'computed', filled: false, label: 'Total' }, { type: 'file', filled: false, label: 'Carta' }] },
        { title: 'Aprobación', district: true, fields: [{ type: 'text', filled: false, label: 'Firma' }] },
    ] },
    { source: 'form', key: 'master', title: 'Formulación', started: false, sections: [] },
] };
const gaps = RS.dossierGaps(dossier);
eq(gaps.map(g => [g.key, g.total, g.empty]), [['fdd', 1, ['Presupuesto › Monto']], ['master', 0, []]], 'faltantes: sin calculados, archivos ni espacios del distrito; sin la columna del registro');
const rv = RS.reviewSubmission({ projectName: 'Proyecto' }, gaps);
ok(rv.issues.some(i => i.evidence === 'Formulación: sin iniciar.') && rv.issues.some(i => /FDD \(40%\): 1 de 1 campos vacíos/.test(i.evidence)) && rv.formsComplete === false, 'la revisión suma los formularios como observaciones');
ok(RS.reviewSubmission({ projectName: 'Proyecto', projectDescription: 'x'.repeat(220), focusArea: 'a', budgetUsd: 1000, clubName: 'Club', district: '1', email: 'a@b.co', phone: '3001234567' }, gaps).complete, '«completa» sigue midiendo el registro');
eq(RS.reviewSubmission({ projectName: 'Proyecto' }).issues.length, RS.reviewSubmission({ projectName: 'Proyecto' }, null).issues.length, 'sin expediente, la revisión de siempre');

// ── 5. Invariantes del código ────────────────────────────────────────
const routes = read('server/routes/agentCenter.js');
const line = (start) => routes.split('\n').find(l => l.startsWith(start)) || '';
ok(/platformOnly/.test(line("router.post('/director/template'")) && /platformOnly/.test(line("router.post('/director/install'")), 'instalar el Director y su plantilla: sólo la plataforma');
for (const r of ["router.get('/director/plans/:id'", "router.post('/director/plans/:id/decide'", "router.post('/director/plans/:id/step'"]) {
    const i = routes.indexOf(r);
    ok(i > 0 && /ownOr404\(req/.test(routes.slice(i, i + 260)), `${r}: 404 si el plan no es del sitio de la sesión`);
}
ok(/siteOf\(req, b\.siteId\)/.test(routes) && /siteOf\(req, req\.query\.siteId\)/.test(routes.slice(routes.indexOf("router.get('/director'"))), 'el sitio del Director y de un plan sale de siteOf');
ok(routes.indexOf("router.get('/director/plans'") < routes.indexOf("router.get('/director/plans/:id'"), 'literales antes que paramétricas');
const store = read('server/lib/agentDirectorStore.js');
ok(/const siteId = String\(row\.siteId\); \/\/ el sitio GUARDADO/.test(store), 'cada paso usa el sitio GUARDADO del plan');
ok(/tool\.risk !== 'N0'/.test(store), 'el Director sólo ejecuta lecturas directas');
ok(/WHERE id = \$1 AND status IN \('approved', 'running'\) AND \("lockUntil" IS NULL OR "lockUntil" < NOW\(\)\)/.test(store), 'candado por paso');
ok(/WHERE id = \$1 AND status = \$2 RETURNING id/.test(store), 'cambios de estado condicionales');
ok(/runId: `director:\$\{row\.id\}`/.test(store), 'el consumo de IA queda atribuido al plan');
ok(!/import\([^'"`]/.test(store) && /await import\('\.\/agentDirectorStore\.js'\)/.test(read('server/lib/agentRuntimeStore.js')), 'el tick importa el Director con ruta literal');
ok(!/\bsiteId\b[^\n]*args\./.test(read('server/lib/agentToolExecutors.js')), 'ningún ejecutor lee el sitio de los argumentos');
const ex = read('server/lib/agentToolExecutors.js');
ok(/async fair_translation_status[\s\S]*?WHERE "clubId" = \$1/.test(ex), 'el estado de traducción sólo lee postulaciones del sitio');
ok(!/INSERT|UPDATE|DELETE/.test(ex.slice(ex.indexOf('async fair_translation_status'), ex.indexOf('async content_recent'))), 'y no escribe nada');

console.log(`✓ Dirección IA (criterio): ${n} comprobaciones`);
