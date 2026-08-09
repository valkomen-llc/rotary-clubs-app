#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// Prueba del criterio de navbar por tipo de sitio — v4.737
//
//   npm run test:nav
//
// Qué se comprueba: qué tipos de sitio llevan navbar PROPIA (menú fijo escrito
// en el código) y cuáles usan el menú estándar y configurable desde el panel.
//
// Por qué existe: hasta v4.736 ese criterio estaba escrito a mano en DOS sitios
// —`Navbar.tsx` y `ClubSettings.tsx`— y ya se habían separado; el `Navbar`
// contemplaba además los sitios RYE y el panel no. Un DISTRITO figuraba en las
// dos listas, así que el panel le escondía el editor del menú y el `Navbar` le
// daba uno fijo: el sitio quedaba con «Inicio | Contacto» y sin forma de
// cambiarlo por ninguna vía. Es una regla corta, invisible desde el typecheck y
// cara de descubrir mirando pantallas.
//
// No necesita base, credenciales ni red.
// Necesita esbuild, que no es dependencia del sitio:  npm i --no-save esbuild
// ════════════════════════════════════════════════════════════════════
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const outDir = mkdtempSync(join(tmpdir(), 'nav-test-'));
const BUILT = join(outDir, 'entityTypes.js');
process.on('exit', () => { try { rmSync(outDir, { recursive: true, force: true }); } catch { } });
execFileSync('npx', ['esbuild', 'src/lib/entityTypes.ts',
    `--outfile=${BUILT}`, '--format=esm', '--platform=neutral'], { stdio: 'pipe' });

const client = await import(BUILT);
const server = await import('../server/lib/entityTypes.js');

let pass = 0, fail = 0;
const check = (name, fn) => {
    try { fn(); console.log('  ✓', name); pass++; }
    catch (e) { console.log('  ✗', name, '\n      →', e.message); fail++; }
};

console.log('\n── Un distrito es un sitio NORMAL ─────────────────────');

check('un distrito NO lleva navbar propia: su menú sale de su configuración', () =>
    assert.equal(client.hasFixedNav('district'), false));
check('tampoco por su etiqueta legible («Distrito Rotario»)', () =>
    assert.equal(client.hasFixedNav('Distrito Rotario'), false));
check('un club tampoco', () => assert.equal(client.hasFixedNav('club'), false));
check('un Evento o Convención tampoco', () =>
    assert.equal(client.hasFixedNav('Evento o Convención'), false));
check('una Feria de Proyectos tampoco', () =>
    assert.equal(client.hasFixedNav('Feria de Proyectos'), false));
check('una Zona tampoco', () => assert.equal(client.hasFixedNav('Zona'), false));

console.log('\n── Los que SÍ conservan su menú fijo ──────────────────');

check('una asociación lleva navbar propia', () =>
    assert.equal(client.hasFixedNav('association'), true));
check('…también por su etiqueta legible («Asociación Rotaria»)', () =>
    assert.equal(client.hasFixedNav('Asociación Rotaria'), true));
check('un Programa de Intercambio lleva navbar propia', () =>
    assert.equal(client.hasFixedNav('Programa de Intercambio'), true));

console.log('\n── Entradas que no se reconocen ───────────────────────');

check('un tipo desconocido NO lleva navbar propia (se degrada al menú estándar)', () =>
    assert.equal(client.hasFixedNav('lo-que-sea'), false));
for (const value of [undefined, null, '']) {
    check(`«${String(value)}» tampoco`, () => assert.equal(client.hasFixedNav(value), false));
}
check('los espacios y las mayúsculas no importan', () =>
    assert.equal(client.hasFixedNav('  ASSOCIATION '), true));

console.log('\n── Los dos catálogos dicen lo mismo ───────────────────');

// `entityTypes.ts` y `server/lib/entityTypes.js` están duplicados a propósito
// —el archivo lo dice— y por eso hay que comprobar que no se separen.
const ALL = [...client.ENTITY_TYPES.map(e => e.type), 'Distrito Rotario',
'Asociación Rotaria', 'lo-que-sea', ''];
for (const type of ALL) {
    check(`«${type}»: cliente y servidor coinciden`, () =>
        assert.equal(client.hasFixedNav(type), server.hasFixedNav(type)));
}
check('los dos catálogos declaran los mismos tipos', () =>
    assert.deepEqual(client.ENTITY_TYPES.map(e => e.type), server.ENTITY_TYPES.map(e => e.type)));
check('los dos declaran el mismo conjunto con navbar propia', () =>
    assert.deepEqual(
        client.ENTITY_TYPES.filter(e => e.fixedNav).map(e => e.type),
        server.ENTITY_TYPES.filter(e => e.fixedNav).map(e => e.type)));

console.log('\n── La portada de un distrito no está secuestrada ──────');

// La galería de la Conferencia Bidistrital era la portada FORZADA de todo sitio
// de tipo distrito (v4.736 y anteriores). Se comprueba sobre el archivo porque
// es una decisión de `SmartHome`, y volver a escribirla ahí es exactamente la
// forma en que esto reaparecería.
// Los comentarios se quitan a propósito: explican POR QUÉ se retiró el número de
// distrito escrito a mano, así que nombrarlo ahí es correcto. Lo que no puede
// volver es que el número DECIDA algo.
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const APP = readFileSync('src/App.tsx', 'utf8');
const home = stripComments(APP.slice(APP.indexOf('function SmartHome'), APP.indexOf('const ScrollToTop')));

check('SmartHome no devuelve la galería multimedia como portada', () =>
    assert.ok(!/return\s*<DistrictMultimediaGallery/.test(home),
        'SmartHome volvió a reemplazar la portada por la galería'));
check('SmartHome no decide nada por el número 4271', () =>
    assert.ok(!/4271/.test(home), 'volvió a haber un número de distrito escrito a mano'));
check('la galería tiene su propia ruta pública', () =>
    assert.ok(/path="\/galeria-multimedia"\s+element={<DistrictMultimediaGallery/.test(APP),
        'la galería quedó sin ruta: la página sería inalcanzable'));

const NAV = readFileSync('src/sections/Navbar.tsx', 'utf8');
check('el Navbar ya no decide el menú por el número 4271', () =>
    assert.ok(!/4271/.test(stripComments(NAV)), 'volvió a haber un número de distrito escrito a mano'));
check('el Navbar toma el criterio de entityTypes, no de una lista propia', () =>
    assert.ok(/hasFixedNav\(/.test(NAV), 'el Navbar dejó de usar hasFixedNav'));

const SETTINGS = readFileSync('src/pages/admin/ClubSettings.tsx', 'utf8');
check('el panel toma el mismo criterio que el Navbar', () =>
    assert.ok(/hasFixedNav\(/.test(SETTINGS), 'el panel volvió a llevar su propia lista'));

console.log('\n── El azul de la barra superior tiene UN solo sitio ───');

// La barra superior, su versión pública y la banda de la portada llevan el
// MISMO fondo. Estaba escrito a mano como `bg-[#28354b]` en dos componentes; al
// aparecer el tercero, tres literales se separan en cuanto alguien cambie uno.
const TOPBAR_USERS = [
    'src/sections/Navbar.tsx',
    'src/components/PublicTopBar.tsx',
    'src/sections/HomeBannerSection.tsx',
    'src/sections/Footer.tsx',
];
for (const file of TOPBAR_USERS) {
    const src = readFileSync(file, 'utf8');
    check(`${file.split('/').pop()} usa el token, no el hexadecimal`, () => {
        assert.ok(!/#28354b/i.test(stripComments(src)), 'volvió el color escrito a mano');
        assert.match(src, /bg-rotary-topbar/);
    });
}

check('el token está declarado en el tema de Tailwind, no en index.css', () =>
    // Una clase escrita a mano en `@layer utilities` —como `bg-rotary-blue`— NO
    // genera los modificadores de opacidad y falla en silencio (v4.719).
    assert.match(readFileSync('tailwind.config.js', 'utf8'), /"rotary-topbar":\s*"#28354b"/));

// Que la clase EXISTA en el CSS compilado es lo único que demuestra que llegó:
// una clase que Tailwind no genera no da error, simplemente no pinta.
const dist = existsSync('dist') && readdirSync('dist/assets').find(f => /^index-.*\.css$/.test(f));
if (dist) {
    const css = readFileSync(`dist/assets/${dist}`, 'utf8');
    check('la clase llegó al CSS compilado', () =>
        assert.match(css, /\.bg-rotary-topbar\{[^}]*40 53 75/));
} else {
    console.log('  ⏭  sin dist/: se omite la comprobación del CSS compilado');
}

console.log('\n── El fondo del pie tiene UN solo sitio ───────────────');

// Lo consumen el pie de verdad y la vista previa del panel. Escrito a mano en
// los dos, la vista previa acaba enseñando un pie que no es el que se sirve.
const CHROME = readFileSync('src/lib/siteChrome.ts', 'utf8');
check('el color del pie está declarado una sola vez', () =>
    assert.match(CHROME, /SITE_FOOTER_BG = '#212C3F'/));
check('el pie y la vista previa del panel lo toman de ahí', () => {
    for (const f of ['src/sections/Footer.tsx', 'src/pages/admin/FooterSystem.tsx']) {
        const src = readFileSync(f, 'utf8');
        assert.match(src, /SITE_FOOTER_BG/, `${f} dejó de usar la constante`);
        assert.ok(!/#212C3F/i.test(stripComments(src)), `${f} volvió a escribir el color a mano`);
    }
});
check('el token de la barra superior dice lo mismo en los dos mecanismos', () =>
    // Uno se consume como clase (tailwind.config.js) y el otro en línea.
    assert.match(CHROME, /SITE_TOPBAR_BG = '#28354b'/));

console.log('\n── El nombre de la plataforma es una MARCA ────────────');

// El traductor de DOM lo pasaba a «Plataforma de Club para Rotary», un nombre
// que no existe. Es la distinción de v4.662: el LENGUAJE se traduce, la
// IDENTIDAD —marcas, correos, códigos— no se toca.
const FOOTER = readFileSync('src/sections/Footer.tsx', 'utf8');
check('el enlace de la plataforma va con `data-no-translate`', () =>
    assert.match(FOOTER, /data-no-translate[^>]*>Club Platform for Rotary</));
check('«Powered by» sigue siendo traducible: eso sí es lenguaje', () =>
    assert.ok(!/data-no-translate[^>]*>\s*Powered by/.test(FOOTER)));

console.log(`\n${fail === 0 ? '✅' : '❌'}  ${pass} pasaron, ${fail} fallaron\n`);
process.exit(fail === 0 ? 0 : 1);
