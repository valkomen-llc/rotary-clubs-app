#!/usr/bin/env node
/**
 * La Bóveda, EN UN NAVEGADOR — v4.842
 * ===================================
 *
 * Prueba de PANTALLA, no de criterio. Lo que puede fallar acá no es una
 * decisión —`test:wallet` ya cubre eso— sino lo que se DIBUJA: que a la vista
 * quede una sola moneda, que el selector cambie de contexto y que las
 * pestañas no dejen todo apilado. Desde el servidor eso no se ve, y es
 * exactamente lo que el cliente reportó: con las dos monedas una debajo de la
 * otra, la página no terminaba nunca.
 *
 * Misma lección que `test-ecosystem-ui.mjs` (v4.747) y el editor de la sede
 * (v4.717): se verificó cómo se veía y no cómo se usaba.
 *
 * Los datos son los DOS movimientos reales del Distrito 4281 —8,91 USD y
 * 47.498,84 COP—, para que la comprobación sea sobre el caso que se reportó.
 *
 * Pide `playwright` y `esbuild`, que se instalan aparte, y SE SALTA SOLO si no
 * están: un despliegue no debe caerse por una dependencia de desarrollo.
 *
 *   npm i --no-save playwright esbuild
 *   npm run test:wallet:ui
 */

let chromium, build;
try {
    ({ chromium } = await import('playwright'));
    ({ build } = await import('esbuild'));
} catch {
    console.log('\n⊘ test:wallet:ui — falta playwright o esbuild, se salta.\n');
    process.exit(0);
}

import { existsSync } from 'node:fs';

let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
    if (cond) { pass++; console.log(`  OK    ${name}`); }
    else { fail++; console.log(`  FALLA ${name}${extra ? ` — ${extra}` : ''}`); }
};

// ── Los datos: el caso reportado ─────────────────────────────────────

const BALANCE = {
    byCurrency: [
        { currency: 'COP', decimals: 0, availableBalance: 0, totalCollected: 47499, totalGross: 50000, totalRequested: 0 },
        { currency: 'USD', decimals: 2, availableBalance: 8.91, totalCollected: 8.91, totalGross: 10, totalRequested: 0 },
    ],
    unreconciled: [],
    currency: 'COP', availableBalance: 0, totalCollected: 47499, totalRequested: 0,
};

const vacio = () => ({ total: 0, count: 0, items: [] });
const mov = (id, currency, gross, net, fee) => ({
    id, providerRef: `pi_${id}`, amount: net, grossAmount: gross,
    stripeFee: gross - net - fee, netStripe: gross - (gross - net - fee),
    applicationFee: fee, fee: gross - net, currency, decimals: currency === 'COP' ? 0 : 2,
    status: 'succeeded', stripeStatus: 'pending',
    availableOn: '2026-08-18T00:00:00.000Z', clubAvailableOn: '2026-08-24T00:00:00.000Z',
    paymentMethod: 'card', stripeBalanceTxId: 'txn_x', createdAt: '2026-08-16T00:00:00.000Z',
});

const walletDe = (currency, item, resumen) => ({
    currency, decimals: currency === 'COP' ? 0 : 2,
    buckets: {
        processing: vacio(), in_transit: { total: item.amount, count: 1, items: [item] },
        available_soon: vacio(), available: vacio(), refunded: vacio(), failed: vacio(),
    },
    summary: {
        grossTotal: item.grossAmount, netTotal: item.amount, feesTotal: item.fee,
        inTransit: item.amount, availableSoon: 0, availableForWithdrawal: resumen.disponible,
        transferred: 0, requested: 0, refunded: 0,
    },
});

const COP_MOV = mov('cop-1', 'COP', 50000, 47499, 2500);
const USD_MOV = mov('usd-1', 'USD', 10, 8.91, 0.5);

const WALLET = {
    wallets: [walletDe('COP', COP_MOV, { disponible: 0 }), walletDe('USD', USD_MOV, { disponible: 8.91 })],
    currencies: ['COP', 'USD'],
    currency: 'COP',
    buckets: walletDe('COP', COP_MOV, { disponible: 0 }).buckets,
    summary: walletDe('COP', COP_MOV, { disponible: 0 }).summary,
    platformHoldingDays: 6,
};

const traza = (currency, gross, net, fee, origen, tarjeta) => ({
    id: `mov-${currency}`, providerRef: `pi_${currency}`, currency,
    decimals: currency === 'COP' ? 0 : 2,
    grossAmount: gross, stripeFee: gross - net - fee, applicationFee: fee, amount: net,
    status: 'succeeded', stripeStatus: 'pending', bucket: 'in_transit',
    availableOn: '2026-08-18T00:00:00.000Z', clubAvailableOn: '2026-08-24T00:00:00.000Z',
    createdAt: '2026-08-16T14:00:00.000Z', stripeBalanceTxId: 'txn_kmT70Ij4d2s0',
    origin: origen, method: tarjeta,
    receiptUrl: 'https://pay.stripe.com/receipts/ejemplo',
    receiptNumber: currency === 'COP' ? '1157-2878' : '1904-4540',
    // El caso real: sobre el cobro en pesos, Stripe cobró 1,16 USD.
    stripeFeeOriginal: currency === 'COP' ? { amount: 1.16, currency: 'USD' } : null,
    stripeFeeRate: currency === 'COP' ? 4100 : null,
    stripeFeeRateSource: currency === 'COP' ? 'Superintendencia Financiera de Colombia (datos.gov.co)' : null,
    stripeFeeRateDate: currency === 'COP' ? '2026-08-16' : null,
    stripeFeeRateOfficial: currency === 'COP',
    stripeFeeConverted: currency === 'COP',
});

const DONACIONES = {
    donations: [
        {
            id: 'don-cop-0001', amount: 50000, currency: 'COP',
            donorName: 'Rodrigo Diaz', donorEmail: 'jrdiazrojas@gmail.com',
            isAnonymous: false, message: 'Aporte cali San Fernando',
            date: '2026-08-16T14:31:00.000Z', status: 'success',
            movement: traza('COP', 50000, 42746, 2500,
                { kind: 'campana', label: 'Emergencia Terremoto Colombia 2026', id: 'c1' },
                { label: 'Mastercard ···3778', brand: 'mastercard', last4: '3778', wallet: '' }),
            movementMatch: 'exact',
        },
        {
            id: 'don-usd-0002', amount: 10, currency: 'USD',
            donorName: 'John Miller', donorEmail: 'john@ejemplo.org',
            isAnonymous: false, message: null,
            date: '2026-08-16T18:29:00.000Z', status: 'success',
            movement: traza('USD', 10, 8.91, 0.5,
                { kind: 'campana', label: 'Emergencia Terremoto Colombia 2026', id: 'c1' },
                { label: 'Visa ···4242 Apple Pay', brand: 'visa', last4: '4242', wallet: 'apple_pay' }),
            movementMatch: 'heuristic',
        },
    ],
    // Un cobro sin aportante: no puede desaparecer al unificar la lista.
    orphanMovements: [
        { ...traza('COP', 30000, 28400, 1500, { kind: 'destino', label: 'Tienda del club', id: 'b1' }, null), id: 'mov-tienda' },
    ],
    byCurrency: [
        { currency: 'COP', decimals: 0, totalAmount: 50000, totalCount: 1 },
        { currency: 'USD', decimals: 2, totalAmount: 10, totalCount: 1 },
    ],
    // v4.849 — El período resuelto y el catálogo de destinos los manda el
    // servidor; la pantalla no rehace la aritmética de fechas.
    periodo: {
        id: 'todo', label: 'Todo el histórico', desde: null, hasta: null,
        destino: 'todos', excluidos: 0,
        totales: {
            bruto: { COP: 50000, USD: 10 },
            procesador: { COP: 4754, USD: 0.59 },
            plataforma: { COP: 2500, USD: 0.5 },
            neto: { COP: 42746, USD: 8.91 },
            aportes: 2, sinMovimiento: 0,
        },
    },
    destinos: [
        { key: 'campana:c1', kind: 'campana', label: 'Emergencia Terremoto Colombia 2026', cuantos: 2, porMoneda: { COP: 50000, USD: 10 } },
        { key: 'proyecto:p1', kind: 'proyecto', label: 'Agua potable', cuantos: 1, porMoneda: { COP: 20000 } },
    ],
    totalAmount: 50000, totalCount: 2, currency: 'COP',
};

const RETIROS = [
    { id: 'pay-cop-1', amount: 20000, currency: 'COP', status: 'completed', bankDetails: '{"bankName":"Bancolombia","accountNumber":"1234567890","accountName":"Distrito"}', notes: '', createdAt: '2026-08-10T10:00:00.000Z' },
];

// ── Montaje ──────────────────────────────────────────────────────────

const entry = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import WalletManagement from './src/pages/admin/WalletManagement';
import { AuthProvider } from './src/hooks/useAuth';
import { ClubProvider } from './src/contexts/ClubContext';
import { LanguageProvider } from './src/contexts/LanguageContext';
window.go = () => createRoot(document.getElementById('root')).render(
    React.createElement(MemoryRouter, null,
        React.createElement(AuthProvider, null,
            React.createElement(ClubProvider, null,
                React.createElement(LanguageProvider, null,
                    React.createElement(WalletManagement))))));
`;

const bundle = await build({
    stdin: { contents: entry, resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, write: false, format: 'iife', platform: 'browser',
    define: {
        'import.meta.env.VITE_API_URL': '"/api"',
        'process.env.NODE_ENV': '"production"',
        __APP_VERSION__: '"0.0.0-test"',
    },
    // ⚠️ `jspdf` y `xlsx` NO van como externos, aunque pesen. En producción Vite
    // los empaqueta, y dejarlos fuera acá hacía imposible ejercitar la
    // exportación: el botón existía, se pulsaba, y la importación perezosa
    // moría con «Failed to resolve module specifier». Una prueba que no puede
    // fallar donde el código falla no prueba nada.
    jsx: 'automatic', logLevel: 'silent',
});

const SYSTEM_CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch(existsSync(SYSTEM_CHROME) ? { executablePath: SYSTEM_CHROME } : {});
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 }, acceptDownloads: true });

const errores = [];
page.on('pageerror', e => errores.push(e.message));
// Los fallos de exportación se atrapan y salen por consola: sin capturarlos,
// una descarga que no ocurre se ve como un tiempo agotado sin causa.
const consola = [];
page.on('console', m => { if (m.type() === 'error') consola.push(m.text()); });

// El comodín va PRIMERO: Playwright resuelve la última ruta registrada antes
// que las anteriores.
await page.route('**/api/**', r => r.fulfill({ json: {} }));
await page.route('**/api/clubs/**', r => r.fulfill({ json: { id: 'club-4281', name: 'Distrito 4281', settings: [] } }));
await page.route('**/api/payouts/balance*', r => r.fulfill({ json: BALANCE }));
await page.route('**/api/payouts/history*', r => r.fulfill({ json: RETIROS }));
// v4.849 — Se GUARDAN las URLs pedidas: es la única forma de comprobar que el
// filtro llega de verdad a la petición. Una dependencia que falta en un
// `useCallback` no la ve el typecheck — es la lección de `conQr` (v4.836) y
// `profileId` (v4.838): el código es válido y el ajuste no llega nunca.
const pedidas = [];
await page.route('**/api/financial/donations*', r => {
    pedidas.push(r.request().url());
    r.fulfill({ json: DONACIONES });
});
await page.route('**/api/financial/wallet*', r => r.fulfill({ json: WALLET }));

// La barra superior del panel. Consulta OTRO endpoint que el de la Bóveda y
// hasta v4.842 seguía sumando las monedas: de ahí salían los «$50,010» y
// «$47,507.75» que el cliente reportó.
await page.route('**/api/admin/stats*', r => r.fulfill({
    json: {
        users: 1, posts: 5, projects: 0, media: 0, publications: 0, knowledgeSources: 0,
        products: 0, documents: 0, leads: 0, activeClubs: 1,
        clubName: 'Distrito 4281', clubCity: '', clubCountry: 'Colombia', clubDomain: 'rotary4281.org',
        donationsByCurrency: [{ currency: 'COP', amount: 50000 }, { currency: 'USD', amount: 10 }],
        availableFundsByCurrency: [{ currency: 'COP', amount: 47499 }, { currency: 'USD', amount: 8.91 }],
        donations: 50000,
        availableFunds: 47499,
    },
}));

// Hace falta un ORIGEN real: sobre `about:blank` un fetch a `/api/…` no tiene
// base contra la que resolver y falla antes de salir, con lo cual la prueba
// pasaría sin haber ejercitado nada.
await page.route('http://localhost/', r => r.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><body><div id="root"></div></body>',
}));
await page.goto('http://localhost/');
await page.evaluate(() => {
    localStorage.setItem('rotary_token', 't-prueba');
    localStorage.setItem('rotary_user', JSON.stringify({ id: 'u1', role: 'club_admin', clubId: 'club-4281' }));
});
await page.addScriptTag({ content: bundle.outputFiles[0].text });
await page.evaluate(() => window.go());
await page.waitForTimeout(1500);

const texto = () => page.locator('#root').innerText();

console.log('\n▸ La pantalla monta');
const html = await page.locator('#root').innerHTML();
check('la Bóveda se pinta', html.length > 500, `${html.length} caracteres`);
check('sin errores al montar', errores.length === 0, errores.join(' | '));

// ── Una sola moneda a la vista ───────────────────────────────────────
console.log('\n▸ Una sola moneda a la vista');

let t = await texto();
check('arranca en la moneda con saldo disponible (USD)', /US\$\s*8,91/.test(t), t.slice(0, 200));
check('no aparece por ningún lado la suma de las dos monedas', !/47[.,]507/.test(t));

const selector = page.getByRole('tab', { name: /COP/ });
check('hay selector de moneda', await selector.count() > 0);

console.log('\n▸ Cambiar de moneda cambia TODO el contexto');
await selector.first().click();
await page.waitForTimeout(400);

// La comprobación se acota al PANEL, no a la página entera: el selector
// muestra a propósito el saldo de cada moneda —es lo que permite decidir a
// cuál cambiarse— así que «US$ 8,91» sigue estando arriba con toda razón.
const panel = () => page.locator('[role="tabpanel"]').innerText();
const enPanel = await panel();
check('el panel muestra el aporte en pesos', /Rodrigo Diaz/.test(enPanel));
check('y NO el de dólares', !/John Miller/.test(enPanel),
    'quedaron las dos monedas apiladas en el panel: es el defecto reportado');

// ── Las pestañas ─────────────────────────────────────────────────────
console.log('\n▸ Dos pestañas: la de Movimientos se retiró');

check('hay pestaña de Aportes', await page.getByRole('tab', { name: /Aportes/ }).count() > 0);
check('hay pestaña de Retiros', await page.getByRole('tab', { name: /Retiros/ }).count() > 0);
check('YA NO hay pestaña de Movimientos',
    await page.getByRole('tab', { name: /^Movimientos/ }).count() === 0,
    'la trazabilidad vive dentro de la caja del aportante, no en una pestaña aparte');
check('el formulario de retiro no está a la vista en Aportes',
    await page.locator('#payout-amount').count() === 0);

// ── La caja del aportante ────────────────────────────────────────────
console.log('\n▸ La traza vive dentro de la caja del aportante');

check('el origen se ve SIN desplegar', /Emergencia Terremoto Colombia 2026/.test(enPanel), enPanel.slice(0, 300));
check('el estado del dinero también', /En tránsito/i.test(enPanel));
check('el desglose está cerrado al principio', !/Monto pagado por el donante/.test(enPanel));

await page.locator('[role="tabpanel"] button:has-text("Rodrigo Diaz")').first().click();
await page.waitForTimeout(300);
const abierta = await panel();

check('al pulsar la caja se despliega el movimiento', /Monto pagado por el donante/.test(abierta));
check('el rótulo es el que fijó el cliente', /Tarifa de procesamiento de traslado desde interbancos/.test(abierta));
check('muestra el método de pago del recibo', /Mastercard ···3778/.test(abierta), abierta.slice(0, 600));
check('muestra el número de recibo de Stripe', /1157-2878/.test(abierta));
check('muestra la referencia de la transacción', /txn_kmT70Ij4d2s0/.test(abierta));
check('enlaza al recibo de Stripe',
    await page.locator('a[href="https://pay.stripe.com/receipts/ejemplo"]').count() > 0);
// El neto ya NO es 47.499: la comisión de Stripe vino en dólares (1,16 USD) y
// convertida son ~4.754 pesos, no 1,16. 50.000 − 4.754 − 2.500 ≈ 42.746.
check('el neto descuenta la comisión CONVERTIDA', /42\.746/.test(abierta),
    'el neto tiene que restar la comisión en pesos, no 1,16');
check('se muestra el importe original de la comisión',
    /USD\s*1,16/.test(abierta),
    'sin el original, una comisión convertida es un número que nadie puede explicar');
check('se muestra la TASA y su FUENTE',
    /4\.100/.test(abierta) && /Superintendencia Financiera/.test(abierta), abierta.slice(0, 700));
check('y la FECHA de la tasa', /2026-08-16/.test(abierta));
check('el neto se escribe en pesos, sin céntimos', !/42\.746,\d/.test(abierta));

// Un vínculo deducido no puede presentarse como un hecho.
check('NO se muestra el estado crudo de Stripe', !/Estado en Stripe/.test(abierta));
check('NO se muestra la etiqueta de emparejado', !/emparejado por coincidencia/i.test(abierta));
check('el CONCEPTO del aporte se ve al desplegar',
    /Emergencia Terremoto Colombia 2026/.test(abierta), abierta.slice(0, 400));

await page.getByRole('tab', { name: /USD/ }).click();
await page.waitForTimeout(400);
await page.locator('[role="tabpanel"] button:has-text("John Miller")').first().click();
await page.waitForTimeout(300);
const abiertaUsd = await panel();
check('la billetera se escribe como en el recibo', /Apple Pay/.test(abiertaUsd));
check('un cobro sin conversión no habla de tasas',
    !/convertidos a/.test(abiertaUsd), 'el aporte en dólares no pasó por ninguna conversión');

// ── Nada se pierde al unificar ───────────────────────────────────────
console.log('\n▸ Un cobro sin aportante no desaparece');

await page.getByRole('tab', { name: /COP/ }).click();
await page.waitForTimeout(400);
const conHuerfano = await panel();
check('el cobro sin aportante se muestra igual', /Tienda del club/.test(conHuerfano), conHuerfano.slice(0, 400));
check('y se dice que no tiene aportante asociado', /sin aportante asociado/i.test(conHuerfano));

// ── Retiros ──────────────────────────────────────────────────────────
console.log('\n▸ Retiros');

await page.getByRole('tab', { name: /Retiros/ }).click();
await page.waitForTimeout(300);
t = await texto();
check('Retiros muestra el formulario', await page.locator('#payout-amount').count() === 1);
check('el formulario dice en qué moneda se retira', /\(COP\)/.test(t));
check('el historial muestra el retiro en pesos', /20\.000/.test(t));
check('el formulario NO tiene su propio selector de moneda',
    await page.locator('#payout-currency').count() === 0);

// ── La barra superior del panel ──────────────────────────────────────
console.log('\n▸ La barra superior');

// Los dos indicadores de dinero viven en AdminLayout, que esta prueba monta
// junto con la Bóveda. Hasta v4.842 mostraban un solo número por indicador y
// era la suma de las dos monedas.
const barra = await page.getByRole('link', { name: 'Saldo actual del club' }).allInnerTexts();
const enBarra = barra.join(' | ');

check('hay UN solo indicador de dinero',
    barra.length === 1, `hay ${barra.length}: el de aportes brutos debía retirarse`);
check('muestra el saldo en las DOS monedas',
    /47\.499/.test(enBarra) && /8,91/.test(enBarra), enBarra);
check('NO muestra el bruto, que era el otro indicador',
    !/50\.000/.test(enBarra) && !/10,00/.test(enBarra), enBarra);
check('no aparece la suma de las dos monedas',
    !/50\.010/.test(enBarra) && !/47[.,]507,75/.test(enBarra),
    `la barra volvió a sumar monedas: ${enBarra}`);
// Con varias monedas se escribe el CÓDIGO: apilados a once píxeles, «$ 50.000»
// y «US$ 10,00» empiezan los dos por «$» y el primero se lee como dólares.
check('cada importe lleva su código de moneda',
    /COP/.test(enBarra) && /USD/.test(enBarra), enBarra);

// ── Los filtros del período (v4.849) ─────────────────────────────────
console.log('\n▸ Los filtros del período');

const saldoAntes = await texto();
check('el selector de período está en la pantalla',
    await page.getByLabel('Período').count() === 1);
check('y el de destino también, porque hay más de uno',
    await page.getByLabel('Destino del aporte').count() === 1);

// Sin filtro no hay aviso ni botón de limpiar: sería ruido.
check('sin filtro no se enseña el aviso del saldo',
    !/saldo disponible es el actual/i.test(saldoAntes));

const antes = pedidas.length;
await page.getByLabel('Período').selectOption('7d');
await page.waitForTimeout(600);

check('cambiar el período dispara una petición nueva', pedidas.length > antes,
    `se pidieron ${pedidas.length}, antes ${antes}`);
check('y el rango VIAJA en la petición',
    /[?&]rango=7d/.test(pedidas[pedidas.length - 1] || ''), pedidas[pedidas.length - 1]);

const conFiltro = await texto();
// ⚠️ LA COMPROBACIÓN QUE IMPORTA: el saldo NO se mueve al filtrar. Un saldo
// existe a una fecha, no dentro de un rango, y filtrarlo daría «US$ 0,00» a
// quien mira justo el número con el que decide si pide un retiro.
check('el SALDO no cambia al filtrar', /US\$\s*8,91/.test(conFiltro), conFiltro.slice(0, 300));
check('y se DICE por qué, o parecería que el filtro no funciona',
    /saldo disponible es el actual/i.test(conFiltro));
check('aparece el botón de limpiar', await page.getByRole('button', { name: 'Limpiar' }).count() === 1);

const antesDestino = pedidas.length;
await page.getByLabel('Destino del aporte').selectOption('campana:c1');
await page.waitForTimeout(600);
check('cambiar el destino también dispara una petición', pedidas.length > antesDestino);
check('y el destino viaja en la petición',
    /[?&]destino=campana%3Ac1/.test(pedidas[pedidas.length - 1] || ''), pedidas[pedidas.length - 1]);
check('el rango sigue viajando junto al destino',
    /[?&]rango=7d/.test(pedidas[pedidas.length - 1] || ''), pedidas[pedidas.length - 1]);

// El rango personalizado NO pide hasta tener sus dos fechas: con una sola, el
// servidor lo degrada a «todo» y el selector diría una cosa y la lista otra.
const antesCustom = pedidas.length;
await page.getByLabel('Período').selectOption('personalizado');
await page.waitForTimeout(400);
check('elegir «personalizado» todavía no pide nada', pedidas.length === antesCustom,
    `pidió ${pedidas.length - antesCustom} veces sin tener las dos fechas`);
await page.getByLabel('Desde').fill('2026-08-01');
await page.waitForTimeout(300);
check('con una sola fecha tampoco', pedidas.length === antesCustom);
await page.getByLabel('Hasta').fill('2026-08-17');
await page.waitForTimeout(600);
check('con las dos, sí', pedidas.length > antesCustom);
check('y las dos fechas viajan',
    /desde=2026-08-01/.test(pedidas[pedidas.length - 1] || '') && /hasta=2026-08-17/.test(pedidas[pedidas.length - 1] || ''),
    pedidas[pedidas.length - 1]);

// Limpiar devuelve todo a su sitio.
await page.getByRole('button', { name: 'Limpiar' }).click();
await page.waitForTimeout(600);
const limpio = await texto();
check('limpiar quita el aviso', !/saldo disponible es el actual/i.test(limpio));
check('y vuelve a «todo»',
    /[?&]rango=todo/.test(pedidas[pedidas.length - 1] || ''), pedidas[pedidas.length - 1]);

// El resumen del período: lo que el filtro SÍ mueve. Vive en la pestaña de
// aportes, y la sección de Retiros dejó abierta la otra.
await page.getByRole('tab', { name: /Aportes/ }).click();
await page.waitForTimeout(300);
const limpio2 = await texto();
check('se ve lo recibido en el período', /Recibido en el período/i.test(limpio2), limpio2.slice(0, 400));
check('con la tarifa que pidió el cliente, no otro nombre',
    /Tarifa de procesamiento/i.test(limpio2));
// ⚠️ Los IMPORTES, no sólo los rótulos. La primera versión leía el movimiento
// con los nombres de la COLUMNA de la base (`platformFee`, `netAmount`) en vez
// de los de `movementOf` (`applicationFee`, `amount`): no da error, da
// `undefined`, que suma cero — y el bloque mostraba «0» de retención y «0» de
// neto diciendo ser el del período. Comprobar el título no lo habría visto.
check('la retención de la plataforma NO sale en cero',
    /−\s*\$\s*2\.500/.test(limpio2), limpio2.slice(0, 900));
check('ni el neto del período',
    /42\.746/.test(limpio2), limpio2.slice(0, 900));
check('sin errores tras manejar los filtros', errores.length === 0, errores.join(' | '));

// ── Exportar (v4.850) ────────────────────────────────────────────────
console.log('\n▸ Exportar');

check('hay botón de Excel', await page.getByRole('button', { name: /Descargar Excel/ }).count() === 1);
check('de CSV', await page.getByRole('button', { name: /Descargar CSV/ }).count() === 1);
check('y de PDF', await page.getByRole('button', { name: /Descargar PDF/ }).count() === 1);
// Tres botones que sólo dijeran «Excel», «CSV» y «PDF» no distinguen de qué
// moneda es cada archivo, y en esta pantalla hay dos.
check('cada uno dice de qué moneda es',
    await page.getByRole('button', { name: /Descargar Excel de COP/ }).count() === 1);

// La prueba de que la exportación FUNCIONA es que el navegador descargue algo.
// Comprobar que el botón existe no dice nada sobre si `jspdf` y `xlsx` se
// cargan y componen: son importaciones perezosas que sólo se resuelven al
// pulsarlo.
const bajar = async (nombre) => {
    const espera = page.waitForEvent('download', { timeout: 20000 });
    await page.getByRole('button', { name: nombre }).click();
    return espera;
};

const csv = await bajar(/Descargar CSV de COP/);
check('el CSV se descarga', !!csv, 'no llegó el evento de descarga');
check('con el sitio, la moneda y la fecha en el nombre',
    /boveda-.*-cop-\d{4}-\d{2}-\d{2}\.csv/.test(csv.suggestedFilename()), csv.suggestedFilename());

const xlsx = await bajar(/Descargar Excel de COP/).catch(e => {
    console.log('    consola:', consola.slice(-3).join(' | '));
    throw e;
});
check('el Excel se descarga —`xlsx` carga y compone—',
    /\.xlsx$/.test(xlsx.suggestedFilename()), xlsx.suggestedFilename());

const pdf = await bajar(/Descargar PDF de COP/);
check('el PDF se descarga —`jspdf` carga y compone—',
    /\.pdf$/.test(pdf.suggestedFilename()), pdf.suggestedFilename());

check('exportar no dejó errores en la consola', errores.length === 0, errores.join(' | '));

await browser.close();

console.log('');
if (fail) {
    console.log(`\x1b[31m✗ ${fail} fallo(s), ${pass} bien\x1b[0m\n`);
    process.exit(1);
}
console.log(`\x1b[32m✓ ${pass} comprobaciones — una moneda a la vez, en pestañas\x1b[0m\n`);
