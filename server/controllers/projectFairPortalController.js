// ════════════════════════════════════════════════════════════════════
// Panel del club — Formulación del proyecto
// v4.608.0
//
// Espacio privado del club que ya se inscribió y pagó. Ahí formula su
// proyecto con el formulario maestro, lo guarda cuantas veces quiera y lo
// envía al comité.
//
// SEGURIDAD — decisión deliberada: la cuenta del postulante NO vive en la
// tabla `User` de la plataforma. El guardián de rutas del panel
// administrativo (`PrivateRoute`) sólo comprueba que haya sesión iniciada,
// así que un usuario de esa tabla podría alcanzar pantallas de /admin. Por
// eso el club tiene identidad propia (`ProjectFairAccount`) y un token con
// audiencia distinta, que el middleware de abajo exige explícitamente.
// ════════════════════════════════════════════════════════════════════
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import Stripe from 'stripe';
import db from '../lib/db.js';
import { ensureTables, logEvent, readConfigForAdmin, sendFairEmail } from './projectFairController.js';
import { completionOf, missingRequired } from '../lib/projectFairMasterForm.js';

console.log('[projectFairPortalController] v4.618.0 cargado — Panel del club: cuenta propia, formulario maestro y envío al comité');

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

/** ¿El correo ya tiene cuenta? Lo usa el formulario para avisar en vivo. */
export const checkEmail = async (req, res) => {
    await ensureTables();
    const email = clean(req.query.email, 200).toLowerCase();
    if (!isEmail(email)) return res.json({ exists: false });
    const { rows } = await db.query('SELECT id FROM "ProjectFairAccount" WHERE lower(email) = $1 LIMIT 1', [email]);
    res.json({ exists: rows.length > 0 });
};

// POST /portal/login
export const login = async (req, res) => {
    try {
        await ensureTables();
        const email = clean(req.body?.email, 200).toLowerCase();
        const password = String(req.body?.password || '');
        if (!isEmail(email) || !password) return res.status(400).json({ error: 'Ingresa tu correo y contraseña.' });

        const { rows } = await db.query('SELECT * FROM "ProjectFairAccount" WHERE lower(email) = $1 LIMIT 1', [email]);
        const account = rows[0];
        // Una cuenta creada por el sistema todavía no tiene contraseña elegida:
        // se le dice explícitamente que la defina, en vez de dejarlo probando
        // credenciales que nunca van a funcionar.
        if (account && account.passwordHash === UNUSABLE_HASH) {
            return res.status(409).json({
                error: 'Tu proyecto está registrado pero aún no tiene contraseña. Usa "Olvidé mi contraseña" para crear una.',
                needsPassword: true,
            });
        }
        // Mismo mensaje para correo inexistente y contraseña incorrecta: no se
        // revela qué correos están registrados.
        const ok = account && await bcrypt.compare(password, account.passwordHash).catch(() => false);
        if (!ok) return res.status(401).json({ error: 'Correo o contraseña incorrectos.' });

        await db.query('UPDATE "ProjectFairAccount" SET "lastLoginAt" = NOW() WHERE id = $1', [account.id]);
        res.json({ token: signToken(account), email: account.email, clubName: account.clubName });
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
        res.json({ token: signToken(account), email: account.email, clubName: account.clubName, needsPassword: !account.passwordHash || account.passwordHash === UNUSABLE_HASH });
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

/**
 * ¿Puede el club editar? La convocatoria confirmada permite editar hasta la
 * fecha límite; después queda en solo lectura salvo que el administrador
 * reabra el formulario.
 */
export const editability = (submission, form, cfg) => {
    if (submission?.status !== 'paid') {
        return { canEdit: false, reason: 'Tu formulario se habilita cuando se confirme el pago de la inscripción.' };
    }
    if (form?.lockedAt && !form?.reopenedAt) {
        return { canEdit: false, reason: 'El comité cerró la edición de este formulario.' };
    }
    const deadline = cfg?.deadline ? new Date(`${cfg.deadline}T23:59:59-05:00`) : null;
    if (deadline && !Number.isNaN(deadline.getTime()) && new Date() > deadline && !form?.reopenedAt) {
        return { canEdit: false, reason: `El plazo de postulación cerró el ${cfg.deadline}. Escríbenos si necesitas hacer un ajuste.` };
    }
    return { canEdit: true, reason: null };
};

// Valores que se traen de la postulación inicial para no pedirlos dos veces.
// El destino de cada dato lo decide el mapa `prefill` de la plantilla, así que
// reordenar o renombrar las secciones del formulario no rompe la precarga.
const seedAnswers = (submission, cfg) => {
    const sources = {
        projectName: submission.projectName || '',
        clubName: submission.clubName || '',
        district: submission.district || '',
        city: '',
        country: cfg?.edition?.country || 'Colombia',
        focusArea: submission.focusAreaLabel ? [submission.focusAreaLabel] : [],
        contactName: `${submission.firstName || ''} ${submission.lastName || ''}`.trim(),
        contactEmail: submission.email || '',
        contactPhone: submission.phone || '',
        budgetUsd: submission.budgetUsd ? Number(submission.budgetUsd) : '',
    };

    const prefill = cfg?.masterForm?.prefill || {};
    const answers = {};
    for (const [source, target] of Object.entries(prefill)) {
        const value = sources[source];
        if (value === undefined || value === '' || (Array.isArray(value) && !value.length)) continue;
        const [sectionKey, fieldKey] = String(target).split('.');
        if (!sectionKey || !fieldKey) continue;
        answers[sectionKey] = { ...(answers[sectionKey] || {}), [fieldKey]: value };
    }
    return answers;
};

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

        const edit = editability(submission, form, cfg);
        res.json({
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

// PUT /portal/form — guardar borrador (lo llama el autoguardado)
export const saveForm = async (req, res) => {
    try {
        await ensureTables();
        const cfg = await readConfigForAdmin();
        const { rows } = await db.query('SELECT * FROM "ProjectFairSubmission" WHERE id = $1 LIMIT 1', [req.portal.submissionId]);
        const submission = rows[0];
        if (!submission) return res.status(404).json({ error: 'No encontramos tu inscripción.' });

        const form = await loadForm(submission.id);
        const edit = editability(submission, form, cfg);
        if (!edit.canEdit) return res.status(403).json({ error: edit.reason });

        const answers = req.body?.answers && typeof req.body.answers === 'object' ? req.body.answers : {};
        const pct = completionOf(cfg.masterForm, answers);

        const { rows: saved } = await db.query(`
            INSERT INTO "ProjectFairMasterForm" ("submissionId", answers, "completionPct", "lastEditedAt")
            VALUES ($1, $2::jsonb, $3, NOW())
            ON CONFLICT ("submissionId") DO UPDATE
            SET answers = $2::jsonb, "completionPct" = $3, "lastEditedAt" = NOW(), "updatedAt" = NOW()
            RETURNING *
        `, [submission.id, JSON.stringify(answers), pct]);

        // Historial: se guarda una revisión por envío explícito y, en los
        // autoguardados, como máximo una cada 10 minutos, para no llenar la
        // tabla con cada tecleo.
        const last = await db.query(
            `SELECT "createdAt" FROM "ProjectFairFormRevision" WHERE "submissionId" = $1 ORDER BY "createdAt" DESC LIMIT 1`,
            [submission.id]
        );
        const lastAt = last.rows[0]?.createdAt ? new Date(last.rows[0].createdAt).getTime() : 0;
        if (Date.now() - lastAt > 10 * 60 * 1000) {
            await db.query(`
                INSERT INTO "ProjectFairFormRevision" ("submissionId", answers, "completionPct", action, "actorType", "actorName")
                VALUES ($1,$2::jsonb,$3,'save','club',$4)
            `, [submission.id, JSON.stringify(answers), pct, submission.email]).catch(() => {});
        }

        res.json({ completionPct: pct, savedAt: saved[0].lastEditedAt, status: saved[0].status });
    } catch (error) {
        console.error('[project-fair-portal] saveForm:', error);
        res.status(500).json({ error: 'No pudimos guardar los cambios.' });
    }
};

// POST /portal/form/submit
export const submitForm = async (req, res) => {
    try {
        await ensureTables();
        const cfg = await readConfigForAdmin();
        const { rows } = await db.query('SELECT * FROM "ProjectFairSubmission" WHERE id = $1 LIMIT 1', [req.portal.submissionId]);
        const submission = rows[0];
        if (!submission) return res.status(404).json({ error: 'No encontramos tu inscripción.' });

        const form = await loadForm(submission.id);
        const edit = editability(submission, form, cfg);
        if (!edit.canEdit) return res.status(403).json({ error: edit.reason });

        const answers = req.body?.answers && typeof req.body.answers === 'object' ? req.body.answers : (form?.answers || {});
        const missing = missingRequired(cfg.masterForm, answers);
        if (missing.length) {
            return res.status(400).json({ error: 'Faltan campos obligatorios por completar.', missing });
        }

        const pct = completionOf(cfg.masterForm, answers);
        const { rows: saved } = await db.query(`
            INSERT INTO "ProjectFairMasterForm" ("submissionId", answers, "completionPct", status, "submittedAt", "lastEditedAt")
            VALUES ($1,$2::jsonb,$3,'submitted',NOW(),NOW())
            ON CONFLICT ("submissionId") DO UPDATE
            SET answers = $2::jsonb, "completionPct" = $3, status = 'submitted',
                "submittedAt" = NOW(), "lastEditedAt" = NOW(), "updatedAt" = NOW()
            RETURNING *
        `, [submission.id, JSON.stringify(answers), pct]);

        await db.query(`
            INSERT INTO "ProjectFairFormRevision" ("submissionId", answers, "completionPct", action, "actorType", "actorName")
            VALUES ($1,$2::jsonb,$3,'submit','club',$4)
        `, [submission.id, JSON.stringify(answers), pct, submission.email]).catch(() => {});

        // La postulación entra a revisión salvo que ya esté más avanzada.
        await db.query(`
            UPDATE "ProjectFairSubmission"
            SET "workflowStatus" = CASE WHEN "workflowStatus" IN ('payment_confirmed','received','pending_payment')
                                        THEN 'in_review' ELSE "workflowStatus" END,
                "updatedAt" = NOW()
            WHERE id = $1
        `, [submission.id]);

        await logEvent(submission.id, {
            type: 'form_submitted_master',
            title: 'Formulario del proyecto enviado',
            detail: `El club envió la formulación completa (${pct}%).`,
            actor: { name: submission.email, role: 'club' },
        });

        res.json({ status: 'submitted', completionPct: pct, submittedAt: saved[0].submittedAt });
    } catch (error) {
        console.error('[project-fair-portal] submitForm:', error);
        res.status(500).json({ error: 'No pudimos enviar el formulario.' });
    }
};
