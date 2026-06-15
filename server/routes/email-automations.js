import express from 'express';
import { authMiddleware, roleMiddleware } from '../middleware/auth.js';
import {
    listAutomations,
    getAutomation,
    createAutomation,
    updateAutomation,
    deleteAutomation,
    activateAutomation,
    deactivateAutomation,
} from '../controllers/emailAutomationController.js';

const router = express.Router();

router.use(authMiddleware);
router.use(roleMiddleware(['administrator', 'club_admin', 'district_admin']));

router.get('/', listAutomations);
router.get('/:id', getAutomation);
router.post('/', createAutomation);
router.put('/:id', updateAutomation);
router.delete('/:id', deleteAutomation);
router.post('/:id/activate', activateAutomation);
router.post('/:id/deactivate', deactivateAutomation);

export default router;
