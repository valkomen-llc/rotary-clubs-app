// ════════════════════════════════════════════════════════════════════
// Subida de diapositivas y de la guía de hoteles — v4.1275.0
//
//   1. pedir al servidor una URL prefirmada (prefijo PRIVADO del evento);
//   2. subir el archivo DIRECTO a S3 (nunca por la función: tope de 4,5 MB);
//   3. pedir al servidor que lo valide por sus bytes, lo optimice y lo publique.
//
// Cada `fetch` lleva tope de tiempo y ninguna respuesta se lee a ciegas
// (`leerJson`): un 502 en HTML no puede romper el panel.
// ════════════════════════════════════════════════════════════════════
import { leerJson } from './leerJson';
import type { HotelDocument } from '../../server/lib/eventHotels.js';

const API = (import.meta as any).env?.VITE_API_URL || '/api';

export interface UploadedSlide {
    imageUrl: string;
    mediumUrl?: string;
    thumbUrl?: string;
    width?: number;
    height?: number;
    fileName?: string;
    originalBytes?: number;
    optimizedBytes?: number;
}

export class HotelUploadError extends Error {
    code?: string;
    hint?: string;
    constructor(message: string, code?: string, hint?: string) {
        super(message);
        this.code = code;
        this.hint = hint;
    }
}

const authHeaders = (): Record<string, string> => {
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('rotary_token') : null;
    return token ? { Authorization: `Bearer ${token}` } : {};
};

const withTimeout = async (url: string, init: RequestInit, ms: number): Promise<Response> => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    try {
        return await fetch(url, { ...init, signal: ctrl.signal });
    } catch (err: any) {
        if (err?.name === 'AbortError') throw new HotelUploadError('La subida tardó demasiado. Revisa tu conexión e inténtalo de nuevo.', 'timeout');
        throw new HotelUploadError('Se cortó la conexión. Revisa tu conexión e inténtalo de nuevo.', 'network');
    } finally {
        clearTimeout(timer);
    }
};

const postJson = async <T>(path: string, body: unknown, ms = 60000): Promise<T> => {
    const res = await withTimeout(`${API}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(body),
    }, ms);
    const { data } = await leerJson<any>(res);
    if (!res.ok) {
        throw new HotelUploadError(data?.error || `Error del servidor (HTTP ${res.status})`, data?.code, data?.hint);
    }
    if (!data) throw new HotelUploadError('Respuesta inválida del servidor.');
    return data as T;
};

const putToStorage = async (uploadUrl: string, file: File, contentType: string, ms: number) => {
    let res: Response;
    try {
        res = await withTimeout(uploadUrl, { method: 'PUT', headers: { 'Content-Type': contentType }, body: file }, ms);
    } catch (err) {
        if (err instanceof HotelUploadError && err.code === 'network') {
            throw new HotelUploadError('Se cortó la conexión con el almacenamiento. Inténtalo de nuevo.', 'storage');
        }
        throw err;
    }
    if (!res.ok) throw new HotelUploadError(`El almacenamiento rechazó el archivo (HTTP ${res.status}).`, 'storage');
};

/** Sube UNA imagen como diapositiva del evento. */
export const uploadHotelSlide = async (eventId: string, file: File): Promise<UploadedSlide> => {
    const id = encodeURIComponent(eventId);
    const pre = await postJson<{ uploadUrl: string; storageKey: string; contentType: string }>(
        `/calendar/events/${id}/hotels/presign`,
        { kind: 'image', fileName: file.name, contentType: file.type, size: file.size },
    );
    await putToStorage(pre.uploadUrl, file, pre.contentType, 180000);
    return postJson<UploadedSlide>(`/calendar/events/${id}/hotels/slides`, { storageKey: pre.storageKey, fileName: file.name }, 115000);
};

/** Sube la guía completa en PDF para descargar. */
export const uploadHotelDocument = async (eventId: string, file: File): Promise<HotelDocument> => {
    const id = encodeURIComponent(eventId);
    const pre = await postJson<{ uploadUrl: string; storageKey: string; contentType: string }>(
        `/calendar/events/${id}/hotels/presign`,
        { kind: 'document', fileName: file.name, contentType: file.type || 'application/pdf', size: file.size },
    );
    await putToStorage(pre.uploadUrl, file, pre.contentType, 600000);
    return postJson<HotelDocument>(`/calendar/events/${id}/hotels/document`, { storageKey: pre.storageKey, fileName: file.name }, 115000);
};

export interface HotelOrphans {
    orphans: Array<{ key: string; size: number; lastModified: string }>;
    totalBytes: number;
}

/** Archivos del módulo que ningún evento referencia (con más de 24 h). */
export const fetchHotelOrphans = async (eventId: string): Promise<HotelOrphans> => {
    const res = await withTimeout(`${API}/calendar/events/${encodeURIComponent(eventId)}/hotels/orphans`, { headers: authHeaders() }, 30000);
    const { data } = await leerJson<any>(res);
    if (!res.ok || !data) throw new HotelUploadError(data?.error || 'No pudimos revisar los archivos sin uso.');
    return data as HotelOrphans;
};

/** Libera esos archivos (el servidor los vuelve a calcular antes de borrar). */
export const deleteHotelOrphans = async (eventId: string): Promise<{ deleted: number; bytes: number }> => {
    const res = await withTimeout(`${API}/calendar/events/${encodeURIComponent(eventId)}/hotels/orphans`, { method: 'DELETE', headers: authHeaders() }, 60000);
    const { data } = await leerJson<any>(res);
    if (!res.ok || !data) throw new HotelUploadError(data?.error || 'No pudimos liberar los archivos sin uso.');
    return data;
};
