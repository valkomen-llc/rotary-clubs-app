// ════════════════════════════════════════════════════════════════════════════
// AI Agent Command Center — API (/api/agent-center) — v4.1315.0
//
// Fase 1: el REGISTRO. Sólo la administración de la plataforma (Fase 3 abre a
// cada sitio la gestión de SUS instalaciones). El criterio vive en
// `agentRegistrySpec.js`; la base, en `agentRegistryStore.js`.
//
// ⚠️ Las rutas literales van ANTES que las paramétricas (check:routes).
// ════════════════════════════════════════════════════════════════════════════
import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { isPlatformAdmin } from '../lib/agentScope.js';
import * as R from '../lib/agentRegistryStore.js';
import * as RT from '../lib/agentRuntimeStore.js';
import { usageSummary, recentUsageEvents, currentPrices, savePrice, FEATURE_LABELS } from '../lib/aiUsage.js';
import { TOOL_CATALOG, RISK, GRANT_MODES, PROHIBITED, WORKFLOWS, TASK_STATES, AGENT_EVENT_TYPES, describeCadence } from '../lib/agentRuntimeSpec.js';
import {
    TEAMS, TEMPLATE_STATES, ORIGINS, LEVELS, INSTALLATION_STATES, AUDIT_ACTIONS, AGENCY_SOURCE, siteTypeCatalog,
} from '../lib/agentRegistrySpec.js';

const router = express.Router();

console.log('[agent-center] v4.1316.0 — registro, runtime, aprobaciones, workflows piloto y consumo de IA');

function requirePlatform(req, res, next) {
    if (!isPlatformAdmin(req.user)) return res.status(403).json({ error: 'Access denied' });
    next();
}

const wrap = (fn) => async (req, res) => {
    try {
        await fn(req, res);
    } catch (err) {
        const status = err instanceof R.RegistryError ? err.status : 500;
        if (status >= 500) console.error('[agent-center]', req.method, req.originalUrl, err);
        res.status(status).json({ error: err.message || 'Error del registro de agentes' });
    }
};

router.use(authMiddleware, requirePlatform);

// ── Literales ──────────────────────────────────────────────────────────
router.get('/meta', wrap(async (req, res) => {
    res.json({
        teams: TEAMS, templateStates: TEMPLATE_STATES, origins: ORIGINS, levels: LEVELS,
        installationStates: INSTALLATION_STATES, auditActions: AUDIT_ACTIONS, siteTypes: siteTypeCatalog(),
        agency: { owner: AGENCY_SOURCE.owner, repo: AGENCY_SOURCE.repo, ref: AGENCY_SOURCE.ref, license: AGENCY_SOURCE.license },
        tools: TOOL_CATALOG.map(t => ({ key: t.key, module: t.module, risk: t.risk, team: t.team, description: t.description })),
        risk: RISK, grantModes: GRANT_MODES, prohibited: PROHIBITED, workflows: WORKFLOWS, taskStates: TASK_STATES,
        eventTypes: AGENT_EVENT_TYPES, featureLabels: FEATURE_LABELS,
    });
}));

router.get('/overview', wrap(async (req, res) => {
    const migrated = await R.migrateLegacyOnce(req.user);
    const [base, runtime, usage] = await Promise.all([R.overview(), RT.runtimeOverview(), usageSummary({ days: 30 })]);
    res.json({ ...base, runtime, usage30d: usage.totals, migratedNow: migrated });
}));

router.get('/settings', wrap(async (req, res) => res.json(await R.getSettings())));
router.put('/settings', wrap(async (req, res) => res.json(await R.saveSettings(req.body || {}, req.user))));

router.get('/site-types', wrap(async (req, res) => res.json({ siteTypes: await R.listSiteTypePolicies() })));

router.post('/migrate-legacy', wrap(async (req, res) => res.json(await R.migrateLegacy(req.user))));

router.get('/templates', wrap(async (req, res) => {
    await R.migrateLegacyOnce(req.user);
    const { team, status, origin, q } = req.query;
    res.json({ templates: await R.listTemplates({ team, status, origin, q }) });
}));
router.post('/templates', wrap(async (req, res) => res.status(201).json(await R.createTemplate(req.body || {}, req.user))));

router.get('/installations', wrap(async (req, res) => {
    const { templateId, siteId, siteType } = req.query;
    res.json({ installations: await R.listInstallations({ templateId, siteId, siteType }) });
}));
router.post('/installations', wrap(async (req, res) => {
    const inst = await R.createInstallation(req.body || {}, req.user);
    // Las herramientas que la versión pide se conceden al instalar (con su modo).
    await RT.applyRequestedGrants(inst.id, req.user).catch(() => {});
    res.status(201).json(inst);
}));

router.get('/sites', wrap(async (req, res) => res.json({ sites: await R.searchSites({ q: req.query.q || '', type: req.query.type || null }) })));

router.get('/skills', wrap(async (req, res) => res.json({ skills: await R.listSkills() })));
router.post('/skills/sync', wrap(async (req, res) => res.json(await R.syncSkillsFromBundle(req.user))));

router.get('/agency/catalog', wrap(async (req, res) => {
    const imported = await R.agencyCatalogStatus();
    res.json({
        source: { owner: AGENCY_SOURCE.owner, repo: AGENCY_SOURCE.repo, ref: AGENCY_SOURCE.ref, license: AGENCY_SOURCE.license },
        entries: AGENCY_SOURCE.curated.map(c => ({ ...c, imported: imported.get(c.path) || null })),
    });
}));
router.post('/agency/import', wrap(async (req, res) => res.json(await R.importAgencyAgent(String(req.body?.path || ''), req.user))));

// ── Runtime (Fase 2) ──
router.get('/tasks', wrap(async (req, res) => res.json({ tasks: await RT.listTasks({ status: req.query.status || null, siteId: req.query.siteId || null }) })));
router.get('/runs', wrap(async (req, res) => res.json({ runs: await RT.listRuns({ siteId: req.query.siteId || null }) })));
router.get('/approvals', wrap(async (req, res) => res.json({ approvals: await RT.listApprovals({ status: req.query.status ?? 'pending', siteId: req.query.siteId || null }) })));
router.get('/workflow-runs', wrap(async (req, res) => res.json({ runs: await RT.listWorkflowRuns({ siteId: req.query.siteId || null, workflowKey: req.query.workflowKey || null }) })));
router.post('/workflow-runs', wrap(async (req, res) => {
    const { workflowKey, siteId, input } = req.body || {};
    res.status(201).json(await RT.runWorkflow({ workflowKey, siteId, input: input || {}, trigger: 'manual', user: req.user }));
}));
router.get('/schedules', wrap(async (req, res) => res.json({ schedules: (await RT.listSchedules({ siteId: req.query.siteId || null })).map(s => ({ ...s, cadenceLabel: describeCadence(s.cadence) })) })));
router.post('/schedules', wrap(async (req, res) => res.status(201).json(await RT.saveSchedule(req.body || {}, req.user))));
router.post('/pilots/seed', wrap(async (req, res) => res.json(await RT.seedPilotTemplates(req.user))));
router.post('/tick', wrap(async (req, res) => res.json(await RT.tick({ budgetMs: 60_000 }))));
router.get('/usage', wrap(async (req, res) => res.json(await usageSummary({ days: Number(req.query.days) || 30, siteId: req.query.siteId || null }))));
router.get('/usage/events', wrap(async (req, res) => res.json({ events: await recentUsageEvents({ limit: Number(req.query.limit) || 50, siteId: req.query.siteId || null }) })));
router.get('/usage/prices', wrap(async (req, res) => res.json({ prices: await currentPrices() })));
router.put('/usage/prices', wrap(async (req, res) => res.json({ prices: await savePrice(req.body || {}, req.user) })));

router.get('/audit', wrap(async (req, res) => res.json({ entries: await R.listAudit({ limit: Number(req.query.limit) || 100, entityId: req.query.entityId || null }) })));

// ── Paramétricas ───────────────────────────────────────────────────────
router.put('/site-types/:type', wrap(async (req, res) => res.json(await R.saveSiteTypePolicy(req.params.type, req.body || {}, req.user))));

router.get('/templates/:id', wrap(async (req, res) => res.json(await R.getTemplate(req.params.id))));
router.patch('/templates/:id/draft', wrap(async (req, res) => res.json(await R.saveDraft(req.params.id, req.body || {}, req.user))));
router.post('/templates/:id/status', wrap(async (req, res) => res.json(await R.changeTemplateStatus(req.params.id, String(req.body?.status || ''), req.user, req.body?.changelog))));
router.post('/templates/:id/publish', wrap(async (req, res) => res.json(await R.publishVersion(req.params.id, req.body?.changelog || '', req.user))));

router.patch('/installations/:id', wrap(async (req, res) => res.json(await R.updateInstallation(req.params.id, req.body || {}, req.user))));
router.delete('/installations/:id', wrap(async (req, res) => res.json(await R.removeInstallation(req.params.id, req.user))));

router.get('/installations/:id/grants', wrap(async (req, res) => res.json({ grants: await RT.listGrants(req.params.id) })));
router.put('/installations/:id/grants', wrap(async (req, res) => res.json({ grants: await RT.setGrant(req.params.id, String(req.body?.tool || ''), req.body?.mode || null, req.user) })));
// «Probar agente»: encola y ejecuta en el acto (dentro del tope de la función).
router.post('/installations/:id/run', wrap(async (req, res) => {
    const goal = String(req.body?.goal || '').trim();
    if (goal.length < 5) return res.status(400).json({ error: 'Escribe qué debe hacer el agente.' });
    const task = await RT.enqueueTask({ installationId: req.params.id, title: goal.slice(0, 120), goal, requestedBy: req.user?.id || null, priority: 1 });
    const [claimed] = await RT.claimTaskById(task.id);
    if (claimed) await RT.executeTask(claimed, { deadline: Date.now() + 100_000 });
    res.json(await RT.getTask(task.id));
}));

router.get('/tasks/:id', wrap(async (req, res) => res.json(await RT.getTask(req.params.id))));
router.post('/tasks/:id/cancel', wrap(async (req, res) => res.json(await RT.cancelTask(req.params.id, req.user))));
router.post('/tasks/:id/retry', wrap(async (req, res) => res.json(await RT.retryTask(req.params.id, req.user))));
router.post('/approvals/:id/decide', wrap(async (req, res) => res.json(await RT.decideApproval(req.params.id, req.body?.decision === 'approve' ? 'approve' : 'reject', req.user, req.body?.note || ''))));
router.get('/workflow-runs/:id', wrap(async (req, res) => res.json(await RT.getWorkflowRun(req.params.id))));
router.put('/schedules/:id', wrap(async (req, res) => res.json(await RT.saveSchedule({ ...(req.body || {}), id: req.params.id }, req.user))));
router.delete('/schedules/:id', wrap(async (req, res) => res.json(await RT.deleteSchedule(req.params.id, req.user))));

router.get('/sites/:id/managers', wrap(async (req, res) => res.json({ users: await R.siteManagers(req.params.id) })));

router.get('/skills/:key', wrap(async (req, res) => res.json(await R.getSkill(req.params.key))));

export default router;
