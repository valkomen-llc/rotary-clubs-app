// ════════════════════════════════════════════════════════════════════════════
// AI Agent Command Center — piloto controlado y escalamiento (v4.1319.0)
//
// Tres piezas sobre la base:
//   · OPINIONES por hallazgo ("AgentFeedback"): quien revisa un informe marca
//     cada hallazgo útil / no útil / falso positivo. Es la única fuente honesta
//     de «¿sirve?»; las métricas del piloto salen de aquí, no de la IA.
//   · PILOTOS ("AgentPilot"): sitios + workflows + fechas + metas. Sus métricas
//     se calculan al leer, desde las ejecuciones, las opiniones, el Consumo de
//     IA y las aprobaciones de esos sitios en esas fechas.
//   · CONSTRUCTOR VISUAL ("AgentCustomWorkflow" + versiones inmutables): pasos
//     lineales validados por `agentScaleSpec.js`, ejecutados por el mismo
//     `runWorkflow` (prefijo `custom:`), así que programaciones, eventos,
//     presupuestos, aprobaciones y auditoría valen igual que para los pilotos.
//
// El sitio de una ejecución sale de la sesión o de la programación, nunca de un
// paso: ningún esquema de herramienta tiene `siteId`.
// ════════════════════════════════════════════════════════════════════════════
import db from './db.js';
import { ensureAgentCenterSchema } from './ensureAgentCenterSchema.js';
import { audit, RegistryError, policyForSiteType, getSettings } from './agentRegistryStore.js';
import { canonicalSiteType, siteTypeAllows, TEAMS } from './agentRegistrySpec.js';
import { toolByKey, sanitizeToolArgs, parseCadence, WORKFLOWS, AGENT_EVENT_TYPES } from './agentRuntimeSpec.js';
import {
    validateDefinition, resolveTemplate, readPath, isEmptyValue, findingsOf, findingsCount, pilotMetrics, pilotVerdict,
    FEEDBACK_VERDICTS, PILOT_STATES, RUN_REF, CUSTOM_PREFIX,
} from './agentScaleSpec.js';
import { TOOL_EXECUTORS } from './agentToolExecutors.js';
import { chatWithTools, pickModelSlug } from './agentGateway.js';
import { withAiContext } from './aiUsage.js';
import { checkBudgets } from './agentObservability.js';
import { loadInstallationContext, createApproval, getWorkflowRun, saveSchedule, buildSystemPrompt } from './agentRuntimeStore.js';
import { isPlatformAdmin, isSiteManager } from './agentScope.js';

const J = (v) => JSON.stringify(v ?? null);
const actorId = (u) => u?.id || u?.userId || null;
const fit = (v, n) => { const t = JSON.stringify(v ?? null); return t.length > n ? t.slice(0, n) + '…' : v; };
const TEAM_KEYS = TEAMS.map(t => t.key);

// ── Opiniones por hallazgo ─────────────────────────────────────────────
function canReview(user, run) {
    if (isPlatformAdmin(user)) return true;
    return isSiteManager(user) && run.siteId && String(user?.clubId || '') === String(run.siteId);
}

export async function listFeedback(runId) {
    await ensureAgentCenterSchema();
    const { rows } = await db.query(`SELECT "findingRef", verdict, note, "userId", "updatedAt" FROM "AgentFeedback" WHERE "workflowRunId" = $1`, [String(runId)]);
    return rows;
}

/** Guarda (o quita, con verdict 'clear') la opinión sobre UN hallazgo. */
export async function saveFeedback(runId, { findingRef, verdict, note = '' } = {}, user) {
    await ensureAgentCenterSchema();
    const run = await getWorkflowRun(runId);
    if (!canReview(user, run)) throw new RegistryError('No puedes calificar este informe.', 403);
    if (run.status !== 'succeeded') throw new RegistryError('Sólo se califican informes terminados.', 409);
    const ref = String(findingRef || '');
    if (ref !== RUN_REF && !findingsOf(run.report).some(f => f.ref === ref)) throw new RegistryError('Ese hallazgo no está en el informe.', 400);
    if (verdict === 'clear') {
        await db.query(`DELETE FROM "AgentFeedback" WHERE "workflowRunId" = $1 AND "findingRef" = $2`, [run.id, ref]);
        return listFeedback(run.id);
    }
    if (!FEEDBACK_VERDICTS[verdict]) throw new RegistryError('Calificación desconocida.', 400);
    await db.query(
        `INSERT INTO "AgentFeedback" ("workflowRunId", "workflowKey", "siteId", "findingRef", verdict, note, "userId")
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT ("workflowRunId", "findingRef") DO UPDATE SET verdict = EXCLUDED.verdict, note = EXCLUDED.note, "userId" = EXCLUDED."userId", "updatedAt" = NOW()`,
        [run.id, run.workflowKey, run.siteId, ref, verdict, String(note || '').slice(0, 500), actorId(user)]);
    return listFeedback(run.id);
}

// ── Pilotos ────────────────────────────────────────────────────────────
const GOAL_DEFAULTS = { minUseful: 0.6, maxFalsePositive: 0.2, minRated: 20, minutesPerFinding: 5 };
function sanitizeGoals(g = {}, prev = {}) {
    const num = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
    const base = { ...GOAL_DEFAULTS, ...prev };
    return {
        minUseful: num(g.minUseful, 0, 1, base.minUseful),
        maxFalsePositive: num(g.maxFalsePositive, 0, 1, base.maxFalsePositive),
        minRated: Math.round(num(g.minRated, 1, 10000, base.minRated)),
        minutesPerFinding: num(g.minutesPerFinding, 0, 240, base.minutesPerFinding),
    };
}

async function isKnownWorkflow(key) {
    if (WORKFLOWS[key]) return true;
    if (!String(key).startsWith(CUSTOM_PREFIX)) return false;
    return Boolean((await db.query(`SELECT 1 FROM "AgentCustomWorkflow" WHERE id = $1 AND status <> 'archived'`, [String(key).slice(CUSTOM_PREFIX.length)])).rows[0]);
}

export async function listPilots() {
    await ensureAgentCenterSchema();
    const { rows } = await db.query(`SELECT * FROM "AgentPilot" ORDER BY "createdAt" DESC LIMIT 100`);
    return rows;
}

export async function savePilot(body = {}, user) {
    await ensureAgentCenterSchema();
    const prev = body.id ? (await db.query(`SELECT * FROM "AgentPilot" WHERE id = $1`, [String(body.id)])).rows[0] : null;
    if (body.id && !prev) throw new RegistryError('Piloto no encontrado.', 404);
    if (prev?.status === 'finished') throw new RegistryError('El piloto ya terminó: crea uno nuevo.', 409);
    const name = String(body.name ?? prev?.name ?? '').trim().slice(0, 160);
    if (name.length < 3) throw new RegistryError('Ponle un nombre al piloto.', 400);
    const siteIds = [...new Set((Array.isArray(body.siteIds) ? body.siteIds : prev?.siteIds || []).map(String).filter(Boolean))].slice(0, 50);
    if (!siteIds.length) throw new RegistryError('Elige al menos un sitio.', 400);
    const found = (await db.query(`SELECT id::text AS id FROM "Club" WHERE id::text = ANY($1)`, [siteIds])).rows.map(r => r.id);
    if (found.length !== siteIds.length) throw new RegistryError('Algún sitio no existe.', 400);
    const workflowKeys = [...new Set((Array.isArray(body.workflowKeys) ? body.workflowKeys : prev?.workflowKeys || []).map(String))].slice(0, 20);
    if (!workflowKeys.length) throw new RegistryError('Elige al menos un workflow.', 400);
    for (const k of workflowKeys) if (!(await isKnownWorkflow(k))) throw new RegistryError(`Workflow desconocido: ${k}.`, 400);
    const startsAt = body.startsAt ? new Date(body.startsAt) : (prev ? new Date(prev.startsAt) : new Date());
    const endsAt = body.endsAt === null || body.endsAt === '' ? null : body.endsAt ? new Date(body.endsAt) : (prev?.endsAt ? new Date(prev.endsAt) : null);
    if (Number.isNaN(startsAt.getTime()) || (endsAt && Number.isNaN(endsAt.getTime()))) throw new RegistryError('Fecha inválida.', 400);
    if (endsAt && endsAt <= startsAt) throw new RegistryError('El fin tiene que ser posterior al inicio.', 400);
    const status = body.status && body.status !== 'finished' && PILOT_STATES[body.status] ? body.status : (prev?.status || 'planned');
    const goals = sanitizeGoals(body.goals || {}, prev?.goals || {});
    const notes = String(body.notes ?? prev?.notes ?? '').slice(0, 2000);
    const { rows } = prev
        ? await db.query(`UPDATE "AgentPilot" SET name = $2, status = $3, "siteIds" = $4, "workflowKeys" = $5, "startsAt" = $6, "endsAt" = $7, goals = $8::jsonb, notes = $9, "updatedAt" = NOW() WHERE id = $1 RETURNING *`,
            [prev.id, name, status, siteIds, workflowKeys, startsAt, endsAt, J(goals), notes])
        : await db.query(`INSERT INTO "AgentPilot" (name, status, "siteIds", "workflowKeys", "startsAt", "endsAt", goals, notes, "createdBy") VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9) RETURNING *`,
            [name, status, siteIds, workflowKeys, startsAt, endsAt, J(goals), notes, actorId(user)]);
    await audit(user, { entityType: 'pilot', entityId: rows[0].id, action: 'pilot_saved', before: prev ? { status: prev.status, siteIds: prev.siteIds, workflowKeys: prev.workflowKeys } : null, after: { status, siteIds, workflowKeys } });
    return rows[0];
}

/** Las métricas de UN piloto, calculadas al leer. */
export async function getPilot(id) {
    await ensureAgentCenterSchema();
    const p = (await db.query(`SELECT * FROM "AgentPilot" WHERE id = $1`, [String(id)])).rows[0];
    if (!p) throw new RegistryError('Piloto no encontrado.', 404);
    const until = p.endsAt || new Date();
    const range = [p.siteIds, p.startsAt, until];
    const [runsQ, sitesQ, costQ, apprQ, customQ] = await Promise.all([
        db.query(`SELECT id, "workflowKey", "siteId", status, report, "startedAt" FROM "AgentWorkflowRun"
                   WHERE "siteId" = ANY($1) AND "startedAt" >= $2 AND "startedAt" <= $3 AND "workflowKey" = ANY($4) ORDER BY "startedAt" DESC LIMIT 5000`, [...range, p.workflowKeys]),
        db.query(`SELECT id::text AS id, name, type FROM "Club" WHERE id::text = ANY($1)`, [p.siteIds]),
        db.query(`SELECT "siteId", COALESCE(SUM("costUsd"), 0)::float AS usd FROM "AiUsageEvent" WHERE "siteId" = ANY($1) AND "createdAt" >= $2 AND "createdAt" <= $3 AND feature LIKE 'agents.%' GROUP BY "siteId"`, range).catch(() => ({ rows: [] })),
        db.query(`SELECT "siteId", status FROM "AgentApproval" WHERE "siteId" = ANY($1) AND "createdAt" >= $2 AND "createdAt" <= $3`, range),
        db.query(`SELECT id, name FROM "AgentCustomWorkflow" WHERE ('custom:' || id) = ANY($1)`, [p.workflowKeys]),
    ]);
    const runIds = runsQ.rows.map(r => r.id);
    const fb = runIds.length ? (await db.query(`SELECT "workflowRunId", "siteId", "workflowKey", verdict FROM "AgentFeedback" WHERE "workflowRunId" = ANY($1)`, [runIds])).rows : [];
    const runs = runsQ.rows.map(r => ({ id: r.id, siteId: r.siteId, workflowKey: r.workflowKey, status: r.status, findings: findingsCount(r.report), startedAt: r.startedAt }));
    const costBy = new Map(costQ.rows.map(r => [String(r.siteId), Number(r.usd) || 0]));
    const totalCost = [...costBy.values()].reduce((a, b) => a + b, 0);
    const goals = { ...GOAL_DEFAULTS, ...(p.goals || {}) };
    const metrics = pilotMetrics({ runs, feedback: fb, costUsd: totalCost, approvals: apprQ.rows, sites: p.siteIds.length, minutesPerFinding: goals.minutesPerFinding });
    const bySite = sitesQ.rows.map(s => ({
        siteId: s.id, siteName: s.name, siteType: canonicalSiteType(s.type),
        ...pilotMetrics({ runs: runs.filter(r => r.siteId === s.id), feedback: fb.filter(f => f.siteId === s.id), costUsd: costBy.get(s.id) || 0, approvals: apprQ.rows.filter(a => a.siteId === s.id), sites: 1, minutesPerFinding: goals.minutesPerFinding }),
    }));
    const customNames = Object.fromEntries(customQ.rows.map(c => [`custom:${c.id}`, c.name]));
    const byWorkflow = p.workflowKeys.map(k => ({
        workflowKey: k, label: WORKFLOWS[k]?.label || customNames[k] || k,
        ...pilotMetrics({ runs: runs.filter(r => r.workflowKey === k), feedback: fb.filter(f => f.workflowKey === k), minutesPerFinding: goals.minutesPerFinding }),
    }));
    return { pilot: p, goals, metrics, verdict: pilotVerdict(metrics, goals), bySite, byWorkflow, recentRuns: runs.slice(0, 30) };
}

export async function concludePilot(id, { decision, note = '' } = {}, user) {
    const d = await getPilot(id);
    if (d.pilot.status === 'finished') throw new RegistryError('El piloto ya está concluido.', 409);
    if (!['scale', 'adjust', 'stop'].includes(decision)) throw new RegistryError('Elige la decisión: escalar, ajustar o detener.', 400);
    const conclusion = { decision, note: String(note || '').slice(0, 2000), verdict: d.verdict, metrics: d.metrics, at: new Date().toISOString(), by: actorId(user) };
    const { rows } = await db.query(`UPDATE "AgentPilot" SET status = 'finished', conclusion = $2::jsonb, "endsAt" = COALESCE("endsAt", NOW()), "updatedAt" = NOW() WHERE id = $1 AND status <> 'finished' RETURNING *`, [d.pilot.id, J(conclusion)]);
    if (!rows[0]) throw new RegistryError('El piloto ya está concluido.', 409);
    await audit(user, { entityType: 'pilot', entityId: d.pilot.id, action: 'pilot_concluded', after: { decision, verdict: d.verdict.status } });
    return rows[0];
}

// ── Constructor visual ─────────────────────────────────────────────────
async function validationContext() {
    const keys = (await db.query(`SELECT key FROM "AgentTemplate" WHERE status = 'published'`)).rows.map(r => r.key);
    return { templateKeys: keys, cadenceOk: (c) => { const p = parseCadence(c); return Boolean(p) && p.kind !== 'event'; }, eventTypes: Object.keys(AGENT_EVENT_TYPES) };
}

/** ¿Puede este alcance editar el workflow? La plataforma, todos; un sitio, los suyos. */
export function canEditCustom(scope, wf) {
    if (scope?.platform) return true;
    return Boolean(wf.siteId) && String(wf.siteId) === String(scope?.siteId || '');
}

export async function listCustomWorkflows(scope) {
    await ensureAgentCenterSchema();
    const { rows } = scope.platform
        ? await db.query(`SELECT w.*, c.name AS "siteName" FROM "AgentCustomWorkflow" w LEFT JOIN "Club" c ON c.id::text = w."siteId" WHERE w.status <> 'archived' ORDER BY w."updatedAt" DESC`)
        : await db.query(`SELECT w.*, c.name AS "siteName" FROM "AgentCustomWorkflow" w LEFT JOIN "Club" c ON c.id::text = w."siteId"
                           WHERE w.status <> 'archived' AND (w."siteId" = $1 OR (w."siteId" IS NULL AND w.status = 'published')) ORDER BY w."updatedAt" DESC`, [scope.siteId]);
    return rows.map(w => ({ ...w, editable: canEditCustom(scope, w) }));
}

export async function getCustomWorkflow(id, scope = null) {
    await ensureAgentCenterSchema();
    const wf = (await db.query(`SELECT w.*, c.name AS "siteName" FROM "AgentCustomWorkflow" w LEFT JOIN "Club" c ON c.id::text = w."siteId" WHERE w.id = $1`, [String(id)])).rows[0];
    if (!wf) throw new RegistryError('Workflow no encontrado.', 404);
    if (scope && !scope.platform && !(canEditCustom(scope, wf) || (!wf.siteId && wf.status === 'published'))) throw new RegistryError('Workflow no encontrado.', 404);
    const versions = (await db.query(`SELECT version, changelog, "publishedBy", "publishedAt" FROM "AgentCustomWorkflowVersion" WHERE "workflowId" = $1 ORDER BY version DESC`, [wf.id])).rows;
    const validation = validateDefinition(wf.draft || {}, await validationContext());
    return { ...wf, versions, validation: { ok: validation.ok, errors: validation.errors }, editable: scope ? canEditCustom(scope, wf) : true };
}

function cleanMeta(body, prev = {}) {
    const name = String(body.name ?? prev.name ?? '').trim().slice(0, 120);
    if (name.length < 3) throw new RegistryError('Ponle un nombre al workflow.', 400);
    const team = TEAM_KEYS.includes(body.team) ? body.team : (prev.team || 'direccion');
    return { name, team, description: String(body.description ?? prev.description ?? '').slice(0, 1000) };
}

export async function createCustomWorkflow(body = {}, scope, user) {
    await ensureAgentCenterSchema();
    const meta = cleanMeta(body);
    const siteId = scope.platform ? (body.siteId ? String(body.siteId) : null) : scope.siteId;
    if (siteId && !(await db.query(`SELECT 1 FROM "Club" WHERE id::text = $1`, [siteId])).rows[0]) throw new RegistryError('Sitio no encontrado.', 404);
    const draft = { trigger: body.draft?.trigger || { kind: 'manual' }, steps: Array.isArray(body.draft?.steps) ? body.draft.steps.slice(0, 13) : [] };
    const { rows } = await db.query(`INSERT INTO "AgentCustomWorkflow" (name, description, team, "siteId", draft, "createdBy") VALUES ($1, $2, $3, $4, $5::jsonb, $6) RETURNING id`,
        [meta.name, meta.description, meta.team, siteId, J(draft), actorId(user)]);
    await audit(user, { entityType: 'custom_workflow', entityId: rows[0].id, siteId, action: 'custom_workflow_saved', after: { name: meta.name } });
    return getCustomWorkflow(rows[0].id, scope);
}

export async function saveCustomDraft(id, body = {}, scope, user) {
    const wf = await getCustomWorkflow(id, scope);
    if (!wf.editable) throw new RegistryError('Este workflow es de la plataforma: sólo ella lo edita.', 403);
    if (wf.status === 'archived') throw new RegistryError('El workflow está archivado.', 409);
    const meta = cleanMeta(body, wf);
    const draft = body.draft ? { trigger: body.draft.trigger || { kind: 'manual' }, steps: Array.isArray(body.draft.steps) ? body.draft.steps.slice(0, 13) : [] } : wf.draft;
    await db.query(`UPDATE "AgentCustomWorkflow" SET name = $2, description = $3, team = $4, draft = $5::jsonb, "updatedAt" = NOW() WHERE id = $1`, [wf.id, meta.name, meta.description, meta.team, J(draft)]);
    await audit(user, { entityType: 'custom_workflow', entityId: wf.id, siteId: wf.siteId, action: 'custom_workflow_saved', after: { steps: draft.steps?.length || 0 } });
    return getCustomWorkflow(wf.id, scope);
}

/** Publica el borrador como una versión inmutable; con disparo y sitio propio, lo programa. */
export async function publishCustomWorkflow(id, changelog, scope, user) {
    const wf = await getCustomWorkflow(id, scope);
    if (!wf.editable) throw new RegistryError('Este workflow es de la plataforma: sólo ella lo publica.', 403);
    if (wf.status === 'archived') throw new RegistryError('El workflow está archivado.', 409);
    const v = validateDefinition(wf.draft || {}, await validationContext());
    if (!v.ok) throw new RegistryError(`No se puede publicar: ${v.errors.join(' ')}`, 400);
    const version = (wf.publishedVersion || 0) + 1;
    const definition = { trigger: v.trigger, steps: v.steps };
    const ins = await db.query(`INSERT INTO "AgentCustomWorkflowVersion" ("workflowId", version, definition, changelog, "publishedBy") VALUES ($1, $2, $3::jsonb, $4, $5) ON CONFLICT DO NOTHING RETURNING id`,
        [wf.id, version, J(definition), String(changelog || '').slice(0, 500), actorId(user)]);
    if (!ins.rows[0]) throw new RegistryError('Otra persona publicó al mismo tiempo; recarga.', 409);
    await db.query(`UPDATE "AgentCustomWorkflow" SET "publishedVersion" = $2, status = 'published', "updatedAt" = NOW() WHERE id = $1`, [wf.id, version]);
    let schedule = null;
    if (wf.siteId && v.trigger.kind !== 'manual') {
        const cadence = v.trigger.kind === 'event' ? `event@${v.trigger.event}` : v.trigger.cadence;
        const existing = (await db.query(`SELECT id FROM "AgentSchedule" WHERE "workflowKey" = $1 AND "siteId" = $2 LIMIT 1`, [`${CUSTOM_PREFIX}${wf.id}`, wf.siteId])).rows[0];
        schedule = await saveSchedule({ id: existing?.id || null, workflowKey: `${CUSTOM_PREFIX}${wf.id}`, siteId: wf.siteId, cadence, input: {}, enabled: true }, user);
    }
    await audit(user, { entityType: 'custom_workflow', entityId: wf.id, siteId: wf.siteId, action: 'custom_workflow_published', after: { version, steps: v.steps.length, trigger: v.trigger } });
    return { ...(await getCustomWorkflow(wf.id, scope)), schedule };
}

export async function archiveCustomWorkflow(id, scope, user) {
    const wf = await getCustomWorkflow(id, scope);
    if (!wf.editable) throw new RegistryError('Este workflow es de la plataforma: sólo ella lo archiva.', 403);
    await db.query(`UPDATE "AgentCustomWorkflow" SET status = 'archived', "updatedAt" = NOW() WHERE id = $1`, [wf.id]);
    const off = await db.query(`UPDATE "AgentSchedule" SET enabled = false, "updatedAt" = NOW() WHERE "workflowKey" = $1 RETURNING id`, [`${CUSTOM_PREFIX}${wf.id}`]);
    await audit(user, { entityType: 'custom_workflow', entityId: wf.id, siteId: wf.siteId, action: 'custom_workflow_archived', after: { schedulesDisabled: off.rows.length } });
    return { ok: true, schedulesDisabled: off.rows.length };
}

/** Lanza si el workflow no puede correr en ese sitio. Devuelve el workflow y su versión. */
export async function assertCustomRunnable(id, siteId) {
    await ensureAgentCenterSchema();
    const wf = (await db.query(`SELECT * FROM "AgentCustomWorkflow" WHERE id = $1`, [String(id)])).rows[0];
    if (!wf || wf.status === 'archived') throw new RegistryError('Workflow desconocido.', 404);
    if (!wf.publishedVersion) throw new RegistryError('El workflow no tiene una versión publicada.', 409);
    if (wf.siteId && String(wf.siteId) !== String(siteId)) throw new RegistryError('Este workflow es de otro sitio.', 403);
    const ver = (await db.query(`SELECT * FROM "AgentCustomWorkflowVersion" WHERE "workflowId" = $1 AND version = $2`, [wf.id, wf.publishedVersion])).rows[0];
    if (!ver) throw new RegistryError('La versión publicada no existe.', 500);
    return { wf, ver };
}

async function siteInstallation(siteId, templateKey) {
    const r = await db.query(
        `SELECT i.id FROM "AgentInstallation" i JOIN "AgentTemplate" t ON t.id = i."templateId"
          WHERE t.key = $1 AND i."siteId" = $2 AND i.enabled AND t.status = 'published' LIMIT 1`, [templateKey, String(siteId)]);
    return r.rows[0]?.id || null;
}

/** La entrada del usuario: sólo textos y números cortos. */
function cleanInput(input) {
    const out = {};
    for (const [k, v] of Object.entries(input || {}).slice(0, 20)) {
        if (!/^[a-zA-Z0-9_]{1,40}$/.test(k)) continue;
        if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
        else if (v != null) out[k] = String(v).slice(0, 4000);
    }
    return out;
}

/**
 * Ejecuta la versión PUBLICADA de un workflow del constructor en un sitio.
 * Se registra en "AgentWorkflowRun" con la clave `custom:<id>`. Un paso que
 * falla detiene el workflow y deja el informe con lo que alcanzó a hacer.
 */
export async function runCustomWorkflow({ id, siteId, input = {}, trigger = 'manual', user = null, scheduleId = null, idempotencyKey = null, gateway = chatWithTools, deadlineMs = 240_000 }) {
    const { wf, ver } = await assertCustomRunnable(id, siteId);
    const site = (await db.query(`SELECT * FROM "Club" WHERE id::text = $1`, [String(siteId)])).rows[0];
    if (!site) throw new RegistryError('Sitio no encontrado.', 404);
    const policy = await policyForSiteType(canonicalSiteType(site.type));
    if (!policy.enabled) throw new RegistryError('Los agentes no están integrados con este tipo de sitio (Tipos de sitio).', 409);
    if (!siteTypeAllows(policy, wf.team)) throw new RegistryError('El equipo de este workflow no está permitido para este tipo de sitio.', 409);
    const key = `${CUSTOM_PREFIX}${wf.id}`;
    const ins = await db.query(
        `INSERT INTO "AgentWorkflowRun" ("workflowKey", "siteId", trigger, input, "scheduleId", "requestedBy", "idempotencyKey")
         VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7) ON CONFLICT ("idempotencyKey") DO NOTHING RETURNING *`,
        [key, String(site.id), trigger, J(cleanInput(input)), scheduleId, actorId(user), idempotencyKey]);
    if (!ins.rows[0]) return { duplicate: true, run: (await db.query(`SELECT * FROM "AgentWorkflowRun" WHERE "idempotencyKey" = $1`, [idempotencyKey])).rows[0] };
    const wr = ins.rows[0];
    const deadline = Date.now() + deadlineMs;
    const ctx = { input: cleanInput(input), steps: {} };
    const toolCtx = { siteId: String(site.id), approved: false };
    const steps = [];
    let stoppedAt = null; let lastText = null; let installationId = null; let aiNote = null;
    const report = () => ({ kind: 'custom', workflowId: wf.id, name: wf.name, version: ver.version, steps, stoppedAt, approvals: steps.filter(s => s.approvalId).map(s => s.approvalId) });
    try {
        const defSteps = ver.definition?.steps || [];
        for (let i = 0; i < defSteps.length; i++) {
            const n = i + 1; const s = defSteps[i]; const t0 = Date.now();
            if (Date.now() > deadline) throw new Error(`Paso ${n}: se agotó el tiempo del workflow.`);
            const entry = { n, type: s.type, label: s.label || null, ok: true };
            try {
                if (s.type === 'tool') {
                    const tool = toolByKey(s.tool);
                    if (!tool || !['N0', 'N1'].includes(tool.risk)) throw new Error('herramienta no permitida.');
                    const { args, errors } = sanitizeToolArgs(tool, resolveTemplate(s.args || {}, ctx));
                    if (errors.length) throw new Error(errors.join(' '));
                    const out = await TOOL_EXECUTORS[tool.key](args, toolCtx);
                    if (out?.ok === false) throw new Error(out.error || 'la herramienta falló.');
                    ctx.steps[n] = out; entry.tool = tool.key; entry.output = fit(out, 6000);
                } else if (s.type === 'agent') {
                    const instId = await siteInstallation(site.id, s.templateKey);
                    if (!instId) throw new Error(`el agente «${s.templateKey}» no está instalado y encendido en este sitio.`);
                    const { inst, settings } = await loadInstallationContext(instId);
                    if (settings.killSwitch) throw new Error('el interruptor general está activado.');
                    const budget = await checkBudgets({ installation: inst });
                    if (!budget.ok) throw new Error(budget.reason);
                    const prompt = resolveTemplate(s.prompt, ctx);
                    const out = await withAiContext({ feature: 'agents.workflow', siteId: String(site.id), installationId: instId }, async () => gateway({
                        slug: await pickModelSlug({ installation: inst, version: { snapshot: inst.snapshot }, settings }),
                        system: await buildSystemPrompt(inst), messages: [{ role: 'user', content: String(prompt).slice(0, 16000) }], tools: [], maxTokens: 2000,
                    }));
                    const text = String(out.text || '').trim();
                    ctx.steps[n] = { text, model: out.model || null };
                    lastText = text || lastText; installationId = instId; aiNote = `Redactado con ${out.model || 'el modelo del agente'}.`;
                    entry.templateKey = s.templateKey; entry.output = { text: text.slice(0, 6000), model: out.model || null };
                } else if (s.type === 'stop_if_empty') {
                    const v = readPath(ctx, s.path);
                    entry.output = { path: s.path, empty: isEmptyValue(v) };
                    if (isEmptyValue(v)) { stoppedAt = n; steps.push({ ...entry, ms: Date.now() - t0 }); break; }
                } else if (s.type === 'approval') {
                    const tool = toolByKey(s.tool);
                    if (!tool || !['N2', 'N3'].includes(tool.risk)) throw new Error('acción no permitida.');
                    const { args, errors } = sanitizeToolArgs(tool, resolveTemplate(s.args || {}, ctx));
                    if (errors.length) throw new Error(errors.join(' '));
                    const a = await createApproval({ inst: { id: installationId, siteId: String(site.id) }, tool, args, summary: resolveTemplate(s.summary || '', ctx) || `${wf.name}: ${tool.description}`, workflowRunId: wr.id });
                    ctx.steps[n] = { approvalId: a.id }; entry.tool = tool.key; entry.approvalId = a.id; entry.output = { approvalId: a.id, args };
                } else {
                    throw new Error('tipo de paso desconocido.');
                }
            } catch (e) {
                steps.push({ ...entry, ok: false, error: String(e?.message || e).slice(0, 500), ms: Date.now() - t0 });
                throw new Error(`Paso ${n}${s.label ? ` («${s.label}»)` : ''}: ${e?.message || e}`);
            }
            steps.push({ ...entry, ms: Date.now() - t0 });
        }
        const rep = report();
        await db.query(`UPDATE "AgentWorkflowRun" SET status = 'succeeded', report = $2::jsonb, "aiSummary" = $3, "aiNote" = $4, "installationId" = $5, "finishedAt" = NOW() WHERE id = $1`,
            [wr.id, J(rep), lastText, aiNote, installationId]);
        await audit(user, { entityType: 'workflow', entityId: wr.id, siteId: site.id, action: 'workflow_run', after: { workflowKey: key, version: ver.version, trigger } });
        return { run: { ...wr, status: 'succeeded', report: rep, aiSummary: lastText, aiNote } };
    } catch (err) {
        await db.query(`UPDATE "AgentWorkflowRun" SET status = 'failed', report = $3::jsonb, error = $2, "finishedAt" = NOW() WHERE id = $1`, [wr.id, String(err?.message || err).slice(0, 1000), J(report())]);
        if (err instanceof RegistryError) throw err;
        throw new RegistryError(`El workflow falló: ${err?.message || err}`, 422);
    }
}
