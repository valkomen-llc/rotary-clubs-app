import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import {
    createVideoProject,
    getVideoProjects,
    connectSocialAccount,
    getSocialAccounts,
    schedulePost,
    getScheduledPosts,
    handleKieWebhook,
    syncProjectStatus,
    deleteVideoProject,
    getOAuthUrl,
    generatePost,
    downloadProxy
} from '../controllers/contentStudioController.js';
import {
    getOutroOptions,
    preflightOutro,
    summarizeOutroSpeech,
    createOutro,
    listOutros,
    getOutro,
    syncOutro,
    retryOutro,
    duplicateOutro,
    saveOutroToLibrary,
    deleteOutro
} from '../controllers/outroController.js';
import {
    getReelOptions,
    preflightReel,
    createReel,
    listReels,
    getReel,
    syncReel,
    regenerateScene,
    updateScene,
    changeMusic,
    renderReel,
    saveReelToLibrary,
    deleteReel,
    handleRenderWebhook,
    getReelCopies,
    regenerateReelCopy,
    updateReelCopy,
    restoreReelCopy,
    toggleCopyFavorite,
    exportReel,
    getReelNarration,
    regenerateNarration,
    listReelLibrary,
    updateReelInfo,
    duplicateReel,
    getReelUsage,
    cancelReel,
    retryReel,
    getActiveReels
} from '../controllers/reelController.js';
import { generateContainer, listContainers, generatePaymentBlock } from '../controllers/containerStudioController.js';
import {
    getCampaignPostOptions, composeCampaignPost, composeCampaignCarousel,
    startCampaignBackdrop, syncCampaignBackdrop,
} from '../controllers/campaignPostController.js';
import {
    listWaysCampaigns,
    recommendWaysAssets
} from '../controllers/waysToContributeController.js';
import {
    listCreativeProfiles, getCreativeProfile, saveCreativeProfile,
    activateCreativeProfile, deactivateCreativeProfiles,
} from '../controllers/creativeProfileController.js';
import { COPY_PROVIDERS, DEFAULT_COPY_PROVIDER, isProviderAvailable } from '../services/copywritingService.js';

const router = express.Router();

// Download Proxy
router.get('/download', downloadProxy);

// OAuth Redirection (Public for redirect, identity handled via state)
router.get('/oauth/:platform/authorize', getOAuthUrl);


// Webhook (Public for KIE.ai)
router.post('/webhook', handleKieWebhook);

// Webhook del proveedor de montaje del Creador de Reels (v4.663). Ruta propia
// porque el cuerpo lo manda un servicio distinto de KIE y no comparte la forma
// del payload: mezclarlos obligaría a adivinar de quién es cada aviso.
router.post('/reel-webhook', handleRenderWebhook);

// Content Generation
router.post('/generate-post', authMiddleware, generatePost);

// ── Infografías de Campaña (v4.833) ──
// El preset «Maneras de Contribuir» del Generador de Publicaciones. Compone
// una pieza con el motor de Plantillas IA a partir de una campaña de
// contribución; el alcance lo decide el servidor con el clubId del token.
router.get('/campaign-post/options', authMiddleware, getCampaignPostOptions);
router.post('/campaign-post/compose', authMiddleware, composeCampaignPost);
// v4.836 — varias piezas de una vez. El copy se genera UNA sola vez y se
// reparte: cinco llamadas darían cinco voces para la misma campaña.
router.post('/campaign-post/carousel', authMiddleware, composeCampaignCarousel);
// v4.840 — el LIENZO generado con KIE. Es el mismo motor y el mismo cliente que
// «Desde una foto» (`google/nano-banana-edit` vía `createKieImageTask`); lo que
// genera es el fondo, no el texto ni las cifras, que los sigue componiendo la
// plataforma. Asíncrono: se crea la tarea y el navegador sondea.
router.post('/campaign-post/backdrop', authMiddleware, startCampaignBackdrop);
router.get('/campaign-post/backdrop/:taskId', authMiddleware, syncCampaignBackdrop);

// ── «Maneras de Contribuir» en el Generador de Publicaciones (v4.967) ──
// El DÉCIMO tipo de publicación, no un módulo aparte: la generación sigue
// corriendo por `POST /generate-post`, con la campaña y el contexto adicional
// dentro de `config`. Estos dos endpoints sólo alimentan la pantalla.
// El alcance lo decide el servidor con el clubId del token (`campaignScope.js`).
router.get('/ways/campaigns', authMiddleware, listWaysCampaigns);
router.post('/ways/recommend', authMiddleware, recommendWaysAssets);

// ── Director Creativo IA (v4.838) ──
// Las piezas de referencia y el Design DNA que sale de ellas. El alcance lo
// decide el servidor con el clubId del token: un sitio ve los suyos y los de la
// plataforma, y sólo puede editar los suyos.
router.get('/creative-profiles', authMiddleware, listCreativeProfiles);
router.get('/creative-profiles/:id', authMiddleware, getCreativeProfile);
router.post('/creative-profiles', authMiddleware, saveCreativeProfile);
router.post('/creative-profiles/:id/activate', authMiddleware, activateCreativeProfile);
router.post('/creative-profiles/deactivate', authMiddleware, deactivateCreativeProfiles);

// Generación de textos de contenedores de la portada desde el Cerebro (RAG).
router.post('/generate-container', authMiddleware, generateContainer);
router.get('/containers', authMiddleware, listContainers);

// Generación de un bloque de pago (Aportes) desde una instrucción + Cerebro (Fase 3).
router.post('/generate-payment-block', authMiddleware, generatePaymentBlock);

// GET /api/content-studio/copy-providers — lista de motores de copy disponibles
// para el selector del frontend. Devuelve solo los configurados con API key.
router.get('/copy-providers', authMiddleware, (req, res) => {
    const providers = Object.values(COPY_PROVIDERS).map(p => ({
        id: p.id,
        label: p.label,
        defaultModel: p.defaultModel,
        vision: p.vision,
        available: isProviderAvailable(p.id),
        isDefault: p.id === DEFAULT_COPY_PROVIDER
    }));
    res.json({ providers, default: DEFAULT_COPY_PROVIDER });
});

// Projects (Creador de Video anterior — se conserva por los proyectos ya
// guardados y por ScheduledPost, que apunta a VideoProject. El módulo nuevo es
// /reels; ver la sección "Creador de Reels IA" en CLAUDE.md).
router.post('/projects', authMiddleware, createVideoProject);
router.get('/projects', authMiddleware, getVideoProjects);
router.get('/projects/:id/sync', authMiddleware, syncProjectStatus);
router.delete('/projects/:id', authMiddleware, deleteVideoProject);

// ── Creador de Reels IA (v4.663) ──
// Tres fotos → tres escenas image-to-video → montaje con música.
// El orden importa: las rutas fijas van antes que /reels/:id para que
// "options" no se lea como un id.
router.get('/reels/options', authMiddleware, getReelOptions);
router.get('/reels/library', authMiddleware, listReelLibrary);
// Reels en curso: lo consume el aviso de recuperación del creador.
router.get('/reels/active', authMiddleware, getActiveReels);
router.post('/reels/preflight', authMiddleware, preflightReel);
router.post('/reels', authMiddleware, createReel);
router.get('/reels', authMiddleware, listReels);
router.get('/reels/:id', authMiddleware, getReel);
router.get('/reels/:id/sync', authMiddleware, syncReel);
router.post('/reels/:id/render', authMiddleware, renderReel);
router.post('/reels/:id/music', authMiddleware, changeMusic);
router.post('/reels/:id/library', authMiddleware, saveReelToLibrary);
router.patch('/reels/:id', authMiddleware, updateReelInfo);
router.post('/reels/:id/duplicate', authMiddleware, duplicateReel);
// Auditoría del consumo por proveedor (v4.669).
router.get('/reels/:id/usage', authMiddleware, getReelUsage);
router.post('/reels/:id/cancel', authMiddleware, cancelReel);
router.post('/reels/:id/retry', authMiddleware, retryReel);

// Copies de publicación (v4.666). El orden importa: las rutas fijas van antes
// que las paramétricas de escena para que no se confundan.
router.get('/reels/:id/copies', authMiddleware, getReelCopies);
router.post('/reels/:id/copies/regenerate', authMiddleware, regenerateReelCopy);
router.patch('/reels/:id/copies', authMiddleware, updateReelCopy);
router.post('/reels/:id/copies/restore', authMiddleware, restoreReelCopy);
router.post('/reels/:id/copies/favorite', authMiddleware, toggleCopyFavorite);
router.get('/reels/:id/export', authMiddleware, exportReel);

// Narración IA (v4.667). Regenerar la voz NO vuelve a renderizar el video:
// sólo rehace la mezcla, que es lo que permite probar voces sin gastar
// créditos de video.
router.get('/reels/:id/narration', authMiddleware, getReelNarration);
router.post('/reels/:id/narration', authMiddleware, regenerateNarration);
router.post('/reels/:id/scenes/:sceneId/regenerate', authMiddleware, regenerateScene);
router.patch('/reels/:id/scenes/:sceneId', authMiddleware, updateScene);
router.delete('/reels/:id', authMiddleware, deleteReel);

// ── Generador de Outros IA (v4.645) ──
// Cierres de ~5s desde una imagen fija. El orden importa: las rutas fijas van
// antes que /outros/:id para que "options" no se lea como un id.
router.get('/outros/options', authMiddleware, getOutroOptions);
router.post('/outros/preflight', authMiddleware, preflightOutro);
router.post('/outros/speech/summary', authMiddleware, summarizeOutroSpeech);
router.post('/outros', authMiddleware, createOutro);
router.get('/outros', authMiddleware, listOutros);
router.get('/outros/:id', authMiddleware, getOutro);
router.get('/outros/:id/sync', authMiddleware, syncOutro);
router.post('/outros/:id/retry', authMiddleware, retryOutro);
router.post('/outros/:id/duplicate', authMiddleware, duplicateOutro);
router.post('/outros/:id/library', authMiddleware, saveOutroToLibrary);
router.delete('/outros/:id', authMiddleware, deleteOutro);

// Social Accounts
router.post('/accounts', authMiddleware, connectSocialAccount);
router.get('/accounts', authMiddleware, getSocialAccounts);

// Scheduling
router.post('/posts', authMiddleware, schedulePost);
router.get('/posts', authMiddleware, getScheduledPosts);

export default router;
