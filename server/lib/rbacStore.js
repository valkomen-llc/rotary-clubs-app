// ════════════════════════════════════════════════════════════════════
// RBAC multi-tenant — LA I/O
// v4.937.0
//
// El criterio vive en `rbacSpec.js` y es puro; acá está lo que toca la base. La
// separación es la de `seoRules.js` frente a `seoAudit.js` y la de
// `institutionalAccess.js` frente a `institutionalStore.js`: lo que DECIDE se
// puede probar sin Postgres, y lo que ESCRIBE se lee sabiendo qué decidió.
//
// ⚠️ NINGUNA FUNCIÓN LANZA. `resolveUserGrant` corre en el camino de CADA
// petición protegida del panel: si una excepción subiera, una tabla que todavía
// no existe dejaría a todo el mundo fuera. Lo que devuelven ante un fallo es el
// valor que hace que el sitio se comporte como ANTES de este módulo —el
// respaldo por rol de `resolveGrant`—, nunca un panel vacío por accidente.
// ════════════════════════════════════════════════════════════════════
import crypto from 'crypto';
import db from './db.js';
import { ensureRbacSchema } from './ensureRbacSchema.js';
import { profileForUser } from './institutionalStore.js';
import {
    resolveGrant, presetRole, SITE_ROLE_PRESETS, ROLE_PRESETS,
    expandPermissions, isAdministrativeRole, wouldOrphanSite,
    MEMBERSHIP_STATUS_KEYS, isPlatformOperator, canSignIn, isRestrictedGrant,
} from './rbacSpec.js';

const id = () => crypto.randomUUID();
const str = (v, max = 200) => (v === null || v === undefined ? null : String(v).replace(/\s+/g, ' ').trim().slice(0, max) || null);

const parseJson = (raw) => {
    if (Array.isArray(raw)) return raw.map(v => String(v));
    if (typeof raw === 'string') {
        try { const p = JSON.parse(raw); return Array.isArray(p) ? p.map(v => String(v)) : []; } catch { return []; }
    }
    return [];
};

// ── Roles ────────────────────────────────────────────────────────────

const shapeRole = (row) => row ? ({
    id: row.id,
    key: row.key,
    name: row.name,
    label: row.name,
    description: row.description || '',
    permissions: parseJson(row.permissions),
    scope: row.scope || 'site',
    active: row.active !== false,
    protected: false,
    custom: true,
    clubId: row.clubId,
    createdAt: row.createdAt || null,
    updatedAt: row.updatedAt || null,
}) : null;

/** Un preset con la misma forma que una fila, para que la pantalla no distinga. */
const shapePreset = (p) => ({
    id: null,
    key: p.key,
    name: p.label,
    label: p.label,
    description: p.description,
    permissions: p.permissions,
    scope: p.scope,
    active: true,
    protected: true,
    custom: false,
    clubId: null,
    createdAt: null,
    updatedAt: null,
});

/** Sólo las filas personalizadas del sitio. */
export const listCustomRoles = async (clubId) => {
    try {
        await ensureRbacSchema();
        const { rows } = await db.query(
            'SELECT * FROM "SiteRole" WHERE "clubId" = $1 ORDER BY name ASC', [str(clubId, 80)]);
        return rows.map(shapeRole);
    } catch (e) {
        console.error('[RBAC] listCustomRoles:', e?.message);
        return [];
    }
};

/**
 * TODOS los roles que se pueden asignar en un sitio: los presets del código
 * primero y los personalizados después.
 *
 * Los presets van primero a propósito: son los que cubren el 95 % de los casos
 * y quien abre el desplegable busca «Editor», no el rol que alguien creó hace
 * seis meses. `includePlatform` sólo lo pide el operador.
 */
export const listRoles = async (clubId, { includePlatform = false } = {}) => {
    const presets = (includePlatform ? ROLE_PRESETS : SITE_ROLE_PRESETS).map(shapePreset);
    const custom = await listCustomRoles(clubId);
    return [...presets, ...custom];
};

/**
 * Resuelve un rol por su llave o su id, SIEMPRE dentro de un sitio.
 *
 * ⚠️ El `clubId` va en el WHERE, no se comprueba después de leer: para quien
 * pregunta por un rol de otro sitio, ese rol no existe. Confirmar que existe ya
 * es filtrar que existe (regla del aislamiento, v4.932).
 */
export const roleFor = async (clubId, { roleKey = null, roleId = null } = {}) => {
    if (roleId) {
        try {
            await ensureRbacSchema();
            const { rows } = await db.query(
                'SELECT * FROM "SiteRole" WHERE id = $1 AND "clubId" = $2 LIMIT 1',
                [str(roleId, 80), str(clubId, 80)]);
            if (rows[0]) return shapeRole(rows[0]);
        } catch (e) { console.error('[RBAC] roleFor(id):', e?.message); }
    }
    const key = str(roleKey, 60);
    if (!key) return null;
    const preset = presetRole(key);
    if (preset) return shapePreset(preset);
    try {
        await ensureRbacSchema();
        const { rows } = await db.query(
            'SELECT * FROM "SiteRole" WHERE key = $1 AND "clubId" = $2 LIMIT 1',
            [key, str(clubId, 80)]);
        return shapeRole(rows[0]);
    } catch (e) {
        console.error('[RBAC] roleFor(key):', e?.message);
        return null;
    }
};

/** Crea un rol personalizado. El criterio ya lo validó; acá sólo se escribe. */
export const createRole = async ({ clubId, key, name, description, permissions, createdBy }) => {
    try {
        await ensureRbacSchema();
        const { rows } = await db.query(
            `INSERT INTO "SiteRole" (id, "clubId", key, name, description, permissions, scope, "createdBy")
             VALUES ($1,$2,$3,$4,$5,$6::jsonb,'site',$7)
             ON CONFLICT ("clubId", key) DO NOTHING
             RETURNING *`,
            [id(), str(clubId, 80), str(key, 60), str(name, 60), str(description, 300),
             JSON.stringify(permissions || []), str(createdBy, 80)]
        );
        if (!rows[0]) return { ok: false, reason: 'duplicado' };
        return { ok: true, role: shapeRole(rows[0]) };
    } catch (e) {
        console.error('[RBAC] createRole:', e?.message);
        return { ok: false, reason: e?.message };
    }
};

/**
 * Actualiza un rol. PARCIAL: sólo pisa lo que viene definido.
 *
 * Con un UPDATE completo, renombrar un rol le borraría los permisos — es la
 * regla de `putAuto` con las traducciones y la de `upsertProfile`.
 * ⚠️ `key` NO se edita: es lo que ata las membresías a su rol.
 */
export const updateRole = async (clubId, roleId, { name, description, permissions, active }) => {
    try {
        await ensureRbacSchema();
        const sets = [];
        const params = [];
        const set = (col, value) => {
            if (value === undefined) return;
            params.push(value);
            sets.push(`"${col}" = $${params.length}`);
        };
        set('name', name === undefined ? undefined : str(name, 60));
        set('description', description === undefined ? undefined : str(description, 300));
        set('active', active === undefined ? undefined : !!active);
        if (permissions !== undefined) {
            params.push(JSON.stringify(permissions || []));
            sets.push(`permissions = $${params.length}::jsonb`);
        }
        if (!sets.length) return { ok: true, role: await roleFor(clubId, { roleId }) };
        params.push(str(roleId, 80), str(clubId, 80));
        const { rows } = await db.query(
            `UPDATE "SiteRole" SET ${sets.join(', ')}, "updatedAt" = NOW()
              WHERE id = $${params.length - 1} AND "clubId" = $${params.length} RETURNING *`,
            params
        );
        if (!rows[0]) return { ok: false, reason: 'no_encontrado' };
        return { ok: true, role: shapeRole(rows[0]) };
    } catch (e) {
        console.error('[RBAC] updateRole:', e?.message);
        return { ok: false, reason: e?.message };
    }
};

/** Cuántas membresías usan este rol. Lo que decide si se puede borrar. */
export const roleUsage = async (clubId, { roleId = null, roleKey = null } = {}) => {
    try {
        await ensureRbacSchema();
        const { rows } = await db.query(
            `SELECT count(*)::int AS n FROM "SiteMembership"
              WHERE "clubId" = $1 AND ("roleId" = $2 OR ("roleId" IS NULL AND "roleKey" = $3))`,
            [str(clubId, 80), str(roleId, 80), str(roleKey, 60)]
        );
        return Number(rows?.[0]?.n || 0);
    } catch (e) {
        console.error('[RBAC] roleUsage:', e?.message);
        return 0;
    }
};

/**
 * Borra un rol personalizado.
 *
 * ⚠️ NO se borra un rol EN USO: las membresías quedarían apuntando a algo
 * inexistente y con ellas la única traza de por qué esa persona entraba a lo
 * que entraba. Es la misma regla que impide borrar un recorrido con
 * inscripciones vivas (v4.701) y una categoría de inscripción con
 * postulaciones (v4.648): se DESACTIVA, que deja de ofrecerlo sin romper nada.
 */
export const deleteRole = async (clubId, roleId) => {
    try {
        await ensureRbacSchema();
        const rol = await roleFor(clubId, { roleId });
        if (!rol) return { ok: false, reason: 'no_encontrado' };
        const usos = await roleUsage(clubId, { roleId, roleKey: rol.key });
        if (usos > 0) {
            return {
                ok: false,
                reason: 'en_uso',
                usos,
                message: `Este rol lo tienen ${usos} ${usos === 1 ? 'persona' : 'personas'}. Cámbiales el rol primero, o desactívalo: desactivado deja de ofrecerse y quien ya lo tiene lo conserva.`,
            };
        }
        await db.query('DELETE FROM "SiteRole" WHERE id = $1 AND "clubId" = $2', [str(roleId, 80), str(clubId, 80)]);
        return { ok: true, role: rol };
    } catch (e) {
        console.error('[RBAC] deleteRole:', e?.message);
        return { ok: false, reason: e?.message };
    }
};

// ── Membresías ───────────────────────────────────────────────────────

const shapeMembership = (row) => row ? ({
    id: row.id,
    userId: row.userId,
    siteId: row.clubId,
    clubId: row.clubId,
    roleKey: row.roleKey || null,
    roleId: row.roleId || null,
    extraPermissions: parseJson(row.extraPermissions),
    deniedPermissions: parseJson(row.deniedPermissions),
    status: row.status || 'active',
    sessionsRevokedAt: row.sessionsRevokedAt || null,
    lastAccessAt: row.lastAccessAt || null,
    createdAt: row.createdAt || null,
    updatedAt: row.updatedAt || null,
}) : null;

/** La membresía de un usuario EN UN SITIO. `null` es el caso normal de todos los que existían antes. */
export const membershipFor = async (userId, clubId) => {
    if (!userId || !clubId) return null;
    try {
        await ensureRbacSchema();
        const { rows } = await db.query(
            'SELECT * FROM "SiteMembership" WHERE "userId" = $1 AND "clubId" = $2 LIMIT 1',
            [str(userId, 80), str(clubId, 80)]);
        return shapeMembership(rows[0]);
    } catch (e) {
        console.error('[RBAC] membershipFor:', e?.message);
        return null;
    }
};

/** Todos los sitios en los que participa una persona. Es el punto 13, en la ficha. */
export const membershipsOfUser = async (userId) => {
    try {
        await ensureRbacSchema();
        const { rows } = await db.query(
            `SELECT m.*, c.name AS "clubName"
               FROM "SiteMembership" m
               LEFT JOIN "Club" c ON c.id = m."clubId"
              WHERE m."userId" = $1
              ORDER BY m."createdAt" ASC`,
            [str(userId, 80)]);
        return rows.map(r => ({ ...shapeMembership(r), siteName: r.clubName || null }));
    } catch (e) {
        console.error('[RBAC] membershipsOfUser:', e?.message);
        return [];
    }
};

/**
 * Los usuarios de un sitio, con su rol, su estado y su último acceso.
 *
 * ⚠️ NUNCA devuelve la contraseña, ni recortada. `User` se consulta con columnas
 * ENUMERADAS —no `SELECT u.*`— justamente por eso: hasta v4.932 el listado de
 * cuentas traía la columna `password` entera al navegador de cualquier sesión
 * del panel. Al agregar un dato acá, preguntarse si puede salir del servidor.
 */
export const listMembers = async (clubId) => {
    try {
        await ensureRbacSchema();
        const { rows } = await db.query(
            `SELECT m.*,
                    u.email AS "userEmail", u.name AS "userName", u.role AS "userRole",
                    r.name AS "customRoleName", r.key AS "customRoleKey",
                    p."firstName", p."lastName", p.position, p."avatarUrl", p.mailbox,
                    p.status AS "profileStatus", p."lastLoginAt", p.permissions AS "legacyPermissions"
               FROM "SiteMembership" m
               LEFT JOIN "User" u ON u.id = m."userId"
               LEFT JOIN "SiteRole" r ON r.id = m."roleId"
               LEFT JOIN "InstitutionalProfile" p ON p."userId" = m."userId"
              WHERE m."clubId" = $1
              ORDER BY m."createdAt" ASC`,
            [str(clubId, 80)]);
        return rows.map(r => ({
            ...shapeMembership(r),
            email: r.userEmail || r.mailbox || null,
            name: [r.firstName, r.lastName].filter(Boolean).join(' ') || r.userName || null,
            firstName: r.firstName || null,
            lastName: r.lastName || null,
            position: r.position || null,
            avatarUrl: r.avatarUrl || null,
            mailbox: r.mailbox || null,
            platformRole: r.userRole || null,
            roleLabel: r.customRoleName || presetRole(r.roleKey)?.label || null,
            legacyPermissions: parseJson(r.legacyPermissions),
            lastLoginAt: r.lastLoginAt || r.lastAccessAt || null,
        }));
    } catch (e) {
        console.error('[RBAC] listMembers:', e?.message);
        return [];
    }
};

/**
 * Los usuarios de un sitio que HOY pueden administrarlo.
 *
 * ⚠️ Suma tres poblaciones, y las tres hacen falta para que la protección del
 * último administrador (punto 16) no se equivoque:
 *   · membresías con rol administrativo,
 *   · usuarios con rol de `User` administrativo del sitio Y SIN membresía —los
 *     que existían antes de este módulo, que son casi todos hoy—,
 *   · nadie más.
 *
 * El operador de la PLATAFORMA no cuenta a propósito: un sitio cuyo único
 * administrador es el equipo de Club Platform está, para su organización, sin
 * administrador — que es justo lo que la comprobación existe para impedir.
 */
export const siteAdministrators = async (clubId) => {
    const salida = [];
    const vistos = new Set();
    try {
        for (const m of await listMembers(clubId)) {
            const rol = await roleFor(clubId, { roleKey: m.roleKey, roleId: m.roleId });
            if (!rol || !isAdministrativeRole(rol)) continue;
            vistos.add(String(m.userId));
            salida.push({ userId: m.userId, email: m.email, status: m.status, source: 'membership' });
        }
    } catch (e) { console.error('[RBAC] siteAdministrators(membresías):', e?.message); }

    try {
        const { rows } = await db.query(
            `SELECT id, email, role FROM "User"
              WHERE "clubId" = $1 AND role = ANY($2::text[])`,
            [str(clubId, 80), ['club_admin', 'district_admin', 'editor']]
        );
        for (const u of rows) {
            if (vistos.has(String(u.id))) continue;
            vistos.add(String(u.id));
            salida.push({ userId: u.id, email: u.email, status: 'active', source: 'legacy_role' });
        }
    } catch (e) { console.error('[RBAC] siteAdministrators(roles):', e?.message); }

    return salida;
};

/**
 * ¿Quitarle el rol / suspender / retirar a esta persona deja el sitio sin
 * administrador? El criterio lo decide; acá sólo se le dan los datos.
 */
export const orphanCheck = async (clubId, targetUserId) =>
    wouldOrphanSite({ admins: await siteAdministrators(clubId), targetUserId });

/**
 * Crea o actualiza la membresía. PARCIAL, como todo lo demás.
 *
 * ⚠️ El `ON CONFLICT` va contra `SiteMembership_user_club_key`, que NO es
 * parcial: sus dos columnas son NOT NULL, así que no hay predicado que repetir
 * y la sentencia no cae en la trampa de v4.648.
 */
export const upsertMembership = async ({
    userId, clubId, roleKey, roleId, extraPermissions, deniedPermissions,
    status, invitedBy, createdBy,
}) => {
    try {
        await ensureRbacSchema();
        const existente = await membershipFor(userId, clubId);
        if (!existente) {
            const { rows } = await db.query(
                `INSERT INTO "SiteMembership"
                     (id, "userId", "clubId", "roleKey", "roleId", "extraPermissions",
                      "deniedPermissions", status, "invitedBy", "createdBy")
                 VALUES ($1,$2,$3,$4,$5,COALESCE($6::jsonb,'[]'::jsonb),
                         COALESCE($7::jsonb,'[]'::jsonb),COALESCE($8,'active'),$9,$10)
                 ON CONFLICT ("userId", "clubId") DO NOTHING
                 RETURNING *`,
                [
                    id(), str(userId, 80), str(clubId, 80), str(roleKey, 60), str(roleId, 80),
                    extraPermissions === undefined ? null : JSON.stringify(extraPermissions || []),
                    deniedPermissions === undefined ? null : JSON.stringify(deniedPermissions || []),
                    str(status, 20), str(invitedBy, 80), str(createdBy, 80),
                ]
            );
            if (rows[0]) return { ok: true, membership: shapeMembership(rows[0]), created: true };
            // Otra vuelta la creó entre medio: se cae al UPDATE de abajo.
        }

        const sets = [];
        const params = [];
        const set = (col, value) => {
            if (value === undefined) return;
            params.push(value);
            sets.push(`"${col}" = $${params.length}`);
        };
        // El rol se escribe SIEMPRE en pareja: fijar `roleId` sin limpiar
        // `roleKey` dejaría los dos puestos y la resolución tomaría el que
        // mirase primero — dos verdades sobre el mismo rol.
        if (roleKey !== undefined || roleId !== undefined) {
            set('roleKey', roleKey === undefined ? null : str(roleKey, 60));
            set('roleId', roleId === undefined ? null : str(roleId, 80));
        }
        set('status', status === undefined ? undefined : str(status, 20));
        if (extraPermissions !== undefined) {
            params.push(JSON.stringify(extraPermissions || []));
            sets.push(`"extraPermissions" = $${params.length}::jsonb`);
        }
        if (deniedPermissions !== undefined) {
            params.push(JSON.stringify(deniedPermissions || []));
            sets.push(`"deniedPermissions" = $${params.length}::jsonb`);
        }
        if (!sets.length) return { ok: true, membership: existente, created: false };

        params.push(str(userId, 80), str(clubId, 80));
        const { rows } = await db.query(
            `UPDATE "SiteMembership" SET ${sets.join(', ')}, "updatedAt" = NOW()
              WHERE "userId" = $${params.length - 1} AND "clubId" = $${params.length} RETURNING *`,
            params
        );
        return { ok: true, membership: shapeMembership(rows[0]), created: false };
    } catch (e) {
        console.error('[RBAC] upsertMembership:', e?.message);
        return { ok: false, reason: e?.message };
    }
};

/** Retira a alguien del sitio. La fila se borra; su auditoría NO. */
export const removeMembership = async (userId, clubId) => {
    try {
        await ensureRbacSchema();
        await db.query('DELETE FROM "SiteMembership" WHERE "userId" = $1 AND "clubId" = $2',
            [str(userId, 80), str(clubId, 80)]);
        return { ok: true };
    } catch (e) {
        console.error('[RBAC] removeMembership:', e?.message);
        return { ok: false, reason: e?.message };
    }
};

/**
 * ⚠️ CIERRA LAS SESIONES ABIERTAS. Un token firmado no se puede retirar, así
 * que lo que se hace es marcar el instante: todo token emitido ANTES deja de
 * valer, porque el guardia compara su `iat` contra esta marca en cada petición.
 * Sin esto, «cerrar sesiones» sería un botón que no cierra nada hasta que el
 * token venza solo — hasta un día después.
 */
export const revokeSessions = async (userId, clubId) => {
    try {
        await ensureRbacSchema();
        const { rows } = await db.query(
            `UPDATE "SiteMembership" SET "sessionsRevokedAt" = NOW(), "updatedAt" = NOW()
              WHERE "userId" = $1 AND "clubId" = $2 RETURNING "sessionsRevokedAt"`,
            [str(userId, 80), str(clubId, 80)]);
        if (!rows[0]) return { ok: false, reason: 'sin_membresia' };
        return { ok: true, at: rows[0].sessionsRevokedAt };
    } catch (e) {
        console.error('[RBAC] revokeSessions:', e?.message);
        return { ok: false, reason: e?.message };
    }
};

/** Anota el acceso. Es auditoría, no sesión: no gobierna nada. */
export const touchAccess = async (userId, clubId) => {
    try {
        await ensureRbacSchema();
        await db.query(
            `UPDATE "SiteMembership" SET "lastAccessAt" = NOW()
              WHERE "userId" = $1 AND "clubId" = $2`,
            [str(userId, 80), str(clubId, 80)]);
        return { ok: true };
    } catch { return { ok: false }; }
};

// ── La resolución ────────────────────────────────────────────────────

/**
 * ⚠️ QUÉ PUEDE ESTE USUARIO EN ESTE SITIO. Es lo que consume el guardia.
 *
 * Junta los tres datos que `resolveGrant` necesita —la membresía, el rol al que
 * apunta y los permisos legados de su cuenta institucional— y deja que el
 * criterio decida. Acá NO hay ni una regla de autorización: si la hubiera,
 * habría dos, y la de la base no se podría probar.
 *
 * DEGRADA SIEMPRE: ante cualquier fallo se resuelve sin membresía, o sea por el
 * respaldo de rol, que es exactamente el comportamiento anterior a este módulo.
 * Un panel vacío por un error de consulta sería peor que uno de más.
 */
export const resolveUserGrant = async (user, siteId = null, { profile } = {}) => {
    const club = str(siteId, 80) || str(user?.clubId, 80) || null;

    if (isPlatformOperator(user)) {
        return { ...resolveGrant({ user, siteId: club }), membership: null };
    }

    let membership = null;
    let rol = null;
    let legacyPermissions = null;

    try {
        membership = await membershipFor(user?.id, club);
        if (membership) rol = await roleFor(club, { roleKey: membership.roleKey, roleId: membership.roleId });
    } catch (e) { console.error('[RBAC] resolveUserGrant(membresía):', e?.message); }

    // Un rol DESACTIVADO no concede: desactivarlo tiene que surtir efecto, o el
    // interruptor no controla nada. Se conserva la membresía para poder decir
    // por qué esa persona dejó de ver sus herramientas.
    if (rol && rol.active === false) rol = null;

    try {
        // El perfil se pide sólo cuando puede haberlo: los roles
        // administrativos no tienen fila (v4.932), así que preguntar por ella
        // sería una consulta por petición para no decidir nada. Y si quien
        // llama ya lo cargó, se reutiliza — la misma petición no lo lee dos
        // veces.
        const perfil = profile !== undefined
            ? profile
            : (String(user?.role || '') === 'institutional_user' ? await profileForUser(user?.id) : null);
        if (perfil) {
            legacyPermissions = perfil.permissions;
            // El perfil también manda sobre el estado: una cuenta suspendida en
            // v4.932 sigue suspendida acá. Son la misma persona.
            if (perfil.status === 'suspended' && membership) membership = { ...membership, status: 'suspended' };
            else if (perfil.status === 'suspended' && !membership) {
                return {
                    permissions: new Set(), source: 'suspended', roleKey: 'institutional_user',
                    roleLabel: 'Usuario institucional', scope: 'site', siteId: club, membership: null,
                };
            }
        }
    } catch (e) { console.error('[RBAC] resolveUserGrant(perfil):', e?.message); }

    const grant = resolveGrant({
        user,
        siteId: club,
        membership: membership ? { ...membership, rolePermissions: rol?.permissions || null, roleLabel: rol?.label || null } : null,
        legacyPermissions,
    });
    return { ...grant, membership };
};

/**
 * La forma que viaja al navegador. `Set` no es serializable.
 *
 * `restricted` viaja RESUELTO por el mismo motivo que la lista de permisos: es
 * una decisión del criterio, no una clasificación que la pantalla pueda deducir
 * mirando el origen. Ver `isRestrictedGrant`.
 */
export const serializeGrant = (grant) => ({
    permissions: [...(grant?.permissions || [])].sort(),
    roleKey: grant?.roleKey || null,
    roleLabel: grant?.roleLabel || null,
    source: grant?.source || 'none',
    scope: grant?.scope || 'site',
    siteId: grant?.siteId || null,
    restricted: isRestrictedGrant(grant),
});

export const STATUS_KEYS = MEMBERSHIP_STATUS_KEYS;
export { canSignIn, expandPermissions };

export default {
    listRoles, listCustomRoles, roleFor, createRole, updateRole, deleteRole, roleUsage,
    membershipFor, membershipsOfUser, listMembers, siteAdministrators, orphanCheck,
    upsertMembership, removeMembership, revokeSessions, touchAccess,
    resolveUserGrant, serializeGrant,
};
