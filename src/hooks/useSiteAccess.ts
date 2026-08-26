// ════════════════════════════════════════════════════════════════════
// Los permisos de la sesión, ya resueltos por el servidor — v4.937.0
//
// ⚠️ EL NAVEGADOR NO RESUELVE PERMISOS, LOS CONSULTA. `/api/rbac/me` devuelve la
// lista EFECTIVA y expandida; acá sólo se guarda y se pregunta. Es la misma
// regla que el calendario de la distribución (v4.864) y el período de la Bóveda
// (v4.849): con dos resoluciones, el menú y lo que responde la ruta podrían
// discrepar, y eso se lee como que los permisos no funcionan.
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
     * ⚠️ De dónde salen estos permisos, y gobierna si el menú se acota.
     *
     *   · `membership`         → un rol asignado en este sitio. SE ACOTA.
     *   · `legacy_permissions` → una cuenta institucional de v4.932. SE ACOTA.
     *   · `legacy_role`        → un rol administrativo de siempre. NO se acota:
     *                            su menú tiene que verse exactamente igual que
     *                            antes de este módulo (punto 18 del pedido).
     *   · `platform_operator`  → el operador. NO se acota.
     */
    source: string;
    has: (permission: string) => boolean;
    canModule: (moduleKey: string) => boolean;
    canPath: (path: string) => boolean;
    /** `true` sólo cuando el menú debe recortarse por permisos. */
    restricted: boolean;
    refresh: () => void;
}

/** Las fuentes cuyo menú SÍ se recorta. Cualquier otra conserva el de siempre. */
const RESTRICTED_SOURCES = ['membership', 'legacy_permissions', 'suspended', 'none'];

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
    const restricted = !!grant && RESTRICTED_SOURCES.includes(source);

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
