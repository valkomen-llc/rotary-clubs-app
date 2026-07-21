import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../../../hooks/useAuth';
import { List, Plus, Trash2, Edit3, X, Loader2, Users, ListPlus, Search, LayoutGrid, Rows3, Tag, Building2, Link2, Filter, CheckSquare, Square } from 'lucide-react';
import { toast } from 'sonner';

const API = import.meta.env.VITE_API_URL || '/api';

interface SiteOption { id: string; name: string; type: string; }
interface TagOption { id: string; name: string; color?: string; }

export default function ListsManager({ onViewDetails }: { onViewDetails?: (id: string) => void }) {
    const { token } = useAuth();
    const [lists, setLists] = useState<any[]>([]);
    const [availableTags, setAvailableTags] = useState<TagOption[]>([]);
    const [availableSites, setAvailableSites] = useState<SiteOption[]>([]);
    const [loading, setLoading] = useState(true);

    const [showForm, setShowForm] = useState(false);
    const [editId, setEditId] = useState<string | null>(null);
    const [form, setForm] = useState<{ name: string; description: string; color: string; tags: string[]; siteIds: string[] }>({ name: '', description: '', color: '#3B82F6', tags: [], siteIds: [] });

    // Creación masiva (importar listados por nombre)
    const [showBulk, setShowBulk] = useState(false);
    const [bulkText, setBulkText] = useState('');
    const [bulkColor, setBulkColor] = useState('#3B82F6');
    const [bulkLoading, setBulkLoading] = useState(false);

    // Vista / filtros / selección
    const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
    const [search, setSearch] = useState('');
    const [filterTags, setFilterTags] = useState<string[]>([]);
    const [filterSites, setFilterSites] = useState<string[]>([]);
    const [showFilters, setShowFilters] = useState(false);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [bulkTag, setBulkTag] = useState('');
    const [bulkSite, setBulkSite] = useState('');
    const [bulkActionLoading, setBulkActionLoading] = useState(false);

    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
    const colors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316', '#64748B'];

    useEffect(() => { fetchAll(); }, []);

    const fetchAll = async () => {
        setLoading(true);
        try {
            const [resLists, resTags, resSites] = await Promise.all([
                fetch(`${API}/crm/lists`, { headers }),
                fetch(`${API}/crm/tags`, { headers }),
                fetch(`${API}/crm/sites`, { headers }),
            ]);
            if (resLists.ok) setLists(await resLists.json());
            if (resTags.ok) setAvailableTags(await resTags.json());
            if (resSites.ok) setAvailableSites(await resSites.json());
        } catch (err) { toast.error('Error cargando listas'); } finally { setLoading(false); }
    };

    const fetchLists = async () => {
        try {
            const res = await fetch(`${API}/crm/lists`, { headers });
            if (res.ok) setLists(await res.json());
        } catch (err) { toast.error('Error cargando listas'); }
    };

    const siteName = (id: string) => availableSites.find(s => s.id === id)?.name || 'Sitio';

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
        toast.success('Lista eliminada'); setSelected(prev => { const n = new Set(prev); n.delete(id); return n; }); fetchLists();
    };

    const resetForm = () => { setForm({ name: '', description: '', color: '#3B82F6', tags: [], siteIds: [] }); setEditId(null); };
    const startEdit = (e: React.MouseEvent, l: any) => {
        e.stopPropagation();
        setForm({ name: l.name, description: l.description || '', color: l.color, tags: l.tags || [], siteIds: l.siteIds || [] });
        setEditId(l.id); setShowBulk(false); setShowForm(true);
    };

    // ── Filtro + selección ────────────────────────────────────────────────
    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return lists.filter((l: any) => {
            if (q && !(`${l.name} ${l.description || ''}`.toLowerCase().includes(q))) return false;
            if (filterTags.length && !filterTags.some(t => (l.tags || []).includes(t))) return false;
            if (filterSites.length && !filterSites.some(s => (l.siteIds || []).includes(s))) return false;
            return true;
        });
    }, [lists, search, filterTags, filterSites]);

    // Solo las listas propias son seleccionables para acciones masivas.
    const selectableVisibleIds = useMemo(() => filtered.filter((l: any) => !l.isLinked).map((l: any) => l.id), [filtered]);
    const allVisibleSelected = selectableVisibleIds.length > 0 && selectableVisibleIds.every(id => selected.has(id));

    const toggleSelect = (id: string) => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
    const toggleSelectAll = () => setSelected(prev => {
        if (allVisibleSelected) { const n = new Set(prev); selectableVisibleIds.forEach(id => n.delete(id)); return n; }
        return new Set([...prev, ...selectableVisibleIds]);
    });
    const clearSelection = () => setSelected(new Set());

    const toggleFrom = (arr: string[], v: string) => arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v];

    const runBulk = async (payload: any, okMsg: (data: any) => string) => {
        const ids = Array.from(selected);
        if (ids.length === 0) return;
        setBulkActionLoading(true);
        try {
            const res = await fetch(`${API}/crm/lists/bulk-update`, { method: 'POST', headers, body: JSON.stringify({ ids, ...payload }) });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Error en la acción masiva');
            toast.success(okMsg(data));
            fetchLists();
        } catch (err: any) { toast.error(err.message || 'Error en la acción masiva'); }
        finally { setBulkActionLoading(false); }
    };

    const bulkDelete = async () => {
        const ids = Array.from(selected);
        if (ids.length === 0) return;
        if (!confirm(`¿Eliminar ${ids.length} lista(s)? Los contactos se conservan; solo se pierde la asociación.`)) return;
        setBulkActionLoading(true);
        try {
            const res = await fetch(`${API}/crm/lists/bulk-delete`, { method: 'POST', headers, body: JSON.stringify({ ids }) });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Error eliminando');
            toast.success(`${data.deleted} lista${data.deleted === 1 ? '' : 's'} eliminada${data.deleted === 1 ? '' : 's'}`);
            clearSelection(); fetchLists();
        } catch (err: any) { toast.error(err.message || 'Error eliminando'); }
        finally { setBulkActionLoading(false); }
    };

    const tagColor = (name: string) => availableTags.find(t => t.name === name)?.color || '#64748B';

    // ── Chips reutilizables (etiquetas + sitios en tarjeta/fila) ───────────
    const MetaChips = ({ l, compact }: { l: any; compact?: boolean }) => {
        const tags: string[] = l.tags || [];
        const sites: string[] = l.siteIds || [];
        if (!tags.length && !sites.length) return compact ? <span className="text-xs text-gray-300">—</span> : null;
        return (
            <div className="flex flex-wrap gap-1">
                {tags.map(t => (
                    <span key={`t-${t}`} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold" style={{ backgroundColor: `${tagColor(t)}20`, color: tagColor(t) }}>
                        <Tag className="w-2.5 h-2.5" /> {t}
                    </span>
                ))}
                {sites.map(s => (
                    <span key={`s-${s}`} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-indigo-50 text-indigo-700">
                        <Building2 className="w-2.5 h-2.5" /> {siteName(s)}
                    </span>
                ))}
            </div>
        );
    };

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden p-6">
            <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
                <div>
                    <h2 className="text-lg font-bold text-gray-900">Listas Estáticas</h2>
                    <p className="text-sm text-gray-500">Agrupa contactos manualmente en listas fijas (Ej: Asistentes Evento 2024)</p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
                        <button onClick={() => setViewMode('cards')} title="Tarjetas"
                            className={`p-2 rounded-md transition-colors ${viewMode === 'cards' ? 'bg-white shadow-sm text-rotary-blue' : 'text-gray-400 hover:text-gray-600'}`}>
                            <LayoutGrid className="w-4 h-4" />
                        </button>
                        <button onClick={() => setViewMode('table')} title="Tabla"
                            className={`p-2 rounded-md transition-colors ${viewMode === 'table' ? 'bg-white shadow-sm text-rotary-blue' : 'text-gray-400 hover:text-gray-600'}`}>
                            <Rows3 className="w-4 h-4" />
                        </button>
                    </div>
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

            {/* ── Importar listas (creación masiva por nombre) ── */}
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

            {/* ── Crear / editar lista ── */}
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

                        {/* Etiquetas */}
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1.5 flex items-center gap-1"><Tag className="w-3 h-3" /> Etiquetas</label>
                            {availableTags.length === 0 ? (
                                <p className="text-xs text-gray-400">No hay etiquetas todavía. Créalas en la pestaña "Etiquetas".</p>
                            ) : (
                                <div className="flex flex-wrap gap-1.5">
                                    {availableTags.map(t => {
                                        const on = form.tags.includes(t.name);
                                        return (
                                            <button key={t.id} type="button" onClick={() => setForm({ ...form, tags: toggleFrom(form.tags, t.name) })}
                                                className={`px-2.5 py-1 rounded-full text-xs font-bold border transition-colors ${on ? 'text-white border-transparent' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}
                                                style={on ? { backgroundColor: t.color || '#64748B' } : {}}>
                                                {t.name}
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Sitios vinculados */}
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1.5 flex items-center gap-1"><Building2 className="w-3 h-3" /> Sitios vinculados <span className="font-normal text-gray-400">(para segmentar y usar en campañas)</span></label>
                            {availableSites.length === 0 ? (
                                <p className="text-xs text-gray-400">No hay sitios disponibles.</p>
                            ) : (
                                <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto p-2 bg-white border border-gray-200 rounded-lg">
                                    {availableSites.map(s => {
                                        const on = form.siteIds.includes(s.id);
                                        return (
                                            <button key={s.id} type="button" onClick={() => setForm({ ...form, siteIds: toggleFrom(form.siteIds, s.id) })}
                                                className={`px-2.5 py-1 rounded-full text-xs font-bold border transition-colors ${on ? 'bg-indigo-600 text-white border-transparent' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}>
                                                {s.type === 'district' ? '🗺️ ' : ''}{s.name}
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
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

            {/* ── Toolbar: buscar + filtros ── */}
            {!loading && lists.length > 0 && (
                <div className="flex items-center gap-2 mb-4 flex-wrap">
                    <div className="relative flex-1 min-w-[200px]">
                        <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar lista..."
                            className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-rotary-blue outline-none" />
                    </div>
                    <button onClick={() => setShowFilters(v => !v)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-bold transition-colors ${(filterTags.length + filterSites.length) > 0 ? 'border-rotary-blue text-rotary-blue bg-blue-50' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                        <Filter className="w-4 h-4" /> Filtros
                        {(filterTags.length + filterSites.length) > 0 && <span className="bg-rotary-blue text-white rounded-full px-1.5 text-[11px]">{filterTags.length + filterSites.length}</span>}
                    </button>
                    <span className="text-xs text-gray-400">{filtered.length} de {lists.length}</span>
                </div>
            )}

            {showFilters && !loading && lists.length > 0 && (
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-4 space-y-3">
                    <div>
                        <span className="text-xs font-bold text-gray-500 flex items-center gap-1 mb-1.5"><Tag className="w-3 h-3" /> Por etiqueta</span>
                        {availableTags.length === 0 ? <span className="text-xs text-gray-400">Sin etiquetas</span> : (
                            <div className="flex flex-wrap gap-1.5">
                                {availableTags.map(t => {
                                    const on = filterTags.includes(t.name);
                                    return <button key={t.id} type="button" onClick={() => setFilterTags(toggleFrom(filterTags, t.name))}
                                        className={`px-2.5 py-1 rounded-full text-xs font-bold border ${on ? 'text-white border-transparent' : 'bg-white text-gray-600 border-gray-200'}`}
                                        style={on ? { backgroundColor: t.color || '#64748B' } : {}}>{t.name}</button>;
                                })}
                            </div>
                        )}
                    </div>
                    <div>
                        <span className="text-xs font-bold text-gray-500 flex items-center gap-1 mb-1.5"><Building2 className="w-3 h-3" /> Por sitio</span>
                        {availableSites.length === 0 ? <span className="text-xs text-gray-400">Sin sitios</span> : (
                            <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                                {availableSites.map(s => {
                                    const on = filterSites.includes(s.id);
                                    return <button key={s.id} type="button" onClick={() => setFilterSites(toggleFrom(filterSites, s.id))}
                                        className={`px-2.5 py-1 rounded-full text-xs font-bold border ${on ? 'bg-indigo-600 text-white border-transparent' : 'bg-white text-gray-600 border-gray-200'}`}>
                                        {s.type === 'district' ? '🗺️ ' : ''}{s.name}</button>;
                                })}
                            </div>
                        )}
                    </div>
                    {(filterTags.length + filterSites.length) > 0 && (
                        <button onClick={() => { setFilterTags([]); setFilterSites([]); }} className="text-xs font-bold text-gray-500 hover:text-gray-700">Limpiar filtros</button>
                    )}
                </div>
            )}

            {/* ── Barra de acciones masivas ── */}
            {selected.size > 0 && (
                <div className="sticky top-2 z-10 bg-rotary-blue text-white rounded-xl p-3 mb-4 flex items-center gap-3 flex-wrap shadow-lg">
                    <span className="font-bold text-sm">{selected.size} seleccionada{selected.size === 1 ? '' : 's'}</span>
                    <div className="h-5 w-px bg-white/30" />
                    {/* Etiqueta */}
                    <div className="flex items-center gap-1">
                        <select value={bulkTag} onChange={e => setBulkTag(e.target.value)} className="text-gray-800 text-xs rounded-lg px-2 py-1.5 outline-none max-w-[160px]">
                            <option value="">Etiqueta…</option>
                            {availableTags.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
                        </select>
                        <button disabled={!bulkTag || bulkActionLoading} onClick={() => runBulk({ addTags: [bulkTag] }, d => `Etiqueta asignada a ${d.updated} lista(s)`)}
                            className="text-xs font-bold bg-white/20 hover:bg-white/30 disabled:opacity-40 px-2 py-1.5 rounded-lg">Asignar</button>
                        <button disabled={!bulkTag || bulkActionLoading} onClick={() => runBulk({ removeTags: [bulkTag] }, d => `Etiqueta quitada de ${d.updated} lista(s)`)}
                            className="text-xs font-bold bg-white/20 hover:bg-white/30 disabled:opacity-40 px-2 py-1.5 rounded-lg">Quitar</button>
                    </div>
                    <div className="h-5 w-px bg-white/30" />
                    {/* Sitio */}
                    <div className="flex items-center gap-1">
                        <select value={bulkSite} onChange={e => setBulkSite(e.target.value)} className="text-gray-800 text-xs rounded-lg px-2 py-1.5 outline-none max-w-[160px]">
                            <option value="">Sitio…</option>
                            {availableSites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                        <button disabled={!bulkSite || bulkActionLoading} onClick={() => runBulk({ addSiteIds: [bulkSite] }, d => `Sitio enlazado a ${d.updated} lista(s)`)}
                            className="text-xs font-bold bg-white/20 hover:bg-white/30 disabled:opacity-40 px-2 py-1.5 rounded-lg flex items-center gap-1"><Link2 className="w-3 h-3" /> Enlazar</button>
                        <button disabled={!bulkSite || bulkActionLoading} onClick={() => runBulk({ removeSiteIds: [bulkSite] }, d => `Sitio desenlazado de ${d.updated} lista(s)`)}
                            className="text-xs font-bold bg-white/20 hover:bg-white/30 disabled:opacity-40 px-2 py-1.5 rounded-lg">Desenlazar</button>
                    </div>
                    <div className="h-5 w-px bg-white/30" />
                    <button disabled={bulkActionLoading} onClick={bulkDelete} className="text-xs font-bold bg-red-500/90 hover:bg-red-500 px-3 py-1.5 rounded-lg flex items-center gap-1"><Trash2 className="w-3 h-3" /> Eliminar</button>
                    <button onClick={clearSelection} className="text-xs font-bold text-white/80 hover:text-white ml-auto">Deseleccionar</button>
                </div>
            )}

            {/* ── Contenido ── */}
            {loading ? (
                <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
            ) : lists.length === 0 ? (
                <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-xl">
                    <List className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <h3 className="font-bold text-gray-900">Aún no hay listas</h3>
                    <p className="text-sm text-gray-500 mt-1">Crea tu primera lista o usa "Importar listas" para crear varias de golpe</p>
                </div>
            ) : filtered.length === 0 ? (
                <div className="text-center py-12 text-sm text-gray-500">No hay listas que coincidan con el filtro.</div>
            ) : viewMode === 'table' ? (
                /* ── Vista TABLA (lista de listados) ── */
                <div className="border border-gray-100 rounded-xl overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-gray-50 text-gray-500 text-xs font-bold uppercase">
                            <tr>
                                <th className="p-3 w-10">
                                    <button onClick={toggleSelectAll} className="text-gray-400 hover:text-rotary-blue">
                                        {allVisibleSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                                    </button>
                                </th>
                                <th className="p-3">Lista</th>
                                <th className="p-3">Contactos</th>
                                <th className="p-3">Etiquetas / Sitios</th>
                                <th className="p-3 text-right">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {filtered.map((l: any) => (
                                <tr key={l.id} className="hover:bg-gray-50/60 group">
                                    <td className="p-3">
                                        {l.isLinked ? <span title="Vinculada de otro sitio" className="text-gray-300"><Link2 className="w-4 h-4" /></span> : (
                                            <button onClick={() => toggleSelect(l.id)} className="text-gray-400 hover:text-rotary-blue">
                                                {selected.has(l.id) ? <CheckSquare className="w-4 h-4 text-rotary-blue" /> : <Square className="w-4 h-4" />}
                                            </button>
                                        )}
                                    </td>
                                    <td className="p-3">
                                        <button onClick={() => onViewDetails && onViewDetails(l.id)} className="flex items-center gap-2 text-left">
                                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: l.color }} />
                                            <span>
                                                <span className="font-bold text-gray-900 group-hover:text-rotary-blue">{l.name}</span>
                                                {l.isLinked && <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 align-middle">VINCULADA</span>}
                                                {l.description && <span className="block text-xs text-gray-400">{l.description}</span>}
                                            </span>
                                        </button>
                                    </td>
                                    <td className="p-3 text-gray-600"><span className="font-bold">{l._count?.members || 0}</span></td>
                                    <td className="p-3"><MetaChips l={l} compact /></td>
                                    <td className="p-3">
                                        <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            {!l.isLinked && <>
                                                <button onClick={(e) => startEdit(e, l)} className="p-1.5 text-gray-400 hover:text-rotary-blue"><Edit3 className="w-4 h-4" /></button>
                                                <button onClick={(e) => handleDelete(e, l.id)} className="p-1.5 text-gray-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                                            </>}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                /* ── Vista TARJETAS ── */
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filtered.map((l: any) => (
                        <div key={l.id}
                             className={`relative border rounded-xl p-5 transition-colors group ${selected.has(l.id) ? 'border-rotary-blue ring-1 ring-rotary-blue' : 'border-gray-100 hover:border-gray-300'} ${onViewDetails ? 'hover:shadow-md' : ''}`}>
                            {/* Checkbox selección */}
                            {!l.isLinked && (
                                <button onClick={() => toggleSelect(l.id)} className="absolute top-3 left-3 text-gray-300 hover:text-rotary-blue">
                                    {selected.has(l.id) ? <CheckSquare className="w-4 h-4 text-rotary-blue" /> : <Square className="w-4 h-4" />}
                                </button>
                            )}
                            <div className="flex justify-between items-start mb-3 pl-6">
                                <div className="flex items-center gap-3 cursor-pointer" onClick={() => onViewDetails && onViewDetails(l.id)}>
                                    <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${l.color}20`, color: l.color }}>
                                        <List className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-gray-900 group-hover:text-rotary-blue transition-colors">
                                            {l.name}
                                            {l.isLinked && <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 align-middle">VINCULADA</span>}
                                        </h4>
                                        <p className="text-xs text-gray-500">{l.description || 'Sin descripción'}</p>
                                    </div>
                                </div>
                                {!l.isLinked && (
                                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button onClick={(e) => startEdit(e, l)} className="p-1.5 text-gray-400 hover:text-rotary-blue"><Edit3 className="w-4 h-4" /></button>
                                        <button onClick={(e) => handleDelete(e, l.id)} className="p-1.5 text-gray-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                                    </div>
                                )}
                            </div>
                            <div className="flex items-center gap-2 text-sm text-gray-600 bg-gray-50 px-3 py-2 rounded-lg mb-2">
                                <Users className="w-4 h-4 text-gray-400" />
                                <span className="font-bold">{l._count?.members || 0}</span> contactos
                            </div>
                            <MetaChips l={l} />
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
