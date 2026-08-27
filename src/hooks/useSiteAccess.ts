// ════════════════════════════════════════════════════════════════════
// Los permisos de la sesión, ya resueltos por el servidor — v4.939.0
//
// ⚠️ EL NAVEGADOR NO RESUELVE PERMISOS, LOS CONSULTA. `/api/rbac/me` devuelve la
// lista EFECTIVA y expandida —y si el menú se recorta o no—; acá sólo se guarda
// y se pregunta. Es la misma regla que el calendario de la distribución (v4.864)
// y el período de la Bóveda (v4.849): con dos resoluciones, el menú y lo que
// responde la ruta podrían discrepar, y eso se lee como que los permisos no
// funcionan.
//
// ⚠️ Y ESTO DECIDE QUÉ SE PINTA, NUNCA A QUÉ SE TIENE ACCESO. Quien escriba la
// dirección de una pantalla que no le toca llega igual y no obtiene ni un dato,
// porque cada petición choca contra `requirePermission` en el servidor.
// Esconder un botón no protege un endpoint de quien lo conoce (v4.868).
// ════════════════════════════════════════════════════════════════════
import { useEffect, useState, useCallback } from 'react';
import {
    hasPermission as rbacHas,
    canAccessModule as rbacModule,
    canOpenPath as rbacPath,
    type Grant,
} from '../lib/rbacSpec';

const API = import.meta.env.VITE_API_URL || '/api';

export interface SiteAccess {
    grant: Grant | null;
    /** `true` mientras no se sabe todavía. Con esto NO se decide nada. */
    loading: boolean;
    /**
     * De dónde salen estos permisos. Es informativo —se pinta en la ficha del
     * usuario—; QUIÉN decide si el menú se acota es `restricted`, que lo
     * resuelve el servidor (`isRestrictedGrant` en `rbacSpec.js`).
     */
    source: string;
    has: (permission: string) => boolean;
    canModule: (moduleKey: string) => boolean;
    canPath: (path: string) => boolean;
    /**
     * ⚠️ `true` sólo cuando el menú debe recortarse por permisos, y lo dice el
     * SERVIDOR. Clasificarlo acá por el `source` fue el defecto de v4.937: un
     * rol que el criterio no conoce —`member`, `crm_agent`, `crowdfunder`—
     * resuelve `none`, esta pantalla lo tomaba por acceso acotado y el panel
     * quedaba con «Mi perfil» y nada más.
     *
     * Ante una respuesta que no lo trae, NO se recorta: un menú de más se ve y
     * se corrige; uno vacío se lee como que el panel está roto, y el acceso de
     * verdad lo sigue decidiendo el servidor en cada petición.
     */
    restricted: boolean;
    refresh: () => void;
}

export const useSiteAccess = (): SiteAccess => {
    const [grant, setGrant] = useState<Grant | null>(null);
    const [loading, setLoading] = useState(true);
    const [nonce, setNonce] = useState(0);

    useEffect(() => {
        let vivo = true;
        const token = localStorage.getItem('rotary_token');
        if (!token) { setLoading(false); return; }

        (async () => {
            try {
                const r = await fetch(`${API}/rbac/me`, { headers: { Authorization: `Bearer ${token}` } });
                if (!r.ok) throw new Error(String(r.status));
                const data = await r.json();
                if (vivo) setGrant(data);
            } catch {
                // DEGRADA: sin respuesta, `grant` queda en null y el menú se
                // pinta con el criterio anterior a este módulo. Un panel vacío
                // por un fallo de red sería mucho peor que uno de más.
                if (vivo) setGrant(null);
            } finally {
                if (vivo) setLoading(false);
            }
        })();
        return () => { vivo = false; };
    }, [nonce]);

    const refresh = useCallback(() => setNonce(n => n + 1), []);
    const source = grant?.source || 'unknown';
    const restricted = grant?.restricted === true;

    return {
        grant,
        loading,
        source,
        restricted,
        refresh,
        has: useCallback((p: string) => (grant ? rbacHas(grant, p) : false), [grant]),
        canModule: useCallback((m: string) => (grant ? rbacModule(grant, m) : false), [grant]),
        canPath: useCallback((p: string) => (grant ? rbacPath(grant, p) : true), [grant]),
    };
};

export default useSiteAccess;
