// Variables dinámicas de Campañas de Contenido — CRITERIO PURO (v4.1166)
//
// UN solo catálogo para los dos canales y las dos puntas (editor y envío).
// Insertar una variable que no existe deja un marcador roto en el mensaje
// que recibe el club; por eso el editor solo ofrece estas y el servidor las
// valida al guardar (ver `findUnknownVars`).
//
// Convenciones:
//   · canónicas en inglés con guion bajo (las que ya viajan en `contactSnapshot`)
//   · alias en español (los que pide el equipo de contenido)
//   · `fecha` = fecha de generación del mensaje (America/Bogota), documentada
//     acá para que nadie la lea como fecha del evento o del período.

export const VARIABLE_CATALOG = [
  { id: 'recipient_name', label: 'Nombre del contacto', ejemplo: 'Carolina', canales: ['email', 'whatsapp'] },
  { id: 'club_name', label: 'Nombre del club', ejemplo: 'Club Rotario Cali', canales: ['email', 'whatsapp'] },
  { id: 'district_name', label: 'Distrito', ejemplo: 'Distrito 4281', canales: ['email', 'whatsapp'] },
  { id: 'campaign_name', label: 'Nombre de la campaña', ejemplo: 'Rotary en Acción — Participación recurrente', canales: ['email', 'whatsapp'] },
  { id: 'form_url', label: 'URL del formulario (con token)', ejemplo: 'https://rotary4281.org/rotary-en-accion?ca_token=…', canales: ['email', 'whatsapp'] },
  { id: 'site_name', label: 'Sitio remitente', ejemplo: 'Distrito 4281 de Rotary International', canales: ['email', 'whatsapp'] },
  { id: 'fecha', label: 'Fecha de generación del mensaje', ejemplo: '5 de octubre de 2026', canales: ['email', 'whatsapp'] },
];

export const VARIABLE_IDS = VARIABLE_CATALOG.map((v) => v.id);

// Alias en español → canónica. Se resuelven ANTES que las canónicas.
export const VARIABLE_ALIASES = {
  nombre_contacto: 'recipient_name',
  nombre: 'recipient_name',
  nombre_club: 'club_name',
  club: 'club_name',
  distrito: 'district_name',
  nombre_campaña: 'campaign_name',
  nombre_campana: 'campaign_name',
  url_rotary_en_accion: 'form_url',
  formulario_url: 'form_url',
};

export const canonicalVar = (name) => {
  const k = String(name || '').trim();
  if (VARIABLE_IDS.includes(k)) return k;
  return VARIABLE_ALIASES[k] || null;
};

/** Todos los {{…}} mencionados en un texto. */
export const findMentionedVars = (text) => {
  const out = [];
  const re = /\{\{\s*([a-zA-Z0-9_áéíóúñü]+)\s*\}\}/g;
  let m;
  const s = String(text || '');
  while ((m = re.exec(s))) out.push(m[1]);
  return [...new Set(out)];
};

/** Los mencionados que NO existen: lo que rompería el envío. */
export const findUnknownVars = (text) => findMentionedVars(text).filter((v) => !canonicalVar(v));

const fechaHoy = (now = new Date()) => {
  try {
    return new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Bogota' }).format(now);
  } catch { return now.toISOString().slice(0, 10); }
};

/**
 * Valores para un destinatario. `recipient` acepta los aliases de
 * `buildRecipientCtx` y de `contactSnapshot`; lo ausente queda vacío (nunca
 * "undefined" ni "()").
 */
export function resolveCampaignVars({ recipient = {}, campaign = {}, sender = {}, formUrl = '', now = new Date() } = {}) {
  const firstName = String(recipient.recipient_name || recipient.nombre || '').trim().split(/\s+/).filter(Boolean)[0] || '';
  const club = String(recipient.club_name || recipient.club || '').trim();
  const district = String(recipient.district_name || recipient.distrito || sender.districtName || '').trim();
  const site = String(sender.siteName || '').trim();
  return {
    recipient_name: firstName,
    club_name: club,
    district_name: district,
    campaign_name: String(campaign?.name || '').trim(),
    form_url: String(formUrl || ''),
    site_name: site,
    fecha: fechaHoy(now),
  };
}

/** Destinatario de prueba: lo que ve el admin en Vista previa. */
export const TEST_RECIPIENT = {
  recipient_name: 'Carolina',
  nombre: 'Carolina',
  club_name: 'Club Rotario Cali',
  club: 'Club Rotario Cali',
  district_name: 'Distrito 4281',
  distrito: 'Distrito 4281',
};

export function testVars({ campaign = {}, sender = {}, formUrl = '' } = {}) {
  return resolveCampaignVars({
    recipient: TEST_RECIPIENT, campaign, sender, formUrl: formUrl || 'https://rotary4281.org/rotary-en-accion?ca_token=PRUEBA',
  });
}

export default {
  VARIABLE_CATALOG, VARIABLE_IDS, VARIABLE_ALIASES, canonicalVar,
  findMentionedVars, findUnknownVars, resolveCampaignVars, TEST_RECIPIENT, testVars,
};
