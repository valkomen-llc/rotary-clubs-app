#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// El título de la Junta Directiva, en un NAVEGADOR — v4.1023
//
//   npm run test:junta:ui
//
// Es lo que se pidió mirando la pantalla, así que se mira (la lección de
// v4.717: aquella versión verificó la ficha pública y no el editor). Se monta
// la página REAL —con su contexto de club y su contenido del CMS— y se lee el
// `<h1>` pintado. Lo que una prueba de criterio no puede ver:
//
//   1. Que el año llegue de verdad al título, con su espacio: el período se
//      pinta en un nodo aparte y un template literal mal escrito los pegaría.
//   2. Que el nodo del año lleve `data-no-translate` en el DOM, que es lo que
//      el traductor del sitio mira (v4.662).
//   3. Que un título configurado que YA nombra su período no reciba otro.
//
// Pide `playwright` y `esbuild`, y se salta solo si faltan.
// ════════════════════════════════════════════════════════════════════
let chromium, build;
try {
    ({ chromium } = await import('playwright'));
    ({ build } = await import('esbuild'));
} catch {
    console.log('\n⊘ test:junta:ui — falta playwright o esbuild, se salta.\n');
    process.exit(0);
}

import { existsSync } from 'node:fs';

let ok = 0; const malos = [];
const check = (n, cond, extra = '') => {
    if (cond) { ok++; console.log(`  ✓ ${n}`); }
    else { malos.push(n); console.log(`  ✗ ${n}${extra ? ` — ${extra}` : ''}`); }
};

// El período esperado sale del MISMO criterio que la página, no de un año
// escrito acá: una prueba que fija «2026-2027» empieza a fallar sola el 1 de
// julio de 2027 y no por un defecto.
const critOut = await build({
    entryPoints: ['src/lib/rotaryPeriod.ts'],
    bundle: true, write: false, format: 'esm', platform: 'neutral', logLevel: 'silent',
});
const { rotaryPeriodLocal } = await import(`data:text/javascript,${encodeURIComponent(critOut.outputFiles[0].text)}`);
const PERIODO = rotaryPeriodLocal();

const entry = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import Pagina from './src/pages/NuestraJuntaDirectiva';
import { AuthProvider } from './src/hooks/useAuth';
import { ClubProvider } from './src/contexts/ClubContext';
import { LanguageProvider } from './src/contexts/LanguageContext';
import { CartProvider } from './src/contexts/CartContext';
window.go = () => createRoot(document.getElementById('root')).render(
    React.createElement(MemoryRouter, null,
        React.createElement(AuthProvider, null,
            React.createElement(ClubProvider, null,
                React.createElement(LanguageProvider, null,
                    React.createElement(CartProvider, null,
                        React.createElement(Pagina)))))));
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

/** Monta la página con el contenido del CMS que se le pase. */
const abrir = async (secciones) => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errores = [];
    page.on('pageerror', e => errores.push(`PAGEERROR: ${e.message}`));

    await page.route('**/api/**', r => r.fulfill({ json: {} }));
    await page.route('**/api/clubs/by-domain*', r => r.fulfill({
        json: { id: 'c-1', name: 'Rotary Bogotá Occidente', type: 'club', settings: [], members: [] },
    }));
    await page.route('**/api/clubs/*/sections*', r => r.fulfill({ json: secciones }));
    // El arnés necesita un ORIGEN real: sobre `about:blank` una dirección
    // relativa no tiene base contra la que resolverse y la petición no sale
    // (la lección de v4.720).
    await page.route('http://localhost/', r => r.fulfill({
        contentType: 'text/html', body: '<!doctype html><body><div id="root"></div></body>',
    }));
    await page.goto('http://localhost/');
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    await page.evaluate(() => window.go());
    await page.waitForSelector('#root h1', { timeout: 8000 });
    return { page, errores };
};

const seccion = (titulo) => ([
    { id: 's1', page: 'junta-directiva', section: 'header', content: JSON.stringify({ title: titulo }) },
]);

/**
 * El h1 ya pintado y estable.
 *
 * ⚠️ La página pinta PRIMERO el título por defecto y repinta cuando llega el
 * contenido del CMS: leerlo en cuanto aparece el `<h1>` es una carrera —la
 * primera versión de esta prueba fallaba de forma intermitente por eso—. Se
 * espera a que el título configurado esté puesto y sólo entonces se afirma el
 * texto COMPLETO, que es donde vive lo que se comprueba: el período.
 */
const tituloDe = async (page, esperandoQueContenga = null) => {
    if (esperandoQueContenga) {
        // Si no llega, NO se lanza: se devuelve lo que haya y la comprobación
        // falla nombrando el texto que sí se pintó. Un timeout crudo dice
        // menos que «el h1 decía esto otro».
        try {
            await page.waitForFunction(
                t => (document.querySelector('#root h1')?.textContent || '').includes(t),
                esperandoQueContenga, { timeout: 8000 });
        } catch { /* lo dice la comprobación */ }
    }
    const txt = await page.evaluate(() => document.querySelector('#root h1')?.textContent || '');
    return txt.replace(/\s+/g, ' ').trim();
};

console.log(`\n── Sin título configurado: el año se AÑADE (${PERIODO}) ──`);
{
    const { page, errores } = await abrir([]);
    const texto = await tituloDe(page);
    check(`el h1 dice «Nuestra Junta Directiva ${PERIODO}»`,
        texto === `Nuestra Junta Directiva ${PERIODO}`, texto);
    // El espacio: sin él saldría «Directiva2026-2027» y la comparación de
    // arriba lo atrapa, pero conviene decirlo con su propio nombre.
    check('el año va separado del título, no pegado', / \d{4}-\d{4}$/.test(texto), texto);
    const marcado = page.locator('#root h1 [data-no-translate]');
    const cuantos = await marcado.count();
    check('el año vive en un nodo que el traductor no toca', cuantos === 1);
    // ⚠️ Leer un localizador que no existe LANZA y se lleva por delante el
    // resto del bloque (la lección de v4.990 con `boundingBox`): la ausencia
    // se comprueba antes con `count()`.
    check('y ese nodo es EXACTAMENTE el año',
        cuantos === 1 && (await marcado.first().textContent()).trim() === PERIODO);
    check('sin errores de página', errores.length === 0, errores.join(' | '));
    await page.close();
}

console.log('\n── Título configurado SIN período: también lo recibe ──');
{
    const { page } = await abrir(seccion('Junta Directiva del Club'));
    const texto = await tituloDe(page, 'Junta Directiva del Club');
    check(`«Junta Directiva del Club» → «Junta Directiva del Club ${PERIODO}»`,
        texto === `Junta Directiva del Club ${PERIODO}`, texto);
    await page.close();
}

console.log('\n── Título que YA nombra su período: no se duplica ──');
{
    const escrito = 'Nuestra Junta Directiva 2028-2029';
    const { page } = await abrir(seccion(escrito));
    const texto = await tituloDe(page, 'Nuestra Junta Directiva 2028');
    check('se respeta letra por letra lo que escribió el club', texto === escrito, texto);
    check('y no se pinta ningún nodo de período encima',
        (await page.locator('#root h1 [data-no-translate]').count()) === 0);
    await page.close();
}

await browser.close();

console.log(`\n${'─'.repeat(60)}`);
if (malos.length) {
    console.log(`✗ ${malos.length} de ${ok + malos.length} fallaron:\n`);
    for (const m of malos) console.log(`   · ${m}`);
    process.exit(1);
}
console.log(`✓ ${ok} comprobaciones, todas bien.\n`);
