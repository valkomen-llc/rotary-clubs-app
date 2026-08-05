#!/usr/bin/env node
/**
 * Preservación estricta de personas — Creador de Reels IA (v4.705)
 * ================================================================
 *
 * Ejercita las dos piezas que se pueden probar sin proveedor ni base:
 *
 *   · `buildPeopleReport` — el criterio de la fidelidad humana. Recibe lo que
 *     contestó el modelo de visión sobre cada fotograma y decide si la escena
 *     mostró a alguien que no está en la fotografía.
 *   · `resolveSceneIntensity` y `buildScenePrompt` — que la intensidad se acote
 *     sola en los grupos densos, que el censo y la oclusión estén en el prompt,
 *     y que el prompt quepa en los 2500 caracteres que declara Kling.
 *
 * Se prueba el CRITERIO, no la orquestación, por el mismo motivo que
 * `seoRules.js` vive separado de `seoAudit.js`: un motor que sólo se ejercita
 * contra un proveedor real acaba sin pruebas, y entonces nadie se entera de que
 * una regla cambió de signo.
 *
 * No necesita base de datos, credenciales ni red.
 *
 *   npm run test:reels:people
 */

import { buildPeopleReport, BRAND_MIN_STRUCTURE, BRAND_MIN_TEMPORAL } from '../server/lib/reelQuality.js';
import { buildScenePrompt, buildSceneNegativePrompt, resolveSceneIntensity, PEOPLE_NEGATIVE_TERMS } from '../server/lib/reelSpec.js';

let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
    if (cond) { pass++; console.log(`  OK    ${name}`); }
    else { fail++; console.log(`  FALLA ${name}${extra ? ` — ${extra}` : ''}`); }
};

// Lo que devuelve el modelo de visión por fotograma, con todo en orden.
const frame = (o = {}) => ({
    score: 9, internalMotion: 7,
    peopleLeft: 4, peopleRight: 4,
    newSubjects: false, occlusionBroken: false, faceConsistency: 9,
    deformation: false, identityDrift: false, brandAltered: false,
    textIllegible: false, colorShift: false, anatomyErrors: false,
    text: null, issues: [],
    ...o
});
const three = (first = {}) => [frame(first), frame(), frame()];
const PEOPLE = { hasPeople: true, personCount: 4 };

console.log('\n── Fidelidad humana: el criterio ──');

// El caso reportado: nota alta y aun así un rostro de más. Es exactamente lo
// que no se medía hasta v4.704, y por eso una escena así pasaba con 8/10.
check('nota 8 con un sujeto nuevo → falla',
    buildPeopleReport(three({ score: 8, newSubjects: true }), PEOPLE).verdict === 'failed');

check('escena limpia → verificada',
    buildPeopleReport(three(), PEOPLE).verdict === 'ok');

// La deriva de un motor generativo es progresiva: el último fotograma es donde
// aparece la figura. Un solo fotograma malo condena la escena.
check('el recuento crece sólo en el último fotograma → falla',
    buildPeopleReport([frame(), frame(), frame({ peopleRight: 5 })], PEOPLE).verdict === 'failed');

check('el recuento baja en un fotograma → falla',
    buildPeopleReport([frame({ peopleRight: 3 }), frame(), frame()], PEOPLE).verdict === 'failed');

// Contar catorce cabezas no lo hace bien ningún modelo de visión: en multitud
// el recuento no puede decidir solo, o se regenerarían escenas perfectas.
const crowd = { hasPeople: true, personCount: 14 };
check('multitud: +1 sobre 14 NO descalifica',
    buildPeopleReport(three({ peopleLeft: 14, peopleRight: 15 }), crowd).verdict === 'ok');
check('multitud: la señal explícita SÍ descalifica',
    buildPeopleReport(three({ peopleLeft: 14, peopleRight: 15, newSubjects: true }), crowd).verdict === 'failed');
check('multitud: se declara que el recuento no decide',
    buildPeopleReport(three({ peopleLeft: 14, peopleRight: 14 }), crowd).countReliable === false);

check('oclusión rota → falla',
    buildPeopleReport(three({ occlusionBroken: true }), PEOPLE).verdict === 'failed');
check('rostros inconsistentes (4/10) → falla',
    buildPeopleReport(three({ faceConsistency: 4 }), PEOPLE).verdict === 'failed');

// Sin personas no hay fidelidad humana que medir, y no se afirma haberla
// comprobado: la ficha no pinta seis indicadores vacíos.
check('sin personas en la foto → no se reporta nada',
    buildPeopleReport(three(), { hasPeople: false }) === null);
// Sin modelo de visión tampoco: la señal estructural no cuenta personas.
check('sin modelo de visión → no se reporta nada',
    buildPeopleReport([], PEOPLE) === null);

// Los seis indicadores tienen que existir y ser tres-estados, porque es lo que
// pinta la ficha. `null` significa «no se pudo comprobar» y se ve distinto de
// «bien»: presentarlo como verde manda a buscar el problema donde no está.
const r = buildPeopleReport(three(), PEOPLE);
check('los seis indicadores viajan en el informe',
    ['countStable', 'identitiesPreserved', 'occlusionsPreserved', 'facesConsistent', 'noNewSubjects', 'clipSeen']
        .every(k => k in r), JSON.stringify(Object.keys(r)));
check('un fallo lleva su motivo escrito',
    typeof buildPeopleReport(three({ newSubjects: true }), PEOPLE).reason === 'string');

console.log('\n── Intensidad: se acota sola, nunca sube ──');

const dense = { hasPeople: true, personCount: 8, peopleDensity: 'dense' };
const occluded = { hasPeople: true, personCount: 4, occludedPeople: true };
const group = { hasPeople: true, personCount: 3, peopleDensity: 'sparse' };
const solo = { hasPeople: true, personCount: 1, peopleDensity: 'sparse' };

check('caras tapadas → «sutil»',
    resolveSceneIntensity({ analysis: occluded, requested: 'expresivo' }).intensity === 'sutil');
check('grupo denso → «sutil»',
    resolveSceneIntensity({ analysis: dense, requested: 'expresivo' }).intensity === 'sutil');
check('tres personas → como mucho «natural»',
    resolveSceneIntensity({ analysis: group, requested: 'expresivo' }).intensity === 'natural');
check('una persona → lo que pidió el usuario',
    resolveSceneIntensity({ analysis: solo, requested: 'expresivo' }).intensity === 'expresivo');
// Nunca SUBE: es lo que hace que elegir «Muy sutil» en la pantalla signifique algo.
check('nunca sube: «sutil» pedido sigue «sutil»',
    resolveSceneIntensity({ analysis: solo, requested: 'sutil' }).intensity === 'sutil');
check('sin personas no actúa',
    resolveSceneIntensity({ analysis: { hasPeople: false }, requested: 'expresivo' }).intensity === 'expresivo');
check('apagado a mano no actúa',
    resolveSceneIntensity({ analysis: dense, requested: 'expresivo', strictPeople: false }).intensity === 'expresivo');
// Una escena que se mueve menos que las otras sin explicación se lee como un fallo.
check('cuando acota, dice por qué',
    typeof resolveSceneIntensity({ analysis: dense, requested: 'expresivo' }).reason === 'string');
check('cuando no acota, no inventa un motivo',
    resolveSceneIntensity({ analysis: solo, requested: 'sutil' }).reason === null);

console.log('\n── Prompt: censo, oclusión y presupuesto ──');

const PROMPT_LIMIT = 2500;   // el que declara la API de Kling
const cases = [
    ['4 personas, marca y hint largo', {
        hasPeople: true, personCount: 4, hasBrand: true,
        subjects: ['the woman in the red vest on the left', 'the man in the blue shirt behind her'],
        motionHint: 'the two women keep sorting the boxes while the man beside them looks over and says something'
    }, 'sutil'],
    ['grupo de 8 con todo activado', {
        hasPeople: true, personCount: 8, peopleDensity: 'dense', occludedPeople: true,
        subjects: Array.from({ length: 8 }, (_, i) => `person ${i + 1} in a coloured vest standing quietly at the back`),
        hasBrand: true, hasText: true, hasNature: true, motionHint: 'y '.repeat(100)
    }, 'expresivo'],
    ['una persona sin marca', {
        hasPeople: true, personCount: 1, subjects: ['the man at the lectern'], motionHint: 'he keeps speaking'
    }, 'natural']
];

for (const [name, analysis, intensity] of cases) {
    const p = buildScenePrompt({ style: 'documental', durationSec: 5, analysis, intensity });
    check(`${name}: cabe en ${PROMPT_LIMIT} caracteres`, p.length <= PROMPT_LIMIT, `${p.length}`);
    check(`${name}: lleva el censo`, /count stays/.test(p));
    check(`${name}: lleva la oclusión`, p.includes('stays hidden'));
    // Un prompt cortado a mitad de palabra es basura enviada al proveedor.
    check(`${name}: no se cortó a mitad de palabra`, /[.\s]$/.test(p), JSON.stringify(p.slice(-40)));
}

const noPeople = buildScenePrompt({ style: 'documental', durationSec: 5, analysis: { hasPeople: false, hasNature: true } });
check('sin personas: el prompt no habla de censo', !/count stays/.test(noPeople));

console.log('\n── Prompt negativo: en su campo, no pegado al positivo ──');

// Va en `negative_prompt` y no dentro del prompt por dos motivos: el
// presupuesto (se comía el 26 % del positivo) y la regla del sitio de escribir
// en positivo, porque el modelo se obsesiona con lo prohibido.
const peopleAnalysis = { hasPeople: true, personCount: 4 };
const positive = buildScenePrompt({ style: 'documental', durationSec: 5, analysis: peopleAnalysis });
check('el bloque negativo NO está dentro del prompt positivo',
    !positive.includes('Negative prompt') && !positive.includes('no ghost figure'));

const neg = buildSceneNegativePrompt({ analysis: peopleAnalysis });
check('con personas hay prompt negativo', typeof neg === 'string' && neg.length > 0);
check('lleva los veinte términos del pedido, literales',
    PEOPLE_NEGATIVE_TERMS.every(t => neg.includes(t)), `${PEOPLE_NEGATIVE_TERMS.length} términos`);
check('el negativo también cabe en 2500', (neg || '').length <= PROMPT_LIMIT);
check('sin personas no se manda', buildSceneNegativePrompt({ analysis: { hasPeople: false } }) === null);
check('apagado a mano no se manda', buildSceneNegativePrompt({ analysis: peopleAnalysis, strictPeople: false }) === null);

process.env.REEL_PEOPLE_NEGATIVE_PROMPT = 'off';
check('se puede apagar por entorno, sin desplegar',
    buildSceneNegativePrompt({ analysis: peopleAnalysis }) === null);
delete process.env.REEL_PEOPLE_NEGATIVE_PROMPT;


console.log('\n── Marca: la intensidad cede ante el logotipo ──');

// Jerarquía declarada: la fidelidad de la marca manda sobre la intensidad de la
// animación, nunca al revés. Un logotipo estampado sobre una persona es el caso
// de riesgo — la tela se mueve con el cuerpo—; uno en un pendón quieto, no.
check('marca sobre personas → como mucho «natural»',
    resolveSceneIntensity({ analysis: { hasPeople: true, personCount: 2, hasBrand: true }, requested: 'expresivo' }).intensity === 'natural');
check('marca SIN personas (pendón) no acota',
    resolveSceneIntensity({ analysis: { hasPeople: false, hasBrand: true }, requested: 'expresivo' }).intensity === 'expresivo');
check('personas sin marca no acota por marca',
    resolveSceneIntensity({ analysis: { hasPeople: true, personCount: 2 }, requested: 'expresivo' }).intensity === 'expresivo');
// Las condiciones se combinan quedándose con la MÁS restrictiva.
check('marca + caras tapadas gana la más estricta',
    resolveSceneIntensity({ analysis: { hasPeople: true, personCount: 2, hasBrand: true, occludedPeople: true }, requested: 'expresivo' }).intensity === 'sutil');
check('acotar por marca dice por qué',
    /logotipo/i.test(resolveSceneIntensity({ analysis: { hasPeople: true, personCount: 2, hasBrand: true }, requested: 'expresivo' }).reason || ''));

// Los umbrales del control de marca son deliberadamente laxos porque el recorte
// se toma en coordenadas FIJAS y la persona se mueve: con modelo de visión
// decide el modelo, y estos sólo deciden cuando no lo hay.
check('los umbrales de marca están declarados',
    typeof BRAND_MIN_STRUCTURE === 'number' && typeof BRAND_MIN_TEMPORAL === 'number');

console.log(`\n${pass} correctas, ${fail} fallidas\n`);
process.exit(fail ? 1 : 0);
