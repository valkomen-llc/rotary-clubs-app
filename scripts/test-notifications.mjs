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
} from '../server/lib/notificationSpec.js';

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
// Lo que se puede observar hoy es UNO. Prometer los otros en la pantalla sería
// una casilla que no hace nada (v4.650).
check('sólo `payment_confirmed` está disponible hoy',
    availableEvents().length === 1 && availableEvents()[0].id === 'payment_confirmed');
check('cada evento DECLARA de dónde sale',
    NOTIFICATION_EVENTS.every(e => typeof e.source === 'string' && e.source.length > 3));
// «¿por qué este aporte no disparó nada?» tiene que poder contestarse sin
// leer el código.
check('los eventos no disponibles explican qué falta',
    NOTIFICATION_EVENTS.filter(e => !e.available).every(e => /necesita|todavía/i.test(e.help)));
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
grupo('Lo que no se ve ejecutando nada');
{
    const spec = readFileSync('server/lib/notificationSpec.js', 'utf8');
    const log = readFileSync('server/lib/notificationLog.js', 'utf8');
    const ensure = readFileSync('server/lib/ensureNotificationSchema.js', 'utf8');
    const pago = readFileSync('server/controllers/paymentController.js', 'utf8');
    const prismaSchema = readFileSync('server/prisma/schema.prisma', 'utf8');

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
}

console.log(`\n${ok} comprobaciones pasaron${malos.length ? `, ${malos.length} FALLARON:` : '.'}`);
for (const m of malos) console.log(`  ✗ ${m}`);
process.exit(malos.length ? 1 : 0);
