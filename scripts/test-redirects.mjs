#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// Redirecciones de enlaces por sitio
//
//   npm run test:redirects
//
// Qué se comprueba: qué regla se acepta, a dónde manda, que los dos espejos
// —servidor y navegador— digan LO MISMO, y que la lectura por dominio funcione
// también para un distrito, cuyo dominio vive en otra tabla.
//
// No necesita Postgres, credenciales ni red: la base se sustituye en memoria
// con un hook de resolución de módulos.
// Necesita esbuild para el espejo del navegador:  npm i --no-save esbuild
// ════════════════════════════════════════════════════════════════════
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { register } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const HERE = pathToFileURL(`${process.cwd()}/`).href;
const STUB = new URL('./scripts/fixtures/db-redirects-stub.mjs', HERE).href;
register(
    `data:text/javascript,export async function resolve(s,c,n){return (s==='./db.js'||s.endsWith('/lib/db.js'))?{url:${JSON.stringify(STUB)},shortCircuit:true}:n(s,c)}`,
    HERE
);

const S = await import('../server/lib/linkRedirects.js');

const outDir = mkdtempSync(join(tmpdir(), 'redir-test-'));
process.on('exit', () => { try { rmSync(outDir, { recursive: true, force: true }); } catch { } });
const BUILT = join(outDir, 'linkRedirects.js');
execFileSync('npx', ['esbuild', 'src/lib/linkRedirects.ts',
    `--outfile=${BUILT}`, '--format=esm', '--platform=neutral'], { stdio: 'pipe' });
const C = await import(BUILT);

let pass = 0, fail = 0;
const check = (name, fn) => {
    try { fn(); console.log('  ✓', name); pass++; }
    catch (e) { console.log('  ✗', name, '\n      →', e.message); fail++; }
};

console.log('\n── La forma canónica de la dirección corta ────────────');

const FROM = [
    ['/conferencia', '/conferencia', 'ya está limpia'],
    ['conferencia', '/conferencia', 'sin barra inicial'],
    ['/Conferencia', '/conferencia', 'mayúsculas'],
    ['  /conferencia  ', '/conferencia', 'espacios alrededor'],
    ['/conferencia/', '/conferencia', 'barra final'],
    ['//conferencia', '/conferencia', 'barra doble'],
    ['/conferencia?x=1', '/conferencia', 'con query'],
    ['/conferencia#top', '/conferencia', 'con ancla: el navegador no la manda al servidor'],
    ['https://rotary4281.org/conferencia', '/conferencia', 'pegada entera desde el navegador'],
    ['', '', 'vacía'],
    [null, '', 'nula'],
];
for (const [input, expected, why] of FROM) {
    check(`${JSON.stringify(input)} → ${JSON.stringify(expected)} (${why})`, () =>
        assert.equal(S.normalizeFrom(input), expected));
}

console.log('\n── Qué regla se acepta ────────────────────────────────');

check('una regla normal se acepta', () =>
    assert.equal(S.validateRule({ from: '/polio', to: 'https://endpolio.org' }).ok, true));
check('un destino interno también', () =>
    assert.equal(S.validateRule({ from: '/conferencia', to: '/eventos' }).ok, true));
check('la PORTADA no se puede redirigir', () =>
    // Redirigir `/` deja el sitio entero inaccesible desde su propio dominio.
    assert.equal(S.validateRule({ from: '/', to: '/x' }).ok, false));
check('`/admin` tampoco: dejaría al administrador sin panel', () => {
    assert.equal(S.validateRule({ from: '/admin', to: '/x' }).ok, false);
    assert.equal(S.validateRule({ from: '/admin/configuracion', to: '/x' }).ok, false);
});
check('ni ninguna otra dirección del sistema', () => {
    for (const p of ['/api/clubs', '/assets/app.js', '/media/x.png', '/login']) {
        assert.equal(S.validateRule({ from: p, to: '/x' }).ok, false, p);
    }
});
check('un destino `javascript:` se rechaza', () =>
    // El campo lo llena un administrador y el valor termina en una cabecera
    // Location: aceptar cualquier esquema sería un hueco por donde inyectar.
    assert.equal(S.validateRule({ from: '/x', to: 'javascript:alert(1)' }).ok, false));
check('un destino `//otrositio.com` se rechaza', () =>
    // Parece una ruta interna y el navegador lo trata como externo.
    assert.equal(S.validateRule({ from: '/x', to: '//evil.com' }).ok, false));
check('origen y destino iguales se rechazan: sería un bucle', () =>
    assert.equal(S.validateRule({ from: '/x', to: '/x' }).ok, false));
check('un origen repetido se rechaza', () =>
    assert.equal(S.validateRule({ from: '/x', to: '/b' }, [{ from: '/X/', to: '/a' }]).ok, false));
check('el motivo del rechazo viene redactado', () =>
    // El panel lo muestra tal cual; un booleano no le dice nada a nadie.
    assert.match(S.validateRule({ from: '/admin', to: '/x' }).error, /sistema/));

console.log('\n── La lista guardada se sanea ─────────────────────────');

check('lo inservible se descarta y lo bueno sobrevive', () => {
    const out = S.sanitizeRules([
        { from: '/polio', to: 'https://endpolio.org' },
        { from: '/admin', to: '/x' },
        { from: '', to: '' },
        { from: '/Conferencia/', to: '/eventos', permanent: true },
    ]);
    assert.deepEqual(out, [
        { from: '/polio', to: 'https://endpolio.org', permanent: false },
        { from: '/conferencia', to: '/eventos', permanent: true },
    ]);
});
check('una entrada que no es lista no rompe nada', () => {
    assert.deepEqual(S.sanitizeRules(null), []);
    assert.deepEqual(S.sanitizeRules('{}'), []);
});

console.log('\n── A dónde manda ──────────────────────────────────────');

const RULES = [{ from: '/polio', to: 'https://endpolio.org' }, { from: '/x', to: '/eventos' }];
check('coincide exacto, sin importar mayúsculas ni barra final', () =>
    assert.equal(S.matchRule('/Polio/', RULES).to, 'https://endpolio.org'));
check('una dirección sin regla no redirige', () =>
    assert.equal(S.matchRule('/noticias', RULES), null));
check('la portada nunca redirige, aunque haya una regla', () =>
    assert.equal(S.matchRule('/', [{ from: '/', to: '/x' }]), null));
check('una dirección del sistema nunca redirige, aunque haya una regla', () =>
    // Segunda barrera: en la base puede haber una regla escrita antes de que
    // existiera la validación, y no puede dejar el panel inaccesible.
    assert.equal(S.matchRule('/admin', [{ from: '/admin', to: '/x' }]), null));

check('la query de la visita viaja al destino', () =>
    // `?utm_source=…` es lo que distingue de dónde vino el clic.
    assert.equal(S.buildTarget({ from: '/p', to: 'https://endpolio.org' }, { search: '?utm_source=wa' }),
        'https://endpolio.org?utm_source=wa'));
check('si el destino ya trae query, se suma con &', () =>
    assert.equal(S.buildTarget({ from: '/p', to: 'https://x.org/a?ref=1' }, { search: '?b=2' }),
        'https://x.org/a?ref=1&b=2'));
check('sin query, el destino queda limpio', () =>
    assert.equal(S.buildTarget({ from: '/p', to: '/eventos' }), '/eventos'));

console.log('\n── Los dos espejos dicen LO MISMO ─────────────────────');

const CASES = [
    { from: '/conferencia', to: 'https://ejemplo.org' },
    { from: 'Conferencia/', to: '/eventos' },
    { from: '/admin', to: '/x' },
    { from: '/', to: '/x' },
    { from: '/x', to: 'javascript:alert(1)' },
    { from: '/x', to: '//evil.com' },
    { from: '', to: '' },
    { from: '/x  y', to: '/z' },
];
for (const c of CASES) {
    check(`«${c.from}» → «${c.to}»: servidor y navegador coinciden`, () => {
        assert.deepEqual(S.normalizeRule(c), C.normalizeRule(c));
        assert.deepEqual(S.validateRule(c), C.validateRule(c));
        assert.equal(S.isReserved(c.from), C.isReserved(c.from));
        assert.equal(S.isAcceptableTarget(c.to), C.isAcceptableTarget(c.to));
    });
}
check('sanear la misma lista da lo mismo en los dos', () =>
    assert.deepEqual(S.sanitizeRules(CASES), C.sanitizeRules(CASES)));
check('los dos declaran las mismas direcciones reservadas', () =>
    assert.deepEqual(S.RESERVED_PREFIXES, C.RESERVED_PREFIXES));

console.log('\n── Leer las redirecciones de un dominio ───────────────');

const store = await import('../server/lib/linkRedirectStore.js');
const stub = await import(STUB);

const leer = async (host) => { stub.reset(); store.invalidateRedirectCache(); return store.readRedirectsForHost(host); };

const club = await leer('rotaryclubcali.org');
check('las trae por el dominio del club', () =>
    assert.deepEqual(club, [{ from: '/donar', to: 'https://donar.org', permanent: false }]));

const conWww = await leer('www.rotaryclubcali.org');
check('da lo mismo que la visita venga con www', () =>
    assert.deepEqual(conWww, club));

const distrito = await leer('rotary4281.org');
check('un DISTRITO por su dominio propio llega a las de su sitio', () =>
    // El dominio del distrito vive en la fila de `District` y el contenido en
    // la de `Club` (v4.744). Con el atajo del módulo de SEO —que sólo mira
    // `Club.domain`— este caso devolvería una lista vacía en silencio.
    assert.deepEqual(distrito, [{ from: '/conferencia', to: 'https://inscripciones.org', permanent: true }]));

const nadie = await leer('dominio-que-no-existe.org');
check('un dominio de nadie no redirige nada', () => assert.deepEqual(nadie, []));

stub.reset(); stub.setFail(true); store.invalidateRedirectCache();
const roto = await store.readRedirectsForHost('rotaryclubcali.org');
stub.setFail(false);
check('si la consulta falla, se devuelve vacío y la página se sirve igual', () =>
    // Esto corre en el catch-all: una excepción acá dejaría el sitio caído.
    assert.deepEqual(roto, []));

console.log('\n── El enganche en el servidor ─────────────────────────');

const API = readFileSync('api/index.js', 'utf8');
check('el salto es HTTP, no un `<Navigate>` de React', () => {
    // Un rastreador y la vista previa de WhatsApp no ejecutan JavaScript.
    assert.match(API, /res\.redirect\(rule\.permanent \? 301 : 302, target\)/);
});
check('se resuelve ANTES de servir el documento', () => {
    const iRedir = API.indexOf('Redirecciones de enlaces del sitio');
    const iDoc = API.indexOf('renderPublicDocument');
    assert.ok(iRedir > 0 && iRedir < iDoc, 'la redirección quedó después del documento');
});
check('una redirección temporal no se cachea', () =>
    // Es lo que permite corregirla y que el cambio se note en la visita
    // siguiente; la permanente la elige el administrador sabiéndolo.
    assert.match(API, /if \(!rule\.permanent\) res\.setHeader\('Cache-Control', 'no-store'\)/));

const CTRL = readFileSync('server/controllers/clubController.js', 'utf8');
check('el servidor SANEA al guardar, no sólo la pantalla', () =>
    assert.match(CTRL, /JSON\.stringify\(sanitizeRules\(linkRedirects\)\)/));
check('guardar limpia la caché: la redirección se puede probar en seguida', () =>
    assert.match(CTRL, /invalidateRedirectCache\(\)/));

const PANEL = readFileSync('src/pages/admin/ClubSettings.tsx', 'utf8');
check('el panel usa el MISMO criterio, no una copia propia', () =>
    assert.match(PANEL, /validateRule as validateRedirectRule/));

console.log(`\n${fail === 0 ? '✅' : '❌'}  ${pass} pasaron, ${fail} fallaron\n`);
process.exit(fail === 0 ? 0 : 1);
