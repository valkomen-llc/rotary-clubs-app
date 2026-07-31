// ════════════════════════════════════════════════════════════════════
// Creador de Reels IA — compositor local con FFmpeg
// v4.667.0
//
// POR QUÉ EXISTE, SI YA HABÍA UNA CAPA DE RENDER ALOJADO
//
// Porque un proveedor externo sin credencial deja el módulo sin montar nada, y
// eso es exactamente lo que pasó al estrenarlo: «las tres escenas están listas,
// pero no hay proveedor de montaje configurado». Un binario que viaja con la
// aplicación no se puede quedar sin configurar.
//
// FFmpeg se empaqueta con `ffmpeg-static`, que trae el binario del sistema
// donde se instala. Medido sobre el caso real —tres clips de 5 s en 1080×1920,
// dos fundidos y una pista de audio— el montaje tarda ~12 s y la extracción de
// tres fotogramas ~0,9 s por clip. Con el margen de una función de Vercel
// (más lenta que una máquina de desarrollo) el montaje completo entra holgado
// en los 120 s de `vercel.json`.
//
// `ffprobe` NO se instala a propósito: `ffprobe-static` pesa 336 MB porque trae
// los binarios de las tres plataformas, y eso solo revienta el límite de 250 MB
// de una función de Vercel. Todo lo que necesitamos leer de un MP4 —resolución,
// duración, fps, códec, tasa de bits— ya lo saca `probeMp4` de `outroQuality.js`
// parseando el contenedor, sin decodificar y sin dependencias.
//
// QUÉ SÍ Y QUÉ NO ES POSTPROCESAR
//
// La regla durable del sitio prohíbe retocar el CONTENIDO que devuelve un
// modelo generativo: nada de composites, máscaras, blur ni recortes sobre la
// imagen, porque se ve pegado. Esto no es eso. Acá se hacen tres cosas y
// ninguna toca el contenido:
//
//   · MONTAR — poner un clip después de otro con un fundido entre ellos.
//   · MEZCLAR — poner música debajo, con entrada y salida suaves.
//   · NORMALIZAR — llevar un clip a la resolución, el fps y el códec comunes,
//     y sólo cuando el proveedor lo entregó distinto. Sin ese paso, un clip a
//     24 fps entre dos a 30 rompe el montaje entero. Es conformado técnico,
//     no una decisión estética, y se anota cuando ocurre.
//
// La extracción de fotogramas es LECTURA pura: saca imágenes del clip para
// mirarlas, y jamás modifica el archivo que se sube.
// ════════════════════════════════════════════════════════════════════

import { spawn } from 'child_process';
import { mkdtemp, writeFile, readFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { TRANSITIONS } from './reelSpec.js';

// ─── El binario ────────────────────────────────────────────────────────────
//
// `FFMPEG_PATH` permite apuntar a un ffmpeg del sistema (un contenedor propio,
// una imagen con ffmpeg ya dentro) sin desinstalar el estático. Si no está, se
// usa el que trae el paquete. Si tampoco está, `isFfmpegAvailable()` devuelve
// false y el registro de proveedores simplemente no ofrece este motor: el
// módulo cae al proveedor alojado en vez de romperse.
let _binary;
let _resolved = false;

const resolveBinary = async () => {
    if (_resolved) return _binary;
    _resolved = true;

    if (process.env.FFMPEG_PATH) {
        _binary = process.env.FFMPEG_PATH;
        return _binary;
    }
    try {
        const mod = await import('ffmpeg-static');
        const p = mod.default || mod;
        _binary = typeof p === 'string' && p.length ? p : null;
    } catch (e) {
        console.warn('[REEL/ffmpeg] ffmpeg-static no disponible:', e.message);
        _binary = null;
    }
    return _binary;
};

export const isFfmpegAvailable = async () => Boolean(await resolveBinary());

// Ejecuta ffmpeg. Nunca usa shell: los argumentos van en array, así que una URL
// o un nombre de archivo con caracteres raros no puede convertirse en comando.
//
// `stderr` se acumula porque es donde ffmpeg escribe TODO —progreso y errores—
// y sin él un fallo llega como "exit code 1" sin explicación. Se recorta al
// final: los filtros complejos generan miles de líneas.
const runFfmpeg = (args, { timeoutMs = 100_000, label = 'ffmpeg' } = {}) =>
    new Promise((resolve, reject) => {
        resolveBinary().then(bin => {
            if (!bin) return reject(new Error('FFmpeg no está disponible en este entorno.'));

            const proc = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
            let stderr = '';
            let killed = false;

            const timer = setTimeout(() => {
                killed = true;
                proc.kill('SIGKILL');
            }, timeoutMs);

            proc.stderr.on('data', d => {
                stderr += d.toString();
                // Un filtro complejo puede escupir megas de log. Se conserva el
                // final, que es donde está el error.
                if (stderr.length > 40_000) stderr = stderr.slice(-20_000);
            });
            proc.on('error', err => { clearTimeout(timer); reject(new Error(`${label}: ${err.message}`)); });
            proc.on('close', code => {
                clearTimeout(timer);
                if (killed) return reject(new Error(`${label}: se agotó el tiempo (${Math.round(timeoutMs / 1000)}s).`));
                if (code !== 0) {
                    const tail = stderr.trim().split('\n').slice(-6).join(' · ').slice(0, 600);
                    return reject(new Error(`${label} falló (código ${code}): ${tail}`));
                }
                resolve({ stderr });
            });
        }).catch(reject);
    });

// Carpeta temporal propia por operación. En una función serverless `/tmp` es el
// único punto escribible y se comparte entre invocaciones de la misma
// instancia: sin un directorio propio, dos montajes simultáneos se pisarían los
// archivos. El `finally` la borra siempre — `/tmp` tiene 512 MB y no se vacía
// solo entre invocaciones.
const withTempDir = async (fn) => {
    const dir = await mkdtemp(path.join(tmpdir(), 'reel-'));
    try {
        return await fn(dir);
    } finally {
        await rm(dir, { recursive: true, force: true }).catch(() => { });
    }
};

// ─── Extracción de fotogramas ──────────────────────────────────────────────
//
// Tres por clip: uno al principio, uno al medio y uno al final. Los tres, y no
// sólo el primero, porque la deriva de un modelo generativo es progresiva —el
// primer fotograma casi siempre es fiel a la foto y el último es donde el
// logotipo se deforma—. Mirar sólo la entrada daría por buena una escena que se
// rompe a la salida.
//
// `-ss` va ANTES de `-i` a propósito: así ffmpeg busca por keyframe sin
// decodificar todo lo anterior, que es lo que hace la operación barata.
export const extractFrames = async (videoBuffer, { durationSec = 5, count = 3 } = {}) =>
    withTempDir(async (dir) => {
        const input = path.join(dir, 'clip.mp4');
        await writeFile(input, videoBuffer);

        // Márgenes de 0,2 s: pedir exactamente el segundo 0 o el último puede
        // caer fuera del rango y devolver un fotograma vacío.
        const span = Math.max(0.5, durationSec - 0.4);
        const stamps = count === 1
            ? [span / 2]
            : Array.from({ length: count }, (_, i) => Number((0.2 + (span * i) / (count - 1)).toFixed(2)));

        const frames = [];
        for (const [i, at] of stamps.entries()) {
            const out = path.join(dir, `f${i}.jpg`);
            try {
                await runFfmpeg(
                    ['-y', '-ss', String(at), '-i', input, '-frames:v', '1', '-q:v', '3', out],
                    { timeoutMs: 20_000, label: `extraer fotograma ${at}s` }
                );
                frames.push({
                    at,
                    position: i === 0 ? 'inicio' : i === stamps.length - 1 ? 'fin' : 'medio',
                    buffer: await readFile(out)
                });
            } catch (e) {
                // Un fotograma que no sale no invalida los otros dos.
                console.warn(`[REEL/ffmpeg] no se pudo extraer el fotograma de ${at}s: ${e.message}`);
            }
        }
        return frames;
    });

// ─── Medición de audio ─────────────────────────────────────────────────────
//
// Devuelve la duración REAL de un archivo de audio. Es la pieza sobre la que se
// apoya el Narrative Timing Engine: estimar cuánto va a durar una locución sirve
// para pedir el texto, pero la que manda es la del archivo que devolvió el
// proveedor de voz.
//
// Se usa el propio ffmpeg (`-f null -`) en vez de ffprobe: ffprobe-static pesa
// 336 MB y revienta el límite de la función. ffmpeg escribe la duración en
// stderr, que es de donde se lee.
export const measureAudioDuration = async (buffer) => withTempDir(async (dir) => {
    const input = path.join(dir, 'audio.bin');
    await writeFile(input, buffer);

    // `-f null -` decodifica sin escribir nada. Es exacto porque recorre el
    // archivo entero, a diferencia de la cabecera, que en un MP3 de tasa
    // variable miente.
    const { stderr } = await runFfmpeg(['-i', input, '-f', 'null', '-'],
        { timeoutMs: 30_000, label: 'medir audio' });

    // `time=00:00:13.44` de la última línea de progreso: es lo que realmente se
    // decodificó. Se prefiere a `Duration:` porque esa viene de la cabecera.
    const times = [...stderr.matchAll(/time=(\d+):(\d+):(\d+\.?\d*)/g)];
    if (times.length) {
        const [, h, m, sec] = times[times.length - 1];
        return Number(h) * 3600 + Number(m) * 60 + Number(sec);
    }
    const dur = stderr.match(/Duration:\s*(\d+):(\d+):(\d+\.?\d*)/);
    if (dur) return Number(dur[1]) * 3600 + Number(dur[2]) * 60 + Number(dur[3]);

    throw new Error('No se pudo determinar la duración del audio.');
});

// ─── Normalización ─────────────────────────────────────────────────────────
//
// Sólo se llama cuando el clip NO coincide con el destino. Un clip que ya viene
// en 1080×1920 a 30 fps y H.264 se usa tal cual, sin recodificar: recodificar
// por costumbre degrada la imagen y gasta tiempo.
//
// `force_original_aspect_ratio=increase` + `crop` llena el cuadro sin deformar.
// Recorta, sí — pero la alternativa es una banda negra o una imagen estirada, y
// esto sólo ocurre si el clip vino en otra proporción, cosa que el módulo ya
// avisó antes de gastar créditos (`inspectSourceImage`).
export const needsNormalisation = (probe, { width, height, fps = 30 }) => {
    const reasons = [];
    if (!probe) return { needed: true, reasons: ['No se pudo leer el clip.'] };
    if (probe.width !== width || probe.height !== height) {
        reasons.push(`resolución ${probe.width}×${probe.height} en vez de ${width}×${height}`);
    }
    if (probe.fps != null && Math.abs(probe.fps - fps) > 0.5) {
        reasons.push(`${probe.fps} fps en vez de ${fps}`);
    }
    if (probe.videoCodec && !['avc1', 'h264'].includes(probe.videoCodec)) {
        reasons.push(`códec ${probe.videoCodec} en vez de H.264`);
    }
    return { needed: reasons.length > 0, reasons };
};

// ─── Montaje ───────────────────────────────────────────────────────────────

// `xfade` es el fundido real entre dos clips: solapa las dos imágenes durante
// `duration` segundos. Por eso la pieza dura menos que la suma de los clips, y
// por eso `offset` se calcula acumulando lo ya consumido.
//
// El nombre del efecto se traduce al de ffmpeg; lo que no reconoce cae a
// `fade`, que es el neutro. Un efecto parecido pero distinto sería peor que el
// fundido limpio.
const XFADE = {
    fade: 'fade',
    dissolve: 'dissolve',
    slideLeft: 'slideleft',
    zoom: 'smoothleft',
    blur: 'fadeblack',
    none: null
};

const xfadeName = (transitionId) => {
    if (!transitionId || transitionId === 'cut') return null;
    const provider = TRANSITIONS[transitionId]?.provider || transitionId;
    if (provider === 'none') return null;
    return XFADE[provider] || 'fade';
};

// Construye el grafo de filtros. Se hace en una función aparte porque es la
// parte que se puede razonar y probar sin ejecutar ffmpeg.
export const buildFilterGraph = ({
    clips, width, height, fps, hasMusic, totalSec,
    musicVolume = 0.85, fadeSec = 1,
    hasVoice = false, voiceLeadIn = 0, voiceStretch = 1, voiceIndex = null
}) => {
    const parts = [];

    // Cada entrada se conforma primero: escala, recorte, fps y formato de
    // píxel. `setsar=1` evita que un clip con píxeles no cuadrados desalinee el
    // fundido. Es barato y hace el grafo predecible.
    clips.forEach((clip, i) => {
        const trim = clip.startAt > 0 ? `trim=start=${clip.startAt}:end=${clip.startAt + clip.durationSec},setpts=PTS-STARTPTS,` : `trim=duration=${clip.durationSec},setpts=PTS-STARTPTS,`;
        parts.push(
            `[${i}:v]${trim}scale=${width}:${height}:force_original_aspect_ratio=increase,` +
            `crop=${width}:${height},fps=${fps},setsar=1,format=yuv420p[c${i}]`
        );
    });

    // Encadenado de fundidos. `offset` es el segundo de la línea de tiempo
    // donde empieza el fundido: lo acumulado menos lo que ya se solapó.
    let last = 'c0';
    let elapsed = clips[0].durationSec;

    for (let i = 1; i < clips.length; i++) {
        const name = xfadeName(clips[i].transitionIn);
        const out = i === clips.length - 1 ? 'vout' : `x${i}`;

        if (!name) {
            // Corte directo: concatenación simple, sin solapamiento.
            parts.push(`[${last}][c${i}]concat=n=2:v=1:a=0[${out}]`);
            elapsed += clips[i].durationSec;
        } else {
            const dur = TRANSITIONS[clips[i].transitionIn]?.overlap ?? 0.5;
            const offset = Number((elapsed - dur).toFixed(3));
            parts.push(`[${last}][c${i}]xfade=transition=${name}:duration=${dur}:offset=${offset}[${out}]`);
            elapsed += clips[i].durationSec - dur;
        }
        last = out;
    }
    // Con una sola escena no hay fundido y la salida sigue llamándose c0.
    if (clips.length === 1) parts.push(`[c0]null[vout]`);

    // ── Audio ──
    //
    // Tres casos: sólo música, sólo voz, o las dos con DUCKING. El ducking no es
    // bajarle el volumen a la música a ojo: es `sidechaincompress`, que la
    // comprime EN FUNCIÓN de la voz, así que baja sólo mientras se habla y vuelve
    // sola en los silencios. Bajarla de forma fija dejaría la pieza sorda en los
    // tramos sin locución.
    const AFORMAT = 'aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo';
    const fadeOutStart = Math.max(0, totalSec - fadeSec);
    let audioLabel = null;

    if (hasVoice) {
        // La voz entra con un retraso: arrancar pegada al primer fotograma suena
        // a error. `atempo` sólo comprime si el motor de tiempos lo pidió, y su
        // techo (4 %) está por debajo del umbral audible.
        const tempo = voiceStretch && voiceStretch > 1.001 ? `atempo=${voiceStretch},` : '';
        const delayMs = Math.round((voiceLeadIn || 0) * 1000);
        parts.push(
            `[${voiceIndex}:a]${tempo}adelay=${delayMs}|${delayMs},` +
            // La voz se normaliza a un objetivo más alto que la música: es la
            // que tiene que entenderse.
            `loudnorm=I=-14:TP=-1.5:LRA=7,${AFORMAT}[voice]`
        );
    }

    if (hasMusic) {
        parts.push(
            `[${clips.length}:a]atrim=0:${totalSec},asetpts=PTS-STARTPTS,` +
            `afade=t=in:st=0:d=${fadeSec},afade=t=out:st=${fadeOutStart}:d=${fadeSec},` +
            `loudnorm=I=-16:TP=-1.5:LRA=11,volume=${musicVolume},` +
            // Se fuerza la duración exacta: si la pista viene más corta que la
            // pieza, `apad` la completa con silencio en vez de dejar el final
            // sin audio, que es un salto audible.
            `apad,atrim=0:${totalSec},${AFORMAT}[music]`
        );
    }

    if (hasVoice && hasMusic) {
        // La voz alimenta la cadena lateral. `threshold` bajo y `ratio` alto
        // hacen que la música ceda en cuanto hay voz; `release` largo evita que
        // suba y baje entre palabras, que es lo que suena a bombeo.
        parts.push(
            `[voice]asplit=2[voice_out][voice_sc]`,
            // `sidechaincompress` termina cuando se acaba la MÁS CORTA de sus
            // dos entradas, que es la voz. Sin volver a fijar la duración, la
            // pista mezclada dura lo que la locución y `-shortest` recorta el
            // VIDEO a esa longitud: un Reel de 14 s salía de 12,85 s y perdía su
            // último segundo. Por eso el `apad`+`atrim` del final no es
            // decorativo — es lo que sostiene la duración de la pieza.
            `[music][voice_sc]sidechaincompress=threshold=0.05:ratio=8:attack=15:release=350:makeup=1[ducked]`,
            `[ducked][voice_out]amix=inputs=2:duration=longest:dropout_transition=0:weights=1 1,` +
            // Un limitador al final: la suma de dos pistas normalizadas puede
            // pasarse de 0 dBFS y saturar.
            `alimiter=limit=0.95,` +
            `apad,atrim=0:${totalSec},asetpts=PTS-STARTPTS,${AFORMAT}[aout]`
        );
        audioLabel = 'aout';
    } else if (hasVoice) {
        // Sólo voz: se completa con silencio hasta el final del video, para que
        // la pista de audio dure lo mismo que la imagen.
        parts.push(`[voice]apad,atrim=0:${totalSec},asetpts=PTS-STARTPTS,${AFORMAT}[aout]`);
        audioLabel = 'aout';
    } else if (hasMusic) {
        parts.push(`[music]anull[aout]`);
        audioLabel = 'aout';
    }

    return { filter: parts.join(';'), videoLabel: 'vout', audioLabel, computedSec: Number(elapsed.toFixed(3)) };
};

// Tasa de bits objetivo por resolución. Se fija en vez de dejar CRF libre
// porque el módulo VALIDA la tasa de bits del resultado: con CRF puro, un clip
// de poco movimiento puede salir muy comprimido y hacer fallar su propia
// validación. Estos valores son los que las redes verticales recomiendan.
const targetBitrate = (width, height) => {
    const pixels = width * height;
    if (pixels >= 3840 * 2160) return { v: '30M', max: '36M', buf: '60M' };
    if (pixels >= 2560 * 1440) return { v: '16M', max: '20M', buf: '32M' };
    return { v: '10M', max: '12M', buf: '20M' };
};

// Monta el Reel. Recibe los clips YA descargados como buffers —el que llama
// decide de dónde vienen— y devuelve el MP4 final más su miniatura.
export const composeReel = async ({
    clips,
    musicBuffer = null,
    voiceBuffer = null,
    voiceLeadIn = 0,
    voiceStretch = 1,
    width = 1080,
    height = 1920,
    fps = 30,
    musicVolume = 0.85,
    fadeSec = 1,
    timeoutMs = 100_000
}) => withTempDir(async (dir) => {
    if (!clips?.length) throw new Error('No hay clips que montar.');

    const inputs = [];
    for (const [i, clip] of clips.entries()) {
        const file = path.join(dir, `c${i}.mp4`);
        await writeFile(file, clip.buffer);
        inputs.push('-i', file);
    }
    // El ORDEN de las entradas define los índices del grafo: primero los clips,
    // después la música y por último la voz. Cambiarlo rompe el filtro entero.
    if (musicBuffer) {
        const file = path.join(dir, 'music.audio');
        await writeFile(file, musicBuffer);
        inputs.push('-i', file);
    }
    const voiceIndex = voiceBuffer ? clips.length + (musicBuffer ? 1 : 0) : null;
    if (voiceBuffer) {
        const file = path.join(dir, 'voice.audio');
        await writeFile(file, voiceBuffer);
        inputs.push('-i', file);
    }

    const totalSec = clips.reduce((sum, c, i) => {
        if (i === 0) return c.durationSec;
        const name = xfadeName(c.transitionIn);
        const overlap = name ? (TRANSITIONS[c.transitionIn]?.overlap ?? 0.5) : 0;
        return sum + c.durationSec - overlap;
    }, 0);

    const graph = buildFilterGraph({
        clips, width, height, fps,
        hasMusic: Boolean(musicBuffer),
        totalSec: Number(totalSec.toFixed(3)),
        musicVolume, fadeSec,
        hasVoice: Boolean(voiceBuffer), voiceLeadIn, voiceStretch, voiceIndex
    });

    const out = path.join(dir, 'reel.mp4');
    const br = targetBitrate(width, height);

    const args = [
        '-y', ...inputs,
        '-filter_complex', graph.filter,
        '-map', `[${graph.videoLabel}]`,
        ...(graph.audioLabel ? ['-map', `[${graph.audioLabel}]`] : []),
        '-c:v', 'libx264',
        // `veryfast` es el compromiso medido: con `medium` el montaje se va por
        // encima del techo de la función y con `ultrafast` la tasa de bits sube
        // sin ganar calidad.
        '-preset', 'veryfast',
        '-profile:v', 'high', '-level', '4.2',
        '-b:v', br.v, '-maxrate', br.max, '-bufsize', br.buf,
        '-pix_fmt', 'yuv420p',
        '-r', String(fps),
        // Keyframe cada 2 s: es lo que las redes esperan para poder recortar y
        // reproducir en streaming sin recodificar.
        '-g', String(fps * 2),
        ...(graph.audioLabel
            ? ['-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2']
            : ['-an']),
        // El índice al principio del archivo: sin esto el reproductor tiene que
        // descargar el MP4 entero antes de mostrar el primer fotograma.
        '-movflags', '+faststart',
        '-shortest',
        out
    ];

    await runFfmpeg(args, { timeoutMs, label: 'montaje del Reel' });
    const buffer = await readFile(out);

    // Miniatura del segundo 1: el fotograma 0 de un fundido suele estar casi
    // negro.
    let posterBuffer = null;
    try {
        const poster = path.join(dir, 'poster.jpg');
        await runFfmpeg(['-y', '-ss', '1', '-i', out, '-frames:v', '1', '-q:v', '2', poster],
            { timeoutMs: 20_000, label: 'miniatura' });
        posterBuffer = await readFile(poster);
    } catch (e) {
        // Sin miniatura el Reel sigue siendo válido.
        console.warn('[REEL/ffmpeg] no se pudo generar la miniatura:', e.message);
    }

    return {
        buffer, posterBuffer,
        expectedDurationSec: graph.computedSec,
        filter: graph.filter,
        hasVoice: Boolean(voiceBuffer),
        hasMusic: Boolean(musicBuffer)
    };
});

// Conforma un clip suelto al formato común. Se usa antes del montaje sólo
// cuando `needsNormalisation` lo pide.
export const normaliseClip = async (buffer, { width, height, fps = 30, timeoutMs = 60_000 }) =>
    withTempDir(async (dir) => {
        const input = path.join(dir, 'in.mp4');
        const output = path.join(dir, 'out.mp4');
        await writeFile(input, buffer);
        const br = targetBitrate(width, height);
        await runFfmpeg([
            '-y', '-i', input,
            '-vf', `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},fps=${fps},setsar=1`,
            '-c:v', 'libx264', '-preset', 'veryfast',
            '-b:v', br.v, '-maxrate', br.max, '-bufsize', br.buf,
            '-pix_fmt', 'yuv420p', '-an',
            '-movflags', '+faststart', output
        ], { timeoutMs, label: 'normalizar clip' });
        return readFile(output);
    });
