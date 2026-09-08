// ════════════════════════════════════════════════════════════════════════════
// Solicitud → Reel para redes — las pruebas (v4.1006)
//
//   npm run test:submissions:reel
//
// SIN base, SIN credenciales y SIN red. Lo que se prueba es el CRITERIO —qué
// fotos se eligen, qué modo de contenido le toca al material, qué afirma el
// storyboard y a qué estado se puede pasar— separado de la orquestación, por el
// mismo motivo que `seoRules.js` vive aparte de `seoAudit.js`.
//
// Y lo que NO es criterio se comprueba LEYENDO LOS ARCHIVOS: que haya un solo
// motor de Reels, que la automatización no publique, que el esquema enumere sus
// columnas. Esas invariantes no las ve ninguna prueba de criterio —el código es
// válido, los tipos están bien y el módulo simplemente hace otra cosa—.
// ════════════════════════════════════════════════════════════════════════════

import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import {
    REEL_STATES, REEL_STATE_IDS, REEL_INITIAL_STATE, isReelWorking, canTransitionReel,
    nextReelStates, reelNeedsReason,
    REEL_STAGES, REEL_STAGE_IDS, deriveReelWorkflowStatus, nextReelStage, reelStageToRetry,
    classifyAssets, checkReelReady, CONTENT_MODES,
    selectStoryImages, applyManualSelection, targetImageCount,
    MIN_REEL_IMAGES, MAX_REEL_IMAGES, STORY_SLOTS,
    buildStoryboardBrief, parseStoryboard, checkStoryboardFacts,
    SUBMISSION_FACT_CLAUSE, reelFactGuard, estimateReelCredits, nextVersionNumber,
} from '../server/lib/submissionReelSpec.js';
import { resolveFactGuard, systemWithFacts } from '../server/lib/reelFacts.js';
import { REEL_PRESETS, resolvePreset, presetCatalog, narrativeRolesFor, targetTotalSecFor } from '../server/lib/reelPresets.js';
import { EMERGENCY_FACT_CLAUSE } from '../server/lib/emergencySpec.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const leer = (p) => readFileSync(path.join(root, p), 'utf8');
/** El CÓDIGO, sin comentarios. La trampa de v4.1005: un comentario que explica
 *  una comprobación puede hacerla pasar (o fallar) por sí solo. */
const codigo = (p) => leer(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

let ok = 0, fail = 0;
const check = (nombre, cond, detalle = '') => {
    if (cond) { ok++; console.log(`  OK    ${nombre}`); }
    else { fail++; console.log(`  FALLA ${nombre}${detalle ? ` — ${detalle}` : ''}`); }
};

// ───────────────────────────────────────────────────────────────────────────
console.log('\n▸ Estados y transiciones');
{
    check('el Reel nace en «en cola» y ése es un estado de trabajo',
        REEL_INITIAL_STATE === 'recibida' && isReelWorking('recibida'));
    check('«borrador listo» NO es un estado de trabajo: espera a una persona',
        !isReelWorking('borrador_listo'));

    // ⚠️ LA GARANTÍA DE QUE LA AUTOMATIZACIÓN NO PUBLICA. Se recorre el grafo
    // ENTERO desde cada estado, no el par feliz: el día que alguien agregue un
    // atajo desde «en revisión» a «publicado», esta prueba falla.
    const alcanzables = (desde) => {
        const vistos = new Set([desde]);
        const cola = [desde];
        while (cola.length) {
            for (const s of nextReelStates(cola.pop()).map(x => x.id)) {
                if (!vistos.has(s)) { vistos.add(s); cola.push(s); }
            }
        }
        return vistos;
    };
    let sinAprobar = [];
    for (const id of REEL_STATE_IDS) {
        if (id === 'aprobado' || id === 'publicado') continue;
        // Todo camino a «publicado» tiene que pasar por «aprobado»: si al
        // quitar «aprobado» del grafo «publicado» sigue siendo alcanzable, hay
        // un atajo.
        const directos = nextReelStates(id).map(x => x.id);
        if (directos.includes('publicado')) sinAprobar.push(id);
    }
    check('ningún estado llega a «publicado» sin pasar por «aprobado»',
        sinAprobar.length === 0, `atajos desde: ${sinAprobar.join(', ')}`);
    check('desde «aprobado» sí se puede publicar', canTransitionReel('aprobado', 'publicado'));
    check('«publicado» no retrocede a mano', nextReelStates('publicado').length === 0);
    check('descartar EXIGE motivo', reelNeedsReason('descartado') && !reelNeedsReason('aprobado'));
    check('desde «en cola» una persona no puede mover nada', nextReelStates('recibida').length === 0);
    check('todos los estados alcanzables desde el error vuelven a la cola',
        alcanzables('error').has('recibida'));
}

// ───────────────────────────────────────────────────────────────────────────
console.log('\n▸ Las etapas y el estado derivado');
{
    check('no hay etapa «guion»: el guion hablado lo escribe reelNarration',
        !REEL_STAGE_IDS.includes('guion'));
    check('las cuatro etapas están y en su orden',
        REEL_STAGE_IDS.join(',') === 'material,seleccion,storyboard,proyecto');

    const vacio = deriveReelWorkflowStatus({});
    check('sin etapas hechas, la siguiente es «material»', vacio.nextStage === 'material' && vacio.status === 'analizando');

    const aMedias = { material: { status: 'ok' }, seleccion: { status: 'ok' } };
    check('con dos etapas hechas se pide el storyboard', deriveReelWorkflowStatus(aMedias).nextStage === 'storyboard');

    const todas = Object.fromEntries(REEL_STAGE_IDS.map(id => [id, { status: 'ok' }]));
    check('con todas hechas se pasa a SEGUIR al proyecto, no a «listo»',
        deriveReelWorkflowStatus(todas).status === 'seguimiento');

    const rota = { material: { status: 'ok' }, seleccion: { status: 'error', error: 'sin fotos' } };
    check('una etapa OBLIGATORIA fallida deja el Reel en error',
        deriveReelWorkflowStatus(rota).status === 'error');
    check('reintentar elige la etapa que falló, no la primera',
        reelStageToRetry(rota) === 'seleccion');
    check('reintentar respeta la etapa que se pide a mano',
        reelStageToRetry(rota, 'material') === 'material');
    check('una etapa inventada NO se acepta: cae a la que falló',
        reelStageToRetry(rota, 'inventada') === 'seleccion');
    check('sin nada hecho, `nextReelStage` devuelve la primera', nextReelStage({})?.id === 'material');
}

// ───────────────────────────────────────────────────────────────────────────
console.log('\n▸ El modo de contenido');
{
    const img = (n) => Array.from({ length: n }, (_, i) => ({ kind: 'image', fileId: `i${i}` }));
    const vid = (n) => Array.from({ length: n }, (_, i) => ({ kind: 'video', fileId: `v${i}` }));

    check('con más imágenes que videos → Reel de imágenes',
        classifyAssets([...img(5), ...vid(1)]).contentMode === 'image_reel');
    check('con la misma cantidad → Reel de imágenes (la regla es >=)',
        classifyAssets([...img(3), ...vid(3)]).contentMode === 'image_reel');
    check('con más videos que imágenes → modo video, todavía NO disponible',
        classifyAssets([...img(1), ...vid(4)]).contentMode === 'video_reel');
    check('el modo video está DECLARADO y no disponible: la estructura de la fase 2',
        CONTENT_MODES.video_reel && CONTENT_MODES.video_reel.available === false);
    check('un material con más videos se REPORTA con su motivo, no se intenta',
        !checkReelReady(classifyAssets([...img(1), ...vid(4)])).ok);

    const conRotos = classifyAssets([...img(4), { kind: 'image', fileId: 'x', unreadable: true }]);
    check('un archivo ilegible no cuenta como imagen utilizable', conRotos.images === 4 && conRotos.invalid === 1);
    check('los ilegibles se AVISAN, no se callan',
        checkReelReady(conRotos).warnings.some(w => w.includes('no se pudieron leer')));
    check('los tipos que no son foto ni video se clasifican igual',
        classifyAssets([{ kind: 'document', fileId: 'd' }, { kind: 'raro', fileId: 'r' }]).counts.other === 1);

    const pocas = checkReelReady(classifyAssets(img(2)));
    check('con menos del mínimo se bloquea diciendo cuántas hacen falta',
        !pocas.ok && pocas.errors[0].includes(String(MIN_REEL_IMAGES)));
}

// ───────────────────────────────────────────────────────────────────────────
console.log('\n▸ La selección inteligente de fotografías');
{
    const foto = (id, extra = {}) => ({
        fileId: id, kind: 'image', score: 60, excluded: false,
        analysis: { measured: { hash: id, duplicateOf: null }, vision: { caption: `foto ${id}` } },
        ...extra,
    });

    const ocho = Array.from({ length: 8 }, (_, i) => foto(`f${i}`, { score: 90 - i }));
    const r = selectStoryImages(ocho);
    check('nunca elige más de cinco', r.selection.length === MAX_REEL_IMAGES);
    check('cada foto elegida ocupa una posición narrativa distinta',
        new Set(r.selection.map(s => s.slot)).size === r.selection.length);
    check('lo que no entró se REPORTA con su motivo, no se descarta en silencio',
        r.discarded.length === 3 && r.discarded.every(d => d.reason));
    check('la estructura de cinco es la declarada',
        r.selection.map(s => s.slot).join(',') === STORY_SLOTS[5].join(','));

    const conDuplicados = [
        foto('a', { score: 95 }),
        foto('b', { score: 94, analysis: { measured: { hash: 'a', duplicateOf: null }, vision: {} } }),
        foto('c', { score: 93 }), foto('d', { score: 92 }), foto('e', { score: 91 }), foto('f', { score: 90 }),
    ];
    const rd = selectStoryImages(conDuplicados);
    check('dos fotos con la misma huella NO entran las dos',
        !(rd.selection.some(s => s.fileId === 'a') && rd.selection.some(s => s.fileId === 'b')));
    check('el duplicado se dice como tal',
        rd.discarded.some(d => d.reason.includes('igual a otra')));

    const marcadoDuplicado = [
        foto('a'), foto('b', { analysis: { measured: { duplicateOf: 'a' }, vision: {} } }),
        foto('c'), foto('d'), foto('e'),
    ];
    check('un duplicado marcado por el artículo tampoco entra',
        !selectStoryImages(marcadoDuplicado).selection.some(s => s.fileId === 'b'));

    // ⚠️ Desde v4.1009 `excluded` significa SÓLO «lo dejó fuera una persona»;
    // los motivos automáticos viven en `coverNote`. El fixture usa esa forma —
    // uno escrito con la anterior daría por buena una comprobación que ya no
    // ejercita el camino real (la lección de v4.1001).
    const conExcluidas = [
        foto('a'), foto('b'), foto('c'),
        foto('mala', { excluded: true, excludedReason: 'lo dejó fuera una persona' }),
    ];
    const re = selectStoryImages(conExcluidas);
    check('una foto que una persona dejó fuera NO entra al Reel',
        !re.selection.some(s => s.fileId === 'mala'));
    check('y su motivo se conserva tal cual',
        re.discarded.some(d => d.reason === 'lo dejó fuera una persona'));

    const porClase = [
        foto('a'), foto('b'), foto('c'),
        foto('captura', { coverNote: 'es una captura de pantalla' }),
        foto('doc', { coverNote: 'es un documento' }),
    ];
    const rc = selectStoryImages(porClase);
    check('una captura de pantalla NO se anima como escena',
        !rc.selection.some(s => s.fileId === 'captura'));
    check('un documento tampoco',
        !rc.selection.some(s => s.fileId === 'doc'));
    check('y cada uno se descarta con su motivo, no en silencio',
        rc.discarded.some(d => d.reason === 'es una captura de pantalla')
        && rc.discarded.some(d => d.reason === 'es un documento'));

    // La otra mitad, y es la que este módulo NO puede endurecer: oscura y
    // desenfocada son cuestión de GRADO. El puntaje ya las penaliza; sacarlas
    // por nota dejaría fuera media selección de un club que fotografía de
    // noche — el patrón que este archivo documenta una y otra vez.
    const porGrado = [
        foto('a', { score: 90 }), foto('b', { score: 88 }),
        foto('oscura', { score: 40, coverNote: 'es demasiado oscura' }),
        foto('borrosa', { score: 38, coverNote: 'está desenfocada' }),
    ];
    const rg = selectStoryImages(porGrado);
    check('una foto oscura compite: no se descarta por su nota de portada',
        rg.selection.some(s => s.fileId === 'oscura'));
    check('una desenfocada tampoco se descarta por su nota de portada',
        rg.selection.some(s => s.fileId === 'borrosa'));

    const tres = selectStoryImages([foto('a'), foto('b'), foto('c')]);
    check('con tres fotos se usan las tres y la estructura se acorta',
        tres.selection.length === 3 && tres.selection.map(s => s.slot).join(',') === STORY_SLOTS[3].join(','));
    check('con dos fotos no alcanza y se dice', !selectStoryImages([foto('a'), foto('b')]).enough);
    check('nunca se inventa una fotografía', targetImageCount(0) === 0 && targetImageCount(2) === 2);

    // La afinidad DESEMPATA, no sustituye a la calidad: una foto floja no gana
    // una posición por encajar en su rol.
    const conRoles = [
        foto('grupo', { score: 50, role: 'grupo', analysis: { measured: { hash: 'g' }, vision: { people: 6 } } }),
        foto('buena', { score: 95 }), foto('b2', { score: 90 }), foto('b3', { score: 85 }),
    ];
    const rr = selectStoryImages(conRoles);
    check('una foto de mucha peor calidad no desplaza a la mejor en la primera posición',
        rr.selection[0].fileId === 'buena');
}

// ───────────────────────────────────────────────────────────────────────────
console.log('\n▸ La selección MANUAL manda');
{
    const media = ['a', 'b', 'c', 'd', 'e', 'f'].map(id => ({ fileId: id, kind: 'image', score: 70 }));
    const r = applyManualSelection(media, ['c', 'a', 'e']);
    check('respeta el ORDEN que eligió la persona',
        r.ok && r.selection.map(s => s.fileId).join(',') === 'c,a,e');
    check('les asigna la estructura narrativa de esa cantidad',
        r.selection.map(s => s.slot).join(',') === STORY_SLOTS[3].join(','));

    const conAjeno = applyManualSelection(media, ['a', 'b', 'c', 'ajeno']);
    check('un id que no es de esta solicitud NO se puede colar',
        !conAjeno.selection.some(s => s.fileId === 'ajeno'));
    check('y se dice por qué se rechazó',
        conAjeno.rejected.some(x => x.fileId === 'ajeno' && x.reason.includes('no es una fotografía')));

    const repetida = applyManualSelection(media, ['a', 'a', 'b', 'c']);
    check('una foto repetida en la selección entra una sola vez',
        repetida.selection.filter(s => s.fileId === 'a').length === 1);

    const demasiadas = applyManualSelection(media, ['a', 'b', 'c', 'd', 'e', 'f']);
    check('nunca se aceptan más de cinco', demasiadas.selection.length === MAX_REEL_IMAGES);
    check('la sexta se rechaza diciendo el tope',
        demasiadas.rejected.some(x => x.reason.includes(String(MAX_REEL_IMAGES))));

    const pocas = applyManualSelection(media, ['a', 'b']);
    check('con menos del mínimo no se guarda y se dice cuántas hay',
        !pocas.ok && pocas.error.includes('2'));
}

// ───────────────────────────────────────────────────────────────────────────
console.log('\n▸ El storyboard: el modelo escribe, el código decide');
{
    const submission = {
        title: 'Entrega de mercados', description: 'El club entregó 120 mercados.',
        club: 'Rotary Sevilla', location: 'Sevilla', city: 'Valle',
        // Sin fecha a propósito: es lo que se comprueba abajo.
    };
    const brief = buildStoryboardBrief({
        submission, campaign: { name: 'Emergencia' }, siteName: 'Distrito 4281',
        selection: [{ fileId: 'a', slotLabel: 'Contexto' }, { fileId: 'b', slotLabel: 'Personas' }, { fileId: 'c', slotLabel: 'Cierre' }],
        mediaById: new Map([['a', { analysis: { vision: { caption: 'una calle' } } }]]),
        durationSec: 20,
    });
    check('el brief lleva el contexto real de la solicitud', brief.includes('Entrega de mercados') && brief.includes('Rotary Sevilla'));
    check('lo que NO se sabe se DECLARA como no suministrado', /\(no suministrad[oa]\)/.test(brief));
    check('el brief nombra cada fotografía con su función', brief.includes('[Contexto]') && brief.includes('[Cierre]'));
    check('el brief dice cuánto dura la pieza', brief.includes('20 segundos'));

    const conArticulo = buildStoryboardBrief({
        submission, article: { title: 'Un titular', excerpt: 'Una entrada' },
        selection: [{ fileId: 'a', slotLabel: 'Contexto' }], mediaById: new Map(),
    });
    check('el artículo entra como CONTEXTO y se dice que no se copie',
        conArticulo.includes('NO lo copies'));

    const bueno = parseStoryboard(JSON.stringify({
        hook: 'Un hook', closing: 'Un cierre', cta: 'Sumate',
        scenes: [{ line: 'uno' }, { line: 'dos' }, { line: 'tres' }],
    }), 3);
    check('un storyboard con una línea por escena se acepta', bueno.ok && bueno.scenes.length === 3);
    check('el hook y el cierre se conservan', bueno.hook === 'Un hook' && bueno.closing === 'Un cierre');

    const corto = parseStoryboard(JSON.stringify({ scenes: [{ line: 'uno' }] }), 3);
    check('un storyboard con menos escenas que fotos se RECHAZA con su motivo',
        !corto.ok && corto.error.includes('3'));
    check('una respuesta que no es JSON se rechaza', !parseStoryboard('lo siento, no puedo', 3).ok);
    check('las líneas vacías no cuentan como escena',
        !parseStoryboard(JSON.stringify({ scenes: [{ line: '' }, { line: 'b' }, { line: 'c' }] }), 3).ok);
    check('acepta el JSON envuelto en un bloque de código',
        parseStoryboard('```json\n{"scenes":[{"line":"a"},{"line":"b"},{"line":"c"}]}\n```', 3).ok);

    // ── La veracidad: el MISMO validador del artículo y de la emergencia ──
    const universe = {
        magnitude: 'El club entregó 120 mercados.', description: 'Entrega de mercados en Sevilla',
        communities: 'Rotary Sevilla', eventDate: '', location: 'Sevilla Valle',
        customDisaster: '', customNeed: '', contactUrl: '',
    };
    const limpio = checkStoryboardFacts({ hook: 'El club entregó 120 mercados en Sevilla', scenes: [] }, universe);
    check('una cifra que el club SÍ escribió no es invención', limpio.ok);

    const inventado = checkStoryboardFacts({ hook: 'Ayudamos a 5000 familias', scenes: [] }, universe);
    check('una cifra que nadie suministró se RECHAZA', !inventado.ok);
    check('y el rechazo nombra el campo y el número',
        inventado.issues[0].includes('hook') && inventado.issues[0].includes('5000'));

    const vago = checkStoryboardFacts({ scenes: [{ line: 'Miles de personas recibieron ayuda' }] }, universe);
    check('un cuantificador vago se rechaza', !vago.ok);

    const atribuido = checkStoryboardFacts({ cta: 'Según reportes, la zona sigue afectada', scenes: [] }, universe);
    check('una fuente inventada se rechaza', !atribuido.ok);
}

// ───────────────────────────────────────────────────────────────────────────
console.log('\n▸ La guardia de datos NO es la de emergencia');
{
    check('la cláusula de una solicitud es propia y no habla de un desastre',
        SUBMISSION_FACT_CLAUSE !== EMERGENCY_FACT_CLAUSE
        && !/desastre|damnificad|emergencia real/i.test(SUBMISSION_FACT_CLAUSE));
    check('pero prohíbe exactamente lo mismo: cifras, fechas, lugares y fuentes',
        /cifras/i.test(SUBMISSION_FACT_CLAUSE) && /fechas/i.test(SUBMISSION_FACT_CLAUSE)
        && /nombres/i.test(SUBMISSION_FACT_CLAUSE) && /fuente/i.test(SUBMISSION_FACT_CLAUSE));

    const guard = reelFactGuard({ universe: { description: 'algo' }, brief: 'el brief' });
    check('la guardia lleva su cláusula, su brief y su universo',
        guard.clause === SUBMISSION_FACT_CLAUSE && guard.brief === 'el brief' && guard.universe);

    // ── `resolveFactGuard`: ADITIVO por construcción ──
    const sinNada = resolveFactGuard({});
    check('sin nada, no hay cláusula ni validación: el Reel estándar sigue igual',
        sinNada.clause === null && sinNada.brief === null && sinNada.universe === null);
    check('sin guardia, el prompt de sistema no se toca',
        systemWithFacts('BASE', sinNada) === 'BASE');

    const soloEmergencia = resolveFactGuard({ emergencyContext: { disaster: 'terremoto', location: 'Chocó' } });
    check('con contexto de emergencia se usa la cláusula de emergencia, como siempre',
        soloEmergencia.clause === EMERGENCY_FACT_CLAUSE && soloEmergencia.universe);

    const conFacts = resolveFactGuard({ emergencyContext: null, facts: guard });
    check('con `facts` manda la cláusula de quien conoce la fuente',
        conFacts.clause === SUBMISSION_FACT_CLAUSE);
    check('un `facts` sin universo NO activa ninguna validación',
        resolveFactGuard({ facts: { clause: 'x' } }).universe === null);
    check('la cláusula se pone ENCIMA del prompt base, no en su lugar',
        systemWithFacts('BASE', guard).startsWith('BASE') && systemWithFacts('BASE', guard).includes(SUBMISSION_FACT_CLAUSE));
}

// ───────────────────────────────────────────────────────────────────────────
console.log('\n▸ El preset: es el motor de siempre con otra configuración');
{
    const p = resolvePreset('solicitud');
    check('el preset existe', p.id === 'solicitud');
    check('admite de 3 a 5 fotografías', p.sceneCounts.join(',') === '3,4,5');
    check('es INTERNO: no se ofrece en el selector del Estudio de Contenido',
        p.internal === true && !presetCatalog().some(x => x.id === 'solicitud'));

    // ⚠️ La animación conservadora de los puntos 10-12: es lo que protege la
    // marca de un club en una foto que mandó desde el teléfono.
    check('la animación es conservadora: documental y sutil',
        p.motionStyle === 'documental' && p.motionIntensity === 'sutil');
    check('la expansión de lienzo es obligatoria: sin ella el montaje recorta al centro',
        p.requireExpansion === true);
    check('el control de datos es estricto', p.factGuard === 'strict');

    // La tarjeta de cierre sale ILEGIBLE en el entorno de despliegue (v4.794).
    check('no se enciende el texto en pantalla ni la tarjeta de cierre',
        p.onScreenText === false && p.closingCard === false);

    check('la estructura narrativa cambia con la cantidad de fotos, no se recorta',
        p.narrative[3].length === 3 && p.narrative[5].length === 5
        && p.narrative[3].join(',') !== p.narrative[5].slice(0, 3).join(','));
    check('la última escena siempre es el cierre institucional',
        [3, 4, 5].every(n => p.narrative[n][n - 1] === 'cierre_club'));

    const roles = narrativeRolesFor('solicitud', 5);
    check('los roles llegan con su etiqueta y su instrucción',
        roles.length === 5 && roles.every(r => r.label && r.brief));
    check('la duración objetivo crece con la cantidad de fotos',
        targetTotalSecFor('solicitud', 3) < targetTotalSecFor('solicitud', 5));
    check('la duración queda dentro de los 15-30 s que pide el pedido',
        [3, 4, 5].every(n => targetTotalSecFor('solicitud', n) >= 15 && targetTotalSecFor('solicitud', n) <= 30));

    check('el preset estándar NO se tocó: sigue siendo el default de tres fotos',
        REEL_PRESETS.estandar.isDefault === true && REEL_PRESETS.estandar.sceneCounts.join(',') === '3');
}

// ───────────────────────────────────────────────────────────────────────────
console.log('\n▸ UN SOLO MOTOR DE REELS (se lee el código, sin comentarios)');
{
    const ctrl = codigo('server/controllers/reelController.js');
    const motor = codigo('server/lib/submissionReelEngine.js');

    // ⚠️ LA INVARIANTE QUE SOSTIENE EL MÓDULO. Con dos caminos hacia el
    // proveedor, el día que se corrija el reparto de duraciones o el prompt de
    // escena una mitad se queda atrás, y el fallo es MUDO: las dos siguen
    // produciendo un Reel.
    const insertsRepo = ['server/controllers/reelController.js', 'server/lib/submissionReelEngine.js', 'server/controllers/submissionReelController.js']
        .map(f => (codigo(f).match(/INSERT INTO "ReelProject"/g) || []).length)
        .reduce((a, b) => a + b, 0);
    check('hay UN solo INSERT de un proyecto de Reel en toda la cadena', insertsRepo === 1, `hay ${insertsRepo}`);

    check('el motor del workflow NO crea escenas por su cuenta',
        !/INSERT INTO "ReelScene"/.test(motor));
    check('el motor pide el Reel a `startReelProject`, el mismo de la ruta HTTP',
        motor.includes('startReelProject') && ctrl.includes('export const startReelProject'));
    check('`createReel` es una envoltura HTTP sobre ese motor',
        /export const createReel = async \(req, res\) => \{\s*const r = await startReelProject/.test(ctrl));
    check('el motor del workflow no llama a ningún proveedor de video directamente',
        !/createKieVideoTask|createKieImageTask/.test(motor));
}

// ───────────────────────────────────────────────────────────────────────────
console.log('\n▸ La automatización NO publica');
{
    const motor = codigo('server/lib/submissionReelEngine.js');
    const ctrl = codigo('server/controllers/submissionReelController.js');
    const rutas = codigo('server/routes/contribution-campaigns.js');

    check('el motor sólo escribe `publishedAt` desde una transición humana',
        (motor.match(/publishedAt/g) || []).length <= 3
        && motor.includes("if (to === 'publicado') patch.publishedAt"));
    check('ninguna etapa del motor pone el estado en «publicado»',
        !/status: 'publicado'/.test(motor));
    // ⚠️ LA PUERTA. `test:contribution:module` excluye estas rutas de su conteo
    // porque se comprueban ACÁ: si esta comprobación desapareciera, quedarían
    // sin ninguna — que es exactamente cómo se abre una bandeja entera sin que
    // nadie lo note.
    const delReel = rutas.split('\n').filter(l => /^router\.(get|post|put|delete)\('\/:id\/submissions\/:submissionId\/reel/.test(l.trim()));
    check('las rutas del Reel existen y son las siete declaradas', delReel.length === 7, `hay ${delReel.length}`);
    check('TODAS pasan por requireCampaignAccess, el mismo gate del artículo',
        delReel.length > 0 && delReel.every(l => /requireCampaignAccess/.test(l)));
    check('las de escritura exigen siteWrite; la lectura, siteRead',
        delReel.every(l => /router\.get/.test(l) ? /siteRead/.test(l) : /siteWrite/.test(l)));

    check('la API no tiene ninguna ruta de publicación de Reels',
        !/reel\/publish/.test(rutas) && !/publishReel/.test(ctrl));
    check('el estado editorial se cambia por `transitionReel`, que valida el flujo',
        ctrl.includes('transitionReel'));
}

// ───────────────────────────────────────────────────────────────────────────
console.log('\n▸ El esquema y la idempotencia');
{
    const esquema = leer('server/lib/ensureSubmissionReelSchema.js');

    check('la tabla vive fuera de Prisma',
        !/model SubmissionReel/.test(leer('server/prisma/schema.prisma')));
    check('`ReelProject` NO gana ninguna columna nueva: el vínculo va al revés',
        !/ALTER TABLE "ReelProject"[\s\S]{0,80}submission/i.test(codigo('server/lib/ensureReelSchema.js')));

    // ⚠️ La idempotencia del punto 22 es un índice ÚNICO, no una lectura previa.
    check('hay un índice único por solicitud y versión',
        /CREATE UNIQUE INDEX[^;]*SubmissionReel_version_key[^;]*\("submissionId", "versionNumber"\)/.test(esquema));
    check('ese índice NO es parcial, así que el ON CONFLICT va a secas',
        !/SubmissionReel_version_key[^;]*WHERE/.test(esquema));
    // ⚠️ SE MIRA EL CUERPO DE `enqueueReel`, NO EL ARCHIVO. Hay DOS puntos que
    // insertan una fila —encolar y crear una versión— así que buscar la forma
    // en todo el archivo pasaría en verde con el ON CONFLICT quitado de uno de
    // los dos: una prueba vacua que además afirma lo contrario (v4.896). Lo
    // destapó la verificación a la inversa, no la lectura.
    const cuerpoDe = (src, nombre) => {
        const i = src.indexOf(nombre);
        return i < 0 ? '' : src.slice(i, src.indexOf('\n}', i));
    };
    const motorSrc = codigo('server/lib/submissionReelEngine.js');
    for (const fn of ['export async function enqueueReel', 'export async function newReelVersion']) {
        check(`\`${fn.split(' ').pop()}\` inserta con ON CONFLICT: la idempotencia es de la base`,
            /ON CONFLICT \("submissionId", "versionNumber"\) DO NOTHING/.test(cuerpoDe(motorSrc, fn)));
    }
    check('la versión vigente se marca con un índice PARCIAL',
        /SubmissionReel_current_key[^;]*WHERE "isCurrent"/.test(esquema));
    check('contra ese índice parcial NUNCA se usa ON CONFLICT (la trampa de v4.648)',
        !/ON CONFLICT \("submissionId"\)/.test(codigo('server/lib/submissionReelEngine.js')));

    // ⚠️ La trampa de v4.908: todo ADD COLUMN enumerado en el atajo.
    const columnas = [...esquema.matchAll(/ADD COLUMN IF NOT EXISTS "(\w+)"/g)].map(m => m[1]);
    const enumeradas = (esquema.match(/OWNED_COLUMNS = \{[\s\S]*?\};/) || [''])[0];
    check('todo ADD COLUMN está enumerado en el atajo del ensure',
        columnas.every(c => enumeradas.includes(c)), `faltan: ${columnas.filter(c => !enumeradas.includes(c)).join(', ')}`);

    // ⚠️ La trampa de v4.721.1: una comilla invertida dentro del SQL cierra el
    // template literal y el módulo entero deja de parsear.
    // Se corta el TEMPLATE LITERAL, no un rango de texto: en medio hay
    // comentarios de JavaScript que sí pueden llevar comillas invertidas.
    const inicioSql = esquema.indexOf('CREATE TABLE IF NOT EXISTS "SubmissionReel"');
    const sql = esquema.slice(inicioSql, esquema.indexOf('`', inicioSql));
    check('no hay comillas invertidas dentro del SQL (la trampa de v4.721.1)',
        sql.includes('"createdAt"') && !sql.includes('`'));

    // El reclamo va sobre `attempts`, que es un entero exacto (v4.800).
    check('el reclamo va sobre `attempts`, no sobre `updatedAt`',
        /AND attempts = \$2/.test(codigo('server/lib/submissionReelEngine.js')));
}

// ───────────────────────────────────────────────────────────────────────────
console.log('\n▸ Se REUTILIZA lo que ya existe, no se reimplementa');
{
    const motor = codigo('server/lib/submissionReelEngine.js');
    const spec = codigo('server/lib/submissionReelSpec.js');

    check('el universo de datos sale de `veracityContextFor`, el del artículo',
        motor.includes('veracityContextFor'));
    check('el validador es `validateEmergencyCopy`, el de siempre',
        spec.includes('validateEmergencyCopy'));
    check('no hay un segundo validador de cifras en este módulo',
        !/numbersIn|VAGUE_QUANTIFIERS/.test(spec));
    check('el análisis de las fotos sale del artículo, no de una segunda pasada de visión',
        motor.includes('mediaOf') && !/sharp/.test(motor));
    check('el motor no escribe un segundo generador de voz ni de música',
        !/synthesize|generateScript|generateMusic/.test(motor));
    check('las fotos se usan por su URL de la Biblioteca: no se copia ningún archivo',
        motor.includes('inLibrary') && !/CopyObject|uploadBuffer/.test(motor));
}

// ───────────────────────────────────────────────────────────────────────────
console.log('\n▸ Créditos y versiones');
{
    const c = estimateReelCredits({ sceneCount: 5 });
    check('el costo se estima por escena', c.scenes === 100 && c.total === 100);
    check('las adaptaciones de lienzo suman aparte',
        estimateReelCredits({ sceneCount: 3, expansions: 2 }).total === 68);
    check('sin escenas no hay costo', estimateReelCredits({}).total === 0);

    check('la primera versión es la 1', nextVersionNumber([]) === 1);
    check('la versión siguiente es la mayor más uno',
        nextVersionNumber([{ versionNumber: 1 }, { versionNumber: 3 }]) === 4);
}

// ───────────────────────────────────────────────────────────────────────────
console.log('\n▸ El espejo del navegador es MÍNIMO');
{
    const espejo = leer('src/lib/submissionReelSpec.ts');
    // Con el criterio copiado en el navegador, la pantalla y el servidor
    // podrían discrepar sobre qué fotos entran o cuánto cuesta.
    for (const prohibido of ['selectStoryImages', 'applyManualSelection', 'checkStoryboardFacts', 'estimateReelCredits', 'classifyAssets']) {
        check(`el espejo NO trae \`${prohibido}\``, !espejo.includes(prohibido));
    }
    check('los estados del espejo son los mismos que los del servidor',
        REEL_STATE_IDS.every(id => espejo.includes(`${id}:`)));
    check('las cuatro redes del pedido están declaradas',
        ['instagram', 'facebook', 'tiktok', 'youtube'].every(n => espejo.toLowerCase().includes(n)));
}

// ───────────────────────────────────────────────────────────────────────────
console.log('\n▸ El copy cubre las cuatro redes del pedido');
{
    const copy = leer('server/lib/reelCopy.js');
    for (const p of ['tiktok', 'instagram_reels', 'youtube_shorts', 'facebook_reels']) {
        check(`\`${p}\` está en el catálogo de plataformas`, copy.includes(`id: '${p}'`));
    }
}

// ───────────────────────────────────────────────────────────────────────────
console.log('\n▸ La estructura de la SEGUNDA FASE está declarada');
{
    check('`content_mode` admite los tres valores del pedido',
        ['image_reel', 'video_reel', 'mixed'].every(m => CONTENT_MODES[m]));
    check('los modos que no existen se declaran NO disponibles, no se ofrecen',
        CONTENT_MODES.video_reel.available === false && CONTENT_MODES.mixed.available === false);
    check('el motivo se dice con las palabras del pedido',
        CONTENT_MODES.video_reel.help.includes('próxima implementación'));
}

console.log(`\n${fail === 0 ? '✓' : '✗'} ${ok} pruebas pasan, ${fail} fallan\n`);
process.exit(fail === 0 ? 0 : 1);
