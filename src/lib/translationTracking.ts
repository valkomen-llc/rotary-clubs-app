// ════════════════════════════════════════════════════════════════════════════
// Seguimiento y verificación de traducciones por Cadres — tipos y rótulos
// (v4.1356.0)
//
// El estado lo DERIVA el servidor (`server/lib/translationTracking.js`) con el
// mismo cálculo del expediente: aquí sólo se pinta. Ningún permiso se decide
// en el navegador; un botón oculto es cortesía, el 403 lo pone el servidor.
// ════════════════════════════════════════════════════════════════════════════

export type TrackingState = 'no_content' | 'untranslated' | 'in_progress' | 'pending_review' | 'in_review' | 'needs_update' | 'verified';

export interface TranslationTracking {
    state: TrackingState; label: string; tone: string;
    total: number; translated: number; reviewed: number;
    missing: number; unreviewed: number; outdated: number;
    translatedPct: number | null; reviewedPct: number | null;
    warnings: number; readyToVerify: boolean; generating: boolean; lastError: string | null;
    verification: {
        kind: 'verification' | 'legacy'; at: string; by: string | null; role: string | null;
        versionId: string | null; versionNumber: number | null; fieldCount: number | null; vigente: boolean;
    } | null;
    legacyApproved: boolean;
    invalidatedAt: string | null;
    invalidatedPaths: { path: string; label: string; state: string }[];
    revokedAt: string | null; revokeReason: string | null;
    assignee: { email: string; name: string | null; assignedAt: string | null; assignedBy: string | null } | null;
}

export interface TranslationKpis {
    total: number; applicable: number; untranslated: number; inProgress: number; pendingReview: number; inReview: number;
    verified: number; needsUpdate: number; readyToVerify: number; withWarnings: number; unassigned: number; noContent: number;
    verifiedPct: number; translatedPct: number; reviewedPct: number;
}
export interface CadreWorkload { email: string; name: string | null; assigned: number; verified: number; needsUpdate: number; pending: number; reviewedPct: number; lastVerifiedAt: string | null }
export interface Assignable { email: string; name: string | null; role: string; roleLabel: string }
export interface TranslationConfig { deadline: string | null; notifyOnInvalidation: boolean; notifyOnAssignment: boolean; reminderNote: string | null }
export interface TranslationSummary {
    kpis: TranslationKpis; workload: CadreWorkload[]; mine: number; config: TranslationConfig; daysToDeadline: number | null;
    views: { key: string; label: string }[]; reminderScopes: { key: string; label: string }[];
    assignable: Assignable[];
    access: { role: string; manageTranslation: boolean; config: boolean; approveTranslation: boolean; translate: boolean };
}

/** Colores institucionales por estado (clases completas: Tailwind no ve cadenas armadas). */
export const TRACKING_META: Record<TrackingState, { label: string; short: string; cls: string; dot: string; bar: string }> = {
    no_content: { label: 'Sin textos para traducir', short: 'Sin textos', cls: 'bg-slate-50 text-slate-500 ring-slate-200', dot: 'bg-slate-300', bar: 'bg-slate-300' },
    untranslated: { label: 'Sin traducir', short: 'Sin traducir', cls: 'bg-slate-100 text-slate-700 ring-slate-200', dot: 'bg-slate-400', bar: 'bg-slate-400' },
    in_progress: { label: 'Traducción en progreso', short: 'En progreso', cls: 'bg-sky-50 text-sky-800 ring-sky-200', dot: 'bg-sky-500', bar: 'bg-sky-500' },
    pending_review: { label: 'Pendiente de revisión', short: 'Por revisar', cls: 'bg-orange-50 text-orange-800 ring-orange-200', dot: 'bg-orange-500', bar: 'bg-orange-500' },
    in_review: { label: 'En revisión', short: 'En revisión', cls: 'bg-blue-50 text-blue-800 ring-blue-200', dot: 'bg-blue-600', bar: 'bg-blue-600' },
    needs_update: { label: 'Requiere actualización', short: 'Actualizar', cls: 'bg-red-50 text-red-700 ring-red-200', dot: 'bg-red-500', bar: 'bg-red-500' },
    verified: { label: 'Verificada', short: 'Verificada', cls: 'bg-emerald-50 text-emerald-800 ring-emerald-200', dot: 'bg-emerald-600', bar: 'bg-emerald-600' },
};

export const ROLE_LABELS: Record<string, string> = { cadre: 'Cadre', admin: 'Administrador', reviewer: 'Revisor', translator: 'Traductor', system: 'Sistema' };
export const roleLabel = (r?: string | null) => (r ? (ROLE_LABELS[r] || r) : '');

export const fmtWhen = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Bogota' }) : '');

/** Las columnas de traducción del Excel (las mismas cifras del CSV del servidor). */
export const translationExcelColumns = (t?: TranslationTracking | null): Record<string, string | number> => {
    const v = t?.verification?.kind === 'verification' ? t.verification : null;
    return {
        'Traducción EN (estado)': t ? t.label : '',
        'Traducción EN (%)': t?.translatedPct ?? '',
        'Revisión EN (%)': t?.reviewedPct ?? '',
        'Campos pendientes': t ? t.missing + t.unreviewed + t.outdated : '',
        'Cadre responsable': t?.assignee?.email || '',
        'Verificada por': v?.by || '',
        'Fecha de verificación': v?.at ? fmtWhen(v.at) : '',
        'Versión verificada': v?.versionNumber ?? '',
        'Vigencia de la verificación': v ? (v.vigente ? 'Vigente' : 'Sin vigencia') : '',
    };
};
