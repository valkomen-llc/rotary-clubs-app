// Controlador de Campañas de Activación de Contenido (Fases 1-5 + ámbito/audiencia v4.1130).
import db from '../lib/db.js';
import { ensureContentActivationSchema } from '../lib/ensureContentActivationSchema.js';
import { shapeActivation, validateActivation, canTransitionActivation, draftFromPrompt, kpiRates, SCOPE_TYPES, AUDIENCE_SOURCES, normalizeContentDef, readinessCheck, EDITABLE_FULL_STATES, EDITABLE_PARTIAL_FIELDS, EDITABLE_PAUSADA_FIELDS, duplicateName, deletionPolicy, transitionEventType } from '../lib/contentActivationSpec.js';
import { listCampaigns, getCampaign, upsertCampaign, setCampaignStatus, deleteCampaign, countCampaignHistory, getEnrollment, listExecutions, listEnrollments, listEvents, addEvent, getProfile, nid, createLinkToken } from '../lib/contentActivationStore.js';
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
  // El remitente manda: si la campaña pertenece a mi sitio, la veo.
  if (campaign.senderSiteId) {
    const ref = String(campaign.senderSiteId);
    const mine = [...(grant.clubIds || [])];
    if (mine.includes(ref)) return true;
    if (ref.startsWith('district:') && (grant.districtIds || []).includes(ref.slice(9))) return true;
  }
  const scope = campaign.scopeDef || {};
  if (!scope.ids?.length) return true; // legado: visible por club propietario
  if (scope.type === 'district') return (scope.ids || []).some((id) => (grant.districtIds || []).includes(id));
  if (scope.type === 'club' || scope.type === 'site') return (scope.ids || []).some((id) => (grant.clubIds || []).includes(id));
  return true;
}

// ── Puerta de ESCRITURA (v4.1163) ──────────────────────────────────────
// Ver no es modificar: una campaña visible por regla de lectura (p. ej.
// legado sin ámbito) no necesariamente se puede operar. El global escribe
// todo; el resto solo lo de SU sitio/distrito: remitente propio, club
// propietario heredado o ámbito que intersecta su permiso. Lanza 403.
async function assertCampaignWritable(campaign, req) {
  const grant = await getUserGrant(req).catch(() => ({ isGlobal: true, districtIds: [], clubIds: [] }));
  if (grant.isGlobal) return grant;
  if (campaign.senderSiteId) {
    const ref = String(campaign.senderSiteId);
    if ((grant.clubIds || []).includes(ref)) return grant;
    if (ref.startsWith('district:') && (grant.districtIds || []).includes(ref.slice(9))) return grant;
  }
  if (campaign.clubId && (grant.clubIds || []).includes(campaign.clubId)) return grant;
  const scope = campaign.scopeDef || {};
  if (scope.type === 'district' && (scope.ids || []).some((id) => (grant.districtIds || []).includes(id))) return grant;
  if ((scope.type === 'club' || scope.type === 'site') && (scope.ids || []).some((id) => (grant.clubIds || []).includes(id))) return grant;
  const e = new Error('No tienes permiso para modificar esta campaña.');
  e.status = 403;
  throw e;
}

// Remitente de la campaña: explícito (global) o automático (sitio/ámbito).
// Devuelve senderSiteId serializado o null. Lanza 403 si el remitente pedido
// está fuera del permiso.
async function resolveSenderForWrite(req, body, cur) {
  const { parseSenderRef, serializeSenderRef, deriveSenderFromScope, deriveSenderFromGrant, loadSenderContext } = await import('../lib/contentActivationSender.js');
  const grant = await getUserGrant(req).catch(() => ({ isGlobal: true }));
  const wanted = body.senderSiteId !== undefined ? body.senderSiteId : cur?.senderSiteId;
  if (grant.isGlobal) {
    if (wanted) {
      const ref = parseSenderRef(wanted);
      if (!ref) { const e = new Error('Sitio remitente inválido.'); e.status = 400; throw e; }
      const ctx = await loadSenderContext(ref).catch(() => null);
      if (!ctx?.siteName) { const e = new Error('Sitio remitente no encontrado.'); e.status = 400; throw e; }
      return serializeSenderRef(ref);
    }
    const scope = body.scopeDef || cur?.scopeDef;
    const auto = await deriveSenderFromScope(scope).catch(() => null);
    return serializeSenderRef(auto);
  }
  // Desde un sitio: el remitente es el propio sitio (o el del ámbito permitido).
  const auto = (await deriveSenderFromGrant(grant).catch(() => null))
    || (await deriveSenderFromScope(body.scopeDef || cur?.scopeDef).catch(() => null));
  if (body.senderSiteId && body.senderSiteId !== serializeSenderRef(auto)) {
    const e = new Error('El sitio remitente se asigna automáticamente a tu sitio.');
    e.status = 403;
    throw e;
  }
  return serializeSenderRef(auto);
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
    try {
      shaped.senderSiteId = await resolveSenderForWrite(req, req.body, null);
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

// ─── Calendario editorial (v4.1169) ────────────────────────────────────
// Flujo = REGLAS (dayOffset por paso); Calendario = EJECUCIONES proyectadas
// de esas reglas (ancla de ciclo + offset, hora pared en campaign.timezone,
// corte explícito en endAt). Los estados se resuelven con datos reales
// (ejecuciones + eventos + overrides); lo futuro sin datos es `programado`.
// La misma matemática la usan el tick y las automatizaciones
// (`contentActivationSchedule`: única fuente de verdad).
const SEND_EVENTS = ['email_enviado', 'whatsapp_enviado', 'recordatorio_enviado'];
const FAIL_EVENTS = ['email_fallido', 'whatsapp_fallido', 'error'];

async function loadCalendarBase(campaignId) {
  const { default: db } = await import('../lib/db.js');
  const { rows: executions } = await db.query(
    `SELECT id, "periodoLabel", "startAt", "endAt", status, "createdAt" FROM "ContentActivationExecution" WHERE "campaignId"=$1 ORDER BY "createdAt" ASC`,
    [campaignId]).catch(() => ({ rows: [] }));
  const { rows: events } = await db.query(
    `SELECT type, channel, metadata, "executionId", "createdAt" FROM "ContentActivationEvent" WHERE "campaignId"=$1`,
    [campaignId]).catch(() => ({ rows: [] }));
  return { db, executions, events };
}

const execAnchor = (e) => new Date(e.startAt || e.createdAt || 0).getTime();

function resolveOccurrenceState(o, { executions, eventsByExecStep, enrollPauseByExec, campaignStatus, now }) {
  if (o.estadoBase === 'omitido') return 'omitido';
  // Ejecución que cubre la ocurrencia: la última con ancla ≤ fecha.
  let exec = null;
  for (const e of executions) {
    if (execAnchor(e) <= new Date(o.scheduledAt).getTime()) exec = e;
  }
  const evts = exec ? (eventsByExecStep.get(`${exec.id}:${o.stepKey}`) || []) : [];
  const types = new Set(evts.map((v) => v.type));
  if ([...types].some((t) => SEND_EVENTS.includes(t))) return 'enviado';
  if ([...types].some((t) => FAIL_EVENTS.includes(t))) return 'fallido';
  if (exec?.status === 'cerrada') return 'cancelado';
  if (exec && (enrollPauseByExec.get(exec.id) || 0) > 0) return 'pausado';
  if (campaignStatus === 'pausada' && new Date(o.scheduledAt).getTime() > now) return 'pausado';
  if (['finalizada', 'archivada'].includes(campaignStatus) && new Date(o.scheduledAt).getTime() > now) return 'cancelado';
  if (new Date(o.scheduledAt).getTime() > now) return 'programado';
  return 'pendiente';
}

// GET /:id/calendar?from&to — parrilla editorial con estados.
export const calendar = async (req, res) => {
  try {
    const c = await getCampaign(req.params.id);
    if (!c) return res.status(404).json({ error: 'No encontrada' });
    const grant = await getUserGrant(req).catch(() => ({ isGlobal: true }));
    if (!campaignVisibleToGrant(c, grant)) return res.status(403).json({ error: 'Fuera de tus permisos.' });
    const { occurrencesForCampaign } = await import('../lib/contentActivationSchedule.js');
    const { loadScheduleOverrides } = await import('../lib/contentActivationEngine.js');
    const overrides = await loadScheduleOverrides(c.id);
    const now = Date.now();
    let occ = occurrencesForCampaign(c, { overrides: [...overrides.values()] });
    const from = req.query.from ? new Date(req.query.from).getTime() : null;
    const to = req.query.to ? new Date(req.query.to).getTime() : null;
    if (from) occ = occ.filter((o) => new Date(o.scheduledAt).getTime() >= from);
    if (to) occ = occ.filter((o) => new Date(o.scheduledAt).getTime() <= to);
    const { executions, events } = await loadCalendarBase(c.id);
    const eventsByExecStep = new Map();
    for (const v of events) {
      const k = `${v.executionId}:${v.metadata?.step}`;
      if (!eventsByExecStep.has(k)) eventsByExecStep.set(k, []);
      eventsByExecStep.get(k).push(v);
    }
    const { default: db } = await import('../lib/db.js');
    const enrollPauseByExec = new Map();
    for (const e of executions) {
      const { rows } = await db.query(
        `SELECT status, COUNT(*)::int AS n FROM "ContentActivationEnrollment" WHERE "executionId"=$1 GROUP BY 1`,
        [e.id]).catch(() => ({ rows: [] }));
      enrollPauseByExec.set(e.id, rows.filter((r) => r.status === 'pausada').reduce((a, r) => a + Number(r.n), 0));
    }
    const withState = occ.map((o) => ({
      ...o,
      estado: resolveOccurrenceState(o, { executions, eventsByExecStep, enrollPauseByExec, campaignStatus: c.status, now }),
    }));
    // Próxima en cada serie (paso): la futura no omitida más cercana.
    const nextByStep = {};
    for (const o of withState) {
      if (o.estado === 'omitido' || o.estado === 'cancelado') continue;
      if (new Date(o.scheduledAt).getTime() <= now) continue;
      if (!nextByStep[o.stepKey]) nextByStep[o.stepKey] = o.scheduledAt;
    }
    return res.json({
      campaign: { id: c.id, name: c.name, status: c.status, startAt: c.startAt, endAt: c.endAt, timezone: c.timezone, frecuencia: c.frecuencia, canales: c.canales || [], audienceMode: c.audienceMode || 'dynamic' },
      occurrences: withState.map((o) => ({ ...o, proximaEnSerie: nextByStep[o.stepKey] || null })),
      total: withState.length,
    });
  } catch (e) { return fail(res, e); }
};

// POST /:id/schedule-override — omitir / reprogramar / limpiar una ocurrencia
// FUTURA. Reglas: nunca el pasado, nunca después de endAt, y en campañas
// activas o pausadas (la pausada es la ventana segura de reprogramación).
export const scheduleOverride = async (req, res) => {
  try {
    const c = await getCampaign(req.params.id);
    if (!c) return res.status(404).json({ error: 'No encontrada' });
    try {
      await assertCampaignWritable(c, req);
    } catch (e) {
      return res.status(e.status || 403).json({ error: e.message });
    }
    if (!['activa', 'programada', 'pausada', 'borrador'].includes(c.status)) {
      return res.status(400).json({ error: `En estado ${c.status} no se reprograma.` });
    }
    // En borrador solo se planea (nada enviado aún): se permite omitir y
    // reprogramar futuras; limpiar siempre.
    const { occurrencesForCampaign } = await import('../lib/contentActivationSchedule.js');
    const cycleIndex = Number(req.body.cycleIndex);
    const stepKey = String(req.body.stepKey || '');
    const action = String(req.body.action || '');
    const occ = occurrencesForCampaign(c).find((o) => o.cycleIndex === cycleIndex && o.stepKey === stepKey);
    if (!occ) return res.status(404).json({ error: 'Ocurrencia no encontrada en la proyección.' });
    const now = Date.now();
    if (new Date(occ.scheduledAt).getTime() <= now) {
      return res.status(400).json({ error: 'Solo se modifican ejecuciones futuras.' });
    }
    await ensureContentActivationSchema();
    const { default: db } = await import('../lib/db.js');
    if (action === 'limpiar') {
      await db.query(`DELETE FROM "ContentActivationScheduleOverride" WHERE "campaignId"=$1 AND "cycleIndex"=$2 AND "stepKey"=$3`,
        [c.id, cycleIndex, stepKey]);
      await addEvent({ executionId: 'none', campaignId: c.id, type: 'nota', metadata: { calendario: 'override_limpio', ciclo: cycleIndex, paso: stepKey } }).catch(() => {});
      return ok(res, { cleared: true });
    }
    if (action === 'omitir') {
      await db.query(
        `INSERT INTO "ContentActivationScheduleOverride"(id,"campaignId","cycleIndex","stepKey",action,"newDate",reason,"createdBy")
         VALUES($1,$2,$3,$4,'omitir',NULL,$5,$6)
         ON CONFLICT("campaignId","cycleIndex","stepKey") DO UPDATE SET action='omitir',"newDate"=NULL,reason=$5,"createdAt"=NOW()`,
        [nid('ov_'), c.id, cycleIndex, stepKey, String(req.body.reason || '').slice(0, 300), req.user?.id || null]);
      await addEvent({ executionId: 'none', campaignId: c.id, type: 'nota', metadata: { calendario: 'ocurrencia_omitida', ciclo: cycleIndex, paso: stepKey } }).catch(() => {});
      return ok(res, { omitted: true });
    }
    if (action === 'reprogramar') {
      const nd = new Date(req.body.newDate);
      if (!Number.isFinite(nd.getTime())) return res.status(400).json({ error: 'Indica una fecha válida.' });
      if (nd.getTime() <= now) return res.status(400).json({ error: 'La nueva fecha debe ser futura.' });
      if (c.endAt && nd.getTime() > new Date(c.endAt).getTime()) {
        return res.status(400).json({ error: 'Ninguna ejecución puede quedar después del cierre de la campaña.' });
      }
      await db.query(
        `INSERT INTO "ContentActivationScheduleOverride"(id,"campaignId","cycleIndex","stepKey",action,"newDate",reason,"createdBy")
         VALUES($1,$2,$3,$4,'reprogramar',$5,$6,$7)
         ON CONFLICT("campaignId","cycleIndex","stepKey") DO UPDATE SET action='reprogramar',"newDate"=$5,reason=$6,"createdAt"=NOW()`,
        [nid('ov_'), c.id, cycleIndex, stepKey, nd.toISOString(), String(req.body.reason || '').slice(0, 300), req.user?.id || null]);
      await addEvent({ executionId: 'none', campaignId: c.id, type: 'nota', metadata: { calendario: 'ocurrencia_reprogramada', ciclo: cycleIndex, paso: stepKey, nuevaFecha: nd.toISOString() } }).catch(() => {});
      return ok(res, { rescheduled: true, newDate: nd.toISOString() });
    }
    return res.status(400).json({ error: 'Acción inválida: omitir, reprogramar o limpiar.' });
  } catch (e) { return fail(res, e); }
};

// GET /:id/step-preview?cycleIndex&stepKey — el mensaje EXACTO del paso:
// plantilla vinculada (versión fijada o última) + variables + campaña +
// remitente + destinatario simulado. Email con desktop/mobile (mismo HTML),
// WhatsApp con su representación de mensaje.
export const stepPreview = async (req, res) => {
  try {
    const c = await getCampaign(req.params.id);
    if (!c) return res.status(404).json({ error: 'No encontrada' });
    const grant = await getUserGrant(req).catch(() => ({ isGlobal: true }));
    if (!campaignVisibleToGrant(c, grant)) return res.status(403).json({ error: 'Fuera de tus permisos.' });
    const { occurrencesForCampaign } = await import('../lib/contentActivationSchedule.js');
    const { loadScheduleOverrides } = await import('../lib/contentActivationEngine.js');
    const overrides = await loadScheduleOverrides(c.id);
    const cycleIndex = Number(req.query.cycleIndex ?? 0);
    const stepKey = String(req.query.stepKey || '');
    const occ = occurrencesForCampaign(c, { overrides: [...overrides.values()] })
      .find((o) => o.cycleIndex === cycleIndex && o.stepKey === stepKey);
    if (!occ) return res.status(404).json({ error: 'Ocurrencia no encontrada en la proyección.' });
    const { normalizeFlowSteps } = await import('../lib/contentActivationSpec.js');
    const step = normalizeFlowSteps(c.flowDef).find((s) => s.key === stepKey);
    if (!step) return res.status(404).json({ error: 'Paso no encontrado en el flujo.' });
    const testName = String(req.query.testName || 'Carolina');
    const contact = req.query.contactId ? { name: testName } : null;
    // Remitente + URL como en resolveChannelContent (misma fuente).
    const { resolveSender, resolveFormSlug, formPathFor } = await import('../lib/contentActivationContent.js');
    const { loadSenderContext, publicSiteUrl } = await import('../lib/contentActivationSender.js');
    const senderRef = await resolveSender(c).catch(() => null);
    const senderCtx = await loadSenderContext(senderRef).catch(() => null) || {};
    const formSlug = await resolveFormSlug(c.contributionCampaignId).catch(() => '');
    const formUrl = publicSiteUrl(senderCtx.host || '', formPathFor(formSlug));
    const { getTemplate } = await import('../lib/contentActivationTemplates.js');
    const tpl = occ.templateId ? await getTemplate(occ.templateId, occ.templateVersion ?? null).catch(() => null) : null;
    if (occ.channel === 'email') {
      const { buildFinalEmail } = await import('../lib/contentActivationMail.js');
      const { resolveCampaignVars } = await import('../lib/contentActivationVariables.js');
      const { buildRecipientCtx } = await import('../lib/contentActivationContent.js');
      const recipient = contact
        ? buildRecipientCtx({ name: testName }, c, senderCtx, formUrl)
        : buildRecipientCtx({ name: testName, recipient_name: testName }, c, senderCtx, formUrl);
      const vars = resolveCampaignVars({ recipient, campaign: c, sender: senderCtx, formUrl });
      let subject = '';
      let html = '';
      let renderedFrom = 'paso';
      if (tpl && !tpl.versionMissing) {
        subject = tpl.subject || '';
        renderedFrom = tpl.html ? 'plantilla' : 'plantilla_texto';
        html = tpl.html || (tpl.design && Array.isArray(tpl.design.blocks)
          ? tpl.design.blocks.filter((b) => b && ['heading', 'text', 'button'].includes(b.type) && b.text).map((b) => `<p>${b.text}</p>`).join('')
          : '');
      } else if (step.template) {
        subject = c.name || '';
        html = `<p>${step.template}</p>`;
      }
      const final = buildFinalEmail({
        subject, preheader: tpl?.preheader || '',
        htmlBody: html, footer: [senderCtx.siteName, 'Comunicación gestionada a través de Club Platform for Rotary'].filter(Boolean).join(' · '),
        ctaUrl: formUrl, vars,
      });
      return res.json({
        occurrence: occ,
        channel: 'email', subject: final.subject, html: final.html, text: final.text,
        missing: final.missing, renderedFrom,
        template: tpl ? { id: tpl.id, name: tpl.name, version: tpl.version, status: tpl.status } : null,
        sender: { siteName: senderCtx.siteName || '', logoUrl: senderCtx.logoUrl || '' },
        formUrl,
      });
    }
    const { substituteVars, waTextFallback } = await import('../lib/contentActivationMail.js');
    const { renderWithDefaults, buildCrmScopes } = await import('../lib/contentActivationVariables.js');
    const { buildRecipientCtx } = await import('../lib/contentActivationContent.js');
    const { resolveCampaignVars } = await import('../lib/contentActivationVariables.js');
    const recipient = buildRecipientCtx({ name: testName, recipient_name: testName }, c, senderCtx, formUrl);
    const vars = resolveCampaignVars({ recipient, campaign: c, sender: senderCtx, formUrl });
    const scopes = buildCrmScopes({ contact: { name: testName }, club: {}, districtName: senderCtx.districtName || '', campaign: { name: c.name } });
    const d = tpl && tpl.channel === 'whatsapp' ? (tpl.design || {}) : {};
    const parts = ['headerText', 'body', 'footer'].map((k) => renderWithDefaults(
      String(d[k] || (k === 'body' ? (step.template || '') : '')), { ...scopes, ...vars }));
    return res.json({
      occurrence: occ,
      channel: 'whatsapp',
      headerText: parts[0].text, body: parts[1].text, footer: parts[2].text,
      text: waTextFallback({ headerText: parts[0].text, body: parts[1].text, footer: parts[2].text }),
      missing: [...new Set(parts.flatMap((p) => p.missing))],
      renderedFrom: tpl ? 'plantilla' : 'paso',
      template: tpl ? { id: tpl.id, name: tpl.name, version: tpl.version, status: tpl.status } : null,
      formUrl,
    });
  } catch (e) { return fail(res, e); }
};

export const update = async (req, res) => {
  try {
    const cur = await getCampaign(req.params.id);
    if (!cur) return res.status(404).json({ error: 'No encontrada' });
    const grant = await getUserGrant(req).catch(() => ({ isGlobal: true }));
    if (!campaignVisibleToGrant(cur, grant)) return res.status(403).json({ error: 'Fuera de tus permisos.' });
    try {
      await assertCampaignWritable(cur, req);
    } catch (e) {
      return res.status(e.status || 403).json({ error: e.message });
    }
    const nextScope = req.body.scopeDef ? normalizeScopeDef(req.body.scopeDef) : cur.scopeDef;
    try {
      await assertScopeAllowed(req, nextScope);
    } catch (e) {
      return res.status(e.status || 403).json({ error: e.message });
    }
    if (!EDITABLE_FULL_STATES.includes(cur.status)) {
      // Regla aditiva: en otros estados solo se permite pausar/finalizar vía transition.
      const fields = cur.status === 'pausada' ? EDITABLE_PAUSADA_FIELDS : EDITABLE_PARTIAL_FIELDS;
      const body = {};
      for (const k of fields) if (req.body[k] !== undefined) body[k] = req.body[k];
      // Vinculación de plantillas (v4.1169): fijar/actualizar templateId +
      // templateVersion por paso NO altera reglas de tiempo ni lo enviado (el
      // tick congela snapshot al enviar), así que se admite en estos estados.
      // Cualquier otro cambio en flowDef se rechaza con 400.
      if (req.body.flowDef !== undefined) {
        const curFlow = Array.isArray(cur.flowDef) ? cur.flowDef : [];
        const nxtFlow = Array.isArray(req.body.flowDef) ? req.body.flowDef : null;
        if (!nxtFlow || nxtFlow.length !== curFlow.length || nxtFlow.some((s, i) => String(s?.key) !== String(curFlow[i]?.key))) {
          return res.status(400).json({ error: 'En este estado el flujo solo admite vincular plantillas (mismos pasos y claves).' });
        }
        body.flowDef = curFlow.map((s, i) => ({
          ...s,
          templateId: nxtFlow[i].templateId ? String(nxtFlow[i].templateId).slice(0, 80) : null,
          templateVersion: Number.isFinite(Number(nxtFlow[i].templateVersion)) ? Number(nxtFlow[i].templateVersion) : null,
        }));
      }
      const merged = shapeActivation({ ...cur, ...body });
      if (merged.startAt && merged.endAt && new Date(merged.endAt) < new Date(merged.startAt)) {
        return res.status(400).json({ error: 'La fecha final no puede ser anterior a la inicial.' });
      }
      const row = await upsertCampaign({ ...cur, ...merged, id: cur.id, status: cur.status }, clubOf(req));
      await addEvent({ executionId: 'none', campaignId: cur.id, type: 'campana_reprogramada', metadata: { by: req.user?.id || null, fields: Object.keys(body) } }).catch(() => {});
      return ok(res, { campaign: row });
    }
    const shaped = shapeActivation({ ...cur, ...req.body, scopeDef: nextScope });
    // Misma vara que al crear: reprogramar no puede dejar fechas invertidas
    // ni campos obligatorios vacíos.
    const v = validateActivation({ ...shaped, contributionCampaignId: shaped.contributionCampaignId || cur.contributionCampaignId });
    if (!v.ok) return res.status(400).json({ error: v.errors[0], errors: v.errors });
    try {
      const sender = await resolveSenderForWrite(req, { ...req.body, scopeDef: nextScope }, cur);
      if (sender !== undefined) shaped.senderSiteId = sender;
    } catch (e) {
      return res.status(e.status || 403).json({ error: e.message });
    }
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
    try {
      await assertCampaignWritable(cur, req);
    } catch (e) {
      return res.status(e.status || 403).json({ error: e.message });
    }
    const to = String(req.body.status || '');
    if (!canTransitionActivation(cur.status, to)) return res.status(400).json({ error: `Transición ${cur.status} → ${to} no permitida` });
    // Activar exige dependencias completas: nunca activar en silencio una incompleta.
    if (to === 'activa') {
      const { resolveFormSlug } = await import('../lib/contentActivationContent.js');
      const formSlug = await resolveFormSlug(cur.contributionCampaignId).catch(() => '');
      let recipientCount = 0;
      try {
        if (cur.audienceMode === 'fixed' && Array.isArray(cur.audienceSnapshot)) {
          recipientCount = cur.audienceSnapshot.length;
        } else {
          const p = await previewAudience(clubOf(req), cur.audienceDef || {}, {
            limit: 2000, previewSize: 1, scopeDef: cur.scopeDef,
            excludedContactIds: cur.excludedContactIds || [], manualRecipients: cur.manualRecipients || [],
          });
          recipientCount = p.estimada || 0;
        }
      } catch { /* checklist dirá destinatarios */ }
      const check = readinessCheck(cur, { recipientCount, formSlug });
      if (!check.ok) {
        return res.status(400).json({
          error: `Falta completar: ${check.items.filter((i) => !i.ok).map((i) => i.label).join(', ')}`,
          missing: check.items.filter((i) => !i.ok),
        });
      }
    }
    // IA nunca auto-activa: si la campaña nació del asistente exige revisión explícita.
    const row = await setCampaignStatus(cur.id, to);
    await addEvent({ executionId: 'none', campaignId: cur.id, type: transitionEventType(cur.status, to), metadata: { from: cur.status, to, by: req.user?.id || null } }).catch(() => {});
    if (to === 'activa') {
      // Idempotente: reutiliza la ejecución programada/activa vigente en vez de
      // crear una duplicada, e inscribe sin duplicar (ON CONFLICT).
      const exec = await ensureExecutionFor(row);
      await enrollExecution(row, exec).catch(() => {});
    }
    return ok(res, { campaign: row });
  } catch (e) { return fail(res, e); }
};

// ── Duplicar: nace como borrador con la configuración, sin historial ────
// Las ejecuciones/inscripciones/eventos NO se copian: el historial pertenece a
// la campaña original y duplicarlo partiría la auditoría en dos.
export const duplicate = async (req, res) => {
  try {
    const cur = await getCampaign(req.params.id);
    if (!cur) return res.status(404).json({ error: 'No encontrada' });
    try {
      await assertCampaignWritable(cur, req);
    } catch (e) {
      return res.status(e.status || 403).json({ error: e.message });
    }
    const shaped = shapeActivation({ ...cur, scopeDef: cur.scopeDef });
    try {
      await assertScopeAllowed(req, shaped.scopeDef);
    } catch (e) {
      return res.status(e.status || 403).json({ error: e.message });
    }
    const row = await upsertCampaign({
      ...shaped,
      name: duplicateName(cur.name),
      startAt: shaped.startAt, endAt: shaped.endAt,
      audienceSnapshot: null, savedSegmentId: null,
      status: 'borrador', createdBy: req.user?.id || null,
    }, clubOf(req));
    await addEvent({ executionId: 'none', campaignId: row.id, type: 'campana_duplicada', metadata: { duplicadaDe: cur.id, by: req.user?.id || null } }).catch(() => {});
    return res.status(201).json({ ok: true, campaign: row, duplicadaDe: cur.id });
  } catch (e) { return fail(res, e); }
};

// ── Eliminar: confirmación explícita + borrado real o archivado ──────────
// Sin historial (ni ejecuciones, ni inscripciones, ni eventos) se elimina la
// fila. Con historial se ARCHIVA: la auditoría se conserva y la tarjeta deja
// de operar (el tick solo procesa `activa`). Nada se destruye en silencio.
export const remove = async (req, res) => {
  try {
    const cur = await getCampaign(req.params.id);
    if (!cur) return res.status(404).json({ error: 'No encontrada' });
    try {
      await assertCampaignWritable(cur, req);
    } catch (e) {
      return res.status(e.status || 403).json({ error: e.message });
    }
    if (req.body?.confirm !== true) {
      return res.status(400).json({ error: 'Confirma la eliminación enviando { confirm: true }.' });
    }
    const h = await countCampaignHistory(cur.id).catch(() => ({ executions: 0, enrollments: 0, events: 0 }));
    const policy = deletionPolicy({ executions: h.executions, enrollments: h.enrollments });
    if (policy === 'hard') {
      await deleteCampaign(cur.id);
      return ok(res, { deleted: true, policy: 'hard', campaign: { id: cur.id, name: cur.name } });
    }
    if (cur.status === 'archivada') {
      return ok(res, { archived: true, already: true, policy: 'soft', campaign: cur, historial: h });
    }
    if (!canTransitionActivation(cur.status, 'archivada')) {
      return res.status(400).json({ error: `No se puede archivar desde ${cur.status}.` });
    }
    const row = await setCampaignStatus(cur.id, 'archivada');
    await addEvent({ executionId: 'none', campaignId: cur.id, type: 'campana_archivada', metadata: { from: cur.status, by: req.user?.id || null, historial: h } }).catch(() => {});
    return ok(res, { archived: true, policy: 'soft', campaign: row, historial: h });
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
    try {
      await assertCampaignWritable(cur, req);
    } catch (e) {
      return res.status(e.status || 403).json({ error: e.message });
    }
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
      try {
        await assertCampaignWritable(cur, req);
      } catch (e) {
        return res.status(e.status || 403).json({ error: e.message });
      }
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
    try {
      await assertCampaignWritable(cur, req);
    } catch (e) {
      return res.status(e.status || 403).json({ error: e.message });
    }
    const name = String(req.body.name || `Segmento · ${cur.name}`).slice(0, 160);
    const id = nid('sg_');
    await db.query(`CREATE TABLE IF NOT EXISTS "ContentActivationSegment"(id TEXT PRIMARY KEY,"campaignId" TEXT,name TEXT,"scopeDef" JSONB,"audienceDef" JSONB,"createdBy" TEXT,"createdAt" TIMESTAMPTZ DEFAULT NOW())`).catch(() => {});
    await db.query(`INSERT INTO "ContentActivationSegment"(id,"campaignId",name,"scopeDef","audienceDef","createdBy") VALUES($1,$2,$3,$4,$5,$6)`,
      [id, cur.id, name, JSON.stringify(cur.scopeDef || {}), JSON.stringify(cur.audienceDef || {}), req.user?.id || null]).catch(() => {});
    const row = await upsertCampaign({ ...cur, savedSegmentId: id }, clubOf(req));
    return ok(res, { campaign: row, segmentId: id, name });
  } catch (e) { return fail(res, e); }
};

// Enviar prueba: solo al destinatario de prueba, jamás a la audiencia real.
// 1 valida · 2 resuelve plantilla · 3 variables · 4 URL pública · 5 render ·
// 6 envía solo al email de prueba · 7 registra ejecución tipo test.
export const sendTest = async (req, res) => {
  try {
    const cur = await getCampaign(req.params.id);
    if (!cur) return res.status(404).json({ error: 'No encontrada' });
    try {
      await assertCampaignWritable(cur, req);
    } catch (e) {
      return res.status(e.status || 403).json({ error: e.message });
    }
    const channel = req.body.channel === 'whatsapp' ? 'whatsapp' : 'email';
    const { resolveChannelContent, whatsappStatus } = await import('../lib/contentActivationContent.js');
    if (channel === 'whatsapp') {
      const to = String(req.body.phone || req.body.email || '');
      if (!to) return res.status(400).json({ error: 'Indica un teléfono o email para identificar la prueba de WhatsApp.' });
      const resolved = await resolveChannelContent(cur, 'whatsapp', { testEmail: String(req.body.email || ''), testName: String(req.body.testName || '') });
      const wa = await whatsappStatus(clubOf(req)).catch(() => ({ operative: false, reason: '' }));
      await addEvent({
        executionId: 'none', campaignId: cur.id, type: 'nota', channel: 'whatsapp',
        metadata: {
          test: true, to: to.slice(0, 60), campaign_id: cur.id, scope: cur.scopeDef,
          channel: 'whatsapp', execution: 'test',
          delivery_status: wa.operative ? 'test_validated' : 'test_pending_integration',
          whatsappOperative: wa.operative, sent_at: new Date().toISOString(),
        },
      }).catch(() => {});
      // WhatsApp no envía reales desde aquí: devuelve el mensaje renderizado y el
      // estado de la integración para que el admin lo compruebe antes de activar.
      return ok(res, {
        sent: false, channel: 'whatsapp', pendingIntegration: !wa.operative,
        reason: wa.operative ? 'Prueba de WhatsApp validada. El envío masivo lo ejecuta la automatización al activar.' : wa.reason,
        message: resolved.body, formUrl: resolved.formUrl,
      });
    }
    const to = String(req.body.email || '');
    if (!to.includes('@')) return res.status(400).json({ error: 'Email de prueba inválido' });
    const resolved = await resolveChannelContent(cur, 'email', { testEmail: to, testName: String(req.body.testName || '') });
    if (!resolved.subject || !resolved.html) return res.status(400).json({ error: 'La plantilla de email está incompleta (asunto y contenido).' });
    const { default: EmailService } = await import('../services/EmailService.js').catch(() => ({ default: null }));
    if (!EmailService?.sendEmail) return res.status(500).json({ error: 'Proveedor de email no disponible' });
    // Usar el clubId del sitio remitente (sender.siteId), no el clubId del usuario.
    // El remitente ya fue resuelto por resolveChannelContent → resolveSender → loadSenderContext.
    const effectiveClubId = resolved.sender?.siteId || clubOf(req);
    const result = await EmailService.sendEmail({
      clubId: effectiveClubId, to, subject: `[PRUEBA] ${resolved.subject}`,
      html: resolved.html, userId: req.user?.id,
      ...(resolved.fromEmail ? { fromEmail: resolved.fromEmail } : {}),
    }).catch((e) => ({ success: false, error: e?.message || 'Error de envío' }));
    if (!result?.success) {
      await addEvent({
        executionId: 'none', campaignId: cur.id, type: 'nota', channel: 'email',
        metadata: { test: true, to: to.slice(0, 80), campaign_id: cur.id, scope: cur.scopeDef, channel: 'email', execution: 'test', delivery_status: 'test_failed', error: String(result?.error || '').slice(0, 300), sent_at: new Date().toISOString() },
      }).catch(() => {});
      return res.status(502).json({ error: `No se pudo enviar la prueba: ${result?.error || 'fallo del proveedor'}` });
    }
    await addEvent({
      executionId: 'none', campaignId: cur.id, type: 'nota', channel: 'email',
      metadata: { test: true, to: to.slice(0, 80), campaign_id: cur.id, scope: cur.scopeDef, channel: 'email', execution: 'test', delivery_status: 'test_sent', subject: resolved.subject.slice(0, 120), sent_at: new Date().toISOString() },
    }).catch(() => {});
    return ok(res, { sent: true, channel: 'email', subject: resolved.subject, formUrl: resolved.formUrl });
  } catch (e) { return fail(res, e); }
};

// ── Contenido y plantillas por canal (mismo renderer que el envío real) ──
async function resolvePreviewContact(cur, contactId) {
  if (!contactId) return null;
  try {
    if (cur.audienceMode === 'fixed' && Array.isArray(cur.audienceSnapshot)) {
      return cur.audienceSnapshot.find((c) => String(c.contactId) === String(contactId)) || null;
    }
    const p = await previewAudience(null, cur.audienceDef || {}, {
      limit: 2000, previewSize: 500, scopeDef: cur.scopeDef,
      excludedContactIds: cur.excludedContactIds || [], manualRecipients: cur.manualRecipients || [],
    });
    return (p.contactos || []).find((c) => String(c.contactId) === String(contactId)) || null;
  } catch { return null; }
}

export const getContent = async (req, res) => {
  try {
    const cur = await getCampaign(req.params.id);
    if (!cur) return res.status(404).json({ error: 'No encontrada' });
    const grant = await getUserGrant(req).catch(() => ({ isGlobal: true }));
    if (!campaignVisibleToGrant(cur, grant)) return res.status(403).json({ error: 'Fuera de tus permisos.' });
    const { resolveChannelContent, whatsappStatus } = await import('../lib/contentActivationContent.js');
    const testEmail = String(req.query.testEmail || '');
    const testName = String(req.query.testName || '');
    const contact = await resolvePreviewContact(cur, req.query.contactId);
    const opts = contact ? { contact } : { testEmail, testName };
    const [email, whatsapp] = await Promise.all([
      resolveChannelContent(cur, 'email', opts).catch(() => null),
      resolveChannelContent(cur, 'whatsapp', opts).catch(() => null),
    ]);
    const wa = await whatsappStatus(clubOf(req)).catch(() => ({ operative: false, reason: '' }));
    return res.json({
      content: normalizeContentDef(cur.contentDef || {}), email, whatsapp,
      whatsappOperative: wa.operative, whatsappNote: wa.reason || '',
      sender: email?.sender || whatsapp?.sender || null,
      previewAs: contact ? { contactId: contact.contactId, name: contact.name, club: contact.club, rol: contact.rol } : null,
    });
  } catch (e) { return fail(res, e); }
};

export const updateContent = async (req, res) => {
  try {
    const cur = await getCampaign(req.params.id);
    if (!cur) return res.status(404).json({ error: 'No encontrada' });
    try {
      await assertCampaignWritable(cur, req);
    } catch (e) {
      return res.status(e.status || 403).json({ error: e.message });
    }
    if (!['borrador', 'programada'].includes(cur.status)) {
      return res.status(400).json({ error: 'La plantilla solo se edita en borrador o programada. Pausa la campaña para editarla.' });
    }
    // Validación del diseño (v4.1166): variables del catálogo, HTML saneable
    // y campos de WhatsApp dentro de límites del proveedor. Lo desconocido se
    // rechaza con su nombre para que no llegue roto al destinatario.
    // Usa asserts que lanzan (nunca se leen arreglos intermedios): el catch
    // responde 400 con el mensaje.
    try {
      const { assertEmailDesign, assertWhatsAppFields } = await import('../lib/contentActivationMail.js');
      const merged = normalizeContentDef({ ...(cur.contentDef || {}), ...(req.body.contentDef || req.body || {}) });
      assertEmailDesign({ subject: merged.email.subject, preheader: merged.email.preheader, html: merged.email.html });
      assertWhatsAppFields(merged.whatsapp || {});
    } catch (e) {
      if (e.status === 400) return res.status(400).json({ error: e.message });
      throw e;
    }
    const contentDef = normalizeContentDef(req.body.contentDef || req.body || {});
    const patch = { contentDef };
    // El sitio remitente solo lo cambia el operador global, en borrador.
    if (req.body.senderSiteId !== undefined) {
      const grant = await getUserGrant(req).catch(() => ({ isGlobal: true }));
      if (!grant.isGlobal) return res.status(403).json({ error: 'El sitio remitente se asigna automáticamente a tu sitio.' });
      try {
        patch.senderSiteId = await resolveSenderForWrite(req, req.body, cur);
      } catch (e) {
        return res.status(e.status || 403).json({ error: e.message });
      }
    }
    const row = await upsertCampaign({ ...cur, ...patch }, clubOf(req));
    await addEvent({ executionId: 'none', campaignId: cur.id, type: 'nota', metadata: { contentUpdated: true, by: req.user?.id || null } }).catch(() => {});
    return ok(res, { campaign: row });
  } catch (e) { return fail(res, e); }
};

// Sitios remitentes permitidos: automático para sitio, catálogo para global.
export const senderOptions = async (req, res) => {
  try {
    const grant = await getUserGrant(req).catch(() => ({ isGlobal: true }));
    const { deriveSenderFromGrant, loadSenderContext, serializeSenderRef } = await import('../lib/contentActivationSender.js');
    if (grant.isGlobal) {
      const q = String(req.query.search || '');
      const [districts, clubs] = await Promise.all([
        listScopeEntities(req, 'district', q, 20).catch(() => []),
        listScopeEntities(req, 'club', q, 20).catch(() => []),
      ]);
      const options = [
        ...districts.map((d) => ({ ref: `district:${d.id}`, name: d.name, detail: d.detail || 'Distrito' })),
        ...clubs.map((c) => ({ ref: c.id, name: c.name, detail: c.detail || 'Club/Sitio' })),
      ];
      return res.json({ auto: null, options });
    }
    const auto = await deriveSenderFromGrant(grant).catch(() => null);
    const ctx = auto ? await loadSenderContext(auto).catch(() => null) : null;
    return res.json({
      auto: auto ? { ref: serializeSenderRef(auto), name: ctx?.siteName || '', host: ctx?.host || '', logoUrl: ctx?.logoUrl || '' } : null,
      options: [],
    });
  } catch (e) { return fail(res, e); }
};

export const readiness = async (req, res) => {
  try {
    const cur = await getCampaign(req.params.id);
    if (!cur) return res.status(404).json({ error: 'No encontrada' });
    const { resolveFormSlug } = await import('../lib/contentActivationContent.js');
    const formSlug = await resolveFormSlug(cur.contributionCampaignId).catch(() => '');
    let recipientCount = 0;
    try {
      if (cur.audienceMode === 'fixed' && Array.isArray(cur.audienceSnapshot)) {
        recipientCount = cur.audienceSnapshot.length;
      } else {
        const p = await previewAudience(clubOf(req), cur.audienceDef || {}, {
          limit: 2000, previewSize: 1, scopeDef: cur.scopeDef,
          excludedContactIds: cur.excludedContactIds || [], manualRecipients: cur.manualRecipients || [],
        });
        recipientCount = p.estimada || 0;
      }
    } catch { /* checklist lo refleja */ }
    const check = readinessCheck(cur, { recipientCount, formSlug });
    return res.json({ ...check, recipientCount, formSlug });
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
    try {
      await assertCampaignWritable(c, req);
    } catch (e) {
      return res.status(e.status || 403).json({ error: e.message });
    }
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
    const en = await getEnrollment(req.params.enrollmentId);
    if (!en) return res.status(404).json({ error: 'Inscripción no encontrada' });
    const camp = await getCampaign(en.campaignId).catch(() => null);
    if (camp) {
      try {
        await assertCampaignWritable(camp, req);
      } catch (e) {
        return res.status(e.status || 403).json({ error: e.message });
      }
    }
    await db.query(`UPDATE "ContentActivationEnrollment" SET status='pausada',"updatedAt"=NOW() WHERE id=$1`, [req.params.enrollmentId]);
    return ok(res, {});
  } catch (e) { return fail(res, e); }
};

export const retryEnrollment = async (req, res) => {
  try {
    await ensureContentActivationSchema();
    const en = await getEnrollment(req.params.enrollmentId);
    if (!en) return res.status(404).json({ error: 'Inscripción no encontrada' });
    const camp = await getCampaign(en.campaignId).catch(() => null);
    if (camp) {
      try {
        await assertCampaignWritable(camp, req);
      } catch (e) {
        return res.status(e.status || 403).json({ error: e.message });
      }
    }
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
    if (camp) {
      try {
        await assertCampaignWritable(camp, req);
      } catch (e) {
        return res.status(e.status || 403).json({ error: e.message });
      }
    }
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
    try {
      await assertCampaignWritable(c, req);
    } catch (e) {
      return res.status(e.status || 403).json({ error: e.message });
    }
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
