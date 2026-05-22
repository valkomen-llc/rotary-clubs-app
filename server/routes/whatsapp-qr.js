import express from 'express';
import { authMiddleware, roleMiddleware } from '../middleware/auth.js';
import * as whatsappQrController from '../controllers/whatsappQrController.js';

const router = express.Router();
const superAdminMiddleware = roleMiddleware(['administrator']);

// Public webhook route (called by Evolution API)
router.post('/webhook', whatsappQrController.handleQrWebhook);

// Protected routes (SuperAdmin only)
router.get('/status', authMiddleware, superAdminMiddleware, whatsappQrController.getStatus);
router.post('/start', authMiddleware, superAdminMiddleware, whatsappQrController.startClient);
router.post('/disconnect', authMiddleware, superAdminMiddleware, whatsappQrController.disconnectClient);

// CRM Endpoints
router.get('/chats', authMiddleware, superAdminMiddleware, whatsappQrController.getChats);
router.get('/chats/:chatId/messages', authMiddleware, superAdminMiddleware, whatsappQrController.getMessages);
router.get('/chats/:chatId/image', authMiddleware, superAdminMiddleware, whatsappQrController.getChatImage);
router.get('/chats/:chatId/messages/:messageId/media', authMiddleware, superAdminMiddleware, whatsappQrController.getMessageMedia);
router.post('/chats/:chatId/mark-read', authMiddleware, superAdminMiddleware, whatsappQrController.markChatRead);
router.post('/send-message', authMiddleware, superAdminMiddleware, whatsappQrController.sendMessage);
router.post('/send-media', authMiddleware, superAdminMiddleware, whatsappQrController.sendMedia);

// Group Management Endpoints
router.post('/groups/create', authMiddleware, superAdminMiddleware, whatsappQrController.createGroup);
router.post('/groups/:groupJid/participants', authMiddleware, superAdminMiddleware, whatsappQrController.updateGroupParticipants);
router.put('/groups/:groupJid/metadata', authMiddleware, superAdminMiddleware, whatsappQrController.updateGroupMetadata);

// Contact Bulk Import Endpoint
router.post('/contacts/import', authMiddleware, superAdminMiddleware, whatsappQrController.importQrContacts);

export default router;
