#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// La BÓVEDA CENTRAL en un navegador.  npm run test:wallet:central:ui
// v4.853.0
//
// Comprueba lo que una prueba de criterio no puede ver: que el OPERADOR de la
// plataforma vea la vista consolidada —y no la Bóveda del sitio «Origen», que
// es lo que vería si el modo se decidiera por «hay club activo»—, que el
// consolidado no mezcle monedas, y que pulsar un sitio baje a su Bóveda local.
//
// Pide `playwright` y `esbuild` y se salta solo si faltan.
// ════════════════════════════════════════════════════════════════════
let chromium, build;
try {
    ({ chromium } = await import('playwright'));
    ({ build } = await import('esbuild'));
} catch {
    console.log('\n⊘ test:wallet:central:ui — falta playwright o esbuild, se salta.\n');
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
    buckets: {}, summary: {}, platformHoldingDays: 6,
} }));

// Dos sitios, uno con dos monedas. Es el caso que el rediseño tiene que
// resolver sin mezclar nada.
await page.route('**/api/payouts/admin/overview*', r => r.fulfill({ json: {
    generadoEn: '2026-08-17T16:00:00.000Z',
    total: {
        COP: { currency: 'COP', aportes: 5, bruto: 370000, procesador: 20254, plataforma: 18500,
               neto: 330746, enTransito: 42746, disponibleProximamente: 0, retirado: 120000,
               disponible: 210746, sitios: 2 },
        USD: { currency: 'USD', aportes: 1, bruto: 10, procesador: 0.59, plataforma: 0.5,
               neto: 8.91, enTransito: 8.91, disponibleProximamente: 0, retirado: 0,
               disponible: 8.91, sitios: 1 },
    },
    takeRate: { COP: 5, USD: 5 },
    ticketPromedio: { COP: 74000, USD: 10 },
    sitios: [
        { clubId: 'c-4281', clubName: 'Distrito 4281', clubType: 'district', district: '4281', aportes: 3,
          monedas: [
            { currency: 'COP', aportes: 2, bruto: 70000, procesador: 5754, plataforma: 3500, neto: 60746, enTransito: 42746, disponible: 40746, retirado: 20000 },
            { currency: 'USD', aportes: 1, bruto: 10, procesador: 0.59, plataforma: 0.5, neto: 8.91, enTransito: 8.91, disponible: 8.91, retirado: 0 },
          ] },
        { clubId: 'c-feria', clubName: 'Feria de Proyectos', clubType: 'fair', district: '4271, 4281', aportes: 3,
          monedas: [
            { currency: 'COP', aportes: 3, bruto: 300000, procesador: 14500, plataforma: 15000, neto: 270000, enTransito: 0, disponible: 170000, retirado: 100000 },
          ] },
    ],
    sitiosConMovimiento: 2, sitiosTotales: 7,
    sinConciliar: [{ clubId: 'c-otro', currency: 'EUR', amount: 500 }],
    fuente: 'payments',
} }));
// v4.854 — Las reglas de comisión, dentro de la central. `guardado` recoge lo
// que la pantalla manda de verdad: que un ajuste llegue a la petición es
// justamente lo que el typecheck no ve (la lección de `conQr` y `profileId`).
const guardado = [];
await page.route('**/api/payouts/admin/fee-rules*', async r => {
    if (r.request().method() === 'PUT') {
        guardado.push(JSON.parse(r.request().postData() || '{}'));
        return r.fulfill({ json: { rules: {}, warnings: [], aviso: 'La tarifa nueva rige de ahora en adelante.' } });
    }
    return r.fulfill({ json: {
        rules: {
            platform: { percent: 0.05, fixed: 0, byCurrency: {}, bySite: {} },
            processor: { percent: 0.029, fixed: 0.30, byCurrency: {} },
        },
        porDefecto: {},
        resuelto: {
            COP: {
                plataforma: { percent: 0.05, fixed: 0, texto: '5 %', source: { percent: 'general', fixed: 'general' } },
                procesador: { percent: 0.029, fixed: 0.30, texto: '2.9 % + 0 COP', source: { percent: 'general', fixed: 'general' } },
            },
            USD: {
                plataforma: { percent: 0.05, fixed: 0, texto: '5 %', source: { percent: 'general', fixed: 'general' } },
                procesador: { percent: 0.029, fixed: 0.30, texto: '2.9 % + 0.30 USD', source: { percent: 'general', fixed: 'general' } },
            },
        },
        warnings: ['El componente fijo del procesador (0.3) es el de dólares y se aplica a TODAS las monedas.'],
    } });
});
await page.route('http://localhost/', r => r.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><body><div id="root"></div></body>',
}));
await page.goto('http://localhost/');
await page.evaluate(() => {
    localStorage.setItem('rotary_token', 't-diag');
    // El OPERADOR de la plataforma. Ojo: `by-domain` le devuelve el sitio
    // «Origen», así que SÍ tiene club activo — el modo se decide por ROL, y
    // esta prueba es la que lo comprueba.
    localStorage.setItem('rotary_user', JSON.stringify({ id: 'u1', role: 'administrator', clubId: 'origen' }));
});
try {
    const css = readdirSync('dist/assets').filter(f => f.startsWith('index-') && f.endsWith('.css'));
    if (css[0]) await page.addStyleTag({ content: readFileSync(`dist/assets/${css[0]}`, 'utf8') });
} catch { /* sin dist */ }

await page.addScriptTag({ content: bundle.outputFiles[0].text });
await page.evaluate(() => window.go());
await page.waitForTimeout(2500);

const texto = await page.locator('#root').innerText().catch(() => '(vacío)');

// ── El panel de comisiones ──────────────────────────────────────────
// Nace PLEGADO y su cabecera tiene que resumir la tarifa: una configuración
// que hay que abrir para saber qué dice no se mira nunca.
const resumenPlegado = await page.locator('text=Reglas de comisión').first()
    .locator('xpath=ancestor::button[1]').innerText().catch(() => '');
const camposPlegado = await page.locator('input[type="number"]').count();

await page.locator('text=Reglas de comisión').first().click().catch(() => {});
await page.waitForTimeout(500);
const abierto = await page.locator('#root').innerText().catch(() => '');
const camposAbierto = await page.locator('input[type="number"]').count();

// Se escribe una tarifa nueva y se guarda: lo que importa es lo que SALE.
const pct = page.locator('input[type="number"]').first();
await pct.fill('3').catch(() => {});
await page.locator('text=Guardar la tarifa').first().click().catch(() => {});
await page.waitForTimeout(600);
const trasGuardar = await page.locator('#root').innerText().catch(() => '');

await browser.close();

let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
    if (cond) { pass++; console.log(`  OK    ${name}`); }
    else { fail++; console.log(`  FALLA ${name}${extra ? ` — ${extra}` : ''}`); }
};

console.log('\n▸ El operador ve la Bóveda CENTRAL');

// ⚠️ La comprobación que importa: `by-domain` le devuelve el sitio «Origen», así
// que el operador SÍ tiene club activo. Si el modo se decidiera por «hay club»,
// estaría viendo la Bóveda de Origen creyendo ver la plataforma entera.
check('ve la vista consolidada, no la de un sitio',
    /Todos los sitios/.test(texto), texto.slice(0, 300));
check('y NO el saldo de un solo sitio',
    !/Disponible para Retiro/.test(texto), texto.slice(0, 400));

console.log('\n▸ Consolidar no es mezclar');

check('hay una tarjeta por MONEDA', /COP/.test(texto) && /USD/.test(texto));
check('los pesos van por su lado', /370\.000/.test(texto), texto.slice(0, 900));
check('y los dólares por el suyo', /8,91|10,00/.test(texto), texto.slice(0, 900));
// El error que este módulo entero existe para no cometer, multiplicado por la
// cantidad de sitios: 370.000 + 10 no puede aparecer en ninguna parte.
check('no aparece ninguna suma entre monedas', !/370\.010/.test(texto), texto.slice(0, 900));

check('se ven las DOS retenciones por separado',
    /Tarifa de procesamiento/.test(texto) && /Retención de la plataforma/.test(texto));
check('y el take rate', /Take rate/.test(texto));

console.log('\n▸ Cada sitio conserva lo suyo');

check('se listan los dos sitios',
    /Distrito 4281/.test(texto) && /Feria de Proyectos/.test(texto), texto.slice(0, 1200));
check('el sitio con dos monedas las muestra dentro',
    (texto.match(/COP/g) || []).length >= 2);
check('se dice cuántos sitios quedaron fuera del filtro',
    /2 de 7/.test(texto), texto.slice(0, 1500));
// Un retiro en una moneda sin aportes no se resta contra otra: se REPORTA.
check('el retiro sin conciliar se avisa',
    /sin aportes/.test(texto), texto.slice(0, 1600));

console.log('\n▸ Las reglas de comisión');

check('el panel nace PLEGADO', camposPlegado === 0, `había ${camposPlegado} casillas`);
// Plegado tiene que decir la tarifa: si no, hay que abrirlo para saber si el
// 5 % sigue siendo el 5 %.
check('y aun así dice la tarifa vigente',
    /5 %/.test(resumenPlegado), resumenPlegado.slice(0, 200));
// Plegar no puede ESCONDER un problema — la regla de v4.826.
check('un aviso se ve con el panel cerrado',
    /1 aviso/.test(resumenPlegado), resumenPlegado.slice(0, 200));

check('al abrirlo aparecen las casillas', camposAbierto >= 4, `había ${camposAbierto}`);
// ⚠️ La pregunta que se hace quien va a tocar una tarifa, contestada ANTES de
// que toque nada.
check('dice que no reescribe los cobros anteriores',
    /de ahora en adelante/.test(abierto), abierto.slice(0, 600));
check('avisa que el componente fijo es el de dólares',
    /TODAS las monedas|todas las monedas/.test(abierto));

// El ajuste tiene que LLEGAR a la petición: es lo que el typecheck no ve.
check('guardar manda lo que se escribió', guardado.length === 1, `hubo ${guardado.length} PUT`);
// ⚠️ Y en TANTO POR UNO. Se teclea «3» pensando en 3 %; mandar «3» al servidor
// sería retener el 300 %. La conversión la hace la pantalla y el servidor la
// rechazaría, pero eso sería un error donde debería haber un guardado.
check('el porcentaje viaja en tanto por uno, no en por ciento',
    guardado[0]?.rules?.platform?.percent === 0.03,
    JSON.stringify(guardado[0]?.rules?.platform));
check('y se confirma con el aviso de que no toca lo anterior',
    /de ahora en adelante/.test(trasGuardar), trasGuardar.slice(0, 400));

check('sin errores de render', !errores.some(e => /TypeError|PAGEERROR/.test(e)),
    errores.filter(e => /TypeError|PAGEERROR/.test(e)).join(' | '));

console.log('');
if (fail) {
    console.log(`\x1b[31m✗ ${fail} fallo(s), ${pass} bien\x1b[0m\n`);
    process.exit(1);
}
console.log(`\x1b[32m✓ ${pass} comprobaciones — la central consolida sin mezclar\x1b[0m\n`);
