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

// v4.1269 — los clubes salen del Catálogo Maestro (vivo), no de la lista estática.
import { clubCatalogFresh } from '../lib/clubCatalog.js';
const router = express.Router();
router.use(clubCatalogFresh);

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
// v4.1253 — La postulación desde el perfil: terminar y enviar un borrador, y
// el comprobante del pago. La postulación sale del token, nunca del cuerpo.
router.put('/portal/application', portal.portalAuth, express.json({ limit: '256kb' }), portal.saveApplication);
router.post('/portal/application/submit', portal.portalAuth, express.json({ limit: '256kb' }), portal.submitApplication);
router.get('/portal/receipt', portal.portalAuth, portal.getReceipt);
// v4.1299 — La INSCRIPCIÓN del club: agregar un segundo proyecto (antes o
// después de pagar el primero), quitarlo antes de pagar y restaurarlo. La
// inscripción sale del token, nunca del cuerpo. Literales antes de `/:id`.
router.post('/portal/projects', portal.portalAuth, express.json({ limit: '256kb' }), portal.addProject);
router.post('/portal/projects/:id/withdraw', portal.portalAuth, express.json(), portal.withdrawProject);
router.post('/portal/projects/:id/restore', portal.portalAuth, express.json(), portal.restoreProject);
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

// ── Recursos del proyecto: plantilla oficial de presentación (v4.1264) ─
// El club lista sus recursos y pide la descarga con SU sesión: la postulación
// sale del token. El servidor registra la solicitud y la entrega, y sólo
// entonces devuelve un enlace firmado que caduca. No depende del pago.
import resources from '../controllers/projectFairResourceController.js';

router.get('/portal/resources', portal.portalAuth, resources.portalListResources);
router.post('/portal/resources/:key/download', portal.portalAuth, express.json(), resources.portalDownload);

// ── Video Pitch Profesional (v4.1293) ────────────────────────────────
// El club pide, con SU sesión, un video de presentación de su proyecto: la
// postulación sale del token, nunca del cuerpo. Guardado automático, archivos
// por PUT prefirmado validados después por sus bytes, envío, decisión sobre el
// guion y lectura firmada del video entregado.
import videoPitch from '../controllers/videoPitchController.js';

const vpJson = express.json({ limit: '512kb' });
router.get('/portal/video-pitch', portal.portalAuth, videoPitch.portalGet);
router.put('/portal/video-pitch', portal.portalAuth, vpJson, videoPitch.portalSave);
router.post('/portal/video-pitch/submit', portal.portalAuth, vpJson, videoPitch.portalSubmit);
router.post('/portal/video-pitch/files/presign', portal.portalAuth, vpJson, videoPitch.portalPresign);
router.post('/portal/video-pitch/files', portal.portalAuth, vpJson, videoPitch.portalRegisterFile);
router.patch('/portal/video-pitch/files/:fileId', portal.portalAuth, vpJson, videoPitch.portalUpdateFile);
router.delete('/portal/video-pitch/files/:fileId', portal.portalAuth, videoPitch.portalDeleteFile);
router.get('/portal/video-pitch/files/:fileId/url', portal.portalAuth, videoPitch.portalFileUrl);
router.post('/portal/video-pitch/script/decision', portal.portalAuth, vpJson, videoPitch.portalScriptDecision);
router.post('/portal/video-pitch/messages', portal.portalAuth, vpJson, videoPitch.portalMessage);
// v4.1296 — La capa comercial: catálogo, elegir plan (o pagar después),
// Checkout de Stripe y verificación al volver. El importe sale de la ORDEN.
import videoPitchCommerce from '../controllers/videoPitchCommerceController.js';

router.get('/portal/video-pitch/plans', portal.portalAuth, videoPitchCommerce.portalPlans);
router.post('/portal/video-pitch/plan', portal.portalAuth, express.json({ limit: '512kb' }), videoPitchCommerce.portalSelectPlan);
router.post('/portal/video-pitch/checkout', portal.portalAuth, vpJson, videoPitchCommerce.portalCheckout);
router.post('/portal/video-pitch/checkout/sync', portal.portalAuth, vpJson, videoPitchCommerce.portalSyncCheckout);

// ── Videos de proyectos: el video PROPIO del club (v4.1298) ─────────
// Sin costo y sin Stripe: ficha, subida privada prefirmada validada por bytes,
// versiones, envío a revisión, retiro y lectura firmada. La postulación sale
// del token, nunca del cuerpo. Independiente del Video Pitch Profesional.
import projectVideo from '../controllers/projectVideoController.js';

router.get('/portal/project-video', portal.portalAuth, projectVideo.portalGet);
router.post('/portal/project-video', portal.portalAuth, vpJson, projectVideo.portalSave);
router.post('/portal/project-video/:id/presign', portal.portalAuth, vpJson, projectVideo.portalPresign);
router.post('/portal/project-video/:id/versions', portal.portalAuth, vpJson, projectVideo.portalRegisterVersion);
router.post('/portal/project-video/:id/submit', portal.portalAuth, vpJson, projectVideo.portalSubmit);
router.post('/portal/project-video/:id/withdraw', portal.portalAuth, vpJson, projectVideo.portalWithdraw);
router.get('/portal/project-video/:id/url', portal.portalAuth, projectVideo.portalUrl);

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
// v4.1253 — Recordatorios de pago a quien ya postuló y no ha pagado. Sin
// `confirm: true` sólo devuelve el plan. Literal ANTES de las paramétricas.
router.post('/admin/postulaciones/payment-reminders', authMiddleware, fairEdit, json, fair.sendPaymentReminders);

// v4.1026 — Resolver el traslado de lo cobrado. LECTURA: devuelve qué
// inscripciones se pueden trasladar y cuáles no, con su motivo y su salida. El
// REGISTRO va por `/financial/wallet/disbursements/bulk`, que es el único punto
// que mueve este dinero. Literal ANTES de las paramétricas (`check:routes`).
router.post('/admin/postulaciones/transfers/resolve', authMiddleware, requireSiteAdmin, json, fair.resolveTransfers);

// v4.1311 — Sustituir una postulación por otra del mismo club con su pago:
// verificar (solo lectura) y aplicar (transacción). Literales ANTES de las
// paramétricas.
router.post('/admin/postulaciones/sustitucion/verificar', authMiddleware, fairEdit, express.json(), fair.verifySubstitution);
router.post('/admin/postulaciones/sustitucion/aplicar', authMiddleware, fairEdit, express.json(), fair.applySubstitution);
// v4.1324 — Expediente integral del proyecto: lectura completa, edición
// auditada, traducción al inglés con revisión humana, fichas PDF (español,
// inglés y bilingüe) y libretas. Literales ANTES de las paramétricas.
import dossier from '../controllers/projectDossierController.js';

router.get('/admin/expedientes/estado', authMiddleware, fairRead, dossier.getDossierStates);
router.post('/admin/expedientes/documentos', authMiddleware, fairRead, express.json(), dossier.getDocumentsBulk);
router.get('/admin/expedientes/glosario', authMiddleware, fairRead, dossier.getGlossary);
router.post('/admin/expedientes/glosario', authMiddleware, fairManage, express.json(), dossier.saveGlossaryEntry);
router.delete('/admin/expedientes/glosario/:glossaryId', authMiddleware, fairManage, dossier.deleteGlossaryEntry);
router.get('/admin/postulaciones/:id/expediente', authMiddleware, fairRead, dossier.getDossier);
router.patch('/admin/postulaciones/:id/expediente', authMiddleware, fairEdit, express.json({ limit: '2mb' }), dossier.updateDossier);
router.get('/admin/postulaciones/:id/expediente/historial', authMiddleware, fairRead, dossier.getDossierHistory);
router.get('/admin/postulaciones/:id/expediente/documento', authMiddleware, fairRead, dossier.getDocument);
router.get('/admin/postulaciones/:id/traduccion/:lang', authMiddleware, fairRead, dossier.getTranslation);
router.post('/admin/postulaciones/:id/traduccion/:lang/generar', authMiddleware, fairEdit, express.json(), dossier.generateTranslation);
router.put('/admin/postulaciones/:id/traduccion/:lang', authMiddleware, fairEdit, express.json({ limit: '2mb' }), dossier.saveTranslation);
router.post('/admin/postulaciones/:id/traduccion/:lang/aprobar', authMiddleware, fairEdit, express.json(), dossier.approveTranslation);
router.get('/admin/postulaciones/:id/libreta', authMiddleware, fairRead, dossier.getBooklet);
router.post('/admin/postulaciones/:id/libreta/preparar', authMiddleware, fairEdit, express.json(), dossier.prepareBooklet);
router.put('/admin/postulaciones/:id/libreta', authMiddleware, fairEdit, express.json({ limit: '1mb' }), dossier.saveBooklet);
router.post('/admin/postulaciones/:id/libreta/aprobar', authMiddleware, fairEdit, express.json(), dossier.approveBooklet);
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
// v4.1313 — Editar el valor de la inscripción de un proyecto (motivo obligatorio).
router.post('/admin/postulaciones/:id/amount', authMiddleware, fairEdit, express.json(), fair.updateProjectAmount);
router.post('/admin/postulaciones/:id/confirm-manual-payment', authMiddleware, fairEdit, express.json(), fair.confirmManualPayment);
// v4.1308 — El comprobante adjunto de la confirmación manual (S3 privado).
router.post('/admin/postulaciones/:id/manual-payment/receipt-url', authMiddleware, fairEdit, express.json(), fair.manualReceiptUploadUrl);
router.get('/admin/postulaciones/:id/manual-payment/receipt', authMiddleware, fairRead, fair.manualReceiptUrl);
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

// Recursos y plantillas (v4.1264). Ver y consultar estadísticas exige acceso
// al módulo; exportar, el permiso de exportación; subir, publicar, reemplazar
// y editar, el de configuración (lo resuelve `withAccess` en el controlador).
router.get('/admin/recursos', authMiddleware, fairRead, resources.adminListResources);
router.put('/admin/recursos/:key', authMiddleware, fairManage, express.json(), resources.adminUpdateResource);
router.post('/admin/recursos/:key/presign', authMiddleware, fairManage, express.json(), resources.adminPresignUpload);
router.post('/admin/recursos/:key/versions', authMiddleware, fairManage, express.json(), resources.adminRegisterVersion);
router.get('/admin/recursos/:key/versions/:versionId/download', authMiddleware, fairRead, resources.adminDownloadVersion);
router.get('/admin/recursos/:key/analytics', authMiddleware, fairRead, resources.adminAnalytics);
router.get('/admin/recursos/:key/analytics.csv', authMiddleware, fairRead, resources.adminAnalyticsCsv);

// Video Pitch Profesional (v4.1293). Ver la bandeja y la ficha exige acceso al
// módulo; exportar, el permiso de exportación; asignar, cambiar el estado, los
// guiones y los archivos, el de cambiar estado (lo resuelve `withAccess`).
// ⚠️ Las literales (`export.csv`, `bulk`) VAN ANTES de `/:id` (`check:routes`).
router.get('/admin/video-pitch', authMiddleware, fairRead, videoPitch.adminList);
router.get('/admin/video-pitch/export.csv', authMiddleware, fairRead, videoPitch.adminExportCsv);
router.post('/admin/video-pitch/bulk', authMiddleware, fairEdit, vpJson, videoPitch.adminBulk);
// v4.1296 — Planes (configuración del módulo), historial del catálogo y
// limpieza de subidas huérfanas. Literales ANTES de `/:id`.
router.get('/admin/video-pitch/plans', authMiddleware, fairRead, videoPitchCommerce.adminListPlans);
router.post('/admin/video-pitch/plans', authMiddleware, fairManage, vpJson, videoPitchCommerce.adminCreatePlan);
router.get('/admin/video-pitch/plans/history', authMiddleware, fairRead, videoPitchCommerce.adminPlanHistory);
router.put('/admin/video-pitch/plans/:planId', authMiddleware, fairManage, vpJson, videoPitchCommerce.adminUpdatePlan);
router.post('/admin/video-pitch/maintenance/cleanup', authMiddleware, fairManage, vpJson, videoPitchCommerce.adminCleanupUploads);
router.get('/admin/video-pitch/:id', authMiddleware, fairRead, videoPitch.adminGet);
router.post('/admin/video-pitch/:id/payment/waive', authMiddleware, fairEdit, vpJson, videoPitchCommerce.adminWaivePayment);
router.post('/admin/video-pitch/:id/payment/sync', authMiddleware, fairEdit, vpJson, videoPitchCommerce.adminSyncPayment);
router.patch('/admin/video-pitch/:id', authMiddleware, fairEdit, vpJson, videoPitch.adminUpdate);
router.post('/admin/video-pitch/:id/status', authMiddleware, fairEdit, vpJson, videoPitch.adminSetStatus);
router.post('/admin/video-pitch/:id/comments', authMiddleware, fairEdit, vpJson, videoPitch.adminComment);
router.get('/admin/video-pitch/:id/files/:fileId/url', authMiddleware, fairRead, videoPitch.adminFileUrl);
router.post('/admin/video-pitch/:id/files/presign', authMiddleware, fairEdit, vpJson, videoPitch.adminPresign);
router.post('/admin/video-pitch/:id/files', authMiddleware, fairEdit, vpJson, videoPitch.adminRegisterFile);
router.delete('/admin/video-pitch/:id/files/:fileId', authMiddleware, fairEdit, videoPitch.adminDeleteFile);
router.post('/admin/video-pitch/:id/scripts/generate', authMiddleware, fairEdit, vpJson, videoPitch.adminGenerateScript);
router.post('/admin/video-pitch/:id/scripts', authMiddleware, fairEdit, express.json({ limit: '2mb' }), videoPitch.adminSaveScript);
router.get('/admin/video-pitch/:id/scripts/:scriptId', authMiddleware, fairRead, videoPitch.adminGetScript);
router.post('/admin/video-pitch/:id/scripts/:scriptId/current', authMiddleware, fairEdit, vpJson, videoPitch.adminSetCurrentScript);
router.post('/admin/video-pitch/:id/scripts/:scriptId/send', authMiddleware, fairEdit, vpJson, videoPitch.adminSendScript);
router.post('/admin/video-pitch/:id/scripts/:scriptId/approve', authMiddleware, fairEdit, vpJson, videoPitch.adminApproveScript);

// Videos de proyectos (v4.1298): la bandeja de videos propios, la ficha con su
// reproducción, la revisión (estado con motivo, observaciones) y la
// configuración por edición. `config` es LITERAL: antes de `/:id`.
router.get('/admin/project-videos', authMiddleware, fairRead, projectVideo.adminList);
router.get('/admin/project-videos/config', authMiddleware, fairRead, projectVideo.adminGetConfig);
router.put('/admin/project-videos/config', authMiddleware, fairManage, vpJson, projectVideo.adminSaveConfig);
router.get('/admin/project-videos/:id', authMiddleware, fairRead, projectVideo.adminGet);
router.patch('/admin/project-videos/:id', authMiddleware, fairEdit, vpJson, projectVideo.adminUpdate);
router.post('/admin/project-videos/:id/status', authMiddleware, fairEdit, vpJson, projectVideo.adminSetStatus);
router.post('/admin/project-videos/:id/comments', authMiddleware, fairEdit, vpJson, projectVideo.adminComment);
router.get('/admin/project-videos/:id/versions/:versionId/url', authMiddleware, fairRead, projectVideo.adminUrl);

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
