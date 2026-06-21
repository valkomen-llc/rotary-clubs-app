import prisma from '../lib/prisma.js';

// Normaliza una dirección al dominio raíz verificado en Resend (quita "www." y pasa a minúsculas).
const normalizeEmail = (email) => {
    if (!email || !String(email).includes('@')) return (email || '').toLowerCase();
    const [local, domain] = String(email).toLowerCase().split('@');
    return `${local}@${domain.replace(/^www\./i, '')}`;
};

// Extrae { name, email } de un remitente que puede venir como string ("Nombre <a@b>") u objeto.
const parseAddress = (raw) => {
    if (!raw) return { name: null, email: null };
    if (typeof raw === 'object') {
        return { name: raw.name || null, email: (raw.email || '').toLowerCase() || null };
    }
    const s = String(raw);
    const m = s.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
    if (m) return { name: m[1].trim() || null, email: m[2].trim().toLowerCase() };
    return { name: null, email: s.trim().toLowerCase() };
};

const toEmailList = (to) => {
    const arr = Array.isArray(to) ? to : (to ? [to] : []);
    return arr.map((x) => parseAddress(x).email).filter(Boolean);
};

export const getEmailAccounts = async (req, res) => {
    try {
        const clubId = req.user.role === 'administrator' && req.query.clubId ? req.query.clubId : req.user.clubId;

        if (!clubId) {
            return res.status(400).json({ error: 'Club ID is required' });
        }

        const accounts = await prisma.emailAccount.findMany({
            where: { clubId },
            orderBy: { createdAt: 'asc' }
        });

        res.json(accounts);
    } catch (error) {
        console.error('Error fetching email accounts:', error);
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
};

export const createEmailAccount = async (req, res) => {
    try {
        const clubId = req.user.role === 'administrator' && req.body.clubId ? req.body.clubId : req.user.clubId;
        const { email, label, password, isPrimary, provider } = req.body;

        if (!email) {
            return res.status(400).json({ error: 'Email is required' });
        }

        const account = await prisma.emailAccount.create({
            data: {
                email,
                label,
                password, // Note: In a real system, this should be encrypted or handled by a mail provider API
                isPrimary: isPrimary || false,
                provider: provider || 'platform',
                clubId
            }
        });

        res.status(201).json(account);
    } catch (error) {
        console.error('Error creating email account:', error);
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
};

export const deleteEmailAccount = async (req, res) => {
    try {
        const { id } = req.params;
        const clubId = req.user.clubId;

        const existing = await prisma.emailAccount.findUnique({ where: { id } });
        
        if (!existing) {
            return res.status(404).json({ error: 'Account not found' });
        }

        if (existing.clubId !== clubId && req.user.role !== 'administrator') {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        await prisma.emailAccount.delete({ where: { id } });
        res.json({ message: 'Account deleted' });
    } catch (error) {
        console.error('Error deleting email account:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// POST /api/public/inbound-email — webhook entrante de Resend Inbound.
// Recibe los correos dirigidos a los buzones del club y los guarda en ReceivedEmail.
export const handleInboundEmail = async (req, res) => {
    try {
        if (process.env.RESEND_WEBHOOK_SECRET) {
            const provided = req.query.secret || req.headers['x-webhook-secret'];
            if (provided !== process.env.RESEND_WEBHOOK_SECRET) {
                return res.status(401).json({ error: 'Unauthorized webhook' });
            }
        }

        const event = req.body || {};
        const data = event.data || event;

        const recipients = toEmailList(data.to);
        const from = parseAddress(data.from);
        const subject = data.subject || '(Sin asunto)';
        const text = data.text || data.plain || null;
        const html = data.html || null;
        const messageId = data.message_id || data.messageId || data.id || event.id || null;
        const hasAttachments = Array.isArray(data.attachments) && data.attachments.length > 0;

        let stored = 0;
        for (const rcpt of recipients) {
            const apex = normalizeEmail(rcpt);
            const wwwVariant = apex.replace('@', '@www.');
            const candidates = Array.from(new Set([rcpt, apex, wwwVariant]));
            const account = await prisma.emailAccount.findFirst({
                where: { OR: candidates.map((e) => ({ email: { equals: e, mode: 'insensitive' } })) }
            });
            if (!account) continue;

            await prisma.receivedEmail.create({
                data: {
                    clubId: account.clubId,
                    accountEmail: apex,
                    fromName: from.name,
                    fromEmail: from.email,
                    toEmail: rcpt,
                    subject,
                    text,
                    html,
                    messageId,
                    hasAttachments
                }
            });
            stored++;
        }

        console.log(`[inbound-email] de ${from.email || '?'} → ${stored} buzón(es) coincidente(s)`);
        res.json({ ok: true, stored });
    } catch (error) {
        console.error('[inbound-email] error:', error);
        // Responder 200 para evitar reintentos en bucle de Resend.
        res.json({ ok: true });
    }
};

// GET /api/email-accounts/messages?account=<email>&folder=inbox — bandeja real del buzón.
export const getAccountMessages = async (req, res) => {
    try {
        const clubId = req.user.role === 'administrator' && req.query.clubId ? req.query.clubId : req.user.clubId;
        if (!clubId) return res.status(400).json({ error: 'Club ID is required' });

        const folder = req.query.folder || 'inbox';
        const where = { clubId };
        if (req.query.account) where.accountEmail = normalizeEmail(req.query.account);
        if (folder === 'starred') where.starred = true;
        else where.folder = folder;

        const messages = await prisma.receivedEmail.findMany({
            where,
            orderBy: { receivedAt: 'desc' },
            take: 200
        });
        res.json(messages);
    } catch (error) {
        console.error('Error fetching messages:', error);
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
};

// PATCH /api/email-accounts/messages/:id — marcar leído / destacado / mover a papelera.
export const updateMessage = async (req, res) => {
    try {
        const { id } = req.params;
        const clubId = req.user.clubId;
        const existing = await prisma.receivedEmail.findUnique({ where: { id } });
        if (!existing) return res.status(404).json({ error: 'Message not found' });
        if (existing.clubId !== clubId && req.user.role !== 'administrator') {
            return res.status(403).json({ error: 'Unauthorized' });
        }
        const data = {};
        if (typeof req.body.read === 'boolean') data.read = req.body.read;
        if (typeof req.body.starred === 'boolean') data.starred = req.body.starred;
        if (typeof req.body.folder === 'string') data.folder = req.body.folder;
        const updated = await prisma.receivedEmail.update({ where: { id }, data });
        res.json(updated);
    } catch (error) {
        console.error('Error updating message:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// DELETE /api/email-accounts/messages/:id
export const deleteMessage = async (req, res) => {
    try {
        const { id } = req.params;
        const clubId = req.user.clubId;
        const existing = await prisma.receivedEmail.findUnique({ where: { id } });
        if (!existing) return res.status(404).json({ error: 'Message not found' });
        if (existing.clubId !== clubId && req.user.role !== 'administrator') {
            return res.status(403).json({ error: 'Unauthorized' });
        }
        await prisma.receivedEmail.delete({ where: { id } });
        res.json({ message: 'Message deleted' });
    } catch (error) {
        console.error('Error deleting message:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export default {
    getEmailAccounts,
    createEmailAccount,
    deleteEmailAccount,
    handleInboundEmail,
    getAccountMessages,
    updateMessage,
    deleteMessage
};
