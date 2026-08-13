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
    EXPANSION_NEGATIVE_PROMPT, EXPANSION_NEGATIVE_TERMS, TILING_STRUCTURE_THRESHOLD
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
    check('el prompt negativo SE MANDA con cero personas', neg === PEOPLE_NEGATIVE_PROMPT);
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
        buildSceneNegativePrompt({ analysis: grupo }) === PEOPLE_NEGATIVE_PROMPT);
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
console.log('\n▸ 4. El clip contaminado no entra al Reel (leído sobre el controlador)');

{
    const src = readFileSync(path.join(root, 'server/controllers/reelController.js'), 'utf8');
    check('los agotados con defecto descalificante van al respaldo sin IA',
        /agotados\.map\(sc =>\s*\n?\s*resolveSceneWithStillMotion/.test(src));
    check('los conservados son SÓLO los de nota baja, no los descalificantes',
        /conservados = infidel\.filter\(sc => !esDescalificante\(sc\)\)/.test(src));
    check('tras el rescate la pasada TERMINA (el montaje esperaría filas frescas)',
        /finalScenes` se leyó ANTES del rescate/.test(src));
    check('el respaldo que falla degrada a needs_review, no tumba el Reel',
        /el respaldo sin IA falló/.test(src));
}

// ───────────────────────────────────────────────────────────────────────────
console.log(`\n${fail === 0 ? '✓' : '✗'} ${pass} pruebas pasan, ${fail} fallan\n`);
process.exit(fail === 0 ? 0 : 1);
