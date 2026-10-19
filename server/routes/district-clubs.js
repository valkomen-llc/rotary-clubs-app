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

// ── Rutas Públicas (sin auth) ───────────────────────────────────────────────
router.get('/config', lightPublicLimit, ctrl.getDirectoryConfig);
router.get('/public', lightPublicLimit, ctrl.getPublicDirectory);
router.post('/submit', lightPublicLimit, ctrl.submitClubDirectoryRequest);
router.post('/draft', lightPublicLimit, ctrl.saveFormDraft);
router.get('/draft/:token', lightPublicLimit, ctrl.getFormDraft);

// ── Rutas Administrativas (con auth) ────────────────────────────────────────
// Orden estricto: literales antes que paramétricas para pasar check-routes
router.get('/admin/list', authMiddleware, requireRoleOrPermission(SITE_ADMIN_ROLES, 'clubs.view'), ctrl.getAdminClubList);
router.get('/admin/submissions', authMiddleware, requireRoleOrPermission(SITE_ADMIN_ROLES, 'clubs.view'), ctrl.getAdminSubmissions);
router.post('/admin/submissions/:id/review', authMiddleware, requireRoleOrPermission(SITE_ADMIN_ROLES, 'clubs.manage'), ctrl.reviewSubmission);
router.post('/admin/profile/:id/toggle-status', authMiddleware, requireRoleOrPermission(SITE_ADMIN_ROLES, 'clubs.manage'), ctrl.toggleProfileStatus);
router.put('/admin/profile/:id', authMiddleware, requireRoleOrPermission(SITE_ADMIN_ROLES, 'clubs.manage'), ctrl.updateClubProfileDirect);

// ── Ruta Pública Paramétrica Final ──────────────────────────────────────────
router.get('/profile/:type/:slug', lightPublicLimit, ctrl.getPublicClubProfile);

export default router;
