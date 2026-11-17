// ════════════════════════════════════════════════════════════════════
// Franja «Seguimiento documental» sobre la tabla de Proyectos postulados
// (v4.1332)
//
// Indicadores calculados por el SERVIDOR sobre los proyectos que pasan los
// filtros activos (búsqueda, estado, pago, distrito…). Cada tarjeta es también
// un filtro: un clic deja la tabla con ese grupo. Arriba, la fecha límite
// documental, el semáforo y los avisos de configuración.
// ════════════════════════════════════════════════════════════════════
import React, { useEffect, useState } from 'react';
import { CalendarClock, ClipboardCheck, Loader2, Mail, RefreshCw, Settings, AlertTriangle, Columns3 } from 'lucide-react';
import { docRequest, fmtDay, type TrackingSummary } from '../../../../lib/documentTracking';

interface Props {
    eventId: string;
    /** Los filtros activos del listado (sin `doc`), como query string. */
    query: string;
    activeView: string;
    onPickView: (key: string) => void;
    onOpenReminders: () => void;
    onOpenConfig: () => void;
    canRemind: boolean;
    canConfig: boolean;
    showColumns: boolean;
    onToggleColumns: () => void;
    reloadKey: number;
    onSummary?: (s: TrackingSummary | null) => void;
}

const CARDS: { view: string; label: string; key: keyof TrackingSummary['kpis']; tone: string; hint: string }[] = [
    { view: 'all', label: 'Proyectos', key: 'total', tone: 'text-slate-900', hint: 'Dentro de los filtros activos' },
    { view: 'completa', label: 'Documentación completa', key: 'complete', tone: 'text-emerald-700', hint: 'Todo lo obligatorio diligenciado y entregado' },
    { view: 'incompleta', label: 'Documentación incompleta', key: 'incomplete', tone: 'text-amber-700', hint: 'Al menos un requisito obligatorio pendiente' },
    { view: 'formulacion', label: 'Pendientes de formulación', key: 'pendingMaster', tone: 'text-amber-700', hint: 'Formulación por debajo del 100 %' },
    { view: 'fdd', label: 'Pendientes de FDD', key: 'pendingFdd', tone: 'text-amber-700', hint: 'Solicitud FDD obligatoria incompleta' },
    { view: 'presentacion', label: 'Presentaciones pendientes', key: 'pendingPresentation', tone: 'text-amber-700', hint: 'Deben cargar la presentación' },
    { view: 'video', label: 'Videos pendientes', key: 'pendingVideo', tone: 'text-amber-700', hint: 'Deben entregar su video' },
    { view: 'por_validar', label: 'Pendientes de validación', key: 'pendingValidation', tone: 'text-indigo-700', hint: 'Recibido, falta la revisión del comité' },
    { view: 'correcciones', label: 'Requieren corrección', key: 'changesRequested', tone: 'text-orange-700', hint: 'El comité pidió ajustes' },
    { view: 'urgentes', label: 'Vencidos o por vencer', key: 'urgent', tone: 'text-red-700', hint: 'Con pendientes y la fecha límite encima' },
];

const DocumentTrackingStrip: React.FC<Props> = ({ eventId, query, activeView, onPickView, onOpenReminders, onOpenConfig, canRemind, canConfig, showColumns, onToggleColumns, reloadKey, onSummary }) => {
    const [data, setData] = useState<TrackingSummary | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [tick, setTick] = useState(0);
    // La búsqueda cambia con cada tecla: se espera a que el usuario pare.
    const [q, setQ] = useState(query);
    useEffect(() => {
        const t = setTimeout(() => setQ(query), 400);
        return () => clearTimeout(t);
    }, [query]);

    useEffect(() => {
        let vivo = true;
        setLoading(true);
        docRequest<TrackingSummary>(`${q ? `?${q}` : ''}`, eventId)
            .then(d => { if (!vivo) return; setData(d); setError(null); onSummary?.(d); })
            .catch(e => {
                if (!vivo) return;
                // Sin permiso, la franja no se muestra (la tabla sigue).
                if (e?.status === 401 || e?.status === 403) { setData(null); setError(null); onSummary?.(null); return; }
                setError(e?.message || 'No se pudo cargar el seguimiento documental.');
            })
            .finally(() => { if (vivo) setLoading(false); });
        return () => { vivo = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [eventId, q, reloadKey, tick]);

    if (!data && !error) {
        return loading ? <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500"><Loader2 size={14} className="animate-spin" /> Calculando el seguimiento documental…</div> : null;
    }
    if (error) {
        return (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                <AlertTriangle size={14} /> {error}
                <button onClick={() => setTick(t => t + 1)} className="ml-auto inline-flex items-center gap-1 rounded-lg border border-red-300 bg-white px-2.5 py-1 text-xs font-semibold">
                    <RefreshCw size={12} /> Reintentar
                </button>
            </div>
        );
    }
    const k = data!.kpis;
    const cfg = data!.config;
    return (
        <section aria-labelledby="seguimiento-documental-titulo" className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0">
                    <h3 id="seguimiento-documental-titulo" className="flex items-center gap-2 text-sm font-bold text-slate-900">
                        <ClipboardCheck size={16} className="text-[#17458F]" /> Seguimiento documental
                        {loading && <Loader2 size={13} className="animate-spin text-slate-400" />}
                    </h3>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                        <span className="inline-flex items-center gap-1"><CalendarClock size={12} /> Fecha límite documental: <strong className="text-slate-700">{cfg.deadline ? fmtDay(cfg.deadline) : 'sin definir'}</strong></span>
                        <span>Avance promedio: <strong className="text-slate-700">{k.averagePct} %</strong></span>
                        <span>Diligenciado, entregado y validado son cosas distintas: la validación va aparte.</span>
                    </p>
                </div>
                <div className="ml-auto flex flex-wrap items-center gap-2">
                    <button type="button" onClick={onToggleColumns} aria-pressed={showColumns}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                        <Columns3 size={13} /> {showColumns ? 'Contraer columnas' : 'Expandir columnas'}
                    </button>
                    {canConfig && (
                        <button type="button" onClick={onOpenConfig} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                            <Settings size={13} /> Fecha límite y requisitos
                        </button>
                    )}
                    {canRemind && (
                        <button type="button" onClick={onOpenReminders} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white" style={{ background: '#17458F' }}>
                            <Mail size={13} /> Recordatorios de documentación
                        </button>
                    )}
                </div>
            </div>
            {data!.warnings.length > 0 && (
                <ul className="mt-3 space-y-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    {data!.warnings.map((w, i) => <li key={i} className="flex gap-1.5"><AlertTriangle size={12} className="mt-0.5 shrink-0" /> {w}</li>)}
                </ul>
            )}
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                {CARDS.map(c => {
                    const active = activeView === c.view || (c.view === 'all' && (!activeView || activeView === 'all'));
                    return (
                        <button key={c.view} type="button" onClick={() => onPickView(c.view)} aria-pressed={active} title={c.hint}
                            className={`rounded-xl border px-3 py-2 text-left transition ${active ? 'border-[#17458F] bg-sky-50 ring-1 ring-[#17458F]' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
                            <span className={`block text-xl font-extrabold tabular-nums ${c.tone}`}>{k[c.key]}</span>
                            <span className="block text-[11px] font-semibold leading-tight text-slate-600">{c.label}</span>
                        </button>
                    );
                })}
            </div>
        </section>
    );
};

export default DocumentTrackingStrip;
