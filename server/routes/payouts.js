import express from 'express';
import { authMiddleware, roleMiddleware, requireSiteAdmin } from '../middleware/auth.js';
import {
    getClubBalance,
    requestPayout,
    getClubPayoutHistory,
    getAllPayoutRequests,
    updatePayoutStatus,
    getLedgerReconciliation,
    backfillLedger
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

// v4.847 — El libro mayor contra la Bóveda. Sólo lectura y sólo del operador:
// es una herramienta de migración sobre infraestructura compartida, y lo que
// muestra —cuánto historial le falta al libro nuevo— se lee como un descuadre
// si no se sabe qué se está mirando.
//
// Hoy no choca con `/admin/:id` porque aquélla es un PUT. Al agregar un
// `GET /admin/:id`, éste tiene que quedar ANTES o «ledger» caería en el
// parámetro — es lo que ya pasó con `/site/*` en las campañas.
router.get('/admin/ledger/:clubId', roleMiddleware(superAdminRoles), getLedgerReconciliation);

// v4.848 — Carga el historial en el libro. De ENSAYO salvo `{"apply": true}`.
router.post('/admin/ledger/:clubId/backfill', roleMiddleware(superAdminRoles), backfillLedger);

export default router;
