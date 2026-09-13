// ════════════════════════════════════════════════════════════════════
// Generador de Outro IA — Motion Graphics institucional, el CRITERIO
// v4.1035.0
//
// PURO: sin base, sin red, sin ffmpeg, sin sharp. Decide CÓMO se anima una
// imagen institucional sin que ningún modelo la redibuje, y lo hace en
// expresiones de ffmpeg que el renderizador (`outroMotionRender.js`) ejecuta.
//
// POR QUÉ EXISTE (v4.1035). El motor image-to-video (Kling vía KIE) redibuja
// la imagen fotograma a fotograma: en una pieza institucional eso es una
// ocasión por fotograma de deformar el logotipo, la tipografía o el lema — el
// riesgo que este archivo documenta desde v4.647 y que el Creador de Reels
// mide con `checkBrandFidelity`. Para un outro, la composición ES el diseño
// final: no hay nada que inventar. Por eso el motor por defecto pasa a ser
// DETERMINISTA: los píxeles del archivo son los de la imagen, y lo único que
// se añade es MOVIMIENTO —un asentamiento de escala que termina EXACTAMENTE
// en la imagen original, un fundido de entrada y uno de salida—. La última
// parte del clip es la imagen quieta, para que logo y marca se reconozcan.
//
// INVARIANTES (no son texto de un prompt: están en el CÓDIGO y una prueba
// las fija):
//   · La imagen no se reinterpreta: sólo `scale`, `crop`, `pad`, `fps`,
//     `fade`, `setsar` y `format`. Nada de `gblur`, `noise`, `curves`,
//     `colorbalance`, `hue`, `vignette`, `lenscorrection`, `rotate`, `tblend`
//     ni `zoompan` (que remuestrea con su propio interpolador).
//   · La escala TERMINA en 1,0: el fotograma final es la imagen, píxel a
//     píxel salvo la compresión. Un preset que no llegue a 1 se rechaza.
//   · La escala máxima es acotada (`MAX_START_SCALE`): un zoom agresivo
//     recorta el logotipo en los bordes durante el asentamiento.
//   · El asentamiento se completa antes del final (`settleFraction` < 1):
//     hay siempre un tramo quieto al cierre.
//   · Los colores no se tocan: sin corrección, sin LUT, sin gradiente
//     añadido. El relleno de un lienzo que no coincide con el formato es el
//     color de BORDE de la propia imagen, medido, nunca un blur ni un negro.
//
// Los fundidos van sobre negro porque el outro cierra la pieza; en el montaje
// del Reel la última escena cruza por `xfade` sobre los primeros fotogramas,
// así que el fundido de entrada es CORTO (≤ 0,6 s) para que no se lea como un
// corte a negro dentro del Reel.
// ════════════════════════════════════════════════════════════════════

import { OUTRO_FORMATS, DEFAULT_FORMAT, OUTRO_ENGINES, MOTION_PRESETS, DEFAULT_MOTION_PRESET, isMotionPreset, TTS_CREDIT_ESTIMATE, estimateOutroCosts } from './outroSpec.js';

export const MOTION_ENGINE_ID = 'motion';

// Duraciones que se OFRECEN. `Personalizado` se acota al rango y se redondea a
// medio segundo: el motor determinista entrega exactamente lo que se le pide,
// así que a diferencia de Kling no hay que "acercarse" a nada.
export const MOTION_DURATIONS = OUTRO_ENGINES.motion.durations;
export const MOTION_DURATION_RANGE = OUTRO_ENGINES.motion.customDuration;
export const MOTION_DEFAULT_DURATION = 5;
export const MOTION_FPS = 30;

// Techo de la escala inicial. Con 1,08 el borde que queda fuera al arrancar es
// del 8 %: por encima, un logotipo cerca del borde se recorta durante el
// asentamiento — es el "zoom agresivo" prohibido.
export const MAX_START_SCALE = 1.08;

// ─── Presets ───────────────────────────────────────────────────────────────
//
// Los CUATRO presets son DATOS del catálogo (`outroSpec.MOTION_PRESETS`), la
// única fuente de verdad que también lee la UI por `/outros/options`. Acá se
// consumen; no se declara una segunda lista.
export const motionPreset = (id) => MOTION_PRESETS[id] || MOTION_PRESETS[DEFAULT_MOTION_PRESET];
export { MOTION_PRESETS, DEFAULT_MOTION_PRESET, isMotionPreset };

// Filtros de ffmpeg que el grafo puede usar. Es la lista blanca que hace
// verificable "la imagen no se reinterpreta": una prueba recorre el grafo y
// falla si aparece cualquier otro.
export const ALLOWED_FILTERS = ['scale', 'crop', 'pad', 'setsar', 'fps', 'fade', 'format'];

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
const round2 = (v) => Number(Number(v).toFixed(2));

// ─── Duración ──────────────────────────────────────────────────────────────
//
// Acota al rango y redondea al paso. Devuelve además si se ajustó, para que la
// nota viaje a la UI: un ajuste mudo convierte «pedí 20 s» en una afirmación
// falsa sobre el archivo.
export const resolveMotionDuration = (requested) => {
    const r = num(requested);
    if (r == null || r <= 0) return { durationSec: MOTION_DEFAULT_DURATION, adjusted: false, note: null };
    const { min, max, step } = MOTION_DURATION_RANGE;
    const clamped = Math.min(max, Math.max(min, r));
    const snapped = Math.round(clamped / step) * step;
    const durationSec = round2(snapped);
    const adjusted = Math.abs(durationSec - r) > 0.001;
    return {
        durationSec,
        adjusted,
        note: adjusted ? `La duración pedida (${r} s) se ajustó a ${durationSec} s: el rango es de ${min} a ${max} s en pasos de ${step}.` : null
    };
};

// ─── Lienzo ────────────────────────────────────────────────────────────────
//
// La imagen manda; el formato es lo que se pide. Si coinciden dentro de la
// tolerancia, se cubre el cuadro y el recorte es de un 3 % como máximo. Si no,
// NO se recorta la composición —se llevaría el logotipo o el lema— ni se
// difumina un fondo (rechazado por el cliente, v4.321): se RELLENA con el
// color de borde de la propia imagen, que es la forma honesta de extender un
// fondo institucional liso. `padColor` lo mide el renderizador; acá sólo se
// decide el modo y se dice.
export const CANVAS_TOLERANCE = 0.03;

export const planCanvas = ({ imageWidth, imageHeight, format = DEFAULT_FORMAT } = {}) => {
    const spec = OUTRO_FORMATS[format] || OUTRO_FORMATS[DEFAULT_FORMAT];
    const { width, height } = spec.master;
    const iw = num(imageWidth), ih = num(imageHeight);
    if (!iw || !ih) {
        return { mode: 'cover', width, height, note: 'No se pudieron leer las medidas de la imagen: se cubre el cuadro y se recorta lo que sobre.' };
    }
    const target = width / height;
    const actual = iw / ih;
    const deviation = Math.abs(actual - target) / target;
    if (deviation <= CANVAS_TOLERANCE) {
        return { mode: 'cover', width, height, deviation: round2(deviation), note: null };
    }
    return {
        mode: 'pad',
        width, height,
        deviation: round2(deviation),
        note: `La imagen (${iw}×${ih}) no tiene la proporción ${format}: se completa el lienzo con el color de borde de la propia imagen, sin recortar la composición.`
    };
};

// ─── Expresiones de movimiento ─────────────────────────────────────────────
//
// z(n) sobre el número de fotograma. p = min(n/settleFrames, 1): con p = 1 el
// término se anula y z = 1 EXACTO — es la garantía de que el cierre es la
// imagen. Se usa `n` y no `t` porque `scale` con `eval=frame` no expone `t` en
// todas las versiones y el fotograma es lo que de verdad se codifica.
export const zoomExpression = ({ preset = DEFAULT_MOTION_PRESET, durationSec = MOTION_DEFAULT_DURATION, fps = MOTION_FPS } = {}) => {
    const p = motionPreset(preset);
    const settleFrames = Math.max(1, Math.round(durationSec * p.settleFraction * fps));
    const z0 = Math.min(MAX_START_SCALE, Math.max(1, p.startScale));
    return `(1+(${z0}-1)*pow(1-min(n/${settleFrames},1),${p.ease}))`;
};

// Fundidos acotados: nunca más de un tercio de la pieza cada uno.
export const fadePlan = ({ preset = DEFAULT_MOTION_PRESET, durationSec = MOTION_DEFAULT_DURATION } = {}) => {
    const p = motionPreset(preset);
    const cap = durationSec / 3;
    const fadeIn = round2(Math.min(p.fadeInSec, cap));
    const fadeOut = round2(Math.min(p.fadeOutSec, cap));
    return { fadeInSec: fadeIn, fadeOutSec: fadeOut, fadeOutStart: round2(Math.max(0, durationSec - fadeOut)) };
};

/**
 * El grafo de filtros del video. Una sola cadena sobre la imagen:
 *   conformar (cover o pad) → fps → escalar por fotograma → recortar al
 *   centro → fundidos → yuv420p.
 *
 * El escalado por fotograma (`scale … eval=frame`) con `lanczos` es lo que
 * mueve la imagen; el `crop` posterior toma siempre el centro, así que la
 * composición no se desplaza. Medido (v4.1035): el fotograma de cierre
 * difiere de la imagen en 0,4 de media sobre 255 — ruido de compresión — y
 * 5 s en 1080×1920 tardan ~2,3 s en renderizarse.
 */
export const buildMotionFilter = ({
    preset = DEFAULT_MOTION_PRESET, format = DEFAULT_FORMAT, durationSec = MOTION_DEFAULT_DURATION,
    fps = MOTION_FPS, canvas = null, padColor = '#000000'
} = {}) => {
    const spec = OUTRO_FORMATS[format] || OUTRO_FORMATS[DEFAULT_FORMAT];
    const { width: W, height: H } = spec.master;
    const mode = canvas?.mode || 'cover';
    const conform = mode === 'pad'
        ? `scale=${W}:${H}:force_original_aspect_ratio=decrease:flags=lanczos,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=${padColor}`
        : `scale=${W}:${H}:force_original_aspect_ratio=increase:flags=lanczos,crop=${W}:${H}`;
    const z = zoomExpression({ preset, durationSec, fps });
    const fades = fadePlan({ preset, durationSec });
    const parts = [
        conform,
        'setsar=1',
        `fps=${fps}`,
        `scale=w='trunc(${W}*${z}/2)*2':h='trunc(${H}*${z}/2)*2':eval=frame:flags=lanczos`,
        `crop=${W}:${H}`,
        // El redondeo a par de la escala por fotograma deja un SAR de 1,0004:
        // el contenedor declararía 1081 px de ancho de presentación. Medido.
        'setsar=1'
    ];
    if (fades.fadeInSec > 0) parts.push(`fade=t=in:st=0:d=${fades.fadeInSec}`);
    if (fades.fadeOutSec > 0) parts.push(`fade=t=out:st=${fades.fadeOutStart}:d=${fades.fadeOutSec}`);
    parts.push('format=yuv420p');
    return { filter: parts.join(','), width: W, height: H, fps, fades, zoom: z, canvasMode: mode };
};

// Los filtros que usa un grafo, para la prueba de la lista blanca.
// Parte por las comas que separan FILTROS: las que van dentro de comillas
// (la expresión de escala) o de paréntesis no cuentan.
export const filtersUsed = (filter) => {
    const out = [];
    let cur = '', depth = 0, quoted = false;
    for (const ch of String(filter || '')) {
        if (ch === "'") quoted = !quoted;
        else if (!quoted && ch === '(') depth += 1;
        else if (!quoted && ch === ')') depth -= 1;
        if (ch === ',' && !quoted && depth === 0) { out.push(cur); cur = ''; continue; }
        cur += ch;
    }
    if (cur) out.push(cur);
    return out.map(s => s.trim().split('=')[0]).filter(Boolean);
};

export const filterIsAllowed = (filter) =>
    filtersUsed(filter).every(f => ALLOWED_FILTERS.includes(f));

// ─── Voz ───────────────────────────────────────────────────────────────────
//
// La locución se sintetiza con el TTS de la plataforma (`reelNarration.js`) y
// se MIDE. Si mide más de lo que cabe, la única corrección admitida es un
// `atempo` de hasta el 4 % (`MAX_ATEMPO`, por debajo del umbral audible —la
// regla del Creador de Reels—); más que eso no se acelera: se rechaza con la
// medida y la salida es acortar el texto. Si mide menos, sobra silencio, que
// es invisible.
export const VOICE_LEAD_IN_SEC = 0.35;
export const VOICE_TAIL_SEC = 0.45;
export const MAX_ATEMPO = 1.04;

export const planVoiceTiming = ({ measuredSec, durationSec } = {}) => {
    const m = num(measuredSec), d = num(durationSec);
    if (!m || !d) return { fits: false, atempo: 1, leadInSec: VOICE_LEAD_IN_SEC, reason: 'No se pudo medir la locución.' };
    const available = d - VOICE_LEAD_IN_SEC - VOICE_TAIL_SEC;
    if (available <= 0) return { fits: false, atempo: 1, leadInSec: VOICE_LEAD_IN_SEC, reason: `Un outro de ${d} s no deja sitio para una locución.` };
    if (m <= available) return { fits: true, atempo: 1, leadInSec: VOICE_LEAD_IN_SEC, availableSec: round2(available), measuredSec: round2(m) };
    const ratio = m / available;
    if (ratio <= MAX_ATEMPO) {
        return { fits: true, atempo: Number(ratio.toFixed(4)), leadInSec: VOICE_LEAD_IN_SEC, availableSec: round2(available), measuredSec: round2(m) };
    }
    return {
        fits: false, atempo: 1, leadInSec: VOICE_LEAD_IN_SEC, availableSec: round2(available), measuredSec: round2(m),
        reason: `La locución mide ${round2(m)} s y en ${d} s caben ${round2(available)} s. No se acelera la voz más de un ${Math.round((MAX_ATEMPO - 1) * 100)} %: acortá el mensaje o alargá el outro.`
    };
};

// El grafo de audio de la mezcla: la voz entra con su margen, se normaliza,
// se acelera sólo lo admitido, y se rellena/recorta a la duración de la
// pieza — es lo que evita que `-shortest` recorte el VIDEO (v4.674). El video
// se COPIA sin recodificar: el archivo generado no se toca.
export const buildVoiceMixFilter = ({ durationSec, leadInSec = VOICE_LEAD_IN_SEC, atempo = 1 } = {}) => {
    const delayMs = Math.round(Math.max(0, num(leadInSec) ?? VOICE_LEAD_IN_SEC) * 1000);
    const tempo = Math.min(MAX_ATEMPO, Math.max(1, num(atempo) || 1));
    const chain = [
        'aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo',
        'loudnorm=I=-16:TP=-1.5:LRA=11',
        tempo > 1.0001 ? `atempo=${tempo}` : null,
        `adelay=${delayMs}|${delayMs}`,
        'asetpts=N/SR/TB',
        'apad',
        `atrim=0:${durationSec}`
    ].filter(Boolean);
    return `[1:a]${chain.join(',')}[voz]`;
};

// ─── Costos ────────────────────────────────────────────────────────────────
// Viven en el catálogo (`outroSpec.estimateOutroCosts`); se reexportan para
// quien razone sobre el motor sin cargar el controlador.
export { TTS_CREDIT_ESTIMATE, estimateOutroCosts };

// ─── Etapas ────────────────────────────────────────────────────────────────
//
// El estado de cada etapa viaja en `config.stages` y es lo que permite
// reanudar sin repetir lo que ya salió: un fallo de voz no tira el video ya
// renderizado ni lo vuelve a renderizar.
export const STAGE_IDS = ['video', 'voice', 'mix'];
export const emptyStages = () => ({ video: { state: 'pending' }, voice: { state: 'pending' }, mix: { state: 'pending' } });

export const stagesSummary = (stages = {}) => {
    const s = { ...emptyStages(), ...(stages || {}) };
    return {
        video: s.video?.state || 'pending',
        voice: s.voice?.state || 'pending',
        mix: s.mix?.state || 'pending',
        allDone: ['video', 'mix'].every(k => s[k]?.state === 'ok') && ['ok', 'skipped', 'failed'].includes(s.voice?.state)
    };
};

export default {
    MOTION_ENGINE_ID, MOTION_DURATIONS, MOTION_DURATION_RANGE, MOTION_DEFAULT_DURATION, MOTION_FPS, MAX_START_SCALE,
    MOTION_PRESETS, DEFAULT_MOTION_PRESET, motionPreset, isMotionPreset, ALLOWED_FILTERS,
    resolveMotionDuration, CANVAS_TOLERANCE, planCanvas, zoomExpression, fadePlan, buildMotionFilter,
    filtersUsed, filterIsAllowed, VOICE_LEAD_IN_SEC, VOICE_TAIL_SEC, MAX_ATEMPO, planVoiceTiming, buildVoiceMixFilter,
    TTS_CREDIT_ESTIMATE, estimateOutroCosts, STAGE_IDS, emptyStages, stagesSummary
};
