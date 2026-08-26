import express from 'express';
import { login, impersonate, forgotPassword, resetPassword } from '../controllers/authController.js';
import { resolveSession } from '../controllers/sessionController.js';
import { verifyEmail, resendCode } from '../controllers/verificationController.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

// Acceso unificado del encabezado: resuelve por sí mismo si las credenciales
// son de un administrador del sitio o de un Gestor de Proyectos, y devuelve la
// ruta de destino. `/login` se mantiene para lo que ya lo usa.
router.post('/session', resolveSession);
router.post('/login', login);
// Recuperación de contraseña de la identidad de plataforma (v4.932). Mismo
// flujo que los portales de Feria y Evento: enlace con token que vence, nunca
// la contraseña por correo. La respuesta de `/forgot` es idéntica exista o no
// el correo, para que el endpoint no sirva de censo de direcciones.
router.post('/forgot', forgotPassword);
router.post('/reset', resetPassword);
router.post('/verify-email', verifyEmail);
router.post('/resend-code', resendCode);
router.post('/impersonate', authMiddleware, impersonate);

export default router;
