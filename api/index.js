// DISTRICT HEALTH IQ V4.258 | 2026-05-14 (EMAIL DB SYNC FIX 🛡️)
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config();
import { isBuildAssetPath, isBuildScriptPath, reloadShim } from '../server/lib/staticAssets.js';
import prisma from '../server/lib/prisma.js';
import Stripe from 'stripe';
import authRoutes from '../server/routes/auth.js';
import adminRoutes from '../server/routes/admin.js';
import clubRoutes from '../server/routes/clubs.js';
import publicRoutes from '../server/routes/public.js';
import mediaRoutes from '../server/routes/media.js';
import emailAccountsRoutes from '../server/routes/emailAccounts.js';
import institutionalAccessRoutes from '../server/routes/institutional-access.js';
import bannerRoutes from '../server/routes/banner.js';


const app = express();
app.set('trust proxy', true);
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

// Hub Social — webhook de Meta (Facebook/Instagram). Necesita el cuerpo CRUDO
// para validar la firma X-Hub-Signature-256, por eso va con express.raw ANTES
// del parser JSON (igual que el webhook de Stripe). El GET de verificación va
// por el router normal (/api/social/webhooks/meta).
app.post('/api/social/webhooks/meta', express.raw({ type: '*/*' }), async (req, res, next) => {
    const { handleMetaWebhook } = await import('../server/controllers/socialWebhookController.js');
    return handleMetaWebhook(req, res, next);
});

// El webhook de WhatsApp necesita el cuerpo CRUDO para comprobar la firma
// `X-Hub-Signature-256`, pero también necesita el cuerpo parseado (lo procesa
// entero antes de responder). Por eso se guarda desde `verify` en vez de
// montarlo con `express.raw` como el de Stripe o el del Hub Social.
//
// Se guarda SÓLO para esa ruta: hacerlo para todas duplicaría en memoria cada
// subida de hasta 25 MB.
app.use(express.json({
    limit: '25mb',
    verify: (req, _res, buf) => {
        const url = req.originalUrl || req.url || '';
        if (url.startsWith('/api/crm/webhook') || url.startsWith('/api/whatsapp/webhook')) {
            req.rawBody = buf;
        }
    },
}));

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

app.get('/api', (req, res) => {
    res.json({ status: 'CONSOLIDATED_ACTIVE', version: '4.258', release: 'Email DB Sync Fix 🛡️' });
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
let _emailMarketing, _emailAutomations;
let _calendar, _ai, _orders, _payments, _products, _communications, _translate, _analytics, _leads, _faqs, _agents, _siteProgress, _districts, _whatsappCRM, _crm, _platformConfig, _scoutGrants, _documents, _system, _whatsappQr, _contentStudio, _domains, _cron, _distAnalytics, _brains, _distribution;
const getCalendar = async () => _calendar || (({ default: _calendar } = await import('../server/routes/calendar.js')), _calendar);
const getAI = async () => _ai || (({ default: _ai } = await import('../server/routes/ai.js')), _ai);
const getBrains = async () => _brains || (({ default: _brains } = await import('../server/routes/brains.js')), _brains);
const getDistribution = async () => _distribution || (({ default: _distribution } = await import('../server/routes/distribution.js')), _distribution);

const getOrders = async () => _orders || (({ default: _orders } = await import('../server/routes/orders.js')), _orders);
const getPayments = async () => _payments || (({ default: _payments } = await import('../server/routes/payments.js')), _payments);
const getProducts = async () => _products || (({ default: _products } = await import('../server/routes/products.js')), _products);
const getCommunications = async () => _communications || (({ default: _communications } = await import('../server/routes/communications.js')), _communications);
const getEmailMarketing = async () => _emailMarketing || (({ default: _emailMarketing } = await import('../server/routes/email-marketing.js')), _emailMarketing);
const getEmailAutomations = async () => _emailAutomations || (({ default: _emailAutomations } = await import('../server/routes/email-automations.js')), _emailAutomations);
const getTranslate = async () => _translate || (({ default: _translate } = await import('../server/routes/translate.js')), _translate);
const getAnalytics = async () => _analytics || (({ default: _analytics } = await import('../server/routes/analytics.js')), _analytics);
const getLeads = async () => _leads || (({ default: _leads } = await import('../server/routes/leads.js')), _leads);
const getFaqs = async () => _faqs || (({ default: _faqs } = await import('../server/routes/faqs.js')), _faqs);
const getAgents = async () => _agents || (({ default: _agents } = await import('../server/routes/agents.js')), _agents);
const getSiteProgress = async () => _siteProgress || (({ default: _siteProgress } = await import('../server/routes/site-progress.js')), _siteProgress);
const getDistricts = async () => _districts || (({ default: _districts } = await import('../server/routes/districts.js')), _districts);
const getWhatsAppCRM = async () => _whatsappCRM || (({ default: _whatsappCRM } = await import('../server/routes/crm.js')), _whatsappCRM);
const getCRM = async () => _crm || (({ default: _crm } = await import('../server/routes/crm.js')), _crm);
const getPlatformConfig = async () => _platformConfig || (({ default: _platformConfig } = await import('../server/routes/platform-config.js')), _platformConfig);

const getDistAnalytics = async () => _distAnalytics || (({ default: _distAnalytics } = await import('../server/routes/district-analytics.js')), _distAnalytics);
// v4.747 — Traer eventos de los sitios vinculados al distrito.
let _distEcosystem;
const getDistEcosystem = async () => _distEcosystem || (({ default: _distEcosystem } = await import('../server/routes/district-ecosystem.js')), _distEcosystem);
let _seoEngine;
const getSeoEngine = async () => _seoEngine || (({ default: _seoEngine } = await import('../server/routes/seo-engine.js')), _seoEngine);
let _contribution;
const getContribution = async () => _contribution || (({ default: _contribution } = await import('../server/routes/contribution-campaigns.js')), _contribution);
let _spotlight; const getSpotlight = async () => _spotlight || (({ default: _spotlight } = await import('../server/routes/spotlight-slides.js')), _spotlight);
// Aniversarios IA (v4.895) — módulo INDEPENDIENTE del editor de Plantillas IA:
// otra ruta, otro controlador, otras tablas y otro flujo. Ver CLAUDE.md.
let _anniversaries; const getAnniversaries = async () => _anniversaries || (({ default: _anniversaries } = await import('../server/routes/anniversaries.js')), _anniversaries);
let _notifProfiles;
const getNotifProfiles = async () => _notifProfiles || (({ default: _notifProfiles } = await import('../server/routes/notification-profiles.js')), _notifProfiles);
const getScoutGrants = async () => _scoutGrants || (({ default: _scoutGrants } = await import('../server/routes/grants.js')), _scoutGrants);
const getDocuments = async () => _documents || (({ default: _documents } = await import('../server/routes/documents.js')), _documents);
const getSystem = async () => _system || (({ default: _system } = await import('../server/routes/system.js')), _system);
const getWhatsappQr = async () => _whatsappQr || (({ default: _whatsappQr } = await import('../server/routes/whatsapp-qr.js')), _whatsappQr);
const getContentStudio = async () => _contentStudio || (({ default: _contentStudio } = await import('../server/routes/contentStudio.js')), _contentStudio);
const getDomains = async () => _domains || (({ default: _domains } = await import('../server/routes/domains.js')), _domains);
const getCron = async () => _cron || (({ default: _cron } = await import('../server/routes/cron.js')), _cron);
let _reports;
const getReports = async () => _reports || (({ default: _reports } = await import('../server/routes/reports.js')), _reports);
let _social;
const getSocial = async () => _social || (({ default: _social } = await import('../server/routes/social.js')), _social);
let _financial;
const getFinancial = async () => _financial || (({ default: _financial } = await import('../server/routes/financial.js')), _financial);
let _payouts;
const getPayouts = async () => _payouts || (({ default: _payouts } = await import('../server/routes/payouts.js')), _payouts);
let _training;
const getTraining = async () => _training || (({ default: _training } = await import('../server/routes/training.js')), _training);
let _projectFair;
const getProjectFair = async () => _projectFair || (({ default: _projectFair } = await import('../server/routes/project-fair.js')), _projectFair);
// v4.649 — Inscripciones a eventos. El archivo de rutas existía desde v4.606
// pero NUNCA se montó aquí, así que todo /api/event-registrations caía en el
// catch-all del frontend y se quedaba colgado.
let _eventRegistrations;
const getEventRegistrations = async () => _eventRegistrations || (({ default: _eventRegistrations } = await import('../server/routes/event-registrations.js')), _eventRegistrations);
// v4.720 — Plantillas IA. Perezoso como el resto: el catálogo y el compilador
// sólo se cargan cuando alguien abre el módulo.
let _designStudio;
const getDesignStudio = async () => _designStudio || (({ default: _designStudio } = await import('../server/routes/design-studio.js')), _designStudio);

// ── Route handlers ────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/clubs', clubRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/media', mediaRoutes);
app.use('/api/email-accounts', emailAccountsRoutes);
// Accesos institucionales (v4.932): las cuentas de correo del sitio como
// identidades de acceso, con sus permisos y su perfil.
app.use('/api/institutional', institutionalAccessRoutes);
app.use('/api/banner', bannerRoutes);
app.use('/api/design-studio', async (req, res, next) => { try { return (await getDesignStudio())(req, res, next); } catch (e) { console.error('API Error [design-studio]:', e); res.status(500).json({ error: e.message }); } });


app.use('/api/calendar', async (req, res, next) => { try { return (await getCalendar())(req, res, next); } catch (e) { console.error('API Error [calendar]:', e); res.status(500).json({ error: e.message }); } });
app.use('/api/ai', async (req, res, next) => { try { return (await getAI())(req, res, next); } catch (e) { console.error('API Error [ai]:', e); res.status(500).json({ error: e.message }); } });
app.use('/api/brains', async (req, res, next) => { try { return (await getBrains())(req, res, next); } catch (e) { console.error('API Error [brains]:', e); res.status(500).json({ error: 'Error in brains router', detail: e.message?.slice(0, 200) }); } });

// v4.362 — emergency endpoints declarados directamente acá, FUERA del router
// brains. Si en algún momento el router brains tiene un problema de carga, estos
// siguen respondiendo. Sin auth, sin DB.
app.get('/api/brain-quick', (req, res) => {
    res.json({
        ok: true,
        version: 'v4.362',
        timestamp: new Date().toISOString(),
        runtime: 'vercel-api-index',
        env: {
            node: process.version,
            vercelRegion: process.env.VERCEL_REGION || null,
            hasDbUrl: !!process.env.DATABASE_URL,
            hasGemini: !!process.env.GEMINI_API_KEY,
        },
    });
});

app.get('/api/brain-quick/db', async (req, res) => {
    const t0 = Date.now();
    try {
        const result = await Promise.race([
            prisma.brain.count().then(c => ({ ok: true, count: c })).catch(e => ({ ok: false, error: e.code || e.message?.slice(0, 100) })),
            new Promise(resolve => setTimeout(() => resolve({ ok: false, timeout: true }), 4000)),
        ]);
        res.json({ ...result, elapsedMs: Date.now() - t0, version: 'v4.362' });
    } catch (err) {
        res.status(500).json({ error: err.message?.slice(0, 200), elapsedMs: Date.now() - t0 });
    }
});
app.use('/api/orders', async (req, res, next) => { try { return (await getOrders())(req, res, next); } catch (e) { console.error('API Error [orders]:', e); res.status(500).json({ error: e.message }); } });
app.use('/api/payments', async (req, res, next) => { try { return (await getPayments())(req, res, next); } catch (e) { console.error('API Error [payments]:', e); res.status(500).json({ error: e.message }); } });
app.use('/api/products', async (req, res, next) => { try { return (await getProducts())(req, res, next); } catch (e) { console.error('API Error [products]:', e); res.status(500).json({ error: e.message }); } });
app.use('/api/communications', async (req, res, next) => { try { return (await getCommunications())(req, res, next); } catch (e) { console.error('API Error [communications]:', e); res.status(500).json({ error: e.message }); } });
app.use('/api/email-marketing', async (req, res, next) => { try { return (await getEmailMarketing())(req, res, next); } catch (e) { console.error('API Error [email-marketing]:', e); res.status(500).json({ error: e.message }); } });
app.use('/api/email-automations', async (req, res, next) => { try { return (await getEmailAutomations())(req, res, next); } catch (e) { console.error('API Error [email-automations]:', e); res.status(500).json({ error: e.message }); } });
app.use('/api/translate', async (req, res, next) => { try { return (await getTranslate())(req, res, next); } catch (e) { console.error('API Error [translate]:', e); res.status(500).json({ error: e.message }); } });
app.use('/api/analytics', async (req, res, next) => { try { return (await getAnalytics())(req, res, next); } catch (e) { console.error('API Error [analytics]:', e); res.status(500).json({ error: e.message }); } });
app.use('/api/leads', async (req, res, next) => { try { return (await getLeads())(req, res, next); } catch (e) { console.error('API Error [leads]:', e); res.status(500).json({ error: e.message }); } });
app.use('/api/faqs', async (req, res, next) => { try { return (await getFaqs())(req, res, next); } catch (e) { console.error('API Error [faqs]:', e); res.status(500).json({ error: e.message }); } });
app.use('/api/agents', async (req, res, next) => { try { return (await getAgents())(req, res, next); } catch (e) { console.error('API Error [agents]:', e); res.status(500).json({ error: e.message }); } });
app.use('/api/site-progress', async (req, res, next) => { try { return (await getSiteProgress())(req, res, next); } catch (e) { console.error('API Error [site-progress]:', e); res.status(500).json({ error: e.message }); } });
app.use('/api/admin/districts', async (req, res, next) => { try { return (await getDistricts())(req, res, next); } catch (e) { console.error('API Error [districts]:', e); res.status(500).json({ error: e.message }); } });
app.use('/api/whatsapp', async (req, res, next) => { try { return (await getWhatsAppCRM())(req, res, next); } catch (e) { console.error('API Error [whatsapp]:', e); res.status(500).json({ error: e.message }); } });
app.use('/api/crm', async (req, res, next) => { try { return (await getCRM())(req, res, next); } catch (e) { console.error('API Error [crm]:', e); res.status(500).json({ error: e.message }); } });
app.use('/api/platform-config', async (req, res, next) => { try { return (await getPlatformConfig())(req, res, next); } catch (e) { console.error('API Error [platform-config]:', e); res.status(500).json({ error: e.message }); } });
app.use('/api/documents', async (req, res, next) => { try { return (await getDocuments())(req, res, next); } catch (e) { console.error('API Error [documents]:', e); res.status(500).json({ error: e.message }); } });
app.use('/api/system', async (req, res, next) => { try { return (await getSystem())(req, res, next); } catch (e) { console.error('API Error [system]:', e); res.status(500).json({ error: e.message }); } });
app.use('/api/whatsapp-qr', async (req, res, next) => { try { return (await getWhatsappQr())(req, res, next); } catch (e) { console.error('API Error [whatsapp-qr]:', e); res.status(500).json({ error: e.message }); } });
app.use('/api/content-studio', async (req, res, next) => { try { return (await getContentStudio())(req, res, next); } catch (e) { console.error('API Error [content-studio]:', e); res.status(500).json({ error: e.message }); } });
app.use('/api/domains', async (req, res, next) => { try { return (await getDomains())(req, res, next); } catch (e) { console.error('API Error [domains]:', e); res.status(500).json({ error: e.message }); } });
app.use('/api/cron', async (req, res, next) => { try { return (await getCron())(req, res, next); } catch (e) { console.error('API Error [cron]:', e); res.status(500).json({ error: e.message }); } });
app.use('/api/scout-grants', async (req, res, next) => { try { return (await getScoutGrants())(req, res, next); } catch (e) { console.error('API Error [scout-grants]:', e); res.status(500).json({ error: e.message }); } });
app.use('/api/district-analytics', async (req, res, next) => { try { return (await getDistAnalytics())(req, res, next); } catch (e) { console.error('API Error [district-analytics]:', e); res.status(500).json({ error: e.message }); } });
app.use('/api/district-ecosystem', async (req, res, next) => { try { return (await getDistEcosystem())(req, res, next); } catch (e) { console.error('API Error [district-ecosystem]:', e); res.status(500).json({ error: e.message }); } });
app.use('/api/contribution-campaigns', async (req, res, next) => { try { return (await getContribution())(req, res, next); } catch (e) { console.error('API Error [contribution-campaigns]:', e); res.status(500).json({ error: e.message }); } });
app.use('/api/spotlight-slides', async (req, res, next) => { try { return (await getSpotlight())(req, res, next); } catch (e) { console.error('API Error [spotlight-slides]:', e); res.status(500).json({ error: e.message }); } });
app.use('/api/anniversaries', async (req, res, next) => { try { return (await getAnniversaries())(req, res, next); } catch (e) { console.error('API Error [anniversaries]:', e); res.status(500).json({ error: e.message }); } });
// Notificaciones de Contribuciones (v4.856) — perfiles, beneficiarios y plantillas.
app.use('/api/notification-profiles', async (req, res, next) => { try { return (await getNotifProfiles())(req, res, next); } catch (e) { console.error('API Error [notification-profiles]:', e); res.status(500).json({ error: e.message }); } });

// Club Platform Insights — Informes Ejecutivos Inteligentes (v4.552.0)
app.use('/api/reports', async (req, res, next) => { try { return (await getReports())(req, res, next); } catch (e) { console.error('API Error [reports]:', e); res.status(500).json({ error: e.message }); } });

// Social Publishing Engine — Phase 1 (Meta OAuth + accounts management)
app.use('/api/social', async (req, res, next) => { try { return (await getSocial())(req, res, next); } catch (e) { console.error('API Error [social]:', e); res.status(500).json({ error: e.message }); } });
app.use('/api/distribution', async (req, res, next) => { try { return (await getDistribution())(req, res, next); } catch (e) { console.error('API Error [distribution]:', e); res.status(500).json({ error: e.message }); } });

// Donaciones + reportes financieros (v4.410 hotfix — el mount faltaba en api/index.js)
app.use('/api/financial', async (req, res, next) => { try { return (await getFinancial())(req, res, next); } catch (e) { console.error('API Error [financial]:', e); res.status(500).json({ error: e.message }); } });

// Bóveda de Fondos: balance + solicitudes de retiro (v4.411 hotfix — mismo bug que financial)
app.use('/api/payouts', async (req, res, next) => { try { return (await getPayouts())(req, res, next); } catch (e) { console.error('API Error [payouts]:', e); res.status(500).json({ error: e.message }); } });

// Calendario de Capacitaciones y Soporte (v4.563.0)
app.use('/api/training', async (req, res, next) => { try { return (await getTraining())(req, res, next); } catch (e) { console.error('API Error [training]:', e); res.status(500).json({ error: e.message }); } });
app.use('/api/project-fair', async (req, res, next) => { try { return (await getProjectFair())(req, res, next); } catch (e) { console.error('API Error [project-fair]:', e); res.status(500).json({ error: e.message }); } });
app.use('/api/event-registrations', async (req, res, next) => { try { return (await getEventRegistrations())(req, res, next); } catch (e) { console.error('API Error [event-registrations]:', e); res.status(500).json({ error: e.message }); } });

// SEO Inteligente (AI SEO Engine) — v4.703
app.use('/api/seo-engine', async (req, res, next) => { try { return (await getSeoEngine())(req, res, next); } catch (e) { console.error('API Error [seo-engine]:', e); res.status(500).json({ error: e.message }); } });

// ── robots.txt y sitemap.xml EN LA RAÍZ ───────────────────────────────────────
//
// Van montados acá, antes del catch-all, porque un rastreador los pide siempre
// en la raíz del dominio y en ningún otro sitio. Hasta v4.702 sólo existían bajo
// `/api/public/seo/…`, así que `GET /robots.txt` caía en la SPA y devolvía HTML
// con un 200: para Google, un sitio sin robots.txt y sin sitemap.
app.get('/robots.txt', async (req, res, next) => {
    try {
        const { getRobotsTxt } = await import('../server/controllers/seoController.js');
        return getRobotsTxt(req, res, next);
    } catch (e) {
        console.error('[seo] robots.txt:', e);
        res.type('text/plain').send('User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /admin/\n');
    }
});
app.get(['/sitemap.xml', '/sitemap_index.xml'], async (req, res, next) => {
    try {
        const { getSitemap } = await import('../server/controllers/seoController.js');
        return getSitemap(req, res, next);
    } catch (e) {
        console.error('[seo] sitemap.xml:', e);
        res.type('application/xml').send('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>');
    }
});

// ── Frontend & SEO Injection ──────────────────────────────────────────────────
app.get('*', async (req, res) => {
    // v4.649 — Una ruta /api que no esté montada arriba llega hasta aquí. Antes
    // se hacía `return` a secas: la petición se quedaba SIN RESPUESTA y el
    // navegador giraba hasta el timeout, sin ningún error que mirar. Fue lo que
    // escondió durante tres versiones que /api/event-registrations nunca se
    // había montado. Ahora se contesta 404 y se deja constancia en el log.
    if (req.path.startsWith('/api')) {
        console.error(`[api] Ruta no montada: ${req.method} ${req.path}`);
        return res.status(404).json({ error: `Ruta de API no encontrada: ${req.path}` });
    }

    // ── Global SaaS Redirect Logic ──
    const hostname = req.hostname || '';
    const isMainDomain = hostname === 'clubplatform.org' || 
                         hostname === 'www.clubplatform.org' || 
                         hostname === 'rotaryclubplatform.org' || 
                         hostname === 'www.rotaryclubplatform.org';
    
    // Redirect root or any non-system path if active
    const isSystemPath = req.path.startsWith('/admin') || 
                         req.path.startsWith('/api') || 
                         req.path.startsWith('/media') || 
                         req.path.startsWith('/assets');
    
    if (isMainDomain && !isSystemPath) {
        try {
            const redirectConfig = await prisma.platformConfig.findFirst({
                where: { key: 'saas_redirect' }
            });
            
            if (redirectConfig?.value === 'true') {
                const targetUrl = `https://app.clubplatform.org${req.path === '/' ? '' : req.path}`;
                res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
                return res.redirect(302, targetUrl);
            }
        } catch (e) {
            console.error('[RED-v4.142] Redirect Error:', e);
        }
    }

    // ── Redirecciones de enlaces del sitio ───────────────────────────────────
    //
    // Va ANTES de servir el documento: una dirección corta como
    // `/conferencia` no es una página de la aplicación, así que si llegara al
    // catch-all el visitante vería la pantalla de «no encontrado».
    //
    // Es un salto HTTP de verdad y no un `<Navigate>` de React a propósito: la
    // vista previa de WhatsApp, los rastreadores y `curl` no ejecutan
    // JavaScript. Mismo motivo por el que el `<head>` se resuelve acá (v4.702).
    try {
        const { readRedirectsForHost } = await import('../server/lib/linkRedirectStore.js');
        const { matchRule, buildTarget } = await import('../server/lib/linkRedirects.js');
        const rule = matchRule(req.path, await readRedirectsForHost(hostname));
        if (rule) {
            const target = buildTarget(rule, {
                search: req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : '',
            });
            // Una redirección temporal NO se cachea: es lo que permite
            // corregirla y que el cambio se note en la siguiente visita. La
            // permanente la elige el administrador sabiendo que el navegador la
            // va a recordar.
            if (!rule.permanent) res.setHeader('Cache-Control', 'no-store');
            return res.redirect(rule.permanent ? 301 : 302, target);
        }
    } catch (e) {
        // Nunca se rompe la página por esto: sin redirección, se sirve el sitio.
        console.error('[redirects]', e.message);
    }

    // ── SEO Inteligente: el <head> se resuelve en el servidor ────────────────
    //
    // Hasta v4.702 esto AÑADÍA `<meta name="description">`, `og:title` y
    // `og:image` antes de `</head>`, sin retirar los que `index.html` ya trae
    // escritos a mano. El documento quedaba con DOS `og:title` y toda red social
    // lee la primera aparición: la genérica de la plataforma. Ese es el motivo
    // exacto de que compartir cualquier sitio alojado mostrara la tarjeta
    // "Rotary ClubPlatform — Servicio por encima del interés propio" en vez de
    // la del sitio, y de que la vista previa no llevara imagen.
    //
    // Además la inyección era por SITIO, no por página —todas las direcciones
    // del mismo dominio compartían título y descripción— y el contenido se
    // interpolaba sin escapar, así que una comilla en el nombre o la
    // descripción del club partía la etiqueta.
    //
    // `renderPublicDocument` resuelve la entidad real de la dirección, retira lo
    // que va a escribir y escribe una sola vez, escapado, con canonical, JSON-LD
    // y Twitter Cards. Ver `server/lib/seoRender.js`.
    // ── Un archivo que no existe da 404, NO el documento (v4.789) ──
    //
    // `vercel.json` manda a esta función todo lo que no sea `/api/`, así que un
    // `/assets/ContentStudio-VIEJO.js` —que pide un navegador con el
    // `index.html` de un despliegue anterior— llegaba hasta abajo y recibía la
    // aplicación entera con estado 200 y `Content-Type: text/html`.
    //
    // Ese es el defecto del panel en blanco: el `import()` de `React.lazy`
    // intenta interpretar HTML como módulo, falla, y React CACHEA la promesa
    // rechazada — el componente ya no carga en toda la sesión, por más veces
    // que se navegue. Sólo lo arregla recargar, que es exactamente lo que se
    // reportó.
    //
    // Con un 404 de verdad el cliente puede atraparlo y recuperarse solo.
    if (isBuildAssetPath(req.path)) {
        res.setHeader('Cache-Control', 'no-store');

        // ── Rescate de una pestaña con el documento viejo en caché (v4.791) ──
        //
        // El 404 limpio corrige el diagnóstico pero no rescata a quien YA tenía
        // guardado el documento anterior a v4.789 —el que se servía sin
        // instrucciones de caché—: esa pestaña sigue pidiendo archivos de una
        // versión que no existe y se queda en blanco igual, porque el código
        // que sabría recuperarse vive justamente en el archivo que no llega.
        //
        // Lo único que ese navegador va a ejecutar es lo que le devolvamos en
        // el lugar del módulo. Se le devuelve un módulo mínimo que recarga: la
        // recarga trae el documento nuevo, que ya no se cachea, y con él los
        // archivos que sí existen.
        //
        // Sólo para peticiones de PROGRAMA (`Sec-Fetch-Dest: script`), que son
        // las de un `<script type="module">` o un `import()`. Una imagen o una
        // hoja de estilos siguen dando 404: ahí no hay nada que rescatar.
        if (isBuildScriptPath(req.path) && req.get('sec-fetch-dest') === 'script') {
            return res.status(200).type('application/javascript').send(reloadShim());
        }

        return res.status(404).type('text/plain')
            .send('Archivo no encontrado. Probablemente pertenece a una versión anterior del sitio.');
    }

    try {
        const indexPath = path.resolve(process.cwd(), 'dist/index.html');
        if (!fs.existsSync(indexPath)) return res.status(404).send('Frontend not built.');
        const html = fs.readFileSync(indexPath, 'utf8');

        const { renderPublicDocument } = await import('../server/lib/seoServe.js');
        const doc = await renderPublicDocument({
            html,
            host: hostname,
            path: req.path,
            protocol: req.headers['x-forwarded-proto'] || 'https',
        });

        // Una entidad que ya no existe responde 404 y no 200 con la SPA vacía:
        // un *soft 404* se indexa como página buena y acaba diluyendo el sitio.
        // El cuerpo sigue siendo la aplicación, así que el visitante ve la
        // pantalla de "no encontrado" con su navegación intacta.
        res.status(doc.status);
        // La ficha depende del dominio, así que una caché compartida tiene que
        // saberlo. Sin `Vary: Host` un proxy podría servirle a un sitio el <head>
        // de otro.
        res.setHeader('Vary', 'Host');
        // ── El documento NO se cachea (v4.789) ──
        //
        // Es la otra mitad del panel en blanco. El documento nombra los
        // archivos del build por su hash, y esos hashes cambian en cada
        // despliegue: un documento guardado en caché manda al navegador a pedir
        // archivos que ya no existen. Y como se sirve desde una función, sin
        // esta cabecera queda a merced de la caché heurística del navegador —
        // por eso una recarga normal no bastaba y hacía falta forzarla varias
        // veces.
        //
        // No encarece nada: lo pesado son los archivos de `/assets/`, que
        // llevan hash en el nombre, son inmutables y siguen cacheándose.
        res.setHeader('Cache-Control', 'no-store, must-revalidate');
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.send(doc.html);
    } catch (err) {
        // Un fallo del módulo de SEO NUNCA puede dejar el sitio sin servir. Se
        // entrega el documento tal cual: pierde las etiquetas resueltas, no la
        // página.
        console.error('[seo] Fallo al resolver el <head>, se sirve el documento base:', err);
        const indexPath = path.resolve(process.cwd(), 'dist/index.html');
        if (fs.existsSync(indexPath)) return res.sendFile(indexPath);
        res.status(500).send('Error loading page.');
    }
});

export default app;
// FORCE REBUILD 4.116d (Intelligence Live 🧠🚀🔥)
