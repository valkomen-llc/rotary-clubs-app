import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import * as controller from '../controllers/technicalRequestController.js';

const router = express.Router();

router.get('/', authMiddleware, controller.getClubRequests);
router.post('/', authMiddleware, controller.createTechnicalRequest);
router.post('/checkout', authMiddleware, controller.createCheckoutSession);

export default router;
