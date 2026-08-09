// Rutas del ecosistema del distrito — v4.747
//
// Todas exigen sesión de plataforma; el ALCANCE (qué sitios se ven) lo decide
// `resolveScope` dentro del controlador, no esta capa. Poner el filtro acá
// dejaría fuera a cualquier ruta que se agregue después.

import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import {
    listSites, listEvents, cloneEvents, refreshClone,
} from '../controllers/districtEcosystemController.js';

const router = express.Router();

router.get('/sites', authMiddleware, listSites);
router.get('/events', authMiddleware, listEvents);
router.post('/clone', authMiddleware, cloneEvents);
router.post('/refresh/:cloneId', authMiddleware, refreshClone);

export default router;
