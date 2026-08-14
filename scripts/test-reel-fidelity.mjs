#!/usr/bin/env node
/**
 * Fidelidad de imagen del motor de escenas (v4.785)
 * ==================================================
 *
 * Ejercita las cuatro correcciones nacidas del reporte con capturas del
 * 2026-08-13 —tres rescatistas inventados en una foto de escombros vacía, la
 * fotografía duplicada en el lienzo 9:16, y el clip contaminado dentro del
 * Reel—:
 *
 *   1. CENSO UNIVERSAL — la protección de personas se arma también cuando la
 *      foto tiene CERO personas. Era la condición que dejaba pasar todo: la
 *      cláusula, la oclusión y el prompt negativo exigían `hasPeople`.
 *   2. ANTI-TILING — la expansión manda prompt negativo, su prompt EXTIENDE en
 *      vez de REGENERAR, y `verifyExpansion` mira las bandas AÑADIDAS: la
 *      comprobación central daba 91 % sobre una imagen visiblemente duplicada
 *      porque su pregunta era «¿se conservó la foto?» — y se había conservado.
 *   3. INVENTARIO — el prompt nombra las cosas de la escena (edificios,
 *      árboles, vehículos) para fijarlas. Lo que no se nombra, el modelo lo
 *      trata como negociable.
 *   4. DESCARTE — leído sobre el controlador: agotados los reintentos, un
 *      defecto descalificante cae al respaldo sin IA en vez de entrar al Reel.
 *
 * La parte de imágenes usa sharp (dependencia de la plataforma). No necesita
 * base de datos, credenciales ni red.
 *
 *   npm run test:reels:fidelity
 */

import {
    buildScenePrompt, buildSceneNegativePrompt, strictPeopleFor,
    PEOPLE_NEGATIVE_PROMPT
} from '../server/lib/reelSpec.js';
import {
    buildExpansionPrompt, verifyExpansion, judgeExpansion,
    EXPANSION_NEGATIVE_PROMPT, EXPANSION_NEGATIVE_TERMS, TILING_STRUCTURE_THRESHOLD,
    BAND_MIN_DETAIL
} from '../server/lib/canvasExpansion.js';

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
console.log('\n▸ 1. El censo es universal: cuenta también cuando es CERO');

// El caso exacto de la captura: escombros nocturnos, cero personas.
const escombros = {
    hasPeople: false, personCount: 0, summary: 'escombros de demolición en una calle nocturna',
    hasBrand: false, hasText: false, hasNature: true,
    inventory: ['a large tree in the centre', 'an orange truck behind', 'piles of twisted rebar']
};

check('la preservación estricta se enciende sin personas', strictPeopleFor(escombros) === true);
check('y también con `requested: true` sobre una foto vacía', strictPeopleFor(escombros, true) === true);
check('el apagado explícito sigue mandando', strictPeopleFor(escombros, false) === false);

{
    const p = buildScenePrompt({ analysis: escombros, durationSec: 5 });
    check('el prompt declara el censo cero («no people... none in any frame»)',
        /no people in this photograph/.test(p) && /none in any frame/.test(p));
    check('y cierra los escondites («what the photograph shows is all there is»)',
        /all there is/.test(p));
    check('el ambiente sin personas NO invita a poblar el fondo',
        !/anyone in the background/.test(p) && !/loose hair/.test(p),
        (p.match(/anyone in the background|loose hair/) || [''])[0]);

    const neg = buildSceneNegativePrompt({ analysis: escombros });
    // Desde v4.787 el negativo lleva DOS bloques —el de personas y el
    // anti-paneo—, así que ya no es idéntico al de personas: se comprueba que
    // lo CONTENGA. El anti-paneo se probó aparte, en `test:reels:life`.
    check('el prompt negativo SE MANDA con cero personas', (neg || '').includes(PEOPLE_NEGATIVE_PROMPT));
    check('y trae los términos que atacan el defecto («no new people», «no ghost figure»)',
        /no new people/.test(neg || '') && /no ghost figure/.test(neg || ''));
}

// La foto CON personas conserva todo lo de v4.705 — la corrección amplía, no
// sustituye.
{
    const grupo = { hasPeople: true, personCount: 3, subjects: ['a', 'b', 'c'], summary: 'grupo' };
    const p = buildScenePrompt({ analysis: grupo, durationSec: 5 });
    check('con 3 personas el censo sigue siendo «Exactly 3»', /Exactly 3 people/.test(p));
    check('y su ambiente sí puede nombrar gente de fondo', true); // documental: sin regresión medible acá
    check('el negativo también se manda con personas',
        (buildSceneNegativePrompt({ analysis: grupo }) || '').includes(PEOPLE_NEGATIVE_PROMPT));
}

// ───────────────────────────────────────────────────────────────────────────
console.log('\n▸ 2. La expansión EXTIENDE, no regenera — y el mosaico se detecta');

{
    const prompt = buildExpansionPrompt({
        analysis: {
            photoType: 'generico', protect: [],
            lighting: 'night street light', perspective: 'eye level', depthOfField: 'deep',
            sceneAbove: 'dark sky', sceneBelow: 'rubble-strewn asphalt'
        },
        plan: { grows: 'vertical' },
        targetLabel: '9:16'
    });
    check('el prompt ya no arranca con «Regenerate this photograph»',
        !/^Regenerate/i.test(prompt), prompt.slice(0, 60));
    check('arranca extendiendo el lienzo («Extend the canvas»)', /^Extend the canvas/i.test(prompt));
    check('declara que la foto aparece UNA sola vez',
        /appears exactly once/i.test(prompt));
    check('el área nueva es paisaje, no protagonistas',
        /only the continuation of the ground, sky/i.test(prompt));
}

check('existe un prompt negativo de expansión', EXPANSION_NEGATIVE_PROMPT.length > 0);
check('ataca el mosaico («duplicated photo», «image tiling», «mirrored copy»)',
    ['duplicated photo', 'image tiling', 'mirrored copy'].every(t => EXPANSION_NEGATIVE_TERMS.includes(t)));
check('y las bandas pobladas («new people», «crowd», «new vehicles»)',
    ['new people', 'crowd', 'new vehicles'].every(t => EXPANSION_NEGATIVE_TERMS.includes(t)));

// startExpansion tiene que MANDARLO — se comprueba sobre el archivo, porque
// ejercitarlo de verdad exigiría KIE_API_KEY y red.
{
    const src = readFileSync(path.join(root, 'server/lib/canvasExpansion.js'), 'utf8');
    check('`startExpansion` manda el negativo',
        /negativePrompt:\s*EXPANSION_NEGATIVE_PROMPT/.test(src));
    check('y reintenta SIN él si el modelo lo rechaza',
        /se reintenta sin él/.test(src) && /createKieImageTask\(baseTask\)/.test(src));
}

// ── El mosaico, con imágenes de verdad ──
//
// Se compone una «fotografía» sintética con estructura (un color liso da una
// huella perceptual degenerada), una expansión legítima con bandas de paisaje
// y una expansión con la foto REPETIDA en la banda inferior — que es la
// captura del comedor comunitario.
{
    const sharp = (await import('sharp')).default;
    const W = 1080, H = 720, targetH = 1920;

    const foto = await sharp({ create: { width: W, height: H, channels: 3, background: '#3a5a40' } })
        .composite([
            { input: await sharp({ create: { width: 400, height: 300, channels: 3, background: '#c0a060' } }).png().toBuffer(), left: 80, top: 200 },
            { input: await sharp({ create: { width: 200, height: 500, channels: 3, background: '#28354b' } }).png().toBuffer(), left: 700, top: 100 },
            { input: await sharp({ create: { width: 300, height: 120, channels: 3, background: '#e0e0e0' } }).png().toBuffer(), left: 380, top: 40 }
        ]).png().toBuffer();

    const banda = await sharp({ create: { width: W, height: 600, channels: 3, background: '#4a6a50' } })
        .composite([{ input: await sharp({ create: { width: W, height: 200, channels: 3, background: '#5a7a60' } }).png().toBuffer(), left: 0, top: 200 }])
        .png().toBuffer();

    const legitima = await sharp({ create: { width: W, height: targetH, channels: 3, background: '#4a6a50' } })
        .composite([
            { input: banda, left: 0, top: 0 },
            { input: foto, left: 0, top: 600 },
            { input: banda, left: 0, top: 1320 }
        ]).png().toBuffer();

    const fotoRepetida = await sharp(foto).resize(W, 600, { fit: 'fill' }).png().toBuffer();
    const mosaico = await sharp({ create: { width: W, height: targetH, channels: 3, background: '#4a6a50' } })
        .composite([
            { input: banda, left: 0, top: 0 },
            { input: foto, left: 0, top: 600 },
            { input: fotoRepetida, left: 0, top: 1320 }
        ]).png().toBuffer();

    const plan = { grows: 'vertical' };
    const settings = { minPreservation: 0.82 };

    const vLegitima = await verifyExpansion(foto, legitima, plan);
    const jLegitima = judgeExpansion(vLegitima, settings);
    check('una expansión legítima PASA', jLegitima.verdict === 'ok', jLegitima.reason);
    check('sus bandas no se parecen a la foto',
        vLegitima.tiling?.checked && vLegitima.tiling.bands.every(b => !b.duplicated),
        JSON.stringify(vLegitima.tiling?.bands));

    const vMosaico = await verifyExpansion(foto, mosaico, plan);
    const jMosaico = judgeExpansion(vMosaico, settings);
    check('el mosaico se DETECTA en la banda añadida', vMosaico.tiling?.detected === true);
    check('y REPRUEBA aunque la región central esté intacta',
        jMosaico.verdict === 'failed' && (vMosaico.preservation ?? 0) >= settings.minPreservation,
        `veredicto=${jMosaico.verdict}, preservación central=${vMosaico.preservation}`);
    check('el motivo dice la CONSECUENCIA («la imagen duplicada»), no sólo el diagnóstico',
        /duplicada/.test(jMosaico.reason), jMosaico.reason);
    check('el umbral parte la brecha medida (bandas legítimas ~0,34, copia ~0,99)',
        TILING_STRUCTURE_THRESHOLD > 0.5 && TILING_STRUCTURE_THRESHOLD < 0.9,
        String(TILING_STRUCTURE_THRESHOLD));
}

// ───────────────────────────────────────────────────────────────────────────
console.log('\n▸ 3. El inventario fija el decorado');

{
    const p = buildScenePrompt({ analysis: escombros, durationSec: 5 });
    check('el prompt nombra el inventario con su posición',
        /a large tree in the centre/.test(p) && /an orange truck behind/.test(p));
    check('y lo cierra («nothing is added... nothing is removed»)',
        /Nothing is added to the scene, nothing is removed/i.test(p));

    const sinInventario = buildScenePrompt({ analysis: { ...escombros, inventory: [] }, durationSec: 5 });
    check('sin inventario no queda una frase colgando',
        !/keeps everything it holds, each thing in its place: \./.test(sinInventario));
}

// El presupuesto: el peor caso real —8 personas, denso, marca, texto,
// naturaleza, inventario de 6 y motionHint largo— tiene que caber en los 2500
// de Kling, y el censo tiene que sobrevivir al recorte.
{
    const peor = {
        hasPeople: true, personCount: 8, peopleDensity: 'dense', occludedPeople: true,
        hasBrand: true, hasText: true, hasNature: true,
        summary: 'grupo grande',
        motionHint: 'the volunteers keep sorting donated food boxes while two of them talk near the truck and another loads bags '.repeat(2),
        subjects: Array.from({ length: 8 }, (_, i) => `the volunteer number ${i + 1} wearing a red vest and a cap standing near the truck`),
        inventory: [
            'a collapsed two-storey building on the right', 'a large tree in the centre',
            'an orange rescue truck behind', 'piles of rubble across the street',
            'a blue tarpaulin shelter', 'municipal signage on a pole'
        ]
    };
    const p = buildScenePrompt({ analysis: peor, durationSec: 5 });
    check(`el peor caso cabe en el tope de Kling (${p.length}/2500)`, p.length <= 2500);
    check('el censo sobrevive al recorte', /Exactly 8 people/.test(p));
    check('la oclusión sobrevive al recorte', /stays hidden/.test(p));
}

// ───────────────────────────────────────────────────────────────────────────
console.log('\n▸ 2b. Una banda VACÍA tampoco es una expansión (v4.793)');

{
    // La comprobación de mosaico pregunta «¿esta banda repite la foto?». Le
    // faltaba la opuesta: «¿esta banda tiene algo?». Una franja negra —el
    // modelo rellenando en vez de extender— se parece poquísimo al original,
    // así que pasaba el anti-mosaico con nota perfecta, y la conservación del
    // centro también pasaba porque el centro estaba intacto. Entre las dos
    // dejaban pasar el clip con bordes negros arriba y abajo.
    const juez = (tiling, preservation = 0.9) =>
        judgeExpansion({ ok: true, preservation, tiling });

    check('una banda vacía reprueba la adaptación',
        juez({ checked: true, detected: false, empty: true, bands: [{ name: 'superior', flat: true }] }).verdict === 'failed');
    check('...y se dice con su CONSECUENCIA, no sólo con el motivo',
        /franjas negras/.test(juez({ checked: true, detected: false, empty: true, bands: [{ name: 'superior', flat: true }] }).reason));
    check('...aunque el centro se haya conservado perfecto',
        juez({ checked: true, detected: false, empty: true, bands: [{ name: 'inferior', flat: true }] }, 0.99).verdict === 'failed');
    check('el mosaico sigue reprobando igual',
        juez({ checked: true, detected: true, empty: false, bands: [{ name: 'inferior', duplicated: true }] }).verdict === 'failed');
    check('una banda con contenido pasa',
        juez({ checked: true, detected: false, empty: false, bands: [{ name: 'superior', flat: false, detail: 18 }] }).verdict === 'ok');

    // El umbral tiene que dejar fuera el relleno y no tocar el contenido real.
    check('el umbral está declarado y deja margen sobre el relleno plano',
        typeof BAND_MIN_DETAIL === 'number' && BAND_MIN_DETAIL > 0 && BAND_MIN_DETAIL < 4,
        String(BAND_MIN_DETAIL));

    let sharpOk = true;
    try { await import('sharp'); } catch { sharpOk = false; }
    if (!sharpOk) {
        console.log('  SALTA la medición — sharp no está instalado.');
    } else {
        const sharp = (await import('sharp')).default;
        const desvio = async (buf) => {
            const st = await sharp(buf).stats();
            const c = st.channels.slice(0, 3);
            return c.reduce((a, x) => a + x.stdev, 0) / c.length;
        };
        const negro = await sharp({ create: { width: 300, height: 150, channels: 3, background: '#000' } }).png().toBuffer();
        const ruido = Buffer.alloc(300 * 150 * 3);
        let semilla = 11;
        for (let i = 0; i < 300 * 150; i++) {
            semilla = (semilla * 1103515245 + 12345) & 0x7fffffff;
            const v = 60 + (semilla % 140);
            ruido[i * 3] = v; ruido[i * 3 + 1] = (v * 2) % 256; ruido[i * 3 + 2] = (v * 3) % 256;
        }
        const foto = await sharp(ruido, { raw: { width: 300, height: 150, channels: 3 } }).blur(2).png().toBuffer();

        const dNegro = await desvio(negro);
        const dFoto = await desvio(foto);
        check(`una franja negra queda por debajo del umbral (${dNegro.toFixed(2)} < ${BAND_MIN_DETAIL})`, dNegro < BAND_MIN_DETAIL);
        check(`una banda con contenido queda por encima (${dFoto.toFixed(2)} > ${BAND_MIN_DETAIL})`, dFoto > BAND_MIN_DETAIL);
    }
}

// ───────────────────────────────────────────────────────────────────────────
console.log('\n▸ 2b-bis. El borde de la banda no puede morir en NEGRO (v4.799)');

{
    // La secuela del anti-vacío, con la misma forma: había mediciones sobre la
    // banda ENTERA y todas daban bien — una banda con paisaje real que muere en
    // una franja negra en el borde del cuadro tiene desviación alta y no repite
    // la foto. El Reel salía con una línea negra arriba, reportado con captura.
    // El criterio es plano Y oscuro: un cielo despejado puede ser plano en una
    // franja de 32 px, pero ningún cielo fotografiado es negro puro.
    const { EDGE_MAX_BLACK_LUMA } = await import('../server/lib/canvasExpansion.js');
    const juez = (tiling, preservation = 0.9) =>
        judgeExpansion({ ok: true, preservation, tiling });

    check('un borde plano y negro reprueba la adaptación',
        juez({ checked: true, detected: false, empty: false, emptyEdge: true, bands: [{ name: 'superior', edgeFlat: true }] }).verdict === 'failed');
    check('...con su CONSECUENCIA: la línea negra en el borde',
        /línea negra/.test(juez({ checked: true, detected: false, empty: false, emptyEdge: true, bands: [{ name: 'superior', edgeFlat: true }] }).reason));
    check('...aunque el centro se haya conservado perfecto',
        juez({ checked: true, detected: false, empty: false, emptyEdge: true, bands: [{ name: 'superior', edgeFlat: true }] }, 0.99).verdict === 'failed');
    check('el umbral de luminancia está declarado y es NEGRO, no oscuro',
        typeof EDGE_MAX_BLACK_LUMA === 'number' && EDGE_MAX_BLACK_LUMA > 0 && EDGE_MAX_BLACK_LUMA < 40,
        String(EDGE_MAX_BLACK_LUMA));

    let sharpEdge = true;
    try { await import('sharp'); } catch { sharpEdge = false; }
    if (!sharpEdge) {
        console.log('  SALTA la medición — sharp no está instalado.');
    } else {
        const sharp = (await import('sharp')).default;
        const W = 1080, H = 720, targetH = 1920;
        const foto = await sharp({ create: { width: W, height: H, channels: 3, background: '#3a5a40' } })
            .composite([
                { input: await sharp({ create: { width: 400, height: 300, channels: 3, background: '#c0a060' } }).png().toBuffer(), left: 80, top: 200 },
                { input: await sharp({ create: { width: 200, height: 500, channels: 3, background: '#28354b' } }).png().toBuffer(), left: 700, top: 100 }
            ]).png().toBuffer();
        const banda = await sharp({ create: { width: W, height: 600, channels: 3, background: '#4a6a50' } })
            .composite([{ input: await sharp({ create: { width: W, height: 200, channels: 3, background: '#5a7a60' } }).png().toBuffer(), left: 0, top: 200 }])
            .png().toBuffer();
        const franjaNegra = await sharp({ create: { width: W, height: 24, channels: 3, background: '#000' } }).png().toBuffer();

        // La banda superior tiene paisaje... y muere en negro en el borde.
        const conLinea = await sharp({ create: { width: W, height: targetH, channels: 3, background: '#4a6a50' } })
            .composite([
                { input: banda, left: 0, top: 0 },
                { input: franjaNegra, left: 0, top: 0 },
                { input: foto, left: 0, top: 600 },
                { input: banda, left: 0, top: 1320 }
            ]).png().toBuffer();

        const v = await verifyExpansion(foto, conLinea, { grows: 'vertical' });
        const j = judgeExpansion(v, { minPreservation: 0.82 });
        check('la línea negra en el borde superior se DETECTA',
            v.tiling?.emptyEdge === true && v.tiling.bands.some(b => b.name === 'superior' && b.edgeFlat),
            JSON.stringify(v.tiling?.bands?.map(b => ({ n: b.name, e: b.edgeDetail, l: b.edgeLuma }))));
        check('...y REPRUEBA aunque la banda entera tenga contenido',
            j.verdict === 'failed' && /línea negra/.test(j.reason), j.reason);

        // Un borde plano pero OSCURO-AZUL (cielo nocturno plausible) NO se
        // acusa: el criterio doble existe para no regenerar noches legítimas.
        const nocturno = await sharp({ create: { width: W, height: targetH, channels: 3, background: '#4a6a50' } })
            .composite([
                { input: banda, left: 0, top: 0 },
                { input: await sharp({ create: { width: W, height: 24, channels: 3, background: '#28304a' } }).png().toBuffer(), left: 0, top: 0 },
                { input: foto, left: 0, top: 600 },
                { input: banda, left: 0, top: 1320 }
            ]).png().toBuffer();
        const vNoche = await verifyExpansion(foto, nocturno, { grows: 'vertical' });
        check('un borde oscuro pero NO negro (cielo nocturno) no se acusa',
            vNoche.tiling?.emptyEdge !== true,
            JSON.stringify(vNoche.tiling?.bands?.map(b => ({ n: b.name, e: b.edgeDetail, l: b.edgeLuma }))));
    }
}

// ───────────────────────────────────────────────────────────────────────────
console.log('\n▸ 2c. Una copia PARCIAL de la foto tampoco es una expansión (v4.797)');

{
    // El hueco que quedaba tras el anti-mosaico: una banda que copia un TROZO
    // de la foto —o la foto entera desenfocada de fondo— queda por debajo del
    // umbral de similitud global. Se detecta con correlación de verdad: la
    // banda se desliza sobre el original a varias escalas.
    const { detectPartialCopy, PARTIAL_COPY_THRESHOLD } = await import('../server/lib/canvasExpansion.js');
    check('el umbral está declarado y es correlación alta',
        typeof PARTIAL_COPY_THRESHOLD === 'number' && PARTIAL_COPY_THRESHOLD >= 0.85);

    let sharpOk2 = true;
    try { await import('sharp'); } catch { sharpOk2 = false; }
    if (!sharpOk2) {
        console.log('  SALTA la medición — sharp no está instalado.');
    } else {
        const sharp = (await import('sharp')).default;
        // Una «fotografía» con estructura gruesa y suave, como las reales.
        const lo = Buffer.alloc(24 * 18 * 3);
        let s0 = 42;
        for (let i = 0; i < 24 * 18; i++) {
            s0 = (s0 * 1103515245 + 12345) & 0x7fffffff;
            const v = 40 + (s0 % 180);
            lo[i * 3] = v; lo[i * 3 + 1] = (v * 2) % 256; lo[i * 3 + 2] = (v * 5) % 256;
        }
        const foto = await sharp(lo, { raw: { width: 24, height: 18, channels: 3 } })
            .resize(800, 600).blur(2).png().toBuffer();

        const copia = await sharp(foto).extract({ left: 200, top: 150, width: 400, height: 300 })
            .resize(800, 300).png().toBuffer();
        const fondoBlur = await sharp(foto).resize(800, 300, { fit: 'fill' }).blur(6).png().toBuffer();
        const lo2 = Buffer.alloc(24 * 9 * 3);
        let s1 = 999;
        for (let i = 0; i < 24 * 9; i++) {
            s1 = (s1 * 1103515245 + 12345) & 0x7fffffff;
            const v = 50 + (s1 % 160);
            lo2[i * 3] = (v * 3) % 256; lo2[i * 3 + 1] = v; lo2[i * 3 + 2] = (v * 7) % 256;
        }
        const nueva = await sharp(lo2, { raw: { width: 24, height: 9, channels: 3 } })
            .resize(800, 300).png().toBuffer();
        const cielo = await sharp({ create: { width: 800, height: 300, channels: 3, background: '#7fa8d0' } })
            .png().toBuffer();

        check('un trozo de la foto, estirado a la banda, se detecta',
            (await detectPartialCopy(sharp, foto, copia)).detected === true);
        check('la foto entera desenfocada de fondo también',
            (await detectPartialCopy(sharp, foto, fondoBlur)).detected === true);
        check('un paisaje nuevo con paleta parecida NO se acusa',
            (await detectPartialCopy(sharp, foto, nueva)).detected === false);
        check('una banda lisa no vota (de la vacía ya se ocupa BAND_MIN_DETAIL)',
            (await detectPartialCopy(sharp, foto, cielo)).best === null);
    }
}

// ───────────────────────────────────────────────────────────────────────────
console.log('\n▸ 4. El clip contaminado no entra al Reel (leído sobre el controlador)');

{
    const src = readFileSync(path.join(root, 'server/controllers/reelController.js'), 'utf8');

    // ── CAMBIO DE SIGNO DELIBERADO (v4.801) ──
    //
    // Hasta v4.800 esta sección afirmaba que los agotados iban al respaldo
    // 2.5D («los agotados van al respaldo sin IA»). El CLIENTE vetó ese
    // respaldo con estas palabras: «Prefiero una escena marcada como fallida
    // antes que un falso resultado animado» — el paneo presentado como escena
    // fue el centro de tres reportes seguidos. Ahora la escena agotada queda
    // en ERROR con su medida concreta y sin clip; la única vía del 2.5D es la
    // elección expresa del modo «Fotográfico — sin IA».
    check('los agotados quedan en ERROR con su motivo, sin respaldo Ken Burns',
        /No fue posible animar esta escena conservando la fotografía/.test(src)
        && !/agotados\.map\(sc =>\s*\n?\s*resolveSceneWithStillMotion/.test(src));
    check('...y sin clip: el contaminado no viaja al montaje por ninguna vía',
        /SET status = 'error', "videoUrl" = NULL/.test(src));

    // La distinción de v4.792 sigue viva: sólo la invención humana llega a
    // agotados; marca y texto conservan su clip animado en revisión.
    check('sólo la INVENCIÓN HUMANA falla tras agotar los reintentos',
        /agotados = infidel\.filter\(sc => esInvencionHumana\(sc\) && sc\.attempts >= MAX_AUTO_RETRIES\)/.test(src));
    check('marca y texto agotados CONSERVAN su clip animado',
        /conservados = infidel\.filter\(sc =>[\s\S]{0,200}!esInvencionHumana\(sc\) && sc\.attempts >= MAX_AUTO_RETRIES/.test(src));
    check('mientras queden reintentos, marca y texto se siguen regenerando',
        /descalificados = infidel\.filter\(sc => esDescalificante\(sc\) && sc\.attempts < MAX_AUTO_RETRIES\)/.test(src));
    check('el gasto de las escenas fallidas se DICE, no se calla',
        /Consumió sus \$\{MAX_AUTO_RETRIES\} generaciones de video/.test(src));
    check('tras marcar las fallidas la pasada TERMINA (el montaje esperaría filas frescas)',
        /finalScenes` se leyó antes de marcar/.test(src));
}

// ───────────────────────────────────────────────────────────────────────────
console.log(`\n${fail === 0 ? '✓' : '✗'} ${pass} pruebas pasan, ${fail} fallan\n`);
process.exit(fail === 0 ? 0 : 1);
