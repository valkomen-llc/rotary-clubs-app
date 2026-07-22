import { randomUUID } from 'crypto';
import prisma from '../lib/prisma.js';
import db from '../lib/db.js';
import EmailService from '../services/EmailService.js';

// v4.438 — Sistema de Email Marketing (campañas tipo Mailchimp).
// Reutiliza la audiencia del CRM (CrmContact/CrmList) y EmailService (Resend/SMTP)
// para enviar. Cada campaña queda scopeada a un sitio (clubId) y respeta el opt-out.
console.log('[emailMarketingController] v4.566 — campañas + tracking + reportes + segmentación + programación + webhook de rebotes/quejas (Resend) + panel unificado (dashboard) + editor visual de bloques (design) + envío de prueba');

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
        const { name, subject, fromName, preheader, content, design, audience, listId, segmentTag } = req.body;
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
                design: design || null,
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
        const { name, subject, fromName, preheader, content, design, audience, listId, segmentTag } = req.body;
        const aud = audience !== undefined ? (['list', 'tag'].includes(audience) ? audience : 'all') : undefined;
        const campaign = await prisma.emailCampaign.update({
            where: { id: req.params.id },
            data: {
                ...(name !== undefined && { name }),
                ...(subject !== undefined && { subject }),
                ...(fromName !== undefined && { fromName: fromName || null }),
                ...(preheader !== undefined && { preheader: preheader || null }),
                ...(content !== undefined && { content }),
                ...(design !== undefined && { design: design || null }),
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

// POST /test-send — envía un correo de prueba a una dirección arbitraria.
// No crea EmailCampaignRecipient ni afecta métricas; sirve para revisar el diseño.
export const sendTest = async (req, res) => {
    try {
        const clubId = resolveClubId(req);
        if (!clubId) return res.status(400).json({ error: 'No hay un sitio asociado a esta prueba' });
        const { to, subject, content } = req.body;
        if (!isValidEmail(to)) return res.status(400).json({ error: 'La dirección de prueba no es válida' });
        if (!subject || !content) return res.status(400).json({ error: 'Asunto y contenido son obligatorios' });
        const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f3f4f6">
            <div style="max-width:600px;margin:0 auto;padding:24px;background:#ffffff">
                <div style="background:#fef3c7;color:#92400e;font-family:Arial,sans-serif;font-size:12px;padding:8px 12px;border-radius:8px;margin-bottom:16px">✉️ Correo de PRUEBA — así se verá tu campaña (sin el pie de baja real).</div>
                ${content}
            </div>
        </body></html>`;
        const result = await EmailService.sendEmail({
            clubId,
            to: String(to).trim(),
            subject: `[PRUEBA] ${subject}`,
            html,
            userId: req.user?.id || null,
        });
        if (!result?.success) {
            return res.status(502).json({ error: result?.error || 'El proveedor no pudo enviar la prueba' });
        }
        res.json({ success: true });
    } catch (error) {
        console.error('[emailMarketing] sendTest:', error);
        res.status(500).json({ error: 'Error al enviar la prueba' });
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

// Períodos soportados por el panel unificado.
const DASHBOARD_PERIODS = {
    '7d': { days: 7, label: 'Últimos 7 días' },
    '30d': { days: 30, label: 'Últimos 30 días' },
    '90d': { days: 90, label: 'Últimos 90 días' },
};
const DAY_MS = 86400000;
const startOfUTCDay = (d) => { const x = new Date(d); x.setUTCHours(0, 0, 0, 0); return x; };
const dayKey = (d) => new Date(d).toISOString().slice(0, 10);
const rate = (num, den) => (den > 0 ? Math.round((num / den) * 1000) / 10 : 0);
const deltaPct = (current, previous) => {
    if (previous === 0) return current > 0 ? 100 : 0;
    return Math.round(((current - previous) / previous) * 1000) / 10;
};

// Cuenta filas agrupadas por día (columna de fecha configurable) para armar las series
// del panel. Devuelve un mapa { 'YYYY-MM-DD': n }. Tolerante a fallos (retorna {} si falla).
const dailyCounts = async (table, dateCol, clubId, from, extraWhere = '') => {
    try {
        const r = await db.query(
            `SELECT to_char(date_trunc('day', "${dateCol}"), 'YYYY-MM-DD') AS d, COUNT(*)::int AS c
             FROM "${table}"
             WHERE "clubId" = $1 AND "${dateCol}" IS NOT NULL AND "${dateCol}" >= $2 ${extraWhere}
             GROUP BY 1`,
            [clubId, from]
        );
        const map = {};
        for (const row of r.rows) map[row.d] = row.c;
        return map;
    } catch (e) {
        console.error(`[emailMarketing] dailyCounts ${table}.${dateCol}:`, e.message);
        return {};
    }
};

// GET /dashboard?period=30d — panel unificado del módulo.
// Agrega KPIs de audiencia, envíos, engagement y entregabilidad; series temporales por día;
// comparación con el período anterior; campañas recientes / top; y alertas de entregabilidad.
// 100% de solo lectura: no envía correos ni modifica datos.
export const getDashboard = async (req, res) => {
    try {
        const clubId = resolveClubId(req);
        const key = DASHBOARD_PERIODS[req.query.period] ? req.query.period : '30d';
        const { days, label } = DASHBOARD_PERIODS[key];
        const now = new Date();
        const today0 = startOfUTCDay(now);
        const from = new Date(today0.getTime() - (days - 1) * DAY_MS);
        const prevFrom = new Date(from.getTime() - days * DAY_MS);

        if (!clubId) {
            const zeroKpis = {
                contactsTotal: 0, subscribed: 0, unsubscribed: 0, noEmail: 0, pending: 0, withFailures: 0, reachable: 0,
                campaignsTotal: 0, campaignsSent: 0, campaignsActive: 0, campaignsSending: 0, campaignsScheduled: 0, campaignsFailed: 0,
                automationsTotal: 0, automationsActive: 0, emailsSentAllTime: 0,
                sentRecipients: 0, failedRecipients: 0, uniqueOpens: 0, uniqueClicks: 0,
                deliveryRate: 0, openRate: 0, clickRate: 0, unsubRate: 0,
                emailsSentPeriod: 0, opensPeriod: 0, clicksPeriod: 0, newContactsPeriod: 0,
            };
            const zeroDelta = { current: 0, previous: 0, deltaPct: 0 };
            return res.json({
                generatedAt: now.toISOString(),
                period: { key, label, days, from: from.toISOString(), to: now.toISOString() },
                kpis: zeroKpis,
                comparison: { emailsSent: zeroDelta, opens: zeroDelta, clicks: zeroDelta, newContacts: zeroDelta },
                series: [], recentCampaigns: [], topCampaigns: [],
                alerts: [{ level: 'info', title: 'Selecciona un sitio', message: 'Elige un sitio (club/evento) para ver sus métricas de email marketing.' }],
                empty: true,
            });
        }

        const [
            contactsTotal, subscribed, unsubscribed, noEmail, pending, withFailures, subscribedStatusOnly,
            campaignsTotal, campaignsSent, campaignsSending, campaignsScheduled, campaignsFailed,
            automationsTotal, automationsActive,
            sentAgg, sentRecipients, failedRecipients, uniqueOpens, uniqueClicks,
            emailsSentPeriod, emailsSentPrev, opensPeriod, opensPrev, clicksPeriod, clicksPrev,
            newContactsPeriod, newContactsPrev, newUnsubsPeriod,
            campaigns,
        ] = await Promise.all([
            prisma.crmContact.count({ where: { clubId, archivedAt: null } }),
            prisma.crmContact.count({ where: { clubId, archivedAt: null, optedOutAt: null, status: { in: ['active', 'subscribed'] }, email: { not: null } } }),
            prisma.crmContact.count({ where: { clubId, archivedAt: null, optedOutAt: { not: null } } }),
            prisma.crmContact.count({ where: { clubId, archivedAt: null, email: null } }),
            prisma.crmContact.count({ where: { clubId, archivedAt: null, status: 'pending' } }),
            prisma.crmContact.count({ where: { clubId, archivedAt: null, totalFailed: { gt: 0 } } }),
            prisma.crmContact.count({ where: { clubId, archivedAt: null, status: 'subscribed' } }),
            prisma.emailCampaign.count({ where: { clubId } }),
            prisma.emailCampaign.count({ where: { clubId, status: 'sent' } }),
            prisma.emailCampaign.count({ where: { clubId, status: 'sending' } }),
            prisma.emailCampaign.count({ where: { clubId, status: 'scheduled' } }),
            prisma.emailCampaign.count({ where: { clubId, status: 'failed' } }),
            prisma.emailAutomation.count({ where: { clubId } }).catch(() => 0),
            prisma.emailAutomation.count({ where: { clubId, status: 'active' } }).catch(() => 0),
            prisma.emailCampaign.aggregate({ where: { clubId }, _sum: { sentCount: true } }),
            prisma.emailCampaignRecipient.count({ where: { clubId, status: 'sent' } }),
            prisma.emailCampaignRecipient.count({ where: { clubId, status: 'failed' } }),
            prisma.emailCampaignRecipient.count({ where: { clubId, openedAt: { not: null } } }),
            prisma.emailCampaignRecipient.count({ where: { clubId, clickedAt: { not: null } } }),
            prisma.emailCampaignRecipient.count({ where: { clubId, status: 'sent', createdAt: { gte: from } } }),
            prisma.emailCampaignRecipient.count({ where: { clubId, status: 'sent', createdAt: { gte: prevFrom, lt: from } } }),
            prisma.emailCampaignRecipient.count({ where: { clubId, openedAt: { gte: from } } }),
            prisma.emailCampaignRecipient.count({ where: { clubId, openedAt: { gte: prevFrom, lt: from } } }),
            prisma.emailCampaignRecipient.count({ where: { clubId, clickedAt: { gte: from } } }),
            prisma.emailCampaignRecipient.count({ where: { clubId, clickedAt: { gte: prevFrom, lt: from } } }),
            prisma.crmContact.count({ where: { clubId, archivedAt: null, createdAt: { gte: from } } }),
            prisma.crmContact.count({ where: { clubId, archivedAt: null, createdAt: { gte: prevFrom, lt: from } } }),
            prisma.crmContact.count({ where: { clubId, optedOutAt: { gte: from } } }),
            prisma.emailCampaign.findMany({ where: { clubId }, orderBy: { createdAt: 'desc' }, take: 50 }),
        ]);

        // Series por día (envíos, aperturas, clics, contactos nuevos).
        const [sentByDay, opensByDay, clicksByDay, contactsByDay] = await Promise.all([
            dailyCounts('EmailCampaignRecipient', 'createdAt', clubId, from, `AND status = 'sent'`),
            dailyCounts('EmailCampaignRecipient', 'openedAt', clubId, from),
            dailyCounts('EmailCampaignRecipient', 'clickedAt', clubId, from),
            dailyCounts('WhatsAppContact', 'createdAt', clubId, from, `AND "archivedAt" IS NULL`),
        ]);
        const series = [];
        let cumulativeContacts = 0;
        for (let i = 0; i < days; i++) {
            const k = dayKey(new Date(from.getTime() + i * DAY_MS));
            cumulativeContacts += contactsByDay[k] || 0;
            series.push({
                date: k,
                sent: sentByDay[k] || 0,
                opens: opensByDay[k] || 0,
                clicks: clicksByDay[k] || 0,
                contacts: contactsByDay[k] || 0,
                contactsCumulative: cumulativeContacts,
            });
        }

        // Métricas únicas por campaña (aperturas/clics reales por destinatario) para
        // "recientes" y "top", en una sola consulta agrupada.
        const sentCampaignIds = campaigns.filter((c) => ['sent', 'failed'].includes(c.status)).map((c) => c.id);
        const perCampaign = {};
        if (sentCampaignIds.length) {
            try {
                const r = await db.query(
                    `SELECT "campaignId",
                        COUNT(*) FILTER (WHERE status = 'sent')::int AS sent,
                        COUNT(*) FILTER (WHERE "openedAt" IS NOT NULL)::int AS opens,
                        COUNT(*) FILTER (WHERE "clickedAt" IS NOT NULL)::int AS clicks
                     FROM "EmailCampaignRecipient"
                     WHERE "clubId" = $1 AND "campaignId" = ANY($2)
                     GROUP BY "campaignId"`,
                    [clubId, sentCampaignIds]
                );
                for (const row of r.rows) perCampaign[row.campaignId] = row;
            } catch (e) {
                console.error('[emailMarketing] dashboard perCampaign:', e.message);
            }
        }
        const decorate = (c) => {
            const pc = perCampaign[c.id] || { sent: c.sentCount, opens: 0, clicks: 0 };
            return {
                id: c.id, name: c.name, subject: c.subject, status: c.status,
                audience: c.audience, segmentTag: c.segmentTag, listId: c.listId,
                sentAt: c.sentAt, createdAt: c.createdAt, scheduledAt: c.scheduledAt,
                totalRecipients: c.totalRecipients, sentCount: c.sentCount, failedCount: c.failedCount,
                openCount: c.openCount, clickCount: c.clickCount,
                uniqueOpens: pc.opens, uniqueClicks: pc.clicks,
                openRate: rate(pc.opens, pc.sent), clickRate: rate(pc.clicks, pc.sent),
            };
        };
        const recentCampaigns = campaigns.slice(0, 6).map(decorate);
        const topCampaigns = campaigns
            .filter((c) => c.status === 'sent' && c.sentCount > 0)
            .map(decorate)
            .sort((a, b) => b.openRate - a.openRate)
            .slice(0, 5);

        // Alertas de entregabilidad (solo lectura).
        const alerts = [];
        const emailsSentAllTime = sentAgg._sum.sentCount || 0;
        const openRate = rate(uniqueOpens, sentRecipients);
        const deliveryRate = rate(sentRecipients, sentRecipients + failedRecipients);
        if (campaignsFailed > 0) {
            alerts.push({ level: 'danger', title: 'Campañas con fallos de envío', message: `${campaignsFailed} campaña(s) quedaron en estado "fallida". Revisa la configuración del proveedor de correo (Resend/SMTP) y reintenta el envío.` });
        }
        if (subscribed > 0 && newUnsubsPeriod / subscribed > 0.02) {
            alerts.push({ level: 'warning', title: 'Pico de bajas', message: `${newUnsubsPeriod} baja(s) en ${label.toLowerCase()} (${rate(newUnsubsPeriod, subscribed)}% de tu base suscrita). Revisa la frecuencia y la relevancia del contenido.` });
        }
        if (sentRecipients >= 50 && openRate < 10) {
            alerts.push({ level: 'warning', title: 'Tasa de apertura baja', message: `Tu tasa de apertura histórica es ${openRate}%. Prueba asuntos más claros, mejora el remitente/preheader y depura contactos inactivos.` });
        }
        if (contactsTotal > 0 && noEmail / contactsTotal > 0.2) {
            alerts.push({ level: 'info', title: 'Contactos sin correo', message: `${noEmail} de ${contactsTotal} contactos (${rate(noEmail, contactsTotal)}%) no tienen email y no son alcanzables por campañas. Complétalos o impórtalos con correo.` });
        }
        if (subscribedStatusOnly > 0) {
            alerts.push({ level: 'info', title: 'Estados por normalizar', message: `${subscribedStatusOnly} contacto(s) tienen estado "subscribed". El envío actual filtra por "active": el panel ya los cuenta como suscritos, pero conviene normalizar el estado (previsto para una próxima fase).` });
        }
        if (deliveryRate > 0 && deliveryRate < 95 && sentRecipients + failedRecipients >= 20) {
            alerts.push({ level: 'warning', title: 'Entregabilidad reducida', message: `Tu tasa de entrega es ${deliveryRate}%. Verifica SPF/DKIM/DMARC del dominio remitente y la reputación del proveedor.` });
        }
        if (alerts.length === 0) {
            alerts.push({ level: 'success', title: 'Sin alertas', message: 'No detectamos problemas de entregabilidad. Todo en orden.' });
        }

        res.json({
            generatedAt: now.toISOString(),
            period: { key, label, days, from: from.toISOString(), to: now.toISOString() },
            kpis: {
                contactsTotal, subscribed, unsubscribed, noEmail, pending, withFailures,
                reachable: subscribed,
                campaignsTotal, campaignsSent, campaignsActive: campaignsSending + campaignsScheduled,
                campaignsSending, campaignsScheduled, campaignsFailed,
                automationsTotal, automationsActive,
                emailsSentAllTime,
                sentRecipients, failedRecipients, uniqueOpens, uniqueClicks,
                deliveryRate, openRate, clickRate: rate(uniqueClicks, sentRecipients),
                unsubRate: rate(unsubscribed, contactsTotal),
                emailsSentPeriod, opensPeriod, clicksPeriod, newContactsPeriod,
            },
            comparison: {
                emailsSent: { current: emailsSentPeriod, previous: emailsSentPrev, deltaPct: deltaPct(emailsSentPeriod, emailsSentPrev) },
                opens: { current: opensPeriod, previous: opensPrev, deltaPct: deltaPct(opensPeriod, opensPrev) },
                clicks: { current: clicksPeriod, previous: clicksPrev, deltaPct: deltaPct(clicksPeriod, clicksPrev) },
                newContacts: { current: newContactsPeriod, previous: newContactsPrev, deltaPct: deltaPct(newContactsPeriod, newContactsPrev) },
            },
            series,
            recentCampaigns,
            topCampaigns,
            alerts,
        });
    } catch (error) {
        console.error('[emailMarketing] getDashboard:', error);
        res.status(500).json({ error: 'Error al cargar el panel' });
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
