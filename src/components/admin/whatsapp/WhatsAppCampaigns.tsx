import React, { useState, useEffect } from 'react';
import { useAuth } from '../../../hooks/useAuth';
import { Megaphone, Plus, Trash2, Edit3, Play, Loader2, X, Eye, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { toast } from 'sonner';

const API = import.meta.env.VITE_API_URL || '/api';

const WhatsAppCampaigns: React.FC = () => {
    const { token } = useAuth();
    const [campaigns, setCampaigns] = useState<any[]>([]);
    const [lists, setLists] = useState<any[]>([]);
    const [templates, setTemplates] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editId, setEditId] = useState<string | null>(null);
    const [sending, setSending] = useState<string | null>(null);
    const [viewLogs, setViewLogs] = useState<string | null>(null);
    const [logs, setLogs] = useState<any[]>([]);
    const [form, setForm] = useState({ name: '', description: '', listId: '', templateId: '' });
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

    useEffect(() => { fetchAll(); }, []);

    const fetchAll = async () => {
        setLoading(true);
        try {
            const [c, l, t] = await Promise.all([
                fetch(`${API}/whatsapp/campaigns`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
                fetch(`${API}/whatsapp/lists`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
                fetch(`${API}/whatsapp/templates`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
            ]);
            setCampaigns(Array.isArray(c) ? c : (c.campaigns || []));
            setLists(Array.isArray(l) ? l : (l.lists || []));
            const allTemplates = Array.isArray(t) ? t : (t.templates || []);
            setTemplates(allTemplates.filter((tpl: any) => tpl.status === 'approved'));
        } catch { } finally { setLoading(false); }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        const url = editId ? `${API}/whatsapp/campaigns/${editId}` : `${API}/whatsapp/campaigns`;
        const res = await fetch(url, { method: editId ? 'PUT' : 'POST', headers, body: JSON.stringify(form) });
        if (res.ok) { toast.success(editId ? 'Campaña actualizada' : 'Campaña creada'); setShowForm(false); resetForm(); fetchAll(); }
        else toast.error((await res.json()).error);
    };

    const handleSend = async (id: string) => {
        if (!confirm('¿Enviar esta campaña ahora? Los mensajes se enviarán inmediatamente.')) return;
        setSending(id);
        try {
            const res = await fetch(`${API}/whatsapp/campaigns/${id}/send`, { method: 'POST', headers });
            const data = await res.json();
            if (data.success) toast.success(data.message);
            else toast.error(data.error);
            setTimeout(fetchAll, 3000);
        } catch { toast.error('Error al enviar'); } finally { setSending(null); }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('¿Eliminar esta campaña?')) return;
        await fetch(`${API}/whatsapp/campaigns/${id}`, { method: 'DELETE', headers });
        toast.success('Campaña eliminada'); fetchAll();
    };

    const openLogs = async (id: string) => {
        setViewLogs(id);
        const res = await fetch(`${API}/whatsapp/campaigns/${id}/logs`, { headers: { Authorization: `Bearer ${token}` } });
        setLogs(await res.json());
    };

    const resetForm = () => { setForm({ name: '', description: '', listId: '', templateId: '' }); setEditId(null); };
    const startEdit = (c: any) => {
        setForm({ name: c.name, description: c.description || '', listId: c.listId || '', templateId: c.templateId || '' });
        setEditId(c.id); setShowForm(true);
    };

    const statusBadge = (s: string) => {
        const map: any = {
            draft: { bg: 'bg-gray-100 text-gray-600', icon: <Edit3 className="w-3 h-3" />, label: 'Borrador' },
            sending: { bg: 'bg-blue-50 text-blue-700', icon: <Loader2 className="w-3 h-3 animate-spin" />, label: 'Enviando' },
            sent: { bg: 'bg-emerald-50 text-emerald-700', icon: <CheckCircle2 className="w-3 h-3" />, label: 'Enviada' },
            failed: { bg: 'bg-red-50 text-red-600', icon: <XCircle className="w-3 h-3" />, label: 'Fallida' },
            paused: { bg: 'bg-amber-50 text-amber-700', icon: <Clock className="w-3 h-3" />, label: 'Pausada' },
        };
        const m = map[s] || map.draft;
        return <span className={`flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold ${m.bg}`}>{m.icon}{m.label}</span>;
    };

    if (loading) return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>;

    return (
        <div>
            <div className="flex items-center justify-between mb-6">
                <p className="text-sm text-gray-500">{campaigns.length} campañas</p>
                <button onClick={() => { resetForm(); setShowForm(true); }}
                    className="flex items-center gap-2 bg-green-600 text-white px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-green-700 shadow-sm">
                    <Plus className="w-4 h-4" /> Nueva Campaña
                </button>
            </div>

            {showForm && (
                <div className="bg-white border border-gray-200 rounded-2xl p-5 mb-6 shadow-sm">
                    <form onSubmit={handleSave} className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required
                                placeholder="Nombre de la campaña" className="px-3 py-2.5 rounded-lg border border-gray-200 text-sm outline-none focus:border-green-500" />
                            <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                                placeholder="Descripción" className="px-3 py-2.5 rounded-lg border border-gray-200 text-sm outline-none focus:border-green-500" />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <select value={form.listId} onChange={e => setForm({ ...form, listId: e.target.value })}
                                className="px-3 py-2.5 rounded-lg border border-gray-200 text-sm bg-white outline-none focus:border-green-500">
                                <option value="">— Seleccionar lista —</option>
                                {lists.map(l => <option key={l.id} value={l.id}>{l.name} ({l.memberCount} contactos)</option>)}
                            </select>
                            <select value={form.templateId} onChange={e => setForm({ ...form, templateId: e.target.value })}
                                className="px-3 py-2.5 rounded-lg border border-gray-200 text-sm bg-white outline-none focus:border-green-500">
                                <option value="">— Seleccionar template —</option>
                                {templates.map(t => <option key={t.id} value={t.id}>{t.displayName} ({t.status})</option>)}
                            </select>
                        </div>
                        <div className="flex gap-2">
                            <button type="submit" className="bg-green-600 text-white px-5 py-2 rounded-lg font-bold text-sm hover:bg-green-700">
                                {editId ? 'Actualizar' : 'Crear Campaña'}
                            </button>
                            <button type="button" onClick={() => { setShowForm(false); resetForm(); }} className="text-gray-400 px-3"><X className="w-5 h-5" /></button>
                        </div>
                    </form>
                </div>
            )}

            {/* Campaigns Grid */}
            {campaigns.length === 0 ? (
                <div className="bg-white rounded-2xl border border-gray-100 p-16 text-center">
                    <Megaphone className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="font-bold text-gray-400">Sin campañas</p>
                    <p className="text-sm text-gray-400 mt-1">Crea tu primera campaña de WhatsApp</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {campaigns.map(c => (
                        <div key={c.id} className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm hover:shadow-md transition-shadow">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-4 flex-1">
                                    <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center text-green-600">
                                        <Megaphone className="w-5 h-5" />
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-1">
                                            <h3 className="font-bold text-gray-900">{c.name}</h3>
                                            {statusBadge(c.status)}
                                        </div>
                                        <div className="flex items-center gap-3 text-xs text-gray-500">
                                            {c.listName && <span>📋 {c.listName}</span>}
                                            {c.templateDisplayName && <span>📄 {c.templateDisplayName}</span>}
                                            {c.sentAt && <span>📅 {new Date(c.sentAt).toLocaleString()}</span>}
                                        </div>
                                    </div>
                                </div>

                                {c.status === 'sent' && (
                                    <div className="flex items-center gap-4 mr-4 text-xs">
                                        <div className="text-center"><p className="font-black text-gray-900">{c.totalContacts}</p><p className="text-gray-400">Total</p></div>
                                        <div className="text-center"><p className="font-black text-emerald-600">{c.sent}</p><p className="text-gray-400">Enviados</p></div>
                                        <div className="text-center"><p className="font-black text-blue-600">{c.delivered}</p><p className="text-gray-400">Entregados</p></div>
                                        <div className="text-center"><p className="font-black text-purple-600">{c.read}</p><p className="text-gray-400">Leídos</p></div>
                                        <div className="text-center"><p className="font-black text-red-600">{c.failed}</p><p className="text-gray-400">Fallidos</p></div>
                                    </div>
                                )}

                                <div className="flex items-center gap-1">
                                    {c.status === 'sent' && (
                                        <button onClick={() => openLogs(c.id)} className="p-2 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-600" title="Ver logs">
                                            <Eye className="w-4 h-4" />
                                        </button>
                                    )}
                                    {['draft', 'paused', 'failed'].includes(c.status) && (
                                        <>
                                            <button onClick={() => handleSend(c.id)} disabled={sending === c.id}
                                                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-green-600 text-white text-xs font-bold hover:bg-green-700 disabled:opacity-50">
                                                {sending === c.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />} Enviar
                                            </button>
                                            <button onClick={() => startEdit(c)} className="p-2 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-600"><Edit3 className="w-4 h-4" /></button>
                                        </>
                                    )}
                                    <button onClick={() => handleDelete(c.id)} className="p-2 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Logs Modal */}
            {viewLogs && (
                <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setViewLogs(null)}>
                    <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[80vh] overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="p-5 border-b border-gray-100 flex items-center justify-between">
                            <h3 className="font-bold text-gray-900">Log de Mensajes</h3>
                            <button onClick={() => setViewLogs(null)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
                        </div>
                        <div className="overflow-auto max-h-[60vh]">
                            <table className="w-full text-left text-sm">
                                <thead><tr className="border-b border-gray-100 text-xs text-gray-400 uppercase font-bold">
                                    <th className="p-3">Contacto</th><th className="p-3">Teléfono</th><th className="p-3">Estado</th><th className="p-3">Fecha</th>
                                </tr></thead>
                                <tbody className="divide-y divide-gray-50">
                                    {logs.map(l => (
                                        <tr key={l.id}>
                                            <td className="p-3 font-medium">{l.contactName || '—'}</td>
                                            <td className="p-3 text-xs font-mono">{l.phone}</td>
                                            <td className="p-3">{statusBadge(l.status)}</td>
                                            <td className="p-3 text-xs text-gray-500">{new Date(l.createdAt).toLocaleString()}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default WhatsAppCampaigns;
