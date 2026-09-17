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
    syncMetaAccounts,
    getMetaDiagnostics,
    getSocialDefaults,
    putSocialDefaults,
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
    getAnalyticsScope,
    getAnalyticsCatalog,
    getAnalyticsOverview,
    getAnalyticsContent,
    getAnalyticsContentDetail,
    getAnalyticsSyncHistory,
    postAnalyticsSync,
    postAnalyticsProbe,
    postAnalyticsVerify
} from '../controllers/socialAnalyticsController.js';
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
import {
    getShareTargets,
    shareContent,
    regenerateShareCopy,
    getShareHistory,
    getShareSummary,
    getShareGroupTargets,
    generateGroupCTA,
    distributeToGroups,
    autoDistributeToGroups,
    updateGroupDistributionStatus,
    syncMetaGroups,
    setDefaultGroupList,
    seedAccountGroups,
    getCustomLists,
    createCustomList,
    updateCustomList,
    deleteCustomList,
    setDefaultCustomList,
    assignGroupsToList,
    quickSaveDistributionList,
    verifyGroupCapabilities,
    validateGroupUrlEndpoint,
    getBatchConfig,
    saveBatchConfig,
} from '../controllers/contentShareController.js';
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
// ⚠️ LITERALES ANTES DE LA PARAMÉTRICA. Express casa por ORDEN: declaradas
// debajo de `/accounts/:id`, estas cuatro caerían en el manejador de una
// cuenta con el id "sync", "defaults" o "diagnostics" — y el fallo sería MUDO
// (`check:routes`).
router.post('/accounts/sync', authMiddleware, syncMetaAccounts);
router.get('/accounts/defaults', authMiddleware, getSocialDefaults);
router.get('/accounts/diagnostics', authMiddleware, getMetaDiagnostics);
router.put('/accounts/defaults', authMiddleware, putSocialDefaults);
router.post('/accounts/:id/verify', authMiddleware, verifyAccount);
router.delete('/accounts/:id', authMiddleware, disconnectAccount);

// ── Publicación (inmediata / programada) + biblioteca ─────────────────────────
router.post('/publish', authMiddleware, publishPost);
router.get('/publications', authMiddleware, listPublications);
router.delete('/publications/:id', authMiddleware, deletePublication);

// ── Difusión de contenido de la plataforma (v4.1013) ─────────────────────────
//
// Compartir un artículo, un evento o un proyecto que YA existe en la
// plataforma. Es otra cosa que `/publish`, que difunde una pieza generada por
// el Estudio de Contenido (imagen + copies por plataforma): acá lo que viaja
// es un ENLACE a una página propia, y la imagen y el titular los resuelve
// Facebook leyendo el Open Graph que el servidor ya compone.
//
// Las cinco son literales y van ANTES de cualquier paramétrica del router
// (`check:routes`): una literal declarada debajo de su paramétrica es
// inalcanzable, y el fallo es MUDO — cae en el manejador equivocado.
router.get('/share/targets', authMiddleware, getShareTargets);
router.get('/share/group-targets', authMiddleware, getShareGroupTargets);
router.get('/share/history', authMiddleware, getShareHistory);
router.get('/share/summary', authMiddleware, getShareSummary);
router.post('/share/group-cta', authMiddleware, generateGroupCTA);

// Gestión y configuración de grupos y listas de distribución
router.post('/share/groups/seed-account-groups', authMiddleware, seedAccountGroups);
router.get('/share/groups/custom-lists', authMiddleware, getCustomLists);
router.post('/share/groups/custom-lists', authMiddleware, createCustomList);
router.post('/share/groups/custom-lists/:id/default', authMiddleware, setDefaultCustomList);
router.put('/share/groups/custom-lists/:id', authMiddleware, updateCustomList);
router.delete('/share/groups/custom-lists/:id', authMiddleware, deleteCustomList);
router.post('/share/groups/assign-list', authMiddleware, assignGroupsToList);
router.post('/share/groups/quick-save-list', authMiddleware, quickSaveDistributionList);
router.post('/share/groups/verify-capabilities', authMiddleware, verifyGroupCapabilities);
router.post('/share/groups/validate-url', authMiddleware, validateGroupUrlEndpoint);
router.get('/share/groups/batch-config', authMiddleware, getBatchConfig);
router.post('/share/groups/batch-config', authMiddleware, saveBatchConfig);
router.post('/share/groups/sync-meta', authMiddleware, syncMetaGroups);
router.post('/share/groups/default-list', authMiddleware, setDefaultGroupList);
router.post('/share/groups/auto-distribute', authMiddleware, autoDistributeToGroups);
router.post('/share/distribute-to-groups', authMiddleware, distributeToGroups);
router.post('/share/group-status', authMiddleware, updateGroupDistributionStatus);
// `/share/copy` regenera SÓLO el texto de la publicación (la varita del
// modal): no toca el video, no relanza escenas y no gasta un crédito de
// image-to-video. Va ANTES de `/share` porque una literal debajo de su
// paramétrica es inalcanzable (`check:routes`).
router.post('/share/copy', authMiddleware, regenerateShareCopy);
router.post('/share', authMiddleware, shareContent);

// ── Insights / métricas ───────────────────────────────────────────────────────
router.get('/insights/overview', authMiddleware, getInsightsOverview);
router.get('/insights/accounts/:id', authMiddleware, getAccountInsightsSeries);
router.post('/insights/refresh', authMiddleware, refreshInsights);

// -- Social Analytics (v4.1053) ----------------------------------------------
//
// Historico propio de metricas de Meta. Es OTRA cosa que `/insights`, que
// consulta en vivo y guarda una foto sin fecha de metrica: aca lo que se lee
// es la serie diaria ya sincronizada, asi que un dashboard no depende de que
// Meta conteste ni de que el token siga vivo.
//
// TODAS pasan por `accountsInScope` en el controller: el aislamiento va en el
// WHERE, nunca en la pantalla. Una cuenta ajena responde 404.
//
// Literales ANTES de la paramétrica (`check:routes`): `/analytics/content`
// declarada debajo de `/analytics/content/:id` seria inalcanzable, y el
// fallo es MUDO -- cae en el manejador equivocado con el nombre como id.
router.get('/analytics/scope', authMiddleware, getAnalyticsScope);
router.get('/analytics/catalog', authMiddleware, getAnalyticsCatalog);
router.get('/analytics/overview', authMiddleware, getAnalyticsOverview);
router.get('/analytics/content', authMiddleware, getAnalyticsContent);
router.get('/analytics/content/:id', authMiddleware, getAnalyticsContentDetail);
router.get('/analytics/sync/:accountId', authMiddleware, getAnalyticsSyncHistory);
router.post('/analytics/sync', authMiddleware, postAnalyticsSync);
router.post('/analytics/probe/:accountId', authMiddleware, postAnalyticsProbe);
router.post('/analytics/verify/:accountId', authMiddleware, postAnalyticsVerify);

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
