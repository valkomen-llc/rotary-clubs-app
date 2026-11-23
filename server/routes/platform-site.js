// Sitio web de Club Platform (v4.1348.0). Literal antes que paramétrica.
import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import ctrl from '../controllers/platformSiteController.js';

const router = express.Router();

// ── Público ──────────────────────────────────────────────────────────
router.get('/public/sitemap.xml', ctrl.publicSitemap);
router.get('/public/robots.txt', ctrl.publicRobots);
router.post('/public/lead', ctrl.publicLead);
router.post('/public/visit', ctrl.publicVisit);
router.get('/public', ctrl.publicPage);

// ── Panel ────────────────────────────────────────────────────────────
router.use('/admin', authMiddleware);
router.get('/admin/access', ctrl.adminAccess);
router.post('/admin/create', ctrl.canPublish, ctrl.adminCreate);
router.put('/admin/draft', ctrl.canEdit, ctrl.adminSaveDraft);
router.post('/admin/review/submit', ctrl.canEdit, ctrl.adminSubmitReview);
router.post('/admin/review/decide', ctrl.canReview, ctrl.adminDecideReview);
router.post('/admin/publish', ctrl.canPublish, ctrl.adminPublish);
router.get('/admin/versions', ctrl.canView, ctrl.adminVersions);
router.post('/admin/versions/restore', ctrl.canEdit, ctrl.adminRestore);
router.post('/admin/rollback', ctrl.canPublish, ctrl.adminRollback);
router.post('/admin/preview-token', ctrl.canView, ctrl.adminPreviewToken);
router.put('/admin/config', ctrl.canDomain, ctrl.adminConfig);
router.get('/admin/domain-status', ctrl.canDomain, ctrl.adminDomainStatus);
router.get('/admin/events', ctrl.canView, ctrl.adminEvents);
router.get('/admin/stats', ctrl.canView, ctrl.adminStats);
router.get('/admin/sources/sites', ctrl.canEdit, ctrl.adminSourceSites);
router.get('/admin/new-block', ctrl.canEdit, ctrl.adminNewBlock);
router.get('/admin/new-page', ctrl.canEdit, ctrl.adminNewPage);
router.get('/admin/members', ctrl.canMembers, ctrl.adminMembers);
router.post('/admin/members', ctrl.canMembers, ctrl.adminAddMember);
router.delete('/admin/members/:id', ctrl.canMembers, ctrl.adminRemoveMember);
router.get('/admin/leads', ctrl.canLeads, ctrl.adminLeads);
router.patch('/admin/leads/:id', ctrl.canLeads, ctrl.adminUpdateLead);
router.post('/admin/ai/suggest', ctrl.canEdit, ctrl.adminAiSuggest);
router.get('/admin', ctrl.canView, ctrl.adminGet);

export default router;
