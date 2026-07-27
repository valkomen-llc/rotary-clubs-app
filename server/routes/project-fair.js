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
    getAdminConfig,
    saveAdminConfig,
    listSubmissions,
    exportSubmissionsCsv,
    listTrmProviders,
} from '../controllers/projectFairController.js';

const router = express.Router();

// ── Público ──────────────────────────────────────────────────────────
router.get('/config', getPublicConfig);
router.get('/trm', getTrm);
router.post('/submissions', express.json({ limit: '1mb' }), createSubmission);
router.post('/submissions/:id/checkout', express.json(), createCheckout);
router.get('/submissions/:id', getSubmissionStatus);

// ── Admin ────────────────────────────────────────────────────────────
router.get('/admin/config', authMiddleware, getAdminConfig);
router.put('/admin/config', authMiddleware, express.json({ limit: '1mb' }), saveAdminConfig);
router.get('/admin/submissions', authMiddleware, listSubmissions);
router.get('/admin/submissions.csv', authMiddleware, exportSubmissionsCsv);
router.get('/admin/trm-providers', authMiddleware, listTrmProviders);

export default router;
