// ════════════════════════════════════════════════════════════════════════════
// El dinero de UNA inscripción, en su ficha — v4.1249
//
// Reporte: «No encuentro la opción para enviar los comprobantes de traslados»,
// con la Bóveda de Fondos como referencia. En la Bóveda cada aporte desplegado
// trae su traslado al beneficiario, el envío de la conciliación y sus
// desembolsos; la ficha del inscrito no traía nada de eso, y en la pestaña
// «Conciliación de fondos» la única puerta era marcar la casilla y usar la
// barra, que no se ve hasta que se marca algo.
//
// Este bloque es el de la Bóveda, con las MISMAS piezas:
//   · «Enviar comprobante de traslado» → `ResendNoticeModal` (PDF de la
//     conciliación, adjuntos, vista previa e historial).
//   · `DisbursementSection` → registrar el traslado con su comprobante PDF,
//     ver el comprobante del giro, reenviar el aviso o reversar.
// ════════════════════════════════════════════════════════════════════════════
import { useState } from 'react';
import axios from 'axios';
import { Landmark, Loader2, Send, AlertCircle } from 'lucide-react';
import ResendNoticeModal from '../wallet/ResendNoticeModal';
import DisbursementSection from '../wallet/DisbursementSection';
import { FUND_STATE_LABELS } from '../../../../server/lib/eventFundsSpec.js';
import type { FundStates } from '../../../../server/lib/eventFundsSpec.js';

const API = import.meta.env.VITE_API_URL || '/api';

/** Lo que `GET /financial/wallet?eventId=` manda por inscripción (`byRegistration`). */
export interface RegistrationFund {
    paymentId: string;
    states: FundStates;
    amount: number;
    grossAmount: number;
    fee: number;
    stripeFee?: number;
    applicationFee?: number;
    currency: string;
    disbursedAmount: number;
    providerRef: string | null;
    stripeBalanceTxId: string | null;
    availableOn: string | null;
    clubAvailableOn: string | null;
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
const fecha = (v: string | null) => {
    if (!v) return '—';
    try { return new Date(v).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' }); }
    catch { return '—'; }
};

const CHIP: Record<string, string> = {
    confirmado: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    verificado: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    enviado: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    disponible: 'bg-sky-50 text-sky-700 border-sky-200',
    parcial: 'bg-amber-50 text-amber-800 border-amber-200',
    por_liberar: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    reembolsado: 'bg-rose-50 text-rose-700 border-rose-200',
    error: 'bg-red-50 text-red-700 border-red-200',
    fallido: 'bg-red-50 text-red-700 border-red-200',
};

const RegistrationFundsPanel = ({ fund, missing, outsideStripe, eventId, clubId, onChanged }: {
    /** El movimiento de la inscripción en la Bóveda, si lo tiene. */
    fund: RegistrationFund | null;
    /** Pagada por Stripe y todavía sin movimiento en la Bóveda. */
    missing: boolean;
    /** Pagada por fuera de la pasarela: no hay movimiento que conciliar. */
    outsideStripe: boolean;
    eventId: string;
    clubId?: string;
    onChanged: () => void;
}) => {
    const [resend, setResend] = useState(false);
    const [registering, setRegistering] = useState(false);
    const [message, setMessage] = useState('');

    const registrar = async () => {
        setRegistering(true); setMessage('');
        try {
            const { data } = await axios.post(`${API}/financial/wallet/rebuild-collections`,
                { ...(clubId ? { clubId } : {}), eventId, apply: true },
                { headers: { Authorization: `Bearer ${localStorage.getItem('rotary_token')}` } });
            const fallas = Object.keys(data?.noReconstruidos || {});
            setMessage(data?.reconstruidos
                ? 'Movimiento registrado en la Bóveda.'
                : `No se pudo registrar${fallas.length ? `: ${fallas.join(', ')}` : ''}.`);
            onChanged();
        } catch (e: any) {
            setMessage(e?.response?.data?.error || 'No se pudo registrar el movimiento.');
        } finally { setRegistering(false); }
    };

    const titulo = (
        <p className="mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-gray-500">
            <Landmark className="h-3.5 w-3.5" /> Traslado al beneficiario y comprobante
        </p>
    );

    if (!fund) {
        if (!missing && !outsideStripe) return null;
        return (
            <section className="rounded-xl border border-gray-100 bg-white p-5">
                {titulo}
                {missing ? (
                    <>
                        <p className="text-xs text-gray-600">
                            El pago de esta inscripción entró por Stripe, pero todavía no tiene su movimiento en la Bóveda.
                            Sin él no se puede registrar el traslado ni enviar el comprobante.
                        </p>
                        <button type="button" onClick={registrar} disabled={registering}
                            className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-amber-700 disabled:opacity-50">
                            {registering ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Landmark className="h-3.5 w-3.5" />}
                            Registrar movimiento en la Bóveda
                        </button>
                    </>
                ) : (
                    <p className="text-xs text-gray-600">
                        Esta inscripción se marcó como pagada por fuera de la pasarela: no tiene un movimiento de Stripe
                        que trasladar ni conciliar desde aquí.
                    </p>
                )}
                {message && <p className="mt-2 text-xs text-gray-600">{message}</p>}
            </section>
        );
    }

    const s = fund.states;
    const trasladado = s.traslado === 'confirmado' || s.traslado === 'parcial';
    const restante = Math.max(0, fund.amount - (fund.disbursedAmount || 0));

    return (
        <section className="rounded-xl border border-gray-100 bg-white p-5">
            {titulo}

            {/* Lo mismo que «Ver traslado y conciliación» en la Bóveda. */}
            <div className="rounded-lg border border-violet-100 bg-violet-50/60 p-3">
                <button type="button" onClick={() => setResend(true)} disabled={!trasladado}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-violet-300 bg-white px-3 py-2 text-xs font-bold text-violet-800 hover:border-violet-500 disabled:cursor-not-allowed disabled:opacity-50">
                    <Send className="h-3.5 w-3.5" /> Enviar comprobante de traslado
                </button>
                <p className="mt-1.5 text-[11px] text-violet-900/80">
                    {trasladado
                        ? 'Envía por correo el comprobante de la conciliación (PDF), con adjuntos opcionales, vista previa e historial de a quién se le envió.'
                        : 'Primero registra el traslado al beneficiario (abajo, «Registrar desembolso»), con su comprobante PDF. Después podrás enviar el comprobante por correo.'}
                </p>
            </div>

            {/* Los cinco estados: un pago confirmado no es un traslado. */}
            <div className="mt-3 flex flex-wrap gap-1.5">
                {(['pago', 'stripe', 'liquidacion', 'traslado', 'comprobante'] as const).map(g => (
                    <span key={g} className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${CHIP[s[g]] || 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                        {g === 'pago' ? 'Pago' : g === 'stripe' ? 'Stripe' : g === 'liquidacion' ? 'Liquidación' : g === 'traslado' ? 'Traslado' : 'Comprobante'}: {(FUND_STATE_LABELS[g] as Record<string, string>)[s[g]] || s[g]}
                    </span>
                ))}
            </div>

            <div className="mt-3 space-y-1.5 rounded-lg bg-gray-50 p-3 text-xs">
                <div className="flex justify-between text-gray-700"><span>Monto pagado por el inscrito</span><span className="font-mono font-semibold text-gray-900">{money(fund.grossAmount, fund.currency)}</span></div>
                <div className="flex justify-between text-gray-500"><span>− Comisiones (Stripe y plataforma)</span><span className="font-mono">−{money(fund.fee, fund.currency)}</span></div>
                <div className="flex justify-between border-t border-gray-200 pt-1.5 font-bold text-gray-900"><span>Neto del evento</span><span className="font-mono">{money(fund.amount, fund.currency)}</span></div>
                {fund.disbursedAmount > 0 && (
                    <div className="flex justify-between text-violet-700"><span>Trasladado al beneficiario</span><span className="font-mono">{money(fund.disbursedAmount, fund.currency)}{restante > 0.005 ? ` · falta ${money(restante, fund.currency)}` : ''}</span></div>
                )}
            </div>

            <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1.5 text-xs sm:grid-cols-2">
                <div><dt className="text-gray-400">Stripe libera</dt><dd className="text-gray-800">{fecha(fund.availableOn)}</dd></div>
                <div><dt className="text-gray-400">Disponible para retiro</dt><dd className="text-gray-800">{fecha(fund.clubAvailableOn)}</dd></div>
                {fund.stripeBalanceTxId && <div><dt className="text-gray-400">Transacción Stripe</dt><dd className="break-all font-mono text-[11px] text-gray-800">{fund.stripeBalanceTxId}</dd></div>}
                {fund.providerRef && <div><dt className="text-gray-400">Referencia del pago</dt><dd className="break-all font-mono text-[11px] text-gray-800">{fund.providerRef}</dd></div>}
            </dl>

            {!fund.stripeBalanceTxId && (
                <p className="mt-2 flex items-start gap-1.5 text-[11px] text-amber-700">
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    Todavía no está atado a su movimiento en Stripe. Usa «Verificar con Stripe» en la pestaña «Conciliación de fondos».
                </p>
            )}

            {/* Desembolsos: registrar el traslado con su comprobante PDF, ver el
                comprobante del giro, reenviar el aviso o reversar. */}
            <div className="mt-3 border-t border-gray-100">
                <DisbursementSection paymentId={fund.paymentId} clubId={clubId} netAmount={fund.amount} currency={fund.currency} />
            </div>

            {resend && (
                <ResendNoticeModal
                    paymentIds={[fund.paymentId]}
                    clubId={clubId}
                    onCerrar={() => setResend(false)}
                    onEnviado={onChanged}
                />
            )}
        </section>
    );
};

export default RegistrationFundsPanel;
