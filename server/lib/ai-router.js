/**
 * ai-router.js — Router universal de modelos IA
 * Enruta peticiones al proveedor correcto (Gemini, OpenAI, Claude, Mistral, Custom)
 * Las API keys se leen desde la tabla ai_model_configs (cifradas) o desde .env como fallback.
 */

import db from './db.js';

// ── Providers ────────────────────────────────────────────────────────────────

async function callGemini({ modelId, apiKey, systemPrompt, userPrompt, maxTokens }) {
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

    const body = {
        contents: [{ role: 'user', parts: [{ text: `${systemPrompt}\n\n---\n\n${userPrompt}` }] }],
        generationConfig: { maxOutputTokens: maxTokens || 4096, temperature: 0.7 }
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
            if (res.ok) return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
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

async function callOpenAI({ modelId, apiKey, systemPrompt, userPrompt, maxTokens }) {
    const key = apiKey || process.env.OPENAI_API_KEY;
    if (!key) throw new Error('OpenAI API Key no configurada');

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body: JSON.stringify({
            model: modelId,
            messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
            max_tokens: maxTokens || 4096,
            temperature: 0.7,
            response_format: { type: 'json_object' }
        })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || 'Error OpenAI API');
    return data.choices?.[0]?.message?.content || '';
}

async function callAnthropic({ modelId, apiKey, systemPrompt, userPrompt, maxTokens }) {
    const key = apiKey || process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error('Anthropic API Key no configurada');

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
            messages: [{ role: 'user', content: userPrompt }]
        })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || 'Error Anthropic API');
    return data.content?.[0]?.text || '';
}

async function callMistral({ modelId, apiKey, systemPrompt, userPrompt, maxTokens }) {
    const key = apiKey || process.env.MISTRAL_API_KEY;
    if (!key) throw new Error('Mistral API Key no configurada');

    const res = await fetch('https://api.mistral.ai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body: JSON.stringify({
            model: modelId,
            messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
            max_tokens: maxTokens || 4096,
            temperature: 0.7
        })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || 'Error Mistral API');
    return data.choices?.[0]?.message?.content || '';
}

// Compatible con cualquier API con interfaz OpenAI (Ollama, Groq, etc.)
async function callCustom({ modelId, apiKey, baseUrl, systemPrompt, userPrompt, maxTokens }) {
    if (!baseUrl) throw new Error('baseUrl requerida para modelos custom');

    const headers = { 'Content-Type': 'application/json' };
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

    const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            model: modelId,
            messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
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

// ── Main router function ──────────────────────────────────────────────────────

/**
 * Enruta una petición al proveedor de IA correcto.
 * @param {string} slug - Slug del modelo (ej: 'gemini-2.0-flash')
 * @param {string} systemPrompt - Instrucciones del sistema
 * @param {string} userPrompt - Mensaje del usuario
 * @returns {Promise<string>} - Texto de salida del modelo
 */
export async function routeToModel(slug, systemPrompt, userPrompt) {
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
