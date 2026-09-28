// Rutas de Campañas de Activación de Contenido. Requieren auth salvo tick interno.
import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import * as ctrl from '../controllers/contentActivationController.js';

const router = express.Router();
router.use(authMiddleware);

router.get('/', ctrl.list);
router.post('/', ctrl.create);
router.post('/ai-draft', ctrl.aiDraft);
router.post('/tick', ctrl.tickNow);
router.get('/board', ctrl.board);
router.get('/:id', ctrl.detail);
router.put('/:id', ctrl.update);
router.post('/:id/status', ctrl.transition);
router.post('/:id/preview', ctrl.preview);
router.get('/:id/executions', ctrl.executions);
router.post('/:id/executions', ctrl.newExecution);
router.post('/:id/enroll', ctrl.enroll);
router.get('/:id/analytics', ctrl.analytics);
router.get('/:id/insights', ctrl.insights);
router.get('/:id/timeline', ctrl.timeline);
router.get('/executions/:executionId/enrollments', ctrl.enrollments);
router.get('/profiles/:siteId', ctrl.profile);
router.post('/enrollments/:enrollmentId/pause', ctrl.pauseEnrollment);
router.post('/enrollments/:enrollmentId/retry', ctrl.retryEnrollment);

export default router;
