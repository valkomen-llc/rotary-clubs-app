// ════════════════════════════════════════════════════════════════════
// Acceso unificado — POST /api/auth/session
// v4.627.0
//
// El sitio tiene un solo formulario de ingreso: el del ícono del encabezado.
// Detrás hay dos identidades distintas, y quien ingresa no tiene por qué
// saberlo:
//
//   • `User`               → administra el sitio        → /admin/dashboard
//   • `ProjectFairAccount` → gestiona su proyecto       → /mi-proyecto
//
// Este endpoint recibe correo y contraseña una sola vez, averigua a cuál de
// las dos pertenecen, emite el token que corresponda y devuelve la RUTA DE
// DESTINO ya calculada. El navegador obedece esa ruta en lugar de decidirla
// por su cuenta, así que cliente y servidor no pueden discrepar sobre a dónde
// va cada rol.
//
// La redirección es comodidad, no seguridad: quien escriba una URL restringida
// choca igual contra `authMiddleware` + `requireSiteAdmin` en el servidor.
// ════════════════════════════════════════════════════════════════════
import { authenticatePlatform, platformRedirect } from './authController.js';
import { authenticatePortal, describePortalSession } from './projectFairPortalController.js';
import { ADMIN_ROLES } from '../middleware/auth.js';

// Mensaje único para credenciales que no coinciden: no se revela si el correo
// existe, ni en cuál de las dos identidades.
const BAD_CREDENTIALS = 'Correo o contraseña incorrectos.';

export const resolveSession = async (req, res) => {
    const email = String(req.body?.email || '').trim();
    const password = String(req.body?.password || '');
    if (!email || !password) {
        return res.status(400).json({ error: 'Ingresa tu correo y contraseña.' });
    }

    try {
        // 1) Identidad de plataforma. Va primero porque quien administra el
        //    sitio entra muchas veces al día; el club, unas pocas.
        const platform = await authenticatePlatform(email, password).catch(err => {
            console.error('[session] authenticatePlatform:', err?.message);
            return { ok: false };
        });

        if (platform.ok) {
            const isAdmin = ADMIN_ROLES.includes(String(platform.user.role || ''));
            return res.json({
                realm: 'platform',
                token: platform.token,
                user: platform.user,
                role: platform.user.role,
                roleLabel: isAdmin ? 'Administrador del sitio' : 'Usuario',
                redirect: platformRedirect(platform.user),
                // Sin rol reconocido no hay panel al que entrar; se dice, en vez
                // de dejarlo dando vueltas contra una redirección silenciosa.
                warning: isAdmin ? null : 'Tu cuenta no tiene permisos asignados. Escríbele al administrador del sitio.',
            });
        }

        // 2) Identidad del panel del club (las credenciales que creó al
        //    inscribir su proyecto).
        const portal = await authenticatePortal(email, password).catch(err => {
            console.error('[session] authenticatePortal:', err?.message);
            return { ok: false };
        });

        if (portal.needsPassword) {
            return res.status(409).json({
                error: 'Tu proyecto está registrado pero aún no tiene contraseña. Te enviamos un enlace para crearla.',
                needsPassword: true,
                realm: 'portal',
            });
        }

        if (portal.ok) {
            const session = await describePortalSession(portal.account);
            return res.json({
                token: portal.token,
                email: portal.account.email,
                clubName: portal.account.clubName,
                ...session,
            });
        }

        return res.status(401).json({ error: BAD_CREDENTIALS });
    } catch (error) {
        console.error('[session] resolveSession:', error);
        res.status(500).json({ error: 'No pudimos iniciar sesión. Inténtalo de nuevo.' });
    }
};

export default { resolveSession };
