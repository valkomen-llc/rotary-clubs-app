// ════════════════════════════════════════════════════════════════════════════
// Panel Lateral de Herramientas del Editor de Video — v4.1141.0
//
// Organización inspirada en CapCut:
// - Riel de herramientas: Multimedia, Texto, Audio, Subtítulos, Transiciones, Ajustes
// - Integración directa de la Biblioteca Multimedia de Club Platform y carga de archivos
// - Generación y traducción de subtítulos inteligentes con IA
// ════════════════════════════════════════════════════════════════════════════

import React, { useState, useEffect, useRef } from 'react';
import {
    FolderKanban,
    Type,
    Music,
    Subtitles,
    Sparkles,
    SlidersHorizontal,
    UploadCloud,
    Search,
    Plus,
    Play,
    Trash2,
    Languages,
    Check,
    Loader2,
    Layers,
    Volume2,
    VolumeX,
    FileText,
    Copy,
    ChevronDown,
    ChevronUp,
    Palette,
    Video as VideoIcon,
    Image as ImageIcon
} from 'lucide-react';
import type {
    Clip,
    Track,
    SubtitleConfig,
    SubtitleSegment,
    MediaLibraryItem,
    AspectRatio,
    Resolution
} from './types';
import { getStudioAuthToken } from '../../../lib/contentStudioFeatures';
import { toast } from 'sonner';

interface VideoEditorSidebarProps {
    projectId: string;
    clubId?: string | null;
    activeTab: 'media' | 'text' | 'audio' | 'subtitles' | 'transitions' | 'settings';
    onTabChange: (tab: 'media' | 'text' | 'audio' | 'subtitles' | 'transitions' | 'settings') => void;
    tracks: Track[];
    clips: Clip[];
    onAddClip: (clip: Omit<Clip, 'id'>) => void;
    onUpdateClip: (clipId: string, updates: Partial<Clip>) => void;
    onDeleteClip: (clipId: string) => void;
    selectedClip: Clip | null;
    subtitles: SubtitleConfig;
    onUpdateSubtitles: (updates: Partial<SubtitleConfig>) => void;
    format: AspectRatio;
    onFormatChange: (fmt: AspectRatio) => void;
    resolution: Resolution;
    onResolutionChange: (res: Resolution) => void;
    currentTime: number;
}

export const VideoEditorSidebar: React.FC<VideoEditorSidebarProps> = ({
    projectId,
    clubId,
    activeTab,
    onTabChange,
    tracks,
    clips,
    onAddClip,
    onUpdateClip,
    onDeleteClip,
    selectedClip,
    subtitles,
    onUpdateSubtitles,
    format,
    onFormatChange,
    resolution,
    onResolutionChange,
    currentTime
}) => {
    // ── Multimedia State ──
    const [mediaItems, setMediaItems] = useState<MediaLibraryItem[]>([]);
    const [loadingMedia, setLoadingMedia] = useState(false);
    const [mediaSearch, setMediaSearch] = useState('');
    const [mediaTypeFilter, setMediaTypeFilter] = useState<'all' | 'video' | 'image' | 'audio'>('all');
    const [uploading, setUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // ── Subtitles State ──
    const [transcribing, setTranscribing] = useState(false);
    const [translating, setTranslating] = useState(false);
    const [targetLang, setTargetLang] = useState('en');
    const [showTranscript, setShowTranscript] = useState(false);

    // Cargar activos desde la Biblioteca Multimedia existente
    const fetchMediaLibrary = async () => {
        try {
            setLoadingMedia(true);
            const token = getStudioAuthToken();
            const params = new URLSearchParams();
            if (clubId) params.append('clubId', clubId);
            if (mediaTypeFilter !== 'all') params.append('type', mediaTypeFilter);
            if (mediaSearch.trim()) params.append('search', mediaSearch.trim());
            params.append('limit', '40');

            const res = await fetch(`/api/media?${params.toString()}`, {
                headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) }
            });
            if (res.ok) {
                const data = await res.json();
                setMediaItems(Array.isArray(data) ? data : []);
            }
        } catch (err) {
            console.error('[VideoEditorSidebar] Error cargando biblioteca multimedia:', err);
        } finally {
            setLoadingMedia(false);
        }
    };

    useEffect(() => {
        if (activeTab === 'media' || activeTab === 'audio') {
            fetchMediaLibrary();
        }
    }, [activeTab, mediaTypeFilter, mediaSearch, clubId]);

    // Subir archivo a la plataforma usando la infraestructura existente
    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            setUploading(true);
            const token = getStudioAuthToken();
            const formData = new FormData();
            formData.append('file', file);
            if (clubId) formData.append('clubId', clubId);
            formData.append('sourceType', 'editor');
            formData.append('sourceId', projectId);
            formData.append('sourceLabel', `Editor de Video — ${file.name}`);

            const res = await fetch('/api/media/upload', {
                method: 'POST',
                headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                body: formData
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.error || 'Fallo en la subida');
            }

            const data = await res.json();
            toast.success('Archivo subido y disponible en la Biblioteca Multimedia');
            fetchMediaLibrary();

            // Auto-agregar a la línea de tiempo
            const isVideo = file.type.startsWith('video/');
            const isAudio = file.type.startsWith('audio/');
            const isImg = file.type.startsWith('image/');

            let targetTrackId = tracks.find(t => t.type === 'video')?.id || 'track-video-main';
            if (isAudio) targetTrackId = tracks.find(t => t.type === 'audio')?.id || 'track-music';

            onAddClip({
                trackId: targetTrackId,
                type: isVideo ? 'video' : isAudio ? 'audio' : 'image',
                name: file.name,
                url: data.fileUrl || data.url,
                startTime: currentTime,
                duration: isImg ? 5 : 8,
                volume: 100
            });
        } catch (err: any) {
            console.error('[VideoEditorSidebar] Error subiendo archivo:', err);
            toast.error(`Error al subir: ${err.message}`);
        } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    // Añadir recurso de la biblioteca a la línea de tiempo
    const handleAddMediaToTimeline = (item: MediaLibraryItem) => {
        let clipType: 'video' | 'image' | 'audio' = 'image';
        let targetTrackId = tracks.find(t => t.type === 'video')?.id || 'track-video-main';

        if (item.type === 'video') {
            clipType = 'video';
            targetTrackId = tracks.find(t => t.type === 'video')?.id || 'track-video-main';
        } else if (item.type === 'audio') {
            clipType = 'audio';
            targetTrackId = tracks.find(t => t.type === 'audio')?.id || 'track-music';
        }

        onAddClip({
            trackId: targetTrackId,
            type: clipType,
            name: item.filename,
            url: item.url,
            startTime: currentTime,
            duration: clipType === 'image' ? 5 : 8,
            volume: 100
        });

        toast.success(`Añadido a la línea de tiempo en ${currentTime.toFixed(1)}s`);
    };

    // Generar subtítulos automáticos con IA
    const handleGenerateSubtitles = async () => {
        // Buscar algún clip de video o audio en el proyecto para transcribir
        const voiceClip = clips.find(c => (c.type === 'video' || c.type === 'audio') && c.url);
        if (!voiceClip || !voiceClip.url) {
            toast.error('Agrega primero un clip de video o audio con voz para generar subtítulos.');
            return;
        }

        try {
            setTranscribing(true);
            const token = getStudioAuthToken();
            const res = await fetch(`/api/video-editor/projects/${projectId}/transcribe`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {})
                },
                body: JSON.stringify({ mediaUrl: voiceClip.url })
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.error || 'Error al transcribir');
            }

            const data = await res.json();
            if (Array.isArray(data.segments) && data.segments.length > 0) {
                onUpdateSubtitles({
                    segments: data.segments,
                    originalSegments: data.segments,
                    transcript: data.transcript,
                    language: data.language
                });
                toast.success(`¡Generados ${data.segments.length} subtítulos con IA!`);
            } else {
                toast.info('No se detectaron diálogos claros en el audio analizado.');
            }
        } catch (err: any) {
            console.error('[VideoEditorSidebar] Subtitles error:', err);
            toast.error(`Error de transcripción: ${err.message}`);
        } finally {
            setTranscribing(false);
        }
    };

    // Traducir subtítulos con IA
    const handleTranslateSubtitles = async () => {
        if (!subtitles.segments || subtitles.segments.length === 0) {
            toast.error('No hay subtítulos para traducir. Genera primero los subtítulos originales.');
            return;
        }

        try {
            setTranslating(true);
            const token = getStudioAuthToken();
            const res = await fetch(`/api/video-editor/projects/${projectId}/translate-subtitles`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {})
                },
                body: JSON.stringify({
                    targetLang,
                    segments: subtitles.segments
                })
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.error || 'Error al traducir');
            }

            const data = await res.json();
            if (Array.isArray(data.segments)) {
                onUpdateSubtitles({
                    segments: data.segments,
                    language: data.targetLang
                });
                toast.success(`Subtítulos traducidos exitosamente al idioma seleccionado.`);
            }
        } catch (err: any) {
            console.error('[VideoEditorSidebar] Translate error:', err);
            toast.error(`Error en la traducción: ${err.message}`);
        } finally {
            setTranslating(false);
        }
    };

    return (
        <div className="flex h-full bg-gray-900 border-r border-gray-800 text-white select-none">
            {/* ── Riel Izquierdo de Iconos de Herramientas ── */}
            <div className="w-16 flex flex-col items-center py-3 bg-gray-950 border-r border-gray-800/80 gap-3">
                <button
                    onClick={() => onTabChange('media')}
                    className={`flex flex-col items-center justify-center w-12 h-12 rounded-xl text-[10px] font-bold gap-1 transition-all ${
                        activeTab === 'media'
                            ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                            : 'text-gray-400 hover:text-white hover:bg-gray-800/60'
                    }`}
                    title="Multimedia y Biblioteca"
                >
                    <FolderKanban className="w-4 h-4" />
                    <span>Medios</span>
                </button>

                <button
                    onClick={() => onTabChange('text')}
                    className={`flex flex-col items-center justify-center w-12 h-12 rounded-xl text-[10px] font-bold gap-1 transition-all ${
                        activeTab === 'text'
                            ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                            : 'text-gray-400 hover:text-white hover:bg-gray-800/60'
                    }`}
                    title="Texto y Rótulos"
                >
                    <Type className="w-4 h-4" />
                    <span>Texto</span>
                </button>

                <button
                    onClick={() => onTabChange('audio')}
                    className={`flex flex-col items-center justify-center w-12 h-12 rounded-xl text-[10px] font-bold gap-1 transition-all ${
                        activeTab === 'audio'
                            ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                            : 'text-gray-400 hover:text-white hover:bg-gray-800/60'
                    }`}
                    title="Audio y Música"
                >
                    <Music className="w-4 h-4" />
                    <span>Audio</span>
                </button>

                <button
                    onClick={() => onTabChange('subtitles')}
                    className={`flex flex-col items-center justify-center w-12 h-12 rounded-xl text-[10px] font-bold gap-1 transition-all ${
                        activeTab === 'subtitles'
                            ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                            : 'text-gray-400 hover:text-white hover:bg-gray-800/60'
                    }`}
                    title="Subtítulos IA y Traducción"
                >
                    <Subtitles className="w-4 h-4" />
                    <span>Subtítulos</span>
                </button>

                <button
                    onClick={() => onTabChange('transitions')}
                    className={`flex flex-col items-center justify-center w-12 h-12 rounded-xl text-[10px] font-bold gap-1 transition-all ${
                        activeTab === 'transitions'
                            ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                            : 'text-gray-400 hover:text-white hover:bg-gray-800/60'
                    }`}
                    title="Transiciones"
                >
                    <Layers className="w-4 h-4" />
                    <span>Transición</span>
                </button>

                <button
                    onClick={() => onTabChange('settings')}
                    className={`flex flex-col items-center justify-center w-12 h-12 rounded-xl text-[10px] font-bold gap-1 transition-all ${
                        activeTab === 'settings'
                            ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                            : 'text-gray-400 hover:text-white hover:bg-gray-800/60'
                    }`}
                    title="Ajustes del Proyecto"
                >
                    <SlidersHorizontal className="w-4 h-4" />
                    <span>Ajustes</span>
                </button>
            </div>

            {/* ── Contenido del Panel Activo ── */}
            <div className="w-80 flex flex-col h-full bg-gray-900 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-800 p-4">
                {/* 1. Panel de Multimedia */}
                {activeTab === 'media' && (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-xs font-black uppercase tracking-wider text-gray-300">
                                Biblioteca Multimedia
                            </h3>
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                disabled={uploading}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold shadow-md transition-all active:scale-95"
                            >
                                {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UploadCloud className="w-3.5 h-3.5" />}
                                <span>Subir</span>
                            </button>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*,video/*,audio/*"
                                onChange={handleFileUpload}
                                className="hidden"
                            />
                        </div>

                        {/* Buscador */}
                        <div className="relative">
                            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                            <input
                                type="text"
                                placeholder="Buscar en biblioteca..."
                                value={mediaSearch}
                                onChange={(e) => setMediaSearch(e.target.value)}
                                className="w-full bg-gray-800/90 border border-gray-700/60 text-xs text-white rounded-lg pl-8 pr-3 py-2 outline-none focus:border-indigo-500"
                            />
                        </div>

                        {/* Filtros de Tipo */}
                        <div className="flex items-center gap-1 bg-gray-800/80 p-0.5 rounded-lg border border-gray-700/50 text-[11px] font-semibold">
                            {(['all', 'video', 'image', 'audio'] as const).map(t => (
                                <button
                                    key={t}
                                    onClick={() => setMediaTypeFilter(t)}
                                    className={`flex-1 py-1 rounded capitalize transition-colors ${
                                        mediaTypeFilter === t ? 'bg-indigo-600 text-white shadow' : 'text-gray-400 hover:text-white'
                                    }`}
                                >
                                    {t === 'all' ? 'Todos' : t === 'video' ? 'Videos' : t === 'image' ? 'Fotos' : 'Audios'}
                                </button>
                            ))}
                        </div>

                        {/* Cuadrícula de Archivos */}
                        {loadingMedia ? (
                            <div className="flex flex-col items-center justify-center py-12 text-gray-500 gap-2">
                                <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
                                <span className="text-xs">Cargando biblioteca...</span>
                            </div>
                        ) : mediaItems.length === 0 ? (
                            <div className="text-center py-10 px-4 border border-dashed border-gray-800 rounded-xl text-gray-500">
                                <p className="text-xs">No se encontraron archivos en este filtro.</p>
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    className="mt-3 text-xs font-bold text-indigo-400 hover:underline"
                                >
                                    Subir nuevo archivo
                                </button>
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 gap-2.5">
                                {mediaItems.map(item => (
                                    <div
                                        key={item.id}
                                        className="group relative rounded-lg bg-gray-800 border border-gray-700/60 overflow-hidden hover:border-indigo-500 transition-all shadow-sm"
                                    >
                                        <div className="aspect-video bg-gray-950 relative flex items-center justify-center overflow-hidden">
                                            {item.type === 'video' ? (
                                                item.thumbUrl ? (
                                                    <img src={item.thumbUrl} alt={item.filename} className="w-full h-full object-cover" />
                                                ) : (
                                                    <div className="flex flex-col items-center text-gray-500">
                                                        <VideoIcon className="w-6 h-6" />
                                                    </div>
                                                )
                                            ) : item.type === 'image' ? (
                                                <img src={item.thumbUrl || item.url} alt={item.filename} className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="flex flex-col items-center text-gray-500">
                                                    <Music className="w-6 h-6" />
                                                </div>
                                            )}

                                            {/* Badge tipo */}
                                            <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-black/70 text-[9px] font-bold uppercase text-gray-300">
                                                {item.type}
                                            </span>

                                            {/* Botón flotante para añadir a línea de tiempo */}
                                            <button
                                                onClick={() => handleAddMediaToTimeline(item)}
                                                className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white"
                                                title="Añadir a la línea de tiempo"
                                            >
                                                <div className="p-2 bg-indigo-600 rounded-full shadow-lg hover:scale-110 transition-transform">
                                                    <Plus className="w-4 h-4" />
                                                </div>
                                            </button>
                                        </div>
                                        <div className="p-1.5 truncate">
                                            <p className="text-[11px] font-medium text-gray-300 truncate" title={item.filename}>
                                                {item.filename}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* 2. Panel de Texto */}
                {activeTab === 'text' && (
                    <div className="space-y-4">
                        <h3 className="text-xs font-black uppercase tracking-wider text-gray-300">
                            Estilos de Texto
                        </h3>

                        <div className="space-y-2">
                            <button
                                onClick={() => onAddClip({
                                    trackId: tracks.find(t => t.type === 'text')?.id || 'track-text',
                                    type: 'text',
                                    name: 'Título Principal',
                                    text: 'TÍTULO DEL VIDEO',
                                    startTime: currentTime,
                                    duration: 4,
                                    style: { fontSize: 36, color: '#FFFFFF', fontWeight: 'bold', align: 'center', backgroundColor: 'transparent' }
                                })}
                                className="w-full p-3 bg-gray-800 hover:bg-gray-750 border border-gray-700/60 rounded-xl text-left transition-colors group flex items-center justify-between"
                            >
                                <div>
                                    <p className="text-sm font-black text-white group-hover:text-indigo-400">Título Grande</p>
                                    <p className="text-[10px] text-gray-400">Texto destacado y encabezado</p>
                                </div>
                                <Plus className="w-4 h-4 text-gray-500 group-hover:text-white" />
                            </button>

                            <button
                                onClick={() => onAddClip({
                                    trackId: tracks.find(t => t.type === 'text')?.id || 'track-text',
                                    type: 'text',
                                    name: 'Subtítulo',
                                    text: 'Subtítulo informativo',
                                    startTime: currentTime,
                                    duration: 4,
                                    style: { fontSize: 24, color: '#FFFFFF', fontWeight: 'normal', align: 'center', backgroundColor: 'rgba(0,0,0,0.6)' }
                                })}
                                className="w-full p-3 bg-gray-800 hover:bg-gray-750 border border-gray-700/60 rounded-xl text-left transition-colors group flex items-center justify-between"
                            >
                                <div>
                                    <p className="text-xs font-bold text-white group-hover:text-indigo-400">Caja con Fondo</p>
                                    <p className="text-[10px] text-gray-400">Píldora semitransparente legible</p>
                                </div>
                                <Plus className="w-4 h-4 text-gray-500 group-hover:text-white" />
                            </button>

                            <button
                                onClick={() => onAddClip({
                                    trackId: tracks.find(t => t.type === 'text')?.id || 'track-text',
                                    type: 'text',
                                    name: 'Rótulo Inferior',
                                    text: 'Nombre / Cargo institucional',
                                    startTime: currentTime,
                                    duration: 4,
                                    style: { fontSize: 20, color: '#FBBF24', fontWeight: 'bold', align: 'left', y: 35 }
                                })}
                                className="w-full p-3 bg-gray-800 hover:bg-gray-750 border border-gray-700/60 rounded-xl text-left transition-colors group flex items-center justify-between"
                            >
                                <div>
                                    <p className="text-xs font-bold text-amber-400">Rótulo / Tercio Inferior</p>
                                    <p className="text-[10px] text-gray-400">Ideal para nombres y créditos</p>
                                </div>
                                <Plus className="w-4 h-4 text-gray-500 group-hover:text-white" />
                            </button>
                        </div>

                        {/* Editor de clip de texto seleccionado */}
                        {selectedClip && selectedClip.type === 'text' && (
                            <div className="mt-6 pt-4 border-t border-gray-800 space-y-3">
                                <h4 className="text-xs font-bold text-indigo-400 flex items-center gap-1.5">
                                    <Type className="w-3.5 h-3.5" />
                                    <span>Editar Texto Seleccionado</span>
                                </h4>

                                <div>
                                    <label className="text-[10px] font-bold text-gray-400 uppercase">Contenido</label>
                                    <textarea
                                        rows={2}
                                        value={selectedClip.text || ''}
                                        onChange={(e) => onUpdateClip(selectedClip.id, { text: e.target.value })}
                                        className="w-full mt-1 bg-gray-800 border border-gray-700 rounded-lg p-2 text-xs text-white outline-none focus:border-indigo-500"
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <label className="text-[10px] font-bold text-gray-400 uppercase">Tamaño</label>
                                        <input
                                            type="number"
                                            value={selectedClip.style?.fontSize || 28}
                                            onChange={(e) => onUpdateClip(selectedClip.id, {
                                                style: { ...selectedClip.style, fontSize: Number(e.target.value) }
                                            })}
                                            className="w-full mt-1 bg-gray-800 border border-gray-700 rounded-lg p-1.5 text-xs text-white outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-gray-400 uppercase">Color</label>
                                        <div className="flex items-center gap-1.5 mt-1">
                                            <input
                                                type="color"
                                                value={selectedClip.style?.color || '#FFFFFF'}
                                                onChange={(e) => onUpdateClip(selectedClip.id, {
                                                    style: { ...selectedClip.style, color: e.target.value }
                                                })}
                                                className="w-7 h-7 rounded border-0 cursor-pointer bg-transparent"
                                            />
                                            <span className="text-[11px] font-mono text-gray-400">{selectedClip.style?.color || '#FFFFFF'}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* 3. Panel de Audio */}
                {activeTab === 'audio' && (
                    <div className="space-y-4">
                        <h3 className="text-xs font-black uppercase tracking-wider text-gray-300">
                            Pistas y Sonido
                        </h3>

                        {selectedClip && selectedClip.type === 'audio' ? (
                            <div className="p-3 bg-gray-800 border border-gray-700 rounded-xl space-y-3">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold text-white truncate">{selectedClip.name}</span>
                                    <button
                                        onClick={() => onUpdateClip(selectedClip.id, { muted: !selectedClip.muted })}
                                        className="text-gray-400 hover:text-white"
                                    >
                                        {selectedClip.muted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
                                    </button>
                                </div>

                                <div>
                                    <div className="flex justify-between text-[11px] text-gray-400 mb-1">
                                        <span>Volumen</span>
                                        <span className="font-bold text-white">{selectedClip.muted ? '0%' : `${selectedClip.volume ?? 100}%`}</span>
                                    </div>
                                    <input
                                        type="range"
                                        min="0"
                                        max="200"
                                        disabled={selectedClip.muted}
                                        value={selectedClip.volume ?? 100}
                                        onChange={(e) => onUpdateClip(selectedClip.id, { volume: Number(e.target.value) })}
                                        className="w-full accent-indigo-500 cursor-pointer"
                                    />
                                </div>
                            </div>
                        ) : (
                            <p className="text-xs text-gray-400">
                                Selecciona un clip de audio o video en la línea de tiempo para calibrar su volumen y balance sonoro.
                            </p>
                        )}

                        <div className="pt-3 border-t border-gray-800">
                            <h4 className="text-[11px] font-bold text-gray-400 uppercase mb-2">Pistas de Audio en la Biblioteca</h4>
                            <div className="space-y-1.5">
                                {mediaItems.filter(m => m.type === 'audio').map(item => (
                                    <div
                                        key={item.id}
                                        className="p-2.5 rounded-lg bg-gray-800/80 hover:bg-gray-800 flex items-center justify-between border border-gray-700/50"
                                    >
                                        <div className="flex items-center gap-2 truncate">
                                            <Music className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                                            <span className="text-xs text-gray-200 truncate">{item.filename}</span>
                                        </div>
                                        <button
                                            onClick={() => handleAddMediaToTimeline(item)}
                                            className="p-1 hover:bg-indigo-600 rounded text-gray-400 hover:text-white transition-colors"
                                            title="Agregar audio"
                                        >
                                            <Plus className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* 4. Panel de Subtítulos IA */}
                {activeTab === 'subtitles' && (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-xs font-black uppercase tracking-wider text-gray-300 flex items-center gap-1.5">
                                <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                                <span>Subtítulos con IA</span>
                            </h3>
                            {subtitles.language && (
                                <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-indigo-900/60 text-indigo-300 border border-indigo-700/60">
                                    {subtitles.language}
                                </span>
                            )}
                        </div>

                        {/* Botón Generar Subtítulos con IA */}
                        <button
                            onClick={handleGenerateSubtitles}
                            disabled={transcribing}
                            className="w-full py-2.5 px-4 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2 transition-all active:scale-95"
                        >
                            {transcribing ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    <span>Escuchando y transcribiendo voz...</span>
                                </>
                            ) : (
                                <>
                                    <Sparkles className="w-4 h-4" />
                                    <span>Generar subtítulos con IA</span>
                                </>
                            )}
                        </button>

                        {/* Traducir Subtítulos */}
                        {subtitles.segments && subtitles.segments.length > 0 && (
                            <div className="p-3 bg-gray-800/80 border border-gray-700/60 rounded-xl space-y-2.5">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold text-gray-200 flex items-center gap-1.5">
                                        <Languages className="w-3.5 h-3.5 text-purple-400" />
                                        <span>Traducir subtítulos</span>
                                    </span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <select
                                        value={targetLang}
                                        onChange={(e) => setTargetLang(e.target.value)}
                                        className="flex-1 bg-gray-900 border border-gray-700 text-xs text-white rounded-lg px-2.5 py-1.5 outline-none"
                                    >
                                        <option value="en">Inglés (English)</option>
                                        <option value="es">Español</option>
                                        <option value="fr">Francés (Français)</option>
                                        <option value="pt">Portugués (Português)</option>
                                        <option value="de">Alemán (Deutsch)</option>
                                        <option value="it">Italiano</option>
                                    </select>
                                    <button
                                        onClick={handleTranslateSubtitles}
                                        disabled={translating}
                                        className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-all shadow"
                                    >
                                        {translating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Traducir'}
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Lista de Segmentos Editables */}
                        {subtitles.segments && subtitles.segments.length > 0 ? (
                            <div className="space-y-2">
                                <div className="flex items-center justify-between text-[11px] font-bold text-gray-400">
                                    <span>Segmentos ({subtitles.segments.length})</span>
                                    <button
                                        onClick={() => {
                                            const newSeg: SubtitleSegment = {
                                                id: `sub-${Date.now()}`,
                                                start: currentTime,
                                                end: currentTime + 3,
                                                text: 'Nuevo subtítulo'
                                            };
                                            onUpdateSubtitles({
                                                segments: [...subtitles.segments, newSeg].sort((a, b) => a.start - b.start)
                                            });
                                        }}
                                        className="text-indigo-400 hover:underline flex items-center gap-1"
                                    >
                                        <Plus className="w-3 h-3" />
                                        <span>Agregar</span>
                                    </button>
                                </div>

                                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                                    {subtitles.segments.map((seg, idx) => (
                                        <div
                                            key={seg.id || idx}
                                            className="p-2.5 bg-gray-800 border border-gray-700/60 rounded-lg space-y-1.5"
                                        >
                                            <div className="flex items-center justify-between text-[10px] text-gray-400">
                                                <div className="flex items-center gap-1 font-mono">
                                                    <span>{seg.start.toFixed(1)}s</span>
                                                    <span>→</span>
                                                    <span>{seg.end.toFixed(1)}s</span>
                                                </div>
                                                <button
                                                    onClick={() => {
                                                        const filtered = subtitles.segments.filter((_, i) => i !== idx);
                                                        onUpdateSubtitles({ segments: filtered });
                                                    }}
                                                    className="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-rose-400 transition-colors"
                                                    title="Eliminar segmento"
                                                >
                                                    <Trash2 className="w-3 h-3" />
                                                </button>
                                            </div>
                                            <input
                                                type="text"
                                                value={seg.text}
                                                onChange={(e) => {
                                                    const updated = [...subtitles.segments];
                                                    updated[idx] = { ...seg, text: e.target.value };
                                                    onUpdateSubtitles({ segments: updated });
                                                }}
                                                className="w-full bg-gray-900 border border-gray-700/70 rounded px-2 py-1 text-xs text-white outline-none focus:border-indigo-500"
                                            />
                                        </div>
                                    ))}
                                </div>

                                {/* Transcripción completa en acordeón */}
                                {subtitles.transcript && (
                                    <div className="pt-2 border-t border-gray-800">
                                        <button
                                            onClick={() => setShowTranscript(!showTranscript)}
                                            className="w-full flex items-center justify-between text-xs font-bold text-gray-400 hover:text-white"
                                        >
                                            <span className="flex items-center gap-1.5">
                                                <FileText className="w-3.5 h-3.5" />
                                                <span>Transcripción Completa</span>
                                            </span>
                                            {showTranscript ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                        </button>
                                        {showTranscript && (
                                            <div className="mt-2 p-2.5 bg-gray-950 rounded-lg text-xs text-gray-300 leading-relaxed font-sans max-h-40 overflow-y-auto border border-gray-800">
                                                {subtitles.transcript}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="text-center py-8 text-gray-500 border border-dashed border-gray-800 rounded-xl px-4">
                                <Subtitles className="w-8 h-8 mx-auto mb-2 opacity-40 text-indigo-400" />
                                <p className="text-xs">
                                    Genera subtítulos automáticos con IA para sincronizar la voz con la línea de tiempo.
                                </p>
                            </div>
                        )}
                    </div>
                )}

                {/* 5. Panel de Transiciones */}
                {activeTab === 'transitions' && (
                    <div className="space-y-4">
                        <h3 className="text-xs font-black uppercase tracking-wider text-gray-300">
                            Transiciones
                        </h3>
                        <p className="text-xs text-gray-400">
                            Aplica transiciones dinámicas entre los clips de tu línea de tiempo.
                        </p>

                        <div className="space-y-2">
                            {[
                                { key: 'fade', label: 'Fundido a negro', desc: 'Fundido suave y sutil' },
                                { key: 'dissolve', label: 'Disolución cruzada', desc: 'Transición continua fluida' },
                                { key: 'slide_left', label: 'Desplazamiento Izquierda', desc: 'Movimiento horizontal dinámico' },
                                { key: 'slide_right', label: 'Desplazamiento Derecha', desc: 'Movimiento horizontal suave' },
                                { key: 'zoom_in', label: 'Zoom Suave', desc: 'Acercamiento cinemático' }
                            ].map(tr => (
                                <button
                                    key={tr.key}
                                    onClick={() => {
                                        if (selectedClip) {
                                            onUpdateClip(selectedClip.id, {
                                                transition: { type: tr.key as any, duration: 0.5 }
                                            });
                                            toast.success(`Transición '${tr.label}' aplicada a ${selectedClip.name}`);
                                        } else {
                                            toast.info('Selecciona un clip en la línea de tiempo para aplicarle la transición.');
                                        }
                                    }}
                                    className="w-full p-3 bg-gray-800 hover:bg-gray-750 border border-gray-700/60 rounded-xl text-left transition-colors flex items-center justify-between group"
                                >
                                    <div>
                                        <p className="text-xs font-bold text-white group-hover:text-indigo-400">{tr.label}</p>
                                        <p className="text-[10px] text-gray-400">{tr.desc}</p>
                                    </div>
                                    <Plus className="w-4 h-4 text-gray-500 group-hover:text-white" />
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* 6. Panel de Ajustes del Proyecto */}
                {activeTab === 'settings' && (
                    <div className="space-y-4">
                        <h3 className="text-xs font-black uppercase tracking-wider text-gray-300">
                            Configuración del Proyecto
                        </h3>

                        <div className="space-y-3">
                            <div>
                                <label className="text-xs font-bold text-gray-400 uppercase">Formato / Relación</label>
                                <div className="grid grid-cols-3 gap-2 mt-1.5">
                                    {(['16:9', '9:16', '1:1'] as const).map(f => (
                                        <button
                                            key={f}
                                            onClick={() => onFormatChange(f)}
                                            className={`py-2 px-2 rounded-xl text-xs font-bold border transition-all ${
                                                format === f
                                                    ? 'bg-indigo-600 border-indigo-500 text-white shadow-md'
                                                    : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-600'
                                            }`}
                                        >
                                            {f}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label className="text-xs font-bold text-gray-400 uppercase">Resolución de Exportación</label>
                                <div className="grid grid-cols-2 gap-2 mt-1.5">
                                    {(['1080p', '720p'] as const).map(r => (
                                        <button
                                            key={r}
                                            onClick={() => onResolutionChange(r)}
                                            className={`py-2 px-2 rounded-xl text-xs font-bold border transition-all ${
                                                resolution === r
                                                    ? 'bg-indigo-600 border-indigo-500 text-white shadow-md'
                                                    : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-600'
                                            }`}
                                        >
                                            {r === '1080p' ? '1080p Full HD' : '720p HD'}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
