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
    'localhost',
];

/** ¿Estamos en un dominio de la plataforma y no en el sitio de un club? */
export const isOnPlatformDomain = (): boolean =>
    PLATFORM_HOSTS.includes(window.location.hostname);

/**
 * Super administrador de la plataforma: el rol `administrator` EN el dominio
 * de la plataforma. El mismo rol en el sitio de un club administra ese club,
 * no la plataforma.
 */
export const isPlatformSuperAdmin = (user?: { role?: string } | null): boolean =>
    isOnPlatformDomain() && String(user?.role || '') === 'administrator';
