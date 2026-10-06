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
  if (k.includes('.')) {
    const [scope, ...rest] = k.split('.');
    const key = rest.join('.');
    const fields = VARIABLE_SCOPES[scope];
    if (fields && (fields.includes(key) || fields.includes('*'))) return k;
  }
  return VARIABLE_ALIASES[k] || null;
};

// Ámbitos con notación de punto (p. ej. `{{contact.first_name}}`,
// `{{club.name}}`). `*` = cualquier clave del ámbito.
export const VARIABLE_SCOPES = {
  contact: ['first_name', 'last_name', 'email', 'phone', 'company', 'city', 'country'],
  club: ['name', 'city', 'country'],
  district: ['name'],
  campaign: ['name', 'url'],
};

/** Todos los {{…}} mencionados en un texto. */
export const findMentionedVars = (text) => {
  const out = [];
  const re = /\{\{\s*([a-zA-Z0-9_áéíóúñü.]+)(?:\s*\|\s*([^}]*))?\s*\}\}/g;
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

// ─── Ámbitos CRM + render con `|default` (v4.1167) ─────────────────────
//
// `scopes = { contact: {...}, club: {...}, district: {...}, campaign: {...} }`.
// Soporta `{{contact.first_name}}`, `{{club.name}}` y valor por defecto
// `{{contact.first_name|Amigo}}`. Las planas históricas (`{{club_name}}`)
// siguen resolviéndose igual que antes.

/** Construye los ámbitos desde un contacto CRM, su club y la campaña. */
export function buildCrmScopes({ contact = {}, club = {}, districtName = '', campaign = {} } = {}) {
  const firstName = String(contact.firstName || contact.name || '').trim().split(/\s+/).filter(Boolean)[0]
    || String(contact.name || '').trim().split(/\s+/).filter(Boolean)[0] || '';
  const lastName = String(contact.lastName || '').trim()
    || String(contact.name || '').trim().split(/\s+/).filter(Boolean).slice(1).join(' ');
  return {
    contact: {
      first_name: firstName,
      last_name: lastName,
      email: String(contact.email || '').trim(),
      phone: String(contact.phone || '').trim(),
      company: String(contact.company || contact.organizacion || '').trim(),
      city: String(contact.city || '').trim(),
      country: String(contact.country || '').trim(),
    },
    club: {
      name: String(club.name || contact.club || '').trim(),
      city: String(club.city || '').trim(),
      country: String(club.country || '').trim(),
    },
    district: { name: String(districtName || contact.distrito || contact.district || '').trim() },
    campaign: {
      name: String(campaign.name || '').trim(),
      url: String(campaign.url || campaign.formUrl || '').trim(),
    },
  };
}

const escHtml = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Resuelve una ruta `ámbito.clave` contra los ámbitos. */
export function resolveDottedVar(path, scopes = {}) {
  const [scope, ...rest] = String(path || '').split('.');
  const key = rest.join('.');
  const table = scopes[scope];
  if (table && typeof table === 'object' && key in table) {
    return { found: true, value: table[key] };
  }
  return { found: false, value: '' };
}

/**
 * Renderiza un texto resolviendo `{{planas}}`, `{{a.b}}` y `{{x|Por defecto}}`.
 * Los valores se escapan para HTML. Lo desconocido se conserva literal y se
 * reporta en `missing` (nunca se inventa ni se borra en silencio).
 */
export function renderWithDefaults(text, scopes = {}, { escape = true } = {}) {
  const missing = [];
  const out = String(text ?? '').replace(/\{\{\s*([a-zA-Z0-9_áéíóúñü.]+)(?:\s*\|\s*([^}]*))?\s*\}\}/g, (m, name, def) => {
    const k = String(name || '').trim();
    const porDefecto = def !== undefined ? String(def).trim() : undefined;
    let found = false;
    let value = '';
    if (k.includes('.')) {
      const canon = canonicalVar(k);
      if (!canon) {
        // Nombre fuera de catálogo: se conserva literal para no romper el mensaje.
        if (porDefecto !== undefined && porDefecto !== '') return escape ? escHtml(porDefecto) : porDefecto;
        missing.push(k);
        return m;
      }
      const [scope, ...rest] = k.split('.');
      const key = rest.join('.');
      const table = scopes[scope];
      const v = table && typeof table === 'object' ? table[key] : undefined;
      const s = v === undefined || v === null ? '' : String(v);
      if (!s && porDefecto !== undefined && porDefecto !== '') return escape ? escHtml(porDefecto) : porDefecto;
      if (!s) { missing.push(k); return ''; }
      return escape ? escHtml(s) : s;
    } else {
      const canon = canonicalVar(k);
      if (canon) {
        const flat = {
          recipient_name: scopes?.contact?.first_name ?? scopes?.recipient_name,
          nombre: scopes?.contact?.first_name ?? scopes?.nombre,
          nombre_contacto: scopes?.contact?.first_name,
          club_name: scopes?.club?.name ?? scopes?.club_name,
          nombre_club: scopes?.club?.name,
          club: scopes?.club?.name ?? scopes?.club,
          district_name: scopes?.district?.name ?? scopes?.district_name,
          distrito: scopes?.district?.name,
          campaign_name: scopes?.campaign?.name ?? scopes?.campaign_name,
          nombre_campaña: scopes?.campaign?.name,
          nombre_campana: scopes?.campaign?.name,
          form_url: scopes?.campaign?.url ?? scopes?.form_url,
          url_rotary_en_accion: scopes?.campaign?.url,
          formulario_url: scopes?.campaign?.url ?? scopes?.form_url,
          site_name: scopes?.site_name,
          fecha: scopes?.fecha,
        };
        if (canon in flat) {
          found = flat[canon] !== undefined && flat[canon] !== null && String(flat[canon]) !== '';
          value = flat[canon] ?? '';
        } else if (VARIABLE_IDS.includes(canon)) {
          found = false;
          value = '';
        }
      }
    }
    if (!found && porDefecto !== undefined && porDefecto !== '') return escape ? escHtml(porDefecto) : porDefecto;
    if (!found) { missing.push(k); return m; }
    const s = String(value ?? '');
    if (!s && porDefecto !== undefined && porDefecto !== '') return escape ? escHtml(porDefecto) : porDefecto;
    if (!s) { missing.push(k); return ''; }
    return escape ? escHtml(s) : s;
  });
  return { text: out, missing: [...new Set(missing)] };
}

export default {
  VARIABLE_CATALOG, VARIABLE_IDS, VARIABLE_ALIASES, VARIABLE_SCOPES, canonicalVar,
  findMentionedVars, findUnknownVars, resolveCampaignVars, TEST_RECIPIENT, testVars,
  buildCrmScopes, resolveDottedVar, renderWithDefaults,
};
