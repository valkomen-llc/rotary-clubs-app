// ════════════════════════════════════════════════════════════════════
// Los bloques de la página pública de Proyectos — v4.750
//
//   npm run test:projects-page
//
// Qué se comprueba: el CRITERIO —qué se enciende y qué no— y, en un navegador,
// que la página REALMENTE no dibuje lo apagado y que el interruptor del panel
// guarde lo que el usuario marcó.
//
// Por qué las dos cosas: el criterio es una función de cinco líneas y aun así
// lo que falla en este tipo de cambio no es la función, es el CAMINO —que la
// página lea de un sitio y el panel escriba en otro, o que el interruptor
// muestre encendido lo que la página pinta apagado—. Es la lección de v4.744.
//
// La parte pura no necesita nada. La de navegador pide `playwright` y
// `esbuild` y se salta sola si no están.
// ════════════════════════════════════════════════════════════════════

import { existsSync } from 'node:fs';

let ok = 0; const malos = [];
const check = (n, cond, extra = '') => {
    if (cond) { ok++; console.log(`  ✓ ${n}`); }
    else { malos.push(n); console.log(`  ✗ ${n}${extra ? ` — ${extra}` : ''}`); }
};
const grupo = t => console.log(`\n${t}`);
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

let build, chromium;
try {
    ({ build } = await import('esbuild'));
} catch {
    console.log('⚠ Se omite: falta esbuild.  npm i --no-save esbuild');
    process.exit(0);
}

const out = await build({
    entryPoints: ['src/lib/projectsPageLayout.ts'],
    bundle: true, write: false, format: 'esm', platform: 'neutral',
});
const spec = await import(`data:text/javascript,${encodeURIComponent(out.outputFiles[0].text)}`);

// ════════════════════════════════════════════════════════════════════
grupo('── Qué se enciende y qué no ───────────────────────────');

// Los dos venían escritos en el código para TODOS los sitios, y el de cifras
// publica números inventados. Encenderlos es una decisión de cada sitio.
check('los dos bloques nacen APAGADOS',
    eq(spec.PROJECTS_LAYOUT_DEFAULTS, { hero: false, stats: false }));
check('sin nada guardado, nada se enciende',
    eq(spec.normalizeProjectsLayout(null), { hero: false, stats: false }));
check('un objeto vacío tampoco enciende nada',
    eq(spec.normalizeProjectsLayout({}), { hero: false, stats: false }));

check('lo guardado se respeta',
    eq(spec.normalizeProjectsLayout({ hero: true, stats: false }), { hero: true, stats: false }));
check('los dos se pueden encender',
    eq(spec.normalizeProjectsLayout({ hero: true, stats: true }), { hero: true, stats: true }));
check('sólo las cifras, sin la portada, es una combinación válida',
    eq(spec.normalizeProjectsLayout({ stats: true }), { hero: false, stats: true }));

// El almacenamiento de secciones ha guardado booleanos como texto.
check('la cadena "true" enciende',
    spec.normalizeProjectsLayout({ hero: 'true' }).hero === true);
check('la cadena "false" NO enciende',
    spec.normalizeProjectsLayout({ hero: 'false' }).hero === false);

// Ante la duda no se publica algo que el sitio no eligió publicar.
for (const raw of [1, 'sí', {}, [], 'on', null, undefined, 'basura']) {
    check(`un valor que no es \`true\` deja apagado — ${JSON.stringify(raw)}`,
        spec.normalizeProjectsLayout({ hero: raw }).hero === false);
}
check('una entrada que no es objeto no revienta',
    eq(spec.normalizeProjectsLayout('cualquier cosa'), { hero: false, stats: false })
    && eq(spec.normalizeProjectsLayout(42), { hero: false, stats: false }));

grupo('── Los interruptores del panel ────────────────────────');
check('hay un interruptor por bloque, y sólo por bloque',
    spec.PROJECTS_LAYOUT_BLOCKS.length === 2);
check('cada uno apunta a una clave real del criterio',
    spec.PROJECTS_LAYOUT_BLOCKS.every(b => b.key in spec.PROJECTS_LAYOUT_DEFAULTS));
check('cada uno se explica: un interruptor sin texto no dice qué apaga',
    spec.PROJECTS_LAYOUT_BLOCKS.every(b => b.label && b.help && b.help.length > 20));
// Que las cifras son de ejemplo tiene que estar DICHO donde se encienden: si
// no, alguien las publica creyendo que salen de sus proyectos.
check('el de las cifras avisa de que no salen de los proyectos del sitio',
    /ejemplo|no salen/i.test(spec.PROJECTS_LAYOUT_BLOCKS.find(b => b.key === 'stats').help));

// ════════════════════════════════════════════════════════════════════
try {
    ({ chromium } = await import('playwright'));
} catch {
    console.log('\n⚠ Se omite la parte de navegador: falta playwright.');
}

if (chromium) {
    const CHROME = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome']
        .find(p => existsSync(p));
    const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});

    // ── La página pública ────────────────────────────────────────────
    const ENTRY_PAGE = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { normalizeProjectsLayout } from '../src/lib/projectsPageLayout';

// Reproduce la CONDICIÓN de la página con el mismo criterio. Lo que se prueba
// acá es que apagado signifique NO DIBUJADO, no que quede oculto por CSS: un
// bloque escondido con \`hidden\` sigue en el documento y lo leen el lector de
// pantalla y los buscadores.
window.go = (guardado) => {
    const layout = normalizeProjectsLayout(guardado);
    createRoot(document.getElementById('root')).render(
        React.createElement('div', null,
            (layout.hero || layout.stats) && React.createElement('section', { 'data-hero-section': '1' },
                layout.hero && React.createElement('h1', { 'data-hero': '1' }, 'Transformando Vidas, Un Proyecto a la Vez'),
                layout.stats && React.createElement('div', { 'data-stats': '1' }, '150+ Proyectos Completados'),
            ),
            React.createElement('section', { 'data-lista': '1' }, 'Proyectos que Necesitan tu Apoyo'),
        ),
    );
};
`;
    const bundlePage = await build({
        stdin: { contents: ENTRY_PAGE, resolveDir: 'scripts', loader: 'tsx' },
        bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic',
    });

    async function pintar(guardado) {
        const page = await browser.newPage();
        const fallos = [];
        page.on('pageerror', e => fallos.push(e.message));
        await page.route('http://localhost/', r => r.fulfill({
            contentType: 'text/html', body: '<!doctype html><body><div id="root"></div></body>',
        }));
        await page.goto('http://localhost/');
        await page.addScriptTag({ content: bundlePage.outputFiles[0].text });
        await page.evaluate((g) => window.go(g), guardado);
        await page.waitForTimeout(200);
        return { page, fallos };
    }

    grupo('── La página, en el navegador ─────────────────────────');
    {
        const { page, fallos } = await pintar(null);
        check('sin configurar, la portada NO está en el documento',
            (await page.locator('[data-hero]').count()) === 0);
        check('sin configurar, las cifras tampoco',
            (await page.locator('[data-stats]').count()) === 0);
        check('con los dos apagados no queda una sección vacía donde estaban',
            (await page.locator('[data-hero-section]').count()) === 0);
        check('los proyectos se siguen mostrando: es lo que la página existe para mostrar',
            (await page.locator('[data-lista]').count()) === 1);
        check('sin errores', fallos.length === 0, fallos.join(' | '));
        await page.close();
    }
    {
        const { page } = await pintar({ hero: true, stats: false });
        check('encendiendo sólo la portada, aparece la portada',
            (await page.locator('[data-hero]').count()) === 1);
        check('y las cifras siguen sin aparecer',
            (await page.locator('[data-stats]').count()) === 0);
        await page.close();
    }
    {
        const { page } = await pintar({ hero: true, stats: true });
        check('con los dos encendidos aparecen los dos',
            (await page.locator('[data-hero]').count()) === 1
            && (await page.locator('[data-stats]').count()) === 1);
        await page.close();
    }

    // ── El interruptor del panel ─────────────────────────────────────
    const ENTRY_PANEL = `
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { PROJECTS_LAYOUT_BLOCKS, normalizeProjectsLayout } from '../src/lib/projectsPageLayout';

// El panel real trae 2.000 líneas de proyectos; lo que se prueba acá es la
// tarjeta: que muestre el estado guardado y que al marcar mande al servidor
// EXACTAMENTE lo que el usuario marcó.
window.go = (guardado) => {
    const App = () => {
        const [layout, setLayout] = useState(() => normalizeProjectsLayout(guardado));
        const save = async (key, value) => {
            const next = { ...layout, [key]: value };
            setLayout(next);
            await fetch('/api/admin/sections/batch-upsert', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ clubId: 'c1', sections: [{ page: 'proyectos', section: 'layout', content: next }] }),
            });
        };
        return React.createElement('div', null, PROJECTS_LAYOUT_BLOCKS.map(b =>
            React.createElement('label', { key: b.key },
                React.createElement('input', {
                    type: 'checkbox', 'aria-label': b.label,
                    checked: layout[b.key],
                    onChange: (e) => save(b.key, e.target.checked),
                }),
                b.label, ' — ', b.help,
            )));
    };
    createRoot(document.getElementById('root')).render(React.createElement(App));
};
`;
    const bundlePanel = await build({
        stdin: { contents: ENTRY_PANEL, resolveDir: 'scripts', loader: 'tsx' },
        bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic',
    });

    grupo('── El interruptor del panel ───────────────────────────');
    {
        const page = await browser.newPage();
        const enviados = [];
        const fallos = [];
        page.on('pageerror', e => fallos.push(e.message));
        await page.route('**/api/admin/sections/batch-upsert', r => {
            enviados.push(JSON.parse(r.request().postData() || '{}'));
            return r.fulfill({ json: { ok: true } });
        });
        await page.route('http://localhost/', r => r.fulfill({
            contentType: 'text/html', body: '<!doctype html><body><div id="root"></div></body>',
        }));
        await page.goto('http://localhost/');
        await page.addScriptTag({ content: bundlePanel.outputFiles[0].text });
        await page.evaluate(() => window.go(null));
        await page.waitForTimeout(200);

        const texto = await page.locator('#root').innerText();
        check('los dos interruptores se ven, con su explicación',
            texto.includes('Portada de impacto') && texto.includes('Cifras de impacto'));
        check('avisa de que las cifras son de ejemplo',
            /ejemplo|no salen/i.test(texto));
        check('sin nada guardado, los dos aparecen apagados',
            (await page.locator('#root input:checked').count()) === 0);

        await page.locator('#root input[aria-label="Cifras de impacto"]').check();
        await page.waitForTimeout(300);

        const enviado = enviados.at(-1);
        check('al marcar se guarda en page «proyectos», section «layout»',
            enviado?.sections?.[0]?.page === 'proyectos' && enviado?.sections?.[0]?.section === 'layout');
        check('y se manda EXACTAMENTE lo marcado, sin encender el otro',
            eq(enviado?.sections?.[0]?.content, { hero: false, stats: true }));
        check('sin errores', fallos.length === 0, fallos.join(' | '));
        await page.close();
    }

    await browser.close();
}

// ════════════════════════════════════════════════════════════════════
console.log(`\n${'─'.repeat(56)}`);
if (malos.length) {
    console.log(`✗ ${malos.length} de ${ok + malos.length} fallaron:\n`);
    for (const m of malos) console.log(`   · ${m}`);
    process.exit(1);
}
console.log(`✓ ${ok} comprobaciones, todas bien.\n`);
