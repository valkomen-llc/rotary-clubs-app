// Rutas del módulo "Calendario de Capacitaciones y Soporte".
// Montado en /api/training (server.js y api/index.js).
import express from 'express';
import { authMiddleware, roleMiddleware } from '../middleware/auth.js';
import * as ctrl from '../controllers/trainingController.js';

const router = express.Router();
const superOnly = roleMiddleware(['administrator']);

// Todo el módulo requiere autenticación.
router.use(authMiddleware);

// ── Área usuario / sitio ────────────────────────────────────────────────────
router.get('/types', ctrl.listTypes);
router.get('/site-status', ctrl.siteStatus);
router.get('/slots', ctrl.slots);
router.post('/appointments', ctrl.createAppointment);
router.get('/appointments/mine', ctrl.myAppointments);
router.get('/appointments/:id/ics', ctrl.downloadIcs);
router.get('/appointments/:id/calendar-links', ctrl.calendarLinks);
router.post('/appointments/:id/cancel', ctrl.cancelAppointment);
router.post('/appointments/:id/reschedule', ctrl.rescheduleAppointment);
router.post('/appointments/:id/survey', ctrl.submitSurvey);
router.post('/activation-checkout', ctrl.activationCheckout);

// ── Área superadmin ─────────────────────────────────────────────────────────
router.get('/admin/config', superOnly, ctrl.getConfig);
router.put('/admin/config', superOnly, ctrl.updateConfig);

router.get('/admin/blocks', superOnly, ctrl.listBlocks);
router.post('/admin/blocks', superOnly, ctrl.createBlock);
router.put('/admin/blocks/:id', superOnly, ctrl.updateBlock);
router.delete('/admin/blocks/:id', superOnly, ctrl.deleteBlock);

router.get('/admin/blackouts', superOnly, ctrl.listBlackouts);
router.post('/admin/blackouts', superOnly, ctrl.createBlackout);
router.delete('/admin/blackouts/:id', superOnly, ctrl.deleteBlackout);

router.get('/admin/responsibles', superOnly, ctrl.listResponsibles);
router.post('/admin/responsibles', superOnly, ctrl.createResponsible);
router.put('/admin/responsibles/:id', superOnly, ctrl.updateResponsible);
router.delete('/admin/responsibles/:id', superOnly, ctrl.deleteResponsible);

router.post('/admin/types', superOnly, ctrl.createType);
router.put('/admin/types/:id', superOnly, ctrl.updateType);
router.delete('/admin/types/:id', superOnly, ctrl.deleteType);

router.get('/admin/appointments', superOnly, ctrl.adminListAppointments);
router.put('/admin/appointments/:id', superOnly, ctrl.adminUpdateAppointment);
router.post('/admin/appointments/:id/materials', superOnly, ctrl.addMaterial);
router.delete('/admin/appointments/:id/materials/:materialId', superOnly, ctrl.deleteMaterial);
router.get('/admin/stats', superOnly, ctrl.adminStats);

export default router;
