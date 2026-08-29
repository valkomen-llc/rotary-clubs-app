// Canal de Capacitaciones — el espejo MÍNIMO del navegador (v4.954).
//
// Acá vive sólo lo que las pantallas necesitan para PINTAR y PEDIR: rótulos,
// formato de duración, el identificador anónimo y las cabeceras con las que
// viaja el espectador. El CRITERIO —veredicto de acceso, herencia de la vista
// previa, completitud— vive entero en el servidor
// (`server/lib/trainingChannelSpec.js`): con dos resoluciones, el candado
// diría una cosa y el servidor entregaría otra (regla del calendario de la
// distribución, v4.864).

import { readSessions, TOKEN_KEY } from './siteSession';

export const ACCESS_MODE_LABELS: Record<string, string> = {
    publico: 'Público',
    preview: 'Vista previa pública',
    autenticados: 'Solo autenticados',
    roles: 'Solo roles específicos',
    privado: 'Privado',
};

export const VIDEO_STATE_LABELS: Record<string, string> = {
    borrador: 'Borrador',
    publicado: 'Publicado',
    oculto: 'Oculto',
    archivado: 'Archivado',
};

export const VIEWER_ROLE_LABELS: Record<string, string> = {
    registrado: 'Usuario registrado',
    asistente_evento: 'Participante de evento',
    postulante: 'Club postulante',
    admin_sitio: 'Administrador del sitio',
};

export const PREVIEW_CHOICES = [30, 60, 90, 120];

/** m:ss / h:mm:ss, como lo rotula cualquier reproductor. */
export const fmtDuration = (sec?: number | null): string => {
    const s = Math.max(0, Math.round(Number(sec) || 0));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
    const mm = String(m).padStart(h ? 2 : 1, '0'), rr = String(r).padStart(2, '0');
    return h ? `${h}:${mm}:${rr}` : `${mm}:${rr}`;
};

const ANON_KEY = 'cap_anon_id';

/**
 * El identificador anónimo del navegador: un UUID en localStorage, sin
 * fingerprinting. Es lo que hace que la vista previa no se reinicie con un
 * refresh y que una vista no se cuente dos veces. Envuelto en try: en modo
 * privado no se puede escribir y eso no puede tumbar la página (v4.826).
 */
export const anonId = (): string | null => {
    try {
        let id = localStorage.getItem(ANON_KEY);
        if (!id) {
            id = (crypto?.randomUUID?.() || '');
            if (!id) return null;
            localStorage.setItem(ANON_KEY, id);
        }
        return id;
    } catch {
        return null;
    }
};

/**
 * Las cabeceras con las que viaja el espectador: sus tokens de sesión (los
 * tres reinos que ya guarda `siteSession.ts`) y su identificador anónimo.
 * El SERVIDOR verifica cada token con su firma; acá sólo se acompañan.
 */
export const viewerHeaders = (): Record<string, string> => {
    const out: Record<string, string> = {};
    try {
        // `readSessions` ya filtra lo vencido y lo ajeno; el token en sí vive
        // en su llave de siempre. El servidor verifica la FIRMA de cada uno.
        const tokens = readSessions()
            .map(s => { try { return localStorage.getItem(TOKEN_KEY[s.realm]); } catch { return null; } })
            .filter((t): t is string => Boolean(t));
        if (tokens.length) out['x-viewer-tokens'] = tokens.join(',');
    } catch { /* sin sesión legible: anónimo */ }
    const anon = anonId();
    if (anon) out['x-anon-id'] = anon;
    return out;
};

const API = () => (import.meta.env.VITE_API_URL || '/api');

/** GET del canal con el espectador a bordo. */
export const fetchTraining = async (path: string, params: Record<string, string>) => {
    const qs = new URLSearchParams(params).toString();
    const res = await fetch(`${API()}/trainings/${path}?${qs}`, { headers: viewerHeaders() });
    const text = await res.text();
    let data: any = null;
    try { data = text ? JSON.parse(text) : null; } catch { /* HTML de error */ }
    if (!res.ok) throw new Error(data?.error || `Error ${res.status}`);
    return data;
};

/** POST del canal con el espectador a bordo. */
export const postTraining = async (path: string, body: Record<string, unknown>) => {
    const res = await fetch(`${API()}/trainings/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...viewerHeaders() },
        body: JSON.stringify(body),
    });
    const text = await res.text();
    let data: any = null;
    try { data = text ? JSON.parse(text) : null; } catch { /* HTML de error */ }
    if (!res.ok) {
        const err: any = new Error(data?.error || `Error ${res.status}`);
        err.status = res.status;
        err.data = data;
        throw err;
    }
    return data;
};

export interface TrainingCard {
    slug: string;
    title: string;
    description: string;
    thumbUrl: string | null;
    durationSec: number | null;
    category: string | null;
    tags: string[];
    instructor: string | null;
    publishedAt: string | null;
    accessMode: string;
    previewSec: number | null;
    views: number | null;
    resumeAt?: number;
    pctWatched?: number;
}
