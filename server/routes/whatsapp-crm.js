/**
 * whatsapp-crm.js — Rutas del CRM WhatsApp
 * Todas las rutas requieren autenticación excepto el webhook
 */

import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import {
    // Config
    getConfig,
    upsertConfig,
    verifyConfig,
    // Contacts
    getContacts,
    createContact,
    updateContact,
    archiveContact,
    markMessagesRead,
    deleteContact,
    getContactMessages,
    sendMessageToContact,
    importContacts,
    fixPhoneNumbers,
    importFromLeads,
    // Lists
    getLists,
    createList,
    updateList,
    deleteList,
    addListMembers,
    removeListMembers,
    // Templates
    getTemplates,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    syncTemplatesFromMeta,
    // Campaigns
    getCampaigns,
    createCampaign,
    updateCampaign,
    deleteCampaign,
    sendCampaign,
    getCampaignLogs,
    // Analytics
    getAnalytics,
    // Webhook
    verifyWebhook,
    handleWebhook,
    // Custom Fields
    getCustomFields,
    createCustomField,
    deleteCustomField,
} from '../controllers/whatsappCRMController.js';

const router = express.Router();

// ── Webhook (PÚBLICO — sin auth, Meta necesita acceso directo) ────────────
router.get('/webhook', verifyWebhook);
router.post('/webhook', handleWebhook);

// ── Auth middleware para todo lo demás ───────────────────────────────────
router.use(authMiddleware);

// ── Configuración ────────────────────────────────────────────────────────
router.get('/config', getConfig);
router.post('/config', upsertConfig);
router.post('/config/verify', verifyConfig);

// ── Contactos ────────────────────────────────────────────────────────────
router.get('/contacts', getContacts);
router.post('/contacts', createContact);
router.put('/contacts/:id', updateContact);
router.post('/contacts/:id/archive', archiveContact);
router.post('/contacts/:id/read', markMessagesRead);
router.delete('/contacts/:id', deleteContact);
router.get('/contacts/:id/messages', getContactMessages);
router.post('/contacts/:id/send', sendMessageToContact);
router.post('/contacts/import', importContacts);           // Importar desde CSV (preprocesado)
router.post('/contacts/import/leads', importFromLeads);   // Importar desde tabla Lead
router.post('/fix-phones', fixPhoneNumbers);               // Corregir indicativos

// ── Listas / Segmentos ───────────────────────────────────────────────────
router.get('/lists', getLists);
router.post('/lists', createList);
router.put('/lists/:id', updateList);
router.delete('/lists/:id', deleteList);
router.post('/lists/:id/members', addListMembers);
router.delete('/lists/:id/members', removeListMembers);

// ── Templates ────────────────────────────────────────────────────────────
router.get('/templates', getTemplates);
router.post('/templates', createTemplate);
router.put('/templates/:id', updateTemplate);
router.delete('/templates/:id', deleteTemplate);
router.post('/templates/sync', syncTemplatesFromMeta);

// ── Campañas ─────────────────────────────────────────────────────────────
router.get('/campaigns', getCampaigns);
router.post('/campaigns', createCampaign);
router.put('/campaigns/:id', updateCampaign);
router.delete('/campaigns/:id', deleteCampaign);
router.post('/campaigns/:id/send', sendCampaign);
router.get('/campaigns/:id/logs', getCampaignLogs);

// ── Analytics ────────────────────────────────────────────────────────────
router.get('/analytics', getAnalytics);

// ── Campos Personalizados ────────────────────────────────────────────────
router.get('/custom-fields', getCustomFields);
router.post('/custom-fields', createCustomField);
router.delete('/custom-fields/:id', deleteCustomField);

// ── Media Upload for Chat ────────────────────────────────────────────────
import { uploadDocuments } from '../lib/storage.js';
router.post('/upload-media', uploadDocuments.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No se subió ningún archivo' });
    res.json({ url: req.file.location, originalName: req.file.originalname, mimeType: req.file.contentType });
});

export default router;
