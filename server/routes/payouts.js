import express from 'express';
import { authMiddleware, roleMiddleware, requireSiteAdmin } from '../middleware/auth.js';
import {
    getClubBalance,
    requestPayout,
    getClubPayoutHistory,
    getAllPayoutRequests,
    updatePayoutStatus
} from '../controllers/payoutController.js';

const router = express.Router();

// All routes are protected
router.use(authMiddleware);

// v4.841 — El dinero del sitio es del ADMINISTRADOR del sitio, no de
// cualquiera con sesión. Hasta v4.840 estas tres rutas pasaban sólo por
// `authMiddleware`, que verifica firma y audiencia pero NO el rol: un usuario
// con rol `member` —que está en ADMIN_ROLES para entrar al panel y no en
// SITE_ADMIN_ROLES— podía leer el saldo, ver el historial de retiros y
// SOLICITAR uno. El aislamiento entre clubes sí estaba bien: el `clubId` sale
// del token y sólo el operador de plataforma puede pasar `?clubId=`.
router.get('/balance', requireSiteAdmin, getClubBalance);
router.post('/request', requireSiteAdmin, requestPayout);
router.get('/history', requireSiteAdmin, getClubPayoutHistory);

// Super Admin only routes (managing payouts across the platform)
const superAdminRoles = ['administrator'];
router.get('/admin', roleMiddleware(superAdminRoles), getAllPayoutRequests);
router.put('/admin/:id', roleMiddleware(superAdminRoles), updatePayoutStatus);

export default router;
