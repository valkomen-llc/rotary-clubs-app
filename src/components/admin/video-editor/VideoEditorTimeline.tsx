// ════════════════════════════════════════════════════════════════════════════
// Línea de Tiempo Multipista Profesional (Tema Claro) — v4.1148.0
//
// Componente central de secuenciación y edición visual:
// - Pistas universales: Subtítulos IA, Texto, Video / B-Roll, Video Principal, Locución, Música
// - Selección individual, múltiple (Ctrl/Cmd) y rango (Shift)
// - Subtítulos interactivos de primera clase: seleccionables, arrastrables, recortables
// - Herramientas de corte rápido: Dividir en cabezal (S), Separar Audio, Duplicar, Eliminar
// - Snapping magnético inteligente con línea guía visual
// - Escala temporal y zoom continuo con ajuste automático al lienzo
// ════════════════════════════════════════════════════════════════════════════

import React, { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import {
    Scissors,
    Trash2,
    Copy,
    Volume2,
    VolumeX,
    Eye,
    EyeOff,
    Lock,
    Unlock,
    ZoomIn,
    ZoomOut,
    Magnet,
    Plus,
    Video,
    Music,
    Type,
    Subtitles,
    Sparkles,
    ChevronUp,
    ChevronDown,
    Maximize2,
    Minimize2,
    Split
} from 'lucide-react';
import type { Track, Clip, SubtitleConfig, SubtitleSegment } from './types';
import { findSnapPoint, formatTimecode, getSegmentText, getVisibleSubtitleSegments, normalizeLangCode } from './timelineUtils';

interface VideoEditorTimelineProps {
    tracks: Track[];
    clips: Clip[];
    subtitles: SubtitleConfig;
    currentTime: number;
    duration: number;
    onSeek: (time: number) => void;
    selectedClipId?: string | null;
    selectedItemIds?: string[];
    primarySelectedId?: string | null;
    onSelectItem?: (id: string | null, isMulti?: boolean, isRange?: boolean) => void;
    onSelectClip?: (clipId: string | null) => void;
    onUpdateClip: (clipId: string, updates: Partial<Clip>) => void;
    onDeleteClip?: (clipId: string) => void;
    onDeleteSelected?: () => void;
    onDuplicateClip?: (clipId: string) => void;
    onDuplicateSelected?: () => void;
    onSplitClip?: (clipId: string, atTime: number) => void;
    onSplitSelected?: (atTime: number) => void;
    onSeparateAudio?: (clipId?: string) => void;
    onAddTrack: (trackType: 'video' | 'audio' | 'text') => void;
    onUpdateSubtitleSegment?: (segmentId: string, updates: Partial<SubtitleSegment>) => void;
    onDeleteSubtitleSegment?: (segmentId: string) => void;
}

export const VideoEditorTimeline: React.FC<VideoEditorTimelineProps> = ({
    tracks,
    clips,
    subtitles,
    currentTime,
    duration,
    onSeek,
    selectedClipId,
    selectedItemIds = [],
    primarySelectedId = null,
    onSelectItem,
    onSelectClip,
    onUpdateClip,
    onDeleteClip,
    onDeleteSelected,
    onDuplicateClip,
    onDuplicateSelected,
    onSplitClip,
    onSplitSelected,
    onSeparateAudio,
    onAddTrack,
    onUpdateSubtitleSegment,
    onDeleteSubtitleSegment
}) => {
    // Zoom: píxeles por segundo (15px a 160px)
    const [pixelsPerSecond, setPixelsPerSecond] = useState<number>(45);
    const [isSnapping, setIsSnapping] = useState<boolean>(true);
    const [snapGuideTime, setSnapGuideTime] = useState<number | null>(null);

    // Altura ajustable de la línea de tiempo: 200px (compacta), 280px (estándar), 360px (expandida)
    const [timelineHeightMode, setTimelineHeightMode] = useState<'compact' | 'standard' | 'expanded'>('standard');

    const timelineContainerRef = useRef<HTMLDivElement>(null);
    const [isDraggingPlayhead, setIsDraggingPlayhead] = useState(false);

    // Estado para arrastre y recorte de clips normales
    const [draggingClip, setDraggingClip] = useState<{ id: string; initialX: number; initialStart: number; duration: number } | null>(null);
    const [trimmingClip, setTrimmingClip] = useState<{ id: string; side: 'start' | 'end'; initialX: number; initialVal: number } | null>(null);

    // Estado para arrastre y recorte de segmentos de subtítulos IA
    const [draggingSub, setDraggingSub] = useState<{ id: string; initialX: number; initialStart: number; duration: number } | null>(null);
    const [trimmingSub, setTrimmingSub] = useState<{ id: string; side: 'start' | 'end'; initialX: number; initialVal: number } | null>(null);

    // Selección efectiva
    const effectiveSelectedIds = useMemo(() => {
        if (selectedItemIds && selectedItemIds.length > 0) return selectedItemIds;
        if (selectedClipId) return [selectedClipId];
        return [];
    }, [selectedItemIds, selectedClipId]);

    const primaryClip = useMemo(() => {
        const id = primarySelectedId || (selectedClipId && effectiveSelectedIds.includes(selectedClipId) ? selectedClipId : effectiveSelectedIds[0]);
        return clips.find(c => c.id === id) || null;
    }, [primarySelectedId, selectedClipId, effectiveSelectedIds, clips]);

    const primarySub = useMemo(() => {
        const id = primarySelectedId || effectiveSelectedIds[0];
        return (subtitles.segments || []).find(s => s.id === id) || null;
    }, [primarySelectedId, effectiveSelectedIds, subtitles.segments]);

    // Única fuente de verdad del subtítulo visible: segmento + idioma activo +
    // traducción correspondiente + estilo. Todos los bloques de la pista
    // "Subtítulos IA" se renderizan desde aquí (contenido resuelto en seg.text,
    // estilo intacto en seg.style).
    const visibleSegments = useMemo(
        () => getVisibleSubtitleSegments(subtitles),
        [subtitles]
    );

    // Duración visible total de la línea de tiempo (mínimo 30s o la duración del proyecto + holgura)
    const totalTimelineDuration = Math.max(30, duration + 8);
    const totalTimelineWidth = Math.max(800, totalTimelineDuration * pixelsPerSecond);

    // Posición del cabezal
    const playheadPositionPx = currentTime * pixelsPerSecond;

    // Calcular puntos magnéticos de snapping (playhead, 0s, cortes de clips y subtítulos)
    const snapTargets = useMemo(() => {
        const targets = new Set<number>([0, currentTime]);
        for (const c of clips) {
            targets.add(c.startTime);
            targets.add(Number((c.startTime + c.duration).toFixed(2)));
        }
        for (const s of visibleSegments) {
            targets.add(s.start);
            targets.add(s.end);
        }
        return Array.from(targets);
    }, [clips, visibleSegments, currentTime]);

    // Marcas de la regla de tiempo
    const intervalSeconds = pixelsPerSecond >= 80 ? 1 : pixelsPerSecond >= 40 ? 5 : 10;
    const rulerTicks = useMemo(() => {
        const ticks = [];
        for (let sec = 0; sec <= totalTimelineDuration; sec += intervalSeconds) {
            ticks.push(sec);
        }
        return ticks;
    }, [totalTimelineDuration, intervalSeconds]);

    // Manejar selección unificada
    const handleSelect = (id: string, e?: React.MouseEvent) => {
        if (onSelectItem) {
            onSelectItem(id, !!(e?.metaKey || e?.ctrlKey), !!e?.shiftKey);
        } else if (onSelectClip) {
            onSelectClip(id);
        }
    };

    // Ajustar zoom para que el proyecto quepa completo en la ventana
    const handleFitToScreen = () => {
        if (!timelineContainerRef.current) return;
        const availableWidth = timelineContainerRef.current.clientWidth - 40;
        const targetDuration = Math.max(10, duration);
        const fitPx = Math.max(15, Math.min(120, Math.floor(availableWidth / targetDuration)));
        setPixelsPerSecond(fitPx);
    };

    // ScrubberMouseDown en regla
    const handleRulerMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!timelineContainerRef.current) return;
        const rect = timelineContainerRef.current.getBoundingClientRect();
        const scrollLeft = timelineContainerRef.current.scrollLeft;
        const clickX = e.clientX - rect.left + scrollLeft;
        const newTime = Math.max(0, Math.min(totalTimelineDuration, clickX / pixelsPerSecond));
        onSeek(Number(newTime.toFixed(2)));
        setIsDraggingPlayhead(true);
    };

    // ── Efecto de Arrastre Global (Playhead, Clips y Subtítulos) ──────────────
    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            // 1. Playhead
            if (isDraggingPlayhead && timelineContainerRef.current) {
                const rect = timelineContainerRef.current.getBoundingClientRect();
                const scrollLeft = timelineContainerRef.current.scrollLeft;
                const clickX = e.clientX - rect.left + scrollLeft;
                const newTime = Math.max(0, Math.min(totalTimelineDuration, clickX / pixelsPerSecond));
                onSeek(Number(newTime.toFixed(2)));
            }

            // 2. Arrastre de Clip
            if (draggingClip) {
                const deltaX = e.clientX - draggingClip.initialX;
                const deltaSec = deltaX / pixelsPerSecond;
                let newStart = Math.max(0, draggingClip.initialStart + deltaSec);

                if (isSnapping) {
                    const snapCandidate = findSnapPoint(newStart, snapTargets.filter(t => Math.abs(t - draggingClip.initialStart) > 0.05), 0.25);
                    const snapEndCandidate = findSnapPoint(newStart + draggingClip.duration, snapTargets.filter(t => Math.abs(t - (draggingClip.initialStart + draggingClip.duration)) > 0.05), 0.25);

                    if (snapCandidate !== null) {
                        newStart = snapCandidate;
                        setSnapGuideTime(snapCandidate);
                    } else if (snapEndCandidate !== null) {
                        newStart = snapEndCandidate - draggingClip.duration;
                        setSnapGuideTime(snapEndCandidate);
                    } else {
                        setSnapGuideTime(null);
                    }
                } else {
                    setSnapGuideTime(null);
                }

                onUpdateClip(draggingClip.id, { startTime: Number(newStart.toFixed(2)) });
            }

            // 3. Recorte de Clip (Trimming)
            if (trimmingClip) {
                const deltaX = e.clientX - trimmingClip.initialX;
                const deltaSec = deltaX / pixelsPerSecond;
                const clipObj = clips.find(c => c.id === trimmingClip.id);
                if (!clipObj) return;

                if (trimmingClip.side === 'end') {
                    let newDur = Math.max(0.3, trimmingClip.initialVal + deltaSec);
                    if (isSnapping) {
                        const snapPoint = findSnapPoint(clipObj.startTime + newDur, snapTargets, 0.25);
                        if (snapPoint !== null) {
                            newDur = Math.max(0.3, snapPoint - clipObj.startTime);
                            setSnapGuideTime(snapPoint);
                        } else {
                            setSnapGuideTime(null);
                        }
                    }
                    onUpdateClip(trimmingClip.id, { duration: Number(newDur.toFixed(2)) });
                } else if (trimmingClip.side === 'start') {
                    let newStart = Math.max(0, trimmingClip.initialVal + deltaSec);
                    if (isSnapping) {
                        const snapPoint = findSnapPoint(newStart, snapTargets, 0.25);
                        if (snapPoint !== null) {
                            newStart = snapPoint;
                            setSnapGuideTime(snapPoint);
                        } else {
                            setSnapGuideTime(null);
                        }
                    }
                    const durChange = newStart - clipObj.startTime;
                    const newDur = Math.max(0.3, clipObj.duration - durChange);
                    const newTrim = Math.max(0, (clipObj.trimStart || 0) + durChange);
                    onUpdateClip(trimmingClip.id, {
                        startTime: Number(newStart.toFixed(2)),
                        duration: Number(newDur.toFixed(2)),
                        trimStart: Number(newTrim.toFixed(2))
                    });
                }
            }

            // 4. Arrastre de Subtítulo
            if (draggingSub && onUpdateSubtitleSegment) {
                const deltaX = e.clientX - draggingSub.initialX;
                const deltaSec = deltaX / pixelsPerSecond;
                let newStart = Math.max(0, draggingSub.initialStart + deltaSec);

                if (isSnapping) {
                    const snapCandidate = findSnapPoint(newStart, snapTargets, 0.25);
                    const snapEndCandidate = findSnapPoint(newStart + draggingSub.duration, snapTargets, 0.25);
                    if (snapCandidate !== null) {
                        newStart = snapCandidate;
                        setSnapGuideTime(snapCandidate);
                    } else if (snapEndCandidate !== null) {
                        newStart = snapEndCandidate - draggingSub.duration;
                        setSnapGuideTime(snapEndCandidate);
                    } else {
                        setSnapGuideTime(null);
                    }
                } else {
                    setSnapGuideTime(null);
                }

                const newEnd = Number((newStart + draggingSub.duration).toFixed(2));
                onUpdateSubtitleSegment(draggingSub.id, {
                    start: Number(newStart.toFixed(2)),
                    end: newEnd
                });
            }

            // 5. Recorte de Subtítulo (Trimming)
            if (trimmingSub && onUpdateSubtitleSegment) {
                const deltaX = e.clientX - trimmingSub.initialX;
                const deltaSec = deltaX / pixelsPerSecond;
                const subObj = (subtitles.segments || []).find(s => s.id === trimmingSub.id);
                if (!subObj) return;

                if (trimmingSub.side === 'end') {
                    let newEnd = Math.max(subObj.start + 0.2, trimmingSub.initialVal + deltaSec);
                    if (isSnapping) {
                        const snapPoint = findSnapPoint(newEnd, snapTargets, 0.25);
                        if (snapPoint !== null) {
                            newEnd = Math.max(subObj.start + 0.2, snapPoint);
                            setSnapGuideTime(snapPoint);
                        } else {
                            setSnapGuideTime(null);
                        }
                    }
                    onUpdateSubtitleSegment(trimmingSub.id, { end: Number(newEnd.toFixed(2)) });
                } else if (trimmingSub.side === 'start') {
                    let newStart = Math.max(0, Math.min(subObj.end - 0.2, trimmingSub.initialVal + deltaSec));
                    if (isSnapping) {
                        const snapPoint = findSnapPoint(newStart, snapTargets, 0.25);
                        if (snapPoint !== null) {
                            newStart = Math.max(0, Math.min(subObj.end - 0.2, snapPoint));
                            setSnapGuideTime(snapPoint);
                        } else {
                            setSnapGuideTime(null);
                        }
                    }
                    onUpdateSubtitleSegment(trimmingSub.id, { start: Number(newStart.toFixed(2)) });
                }
            }
        };

        const handleMouseUp = () => {
            setIsDraggingPlayhead(false);
            setDraggingClip(null);
            setTrimmingClip(null);
            setDraggingSub(null);
            setTrimmingSub(null);
            setSnapGuideTime(null);
        };

        if (isDraggingPlayhead || draggingClip || trimmingClip || draggingSub || trimmingSub) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [
        isDraggingPlayhead, draggingClip, trimmingClip, draggingSub, trimmingSub,
        pixelsPerSecond, totalTimelineDuration, isSnapping, snapTargets, clips, subtitles.segments,
        onSeek, onUpdateClip, onUpdateSubtitleSegment
    ]);

    // Acción Cortar / Dividir en currentTime
    const handleSplitTrigger = () => {
        if (onSplitSelected) {
            onSplitSelected(currentTime);
        } else if (onSplitClip && primaryClip) {
            onSplitClip(primaryClip.id, currentTime);
        }
    };

    // Acción Duplicar
    const handleDuplicateTrigger = () => {
        if (onDuplicateSelected && effectiveSelectedIds.length > 0) {
            onDuplicateSelected();
        } else if (onDuplicateClip && primaryClip) {
            onDuplicateClip(primaryClip.id);
        }
    };

    // Acción Eliminar
    const handleDeleteTrigger = () => {
        if (onDeleteSelected && effectiveSelectedIds.length > 0) {
            onDeleteSelected();
        } else if (onDeleteClip && primaryClip) {
            onDeleteClip(primaryClip.id);
        } else if (onDeleteSubtitleSegment && primarySub) {
            onDeleteSubtitleSegment(primarySub.id);
        }
    };

    // Determinar si se puede dividir en currentTime
    const canSplit = useMemo(() => {
        // Clips seleccionados
        const hasSelectedClipSplit = clips.some(
            c => effectiveSelectedIds.includes(c.id) && currentTime > c.startTime && currentTime < (c.startTime + c.duration)
        );
        if (hasSelectedClipSplit) return true;

        // Subtítulos seleccionados
        const hasSelectedSubSplit = visibleSegments.some(
            s => effectiveSelectedIds.includes(s.id) && currentTime > s.start && currentTime < s.end
        );
        if (hasSelectedSubSplit) return true;

        // Clip o subtítulo activo bajo el playhead si no hay selección
        if (effectiveSelectedIds.length === 0) {
            const hasActiveClip = clips.some(c => currentTime > c.startTime && currentTime < (c.startTime + c.duration));
            const hasActiveSub = visibleSegments.some(s => currentTime > s.start && currentTime < s.end);
            return hasActiveClip || hasActiveSub;
        }

        return false;
    }, [clips, visibleSegments, effectiveSelectedIds, currentTime]);

    const getTrackIcon = (type: string) => {
        switch (type) {
            case 'video':
                return <Video className="w-3.5 h-3.5 text-blue-600" />;
            case 'audio':
                return <Music className="w-3.5 h-3.5 text-amber-600" />;
            case 'text':
                return <Type className="w-3.5 h-3.5 text-purple-600" />;
            case 'subtitles':
                return <Subtitles className="w-3.5 h-3.5 text-emerald-600" />;
            default:
                return <Video className="w-3.5 h-3.5 text-gray-500" />;
        }
    };

    const getClipColorClasses = (clip: Clip, isSelected: boolean) => {
        if (isSelected) {
            return 'bg-blue-100 border-2 border-[#013388] text-[#013388] shadow-md ring-2 ring-blue-300';
        }
        switch (clip.type) {
            case 'video':
            case 'image':
                return 'bg-blue-50/90 border border-blue-300 text-blue-950 hover:border-blue-500 hover:bg-blue-100/80 shadow-xs';
            case 'text':
                return 'bg-purple-50/90 border border-purple-300 text-purple-950 hover:border-purple-500 hover:bg-purple-100/80 shadow-xs';
            case 'audio':
                return 'bg-amber-50/90 border border-amber-300 text-amber-950 hover:border-amber-500 hover:bg-amber-100/80 shadow-xs';
            default:
                return 'bg-slate-100 border border-slate-300 text-slate-800 shadow-xs';
        }
    };

    const timelineHeightClass =
        timelineHeightMode === 'compact'
            ? 'h-[200px]'
            : timelineHeightMode === 'expanded'
            ? 'h-[360px]'
            : 'h-[270px]';

    return (
        <div className={`${timelineHeightClass} bg-white border-t border-gray-200 flex flex-col select-none relative transition-all duration-150`}>
            {/* ── Barra de Herramientas de la Línea de Tiempo (CapCut style) ── */}
            <div className="h-10 px-4 bg-slate-50 border-b border-gray-200 flex items-center justify-between text-xs text-gray-700 shrink-0">
                {/* Herramientas de Edición Rápida */}
                <div className="flex items-center gap-1.5">
                    {/* Botón Cortar / Dividir */}
                    <button
                        onClick={handleSplitTrigger}
                        disabled={!canSplit}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white border border-gray-200 hover:bg-gray-100 disabled:opacity-40 disabled:hover:bg-white text-gray-800 font-semibold transition-colors shadow-xs"
                        title="Dividir en el cabezal (Tecla S)"
                    >
                        <Scissors className="w-3.5 h-3.5 text-blue-600" />
                        <span>Dividir</span>
                    </button>

                    {/* Botón Separar Audio (solo visible/activo si hay video seleccionado) */}
                    {primaryClip && primaryClip.type === 'video' && onSeparateAudio && (
                        <button
                            onClick={() => onSeparateAudio(primaryClip.id)}
                            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-300 hover:bg-amber-100 text-amber-900 font-semibold transition-colors shadow-xs animate-in fade-in duration-150"
                            title="Extraer y separar el audio en una pista independiente"
                        >
                            <Music className="w-3.5 h-3.5 text-amber-600" />
                            <span>Separar Audio</span>
                        </button>
                    )}

                    {/* Botón Duplicar */}
                    <button
                        onClick={handleDuplicateTrigger}
                        disabled={effectiveSelectedIds.length === 0}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white border border-gray-200 hover:bg-gray-100 disabled:opacity-40 disabled:hover:bg-white text-gray-800 font-semibold transition-colors shadow-xs"
                        title="Duplicar elementos seleccionados"
                    >
                        <Copy className="w-3.5 h-3.5 text-gray-600" />
                        <span>Duplicar</span>
                    </button>

                    {/* Botón Eliminar Selección Masiva */}
                    <button
                        onClick={handleDeleteTrigger}
                        disabled={effectiveSelectedIds.length === 0}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white border border-rose-200 hover:bg-rose-50 disabled:opacity-40 disabled:hover:bg-white text-rose-700 font-semibold transition-colors shadow-xs"
                        title="Eliminar elementos seleccionados (Delete / Backspace)"
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>
                            Eliminar{effectiveSelectedIds.length > 1 ? ` (${effectiveSelectedIds.length})` : ''}
                        </span>
                    </button>

                    <div className="h-4 w-[1px] bg-gray-200 mx-1" />

                    {/* Snapping Magnético */}
                    <button
                        onClick={() => setIsSnapping(!isSnapping)}
                        className={`p-1.5 rounded-lg border transition-colors ${
                            isSnapping ? 'bg-blue-50 border-blue-200 text-[#013388]' : 'bg-white border-gray-200 text-gray-400 hover:text-gray-700'
                        }`}
                        title={isSnapping ? 'Ajuste magnético activo' : 'Ajuste magnético desactivado'}
                    >
                        <Magnet className="w-3.5 h-3.5" />
                    </button>

                    {/* Ajustar a la pantalla (Fit) */}
                    <button
                        onClick={handleFitToScreen}
                        className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white border border-gray-200 hover:bg-gray-100 text-gray-600 text-[11px] font-semibold transition-colors"
                        title="Ajustar todo el proyecto visible en la pantalla"
                    >
                        <span>Ajustar</span>
                    </button>

                    {/* Alternar Altura del Timeline */}
                    <button
                        onClick={() => {
                            if (timelineHeightMode === 'standard') setTimelineHeightMode('expanded');
                            else if (timelineHeightMode === 'expanded') setTimelineHeightMode('compact');
                            else setTimelineHeightMode('standard');
                        }}
                        className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white border border-gray-200 hover:bg-gray-100 text-gray-600 text-[11px] font-semibold transition-colors"
                        title="Cambiar altura de la línea de tiempo (Compacta / Estándar / Expandida)"
                    >
                        <span className="capitalize">{timelineHeightMode}</span>
                        {timelineHeightMode === 'expanded' ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
                    </button>
                </div>

                {/* Control de Zoom de la Línea de Tiempo */}
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setPixelsPerSecond(Math.max(15, pixelsPerSecond - 10))}
                        className="p-1 hover:bg-gray-200 rounded text-gray-500 hover:text-gray-800"
                        title="Reducir zoom"
                    >
                        <ZoomOut className="w-3.5 h-3.5" />
                    </button>
                    <input
                        type="range"
                        min="15"
                        max="150"
                        value={pixelsPerSecond}
                        onChange={(e) => setPixelsPerSecond(Number(e.target.value))}
                        className="w-24 accent-[#013388] cursor-pointer"
                    />
                    <button
                        onClick={() => setPixelsPerSecond(Math.min(150, pixelsPerSecond + 10))}
                        className="p-1 hover:bg-gray-200 rounded text-gray-500 hover:text-gray-800"
                        title="Aumentar zoom"
                    >
                        <ZoomIn className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>

            {/* ── Cuerpo Principal de Pistas y Regla ── */}
            <div className="flex-1 flex overflow-hidden">
                {/* Columna Izquierda: Encabezados de Pistas */}
                <div className="w-48 bg-slate-50 border-r border-gray-200 flex flex-col shrink-0 overflow-y-auto">
                    {/* Espacio para alinear con la regla superior */}
                    <div className="h-7 border-b border-gray-200 px-3 flex items-center justify-between text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                        <span>Pistas</span>
                    </div>

                    {/* Pista de Subtítulos Header */}
                    <div className="h-12 px-3 border-b border-gray-200 flex items-center justify-between bg-emerald-50/50">
                        <div className="flex items-center gap-2 truncate">
                            <Subtitles className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            <span className="text-xs font-bold text-emerald-950 truncate">Subtítulos IA</span>
                        </div>
                        <span className="text-[10px] font-mono text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded-full">
                            {(subtitles.segments || []).length}
                        </span>
                    </div>

                    {/* Lista de Pistas Normales Headers */}
                    <div className="flex-1">
                        {tracks.filter(t => t.type !== 'subtitles').map(track => (
                            <div
                                key={track.id}
                                className="h-12 px-3 border-b border-gray-200 flex items-center justify-between hover:bg-slate-100 transition-colors"
                            >
                                <div className="flex items-center gap-2 truncate">
                                    {getTrackIcon(track.type)}
                                    <span className="text-xs font-semibold text-gray-800 truncate" title={track.name}>
                                        {track.name}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Columna Derecha: Regla Temporal, Carriles y Scrubber */}
                <div
                    ref={timelineContainerRef}
                    onClick={() => {
                        // Clic en espacio vacío del timeline: deseleccionar
                        if (onSelectItem) onSelectItem(null);
                        else if (onSelectClip) onSelectClip(null);
                    }}
                    className="flex-1 overflow-x-auto overflow-y-auto relative bg-slate-50/50 scrollbar-thin scrollbar-thumb-gray-300"
                >
                    <div style={{ width: `${totalTimelineWidth}px` }} className="relative min-h-full">
                        {/* 1. Regla Temporal Superior */}
                        <div
                            onMouseDown={handleRulerMouseDown}
                            className="h-7 border-b border-gray-200 bg-slate-100/90 sticky top-0 z-20 cursor-pointer select-none"
                        >
                            {rulerTicks.map(sec => (
                                <div
                                    key={sec}
                                    style={{ left: `${sec * pixelsPerSecond}px` }}
                                    className="absolute top-0 bottom-0 flex flex-col justify-between text-[9px] font-mono text-gray-500 pl-1 border-l border-gray-300"
                                >
                                    <span>{formatTimecode(sec).slice(0, 5)}</span>
                                </div>
                            ))}
                        </div>

                        {/* 2. Pista de Subtítulos Carril Interactivo (Primer Nivel) */}
                        <div className="h-12 border-b border-gray-200 relative bg-emerald-50/20">
                            {(() => {
                                const activeLang = normalizeLangCode(subtitles.activeLanguage || subtitles.language || subtitles.sourceLanguage || 'es');
                                const sourceLang = normalizeLangCode(subtitles.sourceLanguage || 'es');
                                return visibleSegments.map((seg, idx) => {
                                    const left = seg.start * pixelsPerSecond;
                                    const width = Math.max(16, (seg.end - seg.start) * pixelsPerSecond);
                                    const isSelected = effectiveSelectedIds.includes(seg.id);
                                    // Contenido resuelto al idioma activo de forma estrictamente reactiva
                                    const segText = getSegmentText(seg, activeLang, sourceLang, subtitles.translations, idx) || seg.text;

                                    return (
                                        <div
                                            key={seg.id}
                                        style={{ left: `${left}px`, width: `${width}px` }}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleSelect(seg.id, e);
                                        }}
                                        onMouseDown={(e) => {
                                            if (e.button !== 0) return;
                                            setDraggingSub({
                                                id: seg.id,
                                                initialX: e.clientX,
                                                initialStart: seg.start,
                                                duration: seg.end - seg.start
                                            });
                                        }}
                                        className={`absolute top-1.5 bottom-1.5 rounded-lg px-2 py-0.5 text-[11px] font-bold truncate flex items-center justify-between shadow-xs cursor-grab active:cursor-grabbing transition-all ${
                                            isSelected
                                                ? 'bg-emerald-200 border-2 border-emerald-700 text-emerald-950 shadow-md ring-2 ring-emerald-400 z-10'
                                                : 'bg-emerald-100/90 border border-emerald-400 text-emerald-950 hover:bg-emerald-200/80'
                                        }`}
                                        title={`${seg.start.toFixed(1)}s - ${seg.end.toFixed(1)}s: ${segText}`}
                                    >
                                        {/* Mango de recorte inicio del subtítulo */}
                                        <div
                                            onMouseDown={(e) => {
                                                e.stopPropagation();
                                                setTrimmingSub({
                                                    id: seg.id,
                                                    side: 'start',
                                                    initialX: e.clientX,
                                                    initialVal: seg.start
                                                });
                                            }}
                                            className="w-2 -ml-2 h-full cursor-ew-resize hover:bg-emerald-700 rounded-l-md transition-colors"
                                            title="Recortar inicio del subtítulo"
                                        />

                                        <span className="truncate pointer-events-none">{segText}</span>

                                        {/* Mango de recorte final del subtítulo */}
                                        <div
                                            onMouseDown={(e) => {
                                                e.stopPropagation();
                                                setTrimmingSub({
                                                    id: seg.id,
                                                    side: 'end',
                                                    initialX: e.clientX,
                                                    initialVal: seg.end
                                                });
                                            }}
                                            className="w-2 -mr-2 h-full cursor-ew-resize hover:bg-emerald-700 rounded-r-md transition-colors"
                                            title="Recortar final del subtítulo"
                                        />
                                    </div>
                                );
                            });
                        })()}
                        </div>

                        {/* 3. Carriles de Pistas Normales (Video, Audio, Texto) */}
                        {tracks.filter(t => t.type !== 'subtitles').map(track => {
                            const trackClips = clips.filter(c => c.trackId === track.id);
                            return (
                                <div
                                    key={track.id}
                                    className="h-12 border-b border-gray-200 relative bg-white hover:bg-slate-50/50 transition-colors"
                                >
                                    {trackClips.map(clip => {
                                        const left = clip.startTime * pixelsPerSecond;
                                        const width = Math.max(20, clip.duration * pixelsPerSecond);
                                        const isSelected = effectiveSelectedIds.includes(clip.id);

                                        return (
                                            <div
                                                key={clip.id}
                                                style={{ left: `${left}px`, width: `${width}px` }}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleSelect(clip.id, e);
                                                }}
                                                onMouseDown={(e) => {
                                                    if (e.button !== 0) return;
                                                    setDraggingClip({
                                                        id: clip.id,
                                                        initialX: e.clientX,
                                                        initialStart: clip.startTime,
                                                        duration: clip.duration
                                                    });
                                                }}
                                                className={`absolute top-1.5 bottom-1.5 rounded-lg flex items-center justify-between px-2 cursor-grab active:cursor-grabbing transition-shadow ${getClipColorClasses(
                                                    clip,
                                                    isSelected
                                                )}`}
                                            >
                                                {/* Mango de recorte inicial (Trim Start) */}
                                                <div
                                                    onMouseDown={(e) => {
                                                        e.stopPropagation();
                                                        setTrimmingClip({
                                                            id: clip.id,
                                                            side: 'start',
                                                            initialX: e.clientX,
                                                            initialVal: clip.startTime
                                                        });
                                                    }}
                                                    className="w-2 -ml-2 h-full cursor-ew-resize hover:bg-[#013388] rounded-l-md transition-colors"
                                                    title="Recortar inicio"
                                                />

                                                {/* Contenido / Etiqueta del clip */}
                                                <div className="flex items-center gap-1.5 truncate pointer-events-none">
                                                    {clip.type === 'video' && <Video className="w-3 h-3 shrink-0" />}
                                                    {clip.type === 'image' && <Video className="w-3 h-3 shrink-0 text-indigo-600" />}
                                                    {clip.type === 'text' && <Type className="w-3 h-3 shrink-0" />}
                                                    {clip.type === 'audio' && <Music className="w-3 h-3 shrink-0" />}
                                                    <span className="text-[11px] font-bold truncate">
                                                        {clip.name || clip.text || 'Clip'}
                                                    </span>
                                                    <span className="text-[10px] opacity-70">
                                                        ({clip.duration.toFixed(1)}s)
                                                    </span>
                                                    {clip.muted && (
                                                        <VolumeX className="w-3 h-3 text-rose-500 shrink-0" />
                                                    )}
                                                </div>

                                                {/* Mango de recorte final (Trim End) */}
                                                <div
                                                    onMouseDown={(e) => {
                                                        e.stopPropagation();
                                                        setTrimmingClip({
                                                            id: clip.id,
                                                            side: 'end',
                                                            initialX: e.clientX,
                                                            initialVal: clip.duration
                                                        });
                                                    }}
                                                    className="w-2 -mr-2 h-full cursor-ew-resize hover:bg-[#013388] rounded-r-md transition-colors"
                                                    title="Recortar final"
                                                />
                                            </div>
                                        );
                                    })}
                                </div>
                            );
                        })}

                        {/* 4. Línea Guía de Snapping Magnético */}
                        {snapGuideTime !== null && (
                            <div
                                style={{ left: `${snapGuideTime * pixelsPerSecond}px` }}
                                className="absolute top-0 bottom-0 w-[1px] bg-cyan-500 z-25 pointer-events-none border-l border-cyan-400 border-dashed"
                            />
                        )}

                        {/* 5. Cabezal de Reproducción (Playhead Cursor) */}
                        <div
                            style={{ left: `${playheadPositionPx}px` }}
                            className="absolute top-0 bottom-0 w-[2px] bg-red-600 z-30 pointer-events-none"
                        >
                            {/* Cabeza del cursor */}
                            <div className="w-3.5 h-3.5 bg-red-600 rounded-b-md -translate-x-[6px] shadow-sm flex items-center justify-center text-[8px] text-white font-bold">
                                ▼
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
