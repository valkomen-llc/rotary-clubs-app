/**
 * La FICHA de un desembolso agrupado: referencia, fecha, responsable, campaña,
 * beneficiario, total, los aportes que cubrió, a quién se avisó y con qué
 * resultado.
 *
 * v4.996 — Es UN componente compartido: lo abre el bloque después de confirmar
 * («Ver desembolso») y la ficha de cada aporte desde su línea «Desembolso:
 * LOTE-…». Escrito dos veces, el día que el lote gane un dato uno de los dos
 * se queda atrás (la regla de `NoticeRecipients`, v4.888).
 *
 * ⚠️ TODO SALE DEL SERVIDOR. La ficha no recompone nada: los totales, los
 * aportes y el estado del aviso son los de la fila, que es lo único que sirve
 * para auditar. Un número calculado acá podría contradecir al correo que ya
 * salió.
 */
import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { Loader2, X, RotateCcw, Mail, MessageCircle, CheckCircle2, AlertTriangle, Eye } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || '/api';
const token = () => localStorage.getItem('rotary_token');

export interface BatchItem {
    disbursementId: string;
    paymentId: string;
    status: string;
    amount: number;
    currency: string;
    date: string;
    donorName: string | null;
    donorEmail: string | null;
    isAnonymous: boolean;
}

export interface BatchNotifyResult {
    channel: 'email' | 'whatsapp';
    target: string;
    state: string;
    error: string | null;
    at: string;
}

export interface BatchDetail {
    id: string;
    ref: string;
    campaignName: string | null;
    beneficiary: string;
    currency: string;
    count: number;
    netAmount: number;
    grossAmount: number;
    fees: number;
    platformRetention: number;
    methodLabel: string;
    reference: string | null;
    notes: string | null;
    disbursedAt: string;
    hasReceipt: boolean;
    receiptName: string | null;
    notifyEmails: string[];
    notifyPhones: string[];
    notifyState: string | null;
    notifyAt: string | null;
    notifyError: string | null;
    notifyResults: BatchNotifyResult[];
    createdByName: string | null;
    createdAt: string;
    items: BatchItem[];
    confirmados: number;
}

const money = (n: number, c: string) => {
    try {
        return new Intl.NumberFormat('es-CO', {
            style: 'currency', currency: c,
            minimumFractionDigits: c === 'COP' ? 0 : 2,
            maximumFractionDigits: c === 'COP' ? 0 : 2,
        }).format(n || 0);
    } catch { return `${n} ${c}`; }
};
const fecha = (v: string | null | undefined) => {
    if (!v) return '—';
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
};
const refCorta = (id: string) => `#${String(id || '').replace(/-/g, '').slice(-8).toUpperCase()}`;

const ESTADO_AVISO: Record<string, { label: string; cls: string }> = {
    enviado: { label: 'Enviado', cls: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
    parcial: { label: 'Parcial', cls: 'bg-amber-50 text-amber-700 border-amber-100' },
    fallido: { label: 'Falló', cls: 'bg-red-50 text-red-700 border-red-100' },
    omitido: { label: 'Omitido', cls: 'bg-gray-50 text-gray-600 border-gray-200' },
    sin_destinatario: { label: 'Sin destinatario', cls: 'bg-gray-50 text-gray-600 border-gray-200' },
    duplicado: { label: 'Ya enviado', cls: 'bg-gray-50 text-gray-600 border-gray-200' },
};

export default function DisbursementBatchModal({ batchId, clubId, onCerrar, onCambio }: {
    batchId: string;
    clubId?: string;
    onCerrar: () => void;
    /** Se llama cuando el aviso se reintentó: la ficha del aporte puede querer recargar. */
    onCambio?: () => void;
}) {
    const [lote, setLote] = useState<BatchDetail | null>(null);
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [reintentando, setReintentando] = useState(false);
    const [previo, setPrevio] = useState<{ html: string; subject: string; ok: boolean; problemas: string[] } | null>(null);
    const [cargandoPrevio, setCargandoPrevio] = useState(false);

    const cargar = useCallback(async () => {
        setCargando(true);
        setError(null);
        try {
            const r = await axios.get(`${API_BASE}/financial/wallet/disbursement-batches/${batchId}`, {
                params: clubId ? { clubId } : undefined,
                headers: { Authorization: `Bearer ${token()}` },
            });
            setLote(r.data?.batch || null);
        } catch (e: any) {
            // El motivo se DICE: un 404 es «no es de este sitio» y un 500 es otra
            // cosa, y se corrigen en sitios distintos.
            const st = e?.response?.status;
            setError(st === 404 ? 'Este desembolso agrupado no existe en este sitio.'
                : st === 401 ? 'La sesión venció. Volvé a entrar.'
                    : (e?.response?.data?.error || 'No se pudo leer el desembolso.'));
        } finally {
            setCargando(false);
        }
    }, [batchId, clubId]);

    useEffect(() => { cargar(); }, [cargar]);

    const reintentar = async () => {
        setReintentando(true);
        try {
            const r = await axios.post(
                `${API_BASE}/financial/wallet/disbursement-batches/${batchId}/notify`,
                clubId ? { clubId } : {},
                { headers: { Authorization: `Bearer ${token()}` } }
            );
            if (r.data?.estado === 'enviado') toast.success('Aviso consolidado enviado.');
            else if (r.data?.estado === 'duplicado') toast('Ya se había enviado: no se repite.', { icon: 'ℹ️' });
            else toast.error(`El aviso quedó «${r.data?.estado}»${r.data?.error ? `: ${r.data.error}` : ''}`, { duration: 10000 });
            await cargar();
            onCambio?.();
        } catch (e: any) {
            toast.error(e?.response?.data?.error || 'No se pudo reintentar el aviso.');
        } finally {
            setReintentando(false);
        }
    };

    const verCorreo = async () => {
        setCargandoPrevio(true);
        try {
            const r = await axios.get(`${API_BASE}/financial/wallet/disbursement-batches/${batchId}/email-preview`, {
                params: clubId ? { clubId } : undefined,
                headers: { Authorization: `Bearer ${token()}` },
            });
            setPrevio({ html: r.data?.html || '', subject: r.data?.subject || '', ok: !!r.data?.ok, problemas: r.data?.problemas || [] });
        } catch (e: any) {
            toast.error(e?.response?.data?.error || 'No se pudo componer el correo.');
        } finally {
            setCargandoPrevio(false);
        }
    };

    const avisoEstado = lote?.notifyState ? ESTADO_AVISO[lote.notifyState] || { label: lote.notifyState, cls: 'bg-gray-50 text-gray-600 border-gray-200' } : null;

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Desembolso agrupado">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[calc(100vh-2rem)] overflow-y-auto">
                <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-gray-100">
                    <div>
                        <h3 className="font-bold text-gray-900">
                            Desembolso agrupado {lote && <span className="font-mono text-sm text-gray-500" data-no-translate>{lote.ref}</span>}
                        </h3>
                        <p className="text-xs text-gray-500 mt-0.5">
                            Un giro, una referencia, una notificación. Cada aporte conserva su propio registro.
                        </p>
                    </div>
                    <button type="button" onClick={onCerrar} aria-label="Cerrar" className="text-gray-400 hover:text-gray-700">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {cargando ? (
                    <div className="px-5 py-10 flex items-center justify-center text-gray-400">
                        <Loader2 className="w-5 h-5 animate-spin" />
                    </div>
                ) : error || !lote ? (
                    <div className="px-5 py-6 text-sm text-red-700">{error || 'No se encontró el desembolso.'}</div>
                ) : (
                    <div className="px-5 py-4 space-y-4 text-sm">
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                            <Dato t="Referencia" v={lote.ref} mono />
                            <Dato t="Fecha" v={fecha(lote.disbursedAt)} />
                            <Dato t="Responsable" v={lote.createdByName || '—'} />
                            <Dato t="Campaña" v={lote.campaignName || 'Sin campaña'} />
                            <Dato t="Beneficiario" v={lote.beneficiary} />
                            <Dato t="Medio" v={lote.methodLabel} />
                            <Dato t="Referencia bancaria" v={lote.reference || '—'} mono />
                            <Dato t="Aportes" v={`${lote.confirmados} de ${lote.count}`} />
                            <Dato t="Monto total" v={`${money(lote.netAmount, lote.currency)} ${lote.currency}`} destacado />
                        </div>
                        {lote.notes && <p className="text-gray-600 italic">{lote.notes}</p>}
                        {lote.hasReceipt && (
                            <p className="text-xs text-gray-500">
                                Comprobante del giro: <span data-no-translate>{lote.receiptName}</span> (se abre desde la ficha de cualquiera de sus aportes).
                            </p>
                        )}

                        {/* ── LOS APORTES ─────────────────────────────────── */}
                        <div>
                            <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">
                                Aportes incluidos
                            </div>
                            <div className="rounded-lg border border-gray-200 overflow-x-auto">
                                <table className="min-w-full text-xs">
                                    <thead className="bg-gray-50 text-gray-500">
                                        <tr>
                                            <th className="text-left px-3 py-2 font-semibold">Aportante</th>
                                            <th className="text-left px-3 py-2 font-semibold">Fecha</th>
                                            <th className="text-left px-3 py-2 font-semibold">Referencia</th>
                                            <th className="text-right px-3 py-2 font-semibold">Aporte</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {lote.items.map(it => (
                                            <tr key={it.disbursementId} className={`border-t border-gray-100 ${it.status === 'reversado' ? 'opacity-50 line-through' : ''}`}>
                                                <td className="px-3 py-2">
                                                    <div className="font-semibold text-gray-800" data-no-translate>
                                                        {it.isAnonymous ? <span className="italic font-normal text-gray-500">Aportante anónimo</span> : (it.donorName || it.donorEmail || 'Aportante sin nombre')}
                                                    </div>
                                                    {!it.isAnonymous && it.donorEmail && <div className="text-gray-500" data-no-translate>{it.donorEmail}</div>}
                                                </td>
                                                <td className="px-3 py-2 text-gray-600 whitespace-nowrap" data-no-translate>{fecha(it.date)}</td>
                                                <td className="px-3 py-2 font-mono text-gray-500 whitespace-nowrap" data-no-translate>{refCorta(it.paymentId)}</td>
                                                <td className="px-3 py-2 text-right font-semibold text-gray-800 whitespace-nowrap" data-no-translate>{money(it.amount, it.currency)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot>
                                        <tr className="border-t-2 border-gray-300 bg-gray-50">
                                            <td colSpan={3} className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-gray-500">Total desembolsado</td>
                                            <td className="px-3 py-2 text-right font-bold text-gray-900 whitespace-nowrap" data-no-translate>{money(lote.netAmount, lote.currency)} {lote.currency}</td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        </div>

                        {/* ── LA NOTIFICACIÓN ─────────────────────────────── */}
                        <div className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Notificación consolidada</span>
                                {avisoEstado ? (
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${avisoEstado.cls}`}>{avisoEstado.label}</span>
                                ) : (
                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-gray-50 text-gray-500 border-gray-200">No se pidió</span>
                                )}
                                {lote.notifyAt && <span className="text-[11px] text-gray-500" data-no-translate>{new Date(lote.notifyAt).toLocaleString('es-CO')}</span>}
                            </div>
                            {lote.notifyResults.length > 0 ? (
                                <ul className="space-y-1">
                                    {lote.notifyResults.map((r, i) => (
                                        <li key={i} className="flex items-start gap-2 text-xs">
                                            {r.channel === 'whatsapp' ? <MessageCircle className="w-3.5 h-3.5 mt-0.5 text-emerald-600 flex-shrink-0" /> : <Mail className="w-3.5 h-3.5 mt-0.5 text-sky-600 flex-shrink-0" />}
                                            <span className="font-mono text-gray-700" data-no-translate>{r.target || '—'}</span>
                                            {r.state === 'enviado'
                                                ? <span className="inline-flex items-center gap-1 text-emerald-700"><CheckCircle2 className="w-3 h-3" /> enviado</span>
                                                : r.state === 'duplicado'
                                                    ? <span className="text-gray-500">ya enviado</span>
                                                    : <span className="inline-flex items-center gap-1 text-amber-700"><AlertTriangle className="w-3 h-3" /> {r.state}{r.error ? `: ${r.error}` : ''}</span>}
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <p className="text-xs text-gray-500">
                                    {lote.notifyEmails.length || lote.notifyPhones.length
                                        ? 'Todavía no se registró ningún envío.'
                                        : 'No se indicó ningún destinatario al registrar el giro.'}
                                </p>
                            )}
                            {lote.notifyError && <p className="text-xs text-red-700">{lote.notifyError}</p>}
                            <div className="flex flex-wrap gap-2 pt-1">
                                {(lote.notifyEmails.length > 0 || lote.notifyPhones.length > 0) && lote.notifyState !== 'enviado' && (
                                    <button
                                        type="button" onClick={reintentar} disabled={reintentando}
                                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gray-900 text-white text-[11px] font-bold hover:bg-black disabled:opacity-50"
                                    >
                                        {reintentando ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                                        Reintentar aviso (sólo a quien no lo recibió)
                                    </button>
                                )}
                                <button
                                    type="button" onClick={verCorreo} disabled={cargandoPrevio}
                                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700 text-[11px] font-bold hover:bg-white disabled:opacity-50"
                                >
                                    {cargandoPrevio ? <Loader2 className="w-3 h-3 animate-spin" /> : <Eye className="w-3 h-3" />}
                                    Ver el correo
                                </button>
                            </div>
                        </div>

                        {previo && (
                            <div className="space-y-1">
                                <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                                    Asunto: <span className="normal-case tracking-normal font-semibold text-gray-800" data-no-translate>{previo.subject}</span>
                                </div>
                                {!previo.ok && (
                                    <p className="text-xs text-red-700">
                                        Este correo NO se enviaría: {previo.problemas.join(' ')}
                                    </p>
                                )}
                                {/* El HTML es compuesto con datos de aportantes: va en un
                                    `iframe` con `sandbox` para que no toque el panel. */}
                                <iframe
                                    title="Vista previa del correo"
                                    sandbox=""
                                    srcDoc={previo.html}
                                    className="w-full h-[520px] rounded-lg border border-gray-200 bg-white"
                                />
                            </div>
                        )}
                    </div>
                )}

                <div className="px-5 py-3 border-t border-gray-100 bg-gray-50 rounded-b-2xl flex justify-end">
                    <button type="button" onClick={onCerrar} className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-bold hover:bg-black">
                        Cerrar
                    </button>
                </div>
            </div>
        </div>
    );
}

function Dato({ t, v, mono, destacado }: { t: string; v: string; mono?: boolean; destacado?: boolean }) {
    return (
        <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{t}</div>
            <div className={`${mono ? 'font-mono text-xs' : ''} ${destacado ? 'font-bold text-emerald-700' : 'font-semibold text-gray-800'}`} data-no-translate>{v}</div>
        </div>
    );
}
