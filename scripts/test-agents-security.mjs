#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// Agentes IA y Cerebros — Fase 0: contención (v4.1314.0)
// npm run test:agents:security — sin base ni red.
//
// 1. El CRITERIO puro (`server/lib/agentScope.js`): quién lee o cambia un
//    agente, qué memorias del cerebro maestro ve cada quien, cuándo una
//    petición pública actúa a nombre de un sitio, límites por ventana.
// 2. INVARIANTES leídas de los archivos: las rutas consultan el criterio y no
//    vuelven a los atajos que causaron los hallazgos S1–S8.
// ════════════════════════════════════════════════════════════════════
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const REPO = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const read = (p) => readFileSync(`${REPO}/${p}`, 'utf8');
let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); n++; };

const S = await import(`${REPO}/server/lib/agentScope.js`);

const admin = { role: 'administrator' };
const superadmin = { role: 'superadmin' };
const clubA = { role: 'club_admin', clubId: 'A' };
const editorA = { role: 'editor', clubId: 'A' };
const memberA = { role: 'member', clubId: 'A' };
const clubB = { role: 'club_admin', clubId: 'B' };
const districtUser = { role: 'district_admin', districtId: 'D1' };

const globalAgent = { id: 'g', clubId: null };
const agentA = { id: 'a', clubId: 'A' };

// ─── 1. Agentes ───────────────────────────────────────────────────────
ok(S.isPlatformAdmin(admin) && S.isPlatformAdmin(superadmin), 'administrator y superadmin son la plataforma');
ok(!S.isPlatformAdmin(clubA) && !S.isPlatformAdmin(null), 'un club no es la plataforma');
ok(S.canReadAgent(clubA, globalAgent), 'los globales se ven desde un club');
ok(S.canReadAgent(clubA, agentA) && !S.canReadAgent(clubB, agentA), 'el agente de un club sólo lo ve su club');
ok(S.canReadAgent(admin, agentA), 'la plataforma ve todo');
ok(!S.canManageAgent(clubA, globalAgent), 'S2: un club NO cambia un agente global');
ok(!S.canManageAgent(clubB, agentA), 'S2: un club NO cambia el agente de otro club');
ok(S.canManageAgent(clubA, agentA) && S.canManageAgent(editorA, agentA), 'quien administra el club cambia los suyos');
ok(!S.canManageAgent(memberA, agentA), 'un socio no cambia agentes');
ok(S.canManageAgent(admin, globalAgent) && S.canManageAgent(superadmin, agentA), 'la plataforma cambia todos');
ok(!S.canManageAgent(null, agentA) && !S.canReadAgent(null, agentA), 'sin sesión, nada');
ok(S.canCreateAgent(clubA) && !S.canCreateAgent(memberA), 'crear pide administrar un sitio');

// ─── 2. Cerebros ──────────────────────────────────────────────────────
const master = { id: 'm', isMaster: true };
const brainA = { id: 'ba', clubId: 'A' };
const brainD = { id: 'bd', districtId: 'D1' };
ok(S.canReadBrain(clubA, master, { clubId: 'A' }), 'el maestro se abre (lo de adentro se recorta)');
ok(S.canReadBrain(clubA, brainA, { clubId: 'A' }) && !S.canReadBrain(clubB, brainA, { clubId: 'B' }), 'el cerebro de un club, sólo su club');
ok(S.canReadBrain(districtUser, brainD, { districtId: 'D1' }), 'el de un distrito, su distrito');
ok(!S.canWriteBrain(clubA, master, { clubId: 'A' }), 'S4: nadie de un club escribe en el maestro');
ok(S.canWriteBrain(admin, master, {}), 'la plataforma sí');
ok(S.canWriteBrain(clubA, brainA, { clubId: 'A' }), 'quien administra el club escribe en el suyo');
ok(!S.canWriteBrain(memberA, brainA, { clubId: 'A' }), 'un socio no escribe');
ok(!S.canWriteBrain(clubA, brainA, { clubId: 'A', fromHost: true }), 'un alcance que salió del DOMINIO no sirve para escribir');
eq(S.masterMemoryWhere(admin, master, {}), null, 'la plataforma ve el maestro entero');
eq(S.masterMemoryWhere(clubA, brainA, { clubId: 'A' }), null, 'en su propio cerebro no hay recorte');
eq(S.masterMemoryWhere(clubA, master, { clubId: 'A' }), { OR: [{ clubId: null, districtId: null }, { clubId: 'A' }] }, 'S3: en el maestro, lo global y lo propio');
eq(S.masterMemoryWhere(memberA, master, {}), { OR: [{ clubId: null, districtId: null }] }, 'sin club ni distrito: sólo lo global (antes, TODO)');
ok(S.memoryVisible(clubA, master, { clubId: null, districtId: null }, { clubId: 'A' }), 'una memoria global se ve');
ok(!S.memoryVisible(clubA, master, { clubId: 'B' }, { clubId: 'A' }), 'S3: la memoria de otro club NO se ve');
ok(S.memoryVisible(districtUser, master, { districtId: 'D1' }, { districtId: 'D1' }), 'la del propio distrito se ve');

// ─── 3. Peticiones públicas ───────────────────────────────────────────
eq(S.resolvePublicClub({ hostSiteId: 'A', requestedClubId: null }), { ok: true, clubId: 'A', reason: 'dominio' }, 'manda el dominio');
eq(S.resolvePublicClub({ hostSiteId: 'A', requestedClubId: 'A' }).ok, true, 'el del cuerpo coincide');
eq(S.resolvePublicClub({ hostSiteId: 'A', requestedClubId: 'B' }).ok, false, 'S1/S5: otro club en el cuerpo se rechaza');
eq(S.resolvePublicClub({ hostSiteId: 'A', requestedClubId: 'B', requestedRelatedToHost: true }).clubId, 'B', 'un club del mismo distrito que el sitio del dominio vale');
eq(S.resolvePublicClub({ hostSiteId: null, requestedClubId: 'A', requestedSiteExists: true }).ok, true, 'en la plataforma, un sitio existente');
eq(S.resolvePublicClub({ hostSiteId: null, requestedClubId: 'Z', requestedSiteExists: false }).ok, false, 'un sitio inexistente no');
eq(S.resolvePublicClub({ hostSiteId: null, requestedClubId: null }).ok, false, 'sin club no hay a nombre de quién');
eq(S.PUBLIC_ORCHESTRATION_EVENTS, ['new_contact_lead'], 'sin sesión, sólo el aviso de un contacto');
{
    const take = S.createRateLimiter({ windowMs: 1000, max: 2 });
    ok(take('ip', 0) && take('ip', 10), 'dentro del límite');
    ok(!take('ip', 20), 'el tercero en la ventana se corta');
    ok(take('otra', 20), 'el límite es por clave');
    ok(take('ip', 1500), 'pasada la ventana, vuelve a pasar');
}
eq(S.clientIp({ headers: { 'x-forwarded-for': '1.2.3.4, 10.0.0.1' } }), '1.2.3.4', 'la IP del visitante, no la del proxy');
eq(S.requestHost({ headers: { 'x-forwarded-host': 'rotary4281.org', host: 'x.vercel.app' } }), 'rotary4281.org', 'el dominio público');

// ─── 4. Invariantes de los archivos ───────────────────────────────────
const agents = read('server/routes/agents.js');
const seed = agents.slice(agents.indexOf('const seedAgents'), agents.indexOf("router.get('/', authMiddleware"));
ok(!/UPDATE "Agent"/.test(seed), 'la siembra NO reescribe agentes existentes (se perdían las ediciones)');
ok(/continue;/.test(seed), 'la siembra salta los que ya existen');
const deploy = agents.slice(agents.indexOf("router.post('/deploy-all'"), agents.indexOf('CONVERSATION HISTORY'));
ok(!/UPDATE "Agent"/.test(deploy), 'desplegar NO pisa lo que el club personalizó');
ok(/isPlatformAdmin\(req\.user\)/.test(deploy), 'desplegar es de la plataforma');
const put = agents.slice(agents.indexOf("router.put('/:id'"), agents.indexOf("router.delete('/:id'"));
ok(/loadManageable/.test(put), 'S2: editar pasa por canManageAgent');
const del = agents.slice(agents.indexOf("router.delete('/:id'"), agents.indexOf("router.post('/deploy-all'"));
ok(/loadManageable/.test(del), 'S2: borrar pasa por canManageAgent');
const orch = agents.slice(agents.indexOf("router.post('/orchestrate'"));
ok(!/const \{ type, payload, clubId \} = req\.body/.test(orch), 'S1: el club ya no sale del cuerpo a ciegas');
ok(/PUBLIC_ORCHESTRATION_EVENTS\.includes/.test(orch) && /resolvePublicClub/.test(orch) && /orchestrateByIp/.test(orch), 'S1: sin sesión, evento permitido + dominio + límite');
ok(/defaultAgentsCount: DEFAULT_AGENTS\.length/.test(agents), 'el listado dice cuántos agentes base hay');

const brains = read('server/routes/brains.js');
ok(/return canReadBrain\(req\.user, brain, scope\)/.test(brains), 'S3: leer un cerebro pasa por canReadBrain');
ok(!/if \(brain\.isMaster\) return true;/.test(brains), 'S3: el maestro ya no se abre entero a cualquiera');
ok(!/isSuperAdmin\(req\) \|\|\s*\n\s*\(\w+(\.\w+)?\.clubId &&/.test(brains), 'toda escritura pasa por canWriteBrain');
const notes = brains.slice(brains.indexOf("router.post('/:id/notes'"));
ok(/userCanWriteBrain/.test(notes.slice(0, 900)), 'S4: las notas piden escritura');
const migrate = brains.slice(brains.indexOf('router.post("/migrate"'), brains.indexOf('router.post("/migrate"') + 300);
ok(/isPlatformAdmin\(req\.user\)/.test(migrate), 'S4: /migrate sólo la plataforma');
ok(/scopeWhere: await memoryWhereFor\(req, brain\)/.test(brains), 'las memorias de un cerebro llevan el recorte');
ok(/const exportScope = /.test(brains) && /const graphScope = /.test(brains), 'exportar y el grafo completo llevan el recorte');
ok(/fromHost = true/.test(brains), 'el alcance por dominio queda marcado');
const bs = read('server/services/brainService.js');
ok(/export async function searchMemories\(\{[^}]*scopeWhere/.test(bs) && /export async function listRecentMemories\(\{[^}]*scopeWhere/.test(bs), 'buscar y listar aceptan el recorte EN la consulta');

const ai = read('server/routes/ai.js');
const pub = ai.slice(ai.indexOf("router.post('/chat'"), ai.indexOf("router.post('/chat'") + 2500);
ok(!/const \{ message, clubId \} = req\.body/.test(pub), 'S5: el chat público no toma el club del cuerpo a ciegas');
ok(/resolvePublicClub/.test(pub) && /publicChatByIp/.test(pub), 'S5: dominio + límite por IP');
const agentChat = ai.slice(ai.indexOf("router.post('/agent-chat'"), ai.indexOf("router.post('/assistant-chat'"));
ok(/canReadAgent\(req\.user, dbAgent\.rows\[0\]\)/.test(agentChat), 'S8: por id, sólo un agente visible');
ok(/"clubId" IS NULL OR "clubId"::text = \$2/.test(agentChat), 'S8: por nombre, sólo globales o del propio club');
ok(/hostname && isPlatformAdmin\(req\.user\)/.test(agentChat), 'S8: elegir club por dominio es de la plataforma');
const assist = ai.slice(ai.indexOf("router.post('/assistant-chat'"), ai.indexOf("router.post('/assistant-chat'") + 4000);
ok(/isSiteManager\(req\.user\) && clubId \? getToolsForAgent/.test(assist), 'las herramientas que escriben, sólo para quien administra el sitio');

const mcr = read('server/routes/missionControl.js');
const taskRoutes = mcr.match(/router\.\w+\('\/tasks\/:submissionId\/[^']+'[^\n]*/g) || [];
ok(taskRoutes.length >= 9, 'las nueve rutas de tarea existen');
ok(taskRoutes.every(r => /requireSubmissionInScope/.test(r)), 'S6: toda ruta de tarea exige que la solicitud esté en el alcance');
const mcc = read('server/controllers/missionControlController.js');
const runAuto = mcc.slice(mcc.indexOf('export const runAutomations'), mcc.indexOf('export const advanceTask'));
ok(/campaignIdsInScope\(req\)/.test(runAuto) && /ANY\(\$1::text\[\]\)/.test(runAuto), 'S6: las automatizaciones de un sitio, sólo sus campañas');

const tools = read('server/lib/agent-tools.js');
ok(/const published = false;/.test(tools), 'S7: un agente nunca publica una noticia');
ok(/AGENT_DISABLED_TOOLS = \['send_whatsapp_message', 'create_whatsapp_campaign', 'import_leads_to_whatsapp'\]/.test(tools), 'S7: envíos e importación desactivados');
ok(/if \(AGENT_DISABLED_TOOLS\.includes\(toolName\)\)/.test(tools), 'S7: executeTool los rechaza');
ok(/!AGENT_DISABLED_TOOLS\.includes\(tool\.function\?\.name\)/.test(tools), 'S7: y no se ofrecen al modelo');
const T = await import(`${REPO}/server/lib/agent-tools.js`).catch(() => null);
if (T) {
    const offered = T.getToolsForAgent(['whatsapp_send', 'whatsapp_campaigns', 'whatsapp_import']).map(t => t.function.name);
    eq(offered, [], 'S7: Camila no recibe herramientas de envío');
}

const wizard = read('src/components/admin/OnboardingWizard.tsx');
ok(/agents\/orchestrate[\s\S]{0,200}Authorization: `Bearer \$\{token\}`/.test(wizard), 'el asistente de onboarding manda su sesión');
const page = read('src/pages/admin/Agents.tsx');
ok(!/los 9 agentes/.test(page) && /defaultAgentsCount/.test(page), 'el modal ya no dice «9» fijo');

console.log(`✓ test-agents-security: ${n} comprobaciones`);
