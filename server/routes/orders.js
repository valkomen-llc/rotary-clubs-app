// ════════════════════════════════════════════════════════════════════════════
// Commerce SaaS Multi-Tenant — RUTAS DE PEDIDOS, INVENTARIO Y ENVÍOS
// v4.1096.0
// ════════════════════════════════════════════════════════════════════════════

import express from 'express';
import {
    createOrder,
    getOrderDetails,
    getAllOrders,
    updateOrderStatus,
    adjustInventory,
    getInventoryMovements,
    getShippingMethods,
    saveShippingMethod,
    validateCoupon,
    getCoupons,
    saveCoupon,
    getCustomerOrders
} from '../controllers/orderController.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

// ── Rutas Públicas de Tienda y Checkout ──────────────────────────────────────
router.post('/', createOrder);
router.post('/validate-coupon', validateCoupon);
router.get('/shipping-methods', getShippingMethods);

// ── Portal del Cliente / Mi Cuenta ───────────────────────────────────────────
router.get('/my-orders', getCustomerOrders);

// ── Gestión Administrativa de Inventario ─────────────────────────────────────
router.get('/inventory/movements', authMiddleware, getInventoryMovements);
router.post('/inventory/adjust', authMiddleware, adjustInventory);

// ── Métodos de Envío y Cupones (Admin) ───────────────────────────────────────
router.post('/shipping-methods', authMiddleware, saveShippingMethod);
router.get('/coupons', authMiddleware, getCoupons);
router.post('/coupons', authMiddleware, saveCoupon);

// ── Gestión Administrativa de Pedidos ────────────────────────────────────────
router.get('/', authMiddleware, getAllOrders);
router.get('/:id', getOrderDetails);
router.patch('/:id/status', authMiddleware, updateOrderStatus);

export default router;
