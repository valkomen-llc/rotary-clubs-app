import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import * as controller from '../controllers/technicalRequestController.js';

const router = express.Router();

router.get('/', authenticateToken, controller.getClubRequests);
router.post('/', authenticateToken, controller.createTechnicalRequest);
router.post('/checkout', authenticateToken, controller.createCheckoutSession);

export default router;
