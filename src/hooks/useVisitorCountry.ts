// ════════════════════════════════════════════════════════════════════
// País del visitante (v4.595)
//
// Lo resuelve el backend a partir de los encabezados que agrega la CDN
// (Vercel / Cloudflare): no hay servicios externos, ni cookies, ni se guarda
// la dirección IP. El resultado se cachea en sessionStorage para no repetir
// la consulta en cada navegación.
//
// `country` es null mientras se resuelve o si no se pudo determinar; quien lo
// consuma debe decidir qué hacer en ese caso (ver showProjectFairCta).
// ════════════════════════════════════════════════════════════════════
import { useEffect, useState } from 'react';

const API = (import.meta as any).env?.VITE_API_URL || '/api';
const CACHE_KEY = 'visitor_country';

interface VisitorCountry {
    country: string | null;
    loading: boolean;
}

// Compartido entre instancias del hook: una sola consulta por carga de página.
let inFlight: Promise<string | null> | null = null;

const readCache = (): string | null | undefined => {
    try {
        const raw = sessionStorage.getItem(CACHE_KEY);
        if (raw === null) return undefined;   // nunca consultado
        return raw === '' ? null : raw;       // '' = consultado sin resultado
    } catch {
        return undefined;
    }
};

const fetchCountry = (): Promise<string | null> => {
    if (inFlight) return inFlight;
    inFlight = fetch(`${API}/public/geo`)
        .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
        .then((data: { country?: string | null }) => {
            const country = data?.country ? String(data.country).toUpperCase() : null;
            try { sessionStorage.setItem(CACHE_KEY, country || ''); } catch { /* modo privado */ }
            return country;
        })
        .catch(() => null)
        .finally(() => { inFlight = null; });
    return inFlight;
};

/**
 * @param enabled  Cuando es false no se consulta nada (devuelve país nulo sin
 *                 marcar carga). Sirve para no gastar una petición en sitios o
 *                 idiomas donde el país es irrelevante.
 */
export const useVisitorCountry = (enabled = true): VisitorCountry => {
    const cached = readCache();
    const [state, setState] = useState<VisitorCountry>(
        cached === undefined ? { country: null, loading: true } : { country: cached, loading: false }
    );

    useEffect(() => {
        if (!enabled || !state.loading) return;
        let alive = true;
        fetchCountry().then(country => { if (alive) setState({ country, loading: false }); });
        return () => { alive = false; };
        // El país no cambia durante la sesión: sólo reacciona a `enabled`.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [enabled]);

    return enabled ? state : { country: null, loading: false };
};
