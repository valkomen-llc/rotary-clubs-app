#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// AI Agent Command Center — registro, de punta a punta (v4.1315.0)
// DATABASE_URL=postgres://…@localhost/vacia npm run test:agents:registry:e2e
//
// Necesita una base VACÍA y LOCAL: crea "Club", "User" y "Agent" mínimas y
// ejerce el store real (migración, publicación con espejo, tipos de sitio,
// instalaciones, habilidades, The Agency con un fetch simulado).
// ════════════════════════════════════════════════════════════════════
import assert from 'node:assert/strict';

const url = process.env.DATABASE_URL || '';
if (!url) { console.error('Falta DATABASE_URL'); process.exit(1); }
if (!/@(localhost|127\.0\.0\.1)(:\d+)?\/|host=\/tmp/.test(url)) { console.error('DATABASE_URL parece de un entorno real. Abortando.'); process.exit(1); }

const REPO = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const { default: db } = await import(`${REPO}/server/lib/db.js`);
const R = await import(`${REPO}/server/lib/agentRegistryStore.js`);
let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); n++; };
const rejects = async (p, re, m) => { await assert.rejects(p, re, m); n++; };

const admin = { id: 'admin-1', role: 'administrator' };

// ── Base mínima ──────────────────────────────────────────────────────
for (const t of ['AgentTemplate', 'AgentTemplateVersion', 'AgentSkill', 'AgentInstallation', 'AgentAuditLog', 'AgentSiteTypePolicy', 'AgentSetting', 'Agent', 'Club', 'User']) {
    await db.query(`DROP TABLE IF EXISTS "${t}" CASCADE`);
}
await db.query(`CREATE TABLE "Club" (id TEXT PRIMARY KEY, name TEXT, type TEXT DEFAULT 'club', subdomain TEXT, domain TEXT, status TEXT DEFAULT 'active', "districtId" TEXT)`);
await db.query(`CREATE TABLE "User" (id TEXT PRIMARY KEY, name TEXT, email TEXT, role TEXT, "clubId" TEXT)`);
await db.query(`CREATE TABLE "Agent" (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), "clubId" UUID, name VARCHAR(100) NOT NULL, role VARCHAR(200) NOT NULL, category VARCHAR(50), description TEXT, "systemPrompt" TEXT, "aiModel" VARCHAR(50) DEFAULT 'gpt-4', "avatarSeed" VARCHAR(50), "avatarColor" VARCHAR(20), capabilities TEXT[] DEFAULT ARRAY[]::TEXT[], active BOOLEAN DEFAULT true, "order" INT DEFAULT 0, greeting TEXT, "createdAt" TIMESTAMPTZ DEFAULT NOW(), "updatedAt" TIMESTAMPTZ DEFAULT NOW())`);
const CLUB1 = '11111111-1111-1111-1111-111111111111';
const CLUB2 = '22222222-2222-2222-2222-222222222222';
const FERIA = '33333333-3333-3333-3333-333333333333';
await db.query(`INSERT INTO "Club" (id, name, type, subdomain) VALUES ($1, 'Club Uno', 'club', 'uno'), ($2, 'Club Dos', 'club', 'dos'), ($3, 'Feria 2026', 'Feria de Proyectos', 'feria')`, [CLUB1, CLUB2, FERIA]);
await db.query(`INSERT INTO "User" (id, name, email, role, "clubId") VALUES ('u1', 'Ana', 'ana@x.org', 'club_admin', $1), ('u2', 'Socio', 's@x.org', 'member', $1), ('u3', 'Fe', 'fe@x.org', 'club_admin', $2)`, [CLUB1, FERIA]);
const P = 'Instrucciones del agente con suficiente longitud para publicarse sin problema alguno.';
const insertAgent = async (name, clubId, extra = {}) => (await db.query(
    `INSERT INTO "Agent" (name, role, category, description, "systemPrompt", greeting, capabilities, active, "clubId") VALUES ($1, $2, $3, 'D', $4, 'Hola', $5, $6, $7) RETURNING id`,
    [name, extra.role || 'Rol', extra.category || 'dirección', extra.systemPrompt || P, extra.capabilities || ['x'], extra.active !== false, clubId]
)).rows[0].id;
const gMartin = await insertAgent('Martín', null, { category: 'difusión' });
await insertAgent('Elena', null);
await insertAgent('Antigravity AI', null);
const c1Martin = await insertAgent('Martín', CLUB1, { category: 'difusión' });
const c2Martin = await insertAgent('Martín', CLUB2, { category: 'difusión', systemPrompt: 'Prompt propio del club dos que no se debe perder jamás.' });
await insertAgent('Asistente propio', CLUB2);

// ── 1. Migración ─────────────────────────────────────────────────────
const first = await R.migrateLegacyOnce(admin);
eq([first.templatesCreated, first.installationsCreated], [4, 6], 'migra 3 globales + 1 propio, y las 6 filas como instalaciones');
eq(await R.migrateLegacyOnce(admin), null, 'la migración automática corre UNA vez');
const again = await R.migrateLegacy(admin);
eq([again.templatesCreated, again.installationsCreated], [0, 0], 'volver a migrar no duplica nada');
const templates = await R.listTemplates({});
ok(templates.every(t => t.status === 'published' && t.currentVersion === 1), 'cada heredado queda publicado en su versión 1');
const martin = templates.find(t => t.key === 'legacy-martin');
eq(martin.team, 'comunicaciones', 'Martín al equipo de comunicaciones');
ok(templates.some(t => t.key === 'legacy-elena'), 'Elena migrada');
const inst = await R.listInstallations({ templateId: martin.id });
eq(inst.length, 3, 'Martín: plataforma + dos clubes');
const i2 = inst.find(i => i.siteId === CLUB2);
eq(i2.overrides, { systemPrompt: 'Prompt propio del club dos que no se debe perder jamás.' }, 'la personalización del club dos se conserva');
eq(inst.find(i => i.scopeType === 'platform').state, 'profile_only', 'encendido sin herramientas = Solo perfil');
eq(inst.find(i => i.siteId === CLUB1).state, 'profile_only', 'los clubes están integrados por omisión');

// ── 2. Publicar con espejo ───────────────────────────────────────────
await R.saveDraft(martin.id, { draft: { systemPrompt: 'Nuevas instrucciones de Martín publicadas desde el registro del Command Center.', role: 'Director de SEO' } }, admin);
const pub = await R.publishVersion(martin.id, 'Mejora de instrucciones', admin);
eq(pub.versions[0].version, 2, 'versión 2');
const legacyGlobal = (await db.query(`SELECT "systemPrompt", role FROM "Agent" WHERE id = $1`, [gMartin])).rows[0];
eq(legacyGlobal.systemPrompt, 'Nuevas instrucciones de Martín publicadas desde el registro del Command Center.', 'el espejo actualiza el global heredado');
const legacyC1 = (await db.query(`SELECT "systemPrompt", role FROM "Agent" WHERE id = $1`, [c1Martin])).rows[0];
eq(legacyC1.role, 'Director de SEO', 'el club sin ajuste recibe lo publicado');
const legacyC2 = (await db.query(`SELECT "systemPrompt", role FROM "Agent" WHERE id = $1`, [c2Martin])).rows[0];
eq(legacyC2.systemPrompt, 'Prompt propio del club dos que no se debe perder jamás.', 'el club con ajuste CONSERVA su prompt');
eq(legacyC2.role, 'Director de SEO', '…y recibe lo que no personalizó');
ok((await R.listInstallations({ templateId: martin.id })).every(i => i.versionNumber === 2), 'las instalaciones no fijadas pasan a la versión 2');
const v1 = pub.versions.find(v => v.version === 1);
ok(/^Instrucciones del agente/.test(v1.snapshot.systemPrompt), 'la versión 1 sigue intacta (inmutable)');

// ── 3. Tipos de sitio ────────────────────────────────────────────────
const nuevo = await R.createTemplate({ team: 'eventos', level: 'site', draft: { name: 'Validación de inscripciones', role: 'Revisa inscripciones', systemPrompt: P } }, admin);
await rejects(R.createInstallation({ templateId: nuevo.id, scopeType: 'site', siteId: FERIA }, admin), /no está publicada/, 'no se instala una plantilla sin publicar');
await R.publishVersion(nuevo.id, 'v1', admin);
await rejects(R.createInstallation({ templateId: nuevo.id, scopeType: 'site', siteId: FERIA }, admin), /no están integrados con este tipo de sitio/, 'la feria nace sin integrar');
await R.saveSiteTypePolicy('Feria de Proyectos', { enabled: true, allowedTeams: ['proyectos'] }, admin);
await rejects(R.createInstallation({ templateId: nuevo.id, scopeType: 'site', siteId: FERIA }, admin), /equipo no está permitido/, 'el equipo de eventos no está permitido todavía');
await R.saveSiteTypePolicy('Feria de Proyectos', { allowedTeams: ['proyectos', 'eventos'] }, admin);
const instF = await R.createInstallation({ templateId: nuevo.id, scopeType: 'site', siteId: FERIA }, admin);
ok(instF.id && instF.enabled === false, 'instalada y apagada');
await rejects(R.createInstallation({ templateId: nuevo.id, scopeType: 'site', siteId: FERIA }, admin), /ya está instalado/, 'una vez por ámbito');
await rejects(R.createInstallation({ templateId: nuevo.id, scopeType: 'platform' }, admin), /sólo se instala en sitios/, 'una plantilla de sitio no va a la plataforma');
await rejects(R.updateInstallation(instF.id, { enabled: true }, admin), /elige primero un responsable/, 'sin responsable no se enciende');
const on = await R.updateInstallation(instF.id, { responsibleUserId: 'u3', enabled: true }, admin);
eq(on.enabled, true, 'con responsable se enciende');
const types = await R.listSiteTypePolicies();
const feria = types.find(t => t.type === 'Feria de Proyectos');
eq([feria.enabled, feria.sites, feria.installations], [true, 1, 1], 'la tabla de tipos cuenta sitios e instalaciones');
await R.saveSiteTypePolicy('Feria de Proyectos', { enabled: false }, admin);
eq((await R.listInstallations({ siteId: FERIA }))[0].state, 'disabled', 'apagar el tipo deshabilita sus instalaciones (sin borrarlas)');
eq((await R.siteManagers(CLUB1)).map(u => u.id), ['u1'], 'responsables posibles: quien administra el sitio, no un socio');

// ── 4. Habilidades y The Agency ──────────────────────────────────────
const sk = await R.syncSkillsFromBundle(admin);
ok(sk.total >= 40 && sk.created === sk.total, 'las habilidades del repositorio entran al catálogo');
eq((await R.syncSkillsFromBundle(admin)).created, 0, 'sincronizar de nuevo no duplica');
const fakeMd = '---\nname: Support Responder\ndescription: Expert support\ncolor: "#3366ff"\n---\n\n# Support Responder\nYou are a support specialist with very detailed instructions.';
let fetched = null;
const fetchImpl = async (u) => { fetched = u; return { ok: true, status: 200, text: async () => fakeMd }; };
const imp = await R.importAgencyAgent('support/support-support-responder.md', admin, { fetchImpl });
ok(imp.created && imp.template.status === 'draft' && imp.template.origin === 'agency', 'se importa como BORRADOR de origen The Agency');
ok(fetched.includes('8ae6164602c95ca78828b148b9052460ee426885'), 'descarga del commit fijado');
eq(imp.template.sourceRef.license, 'MIT', 'con su atribución');
eq((await R.importAgencyAgent('support/support-support-responder.md', admin, { fetchImpl })).created, false, 'importar dos veces no duplica');
await rejects(R.importAgencyAgent('engineering/engineering-frontend-developer.md', admin, { fetchImpl }), /lista curada/, 'fuera de la lista curada no se importa');
await R.saveSettings({ allowAgencyImport: false }, admin);
await rejects(R.importAgencyAgent('testing/testing-reality-checker.md', admin, { fetchImpl }), /desactivada/, 'el ajuste apaga la importación');

// ── 5. Auditoría y resumen ───────────────────────────────────────────
const audit = await R.listAudit({ limit: 200 });
for (const a of ['legacy_migrated', 'template_published', 'site_type_policy', 'installation_created', 'installation_updated', 'template_imported', 'setting_changed']) {
    ok(audit.some(e => e.action === a), `auditado: ${a}`);
}
const ov = await R.overview();
ok(ov.templates.total === 6 && ov.installations.total === 7, 'el resumen cuenta plantillas e instalaciones');
ok(ov.siteTypes.enabled.includes('club') && !ov.siteTypes.enabled.includes('Feria de Proyectos'), 'el resumen dice qué tipos están integrados');

await db.pool.end();
console.log(`✓ test-agents-registry-e2e: ${n} comprobaciones`);
