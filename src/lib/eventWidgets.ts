// ════════════════════════════════════════════════════════════════════
// Widgets y contenido complementario de un evento — v4.1207.0
//
// Componentes visuales y funcionales adicionales que se renderizan en
// la columna lateral de la ficha pública del evento.
//
// Vive en `CalendarEvent.metadata.widgets` (columna Jsonb de Postgres)
// preservando independencia por evento, permisos y separación de datos
// entre clubes y distritos sin alterar esquemas ni migraciones.
// ════════════════════════════════════════════════════════════════════

export interface EventSidebarImageWidget {
    /** Si el widget se muestra en la página pública del evento. */
    enabled: boolean;
    /** URL de la imagen promocional (JPG, PNG, WebP). */
    imageUrl: string;
    /** Título opcional sobre el widget (ej: "Código de vestuario"). */
    title?: string;
    /** Si se muestra el título sobre la imagen. */
    showTitle?: boolean;
    /** Texto alternativo para accesibilidad y SEO. */
    altText?: string;
    /** Enlace opcional de destino al hacer clic en la imagen. */
    linkUrl?: string;
    /** Si el enlace abre en nueva pestaña (_blank) o misma pestaña (_self). */
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

/**
 * Normaliza la configuración del widget de imagen lateral.
 * Devuelve null si no existe o la URL de la imagen es inválida/vacía.
 */
export const normalizeSidebarImageWidget = (raw: unknown): EventSidebarImageWidget | null => {
    if (!raw || typeof raw !== 'object') return null;
    const obj = raw as Record<string, unknown>;

    const imageUrl = sanitizeImageUrl(obj.imageUrl || obj.url || obj.image);
    if (!imageUrl) return null;

    const enabled = obj.enabled !== false;
    const title = cleanString(obj.title, 120);
    const showTitle = obj.showTitle === true;
    const altText = cleanString(obj.altText || obj.alt, 250);
    const linkUrl = sanitizeLinkUrl(obj.linkUrl || obj.link || obj.href);
    const openInNewTab = obj.openInNewTab === true;

    return {
        enabled,
        imageUrl,
        ...(title ? { title } : {}),
        ...(showTitle ? { showTitle: true } : { showTitle: false }),
        ...(altText ? { altText } : {}),
        ...(linkUrl ? { linkUrl } : {}),
        openInNewTab,
    };
};

/**
 * Comprueba si el widget está activo y tiene imagen para ser renderizado.
 */
export const hasVisibleSidebarImageWidget = (widget: EventSidebarImageWidget | null | undefined): boolean => {
    if (!widget) return false;
    if (widget.enabled === false) return false;
    return Boolean(widget.imageUrl && widget.imageUrl.trim().length > 0);
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
 * Genera un borrador editable con valores predeterminados para el formulario de administración.
 */
export const draftSidebarImageWidget = (raw: unknown): EventSidebarImageWidget => {
    if (!raw || typeof raw !== 'object') {
        return {
            enabled: true,
            imageUrl: '',
            title: '',
            showTitle: false,
            altText: '',
            linkUrl: '',
            openInNewTab: false,
        };
    }
    const obj = raw as Record<string, any>;
    return {
        enabled: obj.enabled !== false,
        imageUrl: String(obj.imageUrl || obj.url || obj.image || '').trim(),
        title: String(obj.title || '').trim(),
        showTitle: obj.showTitle === true,
        altText: String(obj.altText || obj.alt || '').trim(),
        linkUrl: String(obj.linkUrl || obj.link || obj.href || '').trim(),
        openInNewTab: obj.openInNewTab === true,
    };
};
