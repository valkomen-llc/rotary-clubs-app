// ════════════════════════════════════════════════════════════════════
// Seguimiento documental de los proyectos — tipos y ayudas del cliente
// (v4.1332.0)
//
// ⚠️ EL NAVEGADOR NO CALCULA NINGÚN PORCENTAJE. Todo sale del servidor
// (`server/lib/projectDocumentTracking.js` + `formProgressOf`), el mismo que
// alimenta «Mi Proyecto». Aquí sólo hay tipos, colores y llamadas.
// ════════════════════════════════════════════════════════════════════
import { leerJson, describirNoJson } from './leerJson';

export type Tone = 'slate' | 'amber' | 'blue' | 'indigo' | 'emerald' | 'orange' | 'red' | 'sky' | 'violet';

export interface DocStatus { key: string; label: string; tone?: Tone }
export interface DocRequirementCompact {
    key: string; kind: 'form' | 'file'; short: string; mode: 'required' | 'optional' | 'not_applicable';
    applies: boolean; counts: boolean; pct: number; complete: boolean; status: DocStatus;
    review: 'in_review' | 'validated' | 'changes_requested' | null; reviewStale: boolean; submitted: boolean;
}
export interface DocRisk { key: string; label: string; tone: Tone; daysLeft: number | null; deadline: string | null }
export interface DocumentsCompact {
    overallPct: number; docStatus: DocStatus; complete: boolean;
    validation: { key: string; label: string; count?: number };
    risk: DocRisk; pitch: { key: string; label: string; tone: Tone; number: string | null; requestId: string | null };
    lastActivityAt: string | null; inactive: boolean; reminderCount: number; lastReminderAt: string | null;
    pendingCount: number; requirements: DocRequirementCompact[];
}

export interface FieldRef { section: string; sectionKey: string; key: string; label: string; message?: string }
export interface DocRequirementFull extends DocRequirementCompact {
    label: string; title?: string; available: boolean; deadline: string | null;
    applicabilitySource: 'policy' | 'project'; applicabilityReason: string | null;
    reviewNote: string | null; reviewedAt: string | null; reviewedBy: string | null; fingerprint: string | null;
    // Formularios
    submittedAt?: string | null; lastEditedAt?: string | null; districtReview?: string | null;
    sections?: { key: string; title: string; pct: number; total: number; done: number; complete: boolean }[];
    missing?: FieldRef[]; invalid?: FieldRef[]; requiredTotal?: number; requiredDone?: number;
    // Archivos
    file?: { id: string; fileName: string | null; format?: string; sizeBytes?: number; versionNumber?: number; uploadedAt: string | null; uploadedByName?: string | null } | null;
    videoId?: string | null; videoStatus?: string; delivered?: boolean;
}
export interface DocumentTrackingFull extends Omit<DocumentsCompact, 'requirements' | 'pendingCount'> {
    formsPct: number | null; filesDelivered: number; filesRequired: number; priority: number;
    requirements: DocRequirementFull[];
    pending: { key: string; label: string; short: string; kind: string; detail: string; deadline: string | null }[];
}

export interface TrackingConfig {
    enabled: boolean; deadline: string | null;
    requirements: Record<string, { mode: 'required' | 'optional' | 'not_applicable'; weight: number; deadline: string | null }>;
    urgentDays: number; attentionDays: number; inactivityDays: number;
    reminders: { enabled: boolean; minDays: number; max: number };
    reminderNote: string; presentationMaxMb: number;
}
export interface TrackingKpis {
    total: number; complete: number; incomplete: number; pendingMaster: number; pendingFdd: number;
    pendingPresentation: number; pendingVideo: number; pendingValidation: number; changesRequested: number;
    validated: number; urgent: number; inactive: number; reminded: number; averagePct: number;
}
export interface TrackingSummary {
    kpis: TrackingKpis; config: TrackingConfig;
    requirements: { key: string; kind: string; label: string; short: string }[];
    modes: { key: string; label: string }[];
    views: { key: string; label: string }[];
    reminderScopes: { key: string; label: string }[];
    editingClose: { applicationsDeadline: string | null; postCloseEnabled: boolean; validity: string; until: string | null };
    warnings: string[];
}

export const FDD_KEY = 'fdd_2026_2027';

/** Colores por tono, con texto (nunca sólo color). */
export const TONE_CLS: Record<string, string> = {
    slate: 'bg-slate-100 text-slate-700 ring-slate-200',
    amber: 'bg-amber-50 text-amber-800 ring-amber-200',
    blue: 'bg-blue-50 text-blue-800 ring-blue-200',
    sky: 'bg-sky-50 text-sky-800 ring-sky-200',
    indigo: 'bg-indigo-50 text-indigo-800 ring-indigo-200',
    emerald: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
    orange: 'bg-orange-50 text-orange-800 ring-orange-200',
    red: 'bg-red-50 text-red-800 ring-red-200',
    violet: 'bg-violet-50 text-violet-800 ring-violet-200',
};
export const barColor = (pct: number) => (pct >= 100 ? '#059669' : pct >= 80 ? '#17458F' : pct >= 50 ? '#0EA5E9' : pct > 0 ? '#F59E0B' : '#CBD5E1');

const DOC_TONE: Record<string, Tone> = { complete: 'emerald', almost: 'blue', pending: 'amber', not_started: 'slate' };
export const docStatusTone = (key: string): Tone => DOC_TONE[key] || 'slate';
const VALIDATION_TONE: Record<string, Tone> = { validated: 'emerald', changes_requested: 'orange', pending_review: 'indigo', partial: 'sky', not_ready: 'slate' };
export const validationTone = (key: string): Tone => VALIDATION_TONE[key] || 'slate';

export const fmtDay = (d?: string | null) => {
    if (!d) return '—';
    const iso = /^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d}T12:00:00-05:00` : d;
    const t = new Date(iso);
    return Number.isNaN(t.getTime()) ? '—' : t.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'America/Bogota' });
};
export const fmtDayTime = (d?: string | null) => (d ? new Date(d).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' }) : '—');

// ── Llamadas ─────────────────────────────────────────────────────────
const API = (import.meta as any).env?.VITE_API_URL || '/api';
const BASE = `${API}/project-fair/admin/seguimiento-documental`;

export const docRequest = async <T = any>(path: string, eventId: string, init: RequestInit = {}): Promise<T> => {
    const sep = path.includes('?') ? '&' : '?';
    const url = `${BASE}${path}${eventId ? `${sep}evento=${encodeURIComponent(eventId)}` : ''}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 60_000);
    try {
        const res = await fetch(url, {
            ...init,
            signal: ctrl.signal,
            headers: {
                Authorization: `Bearer ${localStorage.getItem('rotary_token')}`,
                ...(init.body ? { 'Content-Type': 'application/json' } : {}),
                ...(init.headers || {}),
            },
        });
        const { data: parsed, crudo, esJson } = await leerJson<any>(res);
        if (!esJson) throw new Error(describirNoJson(res, crudo));
        const data = parsed;
        if (!res.ok) {
            const err: any = new Error(data?.error || `El servidor respondió ${res.status}.`);
            err.status = res.status; err.code = data?.code; err.data = data;
            throw err;
        }
        return data as T;
    } catch (e: any) {
        if (e?.name === 'AbortError') throw new Error('El servidor tardó demasiado en responder. Vuelve a intentarlo.');
        throw e;
    } finally {
        clearTimeout(timer);
    }
};
