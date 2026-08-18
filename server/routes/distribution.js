/**
 * Distribución multi-destino — rutas.
 *
 * Todas exigen sesión de plataforma. El alcance por sitio lo resuelve el
 * controlador con el `clubId` del token, no un parámetro de la petición.
 *
 * ⚠️ ORDEN: las literales van ANTES que las paramétricas de su grupo. Express
 * casa en orden de declaración y una literal declarada debajo de su
 * paramétrica es INALCANZABLE — el fallo no da 404, da la respuesta del
 * manejador equivocado. Lo comprueba npm run check:routes.
 */
import express from 'express';
import { authMiddleware, requireSiteAdmin } from '../middleware/auth.js';
import {
    listTargets, getGroups, saveGroups, getPagePosts, previewSchedule,
    postCampaign, getCampaigns, getOneCampaign, postPause, postResume, postCancel,
    postAdvance, postRetryJob, postManualDone,
} from '../controllers/distributionController.js';

const router = express.Router();

// ── Destinos ─────────────────────────────────────────────────────
router.get('/targets', authMiddleware, listTargets);
router.get('/groups', authMiddleware, getGroups);
router.get('/page-posts', authMiddleware, getPagePosts);

// Declarar los grupos y crear campañas son acciones administrativas del sitio:
// no es leer, es decidir a dónde se manda contenido institucional.
router.put('/groups', authMiddleware, requireSiteAdmin, saveGroups);

// ── Vista previa del calendario ──────────────────────────────────────────────
router.post('/preview', authMiddleware, previewSchedule);

// ── Campañas ─────────────────────────────────────────────────────────────────
router.get('/campaigns', authMiddleware, getCampaigns);
router.post('/campaigns', authMiddleware, requireSiteAdmin, postCampaign);
router.get('/campaigns/:id', authMiddleware, getOneCampaign);
router.post('/campaigns/:id/pause', authMiddleware, requireSiteAdmin, postPause);
router.post('/campaigns/:id/resume', authMiddleware, requireSiteAdmin, postResume);
router.post('/campaigns/:id/cancel', authMiddleware, requireSiteAdmin, postCancel);
router.post('/campaigns/:id/advance', authMiddleware, postAdvance);

// ── Destinos sueltos ─────────────────────────────────────────────────────────
router.post('/jobs/:id/retry', authMiddleware, requireSiteAdmin, postRetryJob);
router.post('/jobs/:id/manual', authMiddleware, requireSiteAdmin, postManualDone);

export default router;
