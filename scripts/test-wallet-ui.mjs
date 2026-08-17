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

const DONACIONES = {
    donations: [
        { id: 'don-cop-0001', amount: 50000, currency: 'COP', donorName: 'Ana Restrepo', donorEmail: 'ana@ejemplo.org', isAnonymous: false, message: null, date: '2026-08-16T14:00:00.000Z', status: 'success' },
        { id: 'don-usd-0002', amount: 10, currency: 'USD', donorName: 'John Miller', donorEmail: 'john@ejemplo.org', isAnonymous: false, message: null, date: '2026-08-16T15:00:00.000Z', status: 'success' },
    ],
    byCurrency: [
        { currency: 'COP', decimals: 0, totalAmount: 50000, totalCount: 1 },
        { currency: 'USD', decimals: 2, totalAmount: 10, totalCount: 1 },
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
    external: ['jspdf', 'xlsx'], jsx: 'automatic', logLevel: 'silent',
});

const SYSTEM_CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch(existsSync(SYSTEM_CHROME) ? { executablePath: SYSTEM_CHROME } : {});
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });

const errores = [];
page.on('pageerror', e => errores.push(e.message));

// El comodín va PRIMERO: Playwright resuelve la última ruta registrada antes
// que las anteriores.
await page.route('**/api/**', r => r.fulfill({ json: {} }));
await page.route('**/api/clubs/**', r => r.fulfill({ json: { id: 'club-4281', name: 'Distrito 4281', settings: [] } }));
await page.route('**/api/payouts/balance*', r => r.fulfill({ json: BALANCE }));
await page.route('**/api/payouts/history*', r => r.fulfill({ json: RETIROS }));
await page.route('**/api/financial/donations*', r => r.fulfill({ json: DONACIONES }));
await page.route('**/api/financial/wallet*', r => r.fulfill({ json: WALLET }));

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
check('NO se pinta a la vez el movimiento en pesos', !/47\.499/.test(t),
    'aparecieron las dos monedas apiladas — es el defecto reportado');

// La suma ilegal de v4.840 no puede reaparecer por ninguna vía.
check('no aparece por ningún lado la suma de las dos monedas', !/47[.,]507/.test(t));

const selector = page.getByRole('tab', { name: /COP/ });
check('hay selector de moneda', await selector.count() > 0);

console.log('\n▸ Cambiar de moneda cambia TODO el contexto');
await selector.first().click();
await page.waitForTimeout(400);
t = await texto();
check('ahora se ve el movimiento en pesos', /47\.499/.test(t));

// La comprobación se acota al PANEL, no a la página entera: el selector
// muestra a propósito el saldo de cada moneda —es lo que permite decidir a
// cuál cambiarse, como en la pantalla de cuentas de un banco—, así que
// «US$ 8,91» sigue estando arriba con toda razón. Lo que no puede repetirse
// es el CONTENIDO, que es lo que hacía la página interminable.
const panel = () => page.locator('[role="tabpanel"]').innerText();
const enPanel = await panel();
check('el panel muestra el movimiento en pesos', /47\.499/.test(enPanel));
check('y NO el de dólares', !/US\$/.test(enPanel),
    'quedaron las dos monedas apiladas en el panel: es el defecto reportado');

// ── Las pestañas ─────────────────────────────────────────────────────
console.log('\n▸ Las pestañas separan el contenido');

check('hay pestaña de Movimientos', await page.getByRole('tab', { name: /Movimientos/ }).count() > 0);
check('hay pestaña de Aportes', await page.getByRole('tab', { name: /Aportes/ }).count() > 0);
check('hay pestaña de Retiros', await page.getByRole('tab', { name: /Retiros/ }).count() > 0);

// Con todo apilado, el formulario de retiro estaría visible desde el principio.
check('el formulario de retiro NO está a la vista en Movimientos',
    await page.locator('#payout-amount').count() === 0,
    'el contenido sigue apilado en vez de repartido en pestañas');

await page.getByRole('tab', { name: /Aportes/ }).click();
await page.waitForTimeout(300);
t = await texto();
check('Aportes muestra el donante en pesos', /Ana Restrepo/.test(t));
check('y NO el donante en dólares', !/John Miller/.test(t),
    'la lista de aportes no está acotada a la moneda activa');

await page.getByRole('tab', { name: /Retiros/ }).click();
await page.waitForTimeout(300);
t = await texto();
check('Retiros muestra el formulario', await page.locator('#payout-amount').count() === 1);
check('el formulario dice en qué moneda se retira', /\(COP\)/.test(t));
check('el historial muestra el retiro en pesos', /20\.000/.test(t));

// El selector de moneda DENTRO del formulario se retiró en v4.842: dos
// controles para la misma decisión se contradicen en cuanto alguien cambia uno.
check('el formulario NO tiene su propio selector de moneda',
    await page.locator('#payout-currency').count() === 0);

// ── El rótulo que fijó el cliente ────────────────────────────────────
console.log('\n▸ El desglose de un movimiento');

await page.getByRole('tab', { name: /Movimientos/ }).click();
await page.waitForTimeout(300);
await page.locator('#root button:has-text("En tránsito")').first().click();
await page.waitForTimeout(300);
t = await texto();
check('el desglose se abre', /Monto pagado por el donante/.test(t));
check('el rótulo es el que fijó el cliente', /Tarifa de procesamiento de traslado desde interbancos/.test(t), t.slice(0, 400));
check('el porcentaje sale del propio movimiento', /\(5%\)/.test(t));
check('el neto se escribe en pesos, sin céntimos', /47\.499/.test(t) && !/47\.498,84/.test(t));

await browser.close();

console.log('');
if (fail) {
    console.log(`\x1b[31m✗ ${fail} fallo(s), ${pass} bien\x1b[0m\n`);
    process.exit(1);
}
console.log(`\x1b[32m✓ ${pass} comprobaciones — una moneda a la vez, en pestañas\x1b[0m\n`);
