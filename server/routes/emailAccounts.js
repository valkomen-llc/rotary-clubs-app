import express from 'express';
import {
    getEmailAccounts,
    createEmailAccount,
    deleteEmailAccount,
    getAccountMessages,
    updateMessage,
    deleteMessage,
    getEmailDiagnostics,
    testSendEmail,
    provisionInbound
} from '../controllers/EmailAccountController.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

router.use(authMiddleware);

// Diagnóstico de configuración de correo (estado real del dominio en Resend).
router.get('/diagnostics', getEmailDiagnostics);

// Prueba de envío que devuelve la respuesta cruda de Resend.
router.post('/test-send', testSendEmail);

// Provisión de recepción: crea el webhook email.received + buzones por defecto para
// todos los dominios conectados a Resend, y reporta el estado del MX por dominio.
router.post('/provision-inbound', provisionInbound);

// Bandeja real (correos recibidos vía Resend Inbound).
router.get('/messages', getAccountMessages);
router.patch('/messages/:id', updateMessage);
router.delete('/messages/:id', deleteMessage);

router.get('/', getEmailAccounts);
router.post('/', createEmailAccount);
router.delete('/:id', deleteEmailAccount);

export default router;
