// Tipos de `eventHotels.js` para el panel y el sitio público, que importan
// el MISMO archivo que usa el servidor (una sola fuente de verdad).

export interface HotelSlide {
    id: string;
    imageUrl: string;
    mediumUrl?: string;
    thumbUrl?: string;
    width?: number;
    height?: number;
    altText: string;
    enabled: boolean;
    fileName?: string;
}

export interface HotelDocument {
    url: string;
    fileName: string;
    sizeBytes?: number;
    uploadedAt?: string;
}

export interface HotelsHistoryEntry {
    at: string;
    by?: { id?: string; name?: string };
    changes: string[];
}

export interface HotelsConfig {
    enabled: boolean;
    title: string;
    description: string;
    slides: HotelSlide[];
    showThumbnails: boolean;
    allowDownload: boolean;
    document: HotelDocument | null;
    ratesUpdatedOn: string;
    updatedAt?: string;
    updatedBy?: { id?: string; name?: string };
    history?: HotelsHistoryEntry[];
}

export interface PublicHotelsView {
    title: string;
    description: string;
    slides: HotelSlide[];
    showThumbnails: boolean;
    download: HotelDocument | null;
    ratesUpdatedOn: string;
}

export type ImageFormat = 'jpeg' | 'png' | 'webp';

export const DEFAULT_HOTELS_TITLE: string;
export const HOTEL_LIMITS: {
    maxSlides: number;
    maxImageMb: number;
    maxDocumentMb: number;
    minLongSide: number;
    minShortSide: number;
    maxInputPixels: number;
    fullSize: number;
    mediumSize: number;
    thumbSize: number;
    titleMax: number;
    descriptionMax: number;
    altMax: number;
    historyMax: number;
};
export const IMAGE_FORMATS: Record<ImageFormat, { mime: string; label: string }>;
export const UPLOAD_ERROR_MESSAGES: Record<string, string>;

export function suggestedHotelsDescription(eventTitle?: string | null): string;
export function declaredImageFormat(fileName?: string | null, mime?: string | null): ImageFormat | null;
export function isPdfName(fileName?: string | null, mime?: string | null): boolean;
export function sniffImageFormat(bytes: Uint8Array | null | undefined): ImageFormat | null;
export function inspectPdfBytes(bytes: Uint8Array | null | undefined): { ok: boolean; reason?: string };
export function checkSlideDimensions(width: number, height: number, limits?: typeof HOTEL_LIMITS): { ok: boolean; reason?: string };
export function sanitizeHotelUrl(raw: unknown): string;
export function newHotelSlideId(): string;
export function normalizeHotelsConfig(raw: unknown): HotelsConfig | null;
export function draftHotelsConfig(raw: unknown, eventTitle?: string | null): HotelsConfig;
export function visibleHotelSlides(cfg: unknown): HotelSlide[];
export function publicHotelsView(raw: unknown): PublicHotelsView | null;
export function extractPublicHotels(metadata: unknown): PublicHotelsView | null;
export function stripPrivateHotelsFields<T>(metadata: T): T;
export function diffHotelsConfig(before: unknown, after: unknown): string[];
export function stampHotelsUpdate(previousRaw: unknown, incomingRaw: unknown, user: unknown, now?: Date): HotelsConfig | undefined;
export function hotelsPublicPrefix(eventId: string): string;
export function hotelsIncomingPrefix(eventId: string): string;
export function incomingKeyBelongs(storageKey: string, eventId: string): boolean;
export function referencedHotelUrls(raw: unknown): string[];
export function orphanHotelObjects(
    objects: Array<{ key: string; lastModified?: string; size?: number }>,
    eventId: string,
    referencedText: string,
    opts?: { nowMs?: number; graceMs?: number },
): Array<{ key: string; lastModified?: string; size?: number }>;
export function formatBytes(n: number | null | undefined): string;
export function formatRatesDate(isoDate: string | null | undefined, locale?: string): string;

declare const _default: Record<string, unknown>;
export default _default;
