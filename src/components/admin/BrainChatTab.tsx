import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Send, Loader2, MessageCircle, Sparkles, Wrench, RefreshCw, Brain, History } from 'lucide-react';
import { toast } from 'sonner';

const API = import.meta.env.VITE_API_URL || '/api';

interface ChatMessage {
    id?: string;
    role: 'user' | 'assistant' | 'tool';
    content: string;
    toolName?: string | null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    toolArgs?: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    toolResult?: any;
    createdAt?: string;
}

interface SessionSummary {
    sessionId: string;
    preview: string;
    lastAt: string;
    messageCount: number;
}

interface BrainChatTabProps {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    brain: any;
    headers: Record<string, string>;
}

const STORAGE_KEY = (brainId: string) => `brain-chat-session-${brainId}`;

const SUGGESTIONS = [
    '¿Qué proyectos tenemos en curso?',
    'Resumí la actividad de la última semana',
    'Generá un borrador de noticia sobre los próximos eventos',
    'Buscá memorias relacionadas con educación',
    '¿Qué eventos vienen en las próximas 2 semanas?',
];

const BrainChatTab: React.FC<BrainChatTabProps> = ({ brain, headers }) => {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [sessions, setSessions] = useState<SessionSummary[]>([]);
    const [sessionId, setSessionId] = useState<string>('');
    const [input, setInput] = useState('');
    const [sending, setSending] = useState(false);
    const [historyOpen, setHistoryOpen] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    // Restaurar última session del localStorage
    useEffect(() => {
        const stored = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY(brain.id)) : null;
        if (stored) setSessionId(stored);
    }, [brain.id]);

    // Persistir session actual
    useEffect(() => {
        if (sessionId && typeof window !== 'undefined') localStorage.setItem(STORAGE_KEY(brain.id), sessionId);
    }, [sessionId, brain.id]);

    // Cargar history al cambiar sessionId
    const loadHistory = useCallback(async () => {
        try {
            const url = sessionId
                ? `${API}/brains/me/chat/history?sessionId=${encodeURIComponent(sessionId)}`
                : `${API}/brains/me/chat/history`;
            const r = await fetch(url, { headers });
            if (r.ok) {
                const data = await r.json();
                setMessages(data.messages || []);
                setSessions(data.sessions || []);
            }
        } catch { /* ignore */ }
    }, [sessionId, headers]);

    useEffect(() => { loadHistory(); }, [loadHistory]);

    // Auto-scroll al final cuando llega mensaje nuevo
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, sending]);

    const send = async (textOverride?: string) => {
        const text = (textOverride || input).trim();
        if (!text || sending) return;
        setInput('');
        setSending(true);

        // Optimistic update — añade el mensaje del user al estado local inmediato
        const userMsg: ChatMessage = { role: 'user', content: text, createdAt: new Date().toISOString() };
        setMessages(prev => [...prev, userMsg]);

        try {
            const r = await fetch(`${API}/brains/me/chat`, {
                method: 'POST',
                headers: { ...headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: text, sessionId: sessionId || undefined }),
            });
            if (!r.ok) {
                const err = await r.json().catch(() => ({}));
                toast.error(err.detail || err.error || 'No se pudo enviar el mensaje');
                return;
            }
            const data = await r.json();
            if (data.sessionId && data.sessionId !== sessionId) setSessionId(data.sessionId);

            // Agregar tools ejecutados + respuesta del assistant
            const newMessages: ChatMessage[] = [];
            if (data.toolsExecuted) {
                for (const t of data.toolsExecuted) {
                    newMessages.push({
                        role: 'tool',
                        toolName: t.name,
                        toolArgs: t.args,
                        toolResult: t.result,
                        content: `Tool ${t.name} ejecutado`,
                    });
                }
            }
            if (data.message) newMessages.push(data.message);
            setMessages(prev => [...prev, ...newMessages]);
        } catch (err) {
            toast.error(`Error: ${(err as Error).message}`);
        } finally {
            setSending(false);
        }
    };

    const startNewSession = () => {
        setSessionId('');
        setMessages([]);
        setHistoryOpen(false);
        if (typeof window !== 'undefined') localStorage.removeItem(STORAGE_KEY(brain.id));
    };

    const switchSession = (sid: string) => {
        setSessionId(sid);
        setHistoryOpen(false);
    };

    return (
        <div className="flex flex-col h-[640px] gap-3">
            {/* Header */}
            <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-violet-600" />
                    <span className="text-sm font-bold text-gray-900">Chat con tu cerebro</span>
                    {sessionId && <span className="text-[10px] text-gray-400 font-mono">{sessionId.slice(0, 18)}…</span>}
                </div>
                <div className="flex items-center gap-1">
                    <button
                        onClick={() => setHistoryOpen(o => !o)}
                        className="flex items-center gap-1 px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-100 rounded-lg"
                    >
                        <History className="w-3 h-3" />Historial
                    </button>
                    <button
                        onClick={startNewSession}
                        className="flex items-center gap-1 px-2.5 py-1 text-xs bg-violet-100 hover:bg-violet-200 text-violet-700 rounded-lg font-medium"
                    >
                        <RefreshCw className="w-3 h-3" />Nueva sesión
                    </button>
                </div>
            </div>

            {historyOpen && sessions.length > 0 && (
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-2 max-h-40 overflow-y-auto space-y-1">
                    {sessions.map(s => (
                        <button
                            key={s.sessionId}
                            onClick={() => switchSession(s.sessionId)}
                            className={`w-full text-left px-3 py-2 rounded-lg text-xs hover:bg-white transition-colors ${
                                s.sessionId === sessionId ? 'bg-white border border-violet-200' : ''
                            }`}
                        >
                            <div className="font-medium text-gray-700 truncate">{s.preview}</div>
                            <div className="text-[10px] text-gray-400 mt-0.5">{s.messageCount} msgs · {new Date(s.lastAt).toLocaleString()}</div>
                        </button>
                    ))}
                </div>
            )}

            {/* Mensajes */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto bg-gradient-to-b from-slate-50/40 to-violet-50/30 rounded-xl p-4 space-y-3">
                {messages.length === 0 && !sending && (
                    <div className="flex flex-col items-center justify-center h-full text-center py-8">
                        <Brain className="w-12 h-12 text-violet-300 mb-3" />
                        <p className="text-sm font-medium text-gray-700 mb-1">Conversá con tu cerebro inteligente</p>
                        <p className="text-xs text-gray-500 max-w-md mb-4">
                            Hacé preguntas sobre el contenido del sitio, pedile que genere borradores, resuma actividad o liste eventos. Tiene acceso a las memorias indexadas + tools.
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-xl w-full">
                            {SUGGESTIONS.map(s => (
                                <button
                                    key={s}
                                    onClick={() => send(s)}
                                    className="text-left text-xs bg-white hover:bg-violet-50 border border-gray-200 hover:border-violet-200 rounded-lg px-3 py-2 text-gray-700 transition-colors"
                                >
                                    {s}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {messages.map((m, i) => <MessageBubble key={m.id || i} msg={m} />)}

                {sending && (
                    <div className="flex items-start gap-2 max-w-3xl">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center flex-shrink-0">
                            <Brain className="w-4 h-4 text-white" />
                        </div>
                        <div className="flex items-center gap-2 px-4 py-3 bg-white rounded-2xl border border-gray-200 text-xs text-gray-500">
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-violet-500" />
                            Pensando…
                        </div>
                    </div>
                )}
            </div>

            {/* Input */}
            <div className="flex items-end gap-2 bg-white border border-gray-200 rounded-xl p-2 focus-within:border-violet-400 focus-within:ring-2 focus-within:ring-violet-100">
                <textarea
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            send();
                        }
                    }}
                    placeholder="Escribí tu mensaje… (Enter para enviar, Shift+Enter para nueva línea)"
                    rows={2}
                    className="flex-1 px-3 py-2 text-sm bg-transparent outline-none resize-none"
                    disabled={sending}
                />
                <button
                    onClick={() => send()}
                    disabled={sending || !input.trim()}
                    className="flex items-center gap-1.5 px-4 py-2.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium shadow-sm shadow-violet-500/20"
                >
                    {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    Enviar
                </button>
            </div>
        </div>
    );
};

const MessageBubble: React.FC<{ msg: ChatMessage }> = ({ msg }) => {
    if (msg.role === 'user') {
        return (
            <div className="flex justify-end">
                <div className="max-w-2xl px-4 py-2.5 bg-violet-600 text-white rounded-2xl rounded-tr-sm text-sm whitespace-pre-wrap break-words">
                    {msg.content}
                </div>
            </div>
        );
    }
    if (msg.role === 'tool') {
        return (
            <div className="flex items-start gap-2 max-w-3xl">
                <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
                    <Wrench className="w-4 h-4 text-amber-700" />
                </div>
                <div className="flex-1 bg-amber-50 border border-amber-200 rounded-2xl rounded-tl-sm px-3 py-2 text-xs">
                    <div className="font-bold text-amber-900 mb-1 flex items-center gap-1.5">
                        <Wrench className="w-3 h-3" />
                        Ejecuté tool: <code className="bg-amber-100 px-1 rounded font-mono">{msg.toolName}</code>
                    </div>
                    {msg.toolArgs && Object.keys(msg.toolArgs).length > 0 && (
                        <details className="mt-1">
                            <summary className="cursor-pointer text-amber-800">Argumentos</summary>
                            <pre className="mt-1 text-[10px] text-amber-900 bg-white/60 rounded p-1.5 overflow-x-auto">{JSON.stringify(msg.toolArgs, null, 2)}</pre>
                        </details>
                    )}
                    {msg.toolResult && (
                        <details className="mt-1">
                            <summary className="cursor-pointer text-amber-800">Resultado</summary>
                            <pre className="mt-1 text-[10px] text-amber-900 bg-white/60 rounded p-1.5 overflow-x-auto max-h-40">{JSON.stringify(msg.toolResult, null, 2)}</pre>
                        </details>
                    )}
                </div>
            </div>
        );
    }
    // assistant
    return (
        <div className="flex items-start gap-2 max-w-3xl">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center flex-shrink-0">
                <Brain className="w-4 h-4 text-white" />
            </div>
            <div className="flex-1 bg-white border border-gray-200 rounded-2xl rounded-tl-sm px-4 py-2.5 text-sm text-gray-800 whitespace-pre-wrap break-words leading-relaxed">
                {msg.content}
            </div>
        </div>
    );
};

export default BrainChatTab;

// ─── Activity widget para el hero ──────────────────────────────────────────
// Componente standalone que muestra las últimas N actividades del cerebro.
// Se usa en SiteBrainPanel y en el OverviewTab.

interface ActivityWidgetProps {
    headers: Record<string, string>;
    limit?: number;
    compact?: boolean;
}

const KIND_ICON: Record<string, { label: string; emoji: string; color: string }> = {
    memory_ingested:      { label: 'Memoria indexada',  emoji: '💭', color: 'bg-blue-50 text-blue-700' },
    document_processed:   { label: 'Documento procesado', emoji: '📄', color: 'bg-indigo-50 text-indigo-700' },
    chat_message:         { label: 'Conversación',      emoji: '💬', color: 'bg-violet-50 text-violet-700' },
    tool_executed:        { label: 'Acción ejecutada',  emoji: '🛠️', color: 'bg-amber-50 text-amber-700' },
    sync_onboarding:      { label: 'Sync con setup',    emoji: '🔄', color: 'bg-emerald-50 text-emerald-700' },
    embedding_generated:  { label: 'Embedding generado', emoji: '✨', color: 'bg-pink-50 text-pink-700' },
    relation_created:     { label: 'Relación creada',   emoji: '🔗', color: 'bg-cyan-50 text-cyan-700' },
};

export const BrainActivityWidget: React.FC<ActivityWidgetProps> = ({ headers, limit = 10, compact = false }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [activities, setActivities] = useState<any[]>([]);
    const [stats, setStats] = useState<Record<string, number>>({});
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const r = await fetch(`${API}/brains/me/activity?limit=${limit}`, { headers });
            if (r.ok) {
                const data = await r.json();
                setActivities(data.activities || []);
                setStats(data.stats || {});
            }
        } finally {
            setLoading(false);
        }
    }, [headers, limit]);

    useEffect(() => { load(); }, [load]);

    if (loading) {
        return (
            <div className="flex items-center justify-center py-8">
                <Loader2 className="w-4 h-4 text-violet-400 animate-spin" />
            </div>
        );
    }

    if (activities.length === 0) {
        return (
            <div className="text-center py-6 bg-gray-50 rounded-xl text-xs text-gray-500">
                <MessageCircle className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                Sin actividad reciente. El cerebro registra cada cosa que hace acá.
            </div>
        );
    }

    return (
        <div className="space-y-3">
            {!compact && Object.keys(stats).length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                    {Object.entries(stats).map(([kind, count]) => {
                        const meta = KIND_ICON[kind] || { label: kind, emoji: '⚙️', color: 'bg-gray-50 text-gray-700' };
                        return (
                            <span key={kind} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${meta.color}`}>
                                {meta.emoji} {meta.label} <strong className="ml-1">{count}</strong>
                            </span>
                        );
                    })}
                    <span className="text-[10px] text-gray-400 ml-1 self-center">últimos 7 días</span>
                </div>
            )}
            <div className={`space-y-1.5 ${compact ? 'max-h-48' : 'max-h-96'} overflow-y-auto`}>
                {activities.map(a => {
                    const meta = KIND_ICON[a.kind] || { label: a.kind, emoji: '⚙️', color: 'bg-gray-50 text-gray-700' };
                    return (
                        <div key={a.id} className="flex items-start gap-2 p-2 rounded-lg hover:bg-gray-50 transition-colors">
                            <span className="text-base flex-shrink-0">{meta.emoji}</span>
                            <div className="flex-1 min-w-0">
                                <div className="text-xs font-medium text-gray-800 truncate">{a.title}</div>
                                {a.detail && !compact && <div className="text-[10px] text-gray-500 line-clamp-1 mt-0.5">{a.detail}</div>}
                                <div className="text-[10px] text-gray-400 mt-0.5">{new Date(a.createdAt).toLocaleString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
