import { randomUUID } from 'crypto';
import prisma from '../lib/prisma.js';
import db from '../lib/db.js';
import EmailService from '../services/EmailService.js';
import { resolveClubId } from './crmController.js';

// v4.438 — Sistema de Email Marketing (campañas tipo Mailchimp).
// Reutiliza la audiencia del CRM (CrmContact/CrmList) y EmailService (Resend/SMTP)
// para enviar. Cada campaña queda scopeada a un sitio (clubId) y respeta el opt-out.
console.log('[emailMarketingController] v4.576 — resolveClubId compartido con el CRM (Platform Club para admin sin clubId) + audiencia multi-lista + conversiones');

// resolveClubId se comparte con el CRM (crmController) para operar sobre el MISMO sitio
// que el Directorio CRM: admins sin clubId en el token caen al Platform Club (Origen).

const isValidEmail = (e) => typeof e === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());

// Resuelve los destinatarios reales (contactos con email válido, activos y sin baja).
const resolveRecipients = async (clubId, audience, listId, tag, listIds) => {
    let contacts;
    if (audience === 'list') {
        // Acepta una o varias listas del CRM. Valida que sean propias o compartidas con
        // este sitio (siteIds), y toma sus miembros sin filtrar por el club del contacto
        // (para soportar listas vinculadas por otro sitio, ej. un distrito).
        const ids = [...new Set([...(Array.isArray(listIds) ? listIds : []), ...(listId ? [listId] : [])].filter(Boolean))];
        if (!ids.length) {
            contacts = [];
        } else {
            const accessible = await prisma.crmList.findMany({
                where: { id: { in: ids }, OR: [{ clubId }, { siteIds: { has: clubId } }] },
                select: { id: true },
            });
            const okIds = accessible.map((l) => l.id);
            if (!okIds.length) {
                contacts = [];
            } else {
                const members = await prisma.contactListMember.findMany({
                    where: { listId: { in: okIds } },
                    include: { contact: true },
                });
                const seenC = new Set();
                contacts = members
                    .map((m) => m.contact)
                    .filter((c) => { if (!c || seenC.has(c.id)) return false; seenC.add(c.id); return true; });
            }
        }
    } else if (audience === 'tag' && tag) {
        contacts = await prisma.crmContact.findMany({
            // Incluye tanto 'active' como 'subscribed': el CRM crea contactos con
            // status 'subscribed' y antes quedaban excluidos del envío (v4.568).
            where: { clubId, status: { in: ['active', 'subscribed'] }, archivedAt: null, tags: { has: tag } },
        });
    } else {
        contacts = await prisma.crmContact.findMany({
            where: { clubId, status: { in: ['active', 'subscribed'] }, archivedAt: null },
        });
    }
    // Email válido, no archivado, no dado de baja. Deduplica por email.
    const seen = new Set();
    return contacts.filter((c) => {
        if (c.archivedAt) return false;
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
        const clubId = await resolveClubId(req);
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
        const clubId = await resolveClubId(req);
        if (!clubId) return res.json({ count: 0 });
        const { audience = 'all', listId, segmentTag, listIds } = req.query;
        const listIdsArr = typeof listIds === 'string' ? listIds.split(',').filter(Boolean) : (Array.isArray(listIds) ? listIds : []);
        const recipients = await resolveRecipients(clubId, audience, listId || null, segmentTag || null, listIdsArr);
        res.json({ count: recipients.length });
    } catch (error) {
        console.error('[emailMarketing] previewAudience:', error);
        res.status(500).json({ error: 'Error al calcular la audiencia' });
    }
};

// GET /:id
export const getCampaign = async (req, res) => {
    try {
        const clubId = await resolveClubId(req);
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
        const clubId = await resolveClubId(req);
        if (!clubId) return res.status(400).json({ error: 'No hay un sitio asociado a esta campaña' });
        const { name, subject, fromName, preheader, content, design, audience, listId, listIds, segmentTag,
            abEnabled, variantSubject, variantPreheader, variantContent, abSamplePct, abWindowHours, abMetric } = req.body;
        if (!name || !subject || !content) {
            return res.status(400).json({ error: 'Nombre, asunto y contenido son obligatorios' });
        }
        const aud = ['list', 'tag'].includes(audience) ? audience : 'all';
        const listIdsClean = aud === 'list'
            ? [...new Set([...(Array.isArray(listIds) ? listIds : []), ...(listId ? [listId] : [])].filter(Boolean))]
            : [];
        const ab = !!abEnabled;
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
                listId: aud === 'list' ? (listIdsClean[0] || null) : null,
                listIds: listIdsClean,
                segmentTag: aud === 'tag' ? (segmentTag || null) : null,
                abEnabled: ab,
                variantSubject: ab ? (variantSubject || null) : null,
                variantPreheader: ab ? (variantPreheader || null) : null,
                variantContent: ab ? (variantContent || null) : null,
                abSamplePct: ab ? (Number(abSamplePct) || 30) : null,
                abWindowHours: ab ? (Number(abWindowHours) || 4) : null,
                abMetric: ab ? (abMetric === 'clicks' ? 'clicks' : 'opens') : null,
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
        const clubId = await resolveClubId(req);
        const existing = await prisma.emailCampaign.findUnique({ where: { id: req.params.id } });
        if (!existing || existing.clubId !== clubId) {
            return res.status(404).json({ error: 'Campaña no encontrada' });
        }
        if (!['draft', 'scheduled', 'failed'].includes(existing.status)) {
            return res.status(400).json({ error: 'Solo se pueden editar campañas en borrador o programadas' });
        }
        const { name, subject, fromName, preheader, content, design, audience, listId, listIds, segmentTag,
            abEnabled, variantSubject, variantPreheader, variantContent, abSamplePct, abWindowHours, abMetric } = req.body;
        const aud = audience !== undefined ? (['list', 'tag'].includes(audience) ? audience : 'all') : undefined;
        const listIdsClean = aud === 'list'
            ? [...new Set([...(Array.isArray(listIds) ? listIds : []), ...(listId ? [listId] : [])].filter(Boolean))]
            : [];
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
                ...(aud !== undefined && { listId: aud === 'list' ? (listIdsClean[0] || null) : null }),
                ...(aud !== undefined && { listIds: listIdsClean }),
                ...(aud !== undefined && { segmentTag: aud === 'tag' ? (segmentTag || null) : null }),
                ...(abEnabled !== undefined && {
                    abEnabled: !!abEnabled,
                    variantSubject: abEnabled ? (variantSubject || null) : null,
                    variantPreheader: abEnabled ? (variantPreheader || null) : null,
                    variantContent: abEnabled ? (variantContent || null) : null,
                    abSamplePct: abEnabled ? (Number(abSamplePct) || 30) : null,
                    abWindowHours: abEnabled ? (Number(abWindowHours) || 4) : null,
                    abMetric: abEnabled ? (abMetric === 'clicks' ? 'clicks' : 'opens') : null,
                }),
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
        const clubId = await resolveClubId(req);
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

const buildEmailHtml = (contentHtml, preheaderText, rid, contact, baseUrl) => {
    const unsubscribeUrl = `${baseUrl}/api/public/unsubscribe?cid=${contact.id}`;
    const preferencesUrl = `${baseUrl}/api/public/preferences?cid=${contact.id}`;
    const trackedContent = wrapLinks(contentHtml, rid, baseUrl);
    const pixel = `<img src="${baseUrl}/api/public/em/o/${rid}" width="1" height="1" alt="" style="display:none">`;
    const preheader = preheaderText
        ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${preheaderText}</div>`
        : '';
    const footer = `
        <div style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:12px;color:#9ca3af;text-align:center;font-family:Arial,sans-serif">
            <p>Recibes este correo porque estás en la base de contactos de este sitio.</p>
            <p><a href="${preferencesUrl}" style="color:#9ca3af;text-decoration:underline">Gestionar preferencias</a> · <a href="${unsubscribeUrl}" style="color:#9ca3af;text-decoration:underline">Cancelar suscripción</a></p>
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

// Envía un asunto/contenido concreto a una lista de contactos, registrando un
// EmailCampaignRecipient por cada uno (con la variante indicada). Reutilizado por el
// envío normal, la fase de prueba A/B y el envío del ganador.
const sendToContacts = async ({ clubId, campaignId, contacts, subject, content, preheader, variant, baseUrl, userId }) => {
    let sent = 0;
    let failed = 0;
    const rows = [];
    for (const contact of contacts) {
        const rid = randomUUID();
        const html = buildEmailHtml(content, preheader, rid, contact, baseUrl);
        const result = await EmailService.sendEmail({
            clubId, to: contact.email.trim(), subject, html, userId: userId || null,
        });
        const ok = !!result?.success;
        if (ok) sent += 1; else failed += 1;
        rows.push({
            id: rid, campaignId, clubId, contactId: contact.id,
            email: contact.email.trim(), status: ok ? 'sent' : 'failed', variant: variant || null,
        });
    }
    if (rows.length) await prisma.emailCampaignRecipient.createMany({ data: rows, skipDuplicates: true });
    return { sent, failed };
};

// Despacho real de una campaña (compartido por el envío manual y el cron de programados).
// Lanza un Error si no hay destinatarios; el llamador decide cómo reportarlo.
const dispatchCampaign = async ({ campaign, baseUrl, userId }) => {
    const clubId = campaign.clubId;
    const recipients = await resolveRecipients(clubId, campaign.audience, campaign.listId, campaign.segmentTag, campaign.listIds);
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

    const { sent, failed } = await sendToContacts({
        clubId, campaignId: campaign.id, contacts: batch,
        subject: campaign.subject, content: campaign.content, preheader: campaign.preheader,
        variant: null, baseUrl, userId,
    });

    const finalStatus = sent > 0 ? 'sent' : 'failed';
    const updated = await prisma.emailCampaign.update({
        where: { id: campaign.id },
        data: { status: finalStatus, sentCount: sent, failedCount: failed, scheduledAt: null, sentAt: new Date() },
    });

    return { campaign: updated, sent, failed, skipped: recipients.length - batch.length };
};

// Audiencia mínima para poder hacer una prueba A/B (al menos 2 por variante).
const AB_MIN_AUDIENCE = 4;

// Fase de prueba A/B: envía la variante A y la variante B a una muestra dividida.
// El ganador se decide y se envía al resto más tarde, vía processAbTests (cron).
const dispatchAbTest = async ({ campaign, baseUrl, userId }) => {
    const clubId = campaign.clubId;
    const recipients = await resolveRecipients(clubId, campaign.audience, campaign.listId, campaign.segmentTag, campaign.listIds);
    if (recipients.length < AB_MIN_AUDIENCE) {
        const err = new Error(`La audiencia (${recipients.length}) es muy pequeña para una prueba A/B (mínimo ${AB_MIN_AUDIENCE} contactos).`);
        err.code = 'AB_TOO_SMALL';
        throw err;
    }
    const pct = Math.min(90, Math.max(10, campaign.abSamplePct || 30));
    let sampleSize = Math.floor((recipients.length * pct) / 100);
    if (sampleSize < 2) sampleSize = 2;
    if (sampleSize % 2 !== 0) sampleSize -= 1;              // par, para dividir en dos mitades
    sampleSize = Math.min(sampleSize, MAX_RECIPIENTS_PER_SEND);
    const sample = recipients.slice(0, sampleSize);
    const half = sampleSize / 2;
    const groupA = sample.slice(0, half);
    const groupB = sample.slice(half);

    await prisma.emailCampaignRecipient.deleteMany({ where: { campaignId: campaign.id } });
    await prisma.emailCampaign.update({
        where: { id: campaign.id },
        data: {
            status: 'sending', abPhase: 'testing', abTestStartedAt: new Date(), abWinner: null,
            totalRecipients: recipients.length, openCount: 0, clickCount: 0, scheduledAt: null,
        },
    });

    const rA = await sendToContacts({
        clubId, campaignId: campaign.id, contacts: groupA,
        subject: campaign.subject, content: campaign.content, preheader: campaign.preheader,
        variant: 'A', baseUrl, userId,
    });
    const rB = await sendToContacts({
        clubId, campaignId: campaign.id, contacts: groupB,
        subject: campaign.variantSubject || campaign.subject,
        content: campaign.variantContent || campaign.content,
        preheader: campaign.variantPreheader || campaign.preheader,
        variant: 'B', baseUrl, userId,
    });

    const sent = rA.sent + rB.sent;
    const failed = rA.failed + rB.failed;
    const updated = await prisma.emailCampaign.update({
        where: { id: campaign.id },
        data: { sentCount: sent, failedCount: failed },
    });
    return { campaign: updated, phase: 'testing', sent, failed, aSent: rA.sent, bSent: rB.sent, sampleSize, remainder: recipients.length - sampleSize };
};

// Cron: decide el ganador de las pruebas A/B cuya ventana ya venció y envía la
// variante ganadora al resto de la audiencia (excluyendo a quienes ya recibieron la muestra).
export const processAbTests = async ({ baseUrl, now = new Date() } = {}) => {
    const testing = await prisma.emailCampaign.findMany({
        where: { abEnabled: true, abPhase: 'testing', abTestStartedAt: { not: null } },
        take: 10,
    });
    let decided = 0;
    let remainderSent = 0;
    for (const campaign of testing) {
        const windowMs = (campaign.abWindowHours || 4) * 3600000;
        if (new Date(campaign.abTestStartedAt).getTime() + windowMs > now.getTime()) continue; // ventana aún no vence
        try {
            const stat = { A: { sent: 0, opens: 0, clicks: 0 }, B: { sent: 0, opens: 0, clicks: 0 } };
            const r = await db.query(
                `SELECT variant,
                    COUNT(*) FILTER (WHERE status='sent')::int AS sent,
                    COUNT(*) FILTER (WHERE "openedAt" IS NOT NULL)::int AS opens,
                    COUNT(*) FILTER (WHERE "clickedAt" IS NOT NULL)::int AS clicks
                 FROM "EmailCampaignRecipient"
                 WHERE "campaignId" = $1 AND variant IN ('A','B')
                 GROUP BY variant`,
                [campaign.id]
            );
            for (const row of r.rows) stat[row.variant] = { sent: row.sent, opens: row.opens, clicks: row.clicks };
            const metric = campaign.abMetric === 'clicks' ? 'clicks' : 'opens';
            const rateA = stat.A.sent ? stat.A[metric] / stat.A.sent : 0;
            const rateB = stat.B.sent ? stat.B[metric] / stat.B.sent : 0;
            const winner = rateB > rateA ? 'B' : 'A';

            // Resto de la audiencia: los que aún no recibieron la muestra.
            const all = await resolveRecipients(campaign.clubId, campaign.audience, campaign.listId, campaign.segmentTag, campaign.listIds);
            const already = await prisma.emailCampaignRecipient.findMany({ where: { campaignId: campaign.id }, select: { email: true } });
            const sentSet = new Set(already.map((a) => a.email.trim().toLowerCase()));
            const remainder = all
                .filter((c) => !sentSet.has(c.email.trim().toLowerCase()))
                .slice(0, MAX_RECIPIENTS_PER_SEND);

            const subject = winner === 'B' ? (campaign.variantSubject || campaign.subject) : campaign.subject;
            const content = winner === 'B' ? (campaign.variantContent || campaign.content) : campaign.content;
            const preheader = winner === 'B' ? (campaign.variantPreheader || campaign.preheader) : campaign.preheader;

            let res = { sent: 0, failed: 0 };
            if (remainder.length) {
                res = await sendToContacts({
                    clubId: campaign.clubId, campaignId: campaign.id, contacts: remainder,
                    subject, content, preheader, variant: 'W', baseUrl, userId: campaign.createdById,
                });
            }

            await prisma.emailCampaign.update({
                where: { id: campaign.id },
                data: {
                    abPhase: 'completed', abWinner: winner, status: 'sent', sentAt: new Date(),
                    sentCount: { increment: res.sent }, failedCount: { increment: res.failed },
                },
            });
            decided += 1;
            remainderSent += res.sent;
        } catch (error) {
            console.error(`[emailMarketing] A/B decide failed ${campaign.id}:`, error.message);
        }
    }
    return { evaluated: testing.length, decided, remainderSent };
};

// POST /:id/send — envío inmediato de la campaña
export const sendCampaign = async (req, res) => {
    try {
        const clubId = await resolveClubId(req);
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
        // Campaña con prueba A/B: dispara la fase de prueba (muestra dividida). El cron
        // decidirá el ganador y enviará al resto cuando venza la ventana.
        if (campaign.abEnabled && campaign.abPhase !== 'completed') {
            const abResult = await dispatchAbTest({ campaign, baseUrl, userId: req.user?.id });
            return res.json(abResult);
        }
        const result = await dispatchCampaign({ campaign, baseUrl, userId: req.user?.id });
        res.json(result);
    } catch (error) {
        if (error.code === 'NO_RECIPIENTS' || error.code === 'AB_TOO_SMALL') {
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
        const clubId = await resolveClubId(req);
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
        const clubId = await resolveClubId(req);
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
        const clubId = await resolveClubId(req);
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
            if (campaign.abEnabled && campaign.abPhase !== 'completed') {
                await dispatchAbTest({ campaign, baseUrl, userId: campaign.createdById });
            } else {
                await dispatchCampaign({ campaign, baseUrl, userId: campaign.createdById });
            }
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
        const clubId = await resolveClubId(req);
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

        // Desglose A/B (si aplica): métricas únicas por variante.
        let ab = null;
        if (campaign.abEnabled) {
            try {
                const r = await db.query(
                    `SELECT variant,
                        COUNT(*) FILTER (WHERE status='sent')::int AS sent,
                        COUNT(*) FILTER (WHERE "openedAt" IS NOT NULL)::int AS opens,
                        COUNT(*) FILTER (WHERE "clickedAt" IS NOT NULL)::int AS clicks
                     FROM "EmailCampaignRecipient" WHERE "campaignId" = $1 GROUP BY variant`,
                    [campaign.id]
                );
                const v = { A: { sent: 0, opens: 0, clicks: 0 }, B: { sent: 0, opens: 0, clicks: 0 }, W: { sent: 0, opens: 0, clicks: 0 } };
                for (const row of r.rows) { if (row.variant && v[row.variant]) v[row.variant] = { sent: row.sent, opens: row.opens, clicks: row.clicks }; }
                const rateOf = (x, m) => (x.sent ? Math.round((x[m] / x.sent) * 1000) / 10 : 0);
                ab = {
                    metric: campaign.abMetric === 'clicks' ? 'clicks' : 'opens',
                    winner: campaign.abWinner,
                    phase: campaign.abPhase,
                    windowHours: campaign.abWindowHours,
                    samplePct: campaign.abSamplePct,
                    subjectA: campaign.subject,
                    subjectB: campaign.variantSubject || campaign.subject,
                    variants: {
                        A: { ...v.A, openRate: rateOf(v.A, 'opens'), clickRate: rateOf(v.A, 'clicks') },
                        B: { ...v.B, openRate: rateOf(v.B, 'opens'), clickRate: rateOf(v.B, 'clicks') },
                    },
                    winnerSend: { ...v.W },
                };
            } catch (e) { console.error('[emailMarketing] report ab:', e.message); }
        }

        res.json({
            campaign: { id: campaign.id, name: campaign.name, subject: campaign.subject, sentAt: campaign.sentAt, status: campaign.status },
            sent, failed,
            totalOpens: campaign.openCount,
            totalClicks: campaign.clickCount,
            uniqueOpens, uniqueClicks,
            openRate, clickRate,
            ab,
        });
    } catch (error) {
        console.error('[emailMarketing] getReport:', error);
        res.status(500).json({ error: 'Error al cargar el reporte' });
    }
};

// Ventana de atribución de conversiones (días desde el envío de la campaña).
const ATTRIBUTION_WINDOW_DAYS = 7;
// Estados de pedido que NO cuentan como conversión (no pagados).
const NON_PAID_STATUSES = "'pending','cancelled','canceled','failed','expired','refunded','draft'";

// Conversiones/ingresos atribuidos a una campaña: pedidos del ecommerce hechos por
// destinatarios de la campaña (match por email) dentro de la ventana de atribución.
export const getCampaignConversions = async (campaign) => {
    const result = { count: 0, revenue: 0, currency: 'USD', windowDays: ATTRIBUTION_WINDOW_DAYS };
    if (!campaign?.sentAt) return result;
    try {
        const recips = await prisma.emailCampaignRecipient.findMany({
            where: { campaignId: campaign.id, status: 'sent' }, select: { email: true },
        });
        const emails = [...new Set(recips.map((r) => (r.email || '').trim().toLowerCase()).filter(Boolean))];
        if (!emails.length) return result;
        const from = new Date(campaign.sentAt);
        const to = new Date(from.getTime() + ATTRIBUTION_WINDOW_DAYS * 86400000);
        const r = await db.query(
            `SELECT COUNT(*)::int AS c, COALESCE(SUM(total),0)::float AS revenue, MAX(currency) AS currency
             FROM "Order"
             WHERE "clubId" = $1 AND lower("customerEmail") = ANY($2)
               AND "createdAt" >= $3 AND "createdAt" <= $4
               AND lower(status) NOT IN (${NON_PAID_STATUSES})`,
            [campaign.clubId, emails, from, to]
        );
        const row = r.rows[0] || {};
        result.count = row.c || 0;
        result.revenue = Math.round((row.revenue || 0) * 100) / 100;
        result.currency = row.currency || 'USD';
    } catch (e) {
        console.error('[emailMarketing] getCampaignConversions:', e.message);
    }
    return result;
};

// GET /:id/analytics — analítica avanzada de una campaña enviada.
// Embudo, horarios de mayor interacción, dispositivos, enlaces más pulsados y conversiones.
export const getAnalytics = async (req, res) => {
    try {
        const clubId = await resolveClubId(req);
        const campaign = await prisma.emailCampaign.findUnique({ where: { id: req.params.id } });
        if (!campaign || campaign.clubId !== clubId) {
            return res.status(404).json({ error: 'Campaña no encontrada' });
        }
        const id = campaign.id;
        const [sent, failed, uniqueOpens, uniqueClicks, hourOpensQ, hourClicksQ, devicesQ, topLinksQ] = await Promise.all([
            prisma.emailCampaignRecipient.count({ where: { campaignId: id, status: 'sent' } }),
            prisma.emailCampaignRecipient.count({ where: { campaignId: id, status: 'failed' } }),
            prisma.emailCampaignRecipient.count({ where: { campaignId: id, openedAt: { not: null } } }),
            prisma.emailCampaignRecipient.count({ where: { campaignId: id, clickedAt: { not: null } } }),
            db.query(`SELECT EXTRACT(HOUR FROM "openedAt")::int AS h, COUNT(*)::int AS c FROM "EmailCampaignRecipient" WHERE "campaignId"=$1 AND "openedAt" IS NOT NULL GROUP BY 1`, [id]).catch(() => ({ rows: [] })),
            db.query(`SELECT EXTRACT(HOUR FROM "clickedAt")::int AS h, COUNT(*)::int AS c FROM "EmailCampaignRecipient" WHERE "campaignId"=$1 AND "clickedAt" IS NOT NULL GROUP BY 1`, [id]).catch(() => ({ rows: [] })),
            db.query(`SELECT COALESCE(device,'desconocido') AS d, COUNT(*)::int AS c FROM "EmailCampaignRecipient" WHERE "campaignId"=$1 AND "openedAt" IS NOT NULL GROUP BY 1`, [id]).catch(() => ({ rows: [] })),
            db.query(`SELECT url, COUNT(*)::int AS c FROM "EmailLinkClick" WHERE "campaignId"=$1 GROUP BY url ORDER BY c DESC LIMIT 10`, [id]).catch(() => ({ rows: [] })),
        ]);

        const hourly = Array.from({ length: 24 }, (_, h) => ({ hour: h, opens: 0, clicks: 0 }));
        for (const row of hourOpensQ.rows) { const h = Number(row.h); if (h >= 0 && h < 24) hourly[h].opens = row.c; }
        for (const row of hourClicksQ.rows) { const h = Number(row.h); if (h >= 0 && h < 24) hourly[h].clicks = row.c; }

        const openRate = sent ? Math.round((uniqueOpens / sent) * 1000) / 10 : 0;
        const clickRate = sent ? Math.round((uniqueClicks / sent) * 1000) / 10 : 0;
        const ctor = uniqueOpens ? Math.round((uniqueClicks / uniqueOpens) * 1000) / 10 : 0; // click-to-open

        const conversions = await getCampaignConversions(campaign);
        const convRate = sent ? Math.round((conversions.count / sent) * 1000) / 10 : 0;

        res.json({
            campaign: { id: campaign.id, name: campaign.name, subject: campaign.subject, sentAt: campaign.sentAt, status: campaign.status },
            funnel: { sent, delivered: sent, uniqueOpens, uniqueClicks, openRate, clickRate, ctor },
            totals: { totalOpens: campaign.openCount, totalClicks: campaign.clickCount, failed },
            hourly,
            devices: devicesQ.rows.map((r) => ({ device: r.d, count: r.c })),
            topLinks: topLinksQ.rows.map((r) => ({ url: r.url, clicks: r.c })),
            conversions: { ...conversions, rate: convRate },
        });
    } catch (error) {
        console.error('[emailMarketing] getAnalytics:', error);
        res.status(500).json({ error: 'Error al cargar la analítica' });
    }
};

// GET /stats — métricas para el dashboard del módulo
export const getStats = async (req, res) => {
    try {
        const clubId = await resolveClubId(req);
        if (!clubId) return res.json({ campaigns: 0, emailsSent: 0, opens: 0, clicks: 0, contacts: 0, tags: 0, templates: 0 });
        const [campaigns, sentAgg, opens, clicks, contacts, templates, tagRows] = await Promise.all([
            prisma.emailCampaign.count({ where: { clubId } }),
            prisma.emailCampaign.aggregate({ where: { clubId }, _sum: { sentCount: true } }),
            prisma.emailCampaignRecipient.count({ where: { clubId, openedAt: { not: null } } }),
            prisma.emailCampaignRecipient.count({ where: { clubId, clickedAt: { not: null } } }),
            prisma.crmContact.count({ where: { clubId, status: { in: ['active', 'subscribed'] }, archivedAt: null, optedOutAt: null, email: { not: null } } }),
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
        const clubId = await resolveClubId(req);
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
            contactsTotal, subscribed, unsubscribed, noEmail, pending, withFailures,
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
        const clubId = await resolveClubId(req);
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

// Deriva un tipo de dispositivo grueso del user-agent (para analítica).
const deviceFromUA = (ua) => {
    const s = String(ua || '').toLowerCase();
    if (!s) return null;
    if (/ipad|tablet|playbook|silk|(android(?!.*mobile))/.test(s)) return 'tablet';
    if (/mobi|iphone|ipod|android.*mobile|windows phone/.test(s)) return 'mobile';
    return 'desktop';
};

// GET /api/public/em/o/:rid — apertura
export const trackOpen = async (req, res) => {
    try {
        const { rid } = req.params;
        const recipient = await prisma.emailCampaignRecipient.findUnique({ where: { id: rid } });
        if (recipient) {
            const device = recipient.device || deviceFromUA(req.headers['user-agent']);
            await prisma.emailCampaignRecipient.update({
                where: { id: rid },
                data: { openedAt: recipient.openedAt || new Date(), openCount: { increment: 1 }, device },
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
            // Registra el enlace pulsado (para "enlaces más pulsados").
            if (safeTarget) {
                try {
                    await prisma.emailLinkClick.create({ data: { campaignId: recipient.campaignId, clubId: recipient.clubId, url: safeTarget.slice(0, 500) } });
                } catch { /* noop */ }
            }
        }
    } catch (error) {
        console.error('[emailMarketing] trackClick:', error);
    }
    if (safeTarget) return res.redirect(safeTarget);
    res.status(400).send('Enlace inválido');
};
