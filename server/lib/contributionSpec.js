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
};
