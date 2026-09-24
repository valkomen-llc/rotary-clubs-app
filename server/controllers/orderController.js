// ════════════════════════════════════════════════════════════════════════════
// Commerce SaaS Multi-Tenant — CONTROLADOR CENTRAL DE PEDIDOS E INVENTARIO
// v4.1096.0
//
// Gestiona el ciclo completo de pedidos:
//  - Creación con validación estricta de precios desde DB (anti-manipulación)
//  - Verificación y reserva de inventario
//  - Cupones de descuento y métodos de envío por Club
//  - Abstracción de pasarelas de pago (Stripe, Transferencia, Externo)
//  - Snapshot inmutable de precios en líneas de pedido (OrderItem)
//  - Auditoría y trazabilidad de movimientos de inventario (InventoryMovement)
//  - Aislamiento multi-tenant estricto por clubId
// ════════════════════════════════════════════════════════════════════════════

import prisma from '../lib/prisma.js';
import db from '../lib/db.js';
import { ensureCommerceSchema } from '../lib/ensureCommerceSchema.js';
import { getCommercePaymentProvider } from '../services/commerce/PaymentProvider.js';

// Resuelve la moneda del club: setting club_currency, o por país (Colombia → COP), o USD.
export async function resolveClubCurrency(clubId) {
    try {
        const s = await db.query('SELECT value FROM "Setting" WHERE key = $1 AND "clubId" = $2 LIMIT 1', ['club_currency', clubId]);
        if (s.rows[0]?.value) return String(s.rows[0].value).toUpperCase();
        const c = await db.query('SELECT country FROM "Club" WHERE id = $1 LIMIT 1', [clubId]);
        const country = String(c.rows[0]?.country || '').toLowerCase();
        return /colombia|^co$/.test(country) ? 'COP' : 'USD';
    } catch {
        return 'USD';
    }
}

// ── CREAR PEDIDO (CHECKOUT) ──────────────────────────────────────────────────
export const createOrder = async (req, res) => {
    try {
        await ensureCommerceSchema();

        const {
            items,
            customer,
            shipping,
            clubId,
            shippingMethodId,
            couponCode,
            paymentMethod = 'stripe',
            notes
        } = req.body;

        if (!clubId) {
            return res.status(400).json({ error: 'clubId es requerido' });
        }
        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: 'El carrito no contiene productos o aportes' });
        }
        if (!customer || !customer.email || !customer.firstName) {
            return res.status(400).json({ error: 'Nombre y correo electrónico del comprador son requeridos' });
        }

        // 1. Obtener club y moneda
        const club = await prisma.club.findUnique({
            where: { id: clubId },
            select: { id: true, name: true, logo: true, subdomain: true, colors: true }
        });
        if (!club) {
            return res.status(404).json({ error: 'Club no encontrado' });
        }
        const currency = await resolveClubCurrency(clubId);

        // 2. Validar precios e inventario directamente desde la base de datos (seguridad server-side)
        let subtotal = 0;
        const verifiedOrderItems = [];

        for (const rawItem of items) {
            const qty = Math.max(1, parseInt(rawItem.qty, 10) || 1);

            if (rawItem.type === 'product' && rawItem.productId) {
                const product = await prisma.product.findUnique({
                    where: { id: rawItem.productId },
                    include: { variants: true }
                });

                if (!product || product.clubId !== clubId) {
                    return res.status(400).json({
                        error: `El producto "${rawItem.title || 'Solicitado'}" no pertenece a este club o ya no existe.`
                    });
                }
                if (!product.published || !product.isAvailable) {
                    return res.status(400).json({
                        error: `El producto "${product.name}" no se encuentra disponible para la venta.`
                    });
                }

                let unitPrice = Number(product.price) || 0;
                let variant = null;

                if (rawItem.variantId) {
                    variant = product.variants.find(v => v.id === rawItem.variantId);
                    if (variant && variant.priceOverride != null) {
                        unitPrice = Number(variant.priceOverride);
                    }
                }

                // Chequeo de stock
                const availableStock = variant ? variant.stock : product.stock;
                if (availableStock < qty) {
                    return res.status(400).json({
                        error: `Inventario insuficiente para "${product.name}". Disponibles: ${availableStock}, solicitados: ${qty}.`
                    });
                }

                const lineTotal = unitPrice * qty;
                subtotal += lineTotal;

                verifiedOrderItems.push({
                    type: 'product',
                    title: product.name,
                    qty,
                    unitPrice,
                    total: lineTotal,
                    productId: product.id,
                    variantId: variant ? variant.id : null,
                    metadata: JSON.stringify({
                        image: product.images?.[0] || null,
                        sku: variant?.sku || product.sku || null,
                        type: product.type
                    })
                });
            } else {
                // Donaciones, membresías u otros conceptos
                const unitPrice = Math.max(0, parseFloat(rawItem.unitPrice) || 0);
                const lineTotal = unitPrice * qty;
                subtotal += lineTotal;

                verifiedOrderItems.push({
                    type: rawItem.type || 'donation',
                    title: rawItem.title || 'Aporte',
                    qty,
                    unitPrice,
                    total: lineTotal,
                    productId: null,
                    variantId: null,
                    metadata: rawItem.metadata ? JSON.stringify(rawItem.metadata) : null
                });
            }
        }

        // 3. Validar Cupón de Descuento (si se envía)
        let discount = 0;
        let appliedCouponCode = null;
        if (couponCode) {
            try {
                const couponRes = await db.query(
                    `SELECT * FROM "CommerceCoupon"
                      WHERE "clubId" = $1 AND UPPER("code") = UPPER($2) AND "isActive" = true
                      LIMIT 1`,
                    [clubId, couponCode.trim()]
                );
                if (couponRes.rows.length > 0) {
                    const c = couponRes.rows[0];
                    const now = new Date();
                    const validDates = (!c.startDate || new Date(c.startDate) <= now) && (!c.endDate || new Date(c.endDate) >= now);
                    const validUses = c.usedCount < c.maxUses;
                    const validMin = subtotal >= Number(c.minOrderAmount || 0);

                    if (validDates && validUses && validMin) {
                        if (c.discountType === 'percent') {
                            discount = Math.round((subtotal * Number(c.discountValue)) / 100);
                        } else {
                            discount = Math.min(subtotal, Number(c.discountValue));
                        }
                        appliedCouponCode = c.code;

                        // Incrementar contador de usos
                        await db.query(`UPDATE "CommerceCoupon" SET "usedCount" = "usedCount" + 1 WHERE id = $1`, [c.id]);
                    }
                }
            } catch (err) {
                console.warn('[COMMERCE] Error evaluando cupón:', err.message);
            }
        }

        // 4. Calcular Envío
        let shippingCost = 0;
        let shippingMethodName = 'No aplica';
        const hasPhysical = verifiedOrderItems.some(i => i.type === 'product');

        if (hasPhysical && shippingMethodId) {
            try {
                const shipRes = await db.query(
                    `SELECT * FROM "CommerceShippingMethod" WHERE id = $1 AND "clubId" = $2 AND "isActive" = true LIMIT 1`,
                    [shippingMethodId, clubId]
                );
                if (shipRes.rows.length > 0) {
                    const s = shipRes.rows[0];
                    shippingMethodName = s.name;
                    if (s.minOrderFree && subtotal >= Number(s.minOrderFree)) {
                        shippingCost = 0;
                    } else {
                        shippingCost = Number(s.price) || 0;
                    }
                }
            } catch (err) {
                console.warn('[COMMERCE] Error evaluando método de envío:', err.message);
            }
        }

        // 5. Total final garantizado
        const total = Math.max(0, subtotal - discount + shippingCost);

        // 6. Generar número de pedido único y legible
        const orderNumber = `ORD-${Date.now().toString().slice(-6)}-${Math.floor(100 + Math.random() * 900)}`;

        // Historial inicial
        const initialHistory = JSON.stringify([
            { status: 'pending', date: new Date().toISOString(), note: 'Pedido creado desde el checkout' }
        ]);

        // 7. Crear el Pedido en Base de Datos
        const order = await prisma.order.create({
            data: {
                clubId,
                currency,
                subtotal,
                discount,
                shipping: shippingCost,
                total,
                status: 'pending',
                orderNumber,
                shippingStatus: hasPhysical ? 'pending' : 'not_required',
                shippingMethod: shippingMethodName,
                shippingAddress: shipping ? JSON.stringify(shipping) : null,
                paymentMethod,
                paymentStatus: 'pending',
                notes: notes || null,
                history: initialHistory,
                customerName: `${customer.firstName} ${customer.lastName || ''}`.trim(),
                customerEmail: customer.email.toLowerCase().trim(),
                customerPhone: customer.phone || null,
                userId: req.user?.id || null,
                items: {
                    create: verifiedOrderItems
                }
            },
            include: {
                items: true
            }
        });

        // 8. Iniciar el Pago con el Provider Abstraction
        const provider = getCommercePaymentProvider(paymentMethod, clubId);
        const paymentResult = await provider.initiatePayment({
            order,
            customer
        });

        // 9. Si el pago es Manual/Transferencia, marcar como payment_pending
        if (paymentMethod === 'manual' || paymentMethod === 'manual_transfer') {
            await prisma.order.update({
                where: { id: order.id },
                data: {
                    status: 'payment_pending',
                    paymentStatus: 'pending'
                }
            });
        }

        res.status(201).json({
            success: true,
            order,
            paymentResult
        });
    } catch (error) {
        console.error('[COMMERCE_ERROR] ORDER_CREATE_FAILED', {
            error: error.message,
            stack: error.stack
        });
        res.status(500).json({ error: error.message || 'Error al procesar el pedido' });
    }
};

// ── OBTENER DETALLE DE PEDIDO ────────────────────────────────────────────────
export const getOrderDetails = async (req, res) => {
    try {
        const { id } = req.params;
        const order = await prisma.order.findUnique({
            where: { id },
            include: {
                items: true,
                payments: { orderBy: { createdAt: 'desc' } },
                club: {
                    select: { id: true, name: true, logo: true, colors: true, subdomain: true }
                }
            }
        });

        if (!order) {
            return res.status(404).json({ error: 'Pedido no encontrado' });
        }

        res.json({ order });
    } catch (error) {
        console.error('Error in getOrderDetails:', error);
        res.status(500).json({ error: 'Error al consultar el pedido' });
    }
};

// ── LISTAR PEDIDOS DEL TENANT (ADMIN) ─────────────────────────────────────────
export const getAllOrders = async (req, res) => {
    try {
        await ensureCommerceSchema();

        let targetClubId = req.user?.clubId || req.query.clubId;
        const isSuperAdmin = req.user?.role === 'superadmin' || req.user?.role === 'administrator';

        if (!targetClubId && !isSuperAdmin) {
            return res.status(400).json({ error: 'clubId es requerido' });
        }

        let whereClause = {};
        if (targetClubId) {
            whereClause.clubId = targetClubId;
        }

        // Filtro por estado
        if (req.query.status && req.query.status !== 'all') {
            whereClause.status = req.query.status;
        }

        // Búsqueda por número o cliente
        if (req.query.search) {
            const search = String(req.query.search).trim();
            whereClause.OR = [
                { orderNumber: { contains: search, mode: 'insensitive' } },
                { customerName: { contains: search, mode: 'insensitive' } },
                { customerEmail: { contains: search, mode: 'insensitive' } }
            ];
        }

        const orders = await prisma.order.findMany({
            where: whereClause,
            include: {
                items: true,
                payments: { orderBy: { createdAt: 'desc' }, take: 1 }
            },
            orderBy: {
                createdAt: 'desc'
            },
            take: 100
        });

        res.json({ orders });
    } catch (error) {
        console.error('Error in getAllOrders:', error);
        res.status(500).json({ error: 'Error al listar los pedidos' });
    }
};

// ── ACTUALIZAR ESTADO DEL PEDIDO (ADMIN) ──────────────────────────────────────
export const updateOrderStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, shippingStatus, trackingNumber, note } = req.body;

        const order = await prisma.order.findUnique({
            where: { id },
            include: { items: true }
        });

        if (!order) {
            return res.status(404).json({ error: 'Pedido no encontrado' });
        }

        // Validar permisos multi-tenant
        if (req.user?.role !== 'superadmin' && req.user?.role !== 'administrator' && req.user?.clubId !== order.clubId) {
            return res.status(403).json({ error: 'No tienes permiso para modificar pedidos de este club' });
        }

        const updateData = {};
        if (status) updateData.status = status;
        if (shippingStatus) updateData.shippingStatus = shippingStatus;
        if (trackingNumber !== undefined) updateData.trackingNumber = trackingNumber;

        // Historial
        let history = [];
        try {
            if (order.history) history = JSON.parse(order.history);
        } catch {
            history = [];
        }

        history.push({
            status: status || order.status,
            shippingStatus: shippingStatus || order.shippingStatus,
            date: new Date().toISOString(),
            by: req.user?.email || 'admin',
            note: note || `Actualización a ${status || order.status}`
        });
        updateData.history = JSON.stringify(history);

        // Si cambia a 'paid' y antes no estaba pagado: descontar inventario y registrar movimiento
        if (status === 'paid' && order.status !== 'paid') {
            updateData.paymentStatus = 'paid';
            for (const item of order.items) {
                if (item.type === 'product' && item.productId) {
                    try {
                        const prod = await prisma.product.findUnique({ where: { id: item.productId } });
                        if (prod) {
                            const prev = prod.stock;
                            const next = Math.max(0, prev - item.qty);
                            await prisma.product.update({
                                where: { id: prod.id },
                                data: { stock: next }
                            });
                            await db.query(
                                `INSERT INTO "InventoryMovement"
                                  ("clubId", "productId", "variantId", "type", "quantity", "previousStock", "newStock", "reason", "reference", "createdBy")
                                 VALUES ($1, $2, $3, 'sale', $4, $5, $6, 'Venta en pedido', $7, $8)`,
                                [order.clubId, prod.id, item.variantId || null, -item.qty, prev, next, order.orderNumber || order.id, req.user?.email || 'system']
                            );
                        }
                    } catch (e) {
                        console.error('[COMMERCE] Error descontando inventario en actualización manual:', e);
                    }
                }
            }
        }

        // Si se cancela un pedido que ya estaba pagado: restaurar inventario
        if (status === 'cancelled' && order.status === 'paid') {
            for (const item of order.items) {
                if (item.type === 'product' && item.productId) {
                    try {
                        const prod = await prisma.product.findUnique({ where: { id: item.productId } });
                        if (prod) {
                            const prev = prod.stock;
                            const next = prev + item.qty;
                            await prisma.product.update({
                                where: { id: prod.id },
                                data: { stock: next }
                            });
                            await db.query(
                                `INSERT INTO "InventoryMovement"
                                  ("clubId", "productId", "variantId", "type", "quantity", "previousStock", "newStock", "reason", "reference", "createdBy")
                                 VALUES ($1, $2, $3, 'cancellation', $4, $5, $6, 'Cancelación de pedido pagado', $7, $8)`,
                                [order.clubId, prod.id, item.variantId || null, item.qty, prev, next, order.orderNumber || order.id, req.user?.email || 'system']
                            );
                        }
                    } catch (e) {
                        console.error('[COMMERCE] Error restaurando inventario:', e);
                    }
                }
            }
        }

        const updatedOrder = await prisma.order.update({
            where: { id },
            data: updateData,
            include: { items: true, payments: true }
        });

        res.json({ success: true, order: updatedOrder });
    } catch (error) {
        console.error('Error in updateOrderStatus:', error);
        res.status(500).json({ error: 'Error al actualizar el estado del pedido' });
    }
};

// ── AJUSTE MANUAL DE INVENTARIO (ADMIN) ───────────────────────────────────────
export const adjustInventory = async (req, res) => {
    try {
        await ensureCommerceSchema();

        const { productId, variantId, type, quantity, reason, clubId } = req.body;
        const targetClubId = clubId || req.user?.clubId;

        if (!productId || !quantity || !type) {
            return res.status(400).json({ error: 'productId, quantity y type son requeridos' });
        }

        const product = await prisma.product.findUnique({
            where: { id: productId }
        });
        if (!product || product.clubId !== targetClubId) {
            return res.status(404).json({ error: 'Producto no encontrado en este club' });
        }

        const prev = product.stock;
        const qtyNum = parseInt(quantity, 10);
        let next = prev;

        if (type === 'inflow' || type === 'return') {
            next = prev + Math.abs(qtyNum);
        } else if (type === 'loss' || type === 'adjustment_sub') {
            next = Math.max(0, prev - Math.abs(qtyNum));
        } else if (type === 'set') {
            next = Math.max(0, qtyNum);
        }

        await prisma.product.update({
            where: { id: productId },
            data: { stock: next }
        });

        const movRes = await db.query(
            `INSERT INTO "InventoryMovement"
              ("clubId", "productId", "variantId", "type", "quantity", "previousStock", "newStock", "reason", "reference", "createdBy")
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
             RETURNING *`,
            [
                targetClubId,
                productId,
                variantId || null,
                type,
                next - prev,
                prev,
                next,
                reason || 'Ajuste manual de administración',
                'ADMIN-ADJUST',
                req.user?.email || 'admin'
            ]
        );

        res.json({
            success: true,
            productId,
            previousStock: prev,
            newStock: next,
            movement: movRes.rows[0]
        });
    } catch (error) {
        console.error('Error in adjustInventory:', error);
        res.status(500).json({ error: 'Error al ajustar inventario' });
    }
};

// ── HISTORIAL DE MOVIMIENTOS DE INVENTARIO (ADMIN) ───────────────────────────
export const getInventoryMovements = async (req, res) => {
    try {
        await ensureCommerceSchema();

        const clubId = req.query.clubId || req.user?.clubId;
        if (!clubId) {
            return res.status(400).json({ error: 'clubId es requerido' });
        }

        const movements = await db.query(
            `SELECT m.*, p.name as "productName", p.sku as "productSku"
               FROM "InventoryMovement" m
               LEFT JOIN "Product" p ON p.id = m."productId"
              WHERE m."clubId" = $1
              ORDER BY m."createdAt" DESC
              LIMIT 100`,
            [clubId]
        );

        res.json({ movements: movements.rows });
    } catch (error) {
        console.error('Error in getInventoryMovements:', error);
        res.status(500).json({ error: 'Error al consultar movimientos de inventario' });
    }
};

// ── GESTIÓN DE MÉTODOS DE ENVÍO ──────────────────────────────────────────────
export const getShippingMethods = async (req, res) => {
    try {
        await ensureCommerceSchema();
        const clubId = req.query.clubId || req.user?.clubId;
        if (!clubId) return res.status(400).json({ error: 'clubId requerido' });

        const rows = await db.query(
            `SELECT * FROM "CommerceShippingMethod" WHERE "clubId" = $1 ORDER BY "price" ASC`,
            [clubId]
        );

        // Si no tiene ninguno configurado, ofrecer los 3 predeterminados listos
        if (rows.rows.length === 0) {
            return res.json({
                methods: [
                    { id: 'default_pickup', code: 'pickup', name: 'Recogida Local en Sede del Club', price: 0, isActive: true },
                    { id: 'default_flat', code: 'flat_rate', name: 'Envío Nacional Estándar', price: 15000, isActive: true }
                ]
            });
        }

        res.json({ methods: rows.rows });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const saveShippingMethod = async (req, res) => {
    try {
        await ensureCommerceSchema();
        const { id, clubId, name, code, price, minOrderFree, isActive, description } = req.body;
        const targetClubId = clubId || req.user?.clubId;

        if (!name || !code) return res.status(400).json({ error: 'Nombre y código son requeridos' });

        if (id && !id.startsWith('default_')) {
            const updated = await db.query(
                `UPDATE "CommerceShippingMethod"
                    SET "name" = $1, "code" = $2, "price" = $3, "minOrderFree" = $4, "isActive" = $5, "description" = $6, "updatedAt" = NOW()
                  WHERE id = $7 AND "clubId" = $8
                  RETURNING *`,
                [name, code, Number(price) || 0, minOrderFree ? Number(minOrderFree) : null, isActive !== false, description || '', id, targetClubId]
            );
            return res.json({ success: true, method: updated.rows[0] });
        }

        const inserted = await db.query(
            `INSERT INTO "CommerceShippingMethod" ("clubId", "name", "code", "price", "minOrderFree", "isActive", "description")
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING *`,
            [targetClubId, name, code, Number(price) || 0, minOrderFree ? Number(minOrderFree) : null, isActive !== false, description || '']
        );
        res.json({ success: true, method: inserted.rows[0] });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// ── GESTIÓN Y VALIDACIÓN DE CUPONES ──────────────────────────────────────────
export const validateCoupon = async (req, res) => {
    try {
        await ensureCommerceSchema();
        const { clubId, code, subtotal } = req.body;
        if (!clubId || !code) return res.status(400).json({ error: 'clubId y code son requeridos' });

        const couponRes = await db.query(
            `SELECT * FROM "CommerceCoupon" WHERE "clubId" = $1 AND UPPER("code") = UPPER($2) AND "isActive" = true LIMIT 1`,
            [clubId, code.trim()]
        );

        if (couponRes.rows.length === 0) {
            return res.status(404).json({ valid: false, error: 'Cupón no válido o inactivo' });
        }

        const c = couponRes.rows[0];
        const now = new Date();
        if (c.startDate && new Date(c.startDate) > now) return res.status(400).json({ valid: false, error: 'El cupón aún no está activo' });
        if (c.endDate && new Date(c.endDate) < now) return res.status(400).json({ valid: false, error: 'El cupón ha vencido' });
        if (c.usedCount >= c.maxUses) return res.status(400).json({ valid: false, error: 'El cupón ha alcanzado el límite de usos' });
        if (subtotal && subtotal < Number(c.minOrderAmount)) {
            return res.status(400).json({
                valid: false,
                error: `El pedido mínimo para aplicar este cupón es de $${Number(c.minOrderAmount).toLocaleString()}`
            });
        }

        let discountAmount = 0;
        if (c.discountType === 'percent') {
            discountAmount = Math.round(((subtotal || 0) * Number(c.discountValue)) / 100);
        } else {
            discountAmount = Math.min(subtotal || 0, Number(c.discountValue));
        }

        res.json({
            valid: true,
            code: c.code,
            discountType: c.discountType,
            discountValue: c.discountValue,
            discountAmount
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const getCoupons = async (req, res) => {
    try {
        await ensureCommerceSchema();
        const clubId = req.query.clubId || req.user?.clubId;
        const rows = await db.query(`SELECT * FROM "CommerceCoupon" WHERE "clubId" = $1 ORDER BY "createdAt" DESC`, [clubId]);
        res.json({ coupons: rows.rows });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

export const saveCoupon = async (req, res) => {
    try {
        await ensureCommerceSchema();
        const { clubId, code, discountType, discountValue, minOrderAmount, maxUses, isActive } = req.body;
        const targetClubId = clubId || req.user?.clubId;

        const inserted = await db.query(
            `INSERT INTO "CommerceCoupon" ("clubId", "code", "discountType", "discountValue", "minOrderAmount", "maxUses", "isActive")
             VALUES ($1, UPPER($2), $3, $4, $5, $6, $7)
             ON CONFLICT ("clubId", "code") DO UPDATE
             SET "discountType" = EXCLUDED."discountType",
                 "discountValue" = EXCLUDED."discountValue",
                 "minOrderAmount" = EXCLUDED."minOrderAmount",
                 "maxUses" = EXCLUDED."maxUses",
                 "isActive" = EXCLUDED."isActive",
                 "updatedAt" = NOW()
             RETURNING *`,
            [targetClubId, code.trim(), discountType || 'percent', Number(discountValue) || 0, Number(minOrderAmount) || 0, parseInt(maxUses, 10) || 100, isActive !== false]
        );
        res.json({ success: true, coupon: inserted.rows[0] });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// ── PEDIDOS DE UN CLIENTE / USUARIO (MI CUENTA) ──────────────────────────────
export const getCustomerOrders = async (req, res) => {
    try {
        await ensureCommerceSchema();
        const email = req.user?.email || req.query.email;
        if (!email) return res.status(400).json({ error: 'Correo de usuario requerido' });

        const orders = await prisma.order.findMany({
            where: { customerEmail: email.toLowerCase().trim() },
            include: {
                items: true,
                payments: { orderBy: { createdAt: 'desc' }, take: 1 },
                club: { select: { id: true, name: true, logo: true, subdomain: true } }
            },
            orderBy: { createdAt: 'desc' }
        });

        res.json({ orders });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
