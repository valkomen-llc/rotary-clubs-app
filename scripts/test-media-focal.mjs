#!/usr/bin/env node
/**
 * El encuadre de la portada — v4.1007
 * ====================================
 *
 * Del reporte con dos capturas: la portada del artículo publicado sale
 * «incompleta, cortada o mocha» —no se ven las cabezas— mientras que en el
 * editor la misma foto se ve entera.
 *
 * La causa no era que faltara un recortador: el editor de Noticias tiene uno
 * (16:6) desde hace versiones. Es que el hero del artículo mide
 * `w-full h-[400px] md:h-[500px]`, o sea que su PROPORCIÓN cambia con el ancho
 * de la ventana, y `object-fit: cover` recorta al CENTRO lo que sobra. Ningún
 * recorte fijo satisface a la vez ≈0,98 (un teléfono) y 3,84 (una pantalla de
 * 1920): lo que sobrevive a un recorte de proporción variable es un PUNTO.
 *
 * Se prueba el CRITERIO —la aritmética de `object-cover`, que es lo que
 * demuestra el defecto y la corrección— y se comprueba sobre los archivos que
 * las piezas que tienen que estar de acuerdo lo sigan estando.
 *
 * No necesita base, credenciales ni red. El bloque del espejo pide `esbuild`
 * y se salta solo:  npm i --no-save esbuild
 */
import { existsSync, readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
    DEFAULT_FOCAL, HERO_PREVIEWS, normalizeFocal, isCenteredFocal,
    objectPositionOf, visibleRegion, pointSurvives, focalRecord,
} from '../server/lib/mediaFocal.js';

let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
    if (cond) { pass++; console.log(`  OK    ${name}`); }
    else { fail++; console.log(`  FALLA ${name}${extra ? ` — ${extra}` : ''}`); }
};
const codigo = (ruta) => readFileSync(ruta, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

// ════════════════════════════════════════════════════════════════════════
console.log('\n── 1. El defecto reportado, medido');
// ════════════════════════════════════════════════════════════════════════
// La foto del reporte: un grupo de personas, apaisada 4:3, con las cabezas en
// el tercio de arriba. El hero de escritorio de un portátil ancho.
const FOTO = { imageWidth: 1600, imageHeight: 1200 };
const HERO_1920 = { boxWidth: 1920, boxHeight: 500 };
const CABEZAS = { x: 0.5, y: 0.14 };

const centro = visibleRegion({ ...FOTO, ...HERO_1920 });
check('con el centro, lo visible empieza pasado el 32 % de alto de la foto',
    centro && centro.top > 0.32 && centro.top < 0.34, JSON.stringify(centro));
check('con el centro, las cabezas quedan FUERA — el defecto reportado',
    pointSurvives({ point: CABEZAS, ...FOTO, ...HERO_1920 }) === false);

const arriba = { focal: { x: 0.5, y: 0.15 } };
check('con el encuadre arriba, lo visible empieza cerca del 10 %',
    visibleRegion({ ...FOTO, ...HERO_1920, ...arriba }).top < 0.11);
check('con el encuadre arriba, las cabezas SOBREVIVEN',
    pointSurvives({ point: CABEZAS, ...FOTO, ...HERO_1920, ...arriba }) === true);

// Y el mismo encuadre tiene que servir en un teléfono, que recorta por los
// lados en vez de por arriba: es lo que un recorte fijo no puede dar.
const MOVIL = { boxWidth: 390, boxHeight: 400 };
check('el mismo encuadre conserva las cabezas también en un teléfono',
    pointSurvives({ point: CABEZAS, ...FOTO, ...MOVIL, ...arriba }) === true);
check('en un teléfono el recorte es LATERAL, no vertical',
    visibleRegion({ ...FOTO, ...MOVIL, ...arriba }).width < 1
    && visibleRegion({ ...FOTO, ...MOVIL, ...arriba }).height === 1);

// ⚠️ Lo que prueba que un RECORTE no alcanzaba: una foto ya cortada a 16:6
// —lo que hace el recortador del editor— metida en el hero de 1920 sigue
// perdiendo la parte de arriba.
const RECORTADA = { imageWidth: 1600, imageHeight: 600 };
const regionRecortada = visibleRegion({ ...RECORTADA, ...HERO_1920 });
check('una foto ya recortada a 16:6 SIGUE perdiendo alto en el hero de 1920',
    regionRecortada.height < 1 && regionRecortada.top > 0);

// ════════════════════════════════════════════════════════════════════════
console.log('\n── 2. Normalización y qué se guarda');
// ════════════════════════════════════════════════════════════════════════
check('un encuadre sin datos es null, no el centro', normalizeFocal(null) === null && normalizeFocal({}) === null);
check('las cadenas numéricas se leen', JSON.stringify(normalizeFocal({ x: '0.25', y: '0.75' })) === '{"x":0.25,"y":0.75}');
check('fuera de rango se acota a 0-1', JSON.stringify(normalizeFocal({ x: -3, y: 12 })) === '{"x":0,"y":1}');
check('un valor no numérico descarta el encuadre entero', normalizeFocal({ x: 0.4, y: 'arriba' }) === null);
check('un array no es un encuadre', normalizeFocal([0.5, 0.5]) === null);
check('sin encuadre, `object-position` es el centro EXPLÍCITO', objectPositionOf(null) === '50% 50%');
check('con encuadre se escribe en porcentaje', objectPositionOf({ x: 0.5, y: 0.15 }) === '50% 15%');
check('«sin encuadre» y «centrado» se pintan igual', objectPositionOf(null) === objectPositionOf(DEFAULT_FOCAL));

check('un encuadre centrado NO se guarda: se borra', focalRecord({ x: 0.5, y: 0.5 }) === null);
check('un encuadre a un pelo del centro tampoco', focalRecord({ x: 0.502, y: 0.498 }) === null);
const rec = focalRecord({ x: 0.5, y: 0.15 }, { by: 'u1' });
check('un encuadre real se guarda con quién y cuándo',
    rec && rec.x === 0.5 && rec.y === 0.15 && rec.by === 'u1' && typeof rec.at === 'string');
check('lo que no es un encuadre no se guarda', focalRecord({ x: 'a', y: 'b' }) === null);
check('isCenteredFocal trata la ausencia como centro', isCenteredFocal(null) === true && isCenteredFocal({ x: 0.5, y: 0.2 }) === false);

// ════════════════════════════════════════════════════════════════════════
console.log('\n── 3. Medidas imposibles: no se inventa una región');
// ════════════════════════════════════════════════════════════════════════
check('sin medidas de la imagen no hay región', visibleRegion({ boxWidth: 100, boxHeight: 50 }) === null);
check('con una medida en cero tampoco', visibleRegion({ imageWidth: 0, imageHeight: 10, boxWidth: 5, boxHeight: 5 }) === null);
check('un punto sin región no sobrevive por omisión', pointSurvives({ point: { x: 0.5, y: 0.5 } }) === false);
check('una caja de la misma proporción no recorta nada',
    JSON.stringify(visibleRegion({ imageWidth: 800, imageHeight: 400, boxWidth: 1600, boxHeight: 800 }))
    === JSON.stringify({ left: 0, top: 0, width: 1, height: 1, right: 1, bottom: 1 }));

// ════════════════════════════════════════════════════════════════════════
console.log('\n── 4. Las cajas de la vista previa siguen al hero de verdad');
// ════════════════════════════════════════════════════════════════════════
// ⚠️ La vista previa del editor promete «así se verá en el artículo». Si el
// hero cambia de alto y estas cajas no, la promesa se vuelve falsa EN SILENCIO.
const blog = codigo('src/pages/BlogPost.tsx');
check('el hero sigue midiendo h-[400px] md:h-[500px]',
    blog.includes('h-[400px] md:h-[500px]'));
check('las cajas de la vista previa declaran esos dos altos',
    HERO_PREVIEWS.some(b => b.height === 500) && HERO_PREVIEWS.some(b => b.height === 400));
check('el hero aplica el encuadre',
    /objectPosition:\s*objectPositionOf\(/.test(blog));
check('el hero sigue recortando con object-cover',
    blog.includes('w-full h-full object-cover'));

// ════════════════════════════════════════════════════════════════════════
console.log('\n── 5. Dónde vive el encuadre');
// ════════════════════════════════════════════════════════════════════════
const schema = readFileSync('server/prisma/schema.prisma', 'utf8');
const modeloPost = schema.slice(schema.indexOf('model Post '), schema.indexOf('model Post ') + 2000);
check('⚠️ `Post` NO gana ninguna columna de encuadre (regla de logo_intl)',
    !/focal/i.test(modeloPost.slice(0, modeloPost.indexOf('\n}'))));
check('el encuadre vive en `Media` y está declarado en schema.prisma',
    /focal\s+Json\?/.test(schema));

const ensure = readFileSync('server/lib/ensureMediaFolderSchema.js', 'utf8');
check('el ensure agrega la columna con ADD COLUMN IF NOT EXISTS',
    /ALTER TABLE "Media" ADD COLUMN IF NOT EXISTS "focal" JSONB/.test(ensure));
// ⚠️ La trampa de v4.908: `CREATE TABLE IF NOT EXISTS` no amplía nada, así que
// una base que ya tiene `Media` sólo recibe el ALTER si el atajo la enumera.
check('⚠️ la columna está ENUMERADA en el atajo del ensure (trampa de v4.908)',
    /column_name = 'focal'\) AS has_focal/.test(ensure) && /rows\[0\]\?\.has_focal/.test(ensure));
check('la búsqueda por url tiene índice', /CREATE INDEX IF NOT EXISTS "Media_url_idx"/.test(ensure));

// Todo ADD COLUMN de este archivo tiene que estar en el atajo, no sólo el nuevo.
const columnas = [...ensure.matchAll(/ALTER TABLE "(\w+)" ADD COLUMN IF NOT EXISTS "(\w+)"/g)].map(m => m[2]);
const atajo = ensure.slice(0, ensure.indexOf('_ready = true'));
const sinAtajo = columnas.filter(c => !atajo.includes(`column_name = '${c}'`));
check('TODO ADD COLUMN del ensure está enumerado en el atajo', sinAtajo.length === 0, sinAtajo.join(', '));

// ════════════════════════════════════════════════════════════════════════
console.log('\n── 6. La lectura pública degrada y no depende del ensure');
// ════════════════════════════════════════════════════════════════════════
const content = codigo('server/controllers/contentController.js');
check('el encuadre se resuelve en SU PROPIA consulta, no dentro del SELECT del artículo',
    content.includes('const attachImageFocus') && !/SELECT \* FROM "Post"[\s\S]{0,200}"Media"/.test(content));
check('⚠️ un fallo leyendo el encuadre NO tumba la página: devuelve la lista tal cual',
    /catch\s*{\s*return lista;\s*}/.test(content));
check('la ficha del artículo adjunta el encuadre', content.includes('attachImageFocus(result.rows)'));
check('el listado también', content.includes('attachImageFocus(result.rows)') && /getPublicPosts[\s\S]{0,900}attachImageFocus/.test(content));

// ════════════════════════════════════════════════════════════════════════
console.log('\n── 7. Las rutas del encuadre');
// ════════════════════════════════════════════════════════════════════════
const media = codigo('server/routes/media.js');
check('hay una ruta de lectura y una de escritura', media.includes("router.get('/focal'") && media.includes("router.put('/focal'"));
check('⚠️ las literales van ANTES de las paramétricas',
    media.indexOf("router.get('/focal'") < media.indexOf("router.post('/:id/convert'"));
check('el aislamiento va en el WHERE, no en la pantalla', media.includes('AND "clubId" IS NOT DISTINCT FROM $'));
check('el CÓDIGO decide qué se guarda (focalRecord), no el cuerpo de la petición',
    media.includes('focalRecord(req.body'));
check('las dos rutas están autenticadas',
    /router\.get\('\/focal', authMiddleware/.test(media) && /router\.put\('\/focal', authMiddleware/.test(media));

// ════════════════════════════════════════════════════════════════════════
console.log('\n── 8. El editor: el control se ve y la vista previa es honesta');
// ════════════════════════════════════════════════════════════════════════
const news = codigo('src/pages/admin/News.tsx');
check('⚠️ el botón de encuadre NO está escondido en el hover',
    /onClick={\(\) => setFocusOpen\(true\)}/.test(news)
    && !/group-hover[^\n]*setFocusOpen/.test(news));
check('la vista previa usa el MISMO object-cover + object-position del hero',
    /objectPosition: objectPositionOf\(focal\)/.test(news) && news.includes('w-full h-full object-cover'));
check('la vista previa se dibuja con las cajas declaradas, no con proporciones a mano',
    /HERO_PREVIEWS\.map/.test(news));
check('⚠️ el recortador del archivo SIGUE existiendo: son dos cosas distintas',
    news.includes('<CropModal') && news.includes('<CoverFocusModal'));
check('⚠️ el componente del encuadre vive en el ÁMBITO DEL MÓDULO (v4.971)',
    /^const CoverFocusModal = /m.test(news));
check('las DOS vías de la casilla de portada siguen ahí (regla de v4.700)',
    news.includes("setPickerTarget('image')") && news.includes('handleImageUpload(e)'));
check('ninguna respuesta se lee con .json() a ciegas (lección de v4.946)',
    /const texto = await res\.text\(\)/.test(news.slice(news.indexOf('guardarEncuadre'), news.indexOf('guardarEncuadre') + 1800)));

// ⚠️ El defecto de v4.1003 por la otra puerta: `ArticleMediaPicker` escribe
// por DOS caminos y ninguno más. El encuadre no puede haber abierto un tercero.
const picker = codigo('src/components/admin/contribution/ArticleMediaPicker.tsx');
const escrituras = (picker.match(/method:\s*'(PUT|POST|PATCH|DELETE)'/g) || []).length;
check('el selector compartido sigue escribiendo por DOS caminos', escrituras === 2, `${escrituras}`);

// ════════════════════════════════════════════════════════════════════════
console.log('\n── 9. El espejo del navegador, comparado por SALIDAS');
// ════════════════════════════════════════════════════════════════════════
let build = null;
try { ({ build } = await import('esbuild')); } catch { /* sin esbuild */ }

if (!build) {
    console.log('  ⊘ falta esbuild, se salta.');
} else {
    const out = await build({
        entryPoints: ['src/lib/mediaFocal.ts'], bundle: true, write: false,
        format: 'esm', platform: 'node', logLevel: 'silent',
    });
    const dir = mkdtempSync(join(tmpdir(), 'focal-'));
    const file = join(dir, 'espejo.mjs');
    writeFileSync(file, out.outputFiles[0].text);
    const espejo = await import(pathToFileURL(file).href);
    rmSync(dir, { recursive: true, force: true });

    const casos = [null, {}, { x: 0, y: 0 }, { x: 1, y: 1 }, { x: '0.3', y: '0.9' }, { x: -1, y: 5 }, { x: 0.5, y: 0.5 }, { x: 0.123456, y: 0.7 }];
    let iguales = true;
    for (const c of casos) {
        if (JSON.stringify(normalizeFocal(c)) !== JSON.stringify(espejo.normalizeFocal(c))) iguales = false;
        if (objectPositionOf(c) !== espejo.objectPositionOf(c)) iguales = false;
        if (isCenteredFocal(c) !== espejo.isCenteredFocal(c)) iguales = false;
    }
    check('normalizeFocal / objectPositionOf / isCenteredFocal dan lo mismo', iguales);

    let regiones = true;
    for (const box of [[1920, 500], [1440, 500], [390, 400], [800, 800]]) {
        for (const img of [[1600, 1200], [1200, 1600], [4000, 3000], [500, 500]]) {
            for (const f of [null, { x: 0.5, y: 0.15 }, { x: 0.2, y: 0.8 }]) {
                const a = visibleRegion({ imageWidth: img[0], imageHeight: img[1], boxWidth: box[0], boxHeight: box[1], focal: f });
                const b = espejo.visibleRegion({ imageWidth: img[0], imageHeight: img[1], boxWidth: box[0], boxHeight: box[1], focal: f });
                if (JSON.stringify(a) !== JSON.stringify(b)) regiones = false;
            }
        }
    }
    check('visibleRegion da lo mismo en las 48 combinaciones', regiones);
    check('las cajas de la vista previa son las mismas en los dos espejos',
        JSON.stringify(HERO_PREVIEWS) === JSON.stringify(espejo.HERO_PREVIEWS));
    // ⚠️ Quién DECIDE qué se guarda es el servidor: el espejo no trae
    // `focalRecord`. Con dos criterios, la pantalla y la base podrían
    // discrepar sobre el mismo encuadre.
    check('⚠️ el espejo NO trae focalRecord', espejo.focalRecord === undefined);
}

// ════════════════════════════════════════════════════════════════════════
console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} OK · ${fail} fallas`);
process.exit(fail === 0 ? 0 : 1);
