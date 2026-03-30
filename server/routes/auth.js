import express from 'express';
import { login, impersonate } from '../controllers/authController.js';
import { verifyEmail, resendCode } from '../controllers/verificationController.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

router.post('/login', login);
router.post('/verify-email', verifyEmail);
router.post('/resend-code', resendCode);
router.post('/impersonate', authMiddleware, impersonate);

export default router;
