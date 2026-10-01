// ════════════════════════════════════════════════════════════════════════════
// Modal Gestor de Proyectos de Video — v4.1141.0
//
// Creación de nuevo proyecto con elección de formato inicial (16:9, 9:16, 1:1)
// y listado de proyectos recientes con opción de "Continuar editando".
// ════════════════════════════════════════════════════════════════════════════

import React, { useState, useEffect } from 'react';
import {
    X,
    Plus,
    FolderKanban,
    Tv,
    Smartphone,
    Square,
    Play,
    Copy,
    Trash2,
    Calendar,
    Clock,
    Loader2,
    Film
} from 'lucide-react';
import type { AspectRatio, VideoEditorProjectData } from './types';
import { getStudioAuthToken } from '../../../lib/contentStudioFeatures';
import { toast } from 'sonner';

interface VideoEditorProjectsModalProps {
    isOpen: boolean;
    onClose: () => void;
    currentProjectId: string;
    clubId?: string | null;
    onSelectProject: (projectId: string) => void;
    onCreateNewProject: (title: string, format: AspectRatio) => void;
}

export const VideoEditorProjectsModal: React.FC<VideoEditorProjectsModalProps> = ({
    isOpen,
    onClose,
    currentProjectId,
    clubId,
    onSelectProject,
    onCreateNewProject
}) => {
    const [projects, setProjects] = useState<VideoEditorProjectData[]>([]);
    const [loading, setLoading] = useState(false);
    const [isCreating, setIsCreating] = useState(false);

    // Formulario de nuevo proyecto
    const [newTitle, setNewTitle] = useState('');
    const [newFormat, setNewFormat] = useState<AspectRatio>('16:9');

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
                setProjects(Array.isArray(data.projects) ? data.projects : []);
            }
        } catch (err) {
            console.error('[VideoEditorProjectsModal] Error fetching projects:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (isOpen) {
            fetchProjects();
            setIsCreating(false);
            setNewTitle(`Video ${new Date().toLocaleDateString('es-CO')}`);
        }
    }, [isOpen, clubId]);

    if (!isOpen) return null;

    const handleCreateSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const titleToUse = newTitle.trim() || `Video ${new Date().toLocaleDateString('es-CO')}`;
        onCreateNewProject(titleToUse, newFormat);
        onClose();
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
            console.error('[VideoEditorProjectsModal] Error deleting project:', err);
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
                toast.success('Proyecto duplicado');
                fetchProjects();
            }
        } catch (err) {
            console.error('[VideoEditorProjectsModal] Error duplicating project:', err);
            toast.error('Error al duplicar');
        }
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 select-none">
            <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col text-white max-h-[85vh] animate-in fade-in zoom-in-95 duration-200">
                {/* Encabezado */}
                <div className="p-5 border-b border-gray-800 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
                            <FolderKanban className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h3 className="text-base font-bold text-white tracking-tight">Proyectos de Video</h3>
                            <p className="text-xs text-gray-400">Gestiona tus ediciones o crea una nueva composición</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 hover:bg-gray-800 rounded-lg text-gray-400 hover:text-white transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Cuerpo del Modal */}
                <div className="p-6 overflow-y-auto space-y-6">
                    {/* Botón / Alternador Modo Creación */}
                    {!isCreating ? (
                        <button
                            onClick={() => setIsCreating(true)}
                            className="w-full p-4 rounded-2xl border-2 border-dashed border-indigo-500/50 hover:border-indigo-400 bg-indigo-950/20 hover:bg-indigo-950/40 text-indigo-300 font-bold flex items-center justify-center gap-2 transition-all shadow-sm"
                        >
                            <Plus className="w-5 h-5 text-indigo-400" />
                            <span>Crear Nuevo Proyecto</span>
                        </button>
                    ) : (
                        <form onSubmit={handleCreateSubmit} className="p-4 bg-gray-950 border border-gray-800 rounded-2xl space-y-4">
                            <div className="flex items-center justify-between">
                                <h4 className="text-xs font-bold text-white uppercase tracking-wider">Nuevo Proyecto de Video</h4>
                                <button
                                    type="button"
                                    onClick={() => setIsCreating(false)}
                                    className="text-xs text-gray-400 hover:text-white"
                                >
                                    Cancelar
                                </button>
                            </div>

                            <div>
                                <label className="text-xs font-semibold text-gray-400 block mb-1">Nombre del proyecto</label>
                                <input
                                    type="text"
                                    value={newTitle}
                                    onChange={(e) => setNewTitle(e.target.value)}
                                    placeholder="Nombre del proyecto..."
                                    className="w-full bg-gray-900 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-indigo-500"
                                    autoFocus
                                />
                            </div>

                            {/* Selección de Formato inicial inspirado en CapCut */}
                            <div>
                                <label className="text-xs font-semibold text-gray-400 block mb-2">Formato inicial del video</label>
                                <div className="grid grid-cols-3 gap-2.5">
                                    <div
                                        onClick={() => setNewFormat('16:9')}
                                        className={`p-3 rounded-xl border cursor-pointer transition-all ${
                                            newFormat === '16:9'
                                                ? 'bg-indigo-600/30 border-indigo-500 text-white shadow'
                                                : 'bg-gray-900 border-gray-800 text-gray-400 hover:border-gray-700'
                                        }`}
                                    >
                                        <div className="flex items-center gap-2 mb-1">
                                            <Tv className="w-4 h-4 text-indigo-400" />
                                            <span className="text-xs font-bold">16:9</span>
                                        </div>
                                        <p className="text-[10px] text-gray-400">YouTube, Web, TV</p>
                                    </div>

                                    <div
                                        onClick={() => setNewFormat('9:16')}
                                        className={`p-3 rounded-xl border cursor-pointer transition-all ${
                                            newFormat === '9:16'
                                                ? 'bg-indigo-600/30 border-indigo-500 text-white shadow'
                                                : 'bg-gray-900 border-gray-800 text-gray-400 hover:border-gray-700'
                                        }`}
                                    >
                                        <div className="flex items-center gap-2 mb-1">
                                            <Smartphone className="w-4 h-4 text-indigo-400" />
                                            <span className="text-xs font-bold">9:16</span>
                                        </div>
                                        <p className="text-[10px] text-gray-400">Reels, Shorts, TikTok</p>
                                    </div>

                                    <div
                                        onClick={() => setNewFormat('1:1')}
                                        className={`p-3 rounded-xl border cursor-pointer transition-all ${
                                            newFormat === '1:1'
                                                ? 'bg-indigo-600/30 border-indigo-500 text-white shadow'
                                                : 'bg-gray-900 border-gray-800 text-gray-400 hover:border-gray-700'
                                        }`}
                                    >
                                        <div className="flex items-center gap-2 mb-1">
                                            <Square className="w-4 h-4 text-indigo-400" />
                                            <span className="text-xs font-bold">1:1</span>
                                        </div>
                                        <p className="text-[10px] text-gray-400">Instagram, Cuadrado</p>
                                    </div>
                                </div>
                            </div>

                            <button
                                type="submit"
                                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow-lg transition-transform active:scale-95"
                            >
                                Crear y Comenzar a Editar
                            </button>
                        </form>
                    )}

                    {/* Proyectos Recientes */}
                    <div>
                        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
                            Proyectos Recientes
                        </h4>

                        {loading ? (
                            <div className="flex flex-col items-center justify-center py-12 text-gray-500 gap-2">
                                <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
                                <span className="text-xs">Cargando proyectos...</span>
                            </div>
                        ) : projects.length === 0 ? (
                            <div className="text-center py-8 text-gray-500 border border-dashed border-gray-800 rounded-xl">
                                <Film className="w-8 h-8 mx-auto mb-2 opacity-30 text-indigo-400" />
                                <p className="text-xs">No hay proyectos de video previos.</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {projects.map((proj) => {
                                    const isCurrent = proj.id === currentProjectId;
                                    return (
                                        <div
                                            key={proj.id}
                                            onClick={() => {
                                                onSelectProject(proj.id);
                                                onClose();
                                            }}
                                            className={`p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col justify-between gap-3 ${
                                                isCurrent
                                                    ? 'bg-indigo-950/40 border-indigo-500 ring-1 ring-indigo-500'
                                                    : 'bg-gray-800/80 border-gray-700/60 hover:border-gray-600 hover:bg-gray-800'
                                            }`}
                                        >
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="truncate">
                                                    <p className="text-sm font-bold text-white truncate" title={proj.title}>
                                                        {proj.title}
                                                    </p>
                                                    <div className="flex items-center gap-2 mt-1 text-[11px] text-gray-400">
                                                        <span className="px-1.5 py-0.5 rounded bg-gray-900 border border-gray-700 text-gray-300 font-mono text-[10px]">
                                                            {proj.format}
                                                        </span>
                                                        <span>{proj.duration ? `${proj.duration.toFixed(1)}s` : 'Borrador'}</span>
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-1">
                                                    <button
                                                        onClick={(e) => handleDuplicateProject(proj.id, e)}
                                                        className="p-1.5 hover:bg-gray-700 rounded text-gray-400 hover:text-white"
                                                        title="Duplicar"
                                                    >
                                                        <Copy className="w-3.5 h-3.5" />
                                                    </button>
                                                    <button
                                                        onClick={(e) => handleDeleteProject(proj.id, e)}
                                                        className="p-1.5 hover:bg-rose-950 rounded text-gray-400 hover:text-rose-400"
                                                        title="Eliminar"
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            </div>

                                            <div className="flex items-center justify-between pt-2 border-t border-gray-700/50 text-[10px] text-gray-400">
                                                <span className="flex items-center gap-1">
                                                    <Clock className="w-3 h-3" />
                                                    <span>
                                                        {proj.updatedAt ? new Date(proj.updatedAt).toLocaleDateString('es-CO') : ''}
                                                    </span>
                                                </span>

                                                <span className="text-indigo-400 font-bold group-hover:underline">
                                                    {isCurrent ? 'Editando ahora' : 'Continuar editando →'}
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
