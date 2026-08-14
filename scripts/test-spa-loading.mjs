#!/usr/bin/env node
/**
 * La pantalla en blanco del panel — v4.789
 * ========================================
 *
 * Reporte: «cada vez que intento ingresar al administrador de contenidos la
 * página se queda en blanco; tengo que cargarla de manera forzada varias veces
 * para poder acceder».
 *
 * La cadena, de punta a punta:
 *
 *   1. Desde v4.659 cada página es un archivo con hash en el nombre, y ese
 *      hash cambia en cada despliegue (varios por día en este sitio).
 *   2. Una pestaña abierta desde antes pide el archivo VIEJO. `vercel.json`
 *      manda todo lo que no es `/api/` a la función, así que ese archivo
 *      inexistente NO daba 404: devolvía el documento de la aplicación, con
 *      estado 200 y `Content-Type: text/html`.
 *   3. El navegador intenta interpretar HTML como módulo y falla. React CACHEA
 *      la promesa rechazada, así que ese componente ya no carga en toda la
 *      sesión — pantalla en blanco hasta recargar.
 *   4. Y el documento se servía SIN `Cache-Control`, así que una recarga normal
 *      podía devolver el documento viejo con los hashes viejos. De ahí el
 *      «varias veces».
 *
 * Se prueban las tres correcciones. La parte de navegador pide `playwright` y
 * `esbuild` y SE SALTA sola si no están (`npm i --no-save playwright esbuild`).
 *
 *   npm run test:spa
 */

import { isBuildAssetPath } from '../server/lib/staticAssets.js';
import { readFileSync, mkdtempSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
    if (cond) { pass++; console.log(`  OK    ${name}`); }
    else { fail++; console.log(`  FALLA ${name}${extra ? ` — ${extra}` : ''}`); }
};

// ───────────────────────────────────────────────────────────────────────────
console.log('\n▸ Qué es un archivo del build y qué es una página');

for (const p of [
    '/assets/ContentStudio-a1b2c3.js', '/assets/index-9f8e.css', '/assets/logo.svg',
    '/assets/anything', '/favicon.ico', '/vendor-react-x.js', '/fuente.woff2',
]) check(`«${p}» es archivo`, isBuildAssetPath(p) === true);

for (const p of [
    '/', '/admin/content-studio', '/admin/dashboard', '/eventos', '/proyectos/agua-limpia',
    '/plantillas/aniversario', '/mi-inscripcion', '/generador-pendones',
]) check(`«${p}» es una PÁGINA, no un archivo`, isBuildAssetPath(p) === false);

// El riesgo de esta función es equivocarse hacia el otro lado: dar por archivo
// una página real la dejaría sin servir, que es peor que el defecto.
check('un slug con punto NO se confunde con un archivo',
    isBuildAssetPath('/eventos/xii-feria-2027.valledupar') === false);
check('una ruta que termina en punto tampoco',
    isBuildAssetPath('/algo.') === false);
check('un punto al principio del nombre tampoco',
    isBuildAssetPath('/.bien') === false);
check('la extensión no distingue mayúsculas', isBuildAssetPath('/FOTO.PNG') === true);
check('una ruta vacía o rara no revienta',
    isBuildAssetPath('') === false && isBuildAssetPath(null) === false && isBuildAssetPath(undefined) === false);

// ───────────────────────────────────────────────────────────────────────────
console.log('\n▸ El servidor: 404 de verdad, y el documento sin caché');

{
    const api = readFileSync(path.join(root, 'api/index.js'), 'utf8');
    check('el catch-all devuelve 404 para un archivo que no existe',
        /isBuildAssetPath\(req\.path\)[\s\S]{0,400}res\.status\(404\)/.test(api));
    check('...y NO como HTML: quien lo pide espera un módulo',
        /isBuildAssetPath\(req\.path\)[\s\S]{0,400}type\('text\/plain'\)/.test(api));
    // Se compara contra la LLAMADA, no contra la mención: el comentario que
    // explica el catch-all nombra `renderPublicDocument` mucho antes.
    check('...antes de servir el documento, o no serviría de nada',
        api.indexOf('isBuildAssetPath(req.path)') < api.indexOf("const { renderPublicDocument } ="));
    check('el documento se sirve SIN caché: es quien nombra los hashes del build',
        /Cache-Control', 'no-store, must-revalidate'\);\s*\n\s*res\.setHeader\('Content-Type', 'text\/html/.test(api));
}

// ───────────────────────────────────────────────────────────────────────────
console.log('\n▸ El cliente: ninguna página cruda y nada sin red de seguridad');

{
    const app = readFileSync(path.join(root, 'src/App.tsx'), 'utf8');
    check('ninguna página usa `React.lazy` a secas: todas se pueden recuperar',
        !/React\.lazy\(/.test(app));
    check('y son muchas, así que la conversión no puede ser parcial',
        (app.match(/lazyWithRetry\(/g) || []).length > 90,
        String((app.match(/lazyWithRetry\(/g) || []).length));
    check('el <Suspense> va DENTRO de un límite de error',
        /<ChunkErrorBoundary>[\s\S]{0,600}<Suspense/.test(app));
    check('...y se cierra donde corresponde',
        /<\/Suspense>\s*\n\s*<\/ChunkErrorBoundary>/.test(app));

    const main = readFileSync(path.join(root, 'src/main.tsx'), 'utf8');
    // Otra vez la LLAMADA y no la mención: el comentario de `main.tsx` explica
    // justamente por qué esto no va en un `useEffect`.
    check('el aviso de precarga fallida se registra al arrancar, no en un componente',
        /^escucharFallosDePrecarga\(\);$/m.test(main) && !/useEffect\(/.test(main));
}

// ───────────────────────────────────────────────────────────────────────────
console.log('\n▸ La política de recarga (pura: recargar para probarla sería absurdo)');

{
    // Se carga el módulo del navegador con esbuild, como el resto de los
    // espejos del sitio.
    let esbuild = null;
    try { esbuild = (await import('esbuild')).default; } catch { /* opcional */ }

    if (!esbuild) {
        console.log('  SALTA — esbuild no está instalado (npm i --no-save esbuild).');
    } else {
        const out = esbuild.buildSync({
            entryPoints: [path.join(root, 'src/lib/lazyWithRetry.ts')],
            // Sin `external`: el archivo se importa desde una carpeta temporal,
            // donde `node_modules` no se resuelve. `permiteRecarga` no usa React
            // para nada, pero el módulo lo importa.
            bundle: true, format: 'esm', write: false, platform: 'node',
        });
        const dir = mkdtempSync(path.join(tmpdir(), 'spa-'));
        const file = path.join(dir, 'm.mjs');
        writeFileSync(file, out.outputFiles[0].text);
        const { permiteRecarga } = await import(file);

        const ahora = 1_000_000;
        check('sin recargas previas se puede recargar',
            permiteRecarga([], ahora).permitido === true);
        check('con una, todavía', permiteRecarga([ahora - 1000], ahora).permitido === true);
        // El freno: sin él, un archivo que falta de verdad deja al usuario en un
        // bucle de pantallas blancas, que es peor que el defecto original.
        check('con DOS en el último minuto ya no: se muestra el error en vez de girar',
            permiteRecarga([ahora - 1000, ahora - 2000], ahora).permitido === false);
        check('las recargas viejas caducan: el freno no es para siempre',
            permiteRecarga([ahora - 90_000, ahora - 80_000], ahora).permitido === true);
        check('...y las caducadas no se arrastran en la cuenta',
            permiteRecarga([ahora - 90_000, ahora - 1000], ahora).vigentes.length === 1);
        check('una marca corrupta se descarta en vez de romper la cuenta',
            permiteRecarga(['x', null, NaN, ahora - 500], ahora).vigentes.length === 1);
    }
}

// ───────────────────────────────────────────────────────────────────────────
console.log('\n▸ En un navegador: un tropiezo se resuelve sin recargar');

{
    let playwright = null, esbuild = null;
    try { playwright = await import('playwright'); esbuild = (await import('esbuild')).default; } catch { /* opcional */ }

    if (!playwright || !esbuild) {
        console.log('  SALTA — playwright/esbuild no están (npm i --no-save playwright esbuild).');
    } else {
        const dir = mkdtempSync(path.join(tmpdir(), 'spa-ui-'));
        // Un arnés mínimo: React, `lazyWithRetry` y una fábrica que falla la
        // primera vez y funciona la segunda — el fallo de red pasajero, que es
        // el caso que NO debe costar una recarga.
        const entry = path.join(dir, 'entry.tsx');
        writeFileSync(entry, `
import React, { Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { lazyWithRetry } from ${JSON.stringify(path.join(root, 'src/lib/lazyWithRetry.ts'))};

let intentos = 0;
(window as any).intentos = () => intentos;
const Pagina = lazyWithRetry(async () => {
    intentos++;
    if (intentos < 2) throw new Error('Failed to fetch dynamically imported module');
    return { default: () => React.createElement('h1', { id: 'ok' }, 'Panel cargado') };
}, 'ContentStudio');

createRoot(document.getElementById('root')!).render(
    React.createElement(Suspense, { fallback: React.createElement('p', { id: 'cargando' }, 'Cargando') },
        React.createElement(Pagina))
);
`);
        const bundle = esbuild.buildSync({
            entryPoints: [entry], bundle: true, format: 'iife', write: false,
            loader: { '.tsx': 'tsx', '.ts': 'ts' },
            // El arnés vive en una carpeta temporal: sin esto, esbuild busca
            // `react` junto a él y no lo encuentra.
            nodePaths: [path.join(root, 'node_modules')],
            define: { 'process.env.NODE_ENV': '"production"' },
        }).outputFiles[0].text;

        const browser = await playwright.chromium.launch({
            executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
        }).catch(() => playwright.chromium.launch());
        const page = await browser.newPage();

        let recargas = 0;
        page.on('load', () => { recargas++; });

        await page.route('**/*', route =>
            route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html><body><div id="root"></div></body></html>' }));
        await page.goto('http://localhost/');
        await page.addScriptTag({ content: bundle });

        await page.waitForSelector('#ok', { timeout: 5000 }).catch(() => { });
        check('un fallo pasajero se reintenta y la pantalla termina cargando',
            await page.locator('#ok').count() === 1);
        check('...con exactamente DOS intentos: uno falla, el otro entra',
            await page.evaluate(() => (window).intentos()) === 2);
        check('...y sin recargar la página: recargar es el último recurso, no el primero',
            recargas === 1, `cargas de página: ${recargas}`);
        check('no quedó ninguna recarga anotada',
            await page.evaluate(() => sessionStorage.getItem('app:chunk-reloads')) === null);

        await browser.close();
    }
}

console.log(`\n${fail === 0 ? '✓' : '✗'} ${pass} pruebas pasan, ${fail} fallan\n`);
process.exit(fail === 0 ? 0 : 1);
