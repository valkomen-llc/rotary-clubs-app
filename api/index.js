// REBOOT V4.48.0 | OMNICHANNEL SOCIAL | 2026-04-23T13:51:00
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { PrismaClient } from '@prisma/client';

const app = express();
const prisma = new PrismaClient();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// Parse raw body for Stripe Webhooks BEFORE express.json()
app.post('/api/payments/webhook', express.raw({ type: 'application/json' }), async (req, res, next) => {
    const { stripeWebhook } = await import('../server/controllers/paymentController.js');
    return stripeWebhook(req, res, next);
});

// ── Static endpoints ─────────────────────────────────────────────────────────
app.get('/api', (req, res) => {
    res.json({ status: 'ok', version: '4.13.10' });
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

// ── Route loaders (cached per warm instance) ─────────────────────────────────
let _auth, _admin, _clubs, _calendar, _ai, _media;

const getAuth = async () => _auth || (({ default: _auth } = await import('../server/routes/auth.js')), _auth);
const getAdmin = async () => _admin || (({ default: _admin } = await import('../server/routes/admin.js')), _admin);
const getClubs = async () => _clubs || (({ default: _clubs } = await import('../server/routes/clubs.js')), _clubs);
const getCalendar = async () => _calendar || (({ default: _calendar } = await import('../server/routes/calendar.js')), _calendar);
const getAI = async () => _ai || (({ default: _ai } = await import('../server/routes/ai.js')), _ai);
const getMedia = async () => _media || (({ default: _media } = await import('../server/routes/media.js')), _media);

let _orders, _payments, _products, _communications, _translate, _public;
const getOrders = async () => _orders || (({ default: _orders } = await import('../server/routes/orders.js')), _orders);
const getPayments = async () => _payments || (({ default: _payments } = await import('../server/routes/payments.js')), _payments);
const getProducts = async () => _products || (({ default: _products } = await import('../server/routes/products.js')), _products);
const getCommunications = async () => _communications || (({ default: _communications } = await import('../server/routes/communications.js')), _communications);
const getTranslate = async () => _translate || (({ default: _translate } = await import('../server/routes/translate.js')), _translate);
const getPublicRoutes = async () => _public || (({ default: _public } = await import('../server/routes/public.js')), _public);

let _analytics, _leads, _faqs, _agents, _siteProgress, _districts, _whatsappCRM, _platformConfig;
const getAnalytics = async () => _analytics || (({ default: _analytics } = await import('../server/routes/analytics.js')), _analytics);
const getLeads = async () => _leads || (({ default: _leads } = await import('../server/routes/leads.js')), _leads);
const getFaqs = async () => _faqs || (({ default: _faqs } = await import('../server/routes/faqs.js')), _faqs);
const getAgents = async () => _agents || (({ default: _agents } = await import('../server/routes/agents.js')), _agents);
const getSiteProgress = async () => _siteProgress || (({ default: _siteProgress } = await import('../server/routes/site-progress.js')), _siteProgress);
const getDistricts = async () => _districts || (({ default: _districts } = await import('../server/routes/districts.js')), _districts);
const getWhatsAppCRM = async () => _whatsappCRM || (({ default: _whatsappCRM } = await import('../server/routes/whatsapp-crm.js')), _whatsappCRM);
const getPlatformConfig = async () => _platformConfig || (({ default: _platformConfig } = await import('../server/routes/platform-config.js')), _platformConfig);

let _scoutGrants;
const getScoutGrants = async () => _scoutGrants || (({ default: _scoutGrants } = await import('../server/routes/grants.js')), _scoutGrants);

let _documents;
const getDocuments = async () => _documents || (({ default: _documents } = await import('../server/routes/documents.js')), _documents);

let _system, _whatsappQr, _contentStudio;
const getSystem = async () => _system || (({ default: _system } = await import('../server/routes/system.js')), _system);
const getWhatsappQr = async () => _whatsappQr || (({ default: _whatsappQr } = await import('../server/routes/whatsapp-qr.js')), _whatsappQr);
const getContentStudio = async () => _contentStudio || (({ default: _contentStudio } = await import('../server/routes/contentStudio.js')), _contentStudio);

// ── Route handlers ────────────────────────────────────────────────────────────
app.use('/api/auth', async (req, res, next) => (await getAuth())(req, res, next));
app.use('/api/admin', async (req, res, next) => (await getAdmin())(req, res, next));
app.use('/api/clubs', async (req, res, next) => (await getClubs())(req, res, next));
app.use('/api/calendar', async (req, res, next) => (await getCalendar())(req, res, next));
app.use('/api/ai', async (req, res, next) => (await getAI())(req, res, next));
app.use('/api/media', async (req, res, next) => (await getMedia())(req, res, next));

app.use('/api/orders', async (req, res, next) => (await getOrders())(req, res, next));
app.use('/api/payments', async (req, res, next) => (await getPayments())(req, res, next));
app.use('/api/products', async (req, res, next) => (await getProducts())(req, res, next));
app.use('/api/communications', async (req, res, next) => (await getCommunications())(req, res, next));
app.use('/api/translate', async (req, res, next) => (await getTranslate())(req, res, next));
app.use('/api/public', async (req, res, next) => (await getPublicRoutes())(req, res, next));
app.use('/api/analytics', async (req, res, next) => (await getAnalytics())(req, res, next));
app.use('/api/leads', async (req, res, next) => (await getLeads())(req, res, next));
app.use('/api/faqs', async (req, res, next) => (await getFaqs())(req, res, next));
app.use('/api/agents', async (req, res, next) => (await getAgents())(req, res, next));
app.use('/api/site-progress', async (req, res, next) => (await getSiteProgress())(req, res, next));
app.use('/api/admin/districts', async (req, res, next) => (await getDistricts())(req, res, next));
app.use('/api/whatsapp', async (req, res, next) => (await getWhatsAppCRM())(req, res, next));
app.use('/api/platform-config', async (req, res, next) => (await getPlatformConfig())(req, res, next));
app.use('/api/documents', async (req, res, next) => (await getDocuments())(req, res, next));
app.post('/api/debug-url', (req, res) => {
    res.json({ url: req.url, originalUrl: req.originalUrl, path: req.path });
});

app.use('/api/system', async (req, res, next) => (await getSystem())(req, res, next));
app.use('/api/whatsapp-qr', async (req, res, next) => (await getWhatsappQr())(req, res, next));
app.use('/api/content-studio', async (req, res, next) => (await getContentStudio())(req, res, next));


// ── Social OAuth Callbacks ───────────────────────────────────────────────────
app.get('/api/social/callback/:platform', async (req, res) => {
    const { platform } = req.params;
    const { code, state, error } = req.query;

    if (error) {
        return res.redirect(`/admin/content-studio?tab=accounts&error=${encodeURIComponent(error)}`);
    }

    // En un flujo real, aquí cambiaríamos el 'code' por un access_token
    // usando axios y las credenciales del cliente (API Keys)
    console.log(`[OAuth] Recibido callback para ${platform}: ${code}`);
    
    // Redirigimos de vuelta con señal de éxito
    res.redirect(`/admin/content-studio?tab=accounts&connected=${platform}`);
});


// Diagnostic Ping - Ported to entry point for guaranteed reachability
app.post('/api/ping-footer', (req, res) => {
    res.json({ status: "alive", entry: "api/index.js", timestamp: new Date().toISOString() });
});

app.use('/api/scout-grants', async (req, res, next) => (await getScoutGrants())(req, res, next));

// ── Frontend & SEO Injection ──────────────────────────────────────────────────
app.get('*', async (req, res) => {
    // Skip if it's an API route (should be handled by express routes above)
    if (req.path.startsWith('/api')) return;

    try {
        const indexPath = path.resolve(process.cwd(), 'dist/index.html');
        if (!fs.existsSync(indexPath)) {
            return res.status(404).send('Frontend not built or not found.');
        }

        let html = fs.readFileSync(indexPath, 'utf8');

        // Extract metadata based on URL
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

        // Deep SEO for Blog Posts
        if (req.path.includes('/blog/')) {
            const slug = req.path.split('/blog/')[1]?.split('?')[0]?.split('#')[0];
            if (slug && slug !== '') {
                const post = await prisma.post.findFirst({
                    where: { OR: [{ slug }, { id: slug }] }
                });
                if (post) {
                    meta.title = post.seoTitle || `${post.title} | ${club?.name || 'Rotary'}`;
                    meta.description = post.seoDescription || post.content.substring(0, 160).replace(/<[^>]*>?/gm, '');
                    meta.image = post.seoImage || post.image || meta.image;
                }
            }
        }

        // Inject Meta Tags
        const pageTitle = meta.title;
        html = html.replace(/<title>.*?<\/title>/g, `<title>${pageTitle}</title>`);
        
        const tags = `
            <meta name="description" content="${meta.description}">
            <meta property="og:title" content="${meta.title}">
            <meta property="og:description" content="${meta.description}">
            <meta property="og:image" content="${meta.image}">
            <meta property="og:url" content="${meta.url}">
            <meta property="og:type" content="article">
            <meta name="twitter:card" content="summary_large_image">
            <meta name="twitter:title" content="${meta.title}">
            <meta name="twitter:description" content="${meta.description}">
            <meta name="twitter:image" content="${meta.image}">
        `;

        if (html.includes('</head>')) {
            html = html.replace('</head>', `${tags}\n</head>`);
        }

        res.send(html);
    } catch (err) {
        console.error('Frontend Injection Error:', err);
        // CRITICAL FALLBACK: If injection fails, just serve the raw index.html instead of an error page
        try {
            const indexPath = path.resolve(process.cwd(), 'dist/index.html');
            if (fs.existsSync(indexPath)) {
                return res.sendFile(indexPath);
            }
        } catch (fallbackErr) {
            console.error('Fallback fatal error:', fallbackErr);
        }
        res.status(500).send('Error loading page.');
    }
});

export default app;
