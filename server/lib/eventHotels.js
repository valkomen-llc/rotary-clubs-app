// ════════════════════════════════════════════════════════════════════
// «Hoteles de la conferencia» — el CRITERIO, puro — v4.1275.0
//
// Una sección multimedia de la ficha pública de un evento: diapositivas con
// la información de los hoteles (tarifas, servicios, condiciones, contactos)
// y, si el administrador lo autoriza, la guía completa para descargar.
//
// Vive en `CalendarEvent.metadata.hotels` (Jsonb), una por evento: los
// archivos y la configuración de un evento nunca se mezclan con los de otro.
// Las IMÁGENES no van a la base: van a S3 (ver eventHotelsStorage.js) y aquí
// sólo se guardan sus direcciones.
//
// Este archivo no toca base, red ni S3: lo importan el servidor (PUT del
// evento, subidas, limpieza), la página pública y el panel. Un solo criterio.
//
//   hotels = {
//     enabled,                       // ¿se publica la sección?
//     title, description,            // encabezado de la sección
//     slides: [{ id, imageUrl, mediumUrl?, thumbUrl?, width?, height?,
//                altText, enabled, fileName? }],   // orden = orden de presentación
//     showThumbnails,                // miniaturas bajo el visor
//     allowDownload,                 // «Permitir descargar presentación de hoteles»
//     document: { url, fileName, sizeBytes, uploadedAt } | null,
//     ratesUpdatedOn,                // 'AAAA-MM-DD' que fija el administrador (opcional)
//     updatedAt, updatedBy, history, // SELLADOS POR EL SERVIDOR al guardar
//   }
//
// Detalle y reglas: docs/claude/hoteles-de-la-conferencia.md
// ════════════════════════════════════════════════════════════════════

export const DEFAULT_HOTELS_TITLE = 'Hoteles de la conferencia';

/** Descripción sugerida. Con el nombre del evento si se conoce. */
export const suggestedHotelsDescription = (eventTitle) => {
    const t = String(eventTitle || '').trim();
    return t
        ? `Conoce las opciones de alojamiento disponibles para ${t}. Consulta las tarifas, servicios y condiciones de reserva de los hoteles participantes.`
        : 'Conoce las opciones de alojamiento disponibles para el evento. Consulta las tarifas, servicios y condiciones de reserva de los hoteles participantes.';
};

const envNumber = (name, fallback, min, max) => {
    const raw = typeof process !== 'undefined' && process?.env ? process.env[name] : undefined;
    const n = Number(raw);
    if (!raw || !Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
};

/**
 * Límites del módulo. Los dos pesos se pueden ajustar por entorno
 * (`EVENT_HOTELS_MAX_IMAGE_MB`, `EVENT_HOTELS_MAX_DOCUMENT_MB`); en el
 * navegador valen los predeterminados y el servidor manda la última palabra.
 */
export const HOTEL_LIMITS = {
    maxSlides: 40,
    maxImageMb: envNumber('EVENT_HOTELS_MAX_IMAGE_MB', 15, 1, 50),
    maxDocumentMb: envNumber('EVENT_HOTELS_MAX_DOCUMENT_MB', 40, 1, 200),
    /** Lado largo mínimo: por debajo, las tarifas no se pueden leer al ampliar. */
    minLongSide: 800,
    /** Lado corto mínimo. */
    minShortSide: 400,
    /** Tope de píxeles de entrada (defensa contra «bombas» de descompresión). */
    maxInputPixels: 60_000_000,
    /** Renditions generadas al subir (lado largo, en píxeles). */
    fullSize: 2400,
    mediumSize: 1400,
    thumbSize: 480,
    titleMax: 120,
    descriptionMax: 600,
    altMax: 250,
    historyMax: 50,
};

export const IMAGE_FORMATS = {
    jpeg: { mime: 'image/jpeg', label: 'JPG' },
    png: { mime: 'image/png', label: 'PNG' },
    webp: { mime: 'image/webp', label: 'WebP' },
};

/** Formato por la extensión o el tipo declarado (sólo para orientar; manda el contenido). */
export const declaredImageFormat = (fileName, mime) => {
    const m = String(mime || '').toLowerCase();
    if (m === 'image/jpeg' || m === 'image/jpg' || m === 'image/pjpeg') return 'jpeg';
    if (m === 'image/png') return 'png';
    if (m === 'image/webp') return 'webp';
    const ext = String(fileName || '').toLowerCase().split('.').pop();
    if (ext === 'jpg' || ext === 'jpeg') return 'jpeg';
    if (ext === 'png') return 'png';
    if (ext === 'webp') return 'webp';
    return null;
};

export const isPdfName = (fileName, mime) =>
    String(mime || '').toLowerCase() === 'application/pdf' || /\.pdf$/i.test(String(fileName || ''));

/**
 * El tipo REAL de una imagen, por sus primeros bytes. Una extensión o un
 * `Content-Type` se pueden falsificar; la firma del archivo no tanto.
 */
export const sniffImageFormat = (bytes) => {
    if (!bytes || bytes.length < 12) return null;
    const b = bytes;
    if (b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return 'jpeg';
    if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47
        && b[4] === 0x0D && b[5] === 0x0A && b[6] === 0x1A && b[7] === 0x0A) return 'png';
    if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46
        && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'webp';
    return null;
};

const latin1 = (bytes) => {
    if (!bytes) return '';
    let s = '';
    const n = bytes.length;
    for (let i = 0; i < n; i += 8192) {
        s += String.fromCharCode.apply(null, Array.from(bytes.subarray ? bytes.subarray(i, Math.min(n, i + 8192)) : bytes.slice(i, i + 8192)));
    }
    return s;
};

/**
 * ¿Es un PDF de verdad? `%PDF-` en el primer KB y `%%EOF` cerca del final.
 * Rechaza además los que declaran acciones activas (`/JavaScript`, `/Launch`,
 * `/EmbeddedFile`): una guía de hoteles no las necesita. Es una barrera
 * razonable, no un antivirus — un PDF puede esconderlas en flujos comprimidos.
 */
export const inspectPdfBytes = (bytes) => {
    if (!bytes || bytes.length < 16) return { ok: false, reason: 'not_pdf' };
    const head = latin1(bytes.subarray ? bytes.subarray(0, 1024) : bytes.slice(0, 1024));
    if (!head.includes('%PDF-')) return { ok: false, reason: 'not_pdf' };
    const tailStart = Math.max(0, bytes.length - 2048);
    const tail = latin1(bytes.subarray ? bytes.subarray(tailStart) : bytes.slice(tailStart));
    if (!tail.includes('%%EOF')) return { ok: false, reason: 'truncated' };
    const all = latin1(bytes);
    if (/\/(JavaScript|JS|Launch|EmbeddedFile)\b/.test(all)) return { ok: false, reason: 'active_content' };
    return { ok: true };
};

/** ¿Las dimensiones sirven para leer una diapositiva? */
export const checkSlideDimensions = (width, height, limits = HOTEL_LIMITS) => {
    const w = Number(width) || 0;
    const h = Number(height) || 0;
    if (w <= 0 || h <= 0) return { ok: false, reason: 'unreadable' };
    if (w * h > limits.maxInputPixels) return { ok: false, reason: 'too_large' };
    const long = Math.max(w, h);
    const short = Math.min(w, h);
    if (long < limits.minLongSide || short < limits.minShortSide) return { ok: false, reason: 'too_small' };
    return { ok: true };
};

/** Mensajes para quien administra (el código del motivo viaja aparte). */
export const UPLOAD_ERROR_MESSAGES = {
    not_image: 'El archivo no es una imagen JPG, PNG o WebP válida.',
    not_pdf: 'El archivo no es un PDF válido.',
    truncated: 'El PDF está incompleto o dañado. Vuelve a exportarlo e inténtalo de nuevo.',
    active_content: 'El PDF contiene acciones activas (JavaScript, adjuntos o comandos) y no se acepta por seguridad. Expórtalo de nuevo como PDF estándar.',
    too_small: `La imagen es muy pequeña para leer tarifas y condiciones. Usa al menos ${HOTEL_LIMITS.minLongSide} px en el lado largo (recomendado 1920 × 1080).`,
    too_large: 'La imagen tiene demasiados píxeles. Redúcela a menos de 60 megapíxeles.',
    unreadable: 'No pudimos leer la imagen. Puede estar dañada.',
    file_too_big_image: `La imagen supera el tope de ${HOTEL_LIMITS.maxImageMb} MB.`,
    file_too_big_document: `El documento supera el tope de ${HOTEL_LIMITS.maxDocumentMb} MB.`,
    empty: 'El archivo llegó vacío.',
    missing: 'No encontramos el archivo subido. Vuelve a intentarlo.',
    wrong_kind: 'Tipo de archivo no admitido aquí.',
    foreign_key: 'El archivo no pertenece a este evento.',
};

// ── Normalización ──────────────────────────────────────────────────

const str = (v, max) => String(v ?? '').replace(/\s+$/g, '').slice(0, max);
const oneLine = (v, max) => String(v ?? '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, max);

/**
 * URL de una diapositiva o de la guía. Sólo `https://`, `http://` o una ruta
 * del propio sitio. Nada de `javascript:`, `data:` ni `blob:` (un `blob:` sólo
 * vive en la pestaña que lo creó; guardado, se rompe en el sitio público).
 */
export const sanitizeHotelUrl = (raw) => {
    const v = String(raw ?? '').trim().slice(0, 2000);
    if (!v) return '';
    if (/^https?:\/\//i.test(v)) return v;
    if (v.startsWith('/') && !v.startsWith('//')) return v;
    return '';
};

const isoDay = (raw) => {
    const v = String(raw ?? '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return '';
    const d = new Date(`${v}T12:00:00Z`);
    return Number.isNaN(d.getTime()) ? '' : v;
};

const posInt = (v) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) && n > 0 && n < 100000 ? n : undefined;
};

let seq = 0;
/** Identificador local de una diapositiva nueva. */
export const newHotelSlideId = () => {
    seq += 1;
    return `hs-${Date.now().toString(36)}-${seq.toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
};

const normalizeSlide = (raw, index) => {
    if (!raw || typeof raw !== 'object') return null;
    const imageUrl = sanitizeHotelUrl(raw.imageUrl || raw.url);
    if (!imageUrl) return null;
    const id = oneLine(raw.id, 80).replace(/[^a-zA-Z0-9_-]/g, '') || `hs-${index + 1}`;
    const out = {
        id,
        imageUrl,
        altText: oneLine(raw.altText || raw.alt, HOTEL_LIMITS.altMax),
        enabled: raw.enabled !== false,
    };
    const mediumUrl = sanitizeHotelUrl(raw.mediumUrl);
    const thumbUrl = sanitizeHotelUrl(raw.thumbUrl);
    if (mediumUrl) out.mediumUrl = mediumUrl;
    if (thumbUrl) out.thumbUrl = thumbUrl;
    const width = posInt(raw.width);
    const height = posInt(raw.height);
    if (width && height) { out.width = width; out.height = height; }
    const fileName = oneLine(raw.fileName, 160);
    if (fileName) out.fileName = fileName;
    return out;
};

const normalizeDocument = (raw) => {
    if (!raw || typeof raw !== 'object') return null;
    const url = sanitizeHotelUrl(raw.url);
    if (!url) return null;
    const out = { url, fileName: oneLine(raw.fileName, 160) || 'guia-de-hoteles.pdf' };
    const size = Math.round(Number(raw.sizeBytes));
    if (Number.isFinite(size) && size > 0) out.sizeBytes = size;
    const at = String(raw.uploadedAt || '');
    if (at && !Number.isNaN(Date.parse(at))) out.uploadedAt = new Date(at).toISOString();
    return out;
};

/**
 * Lo que se GUARDA (y lo que lee el panel): la configuración completa,
 * saneada. Las diapositivas sin URL válida se descartan; no se exige que
 * haya alguna. Los sellos del servidor (`updatedAt`, `updatedBy`, `history`)
 * NO salen de aquí: los pone `stampHotelsUpdate` a partir de lo que YA estaba
 * guardado, nunca de lo que mande el navegador.
 */
export const normalizeHotelsConfig = (raw) => {
    if (!raw || typeof raw !== 'object') return null;
    const slidesRaw = Array.isArray(raw.slides) ? raw.slides : [];
    const seen = new Set();
    const slides = [];
    for (let i = 0; i < slidesRaw.length && slides.length < HOTEL_LIMITS.maxSlides; i++) {
        const s = normalizeSlide(slidesRaw[i], i);
        if (!s) continue;
        if (seen.has(s.id)) s.id = `${s.id}-${i + 1}`;
        seen.add(s.id);
        slides.push(s);
    }
    return {
        enabled: raw.enabled === true,
        title: oneLine(raw.title, HOTEL_LIMITS.titleMax) || DEFAULT_HOTELS_TITLE,
        description: str(raw.description, HOTEL_LIMITS.descriptionMax).trim(),
        slides,
        showThumbnails: raw.showThumbnails !== false,
        allowDownload: raw.allowDownload === true,
        document: normalizeDocument(raw.document),
        ratesUpdatedOn: isoDay(raw.ratesUpdatedOn),
    };
};

/** Borrador para el panel: un evento sin la sección arranca apagado y con el texto sugerido. */
export const draftHotelsConfig = (raw, eventTitle) => {
    const n = normalizeHotelsConfig(raw);
    if (n) return { ...n, slides: n.slides.map(s => ({ ...s })) };
    return {
        enabled: false,
        title: DEFAULT_HOTELS_TITLE,
        description: suggestedHotelsDescription(eventTitle),
        slides: [],
        showThumbnails: true,
        allowDownload: false,
        document: null,
        ratesUpdatedOn: '',
    };
};

/** Diapositivas que se publican: activas y con URL válida, en orden. */
export const visibleHotelSlides = (cfg) => {
    const n = cfg && Array.isArray(cfg.slides) ? cfg : normalizeHotelsConfig(cfg);
    if (!n) return [];
    return n.slides.filter(s => s && s.enabled !== false && sanitizeHotelUrl(s.imageUrl));
};

/**
 * Lo que necesita la página PÚBLICA, o `null` si la sección no se muestra:
 * apagada, o sin ninguna diapositiva publicada (nunca un contenedor vacío).
 * El botón de descarga sólo existe si está autorizado Y hay archivo.
 */
export const publicHotelsView = (raw) => {
    const n = normalizeHotelsConfig(raw);
    if (!n || !n.enabled) return null;
    const slides = visibleHotelSlides(n);
    if (slides.length === 0) return null;
    return {
        title: n.title,
        description: n.description,
        slides,
        showThumbnails: n.showThumbnails && slides.length > 1,
        download: n.allowDownload && n.document ? n.document : null,
        ratesUpdatedOn: n.ratesUpdatedOn,
    };
};

/** Igual que `publicHotelsView`, leyendo de la metadata del evento. */
export const extractPublicHotels = (metadata) =>
    metadata && typeof metadata === 'object' ? publicHotelsView(metadata.hotels) : null;

/**
 * Lo que la ficha PÚBLICA puede ver de la metadata: sin el historial ni quién
 * editó (son datos del panel). No toca nada más.
 */
export const stripPrivateHotelsFields = (metadata) => {
    if (!metadata || typeof metadata !== 'object' || !metadata.hotels || typeof metadata.hotels !== 'object') return metadata;
    const { history: _h, updatedBy: _u, ...hotels } = metadata.hotels;
    return { ...metadata, hotels };
};

// ── Historial de cambios (lo escribe el servidor) ──────────────────

/** Qué cambió entre dos configuraciones normalizadas, en frases para el historial. */
export const diffHotelsConfig = (before, after) => {
    const a = before ? normalizeHotelsConfig(before) : null;
    const b = after ? normalizeHotelsConfig(after) : null;
    if (!a && !b) return [];
    if (!a && b) {
        const out = ['Configuró la sección de hoteles'];
        if (b.slides.length) out.push(`Agregó ${b.slides.length} diapositiva(s)`);
        if (b.enabled) out.push('Publicó la sección');
        if (b.document) out.push(`Cargó la guía descargable «${b.document.fileName}»`);
        return out;
    }
    if (a && !b) return ['Quitó la configuración de hoteles'];

    const out = [];
    if (a.enabled !== b.enabled) out.push(b.enabled ? 'Publicó la sección' : 'Ocultó la sección');
    if (a.title !== b.title) out.push(`Cambió el título a «${b.title}»`);
    if (a.description !== b.description) out.push('Editó la descripción');
    if (a.ratesUpdatedOn !== b.ratesUpdatedOn) {
        out.push(b.ratesUpdatedOn ? `Fijó la fecha de actualización de tarifas en ${b.ratesUpdatedOn}` : 'Quitó la fecha de actualización de tarifas');
    }
    if (a.showThumbnails !== b.showThumbnails) out.push(b.showThumbnails ? 'Mostró las miniaturas' : 'Ocultó las miniaturas');
    if (a.allowDownload !== b.allowDownload) out.push(b.allowDownload ? 'Permitió descargar la guía' : 'Desactivó la descarga de la guía');
    const docA = a.document?.url || '';
    const docB = b.document?.url || '';
    if (docA !== docB) {
        if (!docB) out.push('Quitó la guía descargable');
        else if (!docA) out.push(`Cargó la guía descargable «${b.document.fileName}»`);
        else out.push(`Reemplazó la guía descargable por «${b.document.fileName}»`);
    }

    const byIdA = new Map(a.slides.map(s => [s.id, s]));
    const byIdB = new Map(b.slides.map(s => [s.id, s]));
    const added = b.slides.filter(s => !byIdA.has(s.id)).length;
    const removed = a.slides.filter(s => !byIdB.has(s.id)).length;
    let replaced = 0; let alt = 0; let shown = 0; let hidden = 0;
    for (const s of b.slides) {
        const prev = byIdA.get(s.id);
        if (!prev) continue;
        if (prev.imageUrl !== s.imageUrl) replaced++;
        if (prev.altText !== s.altText) alt++;
        if (prev.enabled !== s.enabled) { if (s.enabled) shown++; else hidden++; }
    }
    if (added) out.push(`Agregó ${added} diapositiva(s)`);
    if (removed) out.push(`Eliminó ${removed} diapositiva(s)`);
    if (replaced) out.push(`Reemplazó ${replaced} diapositiva(s)`);
    if (alt) out.push(`Editó el texto alternativo de ${alt} diapositiva(s)`);
    if (shown) out.push(`Activó ${shown} diapositiva(s)`);
    if (hidden) out.push(`Desactivó ${hidden} diapositiva(s)`);
    const commonA = a.slides.filter(s => byIdB.has(s.id)).map(s => s.id).join('|');
    const commonB = b.slides.filter(s => byIdA.has(s.id)).map(s => s.id).join('|');
    if (commonA !== commonB) out.push('Cambió el orden de las diapositivas');
    return out;
};

const actorOf = (user) => {
    if (!user || typeof user !== 'object') return null;
    const id = String(user.id || user.userId || user.sub || '').slice(0, 80);
    const name = oneLine(user.name || user.fullName || user.email || '', 120);
    if (!id && !name) return null;
    return { ...(id ? { id } : {}), ...(name ? { name } : {}) };
};

/**
 * Lo que se escribe en `metadata.hotels` al guardar el evento.
 *
 *   · La configuración entrante se normaliza (nada sin sanear llega a la base).
 *   · `updatedAt`, `updatedBy` e `history` salen de lo YA GUARDADO; si hubo
 *     cambios, se sella la fecha del SERVIDOR y se agrega una entrada. Lo que
 *     el navegador mande en esos campos se ignora: no se puede falsificar.
 *   · Sin `hotels` entrante, la clave no se escribe (`undefined`).
 */
export const stampHotelsUpdate = (previousRaw, incomingRaw, user, now = new Date()) => {
    if (incomingRaw === undefined || incomingRaw === null) return undefined;
    const next = normalizeHotelsConfig(incomingRaw);
    if (!next) return undefined;
    const prevStored = previousRaw && typeof previousRaw === 'object' ? previousRaw : null;
    const prevHistory = Array.isArray(prevStored?.history) ? prevStored.history.slice(0, HOTEL_LIMITS.historyMax) : [];
    const changes = diffHotelsConfig(prevStored, next);
    if (changes.length === 0) {
        return {
            ...next,
            ...(prevStored?.updatedAt ? { updatedAt: prevStored.updatedAt } : {}),
            ...(prevStored?.updatedBy ? { updatedBy: prevStored.updatedBy } : {}),
            history: prevHistory,
        };
    }
    const at = now.toISOString();
    const by = actorOf(user);
    return {
        ...next,
        updatedAt: at,
        ...(by ? { updatedBy: by } : {}),
        history: [{ at, ...(by ? { by } : {}), changes }, ...prevHistory].slice(0, HOTEL_LIMITS.historyMax),
    };
};

// ── Almacenamiento: qué es de este módulo y qué se puede liberar ───

const seg = (v) => String(v || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);

/** Prefijo PÚBLICO de los archivos de hoteles de UN evento. */
export const hotelsPublicPrefix = (eventId) => `events/hotels/${seg(eventId)}/`;
/** Prefijo PRIVADO donde cae lo subido antes de validarlo. */
export const hotelsIncomingPrefix = (eventId) => `private/event-hotels/${seg(eventId)}/incoming/`;

/** ¿Esta clave de S3 es una subida pendiente de ESTE evento? */
export const incomingKeyBelongs = (storageKey, eventId) => {
    const v = String(storageKey || '');
    return Boolean(seg(eventId)) && v.startsWith(hotelsIncomingPrefix(eventId)) && !v.includes('..') && !v.includes('//', 8);
};

/** Todas las direcciones que la configuración de hoteles referencia. */
export const referencedHotelUrls = (raw) => {
    const n = normalizeHotelsConfig(raw);
    if (!n) return [];
    const out = [];
    for (const s of n.slides) {
        out.push(s.imageUrl);
        if (s.mediumUrl) out.push(s.mediumUrl);
        if (s.thumbUrl) out.push(s.thumbUrl);
    }
    if (n.document?.url) out.push(n.document.url);
    return out;
};

/**
 * De los objetos del prefijo de un evento, cuáles se pueden liberar:
 *
 *   · sólo los del prefijo de ESE evento (nunca la Biblioteca ni otra sección);
 *   · que ningún texto del sitio los mencione (`referencedText`: la fila del
 *     evento y cualquier otra que los nombre, ya concatenadas por el llamador);
 *   · y con más de `graceMs` de antigüedad, para no borrar lo que alguien
 *     acaba de subir y todavía no guardó.
 */
export const orphanHotelObjects = (objects, eventId, referencedText, { nowMs = Date.now(), graceMs = 24 * 3600 * 1000 } = {}) => {
    const prefix = hotelsPublicPrefix(eventId);
    const text = String(referencedText || '');
    return (objects || []).filter(o => {
        const key = String(o?.key || '');
        if (!seg(eventId) || !key.startsWith(prefix) || key.includes('..')) return false;
        const modified = Date.parse(o?.lastModified || '') || 0;
        if (!modified || nowMs - modified < graceMs) return false;
        // Se busca la clave (la parte única) y no la URL completa: la misma
        // clave puede aparecer con otro dominio o codificada.
        const tail = key.slice(prefix.length);
        return tail && !text.includes(tail) && !text.includes(encodeURI(tail));
    });
};

/** Peso legible para el panel y el botón de descarga. */
export const formatBytes = (n) => {
    const b = Number(n) || 0;
    if (b <= 0) return '';
    if (b < 1024 * 1024) return `${Math.max(1, Math.round(b / 1024))} KB`;
    return `${(b / (1024 * 1024)).toFixed(b < 10 * 1024 * 1024 ? 1 : 0).replace('.', ',')} MB`;
};

/** 'AAAA-MM-DD' → «3 de noviembre de 2026» (sin correr de día por la zona horaria). */
export const formatRatesDate = (isoDate, locale = 'es-CO') => {
    const v = isoDay(isoDate);
    if (!v) return '';
    try {
        return new Date(`${v}T12:00:00Z`).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
    } catch {
        return v;
    }
};

export default {
    DEFAULT_HOTELS_TITLE, HOTEL_LIMITS, IMAGE_FORMATS, UPLOAD_ERROR_MESSAGES,
    suggestedHotelsDescription, declaredImageFormat, isPdfName, sniffImageFormat, inspectPdfBytes,
    checkSlideDimensions, sanitizeHotelUrl, newHotelSlideId, normalizeHotelsConfig, draftHotelsConfig,
    visibleHotelSlides, publicHotelsView, extractPublicHotels, stripPrivateHotelsFields,
    diffHotelsConfig, stampHotelsUpdate, hotelsPublicPrefix, hotelsIncomingPrefix, incomingKeyBelongs,
    referencedHotelUrls, orphanHotelObjects, formatBytes, formatRatesDate,
};
