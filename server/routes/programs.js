// Rutas de Programas (v4.1280.0). Lo público no lleva auth y lleva
// `lightPublicLimit`; la administración lleva auth + `programs.*` del RBAC,
// y el controlador decide la fila con `programAccess`.
// Literales antes que paramétricas (check:routes).
import express from 'express';
import { authMiddleware, SITE_ADMIN_ROLES } from '../middleware/auth.js';
import { requireRoleOrPermission } from '../middleware/institutionalGuard.js';
import { lightPublicLimit } from '../middleware/rotaryPublicLimit.js';
import * as ctrl from '../controllers/programController.js';
import * as intake from '../controllers/programIntakeController.js';

const router = express.Router();

// ── Público ──────────────────────────────────────────────────────────
// Formulario institucional (v4.1286): el acceso a un borrador es el secreto
// de la cabecera `X-Intake-Token`; ninguna de estas rutas da permisos.
router.get('/public/intake/programas', lightPublicLimit, intake.publicIntakePrograms);
router.get('/public/intake/form/:slug', lightPublicLimit, intake.publicIntakeForm);
router.post('/public/intake/start', lightPublicLimit, intake.publicIntakeStart);
router.get('/public/intake/draft', lightPublicLimit, intake.publicIntakeDraft);
router.put('/public/intake/draft/meta', lightPublicLimit, intake.publicIntakeSaveMeta);
router.put('/public/intake/draft/section/:key', lightPublicLimit, intake.publicIntakeSaveSection);
router.post('/public/intake/draft/submit', lightPublicLimit, intake.publicIntakeSubmit);
router.post('/public/intake/recover', lightPublicLimit, intake.publicIntakeRecover);
router.get('/public/intake/mine', lightPublicLimit, intake.publicIntakeMine);
router.post('/public/intake/mine/:ref/open', lightPublicLimit, intake.publicIntakeOpenMine);
router.post('/public/intake/files/presign', lightPublicLimit, intake.publicIntakePresign);
router.post('/public/intake/files/parts', lightPublicLimit, intake.publicIntakeParts);
router.post('/public/intake/files/complete', lightPublicLimit, intake.publicIntakeComplete);
router.get('/public/intake/files/:fileId/url', lightPublicLimit, intake.publicIntakeFileUrl);
router.delete('/public/intake/files/:fileId', lightPublicLimit, intake.publicIntakeDeleteFile);
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
router.get('/admin/landing/new-block', ver, ctrl.adminNewBlock);
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
router.get('/admin/:id/landing', ver, ctrl.adminGetLanding);
router.put('/admin/:id/landing', editar, ctrl.adminSaveLanding);
router.post('/admin/:id/landing/publish', publicar, ctrl.adminPublishLanding);
router.get('/admin/:id/landing/versions', ver, ctrl.adminLandingVersions);
router.post('/admin/:id/landing/restore', editar, ctrl.adminRestoreLanding);
router.post('/admin/:id/landing/reset', editar, ctrl.adminResetLanding);
router.get('/admin/:id/intake-config', ver, intake.adminIntakeConfig);
router.put('/admin/:id/intake-config', editar, intake.adminSaveIntakeConfig);
router.get('/admin/:id/intakes', ver, intake.adminListIntakes);
router.get('/admin/:id/intakes/:intakeId', ver, intake.adminGetIntake);
router.post('/admin/:id/intakes/:intakeId/items', ver, intake.adminDecideItem);
router.post('/admin/:id/intakes/:intakeId/status', ver, intake.adminIntakeStatus);
router.post('/admin/:id/intakes/:intakeId/apply', ver, intake.adminApplyIntake);
router.get('/admin/:id/intakes/:intakeId/files/:fileId/url', ver, intake.adminIntakeFileUrl);
router.get('/admin/:id/media-bank', ver, intake.adminMediaBank);
router.get('/admin/:id/audit', ver, ctrl.adminAudit);
router.get('/admin/:id/metrics', ver, ctrl.adminMetrics);

export default router;
