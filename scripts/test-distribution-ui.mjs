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
// El panel de grupos filtra y pagina EN EL SERVIDOR: el doble replica eso para
// poder comprobar que «elegir los de esta página» opere sobre lo filtrado.
const TODOS = [
    { rowId: 'r1', key: 'group:g1', targetType: 'group_manual', targetId: 'g1', targetName: 'Rotary Colombia',
      targetUrl: 'https://facebook.com/groups/g1', socialAccountId: 'a1', status: 'verificado', canPublish: true,
      favorite: true, tags: ['Emergencias'], lastPublishedAt: '2026-08-10T12:00:00.000Z' },
    { rowId: 'r2', key: 'group:g2', targetType: 'group_manual', targetId: 'g2', targetName: 'Distrito 4281',
      targetUrl: null, socialAccountId: 'a1', status: 'verificado', canPublish: true,
      favorite: false, tags: ['Distrito'], lastPublishedAt: null },
    { rowId: 'r3', key: 'group:g3', targetType: 'group_manual', targetId: 'g3', targetName: 'Clubes Rotarios',
      targetUrl: null, socialAccountId: null, status: 'sin_verificar', canPublish: false,
      favorite: false, tags: [], lastPublishedAt: null },
];
const ESTADOS = {
    sin_verificar: { label: 'Sin verificar', tone: 'warn', canPublish: false, reason: 'Nadie confirmó todavía que se pueda publicar en este grupo.' },
    verificado: { label: 'Verificado', tone: 'ok', canPublish: true, reason: null },
    sin_permiso: { label: 'Sin permiso', tone: 'fail', canPublish: false, reason: 'x' },
    retirado: { label: 'Retirado', tone: 'off', canPublish: false, reason: 'x' },
};
let ultimaConsulta = null;
await page.route('**/api/distribution/groups?**', async (r) => {
    const url = new URL(r.request().url());
    ultimaConsulta = Object.fromEntries(url.searchParams);
    const q = (url.searchParams.get('q') || '').toLowerCase();
    const filtrados = q ? TODOS.filter(g => g.targetName.toLowerCase().includes(q)) : TODOS;
    return r.fulfill({ json: {
        groups: filtrados, items: filtrados, page: 1, pages: 1, total: filtrados.length,
        totalAll: TODOS.length, verificados: TODOS.filter(g => g.canPublish).length,
        lists: [{ tag: 'Emergencias', count: 1 }, { tag: 'Distrito', count: 1 }],
        states: ESTADOS, providers: {}, notice: 'x',
    } });
});
await page.route('**/api/distribution/groups/import', async (r) => {
    guardado = JSON.parse(r.request().postData() || '{}');
    return r.fulfill({ json: { ok: true, creados: 3, actualizados: 0, format: 'lines', skipped: [] } });
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
// ⚠️ Ahora hay DOS selectores: el de CUENTA (paso 0) y el del origen de la
// publicación a compartir. `page.selectOption('select')` tomaba el primero.
const selectorOrigen = page.locator('select').nth(1);
await selectorOrigen.selectOption({ label: 'Distrito 4281 de RI' });
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

// ── 2. El panel de grupos ───────────────────────────────────────────
grupo('2. El panel de grupos: estado, filtro y selección');

// Un ancla estable: filtrar divs por su contenido resuelve al MÁS INTERNO que
// lo contiene —el de la cabecera—, no al panel entero, y la prueba falla por
// una razón que no tiene que ver con lo que se está probando.
const panel = page.getByTestId('group-picker');
await page.waitForSelector('text=Rotary Colombia', { timeout: 10000 });

const resumen = await panel.innerText();
chk('dice cuántos hay y cuántos están verificados', /3 declarados/.test(resumen) && /2 verificados/.test(resumen));
chk('y cuántos faltan por verificar', /1 sin verificar/.test(resumen));
chk('las listas de distribución se ofrecen', /Emergencias/.test(resumen) && /Distrito/.test(resumen));
chk('se ve cuándo salió lo último de un grupo', /Última publicación/.test(resumen));

// ⚠️ La casilla de un grupo sin verificar está DESHABILITADA: la puerta se
// aplica en el servidor, pero la pantalla no debe invitar a chocarse con ella.
const casillaVetada = page.getByRole('checkbox', { name: 'Elegir: Clubes Rotarios' });
chk('un grupo sin verificar no se puede elegir', await casillaVetada.isDisabled());
chk('y se dice por qué', /Nadie confirmó todavía/.test(resumen));

await page.getByRole('checkbox', { name: 'Elegir: Rotary Colombia' }).check();
await page.waitForTimeout(200);
chk('elegir un grupo lo cuenta en los destinos',
    /1 destinos en total/.test(await page.locator('body').innerText())
    || /1 elegidos/.test(await panel.innerText()));

// «Elegir los de esta página» opera sobre lo FILTRADO y sólo sobre los que
// pueden publicar: seleccionar a ciegas es cómo se publica donde no se quería.
await page.getByRole('button', { name: /Elegir los 2 de esta página/ }).click();
await page.waitForTimeout(200);
chk('«elegir los de esta página» toma sólo los verificados',
    /2 destinos en total|2 elegidos/.test(await page.locator('body').innerText()));

// El filtro viaja al SERVIDOR, no se aplica en la pantalla.
await panel.locator('input[placeholder*="Buscar"]').fill('distrito');
await page.waitForTimeout(600);
chk('la búsqueda viaja al servidor', ultimaConsulta?.q === 'distrito', JSON.stringify(ultimaConsulta));
// Se busca DENTRO del panel: «Distrito 4281» también es el nombre de una
// cuenta en el selector de arriba, y el localizador global resolvía a esa.
await panel.getByText('Distrito 4281', { exact: true }).first().waitFor({ timeout: 5000 });
chk('y la lista se reduce', (await panel.getByText('Rotary Colombia').count()) === 0);
await panel.locator('input[placeholder*="Buscar"]').fill('');
await page.waitForTimeout(600);

// ── 3. Declarar grupos ──────────────────────────────────────────────
grupo('3. Declarar grupos de a muchos');

chk('se advierte que importar NO autoriza',
    /Importar no autoriza nada/.test(await panel.innerText()));

// Con grupos ya declarados el bloque nace CERRADO, y `innerText` no ve lo que
// hay dentro de un <details> plegado: se abre antes de mirar.
await panel.locator('details').first().evaluate(d => { d.open = true; });
await page.waitForTimeout(150);
chk('y se explica que Meta no dice en qué grupos está una cuenta',
    /Meta no dice en qué grupos está una cuenta/.test(await panel.innerText()));
await panel.locator('textarea').last().fill(
    'Rotary Colombia | https://facebook.com/groups/111\n' +
    'https://facebook.com/groups/222\n' +
    'Clubes Rotarios | https://facebook.com/groups/333'
);
await panel.getByRole('button', { name: /Agregar/ }).click();
await page.waitForTimeout(500);
chk('lo pegado viaja al servidor en UNA petición', typeof guardado?.text === 'string', JSON.stringify(guardado));
chk('con las tres líneas', (guardado?.text || '').split('\n').length === 3);

// ── 4. Dos columnas y la cuenta ─────────────────────────────────────
grupo('4. La disposición y el selector de cuenta');

const cuerpoTexto = await page.locator('body').innerText();
chk('hay un selector de cuenta de Facebook', /Cuenta de Facebook/.test(cuerpoTexto));
chk('el tope por vuelta dice a qué NO se aplica',
    /un grupo lo publica una persona/i.test(cuerpoTexto));

// ── 5. Sin errores de consola ───────────────────────────────────────
grupo('5. La pantalla no tira errores');
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
