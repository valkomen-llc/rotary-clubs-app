import express from 'express';
import { authMiddleware, roleMiddleware } from '../middleware/auth.js';
import { getFooterSkins, updateFooterSkin } from '../controllers/systemController.js';

const router = express.Router();
const superAdminOnly = roleMiddleware(['administrator']);

router.use(authMiddleware);

router.get('/footer-skins', superAdminOnly, getFooterSkins);
router.post('/footer-skins/:type', superAdminOnly, updateFooterSkin);

export default router;
