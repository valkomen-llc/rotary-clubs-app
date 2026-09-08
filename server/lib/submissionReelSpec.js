// ════════════════════════════════════════════════════════════════════════════
// Solicitud → Reel para redes — el CRITERIO — v4.1006
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
    generando:      { id: 'generando',      label: 'Generando escenas',      order: 40, tone: 'sky',     working: true,  help: 'Las fotografías se están animando. Tarda entre uno y tres minutos.' },
    componiendo:    { id: 'componiendo',    label: 'Componiendo Reel',       order: 50, tone: 'sky',     working: true,  help: 'Se está montando el video con su música y su voz.' },
    borrador_listo: { id: 'borrador_listo', label: 'Borrador listo',         order: 60, tone: 'amber',                   help: 'Hay un Reel para revisar. Nada se publicó.' },
    en_revision:    { id: 'en_revision',    label: 'En revisión',            order: 65, tone: 'amber',                   help: 'Alguien lo está revisando.' },
    aprobado:       { id: 'aprobado',       label: 'Aprobado',               order: 70, tone: 'emerald',                 help: 'Aprobado para publicar. Todavía no salió a ninguna red.' },
    publicado:      { id: 'publicado',      label: 'Publicado',              order: 80, tone: 'blue',                    help: 'Salió a las redes.' },
    descartado:     { id: 'descartado',     label: 'Descartado',             order: 90, tone: 'gray',                    help: 'No se va a publicar. Se conserva con su motivo.' },
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
    borrador_listo: ['en_revision', 'aprobado', 'descartado'],
    en_revision:    ['aprobado', 'descartado', 'borrador_listo'],
    aprobado:       ['publicado', 'en_revision', 'descartado'],
    publicado:      [],
    descartado:     ['borrador_listo'],
    error:          ['recibida'],
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
export const REEL_STAGES = [
    { id: 'material',   label: 'Analizando el material…',      state: 'analizando', optional: false },
    { id: 'seleccion',  label: 'Eligiendo las fotografías…',   state: 'analizando', optional: false },
    { id: 'storyboard', label: 'Armando el storyboard…',       state: 'preparando', optional: false },
    { id: 'proyecto',   label: 'Generando las escenas…',       state: 'generando',  optional: false },
];
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
export const deriveReelWorkflowStatus = (stages = {}) => {
    const pending = [];
    for (const s of REEL_STAGES) {
        const st = stages?.[s.id];
        if (st?.status === 'ok') continue;
        if (st?.status === 'error') {
            if (!s.optional) return { status: 'error', pending, failedStage: s.id, error: st.error || '' };
            pending.push(s.id);
            continue;
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
    return { scenes: escenas, expansions: lienzos, total: escenas + lienzos };
};

// ─── Versiones ─────────────────────────────────────────────────────────────
//
// Una regeneración importante crea una versión NUEVA (v1, v2, v3…) y NO
// duplica los archivos originales: la selección apunta a los mismos `fileId` de
// la solicitud. Duplicar los assets daría dos verdades sobre la misma foto.
export const nextVersionNumber = (versions = []) =>
    Math.max(0, ...arr(versions).map(v => num(v?.versionNumber, 0))) + 1;

export const describeVersion = (n) => `v${Math.max(1, num(n, 1))}`;
