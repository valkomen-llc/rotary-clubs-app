// ════════════════════════════════════════════════════════════════════
// Creador de Reels IA — narración y Narrative Timing Engine
// v4.667.0
//
// Genera un guion pensado para SER HABLADO y lo sintetiza con una voz que dure
// lo que dura el Reel.
//
// EL GUION NO ES EL COPY. El copy de Instagram se lee; esto se escucha. Un
// texto con hashtags, emojis o "link en la bio" narrado en voz alta suena
// absurdo. Son dos piezas distintas escritas para dos canales distintos, y por
// eso hay dos generadores y no uno con un interruptor.
//
// ─── NARRATIVE TIMING ENGINE ────────────────────────────────────────────────
//
// El problema real: ningún proveedor de TTS acepta "durá exactamente 14
// segundos". Devuelven el audio que sale de leer el texto. Así que la
// sincronía no se pide: se CONSTRUYE, en tres pasos.
//
//   1. PRESUPUESTO. Cuántas palabras entran en el tiempo disponible, según el
//      idioma, la velocidad pedida y las pausas de puntuación. No es un número
//      de caracteres: el español habla a ~2,5 palabras por segundo y el inglés
//      a ~2,8, y una coma cuesta tiempo aunque no cueste letras.
//   2. MEDICIÓN. Se sintetiza y se mide el archivo REAL con FFmpeg. Estimar y
//      creerse la estimación es lo que hace que la voz se pase tres segundos.
//   3. AJUSTE. Si no encaja, se reescribe el guion con el presupuesto corregido
//      por el error medido, y se vuelve a medir. Hasta `maxAttempts`.
//
// LO QUE NO SE HACE: acelerar la voz para que quepa. El pedido lo excluye
// explícitamente y con razón — se nota. Sólo se admite un `atempo` de hasta un
// 4 % como último recurso, que está por debajo del umbral audible, y sólo
// cuando quedó LARGA. Si quedó corta, se completa con silencio: una pausa antes
// del último fotograma es invisible; una palabra cortada, no.
// ════════════════════════════════════════════════════════════════════

import { generateCopy } from '../services/copywritingService.js';
import { INSTITUTIONAL_VOICE } from './institutionalVoice.js';
import { resolveContext } from './publicationContext.js';
import {
    EMERGENCY_FACT_CLAUSE, buildEmergencyBrief,
    validateEmergencyCopy, buildRetryInstruction
} from './emergencySpec.js';

// ─── Idiomas ───────────────────────────────────────────────────────────────
//
// `wordsPerSecond` es el ritmo real de locución, no de lectura silenciosa. Los
// valores salen del mismo criterio que ya usa el Generador de Outros
// (`VOICE_LANGUAGES` en `outroSpec.js`), donde llevan tiempo funcionando.
export const NARRATION_LANGUAGES = {
    'es-CO': { label: 'Español · Colombia', locale: 'es-CO', tongue: 'Spanish', accent: 'neutral Colombian Spanish', wordsPerSecond: 2.5, isDefault: true },
    'es-419': { label: 'Español · Latino neutro', locale: 'es-419', tongue: 'Spanish', accent: 'neutral Latin-American Spanish', wordsPerSecond: 2.5 },
    'es-MX': { label: 'Español · México', locale: 'es-MX', tongue: 'Spanish', accent: 'Mexican Spanish', wordsPerSecond: 2.5 },
    'es-AR': { label: 'Español · Argentina', locale: 'es-AR', tongue: 'Spanish', accent: 'Rioplatense Spanish', wordsPerSecond: 2.4 },
    'es-ES': { label: 'Español · España', locale: 'es-ES', tongue: 'Spanish', accent: 'Castilian Spanish', wordsPerSecond: 2.6 },
    'en-US': { label: 'Inglés · Estados Unidos', locale: 'en-US', tongue: 'English', accent: 'American English', wordsPerSecond: 2.8 },
    'pt-BR': { label: 'Portugués · Brasil', locale: 'pt-BR', tongue: 'Portuguese', accent: 'Brazilian Portuguese', wordsPerSecond: 2.5 },
    'fr-FR': { label: 'Francés · Francia', locale: 'fr-FR', tongue: 'French', accent: 'French', wordsPerSecond: 2.4 },
    'it-IT': { label: 'Italiano · Italia', locale: 'it-IT', tongue: 'Italian', accent: 'Italian', wordsPerSecond: 2.5 }
};
// Colombia por defecto: es lo que pidió el equipo del cliente. Si el proveedor
// activo no sabe hacer ese acento, se dice — no se finge.
export const DEFAULT_LANGUAGE = 'es-CO';

export const NARRATION_GENDERS = {
    female: { label: 'Femenina', descriptor: 'female' },
    male: { label: 'Masculina', descriptor: 'male' },
    neutral: { label: 'Neutra', descriptor: 'gender-neutral' }
};

// ─── Estilos de narración ──────────────────────────────────────────────────
//
// Cambian el GUION, no sólo la entonación: un texto institucional y uno
// deportivo no se diferencian en cómo se leen sino en qué dicen y con qué
// ritmo. `pace` afecta al presupuesto de palabras.
export const NARRATION_STYLES = {
    institucional: { label: 'Institucional', descriptor: 'composed, institutional, measured', pace: 1.0, isDefault: true },
    inspirador: { label: 'Inspirador', descriptor: 'hopeful and uplifting, building towards the end', pace: 1.0 },
    emotivo: { label: 'Emotivo', descriptor: 'warm and moving, with room to breathe', pace: 0.92 },
    comercial: { label: 'Comercial', descriptor: 'persuasive and benefit-forward', pace: 1.08 },
    cercano: { label: 'Cercano', descriptor: 'conversational, as if talking to a friend', pace: 1.02 },
    corporativo: { label: 'Corporativo', descriptor: 'precise, professional, confident', pace: 1.0 },
    deportivo: { label: 'Deportivo', descriptor: 'energetic and driving', pace: 1.15 },
    elegante: { label: 'Elegante', descriptor: 'refined and unhurried', pace: 0.9 },
    dinamico: { label: 'Dinámico', descriptor: 'brisk and punchy', pace: 1.12 },
    motivacional: { label: 'Motivacional', descriptor: 'rousing, direct, call-to-action energy', pace: 1.05 }
};
export const DEFAULT_STYLE = 'institucional';

// ─── Proveedores de voz ────────────────────────────────────────────────────
//
// Registro desacoplado, mismo criterio que el resto del módulo.
//
// `accentControl` dice si el proveedor puede REALMENTE hacer el acento pedido.
// Es el dato honesto del registro: OpenAI tiene voces excelentes pero no
// seleccionables por acento —hablan español con un deje anglosajón—, mientras
// ElevenLabs tiene voces colombianas de verdad. Prometer «acento colombiano»
// con un motor que no lo hace es exactamente el tipo de afirmación que este
// módulo no hace.
export const TTS_PROVIDERS = {
    elevenlabs: {
        id: 'elevenlabs',
        label: 'ElevenLabs',
        envKey: 'ELEVENLABS_API_KEY',
        accentControl: true,
        implemented: true,
        isDefault: true,
        note: 'Voces con acento latino real, incluido colombiano. Es la mejor opción para una pieza institucional en español.'
    },
    openai: {
        id: 'openai',
        label: 'OpenAI',
        envKey: 'OPENAI_API_KEY',
        accentControl: false,
        implemented: true,
        note: 'Funciona con la credencial que la plataforma ya tiene. Voces naturales, pero el acento no se puede elegir: el español suena neutro con deje anglosajón.'
    },
    azure: { id: 'azure', label: 'Azure Speech', envKey: 'AZURE_SPEECH_KEY', accentControl: true, implemented: false, note: 'Próximamente — requiere adaptador propio.' },
    google: { id: 'google', label: 'Google Cloud TTS', envKey: 'GOOGLE_TTS_API_KEY', accentControl: true, implemented: false, note: 'Próximamente — requiere adaptador propio.' },
    polly: { id: 'polly', label: 'Amazon Polly', envKey: 'AWS_SECRET_ACCESS_KEY', accentControl: true, implemented: false, note: 'Próximamente — requiere firma SigV4 y el SDK de Polly.' }
};

export const isTtsAvailable = (id) => {
    const p = TTS_PROVIDERS[id];
    return Boolean(p && p.implemented && process.env[p.envKey]);
};

export const availableTtsProviders = () => Object.keys(TTS_PROVIDERS).filter(isTtsAvailable);

export const activeTtsProvider = () => {
    const wanted = process.env.REEL_TTS_PROVIDER;
    if (wanted && isTtsAvailable(wanted)) return wanted;
    // ElevenLabs primero por el acento; OpenAI como el que siempre está.
    if (isTtsAvailable('elevenlabs')) return 'elevenlabs';
    return availableTtsProviders()[0] || null;
};

// Voces por defecto de cada proveedor, por género. Configurables por entorno
// porque un cliente puede tener su propia voz clonada en ElevenLabs.
const voiceIdFor = (provider, gender) => {
    if (provider === 'elevenlabs') {
        return process.env[`ELEVENLABS_VOICE_${gender.toUpperCase()}`]
            || process.env.ELEVENLABS_VOICE_ID
            // Voces multilingües del catálogo público de ElevenLabs.
            || (gender === 'male' ? 'onwK4e9ZLuTAKqWW03F9' : '21m00Tcm4TlvDq8ikWAM');
    }
    if (provider === 'openai') {
        return process.env.OPENAI_TTS_VOICE
            || (gender === 'male' ? 'onyx' : gender === 'neutral' ? 'alloy' : 'nova');
    }
    return null;
};

// ─── Presupuesto de palabras ───────────────────────────────────────────────
//
// Cuántas palabras entran en el tiempo disponible. `padding` es el silencio que
// se deja al principio y al final: arrancar pegado al primer fotograma suena a
// error, y terminar pegado al último corta la última sílaba.
const LEAD_IN_SEC = 0.35;
const TAIL_SEC = 0.45;

export const computeWordBudget = ({ durationSec, language = DEFAULT_LANGUAGE, style = DEFAULT_STYLE, speed = 1 }) => {
    const lang = NARRATION_LANGUAGES[language] || NARRATION_LANGUAGES[DEFAULT_LANGUAGE];
    const st = NARRATION_STYLES[style] || NARRATION_STYLES[DEFAULT_STYLE];

    const availableSec = Math.max(1, durationSec - LEAD_IN_SEC - TAIL_SEC);
    const effectiveWps = lang.wordsPerSecond * st.pace * (speed || 1);

    return {
        availableSec: Number(availableSec.toFixed(2)),
        wordsPerSecond: Number(effectiveWps.toFixed(2)),
        // Se apunta al 94 % del presupuesto: es más fácil estirar con una pausa
        // que recortar una frase ya escrita, y pasarse es el único error que se
        // oye.
        targetWords: Math.max(4, Math.round(availableSec * effectiveWps * 0.94)),
        maxWords: Math.max(5, Math.floor(availableSec * effectiveWps)),
        leadInSec: LEAD_IN_SEC,
        tailSec: TAIL_SEC
    };
};

export const countWords = (t) => String(t || '').trim().split(/\s+/).filter(Boolean).length;

// Estimación de cuánto va a durar un texto. Suma el tiempo de las palabras más
// el de las pausas: una coma vale ~0,2 s y un punto ~0,4 s, y eso no aparece en
// el número de palabras pero sí en el audio.
export const estimateDuration = (text, { language = DEFAULT_LANGUAGE, style = DEFAULT_STYLE, speed = 1 } = {}) => {
    const lang = NARRATION_LANGUAGES[language] || NARRATION_LANGUAGES[DEFAULT_LANGUAGE];
    const st = NARRATION_STYLES[style] || NARRATION_STYLES[DEFAULT_STYLE];
    const wps = lang.wordsPerSecond * st.pace * (speed || 1);

    const words = countWords(text);
    const commas = (String(text).match(/[,;:]/g) || []).length;
    const stops = (String(text).match(/[.!?…]/g) || []).length;

    return Number((words / wps + commas * 0.2 + stops * 0.4).toFixed(2));
};

// ─── Guion ─────────────────────────────────────────────────────────────────

const SCRIPT_SYSTEM = `${INSTITUTIONAL_VOICE}

Ahora escribís un GUION PARA SER LEÍDO EN VOZ ALTA sobre un video vertical corto. Es una pieza distinta del texto de la publicación:

A. Se escucha, no se lee. Nada de hashtags, nada de emojis, nada de "link en la bio", nada de "deslizá". Esas cosas no se pueden pronunciar.
B. Frases cortas y respirables. Una idea por frase. La puntuación marca las pausas reales de la locución, así que usala de verdad.
C. Números y siglas se escriben como se dicen: "doscientas personas", no "200"; "erre eye", no "RI".
D. La última frase tiene que cerrar. Nadie corta una narración a mitad de idea.
E. El largo manda. Si te piden 32 palabras, escribís 32, no 45. Es lo que hace que la voz termine con el video.`;

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

export const buildScriptPrompt = ({
    scenes, budget, language, style, context, clubName, clubCity, durationSec,
    // ── Campaña de Emergencia (v4.783) ──
    //
    // `emergency` es el contexto normalizado y `narrativeRoles` la función de
    // cada escena. Los dos son opcionales: sin ellos este prompt es exactamente
    // el de siempre, que es lo que hace que el Reel estándar no cambie.
    emergency = null, narrativeRoles = null, retryInstruction = null
}) => {
    const lang = NARRATION_LANGUAGES[language] || NARRATION_LANGUAGES[DEFAULT_LANGUAGE];
    const st = NARRATION_STYLES[style] || NARRATION_STYLES[DEFAULT_STYLE];

    const sceneLines = scenes.map((s, i) => {
        const a = s.analysis || {};
        // Con estructura declarada, cada escena dice QUÉ le toca contar. Sin
        // eso, el modelo escribe tres frases sobre lo que ve en las fotos y la
        // pieza pierde el arco —contexto, impacto, llamado— que es justamente
        // lo que se le pidió al preset.
        const role = narrativeRoles?.[i];
        const roleTag = role && role.id !== 'libre' ? ` [${role.label}: ${role.brief}]` : '';
        return `  ${i + 1}. (${s.durationSec}s) ${a.summary || 'escena sin descripción'}${a.hasBrand ? ' — con marca visible' : ''}${roleTag}`;
    }).join('\n');

    const n = scenes.length;
    const sceneWord = n === 1 ? 'una escena' : `${n === 2 ? 'dos' : n === 3 ? 'tres' : n === 4 ? 'cuatro' : n === 5 ? 'cinco' : n} escenas`;

    return [
        `Entidad: "${clubName || '(sin nombre)'}"${clubCity ? ` — ${clubCity}` : ''}.`,
        `Tipo de publicación: ${context.typeLabel} — tono ${context.tone}, foco ${context.focus}.`,
        `Área de enfoque Rotary: ${context.areaDescription}.`,
        '',
        // El bloque de la emergencia va ANTES de las escenas: es el hecho del
        // que trata la pieza, y las escenas son cómo se cuenta.
        emergency ? `DATOS DE LA EMERGENCIA (lo único que podés afirmar):\n${emergency}\n` : '',
        `El Reel dura ${durationSec} segundos y tiene ${sceneWord}:`,
        sceneLines,
        '',
        `Escribí el guion de la voz en off en ${lang.label}, con carácter ${st.descriptor}.`,
        '',
        `PRESUPUESTO EXACTO: ${budget.targetWords} palabras. Nunca más de ${budget.maxWords}.`,
        `Es una locución de ${budget.availableSec} segundos: cada palabra de más hace que la voz se pase del video.`,
        // El reintento del validador. Va al final, que es lo último que lee el
        // modelo, y nombra la regla concreta que rompió: «revisá el formato» no
        // corrige nada.
        retryInstruction ? `\n${retryInstruction}` : '',
        '',
        'Devolvé este JSON exacto, sin texto alrededor y sin bloques de código:',
        '{',
        '  "script": "el guion completo, listo para leer en voz alta",',
        '  "wordCount": <número de palabras que escribiste>,',
        '  "rationale": "una frase en español explicando el enfoque"',
        '}'
    ].filter(l => l !== '').join('\n');
};

// Genera el guion. `wordAdjustment` lo usa el motor de tiempos para pedir una
// versión más corta o más larga cuando la medición real no encaja.
export const generateScript = async ({
    scenes, durationSec, language = DEFAULT_LANGUAGE, style = DEFAULT_STYLE,
    speed = 1, context, clubName, clubCity, wordAdjustment = 0, provider = null,
    // Contexto de emergencia. Cuando viene, se añade la cláusula de datos al
    // sistema y se VALIDA la salida por código.
    emergencyContext = null, narrativeRoles = null
}) => {
    const base = computeWordBudget({ durationSec, language, style, speed });
    const budget = {
        ...base,
        targetWords: Math.max(4, base.targetWords + wordAdjustment),
        maxWords: Math.max(5, base.maxWords + wordAdjustment)
    };

    // La cláusula de emergencia va ENCIMA de la voz institucional, no en su
    // lugar: la regla 3 de `INSTITUTIONAL_VOICE` ya prohíbe inventar fechas y
    // cantidades, y esto agrega lo específico de un desastre.
    const system = emergencyContext
        ? `${SCRIPT_SYSTEM}\n\n${EMERGENCY_FACT_CLAUSE}`
        : SCRIPT_SYSTEM;
    const brief = emergencyContext ? buildEmergencyBrief(emergencyContext) : null;

    // ── El bucle de validación (v4.783) ──
    //
    // El modelo ESCRIBE, el código DECIDE. Se reintenta devolviéndole la regla
    // concreta que rompió, que es el patrón de `templateComposer.js` y
    // `seoAI.js`: pedirle «revisá el formato» no corrige nada.
    //
    // Dos intentos y no más: cada uno es una llamada de texto, y si a la tercera
    // sigue inventando cifras el problema es del proveedor. Ahí NO se tira el
    // trabajo —eso dejaría la campaña sin voz—: se devuelve lo último con sus
    // incumplimientos anotados, y quien decide es el usuario, que puede editar
    // el guion o regenerarlo. Un control de calidad que tumba la generación es
    // peor que no tenerlo.
    const MAX_FACT_RETRIES = 2;
    let retryInstruction = null;
    let last = null;

    for (let attempt = 0; attempt <= MAX_FACT_RETRIES; attempt++) {
        const result = await generateCopy({
            ...(provider ? { provider } : {}),
            system,
            userText: buildScriptPrompt({
                scenes, budget, language, style, context, clubName, clubCity, durationSec,
                emergency: brief, narrativeRoles, retryInstruction
            }),
            temperature: 0.7,
            maxTokens: 800,
            jsonMode: true
        });

        const raw = parseJsonObject(result);
        if (!raw?.script) throw new Error('El generador de guion no devolvió un texto utilizable.');

        const script = String(raw.script).trim();
        last = {
            script,
            words: countWords(script),
            budget,
            estimatedSec: estimateDuration(script, { language, style, speed }),
            rationale: typeof raw.rationale === 'string' ? raw.rationale.slice(0, 200) : null,
            provider: result?.provider || null,
            model: result?.model || null,
            // Respuesta cruda del proveedor: es lo único que lleva el consumo
            // real de tokens, y el registro de auditoría lo necesita.
            rawResponse: result?.raw || null,
            factIssues: [],
            factAttempts: attempt + 1
        };

        if (!emergencyContext) return last;

        const check = validateEmergencyCopy(script, emergencyContext, { field: 'guion' });
        if (check.ok) return last;

        last.factIssues = check.issues;
        retryInstruction = buildRetryInstruction(check.issues);
        console.warn(
            `[REEL] guion de emergencia con ${check.issues.length} incumplimiento(s) (intento ${attempt + 1}): ${check.issues[0]}`
        );
    }

    return last;
};

// ─── Síntesis ──────────────────────────────────────────────────────────────

const synthesizeWithOpenAI = async ({ text, gender, speed }) => {
    const resp = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts',
            voice: voiceIdFor('openai', gender),
            input: text,
            // `speed` es la única palanca de ritmo del proveedor. Se mantiene
            // dentro de un rango imperceptible: el ajuste fino lo hace el motor
            // de tiempos reescribiendo el texto, no acelerando la voz.
            speed: Math.min(1.15, Math.max(0.85, speed || 1)),
            response_format: 'mp3'
        })
    });
    if (!resp.ok) {
        const body = await resp.text().catch(() => '');
        throw new Error(`OpenAI TTS: HTTP ${resp.status} ${body.slice(0, 300)}`);
    }
    return Buffer.from(await resp.arrayBuffer());
};

const synthesizeWithElevenLabs = async ({ text, gender, speed, language }) => {
    const voiceId = voiceIdFor('elevenlabs', gender);
    const lang = NARRATION_LANGUAGES[language] || NARRATION_LANGUAGES[DEFAULT_LANGUAGE];

    const resp = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
        method: 'POST',
        headers: {
            'xi-api-key': process.env.ELEVENLABS_API_KEY,
            'Content-Type': 'application/json',
            'Accept': 'audio/mpeg'
        },
        body: JSON.stringify({
            text,
            model_id: process.env.ELEVENLABS_MODEL || 'eleven_multilingual_v2',
            // El código de idioma es lo que evita que una voz multilingüe lea
            // español con fonética inglesa.
            language_code: lang.locale.split('-')[0],
            voice_settings: {
                stability: 0.5,
                similarity_boost: 0.75,
                style: 0.3,
                use_speaker_boost: true,
                speed: Math.min(1.15, Math.max(0.85, speed || 1))
            }
        })
    });
    if (!resp.ok) {
        const body = await resp.text().catch(() => '');
        throw new Error(`ElevenLabs: HTTP ${resp.status} ${body.slice(0, 300)}`);
    }
    return Buffer.from(await resp.arrayBuffer());
};

const TTS_ADAPTERS = { openai: synthesizeWithOpenAI, elevenlabs: synthesizeWithElevenLabs };

export const synthesize = async ({ text, provider = null, gender = 'female', speed = 1, language = DEFAULT_LANGUAGE }) => {
    const chosen = provider && isTtsAvailable(provider) ? provider : activeTtsProvider();
    if (!chosen) {
        const err = new Error('No hay proveedor de voz disponible. Configurar ELEVENLABS_API_KEY o OPENAI_API_KEY.');
        err.code = 'NO_TTS_PROVIDER';
        throw err;
    }
    const buffer = await TTS_ADAPTERS[chosen]({ text, gender, speed, language });
    return { buffer, provider: chosen, voiceId: voiceIdFor(chosen, gender) };
};

// ─── Narrative Timing Engine ───────────────────────────────────────────────
//
// El bucle que hace que la voz dure lo que dura el video. Escribe, sintetiza,
// MIDE el archivo real, y si no encaja corrige el presupuesto y reescribe.
//
// Medir en vez de estimar es lo que distingue esto de un cálculo de servilleta:
// la estimación sirve para pedir el texto, pero la que manda es la duración del
// MP3 que devolvió el proveedor.
export const NARRATION_TOLERANCE_SEC = 0.35;
export const MAX_TIMING_ATTEMPTS = 3;

export const fitNarrationToDuration = async ({
    scenes, durationSec, language = DEFAULT_LANGUAGE, style = DEFAULT_STYLE,
    speed = 1, gender = 'female', context, clubName, clubCity,
    provider = null, ttsProvider = null,
    measureAudio,                 // (buffer) => Promise<number>  — inyectado
    scriptOverride = null,        // guion escrito a mano: no se reescribe
    maxAttempts = MAX_TIMING_ATTEMPTS,
    // Contexto de emergencia y roles narrativos. Viajan hasta `generateScript`,
    // que es donde se aplican la clausula de datos y su validacion.
    emergencyContext = null, narrativeRoles = null
}) => {
    const budget = computeWordBudget({ durationSec, language, style, speed });
    const target = budget.availableSec;
    const attempts = [];

    let wordAdjustment = 0;
    let best = null;

    for (let i = 0; i < (scriptOverride ? 1 : maxAttempts); i++) {
        const written = scriptOverride
            ? {
                script: scriptOverride,
                words: countWords(scriptOverride),
                budget,
                estimatedSec: estimateDuration(scriptOverride, { language, style, speed }),
                rationale: null, provider: null, model: null
            }
            : await generateScript({
                scenes, durationSec, language, style, speed, context,
                clubName, clubCity, wordAdjustment, provider,
                emergencyContext, narrativeRoles
            });

        const voice = await synthesize({ text: written.script, provider: ttsProvider, gender, speed, language });
        const actualSec = await measureAudio(voice.buffer);

        const drift = actualSec - target;
        attempts.push({
            attempt: i + 1, words: written.words,
            // Los caracteres de CADA intento, porque el motor de voz cobra cada
            // síntesis: contar sólo el guion final haría parecer la locución
            // más barata de lo que fue.
            chars: written.script.length,
            estimatedSec: written.estimatedSec,
            actualSec: Number(actualSec.toFixed(2)),
            driftSec: Number(drift.toFixed(2))
        });

        const candidate = { ...written, voice, actualSec, drift };
        // Se queda el que menos se desvía, y entre dos parecidos el que NO se
        // pasa: pasarse es el único error que se oye.
        if (!best
            || (Math.abs(drift) < Math.abs(best.drift) - 0.05)
            || (Math.abs(drift) <= Math.abs(best.drift) + 0.05 && drift <= 0 && best.drift > 0)) {
            best = candidate;
        }

        if (Math.abs(drift) <= NARRATION_TOLERANCE_SEC) break;
        if (scriptOverride) break;

        // Corrección del presupuesto con el ritmo REAL de este proveedor y esta
        // voz, no con el teórico: si el motor lee más lento de lo previsto, la
        // segunda vuelta ya lo sabe.
        const realWps = written.words / Math.max(0.1, actualSec);
        wordAdjustment += Math.round(-drift * realWps);
    }

    return {
        script: best.script,
        words: best.words,
        rationale: best.rationale,
        scriptProvider: best.provider,
        scriptModel: best.model,
        scriptRaw: best.rawResponse || null,
        // Suma de todos los intentos, que es lo que de verdad se le facturó al
        // motor de voz.
        charsSynthesized: attempts.reduce((s, a) => s + (a.chars || 0), 0),
        audioBuffer: best.voice.buffer,
        ttsProvider: best.voice.provider,
        voiceId: best.voice.voiceId,
        actualSec: Number(best.actualSec.toFixed(2)),
        targetSec: Number(target.toFixed(2)),
        driftSec: Number(best.drift.toFixed(2)),
        withinTolerance: Math.abs(best.drift) <= NARRATION_TOLERANCE_SEC,
        budget,
        attempts,
        // Lo que el montaje tiene que hacer con este audio para que cierre en el
        // último fotograma. `leadIn` es el silencio de entrada; `stretch` es el
        // único ajuste de ritmo admitido, y sólo si quedó larga.
        leadInSec: budget.leadInSec,
        stretch: computeStretch(best.actualSec, durationSec - budget.leadInSec)
    };
};

// Si el audio se pasa del hueco disponible, se admite comprimirlo hasta un 4 %
// —por debajo del umbral audible—. Más que eso se nota y el pedido lo excluye:
// se deja pasar y el montaje avisa.
const MAX_STRETCH = 1.04;
const computeStretch = (actualSec, availableSec) => {
    if (actualSec <= availableSec) return 1;
    const needed = actualSec / availableSec;
    return needed <= MAX_STRETCH ? Number(needed.toFixed(4)) : MAX_STRETCH;
};

// Resumen legible para la ficha. Dice si encajó y con qué margen — un número
// comprobable, no una promesa de sincronía.
export const describeTiming = (n) => {
    if (!n) return 'Sin narración.';
    const sign = n.driftSec > 0 ? 'se pasa' : 'termina antes';
    if (n.withinTolerance) {
        return `Narración de ${n.actualSec}s ajustada a los ${n.targetSec}s disponibles (${Math.abs(n.driftSec)}s de margen).`;
    }
    return `Narración de ${n.actualSec}s frente a ${n.targetSec}s disponibles: ${sign} ${Math.abs(n.driftSec)}s tras ${n.attempts.length} intentos.`;
};
