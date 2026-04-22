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
    getOAuthUrl
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

// Social Accounts
router.post('/accounts', authMiddleware, connectSocialAccount);
router.get('/accounts', authMiddleware, getSocialAccounts);

// Scheduling
router.post('/posts', authMiddleware, schedulePost);
router.get('/posts', authMiddleware, getScheduledPosts);

export default router;
