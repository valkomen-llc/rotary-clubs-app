#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// Centro de Equipos de IA — EL CRITERIO (v4.1331.0). Sin base ni red.
// npm run test:agents:teams (en `prebuild`)
//
// Lo que fija:
//   · los ocho equipos con su perfil, configurables por lista CERRADA y con
//     su clave inmutable;
//   · la pertenencia a varios equipos sin copiar agentes, y que asociar NO
//     amplía lo que la política permite;
//   · el estado de un equipo: nunca «operativo» sin un agente ACTIVO;
//   · un sitio no ve equipos ocultos ni los que su tipo de sitio no trabaja;
//   · la Dirección IA arma iniciativas con los equipos elegidos;
//   · las rutas, el esquema y la pantalla respetan esas reglas.
// ════════════════════════════════════════════════════════════════════
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const REPO = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const S = await import(`${REPO}/server/lib/agentTeamsSpec.js`);
const { TEAMS, TEAM_KEYS, AGENCY_DIVISION_TEAM, AGENCY_DIVISIONS, AUDIT_ACTIONS, siteTypeAllows } = await import(`${REPO}/server/lib/agentRegistrySpec.js`);
const D = await import(`${REPO}/server/lib/agentDirectorSpec.js`);
const read = (p) => readFileSync(`${REPO}/${p}`, 'utf8');

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); n++; };

// ── 1. Los ocho equipos y su perfil ──────────────────────────────────
eq(TEAM_KEYS, ['direccion', 'comunicaciones', 'proyectos', 'eventos', 'membresia', 'finanzas', 'tecnologia', 'analitica'], 'se conservan los ocho equipos existentes, con sus claves');
for (const k of TEAM_KEYS) {
    const p = S.TEAM_PROFILES[k];
    ok(p, `perfil de ${k}`);
    ok(p.mission.length > 20 && p.capabilities.length >= 6 && p.guardrails.length >= 1, `${k}: misión, capacidades y límites`);
    ok(S.TEAM_ICONS[p.icon], `${k}: ícono de la lista cerrada`);
}
ok(S.TEAM_PROFILES.direccion.director === true, 'Dirección y estrategia se relaciona con el Director');
ok(S.TEAM_PROFILES.eventos.guardrails.some(g => /inscripciones, pagos ni validaciones/.test(g)), 'Eventos: no modifica inscripciones, pagos ni validaciones');
ok(S.TEAM_PROFILES.membresia.guardrails.some(g => /privacidad/.test(g)), 'Membresía: privacidad');
ok(S.TEAM_PROFILES.finanzas.guardrails.some(g => /LECTURA/.test(g)), 'Finanzas: sólo lectura');
ok(S.TEAM_PROFILES.tecnologia.guardrails.some(g => /credenciales/.test(g)), 'Tecnología: sin credenciales');
eq(S.TEAM_PROFILES.proyectos.summary, 'Formulación, revisión y seguimiento de proyectos.', 'la descripción de la propuesta visual');

// ── 2. Configuración: lista cerrada y saneada ────────────────────────
const def = S.effectiveTeams({});
eq(def.map(t => t.key), TEAM_KEYS, 'sin configuración: el orden de siempre');
eq(def.map(t => t.label), TEAMS.map(t => t.label), 'y los nombres de siempre');
ok(def.every(t => t.visible && !t.configured), 'todos visibles, sin configurar');
eq(S.effectiveTeams({}).find(t => t.key === 'proyectos').originDivisions.sort(), ['healthcare', 'product', 'project-management'], 'categorías de origen de Proyectos: las divisiones que caen en él');

ok(S.sanitizeTeamConfig({ label: 'x' }).errors.length === 1, 'nombre demasiado corto');
ok(S.sanitizeTeamConfig({ icon: 'bomba' }).errors.length === 1, 'ícono fuera de la lista');
ok(S.sanitizeTeamConfig({ divisions: ['inventada'] }).errors.length === 1, 'categoría desconocida');
ok(S.sanitizeTeamConfig({ sortOrder: 500 }).errors.length === 1 && S.sanitizeTeamConfig({ sortOrder: 2.5 }).errors.length === 1, 'orden entero 0–99');
ok(S.sanitizeTeamConfig({ responsibilities: Array.from({ length: 13 }, (_, i) => `R${i}`) }).errors.length === 1, 'máximo 12 responsabilidades');
const good = S.sanitizeTeamConfig({ label: '  Proyectos   de servicio ', icon: 'target', sortOrder: 0, visible: false, responsibilities: 'Uno\n\nDos\nUno', divisions: ['research'], key: 'otra', allowedTeams: ['x'], tools: ['finance_review'] });
eq(good.errors, [], 'una configuración válida');
eq(Object.keys(good.value).sort(), ['divisions', 'icon', 'label', 'responsibilities', 'sortOrder', 'visible'], 'campos ajenos (clave, herramientas, permisos) se ignoran');
eq(good.value.label, 'Proyectos de servicio', 'espacios normalizados');
eq(good.value.responsibilities, ['Uno', 'Dos'], 'responsabilidades sin vacíos ni repetidas');
eq(S.mergeTeamConfig({ label: 'A', icon: 'cpu', permisos: 1 }, { icon: 'chart' }), { label: 'A', icon: 'chart' }, 'un cambio parcial conserva lo guardado y descarta lo ajeno');

const cfg = S.effectiveTeams({
    proyectos: { label: 'Proyectos de servicio', sortOrder: 0, divisions: ['research', 'healthcare'], responsibilities: ['Revisar postulaciones'] },
    membresia: { visible: false },
    intrusa: { label: 'Equipo inventado' },
});
eq(cfg[0].key, 'proyectos', 'el orden configurado manda');
ok(!cfg.some(t => t.key === 'intrusa'), 'una clave que no es equipo no crea equipos');
ok(cfg.find(t => t.key === 'proyectos').label === 'Proyectos de servicio' && cfg.find(t => t.key === 'proyectos').key === 'proyectos', 'el nombre cambia; la CLAVE no');
eq(cfg.find(t => t.key === 'proyectos').divisions, ['research'], 'una categoría de origen propia no se repite como asociada');
eq(cfg.find(t => t.key === 'proyectos').responsibilities, ['Revisar postulaciones'], 'responsabilidades configuradas');
ok(cfg.find(t => t.key === 'membresia').visible === false, 'visibilidad configurable');
eq(S.divisionsByTeam(cfg), { proyectos: ['research'] }, 'el parámetro de la consulta de pertenencia');

// ── 3. Pertenencia a varios equipos, sin copias ──────────────────────
const dt = { proyectos: ['research'], eventos: ['research'] };
eq(S.teamsOfTemplate({ team: 'analitica', division: 'research', manualTeams: ['comunicaciones', 'inventado'], divisionTeams: dt }), ['analitica', 'comunicaciones', 'proyectos', 'eventos'], 'principal primero, después los asociados a mano y por categoría; sin claves inventadas');
eq(S.teamsOfTemplate({ team: 'eventos', manualTeams: ['eventos'] }), ['eventos'], 'sin repetidos');
eq(S.membershipKind({ team: 'eventos', manualTeams: ['proyectos'] }, 'eventos'), 'primary', 'principal');
eq(S.membershipKind({ team: 'eventos', manualTeams: ['proyectos'], division: 'research', divisionTeams: dt }, 'proyectos'), 'manual', 'a mano gana a la categoría');
eq(S.membershipKind({ team: 'eventos', division: 'research', divisionTeams: dt }, 'proyectos'), 'division', 'por categoría');
eq(S.membershipKind({ team: 'eventos' }, 'finanzas'), null, 'no pertenece');
eq(S.installationTeams({ team: 'eventos' }), ['eventos'], 'una instalación sin lista: su equipo principal');
eq(S.installationTeams({ team: 'eventos', teams: ['eventos', 'proyectos'] }), ['eventos', 'proyectos'], 'con lista: sus equipos');

// Asociar NO da permisos: la política mira el equipo PRINCIPAL.
const onlyEvents = { enabled: true, allowedTeams: ['eventos'] };
ok(!siteTypeAllows(onlyEvents, 'tecnologia'), 'un agente de Tecnología asociado a Eventos sigue sin estar permitido donde sólo trabaja Eventos');

// ── 4. Estado operativo honesto ───────────────────────────────────────
const st = (x) => S.teamOperationalStatus(x).key;
eq(st({ templates: 0 }), 'empty', 'sin plantillas');
eq(st({ templates: 16 }), 'not_installed', '16 plantillas y 0 instalaciones: «Sin instalaciones» (el caso de la captura)');
eq(st({ templates: 16, installed: 2, enabled: 2, profileOnly: 2 }), 'profile_only', 'encendidos sin herramientas: Solo perfil');
eq(st({ templates: 16, installed: 3, active: 1 }), 'operational', 'con un agente activo: Operativo');
eq(st({ templates: 16, installed: 3, active: 1, errors: 1 }), 'degraded', 'activo y con errores');
eq(st({ templates: 16, installed: 3, errors: 1 }), 'error', 'sólo errores');
eq(st({ templates: 16, installed: 2, disabled: 2 }), 'disabled', 'todo deshabilitado');
eq(st({ templates: 16, installed: 2 }), 'installed_off', 'instalado y apagado');
eq(st({ allowed: false, templates: 16, installed: 5, active: 5 }), 'not_allowed', 'no habilitado para el tipo de sitio');
for (const x of [{ templates: 283 }, { templates: 9, installed: 4, profileOnly: 4, enabled: 4 }, { templates: 9, installed: 4, errors: 4 }, { templates: 9, installed: 4, enabled: 4 }]) {
    ok(!['operational', 'degraded'].includes(st(x)), `nunca «operativo» sin un agente ACTIVO (${JSON.stringify(x)})`);
}
eq(S.ACTIVE_STATES, ['active', 'running'], 'activo = acepta tareas (Activo o Ejecutando)');

const insts = [
    { id: 'i1', team: 'proyectos', teams: ['proyectos', 'eventos'], enabled: true, state: 'active', scopeType: 'site', siteId: 'A' },
    { id: 'i2', team: 'proyectos', teams: ['proyectos'], enabled: true, state: 'profile_only', scopeType: 'site', siteId: 'B' },
    { id: 'i3', team: 'eventos', enabled: false, state: 'configured', scopeType: 'site', siteId: 'A' },
    { id: 'i4', team: 'tecnologia', enabled: true, state: 'error', scopeType: 'platform', siteId: null },
];
const agg = S.aggregateInstallations(insts);
eq(agg.proyectos, { installed: 2, enabled: 2, active: 1, profileOnly: 1, errors: 0, disabled: 0, sites: 2 }, 'Proyectos: dos instalaciones en dos sitios');
eq(agg.eventos, { installed: 2, enabled: 1, active: 1, profileOnly: 0, errors: 0, disabled: 0, sites: 1 }, 'Eventos cuenta al agente ASOCIADO sin copiarlo');
eq(agg.tecnologia.sites, 0, 'la plataforma no cuenta como sitio');

// ── 5. Tarjetas: alcance y visibilidad ───────────────────────────────
const teamsCfg = S.effectiveTeams({ membresia: { visible: false } });
const tpl = { proyectos: { available: 16, published: 16 }, eventos: { available: 0, published: 0 }, membresia: { available: 2, published: 2 } };
const platformCards = S.buildTeamCards({ teams: teamsCfg, templates: tpl, installations: insts, activity: { proyectos: { pendingTasks: 3, runs30d: 7 } } });
eq(platformCards.length, 8, 'la plataforma ve los ocho (también los ocultos)');
const pc = platformCards.find(c => c.key === 'proyectos');
ok(pc.templates === 16 && pc.installed === 2 && pc.active === 1 && pc.profileOnly === 1 && pc.pendingTasks === 3 && pc.runs30d === 7 && pc.status.key === 'operational', 'Proyectos: plantillas, instalados, activos, solo perfil, tareas y ejecuciones distintos');
ok(platformCards.find(c => c.key === 'membresia').visible === false, 'el oculto viene marcado');
const allows = (t) => ['proyectos', 'eventos', 'membresia'].includes(t);
const siteCards = S.buildTeamCards({ teams: teamsCfg, templates: tpl, installations: insts.filter(i => i.siteId === 'A'), allowsTeam: allows, platform: false });
eq(siteCards.map(c => c.key), ['proyectos', 'eventos'], 'un sitio NO ve equipos ocultos ni los que su tipo de sitio no trabaja');

// ── 6. Paginación y estado de una fila ───────────────────────────────
eq(S.pageParams({}), { page: 1, pageSize: 24, offset: 0 }, 'página por omisión');
eq(S.pageParams({ page: '3', pageSize: '10' }), { page: 3, pageSize: 10, offset: 20 }, 'página 3 de 10');
eq(S.pageParams({ page: -4, pageSize: 5000 }).pageSize, 60, 'tope de tamaño de página');
eq(S.bestState(['configured', 'error', 'active']), 'active', 'la fila muestra el estado más vivo');
eq(S.bestState([]), 'available', 'sin instalaciones: Disponible');

// ── 7. Dirección IA por equipos ──────────────────────────────────────
ok(D.QUICK_ACTIONS.every(q => Array.isArray(q.teams) && q.teams.length), 'cada acceso rápido dice qué equipos intervienen');
ok(D.capabilitiesForTeams(['eventos']).includes('registrations') && !D.capabilitiesForTeams(['eventos']).includes('finance'), 'capacidades de Eventos');
eq(D.capabilitiesForTeams(['inventado']), [], 'un equipo inventado no habilita nada');

const FAIR = 'Analiza las postulaciones de la Feria de Proyectos, identifica información incompleta y prepara un informe para el comité organizador.';
const fair = D.interpretObjective(FAIR, { teams: ['proyectos', 'analitica', 'comunicaciones', 'direccion'] });
ok(fair.capabilities.includes('fair_review'), 'ejemplo Feria: con los equipos elegidos, el Director toma la revisión de postulaciones');
eq(fair.teams, ['proyectos', 'analitica', 'comunicaciones', 'direccion'], 'y recuerda los equipos elegidos');
const wrong = D.interpretObjective(FAIR, { teams: ['finanzas'] });
ok(wrong.capabilities.length === 0 && wrong.excluded.includes('fair_review') && wrong.clarify.some(c => /otros equipos/.test(c)), 'si lo pedido es de otros equipos: no hay plan, se explica y se pregunta');
const CONF = 'Prepara un diagnóstico de las inscripciones del evento, identifica registros pendientes de validación y propone una estrategia de comunicación.';
const conf = D.interpretObjective(CONF, { teams: ['eventos', 'analitica', 'comunicaciones', 'direccion'] });
ok(conf.capabilities.includes('registrations'), 'ejemplo Conferencia: Eventos revisa las inscripciones');
ok(conf.capabilities.every(k => D.capabilityTeams(D.capabilityByKey(k)).some(t => conf.teams.includes(t))), 'sólo capacidades de los equipos elegidos');
const none = D.interpretObjective('Necesito algo para la reunión de mañana con la junta.', { teams: ['eventos'] });
ok(none.capabilities.length === 0 && none.clarify.some(c => /Con los equipos elegidos puedo/.test(c)), 'sin coincidencia: preguntas con lo que esos equipos pueden hacer, nunca un plan inventado');
eq(D.interpretObjective(FAIR).teams, [], 'sin equipos elegidos, el comportamiento de siempre');

const instD = [
    { id: 'off', team: 'eventos', enabled: false, state: 'configured', templateName: 'Apagado' },
    { id: 'sec', team: 'proyectos', teams: ['proyectos', 'eventos'], enabled: true, state: 'active', templateName: 'Analista documental' },
    { id: 'dis', team: 'tecnologia', teams: ['tecnologia', 'eventos'], enabled: true, state: 'disabled', templateName: 'Deshabilitado por política' },
];
eq(D.pickTeamAgent(instD, 'eventos')?.id, 'sec', 'sin agente principal encendido, redacta uno ASOCIADO al equipo');
eq(D.pickTeamAgent([...instD, { id: 'pri', team: 'eventos', enabled: true, state: 'profile_only', templateName: 'Eventos' }], 'eventos')?.id, 'pri', 'el del equipo principal va primero');
eq(D.pickTeamAgent([instD[2]], 'eventos'), null, 'asociar no rescata a uno deshabilitado por su política');
const plan = D.buildPlan({
    interpretation: conf, site: { id: 'A', name: 'Conferencia' }, siteType: 'district', policy: { enabled: true, allowedTeams: [] },
    director: { installed: true, state: 'active' }, installations: instD, workflows: (await import(`${REPO}/server/lib/agentRuntimeSpec.js`)).WORKFLOWS,
    tools: (await import(`${REPO}/server/lib/agentRuntimeSpec.js`)).TOOL_CATALOG,
});
eq(plan.requestedTeams, ['eventos', 'analitica', 'comunicaciones', 'direccion'], 'el plan guarda los equipos elegidos');
ok(plan.steps.find(s => s.team === 'eventos')?.agent?.installationId === 'sec', 'el paso de Eventos lo redacta el agente asociado, sin copiarlo');
ok(plan.specialists.find(s => s.team === 'eventos').installed.some(i => i.installationId === 'sec'), 'y figura entre los instalados del equipo');

// ── 8. Rutas, esquema, auditoría y pantalla ──────────────────────────
const routes = read('server/routes/agentCenter.js');
ok(/router\.get\('\/teams', wrap\(/.test(routes), 'GET /teams: para ambos alcances');
ok(/router\.get\('\/teams\/:key', wrap\(/.test(routes), 'GET /teams/:key: para ambos alcances');
ok(/router\.put\('\/teams\/:key', platformOnly,/.test(routes), 'configurar un equipo es de la plataforma');
ok(/router\.post\('\/teams\/:key\/members', platformOnly,/.test(routes), 'asociar agentes es de la plataforma');
ok(routes.indexOf("router.get('/teams',") < routes.indexOf("router.get('/teams/:key'"), 'la literal antes que la paramétrica');
ok(/const teamScope = \(req, requested\) => \{\s*const siteId = siteOf\(req, requested\);/.test(routes), 'el alcance de las vistas de equipos sale de siteOf (la sesión para un sitio)');
ok(/createPlan\(\{[^}]*teams: Array\.isArray\(b\.teams\)/.test(routes), 'el Director recibe los equipos de la iniciativa');
const store = read('server/lib/agentTeamsStore.js');
ok(/if \(!ctx\.platform && \(!team\.visible \|\| !ctx\.allowsTeam\(team\.key\)\)\) throw new RegistryError\('Equipo no encontrado\.', 404\)/.test(store), 'un sitio recibe 404 en un equipo oculto o no habilitado');
ok(!/req\.(body|query)/.test(store) && !/args\.siteId|input\.siteId/.test(store), 'el store no lee el sitio de la petición');
ok(/instScope = ` AND i\."siteId" = \$\$\{params\.length\}`/.test(store), 'la vista de un sitio filtra sus instalaciones por SU sitio');
ok(/t\.team = ANY\(\$\$\{p \+ 2\}::text\[\]\)/.test(store), '«disponible para el sitio» mira el equipo PRINCIPAL (asociar no amplía)');
const schema = read('server/lib/ensureAgentCenterSchema.js');
ok(/AgentTeamMember: \[\]/.test(schema) && /CREATE TABLE IF NOT EXISTS "AgentTeamMember"/.test(schema), 'la tabla de pertenencia está en el esquema y en OWNED_COLUMNS');
ok(/PRIMARY KEY \("templateId", team\)/.test(schema), 'un agente se asocia UNA vez por equipo');
ok(read('CLAUDE.md').includes('`AgentTeamMember`') && read('scripts/db-push-guard.mjs').includes('AgentTeamMember'), 'protegida: CLAUDE.md y el guardián de db:push');
ok(AUDIT_ACTIONS.team_config_changed && AUDIT_ACTIONS.team_members_changed, 'auditoría de equipos');
const runtime = read('server/lib/agentRuntimeStore.js');
ok(/ORDER BY \(t\.team = \$1\) DESC/.test(runtime) && /\['disabled', 'installed', 'available'\]\.includes\(state\.state\)/.test(runtime), 'el runtime prefiere el equipo principal y descarta instalaciones deshabilitadas');
ok(/messages: \[\{ role: 'user', content: `\$\{prompt\}/.test(runtime) && /tools: \[\], maxTokens/.test(runtime), 'el resumen de un workflow se redacta SIN herramientas');

const overview = read('src/pages/admin/agentCenter/CommandOverview.tsx');
const siteOv = read('src/pages/admin/agentCenter/SiteOverview.tsx');
ok(overview.includes('<TeamCards') && siteOv.includes('<TeamCards'), 'el Resumen (plataforma y sitio) muestra las tarjetas de equipos');
ok(!/onClick=\{\(\) => onNavigate\('agentes'\)\}/.test(overview), 'una tarjeta ya no lleva a «Agentes» sin filtro');
const cards = read('src/pages/admin/agentCenter/TeamCards.tsx');
ok(cards.includes('Explora los equipos especializados de inteligencia artificial que apoyan la gestión de clubes, distritos, eventos, proyectos y programas de Rotary'), 'la descripción pedida');
ok(cards.includes('Explorar equipo'), 'acción «Explorar equipo»');
ok(/plantillas/.test(cards) && /instalados/.test(cards) && /activos/.test(cards), 'distingue plantillas, instalados y activos');
const detail = read('src/pages/admin/agentCenter/TeamDetail.tsx');
ok(detail.includes('TemplateEditor') && detail.includes('/installations/') && detail.includes("'/installations'"), 'la vista de equipo reutiliza la ficha, la instalación y la asignación de tareas');
ok(/pageSize/.test(detail) && /page/.test(detail), 'el registro del equipo va paginado');
ok(read('src/pages/admin/agentCenter/DirectorTab.tsx').includes('teams: selTeams'), 'la Dirección IA manda los equipos elegidos');

console.log(`✓ test-agents-teams: ${n} comprobaciones`);
