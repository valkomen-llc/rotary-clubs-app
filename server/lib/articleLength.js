// ════════════════════════════════════════════════════════════════════════════
// articleLength.js — EL CRITERIO de la extensión de los artículos de IA — v4.1059
//
// **Puro**: sin base, sin red, sin IA, sin DOM. Acá vive QUÉ extensión se le
// pide al modelo, cómo se mide la que ya tienen los artículos y qué se le dice
// al administrador. La I/O está en `articleLengthStore.js`, por el mismo motivo
// que `feeRules.js` está separado de `feeRulesStore.js`: un criterio que sólo
// se puede ejercitar contra una base real termina sin pruebas.
//
// ⚠️ LA EXTENSIÓN SE CONFIGURA EN CARACTERES Y LA ESTRUCTURA SE SIGUE MIDIENDO
// EN PALABRAS, y no son dos criterios sobre lo mismo: son dos preguntas
// distintas. «Cuánto dura el artículo» es un TOTAL y el administrador lo piensa
// en caracteres —es lo que ve en un contador—; «este párrafo se lee en un
// teléfono» es una cuestión de FORMA y se mide en palabras desde v4.891. Lo que
// no puede haber son dos números para el MISMO total, y por eso el total pasa
// entero a caracteres: es lo que se configura, lo que se valida y lo que se
// compara después (antes → objetivo → resultado).
//
// ⚠️ NADA DE ESTO TRUNCA. El valor configurado entra al PROMPT y al VALIDADOR:
// un artículo largo se REESCRIBE más corto, nunca se corta. `substring` sobre
// un cuerpo HTML parte una etiqueta a la mitad y deja el artículo roto; sobre
// el texto, corta una frase por la mitad y se lee como un error del sistema.
// Una prueba comprueba que este archivo no recorte ningún cuerpo.
// ════════════════════════════════════════════════════════════════════════════

import { DEPTH_PROFILES, DEFAULT_DEPTH, depthOf } from './articleSpec.js';
import { CONTENT_THIN_WORDS, CONTENT_RECOMMENDED_WORDS } from './seoRules.js';

export const ARTICLE_LENGTH_KEY = 'article_length';

// ⚠️ MEDIDO, NO ESTIMADO. 6,37 caracteres por palabra es lo que dio el cuerpo
// de un artículo REAL del Distrito 4281 («Brigada de salud en Sevilla»:
// 2.938 caracteres / 461 palabras). Es el puente entre lo que el administrador
// escribe (caracteres) y las reglas de estructura que ya existen (palabras).
//
// No se deja fijo a ciegas: `summarizeCorpus` vuelve a medirlo sobre los
// artículos que de verdad tiene el sitio y el panel muestra el valor observado,
// así que se puede comprobar en producción en vez de creerle a esta constante.
export const CHARS_PER_WORD = 6.37;

export const charsToWords = (chars) => Math.round(Number(chars || 0) / CHARS_PER_WORD);
export const wordsToChars = (words) => Math.round(Number(words || 0) * CHARS_PER_WORD);

// ⚠️ EL PISO NO ES UN GUSTO: POR DEBAJO, NUESTRO PROPIO INFORME DE SEO LO MARCA.
// `seoRules` denuncia `content_thin` bajo 150 palabras y recomienda 300. Un
// artículo generado no puede nacer ya señalado por la auditoría del mismo
// sitio, así que el mínimo configurable es el RECOMENDADO —no el umbral de
// denuncia—: apuntar justo al borde deja la mitad de los artículos del lado
// malo en cuanto el modelo se queda un poco corto.
export const SEO_THIN_CHARS = wordsToChars(CONTENT_THIN_WORDS);            // ~956
export const SEO_RECOMMENDED_CHARS = wordsToChars(CONTENT_RECOMMENDED_WORDS); // ~1911

export const MIN_TARGET_CHARS = SEO_RECOMMENDED_CHARS;  // 1.911
// El techo es el presupuesto de salida del modelo: pasado ese punto la
// respuesta se corta a mitad del JSON y no queda nada aprovechable (v4.891).
export const MAX_TARGET_CHARS = 12000;

// ⚠️ EL VALOR ES UN OBJETIVO CON TOLERANCIA, NO UN CORTE EN EL CARÁCTER N.
// Obligar al modelo a terminar exactamente en 2.500 es obligarlo a cortar una
// frase, que es justo lo que este módulo existe para no hacer. La banda es
// ±18 %, con un piso de ±300 caracteres para que un objetivo corto no quede
// con una tolerancia de dos frases.
export const TOLERANCE_RATIO = 0.18;
export const MIN_TOLERANCE_CHARS = 300;

export const toleranceFor = (targetChars) => {
    const t = Math.round(Number(targetChars) || 0);
    const banda = Math.max(MIN_TOLERANCE_CHARS, Math.round(t * TOLERANCE_RATIO));
    return { band: banda, min: Math.max(0, t - banda), max: t + banda };
};

// `null` es «sin objetivo configurado» y es el valor por defecto a propósito:
// desplegar esto no cambia ni un artículo. Sin configuración, la generación se
// comporta EXACTAMENTE como antes —los perfiles de `articleSpec.js`—, y lo que
// se gana es poder medir. Es la misma regla aditiva de `sessions` (v4.711).
export const DEFAULT_ARTICLE_LENGTH = Object.freeze({
    targetChars: null,
    updatedAt: null,
    updatedBy: null,
    updatedByName: null,
});

/** Lee lo guardado. Tolerante: una configuración ilegible no puede tumbar una
 *  generación, así que degrada a «sin objetivo» —el comportamiento de siempre—. */
export function parseArticleLength(value) {
    if (!value) return { ...DEFAULT_ARTICLE_LENGTH };
    let raw = value;
    if (typeof raw === 'string') {
        try { raw = JSON.parse(raw); } catch { return { ...DEFAULT_ARTICLE_LENGTH }; }
    }
    if (!raw || typeof raw !== 'object') return { ...DEFAULT_ARTICLE_LENGTH };
    const n = Number(raw.targetChars);
    return {
        targetChars: Number.isFinite(n) && n > 0 ? Math.round(n) : null,
        updatedAt: raw.updatedAt || null,
        updatedBy: raw.updatedBy || null,
        updatedByName: raw.updatedByName || null,
    };
}

/**
 * El administrador escribe y el CÓDIGO decide.
 *
 * Los errores BLOQUEAN y los avisos no: tratarlos igual convierte cualquier
 * observación en un muro y se dejan de leer (regla del panel de tarifas,
 * v4.854). Vaciar el campo es legítimo —vuelve al comportamiento de siempre— y
 * por eso no es un error.
 */
export function validateArticleLength({ targetChars } = {}) {
    const errors = [];
    const warnings = [];

    if (targetChars === null || targetChars === undefined || targetChars === '') {
        return { ok: true, errors, warnings, value: null };
    }
    const n = Number(targetChars);
    if (!Number.isFinite(n)) {
        errors.push('La longitud objetivo tiene que ser un número de caracteres.');
        return { ok: false, errors, warnings, value: null };
    }
    const v = Math.round(n);
    if (v < MIN_TARGET_CHARS) {
        errors.push(`${v.toLocaleString('es-CO')} caracteres queda por debajo del mínimo de ${MIN_TARGET_CHARS.toLocaleString('es-CO')}: con menos, el propio informe de SEO del sitio marca el artículo como contenido pobre (${CONTENT_RECOMMENDED_WORDS} palabras recomendadas).`);
    }
    if (v > MAX_TARGET_CHARS) {
        errors.push(`${v.toLocaleString('es-CO')} caracteres supera el máximo de ${MAX_TARGET_CHARS.toLocaleString('es-CO')}: por encima, la respuesta del modelo se corta a mitad del JSON y no queda artículo que aprovechar.`);
    }
    if (!errors.length && v < SEO_RECOMMENDED_CHARS + 600) {
        warnings.push(`A ${v.toLocaleString('es-CO')} caracteres el artículo queda cerca del piso que recomienda el informe de SEO (${SEO_RECOMMENDED_CHARS.toLocaleString('es-CO')}). Sigue siendo publicable; si el modelo se queda corto, puede nacer señalado.`);
    }
    return { ok: !errors.length, errors, warnings, value: errors.length ? null : v };
}

/**
 * El perfil de redacción para un objetivo en caracteres.
 *
 * ⚠️ NO BASTA CON CAMBIAR EL TOTAL: las reglas de estructura que ya existen se
 * vuelven IMPOSIBLES en un artículo corto. El perfil `estandar` pide 3 secciones
 * de 90 palabras cada una más la entrada: 340 palabras ≈ 2.170 caracteres sólo
 * de mínimos, y `reportaje` pide 4 de 130 ≈ 3.300. Configurar 2.500 y dejar esas
 * reglas produce un artículo que NO PUEDE cumplirlas, que quema los dos intentos
 * y se entrega con avisos. Así que el perfil se escala entero y de una vez.
 *
 * Se escala PROPORCIONALMENTE contra el propio objetivo del preset, con topes:
 * ninguna sección baja de lo que se puede leer como sección, y el máximo de
 * secciones nunca queda por debajo del mínimo.
 */
export function profileForTarget(targetChars, base = DEFAULT_DEPTH) {
    const preset = depthOf(base);
    const t = Math.round(Number(targetChars) || 0);
    if (!t) return preset;

    const objetivoPalabras = charsToWords(t);
    const ratio = objetivoPalabras / preset.targetWords;
    const { min, max } = toleranceFor(t);

    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const minSections = clamp(Math.round(preset.minSections * ratio), 2, preset.minSections);
    const maxSections = clamp(Math.round(preset.maxSections * ratio), minSections + 1, preset.maxSections);
    const minSectionWords = clamp(Math.round(preset.minSectionWords * ratio), 45, preset.minSectionWords);

    return {
        ...preset,
        id: `${preset.id}:${t}`,
        label: `${preset.label} · ${t.toLocaleString('es-CO')} caracteres`,
        // El TOTAL, en caracteres: es lo que se configuró y lo que se compara.
        targetChars: t,
        minChars: min,
        maxChars: max,
        // Las palabras siguen existiendo para la estructura y para que el
        // informe de SEO y el generador cuenten lo mismo.
        targetWords: objetivoPalabras,
        minWords: Math.max(CONTENT_THIN_WORDS, charsToWords(min)),
        maxWords: charsToWords(max),
        minSections,
        maxSections,
        minSectionWords,
        // La FORMA de un párrafo no depende de lo largo que sea el artículo:
        // un párrafo de 120 palabras no se lee en un teléfono ni en un artículo
        // corto ni en uno largo. `maxParagraphWords` se hereda sin escalar.
        configured: true,
    };
}

/** El perfil que toca: el configurado si lo hay, el preset si no. Es el ÚNICO
 *  punto donde se decide, para que la generación, la regeneración y el contador
 *  del editor no puedan discrepar sobre cuánto tiene que medir un artículo. */
export function resolveArticleProfile({ config = DEFAULT_ARTICLE_LENGTH, depth = DEFAULT_DEPTH } = {}) {
    const objetivo = parseArticleLength(config)?.targetChars ?? null;
    return objetivo ? profileForTarget(objetivo, depth) : depthOf(depth);
}

// ── Medición del corpus ──────────────────────────────────────────────────────

/**
 * Resume las longitudes YA MEDIDAS de los artículos del sitio.
 *
 * Recibe los números, no las filas: así se prueba sin base. Quien lee la base y
 * aplica `stripHtml` es el controlador —con el MISMO `stripHtml` del validador,
 * o el promedio diría una cosa y la validación otra—.
 *
 * `null` cuando no hay ningún artículo: un cero sería una afirmación («los
 * artículos miden 0») y un hueco es la verdad.
 */
export function summarizeCorpus(samples = []) {
    const filas = (Array.isArray(samples) ? samples : [])
        .map(s => (typeof s === 'number' ? { chars: s, words: null } : s))
        .filter(s => s && Number.isFinite(Number(s.chars)) && Number(s.chars) > 0);

    if (!filas.length) {
        return { count: 0, average: null, min: null, max: null, median: null, charsPerWord: null };
    }
    const chars = filas.map(f => Math.round(Number(f.chars))).sort((a, b) => a - b);
    const mitad = Math.floor(chars.length / 2);
    const median = chars.length % 2 ? chars[mitad] : Math.round((chars[mitad - 1] + chars[mitad]) / 2);

    const conPalabras = filas.filter(f => Number(f.words) > 0);
    const totalChars = conPalabras.reduce((a, f) => a + Number(f.chars), 0);
    const totalWords = conPalabras.reduce((a, f) => a + Number(f.words), 0);

    return {
        count: chars.length,
        average: Math.round(chars.reduce((a, c) => a + c, 0) / chars.length),
        min: chars[0],
        max: chars[chars.length - 1],
        median,
        // El puente medido sobre el corpus REAL, para poder contrastar
        // `CHARS_PER_WORD` en producción en vez de creerle a la constante.
        charsPerWord: totalWords ? Number((totalChars / totalWords).toFixed(2)) : null,
    };
}

/**
 * La referencia que se le muestra al administrador junto al campo.
 *
 * ⚠️ NO SE INVENTA NINGÚN NÚMERO. Si el corpus no se pudo medir se dice, en vez
 * de rellenar con un promedio plausible: es exactamente la cifra sobre la que
 * alguien va a decidir cuánto recortar.
 */
export function describeCurrentConfig(config = DEFAULT_ARTICLE_LENGTH, stats = null) {
    const c = parseArticleLength(config);
    const n = (v) => Number(v).toLocaleString('es-CO');
    const lineas = [];

    lineas.push(c.targetChars
        ? `Configuración actual: ${n(c.targetChars)} caracteres de longitud objetivo.`
        : `Configuración actual: sin objetivo explícito. Los artículos se escriben con los perfiles de redacción del sistema (${n(wordsToChars(DEPTH_PROFILES.estandar.targetWords))} caracteres aprox. para un artículo estándar y ${n(wordsToChars(DEPTH_PROFILES.reportaje.targetWords))} para un reportaje).`);

    if (!stats || !stats.count) {
        lineas.push('Artículos medidos: todavía ninguno. El promedio aparece en cuanto haya artículos generados por IA en este sitio.');
    } else {
        lineas.push(`Promedio de los ${n(stats.count)} artículo(s) generados: ${n(stats.average)} caracteres.`);
        lineas.push(`Rango observado: ${n(stats.min)}–${n(stats.max)} caracteres (mediana ${n(stats.median)}).`);
    }
    return lineas;
}

// ── El contador del editor ───────────────────────────────────────────────────

/**
 * El veredicto de un cuerpo frente al objetivo, para el contador de la pantalla.
 *
 * ⚠️ NUNCA BLOQUEA UNA EDICIÓN HUMANA. La configuración gobierna la GENERACIÓN;
 * un administrador que escribe un artículo largo a mano está tomando una
 * decisión, no cometiendo un error. Por eso el peor estado es `over` —que se
 * pinta y se explica— y jamás algo que impida guardar.
 */
export function lengthVerdict(chars, targetChars) {
    const c = Math.max(0, Math.round(Number(chars) || 0));
    const t = Math.round(Number(targetChars) || 0);
    if (!t) return { state: 'sin_objetivo', chars: c, target: null, label: `${c.toLocaleString('es-CO')} caracteres` };

    const { min, max } = toleranceFor(t);
    const state = c < min ? 'under' : c > max ? 'over' : 'ok';
    const label = `${c.toLocaleString('es-CO')} / ${t.toLocaleString('es-CO')} caracteres objetivo`;
    const note = state === 'over'
        ? `Supera el objetivo en ${(c - t).toLocaleString('es-CO')} caracteres. Podés dejarlo así: el objetivo gobierna lo que escribe la IA, no lo que escribís vos.`
        : state === 'under'
            ? `Queda ${(t - c).toLocaleString('es-CO')} caracteres por debajo del objetivo.`
            : '';
    return { state, chars: c, target: t, min, max, label, note };
}

// ── El lote ──────────────────────────────────────────────────────────────────

export const BULK_MAX = 50;

/**
 * Qué le pasa a cada artículo de una selección, ANTES de tocar nada.
 *
 * Es lo que permite decir «se regenerarán 6 artículos» y nombrar los que no,
 * con su motivo. Un descarte silencioso deja a quien seleccionó seis y ve
 * cuatro sin saber cuáles faltaron ni por qué.
 *
 * ⚠️ UN ARTÍCULO SIN SOLICITUD NO SE REGENERA. Sin la solicitud original no hay
 * de dónde sacar los hechos, y resumir el texto ya publicado una y otra vez
 * degrada la información en cada vuelta (el pedido lo dice con esas palabras).
 */
export const BULK_BLOCKS = {
    sin_solicitud: {
        id: 'sin_solicitud',
        label: 'No salió de una solicitud de contenido',
        help: 'Sin la solicitud original no hay material de origen: regenerar resumiendo el texto publicado degradaría la información en cada vuelta. Este artículo se edita a mano.',
    },
    sin_cuerpo: {
        id: 'sin_cuerpo',
        label: 'No tiene cuerpo que regenerar',
        help: 'El artículo está vacío. Generalo desde la ficha de su solicitud.',
    },
    estatico: {
        id: 'estatico',
        label: 'Es contenido de ejemplo',
        help: 'No es una publicación de la base: no hay nada que regenerar.',
    },
    ajeno: {
        id: 'ajeno',
        label: 'No es de este sitio',
        help: 'Se edita desde el sitio que la publicó.',
    },
};

export function planBulkRegeneration(items = [], { config = DEFAULT_ARTICLE_LENGTH } = {}) {
    const objetivo = parseArticleLength(config)?.targetChars ?? null;
    const elegibles = [];
    const bloqueados = [];

    for (const it of (Array.isArray(items) ? items : [])) {
        const motivo = it?.isStatic ? 'estatico'
            : it?.foreign ? 'ajeno'
            : !it?.submissionId ? 'sin_solicitud'
            : !Number(it?.chars) ? 'sin_cuerpo'
            : null;
        if (motivo) {
            bloqueados.push({ id: it?.id || null, title: it?.title || null, reason: motivo, ...BULK_BLOCKS[motivo] });
            continue;
        }
        elegibles.push({
            id: it.id,
            title: it.title || null,
            submissionId: it.submissionId,
            campaignId: it.campaignId || null,
            chars: Math.round(Number(it.chars)),
            published: Boolean(it.published),
        });
    }

    const publicados = elegibles.filter(e => e.published);
    return {
        targetChars: objetivo,
        eligible: elegibles,
        blocked: bloqueados,
        published: publicados,
        overLimit: elegibles.length > BULK_MAX,
        summary: describeBulkPlan({ eligible: elegibles, blocked: bloqueados, published: publicados, targetChars: objetivo }),
    };
}

/** La frase de la confirmación: dice el HECHO —cuántos, con qué objetivo y qué
 *  queda fuera— en vez de preguntar «¿estás seguro?». Lo que hay que poder
 *  revisar es lo que va a pasar. */
export function describeBulkPlan({ eligible = [], blocked = [], published = [], targetChars = null } = {}) {
    const n = (v) => Number(v).toLocaleString('es-CO');
    const lineas = [];

    if (!eligible.length) {
        lineas.push('Ninguno de los artículos seleccionados se puede regenerar.');
    } else {
        lineas.push(targetChars
            ? `Se regenerarán ${n(eligible.length)} artículo(s) utilizando una longitud objetivo de ${n(targetChars)} caracteres.`
            : `Se regenerarán ${n(eligible.length)} artículo(s) con los perfiles de redacción del sistema: todavía no hay una longitud objetivo configurada.`);
        lineas.push('Se reescribe el cuerpo a partir de la solicitud original. El título, la dirección, las imágenes, el autor, la fecha y el estado de publicación no se tocan.');
    }
    if (published.length) {
        lineas.push(`⚠️ ${n(published.length)} de ellos están PUBLICADOS: se guarda una versión anterior antes de reemplazar el texto que ya está en línea.`);
    }
    if (blocked.length) {
        lineas.push(`${n(blocked.length)} quedan fuera: ${[...new Set(blocked.map(b => b.label))].join('; ')}.`);
    }
    return lineas;
}

export default {
    ARTICLE_LENGTH_KEY, DEFAULT_ARTICLE_LENGTH, CHARS_PER_WORD,
    MIN_TARGET_CHARS, MAX_TARGET_CHARS, SEO_THIN_CHARS, SEO_RECOMMENDED_CHARS,
    TOLERANCE_RATIO, MIN_TOLERANCE_CHARS, BULK_MAX, BULK_BLOCKS,
    charsToWords, wordsToChars, toleranceFor,
    parseArticleLength, validateArticleLength, profileForTarget, resolveArticleProfile,
    summarizeCorpus, describeCurrentConfig, lengthVerdict,
    planBulkRegeneration, describeBulkPlan,
};
