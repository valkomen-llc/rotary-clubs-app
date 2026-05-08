import React, { useState, useEffect } from 'react';
import { useAuth } from '../../../hooks/useAuth';
import { FileText, Plus, Trash2, Edit3, RefreshCw, Loader2, X, CheckCircle2, Clock, XCircle } from 'lucide-react';
import { toast } from 'sonner';

const API = import.meta.env.VITE_API_URL || '/api';

const WhatsAppTemplates: React.FC = () => {
    const { token } = useAuth();
    const [templates, setTemplates] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [showForm, setShowForm] = useState(false);
    const [editId, setEditId] = useState<string | null>(null);
    const [form, setForm] = useState({ name: '', displayName: '', bodyText: '', category: 'MARKETING', language: 'es', footerText: '' });
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

    useEffect(() => { fetchTemplates(); }, []);

    const fetchTemplates = async () => {
        setLoading(true);
        try {
            const res = await fetch(`${API}/whatsapp/templates`, { headers: { Authorization: `Bearer ${token}` } });
            setTemplates(await res.json());
        } catch { } finally { setLoading(false); }
    };

    const handleSync = async () => {
        setSyncing(true);
        try {
            const res = await fetch(`${API}/whatsapp/templates/sync`, { method: 'POST', headers });
            const data = await res.json();
            if (data.success) { toast.success(`${data.synced} templates sincronizados`); fetchTemplates(); }
            else toast.error(data.error);
        } catch { toast.error('Error de conexión'); } finally { setSyncing(false); }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        const url = editId ? `${API}/whatsapp/templates/${editId}` : `${API}/whatsapp/templates`;
        const res = await fetch(url, { method: editId ? 'PUT' : 'POST', headers, body: JSON.stringify(form) });
        if (res.ok) { toast.success(editId ? 'Template actualizado' : 'Template creado'); setShowForm(false); resetForm(); fetchTemplates(); }
        else toast.error((await res.json()).error);
    };

    const handleDelete = async (id: string) => {
        if (!confirm('¿Eliminar este template?')) return;
        await fetch(`${API}/whatsapp/templates/${id}`, { method: 'DELETE', headers });
        toast.success('Template eliminado'); fetchTemplates();
    };

    const resetForm = () => { setForm({ name: '', displayName: '', bodyText: '', category: 'MARKETING', language: 'es', footerText: '' }); setEditId(null); };
    const startEdit = (t: any) => {
        setForm({ name: t.name, displayName: t.displayName, bodyText: t.bodyText || '', category: t.category, language: t.language, footerText: t.footerText || '' });
        setEditId(t.id); setShowForm(true);
    };

    const statusIcon = (s: string) => {
        if (s === 'approved' || s === 'APPROVED') return <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full"><CheckCircle2 className="w-3 h-3" />Aprobado</span>;
        if (s === 'rejected' || s === 'REJECTED') return <span className="flex items-center gap-1 text-[10px] font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-full"><XCircle className="w-3 h-3" />Rechazado</span>;
        return <span className="flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full"><Clock className="w-3 h-3" />Pendiente</span>;
    };

    if (loading) return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>;

    return (
        <div>
            <div className="flex items-center justify-between mb-6">
                <p className="text-sm text-gray-500">{templates.length} templates</p>
                <div className="flex gap-2">
                    <button onClick={handleSync} disabled={syncing}
                        className="flex items-center gap-2 border border-gray-200 text-gray-700 px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-gray-50 disabled:opacity-50">
                        <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} /> Sincronizar desde Meta
                    </button>
                    <button onClick={() => { resetForm(); setShowForm(true); }}
                        className="flex items-center gap-2 bg-green-600 text-white px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-green-700 shadow-sm">
                        <Plus className="w-4 h-4" /> Nuevo Template
                    </button>
                </div>
            </div>

            {showForm && (
                <div className="bg-white border border-gray-200 rounded-2xl p-5 mb-6 shadow-sm">
                    <form onSubmit={handleSave} className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required
                                placeholder="Nombre técnico (sin espacios)" className="px-3 py-2.5 rounded-lg border border-gray-200 text-sm outline-none focus:border-green-500" />
                            <input value={form.displayName} onChange={e => setForm({ ...form, displayName: e.target.value })} required
                                placeholder="Nombre para mostrar" className="px-3 py-2.5 rounded-lg border border-gray-200 text-sm outline-none focus:border-green-500" />
                        </div>
                        <textarea value={form.bodyText} onChange={e => setForm({ ...form, bodyText: e.target.value })} required rows={4}
                            placeholder="Texto del mensaje. Usa {{1}}, {{2}} para variables."
                            className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm outline-none focus:border-green-500 resize-none" />
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}
                                className="px-3 py-2.5 rounded-lg border border-gray-200 text-sm bg-white outline-none">
                                <option value="MARKETING">Marketing</option>
                                <option value="UTILITY">Utility</option>
                                <option value="AUTHENTICATION">Authentication</option>
                            </select>
                            <select value={form.language} onChange={e => setForm({ ...form, language: e.target.value })}
                                className="px-3 py-2.5 rounded-lg border border-gray-200 text-sm bg-white outline-none">
                                <option value="es">Español</option><option value="en">English</option><option value="pt_BR">Português</option>
                            </select>
                            <input value={form.footerText} onChange={e => setForm({ ...form, footerText: e.target.value })}
                                placeholder="Footer (opcional)" className="px-3 py-2.5 rounded-lg border border-gray-200 text-sm outline-none focus:border-green-500" />
                        </div>
                        <div className="flex gap-2">
                            <button type="submit" className="bg-green-600 text-white px-5 py-2 rounded-lg font-bold text-sm hover:bg-green-700">
                                {editId ? 'Actualizar' : 'Crear Template'}
                            </button>
                            <button type="button" onClick={() => { setShowForm(false); resetForm(); }} className="text-gray-400 px-3"><X className="w-5 h-5" /></button>
                        </div>
                    </form>
                </div>
            )}

            {templates.length === 0 ? (
                <div className="bg-white rounded-2xl border border-gray-100 p-16 text-center">
                    <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="font-bold text-gray-400">Sin templates</p>
                    <p className="text-sm text-gray-400 mt-1">Sincroniza desde Meta o crea uno nuevo</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {templates.map(t => (
                        <div key={t.id} className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm hover:shadow-md transition-shadow group">
                            <div className="flex items-start justify-between mb-3">
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <h3 className="font-bold text-gray-900">{t.displayName}</h3>
                                        {statusIcon(t.status)}
                                    </div>
                                    <p className="text-[10px] text-gray-400 font-mono">{t.name} · {t.language} · {t.category}</p>
                                </div>
                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={() => startEdit(t)} className="p-1.5 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-600"><Edit3 className="w-3.5 h-3.5" /></button>
                                    <button onClick={() => handleDelete(t.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
                                </div>
                            </div>
                            <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-600 whitespace-pre-wrap line-clamp-3">
                                {t.bodyText}
                            </div>
                            {t.footerText && <p className="text-[10px] text-gray-400 mt-2">Footer: {t.footerText}</p>}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default WhatsAppTemplates;
