// Rutas Rotary en Acción: motor universal de captación. Lo público no lleva
// auth; la administración sí.
import express from 'express';
import { authMiddleware, SITE_ADMIN_ROLES } from '../middleware/auth.js';
import { requireRoleOrPermission } from '../middleware/institutionalGuard.js';
import * as ctrl from '../controllers/rotaryEnAccionController.js';
import * as mktCtrl from '../controllers/rotaryMarketingController.js';
import * as actCtrl from '../controllers/rotaryActivationController.js';
import * as visitCtrl from '../controllers/governorVisitController.js';
import { lightPublicLimit } from '../middleware/rotaryPublicLimit.js';
import { requireSubmissionInboxAccess } from '../middleware/submissionInboxGuard.js';
// v4.1269 — los clubes salen del Catálogo Maestro (vivo), no de la lista estática.
import { clubCatalogFresh } from '../lib/clubCatalog.js';

const router = express.Router();
router.use(clubCatalogFresh);

// ── Público ──────────────────────────────────────────────────────────
router.get('/config', lightPublicLimit, ctrl.getEngineConfig);
router.post('/presign', lightPublicLimit, ctrl.presign);
router.post('/submit', lightPublicLimit, ctrl.submit);
router.post('/drafts', lightPublicLimit, ctrl.saveDraftEp);
router.get('/drafts/:token', lightPublicLimit, ctrl.getDraftEp);
router.delete('/drafts/:token', lightPublicLimit, ctrl.deleteDraftEp);
router.post('/assist', lightPublicLimit, ctrl.assist);
router.get('/related/:id', ctrl.related);
router.get('/fair-projects/search', lightPublicLimit, ctrl.searchFairProjects);

// Embudo público de activación de clubes (/activar-mi-club)
router.get('/activacion/config', lightPublicLimit, actCtrl.getActivationConfig);
router.post('/activacion/hit', lightPublicLimit, actCtrl.recordFunnelHit);
router.post('/activacion/submit', lightPublicLimit, actCtrl.submitActivationInterest);

// Visitas del Gobernador (v4.1260): formulario público de las secretarías.
// La corrección entra con el enlace que genera «Solicitar correcciones».
router.get('/visitas-gobernador/config', lightPublicLimit, visitCtrl.getVisitConfig);
router.post('/visitas-gobernador/presign', lightPublicLimit, visitCtrl.presignVisitUpload);
router.post('/visitas-gobernador/submit', lightPublicLimit, visitCtrl.submitVisit);
router.get('/visitas-gobernador/correccion/:token', lightPublicLimit, visitCtrl.getVisitForCorrection);
router.post('/visitas-gobernador/correccion/:token', lightPublicLimit, visitCtrl.submitVisitCorrection);

// ── Admin ────────────────────────────────────────────────────────────
router.use(authMiddleware);
router.get('/taxonomies', requireSubmissionInboxAccess, requireRoleOrPermission(SITE_ADMIN_ROLES, 'rotary_en_accion.view'), ctrl.adminList);
router.post('/taxonomies', requireSubmissionInboxAccess, requireRoleOrPermission(SITE_ADMIN_ROLES, 'rotary_en_accion.manage'), ctrl.adminUpsert);
router.post('/taxonomies/:id/active', requireSubmissionInboxAccess, requireRoleOrPermission(SITE_ADMIN_ROLES, 'rotary_en_accion.manage'), ctrl.adminActive);
router.get('/config-admin', requireSubmissionInboxAccess, requireRoleOrPermission(SITE_ADMIN_ROLES, 'rotary_en_accion.view'), ctrl.adminConfigGet);
router.put('/config-admin', requireSubmissionInboxAccess, requireRoleOrPermission(SITE_ADMIN_ROLES, 'rotary_en_accion.manage'), ctrl.adminConfigPut);
router.get('/stats', requireSubmissionInboxAccess, requireRoleOrPermission(SITE_ADMIN_ROLES, 'rotary_en_accion.view'), ctrl.stats);
router.get('/dashboard', requireSubmissionInboxAccess, requireRoleOrPermission(SITE_ADMIN_ROLES, 'rotary_en_accion.view'), ctrl.board);

// ── Admin: Feria de Proyectos Colombia ────────────────────────────────
router.get('/fair/submissions', requireSubmissionInboxAccess, requireRoleOrPermission(SITE_ADMIN_ROLES, 'rotary_en_accion.view'), ctrl.getFairSubmissions);
router.get('/fair/stats', requireSubmissionInboxAccess, requireRoleOrPermission(SITE_ADMIN_ROLES, 'rotary_en_accion.view'), ctrl.getFairStats);

// ── Admin: Visitas del Gobernador (v4.1260) ──────────────────────────
// Literales antes que paramétricas (check:routes).
router.get('/visitas-gobernador/admin/list', requireSubmissionInboxAccess, requireRoleOrPermission(SITE_ADMIN_ROLES, 'rotary_en_accion.view'), visitCtrl.adminListVisits);
router.get('/visitas-gobernador/admin/stats', requireSubmissionInboxAccess, requireRoleOrPermission(SITE_ADMIN_ROLES, 'rotary_en_accion.view'), visitCtrl.adminVisitStats);
router.get('/visitas-gobernador/admin/by-club/:profileId', requireSubmissionInboxAccess, requireRoleOrPermission(SITE_ADMIN_ROLES, 'rotary_en_accion.view'), visitCtrl.adminVisitsByClub);
router.get('/visitas-gobernador/admin/:id', requireSubmissionInboxAccess, requireRoleOrPermission(SITE_ADMIN_ROLES, 'rotary_en_accion.view'), visitCtrl.adminGetVisit);
router.put('/visitas-gobernador/admin/:id', requireSubmissionInboxAccess, requireRoleOrPermission(SITE_ADMIN_ROLES, 'rotary_en_accion.edit'), visitCtrl.adminUpdateVisit);
router.post('/visitas-gobernador/admin/:id/status', requireSubmissionInboxAccess, requireRoleOrPermission(SITE_ADMIN_ROLES, 'rotary_en_accion.manage'), visitCtrl.adminTransitionVisit);
router.post('/visitas-gobernador/admin/:id/publish', requireSubmissionInboxAccess, requireRoleOrPermission(SITE_ADMIN_ROLES, 'rotary_en_accion.publish'), visitCtrl.adminPublishVisit);

// ── Admin: Activación de Clubes (CRM & KPIs) ─────────────────────────
router.get('/activacion/leads', requireSubmissionInboxAccess, actCtrl.getActivationLeads);
router.get('/activacion/kpis', requireSubmissionInboxAccess, actCtrl.getActivationKpis);
router.put('/activacion/leads/:id/status', requireSubmissionInboxAccess, actCtrl.updateLeadStatus);
router.put('/activacion/leads/:id', requireSubmissionInboxAccess, actCtrl.updateLeadDetails);

// ── Admin: Marketing Inteligente (Fases 1, 2, 3 y 4) ─────────────────
router.get('/marketing/overview', requireSubmissionInboxAccess, mktCtrl.getOverview);
router.get('/marketing/campaigns', requireSubmissionInboxAccess, mktCtrl.getCampaigns);
router.post('/marketing/campaigns/:id/status', requireSubmissionInboxAccess, mktCtrl.updateCampaignStatus);
router.post('/marketing/campaigns/:id/schedule', requireSubmissionInboxAccess, mktCtrl.scheduleCampaign);
router.post('/marketing/campaigns/:id/sync-email', requireSubmissionInboxAccess, mktCtrl.syncWithEmailMarketing);
router.post('/marketing/campaigns/:id/send', requireSubmissionInboxAccess, mktCtrl.sendCampaignNow);
router.post('/marketing/campaigns/:id/retry', requireSubmissionInboxAccess, mktCtrl.retryFailedCampaignRecipients);
router.get('/marketing/history', requireSubmissionInboxAccess, mktCtrl.getCampaignsHistory);
router.post('/marketing/history/reconcile', requireSubmissionInboxAccess, mktCtrl.reconcileCampaignHistory);
router.get('/marketing/history/:id', requireSubmissionInboxAccess, mktCtrl.getCampaignHistoryDetail);
router.get('/marketing/deliverability/diagnostics', requireSubmissionInboxAccess, mktCtrl.getDeliverabilityDiagnostics);
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

// Audiencias Institucionales, Selección de Listas y Validación de Destinatarios
router.get('/marketing/audiences/lists', requireSubmissionInboxAccess, mktCtrl.getAudienceLists);
router.post('/marketing/audiences/validate', requireSubmissionInboxAccess, mktCtrl.validateAudienceSelection);

// Identidades y Remitentes Institucionales de Campañas
router.get('/marketing/sender-identities', requireSubmissionInboxAccess, mktCtrl.getSenderIdentities);
router.get('/marketing/sender-identities/available-accounts', requireSubmissionInboxAccess, mktCtrl.getAvailableSenderAccounts);
router.post('/marketing/sender-identities', requireSubmissionInboxAccess, mktCtrl.createSenderIdentity);
router.post('/marketing/sender-identities/:id/set-default', requireSubmissionInboxAccess, mktCtrl.setDefaultSenderIdentity);
router.put('/marketing/sender-identities/:id', requireSubmissionInboxAccess, mktCtrl.updateSenderIdentity);
router.delete('/marketing/sender-identities/:id', requireSubmissionInboxAccess, mktCtrl.deleteSenderIdentity);
router.put('/marketing/campaigns/:id/sender', requireSubmissionInboxAccess, mktCtrl.assignCampaignSender);
router.post('/marketing/campaigns/:id/send-test', requireSubmissionInboxAccess, mktCtrl.sendCampaignPersonalizedTest);

// Editor Visual de Plantillas Institucionales & Bloques Globales
router.get('/marketing/templates/master', requireSubmissionInboxAccess, mktCtrl.getMasterTemplate);
router.post('/marketing/templates/save-master', requireSubmissionInboxAccess, mktCtrl.saveMasterTemplate);
router.get('/marketing/templates/global-blocks', requireSubmissionInboxAccess, mktCtrl.getGlobalBlocks);
router.put('/marketing/templates/global-blocks/:key', requireSubmissionInboxAccess, mktCtrl.updateGlobalBlock);
router.post('/marketing/campaigns/:id/apply-template', requireSubmissionInboxAccess, mktCtrl.applyCampaignTemplate);
router.post('/marketing/templates/apply-campaign', requireSubmissionInboxAccess, mktCtrl.applyCampaignTemplate);
router.post('/marketing/templates/test-email', requireSubmissionInboxAccess, mktCtrl.sendTestEmail);

export default router;


