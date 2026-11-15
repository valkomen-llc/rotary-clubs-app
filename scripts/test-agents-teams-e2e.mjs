#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// Centro de Equipos de IA — de punta a punta (v4.1331.0)
// DATABASE_URL=postgres://…@localhost/vacia npm run test:agents:teams:e2e
//
// Base LOCAL y VACÍA, modelo SIMULADO, el catálogo REAL (los 283 agentes del
// repositorio). Comprueba:
//   · conteos reales: plantillas ≠ instalados ≠ activos, por alcance;
//   · un agente en varios equipos SIN copias, y que eso no le da permisos;
//   · el registro paginado de un equipo y sus filtros;
//   · la Dirección IA por equipos y el runtime que redacta con un asociado;
//   · el aislamiento entre sitios por HTTP con tokens reales.
// ════════════════════════════════════════════════════════════════════
import assert from 'node:assert/strict';

const url = process.env.DATABASE_URL || '';
if (!url) { console.error('Falta DATABASE_URL'); process.exit(1); }
if (!/@(localhost|127\.0\.0\.1)(:\d+)?\//.test(url)) { console.error('DATABASE_URL parece de un entorno real. Abortando.'); process.exit(1); }

const REPO = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const { default: db } = await import(`${REPO}/server/lib/db.js`);
const { OWNED_COLUMNS } = await import(`${REPO}/server/lib/ensureAgentCenterSchema.js`);

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); n++; };
const rejects = async (p, re, m) => { await assert.rejects(p, re, m); n++; };
const admin = { id: 'admin-1', role: 'administrator', email: 'admin@x.org' };

// ── Base mínima ──────────────────────────────────────────────────────
for (const t of [...Object.keys(OWNED_COLUMNS), 'AiUsageEvent', 'AiUsageDaily', 'AiModelPrice', 'Agent', 'Club', 'User', 'ClubMember', 'Post', 'Project', 'CalendarEvent']) await db.query(`DROP TABLE IF EXISTS "${t}" CASCADE`);
await db.query(`CREATE TABLE "Club" (id TEXT PRIMARY KEY, name TEXT, type TEXT DEFAULT 'club', subdomain TEXT, domain TEXT, logo TEXT, status TEXT DEFAULT 'active', district TEXT, city TEXT, country TEXT, "districtId" TEXT)`);
await db.query(`CREATE TABLE "User" (id TEXT PRIMARY KEY, name TEXT, email TEXT, role TEXT, "clubId" TEXT)`);
await db.query(`CREATE TABLE "ClubMember" (id TEXT PRIMARY KEY, name TEXT, image TEXT, description TEXT, "isBoard" BOOLEAN DEFAULT false, "boardRole" TEXT, "isHonorary" BOOLEAN DEFAULT false, "isActive" BOOLEAN DEFAULT true, "clubId" TEXT, "createdAt" TIMESTAMPTZ DEFAULT NOW(), "updatedAt" TIMESTAMPTZ DEFAULT NOW())`);
await db.query(`CREATE TABLE "Agent" (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), "clubId" UUID, name VARCHAR(100) NOT NULL, role VARCHAR(200) NOT NULL, category VARCHAR(50), description TEXT, "systemPrompt" TEXT, "aiModel" VARCHAR(50) DEFAULT 'gpt-4', "avatarSeed" VARCHAR(50), "avatarColor" VARCHAR(20), capabilities TEXT[] DEFAULT ARRAY[]::TEXT[], active BOOLEAN DEFAULT true, "order" INT DEFAULT 0, greeting TEXT, "createdAt" TIMESTAMPTZ DEFAULT NOW(), "updatedAt" TIMESTAMPTZ DEFAULT NOW())`);
const A = 'site-a'; const B = 'site-b';
await db.query(`INSERT INTO "Club" (id, name, type) VALUES ($1, 'Club Rotario Alfa', 'club'), ($2, 'Club Rotario Beta', 'club')`, [A, B]);
await db.query(`INSERT INTO "User" (id, name, email, role, "clubId") VALUES ('uA', 'Resp Alfa', 'a@x.org', 'club_admin', $1), ('uB', 'Resp Beta', 'b@x.org', 'club_admin', $2)`, [A, B]);
await db.query(`INSERT INTO "ClubMember" (id, name, "clubId", "isBoard") VALUES ('m1', 'Socia Uno', $1, true), ('m2', 'Socio Dos', $1, false)`, [A]);

const R = await import(`${REPO}/server/lib/agentRegistryStore.js`);
const RT = await import(`${REPO}/server/lib/agentRuntimeStore.js`);
const AC = await import(`${REPO}/server/lib/agencyCatalogStore.js`);
const TM = await import(`${REPO}/server/lib/agentTeamsStore.js`);
const DIR = await import(`${REPO}/server/lib/agentDirectorStore.js`);
const { invalidateTeamConfig } = await import(`${REPO}/server/lib/agentTeamMembership.js`);
invalidateTeamConfig();

const calls = [];
const gateway = async (req) => { calls.push(req); return { text: `Redacción simulada (${calls.length}).`, toolCalls: [], usage: { inputTokens: 100, outputTokens: 50 }, model: 'mock-model', provider: 'mock' }; };

// ── 1. El catálogo real ──────────────────────────────────────────────
await AC.agencyCatalogOnce(admin);
const total = Number((await db.query(`SELECT COUNT(*) FROM "AgentTemplate"`)).rows[0].count);
eq(total, 283, 'el catálogo real: 283 agentes');
const byTeam = Object.fromEntries((await db.query(`SELECT team, COUNT(*)::int AS n FROM "AgentTemplate" WHERE status = 'published' GROUP BY team`)).rows.map(r => [r.team, r.n]));
const P = { platform: true, siteId: null };
let sum = await TM.teamsSummary(P);
eq(sum.teams.length, 8, 'el Resumen muestra los ocho equipos');
ok(sum.teams.every(c => c.templates === (byTeam[c.key] || 0)), 'plantillas por equipo = publicadas en la base (calculadas, no fijas)');
eq(sum.teams.reduce((a, c) => a + c.templates, 0), 283, 'sin asociaciones, las plantillas suman el catálogo');
ok(sum.teams.every(c => c.installed === 0 && c.active === 0), 'sin instalaciones: 0 instalados y 0 activos');
ok(sum.teams.every(c => !['operational', 'degraded'].includes(c.status.key)), 'ningún equipo se pinta operativo con 0 instalaciones');
eq(sum.teams.find(c => c.key === 'eventos').status.key, (byTeam.eventos || 0) ? 'not_installed' : 'empty', 'Eventos con 0 plantillas: «Sin plantillas»');
eq(sum.teams.find(c => c.key === 'proyectos').status.key, 'not_installed', 'Proyectos: «Sin instalaciones»');

// ── 2. Instalado ≠ activo ───────────────────────────────────────────
const X = (await db.query(`SELECT id, draft->>'name' AS name FROM "AgentTemplate" WHERE team = 'proyectos' AND status = 'published' ORDER BY key LIMIT 1`)).rows[0];
const instX = await R.createInstallation({ templateId: X.id, scopeType: 'site', siteId: A, enabled: true, responsibleUserId: 'uA' }, admin);
sum = await TM.teamsSummary(P);
let pc = sum.teams.find(c => c.key === 'proyectos');
ok(pc.installed === 1 && pc.active === 0 && pc.profileOnly === 1 && pc.status.key === 'profile_only', 'encendido sin herramientas: instalado, NO activo, «Solo perfil»');
await RT.setGrant(instX.id, 'site_context', 'read', admin);
sum = await TM.teamsSummary(P);
pc = sum.teams.find(c => c.key === 'proyectos');
ok(pc.installed === 1 && pc.active === 1 && pc.sites === 1 && pc.status.key === 'operational', 'con una herramienta concedida: activo y «Operativo»');

// ── 3. Varios equipos, sin copias ────────────────────────────────────
const before = byTeam.eventos || 0;
const add = await TM.setTeamMembers('eventos', { add: [X.id] }, admin);
eq(add.added, 1, 'el agente se asocia a Eventos');
eq(Number((await db.query(`SELECT COUNT(*) FROM "AgentTemplate"`)).rows[0].count), 283, 'NO se copia: el catálogo sigue con 283');
eq(Number((await db.query(`SELECT COUNT(*) FROM "AgentInstallation"`)).rows[0].count), 1, 'ni se duplica su instalación');
sum = await TM.teamsSummary(P);
const ev = sum.teams.find(c => c.key === 'eventos');
ok(ev.templates === before + 1 && ev.installed === 1 && ev.active === 1, 'Eventos cuenta al agente asociado y su instalación activa');
ok((await R.listTemplates({ team: 'eventos' })).some(t => t.id === X.id), '«Agentes» filtrado por Eventos también lo muestra');
ok((await R.listInstallations({ siteId: A }))[0].teams.join() === 'proyectos,eventos', 'la instalación conoce sus equipos, el principal primero');
eq((await TM.setTeamMembers('proyectos', { add: [X.id] }, admin)).alreadyPrimary, 1, 'no se asocia a su propio equipo principal');
eq((await TM.setTeamMembers('eventos', { add: ['no-existe'] }, admin)).unknown, 1, 'un id inexistente no crea nada');
eq((await TM.setTeamMembers('eventos', { add: [X.id] }, admin)).added, 0, 'asociar dos veces no duplica');
ok((await db.query(`SELECT 1 FROM "AgentAuditLog" WHERE action = 'team_members_changed' AND "entityId" = 'eventos'`)).rows.length === 1, 'queda en la auditoría');
await rejects(TM.setTeamMembers('inventado', { add: [X.id] }, admin), /Equipo no encontrado/, 'un equipo inventado no existe');

// ── 4. Asociar NO da permisos ────────────────────────────────────────
const Y = (await db.query(`SELECT id FROM "AgentTemplate" WHERE team = 'tecnologia' AND status = 'published' ORDER BY key LIMIT 1`)).rows[0];
await TM.setTeamMembers('eventos', { add: [Y.id] }, admin);
await R.saveSiteTypePolicy('club', { enabled: true, allowedTeams: ['direccion', 'comunicaciones', 'proyectos', 'eventos', 'membresia', 'analitica'] }, admin);
await rejects(R.createInstallation({ templateId: Y.id, scopeType: 'site', siteId: A }, admin), /equipo no está permitido/, 'un agente de Tecnología asociado a Eventos NO se instala donde Tecnología no está permitido');
const siteA = { platform: false, siteId: A };
let sa = await TM.teamsSummary(siteA);
ok(!sa.teams.some(c => c.key === 'tecnologia' || c.key === 'finanzas'), 'el sitio no ve los equipos que su tipo de sitio no trabaja');
eq(sa.teams.find(c => c.key === 'eventos').templates, before + 1, '«disponibles» de Eventos para el sitio no cuenta al de Tecnología asociado');
ok(sa.teams.find(c => c.key === 'proyectos').installed === 1 && sa.teams.find(c => c.key === 'proyectos').active === 1, 'el sitio A ve su agente activo');
const sb = await TM.teamsSummary({ platform: false, siteId: B });
ok(sb.teams.every(c => c.installed === 0 && c.active === 0), 'el sitio B no cuenta lo instalado en A');

// ── 5. Categorías asociadas y configuración ──────────────────────────
const research = Number((await db.query(`SELECT COUNT(*) FROM "AgentTemplate" WHERE "sourceRef"->>'division' = 'research' AND status = 'published'`)).rows[0].count);
ok(research > 0, 'hay agentes de la categoría Investigación');
await rejects(TM.saveTeamConfig('proyectos', { icon: 'bomba' }, admin), /Ícono no válido/, 'configuración inválida → 400');
const saved = await TM.saveTeamConfig('proyectos', { label: 'Proyectos de servicio', divisions: ['research'] }, admin);
ok(saved.label === 'Proyectos de servicio' && saved.key === 'proyectos', 'el nombre cambia; la clave no');
sum = await TM.teamsSummary(P);
eq(sum.teams.find(c => c.key === 'proyectos').templates, byTeam.proyectos + research, 'Proyectos suma los de Investigación por su categoría, sin copiarlos');
eq(sum.teams.find(c => c.key === 'analitica').templates, byTeam.analitica, 'y Analítica (su equipo principal) los conserva');
const R1 = (await db.query(`SELECT draft->>'name' AS name FROM "AgentTemplate" WHERE "sourceRef"->>'division' = 'research' ORDER BY key LIMIT 1`)).rows[0];
const dq = await TM.teamDetail('proyectos', P, { q: R1.name });
ok(dq.agents.some(a => a.name === R1.name && a.membership === 'division' && a.primaryTeam === 'analitica'), 'en el equipo aparece «por su categoría de origen», con su equipo principal');
await TM.saveTeamConfig('membresia', { visible: false }, admin);

// ── 6. El registro paginado de un equipo ─────────────────────────────
const d1 = await TM.teamDetail('proyectos', P, { page: 1, pageSize: 10 });
ok(d1.agents.length === 10 && d1.total === byTeam.proyectos + research, 'página de 10, total del equipo');
eq(d1.agents[0].id, X.id, 'lo instalado primero');
ok(d1.agents[0].installations[0].siteName === 'Club Rotario Alfa' && d1.agents[0].state === 'active' && d1.agents[0].tools.join() === 'site_context', 'con su sitio, su estado y sus herramientas autorizadas');
ok(d1.counts.active === 1 && d1.capabilities.some(c => c.key === 'fair_review') && d1.workflows.length > 0, 'indicadores, capacidades del Director y workflows del equipo');
const d2 = await TM.teamDetail('proyectos', P, { page: 2, pageSize: 10 });
ok(d2.agents.every(a => !d1.agents.some(b => b.id === a.id)), 'la página 2 trae otros agentes');
eq((await TM.teamDetail('proyectos', P, { view: 'installed' })).total, 1, 'filtro «Instalados»');
eq((await TM.teamDetail('proyectos', P, { view: 'not_installed' })).total, d1.total - 1, 'filtro «Sin instalar»');
eq((await TM.teamDetail('proyectos', P, { pageSize: 5000 })).pageSize, 60, 'tope de página');

// ── 7. Dirección IA por equipos ──────────────────────────────────────
const CONF = 'Prepara un diagnóstico de las inscripciones del evento, identifica registros pendientes de validación y propone una estrategia de comunicación.';
const pl = await DIR.createPlan({ siteId: A, objective: CONF, teams: ['eventos', 'analitica', 'comunicaciones', 'direccion'] }, admin, { gateway });
eq(pl.plan.requestedTeams, ['eventos', 'analitica', 'comunicaciones', 'direccion'], 'el plan guarda los equipos de la iniciativa');
const evStep = pl.plan.steps.find(s => s.team === 'eventos');
ok(evStep && evStep.agent?.installationId === instX.id, 'el paso de Eventos lo redacta el agente ASOCIADO (activo en el sitio), sin copiarlo');
ok(pl.status === 'draft' && pl.plan.blockers.some(b => /Director no está instalado/.test(b)), 'sin Director instalado, el plan queda en borrador (nada se ejecuta solo)');
const FAIR = 'Analiza las postulaciones de la Feria de Proyectos, identifica información incompleta y prepara un informe para el comité organizador.';
const pw = await DIR.createPlan({ siteId: A, objective: FAIR, teams: ['finanzas'] }, admin, { gateway });
ok(pw.plan.steps.length === 0 && pw.plan.clarify.some(c => /otros equipos/.test(c)), 'si lo pedido es de otros equipos, no hay plan: se explica');

// ── 8. El runtime redacta con un agente asociado ─────────────────────
const noAgent = await RT.runWorkflow({ workflowKey: 'membership_review', siteId: A, user: admin, gateway });
ok(!noAgent.run.aiSummary && /instala y enciende/.test(noAgent.run.aiNote || ''), 'Membresía sin agentes: hallazgos sin resumen con IA');
await TM.setTeamMembers('membresia', { add: [X.id] }, admin);
const withAgent = await RT.runWorkflow({ workflowKey: 'membership_review', siteId: A, user: admin, gateway });
ok(/Redacción simulada/.test(withAgent.run.aiSummary || ''), 'con un agente asociado a Membresía, el resumen lo redacta él (aunque el equipo esté oculto: ocultar es presentación)');
ok(calls.at(-1).tools.length === 0, 'y lo redacta SIN herramientas: asociar no da permisos');
ok(!JSON.stringify(calls.at(-1).messages).includes('Socia Uno'), 'sin nombres de socios');

// ── 9. Aislamiento por HTTP ──────────────────────────────────────────
const express = (await import('express')).default;
const jwt = (await import('jsonwebtoken')).default;
const { JWT_SECRET } = await import(`${REPO}/server/middleware/auth.js`);
const router = (await import(`${REPO}/server/routes/agentCenter.js`)).default;
const app = express(); app.use(express.json()); app.use('/api/agent-center', router);
const server = await new Promise(r => { const s = app.listen(0, () => r(s)); });
const port = server.address().port;
const http = async (method, path, user, body) => {
    const res = await fetch(`http://127.0.0.1:${port}/api/agent-center${path}`, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt.sign(user, JWT_SECRET)}` }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: res.status, body: await res.json().catch(() => null) };
};
const uA = { id: 'uA', role: 'club_admin', clubId: A };
const uB = { id: 'uB', role: 'club_admin', clubId: B };
try {
    const ga = await http('GET', '/teams', uA);
    ok(ga.status === 200 && ga.body.scope === 'site' && ga.body.site.id === A, 'un sitio recibe SUS equipos');
    ok(!ga.body.teams.some(c => c.key === 'membresia'), 'sin el equipo oculto');
    ok((await http('GET', `/teams?siteId=${B}`, uA)).body.site.id === A, 'pedir otro sitio devuelve el propio (el sitio sale de la sesión)');
    const xb = await http('GET', `/teams/proyectos?q=${encodeURIComponent(X.name)}`, uB);
    const rowB = xb.body.agents.find(a => a.id === X.id);
    ok(xb.status === 200 && rowB && rowB.installCount === 0 && rowB.installations.length === 0 && rowB.state === 'available', 'el sitio B ve el agente disponible, SIN la instalación de A');
    ok(!JSON.stringify(xb.body).includes('Club Rotario Alfa'), 'ni el nombre del otro sitio');
    const xa = await http('GET', `/teams/proyectos?q=${encodeURIComponent(X.name)}`, uA);
    ok(xa.body.agents.find(a => a.id === X.id).installations.length === 1, 'el sitio A ve su propia instalación');
    eq((await http('GET', '/teams/tecnologia', uA)).status, 404, 'un equipo no habilitado para el sitio → 404');
    eq((await http('GET', '/teams/membresia', uA)).status, 404, 'un equipo oculto → 404 para el sitio');
    eq((await http('GET', '/teams/membresia', admin)).status, 200, 'la plataforma sí lo ve');
    eq((await http('GET', '/teams/inventado', admin)).status, 404, 'un equipo inventado → 404');
    eq((await http('PUT', '/teams/proyectos', uA, { label: 'Tomado' })).status, 403, 'configurar un equipo es de la plataforma');
    eq((await http('POST', '/teams/proyectos/members', uA, { add: [Y.id] })).status, 403, 'asociar agentes es de la plataforma');
    eq((await http('POST', `/installations/${instX.id}/run`, uB, { goal: 'Haz algo en el sitio de otro' })).status, 404, '«Asignar tarea» a la instalación de otro sitio → 404');
    const pv = await http('GET', `/teams?siteId=${B}`, admin);
    ok(pv.status === 200 && pv.body.scope === 'site' && pv.body.site.id === B, 'la plataforma puede ver la perspectiva de un sitio');
    const meta = await http('GET', '/meta', admin);
    ok(meta.body.teams.find(t => t.key === 'proyectos').label === 'Proyectos de servicio', '/meta trae el nombre configurado');
    const pd = await http('GET', '/teams/proyectos?pageSize=5&page=1', admin);
    ok(pd.status === 200 && pd.body.agents.length === 5 && !JSON.stringify(pd.body).includes('systemPrompt'), 'el detalle por HTTP va paginado y sin el prompt');
} finally { server.close(); }

console.log(`✓ test-agents-teams-e2e: ${n} comprobaciones`);
await db.pool?.end?.().catch(() => {});
process.exit(0);
