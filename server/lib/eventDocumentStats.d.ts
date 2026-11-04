// Tipos de `eventDocumentStats.js` para el panel y el sitio público, que
// importan el MISMO archivo que usa el servidor (una sola fuente de verdad).

export interface DownloadRange {
    fromDay: string | null;
    toDay: string;
    days: number;
    label: string;
    timeZone: string;
    period: string;
    custom: boolean;
}

export interface DownloadDay {
    day: string;
    downloads: number;
    uniques: number;
    bots: number;
    repeats: number;
}

export type DocumentState = 'none' | 'current' | 'archived';

export const RESOURCES: Record<string, { key: string; label: string }>;
export const DEFAULT_RESOURCE_KEY: string;
export const DOWNLOAD_SOURCES: Record<string, string>;
export const REPEAT_WINDOW_SEC: number;
export const THROTTLE: { windowMs: number; max: number };
export const DOWNLOAD_ERRORS: Record<string, string>;
export const MAX_RANGE_DAYS: number;
export const PERIOD_OPTIONS: Record<string, string>;

export function normalizeDownloadSource(raw: unknown): string;
export function hotelsGuideDownloadPath(eventId: string, source?: string): string;
export function customRange(from: unknown, to: unknown, now?: Date, timeZone?: string): DownloadRange | null;
export function resolveRange(input?: { period?: string; from?: unknown; to?: unknown }, now?: Date, timeZone?: string): DownloadRange;
export function fillDownloadDays(rows: Array<Partial<DownloadDay>>, range?: { fromDay?: string | null; toDay?: string | null }): DownloadDay[];
export function documentState(input?: { hasRow?: boolean; currentDocument?: { url?: string } | null }): DocumentState;
export function downloadsLabel(n: number | null | undefined): string;
export function createRequestThrottle(opts?: { windowMs?: number; max?: number; maxKeys?: number }): (key: string, nowMs?: number) => boolean;
