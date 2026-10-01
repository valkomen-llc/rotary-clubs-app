// ════════════════════════════════════════════════════════════════════════════
// Centro de Gestión y Lanzamiento de Proyectos de Video — v4.1143.0
//
// Componente integrado en Estudio de Contenido (/admin/content-studio?tab=editor).
// Permite explorar, crear, duplicar y lanzar proyectos al workspace fullscreen
// independiente en una nueva pestaña del navegador (/video-editor/:id).
// ════════════════════════════════════════════════════════════════════════════

import React, { useState, useEffect } from 'react';
import {
    Film,
    Plus,
    ExternalLink,
    FolderKanban,
    Tv,
    Smartphone,
    Square,
    Copy,
    Trash2,
    Clock,
    Calendar,
    Sparkles,
    Search,
    Scissors,
    Layers,
    Loader2,
    Video,
    CheckCircle2
} from 'lucide-react';
import type { AspectRatio, Resolution, VideoEditorProjectData } from './types';
import { getStudioAuthToken } from '../../../lib/contentStudioFeatures';
import { toast } from 'sonner';

interface VideoEditorHubProps {
    clubId?: string | null;
}

export const VideoEditorHub: React.FC<VideoEditorHubProps> = ({ clubId }) => {
    const [projects, setProjects] = useState<VideoEditorProjectData[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [formatFilter, setFormatFilter] = useState<'all' | AspectRatio>('all');

    // Estado del modal de creación rápida
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [newTitle, setNewTitle] = useState('');
    const [newFormat, setNewFormat] = useState<AspectRatio>('16:9');
    const [newResolution, setNewResolution] = useState<Resolution>('1080p');
    const [creating, setCreating] = useState(false);

    const fetchProjects = async () => {
        try {
            setLoading(true);
            const token = getStudioAuthToken();
            const url = clubId ? `/api/video-editor/projects?clubId=${encodeURIComponent(clubId)}` : '/api/video-editor/projects';
            const res = await fetch(url, {
                headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) }
            });
            if (res.ok) {
                const data = await res.json();
                const list = Array.isArray(data.data) ? data.data : (Array.isArray(data.projects) ? data.projects : (Array.isArray(data) ? data : []));
                setProjects(list);
            }
        } catch (err) {
            console.error('[VideoEditorHub] Error al cargar proyectos:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchProjects();
    }, [clubId]);

    // Abrir proyecto en nueva pestaña dedicada
    const handleOpenInNewTab = (projectId: string) => {
        const targetUrl = `/video-editor/${projectId}`;
        window.open(targetUrl, '_blank', 'noopener,noreferrer');
    };

    // Crear y abrir en nueva pestaña
    const handleCreateProject = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            setCreating(true);
            const token = getStudioAuthToken();
            const titleToUse = newTitle.trim() || `Video ${new Date().toLocaleDateString('es-CO')}`;

            const res = await fetch('/api/video-editor/projects', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {})
                },
                body: JSON.stringify({
                    title: titleToUse,
                    format: newFormat,
                    resolution: newResolution,
                    duration: 30,
                    clubId: clubId || null
                })
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.error || 'Error al crear proyecto');
            }

            const data = await res.json();
            const created = data.data || data.project || (data.id ? data : null);

            if (created && created.id) {
                toast.success('Proyecto creado con éxito');
                setIsCreateModalOpen(false);
                fetchProjects();
                handleOpenInNewTab(created.id);
            }
        } catch (err: any) {
            console.error('[VideoEditorHub] Error creating project:', err);
            toast.error(err.message || 'Error al crear proyecto');
        } finally {
            setCreating(false);
        }
    };

    const handleDeleteProject = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!confirm('¿Deseas eliminar este proyecto de video? Esta acción no se puede deshacer.')) return;

        try {
            const token = getStudioAuthToken();
            const res = await fetch(`/api/video-editor/projects/${id}`, {
                method: 'DELETE',
                headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) }
            });
            if (res.ok) {
                toast.success('Proyecto eliminado');
                setProjects(prev => prev.filter(p => p.id !== id));
            }
        } catch (err) {
            console.error('[VideoEditorHub] Error deleting project:', err);
            toast.error('Error al eliminar proyecto');
        }
    };

    const handleDuplicateProject = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        try {
            const token = getStudioAuthToken();
            const res = await fetch(`/api/video-editor/projects/${id}/duplicate`, {
                method: 'POST',
                headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) }
            });
            if (res.ok) {
                toast.success('Proyecto duplicado exitosamente');
                fetchProjects();
            }
        } catch (err) {
            console.error('[VideoEditorHub] Error duplicating project:', err);
            toast.error('Error al duplicar');
        }
    };

    const filteredProjects = projects.filter(p => {
        const matchesSearch = !search.trim() || p.title.toLowerCase().includes(search.toLowerCase());
        const matchesFormat = formatFilter === 'all' || p.format === formatFilter;
        return matchesSearch && matchesFormat;
    });

    return (
        <div className="space-y-6">
            {/* ── Encabezado Principal y Botón de Acción ── */}
            <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-[#013388] rounded-3xl p-6 md:p-8 text-white shadow-xl relative overflow-hidden">
                <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-radial from-white/10 to-transparent pointer-events-none" />

                <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="space-y-2 max-w-2xl">
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-xs text-xs font-bold tracking-wide uppercase border border-white/20">
                            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                            <span>Workspace de Edición Profesional</span>
                        </div>
                        <h2 className="text-2xl md:text-3xl font-black tracking-tight">
                            Editor de Video Independiente
                        </h2>
                        <p className="text-sm text-blue-100/90 leading-relaxed">
                            Crea y edita piezas audiovisuales completas con línea de tiempo multipista, subtítulos inteligentes con IA y exportación HD. Los proyectos se abren en una pestaña exclusiva a pantalla completa para brindarte el máximo espacio de trabajo.
                        </p>
                    </div>

                    <button
                        onClick={() => {
                            setNewTitle(`Video ${new Date().toLocaleDateString('es-CO')}`);
                            setIsCreateModalOpen(true);
                        }}
                        className="px-6 py-3.5 bg-white hover:bg-blue-50 text-[#013388] font-bold text-sm rounded-2xl shadow-xl flex items-center justify-center gap-2.5 transition-all transform hover:scale-[1.02] active:scale-[0.98] shrink-0"
                    >
                        <Plus className="w-5 h-5 text-[#013388]" />
                        <span>Crear Nuevo Video</span>
                    </button>
                </div>

                {/* 3 Tarjetas de Características */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-6 pt-6 border-t border-white/15 text-xs">
                    <div className="flex items-center gap-2.5 bg-black/20 backdrop-blur-xs rounded-xl p-3 border border-white/10">
                        <div className="w-7 h-7 rounded-lg bg-blue-500/30 flex items-center justify-center shrink-0">
                            <ExternalLink className="w-4 h-4 text-blue-200" />
                        </div>
                        <div>
                            <p className="font-bold">Pestaña Independiente</p>
                            <p className="text-[11px] text-blue-200/80">100% fullscreen sin menú CMS</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2.5 bg-black/20 backdrop-blur-xs rounded-xl p-3 border border-white/10">
                        <div className="w-7 h-7 rounded-lg bg-purple-500/30 flex items-center justify-center shrink-0">
                            <Scissors className="w-4 h-4 text-purple-200" />
                        </div>
                        <div>
                            <p className="font-bold">Línea Multipista</p>
                            <p className="text-[11px] text-purple-200/80">Corte, recorte, texto y audio</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2.5 bg-black/20 backdrop-blur-xs rounded-xl p-3 border border-white/10">
                        <div className="w-7 h-7 rounded-lg bg-emerald-500/30 flex items-center justify-center shrink-0">
                            <Sparkles className="w-4 h-4 text-emerald-200" />
                        </div>
                        <div>
                            <p className="font-bold">Subtítulos con IA</p>
                            <p className="text-[11px] text-emerald-200/80">Transcripción y traducción fluida</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Filtros y Búsqueda ── */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-gray-200 shadow-xs">
                <div className="relative flex-1 max-w-md">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Buscar proyectos por nombre..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-gray-200 rounded-xl text-xs text-gray-800 placeholder:text-gray-400 focus:bg-white focus:border-[#013388] outline-none"
                    />
                </div>

                <div className="flex items-center gap-1.5 overflow-x-auto">
                    {(['all', '16:9', '9:16', '1:1'] as const).map(fmt => (
                        <button
                            key={fmt}
                            onClick={() => setFormatFilter(fmt)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                                formatFilter === fmt
                                    ? 'bg-[#013388] text-white shadow-xs font-bold'
                                    : 'bg-slate-50 text-gray-600 hover:bg-slate-100 border border-gray-200'
                            }`}
                        >
                            {fmt === '16:9' && <Tv className="w-3.5 h-3.5" />}
                            {fmt === '9:16' && <Smartphone className="w-3.5 h-3.5" />}
                            {fmt === '1:1' && <Square className="w-3.5 h-3.5" />}
                            <span className="capitalize">{fmt === 'all' ? 'Todos los formatos' : fmt}</span>
                        </button>
                    ))}
                </div>
            </div>

            {/* ── Cuadrícula de Proyectos ── */}
            {loading ? (
                <div className="flex flex-col items-center justify-center py-20 bg-white rounded-3xl border border-gray-200 shadow-xs gap-3">
                    <Loader2 className="w-8 h-8 animate-spin text-[#013388]" />
                    <p className="text-xs font-bold text-gray-600">Cargando tus proyectos de video...</p>
                </div>
            ) : filteredProjects.length === 0 ? (
                <div className="text-center py-16 px-4 bg-white rounded-3xl border-2 border-dashed border-gray-200 shadow-xs space-y-4">
                    <div className="w-16 h-16 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center mx-auto text-[#013388]">
                        <Film className="w-8 h-8" />
                    </div>
                    <div className="max-w-md mx-auto">
                        <h3 className="text-base font-bold text-gray-900">
                            {search || formatFilter !== 'all' ? 'No se encontraron proyectos con este filtro' : 'Aún no tienes proyectos de video'}
                        </h3>
                        <p className="text-xs text-gray-500 mt-1">
                            {search || formatFilter !== 'all'
                                ? 'Prueba borrando los filtros de búsqueda para ver todos los videos.'
                                : 'Comienza creando tu primer video profesional con lienzo multipista e IA.'}
                        </p>
                    </div>
                    <button
                        onClick={() => {
                            setNewTitle(`Video ${new Date().toLocaleDateString('es-CO')}`);
                            setIsCreateModalOpen(true);
                        }}
                        className="px-5 py-2.5 bg-[#013388] hover:bg-[#002868] text-white font-bold text-xs rounded-xl shadow-md inline-flex items-center gap-2"
                    >
                        <Plus className="w-4 h-4" />
                        <span>Crear Mi Primer Video</span>
                    </button>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {filteredProjects.map(project => (
                        <div
                            key={project.id}
                            className="group bg-white rounded-2xl border border-gray-200 hover:border-[#013388] shadow-xs hover:shadow-xl transition-all duration-200 flex flex-col overflow-hidden"
                        >
                            {/* Vista previa / Aspect ratio tile */}
                            <div className="h-44 bg-slate-900 relative flex items-center justify-center overflow-hidden">
                                {project.videoUrl ? (
                                    <video src={project.videoUrl} className="w-full h-full object-cover opacity-80" />
                                ) : (
                                    <div className="flex flex-col items-center gap-2 text-slate-400">
                                        <div className="w-12 h-12 rounded-xl bg-slate-800 flex items-center justify-center text-[#013388]">
                                            {project.format === '9:16' ? <Smartphone className="w-6 h-6" /> : project.format === '1:1' ? <Square className="w-6 h-6" /> : <Tv className="w-6 h-6" />}
                                        </div>
                                        <span className="text-[11px] font-bold text-slate-300">
                                            {project.clips?.length || 0} clips montados
                                        </span>
                                    </div>
                                )}

                                {/* Badges superiores */}
                                <div className="absolute top-3 left-3 flex items-center gap-1.5">
                                    <span className="px-2.5 py-1 rounded-lg bg-black/60 backdrop-blur-md text-[10px] font-bold text-white uppercase border border-white/10 flex items-center gap-1">
                                        {project.format === '9:16' ? <Smartphone className="w-3 h-3 text-amber-400" /> : project.format === '1:1' ? <Square className="w-3 h-3 text-indigo-400" /> : <Tv className="w-3 h-3 text-blue-400" />}
                                        <span>{project.format}</span>
                                    </span>
                                    <span className="px-2 py-1 rounded-lg bg-black/60 backdrop-blur-md text-[10px] font-mono font-bold text-slate-200 border border-white/10">
                                        {project.resolution || '1080p'}
                                    </span>
                                </div>

                                <div className="absolute top-3 right-3">
                                    <span className="px-2 py-1 rounded-lg bg-black/60 backdrop-blur-md text-[10px] font-bold text-slate-200 border border-white/10 flex items-center gap-1">
                                        <Clock className="w-3 h-3" />
                                        <span>{project.duration || 30}s</span>
                                    </span>
                                </div>

                                {/* Botón Hover Abrir Rápido */}
                                <div className="absolute inset-0 bg-[#013388]/60 backdrop-blur-xs opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all duration-200">
                                    <button
                                        onClick={() => handleOpenInNewTab(project.id)}
                                        className="px-4 py-2.5 bg-white text-[#013388] rounded-xl font-bold text-xs shadow-lg flex items-center gap-2 transform translate-y-2 group-hover:translate-y-0 transition-transform"
                                    >
                                        <ExternalLink className="w-4 h-4" />
                                        <span>Abrir en Nueva Pestaña</span>
                                    </button>
                                </div>
                            </div>

                            {/* Información y Acciones */}
                            <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                                <div>
                                    <h3 className="font-bold text-sm text-gray-900 truncate" title={project.title}>
                                        {project.title}
                                    </h3>
                                    <div className="flex items-center gap-3 text-[11px] text-gray-500 mt-1">
                                        <span className="flex items-center gap-1">
                                            <Calendar className="w-3 h-3" />
                                            {project.updatedAt ? new Date(project.updatedAt).toLocaleDateString('es-CO') : 'Reciente'}
                                        </span>
                                        <span>·</span>
                                        <span>{project.tracks?.length || 4} pistas</span>
                                    </div>
                                </div>

                                <div className="pt-2 border-t border-gray-100 flex items-center justify-between">
                                    <button
                                        onClick={() => handleOpenInNewTab(project.id)}
                                        className="px-3.5 py-1.5 bg-[#013388] hover:bg-[#002868] text-white rounded-lg text-xs font-bold shadow-xs inline-flex items-center gap-1.5 transition-colors"
                                    >
                                        <ExternalLink className="w-3.5 h-3.5" />
                                        <span>Abrir Editor</span>
                                    </button>

                                    <div className="flex items-center gap-1">
                                        <button
                                            onClick={(e) => handleDuplicateProject(project.id, e)}
                                            className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-700 transition-colors"
                                            title="Duplicar proyecto"
                                        >
                                            <Copy className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={(e) => handleDeleteProject(project.id, e)}
                                            className="p-1.5 hover:bg-rose-50 rounded-lg text-gray-400 hover:text-rose-600 transition-colors"
                                            title="Eliminar proyecto"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* ── Modal de Creación de Proyecto ── */}
            {isCreateModalOpen && (
                <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
                    <div className="bg-white border border-gray-200 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col text-gray-800">
                        <div className="p-5 border-b border-gray-200 flex items-center justify-between bg-slate-50/70">
                            <div className="flex items-center gap-2.5">
                                <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-[#013388]">
                                    <Film className="w-5 h-5" />
                                </div>
                                <div>
                                    <h3 className="text-base font-bold text-gray-900 tracking-tight">Crear Nuevo Proyecto</h3>
                                    <p className="text-xs text-gray-500">Se abrirá inmediatamente en una pestaña dedicada</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setIsCreateModalOpen(false)}
                                className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-700"
                            >
                                <span className="text-lg">×</span>
                            </button>
                        </div>

                        <form onSubmit={handleCreateProject} className="p-6 space-y-4">
                            <div>
                                <label className="text-xs font-bold text-gray-700 block mb-1">Nombre del video</label>
                                <input
                                    type="text"
                                    value={newTitle}
                                    onChange={(e) => setNewTitle(e.target.value)}
                                    placeholder="Ej: Resumen Anual del Club..."
                                    className="w-full bg-slate-50 border border-gray-300 rounded-xl px-3 py-2 text-sm text-gray-900 outline-none focus:bg-white focus:border-[#013388]"
                                    autoFocus
                                />
                            </div>

                            <div>
                                <label className="text-xs font-bold text-gray-700 block mb-2">Formato de pantalla</label>
                                <div className="grid grid-cols-3 gap-2.5">
                                    <div
                                        onClick={() => setNewFormat('16:9')}
                                        className={`p-3 rounded-xl border cursor-pointer transition-all ${
                                            newFormat === '16:9'
                                                ? 'bg-blue-50 border-[#013388] text-[#013388] font-bold shadow-xs'
                                                : 'bg-white border-gray-200 text-gray-600 hover:bg-slate-50'
                                        }`}
                                    >
                                        <div className="flex items-center gap-2 mb-1">
                                            <Tv className="w-4 h-4 text-[#013388]" />
                                            <span className="text-xs font-bold">16:9</span>
                                        </div>
                                        <p className="text-[10px] text-gray-500">Horizontal (YouTube, Web)</p>
                                    </div>

                                    <div
                                        onClick={() => setNewFormat('9:16')}
                                        className={`p-3 rounded-xl border cursor-pointer transition-all ${
                                            newFormat === '9:16'
                                                ? 'bg-blue-50 border-[#013388] text-[#013388] font-bold shadow-xs'
                                                : 'bg-white border-gray-200 text-gray-600 hover:bg-slate-50'
                                        }`}
                                    >
                                        <div className="flex items-center gap-2 mb-1">
                                            <Smartphone className="w-4 h-4 text-[#013388]" />
                                            <span className="text-xs font-bold">9:16</span>
                                        </div>
                                        <p className="text-[10px] text-gray-500">Vertical (Reels, TikTok)</p>
                                    </div>

                                    <div
                                        onClick={() => setNewFormat('1:1')}
                                        className={`p-3 rounded-xl border cursor-pointer transition-all ${
                                            newFormat === '1:1'
                                                ? 'bg-blue-50 border-[#013388] text-[#013388] font-bold shadow-xs'
                                                : 'bg-white border-gray-200 text-gray-600 hover:bg-slate-50'
                                        }`}
                                    >
                                        <div className="flex items-center gap-2 mb-1">
                                            <Square className="w-4 h-4 text-[#013388]" />
                                            <span className="text-xs font-bold">1:1</span>
                                        </div>
                                        <p className="text-[10px] text-gray-500">Cuadrado (Feed Social)</p>
                                    </div>
                                </div>
                            </div>

                            <div>
                                <label className="text-xs font-bold text-gray-700 block mb-1">Calidad de salida</label>
                                <select
                                    value={newResolution}
                                    onChange={(e) => setNewResolution(e.target.value as Resolution)}
                                    className="w-full bg-slate-50 border border-gray-300 rounded-xl px-3 py-2 text-xs font-semibold text-gray-900 outline-none"
                                >
                                    <option value="1080p">1080p Full HD (Recomendado)</option>
                                    <option value="720p">720p HD Rápido</option>
                                </select>
                            </div>

                            <div className="pt-2 flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setIsCreateModalOpen(false)}
                                    className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-gray-700 rounded-xl text-xs font-semibold"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={creating}
                                    className="flex-1 py-2.5 bg-[#013388] hover:bg-[#002868] disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-md flex items-center justify-center gap-2"
                                >
                                    {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />}
                                    <span>Crear y Abrir en Editor</span>
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default VideoEditorHub;
