// El cliente de `/api/link-redirects`, compartido por el panel y los módulos
// de QR (v4.1278). Vivía dentro de `LinkRedirectsPanel.tsx`.
//
// Ninguna respuesta se lee con `.json()` a ciegas: una página de error HTML
// rompe el parseo y el error resultante no nombra ninguna capa (v4.946).

// Igual que el resto del panel: la base de la API se lee del entorno de Vite.
const API_URL = import.meta.env.VITE_API_URL || '/api';

const token = () => localStorage.getItem('rotary_token');

async function leerJson(res: Response) {
    const texto = await res.text();
    try { return texto ? JSON.parse(texto) : {}; }
    catch {
        throw new Error(
            `El servidor respondió ${res.status} con algo que no es JSON (${res.headers.get('content-type') || 'sin tipo'}).`
        );
    }
}

export async function api(path: string, init: RequestInit = {}) {
    const res = await fetch(`${API_URL}/link-redirects${path}`, {
        ...init,
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token()}`,
            ...(init.headers || {}),
        },
    });
    const json = await leerJson(res);
    if (!res.ok) {
        // Un fallo se dice con su CAUSA: 401 se corrige volviendo a entrar y
        // 403 pidiendo el permiso. «No se pudo guardar» a secas obliga a
        // diagnosticar a ciegas (v4.859).
        if (res.status === 401) throw new Error('Tu sesión venció. Volvé a entrar y probá otra vez.');
        if (res.status === 403) throw new Error('Tu rol no puede administrar los enlaces de este sitio.');
        throw new Error(json?.error || `El servidor respondió ${res.status}.`);
    }
    return json;
}

export interface Redirect {
    id: string;
    slug: string;
    target: string;
    name: string;
    permanent: boolean;
    forwardQuery: boolean;
    status: 'active' | 'paused';
    notes: string;
    totalClicks: number;
    uniqueVisitors: number;
    botHits: number;
    qrScans: number;
    qrCount: number;
    lastClickAt: string | null;
    createdByName: string;
    createdAt: string;
    updatedByName: string;
    updatedAt: string;
}

export interface QrDesignDto {
    fg: string; bg: string; size: number; margin: number; ecLevel: 'L' | 'M' | 'Q' | 'H'; logoUrl: string; caption: string;
}

export interface QrDto {
    id: string;
    linkId: string;
    code: string;
    name: string;
    campaign: string;
    medium: string;
    label: string;
    design: QrDesignDto;
    status: 'active' | 'paused' | 'disabled';
    validityPreset: 'd30' | 'd90' | 'none' | 'custom';
    expiresAt: string | null;
    state: 'active' | 'expired' | 'paused' | 'disabled' | 'deleted';
    totalScans: number;
    uniqueVisitors: number;
    botHits: number;
    blockedScans: number;
    lastScanAt: string | null;
    createdByName: string;
    createdAt: string;
    updatedAt: string;
    periodScans?: number;
    periodUniques?: number;
    periodBlocked?: number;
    warnings?: string[];
}
