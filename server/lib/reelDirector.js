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
    TARGET_TOTAL_SEC
} from './reelSpec.js';
import { MIN_SCENE_COUNT, MAX_SCENE_COUNT } from './reelPresets.js';
import { generateCopy } from '../services/copywritingService.js';

// ─── Análisis de una imagen ────────────────────────────────────────────────

const ANALYSIS_SYSTEM = `Eres un director de fotografía publicitaria. Miras UNA fotografía y describes qué contiene y qué movimiento admite, para que un modelo de imagen-a-video la anime sin reinterpretarla.

Respondes SIEMPRE con un único objeto JSON válido, sin texto alrededor y sin bloques de código, con exactamente estas claves:

{
  "summary": "una frase en español, máximo 15 palabras, de qué se ve",
  "subject": "people" | "product" | "food" | "nature" | "venue" | "document" | "abstract",
  "hasPeople": boolean,
  "personCount": 0,
  "peopleDensity": "none" | "sparse" | "dense",
  "occludedPeople": boolean,
  "subjects": ["una descripción corta EN INGLÉS por persona visible, máximo 8"],
  "hasBrand": boolean,
  "brandRegions": [{ "label": "qué es", "x": 0.0, "y": 0.0, "w": 0.0, "h": 0.0 }],
  "hasText": boolean,
  "hasFoodOrLiquid": boolean,
  "hasNature": boolean,
  "inventory": ["los elementos fijos principales de la escena, EN INGLÉS, máximo 6"],
  "shotSize": "wide" | "medium" | "close",
  "energy": 1..5,
  "narrativeRole": "opening" | "development" | "closing",
  "weight": 0.5..1.5,
  "motionHint": "una frase EN INGLÉS describiendo qué hacen las PERSONAS de esta foto concreta durante los próximos segundos",
  "suggestedStyle": "<id de estilo>",
  "riskNotes": ["avisos en español sobre qué es delicado de animar acá"]
}

Reglas:
- "personCount" es cuántas personas se ven, contando también las que aparecen parcialmente (media cara detrás de un hombro, alguien cortado por el borde, alguien de espaldas al fondo). Cuenta con cuidado: este número es el censo de la escena. 0 si no hay ninguna.
- "peopleDensity": "none" sin personas; "sparse" si están separadas y cada una se ve entera; "dense" si se solapan, se tocan los hombros o hay un grupo apretado.
- "occludedPeople" es true si alguna persona está parcialmente tapada por otra, por un objeto o por el borde del encuadre. Es el dato más delicado: lo que la fotografía oculta es lo que un modelo generativo tiende a completar inventando.
- "subjects": una descripción corta y distintiva por persona, en inglés, en el orden en que se leen de izquierda a derecha, para poder identificarlas sin ambigüedad: "the woman in the red vest on the left", "the man in the blue shirt behind her". Máximo 8; si hay más personas, describe las 8 más visibles. Lista vacía si no hay personas.
- "hasBrand" es true si hay logotipos, marcas, uniformes institucionales o packaging identificable.
- "brandRegions" es DÓNDE está cada logotipo, emblema, escudo o texto institucional que se vea, en coordenadas NORMALIZADAS de 0 a 1 sobre la fotografía completa: "x" e "y" son la esquina superior izquierda, "w" y "h" el ancho y el alto. Incluye los estampados en camisetas y chaquetas (también los de la espalda), los de gorras, las credenciales, los pendones y el material impreso. Sé generoso con el recuadro: es mejor que sobre un poco de tela alrededor a que se corte una letra. Máximo 6, las más grandes y legibles. Lista vacía si no hay ninguno.
- "hasText" es true si hay texto legible de cualquier tipo.
- "inventory" es el CENSO DE COSAS de la escena: los elementos fijos principales que un video de este lugar tendría que conservar — edificios, árboles, vehículos, señales, mobiliario, escombros, estructuras. En inglés, cada uno con su posición aproximada: "a collapsed two-storey building on the right", "a large tree in the centre", "an orange truck behind". Máximo 6, los más notorios. NO incluyas a las personas (van en "subjects"). Lista vacía sólo si la escena es abstracta.
- "narrativeRole": "opening" para la toma más abierta o contextual, "closing" para la que cierra o lleva la marca.
- "weight" es cuánto tiempo merece la escena: 1.0 es lo normal, 1.4 si tiene mucho que mostrar, 0.7 si es simple.
- "motionHint" es la instrucción específica de ESTA foto y es lo más importante que devuelves: describe en inglés qué continúan haciendo las personas que aparecen —la acción concreta que ya están realizando, hacia dónde miran, qué hacen sus manos, con quién interactúan—. Escríbelo como la continuación natural del instante fotografiado: "the two women keep sorting the boxes while the man beside them looks over and says something". La cámara está fija: describe lo que hace la gente, nunca lo que hace el objetivo. Y describe únicamente lo que YA está en la fotografía — si algo no se ve en ella, no existe en el plano. Si no hay personas, di qué se mueve del entorno: tela, hojas, banderas, agua.
- "riskNotes" en español: qué podría deformarse (rostros de perfil, texto pequeño, manos, logotipos finos). Lista vacía si no hay riesgo.`;

// El director elige sólo entre estilos que ANIMAN. `fotografico` no entra
// (v4.673): es la vía sin motor generativo, y dejarla en la lista hacía que el
// modelo la eligiera por su cuenta — el Reel salía con una foto quieta y un
// paneo, que es justo lo contrario de lo que se le pide al módulo. Se reserva
// para cuando la elige el usuario a propósito o para el respaldo automático
// tras un fallo de fidelidad.
const STYLE_IDS = Object.keys(MOTION_STYLES).filter(id => !MOTION_STYLES[id].engineless);

// `generateCopy` devuelve { content, raw, provider, model }, NO una cadena.
// Tratarlo como texto da `"[object Object]"`, que no parsea nunca: el análisis
// caía siempre al criterio por defecto y el módulo lo tapaba con su fallback
// —"No se pudo analizar la imagen" en las tres escenas—. Era un fallo real
// escondido por una degradación que funcionaba. Se lee `.content` acá, en un
// solo sitio, para que no vuelva a repetirse por copia.
const contentOf = (result) => {
    if (result == null) return '';
    if (typeof result === 'string') return result;
    return typeof result.content === 'string' ? result.content : '';
};

// Extrae el primer objeto JSON de una respuesta. Los modelos a veces envuelven
// el JSON en ```json aunque se les pida lo contrario.
const parseJsonObject = (result) => {
    const text = contentOf(result);
    if (!text) return null;
    const cleaned = text.replace(/```json\s*|```/g, '').trim();
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
    // Censo de la escena (v4.705). `personCount` es el número contra el que se
    // contrasta el clip: si en el vídeo hay más gente que acá, el motor inventó
    // un sujeto. Se acota a 40 porque por encima de eso ningún modelo de visión
    // cuenta con fiabilidad y la comprobación se hace por otra vía (comparando
    // las dos mitades de la composición, no contra este número).
    personCount: Math.round(clampNum(raw?.personCount, 0, 40, bool(raw?.hasPeople) ? 1 : 0)),
    peopleDensity: ['none', 'sparse', 'dense'].includes(raw?.peopleDensity)
        ? raw.peopleDensity : (bool(raw?.hasPeople) ? 'sparse' : 'none'),
    occludedPeople: bool(raw?.occludedPeople),
    subjects: Array.isArray(raw?.subjects)
        ? raw.subjects.filter(s => typeof s === 'string' && s.trim()).slice(0, 8).map(s => s.slice(0, 120))
        : [],
    hasBrand: bool(raw?.hasBrand),
    // Dónde vive cada marca, en coordenadas normalizadas (v4.715). Es lo que
    // permite MIRAR el logotipo de cerca en el control de fidelidad: la
    // comparación de escena completa lo reduce tres veces y a ese tamaño no se
    // lee, que es exactamente por qué una escena con el logo destrozado pasaba
    // con la marca «sin alterar».
    brandRegions: Array.isArray(raw?.brandRegions)
        ? raw.brandRegions
            .map(r => ({
                label: String(r?.label || 'Marca').slice(0, 60),
                x: clampNum(r?.x, 0, 1, null), y: clampNum(r?.y, 0, 1, null),
                w: clampNum(r?.w, 0, 1, null), h: clampNum(r?.h, 0, 1, null)
            }))
            // Un recuadro sin medidas o degenerado no sirve para recortar nada.
            .filter(r => r.x != null && r.y != null && r.w > 0.005 && r.h > 0.005)
            .slice(0, 6)
        : [],
    hasText: bool(raw?.hasText),
    hasFoodOrLiquid: bool(raw?.hasFoodOrLiquid),
    hasNature: bool(raw?.hasNature),
    // El censo de COSAS (v4.785). Hasta ahora el prompt sólo fijaba marca,
    // texto, personas y naturaleza: en un plano de escombros —sin nada de eso—
    // el modelo podía quitar un árbol o reordenar un edificio sin contradecir
    // ninguna instrucción. El inventario nombra lo que hay para poder fijarlo.
    inventory: Array.isArray(raw?.inventory)
        ? raw.inventory.filter(s => typeof s === 'string' && s.trim()).slice(0, 6).map(s => s.trim().slice(0, 100))
        : [],
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
    personCount: 0, peopleDensity: 'none', occludedPeople: false, subjects: [],
    brandRegions: [],
    hasFoodOrLiquid: false, hasNature: false, inventory: [],
    shotSize: 'medium', energy: 3, narrativeRole: 'development', weight: 1,
    motionHint: null, suggestedStyle: null,
    riskNotes: reason ? [`No se pudo analizar esta imagen: ${reason}`] : [],
    failed: true
});

// Analiza las tres imágenes EN PARALELO. Es lo que mantiene el paso dentro del
// presupuesto de la función: tres llamadas de visión en serie rondarían los 30 s
// y el tope de Vercel es 120 s para todo el request.
export const analyzeImages = async (images, { provider = null, usage = null } = {}) => {
    const results = await Promise.all(
        images.map(async (img, index) => {
            const startedAt = Date.now();
            try {
                const result = await generateCopy({
                    ...(provider ? { provider } : {}),
                    system: ANALYSIS_SYSTEM,
                    userText: 'Analiza esta fotografía y devuelve únicamente el JSON.',
                    imageUrl: img.url,
                    temperature: 0.2,
                    maxTokens: 700,
                    jsonMode: true
                });
                // El consumo se ACUMULA en el array que pasa quien llama, en vez
                // de escribirse acá: cuando el director corre, el proyecto
                // todavía no existe en la base y no habría a qué asociarlo.
                if (usage) usage.push({
                    operation: 'director.analyze', target: `Foto ${index + 1}`,
                    model: result?.model || null, raw: result?.raw || null,
                    ms: Date.now() - startedAt, status: 'ok'
                });
                const parsed = parseJsonObject(result);
                if (!parsed) return neutralAnalysis(index, 'la respuesta no vino en JSON');
                return sanitizeAnalysis(parsed, index);
            } catch (e) {
                console.error(`[REEL] análisis de la imagen ${index} falló:`, e.message);
                if (usage) usage.push({
                    operation: 'director.analyze', target: `Foto ${index + 1}`,
                    ms: Date.now() - startedAt, status: 'error', detail: e.message
                });
                return neutralAnalysis(index, e.message);
            }
        })
    );
    return results;
};

// ─── Dirección del conjunto ────────────────────────────────────────────────

// El sistema se construye con la CANTIDAD de fotos, que desde v4.783 va de 3 a
// 5. Estaba escrita a mano —«TRES fotografías», «unos 15 segundos», «Los tres,
// sin repetir»— y con cuatro fotos el modelo devolvía órdenes de tres: el
// `sanitizeDirection` los descartaba por inválidos y el Reel salía siempre con
// el criterio por defecto, sin que nada avisara. Un prompt que miente sobre la
// entrada no da un error, da una degradación silenciosa.
const directionSystem = (count, totalSec) => `Eres un director de montaje publicitario. Recibes el análisis de ${count} fotografías y construyes con ellas una pieza vertical de unos ${Math.round(totalSec)} segundos con estructura publicitaria: apertura que sitúa, desarrollo que muestra, cierre que deja la marca.

Respondes SIEMPRE con un único objeto JSON válido, sin texto alrededor y sin bloques de código:

{
  "order": [${Array.from({ length: count }, (_, i) => i).join(', ')}],
  "scenes": [
    { "sourceIndex": 0, "style": "<id>", "weight": 0.5..1.5, "transitionOut": "<id>", "note": "por qué, en español, máximo 12 palabras" }
  ],
  "musicStyle": "<id>",
  "energy": 1..5,
  "rationale": "dos frases en español explicando la decisión de montaje"
}

- "order" son los índices de las fotos originales en el orden final. Los ${count}, sin repetir y sin saltarse ninguno.
- "scenes" va EN EL ORDEN FINAL y tiene ${count} elementos; "sourceIndex" apunta a la foto original.
- "transitionOut" de la última escena describe cómo cierra la pieza.
- Elegí el ritmo según el contenido: más energía pide transiciones cortas y estilos con más movimiento.`;

const buildDirectionPrompt = (analyses, { motionStyle, transition, musicStyle, context = null, narrativeRoles = null }) => {
    const lines = analyses.map((a, i) => (
        `Foto ${i}: ${a.summary}. tipo=${a.subject}, plano=${a.shotSize}, energía=${a.energy}, ` +
        `rol sugerido=${a.narrativeRole}, personas=${a.hasPeople}, marca=${a.hasBrand}, texto=${a.hasText}, ` +
        `comida/líquido=${a.hasFoodOrLiquid}, naturaleza=${a.hasNature}` +
        (a.riskNotes.length ? `. Cuidados: ${a.riskNotes.join('; ')}` : '')
    ));

    const constraints = [];
    if (motionStyle !== AUTO_MOTION_STYLE) {
        constraints.push(`El usuario fijó el estilo de animación "${motionStyle}": usalo en todas las escenas.`);
    }
    if (transition !== AUTO_TRANSITION) {
        constraints.push(`El usuario fijó la transición "${transition}": usala entre todas las escenas.`);
    }
    if (musicStyle !== AUTO_MUSIC_STYLE) {
        constraints.push(`El usuario fijó el estilo musical "${musicStyle}": respetalo.`);
    }

    // ── Estructura narrativa declarada (v4.783) ──
    //
    // Cuando el preset la trae, cada POSICIÓN del montaje tiene una función
    // asignada de antemano, y lo que decide el director es QUÉ FOTO va en cada
    // una. Así el orden deja de ser una preferencia estética y pasa a ser una
    // asignación: la foto que mejor muestre el contexto abre, la que muestre a
    // las personas va segunda.
    //
    // Es lo que impide que cinco fotos den «tres escenas más dos de relleno»:
    // cada posición tiene algo distinto que contar y el director tiene que
    // encontrar la foto que lo cuente.
    const narrative = Array.isArray(narrativeRoles) && narrativeRoles.some(r => r.id !== 'libre')
        ? [
            '',
            'ESTRUCTURA NARRATIVA OBLIGATORIA. Cada posición del montaje tiene una función asignada:',
            ...narrativeRoles.map(r => `  Posición ${r.index + 1} — ${r.label}: ${r.brief}`),
            'Tu trabajo es decidir QUÉ FOTO va en cada posición: elegí para cada una la que mejor cumpla esa función. El orden que devuelvas ES esa asignación.',
            'Si ninguna foto encaja del todo en una posición, poné la que más se acerque y explicalo en su "note". No dejes ninguna posición vacía ni repitas una foto.'
        ].join('\n')
        : '';

    return [
        // El contexto estratégico va PRIMERO: un Reel de "Recaudación de fondos"
        // sobre "Agua y Saneamiento" se monta distinto que uno "Estándar" de
        // "Impacto General", y esa decisión es del conjunto, no de una foto.
        context ? `Tipo de publicación: ${context.typeLabel} — tono ${context.tone}, foco ${context.focus}.` : '',
        context ? `Área de enfoque Rotary: ${context.areaDescription}.` : '',
        narrative,
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
    context = null,
    provider = null,
    narrativeRoles = null,
    totalSec = TARGET_TOTAL_SEC
} = {}) => {
    const prefs = { motionStyle, transition, musicStyle, context, narrativeRoles };

    // Si el usuario fijó las tres cosas, el modelo sólo decidiría el orden y los
    // pesos. No vale una llamada: el criterio propio hace lo mismo.
    //
    // SALVO que haya estructura narrativa (v4.783): ahí el orden NO es una
    // preferencia estética sino la asignación de cada foto a su función, y eso
    // el criterio propio no lo sabe hacer —ordena por plano abierto y marca, que
    // no dice nada sobre cuál foto muestra el impacto humano—. Con estructura
    // declarada la llamada se hace igual, porque es justamente lo que se le
    // está pidiendo al modelo.
    const hasNarrative = Array.isArray(narrativeRoles) && narrativeRoles.some(r => r.id !== 'libre');
    if (!hasNarrative
        && motionStyle !== AUTO_MOTION_STYLE
        && transition !== AUTO_TRANSITION
        && musicStyle !== AUTO_MUSIC_STYLE) {
        return fallbackDirection(analyses, prefs);
    }

    try {
        const result = await generateCopy({
            ...(provider ? { provider } : {}),
            system: directionSystem(analyses.length, totalSec),
            userText: buildDirectionPrompt(analyses, prefs),
            temperature: 0.5,
            maxTokens: 900,
            jsonMode: true
        });
        const parsed = parseJsonObject(result);
        if (!parsed) {
            console.warn('[REEL] el director no devolvió JSON; se usó el criterio por defecto');
            return fallbackDirection(analyses, prefs);
        }
        return {
            ...sanitizeDirection(parsed, analyses, prefs),
            model: result?.model || null,
            rawResponse: result?.raw || null
        };
    } catch (e) {
        console.error('[REEL] dirección falló:', e.message);
        return fallbackDirection(analyses, prefs);
    }
};

// Análisis + dirección en un solo paso. Es lo que llama el controlador.
//
// La cantidad de fotos la valida el controlador contra el PRESET, que es quien
// sabe cuántas admite cada clase de pieza. Acá sólo se comprueba el rango
// absoluto del módulo: es la última red antes de gastar créditos de visión, y
// tiene que existir aunque quien llame se olvide de validar.
export const directReel = async (images, prefs = {}) => {
    if (!Array.isArray(images) || images.length < MIN_SCENE_COUNT || images.length > MAX_SCENE_COUNT) {
        throw new Error(`El Reel se arma con entre ${MIN_SCENE_COUNT} y ${MAX_SCENE_COUNT} imágenes.`);
    }
    // Recolector del consumo de esta fase. Se devuelve para que el controlador
    // lo registre en cuanto el proyecto tenga fila.
    const usage = [];
    const analyses = await analyzeImages(images, { ...prefs, usage });
    const planStartedAt = Date.now();
    const direction = await buildDirection(analyses, prefs);
    usage.push({
        operation: 'director.plan', target: 'Dirección del montaje',
        model: direction.model || null, raw: direction.rawResponse || null,
        ms: Date.now() - planStartedAt,
        status: direction.fromModel ? 'ok' : 'error',
        detail: direction.fromModel ? null : 'El modelo no dirigió; se usó el criterio propio.'
    });
    return {
        analyses,
        direction,
        usage,
        // Los avisos del análisis se juntan acá para mostrarlos una sola vez en
        // la UI, junto a los del formato y la resolución.
        warnings: analyses.flatMap((a, i) => a.riskNotes.map(n => `Foto ${i + 1}: ${n}`))
    };
};
