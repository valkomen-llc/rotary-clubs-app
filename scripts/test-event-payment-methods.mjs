#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// CON QUÉ SE PAGA UNA INSCRIPCIÓN A UN EVENTO.  npm run test:event-payment
// v4.1251.0
//
// SIN BASE, SIN CREDENCIALES Y SIN RED. Protege lo que pidió el cliente —el
// PayPal de la plataforma por defecto— y lo que no se negocia: una
// inscripción nunca se queda sin vía de cobro, y una de PayPal nunca se lee
// como aporte en el webhook compartido.
// ════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import {
    resolveEventPaymentOptions, pickEventPaymentMethod,
    paypalCustomIdFor, registrationIdFromCustomId, paypalPaymentKey,
} from '../server/lib/eventPaymentMethods.js';
import { resolvePaypalCharge } from '../server/lib/paypalSpec.js';

let pass = 0, fail = 0;
const ok = (n, c, d = '') => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${d ? ` — ${d}` : ''}`); } };
const eq = (n, a, b) => ok(n, JSON.stringify(a) === JSON.stringify(b), `esperaba ${JSON.stringify(b)}, dio ${JSON.stringify(a)}`);
const section = (t) => console.log(`\n${t}`);
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

const rates = { COP_USD: { perUnit: 4000, source: 'manual', updatedAt: new Date().toISOString() } };

section('1. PayPal POR DEFECTO cuando se puede');
{
    const plan = resolvePaypalCharge({ currency: 'COP', settlement: 'USD', rates });
    const o = resolveEventPaymentOptions({ paypalOffered: true, plan, env: 'live' });
    eq('con PayPal activado y tasa, va por defecto', o.defaultMethod, 'paypal');
    const pp = o.methods.find(m => m.id === 'paypal');
    ok('y dice que convierte, para avisarlo antes de cobrar', pp.converted && pp.currency === 'USD' && pp.perUnit === 4000);
    ok('la tarjeta sigue disponible como alternativa', o.methods.find(m => m.id === 'card').available);
    eq('sin pedir nada, se cobra por PayPal', pickEventPaymentMethod('', o), 'paypal');
    eq('pedir la tarjeta se respeta', pickEventPaymentMethod('card', o), 'card');
}

section('2. Sin PayPal, la tarjeta de siempre');
{
    const apagado = resolveEventPaymentOptions({ paypalOffered: false, plan: null });
    eq('desactivado en Métodos de pago → tarjeta', apagado.defaultMethod, 'card');
    eq('y se dice por qué', apagado.methods[0].reason, 'no_ofrecido');
    eq('una pantalla anterior (sin método) cobra con tarjeta', pickEventPaymentMethod(undefined, apagado), 'card');

    // NO SE INVENTA UNA TASA: sin ella PayPal no se ofrece.
    const sinTasa = resolvePaypalCharge({ currency: 'COP', settlement: 'USD', rates: {} });
    const o = resolveEventPaymentOptions({ paypalOffered: true, plan: sinTasa });
    eq('sin tasa para convertir → tarjeta', o.defaultMethod, 'card');
    eq('con su motivo', o.methods[0].reason, 'sin_tasa');
    eq('pedir PayPal igual NO cae en silencio a la tarjeta', pickEventPaymentMethod('paypal', o), null);
    eq('un método desconocido se rechaza', pickEventPaymentMethod('bitcoin', o), null);
}

section('3. El webhook compartido distingue inscripción de aporte');
{
    const cid = paypalCustomIdFor('reg_123');
    eq('la referencia lleva el prefijo propio', cid, 'evreg:reg_123');
    eq('y se lee de vuelta', registrationIdFromCustomId(cid), 'reg_123');
    eq('el id de un sitio (aporte) no es una inscripción', registrationIdFromCustomId('club_abc'), null);
    eq('vacío no es nada', registrationIdFromCustomId(''), null);
    ok('cabe en los 127 caracteres de PayPal', paypalCustomIdFor('x'.repeat(300)).length <= 127);
    eq('la clave de idempotencia es la captura', paypalPaymentKey('CAP-9'), 'paypal:CAP-9');
    eq('sin captura no hay clave', paypalPaymentKey(''), null);

    const webhook = read('server/controllers/paypalController.js');
    ok('el webhook separa las inscripciones ANTES de leer un aporte',
        webhook.indexOf('handlePaypalRegistrationEvent') > -1
        && webhook.indexOf('handlePaypalRegistrationEvent') < webhook.indexOf("if (evento?.event_type !== 'PAYMENT.CAPTURE.COMPLETED')"));
}

section('4. El camino real');
{
    const ctrl = read('server/controllers/eventRegistrationController.js');
    ok('el checkout decide la vía con el criterio puro', ctrl.includes('pickEventPaymentMethod(req.body?.method, options)'));
    ok('PayPal cobra con el MISMO criterio que pinta el botón', /startPaypalCheckout[\s\S]*resolvePaypalCharge\(\{\s*amount: charged/.test(ctrl));
    ok('sólo una captura COMPLETADA confirma', ctrl.includes("String(captura.status || '').toUpperCase() !== 'COMPLETED'"));
    ok('un «expired» de Stripe no deshace un pago confirmado',
        ctrl.includes("if (kind !== 'refunded' && SETTLED_STATUSES.includes(registration.status)) return registration;"));
    ok('Stripe y PayPal comparten el cierre (código, cuenta, correo)',
        (ctrl.match(/return finalizePaidRegistration\(/g) || []).length === 2);
    const rutas = read('server/routes/event-registrations.js');
    ok('la ruta de captura existe', rutas.includes("'/:id/paypal/capture'"));
    const pantalla = read('src/pages/RegistroEvento.tsx');
    ok('la pantalla captura al volver de PayPal', pantalla.includes('/paypal/capture'));
    ok('y manda la vía elegida al checkout', /JSON\.stringify\(\{[^}]*method/.test(pantalla));
}

console.log(`\n${pass} pasadas, ${fail} fallidas`);
process.exit(fail ? 1 : 0);
