import React, { useEffect, useState } from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import {
    Plus, Edit2, Trash2, Search, Newspaper, X, Upload,
    Globe, Image as ImageIcon, Video, Tag, ChevronRight, Crop, ZoomIn, ZoomOut,
    CheckCircle, Loader2, RotateCw, RefreshCw, Facebook, Linkedin, Share2, Sparkles, MessageSquare
} from 'lucide-react';
import Cropper from 'react-easy-crop';
import type { Area } from 'react-easy-crop';
import { getCroppedImg } from '../../utils/cropImage';
import { toast } from 'sonner';
import { useClub } from '../../contexts/ClubContext';
import { articulosDestacados, articulos as articulosEstaticos } from '../../data/news';
import SEOPreview from '../../components/admin/SEOPreview';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';

interface Post {
    id: string;
    title: string;
    slug?: string;
    content: string;
    image: string | null;
    published: boolean;
    category?: string;
    tags?: string[];
    keywords?: string;
    seoTitle?: string;
    seoDescription?: string;
    seoImage?: string;
    socialCopy?: string;
    ctaCopy?: string;
    videoUrl?: string;
    images?: string[];
    videoGallery?: string[];
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
    const [isGeneratingSlug, setIsGeneratingSlug] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [activeTab, setActiveTab] = useState<'content' | 'gallery' | 'seo' | 'social'>('content');
    const [cropTarget, setCropTarget] = useState<'image' | 'seoImage'>('image');
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    const [formData, setFormData] = useState({
        title: '',
        slug: '',
        content: '',
        image: '',
        published: true,
        category: '',
        tags: [] as string[],
        keywords: '',
        seoTitle: '',
        seoDescription: '',
        seoImage: '',
        socialCopy: '',
        ctaCopy: '',
        videoUrl: '',
        images: [] as string[],
        videoGallery: [] as string[],
    });

    const [tagInput, setTagInput] = useState('');
    const [aiContext, setAiContext] = useState('');
    const [isGeneratingArticle, setIsGeneratingArticle] = useState(false);

    const generateSlug = (text: string) => {
        return text
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '');
    };

// ── Crop Modal Component (Refactored for stability and visibility) ────────────────
const CropModal = ({ src, aspect, onConfirm, onCancel }: { 
    src: string; 
    aspect: number; 
    onConfirm: (blob: Blob) => void; 
    onCancel: () => void; 
}) => {
    const [crop, setCrop] = useState({ x: 0, y: 0 });
    const [zoom, setZoom] = useState(1);
    const [rotation, setRotation] = useState(0);
    const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
    const [processing, setProcessing] = useState(false);

    const onCropComplete = (_: any, pixels: Area) => {
        setCroppedAreaPixels(pixels);
    };

    const handleSave = async () => {
        if (!croppedAreaPixels) return;
        setProcessing(true);
        try {
            const blob = await getCroppedImg(src, croppedAreaPixels, rotation);
            onConfirm(blob);
        } catch (e) {
            console.error(e);
            toast.error("Error al procesar el recorte.");
        } finally {
            setProcessing(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={onCancel} />
            <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-4xl overflow-hidden animate-in fade-in zoom-in duration-300">
                <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-rotary-blue flex items-center justify-center">
                            <Crop className="w-4 h-4 text-white" />
                        </div>
                        <div>
                            <h3 className="font-black text-gray-900">Recortar Portada</h3>
                            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Ratio Sugerido: 16:6 (Panorámico)</p>
                        </div>
                    </div>
                    <button onClick={onCancel} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
                        <X className="w-5 h-5 text-gray-400" />
                    </button>
                </div>

                <div className="relative bg-[#111]" style={{ height: '500px' }}>
                    <Cropper
                        image={src}
                        crop={crop}
                        zoom={zoom}
                        rotation={rotation}
                        aspect={aspect}
                        onCropChange={setCrop}
                        onZoomChange={setZoom}
                        onRotationChange={setRotation}
                        onCropComplete={onCropComplete}
                        showGrid={true}
                        classes={{
                            containerClassName: 'bg-[#111] h-full',
                            cropAreaClassName: 'border-3 border-[#013388] shadow-[0_0_0_9999px_rgba(0,0,0,0.6)]'
                        }}
                    />
                    <style>{`
                        .react-easy-crop_CropArea {
                            border: 3px solid #013388 !important;
                            color: rgba(0, 0, 0, 0.6) !important;
                            box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.6) !important;
                        }
                    `}</style>
                </div>

                <div className="p-6 bg-gray-50 border-t border-gray-100 flex flex-col gap-4">
                    <div className="flex items-center gap-6">
                        <div className="flex-1 space-y-2">
                            <div className="flex justify-between items-center">
                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Zoom: {Math.round(zoom * 100)}%</span>
                            </div>
                            <input type="range" min={1} max={3} step={0.1} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-rotary-blue" />
                        </div>
                        <div className="flex-1 space-y-2">
                            <div className="flex justify-between items-center">
                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Rotación: {rotation}°</span>
                            </div>
                            <input type="range" min={0} max={360} step={1} value={rotation} onChange={(e) => setRotation(Number(e.target.value))} className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-rotary-blue" />
                        </div>
                    </div>

                    <div className="flex items-center justify-between pt-2">
                        <p className="text-[11px] text-gray-500 font-medium max-w-md"> Arrastra la imagen para encuadrarla. El área iluminada será la portada final en el blog. </p>
                        <div className="flex gap-3">
                            <button onClick={onCancel} className="px-6 py-2.5 text-sm font-bold text-gray-400 hover:text-gray-600 transition-colors"> Cancelar </button>
                            <button onClick={handleSave} disabled={processing} className="bg-rotary-blue text-white px-8 py-2.5 rounded-xl font-bold text-sm shadow-lg shadow-rotary-blue/20 hover:bg-sky-800 transition-all flex items-center gap-2">
                                {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                                {processing ? 'Procesando...' : 'Aplicar Recorte'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};


    // Crop States
    const [isCropModalOpen, setIsCropModalOpen] = useState(false);
    const [imageToCrop, setImageToCrop] = useState<string | null>(null);

    useEffect(() => {
        if (club?.id) {
            fetchPosts();
        }
    }, [club?.id]);

    const fetchPosts = async () => {
        setSelectedIds(new Set()); // Reset selection on refresh
        const hideSamples = (club as any)?.settings?.hide_sample_news === true;

        const staticMapped: Post[] = hideSamples ? [] : [...articulosDestacados, ...articulosEstaticos].map(art => ({
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
                slug: post.slug || '',
                content: post.content || '',
                image: post.image || '',
                published: post.isStatic ? true : post.published,
                category: post.category || '',
                tags: post.tags || [],
                keywords: post.keywords || '',
                seoTitle: post.seoTitle || '',
                seoDescription: post.seoDescription || '',
                seoImage: post.seoImage || '',
                socialCopy: post.socialCopy || '',
                ctaCopy: post.ctaCopy || '',
                videoUrl: post.videoUrl || '',
                images: post.images || [],
                videoGallery: post.videoGallery || [],
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
                slug: '',
                content: '',
                image: '',
                published: true,
                category: '',
                tags: [],
                keywords: '',
                seoTitle: '',
                seoDescription: '',
                seoImage: '',
                videoUrl: '',
                images: [],
            });
            setAiContext('');
        }
        setIsModalOpen(true);
    };

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, isGallery = false, target: 'image' | 'seoImage' = 'image') => {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        if (!isGallery) {
            const file = files[0];
            const reader = new FileReader();
            setCropTarget(target);
            reader.onload = () => {
                setImageToCrop(reader.result as string);
                setIsCropModalOpen(true);
            };
            reader.readAsDataURL(file);
            e.target.value = ''; // Reset input to allow re-selection
            return;
        }

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
                    setFormData(prev => ({ ...prev, images: [...prev.images, data.url] }));
                }
            }
            toast.success('Fotos añadidas a la galería');
        } catch (error) {
            toast.error('Error al subir imagen');
        } finally {
            setUploading(false);
        }
    };

    const handleCropModalConfirm = async (blob: Blob) => {
        setIsCropModalOpen(false);
        setUploading(true);
        const token = localStorage.getItem('rotary_token');
        const apiUrl = import.meta.env.VITE_API_URL || '/api';

        try {
            const uploadData = new FormData();
            uploadData.append('file', blob, 'cropped_cover.jpg');
            uploadData.append('folder', 'news');

            const targetUrl = `${apiUrl}/media/upload?folder=news&clubId=${club.id}`.replace(/\/+/g, '/').replace(':/', '://');
            const response = await fetch(targetUrl, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: uploadData
            });

            if (response.ok) {
                const data = await response.json();
                setFormData(prev => ({ ...prev, [cropTarget]: data.url }));
                toast.success(cropTarget === 'image' ? 'Imagen de portada actualizada' : 'Imagen SEO actualizada');
            } else {
                toast.error('Error al subir imagen recortada');
            }
        } catch (error) {
            toast.error('Error de conexión al subir imagen');
        } finally {
            setUploading(false);
            setImageToCrop(null);
        }
    };

    const handleAISuggestSEO = async () => {
        if (!formData.title) {
            toast.error('Primero escribe un título para la noticia');
            return;
        }
        setIsGeneratingSlug(true);
        try {
            const token = localStorage.getItem('rotary_token');
            const apiUrl = import.meta.env.VITE_API_URL || '/api';
            const response = await fetch(`${apiUrl}/ai/suggest-seo`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ 
                    title: formData.title,
                    content: formData.content.replace(/<[^>]*>/g, '').substring(0, 1000)
                })
            });
            if (response.ok) {
                const data = await response.json();
                setFormData(prev => ({
                    ...prev,
                    seoTitle: data.seoTitle || prev.seoTitle,
                    seoDescription: data.seoDescription || prev.seoDescription,
                    slug: data.slug || prev.slug,
                    keywords: data.keywords || prev.keywords,
                    tags: data.tags || prev.tags
                }));
                toast.success('IA: Sugerencias SEO aplicadas');
            } else {
                toast.error('Error al generar sugerencias con IA');
            }
        } catch (err) {
            toast.error('Error de conexión con el motor de IA');
        } finally {
            setIsGeneratingSlug(false);
        }
    };

    const handleAISuggestSocial = async () => {
        if (!formData.title) {
            toast.error('Escribe al menos el título para generar el copy');
            return;
        }

        setIsGeneratingSlug(true);
        try {
            const token = localStorage.getItem('rotary_token');
            const apiUrl = import.meta.env.VITE_API_URL || '/api';
            const res = await fetch(`${apiUrl}/ai/suggest-social`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ 
                    title: formData.title,
                    content: formData.content.replace(/<[^>]*>?/gm, '')
                })
            });

            if (!res.ok) throw new Error('Error al generar copy');
            const data = await res.json();
            
            setFormData(prev => ({
                ...prev,
                socialCopy: data.socialCopy || prev.socialCopy
            }));
            toast.success('Copy para redes generado');
        } catch (error) {
            toast.error('No se pudo generar el copy');
        } finally {
            setIsGeneratingSlug(false);
        }
    };

    const handleAISuggestCTA = async () => {
        if (!formData.title) {
            toast.error('Escribe al menos el título para generar el CTA');
            return;
        }

        setIsGeneratingSlug(true);
        try {
            const token = localStorage.getItem('rotary_token');
            const apiUrl = import.meta.env.VITE_API_URL || '/api';
            const res = await fetch(`${apiUrl}/ai/suggest-cta`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ 
                    title: formData.title,
                    content: formData.content.replace(/<[^>]*>?/gm, '')
                })
            });

            if (!res.ok) throw new Error('Error al generar CTA');
            const data = await res.json();
            
            setFormData(prev => ({
                ...prev,
                ctaCopy: data.ctaCopy || prev.ctaCopy
            }));
            toast.success('Frase para grupos generada');
        } catch (error) {
            toast.error('No se pudo generar la frase');
        } finally {
            setIsGeneratingSlug(false);
        }
    };
    
    const handleGenerateArticle = async () => {
        if (!aiContext || aiContext.length < 10) {
            toast.error('Por favor escribe un contexto más detallado (mín. 10 car)');
            return;
        }

        setIsGeneratingArticle(true);
        const token = localStorage.getItem('rotary_token');
        const apiUrl = import.meta.env.VITE_API_URL || '/api';

        try {
            // Llamamos al motor central (Fórmula SEO verificada)
            const response = await fetch(`${apiUrl}/ai/generate-article`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ context: aiContext })
            });

            if (response.ok) {
                const articleRaw = await response.json();
                
                // Si el servidor nos mandó un error camuflado (JSON con error)
                if (articleRaw.error) {
                    toast.error(`La IA dice: ${articleRaw.error}`);
                    console.error('IA Error payload:', articleRaw);
                    return;
                }

                console.log('IA ArticulIA Raw Data Received:', articleRaw);
                
                const responseData = Array.isArray(articleRaw) ? articleRaw[0] : articleRaw;

                const captureValue = (fields: string[]): string => {
                    for (const f of fields) {
                        const val = responseData[f] || (responseData.article && responseData.article[f]) || (responseData.data && responseData.data[f]);
                        if (val && typeof val === 'string' && val.trim().length > 0) return val.trim();
                        if (val && typeof val === 'number') return String(val);
                    }
                    return '';
                };

                const captureList = (fields: string[]): string[] => {
                    for (const f of fields) {
                        const val = responseData[f] || (responseData.article && responseData.article[f]) || (responseData.data && responseData.data[f]);
                        if (val) {
                            if (Array.isArray(val)) return val;
                            if (typeof val === 'string') return val.split(',').map(c => c.trim()).filter(c => c.length > 0);
                        }
                    }
                    return ['Rotary', 'Comunidad', 'Acción']; // Fallback de categorías
                };

                const newsTitle = captureValue(['noticia_titulo', 'title', 'headline', 'titulo', 'titular', 'noticia_titulo']);
                const newsBody = captureValue(['noticia_cuerpo', 'content', 'cuerpo', 'html', 'body', 'text']);
                const newsCats = captureList(['noticia_categorias', 'categories', 'categorias', 'categoria', 'tags']);
                const seoT = captureValue(['seo_titulo', 'seoTitle', 'tituloSeo']);
                const seoD = captureValue(['seo_descripcion', 'seoDescription', 'descripcionSeo']);
                const itemSlug = captureValue(['slug', 'url', 'post_slug']);
                const itemKeys = captureValue(['keywords', 'palabrasClave']);
                const itemSocial = captureValue(['copys_redes', 'socialCopy', 'postSocial', 'copy']);

                // EMERGENCIA DE TÍTULO
                let finalTitle = newsTitle;
                if (!finalTitle && newsBody) {
                    const textOnly = newsBody.replace(/<[^>]*>/g, '').trim();
                    finalTitle = textOnly.split(/\s+/).slice(0, 6).join(' ') + '...';
                }

                console.log('Detected Title:', finalTitle);
                console.log('Detected Categories:', newsCats);

                if (!finalTitle && !newsBody) {
                    toast.error('No se pudo extraer contenido de la respuesta.');
                    return;
                }

                // ACTUALIZACIÓN ATÓMICA (Evita inconsistencias de React)
                const nextFormData = {
                    ...formData,
                    title: finalTitle || formData.title,
                    content: newsBody || formData.content,
                    categories: newsCats.length >= 1 ? newsCats : ['Rotary'],
                    seoTitle: seoT || formData.seoTitle,
                    seoDescription: seoD || formData.seoDescription,
                    slug: itemSlug || formData.slug,
                    keywords: itemKeys || formData.keywords,
                    socialCopy: itemSocial || formData.socialCopy
                };

                setFormData(nextFormData);
                toast.success(`¡Misión v4.21.0 Completada! 📝`);
                
                if (!finalTitle) toast.warning('Título generado desde el cuerpo.');
            } else {
                const errData = await response.json();
                console.error('IA ArticulIA Server Error:', errData);
                toast.error(`Error del servidor: ${errData.details || errData.error || 'Sin respuesta'}`);
            }
        } catch (error: any) {
            console.error('IA ArticulIA Connection Error:', error);
            // Mensaje más detallado para diagnosticar
            toast.error(`Error de conexión: ${error.message}. Verifica que las API Keys de IA estén en Vercel.`);
        } finally {
            setIsGeneratingArticle(false);
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
            } else {
                const errorData = await response.json();
                toast.error(`Error: ${errorData.error || 'No se pudo guardar la noticia'}${errorData.details ? ` (${errorData.details})` : ''}`);
            }
        } catch (error: any) {
            toast.error('Error de conexión al guardar');
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
        const hasStatic = total > dbIds.length;

        if (total === 0) return;
        
        let confirmMsg = `¿Eliminar de forma masiva ${total} noticias seleccionadas?`;
        if (hasStatic) {
            confirmMsg += `\n\nNota: Has seleccionado noticias de ejemplo. Estas se ocultarán permanentemente de tu club.`;
        }
        
        if (!window.confirm(confirmMsg)) return;

        try {
            setIsSubmitting(true);
            const token = localStorage.getItem('rotary_token');

            if (hasStatic) {
                // Save setting to hide samples
                await fetch(`${import.meta.env.VITE_API_URL || '/api'}/admin/clubs/${club.id}/settings/hide_sample_news`, {
                    method: 'PATCH',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ value: 'true' })
                });
                // Note: We'll force a reload or just rely on fetchPosts if we can mock the setting update
                // But since club context is global, a reload is safer for visibility everywhere
                if (dbIds.length === 0) {
                    toast.success('Noticias de ejemplo ocultadas');
                    window.location.reload();
                    return;
                }
            }

            if (dbIds.length > 0) {
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
                    if (hasStatic) {
                        window.location.reload();
                    } else {
                        fetchPosts();
                    }
                }
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
                                { id: 'seo', label: 'SEO & Tráfico', icon: Globe },
                                { id: 'social', label: 'Redes Sociales', icon: Share2 }
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
                            {/* AI Drafting Assistant (New Section) */}
                            {activeTab === 'content' && (
                                <div className="mb-10 bg-rotary-blue/[0.03] border border-rotary-blue/10 rounded-2xl p-6">
                                    <div className="flex items-center justify-between mb-4">
                                        <div className="flex items-center gap-2">
                                            <div className="w-8 h-8 rounded-lg bg-rotary-blue/10 flex items-center justify-center">
                                                <Sparkles className="w-4 h-4 text-rotary-blue" />
                                            </div>
                                            <h3 className="text-sm font-black text-rotary-blue uppercase tracking-widest">Asistente de Redacción IA</h3>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={handleGenerateArticle}
                                            disabled={isGeneratingArticle}
                                            className="flex items-center gap-2 bg-rotary-blue text-white px-4 py-2 rounded-xl hover:bg-sky-800 transition-all text-xs font-bold shadow-md disabled:opacity-50"
                                        >
                                            {isGeneratingArticle ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                                            {isGeneratingArticle ? 'Redactando...' : 'Redactar Artículo Completo'}
                                        </button>
                                    </div>
                                    <textarea
                                        placeholder="Escribe aquí el sustento o contexto de la noticia (ej: Quiénes participaron, qué pasó, impacto social...)"
                                        className="w-full bg-white border border-gray-100 rounded-xl p-4 text-sm outline-none focus:ring-2 focus:ring-rotary-blue/20 min-h-[80px] resize-none"
                                        value={aiContext}
                                        onChange={(e) => setAiContext(e.target.value)}
                                    />
                                    <p className="text-[10px] text-gray-400 mt-2 font-medium">
                                        💡 La IA redactará el título, cuerpo, SEO y copys basándose en lo que escribas arriba.
                                    </p>
                                </div>
                            )}

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
                                                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                                                <button type="button" 
                                                                    onClick={async () => {
                                                                        if (formData.image.startsWith('data:')) {
                                                                            setImageToCrop(formData.image);
                                                                            setIsCropModalOpen(true);
                                                                            return;
                                                                        }
                                                                        const token = localStorage.getItem('rotary_token');
                                                                        const apiUrl = import.meta.env.VITE_API_URL || '/api';
                                                                        try {
                                                                            const res = await fetch(`${apiUrl}/media/proxy?url=${encodeURIComponent(formData.image)}`, { headers: { Authorization: `Bearer ${token}` } });
                                                                            if (!res.ok) throw new Error('Proxy failed');
                                                                            const blob = await res.blob();
                                                                            const reader = new FileReader();
                                                                            reader.onload = () => {
                                                                                setImageToCrop(reader.result as string);
                                                                                setIsCropModalOpen(true);
                                                                            };
                                                                            reader.readAsDataURL(blob);
                                                                        } catch (err) {
                                                                            toast.error('No se pudo cargar la imagen para re-recortar');
                                                                            setImageToCrop(formData.image); // Fallback to direct URL
                                                                            setIsCropModalOpen(true);
                                                                        }
                                                                    }} 
                                                                    className="bg-rotary-blue text-white p-2 rounded-full hover:bg-sky-700 transition-colors"
                                                                    title="Recortar imagen"
                                                                >
                                                                    <Crop className="w-4 h-4" />
                                                                </button>
                                                                <button type="button" onClick={() => setFormData({ ...formData, image: '' })} className="bg-red-500 text-white p-2 rounded-full hover:bg-red-600 transition-colors">
                                                                    <X className="w-4 h-4" />
                                                                </button>
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
                                                <label className="block text-sm font-bold text-gray-700 mb-3">Video Principal (YouTube/Vimeo)</label>
                                                <input
                                                    type="url"
                                                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-rotary-blue/20 outline-none text-sm font-medium mb-4"
                                                    value={formData.videoUrl}
                                                    onChange={(e) => setFormData({ ...formData, videoUrl: e.target.value })}
                                                    placeholder="URL del video principal..."
                                                />
                                                
                                                <div className="w-full pt-4 border-t border-gray-100">
                                                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Agregar Videos a Galería</label>
                                                    <div className="flex gap-2">
                                                        <input 
                                                            type="url" 
                                                            id="gallery-video-input"
                                                            className="flex-1 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-rotary-blue/20 outline-none"
                                                            placeholder="URL de YouTube/Vimeo..."
                                                            onKeyDown={(e) => {
                                                                if (e.key === 'Enter') {
                                                                    e.preventDefault();
                                                                    const val = (e.currentTarget as HTMLInputElement).value;
                                                                    if (val) {
                                                                        setFormData(prev => ({
                                                                            ...prev,
                                                                            videoGallery: [...(prev.videoGallery || []), val]
                                                                        }));
                                                                        (e.currentTarget as HTMLInputElement).value = '';
                                                                    }
                                                                }
                                                            }}
                                                        />
                                                        <button 
                                                            type="button"
                                                            onClick={() => {
                                                                const input = document.getElementById('gallery-video-input') as HTMLInputElement;
                                                                if (input?.value) {
                                                                    setFormData(prev => ({
                                                                        ...prev,
                                                                        videoGallery: [...(prev.videoGallery || []), input.value]
                                                                    }));
                                                                    input.value = '';
                                                                }
                                                            }}
                                                            className="px-4 py-2 bg-rotary-blue text-white rounded-xl text-xs font-bold hover:bg-sky-700 transition-colors"
                                                        >
                                                            Añadir
                                                        </button>
                                                    </div>
                                                </div>
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
                                                <ImageIcon className="w-4 h-4 text-rotary-blue" /> Multimedia en Galería ({formData.images.length + (formData.videoGallery?.length || 0)})
                                            </h4>
                                            
                                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                                                {/* Videos first */}
                                                {formData.videoGallery?.map((url, idx) => (
                                                    <div key={`vid-${idx}`} className="aspect-square rounded-xl overflow-hidden border-2 border-rotary-blue/30 relative group shadow-sm bg-gray-900 flex items-center justify-center">
                                                        <div className="absolute inset-0 z-10 bg-black/20" />
                                                        <Video className="w-8 h-8 text-white relative z-20" />
                                                        <div className="absolute bottom-2 left-2 right-2 truncate text-[10px] text-white font-bold bg-black/60 px-1 rounded z-20">Video</div>
                                                        <button
                                                            type="button"
                                                            onClick={() => setFormData(prev => ({ ...prev, videoGallery: prev.videoGallery?.filter((_, i) => i !== idx) }))}
                                                            className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg z-30"
                                                        >
                                                            <X className="w-2.5 h-2.5" />
                                                        </button>
                                                    </div>
                                                ))}

                                                {/* Then Images */}
                                                {formData.images.map((url, idx) => (
                                                    <div key={`img-${idx}`} className="aspect-square rounded-xl overflow-hidden border border-gray-100 relative group shadow-sm bg-gray-50">
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
                                            <button
                                                type="button"
                                                onClick={handleAISuggestSEO}
                                                disabled={isGeneratingSlug || !formData.title}
                                                className="flex items-center gap-2 px-4 py-2 bg-rotary-blue text-white rounded-xl text-xs font-bold hover:bg-rotary-blue/90 transition-all shadow-sm disabled:opacity-50"
                                            >
                                                <RefreshCw className={`w-3.5 h-3.5 ${isGeneratingSlug ? 'animate-spin' : ''}`} />
                                                {isGeneratingSlug ? 'Generando...' : 'Redactar con IA'}
                                            </button>
                                        </div>

                                        <div className="grid grid-cols-1 lg:grid-cols-5 gap-10">
                                            <div className="lg:col-span-3 space-y-6">
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
                                                    <label className="block text-sm font-bold text-gray-700 mb-2 flex justify-between items-center">
                                                        Slug de URL (Personalizado)
                                                        <button 
                                                            type="button" 
                                                            onClick={() => setFormData({ ...formData, slug: generateSlug(formData.title) })}
                                                            className="text-[10px] text-rotary-blue hover:underline uppercase font-bold px-2 py-1 bg-rotary-blue/5 rounded-lg transition-colors"
                                                        >
                                                            Generar Auto
                                                        </button>
                                                    </label>
                                                    <input
                                                        type="text"
                                                        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-rotary-blue/20 outline-none font-mono text-xs bg-gray-50"
                                                        value={formData.slug}
                                                        onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                                                        placeholder="ej: nombre-de-la-noticia"
                                                    />
                                                    <p className="mt-1 text-[10px] text-gray-400 italic">Si se deja vacío usará el ID por defecto.</p>
                                                </div>

                                                <div>
                                                    <label className="block text-sm font-bold text-gray-700 mb-2">Meta Descripción</label>
                                                    <textarea
                                                        rows={3}
                                                        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-rotary-blue/20 outline-none resize-none"
                                                        value={formData.seoDescription}
                                                        onChange={(e) => setFormData({ ...formData, seoDescription: e.target.value })}
                                                        placeholder="Pequeño resumen de 160 caracteres..."
                                                    />
                                                </div>

                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                                                                    className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-rotary-blue/20 outline-none placeholder:text-[10px]"
                                                                    value={tagInput}
                                                                    onChange={(e) => setTagInput(e.target.value)}
                                                                    onKeyDown={handleAddTag}
                                                                    placeholder="Escribe y Enter..."
                                                                />
                                                            </div>
                                                            <div className="flex flex-wrap gap-2">
                                                                {formData.tags.map(tag => (
                                                                    <span key={tag} className="flex items-center gap-1.5 px-3 py-1 bg-gray-100 text-gray-600 rounded-full text-[10px] font-bold border border-gray-200">
                                                                        #{tag}
                                                                        <button type="button" onClick={() => removeTag(tag)} className="hover:text-red-500"><X className="w-3 h-3" /></button>
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Indicadores de Salud SEO (Character Counters) */}
                                                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-100">
                                                    <div className={`p-4 rounded-3xl border transition-all duration-300 ${formData.seoTitle.length > 60 || formData.seoTitle.length === 0 ? 'bg-red-50/50 border-red-100' : 'bg-green-50/50 border-green-100'}`}>
                                                        <span className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-2 font-mono">Título SEO</span>
                                                        <div className="flex items-baseline gap-1">
                                                            <span className={`text-2xl font-black ${formData.seoTitle.length > 60 || formData.seoTitle.length === 0 ? 'text-red-500' : 'text-green-500'}`}>
                                                                {formData.seoTitle.length}
                                                            </span>
                                                            <span className="text-xs text-gray-300 font-bold">/60</span>
                                                        </div>
                                                        {(formData.seoTitle.length > 60) ? (
                                                            <p className="text-[10px] text-red-400 font-bold mt-1 animate-pulse">Google lo truncará</p>
                                                        ) : (
                                                            <p className="text-[10px] text-green-600/60 font-bold mt-1 italic">Longitud ideal</p>
                                                        )}
                                                    </div>

                                                    <div className={`p-4 rounded-3xl border transition-all duration-300 ${formData.seoDescription.length > 160 || formData.seoDescription.length === 0 ? 'bg-red-50/50 border-red-100' : 'bg-green-50/50 border-green-100'}`}>
                                                        <span className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-2 font-mono">Meta Descripción</span>
                                                        <div className="flex items-baseline gap-1">
                                                            <span className={`text-2xl font-black ${formData.seoDescription.length > 160 || formData.seoDescription.length === 0 ? 'text-red-500' : 'text-green-500'}`}>
                                                                {formData.seoDescription.length}
                                                            </span>
                                                            <span className="text-xs text-gray-300 font-bold">/160</span>
                                                        </div>
                                                        {(formData.seoDescription.length > 160) ? (
                                                            <p className="text-[10px] text-red-400 font-bold mt-1 animate-pulse">Google lo truncará</p>
                                                        ) : (
                                                            <p className="text-[10px] text-green-600/60 font-bold mt-1 italic">Longitud ideal</p>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Columna 2: Visualización (40% aprox en LG) */}
                                            <div className="lg:col-span-2 space-y-6">
                                                <div className="p-6 bg-gray-50/50 rounded-3xl border border-gray-100/50 shadow-inner">
                                                    <SEOPreview
                                                        title={formData.seoTitle || formData.title}
                                                        description={formData.seoDescription}
                                                        url={`https://${(club as any)?.domain || 'tusitio.org'}/#/blog/${formData.slug || editingPost?.id || 'nuevo'}`}
                                                        image={formData.seoImage || formData.image}
                                                    />
                                                </div>
                                                <div className="p-4 bg-rotary-blue/5 rounded-2xl border border-rotary-blue/10">
                                                    <p className="text-[10px] text-rotary-blue font-bold uppercase tracking-widest mb-1 italic">Tip del Experto:</p>
                                                    <p className="text-[10px] text-gray-500 leading-relaxed font-medium">
                                                        Los buscadores prefieren títulos cortos y descripciones que inviten a la acción. 
                                                        Usa la IA para generar opciones atractivas.
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {activeTab === 'social' && (
                                    <div className="grid grid-cols-1 lg:grid-cols-5 gap-10 animate-in slide-in-from-right-4 duration-300">
                                        <div className="lg:col-span-3 space-y-6">
                                            <div className="p-6 bg-rotary-blue/5 rounded-2xl border border-rotary-blue/10">
                                                <div className="flex items-center justify-between mb-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className="p-2.5 bg-rotary-blue text-white rounded-xl shadow-lg shadow-rotary-blue/20">
                                                            <Sparkles className="w-5 h-5" />
                                                        </div>
                                                        <div>
                                                            <h4 className="font-bold text-gray-800 leading-none mb-1">Copy Estratégico</h4>
                                                            <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Facebook & LinkedIn</p>
                                                        </div>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={handleAISuggestSocial}
                                                        disabled={isGeneratingSlug || !formData.title}
                                                        className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-rotary-blue rounded-xl text-xs font-bold hover:bg-gray-50 transition-all shadow-sm"
                                                    >
                                                        <RefreshCw className={`w-3.5 h-3.5 ${isGeneratingSlug ? 'animate-spin' : ''}`} />
                                                        {isGeneratingSlug ? 'Redactando...' : 'Generar con IA'}
                                                    </button>
                                                </div>
                                                <textarea
                                                    value={formData.socialCopy}
                                                    onChange={(e) => setFormData(prev => ({ ...prev, socialCopy: e.target.value }))}
                                                    rows={10}
                                                    className="w-full px-5 py-4 bg-white border border-gray-200 rounded-2xl focus:outline-none focus:ring-4 focus:ring-rotary-blue/10 transition-all font-medium text-sm leading-relaxed shadow-inner"
                                                    placeholder="Escribe el texto que acompañará tu noticia en redes sociales..."
                                                />
                                            </div>

                                            <div className="p-6 bg-amber-50/50 rounded-2xl border border-amber-100 flex flex-col gap-4">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-2 text-amber-700">
                                                        <Share2 className="w-4 h-4" />
                                                        <h4 className="font-bold text-sm uppercase tracking-wider">Frase para Grupos (CTA)</h4>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={handleAISuggestCTA}
                                                        disabled={isGeneratingSlug || !formData.title}
                                                        className="text-[10px] font-bold text-amber-600 hover:underline uppercase tracking-widest flex items-center gap-1"
                                                    >
                                                        <RefreshCw className={`w-3 h-3 ${isGeneratingSlug ? 'animate-spin' : ''}`} />
                                                        Sugerir con IA
                                                    </button>
                                                </div>
                                                <input
                                                    type="text"
                                                    value={formData.ctaCopy}
                                                    onChange={(e) => setFormData(prev => ({ ...prev, ctaCopy: e.target.value }))}
                                                    className="w-full px-4 py-3 bg-white border border-amber-100 rounded-xl focus:outline-none focus:ring-4 focus:ring-amber-200/20 transition-all font-medium text-sm italic text-amber-900 shadow-sm"
                                                    placeholder="Ej: Discover how our club is making an impact. Greetings from Colombia! 🇨🇴"
                                                />
                                                <p className="text-[9px] text-amber-600/70 font-medium">
                                                    Úsala para compartir este artículo en Grupos Internacionales de Facebook. ¡Haz que otros clubes te conozcan!
                                                </p>
                                            </div>

                                            <div className="p-6 bg-gray-50 rounded-3xl border border-gray-100">
                                                <div className="flex justify-between items-center mb-6">
                                                    <div className="flex items-center gap-2">
                                                        <ImageIcon className="w-4 h-4 text-rotary-blue" />
                                                        <h4 className="font-bold text-gray-800">Imagen Social Personalizada</h4>
                                                    </div>
                                                    {formData.seoImage && (
                                                        <button 
                                                            type="button" 
                                                            onClick={() => setFormData({ ...formData, seoImage: '' })}
                                                            className="text-[10px] text-red-500 font-bold hover:underline"
                                                        >
                                                            Restablecer a Portada
                                                        </button>
                                                    )}
                                                </div>
                                                <div className="flex flex-col md:flex-row gap-6 items-center">
                                                    <div className="w-full md:w-64 aspect-[1.91/1] rounded-2xl border-2 border-dashed border-gray-200 bg-white overflow-hidden relative group transition-all hover:border-rotary-blue/50">
                                                        {(formData.seoImage || formData.image) ? (
                                                            <img src={formData.seoImage || formData.image} alt="Social Preview" className="w-full h-full object-cover" crossOrigin="anonymous" />
                                                        ) : (
                                                            <div className="w-full h-full flex flex-col items-center justify-center bg-gray-50 gap-2">
                                                                <ImageIcon className="w-8 h-8 text-gray-200" />
                                                                <span className="text-[9px] font-bold text-gray-400 uppercase">Sin Imagen</span>
                                                            </div>
                                                        )}
                                                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                            <div className="flex flex-col items-center gap-2">
                                                                <Upload className="w-6 h-6 text-white" />
                                                                <span className="text-[10px] font-bold text-white uppercase tracking-widest">Subir Imagen</span>
                                                            </div>
                                                            <input 
                                                                type="file" 
                                                                className="absolute inset-0 opacity-0 cursor-pointer" 
                                                                onChange={(e) => handleImageUpload(e, false, 'seoImage')} 
                                                            />
                                                        </div>
                                                    </div>
                                                    <div className="flex-1 space-y-3">
                                                        <div className="flex items-center gap-2 p-3 bg-white border border-gray-100 rounded-2xl">
                                                            <div className="w-1.5 h-1.5 rounded-full bg-rotary-blue animate-pulse" />
                                                            <p className="text-[11px] font-bold text-gray-600">Recomendado: 1200x630px para Facebook/LinkdIn.</p>
                                                        </div>
                                                        <p className="text-[10px] text-gray-400 leading-relaxed font-medium">
                                                            Esta imagen es la que se mostrará en la "card" de previsualización al compartir el enlace. No afecta la portada del artículo en tu web.
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="lg:col-span-2 space-y-6">
                                            <div className="sticky top-0 space-y-8">
                                                <div>
                                                    <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                                                        <Facebook className="w-4 h-4 text-[#1877F2]" /> Vista Previa Facebook
                                                    </h4>
                                                    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                                                        <div className="p-3 flex items-center gap-2 border-b border-gray-50">
                                                            <div className="w-9 h-9 rounded-full bg-gray-50 p-1.5 border border-gray-100">
                                                                <img src={club?.logo || ''} className="w-full h-full object-contain" alt="Club Logo" crossOrigin="anonymous" />
                                                            </div>
                                                            <div>
                                                                <p className="text-xs font-bold text-gray-900 leading-none mb-1">{club?.name}</p>
                                                                <p className="text-[10px] text-gray-500">Publicado ahora mismo · 🌎</p>
                                                            </div>
                                                        </div>
                                                        <div className="px-4 py-3">
                                                            <p className="text-xs text-gray-800 whitespace-pre-wrap leading-relaxed">
                                                                {formData.socialCopy || <span className="text-gray-300 italic">El copy estratégico aparecerá aquí...</span>}
                                                            </p>
                                                        </div>
                                                        <div className="border-t border-gray-100">
                                                            <div className="aspect-[1.91/1] bg-gray-50">
                                                                <img src={formData.seoImage || formData.image || ''} className="w-full h-full object-cover" alt="Preview" crossOrigin="anonymous" />
                                                            </div>
                                                            <div className="p-3 bg-[#F0F2F5] border-t border-gray-200">
                                                                <p className="text-[10px] text-gray-500 uppercase font-bold tracking-tight mb-1">{window.location.hostname}</p>
                                                                <p className="text-sm font-bold text-gray-900 line-clamp-2 leading-tight">
                                                                    {formData.seoTitle || formData.title || 'Título de la Noticia'}
                                                                </p>
                                                                <p className="text-xs text-gray-500 mt-1 line-clamp-1">
                                                                    {formData.seoDescription || 'Resumen de la noticia para redes sociales...'}
                                                                </p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div>
                                                    <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                                                        <Linkedin className="w-4 h-4 text-[#0A66C2]" /> Vista Previa LinkedIn
                                                    </h4>
                                                    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm p-4">
                                                        <div className="flex items-start gap-2 mb-4">
                                                            <div className="w-12 h-12 rounded bg-gray-50 p-2 border border-gray-100">
                                                                <img src={club?.logo || ''} className="w-full h-full object-contain" alt="Club Logo" crossOrigin="anonymous" />
                                                            </div>
                                                            <div>
                                                                <p className="text-sm font-bold text-gray-900 leading-none mb-1">{club?.name}</p>
                                                                <p className="text-[11px] text-gray-500">Miembros del club de la plataforma</p>
                                                                <p className="text-[11px] text-gray-400">1m · 🌐</p>
                                                            </div>
                                                        </div>
                                                        <p className="text-sm text-gray-800 mb-4 whitespace-pre-wrap leading-relaxed">
                                                            {formData.socialCopy || <span className="text-gray-300 italic">Tu publicación profesional aparecerá aquí...</span>}
                                                        </p>
                                                        <div className="rounded-xl border border-gray-200 bg-gray-50 overflow-hidden hover:bg-gray-100 transition-colors">
                                                            <div className="aspect-[1.91/1] bg-gray-200">
                                                                <img src={formData.seoImage || formData.image || ''} className="w-full h-full object-cover" alt="LinkedIn Content" crossOrigin="anonymous" />
                                                            </div>
                                                            <div className="p-4 bg-white">
                                                                <p className="text-sm font-bold text-gray-900 line-clamp-2">{formData.seoTitle || formData.title}</p>
                                                                <p className="text-[11px] text-gray-400 mt-1.5 font-medium">{window.location.hostname} · 3 min de lectura</p>
                                                            </div>
                                                        </div>
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
                                            activeTab === 'gallery' ? '2. Multimedia' : 
                                            activeTab === 'social' ? '3. Redes Sociales' : '4. SEO & Indexación'}
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
                     {/* Crop Modal */}
        {isCropModalOpen && imageToCrop && (
            <CropModal
                src={imageToCrop}
                aspect={16 / 6}
                onConfirm={handleCropModalConfirm}
                onCancel={() => setIsCropModalOpen(false)}
            />
        )}
            </div>
            )}
        </AdminLayout>
    );
};

export default NewsManagement;
