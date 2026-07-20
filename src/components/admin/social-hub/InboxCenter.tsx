import React, { useEffect, useState, useCallback } from 'react';
import {
    MessageSquare, MessageCircle, Send, EyeOff, CheckCircle2, Loader2,
    Facebook, Instagram, Inbox, AlertCircle, Flag
} from 'lucide-react';
import { toast } from 'sonner';

const API = import.meta.env.VITE_API_URL || '/api';
const authHeaders = (json = false) => ({
    Authorization: `Bearer ${localStorage.getItem('rotary_token')}`,
    ...(json ? { 'Content-Type': 'application/json' } : {})
});

interface Comment {
    id: string; platform: string; externalId: string; authorName: string | null;
    text: string | null; status: string; sentiment: string | null; aiSuggestion: string | null;
    hiddenOnMeta: boolean; commentedAt: string | null;
    account?: { platform: string; accountName: string | null; avatar: string | null };
}
interface Conversation {
    id: string; platform: string; participantName: string | null; participantId: string | null;
    lastSnippet: string | null; lastMessageAt: string | null; unreadCount: number; status: string;
    account?: { accountName: string | null; avatar: string | null };
}
interface Message {
    id: string; direction: string; text: string | null; sentAt: string | null; status: string;
}

const PlatformIcon: React.FC<{ platform?: string; className?: string }> = ({ platform, className }) =>
    platform === 'instagram'
        ? <Instagram className={className || 'w-4 h-4 text-pink-500'} />
        : <Facebook className={className || 'w-4 h-4 text-blue-600'} />;

// ── Comentarios ──────────────────────────────────────────────────────────────
const CommentsPanel: React.FC = () => {
    const [comments, setComments] = useState<Comment[]>([]);
    const [loading, setLoading] = useState(true);
    const [replyFor, setReplyFor] = useState<string | null>(null);
    const [replyText, setReplyText] = useState('');
    const [busy, setBusy] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const resp = await fetch(`${API}/social/inbox/comments`, { headers: authHeaders() });
            if (resp.ok) setComments(await resp.json());
        } catch { toast.error('Error al cargar comentarios'); }
        finally { setLoading(false); }
    }, []);
    useEffect(() => { load(); }, [load]);

    const doReply = async (c: Comment) => {
        if (!replyText.trim()) return;
        setBusy(c.id);
        try {
            const resp = await fetch(`${API}/social/inbox/comments/${c.id}/reply`, {
                method: 'POST', headers: authHeaders(true), body: JSON.stringify({ message: replyText })
            });
            const r = await resp.json();
            if (resp.ok) { toast.success('Respuesta publicada'); setReplyFor(null); setReplyText(''); await load(); }
            else toast.error(r.error || 'No se pudo responder');
        } finally { setBusy(null); }
    };
    const doHide = async (c: Comment) => {
        setBusy(c.id);
        try {
            const resp = await fetch(`${API}/social/inbox/comments/${c.id}/hide`, {
                method: 'POST', headers: authHeaders(true), body: JSON.stringify({ hide: !c.hiddenOnMeta })
            });
            const r = await resp.json();
            if (resp.ok) { toast.success(c.hiddenOnMeta ? 'Comentario visible' : 'Comentario ocultado'); await load(); }
            else toast.error(r.error || 'No se pudo ocultar');
        } finally { setBusy(null); }
    };
    const doResolve = async (c: Comment) => {
        setBusy(c.id);
        try {
            await fetch(`${API}/social/inbox/comments/${c.id}`, {
                method: 'PATCH', headers: authHeaders(true), body: JSON.stringify({ status: 'resolved' })
            });
            await load();
        } finally { setBusy(null); }
    };

    if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 text-gray-300 animate-spin" /></div>;
    if (!comments.length) return <EmptyState kind="comentarios" />;

    return (
        <div className="space-y-3">
            {comments.map(c => (
                <div key={c.id} className={`bg-white rounded-2xl p-4 border ${c.status === 'resolved' ? 'border-gray-100 opacity-60' : 'border-gray-100'} shadow-sm`}>
                    <div className="flex items-start gap-3">
                        <PlatformIcon platform={c.platform} className="w-5 h-5 mt-0.5 shrink-0" />
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-black text-gray-900 text-sm">{c.authorName || 'Usuario'}</span>
                                {c.sentiment === 'offensive' && (
                                    <span className="inline-flex items-center gap-1 text-[9px] font-black px-2 py-0.5 rounded bg-red-50 text-red-600"><Flag className="w-3 h-3" /> OFENSIVO</span>
                                )}
                                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{c.status}</span>
                            </div>
                            <p className="text-sm text-gray-700 mt-1">{c.text}</p>
                            {c.aiSuggestion && (
                                <button onClick={() => { setReplyFor(c.id); setReplyText(c.aiSuggestion || ''); }}
                                    className="mt-2 text-[11px] font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded-lg hover:bg-indigo-100">
                                    💡 Usar sugerencia IA
                                </button>
                            )}

                            {replyFor === c.id ? (
                                <div className="mt-3 flex gap-2">
                                    <input value={replyText} onChange={e => setReplyText(e.target.value)}
                                        placeholder="Escribí tu respuesta…"
                                        className="flex-1 px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-indigo-400" />
                                    <button onClick={() => doReply(c)} disabled={busy === c.id}
                                        className="px-3 py-2 rounded-xl bg-indigo-600 text-white text-sm font-bold flex items-center gap-1 disabled:opacity-50">
                                        {busy === c.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                                    </button>
                                </div>
                            ) : (
                                <div className="mt-3 flex gap-2 flex-wrap">
                                    <button onClick={() => { setReplyFor(c.id); setReplyText(''); }}
                                        className="text-[11px] font-bold text-gray-600 bg-gray-50 px-3 py-1.5 rounded-lg hover:bg-gray-100 flex items-center gap-1">
                                        <MessageSquare className="w-3 h-3" /> Responder
                                    </button>
                                    <button onClick={() => doHide(c)} disabled={busy === c.id}
                                        className="text-[11px] font-bold text-gray-600 bg-gray-50 px-3 py-1.5 rounded-lg hover:bg-gray-100 flex items-center gap-1 disabled:opacity-50">
                                        <EyeOff className="w-3 h-3" /> {c.hiddenOnMeta ? 'Mostrar' : 'Ocultar'}
                                    </button>
                                    {c.status !== 'resolved' && (
                                        <button onClick={() => doResolve(c)} disabled={busy === c.id}
                                            className="text-[11px] font-bold text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg hover:bg-emerald-100 flex items-center gap-1 disabled:opacity-50">
                                            <CheckCircle2 className="w-3 h-3" /> Resolver
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
};

// ── Mensajes ─────────────────────────────────────────────────────────────────
const MessagesPanel: React.FC = () => {
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [loading, setLoading] = useState(true);
    const [active, setActive] = useState<Conversation | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [text, setText] = useState('');
    const [sending, setSending] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const resp = await fetch(`${API}/social/inbox/conversations`, { headers: authHeaders() });
            if (resp.ok) setConversations(await resp.json());
        } catch { toast.error('Error al cargar conversaciones'); }
        finally { setLoading(false); }
    }, []);
    useEffect(() => { load(); }, [load]);

    const openThread = async (c: Conversation) => {
        setActive(c);
        try {
            const resp = await fetch(`${API}/social/inbox/conversations/${c.id}/messages`, { headers: authHeaders() });
            if (resp.ok) { const d = await resp.json(); setMessages(d.messages || []); }
        } catch { toast.error('Error al abrir la conversación'); }
    };
    const send = async () => {
        if (!active || !text.trim()) return;
        setSending(true);
        try {
            const resp = await fetch(`${API}/social/inbox/conversations/${active.id}/reply`, {
                method: 'POST', headers: authHeaders(true), body: JSON.stringify({ message: text })
            });
            const r = await resp.json();
            if (resp.ok) { setText(''); await openThread(active); }
            else toast.error(r.error || 'No se pudo enviar');
        } finally { setSending(false); }
    };

    if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 text-gray-300 animate-spin" /></div>;
    if (!conversations.length) return <EmptyState kind="mensajes" />;

    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 min-h-[400px]">
            <div className="md:col-span-1 space-y-2 max-h-[520px] overflow-y-auto">
                {conversations.map(c => (
                    <button key={c.id} onClick={() => openThread(c)}
                        className={`w-full text-left bg-white rounded-2xl p-3 border transition-all ${active?.id === c.id ? 'border-indigo-300 ring-1 ring-indigo-200' : 'border-gray-100 hover:border-gray-200'}`}>
                        <div className="flex items-center gap-2">
                            <PlatformIcon platform={c.platform} />
                            <span className="font-bold text-sm text-gray-900 truncate flex-1">{c.participantName || c.participantId || 'Usuario'}</span>
                            {c.unreadCount > 0 && <span className="text-[9px] font-black bg-indigo-600 text-white rounded-full px-1.5 py-0.5">{c.unreadCount}</span>}
                        </div>
                        <p className="text-xs text-gray-500 truncate mt-1">{c.lastSnippet || '—'}</p>
                    </button>
                ))}
            </div>
            <div className="md:col-span-2 bg-white rounded-2xl border border-gray-100 flex flex-col">
                {!active ? (
                    <div className="flex-1 flex items-center justify-center text-gray-400 text-sm font-medium">
                        Seleccioná una conversación
                    </div>
                ) : (
                    <>
                        <div className="p-4 border-b border-gray-100 font-black text-gray-900 flex items-center gap-2">
                            <PlatformIcon platform={active.platform} /> {active.participantName || active.participantId}
                        </div>
                        <div className="flex-1 p-4 space-y-2 overflow-y-auto max-h-[380px]">
                            {messages.map(m => (
                                <div key={m.id} className={`flex ${m.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}>
                                    <div className={`max-w-[75%] px-3 py-2 rounded-2xl text-sm ${m.direction === 'outbound' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-800'} ${m.status === 'failed' ? 'ring-2 ring-red-300' : ''}`}>
                                        {m.text}
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="p-3 border-t border-gray-100 flex gap-2">
                            <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()}
                                placeholder="Escribí un mensaje…"
                                className="flex-1 px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-indigo-400" />
                            <button onClick={send} disabled={sending}
                                className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-bold flex items-center gap-1 disabled:opacity-50">
                                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

const EmptyState: React.FC<{ kind: string }> = ({ kind }) => (
    <div className="bg-gray-50 border border-gray-100 rounded-3xl p-10 text-center">
        <Inbox className="w-10 h-10 text-gray-300 mx-auto mb-3" />
        <p className="font-bold text-gray-700">Sin {kind} todavía</p>
        <p className="text-xs text-gray-500 mt-2 max-w-md mx-auto flex items-start gap-2 justify-center">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            Los {kind} llegan en tiempo real vía los Webhooks de Meta. Suscribí el webhook en Meta for Developers
            (campos <code className="mx-1 px-1 bg-gray-100 rounded">comments</code>, <code className="mx-1 px-1 bg-gray-100 rounded">messages</code>)
            y requiere permisos aprobados en App Review.
        </p>
    </div>
);

const InboxCenter: React.FC = () => {
    const [tab, setTab] = useState<'comments' | 'messages'>('comments');
    return (
        <div className="space-y-6">
            <div className="flex items-center gap-2">
                <button onClick={() => setTab('comments')}
                    className={`px-4 py-2 rounded-xl font-bold text-sm flex items-center gap-2 transition-all ${tab === 'comments' ? 'bg-indigo-600 text-white shadow' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                    <MessageSquare className="w-4 h-4" /> Comentarios
                </button>
                <button onClick={() => setTab('messages')}
                    className={`px-4 py-2 rounded-xl font-bold text-sm flex items-center gap-2 transition-all ${tab === 'messages' ? 'bg-indigo-600 text-white shadow' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                    <MessageCircle className="w-4 h-4" /> Mensajes
                </button>
            </div>
            {tab === 'comments' ? <CommentsPanel /> : <MessagesPanel />}
        </div>
    );
};

export default InboxCenter;
