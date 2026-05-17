import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import {
    Image as ImageIcon,
    Sparkles,
    Zap,
    Send,
    RefreshCw,
    Upload,
    Library,
    Download,
    Eye,
    MessageSquare,
    BarChart3,
    Copy as CopyIcon,
    Pencil,
    Check,
    AlertTriangle,
    Facebook,
    Instagram,
    Loader2,
    CheckCircle2,
    XCircle,
    ExternalLink,
    Calendar as CalendarIcon,
    Clock
} from 'lucide-react';
import MediaPicker from './MediaPicker';
import { toast } from 'sonner';

type Platform = 'facebook' | 'instagram' | 'x' | 'linkedin';
type TargetFormat = 'portrait' | 'landscape';
type EngineId = 'kie' | 'flux_kontext' | 'nano_banana' | 'higgsfield' | 'openai';

interface AIConfig {
    interestArea: string;
    type: string;
    engine: EngineId;          // motor de IMAGEN (KIE.AI / OpenAI gpt-image-1 / ...)
    copyEngine: string;        // motor de COPY (openai / anthropic / gemini)
}

interface CopyProviderInfo {
    id: string;
    label: string;
    defaultModel: string;
    vision: boolean;
    available: boolean;
    isDefault: boolean;
}

interface EngineMeta {
    id: EngineId;
    label: string;
    sub: string;
    available: boolean;
}

const ENGINES: EngineMeta[] = [
    { id: 'kie',          label: 'KIE.AI',        sub: 'Nano Banana (Gemini 2.5 Flash Image)', available: true },
    { id: 'flux_kontext', label: 'Flux Kontext',  sub: 'Próximamente — identity-preserving outpainting', available: false },
    { id: 'nano_banana',  label: 'Nano Banana',   sub: 'Próximamente — Gemini 2.5 standalone', available: false },
    { id: 'higgsfield',   label: 'Higgsfield',    sub: 'Próximamente — cinematic enhancement', available: false },
    { id: 'openai',       label: 'OpenAI',        sub: 'gpt-image-1 (experimental)', available: true }
];

interface PostContent {
    copy: string;
    hashtags?: string;
    cta?: string;
}

interface GeneratedData {
    facebook: PostContent;
    instagram: PostContent;
    x: PostContent;
    linkedin: PostContent;
}

interface GenerationMetadata {
    engine?: string;
    format?: TargetFormat;
    dimensions?: string;
    limits?: Record<Platform, number>;
    imageError?: string;
    copyError?: string;
    copyProvider?: string;
    copyModel?: string;
}

interface ConnectedAccount {
    id: string;
    platform: 'facebook' | 'instagram' | 'linkedin' | 'x';
    accountName: string | null;
    avatar: string | null;
    status: string;
    needsReconnect: boolean;
    club?: { id: string; name: string } | null;
}

interface PublishOutcome {
    accountId: string;
    platform: string;
    accountName?: string | null;
    ok: boolean;
    externalId: string | null;
    externalUrl: string | null;
    error: string | null;
    publishedAt: string | null;
}

const PLATFORM_TO_FORMAT: Record<Platform, TargetFormat> = {
    facebook: 'portrait',
    instagram: 'portrait',
    linkedin: 'portrait',
    x: 'landscape'
};

const PLATFORM_LIMITS: Record<Platform, number> = {
    facebook: 600,
    instagram: 2200,
    x: 280,
    linkedin: 1300
};

const PostGenerator: React.FC = () => {
    const [selectedImage, setSelectedImage] = useState<any>(null);
    const [isMediaPickerOpen, setIsMediaPickerOpen] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    const [aiConfig, setAiConfig] = useState<AIConfig>({
        interestArea: 'general',
        type: 'standard',
        engine: 'kie',
        // copyEngine se setea en el useEffect al recibir /copy-providers — así
        // siempre arrancamos con el default que reporta el servidor
        // (DEFAULT_COPY_PROVIDER en copywritingService.js).
        copyEngine: ''
    });
    const [copyProviders, setCopyProviders] = useState<CopyProviderInfo[]>([]);
    const [activePlatform, setActivePlatform] = useState<Platform>('facebook');
    const [generatedContent, setGeneratedContent] = useState<GeneratedData | null>(null);
    // Map of format → url. The legacy `generatedImageUrl` is derived from this map
    // (it points at the image for the format that matches the active platform).
    const [generatedImages, setGeneratedImages] = useState<Partial<Record<TargetFormat, string>>>({});
    const [metadata, setMetadata] = useState<GenerationMetadata | null>(null);
    const [editingCopy, setEditingCopy] = useState(false);

    // Derived: which image to show for the currently active platform.
    const activeFormat: TargetFormat = PLATFORM_TO_FORMAT[activePlatform];
    const generatedImageUrl = generatedImages[activeFormat]
        || generatedImages.portrait
        || generatedImages.landscape
        || null;
    const generatedFormat: TargetFormat | null = generatedImages[activeFormat]
        ? activeFormat
        : (generatedImages.portrait ? 'portrait' : (generatedImages.landscape ? 'landscape' : null));

    // Publishing state (Fase 2 del Motor Social)
    const [connectedAccounts, setConnectedAccounts] = useState<ConnectedAccount[]>([]);
    const [selectedAccountIds, setSelectedAccountIds] = useState<Set<string>>(new Set());
    const [isPublishing, setIsPublishing] = useState(false);
    const [publishOutcomes, setPublishOutcomes] = useState<PublishOutcome[] | null>(null);
    // v4.345: scheduling
    const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
    const [scheduleDate, setScheduleDate] = useState('');
    const [scheduleTime, setScheduleTime] = useState('');
    const [scheduleTimezone, setScheduleTimezone] = useState(
        Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Bogota'
    );
    const [isScheduling, setIsScheduling] = useState(false);
    // v4.345: id de la publicación auto-guardada por el backend al generar.
    // Usado para que publish/schedule actualicen ese mismo row en vez de
    // crear duplicados en la Biblioteca.
    const [publicationId, setPublicationId] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const runGeneration = async () => {
        if (!selectedImage) {
            toast.error('Por favor selecciona una imagen primero');
            return;
        }

        setIsGenerating(true);
        const engineMeta = ENGINES.find((e) => e.id === aiConfig.engine);
        const engineLabel = engineMeta?.label || 'IA';
        const toastId = toast.loading(`Generando portrait + landscape con ${engineLabel}…`);

        try {
            const response = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/content-studio/generate-post`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('rotary_token')}`
                },
                body: JSON.stringify({
                    imageId: selectedImage.id || 'uploaded',
                    imageUrl: selectedImage.url,
                    config: {
                        ...aiConfig,
                        // Pedimos los dos formatos en paralelo: el backend genera portrait
                        // (FB/IG/LinkedIn) y landscape (X) en una sola corrida.
                        formats: ['portrait', 'landscape']
                    }
                })
            });

            const data = await response.json();

            if (response.ok && data.success) {
                setGeneratedContent(data.content);
                // Map nuevo del backend: { portrait: { url, engine }, landscape: { url, engine } }
                const imgMap: Partial<Record<TargetFormat, string>> = {};
                if (data.generatedImages?.portrait?.url) imgMap.portrait = data.generatedImages.portrait.url;
                if (data.generatedImages?.landscape?.url) imgMap.landscape = data.generatedImages.landscape.url;
                // Fallback al campo legacy si el backend solo devolvió uno
                if (!imgMap.portrait && !imgMap.landscape && data.generatedImageUrl) {
                    const fmt = (data.metadata?.format || 'portrait') as TargetFormat;
                    imgMap[fmt] = data.generatedImageUrl;
                }
                setGeneratedImages(imgMap);
                setMetadata(data.metadata || null);
                setPublicationId(data.publicationId || data.metadata?.publicationId || null);
                const imgErr = data.metadata?.imageError;
                const copyErr = data.metadata?.copyError;
                if (imgErr && copyErr) {
                    toast.error(`Imagen y copy fallaron. Imagen: ${String(imgErr).slice(0, 100)}. Copy: ${String(copyErr).slice(0, 100)}`, { id: toastId, duration: 18000 });
                } else if (imgErr) {
                    toast.error(`Motor ${engineLabel} falló (fallback aplicado). Error: ${String(imgErr).slice(0, 200)}`, { id: toastId, duration: 15000 });
                } else if (copyErr) {
                    toast.warning(`Imagen OK con ${engineLabel}, pero el copy falló: ${String(copyErr).slice(0, 200)}`, { id: toastId, duration: 15000 });
                } else {
                    const formats = Object.keys(imgMap).length;
                    toast.success(`¡Contenido generado en ${formats} formato${formats !== 1 ? 's' : ''} con ${engineLabel}!`, { id: toastId });
                }
            } else {
                toast.error(data.error || 'Error al generar el contenido', { id: toastId });
            }
        } catch (error: any) {
            toast.error('Error de conexión', { id: toastId });
        } finally {
            setIsGenerating(false);
        }
    };

    const handleGenerate = () => runGeneration();

    // Mismatch only possible if the backend returned a single format (older API
    // version or a partial failure). In normal flow both formats arrive together
    // and the active platform's format is always available.
    const formatMismatch = generatedFormat !== null
        && generatedFormat !== PLATFORM_TO_FORMAT[activePlatform]
        && !generatedImages[PLATFORM_TO_FORMAT[activePlatform]];

    const handleCopyAll = async () => {
        if (!generatedContent) return;
        const block = generatedContent[activePlatform];
        const text = [block.copy, block.hashtags, block.cta].filter(Boolean).join('\n\n');
        try {
            await navigator.clipboard.writeText(text);
            toast.success('Copy copiado al portapapeles');
        } catch {
            toast.error('No se pudo copiar');
        }
    };

    const handleEditCopy = (newCopy: string) => {
        if (!generatedContent) return;
        setGeneratedContent({
            ...generatedContent,
            [activePlatform]: { ...generatedContent[activePlatform], copy: newCopy }
        });
    };

    const charCount = useMemo(() => generatedContent?.[activePlatform]?.copy?.length || 0, [generatedContent, activePlatform]);
    const charLimit = PLATFORM_LIMITS[activePlatform];
    const overLimit = charCount > charLimit;

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const toastId = toast.loading('Subiendo imagen...');
        try {
            const formData = new FormData();
            formData.append('file', file);
            const response = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/media/upload`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${localStorage.getItem('rotary_token')}` },
                body: formData
            });
            const data = await response.json();
            if (response.ok) {
                setSelectedImage({ id: data.id, url: data.url, name: file.name });
                setGeneratedContent(null);
                setGeneratedImages({});
                toast.success('Imagen lista', { id: toastId });
            }
        } catch (error: any) {
            toast.error('Error al subir', { id: toastId });
        }
    };

    const downloadImage = async () => {
        if (!generatedImageUrl) return;
        const proxyUrl = `${import.meta.env.VITE_API_URL || '/api'}/content-studio/download?url=${encodeURIComponent(generatedImageUrl)}`;
        window.location.href = proxyUrl;
    };

    // Load connected accounts for publishing. Re-fetches when generation finishes
    // so the panel reflects the current state at the moment of publishing.
    const fetchConnectedAccounts = useCallback(async () => {
        try {
            const token = localStorage.getItem('rotary_token');
            const API = import.meta.env.VITE_API_URL || '/api';
            const userRaw = JSON.parse(localStorage.getItem('rotary_user') || '{}');
            const clubId = userRaw?.clubId || '';
            const qs = clubId ? `?clubId=${encodeURIComponent(clubId)}` : '';
            const resp = await fetch(`${API}/social/accounts${qs}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!resp.ok) return;
            const data = await resp.json();
            const filtered: ConnectedAccount[] = (Array.isArray(data) ? data : [])
                .filter((a: any) => a.platform === 'facebook' || a.platform === 'instagram');
            setConnectedAccounts(filtered);
            // Auto-select active accounts so a one-click publish is possible.
            setSelectedAccountIds(new Set(
                filtered.filter(a => a.status === 'active' && !a.needsReconnect).map(a => a.id)
            ));
        } catch { /* silent */ }
    }, []);

    // Re-fetch accounts and reset outcomes when a NEW generation completes (vs
    // just switching between portrait/landscape tabs). We watch generatedImages
    // identity, which only changes on a fresh generation.
    useEffect(() => {
        if (Object.keys(generatedImages).length > 0) {
            fetchConnectedAccounts();
            setPublishOutcomes(null);
        }
    }, [generatedImages, fetchConnectedAccounts]);

    // Cargar la lista de motores de copy disponibles (definida por la config
    // del servidor + env vars). Default = primero "available" o el reportado.
    useEffect(() => {
        (async () => {
            try {
                const token = localStorage.getItem('rotary_token');
                const API = import.meta.env.VITE_API_URL || '/api';
                const resp = await fetch(`${API}/content-studio/copy-providers`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (!resp.ok) return;
                const data = await resp.json();
                const providers: CopyProviderInfo[] = data.providers || [];
                setCopyProviders(providers);
                // Preferencia de selección (en orden):
                //   1) Lo que el usuario ya tenía elegido si sigue disponible
                //   2) El default que reporta el servidor (DEFAULT_COPY_PROVIDER)
                //   3) El primer provider disponible
                const platformDefault = providers.find(p => p.isDefault && p.available);
                const firstAvailable = providers.find(p => p.available);
                const fallback = platformDefault || firstAvailable;
                if (fallback) {
                    setAiConfig(prev => ({
                        ...prev,
                        copyEngine: providers.find(p => p.id === prev.copyEngine && p.available)?.id
                            || fallback.id
                    }));
                }
            } catch { /* silent */ }
        })();
    }, []);

    const toggleAccount = (id: string) => {
        setSelectedAccountIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    // v4.345 — agenda la publicación para una fecha futura. El backend la
    // guarda con status='scheduled' y un cron worker (Vercel Cron cada 5min)
    // la levanta cuando llega la hora.
    const schedulePublication = async () => {
        const publishImageUrl = generatedImages.portrait || generatedImages.landscape || null;
        if (!publishImageUrl || !generatedContent) {
            toast.error('Generá la publicación antes de programar');
            return;
        }
        if (selectedAccountIds.size === 0) {
            toast.error('Seleccioná al menos una cuenta');
            return;
        }
        if (!scheduleDate || !scheduleTime) {
            toast.error('Completá fecha y hora');
            return;
        }
        // Combinamos fecha + hora + tz en un ISO UTC. Usamos la lib nativa con
        // un truquito: construyo un Date local y le explicito el offset si la
        // tz elegida es distinta a la del navegador, sino confío en local.
        const localIso = `${scheduleDate}T${scheduleTime}:00`;
        let scheduledIso: string;
        try {
            // toLocaleString en la tz target da la representación de ese mismo
            // wall-clock time en otra zona — no es lo que queremos. Mejor:
            // interpretamos el localIso como "wall clock en scheduleTimezone"
            // y derivamos el instante UTC correspondiente.
            // Truco: Date.UTC + offset calculado vía Intl.
            const guess = new Date(localIso);
            const utcGuess = new Date(guess.toLocaleString('en-US', { timeZone: 'UTC' }));
            const tzGuess = new Date(guess.toLocaleString('en-US', { timeZone: scheduleTimezone }));
            const offsetMs = utcGuess.getTime() - tzGuess.getTime();
            scheduledIso = new Date(guess.getTime() + offsetMs).toISOString();
        } catch {
            scheduledIso = new Date(localIso).toISOString();
        }
        const scheduledAt = new Date(scheduledIso);
        if (scheduledAt.getTime() <= Date.now() + 60_000) {
            toast.error('La fecha programada debe ser al menos 1 minuto en el futuro');
            return;
        }

        setIsScheduling(true);
        const toastId = toast.loading(
            `Programando para ${scheduledAt.toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}…`
        );
        try {
            const token = localStorage.getItem('rotary_token');
            const API = import.meta.env.VITE_API_URL || '/api';
            const resp = await fetch(`${API}/social/publish`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    accountIds: Array.from(selectedAccountIds),
                    imageUrl: publishImageUrl,
                    copies: generatedContent,
                    scheduledFor: scheduledIso,
                    timezone: scheduleTimezone,
                    publicationId,
                    generatedBy: metadata?.engine ? `ai-${metadata.engine.split('+')[0]}` : 'ai'
                })
            });
            const data = await resp.json();
            if (!resp.ok) {
                toast.error(data.error || 'Error al programar', { id: toastId, duration: 12000 });
                return;
            }
            toast.success(
                `Publicación programada para ${scheduledAt.toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })} ✓`,
                { id: toastId, duration: 6000 }
            );
            setIsScheduleModalOpen(false);
        } catch (e: any) {
            toast.error(`Error de red: ${e.message || 'desconocido'}`, { id: toastId });
        } finally {
            setIsScheduling(false);
        }
    };

    const publishNow = async () => {
        // Phase 2 currently supports FB Pages + IG Business — both want the
        // portrait 4:5 image, not the landscape one. We prefer portrait, fall
        // back to whatever is available if portrait somehow didn't generate.
        const publishImageUrl = generatedImages.portrait || generatedImages.landscape || null;
        if (!publishImageUrl || !generatedContent) {
            toast.error('Generá la publicación antes de publicar');
            return;
        }
        if (selectedAccountIds.size === 0) {
            toast.error('Seleccioná al menos una cuenta');
            return;
        }
        setIsPublishing(true);
        const toastId = toast.loading(`Publicando en ${selectedAccountIds.size} cuenta(s)…`);
        try {
            const token = localStorage.getItem('rotary_token');
            const API = import.meta.env.VITE_API_URL || '/api';
            const resp = await fetch(`${API}/social/publish`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    accountIds: Array.from(selectedAccountIds),
                    imageUrl: publishImageUrl,
                    copies: generatedContent,
                    publicationId,
                    generatedBy: metadata?.engine ? `ai-${metadata.engine.split('+')[0]}` : 'ai'
                })
            });
            const data = await resp.json();
            if (!resp.ok) {
                toast.error(data.error || 'Error al publicar', { id: toastId, duration: 12000 });
                return;
            }
            setPublishOutcomes(data.outcomes || []);
            const okCount = (data.outcomes || []).filter((o: PublishOutcome) => o.ok).length;
            const failCount = (data.outcomes || []).length - okCount;
            if (data.status === 'published') {
                toast.success(`Publicado en ${okCount} cuenta(s) ✓`, { id: toastId });
            } else if (data.status === 'partial') {
                toast.warning(`Publicado en ${okCount}, falló en ${failCount}. Revisá el detalle.`, { id: toastId, duration: 15000 });
            } else {
                toast.error(`Falló en las ${failCount} cuenta(s). Revisá el detalle.`, { id: toastId, duration: 15000 });
            }
        } catch (e: any) {
            toast.error(`Error de red: ${e.message || 'desconocido'}`, { id: toastId });
        } finally {
            setIsPublishing(false);
        }
    };

    return (
        <div className="space-y-6 pb-12">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* 1. Panel de Control */}
                <div className="space-y-6">
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                        <div className="p-5 border-b border-gray-50 flex items-center justify-between bg-gray-50/50">
                            <h3 className="font-bold text-gray-800 flex items-center gap-2">
                                <ImageIcon className="w-5 h-5 text-blue-600" />
                                Selección de Imagen
                            </h3>
                            <div className="flex gap-2">
                                <button onClick={() => setIsMediaPickerOpen(true)} className="text-[10px] font-black text-blue-600 px-3 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 transition-all flex items-center gap-2">
                                    <Library className="w-3.5 h-3.5" /> BIBLIOTECA
                                </button>
                                <button onClick={() => fileInputRef.current?.click()} className="text-[10px] font-black text-blue-600 px-3 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 transition-all flex items-center gap-2">
                                    <Upload className="w-3.5 h-3.5" /> SUBIR
                                </button>
                            </div>
                        </div>

                        <div className="p-6">
                            {selectedImage ? (
                                <div className="space-y-4">
                                    <div className="relative group rounded-2xl overflow-hidden border border-gray-100 shadow-sm bg-gray-900">
                                        <img src={selectedImage.url} alt="Selected" className="w-full h-auto max-h-[350px] object-contain mx-auto" />
                                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                            <button onClick={() => setIsMediaPickerOpen(true)} className="bg-white text-gray-900 px-5 py-2.5 rounded-2xl font-black text-xs flex items-center gap-2 shadow-2xl hover:scale-105 transition-transform">
                                                <RefreshCw className="w-4 h-4" /> CAMBIAR IMAGEN
                                            </button>
                                        </div>
                                    </div>
                                    <p className="text-center text-[10px] text-gray-400 font-black truncate px-4 tracking-widest">{selectedImage.name?.toUpperCase() || 'IMAGEN CARGADA'}</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 gap-4">
                                    <button onClick={() => setIsMediaPickerOpen(true)} className="aspect-video border-2 border-dashed border-gray-100 rounded-3xl flex flex-col items-center justify-center gap-3 hover:border-blue-600 hover:bg-blue-50/50 transition-all group bg-gray-50/50">
                                        <Library className="w-10 h-10 text-gray-300 group-hover:text-blue-600 transition-all" />
                                        <p className="text-xs font-black text-gray-400 group-hover:text-blue-700 tracking-widest">BIBLIOTECA</p>
                                    </button>
                                    <button onClick={() => fileInputRef.current?.click()} className="aspect-video border-2 border-dashed border-gray-100 rounded-3xl flex flex-col items-center justify-center gap-3 hover:border-blue-600 hover:bg-blue-50/50 transition-all group bg-gray-50/50">
                                        <Upload className="w-10 h-10 text-gray-300 group-hover:text-blue-600 transition-all" />
                                        <p className="text-xs font-black text-gray-400 group-hover:text-blue-700 tracking-widest">SUBIR FOTO</p>
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>

                    <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept="image/*" />

                    {/* Nueva Configuración Avanzada */}
                    <div className="grid grid-cols-1 gap-4">
                        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-4 block">Tipo de Publicación (IA Preset)</label>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                {[
                                    { id: 'standard', label: 'Estándar' },
                                    { id: 'storytelling', label: 'Storytelling' },
                                    { id: 'fundraising', label: 'Fundraising' },
                                    { id: 'event', label: 'Evento' },
                                    { id: 'project', label: 'Proyecto' },
                                    { id: 'membership', label: 'Membresía' }
                                ].map((type) => (
                                    <button
                                        key={type.id}
                                        onClick={() => setAiConfig({ ...aiConfig, type: type.id })}
                                        className={`px-3 py-3 rounded-xl text-[10px] font-black transition-all border-2 ${
                                            aiConfig.type === type.id 
                                            ? 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-200' 
                                            : 'bg-white border-gray-50 text-gray-400 hover:border-blue-100'
                                        }`}
                                    >
                                        {type.label.toUpperCase()}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-4 block">Enfoque Rotary</label>
                            <select
                                value={aiConfig.interestArea}
                                onChange={(e) => setAiConfig({ ...aiConfig, interestArea: e.target.value })}
                                className="w-full p-4 rounded-xl border-2 border-gray-50 text-sm bg-gray-50 font-bold outline-none focus:border-blue-600 transition-colors"
                            >
                                <option value="general">Impacto General</option>
                                <option value="peace">Paz y Resolución</option>
                                <option value="disease">Prevención Enfermedades</option>
                                <option value="water">Agua y Saneamiento</option>
                                <option value="environment">Medio Ambiente</option>
                            </select>
                        </div>

                        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-4 block">Motor IA · Imagen</label>
                            <div className="space-y-2">
                                {ENGINES.map((engine) => {
                                    const selected = aiConfig.engine === engine.id;
                                    const disabled = !engine.available;
                                    return (
                                        <button
                                            key={engine.id}
                                            type="button"
                                            disabled={disabled}
                                            onClick={() => !disabled && setAiConfig({ ...aiConfig, engine: engine.id })}
                                            className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left ${
                                                selected
                                                    ? 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-200'
                                                    : disabled
                                                        ? 'bg-gray-50 border-gray-100 text-gray-300 cursor-not-allowed'
                                                        : 'bg-white border-gray-100 text-gray-600 hover:border-blue-300 hover:bg-blue-50/30'
                                            }`}
                                        >
                                            <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
                                                selected ? 'border-white' : disabled ? 'border-gray-200' : 'border-gray-300'
                                            }`}>
                                                {selected && <div className="w-2 h-2 rounded-full bg-white" />}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className={`text-xs font-black tracking-wide ${selected ? 'text-white' : disabled ? 'text-gray-300' : 'text-gray-800'}`}>
                                                    {engine.label.toUpperCase()}
                                                </div>
                                                <div className={`text-[10px] font-bold mt-0.5 ${selected ? 'text-blue-100' : disabled ? 'text-gray-300' : 'text-gray-400'}`}>
                                                    {engine.sub}
                                                </div>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {copyProviders.length > 0 && (
                            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-4 block">Motor IA · Copy</label>
                                <div className="space-y-2">
                                    {copyProviders.map((p) => {
                                        const selected = aiConfig.copyEngine === p.id;
                                        const disabled = !p.available;
                                        return (
                                            <button
                                                key={p.id}
                                                type="button"
                                                disabled={disabled}
                                                onClick={() => !disabled && setAiConfig({ ...aiConfig, copyEngine: p.id })}
                                                className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left ${
                                                    selected
                                                        ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-200'
                                                        : disabled
                                                            ? 'bg-gray-50 border-gray-100 text-gray-300 cursor-not-allowed'
                                                            : 'bg-white border-gray-100 text-gray-600 hover:border-indigo-300 hover:bg-indigo-50/30'
                                                }`}
                                            >
                                                <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
                                                    selected ? 'border-white' : disabled ? 'border-gray-200' : 'border-gray-300'
                                                }`}>
                                                    {selected && <div className="w-2 h-2 rounded-full bg-white" />}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className={`text-xs font-black tracking-wide ${selected ? 'text-white' : disabled ? 'text-gray-300' : 'text-gray-800'}`}>
                                                        {p.label.toUpperCase()}
                                                    </div>
                                                    <div className={`text-[10px] font-bold mt-0.5 ${selected ? 'text-indigo-100' : disabled ? 'text-gray-300' : 'text-gray-400'}`}>
                                                        {disabled ? 'API key no configurada en Vercel' : `${p.defaultModel}${p.vision ? ' · visión multimodal' : ''}`}
                                                    </div>
                                                </div>
                                                {p.isDefault && (
                                                    <span className={`text-[9px] font-black uppercase px-2 py-1 rounded-md ${selected ? 'bg-white/20' : 'bg-gray-100 text-gray-500'}`}>
                                                        Default
                                                    </span>
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>

                    <button
                        onClick={handleGenerate}
                        disabled={!selectedImage || isGenerating}
                        className={`w-full py-6 rounded-3xl font-black text-white shadow-2xl transition-all flex items-center justify-center gap-4 text-xl border-b-8 ${
                            !selectedImage || isGenerating 
                            ? 'bg-gray-200 border-gray-300 text-gray-400 cursor-not-allowed shadow-none' 
                            : 'bg-blue-600 border-blue-900 hover:bg-blue-700 hover:-translate-y-1 active:translate-y-1 active:border-b-0 shadow-blue-500/30'
                        }`}
                    >
                        {isGenerating ? (
                            <>
                                <RefreshCw className="w-7 h-7 animate-spin" />
                                REGENERANDO ESCENA...
                            </>
                        ) : (
                            <>
                                <Sparkles className="w-7 h-7" />
                                GENERAR CON IA
                            </>
                        )}
                    </button>
                </div>

                {/* 2. Vista Previa Profesional */}
                <div className="bg-white rounded-3xl shadow-sm border border-gray-100 flex flex-col min-h-[750px] overflow-hidden">
                    <div className="p-6 border-b border-gray-50 flex flex-col sm:flex-row items-center justify-between bg-gray-50/50 gap-4">
                        <h3 className="font-black text-gray-900 flex items-center gap-2 tracking-tight">
                            <Eye className="w-5 h-5 text-blue-600" />
                            CONTENIDO PROFESIONAL
                        </h3>
                        <div className="flex bg-gray-200/50 p-1 rounded-2xl w-full sm:w-auto">
                            {(['facebook', 'instagram', 'x', 'linkedin'] as const).map((platform) => (
                                <button
                                    key={platform}
                                    onClick={() => setActivePlatform(platform)}
                                    className={`flex-1 sm:flex-none px-4 py-2 rounded-xl text-[9px] font-black transition-all ${
                                        activePlatform === platform 
                                        ? 'bg-white text-blue-600 shadow-xl scale-105' 
                                        : 'text-gray-500 hover:text-gray-700'
                                    }`}
                                >
                                    {platform.toUpperCase()}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="flex-1 p-6 flex flex-col gap-6 bg-gray-50/30">
                        {!generatedContent ? (
                            <div className="flex-1 flex flex-col items-center justify-center text-center p-12 border-4 border-dashed border-gray-100 rounded-[3rem] bg-white">
                                <Zap className="w-20 h-20 text-gray-100 mb-8" />
                                <h4 className="text-2xl font-black text-gray-300 uppercase tracking-tighter">Motor AI en Espera</h4>
                                <p className="text-sm text-gray-400 max-w-[280px] mt-4 font-bold">
                                    Carga una imagen y elige el tipo de post para empezar a crear magia.
                                </p>
                            </div>
                        ) : (
                            <div className="animate-in fade-in slide-in-from-bottom-4 duration-700 flex flex-col gap-6 h-full">
                                {/* Preview Container — aspect matches the format that was actually generated (4:5 portrait or 3:2 landscape) */}
                                <div className={`relative group mx-auto bg-gray-50 rounded-3xl overflow-hidden shadow-2xl border-[8px] border-white transition-all duration-500 ${generatedFormat === 'landscape' ? 'max-w-full aspect-[3/2]' : 'max-w-[380px] aspect-[4/5]'}`}>
                                    {generatedImageUrl ? (
                                        <img src={generatedImageUrl} alt="AI Created" className="w-full h-full object-cover" />
                                    ) : null}

                                    <div className="absolute top-4 right-4 flex gap-2">
                                        <button
                                            onClick={downloadImage}
                                            className="bg-white/90 backdrop-blur-md text-gray-900 p-3 rounded-2xl shadow-2xl hover:scale-110 active:scale-95 transition-all"
                                            title="Descargar imagen"
                                        >
                                            <Download className="w-5 h-5" />
                                        </button>
                                    </div>

                                    <div className="absolute bottom-4 left-4 flex flex-col gap-2">
                                        <span className="bg-blue-600/90 backdrop-blur-md text-white text-[10px] font-black px-4 py-2 rounded-xl shadow-2xl flex items-center gap-2">
                                            <BarChart3 className="w-4 h-4" />
                                            {generatedFormat === 'landscape' ? 'X / TWITTER · 3:2' : 'FB · IG · LINKEDIN · 4:5'}
                                        </span>
                                        {metadata?.engine && (
                                            <span className="bg-black/60 backdrop-blur-md text-white/90 text-[9px] font-black px-3 py-1.5 rounded-lg tracking-wider">
                                                {metadata.engine.toUpperCase()}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {formatMismatch && (
                                    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
                                        <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
                                        <div className="flex-1">
                                            <p className="text-xs font-black text-amber-900 mb-1">
                                                Falta el formato de esta plataforma
                                            </p>
                                            <p className="text-[11px] text-amber-800 mb-3 font-bold">
                                                {activePlatform === 'x'
                                                    ? 'X usa landscape 3:2. La generación no completó esa versión.'
                                                    : 'Esta red usa portrait 4:5. La generación no completó esa versión.'}
                                            </p>
                                            <button
                                                onClick={runGeneration}
                                                disabled={isGenerating}
                                                className="bg-amber-600 text-white text-[10px] font-black px-3 py-2 rounded-xl hover:bg-amber-700 disabled:bg-gray-300 flex items-center gap-2"
                                            >
                                                <RefreshCw className={`w-3 h-3 ${isGenerating ? 'animate-spin' : ''}`} />
                                                REGENERAR AMBOS FORMATOS
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* Text Area */}
                                <div className="space-y-4 flex-1">
                                    <div className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-xl relative min-h-[150px] flex flex-col justify-between">
                                        <div className="flex items-center justify-between mb-4">
                                            <div className="flex items-center gap-2">
                                                <MessageSquare className="w-4 h-4 text-blue-600" />
                                                <span className="text-[10px] font-black text-gray-400 tracking-widest uppercase">Propuesta de Copy</span>
                                            </div>
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => setEditingCopy((v) => !v)}
                                                    className={`text-[10px] font-black px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 ${editingCopy ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-600 hover:bg-blue-100'}`}
                                                    title={editingCopy ? 'Terminar edición' : 'Editar copy'}
                                                >
                                                    {editingCopy ? <Check className="w-3 h-3" /> : <Pencil className="w-3 h-3" />}
                                                    {editingCopy ? 'LISTO' : 'EDITAR'}
                                                </button>
                                                <button
                                                    onClick={handleCopyAll}
                                                    className="text-[10px] font-black px-3 py-1.5 rounded-xl bg-blue-50 text-blue-600 hover:bg-blue-100 flex items-center gap-1.5"
                                                    title="Copiar todo"
                                                >
                                                    <CopyIcon className="w-3 h-3" />
                                                    COPIAR
                                                </button>
                                            </div>
                                        </div>

                                        {editingCopy ? (
                                            <textarea
                                                value={generatedContent[activePlatform].copy}
                                                onChange={(e) => handleEditCopy(e.target.value)}
                                                rows={6}
                                                className="w-full text-sm text-gray-700 leading-relaxed font-bold p-4 rounded-2xl border-2 border-blue-100 focus:border-blue-600 outline-none resize-y mb-4"
                                            />
                                        ) : (
                                            <p className="text-sm text-gray-700 leading-relaxed font-bold italic mb-4 whitespace-pre-wrap">
                                                {generatedContent[activePlatform].copy}
                                            </p>
                                        )}

                                        {generatedContent[activePlatform].cta && (
                                            <p className="text-xs font-black text-blue-700 mb-4 uppercase tracking-wider">
                                                → {generatedContent[activePlatform].cta}
                                            </p>
                                        )}

                                        <div className="flex items-center justify-between border-t border-gray-50 pt-4 gap-4">
                                            <div className="flex flex-wrap gap-2 flex-1">
                                                {generatedContent[activePlatform].hashtags?.split(/\s+/).filter(Boolean).map((tag, i) => (
                                                    <span key={i} className="text-[10px] font-black text-blue-600 bg-blue-50 px-3 py-1 rounded-full">
                                                        {tag.startsWith('#') ? tag : `#${tag}`}
                                                    </span>
                                                ))}
                                            </div>
                                            <span className={`text-[10px] font-black flex-shrink-0 ${overLimit ? 'text-red-500' : 'text-gray-300'}`}>
                                                {charCount} / {charLimit} CH.
                                            </span>
                                        </div>
                                    </div>

                                    {/* Publish panel — Phase 2 del Motor Social */}
                                    <div className="space-y-3 pt-2">
                                        <div className="flex items-center justify-between">
                                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Publicar en</label>
                                            {connectedAccounts.length > 0 && (
                                                <span className="text-[10px] font-bold text-gray-400">
                                                    {selectedAccountIds.size} de {connectedAccounts.length} seleccionada(s)
                                                </span>
                                            )}
                                        </div>

                                        {connectedAccounts.length === 0 ? (
                                            <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 text-center">
                                                <p className="text-xs font-bold text-amber-800 mb-2">No hay cuentas conectadas</p>
                                                <a href="/admin/content-studio?tab=accounts" className="text-[10px] font-black text-amber-700 underline">
                                                    Ir a Cuentas Sociales → conectar Meta
                                                </a>
                                            </div>
                                        ) : (
                                            <div className="space-y-2">
                                                {connectedAccounts.map(acc => {
                                                    const checked = selectedAccountIds.has(acc.id);
                                                    const disabled = acc.needsReconnect || acc.status !== 'active';
                                                    const outcome = publishOutcomes?.find(o => o.accountId === acc.id);
                                                    const Icon = acc.platform === 'instagram' ? Instagram : Facebook;
                                                    return (
                                                        <div key={acc.id} className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-all ${
                                                            checked && !disabled ? 'bg-blue-50 border-blue-200' :
                                                            disabled ? 'bg-gray-50 border-gray-100 opacity-60' :
                                                            'bg-white border-gray-100 hover:border-gray-200'
                                                        }`}>
                                                            <input
                                                                type="checkbox"
                                                                checked={checked}
                                                                disabled={disabled}
                                                                onChange={() => toggleAccount(acc.id)}
                                                                className="w-4 h-4 rounded accent-blue-600 cursor-pointer disabled:cursor-not-allowed"
                                                            />
                                                            <Icon className={`w-4 h-4 ${acc.platform === 'instagram' ? 'text-pink-600' : 'text-blue-600'}`} />
                                                            <div className="flex-1 min-w-0">
                                                                <p className="text-xs font-black text-gray-800 truncate">{acc.accountName || acc.platform}</p>
                                                                {disabled && (
                                                                    <p className="text-[9px] font-bold text-amber-600 mt-0.5">Reconectar para usar</p>
                                                                )}
                                                            </div>
                                                            {outcome && (
                                                                outcome.ok ? (
                                                                    outcome.externalUrl
                                                                        ? <a href={outcome.externalUrl} target="_blank" rel="noopener noreferrer" className="text-green-600 hover:text-green-700" title="Ver publicación">
                                                                            <ExternalLink className="w-4 h-4" />
                                                                        </a>
                                                                        : <CheckCircle2 className="w-4 h-4 text-green-600" />
                                                                ) : (
                                                                    <span title={outcome.error || ''}>
                                                                        <XCircle className="w-4 h-4 text-red-500" />
                                                                    </span>
                                                                )
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}

                                        {publishOutcomes && publishOutcomes.some(o => !o.ok) && (
                                            <div className="bg-red-50 border border-red-100 rounded-xl p-3 space-y-1">
                                                {publishOutcomes.filter(o => !o.ok).map(o => (
                                                    <p key={o.accountId} className="text-[10px] font-bold text-red-700">
                                                        <span className="uppercase">{o.platform}</span>: {o.error}
                                                    </p>
                                                ))}
                                            </div>
                                        )}

                                        <div className="flex gap-3">
                                            <button
                                                onClick={() => setIsScheduleModalOpen(true)}
                                                disabled={isPublishing || isScheduling || selectedAccountIds.size === 0 || !generatedImageUrl}
                                                className="flex-1 bg-white border-2 border-blue-600 text-blue-600 py-5 rounded-3xl font-black text-sm shadow-md hover:bg-blue-50 flex items-center justify-center gap-2 transition-all transform hover:-translate-y-1 disabled:opacity-50 disabled:hover:translate-y-0 disabled:cursor-not-allowed"
                                                title="Programar publicación para una fecha futura"
                                            >
                                                <CalendarIcon className="w-4 h-4" />
                                                PROGRAMAR
                                            </button>
                                            <button
                                                onClick={publishNow}
                                                disabled={isPublishing || isScheduling || selectedAccountIds.size === 0 || !generatedImageUrl}
                                                className="flex-[2] bg-blue-600 text-white py-5 rounded-3xl font-black text-sm shadow-xl hover:bg-blue-700 flex items-center justify-center gap-3 transition-all transform hover:-translate-y-1 disabled:opacity-50 disabled:hover:translate-y-0 disabled:cursor-not-allowed"
                                            >
                                                {isPublishing
                                                    ? <><Loader2 className="w-5 h-5 animate-spin" /> PUBLICANDO…</>
                                                    : <><Send className="w-5 h-5" /> PUBLICAR AHORA</>}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Schedule modal — v4.345 */}
            {isScheduleModalOpen && (
                <div
                    className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-md animate-in fade-in duration-200"
                    onClick={(e) => { if (e.target === e.currentTarget) setIsScheduleModalOpen(false); }}
                >
                    <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-6 border-b border-gray-100 bg-gradient-to-br from-indigo-50 to-blue-50">
                            <div className="flex items-center gap-3 mb-2">
                                <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg">
                                    <CalendarIcon className="w-5 h-5 text-white" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-black text-gray-900">Programar Publicación</h3>
                                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                                        {selectedAccountIds.size} cuenta{selectedAccountIds.size !== 1 ? 's' : ''} seleccionada{selectedAccountIds.size !== 1 ? 's' : ''}
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="p-6 space-y-4">
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1 block flex items-center gap-1">
                                        <CalendarIcon className="w-3 h-3" /> Fecha
                                    </label>
                                    <input
                                        type="date"
                                        value={scheduleDate}
                                        onChange={(e) => setScheduleDate(e.target.value)}
                                        min={new Date().toISOString().slice(0, 10)}
                                        className="w-full px-3 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm font-bold outline-none focus:border-blue-500 transition-all"
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1 block flex items-center gap-1">
                                        <Clock className="w-3 h-3" /> Hora
                                    </label>
                                    <input
                                        type="time"
                                        value={scheduleTime}
                                        onChange={(e) => setScheduleTime(e.target.value)}
                                        className="w-full px-3 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm font-bold outline-none focus:border-blue-500 transition-all"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1 block">Zona horaria</label>
                                <select
                                    value={scheduleTimezone}
                                    onChange={(e) => setScheduleTimezone(e.target.value)}
                                    className="w-full px-3 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm font-bold outline-none focus:border-blue-500 transition-all"
                                >
                                    <option value="America/Bogota">America/Bogotá (UTC-5)</option>
                                    <option value="America/Lima">America/Lima (UTC-5)</option>
                                    <option value="America/Mexico_City">America/Ciudad de México (UTC-6)</option>
                                    <option value="America/Buenos_Aires">America/Buenos Aires (UTC-3)</option>
                                    <option value="America/Santiago">America/Santiago (UTC-3)</option>
                                    <option value="America/Caracas">America/Caracas (UTC-4)</option>
                                    <option value="America/Guatemala">America/Guatemala (UTC-6)</option>
                                    <option value="America/Panama">America/Panamá (UTC-5)</option>
                                    <option value="America/Costa_Rica">America/Costa Rica (UTC-6)</option>
                                    <option value="Europe/Madrid">Europe/Madrid (UTC+1)</option>
                                    <option value="UTC">UTC</option>
                                </select>
                            </div>
                            <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-[11px] text-blue-900 font-medium">
                                Se publicará automáticamente en la fecha y hora seleccionadas. El sistema chequea cada 5 minutos y dispara la publicación cuando llega el momento.
                            </div>
                        </div>

                        <div className="p-5 border-t border-gray-100 flex justify-end items-center gap-3 bg-gray-50/50">
                            <button
                                onClick={() => setIsScheduleModalOpen(false)}
                                disabled={isScheduling}
                                className="px-5 py-2.5 rounded-xl text-sm font-bold text-gray-500 hover:bg-gray-200 transition-all disabled:opacity-50"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={schedulePublication}
                                disabled={isScheduling || !scheduleDate || !scheduleTime}
                                className="px-6 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-black disabled:opacity-50 shadow-xl shadow-blue-600/20 hover:scale-105 transition-all flex items-center gap-2"
                            >
                                {isScheduling
                                    ? <><Loader2 className="w-4 h-4 animate-spin" /> PROGRAMANDO…</>
                                    : <><CalendarIcon className="w-4 h-4" /> CONFIRMAR PROGRAMACIÓN</>}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <MediaPicker
                isOpen={isMediaPickerOpen}
                onSelect={(images) => {
                    if (images && images.length > 0) {
                        setSelectedImage({ id: images[0].id, url: images[0].url, name: images[0].filename });
                        setGeneratedContent(null);
                    }
                    setIsMediaPickerOpen(false);
                }}
                onClose={() => setIsMediaPickerOpen(false)}
            />
        </div>
    );
};

export default PostGenerator;
