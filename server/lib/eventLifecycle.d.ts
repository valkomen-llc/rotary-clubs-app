// Tipos de `eventLifecycle.js` para el panel y el sitio público, que importan
// el MISMO archivo que usa el servidor (una sola fuente de verdad).

export type EditorialStatus = 'draft' | 'published' | 'cancelled';
export type TemporalStatus = 'upcoming' | 'ongoing' | 'finished' | 'tbd';

export interface EventLifecycle {
    editorial: EditorialStatus;
    temporal: TemporalStatus;
    timezone: string;
    allDay: boolean;
    dateTbd: boolean;
    startsAt: string | null;
    endsAt: string | null;
}

export interface LifecycleEventLike {
    startDate?: string | Date | null;
    endDate?: string | Date | null;
    createdAt?: string | Date | null;
    metadata?: Record<string, any> | string | null;
    lifecycle?: EventLifecycle;
}

export interface EffectiveWindow { tz: string; startsAt: number | null; endsAt: number | null }
export interface WallClock { year: number; month: number; day: number; hour: number; minute: number; second: number }

export const EDITORIAL_STATUSES: EditorialStatus[];
export const TEMPORAL_STATUSES: TemporalStatus[];
export const PLATFORM_TIMEZONE: string;
export const LIFECYCLE_METADATA_KEYS: string[];
export const TIMEZONE_OPTIONS: { value: string; label: string }[];

export function isValidTimezone(tz: unknown): boolean;
export function siteTimezone(input?: { setting?: string | null; country?: string | null; envDefault?: string | null }): string;
export function eventTimezone(event: LifecycleEventLike | null | undefined, fallback?: string): string;
export function editorialStatusOf(event: LifecycleEventLike | null | undefined): EditorialStatus;
export function wallClock(ms: number, tz: string): WallClock;
export function zonedTimeToUtc(parts: { year: number; month: number; day: number; hour?: number; minute?: number }, tz: string): number;
export function startOfLocalDay(ms: number, tz: string): number;
export function endOfLocalDay(ms: number, tz: string): number;
export function effectiveWindow(event: LifecycleEventLike | null | undefined, fallbackTz?: string): EffectiveWindow;
export function temporalStatusAt(window: { startsAt: number | null; endsAt: number | null } | null | undefined, nowMs: number): TemporalStatus;
export function describeLifecycle(event: LifecycleEventLike | null | undefined, options?: { nowMs?: number; fallbackTz?: string }): EventLifecycle;
export function temporalOf(lifecycle: EventLifecycle | null | undefined, nowMs: number): TemporalStatus;
export function isPubliclyVisible(event: LifecycleEventLike | null | undefined): boolean;
export function partitionPublicEvents<T extends LifecycleEventLike>(events: T[] | null | undefined, nowMs?: number): { upcoming: T[]; tbd: T[]; past: T[] };
export function toZonedInputValue(value: string | null | undefined, tz: string, dateOnly?: boolean): string;
export function zonedInputToIso(value: string | null | undefined, tz: string): string;
export function formatInZone(value: string | Date | null | undefined, tz: string, locale?: string, options?: Intl.DateTimeFormatOptions): string;
