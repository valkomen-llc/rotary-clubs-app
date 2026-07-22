import express from 'express';
import { authMiddleware, roleMiddleware } from '../middleware/auth.js';
import {
    listCampaigns,
    previewAudience,
    getCampaign,
    createCampaign,
    updateCampaign,
    deleteCampaign,
    sendCampaign,
    sendTest,
    scheduleCampaign,
    unscheduleCampaign,
    getReport,
    getStats,
    getDashboard,
    getTags,
} from '../controllers/emailMarketingController.js';
import { assist } from '../controllers/emailAiController.js';

const router = express.Router();

// Email Marketing: disponible para el administrador global y los administradores de sitio.
// La visibilidad fina (solo sitios tipo "Evento o Convención") se controla en el menú del
// frontend; aquí se autoriza por rol y se scopea por clubId del usuario.
router.use(authMiddleware);
router.use(roleMiddleware(['administrator', 'club_admin', 'district_admin']));

router.get('/', listCampaigns);
router.get('/stats', getStats);
router.get('/dashboard', getDashboard);
router.get('/tags', getTags);
router.get('/audience', previewAudience);
router.get('/:id/report', getReport);
router.get('/:id', getCampaign);
router.post('/', createCampaign);
router.post('/test-send', sendTest);
router.post('/ai/assist', assist);
router.put('/:id', updateCampaign);
router.delete('/:id', deleteCampaign);
router.post('/:id/send', sendCampaign);
router.post('/:id/schedule', scheduleCampaign);
router.post('/:id/unschedule', unscheduleCampaign);

export default router;
