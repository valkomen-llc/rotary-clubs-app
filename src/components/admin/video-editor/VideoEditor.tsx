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
    SubtitleSegment,
    SubtitleTrackVersion
} from './types';
import {
    computeProjectDuration,
    splitClip,
    splitSubtitleSegment,
    separateAudioFromVideo,
    resolveActiveSubtitleSegments,
    switchSubtitleLanguage,
    updateSubtitleSegmentText,
    normalizeLangCode
} from './timelineUtils';
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
    const projectRef = useRef<VideoEditorProjectData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        projectRef.current = project;
    }, [project]);

    // ── Estado de Interfaz y Reproducción ─────────────────────────────────────
    const [activeSidebarTab, setActiveSidebarTab] = useState<
        'media' | 'text' | 'audio' | 'subtitles' | 'transitions' | 'settings'
    >('media');
    const [isLeftSidebarCollapsed, setIsLeftSidebarCollapsed] = useState(false);
    const [isRightInspectorCollapsed, setIsRightInspectorCollapsed] = useState(false);

    // ── Sistema Unificado de Selección y Portapapeles (CapCut standard) ────────
    const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
    const [primarySelectedId, setPrimarySelectedId] = useState<string | null>(null);
    const clipboardRef = useRef<{ clips: Clip[]; subtitles: SubtitleSegment[] }>({ clips: [], subtitles: [] });

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
        const rawClips = Array.isArray(projData.clips) ? projData.clips : [];
        const sourceLang = normalizeLangCode(projData.subtitles?.sourceLanguage || projData.subtitles?.language || 'es');
        const activeLang = normalizeLangCode(projData.subtitles?.activeLanguage || projData.subtitles?.language || sourceLang);

        // Normalizar catálogo de versiones de subtítulos
        const normalizedTranslations: Record<string, SubtitleTrackVersion> = {};
        if (projData.subtitles?.translations && typeof projData.subtitles.translations === 'object') {
            for (const [k, ver] of Object.entries(projData.subtitles.translations)) {
                if (ver && typeof ver === 'object') {
                    normalizedTranslations[normalizeLangCode(k)] = ver;
                }
            }
        }

        const baseSubtitles: SubtitleConfig = {
            ...DEFAULT_PROJECT_STATE.subtitles,
            ...(projData.subtitles || {}),
            segments: Array.isArray(projData.subtitles?.segments) ? projData.subtitles.segments : [],
            style: {
                ...DEFAULT_SUBTITLE_STYLE,
                ...(projData.subtitles?.style || {})
            },
            transcript: projData.subtitles?.transcript || '',
            language: activeLang,
            sourceLanguage: sourceLang,
            sourceLanguageName: projData.subtitles?.sourceLanguageName || (sourceLang === 'es' ? 'Español' : sourceLang.toUpperCase()),
            activeLanguage: activeLang,
            translations: normalizedTranslations
        };

        const resolvedSegments = resolveActiveSubtitleSegments(baseSubtitles, activeLang);
        const rawSubtitles: SubtitleConfig = {
            ...baseSubtitles,
            segments: resolvedSegments,
            availableLanguages: Array.from(new Set([
                sourceLang,
                activeLang,
                ...Object.keys(normalizedTranslations),
                ...(projData.subtitles?.availableLanguages ? projData.subtitles.availableLanguages.map(normalizeLangCode) : [])
            ]))
        };

        // Duración global calculada dinámicamente como max(clip.end, subtitle.end)
        const dynamicDuration = computeProjectDuration(rawClips, rawSubtitles, projData.duration || 10);

        // Garantizar estructura completa y defensiva
        const sanitized: VideoEditorProjectData = {
            ...DEFAULT_PROJECT_STATE,
            ...projData,
            duration: dynamicDuration,
            tracks: Array.isArray(projData.tracks) && projData.tracks.length > 0 ? projData.tracks : (DEFAULT_TRACKS as Track[]),
            clips: rawClips,
            subtitles: rawSubtitles
        };

        projectRef.current = sanitized;
        setProject(sanitized);
        setCurrentTime(0);
        setSelectedItemIds([]);
        setPrimarySelectedId(null);
        setIsPlaying(false);

        // Inicializar historial
        const initialSnapshot: HistoryState = {
            tracks: JSON.parse(JSON.stringify(sanitized.tracks)),
            clips: JSON.parse(JSON.stringify(sanitized.clips)),
            subtitles: JSON.parse(JSON.stringify(sanitized.subtitles)),
            duration: dynamicDuration
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
    const pushHistorySnapshot = useCallback((tracks: Track[], clips: Clip[], subtitles: SubtitleConfig, duration?: number) => {
        if (isUndoRedoActionRef.current) return;

        const effectiveDuration = duration !== undefined ? duration : computeProjectDuration(clips, subtitles);

        setHistory(prev => {
            const nextHistory = prev.slice(0, historyIndex + 1);
            const snapshot: HistoryState = {
                tracks: JSON.parse(JSON.stringify(tracks)),
                clips: JSON.parse(JSON.stringify(clips)),
                subtitles: JSON.parse(JSON.stringify(subtitles)),
                duration: effectiveDuration
            };
            // Limitar a 35 pasos de historial para no saturar memoria
            if (nextHistory.length >= 35) nextHistory.shift();
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

    const saveProjectNow = useCallback(async (overrideProject?: VideoEditorProjectData) => {
        const target = overrideProject || project;
        if (!target || !target.id || loading) return;
        if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
        try {
            setSaveStatus('saving');
            const token = getStudioAuthToken();
            const res = await fetch(`/api/video-editor/projects/${target.id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {})
                },
                body: JSON.stringify({
                    title: target.title,
                    format: target.format,
                    resolution: target.resolution,
                    duration: target.duration,
                    tracks: target.tracks,
                    clips: target.clips,
                    subtitles: target.subtitles
                })
            });
            if (res.ok) {
                lastSavedDataRef.current = JSON.stringify({
                    title: target.title,
                    format: target.format,
                    resolution: target.resolution,
                    duration: target.duration,
                    tracks: target.tracks,
                    clips: target.clips,
                    subtitles: target.subtitles
                });
                setSaveStatus('saved');
            } else {
                setSaveStatus('error');
            }
        } catch (err) {
            console.error('Error al guardar proyecto inmediatamente:', err);
            setSaveStatus('error');
        }
    }, [project, loading]);

    // ── 4. Bucle de Reproducción del Playhead Unificado ────────────────────────
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
                const maxDur = computeProjectDuration(project?.clips || [], project?.subtitles, project?.duration || 10);
                const nextTime = prevTime + deltaSec;
                if (nextTime >= maxDur) {
                    setIsPlaying(false);
                    return 0; // Reiniciar al inicio al culminar la composición completa
                }
                return nextTime;
            });

            animationFrameRef.current = requestAnimationFrame(loop);
        };

        animationFrameRef.current = requestAnimationFrame(loop);

        return () => {
            if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
        };
    }, [isPlaying, project?.clips, project?.subtitles, project?.duration]);

    // ── 5. Selección Individual, Múltiple y Rango ──────────────────────────────
    const handleSelectItem = useCallback((id: string | null, isMulti = false, isRange = false) => {
        if (!id) {
            setSelectedItemIds([]);
            setPrimarySelectedId(null);
            return;
        }

        if (isMulti) {
            setSelectedItemIds(prev => {
                if (prev.includes(id)) {
                    const next = prev.filter(x => x !== id);
                    if (primarySelectedId === id) {
                        setPrimarySelectedId(next[next.length - 1] || null);
                    }
                    return next;
                } else {
                    setPrimarySelectedId(id);
                    return [...prev, id];
                }
            });
        } else {
            setSelectedItemIds([id]);
            setPrimarySelectedId(id);
        }
    }, [primarySelectedId]);

    const handleSelectAll = useCallback(() => {
        if (!project) return;
        const allIds = [
            ...project.clips.map(c => c.id),
            ...(project.subtitles.segments || []).map(s => s.id)
        ];
        setSelectedItemIds(allIds);
        if (allIds.length > 0) {
            setPrimarySelectedId(allIds[0]);
        }
    }, [project]);

    // ── 6. Acciones de Edición Profesional (CapCut Standard) ───────────────────

    // Eliminación masiva de elementos seleccionados (clips + subtítulos)
    const handleDeleteSelected = useCallback(() => {
        if (!project) return;
        const idsToDelete = new Set(selectedItemIds);
        if (idsToDelete.size === 0 && primarySelectedId) {
            idsToDelete.add(primarySelectedId);
        }
        if (idsToDelete.size === 0) return;

        const updatedClips = project.clips.filter(c => !idsToDelete.has(c.id));
        const updatedSegments = (project.subtitles.segments || []).filter(s => !idsToDelete.has(s.id));

        const updatedTranslations = { ...(project.subtitles.translations || {}) };
        for (const [langKey, langObj] of Object.entries(updatedTranslations)) {
            if (langObj && Array.isArray(langObj.segments)) {
                updatedTranslations[langKey] = {
                    ...langObj,
                    segments: langObj.segments.filter(s => !idsToDelete.has(s.id))
                };
            }
        }

        const updatedSubtitles: SubtitleConfig = {
            ...project.subtitles,
            segments: updatedSegments,
            translations: updatedTranslations
        };

        const newDuration = computeProjectDuration(updatedClips, updatedSubtitles);
        const countDeleted = (project.clips.length - updatedClips.length) +
                             ((project.subtitles.segments?.length || 0) - updatedSegments.length);

        const updatedProject: VideoEditorProjectData = {
            ...project,
            clips: updatedClips,
            subtitles: updatedSubtitles,
            duration: newDuration
        };

        setProject(updatedProject);
        setSelectedItemIds([]);
        setPrimarySelectedId(null);
        pushHistorySnapshot(updatedProject.tracks, updatedClips, updatedSubtitles, newDuration);
        toast.info(`${countDeleted} elemento(s) eliminado(s)`);
    }, [project, selectedItemIds, primarySelectedId, pushHistorySnapshot]);

    const handleDeleteClip = (clipId: string) => {
        if (!project) return;
        const updatedClips = project.clips.filter(c => c.id !== clipId);
        const newDuration = computeProjectDuration(updatedClips, project.subtitles);
        const updatedProject: VideoEditorProjectData = {
            ...project,
            clips: updatedClips,
            duration: newDuration
        };

        setProject(updatedProject);
        setSelectedItemIds(prev => prev.filter(x => x !== clipId));
        if (primarySelectedId === clipId) setPrimarySelectedId(null);
        pushHistorySnapshot(updatedProject.tracks, updatedClips, updatedProject.subtitles, newDuration);
        toast.info('Clip eliminado');
    };

    const handleDeleteSubtitleSegment = (segmentId: string) => {
        if (!project) return;
        const updatedSegments = (project.subtitles.segments || []).filter(s => s.id !== segmentId);
        const updatedTranslations = { ...(project.subtitles.translations || {}) };
        for (const [langKey, langObj] of Object.entries(updatedTranslations)) {
            if (langObj && Array.isArray(langObj.segments)) {
                updatedTranslations[langKey] = {
                    ...langObj,
                    segments: langObj.segments.filter(s => s.id !== segmentId)
                };
            }
        }
        const updatedSubtitles: SubtitleConfig = {
            ...project.subtitles,
            segments: updatedSegments,
            translations: updatedTranslations
        };
        const newDuration = computeProjectDuration(project.clips, updatedSubtitles);
        const updatedProject: VideoEditorProjectData = {
            ...project,
            subtitles: updatedSubtitles,
            duration: newDuration
        };

        setProject(updatedProject);
        setSelectedItemIds(prev => prev.filter(x => x !== segmentId));
        if (primarySelectedId === segmentId) setPrimarySelectedId(null);
        pushHistorySnapshot(updatedProject.tracks, project.clips, updatedSubtitles, newDuration);
        toast.info('Subtítulo eliminado');
    };

    const handleUpdateSubtitleSegment = (segmentId: string, updates: Partial<SubtitleSegment>) => {
        if (!project) return;
        const activeLang = normalizeLangCode(project.subtitles.activeLanguage || project.subtitles.sourceLanguage || 'es');

        let updatedSubtitles: SubtitleConfig;

        if (updates.text !== undefined && Object.keys(updates).length === 1) {
            // Edición exclusiva de texto: aislar por versión de idioma sin tocar los otros idiomas
            updatedSubtitles = updateSubtitleSegmentText(
                project.subtitles,
                segmentId,
                updates.text,
                activeLang
            );
        } else {
            // Actualización de tiempos (start, end) u otros atributos
            // Sincronizar timestamps en todas las versiones de idiomas manteniendo los textos independientes
            const updatedSegments = (project.subtitles.segments || []).map(s => {
                if (s.id !== segmentId) return s;
                const nextSeg = { ...s, ...updates };
                if (updates.text !== undefined) {
                    nextSeg.translations = {
                        ...(nextSeg.translations || {}),
                        [activeLang]: updates.text
                    };
                }
                return nextSeg;
            });

            const updatedTranslations = { ...(project.subtitles.translations || {}) };
            for (const [langKey, langObj] of Object.entries(updatedTranslations)) {
                if (langObj && Array.isArray(langObj.segments)) {
                    const normKey = normalizeLangCode(langKey);
                    updatedTranslations[normKey] = {
                        ...langObj,
                        segments: langObj.segments.map(seg => {
                            if (seg.id !== segmentId) return seg;
                            const modSeg = { ...seg };
                            if (updates.start !== undefined) modSeg.start = updates.start;
                            if (updates.end !== undefined) modSeg.end = updates.end;
                            if (normKey === activeLang && updates.text !== undefined) {
                                modSeg.text = updates.text;
                            }
                            // Contenido y estilo son independientes: un cambio puramente
                            // visual debe reflejarse en todas las versiones de idioma
                            // para que conmutar de idioma jamás revierta el estilo.
                            if (updates.style !== undefined) {
                                modSeg.style = { ...(seg.style || {}), ...updates.style };
                            }
                            return modSeg;
                        })
                    };
                }
            }

            updatedSubtitles = {
                ...project.subtitles,
                segments: updatedSegments,
                translations: updatedTranslations
            };
        }

        const newDuration = computeProjectDuration(project.clips, updatedSubtitles);
        const updatedProject: VideoEditorProjectData = {
            ...project,
            subtitles: updatedSubtitles,
            duration: newDuration
        };

        setProject(updatedProject);
        pushHistorySnapshot(updatedProject.tracks, project.clips, updatedSubtitles, newDuration);
    };

    const handleSwitchSubtitleLanguage = useCallback((targetLang: string) => {
        const currentProject = projectRef.current || project;
        if (!currentProject || !currentProject.subtitles) return;
        const normTarget = normalizeLangCode(targetLang);
        const updatedSubtitles = switchSubtitleLanguage(currentProject.subtitles, normTarget);
        const updatedProject: VideoEditorProjectData = {
            ...currentProject,
            subtitles: updatedSubtitles
        };
        projectRef.current = updatedProject;
        setProject(updatedProject);
        pushHistorySnapshot(updatedProject.tracks, updatedProject.clips, updatedSubtitles, updatedProject.duration);
        saveProjectNow(updatedProject);
    }, [project, pushHistorySnapshot, saveProjectNow]);

    // División precisa (Split) en posición del playhead
    const handleSplit = useCallback((atTime: number = currentTime) => {
        if (!project) return;

        let didSplit = false;
        let newClips = [...project.clips];
        let newSegments = [...(project.subtitles.segments || [])];
        let newlySelectedId: string | null = null;

        // 1. Si hay clips seleccionados que contengan atTime
        const selectedClipsToSplit = project.clips.filter(
            c => selectedItemIds.includes(c.id) && atTime > c.startTime && atTime < (c.startTime + c.duration)
        );

        if (selectedClipsToSplit.length > 0) {
            for (const target of selectedClipsToSplit) {
                const res = splitClip(target, atTime);
                if (res) {
                    const [c1, c2] = res;
                    newClips = newClips.map(c => c.id === target.id ? c1 : c).concat(c2);
                    newlySelectedId = c2.id;
                    didSplit = true;
                }
            }
        }

        // 2. Si hay subtítulos seleccionados que contengan atTime
        const selectedSubsToSplit = (project.subtitles.segments || []).filter(
            s => selectedItemIds.includes(s.id) && atTime > s.start && atTime < s.end
        );

        if (selectedSubsToSplit.length > 0) {
            for (const target of selectedSubsToSplit) {
                const res = splitSubtitleSegment(target, atTime);
                if (res) {
                    const [s1, s2] = res;
                    newSegments = newSegments.map(s => s.id === target.id ? s1 : s).concat(s2);
                    newlySelectedId = s2.id;
                    didSplit = true;
                }
            }
        }

        // 3. Si no hay selección explícita, dividir el clip o subtítulo activo en atTime
        if (!didSplit && selectedItemIds.length === 0) {
            const activeClips = project.clips.filter(
                c => atTime > c.startTime && atTime < (c.startTime + c.duration)
            );
            if (activeClips.length > 0) {
                const target = activeClips[activeClips.length - 1];
                const res = splitClip(target, atTime);
                if (res) {
                    const [c1, c2] = res;
                    newClips = newClips.map(c => c.id === target.id ? c1 : c).concat(c2);
                    newlySelectedId = c2.id;
                    didSplit = true;
                }
            } else {
                const activeSub = (project.subtitles.segments || []).find(
                    s => atTime > s.start && atTime < s.end
                );
                if (activeSub) {
                    const res = splitSubtitleSegment(activeSub, atTime);
                    if (res) {
                        const [s1, s2] = res;
                        newSegments = newSegments.map(s => s.id === activeSub.id ? s1 : s).concat(s2);
                        newlySelectedId = s2.id;
                        didSplit = true;
                    }
                }
            }
        }

        if (!didSplit) {
            toast.error('Ubica el cabezal dentro de un clip o subtítulo para dividirlo');
            return;
        }

        const updatedTranslations = { ...(project.subtitles.translations || {}) };
        for (const [langKey, langObj] of Object.entries(updatedTranslations)) {
            if (langObj && Array.isArray(langObj.segments)) {
                updatedTranslations[langKey] = {
                    ...langObj,
                    segments: newSegments.map(s => ({
                        ...s,
                        text: s.translations?.[langKey] || s.text
                    }))
                };
            }
        }

        const updatedSubtitles: SubtitleConfig = {
            ...project.subtitles,
            segments: newSegments,
            translations: updatedTranslations
        };

        const newDuration = computeProjectDuration(newClips, updatedSubtitles);
        const updatedProject: VideoEditorProjectData = {
            ...project,
            clips: newClips,
            subtitles: updatedSubtitles,
            duration: newDuration
        };

        setProject(updatedProject);
        if (newlySelectedId) {
            setSelectedItemIds([newlySelectedId]);
            setPrimarySelectedId(newlySelectedId);
        }
        pushHistorySnapshot(updatedProject.tracks, newClips, updatedSubtitles, newDuration);
        toast.success('Elemento dividido en 2');
    }, [project, currentTime, selectedItemIds, pushHistorySnapshot]);

    // Separar / Extraer Audio de un Clip de Video
    const handleSeparateAudio = useCallback((clipId?: string) => {
        if (!project) return;
        const targetId = clipId || primarySelectedId || selectedItemIds.find(id => project.clips.some(c => c.id === id));
        const targetClip = project.clips.find(c => c.id === targetId);

        if (!targetClip || targetClip.type !== 'video' || !targetClip.url) {
            toast.error('Selecciona un clip de video con archivo para separar su audio');
            return;
        }

        const { updatedVideoClip, newAudioClip, targetTrackId } = separateAudioFromVideo(targetClip, project.tracks);

        let updatedTracks = [...project.tracks];
        if (!updatedTracks.some(t => t.id === targetTrackId)) {
            updatedTracks.push({
                id: targetTrackId,
                name: 'Locución / Audio',
                type: 'audio',
                order: updatedTracks.length + 1,
                muted: false,
                locked: false,
                visible: true
            });
        }

        const updatedClips = project.clips.map(c => c.id === targetClip.id ? updatedVideoClip : c).concat(newAudioClip);
        const newDuration = computeProjectDuration(updatedClips, project.subtitles);

        const updatedProject: VideoEditorProjectData = {
            ...project,
            tracks: updatedTracks,
            clips: updatedClips,
            duration: newDuration
        };

        setProject(updatedProject);
        setSelectedItemIds([newAudioClip.id]);
        setPrimarySelectedId(newAudioClip.id);
        pushHistorySnapshot(updatedTracks, updatedClips, project.subtitles, newDuration);
        toast.success('Audio extraído y separado en pista independiente');
    }, [project, primarySelectedId, selectedItemIds, pushHistorySnapshot]);

    // Duplicar elementos seleccionados
    const handleDuplicateSelected = useCallback(() => {
        if (!project || selectedItemIds.length === 0) return;

        const newClips = [...project.clips];
        const newSegments = [...(project.subtitles.segments || [])];
        const newSelectedIds: string[] = [];

        for (const clipId of selectedItemIds) {
            const target = project.clips.find(c => c.id === clipId);
            if (target) {
                const duplicated: Clip = {
                    ...JSON.parse(JSON.stringify(target)),
                    id: `clip-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
                    name: `${target.name} (Copia)`,
                    startTime: Number((target.startTime + target.duration + 0.1).toFixed(2))
                };
                newClips.push(duplicated);
                newSelectedIds.push(duplicated.id);
            }
        }

        for (const subId of selectedItemIds) {
            const target = (project.subtitles.segments || []).find(s => s.id === subId);
            if (target) {
                const dur = target.end - target.start;
                const duplicated: SubtitleSegment = {
                    ...JSON.parse(JSON.stringify(target)),
                    id: `sub-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
                    start: Number((target.end + 0.1).toFixed(2)),
                    end: Number((target.end + 0.1 + dur).toFixed(2))
                };
                newSegments.push(duplicated);
                newSelectedIds.push(duplicated.id);
            }
        }

        // Sincronizar los duplicados en cada versión de idioma del catálogo
        // (texto por idioma desde el mapa translations; timestamps idénticos).
        const duplicateTranslations = { ...(project.subtitles.translations || {}) };
        for (const [langKey, langObj] of Object.entries(duplicateTranslations)) {
            if (langObj && Array.isArray(langObj.segments)) {
                const normKey = normalizeLangCode(langKey);
                const existingIds = new Set(langObj.segments.map(s => s.id));
                const additions = newSegments
                    .filter(s => !existingIds.has(s.id))
                    .map(s => ({
                        ...JSON.parse(JSON.stringify(s)),
                        text: s.translations?.[normKey] ?? s.translations?.[normalizeLangCode(project.subtitles.sourceLanguage || 'es')] ?? s.text
                    }));
                duplicateTranslations[normKey] = {
                    ...langObj,
                    segments: [...langObj.segments, ...additions].sort((a, b) => a.start - b.start)
                };
            }
        }

        const updatedSubtitles: SubtitleConfig = {
            ...project.subtitles,
            segments: newSegments,
            translations: duplicateTranslations
        };

        const newDuration = computeProjectDuration(newClips, updatedSubtitles);
        const updatedProject: VideoEditorProjectData = {
            ...project,
            clips: newClips,
            subtitles: updatedSubtitles,
            duration: newDuration
        };

        setProject(updatedProject);
        if (newSelectedIds.length > 0) {
            setSelectedItemIds(newSelectedIds);
            setPrimarySelectedId(newSelectedIds[0]);
        }
        pushHistorySnapshot(updatedProject.tracks, newClips, updatedSubtitles, newDuration);
        toast.success(`${newSelectedIds.length} elemento(s) duplicado(s)`);
    }, [project, selectedItemIds, pushHistorySnapshot]);

    // Copiar y Pegar
    const handleCopy = useCallback(() => {
        if (!project || selectedItemIds.length === 0) return;
        const clipsToCopy = project.clips.filter(c => selectedItemIds.includes(c.id));
        const subsToCopy = (project.subtitles.segments || []).filter(s => selectedItemIds.includes(s.id));
        clipboardRef.current = {
            clips: JSON.parse(JSON.stringify(clipsToCopy)),
            subtitles: JSON.parse(JSON.stringify(subsToCopy))
        };
        toast.success(`${clipsToCopy.length + subsToCopy.length} elemento(s) copiado(s) al portapapeles`);
    }, [project, selectedItemIds]);

    const handlePaste = useCallback(() => {
        if (!project) return;
        const { clips: copiedClips, subtitles: copiedSubs } = clipboardRef.current;
        if (copiedClips.length === 0 && copiedSubs.length === 0) return;

        let baseTime = Infinity;
        for (const c of copiedClips) {
            if (c.startTime < baseTime) baseTime = c.startTime;
        }
        for (const s of copiedSubs) {
            if (s.start < baseTime) baseTime = s.start;
        }
        if (!isFinite(baseTime)) baseTime = 0;

        const newSelectedIds: string[] = [];
        const newClips = [...project.clips];
        for (const c of copiedClips) {
            const relOffset = c.startTime - baseTime;
            const pastedClip: Clip = {
                ...JSON.parse(JSON.stringify(c)),
                id: `clip-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
                startTime: Number((currentTime + relOffset).toFixed(2))
            };
            newClips.push(pastedClip);
            newSelectedIds.push(pastedClip.id);
        }

        const newSegments = [...(project.subtitles.segments || [])];
        for (const s of copiedSubs) {
            const relOffset = s.start - baseTime;
            const dur = s.end - s.start;
            const pastedSub: SubtitleSegment = {
                ...JSON.parse(JSON.stringify(s)),
                id: `sub-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
                start: Number((currentTime + relOffset).toFixed(2)),
                end: Number((currentTime + relOffset + dur).toFixed(2))
            };
            newSegments.push(pastedSub);
            newSelectedIds.push(pastedSub.id);
        }

        // Sincronizar los pegados en cada versión de idioma del catálogo.
        const pasteTranslations = { ...(project.subtitles.translations || {}) };
        for (const [langKey, langObj] of Object.entries(pasteTranslations)) {
            if (langObj && Array.isArray(langObj.segments)) {
                const normKey = normalizeLangCode(langKey);
                const existingIds = new Set(langObj.segments.map(s => s.id));
                const additions = newSegments
                    .filter(s => !existingIds.has(s.id))
                    .map(s => ({
                        ...JSON.parse(JSON.stringify(s)),
                        text: s.translations?.[normKey] ?? s.translations?.[normalizeLangCode(project.subtitles.sourceLanguage || 'es')] ?? s.text
                    }));
                pasteTranslations[normKey] = {
                    ...langObj,
                    segments: [...langObj.segments, ...additions].sort((a, b) => a.start - b.start)
                };
            }
        }

        const updatedSubtitles: SubtitleConfig = {
            ...project.subtitles,
            segments: newSegments,
            translations: pasteTranslations
        };

        const newDuration = computeProjectDuration(newClips, updatedSubtitles);
        const updatedProject: VideoEditorProjectData = {
            ...project,
            clips: newClips,
            subtitles: updatedSubtitles,
            duration: newDuration
        };

        setProject(updatedProject);
        setSelectedItemIds(newSelectedIds);
        setPrimarySelectedId(newSelectedIds[0] || null);
        pushHistorySnapshot(updatedProject.tracks, newClips, updatedSubtitles, newDuration);
        toast.success(`${newSelectedIds.length} elemento(s) pegado(s)`);
    }, [project, currentTime, pushHistorySnapshot]);

    // ── 7. Atajos de Teclado Profesionales ─────────────────────────────────────
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const targetTag = (e.target as HTMLElement)?.tagName?.toLowerCase();
            if (targetTag === 'input' || targetTag === 'textarea' || (e.target as HTMLElement)?.isContentEditable) {
                return;
            }

            // Espacio: Play / Pause
            if (e.code === 'Space') {
                e.preventDefault();
                setIsPlaying(prev => !prev);
            }

            // Flecha Izquierda: Retroceder 1s (5s con Shift)
            if (e.code === 'ArrowLeft') {
                e.preventDefault();
                setCurrentTime(t => Math.max(0, t - (e.shiftKey ? 5 : 1)));
            }

            // Flecha Derecha: Avanzar 1s (5s con Shift)
            if (e.code === 'ArrowRight') {
                e.preventDefault();
                const maxDur = project?.duration || 30;
                setCurrentTime(t => Math.min(maxDur, t + (e.shiftKey ? 5 : 1)));
            }

            // Tecla S: Dividir/Cortar en playhead
            if (e.key === 's' || e.key === 'S') {
                e.preventDefault();
                handleSplit(currentTime);
            }

            // Tecla Delete o Backspace: Eliminar selección masiva
            if (e.key === 'Delete' || e.key === 'Backspace') {
                e.preventDefault();
                handleDeleteSelected();
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

            // Cmd/Ctrl + C: Copiar
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'c') {
                e.preventDefault();
                handleCopy();
            }

            // Cmd/Ctrl + V: Pegar
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'v') {
                e.preventDefault();
                handlePaste();
            }

            // Cmd/Ctrl + A: Seleccionar todo
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a') {
                e.preventDefault();
                handleSelectAll();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [currentTime, project, handleUndo, handleRedo, handleSplit, handleDeleteSelected, handleCopy, handlePaste, handleSelectAll]);

    // ── 8. Manejadores de Clips y Pistas ──────────────────────────────────────
    const handleAddClip = (clipData: Omit<Clip, 'id'>) => {
        if (!project) return;
        const newClip: Clip = {
            ...clipData,
            id: `clip-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`
        };

        const updatedClips = [...project.clips, newClip];
        const newTotalDuration = computeProjectDuration(updatedClips, project.subtitles);

        const updatedProject: VideoEditorProjectData = {
            ...project,
            clips: updatedClips,
            duration: newTotalDuration
        };

        setProject(updatedProject);
        setSelectedItemIds([newClip.id]);
        setPrimarySelectedId(newClip.id);
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

        const newDuration = computeProjectDuration(updatedClips, project.subtitles);
        const updatedProject: VideoEditorProjectData = {
            ...project,
            clips: updatedClips,
            duration: newDuration
        };

        setProject(updatedProject);
        pushHistorySnapshot(updatedProject.tracks, updatedClips, updatedProject.subtitles, newDuration);
    };

    const handleDuplicateClip = (clipId: string) => {
        if (!project) return;
        const target = project.clips.find(c => c.id === clipId);
        if (!target) return;

        const duplicated: Clip = {
            ...JSON.parse(JSON.stringify(target)),
            id: `clip-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            name: `${target.name} (Copia)`,
            startTime: Number((target.startTime + target.duration + 0.1).toFixed(2))
        };

        const updatedClips = [...project.clips, duplicated];
        const newTotalDuration = computeProjectDuration(updatedClips, project.subtitles);

        const updatedProject: VideoEditorProjectData = {
            ...project,
            clips: updatedClips,
            duration: newTotalDuration
        };

        setProject(updatedProject);
        setSelectedItemIds([duplicated.id]);
        setPrimarySelectedId(duplicated.id);
        pushHistorySnapshot(updatedProject.tracks, updatedClips, updatedProject.subtitles, newTotalDuration);
        toast.success('Clip duplicado');
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
        const currentProject = projectRef.current || project;
        if (!currentProject) return;
        let updatedSubtitles: SubtitleConfig = {
            ...currentProject.subtitles,
            ...updates,
            style: updates.style ? { ...currentProject.subtitles.style, ...updates.style } : currentProject.subtitles.style
        };

        const activeLang = normalizeLangCode(updates.activeLanguage || updatedSubtitles.activeLanguage || updatedSubtitles.language || 'es');

        if (updates.segments && updates.translations) {
            // Si updates ya trae segments y translations completos y conmutados, resolver directamente
            updatedSubtitles = {
                ...updatedSubtitles,
                segments: resolveActiveSubtitleSegments(updatedSubtitles, activeLang)
            };
        } else if (updates.activeLanguage && updates.activeLanguage !== currentProject.subtitles.activeLanguage) {
            updatedSubtitles = switchSubtitleLanguage(updatedSubtitles, activeLang);
        } else if (updates.segments || updates.translations) {
            // Sincronizar segmentos del idioma activo
            updatedSubtitles = {
                ...updatedSubtitles,
                segments: resolveActiveSubtitleSegments(updatedSubtitles, activeLang)
            };
        }

        const newDuration = computeProjectDuration(currentProject.clips, updatedSubtitles);
        const updatedProject: VideoEditorProjectData = {
            ...currentProject,
            subtitles: updatedSubtitles,
            duration: newDuration
        };

        projectRef.current = updatedProject;
        setProject(updatedProject);
        pushHistorySnapshot(updatedProject.tracks, currentProject.clips, updatedSubtitles, newDuration);

        // Si se actualizaron idioma activo, segmentos o catálogo de traducciones, persistir de inmediato
        if (updates.activeLanguage || updates.translations || updates.segments) {
            saveProjectNow(updatedProject);
        }
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

    // ── 9. Render de Pantalla de Carga y Error ────────────────────────────────
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

    const selectedClipId = selectedItemIds.find(id => project.clips.some(c => c.id === id)) || null;
    const selectedClip = project.clips.find(c => c.id === (primarySelectedId || selectedClipId)) || null;
    const selectedSubtitleSegment = (project.subtitles?.segments || []).find(s => s.id === (primarySelectedId || selectedItemIds[0])) || null;

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
                onOpenExport={async () => {
                    await saveProjectNow();
                    setIsExportModalOpen(true);
                }}
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
                    onSwitchSubtitleLanguage={handleSwitchSubtitleLanguage}
                    onUpdateSubtitleSegment={handleUpdateSubtitleSegment}
                    onDeleteSubtitleSegment={handleDeleteSubtitleSegment}
                    format={project.format}
                    onFormatChange={fmt => setProject({ ...project, format: fmt })}
                    resolution={project.resolution}
                    onResolutionChange={res => setProject({ ...project, resolution: res })}
                    currentTime={currentTime}
                    isCollapsed={isLeftSidebarCollapsed}
                    onToggleCollapse={() => setIsLeftSidebarCollapsed(p => !p)}
                />

                {/* Lienzo / Canvas Central Adaptativo con Sincronización Multi-capa */}
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
                        selectedItemIds={selectedItemIds}
                        onSelectClip={id => handleSelectItem(id)}
                        onUpdateClip={handleUpdateClip}
                        onDuplicateClip={handleDuplicateClip}
                        onDeleteClip={handleDeleteClip}
                        onUpdateSubtitleSegment={handleUpdateSubtitleSegment}
                        onDeleteSubtitleSegment={handleDeleteSubtitleSegment}
                        onUpdateSubtitles={handleUpdateSubtitles}
                    />
                </div>

                {/* Inspector Contextual de Propiedades Derecho */}
                <VideoEditorInspector
                    selectedClip={selectedClip}
                    selectedSubtitleSegment={selectedSubtitleSegment}
                    selectedItemIds={selectedItemIds}
                    primarySelectedId={primarySelectedId}
                    tracks={project.tracks}
                    project={project}
                    onUpdateClip={handleUpdateClip}
                    onDeleteClip={handleDeleteClip}
                    onDuplicateClip={handleDuplicateClip}
                    onDeleteSelected={handleDeleteSelected}
                    onDuplicateSelected={handleDuplicateSelected}
                    onSeparateAudio={handleSeparateAudio}
                    onSplitSelected={handleSplit}
                    onUpdateSubtitles={handleUpdateSubtitles}
                    onUpdateSubtitleSegment={handleUpdateSubtitleSegment}
                    onDeleteSubtitleSegment={handleDeleteSubtitleSegment}
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
                selectedItemIds={selectedItemIds}
                primarySelectedId={primarySelectedId}
                onSelectItem={handleSelectItem}
                onSelectClip={id => handleSelectItem(id)}
                onUpdateClip={handleUpdateClip}
                onDeleteClip={handleDeleteClip}
                onDeleteSelected={handleDeleteSelected}
                onDuplicateClip={handleDuplicateClip}
                onDuplicateSelected={handleDuplicateSelected}
                onSplitClip={(clipId, atTime) => handleSplit(atTime)}
                onSplitSelected={handleSplit}
                onSeparateAudio={handleSeparateAudio}
                onAddTrack={handleAddTrack}
                onUpdateSubtitleSegment={handleUpdateSubtitleSegment}
                onDeleteSubtitleSegment={handleDeleteSubtitleSegment}
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
                subtitles={project.subtitles}
                clips={project.clips}
                tracks={project.tracks}
                onRenderStarted={() => {
                    setProject(prev => prev ? ({ ...prev, renderStatus: 'rendering', renderProgress: 5, renderStage: 'Preparando archivos' }) : null);
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
