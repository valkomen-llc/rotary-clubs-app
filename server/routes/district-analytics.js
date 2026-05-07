import express from 'express';
import { getDistrictHealth } from '../controllers/districtAnalyticsController.js';

const router = express.Router();

// GET /api/district-analytics/health
router.get('/health', getDistrictHealth);

export default router;
