// ════════════════════════════════════════════════════════════════════
// Creador de Reels IA — preservación visual y validación de calidad
// v4.663.0
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
//   Sobre la FIDELIDAD del clip a su fotografía, con un modelo de visión:
//     · deformación del motivo, deriva de identidad, alteración de logotipos,
//       texto ilegible y cambio de colores corporativos.
//     Esto SÓLO puede correr cuando el proveedor entrega un fotograma del clip
//     (`posterUrl`). No todos lo hacen. Cuando no hay fotograma, la
//     comprobación devuelve `state: 'unavailable'` y se dice tal cual en la
//     ficha — no se da por aprobada.
//
//   NO se mide, y no se afirma que sí: análisis fotograma a fotograma del video
//   ni OCR sobre el video renderizado. Eso exige decodificarlo, y la API corre
//   en Vercel sin ffmpeg. Es la misma limitación que ya documenta el Generador
//   de Outros, y por eso la legibilidad se controla en la ENTRADA, que es
//   además donde se puede corregir.
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
    minFidelityScore: 7
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

export const validateReelFile = (probe, { format, qualityTier, expectedDurationSec, expectAudio = true }) => {
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
        failures.push(`Tasa de bits baja (${probe.bitrateKbps} kbps): la compresión sería visible al publicar. Mínimo ${REEL_THRESHOLDS.minBitrateKbps} kbps.`);
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
// Compara un fotograma del clip contra la foto original con un modelo de
// visión. Es la comprobación que pide el módulo —que no haya deformaciones,
// deriva de identidad ni logotipos alterados— y la única forma de hacerla sin
// decodificar el video.
//
// SÓLO corre si hay fotograma. Cuando el proveedor no lo entrega, devuelve
// `unavailable` con el motivo, y así aparece en la ficha. Dar por buena una
// escena que no se pudo mirar sería peor que decir que no se miró.
const FIDELITY_SYSTEM = `Eres un control de calidad de vídeo publicitario. Recibes UN fotograma extraído de un clip generado por IA a partir de una fotografía. Tu tarea es decir si el clip conserva la fotografía o la reinterpretó.

Respondes SIEMPRE con un único objeto JSON válido, sin texto alrededor y sin bloques de código:

{
  "score": 0..10,
  "deformation": boolean,
  "identityDrift": boolean,
  "brandAltered": boolean,
  "textIllegible": boolean,
  "colorShift": boolean,
  "anatomyErrors": boolean,
  "issues": ["descripción breve en español de cada problema real"]
}

- "score" 10 = indistinguible de la fotografía; 7 = diferencias mínimas aceptables; por debajo de 7 = hay que regenerar.
- "brandAltered" es true si un logotipo, una marca o un texto institucional cambió de forma, tipografía o color.
- "anatomyErrors" cubre manos, dedos, ojos y extremidades mal resueltos.
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

export const checkSceneFidelity = async ({ sourceImageUrl, frameUrl, analysis = null }) => {
    if (!frameUrl) {
        return {
            state: 'unavailable',
            score: null,
            issues: [],
            reason: 'El proveedor no entregó un fotograma del clip, así que la fidelidad no se pudo comprobar automáticamente.'
        };
    }

    // Qué mirar con más cuidado, según lo que el director detectó en la foto.
    const focus = [];
    if (analysis?.hasBrand) focus.push('Hay logotipos o marca institucional: revisá su forma, su tipografía y sus colores con especial cuidado.');
    if (analysis?.hasText) focus.push('Hay texto legible: revisá que siga leyéndose y diga lo mismo.');
    if (analysis?.hasPeople) focus.push('Hay personas: revisá rostros, manos y proporciones.');

    try {
        const result = await generateCopy({
            system: FIDELITY_SYSTEM,
            userText: [
                `Fotografía original: ${sourceImageUrl}`,
                analysis?.summary ? `La fotografía muestra: ${analysis.summary}` : '',
                focus.join(' '),
                'Evaluá el fotograma adjunto contra esa descripción y devolvé únicamente el JSON.'
            ].filter(Boolean).join('\n'),
            imageUrl: frameUrl,
            temperature: 0.1,
            maxTokens: 500,
            jsonMode: true
        });

        const raw = parseJsonObject(result);
        if (!raw) {
            return { state: 'unavailable', score: null, issues: [], reason: 'El control de fidelidad no devolvió una respuesta legible.' };
        }

        const score = Number(raw.score);
        const issues = Array.isArray(raw.issues)
            ? raw.issues.filter(i => typeof i === 'string').slice(0, 6).map(i => i.slice(0, 200))
            : [];

        const flags = {
            deformation: raw.deformation === true,
            identityDrift: raw.identityDrift === true,
            brandAltered: raw.brandAltered === true,
            textIllegible: raw.textIllegible === true,
            colorShift: raw.colorShift === true,
            anatomyErrors: raw.anatomyErrors === true
        };

        const scored = Number.isFinite(score) ? Math.min(10, Math.max(0, score)) : null;

        // Una alteración de marca o un texto ilegible descalifican por sí solos,
        // por buena que sea la nota: es exactamente lo que el módulo promete
        // conservar. El resto se decide por la nota.
        const disqualifying = flags.brandAltered || flags.textIllegible;
        const passes = !disqualifying && scored != null && scored >= REEL_THRESHOLDS.minFidelityScore;

        return {
            state: passes ? 'ok' : 'failed',
            score: scored,
            ...flags,
            issues,
            frameUrl,
            checkedAt: new Date().toISOString(),
            reason: passes
                ? null
                : (disqualifying
                    ? 'El clip alteró la marca o el texto de la fotografía.'
                    : `La fidelidad quedó en ${scored}/10, por debajo del mínimo de ${REEL_THRESHOLDS.minFidelityScore}.`)
        };
    } catch (e) {
        // Un fallo del proveedor de visión no puede tumbar el Reel: se informa
        // y la escena sigue su curso con la fidelidad sin comprobar.
        console.error('[REEL] control de fidelidad falló:', e.message);
        return { state: 'unavailable', score: null, issues: [], reason: `No se pudo comprobar la fidelidad: ${e.message}` };
    }
};

// Resumen legible del estado de fidelidad de todas las escenas, para la ficha.
export const summarizeFidelity = (scenes = []) => {
    const checked = scenes.filter(s => s.fidelity?.state === 'ok' || s.fidelity?.state === 'failed');
    const failed = scenes.filter(s => s.fidelity?.state === 'failed');
    const unavailable = scenes.filter(s => !s.fidelity || s.fidelity.state === 'unavailable');
    return {
        checked: checked.length,
        failed: failed.length,
        unavailable: unavailable.length,
        total: scenes.length,
        averageScore: checked.length
            ? Number((checked.reduce((s, x) => s + (x.fidelity.score || 0), 0) / checked.length).toFixed(1))
            : null,
        // El texto que se muestra. Dice qué se comprobó y qué no, sin redondear.
        label: checked.length === 0
            ? 'Fidelidad no comprobada: el proveedor no entregó fotogramas de los clips.'
            : failed.length
                ? `${failed.length} de ${checked.length} escenas comprobadas no conservan la fotografía.`
                : `${checked.length} de ${scenes.length} escenas comprobadas conservan la fotografía${unavailable.length ? `; ${unavailable.length} sin comprobar` : ''}.`
    };
};
