#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// El CRITERIO del pago de una inscripción.  npm run test:fair:payment
// v4.978.0
//
// Sin base, sin credenciales, sin red. Prueba la pregunta de la que cuelga
// todo el módulo —¿hay un pago CONFIRMADO?— y sus consecuencias: qué se le
// ofrece a quien no lo tiene, qué se le dice sin exponerle el gateway, y qué
// sesión de la pasarela se puede reutilizar en vez de abrir otro cobro.
//
// El CAMINO —que la consulta lleve sus parámetros, que el reclamo impida el
// cobro duplicado, que el webhook cierre el intento— lo prueba
// `test:fair:payment:path`: el criterio puede estar bien y el defecto vivir en
// el camino (la lección de v4.744).
// ════════════════════════════════════════════════════════════════════
import {
    PAYMENT_STATES, ATTEMPT_STATES, hasConfirmedPayment, canStartPayment,
    friendlyFailure, paymentViewOf, readSessionOutcome, reusableCheckout,
    attemptHistoryOf, lastFailureOf, REUSE_MARGIN_MS,
} from '../server/lib/projectFairPayment.js';
import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
    if (cond) { pass++; console.log(`  ✓ ${name}`); }
    else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
};
const eq = (name, a, b) => ok(name, JSON.stringify(a) === JSON.stringify(b), `esperaba ${JSON.stringify(b)}, dio ${JSON.stringify(a)}`);
const section = (t) => console.log(`\n${t}`);

// ════════════════════════════════════════════════════════════════════
section('1. La regla de negocio: ¿hay un pago CONFIRMADO?');

// ⚠️ EL DEFECTO ORIGINAL, EN UNA ASERCIÓN. Una inscripción con sesión de
// checkout, con PaymentIntent y con intentos anteriores NO está pagada: todo
// eso demuestra que alguien intentó pagar. Si esta prueba se pusiera en verde
// tomando cualquiera de esos campos por pago, volvería el callejón sin salida.
const conIntentos = {
    status: 'pending_payment',
    stripeSessionId: 'cs_test_1',
    stripePaymentIntentId: 'pi_test_1',
    stripeChargeId: 'ch_test_1',
};
ok('un checkout anterior NO es un pago', !hasConfirmedPayment(conIntentos));
ok('un PaymentIntent anterior NO es un pago', !hasConfirmedPayment({ status: 'failed', stripePaymentIntentId: 'pi_x' }));
ok('sólo status=paid lo es', hasConfirmedPayment({ status: 'paid' }));
ok('y sin fila no hay pago', !hasConfirmedPayment(null) && !hasConfirmedPayment(undefined));

// El catálogo es cerrado: un estado inventado no se puede rotular ni reportar.
eq('el catálogo de estados', PAYMENT_STATES, ['pending_payment', 'failed', 'paid', 'refunded']);
eq('el de desenlaces de un intento', ATTEMPT_STATES, ['open', 'succeeded', 'failed', 'expired', 'canceled']);

section('2. A quién se le ofrece pagar');

ok('pendiente → sí', canStartPayment({ status: 'pending_payment' }));
ok('rechazado → sí', canStartPayment({ status: 'failed' }));
ok('pagado → no', !canStartPayment({ status: 'paid' }));
// Un reembolso es una decisión administrativa: volver a cobrarle por su cuenta
// a quien acaba de recibir su dinero de vuelta sería desobedecerla.
ok('reembolsado → no', !canStartPayment({ status: 'refunded' }));
// Ante un estado que no reconocemos, se ofrece pagar: equivocarse hacia ese
// lado deja un botón de más; hacia el otro, una inscripción encerrada.
ok('un estado desconocido → sí, y no se encierra a nadie', canStartPayment({ status: 'lo_que_sea' }));

section('3. Qué se pinta en la tarjeta INSCRIPCIÓN');

const pendiente = paymentViewOf({ status: 'pending_payment' });
eq('pendiente: rótulo', pendiente.label, 'Pendiente de pago');
eq('pendiente: acción', pendiente.actionLabel, 'Completar pago');
ok('pendiente: se puede pagar', pendiente.canPay && !pendiente.paid);

const rechazado = paymentViewOf({ status: 'failed' }, { lastFailure: { code: 'card_declined' } });
eq('rechazado: rótulo', rechazado.label, 'Pago no completado');
eq('rechazado: acción', rechazado.actionLabel, 'Reintentar pago');
ok('rechazado: se puede reintentar', rechazado.canPay);
ok('rechazado: dice qué pasó y qué hacer',
    rechazado.detail.includes('rechazó la tarjeta') && rechazado.detail.includes('otro medio de pago'));

// Un rechazo cuya sesión venció después deja la inscripción en
// `pending_payment` y el fallo en el historial: se lee como lo que fue.
const rechazadoPorHistorial = paymentViewOf({ status: 'pending_payment' }, { lastFailure: { code: 'insufficient_funds' } });
eq('un fallo del historial también se dice', rechazadoPorHistorial.label, 'Pago no completado');
ok('con su motivo', rechazadoPorHistorial.detail.includes('fondos suficientes'));

const pagado = paymentViewOf({ status: 'paid' });
eq('pagado: rótulo', pagado.label, 'Pago confirmado');
ok('pagado: NINGUNA acción de pago', !pagado.canPay && pagado.actionLabel === null && pagado.paid);

const reembolsado = paymentViewOf({ status: 'refunded' });
ok('reembolsado: sin acción y con salida escrita',
    !reembolsado.canPay && reembolsado.detail.includes('Escríbenos'));

section('4. El error del proveedor NO se le muestra al usuario');

// El crudo se guarda para soporte; lo que se muestra sale de un catálogo
// cerrado. Un código desconocido cae en la frase genérica, nunca en el texto
// del gateway.
ok('un código conocido se traduce', friendlyFailure('expired_card') === 'La tarjeta está vencida.');
ok('sin distinguir mayúsculas ni espacios', friendlyFailure('  Expired_Card ') === 'La tarjeta está vencida.');
eq('uno desconocido cae en la genérica', friendlyFailure('rate_limit_zzz'), 'El intento anterior no pudo procesarse.');
eq('y sin código, igual', friendlyFailure(null), 'El intento anterior no pudo procesarse.');
// La prueba que de verdad importa: que no se cuele el mensaje del gateway.
const crudo = 'Your card was declined. request_id: req_9aZ, pi_3Q7x';
ok('un mensaje crudo de Stripe NUNCA sale', !friendlyFailure(crudo).includes('req_9aZ'));

section('5. Leer el desenlace de una sesión de la pasarela');

eq('pagada', readSessionOutcome({ status: 'complete', payment_status: 'paid' }), 'paid');
// ⚠️ Una sesión puede estar `complete` y NO pagada. Darla por pagada sería el
// error caro de este archivo: se habilitarían los formularios sin cobro.
eq('completa y SIN pagar no es pagada', readSessionOutcome({ status: 'complete', payment_status: 'unpaid' }), 'unpaid');
eq('abierta', readSessionOutcome({ status: 'open', payment_status: 'unpaid' }), 'open');
eq('caducada', readSessionOutcome({ status: 'expired', payment_status: 'unpaid' }), 'expired');
eq('sin sesión', readSessionOutcome(null), 'unknown');

section('6. Qué sesión se puede reutilizar (y qué NO)');

const enUnaHora = Math.floor((Date.now() + 3600_000) / 1000);
const viva = { status: 'open', payment_status: 'unpaid', url: 'https://pay/1', expires_at: enUnaHora, amount_total: 6200, currency: 'usd' };

ok('una sesión abierta y con vida se reutiliza', reusableCheckout(viva, { amount: 62, currency: 'USD' }));
ok('una caducada no', !reusableCheckout({ ...viva, status: 'expired' }, { amount: 62, currency: 'USD' }));
ok('una ya pagada no', !reusableCheckout({ ...viva, payment_status: 'paid' }, { amount: 62, currency: 'USD' }));
ok('una sin URL no', !reusableCheckout({ ...viva, url: null }, { amount: 62, currency: 'USD' }));
// ⚠️ El recargo puede cambiar entre un intento y el siguiente: una sesión de
// ayer puede cobrar un valor que ya no es el vigente.
ok('una con OTRO importe no', !reusableCheckout(viva, { amount: 63, currency: 'USD' }));
ok('sin importe que comparar, se reutiliza igual', reusableCheckout(viva, {}));
// Mandar a alguien a un enlace que caduca a mitad del pago es peor que abrir otro.
const casiVencida = { ...viva, expires_at: Math.floor((Date.now() + REUSE_MARGIN_MS - 30_000) / 1000) };
ok('una que vence dentro del margen no', !reusableCheckout(casiVencida, { amount: 62, currency: 'USD' }));

// ⚠️ v4.982 — LA MONEDA ENTRA EN LA COMPARACIÓN. La Feria pasó de cobrar en
// dólares a cobrar en pesos: toda sesión abierta de antes cobra en otra moneda
// y no se puede reutilizar. Apoyarse en que los importes no coincidirían sería
// apoyarse en la suerte.
ok('una sesión en OTRA moneda no se reutiliza',
    !reusableCheckout(viva, { amount: 62, currency: 'COP' }));
const enPesos = { ...viva, currency: 'cop', amount_total: 26_250_000 };
ok('una en pesos con su importe exacto sí',
    reusableCheckout(enPesos, { amount: 262_500, currency: 'COP' }));
ok('una en pesos con otro importe no',
    !reusableCheckout(enPesos, { amount: 262_501, currency: 'COP' }));
// El importe se compara en la UNIDAD MÍNIMA de su moneda, que es lo que Stripe
// suma: el peso se cobra con dos decimales aunque se escriba sin ninguno.
ok('el peso se compara en centavos, no en pesos',
    !reusableCheckout({ ...enPesos, amount_total: 262_500 }, { amount: 262_500, currency: 'COP' }));

section('7. El historial: los intentos se conservan y se numeran');

const filas = [
    { status: 'failed', failureCode: 'card_declined', resolvedAt: '2026-08-01T10:00:00Z' },
    { status: 'expired', resolvedAt: '2026-08-02T10:00:00Z' },
    { status: 'failed', failureCode: 'insufficient_funds', resolvedAt: '2026-08-03T10:00:00Z' },
    { status: 'succeeded', resolvedAt: '2026-08-04T10:00:00Z' },
];
const hist = attemptHistoryOf(filas);
eq('se numeran por orden, no por un contador guardado', hist.map(h => h.n), [1, 2, 3, 4]);
eq('con su rótulo', hist.map(h => h.label), ['Rechazado', 'Caducado', 'Rechazado', 'Aprobado']);
// Un pago aprobado NO borra los rechazos anteriores: son lo único que contesta
// «¿por qué este club llamó a soporte?» dentro de seis meses.
eq('el aprobado no se lleva el historial por delante', hist.length, 4);
ok('sólo los rechazados llevan motivo',
    hist[0].reason && hist[2].reason && hist[1].reason === null && hist[3].reason === null);
eq('y el motivo es el traducido', hist[2].reason, 'La tarjeta no tenía fondos suficientes.');
eq('el último fallo es el más nuevo', lastFailureOf(filas).code, 'insufficient_funds');
eq('sin fallos, ninguno', lastFailureOf([{ status: 'succeeded' }]), null);
eq('y sobre una lista vacía, tampoco', lastFailureOf([]), null);

section('8. El criterio no habla con nadie');

// PURO: si algún día importa la base, Stripe o el DOM, deja de poder probarse
// —y entonces nadie se entera de que una regla cambió de signo.
//
// ⚠️ LO ÚNICO QUE PUEDE IMPORTAR ES `money.js`, y es una excepción DECLARADA,
// no un aflojamiento: aquél es igual de puro y es el único sitio donde vive la
// unidad mínima con que Stripe cobra cada moneda. Copiar acá un `* 100` sería
// un segundo criterio sobre lo mismo, que se separa en silencio —la regla del
// sitio— y con el que la comparación de una sesión dejaría de casar con el
// cobro. Cualquier otro import hace fallar esta prueba.
const fuente = readFileSync(new URL('../server/lib/projectFairPayment.js', import.meta.url), 'utf8');
const imports = [...fuente.matchAll(/^\s*import\s[^;]*?from\s+'([^']+)'/gm)].map(m => m[1]);
ok('sólo importa el criterio del dinero, y nada más',
    imports.length > 0 && imports.every(m => m === './money.js'));
const lineaImporte = fuente.split('\n').find(l => /amount_total/.test(l) && /!==/.test(l));
ok('y el importe se compara con la unidad mínima de su moneda, no con un «* 100»',
    !!lineaImporte && /toStripeAmount\(/.test(lineaImporte));
ok('no menciona el objeto de Stripe', !/new Stripe|getStripe\(/.test(fuente));
ok('ni consulta la base', !/db\.query/.test(fuente));

// ⚠️ Y NO HAY ESPEJO EN EL NAVEGADOR, a propósito: el veredicto lo arma el
// servidor y viaja resuelto. Una segunda copia del criterio en `src/` se
// separaría de ésta en silencio, y lo que se separaría es si a alguien se le
// ofrece pagar algo que ya pagó.
const pantalla = readFileSync(new URL('../src/pages/MiProyecto.tsx', import.meta.url), 'utf8');
ok('la pantalla no decide si se puede pagar',
    !/canStartPayment|hasConfirmedPayment/.test(pantalla) && /pago\?\.canPay/.test(pantalla));
ok('ni traduce el error del proveedor', !/friendlyFailure|card_declined/.test(pantalla));

console.log(`\n${fail ? '❌' : '✅'} test:fair:payment — ${pass} pasaron, ${fail} fallaron.`);
process.exit(fail ? 1 : 0);
