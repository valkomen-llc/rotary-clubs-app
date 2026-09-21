// ════════════════════════════════════════════════════════════════════
// Usuarios y permisos — LA API
// v4.937.0 · recursos específicos v4.1090.0
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
    filterGrantableScopes, validateResourceScopes, resourceCatalog, describeResourceScopes,
    normalizeResourceScopes, allowedResourceIds, resourceModuleOf, RESOURCE_SCOPE_MODES,
} from '../lib/rbacSpec.js';
import {
    listRoles, listCustomRoles, roleFor, createRole, updateRole, deleteRole, roleUsage,
    listMembers, membershipFor, membershipsOfUser, upsertMembership, removeMembership,
    revokeSessions, orphanCheck, resolveUserGrant, serializeGrant, siteAdministrators,
} from '../lib/rbacStore.js';
import { audit, listAudit, upsertProfile, profileForUser } from '../lib/institutionalStore.js';
import { isEmail, INSTITUTIONAL_ROLE } from '../lib/institutionalAccess.js';
import { ensureUserFor, deliverAccessLink } from './institutionalAccessController.js';
import { attachGrant } from '../middleware/institutionalGuard.js';
import db from '../lib/db.js';
import crypto from 'crypto';

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
            // v4.1090 — el tercer nivel: qué módulos acotan por recurso y con
            // qué capacidades. Es el REGISTRO del servidor, sin funciones; la
            // pantalla lo pinta y no lo duplica.
            resources: resourceCatalog(),
            scopeModes: RESOURCE_SCOPE_MODES,
            // Lo que ESTE actor tiene acotado: la pantalla lo pinta para que se
            // vea que no puede conceder «todos» sobre un módulo que él mismo
            // tiene por recurso. La protección está en `filterGrantableScopes`.
            actorScopes: normalizeResourceScopes(scope.grant?.resourceScopes),
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
        res.json({ permissions: [], roleKey: null, roleLabel: null, source: 'error', restricted: false, modules: [], summary: '' });
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
                        p."firstName", p."lastName", p."avatarUrl", p.mailbox, p.position,
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
                    resourceScopes: {},
                    position: u.position || null,
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
        // v4.1090 — si cambió el juego de MÓDULOS visibles, se dice aparte:
        // «permisos modificados» y «acceso a módulos modificado» son dos
        // preguntas distintas en la traza del pedido.
        const modulosDe = (perms) => new Set((perms || []).map(k => String(k).split('.')[0]));
        const antes = modulosDe([...(membresia.extraPermissions || []), ...(membresia.deniedPermissions || []).map(k => `-${k}`)]);
        const despues = modulosDe([...extra.permissions, ...negados.permissions.map(k => `-${k}`)]);
        const cambiados = [...new Set([...antes, ...despues])].filter(m => antes.has(m) !== despues.has(m));
        if (cambiados.length) {
            await audit('module_access_changed', {
                clubId: scope.clubId, userId, actor: actorOf(req), req,
                detail: `Módulos con excepción: ${cambiados.map(m => m.replace(/^-/, '')).join(', ')}`,
            });
        }
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

        // v4.1090 — «desactivado» es su propio hecho en la auditoría: retirar
        // del sitio y suspender se corrigen en sitios distintos y el
        // historial tiene que poder distinguirlos.
        const evento = canSignIn(status) ? 'membership_restored' : (status === 'disabled' ? 'user_deactivated' : 'membership_suspended');
        await audit(evento, {
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

// ── El tercer nivel: recursos específicos (v4.1090) ──────────────────

const lower = (v) => str(v, 200).toLowerCase();

/** El alcance decide sólo cuando el servidor lo resolvió de verdad. */
const grantDecides = (grant) => Boolean(grant) && grant.source !== 'none';

/**
 * Los recursos de un módulo que ESTE actor puede asignar, para el buscador
 * de «Alcance de acceso».
 *
 * ⚠️ SALEN DEL SITIO DE LA SESIÓN Y ACOTADOS AL ALCANCE DEL ACTOR: un gestor
 * que sólo ve un evento no puede ofrecerle a otro los que él no ve. Es la
 * misma regla que `filterGrantableScopes` aplica al guardar; acá se ve antes
 * de intentarlo.
 */
export const getResources = async (req, res) => {
    try {
        const scope = await scopeOf(req);
        if (!guard(scope, 'users.view')) return denegar(res, 'users.view');
        const reg = resourceModuleOf(req.params?.moduleKey);
        if (!reg) return res.status(404).json({ error: 'Ese módulo no acota por recurso.' });
        if (!scope.clubId) return res.status(400).json({ error: 'Elige un sitio para listar sus recursos.' });

        const q = str(req.query?.q, 120);
        const params = [scope.clubId];
        let where = '"clubId" = $1';
        if (q) { params.push(`%${q}%`); where += ` AND title ILIKE $${params.length}`; }
        const { rows } = await db.query(
            `SELECT id, title, slug, "startDate", "endDate", location
               FROM "CalendarEvent" WHERE ${where}
              ORDER BY "startDate" DESC NULLS LAST, title ASC LIMIT 200`, params);

        const permitidos = grantDecides(scope.grant) ? allowedResourceIds(scope.grant, reg.module) : null;
        const visibles = permitidos === null ? rows : rows.filter(r => permitidos.includes(String(r.id)));
        res.json({
            module: reg.module,
            singular: reg.singular,
            plural: reg.plural,
            restricted: permitidos !== null,
            resources: visibles.map(r => ({
                id: r.id, label: r.title, slug: r.slug || null,
                startDate: r.startDate || null, endDate: r.endDate || null, location: r.location || null,
            })),
        });
    } catch (error) {
        console.error('[RBAC] getResources:', error?.message);
        res.status(500).json({ error: 'No pudimos cargar los recursos.' });
    }
};

/**
 * Resuelve el alcance por recurso que se puede GUARDAR para esta petición:
 * valida la forma, descarta lo que el actor no puede conceder y devuelve
 * los avisos. Lo comparten el alta y `putUserScopes`.
 */
const scopesFromBody = (scope, raw) => {
    const validacion = validateResourceScopes(raw);
    if (!validacion.ok) return { ok: false, errors: validacion.errors };
    const filtrado = filterGrantableScopes(scope.grant, validacion.value);
    return {
        ok: true,
        scopes: filtrado.scopes,
        warnings: [
            ...validacion.warnings,
            ...filtrado.rechazados.map(r => `Alcance descartado (${r.module}${r.id ? ' · ' + r.id : ''}${r.capability ? ' · ' + r.capability : ''}): ${r.motivo}`),
        ],
    };
};

/** Qué recursos entraron y cuáles salieron, para la traza. */
const diffScopes = (antes, despues) => {
    const ids = (scopes, moduleKey) => {
        const s = normalizeResourceScopes(scopes)[moduleKey];
        return s && s.mode === 'specific' ? new Map(s.resources.map(r => [r.id, r])) : null;
    };
    const modulos = new Set([...Object.keys(normalizeResourceScopes(antes)), ...Object.keys(normalizeResourceScopes(despues))]);
    const asignados = [];
    const retirados = [];
    for (const m of modulos) {
        const a = ids(antes, m);
        const d = ids(despues, m);
        for (const [id, r] of (d || new Map())) if (!a || !a.has(id)) asignados.push({ module: m, id, label: r.label });
        for (const [id, r] of (a || new Map())) if (!d || !d.has(id)) retirados.push({ module: m, id, label: r.label });
    }
    return { asignados, retirados };
};

const auditarRecursos = async (req, scope, userId, antes, despues) => {
    const { asignados, retirados } = diffScopes(antes, despues);
    for (const r of asignados) {
        await audit('resource_assigned', {
            clubId: scope.clubId, userId, actor: actorOf(req), req,
            detail: `${r.module}: ${r.label || r.id} (${r.id})`,
        });
    }
    for (const r of retirados) {
        await audit('resource_removed', {
            clubId: scope.clubId, userId, actor: actorOf(req), req,
            detail: `${r.module}: ${r.label || r.id} (${r.id})`,
        });
    }
};

/**
 * «+ Crear usuario»: nombre, correo, cargo, estado, rol, módulos (como
 * excepciones sobre el rol) y alcance por recurso, en UN alta.
 *
 * ⚠️ NO HAY UN SEGUNDO SISTEMA DE CUENTAS. El usuario es una fila de `User`
 * como cualquier otra —`ensureUserFor`, el MISMO alta de las cuentas
 * institucionales—, con el rol de plataforma `institutional_user`, que por sí
 * solo no abre nada: lo que abre es la MEMBRESÍA de este sitio. El correo de
 * acceso sale por `deliverAccessLink`, el mismo camino de «Enviar acceso».
 *
 * ⚠️ CUATRO PUERTAS, EN EL SERVIDOR:
 *   1. el rol tiene que existir en ESTE sitio y ser asignable por el actor;
 *   2. las excepciones pasan por `filterGrantable`;
 *   3. el alcance por recurso pasa por `filterGrantableScopes`: nadie asigna
 *      un evento que él mismo no alcanza ni una capacidad que no tiene;
 *   4. un correo que YA es de otro sitio, o de un operador de la plataforma,
 *      no se puede «crear» desde acá — se diría que se creó y se estaría
 *      moviendo a alguien de organización.
 */
export const postCreateUser = async (req, res) => {
    try {
        const scope = await scopeOf(req);
        if (!guard(scope, 'users.manage')) return denegar(res, 'users.manage');
        if (!scope.clubId) return res.status(400).json({ error: 'Elige un sitio para crear el usuario.' });

        const email = lower(req.body?.email);
        if (!isEmail(email)) return res.status(422).json({ error: 'Escribe un correo electrónico válido.' });
        const fullName = str(req.body?.fullName || req.body?.name, 160);
        if (!fullName) return res.status(422).json({ error: 'Escribe el nombre completo.' });
        const position = str(req.body?.position, 120) || null;
        const status = str(req.body?.status, 20) || 'active';
        if (!MEMBERSHIP_STATUS_KEYS.includes(status)) {
            return res.status(422).json({ error: `Estado inválido. Los admitidos son: ${MEMBERSHIP_STATUS_KEYS.join(', ')}.` });
        }

        const rol = await roleFor(scope.clubId, {
            roleKey: str(req.body?.roleKey, 60) || null,
            roleId: str(req.body?.roleId, 80) || null,
        });
        if (!rol) return res.status(422).json({ error: 'Elige un rol de este sitio.' });
        if (rol.active === false) return res.status(409).json({ error: 'Ese rol está desactivado. Actívalo antes de asignarlo.' });
        if (!canAssignRole(scope.grant, rol, { actorIsPlatform: scope.operador })) {
            return res.status(403).json({ error: 'No puedes asignar un rol con más permisos de los que tú tienes.' });
        }

        const extra = filterGrantable(scope.grant, req.body?.extraPermissions, { actorIsPlatform: scope.operador });
        const negados = expandPermissions(req.body?.deniedPermissions);
        const alcance = scopesFromBody(scope, req.body?.resourceScopes);
        if (!alcance.ok) return res.status(422).json({ error: alcance.errors[0], errors: alcance.errors });

        // Puerta 4: quién es ya ese correo.
        const { rows } = await db.query('SELECT id, email, role, "clubId" FROM "User" WHERE lower(email) = $1 LIMIT 1', [email]);
        const existente = rows[0] || null;
        if (existente) {
            if (isPlatformOperator(existente)) {
                return res.status(409).json({ error: 'Ese correo pertenece a un operador de la plataforma y no se administra desde acá.' });
            }
            if (existente.clubId && existente.clubId !== scope.clubId && !scope.operador) {
                return res.status(409).json({ error: 'Ese correo ya tiene una cuenta en otro sitio. Pídele al operador de la plataforma que la vincule.' });
            }
            if (await membershipFor(existente.id, scope.clubId)) {
                return res.status(409).json({ error: 'Esa persona ya está en este sitio. Edítala desde el listado.' });
            }
        }

        const password = crypto.randomBytes(24).toString('base64url');
        const cuenta = await ensureUserFor({ email, password, role: INSTITUTIONAL_ROLE, clubId: existente?.clubId || scope.clubId });
        const user = cuenta.user;

        const partes = fullName.split(' ');
        const firstName = partes[0] || fullName;
        const lastName = partes.slice(1).join(' ') || null;
        await db.query('UPDATE "User" SET name = COALESCE(NULLIF($1, \'\'), name), "updatedAt" = NOW() WHERE id = $2', [fullName, user.id]).catch(() => {});
        await upsertProfile({
            userId: user.id, clubId: scope.clubId, firstName, lastName, position,
            status: status === 'suspended' || status === 'disabled' ? 'suspended' : 'active',
            mustChangePassword: cuenta.created ? true : undefined,
            createdBy: req.user?.id || null,
        });

        const guardado = await upsertMembership({
            userId: user.id, clubId: scope.clubId,
            roleKey: rol.custom ? null : rol.key,
            roleId: rol.custom ? rol.id : null,
            extraPermissions: extra.permissions,
            deniedPermissions: negados.permissions,
            resourceScopes: alcance.scopes,
            status,
            createdBy: req.user?.id || null,
            invitedBy: req.user?.id || null,
        });
        if (!guardado.ok) return res.status(500).json({ error: 'No pudimos guardar el acceso.' });

        await audit('user_created', {
            clubId: scope.clubId, userId: user.id, email, actor: actorOf(req), req,
            detail: `${fullName} · rol ${rol.name}${cuenta.created ? '' : ' (cuenta existente vinculada)'}${describeResourceScopes(alcance.scopes).length ? ' · ' + describeResourceScopes(alcance.scopes).join('; ') : ''}`,
        });
        await auditarRecursos(req, scope, user.id, {}, alcance.scopes);

        let invite = { sent: false, error: null };
        if (req.body?.sendInvite !== false && canSignIn(status)) {
            const envio = await deliverAccessLink({ req, user: { id: user.id, email }, clubId: scope.clubId, subjectPrefix: 'Usuarios y permisos' })
                .catch(e => ({ success: false, error: e?.message }));
            invite = { sent: envio?.success === true, error: envio?.success ? null : (envio?.error || 'No se pudo enviar el correo.') };
        }

        res.status(201).json({
            user: { id: user.id, email, name: fullName, created: cuenta.created },
            membership: guardado.membership,
            role: rol,
            invite,
            warnings: [
                ...extra.rechazados.map(r => `Permiso descartado (${r.key}): ${r.motivo}`),
                ...negados.descartados.map(r => `Denegación descartada (${r.key}): ${r.motivo}`),
                ...alcance.warnings,
            ],
        });
    } catch (error) {
        console.error('[RBAC] postCreateUser:', error?.message);
        res.status(500).json({ error: 'No pudimos crear el usuario.' });
    }
};

/**
 * «Alcance de acceso»: todos los recursos del módulo o una lista concreta,
 * con las capacidades de cada uno.
 *
 * ⚠️ NADIE SE ASIGNA RECURSOS A SÍ MISMO POR ESTA VÍA, y lo que se guarda
 * pasa por `filterGrantableScopes` contra el grant REAL del actor. La traza
 * dice recurso por recurso qué entró y qué salió.
 */
export const putUserScopes = async (req, res) => {
    try {
        const scope = await scopeOf(req);
        if (!guard(scope, 'users.manage')) return denegar(res, 'users.manage');

        const userId = str(req.params?.userId, 80);
        if (String(userId) === String(req.user?.id)) {
            return res.status(409).json({ error: 'No puedes cambiarte el alcance de acceso a ti mismo.' });
        }
        const membresia = await membershipFor(userId, scope.clubId);
        if (!membresia) return res.status(404).json({ error: 'Esa persona todavía no tiene un rol asignado en este sitio. Asígnale uno primero.' });

        const alcance = scopesFromBody(scope, req.body?.resourceScopes);
        if (!alcance.ok) return res.status(422).json({ error: alcance.errors[0], errors: alcance.errors });

        const guardado = await upsertMembership({ userId, clubId: scope.clubId, resourceScopes: alcance.scopes });
        if (!guardado.ok) return res.status(500).json({ error: 'No pudimos guardar el alcance.' });

        const resumen = describeResourceScopes(alcance.scopes);
        await audit('resource_scope_changed', {
            clubId: scope.clubId, userId, actor: actorOf(req), req,
            detail: resumen.length ? resumen.join('; ') : 'Sin acotar: todos los recursos de cada módulo',
        });
        await auditarRecursos(req, scope, userId, membresia.resourceScopes, alcance.scopes);

        res.json({ membership: guardado.membership, warnings: alcance.warnings });
    } catch (error) {
        console.error('[RBAC] putUserScopes:', error?.message);
        res.status(500).json({ error: 'No pudimos guardar el alcance.' });
    }
};

/** Nombre y cargo de una persona de este sitio. No toca rol, permisos ni estado. */
export const putUserProfile = async (req, res) => {
    try {
        const scope = await scopeOf(req);
        if (!guard(scope, 'users.manage')) return denegar(res, 'users.manage');

        const userId = str(req.params?.userId, 80);
        const { rows } = await db.query('SELECT id, email, role, "clubId" FROM "User" WHERE id = $1 LIMIT 1', [userId]);
        const usuario = rows[0];
        const membresia = await membershipFor(userId, scope.clubId);
        if (!usuario || (!membresia && String(usuario.clubId || '') !== String(scope.clubId || ''))) {
            return res.status(404).json({ error: 'No encontramos a esa persona en este sitio.' });
        }
        if (isPlatformOperator(usuario) && !scope.operador) {
            return res.status(403).json({ error: 'Un operador de la plataforma no se edita desde acá.' });
        }

        const fullName = str(req.body?.fullName || req.body?.name, 160);
        const position = req.body?.position === undefined ? undefined : (str(req.body?.position, 120) || null);
        const cambios = [];
        if (fullName) {
            const partes = fullName.split(' ');
            await db.query('UPDATE "User" SET name = $1, "updatedAt" = NOW() WHERE id = $2', [fullName, userId]).catch(() => {});
            await upsertProfile({ userId, clubId: usuario.clubId || scope.clubId, firstName: partes[0], lastName: partes.slice(1).join(' ') || null, createdBy: req.user?.id || null });
            cambios.push(`nombre: ${fullName}`);
        }
        if (position !== undefined) {
            await upsertProfile({ userId, clubId: usuario.clubId || scope.clubId, position, createdBy: req.user?.id || null });
            cambios.push(`cargo: ${position || '—'}`);
        }
        if (!cambios.length) return res.status(422).json({ error: 'No hay nada que guardar.' });

        await audit('user_updated', { clubId: scope.clubId, userId, actor: actorOf(req), req, detail: cambios.join(' · ') });
        const perfil = await profileForUser(userId);
        res.json({ ok: true, profile: perfil ? { firstName: perfil.firstName, lastName: perfil.lastName, position: perfil.position } : null });
    } catch (error) {
        console.error('[RBAC] putUserProfile:', error?.message);
        res.status(500).json({ error: 'No pudimos guardar la ficha.' });
    }
};

/**
 * Manda (o vuelve a mandar) el enlace de acceso. Es el MISMO camino de
 * «Enviar acceso» de las cuentas institucionales (`deliverAccessLink`): un
 * segundo mecanismo se separaría en silencio. Nunca devuelve la contraseña.
 */
export const postSendAccess = async (req, res) => {
    try {
        const scope = await scopeOf(req);
        if (!guard(scope, 'users.manage')) return denegar(res, 'users.manage');

        const userId = str(req.params?.userId, 80);
        const { rows } = await db.query('SELECT id, email, role, "clubId" FROM "User" WHERE id = $1 LIMIT 1', [userId]);
        const usuario = rows[0];
        const membresia = await membershipFor(userId, scope.clubId);
        if (!usuario || (!membresia && String(usuario.clubId || '') !== String(scope.clubId || ''))) {
            return res.status(404).json({ error: 'No encontramos a esa persona en este sitio.' });
        }
        if (isPlatformOperator(usuario) && !scope.operador) {
            return res.status(403).json({ error: 'Un operador de la plataforma no se administra desde acá.' });
        }
        if (membresia && !canSignIn(membresia.status)) {
            return res.status(409).json({ error: 'Esa persona está suspendida en este sitio. Reactívala antes de mandarle el acceso.' });
        }

        const envio = await deliverAccessLink({ req, user: usuario, clubId: scope.clubId, subjectPrefix: 'Usuarios y permisos' });
        if (!envio?.success) return res.status(502).json({ error: envio?.error || 'No pudimos enviar el correo.' });
        res.json({ ok: true, sentTo: usuario.email });
    } catch (error) {
        console.error('[RBAC] postSendAccess:', error?.message);
        res.status(500).json({ error: 'No pudimos enviar el acceso.' });
    }
};

export default {
    getCatalog, getMyAccess, getRoles, postRole, postDuplicateRole, patchRole, deleteRoleHandler,
    getUsers, getUser, putUserRole, patchUserPermissions, putUserStatus,
    postRevokeSessions, deleteUserMembership, getAuditLog,
    getResources, postCreateUser, putUserScopes, putUserProfile, postSendAccess,
};
