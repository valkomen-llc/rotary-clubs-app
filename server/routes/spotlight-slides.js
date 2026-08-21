// Rutas del Slider Global / Llamados a la Acción.
//
// La gestión es del OPERADOR de la plataforma (mismo criterio que
// /api/admin/districts y que las Campañas de Contribución): un slide alcanza
// a muchos sitios a la vez, así que no es una pantalla de club. La lectura
// pública es de sólo lectura y sin sesión — corre en la portada de todos los
// sitios.
//
// ⚠️ ORDEN: `/order` es LITERAL y va ANTES de `/:id`. Express casa por orden
// de declaración, así que una literal debajo de su paramétrica es
// INALCANZABLE y el fallo es mudo: la petición cae en el manejador de la
// paramétrica con el nombre de la ruta como parámetro (v4.859). Lo comprueba
// `npm run check:routes`, que rompe el despliegue.

import express from 'express';
import { authMiddleware, roleMiddleware } from '../middleware/auth.js';
import {
    getActiveSlides, listSlides, getSlide, createSlide, updateSlide,
    duplicateSlide, reorderSlides, deleteSlide, slideReach,
    listImportable, importLocalBlock,
} from '../controllers/spotlightSlideController.js';

const router = express.Router();
const superAdminOnly = roleMiddleware(['administrator']);

// Pública — sin sesión, degrada a lista vacía ante cualquier fallo.
router.get('/active', getActiveSlides);

// Gestión — operador de la plataforma. Las LITERALES van antes que `/:id`.
router.put('/order', authMiddleware, superAdminOnly, reorderSlides);
// Traer el Bloque Destacado que un sitio ya tiene configurado.
router.get('/importable', authMiddleware, superAdminOnly, listImportable);
router.post('/import', authMiddleware, superAdminOnly, importLocalBlock);
router.get('/', authMiddleware, superAdminOnly, listSlides);
router.post('/', authMiddleware, superAdminOnly, createSlide);
router.get('/:id/reach', authMiddleware, superAdminOnly, slideReach);
router.post('/:id/duplicate', authMiddleware, superAdminOnly, duplicateSlide);
router.get('/:id', authMiddleware, superAdminOnly, getSlide);
router.put('/:id', authMiddleware, superAdminOnly, updateSlide);
router.delete('/:id', authMiddleware, superAdminOnly, deleteSlide);

export default router;
