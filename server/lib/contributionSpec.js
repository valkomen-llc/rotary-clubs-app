// ════════════════════════════════════════════════════════════════════
// Campañas de Contribución — el CRITERIO
// v4.803.0
//
// «Maneras de Contribuir» deja de ser una página rígida: una CAMPAÑA
// configurada desde el Administrador Central puede tomar la página en los
// sitios a los que apunte, y sin campaña activa la página genérica se pinta
// exactamente igual que siempre (el fallback ES el rollout).
//
// Este archivo es PURO: sin base, sin red, sin IA, sin reloj propio — toda
// función que dependa del tiempo recibe `now` como parámetro, igual que
// `yearsSince` en designSpec. Por eso se puede probar entero con
// `npm run test:contribution`, y por eso la orquestación (controller) no
// contiene criterio.
//
// Decisiones que viven acá y conviene no mover:
//
// - LA CAMPAÑA ES UNA REFERENCIA, NO UN CLON. Todos los sitios comparten una
//   base: la campaña es una fila y cada sitio la resuelve al leer. El
//   ecosistema del Distrito (v4.747) eligió clonar porque aquellos contenidos
//   son DEL CLUB de origen y el clon da autonomía editorial; una campaña es DE
//   LA PLATAFORMA y corregir una cifra debe reflejarse en todos los sitios al
//   instante. Clonar reintroduciría exactamente la divergencia que el pedido
//   prohíbe.
//
// - EL ESTADO EFECTIVO SE DERIVA, NO SE EMPUJA. `scheduled` con `startAt`
//   vencido se sirve como activa y `active` con `endAt` vencido como
//   finalizada, calculado al leer. Sin cron y sin carreras — el patrón
//   «observar, no empujar» del CRM.
//
// - UN INDICADOR SIN FUENTE NO SE PUBLICA. `source` y `updatedAt` son
//   obligatorios por indicador y lo decide el CÓDIGO al publicar, no la
//   pantalla. Es la capa 3 de emergencySpec: el administrador escribe, el
//   código decide. En una campaña que pide dinero a nombre de una institución,
//   una cifra sin respaldo no es un descuido — es una afirmación falsa.
//
// - LA FRONTERA DE LO LOCAL ES ESTRUCTURAL. El override de un club sólo puede
//   expresar las claves de OVERRIDE_WHITELIST: lo que no está en la lista no
//   se puede ni mandar (patrón stripProtected / applyPublicValues). Una
//   sobrescritura local no puede apagar contenido central ni romper la campaña.
// ════════════════════════════════════════════════════════════════════

import { DISASTER_TYPES } from './emergencySpec.js';
import { parseDistrictTags } from './districtEcosystem.js';
import { normalizeSubmissionsConfig } from './contentSubmissionSpec.js';
import { parseDelimitedText } from './completedImportSpec.js';

// ─── Tipos de campaña ──────────────────────────────────────────────────────
//
// Los desastres salen del catálogo que la plataforma YA tiene (emergencySpec,
// Creador de Reels): dos listas de desastres se separan en silencio. Los
// institucionales son propios de este módulo. El catálogo es CERRADO salvo
// `otro` — la misma regla que «Mi club no está en la lista» (v4.706).
const INSTITUTIONAL_TYPES = {
    humanitaria: { id: 'humanitaria', label: 'Emergencia humanitaria' },
    social: { id: 'social', label: 'Proyecto social' },
    salud: { id: 'salud', label: 'Campaña de salud' },
    agua: { id: 'agua', label: 'Agua y saneamiento' },
    educacion: { id: 'educacion', label: 'Educación' },
    alimentacion: { id: 'alimentacion', label: 'Alimentación' },
    reconstruccion: { id: 'reconstruccion', label: 'Reconstrucción' },
    fondo: { id: 'fondo', label: 'Fondo especial' },
    internacional: { id: 'internacional', label: 'Campaña internacional' },
    otro: { id: 'otro', label: 'Otra campaña' },
};

export const CAMPAIGN_TYPES = {
    // `otro` de los desastres se excluye a propósito: este catálogo ya cierra
    // con su propio `otro` genérico, y dos claves iguales harían que el spread
    // decidiera en silencio cuál gana.
    ...Object.fromEntries(Object.values(DISASTER_TYPES).filter(d => d.id !== 'otro').map(d => [
        d.id, { id: d.id, label: d.label, emergency: true },
    ])),
    ...Object.fromEntries(Object.values(INSTITUTIONAL_TYPES).map(t => [
        t.id, { id: t.id, label: t.label, emergency: false },
    ])),
};

export const DEFAULT_CAMPAIGN_TYPE = 'otro';

export const campaignTypeCatalog = () => Object.values(CAMPAIGN_TYPES);

// ─── Estados ───────────────────────────────────────────────────────────────
//
// Lo GUARDADO es la decisión del operador; lo EFECTIVO es lo que ve el
// visitante, derivado con el reloj. Guardar «activa a partir del lunes» como
// un estado que alguien tiene que venir a mover el lunes es un cron
// disfrazado de dato.
export const CAMPAIGN_STATUSES = ['draft', 'scheduled', 'active', 'paused', 'finished', 'archived'];

export const STATUS_LABELS = {
    draft: 'Borrador',
    scheduled: 'Programada',
    active: 'Activa',
    paused: 'Pausada',
    finished: 'Finalizada',
    archived: 'Archivada',
};

// Transiciones legítimas. `archived` es terminal salvo volver a borrador
// (recuperar una campaña vieja para reutilizarla es un caso real).
const STATUS_FLOW = {
    draft: ['scheduled', 'active', 'archived'],
    scheduled: ['draft', 'active', 'paused', 'archived'],
    active: ['paused', 'finished', 'archived'],
    paused: ['active', 'finished', 'archived'],
    finished: ['archived', 'draft'],
    archived: ['draft'],
};

export const canTransition = (from, to) =>
    Array.isArray(STATUS_FLOW[from]) && STATUS_FLOW[from].includes(to);

/**
 * El estado EFECTIVO de una campaña en un instante dado.
 * - `scheduled` con startAt vencido → activa (y con endAt vencido → finalizada).
 * - `active` con endAt vencido → finalizada; con startAt futuro → programada
 *   (publicar antes de tiempo no adelanta la fecha).
 * - `paused`, `draft`, `finished`, `archived` no se mueven solos: son
 *   decisiones del operador, no estados del calendario.
 */
export function effectiveStatus(campaign, now = null) {
    const status = String(campaign?.status || 'draft');
    if (!CAMPAIGN_STATUSES.includes(status)) return 'draft';
    if (status !== 'scheduled' && status !== 'active') return status;
    if (!(now instanceof Date)) throw new Error('effectiveStatus necesita `now` (regla de pureza)');

    const startAt = campaign?.startAt ? new Date(campaign.startAt) : null;
    const endAt = campaign?.endAt ? new Date(campaign.endAt) : null;

    if (endAt && !Number.isNaN(endAt.getTime()) && now >= endAt) return 'finished';
    if (startAt && !Number.isNaN(startAt.getTime()) && now < startAt) return 'scheduled';
    return 'active';
}

/** ¿Se sirve al público en este instante? */
export const isServable = (campaign, now) => effectiveStatus(campaign, now) === 'active';

// ─── Targeting multi-sitio ─────────────────────────────────────────────────
//
// `all` — todos los sitios que tengan la página; `districts` — los sitios que
// pertenezcan a alguno de los distritos listados; `clubs` — sitios explícitos.
// La pertenencia a un distrito usa EL MISMO criterio doble de v4.744/v4.748:
// la clave foránea `districtId` O el número dentro de `Club.district`, que es
// una LISTA («4271, 4281») y se parte con parseDistrictTags. Un solo criterio
// deja fuera a la mitad de los sitios — error ya pagado dos veces.
export const TARGETING_MODES = ['all', 'districts', 'clubs'];

export function normalizeTargeting(raw = {}) {
    const mode = TARGETING_MODES.includes(raw?.mode) ? raw.mode : 'clubs';
    const districts = Array.isArray(raw?.districts)
        ? [...new Set(raw.districts.map(d => String(d).trim()).filter(d => /^\d{3,5}$/.test(d)))]
        : [];
    const clubIds = Array.isArray(raw?.clubIds)
        ? [...new Set(raw.clubIds.map(c => String(c).trim()).filter(Boolean))]
        : [];
    return { mode, districts, clubIds };
}

/**
 * ¿La campaña apunta a este sitio?
 * `site` = { id, districtId?, district? } — la forma en que ya viaja un club.
 */
export function targetsSite(targeting, site) {
    const t = normalizeTargeting(targeting);
    if (!site?.id) return false;
    if (t.mode === 'all') return true;
    if (t.mode === 'clubs') return t.clubIds.includes(String(site.id));
    // districts: clave foránea O número en la lista de `district`.
    const tags = parseDistrictTags(site.district);
    return t.districts.some(d =>
        (site.districtId != null && String(site.districtId) === d) || tags.includes(d)
    );
}

/**
 * De varias campañas que apuntan al mismo sitio gana UNA — nunca se decide en
 * silencio: prioridad explícita, desempate por publicación más reciente y por
 * id para que el orden sea estable (misma regla que pickDistrictSite: si
 * dependiera del orden de la base, el mismo sitio vería una campaña distinta
 * en cada visita).
 */
export function pickCampaignForSite(campaigns, site, now) {
    const candidates = (Array.isArray(campaigns) ? campaigns : [])
        .filter(c => isServable(c, now) && targetsSite(c.targeting, site));
    if (candidates.length === 0) return null;
    return candidates.sort((a, b) =>
        (Number(b.priority) || 0) - (Number(a.priority) || 0)
        || new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime()
        || String(a.id).localeCompare(String(b.id))
    )[0];
}

// ─── Contenido ─────────────────────────────────────────────────────────────
//
// El contenido es un DOCUMENTO (JSONB que se lee y escribe entero, como el
// grafo de un recorrido del CRM): normalizarlo a columnas obligaría a migrar
// el esquema con cada sección nueva. `normalizeContent` da forma y tolera
// campos faltantes — nunca inventa textos.
export const SECTION_IDS = [
    'hero', 'donateCard', 'waysToHelp', 'requiredItems',
    'centers', 'stats', 'infoBlocks', 'finalCta', 'partners',
];

const str = (v, max = 4000) => (typeof v === 'string' ? v.slice(0, max) : '');
const bool = v => v === true;
const arr = v => (Array.isArray(v) ? v : []);

/** Tope de imágenes del hero. El de la portada muestra cinco por omisión. */
export const HERO_MAX_SLIDES = 8;

/** Cada cuántos milisegundos se cambia de imagen. El mismo de la portada. */
export const HERO_SLIDE_MS = 5000;

/**
 * Las imágenes que le tocan al hero, en orden.
 *
 * Es el ÚNICO punto donde se decide si manda `images` o la `image` de
 * siempre, por el mismo motivo que `animationSourceOf` en el Creador de
 * Reels: con la decisión escrita en dos lados —el editor y la página—, una
 * campaña se vería distinta según quién la resuelva.
 *
 * Devuelve [] cuando no hay ninguna: el hero cae a su fondo liso, que es
 * exactamente lo que hacía antes.
 */
export function heroSlides(hero = {}) {
    const list = arr(hero?.images)
        .map(im => ({ url: String(im?.url ?? '').trim(), alt: String(im?.alt ?? '') }))
        .filter(im => im.url)
        .slice(0, HERO_MAX_SLIDES);
    if (list.length) return list;
    const single = String(hero?.image ?? '').trim();
    return single ? [{ url: single, alt: String(hero?.imageAlt ?? '') }] : [];
}

const normalizeCta = (raw = {}) => ({
    label: str(raw?.label, 80),
    // El destino sólo puede ser http(s) o ruta interna — el mismo cierre que
    // las redirecciones (v4.781): esto termina en un href de página pública.
    url: acceptableCtaUrl(raw?.url) ? String(raw.url).trim() : '',
    action: ['donate', 'centers', 'link', 'share'].includes(raw?.action) ? raw.action : 'link',
});

export function acceptableCtaUrl(url) {
    const s = String(url ?? '').trim();
    if (!s) return false;
    if (/^https?:\/\//i.test(s)) return true;
    if (s.startsWith('//')) return false;   // parece interno, el navegador lo trata como externo
    if (s.startsWith('/')) return true;
    return false;
}

/**
 * El video de una sección: qué es y cómo se pinta.
 *
 * Se admiten TRES formas y ninguna más:
 *   - YouTube  → `<iframe>` a youtube-nocookie
 *   - Vimeo    → `<iframe>` al reproductor
 *   - archivo  → `<video controls>` (mp4/webm/ogg), típicamente subido a la
 *                Biblioteca Multimedia
 *
 * El cierre de anfitriones NO es un capricho: un `<iframe>` se dibuja en una
 * página pública, así que aceptar cualquier dirección convertiría un campo de
 * texto del panel en un hueco por donde meter cualquier cosa en el sitio. Es
 * exactamente la regla del mapa de la sede (v4.717) y la de las
 * redirecciones (v4.781). Se exige `https:` por lo mismo.
 *
 * Devuelve `null` cuando no se reconoce: sin nada que dibujar es mejor no
 * pintar nada que dejar un recuadro roto (v4.650).
 */
export function resolveCampaignVideo(raw) {
    const value = String(raw ?? '').trim();
    if (!value) return null;

    // Del `<iframe …>` completo se toma el `src`: pedirle a quien configura
    // que recorte el atributo a mano es pedirle que edite HTML (v4.717).
    const fromIframe = /<iframe[^>]*\ssrc=["']([^"']+)["']/i.exec(value);
    const candidate = (fromIframe ? fromIframe[1] : value).trim();

    let url;
    try { url = new URL(candidate); } catch { return null; }
    if (url.protocol !== 'https:') return null;
    const host = url.hostname.toLowerCase().replace(/^www\./, '');

    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtube-nocookie.com') {
        const id = url.searchParams.get('v')
            || (/^\/(embed|shorts|live|v)\/([\w-]{6,})/.exec(url.pathname)?.[2] || '');
        // `-nocookie` no es cosmético: evita las cookies de seguimiento de
        // YouTube en una página institucional.
        return id ? { kind: 'youtube', src: `https://www.youtube-nocookie.com/embed/${id}` } : null;
    }
    if (host === 'youtu.be') {
        const id = url.pathname.slice(1).split('/')[0];
        return id ? { kind: 'youtube', src: `https://www.youtube-nocookie.com/embed/${id}` } : null;
    }
    if (host === 'vimeo.com' || host === 'player.vimeo.com') {
        const id = /(\d{6,})/.exec(url.pathname)?.[1] || '';
        return id ? { kind: 'vimeo', src: `https://player.vimeo.com/video/${id}` } : null;
    }
    if (/\.(mp4|webm|ogg|ogv|mov)$/i.test(url.pathname)) {
        return { kind: 'file', src: url.toString() };
    }
    return null;
}

/** Tope de videos por sección. El mismo que el hero: más no se recorre. */
export const MAX_SECTION_VIDEOS = 8;

/**
 * La miniatura de una pieza de video, cuando se puede saber sin llamar a
 * nadie. YouTube publica una dirección fija por id; Vimeo no la tiene sin
 * consultar su API, así que ahí se devuelve '' y la tarjeta se pinta con su
 * carátula genérica. Un archivo propio muestra su primer fotograma solo.
 */
export function videoThumb(video) {
    if (!video || video.kind !== 'youtube') return '';
    const id = /\/embed\/([\w-]+)/.exec(video.src)?.[1];
    return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : '';
}

/** Tope de piezas de la galería. Es un muestrario, no un archivo histórico. */
export const MAX_GALLERY_ITEMS = 24;

/** Cada cuánto pasa SOLA la galería. Más lento que el hero: acá se mira. */
export const GALLERY_SLIDE_MS = 6000;

/**
 * Las piezas de la galería, resueltas y en orden.
 *
 * El TIPO se DERIVA, no se guarda: si la dirección la reconoce
 * `resolveCampaignVideo` es un video; si no, se trata como imagen. Guardar el
 * tipo aparte daría dos verdades sobre lo mismo y se contradirían en cuanto
 * alguien cambie la URL de una fila — el error que ya se evitó con `publicKeyOf`
 * en Plantillas IA.
 *
 * Una fila sin dirección se descarta acá: la flecha «siguiente» no puede
 * llevar a un recuadro vacío, igual que en `sectionVideos`.
 */
export function galleryItems(list) {
    return arr(list)
        .slice(0, MAX_GALLERY_ITEMS)
        .map(it => {
            const url = String(it?.url ?? '').trim();
            const video = resolveCampaignVideo(url);
            return {
                url,
                kind: video ? 'video' : 'image',
                src: video ? video.src : url,
                // El video propio se reproduce con `<video>` y el embebido en
                // `<iframe>`: la pantalla necesita saber cuál de los dos.
                player: video ? video.kind : null,
                thumb: video ? videoThumb(video) : url,
                caption: String(it?.caption ?? ''),
                credit: String(it?.credit ?? ''),
                alt: String(it?.alt ?? ''),
            };
        })
        .filter(it => it.url);
}

/**
 * Los videos de una sección, ya resueltos y en orden.
 *
 * Es el ÚNICO punto que decide si mandan los VARIOS (`requiredItemsVideos`) o
 * el de siempre (`requiredItemsVideo`), por el mismo motivo que `heroSlides`:
 * con la decisión escrita en el editor y otra vez en la página, una campaña se
 * vería distinta según quién la resuelva.
 *
 * Los que no se reconocen se DESCARTAN acá: la flecha «siguiente» no puede
 * llevar a un recuadro vacío. Devuelve `[{ url, title, poster, video }]`.
 */
export function sectionVideos(list, single) {
    const crudos = arr(list).length
        ? arr(list)
        : (single && String(single.url ?? '').trim() ? [single] : []);
    return crudos
        .slice(0, MAX_SECTION_VIDEOS)
        .map(v => ({
            url: String(v?.url ?? '').trim(),
            title: String(v?.title ?? ''),
            poster: String(v?.poster ?? ''),
            video: resolveCampaignVideo(v?.url),
        }))
        .filter(v => v.video);
}

export function normalizeContent(raw = {}) {
    const c = raw && typeof raw === 'object' ? raw : {};
    return {
        hero: {
            title: str(c.hero?.title, 160),
            subtitle: str(c.hero?.subtitle, 300),
            text: str(c.hero?.text, 1200),
            highlight: str(c.hero?.highlight, 160),
            image: str(c.hero?.image, 600),
            imageAlt: str(c.hero?.imageAlt, 200),
            // Varias imágenes que se van turnando, igual que el hero de la
            // portada. `image`/`imageAlt` se CONSERVAN: es la regla aditiva
            // del sitio —una campaña guardada con una sola imagen se sigue
            // viendo igual— y `heroSlides` es quien resuelve cuál manda.
            images: arr(c.hero?.images).slice(0, HERO_MAX_SLIDES)
                .map(im => ({ url: str(im?.url, 600), alt: str(im?.alt, 200) }))
                .filter(im => im.url),
            badge: str(c.hero?.badge, 80),          // «EMERGENCIA · TERREMOTO COLOMBIA»
            ctaPrimary: normalizeCta(c.hero?.ctaPrimary),
            ctaSecondary: normalizeCta(c.hero?.ctaSecondary),
        },
        donateCard: {
            title: str(c.donateCard?.title, 160),
            description: str(c.donateCard?.description, 600),
            badge: str(c.donateCard?.badge, 80),
            buttonText: str(c.donateCard?.buttonText, 60),
        },
        waysToHelp: arr(c.waysToHelp).slice(0, 8).map((w, i) => ({
            id: str(w?.id, 40) || `way-${i}`,
            icon: str(w?.icon, 40),
            title: str(w?.title, 120),
            description: str(w?.description, 400),
            cta: normalizeCta(w?.cta),
            active: w?.active !== false,
        })),
        requiredItems: arr(c.requiredItems).slice(0, 20).map((it, i) => ({
            id: str(it?.id, 40) || `item-${i}`,
            icon: str(it?.icon, 40),
            title: str(it?.title, 160),
            description: str(it?.description, 300),
            active: it?.active !== false,
        })),
        // El video que va DEBAJO de los elementos requeridos. Se guarda la URL
        // tal cual la pegó el administrador —de ahí sale el `<iframe>` o el
        // `<video>` con `resolveCampaignVideo`—; validarla acá y guardar sólo
        // lo normalizado dejaría al editor sin poder mostrarle qué escribió
        // cuando se equivoca. La página decide qué pinta.
        requiredItemsVideo: {
            url: str(c.requiredItemsVideo?.url, 600),
            title: str(c.requiredItemsVideo?.title, 200),
            poster: str(c.requiredItemsVideo?.poster, 600),
        },
        // El botón que cierra la sección. Hasta v4.816 era «Ver centros de
        // acopio» escrito en el código; ahora se configura. Sin `label` la
        // página conserva ese botón heredado — regla aditiva: una campaña
        // guardada antes no puede quedarse sin él.
        requiredItemsCta: normalizeCta(c.requiredItemsCta),
        // Varios videos que se recorren con las flechas. `requiredItemsVideo`
        // (singular) se CONSERVA por la regla aditiva del sitio —una campaña
        // guardada con un solo video se sigue viendo igual— y `sectionVideos`
        // es quien resuelve la lista definitiva.
        requiredItemsVideos: arr(c.requiredItemsVideos).slice(0, MAX_SECTION_VIDEOS).map(v => ({
            url: str(v?.url, 600),
            title: str(v?.title, 200),
            poster: str(v?.poster, 600),
        })).filter(v => v.url),
        // La galería «Rotarios en acción»: fotos y videos que mandan los
        // clubes. El título y el subtítulo son configurables porque la página
        // la comparten todos los sitios y acá no va ningún texto escrito en el
        // código (regla del Bloque Destacado, v4.746).
        gallery: {
            title: str(c.gallery?.title, 160),
            subtitle: str(c.gallery?.subtitle, 300),
            items: arr(c.gallery?.items).slice(0, MAX_GALLERY_ITEMS).map(it => ({
                url: str(it?.url, 600),
                caption: str(it?.caption, 200),
                // Quién mandó la pieza. En una institución, acreditar al club
                // que aportó la foto no es un adorno.
                credit: str(it?.credit, 160),
                alt: str(it?.alt, 200),
            })).filter(it => it.url),
        },
        // ── El HECHO: dónde y cuándo ────────────────────────────────
        //
        // Campos propios desde v4.833, y el motivo es concreto: hasta entonces
        // la ubicación vivía dentro del título o de la insignia («EMERGENCIA ·
        // TERREMOTO COLOMBIA») y la fecha no existía en ninguna parte
        // —`startsAt` es la vigencia de la CAMPAÑA, no cuándo ocurrió el
        // hecho—. El generador de piezas los necesita para poder nombrarlos, y
        // deducirlos del texto sería adivinar una ciudad o una fecha en una
        // publicación institucional: exactamente lo que la regla de veracidad
        // prohíbe. Sin dato, el brief DICE que no se sabe, y el modelo no lo
        // menciona.
        //
        // ADITIVOS: una campaña guardada antes no los trae y se sigue
        // publicando igual — la página no cambia por esto.
        location: str(c.location, 160),             // «San José del Palmar, Chocó — Colombia»
        eventDate: str(c.eventDate, 60),            // «14 de agosto de 2026»
        centersNote: str(c.centersNote, 300),       // «Se habilitarán más puntos…»
        centersAlliance: str(c.centersAlliance, 200), // «En alianza con … ABACO»
        infoBlocks: arr(c.infoBlocks).slice(0, 6).map((b, i) => ({
            id: str(b?.id, 40) || `info-${i}`,
            title: str(b?.title, 160),
            text: str(b?.text, 800),
            active: b?.active !== false,
        })),
        finalCta: {
            title: str(c.finalCta?.title, 200),
            text: str(c.finalCta?.text, 600),
            quote: str(c.finalCta?.quote, 200),
            ctaPrimary: normalizeCta(c.finalCta?.ctaPrimary),
            ctaSecondary: normalizeCta(c.finalCta?.ctaSecondary),
        },
        partners: arr(c.partners).slice(0, 20).map((p, i) => ({
            id: str(p?.id, 40) || `partner-${i}`,
            name: str(p?.name, 120),
            logo: str(p?.logo, 600),
            url: acceptableCtaUrl(p?.url) ? String(p.url).trim() : '',
            active: p?.active !== false,
        })),
        theme: {
            // Sólo colores hexadecimales: una clase armada al vuelo no llega al
            // CSS compilado (v4.719) y cualquier otra cosa es un hueco de
            // inyección en un style de página pública.
            primary: hexOrEmpty(c.theme?.primary),
            accent: hexOrEmpty(c.theme?.accent),
            cta: hexOrEmpty(c.theme?.cta),
        },
        seo: {
            title: str(c.seo?.title, 160),
            description: str(c.seo?.description, 300),
            ogImage: str(c.seo?.ogImage, 600),
        },
        sectionOrder: arr(c.sectionOrder).filter(s => SECTION_IDS.includes(s)),
        // ── El formulario público de aportes de contenido (v4.968) ──
        //
        // ADITIVO: una campaña guardada antes no lo trae y `normalizeSubmissionsConfig`
        // lo devuelve APAGADO, así que nada cambia hasta que alguien lo encienda.
        //
        // Va enumerado ACÁ y no sólo en su propio spec porque este normalizador
        // RECONSTRUYE el contenido: una clave que no se enumere se pierde al
        // guardar, en silencio (la lección de `normalizeNode` en Plantillas IA).
        submissions: normalizeSubmissionsConfig(c.submissions),
    };
}

export function hexOrEmpty(v) {
    const s = String(v ?? '').trim();
    return /^#[0-9a-fA-F]{6}$/.test(s) ? s : '';
}

// ─── Indicadores («Panorama de la emergencia») ─────────────────────────────
//
// Cada indicador es { id, label, value, source, updatedAt, active }. La regla
// crítica del pedido: NO PUBLICAR CIFRAS SIN FUENTE. `validateStats` es quien
// la hace verdadera — se ejecuta al PUBLICAR y devuelve los motivos concretos,
// que es lo que permite corregir (regla de templateComposer: decir QUÉ regla
// se rompió, no «revisá el formato»).
export function normalizeStats(raw) {
    return arr(raw).slice(0, 24).map((s, i) => ({
        id: str(s?.id, 40) || `stat-${i}`,
        // Qué métrica del catálogo de `emergencyFeed.js` es. Lo escribe la
        // lectura automática y es lo que decide a quién puede tocar: un
        // indicador SIN `metricKey` es manual y no se pisa jamás (regla de
        // `putAuto` con las traducciones). ADITIVO: una campaña anterior a
        // v4.825 no lo trae y se sigue publicando igual.
        metricKey: str(s?.metricKey, 40),
        label: str(s?.label, 120),
        value: str(s?.value, 60),
        source: str(s?.source, 200),
        updatedAt: str(s?.updatedAt, 40),
        active: s?.active !== false,
    }));
}

export function validateStats(stats) {
    const errors = [];
    for (const s of normalizeStats(stats)) {
        if (!s.active) continue;                    // desactivado = retirado a propósito, no se valida
        if (!s.label || !s.value) {
            errors.push(`El indicador «${s.label || s.id}» necesita etiqueta y valor.`);
            continue;
        }
        if (!s.source) errors.push(`El indicador «${s.label}» no tiene fuente: sin fuente no se publica.`);
        if (!s.updatedAt || Number.isNaN(new Date(s.updatedAt).getTime())) {
            errors.push(`El indicador «${s.label}» necesita fecha de actualización válida.`);
        }
    }
    return errors;
}

// ─── Validación de publicación ─────────────────────────────────────────────
//
// Qué le falta a una campaña para poder salir de borrador. Devuelve motivos
// redactados; una lista vacía es «se puede publicar».
export function validateForPublish(campaign) {
    const errors = [];
    const c = campaign || {};
    if (!str(c.name, 200).trim()) errors.push('La campaña necesita un nombre.');
    if (!CAMPAIGN_TYPES[c.campaignType]) errors.push('El tipo de campaña no está en el catálogo.');
    const content = normalizeContent(c.content);
    if (!content.hero.title) errors.push('El hero necesita un título.');
    if (!content.donateCard.title || !content.donateCard.buttonText) {
        errors.push('La tarjeta de aporte necesita título y texto del botón.');
    }
    const t = normalizeTargeting(c.targeting);
    if (t.mode === 'districts' && t.districts.length === 0) {
        errors.push('El alcance por distritos no tiene ningún distrito.');
    }
    if (t.mode === 'clubs' && t.clubIds.length === 0) {
        errors.push('El alcance por sitios no tiene ningún sitio seleccionado.');
    }
    if (c.startAt && c.endAt) {
        const s = new Date(c.startAt); const e = new Date(c.endAt);
        if (!Number.isNaN(s.getTime()) && !Number.isNaN(e.getTime()) && e <= s) {
            errors.push('La fecha de fin debe ser posterior a la de inicio.');
        }
    }
    errors.push(...validateStats(c.stats));
    return errors;
}

// ─── Sobrescritura local ───────────────────────────────────────────────────
//
// Lo que un club PUEDE tocar. La lista es corta a propósito: la narrativa, las
// cifras y los aliados son de la campaña central. El servidor aplica esta
// lista — la pantalla sólo la refleja.
export const OVERRIDE_WHITELIST = [
    'contact',          // { name, phone, email } del club para la campaña
    'localNote',        // texto corto propio («El club recibe en su sede…»)
    'qrImage',          // QR local (imagen)
];

export function sanitizeOverride(raw = {}) {
    const out = {};
    const r = raw && typeof raw === 'object' ? raw : {};
    if (r.contact && typeof r.contact === 'object') {
        out.contact = {
            name: str(r.contact.name, 120),
            phone: str(r.contact.phone, 40),
            email: str(r.contact.email, 160),
        };
    }
    if (typeof r.localNote === 'string') out.localNote = str(r.localNote, 500);
    if (typeof r.qrImage === 'string') out.qrImage = str(r.qrImage, 600);
    return out;
}

/**
 * La campaña que ve UN sitio: contenido central + su override saneado. El
 * override viaja en su propia clave (`local`) en vez de mezclarse dentro del
 * contenido: así la página distingue qué es de la plataforma y qué del club,
 * y un override no puede pisar una sección central ni a propósito.
 */
export function resolveForSite(campaign, override, now) {
    if (!campaign) return null;
    const status = effectiveStatus(campaign, now);
    if (status !== 'active') return null;
    return {
        id: campaign.id,
        slug: str(campaign.slug, 120),
        name: str(campaign.name, 200),
        campaignType: CAMPAIGN_TYPES[campaign.campaignType] ? campaign.campaignType : DEFAULT_CAMPAIGN_TYPE,
        content: normalizeContent(campaign.content),
        stats: normalizeStats(campaign.stats).filter(s => s.active && s.source),
        statsUpdatedAt: latestStatDate(campaign.stats),
        local: sanitizeOverride(override?.content),
        recipientClubId: campaign.recipientClubId || null,
    };
}

export function latestStatDate(stats) {
    let latest = null;
    for (const s of normalizeStats(stats)) {
        if (!s.active || !s.updatedAt) continue;
        const d = new Date(s.updatedAt);
        if (Number.isNaN(d.getTime())) continue;
        if (!latest || d > latest) latest = d;
    }
    return latest ? latest.toISOString() : null;
}

// ─── Centros de acopio (F3) ────────────────────────────────────────────────
//
// ESTRUCTURADOS, nunca un textarea: la ciudad agrupa, el subgrupo ordena
// dentro de Cali («Norte»/«Centro»/«Sur»), y cada campo tiene su lugar — es
// lo que permite acordeones por ciudad, teléfonos con tel: y actualizar una
// dirección sin reescribir un bloque de texto.
//
// `normalizeCenters` da forma a lo que llega del editor y DESCARTA lo
// invalidable (sin ciudad o sin dirección no hay centro que publicar) pero lo
// REPORTA en `skipped`: un filtro que descarta en silencio es el error que la
// regla de crmSegments prohíbe.
export function normalizeCenters(raw) {
    const out = [];
    const skipped = [];
    const list = Array.isArray(raw) ? raw : [];
    for (let i = 0; i < list.length && out.length < 200; i++) {
        const c = list[i] || {};
        const city = str(c.city, 80).trim();
        const address = str(c.address, 200).trim();
        if (!city || !address) {
            skipped.push({ index: i, reason: !city ? 'sin ciudad' : 'sin dirección' });
            continue;
        }
        out.push({
            id: str(c.id, 60) || `center-${i}`,
            city,
            groupLabel: str(c.groupLabel, 60).trim(),
            name: str(c.name, 120).trim(),
            address,
            complement: str(c.complement, 200).trim(),
            schedule: str(c.schedule, 120).trim(),
            contactName: str(c.contactName, 120).trim(),
            phone: str(c.phone, 40).trim(),
            notes: str(c.notes, 300).trim(),
            active: c.active !== false,
            sortOrder: Number.isFinite(Number(c.sortOrder)) ? Math.trunc(Number(c.sortOrder)) : i,
        });
    }
    return { centers: out, skipped };
}

/**
 * La agrupación que pinta la página: por CIUDAD y, dentro, por subgrupo. El
 * orden es el de `sortOrder` y es ESTABLE: la ciudad aparece en el orden de
 * su primer centro, el subgrupo en el del suyo — si dependiera del orden de
 * la base, la lista cambiaría de forma entre visitas.
 * Sólo agrupa los ACTIVOS: un centro desactivado no existe para el público.
 */
export function groupCenters(centers) {
    const sorted = (Array.isArray(centers) ? centers : [])
        .filter(c => c && c.active !== false && c.city && c.address)
        .slice()
        .sort((a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0));
    const cities = [];
    const cityIdx = new Map();
    for (const c of sorted) {
        if (!cityIdx.has(c.city)) {
            cityIdx.set(c.city, cities.length);
            cities.push({ city: c.city, groups: [], _groupIdx: new Map() });
        }
        const entry = cities[cityIdx.get(c.city)];
        const label = c.groupLabel || '';
        if (!entry._groupIdx.has(label)) {
            entry._groupIdx.set(label, entry.groups.length);
            entry.groups.push({ label, centers: [] });
        }
        entry.groups[entry._groupIdx.get(label)].centers.push(c);
    }
    return cities.map(({ city, groups }) => ({ city, groups }));
}

// ─── Pegar centros desde una hoja de cálculo (v4.994) ─────────────────────
//
// El comité entrega los puntos de acopio en un Excel —Ciudad, Punto de
// acopio, Dirección, Nombre de contacto, Teléfono— y hasta v4.993 la única
// vía era transcribirlos de a uno en el editor. Veinte puntos son veinte
// veces el mismo gesto, y cada transcripción es una ocasión de equivocar una
// dirección a la que alguien va a ir a dejar algo.
//
// EL PARSEO ES UNO Y VIVE EN EL SERVIDOR: reutiliza `parseDelimitedText` del
// motor de importación (v4.960), que ya sabe que un salto de línea DENTRO de
// una celda entrecomillada es parte del dato — y es exactamente como Excel
// copia una dirección de dos renglones («Calle 39N #3norte - 59» + «Prados
// del Norte»). Un segundo parser en el navegador se separaría de aquél en
// silencio.
//
// LO QUE SE DEDUCE SE ANOTA, no se decide en silencio: la segunda línea de
// una dirección pasa al COMPLEMENTO (torre, apto, barrio), «Norte 1» se lee
// como el SECTOR «Norte» —es la agrupación con la que la página ya pinta
// Cali—, y dos contactos o dos teléfonos en la misma celda se conservan los
// dos, separados. Cada deducción viaja en `notes` de la fila para que quien
// revisa la vea antes de guardar.

// Encabezados que se reconocen, sin tildes ni mayúsculas. La primera fila se
// toma como encabezado sólo si al menos DOS de sus celdas casan; si no, es un
// dato y se asume el orden del Excel del comité.
const CENTER_COLUMN_ALIASES = {
    city: ['ciudad', 'municipio'],
    name: ['punto de acopio', 'punto', 'nombre del punto', 'lugar', 'nombre'],
    address: ['direccion', 'dirección'],
    complement: ['complemento', 'referencia'],
    groupLabel: ['sector', 'zona', 'grupo'],
    schedule: ['horario', 'horarios'],
    contactName: ['nombre de contacto', 'contacto', 'recibe', 'persona de contacto'],
    phone: ['telefono', 'teléfono', 'celular', 'whatsapp', 'tel'],
    notes: ['notas', 'observaciones', 'nota'],
};
const CENTER_DEFAULT_ORDER = ['city', 'name', 'address', 'contactName', 'phone'];

const foldText = (s) => String(s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().trim();

const headerField = (cell) => {
    const h = foldText(cell).replace(/[:.]+$/, '').replace(/\s+/g, ' ');
    if (!h) return null;
    for (const [field, aliases] of Object.entries(CENTER_COLUMN_ALIASES)) {
        if (aliases.some(a => foldText(a) === h)) return field;
    }
    return null;
};

/** Con qué campo se lee cada columna. Devuelve además si hubo encabezado. */
export function detectCenterColumns(firstRow) {
    const cells = Array.isArray(firstRow) ? firstRow : [];
    const mapped = cells.map(headerField);
    const hits = mapped.filter(Boolean).length;
    if (hits >= 2) return { columns: mapped, headerDetected: true };
    return { columns: CENTER_DEFAULT_ORDER.slice(), headerDetected: false };
}

// «Norte 1», «Sur 3», «Centro» → el SECTOR con el que la página agrupa. Sólo
// las palabras que de verdad son un sector; «Quinta Paredes» no lo es.
const SECTOR_WORDS = ['norte', 'sur', 'centro', 'oriente', 'occidente', 'este', 'oeste'];
export function sectorFromPointName(name) {
    const m = foldText(name).match(/^([a-z]+)\s*\d*$/);
    if (!m || !SECTOR_WORDS.includes(m[1])) return '';
    return m[1].charAt(0).toUpperCase() + m[1].slice(1);
}

const lines = (cell) => String(cell || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);

/**
 * El texto pegado → { centers, skipped, headerDetected, columns }.
 * `centers` son filas YA con la forma del editor (sin id de base: nacen
 * como `center-…` y el guardado les asigna el suyo). Lo invalidable se
 * descarta y se REPORTA con el número de fila del Excel, no con un índice
 * interno: es lo que permite volver a la hoja y corregirlo.
 */
export function parseCentersPaste(text) {
    const src = String(text || '').replace(/^\uFEFF/, '');
    const delimiter = src.includes('\t') ? '\t' : (src.includes(';') ? ';' : ',');
    const parsed = parseDelimitedText(src, delimiter);
    // Una comilla suelta sin cerrar NO es un pegado al estilo CSV: ahí manda
    // la lectura por líneas, como en el motor de importación.
    const rows = parsed.unterminated
        ? src.split(/\r?\n/).map(l => l.split(delimiter).map(c => c.trim()))
        : parsed.rows;
    const nonEmpty = rows.map((r, i) => ({ r, n: i + 1 })).filter(({ r }) => r.some(c => c && c.trim()));
    if (!nonEmpty.length) return { centers: [], skipped: [], headerDetected: false, columns: [] };

    const { columns, headerDetected } = detectCenterColumns(nonEmpty[0].r);
    const data = headerDetected ? nonEmpty.slice(1) : nonEmpty;

    const centers = [];
    const skipped = [];
    for (const { r, n } of data) {
        const get = (field) => {
            const idx = columns.indexOf(field);
            return idx >= 0 ? String(r[idx] || '') : '';
        };
        const city = lines(get('city')).join(' ');
        const addressLines = lines(get('address'));
        if (!city || !addressLines.length) {
            skipped.push({ row: n, reason: !city ? 'sin ciudad' : 'sin dirección' });
            continue;
        }
        const notes = [];
        const pointName = lines(get('name')).join(' ');
        let groupLabel = lines(get('groupLabel')).join(' ');
        let name = pointName;
        if (!groupLabel) {
            const sector = sectorFromPointName(pointName);
            if (sector) {
                groupLabel = sector;
                name = '';
                notes.push(`«${pointName}» se leyó como el sector «${sector}»`);
            }
        }
        const address = addressLines[0];
        let complement = lines(get('complement')).join(', ');
        if (addressLines.length > 1) {
            const extra = addressLines.slice(1).join(', ');
            complement = complement ? `${extra}, ${complement}` : extra;
            notes.push('la segunda línea de la dirección pasó al complemento');
        }
        const contacts = lines(get('contactName'));
        const phones = lines(get('phone')).flatMap(p => p.split(/\s*[\/·]\s*/)).map(s => s.trim()).filter(Boolean);
        if (contacts.length > 1) notes.push(`${contacts.length} personas de contacto en la misma celda`);
        if (phones.length > 1) notes.push(`${phones.length} teléfonos en la misma celda`);
        const userNotes = lines(get('notes')).join(' ');
        centers.push({
            id: `center-paste-${n}`,
            city,
            groupLabel,
            name,
            address,
            complement,
            schedule: lines(get('schedule')).join(' '),
            contactName: contacts.join(' · '),
            phone: phones.join(' / '),
            notes: userNotes,
            active: true,
            _row: n,
            _deductions: notes,
        });
    }
    return { centers, skipped, headerDetected, columns };
}

// ─── Repetidos ─────────────────────────────────────────────────────────────
//
// La misma dirección se escribe de veinte formas —«Cra 12 #13 - 73», «Carrera
// 12 # 13-73», «CRA 12 No. 13-73»— y comparar el texto tal cual no encuentra
// ninguna. `addressKey` reduce la vía a su forma canónica: tipo de vía
// abreviado, sin tildes, sin espacios ni guiones ni puntos. Es el ÚNICO
// punto de comparación; escrita dos veces, una dirección sería repetida para
// el importador y nueva para la pantalla.
//
// Hay DOS grados y los dos se DICEN: `exacto` (misma ciudad y misma llave) y
// `probable` (misma ciudad y misma placa «#54-61» con el mismo número de
// vía: «Cra 1D1 #54-61» y «Carrera 1D #54-61» son casi seguro el mismo
// portón, pero afirmarlo sería decidir por quien revisa). El probable se
// importa igual y se marca; el exacto se deja fuera por defecto.
const VIA_ALIASES = [
    [/\b(carrera|cra\.?|kra\.?|kr\.?|cr\.?)\b/g, 'cra'],
    [/\b(calle|cll\.?|cl\.?|cle\.?)\b/g, 'calle'],
    [/\b(avenida|av\.?|avda\.?)\b/g, 'av'],
    [/\b(diagonal|diag\.?|dg\.?)\b/g, 'dg'],
    [/\b(transversal|transv\.?|tv\.?|tr\.?)\b/g, 'tv'],
    [/\b(numero|num\.?|nro\.?|no\.?|n°|nº)\b/g, '#'],
];
export function addressKey(address) {
    let s = foldText(address).replace(/[°º]/g, '');
    for (const [re, to] of VIA_ALIASES) s = s.replace(re, to);
    return s.replace(/[^a-z0-9#]+/g, '');
}
const cityKey = (city) => foldText(city).replace(/[^a-z0-9]+/g, '');
// La placa («#54-61» → «5461») y el número de la vía («Cra 1D1» → «1»).
const plateOf = (key) => { const m = key.match(/#(\d+)[a-z]*(\d+)/); return m ? `${m[1]}-${m[2]}` : ''; };
const viaNumberOf = (key) => { const m = key.match(/^(?:cra|calle|av|dg|tv)?(\d+)/); return m ? m[1] : ''; };

/**
 * Marca cada centro NUEVO contra los EXISTENTES (y contra los otros nuevos,
 * que también pueden repetirse entre sí en la propia hoja).
 * Devuelve `{ centers, exact, probable }` con `duplicate` en cada fila.
 */
export function markDuplicateCenters(incoming, existing) {
    const seen = new Map(); // ciudad|llave → descripción
    const plates = new Map(); // ciudad|placa|vía → descripción
    const describe = (c) => `${c.city}: ${c.address}${c.name ? ` (${c.name})` : ''}`;
    const remember = (c) => {
        const ck = cityKey(c.city), ak = addressKey(c.address);
        if (!ck || !ak) return;
        if (!seen.has(`${ck}|${ak}`)) seen.set(`${ck}|${ak}`, describe(c));
        const plate = plateOf(ak), via = viaNumberOf(ak);
        if (plate && via && !plates.has(`${ck}|${plate}|${via}`)) plates.set(`${ck}|${plate}|${via}`, describe(c));
    };
    for (const c of Array.isArray(existing) ? existing : []) if (c && c.city && c.address) remember(c);

    const exact = [], probable = [];
    const centers = (Array.isArray(incoming) ? incoming : []).map(c => {
        const ck = cityKey(c.city), ak = addressKey(c.address);
        const hit = seen.get(`${ck}|${ak}`);
        if (hit) {
            exact.push({ row: c._row, center: describe(c), matches: hit });
            return { ...c, duplicate: 'exact', duplicateOf: hit };
        }
        const plate = plateOf(ak), via = viaNumberOf(ak);
        const near = plate && via ? plates.get(`${ck}|${plate}|${via}`) : null;
        remember(c);
        if (near) {
            probable.push({ row: c._row, center: describe(c), matches: near });
            return { ...c, duplicate: 'probable', duplicateOf: near };
        }
        return { ...c, duplicate: null, duplicateOf: null };
    });
    return { centers, exact, probable };
}

// ─── Montos sugeridos del formulario de aporte ─────────────────────────────
//
// EL DEFECTO QUE ESTO CORRIGE (v4.804): el modal rotulaba «(USD)» y ofrecía
// $10–$100 mientras el servidor cobra en la MONEDA DEL CLUB (Colombia → COP):
// un «$50» en un club COP intentaba cobrar 50 pesos (~US$0,012), por debajo
// del mínimo de Stripe. Los montos sugeridos tienen que ser DE la moneda que
// de verdad se cobra, y el mínimo también: 1 USD es un piso razonable; 1 COP
// no es un aporte, es un error de interfaz.
export const DONATION_PRESETS = {
    COP: { amounts: [20000, 50000, 100000, 200000], min: 5000 },
    USD: { amounts: [10, 25, 50, 100], min: 1 },
};

export function donationPresets(currency) {
    const c = String(currency || '').toUpperCase();
    return DONATION_PRESETS[c] || DONATION_PRESETS.USD;
}

// ─── Slug ──────────────────────────────────────────────────────────────────
export function slugify(name) {
    return String(name || '')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80) || 'campana';
}

export default {
    CAMPAIGN_TYPES, DEFAULT_CAMPAIGN_TYPE, campaignTypeCatalog,
    CAMPAIGN_STATUSES, STATUS_LABELS, canTransition, effectiveStatus, isServable,
    TARGETING_MODES, normalizeTargeting, targetsSite, pickCampaignForSite,
    SECTION_IDS, normalizeContent, hexOrEmpty, acceptableCtaUrl,
    normalizeStats, validateStats, validateForPublish, latestStatDate,
    OVERRIDE_WHITELIST, sanitizeOverride, resolveForSite, slugify,
    DONATION_PRESETS, donationPresets,
    normalizeCenters, groupCenters,
    parseCentersPaste, detectCenterColumns, sectorFromPointName, addressKey, markDuplicateCenters,
};
