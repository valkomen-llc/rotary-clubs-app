import express from 'express';
import { login } from '../controllers/authController.js';
import { verifyEmail, resendCode } from '../controllers/verificationController.js';

const router = express.Router();

router.post('/login', login);
router.post('/verify-email', verifyEmail);
router.post('/resend-code', resendCode);

export default router;
