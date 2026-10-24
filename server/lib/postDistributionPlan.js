// ════════════════════════════════════════════════════════════════════
// Dónde se puede publicar una noticia que ya existe — v4.1243
//
// PURO a propósito: sin base, sin red, sin DOM. Recibe la publicación, los
// sitios y los distritos ya leídos, y devuelve QUÉ se le ofrece a quien la
// está mirando. La lectura vive en `loadDistributionContext`, que recibe la
// función de consulta para poder probarse sin Postgres.
//
// EL REPORTE
// ----------
// En `/admin/noticias`, el botón «Gestionar destinos de distribución» abría el
// modal de Trazabilidad, que sólo PINTABA `targetClubIds`. Con una noticia
// propia de un club —«E-Club Origen apoyó campaña Jaque Mate a la Polio»,
// Origen: Propia, 0 réplicas— el modal decía «Este artículo no tiene sitios de
// distribución asignados» y no ofrecía ninguno: ni el sitio del club, ni el
// del distrito, ni COLROTARIOS. Para elegirlos había que abrir el editor, y
// la pestaña «Distribución» sólo la ve el operador o el distrito.
//
// LAS TRES REGLAS
// ---------------
//  1. QUIÉN LA PUBLICÓ Y DESDE QUÉ DISTRITO se dice siempre. `Post` no guarda
//     una persona autora, así que se dice el SITIO que la publicó (`clubId`) y
//     su distrito; una central sin sitio la publicó Club Platform.
//  2. EL SITIO DE ORIGEN aparece primero y fijo: la noticia ya se ve allí por
//     `clubId`, así que no es un destino que se pueda quitar desde aquí.
//  3. EL SITIO DEL DISTRITO Y COLROTARIOS van POR DEFECTO. Pedido literal:
//     «todo lo que se publique en el distrito y en los clubes Rotarios que
//     tienen el ecosistema activo también se pueda publicar en con Rotarios».
//     Van preseleccionados cuando la noticia todavía no tiene destinos; quien
//     los quiera quitar los desmarca. Nada se publica sin pulsar Guardar.
//
// ⚠️ NINGÚN DESTINO AJENO SE BORRA EN SILENCIO. Un administrador de club sólo
// puede elegir el sitio de su distrito y COLROTARIOS; si la noticia ya tenía
// otros destinos que puso el distrito, `mergeTargetSelection` los conserva en
// vez de quitarlos porque no aparecían en la lista de quien guardó.
// ════════════════════════════════════════════════════════════════════

import { parseDistrictTags } from './districtEcosystem.js';
import { isDistrictSiteType } from './districtSite.js';

const norm = (v) => (v == null ? '' : String(v).trim().toLowerCase());
const str = (v) => (v == null ? '' : String(v).trim());

export const PLATFORM_LABEL = 'Club Platform';
export const COLROTARIOS_LABEL = 'COLROTARIOS';

const OPERATOR_ROLES = ['administrator', 'superadmin'];
const CLUB_ROLES = ['club_admin', 'editor'];

/** Estados de un sitio que NO cuentan como activo en el ecosistema. */
const INACTIVE_STATUSES = ['draft', 'inactive', 'suspended', 'archived', 'deleted', 'disabled', 'pending'];

/** ¿El sitio está activo? `status` vacío es el sitio antiguo, que sí lo está. */
export const isActiveSite = (club) => !!club && !INACTIVE_STATUSES.includes(norm(club.status));

/** ¿Es el sitio de un distrito? Mira los dos campos donde se guarda el tipo. */
export const isDistrictSite = (club) =>
    !!club && (isDistrictSiteType(club.type) || isDistrictSiteType(club.organizationType));

/**
 * ¿Es COLROTARIOS? Mismo criterio que la bandeja de solicitudes
 * (`submissionInbox.js`): el tipo, la categoría, el nombre o su dominio.
 */
export const isColrotariosSite = (club) => {
    if (!club) return false;
    if (['colrotarios'].includes(norm(club.type)) || norm(club.category) === 'colrotarios' || norm(club.organizationType) === 'colrotarios') return true;
    return [club.name, club.domain, club.subdomain].some((v) => norm(v).replace(/\s+/g, '').includes('colrotarios'));
};

/** La dirección pública del sitio, o null si no tiene ninguna. */
export const siteUrlOf = (club, district = null) => {
    const domain = str(club?.domain) || (isDistrictSite(club) ? str(district?.domain) : '');
    if (domain) return `https://${domain.replace(/^https?:\/\//, '').replace(/\/.*$/, '')}`;
    const sub = str(club?.subdomain) || (isDistrictSite(club) ? str(district?.subdomain) : '');
    if (sub) return `https://${sub}.clubplatform.org`;
    return null;
};

/** ¿Pertenece este sitio al distrito? `districtId` o el número en `Club.district`. */
export const belongsToDistrict = (club, district) => {
    if (!club || !district) return false;
    if (district.id && str(club.districtId) === str(district.id)) return true;
    const number = district.number != null ? String(district.number) : '';
    if (!number) return false;
    if (parseDistrictTags(club.district).includes(number)) return true;
    // El sitio del distrito a veces sólo lleva el número en el nombre («Distrito 4281»).
    return isDistrictSite(club) && parseDistrictTags(club.name).includes(number);
};

/** El distrito de un sitio, entre los distritos conocidos. */
export const districtOfSite = (club, districts = []) => {
    if (!club) return null;
    const byId = districts.find((d) => club.districtId && str(d.id) === str(club.districtId));
    if (byId) return byId;
    const tags = parseDistrictTags(club.district);
    if (isDistrictSite(club) && tags.length === 0) tags.push(...parseDistrictTags(club.name));
    for (const tag of tags) {
        const hit = districts.find((d) => String(d.number) === tag);
        if (hit) return hit;
    }
    return null;
};

/** Prefiere el sitio con dominio propio, luego con subdominio; desempata por nombre. */
const bySiteQuality = (a, b) => {
    const score = (c) => (str(c.domain) ? 2 : 0) + (str(c.subdomain) ? 1 : 0);
    return score(b) - score(a) || str(a.name).localeCompare(str(b.name));
};

/** El sitio activo de COLROTARIOS. Hay más de una fila con ese nombre: gana la que tiene dominio. */
export const pickColrotarios = (clubs = []) =>
    clubs.filter((c) => isActiveSite(c) && isColrotariosSite(c)).sort(bySiteQuality)[0] || null;

/** El sitio activo del distrito. */
export const pickDistrictSite = (clubs = [], district = null) => {
    if (!district) return null;
    return clubs.filter((c) => isActiveSite(c) && isDistrictSite(c) && belongsToDistrict(c, district)).sort(bySiteQuality)[0] || null;
};

const isOperator = (user) => OPERATOR_ROLES.includes(str(user?.role));

/**
 * QUÉ PUEDE ELEGIR ESTA SESIÓN para ESTA noticia.
 *
 *   · operador          → cualquier sitio activo del ecosistema;
 *   · admin de distrito → los sitios de su distrito, más COLROTARIOS;
 *   · admin/editor del club dueño de la noticia → el sitio de su distrito y
 *     COLROTARIOS. Es lo que pide el reporte para los clubes con el
 *     ecosistema activo, y nada más: un club no reparte noticias a otros clubes.
 *   · cualquier otro    → nada, con su motivo.
 */
export const distributionScopeFor = (user, post) => {
    const role = str(user?.role);
    if (isOperator(user)) return { mode: 'all', canManage: true, reason: null };
    if (role === 'district_admin') return { mode: 'district', canManage: true, reason: null };
    if (CLUB_ROLES.includes(role) && str(post?.clubId) && str(user?.clubId) === str(post.clubId)) {
        return { mode: 'club', canManage: true, reason: null };
    }
    return {
        mode: 'none',
        canManage: false,
        reason: 'Sólo el sitio que publicó la noticia, su distrito o Club Platform pueden elegir dónde más se publica.',
    };
};

const entryOf = (club, { role, district, districts, isDefault = false, locked = false }) => {
    const d = district || districtOfSite(club, districts);
    return {
        id: club.id,
        name: club.name || club.id,
        role,
        url: siteUrlOf(club, d),
        districtNumber: d?.number ?? null,
        isDefault,
        locked,
        city: club.city || '',
        organizationType: club.organizationType || club.type || '',
    };
};

const targetsOf = (post) =>
    Array.isArray(post?.targetClubIds) ? [...new Set(post.targetClubIds.filter(Boolean).map(String))] : [];

/**
 * El plan que pinta el modal: quién la publicó, el sitio de origen, los
 * destinos por defecto, los demás sitios que se pueden elegir y lo que ya tiene.
 *
 * `clubs` son los sitios conocidos (todos los estados: un destino actual que
 * ya no está activo se sigue mostrando con su nombre). `districts` son las
 * filas de `District`.
 */
export const buildDistributionPlan = ({ post, clubs = [], districts = [], user = null } = {}) => {
    const byId = new Map(clubs.map((c) => [String(c.id), c]));
    const owner = str(post?.clubId) ? byId.get(str(post.clubId)) || null : null;
    const sourceDistrict = str(post?.sourceDistrictId)
        ? districts.find((d) => str(d.id) === str(post.sourceDistrictId) || String(d.number) === str(post.sourceDistrictId)) || null
        : null;
    const district = districtOfSite(owner, districts) || sourceDistrict;

    const publisherName = owner?.name || (str(post?.clubId) ? str(post.clubId) : PLATFORM_LABEL);
    const districtLabel = district ? (district.name || `Distrito ${district.number}`) : null;
    const publisher = {
        siteId: owner?.id || null,
        name: publisherName,
        kind: !owner ? 'platform' : isDistrictSite(owner) ? 'district' : isColrotariosSite(owner) ? 'colrotarios' : 'club',
        url: owner ? siteUrlOf(owner, district) : null,
        districtId: district?.id || null,
        districtNumber: district?.number ?? null,
        districtName: districtLabel,
        label: districtLabel ? `${publisherName} · ${districtLabel}` : publisherName,
    };

    const scope = distributionScopeFor(user, post);
    const current = targetsOf(post);
    const ownerId = owner ? String(owner.id) : '';

    const districtSite = pickDistrictSite(clubs, district);
    const colrotarios = pickColrotarios(clubs);

    const origin = owner
        ? entryOf(owner, { role: 'origin', district, districts, locked: true })
        : null;

    // Los destinos por defecto: el distrito y COLROTARIOS, salvo que sean el
    // propio sitio de origen (una noticia del distrito no se replica en sí misma).
    const featured = [];
    if (districtSite && String(districtSite.id) !== ownerId) {
        featured.push(entryOf(districtSite, { role: 'district', district, districts, isDefault: true }));
    }
    if (colrotarios && String(colrotarios.id) !== ownerId) {
        featured.push(entryOf(colrotarios, { role: 'colrotarios', districts, isDefault: true }));
    }
    const featuredIds = new Set(featured.map((f) => String(f.id)));

    // Los demás sitios activos que esta sesión puede elegir.
    let others = [];
    if (scope.mode === 'all' || scope.mode === 'district') {
        const scopeDistrict = scope.mode === 'district'
            ? (districts.find((d) => str(user?.districtId) && (str(d.id) === str(user.districtId) || String(d.number) === str(user.districtId))) || district)
            : null;
        others = clubs
            .filter((c) => isActiveSite(c))
            .filter((c) => String(c.id) !== ownerId && !featuredIds.has(String(c.id)))
            .filter((c) => scope.mode === 'all' || belongsToDistrict(c, scopeDistrict))
            .sort((a, b) => {
                // Primero los del distrito de la noticia; después el resto, por nombre.
                const da = belongsToDistrict(a, district) ? 0 : 1;
                const db = belongsToDistrict(b, district) ? 0 : 1;
                return da - db || str(a.name).localeCompare(str(b.name));
            })
            .map((c) => entryOf(c, { role: 'ecosystem', districts }));
    }

    const selectable = scope.canManage ? [...featured, ...others] : [];
    const allowedIds = selectable.map((s) => String(s.id));

    const currentTargets = current.map((id) => {
        const c = byId.get(id);
        return {
            id,
            name: c?.name || id,
            url: c ? siteUrlOf(c, districtOfSite(c, districts)) : null,
            exists: !!c,
            active: c ? isActiveSite(c) : false,
            editable: allowedIds.includes(id),
        };
    });

    // Sin destinos todavía → se proponen el distrito y COLROTARIOS.
    const defaults = scope.canManage && current.length === 0
        ? featured.map((f) => String(f.id))
        : [];

    return {
        publisher,
        origin,
        featured,
        others,
        current: currentTargets,
        selected: current.length > 0 ? current : defaults,
        defaults,
        allowedIds,
        canManage: scope.canManage,
        scope: scope.mode,
        reason: scope.reason,
        notices: [
            ...(!districtSite && district ? [`No encontramos un sitio activo para el ${districtLabel}.`] : []),
            ...(!district ? ['No pudimos identificar el distrito del sitio que publicó la noticia.'] : []),
            ...(!colrotarios ? ['No encontramos un sitio activo de COLROTARIOS.'] : []),
        ],
    };
};

/**
 * Lo que se guarda al pulsar Guardar.
 *
 *   · lo pedido que esta sesión puede elegir, entra;
 *   · lo pedido que NO puede elegir, se rechaza y se dice;
 *   · lo que ya estaba y esta sesión no podía ver, se CONSERVA.
 *   · el sitio de origen nunca va como destino: ya se ve allí por `clubId`.
 *
 * Una central (`clubId` NULL) sin ningún destino se leería como GLOBAL —se
 * vería en TODOS los sitios—, así que dejarla vacía se rechaza (misma regla que
 * `retirePlan`, v4.938).
 */
export const mergeTargetSelection = (plan, post, requested) => {
    const allowed = new Set(plan.allowedIds.map(String));
    const ownerId = str(post?.clubId);
    const wanted = [...new Set((Array.isArray(requested) ? requested : []).map(str).filter(Boolean))]
        .filter((id) => id !== ownerId);
    const rejected = wanted.filter((id) => !allowed.has(id));
    const kept = targetsOf(post).filter((id) => !allowed.has(id) && id !== ownerId);
    const chosen = wanted.filter((id) => allowed.has(id));
    const targets = [...new Set([...kept, ...chosen])];

    if (!ownerId && targets.length === 0) {
        return {
            ok: false,
            status: 409,
            error: 'Esta noticia se publicó desde Club Platform sin sitio propio: sin ningún destino pasaría a verse en todos los sitios. Deja al menos uno o despublícala.',
            targets, rejected, kept,
        };
    }
    const before = new Set(targetsOf(post));
    return {
        ok: true,
        targets,
        rejected,
        kept,
        added: targets.filter((id) => !before.has(id)),
        removed: [...before].filter((id) => !targets.includes(id)),
    };
};

/** El nuevo `distributionStatus`: conserva el de los que siguen y abre el de los nuevos. */
export const nextDistributionStatus = (post, targets, now = new Date().toISOString()) => {
    const prev = (post?.distributionStatus && typeof post.distributionStatus === 'object') ? post.distributionStatus : {};
    const out = {};
    for (const id of targets) {
        out[id] = prev[id] || {
            status: post?.published ? 'published' : 'draft',
            syncMode: 'synced',
            distributedAt: now,
            lastSyncedAt: now,
            localEdits: false,
        };
    }
    return out;
};

const SITE_COLUMNS = `id, name, type, "organizationType", category, status, domain, subdomain, "districtId", district, city`;

/**
 * La lectura. Recibe `query` (la de `db.js`) para poder probarse con un doble.
 */
export const loadDistributionContext = async (query, postId) => {
    const postRes = await query(
        `SELECT id, title, published, "clubId", "targetClubIds", "sourceDistrictId", "distributionStatus", "createdAt", "updatedAt"
           FROM "Post" WHERE id = $1`,
        [postId]
    );
    const post = postRes.rows[0] || null;
    if (!post) return { post: null, clubs: [], districts: [] };
    const [clubsRes, districtsRes] = await Promise.all([
        query(`SELECT ${SITE_COLUMNS} FROM "Club" ORDER BY name ASC`),
        query(`SELECT id, number, name, domain, subdomain FROM "District"`),
    ]);
    return { post, clubs: clubsRes.rows || [], districts: districtsRes.rows || [] };
};

export default {
    isActiveSite, isDistrictSite, isColrotariosSite, siteUrlOf, belongsToDistrict, districtOfSite,
    pickColrotarios, pickDistrictSite, distributionScopeFor, buildDistributionPlan,
    mergeTargetSelection, nextDistributionStatus, loadDistributionContext,
};
