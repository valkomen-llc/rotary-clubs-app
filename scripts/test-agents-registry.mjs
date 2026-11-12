#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// AI Agent Command Center — Fase 1: el registro (v4.1315.0)
// npm run test:agents:registry — sin base ni red. Corre en `prebuild`.
//
// 1. El CRITERIO puro (agentRegistrySpec.js): equipos, tipos de sitio,
//    borradores, estados, Markdown, The Agency, plan de migración.
// 2. INVARIANTES leídas de los archivos: esquema, rutas, paquete de
//    habilidades, guardián y CLAUDE.md.
// ════════════════════════════════════════════════════════════════════
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const REPO = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const read = (p) => readFileSync(`${REPO}/${p}`, 'utf8');
let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); n++; };

const S = await import(`${REPO}/server/lib/agentRegistrySpec.js`);
const { ENTITY_TYPES } = await import(`${REPO}/server/lib/entityTypes.js`);

// ─── 1. Equipos y tipos de sitio ──────────────────────────────────────
eq(S.TEAM_KEYS, ['direccion', 'comunicaciones', 'proyectos', 'eventos', 'membresia', 'finanzas', 'tecnologia', 'analitica'], 'los ocho equipos del plan, en orden');
const cat = S.siteTypeCatalog();
eq(cat.map(t => t.type), ENTITY_TYPES.map(e => e.type), 'los tipos de sitio SALEN de ENTITY_TYPES (uno nuevo aparece solo)');
for (const t of ['district', 'club', 'Feria de Proyectos', 'Programa de Intercambio', 'Evento o Convención']) ok(cat.some(c => c.type === t), `se puede integrar: ${t}`);
eq(cat.filter(c => c.defaultEnabled).map(c => c.type), ['club', 'district'], 'por omisión, sólo clubes y distritos (donde ya hay agentes)');
eq(S.canonicalSiteType('Distrito Rotario'), 'district', 'el organizationType también resuelve');
eq(S.canonicalSiteType('feria de proyectos'), 'Feria de Proyectos', 'sin importar mayúsculas');
eq(S.canonicalSiteType(null), 'club', 'sin tipo = club');
eq(S.effectiveSiteTypePolicy(null, 'Feria de Proyectos').enabled, false, 'la feria nace apagada');
eq(S.effectiveSiteTypePolicy({ enabled: true, allowedTeams: ['eventos', 'inventado'] }, 'Feria de Proyectos').allowedTeams, ['eventos'], 'un equipo inexistente se descarta');
ok(S.siteTypeAllows({ enabled: true, allowedTeams: [] }, 'finanzas'), 'sin lista = todos los equipos');
ok(!S.siteTypeAllows({ enabled: true, allowedTeams: ['eventos'] }, 'finanzas'), 'con lista, sólo esos');
ok(!S.siteTypeAllows({ enabled: false, allowedTeams: [] }, 'eventos'), 'apagado no permite nada');

// ─── 2. Borradores y estados ──────────────────────────────────────────
const sd = S.sanitizeDraft({ name: ' Ana ', role: 'Redactora', systemPrompt: 'x', inventado: 'no', toolRequests: [{ tool: 'events.list', mode: 'borrar_todo' }] });
eq(sd.errors, [], 'nombre y rol bastan para guardar');
ok(!('inventado' in sd.draft), 'nada fuera de DRAFT_FIELDS');
eq(sd.draft.name, 'Ana', 'se recorta');
eq(sd.draft.toolRequests[0].mode, 'read', 'un modo desconocido cae a lectura, nunca a más');
ok(S.sanitizeDraft({ role: 'x' }).errors.length === 1, 'sin nombre no se guarda');
const notReady = S.templateReadiness({ team: 'eventos', draft: { name: 'A', role: 'B', systemPrompt: 'corto' } });
ok(!notReady.ready && notReady.missing.some(m => /instrucciones/.test(m)), 'publicar exige instrucciones reales');
ok(S.templateReadiness({ team: 'eventos', draft: { name: 'A', role: 'B', systemPrompt: 'x'.repeat(50) } }).ready, 'nombre + rol + instrucciones + equipo = lista');
ok(S.canTransitionTemplate('draft', 'review') && S.canTransitionTemplate('review', 'published'), 'borrador → revisión → publicada');
ok(S.canTransitionTemplate('published', 'retired') && !S.canTransitionTemplate('published', 'draft'), 'una publicada se retira, no vuelve a borrador');
eq(S.slugify('Daniel Peña'), 'daniel-pena', 'slug sin tildes');

// ─── 3. Estados de una instalación ────────────────────────────────────
const st = (inst, extra = {}) => S.installationState({ installation: inst, template: { status: 'published', team: 'eventos' }, policy: { enabled: true, allowedTeams: [] }, ...extra }).state;
eq(S.installationState({ installation: null }).state, 'available', 'sin instalación = disponible');
eq(st({ scopeType: 'site', versionId: 'v', enabled: false, responsibleUserId: null }), 'installed', 'sin responsable = instalado');
eq(st({ scopeType: 'site', versionId: 'v', enabled: false, responsibleUserId: 'u' }), 'configured', 'completo y apagado = configurado');
eq(st({ scopeType: 'site', versionId: 'v', enabled: true, responsibleUserId: 'u' }), 'profile_only', 'encendido sin herramientas ni motor = SOLO PERFIL (honesto)');
eq(st({ scopeType: 'site', versionId: 'v', enabled: true, responsibleUserId: 'u' }, { toolCount: 2, runtime: { available: true } }), 'active', 'con herramientas y motor = activo');
eq(st({ scopeType: 'site', versionId: 'v', enabled: true, responsibleUserId: 'u' }, { toolCount: 2, runtime: { available: true, running: true } }), 'running', 'ejecutando');
eq(st({ scopeType: 'site', versionId: 'v', enabled: true, responsibleUserId: 'u' }, { policy: { enabled: false } }), 'disabled', 'tipo de sitio apagado = deshabilitado');
eq(S.installationState({ installation: { scopeType: 'site', versionId: 'v', enabled: true }, template: { status: 'retired' } }).state, 'disabled', 'plantilla retirada = deshabilitado');
eq(st({ scopeType: 'site', versionId: null, enabled: true, responsibleUserId: 'u' }), 'installed', 'sin versión publicada = instalado');

// ─── 4. Markdown y The Agency ─────────────────────────────────────────
const md = '---\nname: Support Responder\ndescription: "Expert support"\ncolor: blue\ntools: [a, b]\n---\n\n# Body\nTexto';
const parsed = S.parseAgentMarkdown(md);
eq(parsed.meta.name, 'Support Responder', 'frontmatter: nombre');
eq(parsed.meta.description, 'Expert support', 'frontmatter: comillas fuera');
eq(parsed.meta.tools, ['a', 'b'], 'frontmatter: listas');
eq(parsed.body, '# Body\nTexto', 'el cuerpo sin el frontmatter');
eq(S.parseAgentMarkdown('sin frontmatter').body, 'sin frontmatter', 'sin frontmatter, todo es cuerpo');
eq(S.AGENCY_SOURCE.ref.length, 40, 'The Agency FIJADA a un commit completo');
eq(S.AGENCY_SOURCE.license, 'MIT', 'licencia MIT');
ok(S.AGENCY_SOURCE.curated.length >= 20 && S.AGENCY_SOURCE.curated.every(c => S.TEAM_KEYS.includes(c.team)), 'lista curada con equipo válido');
// v4.1323 — El catálogo es TODO el repositorio (la lista curada sólo sugiere el equipo).
const { AGENCY_BUNDLE } = await import(`${REPO}/server/lib/agencyAgentsBundle.js`);
eq(AGENCY_BUNDLE.ref, S.AGENCY_SOURCE.ref, 'el paquete está en el commit fijado');
eq(AGENCY_BUNDLE.agents.length, 283, 'los 283 agentes del repositorio');
ok(AGENCY_BUNDLE.agents.some(x => x.body.includes("import { test, expect } from './fixtures'")), 'el texto de los prompts llega INTACTO (el «import» va escapado sólo en el archivo, para check-imports)');
eq(Object.keys(AGENCY_BUNDLE.divisions).length, 18, 'de sus 18 divisiones');
const tpls = AGENCY_BUNDLE.agents.map(x => S.templateFromAgencyBundle(x));
eq(new Set(tpls.map(t => t.key)).size, 283, 'una clave única por agente');
ok(tpls.every(t => S.TEAM_KEYS.includes(t.team) && t.sourceRef.division && t.draft.systemPrompt.length > 200 && t.draft.name), 'cada uno con equipo, división, nombre y prompt');
ok(Object.keys(AGENCY_BUNDLE.divisions).every(d => S.AGENCY_DIVISION_TEAM[d] && S.AGENCY_DIVISIONS[d]), 'toda división tiene equipo y nombre en español');
ok(S.AGENCY_SOURCE.curated.every(c => AGENCY_BUNDLE.agents.some(x => x.path === c.path)), 'lo curado existe en el paquete');
ok(S.agencyRawUrl('support/support-support-responder.md').includes(S.AGENCY_SOURCE.ref), 'la URL usa el commit fijado');
eq(S.agencyRawUrl('../../etc/passwd'), null, 'una ruta rara no arma URL');
eq(S.agencyCuratedEntry('engineering/engineering-frontend-developer.md'), null, 'fuera de la lista curada no se importa');
const dA = S.draftFromAgencyMarkdown('support/support-support-responder.md', md);
eq(dA.origin, 'agency', 'origen The Agency');
eq(dA.sourceRef.license, 'MIT', 'la atribución viaja');
ok(dA.draft.needsAdaptation, 'queda marcado para adaptar al español y a Rotary');
eq(dA.team, 'tecnologia', 'el equipo sale de la lista curada');

// ─── 5. Migración de los heredados ────────────────────────────────────
const G = (name, extra = {}) => ({ id: 'g-' + name, clubId: null, name, role: 'R', description: 'D', systemPrompt: 'P', greeting: 'H', capabilities: ['x'], aiModel: 'gpt-4', active: true, category: 'dirección', ...extra });
const rows = [
    G('Antigravity AI'), G('Elena', { category: null }), G('Martín', { category: 'dirección' }),
    { ...G('Martín'), id: 'c1', clubId: 'CLUB1' },
    { ...G('Martín'), id: 'c2', clubId: 'CLUB2', systemPrompt: 'Prompt del club 2', active: false },
    { ...G('Asistente del club'), id: 'c3', clubId: 'CLUB2' },
];
const plan = S.planLegacyMigration(rows);
eq(plan.templates.map(t => t.key), ['legacy-antigravity-ai', 'legacy-elena', 'legacy-martin', 'custom-asistente-del-club-CLUB2'], 'una plantilla por global y una por agente PROPIO de un club');
ok(plan.templates.find(t => t.key === 'legacy-elena'), 'Elena (sólo en la base) se migra');
eq(plan.templates.find(t => t.key === 'legacy-antigravity-ai').level, 'platform', 'Antigravity sólo en la administración central');
eq(plan.templates.find(t => t.key === 'legacy-martin').team, 'comunicaciones', 'Martín al equipo de comunicaciones (por nombre, no por su categoría)');
eq(plan.templates.find(t => t.key === 'legacy-elena').team, 'direccion', 'Elena a dirección');
eq(plan.installations.length, rows.length, 'una instalación por fila heredada');
const c1 = plan.installations.find(i => i.legacyAgentId === 'c1');
eq(c1.overrides, {}, 'una copia idéntica no tiene ajustes');
const c2 = plan.installations.find(i => i.legacyAgentId === 'c2');
eq(c2.overrides, { systemPrompt: 'Prompt del club 2' }, 'la personalización del club se CONSERVA como ajuste');
eq(c2.enabled, false, 'apagado sigue apagado');
eq(plan.templates.find(t => t.key.startsWith('custom-')).ownerSiteId, 'CLUB2', 'el agente propio queda de su club');
eq(plan.templates.find(t => t.key === 'legacy-martin').draft.systemPrompt, 'P', 'la versión 1 es la de la BASE, no la del código');

// ─── 6. Ajustes ───────────────────────────────────────────────────────
eq(S.sanitizeSettings({ killSwitch: 1, otro: 1 }).killSwitch, true, 'interruptor general');
ok(!('otro' in S.sanitizeSettings({ otro: 1 })), 'ajustes: lista cerrada');

// ─── 7. Invariantes ───────────────────────────────────────────────────
const schema = read('server/lib/ensureAgentCenterSchema.js');
const { OWNED_COLUMNS } = await import(`${REPO}/server/lib/ensureAgentCenterSchema.js`);
for (const t of Object.keys(OWNED_COLUMNS)) ok(new RegExp(`CREATE TABLE IF NOT EXISTS "${t}"`).test(schema), `${t} se crea`);
const adds = [...schema.matchAll(/ADD COLUMN IF NOT EXISTS "?(\w+)"?/g)].map(m => m[1]);
for (const c of adds) ok(Object.values(OWNED_COLUMNS).some(cols => cols.includes(c)), `ADD COLUMN ${c} enumerado`);
const guard = read('scripts/db-push-guard.mjs');
const claude = read('CLAUDE.md');
for (const t of Object.keys(OWNED_COLUMNS)) {
    ok(guard.includes(t), `${t} en la lista del guardián`);
    ok(claude.includes('`' + t + '`'), `${t} en CLAUDE.md`);
}
const routes = read('server/routes/agentCenter.js');
ok(/router\.use\(authMiddleware, resolveScope\)/.test(routes), 'toda la API exige sesión con alcance (plataforma o sitio)');
for (const r of ["router.get('/templates'", "router.post('/templates'", "router.put('/site-types/:type'", "router.put('/settings'", "router.post('/agency/sync'", "router.post('/agency/reset'", "router.get('/agency/catalog'", "router.put('/installations/:id/grants'", "router.post('/rollouts'", "router.post('/installations'", "router.get('/audit'"]) {
    const line = routes.split('\n').find(l => l.startsWith(r));
    ok(line && /platformOnly/.test(line), `${r}: sólo la plataforma`);
}
ok(routes.indexOf("router.get('/templates'") < routes.indexOf("router.get('/templates/:id'"), 'literales antes que paramétricas');
ok(/req\.body\?\.confirm !== 'RESTABLECER'/.test(routes), 'restablecer el catálogo exige escribir RESTABLECER');
ok(/await AC\.agencyCatalogOnce\(req\.user\)/.test(routes) && !/migrateLegacyOnce\(/.test(routes), 'la plataforma restablece al repositorio; ya no migra los heredados');
ok(/router\.post\('\/migrate-legacy'[^\n]*status\(410\)/.test(routes) && /router\.post\('\/pilots\/seed'[^\n]*status\(410\)/.test(routes), 'migrar heredados y crear pilotos: retirados');
const catStore = read('server/lib/agencyCatalogStore.js');
ok(/await import\('\.\/agencyAgentsBundle\.js'\)/.test(catStore), 'el paquete (4 MB) se carga sólo al usarlo, con ruta literal');
ok(/catalogBackup:/.test(catStore) && /pg_advisory_xact_lock/.test(catStore), 'copia antes de borrar y candado contra dos restablecimientos');
ok(!/FROM "Agent"\b|DELETE FROM "Agent"\s/.test(catStore), 'no toca la tabla heredada "Agent" (Control de Misión VIP)');
const server = read('server/server.js');
ok(/app\.use\('\/api\/agent-center', agentCenterRoutes\)/.test(server), 'montado en /api/agent-center');
const { collectSkills } = await import(`${REPO}/scripts/bundle-agent-skills.mjs`);
const { AGENT_SKILLS_BUNDLE } = await import(`${REPO}/server/lib/agentSkillsBundle.js`);
// `.agent` NO viaja al despliegue (.vercelignore): por eso existe el paquete.
// Donde la carpeta está (el repo), el paquete tiene que coincidir con ella; en
// el build de Vercel no hay con qué compararlo y se comprueba que no venga
// vacío. Hasta v4.1320 esta comparación corría también en Vercel contra una
// carpeta ausente y tumbaba TODOS los despliegues desde v4.1315.
// Ojo: Vercel deja las CARPETAS de .agent/skills pero sin sus SKILL.md, así
// que no basta con que el directorio exista: cuenta si hay habilidades que leer.
const skillsDir = `${REPO}/.agent/skills`;
let localSkills = [];
try { localSkills = existsSync(skillsDir) ? collectSkills() : []; } catch { localSkills = []; }
if (localSkills.length > 0) {
    eq(AGENT_SKILLS_BUNDLE.map(s => s.key), localSkills.map(s => s.key), 'el paquete de habilidades coincide con .agent/skills (npm run bundle:agent-skills)');
    ok(AGENT_SKILLS_BUNDLE.every((s, i) => s.markdown === localSkills[i].markdown), '…y su contenido también');
} else {
    ok(AGENT_SKILLS_BUNDLE.length > 0 && AGENT_SKILLS_BUNDLE.every(s => s.key && s.markdown), 'sin .agent/skills (despliegue), el paquete ya generado trae las habilidades');
}
const vercelIgnore = read('.vercelignore');
ok(/^\.agent$/m.test(vercelIgnore), '.agent no viaja al despliegue: el paquete es la fuente allí');
const store = read('server/lib/agentRegistryStore.js');
ok(/AbortSignal\.timeout\(timeoutMs\)/.test(store), 'la descarga de The Agency tiene tope de tiempo');
ok(/agencyCuratedEntry\(path\)/.test(store), 'sólo se descarga de la lista curada');
ok(/Para encenderlo, elige primero un responsable/.test(store), 'un agente de sitio no se enciende sin responsable');
ok(/policyForSiteType\(type\)/.test(store) && /no están integrados con este tipo de sitio/.test(store), 'instalar respeta la integración por tipo de sitio');
const spec = read('server/lib/agentRegistrySpec.js');
ok(!/from '\.\/db\.js'/.test(spec), 'el criterio es puro');

console.log(`✓ test-agents-registry: ${n} comprobaciones`);
