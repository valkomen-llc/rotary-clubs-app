// ════════════════════════════════════════════════════════════════════
// Archivos del Directorio Distrital de Clubes — endpoints — v4.1306.0
//
//   POST   /api/district-clubs/media/presign   preparar la subida (formulario o portal)
//   POST   /api/district-clubs/media/confirm   validar por bytes, procesar y guardar
//   POST   /api/district-clubs/media/status    qué archivos de este formulario existen
//   GET    /api/district-clubs/media/:id       la imagen (redirige: firmada o pública)
//   DELETE /api/district-clubs/media/:id       eliminar (se purga a los 30 días)
//   GET    /api/district-clubs/admin/submissions/:id/media   (panel)
//
// Quién es el dueño:
//   · formulario público → el `draftToken` del borrador (secreto, generado por
//     el servidor, y tiene que existir y seguir abierto);
//   · portal del club → la sesión del portal (Authorization: Bearer …).
// ════════════════════════════════════════════════════════════════════
import jwt from 'jsonwebtoken';
import db from '../lib/db.js';
import { ensureDistrictClubDirectorySchema } from '../lib/ensureDistrictClubDirectorySchema.js';
import store, { ClubMediaError } from '../lib/clubMediaStore.js';
import storage from '../lib/clubMediaStorage.js';
import { checkUploadMeta, galleryMax, maxBytesFor, formatLimit, CLUB_MEDIA_ROLES, ROLE_LABELS } from '../lib/clubMediaSpec.js';

console.log('[clubMediaController] v4.1306.0 cargado — carga confiable de logotipo, portada y galería del Directorio de Clubes');

const JWT_SECRET = process.env.JWT_SECRET || 'rotary_secret_key_2026';
const PORTAL_AUDIENCE = 'rotary-club-portal';

// Freno propio, más holgado que el de los formularios (40/min): una galería
// de 20 fotos son 40 peticiones (prefirmar + confirmar) desde la misma red de
// la reunión del club. En memoria por instancia, como `lightPublicLimit`.
const _hits = new Map();
export function mediaLimit(req, res, next) {
    try {
        const ip = String(req.headers['x-forwarded-for']?.split(',')[0] || req.ip || 'x').slice(0, 80);
        const now = Date.now();
        const arr = (_hits.get(ip) || []).filter(t => now - t < 60_000);
        arr.push(now);
        _hits.set(ip, arr);
        if (_hits.size > 2000) for (const k of _hits.keys()) { _hits.delete(k); break; }
        if (arr.length > 180) return res.status(429).json({ error: 'Demasiadas subidas en un minuto. Espera un momento y vuelve a intentarlo.', code: 'rate' });
    } catch { /* sin freno antes que sin servicio */ }
    next();
}

const sendError = (res, e) => {
    if (e instanceof ClubMediaError) {
        return res.status(e.status || 400).json({ error: e.message, code: e.code, hint: e.hint || null });
    }
    console.error('[clubMediaController]', e);
    return res.status(500).json({ error: 'No pudimos procesar el archivo. Vuelve a intentarlo.', code: 'server' });
};

/** El dueño de la petición, o un error para la persona. */
const resolveOwner = async (req) => {
    const body = req.body || {};
    const context = body.context || req.query.context;
    const bearer = req.headers.authorization?.split(' ')[1];
    if (context === 'portal') {
        if (!bearer) throw new ClubMediaError('auth', 'Inicia sesión en el portal del club para subir archivos.', { status: 401 });
        let payload;
        try {
            payload = jwt.verify(bearer, JWT_SECRET, { audience: PORTAL_AUDIENCE });
        } catch {
            throw new ClubMediaError('auth', 'Tu sesión en el portal expiró. Vuelve a ingresar.', { status: 401 });
        }
        if (!payload.profileId) throw new ClubMediaError('auth', 'Tu cuenta todavía no tiene un club asignado.', { status: 403 });
        return { kind: 'portal', profileId: String(payload.profileId), email: payload.email || null };
    }
    const draftToken = String(body.draftToken || req.query.draftToken || req.headers['x-draft-token'] || '').trim();
    if (!draftToken || draftToken.length < 8 || draftToken.length > 120) {
        throw new ClubMediaError('draft', 'Primero se guarda el borrador del formulario; vuelve a intentarlo.', { status: 400 });
    }
    await ensureDistrictClubDirectorySchema();
    const { rows } = await db.query(
        `SELECT status FROM "DistrictClubSubmission" WHERE "draftToken" = $1
          ORDER BY (status = 'borrador') DESC, "updatedAt" DESC LIMIT 1`,
        [draftToken],
    );
    if (!rows[0]) throw new ClubMediaError('draft', 'No encontramos el borrador de este formulario. Recarga la página e inténtalo de nuevo.', { status: 404 });
    if (['aprobada', 'rechazada'].includes(rows[0].status)) {
        throw new ClubMediaError('draft_closed', 'Esta solicitud ya fue revisada; inicia un formulario nuevo para enviar cambios.', { status: 409 });
    }
    return { kind: 'borrador', draftToken };
};

/** POST /media/presign */
export const presignClubMedia = async (req, res) => {
    try {
        const { role, filename, contentType, size } = req.body || {};
        // Validar ANTES de tocar la base: un formato o peso inválido se dice
        // de inmediato, con el límite exacto.
        const verdict = checkUploadMeta({ role, filename, contentType, size });
        if (!verdict.ok) return res.status(400).json({ error: verdict.error, code: verdict.code, hint: verdict.hint || null, maxBytes: verdict.maxBytes || null });
        const owner = await resolveOwner(req);
        const out = await store.createUpload({ owner, role, filename, contentType, size });
        // Limpieza oportunista (como mucho cada 6 h por instancia), sin
        // demorar la respuesta.
        store.cleanupClubMedia().catch(e => console.warn('[club-media] limpieza:', e?.message));
        res.json({ ok: true, ...out });
    } catch (e) {
        sendError(res, e);
    }
};

/** POST /media/confirm */
export const confirmClubMedia = async (req, res) => {
    try {
        const owner = await resolveOwner(req);
        const out = await store.confirmUpload({ owner, id: String(req.body?.id || '') });
        res.json({ ok: true, ...out });
    } catch (e) {
        sendError(res, e);
    }
};

/** POST /media/status — `{ ids: [...] }`: el formulario CONFIRMA con el
 *  servidor lo que muestra como guardado (al recargar, al volver otro día). */
export const statusClubMedia = async (req, res) => {
    try {
        const owner = await resolveOwner(req);
        const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
        res.json({ ok: true, media: await store.listForOwner(owner, ids) });
    } catch (e) {
        sendError(res, e);
    }
};

/** DELETE /media/:id */
export const deleteClubMedia = async (req, res) => {
    try {
        const owner = await resolveOwner(req);
        const media = await store.deleteMedia({ owner, id: req.params.id });
        res.json({ ok: true, media });
    } catch (e) {
        sendError(res, e);
    }
};

/** GET /media/:id — la imagen. Pública una vez publicada; mientras tanto,
 *  un enlace firmado de 15 minutos (la dirección estable es un identificador
 *  aleatorio que sólo conocen el formulario del club y el panel). */
export const viewClubMedia = async (req, res) => {
    try {
        const row = await store.getMediaRow(req.params.id);
        if (!row || (row.status === 'eliminado' && !row.publicUrl)) {
            return res.status(404).set('Cache-Control', 'no-store').json({ error: 'Imagen no disponible.' });
        }
        if (row.publicUrl) {
            res.set('Cache-Control', 'public, max-age=86400');
            return res.redirect(302, row.publicUrl);
        }
        if (!row.storageKey) {
            return res.status(409).set('Cache-Control', 'no-store').json({ error: 'La imagen todavía no terminó de procesarse.', status: row.status });
        }
        const url = await storage.signedReadUrl(row.storageKey, { seconds: 900, downloadName: req.query.download ? row.originalName : null });
        // Menos que la firma: el navegador nunca reusa una firma vencida.
        res.set('Cache-Control', 'private, max-age=600');
        return res.redirect(302, url);
    } catch (e) {
        sendError(res, e);
    }
};

/** GET /media/limits — los topes vigentes, para decirlos ANTES de subir. */
export const clubMediaLimits = async (_req, res) => {
    res.set('Cache-Control', 'public, max-age=300');
    res.json({
        ok: true,
        galleryMax: galleryMax(),
        roles: Object.fromEntries(CLUB_MEDIA_ROLES.map(r => [r, { label: ROLE_LABELS[r], maxBytes: maxBytesFor(r), maxLabel: formatLimit(maxBytesFor(r)) }])),
        formats: ['PNG', 'JPG', 'WEBP', 'HEIC/HEIF'],
    });
};

/** GET /admin/submissions/:id/media (panel) */
export const adminSubmissionMedia = async (req, res) => {
    try {
        await ensureDistrictClubDirectorySchema();
        const { rows } = await db.query(`SELECT id, payload, "draftToken", status FROM "DistrictClubSubmission" WHERE id = $1 LIMIT 1`, [req.params.id]);
        if (!rows[0]) return res.status(404).json({ error: 'Solicitud no encontrada' });
        res.json({ ok: true, media: await store.listForSubmission(rows[0]) });
    } catch (e) {
        sendError(res, e);
    }
};

export default { presignClubMedia, confirmClubMedia, statusClubMedia, deleteClubMedia, viewClubMedia, clubMediaLimits, adminSubmissionMedia };
