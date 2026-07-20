/**
 * Hub Social — rutas del Social Publishing Engine + Fundación (webhooks,
 * insights, bandeja, auditoría).
 *
 * El callback de OAuth y el webhook de Meta son PÚBLICOS (Facebook/Instagram
 * redirigen o postean sin Authorization header). La identidad del callback se
 * recupera del `state` firmado por HMAC; el webhook se valida por firma
 * X-Hub-Signature-256 (ver socialWebhookController).
 *
 * NOTA: el POST del webhook (`/webhooks/meta`) se monta con express.raw en
 * api/index.js (y server/server.js) ANTES del parser JSON, para poder validar
 * la firma sobre el cuerpo crudo. Acá solo va el GET de verificación.
 *
 * Todas las demás rutas requieren autenticación.
 */

import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import {
    getMetaAuthUrl,
    handleMetaCallback,
    getInstagramAuthUrl,
    handleInstagramCallback,
    listAccounts,
    verifyAccount,
    disconnectAccount,
    publishPost,
    listPublications,
    deletePublication
} from '../controllers/socialPublishingController.js';
import {
    verifyMetaWebhook,
    listWebhookEvents
} from '../controllers/socialWebhookController.js';
import {
    getInsightsOverview,
    getAccountInsightsSeries,
    refreshInsights
} from '../controllers/socialInsightsController.js';
import {
    listComments,
    replyComment,
    hideComment,
    updateComment,
    listConversations,
    listMessages,
    replyConversation,
    updateConversation
} from '../controllers/socialInboxController.js';
import { listAudit } from '../lib/socialAudit.js';

const router = express.Router();

// ── Público — OAuth callbacks y verificación de webhook ───────────────────────
router.get('/callback/meta', handleMetaCallback);
router.get('/callback/instagram', handleInstagramCallback);
router.get('/webhooks/meta', verifyMetaWebhook); // handshake GET (hub.challenge)

// ── Conexión de cuentas ───────────────────────────────────────────────────────
router.get('/connect/meta', authMiddleware, getMetaAuthUrl);
router.get('/connect/instagram', authMiddleware, getInstagramAuthUrl);
router.get('/accounts', authMiddleware, listAccounts);
router.post('/accounts/:id/verify', authMiddleware, verifyAccount);
router.delete('/accounts/:id', authMiddleware, disconnectAccount);

// ── Publicación (inmediata / programada) + biblioteca ─────────────────────────
router.post('/publish', authMiddleware, publishPost);
router.get('/publications', authMiddleware, listPublications);
router.delete('/publications/:id', authMiddleware, deletePublication);

// ── Insights / métricas ───────────────────────────────────────────────────────
router.get('/insights/overview', authMiddleware, getInsightsOverview);
router.get('/insights/accounts/:id', authMiddleware, getAccountInsightsSeries);
router.post('/insights/refresh', authMiddleware, refreshInsights);

// ── Bandeja: comentarios ──────────────────────────────────────────────────────
router.get('/inbox/comments', authMiddleware, listComments);
router.post('/inbox/comments/:id/reply', authMiddleware, replyComment);
router.post('/inbox/comments/:id/hide', authMiddleware, hideComment);
router.patch('/inbox/comments/:id', authMiddleware, updateComment);

// ── Bandeja: conversaciones / mensajes ────────────────────────────────────────
router.get('/inbox/conversations', authMiddleware, listConversations);
router.get('/inbox/conversations/:id/messages', authMiddleware, listMessages);
router.post('/inbox/conversations/:id/reply', authMiddleware, replyConversation);
router.patch('/inbox/conversations/:id', authMiddleware, updateConversation);

// ── Diagnóstico: webhooks recibidos + auditoría ───────────────────────────────
router.get('/webhooks/events', authMiddleware, listWebhookEvents);
router.get('/audit', authMiddleware, async (req, res) => {
    try {
        const isAdmin = req.user.role === 'administrator';
        const clubId = isAdmin ? (req.query.clubId || null) : req.user.clubId;
        if (!isAdmin && !clubId) return res.json([]);
        const entries = await listAudit({ clubId, action: req.query.action || null, limit: parseInt(req.query.limit || '100', 10) });
        res.json(entries);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

export default router;
