/**
 * Hub Social — controller de Bandeja unificada (Comentarios + Mensajes).
 *
 * Comentarios:
 *   GET   /api/social/inbox/comments             → listar (filtros: status, accountId)
 *   POST  /api/social/inbox/comments/:id/reply    → responder (Graph API)
 *   POST  /api/social/inbox/comments/:id/hide      → ocultar / mostrar
 *   PATCH /api/social/inbox/comments/:id           → cambiar estado / asignar
 *
 * Mensajes (DM Instagram / Messenger):
 *   GET   /api/social/inbox/conversations                 → listar hilos
 *   GET   /api/social/inbox/conversations/:id/messages     → mensajes de un hilo
 *   POST  /api/social/inbox/conversations/:id/reply         → responder (Graph API)
 *   PATCH /api/social/inbox/conversations/:id               → estado / asignación
 *
 * Los datos se pueblan por Webhook (socialWebhookController) o por sync manual.
 * Las respuestas usan el Page Access Token cifrado de la cuenta.
 */

import prisma from '../lib/prisma.js';
import { decryptToken } from '../lib/tokenCrypto.js';
import { auditSocial, clientIp } from '../lib/socialAudit.js';

const GRAPH_BASE = 'https://graph.facebook.com/v18.0';
const isAdmin = (req) => req.user.role === 'administrator';

const scopeWhere = (req, base = {}) => {
    if (isAdmin(req)) return req.query.clubId ? { ...base, clubId: req.query.clubId } : base;
    if (!req.user.clubId) return null;
    return { ...base, clubId: req.user.clubId };
};

const graphPost = async (path, params) => {
    const resp = await fetch(`${GRAPH_BASE}/${path}`, { method: 'POST', body: new URLSearchParams(params) });
    const data = await resp.json();
    if (!resp.ok || data.error) {
        throw new Error(data.error?.message || `HTTP ${resp.status}`);
    }
    return data;
};

// ── COMENTARIOS ───────────────────────────────────────────────────────────────
export const listComments = async (req, res) => {
    try {
        const where = scopeWhere(req);
        if (where === null) return res.json([]);
        if (req.query.status) where.status = req.query.status;
        if (req.query.accountId) where.accountId = req.query.accountId;
        const comments = await prisma.socialComment.findMany({
            where,
            orderBy: { commentedAt: 'desc' },
            take: Math.min(parseInt(req.query.limit || '100', 10), 300),
            include: { account: { select: { id: true, platform: true, accountName: true, avatar: true } } }
        });
        res.json(comments);
    } catch (e) {
        console.error('[social/inbox] listComments error:', e);
        res.status(500).json({ error: e.message });
    }
};

const findCommentForCaller = async (req) => {
    const where = { id: req.params.id };
    if (!isAdmin(req)) {
        if (!req.user.clubId) return null;
        where.clubId = req.user.clubId;
    }
    return prisma.socialComment.findFirst({ where, include: { account: true } });
};

export const replyComment = async (req, res) => {
    try {
        const { message } = req.body || {};
        if (!message || !message.trim()) return res.status(400).json({ error: 'message requerido' });
        const comment = await findCommentForCaller(req);
        if (!comment) return res.status(404).json({ error: 'Comentario no encontrado' });
        if (!comment.account || comment.account.tokenVersion === 0) {
            return res.status(400).json({ error: 'Cuenta sin token válido — reconectar' });
        }
        const token = decryptToken(comment.account.accessToken);
        // IG usa /{comment-id}/replies; FB usa /{comment-id}/comments.
        const path = comment.platform === 'instagram'
            ? `${comment.externalId}/replies`
            : `${comment.externalId}/comments`;
        const data = await graphPost(path, { message, access_token: token });
        await prisma.socialComment.update({
            where: { id: comment.id },
            data: { status: 'replied', repliedAt: new Date() }
        });
        await auditSocial({
            action: 'reply', clubId: comment.clubId, userId: req.user.id,
            accountId: comment.accountId, target: comment.id, ip: clientIp(req),
            detail: { kind: 'comment', externalReplyId: data.id || null }
        });
        res.json({ ok: true, externalId: data.id || null });
    } catch (e) {
        console.error('[social/inbox] replyComment error:', e);
        await auditSocial({ action: 'reply', status: 'error', target: req.params.id, detail: { error: e.message } });
        res.status(500).json({ error: e.message });
    }
};

export const hideComment = async (req, res) => {
    try {
        const hide = req.body?.hide !== false; // default true
        const comment = await findCommentForCaller(req);
        if (!comment) return res.status(404).json({ error: 'Comentario no encontrado' });
        if (!comment.account || comment.account.tokenVersion === 0) {
            return res.status(400).json({ error: 'Cuenta sin token válido — reconectar' });
        }
        const token = decryptToken(comment.account.accessToken);
        // FB: is_hidden ; IG: hide
        const param = comment.platform === 'instagram' ? { hide } : { is_hidden: hide };
        await graphPost(comment.externalId, { ...param, access_token: token });
        await prisma.socialComment.update({
            where: { id: comment.id },
            data: { hiddenOnMeta: hide, status: hide ? 'hidden' : 'open' }
        });
        await auditSocial({
            action: 'hide', clubId: comment.clubId, userId: req.user.id,
            accountId: comment.accountId, target: comment.id, ip: clientIp(req), detail: { hide }
        });
        res.json({ ok: true, hidden: hide });
    } catch (e) {
        console.error('[social/inbox] hideComment error:', e);
        res.status(500).json({ error: e.message });
    }
};

export const updateComment = async (req, res) => {
    try {
        const comment = await findCommentForCaller(req);
        if (!comment) return res.status(404).json({ error: 'Comentario no encontrado' });
        const data = {};
        const { status, sentiment, aiSuggestion } = req.body || {};
        if (status) data.status = status;
        if (sentiment) data.sentiment = sentiment;
        if (aiSuggestion !== undefined) data.aiSuggestion = aiSuggestion;
        const updated = await prisma.socialComment.update({ where: { id: comment.id }, data });
        res.json(updated);
    } catch (e) {
        console.error('[social/inbox] updateComment error:', e);
        res.status(500).json({ error: e.message });
    }
};

// ── CONVERSACIONES / MENSAJES ─────────────────────────────────────────────────
export const listConversations = async (req, res) => {
    try {
        const where = scopeWhere(req);
        if (where === null) return res.json([]);
        if (req.query.status) where.status = req.query.status;
        const conversations = await prisma.socialConversation.findMany({
            where,
            orderBy: { lastMessageAt: 'desc' },
            take: Math.min(parseInt(req.query.limit || '100', 10), 300),
            include: { account: { select: { id: true, platform: true, accountName: true, avatar: true } } }
        });
        res.json(conversations);
    } catch (e) {
        console.error('[social/inbox] listConversations error:', e);
        res.status(500).json({ error: e.message });
    }
};

const findConversationForCaller = async (req) => {
    const where = { id: req.params.id };
    if (!isAdmin(req)) {
        if (!req.user.clubId) return null;
        where.clubId = req.user.clubId;
    }
    return prisma.socialConversation.findFirst({ where, include: { account: true } });
};

export const listMessages = async (req, res) => {
    try {
        const conv = await findConversationForCaller(req);
        if (!conv) return res.status(404).json({ error: 'Conversación no encontrada' });
        const messages = await prisma.socialMessage.findMany({
            where: { conversationId: conv.id },
            orderBy: { sentAt: 'asc' },
            take: 200
        });
        // Marcar como leído al abrir.
        if (conv.unreadCount > 0) {
            await prisma.socialConversation.update({ where: { id: conv.id }, data: { unreadCount: 0 } });
        }
        res.json({ conversation: conv, messages });
    } catch (e) {
        console.error('[social/inbox] listMessages error:', e);
        res.status(500).json({ error: e.message });
    }
};

export const replyConversation = async (req, res) => {
    try {
        const { message } = req.body || {};
        if (!message || !message.trim()) return res.status(400).json({ error: 'message requerido' });
        const conv = await findConversationForCaller(req);
        if (!conv) return res.status(404).json({ error: 'Conversación no encontrada' });
        if (!conv.account || conv.account.tokenVersion === 0) {
            return res.status(400).json({ error: 'Cuenta sin token válido — reconectar' });
        }
        if (!conv.participantId) {
            return res.status(400).json({ error: 'Falta el id del destinatario (participantId)' });
        }
        const token = decryptToken(conv.account.accessToken);
        // Send API: POST /{page-or-ig-id}/messages
        let externalId = null;
        try {
            const data = await graphPost(`${conv.account.platformId}/messages`, {
                recipient: JSON.stringify({ id: conv.participantId }),
                message: JSON.stringify({ text: message }),
                messaging_type: 'RESPONSE',
                access_token: token
            });
            externalId = data.message_id || null;
        } catch (sendErr) {
            // Guardamos el mensaje como fallido pero no perdemos el texto redactado.
            await prisma.socialMessage.create({
                data: { conversationId: conv.id, direction: 'outbound', text: message, status: 'failed', sentAt: new Date() }
            });
            return res.status(502).json({ error: `Meta rechazó el envío: ${sendErr.message}` });
        }
        await prisma.socialMessage.create({
            data: { conversationId: conv.id, externalId, direction: 'outbound', text: message, status: 'sent', sentAt: new Date() }
        });
        await prisma.socialConversation.update({
            where: { id: conv.id },
            data: { lastMessageAt: new Date(), lastSnippet: message.slice(0, 200) }
        });
        await auditSocial({
            action: 'reply', clubId: conv.clubId, userId: req.user.id,
            accountId: conv.accountId, target: conv.id, ip: clientIp(req), detail: { kind: 'message' }
        });
        res.json({ ok: true, externalId });
    } catch (e) {
        console.error('[social/inbox] replyConversation error:', e);
        res.status(500).json({ error: e.message });
    }
};

export const updateConversation = async (req, res) => {
    try {
        const conv = await findConversationForCaller(req);
        if (!conv) return res.status(404).json({ error: 'Conversación no encontrada' });
        const data = {};
        const { status, assignedToId } = req.body || {};
        if (status) data.status = status;
        if (assignedToId !== undefined) data.assignedToId = assignedToId;
        const updated = await prisma.socialConversation.update({ where: { id: conv.id }, data });
        res.json(updated);
    } catch (e) {
        console.error('[social/inbox] updateConversation error:', e);
        res.status(500).json({ error: e.message });
    }
};
