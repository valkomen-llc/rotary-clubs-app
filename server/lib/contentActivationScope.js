// Ámbito de campaña (v4.1130): separa Campaña / Ámbito / Audiencia / Destinatarios.
// Sin FK, sin Prisma: SQL parametrizado sobre tablas existentes.
// Tipos extensibles: el catálogo SCOPE_TYPES admite nuevos sin migrar.
import db from './db.js';

export const SCOPE_TYPES = [
  { id: 'global', label: 'Global / Club Platform' },
  { id: 'district', label: 'Distrito' },
  { id: 'club', label: 'Club' },
  { id: 'site', label: 'Sitio' },
  { id: 'event', label: 'Evento' },
  { id: 'project_fair', label: 'Feria de Proyectos' },
  { id: 'campaign_form', label: 'Campaña / Formulario' },
];
export const SCOPE_TYPE_IDS = SCOPE_TYPES.map((s) => s.id);

export function normalizeScopeDef(raw = {}) {
  const type = SCOPE_TYPE_IDS.includes(raw.type) ? raw.type : 'district';
  const ids = Array.isArray(raw.ids) ? raw.ids.map(String).filter(Boolean).slice(0, 100) : [];
  return { type, ids, label: String(raw.label || '').slice(0, 200) };
}

// Grant del usuario según jerarquía Club Platform.
// administrator/superadmin → global. district_admin → su distrito + clubes.
// club_admin/editor/member/crm_agent → su club. Sin club ni distrito → nada.
export async function getUserGrant(req) {
  const role = req.user?.role || '';
  const userId = req.user?.id || null;
  const isGlobal = ['administrator', 'superadmin'].includes(role);
  if (isGlobal) return { role, isGlobal: true, districtIds: [], clubIds: [], districtId: null, clubId: null };
  let districtId = req.user?.districtId || null;
  let clubId = req.user?.clubId || req.headers['x-club-id'] || null;
  // Hidratar desde DB si el token no trae el alcance.
  if (userId && (!districtId || !clubId)) {
    try {
      const { rows } = await db.query(`SELECT "districtId","clubId",role FROM "User" WHERE id=$1 LIMIT 1`, [userId]);
      if (rows[0]) {
        districtId = districtId || rows[0].districtId || null;
        clubId = clubId || rows[0].clubId || null;
      }
    } catch { /* sin tabla en tests */ }
  }
  let clubIds = [];
  let districtIds = [];
  if (role === 'district_admin' && districtId) {
    districtIds = [districtId];
    try {
      const { rows } = await db.query(`SELECT id FROM "Club" WHERE "districtId"=$1 LIMIT 500`, [districtId]);
      clubIds = rows.map((r) => r.id);
    } catch { /* noop */ }
  } else if (clubId) {
    clubIds = [clubId];
    if (districtId) districtIds = [districtId];
    else {
      try {
        const { rows } = await db.query(`SELECT "districtId" FROM "Club" WHERE id=$1 LIMIT 1`, [clubId]);
        if (rows[0]?.districtId) districtIds = [rows[0].districtId];
      } catch { /* noop */ }
    }
  } else if (districtId) {
    districtIds = [districtId];
  }
  return { role, isGlobal: false, districtId, clubId, districtIds, clubIds };
}

// Valida que el ámbito pedido esté dentro del permiso. Lanza Error con status.
export async function assertScopeAllowed(req, scopeDef) {
  const scope = normalizeScopeDef(scopeDef);
  const grant = await getUserGrant(req);
  if (grant.isGlobal) return { scope, grant };
  const err = (msg) => {
    const e = new Error(msg);
    e.status = 403;
    throw e;
  };
  if (scope.type === 'global') err('Tu rol no puede crear campañas de ámbito global.');
  if (!scope.ids.length) return { scope, grant };
  if (scope.type === 'district') {
    const allowed = new Set(grant.districtIds);
    for (const id of scope.ids) if (!allowed.has(id)) err('Distrito fuera de tus permisos.');
    return { scope, grant };
  }
  if (scope.type === 'club' || scope.type === 'site') {
    const allowed = new Set(grant.clubIds);
    // Un district_admin puede elegir cualquiera de sus clubes (ya expandidos).
    for (const id of scope.ids) if (!allowed.has(id)) err('Club/sitio fuera de tus permisos.');
    return { scope, grant };
  }
  // event / project_fair / campaign_form: validar pertenencia por club propietario.
  if (scope.type === 'event') {
    try {
      const { rows } = await db.query(`SELECT id,"clubId" FROM "CalendarEvent" WHERE id=ANY($1)`, [scope.ids]);
      const allowed = new Set(grant.clubIds);
      if (!rows.length) err('Evento no encontrado o fuera de tus permisos.');
      for (const r of rows) {
        if (r.clubId && !allowed.has(r.clubId) && !grant.districtIds.length) err('Evento fuera de tus permisos.');
        // district_admin: el evento debe pertenecer a un club de su distrito.
        if (r.clubId && grant.districtIds.length && !allowed.has(r.clubId)) err('Evento fuera de tu distrito.');
      }
    } catch (e) {
      if (e.status === 403) throw e;
    }
    return { scope, grant };
  }
  // project_fair y campaign_form son catálogos globales de lectura para admins
  // de sitio; la escritura se limita a global/district según ids. Por ahora se
  // permite seleccionar cualquier entidad visible del catálogo (ya filtrado).
  return { scope, grant };
}

// Catálogo de entidades por tipo, ya filtrado por permiso (frontend nunca decide).
export async function listScopeEntities(req, type, search = '', limit = 100) {
  const grant = await getUserGrant(req);
  const q = `%${String(search || '').slice(0, 80)}%`;
  const lim = Math.min(Number(limit) || 100, 200);
  if (type === 'district') {
    if (grant.isGlobal) {
      const { rows } = await db.query(
        `SELECT d.id, d.number, d.name FROM "District" d WHERE ($1='' OR d.name ILIKE $2 OR CAST(d.number AS TEXT) ILIKE $2) ORDER BY d.number ASC LIMIT $3`,
        [String(search || ''), q, lim]).catch(() => ({ rows: [] }));
      return rows.map((r) => ({ id: r.id, name: r.name || `Distrito ${r.number}`, detail: r.number != null ? `Distrito ${r.number}` : '' }));
    }
    if (!grant.districtIds.length) return [];
    const { rows } = await db.query(`SELECT id, number, name FROM "District" WHERE id=ANY($1)`, [grant.districtIds]).catch(() => ({ rows: [] }));
    return rows.map((r) => ({ id: r.id, name: r.name || `Distrito ${r.number}`, detail: r.number != null ? `Distrito ${r.number}` : '' }));
  }
  if (type === 'club' || type === 'site') {
    if (grant.isGlobal) {
      const { rows } = await db.query(
        `SELECT id, name, city, district, "districtId" FROM "Club" WHERE ($1='' OR name ILIKE $2 OR city ILIKE $2) ORDER BY name ASC LIMIT $3`,
        [String(search || ''), q, lim]).catch(() => ({ rows: [] }));
      return rows.map((r) => ({ id: r.id, name: r.name, detail: [r.city, r.district].filter(Boolean).join(' · ') }));
    }
    if (!grant.clubIds.length) return [];
    const { rows } = await db.query(`SELECT id, name, city, district FROM "Club" WHERE id=ANY($1)`, [grant.clubIds]).catch(() => ({ rows: [] }));
    return rows.map((r) => ({ id: r.id, name: r.name, detail: [r.city, r.district].filter(Boolean).join(' · ') }));
  }
  if (type === 'event') {
    let rows = [];
    if (grant.isGlobal) {
      const r = await db.query(
        `SELECT id, title, "startDate", location FROM "CalendarEvent" WHERE ($1='' OR title ILIKE $2) ORDER BY "startDate" DESC LIMIT $3`,
        [String(search || ''), q, lim]).catch(() => ({ rows: [] }));
      rows = r.rows;
    } else if (grant.clubIds.length) {
      const r = await db.query(
        `SELECT id, title, "startDate", location FROM "CalendarEvent" WHERE "clubId"=ANY($1) AND ($2='' OR title ILIKE $3) ORDER BY "startDate" DESC LIMIT $4`,
        [grant.clubIds, String(search || ''), q, lim]).catch(() => ({ rows: [] }));
      rows = r.rows;
    }
    return rows.map((r) => ({ id: r.id, name: r.title, detail: [r.location, r.startDate ? new Date(r.startDate).toLocaleDateString('es-CO') : ''].filter(Boolean).join(' · ') }));
  }
  if (type === 'project_fair') {
    const r = await db.query(
      `SELECT id, name, city FROM "Club" WHERE category='project_fair' AND ($1='' OR name ILIKE $2) ORDER BY name ASC LIMIT $3`,
      [String(search || ''), q, lim]).catch(() => ({ rows: [] }));
    let rows = r.rows || [];
    if (!grant.isGlobal && grant.clubIds.length) rows = rows.filter((x) => grant.clubIds.includes(x.id));
    if (!grant.isGlobal && !grant.clubIds.length && grant.districtIds.length) {
      const c = await db.query(`SELECT id FROM "Club" WHERE "districtId"=ANY($1)`, [grant.districtIds]).catch(() => ({ rows: [] }));
      const allowed = new Set((c.rows || []).map((x) => x.id));
      rows = rows.filter((x) => allowed.has(x.id));
    }
    return rows.map((x) => ({ id: x.id, name: x.name, detail: x.city || '' }));
  }
  if (type === 'campaign_form') {
    const r = await db.query(
      `SELECT id, slug, name FROM "ContributionCampaign" WHERE ($1='' OR name ILIKE $2 OR slug ILIKE $2) ORDER BY "createdAt" DESC LIMIT $3`,
      [String(search || ''), q, lim]).catch(() => ({ rows: [] }));
    return (r.rows || []).map((x) => ({ id: x.id, name: x.name || x.slug, detail: x.slug || '' }));
  }
  return [];
}

// Expande un ámbito a filtros concretos para el resolver de audiencia:
// districtIds, districtNumbers (para c.district ILIKE), clubIds/siteIds.
export async function expandScope(scopeDef) {
  const scope = normalizeScopeDef(scopeDef);
  if (scope.type === 'global' || !scope.ids.length) return { scope, clubIds: [], districtIds: scope.ids, districtNumbers: [], siteIds: [] };
  if (scope.type === 'district') {
    let numbers = [];
    let clubIds = [];
    try {
      const { rows } = await db.query(`SELECT id, number FROM "District" WHERE id=ANY($1)`, [scope.ids]);
      numbers = rows.map((r) => String(r.number)).filter(Boolean);
      const c = await db.query(`SELECT id FROM "Club" WHERE "districtId"=ANY($1) LIMIT 2000`, [scope.ids]);
      clubIds = (c.rows || []).map((r) => r.id);
    } catch { /* tablas ausentes en tests */ }
    return { scope, clubIds, districtIds: scope.ids, districtNumbers: numbers, siteIds: clubIds };
  }
  if (scope.type === 'club' || scope.type === 'site') {
    return { scope, clubIds: scope.ids, districtIds: [], districtNumbers: [], siteIds: scope.ids };
  }
  if (scope.type === 'event') {
    // Participantes del evento vía EventRegistration + clubes propietarios.
    let clubIds = [];
    try {
      const { rows } = await db.query(`SELECT DISTINCT "clubId" FROM "CalendarEvent" WHERE id=ANY($1)`, [scope.ids]);
      clubIds = rows.map((r) => r.clubId).filter(Boolean);
    } catch { /* noop */ }
    return { scope, clubIds, districtIds: [], districtNumbers: [], siteIds: [], eventIds: scope.ids };
  }
  if (scope.type === 'project_fair') {
    return { scope, clubIds: scope.ids, districtIds: [], districtNumbers: [], siteIds: scope.ids, fairIds: scope.ids };
  }
  return { scope, clubIds: [], districtIds: [], districtNumbers: [], siteIds: [], formIds: scope.ids };
}
