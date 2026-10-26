// Conciliación de inscripciones y traslados de un evento — v4.1250.
// Dominio financiero PROPIO de Eventos (no usa la Bóveda de Fondos). Los
// permisos se comprueban en el controlador (`payments` del evento + rol que
// aprueba para confirmar, revertir y los datos bancarios).
import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { uploadMemory } from '../lib/storage.js';
import {
    getEventFunds, getRegistrationFunds, saveConfig, verifyStripe, createTransfer, updateTransfer,
    uploadDocument, getDocument, previewNotice, sendNotice, vaultAudit,
} from '../controllers/eventFundsController.js';

const router = express.Router();
const json = express.json({ limit: '200kb' });
const pdf = uploadMemory.single('document');

router.get('/admin/vault-audit', authMiddleware, vaultAudit);
router.get('/events/:eventId', authMiddleware, getEventFunds);
router.get('/events/:eventId/registrations/:registrationId', authMiddleware, getRegistrationFunds);
router.put('/events/:eventId/config', authMiddleware, json, saveConfig);
router.post('/events/:eventId/verify-stripe', authMiddleware, json, verifyStripe);
router.post('/events/:eventId/transfers', authMiddleware, pdf, createTransfer);
router.patch('/events/:eventId/transfers/:transferId', authMiddleware, json, updateTransfer);
router.post('/events/:eventId/transfers/:transferId/documents', authMiddleware, pdf, uploadDocument);
router.get('/events/:eventId/transfers/:transferId/documents/:documentId', authMiddleware, getDocument);
router.post('/events/:eventId/transfers/:transferId/notices/preview', authMiddleware, json, previewNotice);
router.post('/events/:eventId/transfers/:transferId/notices', authMiddleware, json, sendNotice);

export default router;
