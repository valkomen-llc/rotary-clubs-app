// ════════════════════════════════════════════════════════════════════
// Widgets y contenido complementario de un evento — v4.1207.0
// Carrusel de la imagen lateral (varias imágenes) — v4.1273.0
//
// Componentes visuales y funcionales adicionales que se renderizan en
// la columna lateral de la ficha pública del evento.
//
// Vive en `CalendarEvent.metadata.widgets` (columna Jsonb de Postgres)
// preservando independencia por evento, permisos y separación de datos
// entre clubes y distritos sin alterar esquemas ni migraciones.
// ════════════════════════════════════════════════════════════════════

/**
 * Una imagen del carrusel lateral (v4.1273.0). Cada imagen conserva sus
 * propias propiedades: origen, texto alternativo, enlace y si se muestra.
 */
export interface EventSidebarImageSlide {
    /** Identificador estable dentro del widget (para reordenar sin perder el foco). */
    id: string;
    /** URL de la imagen (subida, Biblioteca o URL externa). */
    imageUrl: string;
    /** Texto alternativo para accesibilidad y SEO. */
    altText?: string;
    /** Enlace opcional de destino al hacer clic en ESTA imagen. */
    linkUrl?: string;
    /** Si el enlace de esta imagen abre en pestaña nueva. */
    openInNewTab?: boolean;
    /** Si esta imagen participa del carrusel público. */
    enabled: boolean;
}

export type EventSidebarCarouselTransition = 'fade' | 'slide';

/** Comportamiento del carrusel, guardado por evento (v4.1273.0). */
export interface EventSidebarCarouselSettings {
    /** Reproducción automática. */
    autoplay: boolean;
    /** Tiempo entre imágenes, en milisegundos. */
    intervalMs: number;
    /** Tipo de transición. */
    transition: EventSidebarCarouselTransition;
    /** Duración de la transición, en milisegundos. */
    transitionMs: number;
    /** Flechas laterales de navegación. */
    showArrows: boolean;
    /** Puntos indicadores de posición. */
    showDots: boolean;
    /** Al llegar a la última imagen vuelve a la primera. */
    loop: boolean;
    /** Pausa la reproducción automática cuando el usuario interactúa. */
    pauseOnInteraction: boolean;
}

export const DEFAULT_CAROUSEL_SETTINGS: EventSidebarCarouselSettings = {
    autoplay: true,
    intervalMs: 5000,
    transition: 'fade',
    transitionMs: 500,
    showArrows: true,
    showDots: true,
    loop: true,
    pauseOnInteraction: true,
};

/** Límites de los valores numéricos del carrusel. */
export const CAROUSEL_LIMITS = {
    intervalMs: { min: 2000, max: 30000 },
    transitionMs: { min: 100, max: 3000 },
    /** Tope de imágenes por widget: suficiente para un carrusel lateral. */
    maxImages: 20,
} as const;

export interface EventSidebarImageWidget {
    /** Interruptor «Visualización activa»: habilita o deshabilita TODO el widget. */
    enabled: boolean;
    /** Título opcional sobre el widget (ej: "Código de vestuario"). */
    title?: string;
    /** Si se muestra el título sobre la imagen. */
    showTitle?: boolean;
    /**
     * Imágenes del carrusel, en el orden de presentación (v4.1273.0).
     * Es la fuente de verdad: si existe, los campos heredados de abajo
     * son sólo un reflejo de la primera imagen activa.
     */
    images?: EventSidebarImageSlide[];
    /** Configuración del carrusel (v4.1273.0). */
    carousel?: EventSidebarCarouselSettings;
    /**
     * Campos HEREDADOS de la versión de una sola imagen (v4.1207.0).
     * Se siguen escribiendo como reflejo de la primera imagen activa para
     * que cualquier lector antiguo vea algo coherente; al leer, sólo se usan
     * si el widget no tiene `images` (evento anterior a v4.1273.0).
     */
    imageUrl: string;
    altText?: string;
    linkUrl?: string;
    openInNewTab?: boolean;
}

export interface EventWidgetsConfig {
    /** Widget de imagen promocional lateral (debajo del mapa). */
    sidebarImage?: EventSidebarImageWidget;
    /**
     * Ranuras preparadas para widgets complementarios futuros
     * (banners de patrocinadores, cuenta regresiva, bloques HTML, etc.)
     */
    order?: string[];
    [key: string]: unknown;
}

const cleanString = (value: unknown, max = 500): string =>
    String(value ?? '').trim().slice(0, max);

/**
 * Valida y normaliza una URL de imagen permitida.
 * Admite URLs absolutas (http/https), rutas relativas seguras (/...) y data URLs de imagen.
 * Rechaza javascript:, data:text/html y cadenas no seguras.
 */
export const sanitizeImageUrl = (raw: unknown): string => {
    const val = cleanString(raw, 2000);
    if (!val) return '';
    if (/^javascript:/i.test(val) || /^data:(?!image\/)/i.test(val)) return '';
    // Debe empezar por http://, https://, /, ./, blob: o data:image/
    if (/^(https?:\/\/|\/|\.\/|blob:|data:image\/)/i.test(val)) {
        return val;
    }
    return '';
};

/**
 * Valida y normaliza una URL o ruta de enlace.
 * Rechaza esquemas maliciosos como javascript:.
 */
export const sanitizeLinkUrl = (raw: unknown): string => {
    const val = cleanString(raw, 2000);
    if (!val) return '';
    if (/^javascript:/i.test(val)) return '';
    // Si empieza por www. se le antepone https://
    if (/^www\./i.test(val)) {
        return `https://${val}`;
    }
    if (/^(https?:\/\/|\/|mailto:|tel:|#)/i.test(val)) {
        return val;
    }
    return val;
};

const clampNumber = (raw: unknown, min: number, max: number, fallback: number): number => {
    const n = Number(raw);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, Math.round(n)));
};

let slideSeq = 0;
/** Identificador local para una imagen nueva (no depende de crypto.randomUUID). */
export const newSlideId = (): string => {
    slideSeq += 1;
    return `img-${Date.now().toString(36)}-${slideSeq.toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
};

/** Normaliza la configuración del carrusel, rellenando con los valores predeterminados. */
export const normalizeCarouselSettings = (raw: unknown): EventSidebarCarouselSettings => {
    const obj = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
    const d = DEFAULT_CAROUSEL_SETTINGS;
    const bool = (v: unknown, def: boolean) => (typeof v === 'boolean' ? v : def);
    return {
        autoplay: bool(obj.autoplay, d.autoplay),
        intervalMs: clampNumber(obj.intervalMs, CAROUSEL_LIMITS.intervalMs.min, CAROUSEL_LIMITS.intervalMs.max, d.intervalMs),
        transition: obj.transition === 'slide' ? 'slide' : (obj.transition === 'fade' ? 'fade' : d.transition),
        transitionMs: clampNumber(obj.transitionMs, CAROUSEL_LIMITS.transitionMs.min, CAROUSEL_LIMITS.transitionMs.max, d.transitionMs),
        showArrows: bool(obj.showArrows, d.showArrows),
        showDots: bool(obj.showDots, d.showDots),
        loop: bool(obj.loop, d.loop),
        pauseOnInteraction: bool(obj.pauseOnInteraction, d.pauseOnInteraction),
    };
};

/**
 * Lee la lista de imágenes en BORRADOR (sin descartar URLs a medio escribir).
 * Migración: un widget anterior a v4.1273.0 (sin `images`) con `imageUrl`
 * se convierte en una lista de UNA imagen con su alt, enlace y destino.
 */
const readRawSlides = (obj: Record<string, any>): Array<Record<string, any>> => {
    if (Array.isArray(obj.images)) {
        return obj.images.filter((it: unknown) => it && typeof it === 'object');
    }
    const legacyUrl = String(obj.imageUrl || obj.url || obj.image || '').trim();
    if (!legacyUrl) return [];
    return [{
        id: 'img-legacy',
        imageUrl: legacyUrl,
        altText: obj.altText || obj.alt,
        linkUrl: obj.linkUrl || obj.link || obj.href,
        openInNewTab: obj.openInNewTab,
        enabled: true,
    }];
};

const normalizeSlide = (raw: Record<string, any>, index: number): EventSidebarImageSlide | null => {
    const imageUrl = sanitizeImageUrl(raw.imageUrl || raw.url || raw.image);
    if (!imageUrl) return null;
    const altText = cleanString(raw.altText || raw.alt, 250);
    const linkUrl = sanitizeLinkUrl(raw.linkUrl || raw.link || raw.href);
    const id = cleanString(raw.id, 80) || `img-${index + 1}`;
    return {
        id,
        imageUrl,
        ...(altText ? { altText } : {}),
        ...(linkUrl ? { linkUrl } : {}),
        openInNewTab: raw.openInNewTab === true,
        enabled: raw.enabled !== false,
    };
};

/**
 * Normaliza la configuración del widget de imagen lateral.
 * Devuelve null si no existe o no tiene ninguna imagen válida.
 * Acepta tanto el esquema de carrusel (`images`) como el heredado de una
 * sola imagen (`imageUrl`), que migra a una lista de una imagen.
 */
export const normalizeSidebarImageWidget = (raw: unknown): EventSidebarImageWidget | null => {
    if (!raw || typeof raw !== 'object') return null;
    const obj = raw as Record<string, any>;

    const images = readRawSlides(obj)
        .map((it, i) => normalizeSlide(it, i))
        .filter((it): it is EventSidebarImageSlide => it !== null);
    if (images.length === 0) return null;

    const enabled = obj.enabled !== false;
    const title = cleanString(obj.title, 120);
    const showTitle = obj.showTitle === true;
    const carousel = normalizeCarouselSettings(obj.carousel);
    const first = images.find(img => img.enabled) || images[0];

    return {
        enabled,
        ...(title ? { title } : {}),
        ...(showTitle ? { showTitle: true } : { showTitle: false }),
        images,
        carousel,
        // Reflejo heredado de la primera imagen activa.
        imageUrl: first.imageUrl,
        ...(first.altText ? { altText: first.altText } : {}),
        ...(first.linkUrl ? { linkUrl: first.linkUrl } : {}),
        openInNewTab: first.openInNewTab === true,
    };
};

/** Las imágenes que efectivamente se muestran en el sitio público, en orden. */
export const visibleSidebarSlides = (widget: EventSidebarImageWidget | null | undefined): EventSidebarImageSlide[] => {
    if (!widget) return [];
    const list = Array.isArray(widget.images)
        ? widget.images
        : (widget.imageUrl ? [{ id: 'img-legacy', imageUrl: widget.imageUrl, enabled: true }] : []);
    return list.filter(img => img && img.enabled !== false && Boolean(img.imageUrl && img.imageUrl.trim()));
};

/**
 * Comprueba si el widget está activo y tiene al menos una imagen activa.
 */
export const hasVisibleSidebarImageWidget = (widget: EventSidebarImageWidget | null | undefined): boolean => {
    if (!widget) return false;
    if (widget.enabled === false) return false;
    return visibleSidebarSlides(widget).length > 0;
};

/**
 * Extrae el widget de imagen lateral desde los metadatos del evento,
 * soportando tanto la ruta canónica `metadata.widgets.sidebarImage` como
 * retrocompatibilidad directa `metadata.sidebarImage`.
 */
export const extractSidebarImageWidget = (metadata: unknown): EventSidebarImageWidget | null => {
    if (!metadata || typeof metadata !== 'object') return null;
    const meta = metadata as Record<string, any>;
    const raw = meta.widgets?.sidebarImage || meta.sidebarImage;
    return normalizeSidebarImageWidget(raw);
};

/**
 * Cómo se abre el enlace de una imagen: pestaña nueva si se pidió o si es
 * una dirección externa sin preferencia; misma pestaña para rutas internas.
 */
export const resolveSlideLinkTarget = (linkUrl?: string, openInNewTab?: boolean): { target: '_blank' | '_self'; rel?: string; external: boolean } => {
    const external = Boolean(linkUrl && (/^https?:\/\//i.test(linkUrl) || openInNewTab));
    const target: '_blank' | '_self' = openInNewTab
        ? '_blank'
        : (linkUrl?.startsWith('/') ? '_self' : (external ? '_blank' : '_self'));
    return { target, rel: target === '_blank' ? 'noopener noreferrer' : undefined, external };
};

/**
 * Genera un borrador editable con valores predeterminados para el formulario de administración.
 * Un widget heredado de una sola imagen se migra aquí a una lista de una imagen,
 * así que al guardar el evento queda escrito en el esquema nuevo sin perder nada.
 */
export const draftSidebarImageWidget = (raw: unknown): EventSidebarImageWidget => {
    const obj = raw && typeof raw === 'object' ? raw as Record<string, any> : null;
    if (!obj) {
        return {
            enabled: true,
            imageUrl: '',
            title: '',
            showTitle: false,
            altText: '',
            linkUrl: '',
            openInNewTab: false,
            images: [],
            carousel: { ...DEFAULT_CAROUSEL_SETTINGS },
        };
    }
    const images: EventSidebarImageSlide[] = readRawSlides(obj).map((it, i) => ({
        id: String(it.id || '').trim() || `img-${i + 1}`,
        imageUrl: String(it.imageUrl || it.url || it.image || '').trim(),
        altText: String(it.altText || it.alt || '').trim(),
        linkUrl: String(it.linkUrl || it.link || it.href || '').trim(),
        openInNewTab: it.openInNewTab === true,
        enabled: it.enabled !== false,
    }));
    const first = images.find(img => img.enabled && img.imageUrl) || images[0];
    return {
        enabled: obj.enabled !== false,
        imageUrl: first?.imageUrl || '',
        title: String(obj.title || '').trim(),
        showTitle: obj.showTitle === true,
        altText: first?.altText || '',
        linkUrl: first?.linkUrl || '',
        openInNewTab: first?.openInNewTab === true,
        images,
        carousel: normalizeCarouselSettings(obj.carousel),
    };
};

/**
 * Lo que el editor escribe en `metadata.widgets.sidebarImage`: la lista y la
 * configuración del carrusel, más el reflejo heredado de la primera imagen
 * activa (para que un lector antiguo nunca vea un widget incoherente).
 */
export const serializeSidebarImageWidget = (draft: EventSidebarImageWidget): EventSidebarImageWidget => {
    const images = (draft.images || []).map(img => ({
        id: img.id,
        imageUrl: img.imageUrl,
        altText: img.altText || '',
        linkUrl: img.linkUrl || '',
        openInNewTab: img.openInNewTab === true,
        enabled: img.enabled !== false,
    }));
    const first = images.find(img => img.enabled && img.imageUrl.trim()) || null;
    return {
        enabled: draft.enabled !== false,
        title: draft.title || '',
        showTitle: draft.showTitle === true,
        images,
        carousel: normalizeCarouselSettings(draft.carousel),
        imageUrl: first?.imageUrl || '',
        altText: first?.altText || '',
        linkUrl: first?.linkUrl || '',
        openInNewTab: first?.openInNewTab === true,
    };
};
