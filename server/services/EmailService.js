// nodemailer is lazy-loaded only when SMTP is needed (not installed by default)
import prisma from '../lib/prisma.js';
// ⚠️ DESDE QUÉ DIRECCIÓN SALE UN CORREO DE LA BANDEJA es criterio, y vive
// aparte (v4.942). Acá sólo se ejecuta el plan que devuelve.
import { mailboxSenderPlan, explainSendFailure } from '../lib/mailboxSender.js';

export class EmailService {
    constructor() { }

    /**
     * Normaliza la dirección remitente para usar el dominio raíz verificado en Resend.
     * Quita el prefijo "www." del dominio (Resend verifica el apex, no el subdominio www).
     * Ej: "contacto@www.jaquematealapolio.org" → "contacto@jaquematealapolio.org"
     */
    static normalizeSenderEmail(email) {
        if (!email || !email.includes('@')) return email;
        const [local, domain] = email.split('@');
        return `${local}@${domain.replace(/^www\./i, '')}`;
    }

    /**
     * Convierte el destinatario en una lista de direcciones válida para Resend.
     * Acepta string con varias direcciones separadas por coma o punto y coma
     * ("a@b.com, c@d.com; e@f.com") o un array, y devuelve un array limpio.
     */
    static parseRecipients(to) {
        const arr = Array.isArray(to) ? to : [to];
        return arr
            .flatMap((x) => (typeof x === 'string' ? x.split(/[,;]/) : [x]))
            .map((x) => (typeof x === 'string' ? x.trim() : x))
            .filter(Boolean);
    }

    /* ═══════════════════════════════════════════════════════════
       PLATFORM-LEVEL EMAIL  (Registration verification, etc.)
       Uses Resend by default, or SMTP if configured in PlatformConfig
       ═══════════════════════════════════════════════════════════ */

    /**
     * Sends a platform-level email (not club-specific).
     * Checks PlatformConfig for provider preference:
     *   - "smtp" → uses SMTP credentials from PlatformConfig
     *   - default → uses Resend API (env: RESEND_API_KEY)
     */
    // v4.857 — `text` es la versión en TEXTO PLANO del correo. No es un
    // adorno: sin ella algunos filtros puntúan el mensaje como sospechoso, y un
    // cliente que no dibuja HTML mostraría una página en blanco. Es OPCIONAL y
    // aditivo — los diez llamadores que ya existen no cambian en nada.
    static async sendPlatformEmail({ to, subject, html, text, from, replyTo, cc, bcc, attachments }) {
        try {
            // Check if platform prefers SMTP
            const providerConfig = await prisma.platformConfig.findUnique({
                where: { key: 'email_provider' }
            }).catch(() => null);

            const provider = providerConfig?.value || 'resend';

            if (provider === 'smtp') {
                return await this._sendViaPlatformSMTP({ to, subject, html, text, from, replyTo, cc, bcc, attachments });
            }

            return await this._sendViaResend({ to, subject, html, text, from, replyTo, cc, bcc, attachments });
        } catch (error) {
            console.error(`[EmailService] Platform email failed to ${to}:`, error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Send via Resend HTTP API (no npm package needed)
     */
    // Normaliza adjuntos al formato de Resend: { filename, content (base64) } o { filename, path (url) }.
    static _resendAttachments(attachments) {
        if (!Array.isArray(attachments)) return undefined;
        const list = attachments
            .map((a) => {
                if (!a || !a.filename) return null;
                if (a.content) return { filename: a.filename, content: a.content }; // base64
                if (a.path || a.url) return { filename: a.filename, path: a.path || a.url };
                return null;
            })
            .filter(Boolean);
        return list.length ? list : undefined;
    }

    // Normaliza adjuntos al formato de nodemailer (SMTP): base64 → Buffer.
    static _nodemailerAttachments(attachments) {
        if (!Array.isArray(attachments)) return undefined;
        const list = attachments
            .map((a) => {
                if (!a || !a.filename) return null;
                if (a.content) return { filename: a.filename, content: Buffer.from(a.content, 'base64'), contentType: a.contentType };
                if (a.path || a.url) return { filename: a.filename, path: a.path || a.url };
                return null;
            })
            .filter(Boolean);
        return list.length ? list : undefined;
    }

    static async _sendViaResend({ to, subject, html, text, from: customFrom, replyTo, cc, bcc, attachments }) {
        const apiKey = process.env.RESEND_API_KEY;
        if (!apiKey) {
            console.warn('[EmailService] RESEND_API_KEY not set. Intentando usar configuración SMTP de fallback del Super Admin...');
            
            // Fallback to first available SMTP config from the clubs (usually the super admin's)
            const fallbackConfig = await prisma.notificationConfig.findFirst({
                where: { type: 'smtp', enabled: true }
            });

            if (fallbackConfig) {
                const { default: nodemailer } = await import('nodemailer');
                const transporter = nodemailer.createTransport({
                    host: fallbackConfig.host,
                    port: fallbackConfig.port,
                    secure: fallbackConfig.port === 465,
                    auth: { user: fallbackConfig.user, pass: fallbackConfig.password },
                });
                
                // Force "Club Platform for Rotary" as sender name instead of the local club's name
                const senderEmail = fallbackConfig.fromEmail || fallbackConfig.user;
                const fromStr = `"Club Platform for Rotary" <${senderEmail}>`;
                const info = await transporter.sendMail({
                    from: fromStr, to: EmailService.parseRecipients(to), subject, html,
                    ...(cc ? { cc: EmailService.parseRecipients(cc) } : {}),
                    ...(bcc ? { bcc: EmailService.parseRecipients(bcc) } : {}),
                    ...(EmailService._nodemailerAttachments(attachments) ? { attachments: EmailService._nodemailerAttachments(attachments) } : {})
                });
                return { success: true, messageId: info.messageId };
            }

            console.error('[EmailService] RESEND_API_KEY not set y no hay SMTP de fallback');
            return { success: false, error: 'RESEND_API_KEY not configured' };
        }

        // Get configured "from" address or use Resend sandbox default
        const fromConfig = await prisma.platformConfig.findUnique({
            where: { key: 'email_from' }
        }).catch(() => null);

        // Use verified domain for production emails
        // Use verified domain for production emails
        const platformDefault = fromConfig?.value || '"Club Platform for Rotary" <noreply@clubplatform.org>';
        
        const finalFrom = customFrom || platformDefault;

        const body = {
            from: finalFrom,
            to: EmailService.parseRecipients(to),
            subject,
            html
        };

        if (text) body.text = text;
        if (replyTo) body.reply_to = replyTo;
        if (cc) body.cc = EmailService.parseRecipients(cc);
        if (bcc) body.bcc = EmailService.parseRecipients(bcc);
        const resendAtt = EmailService._resendAttachments(attachments);
        if (resendAtt) body.attachments = resendAtt;

        const resp = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });

        const data = await resp.json();

        if (!resp.ok) {
            console.error('[EmailService] Resend error:', data);
            return { success: false, error: data.message || 'Resend API error' };
        }

        return { success: true, messageId: data.id };
    }

    /**
     * Send via SMTP using PlatformConfig credentials
     */
    static async _sendViaPlatformSMTP({ to, subject, html, text, from: customFrom, replyTo, cc, bcc, attachments }) {
        const keys = ['smtp_host', 'smtp_port', 'smtp_user', 'smtp_password', 'smtp_from_name', 'smtp_from_email'];
        const configs = await prisma.platformConfig.findMany({
            where: { key: { in: keys } }
        });

        const cfg = {};
        configs.forEach(c => { cfg[c.key] = c.value; });

        if (!cfg.smtp_host || !cfg.smtp_user) {
            return { success: false, error: 'SMTP credentials not configured in PlatformConfig' };
        }

        const { default: nodemailer } = await import('nodemailer');
        const transporter = nodemailer.createTransport({
            host: cfg.smtp_host,
            port: parseInt(cfg.smtp_port || '587'),
            secure: parseInt(cfg.smtp_port || '587') === 465,
            auth: { user: cfg.smtp_user, pass: cfg.smtp_password },
        });

        const fromStr = cfg.smtp_from_name
            ? `"${cfg.smtp_from_name}" <${cfg.smtp_from_email || cfg.smtp_user}>`
            : (cfg.smtp_from_email || cfg.smtp_user);

        const info = await transporter.sendMail({
            from: fromStr, to: EmailService.parseRecipients(to), subject, html,
            ...(text ? { text } : {}),
            ...(replyTo ? { replyTo } : {}),
            ...(cc ? { cc: EmailService.parseRecipients(cc) } : {}),
            ...(bcc ? { bcc: EmailService.parseRecipients(bcc) } : {}),
            ...(EmailService._nodemailerAttachments(attachments) ? { attachments: EmailService._nodemailerAttachments(attachments) } : {})
        });
        return { success: true, messageId: info.messageId };
    }

    /* ═══════════════════════════════════════════════════════════
       CLUB-LEVEL EMAIL  (CRM, notifications, etc.)
       Uses per-club SMTP config from NotificationConfig
       ═══════════════════════════════════════════════════════════ */

    /**
     * Gets a nodemailer transporter for a specific club's SMTP config
     */
    static async getTransporter(clubId) {
        if (!clubId) return null;

        const config = await prisma.notificationConfig.findUnique({
            where: { type_clubId: { type: 'smtp', clubId: clubId } }
        });

        if (!config || !config.enabled) {
            console.warn(`[EmailService] SMTP is not configured or is disabled for Club ${clubId}`);
            return null;
        }

        const { default: nodemailer } = await import('nodemailer');
        return nodemailer.createTransport({
            host: config.host,
            port: config.port,
            secure: config.port === 465,
            auth: { user: config.user, pass: config.password },
        });
    }

    /**
     * Sends an email using the Club's own SMTP configuration, 
     * with fallback to Platform relay if club SMTP is not configured.
     */
    static async sendEmail({ clubId, to, subject, html, userId, fromEmail, cc, bcc, attachments }) {
        try {
            const transporter = await this.getTransporter(clubId);

            // Fetch club name for better sender identity
            const club = await prisma.club.findUnique({
                where: { id: clubId },
                select: { name: true }
            });
            const senderName = club?.name || 'Club Platform';

            // ⚠️ EL REMITENTE SE RESUELVE POR PLAN, NO POR CASCADA SILENCIOSA
            // (v4.942). Se intenta la cuenta institucional y, si el proveedor la
            // rechaza —el dominio todavía no está verificado—, se usa el
            // respaldo y SE DICE cuál se usó y por qué.
            //
            // ⚠️ EL RESPALDO YA NO PONE UNA DIRECCIÓN COMO NOMBRE VISIBLE. Antes
            // salía `"presidencia@dominio.org" <noreply@clubplatform.org>`, que
            // es el patrón que los filtros leen como suplantación: el proveedor
            // lo acepta y el destinatario no lo recibe. Va el NOMBRE del sitio,
            // y la cuenta institucional queda como `Reply-To`.
            if (fromEmail || !transporter) {
                // ⚠️ CON SMTP PROPIO, EL RESPALDO SIGUE SIENDO EL SUYO. Un club
                // con su servidor configurado envía por él si la dirección
                // institucional no sale por el proveedor: meterlo en el relay de
                // la plataforma le cambiaría el remitente a un sitio que tiene
                // el suyo. Por eso el paso 2 sólo entra cuando no hay SMTP.
                const plan = mailboxSenderPlan({ mailbox: fromEmail, siteName: senderName })
                    .filter(paso => paso.usedOwnMailbox || !transporter);
                const fallos = [];

                for (const paso of plan) {
                    // Sólo se intenta la cuenta institucional si de verdad
                    // existe como buzón del sitio: enviar desde una dirección
                    // que no administramos es lo que el proveedor rechaza.
                    if (paso.usedOwnMailbox) {
                        const account = await prisma.emailAccount
                            .findUnique({ where: { email: paso.address } })
                            .catch(() => null);
                        if (!account) {
                            fallos.push({ level: paso.level, error: 'esa dirección no es un buzón de este sitio' });
                            continue;
                        }
                    }

                    const salida = await this.sendPlatformEmail({
                        to, subject, html,
                        from: paso.from, replyTo: paso.replyTo || undefined,
                        cc, bcc, attachments,
                    });

                    if (salida.success) {
                        if (!paso.usedOwnMailbox && fromEmail) {
                            console.warn(`[EmailService] ${fromEmail} salió por el respaldo (${paso.address}): ${paso.reason}`);
                        }
                        await this.logCommunication({
                            clubId, type: 'email', recipient: to, subject, content: html, status: 'sent',
                            errorMsg: null, sentById: userId
                        });
                        // El remitente REAL viaja en la respuesta: sin este dato
                        // la pantalla afirmaba haber enviado desde una cuenta
                        // desde la que no envió.
                        return { ...salida, sender: { ...paso, providerError: fallos[0]?.error || null } };
                    }

                    fallos.push({ level: paso.level, error: salida.error });
                    console.warn(`[EmailService] envío nivel ${paso.level} (${paso.address}) falló: ${salida.error}`);
                }

                const causa = fallos[0]?.error || fallos[fallos.length - 1]?.error;
                // Con SMTP propio todavía queda un camino: se sigue de largo y
                // lo intenta el transporte del club, que es lo que hacía antes.
                if (!transporter) {
                    await this.logCommunication({
                        clubId, type: 'email', recipient: to, subject, content: html, status: 'failed',
                        errorMsg: causa, sentById: userId
                    });
                    return { success: false, error: explainSendFailure(causa, { mailbox: fromEmail }), attempts: fallos };
                }
                console.warn(`[EmailService] la dirección institucional no salió (${causa}); se intenta el SMTP del sitio.`);
            }

            const config = await prisma.notificationConfig.findUnique({
                where: { type_clubId: { type: 'smtp', clubId } }
            });

            const fromStr = config.fromName ? `"${config.fromName}" <${config.fromEmail}>` : config.fromEmail;

            const info = await transporter.sendMail({
                from: fromStr, to: EmailService.parseRecipients(to), subject, html,
                ...(cc ? { cc: EmailService.parseRecipients(cc) } : {}),
                ...(bcc ? { bcc: EmailService.parseRecipients(bcc) } : {}),
                ...(EmailService._nodemailerAttachments(attachments) ? { attachments: EmailService._nodemailerAttachments(attachments) } : {})
            });

            await this.logCommunication({
                clubId, type: 'email', recipient: to, subject, content: html, status: 'sent',
                errorMsg: null, sentById: userId
            });

            return { success: true, messageId: info.messageId };

        } catch (error) {
            console.error(`[EmailService] Failed to send email to ${to}:`, error);

            await this.logCommunication({
                clubId, type: 'email', recipient: to, subject, content: html, status: 'failed',
                errorMsg: error.message, sentById: userId
            });

            return { success: false, error: error.message };
        }
    }

    /**
     * Internal logger for CommunicationLog table
     */
    static async logCommunication({ clubId, type, recipient, subject, content, status, errorMsg, sentById }) {
        if (!clubId) return;

        try {
            await prisma.communicationLog.create({
                data: {
                    type, recipient, subject, content, status, errorMsg,
                    clubId, sentById: sentById || null
                }
            });
        } catch (error) {
            console.error('[EmailService] Failed to log communication:', error);
        }
    }
}

export default EmailService;
