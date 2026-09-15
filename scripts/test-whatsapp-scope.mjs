#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// AISLAMIENTO ENTRE CUENTAS DE WHATSAPP.  npm run test:whatsapp:scope
// v4.1060.0
//
// SIN BASE, SIN CREDENCIALES Y SIN RED. El criterio vive aparte de la
// orquestación —como `seoRules.js` frente a `seoAudit.js`— porque un motor de
// aislamiento que sólo se ejercita contra Meta termina sin pruebas, y entonces
// nadie se entera de que una regla cambió de signo. Y lo que se separa acá no
// es un número en una pantalla: es en la cuenta de qué organización aparece un
// mensaje.
//
// LAS CINCO REGLAS QUE ESTA BATERÍA SOSTIENE, todas del encabezado de
// `whatsappScope.js` y ninguna visible mirando una pantalla:
//
//   1. `connectionId` NULL es «NO SE SABE», nunca «la principal».
//   2. Una plantilla se identifica por (WABA, nombre, idioma), NO por nombre.
//   3. La campaña PERSISTE su emisora y el envío no mira la pantalla.
//   4. «Principal» es un valor por defecto, NO un respaldo.
//   5. Un fallo de una cuenta no alcanza a las demás.
//
// Y ADEMÁS el cableado leído de los archivos, que es lo único que ve un
// renombrado a medias entre el criterio y quien lo consume (v4.889): el
// criterio puede quedar entero mientras alguien vuelve a deducir la credencial
// del sitio, y ese fallo es MUDO — el mensaje sale igual, por el número de otra
// organización.
// ════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import {
  SCOPED_ENTITIES, SCOPED_ENTITY_IDS,
  BLOCKERS, BLOCKER_IDS, describeBlocker,
  resolveActiveConnection, describeConnection,
  templateIdentity, sameTemplate,
  belongsToConnection, rowScope,
  canCampaignSend,
  attributeLegacyRow, attributionIsSafe, summarizeAttribution,
} from '../server/lib/whatsappScope.js';

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
};
const eq = (name, a, b) => ok(name, JSON.stringify(a) === JSON.stringify(b),
  `esperaba ${JSON.stringify(b)}, dio ${JSON.stringify(a)}`);
const section = (t) => console.log(`\n${t}`);
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
/** El CÓDIGO, sin comentarios: un comentario que explica una regla nombra lo
 *  prohibido, y la comprobación fallaría contra su propia documentación
 *  (la lección de v4.991). */
const codigo = (p) => read(p)
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .split('\n').map((l) => l.replace(/(^|[^:])\/\/.*$/, '$1')).join('\n');

// Las dos cuentas del pedido, con sus datos reales.
const DISTRITO = {
  id: 'conn-distrito',
  displayName: 'WhatsApp Club Platform para Rotary',
  phoneNumber: '+57 300 0000000',
  phoneNumberId: '678649158667675',
  wabaId: '1284652539842140',
  status: 'active',
  isDefault: true,
};
const FERIA = {
  id: 'conn-feria',
  displayName: 'Feria de Proyectos Rotary Colombia',
  phoneNumber: '+57 321 6937317',
  phoneNumberId: '888777666555444',
  wabaId: '673726868995774',
  status: 'active',
  isDefault: false,
};
const DOS = [DISTRITO, FERIA];

// ════════════════════════════════════════════════════════════════════
section('1. Los catálogos son CERRADOS y ningún bloqueo se queda sin SALIDA');

eq('las entidades acotadas son plantilla, campaña y conversación',
  SCOPED_ENTITY_IDS.sort(), ['campaign', 'conversation', 'template']);

// La identidad de cada una NO es intercambiable: una plantilla vive en la WABA
// (dos líneas de la misma WABA comparten catálogo) y una campaña sale por un
// NÚMERO. Confundirlas haría que dos líneas hermanas se pisaran las campañas.
eq('una plantilla se identifica por su WABA', SCOPED_ENTITIES.template.identity, 'waba');
eq('una campaña se identifica por su conexión', SCOPED_ENTITIES.campaign.identity, 'connection');
eq('una conversación se identifica por su conexión', SCOPED_ENTITIES.conversation.identity, 'connection');

// ⚠️ Un bloqueo cuya única respuesta es «no se puede» se lee como una avería y
// se reporta como tal (v4.1008). Esto es lo que impide que vuelva a haber uno.
for (const code of BLOCKER_IDS) {
  ok(`«${code}» dice su motivo Y su salida`,
    !!BLOCKERS[code].label && !!BLOCKERS[code].fix);
}
ok('hay siete motivos declarados', BLOCKER_IDS.length === 7);

// Un código que no reconocemos NO se disfraza de uno conocido.
const raro = describeBlocker('motivo_inventado');
eq('un motivo desconocido conserva su código', raro.code, 'motivo_inventado');
eq('y no se le inventa una salida', raro.fix, null);
ok('un bloqueo conocido llega con su salida', !!describeBlocker('no_token').fix);
eq('el detalle del proveedor viaja textual',
  describeBlocker('connection_cannot_send', 'El token venció el 14-Sep-26').detail,
  'El token venció el 14-Sep-26');

// ════════════════════════════════════════════════════════════════════
section('2. REGLA 1 y 4 — qué cuenta manda, y por qué ésa');
// El orden no es negociable: entidad > selección > principal. Al revés, abrir
// una campaña de la Feria con el Distrito elegido la enviaría por el Distrito.

const r1 = resolveActiveConnection({ entityConnectionId: 'conn-feria', requested: 'conn-distrito', connections: DOS });
eq('lo que la ENTIDAD declara manda sobre lo que pida la pantalla', r1.connection?.id, 'conn-feria');
eq('y se dice de dónde salió', r1.source, 'entidad');

// ⚠️ REGLA 4. Una entidad que SÍ declara su línea y esa línea ya no está NO cae
// a la principal: sería atribuirle a otra cuenta el trabajo de una desconectada.
const r2 = resolveActiveConnection({ entityConnectionId: 'conn-borrada', connections: DOS });
eq('una línea declarada y ausente NO cae a la principal', r2.connection, null);
eq('se dice que falta', r2.source, 'entidad_ausente');

const r3 = resolveActiveConnection({ requested: 'conn-feria', connections: DOS });
eq('sin entidad, manda lo que pide la pantalla', r3.connection?.id, 'conn-feria');
eq('y se declara como selección', r3.source, 'seleccion');

// ⚠️ Pedir una cuenta que no está NO se sustituye en silencio por la principal:
// sería mostrar los datos de una cuenta bajo el rótulo de otra.
const r4 = resolveActiveConnection({ requested: 'conn-de-otro-sitio', connections: DOS });
eq('una cuenta pedida que no existe no se sustituye', r4.connection, null);
eq('y se marca para que la API conteste 404', r4.requestedMissing, true);

const r5 = resolveActiveConnection({ connections: DOS });
eq('sin nada pedido abre la principal', r5.connection?.id, 'conn-distrito');
eq('y se dice que fue por defecto', r5.source, 'principal');

const r6 = resolveActiveConnection({ connections: [FERIA] });
eq('con una sola cuenta y ninguna marcada, ésa', r6.connection?.id, 'conn-feria');
eq('y se dice que fue por ser la única', r6.source, 'unica');

// ⚠️ Varias cuentas y NINGUNA marcada: no se elige por el orden de la base —
// sería servir una cuenta distinta en dos visitas del mismo panel (v4.744).
const sinPrincipal = [{ ...DISTRITO, isDefault: false }, FERIA];
const r7 = resolveActiveConnection({ connections: sinPrincipal });
eq('con varias y ninguna principal, no se adivina', r7.connection, null);
eq('y se dice que no hay cuenta resuelta', r7.source, 'sin_cuenta');

eq('sin ninguna cuenta conectada', resolveActiveConnection({ connections: [] }).source, 'sin_cuenta');

// La resolución es DETERMINISTA: el mismo alcance da la misma cuenta siempre.
ok('la resolución es estable entre llamadas',
  resolveActiveConnection({ connections: DOS }).connection?.id ===
  resolveActiveConnection({ connections: [...DOS].reverse() }).connection?.id);

// ════════════════════════════════════════════════════════════════════
section('3. El rótulo que la pantalla escribe encima de la sección');
// Punto 10 del encargo: hay que ver QUÉ cuenta se está configurando.

const d = describeConnection(FERIA);
eq('el rótulo es «Nombre · teléfono»', d.label, 'Feria de Proyectos Rotary Colombia · +57 321 6937317');
eq('sin teléfono queda el nombre solo', describeConnection({ displayName: 'Sólo nombre' }).label, 'Sólo nombre');
eq('sin nombre no se deja en blanco', describeConnection({ id: 'x' }).label, 'Cuenta sin nombre');
eq('sin cuenta no se inventa un rótulo', describeConnection(null), null);

// ⚠️ EL TOKEN NO SALE AL NAVEGADOR, NI RECORTADO (regla de v4.992). Lo que
// `describeConnection` compone lo pinta una pantalla.
const conToken = describeConnection({ ...FERIA, accessTokenEnc: 'v1:aaa:bbb:ccc', accessToken: 'EAAG...' });
ok('el rótulo no arrastra ninguna credencial',
  !JSON.stringify(conToken).includes('EAAG') && !JSON.stringify(conToken).includes('v1:aaa'));

// ════════════════════════════════════════════════════════════════════
section('4. REGLA 2 — una plantilla es (WABA, nombre, idioma), NO un nombre');
// ⚠️ Es lo que desbloquea el punto 2 del encargo. Meta permite el mismo `name`
// en dos WABAs y son plantillas DISTINTAS: distinto id, distinto estado de
// revisión, distinto cuerpo. Con la llave por nombre, sincronizar la Feria
// pisaría la plantilla homónima del Distrito y la campaña del Distrito pasaría
// a mandar el texto de la Feria, sin ningún error.

const bienvenidaDistrito = { name: 'bienvenida', language: 'es', wabaId: DISTRITO.wabaId };
const bienvenidaFeria = { name: 'bienvenida', language: 'es', wabaId: FERIA.wabaId };
ok('dos «bienvenida» de dos WABAs son plantillas distintas',
  templateIdentity(bienvenidaDistrito) !== templateIdentity(bienvenidaFeria));
ok('y por eso no se deduplican entre sí', !sameTemplate(bienvenidaDistrito, bienvenidaFeria));

ok('la misma plantilla de la misma WABA sí es la misma',
  sameTemplate(bienvenidaFeria, { name: 'BIENVENIDA', language: 'ES', wabaId: FERIA.wabaId }));
ok('el idioma separa dos versiones de la misma plantilla',
  !sameTemplate(bienvenidaFeria, { name: 'bienvenida', language: 'en', wabaId: FERIA.wabaId }));
eq('sin idioma declarado se asume el del sitio',
  templateIdentity({ name: 'x', wabaId: 'w' }), 'w::x::es');
eq('sin WABA la llave lo DICE, no finge una', templateIdentity({ name: 'x' }), 'sin-waba::x::es');
eq('sin nombre no hay plantilla que identificar', templateIdentity({ wabaId: 'w' }), null);

// El id de Meta manda cuando los dos lo traen: es único en Meta y no depende de
// cómo hayamos normalizado nada.
ok('el metaTemplateId manda sobre la terna',
  sameTemplate({ metaTemplateId: '111', name: 'a', wabaId: 'w1' },
               { metaTemplateId: '111', name: 'b', wabaId: 'w2' }));
ok('dos ids de Meta distintos son plantillas distintas',
  !sameTemplate({ metaTemplateId: '111', name: 'a', wabaId: 'w' },
                { metaTemplateId: '222', name: 'a', wabaId: 'w' }));

// ════════════════════════════════════════════════════════════════════
section('5. REGLA 1 — `connectionId` NULL es «no se sabe», nunca «la principal»');

const propiaFeria = { connectionId: 'conn-feria', wabaId: FERIA.wabaId, name: 'x' };
const heredada = { connectionId: null, wabaId: null, name: 'x' };
const deOtraWaba = { connectionId: null, wabaId: FERIA.wabaId, name: 'x' };

ok('una fila con su línea le corresponde a esa línea', belongsToConnection(propiaFeria, FERIA));
ok('y NO a la otra', !belongsToConnection(propiaFeria, DISTRITO));
ok('una fila con WABA le corresponde a las líneas de esa WABA',
  belongsToConnection(deOtraWaba, FERIA) && !belongsToConnection(deOtraWaba, DISTRITO));

// ⚠️ Lo heredado se le MUESTRA a la principal —de donde con toda probabilidad
// salió, porque hasta v4.992 había una sola línea— y a ninguna otra.
ok('lo heredado no se le atribuye a una cuenta cualquiera', !belongsToConnection(heredada, FERIA));
ok('y sólo entra con la marca explícita',
  belongsToConnection(heredada, DISTRITO, { includeUnassigned: true }));

eq('la insignia de lo propio', rowScope(propiaFeria, FERIA), 'propia');
eq('la insignia de una hermana de la misma WABA',
  rowScope({ connectionId: null, wabaId: FERIA.wabaId }, { ...FERIA, id: 'otra-linea' }), 'misma_waba');
eq('la insignia de lo heredado', rowScope(heredada, DISTRITO), 'sin_asignar');
eq('la insignia de lo ajeno', rowScope(propiaFeria, DISTRITO), 'otra_cuenta');
eq('sin cuenta que mirar, lo heredado sigue siendo heredado', rowScope(heredada, null), 'sin_asignar');

// ════════════════════════════════════════════════════════════════════
section('6. REGLA 3 y 5 — la puerta de envío, en el SERVIDOR');
// Esconder el botón no protege un endpoint de quien lo conoce (v4.868).

const sana = { connection: FERIA, connectionExists: true, canSend: true, hasToken: true };
ok('una campaña con su línea sana sale', canCampaignSend(sana).ok);

// ⚠️ REGLA 5. Un token vencido en una cuenta la deja a ELLA sin enviar, con su
// motivo y su salida — y no alcanza a la otra: la credencial se abre POR
// CONEXIÓN en el momento de usarla.
const sinToken = canCampaignSend({ ...sana, hasToken: false });
ok('sin token no sale', !sinToken.ok);
eq('y se dice cuál es el problema', sinToken.code, 'no_token');
ok('con su salida escrita', !!sinToken.fix);
ok('el fallo de una cuenta no toca a la otra', canCampaignSend({ ...sana, connection: DISTRITO }).ok);

const pausada = canCampaignSend({ ...sana, canSend: false, canSendReason: 'La conexión está pausada' });
eq('una línea que no puede enviar se nombra', pausada.code, 'connection_cannot_send');
eq('con el motivo del diagnóstico, textual', pausada.detail, 'La conexión está pausada');

eq('sin ninguna cuenta conectada', canCampaignSend({ connection: null }).code, 'no_connection');
eq('con la cuenta desconectada', canCampaignSend({ connection: null, connectionExists: false }).code, 'connection_missing');

// ⚠️ La plantilla tiene que ser de la MISMA WABA. Meta la rechaza con «template
// name does not exist», un error que no dice de qué cuenta habla y manda a
// revisar una plantilla que está perfectamente aprobada — en la otra.
const ajena = canCampaignSend({ ...sana, template: { connectionId: 'conn-distrito', wabaId: DISTRITO.wabaId } });
ok('una plantilla de otra cuenta NO sale', !ajena.ok);
eq('y se nombra el motivo', ajena.code, 'template_foreign');
ok('una plantilla de la misma WABA sí',
  canCampaignSend({ ...sana, template: { wabaId: FERIA.wabaId } }).ok);

// ⚠️ DELIBERADO: una plantilla heredada NO bloquea desde la principal —hoy TODAS
// son así y todas las campañas que funcionan salen por esa línea; bloquearlas
// sería romper lo que anda para corregir un dato que la migración resuelve sola.
ok('lo heredado sale desde la principal',
  canCampaignSend({ ...sana, connection: DISTRITO, template: heredada }).ok);
// Desde cualquier OTRA sí bloquea: ahí no sabemos si la plantilla existe en esa
// WABA, y descubrirlo sería un rechazo de Meta por cada contacto.
eq('y NO desde otra cuenta',
  canCampaignSend({ ...sana, connection: FERIA, template: heredada }).code, 'template_unassigned');

// ════════════════════════════════════════════════════════════════════
section('7. Migración: se MIRA, no se adivina (punto 11 del encargo)');

eq('una fila ya atada no se pisa',
  attributeLegacyRow({ connectionId: 'conn-feria' }, { connections: DOS }).reason, 'ya_asignada');

const porWaba = attributeLegacyRow({ wabaId: FERIA.wabaId }, { connections: DOS });
eq('la WABA de la fila resuelve la cuenta sin lugar a duda', porWaba.connectionId, 'conn-feria');
eq('y se declara la señal', porWaba.reason, 'waba_coincide');

// Una WABA que no es de ninguna cuenta conectada NO se atribuye a la principal.
const wabaAjena = attributeLegacyRow({ wabaId: '999999999' }, { connections: DOS });
eq('una WABA desconocida no se atribuye', wabaAjena.connectionId, null);
eq('y se manda a revisión con su motivo', wabaAjena.reason, 'waba_desconocida');

const heredado = attributeLegacyRow({}, { connections: DOS, legacyWabaId: DISTRITO.wabaId });
eq('la WABA de la línea heredada resuelve lo anterior a multi-cuenta', heredado.connectionId, 'conn-distrito');
eq('y se declara así', heredado.reason, 'linea_heredada');

// ⚠️ Dos líneas de la MISMA WABA heredada: no se puede saber por cuál salió.
const ambigua = attributeLegacyRow({}, {
  connections: [DISTRITO, { ...FERIA, wabaId: DISTRITO.wabaId }],
  legacyWabaId: DISTRITO.wabaId,
});
eq('con dos líneas de la misma WABA no se elige', ambigua.connectionId, null);
eq('se dice que es ambigua', ambigua.reason, 'ambigua');

eq('con una sola cuenta no hay de dónde más pueda venir',
  attributeLegacyRow({}, { connections: [FERIA] }).reason, 'unica_cuenta');

// ⚠️ EL CASO QUE IMPORTA: varias cuentas y ninguna señal. NO se inventa.
const sinSenal = attributeLegacyRow({}, { connections: DOS });
eq('sin ninguna señal no se atribuye nada', sinSenal.connectionId, null);
eq('y se manda a revisión administrativa', sinSenal.reason, 'sin_senal');

// Y lo que se ESCRIBE en la base es sólo lo seguro.
for (const seguro of ['waba_coincide', 'linea_heredada', 'unica_cuenta']) {
  ok(`«${seguro}» alcanza para escribirla`, attributionIsSafe(seguro));
}
for (const inseguro of ['waba_desconocida', 'ambigua', 'sin_senal', 'ya_asignada']) {
  ok(`«${inseguro}» NO se escribe`, !attributionIsSafe(inseguro));
}

const resumen = summarizeAttribution([
  { connectionId: 'a', reason: 'waba_coincide' },
  { connectionId: 'a', reason: 'waba_coincide' },
  { connectionId: null, reason: 'sin_senal' },
]);
eq('el resumen cuenta lo asignado', resumen.asignadas, 2);
eq('y lo pendiente, que es lo que la pantalla tiene que decir', resumen.pendientes, 1);
eq('agrupado por motivo', resumen.porMotivo.sin_senal, 1);

// ════════════════════════════════════════════════════════════════════
section('8. El criterio es PURO: sin base, sin red, sin Meta');

const criterio = read('server/lib/whatsappScope.js');
for (const prohibido of ['./db.js', 'fetch(', 'graph.facebook', 'process.env', 'tokenCrypto']) {
  ok(`el criterio no importa ni usa «${prohibido}»`, !criterio.includes(prohibido));
}
ok('el criterio no cifra ni descifra ninguna credencial',
  !/encryptToken|decryptToken|openToken/.test(criterio));

// ════════════════════════════════════════════════════════════════════
section('9. El CABLEADO: la credencial no se deduce del sitio');
// El criterio puede quedar entero mientras alguien vuelve a leer la fila única
// de `WhatsAppConfig`, y ese fallo es MUDO: el mensaje sale igual, por el
// número de otra organización (la lección de v4.744 y v4.889).

const crm = codigo('server/controllers/crmController.js');
const cuerpoDe = (nombre) => {
  const i = crm.indexOf(`export const ${nombre} =`);
  if (i < 0) return '';
  const j = crm.indexOf('\nexport const ', i + 10);
  return crm.slice(i, j < 0 ? crm.length : j);
};

// ⚠️ EL DEFECTO QUE ESTO CORRIGE: `sendMessageToContact` leía `getClubConfig`
// para sacar el número de salida, así que TODA respuesta manual salía por la
// línea heredada. A quien le escribió a la Feria le contestaba el Distrito.
const envioChat = cuerpoDe('sendMessageToContact');
ok('la respuesta del chat existe y se puede leer', envioChat.length > 500);
ok('resuelve la línea del HILO del contacto antes que nada',
  /CrmConversation[\s\S]{0,400}connectionId/.test(envioChat));
ok('y la pasa como la línea que la entidad declara',
  /resolveScope\([\s\S]{0,200}entityConnectionId/.test(envioChat));
ok('la credencial sale de la conexión, no del sitio',
  envioChat.includes('openToken(conn.accessTokenEnc)'));
ok('y el número de salida también', envioChat.includes('conn.phoneNumberId'));
// `getClubConfig` sobrevive SÓLO como camino heredado, DESPUÉS de resolver la
// línea: sin él, desplegar multi-cuenta dejaría sin responder a quien no migró.
ok('`getClubConfig` queda detrás de la resolución de la línea, no delante',
  envioChat.indexOf('resolveScope(') < envioChat.indexOf('getClubConfig('));
ok('y se lee UNA sola vez, en el respaldo',
  (envioChat.match(/getClubConfig\(/g) || []).length === 1);
ok('nunca antes de tomar el número de la conexión',
  envioChat.indexOf('conn.phoneNumberId') < envioChat.indexOf('getClubConfig('));
ok('la plantilla se comprueba contra la línea antes de mandarla a Meta',
  envioChat.includes('belongsToConnection('));
ok('y la respuesta dice por qué línea salió', envioChat.includes('describeConnection('));

// ⚠️ REGLA 3. El envío de una campaña lee la emisora PERSISTIDA, no la pantalla.
const envioCampana = cuerpoDe('sendCampaign');
ok('la campaña resuelve su emisora por lo que la fila declara',
  envioCampana.includes('connectionForEntity(clubId, campaign.connectionId)'));
ok('y pasa por la puerta de envío', envioCampana.includes('canCampaignSend('));
ok('la campaña NO lee la cuenta pedida por la pantalla al enviar',
  !/req\.(body|query)[\s\S]{0,40}connectionId/.test(envioCampana));

// El alta de una campaña SÍ persiste la cuenta: sin eso, enviar dependería de
// lo que estuviera seleccionado semanas después.
ok('crear una campaña persiste su cuenta',
  /INSERT INTO "WhatsAppCampaign"[\s\S]{0,900}connectionId/.test(cuerpoDe('createCampaign')));

// ════════════════════════════════════════════════════════════════════
section('10. El esquema: la llave por NOMBRE es lo que bloqueaba el punto 2');

const ensure = read('server/lib/ensureAutomationSchema.js');

// ⚠️ `WhatsAppTemplate_club_name_key` era UNIQUE(clubId, name): con dos WABAs en
// el mismo sitio, la «bienvenida» de la Feria chocaba con la homónima del
// Distrito y NO SE PODÍA IMPORTAR. Retirarlo no pierde ninguna fila.
ok('el índice único por nombre se retira', ensure.includes('DROP INDEX IF EXISTS "WhatsAppTemplate_club_name_key"'));
ok('y se reemplaza por la llave real, con WABA e idioma',
  /uniq_wa_template_scope[\s\S]{0,200}COALESCE\("wabaId", ''\), name, language/.test(ensure));
ok('el índice viejo no vuelve a crearse', !/CREATE UNIQUE INDEX[^;]*WhatsAppTemplate_club_name_key/.test(ensure));

// ⚠️ LA TRAMPA DE v4.908: `CREATE TABLE IF NOT EXISTS` no amplía nada, así que
// una columna que no se enumere en el atajo deja su ALTER sin correr JAMÁS sobre
// una base que ya tiene la tabla — y el INSERT falla con «column does not
// exist», en silencio, porque este módulo degrada.
const declaradas = new Set(
  [...ensure.matchAll(/\[\s*'([A-Za-z]+)'\s*,\s*'([A-Za-z0-9_]+)'\s*\]/g)].map((m) => `${m[1]}.${m[2]}`)
);
const alters = [...ensure.matchAll(/ALTER TABLE "([A-Za-z]+)" ADD COLUMN IF NOT EXISTS "([A-Za-z0-9_]+)"/g)];
ok('el archivo agrega columnas (si no, esta comprobación sería vacua)', alters.length > 5);
for (const m of alters) {
  const clave = `${m[1]}.${m[2]}`;
  ok(`«${clave}» está enumerada en el atajo del ensure`, declaradas.has(clave));
}

// ⚠️ NI UNA COMILLA INVERTIDA DENTRO DE UN `db.query(\`…\`)`, tampoco en un
// comentario del SQL: cierra el literal a mitad y el módulo entero deja de
// parsear (v4.721.1, v4.847, v4.998, v4.1017 — van cuatro).
for (const archivo of ['server/lib/ensureAutomationSchema.js', 'server/lib/whatsappScopeStore.js']) {
  const src = read(archivo);
  let limpio = true;
  const re = /db\.query\(\s*`/g;
  let m;
  while ((m = re.exec(src))) {
    const fin = src.indexOf('`', m.index + m[0].length);
    if (fin < 0) { limpio = false; break; }
    const siguiente = src.slice(fin + 1).match(/^\s*[),]/);
    if (!siguiente) limpio = false;
  }
  ok(`«${archivo}» no lleva comillas invertidas dentro de su SQL`, limpio);
}

// ════════════════════════════════════════════════════════════════════
section('11. El selector de cuenta es UNO y lo montan las pantallas');
// Escrito cinco veces se separa en silencio, que es lo que ya costó la casilla
// de distritos (v4.748) y el selector de pools (v4.877).

const PANTALLAS = [
  ['WhatsAppCampaigns.tsx', 'Campañas'],
  ['TemplateLibrary.tsx', 'Biblioteca de plantillas'],
  ['WhatsAppTemplates.tsx', 'Plantillas'],
  ['WhatsAppAutomation.tsx', 'Automatización'],
  ['CrmAnalytics.tsx', 'Analíticas'],
];
for (const [archivo, rotulo] of PANTALLAS) {
  const src = read(`src/components/admin/whatsapp/${archivo}`);
  ok(`${rotulo} toma el selector del módulo compartido`,
    /from ['"]\.\/WhatsAppAccountPicker['"]/.test(src));
  // Y no vuelve a consultar el CATÁLOGO por su cuenta: con la consulta escrita
  // en cada pantalla, la sexta se olvida y el selector sale vacío sin aviso.
  // Lo que sí es legítimo es pedirle algo a UNA conexión concreta —su agente,
  // su diagnóstico—: eso lleva la conexión en la ruta y no es el catálogo.
  ok(`${rotulo} no conserva su propia consulta del catálogo de cuentas`,
    !/crm\/connections[`'"]/.test(src));
}

// ⚠️ La campaña dice de qué cuenta sale ANTES de guardarse, y con UN solo
// control: un segundo selector en el formulario daría dos verdades sobre el
// mismo dato.
const campanas = read('src/components/admin/whatsapp/WhatsAppCampaigns.tsx');
ok('la campaña muestra «Enviar desde» en el formulario', campanas.includes('Enviar desde'));
ok('y hay un solo selector de cuenta en la pantalla',
  (campanas.match(/<WhatsAppAccountPicker/g) || []).length === 1);
ok('la confirmación de envío nombra la cuenta emisora',
  /Saldr[áa] desde/.test(campanas));

// ⚠️ Cambiar de cuenta con trabajo sin guardar AVISA (punto 10 del encargo).
const picker = read('src/components/admin/whatsapp/WhatsAppAccountPicker.tsx');
ok('el selector avisa antes de perder cambios sin guardar',
  /dirty/.test(picker) && /confirm\(/.test(picker));
ok('y la automatización le declara su estado sin guardar',
  /dirty=\{/.test(read('src/components/admin/whatsapp/WhatsAppAutomation.tsx')));

// ⚠️ NINGUNA respuesta se lee con `.json()` a ciegas: una página de error HTML
// rompe el parseo y el error resultante no nombra ninguna capa (v4.946).
ok('el selector lee la respuesta como texto antes de interpretarla',
  /\.text\(\)/.test(picker));

// ════════════════════════════════════════════════════════════════════
section('12. Lo que NO se acota, se DICE');
// Un recorrido y el presupuesto son del SITIO: atribuir sus conversiones a una
// línea sería inventar la asociación, que es lo que el punto 11 prohíbe.

const analytics = read('server/lib/crmAnalytics.js');
ok('las métricas de mensajes se pueden acotar por línea',
  /connectionId[\s\S]{0,400}l\."connectionId"/.test(analytics));
const dash = read('server/controllers/crm/analytics.controller.js');
ok('y la API dice qué queda fuera del filtro', /scopeNote/.test(dash));
ok('la pantalla lo pinta en vez de dejar un número que se comporta distinto',
  /scopeNote/.test(read('src/components/admin/whatsapp/CrmAnalytics.tsx')));

// ⚠️ En analíticas el valor por defecto es «TODAS», al revés que en las
// pantallas que OPERAN sobre una cuenta: abrirlas ya acotadas escondería, sin
// que nadie lo pidiera, lo que el panel venía mostrando.
ok('las analíticas abren con todas las cuentas',
  /useState[^\n]*\(\s*''\s*\)[^\n]*|connId.*useState<string>\(''\)/.test(
    read('src/components/admin/whatsapp/CrmAnalytics.tsx')));

// ════════════════════════════════════════════════════════════════════
console.log(`\n${'─'.repeat(60)}`);
console.log(`${pass} comprobaciones pasaron, ${fail} fallaron.`);
if (fail) {
  console.log('\nLas cinco reglas que sostiene esta batería, si algo falla acá:');
  console.log('  1. `connectionId` NULL es «no se sabe», nunca «la principal»;');
  console.log('  2. una plantilla es (WABA, nombre, idioma), NO un nombre;');
  console.log('  3. la campaña persiste su emisora y el envío no mira la pantalla;');
  console.log('  4. «principal» es un valor por defecto, no un respaldo;');
  console.log('  5. un fallo de una cuenta no alcanza a las demás.');
  process.exit(1);
}
console.log('OK.');
