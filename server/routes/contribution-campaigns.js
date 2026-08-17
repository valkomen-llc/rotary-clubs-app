// Rutas de Campañas de Contribución — v4.803
//
// Las de gestión son del OPERADOR de la plataforma (mismo criterio que
// /api/admin/districts): la campaña alcanza a muchos sitios, así que no es
// una pantalla de club. Las dos públicas son de sólo lectura: la campaña
// activa de UN sitio y la vista previa con token firmado.

import express from 'express';
import { authMiddleware, roleMiddleware, requireSiteAdmin } from '../middleware/auth.js';
import {
    listCampaigns, getCampaign, createCampaign, updateCampaign,
    transitionCampaign, deleteCampaign, issuePreviewToken,
    getActiveCampaign, getPreviewCampaign, getCampaignContributors,
    listCenters, saveCenters,
    getSiteCampaign, saveSiteOverride, saveSiteCenters,
    trackCampaignEvent, getCampaignMetrics,
    listReadings, runReadings, decideReading,
} from '../controllers/contributionCampaignController.js';

const router = express.Router();
const superAdminOnly = roleMiddleware(['administrator']);

// Públicas — sin sesión. `active` corre en cada visita de la página de
// aportes (Fase 2) y degrada a { campaign: null } ante cualquier fallo.
router.get('/active', getActiveCampaign);

// F4 — la vía del ADMINISTRADOR DEL SITIO: lo que su club puede tocar
// (whitelist de sanitizeOverride) y sus centros propios. El clubId sale del
// token, nunca del body. Van ANTES de /:id para que «site» no se lea como id.
router.get('/site/current', authMiddleware, requireSiteAdmin, getSiteCampaign);
router.put('/site/override', authMiddleware, requireSiteAdmin, saveSiteOverride);
router.put('/site/centers', authMiddleware, requireSiteAdmin, saveSiteCenters);

router.get('/:id/preview', getPreviewCampaign);
// v4.862 — cuántos aportes lleva la campaña y quiénes dieron su nombre. Sólo
// lectura, sin sesión y sin PII: un aporte anónimo no viaja acá ni con el
// nombre escondido — se descarta en el servidor (ver contributorRoll.js).
router.get('/:id/contributors', getCampaignContributors);
// F5 — la página reporta vista y clics. Público y sin PII; los eventos que
// valen dinero (checkout, donación) los escribe el servidor, no el navegador.
router.post('/:id/track', trackCampaignEvent);

// Gestión — operador de la plataforma.
router.get('/', authMiddleware, superAdminOnly, listCampaigns);
router.post('/', authMiddleware, superAdminOnly, createCampaign);
router.get('/:id', authMiddleware, superAdminOnly, getCampaign);
router.put('/:id', authMiddleware, superAdminOnly, updateCampaign);
router.post('/:id/status', authMiddleware, superAdminOnly, transitionCampaign);
router.post('/:id/preview-token', authMiddleware, superAdminOnly, issuePreviewToken);
// F3 — centros de acopio CENTRALES (los locales de cada club llegan en F4
// por su propia ruta con requireSiteAdmin: mezclar los dos editores en una
// haría fácil que el batch central pisara filas ajenas).
router.get('/:id/centers', authMiddleware, superAdminOnly, listCenters);
router.put('/:id/centers', authMiddleware, superAdminOnly, saveCenters);
router.get('/:id/metrics', authMiddleware, superAdminOnly, getCampaignMetrics);
// v4.825 — la lectura automatizada del «Panorama de la emergencia». Las
// propuestas y su decisión son del OPERADOR: ponen una cifra en la página de
// muchos sitios a la vez, no en la de uno.
router.get('/:id/readings', authMiddleware, superAdminOnly, listReadings);
router.post('/:id/readings/run', authMiddleware, superAdminOnly, runReadings);
router.post('/:id/readings/:readingId', authMiddleware, superAdminOnly, decideReading);
router.delete('/:id', authMiddleware, superAdminOnly, deleteCampaign);

export default router;
