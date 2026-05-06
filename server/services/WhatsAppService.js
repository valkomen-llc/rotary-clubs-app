import axios from 'axios';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class WhatsAppService {
    constructor() { }

    /**
     * Finds the WhatsApp configuration for the given club.
     * @param {string} clubId 
     * @returns {Object|null}
     */
    static async getConfig(clubId) {
        if (!clubId) return null;

        const config = await prisma.notificationConfig.findUnique({
            where: { type_clubId: { type: 'whatsapp', clubId: clubId } }
        });

        if (!config || !config.enabled) {
            console.warn(`[WhatsAppService] WhatsApp is not configured or is disabled for Club ${clubId}`);
            return null;
        }

        return config;
    }

    /**
     * Normalizes a phone number to standard international format without '+' symbol for WhatsApp API
     * @param {string} phone 
     */
    static normalizePhoneNumber(phone) {
        if (!phone) return '';
        return phone.replace(/[^0-9]/g, ''); // Strip all non-numeric characters
    }

    /**
     * Sends a text message via Meta's WhatsApp Cloud API.
     * If the club uses a QR scanner library (future implementation), it would branch here.
     * @param {Object} options 
     * @param {string} options.clubId
     * @param {string} options.to Phone number
     * @param {string} options.message Text message content
     * @param {string} options.userId Optional, for logging
     */
    static async sendMessage({ clubId, to, message, userId }) {
        try {
            const config = await this.getConfig(clubId);

            if (!config) {
                await this.logCommunication({
                    clubId, type: 'whatsapp', recipient: to, content: message, status: 'failed',
                    errorMsg: 'WhatsApp service is missing or disabled', sentById: userId
                });
                return { success: false, error: 'WhatsApp Disabled' };
            }

            const normalizedTo = this.normalizePhoneNumber(to);
            const normalizedFromId = this.normalizePhoneNumber(config.phoneNumber);

            if (!config.apiKey || !normalizedFromId) {
                // Future Implementation: Throw warning for Baileys/QR code usage
                throw new Error("Meta API Token and Sender Phone Number are required.");
            }

            // Using Meta's Cloud API (assuming v17.0 standard endpoint)
            const metaApiUrl = `https://graph.facebook.com/v17.0/${normalizedFromId}/messages`;

            const payload = {
                messaging_product: "whatsapp",
                recipient_type: "individual",
                to: normalizedTo,
                type: "text",
                text: {
                    preview_url: true,
                    body: message
                }
            };

            const response = await axios.post(metaApiUrl, payload, {
                headers: {
                    'Authorization': `Bearer ${config.apiKey}`,
                    'Content-Type': 'application/json'
                }
            });

            // Log Success
            await this.logCommunication({
                clubId, type: 'whatsapp', recipient: normalizedTo, content: message, status: 'sent',
                errorMsg: null, sentById: userId
            });

            return { success: true, response: response.data };

        } catch (error) {
            console.error(`[WhatsAppService] Failed to send message to ${to}:`, error.response?.data || error.message);

            const errorMsg = error.response?.data?.error?.message || error.message;

            // Log Error
            await this.logCommunication({
                clubId, type: 'whatsapp', recipient: to, content: message, status: 'failed',
                errorMsg, sentById: userId
            });

            return { success: false, error: errorMsg };
        }
    }

    /**
     * Sends a master-level WhatsApp message using Valkomen's master account.
     * Used for system alerts, billing reminders, and platform-wide notifications.
     */
    static async sendPlatformMessage({ to, message }) {
        const masterPhoneId = process.env.WA_MASTER_PHONE_ID;
        const masterToken = process.env.WA_MASTER_ACCESS_TOKEN;
        
        if (!masterPhoneId || !masterToken) {
            console.warn('[WhatsAppService] Faltan credenciales maestras (WA_MASTER_PHONE_ID) para notificaciones del sistema.');
            return { success: false, error: 'Master credentials missing' };
        }

        const normalizedTo = this.normalizePhoneNumber(to);
        // Using v21.0 as seen in other parts of the app for master account
        const metaApiUrl = `https://graph.facebook.com/v21.0/${masterPhoneId}/messages`;

        try {
            const response = await axios.post(metaApiUrl, {
                messaging_product: "whatsapp",
                recipient_type: "individual",
                to: normalizedTo,
                type: "text",
                text: { 
                    preview_url: true, 
                    body: message 
                }
            }, {
                headers: { 
                    'Authorization': `Bearer ${masterToken}`, 
                    'Content-Type': 'application/json' 
                }
            });
            return { success: true, response: response.data };
        } catch (error) {
            const errorMsg = error.response?.data?.error?.message || error.message;
            console.error(`[WhatsAppService] Platform message failed:`, errorMsg);
            return { success: false, error: errorMsg };
        }
    }

    /**
     * Internal logger
     */
    static async logCommunication({ clubId, type, recipient, content, status, errorMsg, sentById }) {
        if (!clubId) return;

        try {
            await prisma.communicationLog.create({
                data: {
                    type,
                    recipient,
                    content,
                    status,
                    errorMsg,
                    clubId,
                    sentById: sentById || null
                }
            });
        } catch (error) {
            console.error('[WhatsAppService] Failed to log communication:', error);
        }
    }
}

export default WhatsAppService;
