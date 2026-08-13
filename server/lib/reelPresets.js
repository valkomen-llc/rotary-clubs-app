// ════════════════════════════════════════════════════════════════════
// Creador de Reels IA — presets de pieza
// v4.783.0
//
// QUÉ ES UN PRESET. La configuración completa de UNA CLASE de Reel: cuántas
// fotos admite, cuánto dura, qué función narrativa cumple cada foto, con qué
// estilo se anima, cómo suena la voz y qué lleva el cierre.
//
// POR QUÉ ACÁ Y NO DENTRO DEL CONTROLADOR. El módulo nació resolviendo UNA
// pieza —tres fotos, quince segundos, sin estructura narrativa declarada— y esa
// decisión estaba escrita en quince sitios: `SCENE_COUNT` comparado con `!==`
// en el controlador, en el director y en nueve puntos de la pantalla. Agregar
// una segunda clase de pieza por ese camino significaba un `if` por sitio.
//
// Un preset es DATOS. Agregar «campaña ambiental» o «captación de socios» es
// una entrada más en `REEL_PRESETS`, sin tocar el compilador de prompts, ni la
// máquina de estados, ni el montaje, ni el modelo de datos.
//
// ─── LO QUE ESTE ARCHIVO NO HACE ───────────────────────────────────────────
//
// No consulta la base, no llama a ningún proveedor y no lee el reloj. Es
// criterio puro y por eso se puede probar sin credenciales ni red, igual que
// `seoRules.js` vive aparte de `seoAudit.js` y `reelSpec.js` aparte de
// `reelController.js`. Su espejo en el navegador es `src/lib/reelPresets.ts`:
// al tocar uno, tocar el otro — lo comprueba `npm run test:reels:presets`
// comparando las SALIDAS de las funciones, no sólo las constantes.
// ════════════════════════════════════════════════════════════════════

import {
    DEFAULT_MOTION_STYLE, AUTO_MOTION_STYLE,
    DEFAULT_MOTION_INTENSITY,
    AUTO_TRANSITION, DEFAULT_TRANSITION,
    AUTO_MUSIC_STYLE,
    MIN_SCENE_SEC, MAX_SCENE_SEC
} from './reelSpec.js';

// ─── Cantidad de escenas ───────────────────────────────────────────────────
//
// El módulo admite de 3 a 5 fotografías. El piso es 3 porque con dos no hay
// estructura narrativa que sostener —una situación y un cierre no cuentan una
// historia— y el techo es 5 porque por encima el Reel se pasa de los 30 s que
// las redes verticales premian, y porque cada escena es una tarea de video más
// que pagar y esperar.
//
// Quién decide dentro de ese rango es el PRESET, no esta constante: `estandar`
// admite sólo 3 para no cambiar el comportamiento que ya está en producción.
export const MIN_SCENE_COUNT = 3;
export const MAX_SCENE_COUNT = 5;

// ─── Duración por cantidad de escenas ──────────────────────────────────────
//
// El objetivo de la pieza, antes de que el motor imponga lo suyo. NO es la
// duración final: `distributeDurations` acota cada escena al mayor valor que el
// motor entrega dentro de [4, 6] —con Kling eso es 5 s— y descuenta lo que se
// comen los fundidos. Con tres fotos el objetivo es 15 y la pieza sale de 14, y
// el módulo lo anota en `notes` en vez de callarlo.
//
// Los valores salen de los rangos que pidió el equipo: 3 → ~15 s, 4 → 18-22 s,
// 5 → 22-30 s. Se eligió el punto bajo de cada rango porque en redes verticales
// la retención cae con la duración, y porque quedarse corto es recuperable
// —se agrega una foto— y pasarse no.
const DEFAULT_TOTAL_SEC = { 3: 15, 4: 20, 5: 26 };

// ─── Roles narrativos ──────────────────────────────────────────────────────
//
// Qué CUENTA cada foto. Es la pieza que convierte «cinco fotos» en «una
// historia de cinco partes» en vez de tres escenas más dos de relleno.
//
// `id` viaja al guion y al director; `label` es lo que ve el usuario debajo de
// cada foto en la línea de tiempo; `brief` es la instrucción para el modelo que
// escribe el guion, en español porque el guion se escribe en español.
//
// El catálogo es CERRADO y compartido: un preset elige de acá, no inventa. Así
// dos presets que usen «cta» producen la misma clase de escena final, y la
// pantalla sabe rotularla sin conocer el preset.
export const NARRATIVE_ROLES = {
    contexto: {
        id: 'contexto',
        label: 'Contexto',
        brief: 'Presenta la situación: qué ocurrió y dónde. Es la escena que ubica a quien mira.'
    },
    impacto_humano: {
        id: 'impacto_humano',
        label: 'Impacto humano',
        brief: 'Muestra a las personas y comunidades afectadas, con dignidad y sin dramatismo.'
    },
    necesidades: {
        id: 'necesidades',
        label: 'Necesidades',
        brief: 'Nombra qué hace falta concretamente, sólo lo que el usuario haya indicado.'
    },
    respuesta: {
        id: 'respuesta',
        label: 'Rotarios en acción',
        brief: 'Introduce la movilización rotaria: la solidaridad convertida en trabajo concreto.'
    },
    cta: {
        id: 'cta',
        label: 'Llamado a la acción',
        brief: 'Pide una acción concreta y posible, la que el usuario haya elegido.'
    },
    cta_cierre: {
        id: 'cta_cierre',
        label: 'Llamado y cierre',
        brief: 'Une el llamado a la acción con el cierre institucional del club.'
    },
    accion_cta: {
        id: 'accion_cta',
        label: 'Acción y llamado',
        brief: 'Une la movilización rotaria con el llamado a la acción, porque no hay escena aparte para cada uno.'
    },
    libre: {
        id: 'libre',
        label: 'Libre',
        brief: 'Sin función asignada: el director decide qué cuenta esta escena.'
    }
};

// ─── El catálogo de presets ────────────────────────────────────────────────
//
// `estandar` REPRODUCE EL COMPORTAMIENTO DE HOY y por eso es el default: tres
// fotos, quince segundos, sin estructura narrativa impuesta —el director sigue
// decidiendo el orden mirando las fotos— y sin texto en pantalla. Un cliente
// con el bundle anterior que no mande `preset` cae acá y no nota nada. Es la
// misma regla aditiva de `sessions` en v4.711 y de `groups` en v4.708.
export const REEL_PRESETS = {
    estandar: {
        id: 'estandar',
        label: 'Reel estándar',
        description: 'Tres fotografías y ~15 segundos. El director decide el orden y el ritmo mirando las fotos.',
        sceneCounts: [3],
        defaultSceneCount: 3,
        totalSec: { 3: 15 },
        // Sin estructura: el director conserva la libertad que ya tenía.
        narrative: null,
        contextSchema: null,
        // `auto` en los cuatro ejes = exactamente lo que hace hoy la pantalla.
        motionStyle: AUTO_MOTION_STYLE,
        motionIntensity: DEFAULT_MOTION_INTENSITY,
        transition: AUTO_TRANSITION,
        musicStyle: AUTO_MUSIC_STYLE,
        narrationStyle: 'institucional',
        onScreenText: false,
        closingCard: false,
        requireExpansion: false,
        factGuard: null,
        isDefault: true
    },

    emergencia: {
        id: 'emergencia',
        label: 'Campaña de Emergencia',
        description: 'Respuesta ante desastres naturales: sensibilizar y movilizar. De 3 a 5 fotografías, con guion, texto en pantalla y cierre institucional.',
        sceneCounts: [3, 4, 5],
        defaultSceneCount: 3,
        totalSec: DEFAULT_TOTAL_SEC,

        // La estructura narrativa POR CANTIDAD DE FOTOS. No es la misma lista
        // recortada: con tres fotos la movilización rotaria y el llamado a la
        // acción comparten escena (`accion_cta`), y con cinco cada una tiene la
        // suya. Es la diferencia entre adaptar la historia y rellenar con
        // escenas repetidas para completar duración.
        narrative: {
            3: ['contexto', 'impacto_humano', 'accion_cta'],
            4: ['contexto', 'impacto_humano', 'respuesta', 'cta'],
            5: ['contexto', 'impacto_humano', 'necesidades', 'respuesta', 'cta_cierre']
        },

        // Qué formulario se le pide al usuario antes de generar.
        contextSchema: 'emergency',

        // ── El default es la ESCENA VIVA, y el cambio tiene historia ──
        //
        // v4.783 estrenó este preset con `fotografico`: un motor image-to-video
        // REINTERPRETA los píxeles —puede añadir una persona que no está en la
        // foto, defecto medido en v4.705— y en la fotografía de un desastre
        // real eso es un problema de VERACIDAD, no de calidad. Evitar el motor
        // era la única protección disponible entonces.
        //
        // v4.785 cambió esa ecuación: la veracidad ahora se MIDE en vez de
        // evitarse. El censo cuenta también cuando es cero, el inventario fija
        // los elementos de la escena, y una escena con un sujeto inventado NO
        // entra al Reel por ninguna vía —agotados los reintentos, se sustituye
        // y se marca para revisión—. Con esas defensas desplegadas, el cliente
        // decidió (v4.786, con los resultados a la vista) que el default sea la
        // escena que RESPIRA: el resultado estático de `fotografico` era
        // técnicamente fiel y comunicativamente muerto.
        //
        // `auto` deja que el director elija el estilo VIVO por escena según lo
        // que ve en cada foto (`fotografico` está excluido de su repertorio, es
        // elección expresa del usuario). El modo sin IA sigue disponible en la
        // pantalla, rotulado como lo que es.
        motionStyle: AUTO_MOTION_STYLE,
        // `natural`, no `sutil`: la intensidad se ACOTA sola por escena
        // (`resolveSceneIntensity` baja con caras tapadas o grupo denso, que en
        // fotos de emergencia es lo habitual). Partir de `sutil` fue parte de la
        // postura conservadora de v4.783; con el descarte estricto vigente, el
        // techo por defecto es el del módulo.
        motionIntensity: 'natural',
        transition: 'fade',
        musicStyle: 'institucional',
        narrationStyle: 'institucional',

        onScreenText: true,
        closingCard: true,

        // ── La expansión de lienzo es OBLIGATORIA acá ──
        //
        // Cuando la adaptación no actúa, el montaje RECORTA AL CENTRO
        // (`buildFilterGraph`: `force_original_aspect_ratio=increase,crop=W:H`)
        // y ese recorte se lleva los bordes, que es donde están las personas de
        // los extremos. En una campaña de emergencia esa pérdida es de la
        // evidencia misma. Con esta marca, una foto que no se pueda adaptar se
        // reporta con su motivo Y su consecuencia en vez de recortarse callando.
        requireExpansion: true,

        // Modo estricto de comprobación de datos. Ver `emergencySpec.js`.
        factGuard: 'strict'
    }
};

export const DEFAULT_PRESET = 'estandar';

// ─── Resolución ────────────────────────────────────────────────────────────

/**
 * El preset pedido, o el default. Nunca se confía en el navegador: un id
 * inventado cae al default en vez de romper la creación.
 */
export const resolvePreset = (presetId) =>
    REEL_PRESETS[presetId] ? REEL_PRESETS[presetId] : REEL_PRESETS[DEFAULT_PRESET];

/**
 * Cuántas escenas va a tener la pieza.
 *
 * Devuelve además si hubo que corregir lo pedido y por qué. La corrección NO es
 * silenciosa: viaja a la respuesta y queda en las notas del proyecto, igual que
 * los ajustes de `resolveEngine`. Que alguien pida cinco fotos y reciba tres sin
 * enterarse es peor que un error.
 */
export const resolveSceneCount = (presetId, requested) => {
    const preset = resolvePreset(presetId);
    const allowed = preset.sceneCounts;
    const n = Number(requested);

    if (!Number.isFinite(n) || !Number.isInteger(n)) {
        return { sceneCount: preset.defaultSceneCount, requested: null, adjusted: false, note: null };
    }
    if (allowed.includes(n)) {
        return { sceneCount: n, requested: n, adjusted: false, note: null };
    }
    return {
        sceneCount: preset.defaultSceneCount,
        requested: n,
        adjusted: true,
        note: `«${preset.label}» se arma con ${allowed.join(', ')} ${allowed.length === 1 ? 'fotografía' : 'fotografías'}: se usaron ${preset.defaultSceneCount}.`
    };
};

/**
 * Duración objetivo de la pieza para esa cantidad de escenas.
 *
 * Con una cantidad que el preset no declara —no debería llegar, pero el
 * servidor no supone— se estima a razón de la duración media por escena del
 * propio preset, en vez de caer a un número escrito a mano que contradiga su
 * tabla.
 */
export const targetTotalSecFor = (presetId, sceneCount) => {
    const preset = resolvePreset(presetId);
    const declared = preset.totalSec?.[sceneCount];
    if (Number.isFinite(declared)) return declared;

    const entries = Object.entries(preset.totalSec || {});
    if (!entries.length) return sceneCount * 5;
    const [n, sec] = entries[0];
    const perScene = sec / Number(n);
    // Acotado al rango real por escena: un preset no puede pedir 2 s de escena.
    const clamped = Math.min(MAX_SCENE_SEC, Math.max(MIN_SCENE_SEC, perScene));
    return Number((clamped * sceneCount).toFixed(2));
};

/**
 * Los roles narrativos de cada escena, en orden.
 *
 * Sin estructura declarada —`estandar`— devuelve `libre` para todas: el
 * director conserva la libertad que ya tenía, que es lo que hace que este
 * preset no cambie nada de lo que hoy está en producción.
 */
export const narrativeRolesFor = (presetId, sceneCount) => {
    const preset = resolvePreset(presetId);
    const declared = preset.narrative?.[sceneCount];
    const ids = Array.isArray(declared) && declared.length === sceneCount
        ? declared
        : Array.from({ length: sceneCount }, () => 'libre');

    return ids.map((id, index) => {
        const role = NARRATIVE_ROLES[id] || NARRATIVE_ROLES.libre;
        return { index, id: role.id, label: role.label, brief: role.brief };
    });
};

/**
 * El preset servido al navegador. Se enumera a propósito en vez de mandar el
 * objeto entero: lo que la pantalla necesita saber es qué ofrecer y qué
 * advertir, no la instrucción interna de cada rol.
 */
export const presetCatalog = () => Object.values(REEL_PRESETS).map(p => ({
    id: p.id,
    label: p.label,
    description: p.description,
    sceneCounts: p.sceneCounts,
    defaultSceneCount: p.defaultSceneCount,
    totalSec: p.totalSec,
    contextSchema: p.contextSchema,
    motionStyle: p.motionStyle,
    motionIntensity: p.motionIntensity,
    transition: p.transition,
    musicStyle: p.musicStyle,
    onScreenText: p.onScreenText,
    closingCard: p.closingCard,
    requireExpansion: p.requireExpansion,
    hasNarrative: Boolean(p.narrative),
    isDefault: Boolean(p.isDefault)
}));

/**
 * Los valores por defecto que el preset impone sobre la configuración pedida.
 *
 * LA ELECCIÓN EXPLÍCITA DEL USUARIO MANDA. El preset rellena lo que el usuario
 * no eligió; no pisa lo que sí. Es la misma regla que el director con el estilo,
 * la transición y la música: si lo eligió, no se cambia.
 *
 * `respectUserChoice` distingue «no vino el campo» de «vino en su valor
 * automático». Un `auto` explícito significa «decidí vos», así que el preset lo
 * llena; `undefined` significa lo mismo. Lo que no se toca es un id concreto.
 */
export const applyPresetDefaults = (presetId, requested = {}) => {
    const preset = resolvePreset(presetId);
    const out = { ...requested };
    const notes = [];

    const fill = (key, presetValue, autoValue) => {
        if (presetValue == null) return;
        const asked = requested[key];
        const isAuto = asked === undefined || asked === null || asked === autoValue;
        if (isAuto) out[key] = presetValue;
    };

    fill('motionStyle', preset.motionStyle, AUTO_MOTION_STYLE);
    fill('transition', preset.transition, AUTO_TRANSITION);
    fill('musicStyle', preset.musicStyle, AUTO_MUSIC_STYLE);
    fill('motionIntensity', preset.motionIntensity, undefined);
    fill('narrationStyle', preset.narrationStyle, undefined);

    // El aviso del MODO efectivo. Se dice acá y no en la pantalla porque el
    // servidor es quien resuelve el estilo, y porque la nota tiene que quedar
    // en el proyecto: quien abra el Reel dentro de un mes tiene que poder saber
    // por qué esas fotos se mueven así (o por qué no).
    if (out.motionStyle === 'fotografico') {
        notes.push(
            'Modo Fotográfico — sin animación IA: se mueve el encuadre sobre la imagen original, así que rostros, daños y contexto no se reinterpretan, pero la escena no cobra vida. Cuesta cero créditos de video.'
        );
    } else if (preset.factGuard === 'strict') {
        // Escena viva sobre una emergencia real: se dice qué la protege, porque
        // la pregunta legítima de quien publica es «¿y si la IA inventa algo?».
        notes.push(
            'Las escenas se animan con IA y la fidelidad se mide fotograma a fotograma: una escena que muestre personas que no están en la fotografía, altere la marca o vuelva ilegible un texto no entra al Reel — se sustituye por la fotografía en movimiento y queda marcada para revisión.'
        );
    }

    return { config: out, notes, preset };
};

/**
 * Si el preset admite esa cantidad de fotos. Lo usa la pantalla para habilitar
 * el selector y el servidor para validar; el que manda es el servidor.
 */
export const presetAllowsSceneCount = (presetId, n) =>
    resolvePreset(presetId).sceneCounts.includes(Number(n));

// Etiqueta legible de un rol, para la línea de tiempo. Un rol desconocido
// devuelve `null` y la pantalla no pinta nada, en vez de mostrar la clave cruda
// como si fuera el nombre — que es el defecto que documenta `RETIRED_LABELS` en
// el registro de eventos.
export const narrativeRoleLabel = (roleId) => NARRATIVE_ROLES[roleId]?.label || null;
