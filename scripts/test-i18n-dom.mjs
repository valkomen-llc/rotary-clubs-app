#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// Prueba del motor de traducción sobre el DOM — v4.661
//
//   npm run test:i18n
//
// Comprueba lo que hace el módulo sobre una página de verdad: qué traduce,
// qué NO debe tocar (correos, cifras, códigos, el value que escribió el
// usuario), que sabe deshacerlo y que aplicar dos veces no duplica nada.
//
// Cubre además los tres fallos concretos que motivaron la reescritura:
//   · placeholder / alt / aria-label / title, que hasta v4.660 se quedaban
//     siempre en español porque el recorrido sólo miraba nodos de texto;
//   · varios nodos de texto en un mismo elemento (el copyright del pie);
//   · un repintado de React sobre un nodo YA traducido, que sin distinguir
//     "lo escribí yo" de "lo cambió React" se toma por original y acaba
//     traduciéndose la traducción.
//
// Necesita jsdom y esbuild, que no son dependencias del sitio:
//   npm i --no-save jsdom esbuild
// ════════════════════════════════════════════════════════════════════
import { JSDOM } from 'jsdom';
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// El motor está en TypeScript: se compila a un temporal para poder cargarlo.
const outDir = mkdtempSync(join(tmpdir(), 'i18n-test-'));
const BUILT = join(outDir, 'domTranslator.js');
process.on('exit', () => { try { rmSync(outDir, { recursive: true, force: true }); } catch {} });
execFileSync('npx', ['esbuild', 'src/lib/domTranslator.ts',
    `--outfile=${BUILT}`, '--format=esm', '--platform=neutral'], { stdio: 'pipe' });


const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>');
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.NodeFilter = dom.window.NodeFilter;
globalThis.Element = dom.window.Element;
globalThis.Node = dom.window.Node;

const T = await import(BUILT);

const root = document.getElementById('root');
let pass = 0, fail = 0;
const check = (name, fn) => {
    try { fn(); console.log('  ✓', name); pass++; }
    catch (e) { console.log('  ✗', name, '\n      →', e.message); fail++; }
};

const CACHE = {
    'Regístrate ahora': 'Register now',
    'Buscar un club': 'Search for a club',
    'Correo electrónico': 'Email address',
    'Feria de Proyectos': 'Project Fair',
    'Enviar inscripción': 'Submit registration',
    'Logotipo del Distrito 4281': 'District 4281 logo',
    'Cerrar el menú': 'Close menu',
    'Todos los derechos reservados.': 'All rights reserved.',
    'Distrito 4281': 'District 4281',
    'Rotario Internacional': 'International Rotarian',
    'Inscripción abierta': 'Registration open',
};

console.log('\n── 1. Texto y atributos ───────────────────────────────');
root.innerHTML = `
  <h1>Feria de Proyectos</h1>
  <button>Regístrate ahora</button>
  <input type="text" placeholder="Buscar un club" />
  <input type="email" placeholder="Correo electrónico" value="daniel@ejemplo.com" />
  <input type="submit" value="Enviar inscripción" />
  <img alt="Logotipo del Distrito 4281" src="/logo.png" />
  <button aria-label="Cerrar el menú"><svg><title>x</title></svg></button>
  <select><option value="intl">Rotario Internacional</option></select>
  <span title="Inscripción abierta">i</span>
  <footer><span>2027</span> <span>Distrito 4281</span> <span>Todos los derechos reservados.</span></footer>
`;

T.applyAll(root, CACHE);

check('el título se traduce', () =>
    assert.equal(root.querySelector('h1').textContent.trim(), 'Project Fair'));
check('el botón se traduce', () =>
    assert.equal(root.querySelector('button').textContent.trim(), 'Register now'));
check('el placeholder se traduce (era el hueco de v4.660)', () =>
    assert.equal(root.querySelector('input[type=text]').getAttribute('placeholder'), 'Search for a club'));
check('el value de un submit se traduce', () =>
    assert.equal(root.querySelector('input[type=submit]').value, 'Submit registration'));
check('el value de un campo de texto NO se toca (es el dato del usuario)', () =>
    assert.equal(root.querySelector('input[type=email]').value, 'daniel@ejemplo.com'));
check('el alt de la imagen se traduce', () =>
    assert.equal(root.querySelector('img').getAttribute('alt'), 'District 4281 logo'));
check('el aria-label se traduce', () =>
    assert.equal(root.querySelector('button[aria-label]').getAttribute('aria-label'), 'Close menu'));
check('el option de un select se traduce', () =>
    assert.equal(root.querySelector('option').textContent.trim(), 'International Rotarian'));
check('el title se traduce', () =>
    assert.equal(root.querySelector('span[title]').getAttribute('title'), 'Registration open'));

console.log('\n── 2. Varios nodos en un mismo elemento (el fallo del pie) ──');
const spans = root.querySelectorAll('footer span');
check('el año queda intacto (es un dato)', () => assert.equal(spans[0].textContent.trim(), '2027'));
check('cada nodo recibe SU traducción, no la del primero', () => {
    assert.equal(spans[1].textContent.trim(), 'District 4281');
    assert.equal(spans[2].textContent.trim(), 'All rights reserved.');
});

console.log('\n── 3. Datos que nunca deben traducirse ────────────────');
for (const [t, esDato] of [
    ['danielyazo@gmail.com', true], ['+57 300 123 4567', true],
    ['https://rotary.org', true], ['1.250.000', true], ['$450 USD', true],
    ['2027', true], ['—', true],
    ['Regístrate ahora', false], ['Ver más', false],
]) {
    check(`${JSON.stringify(t)} → ${esDato ? 'dato' : 'traducible'}`, () =>
        assert.equal(T.looksLikeData(t), esDato));
}

console.log('\n── 4. Restaurar al español ────────────────────────────');
T.restoreAll(root);
check('el título vuelve al original', () =>
    assert.equal(root.querySelector('h1').textContent.trim(), 'Feria de Proyectos'));
check('el placeholder vuelve al original', () =>
    assert.equal(root.querySelector('input[type=text]').getAttribute('placeholder'), 'Buscar un club'));
check('el alt vuelve al original', () =>
    assert.equal(root.querySelector('img').getAttribute('alt'), 'Logotipo del Distrito 4281'));

console.log('\n── 5. React repinta un nodo YA traducido (characterData) ──');
T.applyAll(root, CACHE);
const h1 = root.querySelector('h1');
assert.equal(h1.textContent.trim(), 'Project Fair');
// React sustituye el texto en sitio por contenido NUEVO en español:
h1.firstChild.textContent = 'Inscripción abierta';
check('el contenido nuevo se reconoce como nuevo original (no se da por traducido)', () =>
    assert.equal(T.originalOf(h1.firstChild), 'Inscripción abierta'));
T.applyAll(root, CACHE);
check('y se traduce en la siguiente pasada', () =>
    assert.equal(h1.textContent.trim(), 'Registration open'));
check('no se "retraduce" una traducción (Register now no se toma por original)', () => {
    const b = root.querySelector('button');
    assert.equal(T.originalOf(b.firstChild), 'Regístrate ahora');
});

console.log('\n── 6. collectMissing e idempotencia ───────────────────');
root.innerHTML = `<p>Texto nuevo sin traducir</p><input placeholder="Otro texto nuevo">`;
const missing = T.collectMissing(root, CACHE);
check('encuentra el texto y el atributo que faltan', () => {
    assert.ok(missing.includes('Texto nuevo sin traducir'), 'falta el texto');
    assert.ok(missing.includes('Otro texto nuevo'), 'falta el atributo');
});
check('no propone traducir datos', () =>
    assert.ok(!missing.some(m => T.looksLikeData(m))));

root.innerHTML = `<h1>Feria de Proyectos</h1>`;
T.applyAll(root, CACHE);
const once = root.innerHTML;
T.applyAll(root, CACHE);
T.applyAll(root, CACHE);
check('aplicar tres veces da el mismo resultado (sin duplicar)', () =>
    assert.equal(root.innerHTML, once));
check('tras traducir, no queda nada pendiente (el bucle termina)', () =>
    assert.equal(T.collectMissing(root, CACHE).length, 0));

console.log('\n── 7. data-no-translate ───────────────────────────────');
root.innerHTML = `<div data-no-translate><h1>Feria de Proyectos</h1><input placeholder="Buscar un club"></div>`;
T.applyAll(root, CACHE);
check('el texto marcado se respeta', () =>
    assert.equal(root.querySelector('h1').textContent.trim(), 'Feria de Proyectos'));
check('el atributo marcado se respeta', () =>
    assert.equal(root.querySelector('input').getAttribute('placeholder'), 'Buscar un club'));

console.log(`\n${fail ? '✗' : '✓'} ${pass} pasaron, ${fail} fallaron\n`);
process.exit(fail ? 1 : 0);
