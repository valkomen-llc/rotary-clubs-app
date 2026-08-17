#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// «Quiénes ya aportaron» en un navegador.  npm run test:contributors:ui
// v4.862.0
//
// Comprueba lo que una prueba de criterio NO puede ver: que la línea se pinte
// debajo del botón, que los nombres pasen SOLOS de uno al siguiente —que es
// literalmente lo que se pidió—, que el cursor la detenga y que soltarlo la
// reanude. Un freno sin salida no se lee como un freno, se lee como que la
// función dejó de funcionar (v4.832), y eso sólo se ve manejándolo.
//
// Pide `playwright` y `esbuild` y se salta solo si faltan.
// ════════════════════════════════════════════════════════════════════
let chromium, build;
try {
    ({ chromium } = await import('playwright'));
    ({ build } = await import('esbuild'));
} catch {
    console.log('\n⊘ test:contributors:ui — falta playwright o esbuild, se salta.\n');
    process.exit(0);
}

import { existsSync } from 'node:fs';

const entry = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import ContributorRoll from './src/components/campaign/ContributorRoll';
window.go = (roll) => createRoot(document.getElementById('root')).render(
    React.createElement('div', null,
        React.createElement('button', null, 'APORTAR AHORA'),
        React.createElement(ContributorRoll, { roll, accent: '#9D2235' })));
`;

const bundle = await build({
    stdin: { contents: entry, resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, write: false, format: 'iife', platform: 'browser',
    define: { 'import.meta.env.VITE_API_URL': '"/api"', 'process.env.NODE_ENV': '"production"' },
    jsx: 'automatic', logLevel: 'silent',
});

const SYSTEM_CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch(existsSync(SYSTEM_CHROME) ? { executablePath: SYSTEM_CHROME } : {});
const page = await browser.newPage({ viewport: { width: 900, height: 600 } });

const errores = [];
page.on('pageerror', e => errores.push(`PAGEERROR: ${e.message}`));
page.on('console', m => { if (m.type() === 'error') errores.push(`CONSOLE: ${m.text().slice(0, 300)}`); });

// Un ORIGEN real, no `about:blank`: es la lección de v4.720 y de v4.837 — sin
// base contra la que resolver, media prueba pasa sin haber ejercitado nada.
await page.route('**/*', r => r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html><body><div id="root"></div></body></html>' }));
await page.goto('http://localhost/');
await page.addScriptTag({ content: bundle.outputFiles[0].text });

let ok = 0; const malos = [];
const check = (n, cond, extra = '') => {
    if (cond) { ok++; console.log(`  ✓ ${n}`); }
    else { malos.push(n); console.log(`  ✗ ${n}${extra ? ` — ${extra}` : ''}`); }
};

const montar = async (roll) => {
    await page.evaluate(() => { document.getElementById('root').innerHTML = ''; });
    await page.evaluate(r => window.go(r), roll);
    await page.waitForTimeout(120);
};
const linea = () => page.evaluate(() => {
    const d = document.querySelector('button')?.parentElement?.querySelectorAll('div');
    // El hueco entre el total y el nombre lo pone `gap-2` del flex, que NO
    // es texto: `innerText` devuelve «2 aportes·Daniel Yazo». Se normaliza
    // acá para poder leer la línea como se ve.
    return d?.length ? d[d.length - 1].innerText.replace(/\s+/g, ' ').replace(/\s*·\s*/g, ' · ').trim() : '';
});

console.log('\nEl caso del reporte: dos aportes, dos nombres');
await montar({ total: 2, names: ['Daniel Yazo', 'Ana Pérez'] });
const primera = await linea();
check('la línea dice el total y UN nombre, en una sola línea',
    /^2 aportes · (Daniel Yazo|Ana Pérez)$/.test(primera), primera);
check('el total va primero', primera.startsWith('2 aportes'), primera);
check('el nombre está marcado como dato, no como lenguaje',
    await page.evaluate(() => !!document.querySelector('[data-no-translate]')));

// LO QUE SE PIDIÓ: «aparezca uno, aparezca el otro de manera automática».
// Nadie toca nada; sólo se espera.
console.log('\nLos nombres pasan solos');
await page.mouse.move(5, 5); // fuera de la línea: con el cursor encima está detenida a propósito
await page.waitForTimeout(3600);
const segunda = await linea();
check('sin tocar nada, el nombre cambió solo', segunda !== primera, `${primera} → ${segunda}`);
check('el total no cambia al rotar', segunda.startsWith('2 aportes'), segunda);

console.log('\nEl freno del cursor, y su salida');
const caja = await page.evaluate(() => {
    const d = document.querySelector('button').parentElement.querySelectorAll('div');
    const r = d[d.length - 1].getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
});
// Chromium recalcula el estado del puntero con los EVENTOS del ratón: hay que
// moverlo de verdad, en pasos (lección de v4.823).
await page.mouse.move(caja.x, caja.y, { steps: 6 });
await page.mouse.move(caja.x + 1, caja.y);
await page.waitForTimeout(150);
const conCursor = await linea();
await page.waitForTimeout(4000);
check('con el cursor encima, la línea se queda quieta', (await linea()) === conCursor, conCursor);

await page.mouse.move(5, 5, { steps: 6 });
await page.waitForTimeout(4000);
check('al apartar el cursor, vuelve a pasar sola', (await linea()) !== conCursor);

console.log('\nLo que NO se dice');
await montar({ total: 0, names: [] });
check('sin aportes no se pinta nada', (await linea()) === '', await linea());

// Todos anónimos: hay total y no hay ningún nombre. Es la verdad completa de
// lo que se puede decir.
await montar({ total: 3, names: [] });
const soloTotal = await linea();
check('con todos anónimos queda el total y ningún nombre', soloTotal === '3 aportes', soloTotal);

await montar({ total: 1, names: ['Daniel Yazo'] });
check('un solo aporte va en singular', (await linea()) === '1 aporte · Daniel Yazo', await linea());
const antesDeEsperar = await linea();
await page.waitForTimeout(3600);
check('con un solo nombre no hay rotación', (await linea()) === antesDeEsperar);

check('ningún error de consola', errores.length === 0, errores.join(' | '));

await browser.close();
console.log(`\n${ok} comprobaciones pasaron${malos.length ? `, ${malos.length} FALLARON:` : '.'}`);
for (const m of malos) console.log(`  ✗ ${m}`);
process.exit(malos.length ? 1 : 0);
