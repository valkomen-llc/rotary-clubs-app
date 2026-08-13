// ════════════════════════════════════════════════════════════════════
// Creador de Reels IA — los rótulos que se ven en pantalla
// v4.783.0
//
// El texto que se DIBUJA sobre cada escena. Es una tercera pieza de texto, y
// las tres son distintas a propósito:
//
//   · el COPY se lee debajo del video, en la publicación (`reelCopy.js`);
//   · el GUION se escucha, lo dice la voz (`reelNarration.js`);
//   · el RÓTULO se ve encima de la imagen, y es esto.
//
// Confundirlos produce las tres averías clásicas: hashtags narrados en voz
// alta, un rótulo de 300 caracteres que tapa la fotografía, o un guion con
// «link en la bio». Por eso hay tres generadores y no uno con un interruptor —
// la misma razón que ya está escrita en `reelNarration.js`.
//
// QUÉ HACE ESPECIAL A UN RÓTULO: se lee en dos segundos, en un teléfono, sin
// sonido y muchas veces en movimiento. No admite subordinadas ni datos que haya
// que retener. El límite de caracteres no es estético: por encima de ~70 el
// texto baja de tamaño hasta no leerse, y `renderTextOverlay` lo reparte en
// cinco líneas que tapan media fotografía.
//
// Este módulo ORQUESTA (llama al modelo); el criterio de qué se acepta vive en
// `emergencySpec.js`, que es puro y se puede probar sin red.
// ════════════════════════════════════════════════════════════════════

import { generateCopy } from '../services/copywritingService.js';
import { INSTITUTIONAL_VOICE } from './institutionalVoice.js';
import {
    EMERGENCY_FACT_CLAUSE, buildEmergencyBrief,
    validateEmergencyCopy, buildRetryInstruction
} from './emergencySpec.js';

// Cuántos caracteres entran en un rótulo legible. Medido contra
// `renderTextOverlay` a 1080 px de ancho: con 70 caracteres salen tres líneas
// al tamaño base; a partir de ahí `autoFit` empieza a encoger la letra.
export const MAX_SCENE_TEXT_CHARS = 70;

// Tope duro del recorte de emergencia. Va por encima del objetivo porque
// recortar es el último recurso: se prefiere un rótulo de cuatro líneas a uno
// cortado a mitad de frase.
const HARD_LIMIT = 96;

const SYSTEM = `${INSTITUTIONAL_VOICE}

Ahora escribís los RÓTULOS que se ven SOBRE un video vertical corto. No es el texto de la publicación ni el guion de la voz: es lo que se dibuja encima de la imagen.

Reglas del rótulo:
A. Se lee en dos segundos, en un teléfono, muchas veces sin sonido. Una idea por rótulo.
B. Máximo ${MAX_SCENE_TEXT_CHARS} caracteres por rótulo, contando espacios. Es un límite físico: más largo no entra en pantalla.
C. Una frase, o dos muy cortas. Nada de subordinadas.
D. Sin hashtags, sin emojis, sin "link en la bio", sin comillas decorativas.
E. Lenguaje humano y sobrio. No grites: nada de mayúsculas sostenidas ni signos de exclamación repetidos.
F. Los rótulos se leen SEGUIDOS, como una secuencia: cada uno continúa al anterior y no repite lo que ya dijo.`;

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

/**
 * Recorta sin partir palabras.
 *
 * Un rótulo cortado a mitad de palabra se lee como un error del sistema, que es
 * la misma regla que ya gobierna los copies en `reelCopy.js`.
 */
const trimWords = (text, max) => {
    const t = String(text).trim();
    if (t.length <= max) return t;
    const cut = t.slice(0, max);
    const sp = cut.lastIndexOf(' ');
    return (sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[,;:]$/, '').trimEnd();
};

/**
 * Los rótulos de todas las escenas, en una sola llamada.
 *
 * Una llamada y no una por escena: el modelo tiene que ver la secuencia entera
 * para que el segundo rótulo continúe al primero en vez de repetirlo. Pedirlos
 * de a uno daría tres frases que dicen lo mismo, y costaría el triple.
 *
 * `narrativeRoles` es lo que le dice a cada rótulo qué le toca contar. Sin
 * roles —preset sin estructura— se escriben libres a partir de lo que se ve.
 *
 * DEGRADA, NO BLOQUEA: si el proveedor no responde o devuelve algo inservible,
 * se devuelven rótulos vacíos y el Reel se monta sin texto. Un video sin
 * rótulos es una pieza válida; ninguna pieza no lo es. Es el mismo criterio que
 * `fallbackDirection`.
 */
export const generateSceneTexts = async ({
    scenes,
    narrativeRoles = null,
    emergencyContext = null,
    context,
    clubName = null,
    clubCity = null,
    provider = null
}) => {
    const count = scenes.length;

    const sceneLines = scenes.map((s, i) => {
        const a = s.analysis || {};
        const role = narrativeRoles?.[i];
        const roleTag = role && role.id !== 'libre' ? ` [${role.label}: ${role.brief}]` : '';
        return `  ${i + 1}. ${a.summary || 'escena sin descripción'}${roleTag}`;
    }).join('\n');

    const system = emergencyContext ? `${SYSTEM}\n\n${EMERGENCY_FACT_CLAUSE}` : SYSTEM;
    const brief = emergencyContext ? buildEmergencyBrief(emergencyContext) : null;

    const basePrompt = [
        `Entidad: "${clubName || '(sin nombre)'}"${clubCity ? ` — ${clubCity}` : ''}.`,
        context ? `Tipo de publicación: ${context.typeLabel} — tono ${context.tone}.` : '',
        brief ? `\nDATOS DE LA EMERGENCIA (lo único que podés afirmar):\n${brief}\n` : '',
        `El video tiene ${count} escenas:`,
        sceneLines,
        '',
        `Escribí ${count} rótulos, uno por escena, en el mismo orden.`,
        `Cada uno: máximo ${MAX_SCENE_TEXT_CHARS} caracteres.`,
        '',
        'Devolvé este JSON exacto, sin texto alrededor y sin bloques de código:',
        '{',
        `  "texts": [${Array.from({ length: count }, (_, i) => `"rótulo de la escena ${i + 1}"`).join(', ')}]`,
        '}'
    ].filter(Boolean).join('\n');

    const MAX_RETRIES = emergencyContext ? 2 : 0;
    let retryInstruction = null;
    let last = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        let raw;
        try {
            const result = await generateCopy({
                ...(provider ? { provider } : {}),
                system,
                userText: retryInstruction ? `${basePrompt}\n\n${retryInstruction}` : basePrompt,
                temperature: 0.6,
                maxTokens: 500,
                jsonMode: true
            });
            raw = parseJsonObject(result);
            last = { model: result?.model || null, rawResponse: result?.raw || null };
        } catch (e) {
            console.error('[REEL] rótulos: el proveedor falló:', e.message);
            return { texts: Array.from({ length: count }, () => null), failed: true, reason: e.message };
        }

        const list = Array.isArray(raw?.texts) ? raw.texts : null;
        if (!list) {
            console.warn('[REEL] rótulos: el modelo no devolvió una lista utilizable.');
            return { texts: Array.from({ length: count }, () => null), failed: true, reason: 'respuesta sin lista de rótulos' };
        }

        // Se normaliza a la cantidad de escenas: de más se descartan, de menos
        // quedan en null y esa escena va sin rótulo. Rellenar con el texto de
        // otra escena sería repetir un mensaje donde falta uno.
        const texts = Array.from({ length: count }, (_, i) => {
            const t = typeof list[i] === 'string' ? list[i].trim() : '';
            return t ? trimWords(t, HARD_LIMIT) : null;
        });

        if (!emergencyContext) return { ...last, texts, failed: false };

        // Cada rótulo pasa por el mismo control que el guion: es texto que se
        // publica a nombre de la institución, y da igual que se vea en vez de
        // oírse.
        const issues = [];
        texts.forEach((t, i) => {
            if (!t) return;
            const check = validateEmergencyCopy(t, emergencyContext, { field: `rótulo ${i + 1}` });
            if (!check.ok) issues.push(...check.issues.map(x => `Rótulo ${i + 1}: ${x}`));
        });

        if (!issues.length) return { ...last, texts, failed: false, factIssues: [] };

        retryInstruction = buildRetryInstruction(issues);
        console.warn(`[REEL] rótulos con ${issues.length} incumplimiento(s) (intento ${attempt + 1}): ${issues[0]}`);

        if (attempt === MAX_RETRIES) {
            // Agotados los reintentos NO se publican rótulos que inventan datos:
            // acá sí se descartan, al revés que el guion. La diferencia es que un
            // Reel sin rótulos sigue siendo una pieza correcta —el guion, en
            // cambio, es la voz entera—, así que el intercambio se puede pagar.
            console.warn('[REEL] rótulos descartados: no se pudo cumplir la regla de datos.');
            return {
                ...last,
                texts: Array.from({ length: count }, () => null),
                failed: true,
                factIssues: issues,
                reason: 'Los rótulos generados incluían datos no suministrados y se descartaron.'
            };
        }
    }

    return { ...last, texts: Array.from({ length: count }, () => null), failed: true };
};

/**
 * Las ventanas de tiempo de cada rótulo sobre la línea de tiempo montada.
 *
 * PURA y separada del render a propósito: es aritmética sobre las duraciones y
 * los solapamientos, y equivocarse acá pone el rótulo de una escena encima de
 * otra. Se puede probar sin ffmpeg ni imágenes.
 *
 * `margin` es lo que se aparta de los bordes de la escena para que el rótulo no
 * quede a caballo del fundido: durante una disolvencia se ven las dos escenas a
 * la vez, y un texto encima de esa mezcla se lee como un fallo de montaje.
 */
export const sceneTextWindows = ({ scenes, overlaps = [], margin = 0.4 }) => {
    const windows = [];
    let t = 0;
    scenes.forEach((s, i) => {
        const dur = Number(s.durationSec) || 0;
        const start = t + margin;
        const end = t + dur - margin;
        // Una escena demasiado corta para albergar el rótulo con sus márgenes
        // devuelve `null`: mejor sin rótulo que uno que parpadea.
        windows.push(end - start >= 0.8
            ? { startSec: Number(start.toFixed(2)), endSec: Number(end.toFixed(2)) }
            : null);
        const overlap = i < scenes.length - 1 ? (Number(overlaps[i]) || 0) : 0;
        t += dur - overlap;
    });
    return windows;
};
