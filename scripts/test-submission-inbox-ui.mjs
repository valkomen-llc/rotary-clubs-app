// ════════════════════════════════════════════════════════════════════════════
// La bandeja de solicitudes, EN UN NAVEGADOR — v4.999
//
// Lo que una prueba de criterio no puede ver: que la pantalla se monte, que
// pinte las filas que el servidor manda, que los filtros LLEGUEN a la petición
// —una dependencia que falta en un `useCallback` no la ve el typecheck, y el
// filtro simplemente no viaja nunca (la lección de `conQr`, v4.836, y de
// `profileId`, v4.838)— y que abrir una solicitud pida SU ficha.
//
// Se salta solo si faltan `playwright` o `esbuild`.
// ════════════════════════════════════════════════════════════════════════════
import { existsSync, readdirSync, readFileSync } from 'node:fs';

// El listado de la bandeja, distinguido de su vecino `/inbox/pending` —el
// contador del encabezado—: los dos empiezan igual, y buscar el prefijo a secas
// devolvía el del icono y daba por ausente el filtro del listado.
const esListado = (u) => /\/submissions\/inbox(\?|$)/.test(String(u));

// ⚠️ SIN EL CSS COMPILADO, UNA MEDIDA DE DISPOSICIÓN PASA POR LOS MOTIVOS
// EQUIVOCADOS (v4.851). Sin él la página se monta con todo en `display: block`:
// las clases están en el DOM y las reglas no existen, así que cualquier ancho
// que se mida es el del contenedor, no el de la maquetación real. Se carga el
// `dist/` de verdad; sin `dist/` esas comprobaciones se saltan solas.
const CSS = (() => {
    try {
        const dir = 'dist/assets';
        const f = readdirSync(dir).find(n => /^index-.*\.css$/.test(n));
        return f ? readFileSync(`${dir}/${f}`, 'utf8') : null;
    } catch { return null; }
})();

let chromium, build;
try {
    ({ chromium } = await import('playwright'));
    ({ build } = await import('esbuild'));
} catch {
    console.log('… se salta: faltan playwright o esbuild (npm i --no-save playwright esbuild)');
    process.exit(0);
}

let ok = 0; const malos = [];
const check = (n, c, extra = '') => {
    if (c) { ok++; console.log('  OK   ', n); }
    else { malos.push(n); console.log('  FALLA', n, extra ? `— ${String(extra).slice(0, 220)}` : ''); }
};

const entry = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import Pantalla from './src/pages/admin/SubmissionsInbox';
import { AuthProvider } from './src/hooks/useAuth';
import { ClubProvider } from './src/contexts/ClubContext';
import { LanguageProvider } from './src/contexts/LanguageContext';
window.go = (ruta) => createRoot(document.getElementById('root')).render(
    React.createElement(MemoryRouter, { initialEntries: [ruta] },
        React.createElement(AuthProvider, null,
            React.createElement(ClubProvider, null,
                React.createElement(LanguageProvider, null,
                    React.createElement(Pantalla))))));
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

const fila = (i, extra = {}) => ({
    id: `s-${i}`, campaignId: 'c-terremoto', campaignName: 'Emergencia Terremoto Colombia 2026',
    status: 'recibido', assignee: null,
    senderName: `Rotario ${i}`, senderEmail: `r${i}@club.org`, club: 'Club Rotario Cali',
    district: '4281', city: 'Cali', title: `Entrega de mercados ${i}`,
    createdAt: '2026-08-14T10:00:00Z', activityDate: '2026-08-12',
    originClubId: 'club-4281', originClubName: 'Distrito 4281',
    imageCount: 3, videoCount: 1, promotedCount: 0, usage: {}, clubs: [], posts: [],
    ...extra,
});

const PENDIENTES = {
    count: 12,
    items: [
        { id: 's-0', campaignId: 'c-terremoto', title: 'Entrega de mercados 0', club: 'Club Rotario Cali', campaignName: 'Emergencia Terremoto Colombia 2026' },
        { id: 's-1', campaignId: 'c-terremoto', title: 'Jornada de salud', club: 'Club Rotario Pasto', campaignName: 'Emergencia Terremoto Colombia 2026' },
    ],
};

const abrir = async (ruta, { total = 15, scope = 'site', pendientes = PENDIENTES, ancho = 1440 } = {}) => {
    const page = await browser.newPage({ viewport: { width: ancho, height: 1000 } });
    const errores = [];
    const pedidos = [];
    page.on('pageerror', e => errores.push(`PAGEERROR: ${e.message}`));
    page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errores.push(m.text().slice(0, 200)); });

    await page.route('**/api/**', r => { pedidos.push(r.request().url()); return r.fulfill({ json: {} }); });
    await page.route('**/api/clubs/by-domain*', r => r.fulfill({ json: { id: 'club-4281', name: 'Distrito 4281', settings: [] } }));
    await page.route('**/api/contribution-campaigns/submissions/inbox*', r => {
        pedidos.push(r.request().url());
        const u = new URL(r.request().url());
        const filtrada = [...u.searchParams.keys()].some(k => k !== 'page');
        const n = filtrada && u.searchParams.get('estado') === 'aprobado' ? 3 : total;
        return r.fulfill({
            json: {
                scope, siteScoped: scope !== 'platform',
                submissions: Array.from({ length: Math.min(n, 50) }, (_, i) => fila(i)),
                total: n, page: 1, perPage: 50,
                resumen: { total, pendientes: 15, abiertas: 15, porEstado: { recibido: 15 } },
                tabs: [
                    { id: 'recibido', label: 'Recibido', n: 15, pending: true },
                    { id: 'aprobado', label: 'Aprobado', n: 3, pending: false },
                ],
                facets: {
                    campanas: [{ id: 'c-terremoto', label: 'Emergencia Terremoto Colombia 2026' }],
                    sitios: [{ id: 'club-4281', label: 'Distrito 4281' }],
                    distritos: ['4281'], responsables: ['Ana Gómez'],
                },
                filtrada, descartados: [],
            },
        });
    });
    // El icono del encabezado (v4.1005). Se registra DESPUÉS de la bandeja:
    // Playwright resuelve la ÚLTIMA ruta declarada primero, así que puesta
    // antes la taparía `**/submissions/inbox*` y el icono no recibiría nada.
    await page.route('**/api/contribution-campaigns/submissions/inbox/pending*', r => {
        pedidos.push(r.request().url());
        return r.fulfill({ json: pendientes });
    });
    await page.route('**/api/contribution-campaigns/c-terremoto/submissions/s-0', r => {
        pedidos.push(r.request().url());
        return r.fulfill({
            json: {
                submission: fila(0), files: [], events: [], usage: {},
                nextStates: [{ id: 'en_revision', label: 'En revisión' }], clubs: [], posts: [],
            },
        });
    });

    // ⚠️ ORIGEN REAL. Sobre `about:blank` —lo que deja `setContent`— no hay
    // origen: `localStorage` LANZA y una dirección relativa no tiene base
    // contra la que resolverse, así que la petición no sale y la prueba
    // pasaría sin haber ejercitado nada (la lección de v4.720).
    await page.route('http://localhost/', r => r.fulfill({
        contentType: 'text/html', body: '<!doctype html><body><div id="root"></div></body>',
    }));
    await page.goto('http://localhost/');
    if (CSS) await page.addStyleTag({ content: CSS });
    await page.evaluate(() => {
        localStorage.setItem('rotary_token', 't-diag');
        localStorage.setItem('rotary_user', JSON.stringify({ id: 'u', role: 'district_admin', clubId: 'club-4281' }));
    });
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    await page.evaluate((ru) => window.go(ru), ruta);
    await page.waitForTimeout(700);
    return { page, errores, pedidos, texto: () => page.locator('#root').innerText() };
};

console.log('\n▸ La bandeja se abre y pinta lo que manda el servidor');
{
    const { page, errores, pedidos, texto } = await abrir('/admin/campanas-contribucion/solicitudes');
    const t = await texto();
    check('se monta sin reventar', t.length > 100, t.slice(0, 200));
    check('el título es «Solicitudes de contenido»', /solicitudes de contenido/i.test(t));
    check('pide la bandeja transversal, no la de una campaña',
        pedidos.some(esListado), pedidos.slice(0, 6).join(' | '));
    check('pinta las filas que el servidor mandó', /Rotario 0/.test(t) && /Rotario 9/.test(t));
    check('⚠️ dice cuántas se ven de cuántas hay', /mostrando 15 de 15/i.test(t), t.slice(0, 700));
    check('…y cuántas están sin revisar', /15 sin revisar/i.test(t), t.slice(0, 700));
    check('el sitio ve declarado su alcance', /campañas que tu sitio publica/i.test(t));
    check('las pestañas de estado se pintan con su cuenta', /recibido/i.test(t) && /aprobado/i.test(t));
    check('sin errores en consola', errores.length === 0, errores.join(' | '));
    await page.close();
}

console.log('\n▸ ⚠️ Los filtros LLEGAN a la petición');
{
    const { page, pedidos, texto } = await abrir('/admin/campanas-contribucion/solicitudes');
    pedidos.length = 0;
    await page.locator('button', { hasText: 'APROBADO' }).first().click();
    await page.waitForTimeout(500);
    const pedido = pedidos.find(esListado);
    check('⚠️ pulsar una pestaña manda el estado al SERVIDOR',
        !!pedido && /estado=aprobado/.test(pedido), pedido || '(ninguna petición)');
    const t = await texto();
    check('…y la vista dice que está filtrada', /filtrada/i.test(t), t.slice(0, 600));
    await page.close();
}

{
    const { page, pedidos } = await abrir('/admin/campanas-contribucion/solicitudes');
    pedidos.length = 0;
    await page.locator('input[placeholder^="Buscar por nombre"]').fill('Ana');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);
    const pedido = pedidos.find(u => esListado(u) && /q=Ana/.test(u));
    check('⚠️ la búsqueda llega al servidor', !!pedido, pedidos.slice(0, 4).join(' | '));
    await page.close();
}

console.log('\n▸ ⚠️ La dirección con ?campana= abre la bandeja YA FILTRADA');
{
    const { page, pedidos } = await abrir('/admin/campanas-contribucion/solicitudes?campana=c-terremoto');
    const pedido = pedidos.find(esListado);
    check('⚠️ el filtro de la URL viaja en la primera petición',
        !!pedido && /campana=c-terremoto/.test(pedido), pedido || '(ninguna)');
    await page.close();
}

console.log('\n▸ Abrir una solicitud pide SU ficha');
{
    const { page, pedidos, texto } = await abrir('/admin/campanas-contribucion/solicitudes');
    pedidos.length = 0;
    await page.locator('td', { hasText: 'Rotario 0' }).first().click();
    await page.waitForTimeout(600);
    check('⚠️ la ficha se pide por la ruta de la CAMPAÑA (donde vive la puerta)',
        pedidos.some(u => /\/contribution-campaigns\/c-terremoto\/submissions\/s-0/.test(u)),
        pedidos.slice(0, 5).join(' | '));
    const t = await texto();
    check('…y se pinta el detalle', /Rotario 0/.test(t) && /r0@club\.org/.test(t), t.slice(0, 400));
    check('con las acciones que el servidor autorizó', /en revisión/i.test(t), t.slice(0, 900));
    check('y la acción de asignar responsable', /responsable/i.test(t));
    await page.close();
}

console.log('\n▸ Un vacío se explica; no se confunde con un módulo roto');
{
    const { page, texto } = await abrir('/admin/campanas-contribucion/solicitudes', { total: 0 });
    const t = await texto();
    check('sin solicitudes se dice, y no se pinta una tabla vacía',
        /todavía no ha llegado ninguna solicitud/i.test(t), t.slice(0, 600));
    await page.close();
}

console.log('\n▸ No hay desplazamiento horizontal accidental');
{
    for (const w of [1440, 900, 420]) {
        const page = await browser.newPage({ viewport: { width: w, height: 900 } });
        await page.route('**/api/**', r => r.fulfill({ json: {} }));
        await page.route('**/api/clubs/by-domain*', r => r.fulfill({ json: { id: 'club-4281', name: 'Distrito 4281', settings: [] } }));
        await page.route('**/api/contribution-campaigns/submissions/inbox*', r => r.fulfill({
            json: {
                scope: 'site', siteScoped: true,
                submissions: Array.from({ length: 5 }, (_, i) => fila(i)),
                total: 5, page: 1, perPage: 50,
                resumen: { total: 5, pendientes: 5, abiertas: 5, porEstado: { recibido: 5 } },
                tabs: [{ id: 'recibido', label: 'Recibido', n: 5, pending: true }],
                facets: { campanas: [], sitios: [], distritos: [], responsables: [] },
                filtrada: false, descartados: [],
            },
        }));
        await page.route('http://localhost/', r => r.fulfill({
            contentType: 'text/html', body: '<!doctype html><body><div id="root"></div></body>',
        }));
        await page.goto('http://localhost/');
        await page.evaluate(() => localStorage.setItem('rotary_token', 't-diag'));
        await page.addScriptTag({ content: bundle.outputFiles[0].text });
        await page.evaluate(() => window.go('/admin/campanas-contribucion/solicitudes'));
        await page.waitForTimeout(600);
        // ⚠️ La tabla ancha va dentro de su PROPIO contenedor con desplazamiento:
        // el cuerpo de la página nunca se desplaza a lo ancho (regla de v4.964).
        const desborde = await page.evaluate(() =>
            document.documentElement.scrollWidth - document.documentElement.clientWidth);
        check(`a ${w}px el cuerpo no se desplaza a lo ancho`, desborde <= 1, `desborde=${desborde}`);
        await page.close();
    }
}

console.log('\n▸ ⚠️ EL ICONO DEL ENCABEZADO (v4.1005)');
{
    const { page, pedidos, errores } = await abrir('/admin/campanas-contribucion/solicitudes');
    const icono = page.locator('button[aria-label="Solicitudes de contenido recibidas"]');
    check('el icono se pinta junto a la campana y a los mensajes', await icono.count() === 1);
    check('⚠️ …y pide su contador al servidor',
        pedidos.some(u => /\/submissions\/inbox\/pending/.test(u)), pedidos.slice(0, 6).join(' | '));
    check('el badge lleva el número de las que están sin revisar',
        /12/.test(await icono.innerText()), await icono.innerText());

    // El orden importa: los tres iconos miden cosas distintas y estar en el
    // mismo sitio es lo que hace que se lean como una familia.
    const orden = await page.evaluate(() => {
        const caja = (sel) => { const e = document.querySelector(sel); return e ? e.getBoundingClientRect().left : null; };
        return {
            campana: caja('button[aria-label="Borradores de noticia por revisar"]'),
            solicitudes: caja('button[aria-label="Solicitudes de contenido recibidas"]'),
            mensajes: caja('a[title="Mensajes de formulario de contacto"]'),
        };
    });
    check('va entre la campana y los mensajes',
        orden.campana !== null && orden.solicitudes !== null && orden.mensajes !== null
        && orden.campana < orden.solicitudes && orden.solicitudes < orden.mensajes,
        JSON.stringify(orden));

    await icono.click();
    await page.waitForTimeout(200);
    const desplegado = await page.locator('#root').innerText();
    check('al abrirlo se ven las últimas que llegaron',
        /Entrega de mercados 0/.test(desplegado) && /Jornada de salud/.test(desplegado),
        desplegado.slice(0, 400));
    check('…y la salida a la bandeja dice cuántas hay',
        /ver las 12 en la bandeja/i.test(desplegado), desplegado.slice(0, 500));
    check('sin errores en consola', errores.length === 0, errores.join(' | '));
    await page.close();
}

console.log('\n▸ ⚠️ Un contador que no se pudo medir NO se pinta como cero');
{
    const { page } = await abrir('/admin/campanas-contribucion/solicitudes',
        { pendientes: { count: 0, items: [], error: 'la base no contestó' } });
    const icono = page.locator('button[aria-label="Solicitudes de contenido recibidas"]');
    check('no se pinta ningún badge', !/\d/.test(await icono.innerText()), await icono.innerText());
    await icono.click();
    await page.waitForTimeout(200);
    const t = await page.locator('#root').innerText();
    check('⚠️ se DICE que no se pudo leer, en vez de «no hay ninguna»',
        /no se pudo leer el contador/i.test(t) && !/no hay solicitudes esperando/i.test(t), t.slice(0, 400));
    await page.close();
}

console.log('\n▸ ⚠️ EL ANCHO: la bandeja ocupa la pantalla, no una columna centrada');
if (!CSS) {
    console.log('  … se salta: falta `dist/` compilado (npm run build)');
} else {
    // ⚠️ SE MIDE EN UNA PANTALLA ANCHA, que es donde el defecto se ve. El tope
    // que sobraba es `max-w-7xl` (1.280 px): a 1.440 de ventana el área útil
    // ronda los 1.150 y el tope ni siquiera llega a actuar, así que la medida
    // pasaría con el defecto delante — es lo que destapó la verificación a la
    // inversa, no la lectura. A 1.920 la diferencia es de más de 300 px.
    const { page } = await abrir('/admin/campanas-contribucion/solicitudes', { ancho: 1920 });
    const m = await page.evaluate(() => {
        const cab = [...document.querySelectorAll('h1')].find(h => /solicitudes de contenido/i.test(h.textContent || ''));
        // El contenedor con desplazamiento vertical del panel: es el que
        // impone el ancho útil, y dentro de él va (o no) el tope.
        let scroller = cab;
        while (scroller && !/overflow-y-auto/.test(scroller.className || '')) scroller = scroller.parentElement;
        // ⚠️ SE MIDE EL HIJO DIRECTO DEL CONTENEDOR CON DESPLAZAMIENTO, que
        // es donde vive (o no) el tope. `closest('.bg-white')` trepaba hasta el
        // `<main>` —que también es blanco— y devolvía el ancho del área
        // entera: la comprobación pasaba por el motivo equivocado.
        const contenido = scroller ? scroller.firstElementChild : null;
        return {
            util: scroller ? scroller.clientWidth : null,
            cabecera: contenido ? contenido.getBoundingClientRect().width : null,
        };
    });
    // ⚠️ SE MIDE EL BORDE QUE SE REPORTÓ, no la clase. Antes de v4.1005 el
    // contenido quedaba en 1.280 px dentro de un área de ~1.220-1.400 y con
    // 72 px de aire a cada lado: la tabla de seis columnas se apretaba en el
    // medio de una pantalla ancha. Se exige que el contenido use casi todo lo
    // que hay — con un margen de tolerancia por el relleno que SÍ queda.
    check('⚠️ el contenido usa el ancho disponible (no queda una columna centrada)',
        m.util !== null && m.cabecera !== null && m.cabecera >= m.util - 60,
        `util=${m.util} contenido=${m.cabecera}`);
    check('…y sigue habiendo algo de aire a los lados', m.cabecera < m.util, `util=${m.util} contenido=${m.cabecera}`);
    await page.close();
}

await browser.close();
console.log('\n' + '─'.repeat(60));
if (malos.length) {
    console.log(`❌ ${ok + malos.length} comprobaciones, ${malos.length} fallo(s).`);
    for (const m of malos) console.log('   ·', m);
    process.exit(1);
}
console.log(`✅ ${ok} comprobaciones, 0 fallo(s).`);
