// ════════════════════════════════════════════════════════════════════
// Códigos QR dinámicos — el ESPEJO del criterio en el navegador (v4.1278)
//
// Lo que la pantalla necesita para avisar MIENTRAS se escribe y para pintar la
// vista previa: presets de vigencia, medios de difusión, rótulos de estado,
// diseño por defecto y la regla de contraste. Quien DECIDE qué se guarda es el
// servidor (`server/lib/linkQr.js`); `npm run test:qr` comprueba que los dos
// dicen lo mismo.
// ════════════════════════════════════════════════════════════════════

export const QR_PARAM = 'qr';

export const VALIDITY_PRESETS: Record<string, { label: string; days: number | null }> = {
    d30: { label: '30 días', days: 30 },
    d90: { label: '90 días', days: 90 },
    none: { label: 'Sin vencimiento', days: 0 },
    custom: { label: 'Fecha personalizada', days: null },
};

export const QR_MEDIA: Record<string, string> = {
    impreso: 'Impreso (afiches, pendones, volantes)',
    redes: 'Redes sociales',
    presentacion: 'Presentación',
    correo: 'Correo electrónico',
    whatsapp: 'WhatsApp',
    otro: 'Otro',
};

/** Rótulos cortos del medio, para el listado y los gráficos. */
export const QR_MEDIA_SHORT: Record<string, string> = {
    impreso: 'Impreso', redes: 'Redes', presentacion: 'Presentación',
    correo: 'Correo', whatsapp: 'WhatsApp', otro: 'Otro',
};

export type QrState = 'active' | 'expired' | 'paused' | 'disabled' | 'deleted';

export const QR_STATE_LABELS: Record<QrState, string> = {
    active: 'Activo',
    expired: 'Vencido',
    paused: 'Pausado',
    disabled: 'Deshabilitado',
    deleted: 'Eliminado',
};

export const EC_LEVELS = ['L', 'M', 'Q', 'H'] as const;
export type EcLevel = typeof EC_LEVELS[number];

export const EC_LABELS: Record<EcLevel, string> = {
    L: 'L · baja (7 %) — código más simple',
    M: 'M · media (15 %) — recomendada',
    Q: 'Q · alta (25 %)',
    H: 'H · máxima (30 %) — obligatoria con logotipo',
};

export interface QrDesign {
    fg: string;
    bg: string;
    size: number;
    margin: number;
    ecLevel: EcLevel;
    logoUrl: string;
    caption: string;
}

export const DESIGN_DEFAULTS: QrDesign = {
    fg: '#004080',
    bg: '#ffffff',
    size: 1024,
    margin: 4,
    ecLevel: 'M',
    logoUrl: '',
    caption: '',
};

export const SIZE_OPTIONS = [512, 1024, 2048, 4096];
export const SIZE_MIN = 256;
export const SIZE_MAX = 4096;
export const MARGIN_MIN = 0;
export const MARGIN_MAX = 10;
export const CONTRAST_MIN = 3;
export const CONTRAST_RECOMMENDED = 4.5;

const HEX = /^#?([0-9a-f]{6})$/i;

export function normalizeHex(value: unknown): string | null {
    const m = HEX.exec(String(value ?? '').trim());
    return m ? '#' + m[1].toLowerCase() : null;
}

function luminance(hex: string): number {
    const h = normalizeHex(hex);
    if (!h) return 0;
    const c = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(v =>
        v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

export function contrastRatio(a: string, b: string): number {
    const la = luminance(a), lb = luminance(b);
    const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
    return (hi + 0.05) / (lo + 0.05);
}

export interface DesignCheck {
    design: QrDesign;
    errors: string[];
    warnings: string[];
    ok: boolean;
}

/** La MISMA regla que el servidor: oscuro sobre claro, contraste mínimo, H con logo. */
export function normalizeDesign(input: Partial<QrDesign> | Record<string, unknown> = {}): DesignCheck {
    const raw = input as Record<string, unknown>;
    const d: QrDesign = { ...DESIGN_DEFAULTS };
    const errors: string[] = [];
    const warnings: string[] = [];

    const fg = normalizeHex(raw.fg);
    const bg = normalizeHex(raw.bg);
    if (raw.fg !== undefined && !fg) warnings.push('El color principal no era válido; se usó el institucional.');
    if (raw.bg !== undefined && !bg) warnings.push('El color de fondo no era válido; se usó blanco.');
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

    const size = Number(raw.size);
    d.size = Number.isFinite(size) ? Math.min(SIZE_MAX, Math.max(SIZE_MIN, Math.round(size))) : DESIGN_DEFAULTS.size;

    const margin = Number(raw.margin);
    d.margin = Number.isFinite(margin) ? Math.min(MARGIN_MAX, Math.max(MARGIN_MIN, Math.round(margin))) : DESIGN_DEFAULTS.margin;
    if (d.margin < 2) warnings.push('Con menos de 2 módulos de margen algunos lectores no encuentran el código. El estándar son 4.');

    const ec = String(raw.ecLevel || DESIGN_DEFAULTS.ecLevel).toUpperCase() as EcLevel;
    d.ecLevel = (EC_LEVELS as readonly string[]).includes(ec) ? ec : DESIGN_DEFAULTS.ecLevel;

    const logo = String(raw.logoUrl || '').trim();
    d.logoUrl = /^https?:\/\//i.test(logo) || logo.startsWith('/') ? logo.slice(0, 600) : '';
    if (d.logoUrl && d.ecLevel !== 'H') {
        d.ecLevel = 'H';
        warnings.push('Con logotipo el nivel de corrección se fija en H: el logo tapa parte del código y H es el único que lo recupera con margen.');
    }

    d.caption = String(raw.caption || '').replace(/\s+/g, ' ').trim().slice(0, 60);

    return { design: d, errors, warnings, ok: errors.length === 0 };
}

/** La dirección que el QR codifica. Siempre https. */
export function trackingUrl({ host = '', slug = '', code = '' }: { host?: string; slug?: string; code?: string }): string {
    const h = String(host || '').replace(/^https?:\/\//, '').replace(/\/+$/, '');
    const s = String(slug || '');
    const path = s.startsWith('/') ? s : '/' + s;
    if (!h || !code) return '';
    return `https://${h}${path}?${QR_PARAM}=${encodeURIComponent(code)}`;
}

/** El estado efectivo, con el mismo orden de severidad que el servidor. */
export function qrAccessState(qr: { status?: string; expiresAt?: string | null; deletedAt?: string | null } | null, now: Date = new Date()): QrState {
    if (!qr) return 'deleted';
    if (qr.deletedAt) return 'deleted';
    if (qr.status === 'disabled') return 'disabled';
    if (qr.expiresAt && new Date(qr.expiresAt).getTime() <= now.getTime()) return 'expired';
    if (qr.status === 'paused') return 'paused';
    return 'active';
}

export function daysLeft(expiresAt?: string | null, now: Date = new Date()): number | null {
    if (!expiresAt) return null;
    const t = new Date(expiresAt).getTime();
    if (Number.isNaN(t)) return null;
    return Math.max(0, Math.ceil((t - now.getTime()) / 86400000));
}

/** Qué dice la pantalla de cada estado. */
export const QR_STATE_HINT: Record<QrState, string> = {
    active: 'Salta al destino y registra cada escaneo.',
    expired: 'Pasó su fecha de vigencia: muestra «este enlace ya no está disponible». Extendé la vigencia para reactivarlo sin cambiar la imagen.',
    paused: 'Muestra «temporalmente fuera de servicio». Reactivalo cuando quieras; la imagen impresa sigue valiendo.',
    disabled: 'No conduce a ningún destino. Se puede volver a habilitar.',
    deleted: 'Eliminado.',
};

export const QR_AUDIT_ACTIONS: Record<string, string> = {
    qr_created: 'QR creado',
    qr_edited: 'QR editado',
    qr_validity: 'Vigencia del QR cambiada',
    qr_paused: 'QR pausado',
    qr_activated: 'QR reactivado',
    qr_disabled: 'QR deshabilitado',
    qr_deleted: 'QR eliminado',
};

export default {
    QR_PARAM, VALIDITY_PRESETS, QR_MEDIA, QR_MEDIA_SHORT, QR_STATE_LABELS, EC_LEVELS, EC_LABELS,
    DESIGN_DEFAULTS, SIZE_OPTIONS, normalizeHex, contrastRatio, normalizeDesign, trackingUrl,
    qrAccessState, daysLeft, QR_STATE_HINT, QR_AUDIT_ACTIONS,
};
