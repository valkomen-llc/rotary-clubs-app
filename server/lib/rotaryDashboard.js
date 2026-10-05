// Analítica de Rotary en Acción (v4.1124): KPIs, serie temporal, participación
// por club, sin reportar, distribución por tipo e impacto reportado.
//
// REGLAS:
// - El alcance lo decide `campaignIdsInScope` (el mismo de la bandeja): null
//   = operador = todo; array = solo esas campañas. Segunda puerta distinta
//   dejaría ver cifras de campañas que la bandeja no abre.
// - No operador queda FIJO a su distrito (derivado de su Club). El distrito
//   que mande el frontend se ignora si no es el suyo: el filtro no puede
//   ensanchar lo que la sesión alcanza.
// - Universo de clubes = DISTRICT_CATALOG (única lista, v4.707), nunca un
//   número escrito a mano. «Sin reportar» = sin envíos en el período, no un
//   juicio sobre la actividad del club.
// - Impacto: NULL ≠ 0. Solo se suma lo reportado y se cuenta quién reportó.
import db from './db.js';
import { DISTRICT_CATALOG, districtNumberOf } from './rotaryClubs.js';
import { ensureRotaryEnAccionSchema } from './ensureRotaryEnAccionSchema.js';

export const normClub = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/^(club rotario|rotary club|club rotaract|rotaract club|club interact|interact club|club)\s+/, '')
  .replace(/[^a-z0-9ñ ]/g, ' ').replace(/\s+/g, ' ').trim();
const norm = normClub;

// Catálogo normalizado: llave → { district, name }.
const CATALOGO = (() => {
  const m = new Map();
  for (const d of DISTRICT_CATALOG) {
    for (const name of d.clubs || []) {
      const k = norm(name);
      if (k && !m.has(k)) m.set(k, { district: d.value, name });
    }
  }
  return m;
})();

export function universe(district) {
  const ds = district ? DISTRICT_CATALOG.filter((d) => d.value === String(district)) : DISTRICT_CATALOG;
  const out = [];
  for (const d of ds) for (const name of d.clubs || []) out.push({ district: d.value, name, key: norm(name) });
  return out;
}

export async function resolveScope(req, campaignIdsInScope) {
  await ensureRotaryEnAccionSchema().catch(() => {});
  const role = String(req.user?.role || '');
  // Operador global (v4.1162): `superadmin`/`isSuperAdmin` sin depender de
  // club asignado; el resto conserva la regla (administrador sin club).
  if (role === 'superadmin' || req.user?.isSuperAdmin === true
    || ((role === 'administrator' || role === 'superadmin') && !req.user?.clubId)) {
    return { isOperator: true, clubId: null, district: null, campaigns: null };
  }
  const clubId = req.user?.clubId || null;
  let district = null;
  if (clubId) {
    try {
      const { rows } = await db.query(
        `SELECT c.district, d.number AS "dnum" FROM "Club" c LEFT JOIN "District" d ON d.id = c."districtId" WHERE c.id = $1`,
        [clubId]);
      const c = rows[0];
      district = c?.dnum ? String(c.dnum) : (districtNumberOf(c?.district) ? String(districtNumberOf(c.district)) : null);
    } catch { /* sin distrito: el alcance lo dan las campañas */ }
  }
  return { isOperator: false, clubId, district, campaigns: campaignIdsInScope };
}

const sameDay = (d) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };

export async function dashboard(scope, f = {}) {
  await ensureRotaryEnAccionSchema().catch(() => {});
  // Distrito efectivo: el operador puede pedir uno (validado contra catálogo);
  // el resto queda fijo al suyo.
  let district = null;
  if (scope.isOperator) {
    if (f.district && DISTRICT_CATALOG.some((d) => d.value === String(f.district))) district = String(f.district);
  } else {
    district = scope.district;
  }
  const now = new Date();
  const to = f.to ? sameDay(f.to) : now;
  const from = f.from ? new Date(f.from) : new Date(now.getTime() - 90 * 86400000);
  const clubQ = String(f.club || '').trim().toLowerCase();
  const tipoQ = String(f.contentType || '').trim().toLowerCase();
  const statusQ = String(f.status || '').trim();

  const params = [from.toISOString(), to.toISOString()];
  const conds = [`s."createdAt" >= $1`, `s."createdAt" <= $2`];
  if (scope.campaigns !== null) {
    if (!scope.campaigns.length) return emptyResult(district, { from, to });
    params.push(scope.campaigns.map(String));
    conds.push(`s."campaignId" = ANY($${params.length}::text[])`);
  }
  if (statusQ) { params.push(statusQ); conds.push(`s.status = $${params.length}`); }
  if (tipoQ) { params.push(tipoQ); conds.push(`s."contentType" = $${params.length}`); }

  const { rows: subs } = await db.query(
    `SELECT s.id, s."campaignId", s.status, s."senderName", s.club, s.district, s.city,
            s.title, s."contentType", s.program, s.impact, s."createdAt",
            c.name AS "campaignName", c.slug AS "campaignSlug",
            (SELECT COUNT(*)::int FROM "ContributionSubmissionFile" x WHERE x."submissionId"=s.id) AS "fileCount",
            (SELECT string_agg(DISTINCT cc."clubName", ' | ') FROM "ContributionSubmissionClub" cc WHERE cc."submissionId"=s.id) AS "clubNames"
     FROM "ContributionSubmission" s LEFT JOIN "ContributionCampaign" c ON c.id=s."campaignId"
     WHERE ${conds.join(' AND ')} ORDER BY s."createdAt" DESC LIMIT 5000`, params);

  // Normalización club/distrito por fila (históricos en texto libre incluidos).
  const porClub = new Map(); // key -> { name, district, city, aportes, publicados, enRevision, ultimo }
  const vistos = { total: 0 };
  for (const s of subs) {
    const candidatos = [s.club, ...(s.clubNames ? s.clubNames.split(' | ') : [])].map(norm).filter(Boolean);
    let hit = null;
    for (const k of candidatos) if (CATALOGO.has(k)) { hit = CATALOGO.get(k); break; }
    const dNum = districtNumberOf(s.district);
    const districtRow = hit ? hit.district : (dNum ? String(dNum) : 'otro');
    if (district && districtRow !== district) continue;
    const key = hit ? `${hit.district}::${hit.name}` : `~${(candidatos[0] || 'sin club')}`;
    if (clubQ && !key.toLowerCase().includes(clubQ) && !(s.club || '').toLowerCase().includes(clubQ)) continue;
    let e = porClub.get(key);
    if (!e) {
      e = { key, name: hit ? hit.name : (s.club || 'Sin club identificado'), district: districtRow, cities: {}, aportes: 0, publicados: 0, enRevision: 0, ultimo: null };
      porClub.set(key, e);
    }
    e.aportes++;
    if (s.status === 'publicado') e.publicados++;
    if (['recibido', 'en_revision', 'requiere_info'].includes(s.status)) e.enRevision++;
    if (!e.ultimo || new Date(s.createdAt) > new Date(e.ultimo)) e.ultimo = s.createdAt;
    if (s.city) e.cities[s.city] = (e.cities[s.city] || 0) + 1;
    s._clubKey = key;
    s._district = districtRow;
    vistos.total++;
  }
  const filas = subs.filter((s) => s._clubKey);

  const uni = universe(district);
  const participantes = [...porClub.values()].filter((e) => !e.key.startsWith('~'));
  const keysPart = new Set(participantes.map((e) => e.key));
  const sinReportar = uni.filter((u) => !keysPart.has(`${u.district}::${u.name}`)).map((u) => {
    return { ...u, ultimo: null, dias: null, estado: 'nunca' };
  });
  // Último aporte histórico (fuera del período) para distinguir inactivos.
  if (sinReportar.length) {
    try {
      const names = sinReportar.map((u) => u.name);
      const { rows: hist } = await db.query(
        `SELECT club, MAX("createdAt") AS ultimo FROM "ContributionSubmission" WHERE club = ANY($1::text[]) GROUP BY club`,
        [names]);
      const hm = new Map(hist.map((h) => [norm(h.club), h.ultimo]));
      for (const u of sinReportar) {
        const h = hm.get(u.key);
        if (h) {
          u.ultimo = h;
          u.dias = Math.max(0, Math.round((now.getTime() - new Date(h).getTime()) / 86400000));
          u.estado = 'inactivo';
        }
      }
    } catch { /* sin histórico: todos quedan como nunca */ }
  }

  const pct = uni.length ? +(100 * participantes.length / uni.length).toFixed(1) : 0;
  const publicadas = filas.filter((s) => s.status === 'publicado').length;

  // Serie temporal.
  const gran = f.gran || ((to - from) / 86400000 <= 62 ? 'semana' : (to - from) / 86400000 <= 400 ? 'mes' : 'trimestre');
  const buckets = new Map();
  const keyOf = (d) => {
    const x = new Date(d);
    if (gran === 'semana') { const m = new Date(x); m.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return m.toISOString().slice(0, 10); }
    if (gran === 'mes') return x.toISOString().slice(0, 7);
    if (gran === 'ano') return String(x.getFullYear());
    return `${x.getFullYear()}-T${Math.floor(x.getMonth() / 3) + 1}`;
  };
  for (const s of filas) { const k = keyOf(s.createdAt); buckets.set(k, (buckets.get(k) || 0) + 1); }
  const serie = [...buckets.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([k, n]) => ({ k, n }));

  // Distribución por tipo.
  const tipoCount = new Map();
  for (const s of filas) tipoCount.set(s.contentType || 'sin_clasificar', (tipoCount.get(s.contentType || 'sin_clasificar') || 0) + 1);
  const porTipo = [...tipoCount.entries()].map(([k, n]) => ({ k, n, pct: filas.length ? +(100 * n / filas.length).toFixed(1) : 0 }))
    .sort((a, b) => b.n - a.n);

  // Impacto: solo reportado. 0 ≠ no reportado.
  const agg = {};
  const rep = {};
  for (const s of filas) {
    let imp = s.impact;
    if (typeof imp === 'string') { try { imp = JSON.parse(imp); } catch { imp = null; } }
    if (!imp || typeof imp !== 'object') continue;
    for (const [k, v] of Object.entries(imp)) {
      if (typeof v !== 'number' || !Number.isFinite(v)) continue;
      agg[k] = (agg[k] || 0) + v;
      rep[k] = (rep[k] || 0) + 1;
    }
  }
  const impacto = Object.entries(agg).map(([k, v]) => ({ k, total: Math.round(v * 100) / 100, reportes: rep[k] || 0 }))
    .sort((a, b) => b.reportes - a.reportes);

  const ranking = [...porClub.values()].sort((a, b) => b.aportes - a.aportes).slice(0, 30)
    .map((e) => ({ ...e, ciudad: Object.entries(e.cities).sort((a, b) => b[1] - a[1])[0]?.[0] || null, cities: undefined }));

  // Macro global: por distrito, con normalizadas.
  let macro = null;
  if (scope.isOperator && !district) {
    const porD = new Map();
    for (const u of universe(null)) if (!porD.has(u.district)) porD.set(u.district, { district: u.district, universo: 0, participantes: 0, aportes: 0, publicados: 0 });
    for (const [, v] of porD) v.universo = universe(v.district).length;
    for (const e of participantes) { const d = porD.get(e.district); if (d) { d.participantes++; d.aportes += e.aportes; d.publicados += e.publicados; } }
    macro = [...porD.values()].map((d) => ({
      ...d,
      pct: d.universo ? +(100 * d.participantes / d.universo).toFixed(1) : 0,
      porClub: d.participantes ? +(d.aportes / d.participantes).toFixed(1) : 0,
    }));
  }

  return {
    periodo: { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10), gran },
    alcance: scope.isOperator ? (district ? `distrito:${district}` : 'global') : `distrito:${district || 'propio'}`,
    kpis: {
      solicitudes: filas.length, clubes: participantes.length, universo: uni.length, pct,
      sinReportar: sinReportar.length, publicadas,
    },
    serie, porTipo, ranking,
    sinReportar: sinReportar.slice(0, 100),
    impacto, macro,
    filtros: { district, club: clubQ, contentType: tipoQ, status: statusQ },
  };
}

function emptyResult(district, periodo) {
  return {
    periodo: { from: '', to: '', gran: 'mes' }, alcance: 'vacio',
    kpis: { solicitudes: 0, clubes: 0, universo: universe(district).length, pct: 0, sinReportar: universe(district).length, publicadas: 0 },
    serie: [], porTipo: [], ranking: [], sinReportar: [], impacto: [], macro: null, filtros: {},
  };
}
