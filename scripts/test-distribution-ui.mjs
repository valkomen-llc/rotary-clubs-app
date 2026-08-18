#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// La pantalla de Distribución en un navegador.  npm run test:distribution:ui
// v4.865.0
//
// Comprueba lo que una prueba de criterio no puede ver: que al elegir una
// publicación aparezca su VISTA PREVIA con la imagen y el texto enteros, y que
// pegar varios grupos de una vez los agregue a la lista. Las dos cosas se
// pidieron mirando la pantalla, y en la pantalla hay que comprobarlas.
//
// Pide `playwright` y `esbuild` y se salta solo si faltan.
// ════════════════════════════════════════════════════════════════════
let chromium, build;
try {
    ({ chromium } = await import('playwright'));
    ({ build } = await import('esbuild'));
} catch {
    console.log('\n⊘ test:distribution:ui — falta playwright o esbuild, se salta.\n');
    process.exit(0);
}
import { existsSync, readFileSync, readdirSync } from 'node:fs';

let ok = 0; const malos = [];
const chk = (name, cond, detail = '') => {
    if (cond) { ok++; console.log(`  ✓ ${name}`); }
    else { malos.push(name); console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
};
const grupo = (t) => console.log(`\n${t}`);

const entry = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import DistributionPanel from './src/components/admin/content-studio/DistributionPanel';
window.go = () => createRoot(document.getElementById('root')).render(
    React.createElement(MemoryRouter, null, React.createElement(DistributionPanel)));
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
const page = await browser.newPage({ viewport: { width: 1400, height: 1100 } });

const errores = [];
page.on('pageerror', e => errores.push(`PAGEERROR: ${e.message}`));
page.on('console', m => { if (m.type() === 'error') errores.push(`CONSOLE: ${m.text().slice(0, 300)}`); });

// Lo que el servidor manda al PUT de grupos vuelve a la pantalla: se guarda acá
// para poder comprobar QUÉ se mandó, no sólo que se pintó.
let guardado = null;

// ⚠️ El comodín va PRIMERO: Playwright resuelve la última ruta registrada antes
// que las anteriores. Al revés, el comodín se comería las específicas.
await page.route('**/api/**', r => r.fulfill({ json: {} }));
await page.route('**/api/distribution/targets*', r => r.fulfill({ json: {
    accounts: [{ key: 'acct:1', targetType: 'page', targetId: '111', targetName: 'Distrito 4281 de RI', socialAccountId: 'a1' }],
    groups: [], manualNotice: 'x',
} }));
await page.route('**/api/distribution/campaigns*', r => r.fulfill({ json: { campaigns: [] } }));
await page.route('**/api/distribution/page-posts*', r => r.fulfill({ json: { posts: [
    {
        id: 'p1',
        message: 'COLOMBIA NOS NECESITA. Ante la emergencia ocasionada por el terremoto del 10 de agosto, desde el Distrito 4281 unimos esfuerzos para apoyar a las familias afectadas.',
        createdTime: '2026-08-14T15:40:19.000Z',
        permalink: 'https://facebook.com/4281/posts/999',
        picture: 'data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==',
    },
    { id: 'p2', message: '', createdTime: '2026-08-13T10:30:45.000Z', permalink: null, picture: null },
] } }));
await page.route('**/api/distribution/groups', async (r) => {
    if (r.request().method() === 'PUT') {
        guardado = JSON.parse(r.request().postData() || '{}');
        return r.fulfill({ json: { ok: true, groups: (guardado.groups || []).map(g => ({
            key: `group:${g.id}`, targetType: 'group_manual', targetId: g.id,
            targetName: g.name, targetUrl: g.url, tag: null,
        })), descartados: 0 } });
    }
    return r.fulfill({ json: { groups: [], notice: 'x' } });
});

// ⚠️ EL ARNÉS NECESITA UN ORIGEN REAL. Sobre `about:blank` —que es lo que deja
// `setContent`— una dirección relativa como `/api/…` no tiene base contra la
// que resolverse: la petición no llega a salir y la prueba pasaría sin haber
// ejercitado nada. Es la lección de v4.720, y acá costó una vuelta.
await page.route('http://localhost/', r => r.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><body><div id="root"></div></body>',
}));
await page.goto('http://localhost/');
await page.evaluate(() => localStorage.setItem('rotary_token', 't-diag'));

// ⚠️ SIN EL CSS COMPILADO, el arnés monta todo con `display: block` y cualquier
// comprobación de disposición pasa por los motivos equivocados —una clase que
// no llega al CSS no existe, en silencio (v4.719, v4.851)—. Se inyecta si hay
// `dist/`; sin él, las comprobaciones de contenido siguen valiendo.
try {
    const css = readdirSync('dist/assets').find(f => /^index-.*\.css$/.test(f));
    if (css) await page.addStyleTag({ content: readFileSync(`dist/assets/${css}`, 'utf8') });
} catch { /* sin dist: se comprueba el contenido, no el aspecto */ }
await page.addScriptTag({ content: bundle.outputFiles[0].text });
await page.evaluate(() => window.go());
await page.waitForSelector('text=Nueva distribución', { timeout: 15000 });

// ── 1. La vista previa de la publicación ────────────────────────────
grupo('1. Elegir una publicación muestra su vista previa');

await page.getByRole('button', { name: 'Compartir una publicación' }).click();
await page.selectOption('select', { label: 'Distrito 4281 de RI' });
await page.waitForSelector('text=COLOMBIA NOS NECESITA', { timeout: 10000 });

chk('sin elegir nada todavía no hay vista previa',
    (await page.locator('text=Vista previa de la publicación').count()) === 0);

await page.locator('button', { hasText: 'COLOMBIA NOS NECESITA' }).first().click();
await page.waitForSelector('text=Vista previa de la publicación', { timeout: 10000 });
chk('al elegirla aparece la vista previa', true);

const previa = page.locator('div', { has: page.locator('text=Vista previa de la publicación') }).last();
const texto = await previa.innerText();
chk('con el texto ENTERO, no recortado a dos líneas', texto.includes('unimos esfuerzos para apoyar a las familias afectadas'));
chk('con la fecha de la publicación', /2026|14\/8/.test(texto));
chk('y con el enlace a la original en Facebook',
    (await previa.locator('a[href="https://facebook.com/4281/posts/999"]').count()) > 0);
chk('la imagen de la publicación se dibuja',
    await page.evaluate(() => [...document.querySelectorAll('img')].some(i => i.naturalWidth > 0)));
chk('y se explica qué le va a llegar a cada destino', texto.includes('enlace a esta publicación'));

// El enlace elegido tiene que quedar en el campo que se va a distribuir: si no,
// la vista previa sería decorativa.
chk('el enlace queda cargado para distribuir',
    (await page.locator('input[value="https://facebook.com/4281/posts/999"]').count()) > 0);

// Cambiar de publicación cambia la vista previa — sin esto, se elegiría una y
// se distribuiría otra.
await page.locator('button', { hasText: '(sin texto)' }).first().click();
await page.waitForTimeout(300);
chk('elegir otra publicación cambia la vista previa',
    (await page.locator('text=esta publicación no tiene texto').count()) > 0);

// ── 2. Pegar los grupos de una vez ──────────────────────────────────
grupo('2. Los grupos se pegan todos juntos');

// Sin grupos declarados el bloque NACE abierto —es lo que hay que hacer
// primero—, así que no se pulsa: se asegura, que es determinista en los dos
// casos. Pulsar a ciegas lo cerraba.
await page.locator('details').last().evaluate(d => { d.open = true; });
await page.waitForTimeout(200);

const cuerpo = await page.locator('body').innerText();
chk('se explica que Meta no dice en qué grupos está una Página',
    cuerpo.includes('Meta no dice en qué grupos está una Página'));
chk('y se ofrece dónde verlos en Facebook',
    (await page.locator('a[href="https://www.facebook.com/groups/feed/"]').count()) > 0);

await page.locator('textarea').last().fill(
    'Rotary Colombia | https://facebook.com/groups/111\n' +
    'https://facebook.com/groups/222\n' +
    'Clubes Rotarios | https://facebook.com/groups/333'
);
await page.getByRole('button', { name: /Agregar los grupos pegados/ }).click();
await page.waitForTimeout(600);

chk('los tres viajaron al servidor en UNA sola petición', guardado?.groups?.length === 3,
    JSON.stringify(guardado));
chk('con el nombre que se escribió', guardado?.groups?.[0]?.name === 'Rotary Colombia');
chk('y al que iba sin nombre se le dio uno', guardado?.groups?.[1]?.name === 'Grupo 222');
chk('los tres quedan disponibles como destino',
    (await page.locator('text=Clubes Rotarios').count()) > 0);

// ── 3. Sin errores de consola ───────────────────────────────────────
grupo('3. La pantalla no tira errores');
chk('ningún error de página', errores.length === 0, errores.slice(0, 3).join(' | '));

// Una captura, cuando se pide: es más rápido mirar la pantalla que leerla.
if (process.env.SHOT) {
    await page.locator('details').last().evaluate(d => { d.open = false; });
    await page.locator('button', { hasText: 'COLOMBIA NOS NECESITA' }).first().click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: process.env.SHOT, fullPage: false });
}
await browser.close();
console.log(`\n${ok} comprobaciones pasaron${malos.length ? `, ${malos.length} FALLARON:` : '.'}`);
for (const m of malos) console.log(`  ✗ ${m}`);
process.exit(malos.length ? 1 : 0);
