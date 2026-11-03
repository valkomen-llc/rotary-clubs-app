// ════════════════════════════════════════════════════════════════════
// Códigos QR dinámicos de un enlace inteligente — el CRITERIO (v4.1278)
//
// PURO a propósito: sin base, sin red, sin `process.env` y sin `node:crypto`
// (el código aleatorio lo genera el store, que es quien tiene la entropía;
// acá vive la decisión de QUÉ forma tiene y QUÉ se acepta). Mismo reparto que
// `linkRedirects.js` y `linkTracking.js` frente a `linkRedirectStore.js`.
//
// Lo que decide este archivo:
//   - la forma del identificador público de un QR (`code`) y su URL de
//     seguimiento;
//   - la vigencia: 30 días, 90 días, sin vencimiento o fecha propia, y cómo se
//     calcula EN EL SERVIDOR;
//   - el estado efectivo de un QR en un instante dado: activo, vencido,
//     pausado, deshabilitado o eliminado — y qué hace el salto con cada uno;
//   - el diseño: qué combinaciones de color y margen se aceptan para que el
//     código siga siendo legible por cualquier lector;
//   - la página institucional que ve quien escanea un código que ya no
//     funciona.
//
// ⚠️ EL QR NO CODIFICA EL DESTINO: codifica una dirección NUESTRA
// (`https://dominio/slug?qr=código`). Por eso cambiar el destino del enlace no
// invalida ni un solo afiche impreso, y por eso el mismo código puede pausarse,
// vencer y volver a funcionar sin generar otra imagen.
// ════════════════════════════════════════════════════════════════════

// ── El identificador público ────────────────────────────────────────────────

/**
 * El alfabeto del código. Sin `0/o`, `1/l/i`: alguien lo va a leer en voz alta
 * o a teclear desde un afiche cuando el lector no funcione.
 */
export const QR_CODE_ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz';
export const QR_CODE_LENGTH = 10;
export const QR_PARAM = 'qr';

/** ¿Tiene la forma de un código nuestro? No dice si existe: eso lo sabe la base. */
export function isValidQrCode(value) {
    const v = String(value ?? '');
    if (v.length < 8 || v.length > 16) return false;
    for (const ch of v) if (!QR_CODE_ALPHABET.includes(ch)) return false;
    return true;
}

/**
 * Convierte bytes aleatorios en un código. El store entrega los bytes; esta
 * función sólo los mapea al alfabeto, así que es determinista y probable.
 */
export function codeFromBytes(bytes, length = QR_CODE_LENGTH) {
    const arr = Array.from(bytes || []);
    let out = '';
    for (let i = 0; i < length; i++) {
        const b = arr[i % Math.max(1, arr.length)] ?? 0;
        out += QR_CODE_ALPHABET[b % QR_CODE_ALPHABET.length];
    }
    return out;
}

/** Lee el `?qr=` de la query de la visita, saneado. Cadena vacía si no viene o no tiene forma. */
export function readQrParam(search) {
    const raw = String(search ?? '');
    const qs = raw.startsWith('?') ? raw.slice(1) : raw;
    if (!qs) return '';
    let params;
    try { params = new URLSearchParams(qs); } catch { return ''; }
    const v = String(params.get(QR_PARAM) || '').trim().toLowerCase();
    return isValidQrCode(v) ? v : '';
}

/**
 * La query que sigue viaje al destino, SIN nuestro parámetro de seguimiento.
 * El `?qr=` es nuestro y del enlace: al destino le llega lo que traía el
 * visitante (sus UTM, por ejemplo), no la contabilidad nuestra.
 */
export function stripQrParam(search) {
    const raw = String(search ?? '');
    if (!raw || raw === '?') return '';
    const qs = raw.startsWith('?') ? raw.slice(1) : raw;
    let params;
    try { params = new URLSearchParams(qs); } catch { return raw.startsWith('?') ? raw : '?' + raw; }
    params.delete(QR_PARAM);
    const s = params.toString();
    return s ? '?' + s : '';
}

/** La dirección que el QR codifica. Siempre https: es lo que se imprime. */
export function trackingUrl({ host = '', slug = '', code = '' } = {}) {
    const h = String(host || '').replace(/^https?:\/\//, '').replace(/\/+$/, '');
    const s = String(slug || '');
    const path = s.startsWith('/') ? s : '/' + s;
    if (!h || !code) return '';
    return `https://${h}${path}?${QR_PARAM}=${encodeURIComponent(code)}`;
}

// ── Vigencia ────────────────────────────────────────────────────────────────

export const VALIDITY_PRESETS = Object.freeze({
    d30: { label: '30 días', days: 30 },
    d90: { label: '90 días', days: 90 },
    none: { label: 'Sin vencimiento', days: 0 },
    custom: { label: 'Fecha personalizada', days: null },
});

const DAY_MS = 86400000;

/**
 * La fecha de vencimiento que corresponde a una elección. Se calcula ACÁ y se
 * guarda, nunca se confía en la que mande el navegador: el reloj del cliente
 * puede estar mal y «30 días» tiene que significar lo mismo para todos.
 *
 * `null` = sin vencimiento. Devuelve `{ ok:false }` si la fecha propia no es
 * futura o no se puede leer.
 */
export function expiryFor(preset, { now = new Date(), customDate = null } = {}) {
    const p = String(preset || 'none');
    const spec = VALIDITY_PRESETS[p];
    if (!spec) return { ok: false, error: 'Vigencia desconocida.' };
    if (p === 'none') return { ok: true, preset: p, expiresAt: null };
    if (p === 'custom') {
        const d = customDate instanceof Date ? customDate : new Date(String(customDate || ''));
        if (Number.isNaN(d.getTime())) return { ok: false, error: 'La fecha de vencimiento no se pudo leer.' };
        if (d.getTime() <= now.getTime()) return { ok: false, error: 'La fecha de vencimiento tiene que ser futura.' };
        if (d.getTime() - now.getTime() > 20 * 366 * DAY_MS) {
            return { ok: false, error: 'La fecha de vencimiento está demasiado lejos; para eso elegí «Sin vencimiento».' };
        }
        return { ok: true, preset: p, expiresAt: d };
    }
    // El día se cuenta ENTERO: vence al final del último día, no a esta misma
    // hora dentro de 30 días, que dejaría un afiche sin funcionar a mitad de
    // una tarde de evento.
    const fin = new Date(now.getTime() + spec.days * DAY_MS);
    fin.setUTCHours(23, 59, 59, 999);
    return { ok: true, preset: p, expiresAt: fin };
}

/** ¿Está vencido en este instante? Sin fecha, nunca. */
export function isExpired(expiresAt, now = new Date()) {
    if (!expiresAt) return false;
    const d = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
    if (Number.isNaN(d.getTime())) return false;
    return d.getTime() <= now.getTime();
}

/** Días que faltan (entero, mínimo 0) o `null` si no vence. */
export function daysLeft(expiresAt, now = new Date()) {
    if (!expiresAt) return null;
    const d = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
    if (Number.isNaN(d.getTime())) return null;
    return Math.max(0, Math.ceil((d.getTime() - now.getTime()) / DAY_MS));
}

// ── Estado ──────────────────────────────────────────────────────────────────

/** Lo que el administrador puede fijar. `expired` y `deleted` se DERIVAN. */
export const QR_STATUSES = ['active', 'paused', 'disabled'];

export const QR_STATE_LABELS = Object.freeze({
    active: 'Activo',
    expired: 'Vencido',
    paused: 'Pausado',
    disabled: 'Deshabilitado',
    deleted: 'Eliminado',
});

/**
 * El estado EFECTIVO de un QR en un instante.
 *
 * El orden es el de la severidad y no es negociable: un código eliminado es
 * eliminado aunque tenga vigencia; uno deshabilitado lo está aunque no haya
 * vencido; y uno vencido lo está aunque esté «activo» en su fila, porque
 * vencer no cambia la fila — cambia el reloj.
 *
 * Sólo `active` salta al destino. Los demás muestran la página institucional.
 */
export function qrAccessState(qr, now = new Date()) {
    if (!qr) return 'deleted';
    if (qr.deletedAt) return 'deleted';
    if (qr.status === 'disabled') return 'disabled';
    if (isExpired(qr.expiresAt, now)) return 'expired';
    if (qr.status === 'paused') return 'paused';
    return 'active';
}

/** El estado efectivo del ENLACE al que apunta un QR, visto desde el salto. */
export function linkAccessState(link) {
    if (!link || link.deletedAt) return 'disabled';
    if (link.status === 'paused') return 'paused';
    return 'active';
}

/** ¿Qué código HTTP corresponde a un acceso que NO salta? */
export function blockedHttpStatus(state) {
    // Pausado es temporal: 503 con Retry-After es lo que le dice a un
    // rastreador «volvé después» sin desindexar nada. Lo demás ya no está.
    return state === 'paused' ? 503 : 410;
}

// ── Medio de difusión ───────────────────────────────────────────────────────

export const QR_MEDIA = Object.freeze({
    impreso: 'Impreso (afiches, pendones, volantes)',
    redes: 'Redes sociales',
    presentacion: 'Presentación',
    correo: 'Correo electrónico',
    whatsapp: 'WhatsApp',
    otro: 'Otro',
});

export function normalizeMedium(value) {
    const v = String(value || '').trim().toLowerCase();
    return QR_MEDIA[v] ? v : 'otro';
}

// ── Diseño ──────────────────────────────────────────────────────────────────

export const EC_LEVELS = ['L', 'M', 'Q', 'H'];

export const DESIGN_DEFAULTS = Object.freeze({
    fg: '#004080',       // el azul institucional; oscuro sobre claro, que es lo que lee cualquier lector
    bg: '#ffffff',
    size: 1024,          // píxeles del PNG. 1024 imprime nítido hasta ~9 cm a 300 dpi
    margin: 4,           // módulos de zona de silencio: el estándar pide 4
    ecLevel: 'M',
    logoUrl: '',
    caption: '',
});

export const SIZE_MIN = 256;
export const SIZE_MAX = 4096;
export const MARGIN_MIN = 0;
export const MARGIN_MAX = 10;

const HEX = /^#?([0-9a-f]{6})$/i;

/** `#rrggbb` en minúsculas o `null` si no es un color que podamos imprimir. */
export function normalizeHex(value) {
    const m = HEX.exec(String(value || '').trim());
    return m ? '#' + m[1].toLowerCase() : null;
}

function luminance(hex) {
    const h = normalizeHex(hex);
    if (!h) return 0;
    const c = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(v =>
        v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

/** Relación de contraste WCAG entre dos colores (1 a 21). */
export function contrastRatio(a, b) {
    const la = luminance(a), lb = luminance(b);
    const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
    return (hi + 0.05) / (lo + 0.05);
}

/** Por debajo de esto muchos lectores de teléfono ya no enfocan el código. */
export const CONTRAST_MIN = 3;
/** Lo que recomendamos para imprenta: tinta oscura sobre papel claro. */
export const CONTRAST_RECOMMENDED = 4.5;

/**
 * Deja el diseño en una forma válida y dice qué se corrigió. No lanza: un
 * diseño con un valor raro se arregla al valor seguro y se avisa.
 *
 * Las reglas que PROTEGEN la lectura:
 *   - el color del código tiene que ser MÁS OSCURO que el fondo. Un QR
 *     «invertido» (claro sobre oscuro) lo leen pocos lectores; no se permite.
 *   - contraste mínimo 3:1 (error) y recomendado 4,5:1 (aviso).
 *   - con logotipo, el nivel de corrección se fuerza a H: el logo tapa módulos
 *     y sólo H (30 %) los recupera con margen.
 *   - margen mínimo 2 módulos con aviso; el estándar son 4.
 */
export function normalizeDesign(input = {}) {
    const d = { ...DESIGN_DEFAULTS };
    const errors = [];
    const warnings = [];

    const fg = normalizeHex(input.fg);
    const bg = normalizeHex(input.bg);
    if (input.fg !== undefined && !fg) warnings.push('El color principal no era válido; se usó el institucional.');
    if (input.bg !== undefined && !bg) warnings.push('El color de fondo no era válido; se usó blanco.');
    d.fg = fg || DESIGN_DEFAULTS.fg;
    d.bg = bg || DESIGN_DEFAULTS.bg;

    if (luminance(d.fg) >= luminance(d.bg)) {
        errors.push('El código tiene que ser más oscuro que el fondo: un QR claro sobre fondo oscuro no lo leen muchos teléfonos.');
    } else {
        const ratio = contrastRatio(d.fg, d.bg);
        if (ratio < CONTRAST_MIN) {
            errors.push(`El contraste entre el código y el fondo es ${ratio.toFixed(1)}:1; hace falta al menos ${CONTRAST_MIN}:1 para que se lea.`);
        } else if (ratio < CONTRAST_RECOMMENDED) {
            warnings.push(`Contraste ${ratio.toFixed(1)}:1: se lee, pero para imprenta conviene ${CONTRAST_RECOMMENDED}:1 o más.`);
        }
    }

    const size = Number(input.size);
    d.size = Number.isFinite(size) ? Math.min(SIZE_MAX, Math.max(SIZE_MIN, Math.round(size))) : DESIGN_DEFAULTS.size;

    const margin = Number(input.margin);
    d.margin = Number.isFinite(margin) ? Math.min(MARGIN_MAX, Math.max(MARGIN_MIN, Math.round(margin))) : DESIGN_DEFAULTS.margin;
    if (d.margin < 2) warnings.push('Con menos de 2 módulos de margen algunos lectores no encuentran el código. El estándar son 4.');

    const ec = String(input.ecLevel || DESIGN_DEFAULTS.ecLevel).toUpperCase();
    d.ecLevel = EC_LEVELS.includes(ec) ? ec : DESIGN_DEFAULTS.ecLevel;

    const logo = String(input.logoUrl || '').trim();
    d.logoUrl = /^https?:\/\//i.test(logo) || logo.startsWith('/') ? logo.slice(0, 600) : '';
    if (d.logoUrl && d.ecLevel !== 'H') {
        d.ecLevel = 'H';
        warnings.push('Con logotipo el nivel de corrección se fija en H: el logo tapa parte del código y H es el único que lo recupera con margen.');
    }

    d.caption = String(input.caption || '').replace(/\s+/g, ' ').trim().slice(0, 60);

    return { design: d, errors, warnings, ok: errors.length === 0 };
}

// ── Lo que se guarda de un QR ───────────────────────────────────────────────

/**
 * Sanea los campos de identificación que escribe el administrador. Los topes
 * son los de una etiqueta que cabe en un listado, no los de un documento.
 */
export function normalizeQrFields(input = {}) {
    return {
        name: String(input.name || '').replace(/\s+/g, ' ').trim().slice(0, 80),
        campaign: String(input.campaign || '').replace(/\s+/g, ' ').trim().slice(0, 80),
        medium: normalizeMedium(input.medium),
        label: String(input.label || '').replace(/\s+/g, ' ').trim().slice(0, 120),
    };
}

// ── La página institucional ─────────────────────────────────────────────────

const escapeHtml = (s) => String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export const UNAVAILABLE_COPY = Object.freeze({
    expired: {
        title: 'Este enlace ya no está disponible',
        body: 'El código que escaneaste tenía una fecha de vigencia y ya pasó. Si necesitás la información, consultá directamente con la organización.',
    },
    paused: {
        title: 'Este enlace está temporalmente fuera de servicio',
        body: 'La organización pausó este código por el momento. Probá de nuevo más tarde.',
    },
    disabled: {
        title: 'Este enlace fue deshabilitado',
        body: 'El código que escaneaste ya no conduce a ningún destino.',
    },
    deleted: {
        title: 'Este enlace ya no existe',
        body: 'El código que escaneaste fue retirado por la organización.',
    },
});

/**
 * El HTML que ve quien escanea un código que no salta. Es una página entera y
 * no la aplicación de React: quien llega es un teléfono apuntando a un afiche,
 * y tiene que entender en una línea qué pasó sin descargar un megabyte.
 *
 * `siteName` y `homeUrl` son opcionales: sin ellos la página sigue siendo
 * institucional y no deja al visitante en una pantalla en blanco.
 */
export function unavailablePage({ state = 'disabled', siteName = '', homeUrl = '' } = {}) {
    const copy = UNAVAILABLE_COPY[state] || UNAVAILABLE_COPY.disabled;
    const nombre = escapeHtml(siteName || 'Rotary');
    const volver = homeUrl
        ? `<a class="btn" href="${escapeHtml(homeUrl)}">Ir al sitio de ${nombre}</a>`
        : '';
    return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${escapeHtml(copy.title)} · ${nombre}</title>
<style>
  :root { color-scheme: light; }
  body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background: #f4f6fa; color: #1f2937; }
  main { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; box-sizing: border-box; }
  .card { background: #fff; border-radius: 24px; padding: 40px 32px; max-width: 460px; width: 100%; text-align: center; box-shadow: 0 10px 40px rgba(0, 64, 128, 0.08); }
  .mark { width: 56px; height: 56px; border-radius: 16px; background: #004080; color: #fff; display: inline-flex; align-items: center; justify-content: center; font-weight: 700; font-size: 22px; margin-bottom: 20px; }
  h1 { font-size: 20px; margin: 0 0 12px; color: #0b2a4a; }
  p { font-size: 15px; line-height: 1.55; margin: 0 0 24px; color: #4b5563; }
  .btn { display: inline-block; background: #004080; color: #fff; text-decoration: none; padding: 12px 22px; border-radius: 12px; font-weight: 600; font-size: 14px; }
  .foot { margin-top: 28px; font-size: 12px; color: #9ca3af; }
</style>
</head>
<body>
<main>
  <div class="card" role="main">
    <div class="mark" aria-hidden="true">R</div>
    <h1>${escapeHtml(copy.title)}</h1>
    <p>${escapeHtml(copy.body)}</p>
    ${volver}
    <div class="foot">${nombre}</div>
  </div>
</main>
</body>
</html>`;
}

export default {
    QR_CODE_ALPHABET, QR_CODE_LENGTH, QR_PARAM, isValidQrCode, codeFromBytes,
    readQrParam, stripQrParam, trackingUrl,
    VALIDITY_PRESETS, expiryFor, isExpired, daysLeft,
    QR_STATUSES, QR_STATE_LABELS, qrAccessState, linkAccessState, blockedHttpStatus,
    QR_MEDIA, normalizeMedium,
    EC_LEVELS, DESIGN_DEFAULTS, SIZE_MIN, SIZE_MAX, MARGIN_MIN, MARGIN_MAX,
    normalizeHex, contrastRatio, CONTRAST_MIN, CONTRAST_RECOMMENDED, normalizeDesign,
    normalizeQrFields, UNAVAILABLE_COPY, unavailablePage,
};
