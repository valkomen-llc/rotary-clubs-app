/**
 * Report Metrics Service — Club Platform Insights (Informes Ejecutivos).
 *
 * Motor de agregación que construye el "dataset" ejecutivo de un sitio (Club)
 * para un período. Todo es SOLO-LECTURA (count / aggregate / findMany con
 * select mínimo). No ejecuta ninguna operación destructiva ni escribe en
 * tablas del cliente.
 *
 * Diseño extensible:
 *   - MODULE_REGISTRY: describe cada módulo del "Ecosistema Digital". Añadir un
 *     módulo nuevo = añadir una entrada (label, icon, detect()). No requiere
 *     rediseño del render ni del motor.
 *   - El dataset se emite como bloques genéricos (headlineKpis, sections[],
 *     charts, timeline, achievements). El frontend renderiza `sections` de
 *     forma genérica, así que nuevas secciones aparecen sin tocar la UI.
 *
 * Cada grupo de métricas está envuelto en safe() → si una tabla/campo no
 * existe o falla, devuelve el default y el informe continúa.
 */

import prisma from '../lib/prisma.js';
import { collectAgentTeam } from './reportAgentTeamService.js';

// ─── Utilidades ─────────────────────────────────────────────────────────────

const safe = async (fn, fallback) => {
    try {
        const v = await fn();
        return v ?? fallback;
    } catch (e) {
        console.warn('[reportMetrics] métrica omitida:', e?.message);
        return fallback;
    }
};

const num = (v) => (typeof v === 'number' && isFinite(v) ? v : 0);
const pct = (part, total) => (total > 0 ? Math.round((part / total) * 1000) / 10 : 0);
const growthPct = (curr, prev) => {
    if (!prev) return curr > 0 ? 100 : 0;
    return Math.round(((curr - prev) / prev) * 1000) / 10;
};
const MONTHS_ES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

// ─── Períodos ───────────────────────────────────────────────────────────────

export const PERIOD_PRESETS = [
    { key: 'all', label: 'Hasta la fecha' },
    { key: 'month', label: 'Último mes' },
    { key: 'quarter', label: 'Último trimestre' },
    { key: 'semester', label: 'Último semestre' },
    { key: 'year', label: 'Último año' },
    { key: 'custom', label: 'Rango personalizado' },
];

const monthsBack = (key) => ({ month: 1, quarter: 3, semester: 6, year: 12 }[key] || 0);

/**
 * Resuelve un período a { start, end, label } + ventana de comparación previa
 * de igual longitud.
 */
export const resolvePeriod = (periodKey = 'all', custom = {}, now = new Date()) => {
    const end = custom.end ? new Date(custom.end) : new Date(now);
    let start;
    let label;
    let compare = null;

    if (periodKey === 'custom' && custom.start) {
        start = new Date(custom.start);
        const fmt = (d) => d.toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' });
        label = `${fmt(start)} — ${fmt(end)}`;
    } else if (periodKey && periodKey !== 'all') {
        const m = monthsBack(periodKey);
        start = new Date(end);
        start.setMonth(start.getMonth() - m);
        label = PERIOD_PRESETS.find((p) => p.key === periodKey)?.label || 'Período';
    } else {
        start = new Date('2000-01-01T00:00:00Z');
        label = 'Hasta la fecha';
    }

    // Ventana de comparación: mismo largo, inmediatamente anterior.
    if (periodKey !== 'all') {
        const lenMs = end.getTime() - start.getTime();
        const cEnd = new Date(start.getTime() - 1);
        const cStart = new Date(cEnd.getTime() - lenMs);
        compare = { start: cStart, end: cEnd, label: 'Período anterior' };
    }

    return { key: periodKey || 'all', label, start, end, compare };
};

const inRange = (start, end) => ({ gte: start, lte: end });

// ─── Listado de sitios ──────────────────────────────────────────────────────

const CATEGORY_LABELS = {
    club: 'Club',
    association: 'Asociación',
    exchange_program: 'Programa de Intercambio',
    event: 'Evento',
    conference: 'Convención',
    project_fair: 'Feria de Proyectos',
    foundation: 'Fundación',
    district: 'Distrito',
};

export const categoryLabel = (c) => CATEGORY_LABELS[c] || 'Sitio';

const DEFAULT_COLORS = { primary: '#013388', secondary: '#E29C00' };

const asColorObj = (raw) => {
    if (!raw) return null;
    let v = raw;
    if (typeof v === 'string') { try { v = JSON.parse(v); } catch { return null; } }
    if (v && (v.primary || v.secondary)) return { primary: v.primary || DEFAULT_COLORS.primary, secondary: v.secondary || DEFAULT_COLORS.secondary };
    return null;
};

// El modelo Club no tiene columna `colors`. La marca del sitio vive en la tabla
// Setting como filas `color_primary` / `color_secondary` por clubId (así lo
// arma el endpoint público /clubs/by-domain). Fallback: colores del distrito y
// por último los institucionales por defecto.
const resolveBrandColors = async (clubId, district) => {
    const fromSetting = await safe(async () => {
        const rows = await prisma.setting.findMany({
            where: { clubId, key: { in: ['color_primary', 'color_secondary'] } },
            select: { key: true, value: true },
        });
        const s = Object.fromEntries(rows.map((r) => [r.key, r.value]));
        if (s.color_primary || s.color_secondary) {
            return { primary: s.color_primary || DEFAULT_COLORS.primary, secondary: s.color_secondary || DEFAULT_COLORS.secondary };
        }
        return null;
    }, null);
    if (fromSetting) return fromSetting;
    const fromDistrict = asColorObj(district?.colors);
    if (fromDistrict) return fromDistrict;
    return DEFAULT_COLORS;
};

export const listSites = async () => {
    const clubs = await prisma.club.findMany({
        select: {
            id: true, name: true, category: true, type: true, city: true, country: true,
            domain: true, subdomain: true, logo: true, avatarUrl: true, status: true,
            subscriptionStatus: true, districtId: true, createdAt: true,
        },
        orderBy: { name: 'asc' },
    });
    return clubs.map((c) => ({
        ...c,
        categoryLabel: categoryLabel(c.category),
    }));
};

// ─── Registry de módulos del Ecosistema Digital ─────────────────────────────
// Cada módulo mapea un conjunto de contadores (bundle) a un estado.
// status: active | configured | pending | disabled

const STATUS_LABELS = {
    active: 'Activo',
    configured: 'Configurado',
    pending: 'Pendiente',
    disabled: 'No implementado',
};

export const MODULE_REGISTRY = [
    { key: 'website', label: 'Sitio Web', icon: 'Globe',
      detect: (b, site) => (site.domain || site.subdomain) ? 'active' : 'pending',
      metric: (b, site) => site.domain || site.subdomain || '—' },
    { key: 'news', label: 'Noticias / Blog', icon: 'Newspaper',
      detect: (b) => b.posts > 0 ? 'active' : 'pending', metric: (b) => `${b.posts} publicaciones` },
    { key: 'events', label: 'Eventos', icon: 'Calendar',
      detect: (b) => b.events > 0 ? 'active' : 'pending', metric: (b) => `${b.events} eventos` },
    { key: 'chatbot', label: 'Chatbot / Agentes IA', icon: 'Bot',
      detect: (b) => b.agents > 0 ? 'active' : 'pending', metric: (b) => `${b.agents} agentes` },
    { key: 'brain', label: 'Centro de Inteligencia', icon: 'Brain',
      detect: (b) => b.brainMemories > 0 ? 'active' : b.hasBrain ? 'configured' : 'pending',
      metric: (b) => `${b.brainMemories} memorias` },
    { key: 'email', label: 'Correo Electrónico', icon: 'Mail',
      detect: (b) => b.emailAccounts > 0 ? 'active' : b.emailCampaigns > 0 ? 'configured' : 'pending',
      metric: (b) => `${b.emailCampaigns} campañas` },
    { key: 'forms', label: 'Formularios / Leads', icon: 'ClipboardList',
      detect: (b) => b.leads > 0 ? 'active' : 'pending', metric: (b) => `${b.leads} leads` },
    { key: 'ecommerce', label: 'E-commerce', icon: 'ShoppingBag',
      detect: (b) => b.products > 0 ? 'active' : 'pending', metric: (b) => `${b.products} productos` },
    { key: 'payments', label: 'Pagos', icon: 'CreditCard',
      detect: (b) => b.paymentsCount > 0 ? 'active' : b.paymentConfigs > 0 ? 'configured' : 'pending',
      metric: (b) => `${b.paymentsCount} transacciones` },
    { key: 'memberships', label: 'Membresías / Socios', icon: 'Users',
      detect: (b) => b.members > 0 ? 'active' : 'pending', metric: (b) => `${b.members} socios` },
    { key: 'donations', label: 'Donaciones', icon: 'HeartHandshake',
      detect: (b) => b.donationsCount > 0 ? 'active' : 'pending', metric: (b) => `${b.donationsCount} aportes` },
    { key: 'library', label: 'Biblioteca Documental', icon: 'FolderOpen',
      detect: (b) => b.documents > 0 ? 'active' : 'pending', metric: (b) => `${b.documents} documentos` },
    { key: 'gallery', label: 'Galerías / Multimedia', icon: 'Images',
      detect: (b) => b.media > 0 ? 'active' : 'pending', metric: (b) => `${b.media} archivos` },
    { key: 'video', label: 'Videos', icon: 'Video',
      detect: (b) => b.videos > 0 ? 'active' : 'pending', metric: (b) => `${b.videos} proyectos` },
    { key: 'projects', label: 'Proyectos', icon: 'FolderKanban',
      detect: (b) => b.projects > 0 ? 'active' : 'pending', metric: (b) => `${b.projects} proyectos` },
    { key: 'whatsapp', label: 'WhatsApp CRM', icon: 'MessageSquare',
      detect: (b) => b.hasWhatsApp ? 'active' : b.crmContacts > 0 ? 'configured' : 'pending',
      metric: (b) => `${b.crmContacts} contactos` },
    { key: 'automations', label: 'Automatizaciones', icon: 'Workflow',
      detect: (b) => (b.emailAutomations + b.autoReplyRules) > 0 ? 'active' : 'pending',
      metric: (b) => `${b.emailAutomations + b.autoReplyRules} flujos` },
    { key: 'social', label: 'Redes Sociales', icon: 'Share2',
      detect: (b) => b.socialAccounts > 0 ? 'active' : 'pending', metric: (b) => `${b.socialAccounts} cuentas` },
    { key: 'analytics', label: 'Estadísticas / Analítica', icon: 'BarChart3',
      detect: (b, site) => (site.domain || site.subdomain) ? 'configured' : 'pending', metric: () => 'GA4' },
    { key: 'seo', label: 'SEO', icon: 'Search',
      detect: (b) => b.seoFilled > 0 ? 'configured' : 'pending', metric: (b) => `${b.seoFilled} con SEO` },
    { key: 'grants', label: 'Subvenciones', icon: 'Landmark',
      detect: (b) => b.grants > 0 ? 'active' : 'pending', metric: (b) => `${b.grants} oportunidades` },
    { key: 'forum', label: 'Foros', icon: 'MessagesSquare',
      detect: () => 'disabled', metric: () => 'No disponible' },
];

// ─── Recolección de contadores (bundle) por sitio ───────────────────────────

const collectBundle = async (clubId, site, period) => {
    const P = period;
    const CP = period.compare;
    const where = { clubId };
    const wr = (field) => ({ ...where, [field]: inRange(P.start, P.end) });
    const cwr = (field) => ({ ...where, [field]: inRange(CP.start, CP.end) });

    const [
        members, membersActive, membersBoard, membersNew, membersPrev,
        leads, leadsNew, posts, postsNew, comments, commentsAgg,
        events, eventsNew, eventsPrev,
        projectsList, orders, ordersPrev, ordersAgg, payAgg,
        donationsCount, donationsAgg, donationsPrev,
        products, agents, convs, convAgg, agentActs,
        brain, brainDocs, media, mediaAgg,
        emailCampaigns, emailAgg, waCampaigns, waAgg, crmContacts,
        socialAccounts, socialPubs, emailAutomations, autoReplyRules, emailAccounts,
        documents, videos, paymentsCount, paymentConfigs, hasWhatsApp,
        grants, phasesTotal, phasesDone, seoPosts,
    ] = await Promise.all([
        safe(() => prisma.clubMember.count({ where }), 0),
        safe(() => prisma.clubMember.count({ where: { ...where, isActive: true } }), 0),
        safe(() => prisma.clubMember.count({ where: { ...where, isBoard: true } }), 0),
        safe(() => prisma.clubMember.count({ where: wr('createdAt') }), 0),
        safe(() => (CP ? prisma.clubMember.count({ where: cwr('createdAt') }) : 0), 0),
        safe(() => prisma.lead.count({ where }), 0),
        safe(() => prisma.lead.count({ where: wr('createdAt') }), 0),
        safe(() => prisma.post.count({ where: { ...where, published: true } }), 0),
        safe(() => prisma.post.count({ where: wr('createdAt') }), 0),
        safe(() => prisma.comment.count({ where: { post: { clubId } } }), 0),
        safe(() => prisma.comment.aggregate({ where: { post: { clubId }, rating: { gt: 0 } }, _avg: { rating: true } }), { _avg: { rating: null } }),
        safe(() => prisma.calendarEvent.count({ where }), 0),
        safe(() => prisma.calendarEvent.count({ where: wr('startDate') }), 0),
        safe(() => (CP ? prisma.calendarEvent.count({ where: cwr('startDate') }) : 0), 0),
        safe(() => prisma.project.findMany({ where: { ...where, deletedAt: null }, select: { recaudado: true, meta: true, beneficiarios: true, donantes: true, status: true } }), []),
        safe(() => prisma.order.findMany({ where: wr('createdAt'), select: { total: true, currency: true, status: true, createdAt: true } }), []),
        safe(() => (CP ? prisma.order.findMany({ where: cwr('createdAt'), select: { total: true } }) : []), []),
        safe(() => prisma.order.aggregate({ where, _count: true }), { _count: 0 }),
        safe(() => prisma.payment.aggregate({ where: { ...where, status: 'succeeded' }, _sum: { amount: true, netAmount: true }, _count: true }), { _sum: {}, _count: 0 }),
        safe(() => prisma.donation.count({ where }), 0),
        safe(() => prisma.donation.findMany({ where: { ...where, date: inRange(P.start, P.end) }, select: { amount: true, currency: true, donorEmail: true, date: true } }), []),
        safe(() => (CP ? prisma.donation.aggregate({ where: { ...where, date: inRange(CP.start, CP.end) }, _sum: { amount: true } }) : { _sum: {} }), { _sum: {} }),
        safe(() => prisma.product.count({ where: { ...where, status: 'active' } }), 0),
        safe(() => prisma.agent.count({ where: { ...where, active: true } }), 0),
        safe(() => prisma.agentConversation.count({ where }), 0),
        safe(() => prisma.agentConversation.aggregate({ where, _sum: { messageCount: true } }), { _sum: {} }),
        safe(() => prisma.agentActivity.count({ where: wr('createdAt') }), 0),
        safe(() => prisma.brain.findFirst({ where: { clubId }, select: { memoryCount: true } }), null),
        safe(() => prisma.brainDocument.aggregate({ where: { brain: { clubId } }, _count: true, _sum: { charCount: true } }), { _count: 0, _sum: {} }),
        safe(() => prisma.media.count({ where: { OR: [{ clubId }, { sourceType: 'club', sourceId: clubId }] } }), 0),
        safe(() => prisma.media.aggregate({ where: { OR: [{ clubId }, { sourceType: 'club', sourceId: clubId }] }, _sum: { size: true } }), { _sum: {} }),
        safe(() => prisma.emailCampaign.count({ where }), 0),
        safe(() => prisma.emailCampaign.aggregate({ where, _sum: { sentCount: true, openCount: true, clickCount: true, totalRecipients: true } }), { _sum: {} }),
        safe(() => prisma.whatsAppCampaign.count({ where }), 0),
        safe(() => prisma.whatsAppCampaign.aggregate({ where, _sum: { sent: true, delivered: true, read: true } }), { _sum: {} }),
        safe(() => prisma.crmContact.count({ where }), 0),
        safe(() => prisma.socialAccount.count({ where: { ...where, status: 'active' } }), 0),
        safe(() => prisma.socialPublication.count({ where: wr('createdAt') }), 0),
        safe(() => prisma.emailAutomation.count({ where }), 0),
        safe(() => prisma.whatsAppAutoReplyRule.count({ where }), 0),
        safe(() => prisma.emailAccount.count({ where }), 0),
        safe(() => prisma.clubDocument.count({ where }), 0),
        safe(() => prisma.videoProject.count({ where }), 0),
        safe(() => prisma.payment.count({ where }), 0),
        safe(() => prisma.paymentProviderConfig.count({ where }), 0),
        safe(() => prisma.whatsAppConfig.findFirst({ where: { clubId }, select: { id: true } }).then((r) => !!r), false),
        safe(() => prisma.fundingOpportunity.count({ where }), 0),
        safe(() => prisma.siteActivationPhase.count({ where }), 0),
        safe(() => prisma.siteActivationPhase.count({ where: { ...where, status: 'completed' } }), 0),
        safe(() => prisma.post.count({ where: { ...where, seoTitle: { not: null } } }), 0),
    ]);

    // Derivados de proyectos/órdenes/donaciones
    const raised = projectsList.reduce((s, p) => s + num(p.recaudado), 0);
    const goal = projectsList.reduce((s, p) => s + num(p.meta), 0);
    const beneficiaries = projectsList.reduce((s, p) => s + num(p.beneficiarios), 0);
    const revenue = orders.reduce((s, o) => s + num(o.total), 0);
    const revenuePrev = ordersPrev.reduce((s, o) => s + num(o.total), 0);
    const donationsSum = donationsAgg.reduce((s, d) => s + num(d.amount), 0);
    const donationsPrevSum = num(donationsPrev?._sum?.amount);
    const donors = new Set(donationsAgg.map((d) => d.donorEmail).filter(Boolean)).size;
    const currency = orders[0]?.currency || donationsAgg[0]?.currency || 'USD';

    return {
        members, membersActive, membersBoard, membersNew, membersPrev,
        leads, leadsNew,
        posts, postsNew, comments, commentsAvg: num(commentsAgg?._avg?.rating),
        events, eventsNew, eventsPrev,
        projects: projectsList.length, raised, goal, beneficiaries,
        ordersCount: num(ordersAgg?._count), ordersPeriod: orders.length, revenue, revenuePrev, orders,
        paymentsSum: num(payAgg?._sum?.amount), paymentsNet: num(payAgg?._sum?.netAmount), paymentsCount,
        donationsCount, donationsSum, donationsPrevSum, donors, donations: donationsAgg,
        products, agents, convs, convMessages: num(convAgg?._sum?.messageCount), agentActs,
        hasBrain: !!brain, brainMemories: num(brain?.memoryCount),
        brainDocs: num(brainDocs?._count), brainChars: num(brainDocs?._sum?.charCount),
        media, mediaBytes: num(mediaAgg?._sum?.size),
        emailCampaigns, emailSent: num(emailAgg?._sum?.sentCount), emailOpens: num(emailAgg?._sum?.openCount),
        emailClicks: num(emailAgg?._sum?.clickCount), emailRecipients: num(emailAgg?._sum?.totalRecipients),
        waCampaigns, waSent: num(waAgg?._sum?.sent), waDelivered: num(waAgg?._sum?.delivered), waRead: num(waAgg?._sum?.read),
        crmContacts, socialAccounts, socialPubs,
        emailAutomations, autoReplyRules, emailAccounts, documents, videos, paymentConfigs, hasWhatsApp,
        grants, phasesTotal, phasesDone, seoFilled: seoPosts,
        currency,
    };
};

// ─── Series temporales (últimos 6 meses) ────────────────────────────────────

const monthBuckets = (end, count = 6) => {
    const buckets = [];
    const d = new Date(end.getFullYear(), end.getMonth(), 1);
    for (let i = count - 1; i >= 0; i--) {
        const bd = new Date(d.getFullYear(), d.getMonth() - i, 1);
        buckets.push({ key: `${bd.getFullYear()}-${bd.getMonth()}`, label: MONTHS_ES[bd.getMonth()], year: bd.getFullYear(), month: bd.getMonth(), value: 0 });
    }
    return buckets;
};

const bucketize = (records, dateField, valueFn, end) => {
    const buckets = monthBuckets(end);
    const map = new Map(buckets.map((b) => [b.key, b]));
    for (const r of records) {
        const dt = r[dateField];
        if (!dt) continue;
        const d = new Date(dt);
        const k = `${d.getFullYear()}-${d.getMonth()}`;
        const b = map.get(k);
        if (b) b.value += valueFn(r);
    }
    return buckets.map((b) => ({ name: b.label, value: Math.round(b.value * 100) / 100 }));
};

const collectSeries = async (clubId, period) => {
    const end = period.end;
    const windowStart = new Date(end.getFullYear(), end.getMonth() - 5, 1);
    const [orders, members, posts, donations] = await Promise.all([
        safe(() => prisma.order.findMany({ where: { clubId, createdAt: inRange(windowStart, end) }, select: { total: true, createdAt: true } }), []),
        safe(() => prisma.clubMember.findMany({ where: { clubId, createdAt: inRange(windowStart, end) }, select: { createdAt: true } }), []),
        safe(() => prisma.post.findMany({ where: { clubId, createdAt: inRange(windowStart, end) }, select: { createdAt: true } }), []),
        safe(() => prisma.donation.findMany({ where: { clubId, date: inRange(windowStart, end) }, select: { amount: true, date: true } }), []),
    ]);
    return {
        revenue: bucketize(orders, 'createdAt', (o) => num(o.total), end),
        members: bucketize(members, 'createdAt', () => 1, end),
        content: bucketize(posts, 'createdAt', () => 1, end),
        donations: bucketize(donations, 'date', (d) => num(d.amount), end),
    };
};

// ─── Índice de Madurez Digital ──────────────────────────────────────────────

export const MATURITY_LEVELS = [
    { max: 25, level: 'Emergente', index: 0 },
    { max: 45, level: 'En Crecimiento', index: 1 },
    { max: 65, level: 'Consolidado', index: 2 },
    { max: 82, level: 'Avanzado', index: 3 },
    { max: 101, level: 'Transformación Digital', index: 4 },
];

const levelFor = (score) => MATURITY_LEVELS.find((l) => score < l.max) || MATURITY_LEVELS[MATURITY_LEVELS.length - 1];

const clamp = (v) => Math.max(0, Math.min(100, Math.round(v)));

const computeMaturity = (b, modules) => {
    const activeMods = modules.filter((m) => m.status === 'active').length;
    const configMods = modules.filter((m) => m.status === 'configured').length;
    const totalMods = modules.filter((m) => m.status !== 'disabled').length || 1;

    const implementation = clamp(((activeMods + configMods * 0.5) / totalMods) * 100);
    const activity = clamp(Math.min(100, (b.postsNew * 6 + b.eventsNew * 8 + b.socialPubs * 4 + b.emailCampaigns * 6)));
    const communications = clamp(Math.min(100, b.emailSent > 0 ? (pct(b.emailOpens, b.emailSent) * 2 + b.emailCampaigns * 5) : b.crmContacts > 0 ? 40 : 10));
    const community = clamp(Math.min(100, b.members * 2 + b.membersNew * 5 + (b.leads > 0 ? 15 : 0)));
    const commerce = clamp(Math.min(100, (b.revenue > 0 ? 45 : 0) + (b.donationsSum > 0 ? 30 : 0) + (b.products > 0 ? 25 : 0)));
    const intelligence = clamp(Math.min(100, (b.agents > 0 ? 30 : 0) + Math.min(40, b.brainMemories / 5) + Math.min(30, b.convs * 3)));
    const analytics = clamp(Math.min(100, (b.seoFilled > 0 ? 40 : 0) + (b.socialAccounts > 0 ? 30 : 0) + 20));
    const security = clamp((b.phasesTotal > 0 ? pct(b.phasesDone, b.phasesTotal) : 60));

    const dims = [
        { key: 'implementation', label: 'Implementación', score: implementation, weight: 0.22 },
        { key: 'activity', label: 'Actividad', score: activity, weight: 0.14 },
        { key: 'communications', label: 'Comunicaciones', score: communications, weight: 0.13 },
        { key: 'community', label: 'Comunidad', score: community, weight: 0.13 },
        { key: 'commerce', label: 'Comercio y Finanzas', score: commerce, weight: 0.12 },
        { key: 'intelligence', label: 'Inteligencia Artificial', score: intelligence, weight: 0.12 },
        { key: 'analytics', label: 'Analítica y SEO', score: analytics, weight: 0.08 },
        { key: 'security', label: 'Seguridad y Setup', score: security, weight: 0.06 },
    ];
    const score = clamp(dims.reduce((s, d) => s + d.score * d.weight, 0));
    const lvl = levelFor(score);
    return { score, level: lvl.level, levelIndex: lvl.index, dimensions: dims };
};

// ─── Ensamblado del dataset por sitio ───────────────────────────────────────

const fmtBytes = (bytes) => {
    if (!bytes) return '0 MB';
    const mb = bytes / (1024 * 1024);
    if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
    return `${mb.toFixed(1)} MB`;
};

export const buildSiteDataset = async (clubId, options = {}) => {
    const site = await prisma.club.findUnique({
        where: { id: clubId },
        select: {
            id: true, name: true, category: true, type: true, organizationType: true,
            city: true, country: true, domain: true, subdomain: true, logo: true, avatarUrl: true,
            status: true, subscriptionStatus: true, districtId: true, createdAt: true,
        },
    });
    if (!site) throw new Error('Sitio no encontrado');

    const period = resolvePeriod(options.periodKey || 'all', options.custom || {}, options.now || new Date());
    const b = await collectBundle(clubId, site, period);
    const series = await collectSeries(clubId, period);
    const agentTeam = await collectAgentTeam(clubId);

    let district = null;
    if (site.districtId) {
        district = await safe(() => prisma.district.findUnique({ where: { id: site.districtId }, select: { name: true, number: true, colors: true } }), null);
    }
    // El modelo Club no tiene columna `colors`; la marca se resuelve del sitio
    // (Setting) o del distrito. Fallback a los colores institucionales.
    const brandColors = await resolveBrandColors(clubId, district);

    // Ecosistema
    const modules = MODULE_REGISTRY.map((m) => {
        const status = m.detect(b, site);
        return { key: m.key, label: m.label, icon: m.icon, status, statusLabel: STATUS_LABELS[status], metric: m.metric(b, site) };
    });
    // El módulo "chatbot" refleja el equipo completo (club + agentes globales).
    if (agentTeam.available) {
        const cb = modules.find((m) => m.key === 'chatbot');
        if (cb) { cb.status = agentTeam.summary.activeAgents > 0 ? 'active' : cb.status; cb.metric = `${agentTeam.summary.totalAgents} agentes`; }
    }
    const totalMods = modules.filter((m) => m.status !== 'disabled').length;
    const activeMods = modules.filter((m) => m.status === 'active').length;
    const configMods = modules.filter((m) => m.status === 'configured').length;
    const digitalizationPct = pct(activeMods + configMods * 0.5, totalMods);

    const maturity = computeMaturity(b, modules);

    const cur = b.currency;
    const money = (v) => `${cur} ${Math.round(num(v)).toLocaleString('es')}`;

    // KPIs de portada
    const headlineKpis = [
        { key: 'maturity', label: 'Índice de Madurez Digital', value: maturity.score, display: `${maturity.score}`, unit: '/100', icon: 'Gauge', status: maturity.score >= 65 ? 'good' : maturity.score >= 45 ? 'warn' : 'neutral' },
        { key: 'digitalization', label: 'Digitalización', value: digitalizationPct, display: `${digitalizationPct}%`, icon: 'Cpu', status: digitalizationPct >= 60 ? 'good' : 'warn' },
        { key: 'modules', label: 'Módulos Activos', value: activeMods, display: `${activeMods}`, unit: `/${totalMods}`, icon: 'LayoutGrid', status: 'neutral' },
        { key: 'members', label: 'Comunidad', value: b.members, display: b.members.toLocaleString('es'), icon: 'Users', status: 'neutral', delta: growthPct(b.membersNew, b.membersPrev) },
        { key: 'content', label: 'Contenidos', value: b.posts, display: b.posts.toLocaleString('es'), icon: 'FileText', status: 'neutral' },
        { key: 'events', label: 'Eventos', value: b.events, display: b.events.toLocaleString('es'), icon: 'Calendar', status: 'neutral', delta: growthPct(b.eventsNew, b.eventsPrev) },
        { key: 'revenue', label: 'Ingresos', value: b.revenue, display: money(b.revenue), icon: 'DollarSign', status: b.revenue > 0 ? 'good' : 'neutral', delta: growthPct(b.revenue, b.revenuePrev) },
        { key: 'ai', label: 'Conversaciones IA', value: b.convs, display: b.convs.toLocaleString('es'), icon: 'Bot', status: 'neutral' },
    ];

    // Ingeniería del sitio (mezcla de real + estimado, cada uno con `source`)
    const engineering = {
        items: [
            { label: 'Páginas / Secciones', value: (b.posts + b.projects + 8).toLocaleString('es'), icon: 'FileStack', source: 'estimated' },
            { label: 'Contenidos CMS', value: (b.posts + b.projects).toLocaleString('es'), icon: 'LayoutTemplate', source: 'db' },
            { label: 'Formularios activos', value: b.leads > 0 ? '≥1' : '0', icon: 'ClipboardList', source: 'db' },
            { label: 'Bases de datos', value: '1 (PostgreSQL)', icon: 'Database', source: 'platform' },
            { label: 'Automatizaciones', value: (b.emailAutomations + b.autoReplyRules).toLocaleString('es'), icon: 'Workflow', source: 'db' },
            { label: 'APIs / Integraciones', value: (b.socialAccounts + b.paymentConfigs + (b.hasWhatsApp ? 1 : 0)).toLocaleString('es'), icon: 'Plug', source: 'db' },
            { label: 'Dominio', value: site.domain || site.subdomain || '—', icon: 'Globe', source: 'db' },
            { label: 'Certificado SSL', value: site.domain ? 'Activo' : 'Subdominio', icon: 'ShieldCheck', source: 'platform' },
            { label: 'Copias de seguridad', value: 'Gestionadas (diarias)', icon: 'DatabaseBackup', source: 'platform' },
            { label: 'Almacenamiento', value: fmtBytes(b.mediaBytes), icon: 'HardDrive', source: 'db' },
        ],
    };

    // Secciones genéricas
    const sections = [];

    sections.push({
        id: 'comunicaciones', title: 'Comunicaciones', icon: 'Send', accent: '#3b82f6',
        kpis: [
            { label: 'Campañas de correo', value: b.emailCampaigns, icon: 'Mail' },
            { label: 'Correos enviados', value: b.emailSent.toLocaleString('es'), icon: 'Send' },
            { label: 'Tasa de apertura', value: `${pct(b.emailOpens, b.emailSent)}%`, icon: 'MailOpen', status: pct(b.emailOpens, b.emailSent) >= 20 ? 'good' : 'warn' },
            { label: 'Tasa de clics', value: `${pct(b.emailClicks, b.emailSent)}%`, icon: 'MousePointerClick' },
            { label: 'Campañas WhatsApp', value: b.waCampaigns, icon: 'MessageSquare' },
            { label: 'Mensajes WhatsApp', value: b.waSent.toLocaleString('es'), icon: 'MessageCircle' },
        ],
        charts: [
            { type: 'donut', title: 'Rendimiento de correo', valueFormat: 'number',
              data: [ { name: 'Aperturas', value: b.emailOpens }, { name: 'Clics', value: b.emailClicks }, { name: 'Sin abrir', value: Math.max(0, b.emailSent - b.emailOpens) } ] },
        ],
        available: b.emailCampaigns > 0 || b.waCampaigns > 0,
    });

    sections.push({
        id: 'contenidos', title: 'Gestión de Contenidos', icon: 'FileText', accent: '#8b5cf6',
        kpis: [
            { label: 'Publicaciones', value: b.posts, icon: 'Newspaper' },
            { label: 'Nuevas en período', value: b.postsNew, icon: 'PlusCircle' },
            { label: 'Proyectos', value: b.projects, icon: 'FolderKanban' },
            { label: 'Comentarios', value: b.comments, icon: 'MessageSquare' },
            { label: 'Valoración media', value: b.commentsAvg ? `${b.commentsAvg.toFixed(1)}★` : '—', icon: 'Star' },
            { label: 'Archivos multimedia', value: b.media, icon: 'Images' },
        ],
        charts: [
            { type: 'bar', title: 'Publicaciones por mes', valueFormat: 'number', data: series.content },
        ],
        available: b.posts > 0 || b.projects > 0,
    });

    sections.push({
        id: 'analitica', title: 'Analítica Web', icon: 'LineChart', accent: '#0ea5e9',
        note: 'Los datos de tráfico provienen de Google Analytics 4 (por dominio). Si el sitio aún no tiene GA4 configurado, esta sección se mostrará con valores en cero.',
        kpis: [
            { label: 'Dominio analizado', value: site.domain || site.subdomain || '—', icon: 'Globe' },
            { label: 'Estado GA4', value: (site.domain || site.subdomain) ? 'Disponible' : 'Pendiente', icon: 'Activity', status: (site.domain || site.subdomain) ? 'good' : 'warn' },
        ],
        available: true,
    });

    sections.push({
        id: 'comunidad', title: 'Comunidad', icon: 'Users', accent: '#10b981',
        kpis: [
            { label: 'Socios totales', value: b.members, icon: 'Users' },
            { label: 'Socios activos', value: b.membersActive, icon: 'UserCheck' },
            { label: 'Junta directiva', value: b.membersBoard, icon: 'Crown' },
            { label: 'Nuevos en período', value: b.membersNew, icon: 'UserPlus', status: b.membersNew > 0 ? 'good' : 'neutral' },
            { label: 'Leads captados', value: b.leads, icon: 'Target' },
            { label: 'Contactos CRM', value: b.crmContacts, icon: 'Contact' },
        ],
        charts: [
            { type: 'area', title: 'Nuevos socios por mes', valueFormat: 'number', data: series.members },
        ],
        available: b.members > 0 || b.leads > 0,
    });

    sections.push({
        id: 'eventos', title: 'Eventos', icon: 'Calendar', accent: '#f59e0b',
        kpis: [
            { label: 'Eventos totales', value: b.events, icon: 'Calendar' },
            { label: 'Nuevos en período', value: b.eventsNew, icon: 'CalendarPlus' },
        ],
        available: b.events > 0,
    });

    if (b.products > 0 || b.revenue > 0 || b.ordersCount > 0) {
        sections.push({
            id: 'ecommerce', title: 'E-commerce', icon: 'ShoppingBag', accent: '#ec4899',
            kpis: [
                { label: 'Productos', value: b.products, icon: 'Package' },
                { label: 'Pedidos (total)', value: b.ordersCount, icon: 'ShoppingCart' },
                { label: 'Ingresos período', value: money(b.revenue), icon: 'DollarSign', status: 'good' },
                { label: 'Ticket promedio', value: money(b.ordersPeriod ? b.revenue / b.ordersPeriod : 0), icon: 'Receipt' },
                { label: 'Crecimiento', value: `${growthPct(b.revenue, b.revenuePrev)}%`, icon: 'TrendingUp', status: b.revenue >= b.revenuePrev ? 'good' : 'bad' },
            ],
            charts: [ { type: 'bar', title: 'Ingresos por mes', valueFormat: 'currency', currency: cur, data: series.revenue } ],
            available: true,
        });
    }

    if (b.members > 0) {
        sections.push({
            id: 'membresias', title: 'Membresías', icon: 'IdCard', accent: '#6366f1',
            kpis: [
                { label: 'Socios activos', value: b.membersActive, icon: 'UserCheck' },
                { label: 'Nuevos afiliados', value: b.membersNew, icon: 'UserPlus' },
                { label: 'Junta directiva', value: b.membersBoard, icon: 'Crown' },
                { label: 'Estado suscripción', value: site.subscriptionStatus || '—', icon: 'BadgeCheck', status: site.subscriptionStatus === 'active' ? 'good' : 'warn' },
            ],
            available: true,
        });
    }

    if (b.donationsCount > 0 || b.raised > 0) {
        sections.push({
            id: 'donaciones', title: 'Donaciones y Aportes', icon: 'HeartHandshake', accent: '#ef4444',
            kpis: [
                { label: 'Total recaudado', value: money(b.donationsSum || b.raised), icon: 'HandCoins', status: 'good' },
                { label: 'Donantes', value: b.donors || '—', icon: 'Users' },
                { label: 'Aportes registrados', value: b.donationsCount, icon: 'Gift' },
                { label: 'Promedio por aporte', value: money(b.donationsCount ? b.donationsSum / b.donationsCount : 0), icon: 'Calculator' },
                { label: 'Meta de proyectos', value: money(b.goal), icon: 'Flag' },
                { label: 'Beneficiarios', value: b.beneficiaries.toLocaleString('es'), icon: 'Heart' },
            ],
            charts: [ { type: 'area', title: 'Donaciones por mes', valueFormat: 'currency', currency: cur, data: series.donations } ],
            available: true,
        });
    }

    sections.push({
        id: 'ia', title: 'Inteligencia Artificial', icon: 'Bot', accent: '#14b8a6',
        kpis: [
            { label: 'Agentes configurados', value: b.agents, icon: 'Bot' },
            { label: 'Conversaciones', value: b.convs, icon: 'MessagesSquare' },
            { label: 'Mensajes atendidos', value: b.convMessages.toLocaleString('es'), icon: 'MessageSquare' },
            { label: 'Actividad de agentes', value: b.agentActs, icon: 'Activity' },
            { label: 'Memorias del cerebro', value: b.brainMemories.toLocaleString('es'), icon: 'Brain' },
            { label: 'Documentos indexados', value: b.brainDocs, icon: 'FileSearch' },
        ],
        available: b.agents > 0 || b.brainMemories > 0 || b.convs > 0,
    });

    sections.push({
        id: 'automatizaciones', title: 'Automatizaciones', icon: 'Workflow', accent: '#a855f7',
        kpis: [
            { label: 'Automatizaciones de correo', value: b.emailAutomations, icon: 'Mailbox' },
            { label: 'Reglas de auto-respuesta', value: b.autoReplyRules, icon: 'Reply' },
            { label: 'Publicaciones sociales', value: b.socialPubs, icon: 'Share2' },
            { label: 'Horas ahorradas (est.)', value: `≈ ${((b.emailSent + b.waSent) / 60 + b.socialPubs * 0.25 + b.emailAutomations * 3).toFixed(0)} h`, icon: 'Clock', status: 'good' },
        ],
        available: (b.emailAutomations + b.autoReplyRules + b.socialPubs) > 0,
    });

    sections.push({
        id: 'seguridad', title: 'Seguridad', icon: 'ShieldCheck', accent: '#0891b2',
        kpis: [
            { label: 'Certificado SSL', value: site.domain ? 'Activo' : 'Subdominio seguro', icon: 'Lock', status: 'good' },
            { label: 'Copias de seguridad', value: 'Diarias (gestionadas)', icon: 'DatabaseBackup', status: 'good' },
            { label: 'Setup del sitio', value: `${pct(b.phasesDone, b.phasesTotal)}%`, icon: 'ListChecks', status: pct(b.phasesDone, b.phasesTotal) >= 80 ? 'good' : 'warn' },
            { label: 'Estado de la plataforma', value: site.status === 'active' ? 'Protegido' : site.status, icon: 'ShieldCheck', status: site.status === 'active' ? 'good' : 'warn' },
        ],
        available: true,
    });

    sections.push({
        id: 'seo', title: 'SEO y Posicionamiento', icon: 'Search', accent: '#22c55e',
        kpis: [
            { label: 'Contenidos con SEO', value: b.seoFilled, icon: 'Search' },
            { label: 'Cobertura SEO', value: `${pct(b.seoFilled, b.posts)}%`, icon: 'Percent', status: pct(b.seoFilled, b.posts) >= 50 ? 'good' : 'warn' },
            { label: 'Optimización móvil', value: 'Responsive', icon: 'Smartphone', status: 'good' },
            { label: 'Velocidad', value: 'Optimizada (CDN)', icon: 'Zap', status: 'good' },
        ],
        available: true,
    });

    if (b.socialAccounts > 0) {
        sections.push({
            id: 'redes', title: 'Redes Sociales', icon: 'Share2', accent: '#f43f5e',
            kpis: [
                { label: 'Cuentas conectadas', value: b.socialAccounts, icon: 'Link2' },
                { label: 'Publicaciones', value: b.socialPubs, icon: 'Send' },
            ],
            available: true,
        });
    }

    if (b.grants > 0) {
        sections.push({
            id: 'subvenciones', title: 'Subvenciones y Grants', icon: 'Landmark', accent: '#64748b',
            kpis: [ { label: 'Oportunidades', value: b.grants, icon: 'Landmark' } ],
            available: true,
        });
    }

    // Comparativos
    const comparatives = [
        { title: 'Evolución de indicadores (últimos 6 meses)',
          series: [ { key: 'revenue', label: 'Ingresos', color: '#0c3c7c' }, { key: 'members', label: 'Nuevos socios', color: '#E29C00' }, { key: 'content', label: 'Contenidos', color: '#10b981' } ],
          data: series.revenue.map((r, i) => ({ name: r.name, revenue: r.value, members: series.members[i]?.value || 0, content: series.content[i]?.value || 0 })) },
    ];

    // Línea de tiempo (hitos reales inferidos)
    const timeline = buildTimeline(site, b, district);

    // Logros
    const achievements = buildAchievements(b, modules, digitalizationPct, maturity);

    return {
        version: 1,
        meta: {
            platform: { name: 'Club Platform', tagline: 'Ecosistema Digital para Organizaciones' },
            site: {
                id: site.id, name: site.name, category: site.category, categoryLabel: categoryLabel(site.category),
                type: site.type, organizationType: site.organizationType, city: site.city, country: site.country,
                domain: site.domain, subdomain: site.subdomain, logo: site.logo, avatarUrl: site.avatarUrl,
                colors: brandColors,
                districtName: district?.name || null, createdAt: site.createdAt,
            },
            period: { key: period.key, label: period.label, start: period.start, end: period.end, compareLabel: period.compare?.label || null },
            generatedAt: new Date().toISOString(),
        },
        maturity,
        headlineKpis,
        ecosystem: { digitalizationPct, activeCount: activeMods, configuredCount: configMods, totalCount: totalMods, modules },
        agentTeam,
        engineering,
        sections: sections.filter((s) => s.available !== false || s.id === 'analitica'),
        comparatives,
        timeline,
        achievements,
        currency: cur,
    };
};

// ─── Timeline y logros ──────────────────────────────────────────────────────

const buildTimeline = (site, b, district) => {
    const t = [];
    const push = (date, title, description, icon, tone = 'blue') => { if (date) t.push({ date: new Date(date).toISOString(), title, description, icon, tone }); };
    push(site.createdAt, 'Alta del sitio en Club Platform', `${categoryLabel(site.category)}${district ? ` · ${district.name}` : ''} incorporado al ecosistema digital.`, 'Rocket', 'blue');
    if (b.members > 0) push(site.createdAt, 'Comunidad activada', `${b.members} socios registrados en la plataforma.`, 'Users', 'green');
    if (b.posts > 0) push(site.createdAt, 'Contenidos publicados', `${b.posts} publicaciones en el blog/noticias.`, 'Newspaper', 'purple');
    if (b.agents > 0 || b.brainMemories > 0) push(site.createdAt, 'Inteligencia Artificial integrada', `${b.agents} agentes y ${b.brainMemories} memorias de conocimiento.`, 'Brain', 'teal');
    if (b.revenue > 0 || b.products > 0) push(site.createdAt, 'E-commerce en marcha', `${b.products} productos y ${b.ordersCount} pedidos procesados.`, 'ShoppingBag', 'pink');
    if (b.emailCampaigns > 0) push(site.createdAt, 'Comunicación masiva', `${b.emailCampaigns} campañas de correo ejecutadas.`, 'Send', 'blue');
    if (b.socialAccounts > 0) push(site.createdAt, 'Redes sociales conectadas', `${b.socialAccounts} cuentas integradas para publicación.`, 'Share2', 'rose');
    return t;
};

const buildAchievements = (b, modules, digitalizationPct, maturity) => {
    const activeMods = modules.filter((m) => m.status === 'active').length;
    const list = [
        { key: 'ecosystem', label: 'Ecosistema Implementado', description: `${activeMods} módulos activos`, icon: 'LayoutGrid', earned: activeMods >= 6, tier: 'gold' },
        { key: 'ecommerce', label: 'E-commerce Activo', description: 'Tienda en línea operativa', icon: 'ShoppingBag', earned: b.products > 0, tier: 'blue' },
        { key: 'ai', label: 'IA Integrada', description: 'Agentes y cerebro configurados', icon: 'Bot', earned: b.agents > 0 || b.brainMemories > 0, tier: 'teal' },
        { key: 'automation', label: 'Automatizaciones Funcionando', description: 'Flujos automáticos activos', icon: 'Workflow', earned: (b.emailAutomations + b.autoReplyRules) > 0, tier: 'purple' },
        { key: 'growth', label: 'Crecimiento de Comunidad', description: 'Nuevos socios en el período', icon: 'TrendingUp', earned: b.membersNew > 0, tier: 'green' },
        { key: 'comms', label: 'Campañas Exitosas', description: 'Comunicación masiva ejecutada', icon: 'Send', earned: b.emailCampaigns > 0 || b.waCampaigns > 0, tier: 'blue' },
        { key: 'fundraising', label: 'Recaudación Lograda', description: 'Donaciones e ingresos captados', icon: 'HandCoins', earned: (b.donationsSum + b.revenue) > 0, tier: 'gold' },
        { key: 'seo', label: 'SEO Optimizado', description: 'Contenidos con metadatos', icon: 'Search', earned: b.seoFilled > 0, tier: 'green' },
        { key: 'security', label: 'Seguridad Fortalecida', description: 'SSL y respaldos activos', icon: 'ShieldCheck', earned: true, tier: 'cyan' },
        { key: 'maturity', label: `Nivel ${maturity.level}`, description: `Madurez digital ${maturity.score}/100`, icon: 'Gauge', earned: maturity.score >= 45, tier: 'gold' },
    ];
    return list;
};

export default { listSites, buildSiteDataset, resolvePeriod, PERIOD_PRESETS, MODULE_REGISTRY, MATURITY_LEVELS, categoryLabel };
