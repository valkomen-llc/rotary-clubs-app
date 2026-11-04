// ════════════════════════════════════════════════════════════════════
// Estadísticas de descarga de la guía de hoteles — cliente del panel — v4.1279.0
//
// Dos lecturas, sólo con sesión del panel: el resumen (la cifra junto al
// archivo) y las estadísticas completas (el panel con filtros). Cada `fetch`
// lleva tope de tiempo y ninguna respuesta se lee a ciegas (`leerJson`).
// ════════════════════════════════════════════════════════════════════
import { leerJson } from './leerJson';
import type { DownloadDay, DownloadRange, DocumentState } from '../../server/lib/eventDocumentStats.js';

const API = (import.meta as any).env?.VITE_API_URL || '/api';

export interface DocumentVersionDto {
    id: string;
    versionNumber: number;
    url?: string;
    fileName: string;
    sizeBytes?: number | null;
    uploadedAt?: string | null;
    firstSeenAt?: string | null;
    downloads: number;
    lastDownloadAt?: string | null;
    current?: boolean;
}

export interface DocumentSummaryDto {
    state: DocumentState;
    totalDownloads: number;
    uniqueVisitors: number;
    lastDownloadAt: string | null;
    current: DocumentVersionDto | null;
    publicDownload: boolean;
}

export interface DocumentStatsDto {
    state: DocumentState;
    publicDownload: boolean;
    document: { id: string; resourceKey: string; title: string; createdAt: string; currentVersionId: string | null } | null;
    period: DownloadRange;
    totals: {
        all: number;
        uniqueVisitors: number;
        bots: number;
        repeats: number;
        today: number;
        last7: number;
        last30: number;
        lastDownloadAt: string | null;
        currentVersion: number;
        periodDownloads: number;
        periodUniques: number;
    } | null;
    series: DownloadDay[];
    versions: DocumentVersionDto[];
    breakdown: {
        sources: Array<{ key: string; value: number }>;
        devices: Array<{ key: string; value: number }>;
        countries: Array<{ key: string; value: number }>;
        origins: Array<{ key: string; label: string; value: number }>;
    } | null;
    recent: Array<{
        createdAt: string; source: string; device: string; browser: string; os: string;
        country: string; city: string; sourceKind: string; sourceLabel: string; versionId: string; isNewVisitor: boolean;
    }>;
}

const authHeaders = (): Record<string, string> => {
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('rotary_token') : null;
    return token ? { Authorization: `Bearer ${token}` } : {};
};

const getJson = async <T>(path: string, ms = 20000): Promise<T> => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    let res: Response;
    try {
        res = await fetch(`${API}${path}`, { headers: authHeaders(), signal: ctrl.signal });
    } catch (err: any) {
        if (err?.name === 'AbortError') throw new Error('La consulta tardó demasiado. Inténtalo de nuevo.');
        throw new Error('Se cortó la conexión. Revisa tu conexión e inténtalo de nuevo.');
    } finally {
        clearTimeout(timer);
    }
    const { data, esJson } = await leerJson<T & { error?: string }>(res);
    if (!res.ok || !esJson || !data) {
        throw new Error((data as any)?.error || `No pudimos leer las estadísticas (HTTP ${res.status}).`);
    }
    return data;
};

export const fetchDocumentSummary = (eventId: string) =>
    getJson<DocumentSummaryDto>(`/calendar/events/${encodeURIComponent(eventId)}/hotels/document/summary`);

export const fetchDocumentStats = (eventId: string, { period, from, to }: { period: string; from?: string; to?: string }) => {
    const q = new URLSearchParams({ period });
    if (period === 'custom') {
        if (from) q.set('from', from);
        if (to) q.set('to', to);
    }
    return getJson<DocumentStatsDto>(`/calendar/events/${encodeURIComponent(eventId)}/hotels/document/stats?${q.toString()}`);
};
