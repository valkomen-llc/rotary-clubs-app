import React, { useState, useEffect } from 'react';
import { Bot, Plus, Trash2, Edit2, Zap, Send, X, MessageSquare, Sparkles, Power, BookOpen, Clock, Wand2, Activity, CheckCircle2, AlertTriangle, PlayCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../../hooks/useAuth';

const API = import.meta.env.VITE_API_URL || '/api';

// Modelos que devuelven texto plano (los modelos OpenAI van en modo JSON en el router,
// por eso no se ofrecen aquí para conversación natural).
const MODELS = [
    { slug: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (rápido, recomendado)' },
    { slug: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro (máxima capacidad)' },
    { slug: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
    { slug: 'claude-3-5-sonnet', label: 'Claude 3.5 Sonnet' },
    { slug: 'claude-3-haiku', label: 'Claude 3 Haiku (económico)' },
    { slug: 'mistral-large', label: 'Mistral Large' },
];

const TRIGGER_LABELS: Record<string, string> = {
    welcome: 'Bienvenida',
    keyword: 'Palabra clave',
    exact: 'Coincidencia exacta',
    fallback: 'Respaldo (si nada responde)',
};

export default function WhatsAppAutomation() {
    const { token } = useAuth();
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

    const [loading, setLoading] = useState(true);
    const [rules, setRules] = useState<any[]>([]);
    const [agent, setAgent] = useState<any>(null);
    const [savingAgent, setSavingAgent] = useState(false);
    const [generating, setGenerating] = useState(false);
    const [diag, setDiag] = useState<any>(null);
    const [loadingDiag, setLoadingDiag] = useState(false);

    const [showRuleModal, setShowRuleModal] = useState(false);
    const [editingRule, setEditingRule] = useState<any>(null);

    // Probador del agente
    const [testMsg, setTestMsg] = useState('');
    const [testChat, setTestChat] = useState<{ role: string; content: string }[]>([]);
    const [testing, setTesting] = useState(false);

    useEffect(() => { fetchAll(); }, []);

    const fetchAll = async () => {
        setLoading(true);
        try {
            const [rRules, rAgent] = await Promise.all([
                fetch(`${API}/crm/auto-replies`, { headers }),
                fetch(`${API}/crm/agent-config`, { headers }),
            ]);
            if (rRules.ok) setRules(await rRules.json());
            if (rAgent.ok) setAgent(await rAgent.json());
        } catch (e) {
            toast.error('Error cargando la automatización');
        } finally {
            setLoading(false);
        }
    };

    // ── Agente ───────────────────────────────────────────────────────────
    const saveAgent = async () => {
        if (agent.enabled && !(agent.systemPrompt || '').trim()) {
            return toast.error('Escribe la instrucción del agente antes de activarlo');
        }
        setSavingAgent(true);
        try {
            const res = await fetch(`${API}/crm/agent-config`, {
                method: 'PUT', headers, body: JSON.stringify(agent),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Error');
            setAgent(data);
            toast.success('Agente guardado');
        } catch (e: any) {
            toast.error(e.message);
        } finally {
            setSavingAgent(false);
        }
    };

    const runDiag = async () => {
        setLoadingDiag(true);
        try {
            const res = await fetch(`${API}/crm/agent-config/diagnostics`, { headers });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Error');
            setDiag(data);
        } catch (e: any) {
            toast.error(e.message);
        } finally {
            setLoadingDiag(false);
        }
    };

    const resumeBot = async () => {
        try {
            const res = await fetch(`${API}/crm/agent-config/resume`, { method: 'POST', headers, body: '{}' });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Error');
            toast.success(`Bot reanudado (${data.resumed} contacto/s)`);
            runDiag();
        } catch (e: any) {
            toast.error(e.message);
        }
    };

    const generateInstruction = async () => {
        if ((agent.systemPrompt || '').trim() && !confirm('Esto reemplazará la instrucción actual con una generada por IA. ¿Continuar?')) return;
        setGenerating(true);
        try {
            const res = await fetch(`${API}/crm/agent-config/generate-instruction`, { method: 'POST', headers });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Error');
            setAgent((a: any) => ({ ...a, systemPrompt: data.instruction }));
            toast.success('Instrucción generada con el conocimiento del club. Revísala y guarda.');
        } catch (e: any) {
            toast.error(e.message);
        } finally {
            setGenerating(false);
        }
    };

    const runTest = async () => {
        if (!testMsg.trim()) return;
        const userMsg = testMsg.trim();
        const newHistory = [...testChat, { role: 'user', content: userMsg }];
        setTestChat(newHistory);
        setTestMsg('');
        setTesting(true);
        try {
            const res = await fetch(`${API}/crm/agent-config/test`, {
                method: 'POST', headers,
                body: JSON.stringify({ message: userMsg, history: testChat, config: agent }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Error');
            setTestChat([...newHistory, { role: 'assistant', content: data.reply || '(respuesta vacía)' }]);
        } catch (e: any) {
            setTestChat([...newHistory, { role: 'assistant', content: `⚠️ ${e.message}` }]);
        } finally {
            setTesting(false);
        }
    };

    // ── Reglas ───────────────────────────────────────────────────────────
    const toggleRule = async (rule: any) => {
        try {
            const res = await fetch(`${API}/crm/auto-replies/${rule.id}/toggle`, {
                method: 'PATCH', headers, body: JSON.stringify({ active: !rule.active }),
            });
            if (res.ok) {
                const updated = await res.json();
                setRules(rules.map(r => (r.id === rule.id ? updated : r)));
            }
        } catch (e) { toast.error('Error al cambiar el estado'); }
    };

    const deleteRule = async (rule: any) => {
        if (!confirm(`¿Eliminar la respuesta automática "${rule.name}"?`)) return;
        try {
            const res = await fetch(`${API}/crm/auto-replies/${rule.id}`, { method: 'DELETE', headers });
            if (res.ok) { setRules(rules.filter(r => r.id !== rule.id)); toast.success('Regla eliminada'); }
        } catch (e) { toast.error('Error al eliminar'); }
    };

    if (loading) return <div className="text-center py-12 text-gray-400">Cargando automatización...</div>;

    return (
        <div className="space-y-8">
            {/* ── AGENTE DE IA ─────────────────────────────────────────── */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-5 border-b border-gray-100 bg-gradient-to-r from-emerald-50 to-white flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center">
                            <Bot className="w-6 h-6" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-gray-900">Agente de IA conversacional</h2>
                            <p className="text-sm text-gray-500">Responde preguntas en lenguaje natural según tu instrucción y el conocimiento del club.</p>
                        </div>
                    </div>
                    <button
                        onClick={() => setAgent({ ...agent, enabled: !agent.enabled })}
                        className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${agent.enabled ? 'bg-emerald-500' : 'bg-gray-300'}`}
                        title={agent.enabled ? 'Activado' : 'Desactivado'}
                    >
                        <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${agent.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                </div>

                <div className="p-5 grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Configuración */}
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-bold text-gray-700 mb-1">Nombre del agente</label>
                                <input value={agent.name || ''} onChange={e => setAgent({ ...agent, name: e.target.value })}
                                    className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:ring-2 focus:ring-emerald-500 outline-none" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-700 mb-1">Modelo de IA</label>
                                <select value={agent.modelSlug} onChange={e => setAgent({ ...agent, modelSlug: e.target.value })}
                                    className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:ring-2 focus:ring-emerald-500 outline-none">
                                    {MODELS.map(m => <option key={m.slug} value={m.slug}>{m.label}</option>)}
                                </select>
                            </div>
                        </div>

                        <div>
                            <div className="flex items-center justify-between mb-1">
                                <label className="block text-xs font-bold text-gray-700">
                                    <Sparkles className="w-3.5 h-3.5 inline mr-1 text-emerald-500" />
                                    Instrucción del agente (cómo debe comportarse)
                                </label>
                                <button
                                    type="button"
                                    onClick={generateInstruction}
                                    disabled={generating}
                                    title="Redacta la instrucción usando el conocimiento del Centro de Inteligencia"
                                    className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2.5 py-1 rounded-lg transition-colors disabled:opacity-50"
                                >
                                    <Wand2 className="w-3.5 h-3.5" />
                                    {generating ? 'Generando…' : 'Generar con IA'}
                                </button>
                            </div>
                            <textarea
                                value={agent.systemPrompt || ''}
                                onChange={e => setAgent({ ...agent, systemPrompt: e.target.value })}
                                rows={8}
                                placeholder={`Ej: Eres el asistente del Club Rotario de Pasto. Atiendes a rotarios y a personas interesadas por WhatsApp. Eres cordial, claro y breve. Explicas los proyectos del club, cómo asociarse, horarios de reuniones y eventos. Si te preguntan algo que no sabes, ofreces poner en contacto con la secretaría.`}
                                className="w-full p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:ring-2 focus:ring-emerald-500 outline-none resize-none font-mono leading-relaxed"
                            />
                        </div>

                        <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked={!!agent.useKnowledge}
                                onChange={e => setAgent({ ...agent, useKnowledge: e.target.checked })}
                                className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500" />
                            <span className="text-sm text-gray-700 flex items-center gap-1">
                                <BookOpen className="w-4 h-4 text-gray-400" />
                                Usar la base de conocimiento del club (responde con datos reales — recomendado)
                            </span>
                        </label>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-bold text-gray-700 mb-1 flex items-center gap-1">
                                    <Clock className="w-3.5 h-3.5" /> Pausa tras respuesta humana (min)
                                </label>
                                <input type="number" min={0} value={agent.humanPauseMinutes ?? 120}
                                    onChange={e => setAgent({ ...agent, humanPauseMinutes: parseInt(e.target.value || '0', 10) })}
                                    className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:ring-2 focus:ring-emerald-500 outline-none" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-700 mb-1">Mensajes de contexto</label>
                                <input type="number" min={2} max={40} value={agent.historyLimit ?? 12}
                                    onChange={e => setAgent({ ...agent, historyLimit: parseInt(e.target.value || '12', 10) })}
                                    className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:ring-2 focus:ring-emerald-500 outline-none" />
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-gray-700 mb-1">Mensaje de respaldo (si la IA falla)</label>
                            <input value={agent.fallbackMessage || ''} onChange={e => setAgent({ ...agent, fallbackMessage: e.target.value })}
                                placeholder="Ej: En un momento te atiende una persona del club."
                                className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:ring-2 focus:ring-emerald-500 outline-none" />
                        </div>

                        <button onClick={saveAgent} disabled={savingAgent}
                            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 rounded-lg text-sm font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                            <Power className="w-4 h-4" /> {savingAgent ? 'Guardando...' : 'Guardar configuración del agente'}
                        </button>
                    </div>

                    {/* Probador */}
                    <div className="flex flex-col bg-gray-50 rounded-xl border border-gray-200 overflow-hidden">
                        <div className="px-4 py-3 border-b border-gray-200 bg-white flex items-center justify-between">
                            <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                                <MessageSquare className="w-4 h-4 text-emerald-500" /> Probar la conversación
                            </h3>
                            {testChat.length > 0 && (
                                <button onClick={() => setTestChat([])} className="text-xs text-gray-400 hover:text-gray-600">Limpiar</button>
                            )}
                        </div>
                        <div className="flex-1 p-4 space-y-3 overflow-y-auto min-h-[280px] max-h-[420px]">
                            {testChat.length === 0 ? (
                                <p className="text-xs text-gray-400 text-center mt-12">Escribe un mensaje para ver cómo respondería el agente.<br />(Aquí no se envía nada por WhatsApp)</p>
                            ) : testChat.map((m, i) => (
                                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                    <div className={`max-w-[80%] px-3 py-2 rounded-2xl text-sm ${m.role === 'user' ? 'bg-emerald-500 text-white rounded-br-sm' : 'bg-white border border-gray-200 text-gray-800 rounded-bl-sm'}`}>
                                        {m.content}
                                    </div>
                                </div>
                            ))}
                            {testing && <div className="flex justify-start"><div className="bg-white border border-gray-200 text-gray-400 px-3 py-2 rounded-2xl text-sm">escribiendo…</div></div>}
                        </div>
                        <div className="p-3 border-t border-gray-200 bg-white flex gap-2">
                            <input value={testMsg} onChange={e => setTestMsg(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter' && !testing) runTest(); }}
                                placeholder="Escribe como si fueras un rotario…"
                                className="flex-1 p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:ring-2 focus:ring-emerald-500 outline-none" />
                            <button onClick={runTest} disabled={testing || !testMsg.trim()}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 rounded-lg disabled:opacity-50">
                                <Send className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── DIAGNÓSTICO DE ENTREGA ──────────────────────────────── */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-5 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center">
                            <Activity className="w-6 h-6" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-gray-900">Diagnóstico de entrega</h2>
                            <p className="text-sm text-gray-500">¿El bot no responde por WhatsApp? Revisa aquí qué puede estar fallando.</p>
                        </div>
                    </div>
                    <button onClick={runDiag} disabled={loadingDiag}
                        className="bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 disabled:opacity-50">
                        <Activity className="w-4 h-4" /> {loadingDiag ? 'Revisando…' : 'Revisar ahora'}
                    </button>
                </div>

                {diag && (
                    <div className="px-5 pb-5 space-y-4">
                        {/* Problemas detectados */}
                        {diag.issues?.length > 0 ? (
                            <div className="space-y-2">
                                {diag.issues.map((iss: string, i: number) => (
                                    <div key={i} className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-900">
                                        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /> <span>{iss}</span>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-sm text-emerald-800">
                                <CheckCircle2 className="w-4 h-4" /> Todo en orden: el agente debería responder. Si aún no lo hace, revisa que el número desde el que escribes no sea el mismo número del negocio.
                            </div>
                        )}

                        {/* Pausa activa → reanudar */}
                        {diag.lastInbound?.pausedActive && (
                            <button onClick={resumeBot}
                                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-bold">
                                <PlayCircle className="w-4 h-4" /> Reanudar el bot ahora (quitar pausa)
                            </button>
                        )}

                        {/* Datos */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                            <DiagStat label="API Meta" ok={!diag.metaApi || diag.metaApi.ok}
                                value={!diag.metaApi ? 'Sin token' : (diag.metaApi.ok ? (diag.metaApi.qualityRating || 'OK') : 'Error')} />
                            <DiagStat label="Agente IA" ok={diag.agent?.exists && diag.agent?.enabled && diag.agent?.hasInstruction}
                                value={!diag.agent?.exists ? 'No creado' : (!diag.agent.enabled ? 'Desactivado' : (diag.agent.hasInstruction ? 'Activo' : 'Sin instrucción'))} />
                            <DiagStat label="Entrantes 24h" ok={diag.traffic24h?.inbound > 0} value={String(diag.traffic24h?.inbound ?? 0)} />
                            <DiagStat label="Enviados bot 24h" ok={diag.traffic24h?.outbound > 0} value={String(diag.traffic24h?.outbound ?? 0)} />
                        </div>

                        {diag.metaApi?.ok && (
                            <div className="text-xs text-gray-500">
                                Número verificado en Meta: <b>{diag.metaApi.verifiedName || '—'}</b> ({diag.metaApi.displayPhone || '—'}) · calidad <b>{diag.metaApi.qualityRating || '—'}</b>
                            </div>
                        )}

                        {diag.lastInbound && (
                            <div className="text-xs text-gray-500">
                                Último entrante: <b>{diag.lastInbound.name || diag.lastInbound.phone}</b> ({new Date(diag.lastInbound.at).toLocaleString()})
                                {diag.lastInbound.pausedActive && <span className="text-amber-600"> · en pausa hasta {new Date(diag.lastInbound.pausedUntil).toLocaleString()}</span>}
                                {diag.lastInbound.autoReplyDisabled && <span className="text-red-500"> · bot silenciado</span>}
                            </div>
                        )}

                        {diag.clubsWithWhatsapp && diag.clubsWithWhatsapp.length > 1 && (
                            <div className="text-xs text-gray-500">
                                Clubes con WhatsApp: {diag.clubsWithWhatsapp.length}. El bot responde sólo en el club dueño del número que recibe el mensaje (club actual: <b>{diag.clubName}</b>).
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* ── RESPUESTAS AUTOMÁTICAS ──────────────────────────────── */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-5 border-b border-gray-100 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-xl bg-blue-100 text-rotary-blue flex items-center justify-center">
                            <Zap className="w-6 h-6" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-gray-900">Respuestas automáticas</h2>
                            <p className="text-sm text-gray-500">Reglas fijas por palabra clave o bienvenida. Se evalúan antes que el agente de IA.</p>
                        </div>
                    </div>
                    <button onClick={() => { setEditingRule(null); setShowRuleModal(true); }}
                        className="bg-rotary-blue hover:bg-sky-800 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2">
                        <Plus className="w-4 h-4" /> Añadir respuesta
                    </button>
                </div>

                <div className="divide-y divide-gray-100">
                    {rules.length === 0 ? (
                        <div className="text-center py-12 text-gray-400 text-sm">
                            Aún no hay respuestas automáticas. Crea una de bienvenida o por palabra clave.
                        </div>
                    ) : rules.map(rule => (
                        <div key={rule.id} className="p-4 flex items-center gap-4 hover:bg-gray-50/50 group">
                            <button onClick={() => toggleRule(rule)}
                                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ${rule.active ? 'bg-emerald-500' : 'bg-gray-300'}`}>
                                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${rule.active ? 'translate-x-6' : 'translate-x-1'}`} />
                            </button>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <span className="font-bold text-gray-900">{rule.name}</span>
                                    <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-gray-100 text-gray-600">{TRIGGER_LABELS[rule.triggerType] || rule.triggerType}</span>
                                </div>
                                {rule.keywords?.length > 0 && (
                                    <div className="text-xs text-gray-500 mt-0.5">Dispara con: {rule.keywords.join(', ')}</div>
                                )}
                                <div className="text-sm text-gray-600 mt-1 truncate">{rule.responseText}</div>
                            </div>
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                <button onClick={() => { setEditingRule(rule); setShowRuleModal(true); }} className="p-2 text-gray-400 hover:text-rotary-blue hover:bg-blue-50 rounded-lg"><Edit2 className="w-4 h-4" /></button>
                                <button onClick={() => deleteRule(rule)} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {showRuleModal && (
                <RuleModal
                    headers={headers}
                    existing={editingRule}
                    onClose={() => setShowRuleModal(false)}
                    onSaved={(saved: any) => {
                        setShowRuleModal(false);
                        setRules(prev => editingRule ? prev.map(r => (r.id === saved.id ? saved : r)) : [...prev, saved]);
                    }}
                />
            )}
        </div>
    );
}

// ── Modal de regla ──────────────────────────────────────────────────────────
function RuleModal({ headers, existing, onClose, onSaved }: any) {
    const [form, setForm] = useState({
        name: existing?.name || '',
        triggerType: existing?.triggerType || 'keyword',
        matchMode: existing?.matchMode || 'contains',
        keywordsText: (existing?.keywords || []).join(', '),
        responseText: existing?.responseText || '',
        active: existing?.active ?? true,
        priority: existing?.priority ?? 0,
    });
    const [saving, setSaving] = useState(false);
    const needsKeywords = ['keyword', 'exact'].includes(form.triggerType);

    const submit = async () => {
        if (!form.name.trim() || !form.responseText.trim()) return toast.error('Nombre y respuesta son obligatorios');
        const keywords = form.keywordsText.split(',').map(k => k.trim()).filter(Boolean);
        if (needsKeywords && keywords.length === 0) return toast.error('Indica al menos una palabra clave');

        setSaving(true);
        try {
            const url = existing ? `${API}/crm/auto-replies/${existing.id}` : `${API}/crm/auto-replies`;
            const res = await fetch(url, {
                method: existing ? 'PUT' : 'POST', headers,
                body: JSON.stringify({
                    name: form.name, triggerType: form.triggerType, matchMode: form.matchMode,
                    keywords, responseText: form.responseText, active: form.active, priority: form.priority,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Error');
            toast.success('Respuesta guardada');
            onSaved(data);
        } catch (e: any) {
            toast.error(e.message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden">
                <div className="flex items-center justify-between p-5 border-b border-gray-100">
                    <h2 className="text-lg font-bold text-gray-900">{existing ? 'Editar respuesta' : 'Nueva respuesta automática'}</h2>
                    <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 rounded-lg"><X className="w-5 h-5" /></button>
                </div>
                <div className="p-5 space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">Nombre</label>
                        <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                            placeholder="Ej: Saludo de bienvenida"
                            className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:ring-2 focus:ring-rotary-blue outline-none" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-bold text-gray-700 mb-1">Tipo de disparador</label>
                            <select value={form.triggerType} onChange={e => setForm({ ...form, triggerType: e.target.value })}
                                className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:ring-2 focus:ring-rotary-blue outline-none">
                                <option value="keyword">Palabra clave</option>
                                <option value="exact">Coincidencia exacta</option>
                                <option value="welcome">Bienvenida (primer mensaje)</option>
                                <option value="fallback">Respaldo (si nada responde)</option>
                            </select>
                        </div>
                        {needsKeywords && (
                            <div>
                                <label className="block text-xs font-bold text-gray-700 mb-1">Modo de coincidencia</label>
                                <select value={form.matchMode} onChange={e => setForm({ ...form, matchMode: e.target.value })}
                                    className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:ring-2 focus:ring-rotary-blue outline-none">
                                    <option value="contains">Contiene</option>
                                    <option value="starts_with">Empieza con</option>
                                    <option value="exact">Exacta</option>
                                </select>
                            </div>
                        )}
                    </div>
                    {needsKeywords && (
                        <div>
                            <label className="block text-xs font-bold text-gray-700 mb-1">Palabras clave (separadas por coma)</label>
                            <input value={form.keywordsText} onChange={e => setForm({ ...form, keywordsText: e.target.value })}
                                placeholder="precio, costo, cuánto cuesta"
                                className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:ring-2 focus:ring-rotary-blue outline-none" />
                        </div>
                    )}
                    <div>
                        <label className="block text-xs font-bold text-gray-700 mb-1">Texto de respuesta</label>
                        <textarea value={form.responseText} onChange={e => setForm({ ...form, responseText: e.target.value })} rows={4}
                            placeholder="¡Hola! Gracias por escribir al Club Rotario. ¿En qué te podemos ayudar?"
                            className="w-full p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:ring-2 focus:ring-rotary-blue outline-none resize-none" />
                    </div>
                    <div className="flex items-center gap-2">
                        <input type="checkbox" id="ruleActive" checked={form.active} onChange={e => setForm({ ...form, active: e.target.checked })}
                            className="rounded border-gray-300 text-rotary-blue focus:ring-rotary-blue" />
                        <label htmlFor="ruleActive" className="text-sm text-gray-700 cursor-pointer">Activa</label>
                    </div>
                </div>
                <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-3">
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-700 px-4 py-2 text-sm font-bold">Cancelar</button>
                    <button onClick={submit} disabled={saving}
                        className="bg-rotary-blue hover:bg-sky-800 text-white px-6 py-2.5 rounded-lg text-sm font-bold disabled:opacity-50">
                        {saving ? 'Guardando...' : 'Guardar'}
                    </button>
                </div>
            </div>
        </div>
    );
}

function DiagStat({ label, value, ok }: { label: string; value: string; ok: boolean }) {
    return (
        <div className={`rounded-lg border p-3 ${ok ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
            <div className="text-[10px] font-bold uppercase tracking-wide text-gray-500">{label}</div>
            <div className={`font-bold ${ok ? 'text-emerald-700' : 'text-amber-700'}`}>{value}</div>
        </div>
    );
}
