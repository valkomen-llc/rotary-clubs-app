#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// EL CAMINO del router multi-WABA.  npm run test:whatsapp:router
// v4.992.0
//
// SIN POSTGRES, SIN CREDENCIALES Y SIN RED: la base, Prisma y Meta se sustituyen
// en memoria con un hook de resolución de módulos.
//
// ⚠️ POR QUÉ HACE FALTA ADEMÁS DE `test:whatsapp:connections`.
//
// El criterio puede estar PERFECTO y el defecto vivir en el camino. Es la
// lección de v4.744 —`pickDistrictSite` era correcto y el fallo estaba en la
// ruta—, la de v4.889 y la de v4.938: el criterio de visibilidad de las
// publicaciones nunca estuvo mal, lo que estaba mal era el `WHERE` que escribía
// el controlador, y una prueba de criterio habría pasado en verde con el
// fantasma delante.
//
// Acá eso se traduce en las trece comprobaciones que el pedido enumera y que
// SÓLO se ven ejecutando el webhook de punta a punta: que un mensaje a la
// cuenta A caiga exclusivamente en el inbox A, que A use el agente A, que la
// respuesta salga por el número que recibió, y que la cuenta que ya estaba
// configurada siga funcionando después de la migración.
// ════════════════════════════════════════════════════════════════════
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';

const HERE = pathToFileURL(`${process.cwd()}/`).href;
const DB = new URL('./scripts/fixtures/db-whatsapp-stub.mjs', HERE).href;
const IA = new URL('./scripts/fixtures/ai-router-whatsapp-stub.mjs', HERE).href;
const PRISMA = new URL('./scripts/fixtures/prisma-whatsapp-stub.mjs', HERE).href;

// ⚠️ El hook compara contra `/db.js` y `/prisma.js`, no contra las rutas largas:
// los módulos de `server/lib` se importan entre sí como `'./db.js'` y con el
// sufijo largo no casarían. No fallaría ruidosamente — se conectaría a un
// Postgres que no está y todo daría error de conexión (la lección de
// `test:ledger:write`).
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

// ── Meta, en memoria. Guarda TODO lo que se le mandó ──────────────────
export const llamadasAMeta = [];
globalThis.fetch = async (url, opts = {}) => {
  const cuerpo = opts.body ? JSON.parse(opts.body) : null;
  llamadasAMeta.push({
    url: String(url),
    autorizacion: opts.headers?.Authorization || null,
    cuerpo,
  });
  if (/\/messages$/.test(String(url))) {
    return {
      ok: true, status: 200,
      json: async () => ({ messages: [{ id: `wamid.${llamadasAMeta.length}` }] }),
    };
  }
  return { ok: true, status: 200, json: async () => ({ verified_name: 'Prueba' }) };
};

// El doble del modelo de lenguaje guarda los prompts de sistema que vio: es lo
// único que demuestra CUÁL agente atendió cada mensaje.
const ia = await import(IA);
const promptsVistos = ia.promptsVistos;

const { handleWebhook } = await import('../server/controllers/crmController.js');

let ok = 0; const malos = [];
const check = (n, cond, extra = '') => {
  if (cond) { ok++; console.log(`  ✓ ${n}`); }
  else { malos.push(n); console.log(`  ✗ ${n}${extra ? ` — ${extra}` : ''}`); }
};
const eq = (n, a, b) => check(n, JSON.stringify(a) === JSON.stringify(b),
  `esperaba ${JSON.stringify(b)}, dio ${JSON.stringify(a)}`);
const grupo = (t) => console.log(`\n${t}`);

// ── El escenario del pedido: dos líneas del MISMO sitio ───────────────
const CLUB = 'club-4281';
const OTRO_CLUB = 'club-ajeno';
const PNID_DISTRITO = '678649158667675';
const PNID_FERIA = '999888777666555';
const WABA = '1284652539842140';

const CONEXIONES = () => ([
  {
    id: 'conn-distrito', clubId: CLUB, displayName: 'WhatsApp Distrito 4281',
    phoneNumberId: PNID_DISTRITO, wabaId: WABA, appId: '1031287984633208',
    accessTokenEnc: 'TOKEN-DISTRITO', verifyToken: 'v', webhookProvider: 'meta_cloud',
    status: 'active', isDefault: true, siteId: CLUB, siteType: 'district',
    campaignId: null, projectId: null, eventId: null, origin: 'manual',
    lastVerifiedAt: '2026-09-01T10:00:00.000Z',
  },
  {
    id: 'conn-feria', clubId: CLUB, displayName: 'WhatsApp Feria de Proyectos',
    phoneNumberId: PNID_FERIA, wabaId: WABA, appId: '1031287984633208',
    accessTokenEnc: 'TOKEN-FERIA', verifyToken: 'v', webhookProvider: 'meta_cloud',
    status: 'active', isDefault: false, siteId: CLUB, siteType: 'district',
    campaignId: null, projectId: 'feria-xii', eventId: null, origin: 'manual',
    lastVerifiedAt: '2026-09-02T10:00:00.000Z',
  },
]);

const AGENTES = () => ([
  {
    id: 'ag-feria', connectionId: 'conn-feria', clubId: CLUB, enabled: true,
    name: 'Asistente Feria de Proyectos',
    systemPrompt: 'Sos el asistente de la FERIA DE PROYECTOS: inscripciones, formularios, postulaciones, pagos.',
    modelSlug: 'gemini-2.5-flash', useKnowledge: false, brainId: null,
    temperature: 0.6, maxTokens: 600, historyLimit: 12, humanPauseMinutes: 120,
  },
]);

const AGENTE_SITIO = () => ([
  {
    id: 'ag-sitio', clubId: CLUB, enabled: true, name: 'Asistente',
    systemPrompt: 'Sos el asistente virtual de WhatsApp del DISTRITO 4281.',
    modelSlug: 'gemini-2.5-flash', useKnowledge: false,
    temperature: 0.6, maxTokens: 600, historyLimit: 12, humanPauseMinutes: 120,
  },
]);

const preparar = (extra = {}) => {
  stub.reset();
  llamadasAMeta.length = 0;
  ia.reset();
  stub.seed({
    Club: [{ id: CLUB, name: 'Distrito 4281' }, { id: OTRO_CLUB, name: 'Club Ajeno' }],
    WhatsAppConnection: CONEXIONES(),
    WhatsAppConnectionAgent: AGENTES(),
    WhatsAppAgentConfig: AGENTE_SITIO(),
    ...extra,
  });
};

/** Simula una entrega de Meta y espera a que el webhook termine. */
const entregar = async ({ phoneNumberId, wabaId = WABA, from, text, id }) => {
  const body = {
    object: 'whatsapp_business_account',
    entry: [{
      id: wabaId,
      changes: [{
        value: {
          metadata: { phone_number_id: phoneNumberId },
          contacts: [{ profile: { name: 'Rotario Prueba' }, wa_id: from }],
          messages: [{ from, id, timestamp: String(Math.floor(Date.now() / 1000)), type: 'text', text: { body: text } }],
        },
      }],
    }],
  };
  let resuelto;
  const espera = new Promise((r) => { resuelto = r; });
  const res = {
    headersSent: false,
    sendStatus() { this.headersSent = true; setTimeout(resuelto, 0); return this; },
    status() { return this; }, json() { return this; }, send() { return this; },
  };
  await handleWebhook({ body, headers: {}, rawBody: JSON.stringify(body) }, res);
  await espera;
  // El webhook cierra su bitácora después del 200; se le da una vuelta al bucle
  // de eventos para que el trabajo diferido termine antes de mirar la base.
  await new Promise((r) => setTimeout(r, 10));
};

const mensajes = (dir) => stub.tablas.WhatsAppMessageLog.filter((m) => m.direction === dir);
const enviosAMeta = () => llamadasAMeta.filter((l) => /\/messages$/.test(l.url));

// ════════════════════════════════════════════════════════════════════
grupo('1. Dos cuentas activas a la vez, y cada mensaje cae en SU inbox');

preparar();
await entregar({ phoneNumberId: PNID_DISTRITO, from: '573001112233', text: 'Hola distrito', id: 'wamid.in.A' });
await entregar({ phoneNumberId: PNID_FERIA, from: '573001112233', text: 'Hola feria', id: 'wamid.in.B' });

const entrantes = mensajes('incoming');
eq('llegaron los dos mensajes', entrantes.length, 2);

const alDistrito = entrantes.find((m) => m.bodyText === 'Hola distrito');
const aLaFeria = entrantes.find((m) => m.bodyText === 'Hola feria');
eq('el del Distrito quedó en la línea del Distrito', alDistrito?.connectionId, 'conn-distrito');
eq('el de la Feria quedó en la línea de la Feria', aLaFeria?.connectionId, 'conn-feria');
check('ninguno quedó sin línea', entrantes.every((m) => !!m.connectionId));
eq('los dos se atribuyeron al mismo sitio', [...new Set(entrantes.map((m) => m.clubId))], [CLUB]);

// ⚠️ EL AISLAMIENTO QUE MÁS IMPORTA: es la MISMA persona escribiendo a las dos
// líneas. Sin `connectionId` en el índice de conversaciones, esto sería UN hilo.
grupo('2. La misma persona en dos líneas: DOS hilos, UNA ficha');

eq('una sola ficha de contacto, no dos', stub.tablas.WhatsAppContact.length, 1);
eq('dos conversaciones abiertas', stub.tablas.CrmConversation.length, 2);
eq('cada hilo con su línea',
  stub.tablas.CrmConversation.map((c) => c.connectionId).sort(),
  ['conn-distrito', 'conn-feria']);
eq('y las dos del mismo contacto',
  [...new Set(stub.tablas.CrmConversation.map((c) => c.contactId))].length, 1);

// El canal es lo que registra «se la alcanzó por acá» sin duplicar la persona.
eq('dos canales, uno por línea', stub.tablas.ContactChannel.length, 2);
eq('con la misma dirección',
  [...new Set(stub.tablas.ContactChannel.map((c) => c.address))], ['+573001112233']);

grupo('3. Cada línea usa SU agente');

// El agente contesta con el prompt que recibió, así que el prompt dice quién
// atendió. Es lo único que lo demuestra sin mirar estado interno.
check('la Feria fue atendida por el asistente de la Feria',
  promptsVistos.some((p) => /FERIA DE PROYECTOS/.test(p)),
  `prompts vistos: ${JSON.stringify(promptsVistos.map((p) => p.slice(0, 40)))}`);
check('el Distrito, por el del Distrito (heredado del sitio)',
  promptsVistos.some((p) => /DISTRITO 4281/.test(p)));
// Exactamente UNO de cada, y ninguno de los dos atendiendo el mensaje del
// otro. Contar las llamadas al modelo NO sirve: la detección de intención de la
// bandeja también consulta el modelo cuando ninguna palabra clave resuelve, así
// que el total es 3 y no 2 — y ese número cambiaría con cualquier mejora del
// clasificador. Lo que no puede cambiar es cuántas veces atendió cada agente.
eq('el asistente de la Feria atendió UNA vez',
  promptsVistos.filter((p) => /FERIA DE PROYECTOS/.test(p)).length, 1);
eq('el del Distrito, UNA vez',
  promptsVistos.filter((p) => /DISTRITO 4281/.test(p)).length, 1);
check('y ningún prompt mezcló las dos líneas',
  !promptsVistos.some((p) => /FERIA DE PROYECTOS/.test(p) && /DISTRITO 4281/.test(p)));

grupo('4. ⚠️ La respuesta sale por el número que RECIBIÓ');

const envios = enviosAMeta();
eq('salieron dos respuestas', envios.length, 2);
const porDistrito = envios.find((l) => l.url.includes(PNID_DISTRITO));
const porFeria = envios.find((l) => l.url.includes(PNID_FERIA));
check('una salió por el número del Distrito', !!porDistrito);
check('la otra por el número de la Feria', !!porFeria);
// Y con la credencial de ESA línea, no con la de la otra.
eq('con el token del Distrito', porDistrito?.autorizacion, 'Bearer TOKEN-DISTRITO');
eq('con el token de la Feria', porFeria?.autorizacion, 'Bearer TOKEN-FERIA');

const salientes = mensajes('outgoing');
eq('las dos salidas conservan su línea',
  salientes.map((m) => m.connectionId).sort(), ['conn-distrito', 'conn-feria']);

grupo('5. Desactivar una cuenta no toca la otra');

preparar({
  WhatsAppConnection: CONEXIONES().map((c) =>
    c.id === 'conn-distrito' ? { ...c, status: 'paused' } : c),
});
await entregar({ phoneNumberId: PNID_DISTRITO, from: '573004445566', text: 'al pausado', id: 'wamid.p1' });
await entregar({ phoneNumberId: PNID_FERIA, from: '573004445566', text: 'a la feria', id: 'wamid.p2' });

// ⚠️ Una línea pausada SIGUE RECIBIENDO: el mensaje se guarda y queda en la
// bandeja. Descartarlo sería perder lo que alguien nos escribió por una
// decisión administrativa nuestra.
eq('el mensaje a la línea pausada SE GUARDA igual', mensajes('incoming').length, 2);
eq('la pausada no respondió', enviosAMeta().filter((l) => l.url.includes(PNID_DISTRITO)).length, 0);
eq('la otra respondió con normalidad', enviosAMeta().filter((l) => l.url.includes(PNID_FERIA)).length, 1);

grupo('6. Ningún cruce entre sitios');

preparar({
  WhatsAppConnection: [
    ...CONEXIONES(),
    {
      id: 'conn-ajena', clubId: OTRO_CLUB, displayName: 'WhatsApp de otro sitio',
      phoneNumberId: '111000111000111', wabaId: '9999999999', appId: null,
      accessTokenEnc: 'TOKEN-AJENO', verifyToken: 'v', webhookProvider: 'meta_cloud',
      status: 'active', isDefault: true, siteId: OTRO_CLUB, origin: 'manual',
      lastVerifiedAt: '2026-09-03T10:00:00.000Z',
    },
  ],
});
await entregar({ phoneNumberId: '111000111000111', wabaId: '9999999999', from: '573007778899', text: 'ajeno', id: 'wamid.x1' });

const delAjeno = mensajes('incoming');
eq('el mensaje ajeno se atribuyó a SU sitio', delAjeno[0]?.clubId, OTRO_CLUB);
eq('y a su línea', delAjeno[0]?.connectionId, 'conn-ajena');
check('no se le atribuyó nada al Distrito 4281',
  !delAjeno.some((m) => m.clubId === CLUB));

grupo('7. Un número que no conocemos no se encamina a nadie');

preparar();
await entregar({ phoneNumberId: '000000000000000', wabaId: '000000', from: '573001112233', text: 'huérfano', id: 'wamid.h1' });
eq('no se guardó el mensaje', mensajes('incoming').length, 0);
eq('ni se abrió conversación', stub.tablas.CrmConversation.length, 0);
check('y no se eligió «la primera conexión de la tabla»', enviosAMeta().length === 0);
// El payload sí queda registrado: es lo único que permite diagnosticarlo
// después. Lo comprueba la bitácora, que en este doble recibe el INSERT.
check('quedó registrado en la bitácora del webhook',
  stub.consultas.some((c) => /CrmWebhookEvent/i.test(c.sql)));

// ════════════════════════════════════════════════════════════════════
grupo('8. ⚠️ LA CUENTA QUE YA ESTABA CONFIGURADA SIGUE FUNCIONANDO');
// Es la comprobación que autoriza el despliegue: una base con SÓLO
// `WhatsAppConfig` y NINGUNA conexión. El respaldo perezoso la migra sola con
// el primer mensaje que reciba, y no hay ninguna ventana en la que la línea no
// exista en ninguna de las dos tablas.

stub.reset();
llamadasAMeta.length = 0;
ia.reset();
stub.seed({
  Club: [{ id: CLUB, name: 'Distrito 4281' }],
  WhatsAppConnection: [],           // ← ni una conexión: el estado de v4.991
  WhatsAppConfig: [{
    id: 'cfg-1', clubId: CLUB, phoneNumberId: PNID_DISTRITO, wabaId: WABA,
    accessToken: 'TOKEN-HEREDADO', verifyToken: 'v', appId: null, enabled: true,
    lastVerifiedAt: '2026-08-01T10:00:00.000Z',
  }],
  WhatsAppAgentConfig: AGENTE_SITIO(),
});
await entregar({ phoneNumberId: PNID_DISTRITO, from: '573001112233', text: 'sigo funcionando', id: 'wamid.m1' });

eq('el mensaje se atendió', mensajes('incoming').length, 1);
eq('la conexión se creó sola desde WhatsAppConfig', stub.tablas.WhatsAppConnection.length, 1);
const migrada = stub.tablas.WhatsAppConnection[0];
eq('con el número de la configuración de siempre', migrada.phoneNumberId, PNID_DISTRITO);
eq('marcada como migrada, no como creada a mano', migrada.origin, 'legacy_config');
eq('y como principal del sitio', migrada.isDefault, true);
eq('activa, porque la configuración estaba habilitada', migrada.status, 'active');
check('el nombre sale del sitio, no queda en blanco',
  /Distrito 4281/.test(migrada.displayName || ''), migrada.displayName);
eq('respondió con el agente del sitio, como antes',
  promptsVistos.filter((p) => /DISTRITO 4281/.test(p)).length, 1);
eq('y por su propio número', enviosAMeta()[0]?.url.includes(PNID_DISTRITO), true);
eq('con el token heredado', enviosAMeta()[0]?.autorizacion, 'Bearer TOKEN-HEREDADO');

grupo('9. La migración es idempotente: Meta reintenta el webhook');

await entregar({ phoneNumberId: PNID_DISTRITO, from: '573001112233', text: 'otra vez', id: 'wamid.m2' });
eq('sigue habiendo UNA sola conexión', stub.tablas.WhatsAppConnection.length, 1);

// Y el mismo mensaje reentregado no se procesa ni se responde dos veces.
const antes = enviosAMeta().length;
await entregar({ phoneNumberId: PNID_DISTRITO, from: '573001112233', text: 'otra vez', id: 'wamid.m2' });
eq('un mensaje reentregado no se responde dos veces', enviosAMeta().length, antes);

// ════════════════════════════════════════════════════════════════════
grupo('10. Los tokens no se filtran');

const leer = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
check('ninguna llamada a Meta llevó el token en la URL',
  !llamadasAMeta.some((l) => /TOKEN-/.test(l.url)));
check('el token va en la cabecera, que es donde corresponde',
  llamadasAMeta.every((l) => !l.cuerpo || !JSON.stringify(l.cuerpo).includes('TOKEN-')));

// Y el endpoint del panel no lo devuelve: lo comprueba `publicConnection` en la
// batería de criterio, y acá que el controlador lo USE.
const ctl = leer('server/controllers/crmController.js');
check('el emisor abre el token con `openToken`, no lee la columna en crudo',
  /openToken\(conn\.accessTokenEnc\)/.test(ctl));
check('y pasa por la puerta de salida antes de enviar',
  /sendGuard\(conn\)/.test(ctl));

grupo('11. El router resuelve por el número RECEPTOR, no por el remitente');

const resolucion = ctl.slice(ctl.indexOf('EL ROUTER'), ctl.indexOf('EL ROUTER') + 2600);
check('la resolución usa el phone_number_id de la metadata',
  /changes\.metadata\?\.phone_number_id/.test(resolucion));
check('y la cuenta como respaldo', /body\.entry\?\.\[0\]\?\.id/.test(resolucion));
check('NUNCA el número de quien escribe (`msg.from`)',
  !/resolveForInbound[\s\S]{0,200}msg\.from/.test(resolucion));
check('el motivo está escrito en el código',
  /Nunca del número de quien escribe|nunca del número/i.test(resolucion));

grupo('12. Los tres emisores de respuesta pasan su línea');
// Si alguno deja de pasarla, el emisor cae en la principal del sitio y eso es
// contestar desde el número equivocado. No lo ve el typecheck.

const agente = leer('server/services/whatsappAgent.js');
const bandeja = leer('server/controllers/crm/inbox.controller.js');
eq('el agente pasa la conexión en sus CUATRO envíos',
  (agente.match(/await send\([^)]*connection\)/g) || []).length, 4);
check('el chatbot responde por la línea que recibió',
  /sendWhatsAppTextMessage\(\{[\s\S]{0,120}connection,/.test(ctl));
check('la bandeja resuelve la conexión de la conversación',
  /conv\.connectionId[\s\S]{0,400}getConnection\(conv\.connectionId/.test(bandeja));
check('…y no responde por otra si esa línea se desconectó',
  /409[\s\S]{0,300}ya no está conectada/.test(bandeja));

grupo('13. Los estados de entrega se casan acotados por línea');
check('la búsqueda del envío lleva la conexión',
  /WHERE "messageId"=\$1 AND \("connectionId"=\$2 OR "connectionId" IS NULL\)/.test(ctl));
check('y el motivo está escrito',
  /colisión de .messageId. entre dos WABAs|hacia el lado equivocado/i.test(ctl));

// ════════════════════════════════════════════════════════════════════
console.log(`\n${'─'.repeat(62)}`);
console.log(`${ok} comprobaciones pasaron, ${malos.length} fallaron.`);
if (malos.length) {
  console.log('\nFallaron:');
  for (const m of malos) console.log(`  · ${m}`);
  console.log('\nLo que esta batería protege y no se ve en una prueba de criterio:');
  console.log('  · que un mensaje a la cuenta A caiga EXCLUSIVAMENTE en el inbox A;');
  console.log('  · que la respuesta salga por el número y el token que recibieron;');
  console.log('  · que la cuenta ya configurada siga funcionando tras la migración.');
  process.exit(1);
}
console.log('OK.');
