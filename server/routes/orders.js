import express from 'express';
import { createOrder, getOrderDetails, getAllOrders } from '../controllers/orderController.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

// Create a new order (public or authenticated)
router.post('/', createOrder);

// Get all orders (Admin/Club)
router.get('/', authMiddleware, getAllOrders);

// Get order details
router.get('/:id', authMiddleware, getOrderDetails);

export default router;
