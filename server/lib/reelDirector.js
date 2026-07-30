// ════════════════════════════════════════════════════════════════════
// Creador de Reels IA — dirección audiovisual
// v4.663.0
//
// Mira las tres fotografías ANTES de gastar un solo crédito de video y decide
// la pieza: en qué orden van, cuánto dura cada una, con qué se mueve la cámara,
// cómo se encadenan y qué música las acompaña.
//
// POR QUÉ ACÁ Y NO EN EL PROMPT DE CADA CLIP: un Reel no es tres clips pegados.
// El orden y el ritmo son decisiones sobre el CONJUNTO —abrir con la toma más
// abierta, cerrar con la que tiene la marca, acelerar si el contenido es
// deportivo— y no se pueden tomar mirando una foto por vez. Por eso el análisis
// es por imagen pero la dirección es una sola llamada con las tres a la vista.
//
// QUÉ APORTA AL PROMPT: `analysis` de cada escena viaja a `buildScenePrompt`,
// que lo usa para reforzar la conservación donde importa. Detectar que hay un
// logotipo es lo que hace que el prompt pida explícitamente que la tipografía y
// los colores queden intactos. Es la diferencia entre "no deformes nada" y una
// indicación que el modelo puede seguir.
//
// TOLERANCIA A FALLOS: si el proveedor de copy no responde, el módulo NO se
// cae. `fallbackDirection` arma una dirección razonable —orden original,
// duraciones parejas, estilo elegido por el usuario— y el Reel se genera igual.
// Un análisis fallido degrada la calidad del montaje; no lo impide.
// ════════════════════════════════════════════════════════════════════

import {
    MOTION_STYLES, DEFAULT_MOTION_STYLE, AUTO_MOTION_STYLE,
    TRANSITIONS, DEFAULT_TRANSITION, AUTO_TRANSITION,
    MUSIC_STYLES, DEFAULT_MUSIC_STYLE, AUTO_MUSIC_STYLE,
    SCENE_COUNT
} from './reelSpec.js';
import { generateCopy } from '../services/copywritingService.js';

// ─── Análisis de una imagen ────────────────────────────────────────────────

const ANALYSIS_SYSTEM = `Eres un director de fotografía publicitaria. Miras UNA fotografía y describes qué contiene y qué movimiento admite, para que un modelo de imagen-a-video la anime sin reinterpretarla.

Respondes SIEMPRE con un único objeto JSON válido, sin texto alrededor y sin bloques de código, con exactamente estas claves:

{
  "summary": "una frase en español, máximo 15 palabras, de qué se ve",
  "subject": "people" | "product" | "food" | "nature" | "venue" | "document" | "abstract",
  "hasPeople": boolean,
  "hasBrand": boolean,
  "hasText": boolean,
  "hasFoodOrLiquid": boolean,
  "hasNature": boolean,
  "shotSize": "wide" | "medium" | "close",
  "energy": 1..5,
  "narrativeRole": "opening" | "development" | "closing",
  "weight": 0.5..1.5,
  "motionHint": "una frase EN INGLÉS describiendo qué elemento concreto puede moverse en esta foto",
  "suggestedStyle": "<id de estilo>",
  "riskNotes": ["avisos en español sobre qué es delicado de animar acá"]
}

Reglas:
- "hasBrand" es true si hay logotipos, marcas, uniformes institucionales o packaging identificable.
- "hasText" es true si hay texto legible de cualquier tipo.
- "narrativeRole": "opening" para la toma más abierta o contextual, "closing" para la que cierra o lleva la marca.
- "weight" es cuánto tiempo merece la escena: 1.0 es lo normal, 1.4 si tiene mucho que mostrar, 0.7 si es simple.
- "motionHint" describe SÓLO lo que puede moverse sin alterar el contenido: vapor, agua, hojas, tela, luz, o el movimiento de cámara. En inglés porque alimenta el prompt del modelo.
- "riskNotes" en español: qué podría deformarse (rostros de perfil, texto pequeño, manos, logotipos finos). Lista vacía si no hay riesgo.`;

const STYLE_IDS = Object.keys(MOTION_STYLES);

// Extrae el primer objeto JSON de una respuesta. Los modelos a veces envuelven
// el JSON en ```json aunque se les pida lo contrario.
const parseJsonObject = (text) => {
    if (!text) return null;
    const cleaned = String(text).replace(/```json\s*|```/g, '').trim();
    try { return JSON.parse(cleaned); } catch { /* sigue */ }
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end <= start) return null;
    try { return JSON.parse(cleaned.slice(start, end + 1)); } catch { return null; }
};

const bool = (v) => v === true || v === 'true';
const clampNum = (v, min, max, dflt) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : dflt;
};

// Normaliza lo que devolvió el modelo contra los catálogos. Nunca se confía en
// la respuesta: un id de estilo inventado cae al default.
const sanitizeAnalysis = (raw, index) => ({
    index,
    summary: String(raw?.summary || '').slice(0, 160) || 'Escena sin descripción',
    subject: ['people', 'product', 'food', 'nature', 'venue', 'document', 'abstract'].includes(raw?.subject)
        ? raw.subject : 'abstract',
    hasPeople: bool(raw?.hasPeople),
    hasBrand: bool(raw?.hasBrand),
    hasText: bool(raw?.hasText),
    hasFoodOrLiquid: bool(raw?.hasFoodOrLiquid),
    hasNature: bool(raw?.hasNature),
    shotSize: ['wide', 'medium', 'close'].includes(raw?.shotSize) ? raw.shotSize : 'medium',
    energy: Math.round(clampNum(raw?.energy, 1, 5, 3)),
    narrativeRole: ['opening', 'development', 'closing'].includes(raw?.narrativeRole)
        ? raw.narrativeRole : 'development',
    weight: clampNum(raw?.weight, 0.5, 1.5, 1),
    motionHint: String(raw?.motionHint || '').slice(0, 200) || null,
    suggestedStyle: STYLE_IDS.includes(raw?.suggestedStyle) ? raw.suggestedStyle : null,
    riskNotes: Array.isArray(raw?.riskNotes)
        ? raw.riskNotes.filter(n => typeof n === 'string').slice(0, 4).map(n => n.slice(0, 200))
        : []
});

// Análisis por defecto cuando la visión falla para una imagen concreta. Es
// deliberadamente conservador: sin marca ni texto detectados, el prompt no
// añade refuerzos que podrían no corresponder, y el peso queda neutro.
const neutralAnalysis = (index, reason = null) => ({
    index,
    summary: 'No se pudo analizar la imagen',
    subject: 'abstract',
    hasPeople: false, hasBrand: false, hasText: false,
    hasFoodOrLiquid: false, hasNature: false,
    shotSize: 'medium', energy: 3, narrativeRole: 'development', weight: 1,
    motionHint: null, suggestedStyle: null,
    riskNotes: reason ? [`No se pudo analizar esta imagen: ${reason}`] : [],
    failed: true
});

// Analiza las tres imágenes EN PARALELO. Es lo que mantiene el paso dentro del
// presupuesto de la función: tres llamadas de visión en serie rondarían los 30 s
// y el tope de Vercel es 120 s para todo el request.
export const analyzeImages = async (images, { provider = null } = {}) => {
    const results = await Promise.all(
        images.map(async (img, index) => {
            try {
                const text = await generateCopy({
                    ...(provider ? { provider } : {}),
                    system: ANALYSIS_SYSTEM,
                    userText: 'Analiza esta fotografía y devuelve únicamente el JSON.',
                    imageUrl: img.url,
                    temperature: 0.2,
                    maxTokens: 700,
                    jsonMode: true
                });
                const parsed = parseJsonObject(text);
                if (!parsed) return neutralAnalysis(index, 'la respuesta no vino en JSON');
                return sanitizeAnalysis(parsed, index);
            } catch (e) {
                console.error(`[REEL] análisis de la imagen ${index} falló:`, e.message);
                return neutralAnalysis(index, e.message);
            }
        })
    );
    return results;
};

// ─── Dirección del conjunto ────────────────────────────────────────────────

const DIRECTION_SYSTEM = `Eres un director de montaje publicitario. Recibes el análisis de TRES fotografías y construyes con ellas una pieza vertical de unos 15 segundos con estructura publicitaria: apertura que sitúa, desarrollo que muestra, cierre que deja la marca.

Respondes SIEMPRE con un único objeto JSON válido, sin texto alrededor y sin bloques de código:

{
  "order": [i, j, k],
  "scenes": [
    { "sourceIndex": 0, "style": "<id>", "weight": 0.5..1.5, "transitionOut": "<id>", "note": "por qué, en español, máximo 12 palabras" }
  ],
  "musicStyle": "<id>",
  "energy": 1..5,
  "rationale": "dos frases en español explicando la decisión de montaje"
}

- "order" son los índices de las fotos originales en el orden final. Los tres, sin repetir.
- "scenes" va EN EL ORDEN FINAL y "sourceIndex" apunta a la foto original.
- "transitionOut" de la última escena describe cómo cierra la pieza.
- Elegí el ritmo según el contenido: más energía pide transiciones cortas y estilos con más movimiento.`;

const buildDirectionPrompt = (analyses, { motionStyle, transition, musicStyle }) => {
    const lines = analyses.map((a, i) => (
        `Foto ${i}: ${a.summary}. tipo=${a.subject}, plano=${a.shotSize}, energía=${a.energy}, ` +
        `rol sugerido=${a.narrativeRole}, personas=${a.hasPeople}, marca=${a.hasBrand}, texto=${a.hasText}, ` +
        `comida/líquido=${a.hasFoodOrLiquid}, naturaleza=${a.hasNature}` +
        (a.riskNotes.length ? `. Cuidados: ${a.riskNotes.join('; ')}` : '')
    ));

    const constraints = [];
    if (motionStyle !== AUTO_MOTION_STYLE) {
        constraints.push(`El usuario fijó el estilo de animación "${motionStyle}": usalo en las tres escenas.`);
    }
    if (transition !== AUTO_TRANSITION) {
        constraints.push(`El usuario fijó la transición "${transition}": usala entre todas las escenas.`);
    }
    if (musicStyle !== AUTO_MUSIC_STYLE) {
        constraints.push(`El usuario fijó el estilo musical "${musicStyle}": respetalo.`);
    }

    return [
        lines.join('\n'),
        '',
        `Estilos de animación disponibles: ${Object.entries(MOTION_STYLES).map(([id, s]) => `${id} (${s.description})`).join(', ')}.`,
        `Transiciones disponibles: ${Object.entries(TRANSITIONS).map(([id, t]) => `${id} (${t.description})`).join(', ')}.`,
        `Estilos musicales disponibles: ${Object.keys(MUSIC_STYLES).join(', ')}.`,
        constraints.length ? `\nRestricciones del usuario:\n${constraints.join('\n')}` : '',
        '\nDevolvé únicamente el JSON.'
    ].join('\n');
};

// Orden por defecto: la toma más abierta abre, la que lleva la marca cierra.
// Es el criterio de montaje más básico y funciona sin haber mirado nada.
const fallbackOrder = (analyses) => {
    const score = (a) => {
        if (a.narrativeRole === 'opening') return 0;
        if (a.narrativeRole === 'closing') return 2;
        return 1;
    };
    return analyses
        .map((a, i) => ({ i, s: score(a), open: a.shotSize === 'wide' ? 0 : 1, brand: a.hasBrand ? 1 : 0 }))
        .sort((x, y) => (x.s - y.s) || (x.open - y.open) || (x.brand - y.brand))
        .map(x => x.i);
};

// Dirección construida sin modelo. Se usa cuando la llamada falla o devuelve
// algo inservible: el Reel se genera igual, con criterio propio.
export const fallbackDirection = (analyses, { motionStyle, transition, musicStyle }) => {
    const order = fallbackOrder(analyses);
    const style = motionStyle !== AUTO_MOTION_STYLE ? motionStyle : DEFAULT_MOTION_STYLE;
    const trans = transition !== AUTO_TRANSITION ? transition : DEFAULT_TRANSITION;

    // La música por defecto se deduce del contenido dominante — es una regla
    // simple, pero mejor que poner siempre lo mismo.
    let music = musicStyle !== AUTO_MUSIC_STYLE ? musicStyle : DEFAULT_MUSIC_STYLE;
    if (musicStyle === AUTO_MUSIC_STYLE) {
        const subjects = analyses.map(a => a.subject);
        const avgEnergy = analyses.reduce((s, a) => s + a.energy, 0) / (analyses.length || 1);
        if (subjects.includes('food')) music = 'gastronomico';
        else if (subjects.includes('nature')) music = 'natural';
        else if (avgEnergy >= 4) music = 'energico';
        else if (analyses.some(a => a.hasPeople)) music = 'inspirador';
    }

    return {
        order,
        scenes: order.map((sourceIndex, position) => ({
            sourceIndex,
            style: (motionStyle !== AUTO_MOTION_STYLE)
                ? style
                : (analyses[sourceIndex]?.suggestedStyle || style),
            weight: analyses[sourceIndex]?.weight ?? 1,
            transitionOut: position === order.length - 1 ? 'fade' : trans,
            note: null
        })),
        musicStyle: music,
        energy: Math.round(analyses.reduce((s, a) => s + a.energy, 0) / (analyses.length || 1)) || 3,
        rationale: 'Montaje construido con el criterio por defecto: abre la toma más abierta y cierra la que lleva la marca.',
        fromModel: false
    };
};

const sanitizeDirection = (raw, analyses, prefs) => {
    const fallback = fallbackDirection(analyses, prefs);

    // El orden tiene que ser una permutación exacta de las tres fotos. Si el
    // modelo repite o se saltea un índice, se descarta entero y se usa el
    // criterio propio: un orden a medias es peor que ninguno.
    const order = Array.isArray(raw?.order) ? raw.order.map(Number) : null;
    const validOrder = order
        && order.length === analyses.length
        && new Set(order).size === analyses.length
        && order.every(i => Number.isInteger(i) && i >= 0 && i < analyses.length);
    const finalOrder = validOrder ? order : fallback.order;
    if (!validOrder && order) {
        console.warn('[REEL] el director devolvió un orden inválido; se usó el criterio por defecto');
    }

    const rawScenes = Array.isArray(raw?.scenes) ? raw.scenes : [];

    const scenes = finalOrder.map((sourceIndex, position) => {
        // La escena del modelo que corresponde a esta foto, por sourceIndex y no
        // por posición: si el modelo desordenó su propio array, esto lo salva.
        const proposed = rawScenes.find(s => Number(s?.sourceIndex) === sourceIndex) || rawScenes[position] || {};
        const fb = fallback.scenes[position];

        // Una preferencia explícita del usuario manda sobre el modelo. Es lo que
        // hace que elegir un estilo en la UI signifique algo.
        const style = prefs.motionStyle !== AUTO_MOTION_STYLE
            ? prefs.motionStyle
            : (MOTION_STYLES[proposed.style] ? proposed.style : fb.style);

        const transitionOut = prefs.transition !== AUTO_TRANSITION
            ? (position === finalOrder.length - 1 ? 'fade' : prefs.transition)
            : (TRANSITIONS[proposed.transitionOut] ? proposed.transitionOut : fb.transitionOut);

        return {
            sourceIndex,
            style,
            weight: clampNum(proposed.weight, 0.5, 1.5, fb.weight),
            transitionOut,
            note: typeof proposed.note === 'string' ? proposed.note.slice(0, 120) : null
        };
    });

    const musicStyle = prefs.musicStyle !== AUTO_MUSIC_STYLE
        ? prefs.musicStyle
        : (MUSIC_STYLES[raw?.musicStyle] ? raw.musicStyle : fallback.musicStyle);

    return {
        order: finalOrder,
        scenes,
        musicStyle,
        energy: Math.round(clampNum(raw?.energy, 1, 5, fallback.energy)),
        rationale: typeof raw?.rationale === 'string' ? raw.rationale.slice(0, 400) : fallback.rationale,
        fromModel: true
    };
};

// Construye la narrativa a partir de los análisis. Una sola llamada, de texto:
// las imágenes ya se miraron en `analyzeImages` y volver a mandarlas costaría
// tokens de visión sin aportar nada nuevo.
export const buildDirection = async (analyses, {
    motionStyle = AUTO_MOTION_STYLE,
    transition = AUTO_TRANSITION,
    musicStyle = AUTO_MUSIC_STYLE,
    provider = null
} = {}) => {
    const prefs = { motionStyle, transition, musicStyle };

    // Si el usuario fijó las tres cosas, el modelo sólo decidiría el orden y los
    // pesos. No vale una llamada: el criterio propio hace lo mismo.
    if (motionStyle !== AUTO_MOTION_STYLE && transition !== AUTO_TRANSITION && musicStyle !== AUTO_MUSIC_STYLE) {
        return fallbackDirection(analyses, prefs);
    }

    try {
        const text = await generateCopy({
            ...(provider ? { provider } : {}),
            system: DIRECTION_SYSTEM,
            userText: buildDirectionPrompt(analyses, prefs),
            temperature: 0.5,
            maxTokens: 900,
            jsonMode: true
        });
        const parsed = parseJsonObject(text);
        if (!parsed) {
            console.warn('[REEL] el director no devolvió JSON; se usó el criterio por defecto');
            return fallbackDirection(analyses, prefs);
        }
        return sanitizeDirection(parsed, analyses, prefs);
    } catch (e) {
        console.error('[REEL] dirección falló:', e.message);
        return fallbackDirection(analyses, prefs);
    }
};

// Análisis + dirección en un solo paso. Es lo que llama el controlador.
export const directReel = async (images, prefs = {}) => {
    if (!Array.isArray(images) || images.length !== SCENE_COUNT) {
        throw new Error(`El Reel se arma con exactamente ${SCENE_COUNT} imágenes.`);
    }
    const analyses = await analyzeImages(images, prefs);
    const direction = await buildDirection(analyses, prefs);
    return {
        analyses,
        direction,
        // Los avisos del análisis se juntan acá para mostrarlos una sola vez en
        // la UI, junto a los del formato y la resolución.
        warnings: analyses.flatMap((a, i) => a.riskNotes.map(n => `Foto ${i + 1}: ${n}`))
    };
};
