// El cliente de `/api/programas` (v4.1280). Ninguna respuesta se lee con
// `.json()` a ciegas; un fallo se dice con su causa (401 sesión, 403 permiso).
const API_URL = import.meta.env.VITE_API_URL || '/api';
const token = () => localStorage.getItem('rotary_token');

async function leer(res: Response) {
    const texto = await res.text();
    try { return texto ? JSON.parse(texto) : {}; }
    catch { throw new Error(`El servidor respondió ${res.status} con algo que no es JSON (${res.headers.get('content-type') || 'sin tipo'}).`); }
}

export class ApiError extends Error {
    status: number; errors: { field: string; message: string; step?: number }[]; code?: string;
    constructor(message: string, status: number, errors: any[] = [], code?: string) { super(message); this.status = status; this.errors = errors; this.code = code; }
}

export async function api<T = any>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`${API_URL}/programas${path}`, {
        ...init,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}`, ...(init.headers || {}) },
    });
    const json = await leer(res);
    if (!res.ok) {
        if (res.status === 401) throw new ApiError('Tu sesión venció. Vuelve a entrar y prueba otra vez.', 401);
        if (res.status === 403) throw new ApiError(json?.error || 'Tu rol no puede hacer esto en este programa.', 403);
        throw new ApiError(json?.error || `El servidor respondió ${res.status}.`, res.status, Array.isArray(json?.errors) ? json.errors : [], json?.code);
    }
    return json as T;
}

export const qs = (obj: Record<string, any>) => new URLSearchParams(Object.entries(obj).filter(([, v]) => v !== '' && v !== undefined && v !== null).map(([k, v]) => [k, String(v)])).toString();

export interface Grant { abilities: string[]; all: boolean; submitScopes: string[]; clubActivationIds: string[]; districtNumbers: number[]; medicalScope: boolean }
export const can = (g: Grant | null | undefined, a: string) => Boolean(g?.abilities?.includes(a));

/** Sube un archivo PRIVADO (autorización, respaldo o recurso): prefirma → PUT a S3 → registro. */
export async function uploadPrivateFile(programId: string, file: File, kind: string, extra: { label?: string; relatedType?: string; relatedId?: string } = {}) {
    const pre = await api<{ storageKey: string; uploadUrl: string; contentType: string }>(`/admin/${programId}/files/presign`, { method: 'POST', body: JSON.stringify({ filename: file.name, size: file.size, kind }) });
    const put = await fetch(pre.uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': pre.contentType, 'Cache-Control': 'no-store' } });
    if (!put.ok) throw new Error(`No se pudo subir el archivo a S3 (${put.status}).`);
    const reg = await api<{ file: { id: string; kind: string; filename: string; bytes: number; label?: string } }>(`/admin/${programId}/files/register`, { method: 'POST', body: JSON.stringify({ storageKey: pre.storageKey, filename: file.name, size: file.size, kind, ...extra }) });
    return reg.file;
}
