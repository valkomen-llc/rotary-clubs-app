// ════════════════════════════════════════════════════════════════════
// Generador de Outros IA — especificación compartida
// v4.646.0
//
// Única fuente de verdad de: formatos, motores de video de KIE.AI, estilos de
// cierre, catálogo de voces, presupuesto de locución y construcción del prompt.
// Su espejo en el navegador es `src/lib/outroSpec.ts` (mismos ids y etiquetas);
// el servidor valida siempre, aunque el navegador ya lo haya hecho.
//
// REGLA DURABLE (heredada del Generador de Publicaciones): el output del modelo
// NO se postprocesa. Lo que devuelve KIE se guarda tal cual. Por eso todo lo que
// queremos del video tiene que ir en el prompt y en los parámetros de la tarea,
// no en un paso posterior de composición.
// ════════════════════════════════════════════════════════════════════

// ─── Formatos de salida ────────────────────────────────────────────────────
// `master` es la resolución objetivo del archivo maestro. Es lo que le pedimos
// al proveedor; lo que realmente entrega se mide después (outroQuality.js) y se
// compara contra `minHeight`/`minWidth`.
export const OUTRO_FORMATS = {
    '9:16': { id: '9:16', label: 'Vertical · Reels e Historias', master: { width: 1080, height: 1920 }, minWidth: 1080, minHeight: 1920, isDefault: true },
    '1:1':  { id: '1:1',  label: 'Cuadrado · Feed',              master: { width: 1080, height: 1080 }, minWidth: 1080, minHeight: 1080 },
    '4:5':  { id: '4:5',  label: 'Vertical corto · Feed',        master: { width: 1080, height: 1350 }, minWidth: 1080, minHeight: 1350 },
    '16:9': { id: '16:9', label: 'Horizontal · YouTube y web',   master: { width: 1920, height: 1080 }, minWidth: 1920, minHeight: 1080 }
};
export const DEFAULT_FORMAT = '9:16';

// Duración objetivo del outro. El proveedor manda: cada motor declara las
// duraciones que soporta y elegimos la más cercana a este valor.
export const TARGET_DURATION_SEC = 5;

// ─── Motores de video (KIE.AI) ─────────────────────────────────────────────
//
// KIE.AI es una pasarela: el mismo endpoint /jobs/createTask sirve a todos los
// proveedores y sólo cambian el string `model` y el `input`. Por eso el id del
// modelo es configurable por variable de entorno: si KIE renombra o publica una
// versión nueva, se cambia el entorno y no el código.
//
// Un solo motor, a propósito (v4.646). Kling 2.6 tiene AUDIO NATIVO: con
// `sound: true` genera voz, ambiente y efectos dentro del mismo archivo, que es
// la única forma de entregar un MP4 con locución —la función corre en Vercel sin
// ffmpeg, así que no podemos mezclar una pista de TTS después—. Hasta v4.645 la
// voz apuntaba a `veo3_fast`, que NO es un modelo de /jobs/createTask sino del
// endpoint dedicado /veo/generate: esa ruta nunca pudo funcionar.
//
// `aspectRatios` lista los cuatro formatos porque el modelo no restringe
// ninguno: en image-to-video la relación de aspecto la hereda de la imagen de
// entrada. Por eso el formato pedido se contrasta contra la imagen ANTES de
// gastar créditos (inspectSourceImage) y contra el archivo entregado DESPUÉS
// (validateOutroFile); nunca se corrige recortando.
export const OUTRO_ENGINES = {
    kling: {
        id: 'kling',
        label: 'KIE.AI · Kling 2.6 — movimiento sutil',
        model: process.env.KIE_OUTRO_MODEL_SILENT || 'kling-2.6/image-to-video',
        nativeAudio: true,
        durations: [5, 10],
        aspectRatios: ['9:16', '1:1', '4:5', '16:9'],
        resolutions: ['1080p'],
        creditEstimate: 20,
        // El audio nativo se cobra aparte: el mismo clip con locución consume
        // más que el silencioso.
        creditEstimateAudio: 45,
        note: 'Duración exacta de 5 segundos. La voz en off se genera dentro del mismo archivo.'
    }
};
export const DEFAULT_ENGINE = 'kling';

// Modelo con el que se pide la voz. Es el mismo de siempre salvo que el entorno
// diga otra cosa: KIE_OUTRO_MODEL_AUDIO existe para corregir el id sin desplegar
// si KIE renombra el modelo.
export const audioModelFor = (engine) =>
    process.env.KIE_OUTRO_MODEL_AUDIO || engine.model;

export const isEngineAvailable = (engineId) =>
    Boolean(process.env.KIE_API_KEY) && Boolean(OUTRO_ENGINES[engineId]);

// ─── Estilos de outro ──────────────────────────────────────────────────────
// Cada estilo es una combinación de cámara, iluminación, ritmo y sonido. Los
// descriptores van en inglés porque son la entrada del modelo; las etiquetas en
// español porque son lo que ve el usuario.
export const OUTRO_STYLES = {
    institucional: {
        label: 'Institucional', description: 'Sobrio y oficial. Acercamiento lento y luz pareja.',
        camera: 'slow steady push-in, locked horizon', light: 'even neutral light with a gentle warm lift',
        rhythm: 'calm and constant', sound: 'soft ambient pad', mood: 'formal, trustworthy, institutional'
    },
    elegante: {
        label: 'Elegante', description: 'Movimiento suave, luz cálida y destellos finos.',
        camera: 'gentle parallax drift with a soft focus pull', light: 'warm golden sweep across the surface',
        rhythm: 'unhurried, flowing', sound: 'soft piano tail', mood: 'refined, warm, premium'
    },
    corporativo: {
        label: 'Corporativo', description: 'Preciso y limpio, ritmo firme.',
        camera: 'precise linear dolly-in', light: 'clean bright key light, crisp edges',
        rhythm: 'firm and measured', sound: 'clean corporate swell', mood: 'professional, confident, orderly'
    },
    moderno: {
        label: 'Moderno', description: 'Dinámico, contraste alto, entrada rápida.',
        camera: 'quick ease-in zoom settling into stillness', light: 'high-contrast light with a bright rim',
        rhythm: 'brisk, then settled', sound: 'short rhythmic accent', mood: 'fresh, energetic, contemporary'
    },
    inspiracional: {
        label: 'Inspiracional', description: 'Apertura luminosa y ascendente.',
        camera: 'slow rising crane-like lift', light: 'blooming light growing from the centre outwards',
        rhythm: 'building, uplifting', sound: 'rising strings', mood: 'hopeful, human, uplifting'
    },
    tecnologico: {
        label: 'Tecnológico', description: 'Luz fría, partículas finas, precisión digital.',
        camera: 'smooth digital glide with a subtle depth shift', light: 'cool directional light with fine light particles',
        rhythm: 'precise, modern', sound: 'subtle digital shimmer', mood: 'technical, precise, forward-looking'
    },
    ceremonial: {
        label: 'Ceremonial', description: 'Solemne, apertura amplia y luz dorada.',
        camera: 'wide reveal easing into a slow hold', light: 'golden ceremonial light with soft flares',
        rhythm: 'solemn, deliberate', sound: 'orchestral tail', mood: 'ceremonial, dignified, celebratory'
    },
    minimalista: {
        label: 'Minimalista', description: 'Casi quieto. Aparición progresiva y nada más.',
        camera: 'almost static, barely perceptible drift', light: 'flat soft light, no highlights',
        rhythm: 'still and quiet', sound: 'near silence', mood: 'clean, quiet, minimal'
    }
};
export const DEFAULT_STYLE = 'institucional';

// ─── Voz en off ────────────────────────────────────────────────────────────
// La voz se pide al modelo por descripción — es lo que entiende un motor de
// audio nativo. No hay un selector de "voice id" porque el proveedor no expone
// un catálogo estable a través de la pasarela.
export const VOICE_LANGUAGES = {
    'es-CO': { label: 'Español · Colombia',   accent: 'neutral Colombian Spanish', wordsPerSecond: 2.5 },
    'es-MX': { label: 'Español · México',     accent: 'Mexican Spanish',           wordsPerSecond: 2.5 },
    'es-AR': { label: 'Español · Argentina',  accent: 'Rioplatense Spanish',       wordsPerSecond: 2.4 },
    'es-ES': { label: 'Español · España',     accent: 'Castilian Spanish',         wordsPerSecond: 2.6 },
    'es-419': { label: 'Español · Neutro LATAM', accent: 'neutral Latin-American Spanish', wordsPerSecond: 2.5 },
    'en-US': { label: 'Inglés · Estados Unidos', accent: 'American English',       wordsPerSecond: 2.7 },
    'en-GB': { label: 'Inglés · Reino Unido', accent: 'British English',           wordsPerSecond: 2.6 },
    'pt-BR': { label: 'Portugués · Brasil',   accent: 'Brazilian Portuguese',      wordsPerSecond: 2.5 },
    'fr-FR': { label: 'Francés · Francia',    accent: 'French',                    wordsPerSecond: 2.4 },
    'it-IT': { label: 'Italiano · Italia',    accent: 'Italian',                   wordsPerSecond: 2.5 }
};
export const DEFAULT_LANGUAGE = 'es-CO';

export const VOICE_GENDERS = {
    female: { label: 'Femenina', descriptor: 'female' },
    male:   { label: 'Masculina', descriptor: 'male' },
    neutral:{ label: 'Neutra',   descriptor: 'gender-neutral' }
};

export const VOICE_PACES = {
    slow:   { label: 'Pausada', descriptor: 'unhurried', factor: 0.85 },
    normal: { label: 'Normal',  descriptor: 'natural',   factor: 1 },
    fast:   { label: 'Ágil',    descriptor: 'brisk',     factor: 1.15 }
};

export const VOICE_TONES = {
    warm:         { label: 'Cálido',      descriptor: 'warm and welcoming' },
    institutional:{ label: 'Institucional', descriptor: 'composed and institutional' },
    inspiring:    { label: 'Inspirador',  descriptor: 'inspiring and hopeful' },
    solemn:       { label: 'Solemne',     descriptor: 'solemn and dignified' },
    energetic:    { label: 'Enérgico',    descriptor: 'energetic and bright' }
};

export const VOICE_VOLUMES = {
    soft:   { label: 'Suave',  descriptor: 'softly, low in the mix' },
    normal: { label: 'Normal', descriptor: 'at a clear, balanced level' },
    strong: { label: 'Fuerte', descriptor: 'strong and forward in the mix' }
};

export const DEFAULT_VOICE = {
    enabled: false,
    language: DEFAULT_LANGUAGE,
    gender: 'female',
    pace: 'normal',
    tone: 'institutional',
    volume: 'normal'
};

// Silencio de entrada y salida que dejamos alrededor de la locución para que no
// arranque pegada al primer fotograma ni quede cortada en el último.
const SPEECH_PADDING_SEC = 0.7;

// Cuántas palabras caben en el outro. `durationSec` es la duración real que va a
// tener el archivo (la del motor elegido), no los 5 segundos nominales.
export const computeSpeechBudget = ({ durationSec = TARGET_DURATION_SEC, language = DEFAULT_LANGUAGE, pace = 'normal' } = {}) => {
    const lang = VOICE_LANGUAGES[language] || VOICE_LANGUAGES[DEFAULT_LANGUAGE];
    const paceFactor = (VOICE_PACES[pace] || VOICE_PACES.normal).factor;
    const availableSec = Math.max(0, durationSec - SPEECH_PADDING_SEC);
    const maxWords = Math.max(1, Math.floor(availableSec * lang.wordsPerSecond * paceFactor));
    return {
        availableSec: Number(availableSec.toFixed(2)),
        wordsPerSecond: Number((lang.wordsPerSecond * paceFactor).toFixed(2)),
        maxWords,
        // Referencia aproximada para el contador de la UI (≈6 caracteres por palabra
        // más el espacio). El límite que manda es el de palabras.
        maxChars: maxWords * 7
    };
};

export const countWords = (text) => String(text || '').trim().split(/\s+/).filter(Boolean).length;

// Verifica el texto contra el presupuesto. `fits:false` es lo que dispara el
// aviso y la oferta de resumen con IA en la UI.
export const checkSpeechFit = (text, budgetInput) => {
    const budget = computeSpeechBudget(budgetInput);
    const words = countWords(text);
    return {
        ...budget,
        words,
        fits: words <= budget.maxWords,
        overflowWords: Math.max(0, words - budget.maxWords),
        estimatedSec: Number((words / budget.wordsPerSecond).toFixed(2))
    };
};

// ─── Resolución del motor ──────────────────────────────────────────────────
//
// Devuelve el motor que se va a usar y la lista de ajustes aplicados. Los
// ajustes NO son silenciosos: viajan a la UI y quedan guardados en la metadata
// del outro, para que nadie descubra después que pidió 4:5 y recibió 9:16.
export const resolveEngine = ({ engine, voiceEnabled = false, format = DEFAULT_FORMAT } = {}) => {
    const notes = [];

    let chosenId = engine && OUTRO_ENGINES[engine] ? engine : null;

    // La voz manda sobre el default: sin motor de audio nativo no hay locución.
    if (voiceEnabled) {
        if (!chosenId || !OUTRO_ENGINES[chosenId].nativeAudio) {
            const audioEngine = Object.values(OUTRO_ENGINES).find(e => e.nativeAudio);
            if (audioEngine) {
                if (chosenId) notes.push(`La voz en off requiere un motor con audio nativo: se usó ${audioEngine.label}.`);
                chosenId = audioEngine.id;
            } else {
                notes.push('Ningún motor con audio nativo disponible: el outro se generó sin locución.');
            }
        }
    }
    if (!chosenId) chosenId = DEFAULT_ENGINE;

    const selected = OUTRO_ENGINES[chosenId];

    // Formato: si el motor no soporta la relación pedida, caemos a la más cercana
    // en vez de recortar el video después (recortar = postprocesar = prohibido).
    let resolvedFormat = OUTRO_FORMATS[format] ? format : DEFAULT_FORMAT;
    if (!selected.aspectRatios.includes(resolvedFormat)) {
        const fallback = selected.aspectRatios.includes(DEFAULT_FORMAT) ? DEFAULT_FORMAT : selected.aspectRatios[0];
        notes.push(`${selected.label} no genera en ${resolvedFormat}: el maestro se creó en ${fallback}.`);
        resolvedFormat = fallback;
    }

    // Duración: la más cercana a los 5 segundos entre las que soporta el motor.
    const durationSec = selected.durations.reduce(
        (best, d) => Math.abs(d - TARGET_DURATION_SEC) < Math.abs(best - TARGET_DURATION_SEC) ? d : best,
        selected.durations[0]
    );
    if (durationSec !== TARGET_DURATION_SEC) {
        notes.push(`${selected.label} entrega clips de ${durationSec}s; la locución se ajusta a esa duración.`);
    }

    // Resolución: siempre la mayor que soporte el motor (regla: archivo maestro
    // en la máxima calidad disponible; nunca se reescala hacia arriba después).
    const resolution = selected.resolutions.includes('4k') ? '4k' : selected.resolutions[selected.resolutions.length - 1];
    if (resolution !== '4k') {
        notes.push(`El proveedor entrega hasta ${resolution} para este modelo; el maestro queda en ${OUTRO_FORMATS[resolvedFormat].master.width}×${OUTRO_FORMATS[resolvedFormat].master.height}.`);
    }

    // Nada que anotar sobre la relación de aspecto: el modelo la hereda de la
    // imagen, y el aviso útil es el que la compara de verdad contra el formato
    // pedido (`inspectSourceImage`), no una advertencia genérica en cada outro.

    const withVoice = voiceEnabled && selected.nativeAudio;

    return {
        engine: selected,
        engineId: chosenId,
        // El modelo con voz puede diferir del silencioso si el entorno lo pide.
        model: withVoice ? audioModelFor(selected) : selected.model,
        creditEstimate: withVoice
            ? (selected.creditEstimateAudio || selected.creditEstimate)
            : selected.creditEstimate,
        format: resolvedFormat,
        durationSec,
        resolution,
        voiceEnabled: withVoice,
        notes
    };
};

// ─── Prompt ────────────────────────────────────────────────────────────────
//
// Corto y en positivo, a propósito. Aprendizaje del Generador de Publicaciones
// (ver CLAUDE.md): los prompts largos con listas de prohibiciones son
// contraproducentes — el modelo se obsesiona con lo prohibido. Aquí se describe
// lo que SÍ queremos: conservar la pieza y añadir movimiento.
export const buildOutroPrompt = ({
    style = DEFAULT_STYLE,
    durationSec = TARGET_DURATION_SEC,
    speech = null,
    voice = DEFAULT_VOICE,
    withAudio = false
} = {}) => {
    const s = OUTRO_STYLES[style] || OUTRO_STYLES[DEFAULT_STYLE];
    const parts = [
        `A ${durationSec}-second cinematic closing shot animated from the provided artwork.`,
        'The artwork stays exactly as delivered: same logo, same text, same colours, same layout, same proportions. Only motion and light are added.',
        `Camera: ${s.camera}. Lighting: ${s.light}. Pacing: ${s.rhythm}. Mood: ${s.mood}.`
    ];

    if (withAudio && speech) {
        const lang = VOICE_LANGUAGES[voice.language] || VOICE_LANGUAGES[DEFAULT_LANGUAGE];
        const gender = (VOICE_GENDERS[voice.gender] || VOICE_GENDERS.female).descriptor;
        const pace = (VOICE_PACES[voice.pace] || VOICE_PACES.normal).descriptor;
        const tone = (VOICE_TONES[voice.tone] || VOICE_TONES.institutional).descriptor;
        const volume = (VOICE_VOLUMES[voice.volume] || VOICE_VOLUMES.normal).descriptor;
        parts.push(
            `Audio: a single ${gender} voiceover in ${lang.accent}, ${tone}, ${pace}, speaking ${volume}, saying exactly: "${speech}".`,
            `The line finishes comfortably before the end of the ${durationSec} seconds. Music stays underneath the voice: ${s.sound}.`
        );
    } else {
        parts.push(`Audio: ${s.sound}, no speech.`);
    }

    return parts.join(' ');
};

// Nombre por defecto del outro, con la organización adelante para que la
// biblioteca sea legible sin abrir cada ficha.
export const buildOutroTitle = ({ organizationName, style, format }) => {
    const org = String(organizationName || '').trim();
    const styleLabel = (OUTRO_STYLES[style] || OUTRO_STYLES[DEFAULT_STYLE]).label;
    return `${org ? `${org} · ` : ''}Outro ${styleLabel} ${format}`;
};

// ─── Estados ───────────────────────────────────────────────────────────────
export const OUTRO_STATUSES = {
    pending:      { label: 'Pendiente',        terminal: false },
    generating:   { label: 'Generando',        terminal: false },
    rendering:    { label: 'Renderizando',     terminal: false },
    validating:   { label: 'Validando calidad', terminal: false },
    ready:        { label: 'Listo',            terminal: true },
    needs_review: { label: 'Requiere revisión', terminal: true },
    error:        { label: 'Error',            terminal: true }
};

export const MAX_AUTO_RETRIES = 2;
