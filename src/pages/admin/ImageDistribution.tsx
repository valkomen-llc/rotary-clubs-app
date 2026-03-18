import React, { useEffect, useState } from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import {
    Image as ImageIcon, Save, Loader2, Trash2, Upload, Plus,
    Monitor, ChevronDown, ChevronUp, CheckCircle, X, Search
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useClub } from '../../contexts/ClubContext';
import { toast } from 'sonner';

const API = import.meta.env.VITE_API_URL || '/api';

// ── Default Unsplash images (fallbacks) ────────────────────────────────────
const DEFAULTS = {
    hero: [
        { url: 'https://images.unsplash.com/photo-1552664730-d307ca884978?w=1600&h=700&fit=crop', alt: 'Trabajo en equipo' },
        { url: 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=1600&h=700&fit=crop', alt: 'Promoción de la paz' },
        { url: 'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=1600&h=700&fit=crop', alt: 'Lucha contra enfermedades' },
        { url: 'https://images.unsplash.com/photo-1497633762265-9d179a990aa6?w=1600&h=700&fit=crop', alt: 'Educación' },
        { url: 'https://images.unsplash.com/photo-1531206715517-5c0ba140b2b8?w=1600&h=700&fit=crop', alt: 'Desarrollo económico' },
    ],
    causes: [
        { url: 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=500&h=500&fit=crop', alt: 'Promoción de la paz' },
        { url: 'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=500&h=500&fit=crop', alt: 'Lucha contra enfermedades' },
        { url: 'https://images.unsplash.com/photo-1593113598332-cd288d649433?w=500&h=500&fit=crop', alt: 'Agua y saneamiento' },
        { url: 'https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?w=500&h=500&fit=crop', alt: 'Salud materno-infantil' },
        { url: 'https://images.unsplash.com/photo-1497633762265-9d179a990aa6?w=500&h=500&fit=crop', alt: 'Educación básica' },
        { url: 'https://images.unsplash.com/photo-1531206715517-5c0ba140b2b8?w=500&h=500&fit=crop', alt: 'Desarrollo económico' },
        { url: 'https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?w=500&h=500&fit=crop', alt: 'Medio ambiente' },
    ],
    foundation: { url: 'https://images.unsplash.com/photo-1559027615-cd4628902d4a?w=1600&h=800&fit=crop', alt: 'Fundación Rotaria' },
    join: { url: 'https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?w=600&h=500&fit=crop', alt: 'Únete a Rotary' },
    aboutHero: { url: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=1600&h=500&fit=crop', alt: 'Quiénes Somos' },
};

interface ImgSlot { url: string; alt: string; }
interface SiteImages {
    hero: ImgSlot[];
    causes: ImgSlot[];
    foundation: ImgSlot;
    join: ImgSlot;
    aboutHero: ImgSlot;
    [key: string]: ImgSlot | ImgSlot[];
}

interface MediaItem { id: string; url: string; filename: string; type: string; }

// ── Container definitions ──────────────────────────────────────────────────
const CONTAINERS = [
    { key: 'hero', label: 'Hero — Slider Principal', desc: '5 imágenes de slide con rotación automática. Tamaño ideal: 1600×700px, horizontal.', count: 5, aspect: '16/7' },
    { key: 'causes', label: 'Áreas de Interés — Causas', desc: '7 imágenes para las tarjetas de causas Rotary. Tamaño ideal: 500×500px, cuadrado.', count: 7, aspect: '1/1' },
    { key: 'foundation', label: 'Fundación Rotaria', desc: '1 imagen de fondo para la sección de la Fundación. Tamaño ideal: 1600×800px, panorámica.', count: 1, aspect: '16/8' },
    { key: 'join', label: 'Sección Únete', desc: '1 imagen motivacional para la sección de reclutamiento. Tamaño ideal: 600×500px.', count: 1, aspect: '6/5' },
    { key: 'aboutHero', label: 'Quiénes Somos — Hero', desc: '1 imagen de banner para la página Quiénes Somos. Tamaño ideal: 1600×500px, panorámica.', count: 1, aspect: '16/5' },
];

const ImageDistribution: React.FC = () => {
    const { user } = useAuth();
    const { club } = useClub();
    const [images, setImages] = useState<SiteImages | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [dirty, setDirty] = useState(false);
    const [expanded, setExpanded] = useState<Record<string, boolean>>({ hero: true, causes: false, foundation: false, join: false });
    // Media picker
    const [pickerOpen, setPickerOpen] = useState(false);
    const [pickerTarget, setPickerTarget] = useState<{ key: string; index: number } | null>(null);
    const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
    const [mediaLoading, setMediaLoading] = useState(false);
    const [mediaSearch, setMediaSearch] = useState('');
    const [uploading, setUploading] = useState(false);

    const token = () => localStorage.getItem('rotary_token');
    const clubId = user?.clubId || (club as any)?.id;

    // ── Load current site images ──────────────────────────────────────────
    useEffect(() => {
        if (!clubId) { setLoading(false); return; }
        (async () => {
            try {
                const res = await fetch(`${API}/clubs/${clubId}/site-images?_t=${Date.now()}`);
                const data = res.ok ? await res.json() : {};
                const buildImages = (src: any) => {
                    const result: any = {};
                    for (const c of CONTAINERS) {
                        const def = (DEFAULTS as any)[c.key];
                        if (Array.isArray(def)) result[c.key] = src[c.key] || def.map((d: any) => ({ ...d }));
                        else result[c.key] = src[c.key] || { ...def };
                    }
                    return result as SiteImages;
                };
                setImages(buildImages(data));
            } catch { 
                const fallback: any = {};
                for (const c of CONTAINERS) {
                    const def = (DEFAULTS as any)[c.key];
                    if (Array.isArray(def)) fallback[c.key] = def.map((d: any) => ({ ...d }));
                    else fallback[c.key] = { ...def };
                }
                setImages(fallback as SiteImages);
            }
            finally { setLoading(false); }
        })();
    }, [clubId]);

    // ── Save ──────────────────────────────────────────────────────────────
    const handleSave = async () => {
        if (!images || !clubId) return;
        setSaving(true);
        try {
            const res = await fetch(`${API}/admin/sections/batch-upsert`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
                body: JSON.stringify({
                    clubId,
                    sections: [{ page: 'home', section: 'images', content: images }]
                })
            });
            if (res.ok) { toast.success('✅ Imágenes guardadas exitosamente'); setDirty(false); }
            else toast.error('Error al guardar');
        } catch { toast.error('Error de conexión'); }
        finally { setSaving(false); }
    };

    // ── Open media picker ─────────────────────────────────────────────────
    const openPicker = (key: string, index: number) => {
        setPickerTarget({ key, index });
        setPickerOpen(true);
        setMediaSearch('');
        fetchMedia();
    };

    const fetchMedia = async () => {
        setMediaLoading(true);
        try {
            const res = await fetch(`${API}/media?type=image`, {
                headers: { Authorization: `Bearer ${token()}` }
            });
            if (res.ok) {
                const data = await res.json();
                setMediaItems(Array.isArray(data) ? data : data.items || []);
            }
        } catch { }
        finally { setMediaLoading(false); }
    };

    // ── Upload image directly from picker ──────────────────────────────────
    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploading(true);
        const formData = new FormData();
        formData.append('file', file);
        formData.append('clubId', clubId || '');
        try {
            const res = await fetch(`${API}/media/upload`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token()}` },
                body: formData,
            });
            if (res.ok) {
                toast.success('✅ Imagen subida. Selecciónala de la galería.');
                // Refresh gallery so the new image appears — modal stays open
                await fetchMedia();
            } else {
                const err = await res.json().catch(() => ({}));
                toast.error(err.error || 'Error al subir imagen');
            }
        } catch { toast.error('Error de conexión'); }
        finally { setUploading(false); e.target.value = ''; }
    };

    const selectMedia = (url: string, filename: string) => {
        if (!images || !pickerTarget) return;
        const { key, index } = pickerTarget;
        const newImages: any = { ...images };
        const def = (DEFAULTS as any)[key];
        const alt = filename.replace(/\.[^/.]+$/, '');
        if (Array.isArray(def)) {
            newImages[key] = [...newImages[key]];
            newImages[key][index] = { url, alt };
        } else {
            newImages[key] = { url, alt };
        }
        setImages(newImages as SiteImages);
        setDirty(true);
        setPickerOpen(false);
    };

    // Handle entering a custom URL
    const handleCustomUrl = (key: string, index: number, url: string) => {
        if (!images) return;
        const newImages: any = { ...images };
        const def = (DEFAULTS as any)[key];
        if (Array.isArray(def)) {
            newImages[key] = [...newImages[key]];
            newImages[key][index] = { ...newImages[key][index], url };
        } else {
            newImages[key] = { ...newImages[key], url };
        }
        setImages(newImages as SiteImages);
        setDirty(true);
    };

    // Reset a slot to default
    const resetSlot = (key: string, index: number) => {
        if (!images) return;
        const newImages: any = { ...images };
        const def = (DEFAULTS as any)[key];
        if (Array.isArray(def)) {
            newImages[key] = [...newImages[key]];
            newImages[key][index] = { ...def[index] };
        } else {
            newImages[key] = { ...def };
        }
        setImages(newImages as SiteImages);
        setDirty(true);
    };

    const isDefault = (key: string, index: number): boolean => {
        if (!images) return true;
        const def = (DEFAULTS as any)[key];
        const val = (images as any)[key];
        if (Array.isArray(def)) return val?.[index]?.url === def[index]?.url;
        return val?.url === def?.url;
    };

    const getSlots = (key: string): ImgSlot[] => {
        if (!images) return [];
        const val = (images as any)[key];
        if (Array.isArray(val)) return val;
        return val ? [val] : [];
    };

    const filteredMedia = mediaItems.filter(m =>
        m.type === 'image' && (mediaSearch === '' || m.filename.toLowerCase().includes(mediaSearch.toLowerCase()))
    );

    if (loading) return <AdminLayout><div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-rotary-blue" /></div></AdminLayout>;

    return (
        <AdminLayout>
            <div className="space-y-6 max-w-5xl">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
                                <ImageIcon className="w-5 h-5 text-white" />
                            </div>
                            Imágenes del Sitio
                        </h1>
                        <p className="text-sm text-gray-500 mt-1">Personaliza las imágenes de cada sección de tu sitio web. Los cambios se aplican al guardar.</p>
                    </div>
                    <button onClick={handleSave} disabled={saving || !dirty}
                        className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-sm transition-all ${dirty ? 'bg-rotary-blue text-white shadow-lg shadow-rotary-blue/20 hover:bg-sky-800' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}>
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        {saving ? 'Guardando...' : 'Guardar Cambios'}
                    </button>
                </div>

                {dirty && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800 flex items-center gap-2 font-medium">
                        <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                        Tienes cambios sin guardar. Haz clic en "Guardar Cambios" para aplicarlos.
                    </div>
                )}

                {/* Containers */}
                {CONTAINERS.map(container => {
                    const slots = getSlots(container.key);
                    const isOpen = expanded[container.key];
                    const customCount = slots.filter((_, i) => !isDefault(container.key, i)).length;

                    return (
                        <div key={container.key} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                            {/* Accordion Header */}
                            <button onClick={() => setExpanded(prev => ({ ...prev, [container.key]: !prev[container.key] }))}
                                className="w-full px-6 py-5 flex items-center gap-4 hover:bg-gray-50/50 transition-colors text-left">
                                <Monitor className="w-5 h-5 text-violet-500 flex-shrink-0" />
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-3">
                                        <h3 className="font-bold text-gray-900">{container.label}</h3>
                                        <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                                            {container.count} {container.count === 1 ? 'imagen' : 'imágenes'}
                                        </span>
                                        {customCount > 0 && (
                                            <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 flex items-center gap-1">
                                                <CheckCircle className="w-3 h-3" /> {customCount} personalizadas
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-xs text-gray-400 mt-0.5">{container.desc}</p>
                                </div>
                                {isOpen ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
                            </button>

                            {/* Slots Grid */}
                            {isOpen && (
                                <div className="px-6 pb-6 border-t border-gray-100 pt-4">
                                    <div className={`grid gap-4 ${container.count === 1 ? 'grid-cols-1 max-w-lg' : container.count <= 4 ? 'grid-cols-2 lg:grid-cols-4' : 'grid-cols-2 lg:grid-cols-5'}`}>
                                        {slots.map((slot, idx) => {
                                            const isDef = isDefault(container.key, idx);
                                            return (
                                                <div key={idx} className={`group relative rounded-xl overflow-hidden border-2 transition-all ${isDef ? 'border-gray-200 border-dashed' : 'border-emerald-300 shadow-md'}`}>
                                                    {/* Image preview */}
                                                    <div className="relative" style={{ aspectRatio: container.aspect }}>
                                                        <img src={slot.url} alt={slot.alt}
                                                            className="w-full h-full object-cover"
                                                            onError={(e) => { (e.target as HTMLImageElement).src = DEFAULTS.hero[0].url; }} />

                                                        {/* Overlay on hover */}
                                                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/50 transition-all flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                                                            <button onClick={() => openPicker(container.key, idx)}
                                                                className="px-3 py-2 bg-white rounded-lg text-xs font-bold text-gray-800 hover:bg-gray-100 transition-colors flex items-center gap-1.5 shadow-lg">
                                                                <Upload className="w-3.5 h-3.5" /> Cambiar
                                                            </button>
                                                            {!isDef && (
                                                                <button onClick={() => resetSlot(container.key, idx)}
                                                                    className="px-3 py-2 bg-red-500 rounded-lg text-xs font-bold text-white hover:bg-red-600 transition-colors flex items-center gap-1.5 shadow-lg">
                                                                    <Trash2 className="w-3.5 h-3.5" /> Reset
                                                                </button>
                                                            )}
                                                        </div>

                                                        {/* Status badge */}
                                                        <div className="absolute top-2 left-2">
                                                            {isDef ? (
                                                                <span className="px-2 py-0.5 bg-gray-900/60 text-white text-[9px] font-bold rounded-full backdrop-blur-sm uppercase">
                                                                    Por Defecto
                                                                </span>
                                                            ) : (
                                                                <span className="px-2 py-0.5 bg-emerald-500 text-white text-[9px] font-bold rounded-full uppercase flex items-center gap-1">
                                                                    <CheckCircle className="w-2.5 h-2.5" /> Personalizada
                                                                </span>
                                                            )}
                                                        </div>

                                                        {/* Slot number */}
                                                        {container.count > 1 && (
                                                            <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-white/90 text-gray-800 text-[10px] font-black flex items-center justify-center shadow">
                                                                {idx + 1}
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Alt text / label */}
                                                    <div className="p-2 bg-white">
                                                        <p className="text-[11px] text-gray-500 truncate font-medium">{slot.alt}</p>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* ── Media Picker Modal ── */}
            {pickerOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
                        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                            <h2 className="font-bold text-gray-800 flex items-center gap-2">
                                <ImageIcon className="w-5 h-5 text-violet-500" /> Seleccionar Imagen
                            </h2>
                            <div className="flex items-center gap-2">
                                <label className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold cursor-pointer transition-all ${uploading ? 'bg-gray-100 text-gray-400' : 'bg-violet-600 text-white hover:bg-violet-700 shadow-lg'}`}>
                                    {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                                    {uploading ? 'Subiendo...' : 'Subir imagen'}
                                    <input type="file" accept="image/*" className="hidden" onChange={handleUpload} disabled={uploading} />
                                </label>
                                <button onClick={() => setPickerOpen(false)} className="text-gray-400 hover:text-gray-600 p-1">
                                    <X className="w-6 h-6" />
                                </button>
                            </div>
                        </div>

                        <div className="px-6 py-3 border-b border-gray-100">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <input type="text" placeholder="Buscar por nombre de archivo..."
                                    className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl outline-none text-sm focus:ring-2 focus:ring-violet-200"
                                    value={mediaSearch} onChange={e => setMediaSearch(e.target.value)} />
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6">
                            {mediaLoading ? (
                                <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
                            ) : filteredMedia.length === 0 ? (
                                <div className="text-center py-12 text-gray-400">
                                    <ImageIcon className="w-10 h-10 mx-auto mb-3 opacity-30" />
                                    <p className="font-medium">{mediaSearch ? 'No hay resultados.' : 'No hay imágenes en la Media Library.'}</p>
                                    <p className="text-xs mt-1">Sube imágenes desde la sección Multimedia.</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                                    {filteredMedia.map(item => (
                                        <button key={item.id} onClick={() => selectMedia(item.url, item.filename)}
                                            className="group relative rounded-xl overflow-hidden border-2 border-gray-200 hover:border-violet-500 hover:shadow-lg transition-all aspect-square">
                                            <img src={item.url} alt={item.filename} className="w-full h-full object-cover" />
                                            <div className="absolute inset-0 bg-violet-500/0 group-hover:bg-violet-500/20 transition-all flex items-center justify-center">
                                                <Plus className="w-8 h-8 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" />
                                            </div>
                                            <div className="absolute bottom-0 left-0 right-0 p-1.5 bg-gradient-to-t from-black/70 to-transparent">
                                                <p className="text-[9px] text-white font-medium truncate">{item.filename}</p>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* URL input fallback */}
                        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/50">
                            <p className="text-xs text-gray-500 mb-2 font-bold">O pega una URL de imagen directamente:</p>
                            <form onSubmit={(e) => {
                                e.preventDefault();
                                const input = (e.target as HTMLFormElement).elements.namedItem('customUrl') as HTMLInputElement;
                                if (input.value && pickerTarget) {
                                    handleCustomUrl(pickerTarget.key, pickerTarget.index, input.value);
                                    setPickerOpen(false);
                                }
                            }} className="flex gap-2">
                                <input name="customUrl" type="url" placeholder="https://ejemplo.com/imagen.jpg"
                                    className="flex-1 px-4 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-violet-200" />
                                <button type="submit" className="px-5 py-2 bg-violet-600 text-white rounded-xl text-sm font-bold hover:bg-violet-700 transition-colors">
                                    Usar URL
                                </button>
                            </form>
                        </div>
                    </div>
                </div>
            )}
        </AdminLayout>
    );
};

export default ImageDistribution;
