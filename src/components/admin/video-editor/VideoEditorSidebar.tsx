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
import { LOCALES } from '../../../lib/locale';
import { toast } from 'sonner';
import { getSegmentText, getVisibleSubtitleSegments, normalizeLangCode, probeMediaDuration, switchSubtitleLanguage } from './timelineUtils';
import {
    TEXT_TEMPLATES,
    TEMPLATE_CATEGORIES,
    computeCssProperties,
    resolveEffectiveStyle,
    applyStyleToAllSubtitles,
    loadGoogleFont
} from './textStyleUtils';

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
    onSwitchSubtitleLanguage?: (targetLang: string) => void;
    onUpdateSubtitleSegment?: (segmentId: string, updates: Partial<SubtitleSegment>) => void;
    onDeleteSubtitleSegment?: (segmentId: string) => void;
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
    onSwitchSubtitleLanguage,
    onUpdateSubtitleSegment,
    onDeleteSubtitleSegment,
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

    // ── Text & Subtitle Templates State ──
    const [templateCategory, setTemplateCategory] = useState<string>('all');
    const [templateSearch, setTemplateSearch] = useState<string>('');

    // ── Subtitles State ──
    const [transcribing, setTranscribing] = useState(false);
    const [transcribeStage, setTranscribeStage] = useState<'idle' | 'preparing' | 'extracting' | 'transcribing' | 'syncing' | 'completed' | 'error'>('idle');
    const [transcribeStageText, setTranscribeStageText] = useState('');
    const [transcribeError, setTranscribeError] = useState<{ message: string; code?: string } | null>(null);

    const [translating, setTranslating] = useState(false);
    const [translateStage, setTranslateStage] = useState<'idle' | 'preparing' | 'translating' | 'syncing' | 'completed' | 'error'>('idle');
    const [translateStageText, setTranslateStageText] = useState('');
    const [translateError, setTranslateError] = useState<{ message: string; code?: string } | null>(null);
    const [targetLang, setTargetLang] = useState('en');
    const [showTranscript, setShowTranscript] = useState(false);

    // Helpers de Idiomas para subtítulos multilingües con normalización estricta
    const sourceLangCode = normalizeLangCode(subtitles.sourceLanguage || subtitles.language || 'es');
    const sourceLangMeta = LOCALES.find(l => l.code === sourceLangCode) || {
        code: sourceLangCode,
        name: subtitles.sourceLanguageName || sourceLangCode.toUpperCase(),
        locale: '',
        flag: ''
    };
    const activeLangCode = normalizeLangCode(subtitles.activeLanguage || subtitles.language || sourceLangCode);
    const activeLangMeta = LOCALES.find(l => l.code === activeLangCode) || {
        code: activeLangCode,
        name: activeLangCode.toUpperCase(),
        locale: '',
        flag: ''
    };

    // Si el idioma destino coincide con el activo, sugerir el primer idioma alternativo
    useEffect(() => {
        if (targetLang === activeLangCode) {
            const alternative = LOCALES.find(l => l.code !== activeLangCode);
            if (alternative) {
                setTargetLang(alternative.code);
            }
        }
    }, [activeLangCode]);

    // Única fuente de verdad del subtítulo visible (panel lateral): mismo
    // resolver central que timeline, canvas e inspector. El orden y los ids
    // se preservan 1:1 con subtitles.segments para edición/eliminación por índice.
    const visibleSegments = React.useMemo(
        () => getVisibleSubtitleSegments(subtitles),
        [subtitles]
    );

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

            const isVideo = file.type.startsWith('video');
            const isAudio = file.type.startsWith('audio');
            const isImage = file.type.startsWith('image');
            const trackType: 'video' | 'audio' = isAudio ? 'audio' : 'video';
            const targetTrack = tracks.find(t => t.type === trackType);

            // Obtener duración real del archivo multimedia mediante sondeo de metadatos
            let mediaDuration = isImage ? 5 : 10;
            if (isVideo || isAudio) {
                try {
                    mediaDuration = await probeMediaDuration(file);
                } catch {
                    mediaDuration = 10;
                }
            }

            onAddClip({
                trackId: targetTrack?.id || (trackType === 'video' ? 'track-video-main' : 'track-audio-1'),
                type: isVideo ? 'video' : isAudio ? 'audio' : 'image',
                name: file.name,
                url: data.url || data.media?.url,
                startTime: currentTime,
                duration: mediaDuration,
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

    // Agregar un elemento multimedia a la línea de tiempo con duración real investigada
    const handleAddMediaToTimeline = async (item: MediaLibraryItem) => {
        const isAudio = item.type === 'audio';
        const isVideo = item.type === 'video';
        const isImage = item.type === 'image';

        const trackType = isAudio ? 'audio' : 'video';
        const targetTrack = tracks.find(t => t.type === trackType);

        let mediaDuration = 5;
        if (isVideo || isAudio) {
            try {
                mediaDuration = await probeMediaDuration(item.url);
            } catch {
                mediaDuration = 10;
            }
        }

        onAddClip({
            trackId: targetTrack?.id || (isAudio ? 'track-audio-1' : 'track-video-main'),
            type: isVideo ? 'video' : isAudio ? 'audio' : 'image',
            name: item.filename,
            url: item.url,
            startTime: currentTime,
            duration: mediaDuration,
            volume: 100
        });

        toast.success(`'${item.filename}' agregado a la línea de tiempo (${mediaDuration.toFixed(1)}s)`);
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
                const detectedLang = subtitleData.language || 'es';
                const detectedLangMeta = LOCALES.find(l => l.code === detectedLang) || { code: detectedLang, name: detectedLang.toUpperCase() };

                onUpdateSubtitles({
                    ...subtitleData,
                    segments: subtitleData.segments,
                    transcript: subtitleData.transcript,
                    language: detectedLang,
                    sourceLanguage: subtitleData.sourceLanguage || detectedLang,
                    sourceLanguageName: subtitleData.sourceLanguageName || detectedLangMeta.name,
                    activeLanguage: subtitleData.activeLanguage || detectedLang,
                    translations: subtitleData.translations || {
                        [detectedLang]: {
                            language: detectedLang,
                            languageName: detectedLangMeta.name,
                            isOriginal: true,
                            segments: subtitleData.segments,
                            createdAt: new Date().toISOString()
                        }
                    }
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

    // Cambiar entre pistas de idioma ya generadas
    const handleSwitchLanguage = (langCode: string) => {
        if (translating) return;
        const normCode = normalizeLangCode(langCode);

        if (onSwitchSubtitleLanguage) {
            onSwitchSubtitleLanguage(normCode);
        } else {
            const nextSubs = switchSubtitleLanguage(subtitles, normCode);
            onUpdateSubtitles(nextSubs);
        }
        const lName = LOCALES.find(l => l.code === normCode)?.name || normCode.toUpperCase();
        toast.info(`Cambiado a subtítulos en ${lName}`);
    };

    // Traducción de subtítulos con IA (Bidireccional y Multilingüe)
    const handleTranslateSubtitles = async () => {
        if (translating) return;
        if (!subtitles.segments || subtitles.segments.length === 0) {
            toast.error('No hay subtítulos para traducir');
            return;
        }

        const normTarget = normalizeLangCode(targetLang);
        const normSource = normalizeLangCode(sourceLangCode);
        const targetMeta = LOCALES.find(l => l.code === normTarget) || { code: normTarget, name: normTarget.toUpperCase() };

        // Si ya existe una traducción generada para este idioma destino, cambiar de inmediato sin gastar tokens
        const hasExisting = Boolean(subtitles.translations && Object.entries(subtitles.translations).some(([k, ver]) => normalizeLangCode(k) === normTarget && (ver?.segments?.length || 0) > 0)) ||
            (subtitles.segments || []).some(s => s.translations && Object.entries(s.translations).some(([k, v]) => normalizeLangCode(k) === normTarget && typeof v === 'string' && v.trim().length > 0));

        if (hasExisting) {
            handleSwitchLanguage(normTarget);
            return;
        }

        let stageTimer: NodeJS.Timeout | null = null;
        try {
            setTranslating(true);
            setTranslateError(null);
            setTranslateStage('preparing');
            setTranslateStageText('Preparando subtítulos…');

            stageTimer = setTimeout(() => {
                setTranslateStage('translating');
                setTranslateStageText(`Traduciendo a ${targetMeta.name}…`);
            }, 600);

            const token = getStudioAuthToken();
            const res = await fetch(`/api/video-editor/projects/${projectId}/subtitles/translate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {})
                },
                body: JSON.stringify({
                    segments: subtitles.segments,
                    sourceLang: normSource,
                    sourceLanguage: normSource,
                    targetLang: normTarget,
                    targetLanguage: normTarget,
                    force: true
                })
            });

            if (stageTimer) clearTimeout(stageTimer);

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                const code = errData.errorCode || 'TRANSLATION_PROVIDER_ERROR';
                let friendlyMsg = errData.error || 'Error al traducir subtítulos';

                if (code === 'MISSING_AI_CREDENTIALS') {
                    friendlyMsg = 'No hay credenciales activas de IA para traducción. Configura una API key en Integraciones → Modelos IA.';
                } else if (code === 'TRANSLATION_TIMEOUT') {
                    friendlyMsg = 'La traducción tardó demasiado tiempo en responder. Inténtalo nuevamente.';
                } else if (code === 'EMPTY_SUBTITLE_SEGMENTS') {
                    friendlyMsg = 'No se encontraron subtítulos con texto para traducir.';
                } else if (code === 'INVALID_TARGET_LANGUAGE') {
                    friendlyMsg = 'El idioma destino seleccionado es inválido o idéntico al origen.';
                } else if (code === 'INVALID_TRANSLATION_RESPONSE') {
                    friendlyMsg = 'El proveedor de IA no devolvió un formato de subtítulos reconocible.';
                } else if (code === 'TRANSLATION_PERSISTENCE_FAILED') {
                    friendlyMsg = 'No se pudo guardar la traducción en el proyecto.';
                } else if (code === 'TRANSLATION_PROVIDER_ERROR') {
                    friendlyMsg = errData.error && !errData.error.toLowerCase().includes('key')
                        ? errData.error
                        : 'El proveedor de IA tuvo un problema temporal al procesar la traducción.';
                }

                setTranslateStage('error');
                setTranslateError({ message: friendlyMsg, code });
                toast.error(friendlyMsg);
                return;
            }

            const data = await res.json();
            setTranslateStage('syncing');
            setTranslateStageText('Sincronizando segmentos…');

            const updatedSubtitles = data.subtitles;
            const translatedSegments = data.segments || updatedSubtitles?.segments || [];

            if (translatedSegments.length > 0) {
                const segmentsWithTranslations: SubtitleSegment[] = translatedSegments.map((ts: any, idx: number) => {
                    const orig = (subtitles.segments || [])[idx] || {};
                    const trs: Record<string, string> = {};
                    if (orig.translations) {
                        for (const [k, v] of Object.entries(orig.translations)) {
                            if (typeof v === 'string') trs[normalizeLangCode(k)] = v;
                        }
                    }
                    if (ts.translations) {
                        for (const [k, v] of Object.entries(ts.translations)) {
                            if (typeof v === 'string') trs[normalizeLangCode(k)] = v;
                        }
                    }
                    trs[normSource] = trs[normSource] || orig.text || '';
                    trs[normTarget] = ts.text;
                    return {
                        ...orig,
                        ...ts,
                        text: ts.text,
                        // El estilo visual nunca viaja con el idioma: conservar el
                        // estilo vigente del segmento aunque la respuesta no lo traiga.
                        style: ts.style ?? orig.style,
                        translations: trs
                    };
                });

                const updatedTranslationsMap = {
                    ...(subtitles.translations || {}),
                    ...(updatedSubtitles?.translations || {}),
                    [normSource]: subtitles.translations?.[normSource] || {
                        language: normSource,
                        languageName: sourceLangMeta.name,
                        isOriginal: true,
                        segments: subtitles.segments
                    },
                    [normTarget]: {
                        language: normTarget,
                        languageName: targetMeta.name,
                        isOriginal: false,
                        segments: segmentsWithTranslations
                    }
                };

                const availableLangs = Array.from(new Set([
                    normSource,
                    normTarget,
                    ...Object.keys(updatedTranslationsMap).map(normalizeLangCode),
                    ...(subtitles.availableLanguages ? subtitles.availableLanguages.map(normalizeLangCode) : [])
                ]));

                // Unificar y conmutar directamente al idioma traducido preservando estilos
                const translatedConfig: SubtitleConfig = {
                    ...subtitles,
                    ...(updatedSubtitles || {}),
                    segments: segmentsWithTranslations,
                    activeLanguage: normTarget,
                    language: normTarget,
                    sourceLanguage: normSource,
                    sourceLanguageName: data.sourceLanguageName || sourceLangMeta.name,
                    availableLanguages: availableLangs,
                    translations: updatedTranslationsMap,
                    style: subtitles.style
                };
                const switchedConfig = switchSubtitleLanguage(translatedConfig, normTarget);

                // Actualizar pistas y segmentos en el estado global (switchedConfig ya tiene el idioma conmutado)
                onUpdateSubtitles(switchedConfig);

                setTranslateStage('completed');
                setTranslateStageText('Traducción completada');
                toast.success(`Subtítulos sincronizados y traducidos a ${targetMeta.name}`);
                setTimeout(() => {
                    setTranslateStage('idle');
                    setTranslateStageText('');
                    setTranslating(false);
                }, 1800);
            } else {
                setTranslateStage('idle');
                setTranslateStageText('');
                setTranslating(false);
                toast.error('No se recibieron segmentos traducidos');
            }
        } catch (err: any) {
            if (stageTimer) clearTimeout(stageTimer);
            console.error('[VideoEditorSidebar] Translate error:', err);
            const msg = err.message || 'Error al traducir subtítulos';
            setTranslateStage('error');
            setTranslateError({ message: msg });
            toast.error(msg);
            setTranslating(false);
        }
    };

    // Actualizar texto de segmento sincronizando versión de idioma activa
    const handleUpdateSegmentText = (idx: number, newText: string) => {
        const seg = subtitles.segments[idx];
        if (!seg) return;

        if (onUpdateSubtitleSegment) {
            onUpdateSubtitleSegment(seg.id, { text: newText });
            return;
        }

        const currLang = activeLangCode;
        const updated = subtitles.segments.map((s, i) => {
            if (i !== idx) return s;
            return {
                ...s,
                text: newText,
                translations: {
                    ...(s.translations || {}),
                    [currLang]: newText
                }
            };
        });

        const currentTranslations = { ...(subtitles.translations || {}) };
        if (currentTranslations[currLang]) {
            currentTranslations[currLang] = {
                ...currentTranslations[currLang],
                segments: updated,
                updatedAt: new Date().toISOString()
            };
        } else {
            currentTranslations[currLang] = {
                language: currLang,
                languageName: activeLangMeta.name,
                isOriginal: currLang === sourceLangCode,
                segments: updated,
                updatedAt: new Date().toISOString()
            };
        }

        onUpdateSubtitles({
            segments: updated,
            translations: currentTranslations
        });
    };

    // Eliminar segmento sincronizando versión de idioma activa
    const handleDeleteSegment = (idx: number) => {
        const seg = subtitles.segments[idx];
        if (seg && onDeleteSubtitleSegment) {
            onDeleteSubtitleSegment(seg.id);
            return;
        }

        const filtered = subtitles.segments.filter((_, i) => i !== idx);
        const currentTranslations = { ...(subtitles.translations || {}) };
        for (const [langKey, langObj] of Object.entries(currentTranslations)) {
            if (langObj && Array.isArray(langObj.segments)) {
                currentTranslations[langKey] = {
                    ...langObj,
                    segments: langObj.segments.filter((_, i) => i !== idx)
                };
            }
        }
        onUpdateSubtitles({
            segments: filtered,
            translations: currentTranslations
        });
    };

    // Agregar nuevo segmento sincronizando versión de idioma activa
    const handleAddSegment = () => {
        const newSeg: SubtitleSegment = {
            id: `sub-${Date.now()}`,
            start: currentTime,
            end: currentTime + 3,
            text: 'Nuevo subtítulo',
            translations: {
                [activeLangCode]: 'Nuevo subtítulo'
            }
        };
        const updated = [...subtitles.segments, newSeg].sort((a, b) => a.start - b.start);
        const currentTranslations = { ...(subtitles.translations || {}) };
        for (const [langKey, langObj] of Object.entries(currentTranslations)) {
            if (langObj && Array.isArray(langObj.segments)) {
                currentTranslations[langKey] = {
                    ...langObj,
                    segments: [...langObj.segments, {
                        ...newSeg,
                        text: langKey === activeLangCode ? 'Nuevo subtítulo' : ''
                    }].sort((a, b) => a.start - b.start)
                };
            }
        }
        onUpdateSubtitles({
            segments: updated,
            translations: currentTranslations
        });
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

                    {/* 2. Panel de Texto y Galería de Estilos */}
                    {activeTab === 'text' && (
                        <div className="space-y-4">
                            <div>
                                <h3 className="text-xs font-bold text-gray-900 flex items-center justify-between">
                                    <span>Plantillas de Texto y Estilos</span>
                                    <span className="text-[10px] text-gray-400 font-semibold">{TEXT_TEMPLATES.length} estilos</span>
                                </h3>
                                <p className="text-[11px] text-gray-500 mt-0.5 leading-relaxed">
                                    Inserta rótulos estilizados o aplica un diseño preconfigurado a los subtítulos de tu video.
                                </p>
                            </div>

                            {/* Buscador de Plantillas */}
                            <div className="relative">
                                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                <input
                                    type="text"
                                    placeholder="Buscar estilos (ej. viral, tercio, oswald)..."
                                    value={templateSearch}
                                    onChange={(e) => setTemplateSearch(e.target.value)}
                                    className="w-full bg-slate-50 border border-gray-200 text-xs text-gray-900 rounded-lg pl-8 pr-3 py-1.5 outline-none focus:bg-white focus:border-[#013388]"
                                />
                            </div>

                            {/* Categorías de Estilos: Todos | Básico | Subtítulos | Títulos | Tercio Inferior | Moderno | Redes */}
                            <div className="flex items-center gap-1 overflow-x-auto pb-1 no-scrollbar text-[11px]">
                                {TEMPLATE_CATEGORIES.map(cat => (
                                    <button
                                        key={cat.id}
                                        type="button"
                                        onClick={() => setTemplateCategory(cat.id)}
                                        className={`px-2.5 py-1 rounded-full whitespace-nowrap transition-colors font-medium ${
                                            templateCategory === cat.id
                                                ? 'bg-[#013388] text-white font-bold shadow-2xs'
                                                : 'bg-slate-100 text-gray-600 hover:bg-slate-200'
                                        }`}
                                    >
                                        {cat.name}
                                    </button>
                                ))}
                            </div>

                            {/* Aviso contextual si hay un clip de texto seleccionado */}
                            {selectedClip?.type === 'text' && (
                                <div className="bg-blue-50 border border-blue-200 rounded-xl p-2.5 flex items-center justify-between text-blue-900">
                                    <span className="text-[11px] font-semibold truncate mr-2">
                                        Clip seleccionado: <strong>{selectedClip.name}</strong>
                                    </span>
                                    <span className="text-[10px] text-[#013388] font-bold bg-white px-2 py-0.5 rounded border border-blue-200 shrink-0">
                                        Clic aplica estilo
                                    </span>
                                </div>
                            )}

                            {/* Galería de Tarjetas de Estilos con Previsualización Real */}
                            <div className="space-y-3">
                                {TEXT_TEMPLATES
                                    .filter(tpl => {
                                        const matchesCat = templateCategory === 'all' || tpl.category === templateCategory;
                                        const matchesSearch = !templateSearch || 
                                            tpl.name.toLowerCase().includes(templateSearch.toLowerCase()) || 
                                            tpl.description.toLowerCase().includes(templateSearch.toLowerCase());
                                        return matchesCat && matchesSearch;
                                    })
                                    .map(template => {
                                        const previewStyle = computeCssProperties(resolveEffectiveStyle(template.style));

                                        return (
                                            <div
                                                key={template.id}
                                                className="group border border-gray-200 hover:border-[#013388] rounded-xl overflow-hidden bg-white shadow-xs hover:shadow-md transition-all flex flex-col"
                                            >
                                                {/* Caja de Previsualización */}
                                                <div 
                                                    className="h-20 bg-neutral-900 flex items-center justify-center p-3 relative overflow-hidden cursor-pointer"
                                                    onClick={() => {
                                                        if (selectedClip && selectedClip.type === 'text') {
                                                            onUpdateClip(selectedClip.id, { style: { ...(selectedClip.style || {}), ...template.style } });
                                                            toast.success(`Estilo "${template.name}" aplicado a "${selectedClip.name}"`);
                                                        } else {
                                                            onAddClip({
                                                                trackId: tracks.find(t => t.type === 'text')?.id || 'track-text',
                                                                type: 'text',
                                                                name: template.name,
                                                                text: template.sampleText,
                                                                startTime: currentTime,
                                                                duration: 4,
                                                                style: template.style
                                                            });
                                                            toast.success(`Rótulo "${template.name}" añadido al timeline`);
                                                        }
                                                    }}
                                                >
                                                    <span
                                                        style={{
                                                            ...previewStyle,
                                                            fontSize: `${Math.min(20, (template.style?.fontSize || 24) * 0.7)}px`,
                                                            pointerEvents: 'none'
                                                        }}
                                                        className="line-clamp-2 max-w-full text-center"
                                                    >
                                                        {template.sampleText}
                                                    </span>
                                                </div>

                                                {/* Ficha de Detalles y Acciones */}
                                                <div className="p-2.5 bg-slate-50/70 border-t border-gray-100 flex flex-col gap-2">
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-xs font-bold text-gray-900 group-hover:text-[#013388]">
                                                            {template.name}
                                                        </span>
                                                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-gray-200/70 text-gray-600 capitalize">
                                                            {template.category}
                                                        </span>
                                                    </div>
                                                    <p className="text-[10px] text-gray-500 line-clamp-1">
                                                        {template.description}
                                                    </p>

                                                    <div className="flex items-center gap-1.5 pt-0.5">
                                                        {/* Botón Añadir como Clip de Texto */}
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                if (selectedClip && selectedClip.type === 'text') {
                                                                    onUpdateClip(selectedClip.id, { style: { ...(selectedClip.style || {}), ...template.style } });
                                                                    toast.success(`Estilo aplicado a "${selectedClip.name}"`);
                                                                } else {
                                                                    onAddClip({
                                                                        trackId: tracks.find(t => t.type === 'text')?.id || 'track-text',
                                                                        type: 'text',
                                                                        name: template.name,
                                                                        text: template.sampleText,
                                                                        startTime: currentTime,
                                                                        duration: 4,
                                                                        style: template.style
                                                                    });
                                                                    toast.success(`Rótulo "${template.name}" añadido al timeline`);
                                                                }
                                                            }}
                                                            className="flex-1 py-1 px-2 bg-white hover:bg-blue-50 text-gray-800 hover:text-[#013388] border border-gray-200 rounded-lg text-[11px] font-bold transition-colors flex items-center justify-center gap-1"
                                                        >
                                                            <Plus className="w-3 h-3 text-[#013388]" />
                                                            <span>{selectedClip?.type === 'text' ? 'Aplicar a Selección' : 'Añadir al Timeline'}</span>
                                                        </button>

                                                        {/* Botón Aplicar a Subtítulos si es compatible */}
                                                        {template.isSubtitleFriendly && (subtitles.segments?.length || 0) > 0 && (
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    const updated = applyStyleToAllSubtitles(subtitles, template.style);
                                                                    onUpdateSubtitles(updated);
                                                                    toast.success(`Estilo "${template.name}" aplicado a todos los subtítulos`);
                                                                }}
                                                                className="py-1 px-2 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-lg text-[11px] font-bold transition-colors flex items-center gap-1 shrink-0"
                                                                title="Aplicar este estilo visual a todos los subtítulos del video"
                                                            >
                                                                <Sparkles className="w-3 h-3 text-amber-600" />
                                                                <span>A Subtítulos</span>
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
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
                                <div className="flex items-center gap-1.5">
                                    <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-blue-50 text-[#013388] border border-blue-200" title={`Idioma original: ${sourceLangMeta.name}`}>
                                        {sourceLangCode.toUpperCase()}
                                    </span>
                                    {activeLangCode !== sourceLangCode && (
                                        <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200" title={`Idioma activo: ${activeLangMeta.name}`}>
                                            → {activeLangCode.toUpperCase()}
                                        </span>
                                    )}
                                </div>
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

                            {/* Alerta de Error con botón de Reintentar (Transcripción) */}
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

                            {/* Selector de Pistas de Idioma Generadas */}
                            {((subtitles.segments && subtitles.segments.length > 0) || (subtitles.translations && Object.keys(subtitles.translations).length > 0)) && (
                                <div className="p-2.5 bg-slate-50 border border-gray-200 rounded-xl space-y-2">
                                    <div className="flex items-center justify-between text-[11px]">
                                        <span className="text-gray-500 font-medium flex items-center gap-1">
                                            <Languages className="w-3 h-3 text-[#013388]" />
                                            <span>Versión activa:</span>
                                        </span>
                                        <span className="font-bold text-gray-800">
                                            {activeLangMeta.name} {activeLangCode === sourceLangCode ? '(Original)' : '(Traducido)'}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                        {Array.from(new Set([
                                            sourceLangCode,
                                            ...(subtitles.translations ? Object.keys(subtitles.translations).map(normalizeLangCode) : []),
                                            ...(subtitles.availableLanguages ? subtitles.availableLanguages.map(normalizeLangCode) : [])
                                        ])).map((code) => {
                                            const lMeta = LOCALES.find(l => l.code === code) || { code, name: code.toUpperCase() };
                                            const isActive = code === activeLangCode;
                                            const isOrig = code === sourceLangCode;
                                            return (
                                                <button
                                                    key={code}
                                                    onClick={() => handleSwitchLanguage(code)}
                                                    disabled={translating}
                                                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                                                        isActive
                                                            ? 'bg-[#013388] text-white shadow-2xs'
                                                            : 'bg-white hover:bg-gray-100 text-gray-700 border border-gray-200'
                                                    }`}
                                                    title={isOrig ? `${lMeta.name} (Audio original)` : `${lMeta.name} (Traducción IA)`}
                                                >
                                                    <span>{code.toUpperCase()}</span>
                                                    {isOrig && (
                                                        <span className={`text-[9px] px-1 rounded font-normal ${isActive ? 'bg-blue-900/40 text-blue-100' : 'bg-gray-100 text-gray-500'}`}>
                                                            Orig
                                                        </span>
                                                    )}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* Traducir Subtítulos */}
                            {subtitles.segments && subtitles.segments.length > 0 && (
                                <div className="p-3 bg-purple-50/50 border border-purple-200/80 rounded-xl space-y-2.5">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-bold text-gray-900 flex items-center gap-1.5">
                                            <Languages className="w-3.5 h-3.5 text-purple-600" />
                                            <span>Traducir subtítulos</span>
                                        </span>
                                        <span className="text-[10px] text-gray-500 font-medium">
                                            Origen: <strong className="text-gray-700">{sourceLangMeta.name}</strong>
                                        </span>
                                    </div>

                                    {/* Estado en progreso durante la traducción */}
                                    {translating ? (
                                        <div className="w-full py-2.5 px-3 bg-white border border-purple-300 text-purple-800 rounded-lg text-xs font-bold flex items-center justify-center gap-2 shadow-2xs">
                                            <Loader2 className="w-4 h-4 animate-spin text-purple-600 shrink-0" />
                                            <span className="truncate">{translateStageText || 'Traduciendo subtítulos…'}</span>
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-2">
                                            <select
                                                value={targetLang}
                                                onChange={(e) => setTargetLang(normalizeLangCode(e.target.value))}
                                                className="flex-1 bg-white border border-gray-200 text-xs text-gray-800 rounded-lg px-2.5 py-1.5 outline-none focus:border-purple-600"
                                            >
                                                {LOCALES.map((loc) => {
                                                    const isCurrentActive = loc.code === activeLangCode;
                                                    const hasTranslation = Boolean(subtitles.translations && Object.entries(subtitles.translations).some(([k, ver]) => normalizeLangCode(k) === loc.code && (ver?.segments?.length || 0) > 0)) ||
                                                        Boolean(subtitles.segments?.some(s => s.translations && Object.entries(s.translations).some(([k, v]) => normalizeLangCode(k) === loc.code && typeof v === 'string' && v.trim().length > 0)));
                                                    return (
                                                        <option
                                                            key={loc.code}
                                                            value={loc.code}
                                                            disabled={isCurrentActive}
                                                        >
                                                            {loc.name} ({loc.code.toUpperCase()})
                                                            {isCurrentActive ? ' — Idioma actual' : hasTranslation ? ' ✓ (Generado)' : ''}
                                                        </option>
                                                    );
                                                })}
                                            </select>
                                            <button
                                                onClick={handleTranslateSubtitles}
                                                disabled={translating || targetLang === activeLangCode}
                                                className="px-3.5 py-1.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-all shadow-xs flex items-center gap-1 shrink-0"
                                            >
                                                <Languages className="w-3.5 h-3.5" />
                                                <span>{(Boolean(subtitles.translations && Object.entries(subtitles.translations).some(([k, ver]) => normalizeLangCode(k) === normalizeLangCode(targetLang) && (ver?.segments?.length || 0) > 0)) || subtitles.segments?.some(s => s.translations && Object.entries(s.translations).some(([k, v]) => normalizeLangCode(k) === normalizeLangCode(targetLang) && typeof v === 'string' && v.trim().length > 0))) ? 'Activar' : 'Traducir'}</span>
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Alerta de Error en traducción con botón de Reintentar */}
                            {translateError && !translating && (
                                <div className="p-3 bg-red-50/90 border border-red-200 rounded-xl space-y-2 text-xs">
                                    <div className="flex items-start gap-2 text-red-800">
                                        <AlertCircle className="w-4 h-4 shrink-0 text-red-600 mt-0.5" />
                                        <div className="flex-1">
                                            <p className="font-semibold text-red-900 leading-tight">Error al traducir subtítulos</p>
                                            <p className="text-[11px] text-red-700 mt-0.5">{translateError.message}</p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={handleTranslateSubtitles}
                                        className="w-full py-1.5 px-3 bg-white hover:bg-red-50 border border-red-300 text-red-700 font-bold rounded-lg text-[11px] flex items-center justify-center gap-1.5 transition-colors shadow-2xs"
                                    >
                                        <RefreshCw className="w-3 h-3" />
                                        <span>Reintentar traducción</span>
                                    </button>
                                </div>
                            )}

                            {/* Lista de Segmentos Editables */}
                            {subtitles.segments && subtitles.segments.length > 0 ? (
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between text-[11px] font-bold text-gray-600">
                                        <span>Segmentos {activeLangCode !== sourceLangCode ? `(${activeLangMeta.name})` : ''} ({subtitles.segments.length})</span>
                                        <button
                                            onClick={handleAddSegment}
                                            className="text-[#013388] hover:underline flex items-center gap-1 font-bold"
                                        >
                                            <Plus className="w-3 h-3" />
                                            <span>Agregar</span>
                                        </button>
                                    </div>

                                    <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                                        {visibleSegments.map((seg, idx) => {
                                            const segDisplayText = getSegmentText(seg, activeLangCode, sourceLangCode, subtitles.translations);
                                            return (
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
                                                            onClick={() => handleDeleteSegment(idx)}
                                                            className="p-1 hover:bg-gray-200 rounded text-gray-400 hover:text-rose-600 transition-colors"
                                                            title="Eliminar segmento"
                                                        >
                                                            <Trash2 className="w-3 h-3" />
                                                        </button>
                                                    </div>
                                                    <input
                                                        type="text"
                                                        value={segDisplayText}
                                                        onChange={(e) => handleUpdateSegmentText(idx, e.target.value)}
                                                        className="w-full bg-white border border-gray-200 rounded px-2.5 py-1 text-xs text-gray-800 outline-none focus:border-[#013388]"
                                                    />
                                                </div>
                                            );
                                        })}
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
