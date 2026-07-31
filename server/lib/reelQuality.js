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

const FIDELITY_SYSTEM = `Eres un control de calidad de vídeo publicitario. Recibes UNA imagen dividida en dos mitades: a la IZQUIERDA la fotografía ORIGINAL, a la DERECHA un FOTOGRAMA del vídeo que una IA generó a partir de ella. Dices si el vídeo conservó la fotografía o la reinterpretó.

Respondes SIEMPRE con un único objeto JSON válido, sin texto alrededor y sin bloques de código:

{
  "score": 0..10,
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
    return { ratio: Number((kept / wa.size).toFixed(2)), original: a.slice(0, 200), rendered: b.slice(0, 200) };
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
    const structuralScore = structurals.length ? Math.min(...structurals.map(s => s.score)) : null;

    // Texto: si el original tenía texto y en el vídeo se conserva menos de la
    // mitad de las palabras, se considera ilegible aunque el modelo no lo haya
    // marcado. Es una comprobación aparte y comparable, no una opinión.
    const textChecks = semantics.map(s => s.text).filter(Boolean);
    const worstText = textChecks.length ? Math.min(...textChecks.map(t => t.ratio)) : null;
    if (worstText != null && worstText < 0.5) flags.textIllegible = true;

    const issues = [...new Set(semantics.flatMap(s => s.issues))].slice(0, 6);

    // Sin modelo, la estructural decide sola: 0.55 de similitud combinada es el
    // punto por debajo del cual el encuadre ya cambió de forma visible.
    const score = semanticScore != null
        ? semanticScore
        : (structuralScore != null ? Number((structuralScore * 10).toFixed(1)) : null);

    const disqualifying = flags.brandAltered || flags.textIllegible;
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
        ...flags,
        text: worstText != null ? { keptRatio: worstText, samples: textChecks.slice(0, 2) } : null,
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
            : (disqualifying
                ? 'El clip alteró la marca o el texto de la fotografía.'
                : `La fidelidad quedó en ${Number(score.toFixed(1))}/10, por debajo del mínimo de ${REEL_THRESHOLDS.minFidelityScore}.`)
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
