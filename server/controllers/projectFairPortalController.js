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
import { ensureTables, logEvent, readConfigForAdmin, sendFairEmail, APPLICANT_ROLES, grantProjectManagerRole } from './projectFairController.js';
import { completionOf } from '../lib/projectFairMasterForm.js';
import { resolveForm } from '../lib/projectFormsRegistry.js';
import {
    editability, listPortalForms, seedAnswersFor,
    saveForm as saveProjectForm, submitForm as submitProjectForm,
} from './projectFormsController.js';

console.log('[projectFairPortalController] v4.642.0 cargado — Panel del club: varios formularios por proyecto (Formulación + Solicitud de Aportes del FDD)');

// La edición de un formulario la decide un solo lugar, compartido por todos
// (`projectFormsController`). Se reexporta porque este módulo era su casa.
export { editability };

const JWT_SECRET = process.env.JWT_SECRET || 'rotary_secret_key_2026';
// Audiencia propia: un token del panel administrativo no sirve aquí, ni al revés.
const PORTAL_AUDIENCE = 'project-fair-portal';
const TOKEN_TTL = '30d';

const clean = (v, max = 250) => String(v ?? '').trim().slice(0, max);
const isEmail = (v) => /^\S+@\S+\.\S+$/.test(String(v || ''));

const signToken = (account) => jwt.sign(
    { sub: account.id, submissionId: account.submissionId, email: account.email, aud: PORTAL_AUDIENCE },
    JWT_SECRET,
    { expiresIn: TOKEN_TTL }
);

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

// ── Cuenta ───────────────────────────────────────────────────────────
export const PASSWORD_MIN = 8;

/**
 * Crea la cuenta del club junto con su postulación. Se llama desde
 * `createSubmission`: la cuenta existe desde que envía el formulario, aunque
 * el pago aún no se haya confirmado, para que pueda volver y reintentar.
 */
export const createAccountFor = async (submission, password) => {
    if (!password || String(password).length < PASSWORD_MIN) return null;
    const passwordHash = await bcrypt.hash(String(password), 10);
    try {
        const { rows } = await db.query(`
            INSERT INTO "ProjectFairAccount" ("submissionId", email, "passwordHash", "clubName")
            VALUES ($1,$2,$3,$4)
            ON CONFLICT ("submissionId") DO UPDATE SET "passwordHash" = EXCLUDED."passwordHash", "updatedAt" = NOW()
            RETURNING *
        `, [submission.id, String(submission.email).toLowerCase(), passwordHash, submission.clubName]);
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
    const existing = await db.query('SELECT * FROM "ProjectFairAccount" WHERE "submissionId" = $1 LIMIT 1', [submission.id]);
    if (existing.rows[0]) return existing.rows[0];
    try {
        const { rows } = await db.query(`
            INSERT INTO "ProjectFairAccount" ("submissionId", email, "passwordHash", "clubName")
            VALUES ($1,$2,$3,$4)
            RETURNING *
        `, [submission.id, String(submission.email).toLowerCase(), UNUSABLE_HASH, submission.clubName]);
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
        if (!isEmail(email)) return res.json({ hasProject: false });

        const { rows } = await db.query(`
            SELECT * FROM "ProjectFairSubmission"
            WHERE lower(email) = $1
            ORDER BY (status = 'paid') DESC, "createdAt" DESC
            LIMIT 1`, [email]);
        const submission = rows[0];
        if (!submission) return res.json({ hasProject: false });

        const account = await ensureAccountFor(submission);
        if (!account) return res.json({ hasProject: false });

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
    const { rows } = await db.query(
        'SELECT id, "publicRef", "projectName", "clubName", district, status, "workflowStatus" FROM "ProjectFairSubmission" WHERE id = $1',
        [account.submissionId]
    );
    return rows.map(r => ({
        id: r.id, publicRef: r.publicRef, projectName: r.projectName,
        clubName: r.clubName, district: r.district,
        paymentStatus: r.status, workflowStatus: r.workflowStatus,
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
export const authenticatePortal = async (email, password) => {
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
    return { ok: true, account, token: signToken(account) };
};

// POST /portal/login
export const login = async (req, res) => {
    try {
        const email = clean(req.body?.email, 200).toLowerCase();
        const password = String(req.body?.password || '');
        if (!isEmail(email) || !password) return res.status(400).json({ error: 'Ingresa tu correo y contraseña.' });

        const result = await authenticatePortal(email, password);
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

        const accountRes = await db.query('SELECT * FROM "ProjectFairAccount" WHERE "submissionId" = $1 LIMIT 1', [submissionId]);
        let account = accountRes.rows[0];

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
        const cfg = await readConfigForAdmin();
        const { rows } = await db.query('SELECT * FROM "ProjectFairSubmission" WHERE id = $1 LIMIT 1', [req.portal.submissionId]);
        const submission = rows[0];
        if (!submission) return res.status(404).json({ error: 'No encontramos tu inscripción.' });

        let form = await loadForm(submission.id);
        if (!form && submission.status === 'paid') {
            // Primera entrada tras el pago: se crea el borrador precargado.
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
        const accountRes = await db.query('SELECT * FROM "ProjectFairAccount" WHERE "submissionId" = $1 LIMIT 1', [submission.id]);
        let account = accountRes.rows[0];
        if (submission.status === 'paid' && account?.role !== APPLICANT_ROLES.MANAGER && account?.role !== APPLICANT_ROLES.SUSPENDED) {
            if (await grantProjectManagerRole(submission, { reason: 'reparación al abrir el panel' })) {
                const refreshed = await db.query('SELECT * FROM "ProjectFairAccount" WHERE "submissionId" = $1 LIMIT 1', [submission.id]);
                account = refreshed.rows[0] || account;
            }
        }

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
            },
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
