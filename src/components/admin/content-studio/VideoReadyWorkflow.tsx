import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
    Upload, Sparkles, Film, Music, CheckCircle2, AlertTriangle,
    Loader2, Play, RefreshCw, Download, Share2, Copy, Check,
    Pencil, FileText, Clock, Volume2, VolumeX, Eye, ArrowRight,
    X, Calendar, Layers, Clapperboard, Send, ShieldCheck
} from 'lucide-react';
import { toast } from 'sonner';
import MediaPicker from './MediaPicker';
import { VIDEO_ACCEPT, uploadMediaFiles } from '../../../lib/mediaUpload';
import { useClub } from '../../../contexts/ClubContext';
import type { Outro } from '../../../lib/outroSpec';

const API = import.meta.env.VITE_API_URL || '/api';
const authHeaders = (): Record<string, string> => ({
    'Authorization': `Bearer ${localStorage.getItem('rotary_token')}`,
    'Content-Type': 'application/json'
});

export interface VideoReadyMedia {
    id?: string | null;
    filename: string;
    url: string;
    thumbUrl?: string | null;
    durationSec: number;
    width: number;
    height: number;
    aspectRatio: string;
    fps: number;
    hasAudio: boolean;
    sizeBytes?: number;
    normalized?: boolean;
}

export interface VideoAnalysis {
    summary: string;
    topic: string;
    visualElements: string[];
    detectedTexts: string[];
    musicRecommendation: string;
    hasMusicDetected?: boolean;
    hasSpeech?: boolean;
    transcript?: string | null;
}

interface ConnectedAccount {
    id: string;
    platform: 'facebook' | 'instagram';
    platformId?: string;
    accountName: string | null;
    status: string;
}

export interface VideoReadyState {
    video: VideoReadyMedia | null;
    composedUrl: string | null;
    analysis: VideoAnalysis | null;
    additionalContext: string;
    useOutro: boolean;
    selectedOutro: Outro | null;
    transitionType: 'fade' | 'dissolve' | 'cut';
    transitionSec: number;
    musicOption: 'none' | 'original' | 'style';
    selectedMusicStyle: string;
    copy: string;
    hashtags: string[];
    isComposed: boolean;
    durationBreakdown: {
        originalSec: number;
        outroSec: number;
        finalSec: number;
    };
}

interface VideoReadyWorkflowProps {
    availableOutros: Outro[];
    defaultOutro?: Outro | null;
    onStateChange?: (state: VideoReadyState) => void;
    onVideoReadyForPreview?: (url: string | null, isComposed: boolean) => void;
}

const MUSIC_STYLES = [
    { id: 'institucional', label: 'Institucional', desc: 'Solemne, inspirador y sobrio' },
    { id: 'comunitario', label: 'Comunitario', desc: 'Cálido, acústico y cercano' },
    { id: 'dinamico', label: 'Dinámico', desc: 'Ritmo activo para jornadas y acción' },
    { id: 'esperanzador', label: 'Esperanzador', desc: 'Emotivo y motivacional' }
];

export const formatDuration = (sec: number): string => {
    if (!Number.isFinite(sec) || sec < 0) return '00:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

export const VideoReadyWorkflow: React.FC<VideoReadyWorkflowProps> = ({
    availableOutros,
    defaultOutro,
    onStateChange,
    onVideoReadyForPreview
}) => {
    const { club } = useClub();
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    // Estados del video
    const [video, setVideo] = useState<VideoReadyMedia | null>(null);
    const [uploadState, setUploadState] = useState<string | null>(null); // 'Subiendo…', 'Procesando…', 'Convirtiendo formato…', 'Analizando video…', 'Listo'
    const [isDragging, setIsDragging] = useState(false);
    const [showLibraryPicker, setShowLibraryPicker] = useState(false);

    // Análisis IA
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [analysis, setAnalysis] = useState<VideoAnalysis | null>(null);
    const [additionalContext, setAdditionalContext] = useState('');

    // Cierre institucional (Outro)
    const [useOutro, setUseOutro] = useState(true);
    const [selectedOutro, setSelectedOutro] = useState<Outro | null>(defaultOutro || availableOutros[0] || null);
    const [transitionType, setTransitionType] = useState<'fade' | 'dissolve' | 'cut'>('fade');
    const [transitionSec, setTransitionSec] = useState<number>(0.6);

    // Música de fondo
    const [musicOption, setMusicOption] = useState<'none' | 'original' | 'style'>('original');
    const [selectedMusicStyle, setSelectedMusicStyle] = useState('institucional');

    // Composición final
    const [isComposing, setIsComposing] = useState(false);
    const [composedVideo, setComposedVideo] = useState<VideoReadyMedia | null>(null);

    // Copywriting IA
    const [copy, setCopy] = useState('');
    const [hashtags, setHashtags] = useState<string[]>([]);
    const [isGeneratingCopy, setIsGeneratingCopy] = useState(false);
    const [copyNotes, setCopyNotes] = useState<string[]>([]);
    const [copied, setCopied] = useState(false);

    // Cuentas sociales y publicación
    const [accounts, setAccounts] = useState<ConnectedAccount[]>([]);
    const [selectedAccountIds, setSelectedAccountIds] = useState<Set<string>>(new Set());
    const [isPublishing, setIsPublishing] = useState(false);
    const [scheduledFor, setScheduledFor] = useState('');
    const [showScheduleInput, setShowScheduleInput] = useState(false);
    const [publishOutcomes, setPublishOutcomes] = useState<any[] | null>(null);

    // Cálculo de duraciones
    const originalSec = video?.durationSec || 0;
    const outroSec = (useOutro && selectedOutro) ? (selectedOutro.durationSec || 4) : 0;
    const overlapSec = (useOutro && selectedOutro && transitionType !== 'cut') ? transitionSec : 0;
    const finalSec = composedVideo?.durationSec || Math.max(0, originalSec + outroSec - overlapSec);

    // Sincronizar estado hacia el padre
    useEffect(() => {
        const state: VideoReadyState = {
            video,
            composedUrl: composedVideo?.url || null,
            analysis,
            additionalContext,
            useOutro,
            selectedOutro,
            transitionType,
            transitionSec,
            musicOption,
            selectedMusicStyle,
            copy,
            hashtags,
            isComposed: Boolean(composedVideo?.url),
            durationBreakdown: { originalSec, outroSec, finalSec }
        };
        onStateChange?.(state);
        onVideoReadyForPreview?.(composedVideo?.url || video?.url || null, Boolean(composedVideo?.url));
    }, [video, composedVideo, analysis, additionalContext, useOutro, selectedOutro, transitionType, transitionSec, musicOption, selectedMusicStyle, copy, hashtags, originalSec, outroSec, finalSec, onStateChange, onVideoReadyForPreview]);

    // Preseleccionar outro por defecto si llega
    useEffect(() => {
        if (!selectedOutro && availableOutros.length > 0) {
            setSelectedOutro(defaultOutro || availableOutros[0]);
        }
    }, [availableOutros, defaultOutro, selectedOutro]);

    // Cargar cuentas sociales conectadas
    useEffect(() => {
        (async () => {
            try {
                const r = await fetch(`${API}/social/accounts`, { headers: authHeaders() });
                if (r.ok) {
                    const data = await r.json();
                    const active = (Array.isArray(data) ? data : data.accounts || [])
                        .filter((a: any) => a.status === 'active' && (a.platform === 'facebook' || a.platform === 'instagram'));
                    setAccounts(active);
                    setSelectedAccountIds(new Set(active.map((a: any) => a.id)));
                }
            } catch { /* degradación elegante */ }
        })();
    }, []);

    // ── Normalización de archivo de video ──
    const processVideoFile = async (file: File) => {
        setUploadState('Subiendo…');
        const toastId = toast.loading('Subiendo video al almacenamiento...');
        try {
            const res = await uploadMediaFiles([file], {
                clubId: club?.id || null,
                onProgress: (_d, _t, name) => setUploadState(`Subiendo ${name}…`)
            });

            if (res.failed.length > 0) {
                throw new Error(res.failed[0].reason);
            }

            const uploaded = res.uploaded[0];
            if (!uploaded) throw new Error('No se recibió la confirmación de subida');

            // Normalización automática si se requiere (ej. AVI / MOV / códec incompatible)
            setUploadState('Convirtiendo formato…');
            toast.loading('Normalizando formato técnico (H.264/AAC)...', { id: toastId });

            const normRes = await fetch(`${API}/content-studio/video-ready/normalize`, {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({
                    mediaId: uploaded.id,
                    fileUrl: uploaded.url,
                    filename: uploaded.filename
                })
            });

            const normData = await normRes.json();
            if (!normRes.ok) throw new Error(normData.error || 'Error al normalizar video');

            setVideo(normData.media);
            setComposedVideo(null); // Reset anterior
            setUploadState('Listo.');
            toast.success(normData.normalized ? 'Video normalizado a MP4 (H.264) con éxito' : 'Video verificado y listo', { id: toastId });

            // Disparar análisis inicial automático
            triggerAnalysis(normData.media);
        } catch (err: any) {
            setUploadState(null);
            toast.error(err.message || 'No se pudo procesar el video', { id: toastId });
        }
    };

    // ── Selección desde Biblioteca Multimedia ──
    const handlePickFromLibrary = async (pickedItem: any) => {
        setShowLibraryPicker(false);
        setUploadState('Procesando…');
        const toastId = toast.loading('Preparando video seleccionado...');
        try {
            const normRes = await fetch(`${API}/content-studio/video-ready/normalize`, {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({
                    mediaId: pickedItem.id,
                    fileUrl: pickedItem.url,
                    filename: pickedItem.filename
                })
            });
            const normData = await normRes.json();
            if (!normRes.ok) throw new Error(normData.error || 'Error al procesar video de biblioteca');

            setVideo(normData.media);
            setComposedVideo(null);
            setUploadState('Listo.');
            toast.success('Video cargado desde la Biblioteca', { id: toastId });

            triggerAnalysis(normData.media);
        } catch (err: any) {
            setUploadState(null);
            toast.error(err.message || 'Error al cargar video', { id: toastId });
        }
    };

    // ── Análisis IA del video ──
    const triggerAnalysis = async (targetVideo = video) => {
        if (!targetVideo) return;
        setIsAnalyzing(true);
        setUploadState('Analizando video…');
        const toastId = toast.loading('Analizando contenido, audio y temática con IA...');
        try {
            const r = await fetch(`${API}/content-studio/video-ready/analyze`, {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({
                    mediaId: targetVideo.id,
                    videoUrl: targetVideo.url,
                    additionalContext
                })
            });
            const data = await r.json();
            if (!r.ok) throw new Error(data.error || 'Error en análisis IA');

            setAnalysis(data.analysis);
            setUploadState('Listo.');
            toast.success('Análisis de video completado', { id: toastId });

            // Generar propuesta inicial de copy
            generateCopyAction('generate', data.analysis);
        } catch (err: any) {
            setUploadState('Listo.');
            toast.error(err.message || 'No se pudo completar el análisis IA', { id: toastId });
        } finally {
            setIsAnalyzing(false);
        }
    };

    // ── Composición del video final (Outro + Transición + Música Ducking) ──
    const handleCompose = async () => {
        if (!video) {
            toast.error('Carga un video primero');
            return;
        }

        setIsComposing(true);
        const toastId = toast.loading('Procesando video final con FFmpeg...');
        try {
            const r = await fetch(`${API}/content-studio/video-ready/compose`, {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({
                    mediaId: video.id,
                    videoUrl: video.url,
                    outro: useOutro && selectedOutro ? {
                        id: selectedOutro.id,
                        url: selectedOutro.url,
                        durationSec: selectedOutro.durationSec || 4,
                        transitionType,
                        transitionSec
                    } : null,
                    music: musicOption === 'style' ? {
                        withMusic: true,
                        style: selectedMusicStyle,
                        ducking: Boolean(video.hasAudio)
                    } : { withMusic: false },
                    additionalContext
                })
            });

            const data = await r.json();
            if (!r.ok) throw new Error(data.error || 'Error en la composición del video');

            setComposedVideo({
                id: data.mediaId,
                filename: 'video-final-rotary.mp4',
                url: data.videoUrl,
                thumbUrl: data.thumbUrl || video.thumbUrl,
                durationSec: data.durationSec,
                width: data.width,
                height: data.height,
                aspectRatio: video.aspectRatio,
                fps: video.fps,
                hasAudio: true,
                sizeBytes: data.sizeBytes
            });

            toast.success('¡Video final procesado y listo para publicar!', { id: toastId });
        } catch (err: any) {
            toast.error(err.message || 'Error al procesar el video final', { id: toastId });
        } finally {
            setIsComposing(false);
        }
    };

    // ── Generación y modificación del Copy con IA (Regla 10) ──
    const generateCopyAction = async (action: 'generate' | 'shorter' | 'emotional' | 'institutional' | 'regenerate', targetAnalysis = analysis) => {
        setIsGeneratingCopy(true);
        const toastId = toast.loading(
            action === 'shorter' ? 'Sintetizando copy más breve...' :
            action === 'emotional' ? 'Aumentando calidez y emoción...' :
            action === 'institutional' ? 'Ajustando tono protocolario...' :
            'Redactando propuesta institucional...'
        );

        try {
            const r = await fetch(`${API}/content-studio/video-ready/copy`, {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({
                    analysis: targetAnalysis || {},
                    additionalContext,
                    action,
                    previousCopy: copy
                })
            });

            const data = await r.json();
            if (!r.ok) throw new Error(data.error || 'Error al generar copy');

            setCopy(data.copy || '');
            setHashtags(data.hashtags || []);
            setCopyNotes(data.notes || []);
            toast.success('Texto para publicación actualizado', { id: toastId });
        } catch (err: any) {
            toast.error(err.message || 'No se pudo generar el texto', { id: toastId });
        } finally {
            setIsGeneratingCopy(false);
        }
    };

    const copyToClipboard = async () => {
        const fullText = `${copy}\n\n${hashtags.join(' ')}`.trim();
        try {
            await navigator.clipboard.writeText(fullText);
            setCopied(true);
            toast.success('Texto copiado al portapapeles');
            setTimeout(() => setCopied(false), 2000);
        } catch {
            toast.error('No se pudo copiar');
        }
    };

    // ── Publicar en redes sociales ──
    const handlePublish = async (isScheduled = false) => {
        const finalUrl = composedVideo?.url || video?.url;
        if (!finalUrl) {
            toast.error('No hay video listo para publicar');
            return;
        }
        if (!copy.trim()) {
            toast.error('Escribe o genera el copy para la publicación');
            return;
        }
        if (selectedAccountIds.size === 0) {
            toast.error('Selecciona al menos una cuenta para publicar');
            return;
        }
        if (isScheduled && !scheduledFor) {
            toast.error('Indica la fecha y hora para programar');
            return;
        }

        setIsPublishing(true);
        const toastId = toast.loading(isScheduled ? 'Programando publicación...' : 'Publicando en redes sociales...');

        try {
            const fullMessage = `${copy}\n\n${hashtags.join(' ')}`.trim();
            const r = await fetch(`${API}/content-studio/video-ready/publish`, {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({
                    mediaUrl: finalUrl,
                    copy: fullMessage,
                    accountIds: Array.from(selectedAccountIds),
                    scheduledFor: isScheduled ? new Date(scheduledFor).toISOString() : null,
                    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
                })
            });

            const data = await r.json();
            if (!r.ok) throw new Error(data.error || 'Error al publicar');

            setPublishOutcomes(data.outcomes || []);
            if (isScheduled) {
                toast.success('Publicación programada exitosamente', { id: toastId });
            } else {
                toast.success('¡Video publicado exitosamente en tus redes!', { id: toastId });
            }
        } catch (err: any) {
            toast.error(err.message || 'Error al publicar en redes', { id: toastId });
        } finally {
            setIsPublishing(false);
        }
    };

    const toggleAccount = (id: string) => {
        setSelectedAccountIds(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    return (
        <div className="space-y-6">
            {/* 1. SECCIÓN: SUBE TU VIDEO */}
            <div className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
                            <Film className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="text-lg font-black text-gray-900">Sube tu video</h3>
                            <p className="text-xs text-gray-500 font-medium">
                                Utiliza un video que ya esté grabado o editado. Lo prepararemos para redes sociales sin modificar innecesariamente su contenido.
                            </p>
                        </div>
                    </div>

                    {uploadState && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-indigo-50 text-indigo-700 border border-indigo-100 animate-pulse">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            {uploadState}
                        </span>
                    )}
                </div>

                {!video ? (
                    <div
                        onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                        onDragLeave={() => setIsDragging(false)}
                        onDrop={e => {
                            e.preventDefault();
                            setIsDragging(false);
                            const file = e.dataTransfer.files?.[0];
                            if (file) processVideoFile(file);
                        }}
                        className={`mt-4 border-2 border-dashed rounded-3xl p-8 text-center transition-all flex flex-col items-center justify-center gap-3 ${
                            isDragging ? 'border-indigo-500 bg-indigo-50/50 scale-[1.01]' : 'border-gray-200 hover:border-indigo-300 bg-gray-50/50'
                        }`}
                    >
                        <div className="w-14 h-14 rounded-2xl bg-white shadow-sm border border-gray-100 flex items-center justify-center text-indigo-600">
                            <Upload className="w-7 h-7" />
                        </div>
                        <div>
                            <p className="text-sm font-black text-gray-900">Arrastra tu video aquí</p>
                            <p className="text-xs text-gray-500 font-medium mt-0.5">Formatos aceptados: MP4, MOV, AVI, WebM, M4V</p>
                        </div>

                        <div className="flex items-center gap-3 mt-2">
                            <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black transition-all flex items-center gap-2 shadow-sm"
                            >
                                <Upload className="w-4 h-4" /> Seleccionar desde dispositivo
                            </button>
                            <button
                                type="button"
                                onClick={() => setShowLibraryPicker(true)}
                                className="px-5 py-2.5 bg-white hover:bg-gray-50 border border-gray-200 text-gray-700 rounded-xl text-xs font-black transition-all flex items-center gap-2"
                            >
                                <Layers className="w-4 h-4 text-gray-500" /> Elegir desde Biblioteca
                            </button>
                        </div>

                        <input
                            ref={fileInputRef}
                            type="file"
                            accept={VIDEO_ACCEPT}
                            className="hidden"
                            onChange={e => {
                                const file = e.target.files?.[0];
                                if (file) processVideoFile(file);
                            }}
                        />
                    </div>
                ) : (
                    /* Tarjeta de video cargado y especificaciones técnicas */
                    <div className="mt-4 bg-gray-50/70 border border-gray-100 rounded-2xl p-4 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="w-16 h-16 rounded-xl bg-black overflow-hidden relative flex-shrink-0 border border-gray-200">
                                {video.thumbUrl ? (
                                    <img src={video.thumbUrl} alt="" className="w-full h-full object-cover" />
                                ) : (
                                    <Film className="w-6 h-6 text-white/50 absolute inset-0 m-auto" />
                                )}
                                <span className="absolute bottom-1 right-1 text-[9px] font-black bg-black/70 text-white px-1.5 py-0.5 rounded">
                                    {formatDuration(video.durationSec)}
                                </span>
                            </div>
                            <div>
                                <div className="flex items-center gap-2">
                                    <h4 className="text-sm font-black text-gray-900 truncate max-w-[280px]">{video.filename}</h4>
                                    {video.normalized && (
                                        <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-emerald-100 text-emerald-800">
                                            Normalizado MP4
                                        </span>
                                    )}
                                </div>
                                <div className="flex flex-wrap items-center gap-2 mt-1 text-[11px] text-gray-500 font-bold">
                                    <span>{video.width}×{video.height} ({video.aspectRatio})</span>
                                    <span>·</span>
                                    <span>{video.fps} fps</span>
                                    <span>·</span>
                                    <span className="flex items-center gap-1">
                                        {video.hasAudio ? <Volume2 className="w-3.5 h-3.5 text-emerald-600" /> : <VolumeX className="w-3.5 h-3.5 text-gray-400" />}
                                        {video.hasAudio ? 'Con audio original' : 'Sin audio'}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                className="px-3 py-1.5 bg-white border border-gray-200 rounded-xl text-xs font-black text-gray-700 hover:bg-gray-100 transition-all"
                            >
                                Cambiar
                            </button>
                            <button
                                type="button"
                                onClick={() => { setVideo(null); setComposedVideo(null); setAnalysis(null); }}
                                className="p-1.5 text-gray-400 hover:text-red-600 transition-all rounded-lg"
                                title="Quitar video"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* 2. SECCIÓN: ANÁLISIS DEL VIDEO CON IA */}
            {video && (
                <div className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-2xl bg-purple-50 border border-purple-100 flex items-center justify-center text-purple-600">
                                <Sparkles className="w-5 h-5" />
                            </div>
                            <div>
                                <h3 className="text-base font-black text-gray-900">Análisis del video con IA</h3>
                                <p className="text-xs text-gray-500 font-medium">
                                    Comprensión técnica y semántica para generar metadata y la propuesta de publicación.
                                </p>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={() => triggerAnalysis(video)}
                            disabled={isAnalyzing}
                            className="px-4 py-2 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-xl text-xs font-black transition-all flex items-center gap-2 disabled:opacity-50"
                        >
                            {isAnalyzing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                            {analysis ? 'Reanalizar' : 'Analizar video con IA'}
                        </button>
                    </div>

                    {analysis && (
                        <div className="bg-purple-50/40 border border-purple-100/60 rounded-2xl p-4 space-y-3">
                            <div>
                                <span className="text-[10px] font-black uppercase text-purple-700 tracking-wider">Temática</span>
                                <p className="text-xs font-bold text-gray-900 mt-0.5">{analysis.topic}</p>
                            </div>
                            <div>
                                <span className="text-[10px] font-black uppercase text-purple-700 tracking-wider">Resumen detectado</span>
                                <p className="text-xs text-gray-700 font-medium leading-relaxed mt-0.5">{analysis.summary}</p>
                            </div>

                            {analysis.transcript && (
                                <div>
                                    <span className="text-[10px] font-black uppercase text-purple-700 tracking-wider">Diálogo / Transcripción</span>
                                    <p className="text-xs text-gray-800 font-mono bg-white/80 p-2.5 rounded-xl border border-purple-100/50 mt-1 italic">
                                        «{analysis.transcript}»
                                    </p>
                                </div>
                            )}

                            {analysis.musicRecommendation && (
                                <div className="flex items-start gap-2 bg-indigo-50/70 border border-indigo-100 rounded-xl p-2.5">
                                    <Music className="w-4 h-4 text-indigo-600 flex-shrink-0 mt-0.5" />
                                    <p className="text-xs text-indigo-900 font-bold leading-relaxed">
                                        {analysis.musicRecommendation}
                                    </p>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* 3. SECCIÓN: CONTEXTO ADICIONAL */}
            {video && (
                <div className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm space-y-3">
                    <label className="block text-sm font-black text-gray-900">
                        Cuéntanos de qué trata este video <span className="text-gray-400 font-normal">(Opcional)</span>
                    </label>
                    <textarea
                        value={additionalContext}
                        onChange={e => setAdditionalContext(e.target.value)}
                        placeholder="Ej.: Jornada de servicio realizada por el Club Rotario de ___ junto a la comunidad para entrega de mercados y kits escolares..."
                        rows={2}
                        className="w-full text-xs font-medium border border-gray-200 rounded-2xl p-3 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all placeholder:text-gray-400"
                    />
                </div>
            )}

            {/* 4. SECCIÓN: CIERRE INSTITUCIONAL (OUTRO) */}
            {video && (
                <div className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600">
                                <Clapperboard className="w-5 h-5" />
                            </div>
                            <div>
                                <h3 className="text-base font-black text-gray-900">Cierre institucional</h3>
                                <p className="text-xs text-gray-500 font-medium">
                                    Engancha el cierre con logo y marca del Distrito/Club al final del video original.
                                </p>
                            </div>
                        </div>

                        <label className="flex items-center gap-2 cursor-pointer select-none">
                            <input
                                type="checkbox"
                                checked={useOutro}
                                onChange={e => setUseOutro(e.target.checked)}
                                className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                            />
                            <span className="text-xs font-black text-gray-700">Agregar outro</span>
                        </label>
                    </div>

                    {useOutro && (
                        <div className="space-y-4 pt-2 border-t border-gray-100">
                            {/* Selector de Outros */}
                            <div className="space-y-2">
                                <span className="text-[11px] font-black uppercase text-gray-500 tracking-wider">Outro a utilizar</span>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                    {availableOutros.map(o => (
                                        <div
                                            key={o.id}
                                            onClick={() => setSelectedOutro(o)}
                                            className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center gap-3 ${
                                                selectedOutro?.id === o.id
                                                    ? 'border-indigo-600 bg-indigo-50/40 ring-2 ring-indigo-600/20'
                                                    : 'border-gray-200 hover:border-gray-300 bg-white'
                                            }`}
                                        >
                                            <div className="w-10 h-10 rounded-lg bg-black overflow-hidden flex-shrink-0">
                                                {o.posterUrl ? (
                                                    <img src={o.posterUrl} alt="" className="w-full h-full object-cover" />
                                                ) : (
                                                    <Film className="w-4 h-4 text-white/40 m-auto mt-3" />
                                                )}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <p className="text-xs font-black text-gray-900 truncate">{o.title}</p>
                                                <p className="text-[10px] text-gray-400 font-bold">~{o.durationSec || 4}s · {o.format || '9:16'}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Selector de Transición */}
                            <div className="flex flex-wrap items-center gap-3 pt-2">
                                <span className="text-[11px] font-black uppercase text-gray-500 tracking-wider">Transición:</span>
                                {[
                                    { id: 'fade', label: 'Fundido suave (0.6s)' },
                                    { id: 'dissolve', label: 'Disolvencia (0.8s)' },
                                    { id: 'cut', label: 'Corte directo' }
                                ].map(t => (
                                    <button
                                        key={t.id}
                                        type="button"
                                        onClick={() => {
                                            setTransitionType(t.id as any);
                                            setTransitionSec(t.id === 'fade' ? 0.6 : t.id === 'dissolve' ? 0.8 : 0);
                                        }}
                                        className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all ${
                                            transitionType === t.id
                                                ? 'bg-indigo-600 text-white shadow-sm'
                                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                        }`}
                                    >
                                        {t.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* 5. SECCIÓN: MÚSICA DE FONDO */}
            {video && (
                <div className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm space-y-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
                            <Music className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="text-base font-black text-gray-900">Música de fondo</h3>
                            <p className="text-xs text-gray-500 font-medium">
                                Ajusta la ambientación sonora con atenuación automática (ducking) para no interferir con las voces.
                            </p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {[
                            { id: 'none', label: 'Sin música', desc: 'Silenciar o solo conservar el audio original' },
                            { id: 'original', label: 'Usar música existente', desc: 'Conservar la mezcla actual que trae el video' },
                            { id: 'style', label: 'Elegir música institucional', desc: 'Pista de fondo con ducking automático' }
                        ].map(opt => (
                            <button
                                key={opt.id}
                                type="button"
                                onClick={() => setMusicOption(opt.id as any)}
                                className={`p-4 rounded-2xl border text-left transition-all ${
                                    musicOption === opt.id
                                        ? 'border-emerald-600 bg-emerald-50/30 ring-2 ring-emerald-600/20'
                                        : 'border-gray-200 hover:border-gray-300 bg-white'
                                }`}
                            >
                                <p className="text-xs font-black text-gray-900">{opt.label}</p>
                                <p className="text-[11px] text-gray-500 font-medium mt-1 leading-snug">{opt.desc}</p>
                            </button>
                        ))}
                    </div>

                    {musicOption === 'style' && (
                        <div className="space-y-3 pt-2 border-t border-gray-100">
                            <div className="flex flex-wrap gap-2">
                                {MUSIC_STYLES.map(s => (
                                    <button
                                        key={s.id}
                                        type="button"
                                        onClick={() => setSelectedMusicStyle(s.id)}
                                        className={`px-3.5 py-2 rounded-xl text-xs font-black transition-all ${
                                            selectedMusicStyle === s.id
                                                ? 'bg-emerald-600 text-white shadow-sm'
                                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                        }`}
                                    >
                                        {s.label}
                                    </button>
                                ))}
                            </div>
                            <div className="bg-emerald-50/70 border border-emerald-100 rounded-xl p-3 flex items-center gap-2">
                                <ShieldCheck className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                                <p className="text-[11px] font-bold text-emerald-900">
                                    Ducking inteligente activado: el volumen de la música baja automáticamente cuando hay diálogo y sube en las pausas.
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* BOTÓN PRINCIPAL DE PROCESAMIENTO / COMPOSICIÓN */}
            {video && (
                <div className="flex justify-end">
                    <button
                        type="button"
                        onClick={handleCompose}
                        disabled={isComposing}
                        className="px-8 py-3.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-2xl text-sm font-black transition-all shadow-lg shadow-indigo-600/20 flex items-center gap-2 disabled:opacity-50"
                    >
                        {isComposing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                        {composedVideo ? 'Rehacer procesamiento' : 'Preparar y Procesar Video'}
                    </button>
                </div>
            )}

            {/* 6. SECCIÓN: TEXTO PARA LA PUBLICACIÓN (COPY CON IA - REGLA 10) */}
            {video && (
                <div className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600">
                                <FileText className="w-5 h-5" />
                            </div>
                            <div>
                                <h3 className="text-base font-black text-gray-900">Texto para la publicación</h3>
                                <p className="text-xs text-gray-500 font-medium">
                                    Redacción institucional optimizada para redes según la Regla 10 (sin clichés repetitivos, centrada en impacto y servicio).
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={copyToClipboard}
                                className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-black transition-all flex items-center gap-1.5"
                            >
                                {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                                {copied ? 'Copiado' : 'Copiar'}
                            </button>
                            <button
                                type="button"
                                onClick={() => generateCopyAction('regenerate')}
                                disabled={isGeneratingCopy}
                                className="px-3.5 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 disabled:opacity-50"
                            >
                                {isGeneratingCopy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                                Regenerar
                            </button>
                        </div>
                    </div>

                    <textarea
                        value={copy}
                        onChange={e => setCopy(e.target.value)}
                        placeholder="El copy generado con IA aparecerá aquí. Podrás editarlo libremente..."
                        rows={4}
                        className="w-full text-xs font-medium text-gray-800 border border-gray-200 rounded-2xl p-4 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all leading-relaxed"
                    />

                    {/* Acciones de modificación rápida del copy */}
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                        <span className="text-[11px] font-black uppercase text-gray-400 mr-1">Ajustar:</span>
                        <button
                            type="button"
                            onClick={() => generateCopyAction('shorter')}
                            disabled={isGeneratingCopy}
                            className="px-3 py-1.5 rounded-xl bg-gray-50 hover:bg-gray-100 text-gray-700 border border-gray-200 text-xs font-bold transition-all"
                        >
                            Hacerlo más corto
                        </button>
                        <button
                            type="button"
                            onClick={() => generateCopyAction('emotional')}
                            disabled={isGeneratingCopy}
                            className="px-3 py-1.5 rounded-xl bg-gray-50 hover:bg-gray-100 text-gray-700 border border-gray-200 text-xs font-bold transition-all"
                        >
                            Hacerlo más emotivo
                        </button>
                        <button
                            type="button"
                            onClick={() => generateCopyAction('institutional')}
                            disabled={isGeneratingCopy}
                            className="px-3 py-1.5 rounded-xl bg-gray-50 hover:bg-gray-100 text-gray-700 border border-gray-200 text-xs font-bold transition-all"
                        >
                            Hacerlo más institucional
                        </button>
                    </div>

                    {/* Hashtags */}
                    {hashtags.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 pt-1">
                            {hashtags.map((h, i) => (
                                <span key={i} className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-gray-100 text-indigo-700">
                                    {h}
                                </span>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* 7. SECCIÓN: PUBLICAR EN REDES SOCIALES */}
            {video && (
                <div className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm space-y-5">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
                            <Share2 className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="text-base font-black text-gray-900">Publicar en redes sociales</h3>
                            <p className="text-xs text-gray-500 font-medium">
                                Revisa el resumen y despacha la publicación directamente a las páginas y cuentas conectadas.
                            </p>
                        </div>
                    </div>

                    {/* Resumen previo */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-gray-50/70 border border-gray-100 rounded-2xl p-4">
                        <div>
                            <span className="text-[10px] font-black uppercase text-gray-400">Video</span>
                            <p className="text-xs font-black text-emerald-600 flex items-center gap-1 mt-0.5">
                                <CheckCircle2 className="w-3.5 h-3.5" /> {composedVideo ? 'Procesado' : 'Listo'}
                            </p>
                        </div>
                        <div>
                            <span className="text-[10px] font-black uppercase text-gray-400">Outro</span>
                            <p className="text-xs font-black text-gray-800 flex items-center gap-1 mt-0.5">
                                {useOutro ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> : <span className="text-gray-400">—</span>}
                                {useOutro ? 'Agregado' : 'Sin outro'}
                            </p>
                        </div>
                        <div>
                            <span className="text-[10px] font-black uppercase text-gray-400">Música</span>
                            <p className="text-xs font-black text-gray-800 flex items-center gap-1 mt-0.5">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                {musicOption === 'style' ? 'Con ducking' : musicOption === 'original' ? 'Original' : 'Sin música'}
                            </p>
                        </div>
                        <div>
                            <span className="text-[10px] font-black uppercase text-gray-400">Copy</span>
                            <p className="text-xs font-black text-emerald-600 flex items-center gap-1 mt-0.5">
                                <CheckCircle2 className="w-3.5 h-3.5" /> Aprobado
                            </p>
                        </div>
                    </div>

                    {/* Selección de Cuentas Conectadas */}
                    <div className="space-y-2">
                        <span className="text-[11px] font-black uppercase text-gray-500 tracking-wider">Cuentas Destino</span>
                        {accounts.length === 0 ? (
                            <div className="p-4 bg-amber-50 border border-amber-100 rounded-2xl">
                                <p className="text-xs font-bold text-amber-800">
                                    No hay cuentas de Meta (Facebook/Instagram) conectadas actualmente. Conéctalas desde la pestaña «Cuentas Sociales».
                                </p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {accounts.map(acc => (
                                    <div
                                        key={acc.id}
                                        onClick={() => toggleAccount(acc.id)}
                                        className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center gap-3 ${
                                            selectedAccountIds.has(acc.id)
                                                ? 'border-indigo-600 bg-indigo-50/30'
                                                : 'border-gray-200 bg-white opacity-60'
                                        }`}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={selectedAccountIds.has(acc.id)}
                                            onChange={() => {}}
                                            className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                        />
                                        <div>
                                            <p className="text-xs font-black text-gray-900">{acc.accountName || acc.platform}</p>
                                            <p className="text-[10px] text-gray-400 font-bold uppercase">{acc.platform}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Botones de acción de publicación */}
                    <div className="pt-3 border-t border-gray-100 flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                            <button
                                type="button"
                                onClick={() => handlePublish(false)}
                                disabled={isPublishing || selectedAccountIds.size === 0}
                                className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black transition-all shadow-md shadow-indigo-600/20 flex items-center gap-2 disabled:opacity-50"
                            >
                                {isPublishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                                Publicar ahora
                            </button>

                            <button
                                type="button"
                                onClick={() => setShowScheduleInput(s => !s)}
                                className="px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-black transition-all flex items-center gap-2"
                            >
                                <Calendar className="w-4 h-4" /> Programar publicación
                            </button>
                        </div>

                        {(composedVideo?.url || video.url) && (
                            <a
                                href={composedVideo?.url || video.url}
                                download="video-rotary.mp4"
                                className="px-4 py-3 text-gray-600 hover:text-gray-900 text-xs font-black flex items-center gap-1.5 transition-all"
                            >
                                <Download className="w-4 h-4" /> Descargar video
                            </a>
                        )}
                    </div>

                    {showScheduleInput && (
                        <div className="p-4 bg-gray-50 border border-gray-200 rounded-2xl flex flex-wrap items-center gap-3">
                            <label className="text-xs font-bold text-gray-700">Fecha y hora:</label>
                            <input
                                type="datetime-local"
                                value={scheduledFor}
                                onChange={e => setScheduledFor(e.target.value)}
                                className="border border-gray-200 rounded-xl px-3 py-1.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                            />
                            <button
                                type="button"
                                onClick={() => handlePublish(true)}
                                disabled={isPublishing || !scheduledFor}
                                className="px-4 py-2 bg-indigo-600 text-white text-xs font-black rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-all"
                            >
                                Confirmar programación
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* Selector de Biblioteca */}
            <MediaPicker
                isOpen={showLibraryPicker}
                mediaType="video"
                maxSelection={1}
                onClose={() => setShowLibraryPicker(false)}
                onSelect={items => {
                    if (items[0]) handlePickFromLibrary(items[0]);
                }}
            />
        </div>
    );
};

export default VideoReadyWorkflow;
