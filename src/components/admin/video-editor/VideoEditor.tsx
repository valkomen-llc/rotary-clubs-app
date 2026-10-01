// ════════════════════════════════════════════════════════════════════════════
// Editor de Video Profesional — Componente Principal Orchestrator — v4.1141.0
//
// Módulo de creación y edición audiovisual dentro de "Estudio de Contenido".
// - Referencia funcional CapCut: biblioteca multimedia, lienzo con bloqueo de
//   aspect ratio (16:9, 9:16, 1:1, 4:5), herramientas laterales y timeline multipista.
// - Edición funcional: corte/división, recorte, duplicado, eliminación, reordenamiento.
// - Subtítulos automáticos con IA y traducción preservando timestamps.
// - Autoguardado continuo, deshacer/rehacer y pipeline asíncrono de renderizado HD.
// - Arquitectura multi-tenant con control modular por rol/sitio.
// ════════════════════════════════════════════════════════════════════════════

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    Loader2,
    AlertCircle,
    Film,
    Plus,
    RotateCcw,
    FolderKanban
} from 'lucide-react';
import type {
    VideoEditorProjectData,
    AspectRatio,
    Resolution,
    Clip,
    Track,
    SubtitleConfig,
    SubtitleSegment
} from './types';
import { VideoEditorHeader } from './VideoEditorHeader';
import { VideoEditorSidebar } from './VideoEditorSidebar';
import { VideoEditorCanvas } from './VideoEditorCanvas';
import { VideoEditorTimeline } from './VideoEditorTimeline';
import { VideoEditorExportModal } from './VideoEditorExportModal';
import { VideoEditorProjectsModal } from './VideoEditorProjectsModal';
import {
    DEFAULT_TRACKS,
    DEFAULT_SUBTITLE_STYLE,
    ASPECT_RATIOS
} from '../../../../server/lib/videoEditorSpec.js';
import { getStudioAuthToken } from '../../../lib/contentStudioFeatures';
import { toast } from 'sonner';

interface VideoEditorProps {
    clubId?: string | null;
}

interface HistoryState {
    tracks: Track[];
    clips: Clip[];
    subtitles: SubtitleConfig;
    duration: number;
}

const DEFAULT_PROJECT_STATE: VideoEditorProjectData = {
    id: '',
    title: 'Nuevo Proyecto de Video',
    format: '16:9',
    resolution: '1080p',
    duration: 30,
    tracks: DEFAULT_TRACKS as Track[],
    clips: [],
    subtitles: {
        segments: [],
        style: DEFAULT_SUBTITLE_STYLE as any
    },
    status: 'draft',
    renderStatus: 'idle',
    renderProgress: 0
};

export const VideoEditor: React.FC<VideoEditorProps> = ({ clubId }) => {
    // ── Referencia de Contenedor para Fullscreen ──────────────────────────────
    const editorContainerRef = useRef<HTMLDivElement>(null);
    const [isFullscreen, setIsFullscreen] = useState(false);

    // ── Estado del Proyecto Activo ────────────────────────────────────────────
    const [project, setProject] = useState<VideoEditorProjectData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // ── Estado de Interfaz y Reproducción ─────────────────────────────────────
    const [activeSidebarTab, setActiveSidebarTab] = useState<
        'media' | 'text' | 'audio' | 'subtitles' | 'transitions' | 'settings'
    >('media');
    const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
    const [currentTime, setCurrentTime] = useState<number>(0);
    const [isPlaying, setIsPlaying] = useState<boolean>(false);
    const [zoomLevel, setZoomLevel] = useState<number>(100);

    // ── Modales ───────────────────────────────────────────────────────────────
    const [isProjectsModalOpen, setIsProjectsModalOpen] = useState(false);
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);

    // ── Autoguardado ──────────────────────────────────────────────────────────
    const [saveStatus, setSaveStatus] = useState<'draft' | 'saving' | 'saved' | 'error'>('saved');
    const autosaveTimerRef = useRef<NodeJS.Timeout | null>(null);
    const lastSavedDataRef = useRef<string>('');

    // ── Pila de Deshacer / Rehacer (Undo / Redo) ──────────────────────────────
    const [history, setHistory] = useState<HistoryState[]>([]);
    const [historyIndex, setHistoryIndex] = useState<number>(-1);
    const isUndoRedoActionRef = useRef<boolean>(false);

    // ── Referencia de Animación de Reproducción ───────────────────────────────
    const animationFrameRef = useRef<number | null>(null);
    const lastPlaybackTimestampRef = useRef<number | null>(null);

    // ── 1. Cargar o Inicializar Proyecto ──────────────────────────────────────
    const loadProject = useCallback(async (projectIdToLoad?: string) => {
        try {
            setLoading(true);
            setError(null);
            const token = getStudioAuthToken();
            const headers = { ...(token ? { Authorization: `Bearer ${token}` } : {}) };

            if (projectIdToLoad) {
                const res = await fetch(`/api/video-editor/projects/${projectIdToLoad}`, { headers });
                const json = await res.json();
                if (json.success && json.data) {
                    initProjectState(json.data);
                    return;
                }
            }

            // Buscar proyectos existentes del tenant
            const url = clubId ? `/api/video-editor/projects?clubId=${encodeURIComponent(clubId)}` : '/api/video-editor/projects';
            const res = await fetch(url, { headers });
            const json = await res.json();

            if (json.success && Array.isArray(json.data) && json.data.length > 0) {
                // Cargar el proyecto más recientemente modificado
                const latestProject = json.data[0];
                initProjectState(latestProject);
            } else {
                // Crear automáticamente el primer proyecto predeterminado
                const createRes = await fetch('/api/video-editor/projects', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...headers
                    },
                    body: JSON.stringify({
                        title: 'Mi Primer Video',
                        format: '16:9',
                        resolution: '1080p',
                        duration: 30,
                        clubId: clubId || null
                    })
                });
                const createJson = await createRes.json();
                if (createJson.success && createJson.data) {
                    initProjectState(createJson.data);
                } else {
                    throw new Error(createJson.message || 'No se pudo crear el proyecto inicial');
                }
            }
        } catch (err: any) {
            console.error('Error al inicializar editor de video:', err);
            setError(err.message || 'Error al conectar con el servidor');
        } finally {
            setLoading(false);
        }
    }, [clubId]);

    const initProjectState = (projData: VideoEditorProjectData) => {
        // Asegurar estructura
        const sanitized: VideoEditorProjectData = {
            ...projData,
            tracks: Array.isArray(projData.tracks) && projData.tracks.length > 0 ? projData.tracks : (DEFAULT_TRACKS as Track[]),
            clips: Array.isArray(projData.clips) ? projData.clips : [],
            subtitles: projData.subtitles || { segments: [], style: DEFAULT_SUBTITLE_STYLE as any },
            duration: projData.duration || 30
        };

        setProject(sanitized);
        setCurrentTime(0);
        setIsPlaying(false);
        setSelectedClipId(null);
        setSaveStatus('saved');

        // Guardar referencia limpia
        const stateStr = JSON.stringify({
            tracks: sanitized.tracks,
            clips: sanitized.clips,
            subtitles: sanitized.subtitles,
            duration: sanitized.duration,
            title: sanitized.title,
            format: sanitized.format,
            resolution: sanitized.resolution
        });
        lastSavedDataRef.current = stateStr;

        // Inicializar historial
        setHistory([{
            tracks: sanitized.tracks,
            clips: sanitized.clips,
            subtitles: sanitized.subtitles,
            duration: sanitized.duration
        }]);
        setHistoryIndex(0);
    };

    useEffect(() => {
        loadProject();
    }, [loadProject]);

    // ── 2. Guardar en Historial para Undo / Redo ──────────────────────────────
    const pushHistory = useCallback((newState: HistoryState) => {
        if (isUndoRedoActionRef.current) {
            isUndoRedoActionRef.current = false;
            return;
        }

        setHistory(prev => {
            const nextHistory = prev.slice(0, historyIndex + 1);
            if (nextHistory.length >= 40) {
                nextHistory.shift();
            }
            return [...nextHistory, newState];
        });
        setHistoryIndex(prev => Math.min(prev + 1, 39));
    }, [historyIndex]);

    const handleUndo = useCallback(() => {
        if (historyIndex <= 0) return;
        const targetIndex = historyIndex - 1;
        const targetState = history[targetIndex];
        if (!targetState || !project) return;

        isUndoRedoActionRef.current = true;
        setHistoryIndex(targetIndex);
        setProject(prev => prev ? ({
            ...prev,
            tracks: targetState.tracks,
            clips: targetState.clips,
            subtitles: targetState.subtitles,
            duration: targetState.duration
        }) : null);
        setSaveStatus('draft');
    }, [history, historyIndex, project]);

    const handleRedo = useCallback(() => {
        if (historyIndex >= history.length - 1) return;
        const targetIndex = historyIndex + 1;
        const targetState = history[targetIndex];
        if (!targetState || !project) return;

        isUndoRedoActionRef.current = true;
        setHistoryIndex(targetIndex);
        setProject(prev => prev ? ({
            ...prev,
            tracks: targetState.tracks,
            clips: targetState.clips,
            subtitles: targetState.subtitles,
            duration: targetState.duration
        }) : null);
        setSaveStatus('draft');
    }, [history, historyIndex, project]);

    // ── 3. Motor de Autoguardado Asíncrono ────────────────────────────────────
    useEffect(() => {
        if (!project || !project.id || loading) return;

        const currentDataStr = JSON.stringify({
            tracks: project.tracks,
            clips: project.clips,
            subtitles: project.subtitles,
            duration: project.duration,
            title: project.title,
            format: project.format,
            resolution: project.resolution
        });

        // Si no hay cambios reales respecto al último guardado, no disparar
        if (currentDataStr === lastSavedDataRef.current) {
            return;
        }

        setSaveStatus('draft');

        if (autosaveTimerRef.current) {
            clearTimeout(autosaveTimerRef.current);
        }

        autosaveTimerRef.current = setTimeout(async () => {
            try {
                setSaveStatus('saving');
                const token = getStudioAuthToken();
                const res = await fetch(`/api/video-editor/projects/${project.id}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(token ? { Authorization: `Bearer ${token}` } : {})
                    },
                    body: JSON.stringify({
                        title: project.title,
                        format: project.format,
                        resolution: project.resolution,
                        duration: project.duration,
                        tracks: project.tracks,
                        clips: project.clips,
                        subtitles: project.subtitles
                    })
                });
                const json = await res.json();
                if (json.success) {
                    setSaveStatus('saved');
                    lastSavedDataRef.current = currentDataStr;
                } else {
                    setSaveStatus('error');
                }
            } catch (err) {
                console.error('Error al autoguardar proyecto de video:', err);
                setSaveStatus('error');
            }
        }, 1500);

        return () => {
            if (autosaveTimerRef.current) {
                clearTimeout(autosaveTimerRef.current);
            }
        };
    }, [project, loading]);

    // ── 4. Bucle de Reproducción (Play / Pause con requestAnimationFrame) ──────
    useEffect(() => {
        if (!isPlaying || !project) {
            lastPlaybackTimestampRef.current = null;
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
            }
            return;
        }

        const loop = (timestamp: number) => {
            if (lastPlaybackTimestampRef.current === null) {
                lastPlaybackTimestampRef.current = timestamp;
            }

            const deltaSeconds = (timestamp - lastPlaybackTimestampRef.current) / 1000;
            lastPlaybackTimestampRef.current = timestamp;

            setCurrentTime(prevTime => {
                const nextTime = prevTime + deltaSeconds;
                if (nextTime >= project.duration) {
                    setIsPlaying(false);
                    return 0; // Reiniciar al inicio al terminar
                }
                return nextTime;
            });

            animationFrameRef.current = requestAnimationFrame(loop);
        };

        animationFrameRef.current = requestAnimationFrame(loop);

        return () => {
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
            }
        };
    }, [isPlaying, project?.duration]);

    // ── 5. Operaciones de Clips y Pistas ─────────────────────────────────────
    const selectedClip = project?.clips.find(c => c.id === selectedClipId) || null;

    const handleAddClip = (newClipData: Omit<Clip, 'id'>) => {
        if (!project) return;
        const newClip: Clip = {
            ...newClipData,
            id: `clip-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`
        };

        const updatedClips = [...project.clips, newClip];

        // Recalcular duración del proyecto si el clip sobrepasa el límite
        const clipEnd = newClip.startTime + newClip.duration;
        const newDuration = Math.max(project.duration, Math.ceil(clipEnd + 2));

        const updatedProject: VideoEditorProjectData = {
            ...project,
            clips: updatedClips,
            duration: newDuration
        };

        setProject(updatedProject);
        setSelectedClipId(newClip.id);
        pushHistory({
            tracks: updatedProject.tracks,
            clips: updatedProject.clips,
            subtitles: updatedProject.subtitles,
            duration: updatedProject.duration
        });

        toast.success(`Añadido "${newClip.name}" a la línea de tiempo`);
    };

    const handleUpdateClip = (clipId: string, updates: Partial<Clip>) => {
        if (!project) return;
        const updatedClips = project.clips.map(c => {
            if (c.id === clipId) {
                return { ...c, ...updates };
            }
            return c;
        });

        // Recalcular duración máxima si cambió startTime o duration
        const maxEnd = updatedClips.reduce((max, c) => Math.max(max, c.startTime + c.duration), 10);
        const newDuration = Math.max(project.duration, Math.ceil(maxEnd + 2));

        const updatedProject: VideoEditorProjectData = {
            ...project,
            clips: updatedClips,
            duration: newDuration
        };

        setProject(updatedProject);
        pushHistory({
            tracks: updatedProject.tracks,
            clips: updatedProject.clips,
            subtitles: updatedProject.subtitles,
            duration: updatedProject.duration
        });
    };

    const handleDeleteClip = (clipId: string) => {
        if (!project) return;
        const clipToDelete = project.clips.find(c => c.id === clipId);
        const updatedClips = project.clips.filter(c => c.id !== clipId);

        const updatedProject: VideoEditorProjectData = {
            ...project,
            clips: updatedClips
        };

        setProject(updatedProject);
        if (selectedClipId === clipId) {
            setSelectedClipId(null);
        }

        pushHistory({
            tracks: updatedProject.tracks,
            clips: updatedProject.clips,
            subtitles: updatedProject.subtitles,
            duration: updatedProject.duration
        });

        if (clipToDelete) {
            toast.info(`Clip "${clipToDelete.name}" eliminado`);
        }
    };

    const handleDuplicateClip = (clipId: string) => {
        if (!project) return;
        const clipToDup = project.clips.find(c => c.id === clipId);
        if (!clipToDup) return;

        const duplicated: Clip = {
            ...clipToDup,
            id: `clip-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            name: `${clipToDup.name} (Copia)`,
            startTime: clipToDup.startTime + clipToDup.duration + 0.5
        };

        const updatedClips = [...project.clips, duplicated];
        const clipEnd = duplicated.startTime + duplicated.duration;
        const newDuration = Math.max(project.duration, Math.ceil(clipEnd + 2));

        const updatedProject: VideoEditorProjectData = {
            ...project,
            clips: updatedClips,
            duration: newDuration
        };

        setProject(updatedProject);
        setSelectedClipId(duplicated.id);

        pushHistory({
            tracks: updatedProject.tracks,
            clips: updatedProject.clips,
            subtitles: updatedProject.subtitles,
            duration: updatedProject.duration
        });

        toast.success(`Clip "${clipToDup.name}" duplicado`);
    };

    // ── 6. Cortar / Dividir Clip en Playhead ──────────────────────────────────
    const handleSplitClip = (clipId: string, atTime: number) => {
        if (!project) return;
        const clipToSplit = project.clips.find(c => c.id === clipId);
        if (!clipToSplit) return;

        // Comprobar que atTime esté estrictamente dentro del clip
        if (atTime <= clipToSplit.startTime + 0.1 || atTime >= (clipToSplit.startTime + clipToSplit.duration - 0.1)) {
            toast.error('El cabezal debe ubicarse dentro del clip para poder dividirlo');
            return;
        }

        const firstDuration = atTime - clipToSplit.startTime;
        const secondDuration = clipToSplit.duration - firstDuration;
        const secondStartTime = atTime;

        // Clip 1 (conserva inicio y recorta duración)
        const firstClip: Clip = {
            ...clipToSplit,
            duration: firstDuration
        };

        // Clip 2 (inicia en atTime)
        const secondClip: Clip = {
            ...clipToSplit,
            id: `clip-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            name: `${clipToSplit.name} (Parte 2)`,
            startTime: secondStartTime,
            duration: secondDuration,
            trimStart: (clipToSplit.trimStart || 0) + firstDuration
        };

        const updatedClips = project.clips.map(c => {
            if (c.id === clipId) {
                return firstClip;
            }
            return c;
        });

        // Insertar segundo clip inmediatamente después
        const splitIndex = updatedClips.findIndex(c => c.id === clipId);
        updatedClips.splice(splitIndex + 1, 0, secondClip);

        const updatedProject: VideoEditorProjectData = {
            ...project,
            clips: updatedClips
        };

        setProject(updatedProject);
        setSelectedClipId(secondClip.id);

        pushHistory({
            tracks: updatedProject.tracks,
            clips: updatedProject.clips,
            subtitles: updatedProject.subtitles,
            duration: updatedProject.duration
        });

        toast.success(`Clip dividido en dos partes a los ${atTime.toFixed(1)}s`);
    };

    // ── 7. Añadir Pista Dinámica ──────────────────────────────────────────────
    const handleAddTrack = (trackType: 'video' | 'audio' | 'text') => {
        if (!project) return;
        const typeLabels: Record<string, string> = {
            video: 'Video Extra',
            audio: 'Pista de Audio',
            text: 'Capa de Texto'
        };

        const newTrack: Track = {
            id: `track-${trackType}-${Date.now()}`,
            name: `${typeLabels[trackType]} ${project.tracks.filter(t => t.type === trackType).length + 1}`,
            type: trackType,
            order: project.tracks.length + 1,
            muted: false,
            locked: false,
            visible: true
        };

        const updatedProject: VideoEditorProjectData = {
            ...project,
            tracks: [...project.tracks, newTrack]
        };

        setProject(updatedProject);
        pushHistory({
            tracks: updatedProject.tracks,
            clips: updatedProject.clips,
            subtitles: updatedProject.subtitles,
            duration: updatedProject.duration
        });

        toast.success(`Añadida nueva pista de ${typeLabels[trackType]}`);
    };

    // ── 8. Actualizar Subtítulos ─────────────────────────────────────────────
    const handleUpdateSubtitles = (updates: Partial<SubtitleConfig>) => {
        if (!project) return;
        const updatedSubtitles: SubtitleConfig = {
            ...project.subtitles,
            ...updates
        };

        const updatedProject: VideoEditorProjectData = {
            ...project,
            subtitles: updatedSubtitles
        };

        setProject(updatedProject);
        pushHistory({
            tracks: updatedProject.tracks,
            clips: updatedProject.clips,
            subtitles: updatedProject.subtitles,
            duration: updatedProject.duration
        });
    };

    // ── 9. Atajos de Teclado Globales (Shortcuts) ─────────────────────────────
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const activeEl = document.activeElement;
            const isTyping = activeEl && (
                activeEl.tagName === 'INPUT' ||
                activeEl.tagName === 'TEXTAREA' ||
                (activeEl as HTMLElement).isContentEditable
            );

            // Permitir Ctrl+Z / Cmd+Z incluso en algunos inputs si no están capturados
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
                if (e.shiftKey) {
                    e.preventDefault();
                    handleRedo();
                } else {
                    e.preventDefault();
                    handleUndo();
                }
                return;
            }

            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') {
                e.preventDefault();
                handleRedo();
                return;
            }

            // Atajos que no deben dispararse mientras se escribe texto
            if (isTyping) return;

            // Barra espaciadora: Play / Pause
            if (e.code === 'Space') {
                e.preventDefault();
                setIsPlaying(prev => !prev);
                return;
            }

            // Tecla S: Dividir clip seleccionado en cabezal
            if (e.key.toLowerCase() === 's' && selectedClipId) {
                e.preventDefault();
                handleSplitClip(selectedClipId, currentTime);
                return;
            }

            // Delete / Backspace: Eliminar clip seleccionado
            if ((e.key === 'Delete' || e.key === 'Backspace') && selectedClipId) {
                e.preventDefault();
                handleDeleteClip(selectedClipId);
                return;
            }

            // Flecha Izquierda: Retroceder 1s
            if (e.key === 'ArrowLeft') {
                e.preventDefault();
                setCurrentTime(t => Math.max(0, t - (e.shiftKey ? 5 : 1)));
                return;
            }

            // Flecha Derecha: Avanzar 1s
            if (e.key === 'ArrowRight' && project) {
                e.preventDefault();
                setCurrentTime(t => Math.min(project.duration, t + (e.shiftKey ? 5 : 1)));
                return;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedClipId, currentTime, project, handleUndo, handleRedo]);

    // ── 10. Pantalla Completa ────────────────────────────────────────────────
    const handleToggleFullscreen = () => {
        if (!editorContainerRef.current) return;
        if (!document.fullscreenElement) {
            editorContainerRef.current.requestFullscreen().then(() => {
                setIsFullscreen(true);
            }).catch(err => {
                console.warn('No se pudo activar pantalla completa:', err);
            });
        } else {
            document.exitFullscreen().then(() => {
                setIsFullscreen(false);
            }).catch(err => {
                console.warn('Error al salir de pantalla completa:', err);
            });
        }
    };

    useEffect(() => {
        const onFullscreenChange = () => {
            setIsFullscreen(!!document.fullscreenElement);
        };
        document.addEventListener('fullscreenchange', onFullscreenChange);
        return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
    }, []);

    // ── Renderizado en Caso de Carga o Error ──────────────────────────────────
    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[550px] bg-slate-950 text-slate-300 rounded-2xl border border-slate-800 p-8 space-y-4">
                <Loader2 className="w-10 h-10 animate-spin text-amber-500" />
                <div className="text-center">
                    <h3 className="font-semibold text-lg text-white">Iniciando Editor de Video</h3>
                    <p className="text-sm text-slate-400 mt-1">Cargando proyecto y recursos multimedia...</p>
                </div>
            </div>
        );
    }

    if (error || !project) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[500px] bg-slate-950 text-slate-300 rounded-2xl border border-rose-900/40 p-8 space-y-4">
                <AlertCircle className="w-12 h-12 text-rose-500" />
                <div className="text-center max-w-md">
                    <h3 className="font-semibold text-lg text-white">Error al cargar el editor</h3>
                    <p className="text-sm text-slate-400 mt-1">{error || 'No se pudo cargar el proyecto activo'}</p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => loadProject()}
                        className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold rounded-lg text-sm transition-colors flex items-center gap-2"
                    >
                        <RotateCcw className="w-4 h-4" />
                        Reintentar
                    </button>
                    <button
                        onClick={() => setIsProjectsModalOpen(true)}
                        className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-sm transition-colors flex items-center gap-2"
                    >
                        <FolderKanban className="w-4 h-4" />
                        Abrir Proyectos
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div
            ref={editorContainerRef}
            className={`flex flex-col bg-slate-950 text-slate-100 rounded-2xl border border-slate-800 shadow-2xl overflow-hidden select-none transition-all ${
                isFullscreen ? 'fixed inset-0 z-50 rounded-none border-none' : 'w-full min-h-[820px]'
            }`}
        >
            {/* Barra Superior con Acciones Principales */}
            <VideoEditorHeader
                title={project.title}
                onTitleChange={newTitle => setProject({ ...project, title: newTitle })}
                format={project.format}
                onFormatChange={newFormat => setProject({ ...project, format: newFormat })}
                saveStatus={saveStatus}
                canUndo={historyIndex > 0}
                canRedo={historyIndex < history.length - 1}
                onUndo={handleUndo}
                onRedo={handleRedo}
                onOpenProjects={() => setIsProjectsModalOpen(true)}
                onOpenExport={() => setIsExportModalOpen(true)}
                zoomLevel={zoomLevel}
                onZoomLevelChange={setZoomLevel}
                isFullscreen={isFullscreen}
                onToggleFullscreen={handleToggleFullscreen}
            />

            {/* Cuerpo Central: Panel Lateral + Canvas de Previsualización */}
            <div className="flex-1 flex overflow-hidden min-h-[460px]">
                {/* Panel de Herramientas Estilo CapCut */}
                <VideoEditorSidebar
                    projectId={project.id}
                    clubId={clubId}
                    activeTab={activeSidebarTab}
                    onTabChange={setActiveSidebarTab}
                    tracks={project.tracks}
                    clips={project.clips}
                    onAddClip={handleAddClip}
                    onUpdateClip={handleUpdateClip}
                    onDeleteClip={handleDeleteClip}
                    selectedClip={selectedClip}
                    subtitles={project.subtitles}
                    onUpdateSubtitles={handleUpdateSubtitles}
                    format={project.format}
                    onFormatChange={fmt => setProject({ ...project, format: fmt })}
                    resolution={project.resolution}
                    onResolutionChange={res => setProject({ ...project, resolution: res })}
                    currentTime={currentTime}
                />

                {/* Lienzo / Canvas Central Adaptativo */}
                <div className="flex-1 flex flex-col bg-slate-900/60 relative overflow-hidden">
                    <VideoEditorCanvas
                        format={project.format}
                        currentTime={currentTime}
                        duration={project.duration}
                        isPlaying={isPlaying}
                        onTogglePlay={() => setIsPlaying(prev => !prev)}
                        onSeek={time => setCurrentTime(time)}
                        clips={project.clips}
                        subtitles={project.subtitles}
                        selectedClipId={selectedClipId}
                        onSelectClip={id => setSelectedClipId(id)}
                    />
                </div>
            </div>

            {/* Línea de Tiempo Multipista Inferior */}
            <div className="h-[280px] border-t border-slate-800 bg-slate-950 flex flex-col z-10">
                <VideoEditorTimeline
                    tracks={project.tracks}
                    clips={project.clips}
                    subtitles={project.subtitles}
                    currentTime={currentTime}
                    duration={project.duration}
                    onSeek={time => setCurrentTime(time)}
                    selectedClipId={selectedClipId}
                    onSelectClip={id => setSelectedClipId(id)}
                    onUpdateClip={handleUpdateClip}
                    onDeleteClip={handleDeleteClip}
                    onDuplicateClip={handleDuplicateClip}
                    onSplitClip={handleSplitClip}
                    onAddTrack={handleAddTrack}
                />
            </div>

            {/* Modal de Gestor de Proyectos */}
            <VideoEditorProjectsModal
                isOpen={isProjectsModalOpen}
                onClose={() => setIsProjectsModalOpen(false)}
                currentProjectId={project.id}
                clubId={clubId}
                onSelectProject={projId => {
                    setIsProjectsModalOpen(false);
                    loadProject(projId);
                }}
                onCreateNewProject={async (title, fmt) => {
                    try {
                        const token = getStudioAuthToken();
                        const res = await fetch('/api/video-editor/projects', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                ...(token ? { Authorization: `Bearer ${token}` } : {})
                            },
                            body: JSON.stringify({
                                title,
                                format: fmt,
                                resolution: '1080p',
                                duration: 30,
                                clubId: clubId || null
                            })
                        });
                        const json = await res.json();
                        if (json.success && json.data) {
                            setIsProjectsModalOpen(false);
                            initProjectState(json.data);
                            toast.success(`Proyecto "${title}" creado exitosamente`);
                        } else {
                            toast.error(json.message || 'Error al crear proyecto');
                        }
                    } catch (err: any) {
                        toast.error(err.message || 'Error al conectar con el servidor');
                    }
                }}
            />

            {/* Modal de Renderizado y Exportación Asíncrona */}
            <VideoEditorExportModal
                isOpen={isExportModalOpen}
                onClose={() => setIsExportModalOpen(false)}
                projectId={project.id}
                projectTitle={project.title}
                format={project.format}
                resolution={project.resolution}
                onResolutionChange={res => setProject({ ...project, resolution: res })}
                duration={project.duration}
                videoUrl={project.videoUrl}
                renderStatus={project.renderStatus}
                renderProgress={project.renderProgress}
                renderStage={project.renderStage}
                errorDetail={project.errorDetail}
                onRenderStarted={() => {
                    setProject(prev => prev ? ({ ...prev, renderStatus: 'rendering', renderProgress: 5, renderStage: 'Preparando proyecto' }) : null);
                }}
                onRefreshStatus={async () => {
                    try {
                        const token = getStudioAuthToken();
                        const res = await fetch(`/api/video-editor/projects/${project.id}/render-status`, {
                            headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) }
                        });
                        const json = await res.json();
                        if (json.success && json.data) {
                            setProject(prev => prev ? ({
                                ...prev,
                                renderStatus: json.data.renderStatus,
                                renderProgress: json.data.renderProgress,
                                renderStage: json.data.renderStage,
                                videoUrl: json.data.videoUrl || prev.videoUrl,
                                errorDetail: json.data.errorDetail
                            }) : null);
                        }
                    } catch (err) {
                        console.error('Error al actualizar estado de renderizado:', err);
                    }
                }}
            />
        </div>
    );
};

export default VideoEditor;
