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
import {
    TEAMS, TEMPLATE_STATES, ORIGINS, LEVELS, INSTALLATION_STATES, AUDIT_ACTIONS, AGENCY_SOURCE, siteTypeCatalog,
} from '../lib/agentRegistrySpec.js';

const router = express.Router();

console.log('[agent-center] v4.1315.0 — registro de agentes, tipos de sitio e importador');

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
    });
}));

router.get('/overview', wrap(async (req, res) => {
    const migrated = await R.migrateLegacyOnce(req.user);
    res.json({ ...(await R.overview()), migratedNow: migrated });
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
router.post('/installations', wrap(async (req, res) => res.status(201).json(await R.createInstallation(req.body || {}, req.user))));

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

router.get('/audit', wrap(async (req, res) => res.json({ entries: await R.listAudit({ limit: Number(req.query.limit) || 100, entityId: req.query.entityId || null }) })));

// ── Paramétricas ───────────────────────────────────────────────────────
router.put('/site-types/:type', wrap(async (req, res) => res.json(await R.saveSiteTypePolicy(req.params.type, req.body || {}, req.user))));

router.get('/templates/:id', wrap(async (req, res) => res.json(await R.getTemplate(req.params.id))));
router.patch('/templates/:id/draft', wrap(async (req, res) => res.json(await R.saveDraft(req.params.id, req.body || {}, req.user))));
router.post('/templates/:id/status', wrap(async (req, res) => res.json(await R.changeTemplateStatus(req.params.id, String(req.body?.status || ''), req.user, req.body?.changelog))));
router.post('/templates/:id/publish', wrap(async (req, res) => res.json(await R.publishVersion(req.params.id, req.body?.changelog || '', req.user))));

router.patch('/installations/:id', wrap(async (req, res) => res.json(await R.updateInstallation(req.params.id, req.body || {}, req.user))));
router.delete('/installations/:id', wrap(async (req, res) => res.json(await R.removeInstallation(req.params.id, req.user))));

router.get('/sites/:id/managers', wrap(async (req, res) => res.json({ users: await R.siteManagers(req.params.id) })));

router.get('/skills/:key', wrap(async (req, res) => res.json(await R.getSkill(req.params.key))));

export default router;
