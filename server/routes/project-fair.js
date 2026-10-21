// Rutas del módulo "Postulación de Proyectos — Feria de Proyectos Rotary
// Colombia" (v4.592.0). Los endpoints públicos alimentan el wizard de
// /postular-proyecto; los /admin/* requieren token y sirven al configurador.
import express from 'express';
import { authMiddleware, requireSiteAdmin, SITE_ADMIN_ROLES } from '../middleware/auth.js';
import { requireRoleOrPermission } from '../middleware/institutionalGuard.js';
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

const fairRead = requireRoleOrPermission(SITE_ADMIN_ROLES, 'project_fair.view');
const fairEdit = requireRoleOrPermission(SITE_ADMIN_ROLES, 'project_fair.edit');
const fairManage = requireRoleOrPermission(SITE_ADMIN_ROLES, 'project_fair.manage');

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
// que exigen sesión de plataforma CON rol administrativo del sitio o permiso
// institucional del módulo de Feria de Proyectos. El permiso fino lo resuelve además
// el propio controlador.
import fair from '../controllers/projectFairAdminController.js';

// ── Ediciones (v4.683) ───────────────────────────────────────────────
// La primera pantalla del módulo: el listado de versiones del evento. Cada una
// es un contenedor independiente, y todo lo demás se consulta con `?evento=`.
router.get('/admin/ediciones', authMiddleware, fairRead, getEditions);
router.get('/admin/ediciones/disponibles', authMiddleware, fairRead, getAvailableEvents);
router.post('/admin/ediciones', authMiddleware, fairManage, express.json(), createEdition);
// Salida cuando la migración automática no pudo identificar la edición sola.
router.put('/admin/ediciones/vincular', authMiddleware, fairManage, express.json(), linkEdition);

// Centro de Inteligencia de la edición (v4.689). Las dos rutas responden lo
// mismo: la pantalla es una sola desde que se unificaron Dashboard y Reportes.
router.get('/admin/dashboard-intelligence', authMiddleware, fairRead, fair.getDashboardIntelligence);
router.get('/admin/inteligencia', authMiddleware, fairRead, fair.getIntelligence);
router.get('/admin/overview', authMiddleware, fairRead, fair.getOverview);
router.get('/admin/catalog', authMiddleware, fairRead, fair.getCatalog);
router.get('/admin/alerts', authMiddleware, fairRead, fair.getAlerts);
router.get('/admin/reports', authMiddleware, fairRead, fair.getReports);
router.get('/admin/export.csv', authMiddleware, fairRead, fair.exportCsv);

// ── Acciones en bloque (v4.1024) ─────────────────────────────────────
// ⚠️ VAN ANTES DE LAS PARAMÉTRICAS. Express casa por ORDEN de declaración, así
// que una literal declarada debajo de su `/:id` es inalcanzable y el fallo es
// MUDO: la petición cae en el manejador equivocado con «bulk-delete» como id
// (`npm run check:routes`). Cada una exige `confirm: true` y la edición
// abierta en `?evento=`; el permiso lo declara `BULK_CAPABILITY`.
const json = express.json({ limit: '256kb' });
router.post('/admin/postulaciones/bulk-archive', authMiddleware, fairEdit, json, fair.bulkArchive);
router.post('/admin/postulaciones/bulk-restore', authMiddleware, fairEdit, json, fair.bulkRestore);
router.post('/admin/postulaciones/bulk-delete', authMiddleware, fairManage, json, fair.bulkDelete);
router.post('/admin/postulaciones/bulk-status', authMiddleware, fairEdit, json, fair.bulkStatus);
router.post('/admin/postulaciones/bulk-tag', authMiddleware, fairEdit, json, fair.bulkTag);

// v4.1026 — Resolver el traslado de lo cobrado. LECTURA: devuelve qué
// inscripciones se pueden trasladar y cuáles no, con su motivo y su salida. El
// REGISTRO va por `/financial/wallet/disbursements/bulk`, que es el único punto
// que mueve este dinero. Literal ANTES de las paramétricas (`check:routes`).
router.post('/admin/postulaciones/transfers/resolve', authMiddleware, requireSiteAdmin, json, fair.resolveTransfers);

router.get('/admin/postulaciones', authMiddleware, fairRead, fair.listSubmissions);
router.get('/admin/postulaciones/:id', authMiddleware, fairRead, fair.getSubmission);
router.get('/admin/postulaciones/:id/snapshot', authMiddleware, fairRead, fair.getSubmissionSnapshot);
router.patch('/admin/postulaciones/:id', authMiddleware, fairEdit, express.json({ limit: '1mb' }), fair.updateSubmission);
router.post('/admin/postulaciones/:id/comments', authMiddleware, fairEdit, express.json(), fair.addComment);
router.post('/admin/postulaciones/:id/tags', authMiddleware, fairEdit, express.json(), fair.attachTag);
router.delete('/admin/postulaciones/:id/tags/:tagId', authMiddleware, fairEdit, fair.detachTag);
router.post('/admin/postulaciones/:id/files', authMiddleware, fairEdit, express.json(), fair.addFile);
router.delete('/admin/postulaciones/:id/files/:fileId', authMiddleware, fairEdit, fair.deleteFile);
router.post('/admin/postulaciones/:id/sync-stripe', authMiddleware, fairEdit, express.json(), fair.syncStripe);
router.post('/admin/postulaciones/:id/confirm-manual-payment', authMiddleware, fairEdit, express.json(), fair.confirmManualPayment);
router.get('/admin/postulaciones/:id/payment-history', authMiddleware, fairRead, fair.getPaymentHistory);
router.post('/admin/postulaciones/:id/resend-receipt', authMiddleware, fairEdit, express.json(), fair.resendReceipt);

// Formulación de proyectos (v4.608)
router.get('/admin/formularios', authMiddleware, fairRead, fair.listMasterForms);
router.get('/admin/postulaciones/:id/form', authMiddleware, fairRead, fair.getMasterForm);
router.get('/admin/postulaciones/:id/form.docx', authMiddleware, fairRead, fair.downloadMasterFormDocx);
router.post('/admin/postulaciones/:id/form/reopen', authMiddleware, fairEdit, express.json(), fair.reopenMasterForm);
router.post('/admin/postulaciones/:id/form/lock', authMiddleware, fairEdit, express.json(), fair.lockMasterForm);

// Formularios del proyecto, en genérico (v4.642). `/admin/forms?formKey=…`
// lista cualquiera de ellos; la aprobación institucional (firmas del GD y del
// presidente del Comité de LFRI) sólo se escribe por aquí, con rol
// administrativo del sitio y permiso 'changeStatus' del módulo.
router.get('/admin/forms', authMiddleware, fairRead, projectForms.adminListForms);
router.get('/admin/postulaciones/:id/forms/:formKey', authMiddleware, fairRead, projectForms.adminGetForm);
router.put('/admin/postulaciones/:id/forms/:formKey/approval', authMiddleware, fairEdit, express.json({ limit: '1mb' }), projectForms.saveApproval);
router.post('/admin/postulaciones/:id/forms/:formKey/reopen', authMiddleware, fairEdit, express.json(), projectForms.reopenForm);
router.post('/admin/postulaciones/:id/forms/:formKey/lock', authMiddleware, fairEdit, express.json(), projectForms.lockForm);

router.get('/admin/tags', authMiddleware, fairRead, fair.listTags);
router.post('/admin/tags', authMiddleware, fairEdit, express.json(), fair.createTag);
router.delete('/admin/tags/:id', authMiddleware, fairEdit, fair.deleteTag);

// ── Configuración de la convocatoria (pestaña del módulo unificado) ──
// Pasan por el control de permisos del módulo: leer exige acceso, guardar
// exige el permiso de configuración.
router.get('/admin/config', authMiddleware, fairRead, fair.readConvocatoriaConfig);
router.put('/admin/config', authMiddleware, fairManage, express.json({ limit: '1mb' }), fair.writeConvocatoriaConfig);
router.get('/admin/trm-providers', authMiddleware, fairRead, listTrmProviders);

export default router;
