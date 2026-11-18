// ════════════════════════════════════════════════════════════════════
// EXCHANGE — el resumen expandible de «Proyectos postulados» (v4.1335)
//
// Contraído por defecto para no saturar el tablero. Indicadores UNA tarjeta por
// moneda: COP y USD nunca se suman (no hay conversión implícita). Cada estado
// es también un filtro, que se combina con los demás del listado.
// ════════════════════════════════════════════════════════════════════
import React, { useEffect, useState } from 'react';
import { ArrowLeftRight, ChevronDown, ChevronUp, Download, Loader2, Settings2 } from 'lucide-react';
import { toast } from 'sonner';
import { exchangeRequest, downloadExchangeCsv, fmtMoney, type ExchangeSummaryData } from '../../../../lib/exchange';

const STORAGE = 'exchange-summary-open';
const readOpen = () => { try { return localStorage.getItem(STORAGE) === '1'; } catch { return false; } };

interface Props {
    eventId: string | null;
    query: string;
    activeFilter: string;
    filters: { key: string; label: string }[];
    onPickFilter: (key: string) => void;
    onOpenConfig: () => void;
    canConfig: boolean;
    reloadKey: number;
}

const Kpi: React.FC<{ label: string; value: string; hint?: string; tone?: string }> = ({ label, value, hint, tone = 'text-slate-900' }) => (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
        <p className={`text-lg font-bold ${tone}`} data-no-translate>{value}</p>
        <p className="text-xs font-semibold text-slate-600">{label}</p>
        {hint && <p className="text-[11px] text-slate-400">{hint}</p>}
    </div>
);

const ExchangeSummary: React.FC<Props> = ({ eventId, query, activeFilter, filters, onPickFilter, onOpenConfig, canConfig, reloadKey }) => {
    const [open, setOpen] = useState(readOpen);
    const [data, setData] = useState<ExchangeSummaryData | null>(null);
    const [loading, setLoading] = useState(false);
    const [exporting, setExporting] = useState<string | null>(null);

    useEffect(() => {
        if (!open) return;
        setLoading(true);
        exchangeRequest<ExchangeSummaryData>(`/resumen?${query}`, eventId)
            .then(setData)
            .catch(e => toast.error(e?.message || 'No se pudo cargar el resumen de Exchange.'))
            .finally(() => setLoading(false));
    }, [open, query, eventId, reloadKey]);

    const toggle = () => setOpen(o => {
        try { localStorage.setItem(STORAGE, o ? '0' : '1'); } catch { /* sin almacenamiento: sólo esta vista */ }
        return !o;
    });

    const exportar = async (vista: 'operaciones' | 'asignaciones') => {
        setExporting(vista);
        try { await downloadExchangeCsv(vista, query, eventId); }
        catch (e: any) { toast.error(e?.message || 'No se pudo exportar.'); }
        finally { setExporting(null); }
    };

    return (
        <section className="rounded-xl border border-slate-200 bg-white" aria-label="Exchange: traslados y conciliación">
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <button type="button" onClick={toggle} aria-expanded={open} className="flex items-center gap-2 text-left">
                    <ArrowLeftRight size={16} className="text-slate-600" />
                    <span>
                        <span className="block text-sm font-bold text-slate-800">Exchange — traslados y conciliación</span>
                        <span className="block text-xs text-slate-500">Pago de inscripción, traslado de recursos y conciliación son tres estados distintos.</span>
                    </span>
                    {open ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
                </button>
                {open && (
                    <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => exportar('operaciones')} disabled={!!exporting}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                            {exporting === 'operaciones' ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} Operaciones (CSV)
                        </button>
                        <button type="button" onClick={() => exportar('asignaciones')} disabled={!!exporting}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                            {exporting === 'asignaciones' ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} Asignaciones (CSV)
                        </button>
                        {canConfig && (
                            <button type="button" onClick={onOpenConfig}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                                <Settings2 size={13} /> Cuentas y accesos
                            </button>
                        )}
                    </div>
                )}
            </div>
            {open && (
                <div className="space-y-3 border-t border-slate-100 px-4 py-3">
                    {loading && !data && <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 size={14} className="animate-spin" /> Calculando…</p>}
                    {data && (
                        <>
                            {data.totals.porMoneda.length === 0 && <p className="text-sm text-slate-500">Todavía no hay pagos confirmados con movimiento para trasladar.</p>}
                            {data.totals.porMoneda.map(t => (
                                <div key={t.currency}>
                                    <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">{t.currency} <span className="font-normal normal-case">· {t.proyectosPagados} pagos con movimiento · {t.operaciones} operaciones</span></p>
                                    <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
                                        <Kpi label="Total recibido" value={fmtMoney(t.recibido, t.currency)} hint="Pagos confirmados a trasladar" />
                                        <Kpi label="Total trasladado" value={fmtMoney(t.trasladado, t.currency)} hint={`${t.operaciones} operaciones`} />
                                        <Kpi label="Total conciliado" value={fmtMoney(t.conciliado, t.currency)} hint={`${t.operacionesConciliadas} operaciones`} tone="text-emerald-700" />
                                        <Kpi label="Pendiente de traslado" value={fmtMoney(t.pendienteTraslado, t.currency)} hint={`${t.proyectosSinTraslado} sin traslado · ${t.parciales} parciales`} tone="text-amber-700" />
                                        <Kpi label="Pendiente de conciliación" value={fmtMoney(t.pendienteConciliacion, t.currency)} hint={`${t.operacionesPendientes} operaciones`} tone="text-orange-700" />
                                        <Kpi label="Con diferencias" value={String(t.diferencias)} hint={t.diferencias ? fmtMoney(t.valorDiferencias, t.currency) : 'Ninguna'} tone={t.diferencias ? 'text-red-700' : 'text-slate-900'} />
                                    </div>
                                </div>
                            ))}
                            {(data.totals.pagosDirectos > 0 || data.totals.sinMovimiento > 0) && (
                                <p className="text-xs text-slate-500">
                                    {data.totals.pagosDirectos > 0 && <>{data.totals.pagosDirectos} pago(s) confirmados a mano no pasan por la cuenta de la plataforma (no requieren traslado). </>}
                                    {data.totals.sinMovimiento > 0 && <>{data.totals.sinMovimiento} cobro(s) sin movimiento en la Bóveda: no se cuentan hasta registrarlo («Buscar cobros sin registrar»).</>}
                                </p>
                            )}
                            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por estado Exchange">
                                {[{ key: 'all', label: 'Todos' }, ...filters].map(f => {
                                    const n = f.key === 'all' ? data.proyectos : (data.porEstado[f.key] || 0);
                                    const activo = (activeFilter || 'all') === f.key;
                                    return (
                                        <button key={f.key} type="button" onClick={() => onPickFilter(f.key)} aria-pressed={activo}
                                            className={`rounded-full border px-3 py-1 text-xs font-semibold ${activo ? 'border-sky-700 bg-sky-700 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}>
                                            {f.label} <span className={activo ? 'text-sky-100' : 'text-slate-400'} data-no-translate>{n}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </>
                    )}
                </div>
            )}
        </section>
    );
};

export default ExchangeSummary;
