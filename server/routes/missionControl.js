// ════════════════════════════════════════════════════════════════════════════
// Rutas del Centro de Control Operacional
//
// ⚠️ Las rutas literales van ANTES que las paramétricas (check:routes).
// ════════════════════════════════════════════════════════════════════════════
import express from 'express';
import { authMiddleware, requireSiteAdmin } from '../middleware/auth.js';
import db from '../lib/db.js';
import { campaignIdsInScope } from '../controllers/contributionCampaignController.js';
import {
    getOperationalBoard,
    getOperationalCampaigns,
    runAutomations,
    advanceTask,
    approveAndPublishTask,
    generateTaskReel,
    shareTaskSocial,
    retryTask,
    transitionTaskStage,
    getTaskDetails,
    updateTaskMeta,
    setTaskCoverImage,
} from '../controllers/missionControlController.js';

const router = express.Router();

// v4.1314.0 — toda ruta /tasks/:submissionId/* exige que la solicitud esté en
// el ALCANCE de la sesión (las campañas propias y las que le alcanzan). Antes
// `details` y `advance` respondían a cualquier sesión que conociera el id, y
// el resto sólo pedía rol de sitio, no que la solicitud fuera de ese sitio.
// `campaignIdsInScope` devuelve null para la plataforma (sin límite).
async function requireSubmissionInScope(req, res, next) {
    try {
        const alcance = await campaignIdsInScope(req);
        if (alcance === null) return next();
        const { rows } = await db.query(
            'SELECT "campaignId" FROM "ContributionSubmission" WHERE id::text = $1',
            [String(req.params.submissionId || '')]
        );
        const sub = rows[0];
        if (!sub || !alcance.includes(String(sub.campaignId))) {
            return res.status(404).json({ error: 'Solicitud no encontrada' });
        }
        next();
    } catch (err) {
        console.error('[mission-control] scope check:', err?.message);
        res.status(500).json({ error: 'No se pudo verificar el alcance de la solicitud' });
    }
}

// Literales
router.get('/operational-board', authMiddleware, getOperationalBoard);
router.get('/operational-campaigns', authMiddleware, getOperationalCampaigns);
router.post('/run-automations', authMiddleware, requireSiteAdmin, runAutomations);

// Paramétricas
router.get('/tasks/:submissionId/details', authMiddleware, requireSubmissionInScope, getTaskDetails);
router.patch('/tasks/:submissionId/meta', authMiddleware, requireSubmissionInScope, requireSiteAdmin, updateTaskMeta);
router.post('/tasks/:submissionId/set-cover', authMiddleware, requireSubmissionInScope, requireSiteAdmin, setTaskCoverImage);
router.post('/tasks/:submissionId/advance', authMiddleware, requireSubmissionInScope, advanceTask);
router.post('/tasks/:submissionId/approve-publish', authMiddleware, requireSubmissionInScope, requireSiteAdmin, approveAndPublishTask);
router.post('/tasks/:submissionId/generate-reel', authMiddleware, requireSubmissionInScope, requireSiteAdmin, generateTaskReel);
router.post('/tasks/:submissionId/share-social', authMiddleware, requireSubmissionInScope, requireSiteAdmin, shareTaskSocial);
router.post('/tasks/:submissionId/retry', authMiddleware, requireSubmissionInScope, requireSiteAdmin, retryTask);
router.post('/tasks/:submissionId/transition', authMiddleware, requireSubmissionInScope, requireSiteAdmin, transitionTaskStage);

export default router;
