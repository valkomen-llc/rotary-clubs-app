import express from 'express';
import { 
    getEmailAccounts, 
    createEmailAccount, 
    deleteEmailAccount 
} from '../controllers/EmailAccountController.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

router.use(authMiddleware);

router.get('/', getEmailAccounts);
router.post('/', createEmailAccount);
router.delete('/:id', deleteEmailAccount);

export default router;
