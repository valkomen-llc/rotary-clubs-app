/**
 * Rutas de Informes Ejecutivos (Club Platform Insights).
 *
 * El endpoint público del enlace compartido va ANTES de authMiddleware.
 * El resto exige superadmin (role 'administrator').
 */
import express from 'express';
import { authMiddleware, roleMiddleware } from '../middleware/auth.js';
import ctrl from '../controllers/reportsController.js';

const router = express.Router();
const superAdminOnly = roleMiddleware(['administrator']);

// ── Público: informe compartido por token seguro ──
router.get('/shared/:token', ctrl.getSharedReport);

// ── Cron: ejecutar programaciones vencidas (protegido por secreto opcional) ──
router.post('/schedules/run-due', (req, res, next) => {
    const secret = process.env.CRON_SECRET;
    if (secret && req.headers['x-cron-secret'] !== secret) return res.status(403).json({ error: 'Forbidden' });
    next();
}, ctrl.runDueSchedules);

// ── A partir de aquí, solo superadmin ──
router.use(authMiddleware);

router.get('/meta', superAdminOnly, ctrl.getMeta);
router.get('/sites', superAdminOnly, ctrl.getSites);
router.post('/preview', superAdminOnly, ctrl.previewReport);

router.get('/', superAdminOnly, ctrl.listReports);
router.post('/', superAdminOnly, ctrl.createReport);
router.get('/:id', superAdminOnly, ctrl.getReport);
router.patch('/:id/share', superAdminOnly, ctrl.toggleShare);
router.patch('/:id/pdf', superAdminOnly, ctrl.savePdfUrl);
router.post('/:id/email', superAdminOnly, ctrl.emailReport);
router.delete('/:id', superAdminOnly, ctrl.deleteReport);

router.get('/schedules/all', superAdminOnly, ctrl.listSchedules);
router.post('/schedules', superAdminOnly, ctrl.createSchedule);
router.patch('/schedules/:id', superAdminOnly, ctrl.updateSchedule);
router.delete('/schedules/:id', superAdminOnly, ctrl.deleteSchedule);

export default router;
