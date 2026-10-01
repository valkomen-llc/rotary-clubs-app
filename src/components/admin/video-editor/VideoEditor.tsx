// ════════════════════════════════════════════════════════════════════════════
// Editor de Video Profesional — Componente Principal Orchestrator — v4.1143.0
//
// Módulo de creación y edición audiovisual independiente y a pantalla completa:
// - Tema claro institucional Club Platform / Rotary.
// - Distribución de 3 áreas centrales: Herramientas (Izq.) | Canvas (Centro) | Propiedades (Der.).
// - Línea de tiempo multipista inferior elástica y ajustable.
// - Operación como workspace independiente (/video-editor/:id) o integrado.
// - Subtítulos IA, recorte/división, duplicación, renderizado HD asíncrono.
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
import { VideoEditorInspector } from './VideoEditorInspector';
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
    projectIdToLoad?: string;
    isStandalone?: boolean;
    onClose?: () => void;
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
        enabled: true,
        language: 'es',
        sourceLanguage: 'es',
        sourceLanguageName: 'Español',
        activeLanguage: 'es',
        translations: {},
        fontSize: 24,
        color: '#FFFFFF',
        backgroundColor: 'rgba(0,0,0,0.7)',
        position: 'bottom',
        alignment: 'center',
        segments: [],
        style: DEFAULT_SUBTITLE_STYLE as any
    },
    status: 'draft',
    renderStatus: 'idle',
    renderProgress: 0
};

export const VideoEditor: React.FC<VideoEditorProps> = ({
    clubId,
    projectIdToLoad: initialProjectId,
    isStandalone = false,
    onClose
}) => {
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
    const [isLeftSidebarCollapsed, setIsLeftSidebarCollapsed] = useState(false);
    const [isRightInspectorCollapsed, setIsRightInspectorCollapsed] = useState(false);

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
                const proj = json.data || json.project || (json.id ? json : null);
                if (proj) {
                    initProjectState(proj);
                    return;
                }
            }

            // Buscar proyectos existentes del tenant
            const url = clubId ? `/api/video-editor/projects?clubId=${encodeURIComponent(clubId)}` : '/api/video-editor/projects';
            const res = await fetch(url, { headers });
            const json = await res.json();
            const projectList = Array.isArray(json.data)
                ? json.data
                : (Array.isArray(json.projects) ? json.projects : (Array.isArray(json) ? json : []));

            if (projectList.length > 0) {
                // Cargar el proyecto más recientemente modificado
                const latestProject = projectList[0];
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
                const newProject = createJson.data || createJson.project || (createJson.id ? createJson : null);
                if (newProject) {
                    initProjectState(newProject);
                } else {
                    throw new Error(createJson.message || createJson.error || 'No se pudo crear el proyecto inicial');
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
        // Garantizar estructura completa y defensiva
        const sanitized: VideoEditorProjectData = {
            ...DEFAULT_PROJECT_STATE,
            ...projData,
            tracks: Array.isArray(projData.tracks) && projData.tracks.length > 0 ? projData.tracks : (DEFAULT_TRACKS as Track[]),
            clips: Array.isArray(projData.clips) ? projData.clips : [],
            subtitles: {
                ...DEFAULT_PROJECT_STATE.subtitles,
                ...(projData.subtitles || {}),
                segments: Array.isArray(projData.subtitles?.segments) ? projData.subtitles.segments : [],
                style: {
                    ...DEFAULT_SUBTITLE_STYLE,
                    ...(projData.subtitles?.style || {})
                },
                transcript: projData.subtitles?.transcript || '',
                language: projData.subtitles?.language || 'es',
                sourceLanguage: projData.subtitles?.sourceLanguage || projData.subtitles?.language || 'es',
                sourceLanguageName: projData.subtitles?.sourceLanguageName || 'Español',
                activeLanguage: projData.subtitles?.activeLanguage || projData.subtitles?.language || 'es',
                translations: (projData.subtitles?.translations && typeof projData.subtitles.translations === 'object')
                    ? projData.subtitles.translations
                    : {}
            }
        };

        setProject(sanitized);
        setCurrentTime(0);
        setSelectedClipId(null);
        setIsPlaying(false);

        // Inicializar historial
        const initialSnapshot: HistoryState = {
            tracks: JSON.parse(JSON.stringify(sanitized.tracks)),
            clips: JSON.parse(JSON.stringify(sanitized.clips)),
            subtitles: JSON.parse(JSON.stringify(sanitized.subtitles)),
            duration: sanitized.duration
        };
        setHistory([initialSnapshot]);
        setHistoryIndex(0);

        lastSavedDataRef.current = JSON.stringify({
            title: sanitized.title,
            format: sanitized.format,
            resolution: sanitized.resolution,
            duration: sanitized.duration,
            tracks: sanitized.tracks,
            clips: sanitized.clips,
            subtitles: sanitized.subtitles
        });
        setSaveStatus('saved');
    };

    useEffect(() => {
        loadProject(initialProjectId);
    }, [loadProject, initialProjectId]);

    // ── 2. Guardar Instantánea en Historial (Undo / Redo) ─────────────────────
    const pushHistorySnapshot = useCallback((tracks: Track[], clips: Clip[], subtitles: SubtitleConfig, duration: number) => {
        if (isUndoRedoActionRef.current) return;

        setHistory(prev => {
            const nextHistory = prev.slice(0, historyIndex + 1);
            const snapshot: HistoryState = {
                tracks: JSON.parse(JSON.stringify(tracks)),
                clips: JSON.parse(JSON.stringify(clips)),
                subtitles: JSON.parse(JSON.stringify(subtitles)),
                duration
            };
            // Limitar a 30 pasos para no saturar memoria
            if (nextHistory.length >= 30) nextHistory.shift();
            return [...nextHistory, snapshot];
        });
        setHistoryIndex(prev => prev + 1);
    }, [historyIndex]);

    const handleUndo = useCallback(() => {
        if (historyIndex <= 0) return;
        const targetIndex = historyIndex - 1;
        const targetState = history[targetIndex];
        if (!targetState) return;

        isUndoRedoActionRef.current = true;
        setProject(prev => prev ? ({
            ...prev,
            tracks: JSON.parse(JSON.stringify(targetState.tracks)),
            clips: JSON.parse(JSON.stringify(targetState.clips)),
            subtitles: JSON.parse(JSON.stringify(targetState.subtitles)),
            duration: targetState.duration
        }) : null);
        setHistoryIndex(targetIndex);
        setTimeout(() => {
            isUndoRedoActionRef.current = false;
        }, 50);
    }, [history, historyIndex]);

    const handleRedo = useCallback(() => {
        if (historyIndex >= history.length - 1) return;
        const targetIndex = historyIndex + 1;
        const targetState = history[targetIndex];
        if (!targetState) return;

        isUndoRedoActionRef.current = true;
        setProject(prev => prev ? ({
            ...prev,
            tracks: JSON.parse(JSON.stringify(targetState.tracks)),
            clips: JSON.parse(JSON.stringify(targetState.clips)),
            subtitles: JSON.parse(JSON.stringify(targetState.subtitles)),
            duration: targetState.duration
        }) : null);
        setHistoryIndex(targetIndex);
        setTimeout(() => {
            isUndoRedoActionRef.current = false;
        }, 50);
    }, [history, historyIndex]);

    // ── 3. Motor de Autoguardado Continuo con Debounce ────────────────────────
    useEffect(() => {
        if (!project || !project.id || loading) return;

        const currentDataString = JSON.stringify({
            title: project.title,
            format: project.format,
            resolution: project.resolution,
            duration: project.duration,
            tracks: project.tracks,
            clips: project.clips,
            subtitles: project.subtitles
        });

        if (currentDataString === lastSavedDataRef.current) return;

        setSaveStatus('saving');
        if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);

        autosaveTimerRef.current = setTimeout(async () => {
            try {
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

                if (res.ok) {
                    lastSavedDataRef.current = currentDataString;
                    setSaveStatus('saved');
                } else {
                    setSaveStatus('error');
                }
            } catch (err) {
                console.error('Error al autoguardar proyecto:', err);
                setSaveStatus('error');
            }
        }, 1500);

        return () => {
            if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
        };
    }, [project, loading]);

    // ── 4. Bucle de Reproducción del Playhead ─────────────────────────────────
    useEffect(() => {
        if (!isPlaying) {
            if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
            lastPlaybackTimestampRef.current = null;
            return;
        }

        const loop = (timestamp: number) => {
            if (!lastPlaybackTimestampRef.current) {
                lastPlaybackTimestampRef.current = timestamp;
            }
            const deltaSec = (timestamp - lastPlaybackTimestampRef.current) / 1000;
            lastPlaybackTimestampRef.current = timestamp;

            setCurrentTime(prevTime => {
                const maxDur = project?.duration || 30;
                const nextTime = prevTime + deltaSec;
                if (nextTime >= maxDur) {
                    setIsPlaying(false);
                    return 0; // Reiniciar al inicio al terminar
                }
                return nextTime;
            });

            animationFrameRef.current = requestAnimationFrame(loop);
        };

        animationFrameRef.current = requestAnimationFrame(loop);

        return () => {
            if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
        };
    }, [isPlaying, project?.duration]);

    // ── 5. Atajos de Teclado Profesionales ─────────────────────────────────────
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Ignorar atajos si el usuario escribe en un input o textarea
            const targetTag = (e.target as HTMLElement)?.tagName?.toLowerCase();
            if (targetTag === 'input' || targetTag === 'textarea' || (e.target as HTMLElement)?.isContentEditable) {
                return;
            }

            // Espacio: Play / Pause
            if (e.code === 'Space') {
                e.preventDefault();
                setIsPlaying(prev => !prev);
            }

            // Flecha Izquierda: Retroceder 1 segundo
            if (e.code === 'ArrowLeft') {
                e.preventDefault();
                setCurrentTime(t => Math.max(0, t - (e.shiftKey ? 5 : 1)));
            }

            // Flecha Derecha: Avanzar 1 segundo
            if (e.code === 'ArrowRight') {
                e.preventDefault();
                const maxDur = project?.duration || 30;
                setCurrentTime(t => Math.min(maxDur, t + (e.shiftKey ? 5 : 1)));
            }

            // Tecla S: Dividir/Cortar clip seleccionado en playhead
            if (e.key === 's' || e.key === 'S') {
                if (selectedClipId && project) {
                    const sel = project.clips.find(c => c.id === selectedClipId);
                    if (sel && currentTime > sel.startTime && currentTime < (sel.startTime + sel.duration)) {
                        e.preventDefault();
                        handleSplitClip(selectedClipId, currentTime);
                    }
                }
            }

            // Tecla Delete o Backspace: Eliminar clip seleccionado
            if (e.key === 'Delete' || e.key === 'Backspace') {
                if (selectedClipId) {
                    e.preventDefault();
                    handleDeleteClip(selectedClipId);
                }
            }

            // Cmd/Ctrl + Z: Deshacer
            if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
                e.preventDefault();
                handleUndo();
            }

            // Shift + Cmd/Ctrl + Z o Ctrl + Y: Rehacer
            if (((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'z') ||
                ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y')) {
                e.preventDefault();
                handleRedo();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedClipId, currentTime, project, handleUndo, handleRedo]);

    // ── 6. Manejadores de Clips y Pistas ──────────────────────────────────────
    const handleAddClip = (clipData: Omit<Clip, 'id'>) => {
        if (!project) return;
        const newClip: Clip = {
            ...clipData,
            id: `clip-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`
        };

        const updatedClips = [...project.clips, newClip];
        const newTotalDuration = Math.max(project.duration, newClip.startTime + newClip.duration);

        const updatedProject: VideoEditorProjectData = {
            ...project,
            clips: updatedClips,
            duration: newTotalDuration
        };

        setProject(updatedProject);
        setSelectedClipId(newClip.id);
        pushHistorySnapshot(updatedProject.tracks, updatedClips, updatedProject.subtitles, newTotalDuration);
    };

    const handleUpdateClip = (clipId: string, updates: Partial<Clip>) => {
        if (!project) return;
        const updatedClips = project.clips.map(c => {
            if (c.id !== clipId) return c;
            return {
                ...c,
                ...updates,
                style: updates.style ? { ...(c.style || {}), ...updates.style } : c.style,
                transform: updates.transform ? { ...(c.transform || {}), ...updates.transform } : c.transform,
                transition: updates.transition ? { ...(c.transition || {}), ...updates.transition } : c.transition
            };
        });

        const updatedProject: VideoEditorProjectData = {
            ...project,
            clips: updatedClips
        };

        setProject(updatedProject);
        pushHistorySnapshot(updatedProject.tracks, updatedClips, updatedProject.subtitles, updatedProject.duration);
    };

    const handleDeleteClip = (clipId: string) => {
        if (!project) return;
        const updatedClips = project.clips.filter(c => c.id !== clipId);
        const updatedProject: VideoEditorProjectData = {
            ...project,
            clips: updatedClips
        };

        setProject(updatedProject);
        if (selectedClipId === clipId) setSelectedClipId(null);
        pushHistorySnapshot(updatedProject.tracks, updatedClips, updatedProject.subtitles, updatedProject.duration);
        toast.info('Clip eliminado');
    };

    const handleDuplicateClip = (clipId: string) => {
        if (!project) return;
        const target = project.clips.find(c => c.id === clipId);
        if (!target) return;

        const duplicated: Clip = {
            ...JSON.parse(JSON.stringify(target)),
            id: `clip-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            name: `${target.name} (Copia)`,
            startTime: Number((target.startTime + target.duration + 0.2).toFixed(2))
        };

        const updatedClips = [...project.clips, duplicated];
        const newTotalDuration = Math.max(project.duration, duplicated.startTime + duplicated.duration);

        const updatedProject: VideoEditorProjectData = {
            ...project,
            clips: updatedClips,
            duration: newTotalDuration
        };

        setProject(updatedProject);
        setSelectedClipId(duplicated.id);
        pushHistorySnapshot(updatedProject.tracks, updatedClips, updatedProject.subtitles, newTotalDuration);
        toast.success('Clip duplicado');
    };

    const handleSplitClip = (clipId: string, atTime: number) => {
        if (!project) return;
        const target = project.clips.find(c => c.id === clipId);
        if (!target) return;

        if (atTime <= target.startTime || atTime >= (target.startTime + target.duration)) {
            toast.error('El cabezal debe estar dentro del clip para dividirlo');
            return;
        }

        const firstDuration = Number((atTime - target.startTime).toFixed(2));
        const secondDuration = Number((target.duration - firstDuration).toFixed(2));

        const firstClip: Clip = {
            ...target,
            duration: firstDuration
        };

        const secondClip: Clip = {
            ...JSON.parse(JSON.stringify(target)),
            id: `clip-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            name: `${target.name} (Parte 2)`,
            startTime: atTime,
            duration: secondDuration,
            trimStart: (target.trimStart || 0) + firstDuration
        };

        const updatedClips = project.clips.map(c => c.id === clipId ? firstClip : c).concat(secondClip);

        const updatedProject: VideoEditorProjectData = {
            ...project,
            clips: updatedClips
        };

        setProject(updatedProject);
        setSelectedClipId(secondClip.id);
        pushHistorySnapshot(updatedProject.tracks, updatedClips, updatedProject.subtitles, updatedProject.duration);
        toast.success('Clip dividido en 2');
    };

    const handleAddTrack = (trackType: 'video' | 'audio' | 'text') => {
        if (!project) return;
        const count = project.tracks.filter(t => t.type === trackType).length + 1;
        const trackNames = {
            video: `Pista de Video ${count}`,
            audio: `Pista de Audio ${count}`,
            text: `Pista de Texto ${count}`
        };

        const newTrack: Track = {
            id: `track-${trackType}-${Date.now()}`,
            name: trackNames[trackType],
            type: trackType,
            order: project.tracks.length + 1,
            muted: false,
            locked: false,
            visible: true
        };

        const updatedTracks = [...project.tracks, newTrack];
        const updatedProject: VideoEditorProjectData = {
            ...project,
            tracks: updatedTracks
        };

        setProject(updatedProject);
        pushHistorySnapshot(updatedTracks, project.clips, project.subtitles, project.duration);
        toast.success(`Nueva ${trackNames[trackType]} agregada`);
    };

    const handleUpdateSubtitles = (updates: Partial<SubtitleConfig>) => {
        if (!project) return;
        const updatedSubtitles: SubtitleConfig = {
            ...project.subtitles,
            ...updates,
            style: updates.style ? { ...project.subtitles.style, ...updates.style } : project.subtitles.style
        };

        const updatedProject: VideoEditorProjectData = {
            ...project,
            subtitles: updatedSubtitles
        };

        setProject(updatedProject);
        pushHistorySnapshot(project.tracks, project.clips, updatedSubtitles, project.duration);
    };

    // Alternar Fullscreen nativo
    const handleToggleFullscreen = () => {
        if (!editorContainerRef.current) return;
        if (!document.fullscreenElement) {
            editorContainerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
        } else {
            document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
        }
    };

    // ── 7. Render de Pantalla de Carga y Error ────────────────────────────────
    if (loading) {
        return (
            <div className={isStandalone ? "fixed inset-0 h-screen w-screen flex flex-col items-center justify-center bg-[#F8FAFC] text-gray-800 gap-4 z-[9999]" : "w-full min-h-[500px] flex flex-col items-center justify-center bg-[#F8FAFC] text-gray-800 gap-4"}>
                <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center shadow-xs">
                    <Loader2 className="w-6 h-6 animate-spin text-[#013388]" />
                </div>
                <div className="text-center">
                    <p className="text-sm font-bold text-gray-900">Cargando Editor de Video...</p>
                    <p className="text-xs text-gray-500">Preparando lienzo multipista y herramientas</p>
                </div>
            </div>
        );
    }

    if (error || !project) {
        return (
            <div className={isStandalone ? "fixed inset-0 h-screen w-screen flex flex-col items-center justify-center bg-[#F8FAFC] text-gray-800 gap-4 p-6 z-[9999]" : "w-full min-h-[500px] flex flex-col items-center justify-center bg-[#F8FAFC] text-gray-800 gap-4 p-6"}>
                <div className="w-14 h-14 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 shadow-xs">
                    <AlertCircle className="w-7 h-7" />
                </div>
                <div className="text-center max-w-sm">
                    <h3 className="text-base font-bold text-gray-900">Error al cargar el editor</h3>
                    <p className="text-xs text-gray-500 mt-1">{error || 'No se pudo inicializar el proyecto'}</p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => loadProject(initialProjectId)}
                        className="flex items-center gap-2 px-4 py-2 bg-[#013388] text-white rounded-xl text-xs font-bold shadow-xs hover:bg-[#002868] transition-colors"
                    >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Reintentar</span>
                    </button>
                    <button
                        onClick={() => setIsProjectsModalOpen(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-xl text-xs font-bold hover:bg-gray-50 transition-colors shadow-xs"
                    >
                        <FolderKanban className="w-3.5 h-3.5" />
                        <span>Abrir Proyectos</span>
                    </button>
                </div>
            </div>
        );
    }

    const selectedClip = project.clips.find(c => c.id === selectedClipId) || null;

    const rootClasses = isStandalone
        ? 'fixed inset-0 h-screen w-screen bg-[#F8FAFC] text-slate-800 font-sans z-[9999] overflow-hidden flex flex-col select-none'
        : isFullscreen
        ? 'fixed inset-0 z-50 rounded-none border-none flex flex-col bg-[#F8FAFC] text-slate-800 font-sans select-none overflow-hidden'
        : 'w-full h-screen min-h-[600px] flex flex-col bg-[#F8FAFC] text-slate-800 font-sans rounded-2xl border border-gray-200 shadow-xl overflow-hidden select-none';

    return (
        <div ref={editorContainerRef} className={rootClasses}>
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
                isLeftCollapsed={isLeftSidebarCollapsed}
                onToggleLeftCollapse={() => setIsLeftSidebarCollapsed(p => !p)}
                isRightCollapsed={isRightInspectorCollapsed}
                onToggleRightCollapse={() => setIsRightInspectorCollapsed(p => !p)}
                onClose={onClose}
                isStandalone={isStandalone}
            />

            {/* Cuerpo Central: Herramientas (Izq) + Canvas (Centro) + Propiedades (Der) */}
            <div className="flex-1 flex overflow-hidden min-h-0 relative">
                {/* Panel de Herramientas Izquierdo */}
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
                    isCollapsed={isLeftSidebarCollapsed}
                    onToggleCollapse={() => setIsLeftSidebarCollapsed(p => !p)}
                />

                {/* Lienzo / Canvas Central Adaptativo */}
                <div className="flex-1 flex flex-col bg-[#F8FAFC] relative overflow-hidden">
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

                {/* Inspector Contextual de Propiedades Derecho */}
                <VideoEditorInspector
                    selectedClip={selectedClip}
                    tracks={project.tracks}
                    project={project}
                    onUpdateClip={handleUpdateClip}
                    onDeleteClip={handleDeleteClip}
                    onDuplicateClip={handleDuplicateClip}
                    onUpdateSubtitles={handleUpdateSubtitles}
                    onUpdateProject={updates => setProject(prev => prev ? { ...prev, ...updates } : prev)}
                    isCollapsed={isRightInspectorCollapsed}
                    onToggleCollapse={() => setIsRightInspectorCollapsed(p => !p)}
                />
            </div>

            {/* Línea de Tiempo Multipista Inferior */}
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
                        const created = json.data || json.project || (json.id ? json : null);
                        if (created) {
                            setIsProjectsModalOpen(false);
                            initProjectState(created);
                            toast.success(`Proyecto "${title}" creado exitosamente`);
                        } else {
                            toast.error(json.message || json.error || 'Error al crear proyecto');
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
                        const statusData = json.data || json;
                        if (statusData && statusData.renderStatus) {
                            setProject(prev => prev ? ({
                                ...prev,
                                renderStatus: statusData.renderStatus,
                                renderProgress: statusData.renderProgress ?? prev.renderProgress,
                                renderStage: statusData.renderStage || prev.renderStage,
                                videoUrl: statusData.videoUrl || prev.videoUrl,
                                errorDetail: statusData.errorDetail
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
