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

// Ficha de una inscripción
router.get('/admin/registrations/:id', authMiddleware, admin.getRegistrationDetail);
router.patch('/admin/registrations/:id/status', authMiddleware, json, admin.changeStatus);
router.patch('/admin/registrations/:id/tags', authMiddleware, json, admin.updateTags);
router.patch('/admin/registrations/:id/notes', authMiddleware, json, admin.updateNotes);
router.post('/admin/registrations/:id/checkin', authMiddleware, json, admin.checkIn);
router.post('/admin/registrations/:id/message', authMiddleware, json, admin.sendMessage);

// ── Público ──────────────────────────────────────────────────────────
router.get('/config/:clubId/:eventRef', registrations.getPublicRegistrationConfig);
router.post('/draft', json, registrations.saveDraft);
router.post('/', json, registrations.createRegistration);
router.post('/:id/checkout', json, registrations.createCheckout);
router.get('/:id', registrations.getRegistration);

export default router;
