// ════════════════════════════════════════════════════════════════════════════
// Canal de Capacitaciones — EL CRITERIO (v4.954)
// ════════════════════════════════════════════════════════════════════════════
//
// Un canal público de videos —estilo YouTube/Learning Hub— montado SOBRE la
// Biblioteca Multimedia: una carpeta del sitio se convierte en canal, y cada
// video de esa carpeta puede publicarse con su propia ficha (título público,
// slug, acceso, vista previa, comentarios). Nada se mueve, nada se duplica:
// la ficha vive en una tabla RELACIONADA (`MediaChannelVideo` → `Media`), el
// archivo sigue donde está y su URL de S3 no se toca — cero enlaces rotos.
//
// Este archivo es PURO: sin base, sin red, sin IA, sin DOM. Igual que
// `seoRules.js` frente a `seoAudit.js` — un criterio de acceso que sólo se
// ejercita contra una base real termina sin pruebas, y entonces nadie se
// entera de que una regla cambió de signo. La I/O vive en el controlador.
//
// ⚠️ LO QUE ESTE MÓDULO GARANTIZA Y LO QUE NO — dicho para no descubrirlo
// después: los archivos de la Biblioteca son objetos PÚBLICOS de S3 y tienen
// que seguir siéndolo (cero enlaces rotos es requisito expreso). El control de
// acceso es DE LA PLATAFORMA —la página, el reproductor, el veredicto del
// servidor y las métricas—, no del objeto: quien tenga la URL cruda de S3
// sigue pudiendo descargar el archivo. Esto NO es DRM y no se afirma como tal.
// ════════════════════════════════════════════════════════════════════════════

import { slugify } from './seoSpec.js';

// ── Catálogos CERRADOS ───────────────────────────────────────────────────────

/**
 * Modos de acceso de un video. Catálogo cerrado: un modo que no está acá no se
 * puede guardar ni evaluar — sin esa puerta, un valor inventado en la base
 * dejaría el veredicto en una rama que nadie escribió.
 */
export const ACCESS_MODES = ['publico', 'preview', 'autenticados', 'roles', 'privado'];

export const ACCESS_MODE_LABELS = {
    publico: 'Público completo',
    preview: 'Vista previa pública + completo autenticado',
    autenticados: 'Solo autenticados',
    roles: 'Solo roles específicos',
    privado: 'Privado (no visible)',
};

/**
 * Estados de la ficha de un video. Sólo `publicado` sale al canal público; los
 * otros tres existen para que el administrador prepare, esconda o retire sin
 * borrar nada.
 */
export const VIDEO_STATES = ['borrador', 'publicado', 'oculto', 'archivado'];

export const VIDEO_STATE_LABELS = {
    borrador: 'Borrador',
    publicado: 'Publicado',
    oculto: 'Oculto',
    archivado: 'Archivado',
};

/**
 * Roles del ESPECTADOR, derivados de las tres identidades que ya existen
 * (v4.655/v4.711). NO es un segundo sistema de roles: es la traducción de las
 * identidades reales a etiquetas que un video puede exigir. Los roles se
 * ACUMULAN — quien tiene sesión de plataforma y de asistente lleva los de las
 * dos—. Las reglas futuras (inscrito a un evento, pagó, distrito/club) entran
 * como etiquetas nuevas de este catálogo sin tocar el veredicto.
 */
export const VIEWER_ROLES = ['registrado', 'asistente_evento', 'postulante', 'admin_sitio'];

export const VIEWER_ROLE_LABELS = {
    registrado: 'Usuario registrado',
    asistente_evento: 'Participante de evento',
    postulante: 'Club postulante',
    admin_sitio: 'Administrador del sitio',
};

/** Qué roles aporta cada identidad (realm de `siteSession.ts`). */
export const REALM_ROLES = {
    platform: ['registrado', 'admin_sitio'],
    portal: ['registrado', 'postulante'],
    attendee: ['registrado', 'asistente_evento'],
};

/** Opciones sugeridas de vista previa (segundos). Un valor libre también vale. */
export const PREVIEW_CHOICES = [30, 60, 90, 120];
export const DEFAULT_PREVIEW_SEC = 60;
export const DEFAULT_COMPLETION_PCT = 90;

/**
 * Eventos del contador diario. Catálogo CERRADO, como `METRIC_TYPES` de
 * campañas (v4.807): sin la puerta, el endpoint público sería un contador
 * arbitrario. Los que valen para conversión los escribe el SERVIDOR
 * (`signup_from_lock` en el alta, `completion` en el progreso, `comment` al
 * comentar); el navegador sólo puede reportar los de vista y el candado.
 */
export const METRIC_TYPES = [
    'channel_view', 'video_view', 'preview_lock', 'login_from_lock',
    'signup_from_lock', 'completion', 'comment', 'watch_seconds',
];
export const CLIENT_METRIC_TYPES = ['channel_view', 'video_view', 'preview_lock', 'login_from_lock'];

/** Estados de un comentario. `borrado` conserva la fila: sus respuestas cuelgan de ella. */
export const COMMENT_STATES = ['visible', 'oculto', 'spam', 'borrado'];

export const COMMENT_MAX_LEN = 2000;

// ── Utilidades ───────────────────────────────────────────────────────────────

const clean = (v, max = 300) => String(v ?? '').trim().slice(0, max);
// `Number(null)` es 0 — la trampa que convierte «hereda» en «cero» y un
// `sortOrder` ausente en «primero». Ausente ES null acá, nunca 0.
const toInt = (v) => {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? Math.round(n) : null;
};

/** El slug de un video/canal. NO se escribe un segundo slugify (regla v4.873). */
export const trainingSlug = (text) => slugify(text, 75);

/**
 * Identificador anónimo del navegador. Es un UUID que el cliente genera y
 * conserva en localStorage: sirve para que la vista previa no se reinicie con
 * un refresh y para deduplicar vistas, sin fingerprinting — quien borre su
 * almacenamiento empieza de cero, y eso es lo respetuoso.
 */
export const isAnonId = (v) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v || ''));

/**
 * La clave del espectador para progreso y deduplicación: `realm:id` para una
 * sesión real, `anon:<uuid>` para el visitante. UNA clave por persona-contexto;
 * con sesión gana la sesión (el progreso tiene que seguir a la persona, no al
 * navegador).
 */
export const viewerKeyOf = (viewer) => {
    if (viewer?.realm && viewer?.id) return `${viewer.realm}:${viewer.id}`;
    if (viewer?.anonId && isAnonId(viewer.anonId)) return `anon:${viewer.anonId.toLowerCase()}`;
    return null;
};

/** Roles efectivos de un espectador a partir de sus identidades abiertas. */
export const rolesOf = (realms = []) => {
    const out = new Set();
    for (const r of realms) for (const role of (REALM_ROLES[r] || [])) out.add(role);
    return [...out];
};

// ── Herencia de la vista previa ──────────────────────────────────────────────

/**
 * Cuántos segundos de vista previa le tocan a ESTE video: los suyos si los
 * declara, los del canal si no. `0` explícito en el video es una decisión
 * («sin vista previa») y se respeta — la regla de `undefined` vs valor
 * (v4.877): ausente hereda, presente manda.
 */
export const resolvePreviewSec = (video, channel) => {
    const own = toInt(video?.previewSec);
    if (own !== null && own >= 0) return own;
    const def = toInt(channel?.defaultPreviewSec);
    return def !== null && def >= 0 ? def : DEFAULT_PREVIEW_SEC;
};

/** Igual con los comentarios: NULL hereda del canal. */
export const resolveCommentsEnabled = (video, channel) => {
    if (video?.commentsEnabled === true || video?.commentsEnabled === false) return video.commentsEnabled;
    return channel?.commentsEnabled !== false;
};

// ── El veredicto de acceso ───────────────────────────────────────────────────

/**
 * Decide qué puede ver un espectador de un video. ÚNICO punto de decisión:
 * lo consumen el endpoint /watch, la página del video y el candado — con dos
 * criterios, el candado diría una cosa y el servidor entregaría otra.
 *
 * @returns {{ allowed: 'full'|'preview'|'none', reason: string|null, allowedSec: number|null }}
 *   `allowedSec` es el TOPE DE POSICIÓN de la vista previa (los primeros N
 *   segundos), no un presupuesto que se gasta: refrescar repite el mismo
 *   fragmento, nunca regala segundos nuevos.
 */
export const accessVerdict = ({ video, channel, viewer }) => {
    const mode = ACCESS_MODES.includes(video?.accessMode) ? video.accessMode : 'publico';
    const authed = Boolean(viewer?.authenticated);
    const roles = Array.isArray(viewer?.roles) ? viewer.roles : [];

    if (mode === 'privado') return { allowed: 'none', reason: 'privado', allowedSec: null };
    if (mode === 'publico') return { allowed: 'full', reason: null, allowedSec: null };

    if (mode === 'preview') {
        if (authed) return { allowed: 'full', reason: null, allowedSec: null };
        const sec = resolvePreviewSec(video, channel);
        if (sec <= 0) return { allowed: 'none', reason: 'auth', allowedSec: null };
        return { allowed: 'preview', reason: 'preview', allowedSec: sec };
    }

    if (mode === 'autenticados') {
        return authed
            ? { allowed: 'full', reason: null, allowedSec: null }
            : { allowed: 'none', reason: 'auth', allowedSec: null };
    }

    // roles: primero hay que estar dentro; después, tener el rol.
    if (!authed) return { allowed: 'none', reason: 'auth', allowedSec: null };
    const wanted = Array.isArray(video?.allowedRoles) ? video.allowedRoles : [];
    // Un video de modo `roles` SIN roles declarados equivale a `autenticados`:
    // exigir un rol de una lista vacía dejaría el video inalcanzable para
    // todos sin que nadie lo haya decidido.
    if (!wanted.length || wanted.some(r => roles.includes(r))) {
        return { allowed: 'full', reason: null, allowedSec: null };
    }
    return { allowed: 'none', reason: 'sin_rol', allowedSec: null };
};

// ── Visibilidad pública ──────────────────────────────────────────────────────

/** Sólo lo publicado existe para el canal público; `privado` tampoco se lista. */
export const isPubliclyListed = (video) =>
    video?.status === 'publicado' && video?.accessMode !== 'privado';

/**
 * Orden de las tarjetas: el MANUAL del administrador manda (`sortOrder`
 * ascendente); a igualdad, lo más nuevo primero, y de último el id — estable a
 * propósito, como `pickDistrictSite`: el mismo canal no puede verse en otro
 * orden en cada visita.
 */
export const compareVideos = (a, b) => {
    const sa = toInt(a?.sortOrder), sb = toInt(b?.sortOrder);
    if (sa !== null && sb !== null && sa !== sb) return sa - sb;
    if (sa !== null && sb === null) return -1;
    if (sa === null && sb !== null) return 1;
    const da = Date.parse(a?.publishedAt || a?.createdAt || 0) || 0;
    const db = Date.parse(b?.publishedAt || b?.createdAt || 0) || 0;
    if (da !== db) return db - da;
    return String(a?.id || '').localeCompare(String(b?.id || ''));
};

/**
 * Búsqueda tradicional sobre lo que la ficha declara: título, descripción,
 * instructor, categoría y etiquetas. Sin IA a propósito — es una lista corta
 * y una búsqueda que no se puede explicar no sirve para encontrar.
 */
export const matchesSearch = (video, term) => {
    const q = clean(term, 120).toLowerCase();
    if (!q) return true;
    const hay = [
        video?.title, video?.description, video?.instructor, video?.category,
        ...(Array.isArray(video?.tags) ? video.tags : []),
    ].filter(Boolean).join(' ').toLowerCase();
    return q.split(/\s+/).every(w => hay.includes(w));
};

// ── Progreso y completitud ───────────────────────────────────────────────────

/**
 * Aplica un latido de progreso sobre la fila guardada. El navegador reporta
 * POSICIÓN y DELTA vistos; el criterio decide qué se escribe:
 *  - `secondsWatched` sólo CRECE, y cada delta se acota al intervalo real —
 *    un delta inflado no puede regalar una completitud.
 *  - `maxPositionSec` sólo avanza.
 *  - `completedAt` se sella UNA vez, cuando el porcentaje visto llega al
 *    umbral del canal. No se des-completa jamás.
 */
export const applyProgress = ({ row, positionSec, deltaSec, durationSec, completionPct, now = new Date() }) => {
    const dur = Math.max(0, Number(durationSec) || 0);
    const pos = Math.min(Math.max(0, Number(positionSec) || 0), dur || Number(positionSec) || 0);
    const delta = Math.min(Math.max(0, Number(deltaSec) || 0), 60); // un latido cada ~10 s: más de 60 es un reporte roto
    const prevWatched = Math.max(0, Number(row?.secondsWatched) || 0);
    const prevMax = Math.max(0, Number(row?.maxPositionSec) || 0);

    const secondsWatched = prevWatched + delta;
    const maxPositionSec = Math.max(prevMax, pos);
    const pct = dur > 0 ? Math.min(100, Math.round((maxPositionSec / dur) * 100)) : 0;
    const threshold = toInt(completionPct) ?? DEFAULT_COMPLETION_PCT;
    const wasCompleted = Boolean(row?.completedAt);
    const completedNow = !wasCompleted && dur > 0 && pct >= threshold;

    return {
        secondsWatched,
        maxPositionSec,
        pctWatched: pct,
        completedAt: wasCompleted ? row.completedAt : (completedNow ? now : null),
        completedNow,
    };
};

/**
 * Desde dónde reanudar. Un video casi terminado (o completado) arranca del
 * principio: reanudar en el segundo final es ofrecer tres segundos de video.
 */
export const resumePosition = (row, durationSec) => {
    const pos = Math.max(0, Number(row?.maxPositionSec) || 0);
    const dur = Math.max(0, Number(durationSec) || 0);
    if (!pos || !dur) return 0;
    if (pos >= dur * 0.95) return 0;
    // Se retrocede un pelo para que la reanudación tenga contexto.
    return Math.max(0, Math.floor(pos) - 3);
};

// ── Comentarios ──────────────────────────────────────────────────────────────

/**
 * Valida un comentario que llega del navegador. El cuerpo se guarda como
 * TEXTO y se pinta como texto (nunca HTML): la validación acota, no sanea
 * marcado que no se va a interpretar.
 */
export const validateComment = ({ body, parent }) => {
    const text = clean(body, COMMENT_MAX_LEN + 1);
    if (!text) return { ok: false, reason: 'Escribe el comentario antes de enviarlo.' };
    if (text.length > COMMENT_MAX_LEN) return { ok: false, reason: `El comentario supera los ${COMMENT_MAX_LEN} caracteres.` };
    // Un nivel de respuesta: responder a una respuesta cuelga del comentario
    // raíz, así el hilo no crece en profundidad infinita.
    const parentId = parent ? (parent.parentId || parent.id) : null;
    return { ok: true, body: text, parentId };
};

/**
 * Arma el árbol plano→anidado para la pantalla: raíces ordenadas (fijados
 * primero, luego los más nuevos) con sus respuestas en orden cronológico.
 * Un comentario `borrado` con respuestas vivas se conserva como hueco
 * («Comentario eliminado»); sin respuestas, desaparece.
 */
export const buildCommentTree = (rows = []) => {
    const visible = rows.filter(r => r.status === 'visible' || r.status === 'borrado');
    const roots = visible.filter(r => !r.parentId);
    const byParent = new Map();
    for (const r of visible) {
        if (!r.parentId) continue;
        if (!byParent.has(r.parentId)) byParent.set(r.parentId, []);
        byParent.get(r.parentId).push(r);
    }
    const ts = (r) => Date.parse(r.createdAt || 0) || 0;
    return roots
        .map(root => ({ ...root, replies: (byParent.get(root.id) || []).filter(r => r.status === 'visible').sort((a, b) => ts(a) - ts(b)) }))
        .filter(root => root.status === 'visible' || root.replies.length)
        // Boolean() antes de Number(): un `pinned` ausente daría NaN y el
        // NaN se traga la prioridad del fijado sin que nada avise.
        .sort((a, b) => (Number(Boolean(b.pinned)) - Number(Boolean(a.pinned))) || (ts(b) - ts(a)));
};

// ── Saneado de lo que escribe el administrador ───────────────────────────────

/**
 * Catálogo CERRADO de lo editable en la ficha de un video (patrón
 * `stripProtected` / `MAILBOX_EDITABLE`): lo que no está acá no se puede ni
 * expresar en la petición. `mediaId`, `channelId` y los contadores quedan
 * fuera a propósito.
 */
export const sanitizeVideoPatch = (input = {}) => {
    const out = {};
    const errors = [];
    const has = (k) => Object.prototype.hasOwnProperty.call(input, k);

    if (has('title')) out.title = clean(input.title, 160);
    if (has('description')) out.description = clean(input.description, 4000);
    if (has('slug')) {
        const s = trainingSlug(input.slug || out.title || '');
        if (!s) errors.push('El slug no puede quedar vacío.');
        else out.slug = s;
    }
    if (has('thumbUrl')) out.thumbUrl = clean(input.thumbUrl, 800) || null;
    if (has('category')) out.category = clean(input.category, 80) || null;
    if (has('instructor')) out.instructor = clean(input.instructor, 160) || null;
    if (has('tags')) {
        out.tags = Array.isArray(input.tags)
            ? input.tags.map(t => clean(t, 50)).filter(Boolean).slice(0, 15)
            : [];
    }
    if (has('durationSec')) {
        const d = toInt(input.durationSec);
        out.durationSec = d !== null && d > 0 ? d : null;
    }
    if (has('publishedAt')) {
        const d = input.publishedAt ? new Date(input.publishedAt) : null;
        out.publishedAt = d && !Number.isNaN(d.getTime()) ? d : null;
    }
    if (has('previewSec')) {
        // NULL = hereda del canal; un número (incluido 0) es decisión propia.
        if (input.previewSec === null || input.previewSec === '') out.previewSec = null;
        else {
            const p = toInt(input.previewSec);
            if (p === null || p < 0 || p > 3600) errors.push('La vista previa va de 0 a 3600 segundos.');
            else out.previewSec = p;
        }
    }
    if (has('accessMode')) {
        if (!ACCESS_MODES.includes(input.accessMode)) errors.push('Modo de acceso desconocido.');
        else out.accessMode = input.accessMode;
    }
    if (has('allowedRoles')) {
        out.allowedRoles = Array.isArray(input.allowedRoles)
            ? input.allowedRoles.filter(r => VIEWER_ROLES.includes(r))
            : [];
    }
    if (has('commentsEnabled')) {
        out.commentsEnabled = input.commentsEnabled === null ? null : Boolean(input.commentsEnabled);
    }
    if (has('status')) {
        if (!VIDEO_STATES.includes(input.status)) errors.push('Estado desconocido.');
        else out.status = input.status;
    }
    if (has('sortOrder')) {
        const s = toInt(input.sortOrder);
        out.sortOrder = s === null ? null : s;
    }
    return { fields: out, errors };
};

/** Lo editable del CANAL, con el mismo cierre. */
export const sanitizeChannelPatch = (input = {}) => {
    const out = {};
    const errors = [];
    const has = (k) => Object.prototype.hasOwnProperty.call(input, k);

    if (has('name')) {
        out.name = clean(input.name, 160);
        if (!out.name) errors.push('El canal necesita un nombre.');
    }
    if (has('description')) out.description = clean(input.description, 4000);
    if (has('bannerUrl')) out.bannerUrl = clean(input.bannerUrl, 800) || null;
    if (has('slug')) {
        const s = trainingSlug(input.slug || out.name || '');
        if (!s) errors.push('El slug no puede quedar vacío.');
        else out.slug = s;
    }
    if (has('defaultPreviewSec')) {
        const p = toInt(input.defaultPreviewSec);
        if (p === null || p < 0 || p > 3600) errors.push('La vista previa por defecto va de 0 a 3600 segundos.');
        else out.defaultPreviewSec = p;
    }
    if (has('completionPct')) {
        const p = toInt(input.completionPct);
        if (p === null || p < 50 || p > 100) errors.push('El umbral de completitud va de 50 a 100 %.');
        else out.completionPct = p;
    }
    if (has('commentsEnabled')) out.commentsEnabled = Boolean(input.commentsEnabled);
    if (has('active')) out.active = Boolean(input.active);
    if (has('seoTitle')) out.seoTitle = clean(input.seoTitle, 160) || null;
    if (has('seoDescription')) out.seoDescription = clean(input.seoDescription, 300) || null;
    return { fields: out, errors };
};

// ── La vista pública ─────────────────────────────────────────────────────────

/** La tarjeta que ve el visitante: nada interno viaja (ni mediaId, ni contadores crudos). */
export const videoCard = (video, channel, { views = null } = {}) => ({
    slug: video.slug,
    title: video.title,
    description: clean(video.description, 240),
    thumbUrl: video.thumbUrl || null,
    durationSec: toInt(video.durationSec),
    category: video.category || null,
    tags: Array.isArray(video.tags) ? video.tags : [],
    instructor: video.instructor || null,
    publishedAt: video.publishedAt || video.createdAt || null,
    accessMode: ACCESS_MODES.includes(video.accessMode) ? video.accessMode : 'publico',
    previewSec: video.accessMode === 'preview' ? resolvePreviewSec(video, channel) : null,
    views: views === null ? null : toInt(views),
});

export const fmtDuration = (sec) => {
    const s = Math.max(0, toInt(sec) ?? 0);
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
    const mm = String(m).padStart(h ? 2 : 1, '0'), rr = String(r).padStart(2, '0');
    return h ? `${h}:${mm}:${rr}` : `${mm}:${rr}`;
};

export default {
    ACCESS_MODES, ACCESS_MODE_LABELS, VIDEO_STATES, VIDEO_STATE_LABELS,
    VIEWER_ROLES, VIEWER_ROLE_LABELS, REALM_ROLES, PREVIEW_CHOICES,
    DEFAULT_PREVIEW_SEC, DEFAULT_COMPLETION_PCT, METRIC_TYPES,
    CLIENT_METRIC_TYPES, COMMENT_STATES, COMMENT_MAX_LEN,
    trainingSlug, isAnonId, viewerKeyOf, rolesOf, resolvePreviewSec,
    resolveCommentsEnabled, accessVerdict, isPubliclyListed, compareVideos,
    matchesSearch, applyProgress, resumePosition, validateComment,
    buildCommentTree, sanitizeVideoPatch, sanitizeChannelPatch, videoCard,
    fmtDuration,
};
