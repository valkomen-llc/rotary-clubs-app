import db from '../lib/db.js';
import { PLATFORM_AUDIENCE, ADMIN_ROLES, JWT_SECRET, SHORT_SESSION_TTL } from '../middleware/auth.js';
import {
    profileForUser, touchLogin, audit, storeResetToken, consumeResetToken,
    markPasswordSet, clientIp,
} from '../lib/institutionalStore.js';
import { effectivePermissions, displayNameOf, PASSWORD_MIN } from '../lib/institutionalAccess.js';
import { checkLogin, recordFailure, recordSuccess } from '../lib/loginThrottle.js';
import EmailService from '../services/EmailService.js';

let bcrypt = null;
let jwt = null;

const getBcrypt = async () => {
    if (!bcrypt) { const m = await import('bcryptjs'); bcrypt = m.default; }
    return bcrypt;
};
const getJwt = async () => {
    if (!jwt) { const m = await import('jsonwebtoken'); jwt = m.default; }
    return jwt;
};

/**
 * Comprueba unas credenciales contra la identidad de plataforma (tabla `User`).
 *
 * Vive aparte de `login` porque el acceso unificado del encabezado
 * (`sessionController`) necesita el mismo chequeo sin duplicar la lógica.
 *
 * @returns {Promise<{ok: true, user: object, token: string} | {ok: false}>}
 *          Nunca distingue "el correo no existe" de "la contraseña no coincide".
 */
export const authenticatePlatform = async (email, password, { remember = true } = {}) => {
    const clean = String(email || '').trim();
    if (!clean || !password) return { ok: false };

    const include = { club: { select: { id: true, name: true, subdomain: true } } };
    // Primero tal cual se escribió (así se guardó históricamente) y, si no
    // aparece, en minúsculas: quien registró su correo con mayúsculas sigue
    // entrando aunque lo escriba distinto.
    let user = await db.prisma.user.findUnique({ where: { email: clean }, include });
    if (!user && clean !== clean.toLowerCase()) {
        user = await db.prisma.user.findUnique({ where: { email: clean.toLowerCase() }, include });
    }
    if (!user) return { ok: false };

    const bcryptLib = await getBcrypt();
    const isMatch = await bcryptLib.compare(password, user.password).catch(() => false);
    if (!isMatch) return { ok: false };

    // ── El perfil institucional, si lo tiene ─────────────────────────
    //
    // Los administradores anteriores a este módulo NO tienen fila, y ese es el
    // caso normal: sin perfil, la sesión se arma exactamente como antes de
    // v4.932. Nunca lanza —corre en el camino del ingreso—, así que una tabla
    // que todavía no existe deja entrar como siempre.
    const profile = await profileForUser(user.id).catch(() => null);

    // ⚠️ UNA CUENTA SUSPENDIDA NO ABRE SESIÓN. Es la otra mitad de la
    // revocación: `requirePermission` cierra las rutas de una sesión ya
    // abierta, y esto impide abrir una nueva. Sin las dos, suspender sólo
    // valdría hasta que el token venciera.
    if (profile?.status === 'suspended') {
        return { ok: false, suspended: true, user: { id: user.id, email: user.email, clubId: user.clubId || null } };
    }

    // El sitio manda desde el PERFIL cuando lo hay: si a alguien se le movió de
    // sitio, el token no puede seguir emitiéndose contra el anterior.
    const clubId = profile?.clubId || user.clubId || null;

    const jwtLib = await getJwt();
    const token = jwtLib.sign(
        {
            id: user.id, email: user.email, role: user.role,
            clubId, districtId: user.districtId,
            aud: PLATFORM_AUDIENCE,
            // ⚠️ LOS PERMISOS NO VAN EN EL TOKEN. Ver el encabezado de
            // `institutionalGuard.js`: con ellos adentro, quitar una herramienta
            // no surtiría efecto hasta que el token venciera —hasta un día—, y
            // eso no es una revocación. Se leen de la base en cada petición
            // protegida. Lo que sí viaja es el buzón, porque es el dato con el
            // que la bandeja arranca antes de resolver nada.
            mailbox: profile?.mailbox || null,
        },
        JWT_SECRET,
        // "Mantener la sesión iniciada" sólo conserva la vigencia de siempre;
        // al desmarcarla el token vence el mismo día, así que la casilla nunca
        // afloja la seguridad, sólo la aprieta.
        { expiresIn: remember ? '1d' : SHORT_SESSION_TTL }
    );

    const sessionUser = {
        id: user.id,
        email: user.email,
        role: user.role,
        clubId,
        club: user.club,
        name: user.name || null,
    };

    if (profile) {
        // Lo que la PANTALLA necesita para pintarse: el menú por permisos, el
        // avatar del encabezado y el aviso de contraseña temporal. Es una foto
        // del momento del ingreso; la fuente de verdad sigue siendo la base, y
        // el panel la refresca con `GET /institutional/me`.
        sessionUser.permissions = effectivePermissions({ role: user.role, permissions: profile.permissions });
        sessionUser.mailbox = profile.mailbox || null;
        sessionUser.avatarUrl = profile.avatarUrl || null;
        sessionUser.firstName = profile.firstName || null;
        sessionUser.lastName = profile.lastName || null;
        sessionUser.position = profile.position || null;
        sessionUser.displayName = displayNameOf(profile, user.email);
        sessionUser.mustChangePassword = !!profile.mustChangePassword;
    } else {
        sessionUser.permissions = effectivePermissions({ role: user.role });
        sessionUser.displayName = user.name || user.email;
        sessionUser.mustChangePassword = false;
    }

    return { ok: true, token, user: sessionUser, profile };
};

/**
 * Ruta a la que entra una sesión de plataforma según su rol. Se calcula en el
 * servidor para que cliente y servidor no puedan discrepar sobre el destino.
 */
export const platformRedirect = (user) =>
    (ADMIN_ROLES.includes(String(user?.role || '')) ? '/admin/dashboard' : '/');

/**
 * Comprueba el freno de intentos y anota el resultado.
 *
 * Se usa desde `login` y desde `resolveSession` —los dos caminos por los que se
 * entra— para que no haya uno frenado y otro abierto. Es un FRENO, no una
 * garantía: ver el encabezado de `loginThrottle.js`.
 */
export const guardLoginAttempt = (email, req) => {
    const ip = clientIp(req);
    const veredicto = checkLogin(email, ip);
    return { ...veredicto, ip };
};

export const noteLoginResult = async (email, req, { ok, userId = null, clubId = null, detail = null }) => {
    const ip = clientIp(req);
    if (ok) {
        recordSuccess(email, ip);
        if (userId) {
            await touchLogin(userId, req);
            await audit('login_ok', { clubId, userId, email, actor: { kind: 'self', id: userId }, req });
        }
        return;
    }
    recordFailure(email, ip);
    // Se anota también el intento contra un correo que no existe: es lo que
    // hace VISIBLE un ataque de fuerza bruta, que es lo único que el freno en
    // memoria no puede prometer por sí solo.
    await audit('login_failed', { clubId, userId, email, detail, req });
};

export const login = async (req, res) => {
    const { email, password } = req.body;
    try {
        const freno = guardLoginAttempt(email, req);
        if (!freno.allowed) {
            await audit('login_blocked', { email, detail: 'demasiados intentos', req });
            return res.status(429).json({
                error: `Demasiados intentos. Inténtalo de nuevo en ${freno.retryInMinutes} minutos.`,
            });
        }

        const result = await authenticatePlatform(email, password);
        if (!result.ok) {
            await noteLoginResult(email, req, {
                ok: false,
                userId: result.user?.id || null,
                clubId: result.user?.clubId || null,
                detail: result.suspended ? 'cuenta suspendida' : null,
            });
            if (result.suspended) {
                return res.status(403).json({
                    error: 'Tu acceso está suspendido. Escríbele al administrador del sitio.',
                    code: 'account_suspended',
                });
            }
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        await noteLoginResult(email, req, { ok: true, userId: result.user.id, clubId: result.user.clubId });
        res.json({ token: result.token, user: result.user });
    } catch (err) {
        console.error('Login error:', err.message);
        res.status(500).json({ error: 'Server error' });
    }
};

// ── Recuperación de contraseña de la identidad de plataforma ─────────
//
// Se replica el flujo que los portales de Feria y Evento ya tienen desde hace
// versiones —token JWT de dos horas, guardado además en la fila para poder
// invalidarlo, enlace por correo, NUNCA la contraseña—. No se escribe uno
// nuevo: son los mismos pasos y una segunda implementación se separaría en
// silencio del original.

const RESET_PURPOSE = 'platform_reset';

/**
 * POST /api/auth/forgot
 *
 * ⚠️ LA RESPUESTA ES IDÉNTICA EXISTA O NO EL CORREO. Es lo que impide usar este
 * endpoint como un censo de las direcciones institucionales del sitio: quien
 * pruebe mil correos recibe mil veces lo mismo.
 */
export const forgotPassword = async (req, res) => {
    const generic = {
        success: true,
        message: 'Si el correo pertenece a una cuenta con acceso, recibirás un enlace para restablecer tu contraseña.',
    };
    try {
        const email = String(req.body?.email || '').trim().toLowerCase();
        if (!email) return res.json(generic);

        // El freno vale también acá: sin él, este endpoint sería la vía cómoda
        // para inundar de correos a una dirección conocida.
        const freno = guardLoginAttempt(email, req);
        if (!freno.allowed) return res.json(generic);
        recordFailure(email, clientIp(req));

        const { rows } = await db.query(
            'SELECT id, email, role, "clubId" FROM "User" WHERE lower(email) = $1 LIMIT 1', [email]);
        const user = rows[0];
        if (!user) return res.json(generic);

        const profile = await profileForUser(user.id).catch(() => null);
        if (profile?.status === 'suspended') {
            // Una cuenta suspendida no recupera su contraseña: la recuperaría
            // para nada, porque el ingreso está cerrado igual. Se responde lo
            // mismo que siempre para no revelar el estado.
            return res.json(generic);
        }

        const jwtLib = await getJwt();
        const token = jwtLib.sign({ sub: user.id, purpose: RESET_PURPOSE }, JWT_SECRET, { expiresIn: '2h' });
        await storeResetToken(user.id, token, { hours: 2 });
        await audit('password_reset', {
            clubId: user.clubId, userId: user.id, email,
            actor: { kind: 'self', id: user.id }, detail: 'enlace solicitado', req,
        });

        const origin = req.headers.origin || 'https://app.clubplatform.org';
        const link = `${origin}/restablecer?token=${encodeURIComponent(token)}`;
        await EmailService.sendPlatformEmail({
            to: user.email,
            subject: 'Restablece tu contraseña',
            html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#1f2937">
                <h2 style="color:#17458F">Restablece tu contraseña</h2>
                <p>Recibimos una solicitud para restablecer la contraseña con la que entras al panel.</p>
                <p><a href="${link}" style="display:inline-block;background:#17458F;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold">Crear una contraseña nueva</a></p>
                <p style="font-size:13px;color:#6b7280">El enlace vence en 2 horas y sólo se puede usar una vez. Si no fuiste tú, puedes ignorar este correo: tu contraseña no ha cambiado.</p>
            </div>`,
            text: `Restablece tu contraseña: ${link}\nEl enlace vence en 2 horas.`,
        }).catch(err => console.error('[auth] correo de recuperación:', err?.message));

        res.json(generic);
    } catch (error) {
        console.error('[auth] forgotPassword:', error?.message);
        res.json(generic);
    }
};

/** POST /api/auth/reset */
export const resetPassword = async (req, res) => {
    try {
        const token = String(req.body?.token || '');
        const password = String(req.body?.password || '');
        const confirm = String(req.body?.passwordConfirm ?? req.body?.confirmPassword ?? '');

        if (password.length < PASSWORD_MIN) {
            return res.status(400).json({ error: `La contraseña debe tener al menos ${PASSWORD_MIN} caracteres.` });
        }
        if (confirm && confirm !== password) {
            return res.status(400).json({ error: 'Las dos contraseñas no coinciden.' });
        }

        const jwtLib = await getJwt();
        let payload;
        try { payload = jwtLib.verify(token, JWT_SECRET); }
        catch { return res.status(400).json({ error: 'El enlace venció o no es válido.' }); }
        if (payload?.purpose !== RESET_PURPOSE) {
            return res.status(400).json({ error: 'Enlace no válido.' });
        }

        // ⚠️ La firma NO alcanza: se comprueba contra la fila guardada, así que
        // un enlace ya usado —o uno emitido antes de otro más nuevo— deja de
        // servir. Con la firma sola, un enlace filtrado valdría sus dos horas
        // completas aunque el dueño ya hubiera cambiado la contraseña.
        const consumido = await consumeResetToken(payload.sub, token);
        if (!consumido.ok) {
            return res.status(400).json({ error: 'El enlace ya fue usado o venció.' });
        }

        const bcryptLib = await getBcrypt();
        const hash = await bcryptLib.hash(password, 10);
        const { rows } = await db.query(
            'UPDATE "User" SET password = $1, "updatedAt" = NOW() WHERE id = $2 RETURNING id, email, role, "clubId"',
            [hash, payload.sub]
        );
        const user = rows[0];
        if (!user) return res.status(400).json({ error: 'Enlace no válido.' });

        // La contraseña la puso su dueño: deja de ser temporal.
        await markPasswordSet(user.id, { temporary: false });
        await audit('password_reset', {
            clubId: user.clubId, userId: user.id, email: user.email,
            actor: { kind: 'self', id: user.id }, detail: 'contraseña restablecida', req,
        });

        res.json({ success: true, message: 'Tu contraseña quedó actualizada. Ya puedes iniciar sesión.' });
    } catch (error) {
        console.error('[auth] resetPassword:', error?.message);
        res.status(500).json({ error: 'No pudimos restablecer la contraseña.' });
    }
};

export const createInitialAdmin = async () => {
    try {
        const bcryptLib = await getBcrypt();
        let clubResult = await db.query('SELECT * FROM "Club" LIMIT 1');
        let club = clubResult.rows[0];

        if (!club) {
            const insertClub = await db.query(
                `INSERT INTO "Club" (id, name, city, country, district, domain, subdomain, status, "createdAt", "updatedAt")
                 VALUES (gen_random_uuid(), 'Rotary Club Origen', 'Bogotá', 'Colombia', '4281', 'localhost', 'origen', 'active', NOW(), NOW())
                 RETURNING *`
            );
            club = insertClub.rows[0];
        }

        const superEmail = 'admin@rotary.org';
        const superPass = await bcryptLib.hash('admin123', 10);
        await db.query(
            `INSERT INTO "User" (id, email, password, role, "createdAt", "updatedAt")
             VALUES (gen_random_uuid(), $1, $2, 'administrator', NOW(), NOW())
             ON CONFLICT (email) DO UPDATE SET password = $2, role = 'administrator'`,
            [superEmail, superPass]
        );

        const clubEmail = 'club@rotary.org';
        const clubPass = await bcryptLib.hash('club123', 10);
        await db.query(
            `INSERT INTO "User" (id, email, password, role, "clubId", "createdAt", "updatedAt")
             VALUES (gen_random_uuid(), $1, $2, 'club_admin', $3, NOW(), NOW())
             ON CONFLICT (email) DO UPDATE SET password = $2, role = 'club_admin', "clubId" = $3`,
            [clubEmail, clubPass, club.id]
        );

        console.log('Auth credentials ensured');
    } catch (err) {
        console.error('Initial setup error:', err.message);
    }
};

export const impersonate = async (req, res) => {
    try {
        const { targetId, type = 'club' } = req.body;
        
        // Ensure requester is an actual administrator
        if (req.user.role !== 'administrator') {
            return res.status(403).json({ error: 'Forbidden. Solo los super administradores pueden usar la simulación.' });
        }

        if (type === 'district') {
            const distResult = await db.query('SELECT id, name, subdomain, number FROM "District" WHERE id = $1', [targetId]);
            const district = distResult.rows[0];
            if (!district) return res.status(404).json({ error: 'Distrito no encontrado' });

            // Buscar si hay un Club espejo para el Distrito
            const clubRes = await db.query("SELECT id FROM \"Club\" WHERE type = 'district' AND district = $1 LIMIT 1", [String(district.number)]);
            const mirrorClubId = clubRes.rows[0]?.id || null;

            const jwtLib = await getJwt();
            const token = jwtLib.sign(
                { id: req.user.id, email: req.user.email, role: 'district_admin', districtId: district.id, clubId: mirrorClubId, aud: PLATFORM_AUDIENCE },
                JWT_SECRET,
                { expiresIn: '3h' }
            );

            return res.json({
                token,
                user: {
                    id: req.user.id,
                    email: req.user.email,
                    role: 'district_admin',
                    districtId: district.id,
                    clubId: mirrorClubId,
                    district: { id: district.id, name: district.name, subdomain: district.subdomain }
                }
            });
        }

        // Validate the target club exists
        const clubResult = await db.query('SELECT id, name, subdomain FROM "Club" WHERE id = $1', [targetId]);
        const club = clubResult.rows[0];

        if (!club) {
            return res.status(404).json({ error: 'Club no encontrado' });
        }

        // Generate a synthetic token
        // Use the same user ID/Email but force role to 'club_admin' and assign the clubId
        const jwtLib = await getJwt();
        const token = jwtLib.sign(
            { id: req.user.id, email: req.user.email, role: 'club_admin', clubId: club.id, aud: PLATFORM_AUDIENCE },
            JWT_SECRET,
            { expiresIn: '3h' }
        );

        res.json({
            token,
            user: {
                id: req.user.id,
                email: req.user.email,
                role: 'club_admin',
                clubId: club.id,
                club: { id: club.id, name: club.name, subdomain: club.subdomain }
            }
        });
    } catch (err) {
        console.error('Impersonate error:', err.message);
        res.status(500).json({ error: 'Server error al simular sesión' });
    }
};

export default {
    login, createInitialAdmin, impersonate, authenticatePlatform, platformRedirect,
    forgotPassword, resetPassword, guardLoginAttempt, noteLoginResult,
};
