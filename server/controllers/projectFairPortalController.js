// ════════════════════════════════════════════════════════════════════
// Panel del club — Formulación del proyecto
// v4.608.0
//
// Espacio privado del club que ya se inscribió y pagó. Ahí formula su
// proyecto con el formulario maestro, lo guarda cuantas veces quiera y lo
// envía al comité.
//
// SEGURIDAD — decisión deliberada: la cuenta del postulante NO vive en la
// tabla `User` de la plataforma. El club tiene identidad propia
// (`ProjectFairAccount`) y un token con audiencia `project-fair-portal`, que
// el middleware de abajo exige. Desde v4.627 la separación es simétrica:
// `authMiddleware` rechaza este token en las rutas de plataforma, así que un
// Gestor de Proyectos no alcanza el panel administrativo ni escribiendo la
// URL a mano.
// ════════════════════════════════════════════════════════════════════
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import Stripe from 'stripe';
import db from '../lib/db.js';
import {
    ensureTables, logEvent, readConfigForAdmin, readConfigForSubmission, readEditionEvent, sendFairEmail, APPLICANT_ROLES,
    grantProjectManagerRole, beginCheckout, syncPaymentState, paymentStateFor,
    validateSubmission, applicationViewOf, notifyApplication, buildReceiptHtml,
    registrationRows, insertProjectRow, resolveTrm, resolvePriceMode, PROJECT_FIELDS,
} from './projectFairController.js';
// v4.1299 — La INSCRIPCIÓN: uno o dos proyectos, un pago, y qué puede hacer
// el club con el segundo (agregarlo, quitarlo antes de pagar, restaurarlo).
import {
    pricingRulesOf, registrationBreakdown, secondProjectVerdict, removeProjectVerdict,
    activeProjects, isActiveProject, indexOf as projectIndexOf, modalityOf, modalityTotal, projectIndexLabel,
    coveredByCheckout,
} from '../lib/projectFairRegistration.js';
// v4.1253 — Lo de arriba desde `validateSubmission`: postular desde el perfil
// un borrador, y el comprobante del pago.
import { isApplied, projectStateOf, owesRegistration } from '../lib/projectFairLifecycle.js';
import { completionOf } from '../lib/projectFairMasterForm.js';
import { SHORT_SESSION_TTL } from '../middleware/auth.js';
import { resolveForm } from '../lib/projectFormsRegistry.js';
import {
    editability, listPortalForms, seedAnswersFor, formIsAvailable,
    saveForm as saveProjectForm, submitForm as submitProjectForm,
} from './projectFormsController.js';

console.log('[projectFairPortalController] v4.1299.0 cargado — El perfil muestra la INSCRIPCIÓN del club: sus proyectos (uno o dos), un token por proyecto para gestionarlos por separado, el desglose y el pago único; agregar un segundo proyecto (también con el primero ya pagado: cobro complementario), quitarlo antes de pagar y restaurarlo.');
console.log('[projectFairPortalController] v4.1253.0 cargado — El perfil del club muestra la postulación y el pago POR SEPARADO: un borrador se termina y se envía desde acá, y la inscripción se paga cuando el club quiera, sin que eso condicione su postulación.');
console.log('[projectFairPortalController] v4.978.0 cargado — Panel del club: varios formularios por proyecto; el puente con la plataforma sólo retira la sesión del panel si es del mismo correo; el pago pendiente se completa o se reintenta desde acá');

// La edición de un formulario la decide un solo lugar, compartido por todos
// (`projectFormsController`). Se reexporta porque este módulo era su casa.
export { editability };

const JWT_SECRET = process.env.JWT_SECRET || 'rotary_secret_key_2026';
// Audiencia propia: un token del panel administrativo no sirve aquí, ni al revés.
const PORTAL_AUDIENCE = 'project-fair-portal';
const TOKEN_TTL = '30d';

const clean = (v, max = 250) => String(v ?? '').trim().slice(0, max);
const isEmail = (v) => /^\S+@\S+\.\S+$/.test(String(v || ''));

const signToken = (account, { remember = true, submissionId = null } = {}) => jwt.sign(
    { sub: account.id, submissionId: submissionId || account.submissionId, email: account.email, aud: PORTAL_AUDIENCE },
    JWT_SECRET,
    { expiresIn: remember ? TOKEN_TTL : SHORT_SESSION_TTL }
);

/**
 * v4.1299 — EL TOKEN ES EL SELECTOR DE PROYECTO. Todas las rutas del perfil
 * (formularios, videos, recursos, borrador) leen `req.portal.submissionId`:
 * en vez de enseñarles a todas un parámetro nuevo, la misma cuenta recibe un
 * token por cada proyecto de su inscripción, firmado por el servidor y con el
 * MISMO vencimiento que la sesión que lo pidió. El navegador elige con cuál
 * habla; el servidor sólo emite tokens de proyectos de esa inscripción.
 */
const issueProjectToken = (account, submissionId, { exp = null } = {}) => {
    const payload = { sub: account.id, submissionId, email: account.email, aud: PORTAL_AUDIENCE };
    if (exp) return jwt.sign({ ...payload, exp }, JWT_SECRET);
    return jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_TTL });
};

/**
 * La cuenta que administra una postulación: por su proyecto principal, por
 * su inscripción (un segundo proyecto no es el `submissionId` de la cuenta) o,
 * de último, por el correo. Devuelve `null` si no hay ninguna.
 */
const accountForSubmission = async (submission) => {
    if (!submission) return null;
    const porProyecto = await db.query('SELECT * FROM "ProjectFairAccount" WHERE "submissionId" = $1 LIMIT 1', [submission.id]);
    if (porProyecto.rows[0]) return porProyecto.rows[0];
    if (submission.registrationId) {
        const porInscripcion = await db.query('SELECT * FROM "ProjectFairAccount" WHERE "registrationId" = $1 LIMIT 1', [submission.registrationId]).catch(() => ({ rows: [] }));
        if (porInscripcion.rows[0]) return porInscripcion.rows[0];
    }
    const email = String(submission.email || '').toLowerCase();
    if (!email) return null;
    const porCorreo = await db.query('SELECT * FROM "ProjectFairAccount" WHERE lower(email) = $1 LIMIT 1', [email]).catch(() => ({ rows: [] }));
    return porCorreo.rows[0] || null;
};

/** Middleware del panel: exige un token emitido para esta audiencia. */
export const portalAuth = async (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Inicia sesión para continuar.' });
    try {
        const payload = jwt.verify(token, JWT_SECRET, { audience: PORTAL_AUDIENCE });
        req.portal = payload;
        next();
    } catch {
        res.status(401).json({ error: 'Tu sesión expiró. Vuelve a ingresar.' });
    }
};

/**
 * Token del perfil para quien ACABA de crear su cuenta con su contraseña al
 * postular (v4.1253): así «Ir a mi perfil» lo deja adentro sin pedirle la
 * contraseña que escribió hace un segundo. Es el mismo token del ingreso.
 */
export const issuePortalToken = (account) => signToken(account);

// ── Cuenta ───────────────────────────────────────────────────────────
export const PASSWORD_MIN = 8;

/**
 * Crea la cuenta del club junto con su postulación. Se llama desde
 * `createSubmission`: la cuenta existe desde que envía el formulario, aunque
 * el pago aún no se haya confirmado, para que pueda volver y reintentar.
 */
export const createAccountFor = async (submission, password, { registrationId = null } = {}) => {
    if (!password || String(password).length < PASSWORD_MIN) return null;
    const passwordHash = await bcrypt.hash(String(password), 10);
    try {
        const { rows } = await db.query(`
            INSERT INTO "ProjectFairAccount" ("submissionId", email, "passwordHash", "clubName", "registrationId")
            VALUES ($1,$2,$3,$4,$5)
            ON CONFLICT ("submissionId") DO UPDATE SET "passwordHash" = EXCLUDED."passwordHash", "registrationId" = COALESCE(EXCLUDED."registrationId", "ProjectFairAccount"."registrationId"), "updatedAt" = NOW()
            RETURNING *
        `, [submission.id, String(submission.email).toLowerCase(), passwordHash, submission.clubName, registrationId || submission.registrationId || null]);
        return rows[0];
    } catch (err) {
        // Correo ya usado por otra postulación: no es un error fatal del
        // formulario, la inscripción se guarda igual y el club puede entrar
        // con la cuenta que ya tenía. Se registra con la referencia para poder
        // rastrearlo: una inscripción sin cuenta deja al club sin acceso.
        console.error(`[project-fair-portal] ⚠️ La inscripción ${submission.publicRef || submission.id} (${submission.email}) quedó SIN cuenta: ${err?.message}`);
        return null;
    }
};

// Hash imposible de acertar: marca una cuenta creada por el sistema (al volver
// de Stripe o al recuperar la contraseña) que todavía no tiene una contraseña
// elegida por el club. No se puede iniciar sesión con ella; sólo entrar por el
// enlace de recuperación o por la sesión de pago.
const UNUSABLE_HASH = '!';

/**
 * Devuelve la cuenta de una inscripción, creándola si no existe. Se usa cuando
 * el club llega verificado por otra vía (sesión de pago pagada, o recuperación
 * de contraseña sobre su propio correo) pero su inscripción quedó sin cuenta.
 * Devuelve null si ese correo ya pertenece a otra postulación.
 */
const ensureAccountFor = async (submission) => {
    // v4.1299 — Un segundo proyecto comparte la cuenta de su inscripción.
    const existing = await accountForSubmission(submission);
    if (existing) return existing;
    try {
        const { rows } = await db.query(`
            INSERT INTO "ProjectFairAccount" ("submissionId", email, "passwordHash", "clubName", "registrationId")
            VALUES ($1,$2,$3,$4,$5)
            RETURNING *
        `, [submission.id, String(submission.email).toLowerCase(), UNUSABLE_HASH, submission.clubName, submission.registrationId || null]);
        return rows[0];
    } catch (err) {
        console.warn('[project-fair-portal] No pude crear la cuenta pendiente:', err?.message);
        return null;
    }
};

/**
 * GET /portal/link — puente entre la sesión de la plataforma y el panel del club.
 *
 * Un club que postuló y pagó suele tener también un usuario de la plataforma
 * con el mismo correo. Antes tenía que iniciar sesión dos veces y conocer la
 * dirección de su panel. Con este endpoint, quien ya está autenticado en la
 * plataforma obtiene —si ese correo tiene una postulación— un token del panel
 * y el resumen de su proyecto, para mostrarle el acceso directo.
 *
 * La identidad la da la sesión de la plataforma: sólo se emite el token del
 * panel para el MISMO correo que ya venía autenticado, nunca para otro.
 */
export const linkPlatformUser = async (req, res) => {
    try {
        await ensureTables();
        const email = String(req.user?.email || '').trim().toLowerCase();
        // El correo viaja también en la respuesta negativa: el navegador lo
        // necesita para saber si la sesión del panel que tenga guardada es de
        // ESTE usuario (y entonces está vencida) o de otro (y no se toca).
        if (!isEmail(email)) return res.json({ hasProject: false, email: null });

        const { rows } = await db.query(`
            SELECT * FROM "ProjectFairSubmission"
            WHERE lower(email) = $1
            ORDER BY (status = 'paid') DESC, "createdAt" DESC
            LIMIT 1`, [email]);
        const submission = rows[0];
        if (!submission) return res.json({ hasProject: false, email });

        const account = await ensureAccountFor(submission);
        if (!account) return res.json({ hasProject: false, email });

        const cfg = await readConfigForAdmin();
        res.json({
            hasProject: true,
            portalToken: signToken(account),
            path: cfg.portal?.path || '/mi-proyecto',
            submission: {
                publicRef: submission.publicRef,
                projectName: submission.projectName,
                clubName: submission.clubName,
                status: submission.status,
            },
        });
    } catch (error) {
        console.error('[project-fair-portal] linkPlatformUser:', error);
        res.json({ hasProject: false });
    }
};

/** ¿El correo ya tiene cuenta? Lo usa el formulario para avisar en vivo. */
export const checkEmail = async (req, res) => {
    await ensureTables();
    const email = clean(req.query.email, 200).toLowerCase();
    if (!isEmail(email)) return res.json({ exists: false });
    const { rows } = await db.query('SELECT id FROM "ProjectFairAccount" WHERE lower(email) = $1 LIMIT 1', [email]);
    res.json({ exists: rows.length > 0 });
};

export const ROLE_LABELS = {
    [APPLICANT_ROLES.MANAGER]: 'Gestor de Proyectos',
    [APPLICANT_ROLES.SUSPENDED]: 'Gestor de Proyectos (suspendido)',
    [APPLICANT_ROLES.APPLICANT]: 'Postulante',
};

/**
 * Proyectos que administra una cuenta del panel, con la ruta a la que debe
 * entrar. Hoy la relación es de uno a uno (`ProjectFairAccount.submissionId`),
 * así que la lista trae 0 ó 1 elementos; la forma es de lista a propósito, para
 * que cuando una cuenta pueda gestionar varios sólo haya que ampliar esta
 * consulta y agregar la vista de listado, sin tocar quien la consume.
 */
export const projectsForAccount = async (account) => {
    if (!account?.submissionId) return [];
    // v4.1299 — Todos los proyectos de la INSCRIPCIÓN (uno o dos), con el
    // principal primero. Sin inscripción (fila heredada), el de siempre.
    const { rows } = account.registrationId
        ? await db.query(
            'SELECT id, "publicRef", "projectName", "clubName", district, status, "workflowStatus", "projectIndex", "archivedAt" FROM "ProjectFairSubmission" WHERE "registrationId" = $1 OR id = $2 ORDER BY "projectIndex" ASC, "createdAt" ASC',
            [account.registrationId, account.submissionId])
        : await db.query(
            'SELECT id, "publicRef", "projectName", "clubName", district, status, "workflowStatus", "projectIndex", "archivedAt" FROM "ProjectFairSubmission" WHERE id = $1',
            [account.submissionId]);
    return rows.filter(isActiveProject).map(r => ({
        id: r.id, publicRef: r.publicRef, projectName: r.projectName,
        clubName: r.clubName, district: r.district,
        paymentStatus: r.status, workflowStatus: r.workflowStatus,
        projectIndex: projectIndexOf(r),
    }));
};

/**
 * Resumen de sesión del panel del club: rol, proyectos y ruta de destino. Lo
 * calcula el servidor —no el navegador— para que la redirección y los permisos
 * no puedan discrepar.
 */
export const describePortalSession = async (account) => {
    const cfg = await readConfigForAdmin().catch(() => ({}));
    const path = cfg?.portal?.path || '/mi-proyecto';
    const projects = await projectsForAccount(account);
    const role = account?.role || APPLICANT_ROLES.APPLICANT;
    return {
        realm: 'portal',
        role,
        roleLabel: ROLE_LABELS[role] || ROLE_LABELS[APPLICANT_ROLES.APPLICANT],
        projects,
        // Con un solo proyecto se entra directo a él. Con varios habrá que
        // pasar antes por el listado; mientras la relación sea 1:1 ese caso no
        // puede darse y no se inventa una ruta que no existe.
        redirect: path,
        needsPassword: !account?.passwordHash || account.passwordHash === UNUSABLE_HASH,
    };
};

/**
 * Comprueba unas credenciales contra la identidad del panel del club.
 * @returns {Promise<{ok:true, account, token} | {ok:false, needsPassword?:boolean}>}
 */
export const authenticatePortal = async (email, password, { remember = true } = {}) => {
    await ensureTables();
    const mail = clean(email, 200).toLowerCase();
    if (!isEmail(mail) || !password) return { ok: false };

    const { rows } = await db.query('SELECT * FROM "ProjectFairAccount" WHERE lower(email) = $1 LIMIT 1', [mail]);
    const account = rows[0];
    // Una cuenta creada por el sistema todavía no tiene contraseña elegida: se
    // le dice explícitamente que la defina, en vez de dejarlo probando
    // credenciales que nunca van a funcionar.
    if (account && account.passwordHash === UNUSABLE_HASH) return { ok: false, needsPassword: true };

    // Mismo resultado para correo inexistente y contraseña incorrecta: no se
    // revela qué correos están registrados.
    const ok = account && await bcrypt.compare(password, account.passwordHash).catch(() => false);
    if (!ok) return { ok: false };

    await db.query('UPDATE "ProjectFairAccount" SET "lastLoginAt" = NOW() WHERE id = $1', [account.id]);
    return { ok: true, account, token: signToken(account, { remember }) };
};

// POST /portal/login
export const login = async (req, res) => {
    try {
        const email = clean(req.body?.email, 200).toLowerCase();
        const password = String(req.body?.password || '');
        if (!isEmail(email) || !password) return res.status(400).json({ error: 'Ingresa tu correo y contraseña.' });

        const result = await authenticatePortal(email, password, { remember: req.body?.remember !== false });
        if (result.needsPassword) {
            return res.status(409).json({
                error: 'Tu proyecto está registrado pero aún no tiene contraseña. Usa "Olvidé mi contraseña" para crear una.',
                needsPassword: true,
            });
        }
        if (!result.ok) return res.status(401).json({ error: 'Correo o contraseña incorrectos.' });

        const session = await describePortalSession(result.account);
        res.json({ token: result.token, email: result.account.email, clubName: result.account.clubName, ...session });
    } catch (error) {
        console.error('[project-fair-portal] login:', error);
        res.status(500).json({ error: 'No pudimos iniciar sesión.' });
    }
};

/**
 * POST /portal/claim — entrada automática al volver de Stripe.
 * Se canjea la sesión de pago por un token, de modo que el club aterriza en
 * su panel sin volver a escribir la contraseña. Sólo funciona si Stripe
 * confirma que esa sesión corresponde a esa postulación y está pagada.
 */
export const claim = async (req, res) => {
    try {
        await ensureTables();
        const submissionId = clean(req.body?.submissionId, 60);
        const sessionId = clean(req.body?.sessionId, 200);
        if (!submissionId || !sessionId) return res.status(400).json({ error: 'Faltan datos de la inscripción.' });

        const { rows } = await db.query('SELECT * FROM "ProjectFairSubmission" WHERE id = $1 LIMIT 1', [submissionId]);
        const submission = rows[0];
        if (!submission) return res.status(404).json({ error: 'Inscripción no encontrada.' });
        if (submission.stripeSessionId !== sessionId) {
            return res.status(403).json({ error: 'La sesión de pago no corresponde a esta inscripción.' });
        }

        // La confirmación la da Stripe, no el navegador.
        if (submission.status !== 'paid') {
            const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_12345');
            const session = await stripe.checkout.sessions.retrieve(sessionId);
            if (session?.payment_status !== 'paid') {
                return res.status(402).json({ error: 'El pago todavía no está confirmado.' });
            }
        }

        // v4.1299 — El ancla del cobro puede ser el SEGUNDO proyecto (pago
        // complementario): la cuenta es la de su inscripción.
        let account = await accountForSubmission(submission);

        // Si la inscripción quedó sin cuenta (postulaciones anteriores al panel,
        // o un choque de correo al crearla), se crea ahora: la sesión de pago ya
        // probó que quien llega es el dueño de la inscripción. Queda sin
        // contraseña utilizable hasta que el club defina una desde su panel.
        if (!account) {
            account = await ensureAccountFor(submission);
            if (!account) return res.status(409).json({ error: 'Este correo ya tiene una cuenta de otra postulación. Ingresa con ella o usa "Olvidé mi contraseña".' });
        }

        await db.query('UPDATE "ProjectFairAccount" SET "lastLoginAt" = NOW() WHERE id = $1', [account.id]);
        const session = await describePortalSession(account);
        res.json({ token: signToken(account), email: account.email, clubName: account.clubName, ...session });
    } catch (error) {
        console.error('[project-fair-portal] claim:', error);
        res.status(500).json({ error: 'No pudimos abrir tu panel.' });
    }
};

// POST /portal/forgot — enlace de acceso por correo
export const forgotPassword = async (req, res) => {
    try {
        await ensureTables();
        const email = clean(req.body?.email, 200).toLowerCase();
        // Respuesta idéntica exista o no la cuenta.
        const generic = { success: true, message: 'Si el correo está registrado, recibirás un enlace para restablecer tu contraseña.' };
        if (!isEmail(email)) return res.json(generic);

        const { rows } = await db.query('SELECT * FROM "ProjectFairAccount" WHERE lower(email) = $1 LIMIT 1', [email]);
        let account = rows[0];

        // Sin cuenta pero con inscripción: el club quedó sin forma de entrar.
        // Se le crea la cuenta y se le manda el enlace para que defina su
        // contraseña, en vez de dejarlo en un callejón sin salida.
        if (!account) {
            const pending = await db.query(
                'SELECT * FROM "ProjectFairSubmission" WHERE lower(email) = $1 ORDER BY "createdAt" DESC LIMIT 1', [email]);
            if (!pending.rows[0]) return res.json(generic);
            account = await ensureAccountFor(pending.rows[0]);
            if (!account) return res.json(generic);
            console.log(`[project-fair-portal] Cuenta creada al recuperar contraseña para ${email} (inscripción ${pending.rows[0].publicRef})`);
        }

        const token = jwt.sign({ sub: account.id, purpose: 'reset' }, JWT_SECRET, { expiresIn: '2h' });
        await db.query('UPDATE "ProjectFairAccount" SET "resetToken" = $1, "resetExpiry" = NOW() + interval \'2 hours\' WHERE id = $2', [token, account.id]);

        const cfg = await readConfigForAdmin();
        const origin = req.headers.origin || 'https://app.clubplatform.org';
        const link = `${origin}${cfg.portal?.path || '/mi-proyecto'}?reset=${encodeURIComponent(token)}`;
        await sendFairEmail({
            to: account.email,
            subject: `Restablece tu contraseña — ${cfg.edition?.name || 'Feria de Proyectos'}`,
            cfg,
            html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#1f2937">
                <h2 style="color:#17458F">Restablece tu contraseña</h2>
                <p>Recibimos una solicitud para restablecer la contraseña del panel de tu proyecto.</p>
                <p><a href="${link}" style="display:inline-block;background:#17458F;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold">Crear una contraseña nueva</a></p>
                <p style="font-size:13px;color:#6b7280">El enlace vence en 2 horas. Si no fuiste tú, puedes ignorar este correo.</p>
            </div>`,
        }).catch(() => {});
        res.json(generic);
    } catch (error) {
        console.error('[project-fair-portal] forgotPassword:', error);
        res.json({ success: true, message: 'Si el correo está registrado, recibirás un enlace para restablecer tu contraseña.' });
    }
};

// POST /portal/reset
export const resetPassword = async (req, res) => {
    try {
        await ensureTables();
        const token = clean(req.body?.token, 2000);
        const password = String(req.body?.password || '');
        if (password.length < PASSWORD_MIN) {
            return res.status(400).json({ error: `La contraseña debe tener al menos ${PASSWORD_MIN} caracteres.` });
        }
        let payload;
        try { payload = jwt.verify(token, JWT_SECRET); } catch { return res.status(400).json({ error: 'El enlace venció o no es válido.' }); }
        if (payload?.purpose !== 'reset') return res.status(400).json({ error: 'Enlace no válido.' });

        const { rows } = await db.query('SELECT * FROM "ProjectFairAccount" WHERE id = $1 AND "resetToken" = $2 AND "resetExpiry" > NOW() LIMIT 1', [payload.sub, token]);
        const account = rows[0];
        if (!account) return res.status(400).json({ error: 'El enlace ya fue usado o venció.' });

        const passwordHash = await bcrypt.hash(password, 10);
        await db.query('UPDATE "ProjectFairAccount" SET "passwordHash" = $1, "resetToken" = NULL, "resetExpiry" = NULL, "updatedAt" = NOW() WHERE id = $2', [passwordHash, account.id]);
        res.json({ token: signToken(account), email: account.email, clubName: account.clubName });
    } catch (error) {
        console.error('[project-fair-portal] resetPassword:', error);
        res.status(500).json({ error: 'No pudimos restablecer la contraseña.' });
    }
};

// ── Formulario maestro ───────────────────────────────────────────────
const loadForm = async (submissionId) => {
    const { rows } = await db.query('SELECT * FROM "ProjectFairMasterForm" WHERE "submissionId" = $1 LIMIT 1', [submissionId]);
    return rows[0] || null;
};

// Valores que se traen de la postulación inicial para no pedirlos dos veces.
// El destino de cada dato lo decide el mapa `prefill` de la plantilla, así que
// reordenar o renombrar las secciones del formulario no rompe la precarga.
// v4.642 — La precarga es común a todos los formularios (`seedAnswersFor`).
const seedAnswers = (submission, cfg) =>
    seedAnswersFor(resolveForm(cfg, 'master')?.template || cfg?.masterForm, submission, cfg);

// GET /portal/me
export const getPortalData = async (req, res) => {
    try {
        await ensureTables();
        const { rows } = await db.query('SELECT * FROM "ProjectFairSubmission" WHERE id = $1 LIMIT 1', [req.portal.submissionId]);
        let submission = rows[0];
        if (!submission) return res.status(404).json({ error: 'No encontramos tu inscripción.' });

        // ⚠️ SE PREGUNTA AL PROVEEDOR ANTES DE PINTAR NADA (v4.978). Un pago
        // puede estar confirmado en Stripe y todavía no acá —el webhook llegó
        // tarde, se perdió, o el club cerró la pestaña antes de volver—, y sin
        // esta consulta el panel diría «Pendiente de pago» sobre una
        // inscripción ya pagada y le ofrecería pagarla otra vez. Cuesta una
        // llamada, y sólo cuando hay algo que preguntar: `syncPaymentState`
        // corta enseguida si ya está pagada o si no hay sesión que consultar.
        submission = (await syncPaymentState(submission)).submission;

        // La convocatoria de SU edición, no la que esté abierta: el plazo, los
        // precios y la plantilla del formulario son los de la feria a la que
        // este club postuló. Ver `readConfigForSubmission`.
        const cfg = await readConfigForSubmission(submission.eventId || null);

        let form = await loadForm(submission.id);
        // v4.1253 — El borrador de la Formulación se siembra cuando el
        // formulario se puede abrir (postulación enviada y, sólo si la
        // Convocatoria lo exige, pago confirmado), no al confirmarse el pago.
        if (!form && formIsAvailable(submission, cfg)) {
            // Primera entrada con el formulario disponible: se crea precargado.
            const answers = seedAnswers(submission, cfg);
            const created = await db.query(`
                INSERT INTO "ProjectFairMasterForm" ("submissionId", answers, "completionPct", "lastEditedAt")
                VALUES ($1, $2::jsonb, $3, NOW())
                ON CONFLICT ("submissionId") DO NOTHING
                RETURNING *
            `, [submission.id, JSON.stringify(answers), completionOf(cfg.masterForm, answers)]);
            form = created.rows[0] || await loadForm(submission.id);
            await logEvent(submission.id, {
                type: 'form_started', title: 'Formulación iniciada',
                detail: 'El club abrió el formulario maestro por primera vez.',
                actor: { name: submission.email, role: 'club' },
            });
        }

        // El rol vive en la cuenta, no en la inscripción: es lo que el webhook
        // de Stripe mantiene. Si una inscripción quedó pagada antes de que
        // existiera el rol (o el webhook falló en otorgarlo), se repara aquí.
        // v4.1299 — La cuenta es la de la INSCRIPCIÓN: un segundo proyecto no
        // es el `submissionId` de la cuenta.
        let account = await accountForSubmission(submission);
        if (submission.status === 'paid' && account?.role !== APPLICANT_ROLES.MANAGER && account?.role !== APPLICANT_ROLES.SUSPENDED) {
            if (await grantProjectManagerRole(submission, { reason: 'reparación al abrir el panel' })) {
                account = (await accountForSubmission(submission)) || account;
            }
        }

        // v4.1299 — LA INSCRIPCIÓN ENTERA: sus proyectos (con un token para
        // gestionar cada uno), su desglose, qué cubre el pago que se abriría
        // ahora y qué puede hacer el club con el segundo proyecto. El pago que
        // se muestra es el de la ORDEN pendiente de la inscripción —anclada en
        // el primer proyecto que debe—, no el del proyecto que se está mirando.
        const siblings = await registrationRows(submission);
        const registration = registrationViewOf(submission, siblings, cfg, account, req);
        const pendingAnchor = coveredByCheckout(siblings)[0] || null;
        const payment = await paymentStateFor(pendingAnchor && !hasOpenPaymentFor(submission, siblings) ? pendingAnchor : submission, { siblings });

        const edit = editability(submission, form, cfg, account);
        res.json({
            role: account?.role || APPLICANT_ROLES.APPLICANT,
            roleLabel: ROLE_LABELS[account?.role || APPLICANT_ROLES.APPLICANT],
            submission: {
                id: submission.id, publicRef: submission.publicRef,
                projectName: submission.projectName, clubName: submission.clubName,
                district: submission.district, email: submission.email,
                paymentStatus: submission.status, paidAt: submission.paidAt,
                amountCop: submission.amountCop === null ? null : Number(submission.amountCop),
                amountUsd: submission.amountUsd === null ? null : Number(submission.amountUsd),
                receiptUrl: submission.receiptUrl,
                workflowStatus: submission.workflowStatus,
                projectIndex: projectIndexOf(submission),
                registrationId: submission.registrationId || null,
            },
            registration,
            activeProjectId: submission.id,
            // v4.1253 — La POSTULACIÓN, con su estado propio y separado del
            // pago, y lo que el perfil necesita para mostrarla (o para
            // terminarla, si todavía es un borrador).
            application: {
                ...applicationViewOf(submission),
                publicRef: submission.publicRef,
                responsible: [submission.firstName, submission.lastName].filter(Boolean).join(' '),
                createdAt: submission.createdAt,
                fields: {
                    projectName: submission.projectName || '',
                    projectDescription: submission.projectDescription || '',
                    focusArea: submission.focusArea || '',
                    focusAreaLabel: submission.focusAreaLabel || null,
                    budgetUsd: submission.budgetUsd === null || submission.budgetUsd === undefined ? null : Number(submission.budgetUsd),
                },
                acceptingApplications: cfg.enabled !== false,
            },
            // El veredicto del pago llega RESUELTO: estado, frase, si se puede
            // pagar, con qué rótulo y el historial de intentos. La pantalla lo
            // pinta y no vuelve a decidir nada — el navegador no es la fuente
            // de verdad del estado de un cobro.
            payment,
            form: form ? {
                status: form.status, answers: form.answers || {},
                completionPct: form.completionPct, submittedAt: form.submittedAt,
                lastEditedAt: form.lastEditedAt,
            } : null,
            template: cfg.masterForm,
            // v4.642 — Todos los formularios del proyecto, con su estado y su
            // avance: son las tarjetas de "Gestión de Proyectos". Un formulario
            // nuevo aparece aquí sólo con registrarlo.
            forms: await listPortalForms(submission, cfg, account),
            focusAreas: cfg.focusAreas || [],
            edition: cfg.edition,
            // El evento al que postula, para que el panel pueda identificarlo:
            // nombre, sede, fechas y el enlace a su ficha pública. Va aparte de
            // `edition` a propósito — uno es el evento real de la plataforma y
            // el otro el bloque de respaldo escrito a mano.
            event: await readEditionEvent(submission.eventId || null),
            deadline: cfg.deadline,
            portal: cfg.portal,
            nextStep: cfg.redirect,
            ...edit,
        });
    } catch (error) {
        console.error('[project-fair-portal] getPortalData:', error);
        res.status(500).json({ error: 'No pudimos cargar tu panel.' });
    }
};

// ── Completar o reintentar el pago desde el panel (v4.978) ───────────
/**
 * POST /portal/checkout
 *
 * ⚠️ ES LA SALIDA DEL CALLEJÓN. Hasta v4.977 el único sitio donde se podía
 * pagar era el wizard público, y sólo si se volvía a él con `?submission=` en
 * la URL —que nadie conserva—: un club cuya tarjeta fuera declinada quedaba
 * con los formularios bloqueados y sin ninguna acción a la vista. Acá el
 * reintento es una acción del panel, con la sesión del club, sin volver a
 * registrar el proyecto ni crear otra cuenta.
 *
 * La inscripción NO viene del cuerpo de la petición: sale del token
 * (`req.portal.submissionId`). Aceptarla del cliente dejaría que cualquiera
 * con este endpoint abriera un cobro contra la inscripción de otro.
 */
export const startCheckout = async (req, res) => {
    try {
        const cfg = await readConfigForAdmin().catch(() => null);
        // v4.1299 — El pago es de la INSCRIPCIÓN: se ancla en el primer
        // proyecto que debe (sea cual sea el que se está mirando), y cubre a
        // todos los que deben. Si ninguno debe, se deja que `beginCheckout`
        // responda sobre el actual (ya pagado, reembolsado o borrador).
        let anchorId = req.portal.submissionId;
        try {
            const own = await loadOwnSubmission(req);
            if (own) {
                const siblings = await registrationRows(own);
                anchorId = coveredByCheckout(siblings)[0]?.id || own.id;
            }
        } catch { /* se cobra sobre el actual */ }
        const result = await beginCheckout(anchorId, {
            req,
            returnUrl: req.body?.returnUrl,
            // v4.1253 — El pago iniciado desde el perfil vuelve al perfil.
            returnPath: cfg?.portal?.path || '/mi-proyecto',
            actor: { id: req.portal.sub, name: req.portal.email, role: 'club' },
        });

        // Ya estaba pagada —o acaba de confirmarse al sincronizar—. No es un
        // error y no se manda a nadie a un segundo cobro: se le devuelve el
        // estado nuevo para que la pantalla se actualice y desbloquee los
        // formularios sola.
        if (result.alreadyPaid) return res.json({ alreadyPaid: true, submission: result.submission });
        if (result.blocked) return res.status(result.status || 400).json({ error: result.error });

        res.json({ url: result.url, reused: !!result.reused });
    } catch (error) {
        console.error('[project-fair-portal] startCheckout:', error);
        res.status(500).json({ error: 'No pudimos iniciar el pago. Inténtalo de nuevo en un momento.' });
    }
};

// ── La postulación desde el perfil (v4.1253) ─────────────────────────
const loadOwnSubmission = async (req) => {
    await ensureTables();
    // La postulación sale del TOKEN, nunca del cuerpo: cada club sólo toca
    // la suya.
    const { rows } = await db.query('SELECT * FROM "ProjectFairSubmission" WHERE id = $1 LIMIT 1', [req.portal.submissionId]);
    return rows[0] || null;
};

/**
 * Los campos del PROYECTO que un borrador puede editar desde el perfil. La
 * identidad (nombre, documento, club, correo) quedó validada al crear la
 * cuenta y no se cambia por acá.
 */
const draftFieldsFrom = (body, submission) => ({
    projectName: body?.projectName ?? submission.projectName,
    projectDescription: body?.projectDescription ?? submission.projectDescription,
    focusArea: body?.focusArea ?? submission.focusArea,
    budgetUsd: body?.budgetUsd ?? submission.budgetUsd,
});

const asValidationBody = (submission, fields) => ({
    ...submission,
    // La fila guarda la clave del catálogo; el validador acepta clave o rótulo.
    clubRole: submission.clubRole, idType: submission.idType,
    ...fields,
});

// PUT /portal/application — guarda el borrador («En formulación»).
export const saveApplication = async (req, res) => {
    try {
        const submission = await loadOwnSubmission(req);
        if (!submission) return res.status(404).json({ error: 'No encontramos tu postulación.' });
        if (isApplied(submission)) return res.status(409).json({ error: 'Tu proyecto ya está postulado. Los cambios se hacen en los formularios del proyecto.' });

        const cfg = await readConfigForSubmission(submission.eventId || null);
        const { errors, data } = validateSubmission(asValidationBody(submission, draftFieldsFrom(req.body, submission)), cfg, { draft: true, skipPassword: true });
        const projectErrors = Object.fromEntries(Object.entries(errors).filter(([k]) => ['projectName', 'projectDescription', 'focusArea', 'budgetUsd'].includes(k)));
        if (Object.keys(projectErrors).length) return res.status(400).json({ error: 'Revisa los campos marcados.', fields: projectErrors });

        const { rows } = await db.query(`
            UPDATE "ProjectFairSubmission"
            SET "projectName" = $2, "projectDescription" = $3, "focusArea" = $4, "focusAreaLabel" = $5, "budgetUsd" = $6,
                "workflowStatus" = 'formulating', "updatedAt" = NOW()
            WHERE id = $1 AND COALESCE("workflowStatus",'received') IN ('draft','formulating')
            RETURNING *
        `, [submission.id, data.projectName, data.projectDescription || null, data.focusArea, data.focusAreaLabel, data.budgetUsd]);
        if (!rows[0]) return res.status(409).json({ error: 'Tu proyecto ya está postulado.' });
        res.json({ success: true, application: applicationViewOf(rows[0]) });
    } catch (error) {
        console.error('[project-fair-portal] saveApplication:', error);
        res.status(500).json({ error: 'No pudimos guardar tu borrador.' });
    }
};

/**
 * POST /portal/application/submit — envía formalmente la postulación de un
 * borrador. Valida TODO lo obligatorio, sella la fecha de postulación, deja
 * el proyecto «Postulado» con el pago «Pendiente» y manda la confirmación.
 *
 * ⚠️ ES UN UPDATE CONDICIONAL (`workflowStatus IN ('draft','formulating')`):
 * un doble clic o dos pestañas no postulan dos veces ni mandan dos correos —
 * la segunda petición no encuentra la fila en borrador y responde lo que ya
 * pasó. Tampoco crea una fila nueva: es la MISMA postulación, con su código.
 */
export const submitApplication = async (req, res) => {
    try {
        const submission = await loadOwnSubmission(req);
        if (!submission) return res.status(404).json({ error: 'No encontramos tu postulación.' });
        if (isApplied(submission)) return res.json({ success: true, alreadyApplied: true, application: applicationViewOf(submission) });

        const cfg = await readConfigForSubmission(submission.eventId || null);
        if (cfg.enabled === false) return res.status(403).json({ error: 'La convocatoria no está recibiendo postulaciones en este momento.' });

        const { errors, data } = validateSubmission(asValidationBody(submission, draftFieldsFrom(req.body, submission)), cfg, { skipPassword: true });
        if (Object.keys(errors).length) return res.status(400).json({ error: 'Completa los campos marcados para enviar tu postulación.', fields: errors });

        const { rows } = await db.query(`
            UPDATE "ProjectFairSubmission"
            SET "projectName" = $2, "projectDescription" = $3, "focusArea" = $4, "focusAreaLabel" = $5, "budgetUsd" = $6,
                "workflowStatus" = 'received', "appliedAt" = NOW(),
                metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('submittedAt', NOW()::text),
                "updatedAt" = NOW()
            WHERE id = $1 AND COALESCE("workflowStatus",'received') IN ('draft','formulating')
            RETURNING *
        `, [submission.id, data.projectName, data.projectDescription, data.focusArea, data.focusAreaLabel, data.budgetUsd]);
        const applied = rows[0];
        if (!applied) {
            const again = await loadOwnSubmission(req);
            return res.json({ success: true, alreadyApplied: true, application: applicationViewOf(again) });
        }

        await logEvent(applied.id, {
            type: 'form_submitted',
            title: 'Proyecto postulado',
            detail: `${applied.projectName} — ${applied.clubName} (${applied.district}). Enviado desde el perfil; pago de inscripción pendiente.`,
            actor: { name: req.portal.email, role: 'club' },
            metadata: { publicRef: applied.publicRef, from: 'portal' },
        });
        await notifyApplication(applied, cfg);
        res.json({ success: true, application: applicationViewOf(applied), publicRef: applied.publicRef });
    } catch (error) {
        console.error('[project-fair-portal] submitApplication:', error);
        res.status(500).json({ error: 'No pudimos enviar tu postulación.' });
    }
};

/**
 * GET /portal/receipt — el comprobante del pago, para verlo o imprimirlo
 * (v4.1253). Es la MISMA plantilla del correo que se manda al confirmarse el
 * pago: un segundo formato del comprobante diría cosas distintas del mismo
 * cobro. Sólo existe con el pago confirmado.
 */
export const getReceipt = async (req, res) => {
    try {
        const submission = await loadOwnSubmission(req);
        if (!submission) return res.status(404).json({ error: 'No encontramos tu inscripción.' });
        if (submission.status !== 'paid') return res.status(409).json({ error: 'El comprobante está disponible cuando el pago queda confirmado.' });
        const cfg = await readConfigForSubmission(submission.eventId || null);
        // v4.1299 — Un proyecto cubierto por el cobro de otro muestra el
        // comprobante de ESE cobro (la inscripción conjunta).
        let anchor = submission;
        const coveredBy = submission.metadata?.payment?.coveredBy;
        if (coveredBy) {
            const { rows } = await db.query('SELECT * FROM "ProjectFairSubmission" WHERE id = $1 LIMIT 1', [coveredBy]);
            if (rows[0]) anchor = rows[0];
        }
        res.json({ html: buildReceiptHtml(anchor, cfg), publicRef: anchor.publicRef, stripeReceiptUrl: anchor.receiptUrl || null });
    } catch (error) {
        console.error('[project-fair-portal] getReceipt:', error);
        res.status(500).json({ error: 'No pudimos generar tu comprobante.' });
    }
};

// ── La INSCRIPCIÓN del club (v4.1299) ────────────────────────────────

/** ¿Este proyecto es el ancla de un cobro todavía abierto (sesión viva)? */
const hasOpenPaymentFor = (submission, siblings) =>
    owesRegistration(submission) && coveredByCheckout(siblings)[0]?.id === submission.id;

/**
 * La vista de la inscripción para el perfil. El veredicto sobre el segundo
 * proyecto —se puede agregar, se restaura, por qué no— lo arma el criterio
 * puro; la pantalla lo pinta y no vuelve a decidir.
 */
const registrationViewOf = (submission, siblings, cfg, account, req) => {
    const rules = pricingRulesOf(cfg);
    const verdict = secondProjectVerdict(siblings, cfg);
    const breakdown = registrationBreakdown(siblings, rules);
    const exp = req?.portal?.exp || null;
    const visibles = siblings.filter(r => !r.archivedAt).sort((a, b) => projectIndexOf(a) - projectIndexOf(b));
    const projects = visibles.map(r => ({
        id: r.id,
        projectIndex: projectIndexOf(r),
        indexLabel: projectIndexLabel(projectIndexOf(r)),
        publicRef: r.publicRef,
        projectName: r.projectName,
        focusAreaLabel: r.focusAreaLabel || null,
        ...applicationViewOf(r),
        withdrawnByClub: !!r.metadata?.withdrawnByClub,
        active: isActiveProject(r),
        removable: removeProjectVerdict(r).ok,
        current: r.id === submission.id,
        // El token con el que se gestiona ESTE proyecto (formularios, videos,
        // recursos). Misma cuenta, mismo vencimiento.
        token: account ? issueProjectToken(account, r.id, { exp }) : null,
    }));
    const paidOrders = visibles
        .filter(r => String(r.status) === 'paid' && !r.metadata?.payment?.coveredBy)
        .map(r => {
            const pay = r.metadata?.payment || {};
            const cubiertos = Array.isArray(pay.coveredProjects) && pay.coveredProjects.length
                ? pay.coveredProjects
                : [{ id: r.id, publicRef: r.publicRef, projectName: r.projectName, projectIndex: projectIndexOf(r) }];
            return {
                anchorId: r.id,
                publicRef: r.publicRef,
                paidAt: r.paidAt || null,
                amount: r.amountReceived != null ? Number(r.amountReceived) : null,
                currency: r.chargeCurrency || rules.mode,
                origin: r.paymentConfirmationOrigin || 'stripe',
                receiptUrl: r.receiptUrl || null,
                projects: cubiertos.map(p => ({ id: p.id, publicRef: p.publicRef || null, projectName: p.projectName, projectIndex: p.projectIndex, indexLabel: projectIndexLabel(p.projectIndex) })),
            };
        });
    return {
        id: submission.registrationId || null,
        modality: breakdown.modality,
        count: breakdown.count,
        maxProjects: rules.maxProjects,
        currency: breakdown.currency,
        lines: breakdown.lines,
        total: breakdown.total,
        paidTotal: breakdown.paidTotal,
        pendingTotal: breakdown.pendingTotal,
        projects,
        paidOrders,
        secondProject: {
            enabled: rules.secondEnabled,
            amount: rules.second,
            firstAmount: rules.first,
            bundleTotal: modalityTotal(rules, 2),
            deadline: rules.secondDeadline,
            canAdd: verdict.ok && verdict.code !== 'restorable',
            canRestore: verdict.ok && verdict.code === 'restorable',
            restoreId: verdict.restoreId || null,
            code: verdict.code,
            reason: verdict.ok ? null : verdict.reason,
        },
    };
};

/** Los proyectos de la inscripción del club que está en sesión (la fila actual incluida). */
const ownRegistration = async (req) => {
    const own = await loadOwnSubmission(req);
    if (!own) return { own: null, siblings: [] };
    const siblings = await registrationRows(own);
    return { own, siblings };
};

/**
 * POST /portal/projects — AGREGAR UN SEGUNDO PROYECTO a la inscripción, con
 * la sesión del club. Vale tanto antes de pagar (la orden pasa a cubrir los
 * dos: 350.000) como con el primero ya pagado (se abre después un cobro
 * COMPLEMENTARIO de 100.000, independiente del original). El tope, la tarifa
 * y la fecha límite los decide la convocatoria de SU edición; el índice único
 * de la base impide que dos pestañas creen dos «segundos proyectos».
 */
export const addProject = async (req, res) => {
    try {
        const { own, siblings } = await ownRegistration(req);
        if (!own) return res.status(404).json({ error: 'No encontramos tu inscripción.' });
        const cfg = await readConfigForSubmission(own.eventId || null);
        const verdict = secondProjectVerdict(siblings, cfg);
        if (!verdict.ok) return res.status(409).json({ error: verdict.reason, code: verdict.code });
        if (verdict.code === 'restorable') {
            return res.status(409).json({
                error: 'Tu inscripción ya tiene un segundo proyecto retirado. Puedes restaurarlo en vez de crear otro.',
                code: 'restorable', restoreId: verdict.restoreId,
            });
        }
        const primary = activeProjects(siblings)[0] || own;
        const draft = String(req.body?.mode || '').toLowerCase() === 'draft';
        const fields = Object.fromEntries(PROJECT_FIELDS.map(k => [k, req.body?.[k]]));
        const { errors, data } = validateSubmission({ ...primary, clubRole: primary.clubRole, idType: primary.idType, ...fields }, cfg, { draft, skipPassword: true });
        const projectErrors = Object.fromEntries(Object.entries(errors).filter(([k]) => PROJECT_FIELDS.includes(k)));
        if (Object.keys(projectErrors).length) return res.status(400).json({ error: 'Revisa los campos marcados.', fields: projectErrors });

        let trm = null;
        if (resolvePriceMode(cfg) === 'COP') { try { trm = await resolveTrm(cfg); } catch { /* sin equivalente */ } }
        let created;
        try {
            created = await insertProjectRow({
                cfg, eventId: own.eventId || null, data: primary,
                project: Object.fromEntries([...PROJECT_FIELDS, 'focusAreaLabel'].map(k => [k, data[k]])),
                registrationId: own.registrationId || null, projectIndex: verdict.nextIndex || 2, draft, trm, req,
            });
        } catch (err) {
            // El índice único (inscripción, posición) ganó la carrera por él.
            if (String(err?.code) === '23505') return res.status(409).json({ error: 'Tu inscripción ya tiene un segundo proyecto. Actualiza la página.' });
            throw err;
        }
        if (own.registrationId) {
            await db.query(`UPDATE "ProjectFairRegistration" SET modality = $2, "updatedAt" = NOW() WHERE id = $1`, [own.registrationId, modalityOf(activeProjects([...siblings, created]).length)]).catch(() => {});
        }
        await logEvent(created.id, draft ? {
            type: 'draft_saved', title: 'Borrador guardado',
            detail: `${created.projectName} — segundo proyecto de la inscripción ${primary.publicRef}.`,
            actor: { name: req.portal.email, role: 'club' },
            metadata: { publicRef: created.publicRef, registrationId: own.registrationId || null, projectIndex: created.projectIndex, addedFrom: 'portal' },
        } : {
            type: 'form_submitted', title: 'Proyecto postulado',
            detail: `${created.projectName} — segundo proyecto de la inscripción ${primary.publicRef}. Pago de inscripción pendiente (tarifa del segundo proyecto).`,
            actor: { name: req.portal.email, role: 'club' },
            metadata: { publicRef: created.publicRef, registrationId: own.registrationId || null, projectIndex: created.projectIndex, addedFrom: 'portal' },
        });
        await logEvent(primary.id, {
            type: 'project_added', title: 'Segundo proyecto agregado a la inscripción',
            detail: `${created.projectName} (${created.publicRef})${draft ? ', como borrador' : ''}.`,
            actor: { name: req.portal.email, role: 'club' },
            metadata: { projectId: created.id, projectIndex: created.projectIndex },
        });
        if (!draft) await notifyApplication(created, cfg);

        const account = await accountForSubmission(own);
        res.status(201).json({
            success: true,
            project: {
                id: created.id, projectIndex: projectIndexOf(created), publicRef: created.publicRef, projectName: created.projectName,
                ...applicationViewOf(created),
                token: account ? issueProjectToken(account, created.id, { exp: req.portal?.exp || null }) : null,
            },
        });
    } catch (error) {
        console.error('[project-fair-portal] addProject:', error);
        res.status(500).json({ error: 'No pudimos agregar el segundo proyecto.' });
    }
};

/**
 * POST /portal/projects/:id/withdraw — QUITAR el segundo proyecto antes de
 * pagar (volver de dos a uno). No se borra nada: queda «Retirado» con su
 * información intacta y la marca de que lo retiró el club, para poder
 * restaurarlo. Un proyecto ya pagado no se quita por acá.
 */
export const withdrawProject = async (req, res) => {
    try {
        const { own, siblings } = await ownRegistration(req);
        if (!own) return res.status(404).json({ error: 'No encontramos tu inscripción.' });
        const target = siblings.find(r => r.id === clean(req.params.id, 80));
        if (!target) return res.status(404).json({ error: 'Ese proyecto no pertenece a tu inscripción.' });
        const verdict = removeProjectVerdict(target);
        if (!verdict.ok) return res.status(409).json({ error: verdict.reason, code: verdict.code });

        const { rows } = await db.query(`
            UPDATE "ProjectFairSubmission"
            SET "workflowStatus" = 'withdrawn',
                metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb,
                "updatedAt" = NOW()
            WHERE id = $1 AND status NOT IN ('paid','refunded') AND COALESCE("workflowStatus",'received') <> 'withdrawn'
            RETURNING *
        `, [target.id, JSON.stringify({ withdrawnByClub: { at: new Date().toISOString(), previousState: projectStateOf(target), by: req.portal.email } })]);
        if (!rows[0]) return res.status(409).json({ error: 'Ese proyecto ya no se puede quitar.' });
        if (own.registrationId) {
            await db.query(`UPDATE "ProjectFairRegistration" SET modality = $2, "updatedAt" = NOW() WHERE id = $1`,
                [own.registrationId, modalityOf(activeProjects(siblings.map(r => (r.id === target.id ? rows[0] : r))).length)]).catch(() => {});
        }
        await logEvent(target.id, {
            type: 'status_change', title: 'Proyecto retirado por el club',
            detail: 'El club quitó este segundo proyecto de su inscripción antes de pagar. Su información se conserva y puede restaurarse.',
            actor: { name: req.portal.email, role: 'club' },
            metadata: { from: projectStateOf(target), to: 'withdrawn', byClub: true },
        });
        res.json({ success: true, project: { id: rows[0].id, ...applicationViewOf(rows[0]) } });
    } catch (error) {
        console.error('[project-fair-portal] withdrawProject:', error);
        res.status(500).json({ error: 'No pudimos quitar el proyecto.' });
    }
};

/**
 * POST /portal/projects/:id/restore — RESTAURAR un segundo proyecto que el
 * club había quitado. Vuelve a su estado anterior (borrador o postulado) y
 * la orden pendiente vuelve a cubrirlo. Sólo si la convocatoria sigue
 * admitiendo el segundo proyecto.
 */
export const restoreProject = async (req, res) => {
    try {
        const { own, siblings } = await ownRegistration(req);
        if (!own) return res.status(404).json({ error: 'No encontramos tu inscripción.' });
        const target = siblings.find(r => r.id === clean(req.params.id, 80));
        if (!target) return res.status(404).json({ error: 'Ese proyecto no pertenece a tu inscripción.' });
        if (projectStateOf(target) !== 'withdrawn' || !target.metadata?.withdrawnByClub) {
            return res.status(409).json({ error: 'Ese proyecto no fue retirado por el club.' });
        }
        const cfg = await readConfigForSubmission(own.eventId || null);
        const verdict = secondProjectVerdict(siblings, cfg);
        if (!verdict.ok) return res.status(409).json({ error: verdict.reason, code: verdict.code });

        const previous = String(target.metadata.withdrawnByClub.previousState || 'received');
        const { rows } = await db.query(`
            UPDATE "ProjectFairSubmission"
            SET "workflowStatus" = $2,
                metadata = (COALESCE(metadata, '{}'::jsonb) - 'withdrawnByClub') || $3::jsonb,
                "updatedAt" = NOW()
            WHERE id = $1 AND COALESCE("workflowStatus",'received') = 'withdrawn'
            RETURNING *
        `, [target.id, previous, JSON.stringify({ restoredByClubAt: new Date().toISOString() })]);
        if (!rows[0]) return res.status(409).json({ error: 'Ese proyecto ya no está retirado.' });
        if (own.registrationId) {
            await db.query(`UPDATE "ProjectFairRegistration" SET modality = 'double', "updatedAt" = NOW() WHERE id = $1`, [own.registrationId]).catch(() => {});
        }
        await logEvent(target.id, {
            type: 'status_change', title: 'Proyecto restaurado por el club',
            detail: 'El club volvió a incluir este segundo proyecto en su inscripción.',
            actor: { name: req.portal.email, role: 'club' },
            metadata: { from: 'withdrawn', to: previous, byClub: true },
        });
        res.json({ success: true, project: { id: rows[0].id, ...applicationViewOf(rows[0]) } });
    } catch (error) {
        console.error('[project-fair-portal] restoreProject:', error);
        res.status(500).json({ error: 'No pudimos restaurar el proyecto.' });
    }
};

// ── Rutas heredadas de la Formulación ────────────────────────────────
// PUT /portal/form y POST /portal/form/submit siguen existiendo para no
// romper una pestaña abierta con la versión anterior del panel, pero ya no
// tienen lógica propia: son el formulario 'master' del controlador común.
// Toda mejora (validación de formato, historial por formulario, campos
// derivados) les llega sola.
const asMasterForm = (handler) => (req, res) => {
    req.params = { ...req.params, formKey: 'master' };
    return handler(req, res);
};

export const saveForm = asMasterForm(saveProjectForm);
export const submitForm = asMasterForm(submitProjectForm);
