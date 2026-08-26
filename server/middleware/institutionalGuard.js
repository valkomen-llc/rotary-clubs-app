// ════════════════════════════════════════════════════════════════════
// La autorización de una identidad institucional — v4.932.0
//
// `authMiddleware` dice QUIÉN es; esto dice QUÉ puede hacer. Va después, nunca
// en su lugar.
//
// ⚠️ LOS PERMISOS NO VIAJAN EN EL TOKEN, y es la decisión que hace posible la
// revocación que el pedido pide expresamente. Un token es inmutable hasta que
// vence —hasta un día—: con los permisos adentro, suspender una cuenta o
// quitarle una herramienta no surtiría efecto hasta que su dueño volviera a
// entrar, que es justo lo que no se puede prometer de una revocación. Se leen
// de `InstitutionalProfile` en cada petición protegida.
//
// El costo está acotado a propósito: para un rol administrativo —que es quien
// hace casi todas las peticiones del panel— la comprobación CORTA sin tocar la
// base, porque su rol ya es la concesión. Sólo la identidad institucional paga
// una consulta, y sólo en las rutas que declaran permiso.
//
// ⚠️ Y ESTO NO SUSTITUYE AL AISLAMIENTO POR SITIO. El permiso dice qué clase de
// cosa se puede hacer; el `clubId` en el WHERE dice sobre cuáles filas. Las dos
// hacen falta: con permiso de bandeja y sin filtro, un usuario vería los
// correos de otro sitio.
// ════════════════════════════════════════════════════════════════════
import {
    can, isInstitutionalUser, isPlatformOperator, isSiteAdministrator,
    effectivePermissions, mailboxScopeFor,
} from '../lib/institutionalAccess.js';
import { profileForUser } from '../lib/institutionalStore.js';
import { hasPermission, canActOn, canSignIn } from '../lib/rbacSpec.js';
import { resolveUserGrant, serializeGrant } from '../lib/rbacStore.js';

/**
 * Carga el perfil UNA vez por petición y lo funde en `req.user`.
 *
 * Cachea en `req` porque una misma petición puede pasar por dos guardias —el
 * de permiso y el del controlador—, y sin caché serían dos consultas para leer
 * lo mismo.
 *
 * NUNCA lanza: si la tabla todavía no existe, devuelve la sesión tal como
 * venía, que es como se comportaba el panel antes de este módulo.
 */
export const attachInstitutionalProfile = async (req) => {
    if (!req?.user) return null;
    if (req.institutionalProfileLoaded) return req.institutionalProfile || null;
    req.institutionalProfileLoaded = true;

    // Un rol administrativo no necesita fila: su rol ya es la concesión, y
    // pedirle una a la base sería una consulta por petición para no decidir
    // nada. Los administradores anteriores a este módulo no tienen perfil.
    if (!isInstitutionalUser(req.user)) {
        req.institutionalProfile = null;
        return null;
    }

    const perfil = await profileForUser(req.user.id).catch(() => null);
    req.institutionalProfile = perfil;
    if (perfil) {
        req.user.permissions = perfil.permissions;
        req.user.mailbox = perfil.mailbox || null;
        req.user.institutionalStatus = perfil.status;
        req.user.mustChangePassword = perfil.mustChangePassword;
        // El sitio manda desde la BASE, no desde el token: si a alguien se le
        // movió de sitio, el token viejo no puede seguir alcanzando el anterior.
        if (perfil.clubId) req.user.clubId = perfil.clubId;
    } else {
        // Rol institucional SIN perfil: no se le supone nada. Sin permisos ve
        // el panel vacío, que es preferible a suponerle unos por omisión.
        req.user.permissions = [];
        req.user.mailbox = null;
    }
    return perfil;
};

/**
 * ⚠️ RESUELVE LOS PERMISOS EFECTIVOS DE LA PETICIÓN. Es el único punto donde el
 * servidor decide qué puede esta sesión en ESTE sitio.
 *
 * Se apoya en el perfil que `attachInstitutionalProfile` ya cargó —la misma
 * petición no lee la fila dos veces— y cachea en `req`, porque una petición
 * puede pasar por el guardia de la ruta y otra vez por el del controlador.
 *
 * ⚠️ NO CACHEA ENTRE PETICIONES, y es deliberado: los permisos NO viajan en el
 * token justamente para que revocar surta efecto en el acto. Una caché de un
 * minuto devolvería ese minuto de acceso a quien acaban de suspender, que es
 * precisamente lo que no se puede prometer de una revocación.
 *
 * El costo está acotado: el operador de la plataforma no toca la base, un rol
 * administrativo paga una consulta y sólo la identidad institucional paga dos.
 */
export const attachGrant = async (req) => {
    if (!req?.user) return null;
    if (req.rbacGrantLoaded) return req.rbacGrant || null;
    req.rbacGrantLoaded = true;
    try {
        const perfil = await attachInstitutionalProfile(req);
        const siteId = req.user.clubId || null;
        const grant = await resolveUserGrant(req.user, siteId, { profile: perfil });
        req.rbacGrant = grant;
        req.user.grant = grant;
        req.user.effectivePermissions = [...(grant.permissions || [])];
        if (grant.roleKey) req.user.siteRoleKey = grant.roleKey;
        return grant;
    } catch (error) {
        console.error('[RBAC] attachGrant:', error?.message);
        // DEGRADA a lo que había antes de este módulo: sin grant, las
        // comprobaciones caen en `can()` de v4.932. Un fallo de consulta no
        // puede dejar sin panel a quien sí tiene permiso.
        req.rbacGrant = null;
        return null;
    }
};

/**
 * ⚠️ UNA SESIÓN QUE YA NO VALE. Tres motivos y los tres se dicen distinto,
 * porque se corrigen en sitios distintos:
 *
 *   · suspendido → lo arregla el administrador del sitio;
 *   · sesiones cerradas → lo arregla la persona volviendo a entrar;
 *   · sin membresía activa → lo arregla quien lo dio de alta.
 *
 * «Acceso denegado» a secas obliga a diagnosticar a ciegas (regla de v4.859).
 */
const sessionRejection = (req, grant) => {
    if (req.user?.institutionalStatus === 'suspended' || grant?.source === 'suspended') {
        return { code: 'account_suspended', error: 'Tu acceso está suspendido. Escríbele al administrador del sitio.' };
    }
    const m = grant?.membership;
    if (m && !canSignIn(m.status)) {
        return { code: 'account_suspended', error: 'Tu acceso a este sitio está suspendido. Escríbele al administrador del sitio.' };
    }
    // Un token emitido ANTES de que alguien cerrara las sesiones deja de valer.
    // `iat` viene en segundos; la marca, en milisegundos.
    if (m?.sessionsRevokedAt && req.user?.iat) {
        const emitido = Number(req.user.iat) * 1000;
        if (emitido < new Date(m.sessionsRevokedAt).getTime()) {
            return { code: 'session_revoked', error: 'Tu sesión se cerró desde la administración del sitio. Vuelve a entrar.' };
        }
    }
    return null;
};

/**
 * Exige un permiso concreto. Es el ÚNICO guardia de autorización del módulo:
 * escrito a mano en cada ruta, la número once se escribe mal y el fallo es
 * mudo —la ruta responde de más y nadie lo ve—.
 *
 * ⚠️ ACEPTA LAS DOS FORMAS: la granular (`news.publish`) y la gruesa de v4.932
 * (`news`). Que acepte la vieja no es tolerancia: es lo que permite que las
 * decenas de rutas escritas entonces sigan contestando lo mismo sin tocar ni
 * una, que es la condición del punto 18 del pedido. Un permiso viejo se
 * satisface con CUALQUIER acción de su módulo — la llave vieja significaba
 * «entra a esta herramienta».
 */
export const requirePermission = (permission) => async (req, res, next) => {
    try {
        const grant = await attachGrant(req);

        const rechazo = sessionRejection(req, grant);
        if (rechazo) return res.status(403).json(rechazo);

        // Con `grant` decide el RBAC; sin él —fallo de consulta— se cae a
        // `can()` de v4.932, que es lo que había antes y no deja a nadie fuera.
        const ok = grant ? hasPermission(grant, permission) : can(req.user, permission);
        if (!ok) {
            // Sin decir qué permiso haría falta: el error no debe servir de
            // mapa de lo que hay detrás.
            console.warn(`[ACCESOS] "${req.user?.email}" sin permiso "${permission}" en ${req.method} ${req.originalUrl}`);
            return res.status(403).json({ error: 'No tienes permiso para esta sección.' });
        }
        next();
    } catch (error) {
        console.error('[ACCESOS] requirePermission:', error?.message);
        res.status(500).json({ error: 'No pudimos comprobar tus permisos.' });
    }
};

/**
 * Exige poder ACTUAR sobre una fila concreta: es la diferencia entre «editar
 * sus noticias» y «editar todas las noticias» (punto 8).
 *
 * `ownerOf(req)` devuelve de quién es la fila. Devolver `null` —no se sabe—
 * exige el permiso AMPLIO: ante la duda no se concede. Quien escriba el
 * resolutor mal obtiene el criterio estricto, nunca el laxo.
 */
export const requireAction = (moduleKey, action, ownerOf = null) => async (req, res, next) => {
    try {
        const grant = await attachGrant(req);
        const rechazo = sessionRejection(req, grant);
        if (rechazo) return res.status(403).json(rechazo);
        if (!grant) return next(); // degrada al comportamiento anterior

        const ownerId = typeof ownerOf === 'function' ? await ownerOf(req) : null;
        if (canActOn(grant, moduleKey, action, { ownerId, actorId: req.user?.id })) return next();

        console.warn(`[RBAC] "${req.user?.email}" sin ${moduleKey}.${action} en ${req.method} ${req.originalUrl}`);
        return res.status(403).json({ error: 'No tienes permiso para esta acción.' });
    } catch (error) {
        console.error('[RBAC] requireAction:', error?.message);
        res.status(500).json({ error: 'No pudimos comprobar tus permisos.' });
    }
};

/**
 * Sólo comprueba que la cuenta siga activa. Para las rutas que ya tienen su
 * propia autorización y lo único que les falta es honrar la suspensión.
 */
export const requireActiveAccount = async (req, res, next) => {
    try {
        const grant = await attachGrant(req);
        const rechazo = sessionRejection(req, grant);
        if (rechazo) return res.status(403).json(rechazo);
        next();
    } catch (error) {
        console.error('[ACCESOS] requireActiveAccount:', error?.message);
        next();
    }
};

/**
 * Administra las cuentas institucionales de un sitio. Se resuelve con el mismo
 * `can()` que todo lo demás para que no haya un segundo criterio.
 */
export const requireAccountAdmin = requirePermission('email_accounts');

/** Administra los usuarios y sus accesos. */
export const requireUserAdmin = requirePermission('users');

/** Administra los roles del sitio y su matriz de permisos. */
export const requireRoleAdmin = requirePermission('roles.manage');

export {
    can, effectivePermissions, mailboxScopeFor,
    isInstitutionalUser, isPlatformOperator, isSiteAdministrator,
    hasPermission, serializeGrant,
};

export default {
    attachInstitutionalProfile, attachGrant, requirePermission, requireAction,
    requireActiveAccount, requireAccountAdmin, requireUserAdmin, requireRoleAdmin,
};
