import React, { useState, useEffect } from 'react';
import { useAuth } from '../../../../hooks/useAuth';
import { List, Plus, Trash2, Edit3, X, Loader2, Users, ListPlus } from 'lucide-react';
import { toast } from 'sonner';

const API = import.meta.env.VITE_API_URL || '/api';

export default function ListsManager({ onViewDetails }: { onViewDetails?: (id: string) => void }) {
    const { token } = useAuth();
    const [lists, setLists] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editId, setEditId] = useState<string | null>(null);
    const [form, setForm] = useState({ name: '', description: '', color: '#3B82F6' });
    // Creación masiva (importar listados por nombre)
    const [showBulk, setShowBulk] = useState(false);
    const [bulkText, setBulkText] = useState('');
    const [bulkColor, setBulkColor] = useState('#3B82F6');
    const [bulkLoading, setBulkLoading] = useState(false);
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

    // Un nombre de lista por línea (soporta pegado de una columna de Excel). Deduplica y
    // limpia vacíos para la vista previa; el backend vuelve a deduplicar y omite existentes.
    const parseBulkNames = (text: string): string[] => {
        const seen = new Set<string>();
        const out: string[] = [];
        for (const line of text.split(/\r?\n/)) {
            const name = line.trim();
            if (!name) continue;
            const key = name.toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            out.push(name);
        }
        return out;
    };

    useEffect(() => { fetchLists(); }, []);

    const fetchLists = async () => {
        setLoading(true);
        try {
            const res = await fetch(`${API}/crm/lists`, { headers });
            if (res.ok) setLists(await res.json());
        } catch (err) { toast.error('Error cargando listas'); } finally { setLoading(false); }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        const url = editId ? `${API}/crm/lists/${editId}` : `${API}/crm/lists`;
        const res = await fetch(url, { method: editId ? 'PUT' : 'POST', headers, body: JSON.stringify(form) });
        if (res.ok) { toast.success(editId ? 'Lista actualizada' : 'Lista creada'); setShowForm(false); resetForm(); fetchLists(); }
        else toast.error((await res.json()).error);
    };

    const handleBulkCreate = async () => {
        const names = parseBulkNames(bulkText);
        if (names.length === 0) { toast.error('Pega al menos un nombre de lista (uno por línea)'); return; }
        setBulkLoading(true);
        try {
            const res = await fetch(`${API}/crm/lists/bulk`, {
                method: 'POST', headers,
                body: JSON.stringify({ names, color: bulkColor })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Error creando listas');
            const { created, skipped } = data.summary || {};
            toast.success(`${created} lista${created === 1 ? '' : 's'} creada${created === 1 ? '' : 's'}${skipped ? ` · ${skipped} ya existían (omitidas)` : ''}`);
            setShowBulk(false); setBulkText(''); setBulkColor('#3B82F6');
            fetchLists();
        } catch (err: any) {
            toast.error(err.message || 'Error creando listas');
        } finally {
            setBulkLoading(false);
        }
    };

    const handleDelete = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        if (!confirm('¿Eliminar esta lista? Se mantendrán los contactos pero perderán la asociación.')) return;
        await fetch(`${API}/crm/lists/${id}`, { method: 'DELETE', headers });
        toast.success('Lista eliminada'); fetchLists();
    };

    const resetForm = () => { setForm({ name: '', description: '', color: '#3B82F6' }); setEditId(null); };
    const startEdit = (e: React.MouseEvent, l: any) => {
        e.stopPropagation();
        setForm({ name: l.name, description: l.description || '', color: l.color });
        setEditId(l.id); setShowForm(true);
    };

    const colors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316', '#64748B'];

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden p-6">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h2 className="text-lg font-bold text-gray-900">Listas Estáticas</h2>
                    <p className="text-sm text-gray-500">Agrupa contactos manualmente en listas fijas (Ej: Asistentes Evento 2024)</p>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={() => { setShowForm(false); setShowBulk(v => !v); }}
                        className="flex items-center gap-2 bg-white border border-gray-200 text-gray-700 px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-gray-50 transition-colors">
                        <ListPlus className="w-4 h-4" /> Importar listas
                    </button>
                    <button onClick={() => { setShowBulk(false); resetForm(); setShowForm(true); }}
                        className="flex items-center gap-2 bg-rotary-blue text-white px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-sky-800 transition-colors">
                        <Plus className="w-4 h-4" /> Nueva Lista
                    </button>
                </div>
            </div>

            {showBulk && (() => {
                const detected = parseBulkNames(bulkText);
                return (
                    <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 mb-6">
                        <div className="flex items-start justify-between mb-3">
                            <div>
                                <h3 className="text-sm font-bold text-gray-900">Importar listas por nombre</h3>
                                <p className="text-xs text-gray-500 mt-0.5">
                                    Escribe o pega <span className="font-bold">un nombre de lista por línea</span> (por ejemplo, una columna copiada de Excel). Se crean vacías, listas para llenarlas después. Las que ya existan se omiten.
                                </p>
                            </div>
                            <button type="button" onClick={() => { setShowBulk(false); setBulkText(''); }} className="p-1 text-gray-400 hover:text-gray-600">
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                        <textarea
                            value={bulkText}
                            onChange={e => setBulkText(e.target.value)}
                            placeholder={"Presidentes, Rotary 4281 (2026-27)\nMembresía, Rotary 4281 (2026-27)\nFundación Rotaria, Rotary 4281 (2026-27)\nImagen Pública, Rotary 4281 (2026-27)"}
                            className="w-full h-44 p-3 rounded-lg border border-gray-200 text-sm font-mono focus:ring-2 focus:ring-rotary-blue outline-none resize-none"
                        />
                        <div className="flex items-center gap-4 mt-3 flex-wrap">
                            <span className="text-xs font-bold text-gray-500">Color para todas:</span>
                            <div className="flex gap-2">
                                {colors.map(c => (
                                    <button key={c} type="button" onClick={() => setBulkColor(c)}
                                        className={`w-6 h-6 rounded-full transition-transform ${bulkColor === c ? 'ring-2 ring-offset-2 ring-gray-800 scale-110' : ''}`}
                                        style={{ backgroundColor: c }} />
                                ))}
                            </div>
                        </div>
                        <div className="flex items-center justify-between gap-2 pt-4 mt-4 border-t border-gray-200">
                            <span className="text-xs text-gray-500">
                                {detected.length > 0
                                    ? <><span className="font-bold text-gray-800">{detected.length}</span> lista{detected.length === 1 ? '' : 's'} detectada{detected.length === 1 ? '' : 's'}</>
                                    : 'Aún no hay nombres válidos'}
                            </span>
                            <div className="flex gap-2">
                                <button type="button" onClick={() => { setShowBulk(false); setBulkText(''); }} className="px-5 py-2 rounded-lg font-bold text-sm text-gray-600 hover:bg-gray-200">
                                    Cancelar
                                </button>
                                <button type="button" onClick={handleBulkCreate} disabled={bulkLoading || detected.length === 0}
                                    className="flex items-center gap-2 bg-rotary-blue text-white px-5 py-2 rounded-lg font-bold text-sm hover:bg-sky-800 disabled:opacity-50">
                                    {bulkLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ListPlus className="w-4 h-4" />}
                                    Crear {detected.length > 0 ? detected.length : ''} lista{detected.length === 1 ? '' : 's'}
                                </button>
                            </div>
                        </div>
                    </div>
                );
            })()}

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
                            <span className="text-xs font-bold text-gray-500">Color Distintivo:</span>
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
                                {editId ? 'Guardar Cambios' : 'Crear Lista'}
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
            ) : lists.length === 0 ? (
                <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-xl">
                    <List className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <h3 className="font-bold text-gray-900">Aún no hay listas</h3>
                    <p className="text-sm text-gray-500 mt-1">Crea tu primera lista para empezar a organizar contactos</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {lists.map((l: any) => (
                        <div key={l.id} 
                             onClick={() => onViewDetails && onViewDetails(l.id)}
                             className={`border border-gray-100 rounded-xl p-5 hover:border-gray-300 transition-colors group ${onViewDetails ? 'cursor-pointer hover:shadow-md' : ''}`}>
                            <div className="flex justify-between items-start mb-3">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${l.color}20`, color: l.color }}>
                                        <List className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-gray-900 group-hover:text-rotary-blue transition-colors">{l.name}</h4>
                                        <p className="text-xs text-gray-500">{l.description || 'Sin descripción'}</p>
                                    </div>
                                </div>
                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={(e) => startEdit(e, l)} className="p-1.5 text-gray-400 hover:text-rotary-blue"><Edit3 className="w-4 h-4" /></button>
                                    <button onClick={(e) => handleDelete(e, l.id)} className="p-1.5 text-gray-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                                </div>
                            </div>
                            <div className="flex items-center gap-2 text-sm text-gray-600 bg-gray-50 px-3 py-2 rounded-lg">
                                <Users className="w-4 h-4 text-gray-400" />
                                <span className="font-bold">{l._count?.members || 0}</span> contactos
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
