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

// ── Admin: Marketing Inteligente (Fases 1, 2, 3 y 4) ─────────────────
router.get('/marketing/overview', requireSubmissionInboxAccess, mktCtrl.getOverview);
router.get('/marketing/campaigns', requireSubmissionInboxAccess, mktCtrl.getCampaigns);
router.post('/marketing/campaigns/:id/status', requireSubmissionInboxAccess, mktCtrl.updateCampaignStatus);
router.post('/marketing/campaigns/:id/schedule', requireSubmissionInboxAccess, mktCtrl.scheduleCampaign);
router.post('/marketing/campaigns/:id/sync-email', requireSubmissionInboxAccess, mktCtrl.syncWithEmailMarketing);
router.get('/marketing/automations', requireSubmissionInboxAccess, mktCtrl.getAutomations);
router.post('/marketing/automations/:id/toggle', requireSubmissionInboxAccess, mktCtrl.toggleAutomation);
router.post('/marketing/generate-smart-link', requireSubmissionInboxAccess, mktCtrl.generateSmartLink);
router.get('/marketing/ai-insights', requireSubmissionInboxAccess, mktCtrl.getAiInsights);
router.post('/marketing/ai-insights/:id/action', requireSubmissionInboxAccess, mktCtrl.actionAiInsight);
router.get('/marketing/ab-tests', requireSubmissionInboxAccess, mktCtrl.getAbTests);
router.post('/marketing/ab-tests/:id/winner', requireSubmissionInboxAccess, mktCtrl.declareAbWinner);
router.post('/marketing/ai/generate-copy', requireSubmissionInboxAccess, mktCtrl.generateCopyAi);
router.get('/marketing/success-stories', requireSubmissionInboxAccess, mktCtrl.getSuccessStories);
router.get('/marketing/attribution', requireSubmissionInboxAccess, mktCtrl.getAttribution);
router.get('/marketing/reports/district', requireSubmissionInboxAccess, mktCtrl.getDistrictAnalysis);
router.get('/marketing/reports/governance', requireSubmissionInboxAccess, mktCtrl.getGovernanceStatus);
router.get('/marketing/reports/executive-summary', requireSubmissionInboxAccess, mktCtrl.getExecutiveReport);
router.put('/marketing/config', requireSubmissionInboxAccess, mktCtrl.updateMarketingConfig);

// Editor Visual de Plantillas Institucionales & Bloques Globales
router.get('/marketing/templates/master', requireSubmissionInboxAccess, mktCtrl.getMasterTemplate);
router.post('/marketing/templates/save-master', requireSubmissionInboxAccess, mktCtrl.saveMasterTemplate);
router.get('/marketing/templates/global-blocks', requireSubmissionInboxAccess, mktCtrl.getGlobalBlocks);
router.put('/marketing/templates/global-blocks/:key', requireSubmissionInboxAccess, mktCtrl.updateGlobalBlock);
router.post('/marketing/campaigns/:id/apply-template', requireSubmissionInboxAccess, mktCtrl.applyCampaignTemplate);
router.post('/marketing/templates/apply-campaign', requireSubmissionInboxAccess, mktCtrl.applyCampaignTemplate);
router.post('/marketing/templates/test-email', requireSubmissionInboxAccess, mktCtrl.sendTestEmail);

export default router;

