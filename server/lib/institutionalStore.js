// ════════════════════════════════════════════════════════════════════
// Accesos institucionales — LA I/O
// v4.932.0
//
// El criterio vive en `institutionalAccess.js` y es puro; acá está lo que toca
// la base. La separación es la de `seoRules.js` frente a `seoAudit.js`: lo que
// decide se puede probar sin Postgres, y lo que escribe se lee sabiendo qué
// decidió.
//
// ⚠️ NINGUNA FUNCIÓN LANZA. Varias corren en el camino del INGRESO
// (`authenticatePlatform`) y en el de la BANDEJA: si una excepción subiera,
// una tabla que todavía no existe dejaría a todo el mundo sin poder entrar. Lo
// que devuelven ante un fallo es el valor neutro —`null`, `[]`— que hace que
// el sitio se comporte como antes de este módulo.
// ════════════════════════════════════════════════════════════════════
import crypto from 'crypto';
import db from './db.js';
import { ensureInstitutionalSchema } from './ensureInstitutionalSchema.js';
import {
    INSTITUTIONAL_ROLE,
    AUDIT_EVENT_KEYS,
    normalizePermissions,
    isEmail,
} from './institutionalAccess.js';

const id = () => crypto.randomUUID();
const str = (v, max = 200) => (v === null || v === undefined ? null : String(v).replace(/\s+/g, ' ').trim().slice(0, max) || null);
const lower = (v) => (str(v, 200) || '').toLowerCase() || null;

/** La IP de quien pregunta, para la auditoría. Detrás del proxy de Vercel. */
export const clientIp = (req) => {
    const fwd = req?.headers?.['x-forwarded-for'];
    const raw = Array.isArray(fwd) ? fwd[0] : String(fwd || '').split(',')[0];
    return str(raw || req?.socket?.remoteAddress || '', 60);
};

const parsePermissions = (raw) => {
    if (Array.isArray(raw)) return raw.map(v => String(v));
    if (typeof raw === 'string') {
        try { const p = JSON.parse(raw); return Array.isArray(p) ? p.map(v => String(v)) : []; }
        catch { return []; }
    }
    return [];
};

/**
 * La fila tal como la consume el resto del módulo.
 *
 * ⚠️ NUNCA devuelve `resetToken`. Es un secreto de un solo uso y lo único que
 * hace falta saber fuera de la recuperación es si existe y si sigue vigente.
 */
const shape = (row) => {
    if (!row) return null;
    return {
        id: row.id,
        userId: row.userId,
        clubId: row.clubId,
        emailAccountId: row.emailAccountId || null,
        mailbox: row.mailbox || null,
        firstName: row.firstName || null,
        lastName: row.lastName || null,
        position: row.position || null,
        avatarUrl: row.avatarUrl || null,
        permissions: parsePermissions(row.permissions),
        status: row.status || 'active',
        mustChangePassword: !!row.mustChangePassword,
        passwordSetAt: row.passwordSetAt || null,
        lastLoginAt: row.lastLoginAt || null,
        createdAt: row.createdAt || null,
        updatedAt: row.updatedAt || null,
    };
};

// ── Auditoría ────────────────────────────────────────────────────────

/**
 * Anota un evento. NUNCA lanza y nunca guarda un secreto.
 *
 * `detail` es texto redactado por nosotros —«rol: institutional_user →
 * club_admin»—, jamás el cuerpo de la petición: un volcado del `req.body`
 * llevaría la contraseña adentro.
 */
export const audit = async (kind, { clubId = null, userId = null, email = null, actor = null, detail = null, req = null } = {}) => {
    try {
        if (!AUDIT_EVENT_KEYS.includes(kind)) {
            console.warn(`[ACCESOS] evento de auditoría desconocido: ${kind}`);
            return { ok: false, reason: 'evento_desconocido' };
        }
        await ensureInstitutionalSchema();
        await db.query(
            `INSERT INTO "InstitutionalAccessEvent"
                 (id, "clubId", "userId", email, kind, "actorKind", "actorId", "actorLabel", detail, ip, "userAgent")
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
            [
                id(), str(clubId, 80), str(userId, 80), lower(email), kind,
                str(actor?.kind, 20) || 'system', str(actor?.id, 80), str(actor?.label, 200),
                str(detail, 500), clientIp(req), str(req?.headers?.['user-agent'], 300),
            ]
        );
        return { ok: true };
    } catch (e) {
        console.error('[ACCESOS] auditoría:', e?.message);
        return { ok: false, reason: e?.message };
    }
};

export const listAudit = async (clubId, { userId = null, limit = 100 } = {}) => {
    try {
        await ensureInstitutionalSchema();
        const params = [str(clubId, 80)];
        let where = '"clubId" = $1';
        if (userId) { params.push(str(userId, 80)); where += ` AND "userId" = $${params.length}`; }
        params.push(Math.min(Math.max(Number(limit) || 100, 1), 300));
        const { rows } = await db.query(
            `SELECT id, "userId", email, kind, "actorKind", "actorLabel", detail, "createdAt"
               FROM "InstitutionalAccessEvent"
              WHERE ${where}
              ORDER BY "createdAt" DESC
              LIMIT $${params.length}`,
            params
        );
        return rows;
    } catch (e) {
        console.error('[ACCESOS] listAudit:', e?.message);
        return [];
    }
};

// ── Lectura ──────────────────────────────────────────────────────────

/**
 * El perfil de un `User`. Devuelve `null` cuando no lo tiene, y ése es el caso
 * NORMAL de todos los administradores anteriores a este módulo: sin fila, la
 * sesión se comporta exactamente como antes.
 */
export const profileForUser = async (userId) => {
    if (!userId) return null;
    try {
        await ensureInstitutionalSchema();
        const { rows } = await db.query(
            'SELECT * FROM "InstitutionalProfile" WHERE "userId" = $1 LIMIT 1', [str(userId, 80)]);
        return shape(rows[0]);
    } catch (e) {
        console.error('[ACCESOS] profileForUser:', e?.message);
        return null;
    }
};

/** Todos los perfiles de un sitio, con el correo y el rol de su `User`. */
export const listProfiles = async (clubId) => {
    try {
        await ensureInstitutionalSchema();
        const { rows } = await db.query(
            `SELECT p.*, u.email AS "userEmail", u.role AS "userRole"
               FROM "InstitutionalProfile" p
               LEFT JOIN "User" u ON u.id = p."userId"
              WHERE p."clubId" = $1
              ORDER BY p."createdAt" ASC`,
            [str(clubId, 80)]
        );
        return rows.map(r => ({ ...shape(r), email: r.userEmail || r.mailbox, role: r.userRole || null }));
    } catch (e) {
        console.error('[ACCESOS] listProfiles:', e?.message);
        return [];
    }
};

/** Los perfiles de un sitio indexados por la cuenta de correo que poseen. */
export const profilesByAccount = async (clubId) => {
    const perfiles = await listProfiles(clubId);
    const mapa = new Map();
    for (const p of perfiles) if (p.emailAccountId) mapa.set(p.emailAccountId, p);
    return mapa;
};

// ── Escritura ────────────────────────────────────────────────────────

/**
 * Crea o ACTUALIZA el perfil de un usuario.
 *
 * ⚠️ El `ON CONFLICT` va contra `InstitutionalProfile_user_key`, que NO es
 * parcial: sus dos columnas son NOT NULL, así que no hay predicado que repetir
 * y la sentencia no cae en la trampa de v4.648. El índice de la cuenta de
 * correo SÍ es parcial, y por eso el duplicado de buzón se comprueba antes, en
 * el controlador, con un mensaje redactado.
 *
 * La actualización es PARCIAL: sólo pisa lo que viene definido. Con un UPDATE
 * completo, editar el cargo borraría la fotografía — es la regla de `putAuto`
 * con las traducciones.
 */
export const upsertProfile = async ({
    userId, clubId, emailAccountId, mailbox, firstName, lastName, position,
    avatarUrl, permissions, status, mustChangePassword, createdBy,
}) => {
    try {
        await ensureInstitutionalSchema();
        const perms = permissions === undefined
            ? undefined
            : JSON.stringify(normalizePermissions(permissions, INSTITUTIONAL_ROLE).permissions);

        const existente = await profileForUser(userId);
        if (!existente) {
            const { rows } = await db.query(
                `INSERT INTO "InstitutionalProfile"
                     (id, "userId", "clubId", "emailAccountId", mailbox, "firstName", "lastName",
                      position, "avatarUrl", permissions, status, "mustChangePassword",
                      "passwordSetAt", "createdBy")
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,COALESCE($10::jsonb,'[]'::jsonb),
                         COALESCE($11,'active'), COALESCE($12,false), NOW(), $13)
                 ON CONFLICT ("userId") DO NOTHING
                 RETURNING *`,
                [
                    id(), str(userId, 80), str(clubId, 80), str(emailAccountId, 80), lower(mailbox),
                    str(firstName, 80), str(lastName, 80), str(position, 120), str(avatarUrl, 1000),
                    perms ?? null, str(status, 20), mustChangePassword ?? null, str(createdBy, 80),
                ]
            );
            if (rows[0]) return { ok: true, profile: shape(rows[0]), created: true };
            // Otra vuelta lo creó entre medio: se cae al UPDATE de abajo.
        }

        // UPDATE parcial: cada campo entra sólo si vino.
        const sets = [];
        const params = [];
        const set = (col, value) => {
            if (value === undefined) return;
            params.push(value);
            sets.push(`"${col}" = $${params.length}`);
        };
        set('clubId', clubId === undefined ? undefined : str(clubId, 80));
        set('emailAccountId', emailAccountId === undefined ? undefined : str(emailAccountId, 80));
        set('mailbox', mailbox === undefined ? undefined : lower(mailbox));
        set('firstName', firstName === undefined ? undefined : str(firstName, 80));
        set('lastName', lastName === undefined ? undefined : str(lastName, 80));
        set('position', position === undefined ? undefined : str(position, 120));
        set('avatarUrl', avatarUrl === undefined ? undefined : str(avatarUrl, 1000));
        set('status', status === undefined ? undefined : str(status, 20));
        set('mustChangePassword', mustChangePassword === undefined ? undefined : !!mustChangePassword);
        if (perms !== undefined) { params.push(perms); sets.push(`permissions = $${params.length}::jsonb`); }
        if (!sets.length) return { ok: true, profile: existente, created: false };

        params.push(str(userId, 80));
        const { rows } = await db.query(
            `UPDATE "InstitutionalProfile" SET ${sets.join(', ')}, "updatedAt" = NOW()
              WHERE "userId" = $${params.length} RETURNING *`,
            params
        );
        return { ok: true, profile: shape(rows[0]), created: false };
    } catch (e) {
        console.error('[ACCESOS] upsertProfile:', e?.message);
        return { ok: false, reason: e?.message };
    }
};

/** Marca la contraseña como recién puesta por su dueño. */
export const markPasswordSet = async (userId, { temporary = false } = {}) => {
    try {
        await ensureInstitutionalSchema();
        await db.query(
            `UPDATE "InstitutionalProfile"
                SET "mustChangePassword" = $1, "passwordSetAt" = NOW(),
                    "resetToken" = NULL, "resetExpiry" = NULL, "updatedAt" = NOW()
              WHERE "userId" = $2`,
            [!!temporary, str(userId, 80)]
        );
        return { ok: true };
    } catch (e) {
        console.error('[ACCESOS] markPasswordSet:', e?.message);
        return { ok: false, reason: e?.message };
    }
};

/** Anota el ingreso. Es auditoría, no sesión: no gobierna nada. */
export const touchLogin = async (userId, req) => {
    try {
        await ensureInstitutionalSchema();
        await db.query(
            `UPDATE "InstitutionalProfile"
                SET "lastLoginAt" = NOW(), "lastLoginIp" = $1, "updatedAt" = "updatedAt"
              WHERE "userId" = $2`,
            [clientIp(req), str(userId, 80)]
        );
        return { ok: true };
    } catch (e) {
        console.error('[ACCESOS] touchLogin:', e?.message);
        return { ok: false };
    }
};

// ── Recuperación de contraseña ───────────────────────────────────────

/** Guarda el token de restablecimiento con su vencimiento. */
export const storeResetToken = async (userId, token, { hours = 2 } = {}) => {
    try {
        await ensureInstitutionalSchema();
        const horas = Math.min(Math.max(Number(hours) || 2, 1), 24);
        await db.query(
            `UPDATE "InstitutionalProfile"
                SET "resetToken" = $1, "resetExpiry" = NOW() + ($2 || ' hours')::interval,
                    "updatedAt" = NOW()
              WHERE "userId" = $3`,
            [str(token, 2000), String(horas), str(userId, 80)]
        );
        return { ok: true };
    } catch (e) {
        console.error('[ACCESOS] storeResetToken:', e?.message);
        return { ok: false, reason: e?.message };
    }
};

/**
 * ¿Este token sigue valiendo para este usuario?
 *
 * Se comprueba contra la fila GUARDADA, no sólo contra la firma: así un enlace
 * ya usado —o uno emitido antes de otro más nuevo— deja de servir. Con la firma
 * sola, un enlace filtrado valdría sus dos horas completas aunque el dueño ya
 * hubiera cambiado la contraseña.
 */
export const consumeResetToken = async (userId, token) => {
    try {
        await ensureInstitutionalSchema();
        const { rows } = await db.query(
            `SELECT id FROM "InstitutionalProfile"
              WHERE "userId" = $1 AND "resetToken" = $2 AND "resetExpiry" > NOW() LIMIT 1`,
            [str(userId, 80), str(token, 2000)]
        );
        if (!rows[0]) return { ok: false };
        await db.query(
            `UPDATE "InstitutionalProfile"
                SET "resetToken" = NULL, "resetExpiry" = NULL, "updatedAt" = NOW()
              WHERE "userId" = $1`,
            [str(userId, 80)]
        );
        return { ok: true };
    } catch (e) {
        console.error('[ACCESOS] consumeResetToken:', e?.message);
        return { ok: false };
    }
};

// ── Vínculo con la cuenta de correo ──────────────────────────────────

/**
 * El perfil dueño de una dirección de correo, si lo hay.
 *
 * Se busca por `mailbox` y no por `emailAccountId` a propósito: es lo que
 * permite reconocer al dueño de una cuenta creada ANTES de este módulo, cuando
 * todavía no había id de perfil que atar. Misma lección que el puente del
 * asistente al evento (v4.713), que busca por correo y no por id.
 */
export const profileByMailbox = async (clubId, mailbox) => {
    const dir = lower(mailbox);
    if (!dir || !isEmail(dir)) return null;
    try {
        await ensureInstitutionalSchema();
        const { rows } = await db.query(
            'SELECT * FROM "InstitutionalProfile" WHERE "clubId" = $1 AND mailbox = $2 LIMIT 1',
            [str(clubId, 80), dir]
        );
        return shape(rows[0]);
    } catch (e) {
        console.error('[ACCESOS] profileByMailbox:', e?.message);
        return null;
    }
};

/** ¿Ya hay un perfil dueño de esta cuenta? Para no crear dos. */
export const profileByAccountId = async (accountId) => {
    if (!accountId) return null;
    try {
        await ensureInstitutionalSchema();
        const { rows } = await db.query(
            'SELECT * FROM "InstitutionalProfile" WHERE "emailAccountId" = $1 LIMIT 1', [str(accountId, 80)]);
        return shape(rows[0]);
    } catch (e) {
        console.error('[ACCESOS] profileByAccountId:', e?.message);
        return null;
    }
};

/** Suelta el vínculo cuando se borra la cuenta de correo. El usuario NO se borra. */
export const detachAccount = async (accountId) => {
    try {
        await ensureInstitutionalSchema();
        await db.query(
            `UPDATE "InstitutionalProfile" SET "emailAccountId" = NULL, "updatedAt" = NOW()
              WHERE "emailAccountId" = $1`,
            [str(accountId, 80)]
        );
        return { ok: true };
    } catch (e) {
        console.error('[ACCESOS] detachAccount:', e?.message);
        return { ok: false };
    }
};

export default {
    audit, listAudit, profileForUser, listProfiles, profilesByAccount,
    upsertProfile, markPasswordSet, touchLogin,
    storeResetToken, consumeResetToken,
    profileByMailbox, profileByAccountId, detachAccount, clientIp,
};
