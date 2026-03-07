import React, { useEffect, useState } from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import { Plus, Edit2, Trash2, Search, Filter, Newspaper, X, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { useClub } from '../../contexts/ClubContext';
import { articulosDestacados, articulos as articulosEstaticos } from '../../data/news';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';

interface Post {
    id: string;
    title: string;
    content: string;
    image: string | null;
    published: boolean;
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

    const [formData, setFormData] = useState({
        title: '',
        content: '',
        image: '',
        published: true,
    });

    useEffect(() => {
        if (club?.id) {
            fetchPosts();
        }
    }, [club?.id]);

    const fetchPosts = async () => {
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
        if (post) {
            const initialData = {
                title: post.title,
                content: post.content,
                image: post.image || '',
                published: post.isStatic ? true : post.published,
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
            });
        }
        setIsModalOpen(true);
    };

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploading(true);
        const uploadData = new FormData();
        uploadData.append('file', file);
        uploadData.append('folder', 'news');

        try {
            const token = localStorage.getItem('rotary_token');
            const apiUrl = import.meta.env.VITE_API_URL || '/api';
            const targetUrl = `${apiUrl}/media/upload?folder=news&clubId=${club.id}`.replace(/\/+/g, '/').replace(':/', '://');

            const response = await fetch(targetUrl, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: uploadData
            });

            if (response.ok) {
                const data = await response.json();
                setFormData(prev => ({ ...prev, image: data.url }));
                toast.success('Imagen subida');
            }
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

            <div className="mb-6 flex gap-4">
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
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <table className="w-full text-left">
                    <thead className="bg-gray-50/50 border-b border-gray-100">
                        <tr>
                            <th className="px-6 py-4 text-[10px] font-extrabold text-gray-400 uppercase tracking-widest">Noticia</th>
                            <th className="px-6 py-4 text-[10px] font-extrabold text-gray-400 uppercase tracking-widest">Fecha</th>
                            <th className="px-6 py-4 text-[10px] font-extrabold text-gray-400 uppercase tracking-widest">Estado</th>
                            <th className="px-6 py-4 text-right text-[10px] font-extrabold text-gray-400 uppercase tracking-widest">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {filteredPosts.map((post) => (
                            <tr key={post.id} className="hover:bg-gray-50/50 transition-colors">
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
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[92vh] animate-in zoom-in duration-200">
                        <div className="px-8 py-5 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                            <h2 className="text-xl font-bold text-gray-800">
                                {editingPost ? 'Editar Artículo' : 'Nueva Noticia'}
                            </h2>
                            <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-white rounded-full text-gray-400 transition-colors shadow-sm">
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-8 space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                                <div className="space-y-4">
                                    <label className="block text-sm font-bold text-gray-700">Imagen de Portada</label>
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
                                                <Newspaper className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                                                <p className="text-[10px] text-gray-400 font-bold uppercase">Click para subir foto</p>
                                            </div>
                                        )}
                                        <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" accept="image/*" onChange={handleImageUpload} disabled={uploading} />
                                    </div>
                                </div>

                                <div className="md:col-span-2 space-y-6">
                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 mb-2">Título de la Noticia</label>
                                        <input
                                            type="text" required
                                            className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-rotary-blue/20 outline-none transition-all font-bold text-lg"
                                            value={formData.title}
                                            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                            placeholder="Escribe un titular impactante..."
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 mb-2">Contenido del Artículo (Editor Visual)</label>
                                        <div className="rounded-xl border border-gray-200 overflow-hidden">
                                            <ReactQuill
                                                theme="snow"
                                                value={formData.content}
                                                onChange={(val) => setFormData({ ...formData, content: val })}
                                                modules={quillModules}
                                                className="h-80 mb-12"
                                            />
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-4 py-4">
                                        <label className="flex items-center gap-3 cursor-pointer group">
                                            <div className={`w-10 h-6 rounded-full transition-all relative ${formData.published ? 'bg-green-500' : 'bg-gray-200'}`}>
                                                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${formData.published ? 'left-5' : 'left-1'}`} />
                                            </div>
                                            <input
                                                type="checkbox"
                                                className="hidden"
                                                checked={formData.published}
                                                onChange={(e) => setFormData({ ...formData, published: e.target.checked })}
                                            />
                                            <span className="text-sm font-bold text-gray-700 group-hover:text-rotary-blue transition-colors">Publicar inmediatamente</span>
                                        </label>
                                    </div>
                                </div>
                            </div>
                        </form>

                        <div className="p-8 border-t border-gray-100 bg-gray-50 flex justify-end gap-3">
                            <button type="button" onClick={() => setIsModalOpen(false)} className="px-6 py-2.5 text-gray-500 font-bold hover:text-gray-700 transition-colors">Cancelar</button>
                            <button
                                onClick={handleSubmit}
                                disabled={isSubmitting || uploading}
                                className="bg-rotary-blue text-white px-10 py-3 rounded-2xl font-bold hover:bg-sky-800 transition-all shadow-xl shadow-rotary-blue/20 disabled:opacity-50"
                            >
                                {isSubmitting ? 'Guardando...' : (editingPost ? 'Guardar Cambios' : 'Publicar Noticia')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </AdminLayout>
    );
};

export default NewsManagement;
