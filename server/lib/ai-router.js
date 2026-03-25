/**
 * ai-router.js — Router universal de modelos IA
 * Enruta peticiones al proveedor correcto (Gemini, OpenAI, Claude, Mistral, Custom)
 * Las API keys se leen desde la tabla ai_model_configs (cifradas) o desde .env como fallback.
 */

import db from './db.js';

// ── Providers ────────────────────────────────────────────────────────────────

async function callGemini({ modelId, apiKey, systemPrompt, userPrompt, history, maxTokens }) {
    const key = apiKey || process.env.GEMINI_API_KEY;
    if (!key) throw new Error('Gemini API Key no configurada');

    // Cadena de modelos verificados para este API key (v1beta)
    // gemini-2.5-flash confirmado funcionando — modelos 2.0 deprecados para esta cuenta
    const candidates = [
        { version: 'v1beta', id: modelId },              // modelo solicitado por el usuario
        { version: 'v1beta', id: 'gemini-2.5-flash' },   // ✅ verificado funcionando
        { version: 'v1beta', id: 'gemini-2.5-pro' },     // alternativa más potente
        { version: 'v1beta', id: 'gemini-flash-latest' }, // alias del último flash
        { version: 'v1beta', id: 'gemini-pro-latest' },   // último fallback
    ];

    // Limitar el userPrompt a 1500 chars (óptimo calidad/costo):
    // - Input tokens son muy baratos ($0.075/1M tokens = ~$0.0001 por request)
    // - Prompts más cortos = respuestas de mayor calidad y menor latencia
    // - 1500 chars (~375 tokens) da suficiente contexto para generar un proyecto completo
    const MAX_INPUT_CHARS = 2500;
    const truncatedUserPrompt = userPrompt.length > MAX_INPUT_CHARS
        ? userPrompt.slice(0, MAX_INPUT_CHARS) + '\n[Resumen del resto: ' + userPrompt.slice(MAX_INPUT_CHARS, MAX_INPUT_CHARS + 200).trim() + '...]'
        : userPrompt;

    const mappedHistory = (history || []).map(h => ({
        role: h.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: h.text || h.content || '' }]
    }));
    mappedHistory.push({ role: 'user', parts: [{ text: truncatedUserPrompt }] });

    const body = {
        // systemInstruction: campo nativo de Gemini para instrucciones del sistema
        // Más efectivo que concatenar con el user prompt
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: mappedHistory,
        generationConfig: {
            maxOutputTokens: Math.min(maxTokens || 8192, 8192),
            temperature: 0.4
            // NO usar responseMimeType: 'application/json' — causa MAX_TOKENS prematuro
            // con prompts largos en gemini-2.5-flash
        },
        safetySettings: [
            { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' }
        ]
    };

    let lastError = '';
    for (const { version, id } of candidates) {
        // Evitar intentar el mismo modelo dos veces
        const seen = new Set();
        if (seen.has(id)) continue;
        seen.add(id);

        const url = `https://generativelanguage.googleapis.com/${version}/models/${id}:generateContent?key=${key}`;
        try {
            const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            const data = await res.json();
            // Log detallado de la respuesta para debugging en produccion
            const candidate = data.candidates?.[0];
            const finishReason = candidate?.finishReason;
            const rawText = candidate?.content?.parts?.[0]?.text || '';
            console.log(`[Gemini] model=${id} status=${res.status} finishReason=${finishReason} chars=${rawText.length} raw100=${rawText.slice(0,100)}`);
            if (res.ok) return rawText;
            if (res.status === 404 || res.status === 400) { lastError = data.error?.message || `${id} not found`; continue; }
            throw new Error(data.error?.message || 'Error Gemini API');
        } catch (e) {
            if (e.message && (e.message.includes('not found') || e.message.includes('no longer') || e.message.includes('not supported'))) {
                lastError = e.message; continue;
            }
            throw e;
        }
    }
    throw new Error(`Error al conectar con Gemini. Último error: ${lastError}`);
}

async function callOpenAI({ modelId, apiKey, systemPrompt, userPrompt, history, maxTokens }) {
    const key = apiKey || process.env.OPENAI_API_KEY;
    if (!key) throw new Error('OpenAI API Key no configurada');

    const messages = [{ role: 'system', content: systemPrompt }];
    (history || []).forEach(h => messages.push({ role: h.role === 'assistant' ? 'assistant' : 'user', content: h.text || h.content || '' }));
    messages.push({ role: 'user', content: userPrompt });

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body: JSON.stringify({
            model: modelId,
            messages,
            max_tokens: maxTokens || 4096,
            temperature: 0.7,
            response_format: { type: 'json_object' }
        })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || 'Error OpenAI API');
    return data.choices?.[0]?.message?.content || '';
}

async function callAnthropic({ modelId, apiKey, systemPrompt, userPrompt, history, maxTokens }) {
    const key = apiKey || process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error('Anthropic API Key no configurada');

    const messages = [];
    (history || []).forEach(h => messages.push({ role: h.role === 'assistant' ? 'assistant' : 'user', content: h.text || h.content || '' }));
    messages.push({ role: 'user', content: userPrompt });

    const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': key,
            'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
            model: modelId,
            max_tokens: maxTokens || 4096,
            system: systemPrompt,
            messages
        })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || 'Error Anthropic API');
    return data.content?.[0]?.text || '';
}

async function callMistral({ modelId, apiKey, systemPrompt, userPrompt, history, maxTokens }) {
    const key = apiKey || process.env.MISTRAL_API_KEY;
    if (!key) throw new Error('Mistral API Key no configurada');

    const messages = [{ role: 'system', content: systemPrompt }];
    (history || []).forEach(h => messages.push({ role: h.role === 'assistant' ? 'assistant' : 'user', content: h.text || h.content || '' }));
    messages.push({ role: 'user', content: userPrompt });

    const res = await fetch('https://api.mistral.ai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body: JSON.stringify({
            model: modelId,
            messages,
            max_tokens: maxTokens || 4096,
            temperature: 0.7
        })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || 'Error Mistral API');
    return data.choices?.[0]?.message?.content || '';
}

async function callCustom({ modelId, apiKey, baseUrl, systemPrompt, userPrompt, history, maxTokens }) {
    if (!baseUrl) throw new Error('baseUrl requerida para modelos custom');

    const headers = { 'Content-Type': 'application/json' };
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

    const messages = [{ role: 'system', content: systemPrompt }];
    (history || []).forEach(h => messages.push({ role: h.role === 'assistant' ? 'assistant' : 'user', content: h.text || h.content || '' }));
    messages.push({ role: 'user', content: userPrompt });

    const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            model: modelId,
            messages,
            max_tokens: maxTokens || 4096
        })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || 'Error Custom API');
    return data.choices?.[0]?.message?.content || '';
}

// ── Handler map ──────────────────────────────────────────────────────────────
const HANDLERS = {
    google: callGemini,
    openai: callOpenAI,
    anthropic: callAnthropic,
    mistral: callMistral,
    custom: callCustom,
};

// ── Modelos pre-registrados (fallback si la BD aún no tiene registros) ────────
export const BUILTIN_MODELS = [
    { slug: 'gemini-2.5-flash',      provider: 'google',    display_name: 'Gemini 2.5 Flash',      model_id: 'gemini-2.5-flash',           is_default: true,  description: 'El más rápido y avanzado de Google — verificado disponible',   speed: 'fast',   cost_tier: 1 },
    { slug: 'gemini-2.5-pro',        provider: 'google',    display_name: 'Gemini 2.5 Pro',        model_id: 'gemini-2.5-pro',             is_default: false, description: 'Máxima capacidad de razonamiento de Google',                speed: 'medium', cost_tier: 3 },
    { slug: 'gemini-2.0-flash',      provider: 'google',    display_name: 'Gemini 2.0 Flash',      model_id: 'gemini-2.0-flash',           is_default: false, description: 'Modelo 2.0 de Google',                                    speed: 'fast',   cost_tier: 1 },
    { slug: 'gemini-2.0-flash-lite', provider: 'google',    display_name: 'Gemini 2.0 Flash Lite', model_id: 'gemini-2.0-flash-lite',      is_default: false, description: 'Versión ligera y económica de Gemini 2.0 Flash',           speed: 'fast',   cost_tier: 1 },
    { slug: 'gpt-4o',                provider: 'openai',    display_name: 'GPT-4o',                model_id: 'gpt-4o',                     is_default: false, description: 'Máxima calidad de texto — el más potente de OpenAI',        speed: 'medium', cost_tier: 3 },
    { slug: 'gpt-4o-mini',           provider: 'openai',    display_name: 'GPT-4o Mini',           model_id: 'gpt-4o-mini',                is_default: false, description: 'Económico y rápido — ideal para drafts y pruebas',          speed: 'fast',   cost_tier: 1 },
    { slug: 'claude-3-5-sonnet',     provider: 'anthropic', display_name: 'Claude 3.5 Sonnet',     model_id: 'claude-3-5-sonnet-20241022', is_default: false, description: 'Excelente narrativa y redacción — ideal para descripciones', speed: 'medium', cost_tier: 2 },
    { slug: 'claude-3-haiku',        provider: 'anthropic', display_name: 'Claude 3 Haiku',        model_id: 'claude-3-haiku-20240307',    is_default: false, description: 'El más rápido de Anthropic — económico y eficiente',        speed: 'fast',   cost_tier: 1 },
    { slug: 'mistral-large',         provider: 'mistral',   display_name: 'Mistral Large',         model_id: 'mistral-large-latest',       is_default: false, description: 'Alternativa europea con excelente calidad',                 speed: 'medium', cost_tier: 2 },
];

export const PROJECT_SYSTEM_PROMPT = `Eres ProyectIA. Genera un proyecto de crowdfunding Rotary como JSON puro.
Responde SOLO con el JSON. Sin texto adicional, sin markdown, sin explicaciones.
{
  "title": "Título emotivo — máx 70 chars",
  "description": "<p>150-200 palabras HTML. Problema, solución, metodología.</p>",
  "category": "Área de enfoque Rotary relevante",
  "tags": ["tag1", "tag2", "tag3"],
  "status": "planned",
  "ubicacion": "Ciudad/región",
  "meta": 0,
  "beneficiarios": 0,
  "fechaEstimada": "YYYY-MM-DD",
  "impacto": "<p>50-80 palabras sobre impacto y ODS.</p>",
  "actualizaciones": "<p>50-80 palabras sobre plan de hitos.</p>",
  "seoDescription": "Descripción SEO de 140-155 caracteres",
  "callToAction": "Texto botón donación — máx 40 chars",
  "fundraisingFormats": [
    {"type":"donacion_unica","label":"Donación única","amounts":[25000,50000,100000,500000],"description":"Impacto de cada monto"},
    {"type":"socio_proyecto","label":"Socio mensual","amounts":[20000,50000,100000],"description":"Beneficios del socio"}
  ],
  "suggestedImageKeywords": ["keyword1", "keyword2"]
}
Montos en COP. Datos realistas y conservadores.`;

// ── Main router function ──────────────────────────────────────────────────────

/**
 * Enruta una petición al proveedor de IA correcto.
 * @param {string} slug - Slug del modelo (ej: 'gemini-2.0-flash')
 * @param {string} systemPrompt - Instrucciones del sistema
 * @param {string} userPrompt - Mensaje del usuario
 * @returns {Promise<string>} - Texto de salida del modelo
 */
export async function routeToModel(slug, systemPrompt, userPrompt, history = []) {
    let config = null;

    // 1. Buscar en BD (configuración con API key personalizada)
    try {
        const result = await db.query(
            `SELECT * FROM ai_model_configs WHERE slug = $1 AND is_active = TRUE LIMIT 1`,
            [slug]
        );
        if (result.rows.length > 0) config = result.rows[0];
    } catch (_) {
        // Tabla aún no creada — usar fallback builtin
    }

    // 2. Fallback a modelos builtin (sin API key personalizada — usa .env)
    if (!config) {
        const builtin = BUILTIN_MODELS.find(m => m.slug === slug);
        if (!builtin) throw new Error(`Modelo '${slug}' no encontrado. Configúralo en Integraciones → Modelos IA.`);
        config = { ...builtin, api_key_enc: null, base_url: null, max_tokens: 4096 };
    }

    const handler = HANDLERS[config.provider];
    if (!handler) throw new Error(`Proveedor '${config.provider}' no soportado`);

    // Descifrar API key si está guardada en BD
    const apiKey = config.api_key_enc ? decryptKey(config.api_key_enc) : null;

    return await handler({
        modelId: config.model_id,
        apiKey,
        baseUrl: config.base_url,
        systemPrompt,
        userPrompt,
        history,
        maxTokens: config.max_tokens || 4096,
    });
}

/**
 * Obtiene el modelo predeterminado activo.
 */
export async function getDefaultModel() {
    try {
        const result = await db.query(
            `SELECT slug FROM ai_model_configs WHERE is_default = TRUE AND is_active = TRUE LIMIT 1`
        );
        if (result.rows.length > 0) return result.rows[0].slug;
    } catch (_) { }
    // Fallback: primer modelo builtin marcado como default
    return BUILTIN_MODELS.find(m => m.is_default)?.slug || 'gemini-2.5-flash';
}

// ── Simple XOR encryption for API keys (upgrade to AES in production) ────────
const ENC_KEY = (process.env.AI_KEY_SECRET || 'rotary-ai-2026').padEnd(32, '0').slice(0, 32);

export function encryptKey(plaintext) {
    const buf = Buffer.from(plaintext, 'utf8');
    const key = Buffer.from(ENC_KEY, 'utf8');
    const out = buf.map((b, i) => b ^ key[i % key.length]);
    return out.toString('base64');
}

export function decryptKey(encrypted) {
    const buf = Buffer.from(encrypted, 'base64');
    const key = Buffer.from(ENC_KEY, 'utf8');
    const out = buf.map((b, i) => b ^ key[i % key.length]);
    return out.toString('utf8');
}
