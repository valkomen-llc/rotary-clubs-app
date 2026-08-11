// ════════════════════════════════════════════════════════════════════
// Plantillas IA — la preservación de la fotografía, MEDIDA
// v4.757.0
//
// El módulo PIDE que la composición conserve a las personas de la fotografía:
// que no invente a nadie, que no borre a nadie, que no cambie rostros ni ropa.
// Pedirlo por prompt es necesario y no es suficiente — un modelo generativo
// puede desobedecer y la pieza sale igual, con una persona de más o una cara
// que no es la de nadie, en una publicación institucional.
//
// Acá se COMPRUEBA. Y la regla que lo gobierna es la misma que en el Creador de
// Reels: **no se promete preservación, se mide**, y cuando la medición no da,
// no se retoca la imagen — se descarta la composición y la pieza sale con la
// fotografía en su recuadro, intacta.
//
// ── POR QUÉ NO SE «ARREGLA» LA IMAGEN ───────────────────────────────
//
// Pegar la fotografía original encima de la composición para corregirla es
// exactamente el composite que el equipo rechazó dos veces con las palabras
// «se ve overlay / montaje» (v4.323-v4.324). Este control mide y decide; no
// retoca el archivo. Es la misma postura que `checkBrandFidelity` en Reels.
//
// ── DOS SEÑALES, Y CUÁL MANDA ───────────────────────────────────────
//
//   · SEMÁNTICA (modelo de visión sobre una composición lado a lado). Es la
//     única que puede distinguir «hay una persona de más» de «la misma persona
//     movida»: un recuento y una lectura de rostros. Manda cuando existe.
//   · ESTRUCTURAL (huella perceptual + color, determinista, con sharp). No
//     distingue «la escena se recompuso» de «la escena cambió» —y acá la
//     recomposición es DESEADA: el lienzo alrededor es contenido nuevo—, así
//     que por sí sola sólo sirve para el caso extremo: una imagen que no tiene
//     nada que ver con la que se mandó.
//
// Las dos se reutilizan de `reelQuality.js` en vez de reimplementarse: copiar
// una medición es la forma segura de que las dos mitades se separen en
// silencio. Lo que vive acá es el CRITERIO de este módulo — qué se pregunta y
// qué se decide con la respuesta.
// ════════════════════════════════════════════════════════════════════

import { buildComparisonImage, structuralCompare } from './reelQuality.js';
import { generateCopy } from '../services/copywritingService.js';

// ─── Umbrales ──────────────────────────────────────────────────────────
//
// El estructural es DELIBERADAMENTE bajo. En Reels compara un fotograma contra
// la foto que se animó, y ahí un 0,5 tiene sentido; acá el modelo construye un
// lienzo NUEVO alrededor de la fotografía, así que gran parte de los píxeles
// son contenido que debe ser distinto. Un piso alto reprobaría toda composición
// buena — el error que ya costó dos rondas de créditos en el Creador de Reels
// (v4.675). Sólo atrapa el caso extremo: una imagen sin relación con la que se
// mandó.
export const PRESERVATION = {
    minStructural: 0.18,
    // Cuántas personas de MÁS se toleran. CERO: una pieza institucional no puede
    // mostrar a alguien que no estuvo ahí. No es simétrico con las que faltan —
    // ver `edgeCrop`.
    maxPersonDelta: 0,
    // Por encima de esto, contar deja de ser fiable en cualquier modelo de
    // visión y el recuento no decide solo — misma regla que `RELIABLE_COUNT_MAX`
    // en Reels. En multitud sólo vale la señal explícita.
    reliableCountMax: 8,
    minFaceConsistency: 6,
};

// ─── RECORTAR NO ES BORRAR ─────────────────────────────────────────────
//
// Es la corrección de fondo de v4.762, y el motivo por el que este control
// vetaba TODA composición de una fotografía de grupo.
//
// Componer una pieza es ENCUADRAR: el plan mete la fotografía en una forma
// redondeada, en una columna o en un óvalo, y eso recorta los bordes. Con una
// foto de treinta personas, alguien de los extremos queda fuera SIEMPRE. Hasta
// v4.761 cualquier persona que faltara reprobaba la composición, así que el
// caso más común del cliente —la foto de grupo del club— no podía sobrevivir
// nunca. Se reportó como «se usó tu fotografía tal como la subiste»: el
// respaldo saltando en todas las generaciones.
//
// Lo que sí descalifica sin apelación son dos cosas distintas de aquélla:
//
//   · una persona que NO ESTABA (el modelo la inventó);
//   · una persona del INTERIOR de la foto que desapareció (la borró o la
//     reemplazó por fondo).
//
// La primera es la regla de siempre. La segunda es la que hay que separar del
// recorte, y por eso se le pregunta al modelo DÓNDE estaba quien falta: en el
// borde es encuadre, en el medio es borrado.
//
//   · `allow`  — se permite perder a quien estaba en el BORDE. Es lo que hace
//                que componer sirva, y se AVISA: la pieza puede no mostrar a
//                todos, y quien la descarga tiene que saberlo.
//   · `strict` — no se permite perder a nadie. Para una plantilla donde
//                aparecer es el punto de la pieza.
export const EDGE_CROP = { ALLOW: 'allow', STRICT: 'strict' };

// ─── Qué se le pregunta al modelo ──────────────────────────────────────
//
// Va sobre una composición LADO A LADO —izquierda la fotografía original,
// derecha la pieza compuesta— porque `generateCopy` acepta UNA imagen, y pegar
// las dos es lo que permite COMPARAR en vez de describir por separado. Los dos
// recuentos salen de la misma pasada del mismo modelo sobre la misma imagen,
// así que su sesgo de conteo se cancela al restar; contra un censo tomado en
// otra llamada se compararían dos criterios distintos.
export const PEOPLE_SYSTEM = `Sos un control de calidad de piezas gráficas institucionales. Mirás UNA imagen que contiene dos mitades separadas por una franja oscura: a la IZQUIERDA la fotografía original de un club, a la DERECHA una pieza gráfica generada que debía integrar esa misma fotografía dentro de un diseño.

Tu trabajo es comparar SÓLO a las personas. El fondo, el encuadre, los colores, las curvas decorativas y el espacio alrededor son distintos A PROPÓSITO: eso no es un defecto y no se reporta.

La pieza de la derecha ENCUADRA la fotografía dentro de un diseño, así que es normal que sus bordes queden recortados. Eso no es un defecto: lo que hay que distinguir es a quién se llevó el recorte y a quién se borró.

Devolvé EXACTAMENTE este JSON, sin texto alrededor:
{
  "leftPeople": número de personas visibles en la mitad izquierda,
  "rightPeople": número de personas visibles en la mitad derecha,
  "newSubjects": true si en la derecha hay alguna persona, rostro, extremidad o silueta que NO esté en la izquierda,
  "missingSubjects": true si alguien de la izquierda no aparece en la derecha,
  "missingAtEdge": true si TODOS los que faltan estaban pegados a un borde de la fotografía de la izquierda (arriba, abajo, izquierda o derecha), es decir, se los llevó el encuadre,
  "missingFromCentre": true si alguno de los que faltan estaba en el INTERIOR de la fotografía, rodeado de otras personas: ése no lo pudo recortar el encuadre,
  "faceConsistency": 0 a 10, cuánto siguen siendo LAS MISMAS personas (rostros, edad, peinado, gafas, ropa),
  "notes": "una frase en español sobre lo que cambió en las personas, o vacío"
}

Si no falta nadie, "missingSubjects", "missingAtEdge" y "missingFromCentre" van los tres en false.
Una persona parcialmente recortada por el borde sigue contando como presente si se la reconoce. Un cambio de luz o de color en la piel no baja "faceConsistency" si la persona es la misma.`;

/** Lo que se manda con la imagen. Corto: el sistema ya dice todo. */
export const PEOPLE_USER = 'Compará las personas de las dos mitades y devolvé el JSON.';

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

const num = (v) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) && n >= 0 ? n : null;
};

/** Normaliza lo que devuelve el modelo. PURO y probable sin red. */
export const readPeopleVerdict = (raw) => {
    const o = parseJsonObject(raw);
    if (!o || typeof o !== 'object') return null;
    return {
        leftPeople: num(o.leftPeople),
        rightPeople: num(o.rightPeople),
        newSubjects: o.newSubjects === true,
        missingSubjects: o.missingSubjects === true,
        // Dónde estaba quien falta. Sin marca explícita se asume lo PEOR —que
        // no fue el borde—: un modelo que no contesta el campo no puede
        // convertirse en permiso para dar por bueno un borrado.
        missingAtEdge: o.missingAtEdge === true,
        missingFromCentre: o.missingFromCentre === true,
        faceConsistency: num(o.faceConsistency),
        notes: String(o.notes || '').slice(0, 240),
    };
};

// ─── La decisión ───────────────────────────────────────────────────────
//
// PURA: recibe las dos señales y dice si la composición se usa. Separada de la
// orquestación por el mismo motivo que `seoRules.js` vive aparte de
// `seoAudit.js`: es lo que hay que poder probar sin red ni credenciales.
//
// El motivo se dice con su CONSECUENCIA, no sólo con su nombre: «se detectó una
// persona de más» no le explica a nadie que por eso su pieza salió sin el
// diseño compuesto.
export const decidePreservation = ({ semantic = null, structural = null, edgeCrop = EDGE_CROP.ALLOW } = {}) => {
    const permiteRecorte = edgeCrop !== EDGE_CROP.STRICT;
    // Sin ninguna señal no se afirma nada. `unavailable` no es un tipo de
    // «bien»: significa que no se pudo mirar, y se dice distinto.
    if (!semantic && !structural?.ok) {
        return {
            state: 'unavailable',
            use: true,
            reason: 'No se pudo comprobar la fotografía.',
            consequence: 'La pieza se generó igual; conviene mirarla antes de publicarla.',
        };
    }

    if (structural?.ok && structural.score != null && structural.score < PRESERVATION.minStructural && !semantic) {
        return {
            state: 'failed',
            use: false,
            reason: 'La imagen compuesta no se parece a la fotografía que subiste.',
            consequence: 'Se usó tu fotografía tal como la subiste, dentro del diseño.',
        };
    }

    if (semantic) {
        if (semantic.newSubjects) {
            return {
                state: 'failed',
                use: false,
                reason: 'La composición agregó una persona que no está en tu fotografía.',
                consequence: 'Se usó tu fotografía tal como la subiste, dentro del diseño.',
            };
        }
        // Alguien del INTERIOR que desapareció. El encuadre no puede haberlo
        // hecho —estaba rodeado de gente—, así que el modelo lo borró o lo
        // reemplazó por fondo. Descalifica siempre, como una persona inventada.
        if (semantic.missingFromCentre) {
            return {
                state: 'failed',
                use: false,
                reason: 'La composición borró a alguien del centro de tu fotografía.',
                consequence: 'Se usó tu fotografía tal como la subiste, dentro del diseño.',
            };
        }
        // Falta gente y NO consta que fuera por el borde. Ante la duda se
        // reprueba: dar por bueno un borrado porque el modelo no contestó dónde
        // estaba sería exactamente al revés de lo que este control existe para
        // hacer.
        if (semantic.missingSubjects && (!permiteRecorte || !semantic.missingAtEdge)) {
            return {
                state: 'failed',
                use: false,
                reason: !permiteRecorte
                    ? 'La composición dejó fuera a alguien de tu fotografía.'
                    : 'La composición dejó fuera a alguien y no se pudo confirmar que fuera por el recorte.',
                consequence: 'Se usó tu fotografía tal como la subiste, dentro del diseño.',
            };
        }
        // El recuento sólo decide cuando es fiable. Contar catorce cabezas no lo
        // hace bien ningún modelo de visión, y descartar una composición por un
        // ±1 en una multitud sería gastar créditos en un problema inexistente.
        //
        // Y NO es simétrico: gente de MÁS es una persona inventada y descalifica
        // siempre; gente de MENOS, con el recorte permitido, es el encuadre
        // haciendo su trabajo. Compararlo con `Math.abs` era lo que vetaba toda
        // composición de una foto de grupo.
        const l = semantic.leftPeople;
        const r = semantic.rightPeople;
        const contable = l != null && r != null && l <= PRESERVATION.reliableCountMax;
        if (contable && r - l > PRESERVATION.maxPersonDelta) {
            return {
                state: 'failed',
                use: false,
                reason: `Tu fotografía tiene ${l} personas y la composición muestra ${r}.`,
                consequence: 'Se usó tu fotografía tal como la subiste, dentro del diseño.',
            };
        }
        if (contable && !permiteRecorte && l - r > PRESERVATION.maxPersonDelta) {
            return {
                state: 'failed',
                use: false,
                reason: `Tu fotografía tiene ${l} personas y la composición muestra ${r}.`,
                consequence: 'Se usó tu fotografía tal como la subiste, dentro del diseño.',
            };
        }
        if (semantic.faceConsistency != null && semantic.faceConsistency < PRESERVATION.minFaceConsistency) {
            return {
                state: 'failed',
                use: false,
                reason: 'Los rostros de la composición no son los de tu fotografía.',
                consequence: 'Se usó tu fotografía tal como la subiste, dentro del diseño.',
            };
        }
    }

    // Se usa. Y si el encuadre se llevó a alguien de los bordes, se DICE: la
    // pieza puede no mostrar a todos, y quien la descarga tiene que saberlo
    // antes de publicarla. `notice` no es un fallo —por eso va aparte de
    // `reason`— pero tampoco se calla: el módulo ofrece volver a la fotografía
    // en su recuadro, y esa decisión es del usuario, no nuestra.
    const recortada = !!(semantic?.missingSubjects && semantic.missingAtEdge);
    return {
        state: 'ok',
        use: true,
        reason: null,
        consequence: null,
        cropped: recortada,
        notice: recortada
            ? 'El encuadre del diseño recortó a alguien de los bordes de tu fotografía. Si preferís que salgan todos, podés volver a la fotografía en su recuadro.'
            : null,
    };
};

// ─── La orquestación ───────────────────────────────────────────────────
//
// Nunca lanza: un control de calidad que tumba la generación es peor que no
// tenerlo. Si algo falla, devuelve `unavailable` y la pieza se entrega igual,
// diciéndolo.
// `publish` sube la composición lado a lado y devuelve su URL. Hace falta
// porque la cadena de proveedores acepta una IMAGEN POR URL, no un buffer —
// mismo camino que `reelQuality.js`. Sin ella queda sólo la señal estructural,
// que por sí sola no distingue «se recompuso» de «se alteró» y por eso decide
// únicamente el caso extremo.
export const checkPreservation = async (originalBuffer, composedBuffer, { provider = null, publish = null, edgeCrop = EDGE_CROP.ALLOW } = {}) => {
    const structural = await structuralCompare(originalBuffer, composedBuffer).catch(() => null);

    let semantic = null;
    if (publish) {
        try {
            const lado = await buildComparisonImage(originalBuffer, composedBuffer);
            const url = await publish(lado);
            if (!url) throw new Error('no se pudo publicar la comparación');
            const res = await generateCopy({
                ...(provider ? { provider } : {}),
                system: PEOPLE_SYSTEM,
                userText: PEOPLE_USER,
                imageUrl: url,
                jsonMode: true,
                temperature: 0.1,
                maxTokens: 400,
            });
            semantic = readPeopleVerdict(res);
        } catch (e) {
            // Un control de calidad que tumba la generación es peor que no
            // tenerlo: se anota y se sigue con lo que se pudo medir.
            console.warn('[designGuard] sin modelo de visión:', e.message);
        }
    }

    return { ...decidePreservation({ semantic, structural, edgeCrop }), semantic, structural };
};

export default {
    PRESERVATION, EDGE_CROP, PEOPLE_SYSTEM, PEOPLE_USER,
    readPeopleVerdict, decidePreservation, checkPreservation,
};
