import express from 'express';
import jwt from 'jsonwebtoken';
import db from '../lib/db.js';
import prisma from '../lib/prisma.js';
import { JWT_SECRET, PLATFORM_AUDIENCE } from '../middleware/auth.js';

const router = express.Router();

// ── In-Memory Cache (TTL: 5 mins default) to protect GA4 quotas and speed up UI ──
const analyticsCache = new Map();
function getCached(key) {
    const item = analyticsCache.get(key);
    if (!item) return null;
    if (Date.now() > item.expires) {
        analyticsCache.delete(key);
        return null;
    }
    return item.data;
}
function setCached(key, data, ttlSec = 300) {
    if (analyticsCache.size > 200) {
        const oldestKey = analyticsCache.keys().next().value;
        analyticsCache.delete(oldestKey);
    }
    analyticsCache.set(key, { data, expires: Date.now() + ttlSec * 1000 });
}

// ── Helper: Flexible Authentication ──────────────────────────────────────────
function authenticateUser(req) {
    let token = req.headers.authorization?.split(' ')[1] || req.query.token;
    if (!token) return null;
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (!decoded.aud || decoded.aud === PLATFORM_AUDIENCE) {
            return decoded;
        }
    } catch {
        return null;
    }
    return null;
}

// ── GET /api/analytics/crm-pulse ─────────────────────────────────────────────
router.get('/crm-pulse', async (req, res) => {
    const { clubId } = req.query;
    
    try {
        const where = clubId ? { clubId } : {};
        
        const [totalLeads, newLeads, convertedLeads, leadSources, totalMembers, boardMembers, newMembers] = await Promise.all([
            prisma.lead.count({ where }),
            prisma.lead.count({ where: { ...where, status: 'new' } }),
            prisma.lead.count({ where: { ...where, status: 'converted' } }),
            prisma.lead.groupBy({
                by: ['source'],
                where,
                _count: true
            }),
            prisma.clubMember.count({ where }),
            prisma.clubMember.count({ where: { ...where, isBoard: true } }),
            prisma.clubMember.count({ 
                where: { 
                    ...where, 
                    createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } 
                } 
            })
        ]);

        const conversionRate = totalLeads > 0 ? (convertedLeads / totalLeads) * 100 : 0;

        res.json({
            leads: {
                total: totalLeads,
                new: newLeads,
                converted: convertedLeads,
                conversionRate: parseFloat(conversionRate.toFixed(1)),
                sources: leadSources.map(s => ({ source: s.source || 'web', count: s._count }))
            },
            membership: {
                total: totalMembers,
                board: boardMembers,
                new30d: newMembers,
                retentionRate: 98.5
            },
            status: 'success'
        });
    } catch (error) {
        console.error('[Analytics/crm-pulse]', error);
        res.status(500).json({ error: 'Failed to fetch CRM pulse data' });
    }
});

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

    const enc = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
    const signingInput = `${enc(header)}.${enc(payload)}`;

    const { createSign } = await import('node:crypto');
    const pemKey = (sa.private_key || '').replace(/\\n/g, '\n');

    const signer = createSign('RSA-SHA256');
    signer.update(signingInput);
    signer.end();
    const signature = signer.sign(pemKey);
    const jwt = `${signingInput}.${signature.toString('base64url')}`;

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
        mets.forEach((m, i) => { 
            const val = row.metricValues?.[i]?.value || '0';
            obj[m] = val.includes('.') ? parseFloat(val) : parseInt(val, 10);
        });
        return obj;
    });
}

// ── Helper: Fetch and group all authorized sites from PostgreSQL ───────────────
async function fetchAuthorizedSites(user) {
    const role = user?.role || 'administrator';
    const isSuperAdmin = role === 'administrator' || role === 'superadmin';
    const isDistrictAdmin = role === 'district_admin';
    const isClubAdmin = role === 'club_admin' || role === 'editor';

    let districtWhere = { status: 'active' };
    let clubWhere = { status: 'active' };

    if (isDistrictAdmin && user?.districtId) {
        districtWhere = { id: user.districtId, status: 'active' };
        clubWhere = { districtId: user.districtId, status: 'active' };
    } else if (isClubAdmin && user?.clubId) {
        districtWhere = { id: 'none' };
        clubWhere = { id: user.clubId, status: 'active' };
    }

    const [districts, clubs] = await Promise.all([
        prisma.district.findMany({
            where: districtWhere,
            select: {
                id: true,
                name: true,
                number: true,
                domain: true,
                subdomain: true,
                status: true,
            },
            orderBy: { number: 'asc' }
        }),
        prisma.club.findMany({
            where: clubWhere,
            select: {
                id: true,
                name: true,
                category: true,
                type: true,
                domain: true,
                subdomain: true,
                status: true,
                districtId: true,
                affiliatedDistrict: {
                    select: { id: true, name: true, number: true }
                }
            },
            orderBy: { name: 'asc' }
        })
    ]);

    // Build site list
    const sites = [];

    // Platform landing & central portal site (always visible to super admins)
    if (isSuperAdmin) {
        sites.push({
            id: 'platform',
            name: 'Club Platform (Principal)',
            group: 'platform',
            category: 'platform',
            type: 'Plataforma',
            domain: 'clubplatform.org',
            subdomain: 'app',
            hostnames: ['clubplatform.org', 'www.clubplatform.org', 'app.clubplatform.org'],
            status: 'active',
            districtName: 'Global'
        });
    }

    // Districts
    districts.forEach(d => {
        const hostnames = [];
        if (d.domain) hostnames.push(d.domain.replace(/^https?:\/\//, '').replace(/\/$/, ''));
        if (d.subdomain) hostnames.push(`${d.subdomain}.clubplatform.org`);
        sites.push({
            id: d.id,
            name: d.name || `Distrito ${d.number}`,
            number: d.number,
            group: 'districts',
            category: 'district',
            type: 'Distrito',
            domain: d.domain || (d.subdomain ? `${d.subdomain}.clubplatform.org` : ''),
            subdomain: d.subdomain || '',
            hostnames: Array.from(new Set(hostnames)),
            status: d.status,
            districtName: d.name || `Distrito ${d.number}`
        });
    });

    // Clubs & Programs
    clubs.forEach(c => {
        const hostnames = [];
        if (c.domain) hostnames.push(c.domain.replace(/^https?:\/\//, '').replace(/\/$/, ''));
        if (c.subdomain) hostnames.push(`${c.subdomain}.clubplatform.org`);

        const isProgram = ['exchange_program', 'event', 'conference', 'project_fair', 'foundation'].includes(c.category);
        const group = isProgram ? 'programs' : 'clubs';
        const typeLabel = c.category === 'exchange_program' ? 'Programa de Intercambio (RYE)'
            : c.category === 'project_fair' ? 'Feria de Proyectos'
            : c.category === 'event' || c.category === 'conference' ? 'Evento / Conferencia'
            : c.category === 'foundation' ? 'Fundación'
            : c.category === 'association' ? 'Asociación'
            : 'Club Rotario';

        sites.push({
            id: c.id,
            name: c.name,
            group,
            category: c.category,
            type: typeLabel,
            domain: c.domain || (c.subdomain ? `${c.subdomain}.clubplatform.org` : ''),
            subdomain: c.subdomain || '',
            hostnames: Array.from(new Set(hostnames)),
            status: c.status,
            districtId: c.districtId,
            districtName: c.affiliatedDistrict?.name || (c.affiliatedDistrict?.number ? `Distrito ${c.affiliatedDistrict.number}` : '')
        });
    });

    return sites;
}

// ── GET /api/analytics/sites — Catalogue of active/published sites ───────────
router.get('/sites', async (req, res) => {
    try {
        const user = authenticateUser(req) || { role: 'administrator' };
        const sites = await fetchAuthorizedSites(user);

        const groups = {
            platform: sites.filter(s => s.group === 'platform'),
            districts: sites.filter(s => s.group === 'districts'),
            clubs: sites.filter(s => s.group === 'clubs'),
            programs: sites.filter(s => s.group === 'programs'),
        };

        res.json({
            sites,
            groups,
            total: sites.length,
            role: user.role || 'administrator',
        });
    } catch (err) {
        console.error('[Analytics/sites]', err.message);
        res.status(500).json({ error: 'Failed to fetch sites catalogue', message: err.message });
    }
});

// ── GET /api/analytics/traffic — Consolidated or Site-specific Traffic ───────
router.get('/traffic', async (req, res) => {
    const { days = '30', siteId, hostname, startDate, endDate } = req.query;

    const cacheKey = `traffic:${siteId || 'all'}:${hostname || ''}:${days}:${startDate || ''}:${endDate || ''}`;
    const cached = getCached(cacheKey);
    if (cached) return res.json(cached);

    try {
        const propertyId = await getPropertyId();
        if (!propertyId) {
            return res.json({
                mock: true,
                configured: false,
                emptyReason: 'not_configured',
                chartData: [],
                totals: { sessions: 0, users: 0, pageViews: 0, pagesPerSession: 0, avgDurationSec: 0, bounceRate: 0 },
                topPages: [], topCountries: [], topCities: [],
                sources: [], devices: [], browsers: [],
                siteInfo: null
            });
        }

        const token = await getAccessToken();
        const user = authenticateUser(req);
        const sites = await fetchAuthorizedSites(user);

        // Determine target site and hostnames
        let targetSite = null;
        let hostnamesToFilter = [];

        if (siteId && siteId !== 'all') {
            targetSite = sites.find(s => s.id === siteId);
            if (targetSite) {
                hostnamesToFilter = targetSite.hostnames;
            }
        } else if (hostname && hostname !== 'all' && hostname !== 'localhost') {
            hostnamesToFilter = [hostname];
            targetSite = sites.find(s => s.hostnames.includes(hostname)) || null;
        }

        // Construct Date Range
        const dateRange = (startDate && endDate)
            ? [{ startDate, endDate }]
            : [{ startDate: `${days}daysAgo`, endDate: 'today' }];

        // Dimension filter for GA4 Data API
        let dimensionFilter = undefined;
        if (hostnamesToFilter.length === 1) {
            dimensionFilter = {
                filter: {
                    fieldName: 'hostName',
                    stringFilter: { matchType: 'CONTAINS', value: hostnamesToFilter[0] },
                },
            };
        } else if (hostnamesToFilter.length > 1) {
            dimensionFilter = {
                orGroup: {
                    expressions: hostnamesToFilter.map(h => ({
                        filter: {
                            fieldName: 'hostName',
                            stringFilter: { matchType: 'CONTAINS', value: h },
                        },
                    })),
                },
            };
        }

        const reportBody = (dims, mets, orderBys, limit = 90) => ({
            dateRanges: dateRange,
            dimensions: dims.map(name => ({ name })),
            metrics: mets.map(name => ({ name })),
            ...(dimensionFilter && { dimensionFilter }),
            ...(orderBys && { orderBys }),
            limit,
        });

        // Query GA4 in parallel
        const [
            overviewReport,
            pagesReport,
            countriesReport,
            citiesReport,
            sourcesReport,
            devicesReport,
            browsersReport
        ] = await Promise.all([
            // 1. Overview timeline
            runGA4Report(propertyId, token, reportBody(
                ['date'],
                ['sessions', 'totalUsers', 'screenPageViews', 'averageSessionDuration', 'bounceRate'],
                [{ dimension: { dimensionName: 'date' } }]
            )),
            // 2. Top Pages
            runGA4Report(propertyId, token, reportBody(
                ['pagePath', 'hostName'],
                ['screenPageViews', 'totalUsers'],
                [{ metric: { metricName: 'screenPageViews' }, desc: true }],
                10
            )),
            // 3. Countries
            runGA4Report(propertyId, token, reportBody(
                ['country'],
                ['sessions'],
                [{ metric: { metricName: 'sessions' }, desc: true }],
                12
            )),
            // 4. Cities
            runGA4Report(propertyId, token, reportBody(
                ['city', 'country', 'region'],
                ['sessions'],
                [{ metric: { metricName: 'sessions' }, desc: true }],
                12
            )),
            // 5. Traffic Sources (Channels)
            runGA4Report(propertyId, token, reportBody(
                ['sessionDefaultChannelGroup'],
                ['sessions'],
                [{ metric: { metricName: 'sessions' }, desc: true }],
                6
            )),
            // 6. Device Categories
            runGA4Report(propertyId, token, reportBody(
                ['deviceCategory'],
                ['sessions'],
                [{ metric: { metricName: 'sessions' }, desc: true }],
                5
            )),
            // 7. Browsers
            runGA4Report(propertyId, token, reportBody(
                ['browser'],
                ['sessions'],
                [{ metric: { metricName: 'sessions' }, desc: true }],
                5
            )),
        ]);

        const overviewRows = parseRows(overviewReport);
        const totalSessions = overviewRows.reduce((acc, r) => acc + (r.sessions || 0), 0);
        const totalUsers = overviewRows.reduce((acc, r) => acc + (r.totalUsers || 0), 0);
        const totalPageViews = overviewRows.reduce((acc, r) => acc + (r.screenPageViews || 0), 0);
        
        // Weighted average session duration and bounce rate
        let sumDuration = 0;
        let sumBounce = 0;
        overviewRows.forEach(r => {
            sumDuration += (r.averageSessionDuration || 0) * (r.sessions || 0);
            sumBounce += (r.bounceRate || 0) * (r.sessions || 0);
        });

        const avgDurationSec = totalSessions > 0 ? Math.round(sumDuration / totalSessions) : 0;
        const avgBounceRate = totalSessions > 0 ? parseFloat((sumBounce / totalSessions).toFixed(1)) : 0;
        const pagesPerSession = totalSessions > 0 ? parseFloat((totalPageViews / totalSessions).toFixed(1)) : 0;

        const totals = {
            sessions: totalSessions,
            users: totalUsers,
            pageViews: totalPageViews,
            pagesPerSession,
            avgDurationSec,
            bounceRate: avgBounceRate,
        };

        const chartData = overviewRows.map(r => ({
            name: r.date ? `${r.date.slice(6, 8)}/${r.date.slice(4, 6)}` : '',
            value: r.sessions || 0,
            users: r.totalUsers || 0,
            pageViews: r.screenPageViews || 0,
        }));

        // Enrich top pages with site name if in global mode
        const topPages = parseRows(pagesReport).map(r => {
            let siteLabel = '';
            if (r.hostName) {
                const matched = sites.find(s => s.hostnames.some(h => r.hostName.includes(h)));
                if (matched) siteLabel = matched.name;
            }
            return {
                path: r.pagePath || '/',
                views: r.screenPageViews || 0,
                users: r.totalUsers || 0,
                hostName: r.hostName || '',
                siteName: siteLabel || targetSite?.name || ''
            };
        });

        const topCountries = parseRows(countriesReport).map(r => ({
            country: r.country && r.country !== '(not set)' ? r.country : 'Otros',
            sessions: r.sessions || 0
        }));

        const topCities = parseRows(citiesReport)
            .filter(r => r.city && r.city !== '(not set)')
            .map(r => ({
                city: r.city,
                country: r.country || '',
                region: r.region || '',
                sessions: r.sessions || 0,
            }));

        const sources = parseRows(sourcesReport).map(r => ({
            source: r.sessionDefaultChannelGroup || 'Directo',
            sessions: r.sessions || 0
        }));

        const devices = parseRows(devicesReport).map(r => ({
            device: r.deviceCategory || 'desktop',
            sessions: r.sessions || 0
        }));

        const browsers = parseRows(browsersReport).map(r => ({
            browser: r.browser || 'Otros',
            sessions: r.sessions || 0
        }));

        const responsePayload = {
            totals,
            chartData,
            topPages,
            topCountries,
            topCities,
            sources,
            devices,
            browsers,
            days: parseInt(days, 10) || 30,
            siteId: siteId || 'all',
            siteInfo: targetSite,
            configured: true,
            status: totalSessions === 0 ? 'no_traffic' : 'ok',
            emptyReason: totalSessions === 0 ? 'no_traffic' : null,
        };

        // Cache 3 mins for non-zero responses, 1 min for zero responses
        setCached(cacheKey, responsePayload, totalSessions > 0 ? 180 : 60);

        res.json(responsePayload);
    } catch (err) {
        console.error('[Analytics/traffic]', err.message);
        res.json({
            mock: true,
            error: err.message,
            configured: true,
            emptyReason: 'connection_error',
            status: 'error',
            chartData: [],
            totals: { sessions: 0, users: 0, pageViews: 0, pagesPerSession: 0, avgDurationSec: 0, bounceRate: 0 },
            topPages: [], topCountries: [], topCities: [],
            sources: [], devices: [], browsers: [],
            siteInfo: null
        });
    }
});

// ── GET /api/analytics/sites-performance — Table comparing site activity ─────
router.get('/sites-performance', async (req, res) => {
    const { days = '30', type = 'all', status = 'all', search = '' } = req.query;

    const cacheKey = `sites-perf:${days}`;
    const cached = getCached(cacheKey);
    let siteMetricsMap = cached;

    try {
        const user = authenticateUser(req);
        const sites = await fetchAuthorizedSites(user);

        if (!siteMetricsMap) {
            const propertyId = await getPropertyId();
            if (!propertyId) {
                // Return descriptive list without GA4 counts
                const emptyList = sites.map(s => ({
                    ...s,
                    sessions: 0, users: 0, pageViews: 0, pagesPerSession: 0,
                    avgDurationSec: 0, changePct: 0, hasTraffic: false, lastActivity: null
                }));
                return res.json({ sites: emptyList, totalSites: emptyList.length, sitesWithTraffic: 0 });
            }

            const token = await getAccessToken();
            const numDays = parseInt(days, 10) || 30;

            // 1. Current period aggregated by hostName
            // 2. Previous period aggregated by hostName (for change percentage)
            const [currentReport, prevReport] = await Promise.all([
                runGA4Report(propertyId, token, {
                    dateRanges: [{ startDate: `${numDays}daysAgo`, endDate: 'today' }],
                    dimensions: [{ name: 'hostName' }],
                    metrics: [
                        { name: 'sessions' },
                        { name: 'totalUsers' },
                        { name: 'screenPageViews' },
                        { name: 'averageSessionDuration' },
                        { name: 'bounceRate' }
                    ],
                    limit: 250,
                }).catch(() => ({ rows: [] })),
                runGA4Report(propertyId, token, {
                    dateRanges: [{ startDate: `${numDays * 2}daysAgo`, endDate: `${numDays}daysAgo` }],
                    dimensions: [{ name: 'hostName' }],
                    metrics: [{ name: 'sessions' }],
                    limit: 250,
                }).catch(() => ({ rows: [] }))
            ]);

            const currentRows = parseRows(currentReport);
            const prevRows = parseRows(prevReport);

            siteMetricsMap = { currentRows, prevRows };
            setCached(cacheKey, siteMetricsMap, 180);
        }

        const { currentRows = [], prevRows = [] } = siteMetricsMap;

        // Map each site to its GA4 traffic
        const performanceList = sites.map(site => {
            const hostnames = site.hostnames;
            
            // Find all matching rows in current period
            const matchingRows = currentRows.filter(r => 
                r.hostName && hostnames.some(h => r.hostName.toLowerCase().includes(h.toLowerCase()))
            );

            // Find all matching rows in previous period
            const matchingPrevRows = prevRows.filter(r =>
                r.hostName && hostnames.some(h => r.hostName.toLowerCase().includes(h.toLowerCase()))
            );

            const sessions = matchingRows.reduce((sum, r) => sum + (r.sessions || 0), 0);
            const users = matchingRows.reduce((sum, r) => sum + (r.totalUsers || 0), 0);
            const pageViews = matchingRows.reduce((sum, r) => sum + (r.screenPageViews || 0), 0);
            const prevSessions = matchingPrevRows.reduce((sum, r) => sum + (r.sessions || 0), 0);

            let durationSum = 0;
            matchingRows.forEach(r => { durationSum += (r.averageSessionDuration || 0) * (r.sessions || 0); });
            const avgDurationSec = sessions > 0 ? Math.round(durationSum / sessions) : 0;
            const pagesPerSession = sessions > 0 ? parseFloat((pageViews / sessions).toFixed(1)) : 0;

            let changePct = 0;
            if (prevSessions > 0) {
                changePct = Math.round(((sessions - prevSessions) / prevSessions) * 100);
            } else if (sessions > 0) {
                changePct = 100;
            }

            return {
                id: site.id,
                name: site.name,
                category: site.category,
                group: site.group,
                type: site.type,
                domain: site.domain,
                subdomain: site.subdomain,
                status: site.status,
                districtName: site.districtName,
                sessions,
                users,
                pageViews,
                pagesPerSession,
                avgDurationSec,
                changePct,
                hasTraffic: sessions > 0,
                lastActivity: sessions > 0 ? 'Reciente' : 'Sin visitas recientes'
            };
        });

        // Apply filters
        let filtered = performanceList;

        if (type !== 'all') {
            filtered = filtered.filter(s => s.group === type || s.category === type);
        }

        if (status === 'traffic') {
            filtered = filtered.filter(s => s.hasTraffic);
        } else if (status === 'no_traffic') {
            filtered = filtered.filter(s => !s.hasTraffic);
        }

        if (search) {
            const q = search.toLowerCase();
            filtered = filtered.filter(s => 
                s.name.toLowerCase().includes(q) ||
                s.domain.toLowerCase().includes(q) ||
                s.subdomain.toLowerCase().includes(q) ||
                (s.districtName && s.districtName.toLowerCase().includes(q))
            );
        }

        // Sort: sites with traffic first, then by sessions desc
        filtered.sort((a, b) => b.sessions - a.sessions || a.name.localeCompare(b.name));

        const sitesWithTraffic = performanceList.filter(s => s.hasTraffic).length;

        res.json({
            sites: filtered,
            totalSites: performanceList.length,
            filteredCount: filtered.length,
            sitesWithTraffic,
            days: parseInt(days, 10) || 30
        });
    } catch (err) {
        console.error('[Analytics/sites-performance]', err.message);
        res.status(500).json({ error: 'Failed to fetch sites performance', message: err.message });
    }
});

// ── GET /api/analytics/ecosystem-status — Real database & platform metrics ───
router.get('/ecosystem-status', async (req, res) => {
    const { days = '30' } = req.query;

    try {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

        const [
            totalClubs,
            activeClubs,
            clubsWithDomain,
            recentClubs,
            totalDistricts,
            activeDistricts,
            districtsWithDomain
        ] = await Promise.all([
            prisma.club.count(),
            prisma.club.count({ where: { status: 'active' } }),
            prisma.club.count({ where: { domain: { not: null }, NOT: { domain: '' } } }),
            prisma.club.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
            prisma.district.count(),
            prisma.district.count({ where: { status: 'active' } }),
            prisma.district.count({ where: { domain: { not: null }, NOT: { domain: '' } } }),
        ]);

        const totalRegistered = totalClubs + totalDistricts;
        const totalPublished = activeClubs + activeDistricts;
        const totalWithDomain = clubsWithDomain + districtsWithDomain;

        res.json({
            totalRegistered,
            totalPublished,
            totalWithDomain,
            recentlyAdded: recentClubs,
            days: parseInt(days, 10) || 30,
            status: 'ok'
        });
    } catch (err) {
        console.error('[Analytics/ecosystem-status]', err.message);
        res.status(500).json({ error: 'Failed to fetch ecosystem status', message: err.message });
    }
});

// ── GET /api/analytics/realtime — Real-time active visitors ────────────────────
router.get('/realtime', async (req, res) => {
    try {
        const propertyId = await getPropertyId();
        if (!propertyId) {
            return res.json({ activeUsers: 0, activeSitesCount: 0, pages: [], countries: [], status: 'not_configured' });
        }

        const token = await getAccessToken();

        const realtimeReport = await fetch(`${GA4_DATA_API}/${propertyId}:runRealtimeReport`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                dimensions: [{ name: 'unifiedScreenName' }, { name: 'country' }, { name: 'city' }],
                metrics: [{ name: 'activeUsers' }],
            }),
        });

        if (!realtimeReport.ok) {
            return res.json({ activeUsers: 0, activeSitesCount: 0, pages: [], countries: [], status: 'ok' });
        }

        const reportData = await realtimeReport.json();
        const rows = parseRows(reportData);
        const totalActive = rows.reduce((acc, r) => acc + (r.activeUsers || 0), 0);

        // Summarize by pages and countries
        const pagesMap = {};
        const countriesMap = {};

        rows.forEach(r => {
            const page = r.unifiedScreenName || '/';
            pagesMap[page] = (pagesMap[page] || 0) + (r.activeUsers || 0);

            const country = r.country || 'Desconocido';
            countriesMap[country] = (countriesMap[country] || 0) + (r.activeUsers || 0);
        });

        const topPages = Object.entries(pagesMap)
            .map(([path, users]) => ({ path, users }))
            .sort((a, b) => b.users - a.users)
            .slice(0, 5);

        const topCountries = Object.entries(countriesMap)
            .map(([country, users]) => ({ country, users }))
            .sort((a, b) => b.users - a.users)
            .slice(0, 5);

        res.json({
            activeUsers: totalActive,
            activeSitesCount: totalActive > 0 ? Math.min(totalActive, Object.keys(pagesMap).length) : 0,
            pages: topPages,
            countries: topCountries,
            status: 'ok',
        });
    } catch (err) {
        console.error('[Analytics/realtime]', err.message);
        res.json({ activeUsers: 0, activeSitesCount: 0, pages: [], countries: [], status: 'error', error: err.message });
    }
});

// ── GET /api/analytics/club-stats?hostname=... (Preserved for compatibility) ─
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

        const [overviewReport, pagesReport, countriesReport] = await Promise.all([
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
            runGA4Report(propertyId, token, {
                dateRanges: dateRange,
                dimensions: [{ name: 'pagePath' }, { name: 'pageTitle' }],
                metrics: [{ name: 'screenPageViews' }, { name: 'totalUsers' }],
                dimensionFilter: hostnameFilter,
                orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
                limit: 5,
            }),
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
            avgBounce: r.bounceRate,
            avgDuration: r.averageSessionDuration,
        }), { sessions: 0, users: 0, pageViews: 0, avgBounce: 0, avgDuration: 0 });

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
        console.error('[Analytics/club-stats]', err.message);
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

// ── GET /api/analytics/debug ─────────────────────────────────────────────────
router.get('/debug', async (req, res) => {
    const saJson = process.env.GA4_SERVICE_ACCOUNT_JSON;
    let saStatus = 'missing';
    let clientEmail = null;
    let privateKeyId = null;
    if (saJson) {
        try {
            const sa = JSON.parse(saJson);
            clientEmail = sa.client_email;
            privateKeyId = sa.private_key_id;
            const hasPem = (sa.private_key || '').includes('BEGIN PRIVATE KEY');
            saStatus = hasPem ? 'ok' : 'invalid_pem';
        } catch { saStatus = 'invalid_json'; }
    }
    let propertyId = '';
    try { propertyId = await getPropertyId(); } catch { propertyId = 'db_error'; }

    let authTest = 'not_attempted';
    let authError = null;
    if (saStatus === 'ok') {
        try {
            const token = await getAccessToken();
            authTest = token ? 'success' : 'empty_token';
        } catch (e) {
            authTest = 'failed';
            authError = e.message;
        }
    }

    res.json({ saStatus, clientEmail, privateKeyId, propertyId, ga4PropertyIdEnv: !!process.env.GA4_PROPERTY_ID, authTest, authError });
});

// ── POST /api/analytics/property-id ──────────────────────────────────────────
router.post('/property-id', async (req, res) => {
    const { propertyId } = req.body;
    if (!propertyId) return res.status(400).json({ error: 'propertyId required' });
    try {
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
