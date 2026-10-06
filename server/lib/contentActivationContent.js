// Contenido y plantillas de Campañas de Contenido (v4.1133).
// Site-aware: el SITIO remitente aporta nombre, logo, colores, dominio y
// formulario; Club Platform solo orquesta. El email se compone con los
// bloques de notificationTemplate (mismo renderer en vista previa y envío).
// WhatsApp hereda sitio, destinatario y URL.
import db from './db.js';
import { normalizeContentDef, defaultContentDef, renderContentVars } from './contentActivationSpec.js';
import { renderTemplate } from './notificationTemplate.js';
import {
  parseSenderRef, serializeSenderRef, deriveSenderFromScope,
  loadSenderContext, publicSiteUrl,
} from './contentActivationSender.js';
import { getRecentPostsForSite, postPublicUrl } from './contentActivationPosts.js';

export async function resolveFormSlug(contributionCampaignId) {
  try {
    const { rows } = await db.query(`SELECT slug FROM "ContributionCampaign" WHERE id=$1 LIMIT 1`, [contributionCampaignId]);
    return rows[0]?.slug || '';
  } catch { return ''; }
}

// Ruta pública real del formulario + dominio del sitio. Nunca app.* si el
// sitio tiene dominio público válido.
export function formPathFor(formSlug) {
  if (formSlug && formSlug !== 'rotary-en-accion') return `/rotary-en-accion?campaign=${encodeURIComponent(formSlug)}`;
  return '/rotary-en-accion';
}

export async function resolveSender(campaign) {
  const explicit = parseSenderRef(campaign?.senderSiteId);
  if (explicit?.id) return explicit;
  return (await deriveSenderFromScope(campaign?.scopeDef).catch(() => null)) || null;
}

// Contexto de destinatario con fallback seguro: lo que no tiene valor NO se
// dibuja (nada de "()", "undefined" ni placeholders sin resolver en el saludo).
export function buildRecipientCtx(contact = {}, campaign = {}, senderCtx = {}, formUrl = '') {
  const fullName = String(contact.name || contact.recipient_name || '').trim();
  const firstName = fullName.split(/\s+/).filter(Boolean)[0] || '';
  const club = String(contact.club || contact.organizacion || contact.club_name || '').trim();
  const role = String(contact.rol || contact.role || '').trim();
  const district = String(contact.distrito || contact.district || senderCtx.districtName || '').trim();
  const siteName = String(senderCtx.siteName || '').trim();
  const greeting = firstName ? `Hola ${firstName},` : 'Hola,';
  const roleLine = [role, club].filter(Boolean).join(' – ');
  return {
    recipient_name: firstName, nombre: firstName,
    club_name: club, club,
    district_name: district, distrito: district,
    campaign_name: campaign?.name || '', site_name: siteName,
    form_url: formUrl, formulario_url: formUrl,
    greeting, role_line: roleLine,
  };
}

function paragraphsOf(bodyText) {
  return String(bodyText || '').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean).slice(0, 12);
}

// Compone el email con bloques (logo, títulos, párrafos, rejilla, botón, noticias recientes).
// El MISMO objeto alimenta vista previa, prueba y envío real.
export async function renderCampaignEmail({ campaign, senderCtx, formUrl, recipient, content }) {
  const stored = normalizeContentDef(content || campaign?.contentDef || {});
  const siteName = senderCtx.siteName || '';
  const email = {
    fromEmail: stored.email.fromEmail,
    fromName: stored.email.fromName || siteName || campaign?.name || 'Rotary en Acción',
    subject: stored.email.subject,
    preheader: stored.email.preheader,
    bodyText: stored.email.bodyText,
    ctaText: stored.email.ctaText,
    ctaUrl: stored.email.ctaUrl || formUrl,
    showShareGrid: stored.email.showShareGrid !== false,
    showRecentPosts: stored.email.showRecentPosts !== false,
    recentPostsCount: stored.email.recentPostsCount || 4,
  };
  const isDefault = !stored.email.subject && !stored.email.bodyText;
  const dflt = defaultContentDef();
  if (!email.subject) email.subject = dflt.email.subject;
  if (!email.preheader) email.preheader = dflt.email.preheader;
  if (!email.bodyText) email.bodyText = dflt.email.bodyText;
  if (!email.ctaText) email.ctaText = dflt.email.ctaText;

  const vars = {
    recipient_name: recipient.recipient_name, club_name: recipient.club_name,
    district_name: recipient.district_name, campaign_name: recipient.campaign_name,
    form_url: formUrl, site_name: recipient.site_name,
    // Legado:
    nombre: recipient.nombre, club: recipient.club, distrito: recipient.distrito,
    formulario_url: recipient.formulario_url,
  };
  const blocks = [
    { type: 'logo', align: 'left' },
    { type: 'heading', align: 'center', text: campaign?.name || 'Rotary en Acción' },
    { type: 'heading', align: 'left', text: 'Lo que hace tu club merece ser compartido' },
    { type: 'paragraph', text: recipient.greeting },
  ];
  if (recipient.role_line) blocks.push({ type: 'paragraph', text: recipient.role_line });
  for (const p of paragraphsOf(renderContentVars(email.bodyText, vars))) {
    blocks.push({ type: 'paragraph', text: p });
  }
  if (email.showShareGrid) blocks.push({ type: 'sharegrid', title: '¿Qué puedes compartir?' });
  blocks.push({ type: 'button', text: email.ctaText, url: '{{form_url}}' });
  blocks.push({ type: 'paragraph', text: 'Te tomará solo unos minutos. Puedes regresar cada vez que tu club tenga una nueva actividad para compartir.' });

  // Bloque de publicaciones recientes del sitio remitente.
  if (email.showRecentPosts && senderCtx.siteId) {
    const posts = await getRecentPostsForSite(senderCtx.siteId, { limit: email.recentPostsCount });
    if (posts.length > 0) {
      blocks.push({ type: 'heading', align: 'center', text: `Últimas historias de ${siteName}` });
      blocks.push({ type: 'recentposts', posts: posts.map(p => ({
        id: p.id,
        title: p.title,
        image: p.image,
        category: p.category,
        categoryColor: p.categoryColor,
        excerpt: p.excerpt,
        url: postPublicUrl(senderCtx.host, p.slug),
      })) });
    }
  }

  const footerParts = [siteName, 'Comunicación gestionada a través de Club Platform for Rotary'].filter(Boolean);
  const rendered = renderTemplate({
    template: {
      subject: renderContentVars(email.subject, vars),
      preheader: renderContentVars(email.preheader, vars),
      blocks,
    },
    vars,
    identity: {
      fromName: email.fromName,
      logoUrl: senderCtx.logoUrl || '',
      primaryColor: senderCtx.primaryColor || '',
      ctaColor: senderCtx.ctaColor || '',
      footer: footerParts.join(' · '),
    },
  });
  return {
    subject: rendered.subject, html: rendered.html, text: rendered.text,
    missing: rendered.missing, isDefault,
    fromEmail: email.fromEmail, fromName: email.fromName,
    preheader: rendered.subject ? email.preheader : '',
    ctaText: email.ctaText, ctaUrl: renderContentVars(email.ctaUrl, vars),
  };
}

// Resuelve el contenido final de un canal para un destinatario.
export async function resolveChannelContent(campaign, channel, { testEmail = '', testName = '', contact = null } = {}) {
  const senderRef = await resolveSender(campaign).catch(() => null);
  const senderCtx = await loadSenderContext(senderRef).catch(() => null) || {};
  const formSlug = await resolveFormSlug(campaign?.contributionCampaignId);
  const formUrl = publicSiteUrl(senderCtx.host || '', formPathFor(formSlug));
  const districtName = senderCtx.districtName || senderCtx.siteName || '';
  const { resolveCampaignVars } = await import('./contentActivationVariables.js');
  const varsOf = (recipient) => resolveCampaignVars({ recipient, campaign, sender: senderCtx, formUrl });
  if (channel === 'email') {
    const recipient = contact
      ? buildRecipientCtx(contact, campaign, senderCtx, formUrl)
      : buildRecipientCtx({ name: testName, recipient_name: testName }, campaign, senderCtx, formUrl);
    const stored = normalizeContentDef(campaign?.contentDef || {});
    // Ruta diseño (v4.1166): el HTML guardado por el editor es el artefacto
    // final; acá solo se sustituyen variables (escapadas), se sanea y se arma
    // el documento. Preview, prueba y envío pasan por acá: idéntico siempre.
    if (stored.email.design && stored.email.html) {
      const { buildFinalEmail } = await import('./contentActivationMail.js');
      const vars = varsOf(recipient);
      const final = buildFinalEmail({
        subject: stored.email.subject, preheader: stored.email.preheader,
        htmlBody: stored.email.html,
        footer: [senderCtx.siteName, 'Comunicación gestionada a través de Club Platform for Rotary'].filter(Boolean).join(' · '),
        ctaUrl: stored.email.ctaUrl || formUrl, vars,
      });
      const fromName = stored.email.fromName || senderCtx.siteName || campaign?.name || 'Rotary en Acción';
      return {
        channel: 'email', formSlug, formUrl, districtName, sender: senderSummary(senderCtx, senderRef),
        subject: final.subject, html: final.html, text: final.text,
        missing: final.missing, isDefault: false, designMode: 'design',
        fromEmail: stored.email.fromEmail, fromName,
        preheader: final.preheader, ctaText: stored.email.ctaText, ctaUrl: final.ctaUrl,
        template: stored.email.templateId ? { id: stored.email.templateId, version: stored.email.templateVersion } : null,
      };
    }
    // Sin nombre real: no inventar desde el email (eso produjo "Hola Presidente").
    const rendered = await renderCampaignEmail({ campaign, senderCtx, formUrl, recipient, content: campaign?.contentDef });
    return {
      channel: 'email', formSlug, formUrl, districtName, sender: senderSummary(senderCtx, senderRef),
      ...rendered, designMode: 'classic',
      template: stored.email.templateId ? { id: stored.email.templateId, version: stored.email.templateVersion } : null,
    };
  }
  const stored = normalizeContentDef(campaign?.contentDef || {});
  const dflt = defaultContentDef();
  const bodyTpl = stored.whatsapp.body || dflt.whatsapp.body;
  const recipient = contact
    ? buildRecipientCtx(contact, campaign, senderCtx, formUrl)
    : buildRecipientCtx({ name: testName, recipient_name: testName }, campaign, senderCtx, formUrl);
  const vars = varsOf(recipient);
  // Compatibilidad con el comportamiento previo en vista previa: el saludo
  // cae a "hola" y el distrito al del remitente en vez de quedar vacío.
  if (!vars.recipient_name) vars.recipient_name = 'hola';
  if (!vars.district_name) vars.district_name = districtName;
  const { substituteVars, waTextFallback } = await import('./contentActivationMail.js');
  const parts = ['headerText', 'body', 'footer'].map((k) => substituteVars(k === 'body' ? bodyTpl : (stored.whatsapp[k] || ''), vars));
  const buttons = (stored.whatsapp.buttons || []).map((b) => {
    const url = substituteVars(b.url || '', vars);
    const label = substituteVars(b.label || '', vars);
    return { type: b.type, label: label.text, url: b.type === 'url' ? url.text : undefined, missing: [...label.missing, ...url.missing] };
  });
  const missing = [...new Set([...parts.flatMap((p) => p.missing), ...buttons.flatMap((b) => b.missing || [])])];
  return {
    channel: 'whatsapp', formSlug, formUrl, districtName, sender: senderSummary(senderCtx, senderRef),
    headerType: stored.whatsapp.headerType || 'none',
    headerText: parts[0].text, mediaUrl: stored.whatsapp.mediaUrl || '',
    body: parts[1].text, footer: parts[2].text, buttons: buttons.map(({ missing, ...b }) => b),
    text: waTextFallback({ headerText: parts[0].text, body: parts[1].text, footer: parts[2].text }),
    missing,
    isDefault: !stored.whatsapp.body && !stored.whatsapp.headerText,
    template: stored.whatsapp.templateId ? { id: stored.whatsapp.templateId, version: stored.whatsapp.templateVersion } : null,
    approvedTemplate: stored.whatsapp.templateName ? { name: stored.whatsapp.templateName, lang: stored.whatsapp.templateLang || 'es' } : null,
  };
}

function senderSummary(senderCtx, senderRef) {
  return {
    ref: senderRef ? serializeSenderRef(senderRef) : null,
    siteName: senderCtx.siteName || '', logoUrl: senderCtx.logoUrl || '',
    host: senderCtx.host || '', contactEmail: senderCtx.contactEmail || '',
    siteId: senderCtx.siteId || null,
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

// Compatibilidad: la URL pública legacy (base de la petición) solo se usa
// cuando el sitio no tiene dominio público válido.
export function publicFormUrl(baseUrl, formSlug, { token, campaign } = {}) {
  const base = String(baseUrl || '').replace(/\/$/, '');
  const qs = new URLSearchParams();
  if (token) qs.set('ca_token', token);
  if (formSlug && formSlug !== 'rotary-en-accion') qs.set('campaign', formSlug);
  else if (campaign) qs.set('campaign', campaign);
  const q = qs.toString();
  return `${base}/rotary-en-accion${q ? `?${q}` : ''}`;
}

// Ya no se usa (el email lo componen los bloques); se conserva para no
// romper importadores externos.
export function testCtxFor(email, campaign, { districtName = '', formUrl = '' } = {}) {
  return buildRecipientCtx({}, campaign, { districtName, siteName: districtName }, formUrl);
}
