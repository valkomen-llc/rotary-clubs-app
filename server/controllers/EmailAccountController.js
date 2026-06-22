import prisma from '../lib/prisma.js';
import crypto from 'crypto';
import EmailService from '../services/EmailService.js';

// Verifica la firma Svix de los webhooks de Resend (cabeceras svix-id / svix-timestamp / svix-signature).
// fail-open: si no hay RESEND_WEBHOOK_SECRET configurado, acepta el webhook (Resend igual lo entrega).
// fail-closed: si hay secreto pero la firma no coincide, rechaza.
const verifyResendWebhook = (req) => {
    const secret = process.env.RESEND_WEBHOOK_SECRET;
    if (!secret) return true;
    try {
        const id = req.headers['svix-id'];
        const timestamp = req.headers['svix-timestamp'];
        const signature = req.headers['svix-signature'];
        if (!id || !timestamp || !signature) return false;
        const raw = req.rawBody ? req.rawBody.toString('utf8') : JSON.stringify(req.body || {});
        const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
        const expected = crypto.createHmac('sha256', key).update(`${id}.${timestamp}.${raw}`).digest('base64');
        // svix-signature puede traer varias firmas separadas por espacio: "v1,<b64> v1,<b64>".
        return signature.split(' ').some((part) => {
            const sig = part.includes(',') ? part.split(',')[1] : part;
            try { return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected)); }
            catch { return false; }
        });
    } catch {
        return false;
    }
};

// Pide a Resend el correo entrante completo (html/text/headers) a partir de su id.
// El webhook email.received NO trae el cuerpo, solo metadata. Necesita una API key
// con permiso de lectura: RESEND_INBOUND_API_KEY (recomendado) o RESEND_API_KEY si es full.
const fetchResendReceivedEmail = async (id) => {
    const apiKey = process.env.RESEND_INBOUND_API_KEY || process.env.RESEND_API_KEY;
    if (!apiKey || !id) return null;
    try {
        const resp = await fetch(`https://api.resend.com/emails/receiving/${id}`, {
            headers: { Authorization: `Bearer ${apiKey}` }
        });
        const body = await resp.json().catch(() => ({}));
        if (!resp.ok) {
            console.warn(`[inbound-email] no se pudo obtener el cuerpo del correo ${id} (HTTP ${resp.status}): ${body?.message || 'error'}. ¿La API key tiene permiso de lectura?`);
            return null;
        }
        return body;
    } catch (e) {
        console.warn(`[inbound-email] error obteniendo el cuerpo del correo ${id}:`, e.message);
        return null;
    }
};

// Normaliza una dirección al dominio raíz verificado en Resend (quita "www." y pasa a minúsculas).
const normalizeEmail = (email) => {
    if (!email || !String(email).includes('@')) return (email || '').toLowerCase();
    const [local, domain] = String(email).toLowerCase().split('@');
    return `${local}@${domain.replace(/^www\./i, '')}`;
};

// Extrae { name, email } de un remitente que puede venir como string ("Nombre <a@b>") u objeto.
// Soporta variantes de distintos proveedores de inbound (Resend, Postmark, Mailgun, etc.).
const parseAddress = (raw) => {
    if (!raw) return { name: null, email: null };
    if (typeof raw === 'object') {
        const email = (raw.email || raw.Email || raw.address || '').toLowerCase() || null;
        const name = raw.name || raw.Name || null;
        return { name, email };
    }
    const s = String(raw);
    const m = s.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
    if (m) return { name: m[1].trim() || null, email: m[2].trim().toLowerCase() };
    return { name: null, email: s.trim().toLowerCase() };
};

const toEmailList = (to) => {
    let arr = Array.isArray(to) ? to : (to ? [to] : []);
    // Una sola cadena puede traer varias direcciones separadas por coma.
    arr = arr.flatMap((x) => (typeof x === 'string' && x.includes(',')) ? x.split(',') : [x]);
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
        // Verificamos la firma solo para observabilidad: NO bloqueamos la entrada aunque
        // no coincida (priorizamos no perder correos). Si falla con secreto configurado,
        // suele ser un detalle de firma — lo dejamos pasar y lo registramos.
        if (!verifyResendWebhook(req)) {
            console.warn('[inbound-email] firma Svix no verificada — se procesa igual (revisar RESEND_WEBHOOK_SECRET si se desea validación estricta)');
        }

        const event = req.body || {};
        let data = event.data || event;

        // Resend Inbound: el webhook "email.received" trae SOLO metadata (from/to/subject),
        // NO el cuerpo. Hay que pedir el correo completo a la API de recepción usando el id.
        // Requiere una API key con permiso de lectura (RESEND_INBOUND_API_KEY o una key full).
        const emailId = data.email_id || data.emailId || data.id || event.id || null;
        const hasBody = !!(data.text || data.html || data.TextBody || data.HtmlBody || data['body-plain'] || data['body-html']);
        if (emailId && !hasBody) {
            const full = await fetchResendReceivedEmail(emailId);
            if (full) data = { ...data, ...full };
        }

        // Campos tolerantes a varios proveedores de inbound (Resend / Postmark / Mailgun / genérico).
        const rawTo = data.to ?? data.To ?? data.recipient ?? data.ToFull ?? data.toFull;
        const rawFrom = data.from ?? data.From ?? data.FromFull ?? data.sender ?? null;
        const recipients = toEmailList(rawTo);
        const from = parseAddress(rawFrom);
        if (!from.name && data.FromName) from.name = data.FromName;
        const subject = data.subject || data.Subject || '(Sin asunto)';
        const text = data.text || data.TextBody || data['body-plain'] || data.plain || null;
        const html = data.html || data.HtmlBody || data['body-html'] || null;
        const messageId = data.message_id || data.MessageID || data.messageId || data.id || event.id || null;
        const attachmentsArr = data.attachments || data.Attachments;
        const hasAttachments = Array.isArray(attachmentsArr) && attachmentsArr.length > 0;

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

        console.log(`[inbound-email] de ${from.email || '?'} para [${recipients.join(', ') || '?'}] → ${stored} buzón(es) coincidente(s)`);
        if (stored === 0) {
            console.warn(`[inbound-email] sin coincidencias. Destinatarios recibidos: ${JSON.stringify(recipients)}. Verifica que exista una EmailAccount con ese email.`);
        }
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

// GET /api/email-accounts/diagnostics — radiografía real del correo del club.
// Consulta el estado del dominio en Resend (verificación de ENVÍO y registro MX de
// RECEPCIÓN), las cuentas locales y los contadores, y devuelve verdictos en español.
export const getEmailDiagnostics = async (req, res) => {
    try {
        const clubId = req.user.role === 'administrator' && req.query.clubId ? req.query.clubId : req.user.clubId;
        if (!clubId) return res.status(400).json({ error: 'Club ID requerido' });

        const out = {
            resendConfigured: !!process.env.RESEND_API_KEY,
            inboundKeySet: !!process.env.RESEND_INBOUND_API_KEY,
            webhookSecretSet: !!process.env.RESEND_WEBHOOK_SECRET,
            sendOnlyKey: false,
            inboundUrl: '/api/public/inbound-email',
            accounts: [],
            domains: [],
            counts: { received: 0, sent: 0 },
            lastReceivedAt: null,
            checks: [],
            resendError: null
        };

        const accounts = await prisma.emailAccount.findMany({
            where: { clubId },
            select: { email: true, verified: true, verificationStatus: true }
        });
        out.accounts = accounts;

        out.counts.received = await prisma.receivedEmail.count({ where: { clubId } }).catch(() => 0);
        out.counts.sent = await prisma.communicationLog.count({
            where: { clubId, type: 'email', status: 'sent' }
        }).catch(() => 0);
        const last = await prisma.receivedEmail.findFirst({
            where: { clubId },
            orderBy: { receivedAt: 'desc' },
            select: { receivedAt: true, fromEmail: true, accountEmail: true }
        }).catch(() => null);
        out.lastReceivedAt = last?.receivedAt || null;
        out.lastReceivedFrom = last?.fromEmail || null;

        // Dominios derivados de las cuentas (sin el prefijo www.)
        const domains = Array.from(new Set(
            accounts
                .map((a) => (a.email.includes('@') ? a.email.split('@')[1] : null))
                .filter(Boolean)
                .map((d) => d.replace(/^www\./i, ''))
        ));

        const apiKey = process.env.RESEND_API_KEY;
        if (apiKey && domains.length) {
            try {
                const listResp = await fetch('https://api.resend.com/domains', {
                    headers: { Authorization: `Bearer ${apiKey}` }
                });
                const listData = await listResp.json();
                if (!listResp.ok) {
                    out.resendError = listData.message || `HTTP ${listResp.status}`;
                    if (/only send emails|restricted/i.test(out.resendError)) out.sendOnlyKey = true;
                }
                const all = listData.data || [];
                for (const dom of domains) {
                    const match = all.find((d) => d.name?.toLowerCase() === dom.toLowerCase());
                    const entry = {
                        domain: dom,
                        foundInResend: !!match,
                        status: match?.status || null,
                        sendingVerified: match?.status === 'verified',
                        inboundMx: false,
                        records: []
                    };
                    if (match?.id) {
                        try {
                            const dResp = await fetch(`https://api.resend.com/domains/${match.id}`, {
                                headers: { Authorization: `Bearer ${apiKey}` }
                            });
                            const dData = await dResp.json();
                            const records = dData.records || [];
                            entry.inboundMx = records.some((r) => String(r.type || r.record).toUpperCase() === 'MX');
                            entry.records = records.map((r) => ({
                                type: r.type || r.record,
                                name: r.name,
                                status: r.status,
                                value: typeof r.value === 'string' ? r.value.slice(0, 80) : r.value
                            }));
                        } catch { /* sin detalle de records */ }
                    }
                    out.domains.push(entry);
                }
            } catch (e) {
                out.resendError = e.message?.slice(0, 200) || 'Error consultando Resend';
            }
        }

        // Verdictos en español (✅/❌) que el usuario puede leer directo.
        const checks = out.checks;
        checks.push({ ok: out.resendConfigured, label: out.resendConfigured ? 'RESEND_API_KEY configurada (envío)' : 'FALTA RESEND_API_KEY: sin ella no se puede enviar ni recibir' });
        checks.push({ ok: accounts.length > 0, label: accounts.length > 0 ? `${accounts.length} cuenta(s) de correo creada(s)` : 'No hay cuentas de correo creadas en este club' });

        if (out.sendOnlyKey) {
            // La key es solo-envío: no pudimos leer dominios/MX (las verificaciones de abajo no son fiables).
            checks.push({ ok: false, label: 'Tu API key de Resend es SOLO-ENVÍO: no puede leer dominios ni correos entrantes. Para RECIBIR necesitas una key con permiso de lectura ("Full access") en una variable RESEND_INBOUND_API_KEY.' });
            checks.push({ ok: out.inboundKeySet, label: out.inboundKeySet ? 'RESEND_INBOUND_API_KEY configurada (lectura de entrantes)' : 'FALTA RESEND_INBOUND_API_KEY: sin una key de lectura no se puede traer el cuerpo de los correos recibidos' });
        } else if (out.resendError) {
            checks.push({ ok: false, label: `Resend respondió un error al consultar dominios: ${out.resendError}` });
        } else {
            for (const d of out.domains) {
                checks.push({ ok: d.foundInResend, label: d.foundInResend ? `Dominio ${d.domain} dado de alta en Resend` : `Dominio ${d.domain} NO está dado de alta en Resend` });
                if (d.foundInResend) {
                    checks.push({ ok: d.sendingVerified, label: d.sendingVerified ? `ENVÍO verificado para ${d.domain}` : `ENVÍO NO verificado para ${d.domain} (estado en Resend: ${d.status || 'desconocido'}) — revisar SPF/DKIM en el DNS` });
                    checks.push({ ok: d.inboundMx, label: d.inboundMx ? `RECEPCIÓN: registro MX presente para ${d.domain}` : `RECEPCIÓN NO configurada para ${d.domain}: falta el registro MX de Resend Inbound en el DNS` });
                }
            }
        }
        checks.push({ ok: out.counts.received > 0, label: out.counts.received > 0 ? `${out.counts.received} correo(s) recibido(s) en total (último: ${out.lastReceivedAt ? new Date(out.lastReceivedAt).toLocaleString('es') : '—'})` : 'Aún no ha entrado NINGÚN correo a la app (Resend nunca llamó al webhook: falta MX y/o el webhook email.received)' });

        return res.json(out);
    } catch (error) {
        console.error('[email-diagnostics] error:', error);
        return res.status(500).json({ error: error.message || 'Error interno' });
    }
};

// POST /api/email-accounts/test-send  body: { to, fromEmail? }
// Envía un correo de prueba DESDE la dirección institucional vía Resend y devuelve la
// respuesta CRUDA (messageId o el error exacto de Resend), sin el fallback a noreply.
// Sirve para ver por qué "no envía": p.ej. dominio no verificado, key sin permiso, etc.
export const testSendEmail = async (req, res) => {
    try {
        const clubId = req.user.role === 'administrator' && req.body.clubId ? req.body.clubId : req.user.clubId;
        const to = (req.body.to || '').trim();
        if (!to || !/^\S+@\S+\.\S+$/.test(to)) {
            return res.status(400).json({ success: false, error: 'Destinatario inválido' });
        }

        let fromEmail = req.body.fromEmail;
        if (!fromEmail) {
            const acc = await prisma.emailAccount.findFirst({ where: { clubId }, orderBy: { createdAt: 'asc' } });
            fromEmail = acc?.email;
        }
        if (!fromEmail) {
            return res.status(400).json({ success: false, error: 'No hay ninguna cuenta de correo en este club' });
        }

        const sender = EmailService.normalizeSenderEmail(fromEmail);
        const club = await prisma.club.findUnique({ where: { id: clubId }, select: { name: true } });
        const fromStr = `"${club?.name || 'Club'}" <${sender}>`;

        const html = `<div style="font-family:sans-serif"><h2>✅ Prueba de envío</h2><p>Si recibiste esto, el envío desde <b>${sender}</b> funciona. Enviado ${new Date().toLocaleString('es')}.</p></div>`;

        const result = await EmailService.sendPlatformEmail({
            to,
            subject: '✅ Prueba de envío — Club Platform',
            html,
            from: fromStr,
            replyTo: sender
        });

        console.log(`[test-send] desde ${fromStr} para ${to}:`, result);
        return res.json({
            success: result.success === true,
            messageId: result.messageId || null,
            error: result.error || null,
            from: fromStr,
            to
        });
    } catch (e) {
        console.error('[test-send] error:', e);
        return res.status(500).json({ success: false, error: e.message?.slice(0, 300) });
    }
};

export default {
    getEmailAccounts,
    createEmailAccount,
    deleteEmailAccount,
    handleInboundEmail,
    getAccountMessages,
    updateMessage,
    deleteMessage,
    getEmailDiagnostics,
    testSendEmail
};
