// ════════════════════════════════════════════════════════════════════════════
// Rutas de la API del Directorio Distrital de Clubes
// Rotary, Rotaract e Interact — Distrito 4281 & Multidistrito
// ════════════════════════════════════════════════════════════════════════════

import express from 'express';
import { authMiddleware, SITE_ADMIN_ROLES } from '../middleware/auth.js';
import { requireRoleOrPermission } from '../middleware/institutionalGuard.js';
import { lightPublicLimit } from '../middleware/rotaryPublicLimit.js';
import * as ctrl from '../controllers/districtClubsController.js';

const router = express.Router();

// ── Rutas Públicas Literales ───────────────────────────────────────────────
router.get('/config', lightPublicLimit, ctrl.getDirectoryConfig);
router.get('/public', lightPublicLimit, ctrl.getPublicDirectory);
router.post('/submit', lightPublicLimit, ctrl.submitClubDirectoryRequest);
router.post('/draft', lightPublicLimit, ctrl.saveFormDraft);

// ── Rutas del Portal de Autogestión del Club ────────────────────────────────
router.post('/portal/register', lightPublicLimit, ctrl.portalRegister);
router.post('/portal/login', lightPublicLimit, ctrl.portalLogin);
router.get('/portal/link', authMiddleware, ctrl.linkPlatformUser);
router.get('/portal/me', ctrl.portalAuth, ctrl.getPortalMe);
router.put('/portal/profile', ctrl.portalAuth, ctrl.updatePortalProfile);
router.post('/portal/forgot-password', lightPublicLimit, ctrl.portalForgotPassword);
router.post('/portal/reset-password', lightPublicLimit, ctrl.portalResetPassword);

// ── Rutas Administrativas (con auth) ────────────────────────────────────────
// Orden estricto: literales antes que paramétricas para pasar check-routes
router.get('/admin/list', authMiddleware, requireRoleOrPermission(SITE_ADMIN_ROLES, 'clubs.view'), ctrl.getAdminClubList);
router.get('/admin/submissions', authMiddleware, requireRoleOrPermission(SITE_ADMIN_ROLES, 'clubs.view'), ctrl.getAdminSubmissions);
router.post('/admin/submissions/:id/review', authMiddleware, requireRoleOrPermission(SITE_ADMIN_ROLES, 'clubs.manage'), ctrl.reviewSubmission);
router.post('/admin/profile/:id/toggle-status', authMiddleware, requireRoleOrPermission(SITE_ADMIN_ROLES, 'clubs.manage'), ctrl.toggleProfileStatus);
router.post('/admin/profile/:id/approve-protected', authMiddleware, requireRoleOrPermission(SITE_ADMIN_ROLES, 'clubs.manage'), ctrl.approveProtectedChanges);
router.post('/admin/profile/:id/reject-protected', authMiddleware, requireRoleOrPermission(SITE_ADMIN_ROLES, 'clubs.manage'), ctrl.rejectProtectedChanges);
router.put('/admin/profile/:id', authMiddleware, requireRoleOrPermission(SITE_ADMIN_ROLES, 'clubs.manage'), ctrl.updateClubProfileDirect);

// ── Rutas Públicas Paramétricas Finales ──────────────────────────────────────
router.get('/draft/:token', lightPublicLimit, ctrl.getFormDraft);
router.get('/profile/:type/:slug', lightPublicLimit, ctrl.getPublicClubProfile);

export default router;
