#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// LAS TASAS DE CAMBIO Y EL COBRO POR PAYPAL.  npm run test:fx
// v4.870.0
//
// SIN BASE, SIN CREDENCIALES Y SIN RED.
//
// Lo que protege sobre todo: que NO SE INVENTE una tasa, que la conversión se
// pueda DECIR antes de cobrar, y que los dos espejos den lo mismo — si difieren,
// la pantalla promete una cifra y el cobro sale por otra.
// ════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import {
    FX_RATES_KEY, STALE_DAYS, MOTIVOS_FX,
    pairKey, rateFor, rateAgeDays, convertAmount, validateRates, parseRates,
} from '../server/lib/fxRates.js';
import { resolvePaypalCharge, paypalCurrencyOk } from '../server/lib/paypalSpec.js';

let pass = 0, fail = 0;
const ok = (n, c, d = '') => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${d ? ` — ${d}` : ''}`); } };
const eq = (n, a, b) => ok(n, JSON.stringify(a) === JSON.stringify(b), `esperaba ${JSON.stringify(b)}, dio ${JSON.stringify(a)}`);
const section = (t) => console.log(`\n${t}`);

// La tasa REAL del caso reportado, no una inventada para que la prueba pase.
const TRM = { COP_USD: { perUnit: 4032, source: 'TRM del Banco de la República', updatedAt: '2026-08-18T00:00:00.000Z' } };
const HOY = new Date('2026-08-18T15:00:00.000Z');

// ── 1. No se inventa una tasa ────────────────────────────────────────
section('1. Sin tasa configurada no se convierte');

eq('un par sin tasa devuelve el motivo',
    convertAmount(100000, 'COP', 'EUR', TRM, HOY).reason, 'sin_tasa');
eq('sin ninguna tasa tampoco', convertAmount(100000, 'COP', 'USD', {}, HOY).reason, 'sin_tasa');
ok('y NO devuelve un importe', convertAmount(100000, 'COP', 'USD', {}, HOY).amount === undefined);

// ⚠️ Una tasa cero o negativa no se interpreta: se descarta. Adivinar acá es
// cobrarle a alguien lo que no era.
eq('una tasa en cero se descarta',
    convertAmount(100000, 'COP', 'USD', { COP_USD: { perUnit: 0 } }, HOY).reason, 'sin_tasa');
eq('una negativa también',
    convertAmount(100000, 'COP', 'USD', { COP_USD: { perUnit: -4032 } }, HOY).reason, 'sin_tasa');
eq('y un texto', convertAmount(100000, 'COP', 'USD', { COP_USD: { perUnit: 'cuatro mil' } }, HOY).reason, 'sin_tasa');

// ── 2. El caso reportado, con sus números ────────────────────────────
section('2. $ 100.000 COP por PayPal');

const c = convertAmount(100000, 'COP', 'USD', TRM, HOY);
ok('se convierte', c.ok === true);
eq('a US$ 24,80', c.amount, 24.8);
eq('y guarda el importe original', c.originalAmount, 100000);
eq('con su moneda', c.originalCurrency, 'COP');
eq('y la tasa con la que se hizo', c.perUnit, 4032);
eq('y su fuente', c.rateSource, 'TRM del Banco de la República');
ok('LOS TRES DATOS viajan juntos',
    c.originalAmount !== undefined && c.amount !== undefined && c.perUnit !== undefined,
    'sin los tres, «¿por qué este aporte entró en dólares?» no se puede contestar');

// El redondeo es al de la moneda que SE COBRA, no a la de origen.
eq('US$ se redondea a dos decimales', convertAmount(50000, 'COP', 'USD', TRM, HOY).amount, 12.4);
// Y al revés, el peso no lleva centavos.
eq('el peso se redondea sin centavos',
    convertAmount(10, 'USD', 'COP', { USD_COP: { perUnit: 1 / 4032 } }, HOY).amount, 40320);

// ⚠️ Un importe que se redondea a cero NO es un cobro: es una tasa mal escrita,
// y la pasarela lo rechazaría con un mensaje que no explica nada.
eq('un importe que queda en cero se rechaza con su motivo',
    convertAmount(1, 'COP', 'USD', { COP_USD: { perUnit: 100000000 } }, HOY).reason, 'importe_cero');

// ── 3. La misma moneda no se convierte ───────────────────────────────
section('3. Sin conversión cuando no hace falta');

const igual = convertAmount(10, 'USD', 'USD', {}, HOY);
ok('la misma moneda pasa sin tasa', igual.ok === true);
eq('y no se declara convertida', igual.converted, false);
eq('con el mismo importe', igual.amount, 10);

// ── 4. El plan de cobro de PayPal ────────────────────────────────────
section('4. resolvePaypalCharge: un solo punto de decisión');

// Sin `PAYPAL_CURRENCY` se cobra lo que venga: es el comportamiento anterior.
const cualquiera = resolvePaypalCharge({ amount: 100000, currency: 'COP', settlement: '', rates: {} });
ok('sin moneda configurada se cobra tal cual', cualquiera.ok && cualquiera.converted === false);
eq('en la moneda del aporte', cualquiera.currency, 'COP');

// El caso reportado.
const plan = resolvePaypalCharge({ amount: 100000, currency: 'COP', settlement: 'USD', rates: TRM, ahora: HOY });
ok('con tasa, un aporte en pesos SÍ se puede cobrar', plan.ok === true,
    'era el defecto: el botón no aparecía nunca en un sitio colombiano');
eq('convertido', plan.converted, true);
eq('a US$ 24,80', plan.amount, 24.8);
eq('y el original se conserva', plan.originalAmount, 100000);

// Sin tasa, se vuelve al comportamiento de siempre: no se ofrece.
const sinTasa = resolvePaypalCharge({ amount: 100000, currency: 'COP', settlement: 'USD', rates: {} });
ok('sin tasa NO se ofrece', sinTasa.ok === false);
eq('y dice por qué', sinTasa.reason, 'sin_tasa');
ok('el motivo está redactado', typeof MOTIVOS_FX.sin_tasa === 'string' && MOTIVOS_FX.sin_tasa.length > 10);

// ⚠️ SIN IMPORTE: al abrir el modal todavía no se eligió nada y hace falta
// saber igual si el botón se puede pintar.
const previo = resolvePaypalCharge({ currency: 'COP', settlement: 'USD', rates: TRM });
ok('sin importe se contesta igual', previo.ok === true);
eq('y viaja la tasa para poder decirlo', previo.perUnit, 4032);
eq('sin inventar un importe', previo.amount, null);
ok('sin importe y sin tasa, no se ofrece',
    resolvePaypalCharge({ currency: 'COP', settlement: 'USD', rates: {} }).ok === false);

// La moneda que se ofrece y la que se cobra son DOS campos distintos.
ok('el plan distingue las dos monedas',
    plan.originalCurrency === 'COP' && plan.currency === 'USD',
    'con un solo campo no se podría decir «pagás 100.000 y te cobran 24,80»');

// `paypalCurrencyOk` sigue siendo el criterio base y no cambió de forma.
eq('paypalCurrencyOk sigue diciendo que difieren',
    paypalCurrencyOk('COP', 'USD').reason, 'moneda_distinta');

// ── 5. Lo que el operador escribe ────────────────────────────────────
section('5. El operador escribe, el CÓDIGO decide');

const v = validateRates({ COP_USD: { perUnit: 4032, source: 'TRM' } }, HOY);
eq('una tasa válida se acepta', v.errors.length, 0);
eq('y se guarda con su llave canónica', Object.keys(v.rates), ['COP_USD']);
ok('y se le sella la fecha', !!v.rates.COP_USD.updatedAt);

eq('un par mal escrito se rechaza', validateRates({ COPUSD: { perUnit: 4032 } }, HOY).errors.length, 1);
eq('la misma moneda dos veces se rechaza', validateRates({ USD_USD: { perUnit: 1 } }, HOY).errors.length, 1);
eq('una tasa no numérica se rechaza', validateRates({ COP_USD: { perUnit: 'x' } }, HOY).errors.length, 1);
eq('y NO se guarda nada de lo rechazado', Object.keys(validateRates({ COP_USD: { perUnit: 0 } }, HOY).rates).length, 0);

// La fuente no es obligatoria y se pide igual: dentro de seis meses «¿de dónde
// salió este 4.032?» no tiene dónde mirarse sin ella.
ok('sin fuente se AVISA, no se bloquea',
    validateRates({ COP_USD: { perUnit: 4032 } }, HOY).warnings.length === 1
    && validateRates({ COP_USD: { perUnit: 4032 } }, HOY).errors.length === 0);

// Una tasa vieja avisa pero SIGUE valiendo: dejar de cobrar por eso sería peor.
const vieja = validateRates({ COP_USD: { perUnit: 4032, source: 'TRM', updatedAt: '2026-01-01T00:00:00.000Z' } }, HOY);
ok('una tasa vieja avisa', vieja.warnings.some(w => /días/.test(w)));
ok('pero no es un error', vieja.errors.length === 0);
ok('y se guarda igual', !!vieja.rates.COP_USD);
eq('la edad se calcula en días', rateAgeDays('2026-08-08T00:00:00.000Z', HOY), 10);
eq('sin fecha, la edad es desconocida, no cero', rateAgeDays(null, HOY), null);

// ── 6. Leer lo guardado nunca lanza ──────────────────────────────────
section('6. Leer nunca lanza: esto corre en el camino del cobro');

eq('un JSON roto degrada a sin tasas', parseRates('{nope'), {});
eq('vacío también', parseRates(''), {});
eq('una tasa inválida guardada se ignora', parseRates('{"COP_USD":{"perUnit":-1}}'), {});
ok('y una válida se lee', parseRates(JSON.stringify(TRM)).COP_USD.perUnit === 4032);
eq('la llave de PlatformConfig no cambia', FX_RATES_KEY, 'fx_rates');
ok('el umbral de tasa vieja está declarado', Number.isFinite(STALE_DAYS) && STALE_DAYS > 0);
eq('pairKey normaliza', pairKey('cop', ' usd '), 'COP_USD');
ok('rateFor con la misma moneda da 1', rateFor({}, 'USD', 'USD').perUnit === 1);

// ── 7. Sobre los archivos ────────────────────────────────────────────
section('7. Lo que no se ve mirando una pantalla');

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const spec = read('server/lib/fxRates.js');
const ctrl = read('server/controllers/paypalController.js');
const modal = read('src/components/DonationModal.tsx');

ok('el criterio es puro', !/from '\.\/(db|prisma)\.js'/.test(spec) && !/\bfetch\(/.test(spec));

// ⚠️ EL MISMO CRITERIO EN LAS DOS PUNTAS. Con dos, el modal promete una cifra
// y el cobro sale por otra.
ok('disponibilidad y creación usan resolvePaypalCharge',
    (ctrl.match(/resolvePaypalCharge\(/g) || []).length >= 2);
ok('y ya no queda el camino que rechazaba sin mirar la tasa',
    !/paypalCurrencyOk\(/.test(ctrl));

// LA CONVERSIÓN SE DICE. Es lo que la hace legítima.
ok('el servidor manda la conversión al modal', /converted:\s*!!plan\.converted/.test(ctrl));
ok('y el modal la pinta antes del botón', /conversionPaypal/.test(modal));
ok('diciendo el importe que se va a cobrar', /se te cobrarán/i.test(modal));
ok('y la tasa con la que se calculó', /perUnit/.test(modal));

// Los TRES datos quedan guardados con el aporte.
ok('el aporte guarda el importe original y la tasa',
    /originalAmount/.test(ctrl) && /fxPerUnit/.test(ctrl) && /fxSource/.test(ctrl));

// ── 8. Paridad de los dos espejos ────────────────────────────────────
section('8. El navegador y el servidor dan lo MISMO');

let paridad = false;
try {
    const { build } = await import('esbuild');
    const r = await build({
        entryPoints: ['src/lib/fxRates.ts'], bundle: true, write: false,
        format: 'esm', platform: 'neutral', target: 'es2022', logLevel: 'silent',
    });
    const esp = await import(`data:text/javascript;base64,${Buffer.from(r.outputFiles[0].text).toString('base64')}`);
    paridad = true;

    // La matriz: si difieren, el modal enseña una cifra y el cobro usa otra.
    let iguales = true;
    const montos = [1, 20000, 50000, 100000, 200000, 12345, 7];
    const pares = [['COP', 'USD', 4032], ['COP', 'USD', 3900.5], ['USD', 'COP', 0.000248],
        ['EUR', 'USD', 0.92], ['USD', 'JPY', 0.0068], ['MXN', 'USD', 17.2]];
    for (const [from, to, perUnit] of pares) {
        for (const monto of montos) {
            const a = convertAmount(monto, from, to, { [`${from}_${to}`]: { perUnit } }, HOY);
            const b = esp.convertWithRate(monto, from, to, perUnit);
            const mismo = a.ok === b.ok && a.amount === b.amount && a.currency === b.currency;
            if (!mismo) {
                iguales = false;
                console.log(`    ✗ difiere ${monto} ${from}→${to} @${perUnit}: ${a.amount} vs ${b.amount}`);
            }
        }
    }
    ok('los dos espejos convierten igual', iguales);

    // Los decimales de PRESENTACIÓN, que son los que deciden el redondeo.
    ok('y redondean igual por moneda',
        esp.roundMoney(24.804, 'USD') === 24.8 && esp.roundMoney(40320.6, 'COP') === 40321);
    ok('el espejo también rechaza una tasa inválida',
        esp.convertWithRate(100, 'COP', 'USD', 0).ok === false);
    ok('y un importe que queda en cero',
        esp.convertWithRate(1, 'COP', 'USD', 1e8).reason === 'importe_cero');
} catch (e) {
    if (!paridad) console.log(`  (paridad no comprobada: ${e?.message})`);
}

console.log(`\n${'─'.repeat(60)}`);
console.log(`${pass} pasaron, ${fail} fallaron`);
if (!paridad) console.log('  (el bloque de paridad no corrió: instalá esbuild con `npm i --no-save esbuild`)');
if (fail) process.exit(1);
console.log('No se inventa una tasa, y la que hay se dice antes de cobrar.');
