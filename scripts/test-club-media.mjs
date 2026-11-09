#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
// Archivos del Directorio Distrital de Clubes — prueba SIN red — v4.1306.0
//   npm run test:club-media
//
// El criterio puro (formatos, topes, nombres, referencias dentro del
// formulario), el procesamiento real de imágenes con sharp (orientación,
// transparencia, metadatos, contenido falso) y las trampas estructurales que
// causaron el reporte «no deja subir el logo».
// ════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const REPO = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
let failed = 0;
let passed = 0;
const check = async (name, fn) => {
    try { await fn(); passed++; console.log(`  ✓ ${name}`); }
    catch (e) { failed++; console.log(`  ✗ ${name}\n      ${e?.message || e}`); }
};

const S = await import(`${REPO}/server/lib/clubMediaSpec.js`);

console.log('\n1. Qué se acepta y con qué tope');
await check('PNG, JPG, WEBP y HEIC se aceptan', () => {
    for (const [filename, contentType] of [['logo.png', 'image/png'], ['foto.JPG', 'image/jpeg'], ['x.webp', 'image/webp'], ['IMG_0001.HEIC', 'image/heic']]) {
        assert.ok(S.checkUploadMeta({ role: 'logo', filename, contentType, size: 1000 }).ok, filename);
    }
});
await check('un .heic de Android con el tipo VACÍO se acepta (el servidor mira los bytes)', () => {
    const v = S.checkUploadMeta({ role: 'gallery', filename: '20261026_102617.heic', contentType: '', size: 2_000_000 });
    assert.ok(v.ok);
    assert.equal(v.uploadType, 'image/heic');
});
await check('un archivo sin extensión pero con tipo image/jpeg se acepta', () => {
    assert.ok(S.checkUploadMeta({ role: 'cover', filename: 'image', contentType: 'image/jpeg', size: 10 }).ok);
});
await check('SVG NO (no hay sanitización): ni por tipo ni por extensión', () => {
    assert.equal(S.checkUploadMeta({ role: 'logo', filename: 'logo.svg', contentType: 'image/svg+xml', size: 10 }).code, 'format');
    assert.equal(S.checkUploadMeta({ role: 'logo', filename: 'logo.svg', contentType: '', size: 10 }).code, 'format');
});
await check('PDF y GIF se rechazan con un mensaje claro', () => {
    const v = S.checkUploadMeta({ role: 'logo', filename: 'logo.pdf', contentType: 'application/pdf', size: 10 });
    assert.equal(v.code, 'format');
    assert.match(v.hint, /PNG, JPG, WEBP o HEIC/);
    assert.equal(S.checkUploadMeta({ role: 'gallery', filename: 'a.gif', contentType: 'image/gif', size: 10 }).code, 'format');
});
await check('LA CAUSA DEL REPORTE: sin tamaño, el juicio dice «vacío» (el formulario viejo nunca mandaba `size`)', () => {
    assert.equal(S.checkUploadMeta({ role: 'logo', filename: 'logo.png', contentType: 'image/png' }).code, 'empty');
});
await check('el exceso de peso dice el límite EXACTO y una salida', () => {
    const max = S.maxBytesFor('logo');
    const v = S.checkUploadMeta({ role: 'logo', filename: 'logo.png', contentType: 'image/png', size: max + 1 });
    assert.equal(v.code, 'too_large');
    assert.match(v.error, /15 MB/);
    assert.ok(v.hint);
});
await check('los topes se configuran por entorno sin tocar código', () => {
    assert.equal(S.maxBytesFor('gallery', { CLUB_MEDIA_MAX_MB_GALLERY: '50' }), 50 * 1024 * 1024);
    assert.equal(S.maxBytesFor('gallery', { CLUB_MEDIA_MAX_MB_GALLERY: 'basura' }), 30 * 1024 * 1024);
    assert.equal(S.galleryMax({ CLUB_MEDIA_GALLERY_MAX: '12' }), 12);
});
await check('un campo desconocido se rechaza', () => {
    assert.equal(S.checkUploadMeta({ role: 'otro', filename: 'a.png', contentType: 'image/png', size: 1 }).code, 'role');
});
await check('nombres seguros para mostrar (sin rutas ni caracteres de control)', () => {
    assert.equal(S.safeDisplayName('../../etc/passwd'), '.. .. etc passwd');
    assert.equal(S.safeDisplayName('logo\u0000<script>.png'), 'logo script .png');
    assert.equal(S.safeDisplayName(''), 'imagen');
});

console.log('\n2. Referencias dentro del formulario');
const ID = '0f8fad5b-d9cb-469f-a165-70867728950e';
const ID2 = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
await check('la URL estable y la pública dan el mismo id', () => {
    assert.equal(S.mediaIdFromUrl(`/api/district-clubs/media/${ID}`), ID);
    assert.equal(S.mediaIdFromUrl(`https://b.s3.us-east-1.amazonaws.com/directorio-clubes/perfil-1/${ID}.png`), ID);
    assert.equal(S.mediaIdFromUrl('https://otro.sitio/logo.png'), null);
    assert.equal(S.mediaIdFromUrl(''), null);
});
await check('rewriteMediaUrls reemplaza lo del módulo, quita lo vacío y no toca lo ajeno', () => {
    const p = { logoUrl: `/api/district-clubs/media/${ID}`, coverImageUrl: 'https://legado/c.jpg', gallery: [{ url: `/api/district-clubs/media/${ID2}`, isMain: true }, { url: 'https://legado/g.jpg' }] };
    const out = S.rewriteMediaUrls(p, (id) => (id === ID ? 'https://pub/logo.png' : ''));
    assert.equal(out.logoUrl, 'https://pub/logo.png');
    assert.equal(out.coverImageUrl, 'https://legado/c.jpg');
    assert.deepEqual(out.gallery.map(g => g.url), ['https://legado/g.jpg']);
    assert.deepEqual(S.mediaIdsIn(p).sort(), [ID, ID2].sort());
});
await check('la contraseña del portal no se guarda en un borrador', () => {
    const out = S.stripSecrets({ officialName: 'X', password: 'secreta123', confirmPassword: 'secreta123' });
    assert.deepEqual(out, { officialName: 'X' });
});

console.log('\n3. Espejo navegador ↔ servidor');
const ts = readFileSync(`${REPO}/src/lib/clubMediaSpec.ts`, 'utf8');
const arr = (src, name) => JSON.parse(src.match(new RegExp(`export const ${name}[^=]*=\\s*(\\[[^\\]]*\\])`))[1].replace(/'/g, '"').replace(/,\s*\]$/, ']'));
await check('mismas extensiones y tipos aceptados', () => {
    assert.deepEqual(arr(ts, 'ACCEPTED_EXTENSIONS'), S.ACCEPTED_EXTENSIONS);
    assert.deepEqual(arr(ts, 'ACCEPTED_MIME'), S.ACCEPTED_MIME);
});
await check('mismos topes por defecto', () => {
    const m = ts.match(/DEFAULT_MAX_MB[^=]*=\s*\{\s*logo:\s*(\d+),\s*cover:\s*(\d+),\s*gallery:\s*(\d+)/);
    assert.deepEqual([+m[1], +m[2], +m[3]], ['logo', 'cover', 'gallery'].map(r => S.maxBytesFor(r, {}) / 1048576));
    assert.equal(+ts.match(/DEFAULT_GALLERY_MAX\s*=\s*(\d+)/)[1], S.galleryMax({}));
});

console.log('\n4. Procesamiento REAL de la imagen (sharp)');
const sharp = (await import('sharp')).default;
const { processImage, ClubMediaError } = await import(`${REPO}/server/lib/clubMediaStore.js`);
const codeOf = async (p) => { try { await p; return 'ok'; } catch (e) { assert.ok(e instanceof ClubMediaError, e?.message); return e.code; } };

await check('logo PNG transparente → PNG con transparencia conservada', async () => {
    const png = await sharp({ create: { width: 400, height: 300, channels: 4, background: { r: 0, g: 80, b: 160, alpha: 0 } } }).png().toBuffer();
    const out = await processImage(png, 'logo');
    assert.equal(out.outputType, 'image/png');
    const meta = await sharp(out.buffer).metadata();
    assert.ok(meta.hasAlpha);
    assert.equal(meta.width, 400);
});
await check('foto JPG de un teléfono acostada (EXIF 6) → enderezada y SIN metadatos (GPS fuera)', async () => {
    const jpg = await sharp({ create: { width: 800, height: 600, channels: 3, background: '#c00' } })
        .jpeg()
        .withMetadata({ orientation: 6, exif: { IFD0: { Make: 'Telefono', Model: 'Modelo X' }, IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '4/1 36/1 0/1' } } })
        .toBuffer();
    const before = await sharp(jpg).metadata();
    assert.ok(before.exif, 'la entrada lleva EXIF');
    const out = await processImage(jpg, 'gallery');
    const meta = await sharp(out.buffer).metadata();
    assert.equal(out.outputType, 'image/jpeg');
    assert.equal(meta.width, 600, 'quedó vertical');
    assert.equal(meta.height, 800);
    assert.equal(meta.exif, undefined, 'sin EXIF');
    assert.equal(meta.orientation, undefined);
});
await check('una foto enorme se reduce a la medida de publicación', async () => {
    const big = await sharp({ create: { width: 6000, height: 4000, channels: 3, background: '#0a0' } }).jpeg({ quality: 60 }).toBuffer();
    const out = await processImage(big, 'cover');
    assert.equal(Math.max(out.width, out.height), 2560);
});
await check('un WEBP se acepta y sale JPEG (logo sin transparencia también)', async () => {
    const webp = await sharp({ create: { width: 300, height: 300, channels: 3, background: '#00f' } }).webp().toBuffer();
    assert.equal((await processImage(webp, 'gallery')).outputType, 'image/jpeg');
    assert.equal((await processImage(webp, 'logo')).outputType, 'image/jpeg');
});
await check('un JPEG con nombre .heic (pasa en algunos teléfonos) se procesa por su contenido', async () => {
    const jpg = await sharp({ create: { width: 300, height: 200, channels: 3, background: '#888' } }).jpeg().toBuffer();
    const out = await processImage(jpg, 'gallery');
    assert.equal(out.format, 'jpeg');
    assert.equal(out.converted, false);
});
await check('texto disfrazado de .png → not_image (no se confía en la extensión)', async () => {
    assert.equal(await codeOf(processImage(Buffer.from('<?php echo "hola"; ?> esto no es una imagen'), 'logo')), 'not_image');
});
await check('un SVG con script → not_image', async () => {
    assert.equal(await codeOf(processImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), 'logo')), 'not_image');
});
await check('una imagen diminuta (16 px) → too_small', async () => {
    const tiny = await sharp({ create: { width: 16, height: 16, channels: 3, background: '#000' } }).png().toBuffer();
    assert.equal(await codeOf(processImage(tiny, 'logo')), 'too_small');
});
await check('un JPEG cortado a la mitad → error comprensible, no un 500', async () => {
    const jpg = await sharp({ create: { width: 900, height: 900, channels: 3, background: '#123' } }).jpeg().toBuffer();
    const code = await codeOf(processImage(jpg.subarray(0, 200), 'gallery'));
    assert.ok(['corrupt', 'ok'].includes(code), code);
});
await check('un contenedor HEIF que no decodifica → código «heic» con instrucciones', async () => {
    const box = Buffer.alloc(64);
    box.writeUInt32BE(24, 0); box.write('ftyp', 4, 'latin1'); box.write('heic', 8, 'latin1'); box.write('mif1', 16, 'latin1'); box.write('heic', 20, 'latin1');
    const err = await processImage(box, 'gallery').then(() => null, e => e);
    assert.equal(err?.code, 'heic');
    assert.match(err.hint, /Más compatible/);
});

console.log('\n5. Trampas estructurales');
const form = readFileSync(`${REPO}/src/components/directory/UnifiedClubForm.tsx`, 'utf8');
const portal = readFileSync(`${REPO}/src/pages/ClubPortalPage.tsx`, 'utf8');
await check('ni el formulario ni el portal suben por el presign de Rotary en Acción (la causa del reporte)', () => {
    assert.ok(!form.includes('rotary-en-accion/presign'));
    assert.ok(!portal.includes('rotary-en-accion/presign'));
    assert.ok(form.includes('<ClubMediaUploader') && form.includes('<ClubGalleryUploader'));
    assert.ok(portal.includes('<ClubMediaUploader'));
});
await check('el componente vacía el input tras elegir (se puede volver a elegir el mismo archivo)', () => {
    const c = readFileSync(`${REPO}/src/components/directory/ClubMediaUploader.tsx`, 'utf8');
    assert.ok((c.match(/e\.target\.value = ''/g) || []).length >= 2);
    assert.ok(!/accept="image\/\*"/.test(c));
});
await check('ningún éxito antes de la confirmación del servidor', () => {
    const c = readFileSync(`${REPO}/src/components/directory/ClubMediaUploader.tsx`, 'utf8');
    const iUpload = c.indexOf('await uploadClubMedia(file');
    const iSaved = c.indexOf("setPhase('guardado');", iUpload);
    assert.ok(iUpload > 0 && iSaved > iUpload);
    const lib = readFileSync(`${REPO}/src/lib/clubMediaUpload.ts`, 'utf8');
    assert.ok(lib.includes("'/district-clubs/media/confirm'"));
});
await check('las rutas literales /media/* van antes de /media/:id', () => {
    const r = readFileSync(`${REPO}/server/routes/district-clubs.js`, 'utf8');
    const iParam = r.indexOf("'/media/:id'");
    for (const lit of ["'/media/limits'", "'/media/presign'", "'/media/confirm'", "'/media/status'"]) {
        assert.ok(r.indexOf(lit) > 0 && r.indexOf(lit) < iParam, lit);
    }
});
await check('sin comillas invertidas dentro de un db.query en los archivos nuevos', () => {
    for (const f of ['server/lib/clubMediaStore.js', 'server/controllers/clubMediaController.js']) {
        const src = readFileSync(`${REPO}/${f}`, 'utf8');
        for (const m of src.matchAll(/db\.query\(\s*`([^`]*)`/g)) assert.ok(!m[1].includes('`'), f);
    }
});
await check('la tabla nueva no tiene ADD COLUMN fuera de OWNED_COLUMNS', async () => {
    const src = readFileSync(`${REPO}/server/lib/clubMediaStore.js`, 'utf8');
    const { OWNED_COLUMNS } = await import(`${REPO}/server/lib/clubMediaStore.js`);
    const adds = [...src.matchAll(/ADD COLUMN IF NOT EXISTS "?(\w+)"?/g)].map(m => m[1]);
    assert.ok(adds.every(c => OWNED_COLUMNS.DistrictClubMedia.includes(c)));
});
await check('la tabla está listada en CLAUDE.md y en el guardián de db:push', () => {
    assert.ok(readFileSync(`${REPO}/CLAUDE.md`, 'utf8').includes('`DistrictClubMedia`'));
    assert.ok(readFileSync(`${REPO}/scripts/db-push-guard.mjs`, 'utf8').includes('DistrictClubMedia'));
});

console.log(`\n${passed} correctas, ${failed} fallidas`);
process.exit(failed ? 1 : 0);
