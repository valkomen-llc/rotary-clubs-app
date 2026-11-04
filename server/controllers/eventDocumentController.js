// ════════════════════════════════════════════════════════════════════
// Estadísticas de descarga de los documentos de un evento — v4.1279.0
//
// Tres puertas:
//
//   · GET /api/calendar/events/:id/hotels/document/download  (PÚBLICA)
//     El botón «Descargar guía de hoteles» de la ficha apunta ACÁ y no a S3.
//     El servidor identifica el evento y el documento, comprueba que la
//     descarga esté habilitada, registra la solicitud (hora del servidor,
//     visitante seudónimo, sin IP) y redirige (302, sin caché) al archivo
//     vigente, que S3 sirve con `Content-Disposition: attachment`.
//
//   · GET …/hotels/document/summary   (PANEL) — la cifra junto al archivo.
//   · GET …/hotels/document/stats     (PANEL) — el panel de estadísticas.
//
// ⚠️ LA DESCARGA NUNCA SE BLOQUEA POR MEDIR. Un fallo registrando, un tope de
// solicitudes o una base caída terminan igual en la redirección; lo único que
// cambia es que esa solicitud NO se cuenta (y queda en el log). Lo que sí se
// niega es lo que no está publicado: borrador, sección apagada, descarga
// desactivada o sin archivo → 404, exactamente como si no existiera.
//
// ⚠️ LO QUE SE CUENTA ES UNA SOLICITUD VÁLIDA REDIRIGIDA AL ARCHIVO. No se
// afirma que el PDF quedó guardado en el teléfono: el servidor no lo sabe.
// ════════════════════════════════════════════════════════════════════
import { loadEvent } from '../lib/eventRegistrationStore.js';
import { assertEventCapability } from '../lib/eventAccess.js';
import { attachGrant } from '../middleware/institutionalGuard.js';
import { SITE_ADMIN_ROLES } from '../middleware/auth.js';
import { extractPublicHotels } from '../lib/eventHotels.js';
import {
    DEFAULT_RESOURCE_KEY, DOWNLOAD_ERRORS, THROTTLE,
    resolvePublicDownload, describeDownloadRequest, createRequestThrottle,
} from '../lib/eventDocumentStats.js';
import { ensureDocumentVersion, recordDownload, summaryFor, statsFor } from '../lib/eventDocumentStore.js';

console.log('[event-documents] v4.1279.0 — Estadísticas de descarga de la guía de hoteles: el botón público pasa por la plataforma, se registra en una sentencia y se consulta sólo desde el panel.');

const throttled = createRequestThrottle(THROTTLE);

const clientIp = (req) =>
    String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || String(req.ip || '');

// GET /api/calendar/events/:id/hotels/document/download?from=section|lightbox
export const downloadHotelsGuide = async (req, res) => {
    // Un 302 cacheado dejaría de contar las descargas siguientes, y un archivo
    // reemplazado seguiría llevando al anterior.
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.setHeader('X-Robots-Tag', 'noindex');
    let target = '';
    try {
        const event = await loadEvent(req.params.id);
        const verdict = resolvePublicDownload(event, DEFAULT_RESOURCE_KEY);
        if (!verdict.ok) return res.status(verdict.status).json({ error: DOWNLOAD_ERRORS[verdict.code] || DOWNLOAD_ERRORS.not_found });
        target = verdict.document.url;

        const hit = describeDownloadRequest({
            headers: req.headers,
            userAgent: req.headers['user-agent'] || '',
            ip: clientIp(req),
            clubId: event.clubId || '',
            source: req.query.from,
        });

        // Por encima del tope por dirección se entrega igual, pero no se cuenta:
        // un script que pida el archivo en bucle no infla la cifra.
        if (!hit.isBot && throttled(clientIp(req))) {
            console.warn(`[event-documents] tope de solicitudes · evento ${event.id} · no se cuenta`);
            return res.redirect(302, target);
        }

        const now = new Date();
        const doc = await ensureDocumentVersion({ event, document: verdict.document, resourceKey: DEFAULT_RESOURCE_KEY, now });
        if (doc) await recordDownload({ doc, event, hit, now });
        else console.error(`[event-documents] no se pudo resolver el documento · evento ${event.id} · la descarga no se cuenta`);
        return res.redirect(302, target);
    } catch (e) {
        console.error('[event-documents] download:', e?.message);
        // Si ya sabemos a dónde iba, la persona recibe su archivo igual.
        if (target && !res.headersSent) return res.redirect(302, target);
        if (!res.headersSent) res.status(500).json({ error: 'No pudimos preparar la descarga. Inténtalo de nuevo.' });
    }
};

/** El evento, si la sesión lo alcanza con permiso de lectura (y es administradora del sitio). */
const eventForStats = async (req, res) => {
    const event = await assertEventCapability(req, req.params.id, 'view');
    if (!event) { res.status(404).json({ error: 'Evento no encontrado' }); return null; }
    const grant = await attachGrant(req);
    if ((!grant || grant.source === 'none') && !SITE_ADMIN_ROLES.includes(req.user?.role)) {
        res.status(403).json({ error: 'No tienes permiso para ver las estadísticas de este evento.' });
        return null;
    }
    return event;
};

/** El documento VIGENTE según lo guardado (publicado o no: el panel quiere la cifra igual). */
const savedDocument = (event) => {
    const hotels = event?.metadata && typeof event.metadata === 'object' ? event.metadata.hotels : null;
    const doc = hotels && typeof hotels === 'object' && hotels.document && typeof hotels.document === 'object' ? hotels.document : null;
    if (!doc || !doc.url) return null;
    return { url: String(doc.url), fileName: String(doc.fileName || ''), sizeBytes: doc.sizeBytes, uploadedAt: doc.uploadedAt };
};

// GET /api/calendar/events/:id/hotels/document/summary
export const hotelsGuideSummary = async (req, res) => {
    try {
        const event = await eventForStats(req, res);
        if (!event) return;
        const summary = await summaryFor({ event, currentDocument: savedDocument(event) });
        res.setHeader('Cache-Control', 'no-store');
        res.json({
            ...summary,
            // Lo que el público ve hoy: si la descarga está apagada, se dice.
            publicDownload: Boolean(extractPublicHotels(event.metadata)?.download),
        });
    } catch (e) {
        console.error('[event-documents] summary:', e?.message);
        res.status(500).json({ error: 'No pudimos leer las estadísticas de descarga.' });
    }
};

// GET /api/calendar/events/:id/hotels/document/stats?period=hoy|d7|d30|todo|custom&from=&to=
export const hotelsGuideStats = async (req, res) => {
    try {
        const event = await eventForStats(req, res);
        if (!event) return;
        const stats = await statsFor({
            event,
            currentDocument: savedDocument(event),
            period: String(req.query.period || 'd30'),
            from: req.query.from,
            to: req.query.to,
        });
        res.setHeader('Cache-Control', 'no-store');
        res.json({ ...stats, publicDownload: Boolean(extractPublicHotels(event.metadata)?.download) });
    } catch (e) {
        console.error('[event-documents] stats:', e?.message);
        res.status(500).json({ error: 'No pudimos leer las estadísticas de descarga.' });
    }
};

export default { downloadHotelsGuide, hotelsGuideSummary, hotelsGuideStats };
