// ════════════════════════════════════════════════════════════════════
// ¿La sesión abierta tiene además una inscripción a un evento?
// v4.712.0
//
// Simétrico de `useProjectFairLink`, y por el mismo motivo: un rotario que
// paga la postulación de su proyecto y además su asistencia al evento tiene
// las dos cosas con el MISMO correo. Desde v4.711 un ingreso abre las dos
// identidades — pero sólo AL INGRESAR: quien ya tenía la sesión del proyecto
// abierta de antes seguía sin ver su panel del evento, y tenía que cerrar
// sesión y volver a entrar para descubrirlo. Eso no es algo que se le pueda
// pedir a nadie, ni algo que nadie adivine.
//
// Le pregunta al servidor por el correo de la sesión que ya tiene y, si ese
// correo tiene una inscripción enviada, guarda el token del panel del evento.
// La identidad la da el token, verificado en el servidor: nunca se emite la
// sesión de otro correo.
// ════════════════════════════════════════════════════════════════════
import { useEffect } from 'react';
import { ATTENDEE_TOKEN_KEY } from '../pages/MiInscripcion';
import { readSessions, emitSessionChange, forgetSession, TOKEN_KEY } from './siteSession';

const API = (import.meta as any).env?.VITE_API_URL || '/api';

/** Token de cualquier identidad, en el orden en que conviene preguntar. */
const anyIdentityToken = (): string => {
    for (const realm of ['portal', 'platform'] as const) {
        const value = localStorage.getItem(TOKEN_KEY[realm]);
        if (value) return value;
    }
    return '';
};

/**
 * Descubre la sesión del Asistente al Evento a partir de otra ya abierta.
 * No devuelve nada: su efecto es dejar el token guardado y avisar, que es lo
 * que hace aparecer «Mi Inscripción al Evento» en el menú del encabezado.
 *
 * Se consulta UNA vez por carga y sólo si hace falta —hay otra sesión y no hay
 * todavía la del asistente—, para no añadir una petición a cada visita.
 */
export const useAttendeeLink = (enabled: boolean): void => {
    useEffect(() => {
        if (!enabled) return;
        if (localStorage.getItem(ATTENDEE_TOKEN_KEY)) return;
        const token = anyIdentityToken();
        if (!token) return;

        let cancelled = false;
        fetch(`${API}/event-registrations/portal/link`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        })
            .then(r => (r.ok ? r.json() : null))
            .then(data => {
                if (cancelled || !data) return;
                if (data.hasRegistration && data.token) {
                    localStorage.setItem(ATTENDEE_TOKEN_KEY, data.token);
                    emitSessionChange();
                    return;
                }
                // Sin inscripción: se retira la sesión de asistente que hubiera
                // quedado, PERO sólo si es del mismo correo. Una de OTRO correo
                // la abrió alguien con sus credenciales en este navegador, y
                // que esta persona no tenga inscripción no dice nada sobre
                // ella. Misma regla que `/project-fair/portal/link` en v4.693.
                const mine = String(data.email || '').toLowerCase();
                const open = readSessions().find(s => s.realm === 'attendee');
                if (open && mine && open.email.toLowerCase() === mine) forgetSession('attendee');
            })
            .catch(() => { /* el módulo puede no estar activo en este sitio */ });

        return () => { cancelled = true; };
    }, [enabled]);
};
