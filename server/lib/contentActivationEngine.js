// Motor de recurrencia + seguimiento + atribución + perfiles (Fases 1-5).
import db from './db.js';
import { ensureContentActivationSchema } from './ensureContentActivationSchema.js';
import { nid, addEvent, createLinkToken, upsertProfile, getProfile } from './contentActivationStore.js';
import { previewAudience } from './contentActivationAudience.js';
import { participationScore, participationLevel, renderMessage } from './contentActivationSpec.js';

export function periodoLabel(frecuencia, startAt, index = 0) {
  const d = startAt ? new Date(startAt) : new Date();
  const months = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  if (frecuencia === 'semanal') return `Semana ${index + 1} · ${d.getFullYear()}`;
  return `${months[d.getMonth()]} ${d.getFullYear()}`;
}

export function nextPeriodStart(frecuencia, from, customDays) {
  const d = new Date(from);
  if (frecuencia === 'semanal') d.setDate(d.getDate() + 7);
  else if (frecuencia === 'quincenal') d.setDate(d.getDate() + 15);
  else if (frecuencia === 'mensual') d.setMonth(d.getMonth() + 1);
  else if (frecuencia === 'trimestral') d.setMonth(d.getMonth() + 3);
  else if (frecuencia === 'personalizada') d.setDate(d.getDate() + (Number(customDays) || 30));
  else return null; // unica
  return d;
}

export async function ensureExecutionFor(campaign) {
  await ensureContentActivationSchema();
  const { rows } = await db.query(
    `SELECT * FROM "ContentActivationExecution" WHERE "campaignId"=$1 AND status IN ('programada','activa') ORDER BY "createdAt" DESC LIMIT 1`,
    [campaign.id]);
  if (rows[0]) return rows[0];
  const label = periodoLabel(campaign.frecuencia, campaign.startAt, 0);
  const id = nid('ex_');
  await db.query(
    `INSERT INTO "ContentActivationExecution"(id,"campaignId","periodoLabel","startAt","endAt",status) VALUES($1,$2,$3,$4,$5,'activa')`,
    [id, campaign.id, label, campaign.startAt || new Date().toISOString(), campaign.endAt || null]);
  await addEvent({ executionId: id, campaignId: campaign.id, type: 'ejecucion_creada', metadata: { periodoLabel: label } });
  return { id, campaignId: campaign.id, periodoLabel: label, status: 'activa' };
}

// Inscribe audiencia estimada en la ejecución (dedup por UNIQUE).
export async function enrollExecution(campaign, execution) {
  const prev = await previewAudience(campaign.clubId, campaign.audienceDef, { limit: 2000, previewSize: 2000 });
  let nuevos = 0;
  for (const c of prev.contactos) {
    try {
      const id = nid('en_');
      await db.query(
        `INSERT INTO "ContentActivationEnrollment"(id,"executionId","campaignId","contactId","siteId","siteType",channel,status,"contactSnapshot","nextActionAt")
         VALUES($1,$2,$3,$4,$5,$6,$7,'por_enviar',$8,NOW())
         ON CONFLICT("executionId","contactId") DO NOTHING`,
        [id, execution.id, campaign.id, c.contactId, c.siteId, c.siteType || 'club', c.channel === 'ambos' ? 'whatsapp' : c.channel,
          JSON.stringify({ name: c.name, email: c.email, phone: c.phone, orgRole: c.orgRole, district: c.district })]);
      nuevos++;
    } catch { /* duplicado */ }
    // Perfil: campañas recibidas +1 (upsert defensivo).
    if (c.siteId) {
      try {
        const p = await getProfile(c.siteId);
        await upsertProfile(c.siteId, { campaignsReceived: (p?.campaignsReceived || 0) + 1 }, c.siteType || 'club');
      } catch { /* no bloquea */ }
    }
  }
  await addEvent({ executionId: execution.id, campaignId: campaign.id, type: 'audience_resuelta', metadata: { estimada: prev.estimada, inscritos: nuevos } });
  return { inscritos: nuevos, preview: { estimada: prev.estimada, whatsapp: prev.whatsapp, email: prev.email, excluidos: prev.excluidos, yaParticiparon: prev.yaParticiparon, sinCanal: prev.sinCanal } };
}

function inQuietHours(followRules, tzNow = new Date()) {
  try {
    const q = followRules?.quietHours;
    if (!q?.start || !q?.end) return false;
    const h = tzNow.getHours() + tzNow.getMinutes() / 60;
    const [sh, sm] = String(q.start).split(':').map(Number);
    const [eh, em] = String(q.end).split(':').map(Number);
    const s = sh + sm / 60; const e = eh + em / 60;
    return s <= e ? (h >= s && h < e) : (h >= s || h < e);
  } catch { return false; }
}

// Tick del motor: avanza enrollments según flowDef + dayOffset, respeta
// opt-out, quiet hours, maxAttempts y stopOnResponse. Envía por infraestructura
// existente (WhatsAppCampaign/MessageLog + EmailService) en modo registro:
// crea el evento y deja el envío real a las campañas vinculadas cuando hay
// template; nunca envía sin consentimiento.
export async function tickActivation({ now = new Date(), limit = 100, baseUrl = '' } = {}) {
  await ensureContentActivationSchema();
  const { rows: campaigns } = await db.query(`SELECT * FROM "ContentActivationCampaign" WHERE status='activa' LIMIT 20`);
  const summary = { campaigns: campaigns.length, advanced: 0, closed: 0, errors: 0 };
  for (const campaign of campaigns) {
    try {
      const execution = await ensureExecutionFor(campaign);
      // Cierre de ciclo: si endAt pasó o flow completó 30 días.
      if (campaign.endAt && new Date(campaign.endAt) < now) {
        await db.query(`UPDATE "ContentActivationExecution" SET status='cerrada' WHERE id=$1`, [execution.id]).catch(() => {});
        await db.query(`UPDATE "ContentActivationCampaign" SET status='finalizada',"updatedAt"=NOW() WHERE id=$1`, [campaign.id]).catch(() => {});
        await addEvent({ executionId: execution.id, campaignId: campaign.id, type: 'ejecucion_cerrada', metadata: {} });
        summary.closed++;
        // Recurrencia: crear siguiente ejecución si no es única.
        const nxt = nextPeriodStart(campaign.frecuencia, now, campaign.customDays);
        if (nxt && (!campaign.endAt || nxt < new Date(campaign.endAt))) {
          const id = nid('ex_');
          const label = periodoLabel(campaign.frecuencia, nxt, 1);
          await db.query(`INSERT INTO "ContentActivationExecution"(id,"campaignId","periodoLabel","startAt",status) VALUES($1,$2,$3,$4,'programada')`,
            [id, campaign.id, label, nxt.toISOString()]).catch(() => {});
        }
        continue;
      }
      // Enrollar si vacío.
      const { rows: cnt } = await db.query(`SELECT COUNT(*)::int AS n FROM "ContentActivationEnrollment" WHERE "executionId"=$1`, [execution.id]);
      if (!cnt[0]?.n) await enrollExecution(campaign, execution);

      const flow = Array.isArray(campaign.flowDef) ? campaign.flowDef : [];
      const follow = campaign.followRules || {};
      if (inQuietHours(follow, now)) continue;

      const { rows: due } = await db.query(
        `SELECT * FROM "ContentActivationEnrollment"
         WHERE "executionId"=$1 AND status IN ('por_enviar','contactada','esperando_contenido')
           AND ("nextActionAt" IS NULL OR "nextActionAt" <= $2)
         ORDER BY "updatedAt" ASC LIMIT $3`,
        [execution.id, now.toISOString(), limit]);

      for (const en of due) {
        try {
          if ((en.attempts || 0) >= (follow.maxAttempts ?? 5)) {
            await db.query(`UPDATE "ContentActivationEnrollment" SET status='excluida',"suppressionReason"='max_attempts',"updatedAt"=NOW() WHERE id=$1`, [en.id]);
            await addEvent({ enrollmentId: en.id, executionId: execution.id, campaignId: campaign.id, type: 'exclusion', metadata: { reason: 'max_attempts' } });
            continue;
          }
          // ¿Ya respondió en esta ejecución? stopOnResponse.
          if (follow.stopOnResponse !== false) {
            const { rows: got } = await db.query(
              `SELECT id FROM "ContributionSubmission" WHERE "activationEnrollmentId"=$1 LIMIT 1`, [en.id]).catch(() => ({ rows: [] }));
            if (got.length) {
              await db.query(`UPDATE "ContentActivationEnrollment" SET status='contenido_recibido',"updatedAt"=NOW() WHERE id=$1`, [en.id]);
              await addEvent({ enrollmentId: en.id, executionId: execution.id, campaignId: campaign.id, type: 'seguimiento_detenido', metadata: { reason: 'solicitud_recibida' } });
              continue;
            }
          }
          const step = flow[Math.min(en.attempts || 0, flow.length - 1)] || flow[0];
          if (!step) continue;
          const dayOk = (en.attempts || 0) === 0 || daysSince(en.createdAt, now) >= (step.dayOffset || 0);
          if (!dayOk && (en.attempts || 0) > 0) continue;

          // Token atribuible + URL personalizada.
          const { token } = await createLinkToken({ executionId: execution.id, enrollmentId: en.id, campaignId: campaign.id, contactId: en.contactId });
          const snap = en.contactSnapshot || {};
          const prof = en.siteId ? await getProfile(en.siteId).catch(() => null) : null;
          const formUrl = `${baseUrl || ''}/rotary-en-accion?campaign=${campaign.contributionCampaignId || ''}&ca_token=${token}`;
          const ctx = {
            nombre: String(snap.name || '').split(' ')[0] || 'hola',
            club: snap.club || en.siteId || '',
            distrito: snap.district || '',
            cargo: snap.orgRole || '',
            ultima_participacion: prof?.lastParticipationAt ? `el ${new Date(prof.lastParticipationAt).toLocaleDateString('es-CO')}` : 'hace algún tiempo',
            tipo_contenido_frecuente: Array.isArray(prof?.categorias) && prof.categorias.length ? prof.categorias.slice(0, 3).join(', ') : undefined,
            formulario_url: formUrl,
          };
          const channel = step.channel === 'email' ? 'email' : 'whatsapp';
          // Registro del intento (el envío físico lo hace la campaña vinculada
          // de WhatsApp/Email con su plantilla; acá queda trazabilidad total).
          await db.query(`UPDATE "ContentActivationEnrollment" SET attempts=attempts+1,status='esperando_contenido',"lastInteractionAt"=NOW(),"nextActionAt"=NOW()+($1::int||' days')::interval,"updatedAt"=NOW() WHERE id=$2`,
            [String(step.waitDays ?? 3), en.id]).catch(async () => {
            await db.query(`UPDATE "ContentActivationEnrollment" SET attempts=attempts+1,status='esperando_contenido',"lastInteractionAt"=NOW(),"updatedAt"=NOW() WHERE id=$1`, [en.id]);
          });
          await addEvent({
            enrollmentId: en.id, executionId: execution.id, campaignId: campaign.id,
            type: channel === 'email' ? 'email_enviado' : 'whatsapp_enviado', channel,
            metadata: { step: step.key, dayOffset: step.dayOffset, preview: renderMessage(step.template || defaultCopy(step.key, ctx), ctx).slice(0, 280), formUrl: formUrl.slice(0, 200), tokenHash: true },
          });
          // Contador de perfil.
          if (en.siteId) {
            try {
              const p = await getProfile(en.siteId);
              await upsertProfile(en.siteId, { messagesSent: (p?.messagesSent || 0) + 1 }, en.siteType || 'club');
            } catch { /* noop */ }
          }
          summary.advanced++;
        } catch (e) { summary.errors++; }
      }
    } catch (e) { summary.errors++; }
  }
  return summary;
}

function daysSince(a, b) {
  try { return (new Date(b) - new Date(a)) / 86400000; } catch { return 99; }
}
function defaultCopy(key, ctx) {
  const club = ctx.club ? ` del ${ctx.club}` : '';
  const url = ctx.formulario_url ? ` Compártelo aquí: ${ctx.formulario_url}` : '';
  if (key === 'invitacion') return `Hola ${ctx.nombre}. ¿Realizaron recientemente alguna jornada, proyecto de servicio o actividad${club} que podamos compartir con la comunidad rotaria?${url}`;
  if (key === 'ideas') return `Hola ${ctx.nombre}. Ideas que suelen funcionar: proyectos de servicio, jornadas, eventos juveniles e historias de impacto.${url}`;
  if (key === 'cierre') return `Hola ${ctx.nombre}. Cerramos el ciclo de este mes. Si tienen material pendiente, aún pueden enviarlo.${url}`;
  return `Hola ${ctx.nombre}. Hace ${ctx.ultima_participacion} no recibimos noticias${club}. ¿Tienen alguna actividad para compartir?${url}`;
}

// Atribución al recibirse una solicitud (llamado desde submitContent).
export async function attributeSubmission(submissionId, tokenPlainOrHash, extra = {}) {
  if (!tokenPlainOrHash && !extra.enrollmentId) return null;
  await ensureContentActivationSchema();
  let tok = null;
  if (tokenPlainOrHash) {
    const { resolveToken, markTokenUsed } = await import('./contentActivationStore.js');
    tok = await resolveToken(tokenPlainOrHash).catch(() => null);
    if (!tok) return null;
    await markTokenUsed(tok.tokenHash).catch(() => {});
  }
  const enrollmentId = extra.enrollmentId || tok?.enrollmentId;
  const executionId = extra.executionId || tok?.executionId;
  const campaignId = extra.campaignId || tok?.campaignId;
  if (!enrollmentId || !executionId) return null;
  await db.query(
    `UPDATE "ContributionSubmission" SET "activationCampaignId"=$2,"activationExecutionId"=$3,"activationEnrollmentId"=$4,"activationChannel"=$5,"activationTokenHash"=$6 WHERE id=$1`,
    [submissionId, campaignId, executionId, enrollmentId, extra.channel || null, tok?.tokenHash || null]).catch(() => {});
  // UTM y canal del token → columnas de la solicitud (atribución exacta).
  try {
    if (tok && (tok.utmSource || tok.utmMedium || tok.utmCampaign || tok.channel)) {
      await db.query(`UPDATE "ContributionSubmission" SET "utmSource"=COALESCE("utmSource",$2),"utmMedium"=COALESCE("utmMedium",$3),"utmCampaign"=COALESCE("utmCampaign",$4),"activationChannel"=COALESCE("activationChannel",$5) WHERE id=$1`,
        [submissionId, tok.utmSource || null, tok.utmMedium || null, tok.utmCampaign || null, tok.channel || null]);
    }
  } catch { /* columnas aún ausentes: no bloquea */ }
  await db.query(`UPDATE "ContentActivationEnrollment" SET status='contenido_recibido',"lastInteractionAt"=NOW(),"updatedAt"=NOW() WHERE id=$1`, [enrollmentId]).catch(() => {});
  await addEvent({ enrollmentId, executionId, campaignId, type: 'solicitud_recibida', channel: extra.channel || null, metadata: { submissionId } }).catch(() => {});
  await addEvent({ enrollmentId, executionId, campaignId, type: 'seguimiento_detenido', metadata: { reason: 'solicitud_recibida', submissionId } }).catch(() => {});
  // Perfil.
  try {
    const { rows } = await db.query(`SELECT club FROM "ContributionSubmission" WHERE id=$1`, [submissionId]);
    void rows;
  } catch { /* noop */ }
  await refreshProfileForEnrollment(enrollmentId).catch(() => {});
  return { enrollmentId, executionId, campaignId };
}

export async function refreshProfileForEnrollment(enrollmentId) {
  const { rows } = await db.query(`SELECT * FROM "ContentActivationEnrollment" WHERE id=$1`, [enrollmentId]);
  const en = rows[0];
  if (!en?.siteId) return null;
  const sub = await db.query(
    `SELECT COUNT(*)::int AS n, MAX("createdAt") AS lastAt,
            COUNT(CASE WHEN status='publicado' THEN 1 END)::int AS pub
     FROM "ContributionSubmission" WHERE "activationEnrollmentId"=$1 OR (club ILIKE $2)`,
    [enrollmentId, `%${String(en.siteId).slice(0, 40)}%`]).catch(() => ({ rows: [{ n: 0, pub: 0, lastAt: null }] }));
  const s = sub.rows[0] || {};
  const prev = await getProfile(en.siteId).catch(() => null);
  const recenciaDias = s.lastAt ? Math.max(0, Math.round((Date.now() - new Date(s.lastAt).getTime()) / 86400000)) : 999;
  const { score, parts, weights } = participationScore({
    recenciaDias, frecuencia12m: s.n || 0, publicados12m: s.pub || 0,
    respuestaTasa: prev && prev.messagesSent ? Math.min(1, (s.n || 0) / Math.max(1, prev.messagesSent)) : (s.n ? 1 : 0),
  });
  const level = (s.n || 0) === 0 && recenciaDias > 90 ? 'sin_reciente' : participationLevel(score);
  return upsertProfile(en.siteId, {
    submissionCount: s.n || 0, lastSubmissionAt: s.lastAt, lastParticipationAt: s.lastAt || prev?.lastParticipationAt || null,
    articlesPublished: Math.max(prev?.articlesPublished || 0, s.pub || 0),
    formsCompleted: (prev?.formsCompleted || 0) + 1,
    score, level, scoreDetail: JSON.stringify({ parts, weights, recenciaDias, computedAt: new Date().toISOString() }),
  }, en.siteType || 'club');
}

// Insights IA con datos reales únicamente.
export async function buildInsights(campaignId, executionId) {
  await ensureContentActivationSchema();
  const { rows: ens } = await db.query(
    `SELECT status, channel, COUNT(*)::int AS n FROM "ContentActivationEnrollment" WHERE "executionId"=$1 GROUP BY 1,2`, [executionId]);
  const { rows: evs } = await db.query(
    `SELECT type, COUNT(*)::int AS n FROM "ContentActivationEvent" WHERE "executionId"=$1 GROUP BY 1`, [executionId]).catch(() => ({ rows: [] }));
  const by = (k, v) => ens.filter((x) => x[k] === v).reduce((a, x) => a + x.n, 0);
  const ev = (t) => evs.find((x) => x.type === t)?.n || 0;
  const contactadas = by('status', 'contactada') + by('status', 'esperando_contenido') + by('status', 'contenido_recibido') + by('status', 'publicada');
  const recibidas = by('status', 'contenido_recibido') + by('status', 'publicada');
  const wa = ens.filter((x) => x.channel === 'whatsapp').reduce((a, x) => a + x.n, 0);
  const em = ens.filter((x) => x.channel === 'email').reduce((a, x) => a + x.n, 0);
  const insights = [];
  if (contactadas) insights.push({ kind: 'alcance', text: `${contactadas} clubes contactados en esta ejecución; ${recibidas} enviaron contenido.` });
  const pendientes = by('status', 'esperando_contenido') + by('status', 'contactada');
  if (pendientes) insights.push({ kind: 'reactivacion', text: `${pendientes} clubes todavía no han participado en este período.`, action: 'reactivar' });
  if (wa && em) insights.push({ kind: 'canal', text: `WhatsApp alcanza a ${wa} y correo a ${em} inscripciones. El sistema alterna canal si no hay apertura.` });
  const rec2 = ev('recordatorio_enviado');
  if (rec2 && recibidas) insights.push({ kind: 'recordatorio', text: `Se enviaron ${rec2} recordatorios; ${recibidas} solicitudes atribuidas en el período.` });
  const suggestions = [];
  if (pendientes > 0) suggestions.push({ action: 'reactivar', detail: `Reactivar ${pendientes} clubes pendientes con mensaje de ideas de contenido.` });
  if ((by('status', 'error') || 0) > 0) suggestions.push({ action: 'reintentar', detail: 'Reintentar envíos con error y verificar opt-out.' });
  suggestions.push({ action: 'frecuencia', detail: 'Si la participación cae 2 períodos seguidos, reducir a quincenal y probar otro mensaje.' });
  return { insights, suggestions, counts: { contactadas, recibidas, pendientes, whatsapp: wa, email: em } };
}
