// ════════════════════════════════════════════════════════════════════
// Creador de Reels IA — narración y Narrative Timing Engine
// v4.667.0 · diagnóstico por proveedor, respaldo como política y estado de los motores: v4.1236.0
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
// en ElevenLabs el acento lo pone LA VOZ: con una voz colombiana de la cuenta
// sale colombiano; con la voz por defecto del catálogo (Rachel / Daniel), que
// es angloparlante, sale neutro. Prometer «acento colombiano» con un motor o
// una voz que no lo hace es exactamente el tipo de afirmación que este módulo
// no hace.
//
// `model` es el modelo de SÍNTESIS DE VOZ. Un proveedor de texto (Gemini,
// Anthropic) no entra acá aunque tenga credencial: generar guion no es
// generar audio (v4.1236).
export const TTS_PROVIDERS = {
    elevenlabs: {
        id: 'elevenlabs',
        label: 'ElevenLabs',
        envKey: 'ELEVENLABS_API_KEY',
        modelEnv: 'ELEVENLABS_MODEL',
        defaultModel: 'eleven_multilingual_v2',
        accentControl: true,
        voiceChoice: true,
        implemented: true,
        isDefault: true,
        languages: 'Multilingüe (español incluido). El acento lo pone la voz elegida.',
        billing: 'Cobra por carácter sintetizado contra la cuota mensual de la cuenta de ElevenLabs.',
        note: 'Voces con acento latino real cuando la cuenta tiene una voz latina. Es la mejor opción para una pieza institucional en español.'
    },
    openai: {
        id: 'openai',
        label: 'OpenAI TTS',
        envKey: 'OPENAI_API_KEY',
        modelEnv: 'OPENAI_TTS_MODEL',
        defaultModel: 'tts-1',
        accentControl: false,
        voiceChoice: true,
        implemented: true,
        languages: 'Multilingüe (español incluido). El acento no se puede elegir: suena neutro.',
        billing: 'Cobra por carácter sintetizado contra el saldo de la cuenta de OpenAI.',
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

export const ttsModelFor = (id) => {
    const p = TTS_PROVIDERS[id];
    if (!p?.implemented) return null;
    return process.env[p.modelEnv] || p.defaultModel;
};

// Las voces de OpenAI que admiten `tts-1` y `tts-1-hd`. Es una lista cerrada
// del proveedor: no hay catálogo que consultar, y una voz fuera de ella
// devuelve un 400.
export const OPENAI_TTS_VOICES = [
    { id: 'nova', label: 'Nova', gender: 'female' },
    { id: 'shimmer', label: 'Shimmer', gender: 'female' },
    { id: 'coral', label: 'Coral', gender: 'female' },
    { id: 'sage', label: 'Sage', gender: 'female' },
    { id: 'alloy', label: 'Alloy', gender: 'neutral' },
    { id: 'ash', label: 'Ash', gender: 'male' },
    { id: 'echo', label: 'Echo', gender: 'male' },
    { id: 'fable', label: 'Fable', gender: 'male' },
    { id: 'onyx', label: 'Onyx', gender: 'male' }
];

// Voces multilingües del catálogo público de ElevenLabs, por si la cuenta no
// configuró las suyas. Son angloparlantes: leen español, sin acento latino.
const ELEVENLABS_FALLBACK_VOICES = { female: '21m00Tcm4TlvDq8ikWAM', male: 'onwK4e9ZLuTAKqWW03F9' };

// Voces por defecto de cada proveedor, por género. Configurables por entorno
// porque un cliente puede tener su propia voz clonada en ElevenLabs.
export const voiceIdFor = (provider, gender) => {
    if (provider === 'elevenlabs') {
        return process.env[`ELEVENLABS_VOICE_${String(gender || 'female').toUpperCase()}`]
            || process.env.ELEVENLABS_VOICE_ID
            || (gender === 'male' ? ELEVENLABS_FALLBACK_VOICES.male : ELEVENLABS_FALLBACK_VOICES.female);
    }
    if (provider === 'openai') {
        return process.env.OPENAI_TTS_VOICE
            || (gender === 'male' ? 'onyx' : gender === 'neutral' ? 'alloy' : 'nova');
    }
    return null;
};

// La voz que alguien eligió A MANO en el panel. Se valida acá y no en la
// pantalla: un id que el proveedor no conoce le costaría al usuario un viaje
// de red para recibir un 400 sin explicación.
const ELEVENLABS_VOICE_ID_RE = /^[A-Za-z0-9]{8,64}$/;
export const normalizeVoiceId = (provider, voiceId) => {
    if (voiceId == null || voiceId === '') return null;
    const v = String(voiceId).trim();
    if (provider === 'openai' && OPENAI_TTS_VOICES.some(o => o.id === v)) return v;
    if (provider === 'elevenlabs' && ELEVENLABS_VOICE_ID_RE.test(v)) return v;
    throw new TtsError('voice_not_found',
        `La voz «${v.slice(0, 40)}» no es una voz válida de ${TTS_PROVIDERS[provider]?.label || provider}. Elegí otra de la lista.`,
        { provider });
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

// ─── Diagnóstico de fallos de voz (v4.1236) ────────────────────────────────
//
// ⚠️ UN FALLO DE VOZ SE NOMBRA, NO SE RESUME. Hasta v4.1235 cualquier fallo
// —credencial vencida, cuota agotada, voz inexistente, S3 caído— terminaba en
// «No se pudo generar la narración. Revisá los avisos del Reel», y el aviso no
// siempre existía. Cada fallo lleva ahora un `code` que la pantalla traduce y
// que el registro de consumo guarda, y el mensaje dice qué hacer.
export const TTS_ERRORS = {
    empty_script:      { label: 'Guion vacío',                          retryable: false, status: 400 },
    not_configured:    { label: 'Proveedor no configurado',             retryable: false, status: 503 },
    auth:              { label: 'Credencial inválida o vencida',        retryable: false, status: 502 },
    quota:             { label: 'Límite de consumo alcanzado',          retryable: false, status: 502 },
    rate_limit:        { label: 'Demasiadas solicitudes',               retryable: true,  status: 502 },
    voice_not_found:   { label: 'Voz no disponible',                    retryable: false, status: 502 },
    model_unsupported: { label: 'Modelo incompatible',                  retryable: false, status: 502 },
    bad_request:       { label: 'Solicitud rechazada por el proveedor', retryable: false, status: 502 },
    provider_down:     { label: 'Proveedor caído',                      retryable: true,  status: 502 },
    timeout:           { label: 'Tiempo de espera agotado',             retryable: true,  status: 504 },
    network:           { label: 'Error de conexión',                    retryable: true,  status: 502 },
    empty_audio:       { label: 'Audio vacío',                          retryable: true,  status: 502 },
    script_failed:     { label: 'No se pudo escribir el guion',         retryable: true,  status: 502 },
    measure_failed:    { label: 'No se pudo medir el audio',            retryable: true,  status: 500 },
    storage:           { label: 'Fallo en el almacenamiento',           retryable: true,  status: 502 },
    mix:               { label: 'Error durante la mezcla',              retryable: true,  status: 500 },
    unsupported_reel:  { label: 'Pieza sin voz editable',               retryable: false, status: 409 },
    unknown:           { label: 'Error inesperado',                     retryable: true,  status: 500 }
};

export class TtsError extends Error {
    constructor(code, message, { provider = null, httpStatus = null, detail = null } = {}) {
        super(message);
        this.name = 'TtsError';
        this.code = TTS_ERRORS[code] ? code : 'unknown';
        this.provider = provider;
        this.httpStatus = httpStatus;
        this.detail = detail;
        this.retryable = TTS_ERRORS[this.code].retryable;
    }
}

export const asTtsError = (err, provider = null, fallbackCode = 'unknown') => {
    if (err instanceof TtsError) return err;
    return new TtsError(fallbackCode, err?.message || String(err), { provider });
};

const providerLabel = (id) => TTS_PROVIDERS[id]?.label || id || 'el proveedor de voz';

// Un 401 de OpenAI devuelve un fragmento de la clave («sk-proj-****abcd»). No
// es la clave, pero no tiene por qué llegar a la pantalla ni al registro.
const scrubSecrets = (s) => String(s || '')
    .replace(/\b(sk|xi|key)[-_][A-Za-z0-9_\-*]{4,}/gi, '$1-…')
    .replace(/\s+/g, ' ')
    .trim();

// Lee el cuerpo de error de cada proveedor y decide qué PASÓ.
//   OpenAI:     { error: { message, type, code } }
//   ElevenLabs: { detail: { status, message } } | { detail: [{ msg }] } | { detail: '…' }
export const classifyTtsFailure = (provider, httpStatus, bodyText = '', { model = null, voiceId = null } = {}) => {
    let parsed = null;
    try { parsed = JSON.parse(bodyText); } catch { /* cuerpo no JSON */ }
    const oe = parsed?.error;
    const ed = parsed?.detail;
    const providerCode = String(
        (oe && (oe.code || oe.type))
        || (ed && typeof ed === 'object' && !Array.isArray(ed) ? (ed.status || ed.code) : '')
        || ''
    ).toLowerCase();
    const rawMsg = (oe && oe.message)
        || (typeof ed === 'string' ? ed : Array.isArray(ed) ? ed.map(d => d?.msg).filter(Boolean).join('; ') : ed?.message)
        || (parsed ? '' : bodyText);
    const providerMsg = scrubSecrets(rawMsg).slice(0, 220);
    const haystack = `${providerCode} ${providerMsg}`.toLowerCase();
    const has = (...keys) => keys.some(k => haystack.includes(k));
    const name = providerLabel(provider);
    const tail = providerMsg ? ` Detalle del proveedor: «${providerMsg}».` : '';

    let code;
    // ⚠️ OpenAI contesta la cuenta SIN SALDO con un 429 —el mismo estado que
    // el límite de solicitudes— y sólo el texto los distingue («You have no
    // credits remaining. Add credits…»). Leído como 429 a secas, la pantalla
    // decía «esperá unos segundos y reintentá» a una cuenta que no se va a
    // recuperar sola (v4.1237).
    if (httpStatus === 402 || has('quota_exceeded', 'insufficient_quota', 'payment_required', 'exceeds your quota',
        'billing_hard_limit', 'no credits', 'add credits', 'credits remaining', 'out of credits', 'not enough credits', 'credit balance')) code = 'quota';
    else if (has('detected_unusual_activity')) code = 'auth';
    else if (has('voice_not_found', 'invalid_voice', "value for 'voice'", 'voice id', 'voice_id')) code = 'voice_not_found';
    else if (has('model_not_found', 'unsupported_model', 'model_not_supported', 'does not support', 'does not have access to model', 'invalid_model')) code = 'model_unsupported';
    else if (httpStatus === 401 || httpStatus === 403 || has('invalid_api_key', 'missing_permissions', 'unauthorized', 'incorrect api key')) code = 'auth';
    else if (httpStatus === 429) code = 'rate_limit';
    else if (httpStatus === 404) code = provider === 'elevenlabs' ? 'voice_not_found' : 'model_unsupported';
    else if (httpStatus >= 500) code = 'provider_down';
    else if (httpStatus === 400 || httpStatus === 422) code = 'bad_request';
    else code = 'unknown';

    const messages = {
        quota: `${name} rechazó la locución por límite de consumo: la cuenta no tiene saldo o cuota suficiente. Recargá el plan o generala con otro proveedor.${tail}`,
        auth: has('missing_permissions')
            ? `La credencial de ${name} no tiene permiso de síntesis de voz. Habilitá el permiso «Text to Speech» de la clave configurada en el despliegue.${tail}`
            : has('detected_unusual_activity')
                ? `${name} bloqueó el uso de la cuenta por actividad inusual (pasa con planes gratuitos). Hace falta un plan pago o usar otro proveedor.${tail}`
                : `${name} rechazó la credencial (HTTP ${httpStatus}). Revisá que la clave configurada en el despliegue sea válida y no esté vencida.${tail}`,
        voice_not_found: `${name} no encontró la voz ${voiceId ? `«${voiceId}»` : 'configurada'}. Elegí otra voz o corregí la voz por defecto del despliegue.${tail}`,
        model_unsupported: `${name} no reconoce el modelo de voz «${model || 'configurado'}» o la cuenta no tiene acceso a él.${tail}`,
        rate_limit: `${name} está limitando las solicitudes (HTTP 429). Esperá unos segundos y reintentá.${tail}`,
        provider_down: `${name} no está disponible en este momento (HTTP ${httpStatus}). Reintentá en unos minutos o usá otro proveedor.${tail}`,
        bad_request: `${name} rechazó la solicitud (HTTP ${httpStatus}).${tail}`,
        unknown: `${name} respondió HTTP ${httpStatus}.${tail}`
    };

    return new TtsError(code, messages[code], { provider, httpStatus, detail: providerMsg || null });
};

// ⚠️ NINGÚN FETCH A UN TERCERO SIN TOPE DE TIEMPO (regla del proyecto). Hasta
// v4.1235 la síntesis no tenía ninguno: un proveedor colgado agotaba los 120 s
// de la función y la pantalla recibía un error del borde, en texto plano.
const TTS_TIMEOUT_MS = Number(process.env.REEL_TTS_TIMEOUT_MS) || 45_000;
const STATUS_TIMEOUT_MS = 8_000;

const callProvider = async (provider, url, init = {}, timeoutMs = TTS_TIMEOUT_MS) => {
    try {
        return await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    } catch (e) {
        if (e?.name === 'TimeoutError' || e?.name === 'AbortError') {
            throw new TtsError('timeout',
                `${providerLabel(provider)} no respondió en ${Math.round(timeoutMs / 1000)} s. Reintentá o usá otro proveedor.`,
                { provider });
        }
        throw new TtsError('network',
            `No se pudo conectar con ${providerLabel(provider)} (${scrubSecrets(e?.cause?.code || e?.message || 'sin detalle')}).`,
            { provider, detail: e?.cause?.code || null });
    }
};

// Un MP3 de una frase pesa decenas de KB. Menos que esto es una respuesta 200
// sin audio, que ffmpeg no sabría medir y el montaje no podría mezclar.
const MIN_AUDIO_BYTES = 512;
const readAudio = async (provider, resp) => {
    const buffer = Buffer.from(await resp.arrayBuffer());
    if (buffer.length < MIN_AUDIO_BYTES) {
        throw new TtsError('empty_audio',
            `${providerLabel(provider)} respondió sin audio (${buffer.length} bytes). Reintentá.`, { provider });
    }
    return buffer;
};

const clampSpeed = (speed) => Math.min(1.15, Math.max(0.85, Number(speed) || 1));

// ─── Síntesis ──────────────────────────────────────────────────────────────

const synthesizeWithOpenAI = async ({ text, gender, speed, language, style, voiceId }) => {
    const model = ttsModelFor('openai');
    const voice = voiceId || voiceIdFor('openai', gender);
    const lang = NARRATION_LANGUAGES[language] || NARRATION_LANGUAGES[DEFAULT_LANGUAGE];
    const body = { model, voice, input: text, response_format: 'mp3' };
    if (/^gpt-4o/.test(model)) {
        // Los modelos gpt-4o-*-tts aceptan instrucciones de locución: es la
        // única forma de pedirle a OpenAI un acento. `tts-1` no las admite.
        const st = NARRATION_STYLES[style] || NARRATION_STYLES[DEFAULT_STYLE];
        body.instructions = `Speak in ${lang.accent}, with a ${st.descriptor} delivery.`;
    } else {
        // `speed` es la única palanca de ritmo del proveedor. Se mantiene
        // dentro de un rango imperceptible: el ajuste fino lo hace el motor
        // de tiempos reescribiendo el texto, no acelerando la voz.
        body.speed = clampSpeed(speed);
    }
    const resp = await callProvider('openai', 'https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    });
    if (!resp.ok) {
        const raw = await resp.text().catch(() => '');
        throw classifyTtsFailure('openai', resp.status, raw, { model, voiceId: voice });
    }
    return { buffer: await readAudio('openai', resp), model, voiceId: voice };
};

// ⚠️ `language_code` SÓLO PARA LOS MODELOS QUE LO ADMITEN (v4.1236). Se mandaba
// siempre, y la documentación de ElevenLabs dice que `eleven_multilingual_v2`
// —el modelo por defecto— no lo admite. Los que sí: Turbo y Flash v2.5.
const ELEVENLABS_LANGUAGE_CODE_MODELS = /^eleven_(turbo|flash)_v2_5$/;

const synthesizeWithElevenLabs = async ({ text, gender, speed, language, voiceId }) => {
    const model = ttsModelFor('elevenlabs');
    const voice = voiceId || await resolveElevenLabsVoice(gender, language);
    const lang = NARRATION_LANGUAGES[language] || NARRATION_LANGUAGES[DEFAULT_LANGUAGE];

    const body = {
        text,
        model_id: model,
        voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.3,
            use_speaker_boost: true,
            speed: clampSpeed(speed)
        }
    };
    // El código de idioma es lo que evita que una voz multilingüe lea
    // español con fonética inglesa, en los modelos que lo aceptan.
    if (ELEVENLABS_LANGUAGE_CODE_MODELS.test(model)) body.language_code = lang.locale.split('-')[0];

    const resp = await callProvider('elevenlabs',
        `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_128`, {
            method: 'POST',
            headers: {
                'xi-api-key': process.env.ELEVENLABS_API_KEY,
                'Content-Type': 'application/json',
                'Accept': 'audio/mpeg'
            },
            body: JSON.stringify(body)
        });
    if (!resp.ok) {
        const raw = await resp.text().catch(() => '');
        throw classifyTtsFailure('elevenlabs', resp.status, raw, { model, voiceId: voice });
    }
    return { buffer: await readAudio('elevenlabs', resp), model, voiceId: voice };
};

const TTS_ADAPTERS = { openai: synthesizeWithOpenAI, elevenlabs: synthesizeWithElevenLabs };

// ─── Respaldo entre proveedores ────────────────────────────────────────────
//
// ⚠️ EL RESPALDO AUTOMÁTICO ES UNA POLÍTICA, NO UN REFLEJO (v4.1236). Hasta
// v4.1235 todo fallo de ElevenLabs saltaba a OpenAI sin preguntar, y una
// elección EXPLÍCITA de proveedor que no estaba configurado se cambiaba en
// silencio por otro. Ahora:
//   · `fallback: true`  → si el pedido falla, se intenta UNA vez con el otro.
//   · `fallback: false` → se devuelve el fallo, con el respaldo como OFERTA.
//   · `fallback: null`  → manda `REEL_TTS_AUTO_FALLBACK` (encendido por
//     defecto, para que el Reel que se monta solo no salga mudo).
// Un solo intento de respaldo y nunca un bucle: cada síntesis se cobra.
export const autoFallbackEnabled = () => !/^(0|false|off|no)$/i.test(String(process.env.REEL_TTS_AUTO_FALLBACK || '').trim());

// Fallos del PROVEEDOR, en los que otro motor puede salir bien. Un guion vacío
// o un fallo de almacenamiento no se arreglan cambiando de voz.
export const FALLBACK_CODES = new Set([
    'not_configured', 'auth', 'quota', 'rate_limit', 'voice_not_found',
    'model_unsupported', 'bad_request', 'provider_down', 'timeout', 'network', 'empty_audio'
]);

export const fallbackProviderFor = (id) => availableTtsProviders().find(p => p !== id) || null;

const notConfiguredError = (id) => {
    const p = TTS_PROVIDERS[id];
    if (!p) return new TtsError('not_configured', `«${id}» no es un proveedor de voz.`, { provider: id });
    if (!p.implemented) return new TtsError('not_configured', `${p.label} todavía no está integrado como motor de voz.`, { provider: id });
    return new TtsError('not_configured',
        `${p.label} no está configurado: falta la variable ${p.envKey} en el despliegue.`, { provider: id });
};

export const synthesize = async ({
    text, provider = null, gender = 'female', speed = 1, language = DEFAULT_LANGUAGE,
    style = null, voiceId = null, fallback = null
}) => {
    const clean = String(text || '').trim();
    if (!clean) {
        throw new TtsError('empty_script', 'El texto de la voz en off está vacío: escribí o generá un guion antes de sintetizar.');
    }
    const allowFallback = fallback == null ? autoFallbackEnabled() : Boolean(fallback);
    const requested = provider || activeTtsProvider();
    if (!requested) {
        throw new TtsError('not_configured', 'No hay ningún proveedor de voz configurado: falta ELEVENLABS_API_KEY u OPENAI_API_KEY en el despliegue.');
    }

    const run = async (id, chosenVoice) => {
        if (!isTtsAvailable(id)) throw notConfiguredError(id);
        const out = await TTS_ADAPTERS[id]({ text: clean, gender, speed, language, style, voiceId: chosenVoice });
        return { buffer: out.buffer, provider: id, model: out.model, voiceId: out.voiceId };
    };

    let first;
    try {
        // La voz elegida a mano es de ESE proveedor: en el respaldo no sirve.
        return await run(requested, normalizeVoiceId(requested, voiceId));
    } catch (err) {
        first = asTtsError(err, requested);
    }

    const alt = allowFallback && FALLBACK_CODES.has(first.code) ? fallbackProviderFor(requested) : null;
    if (!alt) throw first;

    console.warn(`[REEL NARRATION] ${providerLabel(requested)} falló (${first.code}: ${first.message}). Respaldo con ${providerLabel(alt)}…`);
    try {
        const out = await run(alt, null);
        return { ...out, fallbackFrom: requested, fallbackReason: first.message, fallbackCode: first.code };
    } catch (err2) {
        const second = asTtsError(err2, alt);
        // Se informa el fallo del proveedor PEDIDO —es lo que hay que corregir—
        // con el del respaldo al lado.
        const combined = new TtsError(first.code,
            `${first.message} El respaldo con ${providerLabel(alt)} también falló: ${second.message}`,
            { provider: requested, httpStatus: first.httpStatus, detail: first.detail });
        combined.fallbackError = { provider: alt, code: second.code, message: second.message };
        throw combined;
    }
};

// ─── Muestra de la voz ─────────────────────────────────────────────────────
//
// Una frase fija y corta (~90 caracteres) para escuchar la voz ANTES de
// sintetizar el guion entero. Sin respaldo: una muestra de otro proveedor
// no muestra la voz que se eligió.
const SAMPLE_TEXT = {
    Spanish: 'Hola. Así suena la voz que va a narrar este Reel: clara, cercana y al servicio de la comunidad.',
    English: 'Hello. This is the voice that will narrate this Reel: clear, warm and at the service of the community.',
    Portuguese: 'Olá. Esta é a voz que vai narrar este Reel: clara, próxima e a serviço da comunidade.',
    French: 'Bonjour. Voici la voix qui racontera ce Reel : claire, chaleureuse et au service de la communauté.',
    Italian: 'Ciao. Questa è la voce che racconterà questo Reel: chiara, vicina e al servizio della comunità.'
};

export const sampleTextFor = (language) => {
    const lang = NARRATION_LANGUAGES[language] || NARRATION_LANGUAGES[DEFAULT_LANGUAGE];
    return SAMPLE_TEXT[lang.tongue] || SAMPLE_TEXT.Spanish;
};

export const previewVoice = ({ provider, gender = 'female', language = DEFAULT_LANGUAGE, style = null, speed = 1, voiceId = null }) =>
    synthesize({ text: sampleTextFor(language), provider, gender, language, style, speed, voiceId, fallback: false });

// ─── Estado de los proveedores ─────────────────────────────────────────────
//
// Lo que el panel muestra en cada tarjeta: si la credencial existe, si el
// proveedor la ACEPTA, cuánta cuota queda (cuando el proveedor la informa) y
// qué voces tiene la cuenta. Se consulta con llamadas de LECTURA, que no
// sintetizan nada ni consumen cuota. Cinco minutos de caché por instancia:
// abrir la ficha de diez Reels no son veinte llamadas a cada proveedor.
const STATUS_TTL_MS = 5 * 60_000;
const statusCache = new Map();

const readJson = async (resp) => {
    const raw = await resp.text().catch(() => '');
    try { return { raw, data: JSON.parse(raw) }; } catch { return { raw, data: null }; }
};

const elevenLabsVoices = async () => {
    try {
        const resp = await callProvider('elevenlabs', 'https://api.elevenlabs.io/v1/voices',
            { headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY } }, STATUS_TIMEOUT_MS);
        if (!resp.ok) return null;
        const { data } = await readJson(resp);
        const voices = Array.isArray(data?.voices) ? data.voices : [];
        return voices.slice(0, 120).map(v => {
            const labels = v.labels || {};
            // Las voces de la biblioteca declaran sus idiomas verificados con
            // acento y locale («es» · «colombian» · «es-CO»): es el dato más
            // fiable para elegir una voz colombiana.
            const verified = Array.isArray(v.verified_languages) ? v.verified_languages : [];
            const es = verified.find(l => String(l?.language || '').toLowerCase() === 'es');
            return {
                id: v.voice_id,
                label: v.name,
                gender: labels.gender === 'male' || labels.gender === 'female' ? labels.gender : 'neutral',
                accent: labels.accent || es?.accent || null,
                language: labels.language || es?.language || verified[0]?.language || v.fine_tuning?.language || null,
                locales: verified.map(l => l?.locale).filter(Boolean),
                category: v.category || null
            };
        }).filter(v => v.id && v.label);
    } catch {
        return null;
    }
};

const LATIN_ACCENT_RE = /(colombi|latin|mexic|argentin|chile|peru|venezol|spanish|español|castil|es-)/i;

// ─── La voz automática de ElevenLabs (v4.1237) ─────────────────────────────
//
// ⚠️ SIN VOZ CONFIGURADA, LA VOZ SALE DE LA CUENTA, no de un id fijo. Hasta
// v4.1236 «Automática» era Rachel / Daniel del catálogo público: dos voces
// angloparlantes que además ya no están en las cuentas nuevas (`/v1/voices`
// no las lista), así que pedir ElevenLabs sin elegir voz podía fallar o sonar
// a inglés. Ahora se elige la voz de la cuenta que mejor encaja: el idioma
// del Reel, el acento de la región pedida y el género.
const REGION_ACCENT = {
    'es-CO': /colombi/i,
    'es-419': /(latin|neutral|colombi|mexic)/i,
    'es-MX': /mexic/i,
    'es-AR': /(argentin|rioplat)/i,
    'es-ES': /(castil|spain|peninsular|european|españa)/i,
    'en-US': /(american|us)/i,
    'pt-BR': /(brazil|brasil)/i
};
const TONGUE_CODE = { Spanish: 'es', English: 'en', Portuguese: 'pt', French: 'fr', Italian: 'it' };

export const pickAccountVoice = (voices, { gender = 'female', language = DEFAULT_LANGUAGE } = {}) => {
    if (!Array.isArray(voices) || !voices.length) return null;
    const lang = NARRATION_LANGUAGES[language] || NARRATION_LANGUAGES[DEFAULT_LANGUAGE];
    const code = TONGUE_CODE[lang.tongue] || 'es';
    const accentRe = REGION_ACCENT[lang.locale] || null;
    const score = (v) => {
        const text = `${v.accent || ''} ${v.language || ''} ${(v.locales || []).join(' ')}`.toLowerCase();
        let s = 0;
        const speaks = (v.locales || []).some(l => String(l).toLowerCase().startsWith(code))
            || String(v.language || '').toLowerCase().startsWith(code)
            || (code === 'es' && LATIN_ACCENT_RE.test(text));
        if (speaks) s += 4;
        if (accentRe && accentRe.test(text)) s += 3;
        if ((v.locales || []).some(l => String(l).toLowerCase() === lang.locale.toLowerCase())) s += 2;
        if (v.gender === gender) s += 2;
        else if (v.gender === 'neutral') s += 0.5;
        // El género pedido manda sobre el acento: una voz femenina colombiana
        // no reemplaza a una masculina pedida.
        else s -= 10;
        return s;
    };
    return voices.map(v => ({ v, s: score(v) })).sort((a, b) => b.s - a.s)[0].v;
};

const VOICES_TTL_MS = 5 * 60_000;
let accountVoicesCache = { at: 0, list: null };
const accountVoices = async () => {
    if (accountVoicesCache.list && Date.now() - accountVoicesCache.at < VOICES_TTL_MS) return accountVoicesCache.list;
    const list = await elevenLabsVoices();
    if (list && list.length) accountVoicesCache = { at: Date.now(), list };
    return list;
};

// Sólo para las pruebas: vacía las cachés de estado y de voces.
export const resetTtsCaches = () => { statusCache.clear(); accountVoicesCache = { at: 0, list: null }; };

// La voz que usa ElevenLabs cuando nadie eligió una: la del entorno si está
// configurada; si no, la mejor de la cuenta; y sólo si la cuenta no se pudo
// leer, la del catálogo público.
export const resolveElevenLabsVoice = async (gender = 'female', language = DEFAULT_LANGUAGE) => {
    const fromEnv = process.env[`ELEVENLABS_VOICE_${String(gender || 'female').toUpperCase()}`] || process.env.ELEVENLABS_VOICE_ID;
    if (fromEnv) return fromEnv;
    const picked = pickAccountVoice(await accountVoices(), { gender, language });
    return picked?.id || voiceIdFor('elevenlabs', gender);
};

const checkElevenLabs = async (base) => {
    const resp = await callProvider('elevenlabs', 'https://api.elevenlabs.io/v1/user/subscription',
        { headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY } }, STATUS_TIMEOUT_MS);
    const { raw, data } = await readJson(resp);
    const out = { ...base };

    if (resp.ok && data) {
        const used = Number(data.character_count) || 0;
        const limit = Number(data.character_limit) || 0;
        out.quota = {
            used, limit,
            remaining: Math.max(0, limit - used),
            unit: 'caracteres',
            resetsAt: data.next_character_count_reset_unix ? new Date(data.next_character_count_reset_unix * 1000).toISOString() : null,
            tier: data.tier || null
        };
        if (limit > 0 && used >= limit) {
            out.state = 'quota';
            out.message = `La cuenta agotó su cuota mensual (${used.toLocaleString('es-CO')} de ${limit.toLocaleString('es-CO')} caracteres).`;
        } else {
            out.state = 'ok';
            out.message = limit > 0
                ? `Conectado. Quedan ${out.quota.remaining.toLocaleString('es-CO')} de ${limit.toLocaleString('es-CO')} caracteres este ciclo.`
                : 'Conectado.';
        }
    } else {
        const err = classifyTtsFailure('elevenlabs', resp.status, raw);
        if (err.code === 'auth' && /missing_permissions/i.test(raw)) {
            // La clave existe y el proveedor la reconoce: sólo no puede leer la
            // cuenta. La síntesis puede funcionar igual (permiso distinto).
            out.state = 'ok';
            out.message = 'Credencial reconocida, sin permiso para leer la cuota: el consumo se verá al generar.';
        } else {
            out.state = err.code;
            out.message = err.message;
        }
    }

    const voices = await accountVoices();
    const defaults = { female: voiceIdFor('elevenlabs', 'female'), male: voiceIdFor('elevenlabs', 'male') };
    if (voices) {
        // Las voces latinas primero: es lo que se busca para un Reel en español.
        voices.sort((a, b) => Number(LATIN_ACCENT_RE.test(`${b.accent} ${b.language}`)) - Number(LATIN_ACCENT_RE.test(`${a.accent} ${a.language}`)));
        out.voices = voices;
        // Qué voz usa «Automática», por género, para la región por defecto.
        // Una voz fijada por entorno manda; si no está en la cuenta, se avisa.
        out.autoVoices = {};
        for (const g of ['female', 'male']) {
            const fromEnv = process.env[`ELEVENLABS_VOICE_${g.toUpperCase()}`] || process.env.ELEVENLABS_VOICE_ID;
            const v = fromEnv ? voices.find(x => x.id === fromEnv) : pickAccountVoice(voices, { gender: g, language: DEFAULT_LANGUAGE });
            if (v) out.autoVoices[g] = { id: v.id, label: v.label, accent: v.accent || null };
            else if (fromEnv) out.warnings.push(`La voz ${g === 'male' ? 'masculina' : 'femenina'} configurada en el despliegue (${fromEnv}) no está en la cuenta: elegí una voz de la lista.`);
        }
        const latin = voices.filter(v => LATIN_ACCENT_RE.test(`${v.accent} ${v.language}`));
        out.accentNote = latin.length
            ? `${latin.length === 1 ? 'Una voz' : `${latin.length} voces`} con acento hispano en la cuenta.`
            : 'La cuenta no tiene voces con acento latino: el español sale con la voz multilingüe por defecto, sin acento colombiano.';
    } else {
        out.voices = Object.entries(defaults).map(([g, id]) => ({ id, label: `Voz por defecto (${g === 'male' ? 'masculina' : 'femenina'})`, gender: g, accent: null, language: null, category: 'default' }));
        out.autoVoices = null;
    }
    return out;
};

const checkOpenAI = async (base) => {
    const model = ttsModelFor('openai');
    const resp = await callProvider('openai', `https://api.openai.com/v1/models/${encodeURIComponent(model)}`,
        { headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` } }, STATUS_TIMEOUT_MS);
    const out = { ...base, voices: OPENAI_TTS_VOICES.map(v => ({ ...v, accent: null, language: null, category: 'catalog' })) };
    if (resp.ok) {
        out.state = 'ok';
        // OpenAI no expone el saldo por API: decirlo es mejor que mostrar un
        // «disponible» que la primera síntesis puede desmentir.
        out.message = `Conectado (modelo ${model}). OpenAI no informa el saldo por API: un límite de consumo se detecta al generar.`;
    } else {
        const { raw } = await readJson(resp);
        const err = classifyTtsFailure('openai', resp.status, raw, { model });
        out.state = err.code;
        out.message = err.message;
    }
    return out;
};

export const checkTtsProvider = async (id, { force = false } = {}) => {
    const p = TTS_PROVIDERS[id];
    if (!p) return null;
    const cached = statusCache.get(id);
    if (!force && cached && Date.now() - cached.at < STATUS_TTL_MS) return cached.value;

    const base = {
        id, label: p.label,
        model: ttsModelFor(id),
        implemented: Boolean(p.implemented),
        configured: isTtsAvailable(id),
        accentControl: p.accentControl,
        voiceChoice: Boolean(p.voiceChoice),
        languages: p.languages || null,
        billing: p.billing || null,
        note: p.note || null,
        isDefault: id === activeTtsProvider(),
        state: 'unknown', message: null,
        quota: null, voices: [], autoVoices: null, warnings: [], accentNote: null, lastFailure: null,
        checkedAt: new Date().toISOString(), latencyMs: null
    };

    let value;
    if (!p.implemented) {
        value = { ...base, state: 'not_implemented', message: p.note };
    } else if (!base.configured) {
        value = { ...base, state: 'not_configured', message: notConfiguredError(id).message };
    } else {
        const startedAt = Date.now();
        try {
            value = id === 'elevenlabs' ? await checkElevenLabs(base) : await checkOpenAI(base);
        } catch (e) {
            const err = asTtsError(e, id);
            value = { ...base, state: err.code, message: err.message };
        }
        value.latencyMs = Date.now() - startedAt;
    }
    statusCache.set(id, { at: Date.now(), value });
    return value;
};

export const ttsProvidersStatus = async ({ force = false } = {}) => {
    const ids = Object.keys(TTS_PROVIDERS).filter(id => TTS_PROVIDERS[id].implemented);
    return Promise.all(ids.map(id => checkTtsProvider(id, { force })));
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
    sourceContext = null,
    // La voz elegida a mano y la política de respaldo (v4.1236). Ver
    // `synthesize`: `fallback: null` deja decidir a la configuración.
    voiceId = null, fallback = null
}) => {
    const budget = computeWordBudget({ durationSec, language, style, speed });
    const target = budget.availableSec;
    const attempts = [];

    let wordAdjustment = 0;
    let best = null;

    let currentTtsProvider = ttsProvider;
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
            }).catch(e => {
                throw new TtsError('script_failed', `No se pudo escribir el guion con IA: ${e.message} Podés escribirlo a mano y generar la voz igual.`);
            });

        // La voz elegida a mano es del proveedor pedido: si un intento anterior
        // ya conmutó al respaldo, se sigue con la voz por defecto del respaldo.
        const voice = await synthesize({
            text: written.script, provider: currentTtsProvider, gender, speed, language, style,
            voiceId: currentTtsProvider === ttsProvider ? voiceId : null,
            fallback
        });
        if (voice.provider && voice.provider !== currentTtsProvider) {
            currentTtsProvider = voice.provider;
        }
        let actualSec;
        try {
            actualSec = await measureAudio(voice.buffer);
        } catch (e) {
            throw new TtsError('measure_failed', `El audio se generó pero no se pudo medir su duración: ${e.message}`, { provider: voice.provider });
        }

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
        ttsModel: best.voice.model || null,
        voiceId: best.voice.voiceId,
        fallbackFrom: best.voice.fallbackFrom || null,
        fallbackReason: best.voice.fallbackReason || null,
        fallbackCode: best.voice.fallbackCode || null,
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
