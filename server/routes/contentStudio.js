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
    cancelPost,
    retryPost,
    deletePost,
    disconnectAccount,
    suggestCaption,
    getDiagnostic,
    probeModels
} from '../controllers/contentStudioController.js';

const router = express.Router();

// OAuth Redirection (Public for redirect, identity handled via state)
router.get('/oauth/:platform/authorize', getOAuthUrl);


// Webhook (Public for KIE.ai)
router.post('/webhook', handleKieWebhook);

// Projects
router.post('/projects', authMiddleware, createVideoProject);
router.get('/projects', authMiddleware, getVideoProjects);
router.get('/projects/:id/sync', authMiddleware, syncProjectStatus);
router.delete('/projects/:id', authMiddleware, deleteVideoProject);

// Social Accounts
router.post('/accounts', authMiddleware, connectSocialAccount);
router.get('/accounts', authMiddleware, getSocialAccounts);
router.delete('/accounts/:id', authMiddleware, disconnectAccount);

// Scheduling
router.post('/posts', authMiddleware, schedulePost);
router.get('/posts', authMiddleware, getScheduledPosts);
router.post('/posts/:id/cancel', authMiddleware, cancelPost);
router.post('/posts/:id/retry', authMiddleware, retryPost);
router.delete('/posts/:id', authMiddleware, deletePost);

// AI Caption
router.post('/captions/suggest', authMiddleware, suggestCaption);

// Diagnóstico (admin)
router.get('/diagnostic', authMiddleware, getDiagnostic);
router.post('/probe-models', authMiddleware, probeModels);

export default router;
