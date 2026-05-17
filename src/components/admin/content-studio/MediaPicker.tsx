import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
    X,
    Search,
    ImageIcon,
    Plus,
    Loader2,
    CheckCircle2,
    Building2,
    MapPin,
    Briefcase,
    Globe,
    Filter,
    Users,
    GraduationCap,
    Calendar,
    Mic,
    Lightbulb,
    Heart
} from 'lucide-react';
import { toast } from 'sonner';

interface MediaItem {
    id: string;
    filename: string;
    url: string;
    type: 'image' | 'video' | 'document';
    sourceType?: string | null;
    sourceId?: string | null;
    sourceLabel?: string | null;
}

interface MediaSource {
    sourceType: string;
    sourceId: string | null;
    sourceLabel: string;
    imageCount: number;
}

interface MediaPickerProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (items: MediaItem[]) => void;
    maxSelection?: number;
    initialSelection?: string[];
}

// Cada categoría se mapea a un valor de Club.category (excepto district,
// project y platform que tienen tablas propias o son globales). La columna
// Club.category se agregó en v4.342 para permitir esta categorización sin
// tablas adicionales.
type CategoryId =
    | 'all'
    | 'club' | 'association' | 'exchange_program' | 'event' | 'conference' | 'project_fair' | 'foundation'
    | 'district' | 'project' | 'platform';

const CATEGORIES: { id: CategoryId; label: string; icon: React.FC<{ className?: string }>; color: string; bg: string }[] = [
    { id: 'all',              label: 'Todas',         icon: Filter,         color: 'text-gray-600',     bg: 'bg-gray-100' },
    { id: 'club',             label: 'Clubes',        icon: Building2,      color: 'text-blue-700',     bg: 'bg-blue-50' },
    { id: 'association',      label: 'Asociaciones',  icon: Users,          color: 'text-indigo-700',   bg: 'bg-indigo-50' },
    { id: 'exchange_program', label: 'Programas',     icon: GraduationCap,  color: 'text-pink-700',     bg: 'bg-pink-50' },
    { id: 'event',            label: 'Eventos',       icon: Calendar,       color: 'text-orange-700',   bg: 'bg-orange-50' },
    { id: 'conference',       label: 'Conferencias',  icon: Mic,            color: 'text-rose-700',     bg: 'bg-rose-50' },
    { id: 'project_fair',     label: 'Ferias',        icon: Lightbulb,      color: 'text-yellow-700',   bg: 'bg-yellow-50' },
    { id: 'foundation',       label: 'Fundaciones',   icon: Heart,          color: 'text-red-700',      bg: 'bg-red-50' },
    { id: 'district',         label: 'Distritos',     icon: MapPin,         color: 'text-purple-700',   bg: 'bg-purple-50' },
    { id: 'project',          label: 'Proyectos',     icon: Briefcase,      color: 'text-amber-700',    bg: 'bg-amber-50' },
    { id: 'platform',         label: 'Plataforma',    icon: Globe,          color: 'text-emerald-700',  bg: 'bg-emerald-50' }
];

const categoryMeta = (id: string | null | undefined) =>
    CATEGORIES.find(c => c.id === id) || CATEGORIES[CATEGORIES.length - 1];

const MediaPicker: React.FC<MediaPickerProps> = ({
    isOpen,
    onClose,
    onSelect,
    maxSelection = 5,
    initialSelection = []
}) => {
    const [media, setMedia] = useState<MediaItem[]>([]);
    const [sources, setSources] = useState<MediaSource[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedIds, setSelectedIds] = useState<string[]>(initialSelection);

    const [selectedCategory, setSelectedCategory] = useState<CategoryId>('all');
    const [selectedSourceId, setSelectedSourceId] = useState<string>('');

    const API = import.meta.env.VITE_API_URL || '/api';

    const fetchMedia = useCallback(async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('rotary_token');
            const params = new URLSearchParams({ type: 'image' });
            if (selectedCategory !== 'all') params.set('sourceType', selectedCategory);
            if (selectedSourceId) params.set('sourceId', selectedSourceId);
            if (searchQuery.trim()) params.set('search', searchQuery.trim());
            const response = await fetch(`${API}/media?${params.toString()}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                const data = await response.json();
                setMedia(data);
            }
        } catch {
            toast.error('Error al cargar la librería');
        } finally {
            setLoading(false);
        }
    }, [API, selectedCategory, selectedSourceId, searchQuery]);

    // Load ALL sources once (no type filter). We slice them client-side for the
    // dropdown so chip counts stay stable regardless of the active category.
    const fetchSources = useCallback(async () => {
        try {
            const token = localStorage.getItem('rotary_token');
            const response = await fetch(`${API}/media/sources`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                const data = await response.json();
                setSources(data);
            }
        } catch { /* silent */ }
    }, [API]);

    useEffect(() => {
        if (!isOpen) return;
        setSelectedIds(initialSelection);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen]);

    // Load the full sources list once when the modal opens.
    useEffect(() => {
        if (!isOpen) return;
        fetchSources();
    }, [isOpen, fetchSources]);

    // Reset the source filter when the user switches category.
    useEffect(() => {
        setSelectedSourceId('');
    }, [selectedCategory]);

    // Sources filtered to the active category — drives the dropdown.
    const sourcesForCategory = useMemo(() => {
        if (selectedCategory === 'all' || selectedCategory === 'platform') return [];
        return sources.filter(s => s.sourceType === selectedCategory);
    }, [sources, selectedCategory]);

    // Debounce media fetch on search input to avoid hammering the API on every keystroke.
    useEffect(() => {
        if (!isOpen) return;
        const handle = setTimeout(fetchMedia, searchQuery ? 250 : 0);
        return () => clearTimeout(handle);
    }, [isOpen, fetchMedia, searchQuery]);

    const toggleSelection = (item: MediaItem) => {
        if (selectedIds.includes(item.id)) {
            setSelectedIds(prev => prev.filter(id => id !== item.id));
        } else {
            if (selectedIds.length >= maxSelection) {
                toast.warning(`Máximo ${maxSelection} imágenes permitidas`);
                return;
            }
            setSelectedIds(prev => [...prev, item.id]);
        }
    };

    const handleConfirm = () => {
        const selectedItems = media.filter(m => selectedIds.includes(m.id));
        onSelect(selectedItems);
        onClose();
    };

    // Per-category image counts derived from the full sources list. Used to
    // show the badge next to each category chip in the toolbar.
    const categoryCounts = useMemo(() => {
        const counts: Record<string, number> = { all: 0 };
        for (const s of sources) {
            counts[s.sourceType] = (counts[s.sourceType] || 0) + s.imageCount;
            counts.all += s.imageCount;
        }
        return counts;
    }, [sources]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-md animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-5xl max-h-[88vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                    <div>
                        <h3 className="text-xl font-black text-gray-900">Biblioteca Multimedia</h3>
                        <p className="text-xs text-gray-500 font-bold uppercase tracking-widest mt-0.5">
                            {selectedIds.length} de {maxSelection} seleccionadas
                            {media.length > 0 && ` · ${media.length} imagen${media.length !== 1 ? 'es' : ''} en vista`}
                        </p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition-all">
                        <X className="w-5 h-5 text-gray-400" />
                    </button>
                </div>

                {/* Category chips */}
                <div className="px-4 pt-3 pb-2 bg-white border-b border-gray-50 flex gap-1.5 overflow-x-auto scrollbar-hide">
                    {CATEGORIES.map(cat => {
                        const Icon = cat.icon;
                        const active = selectedCategory === cat.id;
                        const count = categoryCounts[cat.id] || 0;
                        return (
                            <button
                                key={cat.id}
                                onClick={() => setSelectedCategory(cat.id)}
                                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-black whitespace-nowrap transition-all border flex-shrink-0 ${
                                    active
                                        ? `${cat.bg} ${cat.color} border-current shadow-sm`
                                        : 'bg-gray-50 border-gray-100 text-gray-500 hover:bg-gray-100'
                                }`}
                            >
                                <Icon className="w-3 h-3" />
                                <span className="uppercase tracking-wide">{cat.label}</span>
                                {count > 0 && (
                                    <span className={`text-[9px] px-1 py-0.5 rounded ${active ? 'bg-white/70' : 'bg-gray-200 text-gray-600'}`}>
                                        {count > 999 ? `${Math.floor(count / 1000)}k` : count}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>

                {/* Source filter + search */}
                <div className="p-4 bg-white border-b border-gray-50 flex flex-col sm:flex-row gap-3">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Buscar por nombre de archivo o sitio..."
                            className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                    {selectedCategory !== 'all' && selectedCategory !== 'platform' && (
                        <select
                            value={selectedSourceId}
                            onChange={(e) => setSelectedSourceId(e.target.value)}
                            className="px-3 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all sm:w-72"
                        >
                            <option value="">— Todos los {categoryMeta(selectedCategory).label.toLowerCase()} ({sourcesForCategory.length}) —</option>
                            {sourcesForCategory.map(s => (
                                <option key={`${s.sourceType}:${s.sourceId}`} value={s.sourceId || ''}>
                                    {s.sourceLabel}{s.imageCount > 0 ? ` (${s.imageCount})` : ''}
                                </option>
                            ))}
                        </select>
                    )}
                </div>

                {/* Grid */}
                <div className="flex-1 overflow-y-auto p-6 scrollbar-hide">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-20">
                            <Loader2 className="w-10 h-10 text-indigo-600 animate-spin mb-4" />
                            <p className="text-gray-500 font-bold">Cargando biblioteca...</p>
                        </div>
                    ) : media.length === 0 ? (
                        <div className="text-center py-20">
                            <ImageIcon className="w-12 h-12 text-gray-200 mx-auto mb-4" />
                            <p className="text-gray-400 font-bold">No se encontraron imágenes con esos filtros</p>
                            <p className="text-[11px] text-gray-300 mt-1">Probá ajustar la categoría o el buscador</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-4">
                            {media.map((item) => {
                                const isSelected = selectedIds.includes(item.id);
                                const meta = categoryMeta(item.sourceType);
                                const MetaIcon = meta.icon;
                                return (
                                    <div
                                        key={item.id}
                                        className={`group relative aspect-square rounded-2xl overflow-hidden cursor-pointer transition-all border-2 ${
                                            isSelected ? 'border-indigo-600 ring-4 ring-indigo-600/10' : 'border-gray-100 hover:border-indigo-200'
                                        }`}
                                        onClick={() => toggleSelection(item)}
                                        title={item.sourceLabel ? `${item.filename} — ${item.sourceLabel}` : item.filename}
                                    >
                                        <img src={item.url} alt={item.filename} className="w-full h-full object-cover" loading="lazy" />

                                        <div className={`absolute inset-0 bg-black/20 transition-opacity ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`} />

                                        {/* Source category badge */}
                                        {item.sourceType && (
                                            <div className={`absolute top-2 left-2 inline-flex items-center gap-1 px-2 py-1 rounded-md text-[9px] font-black uppercase tracking-wide ${meta.bg} ${meta.color} shadow-sm backdrop-blur-sm`}>
                                                <MetaIcon className="w-3 h-3" />
                                                {meta.label}
                                            </div>
                                        )}

                                        {/* Selection toggle */}
                                        <div className={`absolute top-2 right-2 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                                            isSelected ? 'bg-indigo-600 border-indigo-600 scale-110' : 'bg-white/40 border-white scale-100'
                                        }`}>
                                            {isSelected ? (
                                                <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                                            ) : (
                                                <Plus className="w-3.5 h-3.5 text-white" />
                                            )}
                                        </div>

                                        {/* Source label at bottom (only on hover or selected) */}
                                        {item.sourceLabel && (
                                            <div className={`absolute bottom-0 left-0 right-0 px-2 py-1.5 bg-gradient-to-t from-black/80 to-transparent text-white text-[10px] font-bold truncate transition-opacity ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                                                {item.sourceLabel}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-5 border-t border-gray-100 flex justify-end items-center gap-3 bg-gray-50/50">
                    <button
                        onClick={onClose}
                        className="px-6 py-2.5 rounded-xl text-sm font-bold text-gray-500 hover:bg-gray-200 transition-all"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleConfirm}
                        disabled={selectedIds.length === 0}
                        className="px-8 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-black disabled:opacity-50 shadow-xl shadow-indigo-600/20 hover:scale-105 transition-all"
                    >
                        Confirmar Selección ({selectedIds.length})
                    </button>
                </div>
            </div>
        </div>
    );
};

export default MediaPicker;
