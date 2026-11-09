// ════════════════════════════════════════════════════════════════════════════
// Cursos y capacitaciones (LMS) — el cliente del navegador (v4.1302.0)
//
// Habla con `/api/cursos`. El criterio vive en el servidor
// (`server/lib/learningSpec.js`); aquí sólo rótulos, llamadas y la subida.
//
// SUBIDA: directo a S3. Hasta 64 MB, un PUT; más, multiparte por partes de
// 16 MB, tres a la vez, con reintentos. Si se corta o se recarga la página,
// volver a elegir el MISMO archivo reanuda desde las partes que S3 ya tiene.
// El navegador nunca dice «listo» antes de que el servidor confirme el
// objeto real (`/archivos/completar`).
//
// GUARDADO AUTOMÁTICO: `Autosaver` agrupa cambios por entidad, espera 700 ms
// desde la última tecla y manda UN PATCH con todo lo pendiente. Si falla la
// red, conserva lo pendiente y lo reintenta; el estado («Guardando…», «Todos
// los cambios guardados», «Sin conexión») lo pinta la pantalla.
// ════════════════════════════════════════════════════════════════════════════
import { leerJson } from './leerJson';

const API = import.meta.env.VITE_API_URL || '/api';
export const LEARNING_BASE = `${API}/cursos`;

export const tokenHeader = (): Record<string, string> => {
    try { const t = localStorage.getItem('rotary_token'); return t ? { Authorization: `Bearer ${t}` } : {}; } catch { return {}; }
};

export class LearningError extends Error {
    status: number; errors: { field?: string; message: string }[]; extra: any;
    constructor(message: string, status: number, errors: any[] = [], extra: any = null) { super(message); this.status = status; this.errors = errors; this.extra = extra; }
}

export async function learningApi<T = any>(path: string, { method = 'GET', body, headers = {} }: { method?: string; body?: unknown; headers?: Record<string, string> } = {}): Promise<T> {
    let r: Response;
    try {
        r = await fetch(`${LEARNING_BASE}${path}`, {
            method, headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...tokenHeader(), ...headers },
            body: body === undefined ? undefined : JSON.stringify(body),
        });
    } catch {
        throw new LearningError('Sin conexión con el servidor. Lo que escribiste sigue aquí: se reintentará.', 0);
    }
    const { data } = await leerJson<any>(r);
    if (!r.ok) {
        if (r.status === 401) throw new LearningError('Tu sesión venció. Vuelve a entrar.', 401);
        throw new LearningError(data?.error || `El servidor respondió ${r.status}.`, r.status, Array.isArray(data?.errors) ? data.errors : [], data);
    }
    return (data || {}) as T;
}
export const misApi = <T = any>(path: string, init?: Parameters<typeof learningApi>[1]) => learningApi<T>(`/mis${path}`, init);
export const adminApi = <T = any>(path: string, init?: Parameters<typeof learningApi>[1]) => learningApi<T>(`/admin${path}`, init);
export const publicApi = <T = any>(path: string, init?: Parameters<typeof learningApi>[1]) => learningApi<T>(`/public${path}`, init);

// ─── Tipos ─────────────────────────────────────────────────────────────
export interface Catalogs {
    states: Record<string, { label: string; tone: string }>;
    displayStates: Record<string, { label: string; tone: string }>;
    accessModes: Record<string, { label: string; help: string }>;
    audiences: Record<string, string>; levels: Record<string, string>; languages: Record<string, string>; areas: Record<string, string>;
    features: Record<string, { label: string; available: boolean; phase: number }>;
    filePurposes: Record<string, { label: string; exts: string[]; visibility: string }>;
    limits: { image: number; video: number; audio: number; document: number; resource: number; filesPerCourse: number; multipartThreshold: number; partSize: number };
    clubTransitions: Record<string, string[]>; adminTransitions: Record<string, string[]>; editableStates: string[];
}
export interface Collection {
    id: string; siteId: string; ownerClubName: string | null; districtNumber: string | null; slug: string; name: string; description: string | null;
    projectRef: string | null; projectFairSubmissionId: string | null; areaFocus: string | null; audience: string[]; coverUrl: string | null; accessMode: string;
    inviteToken: string | null; status: string; createdAt: string; updatedAt: string;
    courseCount?: number; publishedCount?: number; inReviewCount?: number; draftCount?: number;
}
export interface Readiness { ready: boolean; missing: { key: string; label: string }[]; warnings?: string[]; done: number; total: number; requirements?: { key: string; label: string; ok: boolean }[] }
export interface CourseSummary {
    id: string; slug: string; title: string; subtitle: string | null; shortDescription: string | null; coverUrl: string; status: string; displayStatus: string; readiness: Readiness;
    lessonCount: number; moduleCount: number; fileCount: number; uploadingCount: number; durationMinutes: number; accessMode: string; sortOrder: number; collectionId: string | null;
    reviewNote: string | null; updatedAt: string; lastEditedAt: string | null; submittedAt: string | null; publishedAt: string | null; projectRef: string | null; ownerClubName: string | null;
}
export interface Course {
    id: string; collectionId: string | null; siteId: string; ownerClubName: string | null; slug: string; title: string; subtitle: string | null; shortDescription: string | null;
    fullDescription: string | null; learningObjective: string | null; audience: string[]; level: string | null; language: string; durationMinutes: number | null; durationAuto: boolean;
    instructorName: string | null; instructorBio: string | null; instructorImageUrl: string | null; organization: string | null; projectRef: string | null; tags: string[]; areaFocus: string | null;
    coverUrl: string | null; thumbnailUrl: string | null; introVideoFileId: string | null; introVideoUrl: string | null; accessMode: string; inviteToken: string | null;
    features: Record<string, boolean>; rightsAccepted: boolean; rightsText: string | null; status: string; sortOrder: number; reviewNote: string | null;
    submittedAt: string | null; publishedAt: string | null; updatedAt: string; viewCount: number;
}
export interface Module { id: string; courseId: string; title: string; description: string | null; sortOrder: number }
export interface Lesson { id: string; courseId: string; moduleId: string | null; title: string; description: string | null; body: string | null; videoFileId: string | null; videoUrl: string | null; audioFileId: string | null; durationMinutes: number | null; sortOrder: number }
export interface Resource { id: string; courseId: string; lessonId: string | null; kind: string; fileId: string | null; url: string | null; title: string; description: string | null; sortOrder: number }
export interface LFile { id: string; purpose: string; visibility: string; filename: string; bytes: number; kind: string; status: string; format?: string | null; publicUrl?: string | null; durationSeconds?: number | null; contentType?: string | null }
export interface LEvent { id: string; action: string; actorName: string | null; actorRole: string | null; visibility: string; detail: any; createdAt: string }
export interface CourseView {
    course: Course; modules: Module[]; lessons: Lesson[]; resources: Resource[]; files: LFile[]; readiness: Readiness; displayStatus: string; durationMinutes: number;
    editable: boolean; transitions: string[]; collection: { id: string; name: string; slug: string; projectRef: string | null } | null; events: LEvent[];
    config: { rightsText: string; requireRights: boolean; allowExternalVideo: boolean; categories: string[] }; catalogs: Catalogs;
}

export const fmtBytes = (n: number) => (n >= 1024 ** 3 ? `${(n / 1024 ** 3).toFixed(1)} GB` : n >= 1024 ** 2 ? `${(n / 1024 ** 2).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
export const fmtMinutes = (m: number) => { const n = Math.round(Number(m) || 0); if (!n) return ''; if (n < 60) return `${n} min`; const h = Math.floor(n / 60); const r = n % 60; return r ? `${h} h ${r} min` : `${h} h`; };
export const fmtDate = (d?: string | null) => d ? new Date(d).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' }) : '';

export const TONE_CLASS: Record<string, string> = {
    gray: 'bg-gray-100 text-gray-700 border-gray-200', amber: 'bg-amber-50 text-amber-800 border-amber-200', sky: 'bg-sky-50 text-sky-800 border-sky-200',
    blue: 'bg-blue-50 text-blue-800 border-blue-200', emerald: 'bg-emerald-50 text-emerald-800 border-emerald-200', green: 'bg-green-50 text-green-800 border-green-200',
    slate: 'bg-slate-100 text-slate-700 border-slate-200',
};

// ─── Subida ────────────────────────────────────────────────────────────
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

const putWithProgress = (url: string, body: Blob, { contentType, cacheControl, onProgress, signal }: { contentType?: string; cacheControl?: string; onProgress?: (loaded: number) => void; signal?: AbortSignal }) =>
    new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', url);
        if (contentType) { xhr.setRequestHeader('Content-Type', contentType); xhr.setRequestHeader('Cache-Control', cacheControl || 'no-store'); }
        xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress?.(e.loaded); };
        xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`La transferencia falló (${xhr.status}).`)));
        xhr.onerror = () => reject(new Error('Se cortó la conexión.'));
        xhr.ontimeout = () => reject(new Error('La carga tardó demasiado.'));
        signal?.addEventListener('abort', () => { try { xhr.abort(); } catch { /* noop */ } reject(new Error('Carga cancelada.')); });
        xhr.send(body);
    });

/** Duración y dimensiones de un video/audio, leídas en el navegador (orientativas). */
export const probeMedia = (file: File): Promise<{ durationSeconds?: number; width?: number; height?: number }> => new Promise((resolve) => {
    if (!/^(video|audio)\//.test(file.type)) return resolve({});
    const el = document.createElement(file.type.startsWith('audio') ? 'audio' : 'video') as HTMLVideoElement;
    const url = URL.createObjectURL(file);
    const done = (v: any) => { URL.revokeObjectURL(url); resolve(v); };
    el.preload = 'metadata';
    el.onloadedmetadata = () => done({ durationSeconds: Number.isFinite(el.duration) ? Math.round(el.duration) : undefined, width: el.videoWidth || undefined, height: el.videoHeight || undefined });
    el.onerror = () => done({});
    setTimeout(() => done({}), 8000);
    el.src = url;
});

export type UploadProgress = (pct: number, phase: 'uploading' | 'confirming') => void;

/** Sube un archivo del curso. Devuelve el archivo CONFIRMADO por el servidor. */
export async function uploadCourseFile(courseId: string, file: File, purpose: string, { onCreated, onProgress, signal }: { onCreated?: (id: string) => void; onProgress?: UploadProgress; signal?: AbortSignal } = {}): Promise<LFile> {
    const pre = await misApi<any>(`/cursos/${courseId}/archivos/presign`, { method: 'POST', body: { filename: file.name, size: file.size, purpose } });
    onCreated?.(pre.fileId);
    if (pre.mode === 'single') {
        let ultimo: Error | null = null;
        for (let intento = 0; intento < 3; intento++) {
            try { await putWithProgress(pre.uploadUrl, file, { contentType: pre.contentType, cacheControl: pre.cacheControl, signal, onProgress: (l) => onProgress?.(Math.min(99, Math.round((l / file.size) * 100)), 'uploading') }); ultimo = null; break; }
            catch (e: any) { ultimo = e; if (signal?.aborted) throw e; await sleep(1500 * (intento + 1)); }
        }
        if (ultimo) throw ultimo;
    } else {
        const total: number = pre.parts; const size: number = pre.partSize;
        const done = new Set<number>(pre.done || []);
        const loaded: Record<number, number> = {};
        for (const n of done) loaded[n] = Math.min(size, file.size - (n - 1) * size);
        const report = () => onProgress?.(Math.min(99, Math.round((Object.values(loaded).reduce((a, b) => a + b, 0) / file.size) * 100)), 'uploading');
        report();
        const pendientes = Array.from({ length: total }, (_, i) => i + 1).filter(n => !done.has(n));
        const subirParte = async (n: number) => {
            for (let intento = 0; intento < 4; intento++) {
                try {
                    const { urls } = await misApi<{ urls: { partNumber: number; url: string }[] }>(`/cursos/${courseId}/archivos/partes`, { method: 'POST', body: { fileId: pre.fileId, partNumbers: [n] } });
                    const blob = file.slice((n - 1) * size, Math.min(file.size, n * size));
                    await putWithProgress(urls[0].url, blob, { signal, onProgress: (l) => { loaded[n] = l; report(); } });
                    loaded[n] = blob.size; report();
                    return;
                } catch (e) {
                    if (signal?.aborted || intento === 3) throw e;
                    await sleep(2000 * 2 ** intento);
                }
            }
        };
        const cola = [...pendientes];
        await Promise.all([0, 1, 2].map(async () => { while (cola.length) { const n = cola.shift()!; await subirParte(n); } }));
    }
    onProgress?.(99, 'confirming');
    const meta = await probeMedia(file);
    const { file: ready } = await misApi<{ file: LFile }>(`/cursos/${courseId}/archivos/completar`, { method: 'POST', body: { fileId: pre.fileId, meta } });
    onProgress?.(100, 'confirming');
    return ready;
}

/** Portada de una colección: un PUT público y confirmación. Devuelve la URL pública. */
export async function uploadCollectionCover(collectionId: string, file: File, onProgress?: (pct: number) => void): Promise<string> {
    const pre = await misApi<any>(`/colecciones/${collectionId}/portada/presign`, { method: 'POST', body: { filename: file.name, size: file.size } });
    await putWithProgress(pre.uploadUrl, file, { contentType: pre.contentType, cacheControl: pre.cacheControl, onProgress: (l) => onProgress?.(Math.min(99, Math.round((l / file.size) * 100))) });
    const r = await misApi<{ coverUrl: string }>(`/colecciones/${collectionId}/portada/completar`, { method: 'POST', body: { fileId: pre.fileId } });
    onProgress?.(100);
    return r.coverUrl;
}

// ─── Guardado automático ───────────────────────────────────────────────
export type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'offline' | 'error';

/**
 * Un guardador por pantalla. `queue(key, patch, send)` acumula el `patch`
 * de esa entidad y, 700 ms después del último cambio, llama `send(merged)`.
 * Lo pendiente nunca se pierde: si `send` falla, se vuelve a encolar y se
 * reintenta (cada 5 s si no hay red, al instante al volver `online`).
 */
export class Autosaver {
    private pending = new Map<string, { patch: Record<string, any>; send: (p: Record<string, any>) => Promise<any> }>();
    private timer: any = null;
    private retry: any = null;
    private inFlight = 0;
    state: SaveState = 'idle';
    lastSavedAt: Date | null = null;
    lastError = '';
    onChange: (s: SaveState) => void = () => {};
    private onlineHandler = () => { if (this.pending.size) this.flush(); };

    constructor() { if (typeof window !== 'undefined') window.addEventListener('online', this.onlineHandler); }
    destroy() { if (typeof window !== 'undefined') window.removeEventListener('online', this.onlineHandler); clearTimeout(this.timer); clearTimeout(this.retry); }
    private set(s: SaveState) { this.state = s; this.onChange(s); }
    get hasPending() { return this.pending.size > 0 || this.inFlight > 0; }

    queue(key: string, patch: Record<string, any>, send: (p: Record<string, any>) => Promise<any>, delay = 700) {
        const prev = this.pending.get(key);
        this.pending.set(key, { patch: { ...(prev?.patch || {}), ...patch }, send });
        this.set('dirty');
        clearTimeout(this.timer);
        this.timer = setTimeout(() => this.flush(), delay);
    }

    async flush(): Promise<boolean> {
        clearTimeout(this.timer); clearTimeout(this.retry);
        if (!this.pending.size) { if (this.inFlight === 0) this.set(this.lastSavedAt ? 'saved' : 'idle'); return true; }
        const batch = Array.from(this.pending.entries());
        this.pending.clear();
        this.inFlight += batch.length;
        this.set('saving');
        let ok = true;
        for (const [key, { patch, send }] of batch) {
            try { await send(patch); }
            catch (e: any) {
                ok = false;
                // Lo que no se guardó vuelve a la cola, debajo de lo que se haya escrito después.
                const again = this.pending.get(key);
                this.pending.set(key, { patch: { ...patch, ...(again?.patch || {}) }, send });
                this.lastError = e?.message || 'No se pudo guardar.';
                this.set(e?.status === 0 || (typeof navigator !== 'undefined' && !navigator.onLine) ? 'offline' : 'error');
            } finally { this.inFlight--; }
        }
        if (ok && !this.pending.size) { this.lastSavedAt = new Date(); this.set('saved'); return true; }
        if (!ok) { this.retry = setTimeout(() => this.flush(), 5000); return false; }
        return this.flush();
    }
}

export const saveStateText: Record<SaveState, string> = {
    idle: '', dirty: 'Cambios sin guardar…', saving: 'Guardando cambios…', saved: 'Todos los cambios guardados', offline: 'Sin conexión: los cambios se guardarán al reconectar', error: 'No se pudo guardar. Reintentando…',
};
