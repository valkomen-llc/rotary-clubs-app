// ════════════════════════════════════════════════════════════════════
// Catálogo Maestro de Clubes — controlador — v4.1269.0
//
// Lo público (buscar y listar clubes ACTIVOS para un formulario) no lleva
// auth y nunca devuelve datos internos (notas, correos, quién editó). La
// administración lleva auth y, para escribir, un ALCANCE por distrito que se
// decide AQUÍ, en el servidor, no en la pantalla:
//
//   · administrator / superadmin (operadores de la plataforma) → todos.
//   · district_admin → su distrito (`districtId` de la sesión).
//   · administrador, editor o identidad institucional con `clubs.manage` del
//     SITIO DEL DISTRITO (Club.type distrito) → ese distrito.
//   · cualquier otro (p. ej. el administrador del sitio de un club) → sólo
//     consulta. Un club no da de alta ni edita el catálogo del distrito.
// ════════════════════════════════════════════════════════════════════
import db from '../lib/db.js';
import {
    ensureClubCatalogSchema, searchForForms, catalogForForms, catalogDistricts, adminCatalog, clubRow,
    clubHistory, recentChanges, createClub, updateClub, setClubStatus, duplicateCandidates, mergeClubs,
    unmergeClub, dismissDuplicate, previewImport, commitImport, markVerified, resolveClubId, CatalogError,
} from '../lib/clubCatalog.js';
import { publicClubShape, CATALOG_STATES, CLUB_TYPES, ORGANIZATION_TYPES, catalogScopeFromRecords } from '../lib/clubCatalogSpec.js';
import { isPlatformOperator } from '../lib/institutionalAccess.js';

console.log('[club-catalog] v4.1270.0 cargado — Catálogo Maestro de Clubes: el equipo del sitio distrital puede agregar y editar clubes (mismo criterio de sitio que districtSite.js)');

const fail = (res, e) => {
    const status = e instanceof CatalogError ? e.status : 500;
    if (status >= 500) console.error('[club-catalog]', e?.message || e);
    return res.status(status).json({ error: e?.message || 'Error', ...(e?.errors ? { errors: e.errors } : {}), ...(e?.existingId ? { existingId: e.existingId } : {}) });
};

const districtsParam = (v) => String(v || '').split(',').map(x => Number(String(x).replace(/\D/g, ''))).filter(n => n >= 1000 && n <= 9999);
const actorOf = (req) => ({ id: req.user?.id || null, name: req.user?.name || req.user?.email || 'Administración' });

/**
 * El alcance de escritura de la sesión, con su motivo. `scope: null` = sólo consulta.
 * La decisión es PURA (`catalogScopeFromRecords`, mismo criterio que
 * `districtSite.js`); aquí sólo se leen los registros.
 */
export async function catalogScopeDetail(user) {
    if (!user) return { scope: null, reason: 'Sin sesión.' };
    if (isPlatformOperator(user) || user.isSuperAdmin === true) return { scope: { all: true }, reason: 'Operador de la plataforma.' };
    let site = null;
    if (user.clubId) {
        const { rows } = await db.query(
            `SELECT id, name, type, "districtId", district, subdomain, domain FROM "Club" WHERE id = $1`, [user.clubId]
        ).catch(() => ({ rows: [] }));
        site = rows[0] || null;
    }
    const loose = (v) => { const m = String(v ?? '').match(/(?:^|\D)(\d{4})(?:\D|$)/); return m ? Number(m[1]) : null; };
    const siteNum = loose(site?.district) || loose(site?.subdomain) || loose(site?.domain);
    const { rows: districts } = await db.query(
        `SELECT d.id, d.number, d.name, d.subdomain, d.domain,
                ($5::text IS NOT NULL AND EXISTS (SELECT 1 FROM "User" u WHERE u."districtId" = d.id AND u."clubId" = $5 AND u.role = 'district_admin')) AS "isAdminSite"
           FROM "District" d
          WHERE d.id = ANY($1::text[])
             OR ($2::int IS NOT NULL AND d.number = $2::int)
             OR ($3::text <> '' AND lower(coalesce(d.subdomain, '')) = $3)
             OR ($4::text <> '' AND lower(coalesce(d.domain, '')) = $4)`,
        [[site?.districtId, user.districtId].filter(Boolean), siteNum || null,
            String(site?.subdomain || '').toLowerCase().trim(), String(site?.domain || '').toLowerCase().trim(), site?.id || null]
    ).catch((e) => { console.error('[club-catalog] alcance:', e?.message); return { rows: [] }; });
    return catalogScopeFromRecords({ user, site, districts });
}

/** El alcance de escritura de la sesión. `null` = sólo consulta. */
export async function catalogScopeFor(user) {
    return (await catalogScopeDetail(user)).scope;
}

const requireScope = async (req) => {
    const { scope, reason } = await catalogScopeDetail(req.user);
    if (!scope) throw new CatalogError(reason || 'Tu cuenta puede consultar el catálogo, pero no modificarlo. Lo administra el equipo distrital.', 403);
    return scope;
};

// ─── Público ──────────────────────────────────────────────────────────

// GET /api/club-catalog/public/clubs?district=4281[,4271]&q=&limit=
// Sin `q` devuelve TODOS los activos de esos distritos (un selector de ~75
// entradas es usable y un tope escondería a los del final del alfabeto).
export const publicClubs = async (req, res) => {
    try {
        const districts = districtsParam(req.query.district);
        const q = String(req.query.q || '').slice(0, 80);
        const clubs = q
            ? await searchForForms({ q, districts, limit: Math.min(100, Number(req.query.limit) || 30) })
            : (await catalogForForms({ districts })).map(publicClubShape).sort((a, b) => a.name.localeCompare(b.name, 'es'));
        res.set('Cache-Control', 'public, max-age=30, s-maxage=30');
        res.json({ clubs, total: clubs.length, districts: districts.length ? districts : null });
    } catch (e) { return fail(res, e); }
};

// GET /api/club-catalog/public/districts
export const publicDistricts = async (req, res) => {
    try {
        res.set('Cache-Control', 'public, max-age=60, s-maxage=60');
        res.json({ districts: await catalogDistricts() });
    } catch (e) { return fail(res, e); }
};

// GET /api/club-catalog/public/club/:id — sigue la fusión (un id viejo lleva al club vigente).
export const publicClub = async (req, res) => {
    try {
        const c = await resolveClubId(req.params.id);
        if (!c || c.status === 'archived') return res.status(404).json({ error: 'Club no encontrado.' });
        res.json({ club: { ...publicClubShape(c), catalogStatus: c.catalogStatus } });
    } catch (e) { return fail(res, e); }
};

// ─── Administración: lectura ─────────────────────────────────────────

// GET /api/club-catalog/admin/clubs?district=
export const adminList = async (req, res) => {
    try {
        const districts = districtsParam(req.query.district);
        const out = await adminCatalog({ districts: districts.length ? districts : null });
        const { scope, reason } = await catalogScopeDetail(req.user);
        res.json({
            ...out,
            permissions: { canWrite: !!scope, scope, reason },
            options: { states: CATALOG_STATES, clubTypes: CLUB_TYPES, organizationTypes: ORGANIZATION_TYPES },
        });
    } catch (e) { return fail(res, e); }
};

// GET /api/club-catalog/admin/duplicates?district=
export const adminDuplicates = async (req, res) => {
    try {
        const districts = districtsParam(req.query.district);
        res.json({ pairs: await duplicateCandidates({ districts: districts.length ? districts : null }) });
    } catch (e) { return fail(res, e); }
};

// GET /api/club-catalog/admin/changes?district=
export const adminChanges = async (req, res) => {
    try {
        const districts = districtsParam(req.query.district);
        res.json({ changes: await recentChanges(Number(req.query.limit) || 50, districts.length ? districts : null) });
    } catch (e) { return fail(res, e); }
};

// GET /api/club-catalog/admin/clubs/:id
export const adminDetail = async (req, res) => {
    try {
        const club = await clubRow(req.params.id);
        if (!club) return res.status(404).json({ error: 'El club no existe en el catálogo.' });
        const [history, references] = await Promise.all([clubHistory(club.id), referencesOf(club.id)]);
        res.json({ club, history, references });
    } catch (e) { return fail(res, e); }
};

/** Qué registros del resto de la plataforma apuntan a este club por su id. Sólo lectura. */
async function referencesOf(id) {
    const cuenta = async (sql) => (await db.query(sql, [id]).catch(() => ({ rows: [{ n: 0 }] }))).rows[0]?.n || 0;
    return {
        governorVisits: await cuenta(`SELECT COUNT(*)::int AS n FROM "GovernorVisit" WHERE "clubProfileId" = $1`),
        clubAccounts: await cuenta(`SELECT COUNT(*)::int AS n FROM "DistrictClubAccount" WHERE "clubProfileId" = $1`),
        directorySubmissions: await cuenta(`SELECT COUNT(*)::int AS n FROM "DistrictClubSubmission" WHERE "profileId" = $1`),
        sponsoredClubs: await cuenta(`SELECT COUNT(*)::int AS n FROM "DistrictClubProfile" WHERE "sponsorClubId" = $1`),
    };
}

// ─── Administración: escritura ───────────────────────────────────────

export const adminCreate = async (req, res) => {
    try {
        const scope = await requireScope(req);
        const club = await createClub(req.body || {}, { scope, actor: actorOf(req) });
        res.status(201).json({ club });
    } catch (e) { return fail(res, e); }
};

export const adminUpdate = async (req, res) => {
    try {
        const scope = await requireScope(req);
        const club = await updateClub(req.params.id, req.body || {}, { scope, actor: actorOf(req) });
        res.json({ club });
    } catch (e) { return fail(res, e); }
};

export const adminStatus = async (req, res) => {
    try {
        const scope = await requireScope(req);
        const status = String(req.body?.catalogStatus || '');
        if (!CATALOG_STATES[status]) return res.status(400).json({ error: 'Estado no válido.' });
        const club = await setClubStatus(req.params.id, status, { scope, actor: actorOf(req), reason: req.body?.reason });
        res.json({ club });
    } catch (e) { return fail(res, e); }
};

export const adminVerify = async (req, res) => {
    try {
        const scope = await requireScope(req);
        res.json({ club: await markVerified(req.params.id, { scope, actor: actorOf(req), reason: req.body?.reason }) });
    } catch (e) { return fail(res, e); }
};

export const adminMerge = async (req, res) => {
    try {
        const scope = await requireScope(req);
        const { duplicateId, keepId, reason } = req.body || {};
        if (!String(reason || '').trim()) return res.status(400).json({ error: 'Explica por qué son el mismo club (queda en la bitácora).' });
        res.json(await mergeClubs(duplicateId, keepId, { scope, actor: actorOf(req), reason }));
    } catch (e) { return fail(res, e); }
};

export const adminUnmerge = async (req, res) => {
    try {
        const scope = await requireScope(req);
        res.json({ club: await unmergeClub(req.params.id, { scope, actor: actorOf(req), reason: req.body?.reason }) });
    } catch (e) { return fail(res, e); }
};

export const adminDismissDuplicate = async (req, res) => {
    try {
        const scope = await requireScope(req);
        const { aId, bId, reason } = req.body || {};
        res.json(await dismissDuplicate(aId, bId, { scope, actor: actorOf(req), reason }));
    } catch (e) { return fail(res, e); }
};

export const adminImportPreview = async (req, res) => {
    try {
        const scope = await requireScope(req);
        const { rows, defaultDistrict, compare } = req.body || {};
        res.json(await previewImport(rows, { scope, defaultDistrict: Number(defaultDistrict) || null, compare: !!compare }));
    } catch (e) { return fail(res, e); }
};

export const adminImportCommit = async (req, res) => {
    try {
        const scope = await requireScope(req);
        const { rows, approved, defaultDistrict, sourceLabel } = req.body || {};
        res.json(await commitImport(rows, approved, {
            scope, actor: actorOf(req), defaultDistrict: Number(defaultDistrict) || null,
            sourceLabel: String(sourceLabel || 'importacion').slice(0, 120),
        }));
    } catch (e) { return fail(res, e); }
};

export const ensureSchema = async (req, res, next) => {
    try { await ensureClubCatalogSchema(); next(); } catch (e) { return fail(res, e); }
};

export default {
    publicClubs, publicDistricts, publicClub, adminList, adminDuplicates, adminChanges, adminDetail,
    adminCreate, adminUpdate, adminStatus, adminVerify, adminMerge, adminUnmerge, adminDismissDuplicate,
    adminImportPreview, adminImportCommit, ensureSchema, catalogScopeFor, catalogScopeDetail,
};
