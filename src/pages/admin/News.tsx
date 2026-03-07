import React, { useEffect, useState } from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import { Plus, Edit2, Trash2, Search, Filter, Newspaper, X, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { useClub } from '../../contexts/ClubContext';
import { articulosDestacados, articulos as articulosEstaticos } from '../../data/news';

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
        try {
            const token = localStorage.getItem('rotary_token');
            const response = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/admin/posts`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                const dbPosts = await response.json();

                // Concatenate static posts for visualization
                const staticMapped: Post[] = [...articulosDestacados, ...articulosEstaticos].map(art => ({
                    id: `static-${art.id}`,
                    title: art.titulo,
                    content: art.resumen, // Using summary as content for static
                    image: art.imagen,
                    published: true,
                    createdAt: art.fecha,
                    isStatic: true
                }));

                setPosts([...dbPosts, ...staticMapped]);
            }
        } catch (error) {
            toast.error('Error al cargar noticias');
        }
    };

    const handleOpenModal = (post?: Post) => {
        if (post) {
            if (post.isStatic) {
                // If it's static, we allow "editing" but it will be saved as a new DB post
                setEditingPost(null);
                setFormData({
                    title: post.title,
                    content: post.content,
                    image: post.image || '',
                    published: true,
                });
                toast.info('Esta es una noticia estática. Al guardar, se creará una copia editable en la base de datos.');
            } else {
                setEditingPost(post);
                setFormData({
                    title: post.title,
                    content: post.content,
                    image: post.image || '',
                    published: post.published,
                });
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
                toast.success('Imagen subida con éxito');
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
                toast.success(editingPost ? 'Noticia actualizada' : 'Noticia creada con éxito');
                setIsModalOpen(false);
                fetchPosts();
            } else {
                const data = await response.json();
                throw new Error(data.error || 'Error al procesar la solicitud');
            }
        } catch (error: any) {
            toast.error(error.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async (post: Post) => {
        if (post.isStatic) {
            toast.error('No se pueden eliminar noticias estáticas del sistema.');
            return;
        }

        if (!window.confirm(`¿Estás seguro de eliminar "${post.title}"?`)) return;

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
            toast.error('No se pudo eliminar la noticia');
        }
    };

    const filteredPosts = posts.filter(p =>
        p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.content.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <AdminLayout>
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">Gestión de Noticias</h1>
                    <p className="text-gray-500 text-sm">Crea y administra los artículos del blog de tu club.</p>
                </div>
                <button
                    onClick={() => handleOpenModal()}
                    className="flex items-center gap-2 bg-rotary-blue text-white px-4 py-2 rounded-lg hover:bg-sky-800 transition-colors"
                >
                    <Plus className="w-4 h-4" /> Nueva Noticia
                </button>
            </div>

            <div className="mb-6 flex gap-4">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Buscar noticias..."
                        className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-rotary-blue transition-all"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
                <button className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">
                    <Filter className="w-4 h-4" /> Filtros
                </button>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <table className="w-full text-left">
                    <thead className="bg-gray-50 border-b border-gray-100">
                        <tr>
                            <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Noticia</th>
                            <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Fecha</th>
                            <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Estado</th>
                            <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Origen</th>
                            <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider text-right">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {filteredPosts.map((post) => (
                            <tr key={post.id} className="hover:bg-gray-50 transition-colors">
                                <td className="px-6 py-4">
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 rounded-lg bg-gray-100 overflow-hidden flex-shrink-0 animate-pulse-slow">
                                            {post.image ? (
                                                <img src={post.image} alt="" className="w-full h-full object-cover" crossOrigin="anonymous" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-gray-300">
                                                    <Newspaper className="w-6 h-6" />
                                                </div>
                                            )}
                                        </div>
                                        <div className="max-w-xs md:max-w-md">
                                            <p className="font-bold text-gray-800 truncate">{post.title}</p>
                                            <p className="text-xs text-gray-400 truncate">{post.content}</p>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-6 py-4 text-sm text-gray-500">
                                    {post.isStatic ? post.createdAt : new Date(post.createdAt).toLocaleDateString()}
                                </td>
                                <td className="px-6 py-4">
                                    <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase ${post.published ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`}>
                                        {post.published ? 'Publicado' : 'Borrador'}
                                    </span>
                                </td>
                                <td className="px-6 py-4">
                                    <span className={`text-[10px] font-bold ${post.isStatic ? 'text-rotary-gold' : 'text-rotary-blue'}`}>
                                        {post.isStatic ? 'ESTÁTICO' : 'BASE DE DATOS'}
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-right">
                                    <div className="flex justify-end gap-2">
                                        <button
                                            onClick={() => handleOpenModal(post)}
                                            className="p-2 text-gray-400 hover:text-rotary-blue transition-colors"
                                        >
                                            <Edit2 className="w-4 h-4" />
                                        </button>
                                        {!post.isStatic && (
                                            <button
                                                onClick={() => handleDelete(post)}
                                                className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {filteredPosts.length === 0 && (
                    <div className="p-12 text-center text-gray-400">
                        No se encontraron noticias.
                    </div>
                )}
            </div>

            {/* Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl overflow-hidden animate-in zoom-in duration-200 overflow-y-auto max-h-[90vh]">
                        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center sticky top-0 bg-white z-10">
                            <h2 className="text-lg font-bold text-gray-800">
                                {editingPost ? 'Editar Noticia' : 'Nueva Noticia'}
                            </h2>
                            <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="p-6 grid grid-cols-1 md:grid-cols-3 gap-8">
                            {/* Left Col: Image */}
                            <div className="space-y-4">
                                <label className="block text-sm font-bold text-gray-700">Imagen de Portada</label>
                                <div className="aspect-square rounded-xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center bg-gray-50 overflow-hidden relative">
                                    {formData.image ? (
                                        <>
                                            <img src={formData.image} alt="" className="w-full h-full object-cover" crossOrigin="anonymous" />
                                            <button
                                                type="button"
                                                onClick={() => setFormData({ ...formData, image: '' })}
                                                className="absolute top-2 right-2 p-1 bg-red-500 text-white rounded-full hover:bg-red-600 shadow-sm"
                                            >
                                                <X className="w-3 h-3" />
                                            </button>
                                        </>
                                    ) : (
                                        <div className="text-center p-4">
                                            <Newspaper className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                                            <p className="text-xs text-gray-400">Sube una imagen llamativa para tu noticia.</p>
                                        </div>
                                    )}
                                </div>
                                <label className="w-full flex items-center justify-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg font-bold cursor-pointer transition-all border border-gray-200">
                                    <Upload className="w-4 h-4" />
                                    {uploading ? 'Subiendo...' : 'Subir Imagen'}
                                    <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} disabled={uploading} />
                                </label>
                            </div>

                            {/* Right Col: Fields */}
                            <div className="md:col-span-2 space-y-6">
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1">Título de la Noticia</label>
                                    <input
                                        type="text"
                                        required
                                        className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-rotary-blue outline-none transition-all font-bold text-lg"
                                        value={formData.title}
                                        onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                        placeholder="Escribe un titular impactante..."
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1">Contenido / Cuerpo</label>
                                    <textarea
                                        required
                                        rows={10}
                                        className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-rotary-blue outline-none transition-all resize-none"
                                        value={formData.content}
                                        onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                                        placeholder="De qué trata esta noticia..."
                                    />
                                </div>

                                <div className="flex items-center gap-4 py-4 border-t border-gray-50">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            className="w-4 h-4 rounded border-gray-300 text-rotary-blue focus:ring-rotary-blue"
                                            checked={formData.published}
                                            onChange={(e) => setFormData({ ...formData, published: e.target.checked })}
                                        />
                                        <span className="text-sm font-bold text-gray-700">Publicar inmediatamente</span>
                                    </label>
                                </div>

                                <div className="flex justify-end gap-3 pt-6">
                                    <button
                                        type="button"
                                        onClick={() => setIsModalOpen(false)}
                                        className="px-6 py-2 text-gray-500 font-bold hover:text-gray-700 transition-colors"
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={isSubmitting || uploading}
                                        className="bg-rotary-blue text-white px-8 py-2 rounded-full font-bold hover:bg-sky-800 transition-all shadow-lg shadow-rotary-blue/20 disabled:opacity-50"
                                    >
                                        {isSubmitting ? 'Guardando...' : (editingPost ? 'Guardar Cambios' : 'Crear Noticia')}
                                    </button>
                                </div>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </AdminLayout>
    );
};

export default NewsManagement;
