// ════════════════════════════════════════════════════════════════════
// Rutas del módulo de inscripciones a eventos — v4.648.0
//
// Los endpoints públicos alimentan el asistente de /eventos/:evento/registro.
// Los /admin/* exigen token de la plataforma; la comprobación de que el evento
// pertenece al sitio de quien consulta vive en el controlador, no aquí.
//
// Los `/admin/...` se declaran ANTES que `/:id` a propósito: aunque hoy no
// colisionan por número de segmentos, dejarlos arriba evita que una ruta
// pública futura de un solo segmento se coma las administrativas.
// ════════════════════════════════════════════════════════════════════
import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import registrations from '../controllers/eventRegistrationController.js';
import admin from '../controllers/eventRegistrationAdminController.js';
import completed from '../controllers/completedRegistrationController.js';
import completedAdmin from '../controllers/completedRegistrationAdminController.js';
import attendee, { attendeeAuth, requireAttendeePermission, ATTENDEE_PERMISSIONS } from '../controllers/eventAttendeeController.js';

const router = express.Router();
const json = express.json({ limit: '512kb' });

// ── Administración ───────────────────────────────────────────────────
// Edición y categorías de registro
router.get('/admin/edition', authMiddleware, admin.getEdition);
router.put('/admin/edition', authMiddleware, json, admin.saveEdition);
router.post('/admin/edition/seed', authMiddleware, json, admin.seedEditionCategories);
router.post('/admin/editions/clone', authMiddleware, json, admin.cloneEdition);
router.put('/admin/categories', authMiddleware, json, admin.saveCategory);
router.delete('/admin/categories/:key', authMiddleware, admin.removeCategory);
router.get('/admin/categories/:key/form', authMiddleware, admin.previewCategoryForm);
// Diagnóstico: qué botones ve el público y por qué falta alguno.
router.get('/admin/cta/preview', authMiddleware, admin.previewCta);

// Tablero, tabla y exportación
router.get('/admin/dashboard', authMiddleware, admin.getDashboard);
router.get('/admin/list', authMiddleware, admin.listRegistrations);
router.get('/admin/export.csv', authMiddleware, admin.exportRegistrationsCsv);
router.get('/admin/export.xlsx', authMiddleware, admin.exportRegistrationsXlsx);

// Acreditación del día del evento
router.get('/admin/checkin/lookup', authMiddleware, admin.lookupForCheckIn);

// ── Inscripciones completadas (v4.943) ───────────────────────────────
// La pestaña «Inscripciones completadas»: registros que llegaron por el
// formulario público de completar inscripción (pago por fuera de la página).
// Las literales van ANTES que `/admin/completed/:id` — Express casa por orden
// y una literal debajo de su paramétrica es inalcanzable (check:routes).
router.get('/admin/completed/config', authMiddleware, completedAdmin.getConfig);
router.put('/admin/completed/config', authMiddleware, json, completedAdmin.saveConfig);
router.get('/admin/completed/summary', authMiddleware, completedAdmin.getSummary);
router.get('/admin/completed/list', authMiddleware, completedAdmin.list);
router.get('/admin/completed/export.csv', authMiddleware, completedAdmin.exportCsv);
router.get('/admin/completed/export.xlsx', authMiddleware, completedAdmin.exportXlsx);
// v4.945 — la notificación de confirmación: vista previa y correo de prueba.
router.post('/admin/completed/notification-preview', authMiddleware, json, completedAdmin.notificationPreview);
router.post('/admin/completed/notification-test', authMiddleware, json, completedAdmin.notificationTest);
// v4.952 — acciones en bloque sobre la selección del listado. Literales,
// así que van ANTES de `/admin/completed/:id`.
router.post('/admin/completed/bulk-status', authMiddleware, json, completedAdmin.bulkStatus);
router.post('/admin/completed/bulk-edit', authMiddleware, json, completedAdmin.bulkEdit);
router.post('/admin/completed/bulk-delete', authMiddleware, json, completedAdmin.bulkDelete);
// v4.965 — el envío de la confirmación a la selección. Corre por la MISMA
// función que el envío automático y el reenvío de a uno.
router.post('/admin/completed/bulk-notify', authMiddleware, json, completedAdmin.bulkNotify);
// v4.950 — El motor de importación de inscripciones históricas. Las literales
// van ANTES de `/admin/completed/:id` (regla de check:routes, v4.859). El
// texto del archivo viaja en el cuerpo: con miles de filas supera el límite
// por defecto, así que estas tres llevan su propio json de 10 MB.
const jsonBig = express.json({ limit: '10mb' });
router.post('/admin/completed/import/inspect', authMiddleware, jsonBig, completedAdmin.importInspect);
router.post('/admin/completed/import/preflight', authMiddleware, jsonBig, completedAdmin.importPreflight);
router.post('/admin/completed/import/commit', authMiddleware, jsonBig, completedAdmin.importCommit);
router.get('/admin/completed/import/batches', authMiddleware, completedAdmin.importBatches);
router.get('/admin/completed/import/batches/:batchId', authMiddleware, completedAdmin.importBatchDetail);
router.post('/admin/completed/import/batches/:batchId/revert', authMiddleware, json, completedAdmin.importRevert);
router.get('/admin/completed/:id', authMiddleware, completedAdmin.detail);
router.patch('/admin/completed/:id', authMiddleware, json, completedAdmin.update);
router.patch('/admin/completed/:id/status', authMiddleware, json, completedAdmin.changeStatus);
router.post('/admin/completed/:id/resend', authMiddleware, json, completedAdmin.resend);
router.get('/admin/completed/:id/receipt', authMiddleware, completedAdmin.receiptUrl);
router.post('/admin/completed/:id/checkin', authMiddleware, json, completedAdmin.checkIn);

// Ficha de una inscripción
router.get('/admin/registrations/:id', authMiddleware, admin.getRegistrationDetail);
router.patch('/admin/registrations/:id/status', authMiddleware, json, admin.changeStatus);
router.patch('/admin/registrations/:id/tags', authMiddleware, json, admin.updateTags);
router.patch('/admin/registrations/:id/notes', authMiddleware, json, admin.updateNotes);
router.post('/admin/registrations/:id/checkin', authMiddleware, json, admin.checkIn);
router.post('/admin/registrations/:id/message', authMiddleware, json, admin.sendMessage);

// ── Panel del Asistente al Evento ────────────────────────────────────
//
// Identidad propia (`EventAttendeeAccount`), audiencia propia y permisos
// propios: `attendeeAuth` rechaza el token de la plataforma y el del panel del
// club, y `requireAttendeePermission` exige el permiso concreto. Van ANTES de
// `/:id` para que ninguna ruta pública de un solo segmento se las coma.
router.post('/portal/login', json, attendee.login);
router.post('/portal/forgot', json, attendee.forgotPassword);
router.post('/portal/reset', json, attendee.resetPassword);
// Entrada automática al volver de la pasarela o desde otro dispositivo: se
// canjea la propiedad de la inscripción por una sesión, sin pedir la clave.
router.post('/portal/claim', json, attendee.claimSession);
// Puente desde otra sesión del sitio: quien ya entró como Gestor de Proyectos
// descubre su panel del evento sin volver a escribir la contraseña.
router.post('/portal/link', json, attendee.linkFromIdentity);
router.post('/portal/verify', json, attendee.verifyEmail);
router.get('/portal/me', attendeeAuth,
    requireAttendeePermission(ATTENDEE_PERMISSIONS.VIEW_OWN_REGISTRATION), attendee.getPortalData);
router.get('/portal/registrations/:id', attendeeAuth,
    requireAttendeePermission(ATTENDEE_PERMISSIONS.VIEW_OWN_REGISTRATION), attendee.getOwnRegistration);
router.patch('/portal/profile', attendeeAuth, json,
    requireAttendeePermission(ATTENDEE_PERMISSIONS.UPDATE_OWN_PROFILE), attendee.updateProfile);

// ── Público ──────────────────────────────────────────────────────────
// Formulario de inscripciones completadas: la URL pública por evento
// (p. ej. /inscripcion-conferencia-distrital-villavicencio-2027) resuelve por
// el slug configurado en la edición. El comprobante sube directo a S3 con la
// URL prefirmada de `/receipt-url`.
router.get('/public/completed/:slug', completed.getPublicCompletedConfig);
router.post('/public/completed/:slug/receipt-url', json, completed.createReceiptUploadUrl);
router.post('/public/completed/:slug', json, completed.submitCompleted);

router.get('/config/:clubId/:eventRef', registrations.getPublicRegistrationConfig);
router.post('/draft', json, registrations.saveDraft);
router.post('/', json, registrations.createRegistration);
router.post('/:id/checkout', json, registrations.createCheckout);
router.get('/:id', registrations.getRegistration);

export default router;
