import express from 'express';
import { authMiddleware, roleMiddleware } from '../middleware/auth.js';
import * as whatsappQrController from '../controllers/whatsappQrController.js';

const router = express.Router();
const superAdminMiddleware = roleMiddleware(['administrator']);

// All WhatsApp QR routes are protected and require SuperAdmin privileges
// since this is meant to manage the District's global community groups

router.get('/status', authMiddleware, superAdminMiddleware, whatsappQrController.getStatus);
router.post('/start', authMiddleware, superAdminMiddleware, whatsappQrController.startClient);
router.post('/disconnect', authMiddleware, superAdminMiddleware, whatsappQrController.disconnectClient);

// CRM Endpoints
router.get('/chats', authMiddleware, superAdminMiddleware, whatsappQrController.getChats);
router.get('/chats/:chatId/messages', authMiddleware, superAdminMiddleware, whatsappQrController.getMessages);
router.get('/chats/:chatId/messages/:messageId/media', authMiddleware, superAdminMiddleware, whatsappQrController.getMessageMedia);
router.post('/send-message', authMiddleware, superAdminMiddleware, whatsappQrController.sendMessage);

export default router;
