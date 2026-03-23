import express from 'express';
import { authMiddleware, roleMiddleware } from '../middleware/auth.js';
import { getEmailConfig, updateEmailConfig, sendTestEmail } from '../controllers/verificationController.js';

const router = express.Router();

// All routes require authentication + administrator role (super admin)
router.use(authMiddleware);
router.use(roleMiddleware('administrator'));

router.get('/email', getEmailConfig);
router.post('/email', updateEmailConfig);
router.post('/email/test', sendTestEmail);

export default router;
