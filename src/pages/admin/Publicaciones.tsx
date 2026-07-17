import React, { useEffect, useMemo, useState } from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import {
    Plus, Edit2, Trash2, Search, Megaphone, X, Upload, Image as ImageIcon,
    Loader2, CheckCircle, Globe, Users, Building2, Check
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../hooks/useAuth';
import { compressImage } from '../../utils/compressImage';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';

const API = import.meta.env.VITE_API_URL || '/api';

interface ClubLite {
    id: string;
    name: string;
    category?: string;
    city?: string;
    logo?: string | null;
    domain?: string | null;
    subdomain?: string | null;
}

interface Publication {
    id: string;
    title: string;
    slug?: string;
    content: string;
    image: string | null;
    published: boolean;
    category?: string;
    tags?: string[];
    seoTitle?: string;
    seoDescription?: string;
    targetClubIds?: string[];
    createdAt: string;
}

const emptyForm = {
    id: '',
    title: '',
    slug: '',
    content: '',
    image: '',
    category: '',
    tags: '' as string,
    seoTitle: '',
    seoDescription: '',
    published: true,
    targetClubIds: [] as string[],
};

const slugify = (s: string) =>
    s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-').replace(/-+/g, '-');

const CATEGORY_LABELS: Record<string, string> = {
    club: 'Club', association: 'Asociación', exchange_program: 'Prog. Intercambio',
    event: 'Evento', conference: 'Conferencia', project_fair: 'Feria de Proyectos',
    foundation: 'Fundación', district: 'Distrito',
};

const Publicaciones: React.FC = () => {
    const { user } = useAuth();
    const isSuperAdmin = user?.role === 'administrator';

    const [publications, setPublications] = useState<Publication[]>([]);
    const [clubs, setClubs] = useState<ClubLite[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [clubSearch, setClubSearch] = useState('');
    const [form, setForm] = useState({ ...emptyForm });

    const token = () => localStorage.getItem('rotary_token');
    const authHeaders = () => ({ Authorization: `Bearer ${token()}` });

    const fetchAll = async () => {
        setLoading(true);
        try {
            const [pubRes, clubRes] = await Promise.all([
                fetch(`${API}/admin/publications`, { headers: authHeaders() }),
                fetch(`${API}/admin/clubs`, { headers: authHeaders() }),
            ]);
            if (pubRes.ok) setPublications(await pubRes.json());
            if (clubRes.ok) setClubs(await clubRes.json());
        } catch (e) {
            toast.error('No se pudieron cargar las publicaciones');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (isSuperAdmin) fetchAll();
        else setLoading(false);
    }, [isSuperAdmin]);

    const clubName = (id: string) => clubs.find((c) => c.id === id)?.name || 'Club';

    const openCreate = () => {
        setForm({ ...emptyForm });
        setClubSearch('');
        setIsModalOpen(true);
    };

    const openEdit = (p: Publication) => {
        setForm({
            id: p.id,
            title: p.title || '',
            slug: p.slug || '',
            content: p.content || '',
            image: p.image || '',
            category: p.category || '',
            tags: (p.tags || []).join(', '),
            seoTitle: p.seoTitle || '',
            seoDescription: p.seoDescription || '',
            published: !!p.published,
            targetClubIds: p.targetClubIds || [],
        });
        setClubSearch('');
        setIsModalOpen(true);
    };

    const uploadImage = async (file: File) => {
        setUploading(true);
        try {
            const processed = await compressImage(file);
            const presignRes = await fetch(
                `${API}/media/presigned-url?fileName=${encodeURIComponent(processed.name)}&fileType=${encodeURIComponent(processed.type)}`,
                { headers: authHeaders() }
            );
            if (!presignRes.ok) throw new Error('presign');
            const { uploadUrl, fileUrl, key } = await presignRes.json();
            const put = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': processed.type }, body: processed });
            if (!put.ok) throw new Error('s3');
            await fetch(`${API}/media/save`, {
                method: 'POST',
                headers: { ...authHeaders(), 'Content-Type': 'application/json' },
                body: JSON.stringify({ clubId: '', fileName: processed.name, fileUrl, s3Key: key, fileType: processed.type, fileSize: processed.size }),
            }).catch(() => {});
            setForm((f) => ({ ...f, image: fileUrl }));
            toast.success('Imagen subida');
        } catch (e) {
            toast.error('Error al subir la imagen');
        } finally {
            setUploading(false);
        }
    };

    const toggleClub = (id: string) =>
        setForm((f) => ({
            ...f,
            targetClubIds: f.targetClubIds.includes(id)
                ? f.targetClubIds.filter((x) => x !== id)
                : [...f.targetClubIds, id],
        }));

    const filteredClubs = useMemo(() => {
        const q = clubSearch.trim().toLowerCase();
        if (!q) return clubs;
        return clubs.filter((c) =>
            c.name?.toLowerCase().includes(q) ||
            c.city?.toLowerCase().includes(q) ||
            c.category?.toLowerCase().includes(q));
    }, [clubs, clubSearch]);

    const allFilteredSelected = filteredClubs.length > 0 && filteredClubs.every((c) => form.targetClubIds.includes(c.id));
    const toggleAllFiltered = () =>
        setForm((f) => {
            if (allFilteredSelected) {
                const ids = new Set(filteredClubs.map((c) => c.id));
                return { ...f, targetClubIds: f.targetClubIds.filter((id) => !ids.has(id)) };
            }
            return { ...f, targetClubIds: [...new Set([...f.targetClubIds, ...filteredClubs.map((c) => c.id)])] };
        });

    const handleSubmit = async () => {
        if (!form.title.trim()) return toast.error('El título es obligatorio');
        if (form.targetClubIds.length === 0) return toast.error('Selecciona al menos un club destino');
        setIsSubmitting(true);
        try {
            const payload = {
                title: form.title,
                slug: form.slug || slugify(form.title),
                content: form.content,
                image: form.image || null,
                published: form.published,
                category: form.category,
                tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
                seoTitle: form.seoTitle,
                seoDescription: form.seoDescription,
                targetClubIds: form.targetClubIds,
            };
            const url = form.id ? `${API}/admin/publications/${form.id}` : `${API}/admin/publications`;
            const res = await fetch(url, {
                method: form.id ? 'PUT' : 'POST',
                headers: { ...authHeaders(), 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || 'Error al guardar');
            }
            toast.success(form.id ? 'Publicación actualizada' : `Publicación difundida a ${form.targetClubIds.length} club(es)`);
            setIsModalOpen(false);
            fetchAll();
        } catch (e: any) {
            toast.error(e.message || 'Error al guardar');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async (p: Publication) => {
        if (!window.confirm(`¿Eliminar "${p.title}"? Dejará de mostrarse en todos los clubes destino.`)) return;
        try {
            const res = await fetch(`${API}/admin/publications/${p.id}`, { method: 'DELETE', headers: authHeaders() });
            if (!res.ok) throw new Error();
            toast.success('Publicación eliminada');
            setPublications((prev) => prev.filter((x) => x.id !== p.id));
        } catch {
            toast.error('No se pudo eliminar');
        }
    };

    const filteredPubs = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        if (!q) return publications;
        return publications.filter((p) => p.title?.toLowerCase().includes(q));
    }, [publications, searchQuery]);

    if (!isSuperAdmin) {
        return (
            <AdminLayout>
                <div className="p-8 text-center text-gray-500">
                    <Megaphone className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                    <p className="font-semibold">Sección solo para administradores de plataforma.</p>
                    <p className="text-sm">Las publicaciones centralizadas se gestionan desde el admin de plataforma.</p>
                </div>
            </AdminLayout>
        );
    }

    return (
        <AdminLayout>
            <div className="p-6 max-w-7xl mx-auto">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                            <Megaphone className="w-6 h-6 text-rotary-gold" />
                            Publicaciones / Difusión
                        </h1>
                        <p className="text-sm text-gray-500 mt-1">
                            Crea un artículo una sola vez y replícalo automáticamente en los sitios de los clubes que elijas.
                            Cada club lo muestra con su propia identidad.
                        </p>
                    </div>
                    <button
                        onClick={openCreate}
                        className="inline-flex items-center gap-2 bg-rotary-blue text-white px-4 py-2.5 rounded-xl font-semibold hover:bg-rotary-blue/90 transition shadow-sm"
                    >
                        <Plus className="w-4 h-4" /> Nueva publicación
                    </button>
                </div>

                {/* Search */}
                <div className="relative mb-4">
                    <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Buscar publicación..."
                        className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rotary-blue/30"
                    />
                </div>

                {/* List */}
                {loading ? (
                    <div className="flex items-center justify-center py-20 text-gray-400">
                        <Loader2 className="w-6 h-6 animate-spin" />
                    </div>
                ) : filteredPubs.length === 0 ? (
                    <div className="text-center py-20 text-gray-400 border border-dashed border-gray-200 rounded-2xl">
                        <Megaphone className="w-10 h-10 mx-auto mb-3 text-gray-300" />
                        <p className="font-medium text-gray-500">Aún no hay publicaciones centralizadas.</p>
                        <p className="text-sm">Crea la primera y elige a qué clubes se replica.</p>
                    </div>
                ) : (
                    <div className="grid gap-3">
                        {filteredPubs.map((p) => (
                            <div key={p.id} className="flex items-center gap-4 bg-white border border-gray-100 rounded-2xl p-4 shadow-sm hover:shadow-md transition">
                                <div className="w-16 h-16 rounded-xl bg-gray-50 flex items-center justify-center overflow-hidden shrink-0">
                                    {p.image ? <img src={p.image} alt="" className="w-full h-full object-cover" /> : <ImageIcon className="w-6 h-6 text-gray-300" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <h3 className="font-semibold text-gray-900 truncate">{p.title || '(Sin título)'}</h3>
                                        {p.published
                                            ? <span className="text-[10px] font-bold uppercase tracking-wide text-green-700 bg-green-50 px-2 py-0.5 rounded-full">Publicada</span>
                                            : <span className="text-[10px] font-bold uppercase tracking-wide text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">Borrador</span>}
                                        {p.category && <span className="text-[10px] font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">{p.category}</span>}
                                    </div>
                                    <div className="flex items-center gap-1.5 mt-1 text-xs text-gray-500">
                                        <Building2 className="w-3.5 h-3.5" />
                                        <span className="truncate">
                                            {(p.targetClubIds || []).length} club(es): {(p.targetClubIds || []).slice(0, 3).map(clubName).join(', ')}
                                            {(p.targetClubIds || []).length > 3 ? '…' : ''}
                                        </span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    <button onClick={() => openEdit(p)} className="p-2 text-gray-400 hover:text-rotary-blue hover:bg-blue-50 rounded-lg transition" title="Editar">
                                        <Edit2 className="w-4 h-4" />
                                    </button>
                                    <button onClick={() => handleDelete(p)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition" title="Eliminar">
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center overflow-y-auto p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl my-8">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white rounded-t-2xl z-10">
                            <h2 className="text-lg font-bold text-gray-900">{form.id ? 'Editar publicación' : 'Nueva publicación'}</h2>
                            <button onClick={() => setIsModalOpen(false)} className="p-2 text-gray-400 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
                        </div>

                        <div className="grid md:grid-cols-3 gap-6 p-6">
                            {/* Left: content */}
                            <div className="md:col-span-2 space-y-4">
                                <div>
                                    <label className="block text-xs font-semibold text-gray-600 mb-1">Título</label>
                                    <input
                                        value={form.title}
                                        onChange={(e) => setForm((f) => ({ ...f, title: e.target.value, slug: f.slug || slugify(e.target.value) }))}
                                        placeholder="Título del artículo"
                                        className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rotary-blue/30"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-gray-600 mb-1">Contenido</label>
                                    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                                        <ReactQuill theme="snow" value={form.content} onChange={(v) => setForm((f) => ({ ...f, content: v }))} />
                                    </div>
                                </div>
                                <div className="grid sm:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-600 mb-1">Categoría</label>
                                        <input value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} placeholder="Ej: Noticias, Proyectos"
                                            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rotary-blue/30" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-600 mb-1">Etiquetas (separadas por coma)</label>
                                        <input value={form.tags} onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))} placeholder="rotary, servicio"
                                            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rotary-blue/30" />
                                    </div>
                                </div>
                                <div className="grid sm:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-600 mb-1">SEO — Título</label>
                                        <input value={form.seoTitle} onChange={(e) => setForm((f) => ({ ...f, seoTitle: e.target.value }))}
                                            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rotary-blue/30" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-600 mb-1">SEO — Descripción</label>
                                        <input value={form.seoDescription} onChange={(e) => setForm((f) => ({ ...f, seoDescription: e.target.value }))}
                                            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rotary-blue/30" />
                                    </div>
                                </div>
                            </div>

                            {/* Right: image + audience + publish */}
                            <div className="space-y-5">
                                {/* Cover image */}
                                <div>
                                    <label className="block text-xs font-semibold text-gray-600 mb-1">Imagen de portada</label>
                                    <div className="border border-dashed border-gray-200 rounded-xl p-3 text-center">
                                        {form.image ? (
                                            <div className="relative">
                                                <img src={form.image} alt="" className="w-full h-32 object-cover rounded-lg" />
                                                <button onClick={() => setForm((f) => ({ ...f, image: '' }))} className="absolute top-1 right-1 bg-black/50 text-white p-1 rounded-full"><X className="w-3.5 h-3.5" /></button>
                                            </div>
                                        ) : (
                                            <label className="cursor-pointer flex flex-col items-center gap-1 py-4 text-gray-400 hover:text-rotary-blue">
                                                {uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
                                                <span className="text-xs">{uploading ? 'Subiendo...' : 'Subir imagen'}</span>
                                                <input type="file" accept="image/*" className="hidden" disabled={uploading}
                                                    onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadImage(f); e.target.value=''; }} />
                                            </label>
                                        )}
                                    </div>
                                </div>

                                {/* Publish toggle */}
                                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                                    <input type="checkbox" checked={form.published} onChange={(e) => setForm((f) => ({ ...f, published: e.target.checked }))} className="rounded" />
                                    Publicada (visible en los sitios destino)
                                </label>

                                {/* Audience selector */}
                                <div>
                                    <div className="flex items-center justify-between mb-1">
                                        <label className="text-xs font-semibold text-gray-600 flex items-center gap-1"><Users className="w-3.5 h-3.5" /> Clubes destino</label>
                                        <span className="text-[11px] font-bold text-rotary-blue bg-blue-50 px-2 py-0.5 rounded-full">{form.targetClubIds.length} seleccionados</span>
                                    </div>
                                    <div className="border border-gray-200 rounded-xl overflow-hidden">
                                        <div className="p-2 border-b border-gray-100 flex items-center gap-2">
                                            <Search className="w-3.5 h-3.5 text-gray-400" />
                                            <input value={clubSearch} onChange={(e) => setClubSearch(e.target.value)} placeholder="Filtrar clubes..." className="flex-1 text-xs focus:outline-none" />
                                        </div>
                                        <button type="button" onClick={toggleAllFiltered} className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-rotary-blue hover:bg-blue-50 border-b border-gray-100">
                                            <Globe className="w-3.5 h-3.5" />
                                            {allFilteredSelected ? 'Quitar todos los visibles' : 'Seleccionar todos los visibles'}
                                        </button>
                                        <div className="max-h-56 overflow-y-auto">
                                            {filteredClubs.length === 0 ? (
                                                <p className="text-xs text-gray-400 text-center py-4">Sin clubes</p>
                                            ) : filteredClubs.map((c) => {
                                                const selected = form.targetClubIds.includes(c.id);
                                                return (
                                                    <button type="button" key={c.id} onClick={() => toggleClub(c.id)}
                                                        className={`w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-gray-50 ${selected ? 'bg-blue-50/60' : ''}`}>
                                                        <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${selected ? 'bg-rotary-blue border-rotary-blue' : 'border-gray-300'}`}>
                                                            {selected && <Check className="w-3 h-3 text-white" />}
                                                        </span>
                                                        <span className="w-6 h-6 rounded bg-gray-100 overflow-hidden flex items-center justify-center shrink-0">
                                                            {c.logo ? <img src={c.logo} alt="" className="w-full h-full object-contain" /> : <Building2 className="w-3 h-3 text-gray-400" />}
                                                        </span>
                                                        <span className="flex-1 min-w-0">
                                                            <span className="block text-xs font-medium text-gray-800 truncate">{c.name}</span>
                                                            <span className="block text-[10px] text-gray-400 truncate">{CATEGORY_LABELS[c.category || ''] || c.category || 'Club'}{c.city ? ` · ${c.city}` : ''}</span>
                                                        </span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                    <p className="text-[11px] text-gray-400 mt-1">La publicación se mostrará solo en los sitios de los clubes marcados, cada uno con su identidad.</p>
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 sticky bottom-0 bg-white rounded-b-2xl">
                            <button onClick={() => setIsModalOpen(false)} className="px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-xl">Cancelar</button>
                            <button onClick={handleSubmit} disabled={isSubmitting}
                                className="inline-flex items-center gap-2 bg-rotary-blue text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-rotary-blue/90 disabled:opacity-60">
                                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                                {form.id ? 'Guardar cambios' : 'Difundir publicación'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </AdminLayout>
    );
};

export default Publicaciones;
