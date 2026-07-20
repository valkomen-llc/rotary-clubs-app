/**
 * Hub Social — controller de Insights / Métricas.
 *
 *   GET  /api/social/insights/overview        → resumen ejecutivo agregado
 *   GET  /api/social/insights/accounts/:id     → serie temporal de una cuenta
 *   POST /api/social/insights/refresh          → captura en vivo + snapshot
 *
 * Las métricas en vivo requieren permisos avanzados de Meta (read_insights,
 * instagram_manage_insights) que pueden estar pendientes de App Review. El
 * endpoint refresh es tolerante: guarda lo que pueda y reporta errores por
 * cuenta sin fallar globalmente. El overview lee de los snapshots ya guardados
 * (tabla SocialMetricSnapshot), así el dashboard funciona aunque el refresh
 * todavía no tenga permisos.
 */

import prisma from '../lib/prisma.js';
import { decryptToken } from '../lib/tokenCrypto.js';
import { getAccountInsights } from '../services/insightsService.js';
import { auditSocial } from '../lib/socialAudit.js';

const isAdmin = (req) => req.user.role === 'administrator';

const accountWhereForCaller = (req) => {
    if (isAdmin(req)) return req.query.clubId ? { clubId: req.query.clubId } : {};
    if (!req.user.clubId) return null;
    return { clubId: req.user.clubId };
};

// GET /insights/overview
export const getInsightsOverview = async (req, res) => {
    try {
        const where = accountWhereForCaller(req);
        if (where === null) return res.json({ accounts: [], totals: {} });

        const accounts = await prisma.socialAccount.findMany({
            where,
            select: { id: true, platform: true, accountName: true, avatar: true, clubId: true, status: true }
        });

        // Último snapshot por cuenta.
        const perAccount = [];
        let totalFollowers = 0;
        let totalReach = 0;
        let totalImpressions = 0;
        for (const acc of accounts) {
            const snap = await prisma.socialMetricSnapshot.findFirst({
                where: { accountId: acc.id, scope: 'account' },
                orderBy: { capturedAt: 'desc' }
            });
            const m = snap?.metrics || {};
            const followers = Number(m.followers || 0);
            const reach = Number(m.reach || m.page_impressions_unique || 0);
            const impressions = Number(m.impressions || m.page_impressions || 0);
            totalFollowers += followers;
            totalReach += reach;
            totalImpressions += impressions;
            perAccount.push({
                accountId: acc.id,
                platform: acc.platform,
                accountName: acc.accountName,
                avatar: acc.avatar,
                status: acc.status,
                capturedAt: snap?.capturedAt || null,
                metrics: m
            });
        }

        res.json({
            accounts: perAccount,
            totals: {
                accounts: accounts.length,
                followers: totalFollowers,
                reach: totalReach,
                impressions: totalImpressions
            }
        });
    } catch (e) {
        console.error('[social/insights] overview error:', e);
        res.status(500).json({ error: e.message });
    }
};

// GET /insights/accounts/:id — serie temporal (últimos N snapshots).
export const getAccountInsightsSeries = async (req, res) => {
    try {
        const where = { id: req.params.id };
        if (!isAdmin(req)) {
            if (!req.user.clubId) return res.status(403).json({ error: 'Sin club asociado' });
            where.clubId = req.user.clubId;
        }
        const account = await prisma.socialAccount.findFirst({ where });
        if (!account) return res.status(404).json({ error: 'Cuenta no encontrada' });

        const snapshots = await prisma.socialMetricSnapshot.findMany({
            where: { accountId: account.id, scope: 'account' },
            orderBy: { capturedAt: 'asc' },
            take: 90
        });
        res.json({
            account: { id: account.id, platform: account.platform, accountName: account.accountName },
            series: snapshots.map((s) => ({ capturedAt: s.capturedAt, metrics: s.metrics }))
        });
    } catch (e) {
        console.error('[social/insights] series error:', e);
        res.status(500).json({ error: e.message });
    }
};

// POST /insights/refresh — captura en vivo y guarda snapshots.
export const refreshInsights = async (req, res) => {
    try {
        const where = accountWhereForCaller(req);
        if (where === null) return res.status(403).json({ error: 'Sin club asociado' });
        // Solo cuentas activas y con token cifrado (tokenVersion>0).
        const accounts = await prisma.socialAccount.findMany({
            where: { ...where, status: 'active', tokenVersion: { gt: 0 } }
        });
        if (!accounts.length) return res.json({ refreshed: 0, results: [] });

        const results = [];
        for (const acc of accounts) {
            try {
                const token = decryptToken(acc.accessToken);
                const insights = await getAccountInsights({ account: acc, decryptedToken: token });
                const metrics = {
                    followers: insights.followers ?? null,
                    ...insights.metrics
                };
                await prisma.socialMetricSnapshot.create({
                    data: {
                        clubId: acc.clubId || null,
                        accountId: acc.id,
                        scope: 'account',
                        externalId: acc.platformId,
                        period: 'day',
                        metrics
                    }
                });
                results.push({ accountId: acc.id, ok: true, followers: insights.followers, errors: insights.errors });
            } catch (e) {
                results.push({ accountId: acc.id, ok: false, error: e.message });
            }
        }
        const refreshed = results.filter((r) => r.ok).length;
        await auditSocial({
            action: 'metrics_refresh',
            clubId: isAdmin(req) ? (req.query.clubId || null) : req.user.clubId,
            userId: req.user.id,
            detail: { refreshed, total: accounts.length }
        });
        res.json({ refreshed, results });
    } catch (e) {
        console.error('[social/insights] refresh error:', e);
        res.status(500).json({ error: e.message });
    }
};
