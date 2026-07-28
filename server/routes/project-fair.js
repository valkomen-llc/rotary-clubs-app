// Rutas del módulo "Postulación de Proyectos — Feria de Proyectos Rotary
// Colombia" (v4.592.0). Los endpoints públicos alimentan el wizard de
// /postular-proyecto; los /admin/* requieren token y sirven al configurador.
import express from 'express';
import { authMiddleware, requireSiteAdmin } from '../middleware/auth.js';
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
// Estas rutas devuelven las postulaciones y los pagos de TODOS los clubes, así
// que exigen sesión de plataforma CON rol administrativo del sitio
// (`requireSiteAdmin`). Hasta v4.626 sólo exigían `authMiddleware`, que no
// comprobaba ni la audiencia del token ni el rol: el token del panel de un
// club servía para leerlas. El permiso fino (ver pagos, editar, cambiar
// estado, exportar) lo resuelve además el propio controlador.
import fair from '../controllers/projectFairAdminController.js';

router.get('/admin/overview', authMiddleware, requireSiteAdmin, fair.getOverview);
router.get('/admin/catalog', authMiddleware, requireSiteAdmin, fair.getCatalog);
router.get('/admin/alerts', authMiddleware, requireSiteAdmin, fair.getAlerts);
router.get('/admin/reports', authMiddleware, requireSiteAdmin, fair.getReports);
router.get('/admin/export.csv', authMiddleware, requireSiteAdmin, fair.exportCsv);

router.get('/admin/postulaciones', authMiddleware, requireSiteAdmin, fair.listSubmissions);
router.get('/admin/postulaciones/:id', authMiddleware, requireSiteAdmin, fair.getSubmission);
router.get('/admin/postulaciones/:id/snapshot', authMiddleware, requireSiteAdmin, fair.getSubmissionSnapshot);
router.patch('/admin/postulaciones/:id', authMiddleware, requireSiteAdmin, express.json({ limit: '1mb' }), fair.updateSubmission);
router.post('/admin/postulaciones/:id/comments', authMiddleware, requireSiteAdmin, express.json(), fair.addComment);
router.post('/admin/postulaciones/:id/tags', authMiddleware, requireSiteAdmin, express.json(), fair.attachTag);
router.delete('/admin/postulaciones/:id/tags/:tagId', authMiddleware, requireSiteAdmin, fair.detachTag);
router.post('/admin/postulaciones/:id/files', authMiddleware, requireSiteAdmin, express.json(), fair.addFile);
router.delete('/admin/postulaciones/:id/files/:fileId', authMiddleware, requireSiteAdmin, fair.deleteFile);
router.post('/admin/postulaciones/:id/sync-stripe', authMiddleware, requireSiteAdmin, express.json(), fair.syncStripe);
router.post('/admin/postulaciones/:id/resend-receipt', authMiddleware, requireSiteAdmin, express.json(), fair.resendReceipt);

// Formulación de proyectos (v4.608)
router.get('/admin/formularios', authMiddleware, requireSiteAdmin, fair.listMasterForms);
router.get('/admin/postulaciones/:id/form', authMiddleware, requireSiteAdmin, fair.getMasterForm);
router.get('/admin/postulaciones/:id/form.docx', authMiddleware, requireSiteAdmin, fair.downloadMasterFormDocx);
router.post('/admin/postulaciones/:id/form/reopen', authMiddleware, requireSiteAdmin, express.json(), fair.reopenMasterForm);
router.post('/admin/postulaciones/:id/form/lock', authMiddleware, requireSiteAdmin, express.json(), fair.lockMasterForm);

router.get('/admin/tags', authMiddleware, requireSiteAdmin, fair.listTags);
router.post('/admin/tags', authMiddleware, requireSiteAdmin, express.json(), fair.createTag);
router.delete('/admin/tags/:id', authMiddleware, requireSiteAdmin, fair.deleteTag);

// ── Configuración de la convocatoria (pestaña del módulo unificado) ──
// Pasan por el control de permisos del módulo: leer exige acceso, guardar
// exige el permiso de configuración.
router.get('/admin/config', authMiddleware, requireSiteAdmin, fair.readConvocatoriaConfig);
router.put('/admin/config', authMiddleware, requireSiteAdmin, express.json({ limit: '1mb' }), fair.writeConvocatoriaConfig);
router.get('/admin/trm-providers', authMiddleware, requireSiteAdmin, listTrmProviders);

export default router;
