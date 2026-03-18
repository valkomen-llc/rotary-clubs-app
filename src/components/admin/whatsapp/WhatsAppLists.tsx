import React, { useState, useEffect } from 'react';
import { useAuth } from '../../../hooks/useAuth';
import { List, Plus, Trash2, Edit3, X, Loader2, UserPlus, UserMinus } from 'lucide-react';
import { toast } from 'sonner';

const API = import.meta.env.VITE_API_URL || '/api';

const WhatsAppLists: React.FC = () => {
    const { token } = useAuth();
    const [lists, setLists] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editId, setEditId] = useState<string | null>(null);
    const [form, setForm] = useState({ name: '', description: '', color: '#3B82F6' });
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

    useEffect(() => { fetchLists(); }, []);

    const fetchLists = async () => {
        setLoading(true);
        try {
            const res = await fetch(`${API}/whatsapp/lists`, { headers: { Authorization: `Bearer ${token}` } });
            const data = await res.json();
            const listArr = Array.isArray(data) ? data : (data.lists || []);
            setLists(listArr);
        } catch (err) { console.error('fetchLists error:', err); } finally { setLoading(false); }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        const url = editId ? `${API}/whatsapp/lists/${editId}` : `${API}/whatsapp/lists`;
        const res = await fetch(url, { method: editId ? 'PUT' : 'POST', headers, body: JSON.stringify(form) });
        if (res.ok) { toast.success(editId ? 'Lista actualizada' : 'Lista creada'); setShowForm(false); resetForm(); fetchLists(); }
        else toast.error((await res.json()).error);
    };

    const handleDelete = async (id: string) => {
        if (!confirm('¿Eliminar esta lista?')) return;
        await fetch(`${API}/whatsapp/lists/${id}`, { method: 'DELETE', headers });
        toast.success('Lista eliminada'); fetchLists();
    };

    const resetForm = () => { setForm({ name: '', description: '', color: '#3B82F6' }); setEditId(null); };
    const startEdit = (l: any) => {
        setForm({ name: l.name, description: l.description || '', color: l.color });
        setEditId(l.id); setShowForm(true);
    };

    const colors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316'];

    return (
        <div>
            <div className="flex items-center justify-between mb-6">
                <p className="text-sm text-gray-500">{lists.length} listas de contacto</p>
                <button onClick={() => { resetForm(); setShowForm(true); }}
                    className="flex items-center gap-2 bg-green-600 text-white px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-green-700 shadow-sm">
                    <Plus className="w-4 h-4" /> Nueva Lista
                </button>
            </div>

            {showForm && (
                <div className="bg-white border border-gray-200 rounded-2xl p-5 mb-6 shadow-sm">
                    <form onSubmit={handleSave} className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required
                                placeholder="Nombre de la lista" className="px-3 py-2.5 rounded-lg border border-gray-200 text-sm outline-none focus:border-green-500" />
                            <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                                placeholder="Descripción (opcional)" className="px-3 py-2.5 rounded-lg border border-gray-200 text-sm outline-none focus:border-green-500" />
                        </div>
                        <div className="flex items-center gap-4">
                            <span className="text-xs font-bold text-gray-500 uppercase">Color:</span>
                            {colors.map(c => (
                                <button key={c} type="button" onClick={() => setForm({ ...form, color: c })}
                                    className={`w-7 h-7 rounded-full border-2 transition-all ${form.color === c ? 'border-gray-800 scale-110' : 'border-transparent'}`}
                                    style={{ backgroundColor: c }} />
                            ))}
                        </div>
                        <div className="flex gap-2">
                            <button type="submit" className="bg-green-600 text-white px-5 py-2 rounded-lg font-bold text-sm hover:bg-green-700">
                                {editId ? 'Actualizar' : 'Crear Lista'}
                            </button>
                            <button type="button" onClick={() => { setShowForm(false); resetForm(); }} className="text-gray-400 hover:text-gray-600 px-3"><X className="w-5 h-5" /></button>
                        </div>
                    </form>
                </div>
            )}

            {loading ? (
                <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
            ) : lists.length === 0 ? (
                <div className="bg-white rounded-2xl border border-gray-100 p-16 text-center">
                    <List className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="font-bold text-gray-400">Sin listas</p>
                    <p className="text-sm text-gray-400 mt-1">Crea listas para segmentar tus contactos</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {lists.map(l => (
                        <div key={l.id} className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm hover:shadow-md transition-shadow group">
                            <div className="flex items-start justify-between mb-3">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: l.color + '20', color: l.color }}>
                                        <List className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-gray-900">{l.name}</h3>
                                        {l.description && <p className="text-xs text-gray-500 mt-0.5">{l.description}</p>}
                                    </div>
                                </div>
                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={() => startEdit(l)} className="p-1.5 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-600"><Edit3 className="w-3.5 h-3.5" /></button>
                                    <button onClick={() => handleDelete(l.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
                                </div>
                            </div>
                            <div className="flex items-center justify-between pt-3 border-t border-gray-50">
                                <span className="text-sm font-bold" style={{ color: l.color }}>{l.memberCount || 0} contactos</span>
                                <span className="text-[10px] text-gray-400">{new Date(l.createdAt).toLocaleDateString()}</span>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default WhatsAppLists;
