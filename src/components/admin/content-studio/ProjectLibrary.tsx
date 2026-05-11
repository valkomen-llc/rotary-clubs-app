import React, { useEffect, useState } from 'react';
import {
    Video,
    Clock,
    Share2,
    Trash2,
    ExternalLink,
    Loader2,
    Play,
    CheckCircle2,
    AlertCircle,
    RefreshCw
} from 'lucide-react';
import { toast } from 'sonner';
import PublishModal from './PublishModal';

interface VideoProject {
    id: string;
    title: string;
    videoUrl: string | null;
    status: 'draft' | 'processing' | 'ready' | 'failed';
    createdAt: string;
    lastKieResponse?: any;
}

const ProjectLibrary: React.FC = () => {
    const [projects, setProjects] = useState<VideoProject[]>([]);
    const [loading, setLoading] = useState(true);
    const [publishTarget, setPublishTarget] = useState<VideoProject | null>(null);

    useEffect(() => {
        fetchProjects();
    }, []);

    // v4.42.0: Auto-Polling for processing projects
    useEffect(() => {
        const hasProcessing = projects.some(p => p.status === 'processing');
        if (!hasProcessing) return;

        const interval = setInterval(() => {
            console.log('Radar v4.42.0: Sincronizando biblioteca automáticamente...');
            
            // For each processing project, trigger a sync in the backend
            // But to save resources, we'll just fetch all projects again
            // and the backend sync will happen on demand if we hit the sync controller
            // Actually, we should just perform a refresh
            fetchProjects(false); // Silent refresh
        }, 30000);

        return () => clearInterval(interval);
    }, [projects]);

    const fetchProjects = async (showLoading = true) => {
        if (showLoading) setLoading(true);
        try {
            const token = localStorage.getItem('rotary_token');
            const response = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/content-studio/projects`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                const data = await response.json();
                setProjects(data);
            }
        } catch (error) {
            toast.error('Error al cargar la biblioteca de videos');
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('¿Estás seguro de eliminar este proyecto de video?')) return;
        
        const tId = toast.loading('Eliminando proyecto...');
        try {
            const token = localStorage.getItem('rotary_token');
            const response = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/content-studio/projects/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                toast.success('Proyecto eliminado correctamente', { id: tId });
                fetchProjects(false);
            } else {
                toast.error('No se pudo eliminar el proyecto', { id: tId });
            }
        } catch (error) {
            toast.error('Error de conexión al eliminar', { id: tId });
        }
    };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'ready': return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
            case 'processing': return <Loader2 className="w-4 h-4 text-indigo-500 animate-spin" />;
            case 'failed': return <AlertCircle className="w-4 h-4 text-red-500" />;
            default: return <Clock className="w-4 h-4 text-gray-400" />;
        }
    };

    const getStatusText = (status: string) => {
        switch (status) {
            case 'ready': return 'Listo';
            case 'processing': return 'Procesando...';
            case 'failed': return 'Error';
            default: return 'Borrador';
        }
    };

    if (loading) {
        return (
            <div className="py-20 text-center">
                <Loader2 className="w-10 h-10 text-indigo-600 animate-spin mx-auto mb-4" />
                <p className="text-gray-500 font-bold">Cargando biblioteca...</p>
            </div>
        );
    }

    if (projects.length === 0) {
        return (
            <div className="bg-white rounded-3xl border border-dashed border-gray-200 p-20 text-center">
                <Video className="w-16 h-16 text-gray-100 mx-auto mb-6" />
                <h3 className="text-xl font-black text-gray-900 mb-2">Tu videoteca está vacía</h3>
                <p className="text-gray-500 max-w-sm mx-auto mb-8">Los videos generados con IA aparecerán aquí automáticamente una vez finalizado el renderizado.</p>
            </div>
        );
    }

    return (
        <>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 animate-in fade-in duration-500">
            {projects.map((project) => (
                <div key={project.id} className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden group hover:shadow-xl hover:-translate-y-1 transition-all">
                    {/* Thumbnail / Preview */}
                    <div className="aspect-[9/16] bg-gray-900 relative flex items-center justify-center overflow-hidden">
                        {project.videoUrl ? (
                            <video src={project.videoUrl} className="w-full h-full object-cover opacity-60" />
                        ) : (
                            <div className="flex flex-col items-center gap-3">
                                {getStatusIcon(project.status)}
                                <span className="text-[10px] font-black text-white/40 uppercase tracking-widest">{getStatusText(project.status)}</span>
                            </div>
                        )}
                        
                        {project.videoUrl && (
                            <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity">
                                <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center shadow-2xl scale-90 group-hover:scale-100 transition-transform">
                                    <Play className="w-6 h-6 text-indigo-600 fill-indigo-600 ml-1" />
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Meta */}
                    <div className="p-5">
                        <div className="flex justify-between items-start mb-1">
                            <h4 className="font-black text-gray-900 text-sm truncate pr-2">{project.title}</h4>
                            <div className="flex items-center gap-1">
                                {getStatusIcon(project.status)}
                            </div>
                        </div>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
                             Generado el {new Date(project.createdAt).toLocaleDateString()}
                         </p>
                         
                         {project.status === 'processing' && project.lastKieResponse && (
                             <div className="mb-4 p-2 bg-indigo-50/50 rounded-lg border border-indigo-100/50">
                                <div className="flex items-center gap-1 mb-1">
                                    <div className="w-1 h-1 rounded-full bg-indigo-400 animate-pulse" />
                                    <span className="text-[8px] font-black text-indigo-400 uppercase tracking-tighter">KIE.AI STATUS</span>
                                </div>
                                <p className="text-[9px] font-mono text-indigo-600 truncate">
                                    {typeof project.lastKieResponse === 'string' ? project.lastKieResponse : (project.lastKieResponse.status || project.lastKieResponse.data?.status || 'Active')}
                                </p>
                             </div>
                         )}

                         {project.status === 'failed' && project.lastKieResponse && (
                             <details className="mb-3">
                                <summary className="cursor-pointer p-2 bg-red-50/50 rounded-lg border border-red-100/50 list-none">
                                    <div className="flex items-center gap-1 mb-1">
                                        <div className="w-1 h-1 rounded-full bg-red-500" />
                                        <span className="text-[8px] font-black text-red-500 uppercase tracking-tighter">Error · click para detalle</span>
                                    </div>
                                    <p className="text-[10px] font-bold text-red-700 line-clamp-2">
                                        {typeof project.lastKieResponse === 'object' && project.lastKieResponse.error
                                            ? project.lastKieResponse.error
                                            : 'Falló el render'}
                                    </p>
                                </summary>
                                <pre className="mt-2 p-2 bg-gray-900 text-emerald-300 rounded-lg text-[8px] font-mono overflow-x-auto max-h-40 leading-relaxed">
                                    {JSON.stringify(project.lastKieResponse, null, 2)}
                                </pre>
                             </details>
                         )}

                        <div className="flex gap-2">
                            {project.status === 'processing' && (
                                <button 
                                    onClick={async () => {
                                        const tId = toast.loading('Sincronizando con KIE.ai...');
                                        try {
                                            const token = localStorage.getItem('rotary_token');
                                            const res = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/content-studio/projects/${project.id}/sync`, {
                                                headers: { 'Authorization': `Bearer ${token}` }
                                            });
                                            if (res.ok) {
                                                toast.success('Estado actualizado', { id: tId });
                                                fetchProjects();
                                            }
                                        } catch (e) {
                                            toast.error('Fallo al sincronizar', { id: tId });
                                        }
                                    }}
                                    className="flex-1 bg-amber-50 text-amber-600 py-2 rounded-xl text-[10px] font-black uppercase hover:bg-amber-600 hover:text-white transition-all flex items-center justify-center gap-2"
                                >
                                    <RefreshCw className="w-3 h-3" /> Sincronizar
                                </button>
                            )}
                            {project.status === 'ready' && (
                                <button
                                    onClick={() => setPublishTarget(project)}
                                    className="flex-1 bg-indigo-50 text-indigo-600 py-2 rounded-xl text-[10px] font-black uppercase hover:bg-indigo-600 hover:text-white transition-all flex items-center justify-center gap-2"
                                >
                                    <Share2 className="w-3 h-3" /> Publicar
                                </button>
                            )}
                            <button 
                                onClick={() => handleDelete(project.id)}
                                className="px-3 bg-gray-50 text-gray-400 py-2 rounded-xl hover:bg-red-50 hover:text-red-500 transition-all"
                                title="Eliminar proyecto"
                            >
                                <Trash2 className="w-3 h-3" />
                            </button>
                        </div>
                    </div>
                </div>
            ))}
        </div>
        <PublishModal
            isOpen={!!publishTarget}
            project={publishTarget}
            onClose={() => setPublishTarget(null)}
            onPublished={() => fetchProjects(false)}
        />
        </>
    );
};

export default ProjectLibrary;
