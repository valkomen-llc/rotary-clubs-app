#!/usr/bin/env node
/**
 * Presets de pieza y Campaña de Emergencia — Creador de Reels IA (v4.783)
 * =======================================================================
 *
 * Ejercita el CRITERIO de las dos capas nuevas, separado de la orquestación por
 * el mismo motivo que `seoRules.js` vive aparte de `seoAudit.js`:
 *
 *   · `reelPresets.js` — cuántas fotos admite cada preset, cuánto dura la
 *     pieza, qué función narrativa cumple cada escena y qué rellena el preset
 *     sin pisar lo que eligió el usuario.
 *   · `emergencySpec.js` — la normalización del contexto y, sobre todo, el
 *     CONTROL DE DATOS: qué se rechaza de lo que escribe el modelo. Es la capa
 *     que hace verdadera la promesa de «no se inventan cifras»; sin ella eso
 *     sería una afirmación que no se puede sostener.
 *   · `reelSceneText.js` — el reparto de las ventanas de los rótulos sobre la
 *     línea de tiempo. Es aritmética, y equivocarse pone el rótulo de una
 *     escena encima de otra.
 *   · Los DOS ESPEJOS — que `server/lib/reelPresets.js` y
 *     `src/lib/reelPresets.ts` devuelvan lo MISMO. Se comparan las salidas de
 *     las funciones, no sólo las constantes: es lo que sostiene que la pantalla
 *     y el servidor cuenten las mismas escenas.
 *
 * No necesita base de datos, credenciales ni red.
 *
 *   npm run test:reels:presets
 */

import {
    REEL_PRESETS, DEFAULT_PRESET, MIN_SCENE_COUNT, MAX_SCENE_COUNT,
    resolvePreset, resolveSceneCount, targetTotalSecFor, narrativeRolesFor,
    presetCatalog, applyPresetDefaults, presetAllowsSceneCount, narrativeRoleLabel
} from '../server/lib/reelPresets.js';
import {
    normalizeEmergencyContext, buildEmergencyBrief, validateEmergencyCopy,
    buildRetryInstruction, defaultCampaignTitle,
    disasterCatalog, needCatalog, ctaCatalog, DISASTER_TYPES
} from '../server/lib/emergencySpec.js';
import { sceneTextWindows, MAX_SCENE_TEXT_CHARS } from '../server/lib/reelSceneText.js';
import { distributeDurations } from '../server/lib/reelSpec.js';

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
console.log('\n▸ Presets: el estándar reproduce el comportamiento anterior');

check('el preset por defecto es `estandar`', DEFAULT_PRESET === 'estandar');
check('`estandar` admite SÓLO 3 fotos',
    JSON.stringify(REEL_PRESETS.estandar.sceneCounts) === '[3]');
check('`estandar` apunta a 15 s', targetTotalSecFor('estandar', 3) === 15);
check('`estandar` no impone estructura narrativa',
    narrativeRolesFor('estandar', 3).every(r => r.id === 'libre'));
check('un preset inventado cae al default',
    resolvePreset('no-existe').id === 'estandar');
check('`estandar` no lleva texto en pantalla ni cierre',
    !REEL_PRESETS.estandar.onScreenText && !REEL_PRESETS.estandar.closingCard);

// El preset estándar NO debe imponer nada: es lo que hace que un Reel creado
// como siempre se comporte como siempre.
{
    const r = applyPresetDefaults('estandar', { motionStyle: 'auto', transition: 'auto', musicStyle: 'auto' });
    check('`estandar` deja los ejes en `auto`',
        r.config.motionStyle === 'auto' && r.config.transition === 'auto' && r.config.musicStyle === 'auto',
        JSON.stringify(r.config));
}

// ───────────────────────────────────────────────────────────────────────────
console.log('\n▸ Presets: la Campaña de Emergencia');

check('admite 3, 4 y 5 fotos',
    JSON.stringify(REEL_PRESETS.emergencia.sceneCounts) === '[3,4,5]');
check('las duraciones caen en los rangos pedidos (3→~15, 4→18-22, 5→22-30)',
    targetTotalSecFor('emergencia', 3) === 15
    && targetTotalSecFor('emergencia', 4) >= 18 && targetTotalSecFor('emergencia', 4) <= 22
    && targetTotalSecFor('emergencia', 5) >= 22 && targetTotalSecFor('emergencia', 5) <= 30);

// La estructura NO es la misma lista recortada: con tres fotos la movilización
// y el llamado comparten escena, con cinco cada uno tiene la suya. Es la
// diferencia entre adaptar la historia y rellenar con escenas repetidas.
{
    const r3 = narrativeRolesFor('emergencia', 3).map(r => r.id);
    const r4 = narrativeRolesFor('emergencia', 4).map(r => r.id);
    const r5 = narrativeRolesFor('emergencia', 5).map(r => r.id);
    check('3 fotos → contexto, impacto, acción+CTA',
        JSON.stringify(r3) === JSON.stringify(['contexto', 'impacto_humano', 'accion_cta']));
    check('4 fotos → añade la respuesta rotaria como escena propia',
        r4.includes('respuesta') && r4.includes('cta') && r4.length === 4);
    check('5 fotos → añade las necesidades', r5.includes('necesidades') && r5.length === 5);
    check('ninguna estructura repite un rol (no hay relleno)',
        new Set(r3).size === 3 && new Set(r4).size === 4 && new Set(r5).size === 5);
    check('cada rol trae etiqueta y brief',
        narrativeRolesFor('emergencia', 5).every(r => r.label && r.brief));
}

check('la expansión de lienzo es obligatoria en emergencia',
    REEL_PRESETS.emergencia.requireExpansion === true);
check('lleva texto en pantalla y tarjeta de cierre',
    REEL_PRESETS.emergencia.onScreenText && REEL_PRESETS.emergencia.closingCard);

// La vía sin motor generativo es la decisión de fondo del preset: sobre una
// fotografía de un desastre real, un motor image-to-video REINTERPRETA los
// píxeles y puede añadir a alguien que no estuvo ahí.
check('el estilo por defecto es `fotografico` (sin motor generativo)',
    REEL_PRESETS.emergencia.motionStyle === 'fotografico');
{
    const r = applyPresetDefaults('emergencia', {});
    check('y se DICE en las notas, con su motivo',
        r.notes.some(n => /sin motor generativo/i.test(n) && /cero créditos/i.test(n)),
        JSON.stringify(r.notes));
}

// ───────────────────────────────────────────────────────────────────────────
console.log('\n▸ Presets: la elección del usuario manda sobre el preset');

{
    const r = applyPresetDefaults('emergencia', { motionStyle: 'documental', musicStyle: 'energico' });
    check('un estilo elegido NO lo pisa el preset', r.config.motionStyle === 'documental');
    check('una música elegida NO la pisa el preset', r.config.musicStyle === 'energico');
    check('lo que quedó en `auto` sí lo rellena el preset', r.config.transition === 'fade');
}

// ───────────────────────────────────────────────────────────────────────────
console.log('\n▸ Presets: la cantidad de escenas se corrige y se DICE');

{
    const ok = resolveSceneCount('emergencia', 5);
    check('5 fotos son válidas en emergencia', ok.sceneCount === 5 && !ok.adjusted);

    const bad = resolveSceneCount('estandar', 5);
    check('5 fotos en el estándar se corrigen a 3', bad.sceneCount === 3 && bad.adjusted);
    check('y la corrección NO es silenciosa: trae su motivo',
        typeof bad.note === 'string' && bad.note.includes('3'), String(bad.note));

    const none = resolveSceneCount('emergencia', undefined);
    check('sin cantidad pedida se usa la del preset, sin marcar ajuste',
        none.sceneCount === 3 && !none.adjusted);
    check('una cantidad no entera cae al default',
        resolveSceneCount('emergencia', 4.5).sceneCount === 3);
}
check('el rango absoluto del módulo es 3-5', MIN_SCENE_COUNT === 3 && MAX_SCENE_COUNT === 5);
check('`presetAllowsSceneCount` coincide con el catálogo',
    presetAllowsSceneCount('emergencia', 4) && !presetAllowsSceneCount('estandar', 4));
check('un rol desconocido no devuelve la clave cruda',
    narrativeRoleLabel('no-existe') === null && narrativeRoleLabel('contexto') === 'Contexto');

// ───────────────────────────────────────────────────────────────────────────
console.log('\n▸ El reparto de la duración con 3, 4 y 5 escenas');

for (const n of [3, 4, 5]) {
    const totalSec = targetTotalSecFor('emergencia', n);
    const transitions = Array.from({ length: n - 1 }, () => 'fade');

    // Con motor generativo: Kling entrega clips de 5 o 10 s.
    const kling = distributeDurations({ totalSec, count: n, transitions, engineDurations: [5, 10] });
    check(`${n} escenas con motor → ${n} clips y ninguno de 10 s`,
        kling.generated.length === n && kling.generated.every(d => d === 5),
        JSON.stringify(kling.generated));

    // Sin motor (`fotografico`): las duraciones son libres y dan el objetivo.
    const libre = distributeDurations({ totalSec, count: n, transitions, engineDurations: null });
    check(`${n} escenas sin motor → la pieza cae en el objetivo (${totalSec}s)`,
        Math.abs(libre.finalDurationSec - totalSec) < 0.1,
        `dio ${libre.finalDurationSec}s`);
}

// ───────────────────────────────────────────────────────────────────────────
console.log('\n▸ Las ventanas de los rótulos');

{
    const w = sceneTextWindows({
        scenes: [{ durationSec: 5 }, { durationSec: 5 }, { durationSec: 5 }],
        overlaps: [0.5, 0.5]
    });
    check('hay una ventana por escena', w.length === 3 && w.every(Boolean));
    check('ninguna ventana se solapa con la siguiente',
        w[0].endSec < w[1].startSec && w[1].endSec < w[2].startSec,
        JSON.stringify(w));
    check('las ventanas descuentan los solapamientos de los fundidos',
        w[1].startSec === 4.9 && w[2].startSec === 9.4, JSON.stringify(w));
    // Un rótulo a caballo de un fundido se ve sobre las dos escenas mezcladas.
    check('cada ventana se aparta de los bordes de su escena',
        w[0].startSec >= 0.3 && w[0].endSec <= 4.7, JSON.stringify(w[0]));
}
check('una escena demasiado corta no lleva rótulo (mejor sin él que parpadeando)',
    sceneTextWindows({ scenes: [{ durationSec: 1 }] })[0] === null);
check('el tope de caracteres del rótulo es legible en pantalla',
    MAX_SCENE_TEXT_CHARS > 0 && MAX_SCENE_TEXT_CHARS <= 90);

// ───────────────────────────────────────────────────────────────────────────
console.log('\n▸ Emergencia: normalización del contexto');

{
    const ctx = normalizeEmergencyContext({
        disasterType: 'inundacion', country: 'Colombia', region: 'Chocó',
        needs: ['agua', 'no-existe', 'agua'], ctas: ['donar'], magnitude: '  '
    });
    check('el tipo se resuelve contra el catálogo', ctx.disasterType === 'inundacion');
    check('la ubicación se compone sin coma huérfana', ctx.location === 'Chocó, Colombia');
    check('una necesidad desconocida se descarta y no se duplica',
        JSON.stringify(ctx.needs) === '["agua"]', JSON.stringify(ctx.needs));
    check('un campo en blanco cuenta como AUSENTE, no como dato',
        ctx.magnitude === null && ctx.hasFacts.magnitude === false);
    check('`hasFacts` enumera lo que se sabe de verdad',
        ctx.hasFacts.location === true && ctx.hasFacts.date === false);

    const solo = normalizeEmergencyContext({ disasterType: 'terremoto', country: 'Perú' });
    check('con sólo país, la ubicación no lleva coma delante', solo.location === 'Perú');
}
{
    const t = normalizeEmergencyContext({ disasterType: 'no-existe' });
    check('un desastre inventado cae al default', t.disasterType === 'terremoto');

    // Con «Otro» y sin texto NO se puede nombrar un desastre concreto: elegir
    // uno sería inventar el hecho central de la pieza.
    const otro = normalizeEmergencyContext({ disasterType: 'otro' });
    check('«Otro» sin texto usa una fórmula general, no un desastre concreto',
        /situación de emergencia/i.test(otro.noun), otro.noun);
    const otro2 = normalizeEmergencyContext({ disasterType: 'otro', customDisaster: 'Desplazamiento' });
    check('«Otro» con texto lo usa para nombrar el hecho',
        otro2.noun.includes('desplazamiento'), otro2.noun);
}
check('sin llamado a la acción se usa uno por defecto, no ninguno',
    normalizeEmergencyContext({}).ctas.length === 1);
check('el catálogo ofrece «Otro» con texto libre',
    disasterCatalog().some(d => d.id === 'otro' && d.freeText));
check('todos los desastres declaran qué magnitud tiene sentido pedir',
    Object.values(DISASTER_TYPES).every(d => typeof d.magnitudeHint === 'string' && d.magnitudeHint));
check('los catálogos de necesidades y llamados no están vacíos',
    needCatalog().length > 5 && ctaCatalog().length > 4);

// ───────────────────────────────────────────────────────────────────────────
console.log('\n▸ Emergencia: el brief dice explícitamente lo que NO se sabe');

{
    const vacio = normalizeEmergencyContext({ disasterType: 'terremoto' });
    const brief = buildEmergencyBrief(vacio);
    check('sin ubicación, el brief PROHÍBE nombrar lugares',
        /NO se indicó el lugar/i.test(brief), brief.slice(0, 120));
    check('sin fecha, el brief prohíbe mencionar fechas', /NO se indicó la fecha/i.test(brief));
    check('sin magnitud, el brief prohíbe mencionarla', /NO se indicó la magnitud/i.test(brief));
    check('sin necesidades, el brief prohíbe nombrarlas', /NO se indicaron necesidades/i.test(brief));

    const lleno = normalizeEmergencyContext({
        disasterType: 'terremoto', country: 'Chile', region: 'Valparaíso',
        magnitude: '7.2', needs: ['agua'], eventDate: '2026-08-01'
    });
    const b2 = buildEmergencyBrief(lleno);
    check('con magnitud suministrada, el brief la autoriza',
        /Podés mencionarla tal cual/i.test(b2) && b2.includes('7.2'));
}

// ───────────────────────────────────────────────────────────────────────────
console.log('\n▸ Emergencia: el CONTROL DE DATOS (la capa que hace verdadera la promesa)');

const ctx = normalizeEmergencyContext({
    disasterType: 'terremoto', country: 'Colombia', region: 'Valle del Cauca',
    description: 'Varias viviendas resultaron afectadas en zonas rurales.',
    needs: ['agua', 'alimentos'], ctas: ['donar']
});

const limpio = 'Comunidades del Valle del Cauca enfrentan las consecuencias de un fuerte sismo. Familias necesitan agua potable y alimentos.';
check('un texto correcto pasa', validateEmergencyCopy(limpio, ctx).ok);

const rechazos = [
    ['una cifra de damnificados', 'Más de 10.000 personas quedaron damnificadas.'],
    ['una magnitud no suministrada', 'El sismo de magnitud 7.2 golpeó la zona.'],
    ['un cuantificador vago («miles de»)', 'Miles de familias lo perdieron todo.'],
    ['«la mayoría de» como cifra disfrazada', 'La mayoría de las viviendas quedaron inhabitables.'],
    ['sensacionalismo', 'Una tragedia total golpeó la región.'],
    ['«devastador»', 'Un sismo devastador arrasó el valle.'],
    ['mayúsculas sostenidas', 'La región quedó COMPLETAMENTE destruida.'],
    ['exclamaciones repetidas', '¡¡Ayudá ahora!!'],
    ['atribución a una fuente inventada', 'Según reportes, la situación empeora.'],
    ['«se estima que»', 'Se estima que el daño es enorme.'],
    ['«fuentes oficiales»', 'Fuentes oficiales confirman el impacto.']
];
for (const [nombre, texto] of rechazos) {
    const r = validateEmergencyCopy(texto, ctx);
    check(`se RECHAZA ${nombre}`, !r.ok, texto);
}

// La atribución falsa es siempre falsa, se conozca o no la ubicación. Estaba
// dentro del `if (!hasFacts.location)` por haberla escrito junto a la de
// topónimos, así que con la ubicación completa —el caso normal— se colaba.
{
    const sinUbicacion = normalizeEmergencyContext({ disasterType: 'terremoto' });
    check('la atribución falsa se rechaza TAMBIÉN sin ubicación',
        !validateEmergencyCopy('Según las autoridades, hay daños.', sinUbicacion).ok);
}

// Un número que el usuario SÍ suministró no es una invención.
{
    const conMagnitud = normalizeEmergencyContext({
        disasterType: 'terremoto', magnitude: '7.2', region: 'Lima'
    });
    check('un número SUMINISTRADO sí se puede usar',
        validateEmergencyCopy('Un sismo de magnitud 7.2 afectó la región.', conMagnitud).ok);
    check('pero otro número distinto se sigue rechazando',
        !validateEmergencyCopy('Un sismo de magnitud 8.9 afectó la región.', conMagnitud).ok);
}
// Los separadores de miles no pueden convertir un dato dado en uno inventado.
{
    const c = normalizeEmergencyContext({ disasterType: 'inundacion', description: 'Se repartieron 10.000 kits.' });
    check('«10000» y «10.000» son el mismo dato suministrado',
        validateEmergencyCopy('Se entregaron 10000 kits.', c).ok);
}
check('ROTARY en mayúsculas no cuenta como grito',
    validateEmergencyCopy('Los clubes de ROTARY se movilizan.', ctx).ok);
check('un texto vacío se rechaza', !validateEmergencyCopy('   ', ctx).ok);

// El mensaje de reintento es lo que corrige de verdad: «revisá el formato» no
// corrige nada, hay que decir qué regla se rompió.
{
    const r = validateEmergencyCopy('Más de 5000 damnificados y miles de casas caídas.', ctx);
    check('se reportan TODAS las reglas rotas, no sólo la primera', r.issues.length >= 2, JSON.stringify(r.issues));
    const instr = buildRetryInstruction(r.issues);
    check('la instrucción de reintento enumera las reglas concretas',
        instr.includes('1.') && instr.includes('2.'), instr.slice(0, 120));
}

// ───────────────────────────────────────────────────────────────────────────
console.log('\n▸ El título de la campaña no inventa');

{
    const conLugar = defaultCampaignTitle(ctx, 'Club Rotario Cali');
    check('el título lleva el club, el tipo y el lugar',
        conLugar.includes('Club Rotario Cali') && conLugar.includes('Terremoto') && conLugar.includes('Valle del Cauca'),
        conLugar);
    const sinLugar = defaultCampaignTitle(normalizeEmergencyContext({ disasterType: 'sequia' }), null);
    check('sin ubicación NO se inventa ninguna',
        !sinLugar.includes('·  ') && !/undefined|null/.test(sinLugar), sinLugar);
}

// ───────────────────────────────────────────────────────────────────────────
console.log('\n▸ Los dos espejos dan lo MISMO (servidor y navegador)');

// Se compara la SALIDA de las funciones, no sólo las constantes: que las dos
// puntas cuenten las mismas escenas y repartan los mismos roles es lo que
// sostiene que la pantalla no ofrezca algo que el servidor rechaza.
//
// El espejo es TypeScript y se compila con esbuild, igual que en
// `test-design.mjs` y `test-audience-assets.mjs`. Un desmontador de tipos a
// base de expresiones regulares se rompe con la primera anotación que no
// previó — y entonces la prueba falla por sí misma en vez de por el código.
let mirror = null;
try {
    const { build } = await import('esbuild');
    const bundle = await build({
        entryPoints: ['src/lib/reelPresets.ts'],
        bundle: true, write: false, format: 'esm', platform: 'neutral'
    });
    mirror = await import(`data:text/javascript,${encodeURIComponent(bundle.outputFiles[0].text)}`);
} catch (e) {
    // esbuild se instala aparte (`npm i --no-save esbuild`). Sin él, la
    // comparación de espejos se SALTA con un aviso, igual que las pruebas de
    // navegador del resto del sitio: es preferible a fallar por una dependencia
    // de desarrollo ausente.
    console.log(`  SALTA la comparación de espejos — falta esbuild (${e.message.slice(0, 60)})`);
}

if (mirror) {
    check('MIN/MAX_SCENE_COUNT coinciden',
        mirror.MIN_SCENE_COUNT === MIN_SCENE_COUNT && mirror.MAX_SCENE_COUNT === MAX_SCENE_COUNT);
    check('DEFAULT_PRESET coincide', mirror.DEFAULT_PRESET === DEFAULT_PRESET);

    let iguales = true, detalle = '';
    for (const preset of ['estandar', 'emergencia']) {
        for (const n of [3, 4, 5]) {
            const a = resolveSceneCount(preset, n);
            const b = mirror.resolveSceneCount(preset, n);
            if (a.sceneCount !== b.sceneCount || a.adjusted !== b.adjusted) {
                iguales = false; detalle = `${preset}/${n}: ${a.sceneCount} vs ${b.sceneCount}`;
            }
            const ra = narrativeRolesFor(preset, a.sceneCount).map(r => r.id).join(',');
            const rb = mirror.narrativeRolesFor(preset, b.sceneCount).map(r => r.id).join(',');
            if (ra !== rb) { iguales = false; detalle = `${preset}/${n} roles: ${ra} vs ${rb}`; }
            if (targetTotalSecFor(preset, a.sceneCount) !== mirror.targetTotalSecFor(preset, b.sceneCount)) {
                iguales = false; detalle = `${preset}/${n} duración`;
            }
        }
    }
    check('`resolveSceneCount`, `narrativeRolesFor` y `targetTotalSecFor` dan lo mismo en los dos espejos',
        iguales, detalle);

    check('las etiquetas de los roles coinciden',
        ['contexto', 'impacto_humano', 'necesidades', 'respuesta', 'cta', 'cta_cierre', 'accion_cta', 'libre']
            .every(id => narrativeRoleLabel(id) === mirror.narrativeRoleLabel(id)));
}

// ───────────────────────────────────────────────────────────────────────────
console.log('\n▸ El catálogo que se sirve al navegador');

{
    const cat = presetCatalog();
    check('el catálogo trae los dos presets', cat.length === 2);
    check('cada entrada dice cuántas fotos admite y si lleva texto',
        cat.every(p => Array.isArray(p.sceneCounts) && typeof p.onScreenText === 'boolean'));
    check('exactamente uno es el default', cat.filter(p => p.isDefault).length === 1);
}

// ───────────────────────────────────────────────────────────────────────────
// El montaje NO puede quedarse con la constante de tres escenas: con cuatro
// fotos, comparar contra 3 daría por completo un montaje al que le falta una.
console.log('\n▸ El montaje cuenta las escenas del PROYECTO, no una constante');
{
    const src = readFileSync(path.join(root, 'server/controllers/reelController.js'), 'utf8');
    check('`submitAssembly` no compara contra `SCENE_COUNT` a secas',
        !/usable\.length\s*<\s*SCENE_COUNT/.test(src));
    check('usa la cantidad guardada en la configuración del Reel',
        /config\?\.sceneCount/.test(src));
    check('la creación valida contra el PRESET, no contra una constante',
        /preset\.sceneCounts\.includes\(images\.length\)/.test(src));
}

// ───────────────────────────────────────────────────────────────────────────
console.log(`\n${fail === 0 ? '✓' : '✗'} ${pass} pruebas pasan, ${fail} fallan\n`);
process.exit(fail === 0 ? 0 : 1);
