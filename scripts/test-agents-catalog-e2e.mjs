#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// AI Agent Command Center — el catálogo ES el repositorio (v4.1323.0)
// DATABASE_URL=postgres://…@localhost/vacia npm run test:agents:catalog:e2e
//
// Reproduce el estado real de producción (agentes heredados migrados, con
// instalaciones en varios sitios, herramientas, una aprobación pendiente y una
// tarea en cola) y comprueba el restablecimiento: queda SÓLO el repositorio,
// hay copia de lo borrado, corre una vez, no toca la tabla "Agent" y los
// workflows siguen redactando con un agente del repositorio.
// ════════════════════════════════════════════════════════════════════
import assert from 'node:assert/strict';

const url = process.env.DATABASE_URL || '';
if (!url) { console.error('Falta DATABASE_URL'); process.exit(1); }
if (!/@(localhost|127\.0\.0\.1)(:\d+)?\//.test(url)) { console.error('DATABASE_URL parece de un entorno real. Abortando.'); process.exit(1); }

const REPO = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const { default: db } = await import(`${REPO}/server/lib/db.js`);
const R = await import(`${REPO}/server/lib/agentRegistryStore.js`);
const RT = await import(`${REPO}/server/lib/agentRuntimeStore.js`);
const AC = await import(`${REPO}/server/lib/agencyCatalogStore.js`);
const { AGENCY_BUNDLE } = await import(`${REPO}/server/lib/agencyAgentsBundle.js`);
let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); n++; };
const admin = { id: 'admin-1', role: 'administrator' };

// ── Estado de producción ─────────────────────────────────────────────
const drop = ['AgentPilot', 'AgentFeedback', 'AgentCustomWorkflow', 'AgentCustomWorkflowVersion', 'AgentAlert', 'AgentRollout', 'AgentRolloutTarget', 'AgentTemplate', 'AgentTemplateVersion', 'AgentSkill', 'AgentInstallation', 'AgentAuditLog', 'AgentSiteTypePolicy', 'AgentSetting', 'AgentToolGrant', 'AgentTask', 'AgentRun', 'AgentRunStep', 'AgentApproval', 'AgentWorkflowRun', 'AgentSchedule', 'AgentEvent', 'AiUsageEvent', 'AiUsageDaily', 'AiModelPrice', 'Agent', 'Club', 'User', 'ClubMember'];
for (const t of drop) await db.query(`DROP TABLE IF EXISTS "${t}" CASCADE`);
await db.query(`CREATE TABLE "Club" (id TEXT PRIMARY KEY, name TEXT, type TEXT DEFAULT 'club', subdomain TEXT, domain TEXT, logo TEXT, status TEXT DEFAULT 'active', district TEXT, city TEXT, country TEXT, "districtId" TEXT)`);
await db.query(`CREATE TABLE "User" (id TEXT PRIMARY KEY, name TEXT, email TEXT, role TEXT, "clubId" TEXT)`);
await db.query(`CREATE TABLE "ClubMember" (id TEXT PRIMARY KEY, name TEXT, image TEXT, description TEXT, "isBoard" BOOLEAN DEFAULT false, "boardRole" TEXT, "isHonorary" BOOLEAN DEFAULT false, "isActive" BOOLEAN DEFAULT true, "clubId" TEXT, "createdAt" TIMESTAMPTZ DEFAULT NOW(), "updatedAt" TIMESTAMPTZ DEFAULT NOW())`);
await db.query(`CREATE TABLE "Agent" (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), "clubId" UUID, name VARCHAR(100) NOT NULL, role VARCHAR(200) NOT NULL, category VARCHAR(50), description TEXT, "systemPrompt" TEXT, "aiModel" VARCHAR(50) DEFAULT 'gpt-4', "avatarSeed" VARCHAR(50), "avatarColor" VARCHAR(20), capabilities TEXT[] DEFAULT ARRAY[]::TEXT[], active BOOLEAN DEFAULT true, "order" INT DEFAULT 0, greeting TEXT, "createdAt" TIMESTAMPTZ DEFAULT NOW(), "updatedAt" TIMESTAMPTZ DEFAULT NOW())`);
const C1 = '11111111-1111-1111-1111-111111111111';
const C2 = '22222222-2222-2222-2222-222222222222';
await db.query(`INSERT INTO "Club" (id, name, type) VALUES ($1, 'Club Uno', 'club'), ($2, 'Club Dos', 'club')`, [C1, C2]);
await db.query(`INSERT INTO "User" (id, name, email, role, "clubId") VALUES ('u1', 'Ana', 'a@x.org', 'club_admin', $1), ('u2', 'Beto', 'b@x.org', 'club_admin', $2)`, [C1, C2]);
await db.query(`INSERT INTO "ClubMember" (id, name, "clubId", "isActive") VALUES ('m1', 'Socio', $1, true)`, [C1]);
const P = 'Instrucciones del agente con suficiente longitud para publicarse sin problema alguno.';
for (const [name, club] of [['Daniel Peña', null], ['Elena', null], ['Mateo', null], ['Diana', null], ['Daniel Peña', C1], ['Elena', C1], ['Diana', C2]]) {
    await db.query(`INSERT INTO "Agent" (name, role, category, description, "systemPrompt", greeting, capabilities, active, "clubId") VALUES ($1, 'Rol', 'dirección', 'D', $2, 'Hola', ARRAY['x'], true, $3)`, [name, P, club]);
}
const legacyRowsBefore = (await db.query(`SELECT COUNT(*)::int AS n FROM "Agent"`)).rows[0].n;
const mig = await R.migrateLegacy(admin);
ok(mig.templatesCreated === 4 && mig.installationsCreated === 7, 'estado de producción: 4 heredados con 7 instalaciones');
await RT.seedPilotTemplates(admin);
const installs = await R.listInstallations({});
await RT.setGrant(installs[0].id, 'site_context', 'read', admin);
await db.query(`INSERT INTO "AgentApproval" ("installationId", "siteId", tool, args, hash, risk, summary) VALUES ($1, $2, 'content_publish_news', '{}'::jsonb, 'h', 'N3', 'pendiente')`, [installs[0].id, installs[0].siteId]);
await RT.enqueueTask({ installationId: installs[0].id, title: 'Tarea', goal: 'Algo pendiente' });
const before = (await db.query(`SELECT COUNT(*)::int AS n FROM "AgentTemplate"`)).rows[0].n;
ok(before === 12, 'antes: 4 heredados + 8 pilotos en el catálogo');

// ── 1. El restablecimiento automático (primera apertura) ─────────────
const t0 = Date.now();
const r = await AC.agencyCatalogOnce(admin);
const ms = Date.now() - t0;
eq([r.removed.templates, r.removed.installations, r.removed.grants, r.removed.approvalsExpired, r.removed.tasksCancelled], [12, 7, 1, 1, 1], 'retira todo lo anterior, vence lo pendiente y cancela lo encolado');
eq(r.loaded, AGENCY_BUNDLE.agents.length, 'carga los agentes del repositorio');
const tpl = await R.listTemplates({});
eq(tpl.length, 283, 'el catálogo tiene EXACTAMENTE los 283 del repositorio');
ok(tpl.every(t => t.origin === 'agency' && t.status === 'published' && t.currentVersion === 1), 'todos de The Agency, publicados, en su versión 1');
ok(tpl.every(t => t.sourceRef.ref === AGENCY_BUNDLE.ref && t.sourceRef.division && t.sourceRef.path), 'cada uno con commit, división y ruta de origen');
eq((await R.listInstallations({})).length, 0, 'sin instalaciones: nada se instala solo');
ok(tpl.every(t => !('systemPrompt' in t.draft)), 'el listado no carga los prompts (4 MB)');
ok((await R.getTemplate(tpl[0].id)).draft.systemPrompt.length > 200, '…la ficha sí');
ok(JSON.stringify(tpl).length < 600_000, `el listado completo pesa ${Math.round(JSON.stringify(tpl).length / 1024)} KB`);
eq((await db.query(`SELECT COUNT(*)::int AS n FROM "AgentTemplateVersion"`)).rows[0].n, 283, 'una versión por agente');
eq((await db.query(`SELECT COUNT(*)::int AS n FROM "Agent"`)).rows[0].n, legacyRowsBefore, 'la tabla heredada "Agent" (Control de Misión VIP) queda intacta');
const backup = (await db.query(`SELECT value FROM "AgentSetting" WHERE key = $1`, [r.backupKey])).rows[0]?.value;
ok(backup && backup.templates.length === 12 && backup.installations.length === 7 && backup.versions.length === 4 && backup.grants.length === 1, 'la copia de lo borrado está completa');
ok(backup.templates.some(t => t.draft?.name === 'Daniel Peña'), '…con el contenido de cada plantilla');
const au = (await db.query(`SELECT action, after FROM "AgentAuditLog" WHERE action = 'catalog_reset'`)).rows;
ok(au.length === 1 && au[0].after.loaded === 283, 'queda en la auditoría');
ok(ms < 30000, `rápido (${ms} ms)`);

// ── 2. Una sola vez; después sólo sincroniza ─────────────────────────
eq(await AC.agencyCatalogOnce(admin), null, 'la segunda apertura no vuelve a borrar');
await Promise.all([AC.agencyCatalogOnce(admin), AC.agencyCatalogOnce(admin)]);
eq((await R.listTemplates({})).length, 283, 'dos aperturas a la vez no duplican');
const one = tpl.find(t => t.sourceRef.path === 'support/support-support-responder.md');
await db.query(`DELETE FROM "AgentTemplateVersion" WHERE "templateId" = $1`, [one.id]);
await db.query(`DELETE FROM "AgentTemplate" WHERE id = $1`, [one.id]);
eq((await AC.syncAgencyCatalog(admin)).added, 1, 'sincronizar repone el que falta');
eq((await AC.syncAgencyCatalog(admin)).added, 0, '…y nada más');
const st = await AC.catalogStatus();
ok(st.byOrigin.agency === 283 && st.divisions.length === 18 && st.flag.resetAt, 'estado del catálogo para la pantalla');

// ── 3. Lo construido sigue funcionando con agentes del repositorio ───
const support = (await R.listTemplates({})).find(t => t.sourceRef.path === 'support/support-support-responder.md');
eq(support.team, 'tecnologia', 'curado: conserva el equipo sugerido');
const memberTpl = (await R.listTemplates({})).find(t => t.team === 'membresia');
const inst = await R.createInstallation({ templateId: memberTpl.id, scopeType: 'site', siteId: C1 }, admin);
await R.updateInstallation(inst.id, { responsibleUserId: 'u1', enabled: true }, admin);
const gateway = async () => ({ text: 'Propuestas para la junta.', toolCalls: [], usage: { inputTokens: 10, outputTokens: 5 }, model: 'mock', provider: 'mock' });
const wm = await RT.runWorkflow({ workflowKey: 'membership_review', siteId: C1, user: admin, gateway });
eq(wm.run.aiSummary, 'Propuestas para la junta.', 'el workflow redacta con un agente del repositorio del mismo equipo (ya no hay pilotos)');
const wm2 = await RT.runWorkflow({ workflowKey: 'membership_review', siteId: C2, user: admin, gateway });
ok(wm2.run.aiSummary === null && /instala y enciende/.test(wm2.run.aiNote), 'sin agente del equipo en el sitio, el informe sale igual y dice qué instalar');

// ── 4. Restablecer a mano otra vez ───────────────────────────────────
const r2 = await AC.resetToAgencyCatalog(admin, { reason: 'manual' });
eq([r2.removed.templates, r2.removed.installations, r2.loaded], [283, 1, 283], 'a mano: vuelve a dejar sólo el repositorio');

await db.pool.end();
console.log(`✓ test-agents-catalog-e2e: ${n} comprobaciones`);
