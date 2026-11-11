#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// AI Agent Command Center — Fases 5–6 de punta a punta (v4.1319.0)
// DATABASE_URL=postgres://…@localhost/vacia npm run test:agents:scale:e2e
//
// Base LOCAL y VACÍA, modelo SIMULADO. Prueba: el workflow de Membresía
// (sólo cifras agregadas), las opiniones por hallazgo, las métricas de un
// piloto y el constructor visual (validar, publicar, programar, ejecutar,
// detenerse por condición, aprobación humana, alcance por sitio, archivar).
// ════════════════════════════════════════════════════════════════════
import assert from 'node:assert/strict';

const url = process.env.DATABASE_URL || '';
if (!url) { console.error('Falta DATABASE_URL'); process.exit(1); }
if (!/@(localhost|127\.0\.0\.1)(:\d+)?\//.test(url)) { console.error('DATABASE_URL parece de un entorno real. Abortando.'); process.exit(1); }

const REPO = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const { default: db } = await import(`${REPO}/server/lib/db.js`);
const R = await import(`${REPO}/server/lib/agentRegistryStore.js`);
const RT = await import(`${REPO}/server/lib/agentRuntimeStore.js`);
const SC = await import(`${REPO}/server/lib/agentScaleStore.js`);
let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); n++; };
const rejects = async (p, re, m) => { await assert.rejects(p, re, m); n++; };
const admin = { id: 'admin-1', role: 'administrator' };
const PLATFORM = { platform: true, siteId: null };

// ── Base mínima ──────────────────────────────────────────────────────
const drop = ['AgentPilot', 'AgentFeedback', 'AgentCustomWorkflow', 'AgentCustomWorkflowVersion', 'AgentAlert', 'AgentRollout', 'AgentRolloutTarget', 'AgentTemplate', 'AgentTemplateVersion', 'AgentSkill', 'AgentInstallation', 'AgentAuditLog', 'AgentSiteTypePolicy', 'AgentSetting', 'AgentToolGrant', 'AgentTask', 'AgentRun', 'AgentRunStep', 'AgentApproval', 'AgentWorkflowRun', 'AgentSchedule', 'AgentEvent', 'AiUsageEvent', 'AiUsageDaily', 'AiModelPrice', 'Agent', 'Club', 'User', 'Post', 'Project', 'CalendarEvent', 'ClubMember', 'SeoAudit', 'SeoIssue'];
for (const t of drop) await db.query(`DROP TABLE IF EXISTS "${t}" CASCADE`);
await db.query(`CREATE TABLE "Club" (id TEXT PRIMARY KEY, name TEXT, type TEXT DEFAULT 'club', subdomain TEXT, domain TEXT, logo TEXT, status TEXT DEFAULT 'active', district TEXT, city TEXT, country TEXT, "districtId" TEXT)`);
await db.query(`CREATE TABLE "User" (id TEXT PRIMARY KEY, name TEXT, email TEXT, role TEXT, "clubId" TEXT)`);
await db.query(`CREATE TABLE "Post" (id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text, title TEXT, content TEXT, published BOOLEAN DEFAULT false, "clubId" TEXT, category TEXT, "isAI" BOOLEAN DEFAULT false, "createdAt" TIMESTAMPTZ DEFAULT NOW(), "updatedAt" TIMESTAMPTZ DEFAULT NOW())`);
await db.query(`CREATE TABLE "Project" (id TEXT PRIMARY KEY, "clubId" TEXT)`);
await db.query(`CREATE TABLE "CalendarEvent" (id TEXT PRIMARY KEY, title TEXT, "startDate" TIMESTAMPTZ, "clubId" TEXT)`);
await db.query(`CREATE TABLE "ClubMember" (id TEXT PRIMARY KEY, name TEXT, image TEXT, description TEXT, "isBoard" BOOLEAN DEFAULT false, "boardRole" TEXT, "isHonorary" BOOLEAN DEFAULT false, "isActive" BOOLEAN DEFAULT true, "clubId" TEXT, "createdAt" TIMESTAMPTZ DEFAULT NOW(), "updatedAt" TIMESTAMPTZ DEFAULT NOW())`);
const A = 'club-a'; const B = 'club-b';
await db.query(`INSERT INTO "Club" (id, name, type) VALUES ($1, 'Club A', 'club'), ($2, 'Club B', 'club')`, [A, B]);
await db.query(`INSERT INTO "User" (id, name, email, role, "clubId") VALUES ('uA', 'Resp A', 'a@x.org', 'club_admin', $1), ('uB', 'Resp B', 'b@x.org', 'club_admin', $2)`, [A, B]);
// Club A: 6 socios — 1 de junta, 1 honorario, 3 bajas recientes, 1 alta reciente, casi todos sin foto.
await db.query(`INSERT INTO "ClubMember" (id, name, image, description, "isBoard", "boardRole", "isHonorary", "isActive", "clubId", "createdAt", "updatedAt") VALUES
  ('m1', 'Ana Secreta',   NULL, 'Médica',  true,  'Presidente', false, true,  $1, NOW() - INTERVAL '400 days', NOW() - INTERVAL '400 days'),
  ('m2', 'Beto Secreto',  NULL, '',        false, NULL,         true,  true,  $1, NOW() - INTERVAL '400 days', NOW() - INTERVAL '400 days'),
  ('m3', 'Carla Secreta', 'x.jpg', 'x',    false, NULL,         false, true,  $1, NOW() - INTERVAL '10 days',  NOW() - INTERVAL '10 days'),
  ('m4', 'Dani Secreto',  NULL, NULL,      false, NULL,         false, false, $1, NOW() - INTERVAL '500 days', NOW() - INTERVAL '20 days'),
  ('m5', 'Eva Secreta',   NULL, NULL,      false, NULL,         false, false, $1, NOW() - INTERVAL '500 days', NOW() - INTERVAL '30 days'),
  ('m6', 'Fede Secreto',  NULL, NULL,      false, NULL,         false, false, $1, NOW() - INTERVAL '500 days', NOW() - INTERVAL '40 days'),
  ('mB', 'Socio de B',    NULL, NULL,      false, NULL,         false, true,  $2, NOW(), NOW())`, [A, B]);

const calls = [];
let script = [];
const gateway = async (req) => {
    calls.push(req);
    const next = script.shift();
    if (typeof next === 'function') return next(req);
    return next || { text: 'Propuestas simuladas para la junta.', toolCalls: [], usage: { inputTokens: 80, outputTokens: 40 }, model: 'mock-model', provider: 'mock' };
};

// ── 1. Workflow 5: Membresía ─────────────────────────────────────────
eq((await RT.seedPilotTemplates(admin)).created, 8, 'las ocho plantillas piloto, con Membresía');
const tpl = async (key) => (await db.query(`SELECT id FROM "AgentTemplate" WHERE key = $1`, [key])).rows[0].id;
for (const k of ['pilot-membresia', 'pilot-comunicaciones']) await R.publishVersion(await tpl(k), 'v1', admin);
const install = async (key, site) => {
    const i = await R.createInstallation({ templateId: await tpl(key), scopeType: 'site', siteId: site }, admin);
    await RT.applyRequestedGrants(i.id, admin);
    await R.updateInstallation(i.id, { responsibleUserId: site === A ? 'uA' : 'uB', enabled: true }, admin);
    return i.id;
};
const iMem = await install('pilot-membresia', A);
await install('pilot-comunicaciones', A);
eq((await RT.listGrants(iMem)).map(g => `${g.tool}:${g.mode}`).sort(), ['membership_summary:read', 'site_context:read'], 'el agente de Membresía sólo lee');
const wm = await RT.runWorkflow({ workflowKey: 'membership_review', siteId: A, user: admin, gateway });
const mm = wm.run.report.metrics;
eq([mm.total, mm.active, mm.inactive, mm.board, mm.honorary, mm.newLast90, mm.deactivatedLast90], [6, 3, 3, 1, 1, 1, 3], 'cifras agregadas exactas, sólo del club A');
ok(wm.run.report.findings.some(f => f.area === 'tendencia') && wm.run.report.findings.some(f => f.area === 'perfil'), 'hallazgos: salen más de los que entran; perfiles sin foto');
ok(!/Secret/.test(JSON.stringify(wm.run.report)), 'el informe NO contiene ningún nombre');
ok(!/Secret/.test(JSON.stringify(calls.at(-1).messages)), 'al modelo no le llega ningún nombre');
eq(wm.run.aiSummary, 'Propuestas simuladas para la junta.', 'la IA propone acciones');
const listed = (await RT.listWorkflowRuns({ siteId: A })).find(r => r.id === wm.run.id);
eq(listed.findings, wm.run.report.findings.length, 'el listado cuenta hallazgos aunque sean una lista (antes fallaba el ::int)');

// ── 2. Opiniones por hallazgo ────────────────────────────────────────
const { findingsOf } = await import(`${REPO}/server/lib/agentScaleSpec.js`);
const refs = findingsOf(wm.run.report).map(f => f.ref);
ok(refs.length === wm.run.report.findings.length, 'cada hallazgo tiene su referencia');
await rejects(SC.saveFeedback(wm.run.id, { findingRef: refs[0], verdict: 'useful' }, { id: 'uB', role: 'club_admin', clubId: B }), /No puedes/, 'otro sitio no califica');
await rejects(SC.saveFeedback(wm.run.id, { findingRef: 'inventado', verdict: 'useful' }, admin), /no está en el informe/, 'sólo hallazgos reales');
await rejects(SC.saveFeedback(wm.run.id, { findingRef: refs[0], verdict: 'genial' }, admin), /desconocida/, 'calificación cerrada');
await SC.saveFeedback(wm.run.id, { findingRef: refs[0], verdict: 'useful' }, { id: 'uA', role: 'club_admin', clubId: A });
await SC.saveFeedback(wm.run.id, { findingRef: refs[0], verdict: 'false_positive', note: 'ya lo sabíamos' }, { id: 'uA', role: 'club_admin', clubId: A });
let fb = await SC.listFeedback(wm.run.id);
eq(fb.map(f => f.verdict), ['false_positive'], 'una opinión por hallazgo: la última manda');
await SC.saveFeedback(wm.run.id, { findingRef: refs[1], verdict: 'useful' }, admin);
await SC.saveFeedback(wm.run.id, { findingRef: 'run', verdict: 'useful' }, admin);
await SC.saveFeedback(wm.run.id, { findingRef: refs[0], verdict: 'clear' }, admin);
fb = await SC.listFeedback(wm.run.id);
eq(fb.map(f => f.verdict).sort(), ['useful', 'useful'], 'quitar una opinión; el informe completo también se califica');

// ── 3. El piloto y sus métricas ──────────────────────────────────────
await rejects(SC.savePilot({ name: 'P', siteIds: [A], workflowKeys: ['membership_review'] }, admin), /nombre/, 'nombre obligatorio');
await rejects(SC.savePilot({ name: 'Piloto', siteIds: ['nope'], workflowKeys: ['membership_review'] }, admin), /no existe/, 'sitios reales');
await rejects(SC.savePilot({ name: 'Piloto', siteIds: [A], workflowKeys: ['inventado'] }, admin), /desconocido/, 'workflows reales');
await (await import(`${REPO}/server/lib/aiUsage.js`)).ensureAiUsageSchema();
await db.query(`INSERT INTO "AiUsageEvent" ("siteId", feature, "costUsd", "createdAt") VALUES ($1, 'agents.workflow', 0.5, NOW()), ($1, 'news.assistant', 9, NOW()), ($2, 'agents.workflow', 7, NOW())`, [A, B]);
const pilot = await SC.savePilot({ name: 'Piloto Membresía D4281', siteIds: [A, B], workflowKeys: ['membership_review'], startsAt: new Date(Date.now() - 86400_000).toISOString(), goals: { minRated: 2, minutesPerFinding: 10 }, status: 'active' }, admin);
await RT.runWorkflow({ workflowKey: 'membership_review', siteId: B, user: admin, gateway });
const pr = await SC.getPilot(pilot.id);
eq([pr.metrics.runs, pr.metrics.rated], [2, 2], 'dos ejecuciones, dos opiniones');
eq(pr.metrics.usefulRate, 1, '100 % útiles');
eq(pr.metrics.estimatedMinutesSaved, 20, 'tiempo ahorrado = útiles × minutos por hallazgo');
ok(Math.abs(pr.metrics.costUsd - 7.5) < 0.001, 'costo: sólo lo de agentes de los sitios del piloto (no el asistente de noticias)');
eq(pr.verdict.status, 'pass', 'con las metas cumplidas, el piloto pasa');
eq(pr.bySite.map(s => s.siteId).sort(), [A, B], 'desglose por sitio');
eq(pr.byWorkflow[0].label, 'Membresía: participación y seguimiento', 'desglose por workflow con su nombre');
await rejects(SC.concludePilot(pilot.id, { decision: 'quizas' }, admin), /decisión/, 'la decisión es cerrada');
const done = await SC.concludePilot(pilot.id, { decision: 'scale', note: 'Escalar a todos los clubes' }, admin);
ok(done.status === 'finished' && done.conclusion.verdict.status === 'pass' && done.conclusion.metrics.runs === 2, 'concluir congela las métricas y el veredicto');
await rejects(SC.savePilot({ id: pilot.id, name: 'Otra cosa' }, admin), /terminó/, 'un piloto concluido no se edita');

// ── 4. Constructor visual ────────────────────────────────────────────
const siteA = { platform: false, siteId: A };
const siteB = { platform: false, siteId: B };
const cw = await SC.createCustomWorkflow({ name: 'Boletín de membresía', team: 'membresia', draft: { steps: [{ type: 'tool', tool: 'content_publish_news', args: {} }] } }, siteA, { id: 'uA', role: 'club_admin', clubId: A });
eq(cw.siteId, A, 'un sitio crea workflows SÓLO para sí mismo');
ok(!cw.validation.ok && /aprobación/.test(cw.validation.errors.join(' ')), 'una acción N3 directa no valida: va dentro de una aprobación');
await rejects(SC.publishCustomWorkflow(cw.id, '', siteA, admin), /No se puede publicar/, 'lo inválido no se publica');
await rejects(SC.getCustomWorkflow(cw.id, siteB), /no encontrado/, 'otro sitio no lo ve');
const draft = {
    trigger: { kind: 'schedule', cadence: 'weekly@1@08:00' },
    steps: [
        { type: 'tool', tool: 'membership_summary', label: 'Cifras' },
        { type: 'stop_if_empty', path: 'steps.1.findings', label: 'Si no hay hallazgos, terminar' },
        { type: 'agent', templateKey: 'pilot-comunicaciones', prompt: 'Redacta un boletín para la junta con estos hallazgos: {{steps.1.findings}}', label: 'Redactar' },
        { type: 'tool', tool: 'content_create_news_draft', args: { title: 'Boletín {{input.mes}}', content: '{{steps.3.text}}' }, label: 'Borrador' },
        { type: 'approval', tool: 'content_publish_news', args: { postId: '{{steps.4.draft.id}}' }, summary: 'Publicar el boletín de {{input.mes}}', label: 'Publicar' },
    ],
};
const saved = await SC.saveCustomDraft(cw.id, { draft }, siteA, { id: 'uA', role: 'club_admin', clubId: A });
eq(saved.validation, { ok: true, errors: [] }, 'el borrador válido');
const pub = await SC.publishCustomWorkflow(cw.id, 'v1', siteA, { id: 'uA', role: 'club_admin', clubId: A });
ok(pub.publishedVersion === 1 && pub.status === 'published', 'versión 1 publicada');
ok(pub.schedule && pub.schedule.workflowKey === `custom:${cw.id}` && pub.schedule.siteId === A && pub.schedule.cadence === 'weekly@1@08:00', 'con disparo programado y sitio propio, queda programado');
const BOLETIN = 'Boletín simulado para la junta: dos acciones de retención y una de invitación.';
script = [{ text: BOLETIN, toolCalls: [], usage: { inputTokens: 80, outputTokens: 40 }, model: 'mock-model', provider: 'mock' }];
const cr = await RT.runWorkflow({ workflowKey: `custom:${cw.id}`, siteId: A, input: { mes: 'noviembre' }, user: admin, gateway });
eq(cr.run.report.steps.map(s => [s.n, s.ok]), [[1, true], [2, true], [3, true], [4, true], [5, true]], 'los cinco pasos, en orden');
const postTitle = (await db.query(`SELECT title, published, content FROM "Post" WHERE "clubId" = $1`, [A])).rows[0];
ok(postTitle.title === 'Boletín noviembre' && postTitle.published === false && postTitle.content === BOLETIN, 'las plantillas {{…}} llevan la salida de un paso al siguiente; la noticia queda en BORRADOR');
const ap = (await RT.listApprovals({ siteId: A })).find(a => a.id === cr.run.report.approvals[0]);
ok(ap && ap.tool === 'content_publish_news' && ap.summary === 'Publicar el boletín de noviembre' && ap.status === 'pending', 'publicar espera a una persona');
ok(/Secret/.test(JSON.stringify(cr.run.report)) === false, 'tampoco aquí viaja ningún nombre');
// Condición: sin hallazgos, se detiene.
await db.query(`UPDATE "ClubMember" SET image = 'y.jpg', "isActive" = true, "updatedAt" = NOW() - INTERVAL '200 days' WHERE "clubId" = $1`, [A]);
const before = calls.length;
const cr2 = await RT.runWorkflow({ workflowKey: `custom:${cw.id}`, siteId: A, input: {}, user: admin, gateway });
ok(cr2.run.report.stoppedAt === 2 && cr2.run.report.steps.length === 2 && calls.length === before, 'sin hallazgos se detiene en la condición y no llama al modelo');
// Alcance.
await rejects(RT.runWorkflow({ workflowKey: `custom:${cw.id}`, siteId: B, user: admin, gateway }), /otro sitio/, 'un workflow de un sitio no corre en otro');
// Un agente no instalado: falla con el paso y deja lo hecho.
const shared = await SC.createCustomWorkflow({ name: 'Compartido', team: 'membresia', draft: { steps: [{ type: 'tool', tool: 'membership_summary' }, { type: 'agent', templateKey: 'pilot-membresia', prompt: 'Resume {{steps.1.metrics}} para la junta' }] } }, PLATFORM, admin);
await SC.publishCustomWorkflow(shared.id, 'v1', PLATFORM, admin);
eq((await SC.listCustomWorkflows(siteB)).map(w => [w.name, w.editable]), [['Compartido', false]], 'el sitio B ve el compartido (no editable) y no el del sitio A');
await rejects(SC.saveCustomDraft(shared.id, { name: 'Cambio' }, siteB, { id: 'uB', role: 'club_admin', clubId: B }), /sólo ella/, 'un sitio no edita lo de la plataforma');
await rejects(RT.runWorkflow({ workflowKey: `custom:${shared.id}`, siteId: B, user: admin, gateway }), /Paso 2.*no está instalado/, 'el agente tiene que estar instalado en el sitio');
const failed = (await RT.listWorkflowRuns({ siteId: B })).find(r => r.workflowKey === `custom:${shared.id}`);
const fr = await RT.getWorkflowRun(failed.id);
ok(fr.status === 'failed' && fr.report.steps[0].ok && !fr.report.steps[1].ok, 'el informe fallido conserva el paso que sí corrió');
eq(failed.customName, 'Compartido', 'el listado muestra el nombre del workflow del constructor');
// Programar lo compartido en un sitio y archivar.
const sch = await RT.saveSchedule({ workflowKey: `custom:${shared.id}`, siteId: B, cadence: 'daily@07:00', input: {} }, admin);
ok(sch.workflowKey === `custom:${shared.id}`, 'lo compartido se programa por sitio');
await rejects(RT.saveSchedule({ workflowKey: 'custom:nope', siteId: B, cadence: 'daily@07:00' }, admin), /desconocido/, 'no se programa lo inexistente');
const arch = await SC.archiveCustomWorkflow(shared.id, PLATFORM, admin);
eq(arch.schedulesDisabled, 1, 'archivar apaga sus programaciones');
await rejects(RT.runWorkflow({ workflowKey: `custom:${shared.id}`, siteId: B, user: admin, gateway }), /desconocido/, 'lo archivado no corre');
const v2 = await SC.saveCustomDraft(cw.id, { draft: { ...draft, trigger: { kind: 'manual' } } }, siteA, admin);
const pub2 = await SC.publishCustomWorkflow(v2.id, 'v2', siteA, admin);
eq(pub2.versions.map(v => v.version), [2, 1], 'cada publicación es una versión nueva; la anterior se conserva');
const audits = (await db.query(`SELECT action FROM "AgentAuditLog" WHERE "entityType" IN ('custom_workflow', 'pilot')`)).rows.map(r => r.action);
for (const a of ['pilot_saved', 'pilot_concluded', 'custom_workflow_saved', 'custom_workflow_published', 'custom_workflow_archived']) ok(audits.includes(a), `auditoría: ${a}`);

await db.pool.end();
console.log(`✓ test-agents-scale-e2e: ${n} comprobaciones`);
