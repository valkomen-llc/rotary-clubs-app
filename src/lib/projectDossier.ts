// ════════════════════════════════════════════════════════════════════════════
// Expediente integral del proyecto — tipos, estados y acceso a la API (v4.1324.0)
//
// El criterio vive en el servidor (`server/lib/projectDossier.js`): esta capa
// sólo PINTA lo que el servidor decide. Ningún permiso se decide aquí: un botón
// que se oculta es cortesía; el 403 lo pone el servidor.
// ════════════════════════════════════════════════════════════════════════════
import { describirNoJson, leerJson } from './leerJson';

const API = (import.meta as any).env?.VITE_API_URL || '/api';
const authHeaders = (): Record<string, string> => ({ Authorization: `Bearer ${localStorage.getItem('rotary_token')}` });

export interface DossierField {
    path: string; key: string; formKey?: string; sectionKey?: string;
    label: string; labelEn: string | null; type: string; value: any; valueEn?: any; noteEn?: string | null; untranslated?: boolean;
    options: string[] | null; columns?: { key: string; label: string; type: string }[] | null; columnsEn?: (string | null)[];
    rows?: { key: string; label: string }[] | null; rowsEn?: (string | null)[] | null; retiredRows?: { key: string; label: string }[] | null;
    maxLength: number | null; help?: string | null;
    editable: boolean; lockReason: string | null; sensitive: boolean; personal?: boolean;
    translatable: boolean; glossary: boolean; filled: boolean;
}
export interface DossierSection { key: string; title: string; titleEn: string; district?: boolean; fields: DossierField[] }
export interface DossierGroup {
    key: string; source: 'submission' | 'form'; formKey?: string; title: string; titleEn: string;
    started?: boolean; completionPct?: number; formStatus?: string | null; submittedAt?: string | null;
    sections: DossierSection[];
}
export interface Dossier { groups: DossierGroup[] }

export interface DossierCaps {
    role: string; view: boolean; edit: boolean; translate: boolean; approveTranslation: boolean;
    export: boolean; config: boolean; viewPayments: boolean;
}

export type TranslationState = 'not_started' | 'generating' | 'draft' | 'pending_review' | 'reviewed' | 'approved' | 'outdated' | 'error';
export type FieldState = 'missing' | 'draft' | 'reviewed' | 'outdated';

export interface TranslationField {
    path: string; fieldPath: string; label: string; labelEn: string | null; sectionTitle: string; groupKey: string;
    source: string; sourceHash: string; text: string | null; previousSource: string | null;
    origin: 'ai' | 'manual' | null; reviewed: boolean; reviewedBy: string | null; reviewedAt: string | null;
    warnings: { code: string; message: string }[]; updatedAt: string | null; updatedBy: string | null; state: FieldState;
}
export interface TranslationStatus {
    state: TranslationState; label: string; color: string; total: number;
    counts: Record<FieldState, number>; warnings: number;
    approvedAt: string | null; approvedBy: string | null; approvedVersionId: string | null;
    lastError: string | null; provider: string | null; model: string | null;
    fields?: TranslationField[];
}

export interface DossierPayload {
    submission: {
        id: string; publicRef: string; eventId: string | null; projectName: string; clubName: string; district: string;
        responsable: string; focusArea: string | null; budgetUsd: number | null; workflowStatus: string; paymentStatus: string;
        createdAt: string; appliedAt: string | null; archivedAt: string | null; projectIndex: number;
    };
    edition: { id: string | null; name: string };
    dossier: Dossier;
    forms: { key: string; title: string; started: boolean; completionPct: number; status: string | null; submittedAt: string | null; lockedAt: string | null }[];
    translation: { en: TranslationStatus };
    booklets: { lang: string; status: string; versionNumber: number; createdAt: string }[];
    documents: {
        files: { id: string; fileName: string; fileUrl: string; fileSize: number | null; contentType: string | null; uploadedBy: string | null; createdAt: string }[];
        links: { path: string; label: string; form: string; url: string }[];
        videos: { id: string; status: string; title: string | null; fileName: string | null; sizeBytes: number | null; durationSec: number | null; submittedAt: string | null; approvedAt: string | null; currentVersionId: string | null }[];
        videoPitch: { id: string; status: string; createdAt: string } | null;
        paymentReceipt: { name: string } | null;
    };
    access: DossierCaps;
}

export interface DocumentPayload {
    id: string; publicRef: string; kind: 'es' | 'en' | 'bilingual'; edition: string;
    projectName: string; clubName: string; district: string; generatedAt: string;
    es: Dossier; en?: Dossier;
    translation?: { mode: 'approved' | 'draft' | 'none'; state: TranslationState; label: string; approvedAt: string | null; approvedBy: string | null; versionNumber: number | null; outdatedSinceApproval: boolean };
}

export interface BookletBlock { key: string; label: string; text: string; source: string | null; manual?: boolean; untranslated?: boolean }
export interface BookletVersion { id: string; lang: 'es' | 'en'; versionNumber: number; status: 'draft' | 'approved'; content: { blocks: BookletBlock[]; audit?: { key: string; label: string; numbers: string[] }[] }; createdBy: string | null; createdAt: string; approvedAt: string | null; approvedBy: string | null }

// ── Estados (rótulos y colores; el estado lo deriva el servidor) ──────────
export const TRANSLATION_META: Record<TranslationState, { label: string; cls: string }> = {
    not_started: { label: 'No iniciada', cls: 'bg-slate-100 text-slate-600 ring-slate-200' },
    generating: { label: 'En generación', cls: 'bg-sky-50 text-sky-700 ring-sky-200' },
    draft: { label: 'Borrador', cls: 'bg-amber-50 text-amber-800 ring-amber-200' },
    pending_review: { label: 'Pendiente de revisión', cls: 'bg-orange-50 text-orange-700 ring-orange-200' },
    reviewed: { label: 'Revisada', cls: 'bg-indigo-50 text-indigo-700 ring-indigo-200' },
    approved: { label: 'Aprobada', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
    outdated: { label: 'Desactualizada', cls: 'bg-red-50 text-red-700 ring-red-200' },
    error: { label: 'Error', cls: 'bg-red-50 text-red-700 ring-red-200' },
};
export const FIELD_META: Record<FieldState, { label: string; cls: string }> = {
    missing: { label: 'Sin traducir', cls: 'bg-slate-100 text-slate-600' },
    draft: { label: 'Borrador', cls: 'bg-amber-50 text-amber-800' },
    reviewed: { label: 'Revisado', cls: 'bg-emerald-50 text-emerald-700' },
    outdated: { label: 'Desactualizado', cls: 'bg-red-50 text-red-700' },
};

// ── Acceso a la API ────────────────────────────────────────────────────────
export const withEventoParam = (url: string, eventId: string | null | undefined) =>
    (eventId ? `${url}${url.includes('?') ? '&' : '?'}evento=${encodeURIComponent(eventId)}` : url);

export class DossierApiError extends Error {
    status: number; body: any;
    constructor(message: string, status: number, body: any) { super(message); this.status = status; this.body = body; }
}

/** Una petición del expediente: JSON leído con cuidado y el error del servidor tal cual. */
export const dossierRequest = async <T = any>(path: string, eventId: string | null | undefined, init: { method?: string; body?: unknown } = {}): Promise<T> => {
    const headers: Record<string, string> = authHeaders();
    if (init.body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await fetch(withEventoParam(`${API}/project-fair/admin${path}`, eventId), {
        method: init.method || 'GET', headers, body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
    const { data, crudo, esJson } = await leerJson<any>(res);
    if (!esJson) throw new DossierApiError(describirNoJson(res, crudo), res.status, null);
    if (!res.ok) throw new DossierApiError(data?.error || `Error ${res.status}`, res.status, data);
    return data as T;
};

// ── Formato de valores ─────────────────────────────────────────────────────
export const isEmptyValue = (v: any): boolean => {
    if (v === null || v === undefined) return true;
    if (Array.isArray(v)) return v.length === 0 || v.every(x => (x && typeof x === 'object' ? Object.values(x).every(y => String(y ?? '').trim() === '') : String(x ?? '').trim() === ''));
    if (typeof v === 'object') return Object.values(v).every(isEmptyValue);
    return String(v).trim() === '';
};

export const fmtMoney = (v: any, lang: 'es' | 'en' = 'es') => {
    const n = Number(v);
    if (v === null || v === undefined || String(v).trim() === '' || !Number.isFinite(n)) return String(v ?? '');
    return `US$ ${n.toLocaleString(lang === 'en' ? 'en-US' : 'es-CO', { maximumFractionDigits: 2 })}`;
};

export const fmtDay = (v: any, lang: 'es' | 'en' = 'es') => {
    const t = String(v ?? '');
    if (!/^\d{4}-\d{2}-\d{2}/.test(t)) return t;
    const d = new Date(`${t.slice(0, 10)}T12:00:00`);
    return Number.isNaN(d.getTime()) ? t : d.toLocaleDateString(lang === 'en' ? 'en-US' : 'es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
};

/** Texto plano de un valor simple (no tabla ni lista de filas). */
export const plainValue = (field: Pick<DossierField, 'type'>, value: any, lang: 'es' | 'en' = 'es'): string => {
    if (isEmptyValue(value)) return '';
    switch (field.type) {
        case 'currency': return fmtMoney(value, lang);
        case 'percent': return `${value}%`;
        case 'date': return fmtDay(value, lang);
        case 'checkbox': return value === true ? (lang === 'en' ? 'Yes' : 'Sí') : (lang === 'en' ? 'No' : 'No');
        case 'multiselect': return Array.isArray(value) ? value.join(' · ') : String(value);
        default: return Array.isArray(value) ? value.join(', ') : String(value);
    }
};

/** Filas de una tabla fija (matriz) que se muestran: las vigentes y las retiradas con valor. */
export const matrixRows = (field: DossierField): { key: string; label: string; labelEn: string | null; retired: boolean }[] => {
    const rows = (field.rows || []).map((r, i) => ({ key: r.key, label: r.label, labelEn: field.rowsEn?.[i] || null, retired: false }));
    const value = field.value && typeof field.value === 'object' ? field.value : {};
    for (const r of field.retiredRows || []) {
        if (!isEmptyValue(value[r.key])) rows.push({ key: r.key, label: `${r.label} (retirado del formulario)`, labelEn: null, retired: true });
    }
    return rows;
};

export const NOT_PROVIDED = { es: 'No informado', en: 'Not provided' } as const;
