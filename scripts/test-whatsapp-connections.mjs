#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// CONEXIONES MULTI-WABA DEL WHATSAPP CRM.  npm run test:whatsapp:connections
// v4.992.0
//
// SIN BASE, SIN CREDENCIALES Y SIN RED. El criterio vive aparte de la
// orquestación —como `seoRules.js` frente a `seoAudit.js`— porque un router que
// sólo se ejercita contra Meta termina sin pruebas, y entonces nadie se entera
// de que una regla de aislamiento cambió de signo.
//
// LO QUE PROTEGEN, sobre todo cinco cosas que no se ven mirando una pantalla:
//
//   · Que la resolución del entrante sea DETERMINISTA. Meta reintenta el
//     webhook: dos entregas del mismo evento tienen que encaminar igual, o el
//     mismo mensaje aparecería en dos organizaciones distintas.
//   · Que la credencial de salida NO SE PUEDA DEDUCIR. Es el riesgo más caro
//     del módulo: contestar desde el número de otra organización.
//   · Que el token NUNCA salga hacia el navegador, ni recortado.
//   · Que el agente HEREDE del sitio, que es lo único que hace que desplegar
//     esto no cambie el comportamiento de la cuenta que ya está activa.
//   · Que el atajo del ensure enumere TODA columna que el archivo agrega — la
//     trampa de v4.908, que dejó un ALTER sin correr en producción.
// ════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import {
  STATUSES, STATUS_IDS, DEFAULT_STATUS,
  WEBHOOK_PROVIDERS, WEBHOOK_PROVIDER_IDS, DEFAULT_WEBHOOK_PROVIDER,
  EDITABLE_FIELDS, SCOPE_FIELDS,
  looksLikeMetaId, shapeConnection, validateConnection,
  publicConnection, maskToken,
  resolveConnection, resolveAgent, sendGuard,
  FAILURE_CAUSES, describeFailure, diagnoseConnection,
} from '../server/lib/whatsappConnections.js';

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
};
const eq = (name, a, b) => ok(name, JSON.stringify(a) === JSON.stringify(b),
  `esperaba ${JSON.stringify(b)}, dio ${JSON.stringify(a)}`);
const section = (t) => console.log(`\n${t}`);
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

// Dos líneas del mismo sitio: el caso del pedido.
const DISTRITO = {
  id: 'conn-distrito', clubId: 'club-4281', displayName: 'WhatsApp Distrito 4281',
  phoneNumberId: '678649158667675', wabaId: '1284652539842140',
  accessTokenEnc: 'v1:aaa:bbb:ccc', status: 'active', isDefault: true,
  lastVerifiedAt: '2026-09-01T10:00:00.000Z',
};
const FERIA = {
  id: 'conn-feria', clubId: 'club-4281', displayName: 'WhatsApp Feria de Proyectos',
  phoneNumberId: '999888777666555', wabaId: '1284652539842140',
  projectId: 'feria-xii', accessTokenEnc: 'v1:ddd:eee:fff', status: 'active',
  isDefault: false, lastVerifiedAt: '2026-09-02T10:00:00.000Z',
};

// ════════════════════════════════════════════════════════════════════
section('1. Los catálogos son CERRADOS');
// Un estado inventado no se puede filtrar ni reportar; un proveedor inventado
// no tiene adaptador de entrada.

eq('cuatro estados y ninguno más', STATUS_IDS, ['draft', 'active', 'paused', 'error']);
eq('una conexión NACE en borrador', DEFAULT_STATUS, 'draft');
ok('borrador no puede recibir ni enviar',
  !STATUSES.draft.canReceive && !STATUSES.draft.canSend);

// ⚠️ La regla que más importa de este bloque: una línea pausada o con error
// SIGUE RECIBIENDO. Descartar el entrante sería perder lo que alguien nos
// escribió por una decisión administrativa nuestra o por un token vencido.
ok('pausada RECIBE y no envía', STATUSES.paused.canReceive && !STATUSES.paused.canSend);
ok('con error RECIBE y no envía', STATUSES.error.canReceive && !STATUSES.error.canSend);
ok('sólo «activa» puede enviar',
  STATUS_IDS.filter((s) => STATUSES[s].canSend).join() === 'active');
ok('cada estado explica qué implica', STATUS_IDS.every((s) => STATUSES[s].help?.length > 10));

eq('un solo proveedor declarado, el que tiene adaptador', WEBHOOK_PROVIDER_IDS, ['meta_cloud']);
eq('por defecto, la Cloud API de Meta', DEFAULT_WEBHOOK_PROVIDER, 'meta_cloud');
ok('Meta comparte un webhook entre WABAs de la misma App',
  WEBHOOK_PROVIDERS.meta_cloud.sharedWebhook === true);
ok('…y exige suscripción POR WABA',
  WEBHOOK_PROVIDERS.meta_cloud.requiresPerWabaSubscription === true);

// ════════════════════════════════════════════════════════════════════
section('2. Lo editable es un catálogo cerrado, y lo peligroso queda fuera');

for (const prohibido of ['clubId', 'status', 'isDefault', 'lastInboundAt', 'lastVerifiedAt', 'origin', 'id']) {
  ok(`«${prohibido}» NO se puede escribir desde el cuerpo`, !EDITABLE_FIELDS.includes(prohibido));
}
// Mover una conexión de sitio arrastra sus conversaciones y sus mensajes: es una
// operación de datos, no una edición de formulario.
const { data: shaped, dropped } = shapeConnection({
  displayName: '  WhatsApp Feria  ', phoneNumberId: '123456789',
  clubId: 'otro-club', status: 'active', isDefault: true, id: 'inventado',
});
eq('lo prohibido se descarta y SE NOMBRA', dropped.sort(), ['clubId', 'id', 'isDefault', 'status']);
eq('lo permitido se conserva y se recorta', shaped.displayName, 'WhatsApp Feria');
ok('no se cuela nada más', Object.keys(shaped).sort().join() === 'displayName,phoneNumberId');

eq('un proveedor desconocido cae al que sí existe',
  shapeConnection({ webhookProvider: 'balcony' }).data.webhookProvider, 'meta_cloud');
eq('un siteType desconocido queda nulo, no inventado',
  shapeConnection({ siteType: 'feria' }).data.siteType, null);
// El token de un usuario del sistema pasa holgado los 200 caracteres: recortarlo
// lo rompería en silencio.
const tokenLargo = 'EAA' + 'x'.repeat(600);
eq('un token largo NO se recorta',
  shapeConnection({ accessToken: tokenLargo }).data.accessToken.length, tokenLargo.length);

// ════════════════════════════════════════════════════════════════════
section('3. Validación: lo que bloquea y lo que sólo avisa');

const vacio = validateConnection({});
ok('sin nombre, sin número, sin WABA y sin token: no se guarda', !vacio.ok);
eq('y se dicen los CUATRO, no el primero', vacio.errors.length, 4);
ok('el nombre se exige explicando para qué sirve',
  /Enviar desde|responde/i.test(vacio.errors.find((e) => e.field === 'displayName').message));

// El error más común al copiar del panel de Meta: espacios pegados. El mensaje
// de Meta no menciona el espacio y quien lo pegó no tiene por dónde empezar.
ok('un ID con letras se rechaza nombrando la causa',
  /forma de un ID|espacios/i.test(
    validateConnection({ displayName: 'X', phoneNumberId: '67864 91586', wabaId: '1', accessToken: 't' })
      .errors.find((e) => e.field === 'phoneNumberId')?.message || ''));
ok('un ID de Meta es una cadena de dígitos', looksLikeMetaId('678649158667675'));
// Los espacios AL BORDE se recortan a propósito (es lo que pasa al pegar del
// panel de Meta); un espacio ADENTRO es otro dato y se rechaza.
ok('espacios al borde se toleran', looksLikeMetaId(' 678649158667675 '));
ok('un espacio ADENTRO se rechaza', !looksLikeMetaId('678649 158667675'));
ok('un id con letras se rechaza', !looksLikeMetaId('678649abc667675'));
ok('vacío, no', !looksLikeMetaId(''));
ok('demasiado corto, no', !looksLikeMetaId('123'));

const editando = validateConnection({ displayName: 'Feria' }, { existing: DISTRITO });
ok('editando NO se exige reenviar el token', editando.ok, JSON.stringify(editando.errors));

const sinVerify = validateConnection({
  displayName: 'Feria', phoneNumberId: '111111111', wabaId: '222222222', accessToken: 't',
});
ok('sin verifyToken se GUARDA (con una sola App es normal)', sinVerify.ok);
ok('…y se avisa', sinVerify.warnings.some((w) => w.field === 'verifyToken'));

// Los avisos no bloquean: tratarlos como errores convierte cualquier
// observación en un bloqueo y se dejan de leer.
const dosVinculos = validateConnection({
  displayName: 'X', phoneNumberId: '111111111', wabaId: '222222222', accessToken: 't',
  projectId: 'p', eventId: 'e',
});
ok('dos vínculos a la vez se guardan…', dosVinculos.ok);
ok('…y se avisa que conviene que la línea represente UNA cosa',
  dosVinculos.warnings.some((w) => /vínculos/i.test(w.message)));
eq('los tres vínculos son opcionales', SCOPE_FIELDS, ['campaignId', 'projectId', 'eventId']);

// ════════════════════════════════════════════════════════════════════
section('4. ⚠️ El token NUNCA sale hacia el navegador');

const pub = publicConnection({ ...DISTRITO, accessTokenEnc: 'v1:secreto:muy:secreto', verifyToken: 'mi_token' });
const serializado = JSON.stringify(pub);
ok('el token cifrado no aparece', !serializado.includes('secreto'));
ok('el verifyToken tampoco', !serializado.includes('mi_token'));
ok('no hay NINGÚN campo que se llame como el token',
  !Object.keys(pub).some((k) => /accessToken|verifyToken/.test(k)));
// Los 8 primeros y 4 últimos caracteres que devolvía `getConfig` son 12
// caracteres de una credencial. Lo único que la pantalla necesita es si está.
ok('lo que sale es «hay token», no el token', pub.hasToken === true && pub.hasVerifyToken === true);
ok('sin token, lo dice', publicConnection({ ...DISTRITO, accessTokenEnc: null }).hasToken === false);
ok('el estado viaja con su rótulo legible', pub.statusLabel === 'Activa');
ok('un estado desconocido cae al de borrador, no revienta',
  publicConnection({ ...DISTRITO, status: 'inventado' }).statusLabel === STATUSES.draft.label);
ok('la máscara del log no filtra ni un prefijo',
  !maskToken('EAAsecretoreal').includes('EAA'));
ok('…y dice que hay uno', /\d+ caracteres/.test(maskToken('EAAsecretoreal')));
eq('sin token, la máscara lo dice', maskToken(null), '(sin token)');

// ════════════════════════════════════════════════════════════════════
section('5. ⚠️ La resolución del entrante es DETERMINISTA');

const porNumero = resolveConnection(
  { phoneNumberId: FERIA.phoneNumberId, wabaId: FERIA.wabaId }, [DISTRITO, FERIA]);
eq('el número receptor decide, no el de quien escribe', porNumero.connection?.id, 'conn-feria');
eq('y se dice cómo se resolvió', porNumero.resolvedBy, 'phone_number_id');
ok('sin motivo que reportar cuando resolvió bien', porNumero.reason === null);

// Las dos comparten WABA: el número tiene que ganar sobre la cuenta, o la Feria
// recibiría en el inbox del Distrito.
const mismaWaba = resolveConnection(
  { phoneNumberId: DISTRITO.phoneNumberId, wabaId: DISTRITO.wabaId }, [DISTRITO, FERIA]);
eq('compartiendo WABA, manda el phone_number_id', mismaWaba.connection?.id, 'conn-distrito');

// Respaldo por WABA: es lo que salva el caso de un número migrado en el panel
// de Meta. Sin él, migrar un número descartaba TODO en silencio.
const migrado = resolveConnection({ phoneNumberId: '000nuevo000', wabaId: FERIA.wabaId }, [FERIA]);
eq('un número que no casa se encamina por la cuenta', migrado.connection?.id, 'conn-feria');
eq('y SE DICE que fue por el respaldo', migrado.resolvedBy, 'waba_id');
ok('…con el motivo escrito, que es la señal de un ID viejo',
  /no coincide|corregir el ID/i.test(migrado.reason || ''));

const perdido = resolveConnection({ phoneNumberId: '404', wabaId: '404' }, [DISTRITO, FERIA]);
eq('sin coincidencia NO se elige «la primera fila»', perdido.connection, null);
eq('se marca como no encaminado', perdido.resolvedBy, 'unknown_phone_number_id');
ok('y el motivo dice la consecuencia, no sólo el hecho',
  /no se registran|ni los mensajes/i.test(perdido.reason || ''));

// El desempate: sólo se da con datos heredados (phoneNumberId lleva índice
// único), y aun así tiene que ser estable. Si dependiera del orden de la base,
// dos entregas del mismo webhook resolverían distinto.
// ⚠️ EL DETERMINISMO SE PRUEBA CON MUCHAS BARAJADAS, NO CON DOS ÓRDENES.
// Con dos filas y un desempate aleatorio, comparar un orden contra el inverso
// acierta la mitad de las veces: la prueba pasaría por suerte y sería INESTABLE,
// que es peor que no tenerla. Con seis filas y treinta barajadas, un
// `Math.random()` en el comparador falla con probabilidad práctica 1.
// Verificado a la inversa: sustituyendo el desempate por azar, esto falla.
const gemelas = ['zzz', 'mmm', 'aaa', 'kkk', 'bbb', 'yyy'].map((id) => ({
  ...DISTRITO, id, status: 'active', isDefault: false, lastVerifiedAt: null,
}));
const barajar = (xs, semilla) => {
  // Barajado propio y REPRODUCIBLE: con Math.random() un fallo de esta prueba
  // no se podría volver a producir para diagnosticarlo.
  const out = [...xs];
  let x = semilla;
  for (let i = out.length - 1; i > 0; i--) {
    x = (x * 1103515245 + 12345) & 0x7fffffff;
    const j = x % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};
const resultados = new Set();
for (let semilla = 1; semilla <= 30; semilla++) {
  const r = resolveConnection({ phoneNumberId: DISTRITO.phoneNumberId }, barajar(gemelas, semilla));
  resultados.add(r.connection ? r.connection.id : 'ninguna');
}
eq('30 barajadas del mismo juego de filas resuelven SIEMPRE igual',
  [...resultados], ['aaa']);
const a = resolveConnection({ phoneNumberId: DISTRITO.phoneNumberId }, gemelas);
eq('termina en el id menor, que es lo único que no empata', a.connection?.id, 'aaa');
eq('y la ambigüedad se REPORTA', a.ambiguous, 6);

// Una línea pausada sigue recibiendo, pero si hay una activa con el mismo
// número, gana la activa.
const conPausada = resolveConnection({ phoneNumberId: DISTRITO.phoneNumberId }, [
  { ...DISTRITO, id: 'pausada', status: 'paused' },
  { ...DISTRITO, id: 'activa', status: 'active' },
]);
eq('entre dos, gana la que puede recibir mejor', conPausada.connection?.id, 'activa');

// Y una pausada SOLA sí resuelve: el mensaje se guarda.
const soloPausada = resolveConnection({ phoneNumberId: DISTRITO.phoneNumberId },
  [{ ...DISTRITO, id: 'pausada', status: 'paused' }]);
eq('una línea pausada resuelve igual: el entrante no se tira',
  soloPausada.connection?.id, 'pausada');

eq('sin candidatos, sin conexión', resolveConnection({ phoneNumberId: '1' }, []).connection, null);
eq('con basura en la lista, no revienta',
  resolveConnection({ phoneNumberId: '1' }, [null, undefined]).connection, null);

// ════════════════════════════════════════════════════════════════════
section('6. El agente: de la línea, del sitio, o ninguno');

const agenteFeria = { id: 'ag-feria', enabled: true, name: 'Asistente Feria de Proyectos' };
const agenteSitio = { id: 'ag-sitio', enabled: true, name: 'Asistente' };

eq('el propio de la línea manda',
  resolveAgent({ connectionAgent: agenteFeria, siteAgent: agenteSitio }).agent?.name,
  'Asistente Feria de Proyectos');
eq('…y se dice de dónde salió',
  resolveAgent({ connectionAgent: agenteFeria, siteAgent: agenteSitio }).source, 'connection');

// ⚠️ LA HERENCIA ES LO QUE HACE QUE DESPLEGAR ESTO NO CAMBIE NADA: una conexión
// sin agente propio se comporta exactamente como el módulo antes de multi-WABA.
const heredado = resolveAgent({ connectionAgent: null, siteAgent: agenteSitio });
eq('sin agente propio, hereda el del sitio', heredado.agent?.id, 'ag-sitio');
eq('y se marca como heredado', [heredado.source, heredado.inherited], ['site', true]);

// Un agente propio APAGADO no cae al del sitio: apagarlo es una decisión sobre
// esta línea y heredar el del sitio la desobedecería.
const apagado = resolveAgent({ connectionAgent: { ...agenteFeria, enabled: false }, siteAgent: agenteSitio });
eq('un agente propio APAGADO no hereda el del sitio', apagado.agent, null);
eq('…y se distingue de «no hay ninguno»', apagado.source, 'connection_disabled');

eq('sin ninguno de los dos', resolveAgent({}).source, 'none');
eq('un agente del sitio apagado tampoco atiende',
  resolveAgent({ siteAgent: { ...agenteSitio, enabled: false } }).source, 'none');

// ════════════════════════════════════════════════════════════════════
section('7. ⚠️ La credencial de salida NO SE DEDUCE');
// Es el riesgo más caro del módulo: `sendWhatsAppTextMessage({ clubId })`
// deducía el token del sitio, así que con dos líneas un mensaje de la Feria
// podía salir por el número del Distrito.

const sinConn = sendGuard(null);
ok('sin conexión no se envía', !sinConn.ok);
eq('con su código, para poder reportarlo', sinConn.code, 'sin_conexion');
ok('y el motivo EXPLICA por qué no se deduce',
  /no se deduce|número equivocado/i.test(sinConn.message));

ok('con una conexión activa y su token, sí', sendGuard(DISTRITO).ok);

const sinToken = sendGuard({ ...DISTRITO, accessTokenEnc: null });
ok('sin credencial guardada, no', !sinToken.ok);
eq('con su código', sinToken.code, 'sin_credencial');
ok('y nombrando la línea y dónde se corrige',
  sinToken.message.includes('Distrito 4281') && /Configuración/.test(sinToken.message));

const pausada = sendGuard({ ...DISTRITO, status: 'paused' });
ok('una línea pausada no envía', !pausada.ok);
eq('el código lleva el estado', pausada.code, 'estado_paused');
ok('y explica que los mensajes se siguen guardando',
  /se siguen guardando/i.test(pausada.message));

ok('un borrador no envía', !sendGuard({ ...DISTRITO, status: 'draft' }).ok);
ok('una con error tampoco', !sendGuard({ ...DISTRITO, status: 'error' }).ok);

// El agente sólo se exige cuando lo que se va a mandar es una respuesta
// automática: una respuesta humana de la bandeja no necesita agente.
ok('para una respuesta automática se exige agente',
  !sendGuard(DISTRITO, { requireAgent: true, agentSource: 'none' }).ok);
eq('con su código', sendGuard(DISTRITO, { requireAgent: true, agentSource: 'none' }).code, 'sin_agente');
ok('un agente heredado del sitio alcanza',
  sendGuard(DISTRITO, { requireAgent: true, agentSource: 'site' }).ok);
ok('un agente propio apagado NO alcanza',
  !sendGuard(DISTRITO, { requireAgent: true, agentSource: 'connection_disabled' }).ok);
ok('una respuesta humana no necesita agente',
  sendGuard(DISTRITO, { requireAgent: false, agentSource: 'none' }).ok);

// ════════════════════════════════════════════════════════════════════
section('8. Cada fallo dice su CAUSA y su salida, no «no funciona»');

for (const [key, causa] of Object.entries(FAILURE_CAUSES)) {
  ok(`«${key}» dice qué pasó y dónde se corrige`,
    causa.title?.length > 10 && causa.detail?.length > 30 && causa.fix?.length > 10);
}
// El código 190 es el que se ve cuando el token se revocó. Sin traducirlo, el
// panel dice «(#190) Error validating access token» y no dice qué hacer.
eq('el 190 de Meta es un token vencido', describeFailure({ metaCode: 190 }).code, 'token_expirado');
eq('el 100 es el número que no pertenece a esa WABA',
  describeFailure({ metaCode: 100 }).code, 'numero_ajeno_a_la_waba');
eq('el 200 es un permiso ausente', describeFailure({ metaCode: 200 }).code, 'permiso_ausente');
eq('el 130429 es el límite de mensajería', describeFailure({ metaCode: 130429 }).code, 'limite_de_mensajes');

// El texto del proveedor se propaga TEXTUAL: es lo que se busca en el soporte
// de Meta. El diagnóstico va delante; el original, conservado.
const desconocido = describeFailure({ metaCode: 99999, message: 'Lightning dunning decision is deny' });
eq('un código que no conocemos no se inventa', desconocido.code, 'desconocido');
ok('el texto de Meta se conserva ENTERO',
  desconocido.detail.includes('Lightning dunning decision is deny'));
eq('…y también aparte, para el log', desconocido.providerMessage, 'Lightning dunning decision is deny');
ok('sin ningún detalle, se dice que no hubo ninguno',
  /no se recibió ningún detalle/i.test(describeFailure({}).detail));

// ════════════════════════════════════════════════════════════════════
section('9. Diagnóstico: «no se pudo comprobar» NO es un tipo de «bien»');

const sana = diagnoseConnection({
  hasToken: true, tokenValid: true, verifiedName: 'Rotary 4281',
  phoneMatchesWaba: true, displayPhoneNumber: '+57 300 000 0000',
  subscribed: true, lastInboundAt: 'ayer', lastOutboundAt: 'hoy',
  lastError: null, agentSource: 'connection', agentName: 'Asistente Feria',
  useKnowledge: true, knowledgeReady: true, status: 'active',
});
eq('una línea completa da verde', sana.verdict, 'ok');
eq('las diez comprobaciones del pedido', sana.checks.length, 10);
for (const k of ['credenciales', 'token', 'numero', 'suscripcion', 'entrada', 'salida', 'error', 'agente', 'conocimiento', 'automatizacion']) {
  ok(`comprueba «${k}»`, sana.checks.some((c) => c.key === k));
}

const rota = diagnoseConnection({
  hasToken: true, tokenValid: false, tokenMetaCode: 190, tokenError: 'Error validating access token',
  phoneMatchesWaba: null, subscribed: false, status: 'error', agentSource: 'none',
});
eq('un token rechazado tira el veredicto a fallo', rota.verdict, 'fail');
ok('y el fallo del token lleva su causa traducida',
  rota.checks.find((c) => c.key === 'token').cause.code === 'token_expirado');
eq('lo que no se pudo preguntar queda en «unknown», no en «ok»',
  rota.checks.find((c) => c.key === 'numero').state, 'unknown');
ok('la suscripción ausente explica que «todo parece normal»',
  /parece normal|no vuelve/i.test(rota.checks.find((c) => c.key === 'suscripcion').cause.detail));

// El veredicto sigue al PEOR hallazgo. Pintar «sana» con un fallo debajo es la
// contradicción que este proyecto ya prohibió dos veces.
const conAviso = diagnoseConnection({
  hasToken: true, tokenValid: true, phoneMatchesWaba: true, subscribed: true,
  status: 'active', agentSource: 'none',
});
eq('sin agente es aviso, no fallo: los mensajes se siguen guardando',
  conAviso.verdict, 'warn');

const nueva = diagnoseConnection({ hasToken: true, status: 'draft' });
ok('en una conexión nueva, «todavía no llegó nada» es lo normal y se dice así',
  /es lo normal/i.test(nueva.checks.find((c) => c.key === 'entrada').detail));
eq('sin agente, la base de conocimiento «no aplica» en vez de fallar',
  diagnoseConnection({ agentSource: 'none' }).checks.find((c) => c.key === 'conocimiento').state,
  'unknown');
ok('el conteo cuadra con las comprobaciones',
  Object.values(sana.counts).reduce((a, b) => a + b, 0) === sana.checks.length);

// ════════════════════════════════════════════════════════════════════
section('10. El atajo del ensure enumera TODO lo que el archivo crea');
// La trampa de v4.908: `AnniversaryPiece.request` tenía su ADD COLUMN y el
// atajo no lo enumeraba, así que en producción —donde todo lo demás ya
// existía— el ALTER no corrió NUNCA y la columna no apareció.

const ensure = read('server/lib/ensureWhatsAppConnectionSchema.js');

const tablasCreadas = [...ensure.matchAll(/CREATE TABLE IF NOT EXISTS "(\w+)"/g)].map((m) => m[1]);
const tablasEnumeradas = [...ensure.matchAll(/^\s*'(\w+)',$/gm)].map((m) => m[1]);
for (const t of tablasCreadas) {
  ok(`la tabla «${t}» está en EXPECTED_TABLES`, tablasEnumeradas.includes(t));
}
eq('y no se enumera ninguna que no se cree', tablasEnumeradas.length, tablasCreadas.length);

const columnasAgregadas = [...ensure.matchAll(/ALTER TABLE "(\w+)" ADD COLUMN IF NOT EXISTS "(\w+)"/g)]
  .map((m) => [m[1], m[2]]);
ok('el archivo agrega al menos una columna', columnasAgregadas.length >= 2);
for (const [t, c] of columnasAgregadas) {
  ok(`«${t}.${c}» está en EXPECTED_COLUMNS`,
    new RegExp(`\\['${t}',\\s*'${c}'\\]`).test(ensure));
}

// ⚠️ La decisión que hace segura la migración del índice en UN paso.
ok('CrmConversation.connectionId es NOT NULL DEFAULT \'\', no nullable',
  /ADD COLUMN IF NOT EXISTS "connectionId" TEXT NOT NULL DEFAULT ''/.test(ensure));
// El motivo se busca sobre el texto con los saltos de línea y los prefijos de
// comentario colapsados: la prosa se parte en varios renglones y una expresión
// literal sobre una sola línea la daría por ausente estando escrita.
const ensurePlano = ensure.replace(/\s*\n\s*(--)?\s*/g, ' ');
ok('…y el motivo está escrito: con NULL el índice no restringiría nada',
  /NULL nunca es igual a NULL/.test(ensurePlano));
ok('el índice nuevo lleva la conexión',
  /"CrmConversation_open_conn_key"[\s\S]{0,120}"clubId",\s*"connectionId",\s*"contactId"/.test(ensure));
ok('el viejo se retira DESPUÉS y en su propia sentencia',
  ensure.indexOf('CrmConversation_open_conn_key') < ensure.indexOf('DROP INDEX IF EXISTS "CrmConversation_open_key"'));

// En `WhatsAppMessageLog` sí es nullable, y la distinción es deliberada: lo
// anterior a la migración no tiene línea conocida, y rellenarlo con la
// principal sería afirmar algo que no se sabe.
ok('WhatsAppMessageLog.connectionId es NULLABLE a propósito',
  /"WhatsAppMessageLog" ADD COLUMN IF NOT EXISTS "connectionId" TEXT;/.test(ensure));
ok('…y el motivo está escrito',
  /un hueco es la verdad|no se sabe/.test(ensurePlano));

// El índice único del número es lo que sostiene el router.
ok('phoneNumberId lleva índice ÚNICO',
  /CREATE UNIQUE INDEX IF NOT EXISTS "WhatsAppConnection_pnid_key"/.test(ensure));
ok('el de la principal es PARCIAL y por sitio',
  /"WhatsAppConnection_default_key"\s*\n\s*ON "WhatsAppConnection"\("clubId"\) WHERE "isDefault"/.test(ensure));
ok('el ensure de las conversaciones se llama ANTES del ALTER',
  ensure.indexOf('await ensureAutomationSchema()') < ensure.indexOf('ALTER TABLE "CrmConversation"'));

// ════════════════════════════════════════════════════════════════════
section('11. Las tablas viven FUERA de Prisma y el guardián las protege');

const prisma = read('server/prisma/schema.prisma');
for (const t of ['WhatsAppConnection', 'WhatsAppConnectionAgent', 'ContactChannel']) {
  ok(`«${t}» NO está declarada en schema.prisma`, !new RegExp(`^model ${t}\\b`, 'm').test(prisma));
}
// La columna sí, porque su tabla es de Prisma: el guardián compara TABLAS, no
// columnas, y una que existiera sólo en el ensure la borraría el primer push.
ok('WhatsAppMessageLog.connectionId SÍ está en schema.prisma',
  /connectionId String\?/.test(prisma.slice(prisma.indexOf('model WhatsAppMessageLog'))));
const guard = read('scripts/db-push-guard.mjs');
for (const t of ['WhatsAppConnection', 'WhatsAppConnectionAgent', 'ContactChannel']) {
  ok(`«${t}» está documentada en el guardián de db:push`, guard.includes(t));
}

// ════════════════════════════════════════════════════════════════════
section('12. El criterio es PURO: sin base, sin red, sin Meta');
// Un router que sólo se ejercita contra Meta termina sin pruebas.

const criterio = read('server/lib/whatsappConnections.js');
for (const prohibido of ['./db.js', 'fetch(', 'graph.facebook', 'process.env', 'tokenCrypto']) {
  ok(`el criterio no importa ni usa «${prohibido}»`, !criterio.includes(prohibido));
}
// Y el token no se cifra ni se descifra acá: eso es I/O y vive en el store.
ok('el criterio no cifra ni descifra nada',
  !/encryptToken|decryptToken/.test(criterio));

// ════════════════════════════════════════════════════════════════════
console.log(`\n${'─'.repeat(60)}`);
console.log(`${pass} comprobaciones pasaron, ${fail} fallaron.`);
if (fail) {
  console.log('\nLas claves de esta batería, si algo falla acá:');
  console.log('  · la resolución del entrante tiene que ser DETERMINISTA;');
  console.log('  · la credencial de salida NO se puede deducir del sitio;');
  console.log('  · el token no sale al navegador ni recortado;');
  console.log('  · el agente HEREDA del sitio (es lo que no rompe la cuenta activa);');
  console.log('  · todo ADD COLUMN va enumerado en el atajo del ensure.');
  process.exit(1);
}
console.log('OK.');
