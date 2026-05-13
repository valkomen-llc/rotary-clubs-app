// nodemailer is lazy-loaded only when SMTP is needed (not installed by default)
import prisma from '../lib/prisma.js';

export class EmailService {
    constructor() { }

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
    static async sendPlatformEmail({ to, subject, html, from, replyTo }) {
        try {
            // Check if platform prefers SMTP
            const providerConfig = await prisma.platformConfig.findUnique({
                where: { key: 'email_provider' }
            }).catch(() => null);

            const provider = providerConfig?.value || 'resend';

            if (provider === 'smtp') {
                return await this._sendViaPlatformSMTP({ to, subject, html, from, replyTo });
            }

            return await this._sendViaResend({ to, subject, html, from, replyTo });
        } catch (error) {
            console.error(`[EmailService] Platform email failed to ${to}:`, error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Send via Resend HTTP API (no npm package needed)
     */
    static async _sendViaResend({ to, subject, html, from: customFrom, replyTo }) {
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
                const info = await transporter.sendMail({ from: fromStr, to, subject, html });
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
            to: [to], 
            subject, 
            html 
        };
        
        if (replyTo) body.reply_to = replyTo;

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
    static async _sendViaPlatformSMTP({ to, subject, html, from: customFrom, replyTo }) {
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

        const info = await transporter.sendMail({ from: fromStr, to, subject, html });
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
    static async sendEmail({ clubId, to, subject, html, userId, fromEmail }) {
        try {
            const transporter = await this.getTransporter(clubId);

            // Fetch club name for better sender identity
            const club = await prisma.club.findUnique({
                where: { id: clubId },
                select: { name: true }
            });
            const senderName = club?.name || 'Club Platform';

            if (!transporter) {
                console.info(`[EmailService] Club ${clubId} has no SMTP. Falling back to platform relay.`);
                
                // Construct a professional From name: "Club Name (institutional@email.com)"
                const professionalFrom = customFrom 
                    ? `"${senderName} (${customFrom})" <noreply@clubplatform.org>`
                    : `"${senderName}" <noreply@clubplatform.org>`;

                return await this.sendPlatformEmail({ 
                    to, 
                    subject, 
                    html, 
                    from: professionalFrom,
                    replyTo: customFrom
                });
            }

            const config = await prisma.notificationConfig.findUnique({
                where: { type_clubId: { type: 'smtp', clubId } }
            });

            const fromStr = config.fromName ? `"${config.fromName}" <${config.fromEmail}>` : config.fromEmail;

            const info = await transporter.sendMail({ from: fromStr, to, subject, html });

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
