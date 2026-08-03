// Intenciones del chatbot del WhatsApp CRM.
//
// QUÉ ES UNA INTENCIÓN ACÁ: lo que el contacto quiere resolver, en un catálogo
// CERRADO. No es una clasificación libre del modelo. El motivo es que de la
// intención dependen dos cosas caras —a qué agente se enruta la conversación y
// qué enlace se le manda— y una etiqueta inventada por el modelo ("consulta
// general_2") no enruta a ninguna parte y no se puede reportar.
//
// CÓMO SE DETECTA, en este orden:
//
//   1. BOTÓN DE RESPUESTA RÁPIDA — es exacto. Meta entrega el botón pulsado como
//      un mensaje entrante con el título del botón, así que si el título coincide
//      con una opción del menú, la intención es esa y no hay nada que adivinar.
//   2. PALABRAS CLAVE — deterministas, revisables y gratis.
//   3. MODELO — sólo si lo anterior no resolvió, y sólo para ELEGIR una de las
//      intenciones del catálogo. Si contesta cualquier otra cosa, se descarta.
//
// El orden importa: empezar por el modelo costaría una llamada por mensaje para
// resolver casos que una palabra clave resuelve, y haría el enrutamiento no
// reproducible ("¿por qué esta conversación fue a soporte?").
import { routeToModel } from './ai-router.js';

// `route` dice qué hacer cuando se detecta:
//   · `link`  — se contesta con un enlace institucional (clave de `settings.links`)
//   · `team`  — se enruta a un equipo humano
//   · `both`  — se manda el enlace Y se enruta, para que alguien haga seguimiento
export const INTENTS = [
  {
    key: 'agendar_capacitacion',
    label: 'Agendar capacitación',
    menuLabel: 'Agendar capacitación',
    route: 'link',
    linkKey: 'training',
    team: 'capacitacion',
    keywords: ['capacitacion', 'capacitación', 'entrenamiento', 'agendar', 'agenda', 'reservar', 'cita', 'onboarding', 'formacion', 'formación', 'clase', 'taller'],
    reply: 'Podés agendar tu capacitación acá: {{link}}\n\nElegí el tema y el horario que te sirvan.',
  },
  {
    key: 'renovar_suscripcion',
    label: 'Renovar suscripción',
    menuLabel: 'Renovar suscripción',
    route: 'both',
    linkKey: 'renewal',
    team: 'administracion',
    keywords: ['renovar', 'renovacion', 'renovación', 'pagar', 'pago', 'factura', 'suscripcion', 'suscripción', 'vencimiento', 'vence', 'cobro'],
    reply: 'Podés renovar tu suscripción acá: {{link}}\n\nSi necesitás factura o cambiar el medio de pago, avisanos y te ayudamos.',
  },
  {
    key: 'soporte_tecnico',
    label: 'Soporte técnico',
    menuLabel: 'Soporte técnico',
    route: 'team',
    team: 'soporte',
    keywords: ['soporte', 'error', 'falla', 'no funciona', 'problema', 'ayuda tecnica', 'ayuda técnica', 'caido', 'caído', 'roto', 'bug', 'no carga', 'no puedo entrar'],
    reply: 'Ya registramos tu consulta. Un integrante del equipo de soporte te escribe en breve.',
  },
  {
    key: 'redes_sociales',
    label: 'Configurar redes sociales',
    menuLabel: 'Configurar redes sociales',
    route: 'both',
    linkKey: 'admin',
    team: 'comunicaciones',
    keywords: ['redes', 'red social', 'facebook', 'instagram', 'linkedin', 'twitter', 'conectar redes', 'publicar'],
    reply: 'Las redes se conectan desde el panel, en Hub Social: {{link}}\n\nSi preferís que lo veamos juntos, te agendamos una capacitación.',
  },
  {
    key: 'fundraising',
    label: 'Fundraising y donaciones',
    menuLabel: 'Fundraising y donaciones',
    route: 'both',
    linkKey: 'admin',
    team: 'proyectos',
    keywords: ['donacion', 'donación', 'donaciones', 'recaudar', 'fundraising', 'crowdfunding', 'aportes', 'recaudacion', 'recaudación'],
    reply: 'El módulo de donaciones se configura desde el panel: {{link}}\n\nTe podemos acompañar a dejarlo listo.',
  },
  {
    key: 'proyectos',
    label: 'Crear proyectos',
    menuLabel: 'Crear proyectos',
    route: 'both',
    linkKey: 'admin',
    team: 'proyectos',
    keywords: ['proyecto', 'proyectos', 'postular', 'feria', 'iniciativa'],
    reply: 'Los proyectos se cargan desde el panel: {{link}}\n\nSi querés que revisemos uno en particular, decinos cuál.',
  },
  {
    key: 'hablar_asesor',
    label: 'Hablar con un asesor',
    menuLabel: 'Hablar con un asesor',
    route: 'team',
    team: 'comercial',
    keywords: ['asesor', 'hablar con alguien', 'persona', 'humano', 'llamada', 'reunion', 'reunión', 'contactar'],
    reply: 'Listo, le avisamos a un asesor. Te escribe a la brevedad por este mismo chat.',
  },
  {
    key: 'baja',
    label: 'Solicitud de baja',
    menuLabel: null, // no se ofrece en el menú; se detecta por palabra clave
    route: 'team',
    team: 'administracion',
    keywords: ['baja', 'no quiero recibir', 'dar de baja', 'desuscribir', 'stop', 'basta', 'no me escriban', 'eliminar mis datos', 'cancelar suscripcion'],
    reply: 'Listo, no vas a recibir más mensajes automáticos. Si fue un error, escribinos y lo revertimos.',
  },
  {
    key: 'otro',
    label: 'Otra consulta',
    menuLabel: null,
    route: 'team',
    team: 'soporte',
    keywords: [],
    reply: null, // sin respuesta automática: la contesta una persona
  },
];

export const INTENT_KEYS = INTENTS.map(i => i.key);
const BY_KEY = Object.fromEntries(INTENTS.map(i => [i.key, i]));

export function intentByKey(key) { return BY_KEY[key] || null; }
export function intentLabel(key) { return BY_KEY[key]?.label || key || '—'; }
export function isIntent(key) { return Object.prototype.hasOwnProperty.call(BY_KEY, key); }

/** Las que se ofrecen como botones. `baja` y `otro` no se ofrecen a propósito. */
export const MENU_INTENTS = INTENTS.filter(i => i.menuLabel);

export const EQUIPOS = [
  { key: 'soporte',        label: 'Soporte técnico' },
  { key: 'capacitacion',   label: 'Capacitación' },
  { key: 'comunicaciones', label: 'Comunicaciones' },
  { key: 'proyectos',      label: 'Proyectos y fundraising' },
  { key: 'administracion', label: 'Administración' },
  { key: 'comercial',      label: 'Comercial' },
];
export const EQUIPO_KEYS = EQUIPOS.map(e => e.key);

// ── Normalización ───────────────────────────────────────────────────────────
// Sin tildes y en minúsculas: "capacitación" y "capacitacion" tienen que caer en
// la misma intención, y quien escribe por WhatsApp casi nunca pone la tilde.
function norm(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Paso 1 y 2: botón exacto y palabras clave. Función PURA — es la parte que
 * tiene que poder probarse y explicarse sin llamar a nadie.
 *
 * Devuelve { key, method, matched } o null.
 */
export function detectIntentDeterministic(text) {
  const t = norm(text);
  if (!t) return null;

  // Botón del menú: coincidencia exacta con el título. Meta manda el título del
  // botón como texto del mensaje entrante, así que esto es una igualdad, no una
  // heurística.
  for (const intent of MENU_INTENTS) {
    if (t === norm(intent.menuLabel)) return { key: intent.key, method: 'button', matched: intent.menuLabel };
  }
  // Menú numerado: "1", "2"… es como contesta mucha gente.
  const asNumber = Number(t);
  if (Number.isInteger(asNumber) && asNumber >= 1 && asNumber <= MENU_INTENTS.length) {
    return { key: MENU_INTENTS[asNumber - 1].key, method: 'menu_number', matched: t };
  }

  // Palabras clave. Gana la coincidencia MÁS LARGA, no la primera: "no quiero
  // recibir" tiene que ganarle a "recibir" suelto, y "ayuda técnica" a "ayuda".
  let best = null;
  for (const intent of INTENTS) {
    for (const kw of intent.keywords) {
      const k = norm(kw);
      if (!k || !t.includes(k)) continue;
      if (!best || k.length > best.matched.length) best = { key: intent.key, method: 'keyword', matched: k };
    }
  }
  return best;
}

/**
 * Paso 3: el modelo, sólo si hace falta y sólo para ELEGIR del catálogo.
 *
 * Si el modelo contesta algo que no está en el catálogo, se descarta y se
 * devuelve `otro`. Aceptar una etiqueta inventada dejaría conversaciones
 * enrutadas a un equipo que no existe.
 */
export async function detectIntentWithModel(text, { modelSlug = 'gemini-2.5-flash', timeoutMs = 8000 } = {}) {
  const options = INTENTS.filter(i => i.key !== 'otro').map(i => `- ${i.key}: ${i.label}`).join('\n');
  const systemPrompt = `Clasificás mensajes de dirigentes de clubes Rotarios en UNA de estas intenciones:

${options}

Respondés ÚNICAMENTE con la clave exacta (por ejemplo: soporte_tecnico). Si ninguna encaja, respondés: otro`;

  try {
    // El tiempo límite es corto a propósito: esto corre dentro del webhook de
    // Meta, que espera un 200. Si el modelo tarda, se sigue sin él.
    const raw = await Promise.race([
      routeToModel(modelSlug, systemPrompt, String(text).slice(0, 500)),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), timeoutMs)),
    ]);
    const answer = norm(raw);
    const found = INTENT_KEYS.find(k => answer === k) || INTENT_KEYS.find(k => answer.includes(k));
    if (found) return { key: found, method: 'model', matched: answer };
  } catch { /* el modelo es un respaldo: si falla, se sigue sin él */ }
  return { key: 'otro', method: 'fallback', matched: null };
}

/**
 * Detección completa. `useModel:false` la deja totalmente determinista, que es
 * lo que se quiere en las pruebas y cuando no hay credencial de modelo.
 */
export async function detectIntent(text, { useModel = true, modelSlug } = {}) {
  const deterministic = detectIntentDeterministic(text);
  if (deterministic) return deterministic;
  if (!useModel) return { key: 'otro', method: 'fallback', matched: null };
  return detectIntentWithModel(text, { modelSlug });
}

/** El menú que se le muestra a quien escribe por primera vez. */
export function buildMenuText(greeting = '¿En qué podemos apoyarte?') {
  const lines = MENU_INTENTS.map((i, idx) => `${idx + 1}. ${i.menuLabel}`);
  return `${greeting}\n\n${lines.join('\n')}\n\nRespondé con el número o escribí tu consulta.`;
}

/**
 * Arma la respuesta de una intención resolviendo `{{link}}`.
 *
 * Si la intención necesita un enlace y ese enlace no está configurado, devuelve
 * `null` en vez de un texto con el hueco a la vista: es la misma regla que las
 * variables de plantilla del motor de recorridos. Sin respuesta automática, la
 * conversación queda para una persona, que es el resultado correcto.
 */
export function buildIntentReply(intentKey, links = {}) {
  const intent = BY_KEY[intentKey];
  if (!intent || !intent.reply) return null;
  if (!intent.linkKey) return intent.reply;
  const url = links[intent.linkKey];
  if (!url) return null;
  return intent.reply.replace('{{link}}', url);
}

export default {
  INTENTS, INTENT_KEYS, MENU_INTENTS, EQUIPOS, EQUIPO_KEYS,
  intentByKey, intentLabel, isIntent,
  detectIntent, detectIntentDeterministic, detectIntentWithModel,
  buildMenuText, buildIntentReply,
};
