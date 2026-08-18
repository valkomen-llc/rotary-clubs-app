// LA DIRECCIÓN DE UN ARTÍCULO. Puro: sin base, sin red, sin DOM.
//
// v4.873 — El Difusor de Publicaciones no dejaba definir el slug, así que un
// artículo se abría por su id: `/blog/1f6c8e2a-4b93-4d1e-9a77-...`. Se reportó
// como «aparecen unos caracteres muy raros en el URL».
//
// ═════════════════════════════════════════════════════════════════════
// EL SLUG ES DEL ARTÍCULO; EL DOMINIO LO PONE CADA SITIO
// ═════════════════════════════════════════════════════════════════════
//
// Una publicación centralizada es UNA fila que se muestra en varios sitios
// (`targetClubIds`), así que su slug es uno solo y la dirección cambia con el
// dominio de quien la muestra: `rotary4281.org/blog/mi-slug` y
// `feria.org/blog/mi-slug` son el MISMO artículo. Por eso el slug no puede
// llevar el dominio adentro ni guardarse por sitio.
//
// ⚠️ `Post.slug` es ÚNICO EN TODA LA PLATAFORMA, no por sitio como el de
// `CalendarEvent`. Dos publicaciones no pueden compartirlo aunque se muestren
// en sitios distintos, y por eso hay que liberarlo con sufijo antes de
// escribir: sin eso, el choque sale como un error del driver que no explica
// nada — la lección de `freeSlug` en el módulo de ecosistema.

import { LIMITS, slugify as slugifySeo } from './seoSpec.js';

// ⚠️ EL SLUGIFY Y LAS LONGITUDES SALEN DE `seoSpec.js`, NO SE REESCRIBEN.
// Ese módulo ya define cómo se arma un slug y con qué anchos recorta Google el
// título y la descripción; un segundo catálogo se separa en silencio y el
// panel acabaría avisando de un límite que el auditor de SEO no aplica. Acá
// vive sólo lo que aquél NO tiene: el choque de unicidad, las palabras
// reservadas y la dirección por sitio.

/** Cuánto puede medir un slug. Sale de `seoSpec.LIMITS`, que es donde ya
 *  estaba: no es un gusto, es el ancho con el que el resultado se recorta. */
export const SLUG_MAX = LIMITS.slug.max;

/** Los anchos del título y la descripción, re-exportados para que la pantalla
 *  no tenga que conocer la forma de `LIMITS`. Misma fuente que la auditoría. */
export const SEO_LIMITS = { title: LIMITS.title, description: LIMITS.description };

/** Palabras que no pueden ser un slug porque ya son rutas del sitio. Un
 *  artículo llamado «blog» dejaría `/blog/blog`, que es confuso pero funciona;
 *  «admin» sí es un problema, y la comprobación cuesta una línea. */
export const SLUG_RESERVED = new Set(['admin', 'api', 'blog', 'login', 'assets', 'static']);

/**
 * Texto → slug. Delega en `seoSpec.slugify`, que es el único que lo sabe hacer
 * en esta plataforma: descompone los acentos y descarta la marca diacrítica,
 * así que «Gutiérrez» da «gutierrez» y no «gutirrez» —quitar la letra acentuada
 * entera es el error clásico y deja la palabra irreconocible—.
 *
 * Lo que se agrega es una limpieza final: `seoSpec.slugify` puede dejar un
 * guion colgando al recortar, y un slug terminado en guion se ve como un error.
 */
export const slugify = (text, { max = SLUG_MAX } = {}) =>
    slugifySeo(text, max).replace(/^-+|-+$/g, '');

/** Lo que escribió una persona en la casilla del slug. Mismo criterio: si lo
 *  tecleó con mayúsculas, tildes o espacios, se arregla en vez de rechazarlo. */
export const normalizeSlug = (input, opts) => slugify(input, opts);

/** ¿Sirve como dirección? Devuelve el motivo, no un booleano suelto. */
export const checkSlug = (slug) => {
    const s = normalizeSlug(slug);
    if (!s) return { ok: false, reason: 'vacio' };
    if (SLUG_RESERVED.has(s)) return { ok: false, reason: 'reservado', slug: s };
    if (/^\d+$/.test(s)) return { ok: false, reason: 'solo_numeros', slug: s };
    return { ok: true, slug: s };
};

export const MOTIVOS_SLUG = {
    vacio: 'El título no deja ninguna letra ni número con la que armar la dirección.',
    reservado: 'Esa dirección ya la usa el sitio para otra cosa.',
    solo_numeros: 'Una dirección de sólo números no se distingue de un identificador.',
};

/**
 * Libera el slug con un sufijo cuando ya está tomado.
 *
 * `taken` es el conjunto de los que YA existen (de otras publicaciones). No
 * lanza ni rechaza: devuelve el que se puede usar, y quien llame se encarga de
 * DECIR que cambió — un slug que cambia en silencio manda a buscar el artículo
 * a una dirección que no es.
 */
export const freeSlug = (base, taken = new Set(), { max = SLUG_MAX } = {}) => {
    const s = normalizeSlug(base, { max });
    if (!s) return '';
    if (!taken.has(s)) return s;
    for (let n = 2; n < 500; n++) {
        const sufijo = `-${n}`;
        // Se recorta la base, no el sufijo: el sufijo es lo que lo hace único.
        const cabe = s.length + sufijo.length <= max ? s : s.slice(0, max - sufijo.length).replace(/-+$/g, '');
        const candidato = `${cabe}${sufijo}`;
        if (!taken.has(candidato)) return candidato;
    }
    return '';
};

/** La dirección pública del artículo en UN sitio. `dominio` puede venir con
 *  esquema, con `www.` o vacío — se normaliza acá y no en cada pantalla. */
export const articleUrl = (domain, slug, { path = 'blog' } = {}) => {
    const s = normalizeSlug(slug);
    if (!s) return null;
    const host = String(domain || '').trim()
        .replace(/^https?:\/\//i, '')
        .replace(/\/.*$/, '')
        .replace(/^www\./i, '');
    return host ? `https://${host}/${path}/${s}` : `/${path}/${s}`;
};

export default {
    SLUG_MAX, SLUG_RESERVED, MOTIVOS_SLUG,
    slugify, normalizeSlug, checkSlug, freeSlug, articleUrl,
};
