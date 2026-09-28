// Audiencia de activación: reutiliza CrmContact como única fuente + señales de
// contenido (solicitudes/publicaciones) sin duplicar contactos.
import db from './db.js';
import { ensureContentActivationSchema } from './ensureContentActivationSchema.js';
import { ensureAutomationSchema } from './ensureAutomationSchema.js';

// Reglas soportadas además de las de crmSegments (district, orgRole, tags...):
// has_sent (bool), has_published (bool), site_active (bool), pending_count (n),
// days_since_participation (n), inactivo (bool), cargo/president|secretary...
export async function previewAudience(clubId, audienceDef = {}, opts = {}) {
  await ensureContentActivationSchema().catch(() => {});
  await ensureAutomationSchema().catch(() => {});
  const rules = Array.isArray(audienceDef.rules) ? audienceDef.rules : [];
  const params = [];
  const conds = [`(c."archivedAt" IS NULL)`, `(c.status NOT IN ('unsubscribed','blocked'))`];
  if (clubId) { params.push(clubId); conds.push(`c."clubId"=$${params.length}`); }

  const push = (sql, val) => { params.push(val); return sql.replace('$#', `$${params.length}`); };

  for (const r of rules) {
    const f = String(r.field || '');
    const op = String(r.op || 'eq');
    const v = r.value;
    if (f === 'district' && v) {
      if (op === 'eq') conds.push(push(`c.district ILIKE $#`, `%${v}%`));
      else if (op === 'neq') conds.push(push(`c.district NOT ILIKE $#`, `%${v}%`));
    } else if (f === 'orgRole' && v) {
      conds.push(Array.isArray(v) ? push(`c."orgRole" = ANY($#)`, v) : push(`c."orgRole" = $#`, String(v)));
    } else if (f === 'siteId' && v) {
      conds.push(Array.isArray(v) ? push(`c."siteId" = ANY($#)`, v) : push(`c."siteId" = $#`, String(v)));
    } else if (f === 'cargo' && v) {
      const map = { presidente: 'president', secretario: 'secretary' };
      const k = map[String(v).toLowerCase()] || v;
      conds.push(push(`c."orgRole" = $#`, k));
    } else if (f === 'tags' && v) {
      conds.push(push(`c.tags && $#`, Array.isArray(v) ? v : [String(v)]));
    }
    // El resto (has_sent, has_published, site_active...) se filtra en memoria
    // tras el prefetch, porque combina varias tablas de contenido.
  }

  const { rows: contacts } = await db.query(
    `SELECT c.id, c.name, c."lastName", c.email, c.phone, c."orgRole", c.district,
            c."siteId", c."siteType", c.status, c."consentState", c."optedOutAt",
            (c.email IS NOT NULL AND c.email <> '') AS "hasEmail",
            (c.phone IS NOT NULL AND c.phone <> '') AS "hasPhone"
     FROM "WhatsAppContact" c WHERE ${conds.join(' AND ')}
     ORDER BY c."updatedAt" DESC LIMIT ${opts.limit || 2000}`,
    params
  ).catch(() => ({ rows: [] }));

  // Señales de contenido por siteId/contacto.
  const siteIds = [...new Set(contacts.map((c) => c.siteId).filter(Boolean))];
  const bySite = {};
  if (siteIds.length) {
    try {
      const { rows } = await db.query(
        `SELECT COALESCE(s."club", '') AS club, s."campaignId",
                COUNT(*)::int AS n,
                COUNT(CASE WHEN s.status='publicado' THEN 1 END)::int AS pub,
                COUNT(CASE WHEN s.status IN ('recibido','en_revision','requiere_info') THEN 1 END)::int AS pending,
                MAX(s."createdAt") AS lastAt
         FROM "ContributionSubmission" s GROUP BY 1,2 LIMIT 5000`);
      for (const r of rows) {
        const k = String(r.club || '').toLowerCase();
        bySite[k] = r;
      }
    } catch { /* sin tabla aún */ }
  }
  const { rows: profiles } = siteIds.length
    ? await db.query(`SELECT * FROM "ClubParticipationProfile" WHERE "siteId"=ANY($1)`, [siteIds]).catch(() => ({ rows: [] }))
    : { rows: [] };
  const profBySite = Object.fromEntries((profiles || []).map((p) => [p.siteId, p]));

  const contentRules = rules.filter((r) => ['has_sent', 'has_published', 'site_active', 'pending', 'days_since', 'inactivo', 'participation_level'].includes(r.field));
  const out = [];
  let excluidos = 0, yaParticiparon = 0, sinCanal = 0;
  for (const c of contacts) {
    if (c.optedOutAt || c.consentState === 'denied') { excluidos++; continue; }
    const hasWA = !!c.hasPhone;
    const hasMail = !!c.hasEmail;
    if (!hasWA && !hasMail) { sinCanal++; continue; }
    const prof = c.siteId ? profBySite[c.siteId] : null;
    const sent = (prof?.submissionCount || 0) > 0;
    const pub = (prof?.articlesPublished || 0) > 0;
    let ok = true;
    for (const r of contentRules) {
      if (r.field === 'has_sent' && !!sent !== !!r.value) ok = false;
      if (r.field === 'has_published' && !!pub !== !!r.value) ok = false;
      if (r.field === 'pending' && !((prof?.submissionCount || 0) >= 0)) ok = false;
      if (r.field === 'participation_level' && prof && prof.level !== r.value) ok = false;
    }
    if (!ok) continue;
    if (sent) yaParticiparon++;
    out.push({
      contactId: c.id, name: [c.name, c.lastName].filter(Boolean).join(' '),
      email: c.email, phone: c.phone, orgRole: c.orgRole, district: c.district,
      siteId: c.siteId, siteType: c.siteType || 'club',
      channel: hasWA && hasMail ? 'ambos' : hasWA ? 'whatsapp' : 'email',
      profile: prof || null,
    });
  }
  const whatsapp = out.filter((x) => x.channel === 'whatsapp' || x.channel === 'ambos').length;
  const email = out.filter((x) => x.channel === 'email' || x.channel === 'ambos').length;
  return {
    estimada: out.length, whatsapp, email, excluidos, yaParticiparon,
    sinCanal, contactos: out.slice(0, opts.previewSize || 500),
  };
}
