import { randomUUID } from 'crypto';
import prisma from '../lib/prisma.js';
import db from '../lib/db.js';
import EmailService from '../services/EmailService.js';

// v4.438 — Sistema de Email Marketing (campañas tipo Mailchimp).
// Reutiliza la audiencia del CRM (CrmContact/CrmList) y EmailService (Resend/SMTP)
// para enviar. Cada campaña queda scopeada a un sitio (clubId) y respeta el opt-out.
console.log('[emailMarketingController] v4.443 — campañas + tracking + reportes + segmentación + programación + webhook de rebotes/quejas (Resend)');

// El administrador global puede operar en el contexto de un sitio vía ?clubId / body.clubId
// (por ejemplo al impersonar). El resto de roles siempre opera sobre su propio clubId.
const resolveClubId = (req) => {
    if (req.user?.role === 'administrator') {
        return req.query?.clubId || req.body?.clubId || req.user?.clubId || null;
    }
    return req.user?.clubId || null;
};

const isValidEmail = (e) => typeof e === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());

// Resuelve los destinatarios reales (contactos con email válido, activos y sin baja).
const resolveRecipients = async (clubId, audience, listId, tag) => {
    let contacts;
    if (audience === 'list' && listId) {
        const members = await prisma.contactListMember.findMany({
            where: { listId },
            include: { contact: true },
        });
        contacts = members
            .map((m) => m.contact)
            .filter((c) => c && c.clubId === clubId);
    } else if (audience === 'tag' && tag) {
        contacts = await prisma.crmContact.findMany({
            where: { clubId, status: 'active', archivedAt: null, tags: { has: tag } },
        });
    } else {
        contacts = await prisma.crmContact.findMany({
            where: { clubId, status: 'active', archivedAt: null },
        });
    }
    // Email válido + no dado de baja. Deduplica por email.
    const seen = new Set();
    return contacts.filter((c) => {
        if (c.optedOutAt) return false;
        if (!isValidEmail(c.email)) return false;
        const key = c.email.trim().toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
};

// GET /  — lista de campañas del sitio
export const listCampaigns = async (req, res) => {
    try {
        const clubId = resolveClubId(req);
        if (!clubId) return res.json([]);
        const campaigns = await prisma.emailCampaign.findMany({
            where: { clubId },
            orderBy: { createdAt: 'desc' },
        });
        res.json(campaigns);
    } catch (error) {
        console.error('[emailMarketing] listCampaigns:', error);
        res.status(500).json({ error: 'Error al cargar las campañas' });
    }
};

// GET /audience — conteo de destinatarios para una selección (preview)
export const previewAudience = async (req, res) => {
    try {
        const clubId = resolveClubId(req);
        if (!clubId) return res.json({ count: 0 });
        const { audience = 'all', listId, segmentTag } = req.query;
        const recipients = await resolveRecipients(clubId, audience, listId || null, segmentTag || null);
        res.json({ count: recipients.length });
    } catch (error) {
        console.error('[emailMarketing] previewAudience:', error);
        res.status(500).json({ error: 'Error al calcular la audiencia' });
    }
};

// GET /:id
export const getCampaign = async (req, res) => {
    try {
        const clubId = resolveClubId(req);
        const campaign = await prisma.emailCampaign.findUnique({ where: { id: req.params.id } });
        if (!campaign || campaign.clubId !== clubId) {
            return res.status(404).json({ error: 'Campaña no encontrada' });
        }
        res.json(campaign);
    } catch (error) {
        console.error('[emailMarketing] getCampaign:', error);
        res.status(500).json({ error: 'Error al cargar la campaña' });
    }
};

// POST /
export const createCampaign = async (req, res) => {
    try {
        const clubId = resolveClubId(req);
        if (!clubId) return res.status(400).json({ error: 'No hay un sitio asociado a esta campaña' });
        const { name, subject, fromName, preheader, content, audience, listId, segmentTag } = req.body;
        if (!name || !subject || !content) {
            return res.status(400).json({ error: 'Nombre, asunto y contenido son obligatorios' });
        }
        const aud = ['list', 'tag'].includes(audience) ? audience : 'all';
        const campaign = await prisma.emailCampaign.create({
            data: {
                clubId,
                name,
                subject,
                fromName: fromName || null,
                preheader: preheader || null,
                content,
                audience: aud,
                listId: aud === 'list' ? (listId || null) : null,
                segmentTag: aud === 'tag' ? (segmentTag || null) : null,
                status: 'draft',
                createdById: req.user?.id || null,
            },
        });
        res.status(201).json(campaign);
    } catch (error) {
        console.error('[emailMarketing] createCampaign:', error);
        res.status(500).json({ error: 'Error al crear la campaña' });
    }
};

// PUT /:id — solo borradores
export const updateCampaign = async (req, res) => {
    try {
        const clubId = resolveClubId(req);
        const existing = await prisma.emailCampaign.findUnique({ where: { id: req.params.id } });
        if (!existing || existing.clubId !== clubId) {
            return res.status(404).json({ error: 'Campaña no encontrada' });
        }
        if (!['draft', 'scheduled', 'failed'].includes(existing.status)) {
            return res.status(400).json({ error: 'Solo se pueden editar campañas en borrador o programadas' });
        }
        const { name, subject, fromName, preheader, content, audience, listId, segmentTag } = req.body;
        const aud = audience !== undefined ? (['list', 'tag'].includes(audience) ? audience : 'all') : undefined;
        const campaign = await prisma.emailCampaign.update({
            where: { id: req.params.id },
            data: {
                ...(name !== undefined && { name }),
                ...(subject !== undefined && { subject }),
                ...(fromName !== undefined && { fromName: fromName || null }),
                ...(preheader !== undefined && { preheader: preheader || null }),
                ...(content !== undefined && { content }),
                ...(aud !== undefined && { audience: aud }),
                ...(aud !== undefined && { listId: aud === 'list' ? (listId || null) : null }),
                ...(aud !== undefined && { segmentTag: aud === 'tag' ? (segmentTag || null) : null }),
            },
        });
        res.json(campaign);
    } catch (error) {
        console.error('[emailMarketing] updateCampaign:', error);
        res.status(500).json({ error: 'Error al actualizar la campaña' });
    }
};

// DELETE /:id
export const deleteCampaign = async (req, res) => {
    try {
        const clubId = resolveClubId(req);
        const existing = await prisma.emailCampaign.findUnique({ where: { id: req.params.id } });
        if (!existing || existing.clubId !== clubId) {
            return res.status(404).json({ error: 'Campaña no encontrada' });
        }
        await prisma.emailCampaign.delete({ where: { id: req.params.id } });
        res.json({ success: true });
    } catch (error) {
        console.error('[emailMarketing] deleteCampaign:', error);
        res.status(500).json({ error: 'Error al eliminar la campaña' });
    }
};

// Tope de seguridad para no exceder el límite de tiempo del serverless (Vercel 120s).
const MAX_RECIPIENTS_PER_SEND = 500;

// Reescribe los links del cuerpo para pasar por el endpoint de tracking de clics.
const wrapLinks = (html, rid, baseUrl) =>
    html.replace(/href="(https?:\/\/[^"]+)"/gi, (_m, url) =>
        `href="${baseUrl}/api/public/em/c/${rid}?u=${encodeURIComponent(url)}"`);

const buildEmailHtml = (campaign, rid, contact, baseUrl) => {
    const unsubscribeUrl = `${baseUrl}/api/public/unsubscribe?cid=${contact.id}`;
    const trackedContent = wrapLinks(campaign.content, rid, baseUrl);
    const pixel = `<img src="${baseUrl}/api/public/em/o/${rid}" width="1" height="1" alt="" style="display:none">`;
    const preheader = campaign.preheader
        ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${campaign.preheader}</div>`
        : '';
    const footer = `
        <div style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:12px;color:#9ca3af;text-align:center;font-family:Arial,sans-serif">
            <p>Recibes este correo porque estás en la base de contactos de este sitio.</p>
            <p><a href="${unsubscribeUrl}" style="color:#9ca3af;text-decoration:underline">Cancelar suscripción</a></p>
        </div>`;
    return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f3f4f6">
        ${preheader}
        <div style="max-width:600px;margin:0 auto;padding:24px;background:#ffffff">
            ${trackedContent}
            ${footer}
        </div>
        ${pixel}
    </body></html>`;
};

// Despacho real de una campaña (compartido por el envío manual y el cron de programados).
// Lanza un Error si no hay destinatarios; el llamador decide cómo reportarlo.
const dispatchCampaign = async ({ campaign, baseUrl, userId }) => {
    const clubId = campaign.clubId;
    const recipients = await resolveRecipients(clubId, campaign.audience, campaign.listId, campaign.segmentTag);
    if (recipients.length === 0) {
        const err = new Error('No hay destinatarios con email válido para esta audiencia');
        err.code = 'NO_RECIPIENTS';
        throw err;
    }

    const batch = recipients.slice(0, MAX_RECIPIENTS_PER_SEND);
    await prisma.emailCampaign.update({
        where: { id: campaign.id },
        data: { status: 'sending', totalRecipients: batch.length, openCount: 0, clickCount: 0 },
    });
    // Reinicia destinatarios de un reenvío anterior (campaña fallida que se reintenta).
    await prisma.emailCampaignRecipient.deleteMany({ where: { campaignId: campaign.id } });

    let sentCount = 0;
    let failedCount = 0;
    const recipientRows = [];

    for (const contact of batch) {
        const rid = randomUUID();
        const html = buildEmailHtml(campaign, rid, contact, baseUrl);
        const result = await EmailService.sendEmail({
            clubId,
            to: contact.email.trim(),
            subject: campaign.subject,
            html,
            userId: userId || null,
        });
        const ok = !!result?.success;
        if (ok) sentCount += 1;
        else failedCount += 1;
        recipientRows.push({
            id: rid,
            campaignId: campaign.id,
            clubId,
            contactId: contact.id,
            email: contact.email.trim(),
            status: ok ? 'sent' : 'failed',
        });
    }

    if (recipientRows.length) {
        await prisma.emailCampaignRecipient.createMany({ data: recipientRows, skipDuplicates: true });
    }

    const finalStatus = sentCount > 0 ? 'sent' : 'failed';
    const updated = await prisma.emailCampaign.update({
        where: { id: campaign.id },
        data: { status: finalStatus, sentCount, failedCount, scheduledAt: null, sentAt: new Date() },
    });

    return { campaign: updated, sent: sentCount, failed: failedCount, skipped: recipients.length - batch.length };
};

// POST /:id/send — envío inmediato de la campaña
export const sendCampaign = async (req, res) => {
    try {
        const clubId = resolveClubId(req);
        const campaign = await prisma.emailCampaign.findUnique({ where: { id: req.params.id } });
        if (!campaign || campaign.clubId !== clubId) {
            return res.status(404).json({ error: 'Campaña no encontrada' });
        }
        if (campaign.status === 'sending') {
            return res.status(400).json({ error: 'La campaña ya se está enviando' });
        }
        if (campaign.status === 'sent') {
            return res.status(400).json({ error: 'Esta campaña ya fue enviada' });
        }

        const baseUrl = `${req.protocol}://${req.get('host')}`;
        const result = await dispatchCampaign({ campaign, baseUrl, userId: req.user?.id });
        res.json(result);
    } catch (error) {
        if (error.code === 'NO_RECIPIENTS') {
            return res.status(400).json({ error: error.message });
        }
        console.error('[emailMarketing] sendCampaign:', error);
        try {
            await prisma.emailCampaign.update({ where: { id: req.params.id }, data: { status: 'failed' } });
        } catch { /* noop */ }
        res.status(500).json({ error: 'Error al enviar la campaña' });
    }
};

// POST /:id/schedule — programa el envío para una fecha/hora futura
export const scheduleCampaign = async (req, res) => {
    try {
        const clubId = resolveClubId(req);
        const campaign = await prisma.emailCampaign.findUnique({ where: { id: req.params.id } });
        if (!campaign || campaign.clubId !== clubId) {
            return res.status(404).json({ error: 'Campaña no encontrada' });
        }
        if (!['draft', 'scheduled', 'failed'].includes(campaign.status)) {
            return res.status(400).json({ error: 'Solo se pueden programar campañas en borrador' });
        }
        const when = new Date(req.body.scheduledAt);
        if (isNaN(when.getTime()) || when.getTime() <= Date.now()) {
            return res.status(400).json({ error: 'La fecha de programación debe ser futura' });
        }
        const updated = await prisma.emailCampaign.update({
            where: { id: campaign.id },
            data: { status: 'scheduled', scheduledAt: when },
        });
        res.json(updated);
    } catch (error) {
        console.error('[emailMarketing] scheduleCampaign:', error);
        res.status(500).json({ error: 'Error al programar la campaña' });
    }
};

// POST /:id/unschedule — cancela la programación (vuelve a borrador)
export const unscheduleCampaign = async (req, res) => {
    try {
        const clubId = resolveClubId(req);
        const campaign = await prisma.emailCampaign.findUnique({ where: { id: req.params.id } });
        if (!campaign || campaign.clubId !== clubId) {
            return res.status(404).json({ error: 'Campaña no encontrada' });
        }
        if (campaign.status !== 'scheduled') {
            return res.status(400).json({ error: 'La campaña no está programada' });
        }
        const updated = await prisma.emailCampaign.update({
            where: { id: campaign.id },
            data: { status: 'draft', scheduledAt: null },
        });
        res.json(updated);
    } catch (error) {
        console.error('[emailMarketing] unscheduleCampaign:', error);
        res.status(500).json({ error: 'Error al cancelar la programación' });
    }
};

// Procesa las campañas programadas cuya hora ya llegó. Lo invoca el cron.
export const processScheduledCampaigns = async ({ baseUrl, now = new Date() } = {}) => {
    const due = await prisma.emailCampaign.findMany({
        where: { status: 'scheduled', scheduledAt: { not: null, lte: now } },
        orderBy: { scheduledAt: 'asc' },
        take: 25, // límite por corrida para respetar el tiempo del serverless
    });
    let processed = 0;
    let failed = 0;
    for (const campaign of due) {
        try {
            await dispatchCampaign({ campaign, baseUrl, userId: campaign.createdById });
            processed += 1;
        } catch (error) {
            failed += 1;
            const status = error.code === 'NO_RECIPIENTS' ? 'failed' : 'failed';
            try { await prisma.emailCampaign.update({ where: { id: campaign.id }, data: { status } }); } catch { /* noop */ }
            console.error(`[emailMarketing] scheduled dispatch failed for ${campaign.id}:`, error.message);
        }
    }
    return { evaluated: due.length, processed, failed };
};

// GET /:id/report — métricas de una campaña enviada (aperturas/clics únicos)
export const getReport = async (req, res) => {
    try {
        const clubId = resolveClubId(req);
        const campaign = await prisma.emailCampaign.findUnique({ where: { id: req.params.id } });
        if (!campaign || campaign.clubId !== clubId) {
            return res.status(404).json({ error: 'Campaña no encontrada' });
        }
        const [sent, failed, uniqueOpens, uniqueClicks] = await Promise.all([
            prisma.emailCampaignRecipient.count({ where: { campaignId: campaign.id, status: 'sent' } }),
            prisma.emailCampaignRecipient.count({ where: { campaignId: campaign.id, status: 'failed' } }),
            prisma.emailCampaignRecipient.count({ where: { campaignId: campaign.id, openedAt: { not: null } } }),
            prisma.emailCampaignRecipient.count({ where: { campaignId: campaign.id, clickedAt: { not: null } } }),
        ]);
        const openRate = sent ? Math.round((uniqueOpens / sent) * 1000) / 10 : 0;
        const clickRate = sent ? Math.round((uniqueClicks / sent) * 1000) / 10 : 0;
        res.json({
            campaign: { id: campaign.id, name: campaign.name, subject: campaign.subject, sentAt: campaign.sentAt, status: campaign.status },
            sent, failed,
            totalOpens: campaign.openCount,
            totalClicks: campaign.clickCount,
            uniqueOpens, uniqueClicks,
            openRate, clickRate,
        });
    } catch (error) {
        console.error('[emailMarketing] getReport:', error);
        res.status(500).json({ error: 'Error al cargar el reporte' });
    }
};

// GET /stats — métricas para el dashboard del módulo
export const getStats = async (req, res) => {
    try {
        const clubId = resolveClubId(req);
        if (!clubId) return res.json({ campaigns: 0, emailsSent: 0, opens: 0, clicks: 0, contacts: 0, tags: 0, templates: 0 });
        const [campaigns, sentAgg, opens, clicks, contacts, templates, tagRows] = await Promise.all([
            prisma.emailCampaign.count({ where: { clubId } }),
            prisma.emailCampaign.aggregate({ where: { clubId }, _sum: { sentCount: true } }),
            prisma.emailCampaignRecipient.count({ where: { clubId, openedAt: { not: null } } }),
            prisma.emailCampaignRecipient.count({ where: { clubId, clickedAt: { not: null } } }),
            prisma.crmContact.count({ where: { clubId, status: 'active', archivedAt: null, optedOutAt: null, email: { not: null } } }),
            prisma.communicationTemplate.count({ where: { clubId, type: 'email' } }),
            db.query(`SELECT COUNT(DISTINCT t) AS c FROM "WhatsAppContact", unnest(tags) AS t WHERE "clubId" = $1`, [clubId]).catch(() => ({ rows: [{ c: 0 }] })),
        ]);
        res.json({
            campaigns,
            emailsSent: sentAgg._sum.sentCount || 0,
            opens,
            clicks,
            contacts,
            templates,
            tags: parseInt(tagRows.rows?.[0]?.c || 0, 10),
        });
    } catch (error) {
        console.error('[emailMarketing] getStats:', error);
        res.status(500).json({ error: 'Error al cargar las métricas' });
    }
};

// GET /tags — etiquetas distintas del CRM del sitio (para segmentar)
export const getTags = async (req, res) => {
    try {
        const clubId = resolveClubId(req);
        if (!clubId) return res.json([]);
        const r = await db.query(
            `SELECT DISTINCT t AS tag FROM "WhatsAppContact", unnest(tags) AS t WHERE "clubId" = $1 ORDER BY t ASC`,
            [clubId]
        );
        res.json(r.rows.map((row) => row.tag).filter(Boolean));
    } catch (error) {
        console.error('[emailMarketing] getTags:', error);
        res.json([]);
    }
};

// POST /api/public/resend-webhook — eventos de Resend (rebotes y quejas).
// Al recibir un rebote duro o una queja de spam, se da de baja al contacto (optedOutAt)
// para no volver a enviarle. Protección opcional por secreto compartido en ?secret=.
export const handleResendWebhook = async (req, res) => {
    try {
        if (process.env.RESEND_WEBHOOK_SECRET) {
            const provided = req.query.secret || req.headers['x-webhook-secret'];
            if (provided !== process.env.RESEND_WEBHOOK_SECRET) {
                return res.status(401).json({ error: 'Unauthorized webhook' });
            }
        }
        const event = req.body || {};
        const type = event.type || event.event;
        const optOutTypes = ['email.bounced', 'email.complained', 'bounced', 'complained', 'spam'];
        if (optOutTypes.includes(type)) {
            const data = event.data || {};
            const rawTo = data.to || data.email || data.recipient;
            const emails = (Array.isArray(rawTo) ? rawTo : [rawTo])
                .filter(Boolean)
                .map((e) => String(e).trim().toLowerCase());
            for (const email of emails) {
                try {
                    await prisma.crmContact.updateMany({
                        where: { email: { equals: email, mode: 'insensitive' }, optedOutAt: null },
                        data: { optedOutAt: new Date(), totalFailed: { increment: 1 } },
                    });
                } catch (e) {
                    console.error('[emailMarketing] webhook opt-out error:', e.message);
                }
            }
            console.log(`[emailMarketing] webhook ${type} → baja de ${emails.length} email(s)`);
        }
        // Siempre responder 200 para que Resend no reintente innecesariamente.
        res.json({ ok: true });
    } catch (error) {
        console.error('[emailMarketing] handleResendWebhook:', error);
        res.json({ ok: true });
    }
};

// Pixel transparente 1x1 (GIF) para el tracking de aperturas.
const TRACKING_PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==', 'base64');

// GET /api/public/em/o/:rid — apertura
export const trackOpen = async (req, res) => {
    try {
        const { rid } = req.params;
        const recipient = await prisma.emailCampaignRecipient.findUnique({ where: { id: rid } });
        if (recipient) {
            await prisma.emailCampaignRecipient.update({
                where: { id: rid },
                data: { openedAt: recipient.openedAt || new Date(), openCount: { increment: 1 } },
            });
            await prisma.emailCampaign.update({ where: { id: recipient.campaignId }, data: { openCount: { increment: 1 } } });
        }
    } catch (error) {
        console.error('[emailMarketing] trackOpen:', error);
    }
    res.set('Content-Type', 'image/gif');
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.send(TRACKING_PIXEL);
};

// GET /api/public/em/c/:rid?u=URL — clic (registra y redirige)
export const trackClick = async (req, res) => {
    const { rid } = req.params;
    const target = typeof req.query.u === 'string' ? req.query.u : '';
    const safeTarget = /^https?:\/\//i.test(target) ? target : null;
    try {
        const recipient = await prisma.emailCampaignRecipient.findUnique({ where: { id: rid } });
        if (recipient) {
            await prisma.emailCampaignRecipient.update({
                where: { id: rid },
                data: {
                    clickedAt: recipient.clickedAt || new Date(),
                    clickCount: { increment: 1 },
                    // un clic implica apertura
                    openedAt: recipient.openedAt || new Date(),
                },
            });
            await prisma.emailCampaign.update({ where: { id: recipient.campaignId }, data: { clickCount: { increment: 1 } } });
        }
    } catch (error) {
        console.error('[emailMarketing] trackClick:', error);
    }
    if (safeTarget) return res.redirect(safeTarget);
    res.status(400).send('Enlace inválido');
};
