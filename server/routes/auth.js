import express from 'express';
import { login, impersonate } from '../controllers/authController.js';
import { resolveSession } from '../controllers/sessionController.js';
import { verifyEmail, resendCode } from '../controllers/verificationController.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

// Acceso unificado del encabezado: resuelve por sí mismo si las credenciales
// son de un administrador del sitio o de un Gestor de Proyectos, y devuelve la
// ruta de destino. `/login` se mantiene para lo que ya lo usa.
router.post('/session', resolveSession);
router.post('/login', login);
router.post('/verify-email', verifyEmail);
router.post('/resend-code', resendCode);
router.post('/impersonate', authMiddleware, impersonate);

export default router;
