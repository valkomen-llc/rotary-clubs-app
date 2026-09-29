// Rutas de Campañas de Activación de Contenido. Requieren auth salvo tick interno.
import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import * as ctrl from '../controllers/contentActivationController.js';

const router = express.Router();
router.use(authMiddleware);

router.get('/', ctrl.list);
router.post('/', ctrl.create);
router.post('/ai-draft', ctrl.aiDraft);
// Catálogos de ámbito/audiencia (filtrados por permiso en servidor).
router.get('/catalog/scope-types', ctrl.scopeTypes);
router.get('/catalog/scopes', ctrl.scopeCatalog);
router.get('/catalog/audience-sources', ctrl.audienceSources);
router.post('/tick', ctrl.tickNow);
router.get('/board', ctrl.board);
router.get('/:id/recipients', ctrl.recipients);
router.post('/:id/exclude', ctrl.excludeContact);
router.post('/:id/manual-recipients', ctrl.addManualRecipient);
router.post('/:id/save-segment', ctrl.saveSegment);
router.post('/:id/send-test', ctrl.sendTest);
router.get('/:id', ctrl.detail);
router.put('/:id', ctrl.update);
router.post('/:id/status', ctrl.transition);
router.post('/:id/preview', ctrl.preview);
router.post('/preview', ctrl.preview);
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
router.post('/enrollments/:enrollmentId/link', ctrl.linkForEnrollment);

export default router;
