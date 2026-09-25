import React, { useState } from 'react';
import {
    X, RefreshCw, ExternalLink, Globe, CheckCircle, Clock,
    AlertTriangle, ShieldCheck, Building2, Trash2, ArrowUpRight, Send
} from 'lucide-react';
import { toast } from 'sonner';

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

interface DistributionTraceabilityModalProps {
    post: any;
    onClose: () => void;
    onRefresh: () => void;
}

export const DistributionTraceabilityModal: React.FC<DistributionTraceabilityModalProps> = ({
    post,
    onClose,
    onRefresh
}) => {
    const [isSyncingAll, setIsSyncingAll] = useState(false);
    const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

    const token = () => localStorage.getItem('rotary_token');
    const apiUrl = import.meta.env.VITE_API_URL || '/api';

    const targets: DistributionTargetStatus[] = post?.distributionTargets || (post?.targetClubIds || []).map((id: string, idx: number) => ({
        targetId: id,
        targetName: post?.targetNames?.[idx] || id,
        status: post?.published ? 'published' : 'draft',
        syncMode: 'synced',
        distributedAt: post?.createdAt,
        lastSyncedAt: post?.updatedAt,
        localEdits: false,
    }));

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

    // Retirar del club (quita el targetId sin eliminar el maestro)
    const handleRetire = async (targetId: string) => {
        if (!confirm('¿Deseas retirar esta noticia de este club? El artículo maestro se conservará.')) return;
        setActionLoadingId(targetId);
        try {
            const res = await fetch(`${apiUrl}/admin/posts/${post.id}/distribution/target-status`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token()}`
                },
                body: JSON.stringify({ targetClubId: targetId, status: 'retired' })
            });
            if (res.ok) {
                toast.success('El artículo fue retirado del sitio seleccionado.');
                onRefresh();
            } else {
                toast.error('No se pudo retirar el artículo.');
            }
        } catch {
            toast.error('Error de conexión.');
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
                    <div className="flex items-center gap-4 text-gray-700 font-medium">
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
                <div className="flex-1 overflow-y-auto p-6">
                    {targets.length === 0 ? (
                        <div className="text-center py-16">
                            <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                            <h4 className="text-sm font-bold text-gray-700">Este artículo no tiene sitios de distribución asignados</h4>
                            <p className="text-xs text-gray-400 mt-1 max-w-sm mx-auto">
                                Puedes editar el artículo y añadir clubes destino desde la pestaña "Distribución" del editor.
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
                    <div className="mt-6 p-4 rounded-2xl bg-gray-50 border border-gray-100 flex items-start gap-3 text-xs text-gray-500">
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
