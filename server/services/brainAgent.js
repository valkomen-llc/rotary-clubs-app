// ─────────────────────────────────────────────────────────────────────────────
// 🤖 BRAIN AGENT v4.375 — Cerebro como Agente Operativo
//
// Convierte el cerebro pasivo (que solo indexa y configura) en un agente que
// puede conversar y ejecutar acciones reales sobre el sitio.
//
// Componentes:
//   1. logActivity() — registra cada cosa que hace el cerebro
//   2. chat() — endpoint conversacional con RAG sobre las memorias del brain
//   3. TOOLS — funciones que el LLM puede ejecutar (function calling)
//
// Backend LLM: Gemini Pro con function calling (ya tenemos GEMINI_API_KEY).
// Si no hay key, fallback a respuesta basada solo en RAG sin generación.
// ─────────────────────────────────────────────────────────────────────────────
import prisma from '../lib/prisma.js';
import { searchMemories } from './brainService.js';

console.log('🤖 BRAIN AGENT v4.375 — chat conversacional + tools + activity log online');

const GEMINI_CHAT_MODEL = 'gemini-2.0-flash-exp';
const GEMINI_CHAT_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_CHAT_MODEL}:generateContent`;

// ─── Activity log ───────────────────────────────────────────────────────────

export async function logActivity({ brainId, kind, title, detail, metadata, userId }) {
    if (!brainId || !kind || !title) return null;
    try {
        return await prisma.brainActivity.create({
            data: {
                brainId,
                kind,
                title: title.slice(0, 500),
                detail: detail ? String(detail).slice(0, 2000) : null,
                metadata: metadata || {},
                userId: userId || null,
            },
        });
    } catch (err) {
        console.warn('[brainAgent] logActivity err:', err.message);
        return null;
    }
}

export async function listActivities({ brainId, limit = 30, kind }) {
    try {
        return await prisma.brainActivity.findMany({
            where: { brainId, ...(kind ? { kind } : {}) },
            orderBy: { createdAt: 'desc' },
            take: Math.min(limit, 100),
        });
    } catch (err) {
        console.warn('[brainAgent] listActivities err:', err.message);
        return [];
    }
}

// ─── Tools ──────────────────────────────────────────────────────────────────
// Cada tool tiene:
//   - schema (para function calling de Gemini)
//   - execute(args, ctx) — implementación. ctx = { brainId, clubId, userId }

const TOOLS = [
    {
        name: 'search_memories',
        description: 'Busca memorias del cerebro por similaridad semántica. Útil para responder preguntas basadas en el contenido del sitio.',
        schema: {
            type: 'object',
            properties: {
                query: { type: 'string', description: 'La pregunta o concepto a buscar' },
                k: { type: 'number', description: 'Cantidad de resultados (default 5)' },
            },
            required: ['query'],
        },
        async execute({ query, k = 5 }, { brainId }) {
            const results = await searchMemories({ brainId, query, k });
            return {
                count: results.length,
                memories: results.map(r => ({
                    title: r.memory.title,
                    kind: r.memory.kind,
                    sourceType: r.memory.sourceType,
                    content: (r.memory.content || '').slice(0, 400),
                    relevance: Math.round(r.score * 100),
                })),
            };
        },
    },
    {
        name: 'create_post_draft',
        description: 'Crea un borrador de publicación (Post) en el sitio. NO se publica automáticamente, queda como draft para que el admin revise.',
        schema: {
            type: 'object',
            properties: {
                title: { type: 'string', description: 'Título del post' },
                content: { type: 'string', description: 'Contenido en markdown o texto plano' },
                category: { type: 'string', description: 'Categoría opcional' },
            },
            required: ['title', 'content'],
        },
        async execute({ title, content, category }, { clubId, userId }) {
            if (!clubId) return { error: 'No clubId — el agente no puede crear posts sin un club asociado.' };
            try {
                const post = await prisma.post.create({
                    data: {
                        title: title.slice(0, 300),
                        content,
                        clubId,
                        category: category || 'general',
                        published: false,
                        authorId: userId || null,
                    },
                });
                return { ok: true, postId: post.id, title: post.title, status: 'draft', message: 'Post creado como borrador. Revisalo y publicalo cuando estés listo.' };
            } catch (err) {
                return { error: err.message?.slice(0, 200) };
            }
        },
    },
    {
        name: 'summarize_recent_activity',
        description: 'Resume la actividad reciente del cerebro: qué se indexó, qué se procesó, qué nuevas conexiones aparecieron.',
        schema: {
            type: 'object',
            properties: {
                days: { type: 'number', description: 'Cuántos días hacia atrás mirar (default 7)' },
            },
        },
        async execute({ days = 7 }, { brainId }) {
            const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
            const activities = await prisma.brainActivity.findMany({
                where: { brainId, createdAt: { gte: since } },
                orderBy: { createdAt: 'desc' },
                take: 50,
            });
            const byKind = activities.reduce((acc, a) => {
                acc[a.kind] = (acc[a.kind] || 0) + 1;
                return acc;
            }, {});
            return {
                periodDays: days,
                totalActivities: activities.length,
                breakdown: byKind,
                samples: activities.slice(0, 5).map(a => ({ kind: a.kind, title: a.title, when: a.createdAt })),
            };
        },
    },
    {
        name: 'list_upcoming_events',
        description: 'Lista los próximos eventos del calendario del sitio.',
        schema: {
            type: 'object',
            properties: {
                daysAhead: { type: 'number', description: 'Cuántos días hacia adelante (default 14)' },
            },
        },
        async execute({ daysAhead = 14 }, { clubId }) {
            if (!clubId) return { error: 'No clubId asociado al user' };
            const until = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);
            try {
                const events = await prisma.calendarEvent.findMany({
                    where: { clubId, startDate: { gte: new Date(), lte: until } },
                    orderBy: { startDate: 'asc' },
                    take: 20,
                    select: { id: true, title: true, description: true, startDate: true, endDate: true, location: true, type: true },
                });
                return {
                    daysAhead,
                    count: events.length,
                    events,
                };
            } catch (err) {
                return { error: err.message?.slice(0, 200) };
            }
        },
    },
];

const TOOLS_BY_NAME = Object.fromEntries(TOOLS.map(t => [t.name, t]));

// ─── Chat con RAG + Function calling ────────────────────────────────────────

async function buildSystemPrompt({ brain }) {
    const identity = brain.identityPrompt || `Eres el cerebro de "${brain.name}".`;
    return [
        identity,
        '',
        '── Capacidades disponibles ──',
        'Tenés acceso a herramientas que podés usar para responder mejor:',
        '· search_memories: busca info indexada del sitio',
        '· create_post_draft: crea borradores de publicaciones (NO los publica)',
        '· summarize_recent_activity: resume lo que hiciste recientemente',
        '· list_upcoming_events: ve los próximos eventos del calendario',
        '',
        '── Lineamientos ──',
        '· Respondé en español, conciso y profesional.',
        '· Si no tenés contexto suficiente, usá search_memories primero.',
        '· Si el user pide crear contenido, ofrecé crearlo como borrador con create_post_draft.',
        '· No inventes información. Si no sabés algo, decilo.',
        '· Usá emojis con moderación, solo cuando aporten claridad.',
    ].join('\n');
}

// Convierte tools a formato de Gemini function declarations
function toolsToGeminiFunctions() {
    return TOOLS.map(t => ({
        name: t.name,
        description: t.description,
        parameters: t.schema,
    }));
}

async function callGemini({ systemPrompt, history, userMessage, enableTools = true }) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
        return { text: '⚠️ El LLM no está configurado (GEMINI_API_KEY faltante). Solo puedo responder con búsqueda semántica.', toolCalls: [] };
    }

    // Build Gemini contents
    const contents = [];
    for (const m of history) {
        if (m.role === 'user') {
            contents.push({ role: 'user', parts: [{ text: m.content }] });
        } else if (m.role === 'assistant') {
            contents.push({ role: 'model', parts: [{ text: m.content }] });
        } else if (m.role === 'tool' && m.toolName) {
            contents.push({
                role: 'user',
                parts: [{ functionResponse: { name: m.toolName, response: m.toolResult || {} } }],
            });
        }
    }
    contents.push({ role: 'user', parts: [{ text: userMessage }] });

    const body = {
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents,
        generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
        ...(enableTools ? { tools: [{ functionDeclarations: toolsToGeminiFunctions() }] } : {}),
    };

    try {
        const r = await fetch(`${GEMINI_CHAT_ENDPOINT}?key=${encodeURIComponent(key)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (!r.ok) {
            const errText = await r.text().catch(() => '');
            console.warn('[brainAgent] gemini err:', r.status, errText.slice(0, 200));
            return { text: `Error del LLM (${r.status}). Intentá de nuevo.`, toolCalls: [], error: true };
        }
        const data = await r.json();
        const candidate = data?.candidates?.[0];
        const parts = candidate?.content?.parts || [];

        const toolCalls = [];
        let text = '';
        for (const part of parts) {
            if (part.text) text += part.text;
            if (part.functionCall) {
                toolCalls.push({
                    name: part.functionCall.name,
                    args: part.functionCall.args || {},
                });
            }
        }
        return { text, toolCalls };
    } catch (err) {
        console.error('[brainAgent] gemini exception:', err.message);
        return { text: `Error de red: ${err.message}`, toolCalls: [], error: true };
    }
}

// Endpoint principal del chat. Maneja:
//   1. Recibe mensaje del user
//   2. Hace RAG: busca memorias relevantes
//   3. Llama Gemini con system + history + memorias + tools
//   4. Si Gemini quiere ejecutar tools, los ejecuta y reitera
//   5. Persiste todo en BrainChatMessage
//   6. logActivity('chat_message', ...)
export async function chatWithBrain({ brainId, brain, sessionId, message, clubId, userId }) {
    const t0 = Date.now();

    // 1. Persistir mensaje del user
    await prisma.brainChatMessage.create({
        data: { brainId, sessionId, role: 'user', content: message, userId },
    }).catch(err => console.warn('[brainAgent] save user msg:', err.message));

    // 2. RAG: buscar top-5 memorias relevantes (inyectadas como contexto)
    let relevantMemories = [];
    try {
        const results = await searchMemories({ brainId, query: message, k: 5 });
        relevantMemories = results.map(r => `- ${r.memory.title}: ${(r.memory.content || '').slice(0, 300)}`);
    } catch { /* ignore */ }

    // 3. Cargar history de la sesión (max 10 últimos mensajes)
    const historyRaw = await prisma.brainChatMessage.findMany({
        where: { brainId, sessionId },
        orderBy: { createdAt: 'asc' },
        take: 30,
    }).catch(() => []);
    const history = historyRaw.slice(0, -1); // sin el último (que es el actual)

    // 4. Construir prompt
    const baseSystem = await buildSystemPrompt({ brain });
    const systemWithRAG = relevantMemories.length > 0
        ? `${baseSystem}\n\n── Memorias relevantes para esta pregunta ──\n${relevantMemories.join('\n')}`
        : baseSystem;

    // 5. Llamar LLM
    const ctx = { brainId, clubId, userId };
    const { text, toolCalls } = await callGemini({
        systemPrompt: systemWithRAG,
        history,
        userMessage: message,
        enableTools: true,
    });

    // 6. Si pidió usar tools, ejecutarlos
    const executedTools = [];
    for (const call of toolCalls.slice(0, 3)) { // max 3 tools por turno
        const tool = TOOLS_BY_NAME[call.name];
        if (!tool) {
            executedTools.push({ name: call.name, ok: false, error: 'Tool no existe' });
            continue;
        }
        try {
            const result = await tool.execute(call.args || {}, ctx);
            executedTools.push({ name: call.name, ok: true, args: call.args, result });

            // Persistir como mensaje tool
            await prisma.brainChatMessage.create({
                data: {
                    brainId, sessionId, role: 'tool',
                    content: `Tool ${call.name} ejecutado`,
                    toolName: call.name,
                    toolArgs: call.args || {},
                    toolResult: result,
                    userId,
                },
            }).catch(() => null);

            await logActivity({
                brainId, kind: 'tool_executed',
                title: `Tool ejecutado: ${call.name}`,
                detail: JSON.stringify(call.args || {}).slice(0, 500),
                metadata: { tool: call.name, sessionId },
                userId,
            });
        } catch (err) {
            executedTools.push({ name: call.name, ok: false, error: err.message?.slice(0, 200) });
        }
    }

    // 7. Si hubo tools, segunda pasada al LLM con los resultados
    let finalText = text;
    if (executedTools.length > 0 && executedTools.some(t => t.ok)) {
        const secondHistory = [
            ...history,
            { role: 'user', content: message },
            ...(text ? [{ role: 'assistant', content: text }] : []),
            ...executedTools.filter(t => t.ok).map(t => ({
                role: 'tool', toolName: t.name, toolResult: t.result,
            })),
        ];
        const second = await callGemini({
            systemPrompt: systemWithRAG,
            history: secondHistory,
            userMessage: '(Continuá con los resultados de los tools.)',
            enableTools: false,
        });
        finalText = second.text || text || '(sin respuesta)';
    }

    if (!finalText) finalText = '(sin respuesta del LLM)';

    // 8. Persistir respuesta del assistant
    const assistantMsg = await prisma.brainChatMessage.create({
        data: {
            brainId, sessionId, role: 'assistant',
            content: finalText,
            metadata: {
                ragMemories: relevantMemories.length,
                toolsExecuted: executedTools.length,
                elapsedMs: Date.now() - t0,
            },
            userId,
        },
    }).catch(err => { console.warn('[brainAgent] save assistant msg:', err.message); return null; });

    // 9. logActivity
    await logActivity({
        brainId, kind: 'chat_message',
        title: `Conversación: "${message.slice(0, 80)}"`,
        detail: finalText.slice(0, 500),
        metadata: { sessionId, toolsExecuted: executedTools.map(t => t.name) },
        userId,
    });

    return {
        ok: true,
        message: { id: assistantMsg?.id, role: 'assistant', content: finalText, createdAt: assistantMsg?.createdAt || new Date() },
        toolsExecuted: executedTools,
        ragMemories: relevantMemories.length,
        elapsedMs: Date.now() - t0,
    };
}

export async function listChatHistory({ brainId, sessionId, limit = 50 }) {
    try {
        return await prisma.brainChatMessage.findMany({
            where: { brainId, sessionId },
            orderBy: { createdAt: 'asc' },
            take: Math.min(limit, 200),
        });
    } catch {
        return [];
    }
}

export async function listChatSessions({ brainId, limit = 10 }) {
    try {
        const rows = await prisma.brainChatMessage.findMany({
            where: { brainId },
            orderBy: { createdAt: 'desc' },
            take: 500,
            select: { sessionId: true, content: true, role: true, createdAt: true },
        });
        // Agrupar por sessionId, tomar el primer user message de cada sesión
        const sessions = new Map();
        for (const m of rows) {
            if (!sessions.has(m.sessionId)) {
                sessions.set(m.sessionId, {
                    sessionId: m.sessionId,
                    preview: m.role === 'user' ? m.content.slice(0, 120) : '(sin preview)',
                    lastAt: m.createdAt,
                    messageCount: 1,
                });
            } else {
                const s = sessions.get(m.sessionId);
                s.messageCount++;
                if (s.lastAt < m.createdAt) s.lastAt = m.createdAt;
                if (s.preview === '(sin preview)' && m.role === 'user') s.preview = m.content.slice(0, 120);
            }
        }
        return Array.from(sessions.values())
            .sort((a, b) => b.lastAt.getTime() - a.lastAt.getTime())
            .slice(0, limit);
    } catch {
        return [];
    }
}
