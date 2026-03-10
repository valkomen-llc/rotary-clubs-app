import express from 'express';
import {
    getNotificationConfig,
    upsertNotificationConfig,
    getTemplates,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    getCommunicationLogs,
    sendCommunication
} from '../controllers/communicationController.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(authMiddleware);

// Config
router.get('/config', getNotificationConfig);
router.post('/config', upsertNotificationConfig);

// Templates
router.get('/templates', getTemplates);
router.post('/templates', createTemplate);
router.put('/templates/:id', updateTemplate);
router.delete('/templates/:id', deleteTemplate);

// Logs
router.get('/logs', getCommunicationLogs);

// Send Campaign or Quick Message
router.post('/send', sendCommunication);

export default router;
