// ════════════════════════════════════════════════════════════════════
// Sitio web de Club Platform — lo que se sirve SIN JavaScript (v4.1348.0)
//
// Los rastreadores de buscadores y de redes sociales leen el documento tal
// como llega (regla v4.703). Cuando el dominio público del sitio
// institucional está EN VIVO, el `<head>`, `robots.txt` y `sitemap.xml` de
// ese host salen de la versión publicada del sitio, no del motor de sitios
// de club (que para ese host no tiene fila y serviría la ficha genérica).
//
// Mientras el sitio no esté en vivo, nada de esto interviene: el host sigue
// comportándose exactamente como antes.
// ════════════════════════════════════════════════════════════════════
import { stripManagedTags } from './seoRender.js';
import { seoFor, structuredData, sitemapXml, robotsTxt, normalizeHost } from './platformSiteSpec.js';

const TTL_MS = 30_000;
let cache = { at: 0, value: null };

/** El sitio publicado y en vivo, o `null`. Con memoria corta: corre en el camino de TODA página pública. */
export async function liveSite({ now = Date.now(), load } = {}) {
    if (now - cache.at < TTL_MS) return cache.value;
    let value = null;
    try {
        const site = load ? await load() : await (await import('./platformSiteStore.js')).getSite();
        if (site?.publicLive && site.published) value = { host: site.publicHost, config: site.published, publishedAt: site.publishedAt };
    } catch { value = null; }
    cache = { at: now, value };
    return value;
}
export const resetLiveSiteCache = () => { cache = { at: 0, value: null }; };

export const hostMatches = (live, host) => Boolean(live) && normalizeHost(host) === live.host;

const escAttr = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Puro: el documento base con el `<head>` de una página del sitio institucional. */
export function renderPlatformHead(html, { config, host, path }) {
    const slug = String(path || '/').replace(/^\/+|\/+$/g, '');
    const page = config.pages.find(p => p.slug === slug && p.enabled);
    if (!page) return null;
    const seo = seoFor(config, page);
    const url = `https://${host}${seo.path}`;
    const tags = [
        `<meta name="description" content="${escAttr(seo.description)}">`,
        `<meta name="robots" content="${seo.noindex ? 'noindex, follow' : 'index, follow'}">`,
        `<meta property="og:type" content="website">`,
        `<meta property="og:site_name" content="${escAttr(seo.siteName)}">`,
        `<meta property="og:title" content="${escAttr(seo.title)}">`,
        `<meta property="og:description" content="${escAttr(seo.description)}">`,
        `<meta property="og:url" content="${escAttr(url)}">`,
        ...(seo.image ? [`<meta property="og:image" content="${escAttr(seo.image)}">`] : []),
        `<meta name="twitter:card" content="${seo.image ? 'summary_large_image' : 'summary'}">`,
        `<meta name="twitter:title" content="${escAttr(seo.title)}">`,
        `<meta name="twitter:description" content="${escAttr(seo.description)}">`,
        ...(seo.image ? [`<meta name="twitter:image" content="${escAttr(seo.image)}">`] : []),
        `<link rel="canonical" href="${escAttr(url)}">`,
    ];
    const ld = page.id === config.pages[0].id ? structuredData(config, host) : null;
    if (ld) tags.push(`<script type="application/ld+json" id="seo-jsonld">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>`);
    let out = stripManagedTags(html);
    const title = `<title>${escAttr(seo.title)}</title>`;
    out = /<title\b[^>]*>[\s\S]*?<\/title>/i.test(out) ? out.replace(/<title\b[^>]*>[\s\S]*?<\/title>/i, title) : out.replace(/<head\b([^>]*)>/i, `<head$1>\n    ${title}`);
    out = out.replace(/<html\b([^>]*)\blang\s*=\s*["'][^"']*["']/i, `<html$1lang="${escAttr(config.settings.language)}"`);
    const block = `\n    <!-- Sitio institucional de Club Platform — etiquetas resueltas en el servidor -->\n    ${tags.join('\n    ')}\n  `;
    return out.includes('</head>') ? out.replace('</head>', `${block}</head>`) : out + block;
}

/** Para el catch-all: el documento del sitio institucional, o `null` si este host/ruta no es suyo. */
export async function platformDocument({ html, host, path }) {
    const live = await liveSite();
    if (!hostMatches(live, host)) return null;
    const doc = renderPlatformHead(html, { config: live.config, host: live.host, path });
    return doc ? { html: doc, status: 200 } : null;
}
export async function platformRobots(host) {
    const live = await liveSite();
    return hostMatches(live, host) ? robotsTxt(live.host, { live: true }) : null;
}
export async function platformSitemap(host) {
    const live = await liveSite();
    return hostMatches(live, host) ? sitemapXml(live.config, live.host, live.publishedAt ? new Date(live.publishedAt).toISOString() : null) : null;
}

export default { liveSite, resetLiveSiteCache, hostMatches, renderPlatformHead, platformDocument, platformRobots, platformSitemap };
