// ════════════════════════════════════════════════════════════════════
// Usuarios y permisos — LA API
// v4.937.0
//
// ⚠️ LA GUARDIA VA EN LA RUTA **Y OTRA VEZ ACÁ**. Se protegen por separado a
// propósito: una ruta que se reordene o se copie a otro archivo perdería la
// guardia sin que nada avise, y lo que hay detrás es quién entra al panel y con
// qué permisos. Es la misma decisión de `institutional-access.js` (v4.932) y de
// `anniversaryController.js`.
//
// ⚠️ EL SITIO LO RESUELVE EL SERVIDOR, NUNCA EL CUERPO DE LA PETICIÓN. Si
// `clubId` viajara en el `body`, acotar los permisos a un sitio no serviría de
// nada: bastaría escribir el id de otro. Sale del token, y sólo el operador de
// la plataforma puede pedir otro sitio por query — que es justamente lo que su
// rol ya le permite.
// ════════════════════════════════════════════════════════════════════
import {
    permissionMatrix, describeRole, expandPermissions, filterGrantable,
    grantablePermissions, assignableRoles, canAssignRole, validateRole,
    isAdministrativeRole, MEMBERSHIP_STATUSES, MEMBERSHIP_STATUS_KEYS,
    isPlatformOperator, hasPermission, ROLE_PRESET_KEYS, presetRole,
    MODULES, ACTIONS, ALL_ACTION_FORMS, slugifyRole, canSignIn,
} from '../lib/rbacSpec.js';
import {
    listRoles, listCustomRoles, roleFor, createRole, updateRole, deleteRole, roleUsage,
    listMembers, membershipFor, membershipsOfUser, upsertMembership, removeMembership,
    revokeSessions, orphanCheck, resolveUserGrant, serializeGrant, siteAdministrators,
} from '../lib/rbacStore.js';
import { audit, listAudit } from '../lib/institutionalStore.js';
import { attachGrant } from '../middleware/institutionalGuard.js';
import db from '../lib/db.js';

const str = (v, max = 200) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/**
 * El sitio sobre el que actúa esta petición, y quién la hace.
 *
 * Devuelve además el `grant` del ACTOR, que es lo que decide qué puede
 * conceder: sin él, la prevención de escalamiento no tendría contra qué
 * comparar.
 */
const scopeOf = async (req) => {
    const grant = await attachGrant(req);
    const operador = isPlatformOperator(req.user);
    const pedido = str(req.query?.clubId || req.query?.siteId, 80);
    const clubId = operador && pedido ? pedido : (req.user?.clubId || null);
    return { grant, operador, clubId, actor: req.user };
};

/** Un 403 que dice qué falta, sin servir de mapa de lo que hay detrás. */
const denegar = (res, permiso) => res.status(403).json({ error: 'No tienes permiso para esta sección.', need: permiso });

const guard = (scope, permiso) => hasPermission(scope.grant, permiso);

const actorOf = (req) => ({
    kind: 'user',
    id: req.user?.id || null,
    label: req.user?.email || req.user?.name || null,
});

// ── El catálogo ──────────────────────────────────────────────────────

/**
 * Todo lo que la pantalla necesita para pintar la matriz y los desplegables.
 *
 * ⚠️ `grantable` es lo que ESTE actor puede ofrecer, no el catálogo entero: la
 * matriz pinta en gris lo que él mismo no tiene, así que la prevención de
 * escalamiento se VE antes de intentarla. Que se vea no es la protección —ésa
 * está en `filterGrantable`, al guardar— pero un control que se puede marcar y
 * el servidor descarta en silencio se lee como una avería.
 */
export const getCatalog = async (req, res) => {
    try {
        const scope = await scopeOf(req);
        if (!guard(scope, 'roles.view') && !guard(scope, 'users.view')) return denegar(res, 'roles.view');

        const roles = await listRoles(scope.clubId, { includePlatform: scope.operador });
        const asignables = assignableRoles(scope.grant, roles, { actorIsPlatform: scope.operador });

        res.json({
            modules: MODULES.map(m => ({
                key: m.key, label: m.label, group: m.group, scope: m.scope,
                actions: m.actions, help: m.help, sensitive: !!m.sensitive, routes: m.routes,
            })),
            actions: ACTIONS,
            actionForms: ALL_ACTION_FORMS,
            matrix: permissionMatrix({ includePlatform: scope.operador }),
            roles: roles.map(r => ({
                ...r,
                assignable: asignables.some(a => a.key === r.key),
                summary: describeRole(r.permissions),
            })),
            statuses: MEMBERSHIP_STATUSES,
            grantable: grantablePermissions(scope.grant, { actorIsPlatform: scope.operador }),
            isPlatformOperator: scope.operador,
            can: {
                viewUsers: guard(scope, 'users.view'),
                manageUsers: guard(scope, 'users.manage'),
                viewRoles: guard(scope, 'roles.view'),
                manageRoles: guard(scope, 'roles.manage'),
                viewAudit: guard(scope, 'audit.view'),
            },
        });
    } catch (error) {
        console.error('[RBAC] getCatalog:', error?.message);
        res.status(500).json({ error: 'No pudimos cargar el catálogo de permisos.' });
    }
};

/**
 * Los permisos EFECTIVOS de quien pregunta, ya resueltos.
 *
 * ⚠️ Es lo que consume la barra lateral, y viaja RESUELTO a propósito: con la
 * resolución también en el navegador, el menú y lo que responde la ruta podrían
 * discrepar y eso se lee como que los permisos no funcionan. Misma regla que el
 * calendario de la distribución (v4.864) y el período de la Bóveda (v4.849).
 *
 * NO exige ningún permiso: toda sesión tiene derecho a saber qué puede hacer.
 * Lo que devuelve es SUYO y de nadie más.
 */
export const getMyAccess = async (req, res) => {
    try {
        const grant = await attachGrant(req);
        const serial = serializeGrant(grant);
        res.json({
            ...serial,
            modules: MODULES.filter(m => m.actions.some(a => serial.permissions.includes(`${m.key}.${a}`)))
                .map(m => ({ key: m.key, label: m.label, group: m.group })),
            summary: describeRole(serial.permissions),
            status: grant?.membership?.status || req.user?.institutionalStatus || 'active',
            mustChangePassword: !!req.user?.mustChangePassword,
        });
    } catch (error) {
        console.error('[RBAC] getMyAccess:', error?.message);
        // DEGRADA: sin permisos resueltos el panel se pinta con el criterio
        // anterior a este módulo en vez de quedarse vacío.
        res.json({ permissions: [], roleKey: null, roleLabel: null, source: 'error', modules: [], summary: '' });
    }
};

// ── Roles ────────────────────────────────────────────────────────────

export const getRoles = async (req, res) => {
    try {
        const scope = await scopeOf(req);
        if (!guard(scope, 'roles.view')) return denegar(res, 'roles.view');

        const roles = await listRoles(scope.clubId, { includePlatform: scope.operador });
        const salida = [];
        for (const r of roles) {
            salida.push({
                ...r,
                summary: describeRole(r.permissions),
                assignable: canAssignRole(scope.grant, r, { actorIsPlatform: scope.operador }),
                administrative: isAdministrativeRole(r),
                members: await roleUsage(scope.clubId, { roleId: r.id, roleKey: r.key }),
            });
        }
        res.json({ roles: salida });
    } catch (error) {
        console.error('[RBAC] getRoles:', error?.message);
        res.status(500).json({ error: 'No pudimos cargar los roles.' });
    }
};

/**
 * Crea un rol personalizado.
 *
 * ⚠️ Los permisos pasan por `filterGrantable`, que es la prevención de
 * escalamiento del punto 12: nadie concede lo que no tiene, y un permiso de
 * plataforma no lo concede quien no es operador. Se hace acá —en el SERVIDOR y
 * sobre lo que se GUARDA—, no en la pantalla que ofrece las casillas: esconder
 * un control no protege un endpoint de quien lo conoce (v4.868).
 */
export const postRole = async (req, res) => {
    try {
        const scope = await scopeOf(req);
        if (!guard(scope, 'roles.manage')) return denegar(res, 'roles.manage');
        if (!scope.clubId) return res.status(400).json({ error: 'No pudimos determinar el sitio de esta sesión.' });

        const existentes = (await listCustomRoles(scope.clubId)).map(r => r.key);
        const check = validateRole(req.body || {}, {
            actorGrant: scope.grant,
            actorIsPlatform: scope.operador,
            existingKeys: existentes,
        });
        if (!check.ok) return res.status(422).json({ error: 'Revisa el formulario.', errors: check.errors, warnings: check.warnings });

        const creado = await createRole({
            clubId: scope.clubId,
            key: check.value.key,
            name: check.value.name,
            description: check.value.description,
            permissions: check.value.permissions,
            createdBy: req.user?.id || null,
        });
        if (!creado.ok) {
            return res.status(creado.reason === 'duplicado' ? 409 : 500)
                .json({ error: creado.reason === 'duplicado' ? 'Ya existe un rol con ese nombre en este sitio.' : 'No pudimos guardar el rol.' });
        }

        await audit('role_created', {
            clubId: scope.clubId, actor: actorOf(req), req,
            detail: `Rol "${check.value.name}" con ${check.value.permissions.length} permisos`,
        });
        res.status(201).json({ role: { ...creado.role, summary: describeRole(creado.role.permissions) }, warnings: check.warnings });
    } catch (error) {
        console.error('[RBAC] postRole:', error?.message);
        res.status(500).json({ error: 'No pudimos crear el rol.' });
    }
};

/**
 * Duplica un rol —preset o personalizado— para adaptarlo.
 *
 * Es la ÚNICA vía de partir de un rol del sistema: los presets no se editan ni
 * se borran porque viven en el código y una copia por sitio se separaría en
 * silencio de la versión siguiente.
 *
 * ⚠️ Y el duplicado se recorta a lo que el actor puede conceder: duplicar
 * «Administrador del sitio» desde una sesión de Editor no puede devolver un rol
 * de administrador. Lo que se recorte se DICE.
 */
export const postDuplicateRole = async (req, res) => {
    try {
        const scope = await scopeOf(req);
        if (!guard(scope, 'roles.manage')) return denegar(res, 'roles.manage');

        const origen = await roleFor(scope.clubId, {
            roleKey: str(req.body?.fromKey, 60) || null,
            roleId: str(req.body?.fromId, 80) || null,
        });
        if (!origen) return res.status(404).json({ error: 'Ese rol no existe en este sitio.' });

        const nombre = str(req.body?.name, 60) || `${origen.name} (copia)`;
        const existentes = (await listCustomRoles(scope.clubId)).map(r => r.key);
        let key = slugifyRole(nombre);
        let n = 2;
        while (existentes.includes(key)) { key = `${slugifyRole(nombre)}_${n++}`.slice(0, 60); }

        const check = validateRole(
            { key, name: nombre, description: str(req.body?.description, 300) || origen.description, permissions: origen.permissions, allowExisting: true },
            { actorGrant: scope.grant, actorIsPlatform: scope.operador, existingKeys: existentes }
        );
        if (!check.ok) return res.status(422).json({ error: 'No se pudo duplicar el rol.', errors: check.errors });

        const creado = await createRole({
            clubId: scope.clubId, key: check.value.key, name: check.value.name,
            description: check.value.description, permissions: check.value.permissions,
            createdBy: req.user?.id || null,
        });
        if (!creado.ok) return res.status(500).json({ error: 'No pudimos duplicar el rol.' });

        await audit('role_duplicated', {
            clubId: scope.clubId, actor: actorOf(req), req,
            detail: `"${origen.name}" → "${check.value.name}"`,
        });
        res.status(201).json({ role: { ...creado.role, summary: describeRole(creado.role.permissions) }, warnings: check.warnings });
    } catch (error) {
        console.error('[RBAC] postDuplicateRole:', error?.message);
        res.status(500).json({ error: 'No pudimos duplicar el rol.' });
    }
};

export const patchRole = async (req, res) => {
    try {
        const scope = await scopeOf(req);
        if (!guard(scope, 'roles.manage')) return denegar(res, 'roles.manage');

        const roleId = str(req.params?.id, 80);
        const actual = await roleFor(scope.clubId, { roleId });
        // Un preset no tiene id, así que llegar acá con uno significa que
        // alguien intentó editarlo por la puerta de atrás.
        if (!actual || actual.protected) {
            return res.status(actual?.protected ? 409 : 404).json({
                error: actual?.protected
                    ? 'Los roles del sistema no se editan. Duplícalo y edita la copia: así tu cambio no se pierde en la siguiente versión.'
                    : 'Ese rol no existe en este sitio.',
            });
        }

        const cuerpo = req.body || {};
        let permisos;
        let warnings = [];
        if (cuerpo.permissions !== undefined) {
            const { permissions, rechazados } = filterGrantable(scope.grant, cuerpo.permissions, { actorIsPlatform: scope.operador });
            permisos = permissions;
            warnings = rechazados.map(r => `Permiso descartado (${r.key}): ${r.motivo}`);
        }

        // ⚠️ Vaciar de permisos administrativos un rol que HOY sostiene al único
        // administrador del sitio lo dejaría sin nadie. Se comprueba antes de
        // escribir, no después.
        if (permisos && isAdministrativeRole(actual) && !isAdministrativeRole({ permissions: permisos })) {
            const conEsteRol = (await listMembers(scope.clubId)).filter(m => m.roleId === roleId);
            for (const m of conEsteRol) {
                const check = await orphanCheck(scope.clubId, m.userId);
                if (check.blocked) return res.status(409).json({ error: check.reason });
            }
        }

        const guardado = await updateRole(scope.clubId, roleId, {
            name: cuerpo.name === undefined ? undefined : str(cuerpo.name, 60),
            description: cuerpo.description === undefined ? undefined : str(cuerpo.description, 300),
            permissions: permisos,
            active: cuerpo.active === undefined ? undefined : !!cuerpo.active,
        });
        if (!guardado.ok) return res.status(500).json({ error: 'No pudimos guardar el rol.' });

        await audit('role_updated', {
            clubId: scope.clubId, actor: actorOf(req), req,
            detail: `Rol "${guardado.role.name}"${permisos ? ` — ${permisos.length} permisos` : ''}${cuerpo.active === false ? ' — desactivado' : ''}`,
        });
        res.json({ role: { ...guardado.role, summary: describeRole(guardado.role.permissions) }, warnings });
    } catch (error) {
        console.error('[RBAC] patchRole:', error?.message);
        res.status(500).json({ error: 'No pudimos guardar el rol.' });
    }
};

export const deleteRoleHandler = async (req, res) => {
    try {
        const scope = await scopeOf(req);
        if (!guard(scope, 'roles.manage')) return denegar(res, 'roles.manage');

        const roleId = str(req.params?.id, 80);
        const actual = await roleFor(scope.clubId, { roleId });
        if (actual?.protected) {
            return res.status(409).json({ error: 'Los roles del sistema no se eliminan.' });
        }
        const borrado = await deleteRole(scope.clubId, roleId);
        if (!borrado.ok) {
            if (borrado.reason === 'en_uso') return res.status(409).json({ error: borrado.message, usos: borrado.usos });
            return res.status(borrado.reason === 'no_encontrado' ? 404 : 500)
                .json({ error: borrado.reason === 'no_encontrado' ? 'Ese rol no existe en este sitio.' : 'No pudimos eliminar el rol.' });
        }
        await audit('role_deleted', {
            clubId: scope.clubId, actor: actorOf(req), req, detail: `Rol "${borrado.role.name}"`,
        });
        res.json({ ok: true });
    } catch (error) {
        console.error('[RBAC] deleteRoleHandler:', error?.message);
        res.status(500).json({ error: 'No pudimos eliminar el rol.' });
    }
};

// ── Usuarios ─────────────────────────────────────────────────────────

/**
 * Los usuarios del sitio.
 *
 * ⚠️ NUNCA sale una contraseña, ni recortada. El listado enumera columnas y no
 * hace `SELECT u.*` justamente por eso: hasta v4.932 el listado de cuentas
 * traía la columna `password` entera al navegador de cualquier sesión del panel.
 */
export const getUsers = async (req, res) => {
    try {
        const scope = await scopeOf(req);
        if (!guard(scope, 'users.view')) return denegar(res, 'users.view');

        const miembros = await listMembers(scope.clubId);
        const administradores = await siteAdministrators(scope.clubId);
        const idsAdmin = new Set(administradores.map(a => String(a.userId)));

        // Los que entran al panel de este sitio y todavía NO tienen membresía:
        // son todos los que existían antes de este módulo. Esconderlos daría un
        // listado que dice «este sitio tiene 1 usuario» teniendo cinco.
        let sinMembresia = [];
        try {
            const conMembresia = new Set(miembros.map(m => String(m.userId)));
            const { rows } = await db.query(
                `SELECT u.id, u.email, u.name, u.role, u."createdAt",
                        p."firstName", p."lastName", p."avatarUrl", p.mailbox,
                        p.status AS "profileStatus", p."lastLoginAt", p.permissions AS "legacyPermissions"
                   FROM "User" u
                   LEFT JOIN "InstitutionalProfile" p ON p."userId" = u.id
                  WHERE u."clubId" = $1
                  ORDER BY u."createdAt" ASC`,
                [scope.clubId]
            );
            sinMembresia = rows
                .filter(u => !conMembresia.has(String(u.id)))
                .map(u => ({
                    id: null,
                    userId: u.id,
                    siteId: scope.clubId,
                    email: u.email,
                    name: [u.firstName, u.lastName].filter(Boolean).join(' ') || u.name || null,
                    avatarUrl: u.avatarUrl || null,
                    mailbox: u.mailbox || null,
                    platformRole: u.role || null,
                    roleKey: null,
                    roleId: null,
                    roleLabel: null,
                    extraPermissions: [],
                    deniedPermissions: [],
                    status: u.profileStatus === 'suspended' ? 'suspended' : 'active',
                    lastLoginAt: u.lastLoginAt || null,
                    createdAt: u.createdAt || null,
                    // ⚠️ Se DICE que su acceso viene de su rol de siempre y no de
                    // un rol de este módulo: sin esa distinción, «¿por qué esta
                    // persona ve todo si no tiene rol asignado?» no se contesta.
                    inherited: true,
                }));
        } catch (e) { console.error('[RBAC] getUsers(sin membresía):', e?.message); }

        const todos = [...miembros.map(m => ({ ...m, inherited: false })), ...sinMembresia]
            .map(u => ({ ...u, isSiteAdmin: idsAdmin.has(String(u.userId)) }));

        res.json({
            users: todos,
            admins: administradores.length,
            can: { manage: guard(scope, 'users.manage') },
        });
    } catch (error) {
        console.error('[RBAC] getUsers:', error?.message);
        res.status(500).json({ error: 'No pudimos cargar los usuarios.' });
    }
};

/** La ficha de una persona: sus sitios, su rol efectivo y su traza. */
export const getUser = async (req, res) => {
    try {
        const scope = await scopeOf(req);
        if (!guard(scope, 'users.view')) return denegar(res, 'users.view');

        const userId = str(req.params?.userId, 80);
        // El sitio va en el WHERE: para quien pregunta por alguien de otro
        // sitio, esa persona no existe. Confirmar que existe ya es filtrar.
        const { rows } = await db.query(
            `SELECT u.id, u.email, u.name, u.role, u."clubId", u."createdAt"
               FROM "User" u WHERE u.id = $1 LIMIT 1`, [userId]);
        const usuario = rows[0];
        const membresia = await membershipFor(userId, scope.clubId);
        if (!usuario || (!membresia && String(usuario.clubId || '') !== String(scope.clubId || ''))) {
            return res.status(404).json({ error: 'No encontramos a esa persona en este sitio.' });
        }

        const grant = await resolveUserGrant(
            { id: usuario.id, role: usuario.role, clubId: scope.clubId }, scope.clubId);

        res.json({
            user: { id: usuario.id, email: usuario.email, name: usuario.name, platformRole: usuario.role, createdAt: usuario.createdAt },
            membership: membresia,
            // El punto 13: en qué otros sitios participa. El operador ve la
            // lista completa; un administrador de sitio, sólo el suyo — los
            // demás sitios no son asunto de su organización.
            memberships: scope.operador ? await membershipsOfUser(userId) : (membresia ? [membresia] : []),
            grant: serializeGrant(grant),
            summary: describeRole([...(grant.permissions || [])]),
            audit: guard(scope, 'audit.view') ? await listAudit(scope.clubId, { userId, limit: 50 }) : [],
        });
    } catch (error) {
        console.error('[RBAC] getUser:', error?.message);
        res.status(500).json({ error: 'No pudimos cargar la ficha.' });
    }
};

/**
 * Asigna el rol de una persona EN ESTE SITIO.
 *
 * ⚠️ Tres puertas y las tres hacen falta:
 *   1. `canAssignRole` — nadie asigna un rol cuyos permisos no tiene (punto 12).
 *   2. `orphanCheck` — no se deja el sitio sin administrador (punto 16).
 *   3. nadie se edita a sí mismo por esta vía: con el permiso `users.manage`
 *      podría quitarse el suyo y quedarse fuera, y para lo propio está
 *      `/admin/perfil`, que no toca rol ni permisos (regla de v4.932).
 */
export const putUserRole = async (req, res) => {
    try {
        const scope = await scopeOf(req);
        if (!guard(scope, 'users.manage')) return denegar(res, 'users.manage');

        const userId = str(req.params?.userId, 80);
        if (String(userId) === String(req.user?.id)) {
            return res.status(409).json({
                error: 'No puedes cambiarte el rol a ti mismo: podrías quitarte el acceso y quedarte fuera. Pídeselo a otro administrador.',
            });
        }

        const rol = await roleFor(scope.clubId, {
            roleKey: str(req.body?.roleKey, 60) || null,
            roleId: str(req.body?.roleId, 80) || null,
        });
        if (!rol) return res.status(404).json({ error: 'Ese rol no existe en este sitio.' });
        if (rol.active === false) return res.status(409).json({ error: 'Ese rol está desactivado. Actívalo antes de asignarlo.' });
        if (!canAssignRole(scope.grant, rol, { actorIsPlatform: scope.operador })) {
            return res.status(403).json({
                error: 'No puedes asignar un rol con más permisos de los que tú tienes.',
            });
        }

        const anterior = await membershipFor(userId, scope.clubId);
        const rolAnterior = anterior ? await roleFor(scope.clubId, { roleKey: anterior.roleKey, roleId: anterior.roleId }) : null;

        // Si esta persona era administradora y el rol nuevo no lo es, se
        // comprueba que quede otra.
        if (!isAdministrativeRole(rol)) {
            const check = await orphanCheck(scope.clubId, userId);
            if (check.blocked) return res.status(409).json({ error: check.reason });
        }

        const guardado = await upsertMembership({
            userId, clubId: scope.clubId,
            roleKey: rol.custom ? null : rol.key,
            roleId: rol.custom ? rol.id : null,
            status: anterior?.status || 'active',
            createdBy: req.user?.id || null,
            invitedBy: anterior ? undefined : (req.user?.id || null),
        });
        if (!guardado.ok) return res.status(500).json({ error: 'No pudimos guardar el rol.' });

        await audit(anterior ? 'membership_role_changed' : 'membership_created', {
            clubId: scope.clubId, userId, actor: actorOf(req), req,
            detail: anterior
                ? `Rol: ${rolAnterior?.name || anterior.roleKey || 'sin rol'} → ${rol.name}`
                : `Añadido con el rol ${rol.name}`,
        });
        res.json({ membership: guardado.membership, role: rol, summary: describeRole(rol.permissions) });
    } catch (error) {
        console.error('[RBAC] putUserRole:', error?.message);
        res.status(500).json({ error: 'No pudimos guardar el rol.' });
    }
};

/**
 * Las EXCEPCIONES individuales del punto 11.
 *
 * Se guardan APARTE del rol a propósito: fundidas con él no se podría contestar
 * «¿esto lo trae su rol o se lo dieron a él?», que es la única pregunta que un
 * sistema de excepciones tiene que poder responder para no volverse
 * inadministrable.
 */
export const patchUserPermissions = async (req, res) => {
    try {
        const scope = await scopeOf(req);
        if (!guard(scope, 'users.manage')) return denegar(res, 'users.manage');

        const userId = str(req.params?.userId, 80);
        if (String(userId) === String(req.user?.id)) {
            return res.status(409).json({ error: 'No puedes cambiarte los permisos a ti mismo.' });
        }
        const membresia = await membershipFor(userId, scope.clubId);
        if (!membresia) return res.status(404).json({ error: 'Esa persona todavía no tiene un rol asignado en este sitio. Asígnale uno primero.' });

        const extra = filterGrantable(scope.grant, req.body?.extraPermissions, { actorIsPlatform: scope.operador });
        // Las DENEGACIONES no pasan por `filterGrantable`: quitar no es
        // conceder, y exigirle al actor tener el permiso que va a quitar
        // impediría acotar a alguien que sabe más que uno.
        const negados = expandPermissions(req.body?.deniedPermissions);

        const guardado = await upsertMembership({
            userId, clubId: scope.clubId,
            extraPermissions: extra.permissions,
            deniedPermissions: negados.permissions,
        });
        if (!guardado.ok) return res.status(500).json({ error: 'No pudimos guardar los permisos.' });

        await audit('membership_permissions_changed', {
            clubId: scope.clubId, userId, actor: actorOf(req), req,
            detail: `+${extra.permissions.length} / −${negados.permissions.length}`,
        });
        res.json({
            membership: guardado.membership,
            warnings: [
                ...extra.rechazados.map(r => `Permiso descartado (${r.key}): ${r.motivo}`),
                ...negados.descartados.map(r => `Denegación descartada (${r.key}): ${r.motivo}`),
            ],
        });
    } catch (error) {
        console.error('[RBAC] patchUserPermissions:', error?.message);
        res.status(500).json({ error: 'No pudimos guardar los permisos.' });
    }
};

/** Suspender / reactivar / desactivar. Suspender NO borra: revoca y deja traza. */
export const putUserStatus = async (req, res) => {
    try {
        const scope = await scopeOf(req);
        if (!guard(scope, 'users.manage')) return denegar(res, 'users.manage');

        const userId = str(req.params?.userId, 80);
        if (String(userId) === String(req.user?.id)) {
            return res.status(409).json({ error: 'No puedes suspenderte a ti mismo.' });
        }
        const status = str(req.body?.status, 20);
        if (!MEMBERSHIP_STATUS_KEYS.includes(status)) {
            return res.status(422).json({ error: `Estado inválido. Los admitidos son: ${MEMBERSHIP_STATUS_KEYS.join(', ')}.` });
        }
        if (!canSignIn(status)) {
            const check = await orphanCheck(scope.clubId, userId);
            if (check.blocked) return res.status(409).json({ error: check.reason });
        }

        const guardado = await upsertMembership({ userId, clubId: scope.clubId, status });
        if (!guardado.ok) return res.status(500).json({ error: 'No pudimos cambiar el estado.' });

        // ⚠️ Suspender CIERRA las sesiones abiertas. Sin esto, quien acaba de
        // ser suspendido seguiría dentro hasta que su token venciera —hasta un
        // día—, que es justo lo que el punto 15 dice que no puede pasar.
        if (!canSignIn(status)) await revokeSessions(userId, scope.clubId);

        await audit(canSignIn(status) ? 'membership_restored' : 'membership_suspended', {
            clubId: scope.clubId, userId, actor: actorOf(req), req, detail: `Estado: ${status}`,
        });
        res.json({ membership: guardado.membership });
    } catch (error) {
        console.error('[RBAC] putUserStatus:', error?.message);
        res.status(500).json({ error: 'No pudimos cambiar el estado.' });
    }
};

/** Cierra las sesiones abiertas de alguien. Ver `revokeSessions`. */
export const postRevokeSessions = async (req, res) => {
    try {
        const scope = await scopeOf(req);
        if (!guard(scope, 'users.manage')) return denegar(res, 'users.manage');

        const userId = str(req.params?.userId, 80);
        const hecho = await revokeSessions(userId, scope.clubId);
        if (!hecho.ok) {
            return res.status(hecho.reason === 'sin_membresia' ? 404 : 500).json({
                error: hecho.reason === 'sin_membresia'
                    ? 'Esa persona todavía no tiene un rol asignado en este sitio, así que no hay sesión de sitio que cerrar.'
                    : 'No pudimos cerrar las sesiones.',
            });
        }
        await audit('sessions_revoked', { clubId: scope.clubId, userId, actor: actorOf(req), req, detail: 'Sesiones cerradas desde la administración' });
        res.json({ ok: true, at: hecho.at });
    } catch (error) {
        console.error('[RBAC] postRevokeSessions:', error?.message);
        res.status(500).json({ error: 'No pudimos cerrar las sesiones.' });
    }
};

/** Retira a alguien del sitio. La fila se borra; su auditoría NO. */
export const deleteUserMembership = async (req, res) => {
    try {
        const scope = await scopeOf(req);
        if (!guard(scope, 'users.manage')) return denegar(res, 'users.manage');

        const userId = str(req.params?.userId, 80);
        if (String(userId) === String(req.user?.id)) {
            return res.status(409).json({ error: 'No puedes retirarte a ti mismo del sitio.' });
        }
        const check = await orphanCheck(scope.clubId, userId);
        if (check.blocked) return res.status(409).json({ error: check.reason });

        const hecho = await removeMembership(userId, scope.clubId);
        if (!hecho.ok) return res.status(500).json({ error: 'No pudimos retirar a esa persona.' });

        await audit('membership_removed', { clubId: scope.clubId, userId, actor: actorOf(req), req, detail: 'Retirado del sitio' });
        res.json({ ok: true });
    } catch (error) {
        console.error('[RBAC] deleteUserMembership:', error?.message);
        res.status(500).json({ error: 'No pudimos retirar a esa persona.' });
    }
};

/** La traza del sitio. Sólo lectura y sólo con `audit.view`. */
export const getAuditLog = async (req, res) => {
    try {
        const scope = await scopeOf(req);
        if (!guard(scope, 'audit.view')) return denegar(res, 'audit.view');
        res.json({ events: await listAudit(scope.clubId, { limit: Number(req.query?.limit) || 150 }) });
    } catch (error) {
        console.error('[RBAC] getAuditLog:', error?.message);
        res.status(500).json({ error: 'No pudimos cargar el registro.' });
    }
};

export default {
    getCatalog, getMyAccess, getRoles, postRole, postDuplicateRole, patchRole, deleteRoleHandler,
    getUsers, getUser, putUserRole, patchUserPermissions, putUserStatus,
    postRevokeSessions, deleteUserMembership, getAuditLog,
};
