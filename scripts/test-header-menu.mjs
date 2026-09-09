// ════════════════════════════════════════════════════════════════════
// Qué se ve en el menú principal — v4.1022
//
//   npm run test:header-menu
//
// Tres capas, como el botón flotante:
//
//   1. EL CRITERIO — qué se guarda, qué se pinta y qué pasa en los bordes.
//   2. EL CABLEADO, leyendo los archivos. Es lo único que ve que el `Navbar`
//      siga leyendo el criterio en vez de su lista de siempre, y que el ajuste
//      esté en la lista de `by-domain` — sin eso se guarda y el sitio público
//      no lo ve nunca (v4.993).
//   3. LA PANTALLA, en un navegador: apagar una entrada y comprobar que el
//      desplegable REAL deja de pintarla.
//
// El criterio pide `esbuild`; el navegador, además `playwright` y `dist/`.
// ════════════════════════════════════════════════════════════════════

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

let ok = 0; const malos = [];
const check = (n, cond, extra = '') => {
    if (cond) { ok++; console.log(`  ✓ ${n}`); }
    else { malos.push(n); console.log(`  ✗ ${n}${extra ? ` — ${extra}` : ''}`); }
};
const grupo = t => console.log(`\n${t}`);
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** El archivo sin comentarios: una regla no puede fallar contra su propia
 *  explicación (la lección de v4.991 y de v4.1005). */
const codigo = (ruta) => readFileSync(ruta, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const NAVBAR = 'src/sections/Navbar.tsx';
const PANEL = 'src/pages/admin/ClubSettings.tsx';
const RUTAS = 'server/routes/clubs.js';
const CONTROLLER = 'server/controllers/clubController.js';

let build, chromium;
try { ({ build } = await import('esbuild')); }
catch { console.log('⚠ Se omite el criterio: falta esbuild.  npm i --no-save esbuild'); }

let spec = null;
if (build) {
    const out = await build({
        entryPoints: ['src/lib/headerMenu.ts'],
        bundle: true, write: false, format: 'esm', platform: 'neutral', logLevel: 'silent',
    });
    spec = await import(`data:text/javascript,${encodeURIComponent(out.outputFiles[0].text)}`);
}
const servidor = await import('../server/lib/headerMenu.js');

if (spec) {
    grupo('── Todo nace VISIBLE: el ajuste es aditivo ───────────────');

    // Es lo que hace que desplegar esto no cambie ningún menú.
    for (const raw of [null, undefined, {}, [], 'basura', 0]) {
        check(`sin nada guardado no se apaga nada — ${JSON.stringify(raw)}`,
            eq(spec.normalizeAboutMenu(raw), {}));
    }
    check('una clave ausente se lee como visible',
        spec.aboutItemEnabled('rotaract', {}) === true);
    check('y con el ajuste nulo también',
        spec.aboutItemEnabled('rotaract', null) === true);

    // Sólo se guarda lo APAGADO: escribir los `true` sería guardar el valor por
    // omisión y volver el ajuste ilegible cuando el catálogo crezca.
    check('encender NO deja rastro en el ajuste',
        eq(spec.normalizeAboutMenu({ rotaract: true, interact: true }), {}));
    check('apagar sí', eq(spec.normalizeAboutMenu({ rotaract: false }), { rotaract: false }));
    check('la cadena "false" también apaga',
        eq(spec.normalizeAboutMenu({ rotaract: 'false' }), { rotaract: false }));
    for (const raw of [0, '', 'no', null]) {
        check(`ante la duda se MUESTRA — ${JSON.stringify(raw)}`,
            eq(spec.normalizeAboutMenu({ rotaract: raw }), {}));
    }

    grupo('── El catálogo es CERRADO ────────────────────────────────');

    check('una clave inventada no se guarda',
        eq(spec.normalizeAboutMenu({ inventado: false, rotaract: false }), { rotaract: false }));
    // Las especiales NO viven en este ajuste: su dato está en su propio campo
    // del sitio y duplicarlo daría dos verdades sobre el mismo enlace.
    for (const k of ['honorary', 'governor', 'author']) {
        check(`la categoría especial «${k}» NO entra en el ajuste`,
            !spec.ABOUT_MENU_KEYS.includes(k) &&
            eq(spec.normalizeAboutMenu({ [k]: false }), {}));
    }
    check('las tres especiales sí están en el catálogo que se PINTA',
        spec.ABOUT_MENU_ITEMS.filter(i => i.special).length === 3);
    check('y cada una declara dónde vive su interruptor',
        spec.ABOUT_MENU_ITEMS.filter(i => i.special)
            .every(i => typeof i.visibleField === 'string' && i.visibleField.length > 0));

    grupo('── El orden del desplegable es el que ya se pintaba ──────');

    // Reordenar el menú es otra función y otra decisión: acá se conserva.
    check('son catorce entradas', spec.ABOUT_MENU_ITEMS.length === 14);
    check('el orden es el de siempre', eq(
        spec.ABOUT_MENU_ITEMS.map(i => i.label),
        ['Quienes Somos', 'Nuestras Causas', 'Maneras de contribuir', 'Nuestra Historia',
         'Nuestros Socios', 'Nuestra Junta Directiva', 'Socios Honorarios',
         'Nuestros Gobernadores', 'Nuestros Autores', 'Programa de Intercambios',
         'Rotaract', 'Interact', 'La Fundación Rotaria', 'Estados Financieros']));
    check('las especiales van entre la Junta y los Intercambios',
        spec.ABOUT_MENU_ITEMS.findIndex(i => i.key === 'juntaDirectiva') <
        spec.ABOUT_MENU_ITEMS.findIndex(i => i.special) &&
        spec.ABOUT_MENU_ITEMS.findLastIndex(i => i.special) <
        spec.ABOUT_MENU_ITEMS.findIndex(i => i.key === 'intercambios'));
    check('cada entrada tiene una dirección',
        spec.ABOUT_MENU_ITEMS.every(i => typeof i.href === 'string' && i.href.startsWith('/')));
    check('las claves no se repiten',
        new Set(spec.ABOUT_MENU_ITEMS.map(i => i.key)).size === spec.ABOUT_MENU_ITEMS.length);

    grupo('── Qué se pinta de verdad ────────────────────────────────');

    const conSocios = () => true;
    const sinSocios = () => false;

    check('sin configurar nada y con socios de las tres categorías, salen las 14',
        spec.resolveAboutMenu({ club: {}, hasMembersOf: conSocios }).length === 14);
    check('sin socios especiales salen 11',
        spec.resolveAboutMenu({ club: {}, hasMembersOf: sinSocios }).length === 11);
    check('sin `hasMembersOf` las especiales no se inventan',
        spec.resolveAboutMenu({ club: {} }).length === 11);

    const apagado = spec.resolveAboutMenu({ menu: { rotaract: false }, club: {}, hasMembersOf: sinSocios });
    check('lo apagado no se pinta', !apagado.some(i => i.key === 'rotaract'));
    check('y lo demás sigue', apagado.length === 10);

    // Dos condiciones distintas y ninguna sustituye a la otra.
    check('una especial con socios pero apagada NO se pinta',
        !spec.resolveAboutMenu({ club: { honoraryMembersVisible: false }, hasMembersOf: conSocios })
            .some(i => i.key === 'honorary'));
    check('una especial encendida pero SIN socios tampoco',
        !spec.resolveAboutMenu({ club: {}, hasMembersOf: k => k !== 'honorary' })
            .some(i => i.key === 'honorary'));
    check('una especial con socios y encendida sí',
        spec.resolveAboutMenu({ club: {}, hasMembersOf: conSocios }).some(i => i.key === 'honorary'));
    check('apagar una especial NO apaga las otras dos',
        spec.resolveAboutMenu({ club: { honoraryMembersVisible: false }, hasMembersOf: conSocios })
            .filter(i => ['governor', 'author'].includes(i.key)).length === 2);

    const todoApagado = Object.fromEntries(spec.ABOUT_MENU_KEYS.map(k => [k, false]));
    check('con todo apagado el desplegable queda vacío',
        spec.resolveAboutMenu({ menu: todoApagado, club: {}, hasMembersOf: sinSocios }).length === 0);
    check('y se avisa, con la salida', /Menú Principal/.test(spec.aboutMenuNotice(0) || ''));
    check('con al menos una entrada no hay aviso', spec.aboutMenuNotice(1) === null);

    grupo('── Los botones de la cabecera ────────────────────────────');

    // ADITIVO: los sitios que ya tenían botones configurados no cambian.
    for (const raw of [undefined, null, {}, { label: 'X' }, { hidden: false }, { hidden: 0 }, { hidden: 'no' }]) {
        check(`sin \`hidden\` el botón se VE — ${JSON.stringify(raw)}`, spec.ctaHidden(raw) === false);
    }
    check('sólo un true explícito lo apaga', spec.ctaHidden({ hidden: true }) === true);
    check('y la cadena "true" también', spec.ctaHidden({ hidden: 'true' }) === true);

    check('siempre hay DOS botones, aunque se guarde una lista corta',
        spec.normalizeHeaderCtas([{ label: 'A' }]).length === 2);
    check('y aunque no se guarde nada', spec.normalizeHeaderCtas(null).length === 2);
    // Recortar a las claves conocidas borraría lo que el administrador escribió.
    check('el texto y el enlace se conservan',
        spec.normalizeHeaderCtas([{ label: 'A', labelEs: 'B', url: '/x', urlEs: '/y' }])[0].labelEs === 'B');
    check('`hidden` queda como booleano real, no como la cadena',
        spec.normalizeHeaderCtas([{ hidden: 'true' }])[0].hidden === true);

    check('apagar los dos se avisa',
        /sin botones/i.test(spec.headerCtasNotice([{ hidden: true }, { hidden: true }]) || ''));
    check('apagar uno solo no', spec.headerCtasNotice([{ hidden: true }, {}]) === null);
    check('y no apagar ninguno tampoco', spec.headerCtasNotice([{}, {}]) === null);

    grupo('── Los dos espejos, comparados por SALIDAS ───────────────');

    check('las claves guardables son las MISMAS',
        eq([...spec.ABOUT_MENU_KEYS], [...servidor.ABOUT_MENU_KEYS]));
    for (const c of [null, {}, 'x', { rotaract: false }, { rotaract: 'false', inventado: false },
                     { honorary: false }, Object.fromEntries(spec.ABOUT_MENU_KEYS.map(k => [k, false]))]) {
        check(`mismo saneado del desplegable — ${JSON.stringify(c)?.slice(0, 50)}`,
            eq(spec.normalizeAboutMenu(c), servidor.normalizeAboutMenu(c)));
    }
    for (const c of [null, [], [{ hidden: 'true' }], [{ label: 'A' }, { hidden: true }]]) {
        check(`mismo saneado de los botones — ${JSON.stringify(c)}`,
            eq(spec.normalizeHeaderCtas(c), servidor.normalizeHeaderCtas(c)));
    }
    check('el servidor NO trae el criterio de pintado',
        servidor.resolveAboutMenu === undefined && servidor.aboutMenuNotice === undefined);
}

// ════════════════════════════════════════════════════════════════════
grupo('── El cableado: lo que ninguna prueba de criterio ve ──────');

const nav = codigo(NAVBAR);
// Sin esto, el desplegable volvería a ser una lista fija y el ajuste no
// decidiría nada — el código es válido y el fallo es MUDO.
check('el Navbar arma el desplegable con el CRITERIO',
    /const sobreNosotrosItems = resolveAboutMenu\(/.test(nav));
check('y ya no lleva la lista escrita a mano',
    !/label: 'Quienes Somos'/.test(nav) && !/label: 'Estados Financieros'/.test(nav));
check('las categorías especiales siguen exigiendo socios',
    /hasMembersOf:[\s\S]{0,120}memberHasCategory/.test(nav));
// Un botón que abre un recuadro vacío es peor que no tenerlo (v4.650).
check('con el desplegable vacío no se pinta «Sobre Nosotros»',
    (nav.match(/hasAboutItems/g) || []).length >= 4);
check('los botones ocultos se filtran',
    /visibleHeaderCtas = headerCtas\.filter\([\s\S]{0,200}ctaHidden\(/.test(nav));
// El filtro de audiencia de v4.596 no se puede haber perdido en el camino.
check('y el filtro de audiencia sigue en pie',
    /showProjectFairCta\(/.test(nav));

const rutas = codigo(RUTAS);
check('`by-domain` devuelve `aboutMenu`',
    /aboutMenu:\s*\(\(\)/.test(rutas) && rutas.includes("settings['about_menu']"));
check('y sigue devolviendo `headerCtas`', rutas.includes("settings['header_ctas']"));

const ctrl = codigo(CONTROLLER);
check('el guardado del desplegable sanea con el catálogo cerrado',
    /'about_menu':[\s\S]{0,120}normalizeAboutMenu\(aboutMenu\)/.test(ctrl));
check('y el de los botones normaliza `hidden`',
    /'header_ctas':[\s\S]{0,120}normalizeHeaderCtas\(headerCtas\)/.test(ctrl));
// `undefined` es «no lo toques»: guardar otra cosa no puede borrarlo (v4.993).
check('sin el campo en el cuerpo, el ajuste NO se escribe',
    /aboutMenu !== undefined/.test(ctrl));

const panel = codigo(PANEL);
check('el panel pinta el catálogo, no una lista propia',
    /ABOUT_MENU_ITEMS\.map/.test(panel));
// ⚠️ Esta función RECONSTRUYE el botón: lo que no se enumere se pierde al
// cargar y el interruptor volvería solo a «visible», sin avisar.
check('`hidden` está enumerado en el normalizador de carga',
    /const norm = \(x: any\) => \(\{[^}]*hidden: ctaHidden\(x\)/.test(panel));
check('el panel avisa si se apagan los dos botones',
    panel.includes('headerCtasNotice'));
check('y si se apaga todo el desplegable', panel.includes('aboutMenuNotice'));
// El dato de una categoría especial sigue viviendo en SU campo.
check('las especiales escriben en su propio campo, no en el ajuste',
    /item\.visibleField/.test(panel) && /\[campo\]: valor/.test(panel));

// ════════════════════════════════════════════════════════════════════
const css = existsSync('dist/assets')
    ? (await import('node:fs')).readdirSync('dist/assets').find(f => /^index-.*\.css$/.test(f))
    : null;
if (!build || !existsSync('node_modules/playwright') || !css) {
    console.log('\n⊘ Se omite la pantalla: falta playwright o `dist/` compilado.');
} else {
    ({ chromium } = await import('playwright'));
    grupo('── El desplegable REAL, en un navegador ──────────────────');

    const ENTRY = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { resolveAboutMenu } from '../src/lib/headerMenu';
window.pintar = (menu, club, hay) => {
    const items = resolveAboutMenu({ menu, club, hasMembersOf: k => hay.includes(k) });
    createRoot(document.getElementById('root')).render(
        React.createElement('div', null, items.map((i, n) =>
            React.createElement('a', { key: n, href: i.href, 'data-k': i.key }, i.label))));
};
`;
    const bundle = await build({
        stdin: { contents: ENTRY, resolveDir: 'scripts', loader: 'tsx' },
        bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic',
        logLevel: 'silent', define: { 'process.env.NODE_ENV': '"production"' },
    });
    const hoja = readFileSync(`dist/assets/${css}`, 'utf8');
    const CHROME = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome']
        .find(p => existsSync(p));
    const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const fallos = [];
    page.on('pageerror', e => fallos.push(e.message));
    await page.route('http://localhost/', r => r.fulfill({
        contentType: 'text/html',
        body: `<!doctype html><html><head><meta charset="utf-8"><style>${hoja}</style></head><body><div id="root"></div></body></html>`,
    }));
    await page.goto('http://localhost/');
    await page.addScriptTag({ content: bundle.outputFiles[0].text });

    const pintar = async (menu, club, hay) => {
        await page.evaluate(() => { document.getElementById('root').innerHTML = ''; });
        await page.evaluate(([m, c, h]) => window.pintar(m, c, h), [menu, club, hay]);
        await page.waitForTimeout(80);
        return page.locator('#root a');
    };

    const todas = await pintar({}, {}, ['honorary', 'governor', 'author']);
    check('sin configurar, el desplegable trae las catorce', (await todas.count()) === 14);
    check('y «Maneras de contribuir» está entre ellas',
        (await page.locator('#root a[data-k="manerasDeContribuir"]').count()) === 1);

    const sinContribuir = await pintar({ manerasDeContribuir: false }, {}, ['honorary', 'governor', 'author']);
    check('apagada una entrada, deja de pintarse', (await sinContribuir.count()) === 13);
    check('y es exactamente la apagada',
        (await page.locator('#root a[data-k="manerasDeContribuir"]').count()) === 0);
    check('las demás siguen',
        (await page.locator('#root a[data-k="rotaract"]').count()) === 1);

    await pintar({}, { honoraryMembersVisible: false }, ['honorary', 'governor', 'author']);
    check('apagada una categoría especial, tampoco se pinta',
        (await page.locator('#root a[data-k="honorary"]').count()) === 0);
    check('y las otras dos siguen',
        (await page.locator('#root a[data-k="governor"]').count()) === 1);

    check('sin errores', fallos.length === 0, fallos.join(' | '));
    await browser.close();
}

// ════════════════════════════════════════════════════════════════════
console.log(`\n${'─'.repeat(60)}`);
if (malos.length) {
    console.log(`✗ ${malos.length} de ${ok + malos.length} fallaron:\n`);
    for (const m of malos) console.log(`   · ${m}`);
    process.exit(1);
}
console.log(`✓ ${ok} comprobaciones, todas bien.\n`);
