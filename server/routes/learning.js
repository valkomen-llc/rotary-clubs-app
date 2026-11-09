// Rutas de Cursos y capacitaciones (LMS, v4.1302). Tres puertas:
//   /public  sin auth (biblioteca; el contenido lo decide la modalidad)
//   /mis     el club, con su token del panel
//   /admin   el comité (rol de administración o permiso de Rotary en Acción)
// Literales antes que paramétricas (check:routes). `export default` al final.
import express from 'express';
import { authMiddleware, SITE_ADMIN_ROLES } from '../middleware/auth.js';
import { requireRoleOrPermission } from '../middleware/institutionalGuard.js';
import { lightPublicLimit } from '../middleware/rotaryPublicLimit.js';
import * as ctrl from '../controllers/learningController.js';

const router = express.Router();

// ── Público ──────────────────────────────────────────────────────────
router.get('/public/catalogo', lightPublicLimit, ctrl.publicCatalog);
router.get('/public/colecciones/:slug', lightPublicLimit, ctrl.publicCollection);
router.get('/public/cursos/:slug/aprender', lightPublicLimit, ctrl.publicCourseLearn);
router.get('/public/cursos/:slug/archivos/:fileId/url', lightPublicLimit, ctrl.publicFileUrl);
router.get('/public/cursos/:slug', lightPublicLimit, ctrl.publicCourse);

// ── Portal del club ──────────────────────────────────────────────────
const mis = express.Router();
mis.use(authMiddleware);
mis.get('/resumen', ctrl.portalOverview);
mis.post('/colecciones', ctrl.portalCreateCollection);
mis.get('/colecciones/:id', ctrl.portalGetCollection);
mis.patch('/colecciones/:id', ctrl.portalPatchCollection);
mis.post('/colecciones/:id/estado', ctrl.portalCollectionStatus);
mis.post('/colecciones/:id/orden', ctrl.portalReorderCourses);
mis.post('/colecciones/:id/invitacion', ctrl.portalCollectionInvite);
mis.post('/colecciones/:id/portada/presign', ctrl.portalCollectionCoverPresign);
mis.post('/colecciones/:id/portada/completar', ctrl.portalCollectionCoverComplete);
mis.post('/cursos', ctrl.portalCreateCourse);
mis.get('/cursos/:id', ctrl.portalGetCourse);
mis.patch('/cursos/:id', ctrl.portalPatchCourse);
mis.post('/cursos/:id/duplicar', ctrl.portalDuplicateCourse);
mis.post('/cursos/:id/enviar', ctrl.portalSubmitCourse);
mis.post('/cursos/:id/estado', ctrl.portalCourseStatus);
mis.post('/cursos/:id/orden', ctrl.portalReorderContent);
mis.post('/cursos/:id/modulos', ctrl.portalCreateModule);
mis.patch('/cursos/:id/modulos/:mid', ctrl.portalPatchModule);
mis.delete('/cursos/:id/modulos/:mid', ctrl.portalDeleteModule);
mis.post('/cursos/:id/lecciones', ctrl.portalCreateLesson);
mis.patch('/cursos/:id/lecciones/:lid', ctrl.portalPatchLesson);
mis.delete('/cursos/:id/lecciones/:lid', ctrl.portalDeleteLesson);
mis.post('/cursos/:id/recursos', ctrl.portalCreateResource);
mis.patch('/cursos/:id/recursos/:rid', ctrl.portalPatchResource);
mis.delete('/cursos/:id/recursos/:rid', ctrl.portalDeleteResource);
mis.post('/cursos/:id/archivos/presign', ctrl.portalFilePresign);
mis.post('/cursos/:id/archivos/partes', ctrl.portalFileParts);
mis.post('/cursos/:id/archivos/completar', ctrl.portalFileComplete);
mis.delete('/cursos/:id/archivos/:fileId', ctrl.portalFileDelete);
mis.get('/cursos/:id/archivos/:fileId/url', ctrl.portalFileUrl);
router.use('/mis', mis);

// ── Administración ───────────────────────────────────────────────────
const admin = express.Router();
admin.use(authMiddleware);
const ver = requireRoleOrPermission(SITE_ADMIN_ROLES, 'rotary_en_accion.view');
const gestionar = requireRoleOrPermission(SITE_ADMIN_ROLES, 'rotary_en_accion.manage');
admin.get('/resumen', ver, ctrl.adminOverview);
admin.get('/config', ver, ctrl.adminGetConfig);
admin.put('/config', gestionar, ctrl.adminPutConfig);
admin.get('/colecciones', ver, ctrl.adminListCollections);
admin.get('/colecciones/:id', ver, ctrl.adminGetCollection);
admin.post('/colecciones/:id/estado', gestionar, ctrl.adminCollectionStatus);
admin.get('/cursos', ver, ctrl.adminListCourses);
admin.get('/cursos/:id', ver, ctrl.adminGetCourse);
admin.patch('/cursos/:id', gestionar, ctrl.adminPatchCourse);
admin.post('/cursos/:id/estado', gestionar, ctrl.adminCourseStatus);
admin.post('/cursos/:id/comentarios', gestionar, ctrl.adminAddComment);
admin.get('/cursos/:id/archivos/:fileId/url', ver, ctrl.adminFileUrl);
router.use('/admin', admin);

export default router;
