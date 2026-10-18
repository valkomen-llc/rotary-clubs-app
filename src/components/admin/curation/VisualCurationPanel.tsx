import React, { useEffect, useState } from 'react';
import {
    Sparkles, RefreshCw, Filter, CheckCircle, XCircle, Clock,
    Sliders, History, Monitor, AlertCircle, Play, ChevronDown, Check
} from 'lucide-react';
import { toast } from 'sonner';
import { RecommendationCard } from './RecommendationCard';
import { PreviewModal } from './PreviewModal';
import { FramingEditorModal, FramingConfig } from './FramingEditorModal';
import { HistoryTab } from './HistoryTab';
import { SchedulingTab } from './SchedulingTab';
import { ContainersTab } from './ContainersTab';

interface VisualCurationPanelProps {
    clubId: string | null;
    clubName?: string;
    siteImages: any;
    containers: any[];
    onRefreshSiteImages: () => void;
}

const API = import.meta.env.VITE_API_URL || '/api';
const token = () => localStorage.getItem('rotary_token');

export const VisualCurationPanel: React.FC<VisualCurationPanelProps> = ({
    clubId,
    clubName,
    siteImages,
    containers,
    onRefreshSiteImages,
}) => {
    const [subTab, setSubTab] = useState<'recommendations' | 'containers' | 'scheduling' | 'history'>('recommendations');
    const [loading, setLoading] = useState(true);
    const [runningAnalysis, setRunningAnalysis] = useState(false);

    // Data states
    const [config, setConfig] = useState<any>(null);
    const [recommendations, setRecommendations] = useState<any[]>([]);
    const [candidates, setCandidates] = useState<any[]>([]);
    const [history, setHistory] = useState<any[]>([]);
    const [locks, setLocks] = useState<any[]>([]);

    // Filters
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [containerFilter, setContainerFilter] = useState<string>('all');

    // Modals
    const [selectedRecForPreview, setSelectedRecForPreview] = useState<any>(null);
    const [selectedRecForFraming, setSelectedRecForFraming] = useState<any>(null);
    const [rejectingRecId, setRejectingRecId] = useState<string | null>(null);
    const [rejectReason, setRejectReason] = useState<string>('');

    // Load curation data
    const loadData = async () => {
        setLoading(true);
        try {
            const tenantParam = clubId ? `?clubId=${clubId}` : '';
            const [cfgRes, recsRes, candRes, histRes, locksRes] = await Promise.all([
                fetch(`${API}/admin/curation/config${tenantParam}`, { headers: { Authorization: `Bearer ${token()}` } }),
                fetch(`${API}/admin/curation/recommendations${tenantParam}`, { headers: { Authorization: `Bearer ${token()}` } }),
                fetch(`${API}/admin/curation/candidates${tenantParam}`, { headers: { Authorization: `Bearer ${token()}` } }),
                fetch(`${API}/admin/curation/history${tenantParam}`, { headers: { Authorization: `Bearer ${token()}` } }),
                fetch(`${API}/admin/curation/locks${tenantParam}`, { headers: { Authorization: `Bearer ${token()}` } }),
            ]);

            if (cfgRes.ok) setConfig(await cfgRes.json());
            if (recsRes.ok) setRecommendations(await recsRes.json());
            if (candRes.ok) setCandidates(await candRes.json());
            if (histRes.ok) setHistory(await histRes.json());
            if (locksRes.ok) setLocks(await locksRes.json());
        } catch (err) {
            console.error('Error loading curation data:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, [clubId]);

    // Ejecutar análisis manual
    const handleRunAnalysis = async () => {
        setRunningAnalysis(true);
        try {
            const res = await fetch(`${API}/admin/curation/run-analysis`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
                body: JSON.stringify({ clubId }),
            });
            const data = await res.json();
            if (res.ok) {
                toast.success(data.message || 'Análisis completado');
                await loadData();
            } else {
                toast.error(data.error || 'Error al ejecutar análisis');
            }
        } catch {
            toast.error('Error de conexión al ejecutar análisis');
        } finally {
            setRunningAnalysis(false);
        }
    };

    // Aprobar recomendación (estándar)
    const handleApprove = async (recId: string, framingConfig?: any, exceptionData?: { isException?: boolean; exceptionReason?: string }) => {
        try {
            const res = await fetch(`${API}/admin/curation/recommendations/${recId}/approve`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
                body: JSON.stringify({
                    clubId,
                    framingConfig,
                    isException: exceptionData?.isException,
                    exceptionReason: exceptionData?.exceptionReason,
                }),
            });
            const data = await res.json();
            if (res.ok) {
                toast.success('🎉 Recomendación aprobada y publicada en el sitio');
                await loadData();
                onRefreshSiteImages();
            } else {
                toast.error(data.error || 'Error al aprobar');
            }
        } catch {
            toast.error('Error de conexión al aprobar');
        }
    };

    // Guardar encuadre sin publicar todavía
    const handleSaveFraming = async (recId: string, framing: FramingConfig) => {
        const res = await fetch(`${API}/admin/curation/recommendations/${recId}/framing`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
            body: JSON.stringify({ clubId, framingConfig: framing }),
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || 'Error al guardar encuadre');
        }
        await loadData();
    };

    // Confirmar encuadre y publicar en el sitio
    const handleConfirmAndApproveWithFraming = async (
        recId: string,
        framing: FramingConfig,
        exceptionData?: { isException?: boolean; exceptionReason?: string }
    ) => {
        const res = await fetch(`${API}/admin/curation/recommendations/${recId}/approve`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
            body: JSON.stringify({
                clubId,
                framingConfig: framing,
                isException: exceptionData?.isException,
                exceptionReason: exceptionData?.exceptionReason,
            }),
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || 'Error al aprobar y publicar');
        }
        await loadData();
        onRefreshSiteImages();
    };

    // Rechazar recomendación
    const handleReject = async (recId: string, reason?: string) => {
        try {
            const res = await fetch(`${API}/admin/curation/recommendations/${recId}/reject`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
                body: JSON.stringify({ clubId, reason }),
            });
            if (res.ok) {
                toast.info('Recomendación descartada');
                setRejectingRecId(null);
                setRejectReason('');
                await loadData();
            }
        } catch {
            toast.error('Error al rechazar');
        }
    };

    // Reasignar contenedor
    const handleReassign = async (recId: string, newContainer: string) => {
        try {
            const res = await fetch(`${API}/admin/curation/recommendations/${recId}/reassign`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
                body: JSON.stringify({ clubId, targetContainerKey: newContainer, targetSlotIndex: 0 }),
            });
            if (res.ok) {
                toast.success(`Destino cambiado a ${newContainer}`);
                await loadData();
            }
        } catch {
            toast.error('Error al cambiar destino');
        }
    };

    // Reversión / Rollback
    const handleRollback = async (historyId: string) => {
        try {
            const res = await fetch(`${API}/admin/curation/history/${historyId}/rollback`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
                body: JSON.stringify({ clubId }),
            });
            if (res.ok) {
                toast.success('✅ Versión anterior restaurada exitosamente');
                await loadData();
                onRefreshSiteImages();
            } else {
                const err = await res.json().catch(() => ({}));
                toast.error(err.error || 'Error al restaurar');
            }
        } catch {
            toast.error('Error de conexión al restaurar');
        }
    };

    // Bloqueo de slot
    const handleToggleLock = async (containerKey: string, slotIndex: number, locked: boolean) => {
        try {
            const res = await fetch(`${API}/admin/curation/locks`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
                body: JSON.stringify({ clubId, containerKey, slotIndex, locked }),
            });
            if (res.ok) {
                toast.success(locked ? '🔒 Slot bloqueado para rotaciones' : '🔓 Slot desbloqueado');
                const locksRes = await fetch(`${API}/admin/curation/locks${clubId ? `?clubId=${clubId}` : ''}`, { headers: { Authorization: `Bearer ${token()}` } });
                if (locksRes.ok) setLocks(await locksRes.json());
            }
        } catch {
            toast.error('Error al actualizar bloqueo');
        }
    };

    // Guardar Configuración
    const handleSaveConfig = async (updated: any) => {
        const res = await fetch(`${API}/admin/curation/config`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
            body: JSON.stringify({ ...updated, clubId }),
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || 'Error al guardar');
        }
        await loadData();
    };

    // Filtrado de recomendaciones
    const filteredRecs = recommendations.filter((r) => {
        if (statusFilter !== 'all' && r.status !== statusFilter) return false;
        if (containerFilter !== 'all' && r.containerKey !== containerFilter) return false;
        return true;
    });

    const pendingCount = recommendations.filter((r) => r.status === 'pending').length;
    const approvedCount = recommendations.filter((r) => r.status === 'approved').length;
    const rejectedCount = recommendations.filter((r) => r.status === 'rejected').length;

    return (
        <div className="space-y-6">
            {/* Top Stat Ribbon & Action */}
            <div className="bg-gradient-to-r from-gray-900 via-sky-950 to-gray-900 rounded-3xl p-6 text-white shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6 border border-gray-800">
                <div className="space-y-2">
                    <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-sky-500/20 text-sky-300 border border-sky-400/30">
                            <Sparkles className="w-3.5 h-3.5 text-sky-400" />
                            {clubName || 'Rotary Distrito 4281'} · Curaduría Activa
                        </span>
                        <span className="text-xs text-gray-400">
                            Modo: {config?.mode === 'auto_publish' ? 'Publicación Autorizada' : 'Revisión Humana'}
                        </span>
                    </div>
                    <h2 className="text-xl md:text-2xl font-black tracking-tight text-white">
                        Curaduría Visual Inteligente con IA
                    </h2>
                    <p className="text-xs md:text-sm text-gray-300 max-w-xl">
                        Descubre las mejores fotografías enviadas desde Rotary en Acción, evalúa su composición y pertinencia institucional, y aprueba su publicación con un clic.
                    </p>
                </div>

                {/* Stat Counters */}
                <div className="flex items-center gap-4 flex-wrap">
                    <div className="bg-white/10 backdrop-blur rounded-2xl px-4 py-3 text-center border border-white/10 min-w-[80px]">
                        <span className="text-2xl font-black text-white">{candidates.length || recommendations.length}</span>
                        <span className="block text-[10px] uppercase font-bold text-gray-400 mt-0.5">Analizadas</span>
                    </div>
                    <div className="bg-white/10 backdrop-blur rounded-2xl px-4 py-3 text-center border border-white/10 min-w-[80px]">
                        <span className="text-2xl font-black text-amber-400">{pendingCount}</span>
                        <span className="block text-[10px] uppercase font-bold text-gray-400 mt-0.5">Por Aprobar</span>
                    </div>
                    <div className="bg-white/10 backdrop-blur rounded-2xl px-4 py-3 text-center border border-white/10 min-w-[80px]">
                        <span className="text-2xl font-black text-emerald-400">{approvedCount}</span>
                        <span className="block text-[10px] uppercase font-bold text-gray-400 mt-0.5">Aprobadas</span>
                    </div>

                    <button
                        onClick={handleRunAnalysis}
                        disabled={runningAnalysis}
                        className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-sky-500 hover:bg-sky-400 text-gray-950 font-bold text-xs shadow-lg shadow-sky-500/20 active:scale-95 transition-all"
                    >
                        <RefreshCw className={`w-4 h-4 ${runningAnalysis ? 'animate-spin' : ''}`} />
                        <span>{runningAnalysis ? 'Analizando fotos...' : 'Ejecutar Análisis IA'}</span>
                    </button>
                </div>
            </div>

            {/* Sub-Navigation Tabs */}
            <div className="flex items-center gap-2 border-b border-gray-200 pb-2">
                <button
                    onClick={() => setSubTab('recommendations')}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs transition-all ${subTab === 'recommendations' ? 'bg-sky-100 text-sky-900 shadow-sm' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'}`}
                >
                    <Sparkles className="w-4 h-4 text-sky-600" />
                    <span>Recomendaciones</span>
                    {pendingCount > 0 && (
                        <span className="px-1.5 py-0.5 rounded-full text-[10px] font-black bg-amber-200 text-amber-900">
                            {pendingCount}
                        </span>
                    )}
                </button>

                <button
                    onClick={() => setSubTab('containers')}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs transition-all ${subTab === 'containers' ? 'bg-sky-100 text-sky-900 shadow-sm' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'}`}
                >
                    <Monitor className="w-4 h-4 text-sky-600" />
                    <span>Contenedores y Bloqueos</span>
                    {locks.length > 0 && (
                        <span className="px-1.5 py-0.5 rounded-full text-[10px] font-black bg-gray-200 text-gray-700">
                            {locks.length}
                        </span>
                    )}
                </button>

                <button
                    onClick={() => setSubTab('scheduling')}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs transition-all ${subTab === 'scheduling' ? 'bg-sky-100 text-sky-900 shadow-sm' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'}`}
                >
                    <Sliders className="w-4 h-4 text-sky-600" />
                    <span>Programación y Reglas</span>
                </button>

                <button
                    onClick={() => setSubTab('history')}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs transition-all ${subTab === 'history' ? 'bg-sky-100 text-sky-900 shadow-sm' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'}`}
                >
                    <History className="w-4 h-4 text-sky-600" />
                    <span>Historial y Auditoría</span>
                    {history.length > 0 && (
                        <span className="px-1.5 py-0.5 rounded-full text-[10px] font-black bg-gray-200 text-gray-700">
                            {history.length}
                        </span>
                    )}
                </button>
            </div>

            {/* TAB: RECOMENDACIONES */}
            {subTab === 'recommendations' && (
                <div className="space-y-6">
                    {/* Filter bar */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
                        <div className="flex items-center gap-3">
                            <Filter className="w-4 h-4 text-gray-400" />
                            <select
                                value={statusFilter}
                                onChange={(e) => setStatusFilter(e.target.value)}
                                className="px-3 py-1.5 rounded-xl border border-gray-200 text-xs font-semibold text-gray-700 focus:outline-none focus:ring-2 focus:ring-sky-500"
                            >
                                <option value="all">Todos los estados</option>
                                <option value="pending">Pendientes de revisión ({pendingCount})</option>
                                <option value="approved">Aprobadas ({approvedCount})</option>
                                <option value="rejected">Rechazadas ({rejectedCount})</option>
                            </select>

                            <select
                                value={containerFilter}
                                onChange={(e) => setContainerFilter(e.target.value)}
                                className="px-3 py-1.5 rounded-xl border border-gray-200 text-xs font-semibold text-gray-700 focus:outline-none focus:ring-2 focus:ring-sky-500"
                            >
                                <option value="all">Todos los contenedores</option>
                                <option value="hero">Hero — Slider Principal</option>
                                <option value="foundation">Fundación Rotaria</option>
                                <option value="join">Sección Únete</option>
                                <option value="causes">Áreas de Interés (Causas)</option>
                            </select>
                        </div>

                        <div className="text-xs text-gray-400 font-medium">
                            Mostrando {filteredRecs.length} de {recommendations.length} recomendaciones
                        </div>
                    </div>

                    {/* Recommendations Grid */}
                    {filteredRecs.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-4 gap-6 w-full">
                            {filteredRecs.map((rec) => {
                                const isLocked = locks.some(
                                    (l) => l.containerKey === rec.containerKey && Number(l.slotIndex) === Number(rec.slotIndex)
                                );
                                return (
                                    <RecommendationCard
                                        key={rec.id}
                                        rec={rec}
                                        onApprove={handleApprove}
                                        onReject={(id) => setRejectingRecId(id)}
                                        onPreview={(r) => setSelectedRecForPreview(r)}
                                        onAdjustFraming={(r) => setSelectedRecForFraming(r)}
                                        onReassign={handleReassign}
                                        onToggleLock={handleToggleLock}
                                        isLocked={isLocked}
                                    />
                                );
                            })}
                        </div>
                    ) : (
                        <div className="py-20 text-center bg-white rounded-3xl border border-gray-100 p-8 shadow-sm">
                            <Sparkles className="w-12 h-12 text-sky-400 mx-auto mb-3" />
                            <h3 className="text-base font-bold text-gray-800">No hay recomendaciones en este filtro</h3>
                            <p className="text-xs text-gray-500 max-w-md mx-auto mt-1">
                                Puedes ejecutar un análisis para escanear las solicitudes de Rotary en Acción y generar propuestas visuales adaptadas al sitio.
                            </p>
                            <button
                                onClick={handleRunAnalysis}
                                disabled={runningAnalysis}
                                className="mt-4 px-6 py-2.5 rounded-xl bg-rotary-blue hover:bg-sky-800 text-white font-bold text-xs shadow-md shadow-blue-900/10 active:scale-95 transition-all"
                            >
                                {runningAnalysis ? 'Analizando...' : 'Ejecutar Análisis con IA'}
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* TAB: CONTENEDORES */}
            {subTab === 'containers' && (
                <ContainersTab
                    containers={containers}
                    siteImages={siteImages}
                    locks={locks}
                    onToggleLock={handleToggleLock}
                />
            )}

            {/* TAB: PROGRAMACIÓN */}
            {subTab === 'scheduling' && (
                <SchedulingTab
                    config={config}
                    onSaveConfig={handleSaveConfig}
                />
            )}

            {/* TAB: HISTORIAL */}
            {subTab === 'history' && (
                <HistoryTab
                    historyItems={history}
                    loading={loading}
                    onRollback={handleRollback}
                />
            )}

            {/* Preview Modal */}
            {selectedRecForPreview && (
                <PreviewModal
                    isOpen={Boolean(selectedRecForPreview)}
                    onClose={() => setSelectedRecForPreview(null)}
                    recommendation={selectedRecForPreview}
                    onApprove={handleApprove}
                    onReject={(id) => setRejectingRecId(id)}
                />
            )}

            {/* Framing Editor Modal */}
            {selectedRecForFraming && (
                <FramingEditorModal
                    isOpen={Boolean(selectedRecForFraming)}
                    rec={selectedRecForFraming}
                    onClose={() => setSelectedRecForFraming(null)}
                    onSaveFraming={handleSaveFraming}
                    onConfirmAndApprove={handleConfirmAndApproveWithFraming}
                />
            )}

            {/* Reject Reason Modal */}
            {rejectingRecId && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white rounded-2xl shadow-xl border border-gray-100 w-full max-w-md p-6 space-y-4">
                        <div className="flex items-center gap-2 text-red-600 font-bold text-sm">
                            <XCircle className="w-5 h-5" /> Descartar Recomendación
                        </div>
                        <p className="text-xs text-gray-600">
                            Indica el motivo de descarte para que el algoritmo aprenda y calibre futuras recomendaciones:
                        </p>

                        <div className="space-y-2">
                            {[
                                'Resolución o nitidez insuficiente',
                                'Composición poco institucional',
                                'No encaja con el momento actual del distrito',
                                'Aparecen personas sin consentimiento explícito',
                                'Prefiero mantener la fotografía actual',
                            ].map((preset) => (
                                <button
                                    key={preset}
                                    type="button"
                                    onClick={() => setRejectReason(preset)}
                                    className={`w-full text-left px-3 py-2 rounded-xl text-xs transition-colors border ${rejectReason === preset ? 'bg-sky-50 border-sky-300 text-sky-800 font-bold' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                                >
                                    {preset}
                                </button>
                            ))}

                            <textarea
                                value={rejectReason}
                                onChange={(e) => setRejectReason(e.target.value)}
                                placeholder="O escribe un motivo personalizado..."
                                rows={2}
                                className="w-full p-3 rounded-xl border border-gray-200 text-xs focus:ring-2 focus:ring-sky-500 focus:outline-none"
                            />
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-2">
                            <button
                                onClick={() => {
                                    setRejectingRecId(null);
                                    setRejectReason('');
                                }}
                                className="px-4 py-2 rounded-xl border border-gray-300 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={() => handleReject(rejectingRecId, rejectReason)}
                                className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold shadow-md active:scale-95"
                            >
                                Confirmar Descarte
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
