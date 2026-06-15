import prisma from '../lib/prisma.js';
import EmailService from '../services/EmailService.js';

// v4.438 — Sistema de Email Marketing (campañas tipo Mailchimp).
// Reutiliza la audiencia del CRM (CrmContact/CrmList) y EmailService (Resend/SMTP)
// para enviar. Cada campaña queda scopeada a un sitio (clubId) y respeta el opt-out.
console.log('[emailMarketingController] v4.438 — campañas de email marketing habilitadas');

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
const resolveRecipients = async (clubId, audience, listId) => {
    let contacts;
    if (audience === 'list' && listId) {
        const members = await prisma.contactListMember.findMany({
            where: { listId },
            include: { contact: true },
        });
        contacts = members
            .map((m) => m.contact)
            .filter((c) => c && c.clubId === clubId);
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
        const { audience = 'all', listId } = req.query;
        const recipients = await resolveRecipients(clubId, audience, listId || null);
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
        const { name, subject, fromName, preheader, content, audience, listId } = req.body;
        if (!name || !subject || !content) {
            return res.status(400).json({ error: 'Nombre, asunto y contenido son obligatorios' });
        }
        const campaign = await prisma.emailCampaign.create({
            data: {
                clubId,
                name,
                subject,
                fromName: fromName || null,
                preheader: preheader || null,
                content,
                audience: audience === 'list' ? 'list' : 'all',
                listId: audience === 'list' ? (listId || null) : null,
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
        if (existing.status !== 'draft') {
            return res.status(400).json({ error: 'Solo se pueden editar campañas en borrador' });
        }
        const { name, subject, fromName, preheader, content, audience, listId } = req.body;
        const campaign = await prisma.emailCampaign.update({
            where: { id: req.params.id },
            data: {
                ...(name !== undefined && { name }),
                ...(subject !== undefined && { subject }),
                ...(fromName !== undefined && { fromName: fromName || null }),
                ...(preheader !== undefined && { preheader: preheader || null }),
                ...(content !== undefined && { content }),
                ...(audience !== undefined && { audience: audience === 'list' ? 'list' : 'all' }),
                ...(audience !== undefined && { listId: audience === 'list' ? (listId || null) : null }),
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

const buildEmailHtml = (campaign, contact, unsubscribeUrl) => {
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
            ${campaign.content}
            ${footer}
        </div>
    </body></html>`;
};

// POST /:id/send — envío de la campaña
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

        const recipients = await resolveRecipients(clubId, campaign.audience, campaign.listId);
        if (recipients.length === 0) {
            return res.status(400).json({ error: 'No hay destinatarios con email válido para esta audiencia' });
        }

        const batch = recipients.slice(0, MAX_RECIPIENTS_PER_SEND);
        await prisma.emailCampaign.update({
            where: { id: campaign.id },
            data: { status: 'sending', totalRecipients: batch.length },
        });

        const baseUrl = `${req.protocol}://${req.get('host')}`;
        let sentCount = 0;
        let failedCount = 0;

        for (const contact of batch) {
            const unsubscribeUrl = `${baseUrl}/api/public/unsubscribe?cid=${contact.id}`;
            const html = buildEmailHtml(campaign, contact, unsubscribeUrl);
            const result = await EmailService.sendEmail({
                clubId,
                to: contact.email.trim(),
                subject: campaign.subject,
                html,
                userId: req.user?.id || null,
            });
            if (result?.success) sentCount += 1;
            else failedCount += 1;
        }

        const finalStatus = sentCount > 0 ? 'sent' : 'failed';
        const updated = await prisma.emailCampaign.update({
            where: { id: campaign.id },
            data: {
                status: finalStatus,
                sentCount,
                failedCount,
                sentAt: new Date(),
            },
        });

        res.json({
            campaign: updated,
            sent: sentCount,
            failed: failedCount,
            skipped: recipients.length - batch.length,
        });
    } catch (error) {
        console.error('[emailMarketing] sendCampaign:', error);
        try {
            await prisma.emailCampaign.update({ where: { id: req.params.id }, data: { status: 'failed' } });
        } catch { /* noop */ }
        res.status(500).json({ error: 'Error al enviar la campaña' });
    }
};
