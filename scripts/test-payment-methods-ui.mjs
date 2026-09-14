#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// EL MODAL DE APORTES, EN UN NAVEGADOR.  npm run test:payment-methods:ui
// v4.1057.0
//
// Monta el DonationModal REAL con el CSS compilado y la API interceptada, y
// recorre las CUATRO combinaciones de vías.
//
// ⚠️ POR QUÉ, teniendo las otras dos baterías: lo que se reportó se reportó
// MIRANDO LA PANTALLA —«Stripe desactivado y el botón sigue apareciendo»— y eso
// no se ve leyendo un archivo. Acá se cuenta lo que de verdad se pinta.
//
// Se salta solo si faltan `playwright`, `esbuild` o `dist/` — una dependencia
// de desarrollo ausente no puede romper un despliegue.
// ════════════════════════════════════════════════════════════════════
import { existsSync, readdirSync, readFileSync } from 'node:fs';

let pass = 0, fail = 0;
const ok = (n, c, d = '') => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n}${d ? ` — ${d}` : ''}`); } };

let chromium, esbuild;
try {
    ({ chromium } = await import('playwright'));
    esbuild = await import('esbuild');
} catch {
    console.log('· Se salta: faltan `playwright` o `esbuild` (npm i --no-save playwright esbuild).');
    process.exit(0);
}
if (!existsSync('dist/assets')) {
    console.log('· Se salta: no hay `dist/`. Corré `npx vite build` antes.');
    process.exit(0);
}
// ⚠️ CON EL CSS COMPILADO. Sin él todo se monta en `display:block` y las
// medidas no son las de la maquetación real (v4.851).
const cssFile = readdirSync('dist/assets').find(f => /^index-.*\.css$/.test(f));
const CSS = cssFile ? readFileSync(`dist/assets/${cssFile}`, 'utf8') : '';

const bundle = await esbuild.build({
    stdin: {
        contents: `
            import React from 'react';
            import { createRoot } from 'react-dom/client';
            import DonationModal from './src/components/DonationModal.tsx';
            // El modal usa useLang, que exige su proveedor: sin el React
            // aborta el árbol y no se pinta NADA — y una prueba que cuenta
            // botones ausentes pasaría por los motivos equivocados.
            import { LanguageProvider } from './src/contexts/LanguageContext.tsx';
            window.__montar = () => createRoot(document.getElementById('root')).render(
                React.createElement(LanguageProvider, null,
                React.createElement(DonationModal, {
                    open: true, onClose: () => {}, clubId: 'club-1',
                    clubName: 'Rotary Distrito 4281', currency: 'COP',
                    campaignId: 'camp-1', title: 'Aporte para la emergencia',
                })));
        `,
        resolveDir: '.', loader: 'tsx',
    },
    bundle: true, write: false, format: 'iife', jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env.VITE_API_URL': '"/api"' },
    // El contexto de idioma se usa dentro del modal; se deja el real.
});
const JS = bundle.outputFiles[0].text;

// El Chromium del entorno puede no ser el que este Playwright espera: se usa
// el que HAY. Sin binario, se salta — no se finge una comprobación visual.
const CANDIDATOS = [
    process.env.PLAYWRIGHT_CHROMIUM,
    '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    '/opt/pw-browsers/chromium/chrome-linux/chrome',
].filter(Boolean);
const exe = CANDIDATOS.find(p => existsSync(p));

let browser;
try {
    browser = await chromium.launch(exe ? { executablePath: exe } : {});
} catch (e) {
    console.log(`· Se salta: no hay un Chromium utilizable (${e.message.split('\n')[0]}).`);
    process.exit(0);
}

/** Monta el modal con las vías que diga el servidor y devuelve lo pintado. */
const pintar = async ({ card, paypal }) => {
    const page = await browser.newPage();
    page.on('pageerror', e => console.log('  [pageerror]', e.message.split('\n')[0]));
    page.on('console', m => { if (m.type() === 'error') console.log('  [console]', m.text().slice(0,160)); });
    // ⚠️ EL COMODÍN VA PRIMERO: Playwright resuelve la ÚLTIMA ruta registrada
    // antes que las anteriores, así que un '**/api/**' al final se come a las
    // específicas y todo responde '{}'. Costó una vuelta: las dos vías caían a
    // su respaldo y la prueba pasaba por los motivos equivocados.
    await page.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
    await page.route('**/api/financial/currency*', r => r.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({
            currency: 'COP', siteCurrency: 'COP', international: false,
            reason: 'disabled', card,
        }),
    }));
    await page.route('**/api/financial/paypal/available*', r => r.fulfill({
        status: 200, contentType: 'application/json', body: JSON.stringify(paypal),
    }));

    // ⚠️ ORIGEN REAL, SERVIDO POR LA PROPIA INTERCEPCIÓN: sobre `about:blank`
    // —lo que deja `setContent`— una dirección relativa no tiene base contra la
    // que resolverse, la petición a /api no sale y la prueba pasaría sin haber
    // ejercitado nada (v4.720). Se sirve el documento desde el mismo origen en
    // vez de levantar un servidor.
    await page.route('http://localhost/', r => r.fulfill({
        status: 200, contentType: 'text/html',
        body: `<!doctype html><html><head><style>${CSS}</style></head><body><div id="root"></div></body></html>`,
    }));
    await page.goto('http://localhost/');
    await page.addScriptTag({ content: JS });
    await page.evaluate(() => window.__montar());
    await page.waitForTimeout(400);

    const texto = await page.innerText('body');
    // ⚠️ SI EL MODAL NO SE MONTÓ, LAS AUSENCIAS SON FALSOS POSITIVOS. Pasó al
    // escribir esta prueba: faltaba `LanguageProvider`, no se pintaba nada y
    // «el botón de tarjeta NO se pinta» salía en verde. Se aborta en vez de
    // reportar una comprobación que no comprobó nada.
    if (!/Selecciona el monto|monto/i.test(texto)) {
        console.log(`  ✗ EL MODAL NO SE MONTÓ — todo lo que siga sería un falso positivo. body: ${JSON.stringify(texto.slice(0, 120))}`);
        process.exitCode = 1;
        await page.close();
        throw new Error('el modal no se montó');
    }
    if (process.env.DEBUG_UI) console.log('  [debug] body:', JSON.stringify(texto.slice(0, 200)));
    const botones = await page.$$eval('button', bs => bs.map(b => b.innerText.trim()));
    await page.close();
    return { texto, botones };
};

const tieneTarjeta = (b) => b.some(t => /tarjeta de d[ée]bito/i.test(t));
const tienePaypal = (b) => b.some(t => /PayPal/i.test(t));

console.log('\n1. El caso reportado: Stripe APAGADO, PayPal encendido');
let r = await pintar({ card: { available: false, reason: 'desactivado' }, paypal: { available: true } });
// ⚠️ ES EL DEFECTO EXACTO DEL REPORTE.
ok('el botón de tarjeta NO se pinta', !tieneTarjeta(r.botones),
    `botones: ${JSON.stringify(r.botones)}`);
ok('el de PayPal sí', tienePaypal(r.botones));
ok('y no queda nada que lo mencione', !/tarjeta de d[ée]bito/i.test(r.texto),
    'no se deshabilita ni se reserva espacio: no está');
ok('el pie nombra a PayPal, no a Stripe', /procesado por PayPal/.test(r.texto) && !/procesado por Stripe/.test(r.texto));

console.log('\n2. Al revés: Stripe encendido, PayPal apagado');
r = await pintar({ card: { available: true, reason: null }, paypal: { available: false } });
ok('vuelve el botón de tarjeta', tieneTarjeta(r.botones));
ok('y no está el de PayPal', !tienePaypal(r.botones));
ok('el pie nombra a Stripe', /procesado por Stripe/.test(r.texto));

console.log('\n3. Las dos encendidas');
r = await pintar({ card: { available: true, reason: null }, paypal: { available: true } });
ok('se pintan las dos', tieneTarjeta(r.botones) && tienePaypal(r.botones));
ok('y el pie las nombra a las dos', /Stripe o PayPal/.test(r.texto));

console.log('\n4. Ninguna: se dice, no se deja un hueco');
r = await pintar({ card: { available: false, reason: 'desactivado' }, paypal: { available: false } });
ok('no hay ningún botón de pago', !tieneTarjeta(r.botones) && !tienePaypal(r.botones));
ok('y se explica con esas palabras', /no hay métodos de pago disponibles/i.test(r.texto),
    'un hueco sin explicación es indistinguible de un modal roto');
ok('sin nombrar ningún procesador', !/Pago seguro procesado/.test(r.texto));

console.log('\n5. Sin respuesta del servidor: se ofrece, y decide el servidor');
// `card` ausente es «no se supo», no «apagada»: no poder aportar por un fallo
// de red transitorio sería peor, y el cobro está guardado en el servidor.
r = await pintar({ card: undefined, paypal: { available: false } });
ok('la tarjeta se ofrece ante la duda', tieneTarjeta(r.botones));

await browser.close();
console.log(`\n${'─'.repeat(60)}`);
console.log(`${pass} pasaron, ${fail} fallaron`);
if (fail) process.exit(1);
console.log('Lo que el panel apaga, la pantalla no lo pinta.');
