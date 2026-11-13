#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// AI Agent Command Center — Fase 3: despliegues, mapa, vista por sitio y
// workflows 1/7/8 (v4.1317.0). npm run test:agents:rollout — sin base ni red.
// ════════════════════════════════════════════════════════════════════
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const REPO = decodeURIComponent(new URL('..', import.meta.url).pathname).replace(/\/$/, '');
const read = (p) => readFileSync(`${REPO}/${p}`, 'utf8');
let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); n++; };

const S = await import(`${REPO}/server/lib/agentRolloutSpec.js`);
const W = await import(`${REPO}/server/lib/agentRuntimeSpec.js`);

// ─── 1. Oleadas ───────────────────────────────────────────────────────
const sites = Array.from({ length: 20 }, (_, i) => `s${i}`);
const w = S.planWaves(sites, S.DEFAULT_WAVES);
eq(w.map(x => x.length), [1, 4, 15], '1 piloto → 25 % → 100 % sobre 20 sitios');
eq(new Set(w.flat()).size, 20, 'cada sitio en UNA oleada, ninguno repetido');
eq(S.planWaves([...sites].reverse(), S.DEFAULT_WAVES), w, 'determinista: el mismo despliegue elige los mismos sitios');
eq(S.planWaves(['a'], S.DEFAULT_WAVES).map(x => x.length), [1], 'un solo sitio: una oleada');
eq(S.planWaves(sites, [{ percent: 100 }]).map(x => x.length), [20], 'todo de una vez');
eq(S.planWaves(sites, [{ percent: 1 }, { percent: 100 }])[0].length, 1, 'toda oleada tiene al menos un sitio');
eq(S.planWaves([], S.DEFAULT_WAVES), [[]], 'sin sitios, nada');

// ─── 2. Salud, validación y confirmación ──────────────────────────────
ok(S.healthGate({ runs: 3, failed: 3 }).ok, 'con pocas ejecuciones no se bloquea (no hay señal)');
ok(!S.healthGate({ runs: 10, failed: 3 }).ok, 'más del 20 % de fallas: se pausa');
ok(S.healthGate({ runs: 10, failed: 2 }).ok, '20 % justo: se puede seguir');
const known = { knownTemplateKeys: ['pilot-comunicaciones', 'legacy-diana', 'pilot-validacion-inscripciones'], knownSiteTypes: ['club', 'district'] };
const v1 = S.validateRollout({ name: 'Equipo club', preset: 'club_basico', siteTypes: ['club', 'inventado'] }, known);
ok(v1.ok, 'una plantilla de equipo con destino es válida');
eq(v1.normalized.siteTypes, ['club'], 'un tipo de sitio desconocido se descarta');
ok(v1.normalized.missingTemplates.includes('legacy-sofia'), 'lo que la plantilla de equipo pide y no está publicado se INFORMA');
ok(!v1.normalized.templateKeys.includes('legacy-sofia'), '…y no se despliega');
ok(!S.validateRollout({ name: 'x' }, known).ok, 'sin nombre ni agentes, no');
ok(!S.validateRollout({ name: 'Sin destino', templateKeys: ['legacy-diana'] }, known).ok, 'sin destino, no');
ok(S.validateRollout({ name: 'Central', preset: 'administracion_central' }, known).normalized.platform, 'el equipo central va a la plataforma');
ok(S.confirmationOk({ targets: 1, confirmCount: null }), 'un solo sitio no pide escribir el número');
ok(!S.confirmationOk({ targets: 12, confirmCount: 11 }), 'el número escrito tiene que coincidir');
ok(S.confirmationOk({ targets: 12, confirmCount: '12' }), 'coincide');
for (const [k, p] of Object.entries(S.TEAM_PRESETS)) ok(p.templates.length > 0 && p.label, `plantilla de equipo ${k}`);

// ─── 3. Mapa: sólo lo real ────────────────────────────────────────────
const net = S.buildNetwork({
    teams: [{ key: 'eventos', short: 'Eventos' }, { key: 'finanzas', short: 'Finanzas' }],
    templates: [{ id: 't1', team: 'eventos', name: 'Validación' }, { id: 't2', team: 'finanzas', name: 'Sin instalar' }],
    installations: [{ id: 'i1', templateId: 't1', state: 'active' }, { id: 'i2', templateId: 't1', state: 'error' }],
    grants: [{ installationId: 'i1', tool: 'events_list', mode: 'read' }, { installationId: 'i2', tool: 'events_registration_review', mode: 'read' }],
    catalog: W.TOOL_CATALOG, moduleLabels: { events: 'Eventos' },
});
ok(!net.nodes.some(x => x.id === 'agent:t2') && !net.nodes.some(x => x.id === 'team:finanzas'), 'una plantilla sin instalar NO aparece');
eq(net.edges.find(e => e.to === 'tool:events_list').style, 'active', 'concesión con instalación activa');
eq(net.edges.find(e => e.to === 'tool:events_registration_review').style, 'broken', 'concesión cuya instalación está con error');
ok(net.nodes.some(x => x.id === 'module:events' && x.label === 'Eventos'), 'el módulo sale del catálogo');
ok(!net.nodes.some(x => x.id === 'tool:content_publish_news'), 'una herramienta no concedida no se dibuja');

// ─── 4. Workflows 1, 7 y 8 ────────────────────────────────────────────
ok(['project_formulation', 'site_audit', 'district_report'].every(k => W.WORKFLOWS[k]), 'los workflows 1, 7 y 8 existen');
const idea = W.reviewProjectIdea('Queremos llevar agua potable a 120 familias de la vereda El Encano, en el municipio de Pasto, durante 6 meses, con un presupuesto de USD 15.000, instalando filtros y capacitando a la comunidad en su mantenimiento y en hábitos de higiene.');
ok(idea.ready, 'una idea con beneficiarios, cifras, lugar, plazo, presupuesto y área está completa');
ok(W.reviewProjectIdea('ayudar a la gente').missing.length >= 5, 'una idea vaga: casi todo falta');
const health = W.reviewSiteHealth({ site: { domain: null, logo: null }, newsLast60: 0, upcomingEvents: 0, projects: 0, seo: { criticalCount: 2, score: 40 } });
eq(health[0].severity, 'high', 'lo crítico primero');
ok(health.every(f => f.finding && f.task), 'todo hallazgo trae su tarea');
eq(W.reviewSiteHealth({ site: { domain: 'x.org', logo: 'l.png' }, newsLast60: 3, upcomingEvents: 2, projects: 4, seo: { criticalCount: 0, score: 90 } }), [], 'un sitio sano no tiene hallazgos');
ok(W.PILOT_TEMPLATES.find(p => p.key === 'pilot-informes-distritales').allowedSiteTypes.includes('district'), 'el agente de informes es de distritos');

// ─── 5. Invariantes ───────────────────────────────────────────────────
const routes = read('server/routes/agentCenter.js');
ok(/router\.use\(authMiddleware, resolveScope\)/.test(routes), 'toda la API exige alcance');
ok(/const siteOf = \(req, requested\) => \(req\.acScope\.platform \? \(requested \? String\(requested\) : null\) : req\.acScope\.siteId\)/.test(routes), 'un sitio SIEMPRE trabaja sobre el suyo (el pedido se ignora)');
for (const r of ["router.get('/rollouts'", "router.post('/rollouts'", "router.post('/rollouts/:id/advance'", "router.post('/rollouts/:id/rollback'", "router.put('/installations/:id/grants'", "router.delete('/installations/:id'", "router.get('/usage/prices'"]) {
    const line = routes.split('\n').find(l => l.startsWith(r));
    ok(line && /platformOnly/.test(line), `${r}: sólo la plataforma`);
}
const patchInst = routes.slice(routes.indexOf("router.patch('/installations/:id'"), routes.indexOf("router.delete('/installations/:id'"));
ok(/ownOr404\(req, inst\.siteId\)/.test(patchInst), 'un sitio sólo ajusta SUS instalaciones');
ok(!/budget/.test(patchInst.slice(patchInst.indexOf('const allowed'), patchInst.indexOf('if (!req.acScope.platform && allowed.responsibleUserId)')).split(':')[2] || ''), 'un sitio no cambia su presupuesto');
ok(/El responsable tiene que administrar este sitio/.test(patchInst), 'el responsable que elige un sitio tiene que ser de ese sitio');
for (const r of ["router.get('/tasks/:id'", "router.get('/workflow-runs/:id'", "router.post('/installations/:id/run'"]) {
    const i = routes.indexOf(r);
    ok(i >= 0 && /ownOr404/.test(routes.slice(i, i + 300)), `${r}: verifica el sitio`);
}
const agents = read('server/routes/agents.js');
ok(/router\.post\('\/deploy-all'[\s\S]{0,200}status\(410\)/.test(agents), '«Desplegar a todos» se retiró (410)');
const layout = read('src/components/admin/AdminLayout.tsx');
ok(/\['district_admin', 'club_admin'\]\.includes\(String\(user\?\.role \|\| ''\)\)[\s\S]{0,200}path: '\/admin\/agentes'/.test(layout), 'quien administra un sitio ve «Agentes IA» en el menú');
const store = read('server/lib/agentRolloutStore.js');
ok(/confirmationOk\(\{ targets: ro\.targetCount, confirmCount \}\)/.test(store), 'la primera oleada exige la confirmación escrita');
ok(/healthGate|health\.gate\.ok/.test(store), 'avanzar pasa por la compuerta de salud');
ok(/SET enabled = false, "disabledReason"/.test(store) && !/DELETE FROM "AgentInstallation"/.test(store), 'revertir APAGA, no borra');
ok(/enabledTypes\.has\(t\)/.test(store), 'el destino por tipo respeta los tipos integrados');

console.log(`✓ test-agents-rollout: ${n} comprobaciones`);
