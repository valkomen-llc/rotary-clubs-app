// ════════════════════════════════════════════════════════════════════
// El estado de un sitio, y qué puede ver un visitante — v4.883
//
// PURO: sin base, sin red, sin DOM. Lo consumen la puerta central del router,
// las siete pantallas de sitios del panel y —espejado en `server/lib/
// siteStatus.js`— el SEO, que tiene que dejar de indexar un sitio que todavía
// no es público.
//
// TRES estados, y la distinción que define el módulo:
//
//   activo         el sitio es público y operativo. Lo de siempre.
//   construccion   el contenido existe, los módulos funcionan y el panel
//                  entra — pero un visitante SIN sesión no ve las páginas
//                  públicas. Es un estado de PUBLICACIÓN, no de servicio.
//   inactivo       el sitio está deshabilitado según las reglas de siempre.
//
// ⚠️ «En construcción» NO es «inactivo con otro nombre». Un sitio inactivo
// está dado de baja; uno en construcción está VIVO y se está armando. Por eso
// la sesión pasa: el equipo entra, carga contenido y mira cómo va a quedar en
// el sitio de verdad, no en una vista previa.
//
// ⚠️ TAMPOCO es el «Banner de Desarrollo». Ese banner es un AVISO que se pinta
// encima del sitio y no restringe nada; sigue existiendo y es independiente.
// Confundirlos es lo que hace creer que un sitio está protegido cuando lo
// único que tiene es un cartel.
// ════════════════════════════════════════════════════════════════════

export type SiteStatus = 'active' | 'draft' | 'inactive';

export interface SiteStatusInfo {
    id: SiteStatus;
    label: string;
    /** Qué implica, en una línea, para quien mueve el selector. */
    help: string;
    /** Emoji del selector — el pedido los nombra explícitamente. */
    emoji: string;
    /** Clases de la insignia del listado. */
    badge: string;
}

/**
 * El catálogo es CERRADO. Un estado que no esté acá no se puede elegir ni
 * puede llegar a decidir nada: sin esa puerta, un valor cualquiera guardado en
 * la columna caería en la rama que menos se espera.
 *
 * ⚠️ `draft` es el valor que YA existía en la base y en `ClubContext`
 * (`isDraft`), y se conserva a propósito: inventar `under_construction` habría
 * dejado dos verdades sobre lo mismo y un sitio ya marcado `draft` se habría
 * quedado sin estado reconocible.
 */
export const SITE_STATUSES: SiteStatusInfo[] = [
    {
        id: 'active', label: 'Activo', emoji: '🟢',
        help: 'El sitio es público: cualquier visitante ve la portada y las páginas internas.',
        badge: 'bg-green-100 text-green-700',
    },
    {
        id: 'draft', label: 'En construcción', emoji: '🟡',
        help: 'El contenido y los módulos siguen funcionando, y quien tenga sesión navega el sitio completo. Un visitante sin sesión ve la pantalla «en construcción». El inicio de sesión queda accesible.',
        badge: 'bg-amber-100 text-amber-700',
    },
    {
        id: 'inactive', label: 'Inactivo / Suspendido', emoji: '🔴',
        help: 'El sitio queda deshabilitado según las reglas de siempre.',
        badge: 'bg-red-100 text-red-700',
    },
];

export const SITE_STATUS_IDS = SITE_STATUSES.map(s => s.id);

/**
 * Qué estado es éste. Tolerante con lo guardado: `published` y `production`
 * han significado «activo» en distintos momentos de la plataforma, y una fila
 * con cualquiera de los dos tiene que seguir siendo pública — dar por
 * «inactivo» lo que no se reconoce apagaría sitios que hoy funcionan.
 */
export function normalizeSiteStatus(raw: unknown): SiteStatus {
    const v = String(raw ?? '').trim().toLowerCase();
    if (v === 'draft' || v === 'construction' || v === 'under_construction') return 'draft';
    if (v === 'inactive' || v === 'suspended' || v === 'disabled') return 'inactive';
    // ⚠️ Ante la duda, ACTIVO. Es el único valor por omisión seguro: lo
    // contrario convertiría un dato desconocido en un sitio caído.
    return 'active';
}

export const statusInfo = (raw: unknown): SiteStatusInfo =>
    SITE_STATUSES.find(s => s.id === normalizeSiteStatus(raw)) as SiteStatusInfo;

export const isUnderConstruction = (raw: unknown): boolean => normalizeSiteStatus(raw) === 'draft';

// ─── Qué se ve sin sesión ────────────────────────────────────────────────
//
// ⚠️ ESTA LISTA ES LA QUE EVITA DEJAR LA LLAVE ADENTRO. Sin `/login`, un sitio
// en construcción no se puede desbloquear desde el navegador: la puerta se
// cierra y no hay forma de entrar a abrirla. Es la exigencia expresa del
// pedido y la razón por la que la comprobación va acá, en un solo sitio, y no
// repetida en cada pantalla.
//
// Van SIN barra final y se comparan por PREFIJO de segmento: `/login` cubre
// `/login` y `/login/loquesea`, pero NO `/loginfalso` — que sería otra página.
export const ALWAYS_PUBLIC_PREFIXES = [
    '/login',
    '/admin',           // el panel entero
    '/registro',
    '/verify-email',
    '/recuperar',
    '/restablecer',
];

/** ¿Esta ruta se sirve pase lo que pase con el estado del sitio? */
export function isAlwaysPublicPath(path: string): boolean {
    const p = String(path ?? '').split('?')[0].split('#')[0] || '/';
    return ALWAYS_PUBLIC_PREFIXES.some(pre => p === pre || p.startsWith(`${pre}/`));
}

export interface PublicAccess {
    /** `true` → se pinta el sitio. `false` → la pantalla «en construcción». */
    allowed: boolean;
    /** Por qué. Sirve para diagnosticar y para no decidir en silencio. */
    reason: 'activo' | 'ruta-siempre-publica' | 'con-sesion' | 'en-construccion';
}

/**
 * La decisión, en UN solo sitio.
 *
 * `hasSession` es «hay ALGUNA sesión del sitio abierta», no «es
 * administrador»: la plataforma tiene tres identidades (panel, gestor de
 * proyectos, asistente a un evento) y el pedido dice «usuarios autenticados y
 * administradores». Quién las lee es `siteSession.ts`, que ya sabe hacerlo
 * desde v4.693 — acá sólo llega el booleano, para que esto siga siendo puro.
 */
export function publicAccessAllowed(
    { status, path, hasSession }: { status: unknown; path: string; hasSession: boolean }
): PublicAccess {
    if (!isUnderConstruction(status)) return { allowed: true, reason: 'activo' };
    if (isAlwaysPublicPath(path)) return { allowed: true, reason: 'ruta-siempre-publica' };
    if (hasSession) return { allowed: true, reason: 'con-sesion' };
    return { allowed: false, reason: 'en-construccion' };
}
