// ════════════════════════════════════════════════════════════════════════════
// El ciclo de vida de un evento — v4.1247
//
// Hasta v4.1246 `GET /clubs/:clubId/events` devolvía TODOS los eventos del sitio
// y `/eventos` los pintaba tal cual: el «Instituto Rotary Cancún 2026» (17–19 de
// septiembre) seguía promocionándose como próximo en octubre. Nadie lo había
// ocultado porque no había nada que decidiera que un evento ya pasó.
//
// Acá vive ESE criterio, una sola vez, para el servidor, el sitio público y el
// panel (el navegador importa este mismo archivo, como `videoEditorSpec.js`).
//
// Dos ejes que NO se mezclan:
//
//   · Estado EDITORIAL — lo decide una persona y se guarda:
//       `metadata.status` = 'draft' | 'published' | 'cancelled'.
//       Sin valor = 'published': así se comportaban todos los eventos que ya
//       existen, y ninguno cambia por esta versión.
//
//   · Estado TEMPORAL — se CALCULA en cada lectura, nunca se guarda:
//       'upcoming' (próximo) | 'ongoing' (en curso) | 'finished' (finalizado)
//       | 'tbd' (fecha por confirmar).
//       Guardarlo obligaría a una tarea programada que lo mantenga al día y
//       dejaría la base contradiciendo al reloj entre una pasada y otra.
//
// ── Reglas de vigencia ──────────────────────────────────────────────────────
//
//   1. Con fecha de fin posterior al inicio:
//        antes del inicio → próximo; desde el inicio hasta el fin → en curso;
//        después del fin → finalizado.
//   2. Sin fecha de fin (sólo inicio, con o sin hora): el evento sigue VIGENTE
//      todo su día calendario, en la zona horaria del evento, y pasa a
//      finalizado a las 00:00 del día siguiente. No se inventa una duración
//      («dos horas», «tres horas»): el día local es la única frontera que los
//      datos permiten afirmar.
//   3. «Todo el día» (`metadata.allDay`): sin hora. Empieza a las 00:00 del día
//      de inicio y termina al cerrar el día de fin (o el de inicio, si no hay
//      fin), siempre en la zona del evento.
//   4. «Fecha por confirmar» (`metadata.dateTbd`): ni próximo ni finalizado.
//      `startDate` es obligatorio en la tabla, así que puede guardar un valor de
//      relleno: con esta marca se IGNORA y nunca se muestra.
//   5. Una fecha de fin anterior al inicio es un error de captura: se ignora y
//      rige la regla 2.
//
// ── Zona horaria ────────────────────────────────────────────────────────────
//
// `startDate`/`endDate` son instantes absolutos (UTC en la base). La zona sólo
// decide DÓNDE cae la medianoche de las reglas 2 y 3 y cómo se escribe la hora.
// Se resuelve en este orden:
//   evento (`metadata.timezone`) → sitio (Setting `events_timezone`) →
//   país del sitio → `EVENTS_DEFAULT_TIMEZONE` → America/Bogota.
// Así un evento en Cancún, en Madrid o en Puerto Madryn se evalúa con SU
// medianoche, no con la del servidor (UTC) ni con la del visitante.
// ════════════════════════════════════════════════════════════════════════════

export const EDITORIAL_STATUSES = ['draft', 'published', 'cancelled'];
export const TEMPORAL_STATUSES = ['upcoming', 'ongoing', 'finished', 'tbd'];

/** Respaldo final: la zona institucional de la plataforma. */
export const PLATFORM_TIMEZONE = 'America/Bogota';

/**
 * Las claves de `metadata` que este módulo escribe. El servidor las trata como
 * parte de la capacidad «info» del evento (`EVENT_FIELDS_BY_CAPABILITY`).
 */
export const LIFECYCLE_METADATA_KEYS = ['status', 'timezone', 'dateTbd', 'allDay'];

/** Zona por país del sitio, para los sitios que no eligieron una. */
const COUNTRY_TIMEZONES = {
    colombia: 'America/Bogota',
    mexico: 'America/Mexico_City',
    'méxico': 'America/Mexico_City',
    argentina: 'America/Argentina/Buenos_Aires',
    peru: 'America/Lima',
    'perú': 'America/Lima',
    ecuador: 'America/Guayaquil',
    chile: 'America/Santiago',
    venezuela: 'America/Caracas',
    panama: 'America/Panama',
    'panamá': 'America/Panama',
    bolivia: 'America/La_Paz',
    paraguay: 'America/Asuncion',
    uruguay: 'America/Montevideo',
    brasil: 'America/Sao_Paulo',
    brazil: 'America/Sao_Paulo',
    'costa rica': 'America/Costa_Rica',
    guatemala: 'America/Guatemala',
    honduras: 'America/Tegucigalpa',
    'el salvador': 'America/El_Salvador',
    nicaragua: 'America/Managua',
    'república dominicana': 'America/Santo_Domingo',
    'republica dominicana': 'America/Santo_Domingo',
    'puerto rico': 'America/Puerto_Rico',
    cuba: 'America/Havana',
    'españa': 'Europe/Madrid',
    espana: 'Europe/Madrid',
    spain: 'Europe/Madrid',
};

/** Las zonas que ofrece el panel. Cualquier otra IANA válida también sirve. */
export const TIMEZONE_OPTIONS = [
    { value: 'America/Bogota', label: 'Colombia (Bogotá)' },
    { value: 'America/Cancun', label: 'México — Cancún / Quintana Roo' },
    { value: 'America/Mexico_City', label: 'México — Ciudad de México' },
    { value: 'America/Panama', label: 'Panamá' },
    { value: 'America/Lima', label: 'Perú (Lima)' },
    { value: 'America/Guayaquil', label: 'Ecuador (Guayaquil)' },
    { value: 'America/Caracas', label: 'Venezuela (Caracas)' },
    { value: 'America/Santiago', label: 'Chile (Santiago)' },
    { value: 'America/Argentina/Buenos_Aires', label: 'Argentina (Buenos Aires)' },
    { value: 'America/Sao_Paulo', label: 'Brasil (São Paulo)' },
    { value: 'America/Santo_Domingo', label: 'República Dominicana' },
    { value: 'America/Costa_Rica', label: 'Costa Rica' },
    { value: 'America/New_York', label: 'EE. UU. — Este (Nueva York, Miami)' },
    { value: 'America/Chicago', label: 'EE. UU. — Centro (Chicago)' },
    { value: 'America/Los_Angeles', label: 'EE. UU. — Pacífico (Los Ángeles)' },
    { value: 'Europe/Madrid', label: 'España (Madrid)' },
    { value: 'Europe/Lisbon', label: 'Portugal (Lisboa)' },
    { value: 'Europe/London', label: 'Reino Unido (Londres)' },
    { value: 'Europe/Paris', label: 'Europa Central (París, Berlín, Roma)' },
    { value: 'Asia/Tokyo', label: 'Japón (Tokio)' },
    { value: 'Australia/Sydney', label: 'Australia (Sídney)' },
    { value: 'UTC', label: 'UTC' },
];

const metaOf = (event) => {
    const m = event?.metadata;
    if (!m) return {};
    if (typeof m === 'string') {
        try { return JSON.parse(m) || {}; } catch { return {}; }
    }
    return typeof m === 'object' ? m : {};
};

/** ¿Es una zona IANA que este motor de JavaScript reconoce? */
export const isValidTimezone = (tz) => {
    if (!tz || typeof tz !== 'string') return false;
    try {
        new Intl.DateTimeFormat('en-US', { timeZone: tz });
        return true;
    } catch {
        return false;
    }
};

/** La zona de respaldo de un SITIO, sin mirar el evento. */
export const siteTimezone = ({ setting, country, envDefault } = {}) => {
    if (isValidTimezone(setting)) return setting;
    const porPais = COUNTRY_TIMEZONES[String(country || '').trim().toLowerCase()];
    if (porPais) return porPais;
    if (isValidTimezone(envDefault)) return envDefault;
    return PLATFORM_TIMEZONE;
};

/** La zona con la que se evalúa y se escribe ESTE evento. */
export const eventTimezone = (event, fallback = PLATFORM_TIMEZONE) => {
    const tz = metaOf(event).timezone;
    if (isValidTimezone(tz)) return tz;
    return isValidTimezone(fallback) ? fallback : PLATFORM_TIMEZONE;
};

export const editorialStatusOf = (event) => {
    const s = String(metaOf(event).status || '').trim().toLowerCase();
    return EDITORIAL_STATUSES.includes(s) ? s : 'published';
};

const toMs = (value) => {
    if (value === null || value === undefined || value === '') return NaN;
    const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
    return Number.isFinite(ms) ? ms : NaN;
};

// ── Aritmética de calendario en una zona ────────────────────────────────────

const partsFormatters = new Map();
const partsFormatter = (tz) => {
    if (!partsFormatters.has(tz)) {
        partsFormatters.set(tz, new Intl.DateTimeFormat('en-US', {
            timeZone: tz, hourCycle: 'h23',
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit',
        }));
    }
    return partsFormatters.get(tz);
};

/** Fecha y hora de pared de un instante en una zona. */
export const wallClock = (ms, tz) => {
    const out = {};
    for (const p of partsFormatter(tz).formatToParts(new Date(ms))) {
        if (p.type !== 'literal') out[p.type] = Number(p.value);
    }
    return { year: out.year, month: out.month, day: out.day, hour: out.hour % 24, minute: out.minute, second: out.second };
};

/** Diferencia entre la hora de pared de la zona y UTC en ese instante. */
const offsetAt = (ms, tz) => {
    const w = wallClock(ms, tz);
    const comoUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
    return comoUtc - Math.floor(ms / 1000) * 1000;
};

/**
 * El instante en que en la zona `tz` son las `hour:minute` del día
 * `year-month-day`. Dos pasadas para acertar también los días con cambio de
 * horario de verano.
 */
export const zonedTimeToUtc = ({ year, month, day, hour = 0, minute = 0 }, tz) => {
    const supuesto = Date.UTC(year, month - 1, day, hour, minute, 0);
    const primera = supuesto - offsetAt(supuesto, tz);
    return supuesto - offsetAt(primera, tz);
};

/** 00:00 del día local que contiene `ms`. */
export const startOfLocalDay = (ms, tz) => {
    const w = wallClock(ms, tz);
    return zonedTimeToUtc({ year: w.year, month: w.month, day: w.day }, tz);
};

/** 00:00 del día local SIGUIENTE al que contiene `ms` (fin exclusivo). */
export const endOfLocalDay = (ms, tz) => {
    const w = wallClock(ms, tz);
    // Date.UTC normaliza el día 32 al mes siguiente.
    const siguiente = new Date(Date.UTC(w.year, w.month - 1, w.day + 1));
    return zonedTimeToUtc({
        year: siguiente.getUTCFullYear(), month: siguiente.getUTCMonth() + 1, day: siguiente.getUTCDate(),
    }, tz);
};

// ── Clasificación ───────────────────────────────────────────────────────────

/**
 * Ventana efectiva del evento: el instante en que empieza y en el que deja de
 * estar vigente (exclusivo), según las reglas de la cabecera. `null` cuando la
 * fecha está por confirmar.
 */
export const effectiveWindow = (event, fallbackTz = PLATFORM_TIMEZONE) => {
    const meta = metaOf(event);
    const tz = eventTimezone(event, fallbackTz);
    const start = toMs(event?.startDate);
    if (meta.dateTbd === true || !Number.isFinite(start)) return { tz, startsAt: null, endsAt: null };

    const allDay = meta.allDay === true;
    let end = toMs(event?.endDate);
    if (!Number.isFinite(end) || end < start) end = NaN;

    const startsAt = allDay ? startOfLocalDay(start, tz) : start;
    let endsAt;
    if (Number.isFinite(end)) {
        endsAt = allDay ? endOfLocalDay(end, tz) : end;
        // Un fin igual al inicio no es una duración: rige el día completo.
        if (endsAt <= startsAt) endsAt = endOfLocalDay(start, tz);
    } else {
        endsAt = endOfLocalDay(start, tz);
    }
    return { tz, startsAt, endsAt };
};

/** Estado temporal a partir de una ventana ya resuelta. */
export const temporalStatusAt = (window, nowMs) => {
    if (!window || window.startsAt === null || window.endsAt === null) return 'tbd';
    if (nowMs < window.startsAt) return 'upcoming';
    if (nowMs < window.endsAt) return 'ongoing';
    return 'finished';
};

/**
 * Todo lo que el sitio público y el panel necesitan saber del ciclo de vida
 * del evento en el instante `nowMs`. Es lo que viaja en `event.lifecycle`.
 */
export const describeLifecycle = (event, { nowMs = Date.now(), fallbackTz = PLATFORM_TIMEZONE } = {}) => {
    const meta = metaOf(event);
    const window = effectiveWindow(event, fallbackTz);
    return {
        editorial: editorialStatusOf(event),
        temporal: temporalStatusAt(window, nowMs),
        timezone: window.tz,
        allDay: meta.allDay === true,
        dateTbd: window.startsAt === null,
        startsAt: window.startsAt === null ? null : new Date(window.startsAt).toISOString(),
        endsAt: window.endsAt === null ? null : new Date(window.endsAt).toISOString(),
    };
};

/** Re-evalúa un `lifecycle` ya calculado con otro reloj (el navegador lo usa). */
export const temporalOf = (lifecycle, nowMs) => {
    if (!lifecycle) return 'tbd';
    const startsAt = toMs(lifecycle.startsAt);
    const endsAt = toMs(lifecycle.endsAt);
    if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt)) return 'tbd';
    return temporalStatusAt({ startsAt, endsAt }, nowMs);
};

/** ¿Lo puede ver alguien sin sesión? Los borradores, no. */
export const isPubliclyVisible = (event) => editorialStatusOf(event) !== 'draft';

/**
 * Reparte los eventos públicos en las tres secciones de `/eventos`.
 *
 *   · `upcoming`: en curso primero y luego próximos, del más cercano al más
 *     lejano.
 *   · `tbd`: publicados sin fecha confirmada, en una sección aparte.
 *   · `past`: finalizados, del que terminó más recientemente al más antiguo.
 *
 * Borradores y cancelados no entran en ninguna. Cada evento debe traer su
 * `lifecycle` (lo agrega el servidor); `nowMs` permite re-evaluarlo con el
 * reloj corregido del navegador sin volver a pedir la lista.
 */
export const partitionPublicEvents = (events, nowMs = Date.now()) => {
    const upcoming = [];
    const tbd = [];
    const past = [];
    for (const ev of events || []) {
        const lc = ev?.lifecycle || describeLifecycle(ev, { nowMs });
        if (lc.editorial !== 'published') continue;
        const temporal = temporalOf(lc, nowMs);
        if (temporal === 'tbd') tbd.push(ev);
        else if (temporal === 'finished') past.push(ev);
        else upcoming.push(ev);
    }
    const inicio = (ev) => toMs(ev.lifecycle?.startsAt ?? ev.startDate);
    const fin = (ev) => toMs(ev.lifecycle?.endsAt ?? ev.endDate ?? ev.startDate);
    const enCurso = (ev) => (temporalOf(ev.lifecycle, nowMs) === 'ongoing' ? 0 : 1);
    upcoming.sort((a, b) => enCurso(a) - enCurso(b) || inicio(a) - inicio(b));
    past.sort((a, b) => fin(b) - fin(a));
    tbd.sort((a, b) => toMs(b.createdAt) - toMs(a.createdAt));
    return { upcoming, tbd, past };
};

// ── Escritura de fechas en la zona del evento ───────────────────────────────

const pad = (n) => String(n).padStart(2, '0');

/**
 * Valor para un `<input type="datetime-local">` (o `type="date"` con
 * `dateOnly`) que muestra el instante en la hora de pared de la zona. Un valor
 * que ya viene sin zona (lo que el propio input escribió) se devuelve tal cual.
 */
export const toZonedInputValue = (value, tz, dateOnly = false) => {
    if (!value) return '';
    const s = String(value);
    if (/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/.test(s)) {
        return dateOnly ? s.slice(0, 10) : (s.length === 10 ? `${s}T00:00` : s);
    }
    const ms = toMs(s);
    if (!Number.isFinite(ms)) return '';
    const w = wallClock(ms, isValidTimezone(tz) ? tz : PLATFORM_TIMEZONE);
    const fecha = `${w.year}-${pad(w.month)}-${pad(w.day)}`;
    return dateOnly ? fecha : `${fecha}T${pad(w.hour)}:${pad(w.minute)}`;
};

/**
 * Convierte lo que escribió el administrador (hora de pared, sin zona) al
 * instante ISO que se guarda. Un valor que ya trae zona o `Z` se respeta.
 */
export const zonedInputToIso = (value, tz) => {
    if (!value) return '';
    const s = String(value).trim();
    const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/.exec(s);
    if (!m) {
        const ms = toMs(s);
        return Number.isFinite(ms) ? new Date(ms).toISOString() : '';
    }
    const ms = zonedTimeToUtc({
        year: Number(m[1]), month: Number(m[2]), day: Number(m[3]),
        hour: m[4] ? Number(m[4]) : 0, minute: m[5] ? Number(m[5]) : 0,
    }, isValidTimezone(tz) ? tz : PLATFORM_TIMEZONE);
    return new Date(ms).toISOString();
};

/** Una fecha para un ser humano, en la zona del evento. */
export const formatInZone = (value, tz, locale, options) => {
    const ms = toMs(value);
    if (!Number.isFinite(ms)) return '';
    try {
        return new Date(ms).toLocaleString(locale || 'es', { ...options, timeZone: isValidTimezone(tz) ? tz : PLATFORM_TIMEZONE });
    } catch {
        return new Date(ms).toLocaleString(locale || 'es', options);
    }
};
