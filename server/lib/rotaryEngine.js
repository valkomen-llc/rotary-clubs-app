// Motor Rotary en Acción (v4.1118): contexto, duplicados, clasificación IA,
// completitud y notificación al remitente. Todo best-effort: ningún fallo
// tumba el envío ni la publicación.
import db from './db.js';
import { ensureRotaryEnAccionSchema } from './ensureRotaryEnAccionSchema.js';
import { completenessScore } from './rotaryTaxonomySpec.js';
import { logEvent } from './contentSubmissionStore.js';

export async function universalCampaignId() {
  await ensureRotaryEnAccionSchema();
  const { rows } = await db.query(
    `SELECT id FROM "ContributionCampaign" WHERE slug='rotary-en-accion' OR id='rotary-en-accion-universal' LIMIT 1`);
  return rows[0]?.id || 'rotary-en-accion-universal';
}

export async function campaignBySlugOrId(ref) {
  if (!ref) return null;
  await ensureRotaryEnAccionSchema();
  const { rows } = await db.query(
    `SELECT * FROM "ContributionCampaign" WHERE slug=$1 OR id=$1 LIMIT 1`, [String(ref)]);
  return rows[0] || null;
}

// Contexto: campaña y/o taxonomías por slug. Lo inválido se ignora (no se inventa).
export async function resolveContext({ campaign, topic, program, area, ref } = {}) {
  const camp = (await campaignBySlugOrId(campaign || ref).catch(() => null))
    || (campaign || ref ? null : await campaignBySlugOrId('rotary-en-accion').catch(() => null));
  const tax = {};
  for (const [kind, slug] of [['tema', topic], ['programa', program], ['area', area]]) {
    if (!slug) continue;
    const { rows } = await db.query(
      `SELECT slug, name FROM "RotaryTaxonomy" WHERE kind=$1 AND slug=$2 AND active=TRUE LIMIT 1`,
      [kind, String(slug).toLowerCase()]).catch(() => ({ rows: [] }));
    if (rows[0]) tax[kind] = rows[0];
  }
  return { mode: camp && camp.slug !== 'rotary-en-accion' ? 'campaign' : 'universal', campaign: camp, tax };
}

// ─── Duplicados: misma actividad reportada dos veces ────────────────────
// Marca "Posible solicitud relacionada", nunca elimina ni bloquea.
export async function findDuplicates({ excludeId, clubText, clubKeys = [], activityDate, title, city, campaignId, windowDays = 90, limit = 5 }) {
  try {
    await ensureRotaryEnAccionSchema();
    const conds = [`s.id <> $1`];
    const params = [excludeId];
    const ors = [];
    if (clubText) { params.push(`%${clubText.slice(0, 60)}%`); ors.push(`s.club ILIKE $${params.length}`); }
    for (const k of clubKeys.slice(0, 5)) {
      params.push(k);
      ors.push(`EXISTS (SELECT 1 FROM "ContributionSubmissionClub" cc WHERE cc."submissionId"=s.id AND cc."clubKey"=$${params.length})`);
    }
    if (!ors.length) return [];
    conds.push(`(${ors.join(' OR ')})`);
    if (activityDate && /^\d{4}-\d{2}-\d{2}/.test(activityDate)) {
      params.push(new Date(new Date(activityDate).getTime() - windowDays * 86400000).toISOString());
      params.push(new Date(new Date(activityDate).getTime() + windowDays * 86400000).toISOString());
      conds.push(`(s."activityDate" IS NULL OR s."activityDate"='' OR (s."createdAt" >= $${params.length - 1} AND s."createdAt" <= $${params.length}))`);
    }
    if (title) { params.push(`%${title.slice(0, 50)}%`); conds.push(`(s.title ILIKE $${params.length} OR s.story ILIKE $${params.length})`); }
    params.push(limit);
    const { rows } = await db.query(
      `SELECT s.id, s.title, s.club, s.city, s.status, s."createdAt", c.name AS "campaignName"
       FROM "ContributionSubmission" s LEFT JOIN "ContributionCampaign" c ON c.id=s."campaignId"
       WHERE ${conds.join(' AND ')} ORDER BY s."createdAt" DESC LIMIT $${params.length}`, params);
    return rows;
  } catch { return []; }
}

export async function markDuplicates(submissionId, campaignId, dups) {
  if (!dups?.length) return;
  try {
    await db.query(`UPDATE "ContributionSubmission" SET "linkedSubmissionId"=$2,"duplicateNote"=$3 WHERE id=$1`,
      [submissionId, dups[0].id, `Posible solicitud relacionada: ${dups.length} coincidencia(s)`]);
    await logEvent({ submissionId, campaignId, type: 'duplicada_posible',
      detail: `Posible relacionada con: ${dups.map((d) => d.title || d.id).join(' · ').slice(0, 300)}` });
  } catch { /* noop */ }
}

// ─── Clasificación IA: sugiere, nunca sobrescribe al usuario ────────────
export async function classifyWithAI(submission, { fileCount = 0 } = {}) {
  try {
    const { routeToModel } = await import('./ai-router.js');
    const user = `Título: ${submission.title || ''}\nHistoria: ${(submission.story || submission.description || '').slice(0, 1500)}\nTipo usuario: ${submission.contentType || ''}\nÁrea usuario: ${submission.areaFocus || ''}\nPrograma usuario: ${submission.program || ''}\nFotos: ${fileCount}\n\nDevuelve SOLO JSON: {"tipo":"slug?","area":"slug?","programa":"slug?","tema":"slug?","tags":["..."],"prioridad":"alta|media|baja","formatos":["articulo","reel","redes"],"canales":["web","facebook","x","whatsapp","email"],"potencial":"alto|medio|bajo"}. Usa "" cuando no estés seguro. No inventes datos.`;
    const raw = await routeToModel('gemini-2.5-flash',
      'Clasificas aportes de clubes rotarios. Respondes solo JSON válido, sin texto extra.',
      user, [], { maxTokens: 600 });
    const m = String(raw || '').match(/\{[\s\S]*\}/);
    if (!m) return null;
    const sug = JSON.parse(m[0]);
    const clean = {
      tipo: String(sug.tipo || '').slice(0, 60), area: String(sug.area || '').slice(0, 60),
      programa: String(sug.programa || '').slice(0, 60), tema: String(sug.tema || '').slice(0, 60),
      tags: Array.isArray(sug.tags) ? sug.tags.map((t) => String(t).slice(0, 40)).slice(0, 8) : [],
      prioridad: ['alta', 'media', 'baja'].includes(sug.prioridad) ? sug.prioridad : 'media',
      formatos: Array.isArray(sug.formatos) ? sug.formatos.slice(0, 5) : [],
      canales: Array.isArray(sug.canales) ? sug.canales.slice(0, 5) : [],
      potencial: ['alto', 'medio', 'bajo'].includes(sug.potencial) ? sug.potencial : 'medio',
      at: new Date().toISOString(),
    };
    await db.query(`UPDATE "ContributionSubmission" SET "aiSuggest"=$2,"priority"=COALESCE(NULLIF("priority",''),$3) WHERE id=$1`,
      [submission.id, JSON.stringify(clean), clean.prioridad]).catch(() => {});
    await logEvent({ submissionId: submission.id, campaignId: submission.campaignId, type: 'clasificada_ia',
      detail: `Sugerencia IA: ${[clean.tipo, clean.area, clean.programa].filter(Boolean).join(' · ') || 'sin clasificar'} (prioridad ${clean.prioridad})` }).catch(() => {});
    return clean;
  } catch { return null; }
}

// ─── Completitud administrativa ─────────────────────────────────────────
export async function scoreCompleteness(submission, fileCount, photoRules) {
  try {
    const impact = submission.impact && typeof submission.impact === 'object' ? submission.impact : null;
    const parsed = typeof impact === 'string' ? JSON.parse(impact) : impact;
    const c = completenessScore({
      hasInfo: !!(submission.title && (submission.story || submission.description)),
      photoCount: fileCount, photoRules,
      hasImpact: !!(parsed && Object.keys(parsed).length),
      hasLocation: !!(submission.city || submission.location),
      hasStory: !!((submission.story || '').trim() && (submission.story || '').trim().length >= 60),
    });
    await db.query(`UPDATE "ContributionSubmission" SET completeness=$2 WHERE id=$1`,
      [submission.id, JSON.stringify({ ...c, at: new Date().toISOString() })]).catch(() => {});
    return c;
  } catch { return null; }
}

// Todo lo post-envío que no puede tumbar nada.
export async function postSubmit(submission, { files = [], photoRules, windowDays = 90 } = {}) {
  const out = {};
  try {
    const clubs = await db.query(`SELECT "clubKey" FROM "ContributionSubmissionClub" WHERE "submissionId"=$1`, [submission.id])
      .then((r) => r.rows.map((x) => x.clubKey)).catch(() => []);
    out.duplicates = await findDuplicates({
      excludeId: submission.id, clubText: submission.club, clubKeys: clubs,
      activityDate: submission.activityDate, title: submission.title, city: submission.city,
      campaignId: submission.campaignId, windowDays,
    });
    await markDuplicates(submission.id, submission.campaignId, out.duplicates);
  } catch { /* noop */ }
  try { out.completeness = await scoreCompleteness(submission, files.length, photoRules); } catch { /* noop */ }
  // La clasificación IA corre sin bloquear: si no hay proveedor, simplemente no hay sugerencia.
  classifyWithAI(submission, { fileCount: files.length }).catch(() => {});
  return out;
}

// ─── Aviso al remitente cuando se publica (cierra el ciclo) ─────────────
export async function notifyPublished(submissionId, publicUrl) {
  try {
    await ensureRotaryEnAccionSchema();
    const { rows } = await db.query(`SELECT * FROM "ContributionSubmission" WHERE id=$1`, [submissionId]);
    const s = rows[0];
    if (!s || !s.senderEmail || s.notifiedPublishedAt) return { skipped: true };
    const cfg = await db.query(`SELECT * FROM "RotaryConfig" WHERE id='default'`).then((r) => r.rows[0]).catch(() => null);
    if (cfg && cfg.notifyOnPublish === false) return { skipped: true };
    const { default: EmailService } = await import('../services/EmailService.js');
    await EmailService.sendPlatformEmail({
      to: s.senderEmail,
      subject: `Tu historia ya está publicada — ${s.title || 'Rotary en Acción'}`,
      html: `<p>Gracias por compartir lo que hace tu club.</p><p><strong>${s.title || ''}</strong></p><p><a href="${publicUrl}">Ver publicación</a></p>`,
    });
    await db.query(`UPDATE "ContributionSubmission" SET "notifiedPublishedAt"=NOW() WHERE id=$1`, [submissionId]).catch(() => {});
    await logEvent({ submissionId, campaignId: s.campaignId, type: 'notificada_publicacion', detail: `Aviso enviado a ${s.senderEmail}` }).catch(() => {});
    return { sent: true };
  } catch (e) { return { error: e.message }; }
}
