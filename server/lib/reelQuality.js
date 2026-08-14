// ════════════════════════════════════════════════════════════════════
// Creador de Reels IA — preservación visual y validación de calidad
// v4.664.0
//
// QUÉ SE MIDE Y QUÉ NO. Es importante ser explícito porque el veredicto se le
// muestra al usuario, y la regla del sitio es no afirmar en la UI que se mide
// algo que no se mide.
//
//   Sobre la IMAGEN DE ORIGEN, con sharp, ANTES de gastar créditos:
//     · resolución respecto del maestro pedido (factor de ampliación)
//     · proporción respecto del formato elegido
//     · nitidez (varianza laplaciana)
//
//   Sobre el ARCHIVO entregado —de cada clip y del montaje final—, leyendo el
//   contenedor MP4 con el parser de `outroQuality.js`, sin decodificar:
//     · resolución, duración, fps y consistencia del ritmo de fotogramas
//     · presencia y desfase de la pista de audio
//     · códec, tasa de bits, integridad (moov/mdat, truncamiento)
//
//   Sobre la FIDELIDAD del clip a su fotografía (v4.664, tres fotogramas por
//   clip extraídos con FFmpeg — inicio, medio y fin):
//     · distancia perceptual y de color, calculada con sharp: determinista,
//       sin modelo, y es la que detecta un cambio de encuadre o de paleta
//     · deformación del motivo, deriva de identidad, alteración de logotipos,
//       texto ilegible y cambio de colores corporativos, con un modelo de
//       visión sobre una composición lado a lado (original | fotograma)
//
//     Ya NO depende de que el proveedor entregue portada: si no la manda, los
//     fotogramas se sacan del propio clip. `unavailable` queda reservado para
//     cuando FFmpeg no está y el proveedor tampoco dio nada — el caso real de
//     no haber podido mirar.
//
//   Se miran TRES fotogramas y no uno porque la deriva de un modelo generativo
//   es progresiva: el primero casi siempre es fiel y el último es donde el
//   logotipo se rompe. La nota de la escena es la PEOR de las tres.
//
//   Sobre el texto: lo lee el modelo de visión, que transcribe y compara las
//   dos mitades. NO hay un motor de OCR dedicado (Tesseract) — añadirlo son
//   decenas de MB en una función que ya empaqueta FFmpeg. Es una lectura por
//   modelo, y así se nombra; no se presenta como OCR clásico.
// ════════════════════════════════════════════════════════════════════

import { REEL_FORMATS, DEFAULT_FORMAT, resolveTier } from './reelSpec.js';
import { probeMp4 } from './outroQuality.js';
import { generateCopy } from '../services/copywritingService.js';

export { probeMp4 };

// ─── Umbrales ──────────────────────────────────────────────────────────────
//
// Un vertical de 15 s bien codificado ronda los 8-12 Mbps. Por debajo de
// 4.5 Mbps la compresión ya se ve en los bordes del texto y en los degradados,
// que es justo lo que arruina una pieza institucional al republicarse (las
// redes recomprimen encima de lo que se les sube).
export const REEL_THRESHOLDS = {
    minBitrateKbps: 4500,
    // Cada clip suelto se juzga con un piso más bajo: son 5 s de un motor
    // generativo, no el máster final.
    minSceneBitrateKbps: 2500,
    minFps: 23,
    maxAudioDriftSec: 0.5,
    durationToleranceSec: 1.5,
    acceptedVideoCodecs: ['avc1', 'hvc1', 'hev1', 'av01'],
    maxSourceUpscale: 1.6,
    minSharpness: 8,
    // Nota de fidelidad por debajo de la cual la escena se regenera sola.
    minFidelityScore: 7,
    // Similitud estructural mínima (0-1) entre la foto y sus fotogramas.
    //
    // Hay DOS umbrales porque la señal estructural cumple dos papeles distintos
    // (v4.673):
    //
    //  · SIN modelo de visión es la única señal que hay, y tiene que decidir
    //    sola: 0,5 es el punto por debajo del cual el encuadre ya cambió de
    //    forma visible.
    //  · CON modelo de visión su papel se reduce a lo que el modelo no ve bien:
    //    un reencuadre grosero, la toma que se fue a otra parte. Ahí el piso
    //    baja a 0,3.
    //
    // El motivo es que la huella perceptual no distingue «la escena se movió»
    // de «la escena cambió», y desde v4.673 se le pide al motor movimiento de
    // verdad —cabezas que giran, manos que terminan su gesto—. Con el piso
    // alto, una escena bien animada reprobaba por estar viva, se regeneraba y
    // acababa cayendo al respaldo estático: justo lo contrario de lo buscado.
    // El juicio fino lo hace el modelo, que es quien sí distingue un rostro
    // redibujado de un rostro que se giró.
    minStructuralScore: 0.5,
    minStructuralScoreWithVision: 0.3
};

// ─── Inspección de las imágenes de origen ──────────────────────────────────
//
// Corre antes de gastar un crédito. Nunca bloquea por sí sola: devuelve avisos
// que la UI muestra y el usuario decide. Que una foto entre blanda es un
// problema que no se arregla después — el clip hereda el desenfoque.
export const inspectSourceImage = async (buffer, { format = DEFAULT_FORMAT } = {}) => {
    const spec = REEL_FORMATS[format] || REEL_FORMATS[DEFAULT_FORMAT];
    const report = {
        width: null, height: null, format: null,
        upscaleFactor: null, sharpness: null, aspectRatio: null,
        warnings: [], ok: true
    };

    try {
        const sharp = (await import('sharp')).default;
        const meta = await sharp(buffer, { failOn: 'none' }).metadata();
        report.width = meta.width || null;
        report.height = meta.height || null;
        report.format = meta.format || null;

        if (report.width && report.height) {
            const factor = Math.max(spec.master.width / report.width, spec.master.height / report.height);
            report.upscaleFactor = Number(factor.toFixed(2));
            if (factor > REEL_THRESHOLDS.maxSourceUpscale) {
                report.warnings.push(
                    `Hay que ampliarla ${report.upscaleFactor}× para llegar a ${spec.master.width}×${spec.master.height}: los textos y los logotipos pueden perder filo. Conviene subirla con al menos ${spec.master.width}px de ancho.`
                );
                report.ok = false;
            }

            // Los motores image-to-video heredan la proporción de la imagen: no
            // reciben la relación de aspecto como parámetro. Si la foto no viene
            // en el formato pedido, el clip tampoco, y recortarlo después está
            // prohibido. Vale más avisarlo acá que descubrirlo con los créditos
            // ya gastados. El montaje puede encuadrar, pero encuadrar recorta.
            const sourceRatio = report.width / report.height;
            const targetRatio = spec.master.width / spec.master.height;
            report.aspectRatio = Number(sourceRatio.toFixed(3));
            if (Math.abs(sourceRatio - targetRatio) / targetRatio > 0.03) {
                report.warnings.push(
                    `Es ${report.width}×${report.height} y el formato elegido es ${format}. El clip conserva la proporción de la foto, así que el montaje va a tener que encuadrarla: para que entre completa, subila ya en ${format}.`
                );
                report.ok = false;
            }
        }

        const stats = await sharp(buffer, { failOn: 'none' })
            .greyscale()
            .resize({ width: 512, withoutEnlargement: true })
            .convolve({ width: 3, height: 3, kernel: [0, 1, 0, 1, -4, 1, 0, 1, 0] })
            .stats();
        const stdev = stats.channels?.[0]?.stdev;
        if (typeof stdev === 'number') {
            report.sharpness = Number(stdev.toFixed(2));
            if (report.sharpness < REEL_THRESHOLDS.minSharpness) {
                report.warnings.push(`Se ve blanda o desenfocada (nitidez ${report.sharpness}). El clip heredará ese desenfoque.`);
                report.ok = false;
            }
        }
    } catch (e) {
        // Que no se pueda inspeccionar no debe impedir generar: se avisa y sigue.
        report.warnings.push(`No se pudo analizar: ${e.message}`);
    }

    return report;
};

// Inspecciona las tres de una vez, en paralelo, y devuelve los avisos ya
// etiquetados con el número de foto que ve el usuario.
export const inspectSourceImages = async (buffers, { format = DEFAULT_FORMAT } = {}) => {
    const reports = await Promise.all(buffers.map(b => inspectSourceImage(b, { format })));
    return {
        reports,
        ok: reports.every(r => r.ok),
        warnings: reports.flatMap((r, i) => r.warnings.map(w => `Foto ${i + 1}: ${w}`))
    };
};

// ─── Validación de un clip de escena ───────────────────────────────────────

export const validateSceneFile = (probe, { expectedDurationSec }) => {
    const failures = [];
    const warnings = [];

    if (probe.parseError) failures.push(probe.parseError);
    if (probe.truncated) failures.push('El clip llegó truncado.');
    if (probe.hasMoov && !probe.hasMdat) failures.push('El clip no contiene datos de video (`mdat`).');

    if (!probe.width || !probe.height) {
        failures.push('No se pudo determinar la resolución del clip.');
    } else if (Math.min(probe.width, probe.height) < 1080) {
        // El lado corto es el que manda: 1080×1920 y 1920×1080 son ambos válidos.
        failures.push(`Clip por debajo de Full HD: ${probe.width}×${probe.height}.`);
    }

    if (!probe.durationSec) {
        failures.push('No se pudo determinar la duración del clip.');
    } else if (probe.durationSec + REEL_THRESHOLDS.durationToleranceSec < expectedDurationSec) {
        // Sólo importa que FALTE metraje: si sobra, el montaje lo recorta.
        failures.push(`El clip dura ${probe.durationSec}s y el montaje necesita ${expectedDurationSec}s.`);
    }

    if (probe.bitrateKbps != null && probe.bitrateKbps < REEL_THRESHOLDS.minSceneBitrateKbps) {
        warnings.push(`Tasa de bits baja en el clip (${probe.bitrateKbps} kbps); el montaje final vuelve a codificar.`);
    }
    if (probe.fps != null && probe.fps < REEL_THRESHOLDS.minFps) {
        failures.push(`Fotogramas por segundo insuficientes: ${probe.fps} fps.`);
    }

    return {
        verdict: failures.length ? 'needs_review' : 'ready',
        failures, warnings,
        checkedAt: new Date().toISOString(),
        measured: probe
    };
};

// ─── Validación del montaje final ──────────────────────────────────────────

// `encoder` distingue quién codificó el archivo, y no es un detalle: cambia qué
// significa una tasa de bits baja.
//
//   'remote' — lo codificó un proveedor con ajustes que no controlamos. Una
//     tasa baja puede ser compresión agresiva sobre contenido complejo, que sí
//     se ve. Se reprueba.
//   'local'  — lo codificamos nosotros con un objetivo de 10 Mbps y un preset
//     conocido. Si sale por debajo es porque el contenido es simple (un plano
//     fijo, un fondo liso), no porque la calidad sea mala: x264 no infla un
//     archivo que no lo necesita. Reprobar ahí sería castigar una escena
//     tranquila. Se avisa y se sigue.
//
// Sin esta distinción, un Reel perfecto de contenido sencillo acababa en
// «Requiere revisión» — exactamente el falso positivo que el módulo tiene que
// evitar.
export const validateReelFile = (probe, { format, qualityTier, expectedDurationSec, expectAudio = true, encoder = 'remote' }) => {
    const tier = resolveTier(format, qualityTier);
    const failures = [];
    const warnings = [];

    if (probe.parseError) failures.push(probe.parseError);
    if (probe.truncated) failures.push('El archivo llegó truncado: hay cajas del contenedor que se salen del tamaño real.');
    if (probe.hasMoov && !probe.hasMdat) failures.push('El archivo no contiene datos de video (`mdat`).');

    if (!probe.width || !probe.height) {
        failures.push('No se pudo determinar la resolución del Reel.');
    } else if (probe.width < tier.width || probe.height < tier.height) {
        failures.push(`Resolución por debajo de lo pedido: ${probe.width}×${probe.height} (se pidió ${tier.label}).`);
    }

    if (!probe.durationSec) {
        failures.push('No se pudo determinar la duración del Reel.');
    } else if (Math.abs(probe.durationSec - expectedDurationSec) > REEL_THRESHOLDS.durationToleranceSec) {
        failures.push(`Duración fuera de rango: ${probe.durationSec}s frente a los ${expectedDurationSec}s del montaje.`);
    }

    if (probe.bitrateKbps != null && probe.bitrateKbps < REEL_THRESHOLDS.minBitrateKbps) {
        if (encoder === 'local') {
            warnings.push(`Tasa de bits de ${probe.bitrateKbps} kbps: el montaje se codificó con objetivo alto, así que el archivo salió liviano porque el contenido es sencillo, no por pérdida de calidad.`);
        } else {
            failures.push(`Tasa de bits baja (${probe.bitrateKbps} kbps): la compresión sería visible al publicar. Mínimo ${REEL_THRESHOLDS.minBitrateKbps} kbps.`);
        }
    }
    if (probe.videoCodec && !REEL_THRESHOLDS.acceptedVideoCodecs.includes(probe.videoCodec)) {
        warnings.push(`Códec de video inesperado (${probe.videoCodec}); se esperaba H.264/H.265.`);
    }
    if (probe.fps != null && probe.fps < REEL_THRESHOLDS.minFps) {
        failures.push(`Fotogramas por segundo insuficientes: ${probe.fps} fps.`);
    }
    if (probe.constantFrameRate === false) {
        warnings.push('El ritmo de fotogramas no es constante; algunas redes lo recodifican.');
    }

    if (expectAudio) {
        if (!probe.hasAudio) {
            failures.push('Se pidió banda sonora y el archivo no trae pista de audio.');
        } else if (probe.audioDriftSec != null && probe.audioDriftSec > REEL_THRESHOLDS.maxAudioDriftSec) {
            failures.push(`Audio y video desfasados en ${probe.audioDriftSec}s.`);
        }
    }

    return {
        verdict: failures.length ? 'needs_review' : 'ready',
        failures, warnings,
        checkedAt: new Date().toISOString(),
        thresholds: REEL_THRESHOLDS,
        measured: probe
    };
};
// ─── Fidelidad de la escena a su fotografía ────────────────────────────────
//
// Dos señales independientes, a propósito:
//
//   1. ESTRUCTURAL (sharp, determinista, sin modelo). Compara la foto original
//      con cada fotograma por dos vías: una huella perceptual —la imagen
//      reducida a 16×16 en gris, cuyo signo respecto de la media es robusto
//      frente a compresión y cambios de luz— y la distancia entre histogramas
//      de color. Es lo que detecta un reencuadre o un viraje de paleta sin
//      pedirle nada a nadie, y es la que sigue funcionando si el proveedor de
//      visión está caído.
//
//   2. SEMÁNTICA (modelo de visión). Mira una composición lado a lado —original
//      a la izquierda, fotograma a la derecha— y responde sobre deformación,
//      identidad, marca y texto. Va lado a lado porque `generateCopy` acepta
//      UNA imagen: pegar las dos en una es lo que permite comparar de verdad en
//      lugar de describir por separado y confiar en la memoria del modelo.
//
// Un fallo de la segunda NO anula la primera: si el modelo no responde, la
// escena se juzga con la estructural sola y la ficha lo dice.

// Huella perceptual de 256 bits (16×16). Devuelve un array de booleanos: cada
// posición dice si ese píxel está por encima de la media de la imagen.
const perceptualHash = async (sharp, buffer) => {
    const { data, info } = await sharp(buffer, { failOn: 'none' })
        .greyscale()
        .resize(16, 16, { fit: 'fill' })
        .raw()
        .toBuffer({ resolveWithObject: true });
    const pixels = Array.from(data.slice(0, info.width * info.height));
    const mean = pixels.reduce((a, b) => a + b, 0) / pixels.length;
    return pixels.map(p => p > mean);
};

// Similitud 0-1 entre dos huellas: la proporción de bits que coinciden,
// reescalada porque dos imágenes sin relación ya coinciden ~50% por azar.
const hashSimilarity = (a, b) => {
    if (!a || !b || a.length !== b.length) return null;
    const same = a.reduce((n, bit, i) => n + (bit === b[i] ? 1 : 0), 0);
    const raw = same / a.length;
    return Number(Math.max(0, (raw - 0.5) * 2).toFixed(3));
};

// Distancia entre histogramas de color, normalizada. 1 = paletas idénticas.
const colourSimilarity = async (sharp, a, b) => {
    const stats = async (buf) => {
        const s = await sharp(buf, { failOn: 'none' }).resize(64, 64, { fit: 'fill' }).stats();
        return s.channels.slice(0, 3).map(c => ({ mean: c.mean, stdev: c.stdev }));
    };
    const [sa, sb] = await Promise.all([stats(a), stats(b)]);
    // Diferencia media de canal, sobre el rango 0-255.
    const diff = sa.reduce((sum, ch, i) =>
        sum + Math.abs(ch.mean - sb[i].mean) + Math.abs(ch.stdev - sb[i].stdev), 0) / (sa.length * 2);
    return Number(Math.max(0, 1 - diff / 128).toFixed(3));
};

// Composición lado a lado para que el modelo compare de verdad. Ambas mitades
// a la misma altura y con una franja separadora, para que no se confundan.
export const buildComparisonImage = async (originalBuffer, frameBuffer, { height = 640 } = {}) => {
    const sharp = (await import('sharp')).default;
    const fit = (buf) => sharp(buf, { failOn: 'none' })
        .resize({ height, fit: 'contain', background: { r: 12, g: 12, b: 12 } })
        .toBuffer({ resolveWithObject: true });

    const [a, b] = await Promise.all([fit(originalBuffer), fit(frameBuffer)]);
    const gap = 8;
    const width = a.info.width + gap + b.info.width;

    return sharp({
        create: { width, height, channels: 3, background: { r: 12, g: 12, b: 12 } }
    })
        .composite([
            { input: a.data, left: 0, top: 0 },
            { input: b.data, left: a.info.width + gap, top: 0 }
        ])
        .jpeg({ quality: 88 })
        .toBuffer();
};

// Compara la foto original con UN fotograma, sólo con sharp. Nunca lanza.
export const structuralCompare = async (originalBuffer, frameBuffer) => {
    try {
        const sharp = (await import('sharp')).default;
        const [ha, hb] = await Promise.all([
            perceptualHash(sharp, originalBuffer),
            perceptualHash(sharp, frameBuffer)
        ]);
        const structure = hashSimilarity(ha, hb);
        const colour = await colourSimilarity(sharp, originalBuffer, frameBuffer);
        // La estructura pesa más que el color: un clip puede virar ligeramente
        // de temperatura sin que nadie lo note, pero un reencuadre sí se ve.
        const score = structure != null && colour != null
            ? Number((structure * 0.65 + colour * 0.35).toFixed(3))
            : null;
        return { structure, colour, score, ok: true };
    } catch (e) {
        return { structure: null, colour: null, score: null, ok: false, error: e.message };
    }
};

/**
 * Nivel de vida de la escena: cuánto CAMBIA el clip entre su primer fotograma y
 * el último.
 *
 * Compara los fotogramas del clip ENTRE SÍ, no contra la foto original. Son dos
 * preguntas distintas: la fidelidad mide si el clip sigue siendo la fotografía;
 * esto mide si dentro del clip pasa algo.
 *
 * Lo que mide y lo que NO
 * -----------------------
 * Devuelve DOS cosas distintas y no hay que confundirlas: `score` es cuánto
 * cambió el clip —sirve para detectar la escena PRÁCTICAMENTE CONGELADA— y
 * `cameraOnly` dice si ese cambio se explica moviendo el encuadre. Desde v4.787
 * el paneo se reconoce aquí, sin modelo de visión: hasta entonces esta medida
 * no distinguía «se movió la gente» de «se movió la cámara» y delegaba en
 * `internalMotion`, que sólo existe cuando el proveedor de visión contesta —así
 * que un desplazamiento sobre una foto quieta pasaba por vida. El modelo sigue
 * emitiendo el juicio fino; lo que ya no hace falta es que esté.
 *
 * Devuelve 0-100 para poder mostrarlo como porcentaje. `null` si no se pudo
 * medir: menos de dos fotogramas, o sharp falló.
 */
export const measureSceneLife = async (frameBuffers = []) => {
    if (!Array.isArray(frameBuffers) || frameBuffers.length < 2) {
        return { score: null, pairs: [], reason: 'Hacen falta al menos dos fotogramas para medir el cambio.' };
    }
    try {
        const sharp = (await import('sharp')).default;
        const hashes = await Promise.all(frameBuffers.map(b => perceptualHash(sharp, b)));
        const pairs = [];
        for (let i = 1; i < hashes.length; i++) {
            const sim = hashSimilarity(hashes[i - 1], hashes[i]);
            if (sim != null) pairs.push(Number((1 - sim).toFixed(4)));
        }
        if (!pairs.length) return { score: null, pairs: [], reason: 'No se pudo comparar los fotogramas.' };

        // El cambio ACUMULADO entre el primero y el último es lo que mejor
        // representa «pasó algo»: un movimiento lento y continuo da diferencias
        // pequeñas entre fotogramas consecutivos pero grande de punta a punta.
        const endToEnd = 1 - (hashSimilarity(hashes[0], hashes[hashes.length - 1]) ?? 1);
        const change = Math.max(endToEnd, ...pairs);

        // 0,12 de diferencia de huella entre extremos es, en las pruebas, el
        // punto en que un clip deja de parecer una foto fija. Se escala a 100
        // ahí para que la cifra sea legible, no porque 0,12 sea «perfecto».
        const score = Math.round(Math.min(1, change / 0.12) * 100);

        // ── Cámara o escena (v4.787) ──
        //
        // Hasta aquí la medida dice CUÁNTO cambió el clip, no QUÉ cambió, y por
        // eso el comentario de arriba delegaba en el modelo de visión. Ya no
        // hace falta delegar el caso que importa: un desplazamiento de encuadre
        // mueve TODOS los píxeles a la vez y en la misma dirección, así que se
        // reconoce compensándolo. Si al desplazar el último fotograma sobre el
        // primero la diferencia casi desaparece, dentro del cuadro no pasó
        // nada: es cámara.
        const camera = await compareAfterCameraShift(sharp, frameBuffers[0], frameBuffers[frameBuffers.length - 1]);
        return {
            score, pairs, endToEnd: Number(endToEnd.toFixed(4)),
            ...camera
        };
    } catch (e) {
        return { score: null, pairs: [], reason: `No se pudo medir el movimiento: ${e.message}` };
    }
};

// Cuánto del cambio tiene que explicar un simple desplazamiento del encuadre
// para llamarlo cámara. Medido sobre los tres clips que el cliente adjuntó al
// reporte —los tres, desplazamiento puro sobre una foto quieta—: 0,900, 0,919 y
// 0,965. Un clip con vida real deja residuo donde las personas se movieron y no
// llega aquí; en las pruebas sintéticas, un cambio interno del 15 % del cuadro
// baja el explicado por debajo de 0,5. El margen entre las dos poblaciones es
// ancho, que es lo que hace que 0,8 no sea un número delicado.
export const CAMERA_EXPLAINED_MIN = 0.8;

// Rejilla de búsqueda del desplazamiento, en píxeles de la imagen reducida.
// ±12 sobre 96 px de ancho equivale a un octavo del cuadro: más que cualquier
// paneo que la plataforma genera, y barato de recorrer.
const SHIFT_WIDTH = 96;
const SHIFT_RANGE = 12;
const SHIFT_MARGIN = 14;

/**
 * ¿El cambio entre dos fotogramas se explica moviendo el encuadre?
 *
 * Busca el desplazamiento entero que MINIMIZA la diferencia media entre los dos
 * fotogramas, en gris y muy reducidos —el detalle fino no aporta y sí ruido—, y
 * compara ese residuo con la diferencia sin compensar.
 *
 * Es determinista y no depende de ningún proveedor, que es justamente lo que le
 * faltaba a esta medición: `internalMotion` sólo existe cuando el modelo de
 * visión contesta, y sin él un paneo pasaba por vida.
 *
 * El margen recortado no es decorativo: al desplazar entran píxeles nuevos por
 * un borde y salen por el otro, y compararlos mediría el borde, no la escena.
 */
const compareAfterCameraShift = async (sharp, firstBuffer, lastBuffer) => {
    try {
        const grey = async (buf) => {
            const { data, info } = await sharp(buf, { failOn: 'none' })
                .greyscale()
                .resize(SHIFT_WIDTH, null, { fit: 'inside' })
                // Un desenfoque suave antes de comparar. Un paneo real no se
                // desplaza un número entero de píxeles de la imagen reducida, y
                // sobre detalle fino ese resto fraccionario deja residuo aunque
                // el encuadre sea lo único que se movió: se estaría midiendo el
                // aliasing, no la escena. Con el detalle fino atenuado, el
                // desplazamiento entero explica lo que tiene que explicar.
                .blur(1)
                .raw()
                .toBuffer({ resolveWithObject: true });
            return { d: data, w: info.width, h: info.height };
        };
        const A = await grey(firstBuffer);
        const B = await grey(lastBuffer);
        if (A.w !== B.w || A.h !== B.h) return { cameraOnly: false, explainedByCamera: null };
        if (A.w <= SHIFT_MARGIN * 2 || A.h <= SHIFT_MARGIN * 2) return { cameraOnly: false, explainedByCamera: null };

        const meanAbs = (dx, dy) => {
            let sum = 0, n = 0;
            for (let y = SHIFT_MARGIN; y < A.h - SHIFT_MARGIN; y++) {
                const yy = y + dy;
                if (yy < 0 || yy >= B.h) continue;
                for (let x = SHIFT_MARGIN; x < A.w - SHIFT_MARGIN; x++) {
                    const xx = x + dx;
                    if (xx < 0 || xx >= B.w) continue;
                    sum += Math.abs(A.d[y * A.w + x] - B.d[yy * B.w + xx]);
                    n++;
                }
            }
            return n ? sum / n : null;
        };

        const raw = meanAbs(0, 0);
        if (raw == null) return { cameraOnly: false, explainedByCamera: null };

        let best = { value: raw, dx: 0, dy: 0 };
        for (let dy = -SHIFT_RANGE; dy <= SHIFT_RANGE; dy++) {
            for (let dx = -SHIFT_RANGE; dx <= SHIFT_RANGE; dx++) {
                const v = meanAbs(dx, dy);
                if (v != null && v < best.value) best = { value: v, dx, dy };
            }
        }

        // Un clip que ya era casi idéntico sin compensar no se juzga por esta
        // vía: ahí no hay desplazamiento que explicar, hay una escena quieta, y
        // de eso ya se ocupa `score`. Afirmar «es cámara» sobre dos fotogramas
        // iguales sería inventar un movimiento que no existe.
        if (raw < 1.5) return { cameraOnly: false, explainedByCamera: null, cameraShift: { dx: 0, dy: 0 } };

        const explained = Number((1 - best.value / raw).toFixed(3));
        return {
            explainedByCamera: explained,
            cameraShift: { dx: best.dx, dy: best.dy },
            cameraOnly: explained >= CAMERA_EXPLAINED_MIN && (best.dx !== 0 || best.dy !== 0)
        };
    } catch {
        // Sin medida no se afirma nada: `cameraOnly:false` deja decidir al resto.
        return { cameraOnly: false, explainedByCamera: null };
    }
};

// Por debajo de esto la escena se considera congelada: no es «poco
// movimiento», es «no pasa nada».
export const FROZEN_LIFE_SCORE = 25;

const FIDELITY_SYSTEM = `Eres un control de calidad de vídeo publicitario. Recibes UNA imagen dividida en dos mitades: a la IZQUIERDA la fotografía ORIGINAL, a la DERECHA un FOTOGRAMA del vídeo que una IA generó a partir de ella. Dices si el vídeo conservó la fotografía o la reinterpretó.

Respondes SIEMPRE con un único objeto JSON válido, sin texto alrededor y sin bloques de código:

{
  "score": 0..10,
  "internalMotion": 0..10,
  "peopleLeft": 0,
  "peopleRight": 0,
  "newSubjects": boolean,
  "occlusionBroken": boolean,
  "faceConsistency": 0..10,
  "deformation": boolean,
  "identityDrift": boolean,
  "brandAltered": boolean,
  "textIllegible": boolean,
  "colorShift": boolean,
  "anatomyErrors": boolean,
  "textLeft": "todo el texto que leas en la mitad izquierda, o cadena vacía",
  "textRight": "todo el texto que leas en la mitad derecha, o cadena vacía",
  "issues": ["descripción breve en español de cada problema real"]
}

- "score" 10 = la mitad derecha es indistinguible de la izquierda salvo por el movimiento natural; 7 = diferencias mínimas aceptables; por debajo de 7 = hay que regenerar.
- "peopleLeft" y "peopleRight": cuenta las personas de cada mitad, incluyendo las que se ven a medias —media cara detrás de un hombro, alguien cortado por el borde, una silueta al fondo—. Cuenta las DOS mitades en la misma pasada y con el mismo criterio: lo que importa es la diferencia entre ambos números, no su valor exacto.
- "newSubjects" es true si en la mitad derecha hay alguna persona, rostro, cuerpo, extremidad o silueta que NO esté en la izquierda: alguien de más, una cara duplicada, una figura que asoma donde antes no había nadie, un brazo o una mano que no pertenece a nadie visible. Es el defecto más grave que puedes reportar.
- "occlusionBroken" es true si algo que en la izquierda estaba tapado —una cara detrás de un hombro, un cuerpo detrás de otra persona, algo cortado por el borde— aparece completo o revelado en la derecha.
- "faceConsistency" 0..10: cuánto se parecen los rostros de la derecha a los de la izquierda, persona por persona. 10 = son las mismas caras; 0 = hay rostros distintos o mezclados.
- Una persona que se MUEVE, gira la cabeza o cambia de expresión sigue siendo la misma persona: eso no es "newSubjects" ni baja "faceConsistency".
- "internalMotion" responde a OTRA pregunta, independiente de "score": ¿la escena VIVE? 10 = las personas u objetos se han movido de verdad —una cabeza girada, una mano en otra posición, una expresión distinta, tela o vegetación desplazada—. 5 = apenas se aprecia algún cambio. 0 = la mitad derecha es la misma escena congelada, o lo único que cambió es el ENCUADRE (la imagen se ve desplazada, acercada o recortada, pero nadie se ha movido dentro de ella). Un paneo o un zoom, por marcado que sea, es 0: no es vida, es cámara.
- Se ESPERA movimiento: un cambio de postura, una mano que se mueve o una hoja que se agita NO son defectos. Sí lo son un rostro que cambia de persona, un logotipo redibujado o un texto que ya no dice lo mismo.
- "textLeft" y "textRight": transcribe literalmente lo que se lea en cada mitad. Si no hay texto, cadena vacía. Es lo que permite detectar que un cartel cambió de contenido.
- "brandAltered" es true si un logotipo, una marca o un texto institucional cambió de forma, tipografía o color.
- "issues" vacío si no hay ningún problema. No inventes problemas para justificar la nota.`;

// `generateCopy` devuelve { content, raw, provider, model }, no una cadena.
// Ver la nota en `reelDirector.js`: tratarlo como texto deja la comprobación de
// fidelidad permanentemente en `unavailable`.
const parseJsonObject = (result) => {
    const text = result == null ? '' : (typeof result === 'string' ? result : (result.content || ''));
    if (!text) return null;
    const cleaned = text.replace(/```json\s*|```/g, '').trim();
    try { return JSON.parse(cleaned); } catch { /* sigue */ }
    const s = cleaned.indexOf('{');
    const e = cleaned.lastIndexOf('}');
    if (s === -1 || e <= s) return null;
    try { return JSON.parse(cleaned.slice(s, e + 1)); } catch { return null; }
};

// Normaliza un texto para compararlo: sin acentos, sin signos, sin dobles
// espacios. Dos transcripciones del mismo cartel nunca vienen idénticas.
const normaliseText = (t) => String(t || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

// Compara las dos transcripciones por palabras. Devuelve null cuando no hay
// texto en el original: no se puede juzgar la legibilidad de lo que no existe.
const compareText = (left, right) => {
    const a = normaliseText(left);
    const b = normaliseText(right);
    if (!a) return null;
    const wa = new Set(a.split(' ').filter(w => w.length > 2));
    if (!wa.size) return null;
    const wb = new Set(b.split(' ').filter(w => w.length > 2));
    const kept = [...wa].filter(w => wb.has(w)).length;
    return {
        ratio: Number((kept / wa.size).toFixed(2)),
        // Cuántas palabras se compararon. Una proporción sobre tres palabras no
        // dice nada, y sin este dato no hay forma de saberlo después.
        words: wa.size,
        original: a.slice(0, 200), rendered: b.slice(0, 200)
    };
};

// Evalúa UN fotograma. Devuelve la parte estructural aunque el modelo falle.
const checkFrame = async ({ originalBuffer, frame, analysis }) => {
    const structural = await structuralCompare(originalBuffer, frame.buffer);

    let semantic = null;
    try {
        const comparison = await buildComparisonImage(originalBuffer, frame.buffer);
        const url = await frame.publish?.(comparison);
        if (!url) throw new Error('no se pudo publicar la comparación');

        const focus = [];
        if (analysis?.hasBrand) focus.push('Hay logotipos o marca institucional: revisá su forma, su tipografía y sus colores con especial cuidado.');
        if (analysis?.hasText) focus.push('Hay texto legible: transcribí las dos mitades y comprobá que diga lo mismo.');
        if (analysis?.hasPeople) focus.push('Hay personas: revisá rostros, manos y proporciones.');
        // El censo de la foto se le da como referencia, no como respuesta: lo
        // que decide es lo que él CUENTA en las dos mitades. Dárselo hecho
        // invitaría a repetirlo en vez de mirar.
        if (analysis?.personCount) focus.push(`El análisis de la fotografía original contó ${analysis.personCount} persona(s): contá vos las dos mitades y decí lo que veas.`);
        if (analysis?.occludedPeople) focus.push('En la fotografía original hay personas parcialmente tapadas: comprobá que sigan igual de tapadas en el fotograma.');

        const result = await generateCopy({
            system: FIDELITY_SYSTEM,
            userText: [
                `Fotograma tomado en el segundo ${frame.at} del clip (${frame.position}).`,
                analysis?.summary ? `La fotografía original muestra: ${analysis.summary}` : '',
                focus.join(' '),
                'Devolvé únicamente el JSON.'
            ].filter(Boolean).join('\n'),
            imageUrl: url,
            temperature: 0.1,
            maxTokens: 700,
            jsonMode: true
        });
        const raw = parseJsonObject(result);
        if (raw) {
            const score = Number(raw.score);
            semantic = {
                score: Number.isFinite(score) ? Math.min(10, Math.max(0, score)) : null,
                // Cuánta VIDA vio el modelo en ese fotograma respecto del
                // original. Es independiente de `score`: una escena puede
                // conservar la foto perfectamente (score 10) y estar congelada
                // (internalMotion 0), que es exactamente el defecto que se
                // busca detectar.
                internalMotion: Number.isFinite(Number(raw?.internalMotion))
                    ? Math.min(10, Math.max(0, Number(raw.internalMotion))) : null,
                // Censo del fotograma (v4.705). Los dos números salen de la
                // MISMA pasada sobre la MISMA imagen, así que su diferencia es
                // mucho más fiable que cualquiera de ellos por separado: el
                // sesgo de conteo del modelo se cancela.
                peopleLeft: Number.isFinite(Number(raw?.peopleLeft)) ? Math.max(0, Math.round(Number(raw.peopleLeft))) : null,
                peopleRight: Number.isFinite(Number(raw?.peopleRight)) ? Math.max(0, Math.round(Number(raw.peopleRight))) : null,
                newSubjects: raw.newSubjects === true,
                occlusionBroken: raw.occlusionBroken === true,
                faceConsistency: Number.isFinite(Number(raw?.faceConsistency))
                    ? Math.min(10, Math.max(0, Number(raw.faceConsistency))) : null,
                deformation: raw.deformation === true,
                identityDrift: raw.identityDrift === true,
                brandAltered: raw.brandAltered === true,
                textIllegible: raw.textIllegible === true,
                colorShift: raw.colorShift === true,
                anatomyErrors: raw.anatomyErrors === true,
                text: compareText(raw.textLeft, raw.textRight),
                issues: Array.isArray(raw.issues)
                    ? raw.issues.filter(i => typeof i === 'string').slice(0, 4).map(i => i.slice(0, 200))
                    : [],
                comparisonUrl: url
            };
        }
    } catch (e) {
        console.warn(`[REEL] fidelidad semántica del fotograma ${frame.at}s:`, e.message);
    }

    return { at: frame.at, position: frame.position, frameUrl: frame.url || null, structural, semantic };
};

// ─── Fidelidad de identidad visual (marca) — v4.715 ────────────────────────
//
// POR QUÉ HACE FALTA UN CONTROL APARTE PARA LOS LOGOTIPOS
//
// El control de fidelidad general mira una composición lado a lado REDUCIDA a
// 640 px de alto (`buildComparisonImage`). Un fotograma de 1080x1920 se achica
// tres veces, así que el estampado de la espalda de una camiseta —unos 230x140
// px en el fotograma— llega a la imagen que ve el modelo con 77x47 px, y las
// letras de «Rotary» con 9 px de alto. A ese tamaño no las lee ningún modelo de
// visión, y encima se recomprime a JPEG.
//
// Por eso `brandAltered` contestaba `false` con un logotipo visiblemente
// destrozado: no era un error de criterio del modelo, es que no se le estaba
// enseñando el logotipo. La escena pasaba en verde y la maquinaria de
// regeneración —que YA existe y descalifica por `brandAltered`— no llegaba a
// dispararse nunca.
//
// QUÉ HACE ESTE CONTROL
//
// Recorta la región de cada marca en la fotografía original y en cada fotograma
// del clip, A RESOLUCIÓN NATIVA, y las compara. Dos señales, como en el resto
// del módulo:
//
//   1. ESTRUCTURAL sobre el recorte (sharp, determinista, sin API). Sobre una
//      región pequeña la huella perceptual es MUCHO más sensible que sobre la
//      escena entera: ahí un logotipo ocupa el 1 % de los píxeles y no mueve la
//      aguja; recortado, es el 100 %.
//   2. TEMPORAL: el mismo recorte comparado entre fotogramas del propio clip.
//      Un logotipo que cambia de dibujo entre fotograma y fotograma es el
//      defecto de «derretimiento», y se ve sin mirar el original.
//
// Y una sola llamada de visión sobre el PEOR fotograma, con el recorte ampliado
// —no reducido—, que es la única forma de preguntar por el texto y la geometría
// del engranaje y obtener una respuesta con sentido.
//
// LO QUE ESTE CONTROL NO HACE, Y POR QUÉ
//
// No reproyecta el logotipo original sobre cada fotograma. Eso es composite, y
// la regla #1 del sitio lo prohíbe —el equipo lo rechazó dos veces con las
// palabras «se ve overlay / montaje»—. Además exigiría decodificar el video
// entero, seguir la tela con flujo óptico y volver a codificar, dentro de una
// función de 120 s y 250 MB que ya empaqueta FFmpeg. Este control MIDE y manda
// a regenerar; no retoca el archivo.
const BRAND_MARGIN = 0.12;          // margen alrededor del recuadro, para no cortar trazos
export const BRAND_MIN_STRUCTURE = 0.55;   // por debajo, el dibujo cambió
export const BRAND_MIN_TEMPORAL = 0.62;    // por debajo, cambia entre fotogramas

// Recorta una región normalizada de una imagen, con margen, a resolución nativa.
// Devuelve `null` si el recorte no tiene sentido (región degenerada o fuera).
const cropBrandRegion = async (sharp, buffer, region) => {
    try {
        const meta = await sharp(buffer, { failOn: 'none' }).metadata();
        if (!meta.width || !meta.height) return null;
        const mx = region.w * BRAND_MARGIN, my = region.h * BRAND_MARGIN;
        const x0 = Math.max(0, region.x - mx), y0 = Math.max(0, region.y - my);
        const x1 = Math.min(1, region.x + region.w + mx), y1 = Math.min(1, region.y + region.h + my);
        const left = Math.round(x0 * meta.width), top = Math.round(y0 * meta.height);
        const width = Math.round((x1 - x0) * meta.width), height = Math.round((y1 - y0) * meta.height);
        if (width < 12 || height < 12) return null;
        return await sharp(buffer, { failOn: 'none' })
            .extract({ left, top, width, height })
            .toBuffer();
    } catch { return null; }
};

const BRAND_SYSTEM = `Eres un control de calidad de identidad visual de marca. Recibes UNA imagen dividida en dos mitades: a la IZQUIERDA el logotipo tal como aparece en la FOTOGRAFÍA original, a la DERECHA el mismo logotipo en un FOTOGRAMA del vídeo que una IA generó a partir de ella. Ambos recortes están ampliados.

Respondes SIEMPRE con un único objeto JSON válido, sin texto alrededor y sin bloques de código:

{
  "textLeft": "el texto que leas en el logotipo de la izquierda, o cadena vacía",
  "textRight": "el texto que leas en el logotipo de la derecha, o cadena vacía",
  "sameDesign": boolean,
  "inventedGlyphs": boolean,
  "geometryBroken": boolean,
  "colorChanged": boolean,
  "score": 0..10,
  "issues": ["descripción breve en español de cada problema real"]
}

- "sameDesign" es true si es el MISMO logotipo: mismo símbolo, misma tipografía, mismas proporciones. Que esté más borroso, más pequeño, en otro ángulo o parcialmente tapado por un brazo NO lo hace distinto.
- "inventedGlyphs" es true si en la derecha hay letras o signos que no están en la izquierda, o si las letras se volvieron garabatos sin sentido.
- "geometryBroken" es true si el símbolo perdió su forma: un engranaje al que le cambian los dientes, un círculo que se volvió óvalo irregular, trazos que se funden entre sí.
- "colorChanged" es true si los colores institucionales cambiaron de tono.
- "score" 10 = es el mismo logotipo, sólo movido o con la tela plegada; 7 = reconocible con pérdidas menores; por debajo de 7 = el diseño se alteró.
- Una oclusión parcial —un brazo delante, un pliegue— no es una alteración: es la escena. No la marques como defecto.`;

/**
 * Comprueba la fidelidad de las marcas de una escena.
 *
 * `frames` son los mismos fotogramas del control general, con su buffer y su
 * `publish`. `regions` viene del análisis de la fotografía.
 *
 * Devuelve `null` cuando no hay nada que comprobar — sin regiones declaradas no
 * se afirma haber mirado ningún logotipo.
 */
export const checkBrandFidelity = async ({ originalBuffer, frames = [], regions = [] }) => {
    if (!originalBuffer || !frames.length || !regions.length) return null;

    let sharp;
    try { sharp = (await import('sharp')).default; }
    catch (e) { return { state: 'unavailable', reason: `No se pudo inspeccionar la marca: ${e.message}`, logos: [] }; }

    const logos = [];
    for (const region of regions.slice(0, 4)) {
        const originalCrop = await cropBrandRegion(sharp, originalBuffer, region);
        if (!originalCrop) continue;

        // El mismo recorte en cada fotograma del clip. La región se toma en las
        // MISMAS coordenadas normalizadas: el encuadre no cambia (la cámara está
        // fija) y por eso el recorte cae sobre el mismo sitio.
        const crops = [];
        for (const f of frames) {
            const c = await cropBrandRegion(sharp, f.buffer, region);
            crops.push(c ? { at: f.at, position: f.position, buffer: c, publish: f.publish } : null);
        }
        const valid = crops.filter(Boolean);
        if (!valid.length) continue;

        // 1. Estructural: cada recorte del clip contra el recorte del original.
        const perFrame = [];
        for (const c of valid) {
            const cmp = await structuralCompare(originalCrop, c.buffer);
            perFrame.push({ at: c.at, position: c.position, structure: cmp.structure, score: cmp.score });
        }
        const structural = perFrame.map(f => f.score).filter(v => v != null);
        const worstStructural = structural.length ? Math.min(...structural) : null;

        // 2. Temporal: los recortes del clip entre sí. Un logotipo que se
        //    redibuja fotograma a fotograma es el «derretimiento» reportado, y
        //    se detecta sin necesidad del original.
        let temporal = null;
        if (valid.length >= 2) {
            const sims = [];
            for (let i = 1; i < valid.length; i++) {
                const cmp = await structuralCompare(valid[i - 1].buffer, valid[i].buffer);
                if (cmp.score != null) sims.push(cmp.score);
            }
            if (sims.length) temporal = Number(Math.min(...sims).toFixed(3));
        }

        // 3. Visión sobre el PEOR fotograma, ampliado. Uno solo: la deriva es
        //    progresiva y el peor es el que decide; tres llamadas por logotipo
        //    triplicarían el coste para confirmar lo mismo.
        let semantic = null;
        const worstFrame = perFrame.length
            ? valid[perFrame.indexOf(perFrame.reduce((a, b) => ((b.score ?? 1) < (a.score ?? 1) ? b : a)))]
            : null;
        if (worstFrame) {
            try {
                // 520 px de alto por mitad: el recorte se AMPLÍA en vez de
                // reducirse, que es el punto de todo esto.
                const comparison = await buildComparisonImage(originalCrop, worstFrame.buffer, { height: 520 });
                const url = await worstFrame.publish?.(comparison);
                if (url) {
                    const result = await generateCopy({
                        system: BRAND_SYSTEM,
                        userText: `Logotipo: ${region.label || 'marca institucional'}. Recorte tomado en el segundo ${worstFrame.at} del clip. Devolvé únicamente el JSON.`,
                        imageUrl: url,
                        temperature: 0.1, maxTokens: 500, jsonMode: true
                    });
                    const raw = parseJsonObject(result);
                    if (raw) {
                        const sc = Number(raw.score);
                        semantic = {
                            score: Number.isFinite(sc) ? Math.min(10, Math.max(0, sc)) : null,
                            sameDesign: raw.sameDesign !== false,
                            inventedGlyphs: raw.inventedGlyphs === true,
                            geometryBroken: raw.geometryBroken === true,
                            colorChanged: raw.colorChanged === true,
                            text: compareText(raw.textLeft, raw.textRight),
                            issues: Array.isArray(raw.issues)
                                ? raw.issues.filter(i => typeof i === 'string').slice(0, 3).map(i => i.slice(0, 160)) : [],
                            comparisonUrl: url
                        };
                    }
                }
            } catch (e) {
                console.warn(`[REEL] fidelidad de marca «${region.label}»:`, e.message);
            }
        }

        // El texto del logotipo es la señal más dura que hay: si el original
        // decía «Rotary» y el fotograma dice otra cosa, no hay matiz posible.
        const textRatio = semantic?.text?.ratio ?? null;
        const textBroken = textRatio != null && textRatio < 0.6;

        // QUIÉN DECIDE, Y POR QUÉ NO LAS SEÑALES DETERMINISTAS CUANDO HAY MODELO
        //
        // El recorte se toma en coordenadas FIJAS y la persona SE MUEVE: en el
        // último fotograma el estampado puede haberse desplazado, girado con el
        // torso o quedado tapado por un brazo. La huella perceptual del recorte
        // no distingue «el logotipo se movió» de «el logotipo cambió» —es la
        // misma limitación que ya está anotada para la fidelidad general— y
        // hacerla decidir mandaría a regenerar escenas correctas. Ese error ya
        // costó dos rondas de créditos en v4.675 y no se repite.
        //
        // Así que con modelo de visión decide el modelo, que sí puede mirar el
        // recorte ampliado y decir si es el mismo dibujo. Las señales
        // deterministas se muestran igual —son medidas reales y ayudan a
        // entender el veredicto— pero sólo deciden solas cuando no hubo modelo.
        const alteredByVision = Boolean(
            semantic?.inventedGlyphs || semantic?.geometryBroken
            || semantic?.sameDesign === false || textBroken
            || (semantic?.score != null && semantic.score < REEL_THRESHOLDS.minFidelityScore)
        );
        const alteredByMetrics = Boolean(
            (worstStructural != null && worstStructural < BRAND_MIN_STRUCTURE)
            || (temporal != null && temporal < BRAND_MIN_TEMPORAL)
        );
        const altered = semantic ? alteredByVision : alteredByMetrics;

        logos.push({
            label: region.label || 'Marca',
            region,
            framesChecked: valid.length,
            structuralScore: worstStructural,
            temporalScore: temporal,
            score: semantic?.score ?? (worstStructural != null ? Number((worstStructural * 10).toFixed(1)) : null),
            method: semantic ? 'estructural + visión' : 'sólo estructural',
            sameDesign: semantic?.sameDesign ?? null,
            inventedGlyphs: semantic?.inventedGlyphs ?? null,
            geometryBroken: semantic?.geometryBroken ?? null,
            colorChanged: semantic?.colorChanged ?? null,
            textKeptRatio: textRatio,
            textOriginal: semantic?.text?.original ?? null,
            textRendered: semantic?.text?.rendered ?? null,
            comparisonUrl: semantic?.comparisonUrl || null,
            issues: semantic?.issues || [],
            altered,
            // De dónde salió el veredicto. Se muestra porque «sólo estructural»
            // significa que el recorte se comparó sin nadie capaz de distinguir
            // un logotipo movido de uno redibujado.
            decidedBy: semantic ? 'vision' : 'metrics',
            metricsWarn: !semantic && alteredByMetrics ? true : (semantic && alteredByMetrics ? true : false),
            perFrame
        });
    }

    if (!logos.length) return null;

    const altered = logos.filter(l => l.altered);
    return {
        state: altered.length ? 'failed' : 'ok',
        label: altered.length ? 'Identidad visual alterada' : 'Identidad visual conservada',
        logos,
        alteredCount: altered.length,
        total: logos.length,
        // El peor logotipo manda: una pieza institucional con UN emblema roto
        // está rota. No se promedia.
        score: logos.map(l => l.score).filter(v => v != null).length
            ? Math.min(...logos.map(l => l.score).filter(v => v != null)) : null,
        reason: altered.length
            ? `${altered.length} de ${logos.length} logotipo(s) no conservan su diseño: ${altered.map(l => l.label).join(', ')}.`
            : null
    };
};

// Un rostro por debajo de esto ya no es la misma cara.
const MIN_FACE_CONSISTENCY = 6;

// ── Umbrales del control de TEXTO (v4.790) ──
//
// `TEXT_KEPT_MIN` es el punto por debajo del cual la transcripción del clip ya
// no se parece a la del original; `TEXT_KEPT_COLLAPSE` es el desplome que no
// se explica por una lectura incompleta —el texto no está borroso, no está—.
// `RELIABLE_TEXT_WORDS` es el vocabulario mínimo para que una proporción
// signifique algo: sobre tres palabras, perder una es el 33 %.
const TEXT_KEPT_MIN = 0.5;
const TEXT_KEPT_COLLAPSE = 0.2;
const RELIABLE_TEXT_WORDS = 4;

// Por encima de este censo el recuento de un modelo de visión deja de ser
// fiable —contar catorce cabezas en una foto de grupo no lo hace bien ningún
// modelo—, así que en multitudes sólo vale la señal explícita `newSubjects`, no
// la diferencia de números. Contar mal y regenerar por eso sería gastar
// créditos en un problema inexistente, que es el error que ya costó dos rondas
// en v4.675.
const RELIABLE_COUNT_MAX = 8;

/**
 * ¿El texto de la fotografía sigue siendo legible en el clip? (v4.790)
 *
 * Vive aparte y es PURA por el mismo motivo que `buildPeopleReport`: es un
 * CRITERIO —cuándo una proporción de palabras significa algo— y un criterio que
 * sólo se ejercita contra un proveedor real acaba sin pruebas, y entonces nadie
 * se entera de que cambió de signo.
 *
 * Recibe la comparación de transcripciones POR FOTOGRAMA y decide. No mira la
 * marca explícita del modelo: ésa descalifica sola y se agrega aparte.
 */
export const judgeTextFidelity = (textChecks = []) => {
    const checks = (Array.isArray(textChecks) ? textChecks : []).filter(t => t && t.ratio != null);
    if (!checks.length) return { worst: null, words: 0, failed: false, noise: false, reliable: null };

    const worst = Math.min(...checks.map(t => t.ratio));
    const words = Math.max(...checks.map(t => t.words || 0));
    const bajos = checks.filter(t => t.ratio < TEXT_KEPT_MIN).length;
    const reliable = words >= RELIABLE_TEXT_WORDS;

    const failed = reliable
        && (worst <= TEXT_KEPT_COLLAPSE || (worst < TEXT_KEPT_MIN && bajos >= 2));

    return {
        worst, words, reliable, failed,
        // Hubo desvío y no contó. Se dice, igual que `countNoise` con las
        // personas: esconderlo es el defecto opuesto al de descalificar por
        // ruido de transcripción.
        noise: !failed && worst < TEXT_KEPT_MIN,
        framesBelow: bajos,
    };
};

/**
 * Fidelidad humana de la escena: seis comprobaciones sobre las personas.
 *
 * Lo que se compara es la MITAD IZQUIERDA contra la DERECHA de la misma imagen
 * de comparación, contadas por el mismo modelo en la misma pasada. Es
 * deliberado: el sesgo de conteo de un modelo se cancela al restar, mientras
 * que contrastar contra un censo tomado en otra llamada compararía dos criterios
 * distintos y daría falsos positivos.
 *
 * `analysis.personCount` sí se usa, pero sólo para MOSTRARLO —«personas
 * detectadas en la fotografía original»— y como referencia en el prompt. El
 * veredicto no depende de él.
 *
 * Devuelve `null` cuando no hay personas o no hubo modelo de visión: no se
 * afirma haber comprobado lo que no se comprobó.
 */
export const buildPeopleReport = (semantics, analysis) => {
    if (!analysis?.hasPeople) return null;
    const withCount = semantics.filter(s => s.peopleLeft != null && s.peopleRight != null);
    const withFlags = semantics.filter(s => s.newSubjects != null);
    if (!withCount.length && !withFlags.length) return null;

    // El peor fotograma manda, igual que en la fidelidad: la deriva de un motor
    // generativo es progresiva y una figura que aparece al final es tan defecto
    // como una que aparece al principio.
    const sourceCount = Number.isFinite(Number(analysis?.personCount)) && analysis.personCount > 0
        ? Number(analysis.personCount) : null;
    const originalSeen = withCount.length ? Math.max(...withCount.map(s => s.peopleLeft)) : null;
    // El desvío se mira en las DOS direcciones por fotograma. Con un solo
    // `Math.max` se detectaba que sobrara gente pero nunca que faltara: un
    // fotograma con una persona de menos quedaba tapado por los otros dos, que
    // sí cuadraban. Lo destapó la prueba de «alguien desaparece».
    const deltas = withCount.map(s => s.peopleRight - s.peopleLeft);
    const maxDelta = deltas.length ? Math.max(...deltas) : null;
    const minDelta = deltas.length ? Math.min(...deltas) : null;
    const worstDelta = maxDelta == null ? null
        : (Math.abs(maxDelta) >= Math.abs(minDelta) ? maxDelta : minDelta);
    // El recuento que se muestra es el del fotograma que MÁS se desvía: es el
    // que explica el veredicto. Con todo cuadrado da el recuento real.
    const worstFrame = withCount.length
        ? withCount.reduce((a, b) => (Math.abs(b.peopleRight - b.peopleLeft) > Math.abs(a.peopleRight - a.peopleLeft) ? b : a))
        : null;
    const clipSeen = worstFrame ? worstFrame.peopleRight : null;

    const newSubjects = semantics.some(s => s.newSubjects === true);
    const occlusionBroken = semantics.some(s => s.occlusionBroken === true);
    const faces = semantics.map(s => s.faceConsistency).filter(v => v != null);
    const faceConsistency = faces.length ? Math.min(...faces) : null;

    // El recuento sólo descalifica por sí solo en grupos donde contar es fiable.
    const countable = originalSeen != null && originalSeen <= RELIABLE_COUNT_MAX;

    // ── Un ±1 en UN fotograma es ruido, no evidencia (v4.787) ──
    //
    // El comentario de abajo ya lo decía —«una persona casi tapada por otra se
    // cuenta o no se cuenta según el fotograma»— y aun así el veredicto se
    // tomaba del peor fotograma. Con tres fotogramas y un grupo de tres o
    // cuatro personas, la probabilidad de que ALGUNO desvíe en uno es alta, así
    // que en la práctica casi toda escena con gente se descalificaba: se
    // gastaban los dos intentos y la escena terminaba sustituida por la
    // fotografía en movimiento. Es la causa del defecto reportado —«no genera
    // videos, solo les pone movimiento a las imágenes»—: la puerta estaba tan
    // cerrada que no pasaba nada vivo.
    //
    // Lo que se exige ahora es CORROBORACIÓN, y el criterio sale de qué tan
    // difícil es la cuenta:
    //
    //   · De CERO a uno no hay ruido posible: nadie confunde una escena vacía
    //     con una habitada. Cualquier aparición descalifica en el acto — es la
    //     exigencia expresa del cliente («si la fotografía tiene 0 personas, el
    //     video debe mantener 0 personas») y no se toca.
    //   · Un desvío de DOS o más en un fotograma ya no es un recuento dudoso.
    //   · Un desvío de uno cuenta si se repite en al menos DOS fotogramas en la
    //     MISMA dirección: el ruido de conteo no es sistemático, un sujeto
    //     inventado sí — dura en el clip.
    //
    // No se afloja ninguna otra puerta: `newSubjects`, la oclusión rota y los
    // rostros inconsistentes siguen descalificando solos.
    const empty = originalSeen === 0;
    const framesWithGrowth = deltas.filter(d => d > 0).length;
    const framesWithLoss = deltas.filter(d => d < 0).length;
    const countGrew = countable && maxDelta != null && maxDelta > 0
        && (empty || maxDelta >= 2 || framesWithGrowth >= 2);
    const countShrank = countable && minDelta != null && minDelta < 0
        && (minDelta <= -2 || framesWithLoss >= 2);
    const facesBroken = faceConsistency != null && faceConsistency < MIN_FACE_CONSISTENCY;

    // El recuento descalifica en LAS DOS DIRECCIONES. Que sobre gente es el
    // defecto reportado, pero que falte también lo pidió el equipo («no
    // disappearing person») y, sobre todo, el ruido de conteo es simétrico: una
    // persona casi tapada por otra se cuenta o no se cuenta según el fotograma,
    // igual de fácil en un sentido que en el otro. Tratar sólo un lado dejaba
    // además un indicador en rojo bajo una cabecera en verde.
    const failed = newSubjects || countGrew || countShrank || occlusionBroken || facesBroken;

    const reason = newSubjects
        ? 'Aparece en el clip alguna persona, rostro o silueta que no está en la fotografía.'
        : countGrew
            ? `El clip llegó a mostrar ${clipSeen} persona(s) donde la fotografía tiene ${originalSeen}.`
            : countShrank
                ? `El clip llegó a mostrar ${clipSeen} persona(s) y la fotografía tiene ${originalSeen}: alguien desaparece.`
                : occlusionBroken
                    ? 'El clip reveló algo que la fotografía mantiene tapado: una cara o un cuerpo que estaba oculto.'
                    : facesBroken
                        ? `Los rostros no se conservan (consistencia ${faceConsistency}/10).`
                        : null;

    return {
        verdict: failed ? 'failed' : 'ok',
        // ── Quién NO ESTABA vs cómo está DIBUJADO (v4.794) ──
        //
        // `verdict` junta seis comprobaciones, y v4.792 lo tomó entero como
        // «persona inventada» para decidir si la escena se sustituye. No lo es:
        //
        //   · `newSubjects`, el recuento y la oclusión responden QUIÉN está en
        //     el cuadro. Una persona que no estuvo ahí es una falsedad y no se
        //     publica.
        //   · `faceConsistency` responde cómo está DIBUJADA una cara. Es un
        //     defecto de calidad, del mismo orden que un logotipo redibujado —y
        //     medido igual de mal: los rostros de un grupo de trece personas
        //     llegan diminutos a la composición de 640 px, así que un 2/10 dice
        //     más de lo que el modelo pudo mirar que del clip.
        //
        // Mezclarlos hizo que TRES de cuatro escenas se sustituyeran por
        // «los rostros no se conservan». `invented` separa las dos preguntas.
        invented: newSubjects || countGrew || countShrank || occlusionBroken,
        // Los seis indicadores que se muestran en la ficha, uno por uno.
        sourceCount,          // personas detectadas en la fotografía original
        originalSeen,         // ...vistas por el control en la mitad izquierda
        clipSeen,             // personas detectadas en el clip final
        // El indicador sigue al VEREDICTO, no al número crudo. Un ±1 que no se
        // repite se trata como ruido de conteo, y pintarlo en rojo dejaba un
        // indicador rojo bajo una cabecera verde — que es lo que este archivo
        // ya se había propuesto evitar una vez.
        countStable: worstDelta != null ? !(countGrew || countShrank) : null,
        // ...pero el desvío no se esconde: se dice que hubo y que no contó.
        countNoise: worstDelta != null && worstDelta !== 0 && !(countGrew || countShrank),
        identitiesPreserved: newSubjects ? false : (countGrew || countShrank ? false : true),
        occlusionsPreserved: semantics.some(s => s.occlusionBroken != null) ? !occlusionBroken : null,
        facesConsistent: faceConsistency != null ? !facesBroken : null,
        noNewSubjects: withFlags.length ? !newSubjects : null,
        newSubjects,
        occlusionBroken,
        faceConsistency,
        countDelta: worstDelta,
        countReliable: originalSeen != null ? originalSeen <= RELIABLE_COUNT_MAX : null,
        framesChecked: semantics.length,
        reason,
        label: failed ? 'Requiere regeneración' : 'Fidelidad humana verificada'
    };
};

// Comprueba la fidelidad de una escena sobre TODOS sus fotogramas.
//
// `frames` trae, por fotograma: buffer, `at`, `position`, la `url` ya publicada
// del fotograma suelto y un `publish(buffer)` para subir la comparación.
//
// La nota de la escena es la PEOR de los fotogramas, no la media: una escena
// que empieza bien y termina con el logotipo roto no es medio buena.
export const checkSceneFidelity = async ({ originalBuffer, frames = [], analysis = null, legacyFrameUrl = null }) => {
    if (!originalBuffer || !frames.length) {
        return {
            state: 'unavailable',
            score: null,
            issues: [],
            frames: [],
            reason: legacyFrameUrl
                ? 'No se pudo descargar la fotografía original para compararla.'
                : 'No se pudieron extraer fotogramas del clip (FFmpeg no disponible y el proveedor no entregó portada).'
        };
    }

    const results = await Promise.all(frames.map(frame => checkFrame({ originalBuffer, frame, analysis })));

    // Cuánto cambia el clip ENTRE sus propios fotogramas. Es determinista y no
    // depende de ningún proveedor, así que sirve de guarda del caso extremo:
    // fotogramas idénticos significan clip congelado, diga lo que diga el
    // modelo. No sustituye su juicio —no distingue paneo de vida— pero un cero
    // aquí es incontestable.
    const life = await measureSceneLife(frames.map(f => f.buffer).filter(Boolean));

    const semantics = results.map(r => r.semantic).filter(Boolean);
    const structurals = results.map(r => r.structural).filter(s => s?.score != null);

    // Un problema en CUALQUIER fotograma es un problema de la escena.
    const flags = {
        deformation: semantics.some(s => s.deformation),
        identityDrift: semantics.some(s => s.identityDrift),
        brandAltered: semantics.some(s => s.brandAltered),
        textIllegible: semantics.some(s => s.textIllegible),
        colorShift: semantics.some(s => s.colorShift),
        anatomyErrors: semantics.some(s => s.anatomyErrors)
    };

    const semanticScore = semantics.length ? Math.min(...semantics.map(s => s.score ?? 10)) : null;
    // La vida se toma del fotograma que MÁS se movió, no del que menos: basta
    // con que la escena viva en algún momento para que no esté congelada. Es lo
    // contrario del criterio de fidelidad, donde un solo fotograma malo
    // condena la escena — y es a propósito: son dos preguntas opuestas.
    const motionSeen = semantics.map(s => s.internalMotion).filter(v => v != null);
    const semanticMotion = motionSeen.length ? Math.max(...motionSeen) : null;
    const structuralScore = structurals.length ? Math.min(...structurals.map(s => s.score)) : null;

    // ── Texto: la proporción de palabras NO descalifica sola (v4.790) ──
    //
    // Es el mismo defecto que el recuento de personas tenía hasta v4.787, en
    // otra puerta y con la misma forma. La proporción sale de comparar dos
    // TRANSCRIPCIONES que hace el modelo de visión sobre la composición lado a
    // lado, y esa composición se reduce a 640 px de alto: en un fotograma de
    // 1080×1920 el texto llega a un tercio de su tamaño y recomprimido a JPEG
    // —es exactamente la limitación que v4.715 midió para los logotipos («no
    // era un error de criterio del modelo, es que no se le estaba enseñando el
    // logotipo»)—. Cada palabra que el modelo no alcanza a leer en la mitad
    // derecha baja la proporción sin que el vídeo haya tocado nada.
    //
    // Y se tomaba el PEOR fotograma de tres, así que bastaba una transcripción
    // floja para marcar `textIllegible`, que descalifica sin apelación: la
    // escena gastaba sus dos intentos y terminaba sustituida por la fotografía
    // en movimiento. En una campaña de emergencia —donde casi toda foto lleva
    // un cartel, un chaleco o una placa— eso alcanzaba a casi todas.
    //
    // Se exige CORROBORACIÓN, igual que en el recuento:
    //
    //   · la marca EXPLÍCITA del modelo (`textIllegible`) sigue descalificando
    //     sola: ahí el modelo está diciendo que no se lee, no contando mal;
    //   · la proporción descalifica cuando cae por debajo del umbral en DOS
    //     fotogramas, o cuando el desplome es tan grande que no se explica por
    //     una transcripción incompleta;
    //   · y no decide cuando hay MUY POCAS palabras: sobre un vocabulario de
    //     tres, perder una es el 33 % y no significa nada. Mismo criterio que
    //     `RELIABLE_COUNT_MAX` con las multitudes.
    const textChecks = semantics.map(s => s.text).filter(Boolean);
    const textVerdict = judgeTextFidelity(textChecks);
    const { worst: worstText, words: textWords, failed: textRatioFalla, noise: textNoise } = textVerdict;
    if (textRatioFalla) flags.textIllegible = true;

    // ── Fidelidad humana (v4.705) ──
    //
    // Responde a una pregunta que hasta ahora nadie hacía: ¿hay en el clip
    // alguien que no esté en la fotografía? No es deformación ni deriva de
    // identidad —una persona inventada puede estar perfectamente dibujada y ser
    // perfectamente ella misma—, así que el modelo podía contestar «todo bien»
    // con honestidad mientras el clip tenía un sujeto de más. Es exactamente lo
    // que hacía que una escena con una cara fantasma pasara con 8/10.
    const people = buildPeopleReport(semantics, analysis);

    // Control de marca de cerca. Sólo actúa si el análisis declaró dónde están
    // los logotipos: sin regiones no se afirma haber mirado ninguno.
    const brand = await checkBrandFidelity({
        originalBuffer, frames,
        regions: Array.isArray(analysis?.brandRegions) ? analysis.brandRegions : []
    });
    // Un logotipo alterado ES `brandAltered`. Se une a lo que dijo el control
    // general en vez de sustituirlo: el general ve el logotipo grande de un
    // pendón, el de marca ve el estampado pequeño de una camiseta.
    if (brand?.state === 'failed') flags.brandAltered = true;

    const issues = [...new Set(semantics.flatMap(s => s.issues))].slice(0, 6);
    if (people?.verdict === 'failed' && people.reason) issues.unshift(people.reason);

    // Sin modelo, la estructural decide sola: 0.55 de similitud combinada es el
    // punto por debajo del cual el encuadre ya cambió de forma visible.
    const score = semanticScore != null
        ? semanticScore
        : (structuralScore != null ? Number((structuralScore * 10).toFixed(1)) : null);

    // Una persona inventada descalifica igual que un logotipo redibujado, y por
    // el mismo motivo: no hay criterio estético que valga. Una pieza
    // institucional no puede mostrar a alguien que no estuvo ahí.
    const disqualifying = flags.brandAltered || flags.textIllegible || people?.verdict === 'failed';
    // El piso estructural depende de si hubo modelo de visión: con él sólo
    // guarda contra el reencuadre grosero; sin él decide solo.
    const structuralFloor = semanticScore != null
        ? REEL_THRESHOLDS.minStructuralScoreWithVision
        : REEL_THRESHOLDS.minStructuralScore;
    const passes = !disqualifying
        && score != null
        && score >= REEL_THRESHOLDS.minFidelityScore
        && (structuralScore == null || structuralScore >= structuralFloor);

    // `unavailable` sólo si NADA se pudo medir. Con la estructural sola ya hay
    // veredicto — se dice que fue sin el modelo, pero no se finge no haber
    // mirado.
    if (score == null) {
        return {
            state: 'unavailable', score: null, issues: [],
            frames: results.map(({ at, position, frameUrl, structural }) => ({ at, position, frameUrl, structural })),
            reason: 'No se pudo comparar el clip con la fotografía original.'
        };
    }

    return {
        state: passes ? 'ok' : 'failed',
        score: Number(score.toFixed(1)),
        semanticScore,
        structuralScore,
        method: semantics.length ? 'estructural + visión' : 'sólo estructural',
        framesChecked: results.length,
        // Nivel de vida: 0-100. Lo emite el modelo de visión cuando está —es
        // quien puede distinguir «se movió la gente» de «se movió el
        // encuadre»—; sin él queda `null` y la ficha lo dice, en vez de
        // presentar la medida determinista como si respondiera esa pregunta.
        // Fotogramas idénticos mandan sobre cualquier opinión: si el clip no
        // cambia un solo píxel entre el primero y el último, está congelado.
        // Un clip cuyo cambio se explica desplazando el encuadre vale CERO de
        // vida, diga lo que diga el modelo (v4.787). Es la corrección del
        // defecto reportado —«solo les pone movimiento o desplazamiento a las
        // imágenes»—: mover la cámara sobre una fotografía quieta no es animar
        // la escena, y hasta ahora sólo lo veía el modelo de visión, cuando
        // contestaba. Las dos señales deterministas mandan por el mismo motivo:
        // no son una opinión.
        lifeScore: (life.score === 0 || life.cameraOnly) ? 0
            : (semanticMotion != null ? Math.round(semanticMotion * 10) : null),
        lifeSource: (life.score === 0 || life.cameraOnly) ? 'frames'
            : (semanticMotion != null ? 'vision' : null),
        lifeChange: life.score,
        // Qué parte del cambio explica un simple desplazamiento del encuadre.
        // Se guarda para que la ficha pueda decir POR QUÉ una escena con mucho
        // movimiento aparente puntúa cero de vida.
        cameraOnly: life.cameraOnly === true,
        cameraExplained: life.explainedByCamera ?? null,
        ...flags,
        people,
        brand,
        text: worstText != null
            ? { keptRatio: worstText, words: textWords, noise: textNoise, samples: textChecks.slice(0, 2) }
            : null,
        issues,
        frames: results.map(({ at, position, frameUrl, structural, semantic }) => ({
            at, position, frameUrl,
            structural,
            score: semantic?.score ?? null,
            comparisonUrl: semantic?.comparisonUrl || null
        })),
        checkedAt: new Date().toISOString(),
        reason: passes
            ? null
            : (people?.verdict === 'failed'
                ? people.reason
                : (brand?.state === 'failed'
                    ? brand.reason
                    // Se NOMBRA la puerta que se cerró, con su número. «Alteró
                    // la marca o el texto» obliga a adivinar cuál de las dos, y
                    // es lo que hizo falta para diagnosticar el reporte de las
                    // escenas sustituidas: el motivo llegaba a la ficha sin
                    // decir qué se había medido.
                    : flags.textIllegible
                    ? `El texto de la fotografía no se conserva en el clip: quedó el ${Math.round((worstText ?? 0) * 100)} % de las palabras sobre ${textWords} comparadas.`
                    : disqualifying
                    ? 'El clip alteró la marca o el texto de la fotografía.'
                    : `La fidelidad quedó en ${Number(score.toFixed(1))}/10, por debajo del mínimo de ${REEL_THRESHOLDS.minFidelityScore}.`))
    };
};

export const summarizeFidelity = (scenes = []) => {
    const checked = scenes.filter(s => s.fidelity?.state === 'ok' || s.fidelity?.state === 'failed');
    const failed = scenes.filter(s => s.fidelity?.state === 'failed');
    const unavailable = scenes.filter(s => !s.fidelity || s.fidelity.state === 'unavailable');
    const framesChecked = scenes.reduce((n, s) => n + (s.fidelity?.framesChecked || 0), 0);
    const withoutModel = checked.filter(s => s.fidelity?.method === 'sólo estructural');

    return {
        checked: checked.length,
        failed: failed.length,
        unavailable: unavailable.length,
        total: scenes.length,
        framesChecked,
        averageScore: checked.length
            ? Number((checked.reduce((n, s) => n + (s.fidelity.score || 0), 0) / checked.length).toFixed(1))
            : null,
        // El texto dice qué se comprobó y CÓMO. Que la comprobación corriera sin
        // el modelo de visión es información del usuario, no un detalle interno:
        // la señal estructural detecta un reencuadre pero no que un logotipo se
        // haya redibujado conservando su sitio.
        label: checked.length === 0
            ? (unavailable.length
                ? 'Fidelidad no comprobada: no se pudieron extraer fotogramas de los clips.'
                : 'Fidelidad pendiente de comprobar.')
            : failed.length
                ? `${failed.length} de ${checked.length} escenas no conservan la fotografía original.`
                : `Fidelidad verificada en ${checked.length} de ${scenes.length} escenas (${framesChecked} fotogramas)` +
                  (withoutModel.length ? `; ${withoutModel.length} sólo con comparación estructural.` : '.')
    };
};
