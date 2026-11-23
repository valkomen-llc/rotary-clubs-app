// El cliente de `/api/platform-site` (v4.1348). Ninguna respuesta se lee con
// `.json()` a ciegas, y toda petición tiene tope de tiempo.
import type { Site } from '../../../lib/platformSiteSpec';

const API_URL = import.meta.env.VITE_API_URL || '/api';
const token = () => localStorage.getItem('rotary_token');

export class ApiError extends Error {
    status: number; code?: string; errors: any[];
    constructor(message: string, status: number, code?: string, errors: any[] = []) { super(message); this.status = status; this.code = code; this.errors = errors; }
}

export async function api<T = any>(path: string, init: RequestInit = {}, timeoutMs = 30000): Promise<T> {
    const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    let res: Response;
    try {
        res = await fetch(`${API_URL}/platform-site${path}`, { ...init, signal: ctrl.signal, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}`, ...(init.headers || {}) } });
    } catch (e: any) {
        throw new ApiError(e?.name === 'AbortError' ? 'El servidor tardó demasiado en responder.' : 'No hay conexión con el servidor.', 0);
    } finally { clearTimeout(timer); }
    const texto = await res.text();
    let json: any = {};
    try { json = texto ? JSON.parse(texto) : {}; } catch { throw new ApiError(`El servidor respondió ${res.status} con algo que no es JSON.`, res.status); }
    if (!res.ok) {
        if (res.status === 401) throw new ApiError('Tu sesión venció. Vuelve a entrar y prueba otra vez.', 401);
        throw new ApiError(json?.error || `El servidor respondió ${res.status}.`, res.status, json?.code, Array.isArray(json?.errors) ? json.errors : []);
    }
    return json as T;
}

export interface Checklist { ok: boolean; blocking: string[]; warnings: string[] }
export interface Payload {
    exists: boolean; created?: boolean; role: string; roleLabel: string; abilities: string[]; siteType: string; siteTypeLabel: string; adminHost: string;
    name: string; draft: Site; hasPublished: boolean; draftVersion: number; publishedVersion: number | null; unpublishedChanges: boolean;
    status: 'draft' | 'published_private' | 'live';
    review: { required: boolean; status: string; note: string | null; reviewedVersion: number | null; reviewedByName: string | null; reviewedAt: string | null; current: boolean };
    publish: { allowed: boolean; reason: string; checklist: Checklist };
    domain: { publicHost: string; publicLive: boolean; liveAt: string | null; liveByName: string | null };
    seo: { title: boolean; description: boolean; image: boolean };
    createdByName: string | null; createdAt: string; updatedByName: string | null; updatedAt: string; publishedByName: string | null; publishedAt: string | null;
    notes: Record<string, { ready: boolean; notes: string[] }>;
}

export const fecha = (v?: string | null) => (v ? new Date(v).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' }) : '—');
export const setPath = (o: any, path: string, v: any) => { const n = structuredClone(o); const ks = path.split('.'); let c = n; for (let i = 0; i < ks.length - 1; i++) { c[ks[i]] = c[ks[i]] ?? {}; c = c[ks[i]]; } c[ks[ks.length - 1]] = v; return n; };
