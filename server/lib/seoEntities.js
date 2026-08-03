// ════════════════════════════════════════════════════════════════════════════
// SEO Inteligente — RESOLUCIÓN DE ENTIDADES
//
// Traduce una dirección (`/blog/mi-noticia`) a la COSA que hay detrás: la fila
// de la base, su fecha, su imagen y su texto. Es la pieza de la que dependen las
// otras tres:
//
//   • el servidor, para pintar las etiquetas correctas ANTES de que exista React
//   • el sitemap, para saber qué direcciones existen y cuándo cambiaron
//   • la auditoría, para recorrer el sitio sin salir a la red
//
// Por qué se lee de la BASE y no rastreando el sitio con peticiones HTTP: un
// rastreador tendría que pedir cada página, esperar a que React la pinte y
// leerla — imposible dentro de los 120 s de la función, y además pagaríamos por
// mirar datos que ya tenemos delante. Un rastreador externo es útil para
// comprobar lo que ve un tercero; para saber QUÉ publicamos, la base es la
// fuente exacta.
// ════════════════════════════════════════════════════════════════════════════

import prisma from './prisma.js';
import {
    LIMITS, PAGE_KINDS, STATIC_ROUTES, kindOfPath, normalizePath, isPrivatePath,
    stripHtml, truncateAtWord,
} from './seoSpec.js';

// ── Qué sitio es ─────────────────────────────────────────────────────────────
// Mismo criterio que el resto de la plataforma: subdominio bajo el dominio de la
// plataforma, o dominio propio. `app`, `www` y `landing` no son sitios de
// cliente.
const PLATFORM_HOSTS = ['clubplatform.org', 'rotaryplatform.com', 'rotaryclubplatform.org'];
const RESERVED_SUBDOMAINS = ['app', 'www', 'landing', 'api', 'admin'];

export function subdomainOf(host = '') {
    const h = String(host).toLowerCase().split(':')[0];
    const platform = PLATFORM_HOSTS.find(p => h === p || h.endsWith('.' + p));
    if (!platform || h === platform) return null;
    const sub = h.slice(0, -(platform.length + 1));
    if (!sub || sub.includes('.')) return null;
    return RESERVED_SUBDOMAINS.includes(sub) ? null : sub;
}

// Cachea el club por host durante la vida del contenedor. La resolución ocurre
// en CADA petición de página; sin caché serían dos viajes a la base antes de
// poder mandar un solo byte de HTML, pagados por el visitante.
//
// El TTL es corto a propósito: si el administrador cambia el nombre o el logo,
// la vista previa al compartir tiene que reflejarlo sin esperar un despliegue.
const CLUB_TTL_MS = 60_000;
const clubCache = new Map();

export async function resolveClubByHost(host) {
    const key = String(host || '').toLowerCase().split(':')[0];
    if (!key) return null;
    const hit = clubCache.get(key);
    if (hit && Date.now() - hit.at < CLUB_TTL_MS) return hit.club;

    const sub = subdomainOf(key);
    let club = null;
    try {
        club = sub
            ? await prisma.club.findFirst({ where: { subdomain: sub } })
            : await prisma.club.findFirst({ where: { domain: key } });
        // Un dominio con y sin `www.` es el mismo sitio. Sin este segundo
        // intento, `www.misitio.org` no encontraba club y servía la ficha
        // genérica de la plataforma.
        if (!club && key.startsWith('www.')) {
            club = await prisma.club.findFirst({ where: { domain: key.slice(4) } });
        }
    } catch (e) {
        console.error('[seo] resolveClubByHost:', e.message);
        return null; // sin club se sirve la ficha genérica; nunca se rompe la página
    }
    clubCache.set(key, { club, at: Date.now() });
    return club;
}

export function invalidateClubCache(host) {
    if (host) clubCache.delete(String(host).toLowerCase().split(':')[0]);
    else clubCache.clear();
}

// ── La dirección canónica del sitio ──────────────────────────────────────────
// Siempre https y sin `www.`: son la misma página y declarar dos canónicas
// distintas para el mismo contenido es justo lo que la canonical evita.
export function siteOrigin(club, host) {
    const raw = club?.domain || host || 'clubplatform.org';
    const clean = String(raw).toLowerCase().split(':')[0].replace(/^www\./, '');
    return `https://${clean}`;
}

// ── Resolución de UNA página ─────────────────────────────────────────────────
// Devuelve lo que hace falta para pintar el <head>: título, descripción, imagen,
// fecha y la fila de origen (para el Schema.org).
//
// `found: false` significa que la ruta encaja con un patrón dinámico pero la
// fila no existe — un enlace a una noticia borrada. Se distingue de `generic`
// porque el servidor tiene que responder 404 y no indexarla.
export async function resolvePage({ club, pathname, host }) {
    const path = normalizePath(pathname);
    const kind = kindOfPath(path);
    const origin = siteOrigin(club, host);
    const base = {
        path, kind, url: origin + (path === '/' ? '/' : path),
        found: true, indexable: !isPrivatePath(path) && kind !== 'private',
        entity: null, entityType: null, entityId: null,
    };

    if (kind === 'private') return { ...base, indexable: false };
    if (!club) return { ...base, ...staticPageMeta(path, kind, null) };

    try {
        if (kind === 'post') return { ...base, ...(await postMeta(club, path)) };
        if (kind === 'project') return { ...base, ...(await projectMeta(club, path)) };
        if (kind === 'event') return { ...base, ...(await eventMeta(club, path)) };
        if (kind === 'product') return { ...base, ...(await productMeta(club, path)) };
    } catch (e) {
        // Un fallo de base NO puede dejar la página sin <head>. Se degrada a la
        // ficha del sitio, que siempre es correcta aunque sea menos específica.
        console.error(`[seo] resolvePage(${path}):`, e.message);
        return { ...base, ...staticPageMeta(path, kind, club), degraded: true };
    }
    return { ...base, ...staticPageMeta(path, kind, club) };
}

// ── Páginas fijas ────────────────────────────────────────────────────────────
function staticPageMeta(path, kind, club) {
    const route = STATIC_ROUTES.find(r => r.path === path);
    const siteName = club?.name || 'Rotary ClubPlatform';
    const where = [club?.city, club?.country].filter(Boolean).join(', ');

    if (kind === 'home' || path === '/') {
        return {
            title: siteName,
            // El título de la portada NO repite el nombre del sitio dos veces.
            // `titleTemplate: false` se lo dice al compositor.
            titleTemplate: false,
            description: club?.description
                || (where
                    ? `${siteName} — organización de servicio en ${where}. Proyectos de impacto social, eventos y formas de participar.`
                    : `${siteName} — servicio por encima del interés propio.`),
            image: club?.logo || null,
            updatedAt: club?.updatedAt || null,
            entityType: 'club',
            entityId: club?.id || null,
            entity: club || null,
        };
    }
    return {
        title: route?.label || 'Página',
        description: club?.description
            ? truncateAtWord(`${route?.label || 'Página'} de ${siteName}. ${club.description}`, LIMITS.description.max)
            : `${route?.label || 'Página'} de ${siteName}.`,
        image: club?.logo || null,
        updatedAt: club?.updatedAt || null,
        entityType: 'page',
        entityId: path,
        entity: null,
    };
}

// ── Entidades dinámicas ──────────────────────────────────────────────────────
// Todas resuelven POR SLUG O POR ID, en ese orden, porque las dos formas de
// dirección conviven: el contenido viejo se enlazó por id y el nuevo por slug.
// Y todas filtran por `clubId`: sin ese filtro, un sitio podría pintar en su
// <head> la noticia de otro que compartiera identificador.

async function postMeta(club, path) {
    const ref = decodeURIComponent(path.split('/').pop());
    const post = await prisma.post.findFirst({
        where: { clubId: club.id, published: true, OR: [{ slug: ref }, { id: ref }] },
    });
    if (!post) return { found: false, indexable: false, title: 'Publicación no encontrada' };

    const body = stripHtml(post.content);
    return {
        title: post.seoTitle || post.title,
        description: post.seoDescription || truncateAtWord(body, LIMITS.description.max),
        image: post.seoImage || post.image || post.images?.[0] || club.logo || null,
        keywords: splitKeywords(post.keywords, post.tags),
        updatedAt: post.updatedAt,
        publishedAt: post.createdAt,
        wordCount: countWords(body),
        bodyText: body,
        entityType: 'post',
        entityId: post.id,
        entity: post,
    };
}

async function projectMeta(club, path) {
    const ref = decodeURIComponent(path.split('/').pop());
    const project = await prisma.project.findFirst({
        where: { clubId: club.id, deletedAt: null, OR: [{ slug: ref }, { id: ref }] },
    });
    if (!project) return { found: false, indexable: false, title: 'Proyecto no encontrado' };

    const body = stripHtml(project.description);
    return {
        title: project.seoTitle || project.title,
        description: project.seoDescription || truncateAtWord(body, LIMITS.description.max),
        image: project.seoImage || project.image || project.images?.[0] || club.logo || null,
        keywords: splitKeywords(project.seoKeywords, project.category ? [project.category] : []),
        updatedAt: project.updatedAt,
        publishedAt: project.createdAt,
        wordCount: countWords(body),
        bodyText: body,
        // `indexable: false` en el proyecto es una decisión del administrador y
        // manda sobre todo lo demás.
        indexable: project.indexable !== false,
        entityType: 'project',
        entityId: project.id,
        entity: project,
    };
}

async function eventMeta(club, path) {
    const ref = decodeURIComponent(path.split('/').pop());
    const event = await prisma.calendarEvent.findFirst({
        where: { clubId: club.id, OR: [{ slug: ref }, { id: ref }] },
    });
    if (!event) return { found: false, indexable: false, title: 'Evento no encontrado' };

    const body = stripHtml(event.htmlContent || event.description);
    return {
        title: event.title,
        description: truncateAtWord(body || `${event.title} — ${club.name}`, LIMITS.description.max),
        image: event.image || event.images?.[0] || club.logo || null,
        updatedAt: event.startDate,
        wordCount: countWords(body),
        bodyText: body,
        entityType: 'event',
        entityId: event.id,
        entity: event,
    };
}

async function productMeta(club, path) {
    const ref = decodeURIComponent(path.split('/').pop());
    const product = await prisma.product.findFirst({
        where: { clubId: club.id, OR: [{ slug: ref }, { id: ref }] },
    });
    if (!product) return { found: false, indexable: false, title: 'Producto no encontrado' };

    const body = stripHtml(product.description);
    return {
        title: product.name,
        description: truncateAtWord(body, LIMITS.description.max),
        image: product.images?.[0] || club.logo || null,
        updatedAt: product.updatedAt,
        wordCount: countWords(body),
        bodyText: body,
        indexable: product.status === 'active',
        entityType: 'product',
        entityId: product.id,
        entity: product,
    };
}

// ── Inventario completo del sitio ────────────────────────────────────────────
// Lo consumen el sitemap y la auditoría. Devuelve SÓLO lo indexable: una página
// privada no va al sitemap ni se audita como si fuera pública.
//
// `limit` existe porque un sitio con miles de publicaciones no cabe en una
// función de 120 s ni en un sitemap de 50.000 direcciones. Cuando se recorta se
// DICE (`truncated`), nunca en silencio: un recorte callado se lee como
// "cubrimos todo" cuando no fue así.
export async function listSitePages(club, { limit = 5000 } = {}) {
    const pages = [];
    const notes = [];

    for (const r of STATIC_ROUTES) {
        const meta = PAGE_KINDS[r.kind] || PAGE_KINDS.generic;
        pages.push({
            path: r.path, kind: r.kind, label: r.label,
            priority: meta.priority, changefreq: meta.changefreq,
            lastmod: club?.updatedAt || null,
            entityType: 'page', entityId: r.path,
        });
    }
    if (!club) return { pages, notes, truncated: false };

    const perType = Math.max(50, Math.floor((limit - pages.length) / 4));
    const [posts, projects, events, products] = await Promise.all([
        prisma.post.findMany({
            where: { clubId: club.id, published: true },
            select: { id: true, slug: true, title: true, updatedAt: true },
            orderBy: { updatedAt: 'desc' }, take: perType + 1,
        }),
        prisma.project.findMany({
            where: { clubId: club.id, deletedAt: null, indexable: true },
            select: { id: true, slug: true, title: true, updatedAt: true },
            orderBy: { updatedAt: 'desc' }, take: perType + 1,
        }),
        prisma.calendarEvent.findMany({
            where: { clubId: club.id },
            select: { id: true, slug: true, title: true, startDate: true },
            orderBy: { startDate: 'desc' }, take: perType + 1,
        }),
        prisma.product.findMany({
            where: { clubId: club.id, status: 'active' },
            select: { id: true, slug: true, name: true, updatedAt: true },
            orderBy: { updatedAt: 'desc' }, take: perType + 1,
        }),
    ]);

    const push = (rows, kind, prefix, titleKey, dateKey) => {
        const over = rows.length > perType;
        if (over) notes.push(`Se listaron las ${perType} entradas más recientes de ${kind}; hay más.`);
        for (const row of rows.slice(0, perType)) {
            const meta = PAGE_KINDS[kind];
            pages.push({
                path: `${prefix}/${row.slug || row.id}`,
                kind, label: row[titleKey],
                priority: meta.priority, changefreq: meta.changefreq,
                lastmod: row[dateKey] || null,
                entityType: kind, entityId: row.id,
                // Un contenido sin slug se sigue publicando por id, pero pierde
                // la palabra clave en la dirección. Se anota como oportunidad.
                missingSlug: !row.slug,
            });
        }
        return over;
    };

    const t1 = push(posts, 'post', '/blog', 'title', 'updatedAt');
    const t2 = push(projects, 'project', '/proyectos', 'title', 'updatedAt');
    const t3 = push(events, 'event', '/eventos', 'title', 'startDate');
    const t4 = push(products, 'product', '/shop/product', 'name', 'updatedAt');

    return { pages, notes, truncated: t1 || t2 || t3 || t4 };
}

// ── Utilidades ───────────────────────────────────────────────────────────────
function splitKeywords(csv, extra = []) {
    const fromCsv = String(csv || '').split(/[,;]/).map(s => s.trim()).filter(Boolean);
    return [...new Set([...fromCsv, ...(extra || []).filter(Boolean)])];
}

function countWords(text) {
    const t = String(text || '').trim();
    return t ? t.split(/\s+/).length : 0;
}

export default {
    subdomainOf, resolveClubByHost, invalidateClubCache, siteOrigin,
    resolvePage, listSitePages,
};
