// ════════════════════════════════════════════════════════════════════
// Generador de Outro IA — Motion Graphics institucional, el RENDER
// v4.1035.0
//
// La I/O del criterio de `outroMotion.js`: mide la imagen con sharp, ejecuta
// ffmpeg y sintetiza la voz. Tres funciones, una por etapa, para que el
// controlador pueda REANUDAR por etapa: un fallo de voz no vuelve a renderizar
// el video ni un fallo de mezcla vuelve a sintetizar.
//
// NO hay un segundo runner de ffmpeg ni un segundo cliente de TTS: `runFfmpeg`
// y `withTempDir` vienen del compositor de Reels y `synthesize` del narrador —
// dos caminos hacia el binario o hacia el proveedor se separan en silencio
// (la regla de `sendCampaign`).
// ════════════════════════════════════════════════════════════════════

import path from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { runFfmpeg, withTempDir, measureAudioDuration, extractFrames } from './reelFfmpeg.js';
import { synthesize } from './reelNarration.js';
import {
    buildMotionFilter, planCanvas, planVoiceTiming, buildVoiceMixFilter, buildHoldLastFrameFilter,
    MOTION_FPS, DEFAULT_MOTION_PRESET
} from './outroMotion.js';
import { OUTRO_FORMATS, DEFAULT_FORMAT, VOICE_LANGUAGES, DEFAULT_LANGUAGE, VOICE_PACES } from './outroSpec.js';
import { buildImportMixFilter } from './outroImport.js';

const targetBitrate = (width, height) => {
    const pixels = width * height;
    if (pixels >= 2560 * 1440) return { v: '16M', max: '20M', buf: '32M' };
    return { v: '10M', max: '12M', buf: '20M' };
};

const toHex = (n) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, '0');

/**
 * Mide la imagen: tamaño (con la orientación EXIF ya aplicada — `rotate()` sin
 * argumentos, como en todo el sitio) y el color medio de sus BORDES, que es el
 * relleno del lienzo cuando la proporción no coincide con el formato. Un
 * borde institucional suele ser liso (el azul del fondo); el promedio de las
 * cuatro franjas es lo más parecido a "extender el fondo" sin inventar nada.
 * Nunca lanza: sin medidas se cubre el cuadro y se dice.
 */
export const inspectArtwork = async (imageBuffer) => {
    try {
        const sharp = (await import('sharp')).default;
        const oriented = await sharp(imageBuffer, { failOn: 'none' }).rotate().removeAlpha().png().toBuffer();
        const meta = await sharp(oriented).metadata();
        const w = meta.width, h = meta.height;
        if (!w || !h) return { buffer: oriented, width: null, height: null, borderColor: '#000000' };

        const band = Math.max(1, Math.round(Math.min(w, h) * 0.02));
        const strips = [
            { left: 0, top: 0, width: w, height: band },
            { left: 0, top: h - band, width: w, height: band },
            { left: 0, top: 0, width: band, height: h },
            { left: w - band, top: 0, width: band, height: h }
        ];
        let r = 0, g = 0, b = 0, n = 0;
        for (const s of strips) {
            // El recorte se MATERIALIZA antes de medir: `stats()` sobre un
            // `extract()` encadenado devuelve la estadística de la imagen
            // entera (v4.799).
            const buf = await sharp(oriented).extract(s).toBuffer();
            const st = await sharp(buf).stats();
            const [cr, cg, cb] = st.channels;
            const px = s.width * s.height;
            r += cr.mean * px; g += cg.mean * px; b += cb.mean * px; n += px;
        }
        const borderColor = n ? `#${toHex(r / n)}${toHex(g / n)}${toHex(b / n)}` : '#000000';
        return { buffer: oriented, width: w, height: h, borderColor };
    } catch (e) {
        return { buffer: imageBuffer, width: null, height: null, borderColor: '#000000', error: e.message };
    }
};

/**
 * Etapa 1: la imagen → un MP4 MUDO con el movimiento del preset.
 * Devuelve el buffer y lo que se decidió (lienzo, fundidos, filtro), que el
 * controlador guarda en `config` para que la ficha pueda decirlo.
 */
export const renderMotionOutro = async (imageBuffer, {
    format = DEFAULT_FORMAT, preset = DEFAULT_MOTION_PRESET, durationSec = 5, fps = MOTION_FPS, timeoutMs = 120_000
} = {}) => {
    const art = await inspectArtwork(imageBuffer);
    const canvas = planCanvas({ imageWidth: art.width, imageHeight: art.height, format });
    const graph = buildMotionFilter({ preset, format, durationSec, fps, canvas, padColor: art.borderColor });
    const { width, height } = (OUTRO_FORMATS[format] || OUTRO_FORMATS[DEFAULT_FORMAT]).master;

    const buffer = await withTempDir(async (dir) => {
        const input = path.join(dir, 'artwork.png');
        const output = path.join(dir, 'outro-video.mp4');
        await writeFile(input, art.buffer);
        const br = targetBitrate(width, height);
        await runFfmpeg([
            '-y', '-loop', '1', '-framerate', String(fps), '-i', input, '-t', String(durationSec),
            '-filter_complex', `[0:v]${graph.filter}`,
            '-c:v', 'libx264', '-preset', 'veryfast', '-profile:v', 'high',
            '-b:v', br.v, '-maxrate', br.max, '-bufsize', br.buf,
            '-pix_fmt', 'yuv420p', '-an', '-movflags', '+faststart', output
        ], { timeoutMs, label: 'outro motion graphics' });
        return readFile(output);
    });

    return {
        buffer,
        plan: {
            preset, format, durationSec, fps, width, height,
            canvas: { mode: canvas.mode, deviation: canvas.deviation ?? null, padColor: art.borderColor, note: canvas.note },
            fades: graph.fades,
            source: { width: art.width, height: art.height },
            filter: graph.filter
        },
        notes: [canvas.note, art.error ? `No se pudo analizar la imagen: ${art.error}` : null].filter(Boolean)
    };
};

// El idioma del outro → el del narrador. Comparten claves salvo `en-GB`, que
// el narrador no tiene: cae al inglés americano, que es la misma lengua.
const narrationLanguageFor = (language) => {
    const id = VOICE_LANGUAGES[language] ? language : DEFAULT_LANGUAGE;
    return id === 'en-GB' ? 'en-US' : id;
};

/**
 * Etapa 2: el texto → MP3 medido, con el plan de tiempo. El texto se
 * pronuncia ENTERO: `timing.ok:false` sólo cuando no se pudo medir, y
 * `timing.finalDurationSec` dice cuánto tiene que durar la pieza para que la
 * locución entre sin acelerarse ni cortarse. No lanza por longitud.
 */
export const synthesizeOutroVoice = async ({ text, voice = {}, durationSec = 5 } = {}) => {
    const gender = ['female', 'male', 'neutral'].includes(voice.gender) ? voice.gender : 'female';
    const speed = (VOICE_PACES[voice.pace] || VOICE_PACES.normal).factor;
    const language = narrationLanguageFor(voice.language);
    const synth = await synthesize({ text, gender, speed, language });
    const measuredSec = await measureAudioDuration(synth.buffer);
    const timing = planVoiceTiming({ measuredSec, durationSec });
    return { buffer: synth.buffer, provider: synth.provider, voiceId: synth.voiceId, measuredSec, timing, language };
};

/**
 * Etapa 3: video mudo + voz → MP4 final. El video se COPIA (`-c:v copy`): el
 * archivo renderizado en la etapa 1 no se recodifica ni se toca. `durationSec`
 * es la duración FINAL de la pieza: si la voz exigió alargarla, el
 * controlador ya volvió a renderizar el video a esa duración (Motion
 * Graphics termina en fundido, así que congelar su último fotograma daría
 * negro); acá sólo se mezcla.
 */
export const mixOutroVoice = async ({ videoBuffer, voiceBuffer, durationSec, timing = {}, timeoutMs = 60_000 } = {}) =>
    withTempDir(async (dir) => {
        const video = path.join(dir, 'video.mp4');
        const voice = path.join(dir, 'voice.mp3');
        const output = path.join(dir, 'outro.mp4');
        await writeFile(video, videoBuffer);
        await writeFile(voice, voiceBuffer);
        const filter = buildVoiceMixFilter({ durationSec, leadInSec: timing.leadInSec });
        await runFfmpeg([
            '-y', '-i', video, '-i', voice,
            '-filter_complex', filter,
            '-map', '0:v', '-map', '[voz]',
            '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-ar', '48000',
            '-movflags', '+faststart', output
        ], { timeoutMs, label: 'mezcla de voz del outro' });
        return readFile(output);
    });

// ─── Modo «Importar video MP4» (v4.1036) ───────────────────────────────────
//
// El MP4 importado es el MAESTRO VISUAL: acá no hay etapa 1. Lo que se hace es
// (a) sacarle un fotograma para la ficha y la miniatura de la Biblioteca, y
// (b) mezclarle el audio —original, voz y música— copiando el video sin
// recodificar. Sólo si el archivo trae un códec que un navegador no reproduce
// se recodifica el MISMO fotograma a H.264: sin escalar, sin recortar, sin
// filtros de imagen. El criterio (qué pistas, qué niveles, ducking) vive en
// `outroImport.js`.

/** Un fotograma del medio del video, en JPEG. Nunca lanza. */
export const extractPosterFrame = async (videoBuffer, { durationSec = 5 } = {}) => {
    try {
        const frames = await extractFrames(videoBuffer, { durationSec, count: 1 });
        return frames[0]?.buffer || null;
    } catch (e) {
        console.warn('[OUTRO] sin fotograma de portada:', e.message);
        return null;
    }
};

/** La duración REAL de una pista de música, para decidir si se repite. Nunca lanza. */
export const measureMusic = async (buffer) => {
    try { return await measureAudioDuration(buffer); } catch { return null; }
};

/**
 * El maestro: video importado + (audio original) + (voz) + (música) → MP4.
 *
 * `durationSec` es la duración FINAL de la pieza y `extendSec` cuánto le
 * falta al video para llegar a ella (v4.1038): con `extendSec > 0` el video se
 * reproduce entero y su último fotograma se mantiene quieto el resto
 * (`buildHoldLastFrameFilter`), lo que obliga a recodificar — es técnico:
 * mismo tamaño, mismo ritmo, sin filtros de imagen, y se declara en
 * `extended`. Sin extensión, `-c:v copy` como siempre.
 * `normalize` recodifica el video (códec no reproducible o ritmo variable).
 * `keepOriginalAudio` es una decisión declarada: con pista y sin nada que
 * mezclar el archivo ni siquiera pasa por ffmpeg — eso lo decide el
 * controlador con `planImportAudio().passthrough`.
 */
export const mixImportedOutro = async ({
    videoBuffer, durationSec, extendSec = 0, normalize = false,
    hasOriginalAudio = false, keepOriginalAudio = true,
    voiceBuffer = null, voiceTiming = {}, voiceGainDb = 0,
    musicBuffer = null, musicDurationSec = null, musicGainDb = null,
    timeoutMs = 120_000
} = {}) => withTempDir(async (dir) => {
    const video = path.join(dir, 'source.mp4');
    const output = path.join(dir, 'outro.mp4');
    await writeFile(video, videoBuffer);

    const args = ['-y', '-i', video];
    const inputs = {};
    let next = 1;
    if (hasOriginalAudio && keepOriginalAudio !== false) inputs.original = 0;
    if (voiceBuffer) {
        const voice = path.join(dir, 'voice.mp3');
        await writeFile(voice, voiceBuffer);
        args.push('-i', voice);
        inputs.voice = next++;
    }
    if (musicBuffer) {
        const music = path.join(dir, 'music.bin');
        await writeFile(music, musicBuffer);
        args.push('-i', music);
        inputs.music = next++;
    }

    const holdFilter = buildHoldLastFrameFilter({ extendSec, inputIndex: 0, outLabel: 'vext' });
    const reencode = normalize || Boolean(holdFilter);
    const videoCodec = reencode
        ? ['-c:v', 'libx264', '-preset', 'veryfast', '-profile:v', 'high', '-crf', '18', '-pix_fmt', 'yuv420p']
        : ['-c:v', 'copy'];
    const videoMap = holdFilter ? '[vext]' : '0:v';

    const hasTracks = inputs.original != null || inputs.voice != null || inputs.music != null;
    let plan = null;
    if (hasTracks) {
        // Una pista más corta que la pieza DA LA VUELTA (aloop), no se rellena
        // con silencio: el tamaño del loop va en muestras de 48 kHz.
        const loopSamples = musicBuffer && musicDurationSec && musicDurationSec < durationSec
            ? Math.max(1, Math.round(musicDurationSec * 48000)) : null;
        plan = buildImportMixFilter({
            durationSec, inputs,
            voice: { leadInSec: voiceTiming.leadInSec, gainDb: voiceGainDb },
            music: { loopSamples, gainDb: musicGainDb ?? undefined }
        });
        // El grafo de audio y el de video van en el MISMO -filter_complex,
        // separados por ';'. `plan.filter` sigue siendo SÓLO audio: es lo que
        // se guarda y lo que la lista blanca de filtros de audio comprueba.
        const graph = [holdFilter, plan.filter].filter(Boolean).join(';');
        args.push('-filter_complex', graph, '-map', videoMap, '-map', plan.output,
            ...videoCodec, '-c:a', 'aac', '-b:a', '160k', '-ar', '48000');
    } else if (holdFilter) {
        args.push('-filter_complex', holdFilter, '-map', videoMap, ...videoCodec, '-an');
    } else {
        // Sin ninguna pista (audio original descartado y nada que agregar): mudo.
        args.push('-map', '0:v', ...videoCodec, '-an');
    }
    args.push('-movflags', '+faststart', output);
    const label = holdFilter ? 'extender y mezclar el outro importado' : normalize ? 'normalizar y mezclar el outro importado' : 'mezclar el outro importado';
    await runFfmpeg(args, { timeoutMs, label });
    return {
        buffer: await readFile(output), filter: plan?.filter || null, videoFilter: holdFilter, inputs,
        normalized: Boolean(normalize), extended: Boolean(holdFilter), extendSec: holdFilter ? extendSec : 0
    };
});

export default { inspectArtwork, renderMotionOutro, synthesizeOutroVoice, mixOutroVoice, extractPosterFrame, measureMusic, mixImportedOutro };
