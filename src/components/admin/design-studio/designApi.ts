// ════════════════════════════════════════════════════════════════════
// Plantillas IA — acceso a la API
// v4.720.0
//
// En un solo sitio para que las pantallas no repitan la cabecera de
// autorización ni el manejo de error. El error del servidor se propaga TEXTUAL,
// igual que en el CRM con los rechazos de Meta: convertirlo en «no se pudo»
// deja a quien corrige sin saber qué.
// ════════════════════════════════════════════════════════════════════

import type { DesignDocument } from '../../../lib/designSpec';

const API = (import.meta as any).env?.VITE_API_URL || '/api';
const BASE = `${API}/design-studio`;

const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('rotary_token')}` });

const request = async <T,>(path: string, init: RequestInit = {}): Promise<T> => {
    const res = await fetch(`${BASE}${path}`, {
        ...init,
        headers: {
            ...(init.body ? { 'Content-Type': 'application/json' } : {}),
            ...authHeaders(),
            ...(init.headers || {}),
        },
    });
    const text = await res.text();
    let data: any = null;
    try { data = text ? JSON.parse(text) : null; } catch { /* respuesta no JSON */ }
    if (!res.ok) throw new Error(data?.details || data?.error || `HTTP ${res.status}`);
    return data as T;
};

// ─── Tipos de la respuesta ─────────────────────────────────────────────

export interface TemplateSummary {
    id: string; name: string; category: string; format: string;
    requires: string[]; summary: string; available?: boolean;
    composition?: Composition;
}
export interface CategoryEntry { id: string; label: string; icon: string; templates: TemplateSummary[] }
export interface ElementItem { id: string; label: string; category: string; defaultFill: string; ratio: number; path?: string; shape?: string }
export interface ElementGroup { id: string; label: string; items: ElementItem[] }
export interface ClubHit { id: string; name: string; city: string | null; country: string | null; district: string; logo: string | null; type: string; category: string }

export interface Branding {
    clubId: string; clubName: string; entityKind: string;
    city: string; country: string; district: string;
    governor: string; president: string; period: string;
    logo: string | null; districtLogo: string | null;
    primary: string; accent: string; ink: string;
    foundationDate: string | null; foundedYear: number | null; years: number | null;
    projects: string[];
}

export interface DesignCopy {
    mensaje: string; titulo?: string; subtitulo?: string; descripcion?: string;
    cta?: string; hashtags?: string[]; altText?: string;
    degraded?: boolean; note?: string; limit?: number;
}

export interface Catalog {
    formats: { id: string; label: string; ratio: string; width: number; height: number; available: boolean; networks: string[] }[];
    availableFormats: string[];
    categories: { id: string; label: string; icon: string }[];
    catalog: CategoryEntry[];
    templates: TemplateSummary[];
    elements: ElementGroup[];
    tones: { id: string; label: string }[];
    palette: Record<string, string>;
    fonts: { id: string; label: string; stack: string }[];
    limits: Record<string, number>;
    variantPlans: { id: string; label: string; summary: string }[];
    maxVariants: number;
}

export interface ComposeResult {
    templateId: string;
    document: DesignDocument;
    variables: Record<string, string>;
    branding: Branding | Record<string, never>;
    copy: DesignCopy;
    missing: string[];
}

export interface SavedDesign {
    id: string; title: string; templateId: string; category: string; format: string;
    document: DesignDocument; variables: Record<string, string>; copy: DesignCopy;
    imageUrl: string | null; thumbUrl: string | null; mediaId: string | null;
    subjectClubId: string | null; status: string; createdAt: string; updatedAt: string;
}

// ─── Llamadas ──────────────────────────────────────────────────────────

export const fetchCatalog = () => request<Catalog>('/catalog');

export const searchClubs = (q: string) => request<ClubHit[]>(`/clubs?q=${encodeURIComponent(q)}`);

export const fetchBranding = (clubId: string) => request<Branding>(`/clubs/${clubId}/branding`);

export const saveFoundation = (clubId: string, value: string) =>
    request<{ year: number; years: number | null; stored: string }>(`/clubs/${clubId}/foundation`, {
        method: 'PUT', body: JSON.stringify({ value }),
    });

export const compose = (body: {
    templateId: string; subjectClubId?: string | null;
    overrides?: Record<string, string | number>; skipAI?: boolean; tone?: string | null;
}) => request<ComposeResult>('/compose', { method: 'POST', body: JSON.stringify(body) });

export const improve = (body: { text: string; tone: string; context?: Record<string, unknown>; maxChars?: number }) =>
    request<{ mensaje: string; tone: string; degraded?: boolean; note?: string }>('/improve', {
        method: 'POST', body: JSON.stringify(body),
    });

export const listDesigns = () => request<SavedDesign[]>('/projects');

export const createDesign = (body: Record<string, unknown>) =>
    request<SavedDesign>('/projects', { method: 'POST', body: JSON.stringify(body) });

export const updateDesign = (id: string, body: Record<string, unknown>) =>
    request<SavedDesign>(`/projects/${id}`, { method: 'PUT', body: JSON.stringify(body) });

export const deleteDesign = (id: string) => request<{ ok: true }>(`/projects/${id}`, { method: 'DELETE' });

// ─── Composición con IA ────────────────────────────────────────────────

export interface Composition {
    enabled: boolean;
    baseImageUrl: string | null;
    masterPrompt: string;
    variants: number;
    publicVariants: number;
    style: string;
}

export interface BackdropVariant {
    planId: string; label: string; summary: string;
    taskId: string | null; error: string | null;
}

export const startBackdrop = (body: {
    composition: Composition; format: string; photoUrl: string | null;
    palette: Record<string, string | undefined>; variants?: number;
}) => request<{ model: string; aspect: string; variants: BackdropVariant[] }>('/backdrop', {
    method: 'POST', body: JSON.stringify(body),
});

export const syncBackdrop = (taskId: string, format: string) =>
    request<{ status: 'pending' | 'ready' | 'failed'; url?: string; width?: number; height?: number; notes?: string[]; error?: string }>(
        `/backdrop/${encodeURIComponent(taskId)}?format=${encodeURIComponent(format)}`);

// ─── Publicaciones ─────────────────────────────────────────────────────

export interface PublicField {
    key: string; type: 'text' | 'textarea' | 'number' | 'image';
    label: string; placeholder: string; help: string;
    maxChars: number | null; required: boolean; ai: boolean;
}

export interface Publication {
    id: string; slug: string; name: string; intro: string;
    category: string; format: string;
    fields: PublicField[]; frozen: Record<string, string>; composition: Composition;
    published: boolean; uses: number; url: string;
    createdAt: string; updatedAt: string;
}

export const listPublications = () => request<Publication[]>('/publications');

/** Qué formulario le saldría al público con este documento, SIN publicar nada.
 *  Es lo que deja ver la consecuencia de los bloqueos antes de compartir. */
export const previewPublication = (document: DesignDocument, settings: Record<string, unknown> = {}) =>
    request<{ variables: string[]; fields: PublicField[]; institutional: string[] }>('/publications/preview', {
        method: 'POST', body: JSON.stringify({ document, settings }),
    });

export const publishDesign = (body: {
    document: DesignDocument; name: string; slug: string;
    category?: string; settings?: Record<string, unknown>; projectId?: string | null;
}) => request<Publication>('/publications', { method: 'POST', body: JSON.stringify(body) });

export const setPublished = (id: string, published: boolean) =>
    request<Publication>(`/publications/${id}`, { method: 'PUT', body: JSON.stringify({ published }) });

export const deletePublication = (id: string) =>
    request<{ ok: true }>(`/publications/${id}`, { method: 'DELETE' });

// ─── Biblioteca Multimedia ─────────────────────────────────────────────
//
// El archivo se sube por el endpoint que YA registra en `Media`. Duplicar la
// lógica de S3 acá daría dos caminos de subida que se separarían en silencio —
// el mismo problema que arrastra `sendCampaign` en el CRM.
export const uploadToLibrary = async (file: File, clubId?: string | null): Promise<{ id: string; url: string }> => {
    const form = new FormData();
    form.append('file', file);
    if (clubId) form.append('clubId', clubId);
    const res = await fetch(`${API}/media/upload`, { method: 'POST', headers: authHeaders(), body: form });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.details || data?.error || 'No se pudo subir el archivo');
    return { id: data.id, url: data.url };
};
