// ════════════════════════════════════════════════════════════════════════════
// SEO Inteligente — DATOS ESTRUCTURADOS (JSON-LD)
//
// Traduce una entidad ya resuelta a Schema.org. Es lo que habilita los
// resultados enriquecidos: la fecha y el lugar de un evento, las migas de pan en
// vez de la dirección cruda, el precio de un producto.
//
// REGLA DURABLE — **no se declara lo que no se sabe.** Un campo obligatorio de
// Schema.org que rellenamos con un valor inventado no es un dato incompleto: es
// una declaración falsa, y Google penaliza el desajuste entre lo que dice el
// JSON-LD y lo que se ve en la página. Por eso cada generador CONSTRUYE el
// objeto campo a campo y omite lo que falta, en vez de partir de una plantilla
// con huecos rellenos. Un `Event` sin fecha no se emite; se prefiere no tener
// dato estructurado a tener uno que miente.
//
// Es el mismo criterio que el resto de la plataforma: un cero es una afirmación,
// un hueco es la verdad.
// ════════════════════════════════════════════════════════════════════════════

import { stripHtml, truncateAtWord, LIMITS } from './seoSpec.js';

// Quita las claves vacías de forma recursiva. Es lo que hace cumplir la regla de
// arriba sin repetir un `if` por campo.
function prune(obj) {
    if (Array.isArray(obj)) {
        const arr = obj.map(prune).filter(v => v !== undefined && v !== null && v !== '');
        return arr.length ? arr : undefined;
    }
    if (obj && typeof obj === 'object' && !(obj instanceof Date)) {
        const out = {};
        for (const [k, v] of Object.entries(obj)) {
            const clean = prune(v);
            if (clean !== undefined && clean !== null && clean !== '') out[k] = clean;
        }
        return Object.keys(out).length ? out : undefined;
    }
    if (obj instanceof Date) return isNaN(obj.getTime()) ? undefined : obj.toISOString();
    return obj;
}

function absolute(url, origin) {
    if (!url) return undefined;
    const u = String(url).trim();
    if (/^https?:\/\//i.test(u)) return u;
    if (u.startsWith('//')) return 'https:' + u;
    return origin.replace(/\/$/, '') + (u.startsWith('/') ? u : '/' + u);
}

// ── Organización ─────────────────────────────────────────────────────────────
// El nodo raíz del sitio. Todo lo demás lo referencia con `@id`, que es como
// Schema.org expresa "el autor de esto es ESA organización" sin repetir el
// bloque entero en cada página.
export function organizationNode({ club, origin, config = {} }) {
    const id = `${origin}/#organization`;
    // `LocalBusiness` sólo si hay dirección de verdad. Declararlo sin dirección
    // es pedir una ficha local que no se puede sostener.
    const hasAddress = Boolean(club?.city || club?.country);
    const type = config.localBusiness && hasAddress
        ? ['Organization', 'LocalBusiness']
        : ['Organization', 'NGO'];

    return prune({
        '@type': type,
        '@id': id,
        name: club?.name,
        alternateName: config.alternateName,
        url: origin,
        logo: absolute(club?.logo, origin),
        image: absolute(club?.logo, origin),
        description: club?.description,
        email: config.email,
        telephone: config.phone,
        vatID: config.taxId, // NIT
        address: hasAddress ? {
            '@type': 'PostalAddress',
            streetAddress: config.streetAddress,
            addressLocality: club?.city,
            addressRegion: config.region || club?.district,
            addressCountry: club?.country,
            postalCode: config.postalCode,
        } : undefined,
        geo: (config.lat && config.lng) ? {
            '@type': 'GeoCoordinates', latitude: config.lat, longitude: config.lng,
        } : undefined,
        openingHours: config.openingHours,
        // `sameAs` son los perfiles oficiales. Es lo que ata el sitio a sus redes
        // a ojos del buscador.
        sameAs: (config.socialProfiles || []).filter(Boolean),
        parentOrganization: config.declareRotaryParent === false ? undefined : {
            '@type': 'Organization',
            name: 'Rotary International',
            url: 'https://www.rotary.org',
        },
    });
}

// ── El sitio y su buscador interno ───────────────────────────────────────────
export function webSiteNode({ club, origin, config = {} }) {
    return prune({
        '@type': 'WebSite',
        '@id': `${origin}/#website`,
        url: origin,
        name: club?.name,
        description: club?.description,
        publisher: { '@id': `${origin}/#organization` },
        inLanguage: config.language || 'es-CO',
        // SearchAction sólo si el sitio TIENE buscador con dirección propia.
        // Declararlo sin buscador da una caja de búsqueda en el resultado que no
        // lleva a ninguna parte.
        potentialAction: config.searchUrl ? {
            '@type': 'SearchAction',
            target: { '@type': 'EntryPoint', urlTemplate: `${config.searchUrl}{search_term_string}` },
            'query-input': 'required name=search_term_string',
        } : undefined,
    });
}

// ── Migas de pan ─────────────────────────────────────────────────────────────
export function breadcrumbNode({ trail, origin }) {
    if (!trail?.length) return undefined;
    return prune({
        '@type': 'BreadcrumbList',
        itemListElement: trail.map((step, i) => ({
            '@type': 'ListItem',
            position: i + 1,
            name: step.name,
            item: step.path ? absolute(step.path, origin) : undefined,
        })),
    });
}

// Construye la ruta de migas a partir de la dirección. Es determinista y no
// necesita que nadie la escriba a mano.
export function breadcrumbTrail({ page, club }) {
    const trail = [{ name: club?.name || 'Inicio', path: '/' }];
    const segments = page.path.split('/').filter(Boolean);
    if (!segments.length) return [];
    const INDEX_LABEL = {
        blog: 'Blog', proyectos: 'Proyectos', eventos: 'Eventos', shop: 'Tienda',
    };
    const first = segments[0];
    if (INDEX_LABEL[first]) trail.push({ name: INDEX_LABEL[first], path: `/${first}` });
    if (segments.length > 1) trail.push({ name: page.title, path: page.path });
    else if (!INDEX_LABEL[first]) trail.push({ name: page.title, path: page.path });
    return trail;
}

// ── Artículo / noticia ───────────────────────────────────────────────────────
export function articleNode({ page, club, origin, config = {} }) {
    const post = page.entity || {};
    return prune({
        '@type': post.category === 'noticia' ? 'NewsArticle' : 'BlogPosting',
        '@id': `${page.url}#article`,
        headline: truncateAtWord(page.title, 110), // Google descarta headlines > 110
        description: page.description,
        image: absolute(page.image, origin),
        datePublished: page.publishedAt,
        dateModified: page.updatedAt || page.publishedAt,
        author: config.authorName
            ? { '@type': 'Person', name: config.authorName }
            : { '@id': `${origin}/#organization` },
        publisher: { '@id': `${origin}/#organization` },
        mainEntityOfPage: { '@type': 'WebPage', '@id': page.url },
        inLanguage: config.language || 'es-CO',
        keywords: page.keywords?.length ? page.keywords.join(', ') : undefined,
        articleSection: post.category,
        wordCount: page.wordCount || undefined,
    });
}

// ── Evento ───────────────────────────────────────────────────────────────────
// `startDate` es obligatorio en Schema.org. Sin él NO se emite el nodo: un
// Event sin fecha se rechaza en el validador y no produce ningún resultado
// enriquecido, así que emitirlo sólo añade ruido.
export function eventNode({ page, club, origin, config = {} }) {
    const ev = page.entity;
    if (!ev?.startDate) return undefined;

    const isOnline = /online|virtual|zoom|meet|teams/i.test(ev.location || '');
    return prune({
        '@type': 'Event',
        '@id': `${page.url}#event`,
        name: ev.title,
        description: page.description,
        image: absolute(page.image, origin),
        startDate: ev.startDate,
        endDate: ev.endDate || undefined,
        eventStatus: 'https://schema.org/EventScheduled',
        eventAttendanceMode: isOnline
            ? 'https://schema.org/OnlineEventAttendanceMode'
            : 'https://schema.org/OfflineEventAttendanceMode',
        location: isOnline
            ? { '@type': 'VirtualLocation', url: page.url }
            : ev.location
                ? {
                    '@type': 'Place',
                    name: ev.location,
                    address: {
                        '@type': 'PostalAddress',
                        addressLocality: club?.city,
                        addressCountry: club?.country,
                    },
                }
                : undefined,
        organizer: { '@id': `${origin}/#organization` },
        // No se declara `offers`: el módulo de inscripciones tiene su propio
        // precio por categoría y por moneda, y publicar uno solo acá sería
        // contradecir la tabla de precios que el visitante ve al inscribirse.
    });
}

// ── Proyecto ─────────────────────────────────────────────────────────────────
// Schema.org no tiene un tipo "Proyecto social". `Project` existe pero apenas
// produce resultado enriquecido; se emite igual porque describe la entidad con
// precisión, y se acompaña de `WebPage` para que la página tenga tipo propio.
export function projectNode({ page, club, origin }) {
    const p = page.entity || {};
    return prune({
        '@type': 'Project',
        '@id': `${page.url}#project`,
        name: p.title,
        description: page.description,
        image: absolute(page.image, origin),
        url: page.url,
        founder: { '@id': `${origin}/#organization` },
        parentOrganization: { '@id': `${origin}/#organization` },
        areaServed: p.ubicacion || club?.city || undefined,
        dateCreated: p.createdAt,
        // El objetivo de recaudación se declara sólo si existe. Un `0` acá se
        // leería como "meta cero", que es una afirmación falsa.
        ...(p.meta > 0 ? {
            funding: {
                '@type': 'MonetaryGrant',
                amount: { '@type': 'MonetaryAmount', value: p.meta, currency: 'COP' },
            },
        } : {}),
    });
}

// ── Producto ─────────────────────────────────────────────────────────────────
export function productNode({ page, origin }) {
    const p = page.entity || {};
    return prune({
        '@type': 'Product',
        '@id': `${page.url}#product`,
        name: p.name,
        description: page.description,
        image: (p.images || []).map(i => absolute(i, origin)),
        sku: p.id,
        offers: p.price != null ? {
            '@type': 'Offer',
            price: p.price,
            priceCurrency: p.currency || 'USD',
            availability: p.status === 'active'
                ? 'https://schema.org/InStock'
                : 'https://schema.org/OutOfStock',
            url: page.url,
        } : undefined,
    });
}

// ── Preguntas frecuentes ─────────────────────────────────────────────────────
// Sólo se emite si las preguntas están VISIBLES en la página. Google exige que
// el contenido del FAQPage sea el mismo que ve el usuario; declarar preguntas
// ocultas es motivo de acción manual.
export function faqNode({ faqs, url }) {
    const clean = (faqs || [])
        .filter(f => f?.question && f?.answer)
        .slice(0, 20);
    if (!clean.length) return undefined;
    return prune({
        '@type': 'FAQPage',
        '@id': `${url}#faq`,
        mainEntity: clean.map(f => ({
            '@type': 'Question',
            name: stripHtml(f.question),
            acceptedAnswer: { '@type': 'Answer', text: stripHtml(f.answer) },
        })),
    });
}

// ── Página genérica ──────────────────────────────────────────────────────────
function webPageNode({ page, origin, config = {} }) {
    return prune({
        '@type': page.kind === 'about' ? 'AboutPage'
            : page.kind === 'contact' ? 'ContactPage'
                : page.kind === 'blog_index' ? 'Blog'
                    : ['projects_index', 'events_index', 'shop_index'].includes(page.kind) ? 'CollectionPage'
                        : 'WebPage',
        '@id': `${page.url}#webpage`,
        url: page.url,
        name: page.title,
        description: page.description,
        isPartOf: { '@id': `${origin}/#website` },
        about: { '@id': `${origin}/#organization` },
        inLanguage: config.language || 'es-CO',
        dateModified: page.updatedAt || undefined,
        primaryImageOfPage: page.image ? absolute(page.image, origin) : undefined,
    });
}

// ── Ensamblado ───────────────────────────────────────────────────────────────
// Devuelve UN solo `@graph` con todos los nodos de la página.
//
// Por qué un grafo y no varios <script> sueltos: con `@graph` los nodos se
// referencian entre sí por `@id` —el artículo apunta a la organización, la
// página al sitio— y el buscador entiende que son la misma entidad en vez de
// tres organizaciones distintas repetidas por página.
export function buildJsonLd({ page, club, origin, config = {}, faqs = [] }) {
    if (!page?.indexable || page.found === false) return null;

    const nodes = [
        organizationNode({ club, origin, config }),
        webSiteNode({ club, origin, config }),
    ];

    if (page.kind !== 'home') nodes.push(webPageNode({ page, origin, config }));

    if (page.kind === 'post') nodes.push(articleNode({ page, club, origin, config }));
    else if (page.kind === 'event') nodes.push(eventNode({ page, club, origin, config }));
    else if (page.kind === 'project') nodes.push(projectNode({ page, club, origin }));
    else if (page.kind === 'product') nodes.push(productNode({ page, origin }));

    const trail = breadcrumbTrail({ page, club });
    if (trail.length > 1) nodes.push(breadcrumbNode({ trail, origin }));

    const faq = faqNode({ faqs, url: page.url });
    if (faq) nodes.push(faq);

    const clean = nodes.filter(Boolean);
    if (!clean.length) return null;
    return { '@context': 'https://schema.org', '@graph': clean };
}

// Qué tipo LE TOCA a esta página. Lo usa la auditoría para detectar un Schema
// del tipo equivocado sin repetir el criterio de arriba.
export function expectedSchemaTypes(kind) {
    const map = {
        home: ['Organization', 'WebSite'],
        post: ['BlogPosting', 'NewsArticle'],
        event: ['Event'],
        project: ['Project'],
        product: ['Product'],
        about: ['AboutPage'],
        contact: ['ContactPage'],
        blog_index: ['Blog'],
        projects_index: ['CollectionPage'],
        events_index: ['CollectionPage'],
        shop_index: ['CollectionPage'],
        generic: ['WebPage'],
    };
    return map[kind] || ['WebPage'];
}

export default {
    organizationNode, webSiteNode, breadcrumbNode, breadcrumbTrail, articleNode,
    eventNode, projectNode, productNode, faqNode, buildJsonLd, expectedSchemaTypes,
};
