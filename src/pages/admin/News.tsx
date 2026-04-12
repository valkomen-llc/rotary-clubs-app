import React, { useEffect, useState } from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import {
    Plus, Edit2, Trash2, Search, Newspaper, X, Upload,
    Globe, Image as ImageIcon, Video, Tag, ChevronRight
} from 'lucide-react';
import { toast } from 'sonner';
import { useClub } from '../../contexts/ClubContext';
import { articulosDestacados, articulos as articulosEstaticos } from '../../data/news';
import SEOPreview from '../../components/admin/SEOPreview';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';

interface Post {
    id: string;
    title: string;
    content: string;
    image: string | null;
    published: boolean;
    category?: string;
    tags?: string[];
    keywords?: string;
    seoTitle?: string;
    seoDescription?: string;
    videoUrl?: string;
    images?: string[];
    createdAt: string;
    isStatic?: boolean;
}

const NewsManagement: React.FC = () => {
    const { club } = useClub();
    const [posts, setPosts] = useState<Post[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingPost, setEditingPost] = useState<Post | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [activeTab, setActiveTab] = useState<'content' | 'gallery' | 'seo'>('content');
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    const [formData, setFormData] = useState({
        title: '',
        content: '',
        image: '',
        published: true,
        category: '',
        tags: [] as string[],
        keywords: '',
        seoTitle: '',
        seoDescription: '',
        videoUrl: '',
        images: [] as string[],
    });

    const [tagInput, setTagInput] = useState('');

    useEffect(() => {
        if (club?.id) {
            fetchPosts();
        }
    }, [club?.id]);

    const fetchPosts = async () => {
        setSelectedIds(new Set()); // Reset selection on refresh
        const staticMapped: Post[] = [...articulosDestacados, ...articulosEstaticos].map(art => ({
            id: `static-${art.id}`,
            title: art.titulo,
            content: art.resumen,
            image: art.imagen,
            published: true,
            createdAt: art.fecha,
            isStatic: true
        }));

        try {
            const token = localStorage.getItem('rotary_token');
            const response = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/admin/posts`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                const dbPosts = await response.json();
                setPosts([...dbPosts, ...staticMapped]);
            } else {
                setPosts(staticMapped);
            }
        } catch (error) {
            setPosts(staticMapped);
        }
    };

    const handleOpenModal = (post?: Post) => {
        setActiveTab('content');
        if (post) {
            const initialData = {
                title: post.title || '',
                content: post.content || '',
                image: post.image || '',
                published: post.isStatic ? true : post.published,
                category: post.category || '',
                tags: post.tags || [],
                keywords: post.keywords || '',
                seoTitle: post.seoTitle || '',
                seoDescription: post.seoDescription || '',
                videoUrl: post.videoUrl || '',
                images: post.images || [],
            };

            if (post.isStatic) {
                setEditingPost(null);
                setFormData(initialData);
                toast.info('Clonando noticia estática para edición.');
            } else {
                setEditingPost(post);
                setFormData(initialData);
            }
        } else {
            setEditingPost(null);
            setFormData({
                title: '',
                content: '',
                image: '',
                published: true,
                category: '',
                tags: [],
                keywords: '',
                seoTitle: '',
                seoDescription: '',
                videoUrl: '',
                images: [],
            });
        }
        setIsModalOpen(true);
    };

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, isGallery = false) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        setUploading(true);
        const token = localStorage.getItem('rotary_token');
        const apiUrl = import.meta.env.VITE_API_URL || '/api';

        try {
            for (let i = 0; i < files.length; i++) {
                const uploadData = new FormData();
                uploadData.append('file', files[i]);
                uploadData.append('folder', 'news');

                const targetUrl = `${apiUrl}/media/upload?folder=news&clubId=${club.id}`.replace(/\/+/g, '/').replace(':/', '://');
                const response = await fetch(targetUrl, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` },
                    body: uploadData
                });

                if (response.ok) {
                    const data = await response.json();
                    if (isGallery) {
                        setFormData(prev => ({ ...prev, images: [...prev.images, data.url] }));
                    } else {
                        setFormData(prev => ({ ...prev, image: data.url }));
                    }
                }
            }
            toast.success(isGallery ? 'Fotos añadidas a la galería' : 'Imagen de portada actualizada');
        } catch (error) {
            toast.error('Error al subir imagen');
        } finally {
            setUploading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);

        try {
            const token = localStorage.getItem('rotary_token');
            const apiUrl = import.meta.env.VITE_API_URL || '/api';
            const url = editingPost
                ? `${apiUrl}/admin/posts/${editingPost.id}`
                : `${apiUrl}/admin/posts`;

            const response = await fetch(url, {
                method: editingPost ? 'PUT' : 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(formData)
            });

            if (response.ok) {
                toast.success(editingPost ? 'Noticia actualizada' : 'Noticia creada');
                setIsModalOpen(false);
                fetchPosts();
            }
        } catch (error: any) {
            toast.error('Error al guardar');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async (post: Post) => {
        if (post.isStatic) return;
        if (!window.confirm(`¿Eliminar "${post.title}"?`)) return;

        try {
            const token = localStorage.getItem('rotary_token');
            const response = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/admin/posts/${post.id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.ok) {
                toast.success('Noticia eliminada');
                fetchPosts();
            }
        } catch (error: any) {
            toast.error('Error al eliminar');
        }
    };

    const handleSelectAll = () => {
        if (selectedIds.size === filteredPosts.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(filteredPosts.map(p => p.id)));
        }
    };

    const handleSelectOne = (id: string) => {
        const newSelected = new Set(selectedIds);
        if (newSelected.has(id)) {
            newSelected.delete(id);
        } else {
            newSelected.add(id);
        }
        setSelectedIds(newSelected);
    };

    const handleBulkDelete = async () => {
        const total = selectedIds.size;
        const dbIds = Array.from(selectedIds).filter(id => !id.startsWith('static-'));
        const staticCount = total - dbIds.length;

        if (total === 0) return;
        
        let confirmMsg = `¿Eliminar de forma masiva ${total} noticias seleccionadas?`;
        if (staticCount > 0) {
            confirmMsg += `\nNota: ${staticCount} noticias estáticas no se pueden borrar de la base de datos y serán ignoradas.`;
        }
        
        if (!window.confirm(confirmMsg)) return;

        if (dbIds.length === 0) {
            toast.info('No hay noticias de la base de datos para borrar.');
            setSelectedIds(new Set());
            return;
        }

        try {
            setIsSubmitting(true);
            const token = localStorage.getItem('rotary_token');
            const response = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/admin/posts/bulk-delete`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ ids: dbIds })
            });

            if (response.ok) {
                toast.success(`${dbIds.length} noticias eliminadas correctamente`);
                fetchPosts();
            }
        } catch (error) {
            toast.error('Error en el borrado masivo');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleAddTag = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && tagInput.trim()) {
            e.preventDefault();
            if (!formData.tags.includes(tagInput.trim())) {
                setFormData(prev => ({ ...prev, tags: [...prev.tags, tagInput.trim()] }));
            }
            setTagInput('');
        }
    };

    const removeTag = (tagToRemove: string) => {
        setFormData(prev => ({ ...prev, tags: prev.tags.filter(t => t !== tagToRemove) }));
    };

    const filteredPosts = posts.filter(p =>
        p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.content.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const quillModules = {
        toolbar: [
            [{ 'header': [1, 2, 3, false] }],
            ['bold', 'italic', 'underline', 'strike'],
            [{ 'list': 'ordered' }, { 'list': 'bullet' }],
            ['link', 'clean']
        ],
    };

    return (
        <AdminLayout>
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">Gestión de Noticias</h1>
                    <p className="text-gray-500 text-sm">Publica artículos, eventos y avisos importantes.</p>
                </div>
                <button
                    onClick={() => handleOpenModal()}
                    className="flex items-center gap-2 bg-rotary-blue text-white px-4 py-2 rounded-lg hover:bg-sky-800 transition-all font-bold shadow-lg shadow-rotary-blue/20"
                >
                    <Plus className="w-5 h-5" /> Nueva Noticia
                </button>
            </div>

            <div className="mb-6 flex items-center gap-4">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Buscar noticias..."
                        className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-rotary-blue/20 transition-all"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
                {selectedIds.size > 0 && (
                    <div className="flex items-center gap-3 bg-red-50 border border-red-100 px-4 py-2 rounded-xl animate-in fade-in slide-in-from-top-2 duration-200">
                        <span className="text-xs font-bold text-red-700">{selectedIds.size} seleccionadas</span>
                        <div className="w-px h-4 bg-red-200 mx-1" />
                        <button
                            onClick={handleBulkDelete}
                            className="flex items-center gap-1.5 text-xs font-bold text-red-600 hover:text-red-700 transition-colors"
                        >
                            <Trash2 className="w-4 h-4" /> Borrar todo
                        </button>
                    </div>
                )}
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <table className="w-full text-left">
                    <thead className="bg-gray-50/50 border-b border-gray-100">
                        <tr>
                            <th className="px-6 py-4 w-10">
                                <input
                                    type="checkbox"
                                    className="rounded border-gray-300 text-rotary-blue focus:ring-rotary-blue cursor-pointer"
                                    checked={selectedIds.size > 0 && selectedIds.size === filteredPosts.filter(p => !p.isStatic).length}
                                    onChange={handleSelectAll}
                                />
                            </th>
                            <th className="px-6 py-4 text-[10px] font-extrabold text-gray-400 uppercase tracking-widest">Noticia</th>
                            <th className="px-6 py-4 text-[10px] font-extrabold text-gray-400 uppercase tracking-widest">Fecha</th>
                            <th className="px-6 py-4 text-[10px] font-extrabold text-gray-400 uppercase tracking-widest">Estado</th>
                            <th className="px-6 py-4 text-right text-[10px] font-extrabold text-gray-400 uppercase tracking-widest">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {filteredPosts.map((post) => (
                            <tr key={post.id} className={`hover:bg-gray-50/50 transition-colors ${selectedIds.has(post.id) ? 'bg-rotary-blue/5' : ''}`}>
                                <td className="px-6 py-4">
                                    <input
                                        type="checkbox"
                                        className="rounded border-gray-300 text-rotary-blue focus:ring-rotary-blue cursor-pointer"
                                        checked={selectedIds.has(post.id)}
                                        onChange={() => handleSelectOne(post.id)}
                                    />
                                </td>
                                <td className="px-6 py-4">
                                    <div className="flex items-center gap-4">
                                        <div className="w-14 h-14 rounded-xl bg-gray-100 overflow-hidden flex-shrink-0 border border-gray-200">
                                            {post.image ? (
                                                <img src={post.image} alt="" className="w-full h-full object-cover" crossOrigin="anonymous" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-gray-300">
                                                    <Newspaper className="w-6 h-6" />
                                                </div>
                                            )}
                                        </div>
                                        <div className="max-w-md">
                                            <p className="font-bold text-gray-800 line-clamp-1">{post.title}</p>
                                            <div className="flex items-center gap-2 mt-1">
                                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${post.isStatic ? 'bg-rotary-gold/10 text-rotary-gold border border-rotary-gold/20' : 'bg-rotary-blue/10 text-rotary-blue border border-rotary-blue/20'}`}>
                                                    {post.isStatic ? 'ESTÁTICO' : 'DATABASE'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-6 py-4 text-xs font-bold text-gray-500 uppercase">
                                    {post.isStatic ? post.createdAt : new Date(post.createdAt).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })}
                                </td>
                                <td className="px-6 py-4">
                                    <span className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase ${post.published ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`}>
                                        {post.published ? 'Publicado' : 'Borrador'}
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-right">
                                    <div className="flex justify-end gap-2">
                                        <button onClick={() => handleOpenModal(post)} className="p-2 text-gray-400 hover:text-rotary-blue hover:bg-sky-50 rounded-lg transition-all">
                                            <Edit2 className="w-4 h-4" />
                                        </button>
                                        {!post.isStatic && (
                                            <button onClick={() => handleDelete(post)} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all">
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-5xl overflow-hidden flex flex-col max-h-[92vh] animate-in zoom-in duration-200">
                        {/* Modal Header */}
                        <div className="px-8 py-5 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                            <div>
                                <h2 className="text-xl font-bold text-gray-800">
                                    {editingPost ? 'Editar Artículo' : 'Nueva Noticia'}
                                </h2>
                                <p className="text-xs text-gray-400 font-medium">Gestiona el contenido, multimedia y SEO de tu publicación.</p>
                            </div>
                            <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-white rounded-full text-gray-400 transition-colors shadow-sm">
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        {/* Tabs Navigation */}
                        <div className="flex px-8 border-b border-gray-100 bg-white sticky top-0 z-10">
                            {[
                                { id: 'content', label: 'Contenido', icon: Newspaper },
                                { id: 'gallery', label: 'Galería & Media', icon: ImageIcon },
                                { id: 'seo', label: 'SEO & Tráfico', icon: Globe }
                            ].map(tab => (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id as any)}
                                    className={`flex items-center gap-2 px-6 py-4 text-sm font-bold transition-all border-b-2 ${activeTab === tab.id
                                        ? 'border-rotary-blue text-rotary-blue'
                                        : 'border-transparent text-gray-400 hover:text-gray-600'
                                        }`}
                                >
                                    <tab.icon className="w-4 h-4" />
                                    {tab.label}
                                </button>
                            ))}
                        </div>

                        {/* Form Body */}
                        <div className="flex-1 overflow-y-auto p-8">
                            <form id="newsForm" onSubmit={handleSubmit} className="space-y-8">

                                {activeTab === 'content' && (
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8 animate-in slide-in-from-right-4 duration-300">
                                        <div className="md:col-span-2 space-y-6">
                                            <div>
                                                <label className="block text-sm font-bold text-gray-700 mb-2">Título de la Noticia</label>
                                                <input
                                                    type="text" required
                                                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-rotary-blue/20 outline-none transition-all font-bold text-lg"
                                                    value={formData.title}
                                                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                                    placeholder="Escribe un titular llamativo..."
                                                />
                                            </div>

                                            <div>
                                                <label className="block text-sm font-bold text-gray-700 mb-2">Cuerpo de la Noticia (Editor Visual)</label>
                                                <div className="rounded-xl border border-gray-200 overflow-hidden bg-white">
                                                    <ReactQuill
                                                        theme="snow"
                                                        value={formData.content}
                                                        onChange={(val) => setFormData({ ...formData, content: val })}
                                                        modules={quillModules}
                                                        className="h-80 mb-12"
                                                    />
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <label className="block text-sm font-bold text-gray-700 mb-2">Categoría</label>
                                                    <input
                                                        type="text"
                                                        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-rotary-blue/20 outline-none"
                                                        value={formData.category}
                                                        onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                                                        placeholder="Ej: Eventos, Proyectos, Servicio"
                                                    />
                                                </div>
                                                <div className="flex flex-col">
                                                    <label className="block text-sm font-bold text-gray-700 mb-2">Estado</label>
                                                    <label className="flex items-center gap-3 cursor-pointer group h-full">
                                                        <div className={`w-10 h-6 rounded-full transition-all relative ${formData.published ? 'bg-green-500' : 'bg-gray-200'}`}>
                                                            <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${formData.published ? 'left-5' : 'left-1'}`} />
                                                        </div>
                                                        <input
                                                            type="checkbox"
                                                            className="hidden"
                                                            checked={formData.published}
                                                            onChange={(e) => setFormData({ ...formData, published: e.target.checked })}
                                                        />
                                                        <span className="text-sm font-bold text-gray-700 group-hover:text-rotary-blue transition-colors">Publicado</span>
                                                    </label>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="space-y-6">
                                            <div>
                                                <label className="block text-sm font-bold text-gray-700 mb-2">Imagen de Portada</label>
                                                <div className="aspect-square rounded-2xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center bg-gray-50 overflow-hidden relative group">
                                                    {formData.image ? (
                                                        <>
                                                            <img src={formData.image} alt="" className="w-full h-full object-cover" crossOrigin="anonymous" />
                                                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                                <button type="button" onClick={() => setFormData({ ...formData, image: '' })} className="bg-red-500 text-white p-2 rounded-full"><X className="w-4 h-4" /></button>
                                                            </div>
                                                        </>
                                                    ) : (
                                                        <div className="text-center p-4">
                                                            <Upload className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                                                            <p className="text-[10px] text-gray-400 font-bold uppercase">Haz clic para subir portada</p>
                                                        </div>
                                                    )}
                                                    <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" accept="image/*" onChange={(e) => handleImageUpload(e)} disabled={uploading} />
                                                </div>
                                            </div>

                                            <div className="p-4 bg-rotary-blue/5 rounded-2xl border border-rotary-blue/10">
                                                <h4 className="text-xs font-bold text-rotary-blue uppercase mb-2">Tips Pro</h4>
                                                <p className="text-[10px] text-gray-500 leading-relaxed font-medium">
                                                    Asegúrate de que la imagen de portada sea de alta calidad. El título debe resumir claramente el evento o noticia para atraer lectores.
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {activeTab === 'gallery' && (
                                    <div className="space-y-8 animate-in slide-in-from-right-4 duration-300">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            <div className="p-6 bg-gray-50 rounded-2xl border border-gray-200 border-dashed flex flex-col items-center justify-center text-center">
                                                <Video className="w-10 h-10 text-gray-300 mb-2" />
                                                <label className="block text-sm font-bold text-gray-700 mb-3">Video de la Noticia (YouTube/Vimeo)</label>
                                                <input
                                                    type="url"
                                                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-rotary-blue/20 outline-none text-sm font-medium"
                                                    value={formData.videoUrl}
                                                    onChange={(e) => setFormData({ ...formData, videoUrl: e.target.value })}
                                                    placeholder="URL del video..."
                                                />
                                            </div>

                                            <div className="group relative p-6 bg-gray-900 border border-gray-800 rounded-2xl flex flex-col items-center justify-center text-center overflow-hidden">
                                                <div className="relative z-10 text-white">
                                                    <Upload className="w-10 h-10 text-rotary-gold mb-2 mx-auto" />
                                                    <label className="block text-sm font-bold mb-1">Galería de Imágenes</label>
                                                    <p className="text-[10px] text-gray-400 font-bold uppercase mb-4">Click para seleccionar múltiples</p>
                                                </div>
                                                <input type="file" multiple className="absolute inset-0 opacity-0 cursor-pointer" accept="image/*" onChange={(e) => handleImageUpload(e, true)} disabled={uploading} />
                                                <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                                            </div>
                                        </div>

                                        <div className="space-y-4">
                                            <h4 className="font-bold text-gray-800 flex items-center gap-2">
                                                <ImageIcon className="w-4 h-4 text-rotary-blue" /> Imágenes en Galería ({formData.images.length})
                                            </h4>
                                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                                                {formData.images.map((url, idx) => (
                                                    <div key={idx} className="aspect-square rounded-xl overflow-hidden border border-gray-100 relative group shadow-sm bg-gray-50">
                                                        <img src={url} alt="" className="w-full h-full object-cover" crossOrigin="anonymous" />
                                                        <button
                                                            type="button"
                                                            onClick={() => setFormData(prev => ({ ...prev, images: prev.images.filter((_, i) => i !== idx) }))}
                                                            className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                                                        >
                                                            <X className="w-3 h-3" />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {activeTab === 'seo' && (
                                    <div className="space-y-8 animate-in slide-in-from-right-4 duration-300">
                                        <div className="p-6 bg-rotary-gold/5 rounded-2xl border border-rotary-gold/10 flex items-center gap-4">
                                            <Globe className="w-8 h-8 text-rotary-gold" />
                                            <div>
                                                <h4 className="font-bold text-gray-800">Optimización SEO</h4>
                                                <p className="text-xs text-gray-500 font-medium">Maximiza el alcance de esta noticia en Google y otros buscadores.</p>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                            <div className="space-y-6">
                                                <div>
                                                    <label className="block text-sm font-bold text-gray-700 mb-2">Meta Título (SEO)</label>
                                                    <input
                                                        type="text"
                                                        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-rotary-blue/20 outline-none font-medium"
                                                        value={formData.seoTitle}
                                                        onChange={(e) => setFormData({ ...formData, seoTitle: e.target.value })}
                                                        placeholder="Titular para buscadores..."
                                                    />
                                                </div>

                                                <div>
                                                    <label className="block text-sm font-bold text-gray-700 mb-2">Meta Descripción</label>
                                                    <textarea
                                                        rows={4}
                                                        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-rotary-blue/20 outline-none resize-none"
                                                        value={formData.seoDescription}
                                                        onChange={(e) => setFormData({ ...formData, seoDescription: e.target.value })}
                                                        placeholder="Pequeño resumen de 160 caracteres..."
                                                    />
                                                </div>
                                            </div>

                                            <SEOPreview
                                                title={formData.seoTitle || formData.title}
                                                description={formData.seoDescription}
                                                url={`https://${(club as any)?.domain || 'tusitio.org'}/#/blog/${editingPost?.id || 'nuevo'}`}
                                                image={formData.image}
                                            />
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-8">
                                                <div>
                                                    <label className="block text-sm font-bold text-gray-700 mb-2">Palabras Clave (Keywords)</label>
                                                    <input
                                                        type="text"
                                                        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-rotary-blue/20 outline-none"
                                                        value={formData.keywords}
                                                        onChange={(e) => setFormData({ ...formData, keywords: e.target.value })}
                                                        placeholder="Separadas por comas..."
                                                    />
                                                </div>

                                                <div>
                                                    <label className="block text-sm font-bold text-gray-700 mb-2">Etiquetas (Tags)</label>
                                                    <div className="space-y-3">
                                                        <div className="relative">
                                                            <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                                            <input
                                                                type="text"
                                                                className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-rotary-blue/20 outline-none"
                                                                value={tagInput}
                                                                onChange={(e) => setTagInput(e.target.value)}
                                                                onKeyDown={handleAddTag}
                                                                placeholder="Escribe y presiona Enter..."
                                                            />
                                                        </div>
                                                        <div className="flex flex-wrap gap-2">
                                                            {formData.tags.map(tag => (
                                                                <span key={tag} className="flex items-center gap-1.5 px-3 py-1 bg-gray-100 text-gray-600 rounded-full text-xs font-bold border border-gray-200">
                                                                    #{tag}
                                                                    <button type="button" onClick={() => removeTag(tag)} className="hover:text-red-500"><X className="w-3 h-3" /></button>
                                                                </span>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </div>
                                        </div>
                                    </div>
                                )}
                            </form>
                        </div>

                        {/* Modal Footer */}
                        <div className="p-8 border-t border-gray-100 bg-gray-50 flex justify-between items-center">
                            <button type="button" onClick={() => setIsModalOpen(false)} className="px-6 py-2.5 text-gray-500 font-bold hover:text-gray-700 transition-colors">Cancelar</button>
                            <div className="flex items-center gap-6">
                                <div className="hidden md:flex flex-col items-end">
                                    <span className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest">Paso Actual</span>
                                    <span className="text-xs font-bold text-rotary-blue">
                                        {activeTab === 'content' ? '1. Redacción' :
                                            activeTab === 'gallery' ? '2. Multimedia' : '3. SEO & Indexación'}
                                    </span>
                                </div>
                                <button
                                    form="newsForm"
                                    type="submit"
                                    disabled={isSubmitting || uploading}
                                    className="bg-rotary-blue text-white px-10 py-3 rounded-2xl font-bold hover:bg-sky-800 transition-all shadow-xl shadow-rotary-blue/20 disabled:opacity-50 flex items-center gap-2"
                                >
                                    {isSubmitting ? 'Guardando...' : (editingPost ? 'Guardar Cambios' : 'Publicar Noticia')}
                                    <ChevronRight className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </AdminLayout>
    );
};

export default NewsManagement;
