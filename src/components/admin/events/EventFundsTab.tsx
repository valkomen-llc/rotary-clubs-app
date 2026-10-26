// ════════════════════════════════════════════════════════════════════════════
// «Conciliación de inscripciones» de un evento — v4.1250
//
// Reemplaza la «Conciliación de fondos» de v4.1248, que leía la Bóveda de
// Fondos. Ahora es el dominio financiero PROPIO de Eventos (/api/event-funds):
//
//   · Beneficiario del evento (Concorrotarios u otro) y sus responsables.
//   · Indicadores por moneda (COP y USD nunca se suman).
//   · Las inscripciones con su pago (proceso A) y su traslado (proceso B).
//     Se pueden elegir varias para UN traslado consolidado — Stripe puede
//     liquidar varios cobros en una misma operación.
//   · Los traslados con su comprobante PDF, su estado y sus envíos.
// ════════════════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, AlertTriangle, ShieldCheck, Search, CheckSquare, Square, ArrowRightLeft, Download, RefreshCw, Info } from 'lucide-react';
import { fundsApi, money, fecha, STATUS_CLS, type FundsOverview, type FundsRegistration } from './funds/eventFundsApi';
import BeneficiaryConfig from './funds/BeneficiaryConfig';
import TransferCard from './funds/TransferCard';
import TransferFormModal, { restanteDe } from './funds/TransferFormModal';
import { REGISTRATION_TRANSFER_LABELS } from '../../../../server/lib/eventFundsSpec.js';

const Metric = ({ label, value, tone = 'text-gray-900', hint }: { label: string; value: string; tone?: string; hint?: string }) => (
    <div className="rounded-xl border border-gray-100 bg-white px-4 py-3">
        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{label}</p>
        <p className={`mt-1 text-lg font-bold ${tone}`}>{value}</p>
        {hint && <p className="text-[11px] text-gray-400">{hint}</p>}
    </div>
);

const CurrencyTotals = ({ t }: { t: Record<string, any> }) => (
    <div className="rounded-2xl border border-gray-200 bg-gray-50/60 p-4">
        <p className="mb-3 text-xs font-bold uppercase tracking-wider text-gray-500">
            {t.currency} · {t.pagosConfirmados} pago(s) confirmado(s){t.pagosPendientes ? ` · ${t.pagosPendientes} pendiente(s)` : ''}
        </p>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Metric label="Total recaudado" value={money(t.cobrado, t.currency)} />
            <Metric label="Recargos de pasarela" value={`−${money(t.recargos, t.currency)}`} tone="text-rose-600" hint="Pagados por los participantes" />
            <Metric label="Neto para el evento" value={money(t.valorEvento, t.currency)} tone="text-emerald-700" />
            <Metric label="Comisión real Stripe" value={money(t.comisionStripe, t.currency)} hint={`${t.verificados} pago(s) verificados`} />
            <Metric label="Traslados registrados" value={money(t.trasladoRegistrado, t.currency)} tone="text-sky-700" hint={`${t.traslados} operación(es)`} />
            <Metric label="Traslados confirmados" value={money(t.trasladoConfirmado, t.currency)} tone="text-emerald-700" hint={`${t.trasladosConfirmados} con evidencia`} />
            <Metric label="Pendiente de traslado" value={money(t.pendienteTraslado, t.currency)} tone="text-amber-700" />
            <Metric label="Comprobantes" value={`${t.comprobantesAdjuntos} adjuntos · ${t.comprobantesEnviados} enviados`} hint={t.diferencias ? `${t.diferencias} diferencia(s) por conciliar` : undefined} />
        </div>
        {t.reembolsado > 0 && <p className="mt-2 text-[11px] text-gray-500">Reembolsado: {money(t.reembolsado, t.currency)}</p>}
    </div>
);

/** CSV con BOM y punto y coma (regla de v4.850: Excel lo abre bien). */
const exportCsv = (rows: FundsRegistration[], title: string) => {
    const cell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const head = ['Código', 'Participante', 'Correo', 'Club', 'Moneda', 'Pagado', 'Recargo', 'Para el evento', 'Asignado a traslados', 'Confirmado', 'Estado del pago', 'Traslado', 'Referencia Stripe'];
    const body = rows.map(r => [r.code, r.name, r.email, r.clubName, r.payment.currency, r.payment.charged, r.payment.surcharge, r.payment.eventAmount,
        r.allocated, r.confirmedAmount, r.payment.status, REGISTRATION_TRANSFER_LABELS[r.transferState], r.payment.paymentIntentId].map(cell).join(';'));
    const blob = new Blob(['﻿' + [head.map(cell).join(';'), ...body].join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `conciliacion-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
};

const EventFundsTab = ({ eventId, eventTitle }: { eventId: string; eventTitle: string; clubId?: string }) => {
    const [data, setData] = useState<FundsOverview | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [q, setQ] = useState('');
    const [filtro, setFiltro] = useState('pagadas');
    const [elegidas, setElegidas] = useState<string[]>([]);
    const [form, setForm] = useState<FundsRegistration[] | null>(null);
    const [verifying, setVerifying] = useState(false);
    const [msg, setMsg] = useState('');
    const [trFiltro, setTrFiltro] = useState('activos');

    const load = useCallback(async () => {
        try {
            setData(await fundsApi.overview(eventId));
            setError('');
        } catch (e: any) {
            setError(e?.status === 404 || e?.status === 403
                ? 'Tu acceso no incluye la información financiera de este evento («Gestionar pagos»).'
                : e?.message || 'No se pudo cargar la conciliación.');
        } finally { setLoading(false); }
    }, [eventId]);
    useEffect(() => { load(); }, [load]);

    const rows = useMemo(() => {
        const term = q.trim().toLowerCase();
        return (data?.registrations || []).filter(r => {
            if (filtro === 'pagadas' && r.payment.status !== 'confirmado') return false;
            if (filtro === 'sin_traslado' && !(r.payment.status === 'confirmado' && restanteDe(r) > 0.005)) return false;
            if (filtro === 'confirmado' && r.transferState !== 'confirmado') return false;
            if (!term) return true;
            return [r.code, r.name, r.email, r.clubName, r.payment.paymentIntentId].filter(Boolean).join(' ').toLowerCase().includes(term);
        }).sort((a, b) => new Date(b.payment.paidAt || b.createdAt).getTime() - new Date(a.payment.paidAt || a.createdAt).getTime());
    }, [data, q, filtro]);

    const seleccion = useMemo(() => (data?.registrations || []).filter(r => elegidas.includes(r.id)), [data, elegidas]);
    const monedaSel = seleccion[0]?.payment.currency;
    const transfers = useMemo(() => (data?.transfers || []).filter(t => trFiltro === 'todos' || (trFiltro === 'activos' ? t.active : !t.active)), [data, trFiltro]);

    if (loading) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-blue-600" /></div>;
    if (error || !data) {
        return <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}</div>;
    }

    const elegible = (r: FundsRegistration) => r.payment.status === 'confirmado' && restanteDe(r) > 0.005 && (!monedaSel || r.payment.currency === monedaSel);
    const toggle = (r: FundsRegistration) => setElegidas(list => list.includes(r.id) ? list.filter(x => x !== r.id) : [...list, r.id]);
    const verificar = async () => {
        setVerifying(true); setMsg('');
        try {
            const r = await fundsApi.verifyStripe(eventId);
            setMsg(`Verificación con Stripe: ${r.verificadas} de ${r.total} pago(s) verificados${r.errores ? `, ${r.errores} con error` : ''}${r.pendientes ? `, ${r.pendientes} quedan para otra pasada` : ''}.`);
            await load();
        } catch (e: any) { setMsg(e?.message || 'No se pudo verificar con Stripe.'); }
        finally { setVerifying(false); }
    };

    return (
        <div className="space-y-5">
            <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
                <div>
                    <h3 className="text-base font-bold text-gray-900">Conciliación de inscripciones</h3>
                    <p className="mt-0.5 text-xs text-gray-500">
                        Pagos de las inscripciones por Stripe y su traslado a la cuenta oficial del evento, con comprobante PDF, envío por correo e historial. Todo dentro de Eventos.
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={load} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700"><RefreshCw className="h-3.5 w-3.5" /> Actualizar</button>
                    <button type="button" onClick={verificar} disabled={verifying} className="inline-flex items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-800 disabled:opacity-50">
                        {verifying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />} Verificar pagos con Stripe
                    </button>
                    <button type="button" onClick={() => exportCsv(rows, eventTitle)} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700"><Download className="h-3.5 w-3.5" /> CSV</button>
                </div>
            </div>
            {msg && <p className="flex items-start gap-2 rounded-xl border border-blue-100 bg-blue-50 px-4 py-2 text-xs text-blue-900"><Info className="mt-0.5 h-4 w-4 shrink-0" /> {msg}</p>}

            <BeneficiaryConfig key={data.config?.updatedAt || 'nuevo'} eventId={eventId} config={data.config} canApprove={data.canApprove} onSaved={load} />

            {data.totals.length === 0
                ? <p className="rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-8 text-center text-sm text-gray-400">Este evento todavía no tiene pagos de inscripción.</p>
                : <div className="space-y-3">{data.totals.map(t => <CurrencyTotals key={t.currency} t={t} />)}</div>}

            {/* Inscripciones */}
            <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
                <div className="flex flex-col gap-2 border-b border-gray-100 p-3 md:flex-row md:items-center">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar participante, correo, código o referencia de Stripe…"
                            className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-xs outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <select value={filtro} onChange={e => setFiltro(e.target.value)} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs">
                        <option value="pagadas">Pagos confirmados</option>
                        <option value="sin_traslado">Con saldo por trasladar</option>
                        <option value="confirmado">Traslado confirmado</option>
                        <option value="todas">Todas las inscripciones</option>
                    </select>
                </div>
                {seleccion.length > 0 && (
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-sky-100 bg-sky-50 px-4 py-2 text-xs text-sky-900">
                        <span>{seleccion.length} inscripción(es) elegida(s) · {money(seleccion.reduce((s, r) => s + restanteDe(r), 0), monedaSel || 'USD')} por trasladar</span>
                        <div className="flex gap-2">
                            <button type="button" onClick={() => setElegidas([])} className="font-semibold text-sky-700">Limpiar</button>
                            <button type="button" onClick={() => setForm(seleccion)} className="inline-flex items-center gap-1.5 rounded-lg bg-rotary-blue px-3 py-1.5 font-bold text-white">
                                <ArrowRightLeft className="h-3.5 w-3.5" /> {seleccion.length > 1 ? 'Registrar traslado consolidado' : 'Registrar traslado'}
                            </button>
                        </div>
                    </div>
                )}
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                        <thead className="border-b border-gray-100 bg-gray-50 text-[10px] font-bold uppercase tracking-wider text-gray-500">
                            <tr>
                                <th className="p-3"></th>
                                <th className="p-3">Fecha</th>
                                <th className="p-3">Participante</th>
                                <th className="p-3">Inscripción</th>
                                <th className="p-3 text-right">Pagado</th>
                                <th className="p-3 text-right">Para el evento</th>
                                <th className="p-3">Pago</th>
                                <th className="p-3">Stripe</th>
                                <th className="p-3">Traslado</th>
                                <th className="p-3 text-center">Acción</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {rows.length === 0 ? (
                                <tr><td colSpan={10} className="p-8 text-center text-gray-400">Ninguna inscripción con este filtro.</td></tr>
                            ) : rows.map(r => {
                                const puede = elegible(r);
                                const marcada = elegidas.includes(r.id);
                                return (
                                    <tr key={r.id} className={marcada ? 'bg-sky-50/50' : 'hover:bg-gray-50/70'}>
                                        <td className="p-3">
                                            <button type="button" onClick={() => toggle(r)} disabled={!puede && !marcada}
                                                title={puede ? 'Elegir para un traslado' : 'Sin saldo por trasladar, sin pago confirmado u otra moneda'}
                                                className="disabled:cursor-not-allowed disabled:opacity-30">
                                                {marcada ? <CheckSquare className="h-4 w-4 text-sky-600" /> : <Square className="h-4 w-4 text-gray-300" />}
                                            </button>
                                        </td>
                                        <td className="whitespace-nowrap p-3 text-gray-600">{fecha(r.payment.paidAt || r.createdAt)}</td>
                                        <td className="p-3"><p className="font-semibold text-gray-900">{r.name || 'Participante'}</p><p className="text-[10px] text-gray-400">{r.email}</p></td>
                                        <td className="whitespace-nowrap p-3 font-mono text-[11px] font-bold">{r.code || '—'}</td>
                                        <td className="whitespace-nowrap p-3 text-right">{money(r.payment.charged, r.payment.currency)}</td>
                                        <td className="whitespace-nowrap p-3 text-right font-bold text-emerald-700">{money(r.payment.eventAmount, r.payment.currency)}</td>
                                        <td className="p-3"><span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${STATUS_CLS[r.payment.status === 'confirmado' ? 'confirmado' : r.payment.status] || STATUS_CLS.pendiente}`}>{r.payment.status === 'confirmado' ? 'Confirmado' : r.payment.status === 'reembolsado' ? 'Reembolsado' : r.payment.status === 'fallido' ? 'Fallido' : 'Pendiente'}</span></td>
                                        <td className="p-3 text-[10px]">{r.payment.stripe && !r.payment.stripe.error ? <span className="text-emerald-700">Verificado · comisión {money(r.payment.stripe.fee, r.payment.stripe.currency)}</span> : <span className="text-gray-400">Sin verificar</span>}</td>
                                        <td className="p-3"><span className={`whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-semibold ${STATUS_CLS[r.transferState] || STATUS_CLS.pendiente}`}>{REGISTRATION_TRANSFER_LABELS[r.transferState]}</span></td>
                                        <td className="whitespace-nowrap p-3 text-center">
                                            {r.payment.status === 'confirmado' && restanteDe(r) > 0.005 && (
                                                <button type="button" onClick={() => setForm([r])} className="rounded bg-gray-100 px-2 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-200">Registrar traslado</button>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Traslados */}
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <h4 className="text-sm font-bold text-gray-900">Traslados del evento ({data.transfers.length})</h4>
                    <select value={trFiltro} onChange={e => setTrFiltro(e.target.value)} className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs">
                        <option value="activos">Vigentes</option>
                        <option value="cerrados">Rechazados o revertidos</option>
                        <option value="todos">Todos</option>
                    </select>
                </div>
                {transfers.length === 0
                    ? <p className="rounded-xl border border-dashed border-gray-200 bg-white px-4 py-6 text-center text-xs text-gray-400">Todavía no hay traslados registrados.</p>
                    : transfers.map(t => (
                        <TransferCard key={t.id} eventId={eventId} transfer={t} canApprove={data.canApprove}
                            statusLabels={data.statusLabels} methods={data.methods} onChanged={load} />
                    ))}
            </div>

            {form && (
                <TransferFormModal eventId={eventId} config={data.config} registrations={form} methods={data.methods}
                    onClose={() => setForm(null)} onSaved={() => { setForm(null); setElegidas([]); load(); }} />
            )}
        </div>
    );
};

export default EventFundsTab;
