/**
 * REENVIAR LA CONCILIACIÓN DE UNOS APORTES YA TRASLADADOS — v4.1015
 *
 * Se giró dinero a un club y semanas después el presidente pide la
 * conciliación. Esto la vuelve a mandar —a él, o a quien haga falta— SIN
 * registrar ningún movimiento.
 *
 * ⚠️ LO QUE ESTE MODAL NO HACE, y lo dice en pantalla: no crea un desembolso,
 * no cambia un saldo, no toca el estado financiero de ningún aporte y no llama
 * a la pasarela. Quien lo abre tiene que poder saberlo ANTES de pulsar, no
 * después.
 *
 * ⚠️ v4.1015 — TRABAJA CON APORTES, NO CON LOTES. Hasta v4.1014 recibía
 * `batchIds` y paginaba un traslado por vez; un aporte girado suelto no tiene
 * lote, así que sencillamente no llegaba hasta acá. Ahora recibe los aportes y
 * el SERVIDOR decide el ámbito:
 *
 *   · Todos de un mismo lote → la conciliación de ese traslado, COMPLETA, con
 *     su comprobante de siempre. La regla de que una parcial no cuadra contra
 *     el extracto bancario sigue entera ahí.
 *   · Cualquier otra cosa → UNA conciliación consolidada de los aportes
 *     elegidos, que conserva la referencia de cada movimiento original.
 *
 * El ámbito NO se deduce acá: viaja resuelto en `scope`. Con el criterio en
 * los dos lados, la pantalla podría prometer un documento y salir otro.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import {
    X, Loader2, Send, FileText, Download, History, AlertTriangle,
    Info, ShieldCheck, Landmark,
} from 'lucide-react';
import NoticeRecipients from './NoticeRecipients';
import {
    ESTADO_ENVIO, ESTADO_DESTINATARIO, RECONCILIATION_NOTE, AVISO_SIN_MOVIMIENTO,
    AMBITO_LABEL, type AmbitoConciliacion,
} from '../../../lib/reconciliationSpec';

const API_BASE = import.meta.env.VITE_API_URL || '/api';
const token = () => localStorage.getItem('rotary_token');

interface ResultadoEnvio {
    channel: string;
    target: string;
    state: string;
    error?: string | null;
    messageId?: string | null;
    at?: string | null;
}

interface EntradaHistorial {
    id: string;
    kind: 'original' | 'reenvio';
    kindLabel: string;
    emails: string[];
    phones: string[];
    results: ResultadoEnvio[];
    state: string | null;
    error: string | null;
    at: string | null;
    byName: string | null;
    note: string | null;
    documentName: string | null;
    derived: boolean;
}

/** Un movimiento de origen: el traslado agrupado o el giro suelto del que
 *  salieron algunos de los aportes conciliados. */
interface MovimientoOrigen {
    kind: 'lote' | 'suelto';
    ref: string;
    date: string | null;
    method: string;
    bankRef: string | null;
    count: number;
    total: number;
}

/** La cabecera del documento, ya resuelta por el servidor. Tiene la misma
 *  forma en los dos ámbitos: la pantalla no necesita saber por dónde entró. */
interface CabeceraConciliacion {
    ref: string;
    beneficiary: string;
    campaignName: string | null;
    currency: string;
    count: number;
    grossAmount: number;
    fees: number;
    platformRetention: number;
    netAmount: number;
    method: string;
    methodLabel: string;
    reference: string | null;
    disbursedAt: string | null;
    dateLabel?: string;
    sources?: MovimientoOrigen[];
    createdByName?: string | null;
}

const money = (n: number, c: string) => {
    try {
        return new Intl.NumberFormat('es-CO', {
            style: 'currency', currency: c,
            minimumFractionDigits: c === 'COP' ? 0 : 2,
            maximumFractionDigits: c === 'COP' ? 0 : 2,
        }).format(n || 0);
    } catch { return `${(n || 0).toFixed(2)} ${c}`; }
};

const fechaLarga = (s: string | null) =>
    s ? new Date(s).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' }) : '—';

const fechaCorta = (s: string | null) =>
    s ? new Date(s).toLocaleDateString('es-CO', { dateStyle: 'medium' }) : '—';

export default function ResendNoticeModal({ paymentIds, clubId, onCerrar, onEnviado }: {
    /** Los aportes a conciliar. El ámbito —un traslado o una consolidada— lo
     *  resuelve el servidor a partir de ellos. */
    paymentIds: string[];
    clubId?: string;
    onCerrar: () => void;
    onEnviado?: () => void;
}) {
    const [scope, setScope] = useState<AmbitoConciliacion>('traslado');
    const [cab, setCab] = useState<CabeceraConciliacion | null>(null);
    const [avisos, setAvisos] = useState<string[]>([]);
    const [historial, setHistorial] = useState<EntradaHistorial[]>([]);
    const [yaAvisados, setYaAvisados] = useState<{ target: string; at?: string | null }[]>([]);
    const [cargando, setCargando] = useState(true);
    const [fallo, setFallo] = useState<string | null>(null);

    const [correos, setCorreos] = useState('');
    const [nota, setNota] = useState('');
    const [enviando, setEnviando] = useState(false);
    const [resultado, setResultado] = useState<{
        estado: string; resultados: ResultadoEnvio[];
        documento?: { name: string | null; guardado: boolean; error: string | null };
    } | null>(null);

    const ids = useMemo(() => [...paymentIds].sort(), [paymentIds]);
    const clave = ids.join(',');

    /**
     * ⚠️ LA LLAVE DE LA OPERACIÓN SE GENERA AL ABRIR, no al pulsar.
     *
     * Es lo que hace que un doble clic —o un reintento de red— caiga en la
     * MISMA operación y no mande la conciliación dos veces al mismo
     * presidente. Cambia con la selección: otros aportes son otra operación.
     * Mismo patrón que `operationKey` del desembolso agrupado (v4.996).
     */
    const [semilla] = useState(() => (crypto.randomUUID?.() || String(Date.now())));
    const operationKey = useMemo(() => `${semilla}:${clave}`, [semilla, clave]);

    const cuerpo = useMemo(
        () => ({ paymentIds: ids, ...(clubId ? { clubId } : {}) }),
        [ids, clubId]
    );

    const cargar = useCallback(async () => {
        if (!ids.length) return;
        setCargando(true); setFallo(null); setResultado(null);
        try {
            const { data } = await axios.post(
                `${API_BASE}/financial/wallet/reconciliations/resolve`,
                { paymentIds: ids, ...(clubId ? { clubId } : {}) },
                { headers: { Authorization: `Bearer ${token()}` } }
            );
            setScope(data.scope);
            setCab(data.header);
            setAvisos(data.avisos || []);
            setHistorial(data.historial || []);
            setYaAvisados(data.yaAvisados || []);
        } catch (e: unknown) {
            // ⚠️ Se dice QUÉ pasó y no «no se pudo cargar»: 401 se corrige
            // volviendo a entrar y 404 es que el aporte no es de este sitio
            // — dos cosas que se resuelven en sitios distintos.
            const err = e as { response?: { status?: number; data?: { error?: string } } };
            const s = err?.response?.status;
            setFallo(
                s === 401 ? 'Tu sesión venció. Volvé a entrar y abrí de nuevo la conciliación.'
                    : s === 403 ? 'No tenés permiso para conciliar en este sitio.'
                        : err?.response?.data?.error || 'No se pudo resolver la conciliación de estos aportes.'
            );
        } finally { setCargando(false); }
    }, [ids, clubId]);

    useEffect(() => { void cargar(); }, [cargar]);

    const descargar = async (formato: 'pdf' | 'csv') => {
        try {
            const r = await axios.post(
                `${API_BASE}/financial/wallet/reconciliations/document?formato=${formato}`,
                cuerpo,
                { headers: { Authorization: `Bearer ${token()}` }, responseType: 'blob' }
            );
            const url = URL.createObjectURL(r.data as Blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `conciliacion-${cab?.ref || 'aportes'}.${formato}`;
            document.body.appendChild(a); a.click(); a.remove();
            URL.revokeObjectURL(url);
        } catch {
            toast.error('No se pudo generar el comprobante.');
        }
    };

    const enviar = async () => {
        if (!correos.trim()) { toast.error('Escribí al menos un destinatario.'); return; }
        setEnviando(true);
        try {
            const { data } = await axios.post(
                `${API_BASE}/financial/wallet/reconciliations/resend`,
                { ...cuerpo, emails: correos, note: nota, confirm: true, operationKey },
                { headers: { Authorization: `Bearer ${token()}` } }
            );
            setResultado({ estado: data.estado, resultados: data.resultados || [], documento: data.documento });
            if (data.repetida) toast('Esta conciliación ya se había enviado en esta operación.');
            else if (data.estado === 'enviado') toast.success('Conciliación enviada.');
            else if (data.estado === 'parcial') toast('Se envió a algunos destinatarios; mirá el detalle.');
            else toast.error('No se pudo enviar la conciliación.');
            await cargar();
            onEnviado?.();
        } catch (e: unknown) {
            const err = e as { response?: { status?: number; data?: { error?: string; errores?: string[] } } };
            toast.error(err?.response?.data?.errores?.[0] || err?.response?.data?.error || 'No se pudo reenviar la conciliación.');
        } finally { setEnviando(false); }
    };

    const rotulo = AMBITO_LABEL[scope];
    const consolidada = scope === 'seleccion';

    return (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center p-4 overflow-y-auto">
            <div className="bg-white rounded-2xl w-full max-w-3xl my-6 shadow-xl">
                {/* ── Cabecera ─────────────────────────────────────── */}
                <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-gray-100">
                    <div>
                        <h3 className="text-lg font-bold text-gray-900">Reenviar notificación de traslado</h3>
                        <p className="text-xs text-gray-500 mt-0.5">{rotulo.bajada}</p>
                    </div>
                    <button onClick={onCerrar} className="text-gray-400 hover:text-gray-700" aria-label="Cerrar">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="px-6 py-5 space-y-5">
                    {/* ⚠️ EL AVISO VA ARRIBA Y ANTES DE TODO. Es la pregunta que
                        se hace quien abre esto: «¿esto vuelve a girar el
                        dinero?». Descubrir la respuesta después de pulsar no
                        sirve de nada. */}
                    <div className="flex items-start gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3">
                        <ShieldCheck className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" />
                        <p className="text-xs text-emerald-900 leading-relaxed">{AVISO_SIN_MOVIMIENTO}</p>
                    </div>

                    {cargando && (
                        <div className="py-10 text-center text-gray-400">
                            <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                            <p className="text-sm">Resolviendo la conciliación…</p>
                        </div>
                    )}

                    {!cargando && fallo && (
                        <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-800">
                            {fallo}
                        </div>
                    )}

                    {!cargando && !fallo && cab && (
                        <>
                            {/* ⚠️ EL ALCANCE SE DICE ANTES DE ENVIAR, no después.
                                Ninguno de estos avisos bloquea: informan. */}
                            {avisos.length > 0 && (
                                <ul className="space-y-1 rounded-xl border border-sky-100 bg-sky-50 px-4 py-3">
                                    {avisos.map((a, k) => (
                                        <li key={k} className="flex items-start gap-1.5 text-xs text-sky-900">
                                            <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                                            <span>{a}</span>
                                        </li>
                                    ))}
                                </ul>
                            )}

                            {/* ── El resumen del documento ─────────── */}
                            <section className="rounded-xl border border-gray-200 overflow-hidden">
                                <header className="px-4 py-2.5 bg-gray-50 border-b border-gray-200 flex items-center gap-2">
                                    <FileText className="w-4 h-4 text-gray-500" />
                                    <h4 className="text-xs font-bold uppercase tracking-wider text-gray-600">
                                        {rotulo.titulo}
                                    </h4>
                                </header>
                                <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
                                    <Dato t={consolidada ? 'Referencia de la conciliación' : 'Traslado'} v={cab.ref} mono />
                                    <Dato t="Beneficiario" v={cab.beneficiary || '—'} />
                                    {cab.campaignName && <Dato t="Campaña" v={cab.campaignName} />}
                                    <Dato
                                        t={consolidada ? 'Fechas de los traslados' : 'Fecha del traslado'}
                                        v={consolidada ? (cab.dateLabel || '—') : fechaLarga(cab.disbursedAt)}
                                    />
                                    <Dato t="Aportes" v={String(cab.count)} />
                                    <Dato t="Moneda" v={cab.currency} mono />
                                    <Dato t="Total bruto" v={money(cab.grossAmount, cab.currency)} mono />
                                    <Dato t="Comisión de procesamiento" v={`− ${money(cab.fees, cab.currency)}`} mono />
                                    <Dato t="Retención de la plataforma" v={`− ${money(cab.platformRetention, cab.currency)}`} mono />
                                    <Dato t="Neto trasladado" v={money(cab.netAmount, cab.currency)} mono destacado />
                                    <Dato t="Medio" v={cab.methodLabel || cab.method || '—'} />
                                    {cab.reference && <Dato t="Referencia bancaria" v={cab.reference} mono />}
                                    {cab.createdByName && <Dato t="Registrado por" v={cab.createdByName} />}
                                </div>

                                {/* ⚠️ LOS MOVIMIENTOS DE ORIGEN, UNO POR UNO.
                                    Es lo que hace auditable una consolidada: sin
                                    esta lista, ocho aportes de tres
                                    transferencias no se cruzan contra ningún
                                    extracto. Va también en el PDF y en el CSV. */}
                                {consolidada && (cab.sources?.length || 0) > 0 && (
                                    <div className="px-4 pb-4">
                                        <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1.5 flex items-center gap-1.5">
                                            <Landmark className="w-3.5 h-3.5" /> Movimientos de origen
                                        </p>
                                        <ul className="space-y-1">
                                            {cab.sources!.map(f => (
                                                <li key={f.ref} className="flex flex-wrap items-baseline gap-x-2 text-[11px] text-gray-600">
                                                    <span className="font-semibold text-gray-800" data-no-translate>{f.ref}</span>
                                                    <span>{f.kind === 'lote' ? 'Traslado agrupado' : 'Giro suelto'}</span>
                                                    <span data-no-translate>· {fechaCorta(f.date)}</span>
                                                    {f.method && <span>· {f.method}</span>}
                                                    {f.bankRef && <span data-no-translate>· ref. {f.bankRef}</span>}
                                                    {f.total > 1 && f.count < f.total && (
                                                        <span className="text-amber-700">· {f.count} de sus {f.total} aportes</span>
                                                    )}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}

                                <div className="px-4 py-3 border-t border-gray-100 flex flex-wrap gap-2">
                                    <button
                                        type="button" onClick={() => descargar('pdf')}
                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-bold text-gray-700 hover:border-rotary-blue hover:text-rotary-blue"
                                    >
                                        <Download className="w-3.5 h-3.5" /> Descargar comprobante (PDF)
                                    </button>
                                    <button
                                        type="button" onClick={() => descargar('csv')}
                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-bold text-gray-700 hover:border-rotary-blue hover:text-rotary-blue"
                                    >
                                        <Download className="w-3.5 h-3.5" /> CSV
                                    </button>
                                </div>
                            </section>

                            {/* ── El historial ─────────────────────── */}
                            <section>
                                <h4 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-gray-600 mb-2">
                                    <History className="w-3.5 h-3.5" /> Notificaciones anteriores
                                </h4>
                                {historial.length === 0 ? (
                                    /* ⚠️ «Sin registro» NO es «no le llegó»: es que
                                       no se registró nada. Confundirlos manda a
                                       buscar un problema de entrega donde no lo
                                       hay (regla de v4.855). */
                                    <p className="text-xs text-gray-500 rounded-lg bg-gray-50 border border-gray-200 px-3 py-2">
                                        No hay ninguna notificación registrada para estos aportes. Eso no significa
                                        que no se haya avisado: significa que no quedó registrado.
                                    </p>
                                ) : (
                                    <ul className="space-y-2">
                                        {historial.map(h => {
                                            const est = h.state ? ESTADO_ENVIO[h.state] : null;
                                            return (
                                                <li key={h.id} className="rounded-lg border border-gray-200 px-3 py-2.5">
                                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                                        <span className="text-sm font-semibold text-gray-800">{h.kindLabel}</span>
                                                        <div className="flex items-center gap-2">
                                                            {est && (
                                                                <span className={`px-2 py-0.5 rounded-md border text-[10px] font-bold uppercase tracking-wide ${est.cls}`}>
                                                                    {est.label}
                                                                </span>
                                                            )}
                                                            <span className="text-[11px] text-gray-500" data-no-translate>{fechaLarga(h.at)}</span>
                                                        </div>
                                                    </div>
                                                    {h.byName && (
                                                        <p className="text-[11px] text-gray-500 mt-0.5">Por: {h.byName}</p>
                                                    )}
                                                    {h.results.length > 0 ? (
                                                        <ul className="mt-1.5 space-y-1">
                                                            {h.results.map((r, k) => {
                                                                const e = ESTADO_DESTINATARIO[r.state] || { label: r.state, cls: 'bg-gray-100 text-gray-600' };
                                                                return (
                                                                    <li key={k} className="flex flex-wrap items-center gap-2 text-[11px]">
                                                                        <span className={`px-1.5 py-0.5 rounded ${e.cls} font-semibold`}>{e.label}</span>
                                                                        <span className="text-gray-700" data-no-translate>{r.target || '—'}</span>
                                                                        {r.error && <span className="text-red-600">{r.error}</span>}
                                                                    </li>
                                                                );
                                                            })}
                                                        </ul>
                                                    ) : (h.emails.length > 0 && (
                                                        <p className="text-[11px] text-gray-600 mt-1" data-no-translate>{h.emails.join(', ')}</p>
                                                    ))}
                                                    {h.note && <p className="text-[11px] text-gray-500 mt-1 italic">«{h.note}»</p>}
                                                </li>
                                            );
                                        })}
                                    </ul>
                                )}
                            </section>

                            {/* ── El envío ─────────────────────────── */}
                            <section className="rounded-xl border border-gray-200 p-4 space-y-3">
                                <NoticeRecipients
                                    soloCorreo
                                    etiqueta="Enviar a"
                                    notificar
                                    onNotificar={() => { /* en un reenvío notificar no es opcional */ }}
                                    correos={correos}
                                    onCorreos={setCorreos}
                                    telefonos=""
                                    onTelefonos={() => { /* la conciliación no sale por WhatsApp: ver `soloCorreo` */ }}
                                    estadoWa={null}
                                    sugerencias={yaAvisados}
                                    ayuda={
                                        <p className="text-[11px] text-gray-500 flex items-start gap-1">
                                            <Info className="w-3 h-3 mt-0.5 flex-shrink-0" />
                                            <span>
                                                No se limita a los correos del aviso original: escribí el del presidente,
                                                el del revisor fiscal o el que haga falta. El correo llevará el detalle
                                                de los {cab.count} aportes y el comprobante en PDF.
                                            </span>
                                        </p>
                                    }
                                />

                                <label className="block">
                                    <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1 block">
                                        Nota interna (opcional)
                                    </span>
                                    <input
                                        value={nota}
                                        onChange={e => setNota(e.target.value)}
                                        placeholder="Ej.: lo pidió el presidente del club el 8 de septiembre"
                                        className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
                                    />
                                    <p className="text-[11px] text-gray-500 mt-1">
                                        Queda en el historial de estos aportes. No va en el correo.
                                    </p>
                                </label>

                                <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
                                    <p className="text-[11px] text-amber-900 leading-relaxed">
                                        <strong>El correo dirá:</strong> «{RECONCILIATION_NOTE}»
                                    </p>
                                </div>
                            </section>

                            {/* ── El desenlace ─────────────────────── */}
                            {resultado && (
                                <section className="rounded-xl border border-gray-200 p-4">
                                    <h4 className="text-xs font-bold uppercase tracking-wider text-gray-600 mb-2">
                                        Resultado del envío
                                    </h4>
                                    <ul className="space-y-1">
                                        {resultado.resultados.map((r, k) => {
                                            const e = ESTADO_DESTINATARIO[r.state] || { label: r.state, cls: 'bg-gray-100 text-gray-600' };
                                            return (
                                                <li key={k} className="flex flex-wrap items-center gap-2 text-xs">
                                                    <span className={`px-1.5 py-0.5 rounded ${e.cls} font-semibold`}>{e.label}</span>
                                                    <span className="text-gray-700" data-no-translate>{r.target || '—'}</span>
                                                    {r.error && <span className="text-red-600">{r.error}</span>}
                                                </li>
                                            );
                                        })}
                                    </ul>
                                    {/* ⚠️ Un envío que falló NO pierde el documento, y hay
                                        que decirlo con la salida a mano: es la exigencia
                                        literal del pedido. */}
                                    {resultado.estado !== 'enviado' && (
                                        <p className="mt-2 text-[11px] text-amber-800 flex items-start gap-1">
                                            <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                                            <span>
                                                {resultado.documento?.error
                                                    ? `El documento no se pudo componer: ${resultado.documento.error}.`
                                                    : 'El comprobante se generó correctamente y se puede descargar acá arriba.'}
                                                {' '}Podés corregir la dirección y volver a enviar.
                                            </span>
                                        </p>
                                    )}
                                </section>
                            )}
                        </>
                    )}
                </div>

                {/* ── El pie ───────────────────────────────────────── */}
                <div className="px-6 py-4 border-t border-gray-100 flex flex-wrap items-center justify-end gap-3">
                    <button onClick={onCerrar} className="px-4 py-2 rounded-lg text-sm font-bold text-gray-600 hover:bg-gray-50">
                        Cerrar
                    </button>
                    {/* El botón DICE qué va a pasar, no pregunta si estás
                        seguro: lo que hay que poder revisar es el hecho. */}
                    <button
                        type="button"
                        onClick={enviar}
                        disabled={enviando || cargando || !!fallo || !correos.trim()}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-rotary-blue text-white text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                        {enviando ? 'Enviando…' : 'Enviar conciliación'}
                    </button>
                </div>
            </div>
        </div>
    );
}

function Dato({ t, v, mono, destacado }: { t: string; v: string; mono?: boolean; destacado?: boolean }) {
    return (
        <div className="flex items-baseline justify-between gap-3 py-0.5">
            <span className="text-xs text-gray-500">{t}</span>
            <span
                className={`text-xs text-right ${destacado ? 'font-black text-gray-900' : 'font-semibold text-gray-800'}`}
                {...(mono ? { 'data-no-translate': true } : {})}
            >{v}</span>
        </div>
    );
}
