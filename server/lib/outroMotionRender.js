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
import { runFfmpeg, withTempDir, measureAudioDuration } from './reelFfmpeg.js';
import { synthesize } from './reelNarration.js';
import {
    buildMotionFilter, planCanvas, planVoiceTiming, buildVoiceMixFilter,
    MOTION_FPS, DEFAULT_MOTION_PRESET
} from './outroMotion.js';
import { OUTRO_FORMATS, DEFAULT_FORMAT, VOICE_LANGUAGES, DEFAULT_LANGUAGE, VOICE_PACES } from './outroSpec.js';

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
 * Etapa 2: el texto → MP3 medido, con el plan de tiempo.
 * `fits:false` NO lanza: devuelve el motivo para que el controlador lo deje
 * escrito y conserve el video ya renderizado.
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
 * archivo renderizado en la etapa 1 no se recodifica ni se toca.
 */
export const mixOutroVoice = async ({ videoBuffer, voiceBuffer, durationSec, timing = {}, timeoutMs = 60_000 } = {}) =>
    withTempDir(async (dir) => {
        const video = path.join(dir, 'video.mp4');
        const voice = path.join(dir, 'voice.mp3');
        const output = path.join(dir, 'outro.mp4');
        await writeFile(video, videoBuffer);
        await writeFile(voice, voiceBuffer);
        const filter = buildVoiceMixFilter({ durationSec, leadInSec: timing.leadInSec, atempo: timing.atempo });
        await runFfmpeg([
            '-y', '-i', video, '-i', voice,
            '-filter_complex', filter,
            '-map', '0:v', '-map', '[voz]',
            '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-ar', '48000',
            '-movflags', '+faststart', output
        ], { timeoutMs, label: 'mezcla de voz del outro' });
        return readFile(output);
    });

export default { inspectArtwork, renderMotionOutro, synthesizeOutroVoice, mixOutroVoice };
