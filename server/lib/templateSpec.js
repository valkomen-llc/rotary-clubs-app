// Plantillas de WhatsApp: reglas de Meta, carpetas de la biblioteca y traducción
// al formato que espera la Cloud API.
//
// POR QUÉ ESTE ARCHIVO EXISTE: una plantilla no es un texto nuestro. Es un objeto
// que Meta aprueba o rechaza contra reglas concretas —longitudes, cómo se numeran
// las variables, dónde pueden ir, cuántos botones de cada tipo— y un rechazo no
// es gratis: cuenta contra la calificación de calidad de la cuenta y puede
// terminar limitando cuántos mensajes se pueden enviar por día.
//
// Por eso el redactor con IA no puede limitarse a escribir bonito: lo que
// produzca tiene que pasar por `validateTemplate` ANTES de mandarse. Este archivo
// es el que sabe qué es válido.
//
// Las reglas están tomadas de la documentación de plantillas de la Cloud API. Si
// Meta las cambia, se corrigen ACÁ y no repartidas por el redactor y la UI.

// ── Carpetas de la biblioteca ───────────────────────────────────────────────
// Son las catorce del pedido (§14). NO son la `category` de Meta —que sólo
// admite MARKETING, UTILITY y AUTHENTICATION— sino la organización interna del
// equipo. Se guardan aparte justamente por eso: mezclar las dos cosas obligaría
// a elegir entre organizar el trabajo y decirle a Meta la verdad.
export const TEMPLATE_FOLDERS = [
  { key: 'bienvenida',    label: 'Bienvenida',        emoji: '👋', metaCategory: 'UTILITY',
    hint: 'Primer contacto tras la activación. Confirma que el sitio está listo y entrega el acceso.' },
  { key: 'onboarding',    label: 'Onboarding',        emoji: '🚀', metaCategory: 'UTILITY',
    hint: 'Agendar, confirmar y recordar la sesión inicial.' },
  { key: 'capacitacion',  label: 'Capacitación',      emoji: '🎓', metaCategory: 'UTILITY',
    hint: 'Invitaciones, confirmaciones y seguimiento de las sesiones.' },
  { key: 'marketing',     label: 'Marketing digital', emoji: '📣', metaCategory: 'MARKETING',
    hint: 'Difusión de funcionalidades y buenas prácticas de comunicación.' },
  { key: 'ia',            label: 'Inteligencia Artificial', emoji: '🤖', metaCategory: 'MARKETING',
    hint: 'Generador de publicaciones, Reels y demás herramientas de IA.' },
  { key: 'proyectos',     label: 'Proyectos',         emoji: '🛠️', metaCategory: 'MARKETING',
    hint: 'Publicar, difundir y hacer seguimiento de proyectos del club.' },
  { key: 'fundraising',   label: 'Fundraising',       emoji: '💚', metaCategory: 'MARKETING',
    hint: 'Donaciones, campañas de recaudación y reportes de impacto.' },
  { key: 'crowdfunding',  label: 'Crowdfunding',      emoji: '🤝', metaCategory: 'MARKETING',
    hint: 'Campañas colectivas y avances de meta.' },
  { key: 'ecommerce',     label: 'E-commerce',        emoji: '🛒', metaCategory: 'MARKETING',
    hint: 'Tienda del club, productos y pedidos.' },
  { key: 'eventos',       label: 'Eventos',           emoji: '📅', metaCategory: 'MARKETING',
    hint: 'Convocatorias, inscripciones y recordatorios de eventos.' },
  { key: 'soporte',       label: 'Soporte',           emoji: '🛟', metaCategory: 'UTILITY',
    hint: 'Respuestas a solicitudes técnicas y avisos de resolución.' },
  { key: 'renovacion',    label: 'Renovación',        emoji: '🔄', metaCategory: 'UTILITY',
    hint: 'Preaviso, vencimiento y período de gracia de la suscripción.' },
  { key: 'reactivacion',  label: 'Reactivación',      emoji: '⚡', metaCategory: 'MARKETING',
    hint: 'Recuperar clubes con bajo uso o suspendidos.' },
  { key: 'fidelizacion',  label: 'Fidelización',      emoji: '⭐', metaCategory: 'MARKETING',
    hint: 'Reconocimiento, hitos y seguimiento de largo plazo.' },
];

export const FOLDER_KEYS = TEMPLATE_FOLDERS.map(f => f.key);
const FOLDER_BY_KEY = Object.fromEntries(TEMPLATE_FOLDERS.map(f => [f.key, f]));
export const folderByKey = (k) => FOLDER_BY_KEY[k] || null;
export const folderLabel = (k) => FOLDER_BY_KEY[k]?.label || 'Sin carpeta';
export const isFolder = (k) => Object.prototype.hasOwnProperty.call(FOLDER_BY_KEY, k);

// ── Categorías de Meta ──────────────────────────────────────────────────────
// AUTHENTICATION queda fuera a propósito: es para códigos de un solo uso, tiene
// un formato cerrado que Meta impone y nada de lo que este módulo manda encaja
// ahí. Ofrecerla sólo daría rechazos.
export const META_CATEGORIES = [
  { key: 'UTILITY', label: 'Utilidad',
    description: 'Da seguimiento a algo que el club pidió o acordó: una cita, un vencimiento, una solicitud de soporte.' },
  { key: 'MARKETING', label: 'Marketing',
    description: 'Promoción, novedades e invitaciones. Exige consentimiento explícito y es la categoría más cara.' },
];
export const META_CATEGORY_KEYS = META_CATEGORIES.map(c => c.key);

// ── Límites de Meta ─────────────────────────────────────────────────────────
export const LIMITS = {
  name: 512,
  header: 60,
  body: 1024,
  footer: 60,
  buttonText: 25,
  buttonUrl: 2000,
  buttons: 10,
  urlButtons: 2,
  phoneButtons: 1,
  // Meta permite variables en el encabezado, pero UNA sola y de texto.
  headerVariables: 1,
};

export const BUTTON_TYPES = [
  { key: 'QUICK_REPLY', label: 'Respuesta rápida',
    description: 'El contacto pulsa y su elección llega como un mensaje entrante. Es lo ÚNICO que se puede medir: el clic en un botón de URL Meta no lo reporta.' },
  { key: 'URL', label: 'Enlace',
    description: 'Abre una dirección. Útil, pero el clic no es observable.' },
  { key: 'PHONE_NUMBER', label: 'Llamar',
    description: 'Marca un número.' },
];
export const BUTTON_TYPE_KEYS = BUTTON_TYPES.map(b => b.key);

export const HEADER_TYPES = ['NONE', 'TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT'];

// ── Variables ───────────────────────────────────────────────────────────────
// El texto lleva {{1}}, {{2}}… y el motor las alimenta POSICIONALMENTE. Para que
// un recorrido pueda resolverlas, cada posición se asocia a un token del catálogo
// de `journeySpec.js`. Ese vínculo se guarda en `variableTokens` y es lo que
// permite que la plantilla y el recorrido hablen de lo mismo.
const VARIABLE_RE = /\{\{\s*(\d+)\s*\}\}/g;

export function extractVariables(text) {
  const found = [];
  let m;
  const re = new RegExp(VARIABLE_RE.source, 'g');
  while ((m = re.exec(String(text || ''))) !== null) found.push(Number(m[1]));
  return found;
}

/** Normaliza el nombre al formato que Meta acepta: minúsculas, números y guión bajo. */
export function normalizeTemplateName(raw) {
  return String(raw || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, LIMITS.name) || `plantilla_${Date.now()}`;
}

// ── Validación ──────────────────────────────────────────────────────────────
/**
 * Comprueba una plantilla contra las reglas de Meta.
 *
 * Devuelve { errors, warnings }. Los errores impiden enviarla —Meta la
 * rechazaría—; las advertencias son cosas que pasan pero que conviene mirar.
 *
 * Es una función PURA: la usan el redactor (para reintentar), el servidor (antes
 * de enviar) y la UI (para avisar mientras se edita), y las tres tienen que
 * llegar al mismo veredicto.
 */
export function validateTemplate(t = {}) {
  const errors = [];
  const warnings = [];

  const name = String(t.name || '');
  if (!name) errors.push('La plantilla necesita un nombre.');
  else if (!/^[a-z0-9_]+$/.test(name)) {
    errors.push('El nombre sólo admite minúsculas, números y guión bajo. Meta rechaza cualquier otro carácter.');
  } else if (name.length > LIMITS.name) {
    errors.push(`El nombre supera los ${LIMITS.name} caracteres.`);
  }

  if (!META_CATEGORY_KEYS.includes(String(t.category || '').toUpperCase())) {
    errors.push('La categoría de Meta debe ser UTILITY o MARKETING.');
  }
  if (!t.language) errors.push('Falta el idioma.');

  const body = String(t.bodyText || '');
  if (!body.trim()) errors.push('El cuerpo no puede estar vacío.');
  if (body.length > LIMITS.body) {
    errors.push(`El cuerpo tiene ${body.length} caracteres y el máximo de Meta es ${LIMITS.body}.`);
  }

  // ── Variables del cuerpo ──────────────────────────────────────────────────
  const vars = extractVariables(body);
  if (vars.length) {
    const unique = [...new Set(vars)].sort((a, b) => a - b);
    // Meta exige que sean 1..n sin huecos. Un {{1}} y un {{3}} sin {{2}} se
    // rechaza.
    const expected = unique.map((_, i) => i + 1);
    if (JSON.stringify(unique) !== JSON.stringify(expected)) {
      errors.push(`Las variables deben numerarse 1, 2, 3… sin saltos. Se encontraron: ${unique.join(', ')}.`);
    }
    // No pueden abrir ni cerrar el cuerpo: Meta lo rechaza porque no puede
    // mostrar una vista previa razonable.
    if (/^\s*\{\{\s*\d+\s*\}\}/.test(body)) {
      errors.push('El cuerpo no puede EMPEZAR con una variable. Poné texto antes.');
    }
    if (/\{\{\s*\d+\s*\}\}\s*$/.test(body)) {
      errors.push('El cuerpo no puede TERMINAR con una variable. Poné texto o un signo de puntuación después.');
    }
    // Dos variables pegadas tampoco.
    if (/\{\{\s*\d+\s*\}\}\s*\{\{\s*\d+\s*\}\}/.test(body)) {
      errors.push('No puede haber dos variables seguidas sin texto en medio.');
    }
    const tokens = Array.isArray(t.variableTokens) ? t.variableTokens : [];
    if (tokens.length !== unique.length) {
      errors.push(`El cuerpo usa ${unique.length} variable(s) pero hay ${tokens.length} dato(s) asignado(s). Cada {{n}} necesita saber de dónde sale su valor.`);
    }
  }

  // ── Encabezado ────────────────────────────────────────────────────────────
  const headerType = String(t.headerType || 'NONE').toUpperCase();
  if (!HEADER_TYPES.includes(headerType)) errors.push(`Tipo de encabezado desconocido: ${headerType}.`);
  if (headerType === 'TEXT') {
    const header = String(t.headerContent || '');
    if (!header.trim()) errors.push('El encabezado de texto está vacío.');
    if (header.length > LIMITS.header) {
      errors.push(`El encabezado tiene ${header.length} caracteres y el máximo es ${LIMITS.header}.`);
    }
    if (extractVariables(header).length > LIMITS.headerVariables) {
      errors.push('El encabezado admite como máximo una variable.');
    }
  }

  // ── Pie ───────────────────────────────────────────────────────────────────
  const footer = String(t.footerText || '');
  if (footer.length > LIMITS.footer) {
    errors.push(`El pie tiene ${footer.length} caracteres y el máximo es ${LIMITS.footer}.`);
  }
  if (extractVariables(footer).length) {
    errors.push('El pie no admite variables.');
  }

  // ── Botones ───────────────────────────────────────────────────────────────
  const buttons = Array.isArray(t.buttons) ? t.buttons : [];
  if (buttons.length > LIMITS.buttons) {
    errors.push(`Hay ${buttons.length} botones y el máximo es ${LIMITS.buttons}.`);
  }
  const urlCount = buttons.filter(b => b?.type === 'URL').length;
  const phoneCount = buttons.filter(b => b?.type === 'PHONE_NUMBER').length;
  if (urlCount > LIMITS.urlButtons) errors.push(`Como máximo ${LIMITS.urlButtons} botones de enlace.`);
  if (phoneCount > LIMITS.phoneButtons) errors.push(`Como máximo ${LIMITS.phoneButtons} botón de llamada.`);

  buttons.forEach((b, i) => {
    const n = i + 1;
    if (!BUTTON_TYPE_KEYS.includes(b?.type)) { errors.push(`El botón ${n} tiene un tipo desconocido.`); return; }
    const text = String(b.text || '');
    if (!text.trim()) errors.push(`El botón ${n} no tiene texto.`);
    if (text.length > LIMITS.buttonText) {
      errors.push(`El texto del botón ${n} tiene ${text.length} caracteres y el máximo es ${LIMITS.buttonText}.`);
    }
    if (b.type === 'URL') {
      if (!b.url) errors.push(`El botón ${n} es de enlace y no tiene dirección.`);
      else if (!/^https?:\/\//i.test(b.url)) errors.push(`La dirección del botón ${n} debe empezar por http:// o https://.`);
    }
    if (b.type === 'PHONE_NUMBER' && !b.phoneNumber) {
      errors.push(`El botón ${n} es de llamada y no tiene número.`);
    }
  });

  // ── Advertencias ──────────────────────────────────────────────────────────
  if (String(t.category).toUpperCase() === 'MARKETING') {
    warnings.push('Marketing exige consentimiento explícito del contacto y es la categoría más cara por conversación. Si el mensaje da seguimiento a algo que el club pidió, conviene UTILITY.');
  }
  if (!buttons.some(b => b?.type === 'QUICK_REPLY')) {
    warnings.push('Sin botones de respuesta rápida no se puede medir la reacción: Meta no reporta el clic en un botón de enlace, sólo la respuesta rápida, que llega como mensaje entrante.');
  }
  if (body.length > 700) {
    warnings.push('El cuerpo es largo para WhatsApp. Los mensajes que se leen enteros rara vez pasan de 400 caracteres.');
  }

  return { errors, warnings, ok: errors.length === 0 };
}

// ── Traducción al formato de Meta ───────────────────────────────────────────
/**
 * Arma el payload de `POST /{waba-id}/message_templates`.
 *
 * OJO CON `example`: Meta lo EXIGE en todo componente que tenga variables, y si
 * falta rechaza la plantilla sin explicar bien por qué. Los ejemplos salen de
 * `variableSamples`, que el redactor genera junto con el texto justamente para
 * esto — no son decorativos.
 */
export function toMetaComponents(t = {}) {
  const components = [];
  const headerType = String(t.headerType || 'NONE').toUpperCase();

  if (headerType === 'TEXT' && t.headerContent) {
    const header = { type: 'HEADER', format: 'TEXT', text: t.headerContent };
    const headerVars = extractVariables(t.headerContent);
    if (headerVars.length) {
      header.example = { header_text: [(t.headerSample || 'Club Rotario')] };
    }
    components.push(header);
  } else if (['IMAGE', 'VIDEO', 'DOCUMENT'].includes(headerType)) {
    const header = { type: 'HEADER', format: headerType };
    if (t.headerContent) header.example = { header_url: [t.headerContent] };
    components.push(header);
  }

  const body = { type: 'BODY', text: t.bodyText };
  const bodyVars = [...new Set(extractVariables(t.bodyText))].sort((a, b) => a - b);
  if (bodyVars.length) {
    const samples = Array.isArray(t.variableSamples) ? t.variableSamples : [];
    // Meta espera un array de arrays: una fila de ejemplo por cada variable.
    body.example = { body_text: [bodyVars.map((_, i) => samples[i] || 'ejemplo')] };
  }
  components.push(body);

  if (t.footerText) components.push({ type: 'FOOTER', text: t.footerText });

  const buttons = (Array.isArray(t.buttons) ? t.buttons : []).map(b => {
    if (b.type === 'URL') return { type: 'URL', text: b.text, url: b.url };
    if (b.type === 'PHONE_NUMBER') return { type: 'PHONE_NUMBER', text: b.text, phone_number: b.phoneNumber };
    return { type: 'QUICK_REPLY', text: b.text };
  });
  if (buttons.length) components.push({ type: 'BUTTONS', buttons });

  return components;
}

/** Vista previa en texto plano, como se vería en el teléfono. */
export function renderPreview(t = {}, values = []) {
  const fill = (text) => String(text || '').replace(VARIABLE_RE, (_, n) => {
    const v = values[Number(n) - 1];
    return v !== undefined && v !== '' ? v : `[${n}]`;
  });
  const parts = [];
  if (String(t.headerType).toUpperCase() === 'TEXT' && t.headerContent) parts.push(fill(t.headerContent));
  else if (['IMAGE', 'VIDEO', 'DOCUMENT'].includes(String(t.headerType).toUpperCase())) {
    parts.push(`[${String(t.headerType).toLowerCase()}]`);
  }
  parts.push(fill(t.bodyText));
  if (t.footerText) parts.push(t.footerText);
  const buttons = (Array.isArray(t.buttons) ? t.buttons : []).map(b => `[ ${b.text} ]`).join('  ');
  if (buttons) parts.push(buttons);
  return parts.filter(Boolean).join('\n\n');
}

export default {
  TEMPLATE_FOLDERS, FOLDER_KEYS, folderByKey, folderLabel, isFolder,
  META_CATEGORIES, META_CATEGORY_KEYS, LIMITS, BUTTON_TYPES, HEADER_TYPES,
  extractVariables, normalizeTemplateName, validateTemplate, toMetaComponents, renderPreview,
};
