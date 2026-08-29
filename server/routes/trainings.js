// ════════════════════════════════════════════════════════════════════════════
// Canal de Capacitaciones — LAS RUTAS (v4.954)
//
// /api/trainings/public/*  → sin sesión obligatoria: el espectador viaja en
//                            cabeceras (`x-viewer-tokens`, `x-anon-id`) y el
//                            veredicto de acceso lo decide el controlador.
// /api/trainings/admin/*   → sesión de plataforma + rol administrativo del
//                            sitio, como el resto de la Biblioteca Multimedia.
//
// Las literales van ANTES que sus paramétricas del mismo largo (regla de
// `check:routes`, v4.859) — acá no hay ninguna pareja en conflicto, pero el
// orden se conserva agrupado igual para que la siguiente ruta nazca bien.
// ════════════════════════════════════════════════════════════════════════════
import express from 'express';
import { authMiddleware, requireSiteAdmin } from '../middleware/auth.js';
import {
    getPublicChannel, getPublicVideo, watchVideo, reportProgress, trackEvent,
    toggleLike, listComments, postComment, signupFromLock,
    getAdminChannel, createChannel, patchChannel, createVideoFicha,
    patchVideoFicha, reorderVideos, adminComments, moderateComment, adminMetrics,
    extractVideoFrame,
} from '../controllers/trainingChannelController.js';

const router = express.Router();

// ── Público ──────────────────────────────────────────────────────────────────
router.get('/public/channel', getPublicChannel);
router.get('/public/video', getPublicVideo);
router.post('/public/watch', watchVideo);
router.post('/public/progress', reportProgress);
router.post('/public/track', trackEvent);
router.post('/public/like', toggleLike);
router.get('/public/comments', listComments);
router.post('/public/comments', postComment);
router.post('/public/signup', signupFromLock);

// ── Administración (Biblioteca Multimedia) ───────────────────────────────────
router.get('/admin/channel', authMiddleware, requireSiteAdmin, getAdminChannel);
router.post('/admin/channel', authMiddleware, requireSiteAdmin, createChannel);
router.patch('/admin/channel/:id', authMiddleware, requireSiteAdmin, patchChannel);
router.post('/admin/channel/:id/videos', authMiddleware, requireSiteAdmin, createVideoFicha);
router.post('/admin/channel/:id/reorder', authMiddleware, requireSiteAdmin, reorderVideos);
router.get('/admin/channel/:id/metrics', authMiddleware, requireSiteAdmin, adminMetrics);
router.patch('/admin/videos/:id', authMiddleware, requireSiteAdmin, patchVideoFicha);
router.post('/admin/videos/:id/frame', authMiddleware, requireSiteAdmin, extractVideoFrame);
router.get('/admin/videos/:id/comments', authMiddleware, requireSiteAdmin, adminComments);
router.patch('/admin/comments/:id', authMiddleware, requireSiteAdmin, moderateComment);

export default router;
