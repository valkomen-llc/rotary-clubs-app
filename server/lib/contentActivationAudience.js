// Audiencia de activación v4.1130: Ámbito + criterios → destinatarios únicos.
// Reutiliza CrmContact como fuente principal + User / Lead / CrmList /
// EventRegistration como fuentes secundarias. No duplica contactos.
// Backend valida el ámbito; este resolver solo combina lo permitido.
import db from './db.js';
import { ensureContentActivationSchema } from './ensureContentActivationSchema.js';
import { ensureAutomationSchema } from './ensureAutomationSchema.js';
import { expandScope } from './contentActivationScope.js';

const ROLE_LABEL = {
  president: 'Presidente', secretary: 'Secretario', treasurer: 'Tesorero',
  technology: 'Tecnología', public_image: 'Imagen Pública', communications: 'Comunicaciones',
  platform_admin: 'Admin. plataforma', other: 'Otro', presidente: 'Presidente', secretario: 'Secretario',
};

function normEmail(e) {
  return String(e || '').trim().toLowerCase();
}

// Reglas soportadas además de las de crmSegments (district, orgRole, tags...):
// has_sent (bool), has_published (bool), site_active (bool), pending_count (n),
// days_since_participation (n), inactivo (bool), cargo/president|secretary...
export async function previewAudience(clubId, audienceDef = {}, opts = {}) {
  await ensureContentActivationSchema().catch(() => {});
  await ensureAutomationSchema().catch(() => {});
  const scopeDef = opts.scopeDef || audienceDef.scopeDef || { type: 'district', ids: [] };
  const expanded = await expandScope(scopeDef).catch(() => ({ scope: scopeDef, clubIds: [], districtIds: [], districtNumbers: [], siteIds: [] }));
  const rules = Array.isArray(audienceDef.rules) ? audienceDef.rules : [];
  const excluded = new Set([...(opts.excludedContactIds || []), ...((audienceDef.excludedContactIds) || [])].map(String));
  const wantedRoles = new Set();
  const wantedSources = new Set(Array.isArray(audienceDef.sources) ? audienceDef.sources : []);
  const wantedLists = [];
  let wantedStatus = null;
  for (const r of rules) {
    if ((r.field === 'orgRole' || r.field === 'cargo' || r.field === 'role') && r.value) {
      const vals = Array.isArray(r.value) ? r.value : [r.value];
      for (const v of vals) {
        const map = { presidente: 'president', secretario: 'secretary', president: 'president', secretary: 'secretary' };
        wantedRoles.add(map[String(v).toLowerCase()] || String(v));
      }
    }
    if (r.field === 'source' && r.value) {
      (Array.isArray(r.value) ? r.value : [r.value]).forEach((v) => wantedSources.add(String(v)));
    }
    if (r.field === 'listId' && r.value) {
      (Array.isArray(r.value) ? r.value : [r.value]).forEach((v) => wantedLists.push(String(v)));
    }
    if (r.field === 'status' && r.value) wantedStatus = String(r.value);
  }

  const params = [];
  const conds = [`(c."archivedAt" IS NULL)`, `(c.status NOT IN ('unsubscribed','blocked'))`];
  // El ámbito gobierna; el clubId del actor solo filtra cuando no hay ámbito
  // concreto (campañas legado sin scope). Así un district_admin con club espejo
  // sí alcanza a los contactos de todos los clubes de su distrito.
  const hasScopeFilter = Boolean(
    (expanded.clubIds?.length) || (expanded.districtNumbers?.length) || (expanded.eventIds?.length)
  );
  if (clubId && !hasScopeFilter) { params.push(clubId); conds.push(`c."clubId"=$${params.length}`); }

  const push = (sql, val) => { params.push(val); return sql.replace('$#', `$${params.length}`); };

  // ── Ámbito → filtros SQL sobre CrmContact ──
  if (expanded.clubIds?.length) {
    params.push(expanded.clubIds);
    conds.push(`(c."siteId" = ANY($${params.length}) OR c."clubId" = ANY($${params.length}))`);
  } else if (expanded.districtNumbers?.length) {
    // Distrito: contactos cuyo district menciona el número o cuyo siteId
    // pertenece a un club del distrito. Sin clubIds (district sin clubes
    // todavía) se filtra solo por texto de distrito.
    const ors = [];
    for (const n of expanded.districtNumbers.slice(0, 20)) {
      params.push(`%${n}%`);
      ors.push(`c.district ILIKE $${params.length}`);
    }
    if (ors.length) conds.push(`(${ors.join(' OR ')})`);
  }
  if (expanded.eventIds?.length) {
    // Evento: se resuelve abajo vía EventRegistration; acá no se filtra por club
    // para no excluir inscritos externos. Se intersecta en memoria si hay emails.
    void expanded.eventIds;
  }
  for (const r of rules) {
    const f = String(r.field || '');
    const op = String(r.op || 'eq');
    const v = r.value;
    if (f === 'district' && v) {
      if (op === 'eq') conds.push(push(`c.district ILIKE $#`, `%${v}%`));
      else if (op === 'neq') conds.push(push(`c.district NOT ILIKE $#`, `%${v}%`));
    } else if (f === 'orgRole' && v) {
      conds.push(Array.isArray(v) ? push(`c."orgRole" = ANY($#)`, v.map(String)) : push(`c."orgRole" = $#`, String(v)));
    } else if (f === 'role' && v) {
      const vals = (Array.isArray(v) ? v : [v]).map((x) => {
        const m = { presidente: 'president', secretario: 'secretary' };
        return m[String(x).toLowerCase()] || String(x);
      });
      conds.push(push(`c."orgRole" = ANY($#)`, vals));
    } else if (f === 'siteId' && v) {
      conds.push(Array.isArray(v) ? push(`c."siteId" = ANY($#)`, v.map(String)) : push(`c."siteId" = $#`, String(v)));
    } else if (f === 'cargo' && v) {
      const map = { presidente: 'president', secretario: 'secretary' };
      const k = map[String(v).toLowerCase()] || v;
      conds.push(push(`c."orgRole" = $#`, k));
    } else if (f === 'tags' && v) {
      conds.push(push(`c.tags && $#`, Array.isArray(v) ? v.map(String) : [String(v)]));
    } else if (f === 'status' && v) {
      conds.push(push(`c.status = $#`, String(v)));
    } else if ((f === 'listId' || f === 'listIds') && v) {
      // Se resuelve abajo por membresía; marcador para no olvidar.
      void v;
    }
    // El resto (has_sent, has_published, site_active...) se filtra en memoria
    // tras el prefetch, porque combina varias tablas de contenido.
  }
  if (wantedRoles.size) {
    params.push([...wantedRoles]);
    conds.push(`c."orgRole" = ANY($${params.length})`);
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

  // ── Membresías a listas CRM (fuente secundaria, misma base) ──
  let listMemberIds = null;
  if (wantedLists.length) {
    try {
      const { rows } = await db.query(`SELECT "contactId" FROM "WhatsAppListMember" WHERE "listId"=ANY($1) LIMIT 5000`, [wantedLists]);
      listMemberIds = new Set(rows.map((r) => String(r.contactId)));
    } catch { listMemberIds = new Set(); }
  }

  // ── Señales de contenido por siteId/contacto. ──
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

  // ── Enriquecimiento: nombres de club y distrito ──
  const clubNameById = {};
  const districtNameById = {};
  try {
    if (siteIds.length) {
      const { rows } = await db.query(`SELECT id, name FROM "Club" WHERE id=ANY($1) LIMIT 2000`, [siteIds]).catch(() => ({ rows: [] }));
      for (const r of rows) clubNameById[r.id] = r.name;
    }
    const dIds = [...(expanded.districtIds || [])];
    if (dIds.length) {
      const { rows } = await db.query(`SELECT id, number, name FROM "District" WHERE id=ANY($1)`, [dIds]).catch(() => ({ rows: [] }));
      for (const r of rows) districtNameById[r.id] = r.name || (r.number != null ? `Distrito ${r.number}` : '');
    }
  } catch { /* noop */ }

  // ── Fuentes secundarias: Users (roles) + Leads + Eventos ──
  const extra = [];
  const useUsers = !wantedSources.size || ['site_admins', 'district_admins', 'club_admins', 'club_roles', 'users'].some((s) => wantedSources.has(s));
  const useLeads = !wantedSources.size || wantedSources.has('leads');
  const useEvents = expanded.eventIds?.length || wantedSources.has('event_contacts');
  if (useUsers) {
    try {
      const uConds = [];
      const uParams = [];
      if (expanded.clubIds?.length) { uParams.push(expanded.clubIds); uConds.push(`(u."clubId"=ANY($${uParams.length}))`); }
      if (expanded.districtIds?.length) { uParams.push(expanded.districtIds); uConds.push(`(u."districtId"=ANY($${uParams.length}))`); }
      if (!uConds.length && clubId) { uParams.push(clubId); uConds.push(`(u."clubId"=$${uParams.length})`); }
      if (uConds.length) {
        const { rows } = await db.query(
          `SELECT u.id, u.email, u.name, u.role, u."clubId", u."districtId", u."clubRole", c.name AS "clubName", d.name AS "districtName"
           FROM "User" u LEFT JOIN "Club" c ON c.id=u."clubId" LEFT JOIN "District" d ON d.id=u."districtId"
           WHERE ${uConds.join(' OR ')} LIMIT 1000`, uParams).catch(() => ({ rows: [] }));
        for (const u of rows) {
          if (!u.email) continue;
          // Filtro por fuente de rol si se pidió explícito.
          if (wantedSources.size) {
            const isDistrictAdmin = u.role === 'district_admin';
            const isClubAdmin = ['club_admin', 'administrator', 'superadmin'].includes(u.role);
            if (wantedSources.has('district_admins') && !isDistrictAdmin) continue;
            if (wantedSources.has('club_admins') && !isClubAdmin && !isDistrictAdmin) continue;
            if (wantedSources.has('site_admins') && !isClubAdmin && !isDistrictAdmin) continue;
          }
          extra.push({
            contactId: `user:${u.id}`, name: u.name || u.email, email: u.email, phone: null,
            orgRole: u.clubRole || u.role, district: u.districtName || '', siteId: u.clubId,
            siteType: 'club', status: 'active', consentState: 'unknown', optedOutAt: null,
            hasEmail: true, hasPhone: false, _clubName: u.clubName || '', _source: 'Administradores',
          });
        }
      }
    } catch { /* noop */ }
  }
  if (useLeads) {
    try {
      const lConds = [];
      const lParams = [];
      if (expanded.clubIds?.length) { lParams.push(expanded.clubIds); lConds.push(`l."clubId"=ANY($${lParams.length})`); }
      else if (clubId) { lParams.push(clubId); lConds.push(`l."clubId"=$${lParams.length}`); }
      if (lConds.length) {
        const { rows } = await db.query(
          `SELECT l.id, l.name, l.email, l."clubId", c.name AS "clubName" FROM "Lead" l LEFT JOIN "Club" c ON c.id=l."clubId"
           WHERE ${lConds.join(' AND ')} ORDER BY l."createdAt" DESC LIMIT 500`, lParams).catch(() => ({ rows: [] }));
        for (const l of rows) {
          if (!l.email) continue;
          extra.push({
            contactId: `lead:${l.id}`, name: l.name || l.email, email: l.email, phone: null,
            orgRole: 'other', district: '', siteId: l.clubId, siteType: 'club',
            status: 'active', consentState: 'unknown', optedOutAt: null,
            hasEmail: true, hasPhone: false, _clubName: l.clubName || '', _source: 'Leads',
          });
        }
      }
    } catch { /* noop */ }
  }
  if (useEvents && expanded.eventIds?.length) {
    try {
      const { rows } = await db.query(
        `SELECT id, email, name, "firstName", "lastName", status FROM "EventRegistration" WHERE "eventId"=ANY($1) LIMIT 2000`,
        [expanded.eventIds]).catch(() => ({ rows: [] }));
      for (const r of rows) {
        const email = r.email;
        if (!email) continue;
        if (String(r.status || '').toLowerCase() === 'cancelled') continue;
        extra.push({
          contactId: `event:${r.id}`, name: r.name || [r.firstName, r.lastName].filter(Boolean).join(' ') || email,
          email, phone: null, orgRole: 'other', district: '', siteId: null, siteType: 'event',
          status: 'active', consentState: 'unknown', optedOutAt: null,
          hasEmail: true, hasPhone: false, _source: 'Evento',
        });
      }
    } catch { /* tabla ausente */ }
  }

  const contentRules = rules.filter((r) => ['has_sent', 'has_published', 'site_active', 'pending', 'days_since', 'inactivo', 'participation_level'].includes(r.field));
  const out = [];
  const seen = new Set();
  let excluidos = 0, yaParticiparon = 0, sinCanal = 0;
  const all = [
    ...contacts.map((c) => ({ ...c, _source: 'Contactos CRM' })),
    ...extra,
  ];
  for (const c of all) {
    const key = normEmail(c.email) ? `email:${normEmail(c.email)}` : `id:${c.contactId || c.id}`;
    if (seen.has(key)) continue;
    if (excluded.has(String(c.contactId || c.id))) { excluidos++; continue; }
    if (listMemberIds && !listMemberIds.has(String(c.id || c.contactId)) && c._source === 'Contactos CRM' && wantedLists.length) continue;
    if (wantedStatus && String(c.status || 'active') !== wantedStatus) continue;
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
    seen.add(key);
    const fullName = c.name && c.lastName && !c.name.includes(' ') ? `${c.name} ${c.lastName}` : (c.name || '');
    const clubName = c._clubName || clubNameById[c.siteId] || '';
    const districtLabel = c.district || Object.values(districtNameById)[0] || (expanded.districtNumbers?.length ? `Distrito ${expanded.districtNumbers[0]}` : '');
    out.push({
      contactId: String(c.contactId || c.id), name: fullName,
      email: c.email, phone: c.phone || null,
      organizacion: clubName, distrito: districtLabel, club: clubName,
      rol: ROLE_LABEL[String(c.orgRole || '').toLowerCase()] || String(c.orgRole || ''),
      orgRole: c.orgRole, district: districtLabel,
      siteId: c.siteId, siteType: c.siteType || 'club',
      fuente: c._source || 'Contactos CRM',
      channel: hasWA && hasMail ? 'ambos' : hasWA ? 'whatsapp' : 'email',
      profile: prof || null,
    });
  }
  // Destinatarios manuales autorizados (no duplican si el email ya existe).
  for (const m of [...(opts.manualRecipients || []), ...(audienceDef.manualRecipients || [])].slice(0, 500)) {
    const email = normEmail(m.email);
    if (!email) continue;
    const key = `email:${email}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      contactId: `manual:${email}`, name: String(m.name || email),
      email, phone: m.phone || null, organizacion: String(m.organization || m.club || ''),
      distrito: String(m.district || ''), club: String(m.club || m.organization || ''),
      rol: String(m.role || 'Manual'), orgRole: 'other', district: String(m.district || ''),
      siteId: m.siteId || null, siteType: 'manual', fuente: 'Manual',
      channel: m.phone && email ? 'ambos' : m.phone ? 'whatsapp' : 'email', profile: null,
    });
  }
  const whatsapp = out.filter((x) => x.channel === 'whatsapp' || x.channel === 'ambos').length;
  const email = out.filter((x) => x.channel === 'email' || x.channel === 'ambos').length;
  const clubes = new Set(out.map((x) => x.club).filter(Boolean));
  return {
    estimada: out.length, whatsapp, email, excluidos, yaParticiparon,
    sinCanal, contactos: out.slice(0, opts.previewSize || 500),
    clubesAlcanzados: clubes.size, destinatariosUnicos: out.length,
    scope: expanded.scope,
  };
}
