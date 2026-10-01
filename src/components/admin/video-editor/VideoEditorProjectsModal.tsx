// ════════════════════════════════════════════════════════════════════════════
// Modal Gestor de Proyectos de Video (Tema Claro) — v4.1143.0
//
// Permite listar proyectos existentes, crear uno nuevo con selector de aspecto,
// duplicar o eliminar proyectos existentes.
// ════════════════════════════════════════════════════════════════════════════

import React, { useState, useEffect } from 'react';
import {
    FolderKanban,
    Plus,
    Trash2,
    Copy,
    Calendar,
    Tv,
    Smartphone,
    Square,
    X,
    Loader2,
    ExternalLink,
    Clock
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
                const list = Array.isArray(data.data) ? data.data : (Array.isArray(data.projects) ? data.projects : (Array.isArray(data) ? data : []));
                setProjects(list);
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
                setProjects(projects.filter(p => p.id !== id));
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
                toast.success('Proyecto duplicado exitosamente');
                fetchProjects();
            }
        } catch (err) {
            console.error('[VideoEditorProjectsModal] Error duplicating project:', err);
            toast.error('Error al duplicar proyecto');
        }
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 select-none animate-in fade-in duration-150">
            <div className="bg-white border border-gray-200 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col text-gray-800 max-h-[85vh]">
                {/* Encabezado */}
                <div className="p-5 border-b border-gray-200 flex items-center justify-between bg-slate-50/70">
                    <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-[#013388]">
                            <FolderKanban className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="text-base font-bold text-gray-900 tracking-tight">Proyectos de Video</h3>
                            <p className="text-xs text-gray-500">Gestiona tus ediciones o crea una nueva composición</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-700 transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Cuerpo del Modal */}
                <div className="p-6 overflow-y-auto space-y-5">
                    {/* Botón / Alternador Modo Creación */}
                    {!isCreating ? (
                        <button
                            onClick={() => setIsCreating(true)}
                            className="w-full p-4 rounded-xl border-2 border-dashed border-blue-300 hover:border-[#013388] bg-blue-50/40 hover:bg-blue-50/80 text-[#013388] font-bold flex items-center justify-center gap-2 transition-all shadow-xs"
                        >
                            <Plus className="w-5 h-5" />
                            <span>Crear Nuevo Proyecto</span>
                        </button>
                    ) : (
                        <form onSubmit={handleCreateSubmit} className="p-4 bg-slate-50 border border-gray-200 rounded-xl space-y-4">
                            <div className="flex items-center justify-between">
                                <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wider">Nuevo Proyecto de Video</h4>
                                <button
                                    type="button"
                                    onClick={() => setIsCreating(false)}
                                    className="text-xs text-gray-500 hover:text-gray-900"
                                >
                                    Cancelar
                                </button>
                            </div>

                            <div>
                                <label className="text-xs font-semibold text-gray-600 block mb-1">Nombre del proyecto</label>
                                <input
                                    type="text"
                                    value={newTitle}
                                    onChange={(e) => setNewTitle(e.target.value)}
                                    placeholder="Nombre del proyecto..."
                                    className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 outline-none focus:border-[#013388]"
                                    autoFocus
                                />
                            </div>

                            {/* Selección de Formato inicial */}
                            <div>
                                <label className="text-xs font-semibold text-gray-600 block mb-2">Formato inicial del video</label>
                                <div className="grid grid-cols-3 gap-2.5">
                                    <div
                                        onClick={() => setNewFormat('16:9')}
                                        className={`p-3 rounded-xl border cursor-pointer transition-all ${
                                            newFormat === '16:9'
                                                ? 'bg-blue-50 border-[#013388] text-[#013388] font-bold shadow-xs'
                                                : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                                        }`}
                                    >
                                        <div className="flex items-center gap-2 mb-1">
                                            <Tv className="w-4 h-4 text-[#013388]" />
                                            <span className="text-xs font-bold">16:9</span>
                                        </div>
                                        <p className="text-[10px] text-gray-500">YouTube, Web, TV</p>
                                    </div>

                                    <div
                                        onClick={() => setNewFormat('9:16')}
                                        className={`p-3 rounded-xl border cursor-pointer transition-all ${
                                            newFormat === '9:16'
                                                ? 'bg-blue-50 border-[#013388] text-[#013388] font-bold shadow-xs'
                                                : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                                        }`}
                                    >
                                        <div className="flex items-center gap-2 mb-1">
                                            <Smartphone className="w-4 h-4 text-[#013388]" />
                                            <span className="text-xs font-bold">9:16</span>
                                        </div>
                                        <p className="text-[10px] text-gray-500">Reels, Shorts, TikTok</p>
                                    </div>

                                    <div
                                        onClick={() => setNewFormat('1:1')}
                                        className={`p-3 rounded-xl border cursor-pointer transition-all ${
                                            newFormat === '1:1'
                                                ? 'bg-blue-50 border-[#013388] text-[#013388] font-bold shadow-xs'
                                                : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                                        }`}
                                    >
                                        <div className="flex items-center gap-2 mb-1">
                                            <Square className="w-4 h-4 text-[#013388]" />
                                            <span className="text-xs font-bold">1:1</span>
                                        </div>
                                        <p className="text-[10px] text-gray-500">Publicación Cuadrada</p>
                                    </div>
                                </div>
                            </div>

                            <button
                                type="submit"
                                className="w-full py-2.5 bg-[#013388] hover:bg-[#002868] text-white rounded-lg text-xs font-bold shadow-sm transition-all"
                            >
                                Crear y Abrir en el Editor
                            </button>
                        </form>
                    )}

                    {/* Lista de Proyectos Guardados */}
                    <div>
                        <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">
                            Proyectos Guardados ({projects.length})
                        </h4>

                        {loading ? (
                            <div className="flex items-center justify-center py-10 text-gray-400 gap-2">
                                <Loader2 className="w-5 h-5 animate-spin text-[#013388]" />
                                <span className="text-xs">Cargando proyectos...</span>
                            </div>
                        ) : projects.length === 0 ? (
                            <div className="text-center py-8 text-gray-500 border border-dashed border-gray-200 rounded-xl">
                                <p className="text-xs">No hay proyectos de video registrados aún.</p>
                            </div>
                        ) : (
                            <div className="space-y-2.5">
                                {projects.map((p) => {
                                    const isCurrent = p.id === currentProjectId;
                                    return (
                                        <div
                                            key={p.id}
                                            onClick={() => onSelectProject(p.id)}
                                            className={`p-3.5 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                                                isCurrent
                                                    ? 'bg-blue-50/70 border-[#013388] shadow-xs'
                                                    : 'bg-white border-gray-200 hover:bg-slate-50'
                                            }`}
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-lg bg-slate-100 border border-gray-200 flex items-center justify-center text-[#013388]">
                                                    {p.format === '9:16' ? <Smartphone className="w-5 h-5" /> : p.format === '1:1' ? <Square className="w-5 h-5" /> : <Tv className="w-5 h-5" />}
                                                </div>
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-xs font-bold text-gray-900">{p.title}</span>
                                                        {isCurrent && (
                                                            <span className="text-[10px] font-bold bg-[#013388] text-white px-2 py-0.5 rounded-full">
                                                                Abierto
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-3 text-[11px] text-gray-500 mt-0.5">
                                                        <span>{p.format} · {p.resolution || '1080p'}</span>
                                                        <span>·</span>
                                                        <span className="flex items-center gap-1">
                                                            <Clock className="w-3 h-3" />
                                                            {p.duration || 30}s
                                                        </span>
                                                        {p.updatedAt && (
                                                            <>
                                                                <span>·</span>
                                                                <span>{new Date(p.updatedAt).toLocaleDateString('es-CO')}</span>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-1">
                                                <button
                                                    onClick={(e) => handleDuplicateProject(p.id, e)}
                                                    className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-700 transition-colors"
                                                    title="Duplicar proyecto"
                                                >
                                                    <Copy className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={(e) => handleDeleteProject(p.id, e)}
                                                    className="p-1.5 hover:bg-rose-50 rounded-lg text-gray-400 hover:text-rose-600 transition-colors"
                                                    title="Eliminar proyecto"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
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
