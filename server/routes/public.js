import express from 'express';
import { autoRegisterClub } from '../controllers/saasController.js';

const router = express.Router();

// This endpoint is used by the generic SaaS landing page (RegisterClub.tsx wizard)
router.post('/register-club', autoRegisterClub);

export default router;
