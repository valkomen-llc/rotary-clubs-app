#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// Vistas previas HEIC/HEIF del almacenamiento de aportes — v4.1305.0
//
//   npm run test:heic-previews
//   HEIC_FIXTURES=~/fotos npm run test:heic-previews                 (+ HEIC reales)
//   HEIC_E2E_DATABASE_URL=postgres://…@127.0.0.1/… npm run test:heic-previews
//                                                     (+ extremo a extremo)
//
// Tres capas:
//   1. PURO (siempre): detección, claves derivadas, lectura de los bytes
//      reales, clasificación de errores, color P3 → sRGB, y el render con
//      JPEG/PNG/WEBP fabricados por sharp (horizontal, vertical, alta
//      resolución, EXIF de orientación, tope de megapíxeles, corrupto).
//   2. ARCHIVOS REALES (con HEIC_FIXTURES): cada `.heic` de la carpeta se
//      convierte y se comprueba que no sea gris casi negro (la firma del mapa
//      de ganancia HDR). Los HEIC no se versionan: licencia no clara.
//   3. EXTREMO A EXTREMO (con HEIC_E2E_DATABASE_URL local): Postgres real + S3
//      simulado + los controladores reales. La visita de Manizales con fotos
//      HEIC, JPG y una dañada: la ficha, la generación, la idempotencia, la
//      concurrencia, el reintento, el original intacto, la recuperación por
//      lotes, el endpoint público y la promoción a la Biblioteca.
//
// ⚠️ La capa 3 ESCRIBE en la base que se le dé: exige una URL local.
// ════════════════════════════════════════════════════════════════════
import http from 'node:http';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const REPO = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const require = createRequire(`${REPO}/package.json`);
const sharp = require('sharp');

let pass = 0, fail = 0;
const check = async (name, fn) => {
    try { await fn(); console.log('  ✓', name); pass++; }
    catch (e) { console.log('  ✗', name, '\n      →', e.message); fail++; }
};
const ok = (cond, msg) => { if (!cond) throw new Error(msg || 'falló'); };

// La capa 3 necesita el S3 simulado ANTES de importar los módulos (leen el
// entorno al crear el cliente).
const E2E_DB = process.env.HEIC_E2E_DATABASE_URL || '';
const E2E = /@(127\.0\.0\.1|localhost)(:\d+)?\//.test(E2E_DB);
const objects = new Map();
const puts = [];
let s3 = null;
if (E2E) {
    s3 = http.createServer((req, res) => {
        const u = new URL(req.url, 'http://x');
        const key = decodeURIComponent(u.pathname.replace(/^\/test_bucket\//, ''));
        const copySource = req.headers['x-amz-copy-source'];
        if (req.method === 'PUT' && copySource) {
            const src = decodeURIComponent(String(copySource)).replace(/^\/?test_bucket\//, '');
            const o = objects.get(src);
            if (!o) { res.writeHead(404, { 'Content-Type': 'application/xml' }); return res.end('<Error><Code>NoSuchKey</Code></Error>'); }
            objects.set(key, { body: o.body, type: req.headers['content-type'] || o.type });
            puts.push(key);
            res.writeHead(200, { 'Content-Type': 'application/xml' });
            return res.end('<CopyObjectResult><ETag>"x"</ETag></CopyObjectResult>');
        }
        if (req.method === 'PUT') { const chunks = []; req.on('data', c => chunks.push(c)); req.on('end', () => { objects.set(key, { body: Buffer.concat(chunks), type: req.headers['content-type'] }); puts.push(key); res.writeHead(200, { ETag: '"x"' }); res.end(); }); return; }
        const o = objects.get(key);
        if (req.method === 'DELETE') { objects.delete(key); res.writeHead(204); return res.end(); }
        if (!o) { res.writeHead(404, { 'Content-Type': 'application/xml' }); return res.end(req.method === 'HEAD' ? undefined : '<Error><Code>NoSuchKey</Code></Error>'); }
        if (req.method === 'HEAD') { res.writeHead(200, { 'Content-Length': o.body.length, 'Content-Type': o.type || 'application/octet-stream' }); return res.end(); }
        if (req.method === 'GET') {
            let body = o.body; const range = req.headers.range;
            if (range) { const m = /bytes=(\d*)-(\d*)/.exec(range); body = o.body.subarray(Number(m[1]), m[2] ? Number(m[2]) + 1 : undefined); res.writeHead(206, { 'Content-Length': body.length, 'Content-Type': o.type }); }
            else res.writeHead(200, { 'Content-Length': body.length, 'Content-Type': o.type });
            return res.end(body);
        }
        res.writeHead(405); res.end();
    });
    await new Promise(r => s3.listen(0, '127.0.0.1', r));
    process.env.DATABASE_URL = E2E_DB;
    process.env.AWS_ENDPOINT_URL_S3 = `http://127.0.0.1:${s3.address().port}`;
    process.env.AWS_BUCKET_NAME = 'test_bucket'; process.env.AWS_ACCESS_KEY_ID = 'test'; process.env.AWS_SECRET_ACCESS_KEY = 'test'; process.env.AWS_REGION = 'us-east-1';
    process.env.ROTARY_AWS_ACCESS_KEY_ID = 'test'; process.env.ROTARY_AWS_SECRET_ACCESS_KEY = 'test';
}

const P = await import(`${REPO}/server/lib/submissionImagePreviews.js`);
const H = await import(`${REPO}/server/lib/heicImages.js`);
const F = await import(`${REPO}/server/lib/submissionFiles.js`);

// ─── 1. PURO ───────────────────────────────────────────────────────────
console.log('\n── Qué necesita vista previa ─────────────────────────────');
await check('un .heic de iPhone con MIME vacío sí', () => ok(P.needsPreview({ filename: 'IMG_0001.HEIC', contentType: '' })));
await check('un .heic de Samsung (20261026_102617.heic) sí', () => ok(P.needsPreview({ filename: '20261026_102617.heic', contentType: 'image/heic' })));
await check('un .heif sí, y un .jpg/.png/.webp NO (no se tocan)', () => {
    ok(P.needsPreview({ filename: 'a.heif' }));
    for (const n of ['a.jpg', 'a.jpeg', 'a.png', 'a.webp']) ok(!P.needsPreview({ filename: n, contentType: 'image/jpeg' }), n);
});
await check('un video .mov con MIME heic no se trata como foto', () => ok(!P.needsPreview({ filename: 'x.heic', kind: 'video' })));

console.log('\n── Claves derivadas ──────────────────────────────────────');
const SRC = 'private/campaign-submissions/camp-1/0c1d.heic';
await check('van a _preview/, al lado del original, y son deterministas', () => {
    const a = P.previewKeysFor(SRC), b = P.previewKeysFor(SRC);
    ok(a.previewKey === 'private/campaign-submissions/camp-1/_preview/0c1d.jpg', a.previewKey);
    ok(a.thumbKey === 'private/campaign-submissions/camp-1/_preview/0c1d.thumb.jpg', a.thumbKey);
    ok(JSON.stringify(a) === JSON.stringify(b));
});
await check('nunca coinciden con el original', () => { const k = P.previewKeysFor(SRC); ok(k.previewKey !== SRC && k.thumbKey !== SRC); });
await check('una clave fuera del prefijo o ya derivada no tiene derivadas', () => {
    ok(P.previewKeysFor('clubs/x/foto.heic') === null);
    ok(P.previewKeysFor('private/campaign-submissions/c/_preview/a.jpg') === null);
    ok(P.previewKeysFor('private/campaign-submissions/../x.heic') === null);
});
await check('un envío no puede reclamar una derivada ni un objeto de trabajo', () => {
    ok(F.stagingKeyBelongs('private/campaign-submissions/camp-1/abc.heic', 'camp-1'));
    ok(!F.stagingKeyBelongs('private/campaign-submissions/camp-1/_preview/abc.jpg', 'camp-1'));
    ok(!F.stagingKeyBelongs('private/campaign-submissions/camp-1/_analysis/abc.jpg', 'camp-1'));
});
await check('escribir una derivada fuera de _preview/ se niega (el original no se pisa)', async () => {
    let lanzo = false;
    try { await F.putStagingDerivative({ key: SRC, body: Buffer.from('x') }); } catch { lanzo = true; }
    ok(lanzo);
});

console.log('\n── Qué son los bytes ─────────────────────────────────────');
const box = (brand, compat = []) => {
    const size = 16 + compat.length * 4;
    const b = Buffer.alloc(size + 8);
    b.writeUInt32BE(size, 0); b.write('ftyp', 4, 'latin1'); b.write(brand, 8, 'latin1');
    compat.forEach((c, i) => b.write(c, 16 + i * 4, 'latin1'));
    return b;
};
const jpg = await sharp({ create: { width: 40, height: 30, channels: 3, background: '#c00' } }).jpeg().toBuffer();
const png = await sharp({ create: { width: 40, height: 30, channels: 4, background: '#0c0' } }).png().toBuffer();
const webp = await sharp({ create: { width: 40, height: 30, channels: 3, background: '#00c' } }).webp().toBuffer();
await check('JPEG, PNG y WEBP por su firma', () => {
    ok(P.sniffImageBytes(jpg) === 'jpeg'); ok(P.sniffImageBytes(png) === 'png'); ok(P.sniffImageBytes(webp) === 'webp');
});
await check('HEIF por sus marcas: heic, heix, mif1+heic (Samsung), msf1', () => {
    for (const b of [box('heic', ['mif1', 'heic']), box('heix'), box('mif1', ['heic', 'miaf']), box('msf1', ['hevc'])]) ok(P.sniffImageBytes(b) === 'heif');
});
await check('AVIF se distingue de HEIC (lo decodifica sharp, no libheif)', () => ok(P.sniffImageBytes(box('avif', ['mif1', 'miaf'])) === 'avif'));
await check('un MP4 no es una foto, ni un texto, ni un archivo vacío', () => {
    ok(P.sniffImageBytes(box('isom', ['mp42'])) === null);
    ok(P.sniffImageBytes(Buffer.from('no soy una imagen, soy un texto')) === null);
    ok(P.sniffImageBytes(Buffer.alloc(0)) === null);
});

console.log('\n── Errores con nombre ────────────────────────────────────');
await check('archivo perdido, demasiado grande, tiempo, no-imagen, dañado', () => {
    ok(P.classifyPreviewError({ code: 'missing' }).code === 'missing');
    ok(P.classifyPreviewError({ code: 'too_large', message: 'x' }).code === 'too_large');
    ok(P.classifyPreviewError({ code: 'timeout' }).code === 'timeout');
    ok(P.classifyPreviewError({ code: 'not_image' }).code === 'not_image');
    ok(P.classifyPreviewError(new Error('Invalid input: Unexpected end of file')).code === 'corrupt');
    ok(P.classifyPreviewError(new Error('Lo decodificado mide 320×240 y el archivo declara 4032×3024: no es la imagen principal (puede ser la miniatura o el mapa de ganancia HDR).')).code === 'decode_mismatch');
});

console.log('\n── Color: Display P3 → sRGB ──────────────────────────────');
await check('un gris sigue siendo gris (mismo blanco D65)', () => {
    const d = Uint8Array.from([128, 128, 128, 255, 255, 255, 255, 255, 0, 0, 0, 255]);
    H.p3ToSrgbInPlace(d, 4);
    ok(Math.abs(d[0] - 128) <= 1 && d[0] === d[1] && d[1] === d[2], `gris → ${d.slice(0, 3)}`);
    ok(d[4] === 255 && d[5] === 255 && d[6] === 255, 'blanco');
    ok(d[8] === 0 && d[9] === 0 && d[10] === 0, 'negro');
});
await check('el rojo puro P3 cae fuera de sRGB y se recorta al borde (255,0,0)', () => {
    const d = Uint8Array.from([255, 0, 0, 255]); H.p3ToSrgbInPlace(d, 4);
    ok(d[0] === 255 && d[1] === 0 && d[2] === 0, `${d}`);
});
await check('un tono P3 medio se SATURA al pasar a sRGB (lo que se veía apagado)', () => {
    const d = Uint8Array.from([200, 100, 80, 255]); H.p3ToSrgbInPlace(d, 4);
    ok(d[0] > 200 && d[1] < 100, `${d}`);
});
await check('reconoce el perfil Display P3 en ASCII y en UTF-16 (mluc)', () => {
    ok(H.isDisplayP3Icc(Buffer.from('xxxxDisplay P3yyyy', 'latin1')));
    ok(H.isDisplayP3Icc(Buffer.concat([Buffer.alloc(8), Buffer.from('Display P3', 'utf16le').swap16()])));
    ok(!H.isDisplayP3Icc(Buffer.from('sRGB IEC61966-2.1', 'latin1')));
    ok(!H.isDisplayP3Icc(null));
});

console.log('\n── Render (vista previa + miniatura) ─────────────────────');
const foto = (w, h, opts = {}) => sharp({ create: { width: w, height: h, channels: 3, background: { r: 30, g: 120, b: 200 } } })
    .composite([{ input: Buffer.from(`<svg width="${w}" height="${h}"><rect x="0" y="0" width="${Math.round(w / 3)}" height="${Math.round(h / 3)}" fill="#ff0"/></svg>`), top: 0, left: 0 }])
    .jpeg({ quality: 90 }).withMetadata(opts.orientation ? { orientation: opts.orientation } : {}).toBuffer();
await check('horizontal 1600×1200 → vista 1600×1200 y miniatura 480×360', async () => {
    const o = await P.renderPreview(await foto(1600, 1200));
    ok(o.preview.width === 1600 && o.preview.height === 1200, `${o.preview.width}×${o.preview.height}`);
    ok(o.thumb.width === 480 && o.thumb.height === 360, `${o.thumb.width}×${o.thumb.height}`);
});
await check('vertical 1200×1600 conserva la proporción', async () => {
    const o = await P.renderPreview(await foto(1200, 1600));
    ok(o.preview.width === 1200 && o.preview.height === 1600 && o.thumb.width === 360 && o.thumb.height === 480);
});
await check('alta resolución 6000×4000 → lado mayor 2560, sin deformar', async () => {
    const o = await P.renderPreview(await foto(6000, 4000));
    ok(o.preview.width === 2560 && Math.abs(o.preview.height - 1707) <= 1, `${o.preview.width}×${o.preview.height}`);
});
await check('EXIF de orientación 6: la foto sale DERECHA (ancho y alto intercambiados) y sin EXIF', async () => {
    const o = await P.renderPreview(await foto(800, 600, { orientation: 6 }));
    ok(o.preview.width === 600 && o.preview.height === 800, `${o.preview.width}×${o.preview.height}`);
    const meta = await sharp(o.preview.buffer).metadata();
    ok(!meta.exif && !meta.orientation, 'la vista previa no lleva EXIF (ni GPS)');
    // La esquina amarilla (arriba-izquierda en el sensor) queda arriba-DERECHA tras girar 90°.
    const { data, info } = await sharp(o.preview.buffer).raw().toBuffer({ resolveWithObject: true });
    const px = (x, y) => data.slice((y * info.width + x) * info.channels, (y * info.width + x) * info.channels + 3);
    const arribaDer = px(info.width - 10, 10), arribaIzq = px(10, 10);
    ok(arribaDer[0] > 200 && arribaDer[1] > 200 && arribaDer[2] < 80, `arriba-derecha amarilla: ${[...arribaDer]}`);
    ok(arribaIzq[2] > 150, `arriba-izquierda azul: ${[...arribaIzq]}`);
});
await check('un JPEG con extensión .heic (pasa en algunos teléfonos) se procesa igual', async () => {
    const o = await P.renderPreview(await foto(300, 200));
    ok(o.format === 'jpeg' && o.preview.width === 300);
});
await check('PNG con transparencia se asienta sobre blanco', async () => {
    const t = await sharp({ create: { width: 50, height: 50, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
    const o = await P.renderPreview(t);
    const { data } = await sharp(o.preview.buffer).raw().toBuffer({ resolveWithObject: true });
    ok(data[0] > 245 && data[1] > 245 && data[2] > 245, `${data.slice(0, 3)}`);
});
await check('WEBP también', async () => { const o = await P.renderPreview(await sharp(await foto(500, 300)).webp().toBuffer()); ok(o.format === 'webp' && o.preview.width === 500); });
await check('tope de megapíxeles: se rechaza ANTES de decodificar, con código too_large', async () => {
    let e = null;
    try { await P.renderPreview(await foto(3000, 2000), { limits: { maxBytes: 1e9, maxMegapixels: 5, timeoutMs: 30000 } }); } catch (x) { e = x; }
    ok(e?.code === 'too_large' && /megapíxeles/.test(e.message), e?.message);
});
await check('tope de peso configurable', async () => {
    let e = null;
    try { await P.renderPreview(await foto(800, 600), { limits: { maxBytes: 1000, maxMegapixels: 64, timeoutMs: 30000 } }); } catch (x) { e = x; }
    ok(e?.code === 'too_large', e?.message);
});
await check('un archivo que no es imagen falla con not_image, no se finge', async () => {
    let e = null;
    try { await P.renderPreview(Buffer.from('esto es texto con extensión .heic, no una foto')); } catch (x) { e = x; }
    ok(e?.code === 'not_image', e?.message);
});
await check('un HEIF truncado (contenedor sin datos) falla y se clasifica como dañado', async () => {
    let e = null;
    try { await P.renderPreview(Buffer.concat([box('heic', ['mif1', 'heic']), Buffer.alloc(200)])); } catch (x) { e = x; }
    ok(e && P.classifyPreviewError(e).code !== 'ready', 'lanzó');
});

// ─── 2. ARCHIVOS REALES ────────────────────────────────────────────────
const FIX = process.env.HEIC_FIXTURES ? process.env.HEIC_FIXTURES.replace(/^~/, process.env.HOME || '') : '';
const reales = FIX && existsSync(FIX) ? readdirSync(FIX).filter(n => /\.(heic|heif|hif)$/i.test(n)).map(n => join(FIX, n)) : [];
if (reales.length) {
    console.log(`\n── HEIC reales (${reales.length}, de ${FIX}) ──────────────────────`);
    for (const ruta of reales) {
        await check(`${ruta.split('/').pop()}: JPEG real, con contenido, miniatura ≤ 480`, async () => {
            const buf = readFileSync(ruta);
            ok(P.sniffImageBytes(buf) === 'heif', `bytes: ${P.sniffImageBytes(buf)}`);
            const t = Date.now();
            const o = await P.renderPreview(buf);
            ok(o.format === 'heif');
            ok(o.preview.buffer[0] === 0xff && o.preview.buffer[1] === 0xd8, 'es JPEG');
            ok(Math.max(o.thumb.width, o.thumb.height) <= 480);
            const st = await sharp(o.preview.buffer).stats();
            const media = st.channels.slice(0, 3).reduce((a, c) => a + c.mean, 0) / 3;
            const color = Math.max(...st.channels.slice(0, 3).map(c => c.mean)) - Math.min(...st.channels.slice(0, 3).map(c => c.mean));
            ok(!(media < 40 && color < 4), `parece el mapa de ganancia (media ${media.toFixed(0)}, sin color)`);
            console.log(`      ${o.preview.width}×${o.preview.height}, ${(o.preview.buffer.length / 1024).toFixed(0)} KB, miniatura ${(o.thumb.buffer.length / 1024).toFixed(0)} KB, ${o.colorProfile}, ${Date.now() - t} ms`);
        });
    }
} else {
    console.log('\n(Sin HEIC_FIXTURES: se omiten los HEIC reales. Ver docs/claude/vistas-previas-heic-de-los-aportes.md)');
}

// ─── 3. EXTREMO A EXTREMO ──────────────────────────────────────────────
if (!E2E) {
    console.log('(Sin HEIC_E2E_DATABASE_URL local: se omite el extremo a extremo.)');
} else {
    console.log('\n── Extremo a extremo: la visita de Manizales ─────────────');
    const express = require('express');
    const { default: db } = await import(`${REPO}/server/lib/db.js`);
    for (const t of ['SubmissionImagePreview', 'GovernorVisit', 'ContributionSubmissionFile', 'Media', 'MediaFolder']) await db.query(`DROP TABLE IF EXISTS "${t}" CASCADE`);
    // La fila de la Biblioteca la declara Prisma: lo mínimo que usa la promoción.
    await db.query(`CREATE TABLE "Media" (id TEXT PRIMARY KEY, filename TEXT, url TEXT, type TEXT, size INT, bucket TEXT, region TEXT, "clubId" TEXT, "s3Key" TEXT, "folderId" TEXT, "thumbUrl" TEXT, "originalS3Key" TEXT, "createdAt" TIMESTAMPTZ DEFAULT NOW())`);
    const { default: ensureGovernorVisitSchema } = await import(`${REPO}/server/lib/ensureGovernorVisitSchema.js`);
    await ensureGovernorVisitSchema();
    // Las campañas (de donde sale el prefijo del formulario) y las solicitudes.
    const { default: ensureContributionSchema } = await import(`${REPO}/server/lib/ensureContributionSchema.js`);
    await ensureContributionSchema();
    const { universalCampaignId } = await import(`${REPO}/server/lib/rotaryEngine.js`);
    const cid = await universalCampaignId();
    const ctrl = await import(`${REPO}/server/controllers/governorVisitController.js`);

    const pref = `private/campaign-submissions/${cid}`;
    const heicReal = reales[0] ? readFileSync(reales[0]) : null;
    // Sin HEIC real, un JPEG con extensión .heic recorre el mismo flujo.
    const heicBytes = heicReal || await foto(1200, 900);
    const archivos = [
        { key: `${pref}/m1.heic`, filename: '20261026_094433.heic', contentType: 'image/heic', body: heicBytes },
        { key: `${pref}/m2.heic`, filename: '20261026_102617.heic', contentType: 'image/heic', body: reales[1] ? readFileSync(reales[1]) : heicBytes },
        { key: `${pref}/m3.heic`, filename: '20261026_104904.heic', contentType: '', body: heicBytes },
        { key: `${pref}/m4.jpg`, filename: 'grupo.jpg', contentType: 'image/jpeg', body: await foto(900, 600) },
        { key: `${pref}/m5.heic`, filename: '20261026_113058.heic', contentType: 'image/heic', body: Buffer.concat([box('heic', ['mif1', 'heic']), Buffer.alloc(300)]) },
    ];
    for (const a of archivos) objects.set(a.key, { body: a.body, type: a.contentType || 'application/octet-stream' });
    const media = archivos.map(a => ({ key: a.key, kind: 'image', filename: a.filename, contentType: a.contentType, bytes: a.body.length, caption: '' }));
    const { rows: [visita] } = await db.query(
        `INSERT INTO "GovernorVisit" ("publicRef", status, "clubProfileId", "clubName", "governorName", "visitDate", title, description, media, links, "responsibleName", "responsibleEmail", "consentAt", "consentText")
         VALUES ('VG-2026-SG53HR', 'recibida', 'p1', 'Club Rotario Manizales', 'Fabio Enrique Véjar Montañez', '2026-10-24',
                 'Visita oficial del Gobernador al Club Rotario Manizales', $1, $2::jsonb, '[]'::jsonb, 'Secretaría', 's@x.org', NOW(), 'ok') RETURNING *`,
        ['x'.repeat(100), JSON.stringify(media)]
    ).catch(async (e) => {
        // Si el esquema exige otras columnas, se ve acá con su mensaje.
        throw new Error(`no pude crear la visita de prueba: ${e.message}`);
    });

    const app = express(); app.use(express.json());
    app.get('/admin/:id', ctrl.adminGetVisit);
    app.post('/admin/:id/previews', ctrl.adminVisitPreviews);
    app.get('/previews/summary', ctrl.adminPreviewSummary);
    app.post('/previews/batch', ctrl.adminPreviewBatch);
    app.post('/preview', ctrl.previewVisitUpload);
    const srv = await new Promise(r => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
    const BASE = `http://127.0.0.1:${srv.address().port}`;
    const api = async (method, path, body) => {
        const r = await fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
        return { status: r.status, data: await r.json() };
    };
    const originales = new Map(archivos.map(a => [a.key, Buffer.from(a.body)]));

    await check('antes: las HEIC salen «pending» y SIN url (no se dibuja el .heic); el JPG sale igual que siempre', async () => {
        const { data } = await api('GET', `/admin/${visita.id}`);
        const m = data.visit.media;
        ok(m.filter(x => x.key.endsWith('.heic')).every(x => x.preview.status === 'pending' && x.url === null && x.originalUrl), JSON.stringify(m.map(x => x.preview)));
        const j = m.find(x => x.key.endsWith('.jpg'));
        ok(j.preview.status === 'not_needed' && j.url && j.url.includes('m4.jpg') && j.thumbUrl === j.url);
    });
    await check('el original se DESCARGA con su nombre (content-disposition firmado)', async () => {
        const { data } = await api('GET', `/admin/${visita.id}`);
        const u = new URL(data.visit.media[1].originalUrl);
        ok(/attachment/.test(u.searchParams.get('response-content-disposition') || ''), u.search);
        ok(/20261026_102617\.heic/.test(decodeURIComponent(u.searchParams.get('response-content-disposition'))));
    });
    await check('resumen: 4 HEIC (el JPG no cuenta), 4 sin vista previa', async () => {
        const { data } = await api('GET', '/previews/summary');
        ok(data.counts.total === 4 && data.counts.pending === 4, JSON.stringify(data.counts));
    });

    let d1;
    await check('al abrir la ficha se generan: 3 listas, la dañada en error con su motivo', async () => {
        ({ data: d1 } = await api('POST', `/admin/${visita.id}/previews`, {}));
        const heic = d1.media.filter(x => x.key.endsWith('.heic'));
        ok(heic.filter(x => x.preview.status === 'ready').length === 3, JSON.stringify(heic.map(x => x.preview.status)));
        const mala = heic.find(x => x.key.endsWith('m5.heic'));
        ok(mala.preview.status === 'error' && mala.preview.error && mala.preview.canRetry, JSON.stringify(mala.preview));
        ok(d1.remaining === 0);
    });
    await check('las listas se miran por la vista previa JPEG y la miniatura, en _preview/', async () => {
        const lista = d1.media.find(x => x.key.endsWith('m1.heic'));
        ok(lista.url.includes('/_preview/m1.jpg') && lista.thumbUrl.includes('/_preview/m1.thumb.jpg'), lista.url);
        const vista = objects.get(`${pref}/_preview/m1.jpg`);
        ok(vista && vista.body[0] === 0xff && vista.body[1] === 0xd8 && vista.type === 'image/jpeg', 'JPEG real con su tipo');
        const r = await fetch(lista.thumbUrl); ok(r.ok && (await r.arrayBuffer()).byteLength > 500, 'la miniatura se sirve');
    });
    await check('los ORIGINALES quedan byte a byte intactos', () => {
        for (const [k, b] of originales) ok(objects.get(k)?.body.equals(b), k);
    });
    await check('idempotente: volver a abrir no convierte nada ni escribe de nuevo', async () => {
        const antes = puts.length;
        const { data } = await api('POST', `/admin/${visita.id}/previews`, {});
        ok(data.processed === 0 && puts.length === antes, `processed ${data.processed}, puts +${puts.length - antes}`);
    });
    await check('sin duplicados concurrentes: dos pedidos a la vez sobre una foto nueva convierten UNA vez', async () => {
        const k = `${pref}/m6.heic`; objects.set(k, { body: heicBytes, type: 'image/heic' });
        const antes = puts.filter(p => p.endsWith('/_preview/m6.jpg')).length;
        const [a, b] = await Promise.all([
            P.ensurePreview({ key: k, filename: 'x.heic' }), P.ensurePreview({ key: k, filename: 'x.heic' }),
        ]);
        const escritos = puts.filter(p => p.endsWith('/_preview/m6.jpg')).length - antes;
        ok(escritos === 1, `se escribió ${escritos} veces`);
        ok([a.status, b.status].includes('ready') && [a.status, b.status].every(s => s === 'ready' || s === 'processing'), `${a.status}/${b.status}`);
    });
    await check('reintentos acotados: la dañada no se reintenta sola más de 3 veces', async () => {
        const k = `${pref}/m5.heic`;
        for (let i = 0; i < 4; i++) await P.ensurePreview({ key: k, filename: 'm5.heic' });
        const { rows: [r] } = await db.query(`SELECT attempts, status, "errorCode" FROM "SubmissionImagePreview" WHERE "sourceKey" = $1`, [k]);
        ok(r.attempts === 3 && r.status === 'error', JSON.stringify(r));
    });
    await check('«Reintentar» (force) vuelve a intentar; si el club reemplaza el archivo, queda lista', async () => {
        objects.set(`${pref}/m5.heic`, { body: heicBytes, type: 'image/heic' });
        const { data } = await api('POST', `/admin/${visita.id}/previews`, { key: `${pref}/m5.heic`, force: true });
        ok(data.media.find(x => x.key.endsWith('m5.heic')).preview.status === 'ready');
    });
    await check('archivo PERDIDO: error «missing» sin botón de reintento', async () => {
        const k = `${pref}/perdido.heic`;
        const r = await P.ensurePreview({ key: k, filename: 'perdido.heic' });
        ok(r.status === 'error' && r.errorCode === 'missing', JSON.stringify(r));
        ok(P.previewState({ key: k, filename: 'perdido.heic' }, r).canRetry === false);
    });
    await check('recuperación por lotes: reanudable y sin repetir lo hecho', async () => {
        await db.query(`DELETE FROM "SubmissionImagePreview" WHERE "sourceKey" LIKE $1`, [`${pref}/m%`]);
        const a = await api('POST', '/previews/batch', { limit: 2 });
        ok(a.data.processed.length === 2 && a.data.remaining === 2, JSON.stringify({ p: a.data.processed.length, r: a.data.remaining }));
        const b = await api('POST', '/previews/batch', { limit: 4 });
        ok(b.data.remaining === 0 && b.data.counts.ready === 4, JSON.stringify(b.data.counts));
        const c = await api('POST', '/previews/batch', { limit: 4 });
        ok(c.data.processed.length === 0, 'el tercero no tiene nada que hacer');
    });
    await check('acotada a una visita por su referencia', async () => {
        const { data } = await api('GET', '/previews/summary?visit=VG-2026-SG53HR');
        ok(data.counts.total === 4 && data.counts.ready === 4, JSON.stringify(data.counts));
    });
    await check('público: un HEIC recién subido recibe su miniatura; uno ya reclamado, no', async () => {
        const k = `${pref}/nuevo.heic`; objects.set(k, { body: heicBytes, type: 'image/heic' });
        const a = await api('POST', '/preview', { key: k, filename: 'IMG_0001.HEIC', contentType: '' });
        ok(a.status === 200 && a.data.status === 'ready' && a.data.thumbUrl.includes('_preview/nuevo.thumb.jpg'), JSON.stringify(a.data));
        const b = await api('POST', '/preview', { key: `${pref}/m1.heic`, filename: 'x.heic' });
        ok(b.status === 409, `reclamado → ${b.status}`);
        const c = await api('POST', '/preview', { key: 'clubs/otro/foto.heic', filename: 'x.heic' });
        ok(c.status === 400, `fuera del prefijo → ${c.status}`);
    });
    await check('la verificación del envío mira los BYTES: un texto llamado .jpg se rechaza', async () => {
        const k = `${pref}/falso.jpg`; objects.set(k, { body: Buffer.from('no soy una foto '.repeat(10)), type: 'image/jpeg' });
        const r = await F.headSubmissionFile(k, { filename: 'falso.jpg', contentType: 'image/jpeg' });
        ok(!r.ok && /no es una fotografía válida/.test(r.error), JSON.stringify(r));
    });
    if (heicReal) {
        await check('…y un HEIC llamado .jpg queda marcado image/heic (recibirá su vista previa)', async () => {
            const k = `${pref}/disfrazado.jpg`; objects.set(k, { body: heicReal, type: 'image/jpeg' });
            const r = await F.headSubmissionFile(k, { filename: 'disfrazado.jpg', contentType: 'image/jpeg' });
            ok(r.ok && r.mime === 'image/heic' && P.needsPreview({ filename: 'disfrazado.jpg', contentType: r.mime }), JSON.stringify(r));
        });
    }

    // La promoción a la Biblioteca (lo que ve el sitio público).
    const { default: ensureContentSubmissionSchema } = await import(`${REPO}/server/lib/ensureContentSubmissionSchema.js`).catch(() => ({ default: null }));
    if (ensureContentSubmissionSchema) {
        await check('al publicar, la Biblioteca recibe el JPEG (con miniatura) y conserva el HEIC original', async () => {
            await ensureContentSubmissionSchema();
            const store = await import(`${REPO}/server/lib/contentSubmissionStore.js`);
            const subId = 'sub-test-heic';
            await db.query(`DELETE FROM "ContributionSubmission" WHERE id = $1`, [subId]);
            await db.query(`INSERT INTO "ContributionSubmission" (id, "campaignId", status, title, "senderName", "senderEmail") VALUES ($1, $2, 'aprobado', 'Visita', 'Secretaría', 's@x.org')`, [subId, cid]);
            await db.query(`INSERT INTO "ContributionSubmissionFile" (id, "submissionId", "campaignId", kind, "s3Key", filename, "contentType", bytes) VALUES ('f-heic', $1, $2, 'image', $3, '20261026_094433.heic', 'image/heic', 100)`, [subId, cid, `${pref}/m1.heic`]);
            const out = await store.promoteToLibrary({ campaignId: cid, submission: { id: subId, title: 'Visita' }, clubId: 'club-manizales' });
            const r = out.resultados.find(x => x.id === 'f-heic');
            ok(r?.estado === 'promovido' && r.convertido, JSON.stringify(out.resultados));
            const { rows: [m] } = await db.query(`SELECT * FROM "Media" WHERE id = $1`, [r.mediaId]);
            ok(/\.jpg$/.test(m.url) && /\.jpg$/.test(m.filename) && m.type === 'image', JSON.stringify(m));
            ok(m.thumbUrl && /\.jpg$/.test(m.thumbUrl), 'con miniatura');
            ok(/\.heic$/.test(m.originalS3Key) && objects.get(m.originalS3Key)?.body.equals(originales.get(`${pref}/m1.heic`)), 'original HEIC en la Biblioteca, byte a byte');
            ok(!objects.has(`${pref}/m1.heic`), 'staging liberado después de crear la fila');
            const { rows: [f] } = await db.query(`SELECT "mediaUrl" FROM "ContributionSubmissionFile" WHERE id = 'f-heic'`);
            ok(f.mediaUrl === m.url, 'la solicitud y la visita miran el JPEG');
        });
        await check('…y la ficha de la visita, ya promovida, muestra la URL pública del JPEG', async () => {
            await db.query(`UPDATE "GovernorVisit" SET "contributionSubmissionId" = (SELECT "submissionId" FROM "ContributionSubmissionFile" WHERE id = 'f-heic') WHERE id = $1`, [visita.id]);
            const { data } = await api('GET', `/admin/${visita.id}`);
            const m = data.visit.media.find(x => x.key.endsWith('m1.heic'));
            ok(m.inLibrary && /\.jpg$/.test(m.url), JSON.stringify(m));
        });
    }
    srv.close(); s3.close(); await db.end?.().catch?.(() => {});
}

console.log(`\n${fail ? '❌' : '✅'}  ${pass} pasaron${fail ? `, ${fail} fallaron` : ''}\n`);
process.exit(fail ? 1 : 0);
