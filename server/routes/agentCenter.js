// ════════════════════════════════════════════════════════════════════════════
// AI Agent Command Center — API (/api/agent-center) — v4.1329.0
//
// DOS ALCANCES (Fase 3):
//   · la plataforma (administrator / superadmin): todo;
//   · quien administra un sitio (district_admin, club_admin, editor…): SÓLO su
//     sitio — sus instalaciones (encender, responsable, ajustes propios), sus
//     tareas, aprobaciones, workflows, programaciones y su consumo. El sitio
//     SIEMPRE sale de la sesión (`req.acScope.siteId`), nunca de la petición.
// Lo que gobierna el ecosistema (plantillas, tipos de sitio, herramientas
// concedidas, despliegues, importador, ajustes, auditoría) es sólo de la
// plataforma (`platformOnly`).
//
// Fases 5–6 (v4.1319): los PILOTOS son de la plataforma; calificar hallazgos y
// el CONSTRUCTOR de workflows, de quien administra el sitio (lo suyo) o de la
// plataforma (todo, y los workflows compartidos con todos los sitios).
//
// ⚠️ Las rutas literales van ANTES que las paramétricas (check:routes).
// ════════════════════════════════════════════════════════════════════════════
import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { isPlatformAdmin, isSiteManager } from '../lib/agentScope.js';
import * as R from '../lib/agentRegistryStore.js';
import * as RT from '../lib/agentRuntimeStore.js';
import * as RO from '../lib/agentRolloutStore.js';
import * as OB from '../lib/agentObservability.js';
import * as MEM from '../lib/agentMemory.js';
import * as SC from '../lib/agentScaleStore.js';
import * as AC from '../lib/agencyCatalogStore.js';
import * as DIR from '../lib/agentDirectorStore.js';
import { STEP_TYPES, MAX_STEPS, FEEDBACK_VERDICTS, PILOT_STATES, findingsOf } from '../lib/agentScaleSpec.js';
import { ALERT_KINDS } from '../lib/agentObservabilitySpec.js';
import db from '../lib/db.js';
import { usageSummary, recentUsageEvents, currentPrices, savePrice, FEATURE_LABELS } from '../lib/aiUsage.js';
import { TOOL_CATALOG, RISK, GRANT_MODES, PROHIBITED, WORKFLOWS, TASK_STATES, AGENT_EVENT_TYPES, describeCadence } from '../lib/agentRuntimeSpec.js';
import { TEAM_PRESETS, ROLLOUT_STATES, DEFAULT_WAVES, buildNetwork } from '../lib/agentRolloutSpec.js';
import {
    TEAMS, TEMPLATE_STATES, ORIGINS, LEVELS, INSTALLATION_STATES, AUDIT_ACTIONS, AGENCY_SOURCE, AGENCY_DIVISIONS, siteTypeCatalog,
} from '../lib/agentRegistrySpec.js';
import { MODULES } from '../lib/rbacSpec.js';

const router = express.Router();

console.log('[agent-center] v4.1329.0 — Dirección IA: Director de Inteligencia y Operaciones Rotarias (objetivo → plan → aprobación → pasos → entregable); catálogo = repositorio de The Agency; registro, runtime, despliegues, mapa, vista por sitio, memoria, observabilidad, piloto controlado y constructor de workflows');

function resolveScope(req, res, next) {
    if (isPlatformAdmin(req.user)) { req.acScope = { platform: true, siteId: null }; return next(); }
    if (isSiteManager(req.user) && req.user?.clubId) { req.acScope = { platform: false, siteId: String(req.user.clubId) }; return next(); }
    return res.status(403).json({ error: 'Access denied' });
}
const platformOnly = (req, res, next) => (req.acScope?.platform ? next() : res.status(403).json({ error: 'Esta sección es de la administración de la plataforma.' }));
/** El sitio de la petición: la plataforma elige; un sitio, siempre el suyo. */
const siteOf = (req, requested) => (req.acScope.platform ? (requested ? String(requested) : null) : req.acScope.siteId);
/** 404 si el recurso no es del sitio de la sesión. */
const ownOr404 = (req, siteId) => {
    if (req.acScope.platform) return true;
    if (String(siteId || '') !== req.acScope.siteId) throw new R.RegistryError('No encontrado.', 404);
    return true;
};

const wrap = (fn) => async (req, res) => {
    try {
        await fn(req, res);
    } catch (err) {
        const status = err instanceof R.RegistryError ? err.status : 500;
        if (status >= 500) console.error('[agent-center]', req.method, req.originalUrl, err);
        res.status(status).json({ error: err.message || 'Error del Command Center' });
    }
};

router.use(authMiddleware, resolveScope);

// ── Literales ──────────────────────────────────────────────────────────
router.get('/meta', wrap(async (req, res) => {
    res.json({
        scope: req.acScope.platform ? 'platform' : 'site', siteId: req.acScope.siteId,
        teams: TEAMS, templateStates: TEMPLATE_STATES, origins: ORIGINS, levels: LEVELS,
        installationStates: INSTALLATION_STATES, auditActions: AUDIT_ACTIONS, siteTypes: siteTypeCatalog(),
        agency: { owner: AGENCY_SOURCE.owner, repo: AGENCY_SOURCE.repo, ref: AGENCY_SOURCE.ref, license: AGENCY_SOURCE.license, divisions: AGENCY_DIVISIONS },
        tools: TOOL_CATALOG.map(t => ({ key: t.key, module: t.module, risk: t.risk, team: t.team, description: t.description, parameters: t.parameters })),
        risk: RISK, grantModes: GRANT_MODES, prohibited: PROHIBITED, workflows: WORKFLOWS, taskStates: TASK_STATES,
        eventTypes: AGENT_EVENT_TYPES, featureLabels: FEATURE_LABELS,
        teamPresets: TEAM_PRESETS, rolloutStates: ROLLOUT_STATES, defaultWaves: DEFAULT_WAVES,
        alertKinds: ALERT_KINDS,
        stepTypes: STEP_TYPES, maxSteps: MAX_STEPS, feedbackVerdicts: FEEDBACK_VERDICTS, pilotStates: PILOT_STATES,
    });
}));

router.get('/overview', platformOnly, wrap(async (req, res) => {
    // v4.1323 — El catálogo es el repositorio de The Agency: la primera vez se
    // restablece solo (con copia de lo borrado); ya no se migran los heredados.
    const catalogReset = await AC.agencyCatalogOnce(req.user);
    const [base, runtime, usage] = await Promise.all([R.overview(), RT.runtimeOverview(), usageSummary({ days: 30 })]);
    res.json({ ...base, runtime, usage30d: usage.totals, catalogReset });
}));

// La portada de un sitio: sus agentes, lo que espera decisión y su consumo.
router.get('/site-overview', wrap(async (req, res) => {
    const siteId = siteOf(req, req.query.siteId);
    if (!siteId) return res.status(400).json({ error: 'Falta el sitio.' });
    const [installations, approvals, tasks, usage, site] = await Promise.all([
        R.listInstallations({ siteId }), RT.listApprovals({ status: 'pending', siteId }), RT.listTasks({ siteId, limit: 10 }),
        usageSummary({ days: 30, siteId }), db.query(`SELECT id, name, type FROM "Club" WHERE id::text = $1`, [siteId]).then(r => r.rows[0] || null),
    ]);
    const policy = site ? await R.policyForSiteType(site.type) : null;
    res.json({ site, policy, installations, pendingApprovals: approvals.length, recentTasks: tasks, usage30d: usage.totals });
}));

router.get('/settings', platformOnly, wrap(async (req, res) => res.json(await R.getSettings())));
router.put('/settings', platformOnly, wrap(async (req, res) => res.json(await R.saveSettings(req.body || {}, req.user))));
router.get('/site-types', platformOnly, wrap(async (req, res) => res.json({ siteTypes: await R.listSiteTypePolicies() })));
// v4.1323 — Retirada: el catálogo es SÓLO el repositorio de The Agency.
router.post('/migrate-legacy', platformOnly, (req, res) => res.status(410).json({ error: 'Retirado en v4.1323: el catálogo es el repositorio de The Agency.' }));

router.get('/templates', platformOnly, wrap(async (req, res) => {
    await AC.agencyCatalogOnce(req.user);
    const { team, status, origin, q } = req.query;
    res.json({ templates: await R.listTemplates({ team, status, origin, q }) });
}));
router.post('/templates', platformOnly, wrap(async (req, res) => res.status(201).json(await R.createTemplate(req.body || {}, req.user))));

router.get('/installations', wrap(async (req, res) => {
    const { templateId, siteType } = req.query;
    res.json({ installations: await R.listInstallations({ templateId: req.acScope.platform ? templateId : null, siteId: siteOf(req, req.query.siteId), siteType: req.acScope.platform ? siteType : null }) });
}));
router.post('/installations', platformOnly, wrap(async (req, res) => {
    const inst = await R.createInstallation(req.body || {}, req.user);
    await RT.applyRequestedGrants(inst.id, req.user).catch(() => {});
    res.status(201).json(inst);
}));

router.get('/sites', platformOnly, wrap(async (req, res) => res.json({ sites: await R.searchSites({ q: req.query.q || '', type: req.query.type || null }) })));
router.get('/skills', platformOnly, wrap(async (req, res) => res.json({ skills: await R.listSkills() })));
router.post('/skills/sync', platformOnly, wrap(async (req, res) => res.json(await R.syncSkillsFromBundle(req.user))));
router.get('/agency/catalog', platformOnly, wrap(async (req, res) => res.json(await AC.catalogStatus())));
router.post('/agency/sync', platformOnly, wrap(async (req, res) => res.json(await AC.syncAgencyCatalog(req.user))));
router.post('/agency/reset', platformOnly, wrap(async (req, res) => {
    if (req.body?.confirm !== 'RESTABLECER') return res.status(400).json({ error: 'Escribe RESTABLECER para confirmar.' });
    res.json(await AC.resetToAgencyCatalog(req.user, { reason: 'manual' }));
}));

// ── Runtime ──
router.get('/tasks', wrap(async (req, res) => res.json({ tasks: await RT.listTasks({ status: req.query.status || null, siteId: siteOf(req, req.query.siteId) }) })));
router.get('/runs', wrap(async (req, res) => res.json({ runs: await RT.listRuns({ siteId: siteOf(req, req.query.siteId) }) })));
router.get('/approvals', wrap(async (req, res) => res.json({ approvals: await RT.listApprovals({ status: req.query.status ?? 'pending', siteId: siteOf(req, req.query.siteId) }) })));
router.get('/workflow-runs', wrap(async (req, res) => res.json({ runs: await RT.listWorkflowRuns({ siteId: siteOf(req, req.query.siteId), workflowKey: req.query.workflowKey || null }) })));
router.post('/workflow-runs', wrap(async (req, res) => {
    const { workflowKey, siteId, input } = req.body || {};
    res.status(201).json(await RT.runWorkflow({ workflowKey, siteId: siteOf(req, siteId), input: input || {}, trigger: 'manual', user: req.user }));
}));
router.get('/schedules', wrap(async (req, res) => res.json({ schedules: (await RT.listSchedules({ siteId: siteOf(req, req.query.siteId) })).map(s => ({ ...s, cadenceLabel: describeCadence(s.cadence) })) })));
router.post('/schedules', wrap(async (req, res) => res.status(201).json(await RT.saveSchedule({ ...(req.body || {}), id: null, siteId: siteOf(req, req.body?.siteId) }, req.user))));
router.post('/pilots/seed', platformOnly, (req, res) => res.status(410).json({ error: 'Retirado en v4.1323: el catálogo es el repositorio de The Agency.' }));
router.post('/tick', platformOnly, wrap(async (req, res) => res.json(await RT.tick({ budgetMs: 60_000 }))));
router.get('/usage', wrap(async (req, res) => res.json(await usageSummary({ days: Number(req.query.days) || 30, siteId: siteOf(req, req.query.siteId) }))));
router.get('/usage/events', wrap(async (req, res) => res.json({ events: await recentUsageEvents({ limit: Number(req.query.limit) || 50, siteId: siteOf(req, req.query.siteId) }) })));
router.get('/usage/prices', platformOnly, wrap(async (req, res) => res.json({ prices: await currentPrices() })));
router.put('/usage/prices', platformOnly, wrap(async (req, res) => res.json({ prices: await savePrice(req.body || {}, req.user) })));

// ── Despliegues y mapa (Fase 3) ──
router.get('/rollouts', platformOnly, wrap(async (req, res) => res.json({ rollouts: await RO.listRollouts() })));
router.post('/rollouts', platformOnly, wrap(async (req, res) => res.status(201).json(await RO.createRollout(req.body || {}, req.user))));
router.post('/rollouts/preview', platformOnly, wrap(async (req, res) => res.json(await RO.previewRollout(req.body || {}))));
router.get('/network', wrap(async (req, res) => {
    const siteId = siteOf(req, req.query.siteId);
    const installations = await R.listInstallations({ siteId });
    const ids = installations.map(i => i.id);
    const grants = ids.length ? (await db.query(`SELECT "installationId", tool, mode FROM "AgentToolGrant" WHERE "installationId" = ANY($1)`, [ids])).rows : [];
    const tpls = (await db.query(`SELECT id, team, draft->>'name' AS name FROM "AgentTemplate" WHERE id = ANY($1)`, [[...new Set(installations.map(i => i.templateId))]])).rows;
    const moduleLabels = Object.fromEntries(MODULES.map(m => [m.key, m.label]));
    res.json(buildNetwork({ teams: TEAMS, templates: tpls, installations, grants, catalog: TOOL_CATALOG, moduleLabels: { ...moduleLabels, agents: 'Agentes IA' } }));
}));

// ── Memoria y observabilidad (Fase 4) ──
router.get('/memory', wrap(async (req, res) => res.json(await MEM.memoryOverview({ siteId: req.acScope.platform ? null : req.acScope.siteId }))));
router.post('/memory/vector/enable', platformOnly, wrap(async (req, res) => {
    const ensured = await MEM.ensureVectorSupport();
    if (!ensured.ok) return res.status(409).json({ error: ensured.reason });
    await R.saveSettings({ vectorSearch: true }, req.user);
    res.json({ ...ensured, backfill: await MEM.backfillVectors({ limit: 3000 }), status: await MEM.vectorStatus({ fresh: true }) });
}));
router.post('/memory/vector/disable', platformOnly, wrap(async (req, res) => { await R.saveSettings({ vectorSearch: false }, req.user); res.json({ status: await MEM.vectorStatus({ fresh: true }) }); }));
router.post('/memory/vector/backfill', platformOnly, wrap(async (req, res) => res.json(await MEM.backfillVectors({ limit: 3000 }))));
router.post('/memory/purge-master', platformOnly, wrap(async (req, res) => {
    const dryRun = req.body?.confirm !== 'LIMPIAR';
    const r = await MEM.purgeMasterPrivateCopies({ dryRun });
    if (!dryRun) await R.audit(req.user, { entityType: 'memory', entityId: 'master', action: 'setting_changed', after: { purgedMasterCopies: r.removed } });
    res.json(r);
}));
router.get('/alerts', wrap(async (req, res) => res.json({ alerts: await OB.listAlerts({ status: req.query.status ?? 'open', siteId: siteOf(req, req.query.siteId) }) })));
router.post('/alerts/compute', platformOnly, wrap(async (req, res) => res.json(await OB.computeAlerts())));
router.get('/analytics', wrap(async (req, res) => res.json(await OB.agentAnalytics({ days: Number(req.query.days) || 30, siteId: siteOf(req, req.query.siteId) }))));
router.get('/budgets', platformOnly, wrap(async (req, res) => res.json(await OB.getBudgets())));
router.put('/budgets', platformOnly, wrap(async (req, res) => res.json(await OB.saveBudgets(req.body || {}, req.user))));

// ── Piloto y constructor (Fases 5–6) ──
router.get('/pilots', platformOnly, wrap(async (req, res) => res.json({ pilots: await SC.listPilots() })));
router.post('/pilots', platformOnly, wrap(async (req, res) => res.status(201).json(await SC.savePilot({ ...(req.body || {}), id: null }, req.user))));
router.get('/custom-workflows', wrap(async (req, res) => res.json({ workflows: await SC.listCustomWorkflows(req.acScope) })));
router.post('/custom-workflows', wrap(async (req, res) => res.status(201).json(await SC.createCustomWorkflow(req.body || {}, req.acScope, req.user))));

router.get('/audit', platformOnly, wrap(async (req, res) => res.json({ entries: await R.listAudit({ limit: Number(req.query.limit) || 100, entityId: req.query.entityId || null }) })));

// ── Dirección IA (v4.1329) ──
// El sitio del Director y de cada plan sale de `siteOf` (la sesión para un
// sitio); el texto del objetivo nunca elige organización.
router.get('/director', wrap(async (req, res) => {
    const siteId = siteOf(req, req.query.siteId);
    const template = await DIR.directorTemplate();
    if (!siteId) return res.json({ site: null, template: template ? { id: template.id, status: template.status } : null, planStates: DIR.PLAN_STATES, quickActions: DIR.QUICK_ACTIONS });
    res.json({ ...(await DIR.directorOverview(siteId)), template: template ? { id: template.id, status: template.status } : null, planStates: DIR.PLAN_STATES });
}));
router.post('/director/template', platformOnly, wrap(async (req, res) => {
    // El catálogo se restablece UNA vez al abrir el registro: si eso no pasó
    // todavía, pasa antes (si no, borraría la plantilla recién creada).
    await AC.agencyCatalogOnce(req.user);
    res.json(await DIR.ensureDirectorTemplate(req.user));
}));
router.post('/director/install', platformOnly, wrap(async (req, res) => {
    if (!req.body?.siteId) return res.status(400).json({ error: 'Falta el sitio.' });
    await AC.agencyCatalogOnce(req.user);
    res.status(201).json(await DIR.installDirector(String(req.body.siteId), req.user));
}));
router.get('/director/plans', wrap(async (req, res) => res.json({ plans: await DIR.listPlans({ siteId: siteOf(req, req.query.siteId) }) })));
router.post('/director/plans', wrap(async (req, res) => {
    const b = req.body || {};
    const siteId = siteOf(req, b.siteId);
    if (!siteId) return res.status(400).json({ error: 'Elige la organización.' });
    res.status(201).json(await DIR.createPlan({ siteId, objective: b.objective, capabilities: Array.isArray(b.capabilities) ? b.capabilities : [], asDraft: Boolean(b.asDraft), previousPlanId: b.previousPlanId || null }, req.user));
}));

// ── Paramétricas ───────────────────────────────────────────────────────
router.put('/site-types/:type', platformOnly, wrap(async (req, res) => res.json(await R.saveSiteTypePolicy(req.params.type, req.body || {}, req.user))));

router.get('/templates/:id', platformOnly, wrap(async (req, res) => res.json(await R.getTemplate(req.params.id))));
router.patch('/templates/:id/draft', platformOnly, wrap(async (req, res) => res.json(await R.saveDraft(req.params.id, req.body || {}, req.user))));
router.post('/templates/:id/status', platformOnly, wrap(async (req, res) => res.json(await R.changeTemplateStatus(req.params.id, String(req.body?.status || ''), req.user, req.body?.changelog))));
router.post('/templates/:id/publish', platformOnly, wrap(async (req, res) => res.json(await R.publishVersion(req.params.id, req.body?.changelog || '', req.user))));

// Un sitio ajusta SUS instalaciones: encender, responsable, nombre e
// instrucciones propias. Presupuesto y fijar versión son de la plataforma.
router.patch('/installations/:id', wrap(async (req, res) => {
    const inst = await R.getInstallation(req.params.id);
    ownOr404(req, inst.siteId);
    const body = req.body || {};
    const allowed = req.acScope.platform ? body : {
        ...('enabled' in body ? { enabled: body.enabled } : {}),
        ...('responsibleUserId' in body ? { responsibleUserId: body.responsibleUserId } : {}),
        ...(body.overrides ? { overrides: { ...('displayName' in body.overrides ? { displayName: body.overrides.displayName } : {}), ...('extraInstructions' in body.overrides ? { extraInstructions: body.overrides.extraInstructions } : {}) } } : {}),
    };
    if (!req.acScope.platform && allowed.responsibleUserId) {
        const ok = (await R.siteManagers(inst.siteId)).some(u => String(u.id) === String(allowed.responsibleUserId));
        if (!ok) throw new R.RegistryError('El responsable tiene que administrar este sitio.', 400);
    }
    res.json(await R.updateInstallation(inst.id, allowed, req.user));
}));
router.delete('/installations/:id', platformOnly, wrap(async (req, res) => res.json(await R.removeInstallation(req.params.id, req.user))));
router.get('/installations/:id/grants', wrap(async (req, res) => {
    ownOr404(req, (await R.getInstallation(req.params.id)).siteId);
    res.json({ grants: await RT.listGrants(req.params.id) });
}));
router.put('/installations/:id/grants', platformOnly, wrap(async (req, res) => res.json({ grants: await RT.setGrant(req.params.id, String(req.body?.tool || ''), req.body?.mode || null, req.user) })));
router.post('/installations/:id/run', wrap(async (req, res) => {
    ownOr404(req, (await R.getInstallation(req.params.id)).siteId);
    const goal = String(req.body?.goal || '').trim();
    if (goal.length < 5) return res.status(400).json({ error: 'Escribe qué debe hacer el agente.' });
    const task = await RT.enqueueTask({ installationId: req.params.id, title: goal.slice(0, 120), goal, requestedBy: req.user?.id || null, priority: 1 });
    const [claimed] = await RT.claimTaskById(task.id);
    if (claimed) await RT.executeTask(claimed, { deadline: Date.now() + 100_000 });
    res.json(await RT.getTask(task.id));
}));

router.get('/tasks/:id', wrap(async (req, res) => { const t = await RT.getTask(req.params.id); ownOr404(req, t.siteId); res.json(t); }));
router.post('/tasks/:id/cancel', wrap(async (req, res) => { ownOr404(req, (await RT.getTask(req.params.id)).siteId); res.json(await RT.cancelTask(req.params.id, req.user)); }));
router.post('/tasks/:id/retry', wrap(async (req, res) => { ownOr404(req, (await RT.getTask(req.params.id)).siteId); res.json(await RT.retryTask(req.params.id, req.user)); }));
router.post('/approvals/:id/decide', wrap(async (req, res) => res.json(await RT.decideApproval(req.params.id, req.body?.decision === 'approve' ? 'approve' : 'reject', req.user, req.body?.note || ''))));
router.get('/workflow-runs/:id', wrap(async (req, res) => { const r = await RT.getWorkflowRun(req.params.id); ownOr404(req, r.siteId); res.json(r); }));
router.get('/workflow-runs/:id/feedback', wrap(async (req, res) => {
    const run = await RT.getWorkflowRun(req.params.id);
    ownOr404(req, run.siteId);
    res.json({ feedback: await SC.listFeedback(run.id), findings: findingsOf(run.report) });
}));
router.post('/workflow-runs/:id/feedback', wrap(async (req, res) => { ownOr404(req, (await RT.getWorkflowRun(req.params.id)).siteId); res.json({ feedback: await SC.saveFeedback(req.params.id, req.body || {}, req.user) }); }));
router.post('/workflow-runs/:id/validate', wrap(async (req, res) => res.json(await RT.validateWorkflowRun(req.params.id, req.user, req.body?.note || ''))));
router.put('/schedules/:id', wrap(async (req, res) => {
    const s = (await RT.listSchedules({})).find(x => x.id === req.params.id);
    if (!s) throw new R.RegistryError('Programación no encontrada.', 404);
    ownOr404(req, s.siteId);
    res.json(await RT.saveSchedule({ ...(req.body || {}), id: req.params.id }, req.user));
}));
router.delete('/schedules/:id', wrap(async (req, res) => {
    const s = (await RT.listSchedules({})).find(x => x.id === req.params.id);
    if (!s) throw new R.RegistryError('Programación no encontrada.', 404);
    ownOr404(req, s.siteId);
    res.json(await RT.deleteSchedule(req.params.id, req.user));
}));

router.get('/pilots/:id', platformOnly, wrap(async (req, res) => res.json(await SC.getPilot(req.params.id))));
router.put('/pilots/:id', platformOnly, wrap(async (req, res) => res.json(await SC.savePilot({ ...(req.body || {}), id: req.params.id }, req.user))));
router.post('/pilots/:id/conclude', platformOnly, wrap(async (req, res) => res.json(await SC.concludePilot(req.params.id, req.body || {}, req.user))));
router.get('/custom-workflows/:id', wrap(async (req, res) => res.json(await SC.getCustomWorkflow(req.params.id, req.acScope))));
router.put('/custom-workflows/:id', wrap(async (req, res) => res.json(await SC.saveCustomDraft(req.params.id, req.body || {}, req.acScope, req.user))));
router.post('/custom-workflows/:id/publish', wrap(async (req, res) => res.json(await SC.publishCustomWorkflow(req.params.id, req.body?.changelog || '', req.acScope, req.user))));
router.delete('/custom-workflows/:id', wrap(async (req, res) => res.json(await SC.archiveCustomWorkflow(req.params.id, req.acScope, req.user))));

router.get('/rollouts/:id', platformOnly, wrap(async (req, res) => res.json(await RO.getRollout(req.params.id))));
router.post('/rollouts/:id/advance', platformOnly, wrap(async (req, res) => res.json(await RO.advanceRollout(req.params.id, { confirmCount: req.body?.confirmCount ?? null, force: Boolean(req.body?.force) }, req.user))));
router.post('/rollouts/:id/pause', platformOnly, wrap(async (req, res) => res.json(await RO.pauseRollout(req.params.id, req.user))));
router.post('/rollouts/:id/rollback', platformOnly, wrap(async (req, res) => res.json(await RO.rollbackRollout(req.params.id, req.user))));

router.post('/alerts/:id/status', wrap(async (req, res) => {
    const a = (await OB.listAlerts({ status: '', siteId: null, limit: 300 })).find(x => x.id === req.params.id);
    if (!a) throw new R.RegistryError('Alerta no encontrada.', 404);
    ownOr404(req, a.siteId);
    res.json(await OB.setAlertStatus(req.params.id, String(req.body?.status || ''), req.user));
}));

router.get('/director/plans/:id', wrap(async (req, res) => { const p = await DIR.getPlan(req.params.id); ownOr404(req, p.siteId); res.json(p); }));
router.post('/director/plans/:id/decide', wrap(async (req, res) => {
    ownOr404(req, (await DIR.getPlan(req.params.id)).siteId);
    res.json(await DIR.decidePlan(req.params.id, String(req.body?.decision || ''), req.user, req.body?.note || ''));
}));
router.post('/director/plans/:id/step', wrap(async (req, res) => {
    ownOr404(req, (await DIR.getPlan(req.params.id)).siteId);
    res.json(await DIR.runNextStep(req.params.id, req.user));
}));

router.get('/sites/:id/managers', wrap(async (req, res) => { ownOr404(req, req.params.id); res.json({ users: await R.siteManagers(req.params.id) }); }));
router.get('/skills/:key', platformOnly, wrap(async (req, res) => res.json(await R.getSkill(req.params.key))));

export default router;
