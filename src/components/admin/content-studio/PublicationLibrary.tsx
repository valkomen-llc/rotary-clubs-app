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
    Linkedin,
    X as XIcon,
    Send,
    Trash2
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

interface ConnectedAccount {
    id: string;
    platform: 'facebook' | 'instagram' | 'linkedin' | 'x';
    accountName: string | null;
    status: string;
    needsReconnect: boolean;
    clubId: string;
}

const PublicationLibrary: React.FC = () => {
    const [items, setItems] = useState<Publication[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | PubStatus>('all');

    // Detail modal (click en una card) — Phase 1: publish / schedule / delete.
    const [selected, setSelected] = useState<Publication | null>(null);
    const [connectedAccounts, setConnectedAccounts] = useState<ConnectedAccount[]>([]);
    const [selectedAccountIds, setSelectedAccountIds] = useState<Set<string>>(new Set());
    const [isPublishing, setIsPublishing] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [showSchedule, setShowSchedule] = useState(false);
    const [scheduleDate, setScheduleDate] = useState('');
    const [scheduleTime, setScheduleTime] = useState('');
    const [scheduleTimezone, setScheduleTimezone] = useState(
        Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Bogota'
    );

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

    // Cargar cuentas conectadas cuando se abre el modal de detalle, filtradas
    // al club de la publicación seleccionada (no se puede publicar a cuentas
    // de otro club).
    const openDetail = async (pub: Publication) => {
        setSelected(pub);
        setShowSchedule(false);
        setSelectedAccountIds(new Set());
        try {
            const token = localStorage.getItem('rotary_token');
            const qs = pub.clubId ? `?clubId=${encodeURIComponent(pub.clubId)}` : '';
            const resp = await fetch(`${API}/social/accounts${qs}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (resp.ok) {
                const data = await resp.json();
                const filtered: ConnectedAccount[] = (Array.isArray(data) ? data : [])
                    .filter((a: any) => a.platform === 'facebook' || a.platform === 'instagram');
                setConnectedAccounts(filtered);
                setSelectedAccountIds(new Set(
                    filtered.filter(a => a.status === 'active' && !a.needsReconnect).map(a => a.id)
                ));
            }
        } catch { /* silent */ }
    };

    const closeDetail = () => {
        setSelected(null);
        setShowSchedule(false);
    };

    const toggleAccount = (id: string) => {
        setSelectedAccountIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const publishFromDraft = async (scheduledFor?: string, timezone?: string) => {
        if (!selected) return;
        if (selectedAccountIds.size === 0) {
            toast.error('Seleccioná al menos una cuenta');
            return;
        }
        const portraitUrl = selected.imageUrl;
        if (!portraitUrl) {
            toast.error('La publicación no tiene imagen asociada');
            return;
        }
        setIsPublishing(true);
        const toastId = toast.loading(scheduledFor ? 'Programando…' : `Publicando en ${selectedAccountIds.size} cuenta(s)…`);
        try {
            const token = localStorage.getItem('rotary_token');
            const resp = await fetch(`${API}/social/publish`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({
                    accountIds: Array.from(selectedAccountIds),
                    imageUrl: portraitUrl,
                    copies: selected.platformCopies || {},
                    publicationId: selected.id,
                    scheduledFor,
                    timezone
                })
            });
            const data = await resp.json();
            if (!resp.ok) {
                toast.error(data.error || 'Error al publicar', { id: toastId, duration: 12000 });
                return;
            }
            if (scheduledFor) {
                toast.success(`Programada para ${new Date(scheduledFor).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}`, { id: toastId });
            } else {
                const ok = (data.outcomes || []).filter((o: any) => o.ok).length;
                const fail = (data.outcomes || []).length - ok;
                if (data.status === 'published') toast.success(`Publicado en ${ok} cuenta(s) ✓`, { id: toastId });
                else if (data.status === 'partial') toast.warning(`Publicado en ${ok}, falló en ${fail}`, { id: toastId, duration: 12000 });
                else toast.error(`Falló en ${fail} cuenta(s)`, { id: toastId, duration: 12000 });
            }
            await fetchItems();
            closeDetail();
        } catch (e: any) {
            toast.error(`Error de red: ${e.message || 'desconocido'}`, { id: toastId });
        } finally {
            setIsPublishing(false);
        }
    };

    const handleScheduleSubmit = () => {
        if (!scheduleDate || !scheduleTime) {
            toast.error('Completá fecha y hora');
            return;
        }
        const localIso = `${scheduleDate}T${scheduleTime}:00`;
        let scheduledIso: string;
        try {
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
            toast.error('La fecha debe ser al menos 1 minuto en el futuro');
            return;
        }
        publishFromDraft(scheduledIso, scheduleTimezone);
    };

    const deletePublication = async () => {
        if (!selected) return;
        if (!window.confirm('¿Eliminar esta publicación de la biblioteca?')) return;
        setIsDeleting(true);
        try {
            const token = localStorage.getItem('rotary_token');
            const resp = await fetch(`${API}/social/publications/${selected.id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (resp.ok) {
                toast.success('Publicación eliminada');
                await fetchItems();
                closeDetail();
            } else {
                const err = await resp.json().catch(() => ({}));
                toast.error(err.error || 'No se pudo eliminar');
            }
        } finally {
            setIsDeleting(false);
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
                            <div
                                key={p.id}
                                onClick={() => openDetail(p)}
                                className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-xl hover:-translate-y-0.5 transition-all flex flex-col cursor-pointer group/card"
                                title="Click para abrir y publicar / programar"
                            >
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
                                                onClick={(e) => { e.stopPropagation(); copyToClipboard(fbCopy); }}
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
                                                    onClick={(e) => e.stopPropagation()}
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

            {/* Detail modal — click en una card abre acciones */}
            {selected && (
                <div
                    className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-md animate-in fade-in duration-200"
                    onClick={(e) => { if (e.target === e.currentTarget) closeDetail(); }}
                >
                    <div className="bg-white w-full max-w-3xl max-h-[90vh] rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col">
                        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                            <div className="flex items-center gap-3">
                                {(() => {
                                    const b = statusBadgeFor(selected.status);
                                    const BI = b.Icon;
                                    return (
                                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-black uppercase ${b.cls}`}>
                                            <BI className="w-3 h-3" />
                                            {b.label}
                                        </span>
                                    );
                                })()}
                                {selected.club?.name && (
                                    <span className="text-[11px] font-black text-gray-600">{selected.club.name}</span>
                                )}
                            </div>
                            <button onClick={closeDetail} className="p-1.5 hover:bg-gray-200 rounded-full transition-all">
                                <XIcon className="w-4 h-4 text-gray-500" />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-3">
                                {selected.imageUrl && (
                                    <div className="aspect-[4/5] rounded-2xl overflow-hidden border border-gray-100 shadow-sm">
                                        <img src={selected.imageUrl} alt="" className="w-full h-full object-cover" />
                                    </div>
                                )}
                                <div className="flex flex-wrap gap-1">
                                    {selected.aiModelImage && (
                                        <span className="text-[9px] font-bold px-2 py-1 rounded-md bg-purple-50 text-purple-700" title={selected.aiModelImage}>
                                            🎨 {selected.aiModelImage.split('+')[0]}
                                        </span>
                                    )}
                                    {selected.aiModelCopy && (
                                        <span className="text-[9px] font-bold px-2 py-1 rounded-md bg-indigo-50 text-indigo-700" title={selected.aiModelCopy}>
                                            ✍ {selected.aiModelCopy.split('/')[0]}
                                        </span>
                                    )}
                                </div>
                            </div>

                            <div className="space-y-3">
                                <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100 max-h-72 overflow-y-auto">
                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Copy Facebook</p>
                                    <p className="text-xs text-gray-700 whitespace-pre-wrap leading-relaxed">
                                        {selected.platformCopies?.facebook?.copy || '(sin copy)'}
                                    </p>
                                    {selected.platformCopies?.facebook?.hashtags && (
                                        <p className="text-[11px] text-indigo-600 font-bold mt-2">{selected.platformCopies.facebook.hashtags}</p>
                                    )}
                                    {selected.platformCopies?.facebook?.cta && (
                                        <p className="text-xs text-gray-800 font-bold mt-2">{selected.platformCopies.facebook.cta}</p>
                                    )}
                                </div>

                                {(selected.status === 'draft' || selected.status === 'scheduled' || selected.status === 'error') && (
                                    <div>
                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Publicar en</p>
                                        {connectedAccounts.length === 0 ? (
                                            <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-[11px] font-bold text-amber-800">
                                                No hay cuentas conectadas para este club. Andá a "Cuentas Sociales" para conectarlas.
                                            </div>
                                        ) : (
                                            <div className="space-y-1.5 max-h-40 overflow-y-auto">
                                                {connectedAccounts.map(acc => {
                                                    const checked = selectedAccountIds.has(acc.id);
                                                    const disabled = acc.needsReconnect || acc.status !== 'active';
                                                    const Icon = acc.platform === 'instagram' ? Instagram : Facebook;
                                                    return (
                                                        <label key={acc.id} className={`flex items-center gap-2 p-2 rounded-lg border-2 cursor-pointer transition-all ${
                                                            checked && !disabled ? 'bg-blue-50 border-blue-200' : disabled ? 'bg-gray-50 border-gray-100 opacity-50 cursor-not-allowed' : 'bg-white border-gray-100 hover:border-gray-200'
                                                        }`}>
                                                            <input
                                                                type="checkbox"
                                                                checked={checked}
                                                                disabled={disabled}
                                                                onChange={() => toggleAccount(acc.id)}
                                                                className="w-3.5 h-3.5 rounded accent-blue-600"
                                                            />
                                                            <Icon className={`w-3.5 h-3.5 ${acc.platform === 'instagram' ? 'text-pink-600' : 'text-blue-600'}`} />
                                                            <span className="text-[11px] font-black text-gray-800 truncate flex-1">{acc.accountName || acc.platform}</span>
                                                            {disabled && <span className="text-[9px] font-bold text-amber-600">RECONECTAR</span>}
                                                        </label>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Schedule sub-modal (inline) */}
                        {showSchedule && (
                            <div className="border-t border-gray-100 bg-blue-50/30 px-6 py-4">
                                <p className="text-[10px] font-black text-blue-700 uppercase tracking-widest mb-3 flex items-center gap-1">
                                    <CalendarIcon className="w-3 h-3" /> Programar publicación
                                </p>
                                <div className="grid grid-cols-3 gap-2">
                                    <input type="date" value={scheduleDate} onChange={e => setScheduleDate(e.target.value)} min={new Date().toISOString().slice(0, 10)}
                                        className="px-3 py-2 bg-white border border-gray-100 rounded-lg text-xs font-bold outline-none focus:border-blue-500" />
                                    <input type="time" value={scheduleTime} onChange={e => setScheduleTime(e.target.value)}
                                        className="px-3 py-2 bg-white border border-gray-100 rounded-lg text-xs font-bold outline-none focus:border-blue-500" />
                                    <select value={scheduleTimezone} onChange={e => setScheduleTimezone(e.target.value)}
                                        className="px-2 py-2 bg-white border border-gray-100 rounded-lg text-[11px] font-bold outline-none focus:border-blue-500">
                                        <option value="America/Bogota">Bogotá UTC-5</option>
                                        <option value="America/Lima">Lima UTC-5</option>
                                        <option value="America/Mexico_City">CDMX UTC-6</option>
                                        <option value="America/Buenos_Aires">BA UTC-3</option>
                                        <option value="America/Santiago">Santiago UTC-3</option>
                                        <option value="America/Caracas">Caracas UTC-4</option>
                                        <option value="America/Guatemala">GT UTC-6</option>
                                        <option value="America/Panama">PA UTC-5</option>
                                        <option value="Europe/Madrid">Madrid UTC+1</option>
                                        <option value="UTC">UTC</option>
                                    </select>
                                </div>
                            </div>
                        )}

                        <div className="px-6 py-4 border-t border-gray-100 flex flex-wrap items-center justify-between gap-2 bg-gray-50/50">
                            <button
                                onClick={deletePublication}
                                disabled={isDeleting || isPublishing || selected.status === 'published' || selected.status === 'partial'}
                                className="px-3 py-2 rounded-xl text-xs font-bold text-red-500 hover:bg-red-50 transition-all flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                                title={selected.status === 'published' || selected.status === 'partial' ? 'No se puede eliminar una publicación posteada' : 'Eliminar de la biblioteca'}
                            >
                                {isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                                Eliminar
                            </button>
                            <div className="flex items-center gap-2">
                                {(selected.status === 'draft' || selected.status === 'error') && (
                                    <>
                                        {showSchedule ? (
                                            <>
                                                <button onClick={() => setShowSchedule(false)} className="px-4 py-2.5 rounded-xl text-xs font-bold text-gray-500 hover:bg-gray-200 transition-all">
                                                    Cancelar
                                                </button>
                                                <button
                                                    onClick={handleScheduleSubmit}
                                                    disabled={isPublishing || !scheduleDate || !scheduleTime}
                                                    className="px-5 py-2.5 bg-blue-600 text-white rounded-xl text-xs font-black disabled:opacity-50 hover:bg-blue-700 transition-all flex items-center gap-2"
                                                >
                                                    {isPublishing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CalendarIcon className="w-3.5 h-3.5" />}
                                                    Confirmar programación
                                                </button>
                                            </>
                                        ) : (
                                            <>
                                                <button
                                                    onClick={() => setShowSchedule(true)}
                                                    disabled={isPublishing || selectedAccountIds.size === 0}
                                                    className="px-4 py-2.5 rounded-xl text-xs font-black text-blue-600 border-2 border-blue-600 hover:bg-blue-50 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                                >
                                                    <CalendarIcon className="w-3.5 h-3.5" />
                                                    Programar
                                                </button>
                                                <button
                                                    onClick={() => publishFromDraft()}
                                                    disabled={isPublishing || selectedAccountIds.size === 0}
                                                    className="px-5 py-2.5 bg-blue-600 text-white rounded-xl text-xs font-black disabled:opacity-50 hover:bg-blue-700 transition-all flex items-center gap-2"
                                                >
                                                    {isPublishing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                                                    Publicar Ahora
                                                </button>
                                            </>
                                        )}
                                    </>
                                )}
                                {selected.status === 'scheduled' && !showSchedule && (
                                    <>
                                        <span className="text-[11px] font-bold text-amber-700">
                                            Programada para {formatDate(selected.scheduledFor)} ({selected.timezone || 'tz?'})
                                        </span>
                                        <button
                                            onClick={() => publishFromDraft()}
                                            disabled={isPublishing || selectedAccountIds.size === 0}
                                            className="px-4 py-2.5 bg-blue-600 text-white rounded-xl text-xs font-black disabled:opacity-50 hover:bg-blue-700 transition-all flex items-center gap-2"
                                        >
                                            {isPublishing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                                            Publicar ahora
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PublicationLibrary;
