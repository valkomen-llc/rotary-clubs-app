#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// Prueba del criterio de dominios — v4.743
//
//   npm run test:domains
//
// Qué se comprueba: cómo se canoniza un dominio y contra qué formas se compara.
//
// Por qué existe: cuando lo GUARDADO y lo CONSULTADO no se reducen a la misma
// forma, el sitio no resuelve —y el visitante NO ve un error, ve el sitio
// «Origen» con «Nombre del club» y fotos genéricas—. Es un fallo mudo: parece
// un sitio a medio configurar y en realidad el dominio no está atado a nada.
// Pasó en producción con el Distrito 4281.
//
// No necesita base, credenciales ni red.
// ════════════════════════════════════════════════════════════════════
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

const { canonicalDomain, domainCandidates, subdomainLabel, sameDomain } =
    await import('../server/lib/domains.js');

let pass = 0, fail = 0;
const check = (name, fn) => {
    try { fn(); console.log('  ✓', name); pass++; }
    catch (e) { console.log('  ✗', name, '\n      →', e.message); fail++; }
};

console.log('\n── La forma canónica de un dominio ────────────────────');

const CASES = [
    ['rotary4281.org', 'rotary4281.org', 'ya está limpio'],
    ['ROTARY4281.ORG', 'rotary4281.org', 'mayúsculas'],
    ['  rotary4281.org  ', 'rotary4281.org', 'espacios alrededor'],
    ['https://rotary4281.org', 'rotary4281.org', 'con protocolo: lo que uno copia del navegador'],
    ['http://rotary4281.org/', 'rotary4281.org', 'protocolo y barra final'],
    ['https://www.rotary4281.org/inicio', 'rotary4281.org', 'con www y una ruta'],
    ['www.rotary4281.org', 'rotary4281.org', 'sólo www'],
    ['rotary4281.org.', 'rotary4281.org', 'punto final (FQDN)'],
    ['rotary4281.org:443', 'rotary4281.org', 'con puerto'],
    ['https://rotary4281.org?x=1', 'rotary4281.org', 'con query'],
    ['https://rotary4281.org#top', 'rotary4281.org', 'con ancla'],
    ['https://user:pass@rotary4281.org', 'rotary4281.org', 'con credenciales'],
    ['', '', 'vacío'],
    [null, '', 'nulo'],
    [undefined, '', 'indefinido'],
];
for (const [input, expected, why] of CASES) {
    check(`${JSON.stringify(input)} → ${JSON.stringify(expected)} (${why})`, () =>
        assert.equal(canonicalDomain(input), expected));
}

check('un subdominio de la plataforma se conserva entero', () =>
    assert.equal(canonicalDomain('distrito-4281-de-rotary-international'), 'distrito-4281-de-rotary-international'));

console.log('\n── Contra qué formas se compara lo guardado ───────────');

check('se prueba el apex y la variante con www', () =>
    assert.deepEqual(domainCandidates('rotary4281.org'), ['rotary4281.org', 'www.rotary4281.org']));
check('da lo mismo que la visita venga con www', () =>
    assert.deepEqual(domainCandidates('www.rotary4281.org'), ['rotary4281.org', 'www.rotary4281.org']));
check('sin dominio no hay nada que comparar', () =>
    assert.deepEqual(domainCandidates(''), []));

console.log('\n── La primera etiqueta (subdominio) ───────────────────');

check('rotary4281.org → rotary4281', () =>
    assert.equal(subdomainLabel('rotary4281.org'), 'rotary4281'));
check('www no cuenta como etiqueta', () =>
    assert.equal(subdomainLabel('www.rotary4281.org'), 'rotary4281'));
check('un subdominio suelto se devuelve entero', () =>
    assert.equal(subdomainLabel('distrito-4281-de-rotary-international'), 'distrito-4281-de-rotary-international'));

console.log('\n── ¿Son el mismo sitio? ───────────────────────────────');

check('apex y www son el mismo', () => assert.equal(sameDomain('rotary4281.org', 'www.rotary4281.org'), true));
check('con y sin protocolo son el mismo', () => assert.equal(sameDomain('https://rotary4281.org/', 'rotary4281.org'), true));
check('dos dominios distintos NO son el mismo', () => assert.equal(sameDomain('rotary4281.org', 'rotary4271.org'), false));
check('vacío no coincide con nada, ni consigo mismo', () => {
    assert.equal(sameDomain('', ''), false);
    assert.equal(sameDomain('', 'rotary4281.org'), false);
});

console.log('\n── Las dos puntas normalizan IGUAL ────────────────────');

// Es la condición que hace que un dominio resuelva. Si el alta guarda una forma
// y la búsqueda espera otra, el sitio cae al «Origen» sin decir nada.
const CONTROLLER = readFileSync('server/controllers/clubController.js', 'utf8');
const ROUTES = readFileSync('server/routes/clubs.js', 'utf8');

check('el alta de un sitio canoniza el dominio', () =>
    // Hasta v4.743 insertaba `domain || null` en crudo: un sitio creado con
    // `https://…` nacía con un dominio que la búsqueda no podía casar.
    assert.match(CONTROLLER, /canonicalDomain\(domain\) \|\| null/));
check('la edición canoniza con la MISMA función, no con su propia copia', () =>
    assert.match(CONTROLLER, /normalizedDomain[\s\S]{0,120}canonicalDomain\(domain\)/));
check('la búsqueda usa el mismo criterio', () =>
    assert.match(ROUTES, /import \{ canonicalDomain, domainCandidates, subdomainLabel \}/));
check('hay un segundo intento que normaliza lo GUARDADO', () =>
    // Rescata las filas escritas antes de que el alta canonizara.
    assert.match(ROUTES, /findByLooseDomain/));

console.log('\n── El fallo deja de ser mudo ──────────────────────────');

check('la respuesta dice CÓMO se resolvió', () =>
    assert.match(ROUTES, /resolvedBy/));
check('caer al «Origen» se marca como `fallback`', () =>
    assert.match(ROUTES, /resolvedBy = 'fallback'/));

const SETTINGS = readFileSync('src/pages/admin/ClubSettings.tsx', 'utf8');
check('el botón «Verificar» del panel consulta de verdad', () => {
    // Antes sólo mostraba «Validando configuración DNS…» y no consultaba nada:
    // daba por conectado un dominio que podía no estar atado a ningún sitio.
    assert.ok(!/toast\.info\('Validando configuración DNS/.test(SETTINGS),
        'el botón volvió a ser decorativo');
    assert.match(SETTINGS, /handleVerifyDomain/);
    assert.match(SETTINGS, /by-domain\?domain=/);
});
check('el panel distingue los tres resultados posibles', () => {
    assert.match(SETTINGS, /no está asignado a ningún sitio/);
    assert.match(SETTINGS, /lleva a este sitio/);
    assert.match(SETTINGS, /lleva a OTRO sitio/);
});

console.log(`\n${fail === 0 ? '✅' : '❌'}  ${pass} pasaron, ${fail} fallaron\n`);
process.exit(fail === 0 ? 0 : 1);
