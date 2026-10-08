// ════════════════════════════════════════════════════════════════════════════
// Rutas API: Gestión de Módulos por Sitio (Club Platform SaaS)
// ════════════════════════════════════════════════════════════════════════════
import express from 'express';
import { authMiddleware, roleMiddleware } from '../middleware/auth.js';
import {
    getGlobalSiteModules,
    getClubSiteModules,
    saveSiteModulesConfig,
    resetClubToGlobal,
    getAllClubsModulesStatus,
} from '../lib/siteModulesFeatures.js';
import { SITE_MODULES_CATALOG, SITE_MODULE_GROUPS, DEFAULT_SITE_MODULES_CONFIG } from '../lib/siteModulesSpec.js';

const router = express.Router();

const isSuperAdminUser = (user) => user?.role === 'administrator' || user?.role === 'superadmin';

/**
 * GET /api/site-modules/catalog
 * Devuelve el catálogo maestro de módulos y grupos disponibles.
 */
router.get('/catalog', authMiddleware, async (req, res) => {
    try {
        res.json({
            catalog: SITE_MODULES_CATALOG,
            groups: SITE_MODULE_GROUPS,
            defaults: DEFAULT_SITE_MODULES_CONFIG,
        });
    } catch (err) {
        console.error('[GET /api/site-modules/catalog] Error:', err);
        res.status(500).json({ error: 'Error cargando catálogo de módulos' });
    }
});

/**
 * GET /api/site-modules/all-clubs
 * Devuelve el listado de clubes para el selector de administración centralizada.
 * Exclusivo para Superadministradores de Club Platform.
 */
router.get('/all-clubs', authMiddleware, roleMiddleware(['administrator', 'superadmin']), async (req, res) => {
    try {
        const clubs = await getAllClubsModulesStatus();
        res.json({ clubs });
    } catch (err) {
        console.error('[GET /api/site-modules/all-clubs] Error:', err);
        res.status(500).json({ error: 'Error cargando listado de clubes' });
    }
});

/**
 * GET /api/site-modules/config
 * Devuelve la configuración de módulos activa para un club (o global).
 * Es público para lectura para que la barra lateral y las rutas puedan
 * renderizarse de inmediato y sin bloqueos de sesión.
 */
router.get('/config', async (req, res) => {
    try {
        const requestedClubId = req.query?.clubId ? String(req.query.clubId).trim() : null;
        const requestedSubdomain = req.query?.subdomain ? String(req.query.subdomain).trim() : null;
        const targetId = requestedClubId || requestedSubdomain;

        if (targetId && targetId !== 'global') {
            const result = await getClubSiteModules(targetId);
            return res.json({
                ...result,
                catalog: SITE_MODULES_CATALOG,
                groups: SITE_MODULE_GROUPS,
            });
        }

        // Si no se especifica clubId ni subdomain, devuelve la configuración global
        const globalMods = await getGlobalSiteModules();
        return res.json({
            clubId: 'global',
            isGlobal: true,
            hasCustomOverride: false,
            modules: globalMods,
            catalog: SITE_MODULES_CATALOG,
            groups: SITE_MODULE_GROUPS,
        });
    } catch (err) {
        console.error('[GET /api/site-modules/config] Error:', err);
        res.status(500).json({ error: 'Error obteniendo configuración de módulos' });
    }
});

/**
 * PUT /api/site-modules/config
 * Guarda la configuración de módulos a nivel general o para un club específico.
 * Exclusivo para Superadministradores de Club Platform.
 */
router.put('/config', authMiddleware, roleMiddleware(['administrator', 'superadmin']), async (req, res) => {
    try {
        const { clubId = 'global', modules = {}, resetToGlobal = false, applyDefaults = false } = req.body || {};

        if (resetToGlobal && clubId !== 'global') {
            const resetRes = await resetClubToGlobal(clubId);
            return res.json({
                ...resetRes,
                message: 'El sitio ahora hereda la configuración general predeterminada.',
            });
        }

        const saved = await saveSiteModulesConfig({ clubId, modules, applyDefaults });
        res.json({
            ...saved,
            message: saved.isGlobal
                ? 'Configuración general guardada para todos los sitios.'
                : 'Configuración personalizada guardada exitosamente para este sitio.',
        });
    } catch (err) {
        console.error('[PUT /api/site-modules/config] Error:', err);
        res.status(500).json({ error: 'Error guardando configuración de módulos' });
    }
});

export default router;
