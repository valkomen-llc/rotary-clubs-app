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
import { generateContainer, listContainers } from '../controllers/containerStudioController.js';
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

// Social Accounts
router.post('/accounts', authMiddleware, connectSocialAccount);
router.get('/accounts', authMiddleware, getSocialAccounts);

// Scheduling
router.post('/posts', authMiddleware, schedulePost);
router.get('/posts', authMiddleware, getScheduledPosts);

export default router;
