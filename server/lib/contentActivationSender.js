// Sitio remitente de Campañas de Contenido (v4.1132).
// Club Platform orquesta; el SITIO es el remitente institucional.
// Reutiliza: DISTRICT_SITE_SQL+pickDistrictSite (districtSite.js),
// publicHostFor (submissionArticleEngine.js), canonicalDomain (domains.js).
// Sin hardcodear distritos, dominios, logos ni URLs.
import db from './db.js';
import { DISTRICT_SITE_SQL, districtSiteParams, pickDistrictSite } from './districtSite.js';
import { publicHostFor } from './submissionArticleEngine.js';
import { canonicalDomain } from './domains.js';

// senderRef: { kind: 'club'|'district', id } — el Club sitio o el District.
// Se guarda como `senderSiteId`: id de Club, o `district:<uuid>` cuando el
// distrito aún no tiene fila de sitio.
export function parseSenderRef(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  if (s.startsWith('district:')) {
    const id = s.slice(9);
    return id ? { kind: 'district', id } : null;
  }
  return { kind: 'club', id: s };
}

export function serializeSenderRef(ref) {
  if (!ref?.id) return null;
  return ref.kind === 'district' ? `district:${ref.id}` : ref.id;
}

// Sitio remitente automático desde el ámbito (sin intervención del admin).
// Distrito → sitio del distrito (o el District si no hay fila de sitio).
// Club/Sitio → ese club. Evento/Feria → club propietario. Formulario → null
// (lo decide el remitente global).
export async function deriveSenderFromScope(scopeDef) {
  const scope = scopeDef || {};
  try {
    if (scope.type === 'district' && scope.ids?.length) {
      const { rows: d } = await db.query(`SELECT * FROM "District" WHERE id=$1 LIMIT 1`, [scope.ids[0]]);
      if (d[0]) {
        const cands = await db.query(DISTRICT_SITE_SQL, districtSiteParams(d[0])).catch(() => ({ rows: [] }));
        const site = pickDistrictSite(d[0], cands.rows || []);
        if (site) return { kind: 'club', id: site.id };
        return { kind: 'district', id: d[0].id };
      }
    }
    if ((scope.type === 'club' || scope.type === 'site') && scope.ids?.length) {
      return { kind: 'club', id: scope.ids[0] };
    }
    if ((scope.type === 'event') && scope.ids?.length) {
      const { rows } = await db.query(`SELECT "clubId" FROM "CalendarEvent" WHERE id=$1 LIMIT 1`, [scope.ids[0]]).catch(() => ({ rows: [] }));
      if (rows[0]?.clubId) return { kind: 'club', id: rows[0].clubId };
    }
    if (scope.type === 'project_fair' && scope.ids?.length) {
      return { kind: 'club', id: scope.ids[0] };
    }
  } catch { /* sin tabla: sin remitente */ }
  return null;
}

// Remitente automático desde el permiso del usuario (crear desde un sitio).
// district_admin → sitio de su distrito; club → su club.
export async function deriveSenderFromGrant(grant) {
  if (!grant || grant.isGlobal) return null;
  try {
    if (grant.districtIds?.length) {
      const { rows: d } = await db.query(`SELECT * FROM "District" WHERE id=$1 LIMIT 1`, [grant.districtIds[0]]);
      if (d[0]) {
        const cands = await db.query(DISTRICT_SITE_SQL, districtSiteParams(d[0])).catch(() => ({ rows: [] }));
        const site = pickDistrictSite(d[0], cands.rows || []);
        if (site) return { kind: 'club', id: site.id };
        return { kind: 'district', id: d[0].id };
      }
    }
    if (grant.clubIds?.length) return { kind: 'club', id: grant.clubIds[0] };
  } catch { /* noop */ }
  return null;
}

// Contexto institucional del remitente: nombre, logo, colores, contacto,
// dominio público. Nada se duplica en la campaña: se lee del sitio.
export async function loadSenderContext(senderRef) {
  const empty = { ref: senderRef || null, siteName: '', logoUrl: '', primaryColor: '', ctaColor: '', contactEmail: '', host: '', siteId: null, districtName: '' };
  if (!senderRef?.id) return empty;
  try {
    if (senderRef.kind === 'district') {
      const { rows } = await db.query(`SELECT * FROM "District" WHERE id=$1 LIMIT 1`, [senderRef.id]);
      const d = rows[0];
      if (!d) return empty;
      const colors = d.colors && typeof d.colors === 'object' ? d.colors : {};
      const cands = await db.query(DISTRICT_SITE_SQL, districtSiteParams(d)).catch(() => ({ rows: [] }));
      const site = pickDistrictSite(d, cands.rows || []);
      let host = '';
      let contactEmail = '';
      let logoUrl = d.logo || '';
      if (site) {
        host = await publicHostFor({ ...site, districtId: d.id, district: String(d.number ?? '') }).catch(() => '');
        const st = await db.query(`SELECT key, value FROM "Setting" WHERE "clubId"=$1 AND key IN ('contact_email','color_primary','color_secondary')`, [site.id]).catch(() => ({ rows: [] }));
        const map = Object.fromEntries((st.rows || []).map((r) => [r.key, r.value]));
        contactEmail = map.contact_email || '';
        if (!logoUrl) {
          const crow = await db.query(`SELECT logo FROM "Club" WHERE id=$1 LIMIT 1`, [site.id]).catch(() => ({ rows: [] }));
          logoUrl = crow.rows[0]?.logo || '';
        }
        var siteName = site.name || d.name || '';
        var primary = map.color_primary || colors.primary || '';
        var cta = map.color_secondary || colors.secondary || '';
      } else {
        host = canonicalDomain(d.domain) || (d.subdomain ? `${d.subdomain}.clubplatform.org` : '');
        var siteName = d.name || '';
        var primary = colors.primary || '';
        var cta = colors.secondary || '';
      }
      return {
        ref: senderRef, siteName, logoUrl, primaryColor: primary, ctaColor: cta,
        contactEmail, host, siteId: site?.id || null, districtName: d.name || '',
      };
    }
    const { rows } = await db.query(`SELECT * FROM "Club" WHERE id=$1 LIMIT 1`, [senderRef.id]);
    const c = rows[0];
    if (!c) return empty;
    const st = await db.query(`SELECT key, value FROM "Setting" WHERE "clubId"=$1 AND key IN ('contact_email','color_primary','color_secondary')`, [c.id]).catch(() => ({ rows: [] }));
    const map = Object.fromEntries((st.rows || []).map((r) => [r.key, r.value]));
    let districtName = '';
    let dColors = {};
    if (c.districtId) {
      const { rows: dr } = await db.query(`SELECT name, colors FROM "District" WHERE id=$1 LIMIT 1`, [c.districtId]).catch(() => ({ rows: [] }));
      districtName = dr[0]?.name || '';
      dColors = dr[0]?.colors && typeof dr[0].colors === 'object' ? dr[0].colors : {};
    }
    const host = await publicHostFor(c).catch(() => '');
    return {
      ref: senderRef,
      siteName: c.name || '',
      logoUrl: c.logo || '',
      primaryColor: map.color_primary || dColors.primary || '',
      ctaColor: map.color_secondary || dColors.secondary || '',
      contactEmail: map.contact_email || '',
      host, siteId: c.id, districtName,
    };
  } catch { return empty; }
}

// URL pública canónica: dominio del sitio + ruta. Nunca app.clubplatform.org
// si el sitio tiene dominio público válido. Reutilizable para eventos,
// noticias, proyectos, formularios y landing pages.
export function publicSiteUrl(host, path = '/') {
  const h = canonicalDomain(host);
  const p = String(path || '/');
  const full = p.startsWith('/') ? p : `/${p}`;
  if (h) return `https://${h}${full}`;
  return `https://app.clubplatform.org${full}`;
}

export async function resolvePublicSiteUrl(senderRef, path = '/') {
  const ctx = await loadSenderContext(senderRef).catch(() => null);
  return publicSiteUrl(ctx?.host || '', path);
}
