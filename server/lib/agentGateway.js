// ════════════════════════════════════════════════════════════════════════════
// AI Agent Command Center — Model Gateway (v4.1316.0)
//
// UNA forma de hablar con cualquier modelo CON HERRAMIENTAS. El enrutador de
// siempre (`ai-router.js`) sólo devuelve texto; un agente necesita que el
// modelo pida herramientas y reciba sus resultados. Gemini, OpenAI (y los
// compatibles: Mistral, propios) y Anthropic hablan dialectos distintos: las
// conversiones son PURAS y se prueban sin red (`test:agents:runtime`).
//
// Reutiliza del enrutador la configuración (`ai_model_configs` con la clave
// cifrada, o los modelos incorporados con la clave del entorno), la cadena de
// respaldo entre proveedores y el diagnóstico de fallas de cuenta. Cada llamada
// queda medida en Consumo de IA (`recordAiUsage`).
// ════════════════════════════════════════════════════════════════════════════
import db from './db.js';
import { BUILTIN_MODELS, buildFallbackChain, describeProviderFailure, decryptKey, getDefaultModel } from './ai-router.js';
import { recordAiUsage, usageFromResponse } from './aiUsage.js';

// ── Esquemas de herramientas ───────────────────────────────────────────
/** Gemini acepta un subconjunto de OpenAPI: tipos en mayúscula y sin extras. */
export function toGeminiSchema(schema) {
    if (!schema || typeof schema !== 'object') return schema;
    const out = {};
    for (const [k, v] of Object.entries(schema)) {
        if (['additionalProperties', '$schema', 'default', 'examples'].includes(k)) continue;
        if (k === 'type' && typeof v === 'string') out.type = v.toUpperCase();
        else if (k === 'properties' && v && typeof v === 'object') out.properties = Object.fromEntries(Object.entries(v).map(([pk, pv]) => [pk, toGeminiSchema(pv)]));
        else if (k === 'items') out.items = toGeminiSchema(v);
        else out[k] = v;
    }
    return out;
}

// ── Gemini ─────────────────────────────────────────────────────────────
export function toGeminiRequest({ system, messages, tools, maxTokens = 2048, temperature = 0.2 }) {
    const contents = [];
    for (const m of messages) {
        if (m.role === 'user') contents.push({ role: 'user', parts: [{ text: String(m.content || '') }] });
        else if (m.role === 'assistant') {
            const parts = [];
            if (m.content) parts.push({ text: String(m.content) });
            for (const c of m.toolCalls || []) parts.push({ functionCall: { name: c.name, args: c.args || {} } });
            if (parts.length) contents.push({ role: 'model', parts });
        } else if (m.role === 'tool') {
            contents.push({ role: 'user', parts: [{ functionResponse: { name: m.name, response: { result: m.content } } }] });
        }
    }
    return {
        ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
        contents,
        ...(tools?.length ? { tools: [{ functionDeclarations: tools.map(t => ({ name: t.name, description: t.description, parameters: toGeminiSchema(t.parameters) })) }], toolConfig: { functionCallingConfig: { mode: 'AUTO' } } } : {}),
        generationConfig: { temperature, maxOutputTokens: maxTokens },
    };
}
export function fromGeminiResponse(data) {
    const cand = data?.candidates?.[0];
    const parts = cand?.content?.parts || [];
    const text = parts.map(p => p?.text || '').join('');
    const toolCalls = parts.filter(p => p?.functionCall).map((p, i) => ({ id: `g${i}-${p.functionCall.name}`, name: p.functionCall.name, args: p.functionCall.args || {} }));
    return { text, toolCalls, finishReason: cand?.finishReason || null, usage: usageFromResponse('google', data) };
}

// ── OpenAI (y compatibles) ─────────────────────────────────────────────
export function toOpenAIRequest({ model, system, messages, tools, maxTokens = 2048, temperature = 0.2 }) {
    const msgs = system ? [{ role: 'system', content: system }] : [];
    for (const m of messages) {
        if (m.role === 'user') msgs.push({ role: 'user', content: String(m.content || '') });
        else if (m.role === 'assistant') msgs.push({ role: 'assistant', content: m.content || null, ...(m.toolCalls?.length ? { tool_calls: m.toolCalls.map(c => ({ id: c.id, type: 'function', function: { name: c.name, arguments: JSON.stringify(c.args || {}) } })) } : {}) });
        else if (m.role === 'tool') msgs.push({ role: 'tool', tool_call_id: m.toolCallId, content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) });
    }
    return {
        model, messages: msgs, max_tokens: maxTokens, temperature,
        ...(tools?.length ? { tools: tools.map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } })), tool_choice: 'auto' } : {}),
    };
}
export function fromOpenAIResponse(data) {
    const choice = data?.choices?.[0];
    const msg = choice?.message || {};
    const toolCalls = (msg.tool_calls || []).map(c => {
        let args = {};
        try { args = JSON.parse(c.function?.arguments || '{}'); } catch { args = { __invalid: String(c.function?.arguments || '').slice(0, 200) }; }
        return { id: c.id, name: c.function?.name, args };
    });
    return { text: msg.content || '', toolCalls, finishReason: choice?.finish_reason || null, usage: usageFromResponse('openai', data) };
}

// ── Anthropic ──────────────────────────────────────────────────────────
export function toAnthropicRequest({ model, system, messages, tools, maxTokens = 2048, temperature = 0.2 }) {
    const msgs = [];
    for (const m of messages) {
        if (m.role === 'user') msgs.push({ role: 'user', content: String(m.content || '') });
        else if (m.role === 'assistant') {
            const content = [];
            if (m.content) content.push({ type: 'text', text: String(m.content) });
            for (const c of m.toolCalls || []) content.push({ type: 'tool_use', id: c.id, name: c.name, input: c.args || {} });
            if (content.length) msgs.push({ role: 'assistant', content });
        } else if (m.role === 'tool') {
            msgs.push({ role: 'user', content: [{ type: 'tool_result', tool_use_id: m.toolCallId, content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) }] });
        }
    }
    return {
        model, max_tokens: maxTokens, temperature, messages: msgs,
        ...(system ? { system } : {}),
        ...(tools?.length ? { tools: tools.map(t => ({ name: t.name, description: t.description, input_schema: t.parameters })) } : {}),
    };
}
export function fromAnthropicResponse(data) {
    const blocks = data?.content || [];
    return {
        text: blocks.filter(b => b.type === 'text').map(b => b.text).join(''),
        toolCalls: blocks.filter(b => b.type === 'tool_use').map(b => ({ id: b.id, name: b.name, args: b.input || {} })),
        finishReason: data?.stop_reason || null,
        usage: usageFromResponse('anthropic', data),
    };
}

// ── Configuración ──────────────────────────────────────────────────────
export async function resolveModelConfig(slug) {
    let config = null;
    try {
        const r = await db.query(`SELECT * FROM ai_model_configs WHERE slug = $1 AND is_active = TRUE LIMIT 1`, [slug]);
        config = r.rows[0] || null;
    } catch { config = null; }
    if (!config) {
        const b = BUILTIN_MODELS.find(m => m.slug === slug);
        if (!b) throw new Error(`Modelo '${slug}' no encontrado. Configúralo en Integraciones → Modelos IA.`);
        config = { ...b, api_key_enc: null, base_url: null };
    }
    const envKey = { google: process.env.GEMINI_API_KEY, openai: process.env.OPENAI_API_KEY, anthropic: process.env.ANTHROPIC_API_KEY, mistral: process.env.MISTRAL_API_KEY }[config.provider];
    return { slug, provider: config.provider, modelId: config.model_id, apiKey: config.api_key_enc ? decryptKey(config.api_key_enc) : envKey, baseUrl: config.base_url };
}

/** El modelo de una ejecución: instalación → plantilla → ajuste → enrutador. */
export async function pickModelSlug({ installation, version, settings } = {}) {
    return installation?.modelPolicy?.preferred
        || version?.snapshot?.modelPolicy?.preferred
        || settings?.defaultModel
        || await getDefaultModel();
}

async function callOnce(cfg, req, { timeoutMs }) {
    if (!cfg.apiKey) throw new Error(`Falta la credencial de ${cfg.provider} (Integraciones → Modelos IA).`);
    const signal = AbortSignal.timeout(timeoutMs);
    let res; let data;
    if (cfg.provider === 'google') {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cfg.modelId)}:generateContent?key=${cfg.apiKey}`;
        res = await fetch(url, { method: 'POST', signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(toGeminiRequest(req)) });
        data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(describeProviderFailure('google', res.status, data?.error?.message || ''));
        return fromGeminiResponse(data);
    }
    if (cfg.provider === 'anthropic') {
        res = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', signal, headers: { 'Content-Type': 'application/json', 'x-api-key': cfg.apiKey, 'anthropic-version': '2023-06-01' }, body: JSON.stringify(toAnthropicRequest({ ...req, model: cfg.modelId })) });
        data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(describeProviderFailure('anthropic', res.status, data?.error?.message || ''));
        return fromAnthropicResponse(data);
    }
    const base = cfg.provider === 'mistral' ? 'https://api.mistral.ai/v1' : (cfg.provider === 'openai' ? 'https://api.openai.com/v1' : String(cfg.baseUrl || '').replace(/\/$/, ''));
    res = await fetch(`${base}/chat/completions`, { method: 'POST', signal, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` }, body: JSON.stringify(toOpenAIRequest({ ...req, model: cfg.modelId })) });
    data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(describeProviderFailure(cfg.provider, res.status, data?.error?.message || ''));
    return fromOpenAIResponse(data);
}

/**
 * Una vuelta de conversación con herramientas. Con respaldo entre proveedores
 * salvo `explicit` (un modelo elegido a mano no se sustituye en silencio).
 * Devuelve { text, toolCalls, usage, provider, model, slug, notes }.
 */
// `callImpl` y `recordImpl` se inyectan en las pruebas: una prueba NUNCA escribe consumo en la base.
export async function chatWithTools({ slug, system, messages, tools = [], maxTokens = 2048, timeoutMs = 60000, explicit = false, callImpl = callOnce, recordImpl = recordAiUsage, resolveImpl = resolveModelConfig }) {
    const chain = explicit ? [slug] : [slug, ...buildFallbackChain(slug)];
    const notes = [];
    const failures = [];
    for (const candidate of chain) {
        let cfg = null;
        const t0 = Date.now();
        try {
            cfg = await resolveImpl(candidate);
            const out = await callImpl(cfg, { system, messages, tools, maxTokens }, { timeoutMs });
            await recordImpl({ provider: cfg.provider, model: cfg.modelId, ...out.usage, latencyMs: Date.now() - t0, ok: true, feature: 'agents' });
            if (candidate !== slug) notes.push(`${slug} no respondió; se usó ${candidate}. Motivo: ${failures[0]?.reason || 'desconocido'}`);
            return { ...out, provider: cfg.provider, model: cfg.modelId, slug: candidate, notes };
        } catch (err) {
            failures.push({ slug: candidate, reason: err?.message || String(err) });
            await recordImpl({ provider: cfg?.provider || null, model: cfg?.modelId || candidate, latencyMs: Date.now() - t0, ok: false, error: err?.message, feature: 'agents' });
        }
    }
    const detail = failures.map(f => `${f.slug}: ${f.reason}`).join(' | ');
    throw new Error(failures.length > 1 ? `Ningún proveedor de IA pudo responder. ${detail}` : (failures[0]?.reason || 'Ningún proveedor de IA pudo responder.'));
}
