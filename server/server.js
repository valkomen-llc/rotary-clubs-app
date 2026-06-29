// V4.254 CACHE BUST - INTELLIGENT CATEGORIES - 2026-05-14 00:45:00
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

app.use(express.json({ limit: '25mb' }));

import { createInitialAdmin } from './controllers/authController.js';

app.get('/api/health', async (req, res) => {
    try {
        await createInitialAdmin();
        res.json({ status: 'ok', message: 'Rotary API is running' });
    } catch (err) {
        res.status(500).json({ status: 'error', error: err.message });
    }
});

// v4.361 — Brain emergency endpoints DIRECTAMENTE en server.js, bypaseando
// el router /api/brains/* que en producción no responde. Si /brain-quick
// responde y /api/brains/ping no, sabemos que el problema es el router.
app.get('/api/brain-quick', (req, res) => {
    res.json({
        ok: true,
        version: 'v4.361',
        timestamp: new Date().toISOString(),
        mountedDirect: true,
        env: {
            node: process.version,
            vercelRegion: process.env.VERCEL_REGION || null,
            hasDbUrl: !!process.env.DATABASE_URL,
            dbUrlHost: process.env.DATABASE_URL?.match(/@([^/?]+)/)?.[1] || null,
            hasGemini: !!process.env.GEMINI_API_KEY,
        },
    });
});

// Mismo pero con un query Prisma mínimo y timeout interno. Si esto responde
// rápido pero /api/brains/me se cuelga, el problema NO es Prisma — es algo
// en el router brains. Si esto también se cuelga, es Prisma/DB.
app.get('/api/brain-quick/db', async (req, res) => {
    const t0 = Date.now();
    try {
        const result = await Promise.race([
            prisma.brain.count().then(c => ({ ok: true, count: c })).catch(e => ({ ok: false, error: e.code || e.message?.slice(0, 100) })),
            new Promise(resolve => setTimeout(() => resolve({ ok: false, timeout: true }), 4000)),
        ]);
        res.json({
            ...result,
            elapsedMs: Date.now() - t0,
            version: 'v4.361',
        });
    } catch (err) {
        res.status(500).json({ error: err.message?.slice(0, 200), elapsedMs: Date.now() - t0 });
    }
});

// Brain "me" minimalist — la solución de emergencia. Si /api/brains/me sigue
// colgándose, el frontend lo usa como fallback. Solo lectura, sin middleware
// pesado, con timeout interno explícito.
import { authMiddleware as brainQuickAuth } from './middleware/auth.js';
app.get('/api/brain-quick/me', brainQuickAuth, async (req, res) => {
    const t0 = Date.now();
    const QUERY_TIMEOUT = 3500;
    const tryQuery = (promise, fallback) => Promise.race([
        promise.then(v => v).catch(e => ({ __error: e.code || e.message?.slice(0, 80) })),
        new Promise(resolve => setTimeout(() => resolve({ __timeout: true }), QUERY_TIMEOUT)),
    ]).then(v => v ?? fallback);

    try {
        const masterPromise = tryQuery(
            prisma.brain.findFirst({ where: { isMaster: true }, select: { id: true, name: true, memoryCount: true } }),
            null,
        );

        let brainPromise = Promise.resolve(null);
        if (req.user?.clubId) {
            brainPromise = tryQuery(
                prisma.brain.findUnique({
                    where: { clubId: req.user.clubId },
                    select: { id: true, name: true, kind: true, isMaster: true, memoryCount: true, identityPrompt: true, metadata: true, clubId: true, districtId: true },
                }),
                null,
            );
        }

        const [master, brain] = await Promise.all([masterPromise, brainPromise]);
        const elapsedMs = Date.now() - t0;

        const masterOk = master && !master.__timeout && !master.__error;
        const brainOk = brain && !brain.__timeout && !brain.__error;

        if (!masterOk && (master?.__timeout || master?.__error)) {
            return res.json({
                scope: 'degraded',
                detail: master.__timeout ? 'Master query timeout' : `Master query error: ${master.__error}`,
                elapsedMs, version: 'v4.361',
            });
        }

        res.json({
            scope: !masterOk ? 'not-initialized' : (!req.user?.clubId ? 'master-only' : (brainOk ? 'site' : 'not-initialized')),
            master: masterOk ? master : null,
            brain: brainOk ? brain : null,
            reason: !masterOk ? 'no-master' : (brain?.__timeout ? 'brain-timeout' : (brain?.__error ? 'brain-error' : (!brainOk ? 'no-site-brain' : undefined))),
            diagnostic: { masterRaw: master, brainRaw: brain, clubId: req.user?.clubId || null },
            elapsedMs,
            version: 'v4.361',
        });
    } catch (err) {
        res.status(500).json({ error: err.message?.slice(0, 200), elapsedMs: Date.now() - t0, version: 'v4.361' });
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
import crmRoutes from './routes/crm.js';
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
import domainsRoutes from './routes/domains.js';
import technicalRequestsRoutes from './routes/technical-requests.js';
import districtAnalyticsRoutes from './routes/district-analytics.js';
import emailAccountsRoutes from './routes/emailAccounts.js';
import brainsRoutes from './routes/brains.js';
import bannerRoutes from './routes/banner.js';

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
app.use('/api/whatsapp', crmRoutes);
app.use('/api/crm', crmRoutes);

app.use('/api/agents', agentsRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/admin/districts', districtsRoutes);
app.use('/api/documents', documentsRoutes);
app.use('/api/faqs', faqsRoutes);
app.use('/api/leads', leadsRoutes);
app.use('/api/payouts', payoutsRoutes);
app.use('/api/site-progress', siteProgressRoutes);
app.use('/api/scout-grants', grantsRoutes);
app.use('/api/district-analytics', districtAnalyticsRoutes);
app.use('/api/technical-requests', technicalRequestsRoutes);
app.use('/api/system', systemRoutes);
app.use('/api/domains', domainsRoutes);
app.use('/api/email-accounts', emailAccountsRoutes);
app.use('/api/brains', brainsRoutes);
app.use('/api/banner', bannerRoutes);

// DIAGNOSTIC PING - Direct route to bypass potential file-loading/middleware issues
app.post('/api/ping-footer', (req, res) => {
    res.json({ status: "alive", timestamp: new Date().toISOString(), bodySize: JSON.stringify(req.body).length });
});

export default app;

if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, async () => {
        console.log(`Server is running on port ${PORT}`);
        await createInitialAdmin();
    });
}
