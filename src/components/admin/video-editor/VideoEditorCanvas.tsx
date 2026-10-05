// ════════════════════════════════════════════════════════════════════════════
// Lienzo / Reproductor Central del Editor de Video (Tema Claro) — v4.1148.0
//
// Visualización y composición sincronizada en tiempo real:
// - Marco de lienzo adaptativo con aspect ratio estricto (16:9, 9:16, 1:1, 4:5)
// - Sincronización continua de video, audio multipista, texto y subtítulos IA
// - Reproducción simultánea de pistas de audio independientes (Locución, Música)
// - Supresión de eco/duplicación acústica para clips con audio separado (muted)
// - Composición multi-capa (Fondo principal + B-Roll overlay con escala y posición)
// - Barra de transporte y control ergonómico de reproducción
// ════════════════════════════════════════════════════════════════════════════

import React, { useRef, useEffect, useMemo } from 'react';
import {
    Play,
    Pause,
    SkipBack,
    SkipForward,
    Smartphone,
    Tv,
    Square
} from 'lucide-react';
import type { AspectRatio, Clip, SubtitleConfig, SubtitleSegment, SubtitleStyle } from './types';
import { formatTimecode, getSegmentText, getVisibleSubtitleSegments, normalizeLangCode } from './timelineUtils';
import { InteractiveTextOverlay } from './InteractiveTextOverlay';
import { resolveEffectiveStyle, applyStyleToAllSubtitles } from './textStyleUtils';

interface VideoEditorCanvasProps {
    format: AspectRatio;
    currentTime: number;
    duration: number;
    isPlaying: boolean;
    onTogglePlay: () => void;
    onSeek: (time: number) => void;
    clips: Clip[];
    subtitles: SubtitleConfig;
    selectedClipId?: string | null;
    selectedItemIds?: string[];
    onSelectClip: (clipId: string | null) => void;
    onUpdateClip?: (clipId: string, updates: Partial<Clip>) => void;
    onDuplicateClip?: (clipId: string) => void;
    onDeleteClip?: (clipId: string) => void;
    onUpdateSubtitleSegment?: (segmentId: string, updates: Partial<SubtitleSegment>) => void;
    onDeleteSubtitleSegment?: (segmentId: string) => void;
    onUpdateSubtitles?: (updates: Partial<SubtitleConfig>) => void;
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
    selectedClipId = null,
    selectedItemIds = [],
    onSelectClip,
    onUpdateClip,
    onDuplicateClip,
    onDeleteClip,
    onUpdateSubtitleSegment,
    onDeleteSubtitleSegment,
    onUpdateSubtitles
}) => {
    const canvasContainerRef = useRef<HTMLDivElement>(null);
    const mainVideoRef = useRef<HTMLVideoElement>(null);
    const overlayVideoRef = useRef<HTMLVideoElement>(null);
    const audioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());

    // ── 1. Determinar Clips Visuales Activos en currentTime ────────────────────
    const activeVisualClips = useMemo(() => {
        return clips.filter(
            c => (c.type === 'video' || c.type === 'image') &&
                 currentTime >= c.startTime &&
                 currentTime < (c.startTime + c.duration)
        );
    }, [clips, currentTime]);

    // Separar capa principal de capa overlay (B-Roll o Pista Superior)
    const { mainClip, overlayClip } = useMemo(() => {
        if (activeVisualClips.length === 0) {
            return { mainClip: null, overlayClip: null };
        }
        if (activeVisualClips.length === 1) {
            return { mainClip: activeVisualClips[0], overlayClip: null };
        }
        // Si hay varios, identificar si uno es overlay (track-video-overlay) o por orden
        const overlay = activeVisualClips.find(c => c.trackId === 'track-video-overlay') || activeVisualClips[activeVisualClips.length - 1];
        const main = activeVisualClips.find(c => c.id !== overlay.id) || activeVisualClips[0];
        return { mainClip: main, overlayClip: overlay };
    }, [activeVisualClips]);

    // ── 2. Determinar Clips de Audio Activos en currentTime ────────────────────
    const activeAudioClips = useMemo(() => {
        return clips.filter(
            c => c.type === 'audio' &&
                 c.url &&
                 currentTime >= c.startTime &&
                 currentTime < (c.startTime + c.duration)
        );
    }, [clips, currentTime]);

    // ── 3. Determinar Rótulos de Texto Activos en currentTime ──────────────────
    const activeTextClips = useMemo(() => {
        return clips.filter(
            c => c.type === 'text' &&
                 currentTime >= c.startTime &&
                 currentTime < (c.startTime + c.duration)
        );
    }, [clips, currentTime]);

    // ── 4. Determinar Subtítulo Activo en currentTime ──────────────────────────
    // Única fuente de verdad: segmento + idioma activo + traducción + estilo.
    // visibleSegments ya trae el contenido resuelto al idioma activo en
    // seg.text (idempotente con getSegmentText) y el estilo intacto en seg.style.
    const visibleSegments = useMemo(
        () => getVisibleSubtitleSegments(subtitles),
        [subtitles]
    );
    const effectiveSegments = useMemo(() => {
        return (visibleSegments && visibleSegments.length > 0)
            ? visibleSegments
            : (subtitles?.segments || []);
    }, [visibleSegments, subtitles?.segments]);
    const activeSubtitleSegment = useMemo(() => {
        return effectiveSegments.find(
            s => currentTime >= s.start && currentTime <= s.end
        ) || null;
    }, [effectiveSegments, currentTime]);

    // ── 5. Sincronización del Video Principal ─────────────────────────────────
    useEffect(() => {
        if (!mainVideoRef.current || !mainClip || mainClip.type !== 'video') return;

        const clipRelativeTime = Math.max(0, currentTime - mainClip.startTime + (mainClip.trimStart || 0));

        if (Math.abs(mainVideoRef.current.currentTime - clipRelativeTime) > 0.25) {
            mainVideoRef.current.currentTime = clipRelativeTime;
        }

        // Volumen y Mute (garantiza que si se extrajo el audio, el video no duplique sonido)
        mainVideoRef.current.muted = !!mainClip.muted;
        mainVideoRef.current.volume = mainClip.muted ? 0 : Math.min(1, Math.max(0, (mainClip.volume ?? 100) / 100));

        if (isPlaying) {
            mainVideoRef.current.play().catch(() => {});
        } else {
            mainVideoRef.current.pause();
        }
    }, [currentTime, isPlaying, mainClip?.id, mainClip?.muted, mainClip?.volume, mainClip?.trimStart, mainClip?.startTime]);

    // ── 6. Sincronización del Video Overlay / B-Roll ───────────────────────────
    useEffect(() => {
        if (!overlayVideoRef.current || !overlayClip || overlayClip.type !== 'video') return;

        const clipRelativeTime = Math.max(0, currentTime - overlayClip.startTime + (overlayClip.trimStart || 0));

        if (Math.abs(overlayVideoRef.current.currentTime - clipRelativeTime) > 0.25) {
            overlayVideoRef.current.currentTime = clipRelativeTime;
        }

        overlayVideoRef.current.muted = !!overlayClip.muted;
        overlayVideoRef.current.volume = overlayClip.muted ? 0 : Math.min(1, Math.max(0, (overlayClip.volume ?? 100) / 100));

        if (isPlaying) {
            overlayVideoRef.current.play().catch(() => {});
        } else {
            overlayVideoRef.current.pause();
        }
    }, [currentTime, isPlaying, overlayClip?.id, overlayClip?.muted, overlayClip?.volume, overlayClip?.trimStart, overlayClip?.startTime]);

    // ── 7. Motor de Reproducción de Pistas de Audio Multipista ─────────────────
    useEffect(() => {
        activeAudioClips.forEach(audioClip => {
            const el = audioElementsRef.current.get(audioClip.id);
            if (!el) return;

            const clipRelativeTime = Math.max(0, currentTime - audioClip.startTime + (audioClip.trimStart || 0));

            if (Math.abs(el.currentTime - clipRelativeTime) > 0.25) {
                el.currentTime = clipRelativeTime;
            }

            el.muted = !!audioClip.muted;
            el.volume = audioClip.muted ? 0 : Math.min(1, Math.max(0, (audioClip.volume ?? 100) / 100));

            if (isPlaying) {
                el.play().catch(() => {});
            } else {
                el.pause();
            }
        });

        // Pausar elementos de audio que ya no están activos
        audioElementsRef.current.forEach((el, id) => {
            if (!activeAudioClips.some(c => c.id === id)) {
                el.pause();
            }
        });
    }, [currentTime, isPlaying, activeAudioClips]);

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
            {/* Elementos de Audio HTML5 ocultos para reproducción multipista sincronizada */}
            <div className="hidden pointer-events-none" aria-hidden="true">
                {activeAudioClips.map(clip => (
                    <audio
                        key={clip.id}
                        ref={el => {
                            if (el) audioElementsRef.current.set(clip.id, el);
                            else audioElementsRef.current.delete(clip.id);
                        }}
                        src={clip.url}
                        preload="auto"
                    />
                ))}
            </div>

            {/* ── Área del Lienzo de Previsualización ── */}
            <div className="flex-1 w-full flex items-center justify-center relative min-h-0">
                <div
                    ref={canvasContainerRef}
                    className={`relative bg-neutral-900 rounded-2xl overflow-hidden shadow-2xl border border-gray-300 flex items-center justify-center transition-all ${getAspectRatioClass()}`}
                    onClick={() => onSelectClip(null)}
                >
                    {/* Capa Visual 1: Recurso Principal */}
                    {mainClip ? (
                        mainClip.type === 'video' ? (
                            <video
                                ref={mainVideoRef}
                                src={mainClip.url}
                                muted={mainClip.muted}
                                playsInline
                                className="w-full h-full object-contain pointer-events-none"
                            />
                        ) : (
                            <img
                                src={mainClip.url}
                                alt={mainClip.name}
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

                    {/* Capa Visual 2: B-Roll / Overlay Superpuesto con Escala y Posición */}
                    {overlayClip && (
                        <div
                            style={{
                                transform: `translate(${overlayClip.transform?.x || 0}%, ${overlayClip.transform?.y || 0}%) scale(${overlayClip.transform?.scale || 1})`,
                                transition: 'transform 0.1s ease-out'
                            }}
                            className="absolute inset-0 pointer-events-none flex items-center justify-center"
                        >
                            {overlayClip.type === 'video' ? (
                                <video
                                    ref={overlayVideoRef}
                                    src={overlayClip.url}
                                    muted={overlayClip.muted}
                                    playsInline
                                    className="max-w-full max-h-full object-contain shadow-2xl rounded-lg"
                                />
                            ) : (
                                <img
                                    src={overlayClip.url}
                                    alt={overlayClip.name}
                                    className="max-w-full max-h-full object-contain shadow-2xl rounded-lg"
                                />
                            )}
                        </div>
                    )}

                    {/* Capa 3: Rótulos de Texto Activos Superpuestos */}
                    {activeTextClips.map((tClip) => {
                        const isSelected = (selectedItemIds && selectedItemIds.includes(tClip.id)) || selectedClipId === tClip.id;
                        const effectiveStyle = resolveEffectiveStyle(tClip.style);
                        return (
                            <InteractiveTextOverlay
                                key={tClip.id}
                                id={tClip.id}
                                text={tClip.text || ''}
                                style={effectiveStyle}
                                isSelected={isSelected}
                                isSubtitle={false}
                                canvasRectRef={canvasContainerRef}
                                onSelect={() => onSelectClip(tClip.id)}
                                onUpdateStyle={(styleUpdates) => {
                                    onUpdateClip?.(tClip.id, {
                                        style: { ...(tClip.style || {}), ...styleUpdates }
                                    });
                                }}
                                onUpdateText={(newText) => {
                                    onUpdateClip?.(tClip.id, { text: newText });
                                }}
                                onCenterHorizontal={() => {
                                    onUpdateClip?.(tClip.id, {
                                        style: { ...(tClip.style || {}), x: 0 }
                                    });
                                }}
                                onDuplicate={() => onDuplicateClip?.(tClip.id)}
                                onDelete={() => onDeleteClip?.(tClip.id)}
                            />
                        );
                    })}

                    {/* Capa 4: Subtítulo Activo Superpuesto con Estilos Inteligentes */}
                    {activeSubtitleSegment && (() => {
                        const isSelected = (selectedItemIds && selectedItemIds.includes(activeSubtitleSegment.id)) || selectedClipId === activeSubtitleSegment.id;
                        const effectiveStyle = resolveEffectiveStyle(activeSubtitleSegment.style, subtitles.style);
                        const activeLang = normalizeLangCode(subtitles.activeLanguage || subtitles.language || subtitles.sourceLanguage || 'es');
                        const sourceLang = normalizeLangCode(subtitles.sourceLanguage || 'es');
                        const segIdx = effectiveSegments.findIndex(s => s.id === activeSubtitleSegment.id);
                        const activeText = getSegmentText(activeSubtitleSegment, activeLang, sourceLang, subtitles.translations, segIdx) || activeSubtitleSegment.text || '';

                        if (typeof window !== 'undefined' && (!(window as any).__lastPreviewLog || (Date.now() - ((window as any).__lastPreviewLog || 0)) > 4000)) {
                            (window as any).__lastPreviewLog = Date.now();
                            console.log('[PREVIEW] Renderizando subtítulo en canvas:', {
                                time: currentTime.toFixed(2),
                                activeLang,
                                activeText,
                                segmentId: activeSubtitleSegment.id
                            });
                        }

                        return (
                            <InteractiveTextOverlay
                                key={`${activeSubtitleSegment.id}-${activeLang}`}
                                id={activeSubtitleSegment.id}
                                text={activeText}
                                style={effectiveStyle}
                                isSelected={isSelected}
                                isSubtitle={true}
                                canvasRectRef={canvasContainerRef}
                                onSelect={() => onSelectClip(activeSubtitleSegment.id)}
                                onUpdateStyle={(styleUpdates) => {
                                    onUpdateSubtitleSegment?.(activeSubtitleSegment.id, {
                                        style: { ...(activeSubtitleSegment.style || {}), ...styleUpdates }
                                    });
                                }}
                                onUpdateText={(newText) => {
                                    onUpdateSubtitleSegment?.(activeSubtitleSegment.id, { text: newText });
                                }}
                                onCenterHorizontal={() => {
                                    onUpdateSubtitleSegment?.(activeSubtitleSegment.id, {
                                        style: { ...(activeSubtitleSegment.style || {}), x: 0 }
                                    });
                                }}
                                onApplyToAll={() => {
                                    const updated = applyStyleToAllSubtitles(subtitles, effectiveStyle);
                                    onUpdateSubtitles?.(updated);
                                }}
                                onDelete={() => onDeleteSubtitleSegment?.(activeSubtitleSegment.id)}
                            />
                        );
                    })()}
                </div>
            </div>

            {/* ── Barra de Transporte y Controles de Reproducción Sincronizados ── */}
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

                {/* Código de Tiempo / Duración Total Dinámica */}
                <div className="font-mono text-xs font-bold text-gray-700 bg-slate-50 border border-gray-200 px-3 py-1.5 rounded-lg tracking-wider">
                    <span className="text-[#013388]">{formatTimecode(currentTime)}</span>
                    <span className="text-gray-400 mx-1.5">/</span>
                    <span className="text-gray-600">{formatTimecode(duration)}</span>
                </div>
            </div>
        </div>
    );
};
