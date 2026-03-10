import express from 'express';
import db from '../lib/db.js';

const router = express.Router();

const GA4_DATA_API = 'https://analyticsdata.googleapis.com/v1beta/properties';

// ── Build a signed JWT and exchange for access token (Service Account flow) ──
async function getAccessToken() {
    const saJson = process.env.GA4_SERVICE_ACCOUNT_JSON;
    if (!saJson) throw new Error('GA4_SERVICE_ACCOUNT_JSON not configured');

    let sa;
    try { sa = JSON.parse(saJson); }
    catch { throw new Error('GA4_SERVICE_ACCOUNT_JSON is not valid JSON'); }

    const now = Math.floor(Date.now() / 1000);
    const header = { alg: 'RS256', typ: 'JWT' };
    const payload = {
        iss: sa.client_email,
        scope: 'https://www.googleapis.com/auth/analytics.readonly',
        aud: 'https://oauth2.googleapis.com/token',
        iat: now,
        exp: now + 3600,
    };

    // Minimal RS256 JWT signing using Web Crypto (Node 18+)
    const enc = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
    const headerB64 = enc(header);
    const payloadB64 = enc(payload);
    const signingInput = `${headerB64}.${payloadB64}`;

    // Import PEM private key
    // Handle both actual \n newlines AND literal '\n' strings (Vercel env var edge case)
    const pemKey = (sa.private_key || '').replace(/\\n/g, '\n');
    const pemBody = pemKey
        .replace(/-----BEGIN PRIVATE KEY-----/g, '')
        .replace(/-----END PRIVATE KEY-----/g, '')
        .replace(/\n/g, '')
        .replace(/\r/g, '')
        .trim();
    const binaryKey = Buffer.from(pemBody, 'base64');

    const cryptoKey = await crypto.subtle.importKey(
        'pkcs8',
        binaryKey,
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false,
        ['sign']
    );

    const signature = await crypto.subtle.sign(
        'RSASSA-PKCS1-v1_5',
        cryptoKey,
        Buffer.from(signingInput)
    );

    const jwt = `${signingInput}.${Buffer.from(signature).toString('base64url')}`;

    // Exchange JWT for access token
    const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            assertion: jwt,
        }),
    });

    if (!tokenResp.ok) {
        const err = await tokenResp.text();
        throw new Error(`OAuth token error: ${err}`);
    }
    const tokenData = await tokenResp.json();
    return tokenData.access_token;
}

// ── Get GA4 Property ID from DB ───────────────────────────────────────────────
async function getPropertyId() {
    try {
        const r = await db.query(
            `SELECT value FROM "Setting" WHERE key = 'analytics_ga4_property_id' AND "clubId" IS NULL ORDER BY "updatedAt" DESC LIMIT 1`
        );
        return r.rows[0]?.value || process.env.GA4_PROPERTY_ID || '';
    } catch (e) {
        console.error('[Analytics] getPropertyId error:', e.message);
        return process.env.GA4_PROPERTY_ID || '';
    }
}

// ── GET /api/analytics/debug — shows config state without exposing secrets ────
router.get('/debug', async (req, res) => {
    const saJson = process.env.GA4_SERVICE_ACCOUNT_JSON;
    let saStatus = 'missing';
    let clientEmail = null;
    if (saJson) {
        try {
            const sa = JSON.parse(saJson);
            clientEmail = sa.client_email;
            const hasPem = (sa.private_key || '').includes('BEGIN PRIVATE KEY');
            saStatus = hasPem ? 'ok' : 'invalid_pem';
        } catch { saStatus = 'invalid_json'; }
    }
    let propertyId = '';
    try { propertyId = await getPropertyId(); } catch { propertyId = 'db_error'; }
    res.json({ saStatus, clientEmail, propertyId, ga4PropertyIdEnv: !!process.env.GA4_PROPERTY_ID });
});

// ── Helper: run a GA4 report ──────────────────────────────────────────────────
async function runGA4Report(propertyId, token, body) {
    const resp = await fetch(`${GA4_DATA_API}/${propertyId}:runReport`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });
    if (!resp.ok) {
        const err = await resp.text();
        throw new Error(`GA4 API error: ${err}`);
    }
    return resp.json();
}

// ── Parse dimension/metric rows from GA4 response ────────────────────────────
function parseRows(report) {
    if (!report?.rows) return [];
    const dims = report.dimensionHeaders?.map(h => h.name) || [];
    const mets = report.metricHeaders?.map(h => h.name) || [];
    return report.rows.map(row => {
        const obj = {};
        dims.forEach((d, i) => { obj[d] = row.dimensionValues?.[i]?.value; });
        mets.forEach((m, i) => { obj[m] = parseInt(row.metricValues?.[i]?.value || '0', 10); });
        return obj;
    });
}

// ── GET /api/analytics/traffic?days=30&hostname=optional (super admin = no hostname) ──
router.get('/traffic', async (req, res) => {
    const { days = '30', hostname } = req.query;

    try {
        const propertyId = await getPropertyId();
        if (!propertyId) {
            return res.json({ mock: true, chartData: [], totals: { sessions: 0, users: 0, pageViews: 0 }, topPages: [], topCountries: [] });
        }

        const token = await getAccessToken();
        const dateRange = [{ startDate: `${days}daysAgo`, endDate: 'today' }];

        // Build hostname filter only if hostname is provided (club users)
        const dimensionFilter = hostname ? {
            filter: {
                fieldName: 'hostName',
                stringFilter: { matchType: 'CONTAINS', value: hostname },
            },
        } : undefined;

        const reportBody = (dims, mets, orderBys, limit = 90) => ({
            dateRanges: dateRange,
            dimensions: dims.map(name => ({ name })),
            metrics: mets.map(name => ({ name })),
            ...(dimensionFilter && { dimensionFilter }),
            ...(orderBys && { orderBys }),
            limit,
        });

        const [overviewReport, pagesReport, countriesReport] = await Promise.all([
            runGA4Report(propertyId, token, reportBody(
                ['date'],
                ['sessions', 'totalUsers', 'screenPageViews'],
                [{ dimension: { dimensionName: 'date' } }],
            )),
            runGA4Report(propertyId, token, reportBody(
                ['pagePath'],
                ['screenPageViews'],
                [{ metric: { metricName: 'screenPageViews' }, desc: true }],
                5,
            )),
            runGA4Report(propertyId, token, reportBody(
                ['country'],
                ['sessions'],
                [{ metric: { metricName: 'sessions' }, desc: true }],
                5,
            )),
        ]);

        const overviewRows = parseRows(overviewReport);
        const totals = overviewRows.reduce((acc, r) => ({
            sessions: acc.sessions + (r.sessions || 0),
            users: acc.users + (r.totalUsers || 0),
            pageViews: acc.pageViews + (r.screenPageViews || 0),
        }), { sessions: 0, users: 0, pageViews: 0 });

        const chartData = overviewRows.map(r => ({
            name: r.date ? `${r.date.slice(6, 8)}/${r.date.slice(4, 6)}` : '',
            value: r.sessions || 0,
            users: r.totalUsers || 0,
            pageViews: r.screenPageViews || 0,
        }));

        res.json({
            chartData,
            totals,
            topPages: parseRows(pagesReport).map(r => ({ path: r.pagePath, views: r.screenPageViews || 0 })),
            topCountries: parseRows(countriesReport).map(r => ({ country: r.country, sessions: r.sessions || 0 })),
            days: parseInt(days, 10),
            hostname: hostname || 'all',
        });
    } catch (err) {
        console.error('[Analytics/traffic]', err.message);
        res.json({
            mock: true, error: err.message,
            chartData: [], totals: { sessions: 0, users: 0, pageViews: 0 },
            topPages: [], topCountries: [],
        });
    }
});

// ── GET /api/analytics/club-stats?hostname=rotarymedellin.org&days=30 ─────────
router.get('/club-stats', async (req, res) => {
    const { hostname, days = '30' } = req.query;
    if (!hostname) return res.status(400).json({ error: 'hostname required' });

    try {
        const propertyId = await getPropertyId();
        if (!propertyId) return res.status(503).json({ error: 'GA4 Property ID not configured', mock: true });

        const token = await getAccessToken();
        const dateRange = [{ startDate: `${days}daysAgo`, endDate: 'today' }];
        const hostnameFilter = {
            filter: {
                fieldName: 'hostName',
                stringFilter: { matchType: 'CONTAINS', value: hostname },
            },
        };

        // Run 3 reports in parallel
        const [overviewReport, pagesReport, countriesReport] = await Promise.all([
            // Overview: sessions, users, page views, bounce rate
            runGA4Report(propertyId, token, {
                dateRanges: dateRange,
                dimensions: [{ name: 'date' }],
                metrics: [
                    { name: 'sessions' },
                    { name: 'totalUsers' },
                    { name: 'screenPageViews' },
                    { name: 'bounceRate' },
                    { name: 'averageSessionDuration' },
                ],
                dimensionFilter: hostnameFilter,
                orderBys: [{ dimension: { dimensionName: 'date' } }],
                limit: 90,
            }),
            // Top pages
            runGA4Report(propertyId, token, {
                dateRanges: dateRange,
                dimensions: [{ name: 'pagePath' }, { name: 'pageTitle' }],
                metrics: [{ name: 'screenPageViews' }, { name: 'totalUsers' }],
                dimensionFilter: hostnameFilter,
                orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
                limit: 5,
            }),
            // Traffic by country
            runGA4Report(propertyId, token, {
                dateRanges: dateRange,
                dimensions: [{ name: 'country' }],
                metrics: [{ name: 'sessions' }],
                dimensionFilter: hostnameFilter,
                orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
                limit: 5,
            }),
        ]);

        const overviewRows = parseRows(overviewReport);
        const totals = overviewRows.reduce((acc, r) => ({
            sessions: acc.sessions + r.sessions,
            users: acc.users + r.totalUsers,
            pageViews: acc.pageViews + r.screenPageViews,
            avgBounce: r.bounceRate, // last day
            avgDuration: r.averageSessionDuration,
        }), { sessions: 0, users: 0, pageViews: 0, avgBounce: 0, avgDuration: 0 });

        // Format chart data (last 30 days per day)
        const chartData = overviewRows.map(r => ({
            date: r.date ? `${r.date.slice(6, 8)}/${r.date.slice(4, 6)}` : '',
            sessions: r.sessions,
            users: r.totalUsers,
        }));

        res.json({
            totals: {
                sessions: totals.sessions,
                users: totals.users,
                pageViews: totals.pageViews,
                avgDurationSecs: Math.round(totals.avgDuration),
            },
            chartData,
            topPages: parseRows(pagesReport).map(r => ({
                path: r.pagePath,
                title: r.pageTitle,
                views: r.screenPageViews,
                users: r.totalUsers,
            })),
            topCountries: parseRows(countriesReport).map(r => ({
                country: r.country,
                sessions: r.sessions,
            })),
            days: parseInt(days, 10),
            hostname,
        });
    } catch (err) {
        console.error('[Analytics]', err.message);
        // Return mock data so UI doesn't break while GA4 is being configured
        res.json({
            error: err.message,
            mock: true,
            totals: { sessions: 0, users: 0, pageViews: 0, avgDurationSecs: 0 },
            chartData: [],
            topPages: [],
            topCountries: [],
        });
    }
});

// ── POST /api/analytics/property-id — save GA4 numeric Property ID ────────────
router.post('/property-id', async (req, res) => {
    const { propertyId } = req.body;
    if (!propertyId) return res.status(400).json({ error: 'propertyId required' });
    try {
        // NULL-safe upsert: PostgreSQL ON CONFLICT doesn't fire when clubId IS NULL
        // (NULL != NULL in unique index semantics). Use DELETE + INSERT instead.
        await db.query(
            `DELETE FROM "Setting" WHERE key = 'analytics_ga4_property_id' AND "clubId" IS NULL`
        );
        await db.query(
            `INSERT INTO "Setting" (id, key, value, "clubId", "updatedAt")
             VALUES (gen_random_uuid(), 'analytics_ga4_property_id', $1, NULL, NOW())`,
            [propertyId]
        );
        res.json({ ok: true, propertyId });
    } catch (err) {
        console.error('[Analytics] save propertyId error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ── GET /api/analytics/property-id ───────────────────────────────────────────
router.get('/property-id', async (req, res) => {
    try {
        const pid = await getPropertyId();
        res.json({ propertyId: pid });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
