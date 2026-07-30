// ════════════════════════════════════════════════════════════════════════════
// Fuente de verdad del módulo de traducción — v4.661
//
// Aquí viven los idiomas, sus locales, los proveedores disponibles y las reglas
// que deciden QUÉ se traduce y qué no. El resto del módulo (proveedores, caché,
// rutas, panel) lee de aquí; nada de esto se repite en otro archivo.
//
// Agregar un idioma = una entrada en LOCALES. Agregar un proveedor = una entrada
// en PROVIDERS + su función en translationProviders.js.
// ════════════════════════════════════════════════════════════════════════════

// ── Idiomas ────────────────────────────────────────────────────────────────
// `code` es lo que manda el navegador y lo que se guarda en la caché.
// `locale` es el BCP-47 completo: gobierna fechas, horas, monedas y separadores.
// `name` es el nombre en su propio idioma (así se ve en el selector).
// El orden es el del selector de la barra superior.
export const LOCALES = [
    { code: 'es', locale: 'es-CO', name: 'Español', english: 'Spanish', flag: 'co', base: true },
    { code: 'en', locale: 'en-US', name: 'English', english: 'English', flag: 'us' },
    { code: 'fr', locale: 'fr-FR', name: 'Français', english: 'French', flag: 'fr' },
    { code: 'pt', locale: 'pt-BR', name: 'Português', english: 'Portuguese', flag: 'br' },
    { code: 'de', locale: 'de-DE', name: 'Deutsch', english: 'German', flag: 'de' },
    { code: 'it', locale: 'it-IT', name: 'Italiano', english: 'Italian', flag: 'it' },
    { code: 'ja', locale: 'ja-JP', name: '日本語', english: 'Japanese', flag: 'jp' },
    { code: 'ko', locale: 'ko-KR', name: '한국어', english: 'Korean', flag: 'kr' },
];

// El idioma en el que está escrito el contenido original del sitio. Todo lo que
// el administrador carga se asume en este idioma; es el origen de cada traducción
// y el último recurso del fallback.
export const BASE_LANG = 'es';

export const LANG_CODES = LOCALES.map(l => l.code);
export const TARGET_LANGS = LANG_CODES.filter(c => c !== BASE_LANG);

export const isSupportedLang = code => LANG_CODES.includes(code);
export const localeOf = code => LOCALES.find(l => l.code === code)?.locale || 'es-CO';
export const englishNameOf = code => LOCALES.find(l => l.code === code)?.english || code;

// ── Proveedores ────────────────────────────────────────────────────────────
// La capa es DESACOPLADA a propósito: el proveedor se elige desde el panel
// (Setting `translation::provider`) y no exige tocar código ni desplegar.
//
// `envKey` es la variable de entorno con la credencial. `batch` es cuántos
// textos se mandan por llamada: los modelos de lenguaje aguantan lotes grandes,
// las APIs de traducción tienen límites por petición más estrictos.
export const PROVIDERS = {
    gemini: {
        label: 'Google Gemini 2.5 Flash',
        envKey: 'GEMINI_API_KEY',
        kind: 'llm',
        batch: 40,
        note: 'Modelo de lenguaje. Buen contexto institucional, coste muy bajo.',
    },
    openai: {
        label: 'OpenAI GPT-4o mini',
        envKey: 'OPENAI_API_KEY',
        kind: 'llm',
        batch: 40,
        note: 'Modelo de lenguaje. Ya configurado en el sitio para otros módulos.',
    },
    deepl: {
        label: 'DeepL',
        envKey: 'DEEPL_API_KEY',
        kind: 'mt',
        batch: 50,
        note: 'Traductor especializado. La mejor calidad en idiomas europeos.',
    },
    google: {
        label: 'Google Cloud Translation',
        envKey: 'GOOGLE_TRANSLATE_API_KEY',
        kind: 'mt',
        batch: 100,
        note: 'Traductor especializado. Cobertura amplia y muy rápido.',
    },
    azure: {
        label: 'Azure AI Translator',
        envKey: 'AZURE_TRANSLATOR_KEY',
        kind: 'mt',
        batch: 100,
        note: 'Traductor especializado. Requiere además AZURE_TRANSLATOR_REGION.',
    },
};

export const DEFAULT_PROVIDER = 'gemini';
export const PROVIDER_KEYS = Object.keys(PROVIDERS);

/** Un proveedor está disponible cuando su credencial existe en el entorno. */
export function providerAvailable(key) {
    const p = PROVIDERS[key];
    if (!p) return false;
    if (key === 'azure') return !!process.env[p.envKey] && !!process.env.AZURE_TRANSLATOR_REGION;
    return !!process.env[p.envKey];
}

export function availableProviders() {
    return PROVIDER_KEYS.filter(providerAvailable);
}

// ── Nombres que NO se traducen ─────────────────────────────────────────────
// Marcas e identidad institucional. Un traductor automático convierte "Rotary"
// en "Rotario" o "ロータリー" según el idioma, y eso rompe la identidad de marca
// que la Fundación exige mantener literal.
export const PROTECTED_TERMS = [
    'Rotary', 'Rotary International', 'Rotaract', 'Interact',
    'Rotary Foundation', 'La Fundación Rotaria', 'The Rotary Foundation',
    'Endpolio.org', 'My Rotary', 'PolioPlus', 'ClubPlatform',
    'Distrito 4281', 'District 4281', 'CADRES', 'Valkomen',
];

// ── Qué NUNCA se manda a traducir ──────────────────────────────────────────
// Estos patrones se evalúan sobre el texto COMPLETO (ya recortado). Si alguno
// acierta, el texto se devuelve tal cual: ni se gasta una llamada al proveedor
// ni se corre el riesgo de que el modelo "traduzca" un correo o un identificador.
//
// El orden importa poco porque son excluyentes entre sí, pero el criterio sí:
// se trata de datos, no de lenguaje.
const NEVER_TRANSLATE = [
    /^\s*$/,                                     // vacío
    /^[\d\s.,:/+\-()%$€£¥]+$/,                   // sólo cifras y puntuación: cantidades, fechas numéricas
    // Importes con símbolo o código de moneda: "$450 USD", "COP 1.250.000",
    // "€ 89,90". El código de moneda es un identificador, no una palabra: un
    // traductor que convierta "USD" en "dólares" descuadra un precio publicado.
    /^[$€£¥]?\s*[\d][\d.,\s]*\s*(?:USD|COP|EUR|GBP|JPY|KRW|BRL|MXN|ARS|CLP|PEN|CHF|CAD|AUD)?$/i,
    /^(?:USD|COP|EUR|GBP|JPY|KRW|BRL|MXN|ARS|CLP|PEN|CHF|CAD|AUD)\s*[$€£¥]?\s*[\d][\d.,\s]*$/i,
    /^https?:\/\//i,                             // URLs
    /^www\./i,
    /^[\w.+-]+@[\w-]+\.[\w.]+$/,                 // correos
    /^[+()\d][\d\s()+-]{5,}$/,                   // teléfonos
    /^#[\dA-Fa-f]{3,8}$/,                        // colores
    /^[A-Z0-9]{2,}(?:[-_][A-Z0-9]+)+$/,          // códigos: RC-2027-014, EVT_XII
    /^[0-9a-f]{8}-[0-9a-f]{4}-/i,                // UUID
    /^[@#][\w.]+$/,                              // usuarios y etiquetas de redes
    /^[\p{Emoji_Presentation}\p{Extended_Pictographic}\s]+$/u, // sólo emoji
];

// Longitud mínima: por debajo de esto no hay lenguaje que traducir, sólo ruido
// ("Sí", "OK", "»"). Dos caracteres deja pasar "Ir" y frena la puntuación suelta.
export const MIN_LEN = 2;

// Techo por texto. Un nodo más largo que esto no es una etiqueta de interfaz
// sino un documento entero; se traduce igual, pero conviene saber que existe.
export const MAX_LEN = 5000;

/**
 * ¿Este texto es lenguaje traducible, o es un dato?
 * Devuelve false para lo segundo. Es la barrera que impide que el módulo
 * "traduzca" correos, teléfonos, códigos, cifras, URLs e identificadores.
 */
export function isTranslatable(text) {
    if (typeof text !== 'string') return false;
    const t = text.trim();
    if (t.length < MIN_LEN || t.length > MAX_LEN) return false;
    if (NEVER_TRANSLATE.some(re => re.test(t))) return false;
    // Un texto que es EXACTAMENTE un término protegido tampoco se manda.
    if (PROTECTED_TERMS.some(term => term.toLowerCase() === t.toLowerCase())) return false;
    // Tiene que haber al menos una letra: si no, es puntuación o símbolos.
    if (!/\p{L}/u.test(t)) return false;
    return true;
}

// ── Clasificación del contenido ────────────────────────────────────────────
// Los tres tipos que distingue el módulo, y que el panel muestra por separado.
export const CONTENT_KINDS = {
    // Textos del sistema: botones, menús, mensajes, validaciones. Nacen en el
    // código o en las plantillas del servidor.
    system: { label: 'Textos del sistema', translate: true },
    // Contenido administrado: lo que el administrador carga desde el panel
    // (eventos, noticias, proyectos, páginas). Admite traducción manual.
    managed: { label: 'Contenido administrado', translate: true },
    // Datos: nombres propios, correos, teléfonos, códigos, cifras. No se tocan.
    opaque: { label: 'Datos sin traducir', translate: false },
};

export const DEFAULT_KIND = 'managed';

// ── Estados de una traducción ──────────────────────────────────────────────
// `approved` es el estado que protege el trabajo humano: una traducción marcada
// como aprobada NO se sobrescribe con la del proveedor, nunca.
export const STATUSES = {
    auto: { label: 'Automática', editable: true, overwritable: true },
    manual: { label: 'Manual', editable: true, overwritable: false },
    approved: { label: 'Aprobada', editable: true, overwritable: false },
    failed: { label: 'Falló', editable: true, overwritable: true },
};

export const SETTLED_STATUSES = ['manual', 'approved'];

/** ¿Puede el proveedor pisar esta fila? Sólo si nadie la tocó a mano. */
export const isOverwritable = status => !SETTLED_STATUSES.includes(status);

// ── Instrucción común a todos los proveedores de tipo modelo ───────────────
// Corta y en positivo, misma doctrina que el resto del sitio: las listas de
// prohibiciones hacen que el modelo se obsesione con lo prohibido.
export function llmInstruction(targetLang) {
    return [
        `Traduce al ${englishNameOf(targetLang)} (${localeOf(targetLang)}).`,
        'Es el sitio web público de un distrito de Rotary International.',
        `Conserva literales estos nombres: ${PROTECTED_TERMS.slice(0, 12).join(', ')}.`,
        'Conserva las etiquetas HTML, los saltos de línea, las cifras, los correos y las direcciones web tal como están.',
        'Devuelve una traducción natural, del mismo registro institucional y de largo parecido.',
    ].join(' ');
}

export default {
    LOCALES, BASE_LANG, LANG_CODES, TARGET_LANGS,
    PROVIDERS, DEFAULT_PROVIDER, PROVIDER_KEYS,
    PROTECTED_TERMS, CONTENT_KINDS, DEFAULT_KIND, STATUSES,
    MIN_LEN, MAX_LEN,
    isSupportedLang, localeOf, englishNameOf,
    providerAvailable, availableProviders,
    isTranslatable, isOverwritable, llmInstruction,
};
