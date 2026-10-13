// Rutas Rotary en Acción: motor universal de captación. Lo público no lleva
// auth; la administración sí.
import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import * as ctrl from '../controllers/rotaryEnAccionController.js';
import * as mktCtrl from '../controllers/rotaryMarketingController.js';
import { lightPublicLimit } from '../middleware/rotaryPublicLimit.js';
import { requireSubmissionInboxAccess } from '../middleware/submissionInboxGuard.js';

const router = express.Router();

// ── Público ──────────────────────────────────────────────────────────
router.get('/config', lightPublicLimit, ctrl.getEngineConfig);
router.post('/presign', lightPublicLimit, ctrl.presign);
router.post('/submit', lightPublicLimit, ctrl.submit);
router.post('/drafts', lightPublicLimit, ctrl.saveDraftEp);
router.get('/drafts/:token', lightPublicLimit, ctrl.getDraftEp);
router.delete('/drafts/:token', lightPublicLimit, ctrl.deleteDraftEp);
router.post('/assist', lightPublicLimit, ctrl.assist);
router.get('/related/:id', ctrl.related);

// ── Admin ────────────────────────────────────────────────────────────
router.use(authMiddleware);
router.get('/taxonomies', ctrl.adminList);
router.post('/taxonomies', ctrl.adminUpsert);
router.post('/taxonomies/:id/active', ctrl.adminActive);
router.get('/config-admin', ctrl.adminConfigGet);
router.put('/config-admin', ctrl.adminConfigPut);
router.get('/stats', requireSubmissionInboxAccess, ctrl.stats);
router.get('/dashboard', requireSubmissionInboxAccess, ctrl.board);

// ── Admin: Marketing Inteligente ─────────────────────────────────────
router.get('/marketing/overview', requireSubmissionInboxAccess, mktCtrl.getOverview);
router.get('/marketing/campaigns', requireSubmissionInboxAccess, mktCtrl.getCampaigns);
router.post('/marketing/campaigns/:id/status', requireSubmissionInboxAccess, mktCtrl.updateCampaignStatus);
router.post('/marketing/campaigns/:id/sync-email', requireSubmissionInboxAccess, mktCtrl.syncWithEmailMarketing);
router.get('/marketing/ai-insights', requireSubmissionInboxAccess, mktCtrl.getAiInsights);
router.post('/marketing/ai-insights/:id/action', requireSubmissionInboxAccess, mktCtrl.actionAiInsight);
router.get('/marketing/attribution', requireSubmissionInboxAccess, mktCtrl.getAttribution);
router.put('/marketing/config', requireSubmissionInboxAccess, mktCtrl.updateMarketingConfig);

export default router;

