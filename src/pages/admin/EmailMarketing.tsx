import React, { useEffect, useState, useCallback } from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import {
    Plus, Send, X, Trash2, Edit2, Mail, Users, Eye, EyeOff, Code,
    RefreshCw, CheckCircle2, Clock, AlertTriangle, Megaphone,
    BarChart3, Tag, MousePointerClick, MailCheck, FileText, Save
} from 'lucide-react';
import { toast } from 'sonner';

interface Campaign {
    id: string;
    name: string;
    subject: string;
    fromName?: string | null;
    preheader?: string | null;
    content: string;
    audience: 'all' | 'list' | 'tag';
    listId?: string | null;
    segmentTag?: string | null;
    status: 'draft' | 'sending' | 'sent' | 'failed';
    totalRecipients: number;
    sentCount: number;
    failedCount: number;
    openCount?: number;
    clickCount?: number;
    sentAt?: string | null;
    createdAt: string;
}

interface CrmList {
    id: string;
    name: string;
    color?: string;
    _count?: { members: number };
}

interface EmailTemplate {
    id: string;
    name: string;
    type?: string;
    subject?: string | null;
    content: string;
}

interface Stats {
    campaigns: number;
    emailsSent: number;
    opens: number;
    clicks: number;
    contacts: number;
    tags: number;
    templates: number;
}

interface Report {
    campaign: { id: string; name: string; subject: string; sentAt?: string | null; status: string };
    sent: number;
    failed: number;
    totalOpens: number;
    totalClicks: number;
    uniqueOpens: number;
    uniqueClicks: number;
    openRate: number;
    clickRate: number;
}

const API = import.meta.env.VITE_API_URL || '/api';
const authHeaders = () => ({ 'Authorization': `Bearer ${localStorage.getItem('rotary_token')}` });

const emptyForm = {
    name: '',
    subject: '',
    fromName: '',
    preheader: '',
    content: '<h2>Hola 👋</h2>\n<p>Escribe aquí el contenido de tu campaña.</p>',
    audience: 'all' as 'all' | 'list' | 'tag',
    listId: '',
    segmentTag: '',
};

const STATUS_META: Record<Campaign['status'], { label: string; cls: string; icon: React.ReactNode }> = {
    draft: { label: 'Borrador', cls: 'bg-gray-100 text-gray-600', icon: <Edit2 className="w-3 h-3" /> },
    sending: { label: 'Enviando', cls: 'bg-amber-100 text-amber-700 animate-pulse', icon: <Clock className="w-3 h-3" /> },
    sent: { label: 'Enviada', cls: 'bg-emerald-100 text-emerald-700', icon: <CheckCircle2 className="w-3 h-3" /> },
    failed: { label: 'Fallida', cls: 'bg-rose-100 text-rose-700', icon: <AlertTriangle className="w-3 h-3" /> },
};

const EmailMarketing: React.FC = () => {
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [lists, setLists] = useState<CrmList[]>([]);
    const [tags, setTags] = useState<string[]>([]);
    const [templates, setTemplates] = useState<EmailTemplate[]>([]);
    const [stats, setStats] = useState<Stats | null>(null);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editing, setEditing] = useState<Campaign | null>(null);
    const [form, setForm] = useState(emptyForm);
    const [audienceCount, setAudienceCount] = useState<number | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [sendingId, setSendingId] = useState<string | null>(null);
    const [preview, setPreview] = useState(false);
    const [report, setReport] = useState<Report | null>(null);
    const [reportLoading, setReportLoading] = useState(false);

    const fetchCampaigns = useCallback(async () => {
        try {
            const res = await fetch(`${API}/email-marketing`, { headers: authHeaders() });
            if (res.ok) setCampaigns(await res.json());
        } catch {
            toast.error('Error al cargar las campañas');
        } finally {
            setLoading(false);
        }
    }, []);

    const fetchStats = useCallback(async () => {
        try {
            const res = await fetch(`${API}/email-marketing/stats`, { headers: authHeaders() });
            if (res.ok) setStats(await res.json());
        } catch { /* las métricas son opcionales */ }
    }, []);

    const fetchLists = useCallback(async () => {
        try {
            const res = await fetch(`${API}/crm/lists`, { headers: authHeaders() });
            if (res.ok) setLists(await res.json());
        } catch { /* las listas son opcionales */ }
    }, []);

    const fetchTags = useCallback(async () => {
        try {
            const res = await fetch(`${API}/email-marketing/tags`, { headers: authHeaders() });
            if (res.ok) setTags(await res.json());
        } catch { /* las etiquetas son opcionales */ }
    }, []);

    const fetchTemplates = useCallback(async () => {
        try {
            const res = await fetch(`${API}/communications/templates`, { headers: authHeaders() });
            if (res.ok) {
                const data: EmailTemplate[] = await res.json();
                setTemplates(data.filter(t => !t.type || t.type === 'email'));
            }
        } catch { /* las plantillas son opcionales */ }
    }, []);

    useEffect(() => {
        fetchCampaigns();
        fetchStats();
        fetchLists();
        fetchTags();
        fetchTemplates();
    }, [fetchCampaigns, fetchStats, fetchLists, fetchTags, fetchTemplates]);

    const loadTemplate = (id: string) => {
        const t = templates.find(x => x.id === id);
        if (!t) return;
        setForm(f => ({ ...f, subject: t.subject || f.subject, content: t.content }));
        toast.success(`Plantilla "${t.name}" cargada`);
    };

    const saveAsTemplate = async () => {
        const name = window.prompt('Nombre de la plantilla:', form.name || 'Plantilla de campaña');
        if (!name) return;
        try {
            const res = await fetch(`${API}/communications/templates`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...authHeaders() },
                body: JSON.stringify({ name, type: 'email', subject: form.subject, content: form.content }),
            });
            if (!res.ok) throw new Error('No se pudo guardar la plantilla');
            toast.success('Plantilla guardada');
            fetchTemplates();
            fetchStats();
        } catch (err: any) {
            toast.error(err.message);
        }
    };

    const openReport = async (c: Campaign) => {
        setReport(null);
        setReportLoading(true);
        try {
            const res = await fetch(`${API}/email-marketing/${c.id}/report`, { headers: authHeaders() });
            if (res.ok) setReport(await res.json());
            else toast.error('No se pudo cargar el reporte');
        } catch {
            toast.error('Error al cargar el reporte');
        } finally {
            setReportLoading(false);
        }
    };

    // Preview de audiencia cuando cambia la selección dentro del modal
    useEffect(() => {
        if (!isModalOpen) return;
        let cancelled = false;
        setAudienceCount(null);
        const params = new URLSearchParams({ audience: form.audience });
        if (form.audience === 'list' && form.listId) params.set('listId', form.listId);
        if (form.audience === 'tag' && form.segmentTag) params.set('segmentTag', form.segmentTag);
        fetch(`${API}/email-marketing/audience?${params.toString()}`, { headers: authHeaders() })
            .then(r => r.ok ? r.json() : { count: 0 })
            .then(d => { if (!cancelled) setAudienceCount(d.count ?? 0); })
            .catch(() => { if (!cancelled) setAudienceCount(0); });
        return () => { cancelled = true; };
    }, [isModalOpen, form.audience, form.listId, form.segmentTag]);

    const openModal = (c?: Campaign) => {
        setPreview(false);
        if (c) {
            setEditing(c);
            setForm({
                name: c.name,
                subject: c.subject,
                fromName: c.fromName || '',
                preheader: c.preheader || '',
                content: c.content,
                audience: c.audience,
                listId: c.listId || '',
                segmentTag: c.segmentTag || '',
            });
        } else {
            setEditing(null);
            setForm(emptyForm);
        }
        setIsModalOpen(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            const url = editing ? `${API}/email-marketing/${editing.id}` : `${API}/email-marketing`;
            const res = await fetch(url, {
                method: editing ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json', ...authHeaders() },
                body: JSON.stringify(form),
            });
            if (!res.ok) {
                const d = await res.json();
                throw new Error(d.error || 'No se pudo guardar la campaña');
            }
            toast.success(editing ? 'Campaña actualizada' : 'Campaña creada');
            setIsModalOpen(false);
            fetchCampaigns();
        } catch (err: any) {
            toast.error(err.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleSend = async (c: Campaign) => {
        if (!window.confirm(`¿Enviar la campaña "${c.name}" ahora? Esta acción no se puede deshacer.`)) return;
        setSendingId(c.id);
        try {
            const res = await fetch(`${API}/email-marketing/${c.id}/send`, { method: 'POST', headers: authHeaders() });
            const d = await res.json();
            if (!res.ok) throw new Error(d.error || 'No se pudo enviar la campaña');
            const skippedTxt = d.skipped ? ` · ${d.skipped} pospuestos (límite por envío)` : '';
            toast.success(`Enviada: ${d.sent} correo(s)${d.failed ? `, ${d.failed} fallido(s)` : ''}${skippedTxt}`);
            fetchCampaigns();
            fetchStats();
        } catch (err: any) {
            toast.error(err.message);
            fetchCampaigns();
        } finally {
            setSendingId(null);
        }
    };

    const handleDelete = async (c: Campaign) => {
        if (!window.confirm(`¿Eliminar la campaña "${c.name}"?`)) return;
        try {
            const res = await fetch(`${API}/email-marketing/${c.id}`, { method: 'DELETE', headers: authHeaders() });
            if (!res.ok) throw new Error('No se pudo eliminar');
            toast.success('Campaña eliminada');
            fetchCampaigns();
        } catch (err: any) {
            toast.error(err.message);
        }
    };

    return (
        <AdminLayout>
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-black text-rotary-blue flex items-center gap-2">
                        <Megaphone className="w-6 h-6" /> Email Marketing
                    </h1>
                    <p className="text-gray-500 text-sm">Crea y envía campañas de correo a tus contactos.</p>
                </div>
                <button
                    onClick={() => openModal()}
                    className="flex items-center gap-2 bg-rotary-blue text-white px-4 py-2 rounded-lg hover:bg-sky-800 transition-all shadow-lg shadow-sky-100 font-bold"
                >
                    <Plus className="w-4 h-4" /> Nueva Campaña
                </button>
            </div>

            {/* Dashboard de métricas */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
                {[
                    { label: 'Campañas', value: stats?.campaigns ?? 0, icon: Megaphone, color: 'text-rotary-blue bg-sky-50' },
                    { label: 'Enviados', value: stats?.emailsSent ?? 0, icon: MailCheck, color: 'text-emerald-600 bg-emerald-50' },
                    { label: 'Aperturas', value: stats?.opens ?? 0, icon: Eye, color: 'text-indigo-600 bg-indigo-50' },
                    { label: 'Clics', value: stats?.clicks ?? 0, icon: MousePointerClick, color: 'text-amber-600 bg-amber-50' },
                    { label: 'Contactos', value: stats?.contacts ?? 0, icon: Users, color: 'text-purple-600 bg-purple-50' },
                    { label: 'Etiquetas', value: stats?.tags ?? 0, icon: Tag, color: 'text-rose-600 bg-rose-50' },
                ].map((m) => (
                    <div key={m.label} className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center mb-2 ${m.color}`}>
                            <m.icon className="w-4 h-4" />
                        </div>
                        <p className="text-2xl font-black text-gray-800">{m.value.toLocaleString()}</p>
                        <p className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">{m.label}</p>
                    </div>
                ))}
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <table className="w-full text-left">
                    <thead className="bg-gray-50 border-b border-gray-100">
                        <tr>
                            <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Campaña</th>
                            <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Audiencia</th>
                            <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Resultados</th>
                            <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Estado</th>
                            <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider text-right">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {campaigns.map((c) => {
                            const meta = STATUS_META[c.status];
                            const listName = c.audience === 'list'
                                ? (lists.find(l => l.id === c.listId)?.name || 'Lista')
                                : c.audience === 'tag'
                                    ? `Etiqueta: ${c.segmentTag || '—'}`
                                    : 'Todos los contactos';
                            return (
                                <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded bg-sky-100 text-rotary-blue flex items-center justify-center">
                                                <Mail className="w-4 h-4" />
                                            </div>
                                            <div>
                                                <p className="font-medium text-gray-800">{c.name}</p>
                                                <p className="text-xs text-gray-400 truncate max-w-xs">{c.subject}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-500">
                                        <div className="flex items-center gap-1"><Users className="w-3 h-3" /> {listName}</div>
                                    </td>
                                    <td className="px-6 py-4 text-sm">
                                        {c.status === 'sent' || c.status === 'failed' ? (
                                            <div className="flex gap-4">
                                                <div className="text-center"><p className="text-[10px] text-gray-400 uppercase">Enviados</p><p className="font-bold text-emerald-600">{c.sentCount}</p></div>
                                                <div className="text-center"><p className="text-[10px] text-gray-400 uppercase">Fallidos</p><p className="font-bold text-rose-500">{c.failedCount}</p></div>
                                            </div>
                                        ) : <span className="text-gray-300 text-xs">—</span>}
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase inline-flex items-center gap-1 ${meta.cls}`}>
                                            {meta.icon} {meta.label}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex justify-end gap-2">
                                            {(c.status === 'sent' || c.status === 'failed') && (
                                                <button
                                                    onClick={() => openReport(c)}
                                                    className="p-2 text-gray-400 hover:text-indigo-600 transition-colors"
                                                    title="Ver reporte"
                                                >
                                                    <BarChart3 className="w-4 h-4" />
                                                </button>
                                            )}
                                            {(c.status === 'draft' || c.status === 'failed') && (
                                                <button
                                                    onClick={() => handleSend(c)}
                                                    disabled={sendingId === c.id}
                                                    className="p-2 text-gray-400 hover:text-emerald-600 transition-colors disabled:opacity-40"
                                                    title="Enviar ahora"
                                                >
                                                    {sendingId === c.id ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                                                </button>
                                            )}
                                            {c.status === 'draft' && (
                                                <button onClick={() => openModal(c)} className="p-2 text-gray-400 hover:text-rotary-blue transition-colors" title="Editar">
                                                    <Edit2 className="w-4 h-4" />
                                                </button>
                                            )}
                                            <button onClick={() => handleDelete(c)} className="p-2 text-gray-400 hover:text-red-500 transition-colors" title="Eliminar">
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
                {campaigns.length === 0 && !loading && (
                    <div className="p-12 text-center text-gray-400">
                        Aún no hay campañas. Crea la primera con "Nueva Campaña".
                    </div>
                )}
                {loading && <div className="p-12 text-center text-gray-400">Cargando…</div>}
            </div>

            {/* Modal Crear / Editar */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
                        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                            <h2 className="text-lg font-bold text-gray-800">{editing ? 'Editar Campaña' : 'Nueva Campaña'}</h2>
                            <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600"><X className="w-6 h-6" /></button>
                        </div>

                        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto flex-1 space-y-5">
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Nombre interno</label>
                                <input
                                    type="text" required
                                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-rotary-blue outline-none"
                                    value={form.name}
                                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                                    placeholder="Ej: Invitación Convención 2026"
                                />
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1">Asunto</label>
                                    <input
                                        type="text" required
                                        className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-rotary-blue outline-none"
                                        value={form.subject}
                                        onChange={(e) => setForm({ ...form, subject: e.target.value })}
                                        placeholder="Asunto del correo"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1">Nombre del remitente (opcional)</label>
                                    <input
                                        type="text"
                                        className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-rotary-blue outline-none"
                                        value={form.fromName}
                                        onChange={(e) => setForm({ ...form, fromName: e.target.value })}
                                        placeholder="Ej: Comité Organizador"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Preheader (texto de vista previa, opcional)</label>
                                <input
                                    type="text"
                                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-rotary-blue outline-none"
                                    value={form.preheader}
                                    onChange={(e) => setForm({ ...form, preheader: e.target.value })}
                                    placeholder="Frase corta que se ve junto al asunto en la bandeja"
                                />
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1">Audiencia</label>
                                    <select
                                        className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-rotary-blue outline-none bg-white"
                                        value={form.audience}
                                        onChange={(e) => setForm({ ...form, audience: e.target.value as 'all' | 'list' | 'tag' })}
                                    >
                                        <option value="all">Todos los contactos</option>
                                        <option value="list">Una lista específica</option>
                                        <option value="tag">Por etiqueta</option>
                                    </select>
                                </div>
                                {form.audience === 'list' && (
                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 mb-1">Lista</label>
                                        <select
                                            className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-rotary-blue outline-none bg-white"
                                            value={form.listId}
                                            onChange={(e) => setForm({ ...form, listId: e.target.value })}
                                        >
                                            <option value="">— Seleccionar lista —</option>
                                            {lists.map(l => (
                                                <option key={l.id} value={l.id}>{l.name} ({l._count?.members ?? 0})</option>
                                            ))}
                                        </select>
                                    </div>
                                )}
                                {form.audience === 'tag' && (
                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 mb-1">Etiqueta</label>
                                        <select
                                            className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-rotary-blue outline-none bg-white"
                                            value={form.segmentTag}
                                            onChange={(e) => setForm({ ...form, segmentTag: e.target.value })}
                                        >
                                            <option value="">— Seleccionar etiqueta —</option>
                                            {tags.map(t => (
                                                <option key={t} value={t}>{t}</option>
                                            ))}
                                        </select>
                                    </div>
                                )}
                            </div>

                            <div className="bg-sky-50 border border-sky-100 rounded-lg px-4 py-2 text-sm text-sky-800 flex items-center gap-2">
                                <Users className="w-4 h-4" />
                                {audienceCount == null
                                    ? 'Calculando audiencia…'
                                    : <>Se enviará a <strong>{audienceCount}</strong> contacto(s) con email válido (se excluyen bajas).</>}
                            </div>

                            <div className="flex flex-wrap items-end gap-2 bg-gray-50 border border-gray-100 rounded-lg p-3">
                                <div className="flex-1 min-w-[180px]">
                                    <label className="block text-[11px] font-bold text-gray-500 mb-1 uppercase tracking-wider flex items-center gap-1">
                                        <FileText className="w-3 h-3" /> Plantillas
                                    </label>
                                    <select
                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-rotary-blue outline-none bg-white text-sm"
                                        value=""
                                        onChange={(e) => { if (e.target.value) loadTemplate(e.target.value); }}
                                    >
                                        <option value="">— Cargar plantilla —</option>
                                        {templates.map(t => (
                                            <option key={t.id} value={t.id}>{t.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <button
                                    type="button"
                                    onClick={saveAsTemplate}
                                    className="flex items-center gap-1.5 px-3 py-2 text-sm font-bold text-rotary-blue bg-white border border-blue-200 rounded-lg hover:bg-sky-50 transition-all"
                                    title="Guardar el contenido actual como plantilla reutilizable"
                                >
                                    <Save className="w-4 h-4" /> Guardar como plantilla
                                </button>
                            </div>

                            <div>
                                <div className="flex items-center justify-between mb-1">
                                    <label className="block text-sm font-bold text-gray-700">Contenido (HTML)</label>
                                    <button type="button" onClick={() => setPreview(!preview)} className="flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-800">
                                        {preview ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                        {preview ? 'Editar' : 'Vista previa'}
                                    </button>
                                </div>
                                {preview ? (
                                    <div className="min-h-[200px] border border-gray-200 rounded-lg p-4 prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: form.content || '<p class="text-gray-400">Sin contenido…</p>' }} />
                                ) : (
                                    <textarea
                                        rows={10}
                                        className="w-full px-4 py-3 font-mono text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-rotary-blue outline-none resize-y"
                                        value={form.content}
                                        onChange={(e) => setForm({ ...form, content: e.target.value })}
                                    />
                                )}
                                <p className="text-[10px] text-gray-400 mt-1 flex items-center gap-1">
                                    <Code className="w-3 h-3" /> Se añade automáticamente un pie con enlace para cancelar suscripción.
                                </p>
                            </div>

                            <div className="flex justify-end gap-3 border-t border-gray-100 pt-4">
                                <button type="button" onClick={() => setIsModalOpen(false)} className="px-6 py-2 text-gray-500 font-bold hover:text-gray-700">Cancelar</button>
                                <button type="submit" disabled={isSubmitting} className="bg-rotary-blue text-white px-8 py-2 rounded-full font-bold hover:bg-sky-800 transition-all disabled:opacity-50">
                                    {isSubmitting ? 'Guardando…' : (editing ? 'Guardar Cambios' : 'Crear Campaña')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal de Reporte */}
            {(report || reportLoading) && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden">
                        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                            <div className="flex items-center gap-2">
                                <BarChart3 className="w-5 h-5 text-indigo-600" />
                                <h2 className="text-lg font-bold text-gray-800">Reporte de Campaña</h2>
                            </div>
                            <button onClick={() => setReport(null)} className="text-gray-400 hover:text-gray-600"><X className="w-6 h-6" /></button>
                        </div>
                        <div className="p-6">
                            {reportLoading || !report ? (
                                <div className="py-10 text-center text-gray-400">Cargando reporte…</div>
                            ) : (
                                <>
                                    <p className="font-bold text-gray-800">{report.campaign.name}</p>
                                    <p className="text-sm text-gray-400 mb-5">{report.campaign.subject}</p>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="p-4 rounded-xl bg-emerald-50 text-center">
                                            <p className="text-2xl font-black text-emerald-700">{report.sent}</p>
                                            <p className="text-[10px] uppercase font-bold text-emerald-600 tracking-wider">Enviados</p>
                                        </div>
                                        <div className="p-4 rounded-xl bg-rose-50 text-center">
                                            <p className="text-2xl font-black text-rose-600">{report.failed}</p>
                                            <p className="text-[10px] uppercase font-bold text-rose-500 tracking-wider">Fallidos</p>
                                        </div>
                                        <div className="p-4 rounded-xl bg-indigo-50 text-center">
                                            <p className="text-2xl font-black text-indigo-700">{report.uniqueOpens} <span className="text-sm font-bold text-indigo-400">({report.openRate}%)</span></p>
                                            <p className="text-[10px] uppercase font-bold text-indigo-600 tracking-wider">Aperturas únicas</p>
                                        </div>
                                        <div className="p-4 rounded-xl bg-amber-50 text-center">
                                            <p className="text-2xl font-black text-amber-700">{report.uniqueClicks} <span className="text-sm font-bold text-amber-400">({report.clickRate}%)</span></p>
                                            <p className="text-[10px] uppercase font-bold text-amber-600 tracking-wider">Clics únicos</p>
                                        </div>
                                    </div>
                                    <p className="text-[11px] text-gray-400 mt-4 text-center">
                                        Total de aperturas: {report.totalOpens} · Total de clics: {report.totalClicks}
                                    </p>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </AdminLayout>
    );
};

export default EmailMarketing;
