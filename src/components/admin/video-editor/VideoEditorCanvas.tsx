// ════════════════════════════════════════════════════════════════════════════
// Lienzo / Reproductor Central del Editor de Video (Tema Claro) — v4.1143.0
//
// Visualización en tiempo real de la composición actual:
// - Marco de lienzo nítido con aspect ratio adaptativo (16:9, 9:16, 1:1)
// - Entorno circundante claro y ergonómico
// - Sincronización precisa de video, imagen, texto y subtítulos IA
// - Barra de transporte y control de reproducción flotante
// ════════════════════════════════════════════════════════════════════════════

import React, { useRef, useEffect } from 'react';
import {
    Play,
    Pause,
    SkipBack,
    SkipForward,
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

    // Encontrar el clip visual activo en currentTime
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
                return 'aspect-[16/9] w-full max-w-4xl max-h-[58vh]';
            case '9:16':
                return 'aspect-[9/16] h-full max-h-[58vh] w-auto';
            case '1:1':
                return 'aspect-square h-full max-h-[58vh] max-w-[58vh]';
            case '4:5':
                return 'aspect-[4/5] h-full max-h-[58vh] w-auto';
            default:
                return 'aspect-[16/9] w-full max-w-4xl max-h-[58vh]';
        }
    };

    return (
        <div className="flex-1 flex flex-col bg-[#F8FAFC] items-center justify-between p-4 overflow-hidden relative select-none">
            {/* ── Área del Lienzo de Previsualización ── */}
            <div className="flex-1 w-full flex items-center justify-center relative min-h-0">
                <div
                    className={`relative bg-neutral-900 rounded-2xl overflow-hidden shadow-2xl border border-gray-300 flex items-center justify-center transition-all ${getAspectRatioClass()}`}
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
                        <div className="text-center p-6 text-gray-400 flex flex-col items-center gap-2">
                            <div className="w-12 h-12 rounded-full bg-neutral-800 flex items-center justify-center text-gray-400">
                                {format === '16:9' ? <Tv className="w-6 h-6" /> : format === '9:16' ? <Smartphone className="w-6 h-6" /> : <Square className="w-6 h-6" />}
                            </div>
                            <p className="text-xs font-semibold text-gray-300">Lienzo en {currentTime.toFixed(1)}s</p>
                            <p className="text-[11px] text-gray-500 max-w-xs">
                                Arrastra o agrega fotos y videos desde la biblioteca para componer tu video.
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
                                        ? 'ring-2 ring-[#013388] shadow-xl'
                                        : 'hover:outline hover:outline-1 hover:outline-white/50'
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

            {/* ── Barra de Transporte y Controles de Reproducción (Tema Claro) ── */}
            <div className="w-full max-w-xl bg-white/95 backdrop-blur-md border border-gray-200 rounded-2xl px-5 py-2 mt-3 flex items-center justify-between shadow-md">
                {/* Salto 1s Atrás */}
                <button
                    onClick={() => onSeek(Math.max(0, currentTime - 1))}
                    className="p-2 hover:bg-gray-100 rounded-xl text-gray-600 hover:text-gray-900 transition-colors"
                    title="Retroceder 1 segundo (Flecha Izquierda)"
                >
                    <SkipBack className="w-4 h-4" />
                </button>

                {/* Botón Principal Play / Pause */}
                <button
                    onClick={onTogglePlay}
                    className="w-10 h-10 rounded-full bg-[#013388] hover:bg-[#002868] text-white flex items-center justify-center shadow-md shadow-blue-900/25 transition-transform active:scale-95"
                    title={isPlaying ? 'Pausar (Espacio)' : 'Reproducir (Espacio)'}
                >
                    {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
                </button>

                {/* Salto 1s Adelante */}
                <button
                    onClick={() => onSeek(Math.min(duration, currentTime + 1))}
                    className="p-2 hover:bg-gray-100 rounded-xl text-gray-600 hover:text-gray-900 transition-colors"
                    title="Avanzar 1 segundo (Flecha Derecha)"
                >
                    <SkipForward className="w-4 h-4" />
                </button>

                <div className="h-4 w-[1px] bg-gray-200" />

                {/* Código de Tiempo / Duración */}
                <div className="font-mono text-xs font-bold text-gray-700 bg-slate-50 border border-gray-200 px-3 py-1.5 rounded-lg tracking-wider">
                    <span className="text-[#013388]">{formatTimecode(currentTime)}</span>
                    <span className="text-gray-400 mx-1.5">/</span>
                    <span className="text-gray-600">{formatTimecode(duration)}</span>
                </div>
            </div>
        </div>
    );
};
