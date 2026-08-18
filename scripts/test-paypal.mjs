#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// EL CRITERIO DE PAYPAL.  npm run test:paypal
// v4.866.0
//
// SIN BASE, SIN CREDENCIALES Y SIN RED. Lo que protegen sobre todo es la regla
// que no se negocia: NO SE CONVIERTE NINGÚN IMPORTE.
// ════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import {
    paypalDecimals, paypalAmount, paypalCurrencyOk, MOTIVOS_MONEDA,
    parseCapture, paypalAvailability, approvalUrl, paypalRef,
} from '../server/lib/paypalSpec.js';

let pass = 0, fail = 0;
const ok = (n, c, d = '') => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${d ? ` — ${d}` : ''}`); } };
const eq = (n, a, b) => ok(n, JSON.stringify(a) === JSON.stringify(b), `esperaba ${JSON.stringify(b)}, dio ${JSON.stringify(a)}`);
const section = (t) => console.log(`\n${t}`);
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

// ── 1. No se convierte nada ─────────────────────────────────────────
section('1. NO SE CONVIERTE NINGÚN IMPORTE');

// ⚠️ La regla que gobierna el módulo. El visitante ya vio «$ 100.000» en la
// pantalla: cobrarle otra cifra en otra moneda sería cambiarle el trato. Misma
// regla que el `fx` de las inscripciones y la moneda del aporte (v4.834).
const distinta = paypalCurrencyOk('COP', 'USD');
ok('con la cuenta en dólares, un aporte en pesos NO se ofrece', !distinta.ok);
eq('y se dice por qué', distinta.reason, 'moneda_distinta');
ok('el motivo está redactado', /no se convierten/i.test(MOTIVOS_MONEDA.moneda_distinta));

eq('si coinciden, se cobra', paypalCurrencyOk('USD', 'USD').ok, true);
// Sin moneda configurada la cuenta cobra en la que venga: es el valor por
// defecto y hace que PayPal se comporte como Stripe.
eq('sin configurar, se acepta la del aporte', paypalCurrencyOk('COP', '').currency, 'COP');
eq('y se declara el motivo', paypalCurrencyOk('COP', '').reason, 'cualquiera');
eq('sin moneda no se ofrece', paypalCurrencyOk('', 'USD').ok, false);

// ── 2. El formato del importe ───────────────────────────────────────
section('2. PayPal quiere una CADENA con los decimales exactos');

// ⚠️ NO se usan los decimales de PRESENTACIÓN. El peso se muestra sin centavos
// en la plataforma, pero eso es cómo se escribe, no lo que PayPal espera. Es la
// misma distinción que `stripeDecimals`.
eq('el peso va con dos decimales para PayPal', paypalAmount(100000, 'COP'), '100000.00');
eq('el dólar también', paypalAmount(10, 'USD'), '10.00');
eq('el yen no se subdivide', paypalDecimals('JPY'), 0);
eq('y va sin decimales', paypalAmount(1500, 'JPY'), '1500');
ok('un importe inválido LANZA en vez de mandar basura',
    (() => { try { paypalAmount(0, 'USD'); return false; } catch { return true; } })());

// ── 3. La comisión, medida ──────────────────────────────────────────
section('3. La comisión de PayPal viene MEDIDA, no estimada');

const ordenOk = {
    payer: { email_address: 'ana@correo.com', name: { given_name: 'Ana', surname: 'Díaz' }, payer_id: 'PID1' },
    purchase_units: [{ payments: { captures: [{
        id: 'CAP123', status: 'COMPLETED',
        amount: { currency_code: 'USD', value: '10.00' },
        seller_receivable_breakdown: {
            gross_amount: { currency_code: 'USD', value: '10.00' },
            paypal_fee: { currency_code: 'USD', value: '0.79' },
            net_amount: { currency_code: 'USD', value: '9.21' },
        },
    }] } }],
};
const c = parseCapture(ordenOk);
ok('la captura se lee', c.ok);
eq('el bruto', c.gross, 10);
eq('la comisión del procesador', c.processorFee, 0.79);
eq('y se declara MEDIDA', c.basis, 'medida');
eq('la referencia es el id de la CAPTURA', paypalRef(c.captureId), 'CAP123');
eq('se guarda quién pagó', c.payer.name, 'Ana Díaz');

// ⚠️ SI LA COMISIÓN VIENE EN OTRA MONEDA NO SE RESTA. Restar una moneda de otra
// es exactamente el defecto que costó la v4.845 con Stripe.
const otraMoneda = JSON.parse(JSON.stringify(ordenOk));
otraMoneda.purchase_units[0].payments.captures[0].seller_receivable_breakdown.paypal_fee =
    { currency_code: 'EUR', value: '0.70' };
const c2 = parseCapture(otraMoneda);
eq('comisión en otra moneda: no se toma', c2.processorFee, null);
eq('y se declara estimada', c2.basis, 'estimada');

// `null` es «no se sabe», NO cero: un cero afirmaría que PayPal no cobró nada.
const sinComision = JSON.parse(JSON.stringify(ordenOk));
delete sinComision.purchase_units[0].payments.captures[0].seller_receivable_breakdown;
eq('sin desglose, la comisión es null y no cero', parseCapture(sinComision).processorFee, null);

eq('una respuesta sin captura se rechaza', parseCapture({}).reason, 'sin_captura');

// ── 4. Cuándo puede retirar el club ─────────────────────────────────
section('4. PayPal no tiene tránsito del proveedor');

// El dinero está en el saldo al capturar: sólo corre el margen operativo de la
// plataforma, el MISMO que con Stripe. Dos aportes del mismo día no pueden
// tener reglas distintas según por dónde entraron.
const cuando = new Date('2026-08-17T12:00:00Z');
const disp = paypalAvailability(cuando, 6);
eq('disponible en el proveedor: al capturar', disp.availableOn.toISOString(), cuando.toISOString());
eq('y para el club, seis días después',
    disp.clubAvailableOn.toISOString(), new Date('2026-08-23T12:00:00Z').toISOString());

// ── 5. El enlace de aprobación ──────────────────────────────────────
section('5. Las dos formas del enlace');

eq('la nueva', approvalUrl({ links: [{ rel: 'payer-action', href: 'https://pp/x' }] }), 'https://pp/x');
eq('y la clásica', approvalUrl({ links: [{ rel: 'approve', href: 'https://pp/y' }] }), 'https://pp/y');
eq('sin enlace, null', approvalUrl({ links: [] }), null);

// ── 6. Sobre los archivos ───────────────────────────────────────────
section('6. Lo que no se ve mirando una pantalla');

const spec = read('server/lib/paypalSpec.js');
const ctrl = read('server/controllers/paypalController.js');
const svc = read('server/lib/paypalService.js');
const modal = read('src/components/DonationModal.tsx');

ok('el criterio es puro: no importa la base ni la red',
    !/from '\.\/(db|prisma)\.js'/.test(spec) && !/\bfetch\(/.test(spec));

// ⚠️ EL DINERO ENTRA A LA CUENTA DE LA PLATAFORMA. Es la decisión del cliente y
// lo que hace que la retención y la Bóveda sigan funcionando.
ok('el aporte se marca como recaudado por la plataforma',
    /isPlatformCollection: true/.test(ctrl));
ok('y NO se usa la cuenta de PayPal del club',
    !/PaymentProviderConfig|provider_clubId/.test(ctrl));

// Los resolutores se IMPORTAN. Copiarlos daría dos criterios de destino sobre
// el mismo aporte — el problema que `sendCampaign` arrastra en el CRM.
ok('campaña y bloque se importan, no se copian',
    /from '\.\/financialController\.js'/.test(ctrl)
    && !/FROM "ContributionCampaign"/.test(ctrl));

// La misma trazabilidad que Stripe.
for (const [q, re] of [
    ['crea el pago', /prisma\.payment\.create/],
    ['crea el aporte', /prisma\.donation\.create/],
    ['asienta en el libro', /postDonation\(/],
    ['manda la confirmación', /sendContributionNotifications\(/],
    ['cuenta la conversión', /donation_completed/],
]) ok(`la trazabilidad ${q}`, re.test(ctrl));

// La retención sale de la MISMA regla configurable. Un segundo porcentaje acá
// es cómo se llega a que dos vías retengan distinto por el mismo concepto.
ok('la retención usa `feeRules`, sin porcentaje escrito a mano',
    /platformFee\(/.test(ctrl) && !/0\.021|0\.05\b/.test(ctrl));

// Idempotencia: las DOS vías convergen y el índice único es la protección.
// Se cuentan las LLAMADAS, no la definición: la función se declara sin
// paréntesis pegado al nombre. Dos llamadas = las dos vías convergen.
ok('el webhook y el retorno convergen en el mismo registro',
    (ctrl.match(/await registrarAporte\(/g) || []).length === 2,
    String((ctrl.match(/await registrarAporte\(/g) || []).length));
ok('sandbox es el valor por DEFECTO', /'live' \? LIVE : SANDBOX/.test(svc));

// El botón no se pinta sin saber si se puede: uno que lleva a un error del
// proveedor es peor que ninguno (v4.650).
ok('el botón de PayPal sólo aparece si el servidor dijo que se puede',
    /paypal\?\.available && \(/.test(modal));
ok('el rótulo del otro botón dice con qué se paga',
    /Donar ahora con tarjeta de débito o crédito/.test(modal));
ok('y el de PayPal lo nombra', /Donar a través de PayPal/.test(modal));
// Con dos botones, un booleano no dice cuál está girando.
ok('el estado distingue QUÉ vía se está usando',
    /useState<Via \| null>/.test(modal) && /submitting === 'paypal'/.test(modal));

console.log(`\n${'─'.repeat(60)}`);
console.log(`${pass} pasaron, ${fail} fallaron`);
if (fail) process.exit(1);
console.log('PayPal cobra a la cuenta de la plataforma y no convierte nada.');
