// ════════════════════════════════════════════════════════════════════════════
// SEO Inteligente — rutas del panel
//
// Todas exigen sesión de plataforma con rol administrativo del sitio. El
// aislamiento por sitio lo resuelve `resolveScope` dentro del controlador, no
// esta capa: acá sólo se comprueba que quien entra puede administrar algo.
// ════════════════════════════════════════════════════════════════════════════

import express from 'express';
import { authMiddleware, requireSiteAdmin } from '../middleware/auth.js';
import c from '../controllers/seoEngineController.js';

const router = express.Router();
router.use(authMiddleware, requireSiteAdmin);

// Tablero e histórico
router.get('/overview', c.getOverview);

// Auditoría y Centro de Recomendaciones
router.post('/audit', c.runAudit);
router.get('/issues', c.getIssues);
router.post('/issues/:id/apply', c.applyIssue);
router.post('/issues/:id/ignore', c.ignoreIssue);

// Páginas
router.get('/pages', c.getPages);
router.get('/pages/preview', c.getPagePreview);
router.put('/pages', c.savePage);
router.post('/pages/generate', c.generatePageMeta);

// Imágenes
router.post('/alt-text', c.generateAltText);

// Palabras clave
router.get('/keywords', c.getKeywords);
router.post('/keywords/suggest', c.suggestKeywords);
router.post('/keywords', c.saveKeyword);
router.delete('/keywords/:id', c.deleteKeyword);

// Configuración global
router.get('/config', c.getConfig);
router.put('/config', c.saveConfig);

export default router;
