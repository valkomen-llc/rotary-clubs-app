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
import { resolveFactGuard, systemWithFacts } from './reelFacts.js';
import {
    NARRATION_LANGUAGES, DEFAULT_LANGUAGE,
    NARRATION_STYLES, DEFAULT_STYLE,
    LEAD_IN_SEC,
    computeWordBudget, countWords, estimateDuration
} from './reelVoices.js';

// ─── Idiomas, géneros, estilos y presupuesto ───────────────────────────────
//
// El CRITERIO vive en `reelVoices.js`, que es PURO: no importa el redactor ni
// ninguna credencial, así que un módulo de criterio puede leer el catálogo de
// acentos sin arrastrar esta cadena de dependencias. Acá se RE-EXPORTA para
// que ninguna importación existente cambie — este archivo sigue siendo la
// puerta histórica de todo el módulo de narración.
export {
    NARRATION_LANGUAGES, DEFAULT_LANGUAGE,
    NARRATION_GENDERS, DEFAULT_GENDER,
    NARRATION_STYLES, DEFAULT_STYLE,
    isVoiceLanguage, isVoiceGender, isVoiceStyle,
    voiceLanguageLabel, voiceGenderLabel, voiceStyleLabel,
    voiceLanguageOptions, voiceGenderOptions, voiceStyleOptions,
    LEAD_IN_SEC, TAIL_SEC,
    computeWordBudget, countWords, estimateDuration
} from './reelVoices.js';

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

// ─── Guion ─────────────────────────────────────────────────────────────────

const SCRIPT_SYSTEM = `${INSTITUTIONAL_VOICE}

Ahora escribís un GUION PARA SER LEÍDO EN VOZ ALTA sobre un video vertical corto (Reel/TikTok/Short). Es una pieza distinta del texto de la publicación:

REGLAS PERMANENTES OBLIGATORIAS:
1. IDENTIDAD DISTRITAL: PROHIBIDO mencionar "Rotary Distrito 4281", "Distrito 4281 de Rotary International", "Distrito 4281" ni variantes institucionales distritales. Los videos ya se publican y difunden desde los canales oficiales del Distrito, por lo que repetir el nombre institucional resulta redundante e innecesario (salvo que se solicite expresamente).
2. ENFOQUE HUMANO E IMPACTO REAL: La voz en off debe centrarse en la historia y en el impacto humano de la acción mostrada. El lenguaje debe transmitir servicio, solidaridad, esperanza, empatía, cooperación, transformación social y compromiso sincero con las comunidades, según el contexto real de la publicación.
3. CERO AUTOPROMOCIÓN NI TONO PUBLICITARIO: Evitá que el guion suene como anuncio publicitario, propaganda institucional, autopromoción o una enumeración fría de logros. Debe mantener un tono altruista y filantrópico de entrega desinteresada, poniendo en primer plano a las personas, las comunidades atendidas y el cambio generado.
4. FIDELIDAD ESTRICTA A LOS HECHOS: El texto debe corresponder estrictamente con la información disponible de la publicación. PROHIBIDO inventar cifras, cantidades de beneficiarios, fechas, lugares, organizaciones, resultados o hechos que no estén presentes en los datos originales.
5. ADAPTACIÓN TEMPORAL NATURAL: Adaptá la extensión del guion a la duración real disponible para la voz en off, buscando una locución natural, pausada y respirable, sin acelerar artificialmente la lectura.
6. REGLAS DE LOCUCIÓN:
   A. Se escucha, no se lee. Cero hashtags, cero emojis, cero "link en la bio", cero "deslizá".
   B. Frases cortas y respirables. Una idea por frase. La puntuación marca las pausas reales de la locución.
   C. Números y siglas se escriben como se dicen: "doscientas personas", no "200"; "erre eye", no "RI".
   D. La última frase tiene que cerrar con fuerza, calidez y sentido de comunidad.`;

export const sanitizeNarrationScript = (text) => {
    if (!text || typeof text !== 'string') return '';
    let cleaned = text;
    // Remueve menciones a Rotary Distrito 4281 o Distrito 4281 y variantes
    cleaned = cleaned.replace(/\b(?:Rotary\s+)?Distrito\s+4281(?:\s+de\s+Rotary(?:\s+International)?)?\b/gi, '');
    // Limpia espacios dobles o puntuación huérfana
    cleaned = cleaned.replace(/\s{2,}/g, ' ').replace(/\s+([.,;:!?])/g, '$1').trim();
    return cleaned;
};

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
    emergency = null, narrativeRoles = null, retryInstruction = null,
    // ── Contexto de Solicitud / Campaña / Artículo (v4.1087) ──
    sourceContext = null
}) => {
    const lang = NARRATION_LANGUAGES[language] || NARRATION_LANGUAGES[DEFAULT_LANGUAGE];
    const st = NARRATION_STYLES[style] || NARRATION_STYLES[DEFAULT_STYLE];

    const sceneLines = scenes.map((s, i) => {
        const a = s.analysis || {};
        const role = narrativeRoles?.[i];
        const roleTag = role && role.id !== 'libre' ? ` [${role.label}: ${role.brief}]` : '';
        return `  ${i + 1}. (${s.durationSec}s) ${a.summary || s.prompt || 'escena sin descripción'}${a.hasBrand ? ' — con marca visible' : ''}${roleTag}`;
    }).join('\n');

    const n = scenes.length;
    const sceneWord = n === 1 ? 'una escena' : `${n === 2 ? 'dos' : n === 3 ? 'tres' : n === 4 ? 'cuatro' : n === 5 ? 'cinco' : n} escenas`;

    const sourceLines = [];
    if (sourceContext) {
        if (sourceContext.campaignName) sourceLines.push(`Campaña: ${sourceContext.campaignName}`);
        if (sourceContext.submissionTitle) sourceLines.push(`Título de la solicitud original: ${sourceContext.submissionTitle}`);
        if (sourceContext.articleTitle) sourceLines.push(`Artículo de blog relacionado: ${sourceContext.articleTitle}`);
        if (sourceContext.articleSummary) sourceLines.push(`Resumen del artículo: ${sourceContext.articleSummary}`);
        if (sourceContext.story) sourceLines.push(`Historia / relato comunitario: ${sourceContext.story}`);
        if (sourceContext.description) sourceLines.push(`Descripción de los hechos: ${sourceContext.description}`);
        if (sourceContext.location || sourceContext.city) sourceLines.push(`Lugar / Ciudad: ${[sourceContext.city, sourceContext.location].filter(Boolean).join(', ')}`);
        if (sourceContext.participatingClubs) sourceLines.push(`Clubes participantes: ${sourceContext.participatingClubs}`);
    }

    // Filtrar nombre de entidad si coincide con Distrito 4281
    const safeClubName = clubName && !/Distrito\s*4281/i.test(clubName) ? clubName : null;

    return [
        safeClubName ? `Entidad local promotora: "${safeClubName}"${clubCity ? ` — ${clubCity}` : ''}.` : '',
        `Tipo de publicación: ${context.typeLabel} — tono ${context.tone}, foco ${context.focus}.`,
        `Área de enfoque Rotary: ${context.areaDescription}.`,
        '',
        sourceLines.length > 0 ? `INFORMACIÓN FUENTE Y CONTEXTO REAL:\n${sourceLines.join('\n')}\n` : '',
        // El bloque de la emergencia va ANTES de las escenas: es el hecho del
        // que trata la pieza, y las escenas son cómo se cuenta.
        emergency ? `DATOS DE LA EMERGENCIA (lo único que podés afirmar):\n${emergency}\n` : '',
        `El Reel dura ${durationSec} segundos y tiene ${sceneWord}:`,
        sceneLines,
        '',
        `Escribí el guion de la voz en off en ${lang.label}, con carácter ${st.descriptor}.`,
        'REGLA FUNDAMENTAL: NO menciones "Rotary Distrito 4281" ni "Distrito 4281". Enfocate en la gente, el servicio solidario y la transformación de la comunidad.',
        '',
        `PRESUPUESTO EXACTO: ${budget.targetWords} palabras. Nunca más de ${budget.maxWords}.`,
        `Es una locución de ${budget.availableSec} segundos: cada palabra de más hace que la voz se pase del video o suene apresurada.`,
        retryInstruction ? `\n${retryInstruction}` : '',
        '',
        'Devolvé este JSON exacto, sin texto alrededor y sin bloques de código:',
        '{',
        '  "script": "el guion completo, listo para leer en voz alta",',
        '  "wordCount": <número de palabras que escribiste>,',
        '  "rationale": "una frase en español explicando el enfoque humano"',
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
    emergencyContext = null, narrativeRoles = null,
    // La guardia de datos ya resuelta por quien conoce la fuente (v4.1006).
    // Un Reel que nace de una Solicitud de Contenido afirma hechos igual que
    // una campaña de emergencia y NO es una emergencia: su cláusula y su brief
    // los arma su propio módulo. Sin esto, la pieza sigue exactamente igual.
    facts = null,
    // Contexto amplio de solicitud, campaña y artículo (v4.1087)
    sourceContext = null
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
    const guard = resolveFactGuard({ emergencyContext, facts });
    const system = systemWithFacts(SCRIPT_SYSTEM, guard);
    const brief = guard.brief;

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
                emergency: brief, narrativeRoles, retryInstruction, sourceContext
            }),
            temperature: 0.7,
            maxTokens: 800,
            jsonMode: true
        });

        const raw = parseJsonObject(result);
        if (!raw?.script) throw new Error('El generador de guion no devolvió un texto utilizable.');

        const rawScript = String(raw.script).trim();
        const script = sanitizeNarrationScript(rawScript);
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

        if (!guard.universe) return last;

        const check = validateEmergencyCopy(script, guard.universe, { field: 'guion' });
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
    emergencyContext = null, narrativeRoles = null,
    // La guardia de datos ya resuelta por quien conoce la fuente (v4.1006).
    // Un Reel que nace de una Solicitud de Contenido afirma hechos igual que
    // una campaña de emergencia y NO es una emergencia: su cláusula y su brief
    // los arma su propio módulo. Sin esto, la pieza sigue exactamente igual.
    facts = null,
    sourceContext = null
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
                emergencyContext, narrativeRoles, facts, sourceContext
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
