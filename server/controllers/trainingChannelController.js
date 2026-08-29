// ════════════════════════════════════════════════════════════════════════════
// Canal de Capacitaciones — LA ORQUESTACIÓN (v4.954)
// ════════════════════════════════════════════════════════════════════════════
//
// El criterio vive en `trainingChannelSpec.js` (puro); acá vive la I/O: las
// tablas runtime, el veredicto servido, el progreso, los comentarios, las
// métricas y la administración desde la Biblioteca Multimedia.
//
// Decisiones de las que cuelga el resto:
//
//  • EL ARCHIVO NO SE TOCA. `MediaChannelVideo` REFERENCIA a `Media`
//    (`mediaId`); no se copia, no se mueve y no se le agrega ni una columna.
//    La URL pública de S3 que ya circula sigue sirviendo el mismo objeto:
//    cero enlaces rotos por construcción.
//
//  • EL VEREDICTO DE ACCESO ES DEL SERVIDOR (`/watch`). La página pide
//    permiso antes de reproducir y el servidor contesta con el veredicto, la
//    URL y desde dónde reanudar. Esconder el reproductor en la pantalla no
//    protege nada (v4.868); lo que decide es este endpoint. Dicho con la
//    misma honestidad en el spec: los objetos de S3 son públicos y siguen
//    siéndolo —cero enlaces rotos es requisito—, así que esto acota la
//    EXPERIENCIA (página, reproductor, métricas), no el objeto. No es DRM.
//
//  • NO HAY UN SEGUNDO SISTEMA DE USUARIOS. «Crear cuenta» desde el candado
//    reutiliza `ensureAttendeeAccount` + `issueAttendeeSession` del rol
//    Asistente al Evento (v4.655): una persona, una cuenta por correo, y los
//    roles se ACUMULAN con las otras dos identidades (v4.711).
//
//  • TODO endpoint público DEGRADA: esto corre en páginas públicas y un canal
//    caído no puede tumbar nada más. La lectura devuelve vacío con el motivo
//    en consola, nunca un 500 al visitante por un fallo del esquema.
// ════════════════════════════════════════════════════════════════════════════

import jwt from 'jsonwebtoken';
import db from '../lib/db.js';
import { ensureTrainingChannelSchema } from '../lib/ensureTrainingChannelSchema.js';
import {
    ACCESS_MODES, VIDEO_STATES, CLIENT_METRIC_TYPES, METRIC_TYPES,
    trainingSlug, isAnonId, viewerKeyOf, rolesOf, accessVerdict,
    isPubliclyListed, compareVideos, matchesSearch, applyProgress,
    resumePosition, validateComment, buildCommentTree, sanitizeVideoPatch,
    sanitizeChannelPatch, videoCard, resolveCommentsEnabled, resolvePreviewSec,
} from '../lib/trainingChannelSpec.js';
import { JWT_SECRET, PLATFORM_AUDIENCE, PORTAL_AUDIENCE } from '../middleware/auth.js';
import {
    ATTENDEE_AUDIENCE, ensureAttendeeAccount, issueAttendeeSession, auditLogin,
} from './eventAttendeeController.js';

console.log('[trainingChannelController] v4.954.0 cargado — canal público de capacitaciones sobre la Biblioteca Multimedia: fichas relacionadas (MediaChannelVideo → Media), veredicto de acceso en el servidor, progreso con reanudación, comentarios y métricas.');

const clean = (v, max = 300) => String(v ?? '').trim().slice(0, max);

// ── El espectador ────────────────────────────────────────────────────────────
//
// El navegador manda sus tokens (los que ya guarda `siteSession.ts`) en la
// cabecera `x-viewer-tokens`, separados por comas, y su identificador anónimo
// en `x-anon-id`. Se verifica CADA token con su firma y se lee su audiencia:
// uno vencido o ajeno simplemente no cuenta — el veredicto decide qué se ve,
// nunca a qué responde el resto de la API.
const AUD_REALM = {
    [PLATFORM_AUDIENCE]: 'platform',
    [PORTAL_AUDIENCE]: 'portal',
    [ATTENDEE_AUDIENCE]: 'attendee',
};

export const viewerFromRequest = (req) => {
    const raw = clean(req.headers?.['x-viewer-tokens'] || '', 6000);
    const realms = [];
    const identities = [];
    for (const token of raw.split(',').map(t => t.trim()).filter(Boolean).slice(0, 3)) {
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            const realm = AUD_REALM[decoded.aud];
            if (!realm || realms.includes(realm)) continue;
            realms.push(realm);
            identities.push({ realm, id: String(decoded.id || decoded.sub || ''), email: decoded.email || null });
        } catch { /* vencido o ajeno: no cuenta */ }
    }
    const anonId = clean(req.headers?.['x-anon-id'] || '', 60);
    const primary = identities[0] || null;
    return {
        authenticated: identities.length > 0,
        realms,
        roles: rolesOf(realms),
        identities,
        realm: primary?.realm || null,
        id: primary?.id || null,
        email: primary?.email || null,
        anonId: isAnonId(anonId) ? anonId.toLowerCase() : null,
    };
};

// ── Lecturas base ────────────────────────────────────────────────────────────

const channelForClub = async (clubId, { activeOnly = true } = {}) => {
    if (!clubId) return null;
    const { rows } = await db.query(
        `SELECT * FROM "MediaChannel" WHERE "clubId" = $1 ${activeOnly ? 'AND active = true' : ''} ORDER BY "createdAt" ASC LIMIT 1`,
        [clubId]
    );
    return rows[0] || null;
};

const publishedVideos = async (channelId) => {
    const { rows } = await db.query(
        `SELECT v.*, m.url AS "mediaUrl", m."thumbUrl" AS "mediaThumbUrl"
           FROM "MediaChannelVideo" v
           JOIN "Media" m ON m.id = v."mediaId"
          WHERE v."channelId" = $1 AND v.status = 'publicado' AND v."accessMode" <> 'privado'`,
        [channelId]
    );
    return rows.sort(compareVideos);
};

const findPublishedVideo = async (channelId, slug) => {
    const { rows } = await db.query(
        `SELECT v.*, m.url AS "mediaUrl", m."thumbUrl" AS "mediaThumbUrl", m.filename
           FROM "MediaChannelVideo" v
           JOIN "Media" m ON m.id = v."mediaId"
          WHERE v."channelId" = $1 AND v.slug = $2 AND v.status = 'publicado' AND v."accessMode" <> 'privado'
          LIMIT 1`,
        [channelId, clean(slug, 120)]
    );
    return rows[0] || null;
};

const viewsByVideo = async (channelId) => {
    try {
        const { rows } = await db.query(
            `SELECT "videoId", SUM(count)::int AS n FROM "MediaChannelMetric"
              WHERE "channelId" = $1 AND type = 'video_view' AND "videoId" <> ''
              GROUP BY "videoId"`,
            [channelId]
        );
        return new Map(rows.map(r => [r.videoId, r.n]));
    } catch { return new Map(); }
};

// Contador diario agregado, patrón `bumpMetric` de campañas (v4.807). Nunca
// lanza: una métrica no puede tumbar una reproducción.
const bump = async ({ channelId, videoId = '', type, amount = 1 }) => {
    if (!channelId || !METRIC_TYPES.includes(type)) return false;
    try {
        await db.query(
            `INSERT INTO "MediaChannelMetric" ("channelId", "videoId", date, type, count)
             VALUES ($1, $2, CURRENT_DATE, $3, $4)
             ON CONFLICT ("channelId", "videoId", date, type)
             DO UPDATE SET count = "MediaChannelMetric".count + $4`,
            [channelId, videoId || '', type, Math.max(1, Math.round(Number(amount) || 1))]
        );
        return true;
    } catch (e) {
        console.error('[trainings] bump:', e?.message);
        return false;
    }
};

// El thumbnail efectivo de una ficha: el propio, o la miniatura del archivo.
const cardOf = (video, channel, views) => videoCard(
    { ...video, thumbUrl: video.thumbUrl || video.mediaThumbUrl || null },
    channel,
    { views: views ?? null }
);

// ── Público: el canal ────────────────────────────────────────────────────────

export const getPublicChannel = async (req, res) => {
    try {
        await ensureTrainingChannelSchema().catch(e => console.warn('[trainings] ensure:', e?.message));
        const clubId = clean(req.query.clubId, 60);
        const channel = await channelForClub(clubId);
        if (!channel) return res.json({ channel: null });

        const viewer = viewerFromRequest(req);
        const videos = await publishedVideos(channel.id);
        const views = await viewsByVideo(channel.id);
        const cards = videos.map(v => cardOf(v, channel, views.get(v.id) ?? 0));
        const categories = [...new Set(videos.map(v => v.category).filter(Boolean))];

        // «Continuar viendo»: sólo con sesión — el progreso anónimo existe
        // para la vista previa y la deduplicación, no para un carrusel.
        let continueWatching = [];
        const key = viewer.authenticated ? viewerKeyOf(viewer) : null;
        if (key && videos.length) {
            const { rows } = await db.query(
                `SELECT * FROM "MediaChannelProgress"
                  WHERE "viewerKey" = $1 AND "videoId" = ANY($2)
                    AND "completedAt" IS NULL AND "maxPositionSec" > 15
                  ORDER BY "updatedAt" DESC LIMIT 6`,
                [key, videos.map(v => v.id)]
            );
            const byId = new Map(videos.map(v => [v.id, v]));
            continueWatching = rows
                .map(r => {
                    const v = byId.get(r.videoId);
                    if (!v) return null;
                    return { ...cardOf(v, channel, views.get(v.id) ?? 0), resumeAt: resumePosition(r, v.durationSec), pctWatched: r.pctWatched };
                })
                .filter(Boolean);
        }

        return res.json({
            channel: {
                slug: channel.slug, name: channel.name, description: channel.description,
                bannerUrl: channel.bannerUrl, commentsEnabled: channel.commentsEnabled !== false,
            },
            videos: cards,
            categories,
            continueWatching,
            viewer: { authenticated: viewer.authenticated, roles: viewer.roles },
        });
    } catch (e) {
        // Página pública: degradar, nunca 500.
        console.error('[trainings] getPublicChannel:', e?.message);
        return res.json({ channel: null });
    }
};

// ── Público: la ficha de un video ────────────────────────────────────────────

export const getPublicVideo = async (req, res) => {
    try {
        await ensureTrainingChannelSchema().catch(() => {});
        const clubId = clean(req.query.clubId, 60);
        const channel = await channelForClub(clubId);
        if (!channel) return res.status(404).json({ error: 'Este sitio no tiene un canal de capacitaciones.' });

        const video = await findPublishedVideo(channel.id, req.query.slug);
        if (!video) return res.status(404).json({ error: 'Capacitación no encontrada.' });

        const viewer = viewerFromRequest(req);
        const verdict = accessVerdict({ video, channel, viewer });
        const views = await viewsByVideo(channel.id);

        // Otras capacitaciones del canal, para la columna «Más capacitaciones».
        const all = await publishedVideos(channel.id);
        const others = all.filter(v => v.id !== video.id).slice(0, 8).map(v => cardOf(v, channel, views.get(v.id) ?? 0));

        // «Me gusta» (v4.956): el contador sale de las filas de progreso —
        // una reacción por espectador, con o sin sesión— y se dice si ESTE
        // espectador ya la dio, para pintar el botón como corresponde.
        const key = viewerKeyOf(viewer);
        const [likesRow, likedRow] = await Promise.all([
            db.query('SELECT COUNT(*)::int AS n FROM "MediaChannelProgress" WHERE "videoId" = $1 AND "likedAt" IS NOT NULL', [video.id]).catch(() => ({ rows: [{ n: 0 }] })),
            key
                ? db.query('SELECT "likedAt" FROM "MediaChannelProgress" WHERE "videoId" = $1 AND "viewerKey" = $2 LIMIT 1', [video.id, key]).catch(() => ({ rows: [] }))
                : Promise.resolve({ rows: [] }),
        ]);

        return res.json({
            channel: {
                slug: channel.slug, name: channel.name,
                bannerUrl: channel.bannerUrl || null,
                // La fila del canal estilo YouTube: cuántas capacitaciones
                // publica, que es el dato honesto que tenemos (no hay
                // «suscriptores» y no se inventa uno).
                videosCount: all.length,
            },
            video: {
                ...cardOf(video, channel, views.get(video.id) ?? 0),
                description: video.description,
                commentsEnabled: resolveCommentsEnabled(video, channel),
                likes: likesRow.rows[0]?.n ?? 0,
                likedByViewer: Boolean(likedRow.rows[0]?.likedAt),
            },
            access: { allowed: verdict.allowed, reason: verdict.reason, allowedSec: verdict.allowedSec },
            viewer: { authenticated: viewer.authenticated, roles: viewer.roles },
            others,
        });
    } catch (e) {
        console.error('[trainings] getPublicVideo:', e?.message);
        return res.status(500).json({ error: 'No se pudo cargar la capacitación.', detail: clean(e?.message, 200) });
    }
};

// ── Público: el permiso de reproducción ──────────────────────────────────────
//
// ⚠️ La URL del archivo sólo viaja con veredicto favorable. El objeto de S3
// sigue siendo público —cero enlaces rotos—, así que esto acota la PÁGINA,
// no el objeto; lo que sí garantiza es que el reproductor del sitio nunca
// entregue más de lo que el veredicto dice, y que la posición de reanudación
// y la vista previa se decidan acá y no en el navegador.
export const watchVideo = async (req, res) => {
    try {
        await ensureTrainingChannelSchema().catch(() => {});
        const clubId = clean(req.body?.clubId, 60);
        const channel = await channelForClub(clubId);
        if (!channel) return res.status(404).json({ error: 'Canal no disponible.' });

        const video = await findPublishedVideo(channel.id, req.body?.slug);
        if (!video) return res.status(404).json({ error: 'Capacitación no encontrada.' });

        const viewer = viewerFromRequest(req);
        const verdict = accessVerdict({ video, channel, viewer });
        if (verdict.allowed === 'none') {
            return res.json({ allowed: 'none', reason: verdict.reason });
        }

        // Desde dónde reanudar: la fila de progreso del espectador (con sesión
        // o anónimo — al anónimo también le sirve para que un refresh no
        // reinicie su vista previa en cero conocimiento del servidor).
        const key = viewerKeyOf(viewer);
        let row = null;
        if (key) {
            const { rows } = await db.query(
                'SELECT * FROM "MediaChannelProgress" WHERE "videoId" = $1 AND "viewerKey" = $2 LIMIT 1',
                [video.id, key]
            );
            row = rows[0] || null;
        }

        const startAt = verdict.allowed === 'full'
            ? resumePosition(row, video.durationSec)
            // En vista previa se reanuda dentro del fragmento permitido.
            : Math.min(resumePosition(row, video.durationSec), Math.max(0, (verdict.allowedSec || 0) - 5));

        return res.json({
            allowed: verdict.allowed,
            allowedSec: verdict.allowedSec,
            url: video.mediaUrl,
            startAt,
            durationSec: video.durationSec,
            completionPct: channel.completionPct || 90,
        });
    } catch (e) {
        console.error('[trainings] watchVideo:', e?.message);
        return res.status(500).json({ error: 'No se pudo preparar la reproducción.', detail: clean(e?.message, 200) });
    }
};

// ── Público: el progreso ─────────────────────────────────────────────────────

export const reportProgress = async (req, res) => {
    try {
        await ensureTrainingChannelSchema().catch(() => {});
        const clubId = clean(req.body?.clubId, 60);
        const channel = await channelForClub(clubId);
        if (!channel) return res.json({ ok: false });
        const video = await findPublishedVideo(channel.id, req.body?.slug);
        if (!video) return res.json({ ok: false });

        const viewer = viewerFromRequest(req);
        const key = viewerKeyOf(viewer);
        if (!key) return res.json({ ok: false });

        // El veredicto también gobierna el progreso: un anónimo no puede
        // reportar posiciones más allá de su vista previa.
        const verdict = accessVerdict({ video, channel, viewer });
        if (verdict.allowed === 'none') return res.json({ ok: false });
        let positionSec = Math.max(0, Number(req.body?.positionSec) || 0);
        if (verdict.allowed === 'preview' && verdict.allowedSec) {
            positionSec = Math.min(positionSec, verdict.allowedSec);
        }

        const { rows } = await db.query(
            'SELECT * FROM "MediaChannelProgress" WHERE "videoId" = $1 AND "viewerKey" = $2 LIMIT 1',
            [video.id, key]
        );
        const prev = rows[0] || null;
        const next = applyProgress({
            row: prev,
            positionSec,
            deltaSec: req.body?.deltaSec,
            durationSec: video.durationSec,
            // La completitud sólo existe con sesión: un anónimo en vista
            // previa no puede «completar» una capacitación que no vio.
            completionPct: viewer.authenticated ? (channel.completionPct || 90) : 1000,
        });

        await db.query(
            `INSERT INTO "MediaChannelProgress"
                ("videoId", "viewerKey", "secondsWatched", "maxPositionSec", "pctWatched", "completedAt", "updatedAt")
             VALUES ($1, $2, $3, $4, $5, $6, NOW())
             ON CONFLICT ("videoId", "viewerKey")
             DO UPDATE SET "secondsWatched" = EXCLUDED."secondsWatched",
                           "maxPositionSec" = GREATEST("MediaChannelProgress"."maxPositionSec", EXCLUDED."maxPositionSec"),
                           "pctWatched" = GREATEST("MediaChannelProgress"."pctWatched", EXCLUDED."pctWatched"),
                           "completedAt" = COALESCE("MediaChannelProgress"."completedAt", EXCLUDED."completedAt"),
                           "updatedAt" = NOW()`,
            [video.id, key, next.secondsWatched, next.maxPositionSec, next.pctWatched, next.completedAt]
        );

        // Los segundos vistos y la completitud los escribe el SERVIDOR:
        // son los eventos que valen para los reportes.
        const delta = Math.min(Math.max(0, Number(req.body?.deltaSec) || 0), 60);
        if (delta > 0) await bump({ channelId: channel.id, videoId: video.id, type: 'watch_seconds', amount: delta });
        if (next.completedNow) await bump({ channelId: channel.id, videoId: video.id, type: 'completion' });

        return res.json({ ok: true, pctWatched: next.pctWatched, completed: Boolean(next.completedAt) });
    } catch (e) {
        console.error('[trainings] reportProgress:', e?.message);
        return res.json({ ok: false });
    }
};

// ── Público: métricas del navegador ──────────────────────────────────────────
//
// Freno de abuso en memoria, como el contador de campañas (v4.808): es un
// FRENO por instancia, no una garantía — alcanza para que un bucle no ensucie
// el panel. Los eventos que valen para conversión los escribe el servidor.
const brake = new Map();
const brakeOk = (ip) => {
    const now = Date.now();
    const entry = brake.get(ip) || { count: 0, since: now };
    if (now - entry.since > 60_000) { entry.count = 0; entry.since = now; }
    entry.count += 1;
    brake.set(ip, entry);
    if (brake.size > 5000) brake.clear();
    return entry.count <= 60;
};

export const trackEvent = async (req, res) => {
    try {
        const ip = clean((req.headers['x-forwarded-for'] || '').split(',')[0] || req.socket?.remoteAddress, 60);
        if (!brakeOk(ip)) return res.json({ ok: false });
        await ensureTrainingChannelSchema().catch(() => {});
        const type = clean(req.body?.type, 40);
        if (!CLIENT_METRIC_TYPES.includes(type)) return res.json({ ok: false });
        const channel = await channelForClub(clean(req.body?.clubId, 60));
        if (!channel) return res.json({ ok: false });
        let videoId = '';
        if (req.body?.slug) {
            const video = await findPublishedVideo(channel.id, req.body.slug);
            if (!video) return res.json({ ok: false });
            videoId = video.id;
            // El candado que se muestra queda además en la fila de progreso
            // del anónimo: es lo que responde «cuántos llegan al límite».
            if (type === 'preview_lock') {
                const key = viewerKeyOf(viewerFromRequest(req));
                if (key) {
                    await db.query(
                        `INSERT INTO "MediaChannelProgress" ("videoId", "viewerKey", "lockedAtSec", "updatedAt")
                         VALUES ($1, $2, $3, NOW())
                         ON CONFLICT ("videoId", "viewerKey")
                         DO UPDATE SET "lockedAtSec" = COALESCE("MediaChannelProgress"."lockedAtSec", EXCLUDED."lockedAtSec"), "updatedAt" = NOW()`,
                        [videoId, key, Math.max(0, Math.round(Number(req.body?.atSec) || 0))]
                    ).catch(() => {});
                }
            }
        }
        await bump({ channelId: channel.id, videoId, type });
        return res.json({ ok: true });
    } catch {
        return res.json({ ok: false });
    }
};

// ── Público: «Me gusta» ──────────────────────────────────────────────────────
//
// Una reacción POR ESPECTADOR (con sesión o anónimo), guardada en la misma
// fila del progreso: es un conmutador, no un contador que se pueda inflar
// pulsando — volver a pulsar la quita. Con el freno en memoria de siempre.
export const toggleLike = async (req, res) => {
    try {
        const ip = clean((req.headers['x-forwarded-for'] || '').split(',')[0] || req.socket?.remoteAddress, 60);
        if (!brakeOk(ip)) return res.json({ ok: false });
        await ensureTrainingChannelSchema().catch(() => {});
        const channel = await channelForClub(clean(req.body?.clubId, 60));
        if (!channel) return res.status(404).json({ error: 'Canal no disponible.' });
        const video = await findPublishedVideo(channel.id, req.body?.slug);
        if (!video) return res.status(404).json({ error: 'Capacitación no encontrada.' });
        const key = viewerKeyOf(viewerFromRequest(req));
        if (!key) return res.status(400).json({ error: 'No se pudo identificar el navegador.' });

        const liked = Boolean(req.body?.liked);
        await db.query(
            `INSERT INTO "MediaChannelProgress" ("videoId", "viewerKey", "likedAt", "updatedAt")
             VALUES ($1, $2, $3, NOW())
             ON CONFLICT ("videoId", "viewerKey")
             DO UPDATE SET "likedAt" = $3, "updatedAt" = NOW()`,
            [video.id, key, liked ? new Date() : null]
        );
        const { rows } = await db.query(
            'SELECT COUNT(*)::int AS n FROM "MediaChannelProgress" WHERE "videoId" = $1 AND "likedAt" IS NOT NULL',
            [video.id]
        );
        return res.json({ ok: true, liked, likes: rows[0]?.n ?? 0 });
    } catch (e) {
        console.error('[trainings] toggleLike:', e?.message);
        return res.status(500).json({ error: 'No se pudo registrar la reacción.', detail: clean(e?.message, 200) });
    }
};

// ── Público: comentarios ─────────────────────────────────────────────────────

const authorNameFor = async (identity) => {
    try {
        if (identity.realm === 'attendee') {
            const { rows } = await db.query('SELECT "firstName", "lastName" FROM "EventAttendeeAccount" WHERE id = $1 LIMIT 1', [identity.id]);
            const n = [rows[0]?.firstName, rows[0]?.lastName].filter(Boolean).join(' ').trim();
            if (n) return n;
        }
        if (identity.realm === 'portal') {
            const { rows } = await db.query('SELECT "clubName" FROM "ProjectFairAccount" WHERE id = $1 LIMIT 1', [identity.id]);
            if (rows[0]?.clubName) return rows[0].clubName;
        }
        if (identity.realm === 'platform') {
            const { rows } = await db.query('SELECT name FROM "User" WHERE id = $1 LIMIT 1', [identity.id]);
            if (rows[0]?.name) return rows[0].name;
        }
    } catch { /* el respaldo de abajo */ }
    // El local del correo, nunca el correo entero: es una página pública.
    return String(identity.email || 'Participante').split('@')[0];
};

export const listComments = async (req, res) => {
    try {
        await ensureTrainingChannelSchema().catch(() => {});
        const channel = await channelForClub(clean(req.query.clubId, 60));
        if (!channel) return res.json({ comments: [] });
        const video = await findPublishedVideo(channel.id, req.query.slug);
        if (!video || !resolveCommentsEnabled(video, channel)) return res.json({ comments: [] });
        const { rows } = await db.query(
            'SELECT * FROM "MediaChannelComment" WHERE "videoId" = $1 ORDER BY "createdAt" ASC LIMIT 500',
            [video.id]
        );
        return res.json({ comments: buildCommentTree(rows) });
    } catch (e) {
        console.error('[trainings] listComments:', e?.message);
        return res.json({ comments: [] });
    }
};

export const postComment = async (req, res) => {
    try {
        await ensureTrainingChannelSchema().catch(() => {});
        const viewer = viewerFromRequest(req);
        if (!viewer.authenticated) {
            return res.status(401).json({ error: 'Inicia sesión para comentar.' });
        }
        const channel = await channelForClub(clean(req.body?.clubId, 60));
        if (!channel) return res.status(404).json({ error: 'Canal no disponible.' });
        const video = await findPublishedVideo(channel.id, req.body?.slug);
        if (!video) return res.status(404).json({ error: 'Capacitación no encontrada.' });
        if (!resolveCommentsEnabled(video, channel)) {
            return res.status(403).json({ error: 'Los comentarios están desactivados en esta capacitación.' });
        }

        let parent = null;
        if (req.body?.parentId) {
            const { rows } = await db.query(
                'SELECT * FROM "MediaChannelComment" WHERE id = $1 AND "videoId" = $2 LIMIT 1',
                [clean(req.body.parentId, 60), video.id]
            );
            parent = rows[0] || null;
            if (!parent) return res.status(404).json({ error: 'El comentario al que respondes ya no existe.' });
        }

        const check = validateComment({ body: req.body?.body, parent });
        if (!check.ok) return res.status(400).json({ error: check.reason });

        const identity = viewer.identities[0];
        const authorName = await authorNameFor(identity);
        const { rows } = await db.query(
            `INSERT INTO "MediaChannelComment" ("videoId", "parentId", "authorRealm", "authorId", "authorName", body)
             VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
            [video.id, check.parentId, identity.realm, identity.id, authorName, check.body]
        );
        await bump({ channelId: channel.id, videoId: video.id, type: 'comment' });
        return res.json({ ok: true, comment: rows[0] });
    } catch (e) {
        console.error('[trainings] postComment:', e?.message);
        return res.status(500).json({ error: 'No se pudo publicar el comentario.', detail: clean(e?.message, 200) });
    }
};

// ── Público: crear cuenta desde el candado ───────────────────────────────────
//
// REUTILIZA la cuenta del Asistente al Evento (v4.655): una persona, una
// cuenta por correo, la misma que abre `/mi-inscripcion` y que `resolveSession`
// ya prueba en el ingreso unificado. No hay un segundo sistema de usuarios.
export const signupFromLock = async (req, res) => {
    try {
        await ensureTrainingChannelSchema().catch(() => {});
        const email = clean(req.body?.email, 200);
        const password = String(req.body?.password || '');
        const firstName = clean(req.body?.firstName, 120);
        const lastName = clean(req.body?.lastName, 120);

        const result = await ensureAttendeeAccount({ email, password, firstName, lastName, phone: '' });
        if (result.conflict === 'email') return res.status(400).json({ error: 'Escribe un correo válido.' });
        if (result.conflict === 'weak') return res.status(400).json({ error: 'La contraseña necesita al menos 8 caracteres.' });
        if (result.conflict === 'password') {
            return res.status(409).json({
                error: 'Ese correo ya tiene una cuenta. Inicia sesión con tu contraseña de siempre, o recupérala si la olvidaste.',
                exists: true,
            });
        }
        if (result.conflict || !result.account) {
            return res.status(500).json({ error: 'No pudimos crear la cuenta. Inténtalo de nuevo.' });
        }

        await auditLogin(req, { accountId: result.account.id, email, outcome: 'training_signup' });

        // La conversión la escribe el SERVIDOR: es el dato del panel.
        const channel = await channelForClub(clean(req.body?.clubId, 60));
        if (channel) {
            let videoId = '';
            if (req.body?.slug) {
                const video = await findPublishedVideo(channel.id, req.body.slug);
                if (video) videoId = video.id;
            }
            await bump({ channelId: channel.id, videoId, type: 'signup_from_lock' });
        }

        const session = await issueAttendeeSession(result.account);
        return res.json({ ok: true, created: Boolean(result.created), ...session });
    } catch (e) {
        console.error('[trainings] signupFromLock:', e?.message);
        return res.status(500).json({ error: 'No pudimos crear la cuenta.', detail: clean(e?.message, 200) });
    }
};

// ── SEO: el <head> del canal y de cada video ────────────────────────────────
//
// Lo consume el hook de `seoServe.js` (patrón `campaignSeoFor`, v4.807): los
// rastreadores de WhatsApp y las redes no ejecutan JavaScript, así que la
// tarjeta se resuelve en el servidor. DEGRADA siempre — corre en el catch-all
// de toda página pública. `notFound: true` es lo que convierte un slug muerto
// en un 404 de verdad en vez de un soft 404.
export const trainingSeoFor = async (clubId, pathname) => {
    try {
        await ensureTrainingChannelSchema();
        const channel = await channelForClub(clubId);
        const m = /^\/capacitaciones(?:\/([^/]+))?$/.exec(String(pathname || ''));
        if (!m) return null;
        const slug = m[1] ? decodeURIComponent(m[1]) : null;

        if (!slug) {
            if (!channel) return null;
            return {
                title: channel.seoTitle || channel.name,
                description: channel.seoDescription || clean(channel.description, 300) || null,
                image: channel.bannerUrl || null,
            };
        }

        if (!channel) return { notFound: true };
        const video = await findPublishedVideo(channel.id, slug);
        if (!video) return { notFound: true };
        return {
            title: video.title,
            description: clean(video.description, 300) || channel.seoDescription || null,
            image: video.thumbUrl || video.mediaThumbUrl || channel.bannerUrl || null,
        };
    } catch (e) {
        console.error('[trainings] trainingSeoFor:', e?.message);
        return null;
    }
};

// ── Administración (Biblioteca Multimedia) ───────────────────────────────────
//
// Mismo alcance que el resto de la Biblioteca: el sitio del token, y el
// operador de la plataforma puede pararse en otro pasando `clubId`.
const adminScopeOf = (req) => {
    const asked = req.query.clubId || req.body?.clubId || null;
    if (req.user.role === 'administrator') return asked || req.user.clubId || null;
    return req.user.clubId || null;
};

export const getAdminChannel = async (req, res) => {
    try {
        await ensureTrainingChannelSchema();
        const clubId = adminScopeOf(req);
        const folderId = clean(req.query.folderId, 60);
        if (!clubId || !folderId) return res.status(400).json({ error: 'Falta la carpeta.' });

        const { rows: channels } = await db.query(
            'SELECT * FROM "MediaChannel" WHERE "clubId" = $1 AND "folderId" = $2 LIMIT 1',
            [clubId, folderId]
        );
        const channel = channels[0] || null;

        // Los VIDEOS de la carpeta, con su ficha si la tienen. El aislamiento
        // va en el WHERE (v4.932): sólo archivos del sitio y de esa carpeta.
        // Los alias son EXPLÍCITOS a propósito: un `v.*` junto a `m.*` pisa
        // las columnas homónimas (id, thumbUrl) sin que nada avise.
        const { rows: media } = await db.query(
            `SELECT m.id AS "mediaId", m.filename, m.url, m."thumbUrl" AS "mediaThumbUrl",
                    m.size, m."createdAt" AS "uploadedAt",
                    v.id AS "fichaId", v.slug, v.title, v.description,
                    v."thumbUrl" AS "fichaThumbUrl", v."durationSec", v.category,
                    v.tags, v.instructor, v."publishedAt", v."previewSec",
                    v."accessMode", v."allowedRoles", v."commentsEnabled",
                    v.status, v."sortOrder"
               FROM "Media" m
               LEFT JOIN "MediaChannelVideo" v ON v."mediaId" = m.id AND v."channelId" = $3
              WHERE m."folderId" = $1 AND m."clubId" IS NOT DISTINCT FROM $2 AND m.type = 'video'
              ORDER BY m."createdAt" DESC`,
            [folderId, clubId, channel?.id || '']
        );

        return res.json({
            channel,
            videos: media.map(row => ({
                mediaId: row.mediaId,
                filename: row.filename,
                url: row.url,
                mediaThumbUrl: row.mediaThumbUrl,
                size: row.size,
                uploadedAt: row.uploadedAt,
                ficha: row.fichaId ? {
                    id: row.fichaId, slug: row.slug, title: row.title,
                    description: row.description, thumbUrl: row.fichaThumbUrl,
                    durationSec: row.durationSec, category: row.category,
                    tags: row.tags, instructor: row.instructor,
                    publishedAt: row.publishedAt, previewSec: row.previewSec,
                    accessMode: row.accessMode, allowedRoles: row.allowedRoles,
                    commentsEnabled: row.commentsEnabled, status: row.status,
                    sortOrder: row.sortOrder,
                } : null,
            })),
        });
    } catch (e) {
        console.error('[trainings] getAdminChannel:', e?.message);
        return res.status(500).json({ error: 'No se pudo cargar el canal.', detail: clean(e?.message, 200) });
    }
};

export const createChannel = async (req, res) => {
    try {
        await ensureTrainingChannelSchema();
        const clubId = adminScopeOf(req);
        const folderId = clean(req.body?.folderId, 60);
        if (!clubId || !folderId) return res.status(400).json({ error: 'Falta la carpeta.' });

        // La carpeta tiene que ser del sitio: sin esto, un id ajeno crearía
        // un canal sobre la biblioteca de otro.
        const { rows: folders } = await db.query(
            'SELECT id, name FROM "MediaFolder" WHERE id = $1 AND "clubId" IS NOT DISTINCT FROM $2 LIMIT 1',
            [folderId, clubId]
        );
        if (!folders[0]) return res.status(404).json({ error: 'Carpeta no encontrada.' });

        const { fields, errors } = sanitizeChannelPatch({
            name: req.body?.name || folders[0].name,
            description: req.body?.description ?? '',
            slug: req.body?.slug || 'capacitaciones',
        });
        if (errors.length) return res.status(400).json({ error: errors.join(' ') });

        const { rows } = await db.query(
            `INSERT INTO "MediaChannel" ("clubId", "folderId", slug, name, description, "createdBy")
             VALUES ($1,$2,$3,$4,$5,$6)
             ON CONFLICT ("clubId", "folderId") DO UPDATE SET "updatedAt" = NOW()
             RETURNING *`,
            [clubId, folderId, fields.slug || 'capacitaciones', fields.name, fields.description ?? '', req.user.id || req.user.email || null]
        );
        return res.json({ ok: true, channel: rows[0] });
    } catch (e) {
        console.error('[trainings] createChannel:', e?.message);
        return res.status(500).json({ error: 'No se pudo crear el canal.', detail: clean(e?.message, 200) });
    }
};

export const patchChannel = async (req, res) => {
    try {
        await ensureTrainingChannelSchema();
        const clubId = adminScopeOf(req);
        const { fields, errors } = sanitizeChannelPatch(req.body || {});
        if (errors.length) return res.status(400).json({ error: errors.join(' ') });
        const keys = Object.keys(fields);
        if (!keys.length) return res.status(400).json({ error: 'Nada que guardar.' });

        const sets = keys.map((k, i) => `"${k}" = $${i + 1}`).join(', ');
        const { rows } = await db.query(
            `UPDATE "MediaChannel" SET ${sets}, "updatedAt" = NOW()
              WHERE id = $${keys.length + 1} AND "clubId" = $${keys.length + 2}
              RETURNING *`,
            [...keys.map(k => fields[k]), clean(req.params.id, 60), clubId]
        );
        if (!rows[0]) return res.status(404).json({ error: 'Canal no encontrado.' });
        return res.json({ ok: true, channel: rows[0] });
    } catch (e) {
        console.error('[trainings] patchChannel:', e?.message);
        return res.status(500).json({ error: 'No se pudo guardar el canal.', detail: clean(e?.message, 200) });
    }
};

// Libera el slug con sufijo ANTES de escribir, y se AVISA (regla v4.873):
// un cambio silencioso manda a compartir una dirección que no es.
const freeVideoSlug = async (channelId, wanted, excludeId = null) => {
    let slug = wanted;
    for (let i = 2; i <= 30; i++) {
        const { rows } = await db.query(
            'SELECT id FROM "MediaChannelVideo" WHERE "channelId" = $1 AND slug = $2 LIMIT 1',
            [channelId, slug]
        );
        if (!rows[0] || rows[0].id === excludeId) return { slug, changed: slug !== wanted };
        slug = `${wanted}-${i}`;
    }
    return { slug: `${wanted}-${Date.now()}`, changed: true };
};

export const createVideoFicha = async (req, res) => {
    try {
        await ensureTrainingChannelSchema();
        const clubId = adminScopeOf(req);
        const channelId = clean(req.params.id, 60);
        const mediaId = clean(req.body?.mediaId, 60);

        const { rows: channels } = await db.query(
            'SELECT * FROM "MediaChannel" WHERE id = $1 AND "clubId" = $2 LIMIT 1', [channelId, clubId]);
        const channel = channels[0];
        if (!channel) return res.status(404).json({ error: 'Canal no encontrado.' });

        // El archivo tiene que ser un video DEL SITIO y de la carpeta del canal.
        const { rows: media } = await db.query(
            `SELECT id, filename, "thumbUrl" FROM "Media"
              WHERE id = $1 AND "clubId" IS NOT DISTINCT FROM $2 AND "folderId" = $3 AND type = 'video' LIMIT 1`,
            [mediaId, clubId, channel.folderId]
        );
        if (!media[0]) return res.status(404).json({ error: 'El archivo no está en la carpeta del canal.' });

        const title = clean(req.body?.title, 160) || String(media[0].filename || 'Capacitación').replace(/\.[a-z0-9]+$/i, '');
        const { slug, changed } = await freeVideoSlug(channelId, trainingSlug(title) || 'capacitacion');

        const { rows } = await db.query(
            `INSERT INTO "MediaChannelVideo" ("channelId", "mediaId", slug, title, "thumbUrl", "durationSec")
             VALUES ($1,$2,$3,$4,$5,$6)
             ON CONFLICT ("channelId", "mediaId") DO UPDATE SET "updatedAt" = NOW()
             RETURNING *`,
            [channelId, mediaId, slug, title, media[0].thumbUrl || null, Number(req.body?.durationSec) > 0 ? Math.round(Number(req.body.durationSec)) : null]
        );
        return res.json({ ok: true, ficha: rows[0], slugChanged: changed });
    } catch (e) {
        console.error('[trainings] createVideoFicha:', e?.message);
        return res.status(500).json({ error: 'No se pudo crear la ficha.', detail: clean(e?.message, 200) });
    }
};

export const patchVideoFicha = async (req, res) => {
    try {
        await ensureTrainingChannelSchema();
        const clubId = adminScopeOf(req);
        const id = clean(req.params.id, 60);

        const { fields, errors } = sanitizeVideoPatch(req.body || {});
        if (errors.length) return res.status(400).json({ error: errors.join(' ') });
        const keys = Object.keys(fields);
        if (!keys.length) return res.status(400).json({ error: 'Nada que guardar.' });

        // El aislamiento va en el WHERE: la ficha tiene que colgar de un canal
        // del sitio. Una ajena «no existe» (404, no 403).
        const { rows: current } = await db.query(
            `SELECT v.*, c."clubId" FROM "MediaChannelVideo" v
               JOIN "MediaChannel" c ON c.id = v."channelId"
              WHERE v.id = $1 AND c."clubId" = $2 LIMIT 1`,
            [id, clubId]
        );
        if (!current[0]) return res.status(404).json({ error: 'Ficha no encontrada.' });

        let slugChanged = false;
        if (fields.slug && fields.slug !== current[0].slug) {
            const freed = await freeVideoSlug(current[0].channelId, fields.slug, id);
            slugChanged = freed.changed;
            fields.slug = freed.slug;
        }

        const sets = keys.map((k, i) => `"${k}" = $${i + 1}`).join(', ');
        const { rows } = await db.query(
            `UPDATE "MediaChannelVideo" SET ${sets}, "updatedAt" = NOW() WHERE id = $${keys.length + 1} RETURNING *`,
            [...keys.map(k => fields[k]), id]
        );
        return res.json({ ok: true, ficha: rows[0], slugChanged });
    } catch (e) {
        console.error('[trainings] patchVideoFicha:', e?.message);
        return res.status(500).json({ error: 'No se pudo guardar la ficha.', detail: clean(e?.message, 200) });
    }
};

export const reorderVideos = async (req, res) => {
    try {
        await ensureTrainingChannelSchema();
        const clubId = adminScopeOf(req);
        const channelId = clean(req.params.id, 60);
        const order = Array.isArray(req.body?.order) ? req.body.order.map(v => clean(v, 60)).filter(Boolean) : [];
        if (!order.length) return res.status(400).json({ error: 'Falta el orden.' });

        const { rows: channels } = await db.query(
            'SELECT id FROM "MediaChannel" WHERE id = $1 AND "clubId" = $2 LIMIT 1', [channelId, clubId]);
        if (!channels[0]) return res.status(404).json({ error: 'Canal no encontrado.' });

        for (let i = 0; i < order.length; i++) {
            await db.query(
                'UPDATE "MediaChannelVideo" SET "sortOrder" = $1, "updatedAt" = NOW() WHERE id = $2 AND "channelId" = $3',
                [i, order[i], channelId]
            );
        }
        return res.json({ ok: true });
    } catch (e) {
        console.error('[trainings] reorderVideos:', e?.message);
        return res.status(500).json({ error: 'No se pudo guardar el orden.', detail: clean(e?.message, 200) });
    }
};

export const adminComments = async (req, res) => {
    try {
        await ensureTrainingChannelSchema();
        const clubId = adminScopeOf(req);
        const { rows } = await db.query(
            `SELECT cm.* FROM "MediaChannelComment" cm
               JOIN "MediaChannelVideo" v ON v.id = cm."videoId"
               JOIN "MediaChannel" c ON c.id = v."channelId"
              WHERE cm."videoId" = $1 AND c."clubId" = $2
              ORDER BY cm."createdAt" DESC LIMIT 500`,
            [clean(req.params.id, 60), clubId]
        );
        return res.json({ comments: rows });
    } catch (e) {
        console.error('[trainings] adminComments:', e?.message);
        return res.status(500).json({ error: 'No se pudieron cargar los comentarios.', detail: clean(e?.message, 200) });
    }
};

export const moderateComment = async (req, res) => {
    try {
        await ensureTrainingChannelSchema();
        const clubId = adminScopeOf(req);
        const status = clean(req.body?.status, 20);
        const wantsPin = Object.prototype.hasOwnProperty.call(req.body || {}, 'pinned');
        if (status && !['visible', 'oculto', 'spam', 'borrado'].includes(status)) {
            return res.status(400).json({ error: 'Estado desconocido.' });
        }
        // El aislamiento en el WHERE otra vez: el comentario tiene que colgar
        // de un video de un canal del sitio.
        const { rows } = await db.query(
            `UPDATE "MediaChannelComment" cm
                SET status = COALESCE(NULLIF($1, ''), cm.status),
                    pinned = CASE WHEN $2 THEN $3 ELSE cm.pinned END,
                    "updatedAt" = NOW()
               FROM "MediaChannelVideo" v, "MediaChannel" c
              WHERE cm.id = $4 AND v.id = cm."videoId" AND c.id = v."channelId" AND c."clubId" = $5
              RETURNING cm.*`,
            [status, wantsPin, Boolean(req.body?.pinned), clean(req.params.id, 60), clubId]
        );
        if (!rows[0]) return res.status(404).json({ error: 'Comentario no encontrado.' });
        return res.json({ ok: true, comment: rows[0] });
    } catch (e) {
        console.error('[trainings] moderateComment:', e?.message);
        return res.status(500).json({ error: 'No se pudo moderar.', detail: clean(e?.message, 200) });
    }
};

export const adminMetrics = async (req, res) => {
    try {
        await ensureTrainingChannelSchema();
        const clubId = adminScopeOf(req);
        const channelId = clean(req.params.id, 60);
        const { rows: channels } = await db.query(
            'SELECT id FROM "MediaChannel" WHERE id = $1 AND "clubId" = $2 LIMIT 1', [channelId, clubId]);
        if (!channels[0]) return res.status(404).json({ error: 'Canal no encontrado.' });

        const [counters, progress] = await Promise.all([
            db.query(
                `SELECT "videoId", type, SUM(count)::int AS n
                   FROM "MediaChannelMetric" WHERE "channelId" = $1
                  GROUP BY "videoId", type`,
                [channelId]
            ),
            db.query(
                `SELECT p."videoId",
                        COUNT(DISTINCT p."viewerKey")::int AS viewers,
                        COUNT(DISTINCT p."viewerKey") FILTER (WHERE p."viewerKey" NOT LIKE 'anon:%')::int AS "authedViewers",
                        COALESCE(AVG(p."secondsWatched"), 0)::int AS "avgWatchSec",
                        COALESCE(AVG(p."pctWatched"), 0)::int AS "avgPct",
                        COUNT(*) FILTER (WHERE p."completedAt" IS NOT NULL)::int AS completions,
                        COUNT(*) FILTER (WHERE p."lockedAtSec" IS NOT NULL)::int AS locked,
                        COUNT(*) FILTER (WHERE p."likedAt" IS NOT NULL)::int AS likes
                   FROM "MediaChannelProgress" p
                   JOIN "MediaChannelVideo" v ON v.id = p."videoId"
                  WHERE v."channelId" = $1
                  GROUP BY p."videoId"`,
                [channelId]
            ),
        ]);
        return res.json({ counters: counters.rows, progress: progress.rows });
    } catch (e) {
        console.error('[trainings] adminMetrics:', e?.message);
        return res.status(500).json({ error: 'No se pudieron cargar las métricas.', detail: clean(e?.message, 200) });
    }
};

// ── Admin: la miniatura desde un FOTOGRAMA del propio video (v4.956) ─────────
//
// Como en YouTube: el administrador elige el segundo y la plataforma extrae
// ese fotograma. Se hace en el SERVIDOR con el MISMO runner de ffmpeg del
// Creador de Reels —leyendo de la URL, sin bajar el video (v4.935)— porque
// dibujar un video de S3 en un canvas del navegador lo deja «tainted» y
// `toBlob` lanza (la lección del proxy de Plantillas IA). El JPEG sube al
// mismo bucket con el cliente de la Biblioteca: ningún segundo camino a S3.
export const extractVideoFrame = async (req, res) => {
    try {
        await ensureTrainingChannelSchema();
        const clubId = adminScopeOf(req);
        const id = clean(req.params.id, 60);
        const atSec = Math.max(0, Math.round(Number(req.body?.atSec) || 0));

        // El aislamiento va en el WHERE: la ficha tiene que colgar de un canal
        // del sitio, y de ella sale el archivo REAL — el navegador no puede
        // nombrar otra URL.
        const { rows } = await db.query(
            `SELECT v.id, m.url, m.bucket, m."s3Key"
               FROM "MediaChannelVideo" v
               JOIN "MediaChannel" c ON c.id = v."channelId"
               JOIN "Media" m ON m.id = v."mediaId"
              WHERE v.id = $1 AND c."clubId" = $2 LIMIT 1`,
            [id, clubId]
        );
        const target = rows[0];
        if (!target) return res.status(404).json({ error: 'Ficha no encontrada.' });

        const { runFfmpeg, withTempDir, isFfmpegAvailable } = await import('../lib/reelFfmpeg.js');
        if (!(await isFfmpegAvailable())) {
            return res.status(503).json({ error: 'El extractor de fotogramas no está disponible en este entorno.' });
        }

        const frame = await withTempDir(async (dir) => {
            const out = `${dir}/frame.jpg`;
            // `-ss` ANTES de `-i`: busca por rangos HTTP sin recorrer el
            // archivo — es lo que hace viable un video de dos horas.
            await runFfmpeg(['-ss', String(atSec), '-i', target.url, '-frames:v', '1', '-q:v', '3', out],
                { timeoutMs: 60_000, label: 'fotograma de capacitación' });
            const { readFile } = await import('fs/promises');
            return readFile(out);
        });

        // Se acota a 1280 px de ancho: es una miniatura, no un póster.
        const { default: sharp } = await import('sharp');
        const jpeg = await sharp(frame).resize({ width: 1280, withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();

        const { getUploadDeps, publicUrlFor } = await import('../routes/media.js');
        const { s3, PutObjectCommand } = await getUploadDeps();
        const baseDir = String(target.s3Key || '').includes('/')
            ? String(target.s3Key).slice(0, String(target.s3Key).lastIndexOf('/'))
            : '';
        const key = `${baseDir ? `${baseDir}/` : ''}frames/${target.id}-${atSec}-${Date.now()}.jpg`;
        await s3.send(new PutObjectCommand({
            Bucket: target.bucket, Key: key, Body: jpeg, ContentType: 'image/jpeg',
            CacheControl: 'public, max-age=31536000, immutable',
        }));

        return res.json({ ok: true, url: publicUrlFor(target.bucket, key), atSec });
    } catch (e) {
        console.error('[trainings] extractVideoFrame:', e?.message);
        return res.status(500).json({ error: 'No se pudo extraer el fotograma.', detail: clean(e?.message, 200) });
    }
};

export default {
    viewerFromRequest, getPublicChannel, getPublicVideo, watchVideo,
    reportProgress, trackEvent, toggleLike, listComments, postComment,
    signupFromLock, trainingSeoFor, getAdminChannel, createChannel,
    patchChannel, createVideoFicha, patchVideoFicha, reorderVideos,
    adminComments, moderateComment, adminMetrics, extractVideoFrame,
};
