// ════════════════════════════════════════════════════════════════════
// Inscripciones completadas — espejo del criterio en el navegador — v4.943.0
//
// Espejo MÍNIMO de `server/lib/completedRegistrationSpec.js`: lo que hace
// falta para PINTAR —estados con sus clases, rótulos— y para que el formulario
// público avance de paso sin un viaje de red (opciones de los catálogos,
// obligatoriedad condicional, validación por paso). El servidor valida SIEMPRE
// el envío completo, aunque el navegador ya lo haya hecho.
//
// Está duplicado A PROPÓSITO, como los demás espejos del sitio. Si cambia el
// del servidor, cambiar éste: `npm run test:completed` compara las SALIDAS de
// los dos.
// ════════════════════════════════════════════════════════════════════
import type { FieldOption } from './eventRegistrationSpec';

// ── Campos del formulario ────────────────────────────────────────────
// El esquema lo manda el servidor; estos tipos describen lo que llega.

export interface ConditionalRule { key: string; in?: string[]; notIn?: string[]; equals?: unknown }

export interface CompletedField {
    key: string;
    label: string;
    type: 'text' | 'textarea' | 'email' | 'tel' | 'select' | 'radio' | 'file';
    required?: boolean;
    max?: number;
    help?: string;
    placeholder?: string;
    options?: FieldOption[];
    showIf?: ConditionalRule;
    requiredIf?: { key: string; in?: string[]; notIn?: string[] };
    catalog?: 'districts' | 'clubs';
    dependsOn?: string;
}

/**
 * v4.958 — un paso puede ser CONDICIONAL: el vínculo con el club decide si se
 * ve el paso del cargo o el del invitado. La condición vive en el esquema del
 * servidor —una sola fuente— y acá sólo se lee para saber qué pintar.
 */
export interface CompletedStep {
    key: string;
    label: string;
    fields: CompletedField[];
    showIf?: ConditionalRule;
}

export interface CompletedCatalogs {
    districts?: { value: string; label: string; clubs: string[] }[];
}

// ── Estados ──────────────────────────────────────────────────────────

export interface CompletedStatusMeta {
    key: string;
    label: string;
    cls: string;
    color: string;
    accreditable: boolean;
}

export const COMPLETED_STATUS_META: Record<string, CompletedStatusMeta> = {
    submitted: { key: 'submitted', label: 'Pendiente de validación', cls: 'bg-amber-100 text-amber-800', color: '#f59e0b', accreditable: false },
    validated: { key: 'validated', label: 'Validado', cls: 'bg-emerald-100 text-emerald-700', color: '#10b981', accreditable: true },
    payment_confirmed: { key: 'payment_confirmed', label: 'Pago confirmado', cls: 'bg-emerald-100 text-emerald-800', color: '#059669', accreditable: true },
    needs_correction: { key: 'needs_correction', label: 'Requiere corrección', cls: 'bg-red-100 text-red-700', color: '#ef4444', accreditable: false },
    rejected: { key: 'rejected', label: 'Rechazado', cls: 'bg-slate-200 text-slate-600', color: '#64748b', accreditable: false },
};

export const completedStatusMeta = (key: string): CompletedStatusMeta =>
    COMPLETED_STATUS_META[key]
    || { key, label: key, cls: 'bg-gray-100 text-gray-600', color: '#9ca3af', accreditable: false };

export const SOURCE_LABELS: Record<string, string> = {
    manual_completed_registration: 'Inscripción completada (manual)',
    online_registration: 'Formulario de inscripción en línea',
    // v4.950 — el motor de importación: un registro migrado es una fila normal
    // y su origen SE DICE, nunca se mezcla en silencio con el formulario.
    historical_import: 'Importación histórica',
};

// ── Visibilidad y obligatoriedad ─────────────────────────────────────

export const isCompletedFieldVisible = (
    field: { showIf?: ConditionalRule },
    answers: Record<string, unknown>,
): boolean => {
    const cond = field.showIf;
    if (!cond) return true;
    const value = answers?.[cond.key];
    if (Array.isArray(cond.notIn)) return !cond.notIn.includes(value as string);
    if (Array.isArray(cond.in)) return cond.in.includes(value as string);
    if ('equals' in cond) return value === cond.equals;
    return true;
};

export const isCompletedFieldRequired = (field: CompletedField, answers: Record<string, unknown>): boolean => {
    if (!field.required) return false;
    const cond = field.requiredIf;
    if (!cond) return true;
    const value = answers?.[cond.key];
    if (Array.isArray(cond.notIn)) return !cond.notIn.includes(value as string);
    if (Array.isArray(cond.in)) return cond.in.includes(value as string);
    return true;
};

/**
 * Espejo de `completedOptionsFor` del servidor. Acá decide QUÉ SE PINTA; el
 * servidor decide qué se acepta. `null` = texto libre; los catálogos no
 * cierran los valores (v4.706: la lista ayuda a escribir).
 */
export const completedOptionsFor = (
    field: CompletedField,
    answers: Record<string, unknown>,
    catalogs: CompletedCatalogs,
): FieldOption[] | null => {
    if (field.catalog === 'districts') {
        const districts = catalogs.districts || [];
        return districts.length ? districts.map(d => ({ value: d.value, label: d.label })) : null;
    }
    if (field.catalog === 'clubs') {
        const chosen = String(answers[field.dependsOn || 'district'] || '').trim();
        if (!chosen) return null;
        const district = (catalogs.districts || []).find(d => d.value === chosen || d.label === chosen);
        return district && district.clubs?.length
            ? district.clubs.map(c => ({ value: c, label: c }))
            : null;
    }
    return Array.isArray(field.options) ? field.options : null;
};

// ── Validación por paso ──────────────────────────────────────────────
// Los mismos mensajes que el servidor, para que corregir en el paso 2 no
// contradiga lo que el envío final diga del mismo campo.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const validateCompletedStep = (
    fields: CompletedField[],
    answers: Record<string, unknown>,
): Record<string, string> => {
    const errors: Record<string, string> = {};
    for (const field of fields) {
        if (field.type === 'file') continue; // el comprobante se valida aparte
        if (!isCompletedFieldVisible(field, answers)) continue;
        const raw = answers[field.key];
        const empty = raw === undefined || raw === null || String(raw).trim() === '';

        if (isCompletedFieldRequired(field, answers) && empty) {
            errors[field.key] = `${field.label} es obligatorio.`;
            continue;
        }
        if (empty) continue;

        if (field.type === 'email' && !EMAIL_RE.test(String(raw).trim())) {
            errors[field.key] = 'Escribe un correo electrónico válido.';
        }
        if (field.type === 'tel' && String(raw).replace(/\D/g, '').length < 7) {
            errors[field.key] = 'Escribe un número de teléfono válido.';
        }
        if (field.max && String(raw).length > field.max) {
            errors[field.key] = `Máximo ${field.max} caracteres.`;
        }
        if ((field.type === 'select' || field.type === 'radio') && !field.catalog
            && Array.isArray(field.options) && !field.options.some(o => o.value === raw)) {
            errors[field.key] = 'Elige una de las opciones.';
        }
    }
    return errors;
};

// ── Comprobante ──────────────────────────────────────────────────────

export const RECEIPT_MAX_BYTES = 10 * 1024 * 1024;
export const RECEIPT_ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp';

export const checkReceiptFile = (file: File): string | null => {
    const name = file.name.toLowerCase();
    const okExt = ['.pdf', '.jpg', '.jpeg', '.png', '.webp'].some(ext => name.endsWith(ext));
    const okMime = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(file.type);
    if (!okExt && !okMime) return 'El comprobante debe ser PDF, JPG, PNG o WebP.';
    if (file.size > RECEIPT_MAX_BYTES) {
        return `El comprobante pesa ${(file.size / 1024 / 1024).toFixed(1)} MB y el máximo es ${RECEIPT_MAX_BYTES / 1024 / 1024} MB.`;
    }
    if (file.size <= 0) return 'El archivo llegó vacío.';
    return null;
};

// ── Selección completa y acciones en bloque (v4.1092) ────────────────
//
// El tope y el troceo son los MISMOS que aplica el servidor
// (`server/lib/completedRegistrationSpec.js`) y la prueba pura los compara por
// SALIDAS: con dos números, la pantalla trocearía una selección de 600 en
// tandas que el servidor rechaza — el mismo «máximo N» por otra puerta.
//
// Lo que este espejo NO trae es el criterio de quién puede seleccionar qué:
// eso lo decide el servidor, que acota por evento en el `WHERE`.

export const BULK_MAX = 500;
export const SELECT_ALL_MAX = 5000;

/** Parte una lista en tandas de `size`. Sin ids, ninguna tanda. */
export const chunkIds = (ids: string[] = [], size: number = BULK_MAX): string[][] => {
    const paso = Math.max(1, Number(size) || BULK_MAX);
    const limpio = [...new Set((Array.isArray(ids) ? ids : []).filter(Boolean))];
    const tandas: string[][] = [];
    for (let i = 0; i < limpio.length; i += paso) tandas.push(limpio.slice(i, i + paso));
    return tandas;
};

// ── La cuenta del participante (v4.1267) ─────────────────────────────
//
// Espejo de `validateAccessPassword` y de los modos del servidor. El servidor
// valida SIEMPRE; esto sólo evita el viaje para un error evidente. La prueba
// `test:completed:accounts` compara las SALIDAS de los dos lados.

export type AccountMode = 'optional' | 'required' | 'off';

export const ACCESS_PASSWORD_MIN = 8;

export const validateAccessPassword = (
    password: string,
    confirm: string,
    { allowEmpty = false }: { allowEmpty?: boolean } = {},
): Record<string, string> => {
    const pass = String(password ?? '');
    const again = String(confirm ?? '');
    const errors: Record<string, string> = {};
    if (!pass && !again && allowEmpty) return errors;
    if (!pass) errors.password = 'Crea una contraseña.';
    else if (pass.length < ACCESS_PASSWORD_MIN) errors.password = `Usa al menos ${ACCESS_PASSWORD_MIN} caracteres.`;
    if (!again) errors.passwordConfirm = 'Repite la contraseña.';
    else if (pass && again !== pass) errors.passwordConfirm = 'Las contraseñas no coinciden.';
    return errors;
};

/** Los requisitos, para el indicador discreto bajo los campos. */
export const accessPasswordChecks = (password: string, confirm: string) => [
    { key: 'length', label: `Al menos ${ACCESS_PASSWORD_MIN} caracteres`, ok: String(password ?? '').length >= ACCESS_PASSWORD_MIN },
    { key: 'match', label: 'Las dos contraseñas coinciden', ok: Boolean(password) && password === confirm },
];

// ── Estados de «Cuenta de acceso» y «Activación» ─────────────────────

export interface AccountStatusMeta {
    key: string;
    label: string;
    shortLabel: string;
    cls: string;
    dotCls: string;
    description: string;
}

export const ACCOUNT_STATUS_META: Record<string, AccountStatusMeta> = {
    active: {
        key: 'active',
        label: 'Cuenta activa',
        shortLabel: 'Activa',
        cls: 'bg-emerald-50 text-emerald-800 border-emerald-200',
        dotCls: 'bg-emerald-500',
        description: 'El participante tiene una cuenta válida y ha completado su activación.',
    },
    no_account: {
        key: 'no_account',
        label: 'Sin cuenta',
        shortLabel: 'Sin cuenta',
        cls: 'bg-amber-50 text-amber-800 border-amber-200',
        dotCls: 'bg-amber-500',
        description: 'Existe una inscripción, pero no se encontró una cuenta vinculada y verificada.',
    },
    pending_verification: {
        key: 'pending_verification',
        label: 'Pendiente de verificación',
        shortLabel: 'Pendiente de verificación',
        cls: 'bg-sky-50 text-sky-800 border-sky-200',
        dotCls: 'bg-sky-500',
        description: 'El administrador creó o aprovisionó la cuenta, pero el participante todavía no ha completado su activación.',
    },
    pending_activation: {
        key: 'pending_activation',
        label: 'Pendiente de verificación',
        shortLabel: 'Pendiente de verificación',
        cls: 'bg-sky-50 text-sky-800 border-sky-200',
        dotCls: 'bg-sky-500',
        description: 'La cuenta existe, pero el participante todavía no ha establecido sus credenciales personales.',
    },
    invitation_sent: {
        key: 'invitation_sent',
        label: 'Invitación enviada',
        shortLabel: 'Invitada',
        cls: 'bg-sky-50 text-sky-800 border-sky-200',
        dotCls: 'bg-sky-500',
        description: 'Se generó y envió una invitación de activación vigente.',
    },
    invitation_expired: {
        key: 'invitation_expired',
        label: 'Invitación vencida',
        shortLabel: 'Invitación vencida',
        cls: 'bg-orange-50 text-orange-800 border-orange-200',
        dotCls: 'bg-orange-500',
        description: 'El enlace de activación expiró sin que el participante completara el proceso.',
    },
    suspended: {
        key: 'suspended',
        label: 'Cuenta suspendida',
        shortLabel: 'Suspendida',
        cls: 'bg-red-50 text-red-800 border-red-200',
        dotCls: 'bg-red-500',
        description: 'Existe una cuenta vinculada, pero está deshabilitada administrativamente.',
    },
    needs_review: {
        key: 'needs_review',
        label: 'Requiere revisión',
        shortLabel: 'Requiere revisión',
        cls: 'bg-rose-50 text-rose-800 border-rose-200',
        dotCls: 'bg-rose-500',
        description: 'Existen coincidencias ambiguas, conflictos de identidad o información insuficiente.',
    },
};

export const accountStatusMeta = (key?: string | null): AccountStatusMeta =>
    (key && ACCOUNT_STATUS_META[key])
    || ACCOUNT_STATUS_META.no_account;

export interface ActivationStatusMeta {
    key: string;
    label: string;
    cls: string;
    description: string;
}

export const ACTIVATION_STATUS_META: Record<string, ActivationStatusMeta> = {
    not_sent: {
        key: 'not_sent',
        label: 'No enviada',
        cls: 'text-gray-500 bg-transparent',
        description: 'Todavía no se ha enviado invitación de activación.',
    },
    sent: {
        key: 'sent',
        label: 'Invitación enviada',
        cls: 'text-neutral-100 bg-neutral-900 border border-neutral-800 font-semibold',
        description: 'La invitación de activación fue despachada al participante.',
    },
    delivered: {
        key: 'delivered',
        label: 'Invitación enviada',
        cls: 'text-neutral-100 bg-neutral-900 border border-neutral-800 font-semibold',
        description: 'El canal confirmó la entrega de la invitación.',
    },
    pending: {
        key: 'pending',
        label: 'Pendiente',
        cls: 'text-slate-600 bg-slate-100 border border-slate-200',
        description: 'La cuenta espera que el participante abra el enlace y defina su contraseña.',
    },
    completed: {
        key: 'completed',
        label: 'Completada',
        cls: 'text-emerald-700 bg-emerald-50 border border-emerald-200 font-semibold',
        description: 'El participante activó su cuenta y definió su contraseña personal.',
    },
    expired: {
        key: 'expired',
        label: 'Invitación vencida',
        cls: 'text-rose-300 bg-rose-950/90 border border-rose-800 font-semibold',
        description: 'El enlace de activación superó su fecha de vigencia.',
    },
    failed: {
        key: 'failed',
        label: 'Error de envío',
        cls: 'text-red-700 bg-red-50 border border-red-200',
        description: 'El último intento de envío de invitación registró un error.',
    },
};

export const activationStatusMeta = (key?: string | null): ActivationStatusMeta =>
    (key && ACTIVATION_STATUS_META[key])
    || ACTIVATION_STATUS_META.not_sent;

export const ACTIVATION_TEMPLATE_VARIABLES = [
    { token: '{{participant_name}}', label: 'Nombre completo del participante', example: 'Carlos Andrés Rodríguez' },
    { token: '{{participant_email}}', label: 'Correo electrónico del participante', example: 'carlos@ejemplo.org' },
    { token: '{{event_name}}', label: 'Nombre del evento', example: 'XIII Conferencia Distrital — Edición Meta' },
    { token: '{{event_date}}', label: 'Fecha del evento', example: '15 de mayo de 2027' },
    { token: '{{event_location}}', label: 'Lugar o sede del evento', example: 'Villavicencio, Meta' },
    { token: '{{registration_code}}', label: 'Código de inscripción', example: 'RPF13-C-ASC4M' },
    { token: '{{organization_name}}', label: 'Nombre del club, distrito u organización', example: 'Distrito Rotario 4281' },
    { token: '{{organization_signature}}', label: 'Firma institucional del organizador', example: 'Equipo del Evento · Distrito Rotario 4281' },
    { token: '{{event_portal_url}}', label: 'URL del portal del evento (/mi-inscripcion)', example: 'https://rotary4281.org/mi-inscripcion' },
    { token: '{{activation_url}}', label: 'Enlace individual y seguro de activación', example: 'https://rotary4281.org/mi-inscripcion?activar=...' },
    { token: '{{activation_expiration}}', label: 'Vigencia del enlace de activación', example: '72 horas (hasta el 15 nov 2026, 18:00)' },
    { token: '{{account_status}}', label: 'Estado actual de la cuenta', example: 'Invitación enviada' },
    { token: '{{activation_status}}', label: 'Estado de activación', example: 'Pendiente' },
    { token: '{{support_url}}', label: 'Canal o enlace de soporte del organizador', example: 'https://rotary4281.org/contacto' },
];

export const DEFAULT_ACTIVATION_EMAIL_SUBJECT =
    'Activación de cuenta — {{event_name}}';

export const DEFAULT_ACTIVATION_EMAIL_BODY = [
    'Hola {{participant_name}},',
    '',
    'Tu inscripción al evento {{event_name}} se encuentra registrada en nuestra plataforma (código {{registration_code}}).',
    '',
    'Para consultar los detalles de tu participación, actualizar tu información autorizada y acceder a los servicios del evento, activa tu cuenta personal desde el siguiente enlace seguro de un solo uso:',
    '',
    '{{activation_url}}',
    '',
    'Por seguridad, este enlace es personal y tiene vigencia de {{activation_expiration}}.',
    '',
    'Si ya habías activado tu cuenta anteriormente, puedes ingresar directamente en:',
    '{{event_portal_url}}',
    '',
    'Cordialmente,',
    '{{organization_signature}}',
].join('\n');

export const DEFAULT_ACTIVATION_WHATSAPP_BODY = [
    'Hola *{{participant_name}}* 👋',
    '',
    'Tu inscripción a *{{event_name}}* (código `{{registration_code}}`) ya cuenta con acceso al portal del participante de *{{organization_name}}*.',
    '',
    '🔐 *Activa tu cuenta y define tu contraseña personal aquí:*',
    '{{activation_url}}',
    '',
    '⏳ _Este enlace es personal, de un solo uso y vence en {{activation_expiration}}._',
    '',
    '{{organization_signature}}',
].join('\n');

export const AUTHORIZED_PARTICIPANT_FIELDS = [
    'phone',
    'eps',
    'foodAllergy',
    'emergencyName',
    'emergencyPhone',
    'comments',
] as const;
