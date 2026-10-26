// ════════════════════════════════════════════════════════════════════════════
// «Conciliación de fondos» de un evento — v4.1248
//
// ⚠️ NO ES UN SEGUNDO SISTEMA DE CONCILIACIÓN. Es la Bóveda (`/financial/wallet`)
// acotada a los pagos de las inscripciones de ESTE evento, con las MISMAS
// piezas que usan las campañas de contribución (la del terremoto) y la Feria:
//
//   · `BulkDisbursementBar`   — registrar el traslado al beneficiario, con su
//                               comprobante PDF y el aviso por correo.
//   · `BulkReconciliationBar` — conciliar lo ya trasladado y mandar el
//     + `ResendNoticeModal`     comprobante (PDF + adjuntos) por correo, con
//                               vista previa e historial.
//   · `DisbursementSection`   — la ficha de un pago: su ciclo de vida, sus
//                               traslados, comprobantes, reenvío y reverso.
//
// Lo único propio está en `server/lib/eventFundsSpec.js`: qué inscripción
// corresponde a qué pago (por identificador de Stripe) y los cinco estados
// financieros de cada pago, que NO se funden en un «Pagado».
// ════════════════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import {
    Wallet, RefreshCw, Loader2, AlertTriangle, Search, Download, CheckSquare, Square,
    FileText, History, Landmark, ShieldCheck, Send, ChevronDown, ChevronUp, Info,
} from 'lucide-react';
import BulkDisbursementBar, { type Elegible } from '../wallet/BulkDisbursementBar';
import BulkReconciliationBar from '../wallet/BulkReconciliationBar';
import ResendNoticeModal from '../wallet/ResendNoticeModal';
import DisbursementSection from '../wallet/DisbursementSection';
import { selectionClassOf } from '../../../lib/reconciliationSpec';
import { FUND_STATE_LABELS } from '../../../../server/lib/eventFundsSpec.js';
import type { FundStates, FundTotals } from '../../../../server/lib/eventFundsSpec.js';

const API = import.meta.env.VITE_API_URL || '/api';
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('rotary_token')}` });

interface RegistrationInfo {
    id: string; code: string | null; name: string | null; email: string | null; status: string | null;
    category: string | null; clubName: string | null; district: string | null; paidAt: string | null;
}
interface FundItem {
    id: string;
    providerRef: string | null;
    amount: number;
    grossAmount: number;
    fee: number;
    currency: string;
    status: string;
    bucket: string;
    financialBucket: string;
    availableOn: string | null;
    stripeBalanceTxId: string | null;
    disbursedAmount: number;
    rawPayload: Record<string, any>;
    createdAt: string;
    registration: RegistrationInfo | null;
    states: FundStates;
}
interface EventScope {
    event: { id: string; title: string };
    items: FundItem[];
    totals: FundTotals[];
    coverage: {
        registrations: number; paid: number; withMovement: number;
        sinMovimiento: RegistrationInfo[]; sinReferencia: RegistrationInfo[];
    };
    payoutsNote: string;
}
interface Notice {
    id: string; scope: string; paymentIds: string[] | null; beneficiary: string | null; currency: string;
    count: number; netAmount: number; emails: string[] | null; state: string | null; error: string | null;
    sentAt: string | null; createdAt: string;
}
interface AuditEvent {
    id: string; paymentId: string; kind: string; toState: string | null; actorLabel: string | null;
    reference: string | null; note: string | null; occurredAt: string; description?: string;
}

const PAGE = 25;

const money = (n: number, c: string) => {
    try {
        return new Intl.NumberFormat('es-CO', {
            style: 'currency', currency: c,
            minimumFractionDigits: c === 'COP' ? 0 : 2,
            maximumFractionDigits: c === 'COP' ? 0 : 2,
        }).format(n || 0);
    } catch { return `${(n || 0).toFixed(2)} ${c}`; }
};
const fecha = (v: string | null | undefined) => {
    if (!v) return '—';
    try { return new Date(v).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' }); }
    catch { return '—'; }
};
const fechaHora = (v: string | null | undefined) => {
    if (!v) return '—';
    try { return new Date(v).toLocaleString('es-CO', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
    catch { return '—'; }
};
const errorDe = (e: unknown, fallback: string) => {
    const err = e as { response?: { status?: number; data?: { error?: string } } };
    if (err?.response?.status === 401) return 'Tu sesión venció. Vuelve a entrar.';
    if (err?.response?.status === 403) return 'Tu acceso no incluye la información financiera de este sitio.';
    return err?.response?.data?.error || fallback;
};

/** Colores de cada valor de estado. */
const STATE_CLS: Record<string, string> = {
    confirmado: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    verificado: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    disponible: 'bg-sky-50 text-sky-700 border-sky-200',
    enviado: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    parcial: 'bg-amber-50 text-amber-800 border-amber-200',
    pendiente: 'bg-gray-50 text-gray-600 border-gray-200',
    por_liberar: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    no_registrado: 'bg-gray-50 text-gray-600 border-gray-200',
    reembolsado: 'bg-rose-50 text-rose-700 border-rose-200',
    fallido: 'bg-red-50 text-red-700 border-red-200',
    disputa: 'bg-red-50 text-red-700 border-red-200',
    error: 'bg-red-50 text-red-700 border-red-200',
    no_aplica: 'bg-white text-gray-400 border-gray-100',
};

const StateChip = ({ group, value }: { group: keyof typeof FUND_STATE_LABELS; value: string }) => (
    <span className={`inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-semibold ${STATE_CLS[value] || STATE_CLS.pendiente}`}>
        {(FUND_STATE_LABELS[group] as Record<string, string>)[value] || value}
    </span>
);

const Metric = ({ label, value, hint, tone = 'text-gray-900' }: { label: string; value: string; hint?: string; tone?: string }) => (
    <div className="rounded-xl border border-gray-100 bg-white px-4 py-3">
        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{label}</p>
        <p className={`mt-1 text-lg font-bold ${tone}`}>{value}</p>
        {hint && <p className="text-[11px] text-gray-400">{hint}</p>}
    </div>
);

/** Los totales de UNA moneda. Nunca se suman COP y USD. */
const CurrencyTotals = ({ t }: { t: FundTotals }) => (
    <div className="rounded-2xl border border-gray-200 bg-gray-50/60 p-4">
        <p className="mb-3 text-xs font-bold uppercase tracking-wider text-gray-500">{t.currency} · {t.pagos} pago(s)</p>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Metric label="Recaudo bruto" value={money(t.bruto, t.currency)} />
            <Metric label="Comisiones" value={`−${money(t.comisiones, t.currency)}`} tone="text-rose-600" hint="Stripe + plataforma" />
            <Metric label="Recaudo neto" value={money(t.neto, t.currency)} tone="text-emerald-700" />
            <Metric label="Reembolsado" value={money(t.reembolsado, t.currency)} />
            <Metric label="En liquidación (Stripe)" value={money(t.enLiquidacion, t.currency)} hint="Todavía retenido por el procesador" />
            <Metric label="Disponible para trasladar" value={money(t.disponible, t.currency)} tone="text-sky-700" />
            <Metric label="Trasladado al beneficiario" value={money(t.trasladado, t.currency)} tone="text-emerald-700" hint="Sólo traslados confirmados" />
            <Metric label="Pendiente de traslado" value={money(t.pendienteTraslado, t.currency)} tone="text-amber-700" />
        </div>
        <p className="mt-3 text-[11px] text-gray-500">
            {t.verificados} de {t.pagos} pago(s) atados a su movimiento en Stripe · {t.comprobantesEnviados} con comprobante enviado
        </p>
    </div>
);

/** CSV con BOM y punto y coma (regla de v4.850: Excel lo abre bien). */
const exportCsv = (items: FundItem[], eventTitle: string) => {
    const head = ['Fecha', 'Inscripción', 'Participante', 'Correo', 'Club', 'Moneda', 'Bruto', 'Comisión', 'Neto',
        'Trasladado', 'Pago', 'Stripe', 'Liquidación', 'Traslado', 'Comprobante', 'Referencia Stripe'];
    const cell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = items.map(it => [
        fecha(it.registration?.paidAt || it.createdAt), it.registration?.code || '', it.registration?.name || it.rawPayload?.participantName || '',
        it.registration?.email || '', it.registration?.clubName || it.rawPayload?.clubName || '', it.currency,
        it.grossAmount, it.fee, it.amount, it.disbursedAmount,
        FUND_STATE_LABELS.pago[it.states.pago], FUND_STATE_LABELS.stripe[it.states.stripe],
        FUND_STATE_LABELS.liquidacion[it.states.liquidacion], FUND_STATE_LABELS.traslado[it.states.traslado],
        FUND_STATE_LABELS.comprobante[it.states.comprobante], it.providerRef || '',
    ].map(cell).join(';'));
    const blob = new Blob(['\ufeff' + [head.map(cell).join(';'), ...rows].join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `conciliacion-${eventTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
};

type SortKey = 'fecha' | 'neto' | 'participante';

const EventFundsTab = ({ eventId, eventTitle, clubId }: { eventId: string; eventTitle: string; clubId?: string }) => {
    const [scope, setScope] = useState<EventScope | null>(null);
    const [notices, setNotices] = useState<Notice[]>([]);
    const [audit, setAudit] = useState<AuditEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState<'' | 'sync' | 'rebuild-preview' | 'rebuild'>('');
    const [mensaje, setMensaje] = useState('');
    const [q, setQ] = useState('');
    const [moneda, setMoneda] = useState('todas');
    const [traslado, setTraslado] = useState('todos');
    const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'fecha', dir: -1 });
    const [page, setPage] = useState(0);
    const [elegidos, setElegidos] = useState<Record<string, Elegible>>({});
    const [expanded, setExpanded] = useState<string | null>(null);
    const [resendIds, setResendIds] = useState<string[] | null>(null);
    const [showHistory, setShowHistory] = useState(false);

    const clubQ = clubId ? `&clubId=${encodeURIComponent(clubId)}` : '';

    const load = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        setError('');
        const qs = `eventId=${encodeURIComponent(eventId)}${clubQ}`;
        const [w, n, a] = await Promise.allSettled([
            axios.get(`${API}/financial/wallet?${qs}`, { headers: authHeaders() }),
            axios.get(`${API}/financial/wallet/notices?${qs}`, { headers: authHeaders() }),
            axios.get(`${API}/financial/wallet/audit-events?${qs}`, { headers: authHeaders() }),
        ]);
        if (w.status === 'fulfilled') setScope(w.value.data?.eventScope || null);
        else setError(errorDe(w.reason, 'No se pudo cargar la conciliación del evento.'));
        if (n.status === 'fulfilled') setNotices(n.value.data?.notices || []);
        if (a.status === 'fulfilled') setAudit(a.value.data?.events || []);
        setLoading(false);
    }, [eventId, clubQ]);

    useEffect(() => { load(); }, [load]);

    const items = useMemo(() => scope?.items || [], [scope]);
    const monedas = useMemo(() => [...new Set(items.map(i => i.currency))], [items]);

    const filtrados = useMemo(() => {
        const term = q.trim().toLowerCase();
        const out = items.filter(it => {
            if (moneda !== 'todas' && it.currency !== moneda) return false;
            if (traslado !== 'todos' && it.states.traslado !== traslado) return false;
            if (!term) return true;
            return [it.registration?.code, it.registration?.name, it.registration?.email, it.registration?.clubName,
                it.rawPayload?.participantName, it.rawPayload?.clubName, it.providerRef, it.id]
                .filter(Boolean).join(' ').toLowerCase().includes(term);
        });
        const valor = (it: FundItem) => sort.key === 'neto' ? it.amount
            : sort.key === 'participante' ? (it.registration?.name || it.rawPayload?.participantName || '').toLowerCase()
                : new Date(it.registration?.paidAt || it.createdAt).getTime();
        return out.sort((a, b) => {
            const va = valor(a); const vb = valor(b);
            return (va < vb ? -1 : va > vb ? 1 : 0) * sort.dir;
        });
    }, [items, q, moneda, traslado, sort]);

    useEffect(() => { setPage(0); }, [q, moneda, traslado, sort]);

    const pagina = filtrados.slice(page * PAGE, (page + 1) * PAGE);
    const paginas = Math.max(1, Math.ceil(filtrados.length / PAGE));

    const seleccion = useMemo(() => {
        const lista = Object.values(elegidos);
        const trasladados = lista.filter(e => e.clase === 'trasladado');
        const disponibles = lista.filter(e => e.clase === 'disponible');
        return { disponibles, trasladados, mezclada: disponibles.length > 0 && trasladados.length > 0 };
    }, [elegidos]);

    const elegibleDe = (it: FundItem): Elegible | null => {
        const restante = Math.max(0, it.amount - (it.disbursedAmount || 0));
        const clase = selectionClassOf({ id: it.id, status: it.status, bucket: it.bucket, availableOn: it.availableOn }, restante);
        if (clase === 'ninguna') return null;
        return {
            paymentId: it.id, restante, currency: it.currency, clase,
            titulo: [it.registration?.code, it.registration?.name || it.rawPayload?.participantName].filter(Boolean).join(' · ') || `#${it.id.slice(-6)}`,
        };
    };
    const toggle = (it: FundItem) => {
        const e = elegibleDe(it);
        if (!e) return;
        setElegidos(prev => {
            const next = { ...prev };
            if (next[it.id]) delete next[it.id]; else next[it.id] = e;
            return next;
        });
    };

    const ordenar = (key: SortKey) => setSort(s => s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: key === 'participante' ? 1 : -1 });

    const sincronizar = async () => {
        setBusy('sync'); setMensaje('');
        try {
            const { data } = await axios.post(`${API}/financial/wallet/sync-stripe`, { ...(clubId ? { clubId } : {}), force: true }, { headers: authHeaders() });
            setMensaje(`Verificación con Stripe completada: ${data?.synced ?? 0} de ${data?.total ?? 0} movimiento(s) del sitio actualizados.`);
            await load(true);
        } catch (e) {
            setMensaje(errorDe(e, 'No se pudo verificar con Stripe.'));
        } finally { setBusy(''); }
    };

    const registrarFaltantes = async (apply: boolean) => {
        setBusy(apply ? 'rebuild' : 'rebuild-preview'); setMensaje('');
        try {
            const { data } = await axios.post(`${API}/financial/wallet/rebuild-collections`,
                { ...(clubId ? { clubId } : {}), eventId, apply }, { headers: authHeaders() });
            const fallas = Object.entries(data?.noReconstruidos || {}).map(([k, v]: [string, any]) => `${k} (${v.total})`).join(', ');
            setMensaje(apply
                ? `Se registraron ${data?.reconstruidos ?? 0} movimiento(s) en la Bóveda.${fallas ? ` Sin registrar: ${fallas}.` : ''}`
                : `Ensayo: se registrarían ${data?.reconstruidos ?? 0} movimiento(s).${fallas ? ` No se podrían registrar: ${fallas}.` : ''} Nada se escribió todavía.`);
            if (apply) await load(true);
        } catch (e) {
            setMensaje(errorDe(e, 'No se pudieron registrar los movimientos.'));
        } finally { setBusy(''); }
    };

    const abrirDocumento = async (n: Notice) => {
        try {
            const { data } = await axios.get(`${API}/financial/wallet/notices/${n.id}/document${clubId ? `?clubId=${encodeURIComponent(clubId)}` : ''}`, { headers: authHeaders() });
            if (data?.url) window.open(data.url, '_blank', 'noopener');
        } catch (e) {
            setMensaje(errorDe(e, 'No se pudo abrir el comprobante.'));
        }
    };

    if (loading) {
        return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-blue-600" /></div>;
    }
    if (error) {
        return (
            <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
            </div>
        );
    }

    const cov = scope?.coverage;
    const todosPagina = pagina.map(elegibleDe).filter(Boolean) as Elegible[];
    const paginaMarcada = todosPagina.length > 0 && todosPagina.every(e => elegidos[e.paymentId]);

    return (
        <div className="space-y-6">
            {/* Cabecera */}
            <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
                <div>
                    <h3 className="flex items-center gap-2 text-base font-bold text-gray-900"><Wallet className="h-5 w-5 text-rotary-blue" /> Conciliación de fondos</h3>
                    <p className="mt-0.5 text-xs text-gray-500">
                        Los pagos de las inscripciones de este evento procesados por Stripe, con las herramientas de conciliación de la Bóveda: registrar el traslado al beneficiario, adjuntar el comprobante PDF y enviarlo por correo.
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => load(true)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50">
                        <RefreshCw className="h-3.5 w-3.5" /> Actualizar
                    </button>
                    <button type="button" onClick={sincronizar} disabled={!!busy}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-800 hover:bg-sky-100 disabled:opacity-50">
                        {busy === 'sync' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />} Verificar con Stripe
                    </button>
                    <button type="button" onClick={() => exportCsv(filtrados, eventTitle)} disabled={filtrados.length === 0}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                        <Download className="h-3.5 w-3.5" /> CSV
                    </button>
                </div>
            </div>

            {mensaje && (
                <div className="flex items-start gap-2 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs text-blue-900">
                    <Info className="mt-0.5 h-4 w-4 shrink-0" /> <span>{mensaje}</span>
                </div>
            )}

            {/* Cobertura: qué inscripciones pagadas tienen movimiento en la Bóveda */}
            {cov && (
                <div className="rounded-2xl border border-gray-200 bg-white p-4 text-xs text-gray-600">
                    <p>
                        <strong className="text-gray-900">{cov.paid}</strong> inscripción(es) pagada(s) de {cov.registrations} ·{' '}
                        <strong className="text-gray-900">{cov.withMovement}</strong> con movimiento en la Bóveda.
                    </p>
                    {cov.sinMovimiento.length > 0 && (
                        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-900">
                            <p className="font-semibold">{cov.sinMovimiento.length} inscripción(es) pagada(s) por Stripe todavía sin movimiento en la Bóveda</p>
                            <p className="mt-0.5">Mientras no tengan movimiento no se pueden trasladar ni conciliar. Se registran con el mismo cálculo de la Bóveda, por su referencia de Stripe.</p>
                            <p className="mt-1 text-[11px]">{cov.sinMovimiento.slice(0, 8).map(r => r.code || r.name).join(' · ')}{cov.sinMovimiento.length > 8 ? ' …' : ''}</p>
                            <div className="mt-2 flex flex-wrap gap-2">
                                <button type="button" onClick={() => registrarFaltantes(false)} disabled={!!busy}
                                    className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 font-semibold hover:bg-amber-100 disabled:opacity-50">
                                    {busy === 'rebuild-preview' ? 'Revisando…' : '1. Revisar (ensayo)'}
                                </button>
                                <button type="button" onClick={() => registrarFaltantes(true)} disabled={!!busy}
                                    className="rounded-lg bg-amber-600 px-3 py-1.5 font-semibold text-white hover:bg-amber-700 disabled:opacity-50">
                                    {busy === 'rebuild' ? 'Registrando…' : '2. Registrar movimientos'}
                                </button>
                            </div>
                        </div>
                    )}
                    {cov.sinReferencia.length > 0 && (
                        <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50 p-3">
                            <p className="font-semibold text-gray-800">{cov.sinReferencia.length} inscripción(es) pagada(s) sin referencia de Stripe</p>
                            <p className="mt-0.5">Se marcaron como pagadas por fuera de la pasarela. No hay un identificador que las ate a un movimiento, así que no se asocian automáticamente a ninguno: revísalas a mano.</p>
                            <p className="mt-1 text-[11px]">{cov.sinReferencia.slice(0, 8).map(r => r.code || r.name).join(' · ')}{cov.sinReferencia.length > 8 ? ' …' : ''}</p>
                        </div>
                    )}
                </div>
            )}

            {/* Totales por moneda */}
            {(scope?.totals || []).length === 0 ? (
                <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-10 text-center text-sm text-gray-400">
                    Este evento todavía no tiene pagos por Stripe en la Bóveda.
                </div>
            ) : (
                <div className="space-y-3">
                    {scope!.totals.map(t => <CurrencyTotals key={t.currency} t={t} />)}
                    <p className="text-[11px] text-gray-400">{scope!.payoutsNote} Cada moneda se concilia por separado: COP y USD nunca se suman.</p>
                </div>
            )}

            {/* Barras de acción en bloque — las mismas de la Bóveda */}
            {seleccion.mezclada && (
                <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900">
                    La selección mezcla pagos por trasladar y pagos ya trasladados: son dos acciones distintas (registrar un traslado mueve dinero; enviar la conciliación no). Quédate con una de las dos clases.
                </p>
            )}
            {seleccion.disponibles.length > 0 && !seleccion.mezclada && (
                <BulkDisbursementBar
                    elegidos={seleccion.disponibles}
                    clubId={clubId}
                    onLimpiar={() => setElegidos({})}
                    onHecho={() => { setElegidos({}); load(true); }}
                    onRecargar={() => load(true)}
                />
            )}
            {seleccion.trasladados.length > 0 && !seleccion.mezclada && (
                <BulkReconciliationBar
                    elegidos={seleccion.trasladados}
                    clubId={clubId}
                    onLimpiar={() => setElegidos({})}
                    onRecargar={() => load(true)}
                />
            )}

            {/* Tabla de movimientos */}
            {items.length > 0 && (
                <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
                    <div className="flex flex-col gap-2 border-b border-gray-100 p-3 md:flex-row md:items-center">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por participante, correo, código, club o referencia de Stripe…"
                                className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-xs outline-none focus:ring-2 focus:ring-blue-500" />
                        </div>
                        <select value={moneda} onChange={e => setMoneda(e.target.value)} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs">
                            <option value="todas">Todas las monedas</option>
                            {monedas.map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                        <select value={traslado} onChange={e => setTraslado(e.target.value)} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs">
                            <option value="todos">Traslado: todos</option>
                            {Object.entries(FUND_STATE_LABELS.traslado).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </select>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                            <thead className="border-b border-gray-100 bg-gray-50 text-[10px] font-bold uppercase tracking-wider text-gray-500">
                                <tr>
                                    <th className="p-3">
                                        <button type="button" aria-label="Seleccionar la página"
                                            onClick={() => setElegidos(prev => {
                                                const next = { ...prev };
                                                for (const e of todosPagina) { if (paginaMarcada) delete next[e.paymentId]; else next[e.paymentId] = e; }
                                                return next;
                                            })}>
                                            {paginaMarcada ? <CheckSquare className="h-4 w-4 text-sky-600" /> : <Square className="h-4 w-4 text-gray-300" />}
                                        </button>
                                    </th>
                                    <th className="cursor-pointer p-3" onClick={() => ordenar('fecha')}>Fecha {sort.key === 'fecha' ? (sort.dir === 1 ? '↑' : '↓') : ''}</th>
                                    <th className="cursor-pointer p-3" onClick={() => ordenar('participante')}>Participante {sort.key === 'participante' ? (sort.dir === 1 ? '↑' : '↓') : ''}</th>
                                    <th className="p-3">Club</th>
                                    <th className="p-3">Inscripción</th>
                                    <th className="p-3 text-right">Bruto</th>
                                    <th className="p-3 text-right">Comisión</th>
                                    <th className="cursor-pointer p-3 text-right" onClick={() => ordenar('neto')}>Neto {sort.key === 'neto' ? (sort.dir === 1 ? '↑' : '↓') : ''}</th>
                                    <th className="p-3">Pago</th>
                                    <th className="p-3">Stripe</th>
                                    <th className="p-3">Liquidación</th>
                                    <th className="p-3">Traslado</th>
                                    <th className="p-3">Comprobante</th>
                                    <th className="p-3 text-center">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {pagina.length === 0 ? (
                                    <tr><td colSpan={14} className="p-8 text-center text-gray-400">Ningún pago coincide con estos filtros.</td></tr>
                                ) : pagina.map(it => {
                                    const elegible = elegibleDe(it);
                                    const marcado = !!elegidos[it.id];
                                    return (
                                        <tr key={it.id} className={marcado ? 'bg-sky-50/50' : 'hover:bg-gray-50/70'}>
                                            <td className="p-3">
                                                <button type="button" onClick={() => toggle(it)} disabled={!elegible}
                                                    title={elegible ? undefined : 'Todavía no se puede trasladar ni conciliar (en liquidación, reembolsado o sin saldo).'}
                                                    className="disabled:cursor-not-allowed disabled:opacity-30">
                                                    {marcado ? <CheckSquare className="h-4 w-4 text-sky-600" /> : <Square className="h-4 w-4 text-gray-300" />}
                                                </button>
                                            </td>
                                            <td className="whitespace-nowrap p-3 text-gray-600">{fecha(it.registration?.paidAt || it.createdAt)}</td>
                                            <td className="p-3">
                                                <p className="font-semibold text-gray-900">{it.registration?.name || it.rawPayload?.participantName || 'Participante'}</p>
                                                <p className="text-[10px] text-gray-400">{it.registration?.email || '—'}</p>
                                            </td>
                                            <td className="p-3 text-gray-600">
                                                <p>{it.registration?.clubName || it.rawPayload?.clubName || '—'}</p>
                                                {it.registration?.district && <p className="text-[10px] text-gray-400">D. {it.registration.district}</p>}
                                            </td>
                                            <td className="whitespace-nowrap p-3 font-mono text-[11px] font-bold text-gray-700">{it.registration?.code || '—'}</td>
                                            <td className="whitespace-nowrap p-3 text-right font-semibold text-gray-900">{money(it.grossAmount, it.currency)}</td>
                                            <td className="whitespace-nowrap p-3 text-right text-rose-600">−{money(it.fee, it.currency)}</td>
                                            <td className="whitespace-nowrap p-3 text-right font-bold text-emerald-700">{money(it.amount, it.currency)}</td>
                                            <td className="p-3"><StateChip group="pago" value={it.states.pago} /></td>
                                            <td className="p-3"><StateChip group="stripe" value={it.states.stripe} /></td>
                                            <td className="p-3"><StateChip group="liquidacion" value={it.states.liquidacion} /></td>
                                            <td className="p-3">
                                                <StateChip group="traslado" value={it.states.traslado} />
                                                {it.disbursedAmount > 0 && <p className="mt-0.5 text-[10px] text-gray-400">{money(it.disbursedAmount, it.currency)}</p>}
                                            </td>
                                            <td className="p-3"><StateChip group="comprobante" value={it.states.comprobante} /></td>
                                            <td className="whitespace-nowrap p-3 text-center">
                                                <div className="flex flex-col items-center gap-1">
                                                    {/* v4.1249 — La puerta directa al comprobante, como
                                                        «Ver traslado y conciliación» en la Bóveda: marcar
                                                        la casilla para ver la barra no se descubría. */}
                                                    {(it.states.traslado === 'confirmado' || it.states.traslado === 'parcial') && (
                                                        <button type="button" onClick={() => setResendIds([it.id])}
                                                            className="inline-flex items-center gap-1 rounded border border-violet-200 bg-violet-50 px-2 py-1 text-[11px] font-semibold text-violet-800 hover:border-violet-400">
                                                            <Send className="h-3 w-3" /> Enviar comprobante
                                                        </button>
                                                    )}
                                                    <button type="button" onClick={() => setExpanded(expanded === it.id ? null : it.id)}
                                                        className="rounded bg-gray-100 px-2 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-200">
                                                        {expanded === it.id ? 'Ocultar' : it.states.traslado === 'no_registrado' ? 'Registrar traslado' : 'Ver movimiento'}
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                    {paginas > 1 && (
                        <div className="flex items-center justify-between border-t border-gray-100 px-3 py-2 text-xs text-gray-500">
                            <span>{filtrados.length} pago(s) · página {page + 1} de {paginas}</span>
                            <div className="flex gap-2">
                                <button type="button" disabled={page === 0} onClick={() => setPage(p => p - 1)} className="rounded border border-gray-200 px-2 py-1 disabled:opacity-40">Anterior</button>
                                <button type="button" disabled={page + 1 >= paginas} onClick={() => setPage(p => p + 1)} className="rounded border border-gray-200 px-2 py-1 disabled:opacity-40">Siguiente</button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Ficha del movimiento — la misma de la Bóveda */}
            {expanded && (() => {
                const it = items.find(i => i.id === expanded);
                if (!it) return null;
                return (
                    <div className="rounded-2xl border border-gray-300 bg-gray-50 p-5">
                        <div className="mb-4 flex items-start justify-between gap-3 border-b border-gray-200 pb-3">
                            <div>
                                <h4 className="flex items-center gap-2 text-sm font-bold text-gray-900"><Landmark className="h-4 w-4 text-sky-700" /> {it.registration?.code || 'Movimiento'} · {it.registration?.name || it.rawPayload?.participantName || ''}</h4>
                                <p className="mt-1 text-[11px] text-gray-500">
                                    Referencia Stripe: <span className="font-mono">{it.providerRef || '—'}</span>
                                    {it.stripeBalanceTxId && <> · Balance transaction: <span className="font-mono">{it.stripeBalanceTxId}</span></>}
                                    {it.registration?.category && <> · {it.registration.category}</>}
                                </p>
                            </div>
                            <button type="button" onClick={() => setExpanded(null)} className="text-xs font-semibold text-gray-400 hover:text-gray-600">Cerrar ✕</button>
                        </div>
                        {(it.states.traslado === 'confirmado' || it.states.traslado === 'parcial') && (
                            <div className="mb-3 rounded-lg border border-violet-100 bg-violet-50/60 p-3">
                                <button type="button" onClick={() => setResendIds([it.id])}
                                    className="inline-flex items-center gap-1.5 rounded-lg border border-violet-300 bg-white px-3 py-2 text-xs font-bold text-violet-800 hover:border-violet-500">
                                    <Send className="h-3.5 w-3.5" /> Enviar comprobante de traslado
                                </button>
                                <p className="mt-1.5 text-[11px] text-violet-900/80">El comprobante de la conciliación (PDF) por correo, con adjuntos opcionales, vista previa e historial.</p>
                            </div>
                        )}
                        <DisbursementSection paymentId={it.id} clubId={clubId} netAmount={it.amount} currency={it.currency} />
                    </div>
                );
            })()}

            {/* Comprobantes enviados */}
            <div className="rounded-2xl border border-gray-200 bg-white">
                <div className="border-b border-gray-100 px-4 py-3">
                    <h4 className="flex items-center gap-2 text-sm font-bold text-gray-900"><FileText className="h-4 w-4 text-sky-700" /> Comprobantes de conciliación enviados</h4>
                    <p className="text-[11px] text-gray-500">«Enviado» significa que el proveedor de correo aceptó el mensaje; no confirma que haya llegado a la bandeja.</p>
                </div>
                {notices.length === 0 ? (
                    <p className="px-4 py-6 text-center text-xs text-gray-400">Todavía no se ha enviado ningún comprobante de este evento.</p>
                ) : (
                    <div className="divide-y divide-gray-50">
                        {notices.map(n => (
                            <div key={n.id} className="flex flex-col gap-2 px-4 py-3 text-xs md:flex-row md:items-center md:justify-between">
                                <div>
                                    <p className="font-semibold text-gray-900">
                                        {n.beneficiary || 'Beneficiario'} · {money(Number(n.netAmount) || 0, n.currency)} · {n.count} pago(s)
                                        {n.state && <span className={`ml-2 rounded-full border px-2 py-0.5 text-[10px] ${STATE_CLS[n.state === 'fallido' ? 'error' : 'enviado'] || ''}`}>{n.state}</span>}
                                    </p>
                                    <p className="text-[11px] text-gray-500">
                                        {fechaHora(n.sentAt || n.createdAt)}{n.emails?.length ? ` · ${n.emails.join(', ')}` : ''}{n.error ? ` · ${n.error}` : ''}
                                    </p>
                                </div>
                                <div className="flex gap-2">
                                    <button type="button" onClick={() => abrirDocumento(n)}
                                        className="inline-flex items-center gap-1 rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 font-semibold text-sky-700 hover:bg-sky-100">
                                        <Download className="h-3.5 w-3.5" /> Ver PDF
                                    </button>
                                    {n.paymentIds?.length ? (
                                        <button type="button" onClick={() => setResendIds(n.paymentIds || [])}
                                            className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 font-semibold text-gray-700 hover:bg-gray-50">
                                            <Send className="h-3.5 w-3.5" /> Reenviar
                                        </button>
                                    ) : null}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Historial */}
            <div className="rounded-2xl border border-gray-200 bg-white">
                <button type="button" onClick={() => setShowHistory(v => !v)}
                    className="flex w-full items-center justify-between px-4 py-3 text-left">
                    <span className="flex items-center gap-2 text-sm font-bold text-gray-900"><History className="h-4 w-4 text-sky-700" /> Historial de movimientos ({audit.length})</span>
                    {showHistory ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                </button>
                {showHistory && (
                    audit.length === 0 ? (
                        <p className="border-t border-gray-100 px-4 py-6 text-center text-xs text-gray-400">Sin eventos registrados todavía.</p>
                    ) : (
                        <div className="divide-y divide-gray-50 border-t border-gray-100">
                            {audit.map(ev => (
                                <div key={ev.id} className="px-4 py-2.5 text-xs">
                                    <p className="text-gray-800"><strong>{ev.kind}</strong>{ev.toState ? ` → ${ev.toState}` : ''} · {ev.description || ''}</p>
                                    <p className="text-[11px] text-gray-500">
                                        {fechaHora(ev.occurredAt)}{ev.actorLabel ? ` · ${ev.actorLabel}` : ''}{ev.reference ? ` · Ref. ${ev.reference}` : ''}{ev.note ? ` · ${ev.note}` : ''}
                                    </p>
                                </div>
                            ))}
                        </div>
                    )
                )}
            </div>

            {resendIds && (
                <ResendNoticeModal
                    paymentIds={resendIds}
                    clubId={clubId}
                    onCerrar={() => setResendIds(null)}
                    onEnviado={() => load(true)}
                />
            )}
        </div>
    );
};

export default EventFundsTab;
