import nodemailer from 'nodemailer';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class EmailService {
    constructor() { }

    /**
     * Initializes and returns a dynamic nodemailer transporter for a distinct club
     * based on their `NotificationConfig` inside the neon database.
     * @param {string} clubId
     * @returns {nodemailer.Transporter|null} 
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

        return nodemailer.createTransport({
            host: config.host,
            port: config.port,
            secure: config.port === 465, // True for 465, false for other ports
            auth: {
                user: config.user,
                pass: config.password,
            },
        });
    }

    /**
     * Sends an email securely using the Club's configuration and templates. 
     * Keeps a transactional log.
     * @param {Object} options Options containing context
     * @param {string} options.clubId ID of the club
     * @param {string} options.to recipient address
     * @param {string} options.subject 
     * @param {string} options.html Body content in HTML format
     * @param {string} options.userId User who triggered this (optional, for log tracking)
     */
    static async sendEmail({ clubId, to, subject, html, userId }) {
        try {
            const transporter = await this.getTransporter(clubId);

            if (!transporter) {
                // Keep record of failed intent
                await this.logCommunication({
                    clubId, type: 'email', recipient: to, subject, content: html, status: 'failed',
                    errorMsg: 'SMTP service is missing or disabled', sentById: userId
                });
                return { success: false, error: 'SMTP Disabled' };
            }

            const config = await prisma.notificationConfig.findUnique({
                where: { type_clubId: { type: 'smtp', clubId } }
            });

            const fromStr = config.fromName ? `"${config.fromName}" <${config.fromEmail}>` : config.fromEmail;

            const mailOptions = {
                from: fromStr,
                to: to,
                subject: subject,
                html: html
            };

            const info = await transporter.sendMail(mailOptions);

            // Log Success Message
            await this.logCommunication({
                clubId, type: 'email', recipient: to, subject, content: html, status: 'sent',
                errorMsg: null, sentById: userId
            });

            return { success: true, messageId: info.messageId };

        } catch (error) {
            console.error(`[EmailService] Failed to send email to ${to}:`, error);

            // Log Error Message
            await this.logCommunication({
                clubId, type: 'email', recipient: to, subject, content: html, status: 'failed',
                errorMsg: error.message, sentById: userId
            });

            return { success: false, error: error.message };
        }
    }

    /**
     * Internal logger
     */
    static async logCommunication({ clubId, type, recipient, subject, content, status, errorMsg, sentById }) {
        if (!clubId) return;

        try {
            await prisma.communicationLog.create({
                data: {
                    type,
                    recipient,
                    subject,
                    content,
                    status,
                    errorMsg,
                    clubId,
                    sentById: sentById || null
                }
            });
        } catch (error) {
            console.error('[EmailService] Failed to log communication:', error);
        }
    }
}

export default EmailService;
