import { authMiddleware } from '../middleware/auth.js';
import db from '../lib/db.js';
import prisma from '../lib/prisma.js'; // CLIENTE CENTRALIZADO (OBLIGATORIO)

export const createOrder = async (req, res) => {
    try {
        const { items, customer, shipping, clubId, total } = req.body;

        if (!clubId) {
            return res.status(400).json({ error: 'clubId is required' });
        }
        if (!items || items.length === 0) {
            return res.status(400).json({ error: 'Cart items are required' });
        }

        let calculatedTotal = 0;
        const orderItemsData = items.map(item => {
            const rowTotal = item.unitPrice * item.qty;
            calculatedTotal += rowTotal;
            return {
                type: item.type,
                title: item.title,
                qty: item.qty,
                unitPrice: item.unitPrice,
                total: rowTotal,
                productId: item.productId || null,
                variantId: item.variantId || null,
                metadata: item.metadata ? JSON.stringify(item.metadata) : null,
            };
        });

        if (Math.abs(calculatedTotal - total) > 0.01) {
            console.warn(`Total mismatch: Calculated ${calculatedTotal}, Received ${total}`);
        }

        const order = await prisma.order.create({
            data: {
                clubId,
                total: calculatedTotal,
                subtotal: calculatedTotal,
                customerName: `${customer.firstName} ${customer.lastName}`,
                customerEmail: customer.email,
                customerPhone: customer.phone || null,
                metadata: JSON.stringify({ shipping }),
                items: {
                    create: orderItemsData
                }
            },
            include: {
                items: true
            }
        });

        res.status(201).json({ order });
    } catch (error) {
        console.error('Error in createOrder:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const getOrderDetails = async (req, res) => {
    try {
        const { id } = req.params;
        const order = await prisma.order.findUnique({
            where: { id },
            include: {
                items: true,
                payments: true
            }
        });

        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }

        res.json({ order });
    } catch (error) {
        console.error('Error in getOrderDetails:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const getAllOrders = async (req, res) => {
    try {
        // En una app multitenant, aquí filtrarías por `req.user.clubId` de ser necesario
        const clubId = req.user?.clubId;

        let whereClause = {};
        if (req.user?.role !== 'administrator' && clubId) {
            whereClause.clubId = clubId;
        }

        const orders = await prisma.order.findMany({
            where: whereClause,
            include: {
                items: true,
                payments: true
            },
            orderBy: {
                createdAt: 'desc'
            }
        });

        // Transformar orders a un formato más conveniente para el frontend si es necesario
        res.json({ orders });
    } catch (error) {
        console.error('Error in getAllOrders:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}
