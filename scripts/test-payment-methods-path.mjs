#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// EL CAMINO DEL INTERRUPTOR DE MÉTODOS DE PAGO.
// npm run test:payment-methods:path     v4.1056.0
//
// SIN POSTGRES, SIN CREDENCIALES Y SIN RED: la base, Prisma y Stripe se
// sustituyen con un hook de resolución de módulos.
//
// ⚠️ POR QUÉ EXISTE ADEMÁS DE `test:payment-methods`.
//
// El criterio (`isMethodOffered`) SIEMPRE estuvo bien. El defecto era que
// nadie lo llamaba desde el camino de Stripe: `card` se guardaba, se pintaba
// en el panel y no gobernaba nada. Una prueba de criterio habría pasado en
// verde con el defecto delante — es la lección de v4.744 y de v4.889.
//
// Acá se EJECUTAN los manejadores: es lo único que demuestra que la guardia
// de verdad corre, que va antes de crear la sesión de Stripe, y que un
// interruptor apagado no deja pasar un cobro.
// ════════════════════════════════════════════════════════════════════
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

let pass = 0, fail = 0;
const ok = (n, c, d = '') => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${d ? ` — ${d}` : ''}`); } };
const section = (t) => console.log(`\n${t}`);

// ── Dobles ───────────────────────────────────────────────────────────
// Lo activado sale de `globalThis.__metodos`, que cada caso pone. Es lo que
// permite recorrer apagado/encendido sin tocar ninguna base.
const PRISMA_STUB = 'data:text/javascript,' + encodeURIComponent(`
const club = { id: 'club-1', name: 'Rotary Distrito 4281', currency: 'COP' };
export default {
    platformConfig: {
        findUnique: async ({ where }) =>
            where.key === 'payment_methods'
                ? { key: 'payment_methods', value: JSON.stringify(globalThis.__metodos) }
                : null,
        upsert: async () => ({}),
    },
    club: { findUnique: async () => club },
    setting: { findFirst: async () => null, findUnique: async () => null },
};
`);

const DB_STUB = 'data:text/javascript,export default { query: async () => ({ rows: [] }) };';

// ⚠️ Stripe ANOTA que se lo llamó. Es lo que demuestra que la guardia corta
// ANTES: si el contador sube con el método apagado, el cobro se preparó.
const STRIPE_STUB = 'data:text/javascript,' + encodeURIComponent(`
export default class Stripe {
    constructor() {
        this.checkout = { sessions: { create: async () => {
            globalThis.__stripe.push('create');
            return { id: 'cs_test_1', url: 'https://checkout.stripe.test/cs_test_1' };
        } } };
        this.prices = { create: async () => ({ id: 'price_1' }) };
        this.products = { create: async () => ({ id: 'prod_1' }) };
    }
}
`);

register(
    'data:text/javascript,' + encodeURIComponent(`
    export async function resolve(s, c, n) {
        // ⚠️ El especificador llega TAL CUAL se escribió: 'prisma.js' se
        // importa como './prisma.js' desde lib/ y como '../lib/prisma.js'
        // desde los controladores. Con una sola forma, el doble no atrapa la
        // otra y la prueba pasa por los motivos equivocados — que fue lo que
        // pasó al escribirla: el store caía a su degradado y las secciones
        // comprobaban los valores por defecto, no lo que la prueba puso.
        if (s.endsWith('prisma.js')) return { url: ${JSON.stringify(PRISMA_STUB)}, shortCircuit: true };
        if (s.endsWith('lib/db.js') || s === './db.js') return { url: ${JSON.stringify(DB_STUB)}, shortCircuit: true };
        if (s === 'stripe') return { url: ${JSON.stringify(STRIPE_STUB)}, shortCircuit: true };
        return n(s, c);
    }`),
    pathToFileURL('./'),
);

globalThis.__metodos = {};
globalThis.__stripe = [];

process.env.STRIPE_SECRET_KEY = 'sk_test_x';
process.env.PAYPAL_CLIENT_ID = 'id';
process.env.PAYPAL_CLIENT_SECRET = 'sec';

const { createDonationCheckout, createSubscriptionCheckout, getDonationCurrency } =
    await import('../server/controllers/financialController.js');
const { invalidatePaymentMethods } = await import('../server/lib/paymentMethodsStore.js');

// ── Arnés HTTP mínimo ────────────────────────────────────────────────
const resFake = () => {
    const r = { code: 200, body: null, headers: {} };
    r.status = (c) => { r.code = c; return r; };
    r.json = (b) => { r.body = b; return r; };
    r.set = (k, v) => { r.headers[k] = v; return r; };
    return r;
};

const conMetodos = (m) => { globalThis.__metodos = m; invalidatePaymentMethods(); globalThis.__stripe = []; };

const APORTE = {
    clubId: 'club-1', amount: 100000, currency: 'COP', frequency: 'one-time',
    donorEmail: 'quien@aporta.org', donorName: 'Quien Aporta',
};

// ════════════════════════════════════════════════════════════════════
section('1. La tarjeta APAGADA no deja cobrar');

conMetodos({ card: { enabled: false }, paypal: { enabled: true } });
let res = resFake();
await createDonationCheckout({ body: { ...APORTE }, headers: {} }, res);

ok('la donación se rechaza con 503', res.code === 503, `dio ${res.code}`);
ok('con el código que la pantalla reconoce', res.body?.code === 'PAYMENT_METHOD_DISABLED');
ok('y el motivo', res.body?.reason === 'desactivado' && res.body?.method === 'card');
// ⚠️ LO QUE DE VERDAD IMPORTA: no se llegó a preparar el cobro.
ok('NO se creó ninguna sesión de Stripe', globalThis.__stripe.length === 0,
    'la guardia tiene que cortar ANTES: después el cobro ya está preparado');

res = resFake();
await createSubscriptionCheckout({ body: { clubId: 'club-1', blockId: 'b1', interval: 'monthly' }, headers: {} }, res);
ok('la membresía también se rechaza', res.code === 503 && res.body?.code === 'PAYMENT_METHOD_DISABLED');
ok('y tampoco crea sesión', globalThis.__stripe.length === 0);

// ════════════════════════════════════════════════════════════════════
section('2. Encendida, el cobro sigue su camino');

conMetodos({ card: { enabled: true } });
res = resFake();
await createDonationCheckout({ body: { ...APORTE }, headers: {} }, res);
ok('la donación NO se bloquea', res.body?.code !== 'PAYMENT_METHOD_DISABLED');
ok('y llega a crear la sesión de Stripe', globalThis.__stripe.length === 1,
    'si esto falla, encender el método no devuelve la vía');
ok('con su URL de checkout', typeof res.body?.url === 'string' && res.body.url.includes('checkout.stripe'));

// ════════════════════════════════════════════════════════════════════
section('3. Sin credenciales, otro motivo');

// El interruptor encendido no alcanza: configurado y activado son dos cosas.
const guardada = process.env.STRIPE_SECRET_KEY;
delete process.env.STRIPE_SECRET_KEY;
conMetodos({ card: { enabled: true } });
res = resFake();
await createDonationCheckout({ body: { ...APORTE }, headers: {} }, res);
ok('se rechaza igual', res.code === 503);
ok('y el motivo distingue el caso', res.body?.reason === 'sin_credenciales',
    'se corrige en otro sitio: cargar la variable, no tocar el interruptor');
process.env.STRIPE_SECRET_KEY = guardada;

// ════════════════════════════════════════════════════════════════════
section('4. La disponibilidad que lee el modal');

conMetodos({ card: { enabled: false } });
res = resFake();
await getDonationCurrency({ query: { clubId: 'club-1' }, headers: {} }, res);
ok('/currency dice que la tarjeta NO está disponible', res.body?.card?.available === false);
ok('con su motivo', res.body?.card?.reason === 'desactivado');
ok('y sigue resolviendo la moneda', typeof res.body?.currency === 'string',
    'el interruptor no puede romper lo que esa ruta ya hacía');

conMetodos({ card: { enabled: true } });
res = resFake();
await getDonationCurrency({ query: { clubId: 'club-1' }, headers: {} }, res);
ok('encendida, dice que sí', res.body?.card?.available === true);

// ⚠️ SIN CACHÉ. La respuesta depende de quién pregunta y de un interruptor que
// cambia: una caché intermedia le serviría a un visitante el estado de otro, y
// es justo lo que haría reaparecer un método apagado tras recargar.
ok('la respuesta NO se cachea', /no-store/.test(res.headers['Cache-Control'] || ''),
    'con caché, un método apagado reaparece hasta que venza');

// ════════════════════════════════════════════════════════════════════
section('5. Apagar surte efecto en el acto');

// ⚠️ Es el criterio de aceptación: el panel guarda y la vía siguiente ya usa el
// estado nuevo. Si `savePaymentMethods` no invalidara la caché, el método
// apagado seguiría cobrando hasta un minuto — y quien lo apaga lo prueba en
// seguida, no dentro de un minuto.
const { savePaymentMethods } = await import('../server/lib/paymentMethodsStore.js');
conMetodos({ card: { enabled: true } });
res = resFake();
await getDonationCurrency({ query: { clubId: 'club-1' }, headers: {} }, res);
ok('parte de encendida', res.body?.card?.available === true);

// El panel guarda: el doble de Prisma lee de `__metodos`, así que se mueve eso
// y se guarda para que la invalidación sea la que de verdad actúe.
globalThis.__metodos = { card: { enabled: false } };
await savePaymentMethods({ card: { enabled: false } });

res = resFake();
await getDonationCurrency({ query: { clubId: 'club-1' }, headers: {} }, res);
ok('y tras guardar ya está apagada, sin esperar al TTL', res.body?.card?.available === false,
    'guardar invalida la caché: sin eso, apagar tarda hasta un minuto en verse');

res = resFake();
await createDonationCheckout({ body: { ...APORTE }, headers: {} }, res);
ok('y el cobro se rechaza en el acto', res.code === 503 && globalThis.__stripe.length === 0);

console.log(`\n${'─'.repeat(60)}`);
console.log(`${pass} pasaron, ${fail} fallaron`);
if (fail) process.exit(1);
console.log('El interruptor gobierna el cobro, no sólo el botón.');
