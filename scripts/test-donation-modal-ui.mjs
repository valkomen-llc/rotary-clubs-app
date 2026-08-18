#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// EL MODAL DE APORTES EN UN NAVEGADOR.  npm run test:donation:ui
// v4.872.0
//
// Lo que una prueba de criterio NO puede ver: que el formulario ENTRE en la
// pantalla con las DOS vías de pago a la vez. Se reportó con capturas —la cruz
// de cerrar y el pie recortados al aparecer el botón de PayPal— y no lo ve el
// typecheck: el código es válido y la maquetación es la que no cabe.
//
// ⚠️ MIDE CON EL CSS COMPILADO. Sin él la página se monta con `display: block`
// en todo y las medidas son de bloques, no de flex: la prueba pasaría por los
// motivos equivocados (la lección de v4.851). Si no hay `dist/`, se salta.
//
// Pide `playwright` y `esbuild` y se salta solo si faltan.
// ════════════════════════════════════════════════════════════════════
let chromium, build;
try {
    ({ chromium } = await import('playwright'));
    ({ build } = await import('esbuild'));
} catch {
    console.log('\n⊘ test:donation:ui — falta playwright o esbuild, se salta.\n');
    process.exit(0);
}

import { existsSync, readdirSync, readFileSync } from 'node:fs';

const cssDir = 'dist/assets';
const cssFile = existsSync(cssDir)
    ? readdirSync(cssDir).find(f => /^index-.*\.css$/.test(f))
    : null;
if (!cssFile) {
    console.log('\n⊘ test:donation:ui — no hay dist/ compilado, se salta. (`npm run build`)\n');
    process.exit(0);
}
const css = readFileSync(`${cssDir}/${cssFile}`, 'utf8');

const entry = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import DonationModal from './src/components/DonationModal';
// useLang exige su proveedor: sin el, el modal LANZA y no se pinta nada.
import { LanguageProvider } from './src/contexts/LanguageContext';
window.go = (props) => createRoot(document.getElementById('root')).render(
    React.createElement(LanguageProvider, null, React.createElement(DonationModal, {
        open: true, onClose: () => {}, clubId: 'c1', clubName: 'Distrito 4281',
        currency: 'COP', accentColor: '#9D2235',
        title: 'Aporte para la emergencia',
        subtitle: 'Tu contribución se transforma en ayuda. Realiza un aporte económico voluntario para apoyar la atención y recuperación de las familias y comunidades afectadas por el terremoto.',
        ...props,
    })));
`;

const bundle = await build({
    stdin: { contents: entry, resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, write: false, format: 'iife', platform: 'browser',
    define: { 'import.meta.env.VITE_API_URL': '"/api"', 'process.env.NODE_ENV': '"production"' },
    jsx: 'automatic', logLevel: 'silent',
});

const SYSTEM_CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch(existsSync(SYSTEM_CHROME) ? { executablePath: SYSTEM_CHROME } : {});

let ok = 0; const malos = [];
const check = (n, cond, extra = '') => {
    if (cond) { ok++; console.log(`  ✓ ${n}`); }
    else { malos.push(n); console.log(`  ✗ ${n}${extra ? ` — ${extra}` : ''}`); }
};

// La TRM real del caso reportado.
const PERUNIT = 3128.65;

const montar = async (page, { paypal }) => {
    const errores = [];
    page.on('pageerror', e => errores.push(`PAGEERROR: ${e.message}`));

    // ⚠️ EL COMODÍN VA PRIMERO. Playwright resuelve la ÚLTIMA ruta registrada
    // primero, así que con el comodín al final se traga las de la API y el
    // modal recibe HTML donde esperaba JSON — PayPal nunca se ofrece y la
    // prueba culpa al componente. Es la nota de CLAUDE.md, y costó una vuelta.
    await page.route('**/*', r => r.fulfill({
        status: 200, contentType: 'text/html',
        body: `<!doctype html><html><head><style>${css}</style></head><body><div id="root"></div></body></html>`,
    }));
    // Un ORIGEN real, no about:blank: sin base contra la que resolver, las
    // peticiones no salen y la prueba pasa sin ejercitar nada (v4.720).
    await page.route('**/api/financial/currency**', r => r.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ currency: 'COP', siteCurrency: 'COP', international: false, reason: 'national' }),
    }));
    await page.route('**/api/financial/paypal/available**', r => r.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify(paypal
            ? { available: true, currency: 'USD', originalCurrency: 'COP', converted: true, perUnit: PERUNIT, rateSource: 'Superintendencia Financiera', env: 'sandbox' }
            : { available: false, reason: 'desactivado' }),
    }));
    await page.goto('http://localhost/');
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    await page.evaluate(() => window.go({}));
    await page.waitForSelector('text=Selecciona el monto', { timeout: 5000 });
    // La disponibilidad de PayPal llega por una segunda petición.
    await page.waitForTimeout(300);
    return errores;
};

const medir = (page) => page.evaluate(() => {
    const panel = document.querySelector('.max-w-lg');
    const r = panel.getBoundingClientRect();
    return {
        top: r.top, bottom: r.bottom, alto: r.height,
        ventana: window.innerHeight,
        // Si el contenido es más alto que la caja, hay barra propia.
        desborda: panel.scrollHeight > panel.clientHeight + 1,
    };
});

// ── 1. Con las DOS vías, en un portátil ─────────────────────────────
console.log('\n1. El formulario entero, con tarjeta y PayPal (1280×800)');
{
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errores = await montar(page, { paypal: true });
    check('monta sin errores de consola', errores.length === 0, errores[0]);

    const hayPaypal = await page.locator('text=Donar a través de PayPal').count();
    check('el botón de PayPal está', hayPaypal === 1);

    const aviso = (await page.locator('text=PayPal cobra en').innerText()).replace(/\s+/g, ' ');
    check('y la conversión se dice antes de cobrar', /31,96 USD/.test(aviso), aviso);
    check('con el importe original', /100\.000 COP/.test(aviso), aviso);
    check('y con la tasa', new RegExp('3\\.128,65').test(aviso), aviso);

    const m = await medir(page);
    // ⚠️ LO QUE SE REPORTÓ: la cabecera recortada por arriba. Un flex centrado
    // con el panel más alto que la ventana no se deja desplazar hacia el
    // margen negativo, así que la cruz de cerrar se pierde.
    check('la cabecera NO queda por encima del borde', m.top >= 0, `top=${Math.round(m.top)}`);
    check('el pie NO queda por debajo del borde', m.bottom <= m.ventana + 1,
        `bottom=${Math.round(m.bottom)} ventana=${m.ventana}`);
    check('entra sin barra propia', !m.desborda, `alto=${Math.round(m.alto)} ventana=${m.ventana}`);

    // El pie es lo último y tiene que verse: es lo que faltaba en la captura.
    const pie = await page.locator('text=Pago seguro procesado').boundingBox();
    check('«Pago seguro procesado por…» se ve', !!pie && pie.y + pie.height <= m.ventana,
        pie ? `y=${Math.round(pie.y + pie.height)}` : 'no está');
    await page.close();
}

// ── 2. Sólo tarjeta: no puede haber empeorado ───────────────────────
console.log('\n2. Con una sola vía sigue entrando (1280×800)');
{
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await montar(page, { paypal: false });
    check('sin PayPal no se pinta su botón',
        (await page.locator('text=Donar a través de PayPal').count()) === 0);
    check('ni el aviso de conversión',
        (await page.locator('text=PayPal cobra en').count()) === 0);
    const m = await medir(page);
    check('y entra holgado', !m.desborda && m.top >= 0 && m.bottom <= m.ventana + 1,
        `alto=${Math.round(m.alto)}`);
    await page.close();
}

// ── 3. En una ventana corta no se recorta: se desplaza ──────────────
console.log('\n3. En una ventana corta se desplaza, NO se recorta (1280×560)');
{
    const page = await browser.newPage({ viewport: { width: 1280, height: 560 } });
    await montar(page, { paypal: true });
    const m = await medir(page);
    // Acá SÍ va a haber barra propia, y está bien: lo que no puede pasar es
    // que la cruz de cerrar quede fuera de alcance.
    check('el panel nunca se sale por arriba', m.top >= 0, `top=${Math.round(m.top)}`);
    check('ni por abajo', m.bottom <= m.ventana + 1, `bottom=${Math.round(m.bottom)}`);
    const cerrar = await page.locator('[aria-label="Cerrar"]').boundingBox();
    check('y la cruz de cerrar se puede alcanzar',
        !!cerrar && cerrar.y >= 0 && cerrar.y + cerrar.height <= m.ventana,
        cerrar ? `y=${Math.round(cerrar.y)}` : 'no está');
    await page.close();
}

await browser.close();
console.log(`\n${'─'.repeat(60)}`);
console.log(`${ok} pasaron, ${malos.length} fallaron`);
if (malos.length) process.exit(1);
console.log('El formulario entra entero con las dos vías de pago.');
