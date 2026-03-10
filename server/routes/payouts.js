import express from 'express';
import { authMiddleware, roleMiddleware } from '../middleware/auth.js';
import {
    getClubBalance,
    requestPayout,
    getClubPayoutHistory,
    getAllPayoutRequests,
    updatePayoutStatus
} from '../controllers/payoutController.js';

const router = express.Router();

// All routes are protected
router.use(authMiddleware);

// Club/Admin routes (getting own balance and requesting payouts)
router.get('/balance', getClubBalance);
router.post('/request', requestPayout);
router.get('/history', getClubPayoutHistory);

// Super Admin only routes (managing payouts across the platform)
const superAdminRoles = ['administrator'];
router.get('/admin', roleMiddleware(superAdminRoles), getAllPayoutRequests);
router.put('/admin/:id', roleMiddleware(superAdminRoles), updatePayoutStatus);

export default router;
