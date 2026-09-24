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
    Sliders, ChevronRight, BarChart3, HelpCircle, Loader2, X,
    FolderOpen
} from 'lucide-react';
import { toast } from 'sonner';
import {
    REPORT_FORMATS,
    REPORT_OBJECTIVES,
    REPORT_AUDIENCES,
    REPORT_DURATIONS,
    REPORT_TONES,
    MOTION_TYPES,
    REPORT_VOICE_LANGUAGES,
    distributeAssetDurations,
    getRecommendedAssetCount,
    type VideoReportFormat,
    type VideoReportProjectData,
    type VideoReportSceneData,
    type VideoReportSceneAsset
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
    clubName?: string | null;
    city?: string | null;
    mentionedInContext?: boolean;
    priorityScore?: number;
}

interface DetectedClubItem {
    name: string;
    count: number;
    mentioned: boolean;
}

export interface SceneAssetTarget {
    sceneId: string;
    assetIndex: number;
}

export interface VideoReportWorkflowProps {
    initialProjectId?: string | null;
    onBackToProjects?: () => void;
}

export const VideoReportWorkflow: React.FC<VideoReportWorkflowProps> = ({
    initialProjectId = null,
    onBackToProjects
}) => {
    const { club } = useClub();

    // ── Paso actual del Wizard ──
    const [step, setStep] = useState<number>(1);

    // ── Respaldo de Proyectos en Biblioteca & Estado de Carga ──
    const [savedProjects, setSavedProjects] = useState<any[]>([]);
    const [loadingSavedProjects, setLoadingSavedProjects] = useState<boolean>(false);
    const [isLoadingProject, setIsLoadingProject] = useState<boolean>(false);

    // ── Paso 1: Campaña ──
    const [campaigns, setCampaigns] = useState<CampaignOption[]>([]);
    const [selectedCampaignId, setSelectedCampaignId] = useState<string>('');
    const [campaignFacts, setCampaignFacts] = useState<any | null>(null);
    const [loadingCampaigns, setLoadingCampaigns] = useState<boolean>(true);

    // ── Paso 2: Guion & Contexto ──
    const [scriptMode, setScriptMode] = useState<'direct' | 'ai'>('direct');
    const [providedScript, setProvidedScript] = useState<string>('');
    const [editorialContext, setEditorialContext] = useState<string>('');
    const [videoTitle, setVideoTitle] = useState<string>('');
    const [objective, setObjective] = useState<string>('informe_final');
    const [audience, setAudience] = useState<string>('publico_general');
    const [targetDuration, setTargetDuration] = useState<string>('120_180');
    const [format, setFormat] = useState<string>('16:9');
    const [selectedTones, setSelectedTones] = useState<string[]>(['institucional', 'humano']);
    const [productionMode, setProductionMode] = useState<'economico' | 'equilibrado' | 'cinematografico'>('equilibrado');
    const [showFullMediaGallery, setShowFullMediaGallery] = useState<boolean>(false);

    // ── Paso 3: Multimedia Unificada & Detección de Clubes ──
    const [mediaItems, setMediaItems] = useState<UnifiedMediaItem[]>([]);
    const [mediaTab, setMediaTab] = useState<string>('todos');
    const [mediaSearch, setMediaSearch] = useState<string>('');
    const [loadingMedia, setLoadingMedia] = useState<boolean>(false);
    const [detectedClubs, setDetectedClubs] = useState<DetectedClubItem[]>([]);
    const [participatingClubs, setParticipatingClubs] = useState<DetectedClubItem[]>([]);
    const [selectedClubFilter, setSelectedClubFilter] = useState<string>('');
    const [priorityMediaCount, setPriorityMediaCount] = useState<number>(0);
    const [previewItem, setPreviewItem] = useState<UnifiedMediaItem | null>(null);
    const [sceneToReplaceAsset, setSceneToReplaceAsset] = useState<SceneAssetTarget | null>(null);

    // ── Proyecto Activo & Estado ──
    const [project, setProject] = useState<VideoReportProjectData | null>(null);
    const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);

    // ── Audio & Locución (Motor KIE / ElevenLabs / Acentos Regionales) ──
    const [ttsProvider, setTtsProvider] = useState<'elevenlabs' | 'openai'>('elevenlabs');
    const [ttsLanguage, setTtsLanguage] = useState<string>('es-CO');
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

    // Cargar proyectos existentes respaldados en la biblioteca
    const loadSavedProjects = useCallback(async () => {
        setLoadingSavedProjects(true);
        try {
            const res = await fetch(`${API}/content-studio/video-reports/projects`, { headers: authHeaders() });
            const data = await res.json();
            if (data.projects) {
                setSavedProjects(data.projects);
            }
        } catch (e) {
            console.warn('[VideoReport] Error cargando proyectos guardados:', e);
        } finally {
            setLoadingSavedProjects(false);
        }
    }, []);

    useEffect(() => {
        loadSavedProjects();
    }, [loadSavedProjects]);

    // Abrir proyecto guardado y cargar su línea de tiempo
    const handleOpenProject = useCallback(async (projectId: string) => {
        setIsLoadingProject(true);
        try {
            const res = await fetch(`${API}/content-studio/video-reports/projects/${projectId}`, {
                headers: authHeaders()
            });
            const data = await res.json();
            if (!res.ok || !data.project) {
                throw new Error(data.error || 'No se pudo cargar el proyecto');
            }
            const p = data.project;
            setProject(p);
            if (p.campaignId) setSelectedCampaignId(p.campaignId);
            if (p.title) setVideoTitle(p.title);
            if (p.format) setFormat(p.format);
            if (p.objective) setObjective(p.objective);
            if (p.audience) setAudience(p.audience);
            if (p.productionMode) setProductionMode(p.productionMode);
            if (p.scriptMode) setScriptMode(p.scriptMode);
            if (p.mediaId) setSavedMediaId(p.mediaId);

            const latestRender = p.renders && p.renders[0];
            if (latestRender && latestRender.status === 'ready') {
                setRenderJob(latestRender);
                setStep(5);
            } else {
                setStep(3);
            }
            toast.success(`Video Informe "${p.title}" cargado desde la biblioteca`);
        } catch (e: any) {
            console.error('[VideoReport] Error al abrir proyecto:', e);
            toast.error(e.message || 'No se pudo abrir el informe');
        } finally {
            setIsLoadingProject(false);
        }
    }, []);

    // Reanudar automáticamente si viene initialProjectId
    useEffect(() => {
        if (initialProjectId) {
            handleOpenProject(initialProjectId);
        }
    }, [initialProjectId, handleOpenProject]);

    // Eliminar proyecto guardado
    const handleDeleteProject = async (projectId: string, title: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!window.confirm(`¿Seguro que deseas eliminar el informe "${title}"? Esta acción no se puede deshacer.`)) return;
        try {
            const res = await fetch(`${API}/content-studio/video-reports/projects/${projectId}`, {
                method: 'DELETE',
                headers: authHeaders()
            });
            const data = await res.json();
            if (!res.ok || !data.success) throw new Error(data.error || 'Error al eliminar');
            toast.success(`Informe "${title}" eliminado`);
            if (project?.id === projectId) {
                setProject(null);
                setStep(1);
            }
            loadSavedProjects();
        } catch (err: any) {
            toast.error(err.message || 'No se pudo eliminar el proyecto');
        }
    };

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

    // 3. Cargar multimedia unificada para la campaña (POST para transferir contexto o guion completo)
    const activeText = scriptMode === 'direct' ? providedScript : editorialContext;
    const loadUnifiedMedia = useCallback(() => {
        if (!selectedCampaignId) return;
        setLoadingMedia(true);
        fetch(`${API}/content-studio/video-reports/campaigns/${selectedCampaignId}/media`, {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({
                tab: mediaTab,
                search: mediaSearch,
                editorialContext: activeText,
                club: selectedClubFilter
            })
        })
            .then(res => res.json())
            .then(data => {
                if (data.media) setMediaItems(data.media);
                if (data.detectedClubs) setDetectedClubs(data.detectedClubs);
                if (data.participatingClubs) setParticipatingClubs(data.participatingClubs);
                if (data.stats) setPriorityMediaCount(data.stats.priorityCount || 0);
            })
            .catch(err => console.error('[VideoReport] Error cargando media:', err))
            .finally(() => setLoadingMedia(false));
    }, [selectedCampaignId, mediaTab, mediaSearch, activeText, selectedClubFilter]);

    useEffect(() => {
        const timer = setTimeout(() => {
            loadUnifiedMedia();
        }, 300);
        return () => clearTimeout(timer);
    }, [loadUnifiedMedia]);

    // 4. Crear Proyecto & Estructurar Escenas (Directo o Asistido por IA)
    const handleGenerateProject = async () => {
        if (!selectedCampaignId) {
            toast.error('Por favor selecciona una campaña');
            return;
        }
        const textToUse = scriptMode === 'direct' ? providedScript : editorialContext;
        if (!textToUse || textToUse.trim().length < 10) {
            toast.error(scriptMode === 'direct'
                ? 'Por favor escribe o pega el guion completo'
                : 'Por favor ingresa el contexto o notas de la campaña'
            );
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
                    editorialContext: textToUse,
                    scriptMode,
                    providedScriptText: scriptMode === 'direct' ? providedScript : ''
                })
            });
            const data = await res.json();
            if (!res.ok || data.error) {
                throw new Error(data.error || 'Error al procesar el guion');
            }
            setProject(data.project);
            if (data.project?.mediaId) {
                setSavedMediaId(data.project.mediaId);
            }
            loadSavedProjects();
            setStep(3); // Avanzar directamente a la Línea de Tiempo (Paso 3)
            toast.success(
                scriptMode === 'direct'
                    ? '¡Guion estructurado y respaldado en la Biblioteca!'
                    : '¡Plan generado con IA y respaldado en la Biblioteca!'
            );
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

    // Helper: Extraer o normalizar la lista de tomas visuales de una escena
    const getSceneAssets = useCallback((scene: VideoReportSceneData): VideoReportSceneAsset[] => {
        if (Array.isArray(scene.mediaAssets) && scene.mediaAssets.length > 0) {
            return scene.mediaAssets;
        }
        if (scene.mediaUrl) {
            return [{
                id: `${scene.id}_0`,
                url: scene.mediaUrl,
                thumbUrl: scene.thumbUrl || scene.mediaUrl,
                mediaId: scene.mediaId || null,
                durationSec: scene.durationSec,
                motionType: scene.motionType || 'ken_burns',
                engineMode: scene.engineMode || 'motion'
            }];
        }
        return [];
    }, []);

    // Configurar cuántas imágenes componen la escena (1, 2 o 3 fotos)
    const handleSetSceneAssetCount = (scene: VideoReportSceneData, targetCount: number) => {
        const current = getSceneAssets(scene);
        let updated: VideoReportSceneAsset[] = [...current];
        const n = Math.max(1, Math.min(3, targetCount));

        if (updated.length < n) {
            for (let i = updated.length; i < n; i++) {
                const candidate = mediaItems.find(m => m.kind === 'image' && !updated.some(u => u.url === m.url)) ||
                                  mediaItems[i % Math.max(1, mediaItems.length)];
                const motions = ['ken_burns', 'zoom_in', 'pan_right', 'pan_left'];
                updated.push({
                    id: `asset_${scene.id}_${i}`,
                    url: candidate?.url || scene.mediaUrl || '',
                    thumbUrl: candidate?.thumbUrl || candidate?.url || scene.thumbUrl || null,
                    mediaId: candidate?.mediaId || null,
                    durationSec: 3,
                    motionType: motions[i % motions.length],
                    engineMode: 'motion'
                });
            }
        } else if (updated.length > n) {
            updated = updated.slice(0, n);
        }

        const durations = distributeAssetDurations(scene.durationSec, updated.length);
        updated.forEach((a, i) => {
            a.durationSec = durations[i];
        });

        handleUpdateScene(scene.id, {
            mediaAssets: updated,
            mediaUrl: updated[0]?.url || scene.mediaUrl,
            thumbUrl: updated[0]?.thumbUrl || scene.thumbUrl,
            mediaId: updated[0]?.mediaId || scene.mediaId
        });
        toast.success(`Escena configurada con ${updated.length} ${updated.length === 1 ? 'imagen' : 'imágenes'}`);
    };

    // Actualizar una toma específica dentro de una escena
    const handleUpdateSceneAsset = (sceneId: string, assetIndex: number, patch: Partial<VideoReportSceneAsset>) => {
        const target = project?.currentVersion?.scenes.find(s => s.id === sceneId);
        if (!target) return;
        const assets = [...getSceneAssets(target)];
        if (assetIndex >= 0 && assetIndex < assets.length) {
            assets[assetIndex] = { ...assets[assetIndex], ...patch };
            const updates: Partial<VideoReportSceneData> = { mediaAssets: assets };
            if (assetIndex === 0) {
                if (patch.motionType !== undefined) updates.motionType = patch.motionType;
                if (patch.engineMode !== undefined) updates.engineMode = patch.engineMode;
                if (patch.url !== undefined) updates.mediaUrl = patch.url;
                if (patch.thumbUrl !== undefined) updates.thumbUrl = patch.thumbUrl;
            }
            handleUpdateScene(sceneId, updates);
        }
    };

    // Eliminar una toma visual de la escena
    const handleRemoveSceneAsset = (sceneId: string, assetIndex: number) => {
        const target = project?.currentVersion?.scenes.find(s => s.id === sceneId);
        if (!target) return;
        const current = getSceneAssets(target);
        if (current.length <= 1) {
            toast.info('La escena debe contener al menos una imagen.');
            return;
        }
        const updated = current.filter((_, i) => i !== assetIndex);
        const durations = distributeAssetDurations(target.durationSec, updated.length);
        updated.forEach((a, i) => { a.durationSec = durations[i]; });
        handleUpdateScene(sceneId, {
            mediaAssets: updated,
            mediaUrl: updated[0]?.url || null,
            thumbUrl: updated[0]?.thumbUrl || null,
            mediaId: updated[0]?.mediaId || null
        });
        toast.info('Imagen retirada de la escena');
    };

    // Actualizar duración total de escena recalculando proporcionalmente sus tomas
    const handleUpdateSceneDuration = (scene: VideoReportSceneData, newDuration: number) => {
        const dur = Math.max(3, Math.min(60, newDuration));
        const assets = getSceneAssets(scene);
        if (assets.length > 0) {
            const distributed = distributeAssetDurations(dur, assets.length);
            const updated = assets.map((a, i) => ({ ...a, durationSec: distributed[i] }));
            handleUpdateScene(scene.id, {
                durationSec: dur,
                mediaAssets: updated
            });
        } else {
            handleUpdateScene(scene.id, { durationSec: dur });
        }
    };

    // Asignar imagen del modal a la toma específica de la escena
    const handleAssignMediaToAsset = (item: UnifiedMediaItem) => {
        if (!sceneToReplaceAsset || !project?.currentVersion) return;
        const targetScene = project.currentVersion.scenes.find(s => s.id === sceneToReplaceAsset.sceneId);
        if (!targetScene) return;

        const currentAssets = getSceneAssets(targetScene);
        const updatedAssets = [...currentAssets];
        const idx = sceneToReplaceAsset.assetIndex;

        if (idx >= 0 && idx < updatedAssets.length) {
            updatedAssets[idx] = {
                ...updatedAssets[idx],
                url: item.url,
                thumbUrl: item.thumbUrl || item.url,
                mediaId: item.mediaId || null
            };
        } else {
            const dur = Math.max(2.5, Math.round((targetScene.durationSec / (updatedAssets.length + 1)) * 10) / 10);
            updatedAssets.push({
                id: `asset_${targetScene.id}_${updatedAssets.length}`,
                url: item.url,
                thumbUrl: item.thumbUrl || item.url,
                mediaId: item.mediaId || null,
                durationSec: dur,
                motionType: 'ken_burns',
                engineMode: 'motion'
            });
        }

        const durations = distributeAssetDurations(targetScene.durationSec, updatedAssets.length);
        updatedAssets.forEach((a, i) => { a.durationSec = durations[i]; });

        handleUpdateScene(targetScene.id, {
            mediaAssets: updatedAssets,
            mediaUrl: updatedAssets[0]?.url || item.url,
            thumbUrl: updatedAssets[0]?.thumbUrl || item.thumbUrl || item.url,
            mediaId: updatedAssets[0]?.mediaId || item.mediaId || null
        });

        setSceneToReplaceAsset(null);
        toast.success(`Foto asignada a la toma #${idx + 1}`);
    };

    // 6. Escuchar muestra de voz TTS con acento regional
    const handlePlayVoiceSample = async () => {
        if (isPlayingSample) return;
        setIsPlayingSample(true);
        try {
            const res = await fetch(`${API}/content-studio/video-reports/voice-preview`, {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({
                    provider: ttsProvider,
                    language: ttsLanguage,
                    gender: ttsGender,
                    speed: ttsSpeed
                })
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

    // 7. Sintetizar voz de una escena específica con acento regional
    const handleSynthesizeScene = async (sceneId: string) => {
        if (!project) return;
        setSynthesizingSceneId(sceneId);
        try {
            const res = await fetch(`${API}/content-studio/video-reports/projects/${project.id}/scenes/${sceneId}/voice`, {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({
                    provider: ttsProvider,
                    language: ttsLanguage,
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
            setStep(5); // Paso 5: Render y Publicación
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
                            {project ? (
                                <span className="px-2.5 py-0.5 bg-emerald-500/20 text-emerald-300 text-xs font-bold rounded-lg border border-emerald-400/30 flex items-center gap-1">
                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Respaldado en Biblioteca
                                </span>
                            ) : (
                                <span className="text-xs text-gray-400 font-medium">Entorno de Producción</span>
                            )}
                        </div>
                        <h2 className="text-3xl font-black tracking-tight text-white">Video Informe IA</h2>
                        <p className="text-gray-300 text-sm mt-1 max-w-2xl font-medium">
                            {project
                                ? `Editando informe activo: "${project.title}". Todos tus cambios se guardan automáticamente en la Biblioteca Multimedia.`
                                : 'Transforma toda la recaudación, testimonios y solicitudes de una campaña en un documental audiovisual profesional con control factual estricto y cero alucinaciones.'}
                        </p>
                    </div>

                    <div className="flex flex-col sm:flex-row items-end gap-3">
                        {project && (
                            <button
                                type="button"
                                onClick={() => {
                                    setProject(null);
                                    setStep(1);
                                    loadSavedProjects();
                                    if (onBackToProjects) onBackToProjects();
                                }}
                                className="px-3.5 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border border-white/10 shadow-sm"
                            >
                                <FolderOpen className="w-3.5 h-3.5 text-indigo-300" />
                                <span>Mis Informes ({savedProjects.length})</span>
                            </button>
                        )}
                        {/* Selector de Pasos */}
                        <div className="flex items-center gap-2 bg-black/40 backdrop-blur-md p-1.5 rounded-2xl border border-white/10">
                            {[
                                { num: 1, label: 'Campaña' },
                                { num: 2, label: 'Guion & Contexto' },
                                { num: 3, label: 'Línea de Tiempo' },
                                { num: 4, label: 'Locución & Audio' },
                                { num: 5, label: 'Finalizar Video' }
                            ].map(s => (
                                <button
                                    key={s.num}
                                    type="button"
                                    onClick={() => {
                                        if (s.num <= (project ? 5 : 2)) setStep(s.num);
                                    }}
                                    className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition-all ${
                                        step === s.num
                                            ? 'bg-indigo-600 text-white shadow-md'
                                            : s.num <= (project ? 5 : 2)
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
            </div>

            {/* ── PASO 1: Fuente y Selección de Campaña ── */}
            {step === 1 && (
                <div className="bg-white rounded-3xl border border-gray-100 p-8 shadow-sm flex flex-col gap-6">
                    {/* Sección de Video Informes Guardados en la Biblioteca */}
                    {savedProjects.length > 0 && (
                        <div className="bg-slate-50/80 border border-slate-200 rounded-2xl p-6 flex flex-col gap-4">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <span className="px-2.5 py-0.5 bg-emerald-50 text-emerald-700 text-[10px] font-black uppercase tracking-wider rounded-md border border-emerald-200">
                                            Biblioteca Conectada
                                        </span>
                                        <span className="text-xs text-slate-500 font-bold">
                                            {savedProjects.length} {savedProjects.length === 1 ? 'informe respaldado' : 'informes respaldados'}
                                        </span>
                                    </div>
                                    <h4 className="text-base font-black text-gray-900 mt-1 flex items-center gap-2">
                                        <Clapperboard className="w-4 h-4 text-indigo-600" />
                                        Mis Video Informes Guardados (Borradores & En Proceso)
                                    </h4>
                                    <p className="text-xs text-gray-500">
                                        Haz clic en cualquiera de tus proyectos para reanudar su edición en la línea de tiempo exactamente donde lo dejaste.
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => loadSavedProjects()}
                                    disabled={loadingSavedProjects}
                                    className="px-3 py-1.5 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 font-bold text-xs rounded-xl transition-all flex items-center gap-1.5 self-start sm:self-center shadow-sm"
                                >
                                    <RefreshCw className={`w-3.5 h-3.5 ${loadingSavedProjects ? 'animate-spin text-indigo-600' : ''}`} />
                                    <span>Actualizar</span>
                                </button>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 pt-1">
                                {savedProjects.map((p: any) => {
                                    const isReady = p.hasRender && p.renderStatus === 'ready';
                                    return (
                                        <div
                                            key={p.id}
                                            onClick={() => handleOpenProject(p.id)}
                                            className="cursor-pointer bg-white border border-gray-200 hover:border-indigo-400 rounded-xl p-3.5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between group"
                                        >
                                            <div className="flex items-start gap-3">
                                                <div className="w-16 h-12 rounded-lg bg-slate-900 overflow-hidden shrink-0 flex items-center justify-center relative">
                                                    {p.firstSceneThumb ? (
                                                        <img src={p.firstSceneThumb} alt="" className="w-full h-full object-cover" />
                                                    ) : (
                                                        <Clapperboard className="w-5 h-5 text-indigo-300" />
                                                    )}
                                                    {isReady && (
                                                        <div className="absolute inset-0 bg-emerald-950/40 flex items-center justify-center">
                                                            <Play className="w-3.5 h-3.5 fill-white text-white" />
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="flex flex-col min-w-0 flex-1">
                                                    <div className="flex items-center justify-between gap-1">
                                                        <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded ${
                                                            isReady ? 'bg-emerald-50 text-emerald-700' : 'bg-indigo-50 text-indigo-700'
                                                        }`}>
                                                            {isReady ? 'Renderizado' : 'Borrador'}
                                                        </span>
                                                        <span className="text-[10px] text-gray-400 font-medium">
                                                            {p.sceneCount} esc · {p.totalDurationSec}s
                                                        </span>
                                                    </div>
                                                    <h5 className="font-black text-gray-900 text-xs mt-1 truncate group-hover:text-indigo-600 transition-colors">
                                                        {p.title}
                                                    </h5>
                                                    {p.campaignName && (
                                                        <span className="text-[10px] text-gray-500 truncate">
                                                            {p.campaignName}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="mt-3 pt-2 border-t border-gray-100 flex items-center justify-between">
                                                <span className="text-[11px] font-bold text-indigo-600 flex items-center gap-1 group-hover:translate-x-0.5 transition-transform">
                                                    Continuar editando <ChevronRight className="w-3.5 h-3.5" />
                                                </span>
                                                <button
                                                    type="button"
                                                    onClick={(e) => handleDeleteProject(p.id, p.title, e)}
                                                    className="p-1 text-gray-400 hover:text-rose-600 rounded-md transition-colors"
                                                    title="Eliminar informe"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Estado de carga al abrir proyecto */}
                    {isLoadingProject && (
                        <div className="flex items-center justify-center p-8 bg-indigo-50/50 rounded-2xl border border-indigo-100 text-indigo-600 gap-3">
                            <Loader2 className="w-6 h-6 animate-spin" />
                            <span className="text-xs font-bold text-indigo-900">Cargando proyecto desde la biblioteca...</span>
                        </div>
                    )}

                    <div className="pt-2 border-t border-gray-100">
                        <h3 className="text-xl font-black text-gray-900">
                            {savedProjects.length > 0 ? 'O comenzar un Nuevo Video Informe' : '1. ¿Sobre qué campaña deseas crear el informe?'}
                        </h3>
                        <p className="text-sm text-gray-500 font-medium mt-1">
                            Selecciona una Campaña de Contribución activa. El sistema respaldará automáticamente el nuevo proyecto en tu biblioteca y cargará los fondos recaudados, aportes y fotografías documentadas.
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
                            Siguiente: Guion & Contexto <ArrowRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            )}

            {/* ── PASO 2: Base del Guion & Contexto (Modo Directo vs Modo IA) ── */}
            {step === 2 && (
                <div className="bg-white rounded-3xl border border-gray-100 p-8 shadow-sm flex flex-col gap-6 animate-in fade-in duration-200">
                    <div>
                        <h3 className="text-xl font-black text-gray-900">2. Base del Guion y Contexto Audiovisual</h3>
                        <p className="text-sm text-gray-500 font-medium mt-1">
                            Elige si deseas suministrar tu guion completo para estructurarlo directamente en la línea de tiempo, o si prefieres que la IA lo construya a partir de notas, testimonios y datos de la campaña.
                        </p>
                    </div>

                    {/* Selector de Modo: Guion Directo vs Generar con IA */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <button
                            type="button"
                            onClick={() => setScriptMode('direct')}
                            className={`p-5 rounded-2xl border-2 text-left transition-all flex flex-col gap-2 ${
                                scriptMode === 'direct'
                                    ? 'border-indigo-600 bg-indigo-50/50 shadow-sm'
                                    : 'border-gray-200 hover:border-gray-300 bg-white'
                            }`}
                        >
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <FileText className={`w-5 h-5 ${scriptMode === 'direct' ? 'text-indigo-600' : 'text-gray-400'}`} />
                                    <span className="font-black text-sm text-gray-900">Tengo el Guion Completo</span>
                                </div>
                                <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded ${
                                    scriptMode === 'direct' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600'
                                }`}>
                                    Modo Directo
                                </span>
                            </div>
                            <p className="text-xs text-gray-500 leading-relaxed">
                                Pega aquí tu texto ya redactado. El sistema estructurará cada párrafo o escena en la línea de tiempo, calculará los segundos sugeridos de locución y asignará las fotos correspondientes sin inventar texto.
                            </p>
                        </button>

                        <button
                            type="button"
                            onClick={() => setScriptMode('ai')}
                            className={`p-5 rounded-2xl border-2 text-left transition-all flex flex-col gap-2 ${
                                scriptMode === 'ai'
                                    ? 'border-purple-600 bg-purple-50/50 shadow-sm'
                                    : 'border-gray-200 hover:border-gray-300 bg-white'
                            }`}
                        >
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Wand2 className={`w-5 h-5 ${scriptMode === 'ai' ? 'text-purple-600' : 'text-gray-400'}`} />
                                    <span className="font-black text-sm text-gray-900">Generar Guion con IA</span>
                                </div>
                                <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded ${
                                    scriptMode === 'ai' ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-600'
                                }`}>
                                    Asistido por IA
                                </span>
                            </div>
                            <p className="text-xs text-gray-500 leading-relaxed">
                                Pega notas de campo, actas de entrega, antecedentes o testimonios. La IA propondrá un guion estructurado institucional respaldado por los hechos reales verificados de la campaña.
                            </p>
                        </button>
                    </div>

                    {/* Editor de Texto según el modo seleccionado */}
                    <div className="flex flex-col gap-2">
                        <div className="flex justify-between items-center text-xs text-gray-500 font-bold">
                            <span>
                                {scriptMode === 'direct'
                                    ? 'Pega el guion completo (separa los párrafos o usa [Escena 1], [Escena 2]...):'
                                    : 'Pega el contexto, reporte de misión, actas de entrega o testimonios:'}
                            </span>
                            <button
                                type="button"
                                onClick={() => scriptMode === 'direct' ? setProvidedScript('') : setEditorialContext('')}
                                className="text-gray-400 hover:text-red-500 transition-colors"
                            >
                                Limpiar texto
                            </button>
                        </div>

                        <textarea
                            value={scriptMode === 'direct' ? providedScript : editorialContext}
                            onChange={(e) => scriptMode === 'direct' ? setProvidedScript(e.target.value) : setEditorialContext(e.target.value)}
                            placeholder={scriptMode === 'direct'
                                ? "Ejemplo:\n[Escena 1: Solidaridad en Acción]\nAnte la emergencia en territorio, los clubes rotarios activaron de inmediato la red humanitaria para asistir a las familias afectadas.\n\n[Escena 2: Santa Rosa y Quimbaya]\nEn Santa Rosa de Cabal y Quimbaya, los equipos voluntarios distribuyeron víveres y kits médicos de primera necesidad...\n\n[Escena 3: Cierre Institucional]\nGracias al compromiso de cada socio y donante, demostramos que la solidaridad rotaria transforma realidades."
                                : "Pega aquí el contexto completo de la campaña, antecedentes, acciones realizadas en terreno, resultados, testimonios y cualquier información que deba conocer la IA..."
                            }
                            rows={11}
                            className="w-full p-4 rounded-2xl border border-gray-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none text-sm font-medium text-gray-800 placeholder:text-gray-400 transition-all leading-relaxed font-sans"
                        />

                        {/* Métricas de texto en tiempo real */}
                        <div className="flex flex-wrap items-center justify-between text-[11px] text-gray-400 font-medium px-1">
                            <span>
                                {(scriptMode === 'direct' ? providedScript : editorialContext).length} caracteres ·{' '}
                                {(scriptMode === 'direct' ? providedScript : editorialContext).split(/\s+/).filter(Boolean).length} palabras
                                {scriptMode === 'direct' && (
                                    <>
                                        {' '}· Tiempo de locución estimado:{' '}
                                        <strong className="text-indigo-600 font-bold">
                                            ~{Math.round((providedScript.split(/\s+/).filter(Boolean).length) / 2.5)}s totales
                                        </strong>
                                    </>
                                )}
                            </span>
                            {scriptMode === 'direct' && (
                                <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded font-bold">
                                    ✓ Modo Directo: se estructurará exactamente con tus palabras
                                </span>
                            )}
                        </div>

                        {/* Detección inteligente en tiempo real de clubes rotarios en el texto */}
                        {detectedClubs.length > 0 ? (
                            <div className="mt-2 p-4 bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-amber-500/5 border border-amber-300/80 rounded-2xl flex flex-col gap-2.5 animate-in fade-in slide-in-from-top-1 duration-200">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2 text-xs font-black text-amber-950">
                                        <Sparkles className="w-4 h-4 text-amber-600" />
                                        <span>Clubes rotarios identificados automáticamente en tu texto:</span>
                                    </div>
                                    <span className="text-[11px] font-black text-amber-900 bg-amber-200/80 px-2 py-0.5 rounded-full border border-amber-300">
                                        {priorityMediaCount} fotos/videos vinculados
                                    </span>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {detectedClubs.map(c => (
                                        <span
                                            key={c.name}
                                            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-black bg-white text-amber-950 border border-amber-300 shadow-sm"
                                        >
                                            <span>⭐</span>
                                            <span>{c.name}</span>
                                            <span className="px-1.5 py-0.5 bg-amber-100 text-amber-800 rounded-md text-[10px] font-bold">
                                                {c.count} fotos
                                            </span>
                                        </span>
                                    ))}
                                </div>
                                <p className="text-[11px] text-amber-800 font-medium">
                                    ✨ El material fotográfico y de video aportado por estos clubes será priorizado en la línea de tiempo y enlazado directamente a las escenas.
                                </p>
                            </div>
                        ) : (scriptMode === 'direct' ? providedScript : editorialContext).trim().length > 30 ? (
                            <div className="mt-2 p-3 bg-gray-50 border border-gray-200 rounded-xl text-[11px] text-gray-500 font-medium flex items-center gap-2">
                                <Building2 className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                <span>Tip: Si mencionas clubes específicos (ej: Santa Rosa de Cabal, Quimbaya, Armenia International...), el sistema priorizará automáticamente sus fotos enviadas en las solicitudes de contenido.</span>
                            </div>
                        ) : null}
                    </div>

                    {/* Parámetros Rápidos del Video (Título y Formato) */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-gray-100">
                        <div>
                            <label className="block text-xs font-black uppercase tracking-wider text-gray-500 mb-1.5">
                                Título del Video Informe
                            </label>
                            <input
                                type="text"
                                value={videoTitle}
                                onChange={(e) => setVideoTitle(e.target.value)}
                                placeholder="Ej: Solidaridad Rotaria en Territorio"
                                className="w-full p-3 rounded-xl border border-gray-200 text-sm font-bold text-gray-900 focus:border-indigo-500 outline-none"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-black uppercase tracking-wider text-gray-500 mb-1.5">
                                Formato de Pantalla
                            </label>
                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    type="button"
                                    onClick={() => setFormat('16:9')}
                                    className={`p-3 rounded-xl border text-xs font-black flex items-center justify-center gap-1.5 transition-all ${
                                        format === '16:9'
                                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                                            : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                                    }`}
                                >
                                    <span>📺 16:9</span>
                                    <span>Horizontal / Web</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setFormat('9:16')}
                                    className={`p-3 rounded-xl border text-xs font-black flex items-center justify-center gap-1.5 transition-all ${
                                        format === '9:16'
                                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                                            : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                                    }`}
                                >
                                    <span>📱 9:16</span>
                                    <span>Vertical / Reels</span>
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Botones de Navegación Directa al Storyboard */}
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
                            onClick={handleGenerateProject}
                            disabled={isAnalyzing}
                            className={`px-8 py-3.5 text-white font-black text-sm rounded-xl transition-all flex items-center gap-2 shadow-xl disabled:opacity-50 ${
                                scriptMode === 'direct'
                                    ? 'bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 shadow-indigo-600/30'
                                    : 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 shadow-purple-600/30'
                            }`}
                        >
                            {isAnalyzing ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    {scriptMode === 'direct' ? 'Estructurando escenas en la línea de tiempo...' : 'Analizando campaña y generando guion IA...'}
                                </>
                            ) : (
                                <>
                                    <Clapperboard className="w-4 h-4" />
                                    {scriptMode === 'direct' ? 'Continuar a la Línea de Tiempo' : 'Generar Guion y Abrir Línea de Tiempo'}{' '}
                                    <ArrowRight className="w-4 h-4" />
                                </>
                            )}
                        </button>
                    </div>
                </div>
            )}

            {/* ── PASO 3: Línea de Tiempo Audiovisual (Storyboard & Mapeo de Escenas) ── */}
            {step === 3 && project && (
                <div className="bg-white rounded-3xl border border-gray-100 p-8 shadow-sm flex flex-col gap-6">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-gray-100 pb-4">
                        <div>
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] font-black uppercase tracking-wider text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-md">
                                    Paso 3 · Storyboard & Línea de Tiempo
                                </span>
                                <span className="text-[10px] font-black text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200 flex items-center gap-1">
                                    <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Respaldado en Biblioteca
                                </span>
                                {scriptMode === 'direct' && (
                                    <span className="text-[10px] font-black text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                        ✓ Guion Directo Aplicado
                                    </span>
                                )}
                                <button
                                    type="button"
                                    onClick={() => setStep(4)}
                                    className="text-[10px] font-black text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1 rounded-md border border-indigo-200 flex items-center gap-1.5 transition-colors cursor-pointer"
                                    title="Configurar voz, acento y motor de locución en el Paso 4"
                                >
                                    <Volume2 className="w-3 h-3 text-indigo-600" />
                                    <span>Voz: {REPORT_VOICE_LANGUAGES[ttsLanguage]?.label.split(' · ')[1] || 'Colombia'} ({ttsGender === 'female' ? 'Femenina' : 'Masculina'})</span>
                                    <ChevronRight className="w-3 h-3 opacity-60" />
                                </button>
                            </div>
                            <h3 className="text-xl font-black text-gray-900 mt-1">{project.title}</h3>
                            <p className="text-xs text-gray-500 font-medium">
                                {scenes.length} escenas estructuradas · {Math.round(scenes.reduce((a, s) => a + s.durationSec, 0))}s de metraje total estimado · ~{scenes.reduce((a, s) => a + (s.narrationText || '').split(/\s+/).filter(Boolean).length, 0)} palabras de locución
                            </p>
                        </div>

                        <div className="flex flex-wrap gap-2">
                            <button
                                type="button"
                                onClick={() => setShowFullMediaGallery(!showFullMediaGallery)}
                                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs rounded-xl transition-all flex items-center gap-1.5 shadow-sm"
                            >
                                <FolderOpen className="w-4 h-4 text-indigo-600" />
                                {showFullMediaGallery ? 'Ocultar Banco Multimedia' : `Ver Banco Multimedia (${mediaItems.length})`}
                            </button>
                            <button
                                type="button"
                                onClick={() => setStep(4)}
                                className="px-5 py-2.5 bg-indigo-600 text-white font-black text-xs rounded-xl hover:bg-indigo-700 transition-all flex items-center gap-2 shadow-md shadow-indigo-600/20"
                            >
                                Siguiente: Locución & Audio <ArrowRight className="w-4 h-4" />
                            </button>
                        </div>
                    </div>

                    {/* Banco Multimedia de la Campaña (Expandible) */}
                    {showFullMediaGallery && (
                        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 flex flex-col gap-4 animate-in fade-in duration-200">
                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                                <div>
                                    <h4 className="text-sm font-black text-gray-900 flex items-center gap-2">
                                        <FolderOpen className="w-4 h-4 text-indigo-600" /> Banco de Archivos de la Campaña
                                    </h4>
                                    <p className="text-xs text-gray-500">
                                        Explora las fotografías enviadas por los clubes. Haz clic en una imagen para verla en detalle o haz clic en «Cambiar Foto» en cualquier escena para reasignarla.
                                    </p>
                                </div>
                                <span className="text-xs font-bold text-gray-600 bg-white px-2.5 py-1 rounded-lg border border-gray-200 shadow-sm">
                                    {mediaItems.length} fotos / videos
                                </span>
                            </div>

                            {/* Filtros de Club para el Banco */}
                            {(detectedClubs.length > 0 || participatingClubs.length > 0) && (
                                <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                                    <span className="text-[10px] font-black uppercase text-gray-400 whitespace-nowrap">Filtrar:</span>
                                    <button
                                        type="button"
                                        onClick={() => setSelectedClubFilter('')}
                                        className={`px-2.5 py-1 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
                                            selectedClubFilter === '' ? 'bg-gray-900 text-white' : 'bg-white text-gray-700 border hover:bg-gray-100'
                                        }`}
                                    >
                                        Todos ({mediaItems.length})
                                    </button>
                                    {detectedClubs.length > 0 && (
                                        <button
                                            type="button"
                                            onClick={() => setSelectedClubFilter('all_detected')}
                                            className={`px-2.5 py-1 rounded-lg text-xs font-black whitespace-nowrap transition-all flex items-center gap-1 ${
                                                selectedClubFilter === 'all_detected'
                                                    ? 'bg-amber-500 text-white'
                                                    : 'bg-amber-100 text-amber-950 border border-amber-300 hover:bg-amber-200'
                                            }`}
                                        >
                                            ⭐ Del contexto ({priorityMediaCount})
                                        </button>
                                    )}
                                    {participatingClubs.map(c => (
                                        <button
                                            key={c.name}
                                            type="button"
                                            onClick={() => setSelectedClubFilter(selectedClubFilter === c.name ? '' : c.name)}
                                            className={`px-2.5 py-1 rounded-lg text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1 ${
                                                selectedClubFilter === c.name
                                                    ? 'bg-indigo-600 text-white'
                                                    : c.mentioned
                                                        ? 'bg-white text-amber-900 border border-amber-300 hover:bg-amber-50'
                                                        : 'bg-white text-gray-700 border hover:bg-gray-100'
                                            }`}
                                        >
                                            {c.mentioned && <span>⭐</span>}
                                            <span>{c.name}</span>
                                            <span className="text-[10px] opacity-75">({c.count})</span>
                                        </button>
                                    ))}
                                </div>
                            )}

                            {/* Grid compacto de fotos del banco */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2.5 max-h-64 overflow-y-auto pr-1">
                                {filteredMediaItems.map(item => (
                                    <div
                                        key={item.id}
                                        onClick={() => setPreviewItem(item)}
                                        className={`group relative aspect-video bg-gray-900 rounded-xl overflow-hidden cursor-pointer border-2 transition-all hover:scale-[1.02] shadow-sm ${
                                            item.mentionedInContext ? 'border-amber-400 ring-1 ring-amber-300' : 'border-gray-200 hover:border-indigo-400'
                                        }`}
                                    >
                                        <img src={item.thumbUrl || item.url} alt={item.title} className="w-full h-full object-cover" />
                                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-[10px] font-black gap-1">
                                            <Eye className="w-3.5 h-3.5" /> Ver detalle
                                        </div>
                                        <div className="absolute bottom-1 left-1 right-1 pointer-events-none">
                                            <span className="text-[9px] font-black text-white bg-black/70 px-1 py-0.5 rounded truncate block">
                                                {item.originLabel}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Lista de Escenas del Storyboard con Alertas y Sugerencias */}
                    <div className="flex flex-col gap-5">
                        {scenes.map((scene, idx) => {
                            const text = scene.narrationText || '';
                            const words = text.split(/\s+/).filter(Boolean).length;
                            // 2.5 palabras por segundo para ritmo de locución institucional estándar
                            const recSec = Math.max(4, Math.round(words / 2.5));
                            const diff = scene.durationSec - recSec;
                            const isTooShort = scene.durationSec < recSec - 2;
                            const isTooLong = scene.durationSec > recSec + 4;
                            const isSynced = !isTooShort && !isTooLong;

                            const sceneAssets = getSceneAssets(scene);
                            const recCount = getRecommendedAssetCount(scene.durationSec);

                            let visualSuggestion = '';
                            if (scene.durationSec <= 5) {
                                visualSuggestion = '1 imagen con Ken Burns suave (0 cr) o clip animado con Video IA Kling (5s · 20 cr)';
                            } else if (scene.durationSec <= 9) {
                                visualSuggestion = `Recomendado: 2 imágenes dinámicas para alternar planos durante los ${scene.durationSec}s`;
                            } else {
                                visualSuggestion = `Recomendado: 2 a 3 imágenes para mantener dinamismo continuo durante los ${scene.durationSec}s`;
                            }

                            return (
                                <div
                                    key={scene.id}
                                    className="border border-gray-200/90 rounded-3xl p-6 bg-white hover:border-indigo-300 transition-all flex flex-col gap-4 shadow-sm"
                                >
                                    {/* Encabezado de la Escena: Capítulo, Fuente y Control de Duración Total */}
                                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-gray-100 pb-3">
                                        <div className="flex items-center gap-2.5 flex-wrap">
                                            <span className="text-xs font-black text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-200 uppercase tracking-wider">
                                                #{idx + 1} · {scene.chapter}
                                            </span>
                                            {scene.factSource && (
                                                <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200 flex items-center gap-1">
                                                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" /> Fuente: {scene.factSource.source}
                                                </span>
                                            )}
                                        </div>

                                        {/* Control fino de duración manual (Segundos) */}
                                        <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200">
                                            <span className="text-xs font-bold text-gray-600 flex items-center gap-1">
                                                <Clock className="w-3.5 h-3.5 text-gray-400" /> Duración Escena:
                                            </span>
                                            <div className="flex items-center gap-1">
                                                <button
                                                    type="button"
                                                    onClick={() => handleUpdateSceneDuration(scene, scene.durationSec - 1)}
                                                    className="w-6 h-6 rounded-lg bg-white border border-gray-200 text-gray-700 font-black hover:bg-gray-100 flex items-center justify-center text-xs transition-colors"
                                                    title="Disminuir 1 segundo"
                                                >
                                                    -
                                                </button>
                                                <span className="w-9 text-center text-xs font-black text-gray-900">
                                                    {scene.durationSec}s
                                                </span>
                                                <button
                                                    type="button"
                                                    onClick={() => handleUpdateSceneDuration(scene, scene.durationSec + 1)}
                                                    className="w-6 h-6 rounded-lg bg-white border border-gray-200 text-gray-700 font-black hover:bg-gray-100 flex items-center justify-center text-xs transition-colors"
                                                    title="Aumentar 1 segundo"
                                                >
                                                    +
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Locución narrada editable */}
                                    <div>
                                        <div className="flex justify-between items-center mb-1">
                                            <label className="text-[11px] font-black uppercase tracking-wider text-gray-400">
                                                Locución narrada (Voz en off)
                                            </label>
                                            <span className="text-[11px] font-bold text-gray-400">
                                                {words} palabras · ~{recSec}s estimados
                                            </span>
                                        </div>
                                        <textarea
                                            value={scene.narrationText}
                                            onChange={(e) => handleUpdateScene(scene.id, { narrationText: e.target.value })}
                                            rows={2}
                                            className="w-full p-3 rounded-xl border border-gray-200 text-xs font-medium text-gray-800 outline-none focus:border-indigo-500 leading-relaxed"
                                            placeholder="Texto narrado en voz en off para esta escena..."
                                        />
                                    </div>

                                    {/* Sincronización Temporal de la Locución */}
                                    {isTooShort ? (
                                        <div className="p-3 rounded-xl bg-amber-50 border border-amber-300 text-amber-950 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs">
                                            <div className="flex items-center gap-2">
                                                <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                                                <span>
                                                    <strong>Locución rápida:</strong> {words} palabras requieren aprox. <strong>~{recSec}s</strong> a ritmo natural ({scene.durationSec}s asignados).
                                                </span>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => handleUpdateSceneDuration(scene, recSec)}
                                                className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-black text-[11px] whitespace-nowrap shadow-sm flex items-center gap-1 transition-all"
                                            >
                                                <Clock className="w-3.5 h-3.5" /> Ajustar escena a {recSec}s
                                            </button>
                                        </div>
                                    ) : isTooLong ? (
                                        <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-blue-950 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs">
                                            <div className="flex items-center gap-2">
                                                <Clock className="w-4 h-4 text-blue-600 flex-shrink-0" />
                                                <span>
                                                    <strong>Duración holgada:</strong> {words} palabras duran ~{recSec}s ({scene.durationSec}s asignados). Habrá {diff}s de fondo musical.
                                                </span>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => handleUpdateSceneDuration(scene, recSec)}
                                                className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-black text-[11px] whitespace-nowrap shadow-sm flex items-center gap-1 transition-all"
                                            >
                                                <Clock className="w-3.5 h-3.5" /> Calibrar a {recSec}s
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="p-2.5 rounded-xl bg-emerald-50/80 border border-emerald-200 text-emerald-900 flex items-center justify-between text-xs">
                                            <span className="flex items-center gap-1.5 font-medium">
                                                <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                                                <span>Ritmo sincronizado: <strong>{words} palabras</strong> · <strong>~{recSec}s</strong> ideales (2.5 pal/s)</span>
                                            </span>
                                            <span className="text-[11px] font-bold text-emerald-700 bg-white px-2 py-0.5 rounded border border-emerald-200 shadow-xs">
                                                {scene.durationSec}s metraje
                                            </span>
                                        </div>
                                    )}

                                    {/* ── SECCIÓN MULTI-IMAGEN (Requerimiento de Audio: 1, 2 o 3 imágenes configurables) ── */}
                                    <div className="bg-slate-50 border border-slate-200/90 rounded-2xl p-4 flex flex-col gap-3">
                                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-slate-200/60 pb-3">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <Sparkles className="w-4 h-4 text-purple-600 flex-shrink-0" />
                                                <span className="text-xs font-black text-gray-900">
                                                    Secuencia Visual ({sceneAssets.length} {sceneAssets.length === 1 ? 'imagen' : 'imágenes'}):
                                                </span>
                                                <span className="text-xs text-gray-500 font-medium">
                                                    {visualSuggestion}
                                                </span>
                                            </div>

                                            {/* Selector Rápido de Cantidad de Imágenes (1, 2 o 3) */}
                                            <div className="flex items-center gap-1.5 bg-white p-1 rounded-xl border border-gray-200 shadow-xs">
                                                <span className="text-[10px] font-black uppercase text-gray-400 px-1.5">Fotos:</span>
                                                {[1, 2, 3].map(cnt => {
                                                    const isRecommended = cnt === recCount;
                                                    const isSelected = sceneAssets.length === cnt;
                                                    return (
                                                        <button
                                                            key={cnt}
                                                            type="button"
                                                            onClick={() => handleSetSceneAssetCount(scene, cnt)}
                                                            className={`px-2.5 py-1 rounded-lg text-xs font-black transition-all flex items-center gap-1 ${
                                                                isSelected
                                                                    ? 'bg-indigo-600 text-white shadow-xs'
                                                                    : 'text-gray-700 hover:bg-gray-100'
                                                            }`}
                                                            title={`Asignar ${cnt} ${cnt === 1 ? 'imagen' : 'imágenes'} a esta escena`}
                                                        >
                                                            <span>{cnt}</span>
                                                            {isRecommended && (
                                                                <span className={`text-[9px] px-1 py-0.2 rounded font-black uppercase ${isSelected ? 'bg-indigo-800 text-indigo-100' : 'bg-purple-100 text-purple-800'}`}>
                                                                    Rec
                                                                </span>
                                                            )}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        {/* Grid de Slots de Imágenes de la Escena */}
                                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                                            {sceneAssets.map((asset, aIdx) => (
                                                <div
                                                    key={asset.id || aIdx}
                                                    className="bg-white border border-gray-200 rounded-xl p-3 flex flex-col gap-2 shadow-xs hover:border-indigo-300 transition-all relative group"
                                                >
                                                    {/* Thumbnail con badges de toma y duración */}
                                                    <div className="relative aspect-video bg-gray-900 rounded-lg overflow-hidden shadow-inner">
                                                        {asset.url ? (
                                                            <img
                                                                src={asset.thumbUrl || asset.url}
                                                                alt={`Toma ${aIdx + 1}`}
                                                                className="w-full h-full object-cover transition-transform group-hover:scale-105"
                                                            />
                                                        ) : (
                                                            <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs font-bold">
                                                                Sin imagen asignada
                                                            </div>
                                                        )}
                                                        <span className="absolute top-1.5 left-1.5 px-2 py-0.5 bg-black/75 text-white text-[10px] font-black rounded backdrop-blur-xs">
                                                            Toma #{aIdx + 1} · {asset.durationSec}s
                                                        </span>
                                                        {asset.engineMode === 'kling' && (
                                                            <span className="absolute top-1.5 right-1.5 px-1.5 py-0.5 bg-purple-600 text-white text-[9px] font-black rounded shadow-xs">
                                                                IA Video Kling
                                                            </span>
                                                        )}
                                                        {sceneAssets.length > 1 && (
                                                            <button
                                                                type="button"
                                                                onClick={() => handleRemoveSceneAsset(scene.id, aIdx)}
                                                                className="absolute bottom-1.5 right-1.5 w-6 h-6 rounded-md bg-black/70 hover:bg-rose-600 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                                                title="Quitar esta toma de la escena"
                                                            >
                                                                <X className="w-3.5 h-3.5" />
                                                            </button>
                                                        )}
                                                    </div>

                                                    {/* Botón para Cambiar Fotografía de esta toma específica */}
                                                    <button
                                                        type="button"
                                                        onClick={() => setSceneToReplaceAsset({ sceneId: scene.id, assetIndex: aIdx })}
                                                        className="w-full py-1.5 px-2 rounded-lg text-xs font-black text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 transition-all flex items-center justify-center gap-1.5"
                                                        title="Cambiar fotografía para esta toma"
                                                    >
                                                        <ImageIcon className="w-3.5 h-3.5" />
                                                        {asset.url ? 'Cambiar Fotografía' : 'Asignar Fotografía'}
                                                    </button>

                                                    {/* Selector de Movimiento Ken Burns para esta toma */}
                                                    <select
                                                        value={asset.motionType || 'ken_burns'}
                                                        onChange={(e) => handleUpdateSceneAsset(scene.id, aIdx, { motionType: e.target.value })}
                                                        className="w-full p-1.5 bg-gray-50 border border-gray-200 rounded-lg text-[11px] font-bold text-gray-700 outline-none"
                                                    >
                                                        {Object.values(MOTION_TYPES).map(m => (
                                                            <option key={m.id} value={m.id}>
                                                                {m.label} (0 cr)
                                                            </option>
                                                        ))}
                                                    </select>

                                                    {/* Toggle: Ken Burns vs Video IA Kling */}
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            const nextEngine = asset.engineMode === 'kling' ? 'motion' : 'kling';
                                                            handleUpdateSceneAsset(scene.id, aIdx, { engineMode: nextEngine });
                                                        }}
                                                        className={`w-full py-1 px-2 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1 border ${
                                                            asset.engineMode === 'kling'
                                                                ? 'bg-purple-600 text-white border-purple-600 shadow-xs'
                                                                : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-purple-300'
                                                        }`}
                                                    >
                                                        <Sparkles className="w-3 h-3" />
                                                        {asset.engineMode === 'kling' ? 'Video IA Kling (20 cr)' : 'Ken Burns (0 cr)'}
                                                    </button>
                                                </div>
                                            ))}

                                            {/* Ranura para agregar toma adicional si tiene menos de 3 */}
                                            {sceneAssets.length < 3 && (
                                                <button
                                                    type="button"
                                                    onClick={() => setSceneToReplaceAsset({ sceneId: scene.id, assetIndex: sceneAssets.length })}
                                                    className="border-2 border-dashed border-gray-200 hover:border-indigo-400 rounded-xl p-4 flex flex-col items-center justify-center gap-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50/40 transition-all min-h-[160px]"
                                                >
                                                    <Plus className="w-6 h-6" />
                                                    <span className="text-xs font-bold">Añadir Foto #{sceneAssets.length + 1}</span>
                                                    <span className="text-[10px] text-gray-400">Banco de la campaña</span>
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {/* Textos en Pantalla */}
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                                        <div>
                                            <label className="block text-[10px] font-black uppercase text-gray-400 mb-1">
                                                Texto en pantalla (Título)
                                            </label>
                                            <input
                                                type="text"
                                                value={scene.onScreenTitle || ''}
                                                onChange={(e) => handleUpdateScene(scene.id, { onScreenTitle: e.target.value })}
                                                className="w-full p-2 rounded-lg border border-gray-200 text-xs font-bold text-gray-900 focus:border-indigo-500 outline-none"
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
                                                className="w-full p-2 rounded-lg border border-gray-200 text-xs text-gray-700 focus:border-indigo-500 outline-none"
                                            />
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Botones de Navegación de la Línea de Tiempo */}
                    <div className="flex justify-between pt-6 border-t border-gray-100">
                        <button
                            type="button"
                            onClick={() => setStep(2)}
                            className="px-6 py-3 border border-gray-200 text-gray-700 font-black text-sm rounded-xl hover:bg-gray-50 transition-all flex items-center gap-2"
                        >
                            <ArrowLeft className="w-4 h-4" /> Volver a Guion & Contexto
                        </button>
                        <button
                            type="button"
                            onClick={() => setStep(4)}
                            className="px-8 py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-sm rounded-xl transition-all flex items-center gap-2 shadow-xl shadow-indigo-600/20"
                        >
                            Continuar a Locución & Audio <ArrowRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            )}

            {/* ── PASO 4: Locución & Diseño Sonoro ── */}
            {step === 4 && project && (
                <div className="bg-white rounded-3xl border border-gray-100 p-8 shadow-sm flex flex-col gap-6">
                    <div>
                        <h3 className="text-xl font-black text-gray-900">4. Voz del Informe & Banda Sonora</h3>
                        <p className="text-sm text-gray-500 font-medium mt-1">
                            Elige la voz en off institucional. Podés regenerar la locución escena por escena sin tener que volver a sintetizar todo el video.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 bg-slate-50 p-6 rounded-2xl border border-slate-200/60">
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
                            <label className="block text-xs font-black uppercase text-gray-500 mb-2">Región / Acento</label>
                            <select
                                value={ttsLanguage}
                                onChange={(e) => setTtsLanguage(e.target.value)}
                                className="w-full py-2.5 px-3 rounded-xl text-xs font-bold border border-gray-200 bg-white text-gray-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all shadow-sm"
                            >
                                {Object.values(REPORT_VOICE_LANGUAGES).map((lang) => (
                                    <option key={lang.id} value={lang.id}>
                                        {lang.label}
                                    </option>
                                ))}
                            </select>
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
                            onClick={() => setStep(3)}
                            className="px-6 py-3 border border-gray-200 text-gray-700 font-black text-sm rounded-xl hover:bg-gray-50 transition-all flex items-center gap-2"
                        >
                            <ArrowLeft className="w-4 h-4" /> Línea de Tiempo
                        </button>
                        <button
                            type="button"
                            onClick={() => setStep(5)}
                            className="px-6 py-3 bg-indigo-600 text-white font-black text-sm rounded-xl hover:bg-indigo-700 transition-all flex items-center gap-2 shadow-lg shadow-indigo-600/20"
                        >
                            Siguiente: Finalizar Video & Render <ArrowRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            )}

            {/* ── PASO 5: Preflight de Costos, Render Asíncrono y Publicación ── */}
            {step === 5 && project && (
                <div className="bg-white rounded-3xl border border-gray-100 p-8 shadow-sm flex flex-col gap-6">
                    <div>
                        <h3 className="text-xl font-black text-gray-900">5. Resumen de Producción & Render Final</h3>
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
                        <div className="flex justify-between items-center pt-4 border-t border-gray-100">
                            <button
                                type="button"
                                onClick={() => setStep(4)}
                                className="px-6 py-3 border border-gray-200 text-gray-700 font-black text-sm rounded-xl hover:bg-gray-50 transition-all flex items-center gap-2"
                            >
                                <ArrowLeft className="w-4 h-4" /> Volver a Locución
                            </button>
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

            {/* Modal de Preview de Activo Multimedia */}
            {previewItem && (
                <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl max-w-2xl w-full overflow-hidden shadow-2xl border border-gray-100 animate-in fade-in zoom-in-95 duration-150">
                        <div className="relative aspect-video bg-black flex items-center justify-center">
                            {previewItem.kind === 'video' ? (
                                <video src={previewItem.url} controls className="max-h-full max-w-full" autoPlay />
                            ) : (
                                <img src={previewItem.url} alt={previewItem.title} className="max-h-full max-w-full object-contain" />
                            )}
                            <button
                                type="button"
                                onClick={() => setPreviewItem(null)}
                                className="absolute top-3 right-3 p-2 bg-black/60 text-white rounded-full hover:bg-black/80 transition-colors"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                        <div className="p-6 flex flex-col gap-3">
                            <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-black uppercase tracking-wider text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-md">
                                    {previewItem.originLabel}
                                </span>
                                {previewItem.mentionedInContext && (
                                    <span className="text-xs font-black text-amber-900 bg-amber-100 px-2.5 py-1 rounded-md border border-amber-300">
                                        ⭐ Club mencionado en contexto editorial
                                    </span>
                                )}
                            </div>
                            <h4 className="text-lg font-black text-gray-900">{previewItem.title}</h4>
                            {previewItem.context && (
                                <p className="text-xs text-gray-600 leading-relaxed bg-gray-50 p-3 rounded-xl border border-gray-100">
                                    {previewItem.context}
                                </p>
                            )}
                            <div className="flex justify-between items-center pt-3 border-t border-gray-100 text-xs text-gray-500 font-medium">
                                <span>{previewItem.city ? `📍 ${previewItem.city}` : ''}</span>
                                <span>{previewItem.credit ? `Aporte de: ${previewItem.credit}` : ''}</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal Selector de Imagen de la Campaña para una Escena */}
            {sceneToReplaceAsset && (
                <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl max-w-4xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden border border-gray-100 animate-in fade-in zoom-in-95 duration-150">
                        <div className="p-5 border-b border-gray-100 flex items-center justify-between">
                            <div>
                                <h3 className="text-base font-black text-gray-900">
                                    Asignar Fotografía a la Toma #{sceneToReplaceAsset.assetIndex + 1} de la Escena #{scenes.findIndex(s => s.id === sceneToReplaceAsset.sceneId) + 1}
                                </h3>
                                <p className="text-xs text-gray-500 font-medium">
                                    Selecciona una imagen de los clubes participantes para ilustrar esta toma. Los clubes mencionados en tu contexto aparecen destacados primero.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setSceneToReplaceAsset(null)}
                                className="p-2 text-gray-400 hover:text-gray-700 rounded-xl hover:bg-gray-100 transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Chips de filtro rápido por club */}
                        {(detectedClubs.length > 0 || participatingClubs.length > 0) && (
                            <div className="px-5 py-2.5 bg-gray-50 border-b border-gray-100 flex items-center gap-2 overflow-x-auto">
                                <span className="text-[10px] font-black uppercase text-gray-400 whitespace-nowrap">Filtrar:</span>
                                <button
                                    type="button"
                                    onClick={() => setSelectedClubFilter('')}
                                    className={`px-2.5 py-1 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
                                        selectedClubFilter === '' ? 'bg-gray-900 text-white' : 'bg-white text-gray-700 border hover:bg-gray-100'
                                    }`}
                                >
                                    Todos ({mediaItems.length})
                                </button>
                                {detectedClubs.length > 0 && (
                                    <button
                                        type="button"
                                        onClick={() => setSelectedClubFilter('all_detected')}
                                        className={`px-2.5 py-1 rounded-lg text-xs font-black whitespace-nowrap transition-all flex items-center gap-1 ${
                                            selectedClubFilter === 'all_detected'
                                                ? 'bg-amber-500 text-white'
                                                : 'bg-amber-100 text-amber-950 border border-amber-300 hover:bg-amber-200'
                                        }`}
                                    >
                                        ⭐ Del contexto ({priorityMediaCount})
                                    </button>
                                )}
                                {participatingClubs.map(c => (
                                    <button
                                        key={c.name}
                                        type="button"
                                        onClick={() => setSelectedClubFilter(selectedClubFilter === c.name ? '' : c.name)}
                                        className={`px-2.5 py-1 rounded-lg text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1 ${
                                            selectedClubFilter === c.name
                                                ? 'bg-indigo-600 text-white'
                                                : c.mentioned
                                                    ? 'bg-white text-amber-900 border border-amber-300 hover:bg-amber-50'
                                                    : 'bg-white text-gray-700 border hover:bg-gray-100'
                                        }`}
                                    >
                                        {c.mentioned && <span>⭐</span>}
                                        <span>{c.name}</span>
                                        <span className="text-[10px] opacity-75">({c.count})</span>
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* Grid de selección de imagen */}
                        <div className="flex-1 overflow-y-auto p-5 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                            {filteredMediaItems.filter(i => i.kind === 'image').map(item => (
                                <button
                                    key={item.id}
                                    type="button"
                                    onClick={() => handleAssignMediaToAsset(item)}
                                    className={`group text-left relative aspect-video bg-gray-900 rounded-xl overflow-hidden border-2 transition-all hover:scale-[1.02] shadow-sm ${
                                        item.mentionedInContext ? 'border-amber-400 ring-2 ring-amber-300/40' : 'border-gray-200 hover:border-indigo-500'
                                    }`}
                                >
                                    <img
                                        src={item.thumbUrl || item.url}
                                        alt={item.title}
                                        className="w-full h-full object-cover"
                                    />
                                    <div className="absolute top-1.5 left-1.5 right-1.5 flex justify-between items-start gap-1 pointer-events-none">
                                        <span className="text-[9px] font-black uppercase text-white bg-black/70 px-1.5 py-0.5 rounded truncate max-w-[70%]">
                                            {item.originLabel}
                                        </span>
                                        {item.mentionedInContext && (
                                            <span className="text-[9px] font-black text-amber-950 bg-amber-300 px-1.5 py-0.5 rounded-full">
                                                ⭐ Prioritario
                                            </span>
                                        )}
                                    </div>
                                    <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/90 via-black/50 to-transparent text-white text-[10px] truncate">
                                        {item.title || item.clubName || 'Asignar esta foto'}
                                    </div>
                                </button>
                            ))}
                        </div>

                        <div className="p-4 border-t border-gray-100 flex justify-end">
                            <button
                                type="button"
                                onClick={() => setSceneToReplaceAsset(null)}
                                className="px-5 py-2 border border-gray-200 text-gray-700 font-bold text-xs rounded-xl hover:bg-gray-50"
                            >
                                Cancelar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default VideoReportWorkflow;
