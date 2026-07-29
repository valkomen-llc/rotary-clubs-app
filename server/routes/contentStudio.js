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
import { generateContainer, listContainers, generatePaymentBlock } from '../controllers/containerStudioController.js';
import { COPY_PROVIDERS, DEFAULT_COPY_PROVIDER, isProviderAvailable } from '../services/copywritingService.js';

const router = express.Router();

// Download Proxy
router.get('/download', downloadProxy);

// OAuth Redirection (Public for redirect, identity handled via state)
router.get('/oauth/:platform/authorize', getOAuthUrl);


// Webhook (Public for KIE.ai)
router.post('/webhook', handleKieWebhook);

// Content Generation
router.post('/generate-post', authMiddleware, generatePost);

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

// Projects
router.post('/projects', authMiddleware, createVideoProject);
router.get('/projects', authMiddleware, getVideoProjects);
router.get('/projects/:id/sync', authMiddleware, syncProjectStatus);
router.delete('/projects/:id', authMiddleware, deleteVideoProject);

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
