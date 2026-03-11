import React, { useState, useEffect, useCallback } from 'react';
import {
    Plus, Save, X, Edit2, Trash2, ToggleLeft, ToggleRight,
    ChevronDown, ChevronUp, Bot,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import AdminLayout from '../../components/admin/AdminLayout';

const API = import.meta.env.VITE_API_URL || '/api';
const avatar = (seed: string) => `https://api.dicebear.com/9.x/adventurer/svg?seed=${seed}&backgroundColor=transparent`;

const CATEGORY_LABELS: Record<string, { label: string; color: string }> = {
    'dirección': { label: 'Dirección y Estrategia', color: '#3B82F6' },
    'producción': { label: 'Producción de Contenido', color: '#EC4899' },
    'tecnología': { label: 'Tecnología y Plataformas', color: '#0EA5E9' },
    'difusión': { label: 'Difusión y Comunidad', color: '#F97316' },
};

const AI_MODELS = [
    { value: 'gpt-4', label: 'GPT-4 (Premium)' },
    { value: 'gpt-3.5', label: 'GPT-3.5 Turbo' },
    { value: 'gemini', label: 'Gemini Pro' },
];

const CAPABILITY_OPTIONS = [
    { value: 'edit_content', label: 'Editar contenido del sitio' },
    { value: 'create_news', label: 'Crear noticias' },
    { value: 'create_blog', label: 'Crear blog posts' },
    { value: 'create_posts', label: 'Crear posts para redes' },
    { value: 'create_media', label: 'Crear contenido multimedia' },
    { value: 'upload_media', label: 'Subir archivos' },
    { value: 'generate_captions', label: 'Generar captions' },
    { value: 'create_campaigns', label: 'Crear campañas' },
    { value: 'create_press_release', label: 'Crear comunicados de prensa' },
    { value: 'review_content', label: 'Revisar y aprobar contenido' },
    { value: 'brand_guidelines', label: 'Guías de marca Rotary' },
    { value: 'design_assets', label: 'Diseñar piezas gráficas' },
    { value: 'edit_pages', label: 'Editar páginas web' },
    { value: 'site_config', label: 'Configuración del sitio' },
    { value: 'manage_leads', label: 'Gestionar leads/contactos' },
    { value: 'email_campaigns', label: 'Email marketing' },
    { value: 'automation', label: 'Automatizaciones' },
    { value: 'media_relations', label: 'Relaciones con medios' },
    { value: 'calendar', label: 'Calendario editorial' },
    { value: 'analytics', label: 'Analytics y métricas' },
];

interface Agent {
    id: string;
    name: string;
    role: string;
    category: string;
    description: string;
    systemPrompt: string;
    aiModel: string;
    avatarSeed: string;
    avatarColor: string;
    capabilities: string[];
    active: boolean;
    order: number;
    greeting: string;
}

const EMPTY_AGENT: Omit<Agent, 'id'> = {
    name: '', role: '', category: 'dirección', description: '',
    systemPrompt: '', aiModel: 'gpt-4', avatarSeed: '', avatarColor: '#3B82F6',
    capabilities: [], active: true, order: 0, greeting: '',
};

const AgentsManagement: React.FC = () => {
    const { token } = useAuth();
    const [agents, setAgents] = useState<Agent[]>([]);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState<Agent | null>(null);
    const [creating, setCreating] = useState(false);
    const [form, setForm] = useState<Omit<Agent, 'id'>>(EMPTY_AGENT);
    const [saving, setSaving] = useState(false);
    const [expandedPrompt, setExpandedPrompt] = useState<string | null>(null);

    const getHeaders = () => ({
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token || localStorage.getItem('rotary_token')}`,
    });

    const fetchAgents = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`${API}/agents`, { headers: getHeaders() });
            if (res.ok) {
                const data = await res.json();
                setAgents(data.agents || []);
            }
        } catch (e) { console.error('Error fetching agents:', e); }
        finally { setLoading(false); }
    }, [token]);

    useEffect(() => { fetchAgents(); }, [fetchAgents]);

    const startEdit = (agent: Agent) => {
        setEditing(agent);
        setCreating(false);
        setForm({
            name: agent.name, role: agent.role, category: agent.category, description: agent.description,
            systemPrompt: agent.systemPrompt, aiModel: agent.aiModel, avatarSeed: agent.avatarSeed,
            avatarColor: agent.avatarColor, capabilities: agent.capabilities || [], active: agent.active,
            order: agent.order, greeting: agent.greeting || '',
        });
    };

    const startCreate = () => {
        setEditing(null);
        setCreating(true);
        setForm({ ...EMPTY_AGENT, order: agents.length + 1 });
    };

    const cancel = () => { setEditing(null); setCreating(false); };

    const save = async () => {
        setSaving(true);
        try {
            const url = editing ? `${API}/agents/${editing.id}` : `${API}/agents`;
            const method = editing ? 'PUT' : 'POST';
            await fetch(url, { method, headers: getHeaders(), body: JSON.stringify(form) });
            await fetchAgents();
            cancel();
        } catch (e) { console.error(e); }
        finally { setSaving(false); }
    };

    const toggleActive = async (agent: Agent) => {
        await fetch(`${API}/agents/${agent.id}`, {
            method: 'PUT', headers: getHeaders(), body: JSON.stringify({ active: !agent.active }),
        });
        fetchAgents();
    };

    const deleteAgent = async (id: string) => {
        if (!confirm('¿Eliminar este agente?')) return;
        await fetch(`${API}/agents/${id}`, { method: 'DELETE', headers: getHeaders() });
        fetchAgents();
    };

    const toggleCapability = (cap: string) => {
        setForm(f => ({
            ...f,
            capabilities: f.capabilities.includes(cap) ? f.capabilities.filter(c => c !== cap) : [...f.capabilities, cap],
        }));
    };

    const grouped = agents.reduce((acc, agent) => {
        const cat = agent.category || 'otros';
        if (!acc[cat]) acc[cat] = [];
        acc[cat].push(agent);
        return acc;
    }, {} as Record<string, Agent[]>);

    if (loading) return (
        <AdminLayout>
            <div className="flex items-center justify-center h-64">
                <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
        </AdminLayout>
    );

    return (
        <AdminLayout>
            <div className="space-y-6">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg">
                            <Bot className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <h2 className="text-2xl font-black text-gray-900">Agentes IA</h2>
                            <p className="text-sm text-gray-500">Configura los agentes de la Oficina de Comunicaciones</p>
                        </div>
                    </div>
                    <button onClick={startCreate}
                        className="flex items-center gap-2 px-4 py-2.5 bg-gray-900 text-white rounded-xl text-sm font-bold hover:bg-gray-800 transition-colors">
                        <Plus className="w-4 h-4" /> Nuevo Agente
                    </button>
                </div>

                {/* Create/Edit Form */}
                {(creating || editing) && (
                    <div className="bg-white rounded-2xl border border-gray-200 shadow-lg p-6 space-y-5">
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg font-bold text-gray-900">{editing ? 'Editar Agente' : 'Crear Agente'}</h3>
                            <button onClick={cancel} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl"><X className="w-5 h-5" /></button>
                        </div>

                        {/* Avatar preview */}
                        <div className="flex items-center gap-4">
                            <div className="w-16 h-16 rounded-full overflow-hidden border-3 flex-shrink-0"
                                style={{ borderColor: form.avatarColor, background: form.avatarColor + '20' }}>
                                <img src={avatar(form.avatarSeed || form.name || 'Agent')} alt="" className="w-full h-full" />
                            </div>
                            <div className="flex-1 grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs font-bold text-gray-500 uppercase">Nombre</label>
                                    <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value, avatarSeed: form.avatarSeed || e.target.value })}
                                        className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-gray-400" placeholder="Ej: Diana" />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-gray-500 uppercase">Rol</label>
                                    <input value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}
                                        className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-gray-400" placeholder="Ej: Directora de Comunicaciones" />
                                </div>
                            </div>
                        </div>

                        {/* Row 2 */}
                        <div className="grid grid-cols-3 gap-3">
                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase">Categoría</label>
                                <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}
                                    className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-gray-400 bg-white">
                                    <option value="dirección">Dirección y Estrategia</option>
                                    <option value="producción">Producción de Contenido</option>
                                    <option value="tecnología">Tecnología y Plataformas</option>
                                    <option value="difusión">Difusión y Comunidad</option>
                                </select>
                            </div>
                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase">Modelo IA</label>
                                <select value={form.aiModel} onChange={e => setForm({ ...form, aiModel: e.target.value })}
                                    className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-gray-400 bg-white">
                                    {AI_MODELS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase">Color</label>
                                <div className="flex items-center gap-2 mt-1">
                                    <input type="color" value={form.avatarColor} onChange={e => setForm({ ...form, avatarColor: e.target.value })}
                                        className="w-10 h-10 rounded-lg border-0 cursor-pointer" />
                                    <input value={form.avatarColor} onChange={e => setForm({ ...form, avatarColor: e.target.value })}
                                        className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-gray-400 font-mono" />
                                </div>
                            </div>
                        </div>

                        {/* Description */}
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase">Descripción</label>
                            <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                                className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-gray-400"
                                placeholder="Breve descripción de las funciones del agente" />
                        </div>

                        {/* Greeting */}
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase">Saludo inicial</label>
                            <input value={form.greeting} onChange={e => setForm({ ...form, greeting: e.target.value })}
                                className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-gray-400"
                                placeholder="Mensaje de bienvenida cuando el usuario inicia chat" />
                        </div>

                        {/* System Prompt */}
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase">System Prompt (instrucciones IA)</label>
                            <textarea value={form.systemPrompt} onChange={e => setForm({ ...form, systemPrompt: e.target.value })} rows={5}
                                className="w-full mt-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-gray-400 resize-y font-mono leading-relaxed"
                                placeholder="Instrucciones detalladas para el modelo de IA. Define la personalidad, el tono, las capacidades y las limitaciones del agente." />
                        </div>

                        {/* Capabilities */}
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase mb-2 block">Capacidades</label>
                            <div className="flex flex-wrap gap-2">
                                {CAPABILITY_OPTIONS.map(cap => (
                                    <button key={cap.value} onClick={() => toggleCapability(cap.value)}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${form.capabilities.includes(cap.value)
                                            ? 'bg-gray-900 text-white'
                                            : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                                            }`}>
                                        {cap.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Save */}
                        <div className="flex justify-end gap-2 pt-2">
                            <button onClick={cancel} className="px-4 py-2 text-sm font-bold text-gray-500 hover:text-gray-700">Cancelar</button>
                            <button onClick={save} disabled={saving || !form.name || !form.role}
                                className="flex items-center gap-2 px-5 py-2.5 bg-gray-900 text-white rounded-xl text-sm font-bold hover:bg-gray-800 transition-colors disabled:opacity-50">
                                <Save className="w-4 h-4" /> {saving ? 'Guardando...' : 'Guardar'}
                            </button>
                        </div>
                    </div>
                )}

                {/* Agent List by Category */}
                {Object.entries(CATEGORY_LABELS).map(([key, cat]) => {
                    const catAgents = grouped[key] || [];
                    if (catAgents.length === 0) return null;
                    return (
                        <div key={key} className="space-y-3">
                            <div className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded-full" style={{ background: cat.color }} />
                                <h3 className="text-sm font-black text-gray-700 uppercase tracking-wider">{cat.label}</h3>
                                <span className="text-xs text-gray-400 font-bold">{catAgents.length}</span>
                            </div>

                            <div className="grid gap-3">
                                {catAgents.map(agent => (
                                    <div key={agent.id}
                                        className={`bg-white rounded-2xl border p-4 transition-all hover:shadow-md ${agent.active ? 'border-gray-200' : 'border-gray-100 opacity-60'}`}>
                                        <div className="flex items-center gap-4">
                                            {/* Avatar */}
                                            <div className="w-12 h-12 rounded-full overflow-hidden border-2 flex-shrink-0"
                                                style={{ borderColor: agent.avatarColor, background: agent.avatarColor + '20' }}>
                                                <img src={avatar(agent.avatarSeed)} alt={agent.name} className="w-full h-full" />
                                            </div>

                                            {/* Info */}
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <h4 className="font-black text-gray-900">{agent.name}</h4>
                                                    <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase"
                                                        style={{ background: cat.color + '15', color: cat.color }}>{agent.aiModel}</span>
                                                    {!agent.active && <span className="px-2 py-0.5 bg-gray-100 rounded-full text-[9px] font-bold text-gray-400">INACTIVO</span>}
                                                </div>
                                                <p className="text-xs text-gray-500 font-medium mt-0.5">{agent.role}</p>
                                                <p className="text-[10px] text-gray-400 mt-0.5">{agent.description}</p>
                                            </div>

                                            {/* Capabilities badges */}
                                            <div className="hidden md:flex flex-wrap gap-1 max-w-[200px]">
                                                {(agent.capabilities || []).slice(0, 3).map(c => (
                                                    <span key={c} className="px-2 py-0.5 bg-gray-50 rounded text-[8px] font-bold text-gray-400 uppercase">{c.replace(/_/g, ' ')}</span>
                                                ))}
                                                {(agent.capabilities || []).length > 3 && (
                                                    <span className="px-2 py-0.5 bg-gray-50 rounded text-[8px] font-bold text-gray-400">+{agent.capabilities.length - 3}</span>
                                                )}
                                            </div>

                                            {/* Actions */}
                                            <div className="flex items-center gap-1 flex-shrink-0">
                                                <button onClick={() => toggleActive(agent)} className="p-2 rounded-xl hover:bg-gray-100 transition-colors"
                                                    title={agent.active ? 'Desactivar' : 'Activar'}>
                                                    {agent.active
                                                        ? <ToggleRight className="w-5 h-5 text-emerald-500" />
                                                        : <ToggleLeft className="w-5 h-5 text-gray-300" />}
                                                </button>
                                                <button onClick={() => setExpandedPrompt(expandedPrompt === agent.id ? null : agent.id)}
                                                    className="p-2 rounded-xl hover:bg-gray-100 transition-colors" title="Ver prompt">
                                                    {expandedPrompt === agent.id ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                                                </button>
                                                <button onClick={() => startEdit(agent)} className="p-2 rounded-xl hover:bg-gray-100 transition-colors" title="Editar">
                                                    <Edit2 className="w-4 h-4 text-gray-400" />
                                                </button>
                                                <button onClick={() => deleteAgent(agent.id)} className="p-2 rounded-xl hover:bg-red-50 transition-colors" title="Eliminar">
                                                    <Trash2 className="w-4 h-4 text-gray-300 hover:text-red-400" />
                                                </button>
                                            </div>
                                        </div>

                                        {/* Expanded Prompt */}
                                        {expandedPrompt === agent.id && (
                                            <div className="mt-3 pt-3 border-t border-gray-100">
                                                <p className="text-[10px] font-black text-gray-400 uppercase mb-1">System Prompt</p>
                                                <p className="text-xs text-gray-500 leading-relaxed font-mono bg-gray-50 rounded-xl p-3">{agent.systemPrompt || 'Sin prompt configurado'}</p>
                                                {agent.greeting && (
                                                    <>
                                                        <p className="text-[10px] font-black text-gray-400 uppercase mb-1 mt-2">Saludo</p>
                                                        <p className="text-xs text-gray-500 bg-gray-50 rounded-xl p-3">{agent.greeting}</p>
                                                    </>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>
        </AdminLayout>
    );
};

export default AgentsManagement;
