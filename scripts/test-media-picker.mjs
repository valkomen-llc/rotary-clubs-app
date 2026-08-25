#!/usr/bin/env node
/**
 * El paginador del selector de la Biblioteca — v4.903
 * ===================================================
 *
 * Reproduce EN UN NAVEGADOR el defecto reportado con captura: «Mostrar más ·
 * quedan 141» con el spinner girando y el scroll muerto. La causa no se ve en
 * ninguna prueba de criterio ni en un montaje fresco:
 *
 *   El selector queda SIEMPRE montado con `isOpen` en falso —así lo usan todas
 *   sus pantallas— y al REABRIRLO con los mismos filtros todos los deps del
 *   efecto del observador quedaban idénticos (misma página, mismos 200 items,
 *   mismo hasMore). El efecto no volvía a correr y el IntersectionObserver
 *   seguía observando el centinela DESMONTADO de la apertura anterior: el
 *   nuevo no lo observaba nadie. Sin un solo error.
 *
 * Por eso el arnés monta el selector COMO LO MONTA AnniversaryStudio (siempre
 * montado, `isOpen` conmutado) y recorre el ciclo real: abrir → cerrar →
 * reabrir → scroll. Y por eso necesita el CSS COMPILADO: sin él nada clipa,
 * nada se desplaza y el centinela «intersecta» o no por los motivos
 * equivocados (la lección de v4.851).
 *
 * Qué se comprueba:
 *   · que tras REABRIR, el scroll siga avanzando las tandas (el defecto);
 *   · que al acercarse al final de lo cargado se pida la página siguiente al
 *     SERVIDOR (offset=200) y se llegue a las 341;
 *   · que el botón «Mostrar más» también pida al servidor — hasta v4.902 sólo
 *     movía la ventana local y al agotarla decía «quedan 1» para siempre;
 *   · que con todo mostrado el centinela desaparezca.
 *
 * Pide `playwright`, `esbuild` y `dist/` compilado, y SE SALTA SOLO si faltan.
 *
 *   npm run test:media:picker
 */

import path from 'node:path';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

let chromium, build;
try {
    ({ chromium } = await import('playwright'));
    ({ build } = await import('esbuild'));
} catch {
    console.log('\n⊘ test:media:picker — falta playwright o esbuild, se salta.\n');
    process.exit(0);
}

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distAssets = path.join(repo, 'dist/assets');
const cssFile = existsSync(distAssets)
    ? readdirSync(distAssets).find(n => n.startsWith('index-') && n.endsWith('.css'))
    : null;
if (!cssFile) {
    console.log('\n⊘ test:media:picker — falta dist/ compilado (el CSS real es parte de la prueba), se salta.\n');
    process.exit(0);
}
const css = readFileSync(path.join(distAssets, cssFile), 'utf8');

let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
    if (cond) { pass++; console.log(`  OK    ${name}`); }
    else { fail++; console.log(`  FALLA ${name}${extra ? ` — ${extra}` : ''}`); }
};

// El arnés reproduce el montaje real: el selector SIEMPRE montado y `isOpen`
// conmutado desde afuera (window.__setOpen), como hace AnniversaryStudio.
const entry = `
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AuthProvider } from './src/hooks/useAuth';
import MediaPicker from './src/components/admin/content-studio/MediaPicker';

localStorage.setItem('rotary_token', 'tok-prueba');
localStorage.setItem('rotary_user', JSON.stringify({ id: 'u1', email: 'x@y.z', role: 'club_admin' }));

const Harness = () => {
    const [open, setOpen] = useState(true);
    window.__setOpen = setOpen;
    return (
        React.createElement(AuthProvider, null,
            React.createElement(MediaPicker, {
                isOpen: open, onClose: () => setOpen(false), onSelect: () => {}, maxSelection: 1
            }))
    );
};
const root = document.createElement('div');
document.body.appendChild(root);
createRoot(root).render(React.createElement(Harness));
`;

const bundle = await build({
    stdin: { contents: entry, resolveDir: repo, loader: 'tsx' },
    bundle: true, write: false, format: 'iife', jsx: 'automatic',
    platform: 'browser',
    loader: { '.css': 'empty', '.svg': 'dataurl', '.png': 'dataurl' },
    define: {
        'import.meta.env.VITE_API_URL': '"/api"',
        'import.meta.env.DEV': 'false',
        'import.meta.env.PROD': 'true',
        'process.env.NODE_ENV': '"production"'
    },
    logLevel: 'silent'
});
const js = bundle.outputFiles[0].text;

// 341 imágenes en el servidor, tandas de 200 — los números del reporte.
const TOTAL = 341;
const items = Array.from({ length: TOTAL }, (_, i) => ({
    id: `m${i}`, filename: `foto-${i}.jpg`, url: `https://cdn.example/f${i}.jpg`,
    thumbUrl: '', type: 'image', sourceType: 'club', sourceId: 'c1', sourceLabel: 'Club Prueba'
}));

const SYSTEM_CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch(
    existsSync(SYSTEM_CHROME) ? { executablePath: SYSTEM_CHROME } : {}
);
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

const errores = [];
page.on('pageerror', e => errores.push(String(e.message)));

const pedidos = [];
await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/') {
        return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head></head><body></body></html>' });
    }
    if (url.pathname === '/api/media') {
        const limit = Number(url.searchParams.get('limit') || TOTAL);
        const offset = Number(url.searchParams.get('offset') || 0);
        pedidos.push(`offset=${offset}`);
        return route.fulfill({
            contentType: 'application/json',
            headers: { 'X-Media-Has-More': offset + limit < TOTAL ? '1' : '0' },
            body: JSON.stringify(items.slice(offset, offset + limit))
        });
    }
    if (url.pathname === '/api/media/sources') return route.fulfill({ contentType: 'application/json', body: '[]' });
    if (url.pathname === '/api/media/library-folders') return route.fulfill({ contentType: 'application/json', body: '{"folders":[]}' });
    if (url.pathname === '/api/admin/stats') return route.fulfill({ contentType: 'application/json', body: '{}' });
    if (url.hostname === 'cdn.example') return route.fulfill({ contentType: 'image/gif', body: Buffer.from('R0lGODlhAQABAAAAACw=', 'base64') });
    return route.fulfill({ status: 404, body: '' });
});

await page.goto('http://localhost/');
await page.addStyleTag({ content: css });
await page.addScriptTag({ content: js });
await page.waitForTimeout(1200);

const estado = () => page.evaluate(() => {
    const boton = [...document.querySelectorAll('button')].find(b => /Mostrar más/.test(b.textContent || ''));
    return {
        tarjetas: document.querySelectorAll('.grid.grid-cols-3 > div').length,
        boton: boton ? boton.textContent.trim() : null
    };
});
const bajar = async (veces = 1) => {
    for (let i = 0; i < veces; i++) {
        await page.evaluate(() => {
            const s = document.querySelector('.overflow-y-auto');
            if (s) s.scrollTop = s.scrollHeight;
        });
        await page.waitForTimeout(450);
    }
};

console.log('\n— 1 · Primera apertura —');
let e = await estado();
check('la primera tanda son 60 tarjetas', e.tarjetas === 60, `tarjetas=${e.tarjetas}`);
check('el centinela dice cuántas quedan (141)', /141/.test(e.boton || ''), `boton=${e.boton}`);

console.log('\n— 2 · Cerrar y REABRIR con los mismos filtros (el ciclo del reporte) —');
await page.evaluate(() => window.__setOpen(false));
await page.waitForTimeout(300);
await page.evaluate(() => window.__setOpen(true));
await page.waitForTimeout(1200);
e = await estado();
check('reabrir vuelve a la primera tanda', e.tarjetas === 60, `tarjetas=${e.tarjetas}`);

await bajar(1);
e = await estado();
check('tras reabrir, el scroll AVANZA la tanda (el defecto)', e.tarjetas > 60, `tarjetas=${e.tarjetas}`);

console.log('\n— 3 · El scroll drena la biblioteca entera —');
await bajar(9);
e = await estado();
check('se pidió la página 2 al servidor (offset=200)', pedidos.includes('offset=200'), `pedidos=${pedidos.join(',')}`);
check('se llega a las 341 tarjetas', e.tarjetas === TOTAL, `tarjetas=${e.tarjetas}`);
check('con todo mostrado, el centinela desaparece', e.boton === null, `boton=${e.boton}`);

console.log('\n— 4 · El botón manual también pide al servidor —');
// Otro ciclo de reapertura: primera tanda local, y avanzar SOLO con el botón.
await page.evaluate(() => window.__setOpen(false));
await page.waitForTimeout(300);
const pedidosAntes = pedidos.length;
await page.evaluate(() => window.__setOpen(true));
await page.waitForTimeout(1200);
for (let i = 0; i < 3; i++) {
    const boton = page.locator('button', { hasText: 'Mostrar más' });
    if (await boton.count()) await boton.first().click();
    await page.waitForTimeout(350);
}
check('tres clics del botón disparan la página siguiente del servidor',
    pedidos.slice(pedidosAntes).includes('offset=200'),
    `pedidos nuevos=${pedidos.slice(pedidosAntes).join(',')}`);
e = await estado();
check('el botón avanzó la ventana local', e.tarjetas >= 240, `tarjetas=${e.tarjetas}`);

check('sin errores de página', errores.length === 0, errores.join(' | '));

await browser.close();
console.log(`\n${pass} OK, ${fail} FALLAS\n`);
process.exit(fail ? 1 : 0);
