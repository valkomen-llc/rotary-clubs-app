#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// La Bóveda de un sitio SIN APORTES.  npm run test:wallet:empty
// v4.852.0
//
// REGRESIÓN DEL FALLO REPORTADO EN `/admin/boveda` DEL ADMINISTRADOR CENTRAL.
//
// Cuando el sitio no tiene ningún aporte, `/financial/wallet` responde
// `wallets: []` con `buckets: {}` y `summary: {}`. `{}` es TRUTHY, así que el
// respaldo del cliente armaba una entrada con `buckets: {}` y al pintar las
// cubetas reventaba con «Cannot read properties of undefined (reading
// 'count')». El error subía al límite de error, que desmonta TODO el subárbol
// — por eso la pantalla salía sin barra lateral.
//
// ⚠️ NO era un fallo del administrador central: le pasaba a CUALQUIER sitio sin
// aportes, incluido un club recién creado. El central lo veía siempre porque
// consulta sin `clubId` y ahí nunca hay pagos.
//
// `test:wallet:ui` no lo veía porque monta la pantalla CON dinero. Al probar
// una pantalla, probarla también VACÍA.
//
// Pide `playwright` y `esbuild` y se salta solo si faltan.
// ════════════════════════════════════════════════════════════════════
let chromium, build;
try {
    ({ chromium } = await import('playwright'));
    ({ build } = await import('esbuild'));
} catch {
    console.log('\n⊘ test:wallet:empty — falta playwright o esbuild, se salta.\n');
    process.exit(0);
}

import { existsSync, readFileSync, readdirSync } from 'node:fs';

const entry = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import WalletManagement from './src/pages/admin/WalletManagement';
import { AuthProvider } from './src/hooks/useAuth';
import { ClubProvider } from './src/contexts/ClubContext';
import { LanguageProvider } from './src/contexts/LanguageContext';
import ChunkErrorBoundary from './src/components/ChunkErrorBoundary';
window.go = () => createRoot(document.getElementById('root')).render(
    React.createElement(MemoryRouter, null,
        React.createElement(AuthProvider, null,
            React.createElement(ClubProvider, null,
                React.createElement(LanguageProvider, null,
                    React.createElement(ChunkErrorBoundary, null,
                        React.createElement(WalletManagement)))))));
`;

const bundle = await build({
    stdin: { contents: entry, resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, write: false, format: 'iife', platform: 'browser',
    define: {
        'import.meta.env.VITE_API_URL': '"/api"',
        'process.env.NODE_ENV': '"production"',
        __APP_VERSION__: '"0.0.0-diag"',
    },
    jsx: 'automatic', logLevel: 'silent',
});

const SYSTEM_CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch(existsSync(SYSTEM_CHROME) ? { executablePath: SYSTEM_CHROME } : {});
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });

const errores = [];
page.on('pageerror', e => errores.push(`PAGEERROR: ${e.message}`));
page.on('console', m => { if (m.type() === 'error') errores.push(`CONSOLE: ${m.text().slice(0, 400)}`); });

// EL PUNTO DEL DIAGNÓSTICO: el administrador central NO tiene sitio activo.
// `/clubs/by-domain` sobre app.clubplatform.org no devuelve ningún club.
await page.route('**/api/**', r => r.fulfill({ json: {} }));
await page.route('**/api/clubs/by-domain*', r => r.fulfill({ json: { id: 'origen', name: 'Origen', settings: [] } }));

// LA RESPUESTA REAL de un sitio SIN aportes. Es lo que devuelve el servidor
// hoy cuando no hay ningún `Payment`: listas vacías y objetos vacíos.
await page.route('**/api/payouts/balance*', r => r.fulfill({ json: {
    byCurrency: [], unreconciled: [], currency: 'USD',
    availableBalance: 0, totalCollected: 0, totalRequested: 0,
} }));
await page.route('**/api/payouts/history*', r => r.fulfill({ json: [] }));
await page.route('**/api/financial/donations*', r => r.fulfill({ json: {
    donations: [], orphanMovements: [], byCurrency: [], destinos: [],
    periodo: { id: 'todo', label: 'Todo el histórico', desde: null, hasta: null, destino: 'todos', excluidos: 0,
        totales: { bruto: {}, procesador: {}, plataforma: {}, neto: {}, aportes: 0, sinMovimiento: 0 } },
    totalAmount: 0, totalCount: 0, currency: 'USD',
} }));
await page.route('**/api/financial/wallet*', r => r.fulfill({ json: {
    wallets: [], currencies: [], currency: 'USD',
    buckets: {},   // ← objeto VACÍO
    summary: {},   // ← vacío pero TRUTHY
    platformHoldingDays: 6,
} }));
await page.route('http://localhost/', r => r.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><body><div id="root"></div></body>',
}));
await page.goto('http://localhost/');
await page.evaluate(() => {
    localStorage.setItem('rotary_token', 't-diag');
    // El OPERADOR de la plataforma: rol administrator y SIN clubId.
    localStorage.setItem('rotary_user', JSON.stringify({ id: 'u1', role: 'administrator' }));
});
try {
    const css = readdirSync('dist/assets').filter(f => f.startsWith('index-') && f.endsWith('.css'));
    if (css[0]) await page.addStyleTag({ content: readFileSync(`dist/assets/${css[0]}`, 'utf8') });
} catch { /* sin dist */ }

await page.addScriptTag({ content: bundle.outputFiles[0].text });
await page.evaluate(() => window.go());
await page.waitForTimeout(2500);

const texto = await page.locator('#root').innerText().catch(() => '(vacío)');
await browser.close();

let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
    if (cond) { pass++; console.log(`  OK    ${name}`); }
    else { fail++; console.log(`  FALLA ${name}${extra ? ` — ${extra}` : ''}`); }
};

console.log('\n▸ Un sitio sin aportes NO tumba la Bóveda');

// El síntoma exacto que se reportó, con captura: la pantalla entera sustituida
// por el límite de error, sin barra lateral.
check('no aparece el límite de error',
    !/Esta pantalla no se pudo mostrar/.test(texto), texto.slice(0, 200));
check('la barra lateral sigue ahí — el límite desmonta TODO el subárbol',
    /Bóveda de Fondos|GENERAL/.test(texto), texto.slice(0, 200));

// La causa concreta. Si vuelve, vuelve con este mensaje.
const elFallo = errores.find(e => /reading 'count'/.test(e));
check('no revienta leyendo las cubetas vacías', !elFallo, elFallo || '');
check('sin ningún error de render',
    !errores.some(e => /TypeError|PAGEERROR/.test(e)),
    errores.filter(e => /TypeError|PAGEERROR/.test(e)).join(' | '));

// Y lo que SÍ tiene que verse: la Bóveda, vacía y explicada.
check('se pinta la Bóveda', /BÓVEDA DE FONDOS/i.test(texto), texto.slice(0, 300));

console.log('');
if (fail) {
    console.log(`\x1b[31m✗ ${fail} fallo(s), ${pass} bien\x1b[0m\n`);
    process.exit(1);
}
console.log(`\x1b[32m✓ ${pass} comprobaciones — la Bóveda vacía se pinta en vez de reventar\x1b[0m\n`);
