// LA DIRECCIÓN DE UN ARTÍCULO, en el navegador.
//
// v4.873 — Espejo MÍNIMO de `server/lib/postSlug.js`: sólo lo que el Difusor de
// Publicaciones necesita para armar el slug mientras se escribe el título y
// para enseñar a dónde va a quedar el artículo en cada sitio destino.
//
// ⚠️ Se convierte acá y no se le pregunta al servidor porque sería un viaje de
// red por pulsación. Lo que lo hace seguro es que la prueba compara las SALIDAS
// de los dos módulos sobre una matriz de títulos, no que se parezcan.
//
// Los límites y el estado de longitud salen de `seoSpec.ts` —la misma fuente
// que usa la auditoría de SEO Inteligente—: un segundo catálogo haría que el
// panel avisara de un ancho que el auditor no aplica.

import { LIMITS, lengthState } from './seoSpec';

export const SLUG_MAX = LIMITS.slug.max;
export const SEO_LIMITS = { title: LIMITS.title, description: LIMITS.description };
export { lengthState };

/** Palabras que ya son rutas del sitio. Espejo de `SLUG_RESERVED`. */
export const SLUG_RESERVED = new Set(['admin', 'api', 'blog', 'login', 'assets', 'static']);

/**
 * Texto → slug. Mismo criterio que el servidor: se descomponen los acentos y
 * se descarta la marca diacrítica, así que «Gutiérrez» da «gutierrez» y no
 * «gutirrez» — quitar la letra acentuada entera deja la palabra irreconocible.
 */
export const slugify = (text: string, max: number = SLUG_MAX): string => {
    const base = String(text || '')
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    if (base.length <= max) return base;
    // Se corta por GUION: «…gutierrez-bar» se lee como un error.
    const cortado = base.slice(0, max);
    const ultimo = cortado.lastIndexOf('-');
    return (ultimo > max * 0.5 ? cortado.slice(0, ultimo) : cortado).replace(/-+$/g, '');
};

export const normalizeSlug = (input: string, max: number = SLUG_MAX): string => slugify(input, max);

export interface SlugCheck { ok: boolean; reason?: string; slug?: string }

/** ¿Sirve como dirección? Devuelve el MOTIVO, no un booleano suelto. */
export const checkSlug = (slug: string): SlugCheck => {
    const s = normalizeSlug(slug);
    if (!s) return { ok: false, reason: 'vacio' };
    if (SLUG_RESERVED.has(s)) return { ok: false, reason: 'reservado', slug: s };
    if (/^\d+$/.test(s)) return { ok: false, reason: 'solo_numeros', slug: s };
    return { ok: true, slug: s };
};

export const MOTIVOS_SLUG: Record<string, string> = {
    vacio: 'El título no deja ninguna letra ni número con la que armar la dirección.',
    reservado: 'Esa dirección ya la usa el sitio para otra cosa.',
    solo_numeros: 'Una dirección de sólo números no se distingue de un identificador.',
};

/**
 * La dirección pública del artículo en UN sitio.
 *
 * El slug es del ARTÍCULO y el dominio lo pone cada sitio: una publicación
 * centralizada es una sola fila que se muestra en varios, así que
 * `rotary4281.org/blog/x` y `feria.org/blog/x` son el MISMO artículo.
 */
export const articleUrl = (domain: string | null | undefined, slug: string, path = 'blog'): string | null => {
    const s = normalizeSlug(slug);
    if (!s) return null;
    const host = String(domain || '').trim()
        .replace(/^https?:\/\//i, '')
        .replace(/\/.*$/, '')
        .replace(/^www\./i, '');
    return host ? `https://${host}/${path}/${s}` : `/${path}/${s}`;
};

/** El anfitrión que se le enseña a alguien: dominio propio si lo hay, el dominio
 *  activo de la sesión si es un dominio propio, y si no el subdominio de la plataforma. */
export const siteHost = (site?: { domain?: string | null; subdomain?: string | null } | null): string | null => {
    const d = String(site?.domain || '').trim()
        .replace(/^https?:\/\//i, '')
        .replace(/\/.*$/, '')
        .replace(/^www\./i, '');
    if (d && !d.endsWith('.clubplatform.org')) return d;

    // Si el navegador está navegando sobre un dominio personalizado activo (no localhost ni *.clubplatform.org)
    if (typeof window !== 'undefined' && window.location?.hostname) {
        const h = window.location.hostname.toLowerCase().replace(/^www\./i, '');
        if (h && h !== 'localhost' && h !== '127.0.0.1' && !h.endsWith('.clubplatform.org') && !/^\d+\.\d+\.\d+\.\d+$/.test(h)) {
            return h;
        }
    }

    if (d) return d;
    const sub = String(site?.subdomain || '').trim();
    if (sub) return `${sub}.clubplatform.org`;

    if (typeof window !== 'undefined' && window.location?.hostname) {
        const winHost = window.location.hostname.replace(/^www\./i, '');
        if (winHost && winHost !== 'localhost' && !winHost.endsWith('.clubplatform.org')) {
            return winHost;
        }
    }
    return null;
};

/**
 * Fuente única de verdad para resolver la URL pública canónica de un artículo.
 * Asegura que cualquier módulo de la plataforma (ver publicación, copiar enlace,
 * vista previa o redes sociales) use siempre el dominio principal activo del sitio
 * y nunca un subdominio interno técnico de ClubPlatform cuando exista dominio activo.
 */
export const canonicalPostUrl = (
    post: { publicUrl?: string | null; slug?: string | null; id?: string | null } | null | undefined,
    site?: { domain?: string | null; subdomain?: string | null } | null,
    path = 'blog'
): string | null => {
    if (!post) return null;
    const slugOrId = normalizeSlug(post.slug || '') || (post.id ? String(post.id).trim() : '');
    const host = siteHost(site);

    // Si ya existe publicUrl pero apunta a un subdominio técnico de la plataforma
    // mientras hay un dominio propio activo, se re-ancla al host propio activo.
    if (post.publicUrl) {
        try {
            const parsed = new URL(post.publicUrl, typeof window !== 'undefined' ? window.location.origin : 'https://clubplatform.org');
            const isInternal = parsed.hostname.endsWith('.clubplatform.org');
            if (isInternal && host && !host.endsWith('.clubplatform.org')) {
                return `https://${host}${parsed.pathname}${parsed.search}`;
            }
            if (host && !host.endsWith('.clubplatform.org')) {
                const targetPath = parsed.pathname && parsed.pathname.length > 1 ? parsed.pathname : `/${path}/${slugOrId}`;
                return `https://${host}${targetPath}${parsed.search}`;
            }
            if (post.publicUrl.startsWith('http://') || post.publicUrl.startsWith('https://')) {
                return post.publicUrl;
            }
        } catch { /* URL relativa o no parseable, se compone debajo */ }
    }

    if (!slugOrId) return null;
    return host ? `https://${host}/${path}/${slugOrId}` : `/${path}/${slugOrId}`;
};

export default { SLUG_MAX, SEO_LIMITS, SLUG_RESERVED, MOTIVOS_SLUG, slugify, normalizeSlug, checkSlug, articleUrl, siteHost, canonicalPostUrl, lengthState };
