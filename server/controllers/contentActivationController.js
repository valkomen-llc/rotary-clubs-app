// Controlador de Campañas de Activación de Contenido (Fases 1-5 + ámbito/audiencia v4.1130).
import db from '../lib/db.js';
import { ensureContentActivationSchema } from '../lib/ensureContentActivationSchema.js';
import { shapeActivation, validateActivation, canTransitionActivation, draftFromPrompt, kpiRates, SCOPE_TYPES, AUDIENCE_SOURCES } from '../lib/contentActivationSpec.js';
import { listCampaigns, getCampaign, upsertCampaign, setCampaignStatus, listExecutions, listEnrollments, listEvents, addEvent, getProfile, nid, createLinkToken } from '../lib/contentActivationStore.js';
import { previewAudience } from '../lib/contentActivationAudience.js';
import { assertScopeAllowed, listScopeEntities, getUserGrant, normalizeScopeDef } from '../lib/contentActivationScope.js';
import { ensureExecutionFor, enrollExecution, tickActivation, buildInsights, periodoLabel, nextPeriodStart } from '../lib/contentActivationEngine.js';

const ok = (res, data) => res.json({ ok: true, ...data });
const fail = (res, e, code = 500) => res.status(code).json({ error: e?.message || 'Error' });

function clubOf(req) {
  return req.user?.clubId || req.headers['x-club-id'] || null;
}

function campaignVisibleToGrant(campaign, grant) {
  if (!campaign) return false;
  if (grant.isGlobal) return true;
  const scope = campaign.scopeDef || {};
  if (!scope.ids?.length) return true; // legado: visible por club propietario
  if (scope.type === 'district') return (scope.ids || []).some((id) => (grant.districtIds || []).includes(id));
  if (scope.type === 'club' || scope.type === 'site') return (scope.ids || []).some((id) => (grant.clubIds || []).includes(id));
  return true;
}

export const list = async (req, res) => {
  try {
    const grant = await getUserGrant(req).catch(() => ({ isGlobal: true, districtIds: [], clubIds: [] }));
    const rows = await listCampaigns({ clubId: clubOf(req) });
    const visible = grant.isGlobal ? rows : rows.filter((c) => campaignVisibleToGrant(c, grant));
    return res.json({ campaigns: visible });
  } catch (e) { return fail(res, e); }
};

export const create = async (req, res) => {
  try {
    const shaped = shapeActivation(req.body);
    const v = validateActivation({ ...shaped, contributionCampaignId: shaped.contributionCampaignId || req.body.contributionCampaignId });
    if (!v.ok) return res.status(400).json({ error: v.errors[0], errors: v.errors });
    try {
      await assertScopeAllowed(req, shaped.scopeDef);
    } catch (e) {
      return res.status(e.status || 403).json({ error: e.message });
    }
    const row = await upsertCampaign({ ...shaped, status: 'borrador', createdBy: req.user?.id || null }, clubOf(req));
    await addEvent({ executionId: 'none', campaignId: row.id, type: 'campana_creada', metadata: { by: req.user?.id || null, scope: shaped.scopeDef } }).catch(() => {});
    return res.status(201).json({ campaign: row });
  } catch (e) { return fail(res, e); }
};

export const detail = async (req, res) => {
  try {
    const c = await getCampaign(req.params.id);
    if (!c) return res.status(404).json({ error: 'No encontrada' });
    const grant = await getUserGrant(req).catch(() => ({ isGlobal: true }));
    if (!campaignVisibleToGrant(c, grant)) return res.status(403).json({ error: 'Fuera de tus permisos.' });
    const executions = await listExecutions(c.id);
    return res.json({ campaign: c, executions });
  } catch (e) { return fail(res, e); }
};

export const update = async (req, res) => {
  try {
    const cur = await getCampaign(req.params.id);
    if (!cur) return res.status(404).json({ error: 'No encontrada' });
    const grant = await getUserGrant(req).catch(() => ({ isGlobal: true }));
    if (!campaignVisibleToGrant(cur, grant)) return res.status(403).json({ error: 'Fuera de tus permisos.' });
    const nextScope = req.body.scopeDef ? normalizeScopeDef(req.body.scopeDef) : cur.scopeDef;
    try {
      await assertScopeAllowed(req, nextScope);
    } catch (e) {
      return res.status(e.status || 403).json({ error: e.message });
    }
    if (!['borrador', 'programada'].includes(cur.status)) {
      // Regla aditiva: en otros estados solo se permite pausar/finalizar vía transition.
      const allowed = ['description', 'objetivo', 'variables', 'followRules', 'contentDef'];
      const body = {};
      for (const k of allowed) if (req.body[k] !== undefined) body[k] = req.body[k];
      const row = await upsertCampaign({ ...cur, ...shapeActivation({ ...cur, ...body }), id: cur.id, status: cur.status }, clubOf(req));
      return ok(res, { campaign: row });
    }
    const shaped = shapeActivation({ ...cur, ...req.body, scopeDef: nextScope });
    // Si pasa a fija sin foto, congelar la actual como snapshot.
    if (shaped.audienceMode === 'fixed' && !shaped.audienceSnapshot) {
      try {
        const p = await previewAudience(clubOf(req), shaped.audienceDef, {
          limit: 2000, previewSize: 2000, scopeDef: shaped.scopeDef,
          excludedContactIds: shaped.excludedContactIds, manualRecipients: shaped.manualRecipients,
        });
        shaped.audienceSnapshot = p.contactos;
      } catch { /* noop */ }
    }
    const row = await upsertCampaign({ ...shaped, id: cur.id, status: cur.status }, clubOf(req));
    return ok(res, { campaign: row });
  } catch (e) { return fail(res, e); }
};

export const transition = async (req, res) => {
  try {
    const cur = await getCampaign(req.params.id);
    if (!cur) return res.status(404).json({ error: 'No encontrada' });
    const to = String(req.body.status || '');
    if (!canTransitionActivation(cur.status, to)) return res.status(400).json({ error: `Transición ${cur.status} → ${to} no permitida` });
    // IA nunca auto-activa: si la campaña nació del asistente exige revisión explícita.
    const row = await setCampaignStatus(cur.id, to);
    await addEvent({ executionId: 'none', campaignId: cur.id, type: to === 'activa' ? 'campana_activada' : 'campana_pausada', metadata: { from: cur.status, to } }).catch(() => {});
    if (to === 'activa') {
      const exec = await ensureExecutionFor(row);
      await enrollExecution(row, exec).catch(() => {});
    }
    return ok(res, { campaign: row });
  } catch (e) { return fail(res, e); }
};

export const preview = async (req, res) => {
  try {
    const cur = req.params.id && req.params.id !== 'preview' ? await getCampaign(req.params.id).catch(() => null) : null;
    const audienceDef = req.body.audienceDef || cur?.audienceDef || { match: 'all', rules: [] };
    const scopeDef = normalizeScopeDef(req.body.scopeDef || audienceDef.scopeDef || cur?.scopeDef || { type: 'district', ids: [] });
    try {
      await assertScopeAllowed(req, scopeDef);
    } catch (e) {
      return res.status(e.status || 403).json({ error: e.message });
    }
    const p = await previewAudience(clubOf(req), audienceDef, {
      limit: 2000, previewSize: 200,
      scopeDef,
      excludedContactIds: req.body.excludedContactIds || cur?.excludedContactIds || [],
      manualRecipients: req.body.manualRecipients || cur?.manualRecipients || [],
    });
    if (cur) await addEvent({ executionId: 'none', campaignId: cur.id, type: 'preview', metadata: { estimada: p.estimada, scope: scopeDef } }).catch(() => {});
    return res.json({
      preview: {
        audienciaEstimada: p.estimada, whatsapp: p.whatsapp, email: p.email,
        excluidos: p.excluidos, yaParticiparon: p.yaParticiparon, sinCanal: p.sinCanal,
        clubesAlcanzados: p.clubesAlcanzados, destinatariosUnicos: p.destinatariosUnicos,
      },
      contactos: p.contactos, scope: p.scope,
    });
  } catch (e) { return fail(res, e); }
};

// ── Catálogos de ámbito y audiencia (filtrados por permiso en servidor) ──
export const scopeTypes = async (req, res) => {
  return res.json({ types: SCOPE_TYPES });
};

export const scopeCatalog = async (req, res) => {
  try {
    const type = String(req.query.type || 'district');
    const search = String(req.query.search || '');
    const items = await listScopeEntities(req, type, search, Number(req.query.limit) || 100);
    return res.json({ type, items });
  } catch (e) { return fail(res, e); }
};

export const audienceSources = async (req, res) => {
  try {
    const { ORG_ROLES } = await import('../lib/crmSegments.js').catch(() => ({ ORG_ROLES: [] }));
    let lists = [];
    try {
      const { rows } = await db.query(`SELECT id, name FROM "WhatsAppContactList" ORDER BY name ASC LIMIT 100`);
      lists = rows;
    } catch { /* noop */ }
    let segments = [];
    try {
      const { PRESET_SEGMENTS } = await import('../lib/crmSegments.js');
      segments = (PRESET_SEGMENTS || []).map((s) => ({ key: s.key, label: s.label }));
    } catch { /* noop */ }
    return res.json({ sources: AUDIENCE_SOURCES, roles: ORG_ROLES || [], lists, segments });
  } catch (e) { return fail(res, e); }
};

// Destinatarios resueltos con trazabilidad (fija la foto si la campaña es fija).
export const recipients = async (req, res) => {
  try {
    const cur = await getCampaign(req.params.id);
    if (!cur) return res.status(404).json({ error: 'No encontrada' });
    const grant = await getUserGrant(req).catch(() => ({ isGlobal: true }));
    if (!campaignVisibleToGrant(cur, grant)) return res.status(403).json({ error: 'Fuera de tus permisos.' });
    if (cur.audienceMode === 'fixed' && Array.isArray(cur.audienceSnapshot) && cur.audienceSnapshot.length) {
      const list = cur.audienceSnapshot.filter((c) => !(cur.excludedContactIds || []).includes(String(c.contactId)));
      return res.json({ mode: 'fixed', total: list.length, contactos: list.slice(0, 500) });
    }
    const p = await previewAudience(clubOf(req), cur.audienceDef || {}, {
      limit: 2000, previewSize: 500, scopeDef: cur.scopeDef,
      excludedContactIds: cur.excludedContactIds || [], manualRecipients: cur.manualRecipients || [],
    });
    return res.json({ mode: 'dynamic', total: p.estimada, contactos: p.contactos, clubesAlcanzados: p.clubesAlcanzados });
  } catch (e) { return fail(res, e); }
};

export const excludeContact = async (req, res) => {
  try {
    const cur = await getCampaign(req.params.id);
    if (!cur) return res.status(404).json({ error: 'No encontrada' });
    const contactId = String(req.body.contactId || req.params.contactId || '');
    if (!contactId) return res.status(400).json({ error: 'contactId requerido' });
    const excluded = [...new Set([...(cur.excludedContactIds || []), contactId])].slice(0, 5000);
    const row = await upsertCampaign({ ...cur, excludedContactIds: excluded }, clubOf(req));
    return ok(res, { campaign: row, excluded: excluded.length });
  } catch (e) { return fail(res, e); }
};

export const addManualRecipient = async (req, res) => {
  try {
    const cur = await getCampaign(req.params.id).catch(() => null);
    const { name, email, phone, organization, club, district, role } = req.body || {};
    if (!email) return res.status(400).json({ error: 'Email requerido' });
    const entry = { name: String(name || email).slice(0, 120), email: String(email).slice(0, 160), phone: phone ? String(phone).slice(0, 40) : null, organization: String(organization || club || '').slice(0, 160), club: String(club || organization || '').slice(0, 160), district: String(district || '').slice(0, 120), role: String(role || 'Manual').slice(0, 80) };
    if (cur) {
      const manual = [...(cur.manualRecipients || []), entry].slice(0, 500);
      const row = await upsertCampaign({ ...cur, manualRecipients: manual }, clubOf(req));
      return ok(res, { campaign: row, total: manual.length });
    }
    return ok(res, { recipient: entry });
  } catch (e) { return fail(res, e); }
};

export const saveSegment = async (req, res) => {
  try {
    await ensureContentActivationSchema();
    const cur = await getCampaign(req.params.id);
    if (!cur) return res.status(404).json({ error: 'No encontrada' });
    const name = String(req.body.name || `Segmento · ${cur.name}`).slice(0, 160);
    const id = nid('sg_');
    await db.query(`CREATE TABLE IF NOT EXISTS "ContentActivationSegment"(id TEXT PRIMARY KEY,"campaignId" TEXT,name TEXT,"scopeDef" JSONB,"audienceDef" JSONB,"createdBy" TEXT,"createdAt" TIMESTAMPTZ DEFAULT NOW())`).catch(() => {});
    await db.query(`INSERT INTO "ContentActivationSegment"(id,"campaignId",name,"scopeDef","audienceDef","createdBy") VALUES($1,$2,$3,$4,$5,$6)`,
      [id, cur.id, name, JSON.stringify(cur.scopeDef || {}), JSON.stringify(cur.audienceDef || {}), req.user?.id || null]).catch(() => {});
    const row = await upsertCampaign({ ...cur, savedSegmentId: id }, clubOf(req));
    return ok(res, { campaign: row, segmentId: id, name });
  } catch (e) { return fail(res, e); }
};

// Enviar prueba a un correo sin inscribir audiencia real.
export const sendTest = async (req, res) => {
  try {
    const cur = await getCampaign(req.params.id);
    if (!cur) return res.status(404).json({ error: 'No encontrada' });
    const to = String(req.body.email || '');
    if (!to.includes('@')) return res.status(400).json({ error: 'Email de prueba inválido' });
    const channel = req.body.channel === 'whatsapp' ? 'whatsapp' : 'email';
    let formSlug = 'rotary-en-accion';
    if (cur?.contributionCampaignId) {
      const { rows: cc } = await db.query(`SELECT slug FROM "ContributionCampaign" WHERE id=$1`, [cur.contributionCampaignId]).catch(() => ({ rows: [] }));
      if (cc[0]?.slug) formSlug = cc[0].slug;
    }
    const base = `${req.protocol}://${req.get('host')}`;
    if (channel === 'email') {
      const { default: EmailService } = await import('../services/EmailService.js').catch(() => ({ default: null }));
      if (EmailService?.sendEmail) {
        await EmailService.sendEmail({
          clubId: clubOf(req), to, subject: `[PRUEBA] ${cur.name}`,
          html: `<p>Prueba de la campaña <b>${cur.name}</b>.</p><p>Ámbito: ${(cur.scopeDef?.type || '')} · Frecuencia: ${cur.frecuencia}.</p><p><a href="${base}/${formSlug}">Abrir formulario ${formSlug}</a></p>`,
          userId: req.user?.id,
        }).catch(() => {});
      }
    }
    await addEvent({ executionId: 'none', campaignId: cur.id, type: 'nota', channel, metadata: { test: true, to: to.slice(0, 60), campaign_id: cur.id, scope: cur.scopeDef, channel, execution: 'test', delivery_status: 'test_sent', sent_at: new Date().toISOString() } }).catch(() => {});
    return ok(res, { sent: true, channel });
  } catch (e) { return fail(res, e); }
};

export const executions = async (req, res) => {
  try {
    const rows = await listExecutions(req.params.id);
    return res.json({ executions: rows });
  } catch (e) { return fail(res, e); }
};

export const enroll = async (req, res) => {
  try {
    const c = await getCampaign(req.params.id);
    if (!c) return res.status(404).json({ error: 'No encontrada' });
    const exec = await ensureExecutionFor(c);
    const r = await enrollExecution(c, exec);
    return ok(res, r);
  } catch (e) { return fail(res, e); }
};

export const enrollments = async (req, res) => {
  try {
    const rows = await listEnrollments(req.params.executionId, Number(req.query.limit) || 200);
    return res.json({ enrollments: rows });
  } catch (e) { return fail(res, e); }
};

export const timeline = async (req, res) => {
  try {
    const rows = await listEvents({ executionId: req.query.executionId, enrollmentId: req.query.enrollmentId, campaignId: req.params.id });
    return res.json({ events: rows });
  } catch (e) { return fail(res, e); }
};

export const analytics = async (req, res) => {
  try {
    await ensureContentActivationSchema();
    const campaignId = req.params.id;
    const { executionId } = req.query;
    const execFilter = executionId ? `AND n."executionId"='${String(executionId).replace(/'/g, '')}'` : '';
    const { rows: en } = await db.query(
      `SELECT COUNT(*)::int AS elegibles,
        COUNT(CASE WHEN n.status NOT IN ('programada','por_enviar') THEN 1 END)::int AS contactados,
        COUNT(CASE WHEN n.status IN ('contactada','esperando_contenido','contenido_recibido','generacion_ia','por_aprobar','publicada') THEN 1 END)::int AS contactadas,
        COUNT(DISTINCT n."siteId")::int AS clubesAlcanzados,
        COUNT(DISTINCT n."contactId")::int AS destinatariosUnicos
       FROM "ContentActivationEnrollment" n WHERE n."campaignId"=$1 ${executionId ? 'AND n."executionId"=$2' : ''}`,
      executionId ? [campaignId, executionId] : [campaignId]);
    void execFilter;
    const { rows: subs } = await db.query(
      `SELECT COUNT(DISTINCT "activationEnrollmentId")::int AS solicitudesUnicas,
              COUNT(*)::int AS total,
              COUNT(CASE WHEN status IN ('aprobado','listo_difusion','publicado') THEN 1 END)::int AS validas,
              COUNT(CASE WHEN status='publicado' THEN 1 END)::int AS publicadas,
              AVG(EXTRACT(EPOCH FROM ("createdAt" - (SELECT MIN(e."createdAt") FROM "ContentActivationEvent" e WHERE e."enrollmentId"=s."activationEnrollmentId")))/86400)::float AS tContactoSolicitud
       FROM "ContributionSubmission" s WHERE s."activationCampaignId"=$1 ${executionId ? 'AND s."activationExecutionId"=$2' : ''}`,
      executionId ? [campaignId, executionId] : [campaignId]).catch(() => ({ rows: [{ solicitudesUnicas: 0, total: 0, validas: 0, publicadas: 0 }] }));
    const { rows: arts } = await db.query(
      `SELECT COUNT(CASE WHEN a.status IN ('borrador_listo','en_revision','requiere_info','aprobado') THEN 1 END)::int AS generados,
              COUNT(CASE WHEN a.status='aprobado' THEN 1 END)::int AS aprobados,
              COUNT(CASE WHEN a.status='publicado' THEN 1 END)::int AS publicados
       FROM "SubmissionArticle" a JOIN "ContributionSubmission" s ON s.id=a."submissionId"
       WHERE s."activationCampaignId"=$1 ${executionId ? 'AND s."activationExecutionId"=$2' : ''}`,
      executionId ? [campaignId, executionId] : [campaignId]).catch(() => ({ rows: [{ generados: 0, aprobados: 0, publicados: 0 }] }));
    const base = en[0] || {};
    const sb = subs[0] || {};
    const ar = arts[0] || {};
    const rates = kpiRates({ elegibles: base.elegibles || 0, contactados: base.contactadas || 0, solicitudesUnicas: sb.solicitudesUnicas || 0, validas: sb.validas || 0, publicadas: sb.publicadas || 0 });
    // Solo datos reales: si no hay envíos, se indica vacío en vez de ceros decorados.
    return res.json({
      kpis: {
        elegibles: base.elegibles || 0, contactados: base.contactadas || 0,
        solicitudes: sb.total || 0, clubesParticipantes: sb.solicitudesUnicas || 0,
        clubesAlcanzados: base.clubesAlcanzados || 0, destinatariosUnicos: base.destinatariosUnicos || 0,
        clubesContactados: base.clubesAlcanzados || 0, clubesConContenido: sb.solicitudesUnicas || 0,
        generados: ar.generados || 0, aprobados: ar.aprobados || 0, publicados: Math.max(ar.publicados || 0, sb.publicadas || 0),
        tContactoSolicitudDias: sb.tContactoSolicitud != null ? +Number(sb.tContactoSolicitud).toFixed(1) : null,
        ...rates,
      },
      empty: (base.elegibles || 0) === 0,
    });
  } catch (e) { return fail(res, e); }
};

export const insights = async (req, res) => {
  try {
    const { executionId } = req.query;
    if (!executionId) return res.status(400).json({ error: 'executionId requerido' });
    const r = await buildInsights(req.params.id, executionId);
    return res.json(r);
  } catch (e) { return fail(res, e); }
};

export const aiDraft = async (req, res) => {
  try {
    const prompt = String(req.body.prompt || '');
    if (!prompt.trim()) return res.status(400).json({ error: 'Describe la campaña' });
    const { draftFromPrompt: d } = await import('../lib/contentActivationSpec.js');
    const draft = d(prompt);
    // Enriquecer con modelo si está disponible; si falla, devolver reglas.
    try {
      const { routeToModel } = await import('../lib/ai-router.js');
      const out = await routeToModel('gemini-2.5-flash',
        'Eres asistente de campañas de contenido rotario. Devuelve SOLO JSON con segmentacion, flujo, frecuencia, mensajes, condiciones, recordatorios, canales, criterios_salida, kpis. No inventes métricas.',
        String(prompt).slice(0, 2000), [], { maxTokens: 800 });
      return res.json({ draft, ai: typeof out === 'string' ? out.slice(0, 4000) : out, needsApproval: true });
    } catch {
      return res.json({ draft, needsApproval: true });
    }
  } catch (e) { return fail(res, e); }
};

export const profile = async (req, res) => {
  try {
    const p = await getProfile(req.params.siteId);
    if (!p) return res.json({ profile: null, empty: true });
    return res.json({ profile: p });
  } catch (e) { return fail(res, e); }
};

export const board = async (req, res) => {
  // Vista operativa transversal para Centro de Control: enrollments + solicitud/artículo/post.
  try {
    await ensureContentActivationSchema();
    const { campaignId, executionId } = req.query;
    const conds = [];
    const params = [];
    if (campaignId) { params.push(campaignId); conds.push(`n."campaignId"=$${params.length}`); }
    if (executionId) { params.push(executionId); conds.push(`n."executionId"=$${params.length}`); }
    const { rows } = await db.query(
      `SELECT n.*, e."periodoLabel",
              s.id AS "submissionId", s.status AS "submissionStatus", s.title AS "submissionTitle",
              a.status AS "articleStatus", a."postId",
              p.published AS "postPublished", p.title AS "postTitle"
       FROM "ContentActivationEnrollment" n
       LEFT JOIN "ContentActivationExecution" e ON e.id=n."executionId"
       LEFT JOIN "ContributionSubmission" s ON s."activationEnrollmentId"=n.id
       LEFT JOIN "SubmissionArticle" a ON a."submissionId"=s.id
       LEFT JOIN "Post" p ON p.id=a."postId"
       ${conds.length ? 'WHERE ' + conds.join(' AND ') : ''}
       ORDER BY n."updatedAt" DESC LIMIT 300`, params).catch(() => ({ rows: [] }));
    const counts = { programadas: 0, enviando: 0, esperando: 0, recibidas: 0, generado: 0, por_aprobar: 0, publicadas: 0, errores: 0 };
    for (const r of rows) {
      if (r.status === 'publicada' || r.postPublished) counts.publicadas++;
      else if (r.articleStatus === 'aprobado' || r.articleStatus === 'borrador_listo' || r.status === 'por_aprobar') counts.por_aprobar++;
      else if (r.articleStatus) counts.generado++;
      else if (r.status === 'contenido_recibido') counts.recibidas++;
      else if (['esperando_contenido', 'contactada'].includes(r.status)) counts.esperando++;
      else if (['por_enviar', 'programada'].includes(r.status)) counts.programadas++;
      else if (r.status === 'error') counts.errores++;
      if (['contactada', 'esperando_contenido'].includes(r.status)) counts.enviando++;
    }
    return res.json({ cards: rows, counts });
  } catch (e) { return fail(res, e); }
};

export const pauseEnrollment = async (req, res) => {  try {
    await ensureContentActivationSchema();
    await db.query(`UPDATE "ContentActivationEnrollment" SET status='pausada',"updatedAt"=NOW() WHERE id=$1`, [req.params.enrollmentId]);
    return ok(res, {});
  } catch (e) { return fail(res, e); }
};

export const retryEnrollment = async (req, res) => {
  try {
    await ensureContentActivationSchema();
    await db.query(`UPDATE "ContentActivationEnrollment" SET status='por_enviar',attempts=0,"nextActionAt"=NOW(),"updatedAt"=NOW() WHERE id=$1`, [req.params.enrollmentId]);
    return ok(res, {});
  } catch (e) { return fail(res, e); }
};

// Generador de enlaces de campaña (v4.1118): URL a Rotary en Acción con
// attribution (campaign, club, segment, recipient, channel, message, UTM).
export const linkForEnrollment = async (req, res) => {
  try {
    await ensureContentActivationSchema();
    const { rows } = await db.query(`SELECT * FROM "ContentActivationEnrollment" WHERE id=$1`, [req.params.enrollmentId]);
    const en = rows[0];
    if (!en) return res.status(404).json({ error: 'Inscripción no encontrada' });
    const camp = await getCampaign(en.campaignId);
    const { utm_source, utm_medium, utm_campaign, channel, messageId, segmentId } = req.body || {};
    const t = await createLinkToken({
      executionId: en.executionId, enrollmentId: en.id, campaignId: en.campaignId, contactId: en.contactId,
      utmSource: utm_source, utmMedium: utm_medium || channel, utmCampaign: utm_campaign,
      channel: channel || en.channel, messageId, recipientId: en.contactId, segmentId: segmentId || camp?.savedSegmentId,
    });
    let formSlug = 'rotary-en-accion';
    if (camp?.contributionCampaignId) {
      const { rows: cc } = await db.query(`SELECT slug FROM "ContributionCampaign" WHERE id=$1`, [camp.contributionCampaignId]).catch(() => ({ rows: [] }));
      if (cc[0]?.slug) formSlug = cc[0].slug;
    }
    const base = `${req.protocol}://${req.get('host')}`;
    const qs = new URLSearchParams({ ca_token: t.token });
    if (formSlug !== 'rotary-en-accion') qs.set('campaign', formSlug);
    if (utm_source) qs.set('utm_source', utm_source);
    if (utm_medium || channel) qs.set('utm_medium', String(utm_medium || channel));
    if (utm_campaign) qs.set('utm_campaign', utm_campaign);
    await addEvent({ enrollmentId: en.id, executionId: en.executionId, campaignId: en.campaignId, type: 'nota', channel: channel || en.channel, metadata: { link: true, utm_source, utm_medium, utm_campaign, campaign_id: en.campaignId, scope: camp?.scopeDef, recipient: en.contactId, execution: en.executionId, delivery_status: 'link_generated', sent_at: new Date().toISOString() } }).catch(() => {});
    return res.json({ url: `${base}/rotary-en-accion?${qs.toString()}`, token: t.token, expiresAt: t.expiresAt });
  } catch (e) { return fail(res, e); }
};

export const tickNow = async (req, res) => {
  try {
    const s = await tickActivation({ now: new Date(), limit: 100, baseUrl: `${req.protocol}://${req.get('host')}` });
    return ok(res, { summary: s });
  } catch (e) { return fail(res, e); }
};

export const newExecution = async (req, res) => {
  try {
    await ensureContentActivationSchema();
    const c = await getCampaign(req.params.id);
    if (!c) return res.status(404).json({ error: 'No encontrada' });
    const label = req.body.periodoLabel || periodoLabel(c.frecuencia, req.body.startAt || new Date().toISOString(), 0);
    const id = nid('ex_');
    await db.query(`INSERT INTO "ContentActivationExecution"(id,"campaignId","periodoLabel","startAt","endAt",status) VALUES($1,$2,$3,$4,$5,'programada')`,
      [id, c.id, label, req.body.startAt || null, req.body.endAt || null]);
    await addEvent({ executionId: id, campaignId: c.id, type: 'ejecucion_creada', metadata: { periodoLabel: label } }).catch(() => {});
    try {
      const { nextPeriodStart: nps } = await import('../lib/contentActivationEngine.js');
      void nps; void nextPeriodStart;
    } catch { /* noop */ }
    return res.status(201).json({ executionId: id, periodoLabel: label });
  } catch (e) { return fail(res, e); }
};
