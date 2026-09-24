// ════════════════════════════════════════════════════════════════════
// Video Informe IA — Workflow Audiovisual Completo
// v4.1100.0
//
// Flujo asistido por IA para transformar una Campaña de Contribución
// en un informe audiovisual institucional, narrativo y verificado.
// ════════════════════════════════════════════════════════════════════

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    Sparkles, Film, FileText, CheckCircle2, AlertCircle,
    Play, Pause, RefreshCw, Volume2, ArrowRight, ArrowLeft,
    Layers, Wand2, ShieldCheck, Download, Share2, Eye,
    Trash2, Plus, GripVertical, Check, Music, Clapperboard,
    Coins, Clock, MapPin, Building2, Image as ImageIcon,
    Sliders, ChevronRight, BarChart3, HelpCircle, Loader2
} from 'lucide-react';
import { toast } from 'sonner';
import {
    REPORT_FORMATS,
    REPORT_OBJECTIVES,
    REPORT_AUDIENCES,
    REPORT_DURATIONS,
    REPORT_TONES,
    MOTION_TYPES,
    type VideoReportFormat,
    type VideoReportProjectData,
    type VideoReportSceneData
} from '../../../lib/videoReportSpec';
import { useClub } from '../../../contexts/ClubContext';
import ShareModal from '../social/ShareModal';

const API = import.meta.env.VITE_API_URL || '/api';
const authHeaders = (): Record<string, string> => ({
    'Authorization': `Bearer ${localStorage.getItem('rotary_token')}`,
    'Content-Type': 'application/json'
});

interface CampaignOption {
    id: string;
    name: string;
    slug: string;
    campaignType: string;
    status: string;
    coverImage: string | null;
}

interface UnifiedMediaItem {
    id: string;
    mediaId?: string | null;
    url: string;
    thumbUrl: string;
    kind: 'image' | 'video';
    origin: 'solicitud' | 'campana' | 'biblioteca';
    originLabel: string;
    title: string;
    credit: string;
    context: string;
}

export const VideoReportWorkflow: React.FC = () => {
    const { club } = useClub();

    // ── Paso actual del Wizard ──
    const [step, setStep] = useState<number>(1);

    // ── Paso 1: Campaña ──
    const [campaigns, setCampaigns] = useState<CampaignOption[]>([]);
    const [selectedCampaignId, setSelectedCampaignId] = useState<string>('');
    const [campaignFacts, setCampaignFacts] = useState<any | null>(null);
    const [loadingCampaigns, setLoadingCampaigns] = useState<boolean>(true);

    // ── Paso 2: Contexto Editorial ──
    const [editorialContext, setEditorialContext] = useState<string>('');

    // ── Paso 3: Brief del Video ──
    const [videoTitle, setVideoTitle] = useState<string>('');
    const [objective, setObjective] = useState<string>('informe_final');
    const [audience, setAudience] = useState<string>('publico_general');
    const [targetDuration, setTargetDuration] = useState<string>('120_180');
    const [format, setFormat] = useState<string>('16:9');
    const [selectedTones, setSelectedTones] = useState<string[]>(['institucional', 'humano']);
    const [productionMode, setProductionMode] = useState<'economico' | 'equilibrado' | 'cinematografico'>('equilibrado');

    // ── Paso 4: Multimedia Unificada ──
    const [mediaItems, setMediaItems] = useState<UnifiedMediaItem[]>([]);
    const [mediaTab, setMediaTab] = useState<string>('todos');
    const [mediaSearch, setMediaSearch] = useState<string>('');
    const [loadingMedia, setLoadingMedia] = useState<boolean>(false);

    // ── Proyecto Activo & Estado ──
    const [project, setProject] = useState<VideoReportProjectData | null>(null);
    const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);

    // ── Audio & Locución ──
    const [ttsProvider, setTtsProvider] = useState<'elevenlabs' | 'openai'>('elevenlabs');
    const [ttsVoice, setTtsVoice] = useState<string>('es_latam');
    const [ttsGender, setTtsGender] = useState<'female' | 'male'>('female');
    const [ttsSpeed, setTtsSpeed] = useState<number>(1.0);
    const [isPlayingSample, setIsPlayingSample] = useState<boolean>(false);
    const [synthesizingSceneId, setSynthesizingSceneId] = useState<string | null>(null);

    // ── Render Asíncrono ──
    const [renderJob, setRenderJob] = useState<any | null>(null);
    const [isRendering, setIsRendering] = useState<boolean>(false);
    const pollTimerRef = useRef<NodeJS.Timeout | null>(null);

    // ── Publicación & Biblioteca ──
    const [savedMediaId, setSavedMediaId] = useState<string | null>(null);
    const [isSavingLibrary, setIsSavingLibrary] = useState<boolean>(false);
    const [showShareModal, setShowShareModal] = useState<boolean>(false);

    // 1. Cargar campañas en scope al montar
    useEffect(() => {
        let mounted = true;
        setLoadingCampaigns(true);
        fetch(`${API}/content-studio/video-reports/campaigns`, { headers: authHeaders() })
            .then(res => res.json())
            .then(data => {
                if (mounted && data.campaigns) {
                    setCampaigns(data.campaigns);
                    if (data.campaigns.length > 0 && !selectedCampaignId) {
                        setSelectedCampaignId(data.campaigns[0].id);
                    }
                }
            })
            .catch(err => {
                console.error('[VideoReport] Error al cargar campañas:', err);
                toast.error('No se pudieron cargar las campañas disponibles');
            })
            .finally(() => {
                if (mounted) setLoadingCampaigns(false);
            });
        return () => { mounted = false; };
    }, []);

    // 2. Cargar hechos reales cuando cambia la campaña seleccionada
    useEffect(() => {
        if (!selectedCampaignId) return;
        fetch(`${API}/content-studio/video-reports/campaigns/${selectedCampaignId}/facts`, { headers: authHeaders() })
            .then(res => res.json())
            .then(data => {
                if (data.snapshot) {
                    setCampaignFacts(data.snapshot);
                    if (!videoTitle) {
                        setVideoTitle(`Informe: ${data.snapshot.name}`);
                    }
                }
            })
            .catch(err => console.warn('[VideoReport] Error cargando facts:', err));
    }, [selectedCampaignId]);

    // 3. Cargar multimedia unificada para la campaña
    const loadUnifiedMedia = useCallback(() => {
        if (!selectedCampaignId) return;
        setLoadingMedia(true);
        const query = new URLSearchParams({ tab: mediaTab, search: mediaSearch });
        fetch(`${API}/content-studio/video-reports/campaigns/${selectedCampaignId}/media?${query.toString()}`, {
            headers: authHeaders()
        })
            .then(res => res.json())
            .then(data => {
                if (data.media) setMediaItems(data.media);
            })
            .catch(err => console.error('[VideoReport] Error cargando media:', err))
            .finally(() => setLoadingMedia(false));
    }, [selectedCampaignId, mediaTab, mediaSearch]);

    useEffect(() => {
        loadUnifiedMedia();
    }, [loadUnifiedMedia]);

    // 4. Crear Proyecto & Generar Guion con IA
    const handleGenerateProject = async () => {
        if (!selectedCampaignId) {
            toast.error('Por favor selecciona una campaña');
            return;
        }
        setIsAnalyzing(true);
        try {
            const res = await fetch(`${API}/content-studio/video-reports/projects`, {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({
                    campaignId: selectedCampaignId,
                    title: videoTitle || campaignFacts?.headline || 'Video Informe',
                    objective,
                    audience,
                    format,
                    targetDurationSec: REPORT_DURATIONS[targetDuration]?.targetSec || 120,
                    tone: selectedTones.join(', '),
                    productionMode,
                    editorialContext
                })
            });
            const data = await res.json();
            if (!res.ok || data.error) {
                throw new Error(data.error || 'Error al generar la propuesta');
            }
            setProject(data.project);
            setStep(5); // Avanzar a Storyboard / Guion
            toast.success('¡Plan del Video generado exitosamente!');
        } catch (e: any) {
            console.error('[VideoReport] Error creando proyecto:', e);
            toast.error(e.message || 'No se pudo generar el plan del video');
        } finally {
            setIsAnalyzing(false);
        }
    };

    // 5. Actualizar Escena en vivo
    const handleUpdateScene = async (sceneId: string, patch: Partial<VideoReportSceneData>) => {
        if (!project) return;
        // Optimistic update
        setProject(prev => {
            if (!prev || !prev.currentVersion) return prev;
            return {
                ...prev,
                currentVersion: {
                    ...prev.currentVersion,
                    scenes: prev.currentVersion.scenes.map(s => s.id === sceneId ? { ...s, ...patch } : s)
                }
            };
        });

        try {
            await fetch(`${API}/content-studio/video-reports/projects/${project.id}/scenes/${sceneId}`, {
                method: 'PATCH',
                headers: authHeaders(),
                body: JSON.stringify(patch)
            });
        } catch (e) {
            console.warn('[VideoReport] Error persistiendo escena:', e);
        }
    };

    // 6. Escuchar muestra de voz TTS
    const handlePlayVoiceSample = async () => {
        if (isPlayingSample) return;
        setIsPlayingSample(true);
        try {
            const res = await fetch(`${API}/content-studio/video-reports/voice-preview`, {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({ provider: ttsProvider, gender: ttsGender, speed: ttsSpeed })
            });
            if (!res.ok) throw new Error('Error al generar muestra');
            const blob = await res.blob();
            const audioUrl = URL.createObjectURL(blob);
            const audio = new Audio(audioUrl);
            audio.onended = () => setIsPlayingSample(false);
            audio.onerror = () => setIsPlayingSample(false);
            audio.play();
        } catch (e) {
            toast.error('No se pudo reproducir la muestra de voz');
            setIsPlayingSample(false);
        }
    };

    // 7. Sintetizar voz de una escena específica
    const handleSynthesizeScene = async (sceneId: string) => {
        if (!project) return;
        setSynthesizingSceneId(sceneId);
        try {
            const res = await fetch(`${API}/content-studio/video-reports/projects/${project.id}/scenes/${sceneId}/voice`, {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({
                    provider: ttsProvider,
                    voice: ttsVoice,
                    speed: ttsSpeed,
                    gender: ttsGender
                })
            });
            const data = await res.json();
            if (!res.ok || data.error) throw new Error(data.error || 'Error al generar locución');

            // Actualizar escena localmente
            handleUpdateScene(sceneId, {
                voiceAudioUrl: data.voiceAudioUrl,
                voiceAudioDurationSec: data.voiceAudioDurationSec,
                durationSec: data.durationSec
            });
            toast.success('Locución generada y sincronizada');
        } catch (e: any) {
            toast.error(e.message || 'No se pudo generar la voz para esta escena');
        } finally {
            setSynthesizingSceneId(null);
        }
    };

    // 8. Iniciar Render Asíncrono
    const handleStartRender = async () => {
        if (!project) return;
        setIsRendering(true);
        try {
            const res = await fetch(`${API}/content-studio/video-reports/projects/${project.id}/render`, {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({ format, resolution: '1080p' })
            });
            const data = await res.json();
            if (!res.ok || data.error) throw new Error(data.error || 'Error al lanzar el render');

            setRenderJob({ id: data.renderId, status: 'rendering', progress: 10 });
            setStep(7); // Paso de Render y Publicación
            toast.info('Renderizado iniciado en segundo plano');

            // Iniciar sondeo seguro
            startRenderPolling();
        } catch (e: any) {
            toast.error(e.message || 'No se pudo iniciar el render');
            setIsRendering(false);
        }
    };

    // Polling del estado de render
    const startRenderPolling = useCallback(() => {
        if (!project) return;
        if (pollTimerRef.current) clearInterval(pollTimerRef.current);

        pollTimerRef.current = setInterval(async () => {
            try {
                const res = await fetch(`${API}/content-studio/video-reports/projects/${project.id}/sync`, {
                    headers: authHeaders()
                });
                const data = await res.json();
                if (data.render) {
                    setRenderJob(data.render);
                    if (data.render.status === 'ready') {
                        setIsRendering(false);
                        clearInterval(pollTimerRef.current!);
                        toast.success('¡Video Informe finalizado con éxito!');
                    } else if (data.render.status === 'failed') {
                        setIsRendering(false);
                        clearInterval(pollTimerRef.current!);
                        toast.error(`Error en el render: ${data.render.error || 'Fallo desconocido'}`);
                    }
                }
            } catch (e) {
                console.warn('[VideoReport] Sondeo de render falló:', e);
            }
        }, 3000);
    }, [project]);

    useEffect(() => {
        return () => {
            if (pollTimerRef.current) clearInterval(pollTimerRef.current);
        };
    }, []);

    // 9. Guardar en Biblioteca Multimedia
    const handleSaveToLibrary = async () => {
        if (!project) return;
        setIsSavingLibrary(true);
        try {
            const res = await fetch(`${API}/content-studio/video-reports/projects/${project.id}/library`, {
                method: 'POST',
                headers: authHeaders()
            });
            const data = await res.json();
            if (!res.ok || data.error) throw new Error(data.error || 'Error al guardar');
            setSavedMediaId(data.mediaId);
            toast.success('Video Informe archivado en la Biblioteca Multimedia');
        } catch (e: any) {
            toast.error(e.message || 'No se pudo guardar en la biblioteca');
        } finally {
            setIsSavingLibrary(false);
        }
    };

    // Cálculo dinámico de créditos
    const scenes = project?.currentVersion?.scenes || [];
    const totalWords = scenes.reduce((acc, s) => acc + (s.narrationText?.trim().split(/\s+/).filter(Boolean).length || 0), 0);
    const freeAnimations = scenes.filter(s => s.engineMode !== 'kling').length;
    const aiVideoScenes = scenes.filter(s => s.engineMode === 'kling').length;
    const estimatedAiCredits = aiVideoScenes * 20;

    return (
        <div className="w-full flex flex-col gap-8 pb-16">
            {/* Header del Asistente */}
            <div className="bg-gradient-to-r from-indigo-900 via-indigo-950 to-slate-900 rounded-3xl p-8 text-white shadow-xl relative overflow-hidden border border-indigo-800/40">
                <div className="absolute right-0 top-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 relative z-10">
                    <div>
                        <div className="flex items-center gap-3 mb-2">
                            <span className="px-3 py-1 bg-indigo-500/30 text-indigo-300 text-xs font-black uppercase tracking-wider rounded-lg border border-indigo-400/30">
                                Producción Institucional IA
                            </span>
                            <span className="text-xs text-gray-400 font-medium">Entorno de Producción</span>
                        </div>
                        <h2 className="text-3xl font-black tracking-tight text-white">Video Informe IA</h2>
                        <p className="text-gray-300 text-sm mt-1 max-w-2xl font-medium">
                            Transforma toda la recaudación, testimonios y solicitudes de una campaña en un documental audiovisual profesional con control factual estricto y cero alucinaciones.
                        </p>
                    </div>

                    {/* Selector de Pasos */}
                    <div className="flex items-center gap-2 bg-black/40 backdrop-blur-md p-1.5 rounded-2xl border border-white/10">
                        {[
                            { num: 1, label: 'Campaña' },
                            { num: 2, label: 'Contexto' },
                            { num: 3, label: 'Brief' },
                            { num: 4, label: 'Multimedia' },
                            { num: 5, label: 'Storyboard' },
                            { num: 6, label: 'Locución' },
                            { num: 7, label: 'Render' }
                        ].map(s => (
                            <button
                                key={s.num}
                                type="button"
                                onClick={() => {
                                    if (s.num <= (project ? 7 : 4)) setStep(s.num);
                                }}
                                className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all ${
                                    step === s.num
                                        ? 'bg-indigo-600 text-white shadow-md'
                                        : s.num <= (project ? 7 : 4)
                                        ? 'text-gray-300 hover:text-white hover:bg-white/5'
                                        : 'text-gray-600 cursor-not-allowed'
                                }`}
                            >
                                {s.num}. {s.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* ── PASO 1: Fuente y Selección de Campaña ── */}
            {step === 1 && (
                <div className="bg-white rounded-3xl border border-gray-100 p-8 shadow-sm flex flex-col gap-6">
                    <div>
                        <h3 className="text-xl font-black text-gray-900">1. ¿Sobre qué campaña deseas crear el informe?</h3>
                        <p className="text-sm text-gray-500 font-medium mt-1">
                            Selecciona una Campaña de Contribución activa. El sistema cargará automáticamente los fondos recaudados, aportes, solicitudes de contenido y ciudades participantes.
                        </p>
                    </div>

                    {loadingCampaigns ? (
                        <div className="flex items-center justify-center p-12 text-indigo-600">
                            <Loader2 className="w-8 h-8 animate-spin" />
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {campaigns.map(c => {
                                const isSelected = selectedCampaignId === c.id;
                                return (
                                    <div
                                        key={c.id}
                                        onClick={() => setSelectedCampaignId(c.id)}
                                        className={`cursor-pointer rounded-2xl p-5 border-2 transition-all flex flex-col justify-between ${
                                            isSelected
                                                ? 'border-indigo-600 bg-indigo-50/40 shadow-sm'
                                                : 'border-gray-100 hover:border-indigo-200 bg-white'
                                        }`}
                                    >
                                        <div className="flex flex-col gap-2">
                                            <div className="flex items-center justify-between">
                                                <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-gray-100 text-gray-700">
                                                    {c.campaignType}
                                                </span>
                                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                                                    c.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-600'
                                                }`}>
                                                    {c.status === 'active' ? 'En marcha' : c.status}
                                                </span>
                                            </div>
                                            <h4 className="font-black text-gray-900 text-base line-clamp-2">{c.name}</h4>
                                        </div>

                                        <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-xs font-bold text-indigo-600">
                                            <span>Seleccionar Campaña</span>
                                            <ChevronRight className="w-4 h-4" />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* Resumen Factual Inmutable si hay campaña seleccionada */}
                    {campaignFacts && (
                        <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-6 mt-2">
                            <div className="flex items-center gap-2 mb-3">
                                <ShieldCheck className="w-5 h-5 text-indigo-600" />
                                <h4 className="font-black text-gray-900 text-sm uppercase tracking-wide">
                                    Hechos Reales Extraídos de la Plataforma (Cero Alucinaciones)
                                </h4>
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                                <div className="bg-white p-3 rounded-xl border border-gray-100">
                                    <span className="text-gray-400 block text-[10px] font-black uppercase">Recaudación Real</span>
                                    <span className="font-black text-gray-900 text-sm mt-0.5 block">
                                        {campaignFacts.donations?.length
                                            ? campaignFacts.donations.map((d: any) => `${d.currency} ${Math.round(d.amountSum).toLocaleString()}`).join(' / ')
                                            : 'Solidaridad Activa'}
                                    </span>
                                </div>
                                <div className="bg-white p-3 rounded-xl border border-gray-100">
                                    <span className="text-gray-400 block text-[10px] font-black uppercase">Solicitudes en Campo</span>
                                    <span className="font-black text-indigo-600 text-sm mt-0.5 block">
                                        {campaignFacts.submissions?.count || 0} documentadas
                                    </span>
                                </div>
                                <div className="bg-white p-3 rounded-xl border border-gray-100">
                                    <span className="text-gray-400 block text-[10px] font-black uppercase">Municipios / Territorios</span>
                                    <span className="font-black text-gray-900 text-sm mt-0.5 block truncate">
                                        {campaignFacts.submissions?.locations?.slice(0, 3).join(', ') || 'Nacional'}
                                    </span>
                                </div>
                                <div className="bg-white p-3 rounded-xl border border-gray-100">
                                    <span className="text-gray-400 block text-[10px] font-black uppercase">Clubes Involucrados</span>
                                    <span className="font-black text-gray-900 text-sm mt-0.5 block truncate">
                                        {campaignFacts.submissions?.clubs?.length || 0} Clubes
                                    </span>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="flex justify-end pt-4">
                        <button
                            type="button"
                            onClick={() => setStep(2)}
                            disabled={!selectedCampaignId}
                            className="px-6 py-3 bg-indigo-600 text-white font-black text-sm rounded-xl hover:bg-indigo-700 transition-all flex items-center gap-2 shadow-lg shadow-indigo-600/20 disabled:opacity-50"
                        >
                            Siguiente: Contexto Editorial <ArrowRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            )}

            {/* ── PASO 2: Contexto Editorial (Word / Reportes) ── */}
            {step === 2 && (
                <div className="bg-white rounded-3xl border border-gray-100 p-8 shadow-sm flex flex-col gap-6">
                    <div>
                        <h3 className="text-xl font-black text-gray-900">2. Contexto Editorial del Informe</h3>
                        <p className="text-sm text-gray-500 font-medium mt-1">
                            Pega aquí el contenido completo proveniente de un documento Word, reporte de misión, actas de entrega, testimonios de beneficiarios o notas institucionales. La IA utilizará esta información como fuente permitida.
                        </p>
                    </div>

                    <div className="flex flex-col gap-2">
                        <div className="flex justify-between items-center text-xs text-gray-500 font-bold">
                            <span>Información complementaria suministrada</span>
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={() => setEditorialContext('')}
                                    className="text-gray-400 hover:text-red-500 transition-colors"
                                >
                                    Limpiar texto
                                </button>
                            </div>
                        </div>

                        <textarea
                            value={editorialContext}
                            onChange={(e) => setEditorialContext(e.target.value)}
                            placeholder="Pega aquí el contexto completo de la campaña, antecedentes, acciones realizadas en terreno, resultados, testimonios y cualquier información que deba conocer la IA..."
                            rows={12}
                            className="w-full p-4 rounded-2xl border border-gray-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none text-sm font-medium text-gray-800 placeholder:text-gray-400 transition-all leading-relaxed"
                        />
                        <span className="text-[11px] text-gray-400 font-medium">
                            {editorialContext.length} caracteres · Todo testimonio o cifra que pegues acá quedará autorizado para citarse en el guion.
                        </span>
                    </div>

                    <div className="flex justify-between pt-4 border-t border-gray-100">
                        <button
                            type="button"
                            onClick={() => setStep(1)}
                            className="px-6 py-3 border border-gray-200 text-gray-700 font-black text-sm rounded-xl hover:bg-gray-50 transition-all flex items-center gap-2"
                        >
                            <ArrowLeft className="w-4 h-4" /> Volver
                        </button>
                        <button
                            type="button"
                            onClick={() => setStep(3)}
                            className="px-6 py-3 bg-indigo-600 text-white font-black text-sm rounded-xl hover:bg-indigo-700 transition-all flex items-center gap-2 shadow-lg shadow-indigo-600/20"
                        >
                            Siguiente: Brief del Video <ArrowRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            )}

            {/* ── PASO 3: Brief del Video ── */}
            {step === 3 && (
                <div className="bg-white rounded-3xl border border-gray-100 p-8 shadow-sm flex flex-col gap-8">
                    <div>
                        <h3 className="text-xl font-black text-gray-900">3. Brief y Enfoque del Video</h3>
                        <p className="text-sm text-gray-500 font-medium mt-1">
                            Configura el objetivo, audiencia, duración esperada, formato de pantalla y tonos editoriales.
                        </p>
                    </div>

                    {/* Título */}
                    <div>
                        <label className="block text-xs font-black uppercase tracking-wider text-gray-500 mb-2">
                            Título del Video Informe
                        </label>
                        <input
                            type="text"
                            value={videoTitle}
                            onChange={(e) => setVideoTitle(e.target.value)}
                            placeholder="Ej: Emergencia Terremoto Colombia 2026 — Solidaridad Rotaria en Acción"
                            className="w-full p-4 rounded-xl border border-gray-200 focus:border-indigo-500 outline-none text-base font-bold text-gray-900"
                        />
                    </div>

                    {/* Objetivo */}
                    <div>
                        <label className="block text-xs font-black uppercase tracking-wider text-gray-500 mb-3">
                            Objetivo Principal
                        </label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            {Object.values(REPORT_OBJECTIVES).map(obj => (
                                <button
                                    key={obj.id}
                                    type="button"
                                    onClick={() => setObjective(obj.id)}
                                    className={`text-left p-4 rounded-2xl border-2 transition-all ${
                                        objective === obj.id
                                            ? 'border-indigo-600 bg-indigo-50/40 text-indigo-950 font-bold'
                                            : 'border-gray-100 hover:border-gray-200 text-gray-700'
                                    }`}
                                >
                                    <span className="block text-sm font-black">{obj.label}</span>
                                    <span className="block text-xs text-gray-500 mt-1">{obj.desc}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Formato y Duración */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-xs font-black uppercase tracking-wider text-gray-500 mb-2">
                                Formato de Video
                            </label>
                            <div className="grid grid-cols-2 gap-2">
                                {Object.values(REPORT_FORMATS).map(fmt => (
                                    <button
                                        key={fmt.id}
                                        type="button"
                                        onClick={() => setFormat(fmt.id)}
                                        className={`p-3 rounded-xl border-2 text-left transition-all ${
                                            format === fmt.id
                                                ? 'border-indigo-600 bg-indigo-50 text-indigo-900 font-bold'
                                                : 'border-gray-100 text-gray-600 hover:border-gray-200'
                                        }`}
                                    >
                                        <span className="block text-xs font-black">{fmt.id}</span>
                                        <span className="block text-[11px] text-gray-500 truncate">{fmt.recommendedFor}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-black uppercase tracking-wider text-gray-500 mb-2">
                                Duración Objetivo
                            </label>
                            <div className="grid grid-cols-2 gap-2">
                                {Object.values(REPORT_DURATIONS).map(dur => (
                                    <button
                                        key={dur.id}
                                        type="button"
                                        onClick={() => setTargetDuration(dur.id)}
                                        className={`p-3 rounded-xl border-2 text-left transition-all ${
                                            targetDuration === dur.id
                                                ? 'border-indigo-600 bg-indigo-50 text-indigo-900 font-bold'
                                                : 'border-gray-100 text-gray-600 hover:border-gray-200'
                                        }`}
                                    >
                                        <span className="block text-xs font-black">{dur.label}</span>
                                        <span className="block text-[11px] text-gray-400">~{dur.scenesTarget} escenas sugeridas</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Modo de Producción (Control Crítico de Costos) */}
                    <div>
                        <div className="flex items-center justify-between mb-3">
                            <label className="block text-xs font-black uppercase tracking-wider text-gray-500">
                                Modo de Producción & Optimización de Costos
                            </label>
                            <span className="text-xs font-bold text-emerald-600 flex items-center gap-1">
                                <Coins className="w-3.5 h-3.5" /> Animación Ken Burns 100% Gratuita
                            </span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            {[
                                { id: 'economico', label: 'Económico', desc: '0 Créditos IA en video. Fotografías con Ken Burns/Paneos de alta calidad mediante render convencional.', tag: 'Sin IA generativa' },
                                { id: 'equilibrado', label: 'Equilibrado (Recomendado)', desc: '80% recursos existentes + animaciones gratuitas. Permite elegir 1 o 2 escenas clave para video con IA.', tag: 'Balance óptimo' },
                                { id: 'cinematografico', label: 'Cinematográfico', desc: 'Mayor densidad generativa de clips IA (Kling 2.6). Control manual estricto antes de cada consumo.', tag: 'Mayor fidelidad IA' }
                            ].map(m => (
                                <button
                                    key={m.id}
                                    type="button"
                                    onClick={() => setProductionMode(m.id as any)}
                                    className={`p-4 rounded-2xl border-2 text-left transition-all ${
                                        productionMode === m.id
                                            ? 'border-indigo-600 bg-indigo-50/40'
                                            : 'border-gray-100 hover:border-gray-200'
                                    }`}
                                >
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="font-black text-sm text-gray-900">{m.label}</span>
                                        <span className="text-[10px] font-bold px-2 py-0.5 bg-gray-100 text-gray-600 rounded">
                                            {m.tag}
                                        </span>
                                    </div>
                                    <p className="text-xs text-gray-500 leading-snug mt-1">{m.desc}</p>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="flex justify-between pt-4 border-t border-gray-100">
                        <button
                            type="button"
                            onClick={() => setStep(2)}
                            className="px-6 py-3 border border-gray-200 text-gray-700 font-black text-sm rounded-xl hover:bg-gray-50 transition-all flex items-center gap-2"
                        >
                            <ArrowLeft className="w-4 h-4" /> Volver
                        </button>
                        <button
                            type="button"
                            onClick={() => setStep(4)}
                            className="px-6 py-3 bg-indigo-600 text-white font-black text-sm rounded-xl hover:bg-indigo-700 transition-all flex items-center gap-2 shadow-lg shadow-indigo-600/20"
                        >
                            Siguiente: Banco Multimedia <ArrowRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            )}

            {/* ── PASO 4: Banco Multimedia Unificado ── */}
            {step === 4 && (
                <div className="bg-white rounded-3xl border border-gray-100 p-8 shadow-sm flex flex-col gap-6">
                    <div>
                        <h3 className="text-xl font-black text-gray-900">4. Recursos Multimedia de la Campaña</h3>
                        <p className="text-sm text-gray-500 font-medium mt-1">
                            Consulta y explora todo el material disponible en el ecosistema: fotos y videos enviados por los clubes en territorio, material oficial de la campaña y assets de tu Biblioteca Multimedia.
                        </p>
                    </div>

                    {/* Filtros y Pestañas */}
                    <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
                        <div className="flex gap-1 bg-gray-100/80 p-1 rounded-xl w-full sm:w-auto overflow-x-auto">
                            {['todos', 'solicitudes', 'campana', 'biblioteca', 'videos', 'imagenes'].map(t => (
                                <button
                                    key={t}
                                    type="button"
                                    onClick={() => setMediaTab(t)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase transition-all capitalize ${
                                        mediaTab === t
                                            ? 'bg-white text-indigo-600 shadow-sm'
                                            : 'text-gray-500 hover:text-gray-800'
                                    }`}
                                >
                                    {t}
                                </button>
                            ))}
                        </div>

                        <input
                            type="text"
                            value={mediaSearch}
                            onChange={(e) => setMediaSearch(e.target.value)}
                            placeholder="Buscar en el material..."
                            className="p-2.5 px-4 rounded-xl border border-gray-200 text-xs font-medium w-full sm:w-64 outline-none focus:border-indigo-500"
                        />
                    </div>

                    {/* Galería de Activos */}
                    {loadingMedia ? (
                        <div className="p-16 flex items-center justify-center text-indigo-600">
                            <Loader2 className="w-8 h-8 animate-spin" />
                        </div>
                    ) : mediaItems.length === 0 ? (
                        <div className="p-12 text-center text-gray-400 font-medium border border-dashed rounded-2xl">
                            No se encontraron recursos con los filtros actuales.
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 max-h-[420px] overflow-y-auto p-1">
                            {mediaItems.map(item => (
                                <div
                                    key={item.id}
                                    className="group relative aspect-video bg-gray-900 rounded-xl overflow-hidden border border-gray-100 shadow-sm"
                                >
                                    <img
                                        src={item.thumbUrl || item.url}
                                        alt={item.title}
                                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                                    />
                                    <span className="absolute top-1.5 left-1.5 text-[9px] font-black uppercase tracking-wider text-white bg-black/60 backdrop-blur-sm px-1.5 py-0.5 rounded">
                                        {item.originLabel}
                                    </span>
                                    {item.kind === 'video' && (
                                        <span className="absolute bottom-1.5 right-1.5 p-1 bg-indigo-600 text-white rounded-full">
                                            <Film className="w-3 h-3" />
                                        </span>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="flex justify-between pt-4 border-t border-gray-100">
                        <button
                            type="button"
                            onClick={() => setStep(3)}
                            className="px-6 py-3 border border-gray-200 text-gray-700 font-black text-sm rounded-xl hover:bg-gray-50 transition-all flex items-center gap-2"
                        >
                            <ArrowLeft className="w-4 h-4" /> Volver
                        </button>
                        <button
                            type="button"
                            onClick={handleGenerateProject}
                            disabled={isAnalyzing}
                            className="px-8 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-black text-sm rounded-xl hover:from-indigo-700 hover:to-purple-700 transition-all flex items-center gap-2 shadow-xl shadow-indigo-600/30 disabled:opacity-50"
                        >
                            {isAnalyzing ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" /> Analizando campaña y construyendo guion...
                                </>
                            ) : (
                                <>
                                    <Wand2 className="w-4 h-4" /> Generar Plan del Video y Guion IA <ArrowRight className="w-4 h-4" />
                                </>
                            )}
                        </button>
                    </div>
                </div>
            )}

            {/* ── PASO 5: Storyboard Interactivo y Guion de Escenas ── */}
            {step === 5 && project && (
                <div className="bg-white rounded-3xl border border-gray-100 p-8 shadow-sm flex flex-col gap-6">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-gray-100 pb-4">
                        <div>
                            <span className="text-[10px] font-black uppercase tracking-wider text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-md">
                                Storyboard & Guion Aprobado
                            </span>
                            <h3 className="text-xl font-black text-gray-900 mt-1">{project.title}</h3>
                            <p className="text-xs text-gray-500 font-medium">
                                {scenes.length} escenas estructuradas · {Math.round(scenes.reduce((a, s) => a + s.durationSec, 0))}s de metraje total estimado
                            </p>
                        </div>

                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={() => setStep(6)}
                                className="px-5 py-2.5 bg-indigo-600 text-white font-black text-xs rounded-xl hover:bg-indigo-700 transition-all flex items-center gap-2 shadow-md shadow-indigo-600/20"
                            >
                                Siguiente: Locución & Audio <ArrowRight className="w-4 h-4" />
                            </button>
                        </div>
                    </div>

                    {/* Lista de Escenas del Storyboard */}
                    <div className="flex flex-col gap-4">
                        {scenes.map((scene, idx) => (
                            <div
                                key={scene.id}
                                className="border border-gray-200/80 rounded-2xl p-5 bg-white hover:border-indigo-300 transition-all flex flex-col md:flex-row gap-5 items-start"
                            >
                                {/* Thumbnail y selector de movimiento */}
                                <div className="w-full md:w-56 flex-shrink-0 flex flex-col gap-2">
                                    <div className="relative aspect-video bg-gray-900 rounded-xl overflow-hidden shadow-inner">
                                        {scene.mediaUrl ? (
                                            <img
                                                src={scene.thumbUrl || scene.mediaUrl}
                                                alt="Escena"
                                                className="w-full h-full object-cover"
                                            />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-gray-500 text-xs">
                                                Placa de datos
                                            </div>
                                        )}
                                        <span className="absolute top-2 left-2 px-2 py-0.5 bg-black/70 text-white text-[10px] font-black rounded backdrop-blur-sm">
                                            #{idx + 1} · {scene.durationSec}s
                                        </span>
                                    </div>

                                    {/* Selector de Movimiento Ken Burns (0 créditos) */}
                                    <select
                                        value={scene.motionType}
                                        onChange={(e) => handleUpdateScene(scene.id, { motionType: e.target.value })}
                                        className="w-full p-2 bg-gray-50 border border-gray-200 rounded-lg text-xs font-bold text-gray-700 outline-none"
                                    >
                                        {Object.values(MOTION_TYPES).map(m => (
                                            <option key={m.id} value={m.id}>
                                                {m.label} (Sin IA · 0 cred)
                                            </option>
                                        ))}
                                    </select>

                                    {/* Toggle Opcional: Convertir a Video IA */}
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const nextEngine = scene.engineMode === 'kling' ? 'motion' : 'kling';
                                            handleUpdateScene(scene.id, { engineMode: nextEngine });
                                        }}
                                        className={`w-full py-1.5 px-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 border ${
                                            scene.engineMode === 'kling'
                                                ? 'bg-purple-600 text-white border-purple-600 shadow-sm'
                                                : 'bg-white text-gray-500 border-gray-200 hover:border-purple-300'
                                        }`}
                                    >
                                        <Sparkles className="w-3 h-3" />
                                        {scene.engineMode === 'kling' ? 'Video IA Activado (20 cr)' : 'Convertir a Video IA'}
                                    </button>
                                </div>

                                {/* Contenido Editorial & Locución */}
                                <div className="flex-1 flex flex-col gap-3 w-full">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-black text-indigo-700 uppercase tracking-wider">
                                            Capítulo: {scene.chapter}
                                        </span>
                                        {scene.factSource && (
                                            <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 flex items-center gap-1">
                                                <ShieldCheck className="w-3 h-3" /> Fuente: {scene.factSource.source}
                                            </span>
                                        )}
                                    </div>

                                    <div>
                                        <label className="block text-[11px] font-black uppercase tracking-wider text-gray-400 mb-1">
                                            Locución narrada (Voz en off)
                                        </label>
                                        <textarea
                                            value={scene.narrationText}
                                            onChange={(e) => handleUpdateScene(scene.id, { narrationText: e.target.value })}
                                            rows={2}
                                            className="w-full p-2.5 rounded-xl border border-gray-200 text-xs font-medium text-gray-800 outline-none focus:border-indigo-500 leading-relaxed"
                                        />
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <div>
                                            <label className="block text-[10px] font-black uppercase text-gray-400 mb-1">
                                                Texto en pantalla (Título)
                                            </label>
                                            <input
                                                type="text"
                                                value={scene.onScreenTitle || ''}
                                                onChange={(e) => handleUpdateScene(scene.id, { onScreenTitle: e.target.value })}
                                                className="w-full p-2 rounded-lg border border-gray-200 text-xs font-bold text-gray-900"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-black uppercase text-gray-400 mb-1">
                                                Subtítulo / Cifra destacada
                                            </label>
                                            <input
                                                type="text"
                                                value={scene.onScreenSubtitle || ''}
                                                onChange={(e) => handleUpdateScene(scene.id, { onScreenSubtitle: e.target.value })}
                                                className="w-full p-2 rounded-lg border border-gray-200 text-xs text-gray-700"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ── PASO 6: Locución & Diseño Sonoro ── */}
            {step === 6 && project && (
                <div className="bg-white rounded-3xl border border-gray-100 p-8 shadow-sm flex flex-col gap-6">
                    <div>
                        <h3 className="text-xl font-black text-gray-900">6. Voz del Informe & Banda Sonora</h3>
                        <p className="text-sm text-gray-500 font-medium mt-1">
                            Elige la voz en off institucional. Podés regenerar la locución escena por escena sin tener que volver a sintetizar todo el video.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-slate-50 p-6 rounded-2xl border border-slate-200/60">
                        <div>
                            <label className="block text-xs font-black uppercase text-gray-500 mb-2">Motor de Voz</label>
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={() => setTtsProvider('elevenlabs')}
                                    className={`flex-1 py-2 rounded-xl text-xs font-black border transition-all ${
                                        ttsProvider === 'elevenlabs' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-700'
                                    }`}
                                >
                                    ElevenLabs (Latam)
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setTtsProvider('openai')}
                                    className={`flex-1 py-2 rounded-xl text-xs font-black border transition-all ${
                                        ttsProvider === 'openai' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-700'
                                    }`}
                                >
                                    OpenAI TTS
                                </button>
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-black uppercase text-gray-500 mb-2">Género / Estilo</label>
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={() => setTtsGender('female')}
                                    className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-all ${
                                        ttsGender === 'female' ? 'bg-indigo-50 border-indigo-600 text-indigo-700 font-black' : 'bg-white text-gray-700'
                                    }`}
                                >
                                    Femenina
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setTtsGender('male')}
                                    className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-all ${
                                        ttsGender === 'male' ? 'bg-indigo-50 border-indigo-600 text-indigo-700 font-black' : 'bg-white text-gray-700'
                                    }`}
                                >
                                    Masculina
                                </button>
                            </div>
                        </div>

                        <div className="flex flex-col justify-end">
                            <button
                                type="button"
                                onClick={handlePlayVoiceSample}
                                disabled={isPlayingSample}
                                className="w-full py-2.5 px-4 bg-white border border-indigo-200 text-indigo-700 font-black text-xs rounded-xl hover:bg-indigo-50 transition-all flex items-center justify-center gap-2 shadow-sm"
                            >
                                <Volume2 className="w-4 h-4" />
                                {isPlayingSample ? 'Reproduciendo muestra...' : 'Escuchar Muestra de Voz'}
                            </button>
                        </div>
                    </div>

                    {/* Acciones por Escena */}
                    <div className="flex flex-col gap-3 mt-4">
                        <h4 className="font-black text-gray-900 text-sm">Locución escena por escena:</h4>
                        {scenes.map((s, idx) => (
                            <div key={s.id} className="flex items-center justify-between p-3.5 bg-gray-50 rounded-xl border border-gray-100 text-xs">
                                <div className="flex items-center gap-3">
                                    <span className="font-black text-gray-400">#{idx + 1}</span>
                                    <span className="font-medium text-gray-800 line-clamp-1 max-w-lg">
                                        «{s.narrationText}»
                                    </span>
                                </div>
                                <div className="flex items-center gap-3">
                                    {s.voiceAudioUrl ? (
                                        <span className="text-emerald-600 font-bold flex items-center gap-1">
                                            <Check className="w-3.5 h-3.5" /> {s.voiceAudioDurationSec}s sintetizados
                                        </span>
                                    ) : (
                                        <span className="text-gray-400">Sin locución</span>
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => handleSynthesizeScene(s.id)}
                                        disabled={synthesizingSceneId === s.id}
                                        className="px-3 py-1.5 bg-white border border-gray-200 font-bold text-gray-700 rounded-lg hover:border-indigo-400 transition-all"
                                    >
                                        {synthesizingSceneId === s.id ? 'Sintetizando...' : 'Generar Voz'}
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="flex justify-between pt-4 border-t border-gray-100">
                        <button
                            type="button"
                            onClick={() => setStep(5)}
                            className="px-6 py-3 border border-gray-200 text-gray-700 font-black text-sm rounded-xl hover:bg-gray-50 transition-all flex items-center gap-2"
                        >
                            <ArrowLeft className="w-4 h-4" /> Storyboard
                        </button>
                        <button
                            type="button"
                            onClick={() => setStep(7)}
                            className="px-6 py-3 bg-indigo-600 text-white font-black text-sm rounded-xl hover:bg-indigo-700 transition-all flex items-center gap-2 shadow-lg shadow-indigo-600/20"
                        >
                            Siguiente: Preflight & Render <ArrowRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            )}

            {/* ── PASO 7: Preflight de Costos, Render Asíncrono y Publicación ── */}
            {step === 7 && project && (
                <div className="bg-white rounded-3xl border border-gray-100 p-8 shadow-sm flex flex-col gap-6">
                    <div>
                        <h3 className="text-xl font-black text-gray-900">7. Resumen de Producción & Render Final</h3>
                        <p className="text-sm text-gray-500 font-medium mt-1">
                            Previsualiza el balance de costos antes de consumir recursos. El render es asíncrono y no bloqueará tu navegador.
                        </p>
                    </div>

                    {/* Preflight Card */}
                    <div className="bg-slate-900 text-white rounded-2xl p-6 shadow-xl border border-slate-800">
                        <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-4">
                            <span className="text-xs font-black uppercase tracking-wider text-indigo-400">
                                Desglose de Producción
                            </span>
                            <span className="text-sm font-black text-emerald-400">
                                {estimatedAiCredits === 0 ? 'Sin consumo generativo de video' : `${estimatedAiCredits} Créditos IA estimados`}
                            </span>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                            <div>
                                <span className="text-gray-400 block">Total Escenas</span>
                                <span className="text-base font-black text-white">{scenes.length}</span>
                            </div>
                            <div>
                                <span className="text-gray-400 block">Animación Ken Burns</span>
                                <span className="text-base font-black text-emerald-400">{freeAnimations} (0 créditos)</span>
                            </div>
                            <div>
                                <span className="text-gray-400 block">Generación IA Video</span>
                                <span className="text-base font-black text-purple-400">{aiVideoScenes} escenas</span>
                            </div>
                            <div>
                                <span className="text-gray-400 block">Palabras de Locución</span>
                                <span className="text-base font-black text-white">{totalWords} palabras</span>
                            </div>
                        </div>
                    </div>

                    {/* Estado del Render */}
                    {renderJob && (
                        <div className="bg-indigo-50/50 border border-indigo-100 rounded-2xl p-6 flex flex-col gap-3">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Film className="w-5 h-5 text-indigo-600" />
                                    <span className="font-black text-sm text-gray-900">
                                        Estado del Render: {renderJob.status === 'ready' ? '¡Completado!' : 'En proceso...'}
                                    </span>
                                </div>
                                <span className="text-xs font-black text-indigo-600">{renderJob.progress || 0}%</span>
                            </div>

                            <div className="w-full bg-gray-200 h-2.5 rounded-full overflow-hidden">
                                <div
                                    className="bg-indigo-600 h-full transition-all duration-500 rounded-full"
                                    style={{ width: `${renderJob.progress || 10}%` }}
                                />
                            </div>

                            <span className="text-xs text-gray-500 font-medium">
                                {renderJob.statusNote || 'Componiendo escenas con FFmpeg...'}
                            </span>

                            {renderJob.status === 'ready' && renderJob.videoUrl && (
                                <div className="mt-4 flex flex-col gap-4">
                                    <video
                                        src={renderJob.videoUrl}
                                        controls
                                        className="w-full rounded-2xl shadow-lg bg-black aspect-video max-h-96 object-contain"
                                    />

                                    <div className="flex flex-wrap gap-3 pt-2">
                                        <a
                                            href={renderJob.videoUrl}
                                            download={`${project.title}.mp4`}
                                            className="px-5 py-2.5 bg-gray-900 text-white font-black text-xs rounded-xl hover:bg-black transition-all flex items-center gap-2 shadow"
                                        >
                                            <Download className="w-4 h-4" /> Descargar MP4
                                        </a>

                                        <button
                                            type="button"
                                            onClick={handleSaveToLibrary}
                                            disabled={isSavingLibrary || !!savedMediaId}
                                            className="px-5 py-2.5 bg-indigo-600 text-white font-black text-xs rounded-xl hover:bg-indigo-700 transition-all flex items-center gap-2 shadow-md shadow-indigo-600/20 disabled:opacity-50"
                                        >
                                            <Layers className="w-4 h-4" />
                                            {savedMediaId ? 'Guardado en Biblioteca' : isSavingLibrary ? 'Guardando...' : 'Guardar en Biblioteca'}
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => setShowShareModal(true)}
                                            className="px-5 py-2.5 bg-emerald-600 text-white font-black text-xs rounded-xl hover:bg-emerald-700 transition-all flex items-center gap-2 shadow-md shadow-emerald-600/20"
                                        >
                                            <Share2 className="w-4 h-4" /> Publicar en Redes Sociales
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {(!renderJob || renderJob.status !== 'ready') && (
                        <div className="flex justify-end pt-4">
                            <button
                                type="button"
                                onClick={handleStartRender}
                                disabled={isRendering}
                                className="px-8 py-3.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-black text-sm rounded-xl hover:from-indigo-700 hover:to-purple-700 transition-all flex items-center gap-2 shadow-xl shadow-indigo-600/30 disabled:opacity-50"
                            >
                                {isRendering ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" /> Renderizando Video Informe...
                                    </>
                                ) : (
                                    <>
                                        <Play className="w-4 h-4 fill-white" /> Confirmar y Renderizar Video Informe
                                    </>
                                )}
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* Modal de Publicación en Redes Integrado */}
            {showShareModal && renderJob?.videoUrl && (
                <ShareModal
                    isOpen={showShareModal}
                    onClose={() => setShowShareModal(false)}
                    mediaUrl={renderJob.videoUrl}
                    initialCopy={`${project?.title || 'Video Informe'}\n\nConocé los resultados de la campaña solidaria en territorio.`}
                    kind="video"
                />
            )}
        </div>
    );
};

export default VideoReportWorkflow;
