// ════════════════════════════════════════════════════════════════════════════
// Rutas del Editor de Video Profesional — v4.1141.0
//
// Módulo integrado en Estudio de Contenido con aislamiento multi-tenant y
// control centralizado de capacidades.
// ════════════════════════════════════════════════════════════════════════════

import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { requireStudioTool } from '../lib/contentStudioFeatures.js';
import {
    listProjects,
    getProject,
    createProject,
    updateProject,
    deleteProject,
    duplicateProject,
    transcribeProjectAudio,
    translateProjectSubtitles,
    startRender,
    getRenderStatus
} from '../controllers/videoEditorController.js';

const router = express.Router();

// Todas las rutas requieren sesión autenticada y verificación de la herramienta 'editor'
router.use(authMiddleware);
router.use(requireStudioTool('editor'));

// ── Rutas generales de colección ──────────────────────────────────────────
router.get('/projects', listProjects);
router.post('/projects', createProject);

// ── Rutas específicas de acciones (literales antes de paramétricas puras) ──
router.get('/projects/:id/render-status', getRenderStatus);
router.post('/projects/:id/duplicate', duplicateProject);
router.post('/projects/:id/transcribe', transcribeProjectAudio);
router.post('/projects/:id/translate-subtitles', translateProjectSubtitles);
router.post('/projects/:id/render', startRender);

// ── CRUD de proyecto por ID ───────────────────────────────────────────────
router.get('/projects/:id', getProject);
router.put('/projects/:id', updateProject);
router.delete('/projects/:id', deleteProject);

export default router;
