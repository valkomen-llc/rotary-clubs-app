import express from 'express';
import {
    getEmailAccounts,
    createEmailAccount,
    updateEmailAccount,
    deleteEmailAccount,
    bulkDeleteEmailAccounts,
    getAccountMessages,
    updateMessage,
    deleteMessage,
    repairMessageAttachments,
    getEmailDiagnostics,
    testSendEmail,
    provisionInbound,
    listDrafts,
    saveDraft,
    deleteDraft,
    presignComposeAttachment
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

// Adjuntos del compositor: el archivo sube DIRECTO a S3 con URL prefirmada
// (v4.953) — por el cuerpo de la función el 413 de Vercel lo cortaba en 4,5 MB.
router.post('/attachments/presign', presignComposeAttachment);

// Borradores del compositor.
router.get('/drafts', listDrafts);
router.post('/drafts', saveDraft);
router.delete('/drafts/:id', deleteDraft);

// Bandeja real (correos recibidos vía Resend Inbound).
router.get('/messages', getAccountMessages);
router.patch('/messages/:id', updateMessage);
router.delete('/messages/:id', deleteMessage);
// Recupera de Resend los adjuntos que quedaron guardados sin URL de descarga.
router.post('/messages/:id/repair-attachments', repairMessageAttachments);

// ⚠️ Las literales ANTES que las paramétricas: Express casa por orden de
// declaración y una literal debajo de su `:id` es INALCANZABLE, con un fallo
// mudo — la petición cae en el manejador equivocado. Lo comprueba
// `npm run check:routes`.
router.post('/bulk-delete', bulkDeleteEmailAccounts);

router.get('/', getEmailAccounts);
router.post('/', createEmailAccount);
router.patch('/:id', updateEmailAccount);
router.delete('/:id', deleteEmailAccount);

export default router;
