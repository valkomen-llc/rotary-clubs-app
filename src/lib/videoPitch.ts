// ════════════════════════════════════════════════════════════════════
// Video Pitch Profesional — tipos y llamadas compartidas (v4.1293.0)
//
// Lo que comparten la tarjeta y la vista del participante en «Mi proyecto» y
// la pestaña del administrador: la forma de lo que devuelve el servidor, los
// rótulos de los estados y la subida directa a S3 con avance.
// ════════════════════════════════════════════════════════════════════
import { leerJson } from './leerJson';

export const VP_API = (import.meta as any).env?.VITE_API_URL || '/api';
export const VP_TIMEOUT_MS = 25_000;
export const vpTimeoutSignal = () => (typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal ? AbortSignal.timeout(VP_TIMEOUT_MS) : undefined);

export type VpStatus =
    | 'not_requested' | 'draft' | 'submitted' | 'in_review' | 'info_required' | 'script_in_progress'
    | 'script_pending_approval' | 'script_approved' | 'in_production' | 'video_in_review' | 'finished' | 'delivered' | 'cancelled';

export interface VpStatusMeta { key: VpStatus; label: string; tone: string; stage: number; terminal: boolean }

/** Colores de cada tono, para la insignia y el punto. Coinciden con las tarjetas de los formularios. */
export const VP_TONE: Record<string, { badge: string; dot: string }> = {
    slate:   { badge: 'bg-slate-100 text-slate-600',     dot: 'bg-slate-400' },
    amber:   { badge: 'bg-amber-50 text-amber-800',      dot: 'bg-amber-500' },
    orange:  { badge: 'bg-orange-50 text-orange-800',    dot: 'bg-orange-500' },
    blue:    { badge: 'bg-blue-50 text-blue-800',        dot: 'bg-blue-600' },
    indigo:  { badge: 'bg-indigo-50 text-indigo-800',    dot: 'bg-indigo-600' },
    violet:  { badge: 'bg-violet-50 text-violet-800',    dot: 'bg-violet-600' },
    emerald: { badge: 'bg-emerald-50 text-emerald-700',  dot: 'bg-emerald-500' },
};
export const vpTone = (tone?: string) => VP_TONE[tone || 'slate'] || VP_TONE.slate;

export interface VpFile {
    id: string; role: 'material' | 'deliverable' | 'thumbnail'; kind: 'image' | 'video' | 'document'; kindLabel: string;
    fileName: string; contentType: string; sizeBytes: number; sizeLabel: string;
    width: number | null; height: number | null; durationSec: number | null; warnings: string[]; caption: string;
    uploadedBy: string | null; uploadedByRole: string | null; createdAt: string; deletedAt: string | null;
}
export interface VpScene {
    number: number; key: string; title: string; durationSec: number; narration: string; visual: string;
    materials: string[]; onScreenText: string; notes: string;
}
export interface VpScriptContent {
    title: string; summary: string; scenes: VpScene[]; missingInfo: string[]; totalSeconds: number; targetSeconds: number;
    audit?: { ok: boolean; suspicious: { scene: number; value: string }[] }; note?: string | null;
}
export interface VpScript {
    id: string; versionNumber: number; source: 'ai' | 'manual'; status: 'draft' | 'sent_to_participant' | 'approved' | 'superseded';
    language: string | null; tone: string | null; targetSeconds: number | null; instructions: string;
    provider: string | null; model: string | null; basedOnId: string | null; createdBy: string | null; createdAt: string;
    current: boolean; approved: boolean; totalSeconds: number; missingInfoCount: number; content: VpScriptContent;
}
export interface VpEvent {
    id: string; type: string; title: string | null; detail: string | null; metadata: any;
    actorName: string | null; actorRole: string | null; visibility: 'all' | 'internal'; createdAt: string;
}
export interface VpAnswers {
    identification: { responsibleName: string; email: string; whatsapp: string };
    story: Record<string, string> & { description: string };
    preferences: { language: string; objective: string; objectiveOther: string; notes: string };
    consent: { mediaAuthorization: boolean };
}
export interface VpRequest {
    id: string; number: string | null; status: VpStatus; statusLabel: string; statusTone: string; stage: number; terminal: boolean;
    submissionId: string; eventId: string | null; answers: VpAnswers; completionPct: number;
    assigneeId: string | null; assigneeName: string | null; currentScriptId: string | null; approvedScriptId: string | null;
    deliverableFileId: string | null; thumbnailFileId: string | null; infoRequest: string | null; adminNotes: string | null;
    submittedAt: string | null; deliveredAt: string | null; lastEditedAt: string | null; createdAt: string; updatedAt: string;
    identity: { district: string; clubName: string; projectName: string; publicRef: string; submissionId: string | null };
}
export interface VpCatalog {
    statuses: VpStatusMeta[]; languages: { key: string; label: string }[]; objectives: { key: string; label: string }[];
    tones: { key: string; label: string }[]; guidedQuestions: { key: string; label: string; source: string | null }[];
    descriptionMin: number; accept: string; maxFiles: number; limits: Record<string, number>;
    tips: { photos: string[]; videos: string[] }; scenePlan: { number: number; key: string; title: string; share: number; goal: string }[];
    targetSecondsDefault: number; targetSecondsMax: number;
}
export interface VpPortalView {
    exists: boolean; available: boolean; reason: string | null; status: VpStatus; statusLabel: string;
    request: VpRequest | null; identity: VpRequest['identity'];
    prefill: { identification: VpAnswers['identification']; suggestions: Record<string, string> };
    catalog: VpCatalog; files: VpFile[]; scripts: VpScript[]; events: VpEvent[];
    canEdit: boolean; canDecideScript?: boolean;
    validation?: { ok: boolean; errors: { field: string; message: string }[]; warnings: string[] };
    deliverable: VpFile | null; thumbnail?: VpFile | null;
}

export const vpFmtDateTime = (iso?: string | null) =>
    (iso ? new Date(iso).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' }) : '—');
export const vpFmtSeconds = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

/** Sube un archivo a una URL prefirmada informando el avance (fetch no lo da). */
export const vpPutWithProgress = (url: string, file: File, contentType: string, onProgress: (pct: number) => void) =>
    new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', url);
        xhr.setRequestHeader('Content-Type', contentType);
        xhr.timeout = 60 * 60 * 1000;
        xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)); };
        xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`El almacenamiento rechazó el archivo (HTTP ${xhr.status}).`)));
        xhr.onerror = () => reject(new Error('Se cortó la conexión con el almacenamiento. Revisa tu red y vuelve a intentarlo.'));
        xhr.ontimeout = () => reject(new Error('La subida tardó demasiado.'));
        xhr.send(file);
    });

/** Las dimensiones (y la duración) las lee el navegador; el servidor las guarda como declaradas. */
export const vpReadMediaMeta = (file: File): Promise<{ width: number | null; height: number | null; durationSec: number | null }> =>
    new Promise((resolve) => {
        const none = { width: null, height: null, durationSec: null };
        try {
            const url = URL.createObjectURL(file);
            const done = (v: { width: number | null; height: number | null; durationSec: number | null }) => { URL.revokeObjectURL(url); resolve(v); };
            if (file.type.startsWith('image/')) {
                const img = new Image();
                img.onload = () => done({ width: img.naturalWidth, height: img.naturalHeight, durationSec: null });
                img.onerror = () => done(none);
                img.src = url;
            } else if (file.type.startsWith('video/')) {
                const v = document.createElement('video');
                v.preload = 'metadata';
                v.onloadedmetadata = () => done({ width: v.videoWidth || null, height: v.videoHeight || null, durationSec: Number.isFinite(v.duration) ? v.duration : null });
                v.onerror = () => done(none);
                v.src = url;
            } else {
                done(none);
            }
        } catch { resolve(none); }
    });

/** Petición JSON con sesión, tope de tiempo y lectura segura del cuerpo. */
export const vpFetch = async <T = any>(path: string, token: string, init: RequestInit = {}): Promise<{ res: Response; data: T | null }> => {
    const res = await fetch(`${VP_API}${path}`, {
        ...init,
        headers: { Authorization: `Bearer ${token}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...(init.headers || {}) },
        signal: vpTimeoutSignal(),
    });
    const { data } = await leerJson<T>(res);
    return { res, data };
};
