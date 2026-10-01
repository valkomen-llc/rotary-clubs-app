// ════════════════════════════════════════════════════════════════════════════
// Biblioteca Unificada de Contenidos — Estudio de Contenido IA
//
// Unifica el acceso a todos los activos multimedia generados por la plataforma:
//  - Imágenes y publicaciones generadas por IA
//  - Reels cinematográficos verticales (IA)
//  - Video Informes y proyectos de video
//
// Respeta estrictamente el aislamiento multi-tenant y la matriz de capacidades
// centralizadas (image_library, ai_reels, video_library).
// ════════════════════════════════════════════════════════════════════════════

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
    Layers,
    Image as ImageIcon,
    Sparkles,
    Film,
    Search,
    Filter,
    Play,
    Download,
    Share2,
    Calendar,
    Clock,
    CheckCircle2,
    AlertCircle,
    Copy,
    RefreshCw,
    ExternalLink,
    ChevronRight,
    Loader2,
    X,
    FileVideo
} from 'lucide-react';
import { toast } from 'sonner';
import PublicationLibrary, { type PublicationLibraryProps } from './PublicationLibrary';
import ReelLibrary from './ReelLibrary';
import { VideoReportLibrary } from './VideoReportLibrary';
import ProjectLibrary from './ProjectLibrary';
import type { ContentStudioToolsConfig } from '../../../lib/contentStudioFeatures';
import { useClub } from '../../../contexts/ClubContext';
import { isOnPlatformDomain } from '../../../lib/platformAdmin';

export type AssetTabType = 'all' | 'images' | 'reels' | 'videos';

export interface UnifiedContentLibraryProps {
    features: ContentStudioToolsConfig;
    isSuperOrGlobal: boolean;
    initialReelId?: string;
    onReusePost?: (pub: any) => void;
    onEditVideoReport?: (reportId: string) => void;
    onPublishVideo?: (item: { id: string; title: string; videoUrl: string }) => void;
    onDuplicateReel?: (prefill: any) => void;
    onPublishReel?: (item: { id: string; title: string; videoUrl: string }) => void;
}

interface UnifiedItem {
    id: string;
    type: 'image' | 'reel' | 'video';
    title: string;
    description?: string;
    url?: string | null;
    thumbUrl?: string | null;
    status: string;
    statusLabel: string;
    createdAt: string;
    raw: any;
}

const API = import.meta.env.VITE_API_URL || '/api';
const authHeaders = (): Record<string, string> => {
    const token = localStorage.getItem('rotary_token') || localStorage.getItem('token') || '';
    return {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
    };
};

export const UnifiedContentLibrary: React.FC<UnifiedContentLibraryProps> = ({
    features,
    isSuperOrGlobal,
    initialReelId,
    onReusePost,
    onEditVideoReport,
    onPublishVideo,
    onDuplicateReel,
    onPublishReel
}) => {
    const { club } = useClub();
    const isPlatform = isOnPlatformDomain();

    // Capacidades de activos
    const hasImages = isSuperOrGlobal || features.image_library !== false;
    const hasReels = isSuperOrGlobal || features.ai_reels !== false;
    const hasVideos = isSuperOrGlobal || features.video_library !== false;

    // Calcular pestañas disponibles según permisos
    const availableTabs = useMemo(() => {
        const tabs: { id: AssetTabType; label: string; icon: React.ReactNode }[] = [];
        const typesCount = (hasImages ? 1 : 0) + (hasReels ? 1 : 0) + (hasVideos ? 1 : 0);

        if (typesCount > 1 || isSuperOrGlobal) {
            tabs.push({ id: 'all', label: 'Todos', icon: <Layers className="w-4 h-4" /> });
        }
        if (hasImages) {
            tabs.push({ id: 'images', label: 'Imágenes', icon: <ImageIcon className="w-4 h-4" /> });
        }
        if (hasReels) {
            tabs.push({ id: 'reels', label: 'Reels IA', icon: <Sparkles className="w-4 h-4" /> });
        }
        if (hasVideos) {
            tabs.push({ id: 'videos', label: 'Videos', icon: <Film className="w-4 h-4" /> });
        }
        return tabs;
    }, [hasImages, hasReels, hasVideos, isSuperOrGlobal]);

    const [activeTab, setActiveTab] = useState<AssetTabType>(() => {
        if (availableTabs.some(t => t.id === 'all')) return 'all';
        return availableTabs[0]?.id || 'images';
    });

    // Filtros de estado contextuales
    const [statusFilterAll, setStatusFilterAll] = useState<string>('all');
    const [search, setSearch] = useState<string>('');

    // Estado para items agregados en vista "Todos"
    const [unifiedItems, setUnifiedItems] = useState<UnifiedItem[]>([]);
    const [loadingAll, setLoadingAll] = useState<boolean>(false);
    const [previewVideo, setPreviewVideo] = useState<{ url: string; title: string } | null>(null);

    // Contadores rápidos
    const [counts, setCounts] = useState({
        images: 0,
        reels: 0,
        videos: 0,
        total: 0
    });

    // Cargar datos unificados para la vista "Todos"
    const fetchUnifiedOverview = useCallback(async () => {
        if (!hasImages && !hasReels && !hasVideos) return;
        setLoadingAll(true);

        try {
            const h = authHeaders();
            const promises: Promise<any>[] = [];

            // 1. Cargar Publicaciones / Imágenes si están habilitadas
            if (hasImages) {
                const params = new URLSearchParams({ limit: '50' });
                const tenantClubId = !isPlatform ? (club?.id || '') : '';
                if (tenantClubId) params.set('clubId', tenantClubId);
                promises.push(
                    fetch(`${API}/social/publications?${params.toString()}`, { headers: h })
                        .then(r => r.ok ? r.json() : [])
                        .catch(() => [])
                );
            } else {
                promises.push(Promise.resolve([]));
            }

            // 2. Cargar Reels IA si están habilitados
            if (hasReels) {
                promises.push(
                    fetch(`${API}/content-studio/reels?limit=50`, { headers: h })
                        .then(r => r.ok ? r.json() : { projects: [] })
                        .catch(() => ({ projects: [] }))
                );
            } else {
                promises.push(Promise.resolve({ projects: [] }));
            }

            // 3. Cargar Video Informes y Proyectos si están habilitados
            if (hasVideos) {
                promises.push(
                    fetch(`${API}/content-studio/video-reports/projects`, { headers: h })
                        .then(r => r.ok ? r.json() : { projects: [] })
                        .catch(() => ({ projects: [] }))
                );
                promises.push(
                    fetch(`${API}/content-studio/projects`, { headers: h })
                        .then(r => r.ok ? r.json() : [])
                        .catch(() => [])
                );
            } else {
                promises.push(Promise.resolve({ projects: [] }));
                promises.push(Promise.resolve([]));
            }

            const [pubsData, reelsData, reportsData, videoProjectsData] = await Promise.all(promises);

            const items: UnifiedItem[] = [];

            // Procesar Publicaciones / Imágenes
            const pubsList = Array.isArray(pubsData) ? pubsData : [];
            for (const pub of pubsList) {
                const img = pub.imageUrl || pub.imageUrlInstagram || pub.imageUrlLandscape;
                items.push({
                    id: pub.id,
                    type: 'image',
                    title: pub.title || pub.platformCopies?.facebook?.copy?.slice(0, 50) || 'Publicación con Imagen IA',
                    description: pub.platformCopies?.facebook?.copy || pub.platformCopies?.instagram?.copy || '',
                    url: img,
                    thumbUrl: img,
                    status: pub.status || 'draft',
                    statusLabel: pub.status === 'published' ? 'Publicada' :
                                pub.status === 'scheduled' ? 'Programada' :
                                pub.status === 'error' ? 'Con error' :
                                pub.status === 'partial' ? 'Parcial' : 'Borrador',
                    createdAt: pub.createdAt,
                    raw: pub
                });
            }

            // Procesar Reels
            const reelsList = Array.isArray(reelsData?.projects) ? reelsData.projects : (Array.isArray(reelsData) ? reelsData : []);
            for (const reel of reelsList) {
                items.push({
                    id: reel.id,
                    type: 'reel',
                    title: reel.title || 'Reel IA Cinematográfico',
                    description: reel.direction?.narrative || 'Reel vertical generado con IA',
                    url: reel.videoUrl,
                    thumbUrl: reel.scenes?.[0]?.imageUrl || reel.thumbUrl || null,
                    status: reel.status || 'needs_review',
                    statusLabel: reel.status === 'ready' ? 'Listo' :
                                reel.status === 'needs_review' ? 'Por revisar' :
                                reel.status === 'montando' || reel.status === 'en_curso' ? 'En curso' :
                                reel.status === 'error' ? 'Con error' : reel.status,
                    createdAt: reel.createdAt,
                    raw: reel
                });
            }

            // Procesar Video Informes
            const reportsList = Array.isArray(reportsData?.projects) ? reportsData.projects : [];
            for (const rep of reportsList) {
                items.push({
                    id: rep.id,
                    type: 'video',
                    title: rep.title || 'Video Informe IA',
                    description: rep.objective || 'Resumen audiovisual de campaña',
                    url: rep.renderVideoUrl,
                    thumbUrl: rep.firstSceneThumb || null,
                    status: rep.status || 'draft',
                    statusLabel: rep.renderStatus === 'ready' ? 'Renderizado' :
                                rep.renderStatus === 'rendering' ? 'En proceso' :
                                rep.status === 'completed' ? 'Completado' : 'En edición',
                    createdAt: rep.createdAt,
                    raw: rep
                });
            }

            // Procesar Video Projects tradicionales
            const vProjList = Array.isArray(videoProjectsData) ? videoProjectsData : [];
            for (const vp of vProjList) {
                items.push({
                    id: vp.id,
                    type: 'video',
                    title: vp.title || 'Proyecto de Video',
                    description: 'Video generado con IA',
                    url: vp.videoUrl,
                    thumbUrl: vp.lastKieResponse?.thumbUrl || null,
                    status: vp.status || 'draft',
                    statusLabel: vp.status === 'ready' ? 'Listo' :
                                vp.status === 'processing' ? 'Procesando' :
                                vp.status === 'failed' ? 'Con error' : 'Borrador',
                    createdAt: vp.createdAt,
                    raw: vp
                });
            }

            // Ordenar por fecha de creación descendente
            items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

            setUnifiedItems(items);
            setCounts({
                images: pubsList.length,
                reels: reelsList.length,
                videos: reportsList.length + vProjList.length,
                total: items.length
            });
        } catch (err) {
            console.error('[UnifiedContentLibrary] Error al cargar vista global:', err);
        } finally {
            setLoadingAll(false);
        }
    }, [hasImages, hasReels, hasVideos, isPlatform, club?.id]);

    useEffect(() => {
        if (activeTab === 'all') {
            fetchUnifiedOverview();
        }
    }, [activeTab, fetchUnifiedOverview]);

    // Filtrado de items en vista "Todos"
    const filteredUnifiedItems = useMemo(() => {
        return unifiedItems.filter(item => {
            // Filtro por búsqueda
            if (search.trim()) {
                const q = search.toLowerCase();
                const matchTitle = item.title.toLowerCase().includes(q);
                const matchDesc = (item.description || '').toLowerCase().includes(q);
                if (!matchTitle && !matchDesc) return false;
            }

            // Filtro por estado en vista global
            if (statusFilterAll === 'ready') {
                return ['ready', 'published', 'completed'].includes(item.status);
            }
            if (statusFilterAll === 'in_progress') {
                return ['draft', 'scheduled', 'needs_review', 'montando', 'en_curso', 'processing', 'rendering'].includes(item.status);
            }
            if (statusFilterAll === 'error') {
                return ['error', 'failed'].includes(item.status);
            }

            return true;
        });
    }, [unifiedItems, search, statusFilterAll]);

    // Descarga de video
    const handleDownloadVideo = async (url: string, title: string) => {
        try {
            const res = await fetch(url);
            const blob = await res.blob();
            const blobUrl = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = blobUrl;
            a.download = `${title.toLowerCase().replace(/[^a-z0-9]/g, '-') || 'rotary-video'}.mp4`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(blobUrl);
            toast.success('Descarga de video iniciada');
        } catch {
            window.open(url, '_blank');
        }
    };

    return (
        <div className="space-y-6">
            {/* Barra Superior Unificada: Sub-pestañas de Activos */}
            <div className="bg-white p-2.5 rounded-2xl border border-gray-100 shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
                <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide p-1">
                    {availableTabs.map((t) => {
                        const active = activeTab === t.id;
                        let countBadge = 0;
                        if (t.id === 'all') countBadge = counts.total;
                        else if (t.id === 'images') countBadge = counts.images;
                        else if (t.id === 'reels') countBadge = counts.reels;
                        else if (t.id === 'videos') countBadge = counts.videos;

                        return (
                            <button
                                key={t.id}
                                onClick={() => setActiveTab(t.id)}
                                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                                    active
                                        ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-200'
                                        : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                                }`}
                            >
                                {t.icon}
                                <span>{t.label}</span>
                                {countBadge > 0 && (
                                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${
                                        active ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-700'
                                    }`}>
                                        {countBadge}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>

                {activeTab === 'all' && (
                    <div className="flex items-center gap-2 px-2">
                        <button
                            onClick={fetchUnifiedOverview}
                            disabled={loadingAll}
                            className="p-2 rounded-xl text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors"
                            title="Actualizar biblioteca"
                        >
                            <RefreshCw className={`w-4 h-4 ${loadingAll ? 'animate-spin' : ''}`} />
                        </button>
                    </div>
                )}
            </div>

            {/* VISTA 1: TODOS (Resumen y cuadrícula agregada) */}
            {activeTab === 'all' && (
                <div className="space-y-6 animate-in fade-in duration-300">
                    {/* Buscador y Filtros de Estado para Vista Global */}
                    <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex flex-col lg:flex-row gap-3 items-stretch lg:items-center">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Buscar en toda la biblioteca por título o descripción..."
                                className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all font-medium"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                        </div>

                        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide">
                            <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-bold text-gray-400 mr-1 flex-shrink-0">
                                <Filter className="w-3 h-3" /> Estado:
                            </span>
                            {[
                                { id: 'all', label: 'Todos' },
                                { id: 'ready', label: 'Listos / Publicados' },
                                { id: 'in_progress', label: 'Borradores / En proceso' },
                                { id: 'error', label: 'Con error' }
                            ].map(f => (
                                <button
                                    key={f.id}
                                    onClick={() => setStatusFilterAll(f.id)}
                                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                                        statusFilterAll === f.id
                                            ? 'bg-gray-900 text-white shadow-sm'
                                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                    }`}
                                >
                                    {f.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Resumen de Capacidades */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        {hasReels && (
                            <div
                                onClick={() => setActiveTab('reels')}
                                className="bg-gradient-to-br from-violet-500/10 to-purple-500/5 p-4 rounded-2xl border border-violet-100 hover:border-violet-300 transition-all cursor-pointer flex items-center justify-between group"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-violet-600 text-white flex items-center justify-center shadow-md shadow-violet-200">
                                        <Sparkles className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <div className="text-sm font-black text-gray-900">Reels IA</div>
                                        <div className="text-xs text-violet-700 font-bold">{counts.reels} generados</div>
                                    </div>
                                </div>
                                <span className="text-xs font-bold text-violet-600 group-hover:translate-x-1 transition-transform flex items-center gap-1">
                                    Ver biblioteca <ChevronRight className="w-3.5 h-3.5" />
                                </span>
                            </div>
                        )}

                        {hasVideos && (
                            <div
                                onClick={() => setActiveTab('videos')}
                                className="bg-gradient-to-br from-blue-500/10 to-indigo-500/5 p-4 rounded-2xl border border-blue-100 hover:border-blue-300 transition-all cursor-pointer flex items-center justify-between group"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-200">
                                        <Film className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <div className="text-sm font-black text-gray-900">Videos e Informes</div>
                                        <div className="text-xs text-blue-700 font-bold">{counts.videos} registrados</div>
                                    </div>
                                </div>
                                <span className="text-xs font-bold text-blue-600 group-hover:translate-x-1 transition-transform flex items-center gap-1">
                                    Ver biblioteca <ChevronRight className="w-3.5 h-3.5" />
                                </span>
                            </div>
                        )}

                        {hasImages && (
                            <div
                                onClick={() => setActiveTab('images')}
                                className="bg-gradient-to-br from-emerald-500/10 to-teal-500/5 p-4 rounded-2xl border border-emerald-100 hover:border-emerald-300 transition-all cursor-pointer flex items-center justify-between group"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-md shadow-emerald-200">
                                        <ImageIcon className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <div className="text-sm font-black text-gray-900">Imágenes y Copys</div>
                                        <div className="text-xs text-emerald-700 font-bold">{counts.images} publicaciones</div>
                                    </div>
                                </div>
                                <span className="text-xs font-bold text-emerald-600 group-hover:translate-x-1 transition-transform flex items-center gap-1">
                                    Ver biblioteca <ChevronRight className="w-3.5 h-3.5" />
                                </span>
                            </div>
                        )}
                    </div>

                    {/* Cuadrícula de Contenidos Unificados */}
                    {loadingAll ? (
                        <div className="py-20 text-center bg-white rounded-3xl border border-gray-100">
                            <Loader2 className="w-10 h-10 text-indigo-600 animate-spin mx-auto mb-4" />
                            <p className="text-gray-500 font-bold">Cargando todos los contenidos del sitio...</p>
                        </div>
                    ) : filteredUnifiedItems.length === 0 ? (
                        <div className="bg-white rounded-3xl border border-dashed border-gray-200 p-16 text-center">
                            <Layers className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                            <h3 className="text-lg font-black text-gray-900 mb-1">
                                {search ? 'No se encontraron resultados con ese criterio' : 'Biblioteca de contenidos vacía'}
                            </h3>
                            <p className="text-gray-500 text-sm max-w-md mx-auto">
                                {search
                                    ? 'Prueba modificando los términos de búsqueda o cambiando el filtro de estado.'
                                    : 'Los videos, reels e imágenes generados con IA para este sitio quedarán respaldados automáticamente aquí.'}
                            </p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                            {filteredUnifiedItems.map((item) => {
                                const isReel = item.type === 'reel';
                                const isVideo = item.type === 'video';
                                const isImage = item.type === 'image';

                                return (
                                    <div
                                        key={`${item.type}-${item.id}`}
                                        className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-xl hover:-translate-y-0.5 transition-all flex flex-col group/card"
                                    >
                                        {/* Thumbnail / Media Container */}
                                        <div className="relative aspect-[4/5] bg-gray-950 overflow-hidden">
                                            {item.thumbUrl ? (
                                                <img
                                                    src={item.thumbUrl}
                                                    alt={item.title}
                                                    className="w-full h-full object-cover transition-transform duration-300 group-hover/card:scale-105"
                                                    loading="lazy"
                                                />
                                            ) : isReel || isVideo ? (
                                                item.url ? (
                                                    <video
                                                        src={item.url}
                                                        className="w-full h-full object-cover"
                                                        preload="metadata"
                                                        muted
                                                    />
                                                ) : (
                                                    <div className="w-full h-full flex flex-col items-center justify-center text-gray-500 gap-2">
                                                        <FileVideo className="w-12 h-12 text-gray-400" />
                                                        <span className="text-[11px] font-bold text-gray-400">Sin video</span>
                                                    </div>
                                                )
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-gray-400">
                                                    <ImageIcon className="w-12 h-12" />
                                                </div>
                                            )}

                                            {/* Badge de Tipo de Activo */}
                                            <div className="absolute top-2.5 left-2.5 z-10">
                                                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider shadow-md backdrop-blur-md ${
                                                    isReel
                                                        ? 'bg-violet-600/90 text-white'
                                                        : isVideo
                                                        ? 'bg-blue-600/90 text-white'
                                                        : 'bg-emerald-600/90 text-white'
                                                }`}>
                                                    {isReel && <Sparkles className="w-3 h-3" />}
                                                    {isVideo && <Film className="w-3 h-3" />}
                                                    {isImage && <ImageIcon className="w-3 h-3" />}
                                                    {isReel ? 'Reel IA' : isVideo ? 'Video' : 'Imagen'}
                                                </span>
                                            </div>

                                            {/* Badge de Estado */}
                                            <div className="absolute top-2.5 right-2.5 z-10">
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wide bg-black/60 text-white backdrop-blur-md border border-white/20">
                                                    {item.statusLabel}
                                                </span>
                                            </div>

                                            {/* Overlay de Reproducción Rápida para Videos y Reels */}
                                            {(isReel || isVideo) && item.url && (
                                                <div
                                                    onClick={() => setPreviewVideo({ url: item.url!, title: item.title })}
                                                    className="absolute inset-0 bg-black/40 opacity-0 group-hover/card:opacity-100 transition-opacity flex items-center justify-center cursor-pointer"
                                                >
                                                    <div className="w-14 h-14 rounded-full bg-white/90 text-gray-900 flex items-center justify-center shadow-2xl transform scale-90 group-hover/card:scale-100 transition-transform">
                                                        <Play className="w-6 h-6 ml-0.5 text-indigo-600 fill-current" />
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        {/* Info Card */}
                                        <div className="p-4 flex-1 flex flex-col justify-between">
                                            <div>
                                                <h3 className="font-bold text-gray-900 text-sm line-clamp-1 mb-1 tracking-tight" title={item.title}>
                                                    {item.title}
                                                </h3>
                                                {item.description && (
                                                    <p className="text-xs text-gray-500 line-clamp-2 leading-relaxed mb-3">
                                                        {item.description}
                                                    </p>
                                                )}
                                            </div>

                                            <div className="pt-3 border-t border-gray-100 flex items-center justify-between">
                                                <span className="text-[10px] font-semibold text-gray-400 flex items-center gap-1">
                                                    <Clock className="w-3 h-3" />
                                                    {new Date(item.createdAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                                                </span>

                                                <div className="flex items-center gap-1">
                                                    {/* Acciones para Reels */}
                                                    {isReel && (
                                                        <>
                                                            {item.url && (
                                                                <button
                                                                    onClick={() => handleDownloadVideo(item.url!, item.title)}
                                                                    className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                                                                    title="Descargar MP4"
                                                                >
                                                                    <Download className="w-3.5 h-3.5" />
                                                                </button>
                                                            )}
                                                            {onDuplicateReel && (
                                                                <button
                                                                    onClick={() => onDuplicateReel(item.raw)}
                                                                    className="p-1.5 text-violet-600 hover:bg-violet-50 rounded-lg transition-colors"
                                                                    title="Duplicar en Creador de Reels"
                                                                >
                                                                    <Copy className="w-3.5 h-3.5" />
                                                                </button>
                                                            )}
                                                            <button
                                                                onClick={() => setActiveTab('reels')}
                                                                className="px-2 py-1 text-[10px] font-bold text-violet-700 bg-violet-50 hover:bg-violet-100 rounded-lg transition-colors"
                                                            >
                                                                Abrir
                                                            </button>
                                                        </>
                                                    )}

                                                    {/* Acciones para Videos */}
                                                    {isVideo && (
                                                        <>
                                                            {item.url && (
                                                                <button
                                                                    onClick={() => handleDownloadVideo(item.url!, item.title)}
                                                                    className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                                                                    title="Descargar Video"
                                                                >
                                                                    <Download className="w-3.5 h-3.5" />
                                                                </button>
                                                            )}
                                                            {onEditVideoReport && item.type === 'video' && (
                                                                <button
                                                                    onClick={() => onEditVideoReport(item.id)}
                                                                    className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                                                    title="Editar Video Informe"
                                                                >
                                                                    <Film className="w-3.5 h-3.5" />
                                                                </button>
                                                            )}
                                                            <button
                                                                onClick={() => setActiveTab('videos')}
                                                                className="px-2 py-1 text-[10px] font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                                                            >
                                                                Abrir
                                                            </button>
                                                        </>
                                                    )}

                                                    {/* Acciones para Imágenes */}
                                                    {isImage && (
                                                        <>
                                                            {onReusePost && (
                                                                <button
                                                                    onClick={() => onReusePost(item.raw)}
                                                                    className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                                                                    title="Reutilizar en Generador"
                                                                >
                                                                    <Sparkles className="w-3.5 h-3.5" />
                                                                </button>
                                                            )}
                                                            <button
                                                                onClick={() => setActiveTab('images')}
                                                                className="px-2 py-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors"
                                                            >
                                                                Abrir
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* VISTA 2: REELS IA (Biblioteca completa con editor de escenas, narración y render) */}
            {activeTab === 'reels' && hasReels && (
                <div className="animate-in fade-in duration-300">
                    <ReelLibrary
                        initialReelId={initialReelId}
                        onPublish={(r) => {
                            if (onPublishReel) {
                                onPublishReel({ id: r.id, title: r.title, videoUrl: r.videoUrl || '' });
                            }
                        }}
                        onDuplicate={(p) => {
                            if (onDuplicateReel) {
                                onDuplicateReel(p);
                            }
                        }}
                    />
                </div>
            )}

            {/* VISTA 3: VIDEOS (Video Informes IA y Proyectos de Video) */}
            {activeTab === 'videos' && hasVideos && (
                <div className="space-y-6 animate-in fade-in duration-300">
                    <VideoReportLibrary
                        onEditProject={(reportId) => {
                            if (onEditVideoReport) onEditVideoReport(reportId);
                        }}
                        onPublishVideo={(item) => {
                            if (onPublishVideo) onPublishVideo(item);
                        }}
                    />

                    <details className="bg-white rounded-2xl border border-gray-100 shadow-sm">
                        <summary className="cursor-pointer p-5 font-black text-gray-700 text-sm hover:bg-gray-50 transition-colors flex items-center justify-between">
                            <span>Videos AI generados (Proyectos de Video)</span>
                            <span className="text-[10px] font-bold text-gray-400">Click para expandir</span>
                        </summary>
                        <div className="p-5 border-t border-gray-50">
                            <ProjectLibrary />
                        </div>
                    </details>
                </div>
            )}

            {/* VISTA 4: IMÁGENES (Biblioteca de Publicaciones con Copys y Cuentas Sociales) */}
            {activeTab === 'images' && hasImages && (
                <div className="animate-in fade-in duration-300">
                    <PublicationLibrary
                        onReusePost={(pub) => {
                            if (onReusePost) onReusePost(pub);
                        }}
                    />
                </div>
            )}

            {/* Modal de Vista Previa de Video */}
            {previewVideo && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-950/80 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-gray-900 rounded-3xl overflow-hidden shadow-2xl max-w-lg w-full border border-gray-800 flex flex-col">
                        <div className="p-4 border-b border-gray-800 flex items-center justify-between text-white">
                            <h3 className="font-bold text-sm truncate flex-1 mr-4">{previewVideo.title}</h3>
                            <button
                                onClick={() => setPreviewVideo(null)}
                                className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="relative aspect-[9/16] bg-black max-h-[70vh] flex items-center justify-center">
                            <video
                                src={previewVideo.url}
                                controls
                                autoPlay
                                className="w-full h-full object-contain"
                            />
                        </div>
                        <div className="p-4 bg-gray-900 flex justify-end gap-2 border-t border-gray-800">
                            <button
                                onClick={() => handleDownloadVideo(previewVideo.url, previewVideo.title)}
                                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 transition-all shadow-md shadow-indigo-600/30"
                            >
                                <Download className="w-4 h-4" />
                                Descargar Video MP4
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default UnifiedContentLibrary;
