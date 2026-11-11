#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// AI Agent Command Center — runtime de punta a punta (v4.1316.0)
// DATABASE_URL=postgres://…@localhost/vacia npm run test:agents:runtime:e2e
//
// Base LOCAL y VACÍA. El modelo se SIMULA (gateway inyectado): se prueba lo
// que hace la plataforma con lo que el modelo pide —alcance, concesiones,
// aprobaciones, huellas, presupuesto, interruptor, programaciones, eventos y
// consumo—, no la calidad del modelo.
// ════════════════════════════════════════════════════════════════════
import assert from 'node:assert/strict';

const url = process.env.DATABASE_URL || '';
if (!url) { console.error('Falta DATABASE_URL'); process.exit(1); }
if (!/@(localhost|127\.0\.0\.1)(:\d+)?\//.test(url)) { console.error('DATABASE_URL parece de un entorno real. Abortando.'); process.exit(1); }

const REPO = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const { default: db } = await import(`${REPO}/server/lib/db.js`);
const R = await import(`${REPO}/server/lib/agentRegistryStore.js`);
const RT = await import(`${REPO}/server/lib/agentRuntimeStore.js`);
const U = await import(`${REPO}/server/lib/aiUsage.js`);
let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); n++; };
const rejects = async (p, re, m) => { await assert.rejects(p, re, m); n++; };
const admin = { id: 'admin-1', role: 'administrator' };

// ── Base mínima ──────────────────────────────────────────────────────
const drop = ['AgentAlert', 'BrainMemoryVector', 'BrainMemory', 'Brain', 'LedgerLine', 'LedgerTransaction', 'AgentRollout', 'AgentRolloutTarget', 'AgentTemplate', 'AgentTemplateVersion', 'AgentSkill', 'AgentInstallation', 'AgentAuditLog', 'AgentSiteTypePolicy', 'AgentSetting', 'AgentToolGrant', 'AgentTask', 'AgentRun', 'AgentRunStep', 'AgentApproval', 'AgentWorkflowRun', 'AgentSchedule', 'AgentEvent', 'AiUsageEvent', 'AiUsageDaily', 'AiModelPrice', 'Agent', 'Club', 'User', 'Post', 'Project', 'CalendarEvent', 'EventRegistration', 'EventCompletedRegistration', 'ProjectFairSubmission', 'SeoAudit', 'SeoIssue'];
for (const t of drop) await db.query(`DROP TABLE IF EXISTS "${t}" CASCADE`);
await db.query(`CREATE TABLE "Club" (id TEXT PRIMARY KEY, name TEXT, type TEXT DEFAULT 'club', subdomain TEXT, domain TEXT, logo TEXT, status TEXT DEFAULT 'active', district TEXT, city TEXT, country TEXT, "districtId" TEXT)`);
await db.query(`CREATE TABLE "User" (id TEXT PRIMARY KEY, name TEXT, email TEXT, role TEXT, "clubId" TEXT)`);
await db.query(`CREATE TABLE "Post" (id TEXT PRIMARY KEY, title TEXT, content TEXT, published BOOLEAN DEFAULT false, "clubId" TEXT, category TEXT, "isAI" BOOLEAN DEFAULT false, "createdAt" TIMESTAMPTZ DEFAULT NOW(), "updatedAt" TIMESTAMPTZ DEFAULT NOW())`);
await db.query(`CREATE TABLE "Project" (id TEXT PRIMARY KEY, "clubId" TEXT)`);
await db.query(`CREATE TABLE "CalendarEvent" (id TEXT PRIMARY KEY, title TEXT, "startDate" TIMESTAMPTZ, "clubId" TEXT)`);
await db.query(`CREATE TABLE "EventRegistration" (id TEXT PRIMARY KEY, "publicRef" TEXT, "registrationCode" TEXT, "eventId" TEXT, "clubId" TEXT, email TEXT, "documentNumber" TEXT, "firstName" TEXT, "lastName" TEXT, phone TEXT, status TEXT, "totalAmount" NUMERIC, currency TEXT, "paidAt" TIMESTAMPTZ, "stripePaymentIntentId" TEXT, "receiptUrl" TEXT, "createdAt" TIMESTAMPTZ DEFAULT NOW())`);
await db.query(`CREATE TABLE "EventCompletedRegistration" (id TEXT PRIMARY KEY, "registrationCode" TEXT, "eventId" TEXT, "clubId" TEXT, email TEXT, "documentNumber" TEXT, "firstName" TEXT, "lastName" TEXT, phone TEXT, status TEXT, "paymentMethod" TEXT, "receiptKey" TEXT, "createdAt" TIMESTAMPTZ DEFAULT NOW())`);
await db.query(`CREATE TABLE "ProjectFairSubmission" (id TEXT PRIMARY KEY, "publicRef" TEXT, "projectName" TEXT, "projectDescription" TEXT, "focusArea" TEXT, "focusAreaLabel" TEXT, "budgetUsd" NUMERIC, "clubName" TEXT, district TEXT, email TEXT, phone TEXT, status TEXT, "clubId" TEXT, "createdAt" TIMESTAMPTZ DEFAULT NOW())`);
const D = 'site-distrito'; const F = 'site-feria'; const OTHER = 'site-otro';
await db.query(`INSERT INTO "Club" (id, name, type) VALUES ($1, 'Distrito 4281', 'district'), ($2, 'Feria 2026', 'Feria de Proyectos'), ($3, 'Club Otro', 'club')`, [D, F, OTHER]);
await db.query(`INSERT INTO "User" (id, name, email, role, "clubId") VALUES ('uD', 'Resp D', 'd@x.org', 'district_admin', $1), ('uF', 'Resp F', 'f@x.org', 'club_admin', $2), ('uO', 'Otro', 'o@x.org', 'club_admin', $3)`, [D, F, OTHER]);
await db.query(`INSERT INTO "CalendarEvent" (id, title, "startDate", "clubId") VALUES ('ev1', 'Conferencia Distrital', NOW() + INTERVAL '20 days', $1), ('evO', 'Evento ajeno', NOW(), $2)`, [D, OTHER]);
await db.query(`INSERT INTO "EventRegistration" (id, "publicRef", "eventId", "clubId", email, "firstName", "lastName", phone, status, "totalAmount", currency) VALUES
  ('r1', 'R-1', 'ev1', $1, 'dup@x.org', 'Ana', 'P', '300', 'pending_payment', 100, 'USD'),
  ('r2', 'R-2', 'ev1', $1, 'DUP@x.org', 'Ana', 'P', '300', 'pending_payment', 100, 'USD'),
  ('r3', 'R-3', 'ev1', $1, 'p@x.org', 'Luis', 'Q', '300', 'paid', 100, 'USD'),
  ('rO', 'R-O', 'evO', $2, 'ajeno@x.org', 'X', 'Y', '300', 'paid', 100, 'USD')`, [D, OTHER]);
await db.query(`INSERT INTO "EventCompletedRegistration" (id, "registrationCode", "eventId", "clubId", email, "documentNumber", "firstName", "lastName", phone, status, "paymentMethod", "receiptKey") VALUES
  ('c1', 'C-1', 'ev1', $1, 'c1@x.org', '111111', 'C', 'Uno', '300', 'submitted', 'transferencia', NULL)`, [D]);
await db.query(`INSERT INTO "ProjectFairSubmission" (id, "publicRef", "projectName", "projectDescription", "focusArea", "budgetUsd", "clubName", district, email, phone, status, "clubId") VALUES
  ('s1', 'FP-1', 'Agua limpia', $2, 'agua', 15000, 'Club Uno', '4281', 'a@x.org', '3001234567', 'paid', $1),
  ('s2', 'FP-2', 'Huerta', 'corta', NULL, 100, 'Club Dos', '4281', 'b@x.org', '3001234567', 'pending_payment', $1)`, [F, 'x'.repeat(230)]);

// ── Gateway simulado ─────────────────────────────────────────────────
const calls = [];
let script = [];
const gateway = async (req) => {
    calls.push(req);
    const next = script.shift();
    if (typeof next === 'function') return next(req);
    return next || { text: 'Resumen simulado de los hallazgos.', toolCalls: [], usage: { inputTokens: 100, outputTokens: 50 }, model: 'mock-model', provider: 'mock' };
};

// ── 1. Pilotos instalados ────────────────────────────────────────────
eq((await RT.seedPilotTemplates(admin)).created, 8, 'se crean las ocho plantillas piloto (borrador)');
eq((await RT.seedPilotTemplates(admin)).created, 0, 'idempotente');
const tpl = async (key) => (await db.query(`SELECT id FROM "AgentTemplate" WHERE key = $1`, [key])).rows[0].id;
for (const k of ['pilot-validacion-inscripciones', 'pilot-evaluacion-postulaciones', 'pilot-comunicaciones']) await R.publishVersion(await tpl(k), 'v1', admin);
await R.saveSiteTypePolicy('Feria de Proyectos', { enabled: true }, admin);
const install = async (key, site, resp) => {
    const i = await R.createInstallation({ templateId: await tpl(key), scopeType: 'site', siteId: site }, admin);
    await RT.applyRequestedGrants(i.id, admin);
    await R.updateInstallation(i.id, { responsibleUserId: resp, enabled: true }, admin);
    return i.id;
};
const iReg = await install('pilot-validacion-inscripciones', D, 'uD');
const iFair = await install('pilot-evaluacion-postulaciones', F, 'uF');
const iComms = await install('pilot-comunicaciones', D, 'uD');
eq((await RT.listGrants(iComms)).map(g => `${g.tool}:${g.mode}`).sort(), ['content_create_news_draft:draft', 'content_publish_news:act_with_approval', 'content_recent:read', 'site_context:read'], 'al instalar se conceden las herramientas que pide la versión');
const instList = await R.listInstallations({ siteId: D });
ok(instList.every(i => i.state === 'active'), 'con herramientas y motor, «Activo» (ya no «Solo perfil»)');

// ── 2. Workflow: inscripciones ───────────────────────────────────────
script = [];
const w1 = await RT.runWorkflow({ workflowKey: 'event_registration_review', siteId: D, user: admin, gateway });
ok(w1.run.status === 'succeeded', 'el workflow termina');
const ev = w1.run.report.events.find(e => e.eventId === 'ev1');
ok(ev.counts.possible_duplicate === 1 && ev.counts.missing_receipt === 1 && ev.counts.payment_state_mismatch === 1, 'hallazgos deterministas: duplicado, sin comprobante, pago que no cuadra');
ok(!w1.run.report.events.some(e => e.eventId === 'evO'), 'NO ve los eventos de otro sitio');
eq(w1.run.aiSummary, 'Resumen simulado de los hallazgos.', 'el resumen lo redacta el agente piloto');
ok(/R-1|R-2|C-1/.test(JSON.stringify(calls.at(-1).messages)), 'al modelo le llegan los códigos para citarlos');
await db.query(`UPDATE "AgentInstallation" SET enabled = false WHERE id = $1`, [iReg]);
const w1b = await RT.runWorkflow({ workflowKey: 'event_registration_review', siteId: D, input: { eventId: 'ev1' }, user: admin, gateway });
ok(w1b.run.aiSummary === null && /instala y enciende/.test(w1b.run.aiNote), 'sin el agente piloto encendido, el informe sale igual (sin resumen) y dice por qué');
ok(w1b.run.report.findings > 0, '…con todos los hallazgos');
await db.query(`UPDATE "AgentInstallation" SET enabled = true WHERE id = $1`, [iReg]);

// ── 3. Workflow: postulaciones ───────────────────────────────────────
const w2 = await RT.runWorkflow({ workflowKey: 'fair_submission_review', siteId: F, user: admin, gateway });
eq([w2.run.report.complete, w2.run.report.withMissing], [1, 1], 'una completa y una con faltantes');
await R.saveSiteTypePolicy('club', { allowedTeams: ['comunicaciones'] }, admin);
await rejects(RT.runWorkflow({ workflowKey: 'fair_submission_review', siteId: OTHER, user: admin, gateway }), /no está permitido/, 'el equipo permitido por tipo de sitio se respeta');
await R.saveSiteTypePolicy('club', { enabled: false }, admin);
await rejects(RT.runWorkflow({ workflowKey: 'institutional_comms', siteId: OTHER, input: { brief: 'Algo que comunicar al club' }, user: admin, gateway }), /no están integrados/, 'un tipo de sitio sin integrar no corre workflows');
await R.saveSiteTypePolicy('club', { enabled: true, allowedTeams: [] }, admin);

// ── 4. Workflow: comunicaciones + aprobación ─────────────────────────
script = [{ text: JSON.stringify({ title: 'Conferencia Distrital 2026', news: 'El Distrito 4281 invita a la Conferencia Distrital 2026, un encuentro para compartir proyectos de servicio, celebrar los logros de los clubes y fortalecer la amistad rotaria. '.repeat(2), social: 'Te esperamos en la Conferencia Distrital.', whatsapp: 'Inscríbete a la Conferencia Distrital.', email_subject: 'Conferencia', email_body: 'Estimados socios: los invitamos a la Conferencia Distrital 2026, un espacio para compartir proyectos y celebrar el servicio.' }), toolCalls: [], usage: {}, model: 'mock-model' }];
const w3 = await RT.runWorkflow({ workflowKey: 'institutional_comms', siteId: D, input: { brief: 'Invitar a la Conferencia Distrital 2026' }, user: admin, gateway });
const draft = w3.run.report.newsDraft;
ok(draft && draft.published === false, 'la noticia queda como BORRADOR');
const appr = (await RT.listApprovals({ status: 'pending', siteId: D }))[0];
ok(appr && appr.tool === 'content_publish_news' && appr.risk === 'N3', 'publicar queda como aprobación N3 pendiente');
await rejects(RT.decideApproval(appr.id, 'approve', { id: 'uO', role: 'club_admin', clubId: OTHER }), /No puedes decidir/, 'otro sitio no aprueba');
await db.query(`UPDATE "AgentApproval" SET args = '{"postId":"otro"}'::jsonb WHERE id = $1`, [appr.id]);
await rejects(RT.decideApproval(appr.id, 'approve', admin), /cambió desde que se propuso/, 'si la carga cambió, NO se ejecuta (huella)');
await db.query(`UPDATE "AgentApproval" SET args = $2::jsonb WHERE id = $1`, [appr.id, JSON.stringify({ postId: String(draft.id) })]);
const done = await RT.decideApproval(appr.id, 'approve', { id: 'uD', role: 'district_admin', clubId: D });
eq(done.status, 'executed', 'el responsable del sitio aprueba y se ejecuta');
eq((await db.query(`SELECT published FROM "Post" WHERE id = $1`, [draft.id])).rows[0].published, true, 'la noticia se publicó por la aprobación');
await rejects(RT.decideApproval(appr.id, 'approve', admin), /ya está/, 'dos clics no ejecutan dos veces');

// ── 5. Tarea de agente con herramientas ──────────────────────────────
script = [
    { text: '', toolCalls: [{ id: 't1', name: 'events_registration_review', args: { eventId: 'evO', siteId: OTHER } }], usage: { inputTokens: 10, outputTokens: 5 }, model: 'mock-model' },
    { text: '', toolCalls: [{ id: 't2', name: 'content_publish_news', args: { postId: 'x' } }], usage: {}, model: 'mock-model' },
    { text: 'Listo.', toolCalls: [], usage: {}, model: 'mock-model' },
];
const task = await RT.enqueueTask({ installationId: iReg, goal: 'Revisa el evento evO', requestedBy: 'admin-1' });
const [claimed] = await RT.claimTaskById(task.id);
const r = await RT.executeTask(claimed, { gateway });
ok(r.ok, 'la tarea termina');
const full = await RT.getTask(task.id);
eq(full.status, 'succeeded', 'completada');
const toolStep = full.runs[0].steps.find(s => s.tool === 'events_registration_review');
ok(toolStep && /"total":0/.test(JSON.stringify(toolStep.result)), 'pedir un evento de OTRO sitio (aun pasando siteId) no devuelve nada: el alcance es el de la instalación');
const denied = full.runs[0].steps.find(s => s.tool === 'content_publish_news');
ok(denied && /no está concedida/.test(JSON.stringify(denied.result)), 'una herramienta no concedida se niega');
eq(full.runs[0].steps.filter(s => s.kind === 'model').length, 3, 'cada vuelta del modelo queda como paso');

// ── 6. Presupuesto e interruptor ─────────────────────────────────────
await R.updateInstallation(iReg, { budget: { monthlyUsd: 0.01 } }, admin);
await U.recordAiUsage({ provider: 'openai', model: 'gpt-4o', inputTokens: 1_000_000, outputTokens: 0, ok: true }, { installationId: iReg, siteId: D, feature: 'agents' });
const t2 = await RT.enqueueTask({ installationId: iReg, goal: 'Otra revisión' });
await RT.executeTask((await RT.claimTaskById(t2.id))[0], { gateway });
ok(/Presupuesto mensual del agente agotado/.test((await RT.getTask(t2.id)).lastError), 'presupuesto agotado: no se gasta más (y se dice cuál tope)');
await R.updateInstallation(iReg, { budget: { monthlyUsd: null } }, admin);
await R.saveSettings({ killSwitch: true }, admin);
const t3 = await RT.enqueueTask({ installationId: iReg, goal: 'Con interruptor' });
await RT.executeTask((await RT.claimTaskById(t3.id))[0], { gateway });
eq((await RT.getTask(t3.id)).status, 'queued', 'con el interruptor general, la tarea vuelve a la cola');
eq((await RT.tick({ budgetMs: 5000, gateway })).skipped, 'kill_switch', 'y el tick no ejecuta nada');
await R.saveSettings({ killSwitch: false }, admin);

// ── 7. Programaciones y eventos ──────────────────────────────────────
const sch = await RT.saveSchedule({ workflowKey: 'fair_submission_review', siteId: F, cadence: 'daily@07:00' }, admin);
ok(new Date(sch.nextRunAt) > new Date(), 'la programación calcula su próxima hora');
await db.query(`UPDATE "AgentSchedule" SET "nextRunAt" = NOW() - INTERVAL '1 minute' WHERE id = $1`, [sch.id]);
const tk = await RT.tick({ budgetMs: 20_000, gateway });
eq(tk.schedules, 1, 'el tick dispara la programación vencida');
ok(new Date((await db.query(`SELECT "nextRunAt" FROM "AgentSchedule" WHERE id = $1`, [sch.id])).rows[0].nextRunAt) > new Date(), 'y la reprograma (no se dispara cada minuto)');
eq((await RT.tick({ budgetMs: 20_000, gateway })).schedules, 0, 'el tick siguiente no la repite');
await RT.saveSchedule({ workflowKey: 'fair_submission_review', siteId: F, cadence: 'event@fair_submission.created' }, admin);
await RT.emitAgentEvent('fair_submission.created', F, { submissionId: 's2' });
const tk2 = await RT.tick({ budgetMs: 20_000, gateway });
eq(tk2.events, 1, 'un evento del módulo dispara el workflow suscrito');
const evRun = (await RT.listWorkflowRuns({ siteId: F }))[0];
eq(evRun.trigger, 'event:fair_submission.created', 'queda registrado como disparado por evento');

// ── 8. Consumo de IA ─────────────────────────────────────────────────
await U.recordAiUsage({ provider: 'google', model: 'gemini-2.5-flash', inputTokens: 2000, outputTokens: 1000, ok: true, latencyMs: 900 }, { feature: 'whatsapp.agent', siteId: D });
await U.recordAiUsage({ provider: 'google', model: 'gemini-2.5-flash', ok: false, error: '401' }, { feature: 'router', siteId: F });
const sum = await U.usageSummary({ days: 7 });
ok(sum.totals.calls >= 3 && sum.totals.errors >= 1, 'el resumen cuenta llamadas y errores');
ok(sum.byFeature.some(f => f.feature === 'whatsapp.agent' && f.label === 'Agente de WhatsApp'), 'por función, con su nombre legible');
ok(sum.bySite.some(s => s.siteId === D && s.siteName === 'Distrito 4281'), 'por sitio, con su nombre');
ok(Math.abs(sum.byModel.find(m => m.model === 'gpt-4o').costUsd - 2.5) < 1e-6, 'el costo estimado sale del precio de referencia');
await U.savePrice({ model: 'gpt-4o', provider: 'openai', inputPerMTok: 5, outputPerMTok: 15 }, admin);
ok((await U.currentPrices()).find(p => p.model === 'gpt-4o').inputPerMTok === 5, 'los precios se editan');
eq((await U.usageSummary({ days: 7, siteId: F })).totals.errors, 1, 'el resumen se filtra por sitio');

// ── 9. Fase 3: despliegues por oleadas ───────────────────────────────
const RO = await import(`${REPO}/server/lib/agentRolloutStore.js`);
for (const k of ['pilot-formulacion-proyectos', 'pilot-auditoria-web', 'pilot-informes-distritales']) await R.publishVersion(await tpl(k), 'v1', admin);
await db.query(`UPDATE "Club" SET "districtId" = 'dist-1' WHERE id = $1`, [D]);
for (let i = 1; i <= 4; i++) {
    await db.query(`INSERT INTO "Club" (id, name, type, "districtId") VALUES ($1, $2, 'club', 'dist-1')`, [`club-${i}`, `Club ${i}`]);
    await db.query(`INSERT INTO "User" (id, name, email, role, "clubId") VALUES ($1, 'Pres', $2, 'club_admin', $3)`, [`uc${i}`, `c${i}@x.org`, `club-${i}`]);
}
await db.query(`INSERT INTO "Post" (id, title, content, published, "clubId") VALUES ('p-c1', 'Noticia club 1', 'x', true, 'club-1')`);
await db.query(`UPDATE "Club" SET "districtId" = 'dist-1' WHERE id = $1`, [OTHER]);
const prev = await RO.previewRollout({ name: 'Comunicaciones para clubes', templateKeys: ['pilot-comunicaciones'], siteTypes: ['club'] });
eq([prev.ok, prev.targets, prev.waves], [true, 5, [1, 1, 3]], 'vista previa: 5 clubes en 1 → 1 → 3');
const ro = await RO.createRollout({ name: 'Comunicaciones para clubes', templateKeys: ['pilot-comunicaciones'], siteTypes: ['club'] }, admin);
eq([ro.status, ro.targets.length], ['draft', 5], 'el despliegue nace en borrador con sus 5 destinos');
await rejects(RO.advanceRollout(ro.id, {}, admin), /escribe el número de sitios/, 'sin escribir el número, no despliega');
const w1r = await RO.advanceRollout(ro.id, { confirmCount: 5 }, admin);
eq([w1r.status, w1r.currentWave, w1r.lastWave.created], ['running', 1, 1], 'oleada 1: un sitio');
const firstInst = (await db.query(`SELECT * FROM "AgentInstallation" WHERE "rolloutId" = $1`, [ro.id])).rows[0];
eq([firstInst.enabled, firstInst.responsibleUserId], [false, null], 'llega APAGADO: el sitio elige su responsable');
eq((await RT.listGrants(firstInst.id)).length, 4, 'con las herramientas que pide la versión');
const instIds = (await db.query(`SELECT id FROM "AgentInstallation" WHERE "rolloutId" = $1`, [ro.id])).rows.map(r => r.id);
for (let i = 0; i < 6; i++) await db.query(`INSERT INTO "AgentRun" ("taskId", "installationId", status) VALUES ('t-x', $1, $2)`, [instIds[0], i < 3 ? 'failed' : 'succeeded']);
await rejects(RO.advanceRollout(ro.id, {}, admin), /Despliegue pausado/, 'con 50 % de fallas, la compuerta de salud PAUSA');
eq((await RO.getRollout(ro.id)).status, 'paused', 'queda pausado');
const w2r = await RO.advanceRollout(ro.id, { force: true }, admin);
eq(w2r.currentWave, 2, 'una persona puede reanudar a sabiendas');
const w3r = await RO.advanceRollout(ro.id, { force: true }, admin);
eq([w3r.status, w3r.targets.filter(t => t.status === 'installed').length], ['completed', 5], 'completado en los 5 clubes');
const rb = await RO.rollbackRollout(ro.id, admin);
eq(rb.status, 'rolled_back', 'revertido');
const after = (await db.query(`SELECT enabled, "disabledReason" FROM "AgentInstallation" WHERE "rolloutId" = $1`, [ro.id])).rows;
ok(after.length === 5 && after.every(r => r.enabled === false && /revertido/.test(r.disabledReason)), 'revertir APAGA lo instalado y deja el porqué (no borra)');
const roF = await RO.createRollout({ name: 'Proyectos para la feria', preset: 'proyectos', siteTypes: ['Feria de Proyectos'], autoActivate: true, waves: [{ percent: 100 }] }, admin);
const fr = await RO.advanceRollout(roF.id, {}, admin);
const fInst = (await db.query(`SELECT enabled, "responsibleUserId" FROM "AgentInstallation" WHERE "rolloutId" = $1`, [roF.id])).rows;
ok(fr.status === 'completed' && fInst.length >= 1 && fInst.every(i => i.enabled && i.responsibleUserId === 'uF'), 'con «encender con el primer administrador», queda activo con su responsable');
ok(/Ya tenía/.test(fr.targets[0].reason || '') || fr.lastWave.skipped >= 1, 'lo que el sitio ya tenía se informa y no se duplica');

// ── 10. Workflows 1, 7 y 8 ───────────────────────────────────────────
await R.saveSiteTypePolicy('club', { enabled: true, allowedTeams: [] }, admin);
const iAud = await install('pilot-auditoria-web', OTHER, 'uO');
const wa = await RT.runWorkflow({ workflowKey: 'site_audit', siteId: OTHER, user: admin, gateway });
ok(wa.run.report.findings.some(f => /logotipo/.test(f.finding)) && wa.run.report.findings.every(f => f.task), 'auditoría: hallazgos con su tarea');
ok(iAud, 'el agente de auditoría redacta las recomendaciones');
const iRep = await install('pilot-informes-distritales', D, 'uD');
const wr8 = await RT.runWorkflow({ workflowKey: 'district_report', siteId: D, input: { days: 90 }, user: admin, gateway });
ok(wr8.run.report.clubs === 5 && wr8.run.report.totals.news === 1, 'informe distrital: los 5 clubes del distrito y su actividad');
ok(wr8.run.report.quietClubs.length === 3 && !wr8.run.report.quietClubs.includes('Club 1'), 'clubes sin actividad publicada (un evento o una noticia cuentan)');
await rejects(RT.runWorkflow({ workflowKey: 'district_report', siteId: OTHER, user: admin, gateway }), /sitio de un distrito/, 'el informe distrital sólo sobre un distrito');
await rejects(RT.validateWorkflowRun(wr8.run.id, { id: 'uO', role: 'club_admin', clubId: OTHER }), /Sólo el distrito/, 'un club no valida el informe del distrito');
const val = await RT.validateWorkflowRun(wr8.run.id, { id: 'uD', role: 'district_admin', clubId: D }, 'Revisado en la junta');
ok(val.report.validation?.by === 'uD', 'el distrito lo valida (queda quién y cuándo)');
await rejects(RT.validateWorkflowRun(wr8.run.id, admin), /ya fue validado/, 'no se valida dos veces');
ok(iRep, 'informe con agente');
await install('pilot-formulacion-proyectos', D, 'uD');
script = [{ text: JSON.stringify({ title: 'Agua segura', problem: 'Sin agua potable', objectives: ['Instalar filtros'], beneficiaries: '120 familias', activities: ['Instalación'], indicators: [{ name: 'Familias con filtro', target: '120' }], budgetOutline: 'USD 15.000', risks: ['Mantenimiento'], missingInfo: ['¿Quién mantiene los filtros?'] }), toolCalls: [], usage: {}, model: 'mock-model' }];
const wf1 = await RT.runWorkflow({ workflowKey: 'project_formulation', siteId: D, input: { idea: 'Llevar agua potable a 120 familias de una vereda con filtros comunitarios.' }, user: admin, gateway });
ok(wf1.run.report.draft?.title === 'Agua segura' && wf1.run.report.check.missing.length > 0, 'formulación: borrador estructurado y lo que falta');

// ── 11. Fase 4: revisión financiera (sólo lectura) ───────────────────
await db.query(`CREATE TABLE "LedgerTransaction" (id TEXT PRIMARY KEY, kind TEXT, "clubId" TEXT, currency TEXT, "sourceType" TEXT, "sourceRef" TEXT, reverses TEXT, "occurredAt" TIMESTAMPTZ DEFAULT NOW(), "postedAt" TIMESTAMPTZ DEFAULT NOW(), meta JSONB)`);
await db.query(`CREATE TABLE "LedgerLine" (id TEXT PRIMARY KEY, "transactionId" TEXT, "accountId" TEXT, "clubId" TEXT, account TEXT, currency TEXT, minor BIGINT, basis TEXT DEFAULT 'real', meta JSONB, "createdAt" TIMESTAMPTZ DEFAULT NOW())`);
await db.query(`INSERT INTO "LedgerTransaction" (id, kind, "clubId", currency, "sourceType", "sourceRef") VALUES ('tx-ok', 'aporte', $1, 'COP', 's', '1'), ('tx-bad', 'aporte', $1, 'COP', 's', '2'), ('tx-rev', 'reverso', $1, 'COP', 's', '3'), ('tx-otro', 'aporte', $2, 'COP', 's', '4')`, [D, OTHER]);
await db.query(`UPDATE "LedgerTransaction" SET reverses = 'tx-inexistente' WHERE id = 'tx-rev'`);
await db.query(`INSERT INTO "LedgerLine" (id, "transactionId", "accountId", "clubId", account, currency, minor) VALUES
  ('l1', 'tx-ok', 'a', $1, 'caja', 'COP', 1000), ('l2', 'tx-ok', 'b', $1, 'aportes', 'COP', -1000),
  ('l3', 'tx-bad', 'a', $1, 'caja', 'COP', 1000), ('l4', 'tx-bad', 'b', $1, 'aportes', 'COP', -900),
  ('l5', 'tx-otro', 'a', $2, 'caja', 'COP', 50)`, [D, OTHER]);
const ledgerBefore = (await db.query(`SELECT COUNT(*)::int AS n, SUM(minor)::bigint AS s FROM "LedgerLine"`)).rows[0];
const wfin = await RT.runWorkflow({ workflowKey: 'finance_review', siteId: D, user: admin, gateway });
const fk = wfin.run.report.findings.map(f => `${f.kind}:${f.ref}`);
ok(fk.includes('unbalanced:tx-bad') && fk.includes('orphan_reversal:tx-rev') && fk.includes('paid_without_support:R-3'), 'descuadre, reverso huérfano y pago sin soporte, cada uno con su referencia');
ok(!fk.includes('unbalanced:tx-otro'), 'NO ve el libro mayor de otro sitio');
eq((await db.query(`SELECT COUNT(*)::int AS n, SUM(minor)::bigint AS s FROM "LedgerLine"`)).rows[0], ledgerBefore, 'el libro mayor queda INTACTO (sólo lectura)');

// ── 12. Fase 4: alertas, presupuestos y retención ────────────────────
const OB = await import(`${REPO}/server/lib/agentObservability.js`);
await R.updateInstallation(iReg, { budget: { monthlyUsd: 1 } }, admin);
const c1 = await OB.computeAlerts();
ok(c1.opened >= 1 && (await OB.listAlerts({})).some(a => a.kind === 'budget_exhausted' && a.installationId === iReg), 'presupuesto agotado: se abre la alerta');
eq((await OB.computeAlerts()).opened, 0, 'la misma condición no abre otra alerta');
await R.updateInstallation(iReg, { budget: { monthlyUsd: null } }, admin);
await OB.computeAlerts();
ok(!(await OB.listAlerts({})).some(a => a.dedupeKey === `budget:installation:${iReg}`), 'si la condición desaparece, la alerta se resuelve sola');
for (let i = 0; i < 6; i++) await db.query(`INSERT INTO "AgentRun" ("taskId", "installationId", "siteId", status) VALUES ('t-err', $1, $2, $3)`, [iComms, D, i < 4 ? 'failed' : 'succeeded']);
await OB.computeAlerts();
const errAl = (await OB.listAlerts({ siteId: D })).find(a => a.kind === 'error_rate');
ok(errAl && /4 de 6/.test(errAl.message), 'muchas ejecuciones fallidas: alerta con el detalle');
await OB.setAlertStatus(errAl.id, 'acknowledged', admin);
eq((await OB.listAlerts({ siteId: D })).find(a => a.id === errAl.id).status, 'acknowledged', 'se reconoce');
await OB.saveBudgets({ sites: { [D]: 0.0001 } }, admin);
const tb = await RT.enqueueTask({ installationId: iComms, goal: 'Algo con tope del sitio' });
await RT.executeTask((await RT.claimTaskById(tb.id))[0], { gateway });
ok(/del sitio agotado/.test((await RT.getTask(tb.id)).lastError), 'el presupuesto del SITIO detiene el gasto');
await OB.saveBudgets({ sites: { [D]: 0 } }, admin);
await db.query(`INSERT INTO "AgentRun" (id, "taskId", "installationId", status, "startedAt") VALUES ('run-viejo', 't-v', $1, 'succeeded', NOW() - INTERVAL '400 days')`, [iComms]);
await db.query(`INSERT INTO "AgentRunStep" ("runId", seq, kind) VALUES ('run-viejo', 1, 'model')`);
const MEM = await import(`${REPO}/server/lib/agentMemory.js`);
const pur = await MEM.purgeOperationalMemory({ retentionDays: 180 });
ok(pur.runs >= 1 && pur.steps >= 1, 'la retención borra las ejecuciones viejas y sus pasos');
ok((await db.query(`SELECT 1 FROM "AgentRun" WHERE id = 'run-viejo'`)).rows.length === 0, '…y sólo las viejas');

// ── 13. Fase 4: conocimiento por alcances y pgvector ─────────────────
await db.query(`CREATE TABLE "Brain" (id TEXT PRIMARY KEY, kind TEXT DEFAULT 'CLUB', name TEXT, "identityPrompt" TEXT, "clubId" TEXT UNIQUE, "districtId" TEXT UNIQUE, "isMaster" BOOLEAN DEFAULT false, "memoryCount" INT DEFAULT 0, metadata JSONB DEFAULT '{}', dossier TEXT, "dossierMeta" JSONB DEFAULT '{}', "dossierUpdatedAt" TIMESTAMPTZ, "createdAt" TIMESTAMPTZ DEFAULT NOW(), "updatedAt" TIMESTAMPTZ DEFAULT NOW())`);
await db.query(`CREATE TABLE "BrainMemory" (id TEXT PRIMARY KEY, "brainId" TEXT, kind TEXT, "sourceId" TEXT, "sourceType" TEXT, title TEXT, content TEXT, embedding DOUBLE PRECISION[] DEFAULT '{}', metadata JSONB DEFAULT '{}', "clubId" TEXT, "districtId" TEXT, "createdAt" TIMESTAMPTZ DEFAULT NOW(), "updatedAt" TIMESTAMPTZ DEFAULT NOW())`);
await db.query(`INSERT INTO "Brain" (id, kind, name, "clubId", "isMaster") VALUES ('b-master', 'MASTER', 'Maestro', NULL, true), ('b-d', 'CLUB', 'Distrito', $1, false), ('b-o', 'CLUB', 'Otro', $2, false)`, [D, OTHER]);
const vec = (hot) => `{${Array.from({ length: 768 }, (_, i) => (i === hot ? 1 : 0.001)).join(',')}}`;
await db.query(`INSERT INTO "BrainMemory" (id, "brainId", kind, "sourceType", "sourceId", title, content, embedding, "clubId") VALUES
  ('m-global', 'b-master', 'DOC', 'doc', 'g1', 'Guía global de imagen', 'Lineamientos de marca', $1, NULL),
  ('m-d', 'b-d', 'POST', 'post', 'p1', 'Conferencia del distrito', 'La conferencia será en Pasto', $2, $4),
  ('m-o', 'b-o', 'POST', 'post', 'p2', 'Secreto del club otro', 'Dato privado', $3, $5),
  ('m-copia', 'b-master', 'POST', 'post', 'p2', 'Secreto del club otro', 'Dato privado', $3, $5),
  ('m-huerfana', 'b-master', 'POST', 'post', 'p9', 'Copia sin original', 'x', $3, $5)`, [vec(1), vec(2), vec(3), D, OTHER]);
const BV = await import(`${REPO}/server/lib/brainVector.js`);
const ens = await BV.ensureVectorSupport();
ok(ens.ok, 'pgvector disponible en la base de prueba');
await R.saveSettings({ vectorSearch: true }, admin);
const bf = await BV.backfillVectors({ limit: 100 });
eq([bf.copied, bf.pending], [5, 0], 'los 5 vectores se indexan en la tabla lateral');
const qv = Array.from({ length: 768 }, (_, i) => (i === 3 ? 1 : 0.001));
const plain = await BV.vectorSearch({ brainId: 'b-master', qVec: qv, k: 5 });
eq(plain[0].memory.id, 'm-copia', 'sin recorte, la más parecida primero (ordena la base)');
ok(!('embedding' in plain[0].memory), 'el vector no viaja en la respuesta');
const scoped = await BV.vectorSearch({ brainId: 'b-master', qVec: qv, k: 5, scopeWhere: MEM.GLOBAL_ONLY });
eq(scoped.map(r => r.memory.id), ['m-global'], 'con el recorte global, la copia privada de otro club NO aparece');
const fakeSearch = async ({ brainId, scopeWhere }) => (await BV.vectorSearch({ brainId, qVec: qv, k: 5, scopeWhere })) || [];
const know = await MEM.searchKnowledgeForSite(D, 'conferencia', { search: fakeSearch });
ok(know.some(r => r.title === 'Conferencia del distrito' && r.scope === 'sitio') && know.some(r => r.scope === 'global'), 'el agente de un sitio ve su cerebro y lo global');
ok(!know.some(r => /Secreto/.test(r.title)), '…y nunca lo de otro club');
ok(know.every(r => r.source.type && r.source.id), 'cada resultado trae su fuente');
const pv = await MEM.purgeMasterPrivateCopies({ dryRun: true });
eq([pv.removable, pv.keptWithoutOriginal], [1, 1], 'sólo la copia con original es removible');
const pd = await MEM.purgeMasterPrivateCopies({ dryRun: false });
ok(pd.removed === 1 && (await db.query(`SELECT 1 FROM "BrainMemory" WHERE id = 'm-huerfana'`)).rows.length === 1, 'se quita la copia; la que no tiene original se conserva');
await R.saveSettings({ vectorSearch: false }, admin);
eq(await BV.vectorSearch({ brainId: 'b-master', qVec: qv, k: 5 }), null, 'apagado, el camino vectorial cede a la búsqueda de siempre');

await db.pool.end();
console.log(`✓ test-agents-runtime-e2e: ${n} comprobaciones`);
