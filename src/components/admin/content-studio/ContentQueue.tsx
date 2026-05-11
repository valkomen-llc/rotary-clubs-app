import React, { useEffect, useState } from 'react';
import {
    Clock,
    CheckCircle2,
    AlertCircle,
    Loader2,
    MoreVertical,
    Send,
    Video,
    RefreshCw,
    Trash2,
    Ban
} from 'lucide-react';
import { toast } from 'sonner';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuSeparator
} from '../../ui/dropdown-menu';

interface ScheduledPost {
    id: string;
    caption: string | null;
    status: 'pending' | 'scheduled' | 'published' | 'failed' | 'cancelled';
    scheduledFor: string | null;
    error?: string | null;
    video: {
        title: string;
    };
    account: {
        platform: string;
        accountName: string;
    };
}

const ContentQueue: React.FC = () => {
    const [posts, setPosts] = useState<ScheduledPost[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchPosts();
    }, []);

    const API = import.meta.env.VITE_API_URL || '/api';

    const fetchPosts = async (showLoading = true) => {
        if (showLoading) setLoading(true);
        try {
            const token = localStorage.getItem('rotary_token');
            const response = await fetch(`${API}/content-studio/posts`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                const data = await response.json();
                setPosts(data);
            }
        } catch (error) {
            toast.error('Error al cargar la cola de publicaciones');
        } finally {
            setLoading(false);
        }
    };

    const callAction = async (postId: string, action: 'cancel' | 'retry' | 'delete') => {
        const token = localStorage.getItem('rotary_token');
        const labels: Record<typeof action, { loading: string; success: string }> = {
            cancel: { loading: 'Cancelando...', success: 'Publicación cancelada' },
            retry: { loading: 'Reintentando...', success: 'Reintento enviado' },
            delete: { loading: 'Eliminando...', success: 'Publicación eliminada' }
        };
        const tId = toast.loading(labels[action].loading);
        try {
            const url =
                action === 'delete'
                    ? `${API}/content-studio/posts/${postId}`
                    : `${API}/content-studio/posts/${postId}/${action}`;
            const method = action === 'delete' ? 'DELETE' : 'POST';
            const res = await fetch(url, { method, headers: { Authorization: `Bearer ${token}` } });
            const data = await res.json().catch(() => ({}));
            if (res.ok) {
                toast.success(labels[action].success, { id: tId });
                fetchPosts(false);
            } else {
                toast.error(data.error || 'Operación fallida', { id: tId });
            }
        } catch {
            toast.error('Error de conexión', { id: tId });
        }
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'published':
                return <span className="bg-emerald-50 text-emerald-600 px-3 py-1 rounded-full text-[10px] font-black uppercase flex items-center gap-1.5"><CheckCircle2 className="w-3 h-3" /> Publicado</span>;
            case 'scheduled':
                return <span className="bg-blue-50 text-blue-600 px-3 py-1 rounded-full text-[10px] font-black uppercase flex items-center gap-1.5"><Clock className="w-3 h-3" /> Programado</span>;
            case 'failed':
                return <span className="bg-red-50 text-red-600 px-3 py-1 rounded-full text-[10px] font-black uppercase flex items-center gap-1.5"><AlertCircle className="w-3 h-3" /> Fallido</span>;
            case 'cancelled':
                return <span className="bg-gray-100 text-gray-500 px-3 py-1 rounded-full text-[10px] font-black uppercase flex items-center gap-1.5"><Ban className="w-3 h-3" /> Cancelado</span>;
            default:
                return <span className="bg-gray-50 text-gray-400 px-3 py-1 rounded-full text-[10px] font-black uppercase flex items-center gap-1.5"><Send className="w-3 h-3" /> Pendiente</span>;
        }
    };

    if (loading) {
        return (
            <div className="py-20 text-center">
                <Loader2 className="w-10 h-10 text-indigo-600 animate-spin mx-auto mb-4" />
                <p className="text-gray-500 font-bold">Cargando cola...</p>
            </div>
        );
    }

    if (posts.length === 0) {
        return (
            <div className="bg-white rounded-3xl border border-gray-100 p-20 text-center shadow-sm">
                <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-6">
                    <Send className="w-10 h-10 text-gray-200" />
                </div>
                <h3 className="text-xl font-black text-gray-900 mb-2">Sin actividad reciente</h3>
                <p className="text-gray-500 max-w-sm mx-auto">Selecciona un video de tu biblioteca para programar su publicación.</p>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-3xl border border-gray-100 overflow-hidden shadow-sm animate-in fade-in duration-500">
            <div className="overflow-x-auto">
                <table className="w-full text-left">
                    <thead className="bg-gray-50/50 border-b border-gray-100">
                        <tr>
                            <th className="px-8 py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest">Contenido</th>
                            <th className="px-8 py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest">Destino</th>
                            <th className="px-8 py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest">Programación</th>
                            <th className="px-8 py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Estado</th>
                            <th className="px-8 py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {posts.map((post) => (
                            <tr key={post.id} className="hover:bg-gray-50/30 transition-colors">
                                <td className="px-8 py-6">
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 bg-gray-900 rounded-xl flex items-center justify-center">
                                            <Video className="w-6 h-6 text-white/20" />
                                        </div>
                                        <div>
                                            <p className="font-black text-gray-900 text-sm truncate max-w-xs">{post.video.title}</p>
                                            <p className="text-[10px] font-bold text-gray-400 truncate max-w-xs">"{post.caption || 'Sin descripción'}"</p>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-8 py-6">
                                    <div className="flex items-center gap-2">
                                        <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center text-xs font-black text-gray-400 uppercase">
                                            {post.account.platform[0]}
                                        </div>
                                        <div>
                                            <p className="text-xs font-black text-gray-700 capitalize">{post.account.platform}</p>
                                            <p className="text-[10px] font-bold text-gray-400">@{post.account.accountName}</p>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-8 py-6">
                                    <p className="text-xs font-black text-gray-700">
                                        {post.scheduledFor ? new Date(post.scheduledFor).toLocaleDateString() : 'Inmediato'}
                                    </p>
                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-tight">
                                        {post.scheduledFor ? new Date(post.scheduledFor).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Publicación Directa'}
                                    </p>
                                </td>
                                <td className="px-8 py-6 text-center">
                                    <div className="inline-flex justify-center">
                                        {getStatusBadge(post.status)}
                                    </div>
                                </td>
                                <td className="px-8 py-6 text-right">
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <button className="p-2 text-gray-300 hover:text-gray-900 transition-all">
                                                <MoreVertical className="w-5 h-5" />
                                            </button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end" className="w-48">
                                            {(post.status === 'scheduled' || post.status === 'pending') && (
                                                <DropdownMenuItem onClick={() => callAction(post.id, 'cancel')}>
                                                    <Ban className="w-4 h-4 mr-2" /> Cancelar
                                                </DropdownMenuItem>
                                            )}
                                            {(post.status === 'failed' || post.status === 'cancelled') && (
                                                <DropdownMenuItem onClick={() => callAction(post.id, 'retry')}>
                                                    <RefreshCw className="w-4 h-4 mr-2" /> Reintentar
                                                </DropdownMenuItem>
                                            )}
                                            <DropdownMenuSeparator />
                                            <DropdownMenuItem
                                                onClick={() => {
                                                    if (confirm('¿Eliminar esta publicación del historial?')) {
                                                        callAction(post.id, 'delete');
                                                    }
                                                }}
                                                className="text-red-600 focus:text-red-600"
                                            >
                                                <Trash2 className="w-4 h-4 mr-2" /> Eliminar
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default ContentQueue;
