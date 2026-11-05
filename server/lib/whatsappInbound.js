// ════════════════════════════════════════════════════════════════════
// El RECORRIDO de un mensaje entrante de WhatsApp — el CRITERIO (v4.1285).
//
// PURO a propósito: sin base, sin red, sin reloj implícito. Lo que habla con
// Postgres es `whatsappInboundStore.js` y lo que habla con Meta es el webhook.
// Así cada regla de abajo se prueba sin credenciales.
//
// POR QUÉ EXISTE. El 2026-11-05 la línea de la Feria de Proyectos tenía el
// diagnóstico en verde, el simulador respondía y los mensajes reales («Hola»,
// «Estoy interesado») no recibían nada. No había DÓNDE mirar: el webhook
// guardaba el payload y el mensaje, pero lo que pasaba DESPUÉS —qué agente, qué
// respuesta, qué contestó Meta— vivía en `console.log`, efímero en Vercel.
// Un «no respondió» tenía siete causas posibles y ninguna dejaba rastro.
//
// Desde esta versión cada entrante deja una TRAZA con sus etapas, y una traza
// que termina sin respuesta dice POR QUÉ con un motivo de un catálogo CERRADO,
// cada uno con su salida (`fix`): un motivo cuya única respuesta es «no se
// puede» se lee como una avería (v4.1008).
// ════════════════════════════════════════════════════════════════════

/**
 * Las etapas, en orden. `ord` es lo que permite decir «llegó hasta X».
 * El recorrido esperado del pedido, una etapa por paso.
 */
export const STAGES = [
  { key: 'received', ord: 1, label: 'Mensaje recibido' },
  { key: 'validated', ord: 2, label: 'Mensaje validado' },
  { key: 'line_identified', ord: 3, label: 'Línea identificada' },
  { key: 'stored', ord: 4, label: 'Mensaje guardado en el CRM' },
  { key: 'agent_selected', ord: 5, label: 'Agente seleccionado' },
  { key: 'processing', ord: 6, label: 'Procesamiento iniciado' },
  { key: 'reply_generated', ord: 7, label: 'Respuesta generada' },
  { key: 'sent_to_meta', ord: 8, label: 'Solicitud enviada a Meta' },
  { key: 'meta_accepted', ord: 9, label: 'Meta aceptó el envío' },
  { key: 'delivered', ord: 10, label: 'Entregado al usuario' },
  { key: 'read', ord: 11, label: 'Leído por el usuario' },
];
export const STAGE_KEYS = STAGES.map((s) => s.key);
const ORD = Object.fromEntries(STAGES.map((s) => [s.key, s.ord]));
export const stageOrd = (k) => ORD[k] || 0;

/** Los desenlaces. `pending` es el ÚNICO que el reintento puede retomar. */
export const OUTCOMES = {
  pending: { label: 'En proceso', answered: false },
  replied: { label: 'Respondido', answered: true },
  skipped: { label: 'Sin respuesta automática (por regla)', answered: false },
  failed: { label: 'Falló', answered: false },
  duplicate: { label: 'Duplicado (reintento de Meta)', answered: null },
};

/**
 * Por qué un mensaje NO recibió respuesta automática.
 *
 * `human: true` = la regla está bien aplicada y lo que corresponde es que lo
 * atienda una persona (pausa, silencio, baja). `human: false` = es una avería
 * y hay que corregir algo. El reporte de «sin respuesta» separa las dos: mezclar
 * una pausa deliberada con un token vencido escondería la avería.
 */
export const REASONS = {
  pausa_humana: {
    title: 'En pausa porque una persona respondió desde el Chat',
    fix: 'Es lo esperado mientras dura la pausa. Para reanudar antes: «Reanudar bot» en este panel.',
    human: true,
  },
  contacto_silenciado: {
    title: 'El contacto tiene el bot silenciado',
    fix: 'Quitar el silencio en la ficha del contacto si debe volver a recibir respuestas automáticas.',
    human: true,
  },
  baja_solicitada: {
    title: 'La persona pidió la baja',
    fix: 'Se respetó la baja; no corresponde responder con el agente.',
    human: true,
  },
  no_es_texto: {
    title: 'No es un mensaje de texto',
    fix: 'Audios, imágenes, stickers y reacciones quedan en la bandeja para una persona: el agente sólo lee texto.',
    human: true,
  },
  agente_apagado: {
    title: 'La línea tiene agente propio y está APAGADO',
    fix: 'Encenderlo y GUARDAR en Automatización. Un agente propio apagado no hereda el del sitio, a propósito.',
    human: false,
  },
  sin_agente: {
    title: 'La línea no tiene agente ni hereda uno encendido',
    fix: 'Crear el agente de esta línea en Automatización, o encender el del sitio.',
    human: false,
  },
  agente_sin_instruccion: {
    title: 'El agente no tiene instrucción guardada',
    fix: 'Escribir la instrucción y GUARDAR: el simulador usa lo que está en pantalla, WhatsApp usa lo guardado.',
    human: false,
  },
  ia_sin_respuesta: {
    title: 'El modelo de IA no devolvió respuesta y no hay mensaje de respaldo',
    fix: 'Configurar el «Mensaje de respaldo» del agente para que la persona reciba algo aunque el modelo falle.',
    human: false,
  },
  linea_no_puede_enviar: {
    title: 'La línea no está habilitada para enviar',
    fix: 'Revisar el estado de la conexión (Configuración → WhatsApp → Cuentas conectadas) y pulsar «Verificar».',
    human: false,
  },
  meta_rechazo: {
    title: 'Meta rechazó la respuesta',
    fix: 'El código y el texto de Meta están en el detalle; con 131047 la persona está fuera de la ventana de 24 h.',
    human: false,
  },
  meta_sin_respuesta: {
    title: 'No se pudo hablar con Meta (red o tiempo agotado)',
    fix: 'Se reintentó; si persiste, revisar el estado de la Cloud API de Meta.',
    human: false,
  },
  resultado_desconocido: {
    title: 'El proceso se interrumpió después de pedir el envío a Meta',
    fix: 'No se reintenta para no duplicar la respuesta. Revisar el chat y responder a mano si hace falta.',
    human: false,
  },
  proceso_interrumpido: {
    title: 'El proceso se interrumpió antes de responder',
    fix: 'El reintento automático lo retoma; si no, aparece en «Conversaciones sin respuesta».',
    human: false,
  },
  firma_invalida: {
    title: 'La firma del webhook no coincide',
    fix: 'Con WA_ENFORCE_SIGNATURE=true no se responde a eventos sin firma válida. Revisar META_APP_SECRET y la app de Meta que entrega los eventos.',
    human: false,
  },
  error_interno: {
    title: 'Error interno al procesar el mensaje',
    fix: 'El detalle técnico está en la traza. El mensaje quedó guardado en la bandeja.',
    human: false,
  },
  respondido_por_chatbot: {
    title: 'Lo respondió el menú del chatbot',
    fix: 'No es un fallo.',
    human: true,
  },
};

export function describeReason(code, detail = null) {
  const r = REASONS[code];
  if (!r) return { code: code || 'desconocido', title: 'Motivo no catalogado', fix: 'Ver el detalle técnico.', human: false, detail };
  return { code, ...r, detail };
}

// ── Errores de Meta al ENVIAR ───────────────────────────────────────────────

/**
 * Los errores que dicen algo de la LÍNEA, no del destinatario.
 *
 * ⚠️ ESTO CORRIGE UN APAGÓN AUTOINFLIGIDO. Hasta v4.1284 cualquier error al
 * enviar una respuesta pasaba la conexión a `error`, y en `error` `sendGuard`
 * bloquea TODO envío de esa línea —respuestas automáticas y campañas— hasta
 * que alguien pulse «Verificar». Un solo destinatario fuera de la ventana de
 * 24 h (131047), con un número que no tiene WhatsApp (131026) o un pico de
 * tráfico (130429) dejaba muda la línea entera para todos los demás. Sólo un
 * problema de la credencial o del número degrada la línea.
 */
const LINE_LEVEL_CODES = new Set([
  190, 102, 463, 467, // token vencido / revocado
  10, 200, 3, 299, // permisos
  131031, // cuenta bloqueada
  133010, // número no registrado en la Cloud API
  368, // bloqueada temporalmente por política
  131005, // acceso denegado
]);

/** Pasajeros: vale la pena reintentar con espera. */
const TRANSIENT_CODES = new Set([1, 2, 4, 17, 341, 130429, 131000, 131016, 131056, 80007]);

export function classifyMetaSendError({ metaCode = null, httpStatus = null, network = false } = {}) {
  const code = metaCode === null || metaCode === undefined ? null : Number(metaCode);
  if (network || (!code && !httpStatus)) {
    return { lineLevel: false, transient: true, reason: 'meta_sin_respuesta' };
  }
  if (code === 100 && Number(httpStatus) === 400) {
    // 100 sobre `/{phone_number_id}/messages` suele ser un parámetro del
    // MENSAJE (destinatario mal formado), no la línea. Sin subcódigo 33 no se
    // degrada.
    return { lineLevel: false, transient: false, reason: 'meta_rechazo' };
  }
  if (code !== null && LINE_LEVEL_CODES.has(code)) {
    return { lineLevel: true, transient: false, reason: 'meta_rechazo' };
  }
  if ((code !== null && TRANSIENT_CODES.has(code)) || Number(httpStatus) >= 500) {
    return { lineLevel: false, transient: true, reason: 'meta_rechazo' };
  }
  return { lineLevel: false, transient: false, reason: 'meta_rechazo' };
}

/** Espera entre intentos. Acotada: el webhook vive dentro de 120 s. */
export const SEND_RETRY_DELAYS_MS = [1000, 3000];

// ── El webhook trae LOTES ───────────────────────────────────────────────────

/**
 * Aplana un payload de Meta en sus cambios.
 *
 * ⚠️ ERA UN DESCARTE MUDO. El webhook leía `entry[0].changes[0]` y nada más:
 * Meta puede agrupar en una sola entrega varias `entry` (una por WABA) y varios
 * `changes`, y con dos cuentas en la misma App —el Distrito y la Feria— un
 * lote con los estados del Distrito primero y el mensaje de la Feria después
 * perdía el mensaje sin dejar rastro. Se procesan TODOS.
 */
export function flattenWebhook(body = {}) {
  const out = [];
  const entries = Array.isArray(body?.entry) ? body.entry : [];
  entries.forEach((entry, ei) => {
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];
    changes.forEach((change, ci) => {
      if (!change?.value) return;
      out.push({
        wabaId: entry?.id || null,
        field: change.field || 'messages',
        value: change.value,
        phoneNumberId: change.value?.metadata?.phone_number_id || null,
        index: `${ei}.${ci}`,
      });
    });
  });
  return out;
}

// ── Prueba real de punta a punta ────────────────────────────────────────────

const PROBE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin 0/O ni 1/I

/** `rand` inyectable para que la prueba sea reproducible. */
export function newProbeCode(rand = Math.random) {
  let s = '';
  for (let i = 0; i < 6; i++) s += PROBE_ALPHABET[Math.floor(rand() * PROBE_ALPHABET.length)];
  return `PRUEBA-${s}`;
}

const PROBE_RE = /\bPRUEBA[-\s]?([A-HJ-NP-Z2-9]{6})\b/i;

/**
 * Extrae el código de prueba de un mensaje y devuelve el texto SIN el código,
 * que es lo que lee el agente: la prueba recorre el camino real y el agente no
 * tiene por qué ver una contraseña.
 */
export function extractProbe(text = '') {
  const m = String(text || '').match(PROBE_RE);
  if (!m) return { code: null, text: String(text || '') };
  const code = `PRUEBA-${m[1].toUpperCase()}`;
  const rest = String(text).replace(m[0], ' ').replace(/\s+/g, ' ').trim();
  return { code, text: rest || 'Hola' };
}

// ── Privacidad del registro ─────────────────────────────────────────────────

/** El teléfono en pantallas de diagnóstico: lo justo para reconocerlo. */
export function maskPhone(phone = '') {
  const d = String(phone || '').replace(/\D/g, '');
  if (d.length < 6) return d ? '•••' : '';
  return `+${d.slice(0, 2)} ••• ••${d.slice(-4)}`;
}

/** Un adelanto del texto, sin el multimedia firmado (las URL llevan firma). */
export function previewText(text = '', max = 160) {
  const t = String(text || '').replace(/\[MEDIA\|(\w+)\|[^\]]*\]/g, '[$1]').replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

// ── Salud de la línea ───────────────────────────────────────────────────────

/**
 * Los cinco estados del pedido. Un «Operativo» tiene que estar respaldado por
 * una verificación REAL: credenciales guardadas son «Configurado», no más.
 */
export const HEALTH_STATES = {
  operativo: { label: 'Operativo', rank: 0 },
  conectado: { label: 'Conectado', rank: 1 },
  configurado: { label: 'Configurado', rank: 2 },
  sin_datos: { label: 'Sin datos todavía', rank: 3 },
  degradado: { label: 'Degradado', rank: 4 },
  error: { label: 'Error', rank: 5 },
};

const HOUR = 3600 * 1000;
const fmtAge = (ms) => {
  if (ms < 60 * 1000) return 'hace menos de un minuto';
  if (ms < HOUR) return `hace ${Math.round(ms / 60000)} min`;
  if (ms < 48 * HOUR) return `hace ${Math.round(ms / HOUR)} h`;
  return `hace ${Math.round(ms / (24 * HOUR))} días`;
};

/**
 * Juzga la salud con hechos YA RECOGIDOS.
 *
 * facts = {
 *   now, hasToken, tokenValid, phoneMatchesWaba, subscription: {state, detail},
 *   status, lastError,
 *   lastInboundAt, lastWebhookAt, unroutedForNumber,
 *   outbound7d, statusesBack7d,
 *   agent: {source, enabled, hasInstruction, name, model},
 *   traces: {total, replied, skippedHuman, failed, pending, lastRunAt, lastReplyAt,
 *            avgReplyMs, lastAiError, lastSendError, lastReplyStatus},
 * }
 */
export function evaluateLineHealth(facts = {}) {
  const now = facts.now ? new Date(facts.now).getTime() : Date.now();
  const age = (d) => (d ? now - new Date(d).getTime() : null);
  const blocks = [];
  const block = (key, title, state, items) => blocks.push({ key, title, state, label: HEALTH_STATES[state].label, items });
  const item = (label, value, tone = 'neutral') => ({ label, value, tone });

  // 1. Conexión con Meta.
  {
    const items = [];
    let state;
    if (!facts.hasToken) state = 'error';
    else if (facts.tokenValid === false || facts.phoneMatchesWaba === false) state = 'error';
    else if (facts.subscription?.state === 'other_app' || facts.subscription?.state === 'none') state = 'error';
    else if (facts.tokenValid === true && facts.phoneMatchesWaba === true && facts.subscription?.state === 'platform') state = 'conectado';
    else state = 'configurado';
    items.push(item('Credenciales', facts.hasToken ? (facts.tokenValid === true ? 'Válidas (Meta las aceptó)' : facts.tokenValid === false ? 'Rechazadas por Meta' : 'Guardadas, sin comprobar') : 'No hay token', facts.hasToken && facts.tokenValid !== false ? (facts.tokenValid ? 'ok' : 'neutral') : 'bad'));
    items.push(item('Número vinculado', facts.phoneMatchesWaba === true ? 'Pertenece a la cuenta' : facts.phoneMatchesWaba === false ? 'No pertenece a la cuenta' : 'Sin comprobar', facts.phoneMatchesWaba === true ? 'ok' : facts.phoneMatchesWaba === false ? 'bad' : 'neutral'));
    items.push(item('Webhook', facts.subscription?.detail || 'Sin comprobar', facts.subscription?.state === 'platform' ? 'ok' : (facts.subscription?.state === 'other_app' || facts.subscription?.state === 'none') ? 'bad' : 'neutral'));
    block('meta', 'Conexión con Meta', state, items);
  }

  // 2. Recepción. Es una MEDIDA: lo único que demuestra que Meta nos entrega.
  {
    const items = [];
    const inAge = age(facts.lastInboundAt);
    const hookAge = age(facts.lastWebhookAt);
    let state;
    const outbound = Number(facts.outbound7d || 0);
    const back = Number(facts.statusesBack7d || 0);
    if (outbound >= 5 && back === 0 && !facts.lastWebhookAt) {
      // ⚠️ LA SEÑAL QUE DESTAPA EL VERDE FALSO: salen mensajes y Meta no nos
      // devuelve NINGÚN evento de esta línea —ni estados ni entrantes—. Los
      // eventos van a otra parte.
      state = 'error';
    } else if (facts.unroutedForNumber > 0) state = 'error';
    else if (hookAge !== null && hookAge < 7 * 24 * HOUR) state = 'operativo';
    else if (hookAge !== null) state = 'degradado';
    else state = 'sin_datos';
    items.push(item('Último mensaje entrante', facts.lastInboundAt ? fmtAge(inAge) : 'Nunca', facts.lastInboundAt ? 'ok' : 'neutral'));
    items.push(item('Último webhook de esta línea', facts.lastWebhookAt ? fmtAge(hookAge) : 'Nunca', facts.lastWebhookAt ? 'ok' : 'neutral'));
    items.push(item('Estados de entrega devueltos (7 días)', `${back} de ${outbound} envíos`, outbound >= 5 && back === 0 ? 'bad' : 'neutral'));
    if (facts.unroutedForNumber > 0) items.push(item('Eventos sin encaminar', `${facts.unroutedForNumber} con el número de esta línea`, 'bad'));
    block('recepcion', 'Recepción de mensajes', state, items);
  }

  // 3. Procesamiento con IA.
  {
    const a = facts.agent || {};
    const t = facts.traces || {};
    const items = [];
    let state;
    const agentOn = (a.source === 'connection' || a.source === 'site') && a.enabled !== false;
    if (!agentOn) state = 'error';
    else if (!a.hasInstruction) state = 'error';
    else if (t.lastAiError && (!t.lastReplyAt || new Date(t.lastAiErrorAt || 0) > new Date(t.lastReplyAt))) state = 'degradado';
    else if (t.lastRunAt) state = 'operativo';
    else state = 'configurado';
    items.push(item('Agente', agentOn ? `${a.name || 'Asistente'} (${a.source === 'connection' ? 'propio de la línea' : 'heredado del sitio'})` : a.source === 'connection_disabled' ? 'Propio y APAGADO' : 'Ninguno', agentOn ? 'ok' : 'bad'));
    if (agentOn) items.push(item('Instrucción guardada', a.hasInstruction ? 'Sí' : 'No', a.hasInstruction ? 'ok' : 'bad'));
    items.push(item('Última ejecución real', t.lastRunAt ? fmtAge(age(t.lastRunAt)) : 'Nunca', t.lastRunAt ? 'ok' : 'neutral'));
    items.push(item('Respuestas generadas (7 días)', String(t.generated || 0)));
    if (t.lastAiError) items.push(item('Último error del modelo', t.lastAiError, 'bad'));
    block('ia', 'Procesamiento con IA', state, items);
  }

  // 4. Envío de respuestas.
  {
    const t = facts.traces || {};
    const items = [];
    let state;
    if (facts.status && facts.status !== 'active') state = 'error';
    else if (t.lastSendError && (!t.lastReplyAt || new Date(t.lastSendErrorAt || 0) > new Date(t.lastReplyAt))) state = 'degradado';
    else if (t.lastReplyAt) state = 'operativo';
    else state = 'configurado';
    const STATUS_LABEL = { active: 'Activa', paused: 'Pausada', error: 'Con error', draft: 'Borrador' };
    items.push(item('Estado de la conexión', STATUS_LABEL[facts.status] || facts.status || 'desconocido', facts.status === 'active' ? 'ok' : 'bad'));
    items.push(item('Última respuesta enviada', t.lastReplyAt ? fmtAge(age(t.lastReplyAt)) : 'Nunca', t.lastReplyAt ? 'ok' : 'neutral'));
    if (t.lastReplyStatus) items.push(item('Estado reportado por Meta', t.lastReplyStatus, t.lastReplyStatus === 'failed' ? 'bad' : 'ok'));
    if (t.lastSendError) items.push(item('Último error de entrega', t.lastSendError, 'bad'));
    if (facts.lastError && facts.status !== 'active') items.push(item('Error de la conexión', facts.lastError, 'bad'));
    block('envio', 'Envío de respuestas', state, items);
  }

  // 5. Salud de la automatización.
  {
    const t = facts.traces || {};
    const items = [];
    const total = Number(t.total || 0);
    const replied = Number(t.replied || 0);
    const human = Number(t.skippedHuman || 0);
    const failed = Number(t.failed || 0);
    const evaluable = total - human;
    const rate = evaluable > 0 ? replied / evaluable : null;
    let state;
    if (!total) state = 'sin_datos';
    else if (rate !== null && rate >= 0.9) state = 'operativo';
    else if (rate !== null && rate >= 0.5) state = 'degradado';
    else if (rate === null) state = 'operativo';
    else state = 'error';
    items.push(item('Conversaciones atendidas (7 días)', `${replied} de ${total}`));
    items.push(item('Sin respuesta por avería', String(failed + Number(t.pendingStale || 0)), failed ? 'bad' : 'ok'));
    items.push(item('Sin respuesta por regla (pausa, baja, multimedia)', String(human)));
    items.push(item('Tiempo promedio de respuesta', t.avgReplyMs ? `${(t.avgReplyMs / 1000).toFixed(1)} s` : '—'));
    items.push(item('Tasa de éxito', rate === null ? '—' : `${Math.round(rate * 100)} %`, rate === null ? 'neutral' : rate >= 0.9 ? 'ok' : 'bad'));
    block('salud', 'Salud de la automatización', state, items);
  }

  // El veredicto: «Operativo» sólo si la recepción Y el envío están
  // demostrados por hechos. Lo configurado no es lo operativo.
  const worst = blocks.reduce((w, b) => (HEALTH_STATES[b.state].rank > HEALTH_STATES[w].rank ? b.state : w), 'operativo');
  const proven = blocks.find((b) => b.key === 'recepcion')?.state === 'operativo'
    && blocks.find((b) => b.key === 'envio')?.state === 'operativo';
  let overall;
  if (worst === 'error') overall = 'error';
  else if (worst === 'degradado') overall = 'degradado';
  else if (proven) overall = 'operativo';
  else if (blocks.find((b) => b.key === 'meta')?.state === 'conectado') overall = 'conectado';
  else overall = 'configurado';

  return { overall, label: HEALTH_STATES[overall].label, blocks };
}

/**
 * ¿La suscripción de la WABA entrega a ESTA plataforma?
 *
 * ⚠️ ERA EL VERDE FALSO. El diagnóstico decía «Cuenta suscrita al webhook» si
 * `GET /{waba}/subscribed_apps` devolvía CUALQUIER aplicación. Pero la
 * suscripción es de la APP DEL TOKEN: si el token de la Feria pertenece a otra
 * aplicación de Meta, `POST /subscribed_apps` suscribe ESA aplicación y Meta
 * entrega los mensajes a la URL de ESA aplicación, no a /api/crm/webhook. Los
 * envíos funcionan (sólo necesitan el token), el simulador funciona (no pasa
 * por Meta) y ningún mensaje real llega. Exactamente el síntoma.
 *
 * apps: la respuesta de Meta, `[{ whatsapp_business_api_data: {id,name}, override_callback_uri? }]`.
 */
export function judgeSubscription({ apps = null, platformAppId = null, callbackUrl = null } = {}) {
  if (!Array.isArray(apps)) {
    return { state: 'unknown', detail: 'No se pudo consultar la suscripción (suele faltar el permiso whatsapp_business_management).', apps: [] };
  }
  const list = apps.map((a) => ({
    id: String(a?.whatsapp_business_api_data?.id || a?.id || ''),
    name: a?.whatsapp_business_api_data?.name || a?.name || null,
    override: a?.override_callback_uri || null,
  }));
  if (!list.length) return { state: 'none', detail: 'La cuenta no está suscrita a ninguna aplicación: Meta no entrega sus mensajes a nadie.', apps: list };

  const norm = (u) => String(u || '').replace(/\/+$/, '').toLowerCase();
  const toUs = callbackUrl ? list.find((a) => a.override && norm(a.override) === norm(callbackUrl)) : null;
  if (toUs) return { state: 'platform', detail: `Suscrita con la URL de esta plataforma (${toUs.name || toUs.id}).`, apps: list };
  const overriddenElsewhere = list.find((a) => a.override && callbackUrl && norm(a.override) !== norm(callbackUrl));
  if (overriddenElsewhere) {
    return { state: 'other_app', detail: `Los eventos se desvían a otra URL (${overriddenElsewhere.override}). Los mensajes no llegan a esta plataforma.`, apps: list };
  }
  if (!platformAppId) {
    return { state: 'unknown', detail: `Suscrita a ${list.map((a) => `«${a.name || a.id}»`).join(', ')}, pero el servidor no tiene META_APP_ID para confirmar que sea la aplicación de esta plataforma.`, apps: list };
  }
  const ours = list.find((a) => a.id === String(platformAppId));
  if (ours) return { state: 'platform', detail: `Suscrita a la aplicación de esta plataforma (${ours.name || ours.id}).`, apps: list };
  return {
    state: 'other_app',
    detail: `Suscrita a ${list.map((a) => `«${a.name || a.id}» (${a.id})`).join(', ')}, que NO es la aplicación de esta plataforma (${platformAppId}). Meta entrega los mensajes a esa otra aplicación.`,
    apps: list,
  };
}

export default {
  STAGES, STAGE_KEYS, stageOrd, OUTCOMES, REASONS, describeReason,
  classifyMetaSendError, SEND_RETRY_DELAYS_MS, flattenWebhook,
  newProbeCode, extractProbe, maskPhone, previewText,
  HEALTH_STATES, evaluateLineHealth, judgeSubscription,
};
