// ════════════════════════════════════════════════════════════════════
// ¿Quién es el super administrador de la plataforma?
// v4.687.0
//
// La plataforma aloja muchos sitios. El rol `administrator` lo tiene tanto
// quien administra la plataforma como quien administra el sitio de un club:
// para distinguirlos hace falta MIRAR TAMBIÉN EL DOMINIO. Sólo es super
// administrador de la plataforma quien tiene ese rol Y está en un dominio de
// la plataforma; el mismo rol en el dominio de un club es el administrador de
// ese club y nada más.
//
// La regla vivía suelta dentro de `AdminLayout`. Se saca aquí porque ahora la
// necesitan también el guardián de rutas (`App.tsx`) y la propia pantalla de
// lanzamientos: si cada uno la reescribe, tarde o temprano una copia se queda
// atrás y alguien ve lo que no debe.
// ════════════════════════════════════════════════════════════════════

export const PLATFORM_HOSTS = [
    'clubplatform.org',
    'www.clubplatform.org',
    'app.clubplatform.org',
    'rotaryplatform.com',
    'www.rotaryplatform.com',
    'rotaryclubplatform.org',
    'www.rotaryclubplatform.org',
    'localhost',
    '127.0.0.1',
];

/** ¿Estamos en un dominio de la plataforma y no en el sitio de un club? */
export const isOnPlatformDomain = (): boolean =>
    PLATFORM_HOSTS.includes(window.location.hostname);

/**
 * Super administrador de la plataforma: el rol de operación global EN el
 * dominio de la plataforma. El mismo rol en el sitio de un club administra
 * ese club, no la plataforma.
 *
 * Se reconocen los dos rótulos de operación global (`administrator` y
 * `superadmin`, más la marca `isSuperAdmin`): limitarlo a uno solo dejaba al
 * otro sin el menú de Management en el panel central —incluido Rotary en
 * Acción— aunque el servidor ya lo trataba como operador global.
 */
export const isPlatformSuperAdmin = (user?: { role?: string; isSuperAdmin?: boolean } | null): boolean => {
    if (!isOnPlatformDomain()) return false;
    const role = String((user as unknown as { role?: string })?.role || '');
    return role === 'administrator' || role === 'superadmin'
        || (user as unknown as { isSuperAdmin?: boolean })?.isSuperAdmin === true;
};
