// ════════════════════════════════════════════════════════════════════
// Accesos institucionales — LA API
// v4.932.0
//
// Dos superficies, y la separación entre ellas es el pedido entero:
//
//   • `/institutional/accounts/*` — ADMINISTRACIÓN. Exige el permiso
//     `email_accounts`. Crea la cuenta, le asigna propietario, le da acceso,
//     le fija rol y permisos, la suspende.
//
//   • `/institutional/me` — EL PROPIO PERFIL. Cualquier sesión de plataforma.
//     Sólo puede tocar LO SUYO, y lo que puede tocar es un catálogo cerrado:
//     su fotografía, su contraseña y sus datos personales. NUNCA su rol ni sus
//     permisos —eso sería concederse a sí mismo lo que no tiene—.
//
// ⚠️ LA AUTORIZACIÓN VA EN EL SERVIDOR Y EN EL `WHERE`, no en la pantalla. Toda
// consulta de este archivo lleva el `clubId` de la SESIÓN: para quien pregunta
// por una cuenta de otro sitio, esa cuenta simplemente no existe — confirmar
// que existe ya es filtrar que existe.
// ════════════════════════════════════════════════════════════════════
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import db from '../lib/db.js';
import prisma from '../lib/prisma.js';
import EmailService from '../services/EmailService.js';
import {
    PERMISSIONS, ACCESS_ROLES, INSTITUTIONAL_ROLE, PASSWORD_MIN,
    validateAccountPayload, normalizePermissions, buildInstitutionalEmail,
    isEmail, displayNameOf, effectivePermissions, isPlatformOperator,
    isSiteAdministrator, ACCESS_ROLE_KEYS, resolveMailDomain,
} from '../lib/institutionalAccess.js';
import { isDistrictSiteType } from '../lib/districtSite.js';
import {
    upsertProfile, profileForUser, listProfiles, profileByAccountId,
    profileByMailbox, audit, listAudit, markPasswordSet, detachAccount,
} from '../lib/institutionalStore.js';

// RBAC (v4.937): el alta puede además asignar un ROL DEL SITIO, que es lo que
// convierte «permitir acceso al panel» en «con estos permisos». Se importa el
// criterio y la I/O, nunca se reimplementa la decisión acá.
import { canAssignRole, describeRole } from '../lib/rbacSpec.js';
import { roleFor, listRoles, upsertMembership, resolveUserGrant } from '../lib/rbacStore.js';
import { attachInstitutionalProfile } from '../middleware/institutionalGuard.js';

const uuid = () => crypto.randomUUID();
const str = (v, max = 200) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const lower = (v) => str(v, 200).toLowerCase();

/**
 * El sitio sobre el que actúa esta petición.
 *
 * El operador de la plataforma puede pedir otro con `?clubId=`; cualquier otro
 * rol se queda con el suyo, mande lo que mande. Es el mismo criterio de
 * `getEmailAccounts` y de `buildFilters` en Postulaciones: UN punto de
 * resolución, para que ninguna consulta se lo salte por descuido.
 */
const scopeOf = (req) => {
    if (isPlatformOperator(req.user)) {
        return str(req.query?.clubId || req.body?.clubId || req.user?.clubId || '', 80) || null;
    }
    return str(req.user?.clubId || '', 80) || null;
};

/**
 * EN QUÉ DOMINIO SE CREA UNA DIRECCIÓN INSTITUCIONAL.
 *
 * El criterio es puro y vive en `resolveMailDomain`; acá sólo se juntan sus
 * tres entradas. La decisión la toma el SERVIDOR y viaja resuelta: si la
 * compusiera el navegador, daría una distinta según por dónde se entró al panel
 * —que es la mitad del defecto de v4.933—.
 *
 * ⚠️ EL DOMINIO PROPIO DE UN DISTRITO NO ESTÁ EN `Club.domain`. Un distrito
 * existe dos veces: la fila de `District` guarda su dominio y la de `Club` es
 * el sitio; el dominio NO se duplica entre las dos, se resuelve al leer
 * (v4.744). Mirar sólo el club es lo que ofrecía
 * `@distrito-4281-de-rotary-international…` en un sitio cuyo correo vive en
 * `@rotary4281.org`.
 */
const domainOf = async (clubId) => {
    try {
        const club = await prisma.club.findUnique({
            where: { id: clubId },
            select: { domain: true, subdomain: true, name: true, type: true, districtId: true, district: true },
        });
        if (!club) return { domain: null, name: null, source: null };

        // La fila de `District`, cuando la hay. El vínculo es DOBLE porque
        // conviven las dos formas: la clave foránea que escribe /admin/distritos
        // y el número dentro de `Club.district`, que es una LISTA («4271, 4281»)
        // y por eso se parte por lo que no es dígito (v4.748).
        let districtDomain = null;
        const esSitioDeDistrito = isDistrictSiteType(club.type);
        if (esSitioDeDistrito) {
            try {
                const numeros = String(club.district || '')
                    .split(/[^0-9]+/).filter(n => n.length === 4).map(Number);
                const { rows } = await db.query(
                    `SELECT domain FROM "District"
                      WHERE ($1::text IS NOT NULL AND id = $1)
                         OR (cardinality($2::int[]) > 0 AND number = ANY($2::int[]))
                      ORDER BY (id = $1) DESC, "updatedAt" DESC
                      LIMIT 1`,
                    [club.districtId || null, numeros]
                );
                districtDomain = rows[0]?.domain || null;
            } catch (e) {
                // Degrada: sin el distrito se sigue con el club y las cuentas.
                console.warn('[ACCESOS] dominio del distrito:', e?.message);
            }
        }

        // Las direcciones que YA existen. Es la evidencia de qué dominio está
        // verificado en el proveedor, y el mismo criterio que usa el
        // diagnóstico para saber qué dominios preguntarle a Resend.
        let accountDomains = [];
        try {
            const cuentas = await prisma.emailAccount.findMany({
                where: { clubId },
                orderBy: { createdAt: 'asc' },
                select: { email: true },
            });
            accountDomains = cuentas.map(c => c.email);
        } catch (e) {
            console.warn('[ACCESOS] dominios de las cuentas:', e?.message);
        }

        const resuelto = resolveMailDomain({
            clubDomain: club.domain,
            districtDomain,
            accountDomains,
            isDistrictSite: esSitioDeDistrito,
        });

        return {
            domain: resuelto.domain,
            source: resuelto.source,
            reason: resuelto.reason || null,
            discarded: resuelto.descartados,
            name: club.name || null,
            subdomain: club.subdomain || null,
        };
    } catch (e) {
        console.error('[ACCESOS] domainOf:', e?.message);
        return { domain: null, name: null, source: null };
    }
};

const actorOf = (req) => ({
    kind: 'user',
    id: req.user?.id || null,
    label: req.user?.email || null,
});

// ─────────────────────────────────────────────────────────────────────
// Catálogo
// ─────────────────────────────────────────────────────────────────────

/**
 * GET /api/institutional/catalog
 *
 * Lo que la pantalla del alta necesita para armarse: permisos, roles y el
 * dominio del sitio. El dominio sale del SERVIDOR y no del navegador: si
 * viajara en la petición, cualquiera con el endpoint crearía una cuenta —y con
 * ella un usuario— en el dominio de otro sitio.
 */
export const getCatalog = async (req, res) => {
    try {
        const clubId = scopeOf(req);
        const info = clubId ? await domainOf(clubId) : { domain: null, name: null };

        // ⚠️ LOS ROLES DEL SITIO VIAJAN EN ESTE MISMO CATÁLOGO (v4.937), no en
        // una segunda petición: el modal del alta los necesita para ofrecerlos
        // y ya está pidiendo esto. Y sólo los que ESTE actor puede asignar —la
        // prevención de escalamiento se ve antes de intentarla—; la protección
        // de verdad está en `asignarRolDeSitio`, en el servidor y sobre lo que
        // se guarda.
        let siteRoles = [];
        try {
            const actor = await resolveUserGrant(req.user, clubId);
            const esOperador = isPlatformOperator(req.user);
            siteRoles = (await listRoles(clubId))
                .filter(r => r.active !== false && canAssignRole(actor, r, { actorIsPlatform: esOperador }))
                .map(r => ({
                    key: r.key, id: r.id, name: r.name, description: r.description,
                    custom: r.custom, summary: describeRole(r.permissions),
                }));
        } catch (e) {
            // DEGRADA: sin roles, el alta se comporta como en v4.932 y se
            // asigna el rol después desde Usuarios y permisos.
            console.error('[ACCESOS] getCatalog(roles):', e?.message);
        }

        res.json({
            permissions: PERMISSIONS,
            roles: ACCESS_ROLES,
            siteRoles,
            passwordMin: PASSWORD_MIN,
            domain: info.domain,
            // De dónde salió el dominio. Sin esto, «¿por qué me ofrece este?»
            // no tiene dónde mirarse — que es lo que costó diagnosticar v4.933.
            domainSource: info.source || null,
            domainDiscarded: info.discarded || [],
            clubId,
            clubName: info.name,
            // Sin dominio propio no hay dirección institucional que crear, y se
            // dice con su causa en vez de dejar el formulario fallando.
            blocked: info.domain ? null : (info.reason || 'Este sitio todavía no tiene un dominio propio conectado, así que no se pueden crear direcciones institucionales.'),
        });
    } catch (error) {
        console.error('[ACCESOS] getCatalog:', error);
        res.status(500).json({ error: 'No pudimos cargar la configuración de accesos.' });
    }
};

// ─────────────────────────────────────────────────────────────────────
// Administración
// ─────────────────────────────────────────────────────────────────────

/**
 * GET /api/institutional/accounts
 *
 * Las cuentas del sitio con su propietario, si lo tienen. Es la pestaña
 * «Cuentas», y por eso está detrás de `email_accounts`.
 */
export const listAccounts = async (req, res) => {
    try {
        const clubId = scopeOf(req);
        if (!clubId) return res.status(400).json({ error: 'No hay un sitio en el contexto de esta sesión.' });

        const cuentas = await prisma.emailAccount.findMany({
            where: { clubId },
            orderBy: { createdAt: 'asc' },
            // ⚠️ SIN LA CONTRASEÑA. La columna existe y guarda lo que el
            // proveedor necesita; devolverla al navegador la pondría en el
            // panel de quien abra las herramientas de desarrollo, y el pedido
            // dice expresamente que nunca se muestre.
            select: {
                id: true, email: true, label: true, isPrimary: true,
                provider: true, verified: true, verificationStatus: true, createdAt: true,
            },
        });

        const perfiles = await listProfiles(clubId);
        const porCuenta = new Map(perfiles.filter(p => p.emailAccountId).map(p => [p.emailAccountId, p]));
        const porBuzon = new Map(perfiles.filter(p => p.mailbox).map(p => [p.mailbox, p]));

        const salida = cuentas.map(c => {
            // Se busca por id y, si no, por dirección: es lo que reconoce al
            // dueño de una cuenta creada ANTES de este módulo, cuando todavía
            // no había perfil que atar (la lección del puente de v4.713).
            const perfil = porCuenta.get(c.id) || porBuzon.get(lower(c.email)) || null;
            return {
                ...c,
                owner: perfil ? {
                    userId: perfil.userId,
                    email: perfil.mailbox || c.email,
                    firstName: perfil.firstName,
                    lastName: perfil.lastName,
                    displayName: displayNameOf(perfil, c.email),
                    position: perfil.position,
                    avatarUrl: perfil.avatarUrl,
                    role: perfil.role || INSTITUTIONAL_ROLE,
                    permissions: perfil.permissions,
                    status: perfil.status,
                    mustChangePassword: perfil.mustChangePassword,
                    lastLoginAt: perfil.lastLoginAt,
                } : null,
                hasAccess: !!perfil,
            };
        });

        res.json({ accounts: salida, total: salida.length });
    } catch (error) {
        console.error('[ACCESOS] listAccounts:', error);
        res.status(500).json({ error: 'No pudimos cargar las cuentas del sitio.' });
    }
};

/**
 * Crea o reutiliza el `User` de una dirección.
 *
 * ⚠️ NO CREA UN USUARIO DUPLICADO. Es exigencia expresa del pedido: si el
 * correo ya pertenece a una cuenta, se VINCULA. Y en ese caso NO se le pisa la
 * contraseña: quien ya entraba con la suya seguiría sin saber que se la
 * cambiaron, y el administrador acabaría teniendo la credencial de alguien que
 * no se la dio.
 */
const ensureUserFor = async ({ email, password, role, clubId }) => {
    const mail = lower(email);
    const { rows } = await db.query('SELECT * FROM "User" WHERE lower(email) = $1 LIMIT 1', [mail]);
    const existente = rows[0];

    if (existente) {
        // El sitio sí se corrige: un usuario vinculado a la cuenta de correo de
        // ESTE sitio pertenece a ESTE sitio, o su bandeja apuntaría a otro.
        if (existente.clubId !== clubId) {
            await db.query('UPDATE "User" SET "clubId" = $1, "updatedAt" = NOW() WHERE id = $2', [clubId, existente.id]);
        }
        return { user: { ...existente, clubId }, created: false, passwordSet: false };
    }

    const hash = await bcrypt.hash(password, 10);
    const { rows: nuevo } = await db.query(
        `INSERT INTO "User" (id, email, password, role, "clubId", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
         RETURNING id, email, role, "clubId"`,
        [uuid(), mail, hash, role, clubId]
    );
    return { user: nuevo[0], created: true, passwordSet: true };
};


/**
 * ⚠️ ASIGNA EL ROL DEL SITIO AL CREAR EL ACCESO (v4.937).
 *
 * Es el punto 6 del pedido: al marcar «Permitir acceso al panel» se elige un
 * rol, y ese rol es lo que decide qué módulos ve esa persona. Sin esto, el alta
 * seguiría creando identidades con las llaves gruesas de v4.932 y el sistema de
 * roles no gobernaría nada de lo que se crea desde acá.
 *
 * Tres reglas y las tres son del pedido:
 *   · el rol tiene que EXISTIR en ESTE sitio (aislamiento);
 *   · nadie asigna un rol con permisos que él mismo no tiene (punto 12,
 *     prevención de escalamiento) — se comprueba en el SERVIDOR y contra el
 *     grant REAL del actor, no contra lo que mande el navegador;
 *   · y es OPCIONAL: sin `siteRoleKey` no se crea membresía y la cuenta se
 *     comporta exactamente como en v4.932. Regla aditiva — un navegador con el
 *     bundle anterior sigue dando de alta igual que siempre.
 *
 * NUNCA lanza: un fallo acá no puede tumbar un alta cuyo usuario, cuenta de
 * correo y perfil ya están escritos. Devuelve el aviso y sigue.
 */
const asignarRolDeSitio = async (req, { clubId, userId }) => {
    const roleKey = str(req.body?.siteRoleKey, 60) || null;
    const roleId = str(req.body?.siteRoleId, 80) || null;
    if (!roleKey && !roleId) return { assigned: false, warnings: [] };

    try {
        const rol = await roleFor(clubId, { roleKey, roleId });
        if (!rol) {
            return { assigned: false, warnings: ['El rol elegido no existe en este sitio, así que la cuenta se creó sin rol asignado. Asígnaselo desde Usuarios y permisos.'] };
        }
        if (rol.active === false) {
            return { assigned: false, warnings: [`El rol «${rol.name}» está desactivado, así que la cuenta se creó sin rol asignado.`] };
        }

        const actor = await resolveUserGrant(req.user, clubId);
        if (!canAssignRole(actor, rol, { actorIsPlatform: isPlatformOperator(req.user) })) {
            return { assigned: false, warnings: [`No puedes asignar el rol «${rol.name}»: tiene permisos que tú no tienes. La cuenta se creó sin rol asignado.`] };
        }

        const hecho = await upsertMembership({
            userId, clubId,
            roleKey: rol.custom ? null : rol.key,
            roleId: rol.custom ? rol.id : null,
            status: 'invited',
            invitedBy: req.user?.id || null,
            createdBy: req.user?.id || null,
        });
        if (!hecho.ok) {
            return { assigned: false, warnings: ['No pudimos guardar el rol del sitio. La cuenta quedó creada; asígnaselo desde Usuarios y permisos.'] };
        }

        await audit('membership_created', {
            clubId, userId, actor: actorOf(req), req,
            detail: `Alta con el rol ${rol.name}`,
        });
        return { assigned: true, role: rol, summary: describeRole(rol.permissions), warnings: [] };
    } catch (e) {
        console.error('[ACCESOS] asignarRolDeSitio:', e?.message);
        return { assigned: false, warnings: ['No pudimos guardar el rol del sitio. La cuenta quedó creada; asígnaselo desde Usuarios y permisos.'] };
    }
};

/**
 * POST /api/institutional/accounts
 *
 * Crea la cuenta de correo y —si se pide— la identidad de su propietario. Las
 * dos cosas en una sola petición porque son un solo gesto del administrador;
 * el vínculo entre ambas lo guarda `InstitutionalProfile`.
 */
export const createAccount = async (req, res) => {
    try {
        const clubId = scopeOf(req);
        if (!clubId) return res.status(400).json({ error: 'No hay un sitio en el contexto de esta sesión.' });

        const { domain } = await domainOf(clubId);
        const revision = validateAccountPayload(req.body || {}, { domain });
        if (!revision.ok) {
            // TODOS los errores, no el primero: «datos inválidos» a secas
            // obliga a probar campo por campo.
            return res.status(400).json({ error: revision.errors[0], errors: revision.errors, warnings: revision.warnings });
        }

        const v = revision.value;

        const yaExiste = await prisma.emailAccount.findUnique({ where: { email: v.email } });
        if (yaExiste) {
            return res.status(409).json({
                error: `La dirección ${v.email} ya existe. Si quieres darle acceso al panel, usa "Dar acceso" en su fila.`,
            });
        }

        const cuenta = await prisma.emailAccount.create({
            data: {
                email: v.email,
                label: [v.firstName, v.lastName].filter(Boolean).join(' ') || null,
                password: v.password,
                isPrimary: false,
                provider: 'platform',
                clubId,
            },
            select: { id: true, email: true, label: true, isPrimary: true, provider: true, createdAt: true },
        });

        await audit('account_created', {
            clubId, email: v.email, actor: actorOf(req), req,
            detail: v.grantAccess ? 'con acceso al panel' : 'sólo buzón',
        });

        if (!v.grantAccess) {
            return res.status(201).json({
                account: { ...cuenta, owner: null, hasAccess: false },
                warnings: revision.warnings,
                message: 'Cuenta de correo creada. No tiene acceso al panel.',
            });
        }

        const { user, created, passwordSet } = await ensureUserFor({
            email: v.email, password: v.password, role: v.role, clubId,
        });

        // Un usuario que YA existía conserva su rol si es administrativo: un
        // alta de correo no puede degradar a un administrador del sitio sin que
        // nadie lo haya pedido.
        if (!created && !isSiteAdministrator(user) && user.role !== v.role) {
            await db.query('UPDATE "User" SET role = $1, "updatedAt" = NOW() WHERE id = $2', [v.role, user.id]);
            user.role = v.role;
        }

        const { profile } = await upsertProfile({
            userId: user.id,
            clubId,
            emailAccountId: cuenta.id,
            mailbox: v.email,
            firstName: v.firstName,
            lastName: v.lastName,
            position: v.position,
            avatarUrl: str(req.body?.avatarUrl, 1000) || undefined,
            permissions: v.permissions,
            status: 'active',
            mustChangePassword: passwordSet ? v.temporaryPassword : undefined,
            createdBy: req.user?.id || null,
        });

        await audit('owner_assigned', {
            clubId, userId: user.id, email: v.email, actor: actorOf(req), req,
            detail: displayNameOf(v, v.email),
        });
        await audit('access_granted', {
            clubId, userId: user.id, email: v.email, actor: actorOf(req), req,
            detail: `rol ${v.role} · permisos: ${v.permissions.join(', ') || 'ninguno'}`,
        });

        const rolDeSitio = await asignarRolDeSitio(req, { clubId, userId: user.id });

        const avisos = [...revision.warnings, ...rolDeSitio.warnings];
        if (!passwordSet) {
            // Es el caso del correo que ya tenía usuario: se vincula, no se le
            // pisa la contraseña. Decirlo importa, o el administrador le
            // entrega una credencial que no funciona.
            avisos.push('Ese correo ya tenía una cuenta de acceso: se vinculó sin cambiar su contraseña. Entra con la que ya usaba.');
        }

        res.status(201).json({
            account: { ...cuenta, hasAccess: true, owner: { ...profile, userId: user.id, role: user.role } },
            warnings: avisos,
            // ⚠️ NUNCA SE DEVUELVE LA CONTRASEÑA. Ni entera ni recortada: el
            // pedido lo dice y además no serviría de nada — para entregársela a
            // su dueño está "Enviar instrucciones de acceso".
            message: `Cuenta creada para ${v.email}.`,
        });
    } catch (error) {
        console.error('[ACCESOS] createAccount:', error);
        res.status(500).json({ error: 'No pudimos crear la cuenta.' });
    }
};

/**
 * POST /api/institutional/accounts/:id/access
 *
 * Le da acceso al panel a una cuenta que ya existía. Es la otra mitad del
 * pedido: «si la cuenta de correo ya existe y después se quiere otorgar acceso,
 * también debe poder hacerse».
 */
export const grantAccess = async (req, res) => {
    try {
        const clubId = scopeOf(req);
        const { id } = req.params;

        // El `clubId` va en el WHERE: para quien pregunte por una cuenta de otro
        // sitio, esa cuenta no existe.
        const cuenta = await prisma.emailAccount.findFirst({
            where: { id, clubId },
            select: { id: true, email: true, clubId: true },
        });
        if (!cuenta) return res.status(404).json({ error: 'Esa cuenta no existe en este sitio.' });

        const yaTiene = await profileByAccountId(cuenta.id) || await profileByMailbox(clubId, cuenta.email);
        if (yaTiene) {
            return res.status(409).json({ error: 'Esa cuenta ya tiene un propietario con acceso. Edítalo en vez de crear otro.' });
        }

        const revision = validateAccountPayload(
            { ...req.body, local: cuenta.email.split('@')[0] },
            { domain: cuenta.email.split('@')[1], requireAccess: true }
        );
        if (!revision.ok) {
            return res.status(400).json({ error: revision.errors[0], errors: revision.errors, warnings: revision.warnings });
        }
        const v = revision.value;

        const { user, created, passwordSet } = await ensureUserFor({
            email: cuenta.email, password: v.password, role: v.role, clubId,
        });
        if (!created && !isSiteAdministrator(user) && user.role !== v.role) {
            await db.query('UPDATE "User" SET role = $1, "updatedAt" = NOW() WHERE id = $2', [v.role, user.id]);
            user.role = v.role;
        }

        const { profile } = await upsertProfile({
            userId: user.id, clubId, emailAccountId: cuenta.id, mailbox: cuenta.email,
            firstName: v.firstName, lastName: v.lastName, position: v.position,
            permissions: v.permissions, status: 'active',
            mustChangePassword: passwordSet ? v.temporaryPassword : undefined,
            createdBy: req.user?.id || null,
        });

        await audit('access_granted', {
            clubId, userId: user.id, email: cuenta.email, actor: actorOf(req), req,
            detail: `rol ${user.role} · permisos: ${v.permissions.join(', ') || 'ninguno'}`,
        });

        const rolDeSitio = await asignarRolDeSitio(req, { clubId, userId: user.id });

        const avisos = [...revision.warnings, ...rolDeSitio.warnings];
        if (!passwordSet) avisos.push('Ese correo ya tenía una cuenta de acceso: se vinculó sin cambiar su contraseña.');

        res.json({ owner: { ...profile, userId: user.id, role: user.role }, warnings: avisos });
    } catch (error) {
        console.error('[ACCESOS] grantAccess:', error);
        res.status(500).json({ error: 'No pudimos habilitar el acceso.' });
    }
};

/**
 * PATCH /api/institutional/owners/:userId
 *
 * Cambia rol, permisos, estado o datos del propietario. Cada cosa que cambia
 * deja su evento de auditoría con el valor anterior y el nuevo: «rol
 * modificado» sin decir de qué a qué no sirve para rendir cuentas.
 */
export const updateOwner = async (req, res) => {
    try {
        const clubId = scopeOf(req);
        const { userId } = req.params;

        const perfil = await profileForUser(userId);
        if (!perfil || perfil.clubId !== clubId) {
            return res.status(404).json({ error: 'Ese usuario no existe en este sitio.' });
        }

        const { rows } = await db.query('SELECT id, email, role FROM "User" WHERE id = $1 LIMIT 1', [userId]);
        const user = rows[0];
        if (!user) return res.status(404).json({ error: 'Ese usuario no existe.' });

        // ⚠️ NADIE SE EDITA A SÍ MISMO POR ACÁ. Con el permiso `users`, un
        // administrador podría quitarse el suyo y quedarse fuera —o, al revés,
        // un institucional con el permiso por error se lo ampliaría—. Para lo
        // propio está `/institutional/me`, que no toca rol ni permisos.
        if (userId === req.user?.id) {
            return res.status(400).json({ error: 'No puedes cambiar tu propio rol ni tus permisos desde acá.' });
        }

        const cambios = [];

        if (req.body?.role !== undefined) {
            const rol = str(req.body.role, 40);
            if (!ACCESS_ROLE_KEYS.includes(rol)) {
                return res.status(400).json({ error: 'Ese rol de acceso no existe.' });
            }
            // Sólo el operador de la plataforma puede repartir roles de
            // administración: un administrador de sitio que puede nombrar
            // administradores multiplica el alcance de una credencial robada.
            if (rol !== INSTITUTIONAL_ROLE && !isPlatformOperator(req.user)) {
                const yaEraAdmin = isSiteAdministrator(user);
                if (!yaEraAdmin) {
                    return res.status(403).json({
                        error: 'Sólo el administrador de Club Platform puede nombrar administradores de sitio.',
                    });
                }
            }
            if (rol !== user.role) {
                await db.query('UPDATE "User" SET role = $1, "updatedAt" = NOW() WHERE id = $2', [rol, userId]);
                cambios.push({ kind: 'role_changed', detail: `${user.role} → ${rol}` });
                user.role = rol;
            }
        }

        const parche = {};
        if (req.body?.firstName !== undefined) parche.firstName = str(req.body.firstName, 80);
        if (req.body?.lastName !== undefined) parche.lastName = str(req.body.lastName, 80);
        if (req.body?.position !== undefined) parche.position = str(req.body.position, 120);
        if (req.body?.avatarUrl !== undefined) parche.avatarUrl = str(req.body.avatarUrl, 1000) || null;

        if (req.body?.permissions !== undefined) {
            const { permissions, descartados } = normalizePermissions(req.body.permissions, user.role);
            parche.permissions = permissions;
            if (JSON.stringify(permissions) !== JSON.stringify(perfil.permissions)) {
                cambios.push({
                    kind: 'permissions_changed',
                    detail: `${perfil.permissions.join(', ') || 'ninguno'} → ${permissions.join(', ') || 'ninguno'}`,
                });
            }
            for (const d of descartados) {
                cambios.push({ kind: 'permissions_changed', detail: `descartado ${d.key}: ${d.motivo}` });
            }
        }

        if (req.body?.status !== undefined) {
            const estado = str(req.body.status, 20) === 'suspended' ? 'suspended' : 'active';
            if (estado !== perfil.status) {
                parche.status = estado;
                cambios.push({
                    kind: estado === 'suspended' ? 'account_suspended' : 'account_restored',
                    detail: estado === 'suspended'
                        ? 'no podrá entrar y sus peticiones en curso quedan rechazadas'
                        : 'vuelve a poder entrar',
                });
            }
        }

        if (Object.keys(parche).length) {
            await upsertProfile({ userId, clubId, ...parche });
            if (!cambios.length) cambios.push({ kind: 'profile_updated', detail: Object.keys(parche).join(', ') });
        }

        for (const c of cambios) {
            await audit(c.kind, { clubId, userId, email: user.email, actor: actorOf(req), detail: c.detail, req });
        }

        const actualizado = await profileForUser(userId);
        res.json({
            owner: { ...actualizado, role: user.role },
            changed: cambios.map(c => c.detail),
        });
    } catch (error) {
        console.error('[ACCESOS] updateOwner:', error);
        res.status(500).json({ error: 'No pudimos actualizar el acceso.' });
    }
};

/**
 * DELETE /api/institutional/owners/:userId/access
 *
 * Retira el acceso al panel SIN borrar al usuario ni su cuenta de correo.
 *
 * ⚠️ Retirar no es borrar, y la diferencia importa: borrar la fila dejaría sin
 * explicación los correos que esa persona envió y los cambios que hizo. Se
 * suspende, queda la traza, y la cuenta de correo sigue recibiendo.
 */
export const revokeAccess = async (req, res) => {
    try {
        const clubId = scopeOf(req);
        const { userId } = req.params;
        if (userId === req.user?.id) {
            return res.status(400).json({ error: 'No puedes retirarte tu propio acceso.' });
        }

        const perfil = await profileForUser(userId);
        if (!perfil || perfil.clubId !== clubId) {
            return res.status(404).json({ error: 'Ese usuario no existe en este sitio.' });
        }

        await upsertProfile({ userId, clubId, status: 'suspended' });
        await audit('access_revoked', {
            clubId, userId, email: perfil.mailbox, actor: actorOf(req), req,
            detail: 'acceso suspendido; la cuenta de correo sigue activa',
        });

        res.json({
            ok: true,
            message: 'El acceso quedó suspendido. La cuenta de correo sigue recibiendo mensajes.',
        });
    } catch (error) {
        console.error('[ACCESOS] revokeAccess:', error);
        res.status(500).json({ error: 'No pudimos retirar el acceso.' });
    }
};

/**
 * POST /api/institutional/owners/:userId/reset
 *
 * El administrador manda un enlace de restablecimiento. NO fija una contraseña
 * nueva ni la ve: eso volvería a poner una credencial compartida en circulación,
 * que es justo lo que la contraseña temporal existe para terminar.
 */
export const sendAccessInstructions = async (req, res) => {
    try {
        const clubId = scopeOf(req);
        const { userId } = req.params;

        const perfil = await profileForUser(userId);
        if (!perfil || perfil.clubId !== clubId) {
            return res.status(404).json({ error: 'Ese usuario no existe en este sitio.' });
        }

        const { rows } = await db.query('SELECT id, email FROM "User" WHERE id = $1 LIMIT 1', [userId]);
        const user = rows[0];
        if (!user) return res.status(404).json({ error: 'Ese usuario no existe.' });

        const { name: clubName } = await domainOf(clubId);
        const origin = req.headers.origin || 'https://app.clubplatform.org';

        // Reutiliza el flujo de recuperación: un segundo mecanismo para mandar
        // el mismo enlace se separaría del primero en silencio.
        const jwtLib = (await import('jsonwebtoken')).default;
        const { JWT_SECRET } = await import('../middleware/auth.js');
        const token = jwtLib.sign({ sub: user.id, purpose: 'platform_reset' }, JWT_SECRET, { expiresIn: '48h' });
        const { storeResetToken } = await import('../lib/institutionalStore.js');
        await storeResetToken(user.id, token, { hours: 24 });

        const link = `${origin}/restablecer?token=${encodeURIComponent(token)}`;
        const envio = await EmailService.sendPlatformEmail({
            to: user.email,
            subject: `Tu acceso a ${clubName || 'la plataforma'}`,
            html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#1f2937">
                <h2 style="color:#17458F">Ya tienes acceso al panel</h2>
                <p>Se creó tu cuenta institucional <strong>${user.email}</strong>${clubName ? ` en ${clubName}` : ''}.</p>
                <p>Crea tu contraseña con este enlace y entra desde el botón <strong>Iniciar sesión</strong> del sitio:</p>
                <p><a href="${link}" style="display:inline-block;background:#17458F;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold">Crear mi contraseña</a></p>
                <p style="font-size:13px;color:#6b7280">El enlace vence en 24 horas y sólo se puede usar una vez.</p>
            </div>`,
            text: `Tu cuenta institucional es ${user.email}. Crea tu contraseña acá: ${link}`,
        }).catch(err => ({ success: false, error: err?.message }));

        await audit('instructions_sent', {
            clubId, userId, email: user.email, actor: actorOf(req), req,
            detail: envio?.success === false ? `fallo: ${envio.error || 'desconocido'}` : 'enlace enviado',
        });

        if (envio?.success === false) {
            // El error del proveedor se propaga TEXTUAL: «no se pudo enviar» a
            // secas deja a quien corrige sin saber si el problema es el dominio,
            // la dirección o la credencial.
            return res.status(502).json({ error: `El proveedor de correo rechazó el envío: ${envio.error || 'sin detalle'}` });
        }
        res.json({ ok: true, message: `Le enviamos las instrucciones a ${user.email}.` });
    } catch (error) {
        console.error('[ACCESOS] sendAccessInstructions:', error);
        res.status(500).json({ error: 'No pudimos enviar las instrucciones.' });
    }
};

/** GET /api/institutional/audit — la traza del sitio. */
export const getAudit = async (req, res) => {
    try {
        const clubId = scopeOf(req);
        if (!clubId) return res.status(400).json({ error: 'No hay un sitio en el contexto de esta sesión.' });
        const eventos = await listAudit(clubId, { userId: req.query?.userId || null, limit: req.query?.limit });
        res.json({ events: eventos });
    } catch (error) {
        console.error('[ACCESOS] getAudit:', error);
        res.status(500).json({ error: 'No pudimos cargar la auditoría.' });
    }
};

// ─────────────────────────────────────────────────────────────────────
// El perfil propio
// ─────────────────────────────────────────────────────────────────────

/**
 * GET /api/institutional/me
 *
 * Lo que el panel necesita para pintarse: quién soy, qué puedo y con qué
 * buzón. Es la fuente de verdad que refresca lo que el token trae congelado.
 */
export const getMe = async (req, res) => {
    try {
        await attachInstitutionalProfile(req);
        const perfil = req.institutionalProfile;
        const { rows } = await db.query(
            'SELECT id, email, role, "clubId", name FROM "User" WHERE id = $1 LIMIT 1', [req.user.id]);
        const user = rows[0] || { id: req.user.id, email: req.user.email, role: req.user.role };

        res.json({
            id: user.id,
            email: user.email,
            role: user.role,
            clubId: perfil?.clubId || user.clubId || null,
            firstName: perfil?.firstName || null,
            lastName: perfil?.lastName || null,
            position: perfil?.position || null,
            avatarUrl: perfil?.avatarUrl || null,
            mailbox: perfil?.mailbox || null,
            displayName: displayNameOf(perfil || { name: user.name }, user.email),
            permissions: effectivePermissions({ role: user.role, permissions: perfil?.permissions }),
            status: perfil?.status || 'active',
            mustChangePassword: !!perfil?.mustChangePassword,
            lastLoginAt: perfil?.lastLoginAt || null,
            // Un administrador no tiene fila y eso NO es un defecto: se dice,
            // para que la pantalla no pinte un perfil a medias como si le
            // faltaran datos.
            hasProfile: !!perfil,
        });
    } catch (error) {
        console.error('[ACCESOS] getMe:', error);
        res.status(500).json({ error: 'No pudimos cargar tu perfil.' });
    }
};

/**
 * PATCH /api/institutional/me
 *
 * ⚠️ EL CATÁLOGO DE LO EDITABLE ES CERRADO Y ESTÁ ACÁ, no en la pantalla. Es la
 * frontera ESTRUCTURAL: lo que no se puede expresar en esta petición no se
 * puede pedir. Rol, permisos, sitio, estado y buzón NO están —concedérselos a
 * uno mismo sería el agujero entero—.
 */
export const updateMe = async (req, res) => {
    try {
        await attachInstitutionalProfile(req);
        const perfil = req.institutionalProfile;

        const parche = {};
        if (req.body?.firstName !== undefined) parche.firstName = str(req.body.firstName, 80);
        if (req.body?.lastName !== undefined) parche.lastName = str(req.body.lastName, 80);
        if (req.body?.position !== undefined) parche.position = str(req.body.position, 120);
        if (req.body?.avatarUrl !== undefined) {
            const url = str(req.body.avatarUrl, 1000);
            // Termina en un `<img>` del panel: sólo https, y ningún `data:` ni
            // `javascript:`. Misma cautela que `normalizeMapUrl` con el mapa de
            // una sede (v4.717).
            if (url && !/^https:\/\//i.test(url)) {
                return res.status(400).json({ error: 'La fotografía tiene que estar subida a la Biblioteca del sitio.' });
            }
            parche.avatarUrl = url || null;
        }

        if (!Object.keys(parche).length) {
            return res.status(400).json({ error: 'No mandaste nada que cambiar.' });
        }

        if (!perfil) {
            // Un administrador sin fila que sube su fotografía: se le crea el
            // perfil ahí mismo, sin permisos —su rol ya es la concesión— y sin
            // buzón. Devolver 404 lo dejaría sin poder tener avatar.
            await upsertProfile({
                userId: req.user.id,
                clubId: req.user.clubId,
                permissions: [],
                ...parche,
            });
        } else {
            await upsertProfile({ userId: req.user.id, clubId: perfil.clubId, ...parche });
        }

        await audit('profile_updated', {
            clubId: perfil?.clubId || req.user.clubId, userId: req.user.id, email: req.user.email,
            actor: { kind: 'self', id: req.user.id, label: req.user.email },
            detail: Object.keys(parche).join(', '), req,
        });

        const actualizado = await profileForUser(req.user.id);
        res.json({ ok: true, profile: actualizado });
    } catch (error) {
        console.error('[ACCESOS] updateMe:', error);
        res.status(500).json({ error: 'No pudimos guardar tu perfil.' });
    }
};

/**
 * POST /api/institutional/me/password
 *
 * ⚠️ EXIGE LA CONTRASEÑA ACTUAL, y no es ceremonia: sin ella, quien encuentre
 * una sesión abierta en un equipo prestado se la cambia y se queda con la
 * cuenta. Es lo que convierte «tengo el token» en «soy el dueño».
 */
export const changeMyPassword = async (req, res) => {
    try {
        const actual = String(req.body?.currentPassword || '');
        const nueva = String(req.body?.newPassword || '');
        const confirma = String(req.body?.confirmPassword ?? req.body?.newPasswordConfirm ?? '');

        if (!actual) return res.status(400).json({ error: 'Escribe tu contraseña actual.' });
        if (nueva.length < PASSWORD_MIN) {
            return res.status(400).json({ error: `La contraseña nueva debe tener al menos ${PASSWORD_MIN} caracteres.` });
        }
        if (confirma !== nueva) return res.status(400).json({ error: 'Las dos contraseñas nuevas no coinciden.' });
        if (nueva === actual) return res.status(400).json({ error: 'La contraseña nueva tiene que ser distinta de la actual.' });

        const { rows } = await db.query('SELECT id, email, password, "clubId" FROM "User" WHERE id = $1 LIMIT 1', [req.user.id]);
        const user = rows[0];
        if (!user) return res.status(404).json({ error: 'No encontramos tu cuenta.' });

        const coincide = await bcrypt.compare(actual, user.password).catch(() => false);
        if (!coincide) {
            await audit('login_failed', {
                clubId: user.clubId, userId: user.id, email: user.email,
                detail: 'contraseña actual incorrecta al intentar cambiarla', req,
            });
            return res.status(401).json({ error: 'Tu contraseña actual no es correcta.' });
        }

        const hash = await bcrypt.hash(nueva, 10);
        await db.query('UPDATE "User" SET password = $1, "updatedAt" = NOW() WHERE id = $2', [hash, user.id]);
        // La puso su dueño: deja de ser temporal, y el panel deja de pedirla.
        await markPasswordSet(user.id, { temporary: false });
        await audit('password_changed', {
            clubId: user.clubId, userId: user.id, email: user.email,
            actor: { kind: 'self', id: user.id, label: user.email }, req,
        });

        res.json({ ok: true, message: 'Tu contraseña quedó actualizada.' });
    } catch (error) {
        console.error('[ACCESOS] changeMyPassword:', error);
        res.status(500).json({ error: 'No pudimos cambiar tu contraseña.' });
    }
};

export default {
    getCatalog, listAccounts, createAccount, grantAccess, updateOwner,
    revokeAccess, sendAccessInstructions, getAudit,
    getMe, updateMe, changeMyPassword,
};
