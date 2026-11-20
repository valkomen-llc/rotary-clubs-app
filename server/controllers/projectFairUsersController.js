// ════════════════════════════════════════════════════════════════════
// Usuarios de la Feria de Proyectos — v4.1342.0
//
// Pedido del comité: «Mónica Gaitán no recibe el correo de recuperar
// contraseña y no recuerda la suya». Hasta ahora el comité no tenía cómo ver
// las cuentas que se crean al postular un proyecto o al inscribirse al evento,
// ni cómo devolverle el acceso a quien lo perdió.
//
// Dos clases de cuenta, cada una en su tabla y con su propio inicio de sesión:
//
//   project   «Gestor de proyecto»   ProjectFairAccount   (/mi-proyecto)
//   attendee  «Asistente al evento»  EventAttendeeAccount (/mi-inscripcion)
//
// Qué puede hacer el comité (sólo el perfil «admin» de la Feria,
// capacidad `manageUsers`):
//
//   · ver las cuentas de la EDICIÓN abierta y su perfil (proyectos,
//     inscripciones, último ingreso, si tiene contraseña);
//   · ASIGNAR una contraseña nueva (escrita o generada). La contraseña se
//     devuelve UNA vez en la respuesta y nunca se guarda en claro ni en la
//     bitácora: sólo su hash bcrypt, igual que el restablecimiento del club;
//   · GENERAR un enlace de restablecimiento para copiarlo y mandarlo por
//     WhatsApp, y opcionalmente por correo, informando si el correo salió.
//
// ⚠️ La contraseña de una cuenta de asistente VINCULADA (`linkedRealm`) vive
// en su identidad de origen (v4.692): no se le asigna una propia, porque eso
// sería crear la segunda credencial que el vínculo existe para evitar.
//
// Cada acción queda en `FairUserAccessLog` (quién, cuándo, qué), sin la
// contraseña, y, para un gestor, también en la línea de tiempo del proyecto.
// ════════════════════════════════════════════════════════════════════
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from '../lib/db.js';
import { ensureTables, logEvent, sendFairEmail, readConfigForAdmin } from './projectFairController.js';
import { withAccess, actorFrom } from './projectFairAdminController.js';
import { ensureEventRegistrationSchema } from '../lib/ensureEventRegistrationSchema.js';
import { editionEventIdOf } from '../lib/exchangeStore.js';
import { generateTemporaryPassword } from '../lib/completedAccountSpec.js';
import {
    USER_REALMS, PASSWORD_MIN, UNUSABLE_HASH, passwordProblem, accessStateOf, accessStateMeta,
    canSetPassword, realmLabel, resetLinkPath,
} from '../lib/fairUsersSpec.js';

console.log('[projectFairUsersController] v4.1342.0 cargado — Usuarios de la Feria: cuentas de gestores de proyecto y de asistentes al evento de la edición, perfil, contraseña asignada por el comité (sólo el hash) y enlace de restablecimiento para copiar, con bitácora.');

const JWT_SECRET = process.env.JWT_SECRET || 'rotary_secret_key_2026';
// El enlace que entrega el comité se manda a mano (WhatsApp): dura más que
// las 2 horas del que pide la persona desde «Olvidé mi contraseña».
const ADMIN_RESET_HOURS = 24;
const PAGE_SIZE = 25;

const clean = (v, max = 250) => String(v ?? '').trim().slice(0, max);
const cleanId = (v) => (/^[A-Za-z0-9_-]{1,80}$/.test(String(v || '')) ? String(v) : '');

// ── Bitácora ─────────────────────────────────────────────────────────
let schemaReady = null;
const ensureUsersSchema = () => {
    if (!schemaReady) {
        schemaReady = (async () => {
            await ensureTables();
            await ensureEventRegistrationSchema();
            await db.query(`
                CREATE TABLE IF NOT EXISTS "FairUserAccessLog" (
                    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
                    "eventId" TEXT,
                    realm VARCHAR(20) NOT NULL,
                    "accountId" TEXT NOT NULL,
                    email VARCHAR(200),
                    action VARCHAR(40) NOT NULL,
                    "actorId" TEXT,
                    "actorEmail" VARCHAR(200),
                    "actorRole" VARCHAR(40),
                    detail JSONB DEFAULT '{}',
                    "createdAt" TIMESTAMPTZ DEFAULT NOW()
                );
            `);
            await db.query('CREATE INDEX IF NOT EXISTS "FairUserAccessLog_account_idx" ON "FairUserAccessLog" (realm, "accountId", "createdAt")').catch(() => {});
        })().catch((err) => { schemaReady = null; throw err; });
    }
    return schemaReady;
};

const audit = async (req, access, { eventId, realm, account, action, detail = {} }) => {
    const actor = actorFrom(req, access);
    await db.query(`
        INSERT INTO "FairUserAccessLog" ("eventId", realm, "accountId", email, action, "actorId", "actorEmail", "actorRole", detail)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)
    `, [eventId || null, realm, account.id, account.email || null, action, actor.id, req.user?.email || null, actor.role, JSON.stringify(detail)])
        .catch(err => console.error('[fair-users] bitácora:', err?.message));
    // Para un gestor, también en la línea de tiempo del proyecto.
    if (realm === 'project' && account.submissionId) {
        const titles = {
            password_set: 'El comité asignó una contraseña nueva a la cuenta del proyecto',
            reset_link: 'El comité generó un enlace para restablecer la contraseña',
        };
        if (titles[action]) {
            await logEvent(account.submissionId, {
                type: `account_${action}`, title: titles[action],
                detail: `Cuenta ${account.email}`, actor, metadata: { realm, ...detail },
            });
        }
    }
};

// ── Lectura ──────────────────────────────────────────────────────────

const PROJECT_SELECT = `
    SELECT a.id, a.email, a."clubName", a.role, a."lastLoginAt", a."createdAt", a."updatedAt", a."submissionId", a."registrationId",
           (a."passwordHash" IS NOT NULL AND a."passwordHash" <> '${UNUSABLE_HASH}') AS "hasPassword",
           (a."resetExpiry" IS NOT NULL AND a."resetExpiry" > NOW()) AS "resetPending",
           s."firstName", s."lastName", s.phone, s.district, s."eventId",
           COALESCE(p.items, '[]'::json) AS projects
      FROM "ProjectFairAccount" a
      LEFT JOIN "ProjectFairSubmission" s ON s.id = a."submissionId"
      LEFT JOIN LATERAL (
          SELECT json_agg(json_build_object('id', x.id, 'publicRef', x."publicRef", 'projectName', x."projectName",
                                            'workflowStatus', x."workflowStatus", 'paymentStatus', x.status) ORDER BY x."createdAt") AS items
            FROM "ProjectFairSubmission" x
           WHERE x."archivedAt" IS NULL
             AND (x.id = a."submissionId" OR (a."registrationId" IS NOT NULL AND x."registrationId" = a."registrationId"))
      ) p ON TRUE`;

// La cuenta es de la edición si su proyecto principal o alguno de su
// inscripción es de esa edición.
const PROJECT_EDITION = `($1::text IS NULL OR s."eventId" = $1 OR EXISTS (
        SELECT 1 FROM "ProjectFairSubmission" e
         WHERE a."registrationId" IS NOT NULL AND e."registrationId" = a."registrationId" AND e."eventId" = $1))`;

const ATTENDEE_SELECT = `
    SELECT a.id, a.email, a."firstName", a."lastName", a.phone, a.status, a.role, a."linkedRealm", a."linkedId",
           a."lastLoginAt", a."createdAt", a."updatedAt", a."mustChangePassword", a."emailVerifiedAt",
           (a."passwordHash" IS NOT NULL AND a."passwordHash" <> '${UNUSABLE_HASH}') AS "hasPassword",
           (a."resetExpiry" IS NOT NULL AND a."resetExpiry" > NOW()) AS "resetPending",
           COALESCE(r.items, '[]'::json) AS registrations, COALESCE(r.n, 0) AS "registrationCount"
      FROM "EventAttendeeAccount" a
      LEFT JOIN LATERAL (
          SELECT json_agg(json_build_object('id', x.id, 'code', COALESCE(x."registrationCode", x."publicRef"), 'status', x.status,
                                            'category', x."categoryLabel", 'clubName', x."clubName", 'kind', 'registration') ORDER BY x."createdAt") AS items,
                 count(*) AS n
            FROM "EventRegistration" x
           WHERE x."accountId" = a.id AND ($1::text IS NULL OR x."eventId" = $1)
      ) r ON TRUE`;

const ATTENDEE_EDITION = `($1::text IS NULL OR r.n > 0 OR EXISTS (
        SELECT 1 FROM "EventCompletedRegistration" c WHERE c."accountId" = a.id AND c."eventId" = $1))`;

const fullName = (r) => [r.firstName, r.lastName].filter(Boolean).join(' ').trim();

const shapeProject = (r) => {
    const state = accessStateOf({ realm: 'project', ...r });
    return {
        realm: 'project', realmLabel: realmLabel('project'),
        id: r.id, email: r.email, name: fullName(r) || r.clubName || r.email, phone: r.phone || null,
        clubName: r.clubName || null, district: r.district || null,
        role: r.role || 'applicant',
        projects: Array.isArray(r.projects) ? r.projects : [],
        hasPassword: !!r.hasPassword, resetPending: !!r.resetPending,
        lastLoginAt: r.lastLoginAt || null, createdAt: r.createdAt || null,
        access: { key: state, ...accessStateMeta(state) },
        canSetPassword: canSetPassword({ realm: 'project', ...r }).ok,
    };
};

const shapeAttendee = (r) => {
    const state = accessStateOf({ realm: 'attendee', ...r });
    const allowed = canSetPassword({ realm: 'attendee', ...r });
    return {
        realm: 'attendee', realmLabel: realmLabel('attendee'),
        id: r.id, email: r.email, name: fullName(r) || r.email, phone: r.phone || null,
        clubName: (Array.isArray(r.registrations) && r.registrations.find(x => x.clubName)?.clubName) || null,
        status: r.status || 'active',
        linkedRealm: r.linkedRealm || null,
        registrations: Array.isArray(r.registrations) ? r.registrations : [],
        hasPassword: !!r.hasPassword, resetPending: !!r.resetPending, mustChangePassword: !!r.mustChangePassword,
        lastLoginAt: r.lastLoginAt || null, createdAt: r.createdAt || null,
        access: { key: state, ...accessStateMeta(state) },
        canSetPassword: allowed.ok, cannotSetReason: allowed.ok ? null : allowed.reason,
    };
};

// Sin distinguir tildes ni mayúsculas: «gaitan» encuentra a «Gaitán». Las
// columnas son literales de este archivo; lo que escribe el comité va como
// parámetro, con sus comodines escapados.
const ACCENTS_FROM = 'áéíóúüñàèìòù';
const ACCENTS_TO = 'aeiouunaeiou';
const fold = (v) => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const searchClause = (q, cols, startAt) => {
    if (!q) return { sql: '', params: [] };
    const needle = `%${fold(q).replace(/[%_\\]/g, m => `\\${m}`)}%`;
    return {
        sql: ` AND (${cols.map(c => `translate(lower(COALESCE(${c}, '')), '${ACCENTS_FROM}', '${ACCENTS_TO}') LIKE $${startAt}`).join(' OR ')})`,
        params: [needle],
    };
};

// GET /admin/usuarios?evento=&q=&tipo=project|attendee|all&page=
const listUsers = async (req, res) => {
    await ensureUsersSchema();
    const eventId = await editionEventIdOf(req);
    const q = clean(req.query.q, 120);
    const tipo = USER_REALMS.includes(req.query.tipo) ? req.query.tipo : 'all';
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);

    const out = [];
    const counts = { project: 0, attendee: 0 };
    if (tipo === 'all' || tipo === 'project') {
        const s = searchClause(q, ['a.email', 's."firstName"', 's."lastName"', 'a."clubName"', 's."projectName"', 's."publicRef"', 's.phone',
            `(s."firstName" || ' ' || s."lastName")`], 2);
        const { rows } = await db.query(`${PROJECT_SELECT} WHERE ${PROJECT_EDITION}${s.sql} ORDER BY a."createdAt" DESC LIMIT 2000`, [eventId, ...s.params]);
        counts.project = rows.length;
        out.push(...rows.map(shapeProject));
    }
    if (tipo === 'all' || tipo === 'attendee') {
        const s = searchClause(q, ['a.email', 'a."firstName"', 'a."lastName"', 'a.phone', `(a."firstName" || ' ' || a."lastName")`], 2);
        const { rows } = await db.query(`${ATTENDEE_SELECT} WHERE ${ATTENDEE_EDITION}${s.sql} ORDER BY a."createdAt" DESC LIMIT 2000`, [eventId, ...s.params]);
        counts.attendee = rows.length;
        out.push(...rows.map(shapeAttendee));
    }
    out.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    const total = out.length;
    res.json({
        eventId, total, counts, page, pageSize: PAGE_SIZE, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
        users: out.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
        passwordMin: PASSWORD_MIN,
    });
};

/** Una cuenta, por su clase. `null` si no existe o no es de la edición. */
const loadAccount = async (realm, id, eventId) => {
    if (realm === 'project') {
        const { rows } = await db.query(`${PROJECT_SELECT} WHERE a.id = $2 AND ${PROJECT_EDITION} LIMIT 1`, [eventId, id]);
        return rows[0] ? { raw: rows[0], user: shapeProject(rows[0]) } : null;
    }
    if (realm === 'attendee') {
        const { rows } = await db.query(`${ATTENDEE_SELECT} WHERE a.id = $2 AND ${ATTENDEE_EDITION} LIMIT 1`, [eventId, id]);
        return rows[0] ? { raw: rows[0], user: shapeAttendee(rows[0]) } : null;
    }
    return null;
};

const paramsOf = (req) => ({ realm: USER_REALMS.includes(req.params.realm) ? req.params.realm : null, id: cleanId(req.params.id) });

// GET /admin/usuarios/:realm/:id
const getUser = async (req, res) => {
    await ensureUsersSchema();
    const { realm, id } = paramsOf(req);
    if (!realm || !id) return res.status(400).json({ error: 'Cuenta no válida.' });
    const eventId = await editionEventIdOf(req);
    const found = await loadAccount(realm, id, eventId);
    if (!found) return res.status(404).json({ error: 'No encontramos esa cuenta en esta edición.' });

    const { rows: history } = await db.query(
        `SELECT action, "actorEmail", "actorRole", detail, "createdAt" FROM "FairUserAccessLog"
          WHERE realm = $1 AND "accountId" = $2 ORDER BY "createdAt" DESC LIMIT 50`, [realm, id]);
    let logins = [];
    if (realm === 'attendee') {
        const r = await db.query(`SELECT outcome, "createdAt" FROM "EventAttendeeLogin" WHERE "accountId" = $1 ORDER BY "createdAt" DESC LIMIT 15`, [id])
            .catch(() => ({ rows: [] }));
        logins = r.rows;
    }
    // Una cuenta de asistente vinculada: a qué cuenta de proyecto apunta.
    let linkedTo = null;
    if (realm === 'attendee' && found.raw.linkedRealm === 'portal' && found.raw.linkedId) {
        const r = await db.query('SELECT id, email FROM "ProjectFairAccount" WHERE id = $1 LIMIT 1', [found.raw.linkedId]).catch(() => ({ rows: [] }));
        if (r.rows[0]) linkedTo = { realm: 'project', id: r.rows[0].id, email: r.rows[0].email };
    }
    res.json({ user: { ...found.user, linkedTo }, history, logins, passwordMin: PASSWORD_MIN });
};

// ── Escritura ────────────────────────────────────────────────────────

/**
 * POST /admin/usuarios/:realm/:id/password
 * body: { password?: string, generate?: boolean, notify?: boolean }
 *
 * La contraseña nueva viaja de vuelta UNA vez (para que el comité la copie y
 * se la entregue a la persona); en la base sólo queda su hash.
 */
const setPassword = async (req, res, { access }) => {
    await ensureUsersSchema();
    const { realm, id } = paramsOf(req);
    if (!realm || !id) return res.status(400).json({ error: 'Cuenta no válida.' });
    const eventId = await editionEventIdOf(req);
    const found = await loadAccount(realm, id, eventId);
    if (!found) return res.status(404).json({ error: 'No encontramos esa cuenta en esta edición.' });

    const allowed = canSetPassword({ realm, ...found.raw });
    if (!allowed.ok) return res.status(409).json({ error: allowed.reason, code: allowed.code });

    const generated = req.body?.generate === true;
    const password = generated ? generateTemporaryPassword(12) : String(req.body?.password ?? '');
    const problem = passwordProblem(password, { email: found.raw.email });
    if (problem) return res.status(400).json({ error: problem });

    const passwordHash = await bcrypt.hash(password, 10);
    let updated;
    if (realm === 'project') {
        const r = await db.query(`
            UPDATE "ProjectFairAccount"
               SET "passwordHash" = $1, "resetToken" = NULL, "resetExpiry" = NULL, "updatedAt" = NOW()
             WHERE id = $2 RETURNING id, email, "submissionId"`, [passwordHash, id]);
        updated = r.rows[0];
    } else {
        // Una cuenta que esperaba activarse queda activa: ya tiene con qué
        // entrar. Una suspendida NO se reactiva por aquí (`canSetPassword`).
        const r = await db.query(`
            UPDATE "EventAttendeeAccount"
               SET "passwordHash" = $1, "resetToken" = NULL, "resetExpiry" = NULL,
                   "mustChangePassword" = false, "tempPasswordExpiresAt" = NULL,
                   status = CASE WHEN status IN ('pending_activation','invitation_sent','invitation_expired') THEN 'active' ELSE status END,
                   "updatedAt" = NOW()
             WHERE id = $2 RETURNING id, email`, [passwordHash, id]);
        updated = r.rows[0];
    }
    if (!updated) return res.status(404).json({ error: 'No encontramos esa cuenta.' });

    // Aviso opcional por correo: dice que la contraseña cambió, NO la incluye.
    let email = null;
    if (req.body?.notify === true) {
        const cfg = await readConfigForAdmin(eventId).catch(() => ({}));
        const result = await sendFairEmail({
            to: updated.email,
            subject: `Tu contraseña fue actualizada — ${cfg?.edition?.name || 'Feria de Proyectos'}`,
            cfg,
            html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#1f2937">
                <h2 style="color:#17458F">Tu contraseña fue actualizada</h2>
                <p>El comité organizador asignó una contraseña nueva a tu cuenta (${realmLabel(realm).toLowerCase()}).
                   Te la entregará por un canal directo; por seguridad no la incluimos en este correo.</p>
                <p style="font-size:13px;color:#6b7280">Si no pediste este cambio, escríbele al comité organizador.</p>
            </div>`,
        });
        email = { sent: !!result?.success, error: result?.success ? null : (result?.error || 'El proveedor de correo rechazó el envío.') };
    }

    await audit(req, access, { eventId, realm, account: { ...found.raw, ...updated }, action: 'password_set', detail: { generated, notified: email?.sent || false } });
    res.json({
        ok: true,
        realm, id,
        // Sólo si la generó el sistema: si la escribió el comité, ya la conoce.
        password: generated ? password : null,
        email,
        loginPath: realm === 'project' ? '/mi-proyecto' : '/mi-inscripcion',
    });
};

/**
 * POST /admin/usuarios/:realm/:id/reset-link   body: { sendEmail?: boolean }
 * El enlace se devuelve para copiarlo; el correo es opcional y se informa si
 * salió o por qué no (el «Olvidé mi contraseña» del club no lo dice).
 */
const resetLink = async (req, res, { access }) => {
    await ensureUsersSchema();
    const { realm, id } = paramsOf(req);
    if (!realm || !id) return res.status(400).json({ error: 'Cuenta no válida.' });
    const eventId = await editionEventIdOf(req);
    const found = await loadAccount(realm, id, eventId);
    if (!found) return res.status(404).json({ error: 'No encontramos esa cuenta en esta edición.' });
    const allowed = canSetPassword({ realm, ...found.raw });
    if (!allowed.ok) return res.status(409).json({ error: allowed.reason, code: allowed.code });

    const purpose = realm === 'project' ? 'reset' : 'attendee_reset';
    const token = jwt.sign({ sub: id, purpose }, JWT_SECRET, { expiresIn: `${ADMIN_RESET_HOURS}h` });
    const table = realm === 'project' ? '"ProjectFairAccount"' : '"EventAttendeeAccount"';
    await db.query(`UPDATE ${table} SET "resetToken" = $1, "resetExpiry" = NOW() + ($2 || ' hours')::interval WHERE id = $3`,
        [token, String(ADMIN_RESET_HOURS), id]);

    const cfg = await readConfigForAdmin(eventId).catch(() => ({}));
    const origin = clean(req.headers.origin, 200) || 'https://app.clubplatform.org';
    const link = `${origin}${resetLinkPath(realm, cfg)}?reset=${encodeURIComponent(token)}`;

    let email = null;
    if (req.body?.sendEmail === true) {
        const result = await sendFairEmail({
            to: found.raw.email,
            subject: `Restablece tu contraseña — ${cfg?.edition?.name || 'Feria de Proyectos'}`,
            cfg,
            html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#1f2937">
                <h2 style="color:#17458F">Restablece tu contraseña</h2>
                <p>El comité organizador generó este enlace para que crees una contraseña nueva.</p>
                <p><a href="${link}" style="display:inline-block;background:#17458F;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold">Crear una contraseña nueva</a></p>
                <p style="font-size:13px;color:#6b7280">El enlace vence en ${ADMIN_RESET_HOURS} horas y sirve una sola vez.</p>
            </div>`,
        });
        email = { sent: !!result?.success, error: result?.success ? null : (result?.error || 'El proveedor de correo rechazó el envío.') };
    }

    await audit(req, access, { eventId, realm, account: found.raw, action: 'reset_link', detail: { emailed: email?.sent || false, hours: ADMIN_RESET_HOURS } });
    res.json({ ok: true, link, expiresInHours: ADMIN_RESET_HOURS, email });
};

export default {
    listUsers: withAccess(listUsers, 'manageUsers'),
    getUser: withAccess(getUser, 'manageUsers'),
    setPassword: withAccess(setPassword, 'manageUsers'),
    resetLink: withAccess(resetLink, 'manageUsers'),
};
