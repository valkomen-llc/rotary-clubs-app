import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '../../../hooks/useAuth';
import {
    Loader2, Plus, Trash2, Pencil, Clock, Video, Tag, ChevronDown, ChevronRight,
    GripVertical, Layers, Sparkles, FolderPlus
} from 'lucide-react';
import { toast } from 'sonner';

const API = import.meta.env.VITE_API_URL || '/api';
const MODALITIES = ['videollamada', 'telefonica', 'presencial'];
const EMOJI_CHOICES = ['🚀', '🌐', '🤖', '📱', '❤️', '🛒', '📅', '👥', '📊', '🎓', '🛠', '💡', '🔧', '⭐', '📈', '🎯'];

const emptyCat = { name: '', description: '', emoji: '🚀', color: '#4f46e5' };
const emptyType = { name: '', description: '', categoryId: '', durationMin: 45, modality: 'videollamada', prerequisites: '', price: '', color: '#2563eb', responsibleId: '' };

const AppointmentTypesManager: React.FC = () => {
    const { token } = useAuth();
    const H = useMemo(() => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }), [token]);
    const [categories, setCategories] = useState<any[]>([]);
    const [types, setTypes] = useState<any[]>([]);
    const [responsibles, setResponsibles] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [seeding, setSeeding] = useState(false);
    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    const [editingCat, setEditingCat] = useState<any>(null);
    const [editingType, setEditingType] = useState<any>(null);

    const dragCat = useRef<string | null>(null);
    const dragType = useRef<string | null>(null);

    const load = async () => {
        setLoading(true);
        const [c, t, r] = await Promise.all([
            fetch(`${API}/training/admin/categories`, { headers: H }).then(r => r.json()),
            fetch(`${API}/training/types`, { headers: H }).then(r => r.json()),
            fetch(`${API}/training/admin/responsibles`, { headers: H }).then(r => r.json()),
        ]);
        setCategories(c.categories || []);
        setTypes(t.types || []);
        setResponsibles(r.responsibles || []);
        setExpanded(new Set((c.categories || []).map((x: any) => x.id)));
        setLoading(false);
    };
    useEffect(() => { load(); }, [H]);

    const typesByCat = useMemo(() => {
        const map: Record<string, any[]> = { __none__: [] };
        for (const c of categories) map[c.id] = [];
        for (const t of [...types].sort((a, b) => a.sortOrder - b.sortOrder)) {
            const k = t.categoryId && map[t.categoryId] ? t.categoryId : '__none__';
            map[k].push(t);
        }
        return map;
    }, [categories, types]);

    const toggle = (id: string) => setExpanded(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

    // ── Persistencia ──
    const saveCat = async () => {
        if (!editingCat.name) { toast.error('Nombre requerido'); return; }
        const isNew = !editingCat.id;
        const res = await fetch(`${API}/training/admin/categories${isNew ? '' : '/' + editingCat.id}`, { method: isNew ? 'POST' : 'PUT', headers: H, body: JSON.stringify(editingCat) });
        if (res.ok) { toast.success('Categoría guardada'); setEditingCat(null); load(); } else toast.error('Error al guardar');
    };
    const delCat = async (id: string) => {
        if (!confirm('¿Eliminar esta categoría? Sus servicios quedarán "Sin categoría" (no se borran).')) return;
        await fetch(`${API}/training/admin/categories/${id}`, { method: 'DELETE', headers: H }); load();
    };
    const saveType = async () => {
        if (!editingType.name) { toast.error('Nombre requerido'); return; }
        const isNew = !editingType.id;
        const res = await fetch(`${API}/training/admin/types${isNew ? '' : '/' + editingType.id}`, { method: isNew ? 'POST' : 'PUT', headers: H, body: JSON.stringify(editingType) });
        if (res.ok) { toast.success('Servicio guardado'); setEditingType(null); load(); } else toast.error('Error al guardar');
    };
    const delType = async (id: string) => {
        if (!confirm('¿Desactivar este servicio? El historial de citas no se ve afectado.')) return;
        await fetch(`${API}/training/admin/types/${id}`, { method: 'DELETE', headers: H }); load();
    };
    const seed = async () => {
        setSeeding(true);
        const res = await fetch(`${API}/training/admin/catalog/seed`, { method: 'POST', headers: H, body: '{}' });
        setSeeding(false);
        if (res.ok) { const d = await res.json(); toast.success(`Catálogo cargado: ${d.createdCategories} categorías, ${d.createdServices} servicios`); load(); }
        else toast.error('No se pudo cargar el catálogo');
    };

    // ── Drag & drop de categorías ──
    const onDropCat = async (targetId: string) => {
        const src = dragCat.current; dragCat.current = null;
        if (!src || src === targetId) return;
        const list = [...categories];
        const from = list.findIndex(c => c.id === src);
        const to = list.findIndex(c => c.id === targetId);
        if (from < 0 || to < 0) return;
        const [moved] = list.splice(from, 1);
        list.splice(to, 0, moved);
        setCategories(list);
        await fetch(`${API}/training/admin/categories/reorder`, { method: 'POST', headers: H, body: JSON.stringify({ order: list.map((c, i) => ({ id: c.id, sortOrder: i })) }) });
    };

    // ── Drag & drop de servicios (reordenar / mover entre categorías) ──
    const persistTypeOrder = async (affected: any[]) => {
        await fetch(`${API}/training/admin/types/reorder`, { method: 'POST', headers: H, body: JSON.stringify({ order: affected.map(t => ({ id: t.id, categoryId: t.categoryId, sortOrder: t.sortOrder })) }) });
    };
    // Mueve el servicio arrastrado a la categoría destino, opcionalmente antes de otro servicio.
    const dropType = async (toCatId: string | null, beforeTypeId?: string) => {
        const srcId = dragType.current; dragType.current = null;
        if (!srcId) return;
        const moving = types.find(t => t.id === srcId);
        if (!moving) return;
        const targetKey = toCatId || '__none__';
        const fromKey = moving.categoryId || '__none__';

        const next = types.map(t => ({ ...t }));
        const target = next.filter(t => (t.categoryId || '__none__') === targetKey && t.id !== srcId).sort((a, b) => a.sortOrder - b.sortOrder);
        const mv = next.find(t => t.id === srcId)!;
        mv.categoryId = toCatId || null;
        const idx = beforeTypeId ? target.findIndex(t => t.id === beforeTypeId) : target.length;
        target.splice(idx < 0 ? target.length : idx, 0, mv);
        target.forEach((t, i) => { t.sortOrder = i; });

        // Reindexar también la categoría origen si cambió.
        const affected = [...target];
        if (fromKey !== targetKey) {
            const source = next.filter(t => (t.categoryId || '__none__') === fromKey && t.id !== srcId).sort((a, b) => a.sortOrder - b.sortOrder);
            source.forEach((t, i) => { t.sortOrder = i; });
            affected.push(...source);
        }
        setTypes(next);
        await persistTypeOrder(affected);
    };

    if (loading) return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-gray-300" /></div>;

    const renderService = (t: any, catId: string | null) => (
        <div key={t.id} draggable onDragStart={() => (dragType.current = t.id)}
            onDragOver={e => e.preventDefault()} onDrop={e => { e.stopPropagation(); dropType(catId, t.id); }}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${t.active ? 'bg-white border-gray-100' : 'bg-gray-50 border-gray-100 opacity-60'} hover:border-gray-200`}>
            <GripVertical className="w-4 h-4 text-gray-300 cursor-grab shrink-0" />
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: t.color }} />
            <span className="font-semibold text-gray-800 text-sm flex-1 truncate">{t.name}</span>
            <span className="hidden sm:flex items-center gap-2 text-[11px] text-gray-400 font-semibold">
                <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{t.durationMin}m</span>
                <span className="flex items-center gap-1"><Video className="w-3 h-3" />{t.modality}</span>
                {t.price ? <span className="text-amber-600 flex items-center gap-1"><Tag className="w-3 h-3" />${t.price}</span> : <span className="text-emerald-600">Incluido</span>}
            </span>
            <button onClick={() => setEditingType({ ...t, price: t.price ?? '', responsibleId: t.responsibleId ?? '', categoryId: t.categoryId ?? '' })} className="p-1.5 text-gray-400 hover:bg-gray-50 rounded-lg"><Pencil className="w-3.5 h-3.5" /></button>
            <button onClick={() => delType(t.id)} className="p-1.5 text-red-400 hover:bg-red-50 rounded-lg"><Trash2 className="w-3.5 h-3.5" /></button>
        </div>
    );

    const noneTypes = typesByCat['__none__'] || [];

    return (
        <div>
            <div className="flex flex-wrap justify-between items-center gap-2 mb-5">
                <p className="text-sm text-gray-500 max-w-xl">Catálogo de servicios de capacitación y acompañamiento, organizados por categoría. Arrastra para reordenar.</p>
                <div className="flex gap-2">
                    {categories.length === 0 && (
                        <button onClick={seed} disabled={seeding} className="inline-flex items-center gap-1 px-4 py-2 rounded-xl bg-emerald-50 text-emerald-700 font-bold text-sm disabled:opacity-60">
                            {seeding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}Cargar catálogo sugerido
                        </button>
                    )}
                    <button onClick={() => setEditingCat({ ...emptyCat })} className="inline-flex items-center gap-1 px-4 py-2 rounded-xl bg-gray-100 text-gray-700 font-bold text-sm"><FolderPlus className="w-4 h-4" />Nueva categoría</button>
                    <button onClick={() => setEditingType({ ...emptyType })} className="inline-flex items-center gap-1 px-4 py-2 rounded-xl bg-indigo-600 text-white font-bold text-sm"><Plus className="w-4 h-4" />Nuevo servicio</button>
                </div>
            </div>

            <div className="space-y-3">
                {categories.map(cat => {
                    const svcs = typesByCat[cat.id] || [];
                    const isOpen = expanded.has(cat.id);
                    return (
                        <div key={cat.id} draggable onDragStart={() => (dragCat.current = cat.id)}
                            onDragOver={e => e.preventDefault()} onDrop={() => onDropCat(cat.id)}
                            className="rounded-2xl border border-gray-100 bg-white overflow-hidden">
                            <div className="flex items-center gap-2 px-3 py-3" style={{ borderLeft: `4px solid ${cat.color}` }}
                                onDragOver={e => e.preventDefault()} onDrop={e => { if (dragType.current) { e.stopPropagation(); dropType(cat.id); } }}>
                                <GripVertical className="w-4 h-4 text-gray-300 cursor-grab shrink-0" />
                                <button onClick={() => toggle(cat.id)} className="p-1 text-gray-400">{isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}</button>
                                <span className="text-lg">{cat.emoji || '📁'}</span>
                                <div className="flex-1 min-w-0">
                                    <div className="font-black text-gray-900 truncate">{cat.name}</div>
                                    {cat.description && <div className="text-xs text-gray-400 truncate">{cat.description}</div>}
                                </div>
                                <span className="text-[11px] font-black px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 shrink-0">{svcs.length} servicio{svcs.length === 1 ? '' : 's'}</span>
                                <button onClick={() => setEditingCat({ ...cat })} className="p-1.5 text-gray-400 hover:bg-gray-50 rounded-lg"><Pencil className="w-4 h-4" /></button>
                                <button onClick={() => delCat(cat.id)} className="p-1.5 text-red-400 hover:bg-red-50 rounded-lg"><Trash2 className="w-4 h-4" /></button>
                            </div>
                            {isOpen && (
                                <div className="px-3 pb-3 space-y-1.5" onDragOver={e => e.preventDefault()} onDrop={e => { if (dragType.current) { e.stopPropagation(); dropType(cat.id); } }}>
                                    {svcs.length === 0 ? <p className="text-xs text-gray-400 py-2 pl-8">Sin servicios. Arrastra uno aquí o agrégalo.</p> : svcs.map((t: any) => renderService(t, cat.id))}
                                    <button onClick={() => setEditingType({ ...emptyType, categoryId: cat.id, color: cat.color })} className="text-xs font-bold text-indigo-600 flex items-center gap-1 pl-8 pt-1"><Plus className="w-3.5 h-3.5" />Agregar servicio</button>
                                </div>
                            )}
                        </div>
                    );
                })}

                {/* Sin categoría */}
                {noneTypes.length > 0 && (
                    <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50/50" onDragOver={e => e.preventDefault()} onDrop={e => { if (dragType.current) { e.stopPropagation(); dropType(null); } }}>
                        <div className="flex items-center gap-2 px-3 py-3">
                            <Layers className="w-4 h-4 text-gray-400" />
                            <span className="font-black text-gray-600 flex-1">Sin categoría</span>
                            <span className="text-[11px] font-black px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">{noneTypes.length}</span>
                        </div>
                        <div className="px-3 pb-3 space-y-1.5">{noneTypes.map((t: any) => renderService(t, null))}</div>
                    </div>
                )}

                {categories.length === 0 && noneTypes.length === 0 && (
                    <div className="text-center py-16 text-gray-400 text-sm">Aún no hay categorías ni servicios. Carga el catálogo sugerido o crea el tuyo.</div>
                )}
            </div>

            {/* Modal categoría */}
            {editingCat && (
                <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setEditingCat(null)}>
                    <div className="bg-white rounded-3xl p-6 max-w-md w-full" onClick={e => e.stopPropagation()}>
                        <h3 className="text-lg font-black text-gray-900 mb-4">{editingCat.id ? 'Editar' : 'Nueva'} categoría</h3>
                        <div className="space-y-3">
                            <input placeholder="Nombre" value={editingCat.name} onChange={e => setEditingCat((s: any) => ({ ...s, name: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm" />
                            <textarea placeholder="Descripción" value={editingCat.description || ''} onChange={e => setEditingCat((s: any) => ({ ...s, description: e.target.value }))} rows={2} className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm resize-none" />
                            <div>
                                <label className="text-xs font-semibold text-gray-500">Ícono</label>
                                <div className="flex flex-wrap gap-1 mt-1">
                                    {EMOJI_CHOICES.map(e => (
                                        <button key={e} onClick={() => setEditingCat((s: any) => ({ ...s, emoji: e }))} className={`w-8 h-8 rounded-lg text-lg ${editingCat.emoji === e ? 'bg-indigo-100 ring-2 ring-indigo-400' : 'hover:bg-gray-100'}`}>{e}</button>
                                    ))}
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <label className="text-xs font-semibold text-gray-500">Color</label>
                                <input type="color" value={editingCat.color} onChange={e => setEditingCat((s: any) => ({ ...s, color: e.target.value }))} className="w-14 h-9 rounded-lg border border-gray-200" />
                            </div>
                        </div>
                        <div className="flex justify-end gap-2 mt-5">
                            <button onClick={() => setEditingCat(null)} className="px-4 py-2 rounded-xl text-gray-500 font-semibold">Cancelar</button>
                            <button onClick={saveCat} className="px-5 py-2 rounded-xl bg-indigo-600 text-white font-bold">Guardar</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal servicio */}
            {editingType && (
                <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setEditingType(null)}>
                    <div className="bg-white rounded-3xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                        <h3 className="text-lg font-black text-gray-900 mb-4">{editingType.id ? 'Editar' : 'Nuevo'} servicio</h3>
                        <div className="space-y-3">
                            <input placeholder="Nombre" value={editingType.name} onChange={e => setEditingType((s: any) => ({ ...s, name: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm" />
                            <textarea placeholder="Descripción" value={editingType.description || ''} onChange={e => setEditingType((s: any) => ({ ...s, description: e.target.value }))} rows={2} className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm resize-none" />
                            <div>
                                <label className="text-xs font-semibold text-gray-500">Categoría</label>
                                <select value={editingType.categoryId || ''} onChange={e => setEditingType((s: any) => ({ ...s, categoryId: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm">
                                    <option value="">Sin categoría</option>
                                    {categories.map(c => <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}
                                </select>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs font-semibold text-gray-500">Duración (min)</label>
                                    <input type="number" value={editingType.durationMin} onChange={e => setEditingType((s: any) => ({ ...s, durationMin: Number(e.target.value) }))} className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm" />
                                </div>
                                <div>
                                    <label className="text-xs font-semibold text-gray-500">Modalidad</label>
                                    <select value={editingType.modality} onChange={e => setEditingType((s: any) => ({ ...s, modality: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm">
                                        {MODALITIES.map(m => <option key={m} value={m}>{m}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-xs font-semibold text-gray-500">Precio (vacío = incluido)</label>
                                    <input type="number" value={editingType.price} onChange={e => setEditingType((s: any) => ({ ...s, price: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm" />
                                </div>
                                <div>
                                    <label className="text-xs font-semibold text-gray-500">Color</label>
                                    <input type="color" value={editingType.color} onChange={e => setEditingType((s: any) => ({ ...s, color: e.target.value }))} className="w-full h-9 rounded-xl border border-gray-200" />
                                </div>
                            </div>
                            <input placeholder="Requisitos previos (opcional)" value={editingType.prerequisites || ''} onChange={e => setEditingType((s: any) => ({ ...s, prerequisites: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm" />
                            <div>
                                <label className="text-xs font-semibold text-gray-500">Responsable</label>
                                <select value={editingType.responsibleId || ''} onChange={e => setEditingType((s: any) => ({ ...s, responsibleId: e.target.value }))} className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm">
                                    <option value="">Sin asignar</option>
                                    {responsibles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                                </select>
                            </div>
                        </div>
                        <div className="flex justify-end gap-2 mt-5">
                            <button onClick={() => setEditingType(null)} className="px-4 py-2 rounded-xl text-gray-500 font-semibold">Cancelar</button>
                            <button onClick={saveType} className="px-5 py-2 rounded-xl bg-indigo-600 text-white font-bold">Guardar</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AppointmentTypesManager;
