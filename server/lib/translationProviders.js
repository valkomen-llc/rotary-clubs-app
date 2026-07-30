// ════════════════════════════════════════════════════════════════════════════
// Capa de proveedores de traducción — v4.661
//
// Cada adaptador recibe (textos[], idiomaDestino, idiomaOrigen) y devuelve un
// array de traducciones DEL MISMO LARGO Y EN EL MISMO ORDEN. Si no puede
// garantizarlo, lanza: es preferible un error visible en el panel a una
// respuesta desalineada, donde cada texto acaba con la traducción de otro.
//
// El proveedor activo se elige desde el panel y no exige tocar código. Agregar
// uno = una entrada en PROVIDERS (translationSpec.js) + su función aquí.
//
// Dos familias, y la diferencia importa:
//   · 'mt'  (DeepL, Google, Azure) — reciben un array y devuelven un array. El
//           alineamiento lo garantiza la API; no hay nada que interpretar.
//   · 'llm' (Gemini, OpenAI) — devuelven texto. Se les pide JSON y se valida el
//           largo. Hasta v4.660 se les pedía una lista numerada que luego se
//           deshacía con una expresión regular por índice: bastaba que una
//           traducción contuviera un "[2]" o que el modelo se saltara una línea
//           para que todo lo siguiente se corriera de lugar.
// ════════════════════════════════════════════════════════════════════════════
import { englishNameOf, llmInstruction, PROVIDERS } from './translationSpec.js';

// ── Utilidades ─────────────────────────────────────────────────────────────

/** Extrae el primer array JSON de una respuesta que puede venir con adornos. */
function parseJsonArray(raw) {
    const text = String(raw || '').trim()
        // Los modelos suelen envolver en ```json ... ```
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/, '');
    try {
        const direct = JSON.parse(text);
        if (Array.isArray(direct)) return direct;
        // Algunos modelos devuelven { translations: [...] } aunque se pida array.
        for (const k of ['translations', 'result', 'items', 'data']) {
            if (Array.isArray(direct?.[k])) return direct[k];
        }
    } catch { /* sigue abajo */ }
    const start = text.indexOf('[');
    const end = text.lastIndexOf(']');
    if (start !== -1 && end > start) {
        try {
            const arr = JSON.parse(text.slice(start, end + 1));
            if (Array.isArray(arr)) return arr;
        } catch { /* no hay nada que rescatar */ }
    }
    throw new Error('El proveedor no devolvió un array JSON interpretable.');
}

/** Verifica el contrato: mismo largo, todo cadena y nada vacío. */
function align(out, texts, provider) {
    if (!Array.isArray(out) || out.length !== texts.length) {
        throw new Error(
            `${provider} devolvió ${Array.isArray(out) ? out.length : 'algo que no es un array'} ` +
            `para ${texts.length} textos. Se descarta el lote entero para no desalinear las traducciones.`,
        );
    }
    return out.map((v, i) => {
        const s = typeof v === 'string' ? v.trim() : '';
        // Un hueco vacío se rellena con el original: es preferible una frase sin
        // traducir a un hueco en blanco en la pantalla.
        return s || texts[i];
    });
}

/** Google Cloud Translation escapa entidades HTML incluso con format:'text'. */
function unescapeHtml(s) {
    return String(s)
        .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d))
        .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
        .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&'); // &amp; al final o se re-desescapa lo anterior
}

async function postJson(url, body, headers = {}, timeoutMs = 45000) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        const r = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...headers },
            body: JSON.stringify(body),
            signal: ctrl.signal,
        });
        const text = await r.text();
        if (!r.ok) throw new Error(`HTTP ${r.status}: ${text.slice(0, 300)}`);
        try { return JSON.parse(text); }
        catch { throw new Error(`Respuesta no-JSON: ${text.slice(0, 200)}`); }
    } catch (e) {
        if (e.name === 'AbortError') throw new Error(`Sin respuesta tras ${timeoutMs / 1000}s.`);
        throw e;
    } finally {
        clearTimeout(timer);
    }
}

// ── Gemini ─────────────────────────────────────────────────────────────────
// Se pide `responseMimeType: application/json` con esquema de array de cadenas:
// así el propio modelo garantiza la forma y no hay que interpretarla.
const GEMINI_MODEL = process.env.GEMINI_TRANSLATE_MODEL || 'gemini-2.5-flash';

async function translateGemini(texts, targetLang) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error('Falta GEMINI_API_KEY.');

    const data = await postJson(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`,
        {
            systemInstruction: { parts: [{ text: llmInstruction(targetLang) }] },
            contents: [{
                parts: [{
                    text: 'Traduce cada elemento de este array. Devuelve un array JSON de cadenas '
                        + 'con EXACTAMENTE la misma cantidad de elementos y en el mismo orden.\n\n'
                        + JSON.stringify(texts, null, 0),
                }],
            }],
            generationConfig: {
                temperature: 0.1,
                maxOutputTokens: 16384,
                responseMimeType: 'application/json',
                responseSchema: { type: 'ARRAY', items: { type: 'STRING' } },
            },
        },
    );

    const parts = data?.candidates?.[0]?.content?.parts;
    const raw = Array.isArray(parts) ? parts.map(p => p?.text || '').join('') : '';
    if (!raw) {
        const reason = data?.candidates?.[0]?.finishReason || data?.promptFeedback?.blockReason;
        throw new Error(`Gemini no devolvió contenido${reason ? ` (${reason})` : ''}.`);
    }
    return align(parseJsonArray(raw), texts, 'Gemini');
}

// ── OpenAI ─────────────────────────────────────────────────────────────────
// `json_object` obliga a un OBJETO en la raíz, no un array: por eso se pide
// {"t":[...]} y se saca la clave.
const OPENAI_MODEL = process.env.OPENAI_TRANSLATE_MODEL || 'gpt-4o-mini';

async function translateOpenAI(texts, targetLang) {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error('Falta OPENAI_API_KEY.');

    const data = await postJson(
        'https://api.openai.com/v1/chat/completions',
        {
            model: OPENAI_MODEL,
            temperature: 0.1,
            response_format: { type: 'json_object' },
            messages: [
                { role: 'system', content: llmInstruction(targetLang) },
                {
                    role: 'user',
                    content: 'Traduce cada elemento del array. Responde con un objeto JSON '
                        + '{"t": [...]} donde "t" tiene EXACTAMENTE la misma cantidad de '
                        + 'elementos y el mismo orden que la entrada.\n\n'
                        + JSON.stringify(texts),
                },
            ],
        },
        { Authorization: `Bearer ${key}` },
    );

    const raw = data?.choices?.[0]?.message?.content;
    if (!raw) throw new Error('OpenAI no devolvió contenido.');
    let arr;
    try {
        const obj = JSON.parse(raw);
        arr = Array.isArray(obj) ? obj : obj.t || obj.translations || obj.result;
    } catch {
        arr = parseJsonArray(raw);
    }
    return align(arr, texts, 'OpenAI');
}

// ── DeepL ──────────────────────────────────────────────────────────────────
// Códigos propios: el destino distingue variante (EN-US, PT-BR) y el origen no.
const DEEPL_TARGET = {
    en: 'EN-US', fr: 'FR', pt: 'PT-BR', de: 'DE',
    it: 'IT', ja: 'JA', ko: 'KO', es: 'ES',
};

async function translateDeepL(texts, targetLang) {
    const key = process.env.DEEPL_API_KEY;
    if (!key) throw new Error('Falta DEEPL_API_KEY.');
    const target = DEEPL_TARGET[targetLang];
    if (!target) throw new Error(`DeepL no admite el idioma "${targetLang}".`);

    // Las claves gratuitas terminan en ":fx" y usan otro dominio.
    const host = key.trim().endsWith(':fx') ? 'api-free.deepl.com' : 'api.deepl.com';

    // Sin `source_lang`: DeepL detecta el idioma de cada texto. Es lo que hace
    // que funcione una página mezclada (menú en español, contenidos en inglés)
    // y lo que permite traducir AL español un contenido escrito en inglés.
    const data = await postJson(
        `https://${host}/v2/translate`,
        {
            text: texts,
            target_lang: target,
            preserve_formatting: true,
            tag_handling: 'html',
        },
        { Authorization: `DeepL-Auth-Key ${key}` },
    );

    const arr = (data?.translations || []).map(t => t?.text);
    return align(arr, texts, 'DeepL');
}

// ── Google Cloud Translation (v2) ──────────────────────────────────────────
async function translateGoogle(texts, targetLang) {
    const key = process.env.GOOGLE_TRANSLATE_API_KEY;
    if (!key) throw new Error('Falta GOOGLE_TRANSLATE_API_KEY.');

    const data = await postJson(
        `https://translation.googleapis.com/language/translate/v2?key=${key}`,
        // Sin `source`: Google detecta el idioma de cada texto.
        { q: texts, target: targetLang, format: 'text' },
    );

    const arr = (data?.data?.translations || []).map(t => unescapeHtml(t?.translatedText || ''));
    return align(arr, texts, 'Google Translate');
}

// ── Azure AI Translator ────────────────────────────────────────────────────
async function translateAzure(texts, targetLang) {
    const key = process.env.AZURE_TRANSLATOR_KEY;
    const region = process.env.AZURE_TRANSLATOR_REGION;
    if (!key) throw new Error('Falta AZURE_TRANSLATOR_KEY.');
    if (!region) throw new Error('Falta AZURE_TRANSLATOR_REGION.');

    const endpoint = process.env.AZURE_TRANSLATOR_ENDPOINT
        || 'https://api.cognitive.microsofttranslator.com';

    const data = await postJson(
        // Sin `from`: Azure detecta el idioma de cada texto.
        `${endpoint}/translate?api-version=3.0&to=${targetLang}&textType=html`,
        texts.map(t => ({ Text: t })),
        { 'Ocp-Apim-Subscription-Key': key, 'Ocp-Apim-Subscription-Region': region },
    );

    const arr = (Array.isArray(data) ? data : []).map(r => r?.translations?.[0]?.text);
    return align(arr, texts, 'Azure Translator');
}

// ── Despacho ───────────────────────────────────────────────────────────────
const ADAPTERS = {
    gemini: translateGemini,
    openai: translateOpenAI,
    deepl: translateDeepL,
    google: translateGoogle,
    azure: translateAzure,
};

/**
 * Traduce un lote con el proveedor indicado.
 * Devuelve { translations, provider, durationMs }. Lanza si el proveedor falla
 * o rompe el contrato de alineamiento — el llamador decide el fallback.
 */
export async function translateBatch(texts, targetLang, { provider } = {}) {
    const fn = ADAPTERS[provider];
    if (!fn) throw new Error(`Proveedor desconocido: "${provider}".`);
    if (!texts.length) return { translations: [], provider, durationMs: 0 };

    // El idioma de ORIGEN no se pasa: lo detecta el proveedor, texto por texto.
    // Es lo que permite que una misma página mezcle idiomas y que el idioma
    // base del sitio sea también un destino.
    const started = Date.now();
    const translations = await fn(texts, targetLang);
    return { translations, provider, durationMs: Date.now() - started };
}

/** Tamaño de lote recomendado por proveedor (translationSpec.PROVIDERS.batch). */
export const batchSizeOf = provider => PROVIDERS[provider]?.batch || 25;

/**
 * Prueba de conectividad para el panel: traduce una frase corta y mide.
 * No escribe en la caché — es un diagnóstico, no una traducción del sitio.
 */
export async function probeProvider(provider, targetLang = 'en') {
    const started = Date.now();
    try {
        const { translations } = await translateBatch(['Bienvenidos a nuestro club'], targetLang, { provider });
        return {
            ok: true, provider, sample: translations[0],
            durationMs: Date.now() - started,
            language: englishNameOf(targetLang),
        };
    } catch (e) {
        return { ok: false, provider, error: e.message, durationMs: Date.now() - started };
    }
}

export default { translateBatch, batchSizeOf, probeProvider };
