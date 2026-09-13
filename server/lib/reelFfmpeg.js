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
import { clipOverlap } from './reelOutro.js';

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

/**
 * Comprobación real del entorno de montaje: que el binario esté, que se pueda
 * EJECUTAR y que `/tmp` acepte escritura.
 *
 * `isFfmpegAvailable` sólo dice que la ruta se resolvió, y eso no basta: un
 * binario sin permiso de ejecución o un `/tmp` lleno dan exactamente el mismo
 * síntoma —el montaje falla— con un mensaje que no señala la causa. Esto lo
 * separa en tres respuestas distintas, y cada una tiene un arreglo distinto.
 *
 * No lanza: devuelve el diagnóstico para que lo muestre quien lo pida.
 */
export const checkFfmpegEnvironment = async () => {
    const report = { ok: false, binary: false, executable: false, tmpWritable: false, version: null, error: null };

    const bin = await resolveBinary();
    report.binary = Boolean(bin);
    if (!bin) {
        report.error = 'No se encontró el binario de FFmpeg. Revisar la dependencia ffmpeg-static o la variable FFMPEG_PATH.';
        return report;
    }

    try {
        const { stderr } = await runFfmpeg(['-version'], { timeoutMs: 10_000, label: 'ffmpeg -version' });
        report.executable = true;
        report.version = (stderr || '').split('\n')[0]?.slice(0, 120) || null;
    } catch (e) {
        // `-version` escribe en stdout, no en stderr; que salga con código 0 ya
        // demuestra que el binario corre, que es lo que se quiere saber acá.
        if (/EACCES|permission/i.test(e.message)) {
            report.error = `El binario de FFmpeg existe pero no se puede ejecutar: ${e.message}`;
            return report;
        }
        report.executable = true;
    }

    try {
        const dir = await mkdtemp(path.join(tmpdir(), 'reel-check-'));
        await writeFile(path.join(dir, 'probe.txt'), 'ok');
        await rm(dir, { recursive: true, force: true });
        report.tmpWritable = true;
    } catch (e) {
        report.error = `El almacenamiento temporal no acepta escritura: ${e.message}`;
        return report;
    }

    report.ok = report.binary && report.executable && report.tmpWritable;
    return report;
};

// Ejecuta ffmpeg. Nunca usa shell: los argumentos van en array, así que una URL
// o un nombre de archivo con caracteres raros no puede convertirse en comando.
//
// `stderr` se acumula porque es donde ffmpeg escribe TODO —progreso y errores—
// y sin él un fallo llega como "exit code 1" sin explicación. Se recorta al
// final: los filtros complejos generan miles de líneas.
//
// EXPORTADO desde v4.934: el recorte de videos de la Biblioteca Multimedia
// corre por este MISMO runner en vez de escribirse otro — dos caminos hacia
// el binario se separan en silencio (la regla de `sendCampaign`).
export const runFfmpeg = (args, { timeoutMs = 100_000, label = 'ffmpeg' } = {}) =>
    new Promise((resolve, reject) => {
        resolveBinary().then(bin => {
            if (!bin) return reject(new Error('FFmpeg no está disponible en este entorno.'));

            // `stdout` se descarta en el propio descriptor, no se abre como
            // tubería. Con 'pipe' y sin nadie leyendo, el búfer del sistema
            // (64 KB) se llena y ffmpeg queda BLOQUEADO escribiendo: el proceso
            // no falla, se cuelga, y lo único que se ve después es un tiempo
            // agotado sin explicación. Acá la salida va siempre a un archivo,
            // así que no hay nada que leer de stdout.
            const proc = spawn(bin, args, { stdio: ['ignore', 'ignore', 'pipe'] });
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
            // El diagnóstico viaja EN el error, no sólo al log: es lo que el
            // panel de administración necesita para saber qué se ejecutó, con
            // qué código salió y qué dijo ffmpeg. Un «no se pudo montar» sin
            // esto obliga a reproducir el fallo a ciegas.
            const diagnose = (err) => {
                err.ffmpeg = {
                    label,
                    // El binario no: es una ruta interna del despliegue.
                    args: args.map(a => (a.length > 300 ? `${a.slice(0, 300)}…` : a)),
                    exitCode: null,
                    timedOut: killed,
                    stderrTail: stderr.trim().split('\n').slice(-25).join('\n').slice(0, 4000)
                };
                return err;
            };

            proc.on('error', err => {
                clearTimeout(timer);
                reject(diagnose(new Error(`${label}: ${err.message}`)));
            });
            proc.on('close', (code, signal) => {
                clearTimeout(timer);
                if (killed) {
                    const e = diagnose(new Error(`${label}: se agotó el tiempo (${Math.round(timeoutMs / 1000)}s).`));
                    return reject(e);
                }
                // ⚠️ «CÓDIGO NULL» NO ES UN CÓDIGO DE SALIDA: ES UN PROCESO
                // MATADO (v4.1051).
                //
                // Node entrega `code === null` cuando el proceso terminó por una
                // SEÑAL, y entonces el código no existe. Decir «falló (código
                // null)» era describir el hueco en vez del hecho, y lo que se
                // veía en la ficha no le dice nada a nadie —es literalmente el
                // reporte que abrió esta versión—.
                //
                // Si no fuimos nosotros (eso ya se contestó arriba), a ffmpeg lo
                // mató el SISTEMA. Con SIGKILL sobre un montaje de video la causa
                // es, casi siempre, que pidió más memoria de la que la función
                // tiene: el proceso no falla, desaparece. Se NOMBRA, con su
                // salida, en vez de mandar a leer una cola de stderr que sólo
                // contiene el progreso normal hasta el instante en que murió.
                if (code === null) {
                    const porMemoria = signal === 'SIGKILL';
                    const e = diagnose(new Error(
                        `${label}: el sistema detuvo el proceso (${signal || 'sin señal'}). ` +
                        (porMemoria
                            ? 'Casi siempre es falta de memoria: el montaje pidió más de la que hay disponible.'
                            : 'El proceso no llegó a terminar por su cuenta.')
                    ));
                    e.ffmpeg.signal = signal || null;
                    e.ffmpeg.likelyOutOfMemory = porMemoria;
                    e.killedBySignal = true;
                    e.likelyOutOfMemory = porMemoria;
                    return reject(e);
                }
                if (code !== 0) {
                    const tail = stderr.trim().split('\n').slice(-6).join(' · ').slice(0, 600);
                    const e = diagnose(new Error(`${label} falló (código ${code}): ${tail}`));
                    e.ffmpeg.exitCode = code;
                    return reject(e);
                }
                resolve({ stderr });
            });
        }).catch(reject);
    });

// Carpeta temporal propia por operación. En una función serverless `/tmp` es el
// único punto escribible y se comparte entre invocaciones de la misma
// instancia: sin un directorio propio, dos montajes simultáneos se pisarían los
// archivos. El `finally` la borra siempre — `/tmp` tiene 512 MB y no se vacía
// solo entre invocaciones. Exportada junto con `runFfmpeg` (v4.934).
export const withTempDir = async (fn) => {
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
// El conformado de cada clip NO se hace en una pasada aparte: vive dentro del
// grafo de filtros del montaje (`buildFilterGraph`), que escala, recorta, fija
// los fps y el formato de píxel de cada entrada antes de encadenar los
// fundidos. Hasta v4.670 había además una pasada previa que recodificaba el
// clip entero para dejarlo igual que lo que el grafo iba a hacer de todos
// modos: doble encode, doble pérdida de generación, y el tiempo agotado que
// dejaba el montaje sin terminar. No reintroducirla.

// ─── Movimiento 2.5D sobre la fotografía quieta ────────────────────────────
//
// Anima una foto SIN pasarla por un modelo generativo: un desplazamiento lento
// de la ventana de encuadre sobre la imagen sobreescalada. Es el recurso
// clásico del documental.
//
// Por qué existe: un motor image-to-video REDIBUJA lo que anima, y en una foto
// de grupo eso significa rehacer rostros, manos e insignias. Cuando la medición
// de fidelidad dice que la escena no conservó a las personas, regenerarla con
// el mismo motor vuelve a redibujarlas — es gastar créditos para repetir el
// problema. Esta vía garantiza la identidad porque NO reinterpreta nada: los
// píxeles son los de la fotografía.
//
// Cuesta ~2-8 s y cero créditos, frente a 1-3 minutos y 20 créditos del motor.
//
// El sobreescalado (`overscan`) es lo único que se sacrifica: para que la
// ventana pueda moverse hace falta margen. Con 1,06 el borde que queda fuera es
// del 6 %, por debajo de lo que se nota en una foto de grupo, y es lo que
// separa esto de un plano completamente fijo. Con `overscan: 1` no hay
// movimiento y la foto se ve entera.
const DRIFTS = {
    // [x, y] como fracción del margen disponible: de dónde a dónde va la ventana.
    up:    { from: [0.5, 1.0], to: [0.5, 0.0] },
    down:  { from: [0.5, 0.0], to: [0.5, 1.0] },
    left:  { from: [1.0, 0.5], to: [0.0, 0.5] },
    right: { from: [0.0, 0.5], to: [1.0, 0.5] },
    still: { from: [0.5, 0.5], to: [0.5, 0.5] }
};

export const renderStillMotion = async (imageBuffer, {
    width = 1080, height = 1920, fps = 30,
    durationSec = 5, drift = 'up', overscan = 1.06,
    timeoutMs = 90_000
} = {}) => withTempDir(async (dir) => {
    const input = path.join(dir, 'still.png');
    const output = path.join(dir, 'out.mp4');
    await writeFile(input, imageBuffer);

    const d = DRIFTS[drift] || DRIFTS.up;
    // El lienzo intermedio: el destino con margen, en números pares (x264 los
    // exige) y sin exagerar — cuanto mayor, más cuesta escalar.
    const bigW = Math.round((width * Math.max(1, overscan)) / 2) * 2;
    const bigH = Math.round((height * Math.max(1, overscan)) / 2) * 2;

    // La ventana se interpola con `t`. `min(t/dur,1)` la deja quieta al final en
    // vez de salirse si el contenedor entrega un fotograma de más.
    const p = `min(t/${durationSec},1)`;
    const x = `(iw-${width})*(${d.from[0]}+(${d.to[0]}-${d.from[0]})*${p})`;
    const y = `(ih-${height})*(${d.from[1]}+(${d.to[1]}-${d.from[1]})*${p})`;

    const br = targetBitrate(width, height);
    await runFfmpeg([
        '-y', '-loop', '1', '-i', input, '-t', String(durationSec),
        '-filter_complex',
        // Se escala UNA vez y después sólo se recorta: mover la ventana es
        // barato, reescalar cada fotograma —lo que hace `zoompan`— no lo es.
        `scale=${bigW}:${bigH}:force_original_aspect_ratio=increase,crop=${bigW}:${bigH},` +
        `setsar=1,fps=${fps},crop=${width}:${height}:x='${x}':y='${y}',format=yuv420p`,
        '-c:v', 'libx264', '-preset', 'veryfast',
        '-b:v', br.v, '-maxrate', br.max, '-bufsize', br.buf,
        '-pix_fmt', 'yuv420p', '-an', '-movflags', '+faststart', output
    ], { timeoutMs, label: 'movimiento 2.5D' });

    return readFile(output);
});

/**
 * Convierte una imagen fija en un clip de vídeo QUIETO.
 *
 * Es la tarjeta de cierre: la placa institucional del final. No usa
 * `renderStillMotion` a propósito —esa desplaza la ventana de encuadre, y en
 * una placa con texto eso lo movería—. Acá lo correcto es que no se mueva nada:
 * el logotipo, el nombre del club y la URL tienen que quedarse fijos para poder
 * leerse y, si hace falta, fotografiarse con el teléfono.
 *
 * La imagen ya viene del tamaño del cuadro (`renderClosingCard`), así que sólo
 * se conforma por si acaso y se codifica con los mismos ajustes que el resto:
 * un clip con otro perfil o fps obligaría al montaje a recodificarlo.
 */
export const renderCardClip = async (imageBuffer, {
    width = 1080, height = 1920, fps = 30, durationSec = 3, timeoutMs = 60_000
} = {}) => withTempDir(async (dir) => {
    const input = path.join(dir, 'card.png');
    const output = path.join(dir, 'card.mp4');
    await writeFile(input, imageBuffer);

    const br = targetBitrate(width, height);
    await runFfmpeg([
        '-y', '-loop', '1', '-i', input, '-t', String(durationSec),
        '-vf', `scale=${width}:${height}:force_original_aspect_ratio=increase,` +
               `crop=${width}:${height},setsar=1,fps=${fps},format=yuv420p`,
        '-c:v', 'libx264', '-preset', 'veryfast',
        '-b:v', br.v, '-maxrate', br.max, '-bufsize', br.buf,
        '-pix_fmt', 'yuv420p', '-an', '-movflags', '+faststart', output
    ], { timeoutMs, label: 'tarjeta de cierre' });

    return readFile(output);
});

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


// ─── Cuánta memoria pide un grafo, y cómo partirlo si no cabe (v4.1051) ────
//
// ⚠️ FFMPEG NO MONTA EN MEMORIA CONSTANTE: el grafo retiene fotogramas CRUDOS.
//
// Es la causa medida del defecto que este bloque corrige. En un encadenado de
// `xfade`, cada eslabón sólo puede emitir cuando su entrada A ya pasó por los
// anteriores, así que RETIENE en RAM los fotogramas de su entrada B hasta que
// llega el punto del cruce. Un fotograma de 1080×1920 en yuv420p son 3,1 MB, y
// un clip de 4,4 s a 30 fps son 132 fotogramas: ~410 MB por eslabón.
//
// Medido con el binario empaquetado, clips de 4,4 s a 1080×1920@30, sobre el
// grafo pelado:
//
//   3 clips →  790 MB     5 clips → 1161 MB     7 clips → 1509 MB
//
// Crecimiento LINEAL, ~180 MB por clip. Y sobre `composeReel` entero —que es
// lo que de verdad corre—, con música, locución y cuatro rótulos:
//
//   7 clips sin rótulos → 2274 MB        7 clips con rótulos → 3163 MB
//
// A un proceso que pide más memoria de la que la función tiene lo mata el
// sistema con SIGKILL, y eso es lo que llega a la ficha como «código null».
//
// Y explica por qué el defecto aparecía EXACTAMENTE al activar el outro: el
// Reel sin cierre son seis clips y montaba; el outro añade el séptimo, suma sus
// ~180 MB y cruza el techo. No fallaba el outro — fallaba el clip de más.
//
// La salida es montar POR TRAMOS: grupos de clips que sí caben, cada uno a un
// archivo intermedio, y una pasada final que los une. Medido sobre el mismo
// caso: **3163 MB en una pasada → 1563 MB en tramos**, con un 18 % más de
// tiempo. El troceado no cambia ni un fotograma de lo que se ve: las mismas
// transiciones, en los mismos segundos.

// Fotograma crudo en yuv420p: un byte de luma por píxel y medio de croma.
const FRAME_BYTES = (width, height) => width * height * 1.5;

// Lo que cuesta el proceso sin contar lo que retiene: decodificadores, x264 con
// su lookahead y los búferes de salida. Sale de despejar la recta medida
// (790 MB con 3 clips, −180 por clip).
const BASE_MB = 430;

// ⚠️ LA ESTIMACIÓN SE CALIBRA PARA NO QUEDARSE CORTA, y el motivo es asimétrico:
// pasarse cuesta una pasada de más —segundos y una recodificación a CRF alto—;
// quedarse corto cuesta el montaje entero, que es el defecto que se está
// corrigiendo. Por eso el coeficiente no sale del grafo pelado (41 MB/s) sino
// de `composeReel` completo, que es lo que se ejecuta: 2274 MB con 7 clips y
// 22,2 s en espera despejan 74 MB/s.
const HOLD_MB_PER_SEC_REF = 74;
const REF_FRAME_BYTES = FRAME_BYTES(1080, 1920);
const REF_FPS = 30;

// Un rótulo es un PNG con transparencia del tamaño del cuadro: 4 bytes por
// píxel, el doble que un fotograma de video. Su coste NO es constante —crece
// con lo que la cadena de fundidos retrasa la salida—: medido entre 159 MB
// (dos entradas) y 272 MB (siete) por rótulo a 1080×1920. Se toma el peor
// caso, por lo mismo de arriba.
const OVERLAY_MB_REF = 272;

// Cada pista de audio que el grafo mezcla —música, locución, la del outro—
// arrastra sus propios búferes y su cadena de filtros. Medido: los mismos siete
// clips pasan de 2074 MB a 2274 MB al sumarles música y locución, ~100 MB por
// pista.
const AUDIO_TRACK_MB = 100;

/**
 * Cuánto va a pedir el montaje, en MB. Es una ESTIMACIÓN calibrada, no una
 * medida: se usa para DECIDIR si trocear, y equivocarse hacia arriba sólo
 * cuesta una pasada de más.
 *
 * PURA: no ejecuta nada. Es lo que permite probar la decisión sin montar.
 */
export const estimateGraphMemoryMB = ({
    clips = [], width = 1080, height = 1920, fps = 30, overlayCount = 0,
    audioTracks = 0
} = {}) => {
    if (!clips.length) return BASE_MB;
    const escala = (FRAME_BYTES(width, height) / REF_FRAME_BYTES) * (fps / REF_FPS);
    // El primer clip no se retiene: se consume desde el arranque. Lo que pesa
    // es todo lo que espera su turno.
    const segundosEnEspera = clips.slice(1).reduce((s, c) => s + (Number(c?.durationSec) || 0), 0);
    const retenido = HOLD_MB_PER_SEC_REF * segundosEnEspera * escala;
    const rotulos = OVERLAY_MB_REF * Math.max(0, overlayCount) * (FRAME_BYTES(width, height) / REF_FRAME_BYTES);
    const audio = AUDIO_TRACK_MB * Math.max(0, audioTracks);
    return Math.round(BASE_MB + retenido + rotulos + audio);
};

/**
 * La duración de una cadena de clips encadenados con sus transiciones.
 *
 * Vive acá y en ningún otro sitio porque la consumen el montaje de una pasada,
 * la duración que se le declara a cada tramo y la validación del resultado.
 * Con la aritmética escrita dos veces, un tramo diría durar lo que no dura y el
 * `offset` del cruce siguiente caería en el segundo equivocado — y eso no da
 * ningún error: da una pieza con la transición corrida.
 */
export const chainDurationSec = (clips = []) => clips.reduce((sum, c, i) => {
    if (i === 0) return Number(c?.durationSec) || 0;
    const name = xfadeName(c.transitionIn);
    const overlap = name ? (clipOverlap(c, i, TRANSITIONS) || 0.5) : 0;
    return sum + (Number(c?.durationSec) || 0) - overlap;
}, 0);

// Presupuesto por defecto. Deliberadamente MUY por debajo de la memoria de la
// función (declarada en `vercel.json`): lo que sobra lo necesitan Node, los
// búferes de los clips descargados y el máster que se lee para subirlo.
export const DEFAULT_MEMORY_BUDGET_MB = Number(process.env.REEL_FFMPEG_MEMORY_BUDGET_MB) || 1500;

/**
 * Cómo montar: de una pasada, o en qué tramos.
 *
 * ⚠️ EL OUTRO NUNCA ENTRA EN UN TRAMO. Su audio se mezcla EN SU SITIO de la
 * línea de tiempo, y quien sabe en qué segundo arranca es `buildFilterGraph`
 * recorriendo la cadena (`outroAudio`). Metido dentro de un tramo, su pista
 * quedaría horneada en el intermedio —que se monta SIN audio— y el cierre
 * saldría mudo, que es justo lo que el usuario pidió que se oyera.
 *
 * ⚠️ Y UN TRAMO NUNCA ES DE UN SOLO CLIP: no ahorraría nada —un clip suelto no
 * se encadena con nadie— y costaría una recodificación entera. Ante la duda se
 * deja en la pasada final, que es donde estaba.
 *
 * PURA.
 */
export const planComposition = ({
    clips = [], width = 1080, height = 1920, fps = 30, overlayCount = 0,
    audioTracks = 0, budgetMB = DEFAULT_MEMORY_BUDGET_MB
} = {}) => {
    const estimado = estimateGraphMemoryMB({ clips, width, height, fps, overlayCount, audioTracks });
    if (clips.length < 4 || estimado <= budgetMB) {
        return { mode: 'single', groups: [], estimatedMB: estimado, budgetMB, reason: null };
    }

    // El outro se aparta ANTES de agrupar: el resto es lo que se puede trocear.
    const ultimoEsOutro = Boolean(clips[clips.length - 1]?.isOutro);
    const agrupables = ultimoEsOutro ? clips.slice(0, -1) : clips.slice();

    // Cuántos clips caben en un tramo. Un tramo se monta SIN audio y SIN
    // rótulos, así que su presupuesto es el del grafo pelado.
    const cabenEnUnTramo = (desde) => {
        let n = 1;
        while (desde + n < agrupables.length) {
            const intento = agrupables.slice(desde, desde + n + 1);
            if (estimateGraphMemoryMB({ clips: intento, width, height, fps, overlayCount: 0 }) > budgetMB) break;
            n++;
        }
        return Math.max(2, n);
    };

    // ⚠️ LA UNIÓN TAMBIÉN TIENE QUE CABER, y es la que más pide: lleva el audio
    // y los rótulos. Agrupar mirando sólo los tramos dejaba una pasada final
    // con casi tantas entradas como clips había —o sea, el mismo problema que
    // se vino a resolver—. Se aprieta el tamaño de los tramos hasta que la
    // unión entra, con un tope de vueltas: el troceado es una mejora, no puede
    // convertirse en un bucle.
    let groups = [];
    let techo = agrupables.length;
    for (let intento = 0; intento < 6; intento++) {
        groups = [];
        let i = 0;
        while (i < agrupables.length) {
            const n = Math.min(techo, cabenEnUnTramo(i));
            const grupo = agrupables.slice(i, i + n);
            // Un resto de UN clip no forma tramo: se devuelve a la pasada final.
            if (grupo.length < 2) break;
            groups.push({ from: i, to: i + grupo.length });
            i += grupo.length;
        }
        if (!groups.length) break;
        // Cómo queda la pasada final: un clip por tramo, más lo que quedó
        // suelto, más el outro.
        const finales = [
            ...groups.map(g => ({ durationSec: chainDurationSec(agrupables.slice(g.from, g.to)) })),
            ...agrupables.slice(groups[groups.length - 1].to).map(c => ({ durationSec: c.durationSec })),
            ...(ultimoEsOutro ? [{ durationSec: clips[clips.length - 1].durationSec }] : [])
        ];
        if (estimateGraphMemoryMB({ clips: finales, width, height, fps, overlayCount, audioTracks }) <= budgetMB) break;
        // Tramos más cortos dejan más clips fuera y la unión crece: lo que de
        // verdad baja la unión es que los tramos sean MÁS LARGOS. Como ya son
        // los mayores que caben, no hay nada más que apretar.
        if (techo >= agrupables.length) break;
        techo = Math.max(2, techo - 1);
    }

    // Si el troceado no reduce nada —un solo tramo que se lleva todo, o
    // ninguno— no se paga la recodificación extra.
    const sueltos = agrupables.length - groups.reduce((s, g) => s + (g.to - g.from), 0);
    const entradasFinales = groups.length + sueltos + (ultimoEsOutro ? 1 : 0);
    if (!groups.length || entradasFinales >= clips.length) {
        return { mode: 'single', groups: [], estimatedMB: estimado, budgetMB, reason: null };
    }

    return {
        mode: 'chunked',
        groups,
        estimatedMB: estimado,
        budgetMB,
        reason: `El montaje de una pasada pediría ~${estimado} MB y el presupuesto es ${budgetMB} MB: ` +
                `se monta en ${groups.length} tramo(s) y se unen.`
    };
};

// Construye el grafo de filtros. Se hace en una función aparte porque es la
// parte que se puede razonar y probar sin ejecutar ffmpeg.
export const buildFilterGraph = ({
    clips, width, height, fps, hasMusic, totalSec,
    musicVolume = 0.85, fadeSec = 1,
    // Duración REAL de la pista musical, medida sobre el archivo. Con ella
    // el grafo sabe si la música alcanza para toda la pieza o hay que darle
    // la vuelta (`aloop`). Sin medida (null) no se hace loop: no se puede
    // dimensionar el búfer, y se anota.
    musicDurationSec = null,
    hasVoice = false, voiceLeadIn = 0, voiceStretch = 1, voiceIndex = null,
    // ── Rótulos en pantalla (v4.783) ──
    //
    // `[{ inputIndex, startSec, endSec, fadeSec }]`, ya compuestos como PNG
    // transparentes del tamaño del cuadro por `reelTextOverlay.js`. Acá sólo se
    // pegan: la tipografía, la posición y el reparto de líneas se decidieron
    // allá, en un solo sitio.
    //
    // ESTO NO ES POSTPROCESAR el clip. Es la misma categoría que los fundidos y
    // la banda sonora: edición declarada de antemano sobre el montaje. Ningún
    // píxel de la fotografía se reinterpreta.
    overlays = []
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

    // Con rótulos, la cadena de fundidos NO puede terminar en `vout`: ese
    // nombre pasa a ser la salida de la última capa de texto. Se resuelve el
    // nombre final una sola vez para que no queden dos sitios que decidirlo.
    const hasOverlays = Array.isArray(overlays) && overlays.length > 0;
    const videoAfterXfade = hasOverlays ? 'vbase' : 'vout';

    // ── El outro con audio propio (v4.1032) ──
    //
    // Si el último clip es un outro que trae pista y el usuario la quiere, su
    // audio se mezcla EN SU SITIO de la línea de tiempo: hay que saber en qué
    // segundo arranca, y eso se sabe recorriendo la misma cadena de fundidos
    // que posiciona el video. Se anota acá para no rehacer la aritmética.
    let outroAudio = null;

    for (let i = 1; i < clips.length; i++) {
        const name = xfadeName(clips[i].transitionIn);
        const out = i === clips.length - 1 ? videoAfterXfade : `x${i}`;
        if (clips[i].isOutro && clips[i].audioEnabled && clips[i].hasAudio) {
            const overlapSec = name ? (clipOverlap(clips[i], i, TRANSITIONS) || 0.5) : 0;
            outroAudio = {
                inputIndex: i,
                startSec: Number((elapsed - overlapSec).toFixed(3)),
                durationSec: clips[i].durationSec,
                fadeSec: Math.max(0.2, overlapSec || 0.4)
            };
        }

        if (!name) {
            // Corte directo: concatenación simple, sin solapamiento.
            parts.push(`[${last}][c${i}]concat=n=2:v=1:a=0[${out}]`);
            elapsed += clips[i].durationSec;
        } else {
            // El solapamiento lo decide UN solo criterio (`clipOverlap`): el
            // catálogo de transiciones, o la duración propia que declare el
            // clip — es como el outro entra con su fundido de 0,4-0,8 s sin
            // tocar el catálogo de las escenas.
            const dur = clipOverlap(clips[i], i, TRANSITIONS) || 0.5;
            const offset = Number((elapsed - dur).toFixed(3));
            parts.push(`[${last}][c${i}]xfade=transition=${name}:duration=${dur}:offset=${offset}[${out}]`);
            elapsed += clips[i].durationSec - dur;
        }
        last = out;
    }
    // Con una sola escena no hay fundido y la salida sigue llamándose c0.
    if (clips.length === 1) parts.push(`[c0]null[${videoAfterXfade}]`);

    // ── Los rótulos ──
    //
    // Cada uno se pega con `overlay` acotado por `enable='between(t,a,b)'`, que
    // es lo que hace que aparezca sólo durante su escena. Entra y sale con un
    // fundido de opacidad propio: un rótulo que aparece de golpe se lee como un
    // error de reproducción.
    //
    // El fundido se hace sobre el PNG (`format=rgba,fade=alpha=1`) y no sobre el
    // video: `fade` sin `alpha=1` pondría el rótulo a negro en vez de
    // transparente, y sobre una fotografía clara eso es una mancha.
    //
    // `overlay=0:0` porque el PNG ya viene del tamaño del cuadro con el texto en
    // su sitio. La posición vive entera en `reelTextOverlay.js`.
    if (hasOverlays) {
        let chain = videoAfterXfade;
        overlays.forEach((ov, n) => {
            const isLast = n === overlays.length - 1;
            const out = isLast ? 'vout' : `ov${n}`;
            const fade = Math.max(0.15, Math.min(ov.fadeSec ?? 0.4, (ov.endSec - ov.startSec) / 3));
            const dur = Number((ov.endSec - ov.startSec).toFixed(3));

            // El PNG se convierte en un tramo de video de la duración del
            // rótulo, con sus fundidos de opacidad, y SE DESPLAZA a su sitio en
            // la línea de tiempo con `setpts=PTS+inicio/TB`.
            //
            // ── Ese desplazamiento es imprescindible y su ausencia no da error ──
            //
            // `enable='between(t,...)'` se evalúa sobre el reloj de la entrada
            // PRINCIPAL, pero los fotogramas del rótulo llevan su propio tiempo,
            // que empieza en 0. Sin desplazarlos, el rótulo de la segunda escena
            // tiene contenido de 0 a 4,2 s y su ventana es de 4,9 a 9,1: cuando
            // la ventana se abre, esa entrada ya terminó y `eof_action=pass`
            // deja pasar el video sin nada encima.
            //
            // Medido: el primer rótulo salía y los otros dos NO, sin una sola
            // advertencia de ffmpeg —el montaje termina «bien»—. Sólo se ve
            // extrayendo fotogramas y contando píxeles de texto.
            const shift = ov.startSec > 0 ? `,setpts=PTS+${ov.startSec}/TB` : '';
            parts.push(
                `[${ov.inputIndex}:v]format=rgba,fps=${fps},` +
                `trim=duration=${dur},setpts=PTS-STARTPTS,` +
                `fade=t=in:st=0:d=${fade}:alpha=1,` +
                `fade=t=out:st=${Number((dur - fade).toFixed(3))}:d=${fade}:alpha=1${shift}[t${n}]`
            );
            parts.push(
                `[${chain}][t${n}]overlay=0:0:enable='between(t,${ov.startSec},${ov.endSec})':eof_action=pass[${out}]`
            );
            chain = out;
        });
    }

    // ── Audio ──
    //
    // Tres casos: sólo música, sólo voz, o las dos con DUCKING. El ducking no es
    // bajarle el volumen a la música a ojo: es `sidechaincompress`, que la
    // comprime EN FUNCIÓN de la voz, así que baja sólo mientras se habla y vuelve
    // sola en los silencios. Bajarla de forma fija dejaría la pieza sorda en los
    // tramos sin locución.
    const AFORMAT = 'aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo';
    // Entrada corta, salida larga. El cierre progresivo ocupa ~2 s —dentro del
    // rango en que se percibe como un final y no como un corte— pero nunca más
    // de un tercio de la pieza, para no dejar un Reel corto desvaneciéndose
    // desde la mitad.
    const fadeInSec = Math.min(0.6, totalSec / 6);
    const fadeOutSec = Math.min(Math.max(fadeSec, 2), totalSec / 3);
    // Con un outro que trae su propio audio, la música NO compite con él: se
    // desvanece durante la transición y termina cuando el outro ya suena. Con
    // un outro mudo, la música sigue debajo y cierra con el fundido de siempre
    // al final de la pieza — el outro ya está contado en `totalSec`.
    // Redondeado a milésimas: `17.4 - 2` da 15.399999999999999 en punto
    // flotante y eso termina escrito tal cual en el grafo.
    const fadeOutStart = Number((outroAudio
        ? Math.max(0, outroAudio.startSec + outroAudio.fadeSec - fadeOutSec)
        : Math.max(0, totalSec - fadeOutSec)).toFixed(3));
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
            `loudnorm=I=-14:TP=-1.5:LRA=7,${AFORMAT},` +
            // ── La voz dura lo que la PIEZA, no lo que la locución (v4.1033) ──
            //
            // `sidechaincompress` termina cuando se acaba la MÁS CORTA de sus
            // dos entradas, y la locución casi siempre es más corta que el
            // Reel: al acabar la voz se cortaba también la MÚSICA que iba por
            // la cadena principal, y el `apad` de después rellenaba el resto
            // con silencio. Es el «la música desaparece en los últimos
            // segundos» reportado. Rellenar la voz con silencio hasta el final
            // hace que la cadena lateral viva toda la pieza: sin señal, el
            // compresor suelta y la música vuelve sola a su nivel. No se
            // estira la locución — se le suma silencio detrás.
            `apad,atrim=0:${totalSec},asetpts=PTS-STARTPTS[voice]`
        );
    }

    if (hasMusic) {
        // ── El orden importa: normalizar ANTES, desvanecer DESPUÉS (v4.674) ──
        //
        // Hasta v4.673 el `afade` iba primero y `loudnorm` después, y loudnorm
        // es un normalizador con ganancia variable en el tiempo: levantaba la
        // cola que el fade acababa de bajar. Medido sobre una pieza de 14 s, el
        // último medio segundo quedaba en −27 dB —perfectamente audible— y el
        // `atrim` lo cortaba en seco. Es el «la música se corta» que se
        // reportó. Con el orden corregido ese mismo tramo cae a −33 dB y sigue
        // bajando hasta el silencio.
        //
        // El fade de salida es más largo que el de entrada a propósito: entrar
        // rápido no se nota, salir rápido sí.
        // ── Una pista corta da la vuelta; no se rellena con silencio (v4.1033) ──
        //
        // El `apad` del final completa con SILENCIO lo que falte, y con una
        // pista más corta que la pieza eso es exactamente el tramo mudo del
        // reporte. Con la duración real medida, la pista se repite (`aloop`)
        // hasta cubrir la pieza y recién entonces se recorta y se desvanece:
        // así el fundido de salida cae siempre sobre música, no sobre nada.
        // `size` es la pista entera en muestras a 48 kHz —por eso el
        // `aformat` va ANTES—; sin medida no hay cómo dimensionarlo y no se
        // hace loop (queda anotado en el plan).
        const needsLoop = Number(musicDurationSec) > 0 && musicDurationSec < totalSec - 0.05;
        const loop = needsLoop
            ? `${AFORMAT},aloop=loop=-1:size=${Math.ceil(musicDurationSec * 48000)},`
            : '';
        parts.push(
            `[${clips.length}:a]${loop}atrim=0:${totalSec},asetpts=PTS-STARTPTS,` +
            `loudnorm=I=-16:TP=-1.5:LRA=11,volume=${musicVolume},` +
            `afade=t=in:st=0:d=${fadeInSec},afade=t=out:st=${fadeOutStart}:d=${fadeOutSec},` +
            // Se fuerza la duración exacta: si la pista viene más corta que la
            // pieza, `apad` la completa con silencio en vez de dejar el final
            // sin audio, que es un salto audible.
            `apad,atrim=0:${totalSec},${AFORMAT}[music]`
        );
    }

    // Si el outro aporta audio, lo que producen los tres casos de abajo es la
    // CAMA (`abed`) y el `aout` definitivo sale de mezclarla con el outro. Sin
    // outro con audio, los tres casos siguen escribiendo `aout` como siempre.
    const bedLabel = outroAudio ? 'abed' : 'aout';

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
            `apad,atrim=0:${totalSec},asetpts=PTS-STARTPTS,${AFORMAT}[${bedLabel}]`
        );
        audioLabel = bedLabel;
    } else if (hasVoice) {
        // Sólo voz: se completa con silencio hasta el final del video, para que
        // la pista de audio dure lo mismo que la imagen.
        parts.push(`[voice]apad,atrim=0:${totalSec},asetpts=PTS-STARTPTS,${AFORMAT}[${bedLabel}]`);
        audioLabel = bedLabel;
    } else if (hasMusic) {
        parts.push(`[music]anull[${bedLabel}]`);
        audioLabel = bedLabel;
    }

    if (outroAudio) {
        // La pista del outro se recorta a su duración, entra con un fundido
        // del largo de la transición —para no chocar con la cola de la
        // música— y se DESPLAZA a su segundo con `adelay`. `apad`+`atrim`
        // la dejan del largo exacto de la pieza: es lo que sostiene la
        // duración cuando el outro es lo último que suena.
        //
        // ── El desplazamiento se hace en MUESTRAS, no en marcas de tiempo (v4.1033) ──
        //
        // Medido: con `loudnorm` → `adelay` → `apad,atrim`, la pista del outro
        // salía VACÍA (752 KiB para 17,4 s, `n_samples: 0` en su ventana) y el
        // outro se montaba mudo aunque el usuario hubiera pedido su audio.
        // `loudnorm` entrega fotogramas de 100 ms con marcas propias y
        // `atrim` recorta por MARCAS, así que la cola desplazada quedaba fuera.
        // `asetpts=N/SR/TB` vuelve a numerar por conteo de muestras después de
        // `adelay`, que es lo único que no puede desalinearse. El `aformat` va
        // antes de `adelay` para que ese conteo sea ya a 48 kHz.
        const delayMs = Math.round(outroAudio.startSec * 1000);
        parts.push(
            `[${outroAudio.inputIndex}:a]atrim=0:${outroAudio.durationSec},asetpts=PTS-STARTPTS,` +
            `afade=t=in:st=0:d=${outroAudio.fadeSec},` +
            `loudnorm=I=-16:TP=-1.5:LRA=11,${AFORMAT},adelay=${delayMs}|${delayMs},asetpts=N/SR/TB,` +
            `apad,atrim=0:${totalSec}[outroa]`
        );
        if (audioLabel) {
            // `normalize=0`: la mezcla SUMA en vez de repartir la ganancia
            // entre las entradas — con `normalize=1` la cama bajaría 6 dB
            // durante todo el Reel por el solo hecho de que exista un outro.
            // El limitador atrapa el tramo en que las dos suenan a la vez.
            parts.push(
                `[${audioLabel}][outroa]amix=inputs=2:duration=longest:dropout_transition=0:normalize=0,` +
                `alimiter=limit=0.95,apad,atrim=0:${totalSec},asetpts=PTS-STARTPTS,${AFORMAT}[aout]`
            );
        } else {
            parts.push(`[outroa]anull[aout]`);
        }
        audioLabel = 'aout';
    }

    return {
        filter: parts.join(';'), videoLabel: 'vout', audioLabel,
        computedSec: Number(elapsed.toFixed(3)),
        musicLooped: Boolean(hasMusic && Number(musicDurationSec) > 0 && musicDurationSec < totalSec - 0.05),
        outroAudio
    };
};

// ─── El plan de audio contra la línea de tiempo REAL (v4.1033) ────────────
//
// Puro. Recibe las duraciones medidas y devuelve qué se va a hacer con cada
// pista y qué avisar. Es lo que `composeReel` comprueba ANTES de exportar:
// una música que se acaba antes que las escenas ya no es un silencio
// accidental que aparece en el máster — es una decisión escrita (loop) o un
// aviso con su motivo (sin medida). Todo sale de `totalSec`, que es la suma
// real de los clips menos los fundidos, y nunca de un número fijo.
export const planAudioTimeline = ({
    totalSec, clips = [], musicSec = null, voiceSec = null, voiceLeadIn = 0,
    hasMusic = false, hasVoice = false
}) => {
    const total = Number(totalSec) || 0;
    const outro = clips.find(c => c?.isOutro) || null;
    const outroSec = outro ? Number(outro.durationSec) || 0 : 0;
    const outroOverlap = outro ? (Number(outro.transitionSec) || 0) : 0;
    const scenesSec = Number((total - (outro ? outroSec - outroOverlap : 0)).toFixed(3));
    const warnings = [];
    let music = null;
    if (hasMusic) {
        const m = Number(musicSec);
        if (!(m > 0)) {
            music = { durationSec: null, action: 'unknown' };
            warnings.push('No se pudo medir la banda sonora: si es más corta que la pieza, el final quedará sin música.');
        } else if (m < total - 0.05) {
            music = { durationSec: m, action: 'loop', loops: Math.ceil(total / m) };
        } else if (m > total + 0.05) {
            music = { durationSec: m, action: 'trim' };
        } else {
            music = { durationSec: m, action: 'exact' };
        }
    }
    let voice = null;
    if (hasVoice) {
        const v = Number(voiceSec);
        const end = v > 0 ? Number((v + (Number(voiceLeadIn) || 0)).toFixed(3)) : null;
        voice = { durationSec: v > 0 ? v : null, endsAt: end, action: 'as-is' };
        if (end != null && end > total + 0.05) {
            voice.action = 'trim';
            warnings.push(`La locución (${end.toFixed(1)} s) es más larga que la pieza (${total.toFixed(1)} s) y se recorta al final.`);
        }
        if (end != null && end < scenesSec - 0.05 && !hasMusic) {
            warnings.push(`La locución termina en ${end.toFixed(1)} s y no hay música: los últimos ${(scenesSec - end).toFixed(1)} s de escenas quedan sin audio.`);
        }
    }
    return {
        videoScenesDuration: scenesSec,
        voiceDuration: voice?.durationSec ?? null,
        backgroundMusicDuration: music?.durationSec ?? null,
        outroDuration: outroSec || null,
        outroHasAudio: Boolean(outro?.audioEnabled && outro?.hasAudio),
        finalVideoDuration: total,
        audioDuration: (hasMusic || hasVoice || (outro?.audioEnabled && outro?.hasAudio)) ? total : null,
        music, voice, warnings
    };
};

// Tasa de bits objetivo por resolución. Se fija en vez de dejar CRF libre
// porque el módulo VALIDA la tasa de bits del resultado: con CRF puro, un clip
// de poco movimiento puede salir muy comprimido y hacer fallar su propia
// validación. Estos valores son los que las redes verticales recomiendan.
// EXPORTADO desde v4.1039: la composición «video de la Biblioteca + outro» usa
// los MISMOS objetivos de tasa de bits para que la versión se publique igual
// que el máster — una tabla escrita dos veces se separa en silencio.
export const targetBitrate = (width, height) => {
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
    timeoutMs = 100_000,
    // Rótulos: `[{ buffer, startSec, endSec, fadeSec }]`. Los PNG ya vienen
    // compuestos de `reelTextOverlay.js`, del tamaño del cuadro.
    textOverlays = [],
    // Un TRAMO intermedio del montaje por tramos (v4.1051): se codifica con
    // calidad alta porque el video va a pasar una segunda vez por el encoder,
    // y no lleva `+faststart` —nadie lo reproduce en streaming, se vuelve a
    // leer entero— ni miniatura.
    intermediate = false,
    memoryBudgetMB = DEFAULT_MEMORY_BUDGET_MB
}) => withTempDir(async (dir) => {
    if (!clips?.length) throw new Error('No hay clips que montar.');

    // ── Montaje POR TRAMOS cuando el grafo no cabe en memoria (v4.1051) ──
    //
    // Se decide ANTES de escribir nada. Cada tramo se monta llamando a este
    // MISMO `composeReel` —sin música, sin locución y sin rótulos— y vuelve
    // como un clip más: así el troceado no estrena ni un camino de montaje ni
    // un segundo grafo. Un tramo cabe en el presupuesto por construcción, así
    // que la recursión no puede volver a trocear.
    //
    // ⚠️ LA DURACIÓN DEL TRAMO SALE DE `chainDurationSec`, la MISMA aritmética
    // que usa el montaje de una pasada. Escrita otra vez acá, un tramo diría
    // durar lo que no dura y el `offset` del cruce siguiente caería en el
    // segundo equivocado — sin dar ningún error: una transición corrida.
    const plan = planComposition({
        clips, width, height, fps,
        overlayCount: (textOverlays || []).filter(o => o?.buffer).length,
        audioTracks: (musicBuffer ? 1 : 0) + (voiceBuffer ? 1 : 0) +
                     (clips.some(c => c?.isOutro && c?.audioEnabled && c?.hasAudio) ? 1 : 0),
        budgetMB: memoryBudgetMB
    });
    if (plan.mode === 'chunked') {
        console.log(`[REEL/ffmpeg] ${plan.reason}`);
        // El tiempo se reparte: los tramos van sin audio ni rótulos y son la
        // parte rápida; la unión es la que codifica la pieza entera.
        const porTramo = Math.max(30_000, Math.floor((timeoutMs * 0.45) / plan.groups.length));
        const compuestos = [];
        let cursor = 0;
        for (const g of plan.groups) {
            // Lo que quedó suelto entre dos tramos viaja tal cual.
            for (let i = cursor; i < g.from; i++) compuestos.push(clips[i]);
            const grupo = clips.slice(g.from, g.to);
            const tramo = await composeReel({
                clips: grupo, musicBuffer: null, voiceBuffer: null,
                width, height, fps, textOverlays: [],
                timeoutMs: porTramo,
                // El intermedio se codifica con calidad alta: es una pasada más
                // sobre el mismo video y lo que se pierde ahí no se recupera.
                intermediate: true,
                memoryBudgetMB
            });
            compuestos.push({
                buffer: tramo.buffer,
                durationSec: tramo.expectedDurationSec,
                // El tramo se une con lo anterior con la transición que declaró
                // su PRIMER clip: el cruce no se hizo dentro del tramo, se hace
                // acá, y es el mismo que habría hecho el montaje de una pasada.
                transitionIn: grupo[0]?.transitionIn ?? null
            });
            cursor = g.to;
        }
        for (let i = cursor; i < clips.length; i++) compuestos.push(clips[i]);
        clips = compuestos;
    }

    const inputs = [];
    for (const [i, clip] of clips.entries()) {
        const file = path.join(dir, `c${i}.mp4`);
        await writeFile(file, clip.buffer);
        inputs.push('-i', file);
    }
    // El ORDEN de las entradas define los índices del grafo: primero los clips,
    // después la música, después la voz y al final los rótulos. Cambiarlo rompe
    // el filtro entero, así que los índices se calculan acá —donde se escriben
    // los archivos— y viajan al grafo, en vez de recalcularse allá con la misma
    // aritmética escrita por segunda vez.
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

    // Los rótulos van ÚLTIMOS: así agregarlos no mueve el índice de la música ni
    // el de la voz, que es lo que dejaría el audio mudo o cruzado.
    const overlaySpecs = [];
    let nextIndex = clips.length + (musicBuffer ? 1 : 0) + (voiceBuffer ? 1 : 0);
    for (const [n, ov] of (textOverlays || []).entries()) {
        if (!ov?.buffer) continue;
        const file = path.join(dir, `t${n}.png`);
        await writeFile(file, ov.buffer);
        // `-loop 1` sobre un PNG: sin esto la imagen dura un fotograma y el
        // rótulo parpadea en vez de sostenerse.
        inputs.push('-loop', '1', '-i', file);
        overlaySpecs.push({
            inputIndex: nextIndex++,
            startSec: Number(ov.startSec) || 0,
            endSec: Number(ov.endSec) || 0,
            fadeSec: ov.fadeSec
        });
    }

    const totalSec = clips.reduce((sum, c, i) => {
        if (i === 0) return c.durationSec;
        const name = xfadeName(c.transitionIn);
        const overlap = name ? (clipOverlap(c, i, TRANSITIONS) || 0.5) : 0;
        return sum + c.durationSec - overlap;
    }, 0);

    // ── Las pistas se MIDEN antes de montar (v4.1033) ──
    //
    // La duración real de la música y de la voz decide el grafo (loop o
    // recorte) y la validación de abajo. Medir falla sin tumbar el montaje:
    // sin medida no hay loop y el plan lo dice.
    const measure = async (buf, what) => {
        if (!buf) return null;
        try { return await measureAudioDuration(buf); } catch (e) {
            console.warn(`[REEL/ffmpeg] no se pudo medir ${what}:`, e.message);
            return null;
        }
    };
    const [musicDurationSec, voiceDurationSec] = await Promise.all([
        measure(musicBuffer, 'la banda sonora'), measure(voiceBuffer, 'la locución')
    ]);

    const audioPlan = planAudioTimeline({
        totalSec: Number(totalSec.toFixed(3)), clips,
        musicSec: musicDurationSec, voiceSec: voiceDurationSec, voiceLeadIn,
        hasMusic: Boolean(musicBuffer), hasVoice: Boolean(voiceBuffer)
    });
    if (audioPlan.warnings.length) console.warn('[REEL/ffmpeg] plan de audio:', audioPlan.warnings.join(' | '));
    console.log(`[REEL/ffmpeg] línea de tiempo: escenas ${audioPlan.videoScenesDuration}s · outro ${audioPlan.outroDuration ?? 0}s · ` +
        `total ${audioPlan.finalVideoDuration}s · música ${audioPlan.backgroundMusicDuration ?? '—'}s (${audioPlan.music?.action ?? 'sin música'}) · ` +
        `voz ${audioPlan.voiceDuration ?? '—'}s`);

    const graph = buildFilterGraph({
        clips, width, height, fps,
        hasMusic: Boolean(musicBuffer),
        totalSec: Number(totalSec.toFixed(3)),
        musicVolume, fadeSec, musicDurationSec,
        hasVoice: Boolean(voiceBuffer), voiceLeadIn, voiceStretch, voiceIndex,
        overlays: overlaySpecs
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
        // ⚠️ UN TRAMO INTERMEDIO SE CODIFICA POR CALIDAD, NO POR TASA FIJA
        // (v4.1051). Ese video va a volver a pasar por el encoder en la unión,
        // y lo que se pierda en la primera pasada no se recupera en la segunda.
        // Con CRF 16 la diferencia con el original no es visible y el archivo
        // vive unos segundos en `/tmp`; con la tasa del máster se acumularían
        // dos compresiones al mismo objetivo.
        ...(intermediate
            ? ['-crf', '16']
            : ['-b:v', br.v, '-maxrate', br.max, '-bufsize', br.buf]),
        '-pix_fmt', 'yuv420p',
        '-r', String(fps),
        // Keyframe cada 2 s: es lo que las redes esperan para poder recortar y
        // reproducir en streaming sin recodificar.
        '-g', String(fps * 2),
        ...(graph.audioLabel
            ? ['-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2']
            : ['-an']),
        // El índice al principio del archivo: sin esto el reproductor tiene que
        // descargar el MP4 entero antes de mostrar el primer fotograma. Un
        // tramo no lo necesita: nadie lo reproduce, se vuelve a leer entero.
        ...(intermediate ? [] : ['-movflags', '+faststart']),
        '-shortest',
        out
    ];

    await runFfmpeg(args, { timeoutMs, label: 'montaje del Reel' });
    const buffer = await readFile(out);

    // Miniatura del segundo 1: el fotograma 0 de un fundido suele estar casi
    // negro.
    // Un tramo no tiene miniatura: la del Reel sale de la pieza final.
    let posterBuffer = null;
    if (!intermediate) try {
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
        audioPlan,
        hasVoice: Boolean(voiceBuffer),
        hasMusic: Boolean(musicBuffer)
    };
});

