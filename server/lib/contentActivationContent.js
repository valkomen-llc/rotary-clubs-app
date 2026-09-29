// Contenido y plantillas de Campañas de Contenido (v4.1131).
// Resuelve formulario/CTA, branding y variables sin crear un segundo mailing:
// el envío usa EmailService existente; WhatsApp solo previsualiza hasta que su
// integración esté operativa.
import db from './db.js';
import { normalizeContentDef, defaultContentDef, renderContentVars } from './contentActivationSpec.js';

export async function resolveFormSlug(contributionCampaignId) {
  if (!contributionCampaignId) return '';
  try {
    const { rows } = await db.query(`SELECT slug FROM "ContributionCampaign" WHERE id=$1 LIMIT 1`, [contributionCampaignId]);
    return rows[0]?.slug || '';
  } catch { return ''; }
}

export function publicFormUrl(baseUrl, formSlug, { token, campaign } = {}) {
  const base = String(baseUrl || '').replace(/\/$/, '');
  const qs = new URLSearchParams();
  if (token) qs.set('ca_token', token);
  if (formSlug && formSlug !== 'rotary-en-accion') qs.set('campaign', formSlug);
  else if (campaign) qs.set('campaign', campaign);
  const q = qs.toString();
  return `${base}/rotary-en-accion${q ? `?${q}` : ''}`;
}

export async function resolveDistrictName(scopeDef) {
  try {
    if (scopeDef?.type === 'district' && scopeDef.ids?.length) {
      const { rows } = await db.query(`SELECT number, name FROM "District" WHERE id=$1 LIMIT 1`, [scopeDef.ids[0]]);
      if (rows[0]) return rows[0].name || (rows[0].number != null ? `Distrito ${rows[0].number}` : '');
    }
  } catch { /* noop */ }
  return '';
}

export function testCtxFor(email, campaign, { districtName = '', formUrl = '' } = {}) {
  const local = String(email || '').split('@')[0].replace(/[._-]+/g, ' ').trim();
  const name = local ? local.replace(/\b\w/g, (c) => c.toUpperCase()) : 'Amigo rotario';
  return {
    recipient_name: name, nombre: name,
    club_name: '', club: '',
    district_name: districtName, distrito: districtName,
    campaign_name: campaign?.name || '', site_name: '',
    form_url: formUrl, formulario_url: formUrl, cta_text: 'Compartir una actividad',
  };
}

// Envuelve el cuerpo HTML del autor con branding institucional mínimo.
export function wrapEmailHtml({ bodyHtml, ctaText, ctaUrl, fromName = '', preheader = '' }) {
  const btn = ctaUrl && ctaText
    ? `<p style="margin:28px 0"><a href="${ctaUrl}" style="display:inline-block;background:#013388;color:#ffffff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold">${ctaText}</a></p>`
    : '';
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${fromName}</title></head>`
    + `<body style="margin:0;background:#f4f6fb;font-family:Arial,Helvetica,sans-serif;color:#1f2a44">`
    + (preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${preheader}</div>` : '')
    + `<div style="max-width:600px;margin:0 auto;background:#ffffff">`
    + `<div style="background:#013388;color:#ffffff;padding:20px 28px;border-bottom:4px solid #E29C00"><div style="font-size:18px;font-weight:bold">${fromName || 'Rotary en Acción'}</div></div>`
    + `<div style="padding:28px">${bodyHtml}${btn}</div>`
    + `<div style="background:#f4f6fb;color:#6b7280;font-size:12px;padding:16px 28px">Puedes volver a utilizar este formulario cada vez que tu club tenga una nueva actividad para compartir.</div>`
    + `</div></body></html>`;
}

// Resuelve el contenido final de un canal para un destinatario de prueba.
export async function resolveChannelContent(campaign, channel, { baseUrl = '', testEmail = '' } = {}) {
  const stored = normalizeContentDef(campaign.contentDef || {});
  const districtName = (await resolveDistrictName(campaign.scopeDef).catch(() => '')) || 'Distrito 4281';
  const formSlug = await resolveFormSlug(campaign.contributionCampaignId);
  const formUrl = publicFormUrl(baseUrl, formSlug, {});
  const defaults = defaultContentDef({ districtName });
  const email = {
    fromEmail: stored.email.fromEmail, fromName: stored.email.fromName || defaults.email.fromName,
    subject: stored.email.subject || defaults.email.subject,
    preheader: stored.email.preheader || defaults.email.preheader,
    bodyHtml: stored.email.bodyHtml || defaults.email.bodyHtml,
    ctaText: stored.email.ctaText || defaults.email.ctaText,
    ctaUrl: stored.email.ctaUrl || formUrl,
  };
  const whatsapp = { body: stored.whatsapp.body || defaults.whatsapp.body };
  const ctx = testCtxFor(testEmail, campaign, { districtName, formUrl: channel === 'email' ? email.ctaUrl : formUrl });
  if (channel === 'email') {
    const html = wrapEmailHtml({
      bodyHtml: renderContentVars(email.bodyHtml, { ...ctx, cta_text: email.ctaText }).split('{{cta_text}}').join(email.ctaText),
      ctaText: email.ctaText, ctaUrl: renderContentVars(email.ctaUrl, ctx),
      fromName: email.fromName, preheader: renderContentVars(email.preheader, ctx),
    });
    return {
      channel: 'email', formSlug, formUrl, districtName,
      subject: renderContentVars(email.subject, ctx),
      fromEmail: email.fromEmail, fromName: email.fromName,
      preheader: renderContentVars(email.preheader, ctx),
      ctaText: email.ctaText, ctaUrl: renderContentVars(email.ctaUrl, ctx),
      html, isDefault: !stored.email.subject && !stored.email.bodyHtml,
    };
  }
  return {
    channel: 'whatsapp', formSlug, formUrl, districtName,
    body: renderContentVars(whatsapp.body, ctx),
    isDefault: !stored.whatsapp.body,
  };
}

// ¿WhatsApp operativo para este club? Solo lectura: no envía nada.
export async function whatsappStatus(clubId) {
  try {
    const { rows } = await db.query(
      `SELECT id, enabled FROM "WhatsAppConfig" WHERE "clubId"=$1 LIMIT 1`, [clubId]).catch(() => ({ rows: [] }));
    if (rows[0]?.enabled) return { operative: true, reason: '' };
    const c = await db.query(
      `SELECT id FROM "WhatsAppConnection" WHERE "clubId"=$1 LIMIT 1`, [clubId]).catch(() => ({ rows: [] }));
    if ((c.rows || []).length) return { operative: true, reason: '' };
  } catch { /* tablas ausentes */ }
  return { operative: false, reason: 'Canal pendiente de integración: puedes configurar, guardar y previsualizar la plantilla, pero aún no envía mensajes reales.' };
}
