// ════════════════════════════════════════════════════════════════════
// ¿El usuario autenticado tiene un proyecto postulado en la feria?
// v4.620.0
//
// Un club que postuló y pagó suele tener también un usuario de la plataforma
// con el mismo correo. Este hook le pregunta al servidor si ese correo tiene
// una postulación y, de ser así, guarda el token del panel del club para que
// pueda entrar a formular su proyecto sin escribir la contraseña otra vez.
//
// La identidad la da la sesión de la plataforma: el servidor sólo emite el
// token del panel para el mismo correo que ya venía autenticado.
// ════════════════════════════════════════════════════════════════════
import { useEffect, useState } from 'react';
import { PROJECT_FAIR_PORTAL_PATH, PROJECT_FAIR_PORTAL_TOKEN_KEY } from './ctaLinks';
import { readSessions, emitSessionChange, forgetSession } from './siteSession';

const API = (import.meta as any).env?.VITE_API_URL || '/api';

export interface ProjectFairLink {
    hasProject: boolean;
    path: string;
    submission: { publicRef: string; projectName: string; clubName: string; status: string } | null;
}

const EMPTY: ProjectFairLink = { hasProject: false, path: PROJECT_FAIR_PORTAL_PATH, submission: null };

export const useProjectFairLink = (enabled: boolean): ProjectFairLink => {
    const [link, setLink] = useState<ProjectFairLink>(EMPTY);

    useEffect(() => {
        if (!enabled) { setLink(EMPTY); return; }
        const token = localStorage.getItem('rotary_token');
        if (!token) { setLink(EMPTY); return; }

        let cancelled = false;
        fetch(`${API}/project-fair/portal/link`, { headers: { Authorization: `Bearer ${token}` } })
            .then(r => (r.ok ? r.json() : null))
            .then(data => {
                if (cancelled || !data) return;
                if (data.hasProject && data.portalToken) {
                    localStorage.setItem(PROJECT_FAIR_PORTAL_TOKEN_KEY, data.portalToken);
                    emitSessionChange();
                    setLink({
                        hasProject: true,
                        path: data.path || PROJECT_FAIR_PORTAL_PATH,
                        submission: data.submission || null,
                    });
                } else {
                    // Sin proyecto: se limpia la sesión de panel que hubiera
                    // quedado, PERO sólo si es del mismo correo (v4.693). Una
                    // sesión de OTRO correo es una identidad que alguien abrió
                    // con sus credenciales, y borrarla aquí era cerrarle la
                    // sesión a quien no había hecho nada: que este usuario de la
                    // plataforma no tenga proyecto no dice nada sobre ella.
                    const portal = readSessions().find(s => s.realm === 'portal');
                    const mine = (data.email || '').toLowerCase();
                    if (portal && mine && portal.email.toLowerCase() === mine) forgetSession('portal');
                    setLink(EMPTY);
                }
            })
            .catch(() => { /* el módulo puede no estar activo en este sitio */ });

        return () => { cancelled = true; };
    }, [enabled]);

    return link;
};
