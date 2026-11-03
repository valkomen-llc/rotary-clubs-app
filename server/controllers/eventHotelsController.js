// ════════════════════════════════════════════════════════════════════
// «Hoteles de la conferencia» — subidas y limpieza — v4.1275.0
//
// Lo que el panel no puede hacer solo: recibir una diapositiva o la guía en
// PDF, comprobar que el archivo ES lo que dice ser, optimizarlo para la web y
// dejarlo en el almacenamiento del EVENTO. La configuración (orden, textos,
// publicar) NO se guarda aquí: viaja en `metadata.hotels` con el «Guardar
// todos los cambios» del evento, que la normaliza y la sella con quién y
// cuándo (`stampHotelsUpdate` en el PUT de `routes/calendar.js`).
//
// Flujo de una subida:
//   1. `POST …/hotels/presign`  → URL prefirmada a un prefijo PRIVADO del evento.
//   2. El navegador hace PUT directo a S3 (nunca por la función: tope 4,5 MB).
//   3. `POST …/hotels/slides` o `…/hotels/document` → el servidor lee el objeto
//      REAL, juzga el tipo por los BYTES, valida, optimiza, publica y borra lo
//      recibido. Lo rechazado también se borra.
//
// Permisos: la sesión tiene que alcanzar el evento con la capacidad `media`
// (la misma que la pestaña Multimedia). Un evento ajeno «no existe» (404).
// ════════════════════════════════════════════════════════════════════
import { randomUUID } from 'node:crypto';
import db from '../lib/db.js';
import { assertEventCapability } from '../lib/eventAccess.js';
import { attachGrant } from '../middleware/institutionalGuard.js';
import { SITE_ADMIN_ROLES } from '../middleware/auth.js';
import {
    HOTEL_LIMITS, UPLOAD_ERROR_MESSAGES, IMAGE_FORMATS,
    declaredImageFormat, isPdfName, sniffImageFormat, inspectPdfBytes, checkSlideDimensions,
    hotelsPublicPrefix, incomingKeyBelongs, orphanHotelObjects,
} from '../lib/eventHotels.js';
import {
    presignIncomingUpload, headObjectSize, readObject, putPublicObject, deleteModuleObject, listPublicObjects,
} from '../lib/eventHotelsStorage.js';

console.log('[event-hotels] v4.1275.0 — Hoteles de la conferencia: diapositivas y guía por evento, validadas por sus bytes y optimizadas en WebP.');

const MB = 1024 * 1024;

let _sharp = null;
const getSharp = async () => _sharp || (_sharp = (await import('sharp')).default);

const fail = (res, status, code, extra = {}) =>
    res.status(status).json({ error: UPLOAD_ERROR_MESSAGES[code] || 'No pudimos procesar el archivo.', code, ...extra });

/** El evento, si la sesión lo alcanza con la capacidad de Multimedia. */
const eventForMedia = async (req, res) => {
    const event = await assertEventCapability(req, req.params.id, 'media');
    if (!event) { res.status(404).json({ error: 'Evento no encontrado' }); return null; }
    // Sin un grant que decida (roles de siempre), sólo administran los roles
    // de administración del sitio: un socio con sesión no sube archivos.
    const grant = await attachGrant(req);
    if ((!grant || grant.source === 'none') && !SITE_ADMIN_ROLES.includes(req.user?.role)) {
        res.status(403).json({ error: 'No tienes permiso para administrar los hoteles de este evento.' });
        return null;
    }
    return event;
};

const actorLabel = (req) => req.user?.email || req.user?.id || 'desconocido';

/** Nombre de archivo seguro para la descarga (conserva acentos legibles en el encabezado). */
const safeDownloadName = (fileName) => {
    const base = String(fileName || 'guia-de-hoteles').replace(/\.pdf$/i, '').replace(/[\\/:*?"<>|\r\n]+/g, ' ').trim().slice(0, 120) || 'guia-de-hoteles';
    return `${base}.pdf`;
};
const asciiName = (name) => name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9._ -]/g, '_');
const contentDisposition = (name) => `attachment; filename="${asciiName(name)}"; filename*=UTF-8''${encodeURIComponent(name)}`;
const keySlug = (name) => asciiName(name).toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9._-]/g, '').slice(0, 80) || 'guia-de-hoteles.pdf';

// POST /api/calendar/events/:id/hotels/presign
export const presignHotelUpload = async (req, res) => {
    try {
        const event = await eventForMedia(req, res);
        if (!event) return;
        const { kind, fileName, contentType, size } = req.body || {};
        const declaredSize = Number(size) || 0;
        if (kind === 'image') {
            const fmt = declaredImageFormat(fileName, contentType);
            if (!fmt) {
                if (isPdfName(fileName, contentType)) {
                    return fail(res, 415, 'wrong_kind', { hint: 'pdf' });
                }
                return fail(res, 415, 'not_image');
            }
            if (declaredSize > HOTEL_LIMITS.maxImageMb * MB) return fail(res, 413, 'file_too_big_image');
            const ext = fmt === 'jpeg' ? 'jpg' : fmt;
            const out = await presignIncomingUpload({ eventId: event.id, ext, contentType: IMAGE_FORMATS[fmt].mime });
            return res.json({ ...out, limits: { maxImageMb: HOTEL_LIMITS.maxImageMb } });
        }
        if (kind === 'document') {
            if (!isPdfName(fileName, contentType)) return fail(res, 415, 'not_pdf');
            if (declaredSize > HOTEL_LIMITS.maxDocumentMb * MB) return fail(res, 413, 'file_too_big_document');
            const out = await presignIncomingUpload({ eventId: event.id, ext: 'pdf', contentType: 'application/pdf' });
            return res.json({ ...out, limits: { maxDocumentMb: HOTEL_LIMITS.maxDocumentMb } });
        }
        return fail(res, 400, 'wrong_kind');
    } catch (e) {
        console.error('[event-hotels] presign:', e?.message);
        res.status(500).json({ error: 'No pudimos preparar la subida. Inténtalo de nuevo.' });
    }
};

/** Lee y valida lo recibido; borra el objeto si se rechaza. Devuelve el buffer o null. */
const takeIncoming = async (req, res, event, maxBytes, tooBigCode) => {
    const { storageKey } = req.body || {};
    if (!incomingKeyBelongs(storageKey, event.id)) { fail(res, 400, 'foreign_key'); return null; }
    const size = await headObjectSize(storageKey);
    if (size === null) { fail(res, 404, 'missing'); return null; }
    if (size <= 0) { await deleteModuleObject(storageKey, event.id); fail(res, 422, 'empty'); return null; }
    if (size > maxBytes) { await deleteModuleObject(storageKey, event.id); fail(res, 413, tooBigCode); return null; }
    const buffer = await readObject(storageKey);
    return { buffer, storageKey };
};

// POST /api/calendar/events/:id/hotels/slides
export const confirmHotelSlide = async (req, res) => {
    let event = null; let incoming = null;
    try {
        event = await eventForMedia(req, res);
        if (!event) return;
        incoming = await takeIncoming(req, res, event, HOTEL_LIMITS.maxImageMb * MB, 'file_too_big_image');
        if (!incoming) return;
        const { buffer, storageKey } = incoming;

        // 1. El tipo por los BYTES, no por el nombre ni el encabezado.
        if (!sniffImageFormat(buffer)) {
            await deleteModuleObject(storageKey, event.id);
            return fail(res, 415, 'not_image');
        }
        // 2. Dimensiones (con tope de píxeles: una «bomba» no se descomprime).
        const sharp = await getSharp();
        let meta;
        try {
            meta = await sharp(buffer, { limitInputPixels: HOTEL_LIMITS.maxInputPixels }).metadata();
        } catch {
            await deleteModuleObject(storageKey, event.id);
            return fail(res, 422, 'unreadable');
        }
        // La orientación EXIF puede girar la imagen: se miden los lados ya girados.
        const rotated = (meta.orientation || 1) >= 5;
        const w = rotated ? meta.height : meta.width;
        const h = rotated ? meta.width : meta.height;
        const dims = checkSlideDimensions(w, h);
        if (!dims.ok) {
            await deleteModuleObject(storageKey, event.id);
            return fail(res, 422, dims.reason, { width: w, height: h });
        }

        // 3. Optimizar: WebP en tres tamaños, sin metadatos (se descartan EXIF,
        //    ICC exóticos y cualquier carga escondida al re-codificar), con
        //    fondo blanco para los PNG transparentes. Nunca se agranda.
        const base = () => sharp(buffer, { limitInputPixels: HOTEL_LIMITS.maxInputPixels })
            .rotate()
            .flatten({ background: '#ffffff' });
        const render = (side, quality) => base()
            .resize({ width: side, height: side, fit: 'inside', withoutEnlargement: true })
            .webp({ quality, smartSubsample: true, effort: 4 })
            .toBuffer({ resolveWithObject: true });
        const [full, medium, thumb] = await Promise.all([
            render(HOTEL_LIMITS.fullSize, 90),
            render(HOTEL_LIMITS.mediumSize, 85),
            render(HOTEL_LIMITS.thumbSize, 72),
        ]);

        const stem = `${hotelsPublicPrefix(event.id)}slides/${randomUUID()}`;
        const [imageUrl, mediumUrl, thumbUrl] = await Promise.all([
            putPublicObject({ key: `${stem}.webp`, body: full.data, contentType: 'image/webp' }),
            putPublicObject({ key: `${stem}-md.webp`, body: medium.data, contentType: 'image/webp' }),
            putPublicObject({ key: `${stem}-thumb.webp`, body: thumb.data, contentType: 'image/webp' }),
        ]);
        await deleteModuleObject(storageKey, event.id);

        const fileName = String(req.body?.fileName || '').slice(0, 160);
        console.info(`[event-hotels] diapositiva subida · evento ${event.id} · ${actorLabel(req)} · ${w}×${h} → ${full.info.width}×${full.info.height} · ${Math.round(buffer.length / 1024)} KB → ${Math.round(full.data.length / 1024)} KB`);
        return res.json({
            imageUrl, mediumUrl, thumbUrl,
            width: full.info.width, height: full.info.height,
            fileName,
            originalBytes: buffer.length, optimizedBytes: full.data.length,
        });
    } catch (e) {
        console.error('[event-hotels] slide:', e?.message);
        if (event && incoming?.storageKey) await deleteModuleObject(incoming.storageKey, event.id);
        if (!res.headersSent) res.status(500).json({ error: 'No pudimos procesar la diapositiva. Inténtalo de nuevo.' });
    }
};

// POST /api/calendar/events/:id/hotels/document
export const confirmHotelDocument = async (req, res) => {
    let event = null; let incoming = null;
    try {
        event = await eventForMedia(req, res);
        if (!event) return;
        incoming = await takeIncoming(req, res, event, HOTEL_LIMITS.maxDocumentMb * MB, 'file_too_big_document');
        if (!incoming) return;
        const { buffer, storageKey } = incoming;
        const verdict = inspectPdfBytes(buffer);
        if (!verdict.ok) {
            await deleteModuleObject(storageKey, event.id);
            return fail(res, verdict.reason === 'not_pdf' ? 415 : 422, verdict.reason);
        }
        const name = safeDownloadName(req.body?.fileName);
        const key = `${hotelsPublicPrefix(event.id)}docs/${randomUUID()}/${keySlug(name)}`;
        const url = await putPublicObject({
            key, body: buffer, contentType: 'application/pdf', contentDisposition: contentDisposition(name),
        });
        await deleteModuleObject(storageKey, event.id);
        console.info(`[event-hotels] guía subida · evento ${event.id} · ${actorLabel(req)} · ${name} · ${Math.round(buffer.length / 1024)} KB`);
        return res.json({ url, fileName: name, sizeBytes: buffer.length, uploadedAt: new Date().toISOString() });
    } catch (e) {
        console.error('[event-hotels] document:', e?.message);
        if (event && incoming?.storageKey) await deleteModuleObject(incoming.storageKey, event.id);
        if (!res.headersSent) res.status(500).json({ error: 'No pudimos procesar el documento. Inténtalo de nuevo.' });
    }
};

/**
 * Los archivos del prefijo del evento que nada referencia. Se busca la clave en
 * TODOS los eventos (no sólo en éste): si alguien copió la URL de una
 * diapositiva en el HTML de otro evento, el archivo se conserva.
 */
const computeOrphans = async (event) => {
    const objects = await listPublicObjects(event.id);
    if (objects.length === 0) return [];
    const prefix = hotelsPublicPrefix(event.id);
    const { rows } = await db.query(
        `SELECT COALESCE(metadata::text, '') || ' ' || COALESCE("htmlContent", '') || ' ' ||
                COALESCE(image, '') || ' ' || COALESCE(array_to_string(images, ' '), '') AS t
           FROM "CalendarEvent"
          WHERE position($1 in COALESCE(metadata::text, '')) > 0
             OR position($1 in COALESCE("htmlContent", '')) > 0
             OR position($1 in COALESCE(image, '')) > 0
             OR position($1 in COALESCE(array_to_string(images, ' '), '')) > 0`,
        [prefix],
    );
    const text = rows.map(r => r.t).join('\n');
    return orphanHotelObjects(objects, event.id, text);
};

// GET /api/calendar/events/:id/hotels/orphans
export const listHotelOrphans = async (req, res) => {
    try {
        const event = await eventForMedia(req, res);
        if (!event) return;
        const orphans = await computeOrphans(event);
        res.json({
            orphans: orphans.map(o => ({ key: o.key, size: o.size, lastModified: o.lastModified })),
            totalBytes: orphans.reduce((n, o) => n + (o.size || 0), 0),
        });
    } catch (e) {
        console.error('[event-hotels] orphans:', e?.message);
        res.status(500).json({ error: 'No pudimos revisar los archivos sin uso.' });
    }
};

// DELETE /api/calendar/events/:id/hotels/orphans — recalcula y borra
export const deleteHotelOrphans = async (req, res) => {
    try {
        const event = await eventForMedia(req, res);
        if (!event) return;
        const orphans = await computeOrphans(event);
        let deleted = 0; let bytes = 0;
        for (const o of orphans) {
            if (await deleteModuleObject(o.key, event.id)) { deleted++; bytes += o.size || 0; }
        }
        console.info(`[event-hotels] limpieza · evento ${event.id} · ${actorLabel(req)} · ${deleted} archivo(s), ${Math.round(bytes / 1024)} KB`);
        res.json({ deleted, bytes });
    } catch (e) {
        console.error('[event-hotels] orphans delete:', e?.message);
        res.status(500).json({ error: 'No pudimos liberar los archivos sin uso.' });
    }
};

export default { presignHotelUpload, confirmHotelSlide, confirmHotelDocument, listHotelOrphans, deleteHotelOrphans };
