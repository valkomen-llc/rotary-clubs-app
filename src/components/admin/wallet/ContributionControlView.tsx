/**
 * «CONTROL Y JUSTIFICACIÓN DE APORTES» — una pestaña de la Bóveda.
 *
 * v4.1265 — Pedido del Distrito 4281 para la Secretaría Digital 2026-2027.
 * Responde, aporte por aporte: quién, cuándo, cuánto, a qué destino, si Stripe
 * lo confirmó, si ya está disponible, si se trasladó, a quién y si hay
 * comprobante del traslado.
 *
 * ⚠️ NO ES UN MÓDULO PARALELO. Recibe los MISMOS aportes y desembolsos que
 * pinta «Aportes recibidos» —la misma respuesta de `/financial/donations`, con
 * el período y el destino de la barra de la Bóveda ya aplicados por el
 * servidor— y los CLASIFICA con `contributionControl.ts`, que es puro y está
 * probado. El detalle de cada aporte es `DisbursementSection`, el mismo de la
 * ficha: su historial sale de la base, no se compone acá.
 *
 * ⚠️ NO MUEVE DINERO. No hay un solo botón que escriba: el detalle se monta en
 * `soloLectura` para todos —quien administra registra los traslados desde la
 * pestaña de siempre—.
 */
import { Fragment, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, FileSpreadsheet, FileText, Loader2, Search, ShieldCheck } from 'lucide-react';
import DisbursementSection from './DisbursementSection';
import {
    filasDeControl, indicadoresDe, filtrarControl, monedasDe, informeControl,
    ESTADOS_PAGO, ESTADOS_TRASLADO, TODOS,
    type AporteControl, type DesembolsoControl, type FilaControl, type InformeControl,
} from '../../../lib/contributionControl';
import { formatMoney } from '../../../lib/locale';

const money = (n: number, c: string) => formatMoney(Number(n || 0), c || 'USD');
const fecha = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString('es-CO', { timeZone: 'America/Bogota', day: 'numeric', month: 'short', year: 'numeric' }) : '—';

const COLOR_PAGO: Record<string, string> = {
    procesando: 'bg-amber-50 text-amber-800 ring-amber-200',
    confirmado: 'bg-sky-50 text-sky-800 ring-sky-200',
    disponible: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
    reembolsado: 'bg-gray-100 text-gray-600 ring-gray-200',
    fallido: 'bg-red-50 text-red-700 ring-red-200',
    sin_movimiento: 'bg-gray-100 text-gray-600 ring-gray-200',
};
const COLOR_TRASLADO: Record<string, string> = {
    trasladado: 'bg-violet-50 text-violet-800 ring-violet-200',
    parcial: 'bg-amber-50 text-amber-800 ring-amber-200',
    pendiente: 'bg-orange-50 text-orange-800 ring-orange-200',
    no_disponible: 'bg-gray-50 text-gray-600 ring-gray-200',
    no_aplica: 'bg-gray-50 text-gray-500 ring-gray-200',
};
const COLOR_COMPROBANTE: Record<string, string> = {
    con_soporte: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
    pendiente: 'bg-amber-50 text-amber-800 ring-amber-300',
    sin_traslado: 'bg-gray-50 text-gray-500 ring-gray-200',
};

/**
 * La cadena de la trazabilidad, como la pidió el Distrito: Origen → Stripe →
 * Disponibilidad → Transferencia → Beneficiario → Comprobante. Cada paso se
 * marca SÓLO con su propio dato: un pago confirmado no enciende «Transferencia».
 */
function Trazabilidad({ f }: { f: FilaControl }) {
    const pagoOk = f.estadoPago === 'confirmado' || f.estadoPago === 'disponible';
    const pasos: Array<{ t: string; v: string; ok: boolean; alerta?: boolean }> = [
        { t: 'Origen', v: f.destino, ok: f.estadoPago !== 'sin_movimiento' },
        { t: 'Procesamiento Stripe', v: f.estadoPagoLabel, ok: pagoOk },
        { t: 'Disponibilidad', v: f.estadoPago === 'disponible' ? 'Disponible' : (f.disponibleDesde ? `Desde ${fecha(f.disponibleDesde)}` : 'Pendiente'), ok: f.estadoPago === 'disponible' },
        { t: 'Transferencia', v: f.estadoTrasladoLabel, ok: f.estadoTraslado === 'trasladado', alerta: f.estadoTraslado === 'parcial' },
        { t: 'Beneficiario', v: f.beneficiarios.join(', ') || '—', ok: f.beneficiarios.length > 0 },
        { t: 'Comprobante', v: f.estadoComprobanteLabel, ok: f.estadoComprobante === 'con_soporte', alerta: f.estadoComprobante === 'pendiente' },
    ];
    return (
        <ol className="flex flex-wrap items-stretch gap-1.5 text-[11px]">
            {pasos.map((p, i) => (
                <li key={p.t} className="flex items-center gap-1.5">
                    <span className={`rounded-lg border px-2 py-1 ${p.alerta ? 'border-amber-300 bg-amber-50' : p.ok ? 'border-emerald-200 bg-emerald-50/60' : 'border-gray-200 bg-white'}`}>
                        <span className="block text-[9px] font-bold uppercase tracking-wider text-gray-500">{p.t}</span>
                        <span className="font-semibold text-gray-800" data-no-translate>{p.v}</span>
                    </span>
                    {i < pasos.length - 1 && <ChevronRight className="w-3 h-3 text-gray-300" />}
                </li>
            ))}
        </ol>
    );
}

function Indicador({ titulo, valor, ayuda, tono = 'gray', onClick, activo }: {
    titulo: string; valor: string; ayuda?: string; tono?: string; onClick?: () => void; activo?: boolean;
}) {
    const tonos: Record<string, string> = {
        gray: 'border-gray-200', sky: 'border-sky-200', emerald: 'border-emerald-200',
        amber: 'border-amber-300', violet: 'border-violet-200', orange: 'border-orange-200',
    };
    const Etiqueta = onClick ? 'button' : 'div';
    return (
        <Etiqueta
            {...(onClick ? { type: 'button' as const, onClick } : {})}
            className={`text-left rounded-2xl border bg-white px-4 py-3 ${tonos[tono] || tonos.gray} ${activo ? 'ring-2 ring-rotary-blue/40' : ''} ${onClick ? 'hover:shadow-sm' : ''}`}
        >
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">{titulo}</p>
            <p className="text-lg font-black text-gray-900 mt-0.5" data-no-translate>{valor}</p>
            {ayuda && <p className="text-[11px] text-gray-500 leading-snug">{ayuda}</p>}
        </Etiqueta>
    );
}

export default function ContributionControlView({
    aportes, desembolsos, sitio, periodoLabel, destinoLabel, clubId, puedeExportar, emitidoPor, onExportado,
}: {
    aportes: AporteControl[];
    desembolsos: Record<string, DesembolsoControl[]>;
    sitio: string;
    periodoLabel: string;
    destinoLabel: string;
    clubId?: string;
    /** `finance.export`: sin él no se ofrecen las descargas. */
    puedeExportar: boolean;
    emitidoPor?: string | null;
    /** Para la auditoría: la exportación se compone en el navegador y la declara la pantalla. */
    onExportado?: (formato: 'xlsx' | 'csv' | 'pdf', inf: InformeControl, moneda: string) => void;
}) {
    const [moneda, setMoneda] = useState<string>(TODOS);
    const [estadoPago, setEstadoPago] = useState<string>(TODOS);
    const [estadoTraslado, setEstadoTraslado] = useState<string>(TODOS);
    const [comprobante, setComprobante] = useState<string>(TODOS);
    const [aportante, setAportante] = useState('');
    const [abierta, setAbierta] = useState<string | null>(null);
    const [exportando, setExportando] = useState<'xlsx' | 'csv' | 'pdf' | null>(null);

    const todas = useMemo(() => filasDeControl(aportes, desembolsos), [aportes, desembolsos]);
    const monedas = useMemo(() => monedasDe(todas), [todas]);
    const filtros = useMemo(() => ({ moneda, estadoPago, estadoTraslado, comprobante, aportante }),
        [moneda, estadoPago, estadoTraslado, comprobante, aportante]);
    const filas = useMemo(() => filtrarControl(todas, filtros), [todas, filtros]);
    const ind = useMemo(() => indicadoresDe(filas), [filas]);
    const hayFiltroLocal = moneda !== TODOS || estadoPago !== TODOS || estadoTraslado !== TODOS || comprobante !== TODOS || !!aportante.trim();

    const descripcionFiltros = () => {
        const d: string[] = [];
        if (moneda !== TODOS) d.push(`Moneda ${moneda}`);
        if (estadoPago !== TODOS) d.push(`Pago: ${ESTADOS_PAGO.find(e => e.key === estadoPago)?.label || estadoPago}`);
        if (estadoTraslado !== TODOS) d.push(`Traslado: ${ESTADOS_TRASLADO.find(e => e.key === estadoTraslado)?.label || estadoTraslado}`);
        if (comprobante === 'con') d.push('Con comprobante');
        if (comprobante === 'sin') d.push('Comprobante pendiente');
        if (comprobante === 'sin_traslado') d.push('Sin traslado');
        if (aportante.trim()) d.push(`Aportante contiene «${aportante.trim()}»`);
        return d;
    };

    const exportar = async (formato: 'xlsx' | 'csv' | 'pdf') => {
        setExportando(formato);
        try {
            const inf = informeControl({
                sitio, periodo: periodoLabel, destino: destinoLabel,
                filtros: descripcionFiltros(), filas, emitidoPor: emitidoPor || null,
            });
            const mod = await import('../../../lib/contributionControlExport');
            if (formato === 'csv') mod.descargarCSVControl(inf);
            else if (formato === 'xlsx') await mod.descargarExcelControl(inf);
            else await mod.descargarPDFControl(inf);
            onExportado?.(formato, inf, moneda === TODOS ? '' : moneda);
        } catch (e) {
            console.error('[Control de aportes] exportación falló:', e);
        } finally {
            setExportando(null);
        }
    };

    const select = 'text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white';

    return (
        <div role="tabpanel" aria-label="Control y Justificación de Aportes" className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                        <ShieldCheck className="w-5 h-5 text-rotary-blue" />
                        Control y Justificación de Aportes
                    </h3>
                    <p className="text-xs text-gray-500 mt-1 max-w-3xl">
                        Período <b data-no-translate>{periodoLabel}</b> · destino <b data-no-translate>{destinoLabel}</b> (se cambian arriba, en la barra de la Bóveda).
                        Un pago confirmado <b>no</b> es un traslado, y un traslado sin comprobante <b>no</b> está justificado: cada columna se decide con su propio dato.
                    </p>
                </div>
                {puedeExportar && filas.length > 0 && (
                    <div className="flex items-center gap-1.5">
                        {(['xlsx', 'csv', 'pdf'] as const).map(fmt => (
                            <button key={fmt} type="button" onClick={() => exportar(fmt)} disabled={!!exportando}
                                aria-label={`Descargar ${fmt === 'xlsx' ? 'Excel' : fmt.toUpperCase()} del control de aportes`}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                                {exportando === fmt ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : fmt === 'pdf' ? <FileText className="w-3.5 h-3.5" /> : <FileSpreadsheet className="w-3.5 h-3.5" />}
                                {fmt === 'xlsx' ? 'Excel' : fmt.toUpperCase()}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* ── Indicadores. El dinero, POR MONEDA; los conteos son de aportes. */}
            <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
                <Indicador titulo="Aportes" valor={String(ind.total)} ayuda={hayFiltroLocal ? `de ${todas.length} en el período` : 'en el período'} />
                <Indicador titulo="Recaudado" tono="sky"
                    valor={Object.keys(ind.recaudadoPorMoneda).length ? Object.entries(ind.recaudadoPorMoneda).map(([m, v]) => money(v, m)).join(' · ') : '—'}
                    ayuda="Por moneda; nunca sumadas." />
                <Indicador titulo="Confirmados" tono="emerald" valor={String(ind.confirmados)} ayuda="Stripe confirmó el cobro."
                    onClick={() => setEstadoPago(estadoPago === 'confirmado' ? TODOS : 'confirmado')} activo={estadoPago === 'confirmado'} />
                <Indicador titulo="En procesamiento" tono="amber" valor={String(ind.pendientesDeProcesamiento)} ayuda="Pendientes de Stripe."
                    onClick={() => setEstadoPago(estadoPago === 'procesando' ? TODOS : 'procesando')} activo={estadoPago === 'procesando'} />
                <Indicador titulo="Con traslado" tono="violet" valor={String(ind.transferidos)} ayuda="Total o parcial."
                    onClick={() => setEstadoTraslado(estadoTraslado === 'trasladado' ? TODOS : 'trasladado')} activo={estadoTraslado === 'trasladado'} />
                <Indicador titulo="Comprobante pendiente" tono="amber" valor={String(ind.pendientesDeComprobante)} ayuda="Traslados sin soporte."
                    onClick={() => setComprobante(comprobante === 'sin' ? TODOS : 'sin')} activo={comprobante === 'sin'} />
                <Indicador titulo="Con soporte" tono="emerald" valor={String(ind.conSoporte)} ayuda="Traslados justificados."
                    onClick={() => setComprobante(comprobante === 'con' ? TODOS : 'con')} activo={comprobante === 'con'} />
            </div>

            {/* ── Filtros propios de esta vista. */}
            <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                    <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input value={aportante} onChange={e => setAportante(e.target.value)} placeholder="Aportante, correo o referencia…"
                        aria-label="Buscar aportante" className="pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg w-60" />
                </div>
                <select aria-label="Moneda" value={moneda} onChange={e => setMoneda(e.target.value)} className={select}>
                    <option value={TODOS}>Todas las monedas</option>
                    {monedas.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
                <select aria-label="Estado del pago" value={estadoPago} onChange={e => setEstadoPago(e.target.value)} className={select}>
                    <option value={TODOS}>Pago: todos</option>
                    {ESTADOS_PAGO.map(e => <option key={e.key} value={e.key}>{e.label}</option>)}
                </select>
                <select aria-label="Estado del traslado" value={estadoTraslado} onChange={e => setEstadoTraslado(e.target.value)} className={select}>
                    <option value={TODOS}>Traslado: todos</option>
                    {ESTADOS_TRASLADO.map(e => <option key={e.key} value={e.key}>{e.label}</option>)}
                </select>
                <select aria-label="Comprobante" value={comprobante} onChange={e => setComprobante(e.target.value)} className={select}>
                    <option value={TODOS}>Comprobante: todos</option>
                    <option value="con">Con comprobante</option>
                    <option value="sin">Sin comprobante (pendiente)</option>
                    <option value="sin_traslado">Sin traslado todavía</option>
                </select>
                {hayFiltroLocal && (
                    <button type="button" className="text-xs font-bold text-rotary-blue hover:underline"
                        onClick={() => { setMoneda(TODOS); setEstadoPago(TODOS); setEstadoTraslado(TODOS); setComprobante(TODOS); setAportante(''); }}>
                        Quitar filtros
                    </button>
                )}
            </div>

            {/* ── La tabla. */}
            <div className="overflow-x-auto border border-gray-100 rounded-2xl">
                <table className="w-full text-xs min-w-[980px]">
                    <thead className="bg-gray-50 text-gray-500">
                        <tr>
                            <th className="w-8" />
                            <th className="text-left font-semibold px-3 py-2.5">Fecha</th>
                            <th className="text-left font-semibold px-3 py-2.5">Aportante</th>
                            <th className="text-left font-semibold px-3 py-2.5">Campaña o destino</th>
                            <th className="text-right font-semibold px-3 py-2.5">Valor</th>
                            <th className="text-left font-semibold px-3 py-2.5">Moneda</th>
                            <th className="text-left font-semibold px-3 py-2.5">Estado de Stripe</th>
                            <th className="text-left font-semibold px-3 py-2.5">Estado del traslado</th>
                            <th className="text-left font-semibold px-3 py-2.5">Comprobante</th>
                            <th className="text-right font-semibold px-3 py-2.5">Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filas.map(f => {
                            const on = abierta === f.id;
                            return (
                                <Fragment key={f.id}>
                                    <tr className={`border-t border-gray-100 ${on ? 'bg-sky-50/40' : 'hover:bg-gray-50/60'}`}>
                                        <td className="px-2 py-2.5 text-gray-400">
                                            <button type="button" aria-label={on ? `Cerrar el detalle de ${f.aportante}` : `Ver el detalle de ${f.aportante}`}
                                                onClick={() => setAbierta(on ? null : f.id)}>
                                                {on ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                            </button>
                                        </td>
                                        <td className="px-3 py-2.5 whitespace-nowrap text-gray-600" data-no-translate>{fecha(f.fecha)}</td>
                                        <td className="px-3 py-2.5">
                                            <p className="font-semibold text-gray-900" data-no-translate>{f.aportante}{f.anonimo && <span className="ml-1 text-[10px] font-normal text-gray-500">(pidió anonimato)</span>}</p>
                                            {f.correo && <p className="text-gray-500" data-no-translate>{f.correo}</p>}
                                        </td>
                                        <td className="px-3 py-2.5 text-gray-700" data-no-translate>{f.destino}</td>
                                        <td className="px-3 py-2.5 text-right font-bold text-gray-900 whitespace-nowrap" data-no-translate>{money(f.valor, f.moneda)}</td>
                                        <td className="px-3 py-2.5 text-gray-600" data-no-translate>{f.moneda}</td>
                                        <td className="px-3 py-2.5"><span className={`px-2 py-0.5 rounded-full ring-1 ${COLOR_PAGO[f.estadoPago]}`}>{f.estadoPagoLabel}</span></td>
                                        <td className="px-3 py-2.5"><span className={`px-2 py-0.5 rounded-full ring-1 ${COLOR_TRASLADO[f.estadoTraslado]}`}>{f.estadoTrasladoLabel}</span></td>
                                        <td className="px-3 py-2.5">
                                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full ring-1 ${COLOR_COMPROBANTE[f.estadoComprobante]}`}>
                                                {f.estadoComprobante === 'pendiente' && <AlertTriangle className="w-3 h-3" />}
                                                {f.estadoComprobante === 'con_soporte' && <CheckCircle2 className="w-3 h-3" />}
                                                {f.estadoComprobanteLabel}
                                            </span>
                                        </td>
                                        <td className="px-3 py-2.5 text-right">
                                            <button type="button" onClick={() => setAbierta(on ? null : f.id)} className="font-bold text-rotary-blue hover:underline">
                                                {on ? 'Cerrar' : 'Ver movimiento'}
                                            </button>
                                        </td>
                                    </tr>
                                    {on && (
                                        <tr className="bg-sky-50/30">
                                            <td colSpan={10} className="px-4 pb-4 pt-2">
                                                <Trazabilidad f={f} />
                                                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-1 mt-3 text-[11px] text-gray-600">
                                                    <p>Medio de pago: <b data-no-translate>{f.medioDePago || '—'}</b></p>
                                                    <p>Referencia Stripe: <b className="font-mono" data-no-translate>{f.referenciaStripe || '—'}</b></p>
                                                    <p>Transacción de saldo: <b className="font-mono" data-no-translate>{f.transaccionStripe || '—'}</b></p>
                                                    <p>Neto para el sitio: <b data-no-translate>{f.neto !== null ? money(f.neto, f.moneda) : '—'}</b></p>
                                                    <p>Trasladado: <b data-no-translate>{money(f.trasladado, f.moneda)}</b></p>
                                                    <p>Referencia del traslado: <b data-no-translate>{f.referenciasTraslado.join(', ') || '—'}</b></p>
                                                </div>
                                                {/* El historial, los traslados y los comprobantes salen de la
                                                    misma ficha de siempre, en sólo lectura. */}
                                                {f.paymentId ? (
                                                    <DisbursementSection paymentId={f.paymentId} clubId={clubId} netAmount={f.neto ?? 0}
                                                        currency={f.moneda} soloLectura puedeDescargar={puedeExportar} />
                                                ) : (
                                                    <p className="pt-3 text-[11px] text-gray-500">
                                                        No se encontró el movimiento de este aporte: no hay historial de Stripe ni traslados que mostrar.
                                                    </p>
                                                )}
                                            </td>
                                        </tr>
                                    )}
                                </Fragment>
                            );
                        })}
                        {filas.length === 0 && (
                            <tr><td colSpan={10} className="px-4 py-10 text-center text-gray-500">
                                {todas.length === 0
                                    ? 'No hay aportes en este período y destino.'
                                    : 'Ningún aporte coincide con estos filtros.'}
                            </td></tr>
                        )}
                    </tbody>
                </table>
            </div>
            <p className="text-[11px] text-gray-400">
                Se listan los aportes del período elegido arriba (hasta 200 por consulta). Los datos que un aporte no tiene se dejan vacíos: no se completan ni se deducen.
            </p>
        </div>
    );
}
