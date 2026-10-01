// ════════════════════════════════════════════════════════════════════════════
// Línea de Tiempo Multipista Profesional — v4.1141.0
//
// Componente central para edición visual y multipista:
// - Pistas de Video/Imagen, Audio, Texto y Subtítulos
// - Cortar/dividir clips en el cabezal (Playhead)
// - Recorte de inicio y final (trim in/out handles)
// - Arrastre y reordenamiento temporal
// - Control de volumen, duplicar y eliminar
// - Regla temporal con scrubber y zoom interactivo
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
    Sliders
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

                if (isSnapping) {
                    // Snapping magnético al playhead si está cerca (< 0.25s)
                    if (Math.abs(newStart - currentTime) < 0.25) {
                        newStart = currentTime;
                    }
                }

                onUpdateClip(draggingClip.id, { startTime: Number(newStart.toFixed(2)) });
            }

            // Manejar recorte de inicio o fin (trimming)
            if (trimmingClip) {
                const deltaX = e.clientX - trimmingClip.initialX;
                const deltaSec = deltaX / pixelsPerSecond;
                const clip = clips.find(c => c.id === trimmingClip.id);
                if (!clip) return;

                if (trimmingClip.side === 'end') {
                    const newDur = Math.max(0.5, trimmingClip.initialVal + deltaSec);
                    onUpdateClip(trimmingClip.id, { duration: Number(newDur.toFixed(2)) });
                } else if (trimmingClip.side === 'start') {
                    const maxTrim = clip.duration - 0.5;
                    const change = Math.min(maxTrim, deltaSec);
                    const newStart = Math.max(0, clip.startTime + change);
                    const newDur = Math.max(0.5, clip.duration - change);
                    onUpdateClip(trimmingClip.id, {
                        startTime: Number(newStart.toFixed(2)),
                        duration: Number(newDur.toFixed(2)),
                        trimStart: Number(((clip.trimStart || 0) + change).toFixed(2))
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
                return <Video className="w-3.5 h-3.5 text-indigo-400" />;
            case 'audio':
                return <Music className="w-3.5 h-3.5 text-emerald-400" />;
            case 'text':
                return <Type className="w-3.5 h-3.5 text-purple-400" />;
            case 'subtitles':
                return <Subtitles className="w-3.5 h-3.5 text-amber-400" />;
            default:
                return <Video className="w-3.5 h-3.5 text-gray-400" />;
        }
    };

    return (
        <div className="h-72 bg-gray-950 border-t border-gray-800 flex flex-col select-none relative">
            {/* ── Barra de Herramientas de la Línea de Tiempo ── */}
            <div className="h-10 px-4 bg-gray-900/90 border-b border-gray-800 flex items-center justify-between text-xs text-gray-300">
                {/* Herramientas de Edición Rápida */}
                <div className="flex items-center gap-1.5">
                    {/* Botón Cortar / Dividir */}
                    <button
                        onClick={handleSplit}
                        disabled={!selectedClip || currentTime <= selectedClip.startTime || currentTime >= (selectedClip.startTime + selectedClip.duration)}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-gray-800 hover:bg-gray-700 disabled:opacity-30 disabled:hover:bg-gray-800 text-white font-semibold transition-colors shadow-sm"
                        title="Dividir clip en el cabezal (Tecla S)"
                    >
                        <Scissors className="w-3.5 h-3.5 text-indigo-400" />
                        <span>Dividir</span>
                    </button>

                    {/* Botón Duplicar */}
                    <button
                        onClick={() => selectedClip && onDuplicateClip(selectedClip.id)}
                        disabled={!selectedClip}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-gray-800 hover:bg-gray-700 disabled:opacity-30 disabled:hover:bg-gray-800 text-white font-semibold transition-colors shadow-sm"
                        title="Duplicar clip seleccionado"
                    >
                        <Copy className="w-3.5 h-3.5 text-gray-300" />
                        <span>Duplicar</span>
                    </button>

                    {/* Botón Eliminar */}
                    <button
                        onClick={() => selectedClip && onDeleteClip(selectedClip.id)}
                        disabled={!selectedClip}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-gray-800 hover:bg-rose-900/40 disabled:opacity-30 disabled:hover:bg-gray-800 text-rose-300 font-semibold transition-colors shadow-sm"
                        title="Eliminar clip seleccionado (Delete / Backspace)"
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Eliminar</span>
                    </button>

                    <div className="h-4 w-[1px] bg-gray-700 mx-1" />

                    {/* Snapping Magnético */}
                    <button
                        onClick={() => setIsSnapping(!isSnapping)}
                        className={`p-1.5 rounded transition-colors ${
                            isSnapping ? 'bg-indigo-600/30 text-indigo-400' : 'text-gray-500 hover:text-white'
                        }`}
                        title="Ajuste magnético automático"
                    >
                        <Magnet className="w-3.5 h-3.5" />
                    </button>
                </div>

                {/* Control de Zoom de la Línea de Tiempo */}
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setPixelsPerSecond(Math.max(20, pixelsPerSecond - 10))}
                        className="p-1 hover:bg-gray-800 rounded text-gray-400 hover:text-white"
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
                        className="w-24 accent-indigo-500 cursor-pointer"
                    />
                    <button
                        onClick={() => setPixelsPerSecond(Math.min(140, pixelsPerSecond + 10))}
                        className="p-1 hover:bg-gray-800 rounded text-gray-400 hover:text-white"
                        title="Aumentar zoom"
                    >
                        <ZoomIn className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>

            {/* ── Cuerpo Principal de Pistas y Regla ── */}
            <div className="flex-1 flex overflow-hidden">
                {/* Columna Izquierda: Encabezados de Pistas */}
                <div className="w-48 bg-gray-900 border-r border-gray-800 flex flex-col shrink-0">
                    {/* Espacio para alinear con la regla superior */}
                    <div className="h-7 border-b border-gray-800 px-3 flex items-center justify-between text-[10px] font-bold text-gray-400 uppercase">
                        <span>Pistas</span>
                    </div>

                    {/* Pista de Subtítulos Header */}
                    <div className="h-12 px-3 border-b border-gray-800/80 flex items-center justify-between bg-gray-900/60">
                        <div className="flex items-center gap-2 truncate">
                            <Subtitles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                            <span className="text-xs font-semibold text-gray-200 truncate">Subtítulos IA</span>
                        </div>
                    </div>

                    {/* Lista de Pistas Normales Headers */}
                    <div className="flex-1 overflow-hidden">
                        {tracks.filter(t => t.type !== 'subtitles').map(track => (
                            <div
                                key={track.id}
                                className="h-12 px-3 border-b border-gray-800/80 flex items-center justify-between hover:bg-gray-850 transition-colors"
                            >
                                <div className="flex items-center gap-2 truncate">
                                    {getTrackIcon(track.type)}
                                    <span className="text-xs font-semibold text-gray-200 truncate" title={track.name}>
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
                    className="flex-1 overflow-x-auto overflow-y-hidden relative bg-gray-950 scrollbar-thin scrollbar-thumb-gray-800"
                >
                    <div style={{ width: `${totalTimelineWidth}px` }} className="relative h-full">
                        {/* 1. Regla Temporal Superior */}
                        <div
                            onMouseDown={handleRulerMouseDown}
                            className="h-7 border-b border-gray-800 bg-gray-900/80 relative cursor-pointer select-none"
                        >
                            {rulerTicks.map(sec => (
                                <div
                                    key={sec}
                                    style={{ left: `${sec * pixelsPerSecond}px` }}
                                    className="absolute top-0 bottom-0 flex flex-col justify-between text-[9px] font-mono text-gray-400 pl-1 border-l border-gray-700/60"
                                >
                                    <span>{formatTimecode(sec).slice(0, 5)}</span>
                                </div>
                            ))}
                        </div>

                        {/* 2. Pista de Subtítulos Carril */}
                        <div className="h-12 border-b border-gray-800/60 relative bg-amber-950/10">
                            {(subtitles.segments || []).map(seg => {
                                const left = seg.start * pixelsPerSecond;
                                const width = Math.max(16, (seg.end - seg.start) * pixelsPerSecond);
                                return (
                                    <div
                                        key={seg.id}
                                        style={{ left: `${left}px`, width: `${width}px` }}
                                        className="absolute top-1 bottom-1 rounded bg-amber-600/30 border border-amber-500/60 px-2 py-0.5 text-[11px] font-bold text-amber-200 truncate flex items-center shadow-sm"
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
                                    className="h-12 border-b border-gray-800/50 relative hover:bg-gray-900/20"
                                    onClick={() => onSelectClip(null)}
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
                                                    // Iniciar arrastre del clip
                                                    e.stopPropagation();
                                                    onSelectClip(clip.id);
                                                    setDraggingClip({
                                                        id: clip.id,
                                                        initialX: e.clientX,
                                                        initialStart: clip.startTime
                                                    });
                                                }}
                                                className={`absolute top-1 bottom-1 rounded-lg border overflow-hidden cursor-move flex items-center justify-between text-xs font-semibold px-2 transition-shadow ${
                                                    clip.type === 'video'
                                                        ? 'bg-indigo-900/50 border-indigo-500 text-indigo-100'
                                                        : clip.type === 'audio'
                                                        ? 'bg-emerald-900/50 border-emerald-500 text-emerald-100'
                                                        : clip.type === 'text'
                                                        ? 'bg-purple-900/50 border-purple-500 text-purple-100'
                                                        : 'bg-blue-900/50 border-blue-500 text-blue-100'
                                                } ${isSelected ? 'ring-2 ring-white shadow-xl' : 'hover:border-white/60'}`}
                                            >
                                                {/* Mango de recorte izquierdo (Trim Start) */}
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
                                                    className="w-2.5 -ml-2 h-full hover:bg-white/40 cursor-ew-resize flex items-center justify-center shrink-0"
                                                    title="Recortar inicio"
                                                >
                                                    <div className="w-0.5 h-3 bg-white/60 rounded" />
                                                </div>

                                                {/* Contenido / Nombre del Clip */}
                                                <div className="flex items-center gap-1.5 truncate px-1 pointer-events-none">
                                                    {getTrackIcon(clip.type)}
                                                    <span className="truncate">{clip.text || clip.name}</span>
                                                    <span className="text-[10px] opacity-60">({clip.duration}s)</span>
                                                </div>

                                                {/* Mango de recorte derecho (Trim End) */}
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
                                                    className="w-2.5 -mr-2 h-full hover:bg-white/40 cursor-ew-resize flex items-center justify-center shrink-0"
                                                    title="Recortar final"
                                                >
                                                    <div className="w-0.5 h-3 bg-white/60 rounded" />
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            );
                        })}

                        {/* ── Aguja de Reproducción / Playhead ── */}
                        <div
                            style={{ left: `${playheadPositionPx}px` }}
                            className="absolute top-0 bottom-0 w-[2px] bg-rose-500 z-30 pointer-events-none"
                        >
                            {/* Mango Superior del Playhead */}
                            <div
                                onMouseDown={(e) => {
                                    e.stopPropagation();
                                    setIsDraggingPlayhead(true);
                                }}
                                className="w-3.5 h-4 bg-rose-500 -ml-[6px] top-0 rounded-b cursor-ew-resize pointer-events-auto flex items-center justify-center shadow-lg"
                            >
                                <div className="w-1 h-1.5 bg-white rounded-full" />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
