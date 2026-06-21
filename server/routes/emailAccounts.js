import express from 'express';
import {
    getEmailAccounts,
    createEmailAccount,
    deleteEmailAccount,
    getAccountMessages,
    updateMessage,
    deleteMessage
} from '../controllers/EmailAccountController.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

router.use(authMiddleware);

// Bandeja real (correos recibidos vía Resend Inbound).
router.get('/messages', getAccountMessages);
router.patch('/messages/:id', updateMessage);
router.delete('/messages/:id', deleteMessage);

router.get('/', getEmailAccounts);
router.post('/', createEmailAccount);
router.delete('/:id', deleteEmailAccount);

export default router;
