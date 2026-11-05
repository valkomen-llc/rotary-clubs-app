// Rutas de Programas (v4.1280.0). Lo público no lleva auth y lleva
// `lightPublicLimit`; la administración lleva auth + `programs.*` del RBAC,
// y el controlador decide la fila con `programAccess`.
// Literales antes que paramétricas (check:routes).
import express from 'express';
import { authMiddleware, SITE_ADMIN_ROLES } from '../middleware/auth.js';
import { requireRoleOrPermission } from '../middleware/institutionalGuard.js';
import { lightPublicLimit } from '../middleware/rotaryPublicLimit.js';
import * as ctrl from '../controllers/programController.js';

const router = express.Router();

// ── Público ──────────────────────────────────────────────────────────
router.get('/public/catalogo', lightPublicLimit, ctrl.publicCatalog);
router.get('/public/clubes', lightPublicLimit, ctrl.publicClubs);
router.get('/public/:slug', lightPublicLimit, ctrl.publicProgram);
router.post('/public/:slug/metric', lightPublicLimit, ctrl.publicMetric);
router.post('/public/:slug/solicitud', lightPublicLimit, ctrl.publicSubmitRequest);
router.post('/public/:slug/novedades', lightPublicLimit, ctrl.publicSubscribe);
router.get('/public/:slug/solicitud/:ref', lightPublicLimit, ctrl.publicRequestStatus);

// ── Administración ───────────────────────────────────────────────────
router.use(authMiddleware);
const ver = requireRoleOrPermission(SITE_ADMIN_ROLES, 'programs.view');
const crear = requireRoleOrPermission(SITE_ADMIN_ROLES, 'programs.create');
const editar = requireRoleOrPermission(SITE_ADMIN_ROLES, 'programs.edit');
const publicar = requireRoleOrPermission(SITE_ADMIN_ROLES, 'programs.publish');
const administrar = requireRoleOrPermission(SITE_ADMIN_ROLES, 'programs.manage');

router.get('/admin/context', ver, ctrl.adminContext);
router.get('/admin/list', ver, ctrl.adminList);
router.get('/admin/clubs-catalog', ver, ctrl.adminClubsCatalog);
router.post('/admin', crear, ctrl.adminCreate);
router.get('/admin/:id', ver, ctrl.adminGet);
router.put('/admin/:id', editar, ctrl.adminUpdate);
router.post('/admin/:id/status', publicar, ctrl.adminStatus);
router.post('/admin/:id/preview-token', ver, ctrl.adminPreviewToken);
router.put('/admin/:id/links', administrar, ctrl.adminUpsertLink);
router.post('/admin/:id/members', administrar, ctrl.adminUpsertMember);
router.delete('/admin/:id/members/:memberId', administrar, ctrl.adminRemoveMember);
router.get('/admin/:id/content', ver, ctrl.adminListContent);
router.get('/admin/:id/content/:contentId', ver, ctrl.adminGetContent);
router.get('/admin/:id/changes', ver, ctrl.adminListChanges);
router.post('/admin/:id/changes', ver, ctrl.adminCreateChange);
router.get('/admin/:id/changes/:reqId', ver, ctrl.adminGetChange);
router.put('/admin/:id/changes/:reqId', ver, ctrl.adminUpdateChange);
router.post('/admin/:id/changes/:reqId/status', ver, ctrl.adminTransitionChange);
router.post('/admin/:id/changes/:reqId/medical', ver, ctrl.adminMedicalReview);
router.post('/admin/:id/changes/:reqId/publish', ver, ctrl.adminPublishChange);
router.get('/admin/:id/requests', ver, ctrl.adminListRequests);
router.get('/admin/:id/requests/:reqId', ver, ctrl.adminGetRequest);
router.post('/admin/:id/requests/:reqId/status', ver, ctrl.adminTransitionRequest);
router.post('/admin/:id/requests/:reqId/assign', ver, ctrl.adminAssignRequest);
router.post('/admin/:id/requests/:reqId/notes', ver, ctrl.adminNoteRequest);
router.get('/admin/:id/clubs', ver, ctrl.adminListClubs);
router.post('/admin/:id/clubs/activate', editar, ctrl.adminActivateClub);
router.put('/admin/:id/clubs/:activationId', editar, ctrl.adminUpdateActivation);
router.post('/admin/:id/clubs/:activationId/deactivate', editar, ctrl.adminDeactivateClub);
router.post('/admin/:id/files/presign', ver, ctrl.adminPresignFile);
router.post('/admin/:id/files/register', ver, ctrl.adminRegisterFile);
router.get('/admin/:id/files', ver, ctrl.adminListFiles);
router.get('/admin/:id/files/:fileId/download', ver, ctrl.adminDownloadFile);
router.get('/admin/:id/audit', ver, ctrl.adminAudit);
router.get('/admin/:id/metrics', ver, ctrl.adminMetrics);

export default router;
