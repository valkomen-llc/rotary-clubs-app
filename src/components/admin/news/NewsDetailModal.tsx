import React, { useState, useEffect } from 'react';
import {
    X, ExternalLink, Edit3, Send, Copy, Trash2, Globe, Eye,
    Calendar, User, Tag, ShieldCheck, BarChart3, RefreshCw,
    CheckCircle2, AlertTriangle, Building2, Clock, Share2,
    Layers, ArrowUpRight, Check, AlertCircle, Sparkles, BookOpen, Link as LinkIcon
} from 'lucide-react';
import { toast } from 'sonner';

export interface DistributionTargetDetail {
    targetId: string;
    targetName: string;
    status: string;
    syncMode: string;
    distributedAt?: string | null;
    lastSyncedAt?: string | null;
    localEdits?: boolean;
    reason?: string | null;
    publicUrl?: string | null;
}

export interface PostDetailData {
    id: string;
    title: string;
    slug?: string;
    content: string;
    image: string | null;
    published: boolean;
    category?: string;
    tags?: string[];
    keywords?: string;
    seoTitle?: string;
    seoDescription?: string;
    seoImage?: string;
    createdAt: string;
    updatedAt?: string;
    clubId?: string | null;
    clubName?: string | null;
    publicUrl?: string | null;
    canonicalUrl?: string | null;
    origin?: 'own' | 'replicated' | 'global' | 'central' | 'foreign';
    originLabel?: string;
    sourceDistrictId?: string | null;
    targetClubIds?: string[];
    targetNames?: string[];
    distributionTargets?: DistributionTargetDetail[];
    canEdit?: boolean;
    removal?: { action: 'delete' | 'retire' | 'none'; label: string | null; help: string };
    submissionOrigin?: {
        articleId: string;
        status: string;
        submissionId: string;
        campaignId: string;
        club?: string | null;
        senderName?: string | null;
        campaignName?: string | null;
    } | null;
}

interface NewsDetailModalProps {
    post: PostDetailData | null;
    isOpen: boolean;
    onClose: () => void;
    onEdit: (post: PostDetailData) => void;
    onOpenDistribution: (post: PostDetailData) => void;
    onTogglePublish: (post: PostDetailData) => Promise<void>;
    onDuplicate: (post: PostDetailData) => void;
    onDeleteOrRetire: (post: PostDetailData) => Promise<void>;
    onRefresh: () => void;
    club: any;
    user: any;
}

export const NewsDetailModal: React.FC<NewsDetailModalProps> = ({
    post,
    isOpen,
    onClose,
    onEdit,
    onOpenDistribution,
    onTogglePublish,
    onDuplicate,
    onDeleteOrRetire,
    onRefresh,
    club,
    user
}) => {
    const [activeTab, setActiveTab] = useState<'general' | 'distribution' | 'seo' | 'analytics'>('general');
    const [stats, setStats] = useState<any>(null);
    const [loadingStats, setLoadingStats] = useState(false);
    const [isActionLoading, setIsActionLoading] = useState(false);
    const [copiedUrl, setCopiedUrl] = useState(false);
    const [retiringTargetId, setRetiringTargetId] = useState<string | null>(null);

    const token = () => localStorage.getItem('rotary_token');
    const apiUrl = import.meta.env.VITE_API_URL || '/api';

    useEffect(() => {
        if (!isOpen || !post?.id) {
            setStats(null);
            return;
        }
        // Carga de analíticas reales del artículo
        const fetchStats = async () => {
            setLoadingStats(true);
            try {
                const res = await fetch(`${apiUrl}/admin/posts/${post.id}/stats?period=todo`, {
                    headers: { Authorization: `Bearer ${token()}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    setStats(data);
                }
            } catch (e) {
                console.warn('[NewsDetailModal] Error fetching stats:', e);
            } finally {
                setLoadingStats(false);
            }
        };

        fetchStats();
    }, [isOpen, post?.id]);

    if (!isOpen || !post) return null;

    const handleCopyUrl = (urlToCopy?: string | null) => {
        const u = urlToCopy || post.publicUrl;
        if (!u) {
            toast.error('Esta publicación aún no tiene URL pública activa.');
            return;
        }
        navigator.clipboard.writeText(u);
        setCopiedUrl(true);
        toast.success('Enlace copiado al portapapeles');
        setTimeout(() => setCopiedUrl(false), 2000);
    };

    const handleRetireTarget = async (targetId: string, targetName: string) => {
        if (!confirm(`¿Deseas retirar esta noticia del sitio "${targetName}"? El artículo maestro se conservará.`)) return;
        setRetiringTargetId(targetId);
        try {
            const currentTargets = post.targetClubIds || [];
            const remaining = currentTargets.filter(id => id !== targetId);
            const res = await fetch(`${apiUrl}/admin/posts/${post.id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token()}`
                },
                body: JSON.stringify({
                    targetClubIds: remaining
                })
            });
            if (res.ok) {
                toast.success(`Noticia retirada de "${targetName}" correctamente.`);
                onRefresh();
            } else {
                toast.error('No se pudo retirar la noticia de ese sitio.');
            }
        } catch {
            toast.error('Error de conexión al retirar la noticia.');
        } finally {
            setRetiringTargetId(null);
        }
    };

    const formattedDate = post.createdAt ? new Date(post.createdAt).toLocaleDateString('es-CO', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    }) : 'Fecha no definida';

    const formattedUpdated = post.updatedAt ? new Date(post.updatedAt).toLocaleDateString('es-CO', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    }) : null;

    const distributionList = post.distributionTargets || (post.targetClubIds || []).map((id, idx) => ({
        targetId: id,
        targetName: post.targetNames?.[idx] || id,
        status: post.published ? 'published' : 'draft',
        syncMode: 'synced',
        publicUrl: null
    }));

    return (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex justify-center items-start p-2 sm:p-4 md:p-6 animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-5xl rounded-3xl shadow-2xl border border-gray-100 overflow-hidden flex flex-col my-auto max-h-[92vh]">
                
                {/* ── TOP HEADER OPERATIVO ───────────────────────────── */}
                <div className="px-6 py-5 border-b border-gray-100 bg-white flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between sticky top-0 z-20">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-sky-50 text-rotary-blue flex items-center justify-center font-bold">
                            <BookOpen className="w-5 h-5" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider ${
                                    post.published
                                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                        : 'bg-gray-100 text-gray-700 border border-gray-200'
                                }`}>
                                    {post.published ? 'PUBLICADA' : 'BORRADOR'}
                                </span>

                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200 uppercase">
                                    {post.originLabel || 'ORIGEN PROPIO'}
                                </span>

                                {post.category && (
                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 border border-violet-200">
                                        {post.category}
                                    </span>
                                )}

                                {distributionList.length > 0 && (
                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 inline-flex items-center gap-1">
                                        <Layers className="w-3 h-3" /> {distributionList.length} SITIOS
                                    </span>
                                )}
                            </div>
                            <h2 className="text-xl font-bold text-gray-900 mt-1 line-clamp-1">{post.title}</h2>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-center">
                        {post.publicUrl && post.published && (
                            <a
                                href={post.publicUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl hover:bg-emerald-100 transition-colors"
                            >
                                <ExternalLink className="w-3.5 h-3.5" /> Ver en vivo
                            </a>
                        )}

                        <button
                            onClick={() => onEdit(post)}
                            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-gray-700 bg-gray-50 border border-gray-200 rounded-xl hover:bg-gray-100 transition-colors"
                        >
                            <Edit3 className="w-3.5 h-3.5 text-rotary-blue" /> Editar
                        </button>

                        <button
                            onClick={() => onOpenDistribution(post)}
                            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-white bg-rotary-blue rounded-xl hover:bg-sky-800 shadow-md shadow-blue-900/10 transition-colors"
                        >
                            <Send className="w-3.5 h-3.5" /> Distribuir
                        </button>

                        <button
                            onClick={onClose}
                            className="p-2 text-gray-400 hover:text-gray-600 rounded-xl hover:bg-gray-100 transition-colors ml-1"
                            aria-label="Cerrar ficha"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* ── BARRA DE PESTAÑAS INTERNAS ──────────────────────── */}
                <div className="flex items-center gap-2 px-6 border-b border-gray-100 bg-gray-50/60 overflow-x-auto">
                    <button
                        onClick={() => setActiveTab('general')}
                        className={`py-3 px-4 text-xs font-bold border-b-2 transition-colors flex items-center gap-2 ${
                            activeTab === 'general'
                                ? 'border-rotary-blue text-rotary-blue'
                                : 'border-transparent text-gray-500 hover:text-gray-900'
                        }`}
                    >
                        <Eye className="w-4 h-4" /> Vista General
                    </button>
                    <button
                        onClick={() => setActiveTab('distribution')}
                        className={`py-3 px-4 text-xs font-bold border-b-2 transition-colors flex items-center gap-2 ${
                            activeTab === 'distribution'
                                ? 'border-rotary-blue text-rotary-blue'
                                : 'border-transparent text-gray-500 hover:text-gray-900'
                        }`}
                    >
                        <Layers className="w-4 h-4" /> Publicada en ({distributionList.length})
                    </button>
                    <button
                        onClick={() => setActiveTab('seo')}
                        className={`py-3 px-4 text-xs font-bold border-b-2 transition-colors flex items-center gap-2 ${
                            activeTab === 'seo'
                                ? 'border-rotary-blue text-rotary-blue'
                                : 'border-transparent text-gray-500 hover:text-gray-900'
                        }`}
                    >
                        <Globe className="w-4 h-4" /> SEO & Metadatos
                    </button>
                    <button
                        onClick={() => setActiveTab('analytics')}
                        className={`py-3 px-4 text-xs font-bold border-b-2 transition-colors flex items-center gap-2 ${
                            activeTab === 'analytics'
                                ? 'border-rotary-blue text-rotary-blue'
                                : 'border-transparent text-gray-500 hover:text-gray-900'
                        }`}
                    >
                        <BarChart3 className="w-4 h-4" /> Rendimiento & Lectura
                    </button>
                </div>

                {/* ── CONTENIDO SCROLLABLE ───────────────────────────── */}
                <div className="p-6 overflow-y-auto flex-1 bg-slate-50/50 space-y-6">
                    
                    {/* TAB 1: VISTA GENERAL */}
                    {activeTab === 'general' && (
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            {/* Columna Principal: Artículo */}
                            <div className="lg:col-span-2 space-y-6">
                                {post.image && (
                                    <div className="w-full h-64 sm:h-80 rounded-2xl overflow-hidden border border-gray-200 bg-gray-100 relative group shadow-sm">
                                        <img
                                            src={post.image}
                                            alt={post.title}
                                            className="w-full h-full object-cover"
                                        />
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent flex items-end p-6">
                                            <div className="text-white">
                                                <p className="text-xs uppercase font-extrabold tracking-wider text-sky-200">
                                                    {post.clubName || 'Club Platform Central'}
                                                </p>
                                                <h1 className="text-lg sm:text-2xl font-bold mt-1 leading-snug drop-shadow-md">
                                                    {post.title}
                                                </h1>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {post.seoDescription && (
                                    <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
                                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">
                                            Extracto / Resumen Ejecutivo
                                        </span>
                                        <p className="text-sm text-gray-700 italic leading-relaxed">
                                            "{post.seoDescription}"
                                        </p>
                                    </div>
                                )}

                                <div className="bg-white p-6 sm:p-8 rounded-2xl border border-gray-100 shadow-sm">
                                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-4">
                                        Cuerpo de la Publicación
                                    </span>
                                    <div
                                        className="prose prose-sm sm:prose max-w-none text-gray-800 space-y-4"
                                        dangerouslySetInnerHTML={{ __html: post.content }}
                                    />
                                </div>
                            </div>

                            {/* Columna Lateral: Ficha Técnica & Acciones */}
                            <div className="space-y-6">
                                {/* Ficha de Procedencia */}
                                <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm space-y-4">
                                    <h3 className="text-xs font-extrabold text-gray-900 uppercase tracking-wider flex items-center gap-2">
                                        <Building2 className="w-4 h-4 text-rotary-blue" /> Procedencia & Autoría
                                    </h3>
                                    
                                    <div className="space-y-2 text-xs">
                                        <div className="flex justify-between py-1.5 border-b border-gray-50">
                                            <span className="text-gray-400 font-medium">Sitio de Origen:</span>
                                            <span className="font-bold text-gray-800 text-right">{post.clubName || 'Club Platform Central'}</span>
                                        </div>
                                        <div className="flex justify-between py-1.5 border-b border-gray-50">
                                            <span className="text-gray-400 font-medium">Fecha Emisión:</span>
                                            <span className="font-bold text-gray-800 text-right">{formattedDate}</span>
                                        </div>
                                        {formattedUpdated && (
                                            <div className="flex justify-between py-1.5 border-b border-gray-50">
                                                <span className="text-gray-400 font-medium">Modificado:</span>
                                                <span className="font-bold text-gray-600 text-right">{formattedUpdated}</span>
                                            </div>
                                        )}
                                        <div className="flex justify-between py-1.5 border-b border-gray-50">
                                            <span className="text-gray-400 font-medium">Identificador:</span>
                                            <span className="font-mono text-[10px] text-gray-500 text-right">{post.id.slice(0, 13)}...</span>
                                        </div>
                                        {post.submissionOrigin && (
                                            <div className="pt-2">
                                                <span className="text-[10px] font-bold text-sky-700 bg-sky-50 p-2 rounded-xl block border border-sky-200">
                                                    Origen: Solicitud de contenido de <b>{post.submissionOrigin.club || post.submissionOrigin.senderName || 'Club'}</b>
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Acciones Rápidas */}
                                <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm space-y-3">
                                    <h3 className="text-xs font-extrabold text-gray-900 uppercase tracking-wider">
                                        Acciones de Publicación
                                    </h3>

                                    <div className="grid grid-cols-1 gap-2">
                                        <button
                                            onClick={() => handleCopyUrl()}
                                            disabled={!post.publicUrl}
                                            className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl border border-gray-200 text-xs font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-40 transition-colors"
                                        >
                                            <span className="flex items-center gap-2">
                                                <LinkIcon className="w-3.5 h-3.5 text-rotary-blue" />
                                                {copiedUrl ? '¡Copiado!' : 'Copiar URL pública'}
                                            </span>
                                            <ArrowUpRight className="w-3.5 h-3.5 text-gray-400" />
                                        </button>

                                        <button
                                            onClick={() => onDuplicate(post)}
                                            className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl border border-gray-200 text-xs font-bold text-gray-700 hover:bg-gray-50 transition-colors"
                                        >
                                            <span className="flex items-center gap-2">
                                                <Copy className="w-3.5 h-3.5 text-indigo-600" />
                                                Duplicar como borrador
                                            </span>
                                        </button>

                                        <button
                                            onClick={async () => {
                                                setIsActionLoading(true);
                                                try {
                                                    await onTogglePublish(post);
                                                } finally {
                                                    setIsActionLoading(false);
                                                }
                                            }}
                                            disabled={isActionLoading}
                                            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border text-xs font-bold transition-colors ${
                                                post.published
                                                    ? 'border-amber-200 text-amber-800 bg-amber-50 hover:bg-amber-100'
                                                    : 'border-emerald-200 text-emerald-800 bg-emerald-50 hover:bg-emerald-100'
                                            }`}
                                        >
                                            <span className="flex items-center gap-2">
                                                <RefreshCw className={`w-3.5 h-3.5 ${isActionLoading ? 'animate-spin' : ''}`} />
                                                {post.published ? 'Despublicar artículo' : 'Publicar inmediatamente'}
                                            </span>
                                        </button>

                                        <button
                                            onClick={async () => {
                                                if (confirm(post.removal?.help || '¿Deseas eliminar esta publicación?')) {
                                                    await onDeleteOrRetire(post);
                                                    onClose();
                                                }
                                            }}
                                            className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl border border-red-200 text-xs font-bold text-red-600 hover:bg-red-50 transition-colors mt-2"
                                        >
                                            <span className="flex items-center gap-2">
                                                <Trash2 className="w-3.5 h-3.5" />
                                                {post.removal?.label || 'Eliminar noticia'}
                                            </span>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* TAB 2: PUBLICADA EN (DISTRIBUCIÓN) */}
                    {activeTab === 'distribution' && (
                        <div className="space-y-6">
                            <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                <div>
                                    <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                                        <Layers className="w-5 h-5 text-rotary-blue" />
                                        Destinos de Publicación ({distributionList.length})
                                    </h3>
                                    <p className="text-xs text-gray-500 mt-1">
                                        Esta noticia fue enviada a los siguientes sitios del ecosistema. Cada sitio resuelve su identidad y dominio propio.
                                    </p>
                                </div>
                                <button
                                    onClick={() => onOpenDistribution(post)}
                                    className="inline-flex items-center gap-2 px-4 py-2 bg-rotary-blue text-white text-xs font-bold rounded-xl hover:bg-sky-800 shadow-md transition-all self-start sm:self-auto"
                                >
                                    <Send className="w-3.5 h-3.5" /> + Distribuir a otros sitios
                                </button>
                            </div>

                            {distributionList.length === 0 ? (
                                <div className="bg-white p-12 rounded-2xl border border-dashed border-gray-200 text-center space-y-3">
                                    <div className="w-12 h-12 bg-sky-50 text-rotary-blue rounded-full flex items-center justify-center mx-auto">
                                        <Layers className="w-6 h-6" />
                                    </div>
                                    <h4 className="text-sm font-bold text-gray-800">Esta noticia no tiene destinos asignados</h4>
                                    <p className="text-xs text-gray-500 max-w-md mx-auto">
                                        Actualmente solo existe en el sitio emisor. Puedes distribuirla instantáneamente a cualquier club, distrito o programa de la red.
                                    </p>
                                    <button
                                        onClick={() => onOpenDistribution(post)}
                                        className="mt-2 inline-flex items-center gap-2 px-4 py-2 bg-rotary-blue text-white text-xs font-bold rounded-xl hover:bg-sky-800 transition-colors"
                                    >
                                        <Send className="w-3.5 h-3.5" /> Seleccionar sitios de destino
                                    </button>
                                </div>
                            ) : (
                                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                                    <table className="w-full text-left text-xs">
                                        <thead className="bg-gray-50/50 border-b border-gray-100 text-gray-400 font-extrabold uppercase tracking-wider text-[10px]">
                                            <tr>
                                                <th className="px-6 py-3.5">Sitio de destino</th>
                                                <th className="px-6 py-3.5">Estado en sitio</th>
                                                <th className="px-6 py-3.5">Sincronización</th>
                                                <th className="px-6 py-3.5">URL Pública</th>
                                                <th className="px-6 py-3.5 text-right">Acciones</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {distributionList.map((target) => (
                                                <tr key={target.targetId} className="hover:bg-sky-50/20 transition-colors">
                                                    <td className="px-6 py-4">
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-8 h-8 rounded-lg bg-sky-50 flex items-center justify-center text-rotary-blue font-bold">
                                                                <Building2 className="w-4 h-4" />
                                                            </div>
                                                            <div>
                                                                <span className="font-bold text-gray-900 block">{target.targetName}</span>
                                                                <span className="text-[10px] text-gray-400 font-mono">ID: {target.targetId.slice(0, 8)}...</span>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase inline-flex items-center gap-1 ${
                                                            target.status === 'published'
                                                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                                                : 'bg-gray-100 text-gray-600 border border-gray-200'
                                                        }`}>
                                                            <span className={`w-1.5 h-1.5 rounded-full ${target.status === 'published' ? 'bg-emerald-500' : 'bg-gray-400'}`} />
                                                            {target.status === 'published' ? 'Publicada' : 'Borrador'}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4 text-gray-500">
                                                        <span className="flex items-center gap-1">
                                                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                                                            Sincronizado
                                                        </span>
                                                        {target.lastSyncedAt && (
                                                            <span className="text-[10px] text-gray-400 block mt-0.5">
                                                                {new Date(target.lastSyncedAt).toLocaleDateString('es-CO')}
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        {target.publicUrl ? (
                                                            <a
                                                                href={target.publicUrl}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="text-rotary-blue hover:underline font-bold inline-flex items-center gap-1 text-xs"
                                                            >
                                                                Ver en sitio <ArrowUpRight className="w-3.5 h-3.5" />
                                                            </a>
                                                        ) : (
                                                            <span className="text-gray-400 italic text-[11px]">Resuelto al visitar</span>
                                                        )}
                                                    </td>
                                                    <td className="px-6 py-4 text-right">
                                                        <button
                                                            onClick={() => handleRetireTarget(target.targetId, target.targetName)}
                                                            disabled={retiringTargetId === target.targetId}
                                                            className="text-xs font-bold text-red-500 hover:text-red-700 disabled:opacity-40 transition-colors"
                                                            title="Retirar noticia de este club manteniendo el artículo maestro"
                                                        >
                                                            {retiringTargetId === target.targetId ? 'Retirando...' : 'Retirar'}
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    )}

                    {/* TAB 3: SEO & METADATOS */}
                    {activeTab === 'seo' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm space-y-4">
                                <h3 className="text-xs font-extrabold text-gray-900 uppercase tracking-wider flex items-center gap-2">
                                    <Globe className="w-4 h-4 text-rotary-blue" /> Parámetros SEO & Indexación
                                </h3>

                                <div className="space-y-3 text-xs">
                                    <div>
                                        <span className="text-gray-400 font-bold block mb-1">Slug Canónico</span>
                                        <div className="p-2.5 bg-gray-50 border border-gray-200 rounded-xl font-mono text-gray-700">
                                            {post.slug || 'slug-automatico'}
                                        </div>
                                    </div>

                                    <div>
                                        <span className="text-gray-400 font-bold block mb-1">Meta Title</span>
                                        <div className="p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-gray-800">
                                            {post.seoTitle || post.title}
                                        </div>
                                    </div>

                                    <div>
                                        <span className="text-gray-400 font-bold block mb-1">Meta Description</span>
                                        <div className="p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-gray-700">
                                            {post.seoDescription || 'Sin descripción configurada.'}
                                        </div>
                                    </div>

                                    <div>
                                        <span className="text-gray-400 font-bold block mb-1">Palabras Clave (Keywords)</span>
                                        <div className="p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-gray-600">
                                            {post.keywords || (post.tags || []).join(', ') || 'Rotary, Noticias, Servicio Humanitario'}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm space-y-4">
                                <h3 className="text-xs font-extrabold text-gray-900 uppercase tracking-wider flex items-center gap-2">
                                    <Share2 className="w-4 h-4 text-emerald-600" /> Vista Previa en Redes & Buscadores
                                </h3>

                                <div className="border border-gray-200 rounded-2xl overflow-hidden shadow-sm bg-white">
                                    {post.image && (
                                        <img src={post.image} alt="" className="w-full h-40 object-cover" />
                                    )}
                                    <div className="p-4 space-y-1.5">
                                        <span className="text-[10px] text-gray-400 uppercase tracking-wider block font-mono">
                                            {post.publicUrl ? new URL(post.publicUrl).hostname : 'clubplatform.org'}
                                        </span>
                                        <h4 className="text-sm font-bold text-gray-900 line-clamp-2">
                                            {post.seoTitle || post.title}
                                        </h4>
                                        <p className="text-xs text-gray-500 line-clamp-2">
                                            {post.seoDescription || 'Lee el artículo completo en Club Platform.'}
                                        </p>
                                    </div>
                                </div>

                                <div className="p-3 bg-sky-50 rounded-xl border border-sky-100 text-xs text-sky-800">
                                    <b>Estrategia Canónica Multi-Dominio:</b> Las réplicas en sitios de clubes mantienen etiquetas OpenGraph sincronizadas con su respectivo dominio de presentación para optimizar el alcance local sin penalización por contenido duplicado.
                                </div>
                            </div>
                        </div>
                    )}

                    {/* TAB 4: RENDIMIENTO & ANALÍTICAS */}
                    {activeTab === 'analytics' && (
                        <div className="space-y-6">
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                                <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
                                    <span className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest block">
                                        Visualizaciones
                                    </span>
                                    <span className="text-2xl font-black text-gray-900 mt-1 block">
                                        {stats?.totals?.views ?? 0}
                                    </span>
                                    <span className="text-[10px] text-emerald-600 font-bold mt-1 block">Impacto en vivo</span>
                                </div>

                                <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
                                    <span className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest block">
                                        Lectores Únicos
                                    </span>
                                    <span className="text-2xl font-black text-gray-900 mt-1 block">
                                        {stats?.totals?.uniques ?? 0}
                                    </span>
                                    <span className="text-[10px] text-gray-400 font-medium mt-1 block">Visitantes verificados</span>
                                </div>

                                <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
                                    <span className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest block">
                                        Sitios Activos
                                    </span>
                                    <span className="text-2xl font-black text-rotary-blue mt-1 block">
                                        {distributionList.length || 1}
                                    </span>
                                    <span className="text-[10px] text-sky-600 font-medium mt-1 block">Puntos de difusión</span>
                                </div>

                                <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
                                    <span className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest block">
                                        Tiempo Lectura
                                    </span>
                                    <span className="text-2xl font-black text-gray-900 mt-1 block">
                                        {stats?.totals?.avgSeconds ? `${stats.totals.avgSeconds}s` : '—'}
                                    </span>
                                    <span className="text-[10px] text-gray-400 font-medium mt-1 block">Promedio en página</span>
                                </div>
                            </div>

                            {/* Desglose de fuentes y dispositivos si existen */}
                            {stats && stats.sources && stats.sources.length > 0 ? (
                                <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm space-y-4">
                                    <h4 className="text-xs font-extrabold text-gray-900 uppercase tracking-wider">
                                        Tráfico por Canal de Llegada
                                    </h4>
                                    <div className="space-y-2">
                                        {stats.sources.map((src: any, i: number) => (
                                            <div key={i} className="flex items-center justify-between text-xs py-1.5 border-b border-gray-50">
                                                <span className="font-bold text-gray-700">{src.label || 'Directo'}</span>
                                                <span className="font-mono text-gray-900 font-extrabold">{src.views} vistas ({src.pct}%)</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                <div className="bg-white p-8 rounded-2xl border border-gray-100 shadow-sm text-center text-xs text-gray-500">
                                    <BarChart3 className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                                    <p className="font-bold text-gray-700">Métricas en acumulación</p>
                                    <p className="text-gray-400 max-w-sm mx-auto mt-1">
                                        A medida que los lectores visiten este artículo en el sitio del club o del distrito, el motor de analítica registrará las lecturas e interacciones automáticamente.
                                    </p>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* ── FOOTER ACTIONS ─────────────────────────────────── */}
                <div className="px-6 py-4 border-t border-gray-100 bg-white flex items-center justify-between">
                    <div className="text-xs text-gray-400 font-medium">
                        Publicación de Club Platform · Ecosistema Editorial Consolidado
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 border border-gray-200 text-xs font-bold text-gray-600 rounded-xl hover:bg-gray-50 transition-colors"
                        >
                            Cerrar
                        </button>
                        <button
                            onClick={() => onEdit(post)}
                            className="px-4 py-2 bg-rotary-blue text-white text-xs font-bold rounded-xl hover:bg-sky-800 transition-colors flex items-center gap-1.5"
                        >
                            <Edit3 className="w-3.5 h-3.5" /> Abrir Editor
                        </button>
                    </div>
                </div>

            </div>
        </div>
    );
};

export default NewsDetailModal;
