import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

dotenv.config();

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 5001;

app.use(cors({
    origin: true,
    credentials: true
}));

// Webhooks need raw body, so define this BEFORE express.json()
import { stripeWebhook } from './controllers/paymentController.js';
app.post('/api/payments/webhook', express.raw({ type: 'application/json' }), stripeWebhook);

app.use(express.json());

import { createInitialAdmin } from './controllers/authController.js';

app.get('/api/health', async (req, res) => {
    try {
        await createInitialAdmin();
        res.json({ status: 'ok', message: 'Rotary API is running' });
    } catch (err) {
        res.status(500).json({ status: 'error', error: err.message });
    }
});

import authRoutes from './routes/auth.js';
import adminRoutes from './routes/admin.js';
import clubRoutes from './routes/clubs.js';
import mediaRoutes from './routes/media.js';
import orderRoutes from './routes/orders.js';
import paymentRoutes from './routes/payments.js';
import productRoutes from './routes/products.js';
import communicationsRoutes from './routes/communications.js';
import publicRoutes from './routes/public.js';

import aiRoutes from './routes/ai.js';
import translateRoutes from './routes/translate.js';
import analyticsRoutes from './routes/analytics.js';

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/clubs', clubRoutes);
app.use('/api/media', mediaRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/products', productRoutes);
app.use('/api/communications', communicationsRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/translate', translateRoutes);
app.use('/api/analytics', analyticsRoutes);

export default app;

if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, async () => {
        console.log(`Server is running on port ${PORT}`);
        await createInitialAdmin();
    });
}
