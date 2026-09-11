// ════════════════════════════════════════════════════════════════════════════
// Solicitud → Reel para redes — el CRITERIO — v4.1006 · asistente v4.1012
//
// La SEGUNDA salida de una Solicitud de Contenido. La primera es el artículo
// de noticia (v4.1000-v4.1004) y no se toca: misma solicitud, mismo contexto,
// mismos archivos, misma carpeta de la Biblioteca.
//
// ─── LO QUE ESTE ARCHIVO NO HACE ───────────────────────────────────────────
//
// No consulta la base, no llama a ningún proveedor, no lee el reloj y no
// genera ningún video. Es criterio puro y por eso se puede probar sin
// credenciales ni red, igual que `reelSpec.js` vive aparte de
// `reelController.js` y `seoRules.js` aparte de `seoAudit.js`.
//
// ⚠️ NO HAY UN SEGUNDO MOTOR DE REELS. Este módulo decide QUÉ fotos, en qué
// ORDEN y QUÉ cuenta cada una; el Reel lo produce `startReelProject`, el mismo
// que usa el Estudio de Contenido. La diferencia entre las dos piezas es un
// PRESET y una fuente de datos, no un motor — con dos motores, el día que se
// corrija el reparto de duraciones una mitad se queda atrás y el fallo es
// mudo, porque las dos siguen produciendo un Reel.
// ════════════════════════════════════════════════════════════════════════════

import { MIN_SCENE_COUNT, MAX_SCENE_COUNT } from './reelPresets.js';
import { validateEmergencyCopy } from './emergencySpec.js';
// ⚠️ EL RANGO POR ESCENA Y EL CATÁLOGO DE MÚSICA SON LOS DEL MOTOR DE SIEMPRE.
// No se declara acá un segundo mínimo, un segundo máximo ni una segunda lista
// de estilos: con dos catálogos, la pantalla ofrecería una duración que el
// reparto no puede dar o una música que el montaje no sabe pedir, y el fallo
// sería mudo. `reelSpec.js` es criterio puro (no importa nada), así que esto no
// mete base ni red en un archivo que se prueba sin credenciales.
import {
    MIN_SCENE_SEC, MAX_SCENE_SEC, TRANSITIONS, TRANSITION_OVERLAP_SEC, MUSIC_STYLES,
} from './reelSpec.js';

const str = (v, max = 400) => String(v ?? '').trim().slice(0, max);
const num = (v, def = 0) => (Number.isFinite(Number(v)) ? Number(v) : def);
const arr = (v) => (Array.isArray(v) ? v : []);

// ─── Los estados del Reel ──────────────────────────────────────────────────
//
// `working` marca los que el motor mueve solo; el resto los mueve una persona.
// Son los del pedido, con el mismo vocabulario que el artículo para que la
// ficha de una solicitud se lea igual en sus dos bloques.
//
// ⚠️ NO HAY ESTADO «PROGRAMADO», y no es un olvido. Programar una publicación
// vive en otro módulo (`SocialPublication.scheduledFor` y la Distribución
// multi-destino): un estado que NADIE escribe es una rama que nunca es
// verdadera — la regla de `clicked` en el CRM (v4.701) y de «programada» en la
// bandeja (v4.999). El botón «Programar» lleva al módulo que sí lo hace.
export const REEL_STATES = {
    recibida:       { id: 'recibida',       label: 'En cola',                order: 10, tone: 'sky',     working: true,  help: 'En cola: el Reel se prepara solo en el próximo minuto.' },
    analizando:     { id: 'analizando',     label: 'Analizando contenido',   order: 20, tone: 'sky',     working: true,  help: 'Se está mirando el material y eligiendo las fotografías.' },
    preparando:     { id: 'preparando',     label: 'Preparando storyboard',  order: 30, tone: 'sky',     working: true,  help: 'Se está armando la historia y el guion.' },
    // ⚠️ EL ÚNICO ESTADO QUE NO ES DE TRABAJO ANTES DE PAGAR, y es la pieza
    // sobre la que se apoya todo lo demás (v4.1012). `working: false` significa
    // que NI el cron, NI el sondeo del navegador, NI el botón avanzan la fila:
    // `advanceReel` corta en su primera línea. Ahí es donde el Reel espera a que
    // una persona confirme, y por eso «Generar Reel» dejó de ser sinónimo de
    // gastar créditos — se detiene acá por CONSTRUCCIÓN, no porque una pantalla
    // se acuerde de no llamar a nada.
    configurando:   { id: 'configurando',   label: 'Configurando',           order: 35, tone: 'violet',                  help: 'Preparado y esperando confirmación. Todavía no se gastó ni un crédito de video.' },
    generando:      { id: 'generando',      label: 'Generando escenas',      order: 40, tone: 'sky',     working: true,  help: 'Las fotografías se están animando. Tarda entre uno y tres minutos.' },
    componiendo:    { id: 'componiendo',    label: 'Componiendo Reel',       order: 50, tone: 'sky',     working: true,  help: 'Se está montando el video con su música y su voz.' },
    borrador_listo: { id: 'borrador_listo', label: 'Borrador listo',         order: 60, tone: 'amber',                   help: 'Hay un Reel para revisar. Nada se publicó.' },
    en_revision:    { id: 'en_revision',    label: 'En revisión',            order: 65, tone: 'amber',                   help: 'Alguien lo está revisando.' },
    aprobado:       { id: 'aprobado',       label: 'Aprobado',               order: 70, tone: 'emerald',                 help: 'Aprobado para publicar. Todavía no salió a ninguna red.' },
    publicado:      { id: 'publicado',      label: 'Publicado',              order: 80, tone: 'blue',                    help: 'Salió a las redes.' },
    descartado:     { id: 'descartado',     label: 'Descartado',             order: 90, tone: 'gray',                    help: 'No se va a publicar. Se conserva con su motivo.' },
    // ⚠️ INCOMPLETO NO ES ERROR (v4.1028). Es el Reel al que le faltan escenas
    // y que tiene otras ya generadas y guardadas: se CONTINÚA —sólo lo que
    // falta— en vez de reintentarse desde cero. `working: false` porque el
    // motor no lo mueve solo; lo mueve una persona con «Continuar».
    incompleto:     { id: 'incompleto',     label: 'Incompleto',             order: 92, tone: 'amber',                   help: 'Faltan escenas. Las ya generadas están guardadas y no vuelven a consumir créditos: se continúa sólo lo pendiente.' },
    error:          { id: 'error',          label: 'Error',                  order: 95, tone: 'red',                     help: 'Una etapa falló. Se puede reintentar sin regenerar lo que ya está.' },
};
export const REEL_STATE_IDS = Object.keys(REEL_STATES);
export const REEL_INITIAL_STATE = 'recibida';
export const reelStateLabel = (id) => REEL_STATES[id]?.label || id;
export const isReelWorking = (id) => REEL_STATES[id]?.working === true;

// Lo que una PERSONA puede hacer. El motor no pasa por acá.
//
// ⚠️ NINGÚN CAMINO A «publicado» SALTEA «aprobado», y se comprueba recorriendo
// los diez estados, no el par feliz: el día que alguien agregue un atajo desde
// «en revisión», la prueba falla. Es la misma garantía estructural que sostiene
// «la automatización no publica» en el artículo.
const FLOW = {
    // ⚠️ DE «configurando» NO SE SALE POR ACÁ HACIA LA GENERACIÓN, y es
    // deliberado: confirmar el plan no es un cambio de estado editorial, es el
    // gesto que autoriza el gasto, y vive en su propia acción (`confirmReelPlan`)
    // con su propia validación. Meterlo en `FLOW` lo dejaría al alcance de
    // `POST /status`, que es la ruta genérica de cambios de estado: cualquiera
    // que la conociera podría disparar la generación sin pasar por el resumen.
    configurando:   ['descartado'],
    borrador_listo: ['en_revision', 'aprobado', 'descartado'],
    en_revision:    ['aprobado', 'descartado', 'borrador_listo'],
    aprobado:       ['publicado', 'en_revision', 'descartado'],
    publicado:      [],
    descartado:     ['borrador_listo', 'configurando'],
    error:          ['recibida'],
    // De «incompleto» se sale CONTINUANDO (acción propia, `resumeSubmissionReel`)
    // o descartando. Nunca a «publicado».
    incompleto:     ['descartado'],
};
export const canTransitionReel = (from, to) => Array.isArray(FLOW[from]) && FLOW[from].includes(to);
export const nextReelStates = (from) => (FLOW[from] || []).map(id => ({ id, label: reelStateLabel(id) }));
export const REEL_REASON_REQUIRED = ['descartado'];
export const reelNeedsReason = (to) => REEL_REASON_REQUIRED.includes(to);

// ─── Las etapas del motor ──────────────────────────────────────────────────
//
// Cada `advance` ejecuta UNA y suelta el reclamo, igual que el artículo: la
// pantalla pinta la etapa cuando OCURRE, no cuando cree que va por ahí
// (v4.756), y cada llamada cabe en el presupuesto de la función.
//
// ⚠️ NO HAY ETAPA «GUION», y su ausencia es deliberada. El pedido la enumera y
// lo que pide —hook, narrativa, cierre y CTA— lo produce `storyboard` en la
// MISMA llamada, porque son el mismo texto visto dos veces. El guion HABLADO es
// otra cosa y ya tiene dueño: `reelNarration.js` lo escribe con su Narrative
// Timing Engine, que le pone un presupuesto de palabras, sintetiza, MIDE el
// audio real y corrige hasta que entra en la duración (v4.669). Una etapa que
// escribiera un segundo guion sería un segundo generador de voz que se separa
// del primero, y encima uno que no mide nada.
//
// `material`, `seleccion` y `storyboard` no gastan un solo crédito de video:
// es a propósito, porque son las que el usuario puede querer revisar ANTES de
// pagar. `proyecto` es la primera que cuesta dinero.
//
// ⚠️ `costs: true` MARCA LA FRONTERA DEL DINERO (v4.1012), y no es decorativa:
// es lo que `deriveReelWorkflowStatus` usa para detenerse antes de ella cuando
// el plan todavía no está confirmado. Al agregar una etapa que llame a un
// proveedor de video, marcarla — una etapa que gasta sin declararlo se saltea
// la puerta y el fallo es mudo: el Reel sale bien y los créditos se fueron sin
// que nadie los autorizara. Lo fija una prueba.
export const REEL_STAGES = [
    { id: 'material',   label: 'Analizando el material…',      state: 'analizando', optional: false, costs: false },
    { id: 'seleccion',  label: 'Eligiendo las fotografías…',   state: 'analizando', optional: false, costs: false },
    { id: 'storyboard', label: 'Armando el storyboard…',       state: 'preparando', optional: false, costs: false },
    { id: 'proyecto',   label: 'Generando las escenas…',       state: 'generando',  optional: false, costs: true  },
];
/** Las etapas que se pueden correr SIN autorización: no gastan un crédito. */
export const FREE_REEL_STAGES = REEL_STAGES.filter(s => !s.costs).map(s => s.id);
export const PAID_REEL_STAGES = REEL_STAGES.filter(s => s.costs).map(s => s.id);
export const REEL_STAGE_IDS = REEL_STAGES.map(s => s.id);
export const reelStageLabel = (id) => REEL_STAGES.find(s => s.id === id)?.label || id;
export const REEL_STAGE_MAX_TRIES = 2;
export const REEL_CLAIM_WINDOW_MIN = 10;

export const nextReelStage = (stages = {}) => REEL_STAGES.find(s => stages?.[s.id]?.status !== 'ok') || null;

/**
 * El estado que se DERIVA de las etapas. Una etapa OPCIONAL fallida no tumba
 * el Reel; una OBLIGATORIA sí.
 *
 * Con todas las etapas hechas el estado NO es todavía `borrador_listo`: el
 * proyecto de Reel está corriendo en el proveedor y quien manda a partir de ahí
 * es SU máquina de estados. `seguimiento` significa «las etapas terminaron,
 * ahora se mira el ReelProject».
 */
/**
 * ⚠️ Y ES LA PUERTA DEL GASTO (v4.1012). Con las etapas gratuitas hechas y el
 * plan SIN confirmar devuelve `configurando`, que NO es un estado de trabajo:
 * `advanceReel` corta en su primera línea, el barrido del cron no lo recoge y
 * el sondeo del navegador se desmonta. La generación no se detiene porque una
 * pantalla se acuerde de no pedirla — se detiene porque no hay ninguna vía que
 * la mueva.
 *
 * `confirmed` es un booleano y no la fila entera a propósito: esta función es
 * pura y se prueba sin base.
 */
export const deriveReelWorkflowStatus = (stages = {}, { confirmed = true } = {}) => {
    const pending = [];
    for (const s of REEL_STAGES) {
        const st = stages?.[s.id];
        if (st?.status === 'ok') continue;
        if (st?.status === 'error') {
            if (!s.optional) return { status: 'error', pending, failedStage: s.id, error: st.error || '' };
            pending.push(s.id);
            continue;
        }
        if (s.costs && !confirmed) {
            return { status: 'configurando', pending, nextStage: s.id, awaitingConfirmation: true };
        }
        return { status: s.state, pending, nextStage: s.id };
    }
    return { status: 'seguimiento', pending };
};

export const reelStageToRetry = (stages = {}, wanted = '') => {
    if (wanted && REEL_STAGE_IDS.includes(wanted)) return wanted;
    const fallida = REEL_STAGES.find(s => stages?.[s.id]?.status === 'error');
    return fallida?.id || nextReelStage(stages)?.id || null;
};

// ─── El modo de contenido ──────────────────────────────────────────────────
//
// ⚠️ `video_reel` ESTÁ DECLARADO Y NO IMPLEMENTADO, y eso se DICE. Es la
// estructura que pide la segunda fase: cuando exista el adaptador, entra por
// acá sin tocar la máquina de estados. Declararlo como disponible sería
// prometer una integración que no existe (regla del sitio).
export const CONTENT_MODES = {
    image_reel: {
        id: 'image_reel',
        label: 'Reel de imágenes',
        available: true,
        help: 'Las fotografías se animan y se montan con voz y música.',
    },
    video_reel: {
        id: 'video_reel',
        label: 'Reel de video',
        available: false,
        help: 'Esta solicitud contiene principalmente videos. El modo Reel de Video se habilitará en una próxima implementación.',
    },
    mixed: {
        id: 'mixed',
        label: 'Mixto',
        available: false,
        help: 'Hay imágenes y videos en proporciones parecidas: por ahora se arma con las imágenes.',
    },
};

export const ASSET_KINDS = ['image', 'video', 'audio', 'document', 'other'];

/**
 * Clasifica el material de la solicitud y decide el modo.
 *
 * LA REGLA ES «imágenes >= videos → imágenes», tal como se pidió. `mixed` NO
 * se usa para decidir todavía: se declara para que la segunda fase tenga dónde
 * engancharse, y mientras tanto una solicitud con más videos que fotos se
 * REPORTA en vez de intentarse — un Reel de video mal montado sobre material
 * de un club es peor que decir que falta esa mitad.
 *
 * Un archivo que no se pudo leer se cuenta aparte y se dice: `usable` es lo que
 * de verdad se puede animar, y es el número contra el que se decide.
 */
/**
 * ⚠️ QUÉ ES UNA FOTOGRAFÍA DE LA ACTIVIDAD Y QUÉ NO (v4.1010).
 *
 * Hasta v4.1008 `excluded` traía TODOS los motivos automáticos y esta
 * selección los descartaba juntos. Desde v4.1009 `excluded` significa sólo
 * «lo dejó fuera una persona» y los automáticos viven en `coverNote` — que es
 * lo correcto para la galería del artículo: una foto oscura que un club mandó
 * para que se publicara se publica.
 *
 * Acá la pregunta no es la misma y por eso se parte en dos. Oscura y
 * desenfocada son cuestión de GRADO: el puntaje ya las penaliza y compiten
 * como las demás. Una captura de pantalla o un documento no son cuestión de
 * grado: no son una fotografía de lo que ocurrió, y animar una captura de un
 * chat como escena de un Reel institucional es peor que entregar una escena
 * menos. Ésas se descartan y se DICE con su motivo.
 */
const NO_SE_PUDO_LEER = 'no se pudo leer';
export const NOT_A_PHOTO_NOTES = ['es una captura de pantalla', 'es un documento'];
const notAPhoto = (m) => NOT_A_PHOTO_NOTES.includes(String(m?.coverNote ?? '').trim());

export const classifyAssets = (files = []) => {
    const buckets = Object.fromEntries(ASSET_KINDS.map(k => [k, []]));
    const invalid = [];
    for (const f of arr(files)) {
        const kind = ASSET_KINDS.includes(f?.kind) ? f.kind : 'other';
        buckets[kind].push(f);
        // «no se pudo leer» vivía en `excludedReason` y desde v4.1009 vive en
        // `coverNote`; se miran los dos, porque una fila anterior conserva el
        // suyo donde estaba.
        if (f?.unreadable || f?.excludedReason === NO_SE_PUDO_LEER || f?.coverNote === NO_SE_PUDO_LEER) invalid.push(f);
    }
    const usableImages = buckets.image.filter(f => !f?.unreadable);
    const images = usableImages.length;
    const videos = buckets.video.length;

    let mode = 'image_reel';
    if (videos > images) mode = 'video_reel';

    return {
        counts: Object.fromEntries(ASSET_KINDS.map(k => [k, buckets[k].length])),
        images, videos,
        usableImages: images,
        invalid: invalid.length,
        contentMode: mode,
        available: CONTENT_MODES[mode].available,
        reason: CONTENT_MODES[mode].help,
    };
};

/** ¿Se puede armar el Reel con este material? Devuelve el motivo si no. */
export const checkReelReady = (classification = {}, { min = MIN_SCENE_COUNT } = {}) => {
    const errors = [];
    const warnings = [];
    if (!classification.available) {
        errors.push(CONTENT_MODES[classification.contentMode]?.help || 'Este material todavía no se puede convertir en Reel.');
        return { ok: false, errors, warnings };
    }
    if (num(classification.images) < min) {
        errors.push(
            `Hacen falta al menos ${min} fotografías legibles para armar un Reel y hay ${num(classification.images)}.`
        );
    }
    if (num(classification.invalid) > 0) {
        warnings.push(`${classification.invalid} archivo(s) no se pudieron leer y quedaron fuera.`);
    }
    if (num(classification.videos) > 0) {
        warnings.push(
            `La solicitud trae ${classification.videos} video(s): no entran en esta pieza, que se arma con las fotografías.`
        );
    }
    return { ok: errors.length === 0, errors, warnings };
};

// ─── Selección inteligente de hasta cinco fotografías ──────────────────────
//
// ⚠️ NO SE VUELVE A ANALIZAR NADA. El workflow del artículo ya midió cada foto
// con sharp (nitidez, brillo, resolución), ya la describió con el modelo de
// visión (rol, qué se ve, si hay personas) y ya marcó los duplicados por dHash,
// y lo guardó en `SubmissionArticleMedia`. Volver a mirarlas serían N llamadas
// de visión para saber lo mismo. Esta función CONSUME ese análisis.
//
// El precio de esa decisión está dicho: sin artículo generado no hay análisis,
// y entonces la selección cae al criterio por orden con la nota puesta. Es
// degradar, no bloquear.

export const MAX_REEL_IMAGES = MAX_SCENE_COUNT;   // 5
export const MIN_REEL_IMAGES = MIN_SCENE_COUNT;   // 3

// Qué cuenta cada posición. Es la estructura narrativa que pidió el pedido, y
// el orden en que se buscan los roles que el modelo de visión ya asignó.
export const STORY_SLOTS = {
    3: ['contexto', 'personas', 'cierre'],
    4: ['contexto', 'personas', 'accion', 'cierre'],
    5: ['contexto', 'personas', 'accion', 'resultado', 'cierre'],
};

// Cómo se reconoce cada función en lo que el modelo de visión describió. Es un
// mapa de PISTAS, no una clasificación nueva: `SubmissionArticleMedia.role` ya
// trae `portada|apoyo|secundaria|detalle|grupo|…` según lo que vio.
const SLOT_HINTS = {
    contexto:  { roles: ['portada', 'general', 'contexto', 'apertura'], prefer: 'wide' },
    personas:  { roles: ['grupo', 'personas', 'retrato', 'apoyo'],      prefer: 'people' },
    accion:    { roles: ['accion', 'detalle', 'apoyo'],                 prefer: 'people' },
    resultado: { roles: ['detalle', 'resultado', 'entrega', 'apoyo'],   prefer: 'any' },
    cierre:    { roles: ['grupo', 'institucional', 'marca', 'portada'], prefer: 'brand' },
};
export const STORY_SLOT_LABELS = {
    contexto: 'Contexto', personas: 'Personas', accion: 'Acción',
    resultado: 'Resultado', cierre: 'Cierre',
};

/** Cuántas fotos entran: hasta cinco, nunca más, y sólo las que hay. */
export const targetImageCount = (disponibles) => {
    const n = num(disponibles, 0);
    if (n <= 0) return 0;
    return Math.max(0, Math.min(MAX_REEL_IMAGES, n));
};

const peopleIn = (m) => {
    const v = m?.vision || {};
    if (typeof v.people === 'number') return v.people;
    if (typeof v.personCount === 'number') return v.personCount;
    return v.hasPeople ? 1 : 0;
};
const hasBrand = (m) => Boolean(m?.vision?.hasBrand || m?.vision?.brand || m?.vision?.hasText);

/**
 * Cuánto aporta una foto a una posición concreta. Es un DESEMPATE sobre el
 * puntaje de calidad que el artículo ya calculó, no una segunda nota: la
 * calidad manda, y esto decide entre dos fotos igual de buenas cuál cuenta
 * mejor lo que a esa escena le toca.
 */
const slotAffinity = (m, slot) => {
    const hint = SLOT_HINTS[slot];
    if (!hint) return 0;
    let bonus = 0;
    const role = String(m?.role || '').toLowerCase();
    if (hint.roles.some(r => role.includes(r))) bonus += 12;
    const gente = peopleIn(m);
    if (hint.prefer === 'people' && gente >= 2) bonus += 10;
    if (hint.prefer === 'people' && gente === 1) bonus += 5;
    if (hint.prefer === 'brand' && hasBrand(m)) bonus += 10;
    if (hint.prefer === 'wide' && gente <= 2) bonus += 4;
    return bonus;
};

/**
 * Elige hasta cinco fotografías que cuenten una historia.
 *
 * TRES reglas y el orden importa:
 *
 *   1. NUNCA UNA FOTO QUE UNA PERSONA DEJÓ FUERA, NI UN DUPLICADO, NI LO QUE
 *      NO ES UNA FOTOGRAFÍA. `excluded` es la decisión de una persona y manda;
 *      `coverNote` trae el motivo automático y sólo descalifica cuando no es
 *      cuestión de grado (ver NOT_A_PHOTO_NOTES). Un duplicado en un Reel de
 *      cinco escenas es la quinta parte de la pieza contando dos veces lo
 *      mismo.
 *   2. DIVERSIDAD ANTES QUE PUNTAJE. Se recorre POSICIÓN por posición y cada
 *      una se lleva la mejor foto para SU función, no las cinco mejores del
 *      montón: cinco fotos casi iguales tienen cinco puntajes altísimos y no
 *      cuentan ninguna historia, que es justo lo que el pedido prohíbe.
 *   3. NUNCA SE INVENTA UNA FOTO. Con menos de las que caben, se usan las que
 *      hay y la estructura se acorta a esa cantidad.
 *
 * Devuelve la selección Y las descartadas con su motivo: un descarte silencioso
 * deja al usuario mirando una selección sin saber por qué falta la foto que
 * esperaba (regla de `skipped` en los centros de acopio).
 */
export const selectStoryImages = (media = [], { max = MAX_REEL_IMAGES } = {}) => {
    const candidatas = arr(media)
        .filter(m => m?.kind === 'image')
        .map(m => ({
            ...m,
            score: num(m?.score, 0),
            duplicateOf: m?.analysis?.measured?.duplicateOf || m?.duplicateOf || null,
            vision: m?.analysis?.vision || m?.vision || null,
        }));

    const descartadas = [];
    const vistos = new Set();
    const utiles = [];
    for (const m of candidatas) {
        if (m.excluded) { descartadas.push({ fileId: m.fileId, reason: m.excludedReason || 'lo dejó fuera una persona' }); continue; }
        if (notAPhoto(m)) { descartadas.push({ fileId: m.fileId, reason: m.coverNote }); continue; }
        if (m.duplicateOf) { descartadas.push({ fileId: m.fileId, reason: 'es prácticamente igual a otra fotografía' }); continue; }
        // El duplicado se marca en UNA de las dos y no siempre en la misma: se
        // guarda también el hash visto, para que dos fotos idénticas que nadie
        // marcó no entren las dos.
        const huella = m?.analysis?.measured?.hash || null;
        if (huella && vistos.has(huella)) { descartadas.push({ fileId: m.fileId, reason: 'es prácticamente igual a otra fotografía' }); continue; }
        if (huella) vistos.add(huella);
        utiles.push(m);
    }

    const cuantas = Math.min(targetImageCount(utiles.length), max);
    if (cuantas < MIN_REEL_IMAGES) {
        return { selection: [], discarded: descartadas, usable: utiles.length, enough: false };
    }

    const slots = STORY_SLOTS[cuantas] || STORY_SLOTS[MAX_REEL_IMAGES].slice(0, cuantas);
    const libres = [...utiles];
    const elegidas = [];

    for (const slot of slots) {
        let mejor = null;
        let mejorPeso = -Infinity;
        for (const m of libres) {
            // El puntaje del artículo es la base; la afinidad con la posición
            // desempata. Sumarlos y no multiplicarlos es deliberado: una foto
            // floja no gana una posición por encajar en su rol.
            const peso = m.score + slotAffinity(m, slot);
            if (peso > mejorPeso) { mejorPeso = peso; mejor = m; }
        }
        if (!mejor) break;
        libres.splice(libres.indexOf(mejor), 1);
        elegidas.push({
            fileId: mejor.fileId,
            slot,
            slotLabel: STORY_SLOT_LABELS[slot] || slot,
            score: mejor.score,
            reason: `${STORY_SLOT_LABELS[slot] || slot}: ${mejor.vision?.caption || mejor.role || 'la mejor disponible para esta parte'}`,
        });
    }

    for (const m of libres) {
        descartadas.push({ fileId: m.fileId, reason: 'no entró: el Reel se arma con cinco fotografías como máximo' });
    }

    return { selection: elegidas, discarded: descartadas, usable: utiles.length, enough: true };
};

/**
 * La selección que MANDA. La manual reemplaza a la automática, entera.
 *
 * Lo que llega del navegador es una lista de `fileId` y nada más: el orden, la
 * función narrativa y el resto se derivan acá. Un id que no pertenezca a esta
 * solicitud NO se puede expresar —se filtra contra el material real—, que es la
 * frontera estructural de siempre: lo que no se puede pedir no se puede pedir.
 */
export const applyManualSelection = (media = [], fileIds = []) => {
    const validos = new Map(arr(media).filter(m => m?.kind === 'image').map(m => [m.fileId, m]));
    const vistos = new Set();
    const elegidas = [];
    const rechazados = [];
    for (const id of arr(fileIds).map(String)) {
        if (!validos.has(id)) { rechazados.push({ fileId: id, reason: 'no es una fotografía de esta solicitud' }); continue; }
        if (vistos.has(id)) { rechazados.push({ fileId: id, reason: 'estaba repetida en la selección' }); continue; }
        if (elegidas.length >= MAX_REEL_IMAGES) { rechazados.push({ fileId: id, reason: `el Reel admite ${MAX_REEL_IMAGES} fotografías como máximo` }); continue; }
        vistos.add(id);
        elegidas.push(id);
    }
    const slots = STORY_SLOTS[elegidas.length] || [];
    return {
        ok: elegidas.length >= MIN_REEL_IMAGES && elegidas.length <= MAX_REEL_IMAGES,
        error: elegidas.length < MIN_REEL_IMAGES
            ? `El Reel se arma con entre ${MIN_REEL_IMAGES} y ${MAX_REEL_IMAGES} fotografías, y quedaron ${elegidas.length}.`
            : null,
        selection: elegidas.map((fileId, i) => {
            const m = validos.get(fileId);
            const slot = slots[i] || 'libre';
            return {
                fileId, slot,
                slotLabel: STORY_SLOT_LABELS[slot] || 'Libre',
                score: num(m?.score, 0),
                reason: 'elegida a mano',
            };
        }),
        rejected: rechazados,
    };
};

// ─── El storyboard ─────────────────────────────────────────────────────────

export const STORYBOARD_MAX_LINE = 180;

/**
 * El brief que recibe el modelo. TODO el contexto de la solicitud, y lo que NO
 * se sabe DICHO — un hueco en silencio es una invitación a que lo llene (la
 * lección de la Campaña de Emergencia, v4.783, y de v4.967).
 *
 * El artículo generado entra como contexto editorial y se DICE que es para
 * sintetizar, no para copiar: un Reel que lee un artículo en voz alta no es un
 * Reel. Es el punto 7 del pedido.
 */
export const buildStoryboardBrief = ({
    submission = {}, campaign = null, article = null, siteName = '',
    selection = [], mediaById = new Map(), durationSec = 20,
} = {}) => {
    const L = [];
    L.push('ACTIVIDAD SOBRE LA QUE TRATA ESTE REEL (lo único que podés afirmar):');
    L.push(`· Título: ${str(submission.title) || '(no suministrado)'}`);
    L.push(`· Qué ocurrió: ${str(submission.description, 1200) || '(no suministrado)'}`);
    if (str(submission.story, 1500)) L.push(`· Relato de quien lo envió: ${str(submission.story, 1500)}`);
    L.push(`· Club: ${str(submission.club) || '(no suministrado)'}`);
    if (str(submission.participatingClubs)) L.push(`· Clubes participantes: ${str(submission.participatingClubs)}`);
    L.push(`· Lugar: ${[str(submission.location), str(submission.city)].filter(Boolean).join(', ') || '(no suministrado)'}`);
    L.push(`· Fecha: ${str(submission.activityDateLabel) || str(submission.activityDate) || '(no suministrada)'}`);
    if (str(submission.district)) L.push(`· Distrito: ${str(submission.district)}`);
    if (campaign?.name) L.push(`· Campaña: ${str(campaign.name)}`);
    if (str(submission.extra, 1200)) L.push(`· Información adicional: ${str(submission.extra, 1200)}`);
    if (siteName) L.push(`· Publica: ${str(siteName)}`);

    if (article?.title || article?.excerpt) {
        L.push('');
        L.push('ARTÍCULO YA PUBLICADO SOBRE ESTO (usalo como contexto, NO lo copies:');
        L.push('el Reel es más breve, más visual y más emocional que un artículo):');
        if (article.title) L.push(`· Titular: ${str(article.title, 200)}`);
        if (article.excerpt) L.push(`· Entrada: ${str(article.excerpt, 600)}`);
    }

    L.push('');
    L.push(`LAS ${selection.length} FOTOGRAFÍAS, en el orden en que van a aparecer:`);
    selection.forEach((s, i) => {
        const m = mediaById.get(s.fileId) || {};
        const v = m?.analysis?.vision || m?.vision || {};
        const visto = str(v.caption || v.description || v.alt, 200) || 'sin descripción';
        L.push(`  ${i + 1}. [${s.slotLabel}] ${visto}`);
    });

    L.push('');
    L.push(`El Reel dura unos ${Math.round(num(durationSec, 20))} segundos en total.`);
    return L.join('\n');
};

export const STORYBOARD_SYSTEM = [
    'Sos quien dirige piezas cortas para redes de una organización de servicio (Rotary).',
    'Escribís el storyboard de un Reel vertical a partir de fotografías reales de una actividad que YA ocurrió.',
    '',
    'Cómo se cuenta:',
    '· Una idea por escena. La primera tiene que enganchar en los dos primeros segundos.',
    '· Lenguaje breve, visual y humano. Se lee en voz alta, no se lee en una pantalla.',
    '· Sin jerga institucional vacía, sin superlativos y sin dramatismo.',
    '· Las personas se muestran con dignidad: son protagonistas, no ilustraciones de una carencia.',
    '',
    'Lo que NO podés hacer, en ningún caso:',
    '· Inventar cifras, fechas, lugares, nombres, cargos o entidades que no estén en el brief.',
    '· Atribuir declaraciones a nadie.',
    '· Afirmar resultados que el brief no menciona.',
    'Si un dato no está, se cuenta sin ese dato.',
].join('\n');

/**
 * Lee lo que el modelo devolvió. EL MODELO ESCRIBE Y EL CÓDIGO DECIDE: se
 * exige una línea por escena, se recorta lo que se pase y se descarta lo que no
 * tenga forma. Un storyboard con menos escenas que fotos no sirve, porque cada
 * foto es una escena y no hay relleno.
 */
export const parseStoryboard = (raw, expected) => {
    const data = typeof raw === 'string' ? safeJson(raw) : raw;
    const escenas = arr(data?.scenes).slice(0, expected).map((s, i) => ({
        index: i,
        beat: str(s?.beat || s?.slot, 40) || null,
        line: str(s?.line || s?.text || s?.caption, STORYBOARD_MAX_LINE),
        motion: str(s?.motion, 200) || null,
    })).filter(s => s.line);

    if (escenas.length !== expected) {
        return {
            ok: false,
            error: `El storyboard llegó con ${escenas.length} escena(s) y hacen falta ${expected}: una por fotografía.`,
            scenes: escenas,
        };
    }
    return {
        ok: true,
        error: null,
        scenes: escenas,
        hook: str(data?.hook, 200) || escenas[0]?.line || '',
        closing: str(data?.closing, 200) || escenas[escenas.length - 1]?.line || '',
        cta: str(data?.cta, 120) || '',
        summary: str(data?.summary, 400) || '',
    };
};

const safeJson = (t) => {
    try { return JSON.parse(String(t).replace(/^```(?:json)?|```$/g, '').trim()); } catch { return null; }
};

/**
 * Comprueba que el storyboard no afirme nada que la solicitud no dijo.
 *
 * Es la capa 3 de siempre —el CÓDIGO decide— con el MISMO validador de la
 * Campaña de Emergencia y del Generador de Publicaciones. Un segundo validador
 * de cifras se separaría del primero.
 */
export const checkStoryboardFacts = (storyboard = {}, universe = {}) => {
    const issues = [];
    const partes = [
        ['hook', storyboard.hook], ['cierre', storyboard.closing], ['llamado', storyboard.cta],
        ...arr(storyboard.scenes).map((s, i) => [`escena ${i + 1}`, s.line]),
    ];
    for (const [campo, texto] of partes) {
        if (!str(texto)) continue;
        const r = validateEmergencyCopy(texto, universe, { field: campo });
        for (const i of r.issues) issues.push(`[${campo}] ${i}`);
    }
    return { ok: issues.length === 0, issues };
};

// ─── La cláusula de datos de esta pieza ────────────────────────────────────
//
// ⚠️ NO ES `EMERGENCY_FACT_CLAUSE`, y la distinción es la regla de v4.967: esa
// cláusula habla de un desastre real y de personas afectadas, y aplicada a la
// entrega de un mercado o a una jornada de salud describe una situación que no
// existe. A un modelo al que se le describe mal la situación escribe mal.
//
// Lo que NO cambia es la regla de fondo ni el validador.
export const SUBMISSION_FACT_CLAUSE = [
    'CONTEXTO INSTITUCIONAL REAL — REGLAS ABSOLUTAS SOBRE LOS DATOS:',
    '· Esta pieza cuenta una actividad que un club de Rotary realizó de verdad. Lo que afirme se publica firmado por la institución.',
    '· NO inventes cifras, cantidades, porcentajes ni número de beneficiarios. Si no te dieron el número, contalo sin cuantificar.',
    '· NO inventes fechas, ciudades, barrios, entidades aliadas ni nombres de personas.',
    '· NO atribuyas declaraciones a nadie: si no hay una cita textual en el brief, no hay cita.',
    '· NO uses cuantificadores vagos («miles de», «la mayoría de», «incontables») para rellenar lo que no sabés.',
    '· NO cites fuentes («según reportes», «las autoridades informaron»): acá la fuente es el propio club.',
    '· Lo que el brief marca como «(no suministrado)» NO se completa: se escribe la pieza sin ese dato.',
].join('\n');

/** La guardia de datos completa que viaja al motor de Reels (`reelFacts.js`). */
export const reelFactGuard = ({ universe, brief }) => ({
    clause: SUBMISSION_FACT_CLAUSE,
    brief: str(brief, 6000) || null,
    universe,
});

// ─── Créditos ──────────────────────────────────────────────────────────────
//
// Es el medidor PROPIO del módulo de Reels, no el saldo del proveedor, y se
// dice así en la pantalla. Sirve para que quien pulsa «Generar» sepa qué va a
// gastar ANTES de gastarlo (punto 25 del pedido).
export const estimateReelCredits = ({ sceneCount = 0, creditsPerScene = 20, expansions = 0, creditsPerExpansion = 4 } = {}) => {
    const escenas = num(sceneCount, 0) * num(creditsPerScene, 20);
    const lienzos = num(expansions, 0) * num(creditsPerExpansion, 4);
    return {
        scenes: escenas, expansions: lienzos, total: escenas + lienzos,
        perScene: num(creditsPerScene, 20), perExpansion: num(creditsPerExpansion, 4),
        sceneCount: num(sceneCount, 0), expansionCount: num(expansions, 0),
    };
};

// ─── Versiones ─────────────────────────────────────────────────────────────
//
// Una regeneración importante crea una versión NUEVA (v1, v2, v3…) y NO
// duplica los archivos originales: la selección apunta a los mismos `fileId` de
// la solicitud. Duplicar los assets daría dos verdades sobre la misma foto.
export const nextVersionNumber = (versions = []) =>
    Math.max(0, ...arr(versions).map(v => num(v?.versionNumber, 0))) + 1;

export const describeVersion = (n) => `v${Math.max(1, num(n, 1))}`;

// ════════════════════════════════════════════════════════════════════════════
// PREPARAR REEL — el criterio de la etapa que NO gasta (v4.1012)
//
// «Generar Reel» dejó de significar «consumir créditos». Significa «abrir el
// asistente». Todo lo que sigue decide qué se le va a pedir al motor, y nada de
// esto llama a ningún proveedor de video: se resuelve con lo que el análisis
// del artículo ya midió y con la aritmética del reparto de duraciones.
//
// ⚠️ TODO ES PURO. Recibe el material y devuelve el plan resuelto; no lee el
// reloj, no consulta la base y no llama a nadie. Por eso se puede probar entero
// sin credenciales, que es lo que hace que la puerta del gasto sea comprobable.
// ════════════════════════════════════════════════════════════════════════════

const round2 = (n) => Number(Number(n).toFixed(2));
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// ─── Duración ──────────────────────────────────────────────────────────────
//
// Las cuatro del pedido. Son un OBJETIVO, no una promesa: lo que la pieza dura
// de verdad depende de cuántas escenas tenga y de qué clips sabe entregar el
// motor, y eso se RESUELVE y se DICE (`resolveReelTiming`).
export const REEL_DURATIONS = [15, 20, 25, 30];
export const DEFAULT_REEL_DURATION = 20;
export const MIN_REEL_DURATION = REEL_DURATIONS[0];
export const MAX_REEL_DURATION = REEL_DURATIONS[REEL_DURATIONS.length - 1];

/** Lo que se comen los fundidos. El mismo valor que usa `distributeDurations`. */
export const overlapFor = (transition, sceneCount) =>
    round2(Math.max(0, num(sceneCount, 0) - 1) * (TRANSITIONS[transition]?.overlap ?? TRANSITION_OVERLAP_SEC));

/**
 * El techo REAL por escena.
 *
 * ⚠️ NO ES `MAX_SCENE_SEC` A SECAS, y ésta es la restricción de la que cuelga
 * todo lo demás de esta sección. Pedirle 5,4 s a un motor que entrega 5 o 10
 * obliga a generar un clip de 10 para usar la mitad: el doble de espera y, en
 * el proveedor, el doble de costo. Es la regla del sitio desde v4.669 y NO se
 * afloja acá — lo que se hace es DECIR qué duración sale de verdad.
 *
 * Con Kling (`[5, 10]`) el techo es 5, así que cinco escenas dan como mucho
 * 25 − 2 de fundidos = 23 s. Está medido y escrito en el propio preset.
 */
export const sceneCeilingFor = (engineDurations = null) => {
    const enRango = arr(engineDurations).filter(d => Number.isFinite(d) && d >= MIN_SCENE_SEC && d <= MAX_SCENE_SEC);
    return Math.max(MIN_SCENE_SEC, enRango.length ? Math.max(...enRango) : MAX_SCENE_SEC);
};

/** El rango de duración total que ESTE material puede dar de verdad. */
export const durationRangeFor = ({ sceneCount = 0, engineDurations = null, transition = 'fade' } = {}) => {
    const n = num(sceneCount, 0);
    const overlap = overlapFor(transition, n);
    const ceiling = sceneCeilingFor(engineDurations);
    return {
        min: round2(Math.max(0, n * MIN_SCENE_SEC - overlap)),
        max: round2(Math.max(0, n * ceiling - overlap)),
        overlap, ceiling, floor: MIN_SCENE_SEC, sceneCount: n,
    };
};

/**
 * La duración resuelta: qué se pidió, qué se puede dar y por qué.
 *
 * `perScene` opcional es la edición MANUAL del punto «modificar la duración de
 * cada escena». Se acota escena por escena al rango real y se DICE lo que se
 * corrigió — un ajuste silencioso convierte «lo configuré así» en una
 * afirmación falsa.
 */
export const resolveReelTiming = ({
    targetSec = DEFAULT_REEL_DURATION, sceneCount = 0, engineDurations = null,
    transition = 'fade', perScene = null,
} = {}) => {
    const n = num(sceneCount, 0);
    const rango = durationRangeFor({ sceneCount: n, engineDurations, transition });
    const notes = [];

    if (n <= 0) {
        return { ok: false, sceneCount: 0, targetSec: num(targetSec, DEFAULT_REEL_DURATION), perScene: [], clips: [], finalSec: 0, range: rango, notes: ['Todavía no hay fotografías elegidas.'], adjusted: false, reachable: false };
    }

    const pedida = clamp(num(targetSec, DEFAULT_REEL_DURATION), MIN_REEL_DURATION, MAX_REEL_DURATION);
    const alcanzable = pedida >= rango.min - 0.05 && pedida <= rango.max + 0.05;

    let duraciones;
    let manual = false;
    const manualIn = arr(perScene).map(v => num(v, 0));
    if (manualIn.length === n && manualIn.every(v => v > 0)) {
        manual = true;
        duraciones = manualIn.map(v => round2(clamp(v, MIN_SCENE_SEC, rango.ceiling)));
        const corregidas = duraciones.filter((d, i) => Math.abs(d - manualIn[i]) > 0.05).length;
        if (corregidas) {
            notes.push(
                `${corregidas} escena(s) se acotaron al rango que el motor puede entregar (${MIN_SCENE_SEC}–${rango.ceiling} s por escena).`
            );
        }
    } else {
        // Reparto parejo sobre el presupuesto CON los fundidos compensados, que
        // es exactamente lo que hace `distributeDurations`: si se repartiera el
        // total a secas, la pieza montada saldría corta por el solapamiento.
        const presupuesto = pedida + rango.overlap;
        duraciones = Array.from({ length: n }, () => round2(clamp(presupuesto / n, MIN_SCENE_SEC, rango.ceiling)));
    }

    const total = round2(duraciones.reduce((a, b) => a + b, 0));
    const finalSec = round2(total - rango.overlap);

    // Lo que el motor va a GENERAR de verdad para cada escena. Sobrar lo recorta
    // el montaje —decisión de edición declarada—; faltar dejaría un hueco negro.
    const clips = duraciones.map(d => nearestEngineClip(d, engineDurations));
    const largos = clips.filter((c, i) => c > duraciones[i] + 0.05).length;

    if (!alcanzable) {
        notes.push(
            pedida > rango.max
                ? `Con ${n} fotografía(s) el Reel llega como mucho a ${rango.max} s: el motor entrega clips de hasta ${rango.ceiling} s por escena y los fundidos solapan ${rango.overlap} s. Para acercarse a ${pedida} s hacen falta más fotografías.`
                : `Con ${n} fotografía(s) el Reel dura al menos ${rango.min} s: ninguna escena baja de ${MIN_SCENE_SEC} s. Para acercarse a ${pedida} s hay que quitar fotografías.`
        );
    } else if (Math.abs(finalSec - pedida) > 0.6) {
        notes.push(`La pieza va a durar ${finalSec} s y no ${pedida} s exactos: los fundidos solapan ${rango.overlap} s.`);
    }
    if (largos) {
        notes.push(
            `${largos} escena(s) piden más de lo que el motor entrega de una vez: va a generar clips más largos y el montaje recorta. Tarda más y en el proveedor cuesta más, aunque el medidor propio cuente lo mismo.`
        );
    }

    return {
        ok: true, sceneCount: n,
        targetSec: pedida, reachable: alcanzable,
        perScene: duraciones, clips,
        totalRequested: total, finalSec,
        range: rango, manual, adjusted: notes.length > 0, notes,
    };
};

const nearestEngineClip = (want, engineDurations) => {
    const ds = arr(engineDurations).filter(d => Number.isFinite(d) && d > 0);
    if (!ds.length) return round2(want);
    const arriba = ds.filter(d => d >= want - 0.01).sort((a, b) => a - b);
    return arriba.length ? arriba[0] : Math.max(...ds);
};

/**
 * Las cuatro opciones, cada una RESUELTA contra este material.
 *
 * ⚠️ UNA OPCIÓN QUE NO SE PUEDE CUMPLIR SE OFRECE MARCADA, NO SE ESCONDE. Un
 * desplegable con dos valores hace pensar que el módulo no admite más; uno con
 * los cuatro y dos marcados dice qué falta para llegar ahí — que es lo que
 * alguien necesita para decidir si agrega una fotografía.
 */
export const durationOptionsFor = ({ sceneCount = 0, engineDurations = null, transition = 'fade' } = {}) => {
    const rango = durationRangeFor({ sceneCount, engineDurations, transition });
    const ops = REEL_DURATIONS.map(sec => {
        const t = resolveReelTiming({ targetSec: sec, sceneCount, engineDurations, transition });
        return {
            sec, label: `${sec} s`,
            available: Boolean(t.ok && t.reachable),
            finalSec: t.finalSec,
            perSceneSec: t.perScene[0] ?? null,
            note: t.reachable ? null : (t.notes[0] || null),
            recommended: sec === DEFAULT_REEL_DURATION,
        };
    });

    // ⚠️ SIEMPRE TIENE QUE QUEDAR UNA ELEGIBLE, y no es una concesión: con tres
    // fotografías y el motor real el rango es 11–14 s, así que NINGUNA de las
    // cuatro se alcanza y el selector salía entero deshabilitado. Un control
    // donde no se puede elegir nada no se lee como un límite: se lee como que
    // el módulo está roto, y deja sin salida a quien sólo tiene tres fotos.
    //
    // Se habilita la MÁS CERCANA al rango posible, con su duración real dicha
    // al lado. Lo que no se hace es callar el número: el objetivo sigue siendo
    // el que se eligió y la pieza dura lo que dura.
    if (sceneCount > 0 && !ops.some(o => o.available)) {
        let mejor = ops[0];
        let menor = Infinity;
        for (const o of ops) {
            const d = Math.abs(o.sec - clamp(o.sec, rango.min, rango.max));
            if (d < menor) { menor = d; mejor = o; }
        }
        mejor.available = true;
        mejor.note = `Con ${sceneCount} fotografía(s) la pieza dura ${mejor.finalSec} s: es el máximo que este material da. Para llegar a más segundos hacen falta más fotografías.`;
    }
    return ops;
};

/**
 * La duración por defecto para ESTE material: la recomendada si se puede, y si
 * no la alcanzable más cercana. Nunca deja el asistente abierto en un valor que
 * el motor no puede dar.
 */
export const defaultDurationFor = ({ sceneCount = 0, engineDurations = null, transition = 'fade' } = {}) => {
    const ops = durationOptionsFor({ sceneCount, engineDurations, transition });
    const recomendada = ops.find(o => o.sec === DEFAULT_REEL_DURATION);
    if (recomendada?.available) return DEFAULT_REEL_DURATION;
    const posibles = ops.filter(o => o.available);
    if (posibles.length) {
        return posibles.reduce((mejor, o) =>
            Math.abs(o.sec - DEFAULT_REEL_DURATION) < Math.abs(mejor.sec - DEFAULT_REEL_DURATION) ? o : mejor
        ).sec;
    }
    return DEFAULT_REEL_DURATION;
};

// ─── Orden narrativo ───────────────────────────────────────────────────────

/**
 * El orden que propone la IA: contexto → personas → acción → resultado → cierre.
 *
 * ⚠️ NO CUESTA NI UNA LLAMADA A NINGÚN MODELO, y es a propósito. La función
 * narrativa de cada fotografía la decidió `selectStoryImages` con el análisis
 * que el artículo ya pagó; ordenar es leer ese dato. Pedirle a un modelo que
 * reordene cinco fotos daría un resultado distinto en cada pulsación —no
 * reproducible— y costaría una llamada de visión por vuelta para saber lo que
 * ya está escrito en la fila.
 */
const SLOT_ORDER = ['contexto', 'personas', 'accion', 'resultado', 'cierre', 'libre'];

export const orderSelectionNarrative = (items = []) => {
    const lista = arr(items);
    const ordenadas = [...lista].sort((a, b) => {
        const ia = SLOT_ORDER.indexOf(String(a?.slot || 'libre'));
        const ib = SLOT_ORDER.indexOf(String(b?.slot || 'libre'));
        if (ia !== ib) return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
        // A igualdad de función manda la nota del análisis, y a igualdad de las
        // dos el orden en que ya estaban: dos pulsaciones seguidas no pueden
        // devolver órdenes distintos.
        const sa = num(a?.score, 0), sb = num(b?.score, 0);
        if (sa !== sb) return sb - sa;
        return lista.indexOf(a) - lista.indexOf(b);
    });
    const cambio = ordenadas.some((it, i) => it?.fileId !== lista[i]?.fileId);
    return { items: ordenadas, changed: cambio };
};

/**
 * El orden MANUAL (arrastrar y soltar). Lo que llega del navegador es una lista
 * de `fileId`: se reordena lo que ya está elegido y no se puede meter nada que
 * no estuviera — la frontera estructural de siempre.
 */
export const applySelectionOrder = (items = [], fileIds = []) => {
    const porId = new Map(arr(items).map(i => [String(i?.fileId), i]));
    const ordenadas = [];
    for (const id of arr(fileIds).map(String)) {
        const it = porId.get(id);
        if (it && !ordenadas.includes(it)) ordenadas.push(it);
    }
    // Lo que el navegador no nombró conserva su sitio al final: perder una foto
    // elegida por un arrastre a medias sería peor que un orden imperfecto.
    for (const it of arr(items)) if (!ordenadas.includes(it)) ordenadas.push(it);
    return ordenadas;
};

/** Reasigna la función narrativa según la POSICIÓN, después de reordenar. */
export const reslotSelection = (items = []) => {
    const lista = arr(items);
    const slots = STORY_SLOTS[lista.length] || [];
    return lista.map((it, i) => {
        const slot = slots[i] || 'libre';
        return { ...it, slot, slotLabel: STORY_SLOT_LABELS[slot] || 'Libre' };
    });
};

// ─── Voz en off ────────────────────────────────────────────────────────────
//
// Las tres del pedido. `manual` es la que hace verdadera la promesa de «leer y
// editar el texto antes de consumir créditos de voz»: el guion viaja en el plan
// y `produceNarration` lo usa como `scriptOverride`, así que el motor no
// reescribe lo que una persona aprobó.
export const NARRATION_MODES = {
    auto:   { id: 'auto',   label: 'Automática con IA', help: 'La plataforma escribe el guion, lo mide contra la duración real de la pieza y lo ajusta hasta que entra.' },
    manual: { id: 'manual', label: 'Editar guion',      help: 'Se usa el texto que escribas, tal cual. No se reescribe ni se recorta para que entre: si sobra, se acelera hasta un 4 % y el resto se resuelve con silencio.' },
    none:   { id: 'none',   label: 'Sin voz',           help: 'La pieza sale sólo con música. No se gasta ni un carácter de síntesis.' },
};
export const DEFAULT_NARRATION_MODE = 'auto';
export const NARRATION_SCRIPT_MAX = 1200;

// ─── Música ────────────────────────────────────────────────────────────────
//
// ⚠️ NO ES UN CATÁLOGO NUEVO: son ids de `MUSIC_STYLES`, el del motor de
// siempre, y de ahí salen sus rótulos. Escribir acá una segunda lista haría que
// la pantalla ofreciera un estilo que el montaje no sabe pedir, y ese fallo es
// mudo — la pieza sale con otra música.
//
// El «emocional» del pedido es `Cálido` en el catálogo de la plataforma: no se
// renombra un estilo que ya está en producción para que coincida con una
// palabra, se dice a qué corresponde.
export const MUSIC_CHOICE_IDS = ['institucional', 'inspirador', 'calido', 'energico', 'natural', 'ceremonial'];
export const MUSIC_NONE = 'none';
export const musicChoices = () => [
    ...MUSIC_CHOICE_IDS
        .filter(id => MUSIC_STYLES[id])
        .map(id => ({ id, label: MUSIC_STYLES[id].label, mood: MUSIC_STYLES[id].mood })),
    { id: MUSIC_NONE, label: 'Sin música', mood: null },
];
export const DEFAULT_MUSIC_CHOICE = 'institucional';

// ─── Texto en pantalla ─────────────────────────────────────────────────────
//
// ⚠️ DECLARADO Y NO DISPONIBLE, con su motivo y con lo que haría falta para
// encenderlo. Componer texto sobre el video rasteriza un SVG con sharp, y eso
// necesita una fuente del SISTEMA: el entorno de Vercel NO TIENE NINGUNA
// instalada, así que cada glifo sale como un cuadrito. Está medido con capturas
// desde v4.794 y por eso el preset `solicitud` nace con `onScreenText: false`.
//
// Ofrecerlo como un interruptor que se puede encender sería prometer una
// integración que no existe y devolver los cuadritos sobre una pieza
// institucional. Se OFRECE APAGADO y se dice por qué, que es lo que permite
// encenderlo el día que la fuente esté resuelta sin tocar nada más.
export const ON_SCREEN_TEXT = {
    available: false,
    reason: 'Los rótulos sobre el video se componen rasterizando texto, y el entorno donde corre la plataforma no tiene ninguna tipografía instalada: cada letra saldría como un cuadrito. Para activarlos hay que empaquetar antes una fuente.',
    alternative: 'El cierre institucional lo cumple la última escena, que es la fotografía con la marca del club.',
};

// ─── El plan ───────────────────────────────────────────────────────────────

// ⚠️ EL PLAN NO GUARDA LAS FOTOS. La selección vive en `selection.items`, con
// su orden y su función narrativa, y ahí se queda: escribir los `fileId`
// también acá daría DOS verdades sobre las mismas fotografías y se
// contradirían en cuanto alguien cambie una desde el otro camino — el error que
// `publicKeyOf` evitó en Plantillas IA. Lo que este documento guarda es lo que
// NADIE MÁS guarda: duración, voz, música y la marca de confirmación.
export const REEL_PLAN_DEFAULTS = () => ({
    durationSec: DEFAULT_REEL_DURATION,
    perScene: null,
    narrationMode: DEFAULT_NARRATION_MODE,
    narrationScript: '',
    music: DEFAULT_MUSIC_CHOICE,
    onScreenText: false,
    confirmedAt: null,
    confirmedBy: null,
    updatedAt: null,
});

/**
 * Sanea lo que llega del navegador contra los catálogos.
 *
 * ⚠️ CATÁLOGOS CERRADOS. Un modo de voz, un estilo de música o una duración que
 * no estén declarados NO se guardan: caen al valor por defecto. Lo que no se
 * puede expresar en la petición no se puede pedir — la frontera estructural del
 * portal de Plantillas IA, aplicada acá a algo que gasta dinero.
 *
 * `onScreenText` se fuerza a `false` mientras la fuente no exista: aceptarlo
 * porque el cuerpo lo mande devolvería los cuadritos.
 */
export const normalizeReelPlan = (raw = {}, previo = {}) => {
    const base = { ...REEL_PLAN_DEFAULTS(), ...(previo || {}) };
    const p = raw || {};
    const modo = NARRATION_MODES[p.narrationMode] ? p.narrationMode : base.narrationMode;
    const musica = [...MUSIC_CHOICE_IDS, MUSIC_NONE].includes(p.music) ? p.music : base.music;
    const duracion = REEL_DURATIONS.includes(num(p.durationSec, 0)) ? num(p.durationSec, 0) : base.durationSec;

    // `undefined` es «no lo toques» y una lista vacía es «vaciá esto»: son dos
    // cosas distintas y confundirlas borra la selección de alguien al guardar
    // otro campo (la regla de v4.877 con el pool registrador).
    const perScene = Array.isArray(p.perScene)
        ? (p.perScene.length ? p.perScene.map(v => round2(clamp(num(v, MIN_SCENE_SEC), MIN_SCENE_SEC, MAX_SCENE_SEC))) : null)
        : (p.perScene === null ? null : base.perScene);

    return {
        ...base,
        durationSec: duracion,
        perScene,
        narrationMode: modo,
        narrationScript: modo === 'manual' ? str(p.narrationScript ?? base.narrationScript, NARRATION_SCRIPT_MAX) : str(base.narrationScript, NARRATION_SCRIPT_MAX),
        music: musica,
        onScreenText: false,
    };
};

/** ¿Está confirmado este plan? Es la puerta del gasto, en una sola pregunta. */
export const planIsConfirmed = (plan) => Boolean(plan && plan.confirmedAt);

/**
 * Lo que se comprueba ANTES de gastar. Devuelve todo lo que falta, no lo
 * primero: obligar a descubrir los errores de a uno es obligar a reintentar.
 */
export const validateReelPlan = (plan = {}, { sceneCount = 0, engineDurations = null, transition = 'fade' } = {}) => {
    const errors = [];
    const warnings = [];
    const n = num(sceneCount, 0);

    if (n < MIN_REEL_IMAGES) {
        errors.push(`El Reel se arma con entre ${MIN_REEL_IMAGES} y ${MAX_REEL_IMAGES} fotografías, y hay ${n} elegida(s).`);
    }
    if (n > MAX_REEL_IMAGES) {
        errors.push(`El Reel admite ${MAX_REEL_IMAGES} fotografías como máximo, y hay ${n} elegida(s).`);
    }
    if (!NARRATION_MODES[plan?.narrationMode]) errors.push('El modo de voz en off no es válido.');
    if (plan?.narrationMode === 'manual' && !str(plan?.narrationScript)) {
        errors.push('Elegiste escribir el guion de la voz y todavía está vacío. Escribilo o cambiá a «Automática con IA».');
    }

    const timing = resolveReelTiming({
        targetSec: plan?.durationSec, sceneCount: n, engineDurations, transition, perScene: plan?.perScene,
    });
    for (const nota of timing.notes) warnings.push(nota);

    if (plan?.onScreenText) {
        warnings.push(ON_SCREEN_TEXT.reason);
    }

    return { ok: errors.length === 0, errors, warnings, timing };
};

/**
 * El «Resumen del Reel» que se ve ANTES de confirmar, resuelto en el SERVIDOR.
 *
 * ⚠️ NO SE COMPONE EN LA PANTALLA. Con dos cálculos, el resumen diría una cosa y
 * el motor haría otra, y lo que se separaría es cuánto se le va a cobrar a
 * alguien — la lección del calendario de la Distribución (v4.864) y del período
 * de la Bóveda (v4.849).
 */
export const summarizeReelPlan = (plan = {}, {
    sceneCount = 0, engineDurations = null, transition = 'fade',
    creditsPerScene = 20, expansions = 0, creditsPerExpansion = 4,
    format = '9:16', engineLabel = null,
} = {}) => {
    const timing = resolveReelTiming({
        targetSec: plan?.durationSec, sceneCount, engineDurations, transition, perScene: plan?.perScene,
    });
    const credits = estimateReelCredits({ sceneCount, creditsPerScene, expansions, creditsPerExpansion });
    const musica = plan?.music === MUSIC_NONE ? null : (MUSIC_STYLES[plan?.music]?.label || null);

    return {
        images: num(sceneCount, 0),
        durationSec: timing.finalSec,
        targetSec: timing.targetSec,
        format,
        scenes: num(sceneCount, 0),
        engineLabel,
        narration: {
            enabled: plan?.narrationMode !== 'none',
            mode: plan?.narrationMode || DEFAULT_NARRATION_MODE,
            label: NARRATION_MODES[plan?.narrationMode]?.label || NARRATION_MODES[DEFAULT_NARRATION_MODE].label,
            hasScript: Boolean(str(plan?.narrationScript)),
        },
        music: { enabled: Boolean(musica), id: plan?.music || MUSIC_NONE, label: musica || 'Sin música' },
        onScreenText: { enabled: false, available: ON_SCREEN_TEXT.available, reason: ON_SCREEN_TEXT.reason },
        credits,
        timing,
        // ⚠️ SE DICE QUE EL MEDIDOR ES PROPIO Y QUE ES PLANO POR ESCENA. Un clip
        // más largo cuesta lo mismo en este contador y no en el proveedor:
        // presentarlo como el costo real sería una afirmación que no se sostiene.
        creditsNote: 'Medidor propio de la plataforma, no el saldo del proveedor. Cuenta por escena, no por segundo.',
    };
};
