/**
 * Hub Social — controller de Webhooks de Meta.
 *
 *   GET  /api/social/webhooks/meta   → handshake de verificación (hub.challenge)
 *   POST /api/social/webhooks/meta   → recepción de eventos (firma verificada)
 *
 * El POST se monta con express.raw en api/index.js para poder validar la firma
 * X-Hub-Signature-256 sobre el cuerpo crudo. Persistimos cada evento en
 * `SocialWebhookEvent` (cola) y hacemos un procesamiento liviano inline
 * (crear/actualizar comentarios y mensajes) antes de responder 200. Lo pesado
 * o reintentable queda como fila `received` para el cron/worker.
 */

import prisma from '../lib/prisma.js';
import { auditSocial } from '../lib/socialAudit.js';
import {
    verifyWebhookChallenge,
    verifySignature,
    normalizeWebhookPayload
} from '../services/metaWebhookService.js';

// GET — verificación de suscripción.
export const verifyMetaWebhook = (req, res) => {
    const { ok, challenge } = verifyWebhookChallenge(req.query || {});
    if (ok) {
        console.log('[social/webhook] verificación OK');
        return res.status(200).send(challenge);
    }
    console.warn('[social/webhook] verificación FALLÓ (verify_token no coincide)');
    return res.status(403).send('Forbidden');
};

// Resuelve la SocialAccount (y su club) a partir del id de la entrada (page/ig id).
const resolveAccount = async (entryId) => {
    if (!entryId) return null;
    try {
        return await prisma.socialAccount.findFirst({
            where: { OR: [{ platformId: entryId }, { pageId: entryId }] }
        });
    } catch {
        return null;
    }
};

// Procesa un evento normalizado. Best-effort: los errores se guardan en la fila.
const processEvent = async ({ evt, account }) => {
    const clubId = account?.clubId || null;
    const platform = evt.object === 'instagram' ? 'instagram' : 'facebook';

    // ── Comentarios ──────────────────────────────────────────────────────────
    if (evt.field === 'comments' || evt.field === 'feed') {
        const v = evt.value || {};
        // En "feed", solo nos interesan los items de tipo comment.
        if (evt.field === 'feed' && v.item !== 'comment') return { handled: false };
        const externalId = v.comment_id || v.id;
        if (!externalId || !account) return { handled: false };
        await prisma.socialComment.upsert({
            where: { accountId_externalId: { accountId: account.id, externalId } },
            update: {
                text: v.message ?? v.text ?? undefined,
                authorName: v.from?.name ?? v.username ?? undefined,
                authorId: v.from?.id ?? undefined,
                parentId: v.parent_id ?? undefined,
                mediaExternalId: v.post_id ?? v.media?.id ?? undefined,
                hiddenOnMeta: v.verb === 'hide' ? true : undefined,
                status: v.verb === 'remove' ? 'resolved' : undefined
            },
            create: {
                clubId,
                accountId: account.id,
                platform,
                externalId,
                parentId: v.parent_id ?? null,
                mediaExternalId: v.post_id ?? v.media?.id ?? null,
                authorId: v.from?.id ?? null,
                authorName: v.from?.name ?? v.username ?? null,
                text: v.message ?? v.text ?? null,
                status: 'open',
                commentedAt: v.created_time ? new Date(v.created_time * 1000) : new Date()
            }
        });
        return { handled: true, kind: 'comment' };
    }

    // ── Mensajes (Messenger / IG Direct) ──────────────────────────────────────
    if (evt.field === 'messages') {
        const v = evt.value || {};
        if (!account) return { handled: false };
        const senderId = v.sender?.id || v.from?.id || null;
        const threadExternalId = v.thread_id || senderId || `${account.id}-${senderId}`;
        const text = v.message?.text || v.text || null;
        const conv = await prisma.socialConversation.upsert({
            where: { accountId_externalId: { accountId: account.id, externalId: String(threadExternalId) } },
            update: {
                lastMessageAt: new Date(),
                lastSnippet: text ? text.slice(0, 200) : undefined,
                unreadCount: { increment: 1 }
            },
            create: {
                clubId,
                accountId: account.id,
                platform,
                externalId: String(threadExternalId),
                participantId: senderId,
                lastMessageAt: new Date(),
                lastSnippet: text ? text.slice(0, 200) : null,
                unreadCount: 1,
                status: 'open'
            }
        });
        await prisma.socialMessage.create({
            data: {
                conversationId: conv.id,
                externalId: v.message?.mid || null,
                direction: 'inbound',
                senderId,
                text,
                attachments: v.message?.attachments || undefined,
                sentAt: v.timestamp ? new Date(Number(v.timestamp)) : new Date()
            }
        });
        return { handled: true, kind: 'message' };
    }

    return { handled: false };
};

// POST — ingest. req.body es un Buffer (express.raw).
export const handleMetaWebhook = async (req, res) => {
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body || {}));
    const signatureHeader = req.headers['x-hub-signature-256'] || req.headers['x-hub-signature'];
    const signatureOk = verifySignature({ rawBody, signatureHeader });

    // Respondemos 200 SIEMPRE que la firma sea válida (Meta reintenta ante no-200).
    if (!signatureOk) {
        console.warn('[social/webhook] firma inválida — evento descartado');
        return res.status(403).send('invalid signature');
    }

    let body;
    try {
        body = JSON.parse(rawBody.toString('utf8'));
    } catch {
        return res.status(400).send('bad json');
    }

    const events = normalizeWebhookPayload(body);
    // Persistimos + procesamos inline (writes rápidos). Respondemos al final.
    let processed = 0;
    for (const evt of events) {
        const account = await resolveAccount(evt.entryId);
        let status = 'received';
        let error = null;
        try {
            const r = await processEvent({ evt, account });
            status = r.handled ? 'processed' : 'ignored';
            if (r.handled) processed += 1;
        } catch (e) {
            status = 'failed';
            error = e.message?.slice(0, 300) || 'error';
            console.error('[social/webhook] processEvent error:', e.message);
        }
        try {
            await prisma.socialWebhookEvent.create({
                data: {
                    provider: 'meta',
                    object: evt.object || null,
                    field: evt.field || null,
                    entryId: evt.entryId || null,
                    accountId: account?.id || null,
                    clubId: account?.clubId || null,
                    payload: evt.value || {},
                    signatureOk: true,
                    status,
                    error,
                    processedAt: status === 'processed' ? new Date() : null
                }
            });
        } catch (e) {
            console.warn('[social/webhook] no se pudo persistir evento:', e.message);
        }
    }

    if (events.length) {
        await auditSocial({
            action: 'webhook',
            detail: { object: body.object, events: events.length, processed }
        });
    }
    return res.status(200).send('EVENT_RECEIVED');
};

// GET /api/social/webhooks/events — panel de diagnóstico (autenticado).
export const listWebhookEvents = async (req, res) => {
    try {
        const isAdmin = req.user.role === 'administrator';
        const where = {};
        if (isAdmin) {
            if (req.query.clubId) where.clubId = req.query.clubId;
        } else {
            if (!req.user.clubId) return res.json([]);
            where.clubId = req.user.clubId;
        }
        if (req.query.status) where.status = req.query.status;
        const events = await prisma.socialWebhookEvent.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take: Math.min(parseInt(req.query.limit || '100', 10), 300)
        });
        res.json(events);
    } catch (e) {
        console.error('[social/webhook] listWebhookEvents error:', e);
        res.status(500).json({ error: e.message });
    }
};
