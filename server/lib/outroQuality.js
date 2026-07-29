// ════════════════════════════════════════════════════════════════════
// Generador de Outros IA — validación automática de calidad
// v4.646.0
//
// Se ejecuta ANTES de dar un outro por listo, sobre el archivo real que
// devolvió el proveedor (el mismo buffer que después se sube a S3).
//
// QUÉ SE MIDE Y QUÉ NO — es importante ser explícito, porque el veredicto se le
// muestra al usuario:
//
//   Se mide leyendo el contenedor MP4 (parser propio, sin dependencias):
//     · resolución real del track de video
//     · duración real, y desfase entre el track de video y el de audio
//     · presencia de pista de audio
//     · códec (avc1 / hvc1 / av01) y perfil de contenedor
//     · tasa de bits media (tamaño ÷ duración)
//     · fotogramas por segundo y su consistencia
//     · integridad: que existan `moov` y `mdat` y que el archivo no esté truncado
//
//   Se mide sobre la IMAGEN DE ORIGEN con sharp, antes de generar:
//     · resolución respecto del maestro pedido (factor de ampliación)
//     · nitidez (varianza laplaciana)
//     · margen de legibilidad del texto que ya trae la pieza
//
//   NO se mide (y no se afirma que sí): nitidez fotograma a fotograma del video
//   ni OCR del texto sobre el video renderizado. Eso exige decodificar el video,
//   y la función de la API corre en Vercel sin ffmpeg. Por eso la legibilidad se
//   controla en la entrada — que es además donde se puede corregir.
// ════════════════════════════════════════════════════════════════════

import { OUTRO_FORMATS } from './outroSpec.js';

// ─── Parser de contenedor MP4/ISO-BMFF ─────────────────────────────────────

const CONTAINER_BOXES = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl', 'edts', 'udta', 'moof', 'traf']);

const readBoxes = (buf, start, end, depth = 0) => {
    const boxes = [];
    let offset = start;
    // 32 niveles es más profundidad de la que tiene cualquier MP4 real; el tope
    // sólo existe para que un archivo corrupto no nos deje en bucle.
    if (depth > 32) return boxes;

    while (offset + 8 <= end) {
        let size = buf.readUInt32BE(offset);
        const type = buf.toString('latin1', offset + 4, offset + 8);
        let headerSize = 8;

        if (size === 1) {
            if (offset + 16 > end) break;
            const large = buf.readBigUInt64BE(offset + 8);
            if (large > BigInt(Number.MAX_SAFE_INTEGER)) break;
            size = Number(large);
            headerSize = 16;
        } else if (size === 0) {
            size = end - offset; // se extiende hasta el final del archivo
        }

        if (size < headerSize || offset + size > end) {
            // Caja que se sale del archivo: lo registramos como truncado y paramos.
            boxes.push({ type, start: offset, end, truncated: true, children: [] });
            break;
        }

        const box = {
            type,
            start: offset,
            end: offset + size,
            dataStart: offset + headerSize,
            truncated: false,
            children: []
        };
        if (CONTAINER_BOXES.has(type)) {
            box.children = readBoxes(buf, box.dataStart, box.end, depth + 1);
        }
        boxes.push(box);
        offset += size;
    }
    return boxes;
};

const findBox = (boxes, type) => boxes.find(b => b.type === type);
const findAll = (boxes, type) => boxes.filter(b => b.type === type);

// mvhd y mdhd comparten la disposición de timescale/duration.
const readTimeHeader = (buf, box) => {
    try {
        const version = buf.readUInt8(box.dataStart);
        const p = box.dataStart + 4; // version(1) + flags(3)
        if (version === 1) {
            return { timescale: buf.readUInt32BE(p + 16), duration: Number(buf.readBigUInt64BE(p + 20)) };
        }
        return { timescale: buf.readUInt32BE(p + 8), duration: buf.readUInt32BE(p + 12) };
    } catch { return null; }
};

const readTrackHeader = (buf, box) => {
    try {
        const version = buf.readUInt8(box.dataStart);
        // version/flags(4) + fechas y trackId, cuyo tamaño depende de la versión
        const afterDates = box.dataStart + 4 + (version === 1 ? 32 : 20);
        // reserved(8) + layer(2) + altGroup(2) + volume(2) + reserved(2) + matrix(36)
        const dims = afterDates + 8 + 2 + 2 + 2 + 2 + 36;
        return {
            width: Math.round(buf.readUInt32BE(dims) / 65536),
            height: Math.round(buf.readUInt32BE(dims + 4) / 65536)
        };
    } catch { return null; }
};

const readHandler = (buf, boxes) => {
    const hdlr = findBox(boxes, 'hdlr');
    if (!hdlr) return null;
    try { return buf.toString('latin1', hdlr.dataStart + 8, hdlr.dataStart + 12); } catch { return null; }
};

const readCodec = (buf, stbl) => {
    const stsd = stbl && findBox(stbl.children, 'stsd');
    if (!stsd) return null;
    try {
        const entryCount = buf.readUInt32BE(stsd.dataStart + 4);
        if (entryCount < 1) return null;
        return buf.toString('latin1', stsd.dataStart + 12, stsd.dataStart + 16);
    } catch { return null; }
};

// stts guarda cuántos samples hay y cada cuánto. Con el timescale del track eso
// da los fps y, si hay más de una entrada con deltas distintos, un ritmo de
// fotogramas inconsistente.
const readFrameTiming = (buf, stbl, timescale) => {
    const stts = stbl && findBox(stbl.children, 'stts');
    if (!stts || !timescale) return null;
    try {
        const entryCount = buf.readUInt32BE(stts.dataStart + 4);
        let samples = 0;
        let totalDelta = 0;
        const deltas = new Set();
        for (let i = 0; i < entryCount && i < 4096; i++) {
            const p = stts.dataStart + 8 + i * 8;
            if (p + 8 > stts.end) break;
            const count = buf.readUInt32BE(p);
            const delta = buf.readUInt32BE(p + 4);
            samples += count;
            totalDelta += count * delta;
            if (delta > 0) deltas.add(delta);
        }
        if (!samples || !totalDelta) return null;
        return {
            frames: samples,
            fps: Number(((samples * timescale) / totalDelta).toFixed(3)),
            constantFrameRate: deltas.size <= 1
        };
    } catch { return null; }
};

// Lee un MP4 y devuelve todo lo que se puede saber sin decodificarlo.
// Nunca lanza: si el archivo no es analizable lo dice en `parseError`.
export const probeMp4 = (buffer) => {
    const result = {
        sizeBytes: buffer?.length || 0,
        container: null,
        hasMoov: false,
        hasMdat: false,
        truncated: false,
        durationSec: null,
        width: null,
        height: null,
        videoCodec: null,
        audioCodec: null,
        hasAudio: false,
        fps: null,
        constantFrameRate: null,
        frames: null,
        bitrateKbps: null,
        audioDurationSec: null,
        audioDriftSec: null,
        parseError: null
    };

    if (!buffer || buffer.length < 32) {
        result.parseError = 'El archivo está vacío o es demasiado pequeño para ser un video.';
        return result;
    }

    try {
        const boxes = readBoxes(buffer, 0, buffer.length);
        result.truncated = boxes.some(b => b.truncated);

        const ftyp = findBox(boxes, 'ftyp');
        if (ftyp) result.container = buffer.toString('latin1', ftyp.dataStart, ftyp.dataStart + 4).trim();

        const moov = findBox(boxes, 'moov');
        result.hasMoov = Boolean(moov);
        result.hasMdat = boxes.some(b => b.type === 'mdat');

        if (!moov) {
            result.parseError = 'El archivo no contiene la cabecera `moov`: está incompleto o corrupto.';
            return result;
        }

        const mvhd = findBox(moov.children, 'mvhd');
        const movie = mvhd ? readTimeHeader(buffer, mvhd) : null;
        if (movie?.timescale) {
            result.durationSec = Number((movie.duration / movie.timescale).toFixed(3));
        }

        for (const trak of findAll(moov.children, 'trak')) {
            const mdia = findBox(trak.children, 'mdia');
            if (!mdia) continue;
            const handler = readHandler(buffer, mdia.children);
            const mdhd = findBox(mdia.children, 'mdhd');
            const time = mdhd ? readTimeHeader(buffer, mdhd) : null;
            const minf = findBox(mdia.children, 'minf');
            const stbl = minf && findBox(minf.children, 'stbl');
            const codec = readCodec(buffer, stbl);
            const trackDuration = time?.timescale ? time.duration / time.timescale : null;

            if (handler === 'vide') {
                const tkhd = findBox(trak.children, 'tkhd');
                const dims = tkhd ? readTrackHeader(buffer, tkhd) : null;
                if (dims?.width) { result.width = dims.width; result.height = dims.height; }
                result.videoCodec = codec;
                const timing = readFrameTiming(buffer, stbl, time?.timescale);
                if (timing) {
                    result.fps = timing.fps;
                    result.frames = timing.frames;
                    result.constantFrameRate = timing.constantFrameRate;
                }
                if (!result.durationSec && trackDuration) result.durationSec = Number(trackDuration.toFixed(3));
            } else if (handler === 'soun') {
                result.hasAudio = true;
                result.audioCodec = codec;
                if (trackDuration) result.audioDurationSec = Number(trackDuration.toFixed(3));
            }
        }

        if (result.hasAudio && result.audioDurationSec && result.durationSec) {
            result.audioDriftSec = Number(Math.abs(result.audioDurationSec - result.durationSec).toFixed(3));
        }

        if (result.durationSec > 0) {
            result.bitrateKbps = Math.round((result.sizeBytes * 8) / result.durationSec / 1000);
        }
    } catch (e) {
        result.parseError = `No se pudo leer el contenedor del video: ${e.message}`;
    }

    return result;
};

// ─── Umbrales ──────────────────────────────────────────────────────────────
//
// Pensados para un clip corto en alta calidad. Un 1080×1920 de 5 s bien
// codificado ronda los 8–12 Mbps; por debajo de 3.5 Mbps la compresión ya se ve
// en los bordes del texto, que es justo lo que no puede pasar en un outro.
export const QUALITY_THRESHOLDS = {
    minBitrateKbps: 3500,
    minFps: 23,
    maxAudioDriftSec: 0.5,
    durationToleranceSec: 1.5,
    acceptedVideoCodecs: ['avc1', 'hvc1', 'hev1', 'av01'],
    // Ampliar la imagen de origen más de esto hace que el texto pierda filo.
    maxSourceUpscale: 1.6,
    // Varianza laplaciana por debajo de esto = imagen blanda / desenfocada.
    minSharpness: 8
};

// Valida el archivo contra el formato y la duración que se pidieron.
// Devuelve `verdict`: 'ready' | 'needs_review', más los motivos.
export const validateOutroFile = (probe, { format, expectedDurationSec, expectVoice = false }) => {
    const spec = OUTRO_FORMATS[format] || OUTRO_FORMATS['9:16'];
    const failures = [];
    const warnings = [];

    if (probe.parseError) failures.push(probe.parseError);
    if (probe.truncated) failures.push('El archivo llegó truncado: hay cajas del contenedor que se salen del tamaño real.');
    if (probe.hasMoov && !probe.hasMdat) failures.push('El archivo no contiene datos de video (`mdat`).');

    if (!probe.width || !probe.height) {
        failures.push('No se pudo determinar la resolución del video.');
    } else if (probe.width < spec.minWidth || probe.height < spec.minHeight) {
        failures.push(`Resolución por debajo del mínimo: ${probe.width}×${probe.height} (se exige ${spec.minWidth}×${spec.minHeight}).`);
    }

    if (!probe.durationSec) {
        failures.push('No se pudo determinar la duración del video.');
    } else if (Math.abs(probe.durationSec - expectedDurationSec) > QUALITY_THRESHOLDS.durationToleranceSec) {
        failures.push(`Duración fuera de rango: ${probe.durationSec}s frente a los ${expectedDurationSec}s esperados.`);
    }

    if (probe.bitrateKbps != null && probe.bitrateKbps < QUALITY_THRESHOLDS.minBitrateKbps) {
        failures.push(`Tasa de bits baja (${probe.bitrateKbps} kbps): la compresión sería visible. Mínimo ${QUALITY_THRESHOLDS.minBitrateKbps} kbps.`);
    }

    if (probe.videoCodec && !QUALITY_THRESHOLDS.acceptedVideoCodecs.includes(probe.videoCodec)) {
        warnings.push(`Códec de video inesperado (${probe.videoCodec}); se esperaba H.264/H.265.`);
    }

    if (probe.fps != null && probe.fps < QUALITY_THRESHOLDS.minFps) {
        failures.push(`Fotogramas por segundo insuficientes: ${probe.fps} fps.`);
    }
    if (probe.constantFrameRate === false) {
        warnings.push('El ritmo de fotogramas no es constante; algunas redes lo recodifican.');
    }

    if (expectVoice) {
        if (!probe.hasAudio) {
            failures.push('Se pidió voz en off y el archivo no trae pista de audio.');
        } else if (probe.audioDriftSec != null && probe.audioDriftSec > QUALITY_THRESHOLDS.maxAudioDriftSec) {
            failures.push(`Audio y video desfasados en ${probe.audioDriftSec}s.`);
        }
    }

    return {
        verdict: failures.length ? 'needs_review' : 'ready',
        failures,
        warnings,
        checkedAt: new Date().toISOString(),
        thresholds: QUALITY_THRESHOLDS,
        measured: probe
    };
};

// ─── Inspección de la imagen de origen ─────────────────────────────────────
//
// Corre ANTES de gastar créditos: si la imagen entra blanda o muy pequeña, el
// texto del logo va a salir blando del otro lado y no hay forma de arreglarlo
// después. Nunca bloquea por sí sola — devuelve avisos que la UI muestra.
export const inspectSourceImage = async (buffer, { format = '9:16' } = {}) => {
    const spec = OUTRO_FORMATS[format] || OUTRO_FORMATS['9:16'];
    const report = {
        width: null, height: null, format: null,
        upscaleFactor: null, sharpness: null, aspectRatio: null,
        warnings: [], ok: true
    };

    try {
        const sharp = (await import('sharp')).default;
        const image = sharp(buffer, { failOn: 'none' });
        const meta = await image.metadata();
        report.width = meta.width || null;
        report.height = meta.height || null;
        report.format = meta.format || null;

        if (report.width && report.height) {
            // Cuánto hay que ampliar la imagen para llenar el maestro pedido.
            const factor = Math.max(spec.master.width / report.width, spec.master.height / report.height);
            report.upscaleFactor = Number(factor.toFixed(2));
            if (factor > QUALITY_THRESHOLDS.maxSourceUpscale) {
                report.warnings.push(
                    `La imagen (${report.width}×${report.height}) hay que ampliarla ${report.upscaleFactor}× para llegar a ${spec.master.width}×${spec.master.height}: los textos y el logo pueden perder filo. Recomendado subirla con al menos ${spec.master.width}px de ancho.`
                );
                report.ok = false;
            }

            // El modelo image-to-video hereda la proporción de esta imagen: no
            // recibe la relación de aspecto como parámetro. Si la imagen no
            // viene en el formato pedido, el archivo tampoco va a venir en él, y
            // recortarlo después está prohibido. Vale más avisarlo acá, antes de
            // gastar los créditos, que descubrirlo en la validación del archivo.
            const sourceRatio = report.width / report.height;
            const targetRatio = spec.master.width / spec.master.height;
            report.aspectRatio = Number(sourceRatio.toFixed(3));
            // 3% de tolerancia: absorbe redondeos de exportación sin dejar pasar
            // una vertical donde se pidió una horizontal.
            if (Math.abs(sourceRatio - targetRatio) / targetRatio > 0.03) {
                report.warnings.push(
                    `La imagen es ${report.width}×${report.height} y el formato elegido es ${format} (${spec.master.width}×${spec.master.height}). El cierre conserva la proporción de la imagen, así que va a salir en la de ella: para obtener ${format}, subí la imagen ya en esa proporción.`
                );
                report.ok = false;
            }
        }

        // Varianza laplaciana sobre una versión reducida en escala de grises: es
        // la medida clásica de nitidez y es barata de calcular.
        const stats = await sharp(buffer, { failOn: 'none' })
            .greyscale()
            .resize({ width: 512, withoutEnlargement: true })
            .convolve({ width: 3, height: 3, kernel: [0, 1, 0, 1, -4, 1, 0, 1, 0] })
            .stats();
        const stdev = stats.channels?.[0]?.stdev;
        if (typeof stdev === 'number') {
            report.sharpness = Number(stdev.toFixed(2));
            if (report.sharpness < QUALITY_THRESHOLDS.minSharpness) {
                report.warnings.push(`La imagen se ve blanda o desenfocada (nitidez ${report.sharpness}). El outro heredará ese desenfoque.`);
                report.ok = false;
            }
        }
    } catch (e) {
        // Que no se pueda inspeccionar no debe impedir generar: se avisa y sigue.
        report.warnings.push(`No se pudo analizar la imagen de origen: ${e.message}`);
    }

    return report;
};
