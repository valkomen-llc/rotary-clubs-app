#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// Prueba del criterio de las carpetas de la Librería de Medios — v4.738
//
//   npm run test:media
//
// Qué se comprueba: qué nombre vale, qué movimiento es legal, cómo se arma el
// árbol y cómo se reparten los conteos. Y que los dos espejos —el del servidor
// y el del navegador— den lo MISMO.
//
// No necesita base, credenciales ni red: por eso el criterio vive en
// `mediaFolders.js`, separado de `routes/media.js`, igual que `seoRules.js`
// vive aparte de `seoAudit.js`.
//
// Necesita esbuild, que no es dependencia del sitio:  npm i --no-save esbuild
// ════════════════════════════════════════════════════════════════════
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const outDir = mkdtempSync(join(tmpdir(), 'media-folders-test-'));
const BUILT = join(outDir, 'mediaFolders.js');
process.on('exit', () => { try { rmSync(outDir, { recursive: true, force: true }); } catch { } });
execFileSync('npx', ['esbuild', 'src/lib/mediaFolders.ts',
    `--outfile=${BUILT}`, '--format=esm', '--platform=neutral'], { stdio: 'pipe' });

const client = await import(BUILT);
const server = await import('../server/lib/mediaFolders.js');

let pass = 0, fail = 0;
const check = (name, fn) => {
    try { fn(); console.log('  ✓', name); pass++; }
    catch (e) { console.log('  ✗', name, '\n      →', e.message); fail++; }
};

// Árbol de trabajo:  Logos ─ 2026 ─ Verano
//                    Fotos
const TREE = [
    { id: 'logos', name: 'Logos', parentId: null },
    { id: '2026', name: '2026', parentId: 'logos' },
    { id: 'verano', name: 'Verano', parentId: '2026' },
    { id: 'fotos', name: 'Fotos', parentId: null },
];

console.log('\n── El nombre de una carpeta ───────────────────────────');

check('«Logos» vale', () => assert.equal(server.validateFolderName('Logos').ok, true));
check('se aceptan tildes y ñ: los clubes escriben en español', () =>
    assert.equal(server.validateFolderName('Año 2026 — Diseño').ok, true));
check('se aceptan espacios y guiones', () =>
    assert.equal(server.validateFolderName('Fotos-Enero 2026').ok, true));
check('se recortan los espacios de los extremos', () =>
    assert.equal(server.validateFolderName('  Logos  ').name, 'Logos'));
check('los espacios repetidos de adentro se colapsan', () =>
    assert.equal(server.validateFolderName('Logos    del   Club').name, 'Logos del Club'));
check('un nombre vacío se rechaza', () =>
    assert.equal(server.validateFolderName('   ').ok, false));
check('«/» se rechaza: se leería como separador de ruta', () =>
    assert.equal(server.validateFolderName('Logos/2026').ok, false));
check('«\\» se rechaza por lo mismo', () =>
    assert.equal(server.validateFolderName('Logos\\2026').ok, false));
check('un carácter de control se rechaza: rompería el JSON', () =>
    assert.equal(server.validateFolderName('Logos\u0007').ok, false));
check('«..» está reservado', () => assert.equal(server.validateFolderName('..').ok, false));
check(`más de ${server.MAX_NAME} caracteres se rechaza`, () =>
    assert.equal(server.validateFolderName('x'.repeat(server.MAX_NAME + 1)).ok, false));
check(`exactamente ${server.MAX_NAME} se acepta`, () =>
    assert.equal(server.validateFolderName('x'.repeat(server.MAX_NAME)).ok, true));
check('el error viene REDACTADO, no como código', () =>
    assert.match(server.validateFolderName('a/b').error, /no puede llevar/));

console.log('\n── Duplicados: misma carpeta, otra caja ───────────────');

check('«Logos» y «logos» son la misma para comparar', () =>
    assert.equal(server.folderKey('Logos'), server.folderKey('  LOGOS ')));
check('pero el nombre se guarda como lo escribió el usuario', () =>
    assert.equal(server.validateFolderName('LoGoS').name, 'LoGoS'));

console.log('\n── Profundidad y descendencia ─────────────────────────');

check('una carpeta de la raíz está en el nivel 0', () =>
    assert.equal(server.depthOf(TREE, 'logos'), 0));
check('una nieta está en el nivel 2', () =>
    assert.equal(server.depthOf(TREE, 'verano'), 2));
check('«Logos» tiene dos descendientes', () =>
    assert.equal(server.descendantsOf(TREE, 'logos').length, 2));
check('una hoja no tiene descendientes', () =>
    assert.equal(server.descendantsOf(TREE, 'verano').length, 0));
check('un ciclo NO cuelga la medición: devuelve Infinity', () => {
    const loop = [{ id: 'a', name: 'A', parentId: 'b' }, { id: 'b', name: 'B', parentId: 'a' }];
    assert.equal(server.depthOf(loop, 'a'), Infinity);
});

console.log('\n── Qué movimiento es legal ────────────────────────────');

check('mover una carpeta dentro de sí misma se rechaza', () =>
    assert.equal(server.canMoveFolder(TREE, 'logos', 'logos').ok, false));
check('mover una carpeta dentro de su propia hija se rechaza', () =>
    assert.equal(server.canMoveFolder(TREE, 'logos', '2026').ok, false));
check('…y dentro de su NIETA también: el ciclo es igual de invisible', () =>
    assert.equal(server.canMoveFolder(TREE, 'logos', 'verano').ok, false));
check('mover a un destino que no existe se rechaza', () =>
    assert.equal(server.canMoveFolder(TREE, 'fotos', 'no-existe').ok, false));
check('mover «Fotos» dentro de «Logos» se permite', () =>
    assert.equal(server.canMoveFolder(TREE, 'fotos', 'logos').ok, true));
check('mover una carpeta a la raíz se permite', () =>
    assert.equal(server.canMoveFolder(TREE, 'verano', null).ok, true));
check('el motivo del rechazo se explica, no se codifica', () =>
    assert.match(server.canMoveFolder(TREE, 'logos', '2026').error, /subcarpetas/));

check('no se puede pasar del límite de profundidad', () => {
    // Cadena de la longitud máxima: n0 (raíz) … nMAX_DEPTH.
    const deep = [];
    for (let i = 0; i <= server.MAX_DEPTH; i++) {
        deep.push({ id: `n${i}`, name: `N${i}`, parentId: i === 0 ? null : `n${i - 1}` });
    }
    deep.push({ id: 'extra', name: 'Extra', parentId: null });
    assert.equal(server.canMoveFolder(deep, 'extra', `n${server.MAX_DEPTH}`).ok, false);
});
check('mover un SUBÁRBOL cuenta su propia altura, no sólo la raíz', () => {
    // «Logos» mide 3 niveles (Logos > 2026 > Verano). Colgarlo de un nivel que
    // deje el total por encima del tope tiene que rechazarse aunque la carpeta
    // movida quepa por sí sola.
    const deep = [...TREE];
    for (let i = 0; i < server.MAX_DEPTH; i++) {
        deep.push({ id: `d${i}`, name: `D${i}`, parentId: i === 0 ? null : `d${i - 1}` });
    }
    assert.equal(server.canMoveFolder(deep, 'logos', `d${server.MAX_DEPTH - 1}`).ok, false);
});

console.log('\n── La migaja de pan ───────────────────────────────────');

check('la ruta de una nieta va de la raíz hacia adentro', () =>
    assert.deepEqual(server.breadcrumbOf(TREE, 'verano').map(c => c.name), ['Logos', '2026', 'Verano']));
check('la de una carpeta de la raíz es sólo ella', () =>
    assert.deepEqual(server.breadcrumbOf(TREE, 'fotos').map(c => c.name), ['Fotos']));
check('una carpeta inexistente da una ruta vacía, no lanza', () =>
    assert.deepEqual(server.breadcrumbOf(TREE, 'no-existe'), []));
check('un ciclo da una ruta vacía en vez de girar sin fin', () => {
    const loop = [{ id: 'a', name: 'A', parentId: 'b' }, { id: 'b', name: 'B', parentId: 'a' }];
    assert.deepEqual(server.breadcrumbOf(loop, 'a'), []);
});

console.log('\n── El árbol ───────────────────────────────────────────');

check('la raíz lleva las carpetas sin padre', () =>
    assert.deepEqual(server.buildFolderTree(TREE).map(n => n.name), ['Fotos', 'Logos']));
check('las hijas cuelgan de su padre', () => {
    const logos = server.buildFolderTree(TREE).find(n => n.name === 'Logos');
    assert.deepEqual(logos.children.map(c => c.name), ['2026']);
});
check('se ordena alfabéticamente, con criterio español', () => {
    const t = server.buildFolderTree([
        { id: '1', name: 'Ñandú', parentId: null },
        { id: '2', name: 'Zapato', parentId: null },
        { id: '3', name: 'Árbol', parentId: null },
    ]);
    assert.deepEqual(t.map(n => n.name), ['Árbol', 'Ñandú', 'Zapato']);
});
check('una carpeta HUÉRFANA se muestra en la raíz, no se pierde', () => {
    // Es la decisión importante: esconderla la volvería irrecuperable desde la
    // pantalla, y una carpeta con archivos adentro no puede desaparecer.
    const t = server.buildFolderTree([{ id: 'x', name: 'Huérfana', parentId: 'fantasma' }]);
    assert.deepEqual(t.map(n => n.name), ['Huérfana']);
});
check('una carpeta que se apunta a sí misma no desaparece', () => {
    const t = server.buildFolderTree([{ id: 'x', name: 'Rara', parentId: 'x' }]);
    assert.equal(t.length, 1);
});

console.log('\n── Los conteos suben a los ancestros ──────────────────');

const counted = server.withRollupCounts(server.buildFolderTree([
    { id: 'logos', name: 'Logos', parentId: null, ownCount: 0 },
    { id: '2026', name: '2026', parentId: 'logos', ownCount: 10 },
    { id: 'verano', name: 'Verano', parentId: '2026', ownCount: 10 },
]));

check('una carpeta sin archivos propios pero con nietas llenas NO dice 0', () =>
    assert.equal(counted[0].totalCount, 20));
check('el conteo PROPIO se conserva aparte', () =>
    assert.equal(counted[0].ownCount, 0));
check('el total de una rama intermedia incluye a sus hijas', () =>
    assert.equal(counted[0].children[0].totalCount, 20));
check('una hoja tiene total igual a lo suyo', () =>
    assert.equal(counted[0].children[0].children[0].totalCount, 10));

console.log('\n── Los dos espejos dicen lo mismo ─────────────────────');

const NAMES = ['Logos', '  logos ', 'a/b', 'a\\b', '..', '', 'Año — Diseño', 'x'.repeat(61)];
for (const n of NAMES) {
    check(`validateFolderName(${JSON.stringify(n)}) coincide`, () =>
        assert.deepEqual(client.validateFolderName(n), server.validateFolderName(n)));
}
for (const [id, target] of [['logos', '2026'], ['fotos', 'logos'], ['verano', null], ['logos', 'logos']]) {
    check(`canMoveFolder(${id} → ${target}) coincide`, () =>
        assert.deepEqual(client.canMoveFolder(TREE, id, target), server.canMoveFolder(TREE, id, target)));
}
check('buildFolderTree da el mismo árbol', () => {
    // Se compara la FORMA —qué cuelga de qué y en qué orden—, no los conteos:
    // el espejo del navegador tipa `ownCount` y lo inicializa, y el servidor
    // sólo lo lleva cuando se lo pasan. Comparar eso mediría la diferencia
    // entre dos firmas, no entre dos criterios.
    const shape = (nodes) => nodes.map(n => ({ id: n.id, name: n.name, children: shape(n.children) }));
    assert.deepEqual(shape(client.buildFolderTree(TREE)), shape(server.buildFolderTree(TREE)));
});
check('breadcrumbOf da la misma ruta', () =>
    assert.deepEqual(client.breadcrumbOf(TREE, 'verano'), server.breadcrumbOf(TREE, 'verano')));
check('MAX_DEPTH y MAX_NAME coinciden', () => {
    assert.equal(client.MAX_DEPTH, server.MAX_DEPTH);
    assert.equal(client.MAX_NAME, server.MAX_NAME);
});

console.log('\n── Lo que sostiene el aislamiento y los datos ─────────');

// Comprobaciones sobre el archivo: son reglas que no se ven ejecutando el
// criterio y que, si se rompen, fallan en silencio o destruyen datos.
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const ROUTES = readFileSync('server/routes/media.js', 'utf8');
const ENSURE = readFileSync('server/lib/ensureMediaFolderSchema.js', 'utf8');
const SCHEMA = readFileSync('server/prisma/schema.prisma', 'utf8');

check('borrar una carpeta NO borra sus archivos', () =>
    assert.ok(!/DELETE FROM "Media"[\s\S]{0,120}"folderId"/.test(ROUTES),
        'apareció un DELETE de Media por carpeta'));
check('al borrar una carpeta, sus archivos suben al padre', () =>
    assert.match(ROUTES, /UPDATE "Media" SET "folderId" = \$1\s*\n?\s*WHERE "folderId" = \$2/));
check('el ensure AGREGA la columna, nunca recrea Media', () => {
    assert.match(ENSURE, /ALTER TABLE "Media" ADD COLUMN IF NOT EXISTS "folderId"/);
    // Sin los comentarios: el propio archivo explica que nunca hace DROP ni
    // TRUNCATE, y esa frase no es una sentencia. Misma lección que en
    // `test:nav`, donde el comentario que explicaba la corrección hacía
    // fallar la comprobación que la protegía.
    assert.ok(!/DROP TABLE|TRUNCATE/.test(stripComments(ENSURE)),
        'el ensure lleva una sentencia destructiva');
});
check('la columna está declarada TAMBIÉN en schema.prisma', () =>
    // El guardián de db:push compara TABLAS, no columnas: una columna que
    // existiera sólo en el ensure la borraría el primer `npm run db:push`.
    assert.match(SCHEMA, /model Media \{[\s\S]*?folderId\s+String\?/));
check('la tabla MediaFolder NO está en Prisma (se crea en runtime)', () =>
    assert.ok(!/model MediaFolder\b/.test(SCHEMA)));
check('el índice de nombres únicos contempla la raíz aparte', () =>
    // En Postgres NULL nunca es igual a NULL: sin un índice propio para
    // parentId IS NULL, dos carpetas de la raíz podrían llamarse igual.
    assert.match(ENSURE, /MediaFolder_root_name_key[\s\S]*?WHERE "parentId" IS NULL/));
check('no se usa ON CONFLICT contra los índices parciales', () =>
    // Un ON CONFLICT contra un índice parcial tiene que repetir su predicado o
    // la sentencia falla entera (error real, corregido en v4.648).
    assert.ok(!/ON CONFLICT[\s\S]{0,200}MediaFolder/.test(ROUTES)));
check('toda consulta de carpetas se acota por sitio', () => {
    const queries = ROUTES.match(/FROM "MediaFolder"[\s\S]{0,200}?(?=`)/g) || [];
    assert.ok(queries.length > 0, 'no se encontró ninguna consulta de MediaFolder');
    for (const q of queries) {
        assert.ok(/clubId" IS NOT DISTINCT FROM/.test(q), `consulta sin acotar por sitio: ${q.slice(0, 80)}`);
    }
});

console.log(`\n${fail === 0 ? '✅' : '❌'}  ${pass} pasaron, ${fail} fallaron\n`);
process.exit(fail === 0 ? 0 : 1);
