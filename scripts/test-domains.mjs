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

// ════════════════════════════════════════════════════════════════════
// El SITIO de un distrito — v4.744
//
// Un distrito existe dos veces: la fila de `District` lleva el DOMINIO y la de
// `Club` lleva el CONTENIDO. Si la resolución se queda en la primera, el
// dominio propio sirve un sitio vacío mientras el mismo distrito, por su
// subdominio de plataforma, se ve completo. Pasó con el Distrito 4281.
// ════════════════════════════════════════════════════════════════════
const { isDistrictSiteType, districtLinkScore, pickDistrictSite, districtBranding } =
    await import('../server/lib/districtSite.js');

console.log('\n── ¿Qué club es el sitio de un distrito? ──────────────');

const D = { id: 'dist-4281', number: 4281, subdomain: null };

check('el tipo del sitio se reconoce por la clave máquina y por la etiqueta', () => {
    // El alta de /admin/distritos escribe `district`; el formulario de sitios
    // guarda la etiqueta legible. Las dos son el mismo tipo de sitio.
    assert.equal(isDistrictSiteType('district'), true);
    assert.equal(isDistrictSiteType('Distrito Rotario'), true);
    assert.equal(isDistrictSiteType('club'), false);
    assert.equal(isDistrictSiteType(null), false);
});

check('un club sin ningún vínculo NO es el sitio del distrito', () =>
    assert.equal(districtLinkScore(D, { id: 'x', type: 'club' }), 0));
check('el vínculo explícito pesa más que el número', () =>
    assert.ok(
        districtLinkScore(D, { id: 'a', districtId: 'dist-4281', type: 'district' }) >
        districtLinkScore(D, { id: 'b', district: '4281', type: 'district' })));
check('el número sólo vincula si además es un sitio de distrito', () =>
    // `Club.district` la lleva TODO club: es el distrito al que pertenece. Un
    // club rotario del 4281 tiene «4281» ahí y no es el sitio del distrito.
    assert.equal(districtLinkScore(D, { id: 'c', district: '4281', type: 'club' }), 0));
check('el subdominio declarado en la ficha del distrito también vincula', () =>
    assert.ok(districtLinkScore({ ...D, subdomain: 'd4281' }, { id: 'd', subdomain: 'D4281' }) > 0));

check('sin candidatos vinculados no se inventa un sitio', () => {
    assert.equal(pickDistrictSite(D, []), null);
    assert.equal(pickDistrictSite(D, [{ id: 'x', type: 'club' }]), null);
});

check('entre el club espejo VACÍO y el sitio configurado, gana el configurado', () => {
    // Es el caso real y el que rompía: al crear el distrito se inserta un club
    // espejo sin ajustes, y el operador crea después el sitio de verdad. Elegir
    // el espejo da exactamente la página en blanco que esto corrige.
    const espejo = { id: 'a', type: 'district', districtId: 'dist-4281', settingsCount: 0 };
    const real = { id: 'b', type: 'district', districtId: 'dist-4281', settingsCount: 47 };
    assert.equal(pickDistrictSite(D, [espejo, real]).id, 'b');
    assert.equal(pickDistrictSite(D, [real, espejo]).id, 'b');
});

check('el vínculo explícito gana aunque el otro tenga más ajustes', () => {
    const linked = { id: 'a', type: 'district', districtId: 'dist-4281', settingsCount: 1 };
    const porNumero = { id: 'b', type: 'district', district: '4281', settingsCount: 99 };
    assert.equal(pickDistrictSite(D, [porNumero, linked]).id, 'a');
});

check('a igualdad de todo, la elección es DETERMINISTA', () => {
    // Si dependiera del orden en que la base devuelve las filas, el mismo
    // dominio serviría un sitio distinto en cada visita.
    const a = { id: 'aaa', type: 'district', districtId: 'dist-4281', settingsCount: 5, updatedAt: '2026-01-01' };
    const b = { id: 'bbb', type: 'district', districtId: 'dist-4281', settingsCount: 5, updatedAt: '2026-01-01' };
    assert.equal(pickDistrictSite(D, [a, b]).id, 'aaa');
    assert.equal(pickDistrictSite(D, [b, a]).id, 'aaa');
});

console.log('\n── La marca: manda el sitio, el distrito es respaldo ──');

check('lo que el sitio tiene cargado NO lo pisa la ficha del distrito', () =>
    assert.deepEqual(
        districtBranding({ logo: 'club.png' }, { logo: 'dist.png', favicon: 'd.ico' }),
        { favicon: 'd.ico' }));
check('lo que al sitio le falta se completa con la ficha del distrito', () =>
    assert.equal(districtBranding({}, { logo: 'dist.png' }).logo, 'dist.png'));
check('sin distrito no se toca nada', () =>
    assert.deepEqual(districtBranding({ logo: 'club.png' }, null), {}));

console.log('\n── La resolución atraviesa hasta el sitio ─────────────');

check('`by-domain` resuelve el distrito a su sitio, no a la ficha', () => {
    // El fallo era servir la ficha con `settings: []`: sin ajustes no hay
    // identidad, ni colores, ni contacto, ni imágenes. Un sitio en blanco.
    assert.match(ROUTES, /findDistrictSiteClub/);
    assert.match(ROUTES, /pickDistrictSite/);
    assert.match(ROUTES, /resolvedBy = `\$\{how\}_site`/);
});

const DISTRICTS = readFileSync('server/routes/districts.js', 'utf8');
check('el dominio del distrito se guarda canonizado, igual que el de un sitio', () => {
    assert.match(DISTRICTS, /canonicalDomain\(domain\) \|\| null/);
    // Ojo: `subdomain || null` contiene la subcadena y es legítimo.
    assert.ok(!/[^a-zA-Z]domain \|\| null/.test(DISTRICTS),
        'volvió a guardarse el dominio en crudo');
});
check('el dominio NO se copia al club del distrito', () => {
    // Las dos columnas son ÚNICAS: con el dominio en las dos filas, cambiarlo
    // en una deja la otra resolviendo al valor viejo.
    const insert = DISTRICTS.match(/INSERT INTO "Club"[\s\S]{0,240}/)?.[0] || '';
    assert.ok(!/\bdomain\b/.test(insert), 'el club espejo volvió a llevarse el dominio');
    assert.match(insert, /"districtId"/, 'el club espejo debe nacer vinculado al distrito');
});
check('el estado del dominio distingue el DNS del CONTENIDO', () => {
    // «✅ verificado» sobre un sitio en blanco es lo que confundió al 4281.
    assert.match(DISTRICTS, /siteMessage/);
    assert.match(DISTRICTS, /no tiene un sitio asociado/);
});

console.log(`\n${fail === 0 ? '✅' : '❌'}  ${pass} pasaron, ${fail} fallaron\n`);
process.exit(fail === 0 ? 0 : 1);
