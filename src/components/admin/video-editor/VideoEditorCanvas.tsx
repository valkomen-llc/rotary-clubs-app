// ════════════════════════════════════════════════════════════════════════════
// Lienzo / Reproductor Central del Editor de Video — v4.1141.0
//
// Visualización en tiempo real de la composición actual:
// - Adaptación automática y estricta a la relación de aspecto (16:9, 9:16, 1:1)
// - Sincronización de clips de video, imágenes, rótulos de texto y subtítulos IA
// - Barra de transporte (Play/Pause, timecode, salto de fotograma)
// ════════════════════════════════════════════════════════════════════════════

import React, { useRef, useEffect } from 'react';
import {
    Play,
    Pause,
    SkipBack,
    SkipForward,
    Volume2,
    VolumeX,
    Maximize,
    Smartphone,
    Tv,
    Square
} from 'lucide-react';
import type { AspectRatio, Clip, SubtitleConfig } from './types';
import { formatTimecode } from '../../../../server/lib/videoEditorSpec.js';

interface VideoEditorCanvasProps {
    format: AspectRatio;
    currentTime: number;
    duration: number;
    isPlaying: boolean;
    onTogglePlay: () => void;
    onSeek: (time: number) => void;
    clips: Clip[];
    subtitles: SubtitleConfig;
    selectedClipId: string | null;
    onSelectClip: (clipId: string | null) => void;
}

export const VideoEditorCanvas: React.FC<VideoEditorCanvasProps> = ({
    format,
    currentTime,
    duration,
    isPlaying,
    onTogglePlay,
    onSeek,
    clips,
    subtitles,
    selectedClipId,
    onSelectClip
}) => {
    const videoRef = useRef<HTMLVideoElement>(null);

    // Encontrar el clip visual activo en currentTime (ordenado por pista o z-index)
    const activeVisualClips = clips.filter(
        c => (c.type === 'video' || c.type === 'image') &&
             currentTime >= c.startTime &&
             currentTime < (c.startTime + c.duration)
    );

    // Tomar el clip visual superior
    const currentVisualClip = activeVisualClips[activeVisualClips.length - 1] || null;

    // Encontrar los clips de texto activos en currentTime
    const activeTextClips = clips.filter(
        c => c.type === 'text' &&
             currentTime >= c.startTime &&
             currentTime < (c.startTime + c.duration)
    );

    // Encontrar el segmento de subtítulo activo en currentTime
    const activeSubtitleSegment = (subtitles.segments || []).find(
        s => currentTime >= s.start && currentTime <= s.end
    );

    // Sincronizar el video HTML si el clip visual es un video
    useEffect(() => {
        if (!videoRef.current || !currentVisualClip || currentVisualClip.type !== 'video') return;

        const clipRelativeTime = Math.max(0, currentTime - currentVisualClip.startTime + (currentVisualClip.trimStart || 0));
        
        // Si hay una diferencia apreciable, sincronizar la posición
        if (Math.abs(videoRef.current.currentTime - clipRelativeTime) > 0.25) {
            videoRef.current.currentTime = clipRelativeTime;
        }

        if (isPlaying) {
            videoRef.current.play().catch(() => {});
        } else {
            videoRef.current.pause();
        }
    }, [currentTime, isPlaying, currentVisualClip?.id]);

    // Clases CSS para mantener la proporción estricta del lienzo
    const getAspectRatioClass = () => {
        switch (format) {
            case '16:9':
                return 'aspect-[16/9] max-w-4xl max-h-[70vh]';
            case '9:16':
                return 'aspect-[9/16] max-h-[70vh] w-auto';
            case '1:1':
                return 'aspect-square max-h-[70vh] max-w-[70vh]';
            case '4:5':
                return 'aspect-[4/5] max-h-[70vh] w-auto';
            default:
                return 'aspect-[16/9] max-w-4xl max-h-[70vh]';
        }
    };

    return (
        <div className="flex-1 flex flex-col bg-gray-950 items-center justify-between p-4 overflow-hidden relative select-none">
            {/* ── Área del Lienzo de Previsualización ── */}
            <div className="flex-1 w-full flex items-center justify-center relative min-h-0">
                <div
                    className={`relative bg-black rounded-xl overflow-hidden shadow-2xl border border-gray-800 flex items-center justify-center transition-all ${getAspectRatioClass()}`}
                    onClick={() => onSelectClip(null)}
                >
                    {/* Elemento Visual de Fondo (Video o Imagen) */}
                    {currentVisualClip ? (
                        currentVisualClip.type === 'video' ? (
                            <video
                                ref={videoRef}
                                src={currentVisualClip.url}
                                muted={currentVisualClip.muted}
                                playsInline
                                className="w-full h-full object-contain pointer-events-none"
                            />
                        ) : (
                            <img
                                src={currentVisualClip.url}
                                alt={currentVisualClip.name}
                                className="w-full h-full object-contain pointer-events-none"
                            />
                        )
                    ) : (
                        <div className="text-center p-6 text-gray-600 flex flex-col items-center gap-2">
                            <div className="w-12 h-12 rounded-full bg-gray-900 flex items-center justify-center text-gray-500">
                                {format === '16:9' ? <Tv className="w-6 h-6" /> : format === '9:16' ? <Smartphone className="w-6 h-6" /> : <Square className="w-6 h-6" />}
                            </div>
                            <p className="text-xs font-semibold">Lienzo vacío en este segundo ({currentTime.toFixed(1)}s)</p>
                            <p className="text-[11px] text-gray-500 max-w-xs">
                                Arrastra imágenes o videos desde la biblioteca multimedia para componer tu proyecto.
                            </p>
                        </div>
                    )}

                    {/* Rótulos de Texto Activos Superpuestos */}
                    {activeTextClips.map((tClip) => {
                        const isSelected = selectedClipId === tClip.id;
                        return (
                            <div
                                key={tClip.id}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onSelectClip(tClip.id);
                                }}
                                style={{
                                    fontSize: `${tClip.style?.fontSize || 28}px`,
                                    color: tClip.style?.color || '#FFFFFF',
                                    backgroundColor: tClip.style?.backgroundColor || 'transparent',
                                    fontWeight: tClip.style?.fontWeight || 'bold',
                                    fontFamily: tClip.style?.fontFamily || 'Inter, sans-serif',
                                    textAlign: tClip.style?.align || 'center',
                                    top: tClip.style?.y ? `${50 + tClip.style.y}%` : '50%',
                                    left: tClip.style?.x ? `${50 + tClip.style.x}%` : '50%',
                                    transform: 'translate(-50%, -50%)',
                                    padding: tClip.style?.backgroundColor !== 'transparent' ? '6px 16px' : '0',
                                    borderRadius: '8px'
                                }}
                                className={`absolute cursor-pointer transition-all ${
                                    isSelected
                                        ? 'ring-2 ring-indigo-500 shadow-xl'
                                        : 'hover:outline hover:outline-1 hover:outline-white/40'
                                }`}
                            >
                                {tClip.text}
                            </div>
                        );
                    })}

                    {/* Subtítulo Activo Superpuesto con Estilos Inteligentes */}
                    {activeSubtitleSegment && (
                        <div
                            style={{
                                fontFamily: subtitles.style?.fontFamily || 'Inter, sans-serif',
                                fontSize: `${subtitles.style?.fontSize || 24}px`,
                                color: subtitles.style?.color || '#FFFFFF',
                                backgroundColor: subtitles.style?.backgroundColor || 'rgba(0, 0, 0, 0.75)',
                                fontWeight: subtitles.style?.fontWeight || 'bold',
                                bottom: subtitles.style?.position === 'top' ? 'auto' : subtitles.style?.position === 'center' ? '50%' : '32px',
                                top: subtitles.style?.position === 'top' ? '32px' : 'auto',
                                transform: subtitles.style?.position === 'center' ? 'translate(-50%, 50%)' : 'translateX(-50%)',
                                borderRadius: `${subtitles.style?.borderRadius || 8}px`
                            }}
                            className="absolute left-1/2 px-4 py-1.5 text-center max-w-[90%] shadow-lg pointer-events-none transition-all leading-tight"
                        >
                            {activeSubtitleSegment.text}
                        </div>
                    )}
                </div>
            </div>

            {/* ── Barra de Transporte y Controles de Reproducción ── */}
            <div className="w-full max-w-xl bg-gray-900/90 backdrop-blur border border-gray-800 rounded-2xl px-4 py-2.5 mt-3 flex items-center justify-between shadow-xl">
                {/* Salto 1s Atrás */}
                <button
                    onClick={() => onSeek(Math.max(0, currentTime - 1))}
                    className="p-1.5 hover:bg-gray-800 rounded-lg text-gray-400 hover:text-white transition-colors"
                    title="Retroceder 1 segundo (Flecha Izquierda)"
                >
                    <SkipBack className="w-4 h-4" />
                </button>

                {/* Botón Principal Play / Pause */}
                <button
                    onClick={onTogglePlay}
                    className="w-10 h-10 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center shadow-lg shadow-indigo-600/30 transition-transform active:scale-95"
                    title={isPlaying ? 'Pausar (Espacio)' : 'Reproducir (Espacio)'}
                >
                    {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
                </button>

                {/* Salto 1s Adelante */}
                <button
                    onClick={() => onSeek(Math.min(duration, currentTime + 1))}
                    className="p-1.5 hover:bg-gray-800 rounded-lg text-gray-400 hover:text-white transition-colors"
                    title="Avanzar 1 segundo (Flecha Derecha)"
                >
                    <SkipForward className="w-4 h-4" />
                </button>

                <div className="h-4 w-[1px] bg-gray-800" />

                {/* Código de Tiempo / Duración */}
                <div className="font-mono text-xs text-gray-300 font-semibold tracking-wider">
                    <span className="text-white">{formatTimecode(currentTime)}</span>
                    <span className="text-gray-500 mx-1.5">/</span>
                    <span className="text-gray-400">{formatTimecode(duration)}</span>
                </div>
            </div>
        </div>
    );
};
