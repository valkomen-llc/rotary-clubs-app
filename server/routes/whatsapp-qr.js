import express from 'express';
import { authMiddleware, superAdminMiddleware } from '../middleware/auth.js';
import * as whatsappQrController from '../controllers/whatsappQrController.js';

const router = express.Router();

// All WhatsApp QR routes are protected and require SuperAdmin privileges
// since this is meant to manage the District's global community groups

router.get('/status', authMiddleware, superAdminMiddleware, whatsappQrController.getStatus);
router.post('/start', authMiddleware, superAdminMiddleware, whatsappQrController.startClient);
router.post('/disconnect', authMiddleware, superAdminMiddleware, whatsappQrController.disconnectClient);

export default router;
