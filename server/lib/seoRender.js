// ════════════════════════════════════════════════════════════════════════════
// SEO Inteligente — INYECCIÓN DE ETIQUETAS EN EL HTML
//
// Este archivo existe por un defecto concreto y verificable: **la vista previa
// al compartir cualquier sitio de la plataforma mostraba la ficha genérica de
// ClubPlatform**, no la del sitio.
//
// La causa no era que faltaran etiquetas, sino que SOBRABAN. `index.html` trae
// og:title / og:description / og:url escritos a mano, y el servidor AÑADÍA los
// suyos antes de `</head>`. El documento quedaba con dos `og:title`, y toda red
// social lee la PRIMERA aparición. La primera era siempre la de la plataforma,
// así que los cientos de sitios alojados compartían la misma tarjeta.
//
// Por eso la regla de este archivo es **reemplazar, nunca añadir**:
// `renderHead` retira del HTML toda etiqueta que vaya a escribir y sólo entonces
// escribe la suya. Es la diferencia entre una etiqueta correcta y una etiqueta
// correcta que nadie lee.
//
// Y por eso todo pasa por `escapeAttr`: hasta esta versión el nombre y la
// descripción del club se interpolaban crudos en `content="…"`, así que un
// apóstrofo tipográfico pasaba pero una comilla recta partía la etiqueta y
// derramaba texto en el <head>.
// ════════════════════════════════════════════════════════════════════════════

import { escapeAttr, escapeJsonLd, truncateAtWord, LIMITS } from './seoSpec.js';
import { buildJsonLd } from './seoSchema.js';

// ── Composición del título ───────────────────────────────────────────────────
// `Página | Sitio`, salvo en la portada, donde el nombre del sitio ya ES el
// título y repetirlo daría "Club Rotario X | Club Rotario X".
//
// Si el título propio ya contiene el nombre del sitio, tampoco se añade: un
// título de noticia que empieza por el nombre del club no necesita terminar
// con él otra vez.
//
// **El título que escribió una persona no se recorta nunca.** Lo único que se
// decide acá es si el nombre del sitio CABE detrás; si no cabe, se omite el
// sufijo y el título va entero. Recortarlo sería reescribir contenido del
// cliente por una regla de longitud que además es orientativa —Google recorta
// por ancho en píxeles, no por caracteres, y a veces reescribe el título de
// todos modos—. Que sea largo es un hallazgo de la auditoría
// (`title_too_long`), con su recomendación y su botón para reescribirlo con
// criterio; no algo que el pintado resuelva por lo bajo.
//
// `limit` viene del llamador porque el <title> del buscador y el og:title de una
// tarjeta social no tienen el mismo espacio: 70 frente a 95.
export function composeTitle({ page, siteName, limit = LIMITS.title.hardMax }) {
    const own = String(page.title || '').trim();
    if (!own) return siteName || 'Sitio';
    if (page.titleTemplate === false || !siteName) return own;
    if (own.toLowerCase().includes(siteName.toLowerCase())) return own;
    const full = `${own} | ${siteName}`;
    return full.length <= limit ? full : own;
}

function absolute(url, origin) {
    if (!url) return '';
    const u = String(url).trim();
    if (/^https?:\/\//i.test(u)) return u;
    if (u.startsWith('//')) return 'https:' + u;
    return origin.replace(/\/$/, '') + (u.startsWith('/') ? u : '/' + u);
}

// ── Qué etiquetas le tocan a esta página ─────────────────────────────────────
// Devuelve un objeto plano, sin HTML. Separarlo del pintado es lo que permite
// que la auditoría y la vista previa del panel usen exactamente lo mismo que se
// va a servir, en vez de una aproximación.
export function buildMetaSet({ page, club, origin, config = {}, overrides = {} }) {
    const siteName = club?.name || 'Rotary ClubPlatform';
    const title = overrides.title || composeTitle({ page, siteName, limit: LIMITS.title.hardMax });
    // El título social se compone aparte porque dispone de más espacio: una
    // tarjeta de WhatsApp o LinkedIn muestra bastante más que la línea azul del
    // buscador, así que ahí sí cabe el nombre del sitio que en el <title> a
    // veces hay que dejar fuera.
    const socialTitle = overrides.title || composeTitle({ page, siteName, limit: LIMITS.ogTitle.hardMax });
    const description = truncateAtWord(
        overrides.description || page.description || club?.description || '',
        LIMITS.ogDescription.hardMax,
    );
    const image = absolute(overrides.image || page.image || config.defaultImage || club?.logo, origin);
    const canonical = overrides.canonical || page.url;

    // `robots` es una decisión, no una copia. Una página que no se encontró
    // (`found: false`) o que es privada nunca debe indexarse; el resto sí, salvo
    // que el administrador lo haya cambiado para esa página.
    const indexable = overrides.indexable != null ? overrides.indexable : page.indexable;
    const robots = indexable
        ? 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1'
        : 'noindex, follow';

    const ogType = page.kind === 'post' ? 'article'
        : page.kind === 'event' ? 'article'
            : page.kind === 'product' ? 'product'
                : 'website';

    return {
        title,
        socialTitle,
        description,
        canonical,
        robots,
        image,
        siteName,
        ogType,
        locale: config.locale || 'es_CO',
        language: config.language || 'es-CO',
        keywords: (overrides.keywords || page.keywords || config.keywords || []).slice(0, 12),
        publishedAt: page.publishedAt || null,
        updatedAt: page.updatedAt || null,
        twitterCard: image ? 'summary_large_image' : 'summary',
        twitterSite: config.twitterHandle || null,
        themeColor: config.themeColor || null,
        // SEO local: sólo si hay algo que declarar de verdad.
        geo: (club?.city || club?.country) ? {
            placename: [club?.city, club?.country].filter(Boolean).join(', '),
            region: config.geoRegion || club?.district || null,
            position: (config.lat && config.lng) ? `${config.lat};${config.lng}` : null,
        } : null,
        indexable,
    };
}

// ── Las etiquetas, ya en HTML ────────────────────────────────────────────────
export function renderMetaTags(meta) {
    const out = [];
    const nameTag = (n, c) => { if (c) out.push(`<meta name="${n}" content="${escapeAttr(c)}">`); };
    const propTag = (p, c) => { if (c) out.push(`<meta property="${p}" content="${escapeAttr(c)}">`); };

    nameTag('description', meta.description);
    if (meta.keywords?.length) nameTag('keywords', meta.keywords.join(', '));
    nameTag('robots', meta.robots);
    // Googlebot hereda de `robots`; se declara aparte sólo porque algunos
    // validadores lo piden explícito y no cuesta nada.
    nameTag('googlebot', meta.robots);
    if (meta.themeColor) nameTag('theme-color', meta.themeColor);

    propTag('og:type', meta.ogType);
    propTag('og:title', meta.socialTitle || meta.title);
    propTag('og:description', meta.description);
    propTag('og:url', meta.canonical);
    propTag('og:site_name', meta.siteName);
    propTag('og:locale', meta.locale);
    if (meta.image) {
        propTag('og:image', meta.image);
        // `og:image:secure_url` es lo que mira WhatsApp en algunas versiones.
        propTag('og:image:secure_url', meta.image);
        propTag('og:image:alt', meta.socialTitle || meta.title);
    }
    if (meta.ogType === 'article') {
        if (meta.publishedAt) propTag('article:published_time', new Date(meta.publishedAt).toISOString());
        if (meta.updatedAt) propTag('article:modified_time', new Date(meta.updatedAt).toISOString());
    }

    // Twitter usa `name`, no `property`. Ponerlo con `property` es el error
    // clásico: la tarjeta cae al formato pequeño sin decir por qué.
    nameTag('twitter:card', meta.twitterCard);
    nameTag('twitter:title', meta.socialTitle || meta.title);
    nameTag('twitter:description', meta.description);
    if (meta.image) nameTag('twitter:image', meta.image);
    if (meta.twitterSite) nameTag('twitter:site', meta.twitterSite);

    if (meta.geo) {
        nameTag('geo.placename', meta.geo.placename);
        nameTag('geo.region', meta.geo.region);
        nameTag('geo.position', meta.geo.position);
        nameTag('ICBM', meta.geo.position ? meta.geo.position.replace(';', ', ') : null);
    }

    return out;
}

// ── Retirada de lo que ya hubiera ────────────────────────────────────────────
// Es el corazón del arreglo. Se quitan por NOMBRE las etiquetas que vamos a
// escribir; el resto del <head> (tipografías, precargas, el favicon) se
// conserva intacto.
//
// Las expresiones toleran comillas simples o dobles y cualquier orden de los
// atributos, porque el HTML de partida lo escribe una persona y no un
// generador.
const MANAGED_NAMES = [
    'description', 'keywords', 'robots', 'googlebot', 'theme-color',
    'twitter:card', 'twitter:title', 'twitter:description', 'twitter:image',
    'twitter:site', 'twitter:url', 'twitter:creator',
    'geo.placename', 'geo.region', 'geo.position', 'ICBM',
];
const MANAGED_PROPS = [
    'og:type', 'og:title', 'og:description', 'og:url', 'og:site_name',
    'og:locale', 'og:image', 'og:image:secure_url', 'og:image:alt',
    'og:image:width', 'og:image:height',
    'article:published_time', 'article:modified_time',
];

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

export function stripManagedTags(html) {
    let out = html;
    for (const n of MANAGED_NAMES) {
        out = out.replace(
            new RegExp(`\\s*<meta\\b[^>]*\\bname\\s*=\\s*["']${escapeRe(n)}["'][^>]*>`, 'gi'),
            '',
        );
    }
    for (const p of MANAGED_PROPS) {
        out = out.replace(
            new RegExp(`\\s*<meta\\b[^>]*\\bproperty\\s*=\\s*["']${escapeRe(p)}["'][^>]*>`, 'gi'),
            '',
        );
    }
    // Canonical, alternate y el JSON-LD que hubiéramos puesto en una pasada
    // anterior. `hreflang` se retira entero porque se reescribe entero.
    out = out.replace(/\s*<link\b[^>]*\brel\s*=\s*["']canonical["'][^>]*>/gi, '');
    out = out.replace(/\s*<link\b[^>]*\brel\s*=\s*["']alternate["'][^>]*\bhreflang\b[^>]*>/gi, '');
    out = out.replace(/\s*<script\b[^>]*\bid\s*=\s*["']seo-jsonld["'][\s\S]*?<\/script>/gi, '');
    out = out.replace(/\s*<script\b[^>]*\btype\s*=\s*["']application\/ld\+json["'][\s\S]*?<\/script>/gi, '');
    return out;
}

// ── El pintado completo ──────────────────────────────────────────────────────
// Recibe el `index.html` construido por Vite y devuelve el mismo documento con
// el <head> correcto para ESTA dirección.
//
// `<html lang>` se reescribe también: lo usan el lector de pantalla, el
// corrector del navegador y el propio buscador para saber en qué idioma está la
// página. Dejarlo fijo en es-CO mientras el contenido se sirve en otro idioma es
// una contradicción que el módulo de traducción ya resolvió en el navegador; acá
// se resuelve para quien no ejecuta JavaScript, que es justo el caso de los
// rastreadores de las redes sociales.
export function renderHead({ html, page, club, origin, config = {}, overrides = {}, faqs = [], alternates = [] }) {
    const meta = buildMetaSet({ page, club, origin, config, overrides });
    let out = stripManagedTags(html);

    const tags = renderMetaTags(meta);
    tags.push(`<link rel="canonical" href="${escapeAttr(meta.canonical)}">`);

    for (const alt of alternates) {
        if (alt?.hreflang && alt?.href) {
            tags.push(`<link rel="alternate" hreflang="${escapeAttr(alt.hreflang)}" href="${escapeAttr(alt.href)}">`);
        }
    }

    const jsonLd = buildJsonLd({ page, club, origin, config, faqs });
    if (jsonLd) {
        tags.push(`<script type="application/ld+json" id="seo-jsonld">${escapeJsonLd(jsonLd)}</script>`);
    }

    // El <title> se reemplaza; si el documento no tuviera ninguno, se crea.
    const titleTag = `<title>${escapeAttr(meta.title)}</title>`;
    out = /<title\b[^>]*>[\s\S]*?<\/title>/i.test(out)
        ? out.replace(/<title\b[^>]*>[\s\S]*?<\/title>/i, titleTag)
        : out.replace(/<head\b([^>]*)>/i, `<head$1>\n    ${titleTag}`);

    out = out.replace(/<html\b([^>]*)\blang\s*=\s*["'][^"']*["']/i, `<html$1lang="${escapeAttr(meta.language)}"`);

    const block = `\n    <!-- SEO Inteligente — etiquetas resueltas en el servidor para ${escapeAttr(page.path)} -->\n    ${tags.join('\n    ')}\n  `;
    out = out.includes('</head>')
        ? out.replace('</head>', `${block}</head>`)
        : out + block;

    return { html: out, meta, jsonLd };
}

export default { composeTitle, buildMetaSet, renderMetaTags, stripManagedTags, renderHead };
