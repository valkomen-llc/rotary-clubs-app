import prisma from '../lib/prisma.js';
import crypto from 'crypto';
import { resolveMx } from 'node:dns/promises';
import { s3 } from '../lib/storage.js';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import EmailService from '../services/EmailService.js';
import {
    mailboxScopeFor, canManageMailAccounts, isPlatformOperator,
} from '../lib/institutionalAccess.js';
import { attachInstitutionalProfile } from '../middleware/institutionalGuard.js';
import { detachAccount, profilesByAccount, audit } from '../lib/institutionalStore.js';
import {
    mailboxPatch, validateNewPassword, bulkPlan, describeBulk, BULK_MAX,
} from '../lib/accountActions.js';

const ATT_BUCKET = process.env.AWS_BUCKET_NAME || 'rotary-platform-assets';
const ATT_REGION = process.env.AWS_REGION || 'us-east-1';

// Pide a Resend la lista de adjuntos de un correo entrante. Es el ÚNICO lugar de donde
// sale el contenido: ni el webhook email.received ni GET /emails/receiving/:id traen los
// bytes — solo metadata (filename/content_type)—. Cada entrada de esta lista llega con un
// download_url FIRMADO que expira (~1 h), así que se descarga en el momento y se copia a S3.
const fetchResendAttachmentList = async (emailId) => {
    const apiKey = process.env.RESEND_INBOUND_API_KEY || process.env.RESEND_API_KEY;
    if (!apiKey || !emailId) return [];
    try {
        const resp = await fetch(`https://api.resend.com/emails/receiving/${emailId}/attachments`, {
            headers: { Authorization: `Bearer ${apiKey}` }
        });
        const body = await resp.json().catch(() => ({}));
        if (!resp.ok) {
            console.warn(`[inbound-email] no se pudo listar los adjuntos del correo ${emailId} (HTTP ${resp.status}): ${body?.message || 'error'}. ¿La API key tiene permiso de lectura?`);
            return [];
        }
        return Array.isArray(body?.data) ? body.data : (Array.isArray(body) ? body : []);
    } catch (e) {
        console.warn(`[inbound-email] error listando los adjuntos del correo ${emailId}:`, e.message);
        return [];
    }
};

// Descarga el contenido de un adjunto. El download_url de Resend viene FIRMADO: mandarle
// además una cabecera Authorization rompe la firma en S3 ("only one auth mechanism
// allowed"), así que el Bearer solo se manda cuando la URL es de la propia API de Resend.
const downloadAttachment = async (url, apiKey) => {
    const isResendApi = /^https:\/\/api\.resend\.com\//i.test(url);
    const resp = await fetch(url, isResendApi && apiKey ? { headers: { Authorization: `Bearer ${apiKey}` } } : undefined);
    if (!resp.ok) throw new Error(`HTTP ${resp.status} al descargar`);
    return Buffer.from(await resp.arrayBuffer());
};

// Sube a S3 los adjuntos de un correo entrante y devuelve metadata + URL pública.
// Tolerante a las formas en que llega el contenido: base64 inline (content/data),
// una download_url ya presente, o —el caso real de Resend Inbound— SOLO metadata,
// que obliga a pedir la lista firmada con fetchResendAttachmentList.
// Si no logra obtener el contenido, guarda al menos la metadata (url: null).
const storeInboundAttachments = async (emailId, rawList) => {
    if (!Array.isArray(rawList) || rawList.length === 0) return [];
    const apiKey = process.env.RESEND_INBOUND_API_KEY || process.env.RESEND_API_KEY;
    // La lista firmada se pide UNA sola vez, y solo si algún adjunto la necesita.
    let signedList = null;
    const signedFor = async (a, i) => {
        if (signedList === null) signedList = await fetchResendAttachmentList(emailId);
        if (!signedList.length) return null;
        const id = a.id || a.attachment_id || a.attachmentId || null;
        const byId = id ? signedList.find((s) => s.id === id) : null;
        if (byId) return byId;
        const name = a.filename || a.name || a.fileName || null;
        const byName = name ? signedList.filter((s) => (s.filename || s.name) === name) : [];
        if (byName.length === 1) return byName[0];
        return signedList[i] || null;
    };
    const out = [];
    for (let i = 0; i < rawList.length; i++) {
        const a = rawList[i] || {};
        const filename = a.filename || a.name || a.fileName || `adjunto-${i + 1}`;
        const contentType = a.content_type || a.contentType || a.type || 'application/octet-stream';
        let buffer = null;
        try {
            const b64 = a.content || a.data || (a.content && a.content.data);
            if (typeof b64 === 'string' && b64.length) {
                buffer = Buffer.from(b64, 'base64');
            }
            if (!buffer) {
                let url = a.download_url || a.downloadUrl || a.url || a.path || null;
                if (!url) {
                    const signed = await signedFor(a, i);
                    url = signed?.download_url || signed?.downloadUrl || null;
                }
                if (url) buffer = await downloadAttachment(url, apiKey);
            }
            if (buffer) {
                const safe = String(filename).replace(/[^a-zA-Z0-9.\-_]/g, '_');
                const key = `inbound-attachments/${emailId || 'na'}/${Date.now()}-${i}-${safe}`;
                await s3.send(new PutObjectCommand({ Bucket: ATT_BUCKET, Key: key, Body: buffer, ContentType: contentType }));
                const encodedKey = key.split('/').map(encodeURIComponent).join('/');
                out.push({ filename, contentType, size: buffer.length, url: `https://${ATT_BUCKET}.s3.${ATT_REGION}.amazonaws.com/${encodedKey}` });
                continue;
            }
            console.warn(`[inbound-email] adjunto "${filename}" sin contenido ni download_url (correo ${emailId || '?'}) — se guarda solo la metadata`);
        } catch (e) {
            console.warn(`[inbound-email] no se pudo guardar el adjunto "${filename}":`, e.message);
        }
        out.push({ filename, contentType, size: a.size || null, url: null });
    }
    return out;
};

// Resuelve los registros MX REALES del DNS para un dominio (apex). Es la única forma
// fiable de saber si un dominio puede RECIBIR: el estado de "envío" en Resend usa un MX
// distinto (el de bounces en send.<dominio> → feedback-smtp.amazonses.com), que NO sirve
// para recibir. Devuelve [] si el apex no tiene MX (no puede recibir) o si falla la consulta.
const resolveApexMx = async (domain) => {
    try {
        const records = await resolveMx(domain);
        return (records || []).sort((a, b) => a.priority - b.priority);
    } catch {
        return [];
    }
};

// ¿Alguno de los MX apunta a la infraestructura de RECEPCIÓN de Resend?
// Resend Inbound corre sobre AWS SES, así que el MX de recepción apunta a
// inbound-smtp.<región>.amazonaws.com (NO contiene "resend"). OJO de no confundir con
// el MX de ENVÍO/bounces, que es feedback-smtp.<región>.amazonses.com.
const isResendInboundMx = (mxList) => (mxList || []).some((m) => /(^|\.)inbound-smtp\..*amazonaws\.com|resend/i.test(m.exchange || ''));

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

// ════════════════════════════════════════════════════════════════════
// EL ALCANCE DE UNA SESIÓN SOBRE LOS BUZONES (v4.932)
//
// ⚠️ Es la regla central del aislamiento y por eso vive en UNA función: quien
// tiene `secretaria@dominio.org` ve SU buzón y ninguno más. No se le esconden
// los otros en la pantalla —esconder un control no protege un endpoint de
// quien lo conoce (v4.868)—: el alcance entra en el `WHERE` de la consulta, así
// que para esa sesión los demás correos no existen.
//
// `mailboxScopeFor` devuelve `null` cuando NO hay restricción (administrador) y
// una lista de direcciones cuando sí. `[]` es distinto de `null`: significa
// «tiene restricción y no le corresponde ninguna cuenta», o sea que no ve nada
// — que es lo correcto para un rol institucional al que todavía no se le ató su
// buzón, y el lado seguro para equivocarse.
// ════════════════════════════════════════════════════════════════════
const resolveScope = async (req) => {
    await attachInstitutionalProfile(req);
    const clubId = isPlatformOperator(req.user) && (req.query?.clubId || req.body?.clubId)
        ? (req.query?.clubId || req.body?.clubId)
        : req.user.clubId;
    return { clubId, mailboxes: mailboxScopeFor(req.user) };
};

export const getEmailAccounts = async (req, res) => {
    try {
        const { clubId, mailboxes } = await resolveScope(req);

        if (!clubId) {
            return res.status(400).json({ error: 'Club ID is required' });
        }

        const where = { clubId };
        // El usuario institucional ve exactamente SU cuenta. Con la lista vacía
        // no ve ninguna, que es lo que corresponde a un acceso sin buzón atado.
        if (mailboxes !== null) where.email = { in: mailboxes };

        const accounts = await prisma.emailAccount.findMany({
            where,
            orderBy: { createdAt: 'asc' },
            // ⚠️ SIN LA CONTRASEÑA. Se devolvía la fila entera —`password`
            // incluida— a cualquier sesión del panel: quedaba a la vista en las
            // herramientas de desarrollo del navegador. Nadie la necesita acá:
            // el envío la resuelve el servidor.
            select: {
                id: true, email: true, label: true, isPrimary: true, provider: true,
                verified: true, verificationStatus: true, clubId: true,
                createdAt: true, updatedAt: true,
            },
        });

        // Quién administra las cuentas viaja en la respuesta para que la
        // pantalla no lo deduzca por su cuenta: con dos criterios, el panel
        // ofrecería una pestaña que el servidor rechaza.
        res.set('X-Mail-Admin', canManageMailAccounts(req.user) ? '1' : '0');
        res.json(accounts);
    } catch (error) {
        console.error('Error fetching email accounts:', error);
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
};

export const createEmailAccount = async (req, res) => {
    try {
        // ⚠️ CREAR UNA CUENTA ES ADMINISTRACIÓN. Hasta v4.931 bastaba con tener
        // sesión de panel; con el usuario institucional dentro, eso le dejaría
        // crear direcciones —y con ellas identidades— en el dominio del sitio.
        await attachInstitutionalProfile(req);
        if (!canManageMailAccounts(req.user)) {
            return res.status(403).json({ error: 'No tienes permiso para crear cuentas de correo.' });
        }
        const clubId = isPlatformOperator(req.user) && req.body.clubId ? req.body.clubId : req.user.clubId;
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

/**
 * PATCH /api/email-accounts/:id
 *
 * Edita una cuenta del sitio: su rótulo y la contraseña del BUZÓN.
 *
 * ⚠️ ES LA DEL BUZÓN, NO LA DEL PANEL. Ésta es la que se escribe en un cliente
 * de correo; la de acceso vive en `User.password` y se fija en
 * `POST /institutional/owners/:userId/password`. Confundirlas deja a alguien
 * fuera del panel o el correo sin entregar, en silencio.
 *
 * ⚠️ NO DEVUELVE LA CONTRASEÑA, ni la nueva ni la que había. Lo que contesta es
 * QUÉ campos se tocaron. La regla de v4.932 sigue entera: la columna existe
 * porque el proveedor la necesita, y nunca sale hacia el navegador.
 *
 * Lo que no esté en `MAILBOX_EDITABLE` no se puede ni expresar: llega, se
 * DESCARTA y se dice cuál. La dirección no se edita —es la llave por la que su
 * dueño encuentra su bandeja y por la que el proveedor entrega—.
 */
export const updateEmailAccount = async (req, res) => {
    try {
        await attachInstitutionalProfile(req);
        if (!canManageMailAccounts(req.user)) {
            return res.status(403).json({ error: 'No tienes permiso para editar cuentas de correo.' });
        }

        const { id } = req.params;
        const existing = await prisma.emailAccount.findUnique({ where: { id } });
        if (!existing) return res.status(404).json({ error: 'Esa cuenta no existe.' });
        if (existing.clubId !== req.user.clubId && !isPlatformOperator(req.user)) {
            // Para quien pregunta por una cuenta ajena, esa cuenta no existe:
            // un 403 confirmaría que sí, que es la mitad de lo que hace falta.
            return res.status(404).json({ error: 'Esa cuenta no existe.' });
        }

        const { patch, descartados, campos } = mailboxPatch(req.body);
        const avisos = [];

        if (patch.password !== undefined) {
            const v = validateNewPassword(req.body, { scope: 'mailbox', currentEmail: existing.email });
            if (!v.ok) return res.status(400).json({ error: v.errors[0], errors: v.errors });
            avisos.push(...v.warnings);
        }

        if (!campos.length) {
            return res.status(400).json({
                error: 'No mandaste ningún campo editable.',
                editable: ['label', 'password'],
                descartados,
            });
        }

        await prisma.emailAccount.update({ where: { id }, data: { ...patch, updatedAt: new Date() } });

        // La contraseña NO entra en el detalle de la auditoría —ni recortada—:
        // la bitácora sólo agrega y nunca guarda un secreto (v4.932).
        await audit('profile_updated', {
            clubId: existing.clubId, email: existing.email, req,
            actor: { kind: 'user', id: req.user?.id, label: req.user?.email },
            detail: `buzón ${existing.email}: ${campos.map(c => (c === 'password' ? 'contraseña del buzón' : 'rótulo')).join(', ')}`,
        });

        for (const d of descartados) avisos.push(`No se puede editar «${d}» desde acá.`);

        res.json({
            ok: true,
            account: { id: existing.id, email: existing.email, label: patch.label !== undefined ? patch.label : existing.label },
            changed: campos,
            warnings: avisos,
            message: campos.includes('password')
                ? 'La contraseña del buzón quedó actualizada. Quien lo use en un cliente de correo tendrá que volver a escribirla.'
                : 'La cuenta quedó actualizada.',
        });
    } catch (error) {
        console.error('Error updating email account:', error);
        res.status(500).json({ error: 'No pudimos actualizar la cuenta.' });
    }
};

/**
 * POST /api/email-accounts/bulk-delete
 *
 * ⚠️ NO ES ATÓMICO Y SE DICE. Cada cuenta se resuelve por su cuenta: si la
 * tercera falla, las dos primeras quedan eliminadas y el resultado NOMBRA
 * cuáles no entraron y por qué. Envolverlo en una transacción sería peor —un
 * fallo tiraría abajo borrados que sí ocurrieron— y un descarte silencioso
 * convierte «se eliminaron 5» en una afirmación falsa (v4.938, v4.886).
 *
 * ⚠️ LA CUENTA PRINCIPAL NO SE BORRA NI ACÁ, y la puerta está en el SERVIDOR:
 * una selección de «todas» la incluye siempre, y esconder su casilla no
 * protegería el endpoint de quien lo conoce (v4.868).
 */
export const bulkDeleteEmailAccounts = async (req, res) => {
    try {
        await attachInstitutionalProfile(req);
        if (!canManageMailAccounts(req.user)) {
            return res.status(403).json({ error: 'No tienes permiso para eliminar cuentas de correo.' });
        }

        const clubId = isPlatformOperator(req.user) && req.body?.clubId ? req.body.clubId : req.user.clubId;
        if (!clubId) return res.status(400).json({ error: 'No hay un sitio en el contexto de esta sesión.' });

        const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
        if (!ids.length) return res.status(400).json({ error: 'No marcaste ninguna cuenta.' });

        // El universo se lee ACOTADO al sitio: una cuenta de otro sitio no
        // aparece en la lista, así que el plan la descarta sin haberla mirado.
        const cuentas = await prisma.emailAccount.findMany({
            where: { clubId },
            select: { id: true, email: true, isPrimary: true, clubId: true },
        });

        const plan = bulkPlan(ids, cuentas, { clubId, actorMailbox: req.user?.mailbox || req.user?.email, action: 'delete' });
        if (plan.overLimit) {
            return res.status(400).json({ error: `Son demasiadas de una vez: el máximo es ${BULK_MAX}.` });
        }

        const done = [];
        const failed = [];
        for (const fila of plan.allowed) {
            try {
                // Igual que el borrado de a uno: se suelta el vínculo con su
                // dueño y el usuario conserva su acceso. Borrarlo dejaría sin
                // explicación los correos que envió (v4.932).
                await detachAccount(fila.id);
                await prisma.emailAccount.delete({ where: { id: fila.id } });
                done.push(fila);
                await audit('account_suspended', {
                    clubId, email: fila.email, req,
                    actor: { kind: 'user', id: req.user?.id, label: req.user?.email },
                    detail: `cuenta de correo eliminada en bloque (${fila.email})`,
                });
            } catch (e) {
                failed.push({ ...fila, reason: e?.message || 'error' });
            }
        }

        res.json({
            ok: failed.length === 0,
            done, skipped: plan.skipped, failed,
            message: describeBulk({ done, skipped: plan.skipped, failed }),
        });
    } catch (error) {
        console.error('Error bulk-deleting email accounts:', error);
        res.status(500).json({ error: 'No pudimos eliminar las cuentas.' });
    }
};

export const deleteEmailAccount = async (req, res) => {
    try {
        const { id } = req.params;
        const clubId = req.user.clubId;

        await attachInstitutionalProfile(req);
        if (!canManageMailAccounts(req.user)) {
            return res.status(403).json({ error: 'No tienes permiso para eliminar cuentas de correo.' });
        }

        const existing = await prisma.emailAccount.findUnique({ where: { id } });
        
        if (!existing) {
            return res.status(404).json({ error: 'Account not found' });
        }

        if (existing.clubId !== clubId && !isPlatformOperator(req.user)) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        // ⚠️ BORRAR LA CUENTA NO BORRA A SU DUEÑO. Se suelta el vínculo y el
        // usuario se queda con su acceso: borrarlo dejaría sin explicación los
        // correos que envió y los cambios que hizo, y nadie espera que
        // «eliminar cuenta de correo» dé de baja a una persona.
        await detachAccount(id);
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
        // Subimos los adjuntos a S3 una sola vez (mismos archivos para todos los buzones destino).
        const storedAttachments = hasAttachments ? await storeInboundAttachments(emailId, attachmentsArr) : [];

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
                    hasAttachments,
                    resendEmailId: emailId,
                    attachments: storedAttachments.length ? storedAttachments : undefined
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
        const { clubId, mailboxes } = await resolveScope(req);
        if (!clubId) return res.status(400).json({ error: 'Club ID is required' });

        const folder = req.query.folder || 'inbox';
        const where = { clubId };
        const pedida = req.query.account ? normalizeEmail(req.query.account) : null;

        if (mailboxes === null) {
            // Administrador: el selector de cuentas sigue funcionando igual que
            // siempre. Sin `?account=` ve el conjunto del sitio, como hasta acá.
            if (pedida) where.accountEmail = pedida;
        } else if (pedida && !mailboxes.includes(pedida)) {
            // Pidió un buzón que no es suyo. No es un 403 con detalle: se
            // responde vacío, porque confirmar que ese buzón existe ya es
            // filtrar que existe.
            return res.json([]);
        } else {
            // Su bandeja se abre sola en SU cuenta, sin que la pantalla tenga
            // que elegirla — y sobre todo sin poder cambiarla.
            where.accountEmail = { in: mailboxes };
        }
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
// ════════════════════════════════════════════════════════════════════
// ¿PUEDE ESTA SESIÓN TOCAR ESTE MENSAJE? (v4.932)
//
// El aislamiento por sitio ya estaba; lo que faltaba es el de BUZÓN. Sin esto,
// un usuario institucional que conociera el id de un mensaje podía marcarlo
// leído, destacarlo o mandarlo a la papelera aunque fuera de otra cuenta del
// mismo sitio — el listado no se lo muestra, pero el endpoint sí lo aceptaba.
//
// Devuelve el mismo 404 que un mensaje inexistente: un 403 confirmaría que ese
// id existe, que es la mitad de lo que hace falta para ir a buscarlo.
// ════════════════════════════════════════════════════════════════════
const findOwnedMessage = async (req, id) => {
    const { clubId, mailboxes } = await resolveScope(req);
    const existing = await prisma.receivedEmail.findUnique({ where: { id } });
    if (!existing) return null;
    if (existing.clubId !== clubId && !isPlatformOperator(req.user)) return null;
    if (mailboxes !== null && !mailboxes.includes(normalizeEmail(existing.accountEmail))) return null;
    return existing;
};

export const updateMessage = async (req, res) => {
    try {
        const { id } = req.params;
        const existing = await findOwnedMessage(req, id);
        if (!existing) return res.status(404).json({ error: 'Message not found' });
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

// POST /api/email-accounts/messages/:id/repair-attachments — recupera del proveedor los
// adjuntos que quedaron guardados sin URL (url: null). Hasta v4.779 el webhook intentaba
// leer el contenido del propio payload, pero Resend Inbound NUNCA lo manda ahí: hay que
// pedir la lista firmada de adjuntos. Este endpoint rehace ese trabajo para los correos
// que ya estaban en la base, usando el resendEmailId que la fila guarda desde siempre.
export const repairMessageAttachments = async (req, res) => {
    try {
        const { id } = req.params;
        const existing = await findOwnedMessage(req, id);
        if (!existing) return res.status(404).json({ error: 'Mensaje no encontrado' });

        const current = Array.isArray(existing.attachments) ? existing.attachments : [];
        if (current.length && current.every((a) => a && a.url)) {
            return res.json({ ok: true, repaired: 0, attachments: current, note: 'Los adjuntos ya estaban disponibles.' });
        }
        if (!existing.resendEmailId) {
            return res.status(409).json({ error: 'Este correo no guardó su id de Resend, así que los adjuntos no se pueden recuperar del proveedor.' });
        }

        // La fuente autoritativa es la lista firmada de Resend (trae download_url fresco).
        const signed = await fetchResendAttachmentList(existing.resendEmailId);
        const source = signed.length ? signed : current;
        if (!source.length) {
            return res.status(502).json({ error: 'Resend no devolvió adjuntos para este correo. Puede que su retención haya vencido o que la API key no tenga permiso de lectura (RESEND_INBOUND_API_KEY).' });
        }

        const stored = await storeInboundAttachments(existing.resendEmailId, source);
        const repaired = stored.filter((a) => a.url).length;
        if (!repaired) {
            return res.status(502).json({ error: 'No se pudo descargar ningún adjunto desde Resend. Revisa que RESEND_INBOUND_API_KEY tenga permiso de lectura y vuelve a intentar.' });
        }

        // El mismo correo entrante puede estar guardado en varios buzones del club:
        // se reparan TODAS sus filas, no solo la que se está mirando.
        await prisma.receivedEmail.updateMany({
            where: { resendEmailId: existing.resendEmailId, clubId: existing.clubId },
            data: { attachments: stored, hasAttachments: stored.length > 0 }
        });

        console.log(`[repair-attachments] correo ${existing.resendEmailId}: ${repaired}/${stored.length} adjunto(s) recuperado(s)`);
        return res.json({ ok: true, repaired, attachments: stored });
    } catch (error) {
        console.error('[repair-attachments] error:', error);
        return res.status(500).json({ error: error.message || 'Error interno' });
    }
};

// DELETE /api/email-accounts/messages/:id
export const deleteMessage = async (req, res) => {
    try {
        const { id } = req.params;
        const existing = await findOwnedMessage(req, id);
        if (!existing) return res.status(404).json({ error: 'Message not found' });
        await prisma.receivedEmail.delete({ where: { id } });
        res.json({ message: 'Message deleted' });
    } catch (error) {
        console.error('Error deleting message:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// URL pública absoluta del endpoint que recibe los correos entrantes desde Resend.
// El webhook de Resend exige una URL absoluta; usamos APP_URL (igual que el resto de
// integraciones) con fallback al host de producción.
const getInboundUrl = () => {
    const base = (process.env.APP_URL || 'https://app.clubplatform.org').replace(/\/+$/, '');
    return `${base}/api/public/inbound-email`;
};

// POST /api/email-accounts/provision-inbound — termina de configurar la RECEPCIÓN
// (las "bandejas") para TODOS los dominios conectados a Resend, no solo el del club actual.
//
// Hace tres cosas, todas idempotentes:
//   1. Webhook email.received: a nivel de CUENTA (un solo webhook cubre todos los dominios).
//      Si ya hay uno apuntando a /api/public/inbound-email lo deja como está; si no, lo crea
//      y devuelve el signing_secret (Resend solo lo muestra al crearlo) para fijar
//      RESEND_WEBHOOK_SECRET.
//   2. Buzón por defecto (contacto@<dominio>) para cada dominio verificado en Resend que
//      tenga club en el sistema y todavía no tenga ninguna cuenta — así el sitio ya tiene bandeja.
//   3. MX de recepción: lo REPORTA leyendo el registro exacto que Resend espera por dominio
//      (no escribimos DNS a ciegas: el valor lo define Resend y la zona puede no ser nuestra).
export const provisionInbound = async (req, res) => {
    try {
        // Configuración técnica del dominio y del proveedor: es
        // administración, y el pedido la nombra expresamente entre lo que un
        // usuario institucional NO puede ver.
        await attachInstitutionalProfile(req);
        if (!canManageMailAccounts(req.user)) {
            return res.status(403).json({ error: 'No tienes permiso para configurar la recepción del dominio.' });
        }
        if (req.user.role !== 'administrator' && req.user.role !== 'superadmin') {
            return res.status(403).json({ error: 'Solo un administrador puede configurar la recepción de correo.' });
        }

        const writeKey = process.env.RESEND_API_KEY;
        const readKey = process.env.RESEND_INBOUND_API_KEY || process.env.RESEND_API_KEY;
        if (!writeKey) {
            return res.status(400).json({ error: 'FALTA RESEND_API_KEY: es necesaria para crear el webhook de recepción en Resend.' });
        }

        const inboundUrl = getInboundUrl();

        const out = {
            inboundUrl,
            webhook: { action: 'none', endpoint: null, hasReceivedEvent: false, signingSecret: null, secretAlreadySet: !!process.env.RESEND_WEBHOOK_SECRET },
            domains: [],
            mailboxesCreated: [],
            steps: [],
            errors: []
        };

        // 1. WEBHOOK email.received (a nivel de cuenta) ----------------------------------
        try {
            const listResp = await fetch('https://api.resend.com/webhooks', {
                headers: { Authorization: `Bearer ${writeKey}` }
            });
            const listData = await listResp.json().catch(() => ({}));
            if (!listResp.ok) {
                throw new Error(listData?.message || `HTTP ${listResp.status} al listar webhooks`);
            }
            const hooks = listData.data || [];
            const normalizeUrl = (u) => (u || '').replace(/\/+$/, '');
            // Cualquier webhook que YA escuche email.received, sin importar a qué host apunta.
            const existing = hooks.find((h) => {
                const events = h.events || h.event_types || [];
                return Array.isArray(events) && events.some((ev) => String(ev).includes('email.received'));
            });
            const currentUrl = existing ? (existing.endpoint || existing.url || '') : '';

            if (existing && normalizeUrl(currentUrl) === normalizeUrl(inboundUrl)) {
                out.webhook.action = 'already_configured';
                out.webhook.endpoint = currentUrl;
                out.webhook.hasReceivedEvent = true;
                out.steps.push(`Webhook email.received ya apunta a la URL canónica → ${currentUrl}`);
            } else if (existing) {
                // Existe pero apunta a otro host (p.ej. el apex, que en Vercel redirige con 308
                // y hace que Resend reciba un 3xx y reintente sin entregar). Lo reapuntamos a la
                // URL canónica que no redirige.
                const id = existing.id || existing.webhook_id || existing.uuid;
                let patched = false;
                if (id) {
                    const upResp = await fetch(`https://api.resend.com/webhooks/${id}`, {
                        method: 'PATCH',
                        headers: { Authorization: `Bearer ${writeKey}`, 'Content-Type': 'application/json' },
                        body: JSON.stringify({ endpoint: inboundUrl, events: ['email.received'] })
                    });
                    patched = upResp.ok;
                    if (!upResp.ok) {
                        const b = await upResp.json().catch(() => ({}));
                        out.errors.push(`No se pudo actualizar la URL del webhook automáticamente (HTTP ${upResp.status} ${b?.message || ''}). Edítala a mano en Resend → Webhooks → ${inboundUrl}`);
                    }
                }
                out.webhook.action = patched ? 'updated' : 'needs_manual_fix';
                out.webhook.endpoint = patched ? inboundUrl : currentUrl;
                out.webhook.previousEndpoint = currentUrl;
                out.webhook.hasReceivedEvent = true;
                out.steps.push(patched
                    ? `Webhook email.received reapuntado: ${currentUrl} → ${inboundUrl} (la URL anterior redirigía con 308 y Resend nunca entregaba). Reenvía/replay los eventos fallidos en Resend para recuperar los correos ya recibidos.`
                    : `El webhook email.received apunta a ${currentUrl}, que redirige (308). Cámbialo a ${inboundUrl} en Resend → Webhooks.`);
            } else {
                const createResp = await fetch('https://api.resend.com/webhooks', {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${writeKey}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ endpoint: inboundUrl, events: ['email.received'] })
                });
                const created = await createResp.json().catch(() => ({}));
                if (!createResp.ok) {
                    throw new Error(created?.message || `HTTP ${createResp.status} al crear el webhook`);
                }
                const secret = created.signing_secret || created.data?.signing_secret || null;
                out.webhook.action = 'created';
                out.webhook.endpoint = inboundUrl;
                out.webhook.hasReceivedEvent = true;
                out.webhook.signingSecret = secret;
                out.steps.push(`Webhook email.received creado → ${inboundUrl}`);
                if (secret && !process.env.RESEND_WEBHOOK_SECRET) {
                    out.steps.push('Copia el signing_secret y configúralo como RESEND_WEBHOOK_SECRET para validar firmas (Resend solo lo muestra una vez).');
                }
            }
        } catch (e) {
            out.errors.push(`Webhook: ${e.message}`);
        }

        // 2. DOMINIOS CONECTADOS A RESEND + MX de recepción + buzón por defecto ----------
        const all = [];
        try {
            const domResp = await fetch('https://api.resend.com/domains', {
                headers: { Authorization: `Bearer ${readKey}` }
            });
            const domData = await domResp.json().catch(() => ({}));
            if (!domResp.ok) {
                throw new Error(domData?.message || `HTTP ${domResp.status} al listar dominios`);
            }
            all.push(...(domData.data || []));
        } catch (e) {
            out.errors.push(`Dominios: ${e.message}`);
        }

        for (const dom of all) {
            const name = (dom.name || '').toLowerCase();
            if (!name) continue;
            // MX REAL del apex en el DNS — única forma fiable de saber si puede RECIBIR.
            // (El MX de "envío" vive en send.<dominio> y apunta a feedback-smtp.amazonses.com:
            //  ese NO sirve para recibir y no aparece en una consulta MX del apex.)
            const liveMx = await resolveApexMx(name);
            const entry = {
                domain: name,
                sendingVerified: dom.status === 'verified',
                inboundMx: isResendInboundMx(liveMx),
                liveMx: liveMx.map((m) => `${m.priority} ${m.exchange}`),
                mailbox: null
            };

            if (entry.inboundMx) {
                out.steps.push(`RECEPCIÓN OK para ${name}: el apex apunta a Resend Inbound (${entry.liveMx.join(', ')}).`);
            } else if (entry.liveMx.length) {
                out.steps.push(`El apex ${name} tiene MX pero NO apunta a Resend Inbound (${entry.liveMx.join(', ')}). En Resend → Domains → ${name} activa "Receiving" y agrega/reemplaza por el MX que te muestre, con la prioridad más baja.`);
            } else {
                out.steps.push(`El apex ${name} NO tiene ningún MX en el DNS: no puede recibir. En Resend → Domains → ${name} activa "Receiving" y agrega a tu DNS el MX que te indique.`);
            }

            // 3. Buzón por defecto para dominios verificados que tengan club y sin cuentas.
            if (entry.sendingVerified) {
                const club = await prisma.club.findFirst({
                    where: { OR: [{ domain: { equals: name, mode: 'insensitive' } }, { domain: { equals: `www.${name}`, mode: 'insensitive' } }] },
                    select: { id: true, name: true }
                }).catch(() => null);
                if (club) {
                    const count = await prisma.emailAccount.count({ where: { clubId: club.id } }).catch(() => 0);
                    if (count === 0) {
                        const email = `contacto@${name}`;
                        try {
                            const acc = await prisma.emailAccount.create({
                                data: { email, label: 'Contacto', isPrimary: true, provider: 'platform', clubId: club.id }
                            });
                            entry.mailbox = { email: acc.email, created: true };
                            out.mailboxesCreated.push(email);
                            out.steps.push(`Buzón por defecto creado: ${email} (club "${club.name}")`);
                        } catch (e) {
                            // p.ej. el email ya existe (unique) — no es un fallo real.
                            entry.mailbox = { email, created: false, note: e.code === 'P2002' ? 'ya existía' : (e.message || 'no creado') };
                        }
                    } else {
                        entry.mailbox = { created: false, note: `${count} buzón(es) existente(s)` };
                    }
                }
            }

            out.domains.push(entry);
        }

        out.ok = out.errors.length === 0;
        console.log(`[provision-inbound] webhook=${out.webhook.action}, dominios=${out.domains.length}, buzones nuevos=${out.mailboxesCreated.length}, errores=${out.errors.length}`);
        return res.json(out);
    } catch (error) {
        console.error('[provision-inbound] error:', error);
        return res.status(500).json({ error: error.message || 'Error interno' });
    }
};

// ── BORRADORES ────────────────────────────────────────────────────────────────
// GET /api/email-accounts/drafts — lista los borradores del club.
export const listDrafts = async (req, res) => {
    try {
        const { clubId, mailboxes } = await resolveScope(req);
        if (!clubId) return res.status(400).json({ error: 'Club ID requerido' });
        const where = { clubId };
        // Un borrador lleva adentro lo que alguien estaba escribiendo: es tan
        // suyo como el mensaje recibido. El usuario institucional ve los de SU
        // cuenta; los que quedaron sin remitente (`fromEmail` en NULL) no se le
        // muestran — sin saber de quién son, el lado seguro es no enseñarlos.
        if (mailboxes !== null) where.fromEmail = { in: mailboxes };
        const drafts = await prisma.emailDraft.findMany({
            where,
            orderBy: { updatedAt: 'desc' },
            take: 100
        });
        res.json(drafts);
    } catch (error) {
        console.error('Error listando borradores:', error);
        res.status(500).json({ error: error.message || 'Error interno' });
    }
};

// POST /api/email-accounts/drafts — crea o actualiza un borrador (upsert por id).
export const saveDraft = async (req, res) => {
    try {
        const clubId = req.user.role === 'administrator' && req.body.clubId ? req.body.clubId : req.user.clubId;
        if (!clubId) return res.status(400).json({ error: 'Club ID requerido' });
        const { id, fromEmail, to, cc, subject, html, attachments } = req.body;
        const data = {
            fromEmail: fromEmail || null,
            toEmail: to || null,
            cc: cc || null,
            subject: subject || null,
            html: html || null,
            attachments: Array.isArray(attachments) && attachments.length ? attachments : undefined
        };

        let draft;
        if (id) {
            const existing = await prisma.emailDraft.findUnique({ where: { id } });
            if (!existing || (existing.clubId !== clubId && req.user.role !== 'administrator')) {
                return res.status(404).json({ error: 'Borrador no encontrado' });
            }
            draft = await prisma.emailDraft.update({ where: { id }, data });
        } else {
            draft = await prisma.emailDraft.create({ data: { ...data, clubId } });
        }
        res.json(draft);
    } catch (error) {
        console.error('Error guardando borrador:', error);
        res.status(500).json({ error: error.message || 'Error interno' });
    }
};

// DELETE /api/email-accounts/drafts/:id
export const deleteDraft = async (req, res) => {
    try {
        const { id } = req.params;
        const { clubId, mailboxes } = await resolveScope(req);
        const existing = await prisma.emailDraft.findUnique({ where: { id } });
        if (!existing) return res.status(404).json({ error: 'Borrador no encontrado' });
        if (existing.clubId !== clubId && !isPlatformOperator(req.user)) {
            return res.status(404).json({ error: 'Borrador no encontrado' });
        }
        // Mismo criterio que un mensaje: el 404 no confirma que ese id exista.
        if (mailboxes !== null && !mailboxes.includes(normalizeEmail(existing.fromEmail))) {
            return res.status(404).json({ error: 'Borrador no encontrado' });
        }
        await prisma.emailDraft.delete({ where: { id } });
        res.json({ message: 'Borrador eliminado' });
    } catch (error) {
        console.error('Error eliminando borrador:', error);
        res.status(500).json({ error: error.message || 'Error interno' });
    }
};

// GET /api/email-accounts/diagnostics — radiografía real del correo del club.
// Consulta el estado del dominio en Resend (verificación de ENVÍO y registro MX de
// RECEPCIÓN), las cuentas locales y los contadores, y devuelve verdictos en español.
export const getEmailDiagnostics = async (req, res) => {
    try {
        // Configuración técnica del dominio y del proveedor: es
        // administración, y el pedido la nombra expresamente entre lo que un
        // usuario institucional NO puede ver.
        await attachInstitutionalProfile(req);
        if (!canManageMailAccounts(req.user)) {
            return res.status(403).json({ error: 'No tienes permiso para ver la configuración técnica del correo.' });
        }
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

        // Para LEER (dominios, registros MX, webhooks) usamos la key de lectura si existe.
        // La key de solo-envío no puede leer y devolvería "restricted".
        const readKey = process.env.RESEND_INBOUND_API_KEY || process.env.RESEND_API_KEY;
        out.webhook = { checked: false, hasReceivedEvent: false, endpoints: [] };

        if (readKey && domains.length) {
            try {
                const listResp = await fetch('https://api.resend.com/domains', {
                    headers: { Authorization: `Bearer ${readKey}` }
                });
                const listData = await listResp.json();
                if (!listResp.ok) {
                    out.resendError = listData.message || `HTTP ${listResp.status}`;
                    if (/only send emails|restricted/i.test(out.resendError)) out.sendOnlyKey = true;
                }
                const all = listData.data || [];
                for (const dom of domains) {
                    const match = all.find((d) => d.name?.toLowerCase() === dom.toLowerCase());
                    // MX REAL del apex en el DNS. NO usamos los records de Resend para esto:
                    // esos incluyen el MX de ENVÍO (bounces en send.<dominio> → feedback-smtp.
                    // amazonses.com), que daba un falso positivo de "recepción habilitada".
                    const liveMx = await resolveApexMx(dom);
                    const entry = {
                        domain: dom,
                        foundInResend: !!match,
                        status: match?.status || null,
                        sendingVerified: match?.status === 'verified',
                        inboundMx: isResendInboundMx(liveMx),
                        liveMx: liveMx.map((m) => `${m.priority} ${m.exchange}`),
                        records: []
                    };
                    if (match?.id) {
                        try {
                            const dResp = await fetch(`https://api.resend.com/domains/${match.id}`, {
                                headers: { Authorization: `Bearer ${readKey}` }
                            });
                            const dData = await dResp.json();
                            const records = dData.records || [];
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

            // ¿Hay un webhook email.received apuntando a nuestra URL?
            try {
                const whResp = await fetch('https://api.resend.com/webhooks', {
                    headers: { Authorization: `Bearer ${readKey}` }
                });
                const whData = await whResp.json();
                if (whResp.ok) {
                    out.webhook.checked = true;
                    const hooks = whData.data || [];
                    for (const h of hooks) {
                        const events = h.events || h.event_types || [];
                        const url = h.endpoint || h.url || '';
                        if (url) out.webhook.endpoints.push(url);
                        if (Array.isArray(events) && events.some((ev) => String(ev).includes('email.received'))) {
                            out.webhook.hasReceivedEvent = true;
                            out.webhook.receivedEndpoint = url;
                            out.webhook.receivedStatus = h.status || h.state || null;
                        }
                    }
                }
            } catch { /* la cuenta puede no exponer webhooks vía API */ }
        }

        // Verdictos en español (✅/❌) que el usuario puede leer directo.
        const checks = out.checks;
        checks.push({ ok: out.resendConfigured, label: out.resendConfigured ? 'RESEND_API_KEY configurada (envío)' : 'FALTA RESEND_API_KEY: sin ella no se puede enviar ni recibir' });
        checks.push({ ok: out.inboundKeySet, label: out.inboundKeySet ? 'RESEND_INBOUND_API_KEY configurada (lectura de entrantes)' : 'FALTA RESEND_INBOUND_API_KEY: sin una key de lectura no se puede traer el cuerpo de los correos recibidos' });
        checks.push({ ok: accounts.length > 0, label: accounts.length > 0 ? `${accounts.length} cuenta(s) de correo creada(s)` : 'No hay cuentas de correo creadas en este club' });

        if (out.sendOnlyKey) {
            // Ni siquiera la key de lectura pudo leer: probablemente RESEND_INBOUND_API_KEY también es solo-envío.
            checks.push({ ok: false, label: 'La key usada para leer en Resend no tiene permiso de lectura ("restricted"). Asegúrate de que RESEND_INBOUND_API_KEY sea una key "Full access".' });
        } else if (out.resendError) {
            checks.push({ ok: false, label: `Resend respondió un error al consultar dominios: ${out.resendError}` });
        } else {
            for (const d of out.domains) {
                checks.push({ ok: d.foundInResend, label: d.foundInResend ? `Dominio ${d.domain} dado de alta en Resend` : `Dominio ${d.domain} NO está dado de alta en Resend` });
                if (d.foundInResend) {
                    checks.push({ ok: d.sendingVerified, label: d.sendingVerified ? `ENVÍO verificado para ${d.domain}` : `ENVÍO NO verificado para ${d.domain} (estado en Resend: ${d.status || 'desconocido'}) — revisar SPF/DKIM en el DNS` });
                    checks.push({ ok: d.inboundMx, label: d.inboundMx
                        ? `RECEPCIÓN: el apex ${d.domain} apunta a Resend Inbound en el DNS (${(d.liveMx || []).join(', ')}) — habilitado para recibir`
                        : ((d.liveMx && d.liveMx.length)
                            ? `RECEPCIÓN: el apex ${d.domain} tiene MX pero NO apunta a Resend Inbound (${d.liveMx.join(', ')}). OJO: el MX de "envío" vive en send.${d.domain} y no sirve para recibir. En Resend → Domains → ${d.domain} activa "Receiving" y agrega/reemplaza por el MX que te muestre, con la prioridad más baja.`
                            : `RECEPCIÓN: el apex ${d.domain} NO tiene ningún MX en el DNS, por eso no llega ningún correo. En Resend → Domains → ${d.domain} activa el toggle "Receiving" y agrega a tu DNS el MX que te indique. (Verificar el envío NO habilita la recepción.)`) });
                }
            }
            // Estado del webhook email.received (incluye a dónde apunta y si está deshabilitado)
            if (out.webhook.checked) {
                const disabled = out.webhook.receivedStatus && !/enabled|active/i.test(String(out.webhook.receivedStatus));
                const ep = out.webhook.receivedEndpoint || '';
                const epOk = /\/api\/public\/inbound-email\/?$/.test(ep);
                checks.push({
                    ok: out.webhook.hasReceivedEvent && epOk && !disabled,
                    label: !out.webhook.hasReceivedEvent
                        ? 'FALTA el webhook email.received en Resend → Webhooks → Add (URL <tu-app>/api/public/inbound-email, evento email.received)'
                        : disabled
                            ? `Webhook email.received existe pero está DESHABILITADO en Resend (estado: ${out.webhook.receivedStatus}). Actívalo en Resend → Webhooks.`
                            : !epOk
                                ? `Webhook email.received apunta a "${ep || 'URL desconocida'}", que NO termina en /api/public/inbound-email. Corrige la URL del webhook en Resend (o vuelve a "Configurar recepción") para que los correos lleguen a la app.`
                                : `Webhook email.received OK → ${ep}` });
            }
        }
        checks.push({ ok: out.counts.received > 0, label: out.counts.received > 0 ? `${out.counts.received} correo(s) recibido(s) en total (último: ${out.lastReceivedAt ? new Date(out.lastReceivedAt).toLocaleString('es') : '—'})` : 'Aún no ha entrado NINGÚN correo a la app (cuando MX + webhook estén listos, los correos nuevos aparecerán aquí)' });

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
        // Configuración técnica del dominio y del proveedor: es
        // administración, y el pedido la nombra expresamente entre lo que un
        // usuario institucional NO puede ver.
        await attachInstitutionalProfile(req);
        if (!canManageMailAccounts(req.user)) {
            return res.status(403).json({ error: 'No tienes permiso para ejecutar pruebas de envío.' });
        }
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

// POST /api/email-accounts/attachments/presign — prepara la subida DIRECTA a
// S3 de un adjunto del compositor (v4.953). El archivo NO viaja por el cuerpo
// de la función —en Vercel se corta en ~4,5 MB y el 413 sale del borde de la
// plataforma—: acá sólo viajan el nombre, el tipo y el peso, se validan
// contra el criterio (`mailAttachments.js`) y se devuelve la URL prefirmada.
// El envío después trae la CLAVE y `resolveSendAttachments` comprueba el
// objeto REAL: lo declarado acá no obliga a nada.
export const presignComposeAttachment = async (req, res) => {
    try {
        const clubId = req.user.role === 'administrator' && req.body.clubId ? req.body.clubId : req.user.clubId;
        if (!clubId) return res.status(400).json({ error: 'No hay un sitio asociado a tu sesión desde el cual adjuntar.' });
        const { filename, contentType, size } = req.body || {};
        const { presignMailAttachment } = await import('../lib/mailAttachmentStore.js');
        const plan = await presignMailAttachment({ clubId, filename, contentType, size: Number(size) });
        if (!plan.ok) return res.status(400).json({ error: plan.error });
        return res.json({ key: plan.key, uploadUrl: plan.uploadUrl, contentType: plan.contentType });
    } catch (e) {
        console.error('[mail-attachments] error prefirmando:', e);
        return res.status(500).json({ error: 'No se pudo preparar la subida del adjunto. Intenta de nuevo.' });
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
    repairMessageAttachments,
    getEmailDiagnostics,
    testSendEmail,
    provisionInbound,
    listDrafts,
    saveDraft,
    deleteDraft,
    presignComposeAttachment
};

console.log('[EmailAccountController] cargado (v4.953.0 — adjuntos del compositor por URL prefirmada a S3: el archivo ya no viaja por el cuerpo de la función)');
