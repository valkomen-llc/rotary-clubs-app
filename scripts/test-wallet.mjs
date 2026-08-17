#!/usr/bin/env node
// Pruebas del criterio de la Bóveda de Fondos — v4.841.
//
// SIN base, credenciales ni red. Prueban el CRITERIO —qué es una suma legal,
// cuánto vale un importe en la unidad mínima de su moneda, qué retiro se
// rechaza— separado de la orquestación, por el mismo motivo que `seoRules.js`
// vive aparte de `seoAudit.js`.
//
// El caso de referencia son los DOS movimientos reales del Distrito 4281 que
// destaparon el defecto: 8,91 USD y 47.498,84 COP. La prueba existe para que
// nunca vuelvan a dar 47.507,75.
//
//   npm run test:wallet

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
    linkDonationsToPayments, parsePayload, originOf, methodOf,
} from '../server/lib/paymentTrace.js';
import {
    ZERO_DECIMAL, stripeDecimals, CURRENCIES, currencyMeta, normalizeCurrency,
    toStripeAmount, fromStripeAmount, roundMoney, formatMoney,
    sumByCurrency, groupByCurrency, subtractByCurrency, currenciesOf, primaryCurrency,
} from '../server/lib/money.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

let passed = 0;
const failures = [];

const check = (name, fn) => {
    try {
        fn();
        passed++;
    } catch (e) {
        failures.push(`${name}\n    ${e.message}`);
    }
};

const eq = (actual, expected, msg) => {
    const a = JSON.stringify(actual);
    const b = JSON.stringify(expected);
    if (a !== b) throw new Error(`${msg || ''} esperado ${b}, obtenido ${a}`);
};

const ok = (cond, msg) => { if (!cond) throw new Error(msg || 'no se cumplió'); };

const readSrc = (rel) => readFileSync(join(root, rel), 'utf8');

/** El código sin comentarios: para poder afirmar que algo no se USA sin que un
 *  comentario que lo nombra haga fallar la prueba. Es la lección de v4.840. */
const stripComments = (src) => src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

// ─────────────────────────────────────────────────────────────────────
// 1. EL DEFECTO: dos monedas no se suman
// ─────────────────────────────────────────────────────────────────────

// Los dos movimientos reales del Distrito 4281, tal como los muestra la ficha.
const MOVIMIENTOS_4281 = [
    { ref: '3AFA4BF6', currency: 'USD', gross: 10.00, stripeFee: 0.59, platformFee: 0.50, net: 8.91 },
    { ref: 'F4AF7E06', currency: 'COP', gross: 50000.00, stripeFee: 1.16, platformFee: 2500.00, net: 47498.84 },
];

check('el caso reportado: 8,91 USD y 47.498,84 COP NO dan 47.507,75', () => {
    const totals = sumByCurrency(MOVIMIENTOS_4281, m => m.net, m => m.currency);
    eq(totals, { USD: 8.91, COP: 47499 });
    ok(!Object.values(totals).includes(47507.75),
        'apareció la suma ilegal — alguien volvió a cruzar las monedas');
});

check('cada moneda conserva su propio total', () => {
    const totals = sumByCurrency(MOVIMIENTOS_4281, m => m.gross, m => m.currency);
    eq(totals.USD, 10);
    eq(totals.COP, 50000);
    // «Aportes Recibidos 2 · $50.010,00» era esto mal hecho.
    ok(totals.USD + totals.COP === 50010, 'la mezcla da 50.010: por eso no se hace');
});

check('sumByCurrency nunca devuelve un escalar', () => {
    const totals = sumByCurrency(MOVIMIENTOS_4281, m => m.net, m => m.currency);
    ok(typeof totals === 'object' && totals !== null, 'debe ser un mapa por moneda');
    ok(!Array.isArray(totals), 'no es una lista');
});

check('una lista vacía da un mapa vacío, no cero', () => {
    eq(sumByCurrency([], m => m.net, m => m.currency), {});
});

check('una fila sin moneda cae en su propio grupo, no en la de al lado', () => {
    const rows = [
        { amount: 10, currency: 'USD' },
        { amount: 999, currency: null },
    ];
    const totals = sumByCurrency(rows, r => r.amount, r => r.currency);
    eq(totals.USD, 10, 'la fila sin moneda no puede engordar el dólar:');
    eq(totals[''], 999, 'y tampoco puede desaparecer:');
});

check('subtractByCurrency resta dentro de cada moneda', () => {
    const collected = { USD: 8.91, COP: 47498.84 };
    const requested = { COP: 40000 };
    eq(subtractByCurrency(collected, requested), { USD: 8.91, COP: 7499 });
});

check('un retiro en una moneda no toca el saldo de otra', () => {
    const out = subtractByCurrency({ USD: 10 }, { COP: 50000 });
    eq(out.USD, 10, 'el dólar no se ve afectado por un retiro en pesos:');
    eq(out.COP, -50000, 'y el peso queda en descubierto en SU moneda:');
});

// ─────────────────────────────────────────────────────────────────────
// 2. Unidad mínima — la otra mitad del mismo error
// ─────────────────────────────────────────────────────────────────────

check('COP se cobra en Stripe con dos decimales', () => {
    eq(toStripeAmount(50000, 'COP'), 5000000);
    eq(fromStripeAmount(5000000, 'COP'), 50000);
});

check('las monedas sin decimales van tal cual', () => {
    for (const code of ['JPY', 'KRW', 'CLP', 'VND']) {
        eq(toStripeAmount(5000, code), 5000, `${code}:`);
        eq(fromStripeAmount(5000, code), 5000, `${code} de vuelta:`);
    }
});

check('ida y vuelta a la unidad mínima no pierde el importe', () => {
    const casos = [
        [10, 'USD'], [8.91, 'USD'], [0.01, 'USD'],
        [50000, 'COP'], [47498.84, 'COP'],
        [5000, 'JPY'], [1, 'CLP'],
    ];
    for (const [amount, code] of casos) {
        eq(fromStripeAmount(toStripeAmount(amount, code), code), amount, `${amount} ${code}:`);
    }
});

check('fromStripeAmount es lo que le faltaba al webhook', () => {
    // `bt.fee / 100` sobre un cobro en yenes multiplicaba la comisión por cien.
    eq(fromStripeAmount(500, 'JPY'), 500, 'yen:');
    ok(fromStripeAmount(500, 'JPY') !== 500 / 100, 'dividir por 100 estaría mal');
    eq(fromStripeAmount(59, 'USD'), 0.59, 'dólar:');
});

check('las dos nociones de decimales son distintas y COP lo demuestra', () => {
    eq(stripeDecimals('COP'), 2, 'Stripe cobra COP con dos decimales:');
    eq(currencyMeta('COP').decimals, 0, 'y se escribe sin ninguno:');
    ok(!ZERO_DECIMAL.has('cop'), 'COP no está entre las de unidad mínima entera');
});

check('una moneda fuera del catálogo no se da por dos decimales', () => {
    // Antes `currencyMeta` devolvía 2 para todo lo desconocido, así que el yen
    // se escribía «JPY 1.250,00».
    eq(currencyMeta('JPY').decimals, 0);
    eq(currencyMeta('KRW').decimals, 0);
    eq(currencyMeta('GBP').decimals, 2);
});

check('el catálogo conserva las cinco monedas que ya tenía', () => {
    eq(CURRENCIES.map(c => c.code), ['USD', 'COP', 'EUR', 'MXN', 'BRL']);
});

// ─────────────────────────────────────────────────────────────────────
// 3. Redondeo y presentación
// ─────────────────────────────────────────────────────────────────────

check('el peso no arrastra céntimos', () => {
    eq(roundMoney(47498.84, 'COP'), 47499);
    eq(roundMoney(0.4, 'COP'), 0);
});

check('el dólar conserva sus dos decimales', () => {
    eq(roundMoney(8.914, 'USD'), 8.91);
    eq(roundMoney(8.916, 'USD'), 8.92);
});

check('el medio céntimo cae del lado del double, y eso es una LIMITACIÓN', () => {
    // 8.915 no existe en coma flotante: el double más cercano es
    // 8.9149999999999999023…, así que redondea a 8,91 y no a 8,92. No es un
    // error de `roundMoney` —redondea bien el número que de verdad tiene— y
    // no se puede arreglar redondeando distinto: hay que dejar de usar
    // `Float` para el dinero, que es lo que hace la Fase 1 con los enteros en
    // unidad mínima. Queda escrito acá para que no se «corrija» en falso.
    ok(8.915 * 100 < 891.5, 'el double de 8.915 es menor de lo que aparenta');
    eq(roundMoney(8.915, 'USD'), 8.91);
});

check('el redondeo va al final de la suma, no en cada fila', () => {
    // Tres importes que por separado redondean a 0,33 y suman 1,00.
    const rows = [{ a: 1 / 3 }, { a: 1 / 3 }, { a: 1 / 3 }].map(r => ({ ...r, c: 'USD' }));
    eq(sumByCurrency(rows, r => r.a, r => r.c), { USD: 1 });
});

check('formatMoney lleva el código de la moneda', () => {
    ok(formatMoney(50000, 'COP').includes('COP'), 'debe decir COP');
    ok(formatMoney(8.91, 'USD').includes('USD'), 'debe decir USD');
});

check('normalizeCurrency da la forma canónica', () => {
    eq(normalizeCurrency(' cop '), 'COP');
    eq(normalizeCurrency(null), '');
    eq(normalizeCurrency('usd'), 'USD');
});

// ─────────────────────────────────────────────────────────────────────
// 4. Orden y moneda principal
// ─────────────────────────────────────────────────────────────────────

check('la moneda del sitio va primero', () => {
    eq(currenciesOf({ USD: 8.91, COP: 47499 }, 'COP'), ['COP', 'USD']);
    eq(currenciesOf({ USD: 8.91, COP: 47499 }, 'USD'), ['USD', 'COP']);
});

check('sin preferencia manda el importe', () => {
    eq(currenciesOf({ USD: 8.91, COP: 47499 }, ''), ['COP', 'USD']);
});

check('el orden es estable a igual importe', () => {
    eq(currenciesOf({ EUR: 100, USD: 100 }, ''), ['EUR', 'USD']);
});

check('la moneda principal prefiere la del sitio si tiene saldo', () => {
    eq(primaryCurrency({ USD: 8.91, COP: 47499 }, 'COP'), 'COP');
    eq(primaryCurrency({ USD: 8.91, COP: 47499 }, 'USD'), 'USD');
});

check('con la moneda del sitio en cero, manda la que tenga algo', () => {
    // Mostrar «0» teniendo dinero en otra moneda es el otro extremo del error.
    eq(primaryCurrency({ USD: 8.91, COP: 0 }, 'COP'), 'USD');
});

check('sin nada, la principal es la del sitio', () => {
    eq(primaryCurrency({}, 'COP'), 'COP');
});

check('groupByCurrency conserva las filas', () => {
    const g = groupByCurrency(MOVIMIENTOS_4281, m => m.currency);
    eq(g.USD.length, 1);
    eq(g.COP.length, 1);
    eq(g.USD[0].ref, '3AFA4BF6');
});

// ─────────────────────────────────────────────────────────────────────
// 5. El retiro — la guardia que estaba muerta
// ─────────────────────────────────────────────────────────────────────

/** La decisión del retiro, con la misma forma que la de `requestPayout`. */
const juzgarRetiro = ({ amount, currency, balances }) => {
    const code = normalizeCurrency(currency);
    if (!code) return 'sin_moneda';
    if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) return 'monto_invalido';
    if (!(code in balances.collected)) return 'moneda_sin_aportes';
    if (roundMoney(Number(amount), code) !== Number(amount)) return 'decimales_invalidos';
    if (Number(amount) > (balances.available[code] || 0)) return 'saldo_insuficiente';
    return 'ok';
};

const SALDOS = {
    collected: { USD: 8.91, COP: 47499 },
    available: { USD: 8.91, COP: 0 },
};

check('un retiro por encima del saldo se RECHAZA', () => {
    // Ésta es la prueba que habría atrapado el control muerto: hasta v4.840
    // `amount > undefined` era `false` y dejaba pasar cualquier importe.
    eq(juzgarRetiro({ amount: 1000, currency: 'USD', balances: SALDOS }), 'saldo_insuficiente');
});

check('un retiro sin saldo en esa moneda se rechaza', () => {
    eq(juzgarRetiro({ amount: 1, currency: 'COP', balances: SALDOS }), 'saldo_insuficiente');
});

check('no se puede retirar en una moneda que el club nunca recibió', () => {
    eq(juzgarRetiro({ amount: 1, currency: 'EUR', balances: SALDOS }), 'moneda_sin_aportes');
});

check('la moneda es obligatoria y no tiene valor por omisión', () => {
    eq(juzgarRetiro({ amount: 1, currency: '', balances: SALDOS }), 'sin_moneda');
    eq(juzgarRetiro({ amount: 1, currency: null, balances: SALDOS }), 'sin_moneda');
});

check('el peso no admite decimales en un retiro', () => {
    const conSaldo = { collected: { COP: 50000 }, available: { COP: 50000 } };
    eq(juzgarRetiro({ amount: 100.5, currency: 'COP', balances: conSaldo }), 'decimales_invalidos');
    eq(juzgarRetiro({ amount: 100, currency: 'COP', balances: conSaldo }), 'ok');
});

check('un retiro dentro del saldo pasa', () => {
    eq(juzgarRetiro({ amount: 8.91, currency: 'USD', balances: SALDOS }), 'ok');
    eq(juzgarRetiro({ amount: 5, currency: 'USD', balances: SALDOS }), 'ok');
});

check('un monto no numérico se rechaza en vez de colarse', () => {
    for (const malo of [undefined, null, NaN, 'mucho', 0, -5]) {
        const veredicto = juzgarRetiro({ amount: malo, currency: 'USD', balances: SALDOS });
        ok(veredicto !== 'ok', `${String(malo)} no puede pasar, dio "${veredicto}"`);
    }
});

// ─────────────────────────────────────────────────────────────────────
// 5b. La traza: atar cada aporte con su movimiento (v4.844)
// ─────────────────────────────────────────────────────────────────────

const pago = (id, amount, currency, createdAt, payload) => ({
    id, amount, currency, createdAt,
    rawPayload: payload === undefined ? null : JSON.stringify(payload),
});
const aporte = (id, amount, currency, date, donorEmail) => ({ id, amount, currency, date, donorEmail });

check('el vínculo exacto manda sobre la heurística', () => {
    const aportes = [aporte('d1', 50000, 'COP', '2026-08-16T14:00:00Z')];
    const pagos = [
        pago('p-cerca', 50000, 'COP', '2026-08-16T14:00:01Z', {}),
        pago('p-exacto', 50000, 'COP', '2026-08-16T14:00:30Z', { donationId: 'd1' }),
    ];
    const { links } = linkDonationsToPayments(aportes, pagos);
    eq(links.get('d1').payment.id, 'p-exacto', 'debe ganar el que declara el vínculo:');
    eq(links.get('d1').match, 'exact');
});

check('sin vínculo se empareja por club, moneda, importe y momento', () => {
    const aportes = [aporte('d1', 47498.84, 'COP', '2026-08-16T14:00:00Z')];
    const pagos = [pago('p1', 47498.84, 'COP', '2026-08-16T14:00:20Z', {})];
    const { links } = linkDonationsToPayments(aportes, pagos);
    eq(links.get('d1').payment.id, 'p1');
    eq(links.get('d1').match, 'heuristic', 'y se DECLARA que fue deducido:');
});

check('un pago de OTRA moneda no se empareja', () => {
    const aportes = [aporte('d1', 10, 'USD', '2026-08-16T14:00:00Z')];
    const pagos = [pago('p1', 10, 'COP', '2026-08-16T14:00:05Z', {})];
    const { links, orphans } = linkDonationsToPayments(aportes, pagos);
    ok(!links.has('d1'), 'no puede casar 10 USD con 10 COP');
    eq(orphans.length, 1);
});

check('un pago lejano en el tiempo tampoco', () => {
    const aportes = [aporte('d1', 100, 'USD', '2026-08-16T14:00:00Z')];
    const pagos = [pago('p1', 100, 'USD', '2026-08-16T15:00:00Z', {})];
    const { links } = linkDonationsToPayments(aportes, pagos);
    ok(!links.has('d1'), 'una hora de diferencia no es el mismo hecho');
});

check('UN pago no puede quedarse con DOS aportes', () => {
    // Es lo que mostraría el mismo dinero dos veces en la ficha.
    const aportes = [
        aporte('d1', 100, 'USD', '2026-08-16T14:00:00Z'),
        aporte('d2', 100, 'USD', '2026-08-16T14:00:10Z'),
    ];
    const pagos = [pago('p1', 100, 'USD', '2026-08-16T14:00:02Z', {})];
    const { links } = linkDonationsToPayments(aportes, pagos);
    const usados = [...links.values()].map(v => v.payment.id);
    eq(usados.length, 1, 'sólo un aporte puede quedarse con el pago:');
    eq(links.get('d1')?.payment.id, 'p1', 'y es el más cercano en el tiempo:');
});

check('el correo desempata entre dos pagos igual de válidos', () => {
    const aportes = [aporte('d1', 100, 'USD', '2026-08-16T14:00:00Z', 'ana@ejemplo.org')];
    const pagos = [
        pago('p-otro', 100, 'USD', '2026-08-16T14:00:01Z', { customerDetails: { email: 'juan@ejemplo.org' } }),
        pago('p-ana', 100, 'USD', '2026-08-16T14:00:20Z', { customerDetails: { email: 'ana@ejemplo.org' } }),
    ];
    const { links } = linkDonationsToPayments(aportes, pagos);
    eq(links.get('d1').payment.id, 'p-ana', 'aunque esté más lejos en el tiempo:');
});

check('un pago sin aporte NO desaparece', () => {
    // Una compra de la tienda o una membresía es dinero del club y tiene que
    // verse en alguna parte, aunque no haya nacido de una donación.
    const pagos = [pago('p-tienda', 25, 'USD', '2026-08-16T14:00:00Z', {})];
    const { orphans } = linkDonationsToPayments([], pagos);
    eq(orphans.length, 1);
    eq(orphans[0].id, 'p-tienda');
});

check('un rawPayload ilegible no rompe nada', () => {
    const pagos = [{ id: 'p1', amount: 10, currency: 'USD', createdAt: '2026-08-16T14:00:00Z', rawPayload: '{roto' }];
    const { links } = linkDonationsToPayments([aporte('d1', 10, 'USD', '2026-08-16T14:00:01Z')], pagos);
    eq(links.get('d1').match, 'heuristic', 'se cae a la heurística en vez de lanzar:');
    eq(parsePayload('{roto'), {});
    eq(parsePayload(null), {});
});

check('el origen va de lo más específico a lo más general', () => {
    eq(originOf({ projectTitle: 'Agua Limpia', campaignName: 'X' }).kind, 'proyecto');
    eq(originOf({ campaignName: 'Terremoto', campaignId: 'c1' }).label, 'Terremoto');
    eq(originOf({ purpose: 'Emergencia Terremoto Colombia 2026', campaignId: 'c1' }).kind, 'campana');
    eq(originOf({ purpose: 'End Polio Now' }).kind, 'destino');
    eq(originOf({}), null, 'sin dato no se inventa un origen:');
});

check('el método de pago se escribe como en el recibo', () => {
    eq(methodOf({ card: { brand: 'visa', last4: '3778', wallet: 'apple_pay' } }).label, 'Visa ···3778 Apple Pay');
    eq(methodOf({ card: { brand: 'mastercard', last4: '4242' } }).label, 'Mastercard ···4242');
    eq(methodOf({}, 'card').label, 'card', 'sin detalle se usa el tipo que haya:');
    eq(methodOf({}, null), null);
});

// ─────────────────────────────────────────────────────────────────────
// 6. Sobre los archivos — lo que no se ve mirando la pantalla
// ─────────────────────────────────────────────────────────────────────

check('payoutController ya no suma sin GROUP BY', () => {
    const src = stripComments(readSrc('server/controllers/payoutController.js'));
    ok(!/SUM\("netAmount"\)/.test(src),
        'volvió el SUM("netAmount") sin agrupar por moneda');
    ok(!/currency:\s*'USD'/.test(src),
        'volvió el literal currency: \'USD\' — la moneda se resuelve, no se afirma');
});

check('la barra superior del panel tampoco suma monedas', () => {
    // `/admin/stats` es OTRO endpoint que el de la Bóveda y seguía mezclando
    // hasta v4.842: de ahí salían los «$50,010» y «$47,507.75» de la barra.
    const src = stripComments(readSrc('server/routes/admin.js'));
    for (const tabla of ['"Payment"', '"PayoutRequest"', '"Donation"']) {
        const consulta = src.split('\n').find(l => l.includes('SUM(') && l.includes(tabla));
        ok(consulta, `no se encontró la consulta de ${tabla}`);
        ok(/GROUP BY currency/.test(consulta),
            `la suma de ${tabla} volvió a hacerse sin GROUP BY currency`);
    }
});

check('la moneda del sitio se resuelve en UN solo sitio', () => {
    const lib = readSrc('server/lib/clubCurrency.js');
    ok(/club_currency/.test(lib), 'clubCurrency.js debe leer el ajuste del sitio');
    for (const archivo of [
        'server/controllers/payoutController.js',
        'server/controllers/financialController.js',
        'server/routes/admin.js',
    ]) {
        const src = stripComments(readSrc(archivo));
        ok(/from '\.\.\/lib\/clubCurrency\.js'/.test(src),
            `${archivo} no importa clubCurrency.js`);
        ok(!/SELECT value FROM "Setting" WHERE key = \$1 AND "clubId" = \$2 LIMIT 1'?,\s*\['club_currency'/.test(src),
            `${archivo} volvió a tener su propia copia de la moneda del sitio`);
    }
});

check('financialController ya no rotula la wallet como USD', () => {
    const src = stripComments(readSrc('server/controllers/financialController.js'));
    ok(!/currency:\s*'USD',\s*\n\s*buckets/.test(src),
        'la respuesta de /financial/wallet volvió a declararse USD a secas');
});

check('el retiro ya no se valida contra un res falso', () => {
    const src = stripComments(readSrc('server/controllers/payoutController.js'));
    ok(!/json:\s*\(data\)\s*=>\s*data/.test(src),
        'volvió el objeto `res` falso: getClubBalance no devuelve nada y la guardia muere');
    ok(/computeBalances/.test(src), 'requestPayout debe usar computeBalances');
});

check('las rutas del dinero piden administrador del sitio', () => {
    const payouts = stripComments(readSrc('server/routes/payouts.js'));
    for (const ruta of ['/balance', '/request', '/history']) {
        const linea = payouts.split('\n').find(l => l.includes(`'${ruta}'`));
        ok(linea && linea.includes('requireSiteAdmin'), `${ruta} sin requireSiteAdmin`);
    }
    const financial = stripComments(readSrc('server/routes/financial.js'));
    for (const ruta of ['/wallet', '/wallet/sync-stripe', '/donations']) {
        const linea = financial.split('\n').find(l => l.includes(`'${ruta}'`));
        ok(linea && linea.includes('requireSiteAdmin'), `${ruta} sin requireSiteAdmin`);
    }
});

check('el índice único está declarado en los DOS sitios', () => {
    const schema = readSrc('server/prisma/schema.prisma');
    ok(/@@unique\(\[provider, providerRef\]\)/.test(schema),
        'falta en schema.prisma: db:push borraría el índice creado en runtime');
    const ensure = readSrc('server/lib/ensureWalletSchema.js');
    ok(/Payment_provider_providerRef_key/.test(ensure),
        'falta en el ensure, o cambió de nombre y ya no coincide con el de Prisma');
});

check('el webhook atrapa el choque del índice único', () => {
    const src = stripComments(readSrc('server/controllers/paymentController.js'));
    ok(/P2002/.test(src),
        'la idempotencia volvió a depender sólo de la lectura previa');
});

check('la pantalla no vuelve a imprimir todo en formato de dólar', () => {
    const src = stripComments(readSrc('src/pages/admin/WalletManagement.tsx'));
    ok(!/const fmtUSD/.test(src), 'volvió fmtUSD');
    ok(!/toLocaleString\('en-US'/.test(src),
        'volvió el formato anglosajón fijo: los pesos salen como $50,000.00');
    ok(/formatMoney/.test(src), 'debe usar el formateador del sitio');
});

check('la pantalla no escribe el 5% a mano', () => {
    const src = stripComments(readSrc('src/pages/admin/WalletManagement.tsx'));
    ok(!/Club Platform \(5%\)/.test(src),
        'volvió el rótulo con el porcentaje escrito a mano');
    // El porcentaje se CALCULA sobre el propio movimiento. No se busca un
    // identificador —la función que lo hacía cambió de nombre y de sitio en
    // v4.844— sino la operación: la comisión dividida por el bruto.
    ok(/applicationFee\s*\/\s*[\w.]*[gG]rossAmount/.test(src),
        'el porcentaje volvió a escribirse a mano en vez de salir del movimiento');
});

check('el rótulo de la comisión es el que fijó el cliente', () => {
    // REGLA EXPRESA (v4.842). El equipo pidió este texto dos veces, la segunda
    // con la objeción técnica ya planteada: el cobro es la comisión de la
    // plataforma por recaudar y se aplica también sobre aportes en dólares,
    // donde no hay traslado interbancario ninguno. Decidieron con ese
    // argumento delante, así que el rótulo es suyo. Esta prueba existe para
    // que no vuelva atrás por criterio propio de quien toque el archivo
    // después — que es exactamente el riesgo, porque el código de al lado
    // explica por qué el nombre no describe el cobro.
    const src = readSrc('src/pages/admin/WalletManagement.tsx');
    ok(/Tarifa de procesamiento de traslado desde interbancos/.test(src),
        'se revirtió el rótulo que fijó el cliente');
    ok(!/Comisión de la plataforma \(5%\)/.test(src),
        'volvió el rótulo anterior con el porcentaje escrito a mano');
});

check('el catálogo de monedas vive en UN solo sitio', () => {
    const spec = readSrc('server/lib/eventRegistrationSpec.js');
    ok(/from '\.\/money\.js'/.test(spec),
        'eventRegistrationSpec debe leer el catálogo de money.js, no tener el suyo');
    ok(!/^export const ZERO_DECIMAL = new Set/m.test(spec),
        'volvió una segunda copia del catálogo: se separan en silencio');
});

check('money.js es puro — no importa nada', () => {
    const src = readSrc('server/lib/money.js');
    ok(!/^import /m.test(src),
        'money.js importó algo: deja de poder probarse sin base ni red');
});

check('el estado de un retiro sale de un catálogo cerrado', () => {
    const src = stripComments(readSrc('server/controllers/payoutController.js'));
    ok(/PAYOUT_STATUSES/.test(src),
        'volvió a escribirse en la columna el estado que llegue en el cuerpo');
});

// ─────────────────────────────────────────────────────────────────────

console.log('');
if (failures.length) {
    console.log(`\x1b[31m✗ ${failures.length} fallo(s), ${passed} bien\x1b[0m\n`);
    failures.forEach(f => console.log(`  \x1b[31m✗\x1b[0m ${f}\n`));
    process.exit(1);
}
console.log(`\x1b[32m✓ ${passed} comprobaciones — la Bóveda no mezcla monedas\x1b[0m\n`);
