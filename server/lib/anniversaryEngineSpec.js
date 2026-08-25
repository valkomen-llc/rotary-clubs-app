// ════════════════════════════════════════════════════════════════════
// Aniversarios IA — el CRITERIO del motor de imagen
// v4.897.0
//
// PURO: sin base, sin red, sin IA, sin DOM. Todo lo que decide qué modelo
// genera, cómo se evalúa y cuándo entra el respaldo vive acá, y se prueba con
// `npm run test:anniversary:engine`.
//
// ── LA CADENA QUE ESTE ARCHIVO SOSTIENE ─────────────────────────────
//
//   proveedor (KIE) → catálogo de modelos → elegibilidad por capacidades
//   → benchmark → recomendado → ACTIVACIÓN EXPLÍCITA → producción → fallback
//
// ── TRES DECISIONES QUE NO SE NEGOCIAN ──────────────────────────────
//
// 1. **NADA CAMBIA EL MODELO DE PRODUCCIÓN EN SILENCIO.** Un benchmark
//    RECOMIENDA; una persona ACTIVA. `resolveProduction` sólo lee lo activado,
//    jamás lo recomendado. Un modelo nuevo entra como candidato, se compara
//    con evidencia y se aprueba — o no entra.
//
// 2. **EL FALLBACK ES DE INFRAESTRUCTURA, NUNCA ESTÉTICO.** Timeout, 5xx,
//    límite del proveedor o un modelo retirado disparan el respaldo; una
//    composición fea NO — de eso se ocupa la validación de calidad con su
//    reintento. Confundirlos haría que cada pieza mediocre gastara créditos
//    en dos modelos.
//
// 3. **EL CATÁLOGO ES DECLARADO, Y HAY QUE DECIRLO.** KIE no expone en esta
//    integración ningún endpoint que liste modelos ni sus capacidades: lo que
//    hay es `jobs/createTask` con un id de modelo. Así que las capacidades se
//    DECLARAN acá —desde la documentación del proveedor y la experiencia
//    medida del repo— y un modelo nuevo se agrega como CANDIDATO desde el
//    panel, no se detecta solo. Afirmar «detección automática» sería fingir
//    una integración que no existe. Los ids además se corrigen por entorno,
//    porque KIE los renombra (regla de Outros/Reels).
//
// ── POR QUÉ NO SE MANDAN guidance/strength/seed ─────────────────────
//
// KIE valida el `input` contra el esquema de CADA modelo: los campos que el
// modelo no declara sobran y rompen la tarea — es exactamente lo que tumbó el
// Generador de Outros en v4.645. Los modelos de edición que usa esta
// plataforma exponen `{ prompt, image_urls, negative_prompt?, image_size,
// output_format }` y nada más: cualquier plan que dependa de «bajar la
// creatividad» por parámetro no es implementable con este proveedor (misma
// lección que Kling en Reels). Los parámetros por modelo que SÍ existen son
// los nuestros: timeout, reintentos y créditos estimados.
// ════════════════════════════════════════════════════════════════════

import { PROMPT_VERSION } from './anniversarySpec.js';

export const ENGINE_PROVIDER = 'kie';

// ─── El catálogo declarado ─────────────────────────────────────────────
//
// `capabilities` es lo que la ELEGIBILIDAD comprueba; `notes` es lo que el
// panel enseña. `creditsEstimated` es el MEDIDOR PROPIO —KIE no devuelve el
// costo— y jamás se presenta como el saldo del proveedor (regla del sitio).
// Los ids se corrigen por entorno sin desplegar.
export const MODEL_CATALOG = [
    {
        id: process.env.ANNIVERSARY_MODEL_NANO_BANANA || 'google/nano-banana-edit',
        key: 'nano_banana',
        label: 'Nano Banana Edit (Gemini 2.5 Flash Image)',
        capabilities: { imageToImage: true, referenceImages: 4, negativePrompt: true, aspectRatioParam: true, outpainting: true, minSide: 1024 },
        creditsEstimated: 4,
        timeoutMs: 100_000,
        notes: 'El motor actual de producción. La familia con mejor conservación de identidad medida en esta plataforma (Generador de Publicaciones, Expansión de Lienzo).',
    },
    {
        id: process.env.ANNIVERSARY_MODEL_FLUX_KONTEXT || 'black-forest-labs/flux-kontext-max',
        key: 'flux_kontext',
        label: 'Flux Kontext Max (Black Forest Labs)',
        capabilities: { imageToImage: true, referenceImages: 2, negativePrompt: false, aspectRatioParam: true, outpainting: true, minSide: 1024 },
        creditsEstimated: 8,
        timeoutMs: 120_000,
        notes: 'Edición contextual con buena continuidad de fondo. Sin campo de prompt negativo: las restricciones sólo viajan en el positivo.',
    },
    {
        id: process.env.ANNIVERSARY_MODEL_SEEDREAM || 'bytedance/seedream-v4-edit',
        key: 'seedream',
        label: 'Seedream 4 Edit (ByteDance)',
        capabilities: { imageToImage: true, referenceImages: 2, negativePrompt: false, aspectRatioParam: true, outpainting: true, minSide: 1024 },
        creditsEstimated: 3,
        timeoutMs: 120_000,
        notes: 'Editor alternativo con cambio de proporción nativo. Verificar el id del modelo con un benchmark antes de activarlo.',
    },
];

export const DEFAULT_MODEL_ID = MODEL_CATALOG[0].id;

// ─── Capacidades OBLIGATORIAS ──────────────────────────────────────────
//
// Un modelo que sólo genera desde texto no puede respetar la fotografía del
// club: no entra a este flujo por atractivas que sean sus imágenes (req. 9).
// Las obligatorias BLOQUEAN; lo demás AVISA — un modelo sin prompt negativo
// sigue sirviendo, pero quien lo activa tiene que saber qué pierde.
export const eligibility = (model) => {
    const c = model?.capabilities || {};
    const errors = [];
    const warnings = [];
    if (!c.imageToImage) errors.push('No trabaja imagen-a-imagen: no puede respetar la fotografía del club.');
    if (!(c.referenceImages >= 1)) errors.push('No acepta ninguna imagen de referencia: la fotografía no le llegaría.');
    if (!(c.minSide >= 1024)) errors.push('Su resolución no alcanza para una pieza de 1080 px.');
    if (c.referenceImages < 2) warnings.push('Acepta una sola imagen: la referencia visual de estilo no viajaría junto a la fotografía.');
    if (!c.negativePrompt) warnings.push('Sin campo de prompt negativo: las restricciones sólo viajan dentro del positivo.');
    if (!c.outpainting) warnings.push('Sin extensión generativa: una foto muy apaisada se encuadra en vez de extenderse.');
    return { eligible: errors.length === 0, errors, warnings };
};

// ─── Modelos candidatos agregados a mano ───────────────────────────────
//
// La mitad honesta de la «evolución automática»: como no hay catálogo que
// consultar, un modelo nuevo de KIE se DECLARA acá desde el panel, con sus
// capacidades dichas por quien lo agrega, y sólo puede activarse después de
// un benchmark. Redeclarar un id del catálogo lo SOBREESCRIBE (para corregir
// créditos o capacidades sin desplegar).
export const MAX_CUSTOM_MODELS = 6;

const cleanStr = (v, max = 120) => String(v ?? '').trim().slice(0, max);

export const normalizeCustomModel = (raw) => {
    const id = cleanStr(raw?.id, 80);
    // Un id de KIE es `familia/modelo`. Cualquier otra cosa es un error de
    // tipeo que fallaría en el proveedor con un mensaje que no explica nada.
    if (!/^[a-z0-9._-]+\/[a-z0-9._-]+$/i.test(id)) return null;
    const c = raw?.capabilities || {};
    return {
        id,
        key: `custom_${id.replace(/[^a-z0-9]+/gi, '_')}`,
        label: cleanStr(raw?.label, 80) || id,
        capabilities: {
            imageToImage: c.imageToImage !== false,
            referenceImages: Math.max(0, Math.min(8, Number(c.referenceImages ?? 1) || 0)),
            negativePrompt: c.negativePrompt === true,
            aspectRatioParam: c.aspectRatioParam !== false,
            outpainting: c.outpainting === true,
            minSide: Math.max(0, Number(c.minSide ?? 1024) || 0),
        },
        creditsEstimated: Math.max(1, Math.min(100, Number(raw?.creditsEstimated) || 5)),
        timeoutMs: 120_000,
        notes: cleanStr(raw?.notes, 200) || 'Candidato agregado a mano. Sus capacidades son declaradas, no verificadas: el benchmark es lo que las verifica.',
        custom: true,
    };
};

/** El catálogo COMPLETO para una configuración: los declarados más los
 *  candidatos, con los custom pisando por id (así se corrige un crédito o una
 *  capacidad sin desplegar). El orden es estable: es el desempate del
 *  benchmark. */
export const catalogFor = (engineConfig = {}) => {
    const custom = (Array.isArray(engineConfig.customModels) ? engineConfig.customModels : [])
        .map(normalizeCustomModel).filter(Boolean).slice(0, MAX_CUSTOM_MODELS);
    const byId = new Map(MODEL_CATALOG.map(m => [m.id, { ...m }]));
    for (const m of custom) byId.set(m.id, byId.has(m.id) ? { ...byId.get(m.id), ...m, custom: byId.get(m.id).custom || false } : m);
    return [...byId.values()];
};

export const modelById = (id, engineConfig = {}) => catalogFor(engineConfig).find(m => m.id === id) || null;

// ─── La configuración del motor ────────────────────────────────────────
//
// Vive APARTE de las instrucciones (borrador/publicado): cambiar el modelo es
// una decisión técnica que no reescribe la dirección de arte ni crea una
// versión editorial. Lo que sí queda trazado es el sello por pieza.
export const ENGINE_MODES = ['auto', 'manual'];

export const normalizeEngineConfig = (raw) => {
    const c = raw && typeof raw === 'object' ? raw : {};
    const customModels = (Array.isArray(c.customModels) ? c.customModels : [])
        .map(normalizeCustomModel).filter(Boolean).slice(0, MAX_CUSTOM_MODELS);
    const cat = catalogFor({ customModels });
    const conocido = (id) => cat.some(m => m.id === id);
    return {
        mode: ENGINE_MODES.includes(c.mode) ? c.mode : 'auto',
        // `active` es lo ACTIVADO por una persona; nunca lo escribe un
        // benchmark solo. Nulo = el default del catálogo.
        active: conocido(c.active) ? c.active : null,
        fallback: conocido(c.fallback) ? c.fallback : null,
        weights: normalizeWeights(c.weights),
        customModels,
        // De dónde salió la activación: es lo que contesta «¿por qué
        // producción usa este modelo?» seis meses después.
        activatedFrom: c.activatedFrom && typeof c.activatedFrom === 'object'
            ? { benchmarkId: cleanStr(c.activatedFrom.benchmarkId, 60) || null, at: cleanStr(c.activatedFrom.at, 40) || null, by: cleanStr(c.activatedFrom.by, 120) || null }
            : null,
    };
};

/**
 * Qué modelo genera en producción, y por qué.
 *
 * El ORDEN: la variable de entorno gana SIEMPRE —es la salida de emergencia
 * sin desplegar cuando KIE retira un id, la regla del sitio desde Outros—;
 * después lo activado; después el default. Un activo no elegible o
 * desconocido DEGRADA al default y lo dice: producción no puede quedarse sin
 * motor porque alguien declaró mal un candidato.
 *
 * El fallback nunca es el mismo modelo que el primario: reintentar contra lo
 * que acaba de fallar por infraestructura no es un respaldo, es insistir.
 */
export const resolveProduction = (engineConfig = {}, env = process.env) => {
    const c = normalizeEngineConfig(engineConfig);
    const notes = [];

    let primary = null;
    let source = null;
    if (env.ANNIVERSARY_MODEL) {
        primary = env.ANNIVERSARY_MODEL;
        source = 'env';
        notes.push(`El entorno está forzando el modelo (ANNIVERSARY_MODEL=${env.ANNIVERSARY_MODEL}); el panel no manda hasta que se retire esa variable.`);
    } else if (c.active) {
        const m = modelById(c.active, c);
        if (m && eligibility(m).eligible) { primary = c.active; source = 'activated'; }
        else {
            notes.push(`El modelo activado (${c.active}) ya no es elegible; producción degradó al default.`);
        }
    }
    if (!primary) { primary = DEFAULT_MODEL_ID; source = source || 'default'; }

    let fallback = null;
    if (c.fallback && c.fallback !== primary) {
        const m = modelById(c.fallback, c);
        if (m && eligibility(m).eligible) fallback = c.fallback;
        else notes.push(`El fallback configurado (${c.fallback}) no es elegible y se ignora.`);
    } else if (c.fallback === primary) {
        notes.push('El fallback configurado es el mismo modelo que el primario y se ignora: reintentar contra lo que acaba de fallar no es un respaldo.');
    }
    return { primary, fallback, source, notes };
};

// ─── Cuándo entra el fallback ──────────────────────────────────────────
//
// Se clasifica el TEXTO del error del proveedor —que este módulo propaga
// textual a propósito— en dos clases. `infra` dispara el respaldo; `other`
// no: una generación estéticamente mala, un contenido rechazado o un error
// nuestro no mejoran cambiando de modelo, y gastarían créditos dobles.
export const classifyProviderError = (message) => {
    const m = String(message || '');
    if (/timeout|timed?\s?out|ETIMEDOUT|ECONNRESET|ECONNREFUSED|socket hang/i.test(m)) return 'infra';
    if (/\b(5\d\d)\b|internal server|bad gateway|service unavailable|gateway time/i.test(m)) return 'infra';
    if (/rate limit|too many requests|\b429\b|quota|insufficient credit|maintenance|overloaded|capacity/i.test(m)) return 'infra';
    // Un modelo retirado o renombrado ES indisponibilidad: KIE renombra ids y
    // el primario puede morir de un día para otro.
    if (/model.*(not found|does not exist|invalid|unavailable|deprecated)|no existe|not supported/i.test(m)) return 'infra';
    return 'other';
};

export const shouldFallback = (message) => classifyProviderError(message) === 'infra';

// ─── El benchmark ──────────────────────────────────────────────────────
//
// Los pesos del pedido, configurables. Fidelidad y calidad pesan más que
// costo y velocidad A PROPÓSITO: una pieza institucional con un rostro
// deformado no vale nada por barata que haya salido.
export const DEFAULT_WEIGHTS = {
    humanFidelity: 25,
    facePreservation: 20,
    instructionFollowing: 15,
    photoIntegration: 15,
    composition: 10,
    noInvented: 5,
    technical: 5,
    latency: 3,
    cost: 2,
};

/** Qué mide cada criterio y DE DÓNDE sale su nota. La distinción importa más
 *  que la lista: un criterio que ninguna máquina puede medir (integración,
 *  composición) sólo puntúa con votos humanos, y hasta que los haya queda
 *  DECLARADO como no medido — jamás se inventa un número (regla del sitio:
 *  un cero es una afirmación, un hueco es la verdad). */
export const CRITERIA = {
    humanFidelity: { label: 'Fidelidad humana', source: 'vision' },
    facePreservation: { label: 'Preservación de rostros', source: 'vision' },
    instructionFollowing: { label: 'Seguimiento de instrucciones', source: 'measured' },
    photoIntegration: { label: 'Integración de la fotografía', source: 'votes' },
    composition: { label: 'Calidad compositiva', source: 'votes' },
    noInvented: { label: 'Ausencia de elementos inventados', source: 'vision' },
    technical: { label: 'Calidad técnica', source: 'measured' },
    latency: { label: 'Latencia', source: 'measured' },
    cost: { label: 'Costo estimado', source: 'declared' },
};
export const CRITERIA_IDS = Object.keys(CRITERIA);

export const normalizeWeights = (raw) => {
    const w = { ...DEFAULT_WEIGHTS };
    if (raw && typeof raw === 'object') {
        for (const k of CRITERIA_IDS) {
            const n = Number(raw[k]);
            if (Number.isFinite(n) && n >= 0 && n <= 100) w[k] = n;
        }
    }
    // Todo en cero no es una ponderación, es apagar el benchmark sin decirlo.
    const total = CRITERIA_IDS.reduce((a, k) => a + w[k], 0);
    return total > 0 ? w : { ...DEFAULT_WEIGHTS };
};

/** Las fotografías representativas que un benchmark serio necesita (req. 5).
 *  Es una GUÍA para quien arma el juego de pruebas, no un requisito duro: el
 *  panel la enseña y con menos fotos el benchmark corre igual y lo dice. */
export const BENCH_PHOTO_HINTS = [
    'grupo grande', 'grupo pequeño', 'horizontal', 'vertical', 'oscura', 'clara',
    'personas muy juntas', 'personas separadas', 'interior', 'exterior',
    'distintos tonos de piel', 'baja resolución',
];
export const MAX_BENCH_PHOTOS = 8;
export const MAX_BENCH_MODELS = 4;

// ─── La puntuación de UN resultado ─────────────────────────────────────
//
// Recibe lo YA MEDIDO por la validación del módulo —las mismas mediciones que
// juzgan una pieza de producción: no hay un segundo criterio de calidad— y lo
// convierte en subnotas 0-10 por criterio. `null` = no se pudo medir.

const clamp10 = (n) => Math.max(0, Math.min(10, n));

export const autoScoresFor = ({ measurements = {}, preservation = null, latencyMs = null, credits = null, minCredits = null } = {}) => {
    const s = {};

    // Seguimiento de instrucciones: fondo blanco + franja del texto libre,
    // que son exactamente las dos cosas que el prompt exige medibles.
    const { meanLuma = null, whiteShare = null, zoneStdDev = null, zoneLuma = null } = measurements;
    if (meanLuma !== null && whiteShare !== null) {
        let nota = 10;
        if (meanLuma < 205 || whiteShare < 0.35) nota = 2;
        else nota -= Math.max(0, (235 - meanLuma) / 10);
        if (zoneStdDev !== null && (zoneStdDev > 58 || (zoneLuma !== null && zoneLuma < 175))) nota = Math.min(nota, 3);
        s.instructionFollowing = clamp10(Math.round(nota * 10) / 10);
    } else s.instructionFollowing = null;

    // Técnica: formato y resolución de lo entregado.
    const { width = null, height = null } = measurements;
    if (width && height) {
        let nota = 10;
        const ratio = width / height;
        if (Math.abs(ratio - 1) > 0.04) nota -= 4;
        if (Math.min(width, height) < 1024) nota -= 3;
        s.technical = clamp10(nota);
    } else s.technical = null;

    // Las tres de visión salen del MISMO control de preservación de
    // producción. `unavailable` es null, no un tipo de «bien».
    if (preservation && preservation.state && preservation.state !== 'unavailable') {
        if (preservation.use) {
            s.humanFidelity = preservation.cropped ? 7 : 9;
            s.facePreservation = 9;
            s.noInvented = 10;
        } else {
            s.humanFidelity = 2;
            s.facePreservation = 2;
            s.noInvented = /persona|people|sujeto|añad|invent/i.test(preservation.reason || '') ? 0 : 3;
        }
    } else {
        s.humanFidelity = null;
        s.facePreservation = null;
        s.noInvented = null;
    }

    // Lo que sólo un ojo humano puede juzgar queda para los votos.
    s.photoIntegration = null;
    s.composition = null;

    s.latency = latencyMs === null ? null
        : latencyMs <= 30_000 ? 10 : latencyMs <= 60_000 ? 7 : latencyMs <= 100_000 ? 4 : 2;

    // Costo RELATIVO al más barato del propio benchmark: un número absoluto no
    // compara nada. Es el medidor propio, no el saldo del proveedor.
    s.cost = (credits && minCredits) ? clamp10(Math.round((minCredits / credits) * 100) / 10) : null;

    return s;
};

/** El voto humano de un resultado, como nota. Complementa: cubre lo que la
 *  máquina no mide y, si la visión no contestó, también la fidelidad. */
export const VOTE_SCORE = { star: 10, up: 8, down: 2 };

export const applyVote = (scores, vote) => {
    const v = VOTE_SCORE[vote];
    if (v === undefined) return { ...scores };
    const out = { ...scores, photoIntegration: v, composition: v };
    if (out.humanFidelity === null) out.humanFidelity = v;
    if (out.facePreservation === null) out.facePreservation = v;
    return out;
};

/**
 * La nota total de un resultado: media ponderada SOBRE LO MEDIDO, con los
 * pesos renormalizados a lo que hay. Promediar los nulos como ceros hundiría
 * a un modelo por lo que no se pudo mirar; ignorarlos sin renormalizar
 * inflaría al que menos se midió. Y lo no medido SE DEVUELVE con nombre.
 */
export const totalScore = (scores, weights = DEFAULT_WEIGHTS) => {
    const w = normalizeWeights(weights);
    let suma = 0, peso = 0;
    const unmeasured = [];
    for (const k of CRITERIA_IDS) {
        const v = scores?.[k];
        if (v === null || v === undefined) { unmeasured.push(k); continue; }
        suma += v * w[k];
        peso += w[k];
    }
    if (!peso) return { total: null, unmeasured };
    return { total: Math.round((suma / peso) * 10) / 10, unmeasured };
};

/**
 * El recomendado de un benchmark. Por modelo: la media de sus resultados
 * listos; un modelo con más fallos que éxitos queda DESCALIFICADO por
 * inestable —la estabilidad es un criterio del pedido, no una nota más—. El
 * desempate es el ORDEN DEL CATÁLOGO, estable a propósito: dos corridas del
 * mismo benchmark no pueden recomendar modelos distintos.
 */
export const recommendModel = (results = [], weights = DEFAULT_WEIGHTS, engineConfig = {}) => {
    const cat = catalogFor(engineConfig);
    const orden = new Map(cat.map((m, i) => [m.id, i]));
    const porModelo = new Map();
    for (const r of results) {
        if (!porModelo.has(r.model)) porModelo.set(r.model, { model: r.model, ready: [], failed: 0, latencias: [], unmeasured: new Set() });
        const g = porModelo.get(r.model);
        if (r.status === 'ready' && r.scores) {
            const t = totalScore(applyVote(r.scores, r.vote), weights);
            if (t.total !== null) { g.ready.push(t.total); t.unmeasured.forEach(u => g.unmeasured.add(u)); }
            if (Number.isFinite(r.latencyMs)) g.latencias.push(r.latencyMs);
        } else if (r.status === 'failed') g.failed++;
    }
    const tabla = [...porModelo.values()].map(g => ({
        model: g.model,
        score: g.ready.length ? Math.round((g.ready.reduce((a, b) => a + b, 0) / g.ready.length) * 10) / 10 : null,
        readyCount: g.ready.length,
        failedCount: g.failed,
        errorRate: (g.ready.length + g.failed) ? Math.round((g.failed / (g.ready.length + g.failed)) * 100) / 100 : null,
        avgLatencyMs: g.latencias.length ? Math.round(g.latencias.reduce((a, b) => a + b, 0) / g.latencias.length) : null,
        unmeasured: [...g.unmeasured],
        disqualified: g.failed > g.ready.length,
    })).sort((a, b) => (orden.get(a.model) ?? 99) - (orden.get(b.model) ?? 99));

    const candidatos = tabla.filter(t => !t.disqualified && t.score !== null);
    let mejor = null;
    for (const t of candidatos) {
        if (!mejor || t.score > mejor.score) mejor = t;   // empate → gana el primero (orden del catálogo)
    }
    return { recommended: mejor ? mejor.model : null, table: tabla };
};

// ─── El sello por generación ───────────────────────────────────────────
//
// Requisito 21: cada pieza registra con qué se generó, para reproducir y
// auditar. `promptVersion` viene del spec del prompt —al tocar las cláusulas
// hay que subirlo—; `presetVersion` es la huella de los parámetros del modelo.
export const engineStampFor = ({ model, engineConfig = {}, fallbackUsed = false } = {}) => {
    const m = modelById(model, engineConfig);
    return {
        provider: ENGINE_PROVIDER,
        model: model || DEFAULT_MODEL_ID,
        modelKey: m?.key || null,
        creditsEstimated: m?.creditsEstimated ?? null,
        promptVersion: PROMPT_VERSION,
        presetVersion: presetVersionFor(m),
        fallbackUsed: !!fallbackUsed,
    };
};

/** La huella del preset de UN modelo. Cada modelo tiene el suyo —mezclar
 *  parámetros entre modelos es mezclar semánticas distintas (req. 16)— y
 *  cambia sólo si cambian sus parámetros reales. */
export const presetVersionFor = (m) => {
    if (!m) return null;
    const material = JSON.stringify([m.id, m.timeoutMs, m.creditsEstimated, m.capabilities]);
    let h = 0x811c9dc5;
    for (let i = 0; i < material.length; i++) { h ^= material.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h.toString(16).padStart(8, '0');
};

export default {
    ENGINE_PROVIDER, MODEL_CATALOG, DEFAULT_MODEL_ID, eligibility,
    MAX_CUSTOM_MODELS, normalizeCustomModel, catalogFor, modelById,
    ENGINE_MODES, normalizeEngineConfig, resolveProduction,
    classifyProviderError, shouldFallback,
    DEFAULT_WEIGHTS, CRITERIA, CRITERIA_IDS, normalizeWeights,
    BENCH_PHOTO_HINTS, MAX_BENCH_PHOTOS, MAX_BENCH_MODELS,
    autoScoresFor, VOTE_SCORE, applyVote, totalScore, recommendModel,
    engineStampFor, presetVersionFor,
};
