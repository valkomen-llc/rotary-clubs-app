import prisma from '../lib/prisma.js';
import EmailService from '../services/EmailService.js';
import WhatsAppService from '../services/WhatsAppService.js';

// Get notification config (SMTP & WhatsApp)
export const getNotificationConfig = async (req, res) => {
    try {
        const clubId = req.user.role === 'administrator' && req.query.clubId ? req.query.clubId : req.user.clubId;

        const configs = await prisma.notificationConfig.findMany({
            where: { clubId }
        });

        res.json(configs);
    } catch (error) {
        console.error('Error fetching notification config:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// Update or create notification config
export const upsertNotificationConfig = async (req, res) => {
    try {
        const clubId = req.user.role === 'administrator' && req.body.clubId ? req.body.clubId : req.user.clubId;
        const { type, enabled, host, port, user, password, fromName, fromEmail, apiKey, phoneNumber } = req.body;

        if (!type || !['smtp', 'whatsapp'].includes(type)) {
            return res.status(400).json({ error: 'Invalid configuration type' });
        }

        const config = await prisma.notificationConfig.upsert({
            where: {
                type_clubId: { type, clubId }
            },
            update: {
                enabled,
                ...(type === 'smtp' && { host, port, user, password, fromName, fromEmail }),
                ...(type === 'whatsapp' && { apiKey, phoneNumber })
            },
            create: {
                type,
                enabled,
                clubId,
                ...(type === 'smtp' && { host, port, user, password, fromName, fromEmail }),
                ...(type === 'whatsapp' && { apiKey, phoneNumber })
            }
        });

        res.json(config);
    } catch (error) {
        console.error('Error upserting notification config:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// Templates
export const getTemplates = async (req, res) => {
    try {
        const clubId = req.user.role === 'administrator' && req.query.clubId ? req.query.clubId : req.user.clubId;

        const templates = await prisma.communicationTemplate.findMany({
            where: { clubId },
            orderBy: { createdAt: 'desc' }
        });

        res.json(templates);
    } catch (error) {
        console.error('Error fetching templates:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const createTemplate = async (req, res) => {
    try {
        const clubId = req.user.clubId;
        const { name, type, subject, content } = req.body;

        const template = await prisma.communicationTemplate.create({
            data: { name, type, subject, content, clubId }
        });

        res.status(201).json(template);
    } catch (error) {
        console.error('Error creating template:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const updateTemplate = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, type, subject, content } = req.body;
        const clubId = req.user.clubId;

        // Ensure template belongs to club
        const existing = await prisma.communicationTemplate.findUnique({ where: { id } });
        if (!existing || (existing.clubId !== clubId && req.user.role !== 'administrator')) {
            return res.status(404).json({ error: 'Template not found' });
        }

        const template = await prisma.communicationTemplate.update({
            where: { id },
            data: { name, type, subject, content }
        });

        res.json(template);
    } catch (error) {
        console.error('Error updating template:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const deleteTemplate = async (req, res) => {
    try {
        const { id } = req.params;
        const clubId = req.user.clubId;

        const existing = await prisma.communicationTemplate.findUnique({ where: { id } });
        if (!existing || (existing.clubId !== clubId && req.user.role !== 'administrator')) {
            return res.status(404).json({ error: 'Template not found' });
        }

        await prisma.communicationTemplate.delete({ where: { id } });
        res.json({ message: 'Template deleted' });
    } catch (error) {
        console.error('Error deleting template:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// Logs
export const getCommunicationLogs = async (req, res) => {
    try {
        const clubId = req.user.role === 'administrator' && req.query.clubId ? req.query.clubId : req.user.clubId;

        const logs = await prisma.communicationLog.findMany({
            where: { clubId },
            orderBy: { createdAt: 'desc' },
            include: { sentBy: { select: { email: true } } },
            take: 100 // Limit for performance
        });

        res.json(logs);
    } catch (error) {
        console.error('Error fetching communication logs:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// Send Communication
export const sendCommunication = async (req, res) => {
    try {
        let clubId = req.user.role === 'administrator' && req.body.clubId ? req.body.clubId : req.user.clubId;
        const { type, recipient, subject, content, districtId } = req.body;

        // If districtId is provided, we need to find the mirror club for that district
        if (districtId && !clubId) {
            const district = await prisma.district.findUnique({
                where: { id: districtId },
                select: { number: true }
            });
            
            if (district) {
                const mirrorClub = await prisma.club.findFirst({
                    where: { type: 'district', district: String(district.number) }
                });
                if (mirrorClub) {
                    clubId = mirrorClub.id;
                }
            }
        }

        if (!type || !recipient || !content) {
            return res.status(400).json({ error: 'Missing required fields (type, recipient, content)' });
        }

        let result;

        if (type === 'email') {
            if (!subject) return res.status(400).json({ error: 'Subject is required for email' });
            result = await EmailService.sendEmail({
                clubId,
                to: recipient,
                subject,
                html: content,
                userId: req.user.id,
                fromEmail: req.body.fromEmail
            });
        } else if (type === 'whatsapp') {
            result = await WhatsAppService.sendMessage({
                clubId,
                to: recipient,
                message: content,
                userId: req.user.id
            });
        } else {
            return res.status(400).json({ error: 'Invalid communication type. Use email or whatsapp.' });
        }

        if (result.success) {
            res.json({ message: 'Communication sent successfully', ...result });
        } else {
            res.status(500).json({ error: result.error });
        }
    } catch (error) {
        console.error('Error sending communication:', error);
        res.status(500).json({ error: 'Internal server error while dispatching communication' });
    }
};

export default {
    getNotificationConfig,
    upsertNotificationConfig,
    getTemplates,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    getCommunicationLogs,
    sendCommunication
};
