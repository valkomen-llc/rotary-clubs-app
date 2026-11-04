// ════════════════════════════════════════════════════════════════════
// Estadísticas de descarga de los documentos de un evento — el CRITERIO — v4.1279.0
//
// PURO a propósito: sin base, sin red, sin `node:crypto`. Decide qué
// documento se puede descargar públicamente, qué cuenta como una solicitud
// válida de descarga, qué es una repetición, qué es una máquina, cómo se
// recorta un período y en qué dirección vive el botón público. La I/O está
// en `eventDocumentStore.js`; el endpoint en `eventDocumentController.js`.
// Mismo reparto que `linkTracking.js` frente a `linkRedirectStore.js`.
//
// LO QUE SE MIDE, dicho sin adornos: SOLICITUDES VÁLIDAS DE DESCARGA que
// pasaron por la plataforma y fueron redirigidas al archivo vigente. Nunca se
// afirma que el archivo quedó guardado en el dispositivo: el servidor no
// puede saberlo. Visitar la ficha del evento no suma nada: la ficha sigue
// llegando por `/clubs/:clubId/events/:id` y este módulo no la toca.
//
// REUTILIZABLE: un «documento» es un recurso lógico de un evento identificado
// por `(eventId, resourceKey)`. Hoy el único recurso registrado es la guía de
// hoteles (`hotels_guide`); un boletín, una programación o una guía del
// participante se suman con otra clave en `RESOURCES`, sin tocar el resto.
//
// Detalle y reglas: docs/claude/estadisticas-de-descarga-de-documentos-de-un-evento.md
// ════════════════════════════════════════════════════════════════════
import { extractPublicHotels } from './eventHotels.js';
import { isPubliclyVisible } from './eventLifecycle.js';
import { describeClick, dayKey, shiftDayKey, periodRange, PERIODS, DEFAULT_STATS_TZ } from './linkTracking.js';

/** Los recursos descargables que el módulo conoce. La clave es la identidad lógica del documento. */
export const RESOURCES = {
    hotels_guide: {
        key: 'hotels_guide',
        label: 'Guía de hoteles',
        /** El documento vigente según la metadata PÚBLICA del evento, o `null`. */
        currentDocument: (event) => extractPublicHotels(event?.metadata)?.download || null,
    },
};

export const DEFAULT_RESOURCE_KEY = 'hotels_guide';

/** Desde dónde se pidió la descarga. Las dos son DESCARGAS: no hay visor en línea del PDF. */
export const DOWNLOAD_SOURCES = {
    section: 'Botón de la sección',
    lightbox: 'Vista ampliada',
};

export const normalizeDownloadSource = (raw) => {
    const v = String(raw ?? '').trim().toLowerCase();
    return Object.prototype.hasOwnProperty.call(DOWNLOAD_SOURCES, v) ? v : 'section';
};

/**
 * La dirección del botón público (relativa a la base de la API, `/api`).
 * El sitio público y la vista ampliada la arman con esto y NUNCA con la URL
 * de S3: una descarga que no pasa por aquí no se puede contar.
 */
export const hotelsGuideDownloadPath = (eventId, source = 'section') =>
    `/calendar/events/${encodeURIComponent(String(eventId || ''))}/hotels/document/download?from=${normalizeDownloadSource(source)}`;

/**
 * Ventana de repetición: dos solicitudes del MISMO visitante sobre el mismo
 * documento dentro de estos segundos cuentan UNA vez. Un doble clic, un
 * «volver a intentar» o un navegador que reintenta no son dos descargas.
 * Se guarda la repetición aparte (`repeats`), nunca sumada.
 */
export const REPEAT_WINDOW_SEC = 30;

/** Tope por dirección de red: por encima, se redirige igual pero NO se cuenta. */
export const THROTTLE = { windowMs: 60_000, max: 20 };

export const DOWNLOAD_ERRORS = {
    not_found: 'Evento no encontrado',
    not_available: 'La descarga de este documento no está disponible.',
};

/**
 * ¿Se puede entregar el documento `resourceKey` de este evento al público?
 *
 *   · el evento tiene que existir y ser público (un borrador «no existe»);
 *   · el recurso tiene que estar PUBLICADO según su propio criterio (para la
 *     guía: sección activa con diapositivas, descarga permitida y archivo).
 *
 * Devuelve el documento vigente o el motivo. No decide nada sobre contar.
 */
export const resolvePublicDownload = (event, resourceKey = DEFAULT_RESOURCE_KEY) => {
    if (!event || !isPubliclyVisible(event)) return { ok: false, status: 404, code: 'not_found' };
    const resource = RESOURCES[resourceKey];
    if (!resource) return { ok: false, status: 404, code: 'not_found' };
    const document = resource.currentDocument(event);
    if (!document || !document.url) return { ok: false, status: 404, code: 'not_available' };
    return { ok: true, status: 200, code: 'ok', document, resource };
};

/**
 * Lo que se sabe de una solicitud de descarga, en UN solo sitio. Reutiliza el
 * criterio de los enlaces (bots y precargas, dispositivo, fuente, país desde
 * las cabeceras del borde, semilla del visitante SIN guardar la IP).
 */
export const describeDownloadRequest = ({ headers = {}, userAgent = '', ip = '', clubId = '', source = 'section' } = {}) => {
    const click = describeClick({ headers, search: '', userAgent, ip, method: 'GET', clubId });
    return { ...click, source: normalizeDownloadSource(source) };
};

/**
 * Tope de solicitudes por dirección, con reloj inyectado para poder probarlo.
 * Devuelve `true` cuando la dirección ya superó el tope en la ventana.
 * Nunca bloquea la descarga: sólo decide si se cuenta.
 */
export const createRequestThrottle = ({ windowMs = THROTTLE.windowMs, max = THROTTLE.max, maxKeys = 2000 } = {}) => {
    const hits = new Map();
    return (key, nowMs = Date.now()) => {
        const k = String(key || 'x').slice(0, 80);
        const arr = (hits.get(k) || []).filter(t => nowMs - t < windowMs);
        arr.push(nowMs);
        hits.set(k, arr);
        if (hits.size > maxKeys) for (const old of hits.keys()) { hits.delete(old); break; }
        return arr.length > max;
    };
};

// ── Períodos ────────────────────────────────────────────────────────

export const MAX_RANGE_DAYS = 400;

export const PERIOD_OPTIONS = {
    hoy: PERIODS.hoy.label,
    d7: PERIODS.d7.label,
    d30: PERIODS.d30.label,
    todo: PERIODS.todo.label,
    custom: 'Rango personalizado',
};

const isoDay = (v) => {
    const s = String(v ?? '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return '';
    return Number.isNaN(Date.parse(`${s}T12:00:00Z`)) ? '' : s;
};

/**
 * Un rango propio, en claves de día: `desde` ≤ `hasta` ≤ hoy, y como máximo
 * `MAX_RANGE_DAYS` (se recorta el inicio, no se rechaza). Con fechas inválidas
 * devuelve `null` y el llamador cae al período fijo.
 */
export const customRange = (from, to, now = new Date(), timeZone = DEFAULT_STATS_TZ) => {
    const hoy = dayKey(now, timeZone);
    let desde = isoDay(from);
    let hasta = isoDay(to) || hoy;
    if (!desde) return null;
    if (hasta > hoy) hasta = hoy;
    if (desde > hasta) desde = hasta;
    const minimo = shiftDayKey(hasta, -(MAX_RANGE_DAYS - 1));
    if (desde < minimo) desde = minimo;
    const days = Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86400000) + 1;
    return { fromDay: desde, toDay: hasta, days, label: `Del ${desde} al ${hasta}`, timeZone, custom: true };
};

/**
 * Rellena los días sin descargas del rango: sin esto el gráfico une dos
 * puntos lejanos con una recta y hace creer que hubo descargas donde no las
 * hubo. Sin rango (todo el historial) devuelve las filas tal cual.
 */
export const fillDownloadDays = (rows, { fromDay, toDay } = {}) => {
    const limpia = (r) => ({
        day: String(r?.day || ''),
        downloads: Number(r?.downloads) || 0,
        uniques: Number(r?.uniques) || 0,
        bots: Number(r?.bots) || 0,
        repeats: Number(r?.repeats) || 0,
    });
    if (!fromDay || !toDay) return (Array.isArray(rows) ? rows : []).map(limpia);
    const porDia = new Map((rows || []).map(r => [String(r.day), r]));
    const out = [];
    let cursor = fromDay;
    for (let i = 0; i < MAX_RANGE_DAYS + 1 && cursor <= toDay; i++) {
        out.push(limpia({ ...(porDia.get(cursor) || {}), day: cursor }));
        cursor = shiftDayKey(cursor, 1);
    }
    return out;
};

/** El rango que pide la pantalla: un período fijo o uno propio. */
export const resolveRange = ({ period = 'd30', from, to } = {}, now = new Date(), timeZone = DEFAULT_STATS_TZ) => {
    const p = String(period || '').toLowerCase();
    if (p === 'custom') {
        const r = customRange(from, to, now, timeZone);
        if (r) return { ...r, period: 'custom' };
    }
    const fixed = p === 'hoy' || p === 'd7' || p === 'd30' || p === 'todo' ? p : 'd30';
    return { ...periodRange(fixed, now, timeZone), period: fixed, custom: false };
};

// ── Lo que pinta el panel ──────────────────────────────────────────

/**
 * El estado del documento para la tarjeta del panel, a partir de lo que hay
 * guardado y de lo que sabe la base:
 *
 *   · `none`     — nunca se registró nada y no hay archivo: «Sin datos».
 *   · `current`  — hay archivo vigente (las cifras de la versión actual valen).
 *   · `archived` — hubo descargas pero hoy no hay archivo: el histórico se conserva.
 */
export const documentState = ({ hasRow = false, currentDocument = null } = {}) => {
    if (currentDocument?.url) return 'current';
    return hasRow ? 'archived' : 'none';
};

/** «128 descargas», «1 descarga», «Sin descargas todavía». */
export const downloadsLabel = (n) => {
    const v = Number(n) || 0;
    if (v <= 0) return 'Sin descargas todavía';
    return `${v.toLocaleString('es-CO')} ${v === 1 ? 'descarga' : 'descargas'}`;
};

export default {
    RESOURCES, DEFAULT_RESOURCE_KEY, DOWNLOAD_SOURCES, normalizeDownloadSource, hotelsGuideDownloadPath,
    REPEAT_WINDOW_SEC, THROTTLE, DOWNLOAD_ERRORS, resolvePublicDownload, describeDownloadRequest,
    createRequestThrottle, MAX_RANGE_DAYS, PERIOD_OPTIONS, customRange, fillDownloadDays, resolveRange, documentState, downloadsLabel,
};
