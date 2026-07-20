/**
 * Hub Social — servicio de Insights (Facebook Insights + Instagram Insights).
 *
 * Recolecta métricas a nivel CUENTA (seguidores, alcance, impresiones, visitas
 * al perfil) y a nivel MEDIA (por publicación: alcance, engagement, guardados,
 * reproducciones). Devuelve objetos normalizados para el dashboard ejecutivo.
 *
 * Diseño tolerante: muchas de estas métricas requieren permisos avanzados que
 * pueden no estar aprobados todavía por Meta (read_insights,
 * instagram_manage_insights). Cada fetch está aislado en try/catch — si una
 * métrica falla, se omite y el resto se devuelve igual. Nunca lanza por una
 * métrica faltante.
 */

const GRAPH_VERSION = 'v18.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

const safeJson = async (url) => {
    try {
        const resp = await fetch(url);
        const data = await resp.json();
        if (!resp.ok || data.error) {
            return { ok: false, error: data.error?.message || `HTTP ${resp.status}` };
        }
        return { ok: true, data };
    } catch (e) {
        return { ok: false, error: e.message };
    }
};

// Convierte el array `data` de /insights en un mapa { metric: valorMasReciente }.
const flattenInsights = (insightsData) => {
    const out = {};
    for (const item of insightsData?.data || []) {
        const values = item.values || [];
        const last = values[values.length - 1];
        out[item.name] = last ? last.value : null;
    }
    return out;
};

// ── Facebook Page ───────────────────────────────────────────────────────────
export const getFacebookPageInsights = async ({ pageId, pageAccessToken }) => {
    const result = { platform: 'facebook', followers: null, metrics: {}, errors: [] };

    // Fans (seguidores de la Página) + nombre.
    const profile = await safeJson(
        `${GRAPH_BASE}/${pageId}?fields=fan_count,followers_count,name&access_token=${encodeURIComponent(pageAccessToken)}`
    );
    if (profile.ok) {
        result.followers = profile.data.followers_count ?? profile.data.fan_count ?? null;
        result.name = profile.data.name;
    } else {
        result.errors.push(`profile: ${profile.error}`);
    }

    // Insights de la Página (día).
    const metricList = [
        'page_impressions',
        'page_impressions_unique',
        'page_post_engagements',
        'page_fan_adds',
        'page_views_total'
    ].join(',');
    const insights = await safeJson(
        `${GRAPH_BASE}/${pageId}/insights?metric=${metricList}&period=day&access_token=${encodeURIComponent(pageAccessToken)}`
    );
    if (insights.ok) {
        Object.assign(result.metrics, flattenInsights(insights.data));
    } else {
        result.errors.push(`insights: ${insights.error}`);
    }
    return result;
};

// ── Instagram Business ────────────────────────────────────────────────────────
export const getInstagramInsights = async ({ igUserId, pageAccessToken }) => {
    const result = { platform: 'instagram', followers: null, metrics: {}, errors: [] };

    const profile = await safeJson(
        `${GRAPH_BASE}/${igUserId}?fields=followers_count,media_count,username&access_token=${encodeURIComponent(pageAccessToken)}`
    );
    if (profile.ok) {
        result.followers = profile.data.followers_count ?? null;
        result.mediaCount = profile.data.media_count ?? null;
        result.username = profile.data.username;
    } else {
        result.errors.push(`profile: ${profile.error}`);
    }

    const metricList = ['impressions', 'reach', 'profile_views'].join(',');
    const insights = await safeJson(
        `${GRAPH_BASE}/${igUserId}/insights?metric=${metricList}&period=day&access_token=${encodeURIComponent(pageAccessToken)}`
    );
    if (insights.ok) {
        Object.assign(result.metrics, flattenInsights(insights.data));
    } else {
        result.errors.push(`insights: ${insights.error}`);
    }
    return result;
};

// Dispatcher a nivel cuenta.
export const getAccountInsights = async ({ account, decryptedToken }) => {
    if (account.platform === 'facebook') {
        return getFacebookPageInsights({ pageId: account.platformId, pageAccessToken: decryptedToken });
    }
    if (account.platform === 'instagram') {
        return getInstagramInsights({ igUserId: account.platformId, pageAccessToken: decryptedToken });
    }
    return { platform: account.platform, followers: null, metrics: {}, errors: ['plataforma no soportada'] };
};

// ── Media / publicación individual ───────────────────────────────────────────
// externalId es el post id (FB) o media id (IG) que quedó en targetAccounts.
export const getMediaInsights = async ({ platform, externalId, accessToken }) => {
    if (platform === 'instagram') {
        const metrics = ['impressions', 'reach', 'engagement', 'saved', 'video_views'].join(',');
        const r = await safeJson(
            `${GRAPH_BASE}/${externalId}/insights?metric=${metrics}&access_token=${encodeURIComponent(accessToken)}`
        );
        return r.ok ? { ok: true, metrics: flattenInsights(r.data) } : { ok: false, error: r.error };
    }
    if (platform === 'facebook') {
        const metrics = ['post_impressions', 'post_impressions_unique', 'post_engaged_users', 'post_reactions_by_type_total'].join(',');
        const r = await safeJson(
            `${GRAPH_BASE}/${externalId}/insights?metric=${metrics}&access_token=${encodeURIComponent(accessToken)}`
        );
        return r.ok ? { ok: true, metrics: flattenInsights(r.data) } : { ok: false, error: r.error };
    }
    return { ok: false, error: 'plataforma no soportada' };
};
