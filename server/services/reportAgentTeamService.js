/**
 * Report Agent Team Service — "Equipo de Marketing IA".
 *
 * Construye la radiografía del equipo de agentes de IA instalados para un sitio:
 * el roster completo (agentes propios del club + globales de plataforma,
 * deduplicados por nombre), agrupados por área (category), con sus skills
 * (capabilities) y su actividad real (conversaciones, mensajes, acciones,
 * tasa de éxito). Todo SOLO-LECTURA y envuelto en try/catch → nunca rompe el
 * informe si falta una tabla o un dato.
 */

import prisma from '../lib/prisma.js';

const safe = async (fn, fallback) => { try { const v = await fn(); return v ?? fallback; } catch (e) { console.warn('[reportAgentTeam] omitido:', e?.message); return fallback; } };

// Áreas (category del Agent) → etiqueta + color. Espejo de CATEGORY_LABELS del
// frontend (src/pages/admin/Agents.tsx).
const AREA_META = {
    'dirección': { label: 'Dirección y Estrategia', color: '#3B82F6', icon: 'Compass' },
    'direccion': { label: 'Dirección y Estrategia', color: '#3B82F6', icon: 'Compass' },
    'producción': { label: 'Producción de Contenido', color: '#EC4899', icon: 'PenTool' },
    'produccion': { label: 'Producción de Contenido', color: '#EC4899', icon: 'PenTool' },
    'tecnología': { label: 'Tecnología y Plataformas', color: '#0EA5E9', icon: 'Cpu' },
    'tecnologia': { label: 'Tecnología y Plataformas', color: '#0EA5E9', icon: 'Cpu' },
    'difusión': { label: 'Difusión y Comunidad', color: '#F97316', icon: 'Megaphone' },
    'difusion': { label: 'Difusión y Comunidad', color: '#F97316', icon: 'Megaphone' },
    'premium_b2b': { label: 'Servicios VIP B2B', color: '#8B5CF6', icon: 'Crown' },
};
const areaMeta = (cat) => AREA_META[(cat || '').toLowerCase()] || { label: cat ? cat[0].toUpperCase() + cat.slice(1) : 'General', color: '#64748b', icon: 'Users' };

// Skills (capabilities) → etiqueta legible en español. Cubre el roster por
// defecto; para claves no mapeadas se "prettifica" el identificador.
const CAP_LABELS = {
    platform_technical_support: 'Soporte técnico de plataforma', architecture_insights: 'Arquitectura', admin_help: 'Ayuda al administrador',
    orchestrate: 'Orquestación', delegate: 'Delegación de tareas', form_processing: 'Procesamiento de formularios', director_comms: 'Dirección de comunicaciones',
    brand_guidelines: 'Guía de marca', content_strategy: 'Estrategia de contenido', analytics_product: 'Analítica de producto', growth_engine: 'Motor de crecimiento',
    social_orchestrator: 'Orquestación social', instagram_automation: 'Automatización Instagram', tiktok_automation: 'Automatización TikTok', community: 'Community management', daily_news: 'Noticias diarias', rotary_feed_scraper: 'Feed Rotario',
    seo_technical: 'SEO técnico', seo_content: 'SEO de contenido', programmatic_seo: 'SEO programático', seo_sitemap: 'Sitemaps SEO', seo_authority: 'Autoridad SEO',
    paid_ads: 'Pauta digital', ad_creative: 'Creatividades publicitarias', analytics_automation: 'Automatización de analítica', analytics_tracking: 'Tracking y medición',
    email_sequence: 'Secuencias de email', cold_email: 'Cold outreach', email_systems: 'Sistemas de email', newsletter_curator: 'Curaduría de newsletter',
    content_creator: 'Creación de contenido', copywriting: 'Copywriting', video_analysis: 'Análisis de video', rotary_news_analyst: 'Analista de noticias Rotarias', grant_analysis: 'Análisis de subvenciones',
    nextjs_patterns: 'Patrones Next.js', react_best_practices: 'Buenas prácticas React', architecture_review: 'Revisión de arquitectura', react_ui_patterns: 'Patrones UI React',
    antigravity_design: 'Diseño Antigravity', web_performance: 'Rendimiento web', ui_ux_patterns: 'Patrones UX/UI',
    database_admin: 'Administración de BD', database_architect: 'Arquitectura de BD', neon_postgres: 'Neon Postgres', app_deployment: 'Despliegue de apps',
    api_design: 'Diseño de APIs', api_documentation: 'Documentación de APIs', app_performance: 'Rendimiento de apps', site_architecture: 'Arquitectura del sitio',
    whatsapp_send: 'Envío WhatsApp', whatsapp_campaigns: 'Campañas WhatsApp', whatsapp_import: 'Importación WhatsApp', district_scout: 'Prospección de distrito',
    vip_account_management: 'Gestión de cuentas VIP', campaign_concierge_reception: 'Concierge de campañas', customer_success_support: 'Customer success', internal_communications: 'Comunicación institucional',
    create_news: 'Crear noticias', email_campaigns: 'Email marketing', create_project: 'Crear proyectos', create_event: 'Crear eventos',
};
const capLabel = (c) => CAP_LABELS[c] || String(c || '').replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());

export const collectAgentTeam = async (clubId) => {
    // Roster: agentes del club + globales de plataforma, deduplicados por nombre
    // (prefiere la copia específica del club).
    const rows = await safe(() => prisma.agent.findMany({
        where: { OR: [{ clubId }, { clubId: null }] },
        orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
        select: { id: true, clubId: true, name: true, role: true, category: true, description: true, aiModel: true, avatarSeed: true, avatarColor: true, capabilities: true, active: true, order: true, greeting: true },
    }), []);

    const byName = new Map();
    for (const a of rows) {
        const prev = byName.get(a.name);
        if (!prev || (!prev.clubId && a.clubId)) byName.set(a.name, a);
    }
    const agents = Array.from(byName.values()).sort((x, y) => (x.order ?? 0) - (y.order ?? 0));
    const agentIds = agents.map((a) => a.id);

    // Actividad acumulada (footprint del equipo) por agente en este sitio.
    const [acts, convs] = await Promise.all([
        safe(() => prisma.agentActivity.findMany({ where: { clubId, ...(agentIds.length ? { agentId: { in: agentIds } } : {}) }, select: { agentId: true, agentName: true, success: true }, take: 8000 }), []),
        safe(() => prisma.agentConversation.findMany({ where: { clubId }, select: { agentId: true, messageCount: true, updatedAt: true }, take: 8000 }), []),
    ]);

    const actBy = new Map();
    for (const a of acts) {
        const k = a.agentId;
        const e = actBy.get(k) || { total: 0, ok: 0, byName: a.agentName };
        e.total++; if (a.success !== false) e.ok++;
        actBy.set(k, e);
    }
    const convBy = new Map();
    for (const c of convs) {
        const k = c.agentId;
        const e = convBy.get(k) || { convs: 0, messages: 0, last: null };
        e.convs++; e.messages += (c.messageCount || 0);
        if (c.updatedAt && (!e.last || new Date(c.updatedAt) > new Date(e.last))) e.last = c.updatedAt;
        convBy.set(k, e);
    }

    const enriched = agents.map((a) => {
        const meta = areaMeta(a.category);
        const act = actBy.get(a.id) || { total: 0, ok: 0 };
        const cv = convBy.get(a.id) || { convs: 0, messages: 0, last: null };
        const caps = Array.isArray(a.capabilities) ? a.capabilities : [];
        return {
            id: a.id, name: a.name, role: a.role, area: a.category || 'general', areaLabel: meta.label, areaColor: meta.color, areaIcon: meta.icon,
            description: a.description || '', aiModel: a.aiModel || 'gpt-4', active: a.active !== false,
            avatarSeed: a.avatarSeed || a.name, avatarColor: a.avatarColor || meta.color,
            scope: a.clubId ? 'site' : 'platform',
            skills: caps.map((c) => ({ key: c, label: capLabel(c) })),
            skillCount: caps.length,
            stats: {
                conversations: cv.convs, messages: cv.messages, actions: act.total,
                successRate: act.total ? Math.round((act.ok / act.total) * 100) : null,
                lastActiveAt: cv.last ? new Date(cv.last).toISOString() : null,
            },
        };
    });

    // Agrupado por área
    const areaMap = new Map();
    for (const a of enriched) {
        const g = areaMap.get(a.area) || { key: a.area, label: a.areaLabel, color: a.areaColor, icon: a.areaIcon, agents: [] };
        g.agents.push(a);
        areaMap.set(a.area, g);
    }
    const areas = Array.from(areaMap.values()).map((g) => ({ ...g, agentCount: g.agents.length }));

    // Skills únicos por área (cobertura del equipo)
    const uniqueSkills = new Set();
    enriched.forEach((a) => a.skills.forEach((s) => uniqueSkills.add(s.key)));

    const activeAgents = enriched.filter((a) => a.active).length;
    const totalConversations = enriched.reduce((s, a) => s + a.stats.conversations, 0);
    const totalMessages = enriched.reduce((s, a) => s + a.stats.messages, 0);
    const totalActions = enriched.reduce((s, a) => s + a.stats.actions, 0);
    const totalOk = acts.filter((a) => a.success !== false).length;
    const successRate = acts.length ? Math.round((totalOk / acts.length) * 100) : null;

    return {
        available: enriched.length > 0,
        summary: {
            totalAgents: enriched.length,
            activeAgents,
            areasCovered: areas.length,
            totalSkills: uniqueSkills.size,
            conversations: totalConversations,
            messages: totalMessages,
            actions: totalActions,
            successRate,
        },
        areas,
        agents: enriched,
        // Distribución de agentes por área (para gráfico)
        areaDistribution: areas.map((g) => ({ name: g.label, value: g.agentCount, color: g.color })),
        // Ranking de actividad por agente (top por conversaciones+acciones)
        activityRanking: [...enriched]
            .map((a) => ({ name: a.name, value: a.stats.conversations + a.stats.actions }))
            .sort((x, y) => y.value - x.value).slice(0, 8),
    };
};

export default { collectAgentTeam };
