#!/usr/bin/env node
/**
 * Una fotografía → una escena, derecha, entera y VIVA — Creador de Reels (v4.1029)
 * =================================================================================
 *
 * Reporte con tres capturas: una escena con DOS fotografías apiladas (collage),
 * otra con la fotografía GIRADA 90°, y una tercera que «se anima» paseando el
 * encuadre sobre la foto quieta (Ken Burns). Eran tres causas distintas:
 *
 *   1. Ninguna pieza del pipeline aplicaba la orientación EXIF: `planExpansion`
 *      decidía sobre las medidas CRUDAS del archivo y los motores recibían la
 *      URL tal cual. Las fotos de una Solicitud de Contenido llegan del
 *      teléfono con el EXIF intacto (se promueven byte a byte), y por ahí
 *      volvió el defecto.
 *   2. La adaptación de lienzo reprobada por el control se ANIMABA IGUAL tras
 *      agotar los reintentos (`expandedImageUrl` se escribía fuera cual fuera
 *      el veredicto), y la costura sólo la veía el modelo de visión.
 *   3. v4.1028 reintrodujo el respaldo Ken Burns automático al agotar la
 *      escalera. El cliente lo retiró: un paneo no es una animación.
 *
 * Se prueban las tres cosas —normalización, composición y escalera— con
 * imágenes sintéticas de verdad (sharp) y, si hay FFmpeg, con un clip real.
 * Sin base, credenciales ni red. Y se lee el cableado del controlador, que es
 * lo único que ve un criterio correcto mal enchufado.
 *
 *   npm run test:reels:photo
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import {
    needsOrientationFix, orientedDimensions, isUpright, normalizePhoto
} from '../server/lib/photoNormalize.js';
import {
    STRATEGY_LADDER, SCENE_STRATEGIES, planSceneRecovery, ABSOLUTE_PAID_CAP,
    SCENE_BASE_PROMPT, buildScenePrompt, buildSceneNegativePrompt,
    COMPOSITION_NEGATIVE_TERMS, SCENE_FAILURE_CODES, failureCodeOf, checkClipOrientation
} from '../server/lib/reelSpec.js';
import { judgeComposition, detectLetterbox } from '../server/lib/reelQuality.js';
import { detectSeam, judgeExpansion, EXPANSION_SEAM_RATIO } from '../server/lib/canvasExpansion.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const read = (p) => readFileSync(path.join(root, p), 'utf8');
const codigo = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
    if (cond) { pass++; console.log(`  OK    ${name}`); }
    else { fail++; console.log(`  FALLA ${name}${extra ? ` — ${extra}` : ''}`); }
};

let sharp = null;
try { sharp = (await import('sharp')).default; } catch { /* se salta lo que lo necesita */ }

// ───────────────────────────────────────────────────────────────────────────
console.log('\n▸ 1. El criterio de orientación (puro)');
check('1 y ausente no giran', !needsOrientationFix(1) && !needsOrientationFix(undefined) && !needsOrientationFix(0));
check('2..8 giran o espejan', [2, 3, 4, 5, 6, 7, 8].every(needsOrientationFix));
check('5..8 intercambian ejes', JSON.stringify(orientedDimensions({ width: 4032, height: 3024, orientation: 6 })) === JSON.stringify({ width: 3024, height: 4032 }));
check('1..4 no los intercambian', orientedDimensions({ width: 4032, height: 3024, orientation: 3 }).width === 4032);
check('derecha = sin orientación pendiente y medidas orientadas',
    isUpright({ orientation: 1, width: 3024, height: 4032 }, { width: 3024, height: 4032 })
    && !isUpright({ orientation: 6, width: 4032, height: 3024 }));

// ───────────────────────────────────────────────────────────────────────────
console.log('\n▸ 2. Normalización con fotografías REALES (sharp)');
// Una foto «vertical» con una marca ROJA arriba a la izquierda, como la ve una
// persona. La versión con EXIF 6 guarda los píxeles ACOSTADOS (la marca queda
// abajo a la izquierda del archivo crudo) más la etiqueta que dice «girala».
const marcaRoja = async (buf) => {
    const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
    const px = (x, y) => [data[(y * info.width + x) * info.channels], data[(y * info.width + x) * info.channels + 1], data[(y * info.width + x) * info.channels + 2]];
    const esRojo = ([r, g, b]) => r > 180 && g < 80 && b < 80;
    return { arribaIzq: esRojo(px(10, 10)), abajoIzq: esRojo(px(10, info.height - 10)), w: info.width, h: info.height };
};
if (!sharp) {
    console.log('  (sharp no disponible: se salta)');
} else {
    const W = 300, H = 400;
    const upright = await sharp({ create: { width: W, height: H, channels: 3, background: '#3a5a40' } })
        .composite([
            { input: await sharp({ create: { width: 60, height: 60, channels: 3, background: '#ff2020' } }).png().toBuffer(), left: 0, top: 0 },
            { input: await sharp({ create: { width: 120, height: 80, channels: 3, background: '#e0e0e0' } }).png().toBuffer(), left: 150, top: 280 }
        ]).jpeg({ quality: 95 }).toBuffer();

    // Caso 1: fotografía vertical normal
    const n1 = await normalizePhoto(upright, { sharp });
    check('caso 1: una foto vertical derecha NO se re-codifica', n1.ok && n1.changed === false && n1.width === W && n1.height === H, n1.reason || '');
    check('...y la marca sigue arriba a la izquierda', (await marcaRoja(n1.buffer)).arribaIzq);

    // Caso 2: la misma foto guardada acostada con EXIF Orientation 6
    const exif6 = await sharp(upright).rotate(270).withMetadata({ orientation: 6 }).jpeg({ quality: 95 }).toBuffer();
    const meta6 = await sharp(exif6).metadata();
    check('el fixture es un archivo APAISADO con etiqueta 6 (como lo guarda un teléfono)', meta6.width === H && meta6.height === W && meta6.orientation === 6);
    // sharp NO aplica el EXIF al leer raw sin `.rotate()`: lo que se mide acá
    // es lo que un motor lee del archivo — la marca ya no está arriba a la
    // izquierda, o sea, la foto está acostada.
    const cruda6 = await marcaRoja(exif6);
    check('...y sus píxeles crudos están acostados: la marca NO está arriba a la izquierda', !cruda6.arribaIzq && cruda6.w === H && cruda6.h === W);
    const n2 = await normalizePhoto(exif6, { sharp });
    check('caso 2: la foto con EXIF 6 se gira FÍSICAMENTE', n2.ok && n2.changed === true && n2.width === W && n2.height === H, n2.reason || '');
    const meta2 = await sharp(n2.buffer).metadata();
    check('...y el resultado no lleva orientación pendiente', !meta2.orientation || meta2.orientation === 1);
    check('...y la marca vuelve arriba a la izquierda', (await marcaRoja(n2.buffer)).arribaIzq);
    check('...y lo DICE', /Orientación EXIF 6 aplicada/.test(n2.reason || ''));
    const n2b = await normalizePhoto(n2.buffer, { sharp });
    check('normalizar dos veces no cambia nada (idempotente)', n2b.ok && n2b.changed === false);
    // Todas las orientaciones EXIF
    let todas = true;
    for (const o of [2, 3, 4, 5, 6, 7, 8]) {
        const raw = o >= 5 ? await sharp(upright).rotate(90).toBuffer() : upright;
        const tagged = await sharp(raw).withMetadata({ orientation: o }).jpeg().toBuffer();
        const n = await normalizePhoto(tagged, { sharp });
        const m = await sharp(n.buffer).metadata();
        if (!n.ok || !n.changed || (m.orientation && m.orientation !== 1)) todas = false;
    }
    check('las siete orientaciones que giran o espejan quedan derechas', todas);
    const basura = await normalizePhoto(Buffer.from('no soy una imagen'), { sharp });
    check('un archivo ilegible NO lanza: devuelve ok:false con motivo', basura.ok === false && basura.reason && basura.buffer);
}

// ───────────────────────────────────────────────────────────────────────────
console.log('\n▸ 3. Composición: collage, franjas negras y orientación del clip');
check('el clip 1080×1920 de una foto 1080×1920 no está girado', checkClipOrientation({ clipWidth: 1080, clipHeight: 1920, imageWidth: 1080, imageHeight: 1920 }).rotated === false);
check('un clip 1920×1080 de una foto 1080×1920 SÍ está girado (proporción traspuesta)',
    checkClipOrientation({ clipWidth: 1920, clipHeight: 1080, imageWidth: 1080, imageHeight: 1920 }).rotated === true);
check('un clip 1280×720 de una foto 4032×3024 (misma orientación) no está girado',
    checkClipOrientation({ clipWidth: 1280, clipHeight: 720, imageWidth: 4032, imageHeight: 3024 }).rotated === false);
check('una foto cuadrada no tiene orientación que perder', checkClipOrientation({ clipWidth: 1080, clipHeight: 1920, imageWidth: 1000, imageHeight: 1000 }).rotated === false);
check('sin medidas no se afirma nada', checkClipOrientation({}).checked === false);

const sem = (o) => ({ score: 9, ...o });
check('collage en DOS fotogramas descalifica', judgeComposition({ semantics: [sem({ collage: true }), sem({ collage: true }), sem({})] }).collage === true);
check('collage en UN fotograma es ruido, y se dice', (() => { const j = judgeComposition({ semantics: [sem({ collage: true }), sem({}), sem({})] }); return j.collage === false && j.noise === true; })());
check('rotación por GEOMETRÍA descalifica sola (determinista)',
    judgeComposition({ semantics: [], orientation: { checked: true, rotated: true, reason: 'traspuesta' } }).rotated === true);
check('franjas negras en dos fotogramas descalifican',
    judgeComposition({ letterboxes: [{ checked: true, letterboxed: true }, { checked: true, letterboxed: true }] }).letterbox === true);
check('el veredicto de composición manda en el código de fallo',
    failureCodeOf({ composition: { collage: true }, people: { newSubjects: true } }) === 'collage'
    && failureCodeOf({ composition: { rotated: true } }) === 'wrong_orientation');
check('los códigos nuevos están en el catálogo con su clase',
    ['collage', 'wrong_orientation', 'letterbox', 'exhausted'].every(k => SCENE_FAILURE_CODES[k]?.kind && SCENE_FAILURE_CODES[k].label));

if (sharp) {
    const W = 1080, H = 1920;
    const conFranjas = await sharp({ create: { width: W, height: H, channels: 3, background: '#000000' } })
        .composite([{ input: await sharp({ create: { width: W, height: 1200, channels: 3, background: '#7a8a6a' } }).png().toBuffer(), left: 0, top: 360 }])
        .jpeg().toBuffer();
    const entero = await sharp({ create: { width: W, height: H, channels: 3, background: '#7a8a6a' } })
        .composite([{ input: await sharp({ create: { width: 400, height: 300, channels: 3, background: '#20304a' } }).png().toBuffer(), left: 300, top: 800 }])
        .jpeg().toBuffer();
    const l1 = await detectLetterbox(conFranjas, { sharp });
    const l2 = await detectLetterbox(entero, { sharp });
    check('un fotograma con franjas negras arriba y abajo se detecta', l1.checked && l1.letterboxed === true && l1.axis === 'vertical', JSON.stringify(l1.bands));
    check('un fotograma que ocupa el cuadro NO', l2.checked && l2.letterboxed === false, JSON.stringify(l2.bands));

    // ── La costura: dos fotografías pegadas contra una extensión que funde ──
    const fotoA = await sharp({ create: { width: 1080, height: 720, channels: 3, background: '#3a5a40' } })
        .composite([
            { input: await sharp({ create: { width: 400, height: 300, channels: 3, background: '#c0a060' } }).png().toBuffer(), left: 80, top: 200 },
            { input: await sharp({ create: { width: 200, height: 500, channels: 3, background: '#28354b' } }).png().toBuffer(), left: 700, top: 100 }
        ]).png().toBuffer();
    // OTRA fotografía (un camino con cielo): es la banda inferior de la captura.
    const otraFoto = await sharp({ create: { width: 1080, height: 600, channels: 3, background: '#9ab0c8' } })
        .composite([
            { input: await sharp({ create: { width: 1080, height: 250, channels: 3, background: '#8a6a40' } }).png().toBuffer(), left: 0, top: 350 },
            { input: await sharp({ create: { width: 300, height: 200, channels: 3, background: '#2e5a2e' } }).png().toBuffer(), left: 60, top: 150 }
        ]).png().toBuffer();
    const extension = await sharp({ create: { width: 1080, height: 600, channels: 3, background: '#3a5a40' } })
        .composite([{ input: await sharp({ create: { width: 1080, height: 180, channels: 3, background: '#5a7a60' } }).png().toBuffer(), left: 0, top: 60 }])
        .png().toBuffer();
    const region = { left: 0, top: 600, width: 1080, height: 720 };
    const plan = { grows: 'vertical' };
    const collage = await sharp({ create: { width: 1080, height: 1920, channels: 3, background: '#000' } })
        .composite([{ input: otraFoto, left: 0, top: 0 }, { input: fotoA, left: 0, top: 600 }, { input: otraFoto, left: 0, top: 1320 }]).png().toBuffer();
    const fundida = await sharp({ create: { width: 1080, height: 1920, channels: 3, background: '#3a5a40' } })
        .composite([{ input: extension, left: 0, top: 0 }, { input: fotoA, left: 0, top: 600 }, { input: extension, left: 0, top: 1320 }]).png().toBuffer();
    const sCollage = await detectSeam(sharp, collage, region, plan);
    const sFundida = await detectSeam(sharp, fundida, region, plan);
    check('dos fotografías pegadas dejan una COSTURA a lo ancho, y se detecta', sCollage.checked && sCollage.detected === true, JSON.stringify(sCollage.boundaries));
    check('una extensión que continúa el borde NO', sFundida.checked && sFundida.detected === false, JSON.stringify(sFundida.boundaries));
    check('la brecha medida es amplia (collage ≥ 2× el umbral; fundida < umbral)',
        sCollage.boundaries.every(b => b.ratio >= EXPANSION_SEAM_RATIO * 2) && sFundida.boundaries.every(b => b.ratio < EXPANSION_SEAM_RATIO),
        `${JSON.stringify(sCollage.boundaries)} / ${JSON.stringify(sFundida.boundaries)}`);
    const j = judgeExpansion({ ok: true, preservation: 0.95, tiling: { checked: true, bands: [], detected: false }, seam: sCollage }, { minPreservation: 0.82 });
    check('el juicio de la adaptación REPRUEBA por la costura aunque el centro esté intacto', j.verdict === 'failed' && /collage/.test(j.reason), j.reason);
}

// ───────────────────────────────────────────────────────────────────────────
console.log('\n▸ 4. El prompt: bloque base obligatorio, SIEMPRE primero');
const ps = [
    buildScenePrompt({ durationSec: 5 }),
    buildScenePrompt({ durationSec: 5, strategy: 'conservador', analysis: { hasPeople: true, personCount: 2, interactions: [] } }),
    buildScenePrompt({ style: 'ceremonial', durationSec: 5, intensity: 'expresivo', analysis: { hasPeople: true, personCount: 8, peopleDensity: 'dense', hasBrand: true, hasText: true, hasNature: true, motionHint: 'x '.repeat(200), summary: 's', subjects: Array.from({ length: 8 }, (_, i) => ({ who: `person ${i} with a long description of what they wear and do`, where: 'left', doing: 'standing and talking with the others for a long while' })), inventory: Array.from({ length: 6 }, (_, i) => ({ item: `item ${i} long name`, where: 'somewhere' })), brandRegions: [{ x: 0, y: 0, w: 1, h: 1 }], interactions: [{ from: 'a', to: 'b', object: 'c', verb: 'hands' }] } })
];
check('todo prompt arranca con el bloque base', ps.every(p => p.startsWith(SCENE_BASE_PROMPT)));
check('...también en el peor caso, recortado por presupuesto', ps[2].length <= 2500 && ps[2].startsWith(SCENE_BASE_PROMPT), String(ps[2].length));
check('el bloque dice lo que hay que decir: una foto, una vez, derecha, cámara fija, animar lo que existe',
    /single photograph/.test(SCENE_BASE_PROMPT) && /exactly once/.test(SCENE_BASE_PROMPT) && /upright, unmirrored/.test(SCENE_BASE_PROMPT)
    && /camera is fixed/.test(SCENE_BASE_PROMPT) && /already in the picture/.test(SCENE_BASE_PROMPT));
check('y va en positivo: sin «no», sin «never», sin «avoid»', !/\b(no|never|avoid|don't|without)\b/i.test(SCENE_BASE_PROMPT));
check('la cámara fija sobrevive al último recorte', /locked off|camera is fixed/.test(ps[2]));
const neg = buildSceneNegativePrompt();
check('el negativo excluye collage, pantalla dividida, duplicado, rotación y espejo — SIEMPRE',
    ['split screen', 'collage', 'duplicated photograph', 'rotated image', 'mirrored image', 'letterbox'].every(t => neg.includes(t)));
check('...y sigue excluyendo el paneo y el zoom', /camera pan/.test(neg) && /ken burns effect/.test(neg));
check('los términos de composición son un catálogo declarado', COMPOSITION_NEGATIVE_TERMS.length >= 12);

// ───────────────────────────────────────────────────────────────────────────
console.log('\n▸ 5. La escalera NO cae al Ken Burns por su cuenta');
const now = new Date('2026-09-11T12:00:00Z');
check('la escalera automática es narrativo → conservador y nada más', JSON.stringify(STRATEGY_LADDER) === JSON.stringify(['narrativo', 'conservador']));
check('«fotografico» no es automática', SCENE_STRATEGIES.fotografico.automatic === false);
const codes = Object.keys(SCENE_FAILURE_CODES);
let nuncaFallback = true;
for (const strategy of ['narrativo', 'conservador', 'fotografico', null]) {
    for (const attempts of [0, 1, 2, 3, 4]) {
        for (const errorCode of codes) {
            for (const tried of [[], ['narrativo'], ['narrativo', 'conservador']]) {
                const p = planSceneRecovery({ status: 'error', videoUrl: null, attempts, strategy, errorCode, lifecycle: { strategiesTried: tried } }, { now });
                if (p.action === 'fallback') nuncaFallback = false;
            }
        }
    }
}
check('en NINGUNA combinación de estrategia × intentos × código × historial se devuelve `fallback` sin pedirlo', nuncaFallback);
check('pedido a mano, «fotografico» sigue disponible (elección expresa)',
    planSceneRecovery({ status: 'error', videoUrl: null, attempts: 1 }, { now, forceStrategy: 'fotografico' }).action === 'fallback');
check('agotada, la escena queda `exhausted` y el motivo dice la salida',
    /volvé a intentar la escena viva/.test(planSceneRecovery({ status: 'error', videoUrl: null, attempts: ABSOLUTE_PAID_CAP, strategy: 'conservador', errorCode: 'collage' }, { now }).reason));

// ───────────────────────────────────────────────────────────────────────────
console.log('\n▸ 6. El cableado (leído de los archivos)');
{
    const ctrl = codigo(read('server/controllers/reelController.js'));
    check('`animationSourceOf` prefiere adaptada → normalizada → original',
        /const preparedSourceOf = \(scene\) => scene\.normalizedImageUrl \|\| scene\.sourceImageUrl;/.test(ctrl)
        && /const animationSourceOf = \(scene\) => scene\.expandedImageUrl \|\| preparedSourceOf\(scene\);/.test(ctrl));
    check('la adaptación se planifica sobre la foto NORMALIZADA (ensureNormalizedSource en startSceneExpansion)',
        /const startSceneExpansion = async[\s\S]{0,1200}?ensureNormalizedSource\(scene\)/.test(ctrl));
    check('...y se manda a adaptar y se compara contra la normalizada, nunca la cruda',
        /startExpansion\(\{[\s\S]{0,400}?imageUrl: preparedSourceOf\(scene\)/.test(ctrl)
        && /const originalResp = await fetch\(preparedSourceOf\(scene\)\)/.test(ctrl)
        && !/startExpansion\(\{[\s\S]{0,400}?imageUrl: scene\.sourceImageUrl/.test(ctrl));
    check('el despacho al motor de video también normaliza si nadie lo hizo',
        /const dispatchScene = async[\s\S]{0,1500}?ensureNormalizedSource\(scene\)/.test(ctrl));
    check('la normalización va en la fila, no en un metadato', /"normalizedImageUrl" = COALESCE\(\$2, "normalizedImageUrl"\)/.test(ctrl));
    check('UNA adaptación reprobada NO se anima: `expandedImageUrl` queda NULL',
        /if \(judgement\.verdict === 'failed'\) \{[\s\S]{0,600}?"expandedImageUrl" = NULL, "expandedS3Key" = NULL/.test(ctrl));
    check('el despacho manda UNA imagen por escena (imageUrl singular, nunca una lista)',
        /createKieVideoTask\(\{[\s\S]{0,900}?imageUrl: animationSourceOf\(scene\)/.test(ctrl)
        && !/createKieVideoTask\(\{[\s\S]{0,900}?imageUrls:/.test(ctrl));
    check('una escena por fotografía: el INSERT de ReelScene va por foto', /INSERT INTO "ReelScene"/.test(ctrl));
    check('la fidelidad recibe el tamaño del clip para la orientación', /clipSize: \{ width: probe\?\.width, height: probe\?\.height \}/.test(ctrl));
    check('la composición descalifica', /sc\.fidelity\?\.composition\?\.failed/.test(ctrl));
    check('existe `markSceneExhausted` y deja la escena SIN clip', /const markSceneExhausted = async[\s\S]{0,400}?"errorCode" = 'exhausted', "videoUrl" = NULL/.test(ctrl));
    // Quién llama al respaldo sin IA: sólo por elección expresa.
    const llamadas = [...ctrl.matchAll(/fallbackSceneSafely\(/g)].length;
    check('`fallbackSceneSafely` se declara y se llama SÓLO por vías expresas (forceStrategy, «Continuar» a mano, botón por escena)',
        llamadas === 3, `llamadas=${llamadas}`);
    check('...y ninguna dentro del avance automático (agotados, tope, recuperación auto)',
        !/for \(const sc of agotados\) \{[\s\S]{0,300}?fallbackSceneSafely/.test(ctrl)
        && !/>= ABSOLUTE_PAID_CAP\) \{\s*return fallbackSceneSafely/.test(ctrl)
        && /plan\.action === 'fallback' && forceStrategy === 'fotografico'/.test(ctrl)
        && /if \(auto\) return \{ scene, plan, did: 'skip' \};/.test(ctrl));
    check('`resolveSceneWithStillMotion` conserva sus DOS vías: la elección expresa y el respaldo pedido',
        [...ctrl.matchAll(/resolveSceneWithStillMotion\(/g)].length === 2);
}
{
    const ensure = read('server/lib/ensureReelSchema.js');
    const atajo = ensure.slice(ensure.indexOf('const EXPECTED_COLUMNS'), ensure.indexOf('];', ensure.indexOf('const EXPECTED_COLUMNS')));
    const adds = [...ensure.matchAll(/ADD COLUMN IF NOT EXISTS "?([A-Za-z0-9_]+)"?/g)].map(m => m[1]);
    check('las columnas nuevas están ENUMERADAS en el atajo del ensure (trampa v4.908)',
        /'normalizedImageUrl'/.test(atajo) && /'normalizedS3Key'/.test(atajo) && adds.includes('normalizedImageUrl') && adds.includes('normalizedS3Key'));
    check('ningún ADD COLUMN de ReelScene/ReelProject falta en el atajo', adds.every(c => atajo.includes(`'${c}'`)), adds.filter(c => !atajo.includes(`'${c}'`)).join(','));
    const literales = ensure.split('db.query(`').slice(1);
    const cierresLimpios = literales.every(seg => /^[^`]*`\s*[),]/.test(seg));
    check('ni una comilla invertida dentro del SQL del ensure', literales.length > 0 && cierresLimpios);
}
{
    const engine = codigo(read('server/lib/submissionReelEngine.js'));
    check('el Reel de una solicitud usa el MISMO motor (sin INSERT de escenas ni despacho propio)',
        /startReelProject/.test(engine) && !/INSERT INTO "ReelScene"/.test(engine) && !/createKieVideoTask/.test(engine));
    const spec = codigo(read('server/lib/reelSpec.js'));
    check('el bloque base es parte del prompt y no del recorte', /SCENE_BASE_PROMPT,\s*\n/.test(spec) && /prompt\.startsWith\(SCENE_BASE_PROMPT\)/.test(spec));
    const quality = codigo(read('server/lib/reelQuality.js'));
    check('el verificador de visión pregunta por collage y rotación', /"collage": boolean/.test(quality) && /"rotated": boolean/.test(quality));
    check('...y la composición entra en `disqualifying`', /const disqualifying = composition\.failed \|\|/.test(quality));
    const ts = read('src/lib/reelSpec.ts');
    check('el espejo tipado conoce `exhausted`', /'exhausted'/.test(ts));
}

// ───────────────────────────────────────────────────────────────────────────
console.log('\n▸ 7. De punta a punta con FFmpeg: una foto con EXIF → clip derecho, entero');
{
    let ffmpegOk = false;
    try { ffmpegOk = Boolean((await import('ffmpeg-static')).default); } catch { /* sin ffmpeg */ }
    if (!sharp || !ffmpegOk) {
        console.log('  (sharp o ffmpeg-static no disponibles: se salta)');
    } else {
        const { renderStillMotion, extractFrames } = await import('../server/lib/reelFfmpeg.js');
        const { probeMp4 } = await import('../server/lib/outroQuality.js');
        const upright = await sharp({ create: { width: 540, height: 960, channels: 3, background: '#3a5a40' } })
            .composite([{ input: await sharp({ create: { width: 200, height: 200, channels: 3, background: '#ff2020' } }).png().toBuffer(), left: 0, top: 0 }])
            .jpeg().toBuffer();
        const exif6 = await sharp(upright).rotate(270).withMetadata({ orientation: 6 }).jpeg().toBuffer();
        const n = await normalizePhoto(exif6, { sharp });
        // El respaldo expreso «Fotográfico» consume la NORMALIZADA: con la cruda
        // el clip saldría acostado (ffmpeg tampoco aplica el EXIF de un JPEG).
        const clip = await renderStillMotion(n.buffer, { width: 540, height: 960, fps: 24, durationSec: 2, drift: 'still' });
        const probe = probeMp4(clip);
        const o = checkClipOrientation({ clipWidth: probe.width, clipHeight: probe.height, imageWidth: n.width, imageHeight: n.height });
        check('el clip sale con la proporción de la foto derecha (no girado)', probe.width === 540 && probe.height === 960 && o.checked && o.rotated === false, `${probe.width}x${probe.height}`);
        const frames = await extractFrames(clip, { durationSec: 2, count: 2 });
        const rojo = frames.length ? (await marcaRoja(frames[0].buffer)).arribaIzq : false;
        check('...y la marca de la foto está arriba a la izquierda en el fotograma', rojo);
        const lb = frames.length ? await detectLetterbox(frames[0].buffer, { sharp }) : { checked: false };
        check('...sin franjas negras', lb.checked && lb.letterboxed === false, JSON.stringify(lb.bands));
        // Un clip que ES una fotografía paseando (Ken Burns) vale cero de vida.
        const { measureSceneLife } = await import('../server/lib/reelQuality.js');
        const pan = await renderStillMotion(n.buffer, { width: 540, height: 960, fps: 24, durationSec: 2, drift: 'up', overscan: 1.2 });
        const pf = await extractFrames(pan, { durationSec: 2, count: 3 });
        const life = await measureSceneLife(pf.map(f => f.buffer));
        check('un paneo sobre la foto quieta se reconoce como CÁMARA, no como vida (lifeScore 0)', life.cameraOnly === true, JSON.stringify({ score: life.score, explained: life.explainedByCamera }));
    }
}

console.log(`\n${fail === 0 ? '✓' : '✗'} ${pass} pruebas pasan, ${fail} fallan\n`);
process.exit(fail ? 1 : 0);
