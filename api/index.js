// DISTRICT HEALTH IQ V4.133 | 2026-05-06 (CUSTOM PLATFORM LOGO 🎨)
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import prisma from '../server/lib/prisma.js';
import Stripe from 'stripe';
import authRoutes from '../server/routes/auth.js';
import adminRoutes from '../server/routes/admin.js';
import clubRoutes from '../server/routes/clubs.js';
import publicRoutes from '../server/routes/public.js';
import mediaRoutes from '../server/routes/media.js';

const app = express();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '');

app.use(cors({
    origin: true,
    credentials: true
}));

// Webhooks
app.post('/api/payments/webhook', express.raw({ type: 'application/json' }), async (req, res, next) => {
    const { stripeWebhook } = await import('../server/controllers/paymentController.js');
    return stripeWebhook(req, res, next);
});

app.use(express.json());

// ── Technical Requests Logic (Consolidated for Vercel Stability) ──────────────
app.post('/api/technical-requests', async (req, res) => {
    try {
        const { clubId, type, subject, description, details, amount } = req.body;
        console.log(`[TechnicalRequest] Creating ${type} for club ${clubId}...`);
        
        const request = await prisma.technicalRequest.create({
            data: {
                clubId,
                type: type || 'domain_transfer',
                subject,
                description,
                details: details || {},
                amount: amount || 29.00,
                status: 'pending',
                paymentStatus: 'unpaid'
            }
        });
        res.status(201).json(request);
    } catch (error) {
        console.error('[TechnicalRequest Error]:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/technical-requests/checkout', async (req, res) => {
    try {
        const { requestId } = req.body;
        if (!requestId) return res.status(400).json({ error: 'requestId required' });

        const request = await prisma.technicalRequest.findUnique({
            where: { id: requestId },
            include: { club: true }
        });

        if (!request) return res.status(404).json({ error: 'Request not found' });

        const protocol = req.headers['x-forwarded-proto'] || 'https';
        const host = request.club?.domain || req.headers.host;
        const baseUrl = `${protocol}://${host}`;

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{
                price_data: {
                    currency: 'usd',
                    product_data: {
                        name: `Servicio Técnico: ${request.subject}`,
                        description: `Trámite técnico de transferencia de dominio (${request.details.domainName || ''}).`,
                        images: ['https://rotary.clubplatform.org/logo-main.png'],
                    },
                    unit_amount: Math.round(request.amount * 100),
                },
                quantity: 1,
            }],
            mode: 'payment',
            success_url: `${baseUrl}/admin/technical-requests?success=true&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${baseUrl}/admin/technical-requests?canceled=true`,
            metadata: { requestId: request.id, clubId: request.clubId, type: 'technical_service' }
        });

        res.json({ url: session.url });
    } catch (error) {
        console.error('[Stripe Checkout Error]:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/technical-requests', async (req, res) => {
    try {
        const { clubId } = req.query;
        if (!clubId) return res.status(400).json({ error: 'clubId required' });
        const requests = await prisma.technicalRequest.findMany({
            where: { clubId },
            orderBy: { createdAt: 'desc' }
        });
        res.json(requests);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/district-analytics/health', async (req, res, next) => {
    try {
        const { getDistrictHealth } = await import('../server/controllers/districtAnalyticsController.js');
        return getDistrictHealth(req, res, next);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ── Static & Diagnostics ─────────────────────────────────────────────────────
app.get('/api', (req, res) => {
    res.json({ status: 'CONSOLIDATED_ACTIVE', version: '4.133', release: 'Custom Platform Logo 🎨' });
});

app.get('/api/health', async (req, res) => {
    try {
        const { createInitialAdmin } = await import('../server/controllers/authController.js');
        await createInitialAdmin();
        res.json({ status: 'ok' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Route loaders (Legacy Dynamic for less critical routes) ──────────────────
let _calendar, _ai, _orders, _payments, _products, _communications, _translate, _analytics, _leads, _faqs, _agents, _siteProgress, _districts, _whatsappCRM, _platformConfig, _scoutGrants, _documents, _system, _whatsappQr, _contentStudio, _domains, _cron, _distAnalytics;
const getCalendar = async () => _calendar || (({ default: _calendar } = await import('../server/routes/calendar.js')), _calendar);
const getAI = async () => _ai || (({ default: _ai } = await import('../server/routes/ai.js')), _ai);

const getOrders = async () => _orders || (({ default: _orders } = await import('../server/routes/orders.js')), _orders);
const getPayments = async () => _payments || (({ default: _payments } = await import('../server/routes/payments.js')), _payments);
const getProducts = async () => _products || (({ default: _products } = await import('../server/routes/products.js')), _products);
const getCommunications = async () => _communications || (({ default: _communications } = await import('../server/routes/communications.js')), _communications);
const getTranslate = async () => _translate || (({ default: _translate } = await import('../server/routes/translate.js')), _translate);
const getAnalytics = async () => _analytics || (({ default: _analytics } = await import('../server/routes/analytics.js')), _analytics);
const getLeads = async () => _leads || (({ default: _leads } = await import('../server/routes/leads.js')), _leads);
const getFaqs = async () => _faqs || (({ default: _faqs } = await import('../server/routes/faqs.js')), _faqs);
const getAgents = async () => _agents || (({ default: _agents } = await import('../server/routes/agents.js')), _agents);
const getSiteProgress = async () => _siteProgress || (({ default: _siteProgress } = await import('../server/routes/site-progress.js')), _siteProgress);
const getDistricts = async () => _districts || (({ default: _districts } = await import('../server/routes/districts.js')), _districts);
const getWhatsAppCRM = async () => _whatsappCRM || (({ default: _whatsappCRM } = await import('../server/routes/whatsapp-crm.js')), _whatsappCRM);
const getPlatformConfig = async () => _platformConfig || (({ default: _platformConfig } = await import('../server/routes/platform-config.js')), _platformConfig);

const getDistAnalytics = async () => _distAnalytics || (({ default: _distAnalytics } = await import('../server/routes/district-analytics.js')), _distAnalytics);
const getScoutGrants = async () => _scoutGrants || (({ default: _scoutGrants } = await import('../server/routes/grants.js')), _scoutGrants);
const getDocuments = async () => _documents || (({ default: _documents } = await import('../server/routes/documents.js')), _documents);
const getSystem = async () => _system || (({ default: _system } = await import('../server/routes/system.js')), _system);
const getWhatsappQr = async () => _whatsappQr || (({ default: _whatsappQr } = await import('../server/routes/whatsapp-qr.js')), _whatsappQr);
const getContentStudio = async () => _contentStudio || (({ default: _contentStudio } = await import('../server/routes/contentStudio.js')), _contentStudio);
const getDomains = async () => _domains || (({ default: _domains } = await import('../server/routes/domains.js')), _domains);
const getCron = async () => _cron || (({ default: _cron } = await import('../server/routes/cron.js')), _cron);

// ── Route handlers ────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/clubs', clubRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/media', mediaRoutes);

app.use('/api/calendar', async (req, res, next) => { try { return (await getCalendar())(req, res, next); } catch (e) { console.error('API Error [calendar]:', e); res.status(500).json({ error: e.message }); } });
app.use('/api/ai', async (req, res, next) => { try { return (await getAI())(req, res, next); } catch (e) { console.error('API Error [ai]:', e); res.status(500).json({ error: e.message }); } });
app.use('/api/orders', async (req, res, next) => { try { return (await getOrders())(req, res, next); } catch (e) { console.error('API Error [orders]:', e); res.status(500).json({ error: e.message }); } });
app.use('/api/payments', async (req, res, next) => { try { return (await getPayments())(req, res, next); } catch (e) { console.error('API Error [payments]:', e); res.status(500).json({ error: e.message }); } });
app.use('/api/products', async (req, res, next) => { try { return (await getProducts())(req, res, next); } catch (e) { console.error('API Error [products]:', e); res.status(500).json({ error: e.message }); } });
app.use('/api/communications', async (req, res, next) => { try { return (await getCommunications())(req, res, next); } catch (e) { console.error('API Error [communications]:', e); res.status(500).json({ error: e.message }); } });
app.use('/api/translate', async (req, res, next) => { try { return (await getTranslate())(req, res, next); } catch (e) { console.error('API Error [translate]:', e); res.status(500).json({ error: e.message }); } });
app.use('/api/analytics', async (req, res, next) => { try { return (await getAnalytics())(req, res, next); } catch (e) { console.error('API Error [analytics]:', e); res.status(500).json({ error: e.message }); } });
app.use('/api/leads', async (req, res, next) => { try { return (await getLeads())(req, res, next); } catch (e) { console.error('API Error [leads]:', e); res.status(500).json({ error: e.message }); } });
app.use('/api/faqs', async (req, res, next) => { try { return (await getFaqs())(req, res, next); } catch (e) { console.error('API Error [faqs]:', e); res.status(500).json({ error: e.message }); } });
app.use('/api/agents', async (req, res, next) => { try { return (await getAgents())(req, res, next); } catch (e) { console.error('API Error [agents]:', e); res.status(500).json({ error: e.message }); } });
app.use('/api/site-progress', async (req, res, next) => { try { return (await getSiteProgress())(req, res, next); } catch (e) { console.error('API Error [site-progress]:', e); res.status(500).json({ error: e.message }); } });
app.use('/api/admin/districts', async (req, res, next) => { try { return (await getDistricts())(req, res, next); } catch (e) { console.error('API Error [districts]:', e); res.status(500).json({ error: e.message }); } });
app.use('/api/whatsapp', async (req, res, next) => { try { return (await getWhatsAppCRM())(req, res, next); } catch (e) { console.error('API Error [whatsapp]:', e); res.status(500).json({ error: e.message }); } });
app.use('/api/platform-config', async (req, res, next) => { try { return (await getPlatformConfig())(req, res, next); } catch (e) { console.error('API Error [platform-config]:', e); res.status(500).json({ error: e.message }); } });
app.use('/api/documents', async (req, res, next) => { try { return (await getDocuments())(req, res, next); } catch (e) { console.error('API Error [documents]:', e); res.status(500).json({ error: e.message }); } });
app.use('/api/system', async (req, res, next) => { try { return (await getSystem())(req, res, next); } catch (e) { console.error('API Error [system]:', e); res.status(500).json({ error: e.message }); } });
app.use('/api/whatsapp-qr', async (req, res, next) => { try { return (await getWhatsappQr())(req, res, next); } catch (e) { console.error('API Error [whatsapp-qr]:', e); res.status(500).json({ error: e.message }); } });
app.use('/api/content-studio', async (req, res, next) => { try { return (await getContentStudio())(req, res, next); } catch (e) { console.error('API Error [content-studio]:', e); res.status(500).json({ error: e.message }); } });
app.use('/api/domains', async (req, res, next) => { try { return (await getDomains())(req, res, next); } catch (e) { console.error('API Error [domains]:', e); res.status(500).json({ error: e.message }); } });
app.use('/api/cron', async (req, res, next) => { try { return (await getCron())(req, res, next); } catch (e) { console.error('API Error [cron]:', e); res.status(500).json({ error: e.message }); } });
app.use('/api/scout-grants', async (req, res, next) => { try { return (await getScoutGrants())(req, res, next); } catch (e) { console.error('API Error [scout-grants]:', e); res.status(500).json({ error: e.message }); } });

// RUTAS SOCIAL HUB
app.get('/api/social/callback/:platform', async (req, res) => {
    const { platform } = req.params;
    res.redirect(`/admin/content-studio?tab=accounts&connected=${platform}`);
});

// ── Frontend & SEO Injection ──────────────────────────────────────────────────
app.get('*', async (req, res) => {
    if (req.path.startsWith('/api')) return;
    try {
        const indexPath = path.resolve(process.cwd(), 'dist/index.html');
        if (!fs.existsSync(indexPath)) return res.status(404).send('Frontend not built.');
        let html = fs.readFileSync(indexPath, 'utf8');
        const hostname = req.headers.host || '';
        const originParts = hostname.split('.');
        const subdomain = hostname.includes('clubplatform.org') ? originParts[0] : null;
        let club;
        if (subdomain && !['app', 'www', 'landing'].includes(subdomain.toLowerCase())) {
            club = await prisma.club.findFirst({ where: { subdomain: subdomain.toLowerCase() } });
        } else {
            club = await prisma.club.findFirst({ where: { domain: hostname } });
        }
        let meta = {
            title: club?.name ? `${club.name} | Rotary` : 'Rotary ClubPlatform',
            description: club?.description || 'Servicio por encima del interés propio.',
            image: club?.logo || 'https://rotarycluborigen.org/logo.png',
            url: `https://${hostname}${req.path}`
        };
        const tags = `<meta name="description" content="${meta.description}"><meta property="og:title" content="${meta.title}"><meta property="og:image" content="${meta.image}">`;
        html = html.replace(/<title>.*?<\/title>/g, `<title>${meta.title}</title>`);
        if (html.includes('</head>')) html = html.replace('</head>', `${tags}\n</head>`);
        res.send(html);
    } catch (err) {
        console.error('Frontend Injection Error:', err);
        const indexPath = path.resolve(process.cwd(), 'dist/index.html');
        if (fs.existsSync(indexPath)) return res.sendFile(indexPath);
        res.status(500).send('Error loading page.');
    }
});

export default app;
// FORCE REBUILD 4.116d (Intelligence Live 🧠🚀🔥)
