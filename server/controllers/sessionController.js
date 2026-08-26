// ════════════════════════════════════════════════════════════════════
// Acceso unificado — POST /api/auth/session
// v4.711.0
//
// El sitio tiene un solo formulario de ingreso: el del ícono del encabezado.
// Detrás hay tres identidades distintas, y quien ingresa no tiene por qué
// saberlo:
//
//   • `User`                 → administra el sitio      → /admin/dashboard
//   • `ProjectFairAccount`   → gestiona su proyecto     → /mi-proyecto
//   • `EventAttendeeAccount` → consulta su inscripción  → /mi-inscripcion
//
// Este endpoint recibe correo y contraseña una sola vez, averigua a cuál de
// las tres pertenecen, emite el token que corresponda y devuelve la RUTA DE
// DESTINO ya calculada. El navegador obedece esa ruta en lugar de decidirla
// por su cuenta, así que cliente y servidor no pueden discrepar sobre a dónde
// va cada rol.
//
// La redirección es comodidad, no seguridad: quien escriba una URL restringida
// choca igual contra `authMiddleware` + `requireSiteAdmin` en el servidor.
// ════════════════════════════════════════════════════════════════════
import { authenticatePlatform, platformRedirect, guardLoginAttempt, noteLoginResult } from './authController.js';
import { authenticatePortal, describePortalSession } from './projectFairPortalController.js';
import { authenticateAttendee, describeAttendeeSession } from './eventAttendeeController.js';
import { ADMIN_ROLES } from '../middleware/auth.js';
import { audit } from '../lib/institutionalStore.js';
import { INSTITUTIONAL_ROLE } from '../lib/institutionalAccess.js';

// Mensaje único para credenciales que no coinciden: no se revela si el correo
// existe, ni en cuál de las tres identidades.
const BAD_CREDENTIALS = 'Correo o contraseña incorrectos.';

/**
 * TODAS las identidades que abren esas credenciales (v4.711).
 *
 * Hasta v4.710 se devolvía la PRIMERA que coincidía y se paraba ahí. Un
 * rotario colombiano puede pagar la postulación de su proyecto y además la
 * asistencia al evento con la misma cuenta: al entrar sólo se le abría el
 * panel del club, y el del evento no aparecía en ninguna parte —no porque no
 * existiera, sino porque nadie había emitido su sesión—.
 *
 * Se prueban las tres y se abren las que correspondan. Los paneles siguen
 * siendo SEPARADOS, cada uno con su identidad, su audiencia y sus permisos:
 * lo que se unifica es el ingreso, no los datos.
 */
export const resolveSession = async (req, res) => {
    const email = String(req.body?.email || '').trim();
    const password = String(req.body?.password || '');
    // "Mantener la sesión iniciada". Por omisión se conserva la vigencia de
    // siempre, así que un cliente antiguo que no mande el campo se comporta
    // igual que antes; desmarcarla sólo acorta la sesión.
    const remember = req.body?.remember !== false;
    if (!email || !password) {
        return res.status(400).json({ error: 'Ingresa tu correo y contraseña.' });
    }

    const intento = async (nombre, fn) => fn().catch(err => {
        console.error(`[session] ${nombre}:`, err?.message);
        return { ok: false };
    });

    try {
        // El freno de intentos vale para el ingreso unificado igual que para
        // `/login`: con uno frenado y otro abierto, el frenado no serviría de
        // nada — y éste es el que usa el botón del encabezado, o sea el camino
        // por el que entra todo el mundo.
        const freno = guardLoginAttempt(email, req);
        if (!freno.allowed) {
            await audit('login_blocked', { email, detail: 'demasiados intentos', req });
            return res.status(429).json({
                error: `Demasiados intentos. Inténtalo de nuevo en ${freno.retryInMinutes} minutos.`,
            });
        }

        // Se prueban las tres SIEMPRE. El orden importa sólo para elegir a
        // cuál se redirige: quien administra el sitio entra muchas veces al
        // día; quien consulta una inscripción, unas pocas.
        const [platform, portal, attendee] = await Promise.all([
            intento('authenticatePlatform', () => authenticatePlatform(email, password, { remember })),
            intento('authenticatePortal', () => authenticatePortal(email, password, { remember })),
            intento('authenticateAttendee', () => authenticateAttendee(email, password, req, { remember })),
        ]);

        const sessions = [];

        if (platform.ok) {
            const rol = String(platform.user.role || '');
            const isAdmin = ADMIN_ROLES.includes(rol);
            const esInstitucional = rol === INSTITUTIONAL_ROLE;
            const sinHerramientas = esInstitucional && !(platform.user.permissions || []).length;
            sessions.push({
                realm: 'platform',
                token: platform.token,
                user: platform.user,
                email: platform.user.email,
                role: platform.user.role,
                roleLabel: esInstitucional
                    ? 'Usuario institucional'
                    : (isAdmin ? 'Administrador del sitio' : 'Usuario'),
                // ⚠️ UNA CONTRASEÑA TEMPORAL MANDA A CAMBIARLA ANTES QUE A NADA.
                // La escribió el administrador, así que la conoce alguien que no
                // es su dueño: entrar al panel con ella y quedarse ahí sería
                // dejar indefinidamente una credencial compartida. El destino se
                // decide en el SERVIDOR, como el resto, para que cliente y
                // servidor no discrepen.
                redirect: platform.user.mustChangePassword
                    ? '/admin/perfil?cambiar=1'
                    : platformRedirect(platform.user),
                mustChangePassword: !!platform.user.mustChangePassword,
                // Sin rol reconocido no hay panel al que entrar; se dice, en vez
                // de dejarlo dando vueltas contra una redirección silenciosa. Y
                // un usuario institucional SIN una sola herramienta marcada
                // entra a un panel vacío: también se dice, porque desde su lado
                // se lee como que el sistema no funciona.
                warning: !isAdmin
                    ? 'Tu cuenta no tiene permisos asignados. Escríbele al administrador del sitio.'
                    : (sinHerramientas
                        ? 'Tu cuenta todavía no tiene herramientas habilitadas. Escríbele al administrador del sitio.'
                        : null),
            });
        }

        if (portal.ok) {
            sessions.push({
                token: portal.token,
                email: portal.account.email,
                clubName: portal.account.clubName,
                ...(await describePortalSession(portal.account)),
            });
        }

        if (attendee.ok) {
            sessions.push({
                token: attendee.token,
                email: attendee.account.email,
                ...(await describeAttendeeSession(attendee.account)),
            });
        }

        // El resultado del intento se anota SIEMPRE: el acierto limpia el
        // contador del freno y deja el ingreso en la auditoría; el fallo lo
        // suma. Un ingreso que no se anota no se puede investigar después.
        await noteLoginResult(email, req, {
            ok: sessions.length > 0,
            userId: platform.ok ? platform.user.id : (platform.user?.id || null),
            clubId: platform.ok ? platform.user.clubId : (platform.user?.clubId || null),
            detail: platform.suspended ? 'cuenta suspendida' : null,
        });

        // Una cuenta institucional suspendida no entra, y se le dice por qué:
        // «correo o contraseña incorrectos» la mandaría a probar contraseñas
        // que sí son correctas.
        if (!sessions.length && platform.suspended) {
            return res.status(403).json({
                error: 'Tu acceso está suspendido. Escríbele al administrador del sitio.',
                code: 'account_suspended',
            });
        }

        if (sessions.length) {
            // La primera manda para la redirección; las demás viajan para que
            // el navegador guarde su token y el encabezado ofrezca su panel.
            // El nivel superior conserva la forma de siempre: un navegador con
            // el bundle anterior entra igual, sólo que a una identidad.
            return res.json({ ...sessions[0], sessions });
        }

        // Ninguna coincidió. Si alguna dice que la cuenta existe pero no tiene
        // contraseña, se manda a crearla en vez de repetir «credenciales
        // incorrectas», que sería mentir sobre lo que pasa.
        const pendiente = [portal, attendee].find(x => x?.needsPassword);
        if (pendiente === portal) {
            return res.status(409).json({
                error: 'Tu proyecto está registrado pero aún no tiene contraseña. Te enviamos un enlace para crearla.',
                needsPassword: true,
                realm: 'portal',
            });
        }
        if (pendiente === attendee) {
            return res.status(409).json({
                error: 'Tu inscripción está registrada pero aún no tiene contraseña. Te enviamos un enlace para crearla.',
                needsPassword: true,
                realm: 'attendee',
            });
        }

        return res.status(401).json({ error: BAD_CREDENTIALS });
    } catch (error) {
        console.error('[session] resolveSession:', error);
        res.status(500).json({ error: 'No pudimos iniciar sesión. Inténtalo de nuevo.' });
    }
};

export default { resolveSession };
