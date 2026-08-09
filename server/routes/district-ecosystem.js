// Rutas del ecosistema del distrito — v4.747
//
// Todas exigen sesión de plataforma; el ALCANCE (qué sitios se ven) lo decide
// `resolveScope` dentro del controlador, no esta capa. Poner el filtro acá
// dejaría fuera a cualquier ruta que se agregue después.

import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import {
    listSites, listEvents, cloneEvents, refreshClone,
    listProjects, cloneProjects, refreshProjectClone,
} from '../controllers/districtEcosystemController.js';

const router = express.Router();

router.get('/sites', authMiddleware, listSites);

router.get('/events', authMiddleware, listEvents);
router.post('/clone', authMiddleware, cloneEvents);
router.post('/refresh/:cloneId', authMiddleware, refreshClone);

// v4.749 — Proyectos. Rutas propias y no un parámetro `kind`: lo que se copia
// y lo que NO se copia es distinto en cada uno —la inscripción en un evento,
// los aportes en un proyecto— y meterlo en una sola ruta con un `if` dentro
// haría fácil que un cambio para uno se cuele en el otro.
router.get('/projects', authMiddleware, listProjects);
router.post('/clone-projects', authMiddleware, cloneProjects);
router.post('/refresh-project/:cloneId', authMiddleware, refreshProjectClone);

export default router;
