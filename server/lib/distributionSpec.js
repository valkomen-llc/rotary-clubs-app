/**
 * Distribución multi-destino — EL CRITERIO.
 *
 * v4.864 — Puro: sin base, sin red, sin IA, sin DOM. Vive aparte de
 * `distributionQueue.js`, que orquesta, por el mismo motivo que `seoRules.js`
 * vive aparte de `seoAudit.js`: un motor de cola que sólo se ejercita contra
 * Meta real termina sin pruebas, y entonces nadie se entera de que una regla
 * cambió de signo.
 *
 * ⚠️ POR QUÉ NO HAY GRUPOS POR API, Y NO ES UN PENDIENTE:
 *
 *   Meta retiró la Facebook Groups API el 22 de abril de 2024, de TODAS las
 *   versiones, junto con los permisos `publish_to_groups` y
 *   `groups_access_member_info` y la capacidad de que un administrador instale
 *   una app en su grupo. No hay endpoint, no hay permiso que solicitar y no hay
 *   App Review que pase.
 *
 *   La trampa que hay que descartar: `metaService.js` fija v18.0 y el anuncio
 *   dice «en v19». Fijar una versión vieja NO devuelve la capacidad — el propio
 *   anuncio dice «removed from all versions» y quedó confirmado en el foro de
 *   Meta que ocurre igual en v18 y anteriores.
 *
 *   Lo único que queda para un grupo es que una persona publique a mano. Eso es
 *   `group_manual`: la cola prepara el trabajo y registra el resultado, pero NO
 *   publica. Está declarado con `viaApi: false` para que ninguna rama del
 *   despacho pueda confundirlo con un destino que se resuelve solo.
 */

import crypto from 'crypto';

// ── Destinos ────────────────────────────────────────────────────────────────
//
// `viaApi` es el campo que decide si la cola llama al proveedor o deja el job
// esperando a una persona. No se deduce del nombre del tipo: se declara.
export const TARGET_TYPES = {
    page: {
        label: 'Página de Facebook',
        viaApi: true,
        platform: 'facebook',
        supports: ['text', 'link', 'image', 'video'],
    },
    instagram: {
        label: 'Instagram',
        viaApi: true,
        platform: 'instagram',
        // Instagram NO admite enlaces en el pie. Declararlo acá es lo que
        // impide ofrecer en la pantalla un destino que va a fallar seguro.
        supports: ['image', 'video'],
    },
    group_manual: {
        label: 'Grupo de Facebook',
        viaApi: false,
        platform: 'facebook',
        supports: ['text', 'link', 'image', 'video'],
    },
};

export const TARGET_TYPE_IDS = Object.keys(TARGET_TYPES);
export const isTargetType = (t) => Object.prototype.hasOwnProperty.call(TARGET_TYPES, t);
export const publishesViaApi = (t) => !!TARGET_TYPES[t]?.viaApi;

/**
 * El aviso que acompaña a un destino que NO publica solo.
 *
 * Vive acá y no suelto en el JSX porque es una afirmación sobre cómo se
 * comporta el módulo, no una etiqueta: si la pantalla dijera «distribuir a 25
 * grupos» y en realidad dejara 25 tareas manuales, se leería como una función
 * rota. Es la regla del modo Fotográfico del Creador de Reels (v4.798): un modo
 * que se comporta distinto lo avisa junto al botón que lo dispara.
 */
export const MANUAL_NOTICE = 'Meta retiró la API de Grupos el 22 de abril de 2024. La plataforma deja el texto y el archivo listos y registra el resultado; publicar en el grupo lo hace una persona.';

// ── Tipos de contenido ──────────────────────────────────────────────────────
export const CONTENT_KINDS = {
    text: { label: 'Solo texto', needsMedia: false, needsLink: false },
    link: { label: 'Enlace', needsMedia: false, needsLink: true },
    image: { label: 'Imagen', needsMedia: true, needsLink: false },
    video: { label: 'Video', needsMedia: true, needsLink: false },
};
export const CONTENT_KIND_IDS = Object.keys(CONTENT_KINDS);
export const isContentKind = (k) => Object.prototype.hasOwnProperty.call(CONTENT_KINDS, k);

/** ¿Este destino puede con este contenido? Decide qué destinos se ofrecen. */
export const targetSupports = (targetType, contentKind) =>
    !!TARGET_TYPES[targetType]?.supports.includes(contentKind);

// ── Estados ─────────────────────────────────────────────────────────────────
//
// Los diez del pedido, más `awaiting_manual`, que es el único que el pedido no
// preveía porque suponía que los grupos se resolvían por API. Un job manual que
// llegó a su hora no está «procesando» —nadie lo está procesando— ni
// «pendiente» —ya venció—: está esperando a una persona, y decirlo con su
// propio estado es lo que permite contarlo aparte en el resumen.
export const JOB_STATES = {
    pending:         { label: 'Pendiente',            terminal: false, counts: 'abierto' },
    scheduled:       { label: 'Programada',           terminal: false, counts: 'abierto' },
    processing:      { label: 'Procesando',           terminal: false, counts: 'abierto' },
    awaiting_manual: { label: 'Esperando publicación', terminal: false, counts: 'abierto' },
    published:       { label: 'Publicada',            terminal: true,  counts: 'ok' },
    failed:          { label: 'Fallida',              terminal: true,  counts: 'fallo' },
    no_permission:   { label: 'Sin permisos',         terminal: true,  counts: 'fallo' },
    rate_limited:    { label: 'Límite alcanzado',     terminal: false, counts: 'abierto' },
    needs_reconnect: { label: 'Requiere reconexión',  terminal: true,  counts: 'fallo' },
    paused:          { label: 'Pausada',              terminal: false, counts: 'abierto' },
    cancelled:       { label: 'Cancelada',            terminal: true,  counts: 'cancelado' },
};
export const JOB_STATE_IDS = Object.keys(JOB_STATES);
export const isJobState = (s) => Object.prototype.hasOwnProperty.call(JOB_STATES, s);

export const CAMPAIGN_STATES = {
    draft:     { label: 'Borrador' },
    scheduled: { label: 'Programada' },
    running:   { label: 'En curso' },
    paused:    { label: 'Pausada' },
    done:      { label: 'Completada' },
    partial:   { label: 'Completada con fallos' },
    failed:    { label: 'Fallida' },
    cancelled: { label: 'Cancelada' },
};
export const CAMPAIGN_STATE_IDS = Object.keys(CAMPAIGN_STATES);

// ── Intervalos ──────────────────────────────────────────────────────────────
//
// El piso son 5 minutos y no es una preferencia: el cron corre cada minuto, así
// que prometer «cada 30 segundos» sería una promesa que la infraestructura no
// cumple. Mismo criterio que el intervalo de lectura del panorama de campañas.
export const MIN_INTERVAL_MINUTES = 5;
export const MAX_INTERVAL_MINUTES = 1440;
export const INTERVAL_PRESETS = [5, 10, 15, 30, 60];

/** Acota un intervalo pedido. Devuelve el valor y, si se movió, el motivo. */
export const normalizeInterval = (minutes) => {
    const n = Math.round(Number(minutes));
    if (!Number.isFinite(n) || n <= 0) {
        return { minutes: INTERVAL_PRESETS[2], adjusted: true, reason: 'Intervalo inválido; se usa el de 15 minutos.' };
    }
    if (n < MIN_INTERVAL_MINUTES) {
        return { minutes: MIN_INTERVAL_MINUTES, adjusted: true, reason: `El mínimo son ${MIN_INTERVAL_MINUTES} minutos: la cola se revisa una vez por minuto y por debajo de eso la cadencia no se puede sostener.` };
    }
    if (n > MAX_INTERVAL_MINUTES) {
        return { minutes: MAX_INTERVAL_MINUTES, adjusted: true, reason: 'El máximo es un día entre publicaciones.' };
    }
    return { minutes: n, adjusted: false, reason: null };
};

// ── Límites de seguridad ────────────────────────────────────────────────────
export const DEFAULT_LIMITS = {
    maxTargets: 40,      // destinos por campaña
    maxPerHour: 12,
    maxPerDay: 60,
    cooldownMinutes: 30, // espera tras una tanda de errores
    maxAttempts: 3,
};

export const normalizeLimits = (raw = {}) => {
    const num = (v, def, min, max) => {
        const n = Math.round(Number(v));
        if (!Number.isFinite(n)) return def;
        return Math.min(max, Math.max(min, n));
    };
    return {
        maxTargets: num(raw.maxTargets, DEFAULT_LIMITS.maxTargets, 1, 200),
        maxPerHour: num(raw.maxPerHour, DEFAULT_LIMITS.maxPerHour, 1, 120),
        maxPerDay: num(raw.maxPerDay, DEFAULT_LIMITS.maxPerDay, 1, 500),
        cooldownMinutes: num(raw.cooldownMinutes, DEFAULT_LIMITS.cooldownMinutes, 1, 1440),
        maxAttempts: num(raw.maxAttempts, DEFAULT_LIMITS.maxAttempts, 1, 10),
    };
};

// ── Zona horaria ────────────────────────────────────────────────────────────
//
// La función corre en UTC y «las 8 de la mañana» no significa lo mismo en
// Bogotá que en Madrid — hay clubes en varios países. Todo el cálculo del
// calendario se hace en la zona del sitio y se guarda en UTC.

/** Minutos de desfase de `tz` respecto de UTC en ese instante (con horario de verano). */
export const zoneOffsetMinutes = (date, tz) => {
    try {
        const dtf = new Intl.DateTimeFormat('en-US', {
            timeZone: tz, hour12: false,
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit',
        });
        const p = {};
        for (const part of dtf.formatToParts(date)) {
            if (part.type !== 'literal') p[part.type] = part.value;
        }
        const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, (+p.hour) % 24, +p.minute, +p.second);
        return Math.round((asUTC - date.getTime()) / 60000);
    } catch {
        return 0; // zona desconocida: se trabaja en UTC en vez de fallar
    }
};

/** Año, mes, día, hora y minuto LOCALES de un instante. */
export const zonedParts = (date, tz) => {
    const off = zoneOffsetMinutes(date, tz);
    const shifted = new Date(date.getTime() + off * 60000);
    return {
        year: shifted.getUTCFullYear(),
        month: shifted.getUTCMonth() + 1,
        day: shifted.getUTCDate(),
        hour: shifted.getUTCHours(),
        minute: shifted.getUTCMinutes(),
        minuteOfDay: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
        dateKey: `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}-${String(shifted.getUTCDate()).padStart(2, '0')}`,
    };
};

/** El instante UTC de una hora LOCAL. Se recalcula el desfase por si cruzó un cambio de hora. */
export const instantFromZoned = ({ year, month, day, hour = 0, minute = 0 }, tz) => {
    const naive = Date.UTC(year, month - 1, day, hour, minute);
    const off1 = zoneOffsetMinutes(new Date(naive), tz);
    let t = naive - off1 * 60000;
    const off2 = zoneOffsetMinutes(new Date(t), tz);
    if (off2 !== off1) t = naive - off2 * 60000;
    return new Date(t);
};

/** 'HH:MM' → minutos desde medianoche. `null` si no se entiende. */
export const parseClock = (s) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '').trim());
    if (!m) return null;
    const h = +m[1], mi = +m[2];
    if (h > 23 || mi > 59) return null;
    return h * 60 + mi;
};

// ── El calendario ───────────────────────────────────────────────────────────
//
// El intervalo NO es un `sleep`: cada job nace con su hora ya calculada y el
// cron recoge los que vencieron. Así la cadencia sobrevive a que la función
// muera, a que el usuario cierre la pestaña y a un despliegue en medio.

const addMinutes = (d, m) => new Date(d.getTime() + m * 60000);

/**
 * Reparte `count` destinos a partir de `startAt`, cada `intervalMinutes`,
 * dentro de la ventana horaria y sin pasar de `perDay` por día local.
 *
 * `window` es { from: 'HH:MM', to: 'HH:MM' } en hora del sitio. Lo que no cabe
 * en el día se empuja al comienzo de la ventana del día siguiente, en vez de
 * dispararse de madrugada.
 */
export const buildSchedule = ({
    startAt,
    intervalMinutes,
    count,
    timezone = 'UTC',
    window: win = null,
    perDay = null,
    now = new Date(),
}) => {
    const n = Math.max(0, Math.round(Number(count) || 0));
    if (n === 0) return [];

    const { minutes: step } = normalizeInterval(intervalMinutes);
    const from = win ? parseClock(win.from) : null;
    const to = win ? parseClock(win.to) : null;
    const hasWindow = from !== null && to !== null && to > from;

    let cursor = startAt instanceof Date ? new Date(startAt) : new Date(startAt || now);
    if (!Number.isFinite(cursor.getTime())) cursor = new Date(now);
    // Nunca se programa hacia atrás: una campaña «para ayer» saldría toda de
    // golpe en la primera vuelta del cron, que es justo lo que el intervalo
    // existe para evitar.
    if (cursor.getTime() < now.getTime()) cursor = new Date(now);

    const openAt = (parts) => instantFromZoned({ ...parts, hour: Math.floor(from / 60), minute: from % 60 }, timezone);

    const intoWindow = (d) => {
        if (!hasWindow) return d;
        const p = zonedParts(d, timezone);
        if (p.minuteOfDay < from) return openAt(p);
        if (p.minuteOfDay > to) {
            const next = new Date(instantFromZoned({ ...p, hour: 12, minute: 0 }, timezone).getTime() + 24 * 3600_000);
            return openAt(zonedParts(next, timezone));
        }
        return d;
    };

    const nextDayOpen = (d) => {
        const p = zonedParts(d, timezone);
        const next = new Date(instantFromZoned({ ...p, hour: 12, minute: 0 }, timezone).getTime() + 24 * 3600_000);
        const np = zonedParts(next, timezone);
        return hasWindow ? openAt(np) : instantFromZoned({ ...np, hour: 0, minute: 0 }, timezone);
    };

    const out = [];
    const perDayCount = new Map();
    const cap = Number.isFinite(Number(perDay)) && Number(perDay) > 0 ? Math.round(Number(perDay)) : null;

    for (let i = 0; i < n; i++) {
        cursor = intoWindow(cursor);
        if (cap) {
            // Guardia de vueltas: sin ella, un `perDay` de 0 colado por otra vía
            // giraría para siempre. Nunca debería hacer falta más de `n` saltos.
            let guard = 0;
            while ((perDayCount.get(zonedParts(cursor, timezone).dateKey) || 0) >= cap && guard++ < n + 2) {
                cursor = intoWindow(nextDayOpen(cursor));
            }
        }
        const parts = zonedParts(cursor, timezone);
        perDayCount.set(parts.dateKey, (perDayCount.get(parts.dateKey) || 0) + 1);
        out.push({ index: i, at: new Date(cursor), dateKey: parts.dateKey });
        cursor = addMinutes(cursor, step);
    }
    return out;
};

/** Agrupa el calendario por día local, para la línea de tiempo de la pantalla. */
export const groupScheduleByDay = (slots, timezone = 'UTC') => {
    const days = new Map();
    for (const s of slots) {
        const key = s.dateKey || zonedParts(s.at, timezone).dateKey;
        if (!days.has(key)) days.set(key, []);
        days.get(key).push(s);
    }
    return [...days.entries()].map(([dateKey, items]) => ({ dateKey, items }));
};

// ── Errores de Meta ─────────────────────────────────────────────────────────
//
// Lo que decide el comportamiento no es el número sino la CLASE. El error se
// guarda TEXTUAL —regla ya establecida en el CRM con `metaCode`/`metaDetails`—:
// convertirlo en «no se pudo publicar» deja a quien corrige sin saber si el
// problema es el token, el permiso o la política.

const RATE_CODES = new Set([4, 17, 32, 613, 80001, 80002, 80003, 80004]);
const PERMISSION_CODES = new Set([10, 200, 299, 3, 803]);
const TOKEN_CODES = new Set([190, 102, 463, 467]);
const POLICY_CODES = new Set([368, 1404006, 1404078]);
const TRANSIENT_CODES = new Set([1, 2]);

/**
 * Traduce la respuesta de Meta a una decisión de la cola.
 *
 * ⚠️ `retryable` por omisión es FALSE. Ante la duda no se reintenta: un aviso
 * que no sale se ve en el historial y se relanza a mano; uno que sale cinco
 * veces ya salió. Es la regla de `NotificationDelivery` (v4.855) y acá lo que
 * protege es la reputación de la app del Distrito.
 */
export const classifyMetaError = ({ code, subcode, message, httpStatus, network } = {}) => {
    const n = Number(code);
    const sub = Number(subcode);
    const text = String(message || '');

    if (network) {
        return { kind: 'transient', status: 'failed', retryable: true, pauseCampaign: false, waitMinutes: null,
            reason: 'No se pudo alcanzar a Meta.' };
    }
    // El subcódigo 458/459/460/463/464 es sesión: el usuario tiene que reconectar.
    if (TOKEN_CODES.has(n) || [458, 459, 460, 463, 464, 467].includes(sub)) {
        return { kind: 'token', status: 'needs_reconnect', retryable: false, pauseCampaign: true, waitMinutes: null,
            reason: 'El token de la cuenta ya no sirve. Hay que reconectarla en Cuentas Sociales.' };
    }
    if (POLICY_CODES.has(n) || /policy|temporarily blocked|spam/i.test(text)) {
        // Insistir ante un bloqueo por política es la conducta que Meta lee como
        // abuso, y lo que está en juego es la app entera, no una campaña.
        return { kind: 'policy', status: 'failed', retryable: false, pauseCampaign: true, waitMinutes: null,
            reason: 'Meta bloqueó la publicación por política. La campaña se detiene y no se reintenta.' };
    }
    if (RATE_CODES.has(n) || httpStatus === 429 || /rate limit|too many calls|request limit/i.test(text)) {
        return { kind: 'rate', status: 'rate_limited', retryable: true, pauseCampaign: true, waitMinutes: 60,
            reason: 'Meta pidió frenar. La campaña queda en pausa y se retoma más tarde.' };
    }
    if (PERMISSION_CODES.has(n) || /permission|not authorized|insufficient/i.test(text)) {
        return { kind: 'permission', status: 'no_permission', retryable: false, pauseCampaign: false, waitMinutes: null,
            reason: 'La cuenta conectada no tiene permiso para publicar en este destino.' };
    }
    if (TRANSIENT_CODES.has(n) || (httpStatus >= 500 && httpStatus < 600)) {
        return { kind: 'transient', status: 'failed', retryable: true, pauseCampaign: false, waitMinutes: null,
            reason: 'Fallo temporal del proveedor.' };
    }
    return { kind: 'unknown', status: 'failed', retryable: false, pauseCampaign: false, waitMinutes: null,
        reason: text || 'Meta rechazó la publicación.' };
};

/** Espera creciente entre reintentos. El intento 1 espera 2 min; el 3, media hora. */
export const RETRY_BACKOFF_MINUTES = [2, 8, 30];
export const retryDelayMinutes = (attempt) =>
    RETRY_BACKOFF_MINUTES[Math.min(Math.max(0, attempt - 1), RETRY_BACKOFF_MINUTES.length - 1)];

/** ¿Se vuelve a intentar este job? Junta la clasificación con el tope de intentos. */
export const shouldRetry = ({ verdict, attempts, limits = DEFAULT_LIMITS }) =>
    !!verdict?.retryable && attempts < limits.maxAttempts;

// ── Idempotencia ────────────────────────────────────────────────────────────
//
// La llave es campaña + destino + contenido. Quien decide NO es una lectura
// previa: entre el SELECT y el INSERT caben dos vueltas del cron y el resultado
// serían dos publicaciones idénticas en la misma Página. Es el mismo
// razonamiento que sostiene la llave de `NotificationDelivery` y el
// `providerRef` único del webhook de Stripe.
//
// Las tres partes son obligatorias, así que el índice único NO es parcial y su
// `ON CONFLICT` no tiene que repetir ningún predicado — la trampa que costó una
// corrección real en v4.648.

/** Huella estable del contenido. Estable = las mismas claves dan el mismo hash. */
export const contentHash = (content = {}) => {
    const stable = {
        kind: content.kind || 'text',
        message: (content.message || '').trim(),
        link: (content.link || '').trim(),
        mediaUrl: (content.mediaUrl || '').trim(),
    };
    return crypto.createHash('sha256').update(JSON.stringify(stable)).digest('hex').slice(0, 32);
};

export const idempotencyKey = ({ campaignId, targetId, hash }) => {
    if (!campaignId || !targetId || !hash) throw new Error('idempotencyKey necesita campaña, destino y contenido');
    return `${campaignId}:${targetId}:${hash}`;
};

// ── Resumen de la campaña ───────────────────────────────────────────────────
//
// UNA CAMPAÑA CON DESTINOS FALLIDOS NUNCA SE MARCA COMO EXITOSA. Es exigencia
// expresa del pedido y además la regla que `SocialPublication` ya trae con su
// estado `partial`.

export const summarizeJobs = (jobs = []) => {
    const counts = { total: jobs.length, ok: 0, fallo: 0, abierto: 0, cancelado: 0, manual: 0 };
    for (const j of jobs) {
        const bucket = JOB_STATES[j.status]?.counts;
        if (bucket) counts[bucket] += 1;
        if (j.status === 'awaiting_manual') counts.manual += 1;
    }
    return counts;
};

export const foldCampaignStatus = (jobs = [], { cancelled = false, paused = false } = {}) => {
    if (cancelled) return 'cancelled';
    const c = summarizeJobs(jobs);
    if (c.total === 0) return 'draft';
    if (paused) return 'paused';
    if (c.abierto > 0) return 'running';
    if (c.ok > 0 && c.fallo > 0) return 'partial';
    if (c.ok > 0) return 'done';
    if (c.fallo > 0) return 'failed';
    return 'cancelled';
};

// ── Validación previa ───────────────────────────────────────────────────────
//
// Se separa en `errors` —no se puede programar— y `warnings` —se puede, y hay
// que decirlo—: tratarlos igual convierte cualquier aviso en un bloqueo y se
// dejan de leer. Mismo criterio que `validateBeforeGenerate` en las Infografías.

export const validateCampaign = ({ content = {}, targets = [], intervalMinutes, limits: rawLimits } = {}) => {
    const errors = [];
    const warnings = [];
    const limits = normalizeLimits(rawLimits);
    const kind = content.kind;

    if (!isContentKind(kind)) {
        errors.push('Elegí qué se va a publicar: texto, enlace, imagen o video.');
    } else {
        const spec = CONTENT_KINDS[kind];
        if (spec.needsMedia && !content.mediaUrl) errors.push('Falta el archivo: este tipo de publicación lleva imagen o video.');
        if (spec.needsLink && !content.link) errors.push('Falta el enlace.');
        if (kind === 'text' && !(content.message || '').trim()) errors.push('Falta el texto de la publicación.');
    }

    if (!targets.length) errors.push('Elegí al menos un destino.');
    if (targets.length > limits.maxTargets) {
        errors.push(`Son ${targets.length} destinos y el tope de la campaña es ${limits.maxTargets}. Subilo en los límites o partí la campaña.`);
    }

    const incompatibles = targets.filter(t => isContentKind(kind) && !targetSupports(t.targetType, kind));
    for (const t of incompatibles) {
        // Se nombra el destino y el motivo. «Algunos destinos no admiten este
        // contenido» obliga a adivinar cuáles.
        warnings.push(`${t.targetName || t.targetId}: ${TARGET_TYPES[t.targetType]?.label || t.targetType} no admite «${CONTENT_KINDS[kind]?.label || kind}». Ese destino se deja fuera.`);
    }

    const manual = targets.filter(t => !publishesViaApi(t.targetType));
    if (manual.length) {
        warnings.push(`${manual.length} ${manual.length === 1 ? 'destino es un grupo y no se publica solo' : 'destinos son grupos y no se publican solos'}. ${MANUAL_NOTICE}`);
    }

    const { minutes, adjusted, reason } = normalizeInterval(intervalMinutes);
    if (adjusted && reason) warnings.push(reason);

    const perApi = targets.filter(t => publishesViaApi(t.targetType)).length;
    const porHora = Math.ceil(60 / minutes);
    if (perApi && porHora > limits.maxPerHour) {
        warnings.push(`Con un intervalo de ${minutes} min saldrían ${porHora} publicaciones por hora y el límite son ${limits.maxPerHour}. La cola va a espaciarlas.`);
    }

    return {
        ok: errors.length === 0,
        errors,
        warnings,
        interval: minutes,
        eligible: targets.filter(t => !isContentKind(kind) || targetSupports(t.targetType, kind)),
        limits,
    };
};

export default {
    TARGET_TYPES, TARGET_TYPE_IDS, isTargetType, publishesViaApi, targetSupports, MANUAL_NOTICE,
    CONTENT_KINDS, CONTENT_KIND_IDS, isContentKind,
    JOB_STATES, JOB_STATE_IDS, isJobState, CAMPAIGN_STATES, CAMPAIGN_STATE_IDS,
    MIN_INTERVAL_MINUTES, MAX_INTERVAL_MINUTES, INTERVAL_PRESETS, normalizeInterval,
    DEFAULT_LIMITS, normalizeLimits,
    zoneOffsetMinutes, zonedParts, instantFromZoned, parseClock,
    buildSchedule, groupScheduleByDay,
    classifyMetaError, RETRY_BACKOFF_MINUTES, retryDelayMinutes, shouldRetry,
    contentHash, idempotencyKey,
    summarizeJobs, foldCampaignStatus, validateCampaign,
};
