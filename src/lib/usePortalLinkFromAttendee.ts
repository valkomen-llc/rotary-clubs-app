// ════════════════════════════════════════════════════════════════════
// ¿La asistente al evento postuló además el proyecto de su club?
// v4.1337.0
//
// El simétrico que faltaba de `useAttendeeLink`. Una rotaria que postuló su
// proyecto y se inscribió al evento con el MISMO correo tiene dos cuentas; si
// sus contraseñas difieren, el ingreso sólo abre la de asistente y hasta
// v4.1336 el panel del proyecto quedaba invisible para ella.
//
// Le pregunta al servidor por el correo de la sesión de asistente. Con el
// correo DEMOSTRADO el servidor devuelve el token del panel y se guarda; sin
// demostrar, sólo avisa que hace falta confirmarlo (`/mi-proyecto` ofrece
// mandar el enlace). La identidad la da el token, verificado en el servidor.
// ════════════════════════════════════════════════════════════════════
import { useEffect, useState } from 'react';
import { PROJECT_FAIR_PORTAL_TOKEN_KEY } from './ctaLinks';
import { TOKEN_KEY, emitSessionChange } from './siteSession';

const API = (import.meta as any).env?.VITE_API_URL || '/api';

export interface AttendeePortalLink {
    /** Hay un proyecto con ese correo, pero falta demostrar el correo. */
    needsProof: boolean;
    emailHint: string | null;
}

const EMPTY: AttendeePortalLink = { needsProof: false, emailHint: null };

/** Una consulta al servidor. Devuelve lo mismo que `/portal/link-attendee`. */
export const fetchPortalLinkFromAttendee = async (): Promise<any | null> => {
    const token = localStorage.getItem(TOKEN_KEY.attendee);
    if (!token) return null;
    const res = await fetch(`${API}/project-fair/portal/link-attendee`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
    });
    return res.ok ? res.json().catch(() => null) : null;
};

/** Guarda el token del panel que entregó el servidor y avisa al encabezado. */
export const storePortalToken = (portalToken: string) => {
    localStorage.setItem(PROJECT_FAIR_PORTAL_TOKEN_KEY, portalToken);
    emitSessionChange();
};

/**
 * Se consulta UNA vez por carga y sólo si hace falta: hay sesión de asistente
 * y todavía no la del proyecto.
 */
export const usePortalLinkFromAttendee = (enabled: boolean): AttendeePortalLink => {
    const [link, setLink] = useState<AttendeePortalLink>(EMPTY);

    useEffect(() => {
        if (!enabled) { setLink(EMPTY); return; }
        if (localStorage.getItem(PROJECT_FAIR_PORTAL_TOKEN_KEY)) return;
        let cancelled = false;
        fetchPortalLinkFromAttendee()
            .then(data => {
                if (cancelled || !data?.hasProject) return;
                if (data.portalToken) { storePortalToken(data.portalToken); setLink(EMPTY); return; }
                if (data.needsProof) setLink({ needsProof: true, emailHint: data.emailHint || null });
            })
            .catch(() => { /* el módulo puede no estar activo en este sitio */ });
        return () => { cancelled = true; };
    }, [enabled]);

    return link;
};
