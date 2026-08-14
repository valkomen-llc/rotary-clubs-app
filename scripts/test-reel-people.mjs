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

import { buildPeopleReport, judgeTextFidelity, BRAND_MIN_STRUCTURE, BRAND_MIN_TEMPORAL } from '../server/lib/reelQuality.js';
import { buildScenePrompt, buildSceneNegativePrompt, resolveSceneIntensity, PEOPLE_NEGATIVE_TERMS, MOTION_NEGATIVE_TERMS, MOTION_INTENSITY } from '../server/lib/reelSpec.js';
import { resolveEditFps } from '../server/lib/reelRenderProviders.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

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
// Desde v4.795 una señal explícita necesita verse en DOS fotogramas: la deriva
// de un motor generativo es persistente, así que un `true` suelto es tan
// probable que venga de la duda del modelo como del clip.
const dos = (o = {}) => [frame(o), frame(o), frame()];
const PEOPLE = { hasPeople: true, personCount: 4 };

console.log('\n── Fidelidad humana: el criterio ──');

// El caso reportado: nota alta y aun así un rostro de más. Es exactamente lo
// que no se medía hasta v4.704, y por eso una escena así pasaba con 8/10.
check('nota 8 con un sujeto nuevo → falla',
    buildPeopleReport(dos({ score: 8, newSubjects: true }), PEOPLE).verdict === 'failed');

check('escena limpia → verificada',
    buildPeopleReport(three(), PEOPLE).verdict === 'ok');

// ── CAMBIO DE SIGNO DELIBERADO (v4.787) ──
//
// Estas dos afirmaciones decían que un ±1 en UN fotograma descalifica, con el
// argumento de que la deriva de un motor generativo es progresiva. El
// argumento sigue siendo cierto y la conclusión era demasiado ancha: con tres
// fotogramas y un grupo de cuatro personas, que alguno desvíe en uno es lo
// normal —una persona medio tapada se cuenta o no según el fotograma—, así que
// en la práctica casi toda escena con gente agotaba sus dos intentos y
// terminaba sustituida por la fotografía en movimiento. Ése es el defecto que
// el cliente reportó con tres clips: «no genera videos, solo les pone
// movimiento a las imágenes».
//
// Ahora el recuento descalifica cuando está CORROBORADO. Nada más se aflojó.
check('un +1 en un solo fotograma es ruido de conteo, no descalifica',
    buildPeopleReport([frame(), frame(), frame({ peopleRight: 5 })], PEOPLE).verdict === 'ok');
check('...pero se DICE que lo hubo, no se esconde',
    buildPeopleReport([frame(), frame(), frame({ peopleRight: 5 })], PEOPLE).countNoise === true);
check('...y el indicador no queda en rojo bajo una cabecera verde',
    buildPeopleReport([frame(), frame(), frame({ peopleRight: 5 })], PEOPLE).countStable === true);

check('un +2 en un fotograma sí descalifica: eso ya no es un recuento dudoso',
    buildPeopleReport([frame(), frame(), frame({ peopleRight: 6 })], PEOPLE).verdict === 'failed');
check('un +1 repetido en DOS fotogramas sí descalifica: el ruido no es sistemático',
    buildPeopleReport([frame(), frame({ peopleRight: 5 }), frame({ peopleRight: 5 })], PEOPLE).verdict === 'failed');

// La exigencia expresa del cliente, y no depende de la corroboración: nadie
// confunde una escena vacía con una habitada.
const EMPTY = { hasPeople: true, personCount: 0 };
const emptyFrame = (o = {}) => frame({ peopleLeft: 0, peopleRight: 0, ...o });
check('de CERO a uno descalifica en el acto, aunque sea un solo fotograma',
    buildPeopleReport([emptyFrame(), emptyFrame(), emptyFrame({ peopleRight: 1 })], EMPTY).verdict === 'failed');
check('cero y cero sigue estando bien',
    buildPeopleReport([emptyFrame(), emptyFrame(), emptyFrame()], EMPTY).verdict === 'ok');

check('un -1 en un fotograma es ruido',
    buildPeopleReport([frame({ peopleRight: 3 }), frame(), frame()], PEOPLE).verdict === 'ok');
check('un -1 repetido sí descalifica: alguien desaparece',
    buildPeopleReport([frame({ peopleRight: 3 }), frame({ peopleRight: 3 }), frame()], PEOPLE).verdict === 'failed');
check('un -2 en un fotograma también',
    buildPeopleReport([frame({ peopleRight: 2 }), frame(), frame()], PEOPLE).verdict === 'failed');

// Las otras puertas NO se tocaron: son señales explícitas del modelo, no
// aritmética de conteo.
// ── CAMBIO DE SIGNO DELIBERADO (v4.795) ──
//
// Estas dos decían que una señal explícita descalifica vista en UN fotograma.
// Es la cuarta puerta con la misma forma —tras el recuento, el texto y los
// rostros—: una pregunta binaria que el modelo contesta sobre la composición
// reducida a 640 px, y en una escena de emergencia con figuras pequeñas y a
// contraluz un `true` suelto es tan probable que venga de su duda como del
// clip. La deriva de un motor generativo es persistente: si inventó a alguien,
// se queda. Exigir DOS fotogramas no deja pasar el defecto real.
check('un sujeto nuevo en UN solo fotograma es ruido de lectura',
    buildPeopleReport([frame(), frame(), frame({ newSubjects: true })], PEOPLE).verdict === 'ok');
check('...y se DICE que se vio, no se esconde',
    buildPeopleReport([frame(), frame(), frame({ newSubjects: true })], PEOPLE).signalNoise === true);
check('un sujeto nuevo en DOS fotogramas sí descalifica',
    buildPeopleReport(dos({ newSubjects: true }), PEOPLE).verdict === 'failed');
check('una oclusión rota en UN fotograma es ruido',
    buildPeopleReport([frame(), frame(), frame({ occlusionBroken: true })], PEOPLE).verdict === 'ok');
check('en DOS sí descalifica',
    buildPeopleReport(dos({ occlusionBroken: true }), PEOPLE).verdict === 'failed');

// La foto SIN personas no necesita corroboración: nadie confunde una escena
// vacía con una habitada, y es la exigencia expresa del cliente.
check('en una foto VACÍA basta un fotograma con alguien',
    buildPeopleReport([emptyFrame({ newSubjects: true }), emptyFrame(), emptyFrame()], EMPTY).verdict === 'failed');

// Contar catorce cabezas no lo hace bien ningún modelo de visión: en multitud
// el recuento no puede decidir solo, o se regenerarían escenas perfectas.
const crowd = { hasPeople: true, personCount: 14 };
check('multitud: +1 sobre 14 NO descalifica',
    buildPeopleReport(three({ peopleLeft: 14, peopleRight: 15 }), crowd).verdict === 'ok');
check('multitud: la señal explícita corroborada SÍ descalifica',
    buildPeopleReport([
        frame({ peopleLeft: 14, peopleRight: 15, newSubjects: true }),
        frame({ peopleLeft: 14, peopleRight: 15, newSubjects: true }),
        frame({ peopleLeft: 14, peopleRight: 14 })
    ], crowd).verdict === 'failed');
check('multitud: se declara que el recuento no decide',
    buildPeopleReport(three({ peopleLeft: 14, peopleRight: 14 }), crowd).countReliable === false);

check('oclusión rota corroborada → falla',
    buildPeopleReport(dos({ occlusionBroken: true }), PEOPLE).verdict === 'failed');
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
    typeof buildPeopleReport(dos({ newSubjects: true }), PEOPLE).reason === 'string');

console.log('\n── El orden del usuario es la fuente de verdad (v4.797) ──');

{
    const { fallbackDirection } = await import('../server/lib/reelDirector.js');
    const an = [
        { summary: 'a', subject: 'people', shotSize: 'close', energy: 3, narrativeRole: 'closing', hasPeople: true, hasBrand: true, hasText: false, hasFoodOrLiquid: false, hasNature: false, riskNotes: [] },
        { summary: 'b', subject: 'venue', shotSize: 'wide', energy: 2, narrativeRole: 'opening', hasPeople: false, hasBrand: false, hasText: false, hasFoodOrLiquid: false, hasNature: false, riskNotes: [] },
        { summary: 'c', subject: 'people', shotSize: 'medium', energy: 3, narrativeRole: 'development', hasPeople: true, hasBrand: false, hasText: false, hasFoodOrLiquid: false, hasNature: false, riskNotes: [] },
    ];
    const base = { motionStyle: 'auto', transition: 'auto', musicStyle: 'auto' };

    // Estas fotos están elegidas para que el criterio propio QUIERA reordenar
    // (la abierta iría primera): si aun así respeta [0,1,2], el orden manda.
    check('por defecto el orden del usuario se respeta tal cual',
        JSON.stringify(fallbackDirection(an, base).order) === '[0,1,2]');
    check('la IA sólo reordena cuando se le pide (`lockedOrder: false`)',
        JSON.stringify(fallbackDirection(an, { ...base, lockedOrder: false }).order) !== '[0,1,2]');

    const ctrl = readFileSync(path.join(root, 'server/controllers/reelController.js'), 'utf8');
    check('el controlador fija el orden salvo `autoOrder: true` explícito',
        /lockedOrder: req\.body\?\.autoOrder !== true/.test(ctrl));
    const ui = readFileSync(path.join(root, 'src/components/admin/content-studio/VideoCreator.tsx'), 'utf8');
    check('la pantalla ofrece el reordenamiento como casilla, apagada por defecto',
        /autoOrder: false/.test(ui) && /Dejar que la IA ordene las fotos/.test(ui));
    const dir = readFileSync(path.join(root, 'server/lib/reelDirector.js'), 'utf8');
    check('al director se le DICE que el orden está fijado (o asignaría roles a otro montaje)',
        /EL ORDEN DE LAS FOTOS ESTÁ FIJADO POR EL USUARIO/.test(dir));
}

console.log('\n── La animación no puede invertir una acción (v4.797) ──');

{
    // El defecto reportado con el comedor: la fila que RECIBÍA mercados
    // terminó entregándolos. Las mismas personas, la misma composición — y una
    // falsedad sobre lo que ocurrió.
    const conAccion = {
        hasPeople: true, personCount: 5, peopleDensity: 'sparse',
        subjects: ['volunteer in white', 'girl in pink'],
        interactions: [{ from: 'the volunteer in white', action: 'hands a food bag to', to: 'the girl in pink' }],
        summary: 'comedor'
    };
    const p = buildScenePrompt({ style: 'documental', durationSec: 5, analysis: conAccion });
    check('el prompt fija la dirección de cada interacción fotografiada',
        /direction of every interaction stays exactly as photographed/.test(p));
    check('...con la interacción CONCRETA de esa foto',
        /the volunteer in white/.test(p) && /the girl in pink/.test(p));
    check('...y la regla general: quien entrega sigue entregando',
        /Whoever is giving keeps giving, whoever is receiving keeps receiving/.test(p));
    check('el prompt cabe en el tope de Kling', p.length <= 2500, `${p.length}`);

    // La cláusula va con el núcleo PROTEGIDO: no puede ser lo que se sacrifica
    // cuando el prompt no cabe.
    const enorme = {
        ...conAccion, personCount: 8, occludedPeople: true, hasBrand: true, hasText: true, hasNature: true,
        subjects: Array.from({ length: 8 }, (_, i) => `person number ${i + 1} wearing distinctive clothing item ${i + 1}`),
        inventory: Array.from({ length: 6 }, (_, i) => `a large distinctive landmark element number ${i + 1} on the side`),
        motionHint: 'everyone keeps doing what they were doing while the environment moves around them continuously'
    };
    const p2 = buildScenePrompt({ style: 'documental', durationSec: 5, analysis: enorme });
    check('sobrevive incluso al peor recorte',
        /direction of every interaction/.test(p2) && p2.length <= 2500, `${p2.length}`);

    const neg = buildSceneNegativePrompt({ analysis: conAccion });
    check('el negativo excluye la inversión de roles',
        /no reversed interaction/.test(neg) && /no swapped giver and receiver/.test(neg)
        && /no object transfer in the wrong direction/.test(neg));

    // El veredicto: la inversión corroborada descalifica y sustituye; una
    // lectura suelta es ruido, como todas las señales del control.
    check('inversión en UN fotograma → ruido de lectura',
        buildPeopleReport([frame({ actionReversed: true }), frame(), frame()], PEOPLE).verdict === 'ok');
    check('inversión en DOS fotogramas → descalifica',
        buildPeopleReport(dos({ actionReversed: true }), PEOPLE).verdict === 'failed');
    check('...y ES invención: una acción invertida es una falsedad, no una nota',
        buildPeopleReport(dos({ actionReversed: true }), PEOPLE).invented === true);
    check('...con su motivo escrito',
        /invirtió la dirección/.test(buildPeopleReport(dos({ actionReversed: true }), PEOPLE).reason));
    // Tres estados: contestado y bien (true), contestado y mal (false), y SIN
    // dato del modelo (null) — que no se pinta como verde.
    check('el indicador viaja en tres estados',
        buildPeopleReport([frame({ actionReversed: false }), frame({ actionReversed: false }), frame({ actionReversed: false })], PEOPLE).actionsConsistent === true
        && buildPeopleReport(dos({ actionReversed: true }), PEOPLE).actionsConsistent === false
        && buildPeopleReport(three(), PEOPLE).actionsConsistent === null);
}

console.log('\n── En grupos grandes, todo desvío de recuento pide dos fotogramas (v4.797) ──');

{
    // La escena nocturna del reporte: 7 figuras entre escombros, el modelo
    // contó 9 en UN fotograma y la escena entera terminó sustituida.
    const g7 = (o = {}) => frame({ peopleLeft: 7, peopleRight: 7, ...o });
    const P7 = { hasPeople: true, personCount: 7 };
    check('7 personas: +2 en un solo fotograma es ruido',
        buildPeopleReport([g7({ peopleRight: 9 }), g7(), g7()], P7).verdict === 'ok');
    check('...y se declara', buildPeopleReport([g7({ peopleRight: 9 }), g7(), g7()], P7).countNoise === true);
    check('7 personas: crecimiento en DOS fotogramas sí descalifica',
        buildPeopleReport([g7({ peopleRight: 9 }), g7({ peopleRight: 8 }), g7()], P7).verdict === 'failed');
    // Con pocas personas nada se aflojó: contar 4 donde hay 2 no es ruido.
    const g2 = (o = {}) => frame({ peopleLeft: 2, peopleRight: 2, ...o });
    const P2 = { hasPeople: true, personCount: 2 };
    check('2 personas: +2 en un fotograma sigue descalificando en el acto',
        buildPeopleReport([g2({ peopleRight: 4 }), g2(), g2()], P2).verdict === 'failed');
}

console.log('\n── El mismo motor para Estándar y Emergencia (v4.797) ──');

{
    // No es una promesa: se comprueba que ningún preset declare su propio
    // motor ni su propio camino de animación.
    const presets = readFileSync(path.join(root, 'server/lib/reelPresets.js'), 'utf8');
    check('ningún preset declara motor ni pipeline propio',
        !/engine\s*:/.test(presets) && !/pipeline\s*:/.test(presets));
    const ctrl = readFileSync(path.join(root, 'server/controllers/reelController.js'), 'utf8');
    // Dos llamadas y son las mismas para todos los presets: la creación y el
    // relanzamiento de una escena. Si aparece una tercera, alguien está
    // armando un prompt por fuera del camino común.
    check('el constructor de prompt de escena es el mismo para todos los presets',
        (ctrl.match(/buildScenePrompt\(/g) || []).length === 2);
    check('el 2.5D sólo tiene sus dos vías conocidas: elección expresa y rescate',
        (ctrl.match(/resolveSceneWithStillMotion\(/g) || []).length === 2);
}

console.log('\n── Una escena SIN personas también cobra vida (v4.796) ──');

// Pedido literal del cliente: «no necesariamente tiene que tener personas; el
// entorno o el contexto de la imagen debe cobrar vida». La cláusula anterior
// era corta y genérica y un modelo la cumple con un temblor mínimo.
{
    const vacia = {
        hasPeople: false, personCount: 0, summary: 'escombros de un edificio',
        motionHint: 'dust drifts through the shaft of light over the rubble while the torn blue tarp lifts and settles'
    };
    const p = buildScenePrompt({ style: 'documental', durationSec: 5, analysis: vacia });

    check('el prompt afirma que la escena vive sin nadie dentro',
        /fully alive even with nobody in it/.test(p));
    check('...y que algo está SIEMPRE en movimiento (continuidad, no un temblor)',
        /always in motion/.test(p));
    check('...nombrando lo que de verdad se mueve en una foto así',
        /dust/.test(p) && /smoke|haze/.test(p) && /tarpaulin/.test(p) && /leaves/.test(p) && /water/.test(p));
    check('...sin inventar: sólo se mueve lo que la fotografía ya muestra',
        /Only the things already visible/.test(p) && /nothing new enters the frame/.test(p));
    check('el motionHint de ESA foto sobrevive: es lo único específico de ella',
        /torn blue tarp/.test(p));
    check('y el prompt sigue cabiendo en el tope de Kling',
        p.length <= 2500, `${p.length}/2500`);

    // El censo cero sigue viajando: que no haya gente NO es excusa para poblar.
    check('el censo de CERO personas sigue en el prompt',
        /Exactly 0 people|no people|nobody/i.test(p));
}

// La instrucción del director tiene que pedir el entorno SIEMPRE, no sólo
// cuando faltan personas: es lo que hace que cada foto reciba su propia
// animación en vez de una descripción genérica.
{
    const dir = readFileSync(path.join(root, 'server/lib/reelDirector.js'), 'utf8');
    check('el director pide qué se mueve del entorno HAYA O NO personas',
        /HAYA O NO personas/.test(dir));
    check('...nombrando categorías concretas para mirarlas en la foto',
        /polvo suspendido/.test(dir) && /humo/.test(dir) && /lona/.test(dir));
    check('...y exige movimiento CONTINUO, no un gesto aislado',
        /MOVIMIENTO CONTINUO/.test(dir));
    check('la cámara sigue declarada fija, sin desplazamientos ni acercamientos',
        /cámara está SIEMPRE fija/.test(dir) && /Nada de desplazamientos, acercamientos ni recorridos/.test(dir));
}

console.log('\n── Quién NO estaba vs cómo está DIBUJADO (v4.794) ──');

// `verdict` junta seis comprobaciones, y v4.792 lo tomó ENTERO para decidir si
// una escena se sustituye por la fotografía en movimiento. El resultado: tres
// de cuatro escenas sustituidas por «los rostros no se conservan (2/10)» — una
// nota de un modelo mirando caras diminutas dentro de una composición reducida
// a 640 px, que es la misma limitación de medición ya corregida para el
// logotipo (v4.715) y para el texto (v4.790).
check('un rostro inconsistente SIGUE siendo un defecto...',
    buildPeopleReport(three({ faceConsistency: 2 }), PEOPLE).verdict === 'failed');
check('...pero NO es una persona inventada: el clip animado se conserva',
    buildPeopleReport(three({ faceConsistency: 2 }), PEOPLE).invented === false);

// Lo que sí responde «quién está en el cuadro» descalifica como siempre.
check('un sujeto nuevo corroborado SÍ es invención',
    buildPeopleReport(dos({ newSubjects: true }), PEOPLE).invented === true);
check('la oclusión rota corroborada SÍ: revela a alguien que la foto tapa',
    buildPeopleReport(dos({ occlusionBroken: true }), PEOPLE).invented === true);
check('un recuento corroborado que crece SÍ',
    buildPeopleReport([frame(), frame({ peopleRight: 5 }), frame({ peopleRight: 5 })], PEOPLE).invented === true);
check('de cero a uno SÍ, sin corroboración',
    buildPeopleReport([emptyFrame(), emptyFrame(), emptyFrame({ peopleRight: 1 })], EMPTY).invented === true);
check('una escena vacía que se puebla en un solo fotograma también',
    buildPeopleReport([emptyFrame({ newSubjects: true }), emptyFrame(), emptyFrame()], EMPTY).invented === true);
check('un ±1 de ruido no es invención',
    buildPeopleReport([frame(), frame(), frame({ peopleRight: 5 })], PEOPLE).invented === false);
check('una escena limpia tampoco',
    buildPeopleReport(three(), PEOPLE).invented === false);

// El controlador tiene que decidir por `invented`, no por el veredicto entero.
{
    const ctrl = readFileSync(path.join(root, 'server/controllers/reelController.js'), 'utf8');
    check('la sustitución se decide por `invented`, no por `people.verdict`',
        /esInvencionHumana = \(sc\) => sc\.fidelity\?\.people\?\.invented === true/.test(ctrl));
}

console.log('\n── Texto: la proporción de palabras no descalifica sola (v4.790) ──');

// Es el mismo defecto del recuento, en otra puerta. La proporción sale de dos
// TRANSCRIPCIONES que el modelo hace sobre una composición reducida a 640 px de
// alto: cada palabra que no alcanza a leer baja la nota sin que el vídeo haya
// tocado nada. Y se tomaba el peor de tres fotogramas, así que en una campaña
// de emergencia —donde casi toda foto lleva un cartel o un chaleco— se
// descalificaban casi todas las escenas y terminaban sustituidas por la
// fotografía en movimiento.
const t = (ratio, words = 8) => ({ ratio, words });

check('un fotograma con transcripción floja es RUIDO, no texto roto',
    judgeTextFidelity([t(0.4), t(1), t(0.9)]).failed === false);
check('...y se dice que lo hubo, no se esconde',
    judgeTextFidelity([t(0.4), t(1), t(0.9)]).noise === true);
check('dos fotogramas por debajo del umbral sí descalifican',
    judgeTextFidelity([t(0.4), t(0.45), t(0.9)]).failed === true);
check('un desplome no se explica por una lectura incompleta: descalifica solo',
    judgeTextFidelity([t(0.1), t(1), t(1)]).failed === true);

// Sobre tres palabras, perder una es el 33 %: una proporción así no significa
// nada. Mismo criterio que la multitud en el recuento de personas.
check('con muy pocas palabras el texto NO decide',
    judgeTextFidelity([t(0.33, 3), t(0.33, 3)]).failed === false);
check('...y se declara que no era fiable',
    judgeTextFidelity([t(0.33, 3), t(0.33, 3)]).reliable === false);
check('con vocabulario suficiente sí decide',
    judgeTextFidelity([t(0.3, 12), t(0.3, 12)]).failed === true);

check('texto conservado → ni falla ni avisa',
    judgeTextFidelity([t(1), t(0.95), t(0.9)]).failed === false
    && judgeTextFidelity([t(1), t(0.95), t(0.9)]).noise === false);
check('sin texto en la foto no se afirma nada',
    judgeTextFidelity([]).worst === null && judgeTextFidelity([]).failed === false);
check('una entrada corrupta no rompe el criterio',
    judgeTextFidelity([null, undefined, { words: 5 }, t(1)]).failed === false);


console.log('\n── Intensidad: se acota sola, nunca sube ──');

const dense = { hasPeople: true, personCount: 8, peopleDensity: 'dense' };
const occluded = { hasPeople: true, personCount: 4, occludedPeople: true };
const group = { hasPeople: true, personCount: 3, peopleDensity: 'sparse' };
const solo = { hasPeople: true, personCount: 1, peopleDensity: 'sparse' };

// La oclusión acota a «Natural», no a «sutil» (cambiado en v4.716: en una foto
// de grupo institucional siempre hay alguien tapado, así que bajar a «sutil»
// congelaba todas las escenas). Lo que el motor no debe completar se pide con
// la cláusula de oclusión del prompt, que es directa y en positivo.
check('caras tapadas → «natural», no «sutil»',
    resolveSceneIntensity({ analysis: occluded, requested: 'expresivo' }).intensity === 'natural');
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
// ── CAMBIO DE SIGNO DELIBERADO (v4.785) ──
//
// Esta afirmación decía «sin personas no se manda», y ese comportamiento es
// exactamente el defecto que se reportó con capturas: una foto de escombros
// SIN personas producía un clip con tres rescatistas inventados, porque toda
// la protección exigía `hasPeople`. El censo pasó a ser universal — «que las
// 0 sigan siendo 0» también es un censo — así que el negativo se manda
// siempre. Lo único que lo apaga es la decisión explícita del usuario.
check('sin personas TAMBIÉN se manda (censo universal, v4.785)',
    buildSceneNegativePrompt({ analysis: { hasPeople: false } }) !== null);

// ── El bloque anti-paneo va SIEMPRE (v4.787) ──
//
// Estas tres afirmaciones comprobaban que el negativo se puede dejar en `null`.
// Ya no puede: siempre hay algo que excluir, porque el fallo del módulo no es
// sólo inventar gente — es entregar la fotografía con la cámara paseando por
// encima, y eso pasa haya o no personas. Lo que se apaga sigue siendo el bloque
// de PERSONAS; el anti-paneo no, porque apagarlo sería aceptar justo lo que el
// módulo no entrega.
check('lleva los términos anti-paneo', MOTION_NEGATIVE_TERMS.every(t => neg.includes(t)));
check('nunca es null: siempre hay algo que excluir',
    buildSceneNegativePrompt({ analysis: { hasPeople: false }, strictPeople: false }) !== null);

const soloPaneo = buildSceneNegativePrompt({ analysis: peopleAnalysis, strictPeople: false });
check('apagado a mano quita los términos de personas y deja el anti-paneo',
    !PEOPLE_NEGATIVE_TERMS.some(t => soloPaneo.includes(t))
    && MOTION_NEGATIVE_TERMS.every(t => soloPaneo.includes(t)));

process.env.REEL_PEOPLE_NEGATIVE_PROMPT = 'off';
const porEntorno = buildSceneNegativePrompt({ analysis: peopleAnalysis });
check('se puede apagar por entorno, sin desplegar — y el anti-paneo sigue',
    !PEOPLE_NEGATIVE_TERMS.some(t => porEntorno.includes(t))
    && MOTION_NEGATIVE_TERMS.every(t => porEntorno.includes(t)));
delete process.env.REEL_PEOPLE_NEGATIVE_PROMPT;
check('los dos bloques juntos siguen cabiendo en 2500', neg.length <= PROMPT_LIMIT, `${neg.length}`);


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
// Marca y oclusión acotan las dos a «Natural»: la más estricta gana, y ninguna
// de las dos justifica por sí sola el nivel más quieto.
check('marca + caras tapadas gana la más estricta',
    resolveSceneIntensity({ analysis: { hasPeople: true, personCount: 2, hasBrand: true, occludedPeople: true }, requested: 'expresivo' }).intensity === 'natural');
check('acotar por marca dice por qué',
    /logotipo/i.test(resolveSceneIntensity({ analysis: { hasPeople: true, personCount: 2, hasBrand: true }, requested: 'expresivo' }).reason || ''));

// Los umbrales del control de marca son deliberadamente laxos porque el recorte
// se toma en coordenadas FIJAS y la persona se mueve: con modelo de visión
// decide el modelo, y estos sólo deciden cuando no lo hay.
check('los umbrales de marca están declarados',
    typeof BRAND_MIN_STRUCTURE === 'number' && typeof BRAND_MIN_TEMPORAL === 'number');


console.log('\n── Naturalidad: continuidad y ritmo de fotogramas ──');

// La oclusión ya NO baja a «sutil» (v4.716). En una foto de grupo institucional
// casi siempre hay alguien parcialmente detrás de otro, así que esa condición se
// cumplía SIEMPRE y todas las escenas salían en el nivel más quieto: es la causa
// de que los clips se vieran congelados.
check('alguien tapado ya no fuerza «sutil»',
    resolveSceneIntensity({ analysis: { hasPeople: true, personCount: 5, occludedPeople: true }, requested: 'natural' }).intensity === 'natural');
// «sutil» queda para la multitud de verdad, donde dos personas pueden fundirse.
check('la multitud apretada sí baja a «sutil»',
    resolveSceneIntensity({ analysis: { hasPeople: true, personCount: 13, peopleDensity: 'dense' }, requested: 'natural' }).intensity === 'sutil');

// Lo que separa un vídeo de una secuencia de poses es la CONTINUIDAD, no la
// amplitud: un movimiento pequeño pero a ratos se lee como fotogramas sueltos.
for (const [id, level] of Object.entries(MOTION_INTENSITY)) {
    check(`«${id}» pide movimiento continuo`,
        /never stops|without pause|overlap|flows into the next/i.test(level.clause), level.clause.slice(0, 60));
}
const anyPrompt = buildScenePrompt({
    style: 'documental', durationSec: 5, intensity: 'natural',
    analysis: { hasPeople: true, personCount: 3 }
});
check('el prompt afirma continuidad de movimiento',
    /continuous film|flows into the next/i.test(anyPrompt));

// Forzar 30 fps sobre clips de 24 DUPLICA fotogramas en patrón irregular, y eso
// se percibe como saltos. Si los clips coinciden, se adopta su ritmo.
const withFps = (fps) => ({ quality: { measured: { fps } } });
check('tres clips a 24 fps → el montaje va a 24',
    resolveEditFps([withFps(24), withFps(24), withFps(24)]) === 24);
check('ritmos distintos → se toma el mayor, nunca se tiran fotogramas',
    resolveEditFps([withFps(24), withFps(30), withFps(25)]) === 30);
check('sin medida no se adivina: queda el valor por defecto',
    resolveEditFps([{}, {}, {}]) === 30);
check('un fps imposible se descarta',
    resolveEditFps([withFps(0.5), withFps(0.5), withFps(0.5)]) === 30);

console.log(`\n${pass} correctas, ${fail} fallidas\n`);
process.exit(fail ? 1 : 0);
