#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// EL RECORRIDO de un mensaje entrante.  npm run test:whatsapp:inbound
// v4.1285.0
//
// SIN POSTGRES, SIN CREDENCIALES Y SIN RED: la base, Prisma, Meta y el modelo
// se sustituyen en memoria (los mismos dobles de `test:whatsapp:router`).
//
// Nació del caso de la Feria de Proyectos (2026-11-05): diagnóstico en verde,
// simulador respondiendo y ningún «Hola» real con respuesta. Cada grupo de
// abajo es una de las pruebas obligatorias del pedido, y casi todas llaman al
// `handleWebhook` REAL de punta a punta: el criterio puede estar perfecto y el
// fallo vivir en el cableado (v4.744, v4.889).
//
// LO QUE ESTA BATERÍA NO DEMUESTRA: que Meta entregue los mensajes de la línea
// real a esta plataforma. Eso sólo lo demuestra la «Prueba real por WhatsApp»
// del panel, contra producción. Se dice para no afirmar de más.
// ════════════════════════════════════════════════════════════════════
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import crypto from 'node:crypto';

const HERE = pathToFileURL(`${process.cwd()}/`).href;
const DB = new URL('./scripts/fixtures/db-whatsapp-stub.mjs', HERE).href;
const IA = new URL('./scripts/fixtures/ai-router-inbound-stub.mjs', HERE).href;
const PRISMA = new URL('./scripts/fixtures/prisma-whatsapp-stub.mjs', HERE).href;

register(
  `data:text/javascript,export async function resolve(s,c,n){
      if(/(^|\\/)db\\.js$/.test(s)) return {url:${JSON.stringify(DB)},shortCircuit:true};
      if(/(^|\\/)prisma\\.js$/.test(s)) return {url:${JSON.stringify(PRISMA)},shortCircuit:true};
      if(/ai-router\\.js$/.test(s)) return {url:${JSON.stringify(IA)},shortCircuit:true};
      return n(s,c);
   }`,
  HERE
);

const stub = await import(DB);
const ia = await import(IA);

// Los reintentos esperan 1 s y 3 s: en la prueba se acortan sin tocar el
// módulo, sustituyendo el reloj de `setTimeout` sólo para esas esperas.
const realSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = (fn, ms, ...a) => realSetTimeout(fn, ms >= 1000 && ms <= 3000 ? 1 : ms, ...a);

// ── Meta, en memoria y programable ────────────────────────────────────
const llamadas = [];
let colaRespuestas = []; // respuestas forzadas para POST /messages, en orden
globalThis.fetch = async (url, opts = {}) => {
  const cuerpo = opts.body ? JSON.parse(opts.body) : null;
  llamadas.push({ url: String(url), cuerpo, auth: opts.headers?.Authorization || null });
  if (/\/messages$/.test(String(url))) {
    const forzada = colaRespuestas.shift();
    if (forzada === 'red') throw Object.assign(new Error('fetch failed'), { name: 'TypeError' });
    if (forzada) {
      return { ok: false, status: forzada.status || 400, json: async () => ({ error: forzada.error }) };
    }
    return { ok: true, status: 200, json: async () => ({ messages: [{ id: `wamid.out.${llamadas.length}` }] }) };
  }
  return { ok: true, status: 200, json: async () => ({}) };
};

const { handleWebhook, verifyWebhook } = await import('../server/controllers/crmController.js');
const inbound = await import('../server/lib/whatsappInbound.js');
const { retryStuckInbound } = await import('../server/services/whatsappInboundProcessor.js');

let ok = 0; const malos = [];
const check = (n, cond, extra = '') => {
  if (cond) { ok++; console.log(`  ✓ ${n}`); }
  else { malos.push(n); console.log(`  ✗ ${n}${extra ? ` — ${extra}` : ''}`); }
};
const eq = (n, a, b) => check(n, JSON.stringify(a) === JSON.stringify(b), `esperaba ${JSON.stringify(b)}, dio ${JSON.stringify(a)}`);
const grupo = (t) => console.log(`\n${t}`);
const leer = (p) => readFileSync(new URL(`./${p}`, HERE), 'utf8');

// ── El escenario: el Distrito y la Feria, dos líneas del mismo sitio ──
const CLUB = 'club-4281';
const PNID_DISTRITO = '678649158667675';
const PNID_FERIA = '999888777666555';
const WABA = '1284652539842140';
const WABA_FERIA = '2222333344445555';

const conexiones = () => ([
  {
    id: 'conn-distrito', clubId: CLUB, displayName: 'WhatsApp Distrito 4281',
    phoneNumberId: PNID_DISTRITO, wabaId: WABA, accessTokenEnc: 'TOKEN-DISTRITO',
    webhookProvider: 'meta_cloud', status: 'active', isDefault: true, phoneNumber: '+57 300 0000000',
    lastVerifiedAt: '2026-09-01T10:00:00.000Z',
  },
  {
    id: 'conn-feria', clubId: CLUB, displayName: 'Feria de Proyectos Rotary Colombia',
    phoneNumberId: PNID_FERIA, wabaId: WABA_FERIA, accessTokenEnc: 'TOKEN-FERIA',
    webhookProvider: 'meta_cloud', status: 'active', isDefault: false, phoneNumber: '+57 321 6937317',
    lastVerifiedAt: '2026-09-02T10:00:00.000Z',
  },
]);
const agenteFeria = (extra = {}) => ({
  id: 'ag-feria', connectionId: 'conn-feria', clubId: CLUB, enabled: true, name: 'Asistente',
  systemPrompt: 'Eres el Asistente Virtual de la XII Feria de Proyectos Rotary Colombia – Valledupar 2027.',
  modelSlug: 'gemini-2.5-flash', useKnowledge: false, brainId: null, historyLimit: 12, humanPauseMinutes: 120,
  fallbackMessage: null, ...extra,
});
const agenteSitio = () => ({
  id: 'ag-sitio', clubId: CLUB, enabled: true, name: 'Asistente Distrito',
  systemPrompt: 'Eres el asistente del DISTRITO 4281.', modelSlug: 'gemini-2.5-flash',
  useKnowledge: false, historyLimit: 12, humanPauseMinutes: 120,
});

const preparar = ({ agente = agenteFeria(), extra = {} } = {}) => {
  stub.reset();
  ia.reset();
  llamadas.length = 0;
  colaRespuestas = [];
  delete process.env.WA_ENFORCE_SIGNATURE;
  stub.seed({
    Club: [{ id: CLUB, name: 'Distrito 4281' }],
    WhatsAppConnection: conexiones(),
    WhatsAppConnectionAgent: agente ? [agente] : [],
    WhatsAppAgentConfig: [agenteSitio()],
    ...extra,
  });
};

const cuerpoMensaje = ({ phoneNumberId = PNID_FERIA, wabaId = WABA_FERIA, from = '573001112233', text = 'Hola', id, type = 'text' }) => ({
  object: 'whatsapp_business_account',
  entry: [{
    id: wabaId,
    changes: [{
      field: 'messages',
      value: {
        metadata: { phone_number_id: phoneNumberId },
        contacts: [{ profile: { name: 'Rotario Prueba' }, wa_id: from }],
        messages: [{ from, id, timestamp: String(Math.floor(Date.now() / 1000)), type, ...(type === 'text' ? { text: { body: text } } : type === 'button' ? { button: { text } } : { [type]: { id: 'media-1' } }) }],
      },
    }],
  }],
});

const fakeRes = (alAcusar) => ({
  headersSent: false, statusCode: null, body: null,
  sendStatus(c) { this.statusCode = c; this.headersSent = true; if (alAcusar) realSetTimeout(alAcusar, 0); return this; },
  status(c) { this.statusCode = c; return this; },
  send(b) { this.body = b; this.headersSent = true; return this; },
  json(b) { this.body = b; this.headersSent = true; return this; },
});

const entregar = async (body, headers = {}, rawBody = null) => {
  const res = fakeRes();
  await handleWebhook({ body, headers, rawBody: rawBody || JSON.stringify(body) }, res);
  await new Promise((r) => realSetTimeout(r, 5));
  return res;
};

const trazas = () => stub.tablas.WhatsAppInboundTrace;
// Lo que vio el AGENTE (no la detección de intención de la bandeja, que también
// llama al modelo): su prompt de sistema lleva las reglas de estilo.
const agenteVio = () => ia.vistos.filter((v) => v.systemPrompt.includes('Reglas de estilo'));
const traza = (mid) => trazas().find((t) => t.messageId === mid);
const enviosAMeta = () => llamadas.filter((l) => /\/messages$/.test(l.url));
const stampsDe = (t) => { try { return typeof t?.stamps === 'string' ? JSON.parse(t.stamps) : (t?.stamps || {}); } catch { return {}; } };

// ════════════════════════════════════════════════════════════════════
grupo('1. Verificación del webhook (GET de Meta)');
{
  process.env.WA_VERIFY_TOKEN = 'verif-plataforma';
  stub.reset();
  const ok200 = fakeRes();
  await verifyWebhook({ query: { 'hub.mode': 'subscribe', 'hub.verify_token': 'verif-plataforma', 'hub.challenge': '12345' } }, ok200);
  eq('responde el challenge con el token correcto', [ok200.statusCode, ok200.body], [200, '12345']);
  stub.seed({ WhatsAppConfig: [{ id: 'cfg', verifyToken: 'otro' }], WhatsAppConnection: [{ id: 'c1', verifyToken: 'token-de-la-linea' }] });
  const deLinea = fakeRes();
  await verifyWebhook({ query: { 'hub.mode': 'subscribe', 'hub.verify_token': 'token-de-la-linea', 'hub.challenge': '777' } }, deLinea);
  eq('acepta el verify_token de una línea conectada (override de la Feria)', [deLinea.statusCode, deLinea.body], [200, '777']);
  const malo = fakeRes();
  await verifyWebhook({ query: { 'hub.mode': 'subscribe', 'hub.verify_token': 'equivocado', 'hub.challenge': '1' } }, malo);
  eq('rechaza un token equivocado', malo.statusCode, 403);
}

// ════════════════════════════════════════════════════════════════════
grupo('2. Mensaje entrante real: «Hola» a la Feria recibe respuesta (criterio de aceptación)');
preparar();
{
  const res = await entregar(cuerpoMensaje({ id: 'wamid.hola.1', text: 'Hola' }));
  eq('responde 200 a Meta', res.statusCode, 200);
  const t = traza('wamid.hola.1');
  check('queda una traza del mensaje', !!t);
  eq('la traza termina en «respondido»', t?.outcome, 'replied');
  eq('identificó la línea de la Feria', t?.connectionId, 'conn-feria');
  eq('con el agente propio de la línea', [t?.agentSource, t?.agentName], ['connection', 'Asistente']);
  const s = stampsDe(t);
  check('pasó por todas las etapas hasta «Meta aceptó»',
    ['received', 'validated', 'line_identified', 'stored', 'agent_selected', 'processing', 'reply_generated', 'sent_to_meta', 'meta_accepted'].every((k) => s[k]),
    JSON.stringify(Object.keys(s)));
  check('anotó el id que devolvió Meta', /^wamid\.out\./.test(t?.replyMessageId || ''));
  const envio = enviosAMeta()[0];
  check('la respuesta salió por el número de la FERIA', envio?.url.endsWith(`/${PNID_FERIA}/messages`), envio?.url);
  eq('con el token de la Feria', envio?.auth, 'Bearer TOKEN-FERIA');
  eq('al destinatario en dígitos, sin «+»', envio?.cuerpo?.to, '573001112233');
  eq('como texto normal (no plantilla de marketing)', envio?.cuerpo?.type, 'text');
  check('el agente usó la instrucción de la Feria', agenteVio()[0]?.systemPrompt.includes('Feria de Proyectos'));
  const salientes = stub.tablas.WhatsAppMessageLog.filter((m) => m.direction === 'outgoing');
  eq('la conversación queda registrada en el CRM (entrante + respuesta)',
    [stub.tablas.WhatsAppMessageLog.filter((m) => m.direction === 'incoming').length, salientes.length], [1, 1]);
  eq('la respuesta queda atribuida a la línea', salientes[0]?.connectionId, 'conn-feria');
}

// ════════════════════════════════════════════════════════════════════
grupo('3. Evento duplicado: Meta reintenta y NO se responde dos veces');
preparar();
{
  const body = cuerpoMensaje({ id: 'wamid.dup.1', text: 'Estoy interesado' });
  await entregar(body);
  await entregar(body);
  eq('una sola respuesta para dos entregas', enviosAMeta().length, 1);
  eq('una sola traza', trazas().length, 1);

  // Dos entregas SIMULTÁNEAS: antes las dos pasaban el SELECT de
  // deduplicación y las dos respondían.
  preparar();
  const b2 = cuerpoMensaje({ id: 'wamid.dup.2', text: 'Hola' });
  await Promise.all([entregar(b2), entregar(b2)]);
  eq('dos entregas a la vez: una sola respuesta', enviosAMeta().length, 1);
}

// ════════════════════════════════════════════════════════════════════
grupo('4. Lotes: el mensaje de la Feria que viene DETRÁS de otros cambios');
preparar();
{
  const body = {
    object: 'whatsapp_business_account',
    entry: [
      { id: WABA, changes: [{ field: 'messages', value: { metadata: { phone_number_id: PNID_DISTRITO }, statuses: [{ id: 'wamid.x', status: 'delivered', timestamp: '1700000000' }] } }] },
      { id: WABA_FERIA, changes: [
        { field: 'message_template_status_update', value: { event: 'APPROVED', message_template_name: 'x' } },
        cuerpoMensaje({ id: 'wamid.lote.1', text: 'Hola' }).entry[0].changes[0],
      ] },
    ],
  };
  await entregar(body);
  eq('el mensaje de la segunda entrada se procesó y respondió', traza('wamid.lote.1')?.outcome, 'replied');
  eq('flattenWebhook ve los tres cambios', inbound.flattenWebhook(body).length, 3);
}

// ════════════════════════════════════════════════════════════════════
grupo('5. Firma inválida: se registra; bloquea sólo con WA_ENFORCE_SIGNATURE');
preparar();
{
  process.env.META_APP_SECRET = 'secreto';
  const body = cuerpoMensaje({ id: 'wamid.firma.1' });
  const raw = JSON.stringify(body);
  await entregar(body, { 'x-hub-signature-256': 'sha256=' + 'a'.repeat(64) }, raw);
  eq('se anota la firma como inválida', traza('wamid.firma.1')?.signature, 'invalida');
  eq('sin la variable, responde igual (una línea con override firma con otra app)', traza('wamid.firma.1')?.outcome, 'replied');

  preparar();
  process.env.WA_ENFORCE_SIGNATURE = 'true';
  const b2 = cuerpoMensaje({ id: 'wamid.firma.2' });
  await entregar(b2, { 'x-hub-signature-256': 'sha256=' + 'b'.repeat(64) }, JSON.stringify(b2));
  eq('con la variable, NO responde', enviosAMeta().length, 0);
  eq('y dice por qué', traza('wamid.firma.2')?.reason, 'firma_invalida');

  preparar();
  process.env.WA_ENFORCE_SIGNATURE = 'true';
  const b3 = cuerpoMensaje({ id: 'wamid.firma.3' });
  const raw3 = JSON.stringify(b3);
  const firma = 'sha256=' + crypto.createHmac('sha256', 'secreto').update(raw3).digest('hex');
  await entregar(b3, { 'x-hub-signature-256': firma }, raw3);
  eq('una firma válida pasa aun con la variable', [traza('wamid.firma.3')?.signature, traza('wamid.firma.3')?.outcome], ['valida', 'replied']);
  delete process.env.WA_ENFORCE_SIGNATURE;
  delete process.env.META_APP_SECRET;
}

// ════════════════════════════════════════════════════════════════════
grupo('6. Identificación de la línea y selección del agente correcto');
preparar();
{
  await entregar(cuerpoMensaje({ phoneNumberId: PNID_DISTRITO, wabaId: WABA, id: 'wamid.d.1', text: 'Hola distrito' }));
  await entregar(cuerpoMensaje({ id: 'wamid.f.1', text: 'Hola feria' }));
  eq('el del Distrito: su línea y el agente HEREDADO del sitio',
    [traza('wamid.d.1')?.connectionId, traza('wamid.d.1')?.agentSource], ['conn-distrito', 'site']);
  eq('el de la Feria: su línea y su agente PROPIO',
    [traza('wamid.f.1')?.connectionId, traza('wamid.f.1')?.agentSource], ['conn-feria', 'connection']);
  check('cada uno con su instrucción',
    agenteVio().some((v) => v.systemPrompt.includes('DISTRITO 4281')) && agenteVio().some((v) => v.systemPrompt.includes('Feria de Proyectos')));
  check('y cada respuesta por su número',
    enviosAMeta().some((l) => l.url.endsWith(`/${PNID_DISTRITO}/messages`)) && enviosAMeta().some((l) => l.url.endsWith(`/${PNID_FERIA}/messages`)));
}

// ════════════════════════════════════════════════════════════════════
grupo('7. Aislamiento: apagar el agente de la Feria no toca al Distrito');
preparar({ agente: agenteFeria({ enabled: false }) });
{
  await entregar(cuerpoMensaje({ id: 'wamid.iso.f' }));
  await entregar(cuerpoMensaje({ phoneNumberId: PNID_DISTRITO, wabaId: WABA, id: 'wamid.iso.d' }));
  eq('la Feria no responde y dice por qué (agente propio apagado)',
    [traza('wamid.iso.f')?.outcome, traza('wamid.iso.f')?.reason], ['skipped', 'agente_apagado']);
  eq('NO cae al agente del sitio (sólo el Distrito lo usó)', agenteVio().filter((v) => v.systemPrompt.includes('DISTRITO')).length, 1);
  eq('el agente sólo corrió una vez (el del Distrito)', agenteVio().length, 1);
  eq('el Distrito responde normalmente', traza('wamid.iso.d')?.outcome, 'replied');
}

// ════════════════════════════════════════════════════════════════════
grupo('8. Error de envío: un destinatario fuera de la ventana NO apaga la línea');
preparar();
{
  colaRespuestas = [{ status: 400, error: { code: 131047, message: 'Re-engagement message' } }];
  await entregar(cuerpoMensaje({ id: 'wamid.err.1' }));
  const t = traza('wamid.err.1');
  eq('la traza termina en «falló» con el rechazo de Meta', [t?.outcome, t?.reason, t?.metaErrorCode], ['failed', 'meta_rechazo', '131047']);
  check('pasó por «Solicitud enviada a Meta» y no por «Meta aceptó»', stampsDe(t).sent_to_meta && !stampsDe(t).meta_accepted);
  const mk = stub.consultas.find((q) => /UPDATE "WhatsAppConnection" SET "lastError"/.test(q.sql));
  check('se anota el error en la conexión', !!mk);
  eq('pero SIN degradarla (el tercer parámetro es `degrade`)', mk?.params?.[2], false);
  eq('no se reintenta un rechazo definitivo', enviosAMeta().length, 1);

  await entregar(cuerpoMensaje({ id: 'wamid.err.2', from: '573009998877' }));
  eq('el siguiente contacto SÍ recibe respuesta', traza('wamid.err.2')?.outcome, 'replied');

  preparar();
  colaRespuestas = [{ status: 401, error: { code: 190, message: 'Error validating access token' } }];
  await entregar(cuerpoMensaje({ id: 'wamid.err.3' }));
  const mk2 = stub.consultas.find((q) => /UPDATE "WhatsAppConnection" SET "lastError"/.test(q.sql));
  eq('un token vencido (190) SÍ degrada la línea', mk2?.params?.[2], true);
}

// ════════════════════════════════════════════════════════════════════
grupo('9. Falla pasajera de Meta: se reintenta y se responde UNA vez');
preparar();
{
  colaRespuestas = [{ status: 429, error: { code: 130429, message: 'Rate limit hit' } }, 'red'];
  await entregar(cuerpoMensaje({ id: 'wamid.tmp.1' }));
  eq('tres intentos (límite, red, éxito)', enviosAMeta().length, 3);
  eq('y la traza queda respondida', traza('wamid.tmp.1')?.outcome, 'replied');
  eq('una sola respuesta registrada', stub.tablas.WhatsAppMessageLog.filter((m) => m.direction === 'outgoing').length, 1);
}

// ════════════════════════════════════════════════════════════════════
grupo('10. Falla temporal de la IA: mensaje de respaldo, o motivo explícito');
preparar({ agente: agenteFeria({ fallbackMessage: 'En un momento te atiende una persona de la Feria.' }) });
{
  ia.setModo('falla');
  await entregar(cuerpoMensaje({ id: 'wamid.ia.1' }));
  const t = traza('wamid.ia.1');
  eq('con respaldo configurado: responde con el respaldo', [t?.outcome, t?.usedFallback], ['replied', true]);
  eq('el texto enviado es el respaldo', enviosAMeta()[0]?.cuerpo?.text?.body, 'En un momento te atiende una persona de la Feria.');
}
preparar();
{
  ia.setModo('falla');
  await entregar(cuerpoMensaje({ id: 'wamid.ia.2' }));
  const t = traza('wamid.ia.2');
  eq('sin respaldo: no envía nada y lo dice', [t?.outcome, t?.reason], ['failed', 'ia_sin_respuesta']);
  check('con el error del modelo en el detalle', /Gemini 503/.test(t?.reasonDetail || ''), t?.reasonDetail);
  eq('ningún envío a Meta', enviosAMeta().length, 0);
}

// ════════════════════════════════════════════════════════════════════
grupo('11. Conversación asignada a una persona (pausa): no responde y lo dice');
preparar({
  extra: {
    WhatsAppContact: [{
      id: 'ct-pausa', clubId: CLUB, phone: '+573005556677', name: 'Con pausa',
      profilePictureUrl: 'x', autoReplyPausedUntil: new Date(Date.now() + 3600e3).toISOString(),
    }],
  },
});
{
  await entregar(cuerpoMensaje({ id: 'wamid.pausa.1', from: '573005556677' }));
  const t = traza('wamid.pausa.1');
  eq('sin respuesta automática por pausa humana', [t?.outcome, t?.reason], ['skipped', 'pausa_humana']);
  eq('ningún envío a Meta', enviosAMeta().length, 0);
  check('el motivo es «de regla», no una avería', inbound.REASONS.pausa_humana.human === true);
}

// ════════════════════════════════════════════════════════════════════
grupo('12. Respuesta a un botón de plantilla: el agente la atiende');
preparar();
{
  await entregar(cuerpoMensaje({ id: 'wamid.btn.1', type: 'button', text: 'Estoy interesado' }));
  eq('un toque en un botón de respuesta rápida recibe respuesta', traza('wamid.btn.1')?.outcome, 'replied');
  check('el agente leyó el texto del botón', agenteVio()[0]?.userPrompt.includes('Estoy interesado'));

  await entregar(cuerpoMensaje({ id: 'wamid.img.1', type: 'image' }));
  eq('una imagen queda para una persona, con su motivo', traza('wamid.img.1')?.reason, 'no_es_texto');
}

// ════════════════════════════════════════════════════════════════════
grupo('13. Prueba real de punta a punta: el código viaja y el agente no lo ve');
preparar();
{
  const code = inbound.newProbeCode(() => 0.5);
  check('el código tiene la forma esperada', /^PRUEBA-[A-Z2-9]{6}$/.test(code), code);
  await entregar(cuerpoMensaje({ id: 'wamid.probe.1', text: `Hola ${code}` }));
  const t = traza('wamid.probe.1');
  eq('la traza lleva el código', t?.probeCode, code);
  eq('y termina respondida', t?.outcome, 'replied');
  eq('el agente recibió «Hola», sin el código', agenteVio()[0]?.userPrompt, 'Hola');
  check('ni el agente ni la bandeja vieron el código', ia.vistos.every((v) => !v.userPrompt.includes(code)));
  eq('extractProbe tolera minúsculas y espacio', inbound.extractProbe(`hola prueba ${code.slice(7).toLowerCase()}`).code, code);
}

// ════════════════════════════════════════════════════════════════════
grupo('14. El estado de entrega de la respuesta cierra el recorrido');
preparar();
{
  await entregar(cuerpoMensaje({ id: 'wamid.st.1' }));
  const replyId = traza('wamid.st.1')?.replyMessageId;
  await entregar({
    object: 'whatsapp_business_account',
    entry: [{ id: WABA_FERIA, changes: [{ field: 'messages', value: { metadata: { phone_number_id: PNID_FERIA }, statuses: [{ id: replyId, status: 'delivered', timestamp: String(Math.floor(Date.now() / 1000)) }] } }] }],
  });
  const t = traza('wamid.st.1');
  eq('la traza llega a «Entregado al usuario»', [t?.stage, t?.replyStatus], ['delivered', 'delivered']);
}

// ════════════════════════════════════════════════════════════════════
grupo('15. Número desconocido: queda traza fallida, no un descarte mudo');
preparar();
{
  await entregar(cuerpoMensaje({ phoneNumberId: '000000000000', wabaId: '111', id: 'wamid.nadie.1' }));
  const t = traza('wamid.nadie.1');
  eq('traza fallida', t?.outcome, 'failed');
  check('que nombra el número que no se encontró', /000000000000/.test(t?.reasonDetail || ''));
  eq('y ningún envío', enviosAMeta().length, 0);
}

// ════════════════════════════════════════════════════════════════════
grupo('16. El reintento retoma lo interrumpido y NO duplica lo que pudo salir');
preparar({
  extra: {
    WhatsAppContact: [{ id: 'ct-r', clubId: CLUB, phone: '+573001112299', name: 'Reintento', profilePictureUrl: 'x' }],
    WhatsAppInboundTrace: [
      { id: 'tr-1', messageId: 'wamid.r.1', clubId: CLUB, connectionId: 'conn-feria', contactId: 'ct-r', phone: '+573001112299', messageType: 'text', messageText: 'Hola', stage: 'stored', outcome: 'pending', attempts: 0, receivedAt: new Date().toISOString(), signature: 'sin_comprobar' },
      { id: 'tr-2', messageId: 'wamid.r.2', clubId: CLUB, connectionId: 'conn-feria', contactId: 'ct-r', phone: '+573001112299', messageType: 'text', messageText: 'Hola', stage: 'sent_to_meta', outcome: 'pending', attempts: 0, receivedAt: new Date().toISOString(), signature: 'sin_comprobar' },
    ],
  },
});
{
  const r = await retryStuckInbound({ limit: 10 });
  eq('encuentra las dos', r.found, 2);
  eq('retoma la que no llegó a pedir el envío', stub.tablas.WhatsAppInboundTrace.find((t) => t.id === 'tr-1')?.outcome, 'replied');
  eq('cierra sin reintentar la que ya lo había pedido', [stub.tablas.WhatsAppInboundTrace.find((t) => t.id === 'tr-2')?.outcome, stub.tablas.WhatsAppInboundTrace.find((t) => t.id === 'tr-2')?.reason], ['failed', 'resultado_desconocido']);
  eq('un solo envío a Meta', enviosAMeta().length, 1);
}

// ════════════════════════════════════════════════════════════════════
grupo('17. Criterio puro: errores de Meta, suscripción y salud');
{
  const c = inbound.classifyMetaSendError;
  eq('131047 (fuera de ventana): ni de línea ni pasajero', [c({ metaCode: 131047, httpStatus: 400 }).lineLevel, c({ metaCode: 131047, httpStatus: 400 }).transient], [false, false]);
  eq('131026 (sin WhatsApp): no degrada', c({ metaCode: 131026, httpStatus: 400 }).lineLevel, false);
  eq('190 (token): degrada', c({ metaCode: 190, httpStatus: 401 }).lineLevel, true);
  eq('130429 (límite): pasajero', c({ metaCode: 130429, httpStatus: 429 }).transient, true);
  eq('5xx: pasajero', c({ metaCode: null, httpStatus: 503 }).transient, true);

  const j = inbound.judgeSubscription;
  const app = (id, name, override) => ({ whatsapp_business_api_data: { id, name }, ...(override ? { override_callback_uri: override } : {}) });
  eq('suscrita a OTRA app: verde falso destapado',
    j({ apps: [app('999', 'App Feria')], platformAppId: '111', callbackUrl: 'https://x.org/api/crm/webhook' }).state, 'other_app');
  eq('suscrita a la app de la plataforma', j({ apps: [app('111', 'Club Platform')], platformAppId: '111' }).state, 'platform');
  eq('override hacia nuestra URL cuenta como nuestra',
    j({ apps: [app('999', 'App Feria', 'https://x.org/api/crm/webhook/')], platformAppId: '111', callbackUrl: 'https://x.org/api/crm/webhook' }).state, 'platform');
  eq('override hacia OTRA URL es otra app',
    j({ apps: [app('111', 'Club Platform', 'https://otro.com/hook')], platformAppId: '111', callbackUrl: 'https://x.org/api/crm/webhook' }).state, 'other_app');
  eq('sin suscripción', j({ apps: [], platformAppId: '111' }).state, 'none');
  eq('sin poder consultar: desconocido, no verde', j({ apps: null, platformAppId: '111' }).state, 'unknown');

  const base = {
    now: '2026-11-05T20:00:00Z', hasToken: true, tokenValid: true, phoneMatchesWaba: true,
    subscription: { state: 'platform', detail: 'ok' }, status: 'active',
    agent: { source: 'connection', enabled: true, hasInstruction: true, name: 'Asistente' },
  };
  eq('credenciales válidas SIN mensajes reales: «Conectado», no «Operativo»',
    inbound.evaluateLineHealth({ ...base, traces: {} }).overall, 'conectado');
  eq('con recepción y respuestas demostradas: «Operativo»',
    inbound.evaluateLineHealth({
      ...base, lastWebhookAt: '2026-11-05T19:00:00Z',
      traces: { total: 10, replied: 10, lastRunAt: '2026-11-05T19:00:00Z', lastReplyAt: '2026-11-05T19:00:00Z' },
    }).overall, 'operativo');
  eq('salen campañas y no vuelve ningún evento: «Error»',
    inbound.evaluateLineHealth({ ...base, outbound7d: 40, statusesBack7d: 0, lastWebhookAt: null, traces: {} }).overall, 'error');
  eq('suscrita a otra app: «Error» aunque el token sea válido',
    inbound.evaluateLineHealth({ ...base, subscription: { state: 'other_app', detail: 'x' }, traces: {} }).overall, 'error');
  check('todo motivo del catálogo tiene su salida', Object.values(inbound.REASONS).every((r) => r.title && r.fix));
}

// ════════════════════════════════════════════════════════════════════
grupo('18. Cableado que sólo se ve leyendo los archivos');
{
  const ctl = leer('server/controllers/crmController.js');
  check('una PLANTILLA enviada desde el Chat no pausa al agente', /if \(logTemplateName\) throw new Error\('plantilla: no pausa'\)/.test(ctl));
  check('el envío a Meta tiene tope de tiempo', /AbortSignal\.timeout\(20000\)/.test(ctl));
  check('el webhook recorre TODO el lote', /flattenWebhook\(body\)/.test(ctl) && !/body\.entry\?\.\[0\]\?\.changes\?\.\[0\]\?\.value;\n/.test(ctl));
  check('la idempotencia es el reclamo de la traza', /claimInbound\(\{/.test(ctl));
  const proc = leer('server/services/whatsappInboundProcessor.js');
  check('una línea con agente propio no contesta con el menú global del chatbot', /out\?\.reply && !lineHasOwnAgent/.test(proc));
  const cron = leer('server/routes/cron.js');
  check('el cron retoma los entrantes interrumpidos', /retryStuckInbound/.test(cron));
  const guard = leer('scripts/db-push-guard.mjs');
  check('la tabla nueva está en la lista del guardián de db:push', /WhatsAppInboundTrace/.test(guard));
  const store = leer('server/lib/whatsappInboundStore.js');
  check('el índice único de la idempotencia existe', /CREATE UNIQUE INDEX IF NOT EXISTS "uniq_wa_inbound_trace_message"/.test(store));
  check('ninguna comilla invertida dentro de un db.query del store',
    !/db\.query\(\s*`[^`]*\\`/.test(store));
  const conns = leer('server/controllers/crm/connections.controller.js');
  check('el diagnóstico compara la suscripción con la app de la plataforma', /judgeSubscription\(\{/.test(conns));
  check('«Dirigir el webhook» usa override_callback_uri', /override_callback_uri: callbackUrl/.test(conns));
  check('el reporte de sin respuesta NO envía nada', !/sendWhatsAppTextMessage/.test(conns.slice(conns.indexOf('export const unanswered'))));
}

console.log('\n──────────────────────────────────────────────────────────────');
console.log(`${ok} comprobaciones pasaron, ${malos.length} fallaron.`);
if (malos.length) { console.log('FALLARON:'); malos.forEach((m) => console.log(`  - ${m}`)); process.exit(1); }
console.log('OK.');
process.exit(0);
