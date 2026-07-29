// ════════════════════════════════════════════════════════════════════
// Formularios del proyecto — tipos, estados y reglas compartidas
// v4.642.0
//
// Todo lo que la Formulación del Proyecto y la Solicitud de Aportes del FDD
// 2026-2027 tienen en común, para que las dos pantallas sean la misma pantalla
// con distinta plantilla. Espejo de `server/lib/projectFormEngine.js`.
//
// El servidor vuelve a validar y a calcular todo lo que hay aquí. Esto es
// para que el usuario vea el error mientras escribe, no para decidir nada.
// ════════════════════════════════════════════════════════════════════

export interface ComputeSpec {
    op: 'sum' | 'percent';
    sources?: string[];
    source?: string;
    factor?: number;
}

export interface FieldDef {
    key: string; label: string; type: string; required?: boolean; help?: string;
    options?: string[]; optionsFrom?: string; width?: 'full' | 'half';
    rows?: number | { key: string; label: string }[];
    maxLength?: number; columns?: { key: string; label: string; type: string }[];
    rowsLabel?: string; compute?: ComputeSpec; default?: unknown;
}

export interface SectionDef {
    key: string; title: string; description?: string; adminOnly?: boolean; fields: FieldDef[];
}

export interface FormTemplate {
    key?: string; title: string; shortTitle?: string; subtitle?: string;
    intro?: string; icon?: string; requirements?: string[]; sections: SectionDef[];
}

export type Answers = Record<string, Record<string, any>>;

/** Estados visibles de un formulario. Los deriva el servidor; esto es su rótulo. */
export type FormState =
    | 'not_started' | 'in_progress' | 'completed'
    | 'submitted' | 'in_review' | 'approved' | 'rejected';

export const FORM_STATE_META: Record<FormState, { label: string; badge: string; dot: string }> = {
    not_started: { label: 'No iniciado', badge: 'bg-slate-100 text-slate-600', dot: 'bg-slate-400' },
    in_progress: { label: 'En progreso', badge: 'bg-amber-100 text-amber-800', dot: 'bg-amber-500' },
    completed: { label: 'Completado', badge: 'bg-sky-100 text-sky-700', dot: 'bg-sky-500' },
    submitted: { label: 'Enviado', badge: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
    in_review: { label: 'En revisión', badge: 'bg-indigo-100 text-indigo-700', dot: 'bg-indigo-500' },
    approved: { label: 'Aprobado', badge: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-600' },
    rejected: { label: 'Rechazado', badge: 'bg-red-100 text-red-700', dot: 'bg-red-500' },
};

export interface FormCard {
    key: string; title: string; shortTitle: string; subtitle: string; intro: string; icon: string;
    sections: number; state: FormState; status: string;
    reviewStatus: string | null; reviewNote: string | null;
    completionPct: number; submittedAt: string | null; lastEditedAt: string | null;
    lockedAt: string | null; canEdit: boolean; reason: string | null;
    hasApproval: boolean; approvalFilled: boolean;
}

// ── Contenido de un campo ────────────────────────────────────────────
export const hasValue = (value: any, type?: string): boolean => {
    if (value === null || value === undefined) return false;
    if (type === 'repeater') {
        return Array.isArray(value) && value.some(r => r && Object.values(r).some(v => String(v ?? '').trim() !== ''));
    }
    if (type === 'matrix') {
        return !!value && typeof value === 'object' && Object.values(value).some((row: any) =>
            row && typeof row === 'object' && Object.values(row).some(v => String(v ?? '').trim() !== ''));
    }
    if (type === 'multiselect') return Array.isArray(value) && value.length > 0;
    if (type === 'checkbox') return value === true;
    if (type === 'number' || type === 'currency' || type === 'percent') {
        return String(value).trim() !== '' && !Number.isNaN(Number(value));
    }
    return String(value).trim() !== '';
};

/** Los campos que le tocan al club: ni derivados ni de la sección del Distrito. */
export const applicantSections = (template?: FormTemplate | null) =>
    (template?.sections || []).filter(s => !s.adminOnly);

export const adminSections = (template?: FormTemplate | null) =>
    (template?.sections || []).filter(s => s.adminOnly);

// ── Campos derivados ─────────────────────────────────────────────────
const numberAt = (answers: Answers, path?: string) => {
    const [sectionKey, fieldKey] = String(path || '').split('.');
    if (!sectionKey || !fieldKey) return 0;
    const n = Number(String(answers?.[sectionKey]?.[fieldKey] ?? '').replace(/[^\d.-]/g, ''));
    return Number.isFinite(n) ? n : 0;
};

/** Mismo cálculo que el servidor, para mostrarlo en vivo mientras se escribe. */
export const computeValue = (field: FieldDef, answers: Answers): number | null => {
    const spec = field.compute;
    if (!spec) return null;
    if (spec.op === 'sum') {
        const sources = spec.sources || [];
        const any = sources.some(s => {
            const [sk, fk] = s.split('.');
            return hasValue(answers?.[sk]?.[fk], 'currency');
        });
        return any ? sources.reduce((acc, s) => acc + numberAt(answers, s), 0) : null;
    }
    if (spec.op === 'percent') {
        const [sk, fk] = String(spec.source || '').split('.');
        if (!hasValue(answers?.[sk]?.[fk], 'currency')) return null;
        return numberAt(answers, spec.source) * (Number(spec.factor) || 0);
    }
    return null;
};

// ── Validación de formato ────────────────────────────────────────────
const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const RE_PHONE = /^\+?[\d\s().-]{7,20}$/;
const RE_DATE = /^\d{4}-\d{2}-\d{2}$/;
const RE_URL = /^https?:\/\/\S+$/i;

/**
 * Mensaje de error de un campo, o null si está bien. Un campo vacío nunca da
 * error de formato: de lo obligatorio se ocupa el avance y el envío.
 */
export const fieldError = (field: FieldDef, value: any): string | null => {
    if (!hasValue(value, field.type)) return null;
    const text = String(value ?? '').trim();

    switch (field.type) {
        case 'email':
            if (!RE_EMAIL.test(text)) return 'Escribe un correo válido (nombre@dominio.com).';
            break;
        case 'phone':
            if (!RE_PHONE.test(text)) return 'Escribe un número de teléfono válido.';
            break;
        case 'url':
        case 'file':
            if (!RE_URL.test(text)) return 'El enlace debe empezar por http:// o https://.';
            break;
        case 'date':
            if (!RE_DATE.test(text) || Number.isNaN(new Date(`${text}T12:00:00`).getTime())) return 'Escribe una fecha válida.';
            break;
        case 'number':
        case 'currency': {
            const n = Number(text);
            if (Number.isNaN(n)) return 'Escribe un número.';
            if (n < 0) return 'El valor no puede ser negativo.';
            break;
        }
        case 'percent': {
            const n = Number(text);
            if (Number.isNaN(n)) return 'Escribe un porcentaje.';
            if (n < 0 || n > 100) return 'El porcentaje debe estar entre 0 y 100.';
            break;
        }
        case 'select':
            if (Array.isArray(field.options) && field.options.length && !field.options.includes(text)) {
                return 'Selecciona una de las opciones disponibles.';
            }
            break;
        default:
            break;
    }
    if (field.maxLength && text.length > Number(field.maxLength)) {
        return `Supera el máximo de ${field.maxLength} caracteres.`;
    }
    return null;
};

/** Avance por sección, para guiar sobre qué falta. */
export const sectionProgress = (template: FormTemplate | null | undefined, answers: Answers) => {
    const out: Record<string, { done: number; total: number }> = {};
    applicantSections(template).forEach(section => {
        const fields = (section.fields || []).filter(f => f.type !== 'computed');
        const required = fields.filter(f => f.required);
        const target = required.length ? required : fields;
        const done = target.filter(f => hasValue(answers?.[section.key]?.[f.key], f.type)).length;
        out[section.key] = { done, total: target.length };
    });
    return out;
};

// ── Formato ──────────────────────────────────────────────────────────
export const fmtUsd = (n?: number | string | null) => {
    const v = Number(n);
    if (n === null || n === undefined || n === '' || Number.isNaN(v)) return '—';
    return `US$ ${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

export const fmtDateTime = (iso?: string | null) =>
    (iso ? new Date(iso).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' }) : '—');

export const fmtDay = (v?: string | null) => {
    if (!v) return '—';
    const d = new Date(`${String(v).slice(0, 10)}T12:00:00`);
    return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
};
