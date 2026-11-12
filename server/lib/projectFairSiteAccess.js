// ════════════════════════════════════════════════════════════════════
// ¿Quién ADMINISTRA el módulo de la Feria de Proyectos? — v4.1325.0
//
// Criterio PURO (sin base): el controlador hace las consultas y le pasa aquí
// las filas. Así se prueba sin Postgres y no se reparte en dos sitios.
//
// ⚠️ EL INCIDENTE QUE CIERRA. Hasta v4.1324 `isProjectFairSiteAdmin` daba
// `admin` del módulo a cualquiera cuyo grant RBAC tuviera `project_fair.view`
// o `project_fair.manage`, SIN mirar de qué sitio era ese grant. Y
// `resolveUserGrant(user, user.clubId)` resuelve los roles heredados
// `club_admin`, `district_admin` y `editor` a `site_admin`, que tiene los dos
// permisos DENTRO DE SU PROPIO SITIO. Resultado: el administrador de cualquier
// club de la plataforma entraba como administrador de la Feria — documentos de
// identidad, correos, teléfonos, pagos y comprobantes, y las acciones de
// editar, archivar, eliminar y confirmar pagos. De paso, las listas por correo
// de la convocatoria (`access.finance`, `access.reviewers`,
// `access.translators`) nunca aplicaban: todos quedaban elevados antes.
//
// LA REGLA: un grant de sitio cuenta sólo si es DEL SITIO DE LA FERIA. Un
// permiso de `project_fair.*` en el sitio de un club habla del módulo de ESE
// club, no de la Feria.
// ════════════════════════════════════════════════════════════════════

/** Tipo de sitio: el mismo criterio con el que la barra lateral muestra el módulo. */
export const FAIR_SITE_HINT = /feria de proyectos|project[ _-]?fair/;

/**
 * Dominio del sitio de la Feria: el mismo criterio con el que
 * `institutionalAccessController` ofrece el rol `project_fair_manager`. Si
 * aquí no se reconociera, una persona a la que se le asignó ese rol en el
 * sitio de la Feria dejaría de entrar.
 */
export const FAIR_DOMAIN_HINT = /projectfair/;

/** Roles de plataforma: operan en cualquier sitio (espejo de `PLATFORM_ROLES`). */
export const PLATFORM_FAIR_ROLES = ['administrator', 'superadmin'];

/**
 * Roles heredados que ADMINISTRAN un sitio. En el sitio de la Feria, lo
 * administran a ella. Es la lista que ya usaba v4.599; `institutional_user`
 * sigue porque la guardia de la ruta ya le exige `project_fair.*` en SU sitio.
 */
export const FAIR_SITE_ADMIN_ROLES = ['club_admin', 'district_admin', 'administrator', 'editor', 'institutional_user'];

const lower = (v) => String(v ?? '').toLowerCase();

/** ¿Esta fila de `Club` es el sitio de una Feria de Proyectos? */
export const isFairSiteRow = (row) => {
    if (!row) return false;
    if (FAIR_SITE_HINT.test(`${lower(row.type)} ${lower(row.organizationType)} ${lower(row.category)}`)) return true;
    if (FAIR_DOMAIN_HINT.test(`${lower(row.domain)} ${lower(row.subdomain)}`)) return true;
    // El nombre, como en `institutionalAccessController` («Feria de Proyectos…»).
    return /feria de proyectos|project fair/.test(lower(row.name));
};

/**
 * ¿El sitio del usuario (`user.clubId`) es el sitio de la Feria?
 *
 *   · `cfg.clubId` — el sitio que la convocatoria declara, si lo declara;
 *   · el tipo, dominio o nombre del propio sitio del usuario;
 *   · RESPALDO: la petición llega desde el dominio de un sitio de feria y ese
 *     sitio es el del usuario (el `clubId` del token apunta a un club espejo
 *     tras una suplantación de distrito y por eso el tipo no se reconocía).
 */
export const userIsOnFairSite = ({ user, cfg = null, ownSite = null, hostSite = null } = {}) => {
    const clubId = user?.clubId ? String(user.clubId) : '';
    if (!clubId) return false;
    if (cfg?.clubId && String(cfg.clubId) === clubId) return true;
    if (ownSite && String(ownSite.id ?? clubId) === clubId && isFairSiteRow(ownSite)) return true;
    return !!hostSite && String(hostSite.id) === clubId && isFairSiteRow(hostSite);
};

/** ¿El grant (YA resuelto contra el sitio de la Feria) administra el módulo? */
export const grantAdministersFair = (grant, hasPermission) =>
    !!grant && (
        grant.roleKey === 'project_fair_manager'
        || hasPermission(grant, 'project_fair.manage')
        || hasPermission(grant, 'project_fair.view')
    );

/**
 * La decisión, con todo lo que el controlador ya consultó.
 *
 * `grant` debe estar resuelto contra `user.clubId` —que es lo que hace
 * `resolveUserGrant`— y sólo se mira cuando ese sitio ES el de la Feria: así
 * un `site_admin` de otro club no cuenta, que es el arreglo.
 */
export const decideFairSiteAdmin = ({ user, cfg = null, ownSite = null, hostSite = null, grant = null, hasPermission = () => false } = {}) => {
    if (!user) return false;
    const role = String(user.role || '');
    // Operador de la plataforma: todos los sitios, también éste.
    if (PLATFORM_FAIR_ROLES.includes(role)) return true;
    // Rol de `User` institucional de la Feria (no es un grant de sitio).
    if (role === 'project_fair_manager') return true;
    if (!userIsOnFairSite({ user, cfg, ownSite, hostSite })) return false;
    // En el sitio de la Feria: su convocatoria lo declara, administra el sitio
    // o su grant —de ESTE sitio— le da el módulo.
    if (cfg?.clubId && String(cfg.clubId) === String(user.clubId)) return true;
    if (FAIR_SITE_ADMIN_ROLES.includes(role)) return true;
    return grantAdministersFair(grant, hasPermission);
};
