import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { getAdminTemplate, saveTemplate } from '../controllers/bannerTemplateController.js';
import { requireStudioTool } from '../lib/contentStudioFeatures.js';

const router = express.Router();

// Lectura/escritura de la plantilla de pendón por defecto (solo admin).
// La imagen de fondo se sube reutilizando /api/media (presigned-url / upload),
// y aquí guardamos la URL resultante junto al resto de la config.
router.get('/template', authMiddleware, requireStudioTool('pendones'), getAdminTemplate);
router.put('/template', authMiddleware, requireStudioTool('pendones'), saveTemplate);

export default router;
