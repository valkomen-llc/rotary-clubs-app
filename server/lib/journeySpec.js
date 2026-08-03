// Especificación de los recorridos automatizados.
//
// Un recorrido es un GRAFO de nodos guardado como JSON en `CrmJourney.nodes`. El
// constructor visual lo escribe y `journeyEngine.js` lo camina. Este archivo es
// la fuente de verdad de qué nodos existen, qué variables se pueden usar y qué
// hace válido a un recorrido.
//
// POR QUÉ UN GRAFO Y NO UNA SECUENCIA: los recorridos del pedido se bifurcan
// ("¿agendó? sí / no") y el que no se bifurca hoy se bifurca mañana. Una lista
// de pasos obliga a rehacer el modelo la primera vez que hace falta una rama.
//
// El grafo se guarda como documento y no normalizado en tablas porque se lee y
// se escribe SIEMPRE entero: normalizarlo obligaría a migrar el esquema cada vez
// que apareciera un tipo de nodo nuevo, sin ganar ninguna consulta.

// ── Tipos de nodo ───────────────────────────────────────────────────────────
export const NODE_TYPES = [
  {
    type: 'send_template',
    label: 'Enviar plantilla',
    description: 'Manda una plantilla aprobada por Meta. Pasa por todos los guardrails.',
    fields: ['templateId', 'variables'],
    outputs: ['next'],
  },
  {
    type: 'wait',
    label: 'Esperar',
    description: 'Detiene la inscripción el tiempo indicado antes de seguir.',
    fields: ['minutes', 'hours', 'days'],
    outputs: ['next'],
  },
  {
    type: 'condition',
    label: 'Condición',
    description: 'Bifurca según el estado del sitio, el contacto o lo que pasó con el último mensaje.',
    fields: ['condition'],
    outputs: ['nextTrue', 'nextFalse'],
  },
  {
    type: 'tag',
    label: 'Etiquetar contacto',
    description: 'Agrega o quita etiquetas del contacto.',
    fields: ['add', 'remove'],
    outputs: ['next'],
  },
  {
    type: 'alert',
    label: 'Alerta interna',
    description: 'Avisa al equipo. NO le llega nada al club — es una tarea de seguimiento humano.',
    fields: ['severity', 'title', 'detail'],
    outputs: ['next'],
  },
  {
    type: 'exit',
    label: 'Terminar',
    description: 'Cierra la inscripción con un motivo.',
    fields: ['reason', 'goalReached'],
    outputs: [],
  },
];

export const NODE_TYPE_KEYS = NODE_TYPES.map(n => n.type);
const NODE_BY_TYPE = Object.fromEntries(NODE_TYPES.map(n => [n.type, n]));

// ── Condiciones ─────────────────────────────────────────────────────────────
// Tres familias, porque las preguntas del pedido son de tres clases distintas y
// mezclarlas en un solo evaluador daría un lenguaje que no se puede validar.
//
//   · `audience` — sobre el contacto y su sitio. Reutiliza EXACTAMENTE el
//     catálogo de campos de `crmSegments.js`: si un campo sirve para segmentar,
//     sirve para bifurcar, y no hay dos vocabularios que mantener.
//   · `message`  — qué pasó con un mensaje que este recorrido ya mandó.
//   · `event`    — si ocurrió un evento del sistema desde que se inscribió.
export const CONDITION_KINDS = [
  { kind: 'audience', label: 'El contacto o su sitio cumplen…', fields: ['audience'] },
  { kind: 'message',  label: 'El mensaje anterior fue…',        fields: ['on', 'is', 'withinHours'] },
  { kind: 'event',    label: 'Ocurrió el evento…',              fields: ['eventType', 'withinDays'] },
];

// Qué se puede preguntar de un mensaje ya enviado.
//
// OJO: `clicked` NO está y no es un olvido. La Cloud API de Meta informa
// `sent`, `delivered`, `read` y `failed`; el clic en un botón de URL NO se
// reporta. Lo único observable es el botón de respuesta rápida, que llega como
// un mensaje entrante y por lo tanto se pregunta con `replied`. Declarar
// `clicked` daría una rama que nunca sería verdadera y que nadie entendería.
export const MESSAGE_OUTCOMES = [
  { key: 'delivered', label: 'Entregado' },
  { key: 'read',      label: 'Leído' },
  { key: 'replied',   label: 'Respondido (incluye botones de respuesta rápida)' },
  { key: 'failed',    label: 'Falló' },
];

// ── Variables de plantilla ──────────────────────────────────────────────────
// Meta numera los parámetros ({{1}}, {{2}}…) y los toma POSICIONALMENTE. Por eso
// el nodo guarda una LISTA ORDENADA de estos tokens: la posición 0 alimenta
// {{1}}, la 1 alimenta {{2}}, etc. Cambiar el orden en el constructor cambia qué
// va en cada hueco, que es exactamente como lo entiende Meta.
export const TEMPLATE_VARIABLES = [
  { token: 'nombre_contacto',    label: 'Nombre del contacto' },
  { token: 'nombre_club',        label: 'Nombre del club u organización' },
  { token: 'tipo_sitio',         label: 'Tipo de sitio' },
  { token: 'fecha_vencimiento',  label: 'Fecha de vencimiento' },
  { token: 'link_sitio',         label: 'Enlace al sitio público' },
  { token: 'link_admin',         label: 'Enlace al panel de administración' },
  { token: 'link_capacitacion',  label: 'Enlace para agendar capacitación' },
  { token: 'nombre_capacitacion', label: 'Nombre de la capacitación' },
  { token: 'fecha_capacitacion', label: 'Fecha de la capacitación' },
  { token: 'hora_capacitacion',  label: 'Hora de la capacitación' },
  { token: 'link_renovacion',    label: 'Enlace para renovar' },
  { token: 'estado_suscripcion', label: 'Estado de la suscripción' },
];

export const TEMPLATE_VARIABLE_TOKENS = TEMPLATE_VARIABLES.map(v => v.token);

const fmtDate = (d, locale = 'es-CO', tz = 'America/Bogota') => {
  if (!d) return '';
  try {
    return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric', timeZone: tz }).format(new Date(d));
  } catch { return String(d).slice(0, 10); }
};
const fmtTime = (d, locale = 'es-CO', tz = 'America/Bogota') => {
  if (!d) return '';
  try {
    return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', timeZone: tz }).format(new Date(d));
  } catch { return ''; }
};

/**
 * Resuelve la lista ordenada de tokens a los valores de ESTE contacto.
 *
 * Un token que no se pueda resolver devuelve cadena vacía y se anota en
 * `missing`. El motor usa `missing` para NO enviar: Meta rechaza una plantilla
 * con un parámetro vacío, y aunque no lo hiciera, un mensaje que dice "Hola ,
 * tu sitio vence el " es peor que no mandarlo.
 */
export function resolveVariables(tokens = [], ctx = {}) {
  const { contact = {}, signals = {}, lifecycle = null, links = {}, training = null } = ctx;
  const locale = contact.language === 'en' ? 'en-US' : 'es-CO';
  const tz = ctx.timeZone || 'America/Bogota';

  const site = signals || {};
  const siteName = site.name || contact.company || '';
  const publicUrl = site.domain ? (site.domain.startsWith('http') ? site.domain : `https://${site.domain}`) : '';

  const table = {
    nombre_contacto:    contact.name || '',
    nombre_club:        siteName,
    tipo_sitio:         site.siteType === 'district' ? 'Distrito' : (site.category || site.siteKind || 'Club'),
    fecha_vencimiento:  fmtDate(site.expirationDate, locale, tz),
    link_sitio:         publicUrl,
    link_admin:         links.admin || (publicUrl ? `${publicUrl}/admin/dashboard` : ''),
    link_capacitacion:  links.training || '',
    nombre_capacitacion: training?.name || '',
    fecha_capacitacion: fmtDate(training?.startAt, locale, tz),
    hora_capacitacion:  fmtTime(training?.startAt, locale, tz),
    link_renovacion:    links.renewal || '',
    estado_suscripcion: lifecycle?.label || site.subscriptionStatus || '',
  };

  const values = [];
  const missing = [];
  for (const raw of tokens) {
    const token = String(raw || '').replace(/[{}]/g, '').trim();
    const value = table[token];
    if (value === undefined) { missing.push(token); values.push(''); continue; }
    if (value === '' || value === null) { missing.push(token); values.push(''); continue; }
    values.push(String(value));
  }
  return { values, missing };
}

// ── Validación ──────────────────────────────────────────────────────────────
/**
 * Un recorrido inválido no se activa. Se valida al guardar y otra vez al
 * activar, porque entre una cosa y la otra alguien pudo borrar la plantilla que
 * usaba un nodo.
 */
export function validateJourney(journey) {
  const errors = [];
  const nodes = Array.isArray(journey?.nodes) ? journey.nodes : [];

  if (!journey?.name) errors.push('El recorrido necesita un nombre.');
  if (!journey?.trigger?.type) errors.push('El recorrido necesita un evento inicial.');
  if (!nodes.length) errors.push('El recorrido no tiene ningún paso.');

  const ids = new Set();
  for (const n of nodes) {
    if (!n?.id) { errors.push('Hay un paso sin identificador.'); continue; }
    if (ids.has(n.id)) errors.push(`El identificador de paso "${n.id}" está repetido.`);
    ids.add(n.id);
    if (!NODE_BY_TYPE[n.type]) { errors.push(`Tipo de paso desconocido: "${n.type}".`); continue; }

    if (n.type === 'send_template' && !n.templateId) errors.push(`El paso "${n.id}" no tiene plantilla asignada.`);
    if (n.type === 'wait') {
      const total = (Number(n.days) || 0) * 1440 + (Number(n.hours) || 0) * 60 + (Number(n.minutes) || 0);
      if (total <= 0) errors.push(`La espera del paso "${n.id}" tiene que ser mayor que cero.`);
    }
    if (n.type === 'condition') {
      const kind = n.condition?.kind;
      if (!CONDITION_KINDS.some(c => c.kind === kind)) errors.push(`El paso "${n.id}" tiene una condición de tipo desconocido.`);
      if (kind === 'message' && !MESSAGE_OUTCOMES.some(o => o.key === n.condition?.is)) {
        errors.push(`El paso "${n.id}" pregunta por un resultado de mensaje que no se puede observar.`);
      }
    }
  }

  // Referencias colgantes. Un `next` que apunta a un nodo inexistente deja la
  // inscripción varada sin decir por qué, así que se detecta al guardar.
  for (const n of nodes) {
    for (const key of ['next', 'nextTrue', 'nextFalse']) {
      const target = n?.[key];
      if (target && !ids.has(target)) errors.push(`El paso "${n.id}" apunta a "${target}", que no existe.`);
    }
  }

  const entry = entryNodeId(journey);
  if (entry && !ids.has(entry)) errors.push('El paso inicial no existe.');

  // Ciclo sin espera: un bucle que no pasa por ningún `wait` gira sin fin dentro
  // de una sola vuelta del motor.
  const cycle = findWaitlessCycle(nodes, entry);
  if (cycle) errors.push(`Hay un ciclo sin espera entre los pasos: ${cycle.join(' → ')}.`);

  return errors;
}

function findWaitlessCycle(nodes, entryId) {
  const byId = Object.fromEntries(nodes.map(n => [n.id, n]));
  const state = new Map(); // 0 = en curso, 1 = terminado
  const stack = [];

  const visit = (id) => {
    const node = byId[id];
    if (!node) return null;
    if (node.type === 'wait' || node.type === 'exit') return null; // una espera corta el ciclo
    if (state.get(id) === 0) return [...stack.slice(stack.indexOf(id)), id];
    if (state.get(id) === 1) return null;

    state.set(id, 0);
    stack.push(id);
    for (const key of ['next', 'nextTrue', 'nextFalse']) {
      const target = node[key];
      if (!target) continue;
      const found = visit(target);
      if (found) return found;
    }
    stack.pop();
    state.set(id, 1);
    return null;
  };

  return entryId ? visit(entryId) : null;
}

export function nodeById(journey, id) {
  return (journey?.nodes || []).find(n => n.id === id) || null;
}

// El nodo inicial vive en `settings.entryNodeId`: `CrmJourney` no tiene columna
// propia para él. El respaldo al primer nodo del array se conserva para los
// recorridos que no lo declaren, pero NO es la fuente: reordenar los pasos en el
// constructor no puede cambiar por dónde empieza el recorrido.
export function entryNodeId(journey) {
  return journey?.entryNodeId || journey?.settings?.entryNodeId || journey?.nodes?.[0]?.id || null;
}

export function waitMs(node) {
  return ((Number(node?.days) || 0) * 1440 + (Number(node?.hours) || 0) * 60 + (Number(node?.minutes) || 0)) * 60_000;
}

export default {
  NODE_TYPES, NODE_TYPE_KEYS, CONDITION_KINDS, MESSAGE_OUTCOMES,
  TEMPLATE_VARIABLES, TEMPLATE_VARIABLE_TOKENS,
  resolveVariables, validateJourney, nodeById, entryNodeId, waitMs,
};
