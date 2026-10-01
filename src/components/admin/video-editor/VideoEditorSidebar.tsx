// ════════════════════════════════════════════════════════════════════════════
// Panel Lateral de Herramientas del Editor de Video (Tema Claro) — v4.1143.0
//
// Organización profesional tipo CapCut en estética clara de Club Platform:
// - Riel de herramientas: Multimedia, Texto, Audio, Subtítulos IA, Transiciones, Ajustes
// - Integración directa de la Biblioteca Multimedia (/api/media) y carga de archivos S3
// - Generación y traducción de subtítulos inteligentes con IA (Whisper / Gemini)
// - Colapsable para maximizar el área de canvas
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
    ChevronDown,
    ChevronUp,
    ChevronLeft,
    Video as VideoIcon,
    Image as ImageIcon,
    AlertCircle,
    RefreshCw
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
    isCollapsed?: boolean;
    onToggleCollapse?: () => void;
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
    currentTime,
    isCollapsed,
    onToggleCollapse
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
    const [transcribeStage, setTranscribeStage] = useState<'idle' | 'preparing' | 'extracting' | 'transcribing' | 'syncing' | 'completed' | 'error'>('idle');
    const [transcribeStageText, setTranscribeStageText] = useState('');
    const [transcribeError, setTranscribeError] = useState<{ message: string; code?: string } | null>(null);
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

            const res = await fetch('/api/media/upload', {
                method: 'POST',
                headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                body: formData
            });

            if (!res.ok) throw new Error('Error al subir el archivo');
            const data = await res.json();
            toast.success('Archivo subido con éxito');
            fetchMediaLibrary();

            // Agregar de inmediato a la línea de tiempo
            const isVideo = file.type.startsWith('video');
            const isAudio = file.type.startsWith('audio');
            const isImage = file.type.startsWith('image');

            let trackType: 'video' | 'audio' = isAudio ? 'audio' : 'video';
            let targetTrack = tracks.find(t => t.type === trackType);

            onAddClip({
                trackId: targetTrack?.id || (trackType === 'video' ? 'track-video-main' : 'track-audio-1'),
                type: isVideo ? 'video' : isAudio ? 'audio' : 'image',
                name: file.name,
                url: data.url || data.media?.url,
                startTime: currentTime,
                duration: isImage ? 5 : 8,
                volume: 100
            });
        } catch (err: any) {
            console.error('[VideoEditorSidebar] Error subiendo archivo:', err);
            toast.error(err.message || 'Error al subir archivo');
        } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    // Agregar un elemento multimedia a la línea de tiempo
    const handleAddMediaToTimeline = (item: MediaLibraryItem) => {
        const isAudio = item.type === 'audio';
        const isVideo = item.type === 'video';
        const isImage = item.type === 'image';

        const trackType = isAudio ? 'audio' : 'video';
        const targetTrack = tracks.find(t => t.type === trackType);

        onAddClip({
            trackId: targetTrack?.id || (isAudio ? 'track-audio-1' : 'track-video-main'),
            type: isVideo ? 'video' : isAudio ? 'audio' : 'image',
            name: item.filename,
            url: item.url,
            startTime: currentTime,
            duration: isImage ? 5 : 10,
            volume: 100
        });

        toast.success(`'${item.filename}' agregado a la línea de tiempo`);
    };

    // Transcripción automática de audio con IA (Whisper / Gemini)
    const handleGenerateSubtitles = async () => {
        // Priorizar el clip seleccionado si es de tipo video o audio; de lo contrario buscar el primero disponible
        let targetClip = selectedClip && (selectedClip.type === 'video' || selectedClip.type === 'audio') && selectedClip.url
            ? selectedClip
            : null;

        if (!targetClip) {
            targetClip = clips.find(c => (c.type === 'video' || c.type === 'audio') && c.url) || null;
        }

        if (!targetClip || !targetClip.url) {
            toast.error('Agrega o selecciona un video o audio con voz en la línea de tiempo primero');
            return;
        }

        setTranscribing(true);
        setTranscribeError(null);
        setTranscribeStage('preparing');
        setTranscribeStageText('Preparando video…');

        const timer1 = setTimeout(() => {
            setTranscribeStage('extracting');
            setTranscribeStageText('Extrayendo audio…');
        }, 1600);

        const timer2 = setTimeout(() => {
            setTranscribeStage('transcribing');
            setTranscribeStageText('Transcribiendo audio con IA…');
        }, 3600);

        const timer3 = setTimeout(() => {
            setTranscribeStage('syncing');
            setTranscribeStageText('Sincronizando subtítulos…');
        }, 7200);

        try {
            const token = getStudioAuthToken();
            const res = await fetch(`/api/video-editor/projects/${projectId}/subtitles`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {})
                },
                body: JSON.stringify({
                    mediaUrl: targetClip.url,
                    clipId: targetClip.id,
                    clipStartTime: targetClip.startTime || 0,
                    clipDuration: targetClip.duration,
                    language: 'es'
                })
            });

            clearTimeout(timer1);
            clearTimeout(timer2);
            clearTimeout(timer3);

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                const code = errData.errorCode || 'TRANSCRIPTION_PROVIDER_ERROR';
                let friendlyMsg = errData.error || 'Error al generar subtítulos con IA';

                if (code === 'SUBTITLE_SOURCE_NOT_FOUND') {
                    friendlyMsg = 'No pudimos acceder al archivo de video en el almacenamiento.';
                } else if (code === 'AUDIO_EXTRACTION_FAILED') {
                    friendlyMsg = 'No se detectó audio extraíble en este video.';
                } else if (code === 'MISSING_AI_CREDENTIALS') {
                    friendlyMsg = 'No hay credenciales activas de IA para transcripción. Configura una API key en Integraciones → Modelos IA.';
                } else if (code === 'TRANSCRIPTION_TIMEOUT') {
                    friendlyMsg = 'La transcripción tardó demasiado. Inténtalo nuevamente.';
                } else if (code === 'UNSUPPORTED_MEDIA') {
                    friendlyMsg = 'El formato del archivo multimedia no es compatible para transcripción.';
                } else if (code === 'FILE_TOO_LARGE') {
                    friendlyMsg = 'El archivo de video es demasiado pesado para transcribirse directamente.';
                } else if (code === 'TRANSCRIPTION_PROVIDER_ERROR') {
                    friendlyMsg = 'El servicio de transcripción no está disponible temporalmente.';
                }

                setTranscribeStage('error');
                setTranscribeError({ message: friendlyMsg, code });
                toast.error(friendlyMsg);
                return;
            }

            const data = await res.json();
            const subtitleData = data.subtitles || data.data || data;

            setTranscribeStage('syncing');
            setTranscribeStageText('Sincronizando subtítulos…');

            if (subtitleData.segments && subtitleData.segments.length > 0) {
                onUpdateSubtitles({
                    segments: subtitleData.segments,
                    transcript: subtitleData.transcript,
                    language: subtitleData.language || 'es'
                });
                setTranscribeStage('completed');
                setTranscribeStageText('Subtítulos generados');
                toast.success(`¡${subtitleData.segments.length} subtítulos generados con IA!`);
                setTimeout(() => {
                    setTranscribeStage('idle');
                    setTranscribeStageText('');
                }, 2200);
            } else {
                setTranscribeStage('idle');
                setTranscribeStageText('');
                toast.info('No se detectó voz clara en el archivo multimedia');
            }
        } catch (err: any) {
            clearTimeout(timer1);
            clearTimeout(timer2);
            clearTimeout(timer3);
            console.error('[VideoEditorSidebar] Subtitles error:', err);
            const msg = err.message || 'Error al generar subtítulos con IA';
            setTranscribeStage('error');
            setTranscribeError({ message: msg });
            toast.error(msg);
        } finally {
            setTranscribing(false);
        }
    };

    // Traducción de subtítulos con IA
    const handleTranslateSubtitles = async () => {
        if (!subtitles.segments || subtitles.segments.length === 0) {
            toast.error('No hay subtítulos para traducir');
            return;
        }

        try {
            setTranslating(true);
            const token = getStudioAuthToken();
            const res = await fetch(`/api/video-editor/projects/${projectId}/subtitles/translate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {})
                },
                body: JSON.stringify({
                    segments: subtitles.segments,
                    targetLang: targetLang,
                    targetLanguage: targetLang
                })
            });

            if (!res.ok) throw new Error('Error al traducir subtítulos');
            const data = await res.json();
            const translatedSegments = data.segments || data.data || [];

            if (translatedSegments.length > 0) {
                onUpdateSubtitles({
                    segments: translatedSegments,
                    language: targetLang
                });
                toast.success(`Subtítulos traducidos a ${targetLang.toUpperCase()}`);
            }
        } catch (err: any) {
            console.error('[VideoEditorSidebar] Translate error:', err);
            toast.error(err.message || 'Error en traducción');
        } finally {
            setTranslating(false);
        }
    };

    const handleSelectTab = (tab: typeof activeTab) => {
        onTabChange(tab);
        if (isCollapsed && onToggleCollapse) {
            onToggleCollapse();
        }
    };

    return (
        <div className="flex h-full select-none shrink-0 z-10">
            {/* ── Riel Vertical de Herramientas (14 unidades de Tailwind = 56px) ── */}
            <div className="w-14 bg-slate-50 border-r border-gray-200 flex flex-col items-center py-3 gap-2.5 shrink-0 shadow-xs">
                <button
                    onClick={() => handleSelectTab('media')}
                    className={`flex flex-col items-center justify-center w-11 h-11 rounded-xl text-[10px] font-bold gap-1 transition-all ${
                        activeTab === 'media' && !isCollapsed
                            ? 'bg-[#013388] text-white shadow-xs font-bold'
                            : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
                    }`}
                    title="Biblioteca Multimedia"
                >
                    <FolderKanban className="w-4 h-4" />
                    <span className="text-[9px]">Media</span>
                </button>

                <button
                    onClick={() => handleSelectTab('text')}
                    className={`flex flex-col items-center justify-center w-11 h-11 rounded-xl text-[10px] font-bold gap-1 transition-all ${
                        activeTab === 'text' && !isCollapsed
                            ? 'bg-[#013388] text-white shadow-xs font-bold'
                            : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
                    }`}
                    title="Texto y Títulos"
                >
                    <Type className="w-4 h-4" />
                    <span className="text-[9px]">Texto</span>
                </button>

                <button
                    onClick={() => handleSelectTab('audio')}
                    className={`flex flex-col items-center justify-center w-11 h-11 rounded-xl text-[10px] font-bold gap-1 transition-all ${
                        activeTab === 'audio' && !isCollapsed
                            ? 'bg-[#013388] text-white shadow-xs font-bold'
                            : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
                    }`}
                    title="Audio y Música"
                >
                    <Music className="w-4 h-4" />
                    <span className="text-[9px]">Audio</span>
                </button>

                <button
                    onClick={() => handleSelectTab('subtitles')}
                    className={`flex flex-col items-center justify-center w-11 h-11 rounded-xl text-[10px] font-bold gap-1 transition-all ${
                        activeTab === 'subtitles' && !isCollapsed
                            ? 'bg-[#013388] text-white shadow-xs font-bold'
                            : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
                    }`}
                    title="Subtítulos IA y Traducción"
                >
                    <Subtitles className="w-4 h-4" />
                    <span className="text-[9px]">Subtítulos</span>
                </button>

                <button
                    onClick={() => handleSelectTab('transitions')}
                    className={`flex flex-col items-center justify-center w-11 h-11 rounded-xl text-[10px] font-bold gap-1 transition-all ${
                        activeTab === 'transitions' && !isCollapsed
                            ? 'bg-[#013388] text-white shadow-xs font-bold'
                            : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
                    }`}
                    title="Transiciones"
                >
                    <Layers className="w-4 h-4" />
                    <span className="text-[9px]">Efectos</span>
                </button>

                <button
                    onClick={() => handleSelectTab('settings')}
                    className={`flex flex-col items-center justify-center w-11 h-11 rounded-xl text-[10px] font-bold gap-1 transition-all ${
                        activeTab === 'settings' && !isCollapsed
                            ? 'bg-[#013388] text-white shadow-xs font-bold'
                            : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
                    }`}
                    title="Ajustes del Proyecto"
                >
                    <SlidersHorizontal className="w-4 h-4" />
                    <span className="text-[9px]">Ajustes</span>
                </button>
            </div>

            {/* ── Contenido Expandido del Panel Activo (Si no está colapsado) ── */}
            {!isCollapsed && (
                <div className="w-80 flex flex-col h-full bg-white border-r border-gray-200 overflow-y-auto p-4 text-gray-800 shadow-xs">
                    {/* Botón de contraer panel */}
                    {onToggleCollapse && (
                        <div className="flex items-center justify-between pb-2 mb-2 border-b border-gray-100">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
                                {activeTab === 'media' && 'Biblioteca'}
                                {activeTab === 'text' && 'Plantillas de Texto'}
                                {activeTab === 'audio' && 'Sonido y Pistas'}
                                {activeTab === 'subtitles' && 'Subtítulos con IA'}
                                {activeTab === 'transitions' && 'Transiciones'}
                                {activeTab === 'settings' && 'Ajustes del Proyecto'}
                            </span>
                            <button
                                onClick={onToggleCollapse}
                                className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-700"
                                title="Contraer panel"
                            >
                                <ChevronLeft className="w-4 h-4" />
                            </button>
                        </div>
                    )}

                    {/* 1. Panel de Multimedia */}
                    {activeTab === 'media' && (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <h3 className="text-xs font-bold text-gray-900">
                                    Archivos Disponibles
                                </h3>
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={uploading}
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-[#013388] hover:bg-[#002868] disabled:opacity-50 text-white rounded-lg text-xs font-bold shadow-xs transition-all active:scale-95"
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
                                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                <input
                                    type="text"
                                    placeholder="Buscar en biblioteca..."
                                    value={mediaSearch}
                                    onChange={(e) => setMediaSearch(e.target.value)}
                                    className="w-full bg-slate-50 border border-gray-200 text-xs text-gray-900 rounded-lg pl-8 pr-3 py-2 outline-none focus:bg-white focus:border-[#013388]"
                                />
                            </div>

                            {/* Filtros de Tipo */}
                            <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-gray-200 text-[11px] font-semibold">
                                {(['all', 'video', 'image', 'audio'] as const).map(t => (
                                    <button
                                        key={t}
                                        onClick={() => setMediaTypeFilter(t)}
                                        className={`flex-1 py-1 rounded-md capitalize transition-colors ${
                                            mediaTypeFilter === t ? 'bg-white text-[#013388] font-bold shadow-xs' : 'text-gray-600 hover:text-gray-900'
                                        }`}
                                    >
                                        {t === 'all' ? 'Todos' : t === 'video' ? 'Videos' : t === 'image' ? 'Fotos' : 'Audios'}
                                    </button>
                                ))}
                            </div>

                            {/* Cuadrícula de Archivos */}
                            {loadingMedia ? (
                                <div className="flex flex-col items-center justify-center py-12 text-gray-400 gap-2">
                                    <Loader2 className="w-6 h-6 animate-spin text-[#013388]" />
                                    <span className="text-xs">Cargando biblioteca...</span>
                                </div>
                            ) : mediaItems.length === 0 ? (
                                <div className="text-center py-10 px-4 border border-dashed border-gray-300 rounded-xl text-gray-500 bg-slate-50">
                                    <p className="text-xs">No se encontraron archivos en este filtro.</p>
                                    <button
                                        onClick={() => fileInputRef.current?.click()}
                                        className="mt-2 text-xs font-bold text-[#013388] hover:underline"
                                    >
                                        Subir archivo ahora
                                    </button>
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 gap-2.5">
                                    {mediaItems.map(item => (
                                        <div
                                            key={item.id}
                                            onClick={() => handleAddMediaToTimeline(item)}
                                            className="group relative bg-slate-50 hover:bg-blue-50/60 border border-gray-200 hover:border-[#013388] rounded-xl overflow-hidden cursor-pointer transition-all shadow-xs"
                                        >
                                            <div className="aspect-video bg-gray-100 flex items-center justify-center overflow-hidden relative">
                                                {item.type === 'video' ? (
                                                    item.thumbUrl ? (
                                                        <img src={item.thumbUrl} alt={item.filename} className="w-full h-full object-cover" />
                                                    ) : (
                                                        <div className="flex flex-col items-center text-gray-500">
                                                            <VideoIcon className="w-6 h-6" />
                                                            <span className="text-[9px] uppercase font-bold mt-1">Video</span>
                                                        </div>
                                                    )
                                                ) : item.type === 'image' ? (
                                                    <img src={item.url} alt={item.filename} className="w-full h-full object-cover" />
                                                ) : (
                                                    <div className="flex flex-col items-center text-gray-500">
                                                        <Music className="w-6 h-6 text-amber-500" />
                                                        <span className="text-[9px] uppercase font-bold mt-1">Audio</span>
                                                    </div>
                                                )}

                                                {/* Overlay de Agregar al Timeline al pasar el cursor */}
                                                <div className="absolute inset-0 bg-blue-900/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                                    <div className="w-8 h-8 rounded-full bg-white text-[#013388] flex items-center justify-center shadow-md">
                                                        <Plus className="w-4 h-4" />
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="p-2">
                                                <p className="text-[11px] font-semibold text-gray-800 truncate" title={item.filename}>
                                                    {item.filename}
                                                </p>
                                                <div className="flex items-center justify-between text-[10px] text-gray-500 mt-0.5">
                                                    <span className="capitalize">{item.type}</span>
                                                    {item.sourceLabel && <span className="truncate max-w-[60px]">{item.sourceLabel}</span>}
                                                </div>
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
                            <h3 className="text-xs font-bold text-gray-900">
                                Rótulos y Tipografías
                            </h3>

                            <div className="space-y-2.5">
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
                                    className="w-full p-3 bg-slate-50 hover:bg-blue-50/60 border border-gray-200 rounded-xl text-left transition-colors group flex items-center justify-between shadow-xs"
                                >
                                    <div>
                                        <p className="text-xs font-bold text-gray-900 group-hover:text-[#013388]">Título Grande</p>
                                        <p className="text-[10px] text-gray-500">Texto destacado y encabezado</p>
                                    </div>
                                    <Plus className="w-4 h-4 text-gray-400 group-hover:text-[#013388]" />
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
                                    className="w-full p-3 bg-slate-50 hover:bg-blue-50/60 border border-gray-200 rounded-xl text-left transition-colors group flex items-center justify-between shadow-xs"
                                >
                                    <div>
                                        <p className="text-xs font-bold text-gray-900 group-hover:text-[#013388]">Caja con Fondo</p>
                                        <p className="text-[10px] text-gray-500">Píldora semitransparente legible</p>
                                    </div>
                                    <Plus className="w-4 h-4 text-gray-400 group-hover:text-[#013388]" />
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
                                    className="w-full p-3 bg-slate-50 hover:bg-blue-50/60 border border-gray-200 rounded-xl text-left transition-colors group flex items-center justify-between shadow-xs"
                                >
                                    <div>
                                        <p className="text-xs font-bold text-amber-700">Rótulo / Tercio Inferior</p>
                                        <p className="text-[10px] text-gray-500">Ideal para nombres y créditos</p>
                                    </div>
                                    <Plus className="w-4 h-4 text-gray-400 group-hover:text-amber-700" />
                                </button>
                            </div>
                        </div>
                    )}

                    {/* 3. Panel de Audio */}
                    {activeTab === 'audio' && (
                        <div className="space-y-4">
                            <h3 className="text-xs font-bold text-gray-900">
                                Pistas y Sonido
                            </h3>

                            <div className="pt-2">
                                <h4 className="text-[11px] font-bold text-gray-500 uppercase mb-2">Pistas de Audio en la Biblioteca</h4>
                                <div className="space-y-2">
                                    {mediaItems.filter(m => m.type === 'audio').map(item => (
                                        <div
                                            key={item.id}
                                            className="p-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 flex items-center justify-between border border-gray-200"
                                        >
                                            <div className="flex items-center gap-2 truncate">
                                                <Music className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                                                <span className="text-xs text-gray-800 font-medium truncate">{item.filename}</span>
                                            </div>
                                            <button
                                                onClick={() => handleAddMediaToTimeline(item)}
                                                className="p-1.5 hover:bg-[#013388] rounded-lg text-gray-500 hover:text-white transition-colors"
                                                title="Agregar audio al timeline"
                                            >
                                                <Plus className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    ))}
                                    {mediaItems.filter(m => m.type === 'audio').length === 0 && (
                                        <p className="text-xs text-gray-500 italic p-3 text-center border border-dashed rounded-xl">
                                            No hay archivos de audio cargados todavía. Puedes subir pistas MP3 o WAV con el botón Subir.
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* 4. Panel de Subtítulos IA */}
                    {activeTab === 'subtitles' && (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <h3 className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                                    <Sparkles className="w-3.5 h-3.5 text-[#013388]" />
                                    <span>Subtítulos con IA</span>
                                </h3>
                                {subtitles.language && (
                                    <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-blue-50 text-[#013388] border border-blue-200">
                                        {subtitles.language}
                                    </span>
                                )}
                            </div>

                            {/* Estado y Botón Generar Subtítulos con IA */}
                            {transcribing ? (
                                <div className="w-full py-2.5 px-4 bg-blue-50 border border-blue-200 text-[#013388] rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-2xs">
                                    <Loader2 className="w-4 h-4 animate-spin text-[#013388] shrink-0" />
                                    <span className="truncate">{transcribeStageText || 'Procesando audio con IA…'}</span>
                                </div>
                            ) : (
                                <button
                                    onClick={handleGenerateSubtitles}
                                    className="w-full py-2.5 px-4 bg-[#013388] hover:bg-[#002868] text-white rounded-xl text-xs font-bold shadow-md shadow-blue-900/20 flex items-center justify-center gap-2 transition-all active:scale-95"
                                >
                                    <Sparkles className="w-4 h-4" />
                                    <span>Generar subtítulos con IA</span>
                                </button>
                            )}

                            {/* Alerta de Error con botón de Reintentar */}
                            {transcribeError && !transcribing && (
                                <div className="p-3 bg-red-50/90 border border-red-200 rounded-xl space-y-2 text-xs">
                                    <div className="flex items-start gap-2 text-red-800">
                                        <AlertCircle className="w-4 h-4 shrink-0 text-red-600 mt-0.5" />
                                        <div className="flex-1">
                                            <p className="font-semibold text-red-900 leading-tight">No se pudieron generar los subtítulos</p>
                                            <p className="text-[11px] text-red-700 mt-0.5">{transcribeError.message}</p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={handleGenerateSubtitles}
                                        className="w-full py-1.5 px-3 bg-white hover:bg-red-50 border border-red-300 text-red-700 font-bold rounded-lg text-[11px] flex items-center justify-center gap-1.5 transition-colors shadow-2xs"
                                    >
                                        <RefreshCw className="w-3 h-3" />
                                        <span>Reintentar</span>
                                    </button>
                                </div>
                            )}

                            {/* Traducir Subtítulos */}
                            {subtitles.segments && subtitles.segments.length > 0 && (
                                <div className="p-3 bg-slate-50 border border-gray-200 rounded-xl space-y-2.5">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-bold text-gray-800 flex items-center gap-1.5">
                                            <Languages className="w-3.5 h-3.5 text-purple-600" />
                                            <span>Traducir subtítulos</span>
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <select
                                            value={targetLang}
                                            onChange={(e) => setTargetLang(e.target.value)}
                                            className="flex-1 bg-white border border-gray-200 text-xs text-gray-800 rounded-lg px-2.5 py-1.5 outline-none"
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
                                            className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-all shadow-xs"
                                        >
                                            {translating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Traducir'}
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Lista de Segmentos Editables */}
                            {subtitles.segments && subtitles.segments.length > 0 ? (
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between text-[11px] font-bold text-gray-600">
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
                                            className="text-[#013388] hover:underline flex items-center gap-1 font-bold"
                                        >
                                            <Plus className="w-3 h-3" />
                                            <span>Agregar</span>
                                        </button>
                                    </div>

                                    <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                                        {subtitles.segments.map((seg, idx) => (
                                            <div
                                                key={seg.id || idx}
                                                className="p-2.5 bg-slate-50 border border-gray-200 rounded-lg space-y-1.5"
                                            >
                                                <div className="flex items-center justify-between text-[10px] text-gray-500">
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
                                                        className="p-1 hover:bg-gray-200 rounded text-gray-400 hover:text-rose-600 transition-colors"
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
                                                    className="w-full bg-white border border-gray-200 rounded px-2.5 py-1 text-xs text-gray-800 outline-none focus:border-[#013388]"
                                                />
                                            </div>
                                        ))}
                                    </div>

                                    {/* Transcripción completa en acordeón */}
                                    {subtitles.transcript && (
                                        <div className="pt-2 border-t border-gray-200">
                                            <button
                                                onClick={() => setShowTranscript(!showTranscript)}
                                                className="w-full flex items-center justify-between text-xs font-bold text-gray-600 hover:text-gray-900"
                                            >
                                                <span className="flex items-center gap-1.5">
                                                    <FileText className="w-3.5 h-3.5" />
                                                    <span>Transcripción Completa</span>
                                                </span>
                                                {showTranscript ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                            </button>
                                            {showTranscript && (
                                                <div className="mt-2 p-2.5 bg-slate-50 rounded-lg text-xs text-gray-700 leading-relaxed font-sans max-h-40 overflow-y-auto border border-gray-200">
                                                    {subtitles.transcript}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="text-center py-8 text-gray-500 border border-dashed border-gray-300 rounded-xl px-4 bg-slate-50">
                                    <Subtitles className="w-8 h-8 mx-auto mb-2 opacity-40 text-[#013388]" />
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
                            <h3 className="text-xs font-bold text-gray-900">
                                Transiciones
                            </h3>
                            <p className="text-xs text-gray-500">
                                Aplica efectos dinámicos entre los clips de tu línea de tiempo.
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
                                        className="w-full p-3 bg-slate-50 hover:bg-blue-50/60 border border-gray-200 rounded-xl text-left transition-colors flex items-center justify-between group shadow-xs"
                                    >
                                        <div>
                                            <p className="text-xs font-bold text-gray-900 group-hover:text-[#013388]">{tr.label}</p>
                                            <p className="text-[10px] text-gray-500">{tr.desc}</p>
                                        </div>
                                        <Plus className="w-4 h-4 text-gray-400 group-hover:text-[#013388]" />
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* 6. Panel de Ajustes del Proyecto */}
                    {activeTab === 'settings' && (
                        <div className="space-y-4">
                            <h3 className="text-xs font-bold text-gray-900">
                                Configuración del Proyecto
                            </h3>

                            <div className="space-y-3">
                                <div>
                                    <label className="text-xs font-bold text-gray-600 uppercase">Formato / Relación</label>
                                    <div className="grid grid-cols-3 gap-2 mt-1.5">
                                        {(['16:9', '9:16', '1:1'] as const).map(f => (
                                            <button
                                                key={f}
                                                onClick={() => onFormatChange(f)}
                                                className={`py-2 px-2 rounded-xl text-xs font-bold border transition-all ${
                                                    format === f
                                                        ? 'bg-blue-50 border-[#013388] text-[#013388] font-bold shadow-xs'
                                                        : 'bg-slate-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                                                }`}
                                            >
                                                {f}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div>
                                    <label className="text-xs font-bold text-gray-600 uppercase">Resolución de Exportación</label>
                                    <div className="grid grid-cols-2 gap-2 mt-1.5">
                                        {(['1080p', '720p'] as const).map(r => (
                                            <button
                                                key={r}
                                                onClick={() => onResolutionChange(r)}
                                                className={`py-2 px-2 rounded-xl text-xs font-bold border transition-all ${
                                                    resolution === r
                                                        ? 'bg-blue-50 border-[#013388] text-[#013388] font-bold shadow-xs'
                                                        : 'bg-slate-50 border-gray-200 text-gray-600 hover:bg-gray-100'
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
            )}
        </div>
    );
};
