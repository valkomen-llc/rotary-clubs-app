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
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
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

console.log(`\n${fail === 0 ? '✅' : '❌'}  ${pass} pasaron, ${fail} fallaron\n`);
process.exit(fail === 0 ? 0 : 1);
