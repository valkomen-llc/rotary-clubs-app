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
 * Exige un permiso concreto. Es el ÚNICO guardia de autorización del módulo:
 * escrito a mano en cada ruta, la número once se escribe mal y el fallo es
 * mudo —la ruta responde de más y nadie lo ve—.
 */
export const requirePermission = (permission) => async (req, res, next) => {
    try {
        await attachInstitutionalProfile(req);

        // Una cuenta suspendida no pasa por ninguna puerta, tenga el permiso
        // que tenga. Es la revocación efectiva: el token sigue firmado y sigue
        // sin servir para nada.
        if (req.user?.institutionalStatus === 'suspended') {
            return res.status(403).json({
                error: 'Tu acceso está suspendido. Escríbele al administrador del sitio.',
                code: 'account_suspended',
            });
        }

        if (!can(req.user, permission)) {
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
 * Sólo comprueba que la cuenta siga activa. Para las rutas que ya tienen su
 * propia autorización y lo único que les falta es honrar la suspensión.
 */
export const requireActiveAccount = async (req, res, next) => {
    try {
        await attachInstitutionalProfile(req);
        if (req.user?.institutionalStatus === 'suspended') {
            return res.status(403).json({
                error: 'Tu acceso está suspendido. Escríbele al administrador del sitio.',
                code: 'account_suspended',
            });
        }
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

export {
    can, effectivePermissions, mailboxScopeFor,
    isInstitutionalUser, isPlatformOperator, isSiteAdministrator,
};

export default {
    attachInstitutionalProfile, requirePermission,
    requireActiveAccount, requireAccountAdmin, requireUserAdmin,
};
