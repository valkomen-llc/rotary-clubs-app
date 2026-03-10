import express from 'express';
import cors from 'cors';

const app = express();
app.use(cors({ origin: true, credentials: true }));

// Parse raw body for Stripe Webhooks BEFORE express.json()
app.post('/api/payments/webhook', express.raw({ type: 'application/json' }), async (req, res, next) => {
    const { stripeWebhook } = await import('../server/controllers/paymentController.js');
    return stripeWebhook(req, res, next);
});

app.use(express.json());

// ── Static endpoints ─────────────────────────────────────────────────────────
app.get('/api', (req, res) => {
    res.json({ status: 'ok', version: '2.3.2' });
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

let _analytics;
const getAnalytics = async () => _analytics || (({ default: _analytics } = await import('../server/routes/analytics.js')), _analytics);

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

export default app;
