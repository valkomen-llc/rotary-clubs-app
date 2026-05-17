import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
    Loader2,
    Image as ImageIcon,
    Search,
    Filter,
    Clock,
    CheckCircle2,
    AlertCircle,
    Calendar as CalendarIcon,
    FileText,
    Cpu,
    ExternalLink,
    Copy as CopyIcon,
    Facebook,
    Instagram,
    Twitter,
    Linkedin
} from 'lucide-react';
import { toast } from 'sonner';

type PubStatus = 'draft' | 'scheduled' | 'queued' | 'publishing' | 'published' | 'partial' | 'error';

interface PublicationAccountSummary {
    id: string;
    platform: string;
    accountName: string | null;
    avatar: string | null;
}

interface PublicationOutcome {
    accountId: string;
    platform: string;
    accountName?: string | null;
    ok: boolean;
    externalId?: string | null;
    externalUrl?: string | null;
    error?: string | null;
    publishedAt?: string | null;
    pending?: boolean;
}

interface PlatformCopyBlock {
    copy?: string;
    hashtags?: string;
    cta?: string;
}

interface Publication {
    id: string;
    clubId: string;
    club?: { id: string; name: string } | null;
    imageUrl: string | null;
    imageUrlLandscape: string | null;
    platformCopies: Record<string, PlatformCopyBlock> | null;
    targetAccounts: PublicationOutcome[] | null;
    accounts: PublicationAccountSummary[];
    status: PubStatus;
    scheduledFor: string | null;
    publishedAt: string | null;
    timezone: string | null;
    aiModelImage: string | null;
    aiModelCopy: string | null;
    generatedBy: string | null;
    createdAt: string;
    updatedAt: string;
}

const STATUS_FILTERS: { id: 'all' | PubStatus; label: string; cls: string }[] = [
    { id: 'all',       label: 'Todas',       cls: 'bg-gray-100 text-gray-700' },
    { id: 'draft',     label: 'Borradores',  cls: 'bg-slate-100 text-slate-700' },
    { id: 'scheduled', label: 'Programadas', cls: 'bg-amber-100 text-amber-700' },
    { id: 'published', label: 'Publicadas',  cls: 'bg-green-100 text-green-700' },
    { id: 'partial',   label: 'Parciales',   cls: 'bg-orange-100 text-orange-700' },
    { id: 'error',     label: 'Con error',   cls: 'bg-red-100 text-red-700' }
];

const platformIcon = (p: string) => {
    if (p === 'facebook')  return Facebook;
    if (p === 'instagram') return Instagram;
    if (p === 'x')         return Twitter;
    if (p === 'linkedin')  return Linkedin;
    return Facebook;
};

const statusBadgeFor = (s: PubStatus) => {
    switch (s) {
        case 'draft':      return { label: 'BORRADOR',    cls: 'bg-slate-100 text-slate-700', Icon: FileText };
        case 'scheduled':  return { label: 'PROGRAMADA',  cls: 'bg-amber-50 text-amber-700 border border-amber-200', Icon: CalendarIcon };
        case 'queued':
        case 'publishing': return { label: 'PUBLICANDO',  cls: 'bg-indigo-50 text-indigo-700 border border-indigo-200', Icon: Loader2 };
        case 'published':  return { label: 'PUBLICADA',   cls: 'bg-green-50 text-green-700 border border-green-200', Icon: CheckCircle2 };
        case 'partial':    return { label: 'PARCIAL',     cls: 'bg-orange-50 text-orange-700 border border-orange-200', Icon: AlertCircle };
        case 'error':      return { label: 'ERROR',       cls: 'bg-red-50 text-red-700 border border-red-200', Icon: AlertCircle };
        default:           return { label: String(s).toUpperCase(), cls: 'bg-gray-100 text-gray-700', Icon: FileText };
    }
};

const formatDate = (iso: string | null) => {
    if (!iso) return null;
    try {
        const d = new Date(iso);
        return d.toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
    } catch { return iso; }
};

const PublicationLibrary: React.FC = () => {
    const [items, setItems] = useState<Publication[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | PubStatus>('all');

    const API = import.meta.env.VITE_API_URL || '/api';

    const fetchItems = useCallback(async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('rotary_token');
            const params = new URLSearchParams({ limit: '100' });
            if (statusFilter !== 'all') params.set('status', statusFilter);
            if (search.trim()) params.set('search', search.trim());
            const resp = await fetch(`${API}/social/publications?${params.toString()}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (resp.ok) {
                setItems(await resp.json());
            } else {
                const err = await resp.json().catch(() => ({}));
                toast.error(err.error || 'Error al cargar la biblioteca');
            }
        } catch {
            toast.error('Error de red al cargar la biblioteca');
        } finally {
            setLoading(false);
        }
    }, [API, statusFilter, search]);

    useEffect(() => {
        const handle = setTimeout(fetchItems, search ? 250 : 0);
        return () => clearTimeout(handle);
    }, [fetchItems, search]);

    const counts = useMemo(() => {
        const c: Record<string, number> = { all: items.length };
        for (const it of items) c[it.status] = (c[it.status] || 0) + 1;
        return c;
    }, [items]);

    const copyToClipboard = async (text: string) => {
        try {
            await navigator.clipboard.writeText(text);
            toast.success('Copy copiado al portapapeles');
        } catch {
            toast.error('No se pudo copiar');
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header + status filters */}
            <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
                <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Buscar por texto, hashtag, copy..."
                            className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>
                    <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
                        {STATUS_FILTERS.map(f => {
                            const active = statusFilter === f.id;
                            const c = counts[f.id] || 0;
                            return (
                                <button
                                    key={f.id}
                                    onClick={() => setStatusFilter(f.id)}
                                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-[10px] font-black whitespace-nowrap transition-all border flex-shrink-0 ${
                                        active
                                            ? `${f.cls} border-current shadow-sm`
                                            : 'bg-gray-50 border-gray-100 text-gray-500 hover:bg-gray-100'
                                    }`}
                                >
                                    <span className="uppercase tracking-wide">{f.label}</span>
                                    {c > 0 && (
                                        <span className={`text-[9px] px-1 py-0.5 rounded ${active ? 'bg-white/70' : 'bg-gray-200 text-gray-600'}`}>
                                            {c}
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Grid */}
            {loading ? (
                <div className="py-20 text-center">
                    <Loader2 className="w-10 h-10 text-indigo-600 animate-spin mx-auto mb-4" />
                    <p className="text-gray-500 font-bold">Cargando biblioteca...</p>
                </div>
            ) : items.length === 0 ? (
                <div className="bg-white rounded-3xl border border-dashed border-gray-200 p-16 text-center">
                    <ImageIcon className="w-12 h-12 text-gray-200 mx-auto mb-4" />
                    <h3 className="text-lg font-black text-gray-900 mb-1">Biblioteca vacía</h3>
                    <p className="text-gray-500 text-sm max-w-md mx-auto">
                        Cada publicación que generes con IA queda guardada automáticamente acá.
                        Andá al Generador de Publicaciones para crear la primera.
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                    {items.map(p => {
                        const badge = statusBadgeFor(p.status);
                        const BadgeIcon = badge.Icon;
                        const fbCopy = p.platformCopies?.facebook?.copy || '';
                        const igCopy = p.platformCopies?.instagram?.copy || '';
                        const preview = (fbCopy || igCopy || '').slice(0, 140);
                        const isLoading = p.status === 'queued' || p.status === 'publishing';
                        return (
                            <div key={p.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-xl hover:-translate-y-0.5 transition-all flex flex-col">
                                <div className="relative aspect-[4/5] bg-gray-100">
                                    {p.imageUrl ? (
                                        <img src={p.imageUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-gray-300">
                                            <ImageIcon className="w-10 h-10" />
                                        </div>
                                    )}
                                    <div className="absolute top-2 left-2">
                                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[9px] font-black uppercase tracking-wide shadow-sm backdrop-blur-sm ${badge.cls}`}>
                                            <BadgeIcon className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
                                            {badge.label}
                                        </span>
                                    </div>
                                    {p.accounts && p.accounts.length > 0 && (
                                        <div className="absolute top-2 right-2 flex -space-x-2">
                                            {p.accounts.slice(0, 3).map(a => {
                                                const Icon = platformIcon(a.platform);
                                                return (
                                                    <div key={a.id} className="w-6 h-6 rounded-full bg-white shadow flex items-center justify-center border border-gray-100" title={a.accountName || a.platform}>
                                                        <Icon className="w-3.5 h-3.5 text-gray-600" />
                                                    </div>
                                                );
                                            })}
                                            {p.accounts.length > 3 && (
                                                <div className="w-6 h-6 rounded-full bg-gray-800 text-white text-[9px] font-black flex items-center justify-center shadow">
                                                    +{p.accounts.length - 3}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                                <div className="p-3 flex-1 flex flex-col gap-2">
                                    {preview && (
                                        <p className="text-[11px] text-gray-700 line-clamp-3 font-medium">{preview}{preview.length === 140 ? '…' : ''}</p>
                                    )}
                                    <div className="flex flex-wrap gap-1 mt-auto">
                                        {p.club?.name && (
                                            <span className="text-[9px] font-black uppercase tracking-wide px-2 py-1 rounded-md bg-blue-50 text-blue-700">
                                                {p.club.name}
                                            </span>
                                        )}
                                        {p.aiModelImage && (
                                            <span className="text-[9px] font-bold px-2 py-1 rounded-md bg-purple-50 text-purple-700 inline-flex items-center gap-1" title={`Motor de imagen: ${p.aiModelImage}`}>
                                                <Cpu className="w-2.5 h-2.5" />
                                                {p.aiModelImage.split('+')[0]}
                                            </span>
                                        )}
                                        {p.aiModelCopy && (
                                            <span className="text-[9px] font-bold px-2 py-1 rounded-md bg-indigo-50 text-indigo-700 inline-flex items-center gap-1" title={`Motor de copy: ${p.aiModelCopy}`}>
                                                <FileText className="w-2.5 h-2.5" />
                                                {p.aiModelCopy.split('/')[0]}
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex items-center justify-between text-[10px] text-gray-400 font-bold border-t border-gray-50 pt-2">
                                        <span className="flex items-center gap-1">
                                            <Clock className="w-3 h-3" />
                                            {p.scheduledFor && p.status === 'scheduled'
                                                ? <>Programada · {formatDate(p.scheduledFor)}</>
                                                : p.publishedAt
                                                    ? <>Publicada · {formatDate(p.publishedAt)}</>
                                                    : <>Generada · {formatDate(p.createdAt)}</>}
                                        </span>
                                        {fbCopy && (
                                            <button
                                                onClick={() => copyToClipboard(fbCopy)}
                                                className="text-gray-400 hover:text-indigo-600 transition-colors"
                                                title="Copiar copy de Facebook"
                                            >
                                                <CopyIcon className="w-3.5 h-3.5" />
                                            </button>
                                        )}
                                    </div>
                                    {p.targetAccounts && p.status === 'partial' && (
                                        <div className="bg-orange-50 border border-orange-100 rounded-lg p-2 text-[10px] font-bold text-orange-700">
                                            {p.targetAccounts.filter(o => o.ok).length} OK / {p.targetAccounts.filter(o => !o.ok).length} con error
                                        </div>
                                    )}
                                    {p.targetAccounts && p.status === 'published' && p.targetAccounts.some(o => o.externalUrl) && (
                                        <div className="flex flex-wrap gap-1">
                                            {p.targetAccounts.filter(o => o.externalUrl).map(o => (
                                                <a
                                                    key={o.accountId}
                                                    href={o.externalUrl!}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="inline-flex items-center gap-1 text-[9px] font-black uppercase px-2 py-1 rounded-md bg-green-50 text-green-700 hover:bg-green-100 transition-colors"
                                                >
                                                    <ExternalLink className="w-2.5 h-2.5" />
                                                    {o.platform}
                                                </a>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default PublicationLibrary;
