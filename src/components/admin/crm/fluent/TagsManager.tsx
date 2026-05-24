import React, { useState, useEffect } from 'react';
import { useAuth } from '../../../../hooks/useAuth';
import { Tag, Plus, Trash2, Edit3, X, Loader2, Users } from 'lucide-react';
import { toast } from 'sonner';

const API = import.meta.env.VITE_API_URL || '/api';

export default function TagsManager({ onViewDetails }: { onViewDetails?: (id: string) => void }) {
    const { token } = useAuth();
    const [tags, setTags] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editId, setEditId] = useState<string | null>(null);
    const [form, setForm] = useState({ name: '', description: '', color: '#10B981' });
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

    useEffect(() => { fetchTags(); }, []);

    const fetchTags = async () => {
        setLoading(true);
        try {
            const res = await fetch(`${API}/crm/tags`, { headers });
            if (res.ok) setTags(await res.json());
        } catch (err) { toast.error('Error cargando etiquetas'); } finally { setLoading(false); }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        const url = editId ? `${API}/crm/tags/${editId}` : `${API}/crm/tags`;
        const res = await fetch(url, { method: editId ? 'PUT' : 'POST', headers, body: JSON.stringify(form) });
        if (res.ok) { toast.success(editId ? 'Etiqueta actualizada' : 'Etiqueta creada'); setShowForm(false); resetForm(); fetchTags(); }
        else toast.error((await res.json()).error);
    };

    const handleDelete = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        if (!confirm('¿Eliminar esta etiqueta? Los contactos la perderán pero no serán borrados.')) return;
        await fetch(`${API}/crm/tags/${id}`, { method: 'DELETE', headers });
        toast.success('Etiqueta eliminada'); fetchTags();
    };

    const resetForm = () => { setForm({ name: '', description: '', color: '#10B981' }); setEditId(null); };
    const startEdit = (e: React.MouseEvent, t: any) => {
        e.stopPropagation();
        setForm({ name: t.name, description: t.description || '', color: t.color });
        setEditId(t.id); setShowForm(true);
    };

    const colors = ['#10B981', '#3B82F6', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316', '#64748B'];

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden p-6">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h2 className="text-lg font-bold text-gray-900">Etiquetas (Tags)</h2>
                    <p className="text-sm text-gray-500">Categoriza contactos dinámicamente (Ej: VIP, Cliente Potencial, Socio)</p>
                </div>
                <button onClick={() => { resetForm(); setShowForm(true); }}
                    className="flex items-center gap-2 bg-rotary-blue text-white px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-sky-800 transition-colors">
                    <Plus className="w-4 h-4" /> Nueva Etiqueta
                </button>
            </div>

            {showForm && (
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 mb-6">
                    <form onSubmit={handleSave} className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 mb-1">Nombre *</label>
                                <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required
                                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-rotary-blue outline-none" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 mb-1">Descripción</label>
                                <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-rotary-blue outline-none" />
                            </div>
                        </div>
                        <div className="flex items-center gap-4">
                            <span className="text-xs font-bold text-gray-500">Color:</span>
                            <div className="flex gap-2">
                                {colors.map(c => (
                                    <button key={c} type="button" onClick={() => setForm({ ...form, color: c })}
                                        className={`w-6 h-6 rounded-full transition-transform ${form.color === c ? 'ring-2 ring-offset-2 ring-gray-800 scale-110' : ''}`}
                                        style={{ backgroundColor: c }} />
                                ))}
                            </div>
                        </div>
                        <div className="flex gap-2 pt-2">
                            <button type="submit" className="bg-rotary-blue text-white px-5 py-2 rounded-lg font-bold text-sm hover:bg-sky-800">
                                {editId ? 'Guardar Cambios' : 'Crear Etiqueta'}
                            </button>
                            <button type="button" onClick={() => { setShowForm(false); resetForm(); }} className="px-5 py-2 rounded-lg font-bold text-sm text-gray-600 hover:bg-gray-200">
                                Cancelar
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {loading ? (
                <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
            ) : tags.length === 0 ? (
                <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-xl">
                    <Tag className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <h3 className="font-bold text-gray-900">Aún no hay etiquetas</h3>
                    <p className="text-sm text-gray-500 mt-1">Crea tu primera etiqueta para perfilar a tus contactos</p>
                </div>
            ) : (
                <div className="flex flex-wrap gap-3">
                    {tags.map((t: any) => (
                        <div key={t.id} 
                             onClick={() => onViewDetails && onViewDetails(t.id)}
                             className={`border border-gray-100 rounded-full pl-4 pr-1.5 py-1.5 flex items-center gap-3 bg-white hover:border-gray-300 transition-colors group shadow-sm ${onViewDetails ? 'cursor-pointer hover:shadow-md' : ''}`}>
                            <div className="flex items-center gap-2">
                                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: t.color }}></div>
                                <span className="font-bold text-sm text-gray-800 group-hover:text-rotary-blue transition-colors">{t.name}</span>
                                <span className="text-xs text-gray-400 ml-2">({t._count?.contacts || 0})</span>
                            </div>
                            <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity ml-2">
                                <button onClick={(e) => startEdit(e, t)} className="p-1.5 text-gray-400 hover:text-rotary-blue rounded-full hover:bg-gray-100"><Edit3 className="w-3.5 h-3.5" /></button>
                                <button onClick={(e) => handleDelete(e, t.id)} className="p-1.5 text-gray-400 hover:text-red-500 rounded-full hover:bg-gray-100"><Trash2 className="w-3.5 h-3.5" /></button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
