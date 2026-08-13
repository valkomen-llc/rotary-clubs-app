#!/usr/bin/env node
/**
 * Miniaturas de la Biblioteca Multimedia (v4.786)
 * ================================================
 *
 * Ejercita el CRITERIO de `server/lib/mediaThumbs.js` — qué archivo recibe
 * miniatura, con qué clave y a qué tamaño— separado de la I/O de S3, por el
 * mismo motivo de siempre: lo que sólo se prueba contra un bucket real termina
 * sin pruebas.
 *
 * La parte de generación usa sharp (dependencia de producción); si no está
 * instalada en el entorno de prueba, ese bloque SE SALTA con aviso en vez de
 * fallar — misma regla que playwright en las pruebas de navegador.
 *
 *   npm run test:media:thumbs
 */

import {
    shouldThumbnail, thumbKeyFor, generateThumbBuffer,
    THUMB_MAX_DIMENSION
} from '../server/lib/mediaThumbs.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
    if (cond) { pass++; console.log(`  OK    ${name}`); }
    else { fail++; console.log(`  FALLA ${name}${extra ? ` — ${extra}` : ''}`); }
};

// ───────────────────────────────────────────────────────────────────────────
console.log('\n▸ Qué recibe miniatura y qué no');

check('una foto JPG sí', shouldThumbnail({ type: 'image', filename: 'foto.jpg' }));
check('un PNG sí', shouldThumbnail({ type: 'image', filename: 'logo.png' }));
// Un SVG escala solo y pesa poco: rasterizarlo sería empeorarlo.
check('un SVG no', !shouldThumbnail({ type: 'image', filename: 'escudo.svg' }));
// La miniatura congelaría la animación sin avisar.
check('un GIF no', !shouldThumbnail({ type: 'image', filename: 'anim.gif' }));
// sharp no decodifica HEVC (v4.739): su camino es la conversión, y el JPEG
// resultante sí pasa por acá.
check('un HEIC no (su camino es la conversión)',
    !shouldThumbnail({ type: 'image', filename: 'IMG_0001.HEIC' })
    && !shouldThumbnail({ type: 'image', filename: 'x.jpg', mimetype: 'image/heic' }));
check('un video no', !shouldThumbnail({ type: 'video', filename: 'clip.mp4' }));
check('un documento no', !shouldThumbnail({ type: 'document', filename: 'acta.pdf' }));
// Varios navegadores mandan el MIME vacío: decide la extensión, como con HEIC.
check('sin tipo declarado decide la extensión',
    shouldThumbnail({ filename: 'foto.jpeg', mimetype: '' })
    && !shouldThumbnail({ filename: 'acta.pdf', mimetype: '' }));

// ───────────────────────────────────────────────────────────────────────────
console.log('\n▸ La clave de la miniatura');

check('vive en la carpeta hermana thumbs/ y siempre es .webp',
    thumbKeyFor('clubs/x/images/123-foto.jpg') === 'clubs/x/images/thumbs/123-foto.webp');
check('un archivo en la raíz también', thumbKeyFor('suelto.png') === 'thumbs/suelto.webp');
check('conserva espacios y nombres raros',
    thumbKeyFor('clubs/x/images/mi foto (1).JPG') === 'clubs/x/images/thumbs/mi foto (1).webp');
check('una clave vacía devuelve null (no una miniatura fantasma)',
    thumbKeyFor('') === null && thumbKeyFor(null) === null);

// ───────────────────────────────────────────────────────────────────────────
console.log('\n▸ La generación (con sharp)');

let sharpOk = true;
try { await import('sharp'); } catch { sharpOk = false; }

if (!sharpOk) {
    console.log('  SALTA — sharp no está instalado en este entorno.');
} else {
    const sharp = (await import('sharp')).default;

    const grande = await sharp({ create: { width: 3000, height: 2000, channels: 3, background: '#356' } })
        .jpeg({ quality: 90 }).toBuffer();
    const t1 = await generateThumbBuffer(grande);
    const m1 = await sharp(t1).metadata();
    check(`una foto grande baja a ${THUMB_MAX_DIMENSION} px de lado mayor`,
        m1.width === THUMB_MAX_DIMENSION && m1.format === 'webp',
        `${m1.width}×${m1.height} ${m1.format}`);
    check('y pesa MUCHO menos que el original', t1.length < grande.length / 5,
        `${t1.length} vs ${grande.length}`);

    // Agrandar no añade información: sólo pesa más.
    const chica = await sharp({ create: { width: 200, height: 150, channels: 3, background: '#642' } })
        .png().toBuffer();
    const t2 = await generateThumbBuffer(chica);
    const m2 = await sharp(t2).metadata();
    check('una imagen ya pequeña NO se agranda', m2.width === 200 && m2.height === 150,
        `${m2.width}×${m2.height}`);

    // La orientación EXIF se hornea: sin esto una foto de móvil entra acostada.
    const conExif = await sharp({ create: { width: 600, height: 400, channels: 3, background: '#161' } })
        .jpeg().withMetadata({ orientation: 6 }).toBuffer();
    const t3 = await generateThumbBuffer(conExif);
    const m3 = await sharp(t3).metadata();
    check('la orientación EXIF se aplica (6 = girada 90°)',
        m3.width === 267 && m3.height === 400, `${m3.width}×${m3.height}`);

    // Bytes ilegibles LANZAN: quien llama decide seguir sin miniatura.
    let lanzo = false;
    try { await generateThumbBuffer(Buffer.from('esto no es una imagen')); } catch { lanzo = true; }
    check('un archivo ilegible lanza (y la subida sigue sin miniatura)', lanzo);
}

// ───────────────────────────────────────────────────────────────────────────
console.log('\n▸ El cableado que no se ve en una prueba pura (sobre los archivos)');

const media = readFileSync(path.join(root, 'server/routes/media.js'), 'utf8');
check('las DOS subidas generan miniatura (tryMakeThumb en /save y /upload)',
    (media.match(/await tryMakeThumb\(/g) || []).length >= 3);
check('la miniatura NUNCA tumba la subida (helper con catch propio)',
    /tryMakeThumb[\s\S]{0,1200}catch \(e\) \{[\s\S]{0,200}return null/.test(media));
check('el backfill tiene presupuesto de tiempo',
    /backfill-thumbs[\s\S]{0,900}timeBudgetMs/.test(media));
check('un archivo que no se pudo miniaturizar se marca (cadena vacía), no se reintenta para siempre',
    /SET "thumbUrl" = ''/.test(media));
check('la paginación es ADITIVA: sin `limit` la respuesta es la de siempre',
    /if \(Number\.isInteger\(limit\) && limit > 0\)/.test(media));
check('la señal de «hay más» va en cabecera, sin cambiar la forma del cuerpo',
    /X-Media-Has-More/.test(media));

const picker = readFileSync(path.join(root, 'src/components/admin/content-studio/MediaPicker.tsx'), 'utf8');
check('la rejilla del selector pinta la miniatura y cae al original',
    /src=\{item\.thumbUrl \|\| item\.url\}/.test(picker));
const library = readFileSync(path.join(root, 'src/pages/admin/MediaLibrary.tsx'), 'utf8');
check('la rejilla de la Biblioteca también',
    /src=\{item\.thumbUrl \|\| item\.url\}/.test(library));
check('la vista de DETALLE sigue mostrando el original (ahí se viene a verlo)',
    /src=\{selectedItem\.url\}/.test(library));

const schema = readFileSync(path.join(root, 'server/prisma/schema.prisma'), 'utf8');
check('`thumbUrl` está declarada en schema.prisma (regla de folderId: el guardián compara tablas, no columnas)',
    /thumbUrl String\?/.test(schema));

console.log(`\n${fail === 0 ? '✓' : '✗'} ${pass} pruebas pasan, ${fail} fallan\n`);
process.exit(fail === 0 ? 0 : 1);
