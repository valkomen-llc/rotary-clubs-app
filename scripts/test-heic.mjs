#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// Prueba de la conversión HEIC → JPEG — v4.739
//
//   npm run test:heic
//
// Tres cosas se comprueban acá:
//
//   1. La DETECCIÓN: qué cuenta como HEIC. Es el criterio puro, y el caso que
//      importa —el iPhone— llega con el tipo MIME vacío, así que mirar sólo el
//      MIME dejaría pasar justamente lo que hay que resolver.
//
//   2. La ORIENTACIÓN: `orientationOps` se contrasta contra la rotación
//      automática de sharp, que es la implementación de referencia del EXIF.
//      Comparar píxel a píxel las ocho orientaciones es la única forma de saber
//      que el orden «espejar y después rotar» es el correcto; razonarlo a mano
//      es exactamente como se equivoca uno con las cuatro espejadas.
//
//   3. La CONVERSIÓN de punta a punta, con FFmpeg y sharp de verdad. El archivo
//      de prueba lo fabrica sharp: es un HEIF con AV1, que es la única variante
//      que sus binarios saben ESCRIBIR. No es el HEVC del iPhone —eso se
//      verificó a mano con seis archivos HEIC reales—, pero ejercita el mismo
//      camino: contenedor HEIF → ffmpeg → PNG → sharp → JPEG. Y no necesita red
//      ni un archivo binario versionado en el repositorio.
//
// No necesita base de datos ni credenciales.
// ════════════════════════════════════════════════════════════════════
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const server = await import('../server/lib/heicImages.js');
const sharpMod = await import('sharp');
const sharp = sharpMod.default || sharpMod;

// El espejo del navegador se compila al vuelo, como en el resto de las pruebas.
const outDir = mkdtempSync(join(tmpdir(), 'heic-test-'));
process.on('exit', () => { try { rmSync(outDir, { recursive: true, force: true }); } catch { } });
const BUILT = join(outDir, 'heicImages.js');
execFileSync('npx', ['esbuild', 'src/lib/heicImages.ts',
    `--outfile=${BUILT}`, '--format=esm', '--platform=neutral'], { stdio: 'pipe' });
const client = await import(BUILT);

let pass = 0, fail = 0;
const check = async (name, fn) => {
    try { await fn(); console.log('  ✓', name); pass++; }
    catch (e) { console.log('  ✗', name, '\n      →', e.message); fail++; }
};

console.log('\n── Qué cuenta como HEIC ───────────────────────────────');

const CASES = [
    // [nombre, mime, esperado, por qué]
    ['IMG_0421.HEIC', '', true, 'el caso del iPhone: extensión en mayúsculas y MIME vacío'],
    ['foto.heic', 'image/heic', true, 'nombre y MIME, los dos'],
    ['foto.heif', 'image/heif', true, 'la otra extensión de la familia'],
    ['foto.hif', '', true, '.hif, que usan algunas cámaras'],
    ['captura.png', 'image/png', false, 'un PNG no se toca'],
    ['foto.jpg', 'image/jpeg', false, 'un JPEG tampoco'],
    ['documento.pdf', 'application/pdf', false, 'un PDF tampoco'],
    ['sin-extension', 'image/heic', true, 'sólo el MIME alcanza'],
    ['algo.heic', 'application/octet-stream', true, 'MIME genérico, extensión clara'],
    ['video.mp4', 'video/mp4', false, 'un video no'],
    ['heic.jpg', 'image/jpeg', false, 'la palabra en el nombre no basta: importa la extensión'],
];
for (const [filename, mimetype, expected, why] of CASES) {
    await check(`${filename} + ${JSON.stringify(mimetype)} → ${expected} (${why})`, () =>
        assert.equal(server.isHeicFile({ filename, mimetype }), expected));
}
await check('sin argumentos no revienta', () => assert.equal(server.isHeicFile(), false));
await check('con nulos tampoco', () =>
    assert.equal(server.isHeicFile({ filename: null, mimetype: null }), false));
await check('un MIME con parámetros se reconoce igual', () =>
    assert.equal(server.isHeicFile({ filename: 'x', mimetype: 'image/heic; charset=binary' }), true));

console.log('\n── El nombre y la clave del archivo convertido ────────');

await check('«Foto Playa.HEIC» → «Foto Playa.jpg»', () =>
    assert.equal(server.jpegNameFor('Foto Playa.HEIC'), 'Foto Playa.jpg'));
await check('se respeta el resto del nombre, puntos incluidos', () =>
    assert.equal(server.jpegNameFor('viaje.2026.heic'), 'viaje.2026.jpg'));
await check('la clave de S3 conserva su ruta', () =>
    assert.equal(server.jpegKeyFor('clubs/abc/images/1-foto.heic'), 'clubs/abc/images/1-foto.jpg'));
await check('sin clave devuelve null, no una cadena rota', () =>
    assert.equal(server.jpegKeyFor(null), null));
await check('un nombre vacío no produce «.jpg» a secas', () =>
    assert.equal(server.jpegNameFor(''), 'imagen.jpg'));

console.log('\n── La orientación, contra la referencia de sharp ──────');

// Un patrón asimétrico en las dos direcciones: con un cuadrado liso o con una
// figura simétrica, una rotación equivocada daría el mismo resultado y la
// prueba pasaría sin comprobar nada.
const patternPng = await sharp({
    create: { width: 60, height: 40, channels: 3, background: { r: 20, g: 20, b: 20 } }
})
    .composite([
        { input: await sharp({ create: { width: 20, height: 10, channels: 3, background: { r: 240, g: 30, b: 30 } } }).png().toBuffer(), top: 0, left: 0 },
        { input: await sharp({ create: { width: 8, height: 24, channels: 3, background: { r: 30, g: 240, b: 30 } } }).png().toBuffer(), top: 12, left: 46 },
    ])
    // `.removeAlpha()` no es decorativo: `composite` deja un canal alfa, y
    // entonces la referencia —que pasa por JPEG, sin alfa— y nuestro camino
    // tendrían distinta cantidad de canales y la comparación se caería sin
    // llegar a mirar la geometría.
    .removeAlpha().png().toBuffer();

for (const orientation of [1, 2, 3, 4, 5, 6, 7, 8]) {
    await check(`orientación ${orientation}: nuestras operaciones = la rotación automática de sharp`, async () => {
        // Referencia: se ETIQUETA la imagen y se deja que sharp la enderece.
        //
        // El portador es PNG, no JPEG, y esa elección es la que hace útil a esta
        // prueba: con JPEG la comparación hay que hacerla con tolerancia —los
        // bordes duros del patrón producen diferencias de ±64 hasta en la
        // orientación 1, que no gira nada—, y una tolerancia así de ancha deja
        // pasar errores de geometría reales. Con PNG los píxeles se comparan
        // EXACTOS. PNG lleva la etiqueta EXIF y sharp la respeta: comprobado.
        const tagged = await sharp(patternPng).withMetadata({ orientation }).png().toBuffer();
        const reference = await sharp(tagged).rotate().raw().toBuffer({ resolveWithObject: true });

        // Nuestro camino: los píxeles SIN etiqueta —como los entrega ffmpeg— y
        // las operaciones aplicadas a mano.
        const { flop, rotate } = server.orientationOps(orientation);
        let mine = sharp(patternPng);
        if (flop) mine = mine.flop();
        if (rotate) mine = mine.rotate(rotate);
        const got = await mine.raw().toBuffer({ resolveWithObject: true });

        assert.equal(got.info.width, reference.info.width, 'ancho distinto');
        assert.equal(got.info.height, reference.info.height, 'alto distinto');
        assert.ok(Buffer.compare(got.data, reference.data) === 0,
            'los píxeles no coinciden: la imagen queda girada o espejada de otra forma');
    });
}

await check('una orientación desconocida no inventa una rotación', () => {
    for (const value of [undefined, null, 0, 9, 'x', NaN]) {
        assert.deepEqual(server.orientationOps(value), { flop: false, rotate: 0 });
    }
});

console.log('\n── La conversión de punta a punta ─────────────────────');

// Un HEIF de verdad, fabricado con sharp (AV1: la variante que sabe escribir).
const heifSource = await sharp({
    create: { width: 320, height: 200, channels: 3, background: { r: 10, g: 90, b: 180 } }
}).heif({ compression: 'av1' }).toBuffer();

await check('el archivo de prueba es un HEIF de verdad', async () => {
    const meta = await sharp(heifSource).metadata();
    assert.equal(meta.format, 'heif');
    assert.equal(meta.width, 320);
});

await check('convertHeicToJpeg devuelve un JPEG legible del tamaño correcto', async () => {
    const out = await server.convertHeicToJpeg(heifSource);
    const meta = await sharp(out.buffer).metadata();
    assert.equal(meta.format, 'jpeg', 'no salió un JPEG');
    assert.equal(meta.width, 320);
    assert.equal(meta.height, 200);
    assert.equal(out.width, 320);
    assert.equal(out.height, 200);
});

await check('el JPEG conserva el contenido, no sale en negro', async () => {
    const out = await server.convertHeicToJpeg(heifSource);
    const stats = await sharp(out.buffer).stats();
    const [r, g, b] = stats.channels.map(c => c.mean);
    // El fondo es (10, 90, 180): se comprueba que el azul domine y que no sea
    // una imagen vacía. Con tolerancia amplia, porque pasa por dos códecs.
    assert.ok(b > g && g > r, `los canales no se parecen al original: ${[r, g, b].map(Math.round)}`);
    assert.ok(b > 100, `el azul se perdió: ${Math.round(b)}`);
});

await check('una imagen grande se acota al máximo pedido', async () => {
    const big = await sharp({
        create: { width: 1200, height: 800, channels: 3, background: { r: 200, g: 50, b: 50 } }
    }).heif({ compression: 'av1' }).toBuffer();
    const out = await server.convertHeicToJpeg(big, { maxDimension: 600 });
    assert.equal(out.width, 600);
    assert.equal(out.height, 400);
});

await check('un archivo que no es HEIC hace fallar la conversión, no la finge', async () => {
    const png = await sharp({ create: { width: 10, height: 10, channels: 3, background: { r: 0, g: 0, b: 0 } } }).png().toBuffer();
    await assert.rejects(() => server.convertHeicToJpeg(Buffer.concat([Buffer.from('basura'), png])));
});

console.log('\n── Los dos espejos dicen lo mismo ─────────────────────');

for (const [filename, mimetype] of CASES.map(c => [c[0], c[1]])) {
    await check(`isHeicFile(${filename}) coincide`, () =>
        assert.equal(client.isHeicFile({ filename, mimetype }), server.isHeicFile({ filename, mimetype })));
}
await check('jpegNameFor coincide', () => {
    for (const n of ['a.HEIC', 'b.heif', 'c.jpg', '', 'x.2.heic']) {
        assert.equal(client.jpegNameFor(n), server.jpegNameFor(n));
    }
});
await check('las dos listas de extensiones y de MIME coinciden', () => {
    assert.deepEqual(client.HEIC_EXTENSIONS, server.HEIC_EXTENSIONS);
    assert.deepEqual(client.HEIC_MIME_TYPES, server.HEIC_MIME_TYPES);
});

console.log('\n── Lo que sostiene el flujo de subida ─────────────────');

const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const ROUTES = stripComments(readFileSync('server/routes/media.js', 'utf8'));

await check('los DOS caminos de subida convierten', () => {
    // `/save` (subida directa a S3 con URL prefirmada) y `/upload` (multipart).
    // Que uno solo lo haga daría resultados distintos según la pantalla.
    assert.ok(/toDisplayableImage\(/.test(ROUTES), 'no se usa la conversión en las subidas');
    assert.ok((ROUTES.match(/toDisplayableImage\(/g) || []).length >= 2,
        'sólo uno de los dos caminos de subida convierte');
});
await check('el HEIC original se retira DESPUÉS de subir el JPEG', () => {
    const save = ROUTES.slice(ROUTES.indexOf("router.post('/save'"), ROUTES.indexOf("router.post('/upload'"));
    const put = save.indexOf('PutObjectCommand');
    const del = save.indexOf('DeleteObjectCommand({ Bucket: bucket, Key: s3Key })');
    assert.ok(put > -1 && del > put, 'se borra el original antes de tener el JPEG arriba');
});
await check('una conversión fallida NO pierde el archivo', () => {
    // `toDisplayableImage` devuelve lo que entró cuando falla, y la fila se
    // guarda igual: no poder mostrarlo es malo, perderlo es peor.
    const src = readFileSync('server/routes/media.js', 'utf8');
    assert.match(src, /converted: false, error: err\.message/);
});
await check('el tipo de un HEIC es «image», no «document»', () =>
    // Si cayera en «document» no aparecería ni en el filtro de imágenes.
    assert.match(ROUTES, /isHeicFile\(\{ filename, mimetype \}\)\) return 'image'/));

console.log(`\n${fail === 0 ? '✅' : '❌'}  ${pass} pasaron, ${fail} fallaron\n`);
process.exit(fail === 0 ? 0 : 1);
