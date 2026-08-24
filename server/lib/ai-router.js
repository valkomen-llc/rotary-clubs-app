/**
 * ai-router.js — Router universal de modelos IA
 * Enruta peticiones al proveedor correcto (Gemini, OpenAI, Claude, Mistral, Custom)
 * Las API keys se leen desde la tabla ai_model_configs (cifradas) o desde .env como fallback.
 */

import db from './db.js';

// ── Providers ────────────────────────────────────────────────────────────────

/**
 * Un fallo de CUENTA es el que no depende del modelo ni del prompt: la
 * credencial, el permiso o la facturación. Se distingue del resto porque cambiar
 * de modelo con la misma clave no lo arregla — sólo gasta viajes.
 */
export function isAccountLevelFailure(status, message = '') {
    if (status === 401 || status === 403) return true;
    return /\b(dunning|billing|BILLING_DISABLED|SERVICE_DISABLED|quota exceeded|insufficient_quota|payment|suspended|deactivated|API key not valid)\b/i.test(message);
}

/**
 * Traduce el rechazo de un proveedor a un diagnóstico con SU CAUSA y QUÉ HACER,
 * conservando el texto original entre paréntesis.
 *
 * El motivo se propaga textual —regla del sitio— pero un texto como «Lightning
 * dunning decision is deny for project: projects/746648100373» no le dice a
 * nadie que su cuenta de Google tiene un pago rechazado. Las tres causas se
 * corrigen en sitios distintos: la consola de facturación, el panel de claves y
 * la cuota del proveedor.
 */
export function describeProviderFailure(provider, status, message = '') {
    const nombre = { google: 'Google (Gemini)', openai: 'OpenAI', anthropic: 'Anthropic', mistral: 'Mistral' }[provider] || provider;
    const original = message ? ` (${message})` : '';

    // «dunning» es el proceso de cobro de una deuda: Google lo devuelve cuando
    // la cuenta de facturación tiene un pago pendiente o rechazado.
    if (/\bdunning\b/i.test(message) || /BILLING_DISABLED|billing account/i.test(message)) {
        const proyecto = /projects\/(\d+)/.exec(message)?.[1];
        return `${nombre} rechazó la petición por un problema de FACTURACIÓN${proyecto ? ` en el proyecto ${proyecto}` : ''}: hay un pago pendiente o rechazado. Se corrige en la consola de facturación del proveedor, no desde la plataforma.${original}`;
    }
    if (/SERVICE_DISABLED|has not been used in project|is disabled/i.test(message)) {
        return `${nombre} tiene la API deshabilitada en el proyecto. Hay que habilitarla en la consola del proveedor.${original}`;
    }
    if (/API key not valid|invalid.*api key|incorrect api key/i.test(message)) {
        return `La credencial de ${nombre} no es válida. Revísala en Integraciones → Modelos IA.${original}`;
    }
    if (/quota|insufficient_quota|rate.?limit/i.test(message) || status === 429) {
        return `${nombre} agotó su cuota o está limitando las peticiones. Espera unos minutos o revisa el plan del proveedor.${original}`;
    }
    if (status === 401) return `${nombre} no aceptó la credencial (401). Revísala en Integraciones → Modelos IA.${original}`;
    if (status === 403) return `${nombre} denegó el acceso (403). Suele ser facturación, permisos del proyecto o la API sin habilitar.${original}`;
    return message || `${nombre} rechazó la petición (${status}).`;
}

/** Qué proveedores tienen credencial en el entorno. Un proveedor sin clave no
 *  es un respaldo: sería un viaje garantizado a un 401. */
export function providersWithCredentials(env = process.env) {
    return {
        google: Boolean(env.GEMINI_API_KEY),
        openai: Boolean(env.OPENAI_API_KEY),
        anthropic: Boolean(env.ANTHROPIC_API_KEY),
        mistral: Boolean(env.MISTRAL_API_KEY),
    };
}

// Orden de respaldo entre proveedores. Está DECLARADO y no se deduce: con la
// lista implícita, agregar un proveedor lo metería en medio de la cadena sin
// que nadie lo hubiera decidido.
export const PROVIDER_FALLBACK_ORDER = ['google', 'openai', 'anthropic', 'mistral'];

/**
 * Los modelos a los que caer cuando el proveedor principal no responde, uno por
 * proveedor y sólo de los que tienen credencial.
 */
export function buildFallbackChain(primarySlug, { env = process.env } = {}) {
    const disponibles = providersWithCredentials(env);
    const primario = BUILTIN_MODELS.find(m => m.slug === primarySlug);
    const yaUsado = primario?.provider;

    return PROVIDER_FALLBACK_ORDER
        .filter(p => p !== yaUsado && disponibles[p])
        .map(p => BUILTIN_MODELS.find(m => m.provider === p)?.slug)
        .filter(Boolean);
}

/** Si el prompt del sistema pide un JSON. Se mira el prompt y no una bandera de
 *  quien llama porque son quince puntos de llamada: una bandera nueva la olvida
 *  el siguiente, y el fallo sería mudo — prosa donde se espera JSON. */
function wantsJson(systemPrompt = '') {
    return /\bjson\b/i.test(String(systemPrompt));
}

/** Los modelos con cadena de razonamiento son los únicos que declaran
 *  `thinkingConfig`. Se reconocen por familia y no por una lista escrita a mano,
 *  que se quedaría vieja con el siguiente modelo. */
function supportsThinking(modelId = '') {
    return /gemini-(2\.5|3)/i.test(modelId) || /gemini-(flash|pro)-latest/i.test(modelId);
}

/** Por qué un modelo contestó sin texto. Son causas distintas y se corrigen en
 *  sitios distintos, así que se nombran: presupuesto agotado, filtro de
 *  seguridad o una respuesta que no trae candidatos. */
function describeEmpty(modelId, finishReason, data) {
    if (finishReason === 'MAX_TOKENS') {
        return `${modelId} agotó su presupuesto de salida antes de escribir nada (finishReason=MAX_TOKENS).`;
    }
    if (finishReason === 'SAFETY' || finishReason === 'PROHIBITED_CONTENT') {
        return `${modelId} bloqueó la respuesta por su filtro de contenido (finishReason=${finishReason}).`;
    }
    if (data?.promptFeedback?.blockReason) {
        return `${modelId} rechazó la petición (blockReason=${data.promptFeedback.blockReason}).`;
    }
    return `${modelId} devolvió una respuesta vacía (finishReason=${finishReason || 'desconocido'}).`;
}

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
    // El registro de lo ya intentado vive FUERA del bucle. Declarado dentro
    // nacía vacío en cada vuelta y no deduplicaba nada: con el modelo por
    // defecto —que además encabeza la lista de respaldos— se hacían dos
    // llamadas idénticas al proveedor, con su latencia y su costo.
    const seen = new Set();
    for (const { version, id } of candidates) {
        if (!id || seen.has(id)) continue;
        seen.add(id);

        const url = `https://generativelanguage.googleapis.com/${version}/models/${id}:generateContent?key=${key}`;
        // Los modelos 2.5 RAZONAN por defecto y esos tokens de pensamiento salen
        // del MISMO presupuesto que la respuesta: con una salida larga —un
        // artículo completo— el modelo agota el presupuesto pensando y devuelve
        // texto vacío o un JSON cortado a mitad, con finishReason=MAX_TOKENS.
        // Para redactar no hace falta cadena de razonamiento, así que se acota.
        // El campo sólo existe en 2.5+: mandarlo a un modelo que no lo declara
        // lo rechazaría con un 400 y el candidato se saltearía en silencio.
        const payload = supportsThinking(id)
            ? { ...body, generationConfig: { ...body.generationConfig, thinkingConfig: { thinkingBudget: 0 } } }
            : body;
        try {
            const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            const data = await res.json();
            // Log detallado de la respuesta para debugging en produccion
            const candidate = data.candidates?.[0];
            const finishReason = candidate?.finishReason;
            // La respuesta puede venir partida en varias `parts`; quedarse con
            // la primera pierde el resto del texto.
            const rawText = (candidate?.content?.parts || []).map(p => p?.text || '').join('') || '';
            console.log(`[Gemini] model=${id} status=${res.status} finishReason=${finishReason} chars=${rawText.length} raw100=${rawText.slice(0,100)}`);
            if (res.ok && rawText.trim()) return rawText;
            if (res.ok) {
                // UNA RESPUESTA VACÍA NO ES UN ÉXITO. Hasta v4.890 se devolvía
                // el texto vacío como si fuera la respuesta del modelo: la
                // cadena de candidatos se cortaba en el primero y quien llamaba
                // fallaba después, al intentar leer un JSON que nunca existió.
                // El motivo va en el mensaje porque es el diagnóstico entero.
                lastError = describeEmpty(id, finishReason, data);
                continue;
            }
            const apiMessage = data.error?.message || '';
            // ⚠️ UN FALLO DE CUENTA NO MEJORA PROBANDO OTRO MODELO: los cinco
            // candidatos comparten la MISMA clave y la MISMA cuenta de
            // facturación, así que se gastarían cinco viajes para recibir cinco
            // veces el mismo rechazo. Se corta aquí y se dice qué pasa.
            if (isAccountLevelFailure(res.status, apiMessage)) {
                throw new Error(describeProviderFailure('google', res.status, apiMessage));
            }
            if (res.status === 404 || res.status === 400) { lastError = apiMessage || `${id} not found`; continue; }
            throw new Error(apiMessage || 'Error Gemini API');
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
            // ⚠️ EL MODO JSON SÓLO SE PIDE SI QUIEN LLAMA PIDE JSON. Estaba
            // forzado para TODOS: hasta v4.891 no se notaba porque el modelo por
            // defecto es Gemini y nada caía aquí, pero con respaldo entre
            // proveedores un endpoint de conversación aterrizaría en OpenAI y
            // recibiría JSON donde espera prosa. Además OpenAI RECHAZA la
            // petición si se pide este modo y el prompt no nombra «json».
            ...(wantsJson(systemPrompt) ? { response_format: { type: 'json_object' } } : {})
        })
    });
    const data = await res.json();
    if (!res.ok) {
        throw new Error(describeProviderFailure('openai', res.status, data.error?.message || ''));
    }
    const texto = data.choices?.[0]?.message?.content || '';
    // Una respuesta vacía no es un éxito, igual que en Gemini: quien llama
    // fallaría después al leer algo que nunca existió.
    if (!texto.trim()) throw new Error(`OpenAI devolvió una respuesta vacía (finishReason=${data.choices?.[0]?.finish_reason || 'desconocido'}).`);
    return texto;
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
    if (!res.ok) throw new Error(describeProviderFailure('anthropic', res.status, data.error?.message || ''));
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
    if (!res.ok) throw new Error(describeProviderFailure('mistral', res.status, data.error?.message || ''));
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
 * @param {Array}  history - Turnos previos, si los hay
 * @param {{maxTokens?: number, explicit?: boolean, notes?: string[]}} options
 *        maxTokens: presupuesto de salida para esta llamada.
 *        explicit: el modelo lo eligió una persona — sin respaldo automático.
 *        notes: se rellena con lo que se intentó, para poder decirlo en pantalla.
 * @returns {Promise<string>} - Texto de salida del modelo
 */
export async function routeToModel(slug, systemPrompt, userPrompt, history = [], options = {}) {
    // ⚠️ UNA AVERÍA EN UN PROVEEDOR NO PUEDE TUMBAR TODA LA IA DE LA PLATAFORMA.
    // Hasta v4.891 se elegía UN proveedor y si fallaba se acababa ahí: un pago
    // rechazado en la cuenta de Google dejaba sin asistente de redacción, sin
    // sugerencias de SEO y sin copys, teniendo credencial de OpenAI cargada.
    //
    // Un modelo pedido A MANO no tiene respaldo: quien lo eligió eligió, y
    // silenciarlo con otro motor sería desobedecerlo. Es la misma regla que el
    // montaje y la música del Creador de Reels.
    const cadena = options.explicit ? [slug] : [slug, ...buildFallbackChain(slug)];
    const notas = Array.isArray(options.notes) ? options.notes : [];
    const fallos = [];

    for (const candidato of cadena) {
        try {
            const salida = await callModel(candidato, systemPrompt, userPrompt, history, options);
            if (candidato !== slug) {
                const nota = `${slug} no respondió; se usó ${candidato}. Motivo: ${fallos[0]?.motivo || 'desconocido'}`;
                notas.push(nota);
                console.warn(`[ai-router] ${nota}`);
            }
            return salida;
        } catch (e) {
            fallos.push({ slug: candidato, motivo: e.message });
            console.warn(`[ai-router] ${candidato} falló: ${e.message}`);
        }
    }

    // Agotada la cadena, el motivo de CADA proveedor se propaga textual: con un
    // mensaje único no se sabe si falta una credencial, si hay una deuda o si
    // todos están caídos, y son tres cosas que se corrigen en sitios distintos.
    const detalle = fallos.map(f => `${f.slug}: ${f.motivo}`).join(' | ');
    throw new Error(fallos.length > 1
        ? `Ningún proveedor de IA pudo responder. ${detalle}`
        : (fallos[0]?.motivo || 'Ningún proveedor de IA pudo responder.'));
}

/** Una sola llamada a un modelo concreto. Separado de la cadena de respaldo
 *  para que ésta no tenga que saber cómo se resuelve una configuración. */
async function callModel(slug, systemPrompt, userPrompt, history, options) {
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
        // El presupuesto de salida lo puede subir quien llama: una respuesta
        // corta (un titular, un icono) no necesita lo mismo que un artículo
        // completo. Sin este parámetro todo salía con los 4096 por defecto.
        maxTokens: options.maxTokens || config.max_tokens || 4096,
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
