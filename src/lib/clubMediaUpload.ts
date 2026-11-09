// ════════════════════════════════════════════════════════════════════
// Subida de archivos del Directorio Distrital de Clubes — v4.1306.0
//
//   1. pedir al servidor una URL prefirmada (prefijo PRIVADO);
//   2. subir el archivo DIRECTO a S3 con XHR (progreso real, cancelable);
//   3. pedir al servidor que lo valide por sus bytes, lo procese y lo guarde.
//
// «Guardado» sólo existe cuando el paso 3 responde: nunca se anuncia un éxito
// que el servidor no confirmó. Cada llamada lleva tope de tiempo y ninguna
// respuesta se lee a ciegas (`leerJson`).
// ════════════════════════════════════════════════════════════════════
import { leerJson, describirNoJson } from './leerJson';
import { uploadContentType, type ClubMediaRole } from './clubMediaSpec';

const API = (import.meta as any).env?.VITE_API_URL || '/api';

export type ClubMediaAuth =
    | { context: 'borrador'; ensureDraft: () => Promise<string> }
    | { context: 'portal'; token: string };

export interface ClubMedia {
    id: string;
    role: ClubMediaRole;
    roleLabel?: string;
    status: 'subiendo' | 'procesando' | 'guardado' | 'publicado' | 'error' | 'duplicado' | 'eliminado' | 'ajeno';
    statusLabel: string;
    name: string;
    url: string | null;
    viewUrl?: string;
    published?: boolean;
    originalBytes?: number | null;
    bytes?: number | null;
    width?: number | null;
    height?: number | null;
    format?: string | null;
    converted?: boolean;
    errorCode?: string | null;
    error?: string | null;
}

export class ClubMediaUploadError extends Error {
    code?: string;
    hint?: string;
    retryable: boolean;
    constructor(message: string, { code, hint, retryable = true }: { code?: string; hint?: string; retryable?: boolean } = {}) {
        super(message);
        this.code = code;
        this.hint = hint;
        this.retryable = retryable;
    }
}

/** Errores que NO se arreglan reintentando con el mismo archivo. */
const FINAL_CODES = new Set(['format', 'empty', 'too_large', 'not_image', 'corrupt', 'too_small', 'forbidden', 'gallery_full', 'draft_closed', 'role']);

const withTimeout = async (url: string, init: RequestInit, ms: number): Promise<Response> => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    try {
        return await fetch(url, { ...init, signal: ctrl.signal });
    } catch (err: any) {
        if (err?.name === 'AbortError') throw new ClubMediaUploadError('El servidor tardó demasiado en responder.', { code: 'timeout', hint: 'Revisa tu conexión y vuelve a intentarlo.' });
        throw new ClubMediaUploadError('Se cortó la conexión.', { code: 'network', hint: 'Revisa tu conexión y vuelve a intentarlo; tus demás datos siguen guardados.' });
    } finally {
        clearTimeout(timer);
    }
};

const authBits = async (auth: ClubMediaAuth): Promise<{ headers: Record<string, string>; body: Record<string, string> }> => {
    if (auth.context === 'portal') return { headers: { Authorization: `Bearer ${auth.token}` }, body: { context: 'portal' } };
    const draftToken = await auth.ensureDraft();
    if (!draftToken) throw new ClubMediaUploadError('No se pudo guardar el borrador antes de subir.', { code: 'draft', hint: 'Revisa tu conexión y vuelve a intentarlo.' });
    return { headers: {}, body: { context: 'borrador', draftToken } };
};

const call = async <T>(method: string, path: string, auth: ClubMediaAuth, body: Record<string, unknown> | null, ms: number): Promise<T> => {
    const a = await authBits(auth);
    const res = await withTimeout(`${API}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json', ...a.headers },
        body: JSON.stringify({ ...(body || {}), ...a.body }),
    }, ms);
    const { data, crudo, esJson } = await leerJson<any>(res);
    if (!esJson) throw new ClubMediaUploadError(describirNoJson(res, crudo), { code: `http_${res.status}` });
    if (!res.ok || data?.ok === false) {
        const code = data?.code || `http_${res.status}`;
        throw new ClubMediaUploadError(data?.error || `Error del servidor (HTTP ${res.status}).`, { code, hint: data?.hint || undefined, retryable: !FINAL_CODES.has(code) });
    }
    return data as T;
};

/** PUT directo a S3 con progreso. Devuelve una promesa y una forma de cancelar. */
const putWithProgress = (uploadUrl: string, file: File, contentType: string, onProgress: (pct: number) => void, signal?: AbortSignal): Promise<void> =>
    new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', uploadUrl, true);
        xhr.setRequestHeader('Content-Type', contentType);
        // Sin progreso durante 90 s = conexión muerta (no un archivo grande).
        let lastTick = Date.now();
        const watchdog = setInterval(() => {
            if (Date.now() - lastTick > 90_000) { xhr.abort(); }
        }, 5_000);
        const done = () => clearInterval(watchdog);
        xhr.upload.onprogress = (e) => {
            lastTick = Date.now();
            if (e.lengthComputable) onProgress(Math.min(99, Math.round((e.loaded / e.total) * 100)));
        };
        xhr.onload = () => {
            done();
            if (xhr.status >= 200 && xhr.status < 300) { onProgress(100); resolve(); }
            else reject(new ClubMediaUploadError(`El almacenamiento rechazó el archivo (HTTP ${xhr.status}).`, { code: 'storage', hint: 'Vuelve a intentarlo.' }));
        };
        xhr.onerror = () => { done(); reject(new ClubMediaUploadError('Se cortó la conexión mientras se subía el archivo.', { code: 'network', hint: 'Revisa tu conexión y pulsa «Reintentar»; tus demás datos siguen guardados.' })); };
        xhr.onabort = () => { done(); reject(new ClubMediaUploadError(signal?.aborted ? 'Subida cancelada.' : 'La subida se detuvo por falta de conexión.', { code: signal?.aborted ? 'cancelled' : 'network', hint: 'Pulsa «Reintentar» cuando tengas señal.' })); };
        signal?.addEventListener('abort', () => xhr.abort());
        xhr.send(file);
    });

export type UploadPhase = 'subiendo' | 'procesando';

/**
 * Sube UN archivo y devuelve el archivo ya GUARDADO por el servidor.
 * `onPhase` recibe el avance: subiendo (con %) → procesando.
 */
export const uploadClubMedia = async (
    file: File,
    role: ClubMediaRole,
    auth: ClubMediaAuth,
    { onPhase, signal }: { onPhase?: (phase: UploadPhase, pct: number) => void; signal?: AbortSignal } = {},
): Promise<{ media: ClubMedia; duplicate: boolean }> => {
    const contentType = uploadContentType({ filename: file.name, contentType: file.type });
    onPhase?.('subiendo', 0);
    const pre = await call<{ id: string; uploadUrl: string; contentType: string }>('POST', '/district-clubs/media/presign', auth, {
        role, filename: file.name, contentType: file.type || contentType, size: file.size,
    }, 30_000);
    await putWithProgress(pre.uploadUrl, file, pre.contentType || contentType, (pct) => onPhase?.('subiendo', pct), signal);
    onPhase?.('procesando', 100);
    // La conversión de un HEIC grande puede tardar: la función tiene 120 s.
    return call<{ media: ClubMedia; duplicate: boolean }>('POST', '/district-clubs/media/confirm', auth, { id: pre.id }, 125_000);
};

/** Pregunta al servidor qué archivos de este formulario existen de verdad. */
export const fetchClubMediaStatus = async (ids: string[], auth: ClubMediaAuth): Promise<ClubMedia[]> => {
    if (!ids.length) return [];
    const data = await call<{ media: ClubMedia[] }>('POST', '/district-clubs/media/status', auth, { ids }, 20_000);
    return data.media || [];
};

/** Elimina (con red de seguridad en el servidor: se purga a los 30 días). */
export const deleteClubMedia = async (id: string, auth: ClubMediaAuth): Promise<void> => {
    await call('DELETE', `/district-clubs/media/${encodeURIComponent(id)}`, auth, null, 20_000);
};

/** Topes vigentes (configurables en el servidor). */
export interface ClubMediaLimits { galleryMax: number; roles: Record<ClubMediaRole, { maxBytes: number; maxLabel: string }> }
let _limits: Promise<ClubMediaLimits | null> | null = null;
export const fetchClubMediaLimits = (): Promise<ClubMediaLimits | null> => {
    if (!_limits) {
        _limits = withTimeout(`${API}/district-clubs/media/limits`, {}, 10_000)
            .then(async (res) => (res.ok ? ((await leerJson<any>(res)).data as ClubMediaLimits) : null))
            .catch(() => null);
    }
    return _limits;
};

/** Para el panel: los archivos de una solicitud. */
export const fetchSubmissionMedia = async (submissionId: string): Promise<Array<ClubMedia & { inSubmission: boolean; attempts?: number; createdAt?: string }>> => {
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('rotary_token') : null;
    const res = await withTimeout(`${API}/district-clubs/admin/submissions/${encodeURIComponent(submissionId)}/media`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
    }, 20_000);
    const { data, crudo, esJson } = await leerJson<any>(res);
    if (!esJson) throw new ClubMediaUploadError(describirNoJson(res, crudo));
    if (!res.ok) throw new ClubMediaUploadError(data?.error || `HTTP ${res.status}`);
    return data.media || [];
};

/** La URL que se pinta: la estable va por la API (mismo origen). */
export const displayUrl = (url?: string | null): string => {
    const v = String(url || '');
    if (v.startsWith('/api/') && API !== '/api') return `${API}${v.slice(4)}`;
    return v;
};
