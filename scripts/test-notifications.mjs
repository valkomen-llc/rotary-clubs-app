#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// Notificaciones de Contribuciones — pruebas del CRITERIO
// v4.855.0 (Fase 0)
//
// SIN base, SIN credenciales y SIN red. Prueban la decisión —qué llave
// identifica un envío, con qué estado se queda una entrega cuando llegan dos
// eventos desordenados, qué se reintenta— separada de la orquestación, por el
// mismo motivo que `seoRules.js` vive aparte de `seoAudit.js`.
//
// El bloque final lee ARCHIVOS: comprueba lo que no se ve ejecutando nada
// —que el recibo se reclame ANTES de enviarse, que la tabla no toque
// `schema.prisma` y que nada de la bitácora pueda lanzar dentro del webhook—.
// ════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import {
    NOTIFICATION_EVENTS, EVENT_IDS, eventById, isKnownEvent, availableEvents,
    RECIPIENT_IDS, isKnownRecipientKind,
    DELIVERY_STATES, isKnownDeliveryState, isFailureState, mergeDeliveryState,
    normalizeEmail, deliveryKey,
    MAX_RETRIES, canRetry, RETRY_DELAYS_MIN, nextRetryDelay,
    normalizeDelivery, summarizeDeliveries,
    beneficiaryShape, profileShape, identityShape, hexOrNull, routingShape,
    emailList, INTERNAL_RECIPIENTS_MAX, recipientsFor,
    pickProfileFor, validateProfile, defaultEventRules,
    normalizeDomain, normalizeLocalPart, resolveSenderPlan, resolveRecipients,
    centralDomain, fallbackSender, DEFAULT_LOCAL_PART,
} from '../server/lib/notificationSpec.js';
import {
    TEMPLATE_VARIABLES, isKnownVariable, sampleVariables,
    BLOCK_IDS, blockShape, safeUrl, templateShape, validateTemplate,
    variablesIn, escapeHtml, applyVariables, renderTemplate, defaultTemplate,
    defaultInternalTemplate, defaultRefundTemplate, defaultTemplateFor,
} from '../server/lib/notificationTemplate.js';

let ok = 0;
const malos = [];
const check = (nombre, cond) => {
    if (cond) { ok++; console.log(`  ✓ ${nombre}`); }
    else { malos.push(nombre); console.log(`  ✗ ${nombre}`); }
};
const grupo = (t) => console.log(`\n${t}`);

// ════════════════════════════════════════════════════════════════════
grupo('Los eventos: catálogo cerrado y honesto');

check('el catálogo tiene los cuatro eventos del pedido que dependen del pago',
    ['payment_confirmed', 'in_transit', 'refunded', 'failed'].every(isKnownEvent));
check('un evento inventado NO entra', !isKnownEvent('contribution.whatever') && !isKnownEvent(''));
// Sólo se ofrece lo que la plataforma puede OBSERVAR. Prometer los otros en la
// pantalla sería una casilla que no hace nada (v4.650).
check('están disponibles exactamente los dos que tienen fuente',
    availableEvents().map(e => e.id).join(',') === 'payment_confirmed,refunded');
check('cada evento DECLARA de dónde sale',
    NOTIFICATION_EVENTS.every(e => typeof e.source === 'string' && e.source.length > 3));
// «¿por qué este aporte no disparó nada?» tiene que poder contestarse sin
// leer el código.
// Cada uno explica su situación: unos que falta trabajo, otro que NO aplica.
// Las dos cosas son respuestas; «no disponible» a secas no lo es.
check('los eventos no disponibles explican su situación',
    NOTIFICATION_EVENTS.filter(e => !e.available).every(e => e.help.length > 40));
check('`payment_confirmed` sale del webhook de Stripe, no del retorno del navegador',
    eventById('payment_confirmed').source === 'checkout.session.completed');

grupo('Los destinatarios');
check('los cuatro papeles del pedido están',
    ['donor', 'beneficiary', 'site', 'campaign'].every(isKnownRecipientKind));
check('un papel inventado NO entra', !isKnownRecipientKind('tesoreria'));
check('RECIPIENT_IDS no tiene repetidos', new Set(RECIPIENT_IDS).size === RECIPIENT_IDS.length);

// ════════════════════════════════════════════════════════════════════
grupo('La llave de idempotencia');

const K = { contributionId: 'don-1', event: 'payment_confirmed', recipient: 'ana@club.org' };
check('se compone con contribución + evento + destinatario',
    deliveryKey(K) === 'don-1::payment_confirmed::ana@club.org');
// `Ana@Club.org` y `ana@club.org` son la misma persona: con dos llaves
// distintas recibiría dos veces el mismo «recibimos tu aporte».
check('el correo se normaliza a minúsculas y sin espacios',
    deliveryKey({ ...K, recipient: '  Ana@Club.ORG ' }) === deliveryKey(K));
check('dos eventos distintos NO comparten llave',
    deliveryKey({ ...K, event: 'refunded' }) !== deliveryKey(K));
check('dos aportes distintos NO comparten llave',
    deliveryKey({ ...K, contributionId: 'don-2' }) !== deliveryKey(K));
check('dos destinatarios distintos NO comparten llave',
    deliveryKey({ ...K, recipient: 'otro@club.org' }) !== deliveryKey(K));
check('sin alguno de los tres no hay llave',
    deliveryKey({ ...K, recipient: '' }) === null
    && deliveryKey({ ...K, contributionId: '' }) === null
    && deliveryKey({ ...K, event: '' }) === null
    && deliveryKey({}) === null);
check('normalizeEmail tolera nulos', normalizeEmail(null) === '' && normalizeEmail(undefined) === '');

// ════════════════════════════════════════════════════════════════════
grupo('Los estados: el progreso avanza y no retrocede');

check('los siete estados están', DELIVERY_STATES.length === 7);
check('las dos familias están declaradas',
    isFailureState('bounced') && isFailureState('failed') && isFailureState('blocked')
    && !isFailureState('sent') && !isFailureState('delivered') && !isFailureState('opened'));
check('un estado inventado no se reconoce', !isKnownDeliveryState('quizas'));

// Resend entrega por webhook y NO garantiza el orden: es normal recibir
// `delivered` después de `opened`. Si el último pisara al anterior, una
// entrega abierta volvería a «Entregado» y se contarían mal las aperturas.
check('un `delivered` tardío NO deshace un `opened`',
    mergeDeliveryState('opened', 'delivered') === 'opened');
check('el progreso sí avanza', mergeDeliveryState('sent', 'delivered') === 'delivered');
check('y avanza hasta abierto', mergeDeliveryState('delivered', 'opened') === 'opened');
check('un `sent` tardío no retrocede desde entregado',
    mergeDeliveryState('delivered', 'sent') === 'delivered');
check('pending es el piso', mergeDeliveryState('pending', 'sent') === 'sent');

// Un rebote después de un `sent` es la corrección de lo que creíamos.
check('un fallo corrige un envío que creíamos bueno',
    mergeDeliveryState('sent', 'bounced') === 'bounced');
// Un rebote después de un `opened` es una CONTRADICCIÓN —nadie abre un correo
// que rebotó— y se conserva la evidencia más fuerte. Pintar de rojo una
// entrega que el destinatario demostró haber leído es el error caro.
check('un rebote NO pisa una apertura demostrada',
    mergeDeliveryState('opened', 'bounced') === 'opened');
check('ni una entrega confirmada',
    mergeDeliveryState('delivered', 'bounced') === 'delivered');
check('un `sent` tardío no deshace un rebote ya escrito',
    mergeDeliveryState('bounced', 'sent') === 'bounced');
// Dato de un tercero: no se inventa una traducción.
check('un estado desconocido no cambia nada',
    mergeDeliveryState('sent', 'raro') === 'sent' && mergeDeliveryState('raro', 'sent') === 'sent');
check('sin nada previo se toma el entrante', mergeDeliveryState(null, 'sent') === 'sent');
check('sin nada de nada queda pendiente', mergeDeliveryState(null, 'raro') === 'pending');

// ════════════════════════════════════════════════════════════════════
grupo('Los reintentos: lo temporal sí, lo definitivo no');

check('un envío correcto no se reintenta',
    !canRetry({ state: 'sent', retryCount: 0, retryable: true }));
// Un rebote duro no mejora por insistir, y en volumen es lo que arruina la
// reputación del dominio desde el que envía TODA la plataforma.
check('un rebote NO se reintenta nunca',
    !canRetry({ state: 'bounced', retryCount: 0, retryable: true }));
check('un bloqueo tampoco',
    !canRetry({ state: 'blocked', retryCount: 0, retryable: true }));
check('un fallo declarado reintentable sí',
    canRetry({ state: 'failed', retryCount: 0, retryable: true }));
// Ante la duda NO se reintenta: un aviso que no sale se ve y se reenvía a
// mano; uno que sale cinco veces ya salió.
check('un fallo que no se declaró reintentable, NO',
    !canRetry({ state: 'failed', retryCount: 0, retryable: false }));
check('se agotan a los tres intentos',
    canRetry({ state: 'failed', retryCount: MAX_RETRIES - 1, retryable: true })
    && !canRetry({ state: 'failed', retryCount: MAX_RETRIES, retryable: true }));
check('la espera CRECE entre intentos',
    RETRY_DELAYS_MIN.every((v, i) => i === 0 || v > RETRY_DELAYS_MIN[i - 1]));
check('el primer reintento es rápido y el último, largo',
    nextRetryDelay(0) === 2 && nextRetryDelay(2) === 60);
check('un contador fuera de rango no rompe la cuenta',
    nextRetryDelay(99) === 60 && nextRetryDelay(-3) === 2 && nextRetryDelay(null) === 2);

// ════════════════════════════════════════════════════════════════════
grupo('Lo que se guarda de un envío');

const base = { contributionId: 'don-1', event: 'payment_confirmed', recipient: 'Ana@Club.org' };
const n = normalizeDelivery(base);
check('normaliza y compone su llave', n.key === deliveryKey(base) && n.recipient === 'ana@club.org');
check('el papel por defecto es el aportante', n.recipientKind === 'donor');
check('el proveedor por defecto es Resend', n.provider === 'resend');
check('nace pendiente y sin marca de envío', n.state === 'pending' && n.sentAt === null);
// Registrar una entrega que no se puede atar a nada ocupa sitio en la ficha y
// no contesta ninguna pregunta.
check('sin destinatario no se registra nada', normalizeDelivery({ ...base, recipient: '' }) === null);
check('un evento fuera del catálogo no se registra', normalizeDelivery({ ...base, event: 'inventado' }) === null);
check('un papel inventado cae al aportante, no rompe',
    normalizeDelivery({ ...base, recipientKind: 'tesoreria' }).recipientKind === 'donor');
check('un estado inventado cae a pendiente',
    normalizeDelivery({ ...base, state: 'quien-sabe' }).state === 'pending');
// El error del proveedor se propaga TEXTUAL, pero acotado: una respuesta de
// error puede traer el cuerpo entero.
const largo = normalizeDelivery({ ...base, errorMessage: 'x'.repeat(900), subject: 'y'.repeat(500) });
check('el motivo del error se recorta, no se resume', largo.errorMessage.length === 500);
check('el asunto también se acota', largo.subject.length === 300);
check('los campos vacíos quedan en null, no en cadena vacía',
    normalizeDelivery({ ...base, clubId: '   ' }).clubId === null);
// El perfil y el beneficiario no existen en la Fase 0: se llenan cuando
// existan, sin migrar nada.
check('el contexto que aún no existe se admite vacío',
    n.profileId === null && n.beneficiaryId === null && n.templateVersion === null);
check('un contador de reintentos negativo se acota a cero',
    normalizeDelivery({ ...base, retryCount: -5 }).retryCount === 0);

// ════════════════════════════════════════════════════════════════════
grupo('El resumen que pinta la ficha');

const filas = [
    { state: 'delivered' }, { state: 'sent' }, { state: 'bounced' }, { state: 'opened' },
];
const r = summarizeDeliveries(filas);
check('cuenta el total', r.total === 4);
// `sent` NO cuenta como entregado: significa que el proveedor lo aceptó, que
// es otra cosa, y es justo la distinción que hace falta cuando alguien dice
// que no recibió nada.
check('«le llegó» son delivered y opened, no sent', r.entregadas === 2);
check('cuenta los fallos', r.fallidas === 1);
check('desglosa por estado', r.porEstado.sent === 1 && r.porEstado.opened === 1);
// Sin filas la respuesta no es «no le llegó»: es que no se registró nada. Son
// cosas distintas y confundirlas manda a buscar el problema donde no está.
check('sin ninguna fila lo DICE, en vez de afirmar que no llegó',
    summarizeDeliveries([]).sinRegistro === true && summarizeDeliveries([]).entregadas === 0);
check('con filas, `sinRegistro` es falso', r.sinRegistro === false);
check('tolera basura', summarizeDeliveries(null).total === 0 && summarizeDeliveries([{}]).porEstado.pending === 1);


// ════════════════════════════════════════════════════════════════════
grupo('FASE 1 — la entidad beneficiaria');

check('sin nombre legal no hay entidad', beneficiaryShape({}) === null && beneficiaryShape(null) === null);
// El nombre comercial es el que FIRMA el correo; si no se declara se usa el
// legal, y nunca queda vacío.
check('el nombre comercial cae al legal cuando falta',
    beneficiaryShape({ legalName: 'Fundación Colombiana de Rotarios' }).tradeName === 'Fundación Colombiana de Rotarios');
check('y se respeta cuando se declara',
    beneficiaryShape({ legalName: 'Fundación Colombiana de Rotarios', tradeName: 'Colrotarios' }).tradeName === 'Colrotarios');
check('el correo se normaliza',
    beneficiaryShape({ legalName: 'X', email: ' Contacto@Col.ORG ' }).email === 'contacto@col.org');
// El dinero entra a la cuenta Stripe de la plataforma: datos de recaudo acá
// serían una segunda verdad sobre a dónde va, y sería falsa.
check('NO admite cuentas bancarias', (() => {
    const b = beneficiaryShape({ legalName: 'X', bankAccount: '123', accountNumber: '456', iban: 'ES00' });
    return !('bankAccount' in b) && !('accountNumber' in b) && !('iban' in b);
})());

grupo('FASE 1 — la identidad del remitente');
// Un color termina dentro de un atributo `style` de un correo: cualquier otra
// cosa es una vía de inyección.
check('sólo se acepta un hexadecimal de seis',
    hexOrNull('#0C2A5E') === '#0C2A5E'
    && hexOrNull('0C2A5E') === null
    && hexOrNull('red') === null
    && hexOrNull('#0C2') === null
    && hexOrNull('#0c2a5e"; onload=alert(1)') === null);
check('se normaliza a mayúsculas', hexOrNull('#0c2a5e') === '#0C2A5E');
// La DIRECCIÓN de envío no se declara en el perfil: la resuelve el servidor.
// Dejarla escribir a mano permitiría firmar desde un dominio ajeno.
check('la identidad NO deja escribir la dirección de envío', (() => {
    const i = identityShape({ fromName: 'X', fromEmail: 'aportes@ajeno.org', from: 'x@y.org' });
    return !('fromEmail' in i) && !('from' in i);
})());
check('el reply-to se normaliza', identityShape({ replyTo: ' A@B.ORG ' }).replyTo === 'a@b.org');
check('el enrutamiento por defecto prefiere el dominio del sitio',
    routingShape({}).prefer === 'site' && routingShape({}).allowSiteDomain === true);
check('una preferencia inventada cae al sitio', routingShape({ prefer: 'marte' }).prefer === 'site');

grupo('FASE 1 — las direcciones internas');
check('quita repetidos, espacios y mayúsculas',
    emailList(' A@b.com , a@B.com; c@d.org ').join(',') === 'a@b.com,c@d.org');
check('descarta lo que evidentemente no es un correo',
    emailList('hola, a@b.com, @nada, sin-arroba').join(',') === 'a@b.com');
// Una notificación interna con cincuenta destinatarios es una lista de correo,
// y eso se administra en otra parte.
check('tiene tope', emailList(Array.from({ length: 40 }, (_, i) => `a${i}@b.com`)).length === INTERNAL_RECIPIENTS_MAX);
check('acepta una cadena o un array',
    emailList(['a@b.com']).length === 1 && emailList('a@b.com').length === 1);

grupo('FASE 1 — el perfil');
check('sin nombre no hay perfil', profileShape({}) === null);
// NO se manda todo por defecto (criterio 12).
check('un perfil nuevo no avisa a nadie hasta que se marque', (() => {
    const p = profileShape({ name: 'X' });
    return Object.values(p.events).every(f => Object.values(f).every(v => v === false));
})());
check('el default de fábrica avisa sólo al aportante', (() => {
    const d = defaultEventRules();
    return d.payment_confirmed.donor === true && d.payment_confirmed.beneficiary === false;
})());
// Un evento que la plataforma todavía no puede observar se descarta aunque
// venga marcado: encenderlo daría una casilla que no dispara nunca.
check('un evento no disponible NO se puede encender', (() => {
    const p = profileShape({ name: 'X', events: { in_transit: { donor: true }, payment_confirmed: { donor: true } } });
    return !('in_transit' in p.events) && p.events.payment_confirmed.donor === true;
})());
check('recipientsFor devuelve los papeles marcados', (() => {
    const p = profileShape({ name: 'X', events: { payment_confirmed: { donor: true, beneficiary: true } } });
    const r = recipientsFor(p, 'payment_confirmed');
    return r.includes('donor') && r.includes('beneficiary') && r.length === 2;
})());
check('un evento sin reglas no notifica a nadie', recipientsFor(profileShape({ name: 'X' }), 'inventado').length === 0);

grupo('FASE 1 — la resolución del perfil');
const SITIO = { id: 'club-4281', district: '4271, 4281', districtId: null };
const PERFILES = [
    { id: 'p-global', active: true, isDefault: true, priority: 0, targeting: { mode: 'all' } },
    { id: 'p-distrito', active: true, isDefault: false, priority: 5, targeting: { mode: 'districts', districts: ['4281'] } },
    { id: 'p-otro', active: true, isDefault: false, priority: 9, targeting: { mode: 'districts', districts: ['4400'] } },
];
check('gana el que alcanza al sitio, no el global',
    pickProfileFor({ profiles: PERFILES, site: SITIO }).profile.id === 'p-distrito');
check('un perfil que NO alcanza al sitio no gana aunque tenga más prioridad',
    pickProfileFor({ profiles: PERFILES, site: { id: 'x', district: '4400' } }).profile.id === 'p-otro');
// `Club.district` es una LISTA: «4271, 4281». Un solo criterio deja fuera a la
// mitad de los sitios — error ya pagado dos veces (v4.744/v4.748).
check('el distrito se reconoce dentro de una lista',
    pickProfileFor({ profiles: PERFILES, site: { id: 'y', district: 'Distrito 4281' } }).profile.id === 'p-distrito');
check('«42811» NO cuenta como 4281',
    pickProfileFor({ profiles: PERFILES, site: { id: 'z', district: '42811' } }).profile.id === 'p-global');
// Lo explícito manda sobre lo deducido del alcance.
check('la campaña manda sobre el alcance',
    pickProfileFor({ profiles: PERFILES, site: SITIO, campaign: { notificationProfileId: 'p-otro' } }).profile.id === 'p-otro');
// Que la campaña apunte a un perfil apagado no puede dejar el aporte sin aviso.
check('una campaña que apunta a un perfil inexistente sigue bajando la jerarquía',
    pickProfileFor({ profiles: PERFILES, site: SITIO, campaign: { notificationProfileId: 'no-existe' } }).profile.id === 'p-distrito');
check('un perfil apagado no participa',
    pickProfileFor({ profiles: [{ id: 'a', active: false, targeting: { mode: 'all' } }], site: SITIO }).profile === null);
// El MOTIVO viaja siempre: es lo que contesta «¿por qué salió firmado así?».
check('el motivo se DICE en los cuatro caminos',
    pickProfileFor({ profiles: PERFILES, site: SITIO }).reason === 'alcanza a este sitio'
    && pickProfileFor({ profiles: PERFILES, site: SITIO, campaign: { notificationProfileId: 'p-otro' } }).reason === 'elegido en la campaña'
    && pickProfileFor({ profiles: [PERFILES[0]], site: SITIO }).reason === 'perfil global'
    && pickProfileFor({ profiles: [], site: SITIO }).reason === 'no hay ningún perfil activo');
// Si dependiera del orden de la base, el mismo sitio firmaría distinto en dos
// aportes seguidos — la lección de `pickDistrictSite`.
check('el desempate es ESTABLE', (() => {
    const empatados = [
        { id: 'b', active: true, priority: 3, targeting: { mode: 'all' } },
        { id: 'a', active: true, priority: 3, targeting: { mode: 'all' } },
    ];
    const uno = pickProfileFor({ profiles: empatados, site: SITIO }).profile.id;
    const dos = pickProfileFor({ profiles: [...empatados].reverse(), site: SITIO }).profile.id;
    return uno === dos && uno === 'a';
})());

grupo('FASE 1 — qué le falta a un perfil');
const P_OK = profileShape({
    name: 'Colrotarios', beneficiaryId: 'b1',
    identity: { fromName: 'Fundación Colombiana de Rotarios', replyTo: 'a@col.org', logoUrl: 'https://x/l.png' },
    events: { payment_confirmed: { donor: true } },
});
check('un perfil completo pasa', validateProfile(P_OK, { beneficiary: { id: 'b1' } }).ok);
check('sin nombre visible no se puede usar',
    !validateProfile(profileShape({ ...P_OK, identity: {} }), { beneficiary: { id: 'b1' } }).ok);
check('sin entidad beneficiaria tampoco',
    !validateProfile(profileShape({ ...P_OK, beneficiaryId: null }), {}).ok);
// Un perfil que no notifica a nadie es un perfil que no hace nada.
check('un perfil que no avisa a nadie es un error',
    !validateProfile(profileShape({ ...P_OK, events: {} }), { beneficiary: { id: 'b1' } }).ok);
check('una entidad borrada se detecta', !validateProfile(P_OK, { beneficiary: null }).ok);
// Los avisos NO bloquean: tratarlos igual convierte cualquiera en un bloqueo y
// se dejan de leer.
check('avisar a la entidad sin ninguna dirección es un AVISO, no un error', (() => {
    const p = profileShape({ ...P_OK, events: { payment_confirmed: { donor: true, beneficiary: true } } });
    const v = validateProfile(p, { beneficiary: { id: 'b1' } });
    return v.ok && v.warnings.some(w => /no va a salir/.test(w));
})());
check('sin reply-to se avisa pero se puede usar', (() => {
    const p = profileShape({ ...P_OK, identity: { fromName: 'X', logoUrl: 'https://x/l.png' } });
    const v = validateProfile(p, { beneficiary: { id: 'b1' } });
    return v.ok && v.warnings.length > 0;
})());

// ════════════════════════════════════════════════════════════════════
grupo('FASE 1 — la plantilla');

check('la de fábrica es válida', validateTemplate(defaultTemplate()).ok);
check('sin asunto no se puede guardar', !validateTemplate({ subject: '', blocks: [{ type: 'paragraph', text: 'x' }] }).ok);
check('sin bloques tampoco', !validateTemplate({ subject: 'x', blocks: [] }).ok);
// Un bloque desconocido no se puede dibujar; dejarlo pasar daría un correo con
// un hueco sin explicación.
check('un bloque inventado se descarta', blockShape({ type: 'iframe', text: 'x' }) === null);
check('un bloque sólo admite los campos que declara', (() => {
    const b = blockShape({ type: 'divider', text: 'esto sobra', url: 'https://x' });
    return !('text' in b) && !('url' in b) && b.type === 'divider';
})());
// Una variable que la plataforma no sabe resolver saldría IMPRESA en el correo.
check('una variable desconocida bloquea el guardado',
    !validateTemplate({ subject: 'Hola {{inventada}}', blocks: [{ type: 'paragraph', text: 'x' }] }).ok);
check('las del catálogo pasan',
    validateTemplate({ subject: 'Hola {{donor_name}}', blocks: [{ type: 'paragraph', text: '{{amount}} {{currency}}' }] }).ok);
// Un botón que no lleva a ninguna parte es peor que ninguno (v4.650), y en un
// correo no se puede corregir después de enviado.
check('un botón sin destino bloquea',
    !validateTemplate({ subject: 'x', blocks: [{ type: 'button', text: 'Ver' }] }).ok);
check('variablesIn no repite', variablesIn('{{a}} {{b}} {{a}}').join(',') === 'a,b');

grupo('FASE 1 — la dirección de un botón');
// Termina en un `href`: `javascript:` y `data:` son las dos que convierten un
// campo del panel en una vía de ataque.
check('sólo http y https',
    safeUrl('https://x.org') === 'https://x.org'
    && safeUrl('http://x.org') === 'http://x.org'
    && safeUrl('javascript:alert(1)') === ''
    && safeUrl('data:text/html,<script>') === ''
    && safeUrl('mailto:a@b.com') === ''
    && safeUrl('no es una url') === '');
// El marcador entero se admite y se comprueba DESPUÉS de sustituir, que es
// cuando se sabe a dónde apunta de verdad.
check('el marcador entero se admite y se comprueba al resolver',
    safeUrl('{{campaign_url}}') === '{{campaign_url}}');

grupo('FASE 1 — el escapado y el render');
check('el escapado cubre los cinco',
    escapeHtml('<a href="x" title=\'y\'>&</a>') === '&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;');
// El nombre de un aportante lo escribe un desconocido en un formulario
// público: es la entrada menos confiable de todo el módulo.
check('un nombre con HTML sale escapado, no ejecutado', (() => {
    const r = renderTemplate({
        template: { subject: 'x', blocks: [{ type: 'paragraph', text: '{{donor_name}}' }] },
        vars: { donor_name: '<img src=x onerror=alert(1)>' },
    });
    return !/<img src=x/.test(r.html) && /&lt;img/.test(r.html);
})());
check('un asunto con comillas no rompe el título', (() => {
    const r = renderTemplate({ template: { subject: 'Gracias "{{donor_name}}"', blocks: [{ type: 'divider' }] }, vars: { donor_name: 'A' } });
    return /&quot;A&quot;/.test(r.html);
})());
// El atributo de evento va precedido de un espacio dentro de la etiqueta:
// `/on\w+=/` a secas casa con «content=» del `<meta viewport>` y daría un
// falso positivo permanente.
check('el render no mete ningún script ni manejador de evento', (() => {
    const r = renderTemplate({ template: defaultTemplate(), vars: sampleVariables() });
    return !/<script/i.test(r.html) && !/\son\w+\s*=/i.test(r.html);
})());
// Una variable sin valor NO se borra: se deja el marcador y se reporta. Un
// hueco donde iba el monto se publica sin que nadie lo note.
check('una variable sin valor deja el marcador y se REPORTA', (() => {
    const r = applyVariables('Aporte de {{amount}}', {});
    return r.text === 'Aporte de {{amount}}' && r.missing[0] === 'amount';
})());
check('y el render lo acumula', (() => {
    const r = renderTemplate({ template: { subject: '{{campaign_name}}', blocks: [{ type: 'paragraph', text: '{{amount}}' }] }, vars: {} });
    return r.missing.includes('amount') && r.missing.includes('campaign_name');
})());
// Un renglón «Campaña: » en blanco se lee como un error del sistema.
check('el resumen no dibuja las filas sin valor', (() => {
    const r = renderTemplate({ template: { subject: 'x', blocks: [{ type: 'summary' }] }, vars: { amount: '50.000', currency: 'COP' } });
    return /50\.000 COP/.test(r.html) && !/Campaña:/.test(r.html);
})());
check('sin mensaje del aportante no queda un recuadro vacío', (() => {
    const r = renderTemplate({ template: { subject: 'x', blocks: [{ type: 'quote', title: 'Tu mensaje' }] }, vars: {} });
    return !/Tu mensaje/.test(r.html);
})());
// La dirección se comprueba DESPUÉS de sustituir: antes era un marcador.
check('un botón cuya variable no se resolvió NO se dibuja', (() => {
    const r = renderTemplate({ template: { subject: 'x', blocks: [{ type: 'button', text: 'Ver', url: '{{campaign_url}}' }] }, vars: {} });
    return !/<a href/.test(r.html);
})());
check('y con destino válido sí', (() => {
    const r = renderTemplate({ template: { subject: 'x', blocks: [{ type: 'button', text: 'Ver', url: '{{campaign_url}}' }] }, vars: { campaign_url: 'https://x.org/c' } });
    return /<a href="https:\/\/x\.org\/c"/.test(r.html);
})());
// Sin versión en texto plano, algunos filtros puntúan el correo como
// sospechoso y un cliente sin HTML mostraría una página en blanco.
check('el correo lleva versión en texto plano', (() => {
    const r = renderTemplate({ template: defaultTemplate(), vars: sampleVariables() });
    return r.text.length > 80 && !/</.test(r.text);
})());
check('los valores de ejemplo son los que pidió el cliente',
    sampleVariables().donor_name === 'Rodrigo Díaz'
    && sampleVariables().amount === '50.000'
    && sampleVariables().currency === 'COP'
    && /Emergencia Terremoto Colombia 2026/.test(sampleVariables().campaign_name)
    && /Rotary Distrito 4281/.test(sampleVariables().site_name));
check('todas las variables del pedido están en el catálogo',
    ['donor_name', 'donor_email', 'amount', 'currency', 'campaign_name', 'campaign_url',
        'site_name', 'beneficiary_name', 'contribution_id', 'payment_reference',
        'contribution_date', 'donor_message', 'receipt_url'].every(isKnownVariable));
check('el logotipo sin dirección no deja un hueco', (() => {
    const r = renderTemplate({ template: { subject: 'x', blocks: [{ type: 'logo' }] }, vars: {} });
    return !/<img/.test(r.html);
})());


// ════════════════════════════════════════════════════════════════════
grupo('FASE 2 — el dominio en su forma canónica');

// El proveedor verifica el APEX, no el subdominio `www`. Si las dos formas no
// se redujeran a la misma, un dominio verificado no se reconocería y el correo
// caería al respaldo sin motivo.
check('se quita el www', normalizeDomain('www.rotary4281.org') === 'rotary4281.org');
check('se admite una URL entera',
    normalizeDomain('https://www.rotary4281.org/aportes?x=1') === 'rotary4281.org');
check('se normaliza a minúsculas y sin punto final',
    normalizeDomain('  Rotary4281.ORG. ') === 'rotary4281.org');
check('lo que no es un dominio se descarta',
    normalizeDomain('localhost') === '' && normalizeDomain('') === '' && normalizeDomain(null) === '');
check('la parte local se acota a lo que un buzón admite',
    normalizeLocalPart('Aportes!! <script>') === 'aportesscript'
    && normalizeLocalPart('a'.repeat(80)).length === 40);

grupo('FASE 2 — la jerarquía del remitente');
const PERFIL_ENVIO = profileShape({
    name: 'Colrotarios',
    identity: { fromName: 'Fundación Colombiana de Rotarios', replyTo: 'contacto@colrotarios.org' },
    routing: { prefer: 'site', allowSiteDomain: true, localPart: 'aportes' },
    events: { payment_confirmed: { donor: true } },
});
const plan = (extra) => resolveSenderPlan({ profile: PERFIL_ENVIO, ...extra });

// N1 — el dominio propio, y sólo si está verificado.
check('N1: dominio propio verificado', (() => {
    const r = plan({ siteDomain: 'rotary4281.org', verifiedDomains: ['rotary4281.org', 'clubplatform.org'] });
    return r.level === 1 && r.address === 'aportes@rotary4281.org';
})());
check('el www del sitio no impide reconocerlo', (() => {
    const r = plan({ siteDomain: 'www.rotary4281.org', verifiedDomains: ['rotary4281.org'] });
    return r.level === 1 && r.address === 'aportes@rotary4281.org';
})());
// LA REGLA QUE NO SE NEGOCIA: nunca desde un dominio sin verificar. Hasta hoy
// `EmailService.sendEmail` sí lo intentaba y lo descubría por el rechazo — eso
// es un correo perdido por intento, y en volumen hunde la reputación del
// dominio desde el que envía toda la plataforma.
check('un dominio SIN verificar NUNCA se usa', (() => {
    const r = plan({ siteDomain: 'rotary4281.org', verifiedDomains: ['clubplatform.org'] });
    return r.level === 2 && !r.address.includes('rotary4281.org');
})());
check('N2: el central verificado', (() => {
    const r = plan({ siteDomain: '', verifiedDomains: ['clubplatform.org'] });
    return r.level === 2 && r.address === 'aportes@clubplatform.org';
})());
// Sin ningún dominio verificado se cae al respaldo, que es exactamente el
// comportamiento de antes de esta fase.
check('N3: sin nada verificado, el respaldo de siempre', (() => {
    const r = plan({ siteDomain: 'rotary4281.org', verifiedDomains: [] });
    return r.level === 3 && r.address === fallbackSender();
})());
// Una decisión institucional, no técnica: una entidad puede querer firmar
// siempre desde lo central aunque el sitio tenga su dominio verificado.
check('un perfil puede prohibir el dominio del sitio', (() => {
    const p = profileShape({ name: 'X', routing: { allowSiteDomain: false } });
    const r = resolveSenderPlan({ profile: p, siteDomain: 'rotary4281.org', verifiedDomains: ['rotary4281.org', 'clubplatform.org'] });
    return r.level === 2 && r.reason === 'el perfil pide el dominio central';
})());
// «No está verificado» y «el perfil no lo permite» se corrigen en sitios
// distintos: el motivo es la mitad del diagnóstico.
check('el motivo distingue los tres casos del nivel 2',
    plan({ siteDomain: '', verifiedDomains: ['clubplatform.org'] }).reason === 'el sitio no tiene dominio propio configurado'
    && plan({ siteDomain: 'x.org', verifiedDomains: ['clubplatform.org'] }).reason === 'el dominio del sitio no está verificado en el proveedor');
check('el nombre visible viaja en el From', (() => {
    const r = plan({ siteDomain: 'rotary4281.org', verifiedDomains: ['rotary4281.org'] });
    return r.from === '"Fundación Colombiana de Rotarios" <aportes@rotary4281.org>';
})());
// Una comilla en el nombre partiría la cabecera del correo.
check('una comilla en el nombre no rompe la cabecera', (() => {
    const p = profileShape({ name: 'X', identity: { fromName: 'Fundación "Colrotarios"' } });
    const r = resolveSenderPlan({ profile: p, siteDomain: '', verifiedDomains: ['clubplatform.org'] });
    return (r.from.match(/"/g) || []).length === 2;
})());
check('el reply-to sale del perfil',
    plan({ siteDomain: '', verifiedDomains: ['clubplatform.org'] }).replyTo === 'contacto@colrotarios.org');
check('sin buzón declarado se usa el de omisión', (() => {
    const p = profileShape({ name: 'X' });
    const r = resolveSenderPlan({ profile: p, siteDomain: '', verifiedDomains: ['clubplatform.org'] });
    return r.address === `${DEFAULT_LOCAL_PART}@${centralDomain()}`;
})());
// Sin perfil no se rompe: es el camino de un sitio que no configuró nada.
check('sin perfil sigue resolviendo', resolveSenderPlan({}).level === 3);

grupo('FASE 2 — a qué direcciones se escribe');
const BEN = { email: 'direccion@colrotarios.org' };
const conPapeles = (papeles) => profileShape({
    name: 'X', internalRecipients: ['tesoreria@colrotarios.org'],
    events: { payment_confirmed: papeles },
});
check('el aportante', (() => {
    const r = resolveRecipients({ profile: conPapeles({ donor: true }), event: 'payment_confirmed', donorEmail: 'Ana@Club.org' });
    return r.recipients.length === 1 && r.recipients[0].email === 'ana@club.org';
})());
// Las direcciones internas y el correo de la entidad son dos cosas: la primera
// es a quién avisar en la operación, la segunda el buzón institucional.
check('la entidad junta sus internas y su correo', (() => {
    const r = resolveRecipients({ profile: conPapeles({ beneficiary: true }), event: 'payment_confirmed', beneficiary: BEN });
    return r.recipients.length === 2;
})());
// La misma persona puede ser dirección interna y correo del sitio, y recibiría
// dos veces el mismo aviso.
check('no se le escribe dos veces a la misma dirección', (() => {
    const r = resolveRecipients({
        profile: conPapeles({ beneficiary: true, site: true }),
        event: 'payment_confirmed', beneficiary: BEN, siteEmail: 'tesoreria@colrotarios.org',
    });
    return r.recipients.filter(x => x.email === 'tesoreria@colrotarios.org').length === 1;
})());
// Un aviso marcado que no sale y no lo dice es el silencio que este módulo
// existe para no tener.
check('un papel que no se pudo resolver se DICE, con su motivo', (() => {
    const r = resolveRecipients({ profile: conPapeles({ site: true }), event: 'payment_confirmed', siteEmail: '' });
    return r.recipients.length === 0 && /no tiene correo configurado/.test(r.skipped[0].reason);
})());
// La plataforma no guarda un responsable por campaña. Un aviso que llega al
// buzón equivocado es peor que uno que no llega.
check('«responsable de campaña» se salta y explica que no existe todavía', (() => {
    const r = resolveRecipients({ profile: conPapeles({ campaign: true }), event: 'payment_confirmed' });
    return r.recipients.length === 0 && /no declara responsable/.test(r.skipped[0].reason);
})());
check('sin nada marcado no se escribe a nadie',
    resolveRecipients({ profile: conPapeles({}), event: 'payment_confirmed', donorEmail: 'a@b.com' }).recipients.length === 0);


// ════════════════════════════════════════════════════════════════════
grupo('FASE 3 — el aviso interno no es la confirmación al aportante');

// Con una sola plantilla, el aviso interno le agradecería a la tesorería por un
// aporte que no hizo.
check('la interna es válida', validateTemplate(defaultInternalTemplate()).ok);
check('y NO agradece: informa de un movimiento',
    /Nuevo aporte recibido/.test(defaultInternalTemplate().subject)
    && !/Gracias/i.test(defaultInternalTemplate().subject));
check('el aportante recibe la de agradecimiento',
    defaultTemplateFor('donor').subject === defaultTemplate().subject);
check('los demás papeles reciben la interna',
    defaultTemplateFor('beneficiary').subject === defaultInternalTemplate().subject
    && defaultTemplateFor('site').subject === defaultInternalTemplate().subject);
// Sin papel declarado se cae al aportante, que es el caso de siempre.
check('sin papel se cae a la del aportante',
    defaultTemplateFor(null).subject === defaultTemplate().subject
    && defaultTemplateFor(undefined).subject === defaultTemplate().subject);
// La interna es más seca a propósito: sin botón y sin firma institucional.
check('la interna no lleva botón ni firma', (() => {
    const tipos = defaultInternalTemplate().blocks.map(b => b.type);
    return !tipos.includes('button') && !tipos.includes('signature');
})());
// Quien la reciba tiene que poder reconocerla en una bandeja de trabajo.
check('la interna dice de qué campaña y cuánto',
    /\{\{campaign_name\}\}/.test(defaultInternalTemplate().subject)
    && /\{\{amount\}\}/.test(defaultInternalTemplate().preheader));


// ════════════════════════════════════════════════════════════════════
grupo('FASE 4 — el reembolso y lo que NO se puede prometer');

// `refunded` ya tiene fuente: `charge.refunded` enrutado a donaciones.
check('el reembolso pasa a estar disponible',
    eventById('refunded').available === true
    && availableEvents().map(e => e.id).join(',') === 'payment_confirmed,refunded');
// `failed` NO se implementa, y el motivo no es que falte trabajo: un pago que
// falla nunca crea una `Donation`, así que no hay contribución sobre la que
// notificar —y la llave de idempotencia es contribución + evento +
// destinatario—.
check('«pago fallido» se declara como NO APLICABLE, no como pendiente',
    eventById('failed').available === false
    && /No aplica a este módulo/.test(eventById('failed').help)
    && !/[Nn]ecesita/.test(eventById('failed').help));
check('y explica por qué: no hay contribución ni destinatario',
    /nunca crea un aporte/.test(eventById('failed').help));

// Un aporte devuelto no se puede notificar con «gracias por tu aporte».
check('el reembolso tiene su propia plantilla', validateTemplate(defaultRefundTemplate()).ok);
check('y NO agradece',
    !/[Gg]racias/.test(defaultRefundTemplate().subject)
    && /devolución/i.test(defaultRefundTemplate().subject));
check('el evento decide qué dice, el papel decide el tono',
    defaultTemplateFor('donor', 'refunded').subject === defaultRefundTemplate().subject
    && defaultTemplateFor('donor', 'payment_confirmed').subject === defaultTemplate().subject
    && /devuelto/i.test(defaultTemplateFor('beneficiary', 'refunded').subject)
    && /recibido/i.test(defaultTemplateFor('beneficiary', 'payment_confirmed').subject));
// Sin evento se cae a la confirmación, que es el caso de siempre.
check('sin evento se cae a la confirmación',
    defaultTemplateFor('donor').subject === defaultTemplate().subject);
// La plataforma no sabe POR QUÉ se reembolsó —lo decidió alguien en Stripe— y
// suponer un motivo sería inventar.
check('el texto del reembolso no supone un motivo',
    !/(cancel|error|problema|rechaz)/i.test(defaultRefundTemplate().blocks.map(b => b.text || '').join(' ')));

// ════════════════════════════════════════════════════════════════════
grupo('Lo que no se ve ejecutando nada');
{
    const spec = readFileSync('server/lib/notificationSpec.js', 'utf8');
    const log = readFileSync('server/lib/notificationLog.js', 'utf8');
    const ensure = readFileSync('server/lib/ensureNotificationSchema.js', 'utf8');
    const pago = readFileSync('server/controllers/paymentController.js', 'utf8');
    const prismaSchema = readFileSync('server/prisma/schema.prisma', 'utf8');
    const plantilla = readFileSync('server/lib/notificationTemplate.js', 'utf8');
    const ctrl = readFileSync('server/controllers/notificationProfileController.js', 'utf8');
    const rutas = readFileSync('server/routes/notification-profiles.js', 'utf8');
    const pantalla = readFileSync('src/pages/admin/ContributionNotifications.tsx', 'utf8');

    // El criterio es PURO: sin base, sin red. Si importa `db.js` deja de
    // poderse probar sin Postgres, que es todo el punto de separarlo.
    check('el criterio no importa la base ni sale a la red',
        !/from '\.\/db\.js'/.test(spec) && !/fetch\(/.test(spec));

    // La tabla vive FUERA de Prisma. `Donation` y `Payment` se consultan con
    // findMany sin select en media plataforma: una columna declarada y
    // todavía inexistente dejaría esas consultas en 500, y eso cae sobre el
    // cobro (regla de `logo_intl`, v4.699).
    check('NotificationDelivery no está en schema.prisma',
        !/model\s+NotificationDelivery\b/.test(prismaSchema));
    // Se busca la SENTENCIA, no la mención: el comentario que promete no
    // borrar nada tiene que poder nombrar `DROP` sin hacer fallar la prueba.
    const sinComentarios = ensure
        .replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '');
    check('y se crea en runtime, sin DROP ni TRUNCATE',
        /CREATE TABLE IF NOT EXISTS "NotificationDelivery"/.test(ensure)
        && !/\bDROP\b|\bTRUNCATE\b/i.test(sinComentarios));
    // El índice único es lo que hace IMPOSIBLE el duplicado. Comprobarlo en
    // el código sería una carrera entre dos entregas del mismo webhook.
    check('la idempotencia la sostiene un índice ÚNICO sobre la llave',
        /CREATE UNIQUE INDEX IF NOT EXISTS "NotificationDelivery_key_key"/.test(ensure));
    // NO es parcial: las tres columnas de la llave son NOT NULL, así que no
    // hay predicado que repetir en el ON CONFLICT (la trampa de v4.648).
    check('ese índice no es parcial, así que el ON CONFLICT es directo',
        !/NotificationDelivery_key_key[\s\S]{0,120}WHERE/i.test(ensure)
        && /ON CONFLICT \(key\) DO NOTHING/.test(log));

    // Nada de la bitácora puede lanzar: corre dentro del webhook de Stripe,
    // después de acreditar el cobro. Una excepción tumbaría el 200 que Stripe
    // espera y provocaría el reintento de un evento ya procesado.
    check('todas las funciones de escritura atrapan sus errores',
        (log.match(/catch \(e\)/g) || []).length >= 4
        && /return fallo\(e\?\.message/.test(log));
    check('las lecturas degradan a vacío, no lanzan',
        /} catch \{\s*return \[\];/.test(log) && /} catch \{\s*return \{\};/.test(log));

    // El reclamo va ANTES del envío: es lo que impide que dos entregas
    // concurrentes del mismo webhook manden dos recibos a la misma persona.
    // Anotarlo después dejaría esa puerta abierta.
    const bloque = pago.slice(pago.indexOf('[DONATION-EMAIL] Intentando enviar'), pago.indexOf('} catch (emailErr)'));
    check('el recibo se RECLAMA antes de enviarse',
        bloque.indexOf('claimDelivery(') < bloque.indexOf('EmailService.sendPlatformEmail')
        && bloque.indexOf('claimDelivery(') > -1);
    check('un reclamo perdido NO manda el correo dos veces',
        /const yaEnviado = traza\.ok && !traza\.claimed/.test(bloque)
        && /yaEnviado \? null : await EmailService\.sendPlatformEmail/.test(bloque));
    // Un `return` ahí saldría de la función entera y dejaría fuera cualquier
    // paso que se agregue después del bloque del recibo.
    check('y lo hace con una bandera, no con un return que corte la función',
        !/\n\s*return;\s*\n/.test(bloque));
    // Quedarse sin recibo por no poder anotarlo sería cambiar un problema de
    // auditoría por uno de servicio.
    check('si el registro falla, el recibo se manda igual',
        /no se pudo registrar[\s\S]{0,60}se envía igual/.test(bloque));
    check('el envío y el fallo quedan escritos',
        /markSent\(traza\.delivery\.id/.test(bloque) && /markFailed\(traza\.delivery\.id/.test(bloque));
    // `sendPlatformEmail` no distingue un rechazo definitivo de uno pasajero:
    // devuelve `{success:false, error}` para los dos.
    check('el motivo del proveedor se guarda TEXTUAL',
        /errorMessage: emailResult\?\.error/.test(bloque));

    // Esta fase NO cambia lo que recibe el aportante.
    check('el asunto y el remitente del recibo no cambiaron',
        /Recibo de tu donación al \$\{subjectTopic\}/.test(pago)
        && /from: PLATFORM_DONATION_SENDER/.test(bloque));

    // ── FASE 1 ────────────────────────────────────────────────────
    //
    // El alcance se resuelve con `targetsSite` de contributionSpec, no con un
    // criterio propio: con dos, un perfil podría alcanzar a un sitio que la
    // campaña no alcanza, y el correo hablaría de una campaña que ese sitio no
    // muestra.
    check('el alcance reutiliza el targeting de las campañas',
        /from '\.\/contributionSpec\.js'/.test(spec) && /targetsSite\(/.test(spec));

    // El HTML lo escribimos NOSOTROS: del administrador sólo entra texto, que
    // se escapa. Un editor de HTML libre acá es una inyección con pasos extra.
    const plantillaSinComentarios = plantilla
        .replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    check('la plantilla NO admite HTML arbitrario',
        !/dangerouslySetInnerHTML|innerHTML/.test(plantillaSinComentarios)
        && /escapeHtml/.test(plantillaSinComentarios));
    // Ningún bloque escribe el texto del administrador sin pasar por el
    // escapado: `txt()` es el único camino.
    check('todo texto del administrador pasa por el escapado',
        /const txt = \(v\) => \{[\s\S]{0,200}escapeHtml/.test(plantilla));

    // Un perfil lleva la identidad institucional de un tercero y decide desde
    // qué dominio sale el correo.
    check('las rutas son del operador de la plataforma',
        /roleMiddleware\(\['administrator'\]\)/.test(rutas) && /router\.use\(authMiddleware, soloOperador\)/.test(rutas));
    // La ruta y el controlador se protegen por separado: una ruta que se
    // reordene o se copie perdería la guardia sin que nada avise.
    check('y el controlador lo comprueba OTRA VEZ',
        (ctrl.match(/if \(!isOperator\(req\)\)/g) || []).length >= 8);

    // Nunca se actualiza una fila: editar inserta una versión nueva. Es lo que
    // permite explicar un aporte de hace seis meses con la plantilla que lo
    // generó (criterio 18).
    check('las plantillas se VERSIONAN, no se reescriben',
        /UPDATE "NotificationTemplate" SET "isCurrent" = FALSE/.test(ctrl)
        && /INSERT INTO "NotificationTemplate"/.test(ctrl)
        && !/UPDATE "NotificationTemplate"[\s\S]{0,200}SET subject/.test(ctrl));
    // El índice es PARCIAL (`WHERE "isCurrent"`), así que un ON CONFLICT
    // tendría que repetir el predicado o la sentencia falla entera (v4.648).
    check('y por eso NO se usa ON CONFLICT contra el índice parcial',
        /WHERE "isCurrent";/.test(ensure)
        && !/ON CONFLICT[\s\S]{0,80}NotificationTemplate/.test(ctrl));
    // En Postgres NULL nunca es igual a NULL: sin COALESCE, dos plantillas
    // globales no chocarían jamás.
    check('el índice usa COALESCE para que las globales choquen',
        /COALESCE\("profileId", ''\), COALESCE\("campaignId", ''\)/.test(ensure));

    // Se valida ANTES de escribir: guardar una plantilla que no se puede
    // enviar deja una versión inservible marcada como vigente.
    check('la plantilla se valida antes de guardarse',
        /const v = validateTemplate\(t\);[\s\S]{0,400}if \(!v\.ok\) return res\.status\(422\)/.test(ctrl));

    // Borrar un perfil no puede llevarse la traza de correos que de verdad
    // salieron: son la única forma de explicar un aporte.
    check('borrar un perfil NO borra las entregas ya registradas',
        /DELETE FROM "NotificationTemplate" WHERE "profileId"/.test(ctrl)
        && !/DELETE FROM "NotificationDelivery"/.test(ctrl));

    // v4.857: ahora SÍ gobierna, y la pantalla dice qué pasa con un sitio al
    // que no llegue ningún perfil. «¿Por qué mi sitio manda con otra
    // dirección?» tiene que poder contestarse sin leer el código.
    check('la pantalla DICE qué gobierna y qué pasa sin perfil',
        /gobierna la confirmación de los aportes/i.test(pantalla)
        && /sigue recibiendo el recibo de siempre/i.test(pantalla));
    // El correo se dibuja aislado: es HTML compuesto con datos de la campaña.
    check('la vista previa va en un iframe con sandbox vacío',
        /sandbox=""/.test(pantalla) && /srcDoc=\{vista\.html\}/.test(pantalla));
    // Una dependencia que falta en un useCallback no la ve el typecheck y el
    // ajuste simplemente no llega nunca (lección de `conQr`, v4.836).
    // Cada una de estas es una dependencia que, si falta, no llega nunca a la
    // petición — y el defecto se ve como «la vista previa no cambió», nunca
    // como un error (la lección de `conQr`, v4.836).
    check('la vista previa depende de la plantilla, el sitio, el destinatario y el evento',
        /\}, \[perfil, plantilla, sitioPrueba, destinatario, evento\]\);/.test(pantalla));

    // ── FASE 2 ────────────────────────────────────────────────────
    const emisor = readFileSync('server/lib/notificationSender.js', 'utf8');
    const dominiosSrc = readFileSync('server/lib/senderDomains.js', 'utf8');

    // Consultar al proveedor en cada envío sería una llamada de red a un
    // tercero DENTRO del webhook de Stripe, y Stripe da de baja los endpoints
    // que tardan.
    check('la verificación de dominios se CACHEA con vencimiento',
        /NotificationDomain/.test(ensure) && /DOMAIN_TTL_MIN/.test(dominiosSrc));
    // `null` y `[]` son cosas distintas: confundirlas borraría la caché con una
    // lista vacía y dejaría a todos los sitios en el respaldo.
    check('«no se pudo preguntar» NO es «no hay ninguno»',
        /Devuelve `null` —no `\[\]`—/.test(dominiosSrc)
        && /if \(frescos === null\)/.test(dominiosSrc));
    check('nada de la caché lanza',
        (dominiosSrc.match(/catch/g) || []).length >= 4);

    // Con perfil aplicable el recibo de siempre NO sale: dos correos por el
    // mismo aporte es lo que este módulo existe para no producir.
    const bloqueEmisor = pago.slice(pago.indexOf('v4.857 — EL PERFIL DE NOTIFICACIÓN'), pago.indexOf('} catch (emailErr)'));
    check('con perfil aplicable, el recibo de siempre NO se manda',
        /const traza = porPerfil\.handled\s*\?\s*\{ ok: true, claimed: false/.test(bloqueEmisor));
    // Un `return` ahí saldría de la función entera.
    check('y se sale con una bandera, no con un return',
        !/\n\s*return;\s*\n/.test(bloqueEmisor));
    // Sin ningún perfil configurado —el caso de todos los sitios hasta que
    // alguien cree uno— sale el recibo idéntico al de v4.855.
    check('sin perfil, el recibo de siempre sigue saliendo',
        /sale el recibo de siempre/.test(bloqueEmisor)
        && /from: PLATFORM_DONATION_SENDER/.test(bloqueEmisor));
    // Un fallo del camino nuevo no puede dejar al aportante sin confirmación.
    check('un fallo del perfil degrada al recibo de siempre',
        /catch \(perfilErr\)[\s\S]{0,400}handled: false/.test(bloqueEmisor));

    // Corre dentro del webhook, después de acreditar el cobro: una excepción
    // tumbaría el 200 que Stripe espera. El try envuelve TODO el cuerpo, así
    // que es una propiedad del código y no un argumento sobre qué puede fallar
    // por dentro.
    check('el emisor nunca lanza, por construcción',
        /return await enviarTodas\(args\);\s*\} catch \(e\)/.test(emisor)
        && /fallo inesperado/.test(emisor));
    // El reclamo va antes del envío, igual que en la Fase 0.
    check('el emisor RECLAMA antes de enviar',
        emisor.indexOf('claimDelivery(') < emisor.indexOf('EmailService.sendPlatformEmail'));
    // Consultar los dominios por destinatario sería repetir la misma pregunta.
    // Se mira DENTRO del envío: el reintento tiene su propia consulta, y es
    // otro camino.
    check('los dominios se consultan UNA vez por aporte', (() => {
        const envio = emisor.slice(emisor.indexOf('const enviarTodas'), emisor.indexOf('const enviarUno'));
        return (envio.match(/await verifiedDomains\(/g) || []).length === 1;
    })());
    // Sin la versión en texto plano, algunos filtros puntúan el correo como
    // sospechoso y un cliente sin HTML muestra una página en blanco.
    check('el correo sale con su versión en texto plano',
        /text: salida\.text/.test(emisor) && /if \(text\) body\.text = text;/.test(readFileSync('server/services/EmailService.js', 'utf8')));

    // Una prueba que no prueba el camino que se va a usar no prueba nada.
    check('la prueba sale por el MISMO remitente que un aporte real',
        /from: remitente\.from/.test(ctrl) && /resolveSenderPlan\(/.test(ctrl));
    check('la pantalla muestra el remitente real, con su nivel y su motivo',
        /vista\.sender\.address/.test(pantalla) && /vista\.sender\.reason/.test(pantalla));

    // ── FASE 3 ────────────────────────────────────────────────────
    const boveda = readFileSync('src/pages/admin/WalletManagement.tsx', 'utf8');
    const financiero = readFileSync('server/controllers/financialController.js', 'utf8');
    const campanas = readFileSync('src/pages/admin/ContributionCampaigns.tsx', 'utf8');
    const rutasFin = readFileSync('server/routes/financial.js', 'utf8');

    // El aporte se busca ACOTADO por el clubId del token, no se lee y después
    // se comprueba a quién pertenece: para quien pregunta por uno ajeno,
    // simplemente no existe.
    check('el reenvío acota el aporte por el sitio del token',
        /FROM "Donation" WHERE id = \$1 AND "clubId" = \$2/.test(financiero));
    // Reenviar no es leer: es un correo a un tercero.
    check('y exige rol administrativo del sitio',
        /donations\/:id\/resend', authMiddleware, requireSiteAdmin/.test(rutasFin));
    check('queda registrado quién lo pidió', /\[RESEND\][\s\S]{0,80}req\.user\?\.email/.test(financiero));
    // Con una consulta por aporte serían decenas por pantalla.
    check('las notificaciones viajan con los aportes, en un viaje',
        /notifications: await listDeliveriesFor\(donations\.map/.test(financiero));

    // `sent` NO es `delivered`, y la tarjeta tiene que distinguirlo: es la
    // pregunta que se hace cuando alguien dice que no recibió nada.
    check('la Bóveda distingue enviado de entregado',
        /sent: \{ label: 'Enviado'/.test(boveda) && /delivered: \{ label: 'Entregado'/.test(boveda));
    // Vacío no es «no le llegó»: es que no se registró nada.
    check('y dice que «sin registro» no es «no llegó»',
        /No hay ningún envío registrado/.test(boveda));
    check('el motivo del proveedor se ve TEXTUAL en la ficha',
        /d\.errorMessage/.test(boveda));
    // La llave de idempotencia es contribución + evento + destinatario.
    check('se avisa que al mismo destinatario no se repite',
        /Al mismo destinatario no se repite/.test(boveda));

    // La decisión se toma donde ya se está trabajando la campaña: las
    // pantallas que se olvidan son siempre las del segundo lugar.
    check('la campaña puede elegir su perfil',
        /notificationProfileId/.test(campanas) && /'notificaciones'/.test(campanas));
    // Si no está en CARD_IDS se queda fuera de «Expandir todo».
    check('y la tarjeta está en CARD_IDS',
        /CARD_IDS = \[[\s\S]{0,200}'notificaciones'/.test(campanas));
    // NULL es «heredar», el valor de todas las campañas existentes.
    check('el servidor guarda la elección de la campaña',
        /"notificationProfileId" = \$13/.test(readFileSync('server/controllers/contributionCampaignController.js', 'utf8')));

    // Sin esto, cambiar de destinatario cargaría siempre la del aportante y se
    // guardaría encima de la otra.
    check('el editor carga y guarda la plantilla del destinatario elegido',
        /recipientKind=\$\{encodeURIComponent\(kind\)\}/.test(pantalla)
        && /recipientKind: destinatario/.test(pantalla));

    // ── FASE 4 ────────────────────────────────────────────────────
    const mkt = readFileSync('server/controllers/emailMarketingController.js', 'utf8');
    const cron = readFileSync('server/routes/cron.js', 'utf8');
    const vercel = readFileSync('vercel.json', 'utf8');

    // Resend manda TODOS sus eventos a la misma dirección: con dos endpoints
    // habría que configurar dos, y una se quedaría sin configurar.
    check('el webhook de Resend actualiza las entregas',
        /ESTADO_RESEND/.test(mkt) && /applyProviderEvent/.test(mkt));
    // Un fallo actualizando la entrega no puede impedir la baja del contacto,
    // que es lo que protege de seguir escribiéndole a quien dijo que no.
    check('y su fallo no tumba la baja del contacto del CRM',
        /no se pudo actualizar la entrega/.test(mkt));
    // Una queja de spam no es que la dirección rechazara el correo: es que la
    // persona pidió no recibirlo. Confundirlos haría buscar un problema de
    // entrega donde hay una decisión.
    check('una queja se registra como bloqueo, no como rebote',
        /'email\.complained': 'blocked'/.test(mkt));
    // Un retraso no es un desenlace: marcarlo como fallo mandaría a reintentar
    // algo que todavía va en camino.
    // Se busca en el CÓDIGO, no en el comentario que explica por qué no está.
    check('un retraso NO se traduce a ningún estado',
        !/delivery_delayed/.test(mkt.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '')));

    // Insistirle a una dirección que ya dijo que no es lo que hunde la
    // reputación del dominio.
    check('el barrido de reintentos existe y está en el cron',
        /sweepRetries/.test(emisor) && /notification-retries/.test(cron) && /notification-retries/.test(vercel));
    check('y está protegido con CRON_SECRET',
        /notification-retries[\s\S]{0,400}CRON_SECRET/.test(cron));
    // Guardar el HTML serían decenas de KB por fila en una tabla que se lee en
    // cada listado de la Bóveda, y dejaría el correo congelado con una
    // plantilla que quizá ya se corrigió.
    check('el reintento vuelve a COMPONER el correo, no guarda el HTML',
        /renderTemplate\(\{/.test(emisor) && !/"html" TEXT|html TEXT/.test(ensure));
    // Dos barridos simultáneos no pueden reintentar el mismo envío.
    check('el reintento se RECLAMA con allowRetry',
        /allowRetry: true/.test(emisor));

    // Hasta v4.858 una donación reembolsada seguía figurando como ingreso del
    // club para siempre.
    check('charge.refunded llega a las donaciones',
        /routeDonationRefund\(event\)/.test(pago) && /async function routeDonationRefund/.test(pago));
    // El UPDATE condicional es lo que hace idempotente el reenvío del evento.
    check('el aporte deja de contar como ingreso, una sola vez',
        /SET status = 'refunded'[\s\S]{0,80}WHERE id = \$1 AND status = 'success'/.test(pago));
    // Marcar el aporte equivocado sería peor que no marcar ninguno.
    check('sin el vínculo NO se adivina cuál aporte era',
        /sin donationId: el aporte no se pudo marcar/.test(pago));
    // Un reembolso es un hecho nuevo, no la corrección de uno viejo.
    check('el libro mayor y el pago NO se tocan',
        !/routeDonationRefund[\s\S]{0,2000}(postDonation|DELETE FROM "Payment")/.test(pago));
}

console.log(`\n${ok} comprobaciones pasaron${malos.length ? `, ${malos.length} FALLARON:` : '.'}`);
for (const m of malos) console.log(`  ✗ ${m}`);
process.exit(malos.length ? 1 : 0);
