// ════════════════════════════════════════════════════════════════════
// Asistente al Evento — identidad y panel propio — v4.655.0
//
// Tercera identidad del sitio, hermana de las dos que ya existían:
//
//   • `User`                 → administra el sitio      → /admin/dashboard
//   • `ProjectFairAccount`   → gestiona su proyecto     → /mi-proyecto
//   • `EventAttendeeAccount` → consulta su inscripción  → /mi-inscripcion
//
// SEGURIDAD — se copia deliberadamente la arquitectura del Gestor de Proyectos
// (`projectFairPortalController.js`) porque ya resolvió estos problemas:
//
//   - La cuenta NO vive en la tabla `User`: un asistente no puede alcanzar
//     `/api/admin/*` ni escribiendo la URL a mano.
//   - El token lleva audiencia propia (`event-attendee-portal`). Las tres
//     identidades comparten `JWT_SECRET`, así que la audiencia es lo único que
//     impide que el token de una sirva en las rutas de otra. Nunca quitarla.
//   - Los permisos son PROPIOS (`ATTENDEE_PERMISSIONS`), no los del Gestor de
//     Proyectos: un asistente sólo lee su inscripción y su perfil. Reutilizar
//     los permisos de proyectos le habría dado acceso a formularios y
//     documentos que no le corresponden.
//
// AISLAMIENTO DE DATOS: toda consulta de este archivo filtra por
// `"accountId" = <la cuenta del token>`. No hay un solo endpoint que reciba un
// id de inscripción y lo devuelva sin comprobar esa pertenencia.
//
// UNA CUENTA POR CORREO, no una por inscripción: quien vuelva en la XIII
// edición entra con la misma clave y ve su historial separado por evento. Es
// la diferencia con `ProjectFairAccount`, que es 1:1 con la postulación.
// ════════════════════════════════════════════════════════════════════
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from '../lib/db.js';
import EmailService from '../services/EmailService.js';
import { ensureEventRegistrationSchema } from '../lib/ensureEventRegistrationSchema.js';
import { PASSWORD_MIN, statusMeta } from '../lib/eventRegistrationSpec.js';
import { SHORT_SESSION_TTL } from '../middleware/auth.js';
import {
    clean, isEmail, parseJson, asNumber,
    listCompanions, listHistory, listMessages, listPayments,
} from '../lib/eventRegistrationStore.js';

console.log('[eventAttendeeController] v4.655.0 cargado — rol "Asistente al Evento": cuenta propia por correo, panel de sólo lectura de su inscripción y auditoría de ingresos.');

const JWT_SECRET = process.env.JWT_SECRET || 'rotary_secret_key_2026';
/** Audiencia propia: un token de plataforma o del panel del club no sirve aquí. */
export const ATTENDEE_AUDIENCE = 'event-attendee-portal';
const TOKEN_TTL = '30d';
const PLATFORM_SENDER = '"Registro de eventos" <noreply@clubplatform.org>';

/** Ruta del panel. Se calcula en el servidor y el navegador la obedece. */
export const ATTENDEE_PATH = '/mi-inscripcion';

// Hash imposible de acertar. Marca una cuenta creada por el sistema (al
// confirmarse un pago de una inscripción que se envió sin contraseña) que
// todavía no tiene una elegida por la persona. No se puede iniciar sesión con
// ella: sólo entrar por el enlace de recuperación.
const UNUSABLE_HASH = '!';

export const ATTENDEE_ROLES = {
    ATTENDEE: 'event_attendee',
    SUSPENDED: 'event_attendee_suspended',
};

export const ROLE_LABELS = {
    [ATTENDEE_ROLES.ATTENDEE]: 'Asistente al Evento',
    [ATTENDEE_ROLES.SUSPENDED]: 'Asistente al Evento (suspendido)',
};

/**
 * Permisos propios del asistente. Son deliberadamente distintos de los del
 * Gestor de Proyectos: describen "consultar lo mío" y nada más. Si algún día
 * el asistente puede editar algo (cambiar su teléfono, agregar un
 * acompañante), se agrega el permiso aquí y se exige en la ruta.
 */
export const ATTENDEE_PERMISSIONS = {
    VIEW_OWN_REGISTRATION: 'event_registration:read_own',
    VIEW_OWN_PROFILE: 'event_attendee_profile:read_own',
    UPDATE_OWN_PROFILE: 'event_attendee_profile:update_own',
};

const ROLE_PERMISSIONS = {
    [ATTENDEE_ROLES.ATTENDEE]: [
        ATTENDEE_PERMISSIONS.VIEW_OWN_REGISTRATION,
        ATTENDEE_PERMISSIONS.VIEW_OWN_PROFILE,
        ATTENDEE_PERMISSIONS.UPDATE_OWN_PROFILE,
    ],
    // Una cuenta suspendida conserva la lectura de su propia inscripción —
    // necesita ver por qué quedó así— pero no puede modificar nada.
    [ATTENDEE_ROLES.SUSPENDED]: [
        ATTENDEE_PERMISSIONS.VIEW_OWN_REGISTRATION,
        ATTENDEE_PERMISSIONS.VIEW_OWN_PROFILE,
    ],
};

export const permissionsFor = (role) =>
    ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS[ATTENDEE_ROLES.ATTENDEE];

/**
 * Verificación de correo. Está apagada por defecto: encenderla obliga a que el
 * asistente confirme el correo antes de entrar al panel, y eso sólo tiene
 * sentido si el envío de correo del sitio está sano.
 */
export const emailVerificationEnabled = () =>
    String(process.env.EVENT_ATTENDEE_EMAIL_VERIFICATION || '').toLowerCase() === 'true';

const signToken = (account, { remember = true } = {}) => jwt.sign(
    {
        sub: account.id,
        email: account.email,
        role: account.role || ATTENDEE_ROLES.ATTENDEE,
        aud: ATTENDEE_AUDIENCE,
    },
    JWT_SECRET,
    { expiresIn: remember ? TOKEN_TTL : SHORT_SESSION_TTL }
);

// ── Auditoría de ingresos ────────────────────────────────────────────

const clientIp = (req) => clean(
    (req?.headers?.['x-forwarded-for'] || '').split(',')[0].trim()
    || req?.socket?.remoteAddress || '', 60);

/**
 * Deja constancia de un intento de ingreso. Nunca lanza: una auditoría que
 * falle no puede impedir que alguien entre a su panel, pero sí tiene que
 * quedar en el log del servidor para que se note.
 */
export const auditLogin = async (req, { accountId = null, email = null, outcome, detail = null }) => {
    try {
        await db.query(
            `INSERT INTO "EventAttendeeLogin" ("accountId", email, outcome, ip, "userAgent", detail)
             VALUES ($1,$2,$3,$4,$5,$6)`,
            [
                accountId, email ? String(email).toLowerCase().slice(0, 200) : null,
                clean(outcome, 30), clientIp(req),
                clean(req?.headers?.['user-agent'] || '', 300), detail ? clean(detail, 500) : null,
            ]);
    } catch (error) {
        console.error('[event-attendee] auditoría de ingreso:', error?.message);
    }
};

// ── Cuenta ───────────────────────────────────────────────────────────

export const findAccountByEmail = async (email) => {
    const mail = clean(email, 200).toLowerCase();
    if (!isEmail(mail)) return null;
    const { rows } = await db.query(
        'SELECT * FROM "EventAttendeeAccount" WHERE lower(email) = $1 LIMIT 1', [mail]);
    return rows[0] || null;
};

/**
 * Crea la cuenta del asistente o devuelve la que ya existe para ese correo.
 *
 * Nunca crea una segunda cuenta con el mismo correo — ese es el requisito
 * central: una persona, una cuenta, aunque se inscriba en varias ediciones.
 * Cuando la cuenta ya existe, la contraseña que venga en el formulario **no**
 * la reemplaza: se comprueba contra la guardada. Sin eso, cualquiera que
 * conociera un correo podría sobrescribir su clave inscribiéndose de nuevo.
 *
 * @returns {Promise<{account?, created?:boolean, linked?:boolean, conflict?:string}>}
 *   `conflict` es un código: 'password' (existe y la clave no coincide) o
 *   'needs_password' (existe pero nunca eligió contraseña).
 */
export const ensureAttendeeAccount = async ({ email, password, firstName, lastName, phone }) => {
    await ensureEventRegistrationSchema();
    const mail = clean(email, 200).toLowerCase();
    if (!isEmail(mail)) return { conflict: 'email' };

    const existing = await findAccountByEmail(mail);

    if (existing) {
        if (existing.passwordHash === UNUSABLE_HASH) {
            // La cuenta la creó el sistema y todavía no tiene clave elegida.
            // La que acaba de escribir la persona sirve para estrenarla.
            if (password && String(password).length >= PASSWORD_MIN) {
                const passwordHash = await bcrypt.hash(String(password), 10);
                const { rows } = await db.query(
                    `UPDATE "EventAttendeeAccount"
                        SET "passwordHash" = $1, "firstName" = COALESCE(NULLIF($2,''), "firstName"),
                            "lastName" = COALESCE(NULLIF($3,''), "lastName"),
                            phone = COALESCE(NULLIF($4,''), phone), "updatedAt" = NOW()
                      WHERE id = $5 RETURNING *`,
                    [passwordHash, clean(firstName, 120), clean(lastName, 120), clean(phone, 60), existing.id]);
                return { account: rows[0], linked: true };
            }
            return { conflict: 'needs_password' };
        }

        const matches = password
            ? await bcrypt.compare(String(password), existing.passwordHash).catch(() => false)
            : false;
        if (!matches) return { conflict: 'password' };

        // Credenciales correctas: se vincula la inscripción nueva a la cuenta
        // de siempre y se refrescan los datos de contacto.
        const { rows } = await db.query(
            `UPDATE "EventAttendeeAccount"
                SET "firstName" = COALESCE(NULLIF($1,''), "firstName"),
                    "lastName" = COALESCE(NULLIF($2,''), "lastName"),
                    phone = COALESCE(NULLIF($3,''), phone), "updatedAt" = NOW()
              WHERE id = $4 RETURNING *`,
            [clean(firstName, 120), clean(lastName, 120), clean(phone, 60), existing.id]);
        return { account: rows[0] || existing, linked: true };
    }

    if (!password || String(password).length < PASSWORD_MIN) return { conflict: 'weak' };

    const passwordHash = await bcrypt.hash(String(password), 10);
    try {
        const { rows } = await db.query(
            `INSERT INTO "EventAttendeeAccount" (email, "passwordHash", "firstName", "lastName", phone, role)
             VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
            [mail, passwordHash, clean(firstName, 120), clean(lastName, 120), clean(phone, 60), ATTENDEE_ROLES.ATTENDEE]);
        return { account: rows[0], created: true };
    } catch (error) {
        // Carrera contra otra pestaña que insertó el mismo correo: se devuelve
        // la que ganó en vez de fallar.
        if (error?.code === '23505') {
            const again = await findAccountByEmail(mail);
            if (again) return { account: again, linked: true };
        }
        console.error('[event-attendee] no pude crear la cuenta:', error?.message);
        return { conflict: 'error' };
    }
};

/**
 * Cuenta de una inscripción ya pagada que quedó sin ella (inscripciones
 * anteriores a v4.655, o un envío sin contraseña). Se crea sin clave utilizable
 * y la persona la estrena por "olvidé mi contraseña": el pago ya demostró que
 * ese correo es suyo. Devuelve null si algo falla — nunca interrumpe el cobro.
 */
export const ensurePendingAccountFor = async (registration) => {
    if (!registration?.email) return null;
    const existing = await findAccountByEmail(registration.email);
    if (existing) return existing;
    try {
        const { rows } = await db.query(
            `INSERT INTO "EventAttendeeAccount" (email, "passwordHash", "firstName", "lastName", phone, role)
             VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
            [
                String(registration.email).toLowerCase(), UNUSABLE_HASH,
                clean(registration.firstName, 120), clean(registration.lastName, 120),
                clean(registration.phone, 60), ATTENDEE_ROLES.ATTENDEE,
            ]);
        return rows[0];
    } catch (error) {
        console.error('[event-attendee] cuenta pendiente:', error?.message);
        return null;
    }
};

/**
 * Ata la inscripción a la cuenta. El vínculo completo que pide el panel
 * —usuario, evento, categoría e inscripción— queda con esto: la fila ya lleva
 * `eventId` y `categoryKey`, y ahora también a quién pertenece.
 */
export const linkRegistrationToAccount = async (registrationId, accountId) => {
    if (!registrationId || !accountId) return false;
    const { rowCount } = await db.query(
        `UPDATE "EventRegistration" SET "accountId" = $1, "updatedAt" = NOW()
          WHERE id = $2 AND ("accountId" IS NULL OR "accountId" = $1)`,
        [accountId, registrationId]);
    return rowCount > 0;
};

/**
 * Vincula por correo las inscripciones de un evento que todavía no tengan
 * cuenta. Se usa al confirmarse un pago: la inscripción pudo crearse antes de
 * que existiera la cuenta.
 */
export const attachOrphanRegistrations = async (account) => {
    if (!account?.id || !account?.email) return 0;
    const { rowCount } = await db.query(
        `UPDATE "EventRegistration" SET "accountId" = $1, "updatedAt" = NOW()
          WHERE "accountId" IS NULL AND lower(email) = $2`,
        [account.id, String(account.email).toLowerCase()]);
    return rowCount;
};

// ── Middleware ───────────────────────────────────────────────────────

/** Exige un token emitido para ESTA audiencia. */
export const attendeeAuth = async (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Inicia sesión para consultar tu inscripción.' });
    try {
        const payload = jwt.verify(token, JWT_SECRET, { audience: ATTENDEE_AUDIENCE });
        await ensureEventRegistrationSchema();
        const { rows } = await db.query('SELECT * FROM "EventAttendeeAccount" WHERE id = $1 LIMIT 1', [payload.sub]);
        const account = rows[0];
        if (!account) return res.status(401).json({ error: 'Tu sesión ya no es válida. Vuelve a ingresar.' });
        // El rol se lee de la base, no del token: una suspensión tiene efecto
        // de inmediato y no espera a que caduque la sesión.
        req.attendee = { ...payload, account, role: account.role || ATTENDEE_ROLES.ATTENDEE };
        next();
    } catch {
        res.status(401).json({ error: 'Tu sesión expiró. Vuelve a ingresar.' });
    }
};

/** Exige un permiso concreto del asistente. */
export const requireAttendeePermission = (permission) => (req, res, next) => {
    const granted = permissionsFor(req.attendee?.role);
    if (!granted.includes(permission)) {
        return res.status(403).json({ error: 'Tu cuenta no tiene permiso para esta acción.' });
    }
    next();
};

// ── Sesión ───────────────────────────────────────────────────────────

/** Cuántas inscripciones tiene la cuenta y a qué ruta entra. */
export const describeAttendeeSession = async (account) => {
    const { rows } = await db.query(
        `SELECT r.id, r."eventId", r."publicRef", r."registrationCode", r.status,
                r."categoryKey", r."categoryLabel", e.title AS "eventTitle"
           FROM "EventRegistration" r
           LEFT JOIN "CalendarEvent" e ON e.id = r."eventId"
          WHERE r."accountId" = $1
          ORDER BY r."createdAt" DESC`, [account.id]);
    const role = account.role || ATTENDEE_ROLES.ATTENDEE;
    return {
        realm: 'attendee',
        role,
        roleLabel: ROLE_LABELS[role] || ROLE_LABELS[ATTENDEE_ROLES.ATTENDEE],
        permissions: permissionsFor(role),
        registrations: rows.map(r => ({
            id: r.id, eventId: r.eventId, eventTitle: r.eventTitle,
            publicRef: r.publicRef, registrationCode: r.registrationCode,
            status: r.status, categoryKey: r.categoryKey, categoryLabel: r.categoryLabel,
        })),
        redirect: ATTENDEE_PATH,
        needsPassword: !account.passwordHash || account.passwordHash === UNUSABLE_HASH,
        emailVerificationRequired: emailVerificationEnabled(),
        emailVerified: Boolean(account.emailVerifiedAt),
    };
};

/**
 * Comprueba credenciales contra la identidad del asistente.
 * Mismo resultado para correo inexistente y contraseña incorrecta: no se
 * revela qué correos están registrados.
 */
export const authenticateAttendee = async (email, password, req = null, { remember = true } = {}) => {
    await ensureEventRegistrationSchema();
    const mail = clean(email, 200).toLowerCase();
    if (!isEmail(mail) || !password) return { ok: false };

    const account = await findAccountByEmail(mail);
    if (account && account.passwordHash === UNUSABLE_HASH) {
        await auditLogin(req, { accountId: account.id, email: mail, outcome: 'needs_password' });
        return { ok: false, needsPassword: true };
    }

    const ok = account && await bcrypt.compare(String(password), account.passwordHash).catch(() => false);
    if (!ok) {
        if (account) await auditLogin(req, { accountId: account.id, email: mail, outcome: 'bad_password' });
        return { ok: false };
    }

    await db.query('UPDATE "EventAttendeeAccount" SET "lastLoginAt" = NOW() WHERE id = $1', [account.id]);
    await auditLogin(req, { accountId: account.id, email: mail, outcome: 'success' });
    return { ok: true, account, token: signToken(account, { remember }) };
};

// POST /portal/login — entrada directa al panel del asistente.
export const login = async (req, res) => {
    try {
        const email = clean(req.body?.email, 200).toLowerCase();
        const password = String(req.body?.password || '');
        if (!isEmail(email) || !password) {
            return res.status(400).json({ error: 'Ingresa tu correo y contraseña.' });
        }

        const result = await authenticateAttendee(email, password, req, { remember: req.body?.remember !== false });
        if (result.needsPassword) {
            return res.status(409).json({
                error: 'Tu inscripción está registrada pero aún no tiene contraseña. Usa "Olvidé mi contraseña" para crear una.',
                needsPassword: true,
            });
        }
        if (!result.ok) return res.status(401).json({ error: 'Correo o contraseña incorrectos.' });

        const session = await describeAttendeeSession(result.account);
        res.json({ token: result.token, email: result.account.email, ...session });
    } catch (error) {
        console.error('[event-attendee] login:', error);
        res.status(500).json({ error: 'No pudimos iniciar sesión.' });
    }
};

// ── Recuperación de contraseña ───────────────────────────────────────

// POST /portal/forgot
export const forgotPassword = async (req, res) => {
    // Respuesta idéntica exista o no la cuenta: no se revela qué correos hay.
    const generic = {
        success: true,
        message: 'Si el correo está registrado, recibirás un enlace para restablecer tu contraseña.',
    };
    try {
        await ensureEventRegistrationSchema();
        const email = clean(req.body?.email, 200).toLowerCase();
        if (!isEmail(email)) return res.json(generic);

        let account = await findAccountByEmail(email);

        // Sin cuenta pero con inscripción: quedó sin forma de entrar. Se le crea
        // y se le manda el enlace, en vez de dejarlo en un callejón sin salida.
        if (!account) {
            const { rows } = await db.query(
                `SELECT * FROM "EventRegistration" WHERE lower(email) = $1 ORDER BY "createdAt" DESC LIMIT 1`, [email]);
            if (!rows[0]) return res.json(generic);
            account = await ensurePendingAccountFor(rows[0]);
            if (!account) return res.json(generic);
            await attachOrphanRegistrations(account);
        }

        const token = jwt.sign({ sub: account.id, purpose: 'attendee_reset' }, JWT_SECRET, { expiresIn: '2h' });
        await db.query(
            `UPDATE "EventAttendeeAccount" SET "resetToken" = $1, "resetExpiry" = NOW() + interval '2 hours' WHERE id = $2`,
            [token, account.id]);
        await auditLogin(req, { accountId: account.id, email, outcome: 'reset_requested' });

        const origin = req.headers.origin || 'https://app.clubplatform.org';
        const link = `${origin}${ATTENDEE_PATH}?reset=${encodeURIComponent(token)}`;
        await EmailService.sendPlatformEmail({
            to: account.email, from: PLATFORM_SENDER,
            subject: 'Restablece tu contraseña — Inscripción al evento',
            html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#1f2937">
                <h2 style="color:#17458F">Restablece tu contraseña</h2>
                <p>Recibimos una solicitud para restablecer la contraseña con la que consultas tu inscripción.</p>
                <p><a href="${link}" style="display:inline-block;background:#17458F;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold">Crear una contraseña nueva</a></p>
                <p style="font-size:13px;color:#6b7280">El enlace vence en 2 horas. Si no fuiste tú, puedes ignorar este correo.</p>
            </div>`,
        }).catch(err => console.error('[event-attendee] correo de recuperación:', err?.message));

        res.json(generic);
    } catch (error) {
        console.error('[event-attendee] forgotPassword:', error);
        res.json(generic);
    }
};

// POST /portal/reset
export const resetPassword = async (req, res) => {
    try {
        await ensureEventRegistrationSchema();
        const token = clean(req.body?.token, 2000);
        const password = String(req.body?.password || '');
        if (password.length < PASSWORD_MIN) {
            return res.status(400).json({ error: `La contraseña debe tener al menos ${PASSWORD_MIN} caracteres.` });
        }

        let payload;
        try { payload = jwt.verify(token, JWT_SECRET); }
        catch { return res.status(400).json({ error: 'El enlace venció o no es válido.' }); }
        if (payload?.purpose !== 'attendee_reset') return res.status(400).json({ error: 'Enlace no válido.' });

        const { rows } = await db.query(
            `SELECT * FROM "EventAttendeeAccount"
              WHERE id = $1 AND "resetToken" = $2 AND "resetExpiry" > NOW() LIMIT 1`,
            [payload.sub, token]);
        const account = rows[0];
        if (!account) return res.status(400).json({ error: 'El enlace ya fue usado o venció.' });

        const passwordHash = await bcrypt.hash(password, 10);
        const { rows: updated } = await db.query(
            `UPDATE "EventAttendeeAccount"
                SET "passwordHash" = $1, "resetToken" = NULL, "resetExpiry" = NULL, "updatedAt" = NOW()
              WHERE id = $2 RETURNING *`, [passwordHash, account.id]);

        await attachOrphanRegistrations(updated[0]);
        await auditLogin(req, { accountId: account.id, email: account.email, outcome: 'reset_completed' });

        const session = await describeAttendeeSession(updated[0]);
        res.json({ token: signToken(updated[0]), email: updated[0].email, ...session });
    } catch (error) {
        console.error('[event-attendee] resetPassword:', error);
        res.status(500).json({ error: 'No pudimos restablecer la contraseña.' });
    }
};

// ── Verificación de correo (cuando está habilitada) ──────────────────

export const sendVerificationEmail = async (account, origin) => {
    if (!emailVerificationEnabled() || !account || account.emailVerifiedAt) return;
    const token = jwt.sign({ sub: account.id, purpose: 'attendee_verify' }, JWT_SECRET, { expiresIn: '7d' });
    await db.query('UPDATE "EventAttendeeAccount" SET "verificationToken" = $1 WHERE id = $2', [token, account.id]);
    const link = `${origin || 'https://app.clubplatform.org'}${ATTENDEE_PATH}?verificar=${encodeURIComponent(token)}`;
    await EmailService.sendPlatformEmail({
        to: account.email, from: PLATFORM_SENDER,
        subject: 'Confirma tu correo — Inscripción al evento',
        html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#1f2937">
            <h2 style="color:#17458F">Confirma tu correo</h2>
            <p>Confirma esta dirección para consultar el estado de tu inscripción.</p>
            <p><a href="${link}" style="display:inline-block;background:#17458F;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold">Confirmar mi correo</a></p>
        </div>`,
    }).catch(err => console.error('[event-attendee] correo de verificación:', err?.message));
};

// POST /portal/verify
export const verifyEmail = async (req, res) => {
    try {
        await ensureEventRegistrationSchema();
        const token = clean(req.body?.token, 2000);
        let payload;
        try { payload = jwt.verify(token, JWT_SECRET); }
        catch { return res.status(400).json({ error: 'El enlace venció o no es válido.' }); }
        if (payload?.purpose !== 'attendee_verify') return res.status(400).json({ error: 'Enlace no válido.' });

        const { rows } = await db.query(
            `UPDATE "EventAttendeeAccount"
                SET "emailVerifiedAt" = COALESCE("emailVerifiedAt", NOW()),
                    "verificationToken" = NULL, "updatedAt" = NOW()
              WHERE id = $1 AND "verificationToken" = $2 RETURNING *`,
            [payload.sub, token]);
        if (!rows[0]) return res.status(400).json({ error: 'El enlace ya fue usado o venció.' });
        res.json({ verified: true, token: signToken(rows[0]), email: rows[0].email });
    } catch (error) {
        console.error('[event-attendee] verifyEmail:', error);
        res.status(500).json({ error: 'No pudimos confirmar tu correo.' });
    }
};

// ── Panel del asistente ──────────────────────────────────────────────

/**
 * Vista de una inscripción para su propio titular. Deja fuera todo lo interno
 * —notas del equipo, identificadores de Stripe, etiquetas de segmentación— y
 * deja dentro lo que la persona necesita para hacerle seguimiento.
 */
const toAttendeeView = (row, { companions = [], history = [], messages = [], payments = [], event = null }) => {
    const status = statusMeta(row.status);
    return {
        id: row.id,
        eventId: row.eventId,
        event: event ? {
            id: event.id, title: event.title, slug: event.slug,
            startDate: event.startDate, endDate: event.endDate, location: event.location,
        } : null,
        publicRef: row.publicRef,
        registrationCode: row.registrationCode,
        status: row.status,
        statusLabel: status.label,
        statusDescription: status.description || null,
        settled: Boolean(status.settled),
        categoryKey: row.categoryKey,
        categoryLabel: row.categoryLabel,
        audience: row.audience,
        firstName: row.firstName,
        lastName: row.lastName,
        email: row.email,
        phone: row.phone,
        answers: parseJson(row.answers, {}),
        pricing: parseJson(row.pricing, {}),
        baseCurrency: row.baseCurrency,
        baseAmount: asNumber(row.baseAmount),
        chargeCurrency: row.chargeCurrency,
        chargeAmount: asNumber(row.chargeAmount),
        fxRate: asNumber(row.fxRate),
        companionsCount: row.companionsCount || 0,
        companionsAmount: asNumber(row.companionsAmount),
        companions,
        receiptUrl: row.receiptUrl,
        paymentMethod: row.paymentMethod,
        refundedAt: row.refundedAt,
        refundedAmount: asNumber(row.refundedAmount),
        // `notes` son las observaciones que la propia persona escribió en el
        // formulario. `internalNotes` es del equipo y NO viaja hasta aquí.
        notes: row.notes,
        checkedInAt: row.checkedInAt,
        registeredAt: row.submittedAt || row.createdAt,
        paidAt: row.paidAt,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        payments,
        messages,
        history,
    };
};

/** Las inscripciones de la cuenta, agrupadas por evento. */
const loadOwnRegistrations = async (accountId) => {
    const { rows } = await db.query(
        `SELECT r.*, e.title AS "eventTitle", e.slug AS "eventSlug",
                e."startDate" AS "eventStart", e."endDate" AS "eventEnd", e.location AS "eventLocation"
           FROM "EventRegistration" r
           LEFT JOIN "CalendarEvent" e ON e.id = r."eventId"
          WHERE r."accountId" = $1
          ORDER BY COALESCE(e."startDate", r."createdAt") DESC, r."createdAt" DESC`,
        [accountId]);
    return rows;
};

// GET /portal/me
export const getPortalData = async (req, res) => {
    try {
        await ensureEventRegistrationSchema();
        const account = req.attendee.account;
        const rows = await loadOwnRegistrations(account.id);

        const registrations = [];
        for (const row of rows) {
            registrations.push(toAttendeeView(row, {
                companions: await listCompanions(row.id),
                event: {
                    id: row.eventId, title: row.eventTitle, slug: row.eventSlug,
                    startDate: row.eventStart, endDate: row.eventEnd, location: row.eventLocation,
                },
            }));
        }

        res.json({
            realm: 'attendee',
            role: req.attendee.role,
            roleLabel: ROLE_LABELS[req.attendee.role] || ROLE_LABELS[ATTENDEE_ROLES.ATTENDEE],
            permissions: permissionsFor(req.attendee.role),
            profile: {
                id: account.id,
                email: account.email,
                firstName: account.firstName,
                lastName: account.lastName,
                phone: account.phone,
                emailVerified: Boolean(account.emailVerifiedAt),
                emailVerificationRequired: emailVerificationEnabled(),
                lastLoginAt: account.lastLoginAt,
                createdAt: account.createdAt,
            },
            // Historial separado por evento: cada edición es su propia entrada.
            registrations,
        });
    } catch (error) {
        console.error('[event-attendee] getPortalData:', error);
        res.status(500).json({ error: 'No pudimos cargar tu inscripción.' });
    }
};

// GET /portal/registrations/:id — ficha completa de UNA inscripción propia.
export const getOwnRegistration = async (req, res) => {
    try {
        await ensureEventRegistrationSchema();
        const accountId = req.attendee.account.id;
        // El filtro por `accountId` va en el WHERE, no en una comprobación
        // posterior: una inscripción ajena no llega a leerse siquiera.
        const { rows } = await db.query(
            `SELECT r.*, e.title AS "eventTitle", e.slug AS "eventSlug",
                    e."startDate" AS "eventStart", e."endDate" AS "eventEnd", e.location AS "eventLocation"
               FROM "EventRegistration" r
               LEFT JOIN "CalendarEvent" e ON e.id = r."eventId"
              WHERE r.id = $1 AND r."accountId" = $2 LIMIT 1`,
            [clean(req.params.id, 60), accountId]);
        const row = rows[0];
        if (!row) return res.status(404).json({ error: 'No encontramos esa inscripción en tu cuenta.' });

        // Del historial se muestra el rastro de estados y acreditación; los
        // apuntes internos del equipo se quedan en el panel administrativo.
        const history = (await listHistory(row.id))
            .filter(h => !String(h.type || '').startsWith('note'))
            .map(h => ({
                id: h.id, type: h.type, fromStatus: h.fromStatus, toStatus: h.toStatus,
                comment: h.comment, createdAt: h.createdAt,
            }));
        const messages = (await listMessages(row.id)).map(m => ({
            id: m.id, channel: m.channel, subject: m.subject,
            status: m.status, createdAt: m.createdAt,
        }));
        const payments = (await listPayments(row.id)).map(p => ({
            id: p.id, status: p.status, amount: asNumber(p.amount), currency: p.currency,
            baseAmount: asNumber(p.baseAmount), baseCurrency: p.baseCurrency,
            fxRate: asNumber(p.fxRate), paymentMethod: p.paymentMethod,
            receiptUrl: p.receiptUrl, refundedAmount: asNumber(p.refundedAmount),
            occurredAt: p.occurredAt,
        }));

        res.json(toAttendeeView(row, {
            companions: await listCompanions(row.id),
            history, messages, payments,
            event: {
                id: row.eventId, title: row.eventTitle, slug: row.eventSlug,
                startDate: row.eventStart, endDate: row.eventEnd, location: row.eventLocation,
            },
        }));
    } catch (error) {
        console.error('[event-attendee] getOwnRegistration:', error);
        res.status(500).json({ error: 'No pudimos cargar tu inscripción.' });
    }
};

// PATCH /portal/profile — el asistente corrige sus datos de contacto.
export const updateProfile = async (req, res) => {
    try {
        await ensureEventRegistrationSchema();
        const { rows } = await db.query(
            `UPDATE "EventAttendeeAccount"
                SET "firstName" = COALESCE(NULLIF($1,''), "firstName"),
                    "lastName" = COALESCE(NULLIF($2,''), "lastName"),
                    phone = COALESCE(NULLIF($3,''), phone), "updatedAt" = NOW()
              WHERE id = $4 RETURNING *`,
            [
                clean(req.body?.firstName, 120), clean(req.body?.lastName, 120),
                clean(req.body?.phone, 60), req.attendee.account.id,
            ]);
        const account = rows[0];
        res.json({
            profile: {
                id: account.id, email: account.email,
                firstName: account.firstName, lastName: account.lastName, phone: account.phone,
            },
        });
    } catch (error) {
        console.error('[event-attendee] updateProfile:', error);
        res.status(500).json({ error: 'No pudimos guardar tus datos.' });
    }
};

export default {
    ATTENDEE_ROLES,
    ATTENDEE_PERMISSIONS,
    ATTENDEE_AUDIENCE,
    ATTENDEE_PATH,
    attendeeAuth,
    requireAttendeePermission,
    authenticateAttendee,
    describeAttendeeSession,
    ensureAttendeeAccount,
    ensurePendingAccountFor,
    linkRegistrationToAccount,
    attachOrphanRegistrations,
    sendVerificationEmail,
    login,
    forgotPassword,
    resetPassword,
    verifyEmail,
    getPortalData,
    getOwnRegistration,
    updateProfile,
};
