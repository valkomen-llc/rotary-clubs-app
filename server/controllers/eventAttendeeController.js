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
    listCompanions, listHistory, listMessages, listPayments, recordHistory,
} from '../lib/eventRegistrationStore.js';
import {
    completedStatusMeta, paymentMethodLabel, membershipLabel,
    participantStages, participantHistoryEntry,
} from '../lib/completedRegistrationSpec.js';
import { signedReceiptUrl } from '../lib/completedReceipts.js';

console.log('[eventAttendeeController] v4.1267.0 cargado — rol "Asistente al Evento": cuenta propia por correo, panel de sólo lectura de su inscripción y auditoría de ingresos. Desde v4.1267 también los registros de «Completar inscripción» (COLROTARIOS): misma cuenta, vinculación de lo anterior sólo con el correo demostrado.');

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


// ════════════════════════════════════════════════════════════════════
// Ingreso con una cuenta que ya existe (v4.692)
// ════════════════════════════════════════════════════════════════════
//
// Un rotario que ya postuló un proyecto tiene cuenta, contraseña y perfil. Que
// el formulario del evento le pida inventar OTRA contraseña es trabajo
// repetido y una credencial más que recordar.
//
// La pieza central es `identityFromRequest`: mira el token que traiga el
// navegador —el de la plataforma, el del panel del club o el del propio panel
// del asistente— y devuelve quién es y con qué datos se puede precargar el
// formulario.
//
// DECISIÓN DE ARQUITECTURA: la inscripción sigue perteneciendo SIEMPRE a un
// `EventAttendeeAccount`. Es lo que sostiene el panel, los permisos y el
// aislamiento por `accountId`, y no se toca. Lo nuevo es que esa cuenta puede
// estar VINCULADA a una identidad anterior (`linkedRealm` + `linkedId`), en
// cuyo caso no tiene contraseña propia: se entra con la de siempre. Así no hay
// un usuario duplicado ni una segunda credencial, y el panel sigue funcionando
// exactamente igual.

const PLATFORM_AUDIENCE = 'rotary-platform';
const PORTAL_AUDIENCE = 'project-fair-portal';

/** Realms que pueden reutilizarse para inscribirse a un evento. */
export const LINKABLE_REALMS = ['portal', 'platform', 'attendee'];

export const REALM_LABELS = {
    portal: 'Gestor de Proyectos',
    platform: 'Usuario de la plataforma',
    attendee: 'Asistente al Evento',
};

const decodeFor = (token, audience) => {
    try { return jwt.verify(token, JWT_SECRET, { audience }); }
    catch { return null; }
};

/**
 * Quién viene en la petición, mirando el token que traiga.
 *
 * Se prueban las tres audiencias porque el navegador puede tener cualquiera de
 * las tres sesiones. Devuelve `null` si no hay ninguna válida — nunca lanza:
 * un token vencido no puede romper el formulario público, sólo hace que se
 * ofrezca el flujo normal.
 *
 * @returns {Promise<null | { realm, id, email, name, organization, profile }>}
 */
export const identityFromRequest = async (req) => {
    const raw = String(req?.headers?.authorization || '').split(' ')[1]
        || clean(req?.body?.identityToken, 4000)
        || clean(req?.query?.identityToken, 4000);
    if (!raw) return null;

    await ensureEventRegistrationSchema();

    // 1) Panel del club — el caso que motiva esta función.
    const portal = decodeFor(raw, PORTAL_AUDIENCE);
    if (portal?.sub) {
        const { rows } = await db.query(
            'SELECT * FROM "ProjectFairAccount" WHERE id = $1 LIMIT 1', [portal.sub]);
        const account = rows[0];
        if (!account) return null;
        return {
            realm: 'portal',
            id: account.id,
            email: account.email,
            name: null,                       // lo completa la postulación
            organization: account.clubName || null,
            roleLabel: REALM_LABELS.portal,
            submissionId: account.submissionId || null,
        };
    }

    // 2) Usuario de la plataforma.
    const platform = decodeFor(raw, PLATFORM_AUDIENCE);
    if (platform?.id || platform?.userId || platform?.sub) {
        const id = platform.id || platform.userId || platform.sub;
        const { rows } = await db.query(
            'SELECT id, email, name, phone, "clubId" FROM "User" WHERE id = $1 LIMIT 1', [id]);
        const user = rows[0];
        if (!user) return null;
        return {
            realm: 'platform',
            id: user.id,
            email: user.email,
            name: user.name || null,
            phone: user.phone || null,
            organization: null,
            roleLabel: REALM_LABELS.platform,
        };
    }

    // 3) Asistente que ya se inscribió antes (otra edición, u otra categoría).
    const attendee = decodeFor(raw, ATTENDEE_AUDIENCE);
    if (attendee?.sub) {
        const { rows } = await db.query(
            'SELECT * FROM "EventAttendeeAccount" WHERE id = $1 LIMIT 1', [attendee.sub]);
        const account = rows[0];
        if (!account) return null;
        return {
            realm: 'attendee',
            id: account.id,
            email: account.email,
            name: [account.firstName, account.lastName].filter(Boolean).join(' ') || null,
            phone: account.phone || null,
            organization: null,
            roleLabel: REALM_LABELS.attendee,
        };
    }

    return null;
};

/**
 * Datos con los que se precarga el formulario, buscados en el antecedente más
 * completo que tenga esa persona.
 *
 * Para el Gestor de Proyectos ese antecedente es su postulación, que desde
 * v4.677 guarda país, ciudad, departamento, documento y cargo — justo lo que
 * pide el registro nacional. Para quien ya se inscribió a un evento, sus
 * propias respuestas anteriores.
 *
 * Sólo se devuelven campos con valor: un `''` sobrescribiría lo que el
 * visitante ya hubiera escrito.
 */
export const prefillForIdentity = async (identity) => {
    if (!identity?.email) return {};
    const out = {};
    const put = (key, value) => {
        const v = typeof value === 'string' ? value.trim() : value;
        if (v !== undefined && v !== null && v !== '') out[key] = v;
    };

    put('email', identity.email);
    if (identity.name) {
        const [first, ...rest] = String(identity.name).trim().split(/\s+/);
        put('firstName', first);
        put('lastName', rest.join(' '));
    }
    put('phone', identity.phone);

    // La postulación más reciente de ese correo: el perfil más completo que
    // existe en la plataforma.
    const { rows } = await db.query(
        `SELECT * FROM "ProjectFairSubmission"
          WHERE lower(email) = $1 ORDER BY "createdAt" DESC LIMIT 1`,
        [String(identity.email).toLowerCase()]).catch(() => ({ rows: [] }));
    const s = rows[0];
    if (s) {
        put('firstName', s.firstName);
        put('lastName', s.lastName);
        put('phone', s.phone);
        put('country', s.country);
        put('city', s.city);
        put('department', s.department);
        put('documentType', s.idType);
        put('documentNumber', s.idNumber);
        put('clubName', s.clubName);
        put('district', s.district);
    }

    // Si ya se inscribió antes a un evento, sus respuestas mandan sobre lo
    // anterior: son las más recientes y las del mismo tipo de formulario.
    const previous = await db.query(
        `SELECT answers FROM "EventRegistration"
          WHERE lower(email) = $1 AND answers IS NOT NULL
          ORDER BY "createdAt" DESC LIMIT 1`,
        [String(identity.email).toLowerCase()]).catch(() => ({ rows: [] }));
    const answers = parseJson(previous.rows?.[0]?.answers, {});
    for (const key of ['firstName', 'lastName', 'phone', 'country', 'city', 'department',
        'documentType', 'documentNumber', 'clubName', 'district', 'rotaryRole']) {
        put(key, answers?.[key]);
    }

    return out;
};

/**
 * Cuenta de asistente para una identidad que ya existía.
 *
 * Find-or-create POR CORREO —igual que el resto del módulo— y se marca el
 * vínculo. Si la persona ya tenía cuenta de asistente con contraseña propia,
 * NO se le toca: se respeta la que eligió y sólo se anota el vínculo.
 *
 * Nunca crea una segunda cuenta para el mismo correo, que es justamente lo que
 * pedía evitarse.
 */
export const linkAttendeeAccountTo = async (identity) => {
    if (!identity?.email) return null;
    await ensureEventRegistrationSchema();
    const mail = String(identity.email).toLowerCase();

    const existing = await findAccountByEmail(mail);
    if (existing) {
        const { rows } = await db.query(
            `UPDATE "EventAttendeeAccount"
                SET "linkedRealm" = COALESCE("linkedRealm", $1),
                    "linkedId"    = COALESCE("linkedId", $2),
                    "firstName"   = COALESCE(NULLIF($3,''), "firstName"),
                    "lastName"    = COALESCE(NULLIF($4,''), "lastName"),
                    phone         = COALESCE(NULLIF($5,''), phone),
                    "updatedAt"   = NOW()
              WHERE id = $6 RETURNING *`,
            [identity.realm, String(identity.id), clean(identity.firstName, 120),
                clean(identity.lastName, 120), clean(identity.phone, 60), existing.id]);
        return rows[0] || existing;
    }

    try {
        const { rows } = await db.query(
            `INSERT INTO "EventAttendeeAccount"
                (email, "passwordHash", "firstName", "lastName", phone, role, "linkedRealm", "linkedId")
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
            [
                mail, UNUSABLE_HASH, clean(identity.firstName, 120), clean(identity.lastName, 120),
                clean(identity.phone, 60), ATTENDEE_ROLES.ATTENDEE, identity.realm, String(identity.id),
            ]);
        return rows[0];
    } catch (error) {
        if (error?.code === '23505') return findAccountByEmail(mail);
        console.error('[event-attendee] no pude vincular la cuenta:', error?.message);
        return null;
    }
};

// ── Middleware ───────────────────────────────────────────────────────

/** Exige un token emitido para ESTA audiencia. */
export const attendeeAuth = async (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Inicia sesión para consultar tu inscripción.' });
    try {
        await ensureEventRegistrationSchema();
        const payload = jwt.verify(token, JWT_SECRET, { audience: ATTENDEE_AUDIENCE });
        const { rows } = await db.query('SELECT * FROM "EventAttendeeAccount" WHERE id = $1 LIMIT 1', [payload.sub]);
        const account = rows[0];
        if (!account) return res.status(401).json({ error: 'Tu sesión ya no es válida. Vuelve a ingresar.' });
        // El rol se lee de la base, no del token: una suspensión tiene efecto
        // de inmediato y no espera a que caduque la sesión.
        req.attendee = { ...payload, account, role: account.role || ATTENDEE_ROLES.ATTENDEE };
        return next();
    } catch {
        // v4.692 — Quien se inscribió reutilizando su cuenta de siempre no
        // tiene contraseña de asistente, así que su navegador NO lleva un token
        // de esta audiencia: lleva el del panel del club. Se acepta, pero sólo
        // si esa identidad está VINCULADA a una cuenta de asistente — el
        // vínculo lo escribe el servidor al inscribirse, nunca el navegador.
        try {
            const identity = await identityFromRequest(req);
            if (identity) {
                const linked = await findAccountByEmail(identity.email);
                if (linked && linked.linkedRealm === identity.realm
                    && String(linked.linkedId) === String(identity.id)) {
                    req.attendee = {
                        sub: linked.id, email: linked.email, account: linked,
                        role: linked.role || ATTENDEE_ROLES.ATTENDEE,
                        viaRealm: identity.realm,
                    };
                    return next();
                }
            }
        } catch { /* cae al 401 de abajo */ }
        return res.status(401).json({ error: 'Tu sesión expiró. Vuelve a ingresar.' });
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
    // v4.1267 — Y los registros del formulario «Completar inscripción»
    // (COLROTARIOS) que ya están atados a la cuenta.
    const completed = await db.query(
        `SELECT c.id, c."eventId", c."registrationCode", c.status, e.title AS "eventTitle"
           FROM "EventCompletedRegistration" c
           LEFT JOIN "CalendarEvent" e ON e.id = c."eventId"
          WHERE c."accountId" = $1
          ORDER BY c."createdAt" DESC`, [account.id]).catch(() => ({ rows: [] }));
    const role = account.role || ATTENDEE_ROLES.ATTENDEE;
    return {
        completed: completed.rows.map(c => ({
            id: c.id, eventId: c.eventId, eventTitle: c.eventTitle,
            registrationCode: c.registrationCode, status: c.status,
        })),
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
 * Abre la sesión del asistente para una cuenta ya resuelta (v4.710).
 *
 * Es lo que faltaba: la inscripción creaba la cuenta y devolvía el correo,
 * pero NINGÚN token, así que quien acababa de registrarse y pagar encontraba
 * el formulario de ingreso al pulsar «Ir a mi inscripción». El encabezado sí
 * lo mostraba dentro porque leía OTRA identidad (la del panel del club, si la
 * tenía): dos verdades sobre lo mismo.
 *
 * No comprueba credenciales a propósito: la comprueba quien la llama, y sólo
 * hay dos formas de llegar aquí —acabar de crear la cuenta con su contraseña,
 * o demostrar la propiedad de la inscripción—.
 */
export const issueAttendeeSession = async (account, { remember = true } = {}) => {
    if (!account) return null;
    return { token: signToken(account, { remember }), email: account.email, ...(await describeAttendeeSession(account)) };
};

/**
 * POST /portal/claim — entrada automática al volver de la pasarela.
 *
 * Existe para los casos en que el token del envío no está en ESTE navegador:
 * se pagó desde otro dispositivo, se cerró la pestaña, o se vuelve de Stripe
 * sobre una sesión que nunca se abrió. Se canjea la prueba de propiedad de la
 * inscripción por una sesión, sin volver a pedir la contraseña.
 *
 * La prueba es el `accessToken` de la inscripción —el mismo secreto que ya
 * permite leerla sin sesión (`GET /:id?t=`), así que no amplía lo que un
 * enlace filtrado deja ver— o el identificador de sesión de Stripe. Es el
 * mismo mecanismo que el panel del club estrenó en su día.
 *
 * Un borrador NO abre sesión: sólo una inscripción enviada.
 */
export const claimSession = async (req, res) => {
    try {
        await ensureEventRegistrationSchema();
        const registrationId = clean(req.body?.registrationId, 60);
        const accessToken = clean(req.body?.accessToken, 60);
        const sessionId = clean(req.body?.sessionId, 200);
        if (!registrationId || (!accessToken && !sessionId)) {
            return res.status(400).json({ error: 'Faltan datos de la inscripción.' });
        }

        const { rows } = await db.query(
            'SELECT * FROM "EventRegistration" WHERE id = $1 LIMIT 1', [registrationId]);
        const registration = rows[0];
        if (!registration) return res.status(404).json({ error: 'Inscripción no encontrada.' });

        const proves = (accessToken && registration.accessToken === accessToken)
            || (sessionId && registration.stripeSessionId === sessionId);
        if (!proves) return res.status(403).json({ error: 'Esos datos no corresponden a esta inscripción.' });
        if (!registration.submittedAt) {
            return res.status(409).json({ error: 'Termina de enviar el formulario para consultar tu inscripción.' });
        }

        // La cuenta es la que ya quedó atada a la inscripción. Si la fila es
        // anterior a que se crearan cuentas, se crea ahora sin contraseña
        // utilizable: el acceso lo estrena por «Olvidé mi contraseña».
        let account = null;
        if (registration.accountId) {
            const found = await db.query(
                'SELECT * FROM "EventAttendeeAccount" WHERE id = $1 LIMIT 1', [registration.accountId]);
            account = found.rows[0] || null;
        }
        if (!account) {
            account = await ensurePendingAccountFor(registration);
            if (account) await linkRegistrationToAccount(registration.id, account.id);
        }
        if (!account) return res.status(500).json({ error: 'No pudimos abrir tu panel.' });

        await auditLogin(req, { accountId: account.id, email: account.email, outcome: 'claim' });
        return res.json(await issueAttendeeSession(account));
    } catch (error) {
        console.error('[event-attendee] claimSession:', error);
        return res.status(500).json({ error: 'No pudimos abrir tu panel.' });
    }
};

/**
 * POST /portal/link — puente entre CUALQUIER sesión del sitio y la del evento.
 *
 * Es el simétrico de `/project-fair/portal/link`, y existe por lo mismo: un
 * rotario que paga la postulación de su proyecto y además su asistencia al
 * evento tiene las dos cosas con el MISMO correo. `resolveSession` abre las
 * dos desde v4.711, pero sólo al ingresar: quien ya tenía la sesión del
 * proyecto abierta de antes seguiría sin ver su panel del evento hasta volver
 * a entrar. Esto lo resuelve sin pedirle nada.
 *
 * La identidad la da el token que trae el navegador, verificado en el
 * SERVIDOR (firma + audiencia): sólo se emite la sesión del asistente para el
 * MISMO correo que ya venía autenticado, nunca para otro.
 */
export const linkFromIdentity = async (req, res) => {
    try {
        await ensureEventRegistrationSchema();
        const identity = await identityFromRequest(req).catch(() => null);
        const email = String(identity?.email || '').trim().toLowerCase();
        // El correo viaja también en la respuesta negativa: el navegador lo
        // necesita para saber si la sesión de asistente que tenga guardada es
        // de ESTA persona o de otra. Misma regla que v4.693.
        if (!isEmail(email)) return res.json({ hasRegistration: false, email: null });

        // ¿Hay una inscripción ENVIADA con este correo? Se pregunta por el
        // CORREO y no por la cuenta, a propósito: una inscripción anterior a
        // que existieran las cuentas —o una cuyo vínculo no llegó a
        // escribirse— tiene `accountId` en NULL y quedaría invisible para su
        // dueño para siempre. Un borrador no cuenta.
        const { rows } = await db.query(
            `SELECT id, "accountId" FROM "EventRegistration"
              WHERE lower(email) = $1 AND "submittedAt" IS NOT NULL
              ORDER BY "createdAt" DESC LIMIT 1`, [email]);
        if (!rows.length) return res.json({ hasRegistration: false, email });

        // La cuenta es la del correo; si no existe todavía, se crea sin
        // contraseña utilizable —se entra por esta misma vía o por «Olvidé mi
        // contraseña»— y se le atan las inscripciones huérfanas de ese correo.
        let account = await findAccountByEmail(email);
        if (!account) account = await ensurePendingAccountFor({ email, firstName: identity?.name, lastName: null, phone: null });
        if (!account) return res.json({ hasRegistration: false, email });
        if (!rows[0].accountId) await attachOrphanRegistrations(account);

        return res.json({ hasRegistration: true, ...(await issueAttendeeSession(account)) });
    } catch (error) {
        console.error('[event-attendee] linkFromIdentity:', error);
        // Nunca rompe la pantalla que lo consulta: sin puente, la persona
        // entra por el formulario de ingreso de siempre.
        return res.json({ hasRegistration: false, email: null });
    }
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
        // v4.692 — Una cuenta VINCULADA no tiene contraseña propia a propósito:
        // su clave vive en la identidad de origen (el panel del club). Decirle
        // "todavía no tiene contraseña, créala" sería mandarla a inventar una
        // segunda credencial, justo lo que esta función existe para evitar. Se
        // devuelve un fallo normal para que `resolveSession` siga probando —o
        // dé el mensaje genérico si de verdad se equivocó de clave.
        if (account.linkedRealm) {
            await auditLogin(req, { accountId: account.id, email: mail, outcome: 'linked_account' });
            return { ok: false };
        }
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
            // v4.1267 — También quien sólo completó el formulario COLROTARIOS:
            // es la puerta para reclamar una inscripción anterior sin cuenta.
            // El enlace llega al correo, y abrirlo es lo que prueba que es suyo.
            if (!rows[0]) {
                const completed = await db.query(
                    `SELECT email, "firstName", "lastName", phone FROM "EventCompletedRegistration"
                      WHERE lower(email) = $1 ORDER BY "createdAt" DESC LIMIT 1`, [email])
                    .catch(() => ({ rows: [] }));
                if (completed.rows[0]) rows.push(completed.rows[0]);
            }
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
        // v4.1267 — El enlace llegó a ESE correo y se abrió: el correo es suyo.
        // Recién ahora se le atan los registros COLROTARIOS que llevan ese correo.
        await markEmailProven(updated[0]);
        await attachOrphanCompleted(updated[0], { comment: 'Vinculada al restablecer la contraseña desde el correo del participante.' });
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
        await attachOrphanCompleted(rows[0], { comment: 'Vinculada al confirmar el correo del participante.' });
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
            // v4.1267 — Los registros del formulario «Completar inscripción».
            // Tabla propia (v4.943), así que van en su propia lista.
            completed: (await loadOwnCompleted(account.id)).map(row => completedParticipantView(row)),
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

// ════════════════════════════════════════════════════════════════════
// La cuenta del participante en «Completar inscripción» — v4.1267
// ════════════════════════════════════════════════════════════════════
//
// El formulario COLROTARIOS (v4.943) guarda en su propia tabla y, hasta esta
// versión, no tenía cuenta. Ahora usa ESTA misma identidad: la cuenta del
// asistente, una por correo, con la recuperación de contraseña, el ingreso
// unificado del encabezado y el panel `/mi-inscripcion` de siempre. No hay un
// segundo sistema de autenticación ni otra tabla de usuarios.
//
// Reglas:
//
// - **Nunca una segunda cuenta para el mismo correo**, tampoco si el correo
//   pertenece al Gestor de Proyectos o a un usuario de la plataforma: se pide
//   entrar con esa cuenta y se VINCULA (`linkAttendeeAccountTo`).
// - **Una cuenta sin contraseña elegida NO se estrena desde el formulario.**
//   La creó el sistema; escribirle una clave desde acá sería quedarse con la
//   cuenta de cualquier correo conocido. Se estrena por «Olvidé mi
//   contraseña», cuyo enlace llega a ese correo.
// - **Un registro anterior sin cuenta sólo se ata cuando el titular DEMUESTRA
//   el correo** (enlace de recuperación, de verificación o de vinculación). La
//   coincidencia de correo o de nombre, por sí sola, no ata nada.
// - **La cuenta no confirma la inscripción.** Ninguna de estas funciones toca
//   `status`.

/** ¿El correo ya es de una cuenta de la plataforma fuera del asistente? */
const otherRealmHasEmail = async (mail) => {
    const exists = async (sql) =>
        (await db.query(sql, [mail]).catch(() => ({ rows: [] }))).rows.length > 0;
    return (await exists('SELECT 1 FROM "ProjectFairAccount" WHERE lower(email) = $1 LIMIT 1'))
        || (await exists('SELECT 1 FROM "User" WHERE lower(email) = $1 LIMIT 1'));
};

/**
 * Resuelve con qué cuenta queda el registro.
 *
 * `outcome`:
 * - `session`  — había sesión abierta con ESE correo (cualquier identidad).
 * - `password` — la cuenta de asistente ya existía y la clave coincide.
 * - `created`  — no había ninguna cuenta con ese correo: se creó.
 * - `new`      — (sólo con `create: false`) se crearía.
 * - `exists`   — el correo ya tiene cuenta y hay que entrar con ella (o
 *                recuperarla). `recover` dice si sólo se puede por recuperación.
 * - `weak`, `none`, `invalid_email`.
 *
 * Con `create: false` no escribe nada: es lo que usa la comprobación del
 * paso 1 del formulario.
 */
export const resolveParticipantAccess = async ({ email, password, identity = null, create = true, profile = {} }) => {
    await ensureEventRegistrationSchema();
    const mail = clean(email, 200).toLowerCase();
    if (!isEmail(mail)) return { outcome: 'invalid_email' };

    // 1) Sesión abierta con el MISMO correo del formulario. Con otro correo la
    //    sesión no cuenta: se estaría inscribiendo a otra persona a su nombre.
    if (identity?.email && String(identity.email).toLowerCase() === mail) {
        if (identity.realm === 'attendee') {
            const { rows } = await db.query('SELECT * FROM "EventAttendeeAccount" WHERE id = $1 LIMIT 1', [identity.id]);
            if (rows[0]) return { outcome: 'session', account: rows[0] };
        } else if (!create) {
            return { outcome: 'session', account: null };
        } else {
            const account = await linkAttendeeAccountTo({ ...identity, ...profile });
            if (account) return { outcome: 'session', account };
        }
    }

    if (!password) return { outcome: 'none' };

    const existing = await findAccountByEmail(mail);
    if (existing) {
        if (!existing.passwordHash || existing.passwordHash === UNUSABLE_HASH) {
            // Vinculada (entra con la clave de su identidad de origen) o creada
            // por el sistema sin clave (se estrena por recuperación).
            return { outcome: 'exists', recover: !existing.linkedRealm };
        }
        const matches = await bcrypt.compare(String(password), existing.passwordHash).catch(() => false);
        return matches ? { outcome: 'password', account: existing } : { outcome: 'exists' };
    }
    if (await otherRealmHasEmail(mail)) return { outcome: 'exists' };
    if (String(password).length < PASSWORD_MIN) return { outcome: 'weak' };
    if (!create) return { outcome: 'new' };

    const passwordHash = await bcrypt.hash(String(password), 10);
    try {
        const { rows } = await db.query(
            `INSERT INTO "EventAttendeeAccount" (email, "passwordHash", "firstName", "lastName", phone, role)
             VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
            [mail, passwordHash, clean(profile.firstName, 120), clean(profile.lastName, 120),
                clean(profile.phone, 60), ATTENDEE_ROLES.ATTENDEE]);
        return { outcome: 'created', account: rows[0] };
    } catch (error) {
        // Otra pestaña creó la cuenta en el mismo instante: ya existe, y hay
        // que entrar con ella — nunca se pisa.
        if (error?.code === '23505') return { outcome: 'exists' };
        throw error;
    }
};

/** El correo quedó demostrado (abrió un enlace que llegó a él). */
export const markEmailProven = async (account) => {
    if (!account?.id || account.emailVerifiedAt) return;
    await db.query(
        `UPDATE "EventAttendeeAccount" SET "emailVerifiedAt" = COALESCE("emailVerifiedAt", NOW()) WHERE id = $1`,
        [account.id]).catch(err => console.error('[event-attendee] markEmailProven:', err?.message));
};

/**
 * Ata a la cuenta los registros COLROTARIOS de su correo que aún no tienen
 * cuenta. SÓLO se llama cuando el correo está demostrado. No toca el estado,
 * el pago ni el comprobante: sólo `accountId`, y deja historial.
 */
export const attachOrphanCompleted = async (account, { comment = 'Inscripción vinculada a la cuenta del participante.' } = {}) => {
    if (!account?.id || !account?.email) return 0;
    try {
        const { rows } = await db.query(
            `UPDATE "EventCompletedRegistration" SET "accountId" = $1, "updatedAt" = NOW()
              WHERE "accountId" IS NULL AND lower(email) = $2
              RETURNING id, "eventId"`,
            [account.id, String(account.email).toLowerCase()]);
        for (const row of rows) {
            await recordHistory({
                registrationId: row.id, eventId: row.eventId, type: 'account_linked',
                comment, payload: { via: 'email_proven' },
            });
        }
        return rows.length;
    } catch (error) {
        console.error('[event-attendee] attachOrphanCompleted:', error?.message);
        return 0;
    }
};

/** La vista del participante: sin notas internas, alertas de duplicado ni la clave de S3. */
const completedParticipantView = (row, { history = [], messages = [] } = {}) => {
    const meta = completedStatusMeta(row.status);
    return {
        id: row.id,
        kind: 'completed',
        eventId: row.eventId,
        event: {
            id: row.eventId, title: row.eventTitle, slug: row.eventSlug,
            startDate: row.eventStart, endDate: row.eventEnd, location: row.eventLocation,
        },
        registrationCode: row.registrationCode,
        status: row.status,
        statusLabel: meta.label,
        statusDescription: meta.description || null,
        stages: participantStages(row.status),
        firstName: row.firstName,
        lastName: row.lastName,
        email: row.email,
        phone: row.phone,
        district: row.district,
        clubName: row.clubName,
        membershipLabel: row.membershipType ? membershipLabel(row.membershipType) : null,
        paymentMethodLabel: row.paymentMethod ? paymentMethodLabel(row.paymentMethod) : null,
        hasReceipt: Boolean(row.receiptKey),
        receiptName: row.receiptName || null,
        checkedInAt: row.checkedInAt,
        registeredAt: row.submittedAt || row.createdAt,
        history,
        messages,
    };
};

const COMPLETED_SELECT = `SELECT c.*, e.title AS "eventTitle", e.slug AS "eventSlug",
        e."startDate" AS "eventStart", e."endDate" AS "eventEnd", e.location AS "eventLocation"
   FROM "EventCompletedRegistration" c
   LEFT JOIN "CalendarEvent" e ON e.id = c."eventId"`;

const loadOwnCompleted = async (accountId) => {
    const { rows } = await db.query(
        `${COMPLETED_SELECT} WHERE c."accountId" = $1
          ORDER BY COALESCE(e."startDate", c."createdAt") DESC, c."createdAt" DESC`, [accountId])
        .catch(() => ({ rows: [] }));
    return rows;
};

/** Un registro propio: el filtro por cuenta va en el WHERE, nunca después. */
const loadOwnCompletedRow = async (id, accountId) => {
    const { rows } = await db.query(
        `${COMPLETED_SELECT} WHERE c.id = $1 AND c."accountId" = $2 LIMIT 1`,
        [clean(id, 60), accountId]);
    return rows[0] || null;
};

// GET /portal/completed/:id — ficha de UN registro COLROTARIOS propio.
export const getOwnCompleted = async (req, res) => {
    try {
        await ensureEventRegistrationSchema();
        const row = await loadOwnCompletedRow(req.params.id, req.attendee.account.id);
        if (!row) return res.status(404).json({ error: 'No encontramos esa inscripción en tu cuenta.' });
        const history = (await listHistory(row.id)).map(participantHistoryEntry).filter(Boolean);
        const messages = (await listMessages(row.id))
            .filter(m => m.status !== 'failed')
            .map(m => ({ id: m.id, channel: m.channel, subject: m.subject, createdAt: m.createdAt }));
        res.json(completedParticipantView(row, { history, messages }));
    } catch (error) {
        console.error('[event-attendee] getOwnCompleted:', error);
        res.status(500).json({ error: 'No pudimos cargar tu inscripción.' });
    }
};

// GET /portal/completed/:id/receipt — enlace firmado (2 min) a SU comprobante.
export const getOwnCompletedReceipt = async (req, res) => {
    try {
        await ensureEventRegistrationSchema();
        const row = await loadOwnCompletedRow(req.params.id, req.attendee.account.id);
        if (!row) return res.status(404).json({ error: 'No encontramos esa inscripción en tu cuenta.' });
        if (!row.receiptKey) return res.status(404).json({ error: 'Esta inscripción no tiene comprobante cargado.' });
        const url = await signedReceiptUrl(row.receiptKey, { seconds: 120 });
        if (!url) return res.status(502).json({ error: 'No pudimos abrir el comprobante. Intenta de nuevo.' });
        res.json({ url, name: row.receiptName || 'comprobante' });
    } catch (error) {
        console.error('[event-attendee] getOwnCompletedReceipt:', error);
        res.status(500).json({ error: 'No pudimos abrir el comprobante.' });
    }
};

/**
 * POST /portal/completed/claim — «me inscribí antes sin cuenta».
 *
 * Con el correo ya demostrado, se vincula en el acto. Si no, se manda un
 * enlace A ESE CORREO: abrirlo es la prueba. La respuesta no dice cuántos
 * registros hay hasta que el correo se demuestra.
 */
export const requestCompletedClaim = async (req, res) => {
    try {
        await ensureEventRegistrationSchema();
        const account = req.attendee.account;
        if (account.emailVerifiedAt) {
            const linked = await attachOrphanCompleted(account, { comment: 'Vinculada por el titular desde «Mis eventos».' });
            return res.json({ linked, sent: false });
        }
        const { rows } = await db.query(
            `SELECT COUNT(*)::int AS n FROM "EventCompletedRegistration"
              WHERE "accountId" IS NULL AND lower(email) = $1`, [String(account.email).toLowerCase()]);
        if (rows[0]?.n > 0) {
            const token = jwt.sign({ sub: account.id, email: String(account.email).toLowerCase(), purpose: 'completed_claim' },
                JWT_SECRET, { expiresIn: '2h' });
            const origin = req.headers.origin || 'https://app.clubplatform.org';
            const link = `${origin}${ATTENDEE_PATH}?vincular=${encodeURIComponent(token)}`;
            const salida = await EmailService.sendPlatformEmail({
                to: account.email, from: PLATFORM_SENDER,
                subject: 'Vincula tu inscripción a tu cuenta',
                html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#1f2937">
                    <h2 style="color:#17458F">Vincula tu inscripción</h2>
                    <p>Pediste vincular a tu cuenta las inscripciones que enviaste antes con este correo.</p>
                    <p><a href="${link}" style="display:inline-block;background:#17458F;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold">Vincular mis inscripciones</a></p>
                    <p style="font-size:13px;color:#6b7280">El enlace vence en 2 horas. Si no fuiste tú, puedes ignorar este correo.</p>
                </div>`,
            }).catch(err => ({ success: false, error: err?.message }));
            if (salida && salida.success === false) {
                console.error('[event-attendee] correo de vinculación:', salida.error);
            }
        }
        await auditLogin(req, { accountId: account.id, email: account.email, outcome: 'claim_requested' });
        res.json({ linked: 0, sent: true });
    } catch (error) {
        console.error('[event-attendee] requestCompletedClaim:', error);
        res.status(500).json({ error: 'No pudimos procesar la solicitud.' });
    }
};

/**
 * POST /portal/completed/claim/confirm — el enlace del correo. Prueba a la vez
 * la cuenta (`sub`) y el correo (llegó a él). Abre la sesión, como la
 * verificación de correo.
 */
export const confirmCompletedClaim = async (req, res) => {
    try {
        await ensureEventRegistrationSchema();
        let payload;
        try { payload = jwt.verify(clean(req.body?.token, 2000), JWT_SECRET); }
        catch { return res.status(400).json({ error: 'El enlace venció o no es válido. Pide uno nuevo desde «Mis eventos».' }); }
        if (payload?.purpose !== 'completed_claim') return res.status(400).json({ error: 'Enlace no válido.' });

        const { rows } = await db.query('SELECT * FROM "EventAttendeeAccount" WHERE id = $1 LIMIT 1', [payload.sub]);
        const account = rows[0];
        // El correo del enlace tiene que seguir siendo el de la cuenta.
        if (!account || String(account.email).toLowerCase() !== String(payload.email || '')) {
            return res.status(400).json({ error: 'Enlace no válido.' });
        }
        await markEmailProven(account);
        const linked = await attachOrphanCompleted(account, { comment: 'Vinculada por el titular tras confirmar su correo.' });
        await attachOrphanRegistrations(account);
        await auditLogin(req, { accountId: account.id, email: account.email, outcome: 'claim_confirmed' });
        res.json({ linked, ...(await issueAttendeeSession(account)) });
    } catch (error) {
        console.error('[event-attendee] confirmCompletedClaim:', error);
        res.status(500).json({ error: 'No pudimos vincular tus inscripciones.' });
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
    issueAttendeeSession,
    claimSession,
    linkFromIdentity,
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
    resolveParticipantAccess,
    attachOrphanCompleted,
    getOwnCompleted,
    getOwnCompletedReceipt,
    requestCompletedClaim,
    confirmCompletedClaim,
};
