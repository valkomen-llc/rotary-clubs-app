import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    X, RefreshCw, ExternalLink, Globe, CheckCircle, Clock,
    AlertTriangle, ShieldCheck, Building2, Trash2, Send, Search, Lock, Save, Info
} from 'lucide-react';
import { toast } from 'sonner';
import { leerJson, describirNoJson } from '../../../lib/leerJson';

interface DistributionTargetStatus {
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

/** Un sitio que se ofrece en el modal (v4.1243, `postDistributionPlan.js`). */
interface PlanSite {
    id: string;
    name: string;
    role: 'origin' | 'district' | 'colrotarios' | 'ecosystem';
    url: string | null;
    districtNumber: number | null;
    isDefault: boolean;
    locked: boolean;
    city?: string;
    organizationType?: string;
}

interface DistributionPlan {
    publisher: {
        siteId: string | null;
        name: string;
        kind: string;
        url: string | null;
        districtNumber: number | null;
        districtName: string | null;
        label: string;
    };
    origin: PlanSite | null;
    featured: PlanSite[];
    others: PlanSite[];
    current: { id: string; name: string; url: string | null; exists: boolean; active: boolean; editable: boolean }[];
    selected: string[];
    defaults: string[];
    allowedIds: string[];
    canManage: boolean;
    reason: string | null;
    notices: string[];
}

interface DistributionTraceabilityModalProps {
    post: any;
    onClose: () => void;
    onRefresh: () => void;
}

const ROLE_LABEL: Record<PlanSite['role'], string> = {
    origin: 'Sitio de origen',
    district: 'Sitio del distrito',
    colrotarios: 'COLROTARIOS',
    ecosystem: 'Ecosistema',
};

/** Máximo de «otros sitios» pintados a la vez; el buscador acota el resto. */
const OTHERS_LIMIT = 80;

interface SiteRowProps {
    site: PlanSite;
    checked: boolean;
    disabled: boolean;
    onToggle: (id: string) => void;
}

/** Una fila de sitio con su casilla. Declarada fuera del modal: un componente dentro de otro pierde el estado en cada render. */
const SiteRow: React.FC<SiteRowProps> = ({ site, checked, disabled, onToggle }) => (
    <label
        className={`flex items-center gap-3 px-4 py-3 rounded-2xl border transition-colors ${
            site.locked
                ? 'border-emerald-200 bg-emerald-50/50'
                : checked
                    ? 'border-sky-200 bg-sky-50/60'
                    : 'border-gray-100 bg-white hover:bg-gray-50'
        } ${disabled && !site.locked ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
    >
        {site.locked ? (
            <span className="w-5 h-5 rounded-md bg-emerald-600 text-white flex items-center justify-center shrink-0" title="La noticia ya se publica aquí">
                <Lock className="w-3 h-3" />
            </span>
        ) : (
            <input
                type="checkbox"
                checked={checked}
                disabled={disabled}
                onChange={() => onToggle(site.id)}
                className="w-5 h-5 rounded-md text-rotary-blue focus:ring-rotary-blue border-gray-300 cursor-pointer shrink-0"
            />
        )}
        <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-sm text-gray-900 truncate">{site.name}</span>
                {site.role !== 'ecosystem' && ROLE_LABEL[site.role].toLowerCase() !== site.name.trim().toLowerCase() && (
                    <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${
                        site.role === 'origin' ? 'bg-emerald-100 text-emerald-800'
                            : site.role === 'colrotarios' ? 'bg-teal-100 text-teal-800'
                                : 'bg-rotary-blue/10 text-rotary-blue'
                    }`}>
                        {ROLE_LABEL[site.role]}
                    </span>
                )}
                {site.isDefault && (
                    <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                        Por defecto
                    </span>
                )}
            </div>
            <p className="text-[11px] text-gray-500 truncate">
                {[site.organizationType, site.city, site.districtNumber ? `Distrito ${site.districtNumber}` : null].filter(Boolean).join(' · ') || '—'}
            </p>
        </div>
        {site.url && (
            <a
                href={site.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                title={`Abrir ${site.url}`}
                className="p-1.5 text-gray-400 hover:text-rotary-blue rounded-lg shrink-0"
            >
                <ExternalLink className="w-3.5 h-3.5" />
            </a>
        )}
    </label>
);

export const DistributionTraceabilityModal: React.FC<DistributionTraceabilityModalProps> = ({
    post,
    onClose,
    onRefresh
}) => {
    const [isSyncingAll, setIsSyncingAll] = useState(false);
    const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
    const [plan, setPlan] = useState<DistributionPlan | null>(null);
    const [planError, setPlanError] = useState<string | null>(null);
    const [planLoading, setPlanLoading] = useState(true);
    const [selected, setSelected] = useState<string[]>([]);
    const [search, setSearch] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    const token = () => localStorage.getItem('rotary_token');
    const apiUrl = import.meta.env.VITE_API_URL || '/api';

    const loadPlan = useCallback(async () => {
        if (!post?.id) return;
        setPlanLoading(true);
        setPlanError(null);
        try {
            const res = await fetch(`${apiUrl}/admin/posts/${post.id}/distribution`, {
                headers: { Authorization: `Bearer ${localStorage.getItem('rotary_token')}` },
            });
            const { data, crudo, esJson } = await leerJson<DistributionPlan & { error?: string }>(res);
            if (!esJson) throw new Error(describirNoJson(res, crudo));
            if (!res.ok || !data) throw new Error(data?.error || `HTTP ${res.status}`);
            setPlan(data);
            setSelected(data.selected || []);
        } catch (e: any) {
            setPlanError(e?.message || 'No pudimos cargar los sitios disponibles.');
        } finally {
            setPlanLoading(false);
        }
    }, [apiUrl, post?.id]);

    useEffect(() => { loadPlan(); }, [loadPlan]);

    // Las réplicas: lo que dice el plan (fresco tras guardar) con el estado que trae la fila.
    const targets: DistributionTargetStatus[] = useMemo(() => {
        const fromRow: DistributionTargetStatus[] = post?.distributionTargets || (post?.targetClubIds || []).map((id: string, idx: number) => ({
            targetId: id,
            targetName: post?.targetNames?.[idx] || id,
            status: post?.published ? 'published' : 'draft',
            syncMode: 'synced',
            distributedAt: post?.createdAt,
            lastSyncedAt: post?.updatedAt,
            localEdits: false,
        }));
        if (!plan) return fromRow;
        return plan.current.map((c) => {
            const row = fromRow.find((r) => r.targetId === c.id);
            return {
                targetId: c.id,
                targetName: c.name,
                status: !c.exists ? 'orphaned' : (row?.status || (post?.published ? 'published' : 'draft')),
                syncMode: row?.syncMode || 'synced',
                distributedAt: row?.distributedAt || null,
                lastSyncedAt: row?.lastSyncedAt || null,
                localEdits: !!row?.localEdits,
                publicUrl: c.url,
            };
        });
    }, [plan, post]);

    const savedIds = useMemo(() => (plan?.current || []).map((c) => c.id).sort().join('|'), [plan]);
    const isDirty = useMemo(() => [...selected].sort().join('|') !== savedIds, [selected, savedIds]);

    const filteredOthers = useMemo(() => {
        const q = search.trim().toLowerCase();
        const list = plan?.others || [];
        if (!q) return list;
        return list.filter((s) => [s.name, s.city, s.organizationType, s.districtNumber ? String(s.districtNumber) : '']
            .some((v) => String(v || '').toLowerCase().includes(q)));
    }, [plan, search]);

    const toggleSite = (id: string) => setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

    const handleSaveDistribution = async () => {
        if (!post?.id || !plan) return;
        setIsSaving(true);
        try {
            const res = await fetch(`${apiUrl}/admin/posts/${post.id}/distribution`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
                body: JSON.stringify({ targetClubIds: selected }),
            });
            const { data, crudo, esJson } = await leerJson<{ message?: string; error?: string; plan?: DistributionPlan }>(res);
            if (!esJson) throw new Error(describirNoJson(res, crudo));
            if (!res.ok || !data) throw new Error(data?.error || `HTTP ${res.status}`);
            if (data.plan) {
                setPlan(data.plan);
                setSelected(data.plan.selected || []);
            }
            toast.success(data.message || 'Distribución guardada.');
            onRefresh();
        } catch (e: any) {
            toast.error(e?.message || 'No se pudo guardar la distribución.');
        } finally {
            setIsSaving(false);
        }
    };

    // Sincronizar todas las réplicas
    const handleSyncAll = async () => {
        setIsSyncingAll(true);
        try {
            const res = await fetch(`${apiUrl}/admin/posts/${post.id}/distribution/sync`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token()}`
                },
                body: JSON.stringify({})
            });
            if (res.ok) {
                toast.success('Todas las réplicas fueron sincronizadas con éxito.');
                onRefresh();
            } else {
                toast.error('No se pudo sincronizar la distribución.');
            }
        } catch {
            toast.error('Error de conexión al sincronizar.');
        } finally {
            setIsSyncingAll(false);
        }
    };

    // Sincronizar un destino específico
    const handleSyncSingle = async (targetId: string) => {
        setActionLoadingId(targetId);
        try {
            const res = await fetch(`${apiUrl}/admin/posts/${post.id}/distribution/sync`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token()}`
                },
                body: JSON.stringify({ targetClubIds: [targetId] })
            });
            if (res.ok) {
                toast.success('Destino sincronizado correctamente.');
                onRefresh();
            } else {
                toast.error('Error al sincronizar el destino.');
            }
        } catch {
            toast.error('Error de red al sincronizar.');
        } finally {
            setActionLoadingId(null);
        }
    };

    // Retirar de un sitio: lo QUITA de los destinos (v4.1243). Hasta v4.1242
    // sólo marcaba `status: 'retired'` en `distributionStatus`, que la página
    // pública no mira: la noticia seguía publicada en ese sitio.
    const handleRetire = async (targetId: string) => {
        const actual = plan?.current.find((c) => c.id === targetId);
        if (!plan || !actual) return;
        if (!actual.editable) {
            toast.error('Tu cuenta no puede retirar la noticia de ese sitio.');
            return;
        }
        if (!confirm('¿Deseas retirar esta noticia de este sitio? El artículo maestro se conservará.')) return;
        setActionLoadingId(targetId);
        try {
            const res = await fetch(`${apiUrl}/admin/posts/${post.id}/distribution`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
                body: JSON.stringify({ targetClubIds: plan.current.map((c) => c.id).filter((id) => id !== targetId) }),
            });
            const { data, crudo, esJson } = await leerJson<{ error?: string; plan?: DistributionPlan }>(res);
            if (!esJson) throw new Error(describirNoJson(res, crudo));
            if (!res.ok || !data) throw new Error(data?.error || `HTTP ${res.status}`);
            if (data.plan) {
                setPlan(data.plan);
                setSelected(data.plan.selected || []);
            }
            toast.success('El artículo fue retirado del sitio seleccionado.');
            onRefresh();
        } catch (e: any) {
            toast.error(e?.message || 'No se pudo retirar el artículo.');
        } finally {
            setActionLoadingId(null);
        }
    };

    // Reintentar destino
    const handleRetry = async (targetId: string) => {
        setActionLoadingId(targetId);
        try {
            const res = await fetch(`${apiUrl}/admin/posts/${post.id}/distribution/retry`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token()}`
                },
                body: JSON.stringify({ targetClubId: targetId })
            });
            if (res.ok) {
                toast.success('Distribución reintentada con éxito.');
                onRefresh();
            } else {
                toast.error('Error al reintentar la distribución.');
            }
        } catch {
            toast.error('Error de red al reintentar.');
        } finally {
            setActionLoadingId(null);
        }
    };

    const formatDate = (d?: string | null) => {
        if (!d) return '—';
        try {
            return new Date(d).toLocaleDateString('es-CO', {
                day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
            });
        } catch {
            return d;
        }
    };

    const renderStatusBadge = (status: string) => {
        switch (status) {
            case 'published':
                return (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <CheckCircle className="w-3 h-3 text-emerald-500" /> Publicado
                    </span>
                );
            case 'pending_approval':
                return (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200">
                        <Clock className="w-3 h-3 text-amber-500" /> Pendiente de Aprobación
                    </span>
                );
            case 'rejected':
                return (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-50 text-red-700 border border-red-200">
                        <X className="w-3 h-3 text-red-500" /> Rechazado por el Club
                    </span>
                );
            case 'retired':
                return (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-gray-100 text-gray-700 border border-gray-200">
                        Retirado
                    </span>
                );
            case 'orphaned':
            case 'error':
                return (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-orange-50 text-orange-700 border border-orange-200">
                        <AlertTriangle className="w-3 h-3 text-orange-500" /> Desincronizado
                    </span>
                );
            default:
                return (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
                        {status}
                    </span>
                );
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in duration-200">
                {/* Header */}
                <div className="px-8 py-5 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-rotary-blue/10 flex items-center justify-center text-rotary-blue">
                            <Send className="w-5 h-5 text-rotary-blue" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h2 className="text-lg font-black text-gray-900">Trazabilidad de Distribución Editorial</h2>
                                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-rotary-blue/10 text-rotary-blue">
                                    Artículo Maestro
                                </span>
                            </div>
                            <p className="text-xs text-gray-500 font-medium truncate max-w-xl">
                                {post?.title || 'Sin título'}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-white rounded-full text-gray-400 hover:text-gray-700 transition-colors shadow-sm"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Subheader Toolbar */}
                <div className="px-8 py-3.5 bg-sky-50/60 border-b border-sky-100/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                    <div className="flex items-center flex-wrap gap-x-4 gap-y-1 text-gray-700 font-medium">
                        <span>
                            Publicado por: <strong className="text-gray-900">{plan?.publisher.name || '…'}</strong>
                            {plan?.publisher.districtName && (
                                <> desde <strong className="text-gray-900">{plan.publisher.districtName}</strong></>
                            )}
                        </span>
                        <span>·</span>
                        <span>Origen: <strong className="text-gray-900">{post?.originLabel || 'Distrito'}</strong></span>
                        <span>·</span>
                        <span>Total réplicas: <strong className="text-rotary-blue">{targets.length}</strong></span>
                        <span>·</span>
                        <span>Estado general: <strong className="text-emerald-700">{post?.published ? 'Publicado' : 'Borrador'}</strong></span>
                    </div>
                    <button
                        type="button"
                        onClick={handleSyncAll}
                        disabled={isSyncingAll || targets.length === 0}
                        className="px-4 py-1.5 rounded-xl bg-rotary-blue hover:bg-sky-800 text-white font-bold text-xs flex items-center gap-2 shadow-xs transition-all active:scale-95 disabled:opacity-50 shrink-0"
                    >
                        <RefreshCw className={`w-3.5 h-3.5 ${isSyncingAll ? 'animate-spin' : ''}`} />
                        {isSyncingAll ? 'Sincronizando...' : 'Actualizar todas las réplicas'}
                    </button>
                </div>

                {/* Body Table */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {/* Dónde se publica (v4.1243) */}
                    <section className="rounded-3xl border border-gray-100 bg-white p-5 shadow-xs space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-xl bg-rotary-blue/10 flex items-center justify-center text-rotary-blue">
                                    <Globe className="w-4 h-4" />
                                </div>
                                <div>
                                    <h3 className="text-sm font-black text-gray-900 uppercase tracking-wide">Dónde se publica</h3>
                                    <p className="text-xs text-gray-500">El sitio de origen, el distrito y COLROTARIOS, más los sitios activos del ecosistema.</p>
                                </div>
                            </div>
                            {plan?.canManage && (
                                <button
                                    type="button"
                                    onClick={handleSaveDistribution}
                                    disabled={isSaving || !isDirty}
                                    className="px-4 py-2 rounded-xl bg-rotary-blue hover:bg-sky-800 text-white font-bold text-xs flex items-center gap-2 shadow-xs transition-all active:scale-95 disabled:opacity-50 shrink-0"
                                >
                                    {isSaving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                                    {isSaving ? 'Guardando...' : 'Guardar distribución'}
                                </button>
                            )}
                        </div>

                        {planLoading && !plan ? (
                            <p className="text-xs text-gray-500 flex items-center gap-2"><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Cargando los sitios disponibles…</p>
                        ) : planError ? (
                            <div className="p-3 rounded-2xl bg-red-50 border border-red-100 text-xs text-red-700 flex items-start gap-2">
                                <AlertTriangle className="w-4 h-4 shrink-0" />
                                <div className="flex-1">
                                    <p className="font-bold">No pudimos cargar los sitios disponibles.</p>
                                    <p>{planError}</p>
                                </div>
                                <button type="button" onClick={loadPlan} className="font-bold underline shrink-0">Reintentar</button>
                            </div>
                        ) : plan ? (
                            <div className="space-y-3">
                                {!plan.canManage && plan.reason && (
                                    <p className="p-3 rounded-2xl bg-gray-50 border border-gray-100 text-xs text-gray-600">{plan.reason}</p>
                                )}
                                {plan.canManage && plan.defaults.length > 0 && isDirty && (
                                    <p className="p-3 rounded-2xl bg-amber-50 border border-amber-100 text-xs text-amber-800 flex items-start gap-2">
                                        <Info className="w-4 h-4 shrink-0" />
                                        Preseleccionamos el sitio del distrito y COLROTARIOS. Pulsa «Guardar distribución» para publicarla también allí.
                                    </p>
                                )}
                                {plan.origin && (
                                    <SiteRow site={plan.origin} checked disabled onToggle={toggleSite} />
                                )}
                                {plan.featured.map((site) => (
                                    <SiteRow
                                        key={site.id}
                                        site={site}
                                        checked={selected.includes(site.id)}
                                        disabled={!plan.canManage || isSaving}
                                        onToggle={toggleSite}
                                    />
                                ))}
                                {plan.notices.map((n) => (
                                    <p key={n} className="text-[11px] text-orange-700 flex items-center gap-1.5">
                                        <AlertTriangle className="w-3 h-3" /> {n}
                                    </p>
                                ))}

                                {plan.others.length > 0 && (
                                    <div className="pt-2 space-y-2">
                                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                            <h4 className="text-xs font-black text-gray-700 uppercase tracking-wide">
                                                Otros sitios activos del ecosistema ({plan.others.length})
                                            </h4>
                                            <div className="relative sm:w-64">
                                                <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                                                <input
                                                    type="text"
                                                    value={search}
                                                    onChange={(e) => setSearch(e.target.value)}
                                                    placeholder="Buscar sitio, ciudad o distrito…"
                                                    className="w-full pl-8 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-rotary-blue/20 focus:bg-white"
                                                />
                                            </div>
                                        </div>
                                        <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
                                            {filteredOthers.slice(0, OTHERS_LIMIT).map((site) => (
                                                <SiteRow
                                                    key={site.id}
                                                    site={site}
                                                    checked={selected.includes(site.id)}
                                                    disabled={!plan.canManage || isSaving}
                                                    onToggle={toggleSite}
                                                />
                                            ))}
                                            {filteredOthers.length === 0 && (
                                                <p className="text-xs text-gray-400 py-3 text-center">Ningún sitio coincide con la búsqueda.</p>
                                            )}
                                            {filteredOthers.length > OTHERS_LIMIT && (
                                                <p className="text-[11px] text-gray-400 py-2 text-center">
                                                    Se muestran {OTHERS_LIMIT} de {filteredOthers.length}. Usa el buscador para encontrar el resto.
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : null}
                    </section>

                    <h3 className="text-xs font-black text-gray-700 uppercase tracking-wide">Réplicas guardadas</h3>
                    {targets.length === 0 ? (
                        <div className="text-center py-8 rounded-2xl border border-dashed border-gray-200">
                            <Building2 className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                            <h4 className="text-sm font-bold text-gray-700">Todavía se publica sólo en su sitio de origen</h4>
                            <p className="text-xs text-gray-400 mt-1 max-w-sm mx-auto">
                                Marca arriba los sitios donde también debe aparecer y pulsa «Guardar distribución».
                            </p>
                        </div>
                    ) : (
                        <div className="border border-gray-100 rounded-2xl overflow-hidden shadow-xs">
                            <table className="w-full text-left text-xs">
                                <thead className="bg-gray-50 border-b border-gray-100 text-gray-500 font-bold uppercase tracking-wider text-[10px]">
                                    <tr>
                                        <th className="px-5 py-3.5">Sitio Destino</th>
                                        <th className="px-4 py-3.5">Estado</th>
                                        <th className="px-4 py-3.5">Modo Sinc.</th>
                                        <th className="px-4 py-3.5">Última Sincronización</th>
                                        <th className="px-5 py-3.5 text-right">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {targets.map((tgt) => {
                                        const isLoading = actionLoadingId === tgt.targetId;
                                        return (
                                            <tr key={tgt.targetId} className="hover:bg-gray-50/60 transition-colors">
                                                <td className="px-5 py-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center text-gray-500 shrink-0 font-bold text-[10px]">
                                                            <Building2 className="w-3.5 h-3.5" />
                                                        </div>
                                                        <div>
                                                            <p className="font-bold text-gray-900">{tgt.targetName}</p>
                                                            <p className="text-[10px] text-gray-400 font-medium">ID: {tgt.targetId}</p>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-4">
                                                    {renderStatusBadge(tgt.status)}
                                                </td>
                                                <td className="px-4 py-4">
                                                    {tgt.localEdits ? (
                                                        <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                                                            Modificaciones Locales
                                                        </span>
                                                    ) : (
                                                        <span className="text-[10px] font-bold text-sky-700 bg-sky-50 px-2 py-0.5 rounded-full border border-sky-200">
                                                            Sincronizado
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-4 text-gray-500 font-medium">
                                                    {formatDate(tgt.lastSyncedAt || tgt.distributedAt)}
                                                </td>
                                                <td className="px-5 py-4 text-right">
                                                    <div className="flex items-center justify-end gap-1.5">
                                                        <button
                                                            type="button"
                                                            onClick={() => handleSyncSingle(tgt.targetId)}
                                                            disabled={isLoading}
                                                            title="Re-sincronizar artículo hacia este club"
                                                            className="p-1.5 text-gray-500 hover:text-rotary-blue hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50"
                                                        >
                                                            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleRetire(tgt.targetId)}
                                                            disabled={isLoading}
                                                            title="Retirar de este club"
                                                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                                                        >
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* Nota informativa */}
                    <div className="p-4 rounded-2xl bg-gray-50 border border-gray-100 flex items-start gap-3 text-xs text-gray-500">
                        <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                        <p className="leading-relaxed">
                            <strong>Protección Editorial Multi-tenant:</strong> La desvinculación o retiro de un club receptor no elimina el artículo maestro ni afecta las publicaciones de los demás clubes del distrito.
                        </p>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-gray-100 bg-gray-50/50 flex justify-end">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-6 py-2.5 rounded-xl bg-gray-200 hover:bg-gray-300 font-bold text-xs text-gray-700 transition-colors"
                    >
                        Cerrar
                    </button>
                </div>
            </div>
        </div>
    );
};

export default DistributionTraceabilityModal;
