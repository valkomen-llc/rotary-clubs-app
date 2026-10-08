// ════════════════════════════════════════════════════════════════════════════
// Rutas del Centro de Control Operacional
//
// ⚠️ Las rutas literales van ANTES que las paramétricas (check:routes).
// ════════════════════════════════════════════════════════════════════════════
import express from 'express';
import { authMiddleware, requireSiteAdmin } from '../middleware/auth.js';
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

// Literales
router.get('/operational-board', authMiddleware, getOperationalBoard);
router.get('/operational-campaigns', authMiddleware, getOperationalCampaigns);
router.post('/run-automations', authMiddleware, requireSiteAdmin, runAutomations);

// Paramétricas
router.get('/tasks/:submissionId/details', authMiddleware, getTaskDetails);
router.patch('/tasks/:submissionId/meta', authMiddleware, requireSiteAdmin, updateTaskMeta);
router.post('/tasks/:submissionId/set-cover', authMiddleware, requireSiteAdmin, setTaskCoverImage);
router.post('/tasks/:submissionId/advance', authMiddleware, advanceTask);
router.post('/tasks/:submissionId/approve-publish', authMiddleware, requireSiteAdmin, approveAndPublishTask);
router.post('/tasks/:submissionId/generate-reel', authMiddleware, requireSiteAdmin, generateTaskReel);
router.post('/tasks/:submissionId/share-social', authMiddleware, requireSiteAdmin, shareTaskSocial);
router.post('/tasks/:submissionId/retry', authMiddleware, requireSiteAdmin, retryTask);
router.post('/tasks/:submissionId/transition', authMiddleware, requireSiteAdmin, transitionTaskStage);

export default router;
