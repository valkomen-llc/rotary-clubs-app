import express from 'express';
import { authMiddleware, roleMiddleware, requireSiteAdmin } from '../middleware/auth.js';
import {
    getClubBalance,
    requestPayout,
    getClubPayoutHistory,
    getAllPayoutRequests,
    updatePayoutStatus,
    getLedgerReconciliation,
    backfillLedger,
    getCentralOverview,
    getFeeRulesConfig,
    updateFeeRulesConfig,
    recalcFees,
    getPaymentMethodsConfig,
    updatePaymentMethodsConfig
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

// ═══════════════════════════════════════════════════════════════════
// ⚠️ LAS RUTAS LITERALES VAN ANTES QUE LA PARAMÉTRICA. NO REORDENAR.
// ═══════════════════════════════════════════════════════════════════
//
// Express casa en ORDEN de declaración, así que `/admin/:id` se traga
// «fee-rules», «overview» y «ledger» si va primero. No es hipotético: hasta
// v4.859 `PUT /admin/:id` estaba declarado ANTES que `PUT /admin/fee-rules`, y
// guardar la tarifa desde el panel caía en `updatePayoutStatus` con
// `id = 'fee-rules'` — respondía «Estado inválido. Los admitidos son: pending,
// processing…» y la tarifa NO se guardaba nunca. Se reportó como «intento
// cambiar el porcentaje a 2,1 y no me deja guardar».
//
// Lo más instructivo es que el aviso YA ESTABA ESCRITO en este archivo desde
// v4.847 —«al agregar un GET /admin/:id, éstas tienen que quedar ANTES»— y el
// defecto entró igual, por la otra puerta: con un PUT. Un comentario que
// depende de que alguien lo lea no protege nada. Por eso ahora lo comprueba una
// prueba (`test:fee-rules:route`), que lee este archivo y falla si una ruta
// literal queda por debajo de la paramétrica del mismo método.

router.get('/admin/overview', roleMiddleware(superAdminRoles), getCentralOverview);

// v4.854 — Las reglas de comisión. La tarifa es de la INFRAESTRUCTURA
// compartida, no de una organización: un administrador de sitio no la ve ni la
// cambia. Se comprueba acá, no sólo en la pantalla.
// v4.868 — Los métodos de pago: qué vías de cobro ofrece la plataforma y
// cuáles están activadas. Del operador, como la tarifa.
router.get('/admin/payment-methods', roleMiddleware(superAdminRoles), getPaymentMethodsConfig);
router.put('/admin/payment-methods', roleMiddleware(superAdminRoles), updatePaymentMethodsConfig);

router.get('/admin/fee-rules', roleMiddleware(superAdminRoles), getFeeRulesConfig);
router.put('/admin/fee-rules', roleMiddleware(superAdminRoles), updateFeeRulesConfig);

// v4.861 — Aplicar la tarifa vigente a los aportes que TODAVÍA NO se pueden
// retirar. De ENSAYO salvo `{"apply": true}`. Es la única vía por la que la
// retención de un cobro registrado cambia, y es deliberada.
router.post('/admin/fee-rules/recalculate', roleMiddleware(superAdminRoles), recalcFees);

// v4.847 — El libro mayor contra la Bóveda. Sólo lectura y sólo del operador:
// es una herramienta de migración sobre infraestructura compartida, y lo que
// muestra —cuánto historial le falta al libro nuevo— se lee como un descuadre
// si no se sabe qué se está mirando.
router.get('/admin/ledger/:clubId', roleMiddleware(superAdminRoles), getLedgerReconciliation);

// v4.848 — Carga el historial en el libro. De ENSAYO salvo `{"apply": true}`.
router.post('/admin/ledger/:clubId/backfill', roleMiddleware(superAdminRoles), backfillLedger);

// ── Y AL FINAL, las que llevan parámetro ────────────────────────────
router.get('/admin', roleMiddleware(superAdminRoles), getAllPayoutRequests);
router.put('/admin/:id', roleMiddleware(superAdminRoles), updatePayoutStatus);

export default router;
