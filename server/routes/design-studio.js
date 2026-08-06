// ════════════════════════════════════════════════════════════════════
// Plantillas IA — rutas
// v4.720.0
//
// Todo el módulo va detrás de `authMiddleware`: es una herramienta del panel,
// no una página pública como el Generador de Pendones. El aislamiento por sitio
// lo resuelve el controlador con `scopeClubId`, y va en el WHERE de cada
// consulta.
// ════════════════════════════════════════════════════════════════════
import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import {
    getCatalog, findClubs, getBranding, putFoundation, compose, improve,
    listProjects, saveProject, updateProject, deleteProject,
    listPublications, publish, setPublished, deletePublication, previewPublication,
    startBackdrop, syncBackdrop,
} from '../controllers/designStudioController.js';

const router = express.Router();

router.get('/catalog', authMiddleware, getCatalog);

router.get('/clubs', authMiddleware, findClubs);
router.get('/clubs/:id/branding', authMiddleware, getBranding);
router.put('/clubs/:id/foundation', authMiddleware, putFoundation);

router.post('/compose', authMiddleware, compose);

// Composición con IA: crear las tareas y sondearlas. Asíncrono porque una
// composición tarda 20-60 s y la función corta a los 120.
router.post('/backdrop', authMiddleware, startBackdrop);
router.get('/backdrop/:taskId', authMiddleware, syncBackdrop);
router.post('/improve', authMiddleware, improve);

// Publicar es lo que expone un diseño a Internet sin sesión, así que va detrás
// de la misma autenticación que el resto del módulo y con el aislamiento por
// sitio en el WHERE de cada consulta.
router.get('/publications', authMiddleware, listPublications);
router.post('/publications', authMiddleware, publish);
router.post('/publications/preview', authMiddleware, previewPublication);
router.put('/publications/:id', authMiddleware, setPublished);
router.delete('/publications/:id', authMiddleware, deletePublication);

router.get('/projects', authMiddleware, listProjects);
router.post('/projects', authMiddleware, saveProject);
router.put('/projects/:id', authMiddleware, updateProject);
router.delete('/projects/:id', authMiddleware, deleteProject);

export default router;
