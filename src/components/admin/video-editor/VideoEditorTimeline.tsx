// ════════════════════════════════════════════════════════════════════════════
// Línea de Tiempo Multipista Profesional (Tema Claro) — v4.1143.0
//
// Componente central para edición visual y multipista:
// - Pistas claramente diferenciadas: Video Principal, Video/B-Roll, Texto, Subtítulos IA, Audio
// - Estética clara, bordes limpios y clips identificables por color armónico
// - Herramientas de corte (Split), recorte (Trim), duplicación y borrado
// - Altura ajustable para laptops y monitores grandes
// - Scrubber interactivo y zoom elástico
// ════════════════════════════════════════════════════════════════════════════

import React, { useRef, useState, useEffect } from 'react';
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
    Minimize2
} from 'lucide-react';
import type { Track, Clip, SubtitleConfig } from './types';
import { formatTimecode } from '../../../../server/lib/videoEditorSpec.js';

interface VideoEditorTimelineProps {
    tracks: Track[];
    clips: Clip[];
    subtitles: SubtitleConfig;
    currentTime: number;
    duration: number;
    onSeek: (time: number) => void;
    selectedClipId: string | null;
    onSelectClip: (clipId: string | null) => void;
    onUpdateClip: (clipId: string, updates: Partial<Clip>) => void;
    onDeleteClip: (clipId: string) => void;
    onDuplicateClip: (clipId: string) => void;
    onSplitClip: (clipId: string, atTime: number) => void;
    onAddTrack: (trackType: 'video' | 'audio' | 'text') => void;
}

export const VideoEditorTimeline: React.FC<VideoEditorTimelineProps> = ({
    tracks,
    clips,
    subtitles,
    currentTime,
    duration,
    onSeek,
    selectedClipId,
    onSelectClip,
    onUpdateClip,
    onDeleteClip,
    onDuplicateClip,
    onSplitClip,
    onAddTrack
}) => {
    // Zoom: píxeles por segundo (20px a 150px)
    const [pixelsPerSecond, setPixelsPerSecond] = useState<number>(45);
    const [isSnapping, setIsSnapping] = useState<boolean>(true);

    // Altura ajustable de la línea de tiempo: 200px (compacta), 280px (estándar), 360px (expandida)
    const [timelineHeightMode, setTimelineHeightMode] = useState<'compact' | 'standard' | 'expanded'>('standard');

    const timelineContainerRef = useRef<HTMLDivElement>(null);
    const [isDraggingPlayhead, setIsDraggingPlayhead] = useState(false);
    const [draggingClip, setDraggingClip] = useState<{ id: string; initialX: number; initialStart: number } | null>(null);
    const [trimmingClip, setTrimmingClip] = useState<{ id: string; side: 'start' | 'end'; initialX: number; initialVal: number } | null>(null);

    const selectedClip = clips.find(c => c.id === selectedClipId) || null;

    // Duración visible total de la línea de tiempo (mínimo 30s para holgura)
    const totalTimelineDuration = Math.max(30, duration + 10);
    const totalTimelineWidth = totalTimelineDuration * pixelsPerSecond;

    // Calcular posición en píxeles del cursor / playhead
    const playheadPositionPx = currentTime * pixelsPerSecond;

    // Generar marcas de la regla de tiempo (cada 1s, 5s o 10s según el zoom)
    const intervalSeconds = pixelsPerSecond >= 80 ? 1 : pixelsPerSecond >= 40 ? 5 : 10;
    const rulerTicks = [];
    for (let sec = 0; sec <= totalTimelineDuration; sec += intervalSeconds) {
        rulerTicks.push(sec);
    }

    // Manejar arrastre del cabezal de reproducción (Playhead scrubber)
    const handleRulerMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!timelineContainerRef.current) return;
        const rect = timelineContainerRef.current.getBoundingClientRect();
        const scrollLeft = timelineContainerRef.current.scrollLeft;
        const clickX = e.clientX - rect.left + scrollLeft;
        const newTime = Math.max(0, Math.min(totalTimelineDuration, clickX / pixelsPerSecond));
        onSeek(newTime);
        setIsDraggingPlayhead(true);
    };

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (isDraggingPlayhead && timelineContainerRef.current) {
                const rect = timelineContainerRef.current.getBoundingClientRect();
                const scrollLeft = timelineContainerRef.current.scrollLeft;
                const clickX = e.clientX - rect.left + scrollLeft;
                const newTime = Math.max(0, Math.min(totalTimelineDuration, clickX / pixelsPerSecond));
                onSeek(newTime);
            }

            // Manejar arrastre del cuerpo del clip
            if (draggingClip) {
                const deltaX = e.clientX - draggingClip.initialX;
                const deltaSec = deltaX / pixelsPerSecond;
                let newStart = Math.max(0, draggingClip.initialStart + deltaSec);

                // Snapping magnético con el playhead
                if (isSnapping && Math.abs(newStart - currentTime) < 0.3) {
                    newStart = currentTime;
                }

                onUpdateClip(draggingClip.id, { startTime: Number(newStart.toFixed(2)) });
            }

            // Manejar recorte inicial / final (Trimming)
            if (trimmingClip) {
                const deltaX = e.clientX - trimmingClip.initialX;
                const deltaSec = deltaX / pixelsPerSecond;
                const clipObj = clips.find(c => c.id === trimmingClip.id);
                if (!clipObj) return;

                if (trimmingClip.side === 'end') {
                    const newDur = Math.max(0.5, trimmingClip.initialVal + deltaSec);
                    onUpdateClip(trimmingClip.id, { duration: Number(newDur.toFixed(2)) });
                } else if (trimmingClip.side === 'start') {
                    const newStart = Math.max(0, trimmingClip.initialVal + deltaSec);
                    const durChange = newStart - clipObj.startTime;
                    const newDur = Math.max(0.5, clipObj.duration - durChange);
                    onUpdateClip(trimmingClip.id, {
                        startTime: Number(newStart.toFixed(2)),
                        duration: Number(newDur.toFixed(2))
                    });
                }
            }
        };

        const handleMouseUp = () => {
            setIsDraggingPlayhead(false);
            setDraggingClip(null);
            setTrimmingClip(null);
        };

        if (isDraggingPlayhead || draggingClip || trimmingClip) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDraggingPlayhead, draggingClip, trimmingClip, pixelsPerSecond, totalTimelineDuration, isSnapping, currentTime]);

    // Acción Cortar / Dividir Clip en currentTime
    const handleSplit = () => {
        if (!selectedClip) return;
        if (currentTime > selectedClip.startTime && currentTime < (selectedClip.startTime + selectedClip.duration)) {
            onSplitClip(selectedClip.id, currentTime);
        }
    };

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
            {/* ── Barra de Herramientas de la Línea de Tiempo ── */}
            <div className="h-10 px-4 bg-slate-50 border-b border-gray-200 flex items-center justify-between text-xs text-gray-700 shrink-0">
                {/* Herramientas de Edición Rápida */}
                <div className="flex items-center gap-1.5">
                    {/* Botón Cortar / Dividir */}
                    <button
                        onClick={handleSplit}
                        disabled={!selectedClip || currentTime <= selectedClip.startTime || currentTime >= (selectedClip.startTime + selectedClip.duration)}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white border border-gray-200 hover:bg-gray-100 disabled:opacity-40 disabled:hover:bg-white text-gray-800 font-semibold transition-colors shadow-xs"
                        title="Dividir clip en el cabezal (Tecla S)"
                    >
                        <Scissors className="w-3.5 h-3.5 text-blue-600" />
                        <span>Dividir</span>
                    </button>

                    {/* Botón Duplicar */}
                    <button
                        onClick={() => selectedClip && onDuplicateClip(selectedClip.id)}
                        disabled={!selectedClip}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white border border-gray-200 hover:bg-gray-100 disabled:opacity-40 disabled:hover:bg-white text-gray-800 font-semibold transition-colors shadow-xs"
                        title="Duplicar clip seleccionado"
                    >
                        <Copy className="w-3.5 h-3.5 text-gray-600" />
                        <span>Duplicar</span>
                    </button>

                    {/* Botón Eliminar */}
                    <button
                        onClick={() => selectedClip && onDeleteClip(selectedClip.id)}
                        disabled={!selectedClip}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white border border-rose-200 hover:bg-rose-50 disabled:opacity-40 disabled:hover:bg-white text-rose-700 font-semibold transition-colors shadow-xs"
                        title="Eliminar clip seleccionado (Delete / Backspace)"
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Eliminar</span>
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
                        onClick={() => setPixelsPerSecond(Math.max(20, pixelsPerSecond - 10))}
                        className="p-1 hover:bg-gray-200 rounded text-gray-500 hover:text-gray-800"
                        title="Reducir zoom"
                    >
                        <ZoomOut className="w-3.5 h-3.5" />
                    </button>
                    <input
                        type="range"
                        min="20"
                        max="140"
                        value={pixelsPerSecond}
                        onChange={(e) => setPixelsPerSecond(Number(e.target.value))}
                        className="w-24 accent-[#013388] cursor-pointer"
                    />
                    <button
                        onClick={() => setPixelsPerSecond(Math.min(140, pixelsPerSecond + 10))}
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

                        {/* 2. Pista de Subtítulos Carril */}
                        <div className="h-12 border-b border-gray-200 relative bg-emerald-50/20">
                            {(subtitles.segments || []).map(seg => {
                                const left = seg.start * pixelsPerSecond;
                                const width = Math.max(16, (seg.end - seg.start) * pixelsPerSecond);
                                return (
                                    <div
                                        key={seg.id}
                                        style={{ left: `${left}px`, width: `${width}px` }}
                                        className="absolute top-1.5 bottom-1.5 rounded-lg bg-emerald-100 border border-emerald-400 px-2 py-0.5 text-[11px] font-bold text-emerald-950 truncate flex items-center shadow-xs"
                                        title={`${seg.start.toFixed(1)}s - ${seg.end.toFixed(1)}s: ${seg.text}`}
                                    >
                                        <span className="truncate">{seg.text}</span>
                                    </div>
                                );
                            })}
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
                                        const isSelected = selectedClipId === clip.id;

                                        return (
                                            <div
                                                key={clip.id}
                                                style={{ left: `${left}px`, width: `${width}px` }}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onSelectClip(clip.id);
                                                }}
                                                onMouseDown={(e) => {
                                                    // Iniciar arrastre del cuerpo del clip
                                                    setDraggingClip({
                                                        id: clip.id,
                                                        initialX: e.clientX,
                                                        initialStart: clip.startTime
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

                        {/* 4. Cabezal de Reproducción (Playhead Cursor) */}
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
