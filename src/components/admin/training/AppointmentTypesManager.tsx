import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../../hooks/useAuth';
import { Loader2, Plus, Trash2, Pencil, Clock, Video, Tag } from 'lucide-react';
import { toast } from 'sonner';

const API = import.meta.env.VITE_API_URL || '/api';
const MODALITIES = ['videollamada', 'telefonica', 'presencial'];

const empty = { name: '', description: '', durationMin: 45, modality: 'videollamada', prerequisites: '', price: '', color: '#2563eb', responsibleId: '', sortOrder: 0 };

const AppointmentTypesManager: React.FC = () => {
    const { token } = useAuth();
    const H = useMemo(() => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }), [token]);
    const [types, setTypes] = useState<any[]>([]);
    const [responsibles, setResponsibles] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState<any>(null);

    const load = async () => {
        setLoading(true);
        const [t, r] = await Promise.all([
            fetch(`${API}/training/types`, { headers: H }).then(r => r.json()),
            fetch(`${API}/training/admin/responsibles`, { headers: H }).then(r => r.json()),
        ]);
        setTypes(t.types || []); setResponsibles(r.responsibles || []); setLoading(false);
    };
    useEffect(() => { load(); }, [H]);

    const save = async () => {
        if (!editing.name) { toast.error('Nombre requerido'); return; }
        const isNew = !editing.id;
        const url = isNew ? `${API}/training/admin/types` : `${API}/training/admin/types/${editing.id}`;
        const res = await fetch(url, { method: isNew ? 'POST' : 'PUT', headers: H, body: JSON.stringify(editing) });
        if (res.ok) { toast.success('Tipo guardado'); setEditing(null); load(); } else toast.error('Error al guardar');
    };
    const del = async (id: string) => {
        if (!confirm('¿Desactivar este tipo de cita?')) return;
        await fetch(`${API}/training/admin/types/${id}`, { method: 'DELETE', headers: H }); load();
    };

    if (loading) return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-gray-300" /></div>;

    return (
        <div>
            <div className="flex justify-between items-center mb-4">
                <p className="text-sm text-gray-500">Define los servicios reservables: capacitación inicial, soporte técnico, correo, ecommerce, IA, etc.</p>
                <button onClick={() => setEditing({ ...empty })} className="inline-flex items-center gap-1 px-4 py-2 rounded-xl bg-indigo-600 text-white font-bold text-sm"><Plus className="w-4 h-4" />Nuevo tipo</button>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {types.map(t => (
                    <div key={t.id} className={`rounded-2xl border p-4 ${t.active ? 'bg-white border-gray-100' : 'bg-gray-50 border-gray-100 opacity-60'}`}>
                        <div className="flex items-start justify-between mb-2">
                            <div className="flex items-center gap-2">
                                <span className="w-3 h-3 rounded-full" style={{ background: t.color }} />
                                <span className="font-black text-gray-900">{t.name}</span>
                            </div>
                            <div className="flex gap-1">
                                <button onClick={() => setEditing({ ...t, price: t.price ?? '', responsibleId: t.responsibleId ?? '' })} className="p-1.5 text-gray-400 hover:bg-gray-50 rounded-lg"><Pencil className="w-4 h-4" /></button>
                                <button onClick={() => del(t.id)} className="p-1.5 text-red-400 hover:bg-red-50 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                            </div>
                        </div>
                        {t.description && <p className="text-xs text-gray-500 line-clamp-2 mb-2">{t.description}</p>}
                        <div className="flex items-center gap-3 text-[11px] text-gray-400 font-semibold">
                            <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{t.durationMin}m</span>
                            <span className="flex items-center gap-1"><Video className="w-3 h-3" />{t.modality}</span>
                            {t.price ? <span className="text-amber-600 flex items-center gap-1"><Tag className="w-3 h-3" />${t.price}</span> : <span className="text-emerald-600">Incluido</span>}
                        </div>
                        {t.responsible?.name && <div className="text-[11px] text-gray-400 mt-1.5">{t.responsible.name}</div>}
                    </div>
                ))}
            </div>

            {editing && (
                <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setEditing(null)}>
                    <div className="bg-white rounded-3xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                        <h3 className="text-lg font-black text-gray-900 mb-4">{editing.id ? 'Editar' : 'Nuevo'} tipo de cita</h3>
                        <div className="space-y-3">
                            <input placeholder="Nombre" value={editing.name} onChange={e => setEditing((s: any) => ({ ...s, name: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm" />
                            <textarea placeholder="Descripción" value={editing.description || ''} onChange={e => setEditing((s: any) => ({ ...s, description: e.target.value }))} rows={2} className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm resize-none" />
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs font-semibold text-gray-500">Duración (min)</label>
                                    <input type="number" value={editing.durationMin} onChange={e => setEditing((s: any) => ({ ...s, durationMin: Number(e.target.value) }))} className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm" />
                                </div>
                                <div>
                                    <label className="text-xs font-semibold text-gray-500">Modalidad</label>
                                    <select value={editing.modality} onChange={e => setEditing((s: any) => ({ ...s, modality: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm">
                                        {MODALITIES.map(m => <option key={m} value={m}>{m}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-xs font-semibold text-gray-500">Precio (vacío = incluido)</label>
                                    <input type="number" value={editing.price} onChange={e => setEditing((s: any) => ({ ...s, price: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm" />
                                </div>
                                <div>
                                    <label className="text-xs font-semibold text-gray-500">Color</label>
                                    <input type="color" value={editing.color} onChange={e => setEditing((s: any) => ({ ...s, color: e.target.value }))} className="w-full h-9 rounded-xl border border-gray-200" />
                                </div>
                            </div>
                            <input placeholder="Requisitos previos (opcional)" value={editing.prerequisites || ''} onChange={e => setEditing((s: any) => ({ ...s, prerequisites: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm" />
                            <div>
                                <label className="text-xs font-semibold text-gray-500">Responsable</label>
                                <select value={editing.responsibleId || ''} onChange={e => setEditing((s: any) => ({ ...s, responsibleId: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm">
                                    <option value="">Sin asignar</option>
                                    {responsibles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                                </select>
                            </div>
                        </div>
                        <div className="flex justify-end gap-2 mt-5">
                            <button onClick={() => setEditing(null)} className="px-4 py-2 rounded-xl text-gray-500 font-semibold">Cancelar</button>
                            <button onClick={save} className="px-5 py-2 rounded-xl bg-indigo-600 text-white font-bold">Guardar</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AppointmentTypesManager;
