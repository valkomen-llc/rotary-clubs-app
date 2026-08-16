// ════════════════════════════════════════════════════════════════════
// Campañas de Contribución — espejo mínimo en el navegador
// v4.803.0
//
// Duplicado A PROPÓSITO de server/lib/contributionSpec.js, igual que
// designSpec.ts y ADMIN_ROLES: el servidor decide qué se guarda y qué se
// sirve; este espejo decide qué se PINTA (catálogos del editor, estado
// efectivo en el listado, avisos de validación mientras se escribe).
// Si cambia uno, cambiar el otro — lo comprueba `npm run test:contribution`
// comparando las SALIDAS de las funciones, no sólo las constantes.
//
// Lo que NO está acá, a propósito: `targetsSite` y `resolveForSite` (el
// alcance y la mezcla los resuelve el servidor — la pantalla no debe poder
// razonar sobre sitios ajenos) y `sanitizeOverride` (la whitelist la impone
// el endpoint).
// ════════════════════════════════════════════════════════════════════

export interface CampaignType { id: string; label: string; emergency: boolean; }

// Los desastres son la lista de emergencySpec.js (Creador de Reels); los
// institucionales, propios del módulo. El espejo lleva la lista APLANADA
// porque el navegador no importa módulos del servidor.
export const CAMPAIGN_TYPES: Record<string, CampaignType> = {
    terremoto: { id: 'terremoto', label: 'Terremoto', emergency: true },
    tsunami: { id: 'tsunami', label: 'Tsunami o maremoto', emergency: true },
    inundacion: { id: 'inundacion', label: 'Inundación', emergency: true },
    huracan: { id: 'huracan', label: 'Huracán o ciclón', emergency: true },
    tornado: { id: 'tornado', label: 'Tornado', emergency: true },
    incendio: { id: 'incendio', label: 'Incendio forestal', emergency: true },
    deslizamiento: { id: 'deslizamiento', label: 'Deslizamiento de tierra', emergency: true },
    erupcion: { id: 'erupcion', label: 'Erupción volcánica', emergency: true },
    sequia: { id: 'sequia', label: 'Sequía', emergency: true },
    avalancha: { id: 'avalancha', label: 'Avalancha', emergency: true },
    tormenta: { id: 'tormenta', label: 'Tormenta severa o granizada', emergency: true },
    humanitaria: { id: 'humanitaria', label: 'Emergencia humanitaria', emergency: false },
    social: { id: 'social', label: 'Proyecto social', emergency: false },
    salud: { id: 'salud', label: 'Campaña de salud', emergency: false },
    agua: { id: 'agua', label: 'Agua y saneamiento', emergency: false },
    educacion: { id: 'educacion', label: 'Educación', emergency: false },
    alimentacion: { id: 'alimentacion', label: 'Alimentación', emergency: false },
    reconstruccion: { id: 'reconstruccion', label: 'Reconstrucción', emergency: false },
    fondo: { id: 'fondo', label: 'Fondo especial', emergency: false },
    internacional: { id: 'internacional', label: 'Campaña internacional', emergency: false },
    otro: { id: 'otro', label: 'Otra campaña', emergency: false },
};

export const DEFAULT_CAMPAIGN_TYPE = 'otro';
export const campaignTypeCatalog = (): CampaignType[] => Object.values(CAMPAIGN_TYPES);

export type CampaignStatus = 'draft' | 'scheduled' | 'active' | 'paused' | 'finished' | 'archived';
export const CAMPAIGN_STATUSES: CampaignStatus[] = ['draft', 'scheduled', 'active', 'paused', 'finished', 'archived'];

export const STATUS_LABELS: Record<CampaignStatus, string> = {
    draft: 'Borrador',
    scheduled: 'Programada',
    active: 'Activa',
    paused: 'Pausada',
    finished: 'Finalizada',
    archived: 'Archivada',
};

const STATUS_FLOW: Record<CampaignStatus, CampaignStatus[]> = {
    draft: ['scheduled', 'active', 'archived'],
    scheduled: ['draft', 'active', 'paused', 'archived'],
    active: ['paused', 'finished', 'archived'],
    paused: ['active', 'finished', 'archived'],
    finished: ['archived', 'draft'],
    archived: ['draft'],
};

export const canTransition = (from: string, to: string): boolean =>
    Array.isArray(STATUS_FLOW[from as CampaignStatus]) && STATUS_FLOW[from as CampaignStatus].includes(to as CampaignStatus);

export interface CampaignLike {
    status?: string;
    startAt?: string | null;
    endAt?: string | null;
}

/** El estado EFECTIVO — misma aritmética que el servidor. */
export function effectiveStatus(campaign: CampaignLike | null | undefined, now: Date): string {
    const status = String(campaign?.status || 'draft');
    if (!CAMPAIGN_STATUSES.includes(status as CampaignStatus)) return 'draft';
    if (status !== 'scheduled' && status !== 'active') return status;

    const startAt = campaign?.startAt ? new Date(campaign.startAt) : null;
    const endAt = campaign?.endAt ? new Date(campaign.endAt) : null;

    if (endAt && !Number.isNaN(endAt.getTime()) && now >= endAt) return 'finished';
    if (startAt && !Number.isNaN(startAt.getTime()) && now < startAt) return 'scheduled';
    return 'active';
}

export type TargetingMode = 'all' | 'districts' | 'clubs';
export const TARGETING_MODES: TargetingMode[] = ['all', 'districts', 'clubs'];

export const TARGETING_LABELS: Record<TargetingMode, string> = {
    all: 'Todos los sitios',
    districts: 'Sitios de distritos',
    clubs: 'Sitios específicos',
};

export interface CampaignStat {
    id: string; label: string; value: string; source: string; updatedAt: string; active: boolean;
}

/** Aviso en vivo del editor — el mismo criterio Y los mismos mensajes que el
 *  servidor, incluido el id de respaldo `stat-N` para un indicador sin
 *  etiqueta. Si los mensajes divergen, el editor avisa una cosa y publicar
 *  rechaza otra. */
export function validateStats(stats: Partial<CampaignStat>[] | undefined): string[] {
    const errors: string[] = [];
    const list = Array.isArray(stats) ? stats : [];
    for (let i = 0; i < list.length; i++) {
        const s = list[i] || {};
        if (s.active === false) continue;
        const label = String(s.label || '');
        const value = String(s.value || '');
        if (!label || !value) {
            errors.push(`El indicador «${label || String(s.id || '') || `stat-${i}`}» necesita etiqueta y valor.`);
            continue;
        }
        if (!String(s.source || '')) errors.push(`El indicador «${label}» no tiene fuente: sin fuente no se publica.`);
        if (!s.updatedAt || Number.isNaN(new Date(s.updatedAt).getTime())) {
            errors.push(`El indicador «${label}» necesita fecha de actualización válida.`);
        }
    }
    return errors;
}

export function acceptableCtaUrl(url: string | undefined): boolean {
    const s = String(url ?? '').trim();
    if (!s) return false;
    if (/^https?:\/\//i.test(s)) return true;
    if (s.startsWith('//')) return false;
    if (s.startsWith('/')) return true;
    return false;
}

export function hexOrEmpty(v: string | undefined): string {
    const s = String(v ?? '').trim();
    return /^#[0-9a-fA-F]{6}$/.test(s) ? s : '';
}

// Montos sugeridos del formulario de aporte, POR MONEDA. La lección de la
// v4.804: los montos tienen que ser de la moneda que de verdad se cobra —
// «$50» en un club COP eran 50 pesos, bajo el mínimo de Stripe.
export const DONATION_PRESETS: Record<string, { amounts: number[]; min: number }> = {
    COP: { amounts: [20000, 50000, 100000, 200000], min: 5000 },
    USD: { amounts: [10, 25, 50, 100], min: 1 },
};

export function donationPresets(currency: string | undefined): { amounts: number[]; min: number } {
    const c = String(currency || '').toUpperCase();
    return DONATION_PRESETS[c] || DONATION_PRESETS.USD;
}

// ─── Imágenes del hero (v4.812) — espejo del criterio del servidor ────────
export interface HeroSlide { url: string; alt: string }

/** Tope de imágenes del hero. El de la portada muestra cinco por omisión. */
export const HERO_MAX_SLIDES = 8;

/** Cada cuántos milisegundos se cambia de imagen. El mismo de la portada. */
export const HERO_SLIDE_MS = 5000;

/**
 * Las imágenes que le tocan al hero, en orden. Es el ÚNICO punto donde se
 * decide si manda `images` o la `image` de siempre: con la decisión escrita
 * en el editor y otra vez en la página, una campaña se vería distinta según
 * quién la resuelva.
 */
export function heroSlides(hero: any): HeroSlide[] {
    const list = (Array.isArray(hero?.images) ? hero.images : [])
        .map((im: any) => ({ url: String(im?.url ?? '').trim(), alt: String(im?.alt ?? '') }))
        .filter((im: HeroSlide) => im.url)
        .slice(0, HERO_MAX_SLIDES);
    if (list.length) return list;
    const single = String(hero?.image ?? '').trim();
    return single ? [{ url: single, alt: String(hero?.imageAlt ?? '') }] : [];
}

// ─── Video de sección (v4.815) — espejo del criterio del servidor ─────────
export interface CampaignVideo { kind: 'youtube' | 'vimeo' | 'file'; src: string }

/**
 * Qué video es y cómo se pinta. El cierre de anfitriones no es un capricho:
 * un `<iframe>` se dibuja en una página pública, así que aceptar cualquier
 * dirección convertiría un campo del panel en un hueco por donde meter
 * cualquier cosa. Misma regla que el mapa de la sede (v4.717).
 * `null` = no se reconoce y no se pinta nada (nunca un recuadro roto).
 */
export function resolveCampaignVideo(raw: unknown): CampaignVideo | null {
    const value = String(raw ?? '').trim();
    if (!value) return null;
    const fromIframe = /<iframe[^>]*\ssrc=["']([^"']+)["']/i.exec(value);
    const candidate = (fromIframe ? fromIframe[1] : value).trim();

    let url: URL;
    try { url = new URL(candidate); } catch { return null; }
    if (url.protocol !== 'https:') return null;
    const host = url.hostname.toLowerCase().replace(/^www\./, '');

    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtube-nocookie.com') {
        const id = url.searchParams.get('v')
            || (/^\/(embed|shorts|live|v)\/([\w-]{6,})/.exec(url.pathname)?.[2] || '');
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

export interface SectionVideo { url: string; title: string; poster: string; video: CampaignVideo }

/** Tope de videos por sección. El mismo que el hero: más no se recorre. */
export const MAX_SECTION_VIDEOS = 8;

/**
 * Los videos de una sección, ya resueltos y en orden. ÚNICO punto que decide
 * si mandan los varios o el de siempre — igual que `heroSlides`. Los que no
 * se reconocen se descartan: la flecha «siguiente» no puede llevar a un
 * recuadro vacío.
 */
export function sectionVideos(list: any, single: any): SectionVideo[] {
    const crudos: any[] = Array.isArray(list) && list.length
        ? list
        : (single && String(single?.url ?? '').trim() ? [single] : []);
    return crudos
        .slice(0, MAX_SECTION_VIDEOS)
        .map(v => ({
            url: String(v?.url ?? '').trim(),
            title: String(v?.title ?? ''),
            poster: String(v?.poster ?? ''),
            video: resolveCampaignVideo(v?.url),
        }))
        .filter((v): v is SectionVideo => v.video !== null);
}

// ─── Galería «Rotarios en acción» (v4.821) — espejo del servidor ──────────
export interface GalleryItem {
    url: string; kind: 'image' | 'video'; src: string;
    player: 'youtube' | 'vimeo' | 'file' | null;
    caption: string; credit: string; alt: string;
}

/** Tope de piezas de la galería. Es un muestrario, no un archivo histórico. */
export const MAX_GALLERY_ITEMS = 24;

/** Cada cuánto pasa SOLA la galería. Más lento que el hero: acá se mira. */
export const GALLERY_SLIDE_MS = 6000;

/**
 * Las piezas de la galería, resueltas y en orden. El TIPO se DERIVA de la
 * dirección, no se guarda: guardarlo aparte daría dos verdades sobre lo mismo
 * y se contradirían en cuanto alguien cambie la URL de una fila.
 */
export function galleryItems(list: any): GalleryItem[] {
    return (Array.isArray(list) ? list : [])
        .slice(0, MAX_GALLERY_ITEMS)
        .map((it: any) => {
            const url = String(it?.url ?? '').trim();
            const video = resolveCampaignVideo(url);
            return {
                url,
                kind: (video ? 'video' : 'image') as 'image' | 'video',
                src: video ? video.src : url,
                player: video ? video.kind : null,
                caption: String(it?.caption ?? ''),
                credit: String(it?.credit ?? ''),
                alt: String(it?.alt ?? ''),
            };
        })
        .filter(it => it.url);
}

// ─── Centros de acopio (F3) — espejo del criterio del servidor ─────────────
export interface ContributionCenter {
    id: string; city: string; groupLabel: string; name: string; address: string;
    complement: string; schedule: string; contactName: string; phone: string;
    notes: string; active: boolean; sortOrder: number;
}

const cstr = (v: unknown, max: number): string => (typeof v === 'string' ? v.slice(0, max) : '');

/** Mismo saneo que el servidor: sin ciudad o sin dirección se descarta Y se
 *  reporta — el editor lo usa para avisar en vivo qué no se va a guardar. */
export function normalizeCenters(raw: unknown): { centers: ContributionCenter[]; skipped: { index: number; reason: string }[] } {
    const out: ContributionCenter[] = [];
    const skipped: { index: number; reason: string }[] = [];
    const list = Array.isArray(raw) ? raw : [];
    for (let i = 0; i < list.length && out.length < 200; i++) {
        const c = list[i] || {};
        const city = cstr(c.city, 80).trim();
        const address = cstr(c.address, 200).trim();
        if (!city || !address) {
            skipped.push({ index: i, reason: !city ? 'sin ciudad' : 'sin dirección' });
            continue;
        }
        out.push({
            id: cstr(c.id, 60) || `center-${i}`,
            city,
            groupLabel: cstr(c.groupLabel, 60).trim(),
            name: cstr(c.name, 120).trim(),
            address,
            complement: cstr(c.complement, 200).trim(),
            schedule: cstr(c.schedule, 120).trim(),
            contactName: cstr(c.contactName, 120).trim(),
            phone: cstr(c.phone, 40).trim(),
            notes: cstr(c.notes, 300).trim(),
            active: c.active !== false,
            sortOrder: Number.isFinite(Number(c.sortOrder)) ? Math.trunc(Number(c.sortOrder)) : i,
        });
    }
    return { centers: out, skipped };
}

export interface CenterCityGroup { city: string; groups: { label: string; centers: ContributionCenter[] }[]; }

/** La agrupación que pinta la página — misma aritmética que el servidor. */
export function groupCenters(centers: ContributionCenter[] | undefined): CenterCityGroup[] {
    const sorted = (Array.isArray(centers) ? centers : [])
        .filter(c => c && c.active !== false && c.city && c.address)
        .slice()
        .sort((a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0));
    const cities: (CenterCityGroup & { _groupIdx: Map<string, number> })[] = [];
    const cityIdx = new Map<string, number>();
    for (const c of sorted) {
        if (!cityIdx.has(c.city)) {
            cityIdx.set(c.city, cities.length);
            cities.push({ city: c.city, groups: [], _groupIdx: new Map() });
        }
        const entry = cities[cityIdx.get(c.city) as number];
        const label = c.groupLabel || '';
        if (!entry._groupIdx.has(label)) {
            entry._groupIdx.set(label, entry.groups.length);
            entry.groups.push({ label, centers: [] });
        }
        entry.groups[entry._groupIdx.get(label) as number].centers.push(c);
    }
    return cities.map(({ city, groups }) => ({ city, groups }));
}

export function slugify(name: string): string {
    return String(name || '')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80) || 'campana';
}
