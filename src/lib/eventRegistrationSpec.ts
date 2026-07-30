// ════════════════════════════════════════════════════════════════════
// Inscripciones a eventos — espejo del navegador — v4.648.0
//
// Copia mínima de `server/lib/eventRegistrationSpec.js`: lo que la pantalla
// necesita para pintar (etiquetas de estado, colores, formato de dinero y el
// tipo de los campos dinámicos).
//
// El formulario de cada categoría NO se define aquí: llega del servidor en
// `category.form`, para que agregar una categoría o un campo no obligue a
// desplegar el navegador. El servidor valida siempre, aunque esta capa ya haya
// validado antes de enviar.
// ════════════════════════════════════════════════════════════════════

export type FieldType =
    | 'text' | 'textarea' | 'email' | 'tel' | 'date' | 'number'
    | 'select' | 'multiselect' | 'checkbox' | 'country';

export interface FieldOption { value: string; label: string }

export interface FormField {
    key: string;
    label: string;
    type: FieldType;
    required?: boolean;
    max?: number;
    help?: string;
    /** Texto guía dentro del control. Lo define el servidor con el campo. */
    placeholder?: string;
    options?: FieldOption[];
    showIf?: { key: string; in?: string[]; notIn?: string[]; equals?: unknown };
}

export interface FormStep {
    key: string;
    label: string;
    fields: FormField[];
}

export interface FormSchema {
    audience: string;
    steps: FormStep[];
}

export interface CompanionRules {
    allowed: boolean;
    max: number;
    price: number;
    currency: string;
    requireDocument: boolean;
}

export interface PublicCategory {
    key: string;
    name: string;
    audience: string;
    description: string;
    currency: string;
    price: number;
    benefits: string[];
    requireClub: boolean;
    companions: CompanionRules;
    opensAt: string | null;
    closesAt: string | null;
    capacity: number | null;
    remaining: number | null;
    soldOut: boolean;
    open: boolean;
    closedReason: string | null;
    charge: {
        currency: string;
        amount: number;
        converted: boolean;
        fxRate: number | null;
        fxMissing: boolean;
    };
    form: FormSchema;
}

export interface Companion {
    id?: string;
    firstName: string;
    lastName: string;
    documentNumber: string;
    relationship?: string;
    email?: string;
    phone?: string;
    dietary?: string;
    notes?: string;
    badgeCode?: string | null;
    checkedInAt?: string | null;
    amount?: number;
    currency?: string;
}

// ── Estados ──────────────────────────────────────────────────────────

export interface StatusMeta {
    key: string;
    label: string;
    /** Clases de Tailwind para la píldora del estado. */
    cls: string;
    /** Color sólido, para gráficas. */
    color: string;
}

export const STATUS_META: Record<string, StatusMeta> = {
    draft: { key: 'draft', label: 'Borrador', cls: 'bg-slate-100 text-slate-600', color: '#94a3b8' },
    started: { key: 'started', label: 'Registro iniciado', cls: 'bg-slate-100 text-slate-700', color: '#64748b' },
    pending_payment: { key: 'pending_payment', label: 'Pendiente de pago', cls: 'bg-amber-100 text-amber-800', color: '#f59e0b' },
    payment_failed: { key: 'payment_failed', label: 'Pago fallido', cls: 'bg-red-100 text-red-700', color: '#ef4444' },
    expired: { key: 'expired', label: 'Cobro expirado', cls: 'bg-slate-100 text-slate-600', color: '#94a3b8' },
    paid: { key: 'paid', label: 'Pago confirmado', cls: 'bg-emerald-100 text-emerald-700', color: '#10b981' },
    confirmed: { key: 'confirmed', label: 'Confirmado', cls: 'bg-emerald-100 text-emerald-700', color: '#059669' },
    waitlist: { key: 'waitlist', label: 'Lista de espera', cls: 'bg-indigo-100 text-indigo-700', color: '#6366f1' },
    accredited: { key: 'accredited', label: 'Acreditado', cls: 'bg-sky-100 text-sky-700', color: '#0ea5e9' },
    attended: { key: 'attended', label: 'Asistió', cls: 'bg-sky-100 text-sky-800', color: '#0284c7' },
    no_show: { key: 'no_show', label: 'No asistió', cls: 'bg-slate-100 text-slate-600', color: '#64748b' },
    cancelled: { key: 'cancelled', label: 'Cancelado', cls: 'bg-red-100 text-red-700', color: '#dc2626' },
    refunded: { key: 'refunded', label: 'Reembolsado', cls: 'bg-indigo-100 text-indigo-700', color: '#4f46e5' },
};

export const statusMeta = (key: string): StatusMeta =>
    STATUS_META[key] || { key, label: key, cls: 'bg-gray-100 text-gray-600', color: '#9ca3af' };

/** Estados en los que la inscripción cuenta como pagada / en firme. */
export const SETTLED_STATUSES = ['paid', 'confirmed', 'accredited', 'attended', 'no_show'];

// ── Etiquetas ────────────────────────────────────────────────────────

export const TAG_META: Record<string, { label: string; cls: string; system: boolean }> = {
    internacional: { label: 'Internacional', cls: 'bg-sky-100 text-sky-700', system: true },
    nacional: { label: 'Nacional', cls: 'bg-emerald-100 text-emerald-700', system: true },
    cadres: { label: 'CADRES', cls: 'bg-violet-100 text-violet-700', system: true },
    pago_confirmado: { label: 'Pago confirmado', cls: 'bg-emerald-100 text-emerald-700', system: true },
    pendiente: { label: 'Pendiente', cls: 'bg-amber-100 text-amber-800', system: true },
    con_acompanantes: { label: 'Con acompañantes', cls: 'bg-indigo-100 text-indigo-700', system: true },
    requiere_visa: { label: 'Requiere visa', cls: 'bg-red-100 text-red-700', system: false },
    requiere_traduccion: { label: 'Requiere traducción', cls: 'bg-violet-100 text-violet-700', system: false },
    necesidad_alimentaria: { label: 'Necesidad alimentaria', cls: 'bg-amber-100 text-amber-800', system: false },
    prioridad_logistica: { label: 'Prioridad logística', cls: 'bg-red-100 text-red-700', system: false },
};

export const tagMeta = (key: string) =>
    TAG_META[key] || { label: key.replace(/_/g, ' '), cls: 'bg-gray-100 text-gray-600', system: false };

/** Etiquetas que pone el sistema y el equipo no puede quitar a mano. */
export const SYSTEM_TAG_KEYS = Object.entries(TAG_META)
    .filter(([, v]) => v.system).map(([k]) => k);

export const normalizeTag = (raw: string): string =>
    String(raw || '')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase().trim()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 40);

// ── Dinero ───────────────────────────────────────────────────────────

const DECIMALS: Record<string, number> = { COP: 0, USD: 2, EUR: 2, MXN: 2, BRL: 2 };

export const money = (amount: number | null | undefined, currency: string): string => {
    const code = String(currency || 'USD').toUpperCase();
    return `${Number(amount || 0).toLocaleString('es-CO', {
        minimumFractionDigits: 0,
        maximumFractionDigits: DECIMALS[code] ?? 2,
    })} ${code}`;
};

// ── Campos dinámicos ─────────────────────────────────────────────────

/** ¿Se muestra este campo, dadas las respuestas actuales? */
export const isFieldVisible = (field: FormField, answers: Record<string, unknown>): boolean => {
    const cond = field.showIf;
    if (!cond) return true;
    const value = answers?.[cond.key];
    if (Array.isArray(cond.notIn)) return !cond.notIn.includes(String(value));
    if (Array.isArray(cond.in)) return cond.in.includes(String(value));
    if ('equals' in cond) return value === cond.equals;
    return true;
};

/**
 * Valida un paso del asistente. Es la misma regla que corre el servidor, aquí
 * sólo para no dejar avanzar con campos vacíos ni esperar al viaje de red.
 */
export const validateStep = (
    fields: FormField[],
    answers: Record<string, unknown>,
): Record<string, string> => {
    const errors: Record<string, string> = {};
    for (const field of fields) {
        if (!isFieldVisible(field, answers)) continue;
        const raw = answers[field.key];
        const empty = raw === undefined || raw === null || raw === ''
            || (Array.isArray(raw) && raw.length === 0)
            || (field.type === 'checkbox' && raw !== true);

        if (field.required && empty) {
            errors[field.key] = field.type === 'checkbox'
                ? 'Debes aceptarlo para continuar.'
                : `${field.label} es obligatorio.`;
            continue;
        }
        if (empty) continue;

        if (field.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(raw).trim())) {
            errors[field.key] = 'Escribe un correo electrónico válido.';
        }
        if (field.max && String(raw).length > field.max) {
            errors[field.key] = `Máximo ${field.max} caracteres.`;
        }
    }
    if (answers.arrivalDate && answers.departureDate
        && String(answers.departureDate) < String(answers.arrivalDate)) {
        errors.departureDate = 'La salida no puede ser anterior a la llegada.';
    }
    return errors;
};

// ── Credenciales del asistente ───────────────────────────────────────
// Espejo de `validateCredentials` del servidor (eventRegistrationSpec.js).
// El servidor la corre siempre; aquí sólo evita el viaje de red.

export const PASSWORD_MIN = 8;

export const validateCredentials = (
    { password, passwordConfirm }: { password?: string; passwordConfirm?: string },
): Record<string, string> => {
    const errors: Record<string, string> = {};
    const pass = String(password ?? '');
    const confirm = String(passwordConfirm ?? '');

    if (!pass) errors.password = 'Crea una contraseña para consultar tu inscripción.';
    else if (pass.length < PASSWORD_MIN) errors.password = `Usa al menos ${PASSWORD_MIN} caracteres.`;

    if (!confirm) errors.passwordConfirm = 'Repite la contraseña.';
    else if (confirm !== pass) errors.passwordConfirm = 'Las contraseñas no coinciden.';

    return errors;
};

/** Países más frecuentes en la feria, arriba; el campo acepta cualquiera. */
export const COUNTRY_SUGGESTIONS = [
    'Colombia', 'Estados Unidos', 'México', 'Brasil', 'Argentina', 'Chile', 'Perú',
    'Ecuador', 'Panamá', 'Costa Rica', 'Guatemala', 'República Dominicana', 'España',
    'Canadá', 'Uruguay', 'Paraguay', 'Bolivia', 'Venezuela', 'Honduras', 'El Salvador',
    'Nicaragua', 'Puerto Rico', 'Portugal', 'Italia', 'Francia', 'Alemania', 'Reino Unido',
];

/** Departamentos de Colombia, para el campo del registro nacional. */
export const COLOMBIA_DEPARTMENTS = [
    'Amazonas', 'Antioquia', 'Arauca', 'Atlántico', 'Bogotá D.C.', 'Bolívar', 'Boyacá',
    'Caldas', 'Caquetá', 'Casanare', 'Cauca', 'Cesar', 'Chocó', 'Córdoba', 'Cundinamarca',
    'Guainía', 'Guaviare', 'Huila', 'La Guajira', 'Magdalena', 'Meta', 'Nariño',
    'Norte de Santander', 'Putumayo', 'Quindío', 'Risaralda', 'San Andrés y Providencia',
    'Santander', 'Sucre', 'Tolima', 'Valle del Cauca', 'Vaupés', 'Vichada',
];
