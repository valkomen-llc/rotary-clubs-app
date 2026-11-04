// ════════════════════════════════════════════════════════════════════
// Programas — el alcance de una sesión — v4.1280.0
//
// `requireRoleOrPermission(SITE_ADMIN_ROLES, 'programs.*')` abre la RUTA; este
// archivo decide la FILA: qué puede hacer esta sesión con ESTE programa. Es la
// misma separación que el Catálogo Maestro (`catalogScopeFromRecords`): el
// permiso del sitio dice «puede entrar a Programas», el alcance dice «de qué
// programa, en qué distrito y para qué club».
//
// `abilitiesFor` es PURO (sin base) para poder probarlo con una matriz de
// sesiones; `resolveScope` lee el sitio de la sesión una vez por petición.
// ════════════════════════════════════════════════════════════════════
import db from './db.js';
import { SITE_ADMIN_ROLES } from '../middleware/auth.js';
import { isDistrictSiteType } from './districtSite.js';
import { parseDistrictTags } from './districtEcosystem.js';
import { PROGRAM_ROLE_IDS, CONTENT_KINDS } from './programSpec.js';

export const ABILITIES = [
    'view', 'editProgram', 'manageMembers', 'manageLinks', 'archiveProgram',
    'submit', 'review', 'approve', 'medicalApprove', 'publish',
    'manageRequests', 'viewRequestsSummary', 'manageClubs', 'activateClub', 'localSubmit',
    'viewAudit', 'viewMetrics', 'manageFiles', 'export',
];

const ROLE_ABILITIES = {
    coordinador: ['view', 'editProgram', 'manageMembers', 'manageLinks', 'submit', 'review', 'approve', 'publish', 'manageRequests', 'manageClubs', 'viewAudit', 'viewMetrics', 'manageFiles', 'export'],
    comunicaciones: ['view', 'submit', 'review', 'approve', 'publish', 'viewAudit', 'viewMetrics', 'manageFiles'],
    revisor_medico: ['view', 'medicalApprove', 'viewAudit'],
    gestor_solicitudes: ['view', 'manageRequests', 'viewMetrics', 'export'],
    colaborador: ['view', 'submit', 'manageFiles'],
};
const DISTRICT_ADMIN_ABILITIES = ['view', 'editProgram', 'manageMembers', 'manageLinks', 'archiveProgram', 'submit', 'review', 'approve', 'publish', 'manageRequests', 'manageClubs', 'viewAudit', 'viewMetrics', 'manageFiles', 'export'];
const CLUB_ADMIN_ABILITIES = ['view', 'activateClub', 'localSubmit', 'viewRequestsSummary', 'viewMetrics', 'manageFiles'];

const uniq = (xs) => Array.from(new Set(xs));
const num = (v) => Number.parseInt(v, 10) || 0;

/** ¿Operador de la plataforma? (misma regla que `campaignScope.isOperator`). */
export const isPlatformOperator = (user = {}) => {
    const role = String(user?.role || '');
    if (role === 'superadmin' || user?.isSuperAdmin === true) return true;
    return role === 'administrator' && !user?.clubId;
};

/**
 * Lo que esta sesión puede hacer con un programa. PURO.
 *
 * @param scope   { userId, email, role, operator, siteId, siteIsDistrict, districtNumbers[], siteAdmin }
 * @param program { id, ownerClubId, ownerDistrictNumber, status }
 * @param ctx     { links[], activation|null, members[] }  — las filas de ESTE programa
 */
export function abilitiesFor(scope, program, { links = [], activation = null, members = [] } = {}) {
    const has = new Set();
    const add = (xs) => xs.forEach(a => has.add(a));
    let submitScopes = new Set();
    let clubActivationIds = new Set();
    let districtNumbers = new Set();
    let medicalScope = false;

    if (!scope || !program) return empty();
    const linkedDistricts = links.filter(l => l.status !== 'finalizada').map(l => num(l.districtNumber));
    if (scope.operator) {
        add(ABILITIES);
        return finish({ all: true });
    }

    const siteDistricts = (scope.districtNumbers || []).map(num).filter(Boolean);
    const ownsIt = scope.siteId && program.ownerClubId && scope.siteId === program.ownerClubId;
    const myLinkedDistricts = siteDistricts.filter(d => linkedDistricts.includes(d) || num(program.ownerDistrictNumber) === d);

    // Administrador distrital: administra el programa en SU distrito.
    if (scope.siteAdmin && scope.siteIsDistrict && (ownsIt || myLinkedDistricts.length)) {
        add(DISTRICT_ADMIN_ABILITIES);
        submitScopes.add('central'); submitScopes.add('district');
        myLinkedDistricts.forEach(d => districtNumbers.add(d));
        if (ownsIt) siteDistricts.forEach(d => districtNumbers.add(d));
    }

    // Responsable del club: su activación y nada más.
    if (scope.siteAdmin && scope.siteId && !scope.siteIsDistrict) {
        const own = activation && activation.clubId === scope.siteId ? activation : null;
        const availableLink = links.find(l => l.status === 'activa' && l.allowClubActivation !== false && siteDistricts.includes(num(l.districtNumber)));
        if (own || (availableLink && program.status === 'activo')) {
            const activa = Boolean(own && own.status === 'activa');
            // Sin activación vigente el club puede activar (y ver), pero no proponer contenido local.
            add(CLUB_ADMIN_ABILITIES.filter(a => a !== 'localSubmit' || activa));
            if (activa) { submitScopes.add('club'); clubActivationIds.add(own.id); }
        }
    }

    // Perfiles por programa.
    for (const m of members) {
        if (m.active === false) continue;
        const mine = (scope.userId && m.userId && m.userId === scope.userId) || (scope.email && m.email && m.email === scope.email);
        if (!mine) continue;
        const roles = (Array.isArray(m.roles) ? m.roles : []).filter(r => PROGRAM_ROLE_IDS.includes(r));
        for (const r of roles) {
            add(ROLE_ABILITIES[r] || []);
            if (r === 'revisor_medico') medicalScope = true;
            if (ROLE_ABILITIES[r].includes('submit')) {
                if (m.scopeType === 'club' && m.clubId) {
                    submitScopes.add('club');
                    if (activation && activation.clubId === m.clubId && activation.status === 'activa') clubActivationIds.add(activation.id);
                } else if (m.scopeType === 'district' && m.districtNumber) {
                    submitScopes.add('district'); districtNumbers.add(num(m.districtNumber));
                } else {
                    submitScopes.add('central'); submitScopes.add('district');
                    linkedDistricts.forEach(d => districtNumbers.add(d));
                }
            }
        }
    }
    return finish({ all: false });

    function empty() {
        return { abilities: [], can: () => false, submitScopes: [], clubActivationIds: [], districtNumbers: [], all: false, medicalScope: false };
    }
    function finish({ all }) {
        if (all) { submitScopes = new Set(['central', 'district', 'club']); linkedDistricts.forEach(d => districtNumbers.add(d)); if (activation) clubActivationIds.add(activation.id); medicalScope = true; }
        const abilities = ABILITIES.filter(a => has.has(a));
        return {
            abilities, all, medicalScope,
            can: (a) => has.has(a),
            submitScopes: Array.from(submitScopes),
            clubActivationIds: Array.from(clubActivationIds),
            districtNumbers: uniq(Array.from(districtNumbers)),
        };
    }
}

/** ¿Puede esta sesión enviar una solicitud de cambio con ESTE alcance? */
export function canSubmitScope(grant, { scopeType, districtNumber = 0, clubActivationId = null, kind = '' } = {}) {
    if (!grant) return false;
    if (grant.all) return true;
    if (!grant.submitScopes.includes(scopeType)) return false;
    if (scopeType === 'district') return grant.districtNumbers.includes(num(districtNumber));
    if (scopeType === 'club') {
        if (!clubActivationId || !grant.clubActivationIds.includes(clubActivationId)) return false;
        if (kind && CONTENT_KINDS[kind] && !CONTENT_KINDS[kind].localAllowed) return false;
        if (kind === 'info') return false;
    }
    return true;
}

/** El alcance de la sesión, leído UNA vez por petición. */
export async function resolveScope(req) {
    if (req._programScope) return req._programScope;
    const user = req.user || {};
    const clubId = String(user.clubId || req.headers?.['x-club-id'] || '').trim() || null;
    let site = null;
    if (clubId) {
        const { rows } = await db.query(
            `SELECT c.id, c.name, c.type, c.district, c."districtId", d.number AS "districtNumberFk"
               FROM "Club" c LEFT JOIN "District" d ON d.id = c."districtId"
              WHERE c.id = $1 LIMIT 1`,
            [clubId]
        ).catch(() => ({ rows: [] }));
        site = rows[0] || null;
    }
    const districtNumbers = site
        ? uniq([num(site.districtNumberFk), ...parseDistrictTags(site.district).map(num)].filter(Boolean))
        : [];
    const scope = {
        userId: user.id || null,
        email: String(user.email || '').toLowerCase() || null,
        name: user.name || user.email || 'Administración',
        role: user.role || '',
        operator: isPlatformOperator(user),
        siteAdmin: SITE_ADMIN_ROLES.includes(user.role),
        siteId: site?.id || null,
        siteName: site?.name || '',
        siteIsDistrict: site ? isDistrictSiteType(site.type) : false,
        districtNumbers,
    };
    req._programScope = scope;
    return scope;
}

/** Las filas del programa que el criterio necesita, en una ida por tabla. */
export async function contextFor(programId, scope) {
    const [links, members, activation] = await Promise.all([
        db.query(`SELECT id, "districtNumber", status, "allowClubActivation", "showInMenu", "showInCatalog" FROM "ProgramDistrictLink" WHERE "programId" = $1`, [programId]).then(r => r.rows),
        db.query(`SELECT id, "userId", email, roles, "scopeType", "districtNumber", "clubId", active FROM "ProgramMember" WHERE "programId" = $1 AND active = TRUE`, [programId]).then(r => r.rows),
        scope?.siteId
            ? db.query(`SELECT id, "clubId", "clubName", status, "districtNumber" FROM "ProgramClubActivation" WHERE "programId" = $1 AND "clubId" = $2 LIMIT 1`, [programId, scope.siteId]).then(r => r.rows[0] || null)
            : Promise.resolve(null),
    ]);
    return { links, members, activation };
}

export default { ABILITIES, abilitiesFor, canSubmitScope, resolveScope, contextFor, isPlatformOperator };
