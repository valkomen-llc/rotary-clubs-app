#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// Prueba de la RESOLUCIÓN de un distrito por su dominio propio — v4.744
//
//   npm run test:district-site
//
// Qué se comprueba: que `GET /clubs/by-domain`, entrando por el dominio propio
// de un distrito, entregue el SITIO del distrito con toda su configuración —y
// no la ficha administrativa vacía—.
//
// POR QUÉ NO ALCANZA UNA PRUEBA DE CRITERIO. `pickDistrictSite` es puro y ya
// está probado en `test:domains`, pero el defecto reportado no estaba en el
// criterio: estaba en el CAMINO. La ruta encontraba la fila de `District` y
// sintetizaba la entidad con `settings: []`, así que el dominio propio servía
// un sitio en blanco mientras el mismo distrito, por su subdominio de
// plataforma, se veía completo. Eso sólo se ve ejecutando la ruta.
//
// No necesita Postgres: se sustituye `server/lib/db.js` por una base en
// memoria mediante un hook de resolución de módulos.
// ════════════════════════════════════════════════════════════════════
import assert from 'node:assert';
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import { createServer } from 'node:http';

const HERE = pathToFileURL(`${process.cwd()}/`).href;
const STUB = new URL('./scripts/fixtures/db-district-stub.mjs', HERE).href;

// El hook redirige cualquier import de `lib/db.js` a la base en memoria. Va
// antes de importar la ruta: después, el módulo real ya estaría cargado.
register(
    `data:text/javascript,export async function resolve(s,c,n){return s.endsWith('/lib/db.js')?{url:${JSON.stringify(STUB)},shortCircuit:true}:n(s,c)}`,
    HERE
);

const express = (await import('express')).default;
const router = (await import('../server/routes/clubs.js')).default;
// Importación de NAMESPACE, no desestructurada: `reset()` reasigna el objeto y
// una desestructuración se quedaría con una foto del anterior.
const stub = await import(STUB);
const reset = stub.reset;

const app = express();
app.use('/api/clubs', router);
const server = createServer(app);
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}/api/clubs/by-domain`;
const get = async (domain) => {
    const res = await fetch(`${base}?domain=${encodeURIComponent(domain)}`);
    return { status: res.status, body: await res.json() };
};

let pass = 0, fail = 0;
const check = async (name, fn) => {
    reset();
    try { await fn(); console.log('  ✓', name); pass++; }
    catch (e) { console.log('  ✗', name, '\n      →', e.message); fail++; }
};

console.log('\n── El dominio propio de un distrito ───────────────────');

await check('entrega el SITIO del distrito, con sus ajustes', async () => {
    // El defecto reportado: «entro por app.clubplatform.org y está todo; entro
    // por rotary4281.org y no aparece nada».
    const { status, body } = await get('rotary4281.org');
    assert.equal(status, 200);
    assert.equal(body.resolvedBy, 'district_site');
    assert.equal(body.id, 'sitio');
    assert.equal(body.name, 'Distrito 4281 de Rotary International');
    assert.equal(body.contact.email, 'distrito@rotary4281.org');
    assert.equal(body.colors.primary, '#123456');
    assert.equal(body.modules.memberCount, '100+');
});

await check('da lo mismo cómo se escriba el dominio de la visita', async () => {
    for (const form of ['https://www.rotary4281.org/', 'ROTARY4281.ORG', 'rotary4281.org.']) {
        const { body } = await get(form);
        assert.equal(body.id, 'sitio', `falló con ${form}`);
    }
});

await check('NO elige el club espejo vacío que crea el alta del distrito', async () => {
    // Elegirlo daría exactamente la página en blanco que esto corrige.
    const { body } = await get('rotary4281.org');
    assert.notEqual(body.id, 'espejo');
});

await check('NO elige un club rotario cualquiera del distrito', async () => {
    // `Club.district` la lleva todo club: es el distrito al que pertenece.
    const { body } = await get('rotary4281.org');
    assert.notEqual(body.id, 'club-cali');
});

await check('NO elige un club AFILIADO al distrito, aunque tenga más configuración', async () => {
    // El defecto real de v4.744: `rotary4281.org` sirvió el sitio del Rotary
    // Club Pasto. `Club.districtId` es `affiliatedDistrict` —la afiliación—, no
    // «este club es el sitio del distrito», y Pasto tenía su sitio completo.
    const { body } = await get('rotary4281.org');
    assert.equal(body.id, 'sitio');
    assert.notEqual(body.name, 'Rotary Club Pasto');
});

await check('sin el sitio del distrito, un club afiliado NO ocupa su lugar', async () => {
    stub.DATA.clubs = stub.DATA.clubs.filter((c) => !['sitio', 'espejo'].includes(c.id));
    const { body } = await get('rotary4281.org');
    assert.equal(body.resolvedBy, 'district', 'sirvió el sitio de un club afiliado');
    assert.equal(body.name, 'Distrito 4281');
});

await check('el club de los administradores del distrito rescata al sitio mal tipado', async () => {
    // Si el `type` del sitio quedó cargado como «club», la asignación humana de
    // los administradores del distrito es la que lo identifica.
    stub.DATA.clubs = stub.DATA.clubs.filter((c) => !['sitio', 'espejo'].includes(c.id));
    stub.DATA.clubs.push({
        id: 'mal-tipado', name: 'Distrito 4281 de Rotary International',
        subdomain: 'd4281-mal', domain: null, type: 'club',
        district: '4281', districtId: 'dist-4281',
        settings: [{ key: 'contact_email', value: 'distrito@rotary4281.org' }],
    });
    stub.DATA.users = [{ districtId: 'dist-4281', clubId: 'mal-tipado' }];
    const { body } = await get('rotary4281.org');
    assert.equal(body.id, 'mal-tipado');
    assert.equal(body.resolvedBy, 'district_site');
});

console.log('\n── La marca: manda el sitio, el distrito respalda ─────');

await check('el logotipo del sitio gana al de la ficha del distrito', async () => {
    const { body } = await get('rotary4281.org');
    assert.equal(body.logo, 'https://cdn/sitio-4281.png');
});

await check('un sitio sin logotipo hereda el de la ficha del distrito', async () => {
    stub.DATA.clubs.find((c) => c.id === 'sitio').logo = null;
    const { body } = await get('rotary4281.org');
    assert.equal(body.logo, 'https://cdn/dist-4281.png');
});

console.log('\n── Cuando no hay sitio que servir ─────────────────────');

await check('sin sitio vinculado se sirve la ficha del distrito, no el «Origen»', async () => {
    stub.DATA.clubs = stub.DATA.clubs.filter((c) => c.districtId !== 'dist-4281');
    const { body } = await get('rotary4281.org');
    assert.equal(body.resolvedBy, 'district');
    assert.equal(body.name, 'Distrito 4281');
});

await check('un dominio que no es de nadie sigue cayendo al «Origen», y lo dice', async () => {
    const { body } = await get('dominio-que-no-existe.org');
    assert.equal(body.resolvedBy, 'fallback');
    assert.equal(body.name, 'Rotary ClubPlatform');
});

console.log('\n── Un club por su propio dominio no cambió ────────────');

await check('el camino normal de un club sigue resolviendo primero', async () => {
    stub.DATA.clubs.find((c) => c.id === 'club-cali').domain = 'rotarycali.org';
    const { body } = await get('rotarycali.org');
    assert.equal(body.resolvedBy, 'club');
    assert.equal(body.id, 'club-cali');
});

server.close();
console.log(`\n${fail === 0 ? '✅' : '❌'}  ${pass} pasaron, ${fail} fallaron\n`);
process.exit(fail === 0 ? 0 : 1);
