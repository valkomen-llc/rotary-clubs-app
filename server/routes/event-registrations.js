// Rutas del registro de asistentes a eventos (v4.606.0).
// Los endpoints públicos alimentan el formulario de /eventos/:evento/registro;
// los /admin/* exigen token y sólo dejan ver los eventos del propio sitio.
import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import registrations from '../controllers/eventRegistrationController.js';

const router = express.Router();

// ── Público ──────────────────────────────────────────────────────────
router.get('/config/:clubId/:eventRef', registrations.getPublicRegistrationConfig);
router.post('/', express.json({ limit: '256kb' }), registrations.createRegistration);
router.post('/:id/checkout', express.json(), registrations.createCheckout);
router.get('/:id', registrations.getRegistration);

// ── Administración ───────────────────────────────────────────────────
router.get('/admin/list', authMiddleware, registrations.listRegistrations);
router.get('/admin/export.csv', authMiddleware, registrations.exportRegistrationsCsv);

export default router;
