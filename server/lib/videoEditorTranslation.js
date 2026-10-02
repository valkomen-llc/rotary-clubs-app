// ════════════════════════════════════════════════════════════════════════════
// Motor de Traducción Inteligente y Multilingüe de Subtítulos con IA — v4.1144.0
//
// Traduce segmentos de subtítulos entre cualquier combinación de idiomas
// soportados por Club Platform (Español, Inglés, Francés, Portugués, etc.),
// preservando con absoluta precisión los timestamps (inicio y fin) de cada clip,
// el contexto narrativo entre frases y la sincronización con el timeline.
//
// Proveedores: Google Gemini (2.5 Flash / 1.5 Flash), OpenAI GPT-4o-mini,
// DeepL API y Google Cloud Translation, con credenciales en .env o ai_model_configs.
// ════════════════════════════════════════════════════════════════════════════

import { GoogleGenerativeAI } from '@google/generative-ai';
import db from './db.js';
import { decryptKey } from './ai-router.js';
import { LOCALES } from './translationSpec.js';
import { translateBatch } from './translationProviders.js';

/**
 * Códigos de error técnicos estandarizados para telemetría y UI.
 */
export class TranslationError extends Error {
    constructor(code, message, details = null) {
        super(message);
        this.name = 'TranslationError';
        this.code = code;
        this.details = details;
    }
}

/**
 * Idiomas soportados por el ecosistema global de Club Platform.
 */
export const SUPPORTED_LANGUAGES = LOCALES.map(l => ({
    code: l.code,
    name: l.name,
    english: l.english,
    flag: l.flag || 'globe'
}));

/**
 * Normaliza cualquier variante de código de idioma al estándar ISO corto ('es', 'en', etc.).
 */
export function normalizeLanguageCode(langCode) {
    if (!langCode || typeof langCode !== 'string') return 'es';
    const clean = langCode.trim().toLowerCase();
    if (clean === 'spanish' || clean === 'espanol' || clean === 'español' || clean.startsWith('es-') || clean.startsWith('es_') || clean === 'es') return 'es';
    if (clean === 'english' || clean === 'ingles' || clean === 'inglés' || clean.startsWith('en-') || clean.startsWith('en_') || clean === 'en') return 'en';
    if (clean === 'french' || clean === 'frances' || clean === 'francés' || clean.startsWith('fr-') || clean.startsWith('fr_') || clean === 'fr') return 'fr';
    if (clean === 'portuguese' || clean === 'portugues' || clean === 'português' || clean.startsWith('pt-') || clean.startsWith('pt_') || clean === 'pt') return 'pt';
    if (clean === 'german' || clean === 'aleman' || clean === 'alemán' || clean.startsWith('de-') || clean.startsWith('de_') || clean === 'de') return 'de';
    if (clean === 'italian' || clean === 'italiano' || clean.startsWith('it-') || clean.startsWith('it_') || clean === 'it') return 'it';
    if (clean === 'japanese' || clean === 'japones' || clean === 'japonés' || clean.startsWith('ja-') || clean.startsWith('ja_') || clean === 'ja') return 'ja';
    if (clean === 'korean' || clean === 'coreano' || clean.startsWith('ko-') || clean.startsWith('ko_') || clean === 'ko') return 'ko';
    return clean;
}

/**
 * Obtiene los metadatos de un idioma por su código ISO (ej: 'es', 'en').
 */
export function getLanguageMeta(langCode) {
    const code = normalizeLanguageCode(langCode);
    const found = SUPPORTED_LANGUAGES.find(l => l.code === code);
    if (found) return found;

    return {
        code,
        name: code.toUpperCase(),
        english: code.toUpperCase()
    };
}

/**
 * Resuelve las credenciales disponibles en variables de entorno o en la tabla
 * de modelos configurados de la base de datos (ai_model_configs).
 */
export async function resolveTranslationCredentials() {
    let geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || null;
    let openaiKey = process.env.OPENAI_API_KEY || null;
    let deeplKey = process.env.DEEPL_API_KEY || null;
    let googleKey = process.env.GOOGLE_TRANSLATE_API_KEY || null;

    try {
        const dbConfigs = await db.query(
            `SELECT provider, api_key_enc FROM ai_model_configs WHERE is_active = TRUE AND api_key_enc IS NOT NULL`
        );
        for (const row of dbConfigs.rows || []) {
            if ((row.provider === 'google' || row.provider === 'gemini') && !geminiKey && row.api_key_enc) {
                geminiKey = decryptKey(row.api_key_enc);
            }
            if (row.provider === 'openai' && !openaiKey && row.api_key_enc) {
                openaiKey = decryptKey(row.api_key_enc);
            }
        }
    } catch (_) {
        // Continuar si la tabla no está presente o en modo local
    }

    if (!geminiKey && !openaiKey && !deeplKey && !googleKey) {
        throw new TranslationError(
            'MISSING_AI_CREDENTIALS',
            'No hay credenciales activas de IA para traducción. Configura GEMINI_API_KEY o OPENAI_API_KEY en Integraciones → Modelos IA.'
        );
    }

    return { geminiKey, openaiKey, deeplKey, googleKey };
}

/**
 * Extrae y normaliza un array JSON desde una respuesta de modelo LLM.
 */
function extractJsonArray(rawText) {
    let text = String(rawText || '').trim()
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/, '');

    // Intentar JSON.parse directo
    try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) return parsed;
        if (Array.isArray(parsed.segments)) return parsed.segments;
        if (Array.isArray(parsed.subtitles)) return parsed.subtitles;
        if (Array.isArray(parsed.translations)) return parsed.translations;
    } catch (_) {
        // Continuar con extracción por corchetes
    }

    const start = text.indexOf('[');
    const end = text.lastIndexOf(']');
    if (start !== -1 && end > start) {
        try {
            const arr = JSON.parse(text.slice(start, end + 1));
            if (Array.isArray(arr)) return arr;
        } catch (_) {}
    }

    throw new TranslationError(
        'INVALID_TRANSLATION_RESPONSE',
        'El proveedor de IA no devolvió un array JSON con los segmentos traducidos.'
    );
}

/**
 * Traducción contextual con Google Gemini (Flash 2.5 / 1.5).
 */
async function translateWithGemini(segments, sourceMeta, targetMeta, apiKey) {
    const genAI = new GoogleGenerativeAI(apiKey);
    const candidateModels = ['gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-2.0-flash'];

    const prompt = `Actúa como un traductor audiovisual y subtitulador profesional.
Traduce los siguientes subtítulos de video del idioma origen ("${sourceMeta.name}") al idioma destino ("${targetMeta.name}").

Contexto audiovisual:
Mantén el tono natural de la voz humana, el significado exacto del discurso y la coherencia narrativa fluida entre frases consecutivas.

Lista de segmentos a traducir (JSON):
${JSON.stringify(segments.map(s => ({ id: s.id, start: s.start, end: s.end, text: s.text })), null, 2)}

Reglas obligatorias e inviolables:
1. Traduce con precisión el campo "text" al ${targetMeta.name}.
2. Conserva estrictamente los campos "id", "start" y "end" sin alterar ningún valor numérico ni identificador.
3. Devuelve EXACTAMENTE ${segments.length} segmentos en el mismo orden.
4. Devuelve ÚNICAMENTE un array JSON válido con la siguiente estructura:
[
  {
    "id": "sub-1",
    "start": 0.0,
    "end": 3.0,
    "text": "Traducción natural al ${targetMeta.name}"
  }
]`;

    let lastError = null;
    for (const modelId of candidateModels) {
        try {
            const model = genAI.getGenerativeModel({
                model: modelId,
                generationConfig: {
                    temperature: 0.1,
                    responseMimeType: 'application/json'
                }
            });

            const result = await model.generateContent(prompt);
            const rawResponse = result.response.text();
            const translatedArray = extractJsonArray(rawResponse);

            // Reconstruir segmentos asegurando preservación estricta de timestamps originales
            const aligned = segments.map((orig, idx) => {
                const item = translatedArray[idx] || {};
                const translatedText = typeof item.text === 'string' && item.text.trim().length > 0
                    ? item.text.trim()
                    : orig.text;

                return {
                    ...orig,
                    id: orig.id,
                    start: orig.start,
                    end: orig.end,
                    text: translatedText,
                    translated: true,
                    sourceText: orig.text,
                    lang: targetMeta.code
                };
            });

            return {
                translatedSegments: aligned,
                provider: `gemini (${modelId})`
            };
        } catch (err) {
            lastError = err;
            console.warn(`[VideoEditorTranslation] Modelo ${modelId} falló:`, err.message);
        }
    }

    throw new TranslationError(
        'TRANSLATION_PROVIDER_ERROR',
        `Google Gemini no pudo completar la traducción: ${lastError?.message || 'Error desconocido'}`
    );
}

/**
 * Traducción contextual con OpenAI Chat Completions (gpt-4o-mini).
 */
async function translateWithOpenAI(segments, sourceMeta, targetMeta, apiKey) {
    const model = process.env.OPENAI_TRANSLATE_MODEL || 'gpt-4o-mini';

    const systemPrompt = `Eres un traductor profesional de subtítulos de video.
Traduce del ${sourceMeta.name} al ${targetMeta.name}.
Conserva intactos los campos id, start y end. Responde únicamente con un array JSON de segmentos.`;

    const userPrompt = `Traduce cada segmento manteniendo marcas de tiempo y coherencia narrativa:
${JSON.stringify(segments.map(s => ({ id: s.id, start: s.start, end: s.end, text: s.text })))}`;

    let res;
    try {
        res = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model,
                temperature: 0.1,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ]
            }),
            signal: AbortSignal.timeout(45_000)
        });
    } catch (fetchErr) {
        if (fetchErr.name === 'TimeoutError') {
            throw new TranslationError('TRANSLATION_TIMEOUT', 'La traducción con OpenAI excedió el tiempo límite');
        }
        throw new TranslationError('TRANSLATION_PROVIDER_ERROR', `Error conectando con OpenAI: ${fetchErr.message}`);
    }

    if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new TranslationError('TRANSLATION_PROVIDER_ERROR', `OpenAI API error (${res.status}): ${errText}`);
    }

    const data = await res.json().catch(() => ({}));
    const rawContent = data.choices?.[0]?.message?.content || '';
    const translatedArray = extractJsonArray(rawContent);

    const aligned = segments.map((orig, idx) => {
        const item = translatedArray[idx] || {};
        const translatedText = typeof item.text === 'string' && item.text.trim().length > 0
            ? item.text.trim()
            : orig.text;

        return {
            ...orig,
            id: orig.id,
            start: orig.start,
            end: orig.end,
            text: translatedText,
            translated: true,
            sourceText: orig.text,
            lang: targetMeta.code
        };
    });

    return {
        translatedSegments: aligned,
        provider: `openai (${model})`
    };
}

/**
 * Fallback a los proveedores de traducción por lotes existentes de Club Platform (DeepL / Google).
 */
async function translateWithBatchFallback(segments, targetMeta, provider) {
    const texts = segments.map(s => String(s.text || '').trim());
    const { translations, provider: usedProvider } = await translateBatch(texts, targetMeta.code, { provider });

    const aligned = segments.map((orig, idx) => ({
        ...orig,
        id: orig.id,
        start: orig.start,
        end: orig.end,
        text: translations[idx] || orig.text,
        translated: true,
        sourceText: orig.text,
        lang: targetMeta.code
    }));

    return {
        translatedSegments: aligned,
        provider: usedProvider || provider
    };
}

/**
 * Traduce un conjunto de segmentos de subtítulos preservando timestamps y contexto.
 */
export async function translateSubtitles(segments, targetLang, options = {}) {
    if (!Array.isArray(segments) || segments.length === 0) {
        throw new TranslationError('EMPTY_SUBTITLE_SEGMENTS', 'No se proporcionaron segmentos de subtítulos para traducir');
    }

    const targetMeta = getLanguageMeta(targetLang);
    const rawSource = options.sourceLang || options.sourceLanguage || 'es';
    const sourceMeta = getLanguageMeta(rawSource);

    if (sourceMeta.code === targetMeta.code) {
        throw new TranslationError(
            'INVALID_TARGET_LANGUAGE',
            `El idioma destino (${targetMeta.name}) es idéntico al idioma de origen.`
        );
    }

    const credentials = await resolveTranslationCredentials();

    // 1. Prioridad: Google Gemini (Contextual, respeta formato completo y timestamps)
    if (credentials.geminiKey) {
        try {
            const res = await translateWithGemini(segments, sourceMeta, targetMeta, credentials.geminiKey);
            return {
                sourceLang: sourceMeta.code,
                sourceLanguageName: sourceMeta.name,
                targetLang: targetMeta.code,
                targetLanguageName: targetMeta.name,
                segments: res.translatedSegments,
                provider: res.provider,
                count: res.translatedSegments.length
            };
        } catch (geminiErr) {
            console.warn('[VideoEditorTranslation] Falló Gemini, probando respaldos:', geminiErr.message);
        }
    }

    // 2. Respaldo: OpenAI GPT-4o-mini
    if (credentials.openaiKey) {
        try {
            const res = await translateWithOpenAI(segments, sourceMeta, targetMeta, credentials.openaiKey);
            return {
                sourceLang: sourceMeta.code,
                sourceLanguageName: sourceMeta.name,
                targetLang: targetMeta.code,
                targetLanguageName: targetMeta.name,
                segments: res.translatedSegments,
                provider: res.provider,
                count: res.translatedSegments.length
            };
        } catch (openAiErr) {
            console.warn('[VideoEditorTranslation] Falló OpenAI, probando DeepL / Google:', openAiErr.message);
        }
    }

    // 3. Respaldo: DeepL
    if (credentials.deeplKey) {
        try {
            const res = await translateWithBatchFallback(segments, targetMeta, 'deepl');
            return {
                sourceLang: sourceMeta.code,
                sourceLanguageName: sourceMeta.name,
                targetLang: targetMeta.code,
                targetLanguageName: targetMeta.name,
                segments: res.translatedSegments,
                provider: res.provider,
                count: res.translatedSegments.length
            };
        } catch (deeplErr) {
            console.warn('[VideoEditorTranslation] Falló DeepL:', deeplErr.message);
        }
    }

    // 4. Respaldo: Google Cloud Translation
    if (credentials.googleKey) {
        try {
            const res = await translateWithBatchFallback(segments, targetMeta, 'google');
            return {
                sourceLang: sourceMeta.code,
                sourceLanguageName: sourceMeta.name,
                targetLang: targetMeta.code,
                targetLanguageName: targetMeta.name,
                segments: res.translatedSegments,
                provider: res.provider,
                count: res.translatedSegments.length
            };
        } catch (googleErr) {
            console.warn('[VideoEditorTranslation] Falló Google Cloud Translation:', googleErr.message);
        }
    }

    throw new TranslationError(
        'TRANSLATION_PROVIDER_ERROR',
        'Ningún proveedor de traducción disponible pudo procesar la solicitud.'
    );
}
