// Rutas del módulo "Postulación de Proyectos — Feria de Proyectos Rotary
// Colombia" (v4.592.0). Los endpoints públicos alimentan el wizard de
// /postular-proyecto; los /admin/* requieren token y sirven al configurador.
import express from 'express';
import { authMiddleware, requireSiteAdmin } from '../middleware/auth.js';
import {
    getEditions,
    createEdition,
    getAvailableEvents,
    linkEdition,
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
// v4.978 — Completar o reintentar el pago desde el panel. La inscripción sale
// del token, nunca del cuerpo: si viniera del cliente, cualquiera con este
// endpoint abriría un cobro contra la inscripción de otro club.
router.post('/portal/checkout', portal.portalAuth, express.json(), portal.startCheckout);
// Rutas heredadas: son el formulario 'master' de las genéricas de abajo.
router.put('/portal/form', portal.portalAuth, express.json({ limit: '2mb' }), portal.saveForm);
router.post('/portal/form/submit', portal.portalAuth, express.json({ limit: '2mb' }), portal.submitForm);

// ── Formularios del proyecto (v4.642) ────────────────────────────────
// Un proyecto tiene varios formularios (Formulación, Solicitud de Aportes del
// FDD 2026-2027, …). Estas cuatro rutas los atienden a todos: agregar uno
// nuevo no agrega endpoints, sólo una entrada en
// `server/lib/projectFormsRegistry.js`.
import projectForms from '../controllers/projectFormsController.js';

router.get('/portal/forms', portal.portalAuth, projectForms.getForms);
router.get('/portal/forms/:formKey', portal.portalAuth, projectForms.getForm);
router.put('/portal/forms/:formKey', portal.portalAuth, express.json({ limit: '2mb' }), projectForms.saveForm);
router.post('/portal/forms/:formKey/submit', portal.portalAuth, express.json({ limit: '2mb' }), projectForms.submitForm);

// ── Gestión de Postulaciones y Pagos (v4.598) ────────────────────────
// Estas rutas devuelven las postulaciones y los pagos de TODOS los clubes, así
// que exigen sesión de plataforma CON rol administrativo del sitio
// (`requireSiteAdmin`). Hasta v4.626 sólo exigían `authMiddleware`, que no
// comprobaba ni la audiencia del token ni el rol: el token del panel de un
// club servía para leerlas. El permiso fino (ver pagos, editar, cambiar
// estado, exportar) lo resuelve además el propio controlador.
import fair from '../controllers/projectFairAdminController.js';

// ── Ediciones (v4.683) ───────────────────────────────────────────────
// La primera pantalla del módulo: el listado de versiones del evento. Cada una
// es un contenedor independiente, y todo lo demás se consulta con `?evento=`.
router.get('/admin/ediciones', authMiddleware, requireSiteAdmin, getEditions);
router.get('/admin/ediciones/disponibles', authMiddleware, requireSiteAdmin, getAvailableEvents);
router.post('/admin/ediciones', authMiddleware, requireSiteAdmin, express.json(), createEdition);
// Salida cuando la migración automática no pudo identificar la edición sola.
router.put('/admin/ediciones/vincular', authMiddleware, requireSiteAdmin, express.json(), linkEdition);

// Centro de Inteligencia de la edición (v4.689). Las dos rutas responden lo
// mismo: la pantalla es una sola desde que se unificaron Dashboard y Reportes.
router.get('/admin/inteligencia', authMiddleware, requireSiteAdmin, fair.getIntelligence);
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

// Formularios del proyecto, en genérico (v4.642). `/admin/forms?formKey=…`
// lista cualquiera de ellos; la aprobación institucional (firmas del GD y del
// presidente del Comité de LFRI) sólo se escribe por aquí, con rol
// administrativo del sitio y permiso 'changeStatus' del módulo.
router.get('/admin/forms', authMiddleware, requireSiteAdmin, projectForms.adminListForms);
router.get('/admin/postulaciones/:id/forms/:formKey', authMiddleware, requireSiteAdmin, projectForms.adminGetForm);
router.put('/admin/postulaciones/:id/forms/:formKey/approval', authMiddleware, requireSiteAdmin, express.json({ limit: '1mb' }), projectForms.saveApproval);
router.post('/admin/postulaciones/:id/forms/:formKey/reopen', authMiddleware, requireSiteAdmin, express.json(), projectForms.reopenForm);
router.post('/admin/postulaciones/:id/forms/:formKey/lock', authMiddleware, requireSiteAdmin, express.json(), projectForms.lockForm);

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
