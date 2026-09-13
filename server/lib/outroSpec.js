// ════════════════════════════════════════════════════════════════════
// Generador de Outro IA — especificación compartida
// v4.1036.0 (modo MP4 importado; v4.1035.0 Motion Graphics; v4.647.0 el original)
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
    // ── Motor por defecto desde v4.1035: MOTION GRAPHICS DETERMINISTA ──
    //
    // La imagen no pasa por ningún modelo: ffmpeg la escala por fotograma
    // alrededor del centro hasta asentarla EXACTAMENTE en la composición
    // original, con un fundido de entrada y otro de salida. Los píxeles del
    // logotipo, la tipografía y los colores son los de la imagen. La voz, si
    // se pide, la sintetiza el TTS de la plataforma (`reelNarration.js`) y se
    // mezcla sin recodificar el video. Cero créditos de generación; la
    // duración es la que se pide, en pasos de medio segundo. El criterio vive
    // en `outroMotion.js` y el render en `outroMotionRender.js`.
    motion: {
        id: 'motion',
        label: 'Motion Graphics institucional — sin IA generativa',
        model: 'ffmpeg-motion',
        nativeAudio: false,
        ttsVoice: true,
        deterministic: true,
        durations: [3, 5, 7],
        customDuration: { min: 2, max: 15, step: 0.5 },
        aspectRatios: ['9:16', '1:1', '4:5', '16:9'],
        resolutions: ['1080p'],
        creditEstimate: 0,
        creditEstimateAudio: 0,
        note: 'La imagen se anima tal cual: el logotipo y los textos no se redibujan. Duración exacta, sin créditos de video.'
    },
    // ── IA generativa (KIE.AI · Kling) ──
    //
    // Se conserva como ALTERNATIVA expresa. Un modelo image-to-video redibuja
    // cada fotograma: da un fondo que fluye de verdad, a cambio del riesgo de
    // deformar el logotipo o el lema — por eso ya no es el default para una
    // pieza institucional. Con `sound: true` genera la voz dentro del archivo.
    kling: {
        id: 'kling',
        label: 'IA generativa · Kling 2.6 (KIE.AI)',
        model: process.env.KIE_OUTRO_MODEL_SILENT || 'kling-2.6/image-to-video',
        nativeAudio: true,
        ttsVoice: false,
        deterministic: false,
        durations: [5, 10],
        customDuration: null,
        aspectRatios: ['9:16', '1:1', '4:5', '16:9'],
        resolutions: ['1080p'],
        creditEstimate: 20,
        // El audio nativo se cobra aparte: el mismo clip con locución consume
        // más que el silencioso.
        creditEstimateAudio: 45,
        note: 'El modelo redibuja la imagen fotograma a fotograma: puede alterar el logotipo o el texto. Sólo 5 o 10 segundos.'
    },
    // ── MP4 importado (v4.1036): el archivo ES el maestro visual ──
    //
    // No es un motor de generación y NO se ofrece en el selector de motores:
    // está en el registro para que la ficha lo rotule y cobre con el mismo
    // catálogo. El video no pasa por ningún modelo —cero créditos de
    // generación, siempre—; la plataforma sólo procesa el AUDIO (voz por TTS,
    // música y mezcla con ducking) y, si hace falta, normaliza el códec para
    // que entre al montaje. Criterio en `outroImport.js`.
    imported: {
        id: 'imported',
        label: 'Video MP4 importado — el archivo es el maestro',
        model: 'imported-mp4',
        imported: true,
        nativeAudio: false,
        ttsVoice: true,
        deterministic: true,
        durations: [],
        customDuration: null,
        aspectRatios: ['9:16', '1:1', '4:5', '16:9'],
        resolutions: ['source'],
        creditEstimate: 0,
        creditEstimateAudio: 0,
        note: 'El MP4 que subís se conserva tal cual: sin IA, sin regenerar fotogramas. La plataforma sólo agrega voz, música y la mezcla.'
    }
};
export const DEFAULT_ENGINE = 'motion';

// ─── Presets de Motion Graphics ────────────────────────────────────────────
//
// Los cuatro estilos del motor determinista. Son DATOS: lo que los distingue
// es cuánto se acerca la imagen al arrancar (`startScale`, acotado por
// `outroMotion.MAX_START_SCALE`), con qué curva se asienta (`ease`), en qué
// fracción de la pieza queda quieta (`settleFraction`) y los fundidos. La
// cámara no se desplaza en ninguno (v4.647): sólo escala alrededor del
// centro, que conserva la composición.
export const MOTION_PRESETS = {
    institucional_elegante: {
        id: 'institucional_elegante',
        label: 'Institucional elegante',
        description: 'Aparición suave y un asentamiento apenas perceptible. La marca queda quieta el último tercio.',
        startScale: 1.035, ease: 3, settleFraction: 0.65,
        fadeInSec: 0.5, fadeOutSec: 0.5,
        isDefault: true
    },
    reveal_marca: {
        id: 'reveal_marca',
        label: 'Reveal de marca',
        description: 'Entra desde un plano algo más cerrado y se abre hasta la composición completa.',
        startScale: 1.06, ease: 4, settleFraction: 0.55,
        fadeInSec: 0.6, fadeOutSec: 0.5
    },
    movimiento_sutil: {
        id: 'movimiento_sutil',
        label: 'Movimiento sutil',
        description: 'Casi quieto: un respiro mínimo y sin fundidos. Para cerrar sobre otra escena sin negro.',
        startScale: 1.015, ease: 2, settleFraction: 0.8,
        fadeInSec: 0, fadeOutSec: 0
    },
    corporativo_dinamico: {
        id: 'corporativo_dinamico',
        label: 'Corporativo dinámico',
        description: 'Asentamiento más decidido al principio y una pausa larga sobre la marca.',
        startScale: 1.08, ease: 5, settleFraction: 0.4,
        fadeInSec: 0.3, fadeOutSec: 0.4
    }
};
export const DEFAULT_MOTION_PRESET = 'institucional_elegante';
export const isMotionPreset = (id) => Boolean(MOTION_PRESETS[id]);

// Un `style` guardado puede ser un preset de Motion Graphics o un estilo del
// motor generativo. Un solo rotulador para los dos, o la ficha pintaría la
// clave cruda de uno de ellos (la lección de `sin_club`, v4.958).
export const styleLabelFor = (style) =>
    MOTION_PRESETS[style]?.label || OUTRO_STYLES[style]?.label || style || '—';

// ─── Costos ────────────────────────────────────────────────────────────────
//
// TRES números separados, a propósito: la generación (0 en el motor
// determinista; la tarifa del motor en Kling), la voz (una síntesis del
// proveedor de TTS, estimada en créditos propios) y la composición (0: es
// ffmpeg local). Reutilizar un outro ya generado —ponerlo de predeterminado,
// engancharlo a un Reel— no pasa por acá y no cobra nada.
export const TTS_CREDIT_ESTIMATE = (() => {
    const raw = Number(process.env.OUTRO_TTS_CREDITS);
    return Number.isFinite(raw) && raw >= 0 ? raw : 2;
})();

// La música GENERADA por el motor de música (ElevenLabs/Stable Audio) se
// estima aparte; una pista propia de la Biblioteca cuesta cero. Sólo la usa el
// modo importado (v4.1036).
export const MUSIC_CREDIT_ESTIMATE = (() => {
    const raw = Number(process.env.OUTRO_MUSIC_CREDITS);
    return Number.isFinite(raw) && raw >= 0 ? raw : 3;
})();

export const estimateOutroCosts = ({ engine, voiceEnabled = false } = {}) => {
    const e = OUTRO_ENGINES[engine] || OUTRO_ENGINES[DEFAULT_ENGINE];
    const generationCost = e.deterministic
        ? 0
        : (voiceEnabled && e.nativeAudio ? (e.creditEstimateAudio || e.creditEstimate) : e.creditEstimate);
    // Con audio nativo (Kling) la voz ya está dentro de la tarifa del motor.
    const ttsCost = voiceEnabled && e.ttsVoice && !e.nativeAudio ? TTS_CREDIT_ESTIMATE : 0;
    const compositionCost = 0;
    const musicCost = 0;
    return { generationCost, ttsCost, musicCost, compositionCost, total: generationCost + ttsCost + musicCost + compositionCost };
};

// Modelo con el que se pide la voz. Es el mismo de siempre salvo que el entorno
// diga otra cosa: KIE_OUTRO_MODEL_AUDIO existe para corregir el id sin desplegar
// si KIE renombra el modelo.
export const audioModelFor = (engine) =>
    process.env.KIE_OUTRO_MODEL_AUDIO || engine.model;

// El motor determinista viaja con la aplicación (ffmpeg-static): está siempre.
// El generativo exige la credencial de la pasarela.
export const isEngineAvailable = (engineId) => {
    const e = OUTRO_ENGINES[engineId];
    if (!e) return false;
    if (e.deterministic) return true;
    return Boolean(process.env.KIE_API_KEY);
};

// ─── Estilos de outro ──────────────────────────────────────────────────────
//
// Cada estilo combina movimiento del FONDO, iluminación, ritmo, música y ánimo.
// Los descriptores van en inglés porque son la entrada del modelo; las etiquetas
// en español porque son lo que ve el usuario.
//
// La cámara NO es un eje de estilo (v4.647). Antes cada estilo traía su propio
// desplazamiento —push-in, dolly, crane, zoom— y eso es justo lo que arruina un
// cierre institucional: un acercamiento recorta el logotipo, y en un modelo
// generativo cada fotograma nuevo es una oportunidad de redibujarlo. La cámara
// queda fija en todos los estilos y lo que se mueve es el fondo decorativo: las
// ondas, los degradados y la luz. Es la indicación del equipo del cliente
// («la cámara debe permanecer prácticamente fija durante toda la secuencia»).
export const OUTRO_STYLES = {
    institucional: {
        label: 'Institucional', description: 'Sobrio y oficial. El fondo respira apenas y la luz se mantiene pareja.',
        motion: 'it breathes almost imperceptibly', light: 'even neutral light with a gentle warm lift',
        rhythm: 'calm and constant', sound: 'a soft ambient pad', mood: 'formal, trustworthy, institutional'
    },
    elegante: {
        label: 'Elegante', description: 'El fondo fluye como seda y una luz cálida lo recorre.',
        motion: 'it glides slowly, like silk settling', light: 'a warm light travelling softly across the background',
        rhythm: 'unhurried, flowing', sound: 'a soft piano tail', mood: 'refined, warm, premium'
    },
    corporativo: {
        label: 'Corporativo', description: 'Preciso y limpio: el fondo avanza con ritmo firme.',
        motion: 'it advances in a clean, measured drift', light: 'clean bright light, crisp edges',
        rhythm: 'firm and measured', sound: 'a clean corporate swell', mood: 'professional, confident, orderly'
    },
    moderno: {
        label: 'Moderno', description: 'Dinámico: el fondo entra con brío y se aquieta.',
        motion: 'it shifts briskly and then settles', light: 'high-contrast light with a bright rim',
        rhythm: 'brisk, then settled', sound: 'a short rhythmic accent', mood: 'fresh, energetic, contemporary'
    },
    inspiracional: {
        label: 'Inspiracional', description: 'Apertura luminosa y ascendente en el fondo.',
        motion: 'it opens upward in a slow rising drift', light: 'light blooming from the centre outwards',
        rhythm: 'building, uplifting', sound: 'rising strings', mood: 'hopeful, human, uplifting'
    },
    tecnologico: {
        label: 'Tecnológico', description: 'Luz fría y partículas finas recorriendo el fondo.',
        motion: 'fine light particles travel along its lines', light: 'cool directional light',
        rhythm: 'precise, modern', sound: 'a subtle digital shimmer', mood: 'technical, precise, forward-looking'
    },
    ceremonial: {
        label: 'Ceremonial', description: 'Solemne: el fondo se abre amplio y la luz se asienta.',
        motion: 'it eases open and holds', light: 'a solemn light with soft flares',
        rhythm: 'solemn, deliberate', sound: 'an orchestral tail', mood: 'ceremonial, dignified, celebratory'
    },
    minimalista: {
        label: 'Minimalista', description: 'Casi quieto. Aparición progresiva y nada más.',
        motion: 'it is almost perfectly still, with a barely perceptible breath', light: 'flat soft light, no highlights',
        rhythm: 'still and quiet', sound: 'near silence', mood: 'clean, quiet, minimal'
    }
};
export const DEFAULT_STYLE = 'institucional';

// ─── Voz en off ────────────────────────────────────────────────────────────
// La voz se pide al modelo por descripción — es lo que entiende un motor de
// audio nativo. No hay un selector de "voice id" porque el proveedor no expone
// un catálogo estable a través de la pasarela.
//
// `tongue` es la lengua materna que se le pide a la voz. Existe porque el riesgo
// concreto de un modelo de audio multilingüe es entregar una voz inglesa
// leyendo español: suena a locutor extranjero y arruina una pieza institucional.
// Se pide explícitamente hablante nativo, y por eso el dato no se puede deducir
// del acento sin más (pedir "lengua materna española" en la voz en inglés sería
// una contradicción).
export const VOICE_LANGUAGES = {
    'es-419': { label: 'Español · Neutro LATAM', accent: 'neutral Latin-American Spanish', tongue: 'Spanish', wordsPerSecond: 2.5 },
    'es-CO': { label: 'Español · Colombia',   accent: 'neutral Colombian Spanish', tongue: 'Spanish',    wordsPerSecond: 2.5 },
    'es-MX': { label: 'Español · México',     accent: 'Mexican Spanish',           tongue: 'Spanish',    wordsPerSecond: 2.5 },
    'es-AR': { label: 'Español · Argentina',  accent: 'Rioplatense Spanish',       tongue: 'Spanish',    wordsPerSecond: 2.4 },
    'es-ES': { label: 'Español · España',     accent: 'Castilian Spanish',         tongue: 'Spanish',    wordsPerSecond: 2.6 },
    'en-US': { label: 'Inglés · Estados Unidos', accent: 'American English',       tongue: 'English',    wordsPerSecond: 2.7 },
    'en-GB': { label: 'Inglés · Reino Unido', accent: 'British English',           tongue: 'English',    wordsPerSecond: 2.6 },
    'pt-BR': { label: 'Portugués · Brasil',   accent: 'Brazilian Portuguese',      tongue: 'Portuguese', wordsPerSecond: 2.5 },
    'fr-FR': { label: 'Francés · Francia',    accent: 'French',                    tongue: 'French',     wordsPerSecond: 2.4 },
    'it-IT': { label: 'Italiano · Italia',    accent: 'Italian',                   tongue: 'Italian',    wordsPerSecond: 2.5 }
};
// Español latino neutro por defecto: es el que pidió el equipo del cliente para
// las piezas institucionales y el que primero ve quien abre el generador.
export const DEFAULT_LANGUAGE = 'es-419';

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
export const resolveEngine = ({ engine, voiceEnabled = false, format = DEFAULT_FORMAT, durationSec = null } = {}) => {
    const notes = [];

    // El modo importado no GENERA nada: no puede elegirse como motor de
    // generación ni servir de respaldo para la voz. Va por su propia vía.
    const generative = (id) => Boolean(OUTRO_ENGINES[id]) && !OUTRO_ENGINES[id].imported;
    let chosenId = engine && generative(engine) && isEngineAvailable(engine) ? engine : null;
    if (engine && generative(engine) && !isEngineAvailable(engine)) {
        notes.push(`${OUTRO_ENGINES[engine].label} no está configurado en este entorno: se usó ${OUTRO_ENGINES[DEFAULT_ENGINE].label}.`);
    }

    // La voz manda sobre el default: sin forma de locutar no hay locución. Todo
    // motor del registro la tiene hoy —audio nativo o TTS—, pero la comprobación
    // se queda: un motor futuro sin ninguna de las dos no puede prometerla.
    if (voiceEnabled) {
        const canSpeak = (e) => e.nativeAudio || e.ttsVoice;
        if (!chosenId || !canSpeak(OUTRO_ENGINES[chosenId])) {
            const speaking = Object.values(OUTRO_ENGINES).find(e => !e.imported && canSpeak(e) && isEngineAvailable(e.id));
            if (speaking) {
                if (chosenId) notes.push(`La voz en off requiere un motor que la pueda locutar: se usó ${speaking.label}.`);
                chosenId = speaking.id;
            } else {
                notes.push('Ningún motor disponible puede locutar: el outro se generó sin voz.');
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

    // Duración: NUNCA se manda al proveedor una que no admita. Con
    // `customDuration` (motor determinista) se acota al rango y al paso; sin
    // él (Kling) se toma la más cercana de su lista. El ajuste se anota.
    const requested = Number.isFinite(Number(durationSec)) && Number(durationSec) > 0 ? Number(durationSec) : TARGET_DURATION_SEC;
    let resolvedDuration;
    if (selected.customDuration) {
        const { min, max, step } = selected.customDuration;
        const clamped = Math.min(max, Math.max(min, requested));
        resolvedDuration = Number((Math.round(clamped / step) * step).toFixed(2));
        if (Math.abs(resolvedDuration - requested) > 0.001) {
            notes.push(`La duración pedida (${requested} s) se ajustó a ${resolvedDuration} s: el rango es de ${min} a ${max} s en pasos de ${step}.`);
        }
    } else {
        resolvedDuration = selected.durations.reduce(
            (best, d) => Math.abs(d - requested) < Math.abs(best - requested) ? d : best,
            selected.durations[0]
        );
        if (resolvedDuration !== requested) {
            notes.push(`${selected.label} sólo entrega clips de ${selected.durations.join(' o ')} s: se pidieron ${requested} s y el maestro dura ${resolvedDuration} s. La locución se ajusta a esa duración.`);
        }
    }

    // Resolución: siempre la mayor que soporte el motor (regla: archivo maestro
    // en la máxima calidad disponible; nunca se reescala hacia arriba después).
    const resolution = selected.resolutions.includes('4k') ? '4k' : selected.resolutions[selected.resolutions.length - 1];
    if (resolution !== '4k' && !selected.deterministic) {
        notes.push(`El proveedor entrega hasta ${resolution} para este modelo; el maestro queda en ${OUTRO_FORMATS[resolvedFormat].master.width}×${OUTRO_FORMATS[resolvedFormat].master.height}.`);
    }

    const withVoice = voiceEnabled && (selected.nativeAudio || selected.ttsVoice);
    const costs = estimateOutroCosts({ engine: chosenId, voiceEnabled: withVoice });

    return {
        engine: selected,
        engineId: chosenId,
        // El modelo con voz puede diferir del silencioso si el entorno lo pide.
        model: withVoice && selected.nativeAudio ? audioModelFor(selected) : selected.model,
        // Lo que se descuenta del medidor propio al crear la fila: la generación
        // más la voz. El desglose viaja aparte en `costs`.
        creditEstimate: costs.total,
        costs,
        format: resolvedFormat,
        durationSec: resolvedDuration,
        resolution,
        voiceEnabled: withVoice,
        voiceMode: withVoice ? (selected.nativeAudio ? 'native' : 'tts') : null,
        deterministic: Boolean(selected.deterministic),
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
        `A ${durationSec}-second institutional closing card, animated from the provided artwork.`,
        // Lo que se conserva, enumerado en positivo. La pieza es el diseño final:
        // el modelo la anima, no la rediseña.
        'The artwork is the finished design: same logo, same wordmark, same typography, same palette, same layout, same proportions, full frame. It stays that way from the first frame to the last, and the closing frame matches the artwork exactly.',
        // La cámara y el logotipo, quietos. Se dice como una cualidad de la
        // pieza —"held", "settles"— y no como una lista de prohibiciones.
        'The camera is locked off: the framing never travels, and the whole logo — wordmark, gear and slogan — is held perfectly still and complete inside the frame, settling in with one clean fade.',
        `Motion belongs to the decorative background alone: ${s.motion}. Lighting: ${s.light}. Pacing: ${s.rhythm}. Mood: ${s.mood}.`
    ];

    if (withAudio && speech) {
        const lang = VOICE_LANGUAGES[voice.language] || VOICE_LANGUAGES[DEFAULT_LANGUAGE];
        const gender = (VOICE_GENDERS[voice.gender] || VOICE_GENDERS.female).descriptor;
        const pace = (VOICE_PACES[voice.pace] || VOICE_PACES.normal).descriptor;
        const tone = (VOICE_TONES[voice.tone] || VOICE_TONES.institutional).descriptor;
        const volume = (VOICE_VOLUMES[voice.volume] || VOICE_VOLUMES.normal).descriptor;
        parts.push(
            // "native speaker … mother tongue" es la parte que importa: el
            // riesgo real de un modelo de audio multilingüe es una voz inglesa
            // leyendo español. Se pide la cualidad que se quiere, no se prohíbe
            // el acento que no.
            `Audio: one ${gender} voiceover, a native ${lang.accent} speaker with ${lang.tongue} as their mother tongue and fully native diction, ${tone}, ${pace}, speaking ${volume}, saying exactly: "${speech}".`,
            `The line lands comfortably before the end of the ${durationSec} seconds. Under the voice, an elegant instrumental corporate bed, mixed low so the words stay clear: ${s.sound}.`
        );
    } else {
        parts.push(`Audio: an elegant instrumental corporate bed, ${s.sound}. No speech.`);
    }

    return parts.join(' ');
};

// Nombre por defecto del outro, con la organización adelante para que la
// biblioteca sea legible sin abrir cada ficha.
export const buildOutroTitle = ({ organizationName, style, format }) => {
    const org = String(organizationName || '').trim();
    const styleLabel = MOTION_PRESETS[style]?.label || (OUTRO_STYLES[style] || OUTRO_STYLES[DEFAULT_STYLE]).label;
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
