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
import platformConfigRoutes from './routes/platform-config.js';
import sponsoredClubsRoutes from './routes/sponsored-clubs.js';
import youthExchangeRoutes from './routes/youth-exchange.js';
import ngseRoutes from './routes/ngse.js';
import rotexRoutes from './routes/rotex.js';
import financialRoutes from './routes/financial.js';
import seoRoutes from './routes/seo.js';
import whatsappCrmRoutes from './routes/whatsapp-crm.js';
import agentsRoutes from './routes/agents.js';
import calendarRoutes from './routes/calendar.js';
import districtsRoutes from './routes/districts.js';
import documentsRoutes from './routes/documents.js';
import faqsRoutes from './routes/faqs.js';
import leadsRoutes from './routes/leads.js';
import payoutsRoutes from './routes/payouts.js';
import siteProgressRoutes from './routes/site-progress.js';
import whatsappQrRoutes from './routes/whatsapp-qr.js';
import grantsRoutes from './routes/grants.js';
import systemRoutes from './routes/system.js';

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
app.use('/api/platform-config', platformConfigRoutes);
app.use('/api/sponsored-clubs', sponsoredClubsRoutes);
app.use('/api/youth-exchange', youthExchangeRoutes);
app.use('/api/ngse', ngseRoutes);
app.use('/api/rotex', rotexRoutes);
app.use('/api/financial', financialRoutes);
app.use('/api/seo', seoRoutes);

// REORDER WHATSAPP-QR FIRST TO AVOID PREFIX CONFLICT WITH '/api/whatsapp'
app.use('/api/whatsapp-qr', whatsappQrRoutes);
app.use('/api/whatsapp', whatsappCrmRoutes);

app.use('/api/agents', agentsRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/admin/districts', districtsRoutes);
app.use('/api/documents', documentsRoutes);
app.use('/api/faqs', faqsRoutes);
app.use('/api/leads', leadsRoutes);
app.use('/api/payouts', payoutsRoutes);
app.use('/api/site-progress', siteProgressRoutes);
app.use('/api/scout-grants', grantsRoutes);
app.use('/api/system', systemRoutes);

export default app;

if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, async () => {
        console.log(`Server is running on port ${PORT}`);
        await createInitialAdmin();
    });
}
