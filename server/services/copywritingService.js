/**
 * Copywriting Service — multi-model adapter (v4.343).
 *
 * Abstracts the differences between OpenAI, Anthropic and Google Gemini behind a
 * single `generateCopy({ system, userText, imageUrl, ... })` call. All adapters
 * return the same shape so callers (Content Studio, future bulk-tag job, etc.)
 * don't care which provider actually ran.
 *
 * Phase 1 providers:
 *   - openai   → GPT-4o     (https://api.openai.com/v1/chat/completions)
 *   - anthropic → Claude Sonnet 4.6 (https://api.anthropic.com/v1/messages)
 *   - gemini   → Gemini 2.5 Flash    (generativelanguage.googleapis.com)
 *
 * Each is vision-capable (the image is part of the user message). For
 * text-only providers (Perplexity Sonar, DeepSeek) we'll add them in
 * Phase 2 alongside text-only use cases like hashtag-only generation
 * or news-grounded copy.
 *
 * Output contract: every adapter returns
 *   { content: string, raw: object, provider: string, model: string }
 * `content` is the raw response text. If `jsonMode: true`, the caller should
 * JSON.parse(content) — all three providers reliably emit valid JSON when
 * asked.
 */

const OPENAI_MODEL  = 'gpt-4o';
const ANTHROPIC_MODEL = 'claude-sonnet-4-6';
const GEMINI_MODEL  = 'gemini-2.5-flash';

// ─── Registry ──────────────────────────────────────────────────────────────

export const COPY_PROVIDERS = {
    openai: {
        id: 'openai',
        label: 'OpenAI · GPT-4o',
        envKey: 'OPENAI_API_KEY',
        vision: true,
        defaultModel: OPENAI_MODEL
    },
    anthropic: {
        id: 'anthropic',
        label: 'Anthropic · Claude Sonnet 4.6',
        envKey: 'ANTHROPIC_API_KEY',
        vision: true,
        defaultModel: ANTHROPIC_MODEL
    },
    gemini: {
        id: 'gemini',
        label: 'Google · Gemini 2.5 Flash',
        envKey: 'GEMINI_API_KEY',
        vision: true,
        defaultModel: GEMINI_MODEL
    }
};

export const DEFAULT_COPY_PROVIDER = 'openai';

export const isProviderAvailable = (providerId) => {
    const p = COPY_PROVIDERS[providerId];
    if (!p) return false;
    return !!process.env[p.envKey];
};

// ─── Per-provider adapters ─────────────────────────────────────────────────

// OpenAI GPT-4o via /chat/completions with native JSON mode and image_url.
const generateWithOpenAI = async ({ system, userText, imageUrl, temperature, maxTokens, jsonMode, model }) => {
    const body = {
        model: model || OPENAI_MODEL,
        temperature: temperature ?? 0.6,
        max_tokens: maxTokens ?? 1400,
        messages: [
            { role: 'system', content: system },
            {
                role: 'user',
                content: imageUrl
                    ? [{ type: 'text', text: userText }, { type: 'image_url', image_url: { url: imageUrl } }]
                    : userText
            }
        ]
    };
    if (jsonMode) body.response_format = { type: 'json_object' };

    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: JSON.stringify(body)
    });
    const data = await resp.json();
    if (!resp.ok) {
        const reason = data?.error?.message || `HTTP ${resp.status}`;
        throw new Error(`OpenAI ${OPENAI_MODEL}: ${reason}`);
    }
    const content = data?.choices?.[0]?.message?.content;
    if (!content) {
        const finish = data?.choices?.[0]?.finish_reason || 'unknown';
        throw new Error(`OpenAI ${OPENAI_MODEL} sin contenido (finish_reason: ${finish})`);
    }
    return { content, raw: data, provider: 'openai', model: body.model };
};

// Anthropic Claude via /v1/messages with native vision (image URL or base64).
// JSON mode is prompt-engineered — Claude reliably returns JSON when system
// prompt says "responde SIEMPRE con JSON válido y nada más".
const generateWithAnthropic = async ({ system, userText, imageUrl, temperature, maxTokens, jsonMode, model }) => {
    const userContent = [{ type: 'text', text: userText }];
    if (imageUrl) {
        userContent.push({
            type: 'image',
            source: { type: 'url', url: imageUrl }
        });
    }
    const finalSystem = jsonMode
        ? `${system}\n\nResponde SIEMPRE con JSON válido y nada más. No incluyas texto antes ni después del JSON, ni bloques de código markdown. Solo el objeto JSON.`
        : system;

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': process.env.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
            model: model || ANTHROPIC_MODEL,
            max_tokens: maxTokens ?? 1400,
            temperature: temperature ?? 0.6,
            system: finalSystem,
            messages: [{ role: 'user', content: userContent }]
        })
    });
    const data = await resp.json();
    if (!resp.ok) {
        const reason = data?.error?.message || data?.message || `HTTP ${resp.status}`;
        throw new Error(`Anthropic ${ANTHROPIC_MODEL}: ${reason}`);
    }
    const content = (data?.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
    if (!content) {
        throw new Error(`Anthropic ${ANTHROPIC_MODEL} sin contenido (stop_reason: ${data?.stop_reason || 'unknown'})`);
    }
    // Defensive: si vino con bloque ```json``` por algún motivo, lo limpiamos.
    const cleaned = content.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
    return { content: cleaned, raw: data, provider: 'anthropic', model: model || ANTHROPIC_MODEL };
};

// Google Gemini via generateContent endpoint. Image must be inline base64
// (Gemini's Files API would need pre-upload — simpler to encode here).
//
// Note on maxOutputTokens: Gemini cuts the response hard at the limit and
// produces unterminated JSON. We default to a generous cap (4000) because
// Gemini Flash has 8K output capacity and our copy responses can run 1500-2500
// tokens (4 platforms × full copies + hashtags + visual_prompt).
const generateWithGemini = async ({ system, userText, imageUrl, temperature, maxTokens, jsonMode, model }) => {
    const parts = [{ text: userText }];
    if (imageUrl) {
        const imgResp = await fetch(imageUrl);
        if (!imgResp.ok) throw new Error(`Gemini: no pudo descargar imagen (${imgResp.status})`);
        const buf = Buffer.from(await imgResp.arrayBuffer());
        const mime = imgResp.headers.get('content-type') || 'image/jpeg';
        parts.push({ inline_data: { mime_type: mime, data: buf.toString('base64') } });
    }
    const m = model || GEMINI_MODEL;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`;
    const body = {
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts }],
        generationConfig: {
            temperature: temperature ?? 0.6,
            // Bump default for Gemini specifically: truncated output produces
            // unterminated JSON. 4000 fits within Flash's 8K output ceiling.
            maxOutputTokens: maxTokens ? Math.max(maxTokens, 4000) : 4000,
            ...(jsonMode ? { responseMimeType: 'application/json' } : {})
        }
    };
    const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    const data = await resp.json();
    if (!resp.ok) {
        const reason = data?.error?.message || `HTTP ${resp.status}`;
        throw new Error(`Gemini ${m}: ${reason}`);
    }
    const cand = data?.candidates?.[0];
    const finishReason = cand?.finishReason;
    let content = (cand?.content?.parts || []).map(p => p.text).filter(Boolean).join('').trim();
    if (!content) {
        throw new Error(`Gemini ${m} sin contenido (finish_reason: ${finishReason || 'unknown'})`);
    }
    // Si finishReason == MAX_TOKENS y pedimos JSON, el output está truncado
    // y JSON.parse va a fallar. Reportamos un error claro en vez de devolver
    // string roto.
    if (jsonMode && finishReason === 'MAX_TOKENS') {
        throw new Error(`Gemini ${m} truncado por MAX_TOKENS (output incompleto, no JSON válido). Bump maxOutputTokens en la llamada.`);
    }
    // Strip markdown code fences defensivamente — pueden aparecer incluso con
    // responseMimeType:application/json en algunos casos edge.
    content = content
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/```\s*$/i, '')
        .trim();
    return { content, raw: data, provider: 'gemini', model: m };
};

const ADAPTERS = {
    openai: generateWithOpenAI,
    anthropic: generateWithAnthropic,
    gemini: generateWithGemini
};

// ─── Public API ────────────────────────────────────────────────────────────

// Generate copy with the requested provider. Falls back to DEFAULT_COPY_PROVIDER
// if the requested one isn't available (env key missing) or fails at runtime.
// Throws only when ALL configured providers fail.
export const generateCopy = async ({
    provider = DEFAULT_COPY_PROVIDER,
    system,
    userText,
    imageUrl = null,
    temperature = 0.6,
    maxTokens = 1400,
    jsonMode = false,
    model = null,
    fallbackChain = null
}) => {
    // Build the providers to try: requested first, then defaults, dedup.
    const chain = (fallbackChain || [provider, DEFAULT_COPY_PROVIDER])
        .filter((p, i, a) => p && a.indexOf(p) === i)
        .filter(p => COPY_PROVIDERS[p] && isProviderAvailable(p));

    if (chain.length === 0) {
        throw new Error(`Ningún proveedor de copy disponible (revisar env vars: ${Object.values(COPY_PROVIDERS).map(p => p.envKey).join(', ')})`);
    }

    const errors = [];
    for (const p of chain) {
        try {
            const result = await ADAPTERS[p]({ system, userText, imageUrl, temperature, maxTokens, jsonMode, model });
            if (p !== provider) {
                console.warn(`[copywriting] fallback usado: ${provider} → ${p}`);
            }
            return result;
        } catch (e) {
            console.error(`[copywriting] ${p} falló:`, e.message);
            errors.push(`${p}: ${e.message}`);
        }
    }
    throw new Error(`Todos los proveedores de copy fallaron — ${errors.join(' | ')}`);
};
