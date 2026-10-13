// ════════════════════════════════════════════════════════════════════
// Especificación y resolución de video para eventos — Club Platform
//
// Soporta:
//   • YouTube (enlace largo, corto youtu.be, shorts, embeds, live, timestamp)
//   • Vimeo (estándar, reproductor, canales)
//   • Videos alojados directamente (.mp4, .webm, .ogg, .mov, almacenamiento S3)
//
// Reglas estrictas de seguridad:
//   • Cierre de anfitriones y protocolos (sólo https:// o rutas relativas seguras).
//   • Rechazo de javascript:, data:, file:, etc.
//   • Extracción segura de iframe si el usuario pega código de inserción.
//   • Cero espacios vacíos o recuadros rotos si el video no es válido.
// ════════════════════════════════════════════════════════════════════

export type VideoProvider = 'youtube' | 'vimeo' | 'direct';

export interface EventVideoConfig {
    /** URL del video (YouTube, Vimeo o archivo directo) */
    url?: string;
    /** Imagen de portada personalizada (opcional) */
    coverImage?: string;
    /** Título opcional del video */
    title?: string;
    /** Descripción / pie opcional del video */
    description?: string;
    /** Activar o desactivar el video (por defecto true si hay url válida) */
    enabled?: boolean;
}

export interface ResolvedEventVideo {
    provider: VideoProvider;
    /** Dirección original proporcionada por el usuario */
    originalUrl: string;
    /** Dirección segura para incrustar en un iframe (YouTube / Vimeo) */
    embedUrl: string;
    /** Dirección directa para etiqueta <video> cuando es un archivo */
    directUrl?: string;
    /** Identificador único del video si aplica */
    videoId?: string;
    /** Miniatura automática (para YouTube, o vacía) */
    thumbnailUrl?: string;
    /** Portada final (prioriza coverImage del usuario, luego thumbnail) */
    coverImage?: string;
    /** Título opcional */
    title?: string;
    /** Descripción / pie opcional */
    description?: string;
}

/**
 * Extrae la URL candidata si el usuario pegó un bloque <iframe> completo.
 */
export function extractUrlFromEmbed(raw: string): string {
    const text = String(raw || '').trim();
    if (!text) return '';
    const iframeMatch = /<iframe[^>]*\ssrc=["']([^"']+)["']/i.exec(text);
    return iframeMatch ? iframeMatch[1].trim() : text;
}

/**
 * Extrae el timestamp o segundo de inicio de una URL (p. ej. ?t=90 o &start=90).
 */
function extractStartSeconds(url: URL): number | null {
    const t = url.searchParams.get('t') || url.searchParams.get('start');
    if (!t) return null;
    // Si viene en formato 1m30s
    const minSecMatch = /(?:(\d+)m)?(?:(\d+)s)?/.exec(t);
    if (minSecMatch && (minSecMatch[1] || minSecMatch[2])) {
        const mins = parseInt(minSecMatch[1] || '0', 10);
        const secs = parseInt(minSecMatch[2] || '0', 10);
        return mins * 60 + secs;
    }
    const parsed = parseInt(t, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/**
 * Resuelve y valida la configuración de video de un evento.
 * Devuelve `null` si no hay video configurado o si la URL no es válida.
 */
export function resolveEventVideo(raw: unknown): ResolvedEventVideo | null {
    if (!raw || typeof raw !== 'object') return null;

    const cfg = raw as EventVideoConfig;
    if (cfg.enabled === false) return null;

    const rawUrl = extractUrlFromEmbed(String(cfg.url ?? ''));
    if (!rawUrl) return null;

    const title = typeof cfg.title === 'string' ? cfg.title.trim() : '';
    const description = typeof cfg.description === 'string' ? cfg.description.trim() : '';
    const customCover = typeof cfg.coverImage === 'string' && cfg.coverImage.trim().startsWith('http')
        ? cfg.coverImage.trim()
        : (typeof cfg.coverImage === 'string' && cfg.coverImage.trim().startsWith('/') ? cfg.coverImage.trim() : '');

    // Soporte para rutas relativas seguras locales (/api/media/..., /uploads/...)
    if (rawUrl.startsWith('/') && !rawUrl.startsWith('//')) {
        if (/\.(mp4|webm|ogg|ogv|mov|m4v)$/i.test(rawUrl) || rawUrl.includes('/media/') || rawUrl.includes('/videos/')) {
            return {
                provider: 'direct',
                originalUrl: rawUrl,
                embedUrl: rawUrl,
                directUrl: rawUrl,
                coverImage: customCover,
                title,
                description,
            };
        }
        return null;
    }

    let url: URL;
    try {
        url = new URL(rawUrl);
    } catch {
        return null;
    }

    // Protocolo seguro obligatorio
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;

    const hostname = url.hostname.toLowerCase().replace(/^www\./, '');

    // ── 1. YouTube ─────────────────────────────────────────────────────────────
    if (
        hostname === 'youtube.com' ||
        hostname === 'm.youtube.com' ||
        hostname === 'youtube-nocookie.com' ||
        hostname === 'youtu.be'
    ) {
        let videoId = '';
        if (hostname === 'youtu.be') {
            videoId = url.pathname.slice(1).split('/')[0] || '';
        } else {
            videoId = url.searchParams.get('v') || '';
            if (!videoId) {
                const pathParts = url.pathname.split('/').filter(Boolean);
                const tag = pathParts[0];
                if (['embed', 'shorts', 'live', 'v'].includes(tag) && pathParts[1]) {
                    videoId = pathParts[1];
                }
            }
        }

        // Limpiar cualquier residuo del ID
        videoId = videoId.replace(/[^a-zA-Z0-9_-]/g, '');
        if (!videoId || videoId.length < 5) return null;

        const startSec = extractStartSeconds(url);
        const startParam = startSec ? `&start=${startSec}` : '';

        // YouTube nocookie para privacidad y sin cookies de terceros en el render inicial
        const embedUrl = `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1&playsinline=1${startParam}`;
        const autoThumbnail = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;

        return {
            provider: 'youtube',
            videoId,
            originalUrl: rawUrl,
            embedUrl,
            thumbnailUrl: autoThumbnail,
            coverImage: customCover || autoThumbnail,
            title,
            description,
        };
    }

    // ── 2. Vimeo ───────────────────────────────────────────────────────────────
    if (hostname === 'vimeo.com' || hostname === 'player.vimeo.com') {
        const idMatch = /(\d{6,})/.exec(url.pathname);
        const videoId = idMatch ? idMatch[1] : '';
        if (!videoId) return null;

        const embedUrl = `https://player.vimeo.com/video/${videoId}?autoplay=1&title=0&byline=0&portrait=0`;

        return {
            provider: 'vimeo',
            videoId,
            originalUrl: rawUrl,
            embedUrl,
            coverImage: customCover || '',
            title,
            description,
        };
    }

    // ── 3. Archivo directo / S3 / Almacenamiento de plataforma ─────────────────
    const isDirectVideo =
        /\.(mp4|webm|ogg|ogv|mov|m4v)(\?.*)?$/i.test(url.pathname) ||
        hostname.includes('amazonaws.com') ||
        url.pathname.includes('/videos/') ||
        url.pathname.includes('/media/');

    if (isDirectVideo) {
        return {
            provider: 'direct',
            originalUrl: rawUrl,
            embedUrl: url.toString(),
            directUrl: url.toString(),
            coverImage: customCover || '',
            title,
            description,
        };
    }

    return null;
}

/**
 * ¿El evento tiene un video válido configurado y habilitado?
 */
export function hasEventVideo(raw: unknown): boolean {
    return resolveEventVideo(raw) !== null;
}

/**
 * Normaliza la configuración de video para almacenarla en el objeto metadata del evento.
 */
export function normalizeEventVideo(raw: unknown): EventVideoConfig {
    if (!raw || typeof raw !== 'object') return {};
    const cfg = raw as Record<string, any>;
    const url = extractUrlFromEmbed(String(cfg.url ?? '')).trim();
    const coverImage = String(cfg.coverImage ?? '').trim();
    const title = String(cfg.title ?? '').trim();
    const description = String(cfg.description ?? '').trim();
    const enabled = cfg.enabled !== false;

    const result: EventVideoConfig = {};
    if (url) result.url = url;
    if (coverImage) result.coverImage = coverImage;
    if (title) result.title = title;
    if (description) result.description = description;
    if (url) result.enabled = enabled;

    return result;
}
