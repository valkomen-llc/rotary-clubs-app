/**
 * whatsapp-crm.js — Rutas del CRM WhatsApp
 * Todas las rutas requieren autenticación excepto el webhook
 */

import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { getContacts, getContactById, createContact, updateContact, deleteContact } from '../controllers/crm/contacts.controller.js';
import { getLists, getListById, createList, bulkCreateLists, updateList, deleteList, bulkUpdateLists, bulkDeleteLists, getLinkableSites } from '../controllers/crm/lists.controller.js';
import { getTags, getTagById, createTag, updateTag, deleteTag } from '../controllers/crm/tags.controller.js';
import { getCustomFields, createCustomField, updateCustomField, deleteCustomField } from '../controllers/crm/custom-fields.controller.js';
import { getGroups, createGroup, updateGroup, deleteGroup } from '../controllers/crm/custom-field-groups.controller.js';
import {
    getAutoReplies, createAutoReply, updateAutoReply, toggleAutoReply, deleteAutoReply,
    getAgentConfig, upsertAgentConfig, testAgentConfig, generateAgentInstruction,
    getAutomationDiagnostics, resumeAutomation,
} from '../controllers/crm/automation.controller.js';
import { importContacts } from '../controllers/crm/import.controller.js';
import { initBulkAction, processChunk, getActiveJobs } from '../controllers/crm/bulk.controller.js';
import {
    getConfig, upsertConfig, verifyConfig,
    archiveContact, deleteConversation, markMessagesRead, getContactMessages, sendMessageToContact, importFromLeads, fixPhoneNumbers,
    addListMembers, removeListMembers,
    getTemplates, createTemplate, updateTemplate, deleteTemplate, syncTemplatesFromMeta,
    getCampaigns, createCampaign, updateCampaign, deleteCampaign, sendCampaign, getCampaignLogs, getCampaignReport,
    getAnalytics, verifyWebhook, handleWebhook
} from '../controllers/crmController.js';

const router = express.Router();

// ── Webhook (PÚBLICO — sin auth, Meta necesita acceso directo) ────────────
router.get('/webhook', verifyWebhook);
router.post('/webhook', handleWebhook);

router.get('/fix-colombia-phones', async (req, res) => {
    try {
        const db = (await import('../lib/prisma.js')).default;
        const allContacts = await db.crmContact.findMany();
        const contacts = allContacts.filter(c => c.tags && c.tags.includes("Presidentes, Rotary 4281 (2026-27)"));
        const exclusions = ['85127173', '7547791907'];
        let updatedCount = 0;
        let logs = [];
        for (const contact of contacts) {
            let currentPhone = contact.phone.replace(/[\\+\\s\\-]/g, '');
            if (exclusions.includes(currentPhone) || currentPhone.startsWith('57')) continue;
            const newPhone = '57' + currentPhone;
            await db.crmContact.update({ where: { id: contact.id }, data: { phone: newPhone } });
            updatedCount++;
            logs.push(`Updated ${contact.name}: ${currentPhone} -> ${newPhone}`);
        }
        res.json({ success: true, found: contacts.length, updatedCount, logs });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ── Auth middleware para todo lo demás ───────────────────────────────────
router.use(authMiddleware);

// ── Configuración ────────────────────────────────────────────────────────
router.get('/config', getConfig);
router.post('/config', upsertConfig);
router.post('/config/verify', verifyConfig);

router.get('/kill-locks', async (req, res) => {
    try {
        const db = (await import('../db.js')).default;
        const r = await db.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE state != 'idle' AND pid <> pg_backend_pid();");
        res.json({ killed: r.rowCount });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// ── Contactos (NUEVO) ────────────────────────────────────────────────────
router.get('/contacts', getContacts);
router.get('/contacts/:id', getContactById);
router.post('/contacts', createContact);
router.put('/contacts/:id', updateContact);
router.delete('/contacts/:id', deleteContact);

// Rutas Legacy WhatsApp
router.post('/contacts/:id/archive', archiveContact);
router.delete('/contacts/:id/conversation', deleteConversation);
router.post('/contacts/:id/read', markMessagesRead);
router.get('/contacts/:id/messages', getContactMessages);
router.post('/contacts/:id/send', sendMessageToContact);
router.post('/contacts/import', importContacts);           
router.post('/contacts/import/leads', importFromLeads);
router.post('/contacts/bulk-action/init', initBulkAction);
router.post('/contacts/bulk-action/process-chunk', processChunk);
router.get('/contacts/bulk-action/active', getActiveJobs);
router.post('/fix-phones', fixPhoneNumbers);               

// ── Listas (NUEVO) ───────────────────────────────────────────────────────
router.get('/lists', getLists);
router.get('/lists/:id', getListById);
router.post('/lists', createList);
router.post('/lists/bulk', bulkCreateLists); // Creación masiva por nombres (importar listados)
router.post('/lists/bulk-update', bulkUpdateLists); // Etiquetas/sitios en lote
router.post('/lists/bulk-delete', bulkDeleteLists); // Eliminación en lote
router.get('/sites', getLinkableSites); // Sitios vinculables (clubs + distritos)
router.put('/lists/:id', updateList);
router.delete('/lists/:id', deleteList);
router.post('/lists/:id/members', addListMembers); // Legacy para WhatsApp (opcional)
router.delete('/lists/:id/members', removeListMembers); // Legacy

// ── Etiquetas (NUEVO) ────────────────────────────────────────────────────
router.get('/tags', getTags);
router.get('/tags/:id', getTagById);
router.post('/tags', createTag);
router.put('/tags/:id', updateTag);
router.delete('/tags/:id', deleteTag);

// ── Campos Personalizados (NUEVO) ────────────────────────────────────────
router.get('/custom-fields', getCustomFields);
router.post('/custom-fields', createCustomField);
router.put('/custom-fields/:id', updateCustomField);
router.delete('/custom-fields/:id', deleteCustomField);

router.get('/custom-field-groups', getGroups);
router.post('/custom-field-groups', createGroup);
router.put('/custom-field-groups/:id', updateGroup);
router.delete('/custom-field-groups/:id', deleteGroup);

// ── Automatización: Respuestas automáticas + Agente IA ───────────────────
router.get('/auto-replies', getAutoReplies);
router.post('/auto-replies', createAutoReply);
router.put('/auto-replies/:id', updateAutoReply);
router.patch('/auto-replies/:id/toggle', toggleAutoReply);
router.delete('/auto-replies/:id', deleteAutoReply);

router.get('/agent-config', getAgentConfig);
router.put('/agent-config', upsertAgentConfig);
router.post('/agent-config/test', testAgentConfig);
router.post('/agent-config/generate-instruction', generateAgentInstruction);
router.get('/agent-config/diagnostics', getAutomationDiagnostics);
router.post('/agent-config/resume', resumeAutomation);

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
router.get('/campaigns/:id/report', getCampaignReport);

// ── Analytics ────────────────────────────────────────────────────────────
router.get('/analytics', getAnalytics);

// ── Motor de automatización (v4.695) ─────────────────────────────────────
// El control de permisos NO está acá sino dentro del controlador
// (`denyIfNotOperator` / `scopeSiteFilter`), a propósito: varios de estos
// endpoints responden cosas distintas según quién pregunta —el operador de la
// plataforma ve todos los sitios, el administrador de uno ve el suyo— y eso no
// se puede expresar con un middleware de "pasa o no pasa".
import * as engine from '../controllers/crm/automation.engine.controller.js';

router.get('/automation/catalog', engine.getCatalog);
router.get('/automation/overview', engine.getAutomationOverview);
router.get('/automation/settings', engine.getSettings);
router.put('/automation/settings', engine.updateSettings);
router.post('/automation/tick', engine.runTickNow);

router.get('/journeys', engine.getJourneys);
router.post('/journeys', engine.createJourney);
router.get('/journeys/:id', engine.getJourneyDetail);
router.put('/journeys/:id', engine.updateJourney);
router.delete('/journeys/:id', engine.deleteJourney);
router.patch('/journeys/:id/status', engine.setJourneyStatus);
router.get('/journeys/:id/runs', engine.getJourneyRuns);
router.post('/journeys/:id/enroll', engine.enrollInJourney);
router.get('/journey-runs/:runId', engine.getRunTrace);

router.get('/lifecycle', engine.getLifecycleBoard);
router.post('/lifecycle/sync', engine.syncLifecycle);
router.put('/lifecycle/:siteId', engine.setLifecycleManual);

router.post('/segments/preview', engine.previewSegment);

router.get('/alerts', engine.getAlerts);
router.patch('/alerts/:id/resolve', engine.resolveAlert);

router.get('/suppressions', engine.getSuppressions);
router.post('/suppressions', engine.addSuppression);
router.delete('/suppressions/:phone', engine.removeSuppression);

// ── Bandeja de conversaciones, enrutamiento y agentes (v4.696) ───────────
// Igual que arriba: los permisos van DENTRO del controlador, porque estos
// endpoints responden cosas distintas al operador de la plataforma, al agente
// y al administrador de un sitio.
import * as inbox from '../controllers/crm/inbox.controller.js';

router.get('/inbox/catalog', inbox.getInboxCatalog);
router.get('/inbox', inbox.getInbox);
router.get('/inbox/booking-link', inbox.getBookingLink);
router.get('/conversations/:id', inbox.getConversation);
router.patch('/conversations/:id', inbox.patchConversation);
router.post('/conversations/:id/claim', inbox.claimConversation);
router.post('/conversations/:id/notes', inbox.createNote);
router.post('/conversations/:id/reply', inbox.replyConversation);
router.post('/conversations/:id/escalate', inbox.escalate);
router.post('/conversations/:id/training', inbox.linkTraining);

router.get('/routing-rules', inbox.getRoutingRules);
router.post('/routing-rules', inbox.upsertRoutingRule);
router.put('/routing-rules/:id', inbox.upsertRoutingRule);
router.delete('/routing-rules/:id', inbox.deleteRoutingRule);

router.get('/agents', inbox.getAgents);
router.get('/agents/assignable', inbox.getAssignableUsers);
router.put('/agents', inbox.putAgent);
router.delete('/agents/:userId', inbox.deleteAgent);

router.put('/chatbot', inbox.updateChatbotSettings);

// ── Analítica, centro de campañas y calendario (Fase 4, v4.697) ─────────
import * as analytics from '../controllers/crm/analytics.controller.js';

router.get('/analytics/dashboard', analytics.getAnalyticsDashboard);
router.get('/analytics/journeys/:id/funnel', analytics.getJourneyFunnel);
router.get('/analytics/campaigns', analytics.getCampaignCenter);
router.get('/analytics/calendar', analytics.getCommunicationCalendar);
router.get('/analytics/recommendations', analytics.getRecommendations);
router.post('/alerts/sweep', analytics.runAlertSweep);
router.put('/automation/budget', analytics.updateBudget);

// ── Media Upload for Chat ────────────────────────────────────────────────
import { uploadWAMedia } from '../lib/storage.js';
router.post('/upload-media', uploadWAMedia.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No se subió ningún archivo' });
    res.json({ url: req.file.location, originalName: req.file.originalname, mimeType: req.file.contentType });
});

export default router;
