/**
 * Reports Controller — Club Platform Insights (Informes Ejecutivos).
 *
 * Endpoints del Superadmin para generar, guardar, compartir, enviar por correo
 * y programar informes ejecutivos por sitio. Todas las lecturas son
 * agregaciones on-the-fly (reportMetricsService) — no hay operaciones
 * destructivas sobre datos del cliente.
 */

import crypto from 'crypto';
import prisma from '../lib/prisma.js';
import EmailService from '../services/EmailService.js';
import { listSites, buildSiteDataset, PERIOD_PRESETS, MODULE_REGISTRY, MATURITY_LEVELS } from '../services/reportMetricsService.js';
import { generateNarrative } from '../services/reportNarrativeService.js';

console.log('[ClubPlatformInsights] Reports controller cargado — Informes Ejecutivos v4.553.0');

const shareBaseUrl = () => (process.env.PUBLIC_BASE_URL || 'https://app.clubplatform.org').replace(/\/$/, '');
const genToken = () => crypto.randomBytes(16).toString('hex');

// GET /api/reports/meta — presets, módulos, niveles (para poblar la UI)
export const getMeta = async (_req, res) => {
    try {
        res.json({
            periods: PERIOD_PRESETS,
            modules: MODULE_REGISTRY.map((m) => ({ key: m.key, label: m.label, icon: m.icon })),
            levels: MATURITY_LEVELS.map((l) => l.level),
        });
    } catch (err) {
        console.error('[Reports] getMeta:', err);
        res.status(500).json({ error: err.message });
    }
};

// GET /api/reports/sites — lista de sitios disponibles para informe
export const getSites = async (_req, res) => {
    try {
        const sites = await listSites();
        res.json({ sites });
    } catch (err) {
        console.error('[Reports] getSites:', err);
        res.status(500).json({ error: err.message });
    }
};

// Genera el/los dataset(s) + narrativa para uno o varios sitios.
const buildFull = async ({ siteIds, periodKey, custom, withNarrative = true }) => {
    const datasets = [];
    for (const id of siteIds) {
        const ds = await buildSiteDataset(id, { periodKey, custom });
        if (withNarrative) ds.narrative = await generateNarrative(ds);
        datasets.push(ds);
    }
    return datasets;
};

// POST /api/reports/preview — genera sin persistir (vista previa)
export const previewReport = async (req, res) => {
    try {
        const { siteIds, periodKey = 'all', custom = {}, withNarrative = true } = req.body || {};
        if (!Array.isArray(siteIds) || siteIds.length === 0) {
            return res.status(400).json({ error: 'Debe seleccionar al menos un sitio' });
        }
        const datasets = await buildFull({ siteIds: siteIds.slice(0, 12), periodKey, custom, withNarrative });
        res.json({ datasets });
    } catch (err) {
        console.error('[Reports] previewReport:', err);
        res.status(500).json({ error: err.message });
    }
};

// POST /api/reports — genera y GUARDA el informe (historial)
export const createReport = async (req, res) => {
    try {
        const { siteIds, periodKey = 'all', custom = {}, title, config = {}, share = false } = req.body || {};
        if (!Array.isArray(siteIds) || siteIds.length === 0) {
            return res.status(400).json({ error: 'Debe seleccionar al menos un sitio' });
        }
        const ids = siteIds.slice(0, 12);
        const datasets = await buildFull({ siteIds: ids, periodKey, custom });
        const primary = datasets[0];
        const scope = ids.length > 1 ? 'multi' : 'single';
        const autoTitle = title || (scope === 'multi'
            ? `Informe Ejecutivo · ${ids.length} sitios · ${primary.meta.period.label}`
            : `Informe Ejecutivo · ${primary.meta.site.name} · ${primary.meta.period.label}`);

        const report = await prisma.executiveReport.create({
            data: {
                title: autoTitle,
                siteIds: ids,
                primarySiteId: ids[0],
                scope,
                periodKey,
                periodLabel: primary.meta.period.label,
                periodStart: primary.meta.period.start,
                periodEnd: primary.meta.period.end,
                status: 'ready',
                dataset: datasets,
                narrative: datasets.map((d) => d.narrative),
                config,
                maturityScore: primary.maturity.score,
                maturityLevel: primary.maturity.level,
                shared: !!share,
                shareToken: share ? genToken() : null,
                createdBy: req.user?.id || null,
                createdByEmail: req.user?.email || null,
            },
        });
        res.json({ report, shareUrl: report.shareToken ? `${shareBaseUrl()}/informe/${report.shareToken}` : null });
    } catch (err) {
        console.error('[Reports] createReport:', err);
        res.status(500).json({ error: err.message });
    }
};

// GET /api/reports — historial con filtros (search, period, site)
export const listReports = async (req, res) => {
    try {
        const { search, periodKey, siteId, limit = 50 } = req.query;
        const where = {};
        if (periodKey) where.periodKey = periodKey;
        if (siteId) where.siteIds = { has: siteId };
        if (search) where.title = { contains: String(search), mode: 'insensitive' };
        const reports = await prisma.executiveReport.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take: Math.min(Number(limit) || 50, 200),
            select: {
                id: true, title: true, siteIds: true, primarySiteId: true, scope: true,
                periodKey: true, periodLabel: true, status: true, maturityScore: true, maturityLevel: true,
                shared: true, shareToken: true, pdfUrl: true, createdByEmail: true, emailedTo: true,
                lastEmailedAt: true, createdAt: true,
            },
        });
        res.json({ reports });
    } catch (err) {
        console.error('[Reports] listReports:', err);
        res.status(500).json({ error: err.message });
    }
};

// GET /api/reports/:id — informe completo (con dataset)
export const getReport = async (req, res) => {
    try {
        const report = await prisma.executiveReport.findUnique({ where: { id: req.params.id } });
        if (!report) return res.status(404).json({ error: 'Informe no encontrado' });
        res.json({ report });
    } catch (err) {
        console.error('[Reports] getReport:', err);
        res.status(500).json({ error: err.message });
    }
};

// PATCH /api/reports/:id/share — activa/desactiva enlace público
export const toggleShare = async (req, res) => {
    try {
        const { shared } = req.body || {};
        const existing = await prisma.executiveReport.findUnique({ where: { id: req.params.id }, select: { shareToken: true } });
        if (!existing) return res.status(404).json({ error: 'Informe no encontrado' });
        const report = await prisma.executiveReport.update({
            where: { id: req.params.id },
            data: { shared: !!shared, shareToken: shared ? (existing.shareToken || genToken()) : existing.shareToken },
        });
        res.json({ report, shareUrl: report.shareToken ? `${shareBaseUrl()}/informe/${report.shareToken}` : null });
    } catch (err) {
        console.error('[Reports] toggleShare:', err);
        res.status(500).json({ error: err.message });
    }
};

// PATCH /api/reports/:id/pdf — guarda la URL del PDF exportado
export const savePdfUrl = async (req, res) => {
    try {
        const { pdfUrl } = req.body || {};
        const report = await prisma.executiveReport.update({ where: { id: req.params.id }, data: { pdfUrl } });
        res.json({ report });
    } catch (err) {
        console.error('[Reports] savePdfUrl:', err);
        res.status(500).json({ error: err.message });
    }
};

// DELETE /api/reports/:id
export const deleteReport = async (req, res) => {
    try {
        await prisma.executiveReport.delete({ where: { id: req.params.id } });
        res.json({ ok: true });
    } catch (err) {
        console.error('[Reports] deleteReport:', err);
        res.status(500).json({ error: err.message });
    }
};

// POST /api/reports/:id/email — envía el informe por correo (con enlace, y PDF opcional adjunto)
export const emailReport = async (req, res) => {
    try {
        const { recipients, message, pdfBase64, pdfFilename } = req.body || {};
        const list = (Array.isArray(recipients) ? recipients : String(recipients || '').split(','))
            .map((s) => String(s).trim()).filter(Boolean);
        if (list.length === 0) return res.status(400).json({ error: 'Indique al menos un destinatario' });

        const report = await prisma.executiveReport.findUnique({ where: { id: req.params.id } });
        if (!report) return res.status(404).json({ error: 'Informe no encontrado' });

        // Asegura enlace compartible
        let shareToken = report.shareToken;
        if (!shareToken) {
            shareToken = genToken();
            await prisma.executiveReport.update({ where: { id: report.id }, data: { shareToken, shared: true } });
        }
        const shareUrl = `${shareBaseUrl()}/informe/${shareToken}`;
        const ds = Array.isArray(report.dataset) ? report.dataset[0] : report.dataset;
        const siteName = ds?.meta?.site?.name || 'su sitio';
        const html = buildEmailHtml({ siteName, title: report.title, periodLabel: report.periodLabel, score: report.maturityScore, level: report.maturityLevel, shareUrl, message });

        const attachments = pdfBase64 ? [{ filename: pdfFilename || 'informe-ejecutivo.pdf', content: pdfBase64 }] : undefined;
        const result = await EmailService.sendPlatformEmail({ to: list, subject: `📊 ${report.title}`, html, attachments });
        if (!result?.success) return res.status(502).json({ error: result?.error || 'No se pudo enviar el correo' });

        await prisma.executiveReport.update({
            where: { id: report.id },
            data: { emailedTo: Array.from(new Set([...(report.emailedTo || []), ...list])), lastEmailedAt: new Date() },
        });
        res.json({ ok: true, messageId: result.messageId, shareUrl });
    } catch (err) {
        console.error('[Reports] emailReport:', err);
        res.status(500).json({ error: err.message });
    }
};

// GET /api/reports/shared/:token — PÚBLICO (sin auth)
export const getSharedReport = async (req, res) => {
    try {
        const report = await prisma.executiveReport.findUnique({
            where: { shareToken: req.params.token },
            select: { id: true, title: true, dataset: true, narrative: true, periodLabel: true, maturityScore: true, maturityLevel: true, shared: true, createdAt: true },
        });
        if (!report || !report.shared) return res.status(404).json({ error: 'Informe no disponible' });
        res.json({ report });
    } catch (err) {
        console.error('[Reports] getSharedReport:', err);
        res.status(500).json({ error: err.message });
    }
};

// ─── Programación (schedules) ───────────────────────────────────────────────

export const listSchedules = async (_req, res) => {
    try {
        const schedules = await prisma.executiveReportSchedule.findMany({ orderBy: { createdAt: 'desc' } });
        res.json({ schedules });
    } catch (err) {
        console.error('[Reports] listSchedules:', err);
        res.status(500).json({ error: err.message });
    }
};

const nextRunFor = (frequency) => {
    const d = new Date();
    const add = { monthly: 1, quarterly: 3, semiannual: 6, annual: 12 }[frequency] || 1;
    d.setMonth(d.getMonth() + add);
    return d;
};

export const createSchedule = async (req, res) => {
    try {
        const { name, siteIds, periodKey = 'month', frequency = 'monthly', recipients = [], config = {} } = req.body || {};
        if (!name || !Array.isArray(siteIds) || siteIds.length === 0) {
            return res.status(400).json({ error: 'Nombre y al menos un sitio son obligatorios' });
        }
        const schedule = await prisma.executiveReportSchedule.create({
            data: {
                name, siteIds, periodKey, frequency,
                recipients: Array.isArray(recipients) ? recipients : String(recipients).split(',').map((s) => s.trim()).filter(Boolean),
                config, active: true, nextRunAt: nextRunFor(frequency), createdBy: req.user?.id || null,
            },
        });
        res.json({ schedule });
    } catch (err) {
        console.error('[Reports] createSchedule:', err);
        res.status(500).json({ error: err.message });
    }
};

export const updateSchedule = async (req, res) => {
    try {
        const { name, siteIds, periodKey, frequency, recipients, active, config } = req.body || {};
        const data = {};
        if (name !== undefined) data.name = name;
        if (siteIds !== undefined) data.siteIds = siteIds;
        if (periodKey !== undefined) data.periodKey = periodKey;
        if (frequency !== undefined) { data.frequency = frequency; data.nextRunAt = nextRunFor(frequency); }
        if (recipients !== undefined) data.recipients = Array.isArray(recipients) ? recipients : String(recipients).split(',').map((s) => s.trim()).filter(Boolean);
        if (active !== undefined) data.active = !!active;
        if (config !== undefined) data.config = config;
        const schedule = await prisma.executiveReportSchedule.update({ where: { id: req.params.id }, data });
        res.json({ schedule });
    } catch (err) {
        console.error('[Reports] updateSchedule:', err);
        res.status(500).json({ error: err.message });
    }
};

export const deleteSchedule = async (req, res) => {
    try {
        await prisma.executiveReportSchedule.delete({ where: { id: req.params.id } });
        res.json({ ok: true });
    } catch (err) {
        console.error('[Reports] deleteSchedule:', err);
        res.status(500).json({ error: err.message });
    }
};

// POST /api/reports/schedules/run-due — ejecuta programaciones vencidas (para cron)
export const runDueSchedules = async (_req, res) => {
    try {
        const now = new Date();
        const due = await prisma.executiveReportSchedule.findMany({ where: { active: true, nextRunAt: { lte: now } } });
        const results = [];
        for (const sch of due) {
            try {
                const datasets = await buildFull({ siteIds: sch.siteIds.slice(0, 12), periodKey: sch.periodKey });
                const primary = datasets[0];
                const report = await prisma.executiveReport.create({
                    data: {
                        title: `Informe programado · ${sch.name} · ${primary.meta.period.label}`,
                        siteIds: sch.siteIds, primarySiteId: sch.siteIds[0], scope: sch.siteIds.length > 1 ? 'multi' : 'single',
                        periodKey: sch.periodKey, periodLabel: primary.meta.period.label,
                        periodStart: primary.meta.period.start, periodEnd: primary.meta.period.end,
                        status: 'ready', dataset: datasets, narrative: datasets.map((d) => d.narrative),
                        maturityScore: primary.maturity.score, maturityLevel: primary.maturity.level,
                        shared: true, shareToken: genToken(),
                    },
                });
                if (sch.recipients?.length) {
                    const shareUrl = `${shareBaseUrl()}/informe/${report.shareToken}`;
                    await EmailService.sendPlatformEmail({
                        to: sch.recipients, subject: `📊 ${report.title}`,
                        html: buildEmailHtml({ siteName: primary.meta.site.name, title: report.title, periodLabel: report.periodLabel, score: report.maturityScore, level: report.maturityLevel, shareUrl }),
                    });
                }
                await prisma.executiveReportSchedule.update({ where: { id: sch.id }, data: { lastRunAt: now, nextRunAt: nextRunFor(sch.frequency) } });
                results.push({ id: sch.id, ok: true, reportId: report.id });
            } catch (e) {
                results.push({ id: sch.id, ok: false, error: e.message });
            }
        }
        res.json({ ran: results.length, results });
    } catch (err) {
        console.error('[Reports] runDueSchedules:', err);
        res.status(500).json({ error: err.message });
    }
};

// ─── Email HTML ─────────────────────────────────────────────────────────────

const buildEmailHtml = ({ siteName, title, periodLabel, score, level, shareUrl, message }) => `
<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;background:#f8fafc;padding:0;">
  <div style="background:linear-gradient(135deg,#0c3c7c,#013388);padding:32px 28px;border-radius:16px 16px 0 0;">
    <p style="color:#F7A81B;font-size:12px;font-weight:800;letter-spacing:2px;margin:0 0 6px;text-transform:uppercase;">Club Platform · Informe Ejecutivo</p>
    <h1 style="color:#fff;font-size:22px;margin:0;line-height:1.3;">${title}</h1>
  </div>
  <div style="background:#fff;padding:28px;border-radius:0 0 16px 16px;border:1px solid #e2e8f0;border-top:none;">
    ${message ? `<p style="color:#334155;font-size:15px;line-height:1.6;margin:0 0 20px;">${String(message).replace(/</g, '&lt;')}</p>` : ''}
    <p style="color:#334155;font-size:15px;line-height:1.6;margin:0 0 20px;">Se ha generado el informe ejecutivo de <strong>${siteName}</strong> para el período <strong>${periodLabel || 'Hasta la fecha'}</strong>.</p>
    <div style="display:flex;gap:12px;margin:0 0 24px;">
      <div style="flex:1;background:#f1f5f9;border-radius:12px;padding:16px;text-align:center;">
        <div style="font-size:28px;font-weight:800;color:#0c3c7c;">${score ?? '—'}<span style="font-size:14px;color:#94a3b8;">/100</span></div>
        <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:1px;font-weight:700;">Madurez Digital</div>
      </div>
      <div style="flex:1;background:#fff7ed;border-radius:12px;padding:16px;text-align:center;">
        <div style="font-size:16px;font-weight:800;color:#E29C00;padding-top:6px;">${level || '—'}</div>
        <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:1px;font-weight:700;margin-top:6px;">Nivel del Ecosistema</div>
      </div>
    </div>
    <a href="${shareUrl}" style="display:block;background:#0c3c7c;color:#fff;text-decoration:none;text-align:center;padding:14px;border-radius:12px;font-weight:700;font-size:15px;">Ver informe completo →</a>
    <p style="color:#94a3b8;font-size:12px;text-align:center;margin:20px 0 0;">Enlace seguro generado por Club Platform Insights</p>
  </div>
</div>`;

export default {
    getMeta, getSites, previewReport, createReport, listReports, getReport,
    toggleShare, savePdfUrl, deleteReport, emailReport, getSharedReport,
    listSchedules, createSchedule, updateSchedule, deleteSchedule, runDueSchedules,
};
