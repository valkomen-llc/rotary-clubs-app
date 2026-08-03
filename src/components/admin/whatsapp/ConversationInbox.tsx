import { useState, useEffect, useMemo, useCallback } from 'react';
import {
    Inbox, RefreshCw, AlertTriangle, User, Send, StickyNote, LifeBuoy,
    Hand, Tag as TagIcon, GraduationCap, Bot, Settings2, Users, Plus, Trash2,
    MessageSquare, Clock, ChevronLeft,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../../hooks/useAuth';

const API = import.meta.env.VITE_API_URL || '/api';

type StateDef = { key: string; label: string; open: boolean; description: string; n?: number };
type Conversation = {
    id: string; contactId: string; contactName: string | null; phone: string | null;
    orgRole: string | null; siteId: string | null; siteName: string | null;
    state: string; intent: string | null; intentMethod: string | null;
    team: string | null; assignedTo: string | null; assigneeName: string | null;
    priority: string; tags: string[]; lastInboundAt: string | null;
    lastMessage: string | null; noteCount: number; lifecycleState: string | null;
    botHandled: boolean; technicalRequestId: string | null;
};
type Catalog = {
    states: StateDef[]; priorities: string[];
    intents: { key: string; label: string; team: string }[];
    teams: { key: string; label: string }[];
    agents: any[];
    chatbot: any; menuIntents: string[];
    canOperate: boolean; canAttend: boolean;
};

const PRIORITY_STYLE: Record<string, string> = {
    urgente: 'bg-red-100 text-red-800 border-red-200',
    alta: 'bg-orange-100 text-orange-800 border-orange-200',
    normal: 'bg-gray-100 text-gray-600 border-gray-200',
    baja: 'bg-slate-50 text-slate-500 border-slate-200',
};

const STATE_STYLE: Record<string, string> = {
    nuevo: 'bg-blue-100 text-blue-800',
    en_atencion: 'bg-green-100 text-green-800',
    pendiente_respuesta: 'bg-amber-100 text-amber-800',
    seguimiento: 'bg-purple-100 text-purple-800',
    resuelto: 'bg-gray-100 text-gray-600',
    cerrado: 'bg-gray-100 text-gray-500',
};

export default function ConversationInbox() {
    const { token } = useAuth();

    // Todos los hooks antes de cualquier return — regla del sitio.
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [catalog, setCatalog] = useState<Catalog | null>(null);
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [counters, setCounters] = useState<{ states: StateDef[]; unassigned: number } | null>(null);
    const [selected, setSelected] = useState<any | null>(null);
    const [filterState, setFilterState] = useState('');
    const [filterMine, setFilterMine] = useState(false);
    const [reply, setReply] = useState('');
    const [note, setNote] = useState('');
    const [sending, setSending] = useState(false);
    const [showConfig, setShowConfig] = useState(false);
    const [rules, setRules] = useState<any[]>([]);
    const [assignable, setAssignable] = useState<any[]>([]);

    const headers = useMemo(() => ({
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
    }), [token]);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const qs = new URLSearchParams();
            if (filterState) qs.set('state', filterState);
            if (filterMine) qs.set('assignedTo', 'me');
            const [rc, ri] = await Promise.all([
                fetch(`${API}/crm/inbox/catalog`, { headers }),
                fetch(`${API}/crm/inbox?${qs}`, { headers }),
            ]);
            if (!ri.ok) throw new Error((await ri.json().catch(() => ({}))).error || 'No se pudo abrir la bandeja');
            setCatalog(await rc.json());
            const data = await ri.json();
            setConversations(data.conversations || []);
            setCounters(data.counters || null);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }, [headers, filterState, filterMine]);

    useEffect(() => { load(); }, [load]);

    const loadConfig = useCallback(async () => {
        try {
            const [rr, ra] = await Promise.all([
                fetch(`${API}/crm/routing-rules`, { headers }),
                fetch(`${API}/crm/agents/assignable`, { headers }),
            ]);
            if (rr.ok) setRules(await rr.json());
            if (ra.ok) setAssignable(await ra.json());
        } catch { /* sin permisos de operador: la sección no se muestra */ }
    }, [headers]);

    useEffect(() => { if (showConfig) loadConfig(); }, [showConfig, loadConfig]);

    const openConversation = async (id: string) => {
        try {
            const res = await fetch(`${API}/crm/conversations/${id}`, { headers });
            if (!res.ok) throw new Error((await res.json()).error || 'No se pudo abrir');
            setSelected(await res.json());
            setReply(''); setNote('');
        } catch (e: any) { toast.error(e.message); }
    };

    const patch = async (id: string, body: any) => {
        try {
            const res = await fetch(`${API}/crm/conversations/${id}`, { method: 'PATCH', headers, body: JSON.stringify(body) });
            if (!res.ok) throw new Error((await res.json()).error || 'No se pudo actualizar');
            await openConversation(id);
            load();
        } catch (e: any) { toast.error(e.message); }
    };

    const claim = async (id: string) => {
        try {
            const res = await fetch(`${API}/crm/conversations/${id}/claim`, { method: 'POST', headers });
            const body = await res.json();
            if (!res.ok) throw new Error(body.error || 'No se pudo tomar');
            toast.success('Conversación tomada');
            await openConversation(id);
            load();
        } catch (e: any) { toast.error(e.message); }
    };

    const sendReply = async () => {
        if (!selected || !reply.trim()) return;
        setSending(true);
        try {
            const res = await fetch(`${API}/crm/conversations/${selected.id}/reply`, {
                method: 'POST', headers, body: JSON.stringify({ text: reply }),
            });
            const body = await res.json();
            if (!res.ok) throw new Error(body.error || 'No se pudo enviar');
            setReply('');
            toast.success('Mensaje enviado');
            await openConversation(selected.id);
            load();
        } catch (e: any) {
            // El error de Meta se muestra tal cual: fuera de la ventana de 24 h
            // hay que usar una plantilla, y disimularlo dejaría a quien atiende
            // sin entender por qué no salió.
            toast.error(e.message);
        } finally { setSending(false); }
    };

    const saveNote = async () => {
        if (!selected || !note.trim()) return;
        try {
            const res = await fetch(`${API}/crm/conversations/${selected.id}/notes`, {
                method: 'POST', headers, body: JSON.stringify({ body: note }),
            });
            if (!res.ok) throw new Error((await res.json()).error || 'No se pudo guardar');
            setNote('');
            await openConversation(selected.id);
        } catch (e: any) { toast.error(e.message); }
    };

    const escalate = async () => {
        if (!selected) return;
        try {
            const res = await fetch(`${API}/crm/conversations/${selected.id}/escalate`, {
                method: 'POST', headers,
                body: JSON.stringify({ title: `Consulta de ${selected.contactName || 'un contacto'}` }),
            });
            const body = await res.json();
            if (!res.ok) throw new Error(body.error || 'No se pudo escalar');
            toast.success(body.alreadyEscalated ? 'Ya estaba escalada' : 'Solicitud de soporte creada');
            await openConversation(selected.id);
        } catch (e: any) { toast.error(e.message); }
    };

    const saveChatbot = async (patchBody: any) => {
        try {
            const res = await fetch(`${API}/crm/chatbot`, { method: 'PUT', headers, body: JSON.stringify(patchBody) });
            const body = await res.json();
            if (!res.ok) throw new Error(body.error || 'No se pudo guardar');
            setCatalog(c => (c ? { ...c, chatbot: body } : c));
            toast.success('Chatbot actualizado');
        } catch (e: any) { toast.error(e.message); }
    };

    const deleteRule = async (id: string) => {
        try {
            const res = await fetch(`${API}/crm/routing-rules/${id}`, { method: 'DELETE', headers });
            if (!res.ok) throw new Error((await res.json()).error || 'No se pudo borrar');
            loadConfig();
        } catch (e: any) { toast.error(e.message); }
    };

    const addRule = async () => {
        const name = window.prompt('Nombre de la regla');
        if (!name) return;
        try {
            const res = await fetch(`${API}/crm/routing-rules`, {
                method: 'POST', headers,
                body: JSON.stringify({ name, team: 'soporte', priority: rules.length, assignMode: 'team' }),
            });
            if (!res.ok) throw new Error((await res.json()).error || 'No se pudo crear');
            loadConfig();
        } catch (e: any) { toast.error(e.message); }
    };

    const updateRule = async (rule: any, patchBody: any) => {
        try {
            const res = await fetch(`${API}/crm/routing-rules/${rule.id}`, {
                method: 'PUT', headers, body: JSON.stringify({ ...rule, ...patchBody }),
            });
            if (!res.ok) throw new Error((await res.json()).error || 'No se pudo guardar');
            loadConfig();
        } catch (e: any) { toast.error(e.message); }
    };

    const intentLabel = (key: string | null) =>
        catalog?.intents.find(i => i.key === key)?.label || key || '—';

    if (loading) return <div className="p-12 text-center text-gray-500">Cargando la bandeja…</div>;

    if (error) {
        return (
            <div className="p-8 bg-amber-50 border border-amber-200 rounded-xl text-amber-900">
                <p className="font-semibold flex items-center gap-2"><AlertTriangle className="w-5 h-5" /> {error}</p>
                <button onClick={load} className="mt-3 text-sm px-3 py-1.5 bg-white border rounded-lg">Reintentar</button>
            </div>
        );
    }

    if (!catalog) return null;

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                        <Inbox className="w-5 h-5 text-green-600" /> Bandeja de conversaciones
                    </h2>
                    <p className="text-sm text-gray-500">
                        Cada mensaje entrante abre un hilo, se clasifica por intención y se enruta a un equipo.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    {catalog.canOperate && (
                        <button onClick={() => setShowConfig(s => !s)} className="px-3 py-2 border rounded-lg text-sm flex items-center gap-2 hover:bg-gray-50">
                            <Settings2 className="w-4 h-4" /> Chatbot y enrutamiento
                        </button>
                    )}
                    <button onClick={load} className="p-2 border rounded-lg hover:bg-gray-50" title="Recargar">
                        <RefreshCw className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {showConfig && catalog.canOperate && (
                <div className="bg-white border rounded-xl p-4 space-y-5">
                    <div>
                        <h3 className="font-semibold text-gray-900 flex items-center gap-2"><Bot className="w-4 h-4" /> Chatbot de intención</h3>
                        <p className="text-sm text-gray-500 mt-1">
                            Con el chatbot <strong>apagado</strong>, la bandeja igual clasifica y enruta cada mensaje, pero el
                            contacto sigue recibiendo exactamente lo que recibía antes (las reglas de palabra clave y el
                            agente de IA de la pestaña Automatización). Encendido, el bot contesta el menú y las intenciones
                            que reconoce.
                        </p>
                        <label className="flex items-center gap-2 mt-3 text-sm">
                            <input
                                type="checkbox"
                                checked={!!catalog.chatbot?.enabled}
                                onChange={e => saveChatbot({ enabled: e.target.checked })}
                            />
                            <span className="font-medium">Responder automáticamente</span>
                        </label>
                        <div className="grid sm:grid-cols-2 gap-3 mt-3">
                            <label className="text-sm">
                                <span className="text-gray-500">Saludo del menú</span>
                                <input
                                    defaultValue={catalog.chatbot?.greeting || ''}
                                    onBlur={e => saveChatbot({ greeting: e.target.value })}
                                    className="mt-1 w-full border rounded-lg px-2 py-1.5 text-sm"
                                />
                            </label>
                            <label className="flex items-start gap-2 text-sm text-gray-600 pt-6">
                                <input
                                    type="checkbox"
                                    checked={catalog.chatbot?.useModelForIntent !== false}
                                    onChange={e => saveChatbot({ useModelForIntent: e.target.checked })}
                                    className="mt-0.5"
                                />
                                <span>
                                    Usar el modelo cuando no alcancen las palabras clave
                                    <span className="block text-xs text-gray-400">
                                        Los botones y las palabras clave se prueban siempre primero: son exactos y no cuestan nada.
                                    </span>
                                </span>
                            </label>
                        </div>
                        <div className="mt-3 bg-gray-900 rounded-lg p-3">
                            <p className="text-[11px] text-gray-400 mb-1">Así se ve el menú</p>
                            <pre className="text-xs text-gray-200 whitespace-pre-wrap font-sans">{catalog.chatbot?.menuPreview}</pre>
                        </div>
                    </div>

                    <div className="border-t pt-4">
                        <div className="flex items-center justify-between">
                            <h3 className="font-semibold text-gray-900 flex items-center gap-2"><Users className="w-4 h-4" /> Reglas de enrutamiento</h3>
                            <button onClick={addRule} className="text-sm px-3 py-1.5 border rounded-lg hover:bg-gray-50 flex items-center gap-1">
                                <Plus className="w-3.5 h-3.5" /> Regla
                            </button>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                            Se evalúan en orden y gana la primera que coincide. Una regla sin condiciones coincide siempre
                            y sirve de respaldo.
                        </p>
                        <div className="mt-3 space-y-2">
                            {rules.map(rule => (
                                <div key={rule.id} className="border rounded-lg p-3 space-y-2 bg-gray-50">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <input
                                            defaultValue={rule.name}
                                            onBlur={e => updateRule(rule, { name: e.target.value })}
                                            className="border rounded px-2 py-1 text-sm font-medium flex-1 min-w-[160px]"
                                        />
                                        <select
                                            value={rule.team || ''}
                                            onChange={e => updateRule(rule, { team: e.target.value })}
                                            className="border rounded px-2 py-1 text-sm"
                                        >
                                            <option value="">Sin equipo</option>
                                            {catalog.teams.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                                        </select>
                                        <label className="flex items-center gap-1 text-xs text-gray-600">
                                            <input
                                                type="checkbox" checked={rule.active}
                                                onChange={e => updateRule(rule, { active: e.target.checked })}
                                            /> activa
                                        </label>
                                        <button onClick={() => deleteRule(rule.id)} className="p-1 text-red-500 hover:bg-red-50 rounded">
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        <select
                                            multiple
                                            value={rule.intents || []}
                                            onChange={e => updateRule(rule, { intents: Array.from(e.target.selectedOptions).map(o => o.value) })}
                                            className="border rounded px-2 py-1 text-xs min-w-[180px]"
                                        >
                                            {catalog.intents.map(i => <option key={i.key} value={i.key}>{i.label}</option>)}
                                        </select>
                                        <input
                                            defaultValue={(rule.keywords || []).join(', ')}
                                            onBlur={e => updateRule(rule, { keywords: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
                                            placeholder="palabras clave, separadas por coma"
                                            className="border rounded px-2 py-1 text-xs flex-1 min-w-[160px]"
                                        />
                                    </div>
                                </div>
                            ))}
                            {!rules.length && (
                                <p className="text-sm text-gray-400 py-3 text-center">
                                    Sin reglas: las conversaciones quedan sin equipo hasta que alguien las tome.
                                </p>
                            )}
                        </div>
                    </div>

                    <div className="border-t pt-4">
                        <h3 className="font-semibold text-gray-900 text-sm">Agentes disponibles ({catalog.agents.length})</h3>
                        <p className="text-xs text-gray-500 mt-1">
                            El reparto es por carga: entra la conversación al agente del equipo con menos hilos abiertos.
                        </p>
                        <div className="flex flex-wrap gap-2 mt-2">
                            {assignable.map(u => {
                                const isAgentUser = catalog.agents.some((a: any) => a.userId === u.id);
                                return (
                                    <button
                                        key={u.id}
                                        onClick={async () => {
                                            if (isAgentUser) {
                                                await fetch(`${API}/crm/agents/${u.id}`, { method: 'DELETE', headers });
                                            } else {
                                                await fetch(`${API}/crm/agents`, {
                                                    method: 'PUT', headers,
                                                    body: JSON.stringify({ userId: u.id, displayName: u.name, teams: catalog.teams.map(t => t.key) }),
                                                });
                                            }
                                            load(); loadConfig();
                                        }}
                                        className={`px-2.5 py-1 rounded-lg text-xs border ${
                                            isAgentUser ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-600'
                                        }`}
                                    >{u.name || u.email}</button>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

            <div className="flex flex-wrap gap-2">
                <button
                    onClick={() => setFilterState('')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${!filterState ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600'}`}
                >Todas</button>
                {(counters?.states || []).filter(s => s.open).map(s => (
                    <button
                        key={s.key}
                        onClick={() => setFilterState(s.key === filterState ? '' : s.key)}
                        title={s.description}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${
                            filterState === s.key ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600'
                        }`}
                    >{s.label} · {s.n ?? 0}</button>
                ))}
                {catalog.canAttend && (
                    <button
                        onClick={() => setFilterMine(m => !m)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${filterMine ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-600'}`}
                    >Sólo las mías</button>
                )}
                {counters && counters.unassigned > 0 && (
                    <span className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                        {counters.unassigned} sin asignar
                    </span>
                )}
            </div>

            <div className="grid lg:grid-cols-5 gap-4">
                <div className="lg:col-span-2 space-y-2 max-h-[70vh] overflow-y-auto">
                    {conversations.map(c => (
                        <button
                            key={c.id}
                            onClick={() => openConversation(c.id)}
                            className={`w-full text-left border rounded-xl p-3 hover:bg-gray-50 ${
                                selected?.id === c.id ? 'border-green-500 bg-green-50/40' : 'bg-white'
                            }`}
                        >
                            <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                    <p className="font-semibold text-sm text-gray-900 truncate">{c.contactName || c.phone}</p>
                                    <p className="text-[11px] text-gray-500 truncate">{c.siteName || 'Sin sitio vinculado'}</p>
                                </div>
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${STATE_STYLE[c.state] || 'bg-gray-100'}`}>
                                    {catalog.states.find(s => s.key === c.state)?.label || c.state}
                                </span>
                            </div>
                            {c.lastMessage && (
                                <p className="text-xs text-gray-500 mt-1.5 line-clamp-2">{c.lastMessage}</p>
                            )}
                            <div className="flex flex-wrap items-center gap-1.5 mt-2">
                                {c.intent && (
                                    <span className="text-[10px] bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded">
                                        {intentLabel(c.intent)}
                                    </span>
                                )}
                                {c.priority !== 'normal' && (
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${PRIORITY_STYLE[c.priority]}`}>{c.priority}</span>
                                )}
                                {c.assigneeName ? (
                                    <span className="text-[10px] text-gray-500 flex items-center gap-0.5"><User className="w-3 h-3" />{c.assigneeName}</span>
                                ) : (
                                    <span className="text-[10px] text-amber-700">sin asignar</span>
                                )}
                                {c.noteCount > 0 && (
                                    <span className="text-[10px] text-gray-400 flex items-center gap-0.5"><StickyNote className="w-3 h-3" />{c.noteCount}</span>
                                )}
                            </div>
                        </button>
                    ))}
                    {!conversations.length && (
                        <div className="text-center py-12 text-gray-400">
                            <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-30" />
                            <p className="text-sm">No hay conversaciones con este filtro.</p>
                        </div>
                    )}
                </div>

                <div className="lg:col-span-3">
                    {!selected ? (
                        <div className="border rounded-xl bg-white h-full flex items-center justify-center text-gray-400 py-20">
                            <div className="text-center">
                                <Inbox className="w-10 h-10 mx-auto mb-2 opacity-30" />
                                <p className="text-sm">Elegí una conversación para verla.</p>
                            </div>
                        </div>
                    ) : (
                        <div className="border rounded-xl bg-white">
                            <div className="p-4 border-b space-y-3">
                                <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                        <button onClick={() => setSelected(null)} className="lg:hidden text-xs text-gray-500 flex items-center gap-1 mb-1">
                                            <ChevronLeft className="w-3 h-3" /> Volver
                                        </button>
                                        <h3 className="font-bold text-gray-900">{selected.contactName || selected.phone}</h3>
                                        <p className="text-xs text-gray-500">
                                            {selected.siteName || 'Sin sitio vinculado'}
                                            {selected.lifecycleState ? ` · ${selected.lifecycleState}` : ''}
                                        </p>
                                    </div>
                                    {catalog.canAttend && !selected.assignedTo && (
                                        <button onClick={() => claim(selected.id)} className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-semibold flex items-center gap-1">
                                            <Hand className="w-3.5 h-3.5" /> Tomar
                                        </button>
                                    )}
                                </div>

                                {catalog.canAttend && (
                                    <div className="flex flex-wrap gap-2">
                                        <select
                                            value={selected.state}
                                            onChange={e => patch(selected.id, { state: e.target.value })}
                                            className="border rounded-lg px-2 py-1 text-xs"
                                        >
                                            {catalog.states.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                                        </select>
                                        <select
                                            value={selected.priority}
                                            onChange={e => patch(selected.id, { priority: e.target.value })}
                                            className="border rounded-lg px-2 py-1 text-xs"
                                        >
                                            {catalog.priorities.map(p => <option key={p} value={p}>{p}</option>)}
                                        </select>
                                        <select
                                            value={selected.intent || ''}
                                            onChange={e => patch(selected.id, { intent: e.target.value })}
                                            className="border rounded-lg px-2 py-1 text-xs"
                                        >
                                            <option value="">Sin intención</option>
                                            {catalog.intents.map(i => <option key={i.key} value={i.key}>{i.label}</option>)}
                                        </select>
                                        {!selected.technicalRequestId && (
                                            <button onClick={escalate} className="px-2 py-1 border rounded-lg text-xs flex items-center gap-1 hover:bg-gray-50">
                                                <LifeBuoy className="w-3.5 h-3.5" /> Escalar a soporte
                                            </button>
                                        )}
                                        {selected.technicalRequestId && (
                                            <span className="px-2 py-1 rounded-lg text-xs bg-purple-50 text-purple-700 border border-purple-200">
                                                Escalada a soporte
                                            </span>
                                        )}
                                    </div>
                                )}

                                {selected.training && (
                                    <div className="text-xs bg-indigo-50 border border-indigo-200 text-indigo-900 rounded-lg px-3 py-2">
                                        <span className="flex items-center gap-1.5 font-semibold">
                                            <GraduationCap className="w-3.5 h-3.5" /> Capacitaciones
                                        </span>
                                        <p className="mt-0.5">
                                            {selected.training.completed} completada(s) · {selected.training.upcoming} agendada(s)
                                            {selected.training.recommended ? ` · sigue: ${selected.training.recommended.name}` : ''}
                                        </p>
                                    </div>
                                )}
                            </div>

                            <div className="p-4 max-h-72 overflow-y-auto space-y-2 bg-gray-50">
                                {[...(selected.messages || [])].reverse().map((m: any) => (
                                    <div key={m.id} className={`flex ${m.direction === 'incoming' ? 'justify-start' : 'justify-end'}`}>
                                        <div className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${
                                            m.direction === 'incoming' ? 'bg-white border' : 'bg-green-600 text-white'
                                        }`}>
                                            <p className="whitespace-pre-wrap break-words">{m.bodyText}</p>
                                            <p className={`text-[10px] mt-1 ${m.direction === 'incoming' ? 'text-gray-400' : 'text-green-100'}`}>
                                                {new Date(m.createdAt).toLocaleString('es-CO')}
                                                {m.templateName ? ` · ${m.templateName}` : ''}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                                {!selected.messages?.length && <p className="text-sm text-gray-400 text-center py-6">Sin mensajes.</p>}
                            </div>

                            {catalog.canAttend && (
                                <div className="p-4 border-t space-y-3">
                                    <div className="flex gap-2">
                                        <textarea
                                            value={reply}
                                            onChange={e => setReply(e.target.value)}
                                            rows={2}
                                            placeholder="Escribí tu respuesta…"
                                            className="flex-1 border rounded-lg px-3 py-2 text-sm"
                                        />
                                        <button
                                            onClick={sendReply} disabled={sending || !reply.trim()}
                                            className="px-4 bg-green-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50 flex items-center gap-1"
                                        ><Send className="w-4 h-4" /> {sending ? '…' : 'Enviar'}</button>
                                    </div>

                                    <div className="border-t pt-3">
                                        <p className="text-xs font-semibold text-gray-700 flex items-center gap-1 mb-1">
                                            <StickyNote className="w-3.5 h-3.5" /> Notas internas
                                            <span className="font-normal text-gray-400">— no las ve el contacto</span>
                                        </p>
                                        <div className="space-y-1 max-h-32 overflow-y-auto mb-2">
                                            {(selected.notes || []).map((n: any) => (
                                                <div key={n.id} className="text-xs bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
                                                    <p className="text-amber-900">{n.body}</p>
                                                    <p className="text-[10px] text-amber-600 mt-0.5">
                                                        {n.authorName || 'alguien'} · {new Date(n.createdAt).toLocaleString('es-CO')}
                                                    </p>
                                                </div>
                                            ))}
                                        </div>
                                        <div className="flex gap-2">
                                            <input
                                                value={note}
                                                onChange={e => setNote(e.target.value)}
                                                placeholder="Agregar una nota…"
                                                className="flex-1 border rounded-lg px-3 py-1.5 text-sm"
                                            />
                                            <button onClick={saveNote} className="px-3 py-1.5 border rounded-lg text-sm hover:bg-gray-50">
                                                Guardar
                                            </button>
                                        </div>
                                    </div>

                                    {(selected.campaigns || []).length > 0 && (
                                        <div className="border-t pt-3">
                                            <p className="text-xs font-semibold text-gray-700 flex items-center gap-1 mb-1">
                                                <TagIcon className="w-3.5 h-3.5" /> Qué le mandamos antes
                                            </p>
                                            <div className="space-y-1 max-h-28 overflow-y-auto">
                                                {selected.campaigns.map((c: any, i: number) => (
                                                    <div key={i} className="text-[11px] flex items-center justify-between bg-gray-50 rounded px-2 py-1">
                                                        <span className="truncate">{c.journeyName || c.campaignName || c.templateName}</span>
                                                        <span className="text-gray-400 flex items-center gap-1 shrink-0">
                                                            <Clock className="w-3 h-3" />{new Date(c.createdAt).toLocaleDateString('es-CO')}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
