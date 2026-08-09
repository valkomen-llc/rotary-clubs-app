// ════════════════════════════════════════════════════════════════════
// Traer del ecosistema — pruebas de la PANTALLA — v4.747
//
//   npm i --no-save playwright esbuild
//   npm run test:ecosystem:ui
//
// ── POR QUÉ ESTA PRUEBA EXISTE ──────────────────────────────────────
//
// El criterio ya lo cubre `npm run test:ecosystem`, y no alcanza. Es la lección
// que este proyecto pagó dos veces: en v4.744 `pickDistrictSite` era correcto y
// el fallo estaba en el CAMINO, y en v4.717 se verificó cómo se veía la sede en
// la ficha pública sin comprobar que su editor cargara — por eso el defecto
// llegó a producción.
//
// Acá se monta el componente REAL en un navegador con la API interceptada y se
// maneja: buscar, seleccionar, traer. Lo que se comprueba es lo que ninguna
// prueba pura ve — que el componente pinta, que manda al servidor los ids que
// el usuario marcó, y que un evento ya traído no se ofrece dos veces.
// ════════════════════════════════════════════════════════════════════

import { existsSync } from 'node:fs';

let chromium, build;
try {
    ({ chromium } = await import('playwright'));
    ({ build } = await import('esbuild'));
} catch {
    console.log('⚠ Se omite: falta playwright o esbuild.');
    console.log('  npm i --no-save playwright esbuild');
    process.exit(0);
}

const CHROME = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome']
    .find(p => existsSync(p));

let ok = 0; const malos = [];
const check = (n, cond, extra = '') => {
    if (cond) { ok++; console.log(`  ✓ ${n}`); }
    else { malos.push(n); console.log(`  ✗ ${n}${extra ? ` — ${extra}` : ''}`); }
};
const grupo = t => console.log(`\n${t}`);

// ── Lo que devuelve la API, con los tres casos que importan ─────────
const SITES = {
    district: { id: 'd1', number: 4281, name: 'Distrito 4281' },
    sites: [
        { id: 'c1', name: 'RC Cali Norte', city: 'Cali', logo: '', upcoming: 2, badge: { key: 'club', label: 'Club', color: '#2C6FD1' } },
        { id: 'c2', name: 'Feria de Proyectos', city: 'Valledupar', logo: '', upcoming: 1, badge: { key: 'fair', label: 'Feria', color: '#7A55B8' } },
    ],
};

const EVENTS = {
    sites: SITES.sites.map(s => ({ id: s.id, name: s.name, badge: s.badge })),
    events: [
        {
            id: 'e1', title: '70 años del Club Cali Norte',
            startDate: '2026-08-17T19:00:00.000Z', endDate: null,
            location: 'Club Campestre', type: 'Institucional', image: '',
            url: 'https://calinorte.org/eventos/70-anos',
            org: { id: 'c1', name: 'RC Cali Norte', city: 'Cali', logo: '', badge: SITES.sites[0].badge },
            cloneId: null, divergence: null,
        },
        {
            id: 'e2', title: 'Jornada Médica Ladera',
            startDate: '2026-08-22T07:00:00.000Z', endDate: null,
            location: 'Comuna 18', type: 'Servicio', image: '',
            url: 'https://calinorte.org/eventos/jornada',
            org: { id: 'c1', name: 'RC Cali Norte', city: 'Cali', logo: '', badge: SITES.sites[0].badge },
            cloneId: null, divergence: null,
        },
        {
            // Ya traído Y con el original cambiado: tiene que ofrecer actualizar.
            id: 'e3', title: 'XII Feria de Proyectos',
            startDate: '2026-09-04T08:00:00.000Z', endDate: null,
            location: 'Valledupar', type: 'conference', image: '',
            url: 'https://feria.clubplatform.org/eventos/xii-feria',
            org: { id: 'c2', name: 'Feria de Proyectos', city: 'Valledupar', logo: '', badge: SITES.sites[1].badge },
            cloneId: 'clon-1',
            divergence: { missing: false, changed: [{ field: 'startDate', label: 'la fecha de inicio' }] },
        },
    ],
};

const ENTRY = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import EcosystemPicker from '../src/components/admin/events/EcosystemPicker';

window.__done = 0;
window.go = () => {
    createRoot(document.getElementById('root')).render(
        React.createElement(EcosystemPicker, {
            onClose: () => { window.__closed = true; },
            onDone: () => { window.__done += 1; },
        }),
    );
};
`;

const bundle = await build({
    stdin: { contents: ENTRY, resolveDir: 'scripts', loader: 'tsx' },
    bundle: true, write: false, format: 'iife', platform: 'browser',
    jsx: 'automatic', define: { 'import.meta.env.VITE_API_URL': '"/api"' },
});

const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});

/** Monta el componente con la API interceptada. Devuelve la página y el registro de llamadas. */
async function montar({ sites = SITES, events = EVENTS, cloneReply, sitesStatus = 200 } = {}) {
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
    const fallos = [];
    const llamadas = [];
    page.on('pageerror', e => fallos.push(e.message));
    page.on('console', m => {
        if (m.type() !== 'error') return;
        // Un 4xx que el componente SÍ maneja lo registra igual el navegador
        // («Failed to load resource: … 403»). Es ruido del navegador, no un
        // fallo de la página: contarlo haría fallar justo la prueba de que el
        // error se muestra bien. Un error real de JavaScript llega por
        // `pageerror`, que no se filtra.
        if (/Failed to load resource/i.test(m.text())) return;
        fallos.push(`console: ${m.text()}`);
    });

    // El comodín va PRIMERO: Playwright resuelve la ÚLTIMA ruta registrada
    // antes que las anteriores.
    await page.route('**/api/**', r => r.fulfill({ json: {} }));
    await page.route('**/api/district-ecosystem/sites', r => {
        llamadas.push({ url: r.request().url(), method: r.request().method() });
        return r.fulfill({ status: sitesStatus, json: sites });
    });
    await page.route('**/api/district-ecosystem/events*', r => {
        llamadas.push({ url: r.request().url(), method: r.request().method() });
        return r.fulfill({ status: sitesStatus === 200 ? 200 : sitesStatus, json: events });
    });
    await page.route('**/api/district-ecosystem/clone', r => {
        llamadas.push({
            url: r.request().url(), method: r.request().method(),
            body: JSON.parse(r.request().postData() || '{}'),
        });
        return r.fulfill({ json: cloneReply || { created: [{ id: 'n1', title: 'X' }], skipped: [] } });
    });
    await page.route('**/api/district-ecosystem/refresh/**', r => {
        llamadas.push({ url: r.request().url(), method: r.request().method() });
        return r.fulfill({ json: { event: { id: 'clon-1' } } });
    });

    // Hace falta un ORIGEN real: sobre `about:blank` un fetch a `/api/…` no
    // tiene base contra la que resolver y falla antes de salir, con lo cual la
    // prueba pasaría sin haber ejercitado nada.
    await page.route('http://localhost/', r => r.fulfill({
        contentType: 'text/html', body: '<!doctype html><body style="margin:0"><div id="root"></div></body>',
    }));
    await page.goto('http://localhost/');
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    await page.evaluate(() => window.go());
    await page.waitForTimeout(600);

    return { page, fallos, llamadas };
}

// ════════════════════════════════════════════════════════════════════
grupo('── La lista se pinta con lo que devuelve la API ───────');
{
    const { page, fallos, llamadas } = await montar();
    const texto = await page.locator('#root').innerText();

    check('sin errores al montar', fallos.length === 0, fallos.join(' | '));
    check('consulta los sitios y los eventos del ecosistema',
        llamadas.some(l => l.url.includes('/sites')) && llamadas.some(l => l.url.includes('/events')));
    check('nombra el distrito en la cabecera', texto.includes('Distrito 4281'));
    check('aparecen los tres eventos',
        texto.includes('70 años del Club Cali Norte')
        && texto.includes('Jornada Médica Ladera')
        && texto.includes('XII Feria de Proyectos'));
    check('cada evento dice de qué organización es',
        texto.includes('RC Cali Norte') && texto.includes('Feria de Proyectos'));
    check('la etiqueta del tipo de organización se ve', texto.includes('Club') && texto.includes('Feria'));

    // El color va en línea justamente porque una clase de Tailwind armada al
    // vuelo no llega al CSS compilado (v4.719). Se comprueba el color RESUELTO.
    const punto = await page.locator('#root span[style*="background"]').first()
        .evaluate(el => getComputedStyle(el).backgroundColor);
    check('el color de la organización llega de verdad al elemento',
        punto === 'rgb(44, 111, 209)', punto);

    check('el desplegable ofrece filtrar por organización',
        (await page.locator('#root select option').count()) === 3);
    await page.close();
}

grupo('── Un evento ya traído no se ofrece dos veces ─────────');
{
    const { page } = await montar();
    const texto = await page.locator('#root').innerText();

    check('se dice que ya está en la agenda', texto.includes('Ya está en tu agenda'));
    check('hay una casilla por cada evento DISPONIBLE, no por cada evento',
        (await page.locator('#root input[type=checkbox]').count()) === 2);
    check('«seleccionar todos» cuenta sólo los disponibles',
        texto.includes('Seleccionar los 2 disponibles'));

    // Sin esto, el aviso de divergencia sería un callejón: se informa de que el
    // original cambió y no hay nada que hacer al respecto.
    check('si el original cambió, se dice qué cambió',
        texto.includes('En el sitio de origen cambió la fecha de inicio.'));
    check('y se ofrece actualizar', texto.includes('Actualizar desde el origen'));
    await page.close();
}

grupo('── Actualizar desde el origen ─────────────────────────');
{
    const { page, llamadas } = await montar();
    await page.locator('#root button', { hasText: 'Actualizar desde el origen' }).first().click();
    await page.waitForTimeout(400);

    check('llama al endpoint del clon correcto',
        llamadas.some(l => l.method === 'POST' && l.url.includes('/refresh/clon-1')));
    check('avisa al panel para que recargue su lista',
        (await page.evaluate(() => window.__done)) >= 1);
    await page.close();
}

grupo('── El buscador filtra ─────────────────────────────────');
{
    const { page } = await montar();
    await page.locator('#root input[type=text]').fill('jornada');
    await page.waitForTimeout(200);
    let texto = await page.locator('#root').innerText();
    check('deja sólo lo que coincide',
        texto.includes('Jornada Médica') && !texto.includes('70 años del Club'));

    await page.locator('#root input[type=text]').fill('valledupar');
    await page.waitForTimeout(200);
    texto = await page.locator('#root').innerText();
    check('también busca por ciudad de la organización', texto.includes('XII Feria de Proyectos'));

    await page.locator('#root input[type=text]').fill('zzzz');
    await page.waitForTimeout(200);
    texto = await page.locator('#root').innerText();
    check('sin coincidencias se explica y se dice qué hacer',
        texto.includes('Ningún evento coincide') && texto.includes('quitá el filtro'));
    await page.close();
}

grupo('── Traer los seleccionados ────────────────────────────');
{
    const { page, llamadas } = await montar({
        cloneReply: {
            created: [{ id: 'n1', title: '70 años' }, { id: 'n2', title: 'Jornada' }],
            skipped: [{ id: 'e9', title: 'Otro', reason: 'ya estaba en tu agenda' }],
        },
    });

    const boton = page.locator('#root button', { hasText: 'Traer' }).last();
    check('sin nada marcado, el botón está apagado', await boton.isDisabled());

    await page.locator('#root input[type=checkbox]').nth(0).check();
    await page.locator('#root input[type=checkbox]').nth(1).check();
    await page.waitForTimeout(150);

    check('el botón cuenta lo marcado',
        (await boton.innerText()).includes('Traer 2 eventos'));

    await boton.click();
    await page.waitForTimeout(500);

    const envio = llamadas.find(l => l.method === 'POST' && l.url.endsWith('/clone'));
    check('manda al servidor exactamente los ids marcados',
        !!envio && JSON.stringify(envio.body.eventIds.slice().sort()) === JSON.stringify(['e1', 'e2']));

    const texto = await page.locator('#root').innerText();
    check('dice cuántos se trajeron', texto.includes('Se trajeron 2 eventos'));
    check('dice también lo que NO se trajo, con su motivo',
        texto.includes('ya estaba en tu agenda'));
    check('avisa al panel para que recargue', (await page.evaluate(() => window.__done)) >= 1);
    await page.close();
}

grupo('── Estados vacíos y errores ───────────────────────────');
{
    // Un distrito sin sitios vinculados: el vacío tiene que decir POR QUÉ y a
    // quién acudir, no dejar un hueco.
    const { page } = await montar({
        sites: { district: null, sites: [] },
        events: { events: [], sites: [] },
    });
    const texto = await page.locator('#root').innerText();
    check('sin sitios vinculados se explica y se dice quién los vincula',
        texto.includes('Todavía no hay sitios vinculados')
        && texto.includes('operador de la plataforma'));
    await page.close();
}
{
    // Con sitios pero sin eventos próximos: es otra situación y se dice distinto.
    const { page } = await montar({ events: { events: [], sites: [] } });
    const texto = await page.locator('#root').innerText();
    check('con sitios pero sin eventos se dice cuántos se revisaron',
        texto.includes('Se revisaron 2 sitios vinculados'));
    await page.close();
}
{
    const { page, fallos } = await montar({
        sitesStatus: 403,
        sites: { error: 'Esta función es del sitio de un Distrito.' },
        events: { error: 'Esta función es del sitio de un Distrito.' },
    });
    const texto = await page.locator('#root').innerText();
    check('un 403 se muestra con su motivo, no en blanco',
        texto.includes('Esta función es del sitio de un Distrito.'));
    check('y no revienta la pantalla', fallos.length === 0, fallos.join(' | '));
    await page.close();
}
{
    // `?.` en cada eslabón: una respuesta sin `events` no puede tumbar el panel.
    const { page, fallos } = await montar({ sites: {}, events: {} });
    check('una respuesta incompleta no deja el panel en blanco',
        (await page.locator('#root').innerHTML()).length > 500 && fallos.length === 0,
        fallos.join(' | '));
    await page.close();
}

// ════════════════════════════════════════════════════════════════════
// El selector de distritos — v4.748
//
// Es la casilla que permite conectar una Feria, una Zona o un Programa con su
// distrito. Antes era texto libre y por eso no había forma de elegir de una
// lista; el defecto se reportó intentando vincular la Feria de Proyectos.
// ════════════════════════════════════════════════════════════════════
const DISTRITOS = [
    { id: 'd1', number: 4271, name: 'Distrito 4271', countries: ['Colombia'] },
    { id: 'd2', number: 4281, name: 'Distrito 4281', countries: ['Colombia'] },
];

const ENTRY_PICKER = `
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import DistrictPicker from '../src/components/admin/DistrictPicker';

window.go = (inicial) => {
    const App = () => {
        const [v, setV] = useState(inicial || '');
        window.__value = v;
        return React.createElement(DistrictPicker, {
            value: v,
            onChange: (n) => { window.__value = n; setV(n); },
        });
    };
    createRoot(document.getElementById('root')).render(React.createElement(App));
};
`;

const bundlePicker = await build({
    stdin: { contents: ENTRY_PICKER, resolveDir: 'scripts', loader: 'tsx' },
    bundle: true, write: false, format: 'iife', platform: 'browser',
    jsx: 'automatic', define: { 'import.meta.env.VITE_API_URL': '"/api"' },
});

async function montarPicker({ inicial = '', distritos = DISTRITOS, status = 200 } = {}) {
    const page = await browser.newPage({ viewport: { width: 900, height: 900 } });
    const fallos = [];
    page.on('pageerror', e => fallos.push(e.message));
    page.on('console', m => {
        if (m.type() !== 'error') return;
        if (/Failed to load resource/i.test(m.text())) return;
        fallos.push(`console: ${m.text()}`);
    });
    await page.route('**/api/**', r => r.fulfill({ json: {} }));
    await page.route('**/api/admin/districts', r => r.fulfill({ status, json: distritos }));
    await page.route('http://localhost/', r => r.fulfill({
        contentType: 'text/html', body: '<!doctype html><body style="margin:0"><div id="root"></div></body>',
    }));
    await page.goto('http://localhost/');
    await page.addScriptTag({ content: bundlePicker.outputFiles[0].text });
    await page.evaluate((v) => window.go(v), inicial);
    await page.waitForTimeout(500);
    return { page, fallos };
}

grupo('── El selector de distritos ───────────────────────────');
{
    const { page, fallos } = await montarPicker();
    const texto = await page.locator('#root').innerText();
    check('sin errores al montar', fallos.length === 0, fallos.join(' | '));
    check('lista los distritos registrados en la plataforma',
        texto.includes('4271') && texto.includes('4281') && texto.includes('Colombia'));

    await page.locator('#root button', { hasText: '4281' }).first().click();
    await page.waitForTimeout(150);
    check('marcar un distrito lo guarda',
        (await page.evaluate(() => window.__value)) === '4281');

    await page.locator('#root button', { hasText: '4271' }).first().click();
    await page.waitForTimeout(150);
    check('marcar el segundo guarda LOS DOS, separados por coma',
        (await page.evaluate(() => window.__value)) === '4281, 4271');
    await page.close();
}
{
    // Es el caso de producción: la Feria pertenece a los dos distritos.
    const { page } = await montarPicker({ inicial: '4271, 4281' });
    const texto = await page.locator('#root').innerText();
    check('un valor ya guardado se muestra como lo elegido',
        texto.includes('4271') && texto.includes('4281'));

    await page.locator('#root button[aria-label="Quitar el distrito 4271"]').click();
    await page.waitForTimeout(150);
    check('se puede quitar uno sin perder el otro',
        (await page.evaluate(() => window.__value)) === '4281');
    await page.close();
}
{
    // La lista ayuda a escribir; no cierra los valores aceptados (v4.706).
    const { page } = await montarPicker();
    await page.locator('#root input[type=text]').fill('4290');
    await page.locator('#root button', { hasText: 'Agregar' }).click();
    await page.waitForTimeout(200);
    check('se puede agregar un distrito que aún no está registrado',
        (await page.evaluate(() => window.__value)) === '4290');
    check('y se avisa de que todavía no está dado de alta',
        (await page.locator('#root').innerText()).includes('todavía no está registrado'));
    await page.close();
}
{
    const { page, fallos } = await montarPicker({ status: 403 });
    const texto = await page.locator('#root').innerText();
    check('si la lista no carga, la casilla se degrada a texto libre',
        texto.includes('No pudimos cargar la lista')
        && (await page.locator('#root input[placeholder="Ej: 4271, 4281, 4290..."]').count()) === 1);
    check('y no revienta la pantalla', fallos.length === 0, fallos.join(' | '));
    await page.close();
}
{
    const { page } = await montarPicker({ distritos: [] });
    check('sin distritos registrados se explica qué hacer',
        (await page.locator('#root').innerText()).includes('Todavía no hay distritos registrados'));
    await page.close();
}

await browser.close();

console.log(`\n${'─'.repeat(56)}`);
if (malos.length) {
    console.log(`✗ ${malos.length} de ${ok + malos.length} fallaron:\n`);
    for (const m of malos) console.log(`   · ${m}`);
    process.exit(1);
}
console.log(`✓ ${ok} comprobaciones de pantalla, todas bien.\n`);
