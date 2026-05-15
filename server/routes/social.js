/**
 * Social Publishing Engine — Phase 1 routes.
 *
 * The OAuth callback is PUBLIC (Facebook redirects the user's browser here
 * with no Authorization header). Identity is recovered from the signed `state`
 * parameter, which the controller verifies via HMAC.
 *
 * All other endpoints require authentication.
 */

import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import {
    getMetaAuthUrl,
    handleMetaCallback,
    listAccounts,
    verifyAccount,
    disconnectAccount
} from '../controllers/socialPublishingController.js';

const router = express.Router();

// Public — Facebook redirects the user's browser back here.
router.get('/callback/meta', handleMetaCallback);

// Authenticated endpoints.
router.get('/connect/meta', authMiddleware, getMetaAuthUrl);
router.get('/accounts', authMiddleware, listAccounts);
router.post('/accounts/:id/verify', authMiddleware, verifyAccount);
router.delete('/accounts/:id', authMiddleware, disconnectAccount);

export default router;
