// ════════════════════════════════════════════════════════════════════
// Voces de locución — el CRITERIO, puro
// v4.1058.0
//
// Catálogo de idiomas/acentos, géneros, estilos y el presupuesto de palabras.
// Sin base, sin red, sin proveedores: sólo aritmética y tablas.
//
// ⚠️ POR QUÉ VIVE APARTE DE `reelNarration.js`. Aquél importa el redactor
// (`copywritingService`), que a su vez importa credenciales y clientes HTTP:
// cualquier módulo PURO que necesitara el catálogo de voces —el criterio del
// Reel de una solicitud, por ejemplo— arrastraba esa cadena entera y dejaba de
// poder probarse sin credenciales. La alternativa era copiar el catálogo, y una
// copia se separa en silencio: la pantalla ofrecería un acento que el motor no
// sabe pedir.
//
// `reelNarration.js` RE-EXPORTA todo lo de acá, así que ninguna de sus
// importaciones existentes cambia. Un consumidor nuevo que sólo necesite el
// criterio importa este archivo.
// ════════════════════════════════════════════════════════════════════

// ─── Idiomas y acentos ─────────────────────────────────────────────────────
//
// `wordsPerSecond` es el ritmo real de LOCUCIÓN, no de lectura silenciosa. Los
// valores salen del mismo criterio que ya usa el Generador de Outros
// (`VOICE_LANGUAGES` en `outroSpec.js`), donde llevan tiempo funcionando.
//
// ⚠️ ESTE CATÁLOGO NO SE INVENTA NI SE AMPLÍA A OJO. Cada entrada declara un
// acento que un motor de voz real puede producir; si se agrega una región, hay
// que comprobar que el proveedor activo sepa hacerla — y si no sabe, el
// `accentControl` de su registro es lo que lo DICE en la pantalla. Ofrecer una
// región que el motor no distingue es prometer un acento que no va a salir.
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
export const DEFAULT_GENDER = 'female';

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

// ─── Catálogos CERRADOS ────────────────────────────────────────────────────
//
// Un idioma o un género que no estén acá no se guardan: terminarían en la
// petición al proveedor y saldría un rechazo que no explica nada. Es la misma
// puerta que `MUSIC_CHOICE_IDS` en el plan del Reel.

export const isVoiceLanguage = (id) => Boolean(id && Object.hasOwn(NARRATION_LANGUAGES, id));
export const isVoiceGender = (id) => Boolean(id && Object.hasOwn(NARRATION_GENDERS, id));
export const isVoiceStyle = (id) => Boolean(id && Object.hasOwn(NARRATION_STYLES, id));

export const voiceLanguageLabel = (id) => NARRATION_LANGUAGES[id]?.label || null;
export const voiceGenderLabel = (id) => NARRATION_GENDERS[id]?.label || null;
export const voiceStyleLabel = (id) => NARRATION_STYLES[id]?.label || null;

// Lo que pinta un selector. Se ordena por el catálogo declarado, no por
// alfabeto: el español colombiano va primero porque es el caso normal de este
// cliente, y un orden alfabético lo mandaría al medio de la lista.
export const voiceLanguageOptions = () => Object.entries(NARRATION_LANGUAGES).map(([id, l]) => ({
    id,
    label: l.label,
    accent: l.accent,
    tongue: l.tongue,
    wordsPerSecond: l.wordsPerSecond,
    isDefault: Boolean(l.isDefault)
}));

export const voiceGenderOptions = () => Object.entries(NARRATION_GENDERS).map(([id, g]) => ({
    id, label: g.label, isDefault: id === DEFAULT_GENDER
}));

export const voiceStyleOptions = () => Object.entries(NARRATION_STYLES).map(([id, s]) => ({
    id, label: s.label, pace: s.pace, isDefault: Boolean(s.isDefault)
}));

// ─── Presupuesto de palabras ───────────────────────────────────────────────
//
// Cuántas palabras entran en el tiempo disponible. `padding` es el silencio que
// se deja al principio y al final: arrancar pegado al primer fotograma suena a
// error, y terminar pegado al último corta la última sílaba.
export const LEAD_IN_SEC = 0.35;
export const TAIL_SEC = 0.45;

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
//
// ⚠️ ES UNA ESTIMACIÓN Y SE DICE ASÍ. La duración real se MIDE del MP3 con
// ffmpeg (`fitNarrationToDuration`): este número sirve para avisar antes de
// gastar la síntesis, nunca para decidir que un guion encaja.
export const estimateDuration = (text, { language = DEFAULT_LANGUAGE, style = DEFAULT_STYLE, speed = 1 } = {}) => {
    const lang = NARRATION_LANGUAGES[language] || NARRATION_LANGUAGES[DEFAULT_LANGUAGE];
    const st = NARRATION_STYLES[style] || NARRATION_STYLES[DEFAULT_STYLE];
    const wps = lang.wordsPerSecond * st.pace * (speed || 1);

    const words = countWords(text);
    const commas = (String(text).match(/[,;:]/g) || []).length;
    const stops = (String(text).match(/[.!?…]/g) || []).length;

    return Number((words / wps + commas * 0.2 + stops * 0.4).toFixed(2));
};
