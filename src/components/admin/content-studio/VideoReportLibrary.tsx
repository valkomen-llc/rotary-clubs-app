import React, { useEffect, useState, useCallback } from 'react';
import {
    Film, Clapperboard, Play, Trash2, Clock, Sparkles,
    RefreshCw, Layers, CheckCircle2, Download, Share2,
    Search, Loader2, X, ChevronRight, AlertCircle, ArrowUpRight
} from 'lucide-react';
import { toast } from 'sonner';

interface VideoReportProjectSummary {
    id: string;
    clubId: string;
    campaignId: string;
    campaignName?: string | null;
    title: string;
    objective: string;
    format: string;
    targetDurationSec: number;
    status: string;
    productionMode: string;
    scriptMode: string;
    mediaId?: string | null;
    savedToLibraryAt?: string | null;
    createdAt: string;
    updatedAt: string;
    sceneCount: number;
    totalDurationSec: number;
    firstSceneThumb?: string | null;
    hasRender: boolean;
    renderStatus?: string | null;
    renderVideoUrl?: string | null;
}

interface VideoReportLibraryProps {
    onEditProject: (projectId: string) => void;
    onPublishVideo?: (item: { id: string; title: string; videoUrl: string }) => void;
}

const API = import.meta.env.VITE_API_URL || '/api';
const authHeaders = (): Record<string, string> => ({
    'Authorization': `Bearer ${localStorage.getItem('rotary_token')}`,
    'Content-Type': 'application/json'
});

export const VideoReportLibrary: React.FC<VideoReportLibraryProps> = ({
    onEditProject,
    onPublishVideo
}) => {
    const [projects, setProjects] = useState<VideoReportProjectSummary[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [search, setSearch] = useState<string>('');
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [previewVideoUrl, setPreviewVideoUrl] = useState<{ url: string; title: string } | null>(null);

    const fetchProjects = useCallback(async (showLoading = true) => {
        if (showLoading) setLoading(true);
        try {
            const res = await fetch(`${API}/content-studio/video-reports/projects`, {
                headers: authHeaders()
            });
            const data = await res.json();
            if (data.projects) {
                setProjects(data.projects);
            }
        } catch (e) {
            console.error('[VideoReportLibrary] Error al cargar proyectos:', e);
            toast.error('No se pudieron sincronizar los Video Informes de la biblioteca');
        } finally {
            if (showLoading) setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchProjects();
    }, [fetchProjects]);

    const handleDelete = async (projectId: string, title: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!window.confirm(`¿Seguro que deseas eliminar el informe "${title}" de la biblioteca? Esta acción no se puede deshacer.`)) {
            return;
        }

        setDeletingId(projectId);
        try {
            const res = await fetch(`${API}/content-studio/video-reports/projects/${projectId}`, {
                method: 'DELETE',
                headers: authHeaders()
            });
            const data = await res.json();
            if (!res.ok || !data.success) {
                throw new Error(data.error || 'Error al eliminar el proyecto');
            }
            toast.success(`Video Informe "${title}" eliminado de la biblioteca`);
            setProjects(prev => prev.filter(p => p.id !== projectId));
        } catch (e: any) {
            toast.error(e.message || 'No se pudo eliminar el proyecto');
        } finally {
            setDeletingId(null);
        }
    };

    const filtered = projects.filter(p => {
        const q = search.trim().toLowerCase();
        if (!q) return true;
        return (
            p.title.toLowerCase().includes(q) ||
            (p.campaignName && p.campaignName.toLowerCase().includes(q))
        );
    });

    const formatDuration = (sec: number) => {
        const m = Math.floor(sec / 60);
        const s = Math.round(sec % 60);
        if (m === 0) return `${s}s`;
        return `${m}:${s < 10 ? '0' : ''}${s} min`;
    };

    const formatDate = (isoStr: string) => {
        try {
            const d = new Date(isoStr);
            return d.toLocaleDateString('es-ES', {
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch {
            return '';
        }
    };

    return (
        <div className="bg-white rounded-3xl border border-gray-100 p-8 shadow-sm flex flex-col gap-6">
            {/* Header del bloque */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <span className="px-2.5 py-0.5 bg-indigo-50 text-indigo-700 text-[10px] font-black uppercase tracking-wider rounded-md border border-indigo-100">
                            Respaldo Permanente
                        </span>
                        <span className="text-xs text-emerald-600 font-bold flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Autoguardado desde la creación
                        </span>
                    </div>
                    <h3 className="text-xl font-black text-gray-900 flex items-center gap-2">
                        <Film className="w-5 h-5 text-indigo-600" /> Video Informes IA (Campañas de Contribución)
                    </h3>
                    <p className="text-xs text-gray-500 font-medium mt-1">
                        Todos tus proyectos de Video Informe se guardan automáticamente en esta biblioteca desde su creación. Puedes continuar editando borradores o compartir los videos renderizados.
                    </p>
                </div>

                <div className="flex items-center gap-3 w-full md:w-auto">
                    <div className="relative flex-1 md:w-64">
                        <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                            type="text"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Buscar informe..."
                            className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-medium text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                        />
                    </div>
                    <button
                        type="button"
                        onClick={() => fetchProjects(true)}
                        disabled={loading}
                        title="Actualizar lista"
                        className="p-2.5 bg-gray-50 hover:bg-gray-100 border border-gray-200 text-gray-700 rounded-xl transition-all disabled:opacity-50"
                    >
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-indigo-600' : ''}`} />
                    </button>
                </div>
            </div>

            {/* Listado de Proyectos */}
            {loading ? (
                <div className="flex flex-col items-center justify-center p-16 text-indigo-600 gap-3">
                    <Loader2 className="w-8 h-8 animate-spin" />
                    <span className="text-xs font-bold text-gray-500">Cargando Video Informes guardados...</span>
                </div>
            ) : filtered.length === 0 ? (
                <div className="bg-slate-50 border border-dashed border-slate-200 rounded-2xl p-10 flex flex-col items-center justify-center text-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
                        <Clapperboard className="w-6 h-6" />
                    </div>
                    <div>
                        <h4 className="text-sm font-black text-gray-900">
                            {search ? 'No se encontraron informes coincidentes' : 'Aún no hay Video Informes creados'}
                        </h4>
                        <p className="text-xs text-gray-500 max-w-md mt-1">
                            {search
                                ? 'Prueba con otro término de búsqueda o limpia el filtro.'
                                : 'Cada vez que inicies un informe en el Creador de Video (preset Video Informe), se respaldará automáticamente aquí para que nunca pierdas tu progreso.'}
                        </p>
                    </div>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {filtered.map(p => {
                        const isRenderReady = p.hasRender && p.renderStatus === 'ready' && !!p.renderVideoUrl;
                        const isRendering = p.renderStatus === 'rendering';

                        return (
                            <div
                                key={p.id}
                                className="group relative bg-white border border-gray-200 hover:border-indigo-400 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all flex flex-col justify-between overflow-hidden"
                            >
                                <div>
                                    {/* Preview / Portada */}
                                    <div className="relative w-full aspect-video rounded-xl bg-slate-900 overflow-hidden mb-3.5 flex items-center justify-center group/thumb">
                                        {p.firstSceneThumb ? (
                                            <img
                                                src={p.firstSceneThumb}
                                                alt={p.title}
                                                className="w-full h-full object-cover group-hover/thumb:scale-105 transition-transform duration-300"
                                            />
                                        ) : (
                                            <div className="w-full h-full bg-gradient-to-br from-indigo-900 via-slate-900 to-indigo-950 flex flex-col items-center justify-center text-indigo-300 p-4 text-center">
                                                <Clapperboard className="w-8 h-8 mb-1.5 opacity-60" />
                                                <span className="text-[11px] font-black uppercase tracking-wider text-indigo-200">Video Informe</span>
                                            </div>
                                        )}

                                        {/* Overlay si está renderizado para reproducir */}
                                        {isRenderReady && (
                                            <button
                                                type="button"
                                                onClick={() => setPreviewVideoUrl({ url: p.renderVideoUrl!, title: p.title })}
                                                className="absolute inset-0 bg-black/40 hover:bg-black/50 backdrop-blur-[2px] flex items-center justify-center transition-all opacity-90 group-hover/thumb:opacity-100"
                                                title="Previsualizar Video"
                                            >
                                                <div className="w-12 h-12 rounded-full bg-white/90 hover:bg-white text-indigo-600 flex items-center justify-center shadow-lg transform transition-transform hover:scale-110">
                                                    <Play className="w-5 h-5 fill-indigo-600 ml-0.5" />
                                                </div>
                                            </button>
                                        )}

                                        {/* Status Pill en la esquina superior izquierda */}
                                        <div className="absolute top-2 left-2 z-10">
                                            {isRenderReady ? (
                                                <span className="px-2 py-0.5 bg-emerald-600/90 backdrop-blur-md text-white text-[10px] font-black uppercase tracking-wider rounded-md shadow-sm flex items-center gap-1">
                                                    <CheckCircle2 className="w-3 h-3" /> Renderizado
                                                </span>
                                            ) : isRendering ? (
                                                <span className="px-2 py-0.5 bg-amber-500/90 backdrop-blur-md text-white text-[10px] font-black uppercase tracking-wider rounded-md shadow-sm flex items-center gap-1 animate-pulse">
                                                    <Loader2 className="w-3 h-3 animate-spin" /> Renderizando
                                                </span>
                                            ) : (
                                                <span className="px-2 py-0.5 bg-indigo-600/90 backdrop-blur-md text-white text-[10px] font-black uppercase tracking-wider rounded-md shadow-sm flex items-center gap-1">
                                                    <Clock className="w-3 h-3" /> En edición
                                                </span>
                                            )}
                                        </div>

                                        {/* Duración en la esquina inferior derecha */}
                                        <div className="absolute bottom-2 right-2 z-10 px-2 py-0.5 bg-black/75 backdrop-blur-md text-white text-[10px] font-bold rounded-md">
                                            {formatDuration(p.totalDurationSec || p.targetDurationSec || 120)}
                                        </div>
                                    </div>

                                    {/* Metadatos */}
                                    <div className="flex flex-col gap-1.5 mb-4">
                                        {p.campaignName && (
                                            <span className="text-[10px] font-black uppercase tracking-wider text-indigo-600 line-clamp-1">
                                                Campaña: {p.campaignName}
                                            </span>
                                        )}
                                        <h4 className="font-black text-gray-900 text-sm leading-snug line-clamp-2">
                                            {p.title}
                                        </h4>
                                        <div className="flex items-center gap-3 text-[11px] text-gray-500 font-medium">
                                            <span>{p.sceneCount} escenas</span>
                                            <span>•</span>
                                            <span>Modo {p.productionMode}</span>
                                            <span>•</span>
                                            <span>{formatDate(p.updatedAt || p.createdAt)}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Acciones */}
                                <div className="pt-3 border-t border-gray-100 flex items-center justify-between gap-2">
                                    <button
                                        type="button"
                                        onClick={() => onEditProject(p.id)}
                                        className="flex-1 py-2 px-3 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-sm shadow-indigo-600/20"
                                    >
                                        <Clapperboard className="w-3.5 h-3.5" />
                                        <span>Continuar Editando</span>
                                    </button>

                                    {isRenderReady && onPublishVideo && (
                                        <button
                                            type="button"
                                            onClick={() => onPublishVideo({ id: p.id, title: p.title, videoUrl: p.renderVideoUrl! })}
                                            title="Publicar en Redes Sociales"
                                            className="p-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl transition-all"
                                        >
                                            <Share2 className="w-3.5 h-3.5" />
                                        </button>
                                    )}

                                    <button
                                        type="button"
                                        onClick={(e) => handleDelete(p.id, p.title, e)}
                                        disabled={deletingId === p.id}
                                        title="Eliminar de la biblioteca"
                                        className="p-2 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all disabled:opacity-50"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Modal de Previsualización de Video Renderizado */}
            {previewVideoUrl && (
                <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="bg-slate-900 rounded-3xl overflow-hidden max-w-3xl w-full border border-slate-800 shadow-2xl flex flex-col">
                        <div className="p-4 px-6 border-b border-slate-800 flex items-center justify-between text-white">
                            <div className="flex items-center gap-2">
                                <Film className="w-4 h-4 text-indigo-400" />
                                <span className="font-black text-sm">{previewVideoUrl.title}</span>
                            </div>
                            <button
                                type="button"
                                onClick={() => setPreviewVideoUrl(null)}
                                className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-slate-800 transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-4 bg-black flex items-center justify-center">
                            <video
                                src={previewVideoUrl.url}
                                controls
                                autoPlay
                                className="w-full aspect-video rounded-xl max-h-[70vh] object-contain"
                            />
                        </div>
                        <div className="p-4 px-6 bg-slate-900 border-t border-slate-800 flex justify-between items-center">
                            <span className="text-xs text-gray-400 font-medium">Video Renderizado en 1080p Full HD</span>
                            <a
                                href={previewVideoUrl.url}
                                download={`${previewVideoUrl.title}.mp4`}
                                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs rounded-xl transition-all flex items-center gap-1.5 shadow"
                            >
                                <Download className="w-3.5 h-3.5" /> Descargar MP4
                            </a>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default VideoReportLibrary;
