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
