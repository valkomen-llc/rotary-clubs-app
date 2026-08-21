// ════════════════════════════════════════════════════════════════════
// El Bloque Destacado, en un navegador de verdad — v4.879
//
//   npm run test:spotlight:ui
//
// Por qué hace falta además de `test:spotlight`: aquello prueba el CRITERIO
// —a quién alcanza un slide y en qué orden— y esto prueba la PANTALLA, que
// es donde vive lo que se pidió: que con un solo llamado no aparezca ningún
// control, que con varios se pueda pasar, que el teclado y el arrastre
// funcionen y que el slide oculto no reciba el foco. Es la lección de v4.717
// —se verificó la ficha pública y no el editor— y la de v4.744 —el criterio
// era correcto y el defecto estaba en el camino—.
//
// Monta `SpotlightSection` DE VERDAD, con sus contextos y el CSS compilado.
// Pide `playwright` y `esbuild`; se salta solo si faltan, y también si no hay
// `dist/` (sin CSS las medidas no serían las de la maquetación real).
// ════════════════════════════════════════════════════════════════════

import { existsSync, readFileSync, readdirSync } from 'node:fs';

let ok = 0; const malos = [];
const check = (n, cond, extra = '') => {
    if (cond) { ok++; console.log(`  ✓ ${n}`); }
    else { malos.push(n); console.log(`  ✗ ${n}${extra ? ` — ${extra}` : ''}`); }
};
const grupo = t => console.log(`\n${t}`);

let build, chromium;
try { ({ build } = await import('esbuild')); }
catch { console.log('⚠ Se omite: falta esbuild.  npm i --no-save esbuild'); process.exit(0); }
try { ({ chromium } = await import('playwright')); }
catch { console.log('⚠ Se omite: falta playwright.  npm i --no-save playwright'); process.exit(0); }

// El CSS COMPILADO, no el fuente. Sin él la página se monta con todo en
// bloque y las medidas no son las de la maquetación: la prueba pasaría por
// los motivos equivocados (la lección de v4.851).
const cssFile = existsSync('dist/assets')
    ? readdirSync('dist/assets').find(f => /^index-.*\.css$/.test(f))
    : null;
if (!cssFile) {
    console.log('⚠ Se omite: no hay dist/ compilado.  npm run build');
    process.exit(0);
}
const CSS = readFileSync(`dist/assets/${cssFile}`, 'utf8');

const CHROME = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome']
    .find(p => existsSync(p));
const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});

// Se monta el componente REAL con sus contextos. `MemoryRouter` porque los
// botones internos son `<Link>`; `ClubProvider` porque `useClub` y
// `useCtaButton` lo necesitan.
const ENTRY = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { ClubProvider } from '../src/contexts/ClubContext';
import SpotlightSection from '../src/sections/SpotlightSection';

// El PADDING de arriba no es decorativo: el puntero del navegador arranca en
// (0,0) y, sin zona neutra, cae DENTRO del carrusel — el freno por cursor se
// activa solo y el autoplay no llega a correr nunca. En la portada real este
// bloque va al final, con toda la página por encima.
window.go = () => {
    createRoot(document.getElementById('root')).render(
        React.createElement(MemoryRouter, null,
            React.createElement(ClubProvider, null,
                React.createElement('div', { style: { paddingTop: 300 } },
                    // El hueco donde va el bloque, marcado para poder medirlo:
                    // «no se dibuja» tiene que significar que no ocupa espacio,
                    // no que quede escondido por CSS.
                    React.createElement('div', { 'data-slot': '1' },
                        React.createElement(SpotlightSection, null))))));
};
`;
const bundle = await build({
    stdin: { contents: ENTRY, resolveDir: 'scripts', loader: 'tsx' },
    bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic',
    define: { 'import.meta.env.VITE_API_URL': '"/api"', 'process.env.NODE_ENV': '"production"' },
});

const slide = (id, extra = {}) => ({
    id, name: `Llamado ${id}`, slideType: 'general',
    title: `Título ${id}`, text: `Texto ${id}`,
    image: `https://example.test/${id}.jpg`, imageAlt: `Foto ${id}`,
    imageMobile: '', imageMobileAlt: '',
    buttonText: 'Más información', buttonUrl: '/proyectos', buttonIcon: 'star',
    linkKind: 'url', campaignId: '', openMode: 'auto',
    active: true, priority: 0, startAt: null, endAt: null, publishedAt: null,
    autoplayMs: 3000, targeting: { mode: 'all', districts: [], clubIds: [], excludeClubIds: [] },
    clubId: null, ...extra,
});

/** Pinta la portada con estos slides globales y este bloque local. */
async function pintar(globales, spotlightContent = {}, spotlightImage = '') {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const fallos = [];
    page.on('pageerror', e => fallos.push(e.message));

    // ⚠️ Playwright resuelve la ÚLTIMA ruta registrada primero, así que el
    // comodín va PRIMERO y las concretas después.
    await page.route('**/api/**', r => r.fulfill({ contentType: 'application/json', body: '{}' }));
    await page.route('**/api/clubs/by-domain**', r => r.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ id: 'club-1', name: 'Club de prueba', type: 'club', spotlightContent }),
    }));
    await page.route('**/api/spotlight-slides/active**', r => r.fulfill({
        contentType: 'application/json', body: JSON.stringify({ slides: globales }),
    }));
    // Las imágenes del sitio (Distribución de Imágenes). El hueco `spotlight`
    // es el que alimenta el Bloque Destacado local.
    await page.route('**/api/public/site-images**', r => r.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ spotlight: { url: spotlightImage, alt: 'Local' } }),
    }));
    // Que las fotos no salgan a la red: un PNG de 1×1.
    await page.route('**example.test/**', r => r.fulfill({
        contentType: 'image/png',
        body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'),
    }));

    await page.route('http://localhost/', r => r.fulfill({
        contentType: 'text/html',
        body: `<!doctype html><html><head><style>${CSS}</style></head><body><div id="root"></div></body></html>`,
    }));
    await page.goto('http://localhost/');
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    await page.evaluate(() => window.go());
    await page.waitForTimeout(400);
    return { page, fallos };
}

const seccion = p => p.locator('section[aria-roledescription="carrusel"], section').first();
const flechas = p => p.locator('button[aria-label="Llamado siguiente"]');
const puntos = p => p.locator('button[aria-label^="Ver el llamado"]');
const visible = p => p.locator('[role="group"]:not([aria-hidden="true"])');

// ════════════════════════════════════════════════════════════════════
grupo('── Sin contenido: la sección NO se dibuja ────────────────');
{
    const { page, fallos } = await pintar([], {}, '');
    // Es la regla que hace que desplegar esto no cambie ningún sitio.
    check('sin slides globales y sin bloque local, no hay ninguna sección',
        (await page.locator('section').count()) === 0);
    check('…y no queda un espacio en blanco antes del pie',
        (await page.locator('[data-slot]').evaluate(el => el.getBoundingClientRect().height)) === 0);
    check('sin errores de render', fallos.length === 0, fallos.join(' | '));
    await page.close();
}

// ════════════════════════════════════════════════════════════════════
grupo('── Sólo el Bloque Destacado del sitio: como siempre ──────');
{
    const { page, fallos } = await pintar([], {
        title: 'Acción constante', text: 'Desde 1988…',
        buttonText: 'Más información', buttonUrl: 'https://endpolio.org', icon: 'star',
    }, 'https://example.test/local.jpg');

    check('la sección se dibuja', (await page.locator('section').count()) === 1);
    check('con el título del sitio', await page.getByText('Acción constante').isVisible());
    // Un solo llamado tiene que verse EXACTAMENTE como antes de este módulo.
    check('NO hay flechas', (await flechas(page).count()) === 0);
    check('NO hay puntos', (await puntos(page).count()) === 0);
    check('no se anuncia como carrusel',
        (await page.locator('[aria-roledescription="carrusel"]').count()) === 0);
    check('el botón del sitio se dibuja', await page.getByText('Más información').first().isVisible());
    check('sin errores de render', fallos.length === 0, fallos.join(' | '));
    await page.close();
}

// ════════════════════════════════════════════════════════════════════
grupo('── Un solo slide global: tampoco hay controles ───────────');
{
    const { page } = await pintar([slide('a')], {}, '');
    check('se dibuja el llamado global', await page.getByText('Título a').isVisible());
    check('sigue sin flechas ni puntos',
        (await flechas(page).count()) === 0 && (await puntos(page).count()) === 0);
    await page.close();
}

// ════════════════════════════════════════════════════════════════════
grupo('── Varios: el contenedor se vuelve carrusel ──────────────');
{
    const { page, fallos } = await pintar([slide('a'), slide('b'), slide('c')], {}, '');

    check('se anuncia como carrusel para el lector de pantalla',
        (await page.locator('[aria-roledescription="carrusel"]').count()) === 1);
    check('hay flechas', (await flechas(page).count()) === 1);
    check('hay un punto por llamado', (await puntos(page).count()) === 3);
    check('las tres diapositivas están montadas (para el cruce por opacidad)',
        (await page.locator('[role="group"]').count()) === 3);
    check('sólo UNA está visible para el lector de pantalla',
        (await visible(page).count()) === 1);
    check('la primera es la que manda',
        (await visible(page).getAttribute('aria-label'))?.startsWith('1 de 3'));

    // Un enlace invisible que recibe el foco es de los defectos de
    // accesibilidad más desconcertantes.
    check('los botones de las diapositivas ocultas NO reciben foco',
        (await page.locator('[role="group"][aria-hidden="true"] a[tabindex="-1"], [role="group"][aria-hidden="true"] [tabindex="-1"]').count()) >= 2);

    // ── La flecha ──
    await flechas(page).click();
    await page.waitForTimeout(200);
    check('la flecha pasa al siguiente',
        (await visible(page).getAttribute('aria-label'))?.startsWith('2 de 3'));

    // ── Los puntos ──
    await puntos(page).nth(2).click();
    await page.waitForTimeout(200);
    check('un punto lleva a su llamado',
        (await visible(page).getAttribute('aria-label'))?.startsWith('3 de 3'));
    check('el punto activo se marca con aria-current',
        (await puntos(page).nth(2).getAttribute('aria-current')) === 'true');

    // ── El teclado ──
    await puntos(page).nth(0).click();
    await page.waitForTimeout(150);
    await page.locator('[aria-roledescription="carrusel"]').press('ArrowRight');
    await page.waitForTimeout(200);
    check('la flecha derecha del teclado avanza',
        (await visible(page).getAttribute('aria-label'))?.startsWith('2 de 3'));
    await page.locator('[aria-roledescription="carrusel"]').press('ArrowLeft');
    await page.waitForTimeout(200);
    check('la flecha izquierda retrocede',
        (await visible(page).getAttribute('aria-label'))?.startsWith('1 de 3'));

    check('sin errores de render', fallos.length === 0, fallos.join(' | '));
    await page.close();
}

// ════════════════════════════════════════════════════════════════════
grupo('── El swipe, con el dedo ─────────────────────────────────');
{
    const { page } = await pintar([slide('a'), slide('b'), slide('c')], {}, '');
    const caja = await page.locator('[aria-roledescription="carrusel"]').boundingBox();
    const y = caja.y + caja.height / 2;

    // Arrastrar hacia la IZQUIERDA pasa al siguiente, como cualquier carrusel.
    await page.mouse.move(caja.x + 700, y);
    await page.mouse.down();
    await page.mouse.move(caja.x + 500, y, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(250);
    check('arrastrar a la izquierda pasa al siguiente',
        (await visible(page).getAttribute('aria-label'))?.startsWith('2 de 3'));

    await page.mouse.move(caja.x + 500, y);
    await page.mouse.down();
    await page.mouse.move(caja.x + 700, y, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(250);
    check('arrastrar a la derecha vuelve al anterior',
        (await visible(page).getAttribute('aria-label'))?.startsWith('1 de 3'));

    // Sin esto, bajar por la página con el dedo torcido pasaría de slide.
    await page.mouse.move(caja.x + 600, caja.y + 60);
    await page.mouse.down();
    await page.mouse.move(caja.x + 580, caja.y + 300, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(250);
    check('un gesto sobre todo VERTICAL no cambia de llamado',
        (await visible(page).getAttribute('aria-label'))?.startsWith('1 de 3'));
    await page.close();
}

// ════════════════════════════════════════════════════════════════════
grupo('── Autoplay y sus dos frenos ─────────────────────────────');
{
    const { page } = await pintar([slide('a'), slide('b')], {}, '');
    // El puntero se aparta a la zona neutra de arriba: sobre el carrusel el
    // freno estaría activo y no se estaría midiendo el autoplay.
    await page.mouse.move(640, 100, { steps: 4 });
    await page.waitForTimeout(3600);   // autoplayMs = 3000
    check('pasa solo al siguiente',
        (await visible(page).getAttribute('aria-label'))?.startsWith('2 de 2'));

    // Freno reversible: el cursor encima. Chromium recalcula el hover con los
    // EVENTOS del ratón, así que hay que moverlo de verdad.
    const caja = await page.locator('[aria-roledescription="carrusel"]').boundingBox();
    await page.mouse.move(caja.x + caja.width / 2, caja.y + caja.height / 2, { steps: 4 });
    await page.waitForTimeout(3600);
    check('con el cursor encima se detiene',
        (await visible(page).getAttribute('aria-label'))?.startsWith('2 de 2'));

    await page.mouse.move(640, 100, { steps: 4 });
    await page.waitForTimeout(3600);
    check('…y al salir el cursor vuelve a moverse (el freno es reversible)',
        (await visible(page).getAttribute('aria-label'))?.startsWith('1 de 2'));
    await page.close();
}
{
    const { page } = await pintar([slide('a'), slide('b')], {}, '');
    await puntos(page).nth(0).click();     // gesto explícito
    await page.mouse.move(640, 100, { steps: 4 });
    await page.waitForTimeout(4000);
    // Quien eligió una diapositiva no quiere que se la muevan bajo los ojos.
    check('tras elegir a mano, el autoplay NO vuelve a moverlo',
        (await visible(page).getAttribute('aria-label'))?.startsWith('1 de 2'));
    await page.close();
}

// ════════════════════════════════════════════════════════════════════
grupo('── El bloque local convive con los globales ──────────────');
{
    const { page } = await pintar([slide('a'), slide('b')], {
        title: 'La pieza del sitio', text: 'De siempre', buttonText: 'Ver', buttonUrl: '/x',
    }, 'https://example.test/local.jpg');

    check('se ven los tres: dos globales y el local',
        (await page.locator('[role="group"]').count()) === 3);
    check('los globales van PRIMERO', await page.getByText('Título a').isVisible());
    check('el local va AL FINAL',
        (await puntos(page).nth(2).getAttribute('aria-label'))?.includes('Bloque Destacado del sitio'));
    await page.close();
}

await browser.close();

// ════════════════════════════════════════════════════════════════════
console.log(`\n${'─'.repeat(60)}`);
if (malos.length) {
    console.log(`✗ ${malos.length} fallaron de ${ok + malos.length}:`);
    malos.forEach(m => console.log(`   · ${m}`));
    process.exit(1);
}
console.log(`✓ ${ok} comprobaciones en el navegador, todas bien.`);
