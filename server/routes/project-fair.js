// Rutas del módulo "Postulación de Proyectos — Feria de Proyectos Rotary
// Colombia" (v4.592.0). Los endpoints públicos alimentan el wizard de
// /postular-proyecto; los /admin/* requieren token y sirven al configurador.
import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import {
    getPublicConfig,
    getTrm,
    createSubmission,
    createCheckout,
    getSubmissionStatus,
    listTrmProviders,
} from '../controllers/projectFairController.js';

const router = express.Router();

// ── Público ──────────────────────────────────────────────────────────
router.get('/config', getPublicConfig);
router.get('/trm', getTrm);
router.post('/submissions', express.json({ limit: '1mb' }), createSubmission);
router.post('/submissions/:id/checkout', express.json(), createCheckout);
router.get('/submissions/:id', getSubmissionStatus);

// ── Panel del club (v4.608) ──────────────────────────────────────────
// Identidad propia del módulo: el token del panel administrativo no sirve
// aquí, ni el del club sirve para /admin/*.
import * as portal from '../controllers/projectFairPortalController.js';

router.get('/portal/check-email', portal.checkEmail);
// Puente con la sesión de la plataforma: exige token de la plataforma y sólo
// emite un token del panel para el mismo correo ya autenticado.
router.get('/portal/link', authMiddleware, portal.linkPlatformUser);
router.post('/portal/login', express.json(), portal.login);
router.post('/portal/claim', express.json(), portal.claim);
router.post('/portal/forgot', express.json(), portal.forgotPassword);
router.post('/portal/reset', express.json(), portal.resetPassword);
router.get('/portal/me', portal.portalAuth, portal.getPortalData);
router.put('/portal/form', portal.portalAuth, express.json({ limit: '2mb' }), portal.saveForm);
router.post('/portal/form/submit', portal.portalAuth, express.json({ limit: '2mb' }), portal.submitForm);

// ── Gestión de Postulaciones y Pagos (v4.598) ────────────────────────
// Todos exigen token; el permiso fino (ver pagos, editar, cambiar estado,
// exportar) lo resuelve el propio controlador según el perfil del usuario.
import fair from '../controllers/projectFairAdminController.js';

router.get('/admin/overview', authMiddleware, fair.getOverview);
router.get('/admin/catalog', authMiddleware, fair.getCatalog);
router.get('/admin/alerts', authMiddleware, fair.getAlerts);
router.get('/admin/reports', authMiddleware, fair.getReports);
router.get('/admin/export.csv', authMiddleware, fair.exportCsv);

router.get('/admin/postulaciones', authMiddleware, fair.listSubmissions);
router.get('/admin/postulaciones/:id', authMiddleware, fair.getSubmission);
router.get('/admin/postulaciones/:id/snapshot', authMiddleware, fair.getSubmissionSnapshot);
router.patch('/admin/postulaciones/:id', authMiddleware, express.json({ limit: '1mb' }), fair.updateSubmission);
router.post('/admin/postulaciones/:id/comments', authMiddleware, express.json(), fair.addComment);
router.post('/admin/postulaciones/:id/tags', authMiddleware, express.json(), fair.attachTag);
router.delete('/admin/postulaciones/:id/tags/:tagId', authMiddleware, fair.detachTag);
router.post('/admin/postulaciones/:id/files', authMiddleware, express.json(), fair.addFile);
router.delete('/admin/postulaciones/:id/files/:fileId', authMiddleware, fair.deleteFile);
router.post('/admin/postulaciones/:id/sync-stripe', authMiddleware, express.json(), fair.syncStripe);
router.post('/admin/postulaciones/:id/resend-receipt', authMiddleware, express.json(), fair.resendReceipt);

// Formulación de proyectos (v4.608)
router.get('/admin/formularios', authMiddleware, fair.listMasterForms);
router.get('/admin/postulaciones/:id/form', authMiddleware, fair.getMasterForm);
router.get('/admin/postulaciones/:id/form.docx', authMiddleware, fair.downloadMasterFormDocx);
router.post('/admin/postulaciones/:id/form/reopen', authMiddleware, express.json(), fair.reopenMasterForm);
router.post('/admin/postulaciones/:id/form/lock', authMiddleware, express.json(), fair.lockMasterForm);

router.get('/admin/tags', authMiddleware, fair.listTags);
router.post('/admin/tags', authMiddleware, express.json(), fair.createTag);
router.delete('/admin/tags/:id', authMiddleware, fair.deleteTag);

// ── Configuración de la convocatoria (pestaña del módulo unificado) ──
// Pasan por el control de permisos del módulo: leer exige acceso, guardar
// exige el permiso de configuración.
router.get('/admin/config', authMiddleware, fair.readConvocatoriaConfig);
router.put('/admin/config', authMiddleware, express.json({ limit: '1mb' }), fair.writeConvocatoriaConfig);
router.get('/admin/trm-providers', authMiddleware, listTrmProviders);

export default router;
