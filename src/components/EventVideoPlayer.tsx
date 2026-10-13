import React, { useState, useMemo } from 'react';
import { Play, X, Video as VideoIcon } from 'lucide-react';
import { resolveEventVideo, EventVideoConfig } from '../lib/eventVideo';

export interface EventVideoPlayerProps {
    /** Configuración del video guardada en metadata.video */
    video?: EventVideoConfig | null;
    /** Imagen de portada de respaldo (por ejemplo, portada del evento) */
    fallbackCover?: string | null;
    /** Título de respaldo si el video no tiene uno propio */
    title?: string;
    /** Clases CSS adicionales para el contenedor */
    className?: string;
}

/**
 * Contenedor de video estándar para eventos de Club Platform.
 *
 * Cumple con los requerimientos:
 * 1. Proporción panorámica 16:9 y esquinas redondeadas elegantes.
 * 2. Carga diferida con imagen de portada y botón central de reproducción.
 * 3. Cero reproducción automática con sonido inicial.
 * 4. Soporta YouTube (nocookie), Vimeo y videos directos (HTML5).
 * 5. Si no hay video configurado o válido, retorna `null` sin dejar huecos.
 */
export const EventVideoPlayer: React.FC<EventVideoPlayerProps> = ({
    video,
    fallbackCover,
    title: fallbackTitle,
    className = '',
}) => {
    const [isPlaying, setIsPlaying] = useState(false);
    const [thumbError, setThumbError] = useState(false);

    const resolved = useMemo(() => resolveEventVideo(video), [video]);

    // Portada calculada: prioridad a la portada personalizada del usuario,
    // luego a la miniatura de YouTube (con degradación a hqdefault si maxres falla),
    // y finalmente a la foto de portada del evento.
    const posterUrl = useMemo(() => {
        if (!resolved) return '';
        if (resolved.coverImage && resolved.coverImage !== resolved.thumbnailUrl) {
            return resolved.coverImage;
        }
        if (thumbError && resolved.videoId && resolved.provider === 'youtube') {
            return `https://img.youtube.com/vi/${resolved.videoId}/hqdefault.jpg`;
        }
        return resolved.thumbnailUrl || resolved.coverImage || fallbackCover || '';
    }, [resolved, thumbError, fallbackCover]);

    // Si todavía no se ha configurado un video válido, no debe aparecer ni dejar espacios
    if (!resolved) return null;

    const displayTitle = resolved.title || fallbackTitle || '';
    const displayDescription = resolved.description || '';

    const handlePlay = () => {
        setIsPlaying(true);
    };

    const handleStop = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsPlaying(false);
    };

    return (
        <div className={`w-full ${className}`}>
            <div
                className="group relative w-full aspect-video rounded-2xl md:rounded-3xl overflow-hidden shadow-xl ring-1 ring-black/5 bg-gray-950 transition-all duration-300 hover:shadow-2xl"
                style={{ contentVisibility: 'auto' }}
            >
                {!isPlaying ? (
                    /* ── Estado Inicial: Portada Elegante con Botón Central de Play ── */
                    <button
                        type="button"
                        onClick={handlePlay}
                        className="w-full h-full text-left relative block focus:outline-none focus:ring-4 focus:ring-sky-400/50 cursor-pointer overflow-hidden"
                        aria-label={`Reproducir video${displayTitle ? `: ${displayTitle}` : ''}`}
                    >
                        {/* Imagen de Portada */}
                        {posterUrl ? (
                            <img
                                src={posterUrl}
                                alt={displayTitle || 'Portada de video'}
                                loading="lazy"
                                onError={() => setThumbError(true)}
                                className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
                            />
                        ) : (
                            /* Fondo estilizado institucional si no hay imagen */
                            <div className="absolute inset-0 bg-gradient-to-br from-rotary-navy via-[#0c2340] to-rotary-blue flex items-center justify-center">
                                <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:16px_16px]" />
                            </div>
                        )}

                        {/* Velo / Gradiente cinematográfico sobre la imagen */}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-black/25 transition-opacity duration-300 group-hover:from-black/90 group-hover:via-black/40" />

                        {/* Insignia superior izquierda */}
                        <div className="absolute top-4 left-4 sm:top-6 sm:left-6 z-10">
                            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/45 backdrop-blur-md text-white text-[11px] sm:text-xs font-semibold tracking-wide border border-white/15 shadow-sm">
                                <VideoIcon className="w-3.5 h-3.5 text-sky-400" />
                                {resolved.provider === 'youtube'
                                    ? 'YouTube'
                                    : resolved.provider === 'vimeo'
                                        ? 'Vimeo'
                                        : 'Video Oficial'}
                            </span>
                        </div>

                        {/* Botón Central de Play */}
                        <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
                            <div className="relative flex items-center justify-center">
                                {/* Efecto de pulso / resplandor rotario */}
                                <div className="absolute -inset-3 rounded-full bg-rotary-blue/30 blur-md opacity-75 group-hover:opacity-100 group-hover:scale-125 transition-all duration-500 animate-pulse" />

                                {/* Círculo del botón */}
                                <div className="relative w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 rounded-full bg-rotary-blue text-white flex items-center justify-center shadow-[0_10px_35px_rgba(0,93,170,0.55)] ring-4 ring-white/35 group-hover:ring-8 group-hover:ring-sky-300/40 group-hover:bg-rotary-navy group-hover:scale-110 active:scale-95 transition-all duration-300 ease-out">
                                    <Play className="w-7 h-7 sm:w-9 sm:h-9 md:w-11 md:h-11 fill-white text-white translate-x-0.5 drop-shadow" />
                                </div>
                            </div>
                        </div>

                        {/* Título y descripción en la parte inferior */}
                        {(displayTitle || displayDescription) && (
                            <div className="absolute bottom-0 left-0 right-0 p-5 sm:p-7 z-10">
                                {displayTitle && (
                                    <h3 className="text-lg sm:text-2xl font-black text-white leading-tight drop-shadow-md mb-1 line-clamp-2">
                                        {displayTitle}
                                    </h3>
                                )}
                                {displayDescription && (
                                    <p className="text-xs sm:text-sm text-gray-200 line-clamp-2 drop-shadow leading-relaxed max-w-3xl">
                                        {displayDescription}
                                    </p>
                                )}
                            </div>
                        )}
                    </button>
                ) : (
                    /* ── Estado Activo: Reproductor (Iframe o Video HTML5) ── */
                    <div className="relative w-full h-full bg-black">
                        {/* Botón discreto para volver a la portada */}
                        <button
                            type="button"
                            onClick={handleStop}
                            className="absolute top-3 right-3 z-30 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/70 hover:bg-black/90 text-white text-xs font-semibold backdrop-blur-md border border-white/20 transition-all shadow-lg active:scale-95"
                            title="Volver a la portada del video"
                            aria-label="Cerrar reproductor de video"
                        >
                            <X className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Cerrar video</span>
                        </button>

                        {resolved.provider === 'direct' ? (
                            /* Video HTML5 con controles nativos (play, pausa, volumen, pantalla completa) */
                            <video
                                src={resolved.directUrl || resolved.embedUrl}
                                poster={posterUrl || undefined}
                                controls
                                autoPlay
                                playsInline
                                className="w-full h-full object-contain bg-black"
                            >
                                Tu navegador no soporta la reproducción de video HTML5.
                            </video>
                        ) : (
                            /* Incrustación optimizada de YouTube o Vimeo */
                            <iframe
                                src={resolved.embedUrl}
                                title={displayTitle || 'Video promocional'}
                                className="w-full h-full border-0 absolute inset-0"
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                                allowFullScreen
                                loading="lazy"
                            />
                        )}
                    </div>
                )}
            </div>

            {/* Pie de video descriptivo opcional debajo del contenedor si se desea mayor legibilidad */}
            {displayDescription && isPlaying && (
                <div className="mt-3 px-2">
                    <p className="text-sm text-gray-600 leading-relaxed italic">
                        {displayDescription}
                    </p>
                </div>
            )}
        </div>
    );
};

export default EventVideoPlayer;
