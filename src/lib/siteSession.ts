// ════════════════════════════════════════════════════════════════════
// Sesión visible en el encabezado — las tres identidades del sitio
// v4.693.0
//
// El sitio tiene tres identidades (ver "Acceso e identidades" en CLAUDE.md) y
// cada una guarda su token en su propia llave. Hasta v4.692 el encabezado sólo
// conocía la de la plataforma, así que un Gestor de Proyectos o un Asistente al
// Evento veía el ícono de "Ingresar" en cuanto salía de su panel: su sesión
// seguía abierta —el token nunca se borró— pero nada en pantalla lo decía, y la
// impresión era que el sitio lo había echado.
//
// Este módulo es lo que el encabezado consulta para saber quién está dentro.
// Lee los tokens que YA existen; no abre ni renueva sesiones.
//
// Se resuelve en el navegador, leyendo el propio token, y no preguntándole al
// servidor: el encabezado se dibuja en todas las páginas y una consulta por
// visita reabriría el problema de rendimiento que se corrigió en v4.659. El
// token va firmado y el servidor lo verifica en cada petición, así que leerlo
// aquí sólo decide QUÉ SE PINTA, nunca a qué se tiene acceso.
// ════════════════════════════════════════════════════════════════════
import { useEffect, useState } from 'react';
import { onLoginSuccess } from './loginModal';

export type Realm = 'platform' | 'portal' | 'attendee';

export const REALMS: Realm[] = ['platform', 'portal', 'attendee'];

/** Llave de cada identidad en el navegador. */
export const TOKEN_KEY: Record<Realm, string> = {
    platform: 'rotary_token',
    portal: 'feria_portal_token',
    attendee: 'evento_asistente_token',
};

/** Audiencia con la que se firmó cada token. */
const AUDIENCE: Record<Realm, string> = {
    platform: 'rotary-platform',
    portal: 'project-fair-portal',
    attendee: 'event-attendee-portal',
};

/** Rótulo del rol y su destino. Es la misma tabla de CLAUDE.md. */
export const REALM_META: Record<Realm, { role: string; menu: string; path: string }> = {
    platform: { role: 'Administrador del sitio', menu: 'Panel de Control', path: '/admin/dashboard' },
    portal: { role: 'Gestor de Proyectos', menu: 'Mi Proyecto', path: '/mi-proyecto' },
    // «Mi Inscripción» a secas se confundía con la inscripción del PROYECTO,
    // que en su panel también se llama así. En un menú que puede ofrecer los
    // dos a la vez, el rótulo tiene que decir de cuál se trata.
    attendee: { role: 'Asistente al Evento', menu: 'Mi Inscripción al Evento', path: '/mi-inscripcion' },
};

/** Nombre y organización que se muestran en el menú del avatar. */
export interface SessionProfile {
    name?: string | null;
    org?: string | null;
    email?: string | null;
}

export interface SiteSession extends SessionProfile {
    realm: Realm;
    email: string;
    /** Rótulo del rol, para que quien entra sepa con qué identidad está. */
    role: string;
    path: string;
    menu: string;
}

const PROFILE_KEY = (realm: Realm) => `site_session_${realm}`;

// ── Lectura del token ────────────────────────────────────────────────

/**
 * Devuelve el contenido del token, o null si no se puede leer. No verifica la
 * firma —eso es del servidor— pero sí mira el vencimiento y la audiencia, que
 * es lo que evita pintar un avatar de una sesión que ya no sirve.
 */
const decodePayload = (token: string): Record<string, any> | null => {
    try {
        const part = token.split('.')[1];
        if (!part) return null;
        const base64 = part.replace(/-/g, '+').replace(/_/g, '/');
        const json = decodeURIComponent(
            atob(base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '='))
                .split('')
                .map(c => `%${`00${c.charCodeAt(0).toString(16)}`.slice(-2)}`)
                .join('')
        );
        const payload = JSON.parse(json);
        return payload && typeof payload === 'object' ? payload : null;
    } catch {
        return null;
    }
};

const readProfile = (realm: Realm): SessionProfile => {
    try {
        const raw = localStorage.getItem(PROFILE_KEY(realm));
        const parsed = raw ? JSON.parse(raw) : null;
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
};

/** El usuario de la plataforma ya se guardaba entero; se reutiliza. */
const platformProfile = (): SessionProfile => {
    try {
        const raw = localStorage.getItem('rotary_user');
        const user = raw ? JSON.parse(raw) : null;
        if (!user || typeof user !== 'object') return {};
        return { name: user.name || null, email: user.email || null, org: user.club?.name || null };
    } catch {
        return {};
    }
};

/**
 * Las sesiones abiertas ahora mismo, en orden de precedencia: plataforma,
 * panel del club, panel del asistente. Una sesión vencida se retira del
 * navegador aquí mismo: dejarla sólo serviría para que el próximo intento
 * fallara con un 401.
 */
export const readSessions = (): SiteSession[] => {
    const out: SiteSession[] = [];
    for (const realm of REALMS) {
        let token: string | null = null;
        try { token = localStorage.getItem(TOKEN_KEY[realm]); } catch { token = null; }
        if (!token) continue;

        const payload = decodePayload(token);
        // Ilegible: no se toca. Puede ser de otra cosa y borrarlo sería
        // cerrarle la sesión a alguien por no saber leer su token.
        if (!payload) continue;

        if (typeof payload.exp === 'number' && payload.exp * 1000 <= Date.now()) {
            forgetSession(realm);
            continue;
        }
        // Los tokens sin `aud` (anteriores a v4.627) se siguen aceptando, igual
        // que en el servidor. Uno con audiencia ajena no es de esta llave.
        if (payload.aud && payload.aud !== AUDIENCE[realm]) continue;

        const profile = realm === 'platform' ? platformProfile() : readProfile(realm);
        const meta = REALM_META[realm];
        out.push({
            realm,
            email: String(payload.email || profile.email || ''),
            name: profile.name || null,
            org: profile.org || null,
            role: meta.role,
            path: meta.path,
            menu: meta.menu,
        });
    }
    return out;
};

// ── Escritura ────────────────────────────────────────────────────────

export const SESSION_EVENT = 'rotary:session-changed';

/** Avisa al encabezado. Mismo camino que el resto de los avisos del sitio. */
export const emitSessionChange = () => {
    window.dispatchEvent(new CustomEvent(SESSION_EVENT));
};

/**
 * Guarda cómo se llama quien entró, para el menú del avatar. Lo escriben los
 * paneles cuando cargan sus datos: el token lleva el correo, no el nombre, y
 * pedirlo al servidor sólo para el encabezado sería una consulta por visita.
 */
export const rememberProfile = (realm: Realm, profile: SessionProfile) => {
    try {
        const previous = readProfile(realm);
        const merged = {
            name: profile.name ?? previous.name ?? null,
            org: profile.org ?? previous.org ?? null,
            email: profile.email ?? previous.email ?? null,
        };
        localStorage.setItem(PROFILE_KEY(realm), JSON.stringify(merged));
    } catch { /* almacenamiento lleno o bloqueado: el menú se dibuja igual */ }
    emitSessionChange();
};

/** Cierra UNA identidad. */
export const forgetSession = (realm: Realm) => {
    try {
        localStorage.removeItem(TOKEN_KEY[realm]);
        localStorage.removeItem(PROFILE_KEY(realm));
        if (realm === 'platform') {
            localStorage.removeItem('rotary_user');
            localStorage.removeItem('rotary_super_token');
            localStorage.removeItem('rotary_super_user');
        }
    } catch { /* nada que hacer */ }
    emitSessionChange();
};

/**
 * Cierra TODAS. Es lo que hace "Cerrar sesión" del encabezado: quien lo pulsa
 * quiere salir del sitio, no de una de las tres identidades que ni siquiera
 * sabe que tiene.
 */
export const closeAllSessions = () => {
    REALMS.forEach(realm => {
        try {
            localStorage.removeItem(TOKEN_KEY[realm]);
            localStorage.removeItem(PROFILE_KEY(realm));
        } catch { /* nada que hacer */ }
    });
    try {
        localStorage.removeItem('rotary_user');
        localStorage.removeItem('rotary_super_token');
        localStorage.removeItem('rotary_super_user');
    } catch { /* nada que hacer */ }
    emitSessionChange();
};

// ── Suscripción ──────────────────────────────────────────────────────

/**
 * Las sesiones abiertas, al día. Se repinta cuando se entra, cuando se sale y
 * cuando otra pestaña del mismo navegador cambia algo (`storage`), que es lo
 * que evita que una pestaña muestre un avatar de una sesión ya cerrada.
 */
export const useSiteSessions = (): SiteSession[] => {
    const [sessions, setSessions] = useState<SiteSession[]>(() => readSessions());

    useEffect(() => {
        const sync = () => setSessions(readSessions());
        window.addEventListener(SESSION_EVENT, sync);
        window.addEventListener('storage', sync);
        const stopLogin = onLoginSuccess(sync);
        // El token pudo vencer mientras la pestaña estaba en segundo plano.
        const onVisible = () => { if (!document.hidden) sync(); };
        document.addEventListener('visibilitychange', onVisible);
        return () => {
            window.removeEventListener(SESSION_EVENT, sync);
            window.removeEventListener('storage', sync);
            document.removeEventListener('visibilitychange', onVisible);
            stopLogin();
        };
    }, []);

    return sessions;
};

/** Iniciales para el avatar. */
export const initialsOf = (session: { name?: string | null; email?: string }): string => {
    const name = (session.name || '').trim();
    if (name) {
        const parts = name.split(/\s+/).filter(Boolean);
        return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
    }
    const email = (session.email || '').trim();
    return email ? email.charAt(0).toUpperCase() : '?';
};
