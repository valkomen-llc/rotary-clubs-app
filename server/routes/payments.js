import express from 'express';
import { createPaymentIntent } from '../controllers/paymentController.js';

const router = express.Router();

// Create a PaymentIntent for a specific order
router.post('/create-intent', createPaymentIntent);

// Note: webhook is handled directly in api/index.js to parse raw body

export default router;
