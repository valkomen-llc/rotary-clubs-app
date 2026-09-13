// ════════════════════════════════════════════════════════════════════
// Generador de Outro IA — modo «Importar video MP4», el CRITERIO
// v4.1036.0
//
// PURO: sin base, sin red, sin ffmpeg, sin sharp. Decide qué archivo importado
// se acepta, qué le falta para entrar al montaje de Reels, cómo se reparte el
// audio (original · voz · música) y cuánto cuesta. El render vive en
// `outroMotionRender.js` y la orquestación en `outroController.js`.
//
// POR QUÉ EXISTE. Hasta v4.1035 el módulo sólo sabía ANIMAR una imagen fija:
// Motion Graphics determinista o Kling. Un outro ya terminado por fuera —un
// MP4 hecho en After Effects, Canva o por una agencia— no tenía por dónde
// entrar salvo como «un video más» de la Biblioteca, sin voz, sin música y sin
// ficha. Este modo lo recibe y usa la plataforma SÓLO para el audio.
//
// INVARIANTES (están en el código y una prueba las fija):
//   · EL MP4 IMPORTADO ES EL MAESTRO VISUAL. Ningún modelo lo toca: no hay
//     image-to-video, no se regeneran fotogramas, no se cambia el diseño.
//     La generación visual cuesta CERO créditos, siempre.
//   · El video se COPIA (`-c:v copy`) salvo que haga falta NORMALIZARLO para
//     que se reproduzca en cualquier navegador y entre al montaje (códec que
//     no es H.264, ritmo variable). Normalizar es recodificar el MISMO
//     fotograma: sin escalar, sin recortar, sin filtros de imagen.
//   · La duración es la del ARCHIVO. La locución se mide contra ella y no se
//     acelera para que quepa (`MAX_ATEMPO` de `outroMotion.js`).
//   · El audio original NUNCA se descarta en silencio: `keepOriginalAudio`
//     es una decisión declarada y la pantalla la dice.
//   · Con voz y música hay DUCKING: la voz manda, la música cede mientras se
//     habla y vuelve al terminar. Sin voz, la música va a su nivel y cierra
//     con fundido; un limitador evita el recorte al sumar pistas.
// ════════════════════════════════════════════════════════════════════

import { OUTRO_FORMATS, DEFAULT_FORMAT, VOICE_VOLUMES, TTS_CREDIT_ESTIMATE, MUSIC_CREDIT_ESTIMATE } from './outroSpec.js';
import { OUTRO_MIN_SEC, OUTRO_MAX_SEC } from './reelOutro.js';
import { buildVoiceMixFilter, VOICE_LEAD_IN_SEC, VOICE_TAIL_SEC, planVoiceTiming } from './outroMotion.js';

export const IMPORT_ENGINE_ID = 'imported';
export const ORIGINS = { generated: 'generado', imported: 'importado' };

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
const round2 = (v) => Number(Number(v).toFixed(2));

// ─── Límites del archivo ───────────────────────────────────────────────────
//
// El archivo se descarga a la memoria de la función para medirlo y mezclarlo:
// 150 MB dejan margen para un cierre de hasta 20 s en 4K y no rozan el `/tmp`
// de 512 MB. Un outro de 5 s en 1080×1920 pesa entre 2 y 15 MB.
export const IMPORT_MAX_BYTES = (() => {
    const raw = Number(process.env.OUTRO_IMPORT_MAX_MB);
    return (Number.isFinite(raw) && raw > 0 ? raw : 150) * 1024 * 1024;
})();
export const IMPORT_MIN_SEC = OUTRO_MIN_SEC;
export const IMPORT_MAX_SEC = OUTRO_MAX_SEC;
export const IMPORT_EXTENSIONS = ['mp4', 'm4v', 'mov'];
// El único códec que TODO navegador reproduce y que el montaje de Reels copia
// sin recodificar. HEVC/AV1 se aceptan y se normalizan.
export const PLAYABLE_CODECS = ['avc1'];
export const CANVAS_TOLERANCE = 0.03;
// Por debajo de esto en el lado corto la pieza se ve blanda en un Reel de
// 1080×1920. Avisa, no rechaza: un 720p legítimo sigue siendo un outro.
export const SOFT_MIN_SHORT_SIDE = 720;

export const extensionOf = (filename) => {
    const s = String(filename || '');
    const i = s.lastIndexOf('.');
    return i > 0 ? s.slice(i + 1).toLowerCase() : '';
};

// El formato del catálogo cuya proporción coincide con el archivo (±3 %), o
// null si no coincide con ninguno: no se inventa un 9:16 para un 2:1.
export const detectFormat = (width, height) => {
    const w = num(width), h = num(height);
    if (!w || !h) return null;
    const actual = w / h;
    let best = null;
    for (const spec of Object.values(OUTRO_FORMATS)) {
        const target = spec.master.width / spec.master.height;
        const deviation = Math.abs(actual - target) / target;
        if (deviation <= CANVAS_TOLERANCE && (!best || deviation < best.deviation)) best = { id: spec.id, deviation: round2(deviation) };
    }
    return best ? best.id : null;
};

/**
 * Valida el archivo importado a partir de lo que `probeMp4` leyó del
 * contenedor. `failures` bloquea; `warnings` se dice. Devuelve además qué
 * normalización técnica hace falta y por qué — nunca una estética.
 */
export const validateImportedVideo = (probe, { sizeBytes = null, filename = '' } = {}) => {
    const failures = [];
    const warnings = [];
    const normalization = [];

    const ext = extensionOf(filename);
    if (ext && !IMPORT_EXTENSIONS.includes(ext)) {
        failures.push(`Se admite MP4 (también .mov y .m4v); el archivo es .${ext}.`);
    }
    const size = num(sizeBytes);
    if (size != null && size > IMPORT_MAX_BYTES) {
        failures.push(`El archivo pesa ${(size / 1024 / 1024).toFixed(1)} MB y el tope es ${Math.round(IMPORT_MAX_BYTES / 1024 / 1024)} MB.`);
    }

    if (!probe || probe.parseError) failures.push(probe?.parseError || 'No se pudo leer el contenedor del video.');
    if (probe?.truncated) failures.push('El archivo llegó truncado: hay cajas del contenedor que se salen del tamaño real.');
    if (probe?.hasMoov && !probe?.hasMdat) failures.push('El archivo no contiene datos de video (mdat).');

    const durationSec = num(probe?.durationSec);
    if (!durationSec) {
        failures.push('No se pudo determinar la duración del video.');
    } else if (durationSec < IMPORT_MIN_SEC) {
        failures.push(`El video dura ${durationSec} s; un outro necesita al menos ${IMPORT_MIN_SEC} s.`);
    } else if (durationSec > IMPORT_MAX_SEC) {
        failures.push(`El video dura ${durationSec} s; un outro no puede pasar de ${IMPORT_MAX_SEC} s — por encima deja de ser un cierre y el montaje del Reel lo paga.`);
    }

    const width = num(probe?.width), height = num(probe?.height);
    let format = null;
    if (!width || !height) {
        failures.push('No se pudo determinar la resolución del video.');
    } else {
        format = detectFormat(width, height);
        if (!format) {
            warnings.push(`La proporción ${width}×${height} no coincide con ningún formato del catálogo (9:16, 1:1, 4:5, 16:9): en el Reel el montaje la cubre y recorta al centro.`);
        } else if (format !== DEFAULT_FORMAT) {
            warnings.push(`El video es ${format}; un Reel es 9:16 y el montaje lo cubre y recorta al centro.`);
        }
        if (Math.min(width, height) < SOFT_MIN_SHORT_SIDE) {
            warnings.push(`Resolución baja (${width}×${height}): en un Reel de 1080×1920 se verá blando. Se acepta tal cual.`);
        }
    }

    if (probe?.videoCodec && !PLAYABLE_CODECS.includes(probe.videoCodec)) {
        normalization.push(`códec ${probe.videoCodec} → H.264, para que se reproduzca en cualquier navegador`);
    }
    if (probe?.constantFrameRate === false) {
        normalization.push('ritmo de fotogramas variable → constante, para el montaje');
    }
    if (probe?.fps != null && probe.fps < 23) {
        warnings.push(`${probe.fps} fps: por debajo de lo habitual (24-30). Se acepta tal cual.`);
    }

    return {
        ok: failures.length === 0,
        failures,
        warnings,
        format: format || DEFAULT_FORMAT,
        formatDetected: format,
        aspect: width && height ? `${width}×${height}` : null,
        durationSec: durationSec ? round2(durationSec) : null,
        width: width || null,
        height: height || null,
        hasAudio: Boolean(probe?.hasAudio),
        videoCodec: probe?.videoCodec || null,
        audioCodec: probe?.audioCodec || null,
        fps: probe?.fps ?? null,
        sizeBytes: size,
        normalization: { needed: normalization.length > 0, reasons: normalization }
    };
};

// ─── Música ────────────────────────────────────────────────────────────────
export const MUSIC_MODES = {
    none:     { id: 'none',     label: 'Sin música' },
    library:  { id: 'library',  label: 'Pista de la Biblioteca o subida' },
    generate: { id: 'generate', label: 'Generar con el motor de música' }
};
export const MUSIC_FADE_IN_SEC = 0.4;
// El fundido de salida cierra la pieza: nunca más de un tercio de ella.
export const musicFadeOutFor = (durationSec) => round2(Math.min(1.2, Math.max(0.3, (num(durationSec) || 5) / 3)));
// Nivel de la cama musical. Sin voz va un poco más presente; con voz, la
// mezcla la baja además por ducking.
export const MUSIC_GAIN_DB = { solo: -8, underVoice: -12 };
export const VOICE_GAIN_DB = { soft: -3, normal: 0, strong: 2 };

export const normalizeMusicConfig = (raw = {}) => {
    const mode = MUSIC_MODES[raw?.mode] ? raw.mode : 'none';
    const url = typeof raw?.url === 'string' && raw.url.trim() ? raw.url.trim() : null;
    const out = {
        mode,
        url: mode === 'library' ? url : null,
        mediaId: mode === 'library' && typeof raw?.mediaId === 'string' ? raw.mediaId : null,
        filename: mode === 'library' && typeof raw?.filename === 'string' ? raw.filename.slice(0, 200) : null,
        style: mode === 'generate' && typeof raw?.style === 'string' ? raw.style.slice(0, 40) : null,
        source: mode === 'library' ? (raw?.source === 'upload' ? 'upload' : 'library') : mode
    };
    // Sin archivo no hay pista: cae a «sin música» y se dice en la validación.
    if (mode === 'library' && !out.url) out.mode = 'none';
    return out;
};

// ─── Costos ────────────────────────────────────────────────────────────────
//
// CUATRO números: generación (SIEMPRE 0: el maestro visual es el archivo),
// voz (una síntesis), música (0 si es una pista propia; la tarifa del motor
// si se genera) y composición (0: ffmpeg local). Una importación que sólo se
// guarda no cuesta nada, y nunca aparece como generada por Kling.
export const estimateImportCosts = ({ voiceEnabled = false, music = null } = {}) => {
    const generationCost = 0;
    const ttsCost = voiceEnabled ? TTS_CREDIT_ESTIMATE : 0;
    const musicCost = music?.mode === 'generate' ? MUSIC_CREDIT_ESTIMATE : 0;
    const compositionCost = 0;
    return { generationCost, ttsCost, musicCost, compositionCost, total: generationCost + ttsCost + musicCost + compositionCost };
};

// ─── Reparto del audio ─────────────────────────────────────────────────────
//
// Los cuatro escenarios del pedido, nombrados. `keepOriginalAudio` sólo
// significa algo si el archivo trae pista; sin pista es `null`.
export const planImportAudio = ({ hasOriginalAudio = false, keepOriginalAudio = true, voiceEnabled = false, musicMode = 'none' } = {}) => {
    const original = Boolean(hasOriginalAudio && keepOriginalAudio !== false);
    const voice = Boolean(voiceEnabled);
    const music = musicMode && musicMode !== 'none';
    const dropped = Boolean(hasOriginalAudio && keepOriginalAudio === false);
    let scenario;
    if (!original && !voice && music) scenario = 'A';
    else if (!original && voice && music) scenario = 'B';
    else if (original && voice && music) scenario = 'C';
    else if (original && !voice && !music) scenario = 'D';
    else scenario = 'custom';
    const needsMix = voice || music || dropped;
    return {
        scenario,
        original, voice, music, dropped,
        ducking: voice && (music || original),
        needsMix,
        // Sin nada que mezclar y sin normalizar, el archivo sale TAL CUAL.
        passthrough: !needsMix,
        note: dropped ? 'El audio original del video se descarta a pedido tuyo: el maestro sale sólo con lo que se agregue acá.' : null
    };
};

// Hasta dónde cabe una locución en el archivo. Es `planVoiceTiming` con la
// duración REAL; se reexporta para que la pantalla diga «necesita ≈7,2 s y el
// outro dura 5 s» con los mismos márgenes que la mezcla.
export const voiceWindowFor = (durationSec) => {
    const d = num(durationSec) || 0;
    return { availableSec: round2(Math.max(0, d - VOICE_LEAD_IN_SEC - VOICE_TAIL_SEC)), leadInSec: VOICE_LEAD_IN_SEC, tailSec: VOICE_TAIL_SEC };
};
export { planVoiceTiming };

// Filtros de audio que el grafo puede usar. Es la lista blanca que hace
// verificable «sólo se procesa el audio».
export const ALLOWED_AUDIO_FILTERS = [
    'aformat', 'loudnorm', 'atempo', 'adelay', 'asetpts', 'apad', 'atrim', 'aloop',
    'afade', 'volume', 'asplit', 'sidechaincompress', 'amix', 'alimiter', 'anull'
];
export const DUCKING = { threshold: 0.03, ratio: 8, attack: 20, release: 400 };

/**
 * El grafo de audio de la mezcla. Entradas por índice de `-i`:
 *   `inputs.original` — la pista del propio MP4 (índice 0, si se conserva)
 *   `inputs.voice`    — el MP3 de la locución
 *   `inputs.music`    — la pista musical
 * Devuelve `{ filter, output }`: `output` es la etiqueta a mapear (`[mix]`).
 *
 * La voz reutiliza EXACTAMENTE la cadena de Motion Graphics
 * (`buildVoiceMixFilter`: loudnorm → atempo acotado → adelay → asetpts →
 * apad → atrim): un segundo criterio de la voz se separaría en silencio.
 */
export const buildImportMixFilter = ({
    durationSec,
    inputs = {},
    voice = {},
    music = {},
    ducking = DUCKING
} = {}) => {
    const D = num(durationSec);
    if (!D || D <= 0) throw new Error('buildImportMixFilter: falta la duración de la pieza.');
    const parts = [];
    const beds = [];

    if (inputs.original != null) {
        const gain = num(inputs.originalGainDb) ?? 0;
        parts.push(`[${inputs.original}:a]aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,apad,atrim=0:${D},asetpts=N/SR/TB${gain ? `,volume=${gain}dB` : ''}[org]`);
        beds.push('[org]');
    }

    if (inputs.music != null) {
        const fadeIn = round2(Math.min(num(music.fadeInSec) ?? MUSIC_FADE_IN_SEC, D / 3));
        const fadeOut = round2(Math.min(num(music.fadeOutSec) ?? musicFadeOutFor(D), D / 3));
        const gainDb = num(music.gainDb) ?? (inputs.voice != null ? MUSIC_GAIN_DB.underVoice : MUSIC_GAIN_DB.solo);
        const loop = num(music.loopSamples);
        const chain = [
            // 48 kHz ANTES del loop: `size` se cuenta en muestras de esa tasa.
            'aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo',
            loop && loop > 0 ? `aloop=loop=-1:size=${Math.round(loop)}` : null,
            'apad',
            `atrim=0:${D}`,
            'asetpts=N/SR/TB',
            fadeIn > 0 ? `afade=t=in:st=0:d=${fadeIn}` : null,
            fadeOut > 0 ? `afade=t=out:st=${round2(Math.max(0, D - fadeOut))}:d=${fadeOut}` : null,
            `volume=${gainDb}dB`
        ].filter(Boolean);
        parts.push(`[${inputs.music}:a]${chain.join(',')}[mus]`);
        beds.push('[mus]');
    }

    let bed = null;
    if (beds.length === 2) { parts.push(`${beds.join('')}amix=inputs=2:normalize=0[bed]`); bed = '[bed]'; }
    else if (beds.length === 1) bed = beds[0];

    let pre = null;
    if (inputs.voice != null) {
        const gainDb = num(voice.gainDb) ?? 0;
        parts.push(buildVoiceMixFilter({
            durationSec: D, leadInSec: voice.leadInSec, atempo: voice.atempo,
            inputIndex: inputs.voice, outLabel: 'voz', gainDb
        }));
        if (bed) {
            // DUCKING: la cama se comprime con la voz como cadena lateral. La
            // voz se parte en dos porque la consumen el compresor y la suma.
            parts.push('[voz]asplit=2[vzA][vzB]');
            parts.push(`${bed}[vzB]sidechaincompress=threshold=${ducking.threshold}:ratio=${ducking.ratio}:attack=${ducking.attack}:release=${ducking.release}[bedd]`);
            parts.push('[bedd][vzA]amix=inputs=2:normalize=0[pre]');
            pre = '[pre]';
        } else {
            pre = '[voz]';
        }
    } else {
        pre = bed;
    }
    if (!pre) throw new Error('buildImportMixFilter: no hay ninguna pista que mezclar.');

    // El limitador evita el recorte al sumar pistas (normalize=0 no baja
    // nada); `apad,atrim` sostienen la duración de la pieza — `-shortest`
    // recortaría el VIDEO (v4.674).
    parts.push(`${pre}alimiter=limit=0.95:level=false,apad,atrim=0:${D},asetpts=N/SR/TB[mix]`);
    return { filter: parts.join(';'), output: '[mix]' };
};

// Los filtros de un grafo de audio, para la prueba de la lista blanca.
export const audioFiltersUsed = (filter) => {
    const out = [];
    for (const chain of String(filter || '').split(';')) {
        const body = chain.replace(/\[[^\]]*\]/g, '');
        for (const f of body.split(',')) {
            const name = f.trim().split('=')[0];
            if (name) out.push(name);
        }
    }
    return out;
};
export const audioFilterIsAllowed = (filter) => audioFiltersUsed(filter).every(f => ALLOWED_AUDIO_FILTERS.includes(f));

// ─── Validación del maestro ────────────────────────────────────────────────
//
// Más laxa que la del motor generativo a propósito: acá el archivo lo trajo
// el usuario y ya lo vio. Resolución y tasa de bits AVISAN; lo que reprueba
// es lo que rompería el Reel — contenedor truncado, duración distinta a la
// del original, voz pedida que no está.
export const validateImportedOutput = (probe, { expectedDurationSec, expectAudio = false, expectVoice = false } = {}) => {
    const failures = [];
    const warnings = [];
    if (!probe || probe.parseError) failures.push(probe?.parseError || 'No se pudo leer el archivo producido.');
    if (probe?.truncated) failures.push('El archivo producido llegó truncado.');
    const d = num(probe?.durationSec), e = num(expectedDurationSec);
    if (!d) failures.push('No se pudo determinar la duración del archivo producido.');
    else if (e && Math.abs(d - e) > 0.5) failures.push(`La duración cambió: ${d} s frente a los ${e} s del original.`);
    if (probe?.width && probe?.height && Math.min(probe.width, probe.height) < SOFT_MIN_SHORT_SIDE) {
        warnings.push(`Resolución baja (${probe.width}×${probe.height}).`);
    }
    if (expectAudio && !probe?.hasAudio) failures.push('Se esperaba pista de audio y el archivo no la trae.');
    if (expectVoice && probe?.audioDriftSec != null && probe.audioDriftSec > 0.5) failures.push(`Audio y video desfasados en ${probe.audioDriftSec} s.`);
    return { verdict: failures.length ? 'needs_review' : 'ready', failures, warnings, checkedAt: new Date().toISOString(), measured: probe };
};

// ─── Etapas ────────────────────────────────────────────────────────────────
export const IMPORT_STAGE_IDS = ['source', 'voice', 'music', 'mix'];
export const emptyImportStages = () => ({ source: { state: 'pending' }, voice: { state: 'pending' }, music: { state: 'pending' }, mix: { state: 'pending' } });
export const importStagesSummary = (stages = {}) => {
    const s = { ...emptyImportStages(), ...(stages || {}) };
    const done = (k) => ['ok', 'skipped', 'failed'].includes(s[k]?.state);
    return {
        source: s.source?.state || 'pending',
        voice: s.voice?.state || 'pending',
        music: s.music?.state || 'pending',
        mix: s.mix?.state || 'pending',
        // La ficha de Motion Graphics lee `video`; acá `video` ES la fuente.
        video: s.source?.state || 'pending',
        allDone: ['source', 'mix'].every(k => s[k]?.state === 'ok') && done('voice') && done('music')
    };
};

export const voiceVolumeGainDb = (volume) => VOICE_GAIN_DB[VOICE_VOLUMES[volume] ? volume : 'normal'] ?? 0;

export default {
    IMPORT_ENGINE_ID, ORIGINS, IMPORT_MAX_BYTES, IMPORT_MIN_SEC, IMPORT_MAX_SEC, IMPORT_EXTENSIONS, PLAYABLE_CODECS,
    CANVAS_TOLERANCE, SOFT_MIN_SHORT_SIDE, extensionOf, detectFormat, validateImportedVideo,
    MUSIC_MODES, MUSIC_FADE_IN_SEC, musicFadeOutFor, MUSIC_GAIN_DB, VOICE_GAIN_DB, normalizeMusicConfig,
    estimateImportCosts, planImportAudio, voiceWindowFor, planVoiceTiming, ALLOWED_AUDIO_FILTERS, DUCKING,
    buildImportMixFilter, audioFiltersUsed, audioFilterIsAllowed, validateImportedOutput,
    IMPORT_STAGE_IDS, emptyImportStages, importStagesSummary, voiceVolumeGainDb
};
