// Rutas de Campañas de Contribución — v4.803
//
// Las de gestión son del OPERADOR de la plataforma (mismo criterio que
// /api/admin/districts): la campaña alcanza a muchos sitios, así que no es
// una pantalla de club. Las dos públicas son de sólo lectura: la campaña
// activa de UN sitio y la vista previa con token firmado.

import express from 'express';
import { authMiddleware, roleMiddleware } from '../middleware/auth.js';
import {
    listCampaigns, getCampaign, createCampaign, updateCampaign,
    transitionCampaign, deleteCampaign, issuePreviewToken,
    getActiveCampaign, getPreviewCampaign,
} from '../controllers/contributionCampaignController.js';

const router = express.Router();
const superAdminOnly = roleMiddleware(['administrator']);

// Públicas — sin sesión. `active` corre en cada visita de la página de
// aportes (Fase 2) y degrada a { campaign: null } ante cualquier fallo.
router.get('/active', getActiveCampaign);
router.get('/:id/preview', getPreviewCampaign);

// Gestión — operador de la plataforma.
router.get('/', authMiddleware, superAdminOnly, listCampaigns);
router.post('/', authMiddleware, superAdminOnly, createCampaign);
router.get('/:id', authMiddleware, superAdminOnly, getCampaign);
router.put('/:id', authMiddleware, superAdminOnly, updateCampaign);
router.post('/:id/status', authMiddleware, superAdminOnly, transitionCampaign);
router.post('/:id/preview-token', authMiddleware, superAdminOnly, issuePreviewToken);
router.delete('/:id', authMiddleware, superAdminOnly, deleteCampaign);

export default router;
