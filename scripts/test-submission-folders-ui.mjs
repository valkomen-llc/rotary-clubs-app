#!/usr/bin/env node
/**
 * El selector abre EN la carpeta de la solicitud — v4.1004
 * ========================================================
 *
 * Lo que se reportó se reportó MIRANDO LA PANTALLA: «al seleccionar una portada
 * el sistema prioriza subir una imagen desde el computador en lugar de trabajar
 * con los archivos ya suministrados». Eso no se ve en ninguna prueba de
 * criterio —el criterio nunca estuvo mal— así que se comprueba en un navegador
 * de verdad, con el CSS compilado (la lección de v4.851: sin él nada clipa y
 * las medidas salen por los motivos equivocados).
 *
 * Qué se comprueba:
 *   · que al abrir con `initialFolderId` la PETICIÓN lleve esa carpeta — es lo
 *     único que demuestra que se está viendo el material del club y no la
 *     Biblioteca entera;
 *   · que se vea DÓNDE está parado y que exista la salida a toda la Biblioteca;
 *   · que «Volver al material de la solicitud» regrese de verdad;
 *   · que al REABRIR vuelva a pararse en la carpeta (el selector queda montado
 *     con `isOpen` en falso — la lección del centinela de v4.903);
 *   · que «Subir nuevo» exista y suba CON la carpeta abierta, no a la raíz;
 *   · que sin `initialFolderId` el selector se comporte exactamente como antes.
 *
 * Pide `playwright`, `esbuild` y `dist/` compilado, y SE SALTA SOLO si faltan.
 *
 *   npm run test:submissions:folders:ui
 */

import path from 'node:path';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

let chromium, build;
try {
    ({ chromium } = await import('playwright'));
    ({ build } = await import('esbuild'));
} catch {
    console.log('\n⊘ test:submissions:folders:ui — falta playwright o esbuild, se salta.\n');
    process.exit(0);
}

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distAssets = path.join(repo, 'dist/assets');
const cssFile = existsSync(distAssets)
    ? readdirSync(distAssets).find(n => n.startsWith('index-') && n.endsWith('.css'))
    : null;
if (!cssFile) {
    console.log('\n⊘ test:submissions:folders:ui — falta dist/ compilado, se salta.\n');
    process.exit(0);
}
const css = readFileSync(path.join(distAssets, cssFile), 'utf8');

let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
    if (cond) { pass++; console.log(`  OK    ${name}`); }
    else { fail++; console.log(`  FALLA ${name}${extra ? ` — ${extra}` : ''}`); }
};

const CARPETA = 'fold-solicitud';

// El montaje real: el selector SIEMPRE montado y `isOpen` conmutado desde
// afuera, como lo hace News.tsx. `__setFolder` permite probar también la rama
// sin carpeta, que es la de las diez pantallas que ya lo usaban.
const entry = `
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AuthProvider } from './src/hooks/useAuth';
import MediaPicker from './src/components/admin/content-studio/MediaPicker';

localStorage.setItem('rotary_token', 'tok-prueba');
localStorage.setItem('rotary_user', JSON.stringify({ id: 'u1', email: 'x@y.z', role: 'club_admin' }));

const Harness = () => {
    const [open, setOpen] = useState(true);
    const [folder, setFolder] = useState('${CARPETA}');
    window.__setOpen = setOpen;
    window.__setFolder = setFolder;
    window.__elegido = null;
    return (
        React.createElement(AuthProvider, null,
            React.createElement(MediaPicker, {
                isOpen: open, onClose: () => setOpen(false),
                onSelect: (items) => { window.__elegido = items; },
                maxSelection: 1,
                initialFolderId: folder,
                homeFolderName: 'Entrega mercados, medicamentos, ropa',
                allowUpload: true,
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

// Diez fotos del club en la carpeta; treinta más sueltas en la Biblioteca. Los
// números importan: es lo que distingue «estoy viendo el material» de «estoy
// viendo todo».
const enCarpeta = Array.from({ length: 10 }, (_, i) => ({
    id: `s${i}`, filename: `solicitud-${i}.jpg`, url: `https://cdn.example/s${i}.jpg`,
    thumbUrl: '', type: 'image', sourceType: 'club', sourceId: 'c1', sourceLabel: 'Club', folderId: CARPETA,
}));
const sueltas = Array.from({ length: 30 }, (_, i) => ({
    id: `o${i}`, filename: `otra-${i}.jpg`, url: `https://cdn.example/o${i}.jpg`,
    thumbUrl: '', type: 'image', sourceType: 'club', sourceId: 'c1', sourceLabel: 'Club', folderId: null,
}));

const SYSTEM_CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch(existsSync(SYSTEM_CHROME) ? { executablePath: SYSTEM_CHROME } : {});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

const errores = [];
page.on('pageerror', e => errores.push(String(e.message)));

const pedidos = [];       // cada GET /api/media, con su folderId
const subidas = [];       // cada POST /api/media/save, con su folderId
await page.route('**/*', async route => {
    const req = route.request();
    const url = new URL(req.url());
    if (url.pathname === '/') {
        return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head></head><body></body></html>' });
    }
    if (url.pathname === '/api/media' && req.method() === 'GET') {
        const folderId = url.searchParams.get('folderId');
        pedidos.push(folderId);
        const lista = folderId === CARPETA ? enCarpeta : [...enCarpeta, ...sueltas];
        return route.fulfill({
            contentType: 'application/json',
            headers: { 'X-Media-Has-More': '0' },
            body: JSON.stringify(lista)
        });
    }
    if (url.pathname === '/api/media/sources') return route.fulfill({ contentType: 'application/json', body: '[]' });
    if (url.pathname === '/api/media/library-folders') {
        return route.fulfill({
            contentType: 'application/json',
            body: JSON.stringify({ folders: [{ id: CARPETA, name: 'Entrega mercados, medicamentos, ropa', parentId: 'raiz' }], tree: [], rootCount: 30 })
        });
    }
    if (url.pathname === '/api/media/presigned-url') {
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ uploadUrl: 'https://s3.example/put', key: 'clubs/c1/nueva.jpg', fileUrl: 'https://cdn.example/nueva.jpg' }) });
    }
    if (url.pathname === '/api/media/save') {
        const body = JSON.parse(req.postData() || '{}');
        subidas.push(body.folderId ?? null);
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ media: { id: 'nuevo1', filename: 'nueva.jpg', url: 'https://cdn.example/nueva.jpg', type: 'image' } }) });
    }
    if (url.hostname === 's3.example') return route.fulfill({ status: 200, body: '' });
    if (url.hostname === 'cdn.example') return route.fulfill({ contentType: 'image/gif', body: Buffer.from('R0lGODlhAQABAAAAACw=', 'base64') });
    return route.fulfill({ status: 404, body: '' });
});

await page.goto('http://localhost/');
await page.addStyleTag({ content: css });
await page.addScriptTag({ content: js });
await page.waitForTimeout(1200);

const tarjetas = () => page.evaluate(() => document.querySelectorAll('.grid.grid-cols-3 > div').length);
const texto = () => page.evaluate(() => document.body.innerText);
const pulsar = async (rotulo) => {
    const ok = await page.evaluate((r) => {
        const b = [...document.querySelectorAll('button')].find(x => (x.textContent || '').toUpperCase().includes(r));
        if (!b) return false;
        b.click(); return true;
    }, rotulo.toUpperCase());
    await page.waitForTimeout(500);
    return ok;
};

console.log('\n— 1 · Abre PARADO en el material de la solicitud —');
// ⚠️ La petición es la prueba: que se vean diez tarjetas podría ser casualidad,
// pero que el servidor reciba `folderId` sólo pasa si el selector se paró ahí.
check('la primera petición lleva la carpeta de la solicitud', pedidos[0] === CARPETA, `folderId=${pedidos[0]}`);
check('se ven las 10 del club, no las 40 del sitio', await tarjetas() === 10, `tarjetas=${await tarjetas()}`);
// El texto llega en MAYÚSCULAS por `text-transform`, así que se compara sin
// distinguir caja (la lección de v4.990).
check('dice dónde está parado', /ENTREGA MERCADOS/i.test(await texto()));
check('ofrece la salida a toda la Biblioteca', /TODA LA BIBLIOTECA/i.test(await texto()));

console.log('\n— 2 · No encierra: se sale y se vuelve —');
check('«Toda la Biblioteca» responde', await pulsar('TODA LA BIBLIOTECA'));
check('la petición ya NO lleva carpeta', pedidos[pedidos.length - 1] === null, `folderId=${pedidos[pedidos.length - 1]}`);
check('se ven las 40 del sitio', await tarjetas() === 40, `tarjetas=${await tarjetas()}`);
check('aparece el regreso al material', /VOLVER AL MATERIAL/i.test(await texto()));
check('«Volver» responde', await pulsar('VOLVER AL MATERIAL'));
check('vuelve a pedir la carpeta', pedidos[pedidos.length - 1] === CARPETA, `folderId=${pedidos[pedidos.length - 1]}`);

console.log('\n— 3 · Reabrir vuelve al material (el ciclo real) —');
// El selector queda montado con `isOpen` en falso: sin el reseteo, quien
// saliera a la Biblioteca y cerrara volvería a abrirlo ahí.
await pulsar('TODA LA BIBLIOTECA');
await page.evaluate(() => window.__setOpen(false));
await page.waitForTimeout(300);
await page.evaluate(() => window.__setOpen(true));
await page.waitForTimeout(700);
check('tras reabrir, se pide otra vez la carpeta', pedidos[pedidos.length - 1] === CARPETA, `folderId=${pedidos[pedidos.length - 1]}`);
check('y se ven las 10 del club', await tarjetas() === 10, `tarjetas=${await tarjetas()}`);

console.log('\n— 4 · «Subir nuevo» cae en la carpeta abierta —');
check('el botón existe', /SUBIR NUEVO/i.test(await texto()));
await page.setInputFiles('input[type=file]', {
    name: 'nueva.jpg', mimeType: 'image/jpeg',
    // Un JPEG mínimo de verdad: el camino de subida lo procesa con canvas.
    buffer: Buffer.from('/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==', 'base64'),
});
await page.waitForTimeout(1500);
check('la subida llevó la carpeta abierta, no la raíz', subidas[0] === CARPETA, `folderId=${subidas[0]}`);

console.log('\n— 5 · Sin carpeta se comporta como SIEMPRE —');
await page.evaluate(() => window.__setOpen(false));
await page.evaluate(() => window.__setFolder(null));
await page.waitForTimeout(200);
await page.evaluate(() => window.__setOpen(true));
await page.waitForTimeout(900);
check('la petición no lleva carpeta', pedidos[pedidos.length - 1] === null, `folderId=${pedidos[pedidos.length - 1]}`);
check('se ven todas las del sitio', await tarjetas() === 40, `tarjetas=${await tarjetas()}`);
check('no se pinta el renglón de la solicitud', !/VOLVER AL MATERIAL/i.test(await texto()));

check('sin errores de página', errores.length === 0, errores.join(' | '));

await browser.close();
console.log(`\n${pass} OK, ${fail} FALLAS\n`);
process.exit(fail ? 1 : 0);
