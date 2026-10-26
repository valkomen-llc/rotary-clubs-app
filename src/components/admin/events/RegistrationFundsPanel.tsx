// ════════════════════════════════════════════════════════════════════════════
// «Conciliación y comprobante de traslado» en la ficha de una inscripción —
// v4.1250 (reemplaza el bloque de v4.1249, que exigía un movimiento en la
// Bóveda de Fondos y ofrecía crear ese movimiento allá).
//
// Todo dentro del módulo de Eventos (/api/event-funds):
//   · Información del pago (proceso A): lo que pagó el participante por Stripe.
//   · Información del traslado (proceso B): al beneficiario del evento
//     (Concorrotarios u otro), con su estado. Un pago confirmado NO es un
//     traslado confirmado.
//   · «Gestionar traslado y comprobante»: registrar el traslado (individual),
//     adjuntar el PDF, confirmarlo con evidencia y enviarlo por correo.
//   · «Historial financiero y comprobantes».
// ════════════════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useState } from 'react';
import { Landmark, Loader2, ShieldCheck, History, ArrowRightLeft } from 'lucide-react';
import { fundsApi, money, fecha, fechaHora, STATUS_CLS, type RegistrationFundsDetail } from './funds/eventFundsApi';
import TransferCard from './funds/TransferCard';
import TransferFormModal, { restanteDe } from './funds/TransferFormModal';
import { REGISTRATION_TRANSFER_LABELS } from '../../../../server/lib/eventFundsSpec.js';

const Fila = ({ k, v, mono }: { k: string; v: string; mono?: boolean }) => (
    <div className="flex justify-between gap-3 py-0.5">
        <span className="text-gray-500">{k}</span>
        <span className={`text-right text-gray-900 ${mono ? 'break-all font-mono text-[11px]' : 'font-semibold'}`}>{v}</span>
    </div>
);

const RegistrationFundsPanel = ({ eventId, registrationId, onChanged }: {
    eventId: string;
    registrationId: string;
    onChanged?: () => void;
}) => {
    const [data, setData] = useState<RegistrationFundsDetail | null>(null);
    const [hidden, setHidden] = useState(false);
    const [error, setError] = useState('');
    const [form, setForm] = useState(false);
    const [verifying, setVerifying] = useState(false);
    const [showHistory, setShowHistory] = useState(false);

    const load = useCallback(() => {
        fundsApi.registration(eventId, registrationId)
            .then(d => { setData(d); setError(''); })
            .catch(e => {
                // Sin la capacidad «Gestionar pagos» el servidor contesta 404: no se pinta.
                if (e?.status === 404 || e?.status === 403) setHidden(true);
                else setError(e?.message || 'No se pudo cargar la conciliación.');
            });
    }, [eventId, registrationId]);
    useEffect(() => { load(); }, [load]);

    const cambio = () => { load(); onChanged?.(); };

    if (hidden) return null;

    const titulo = (
        <p className="mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-gray-500">
            <Landmark className="h-3.5 w-3.5" /> Conciliación y comprobante de traslado
        </p>
    );
    if (!data) {
        return (
            <section className="rounded-xl border border-gray-100 bg-white p-5">
                {titulo}
                {error ? <p className="text-xs text-red-700">{error}</p> : <Loader2 className="h-5 w-5 animate-spin text-blue-600" />}
            </section>
        );
    }

    const r = data.registration;
    const p = r.payment;
    const restante = restanteDe(r);
    const verificar = async () => {
        setVerifying(true);
        try { await fundsApi.verifyStripe(eventId, [r.id]); load(); } catch (e: any) { setError(e?.message || 'No se pudo verificar con Stripe.'); }
        finally { setVerifying(false); }
    };

    return (
        <section className="rounded-xl border border-gray-100 bg-white p-5">
            {titulo}

            {/* Proceso A — el pago del participante */}
            <div className="rounded-lg bg-gray-50 p-3 text-xs">
                <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">Pago de la inscripción</p>
                <Fila k="Participante" v={`${r.name || '—'} · ${r.code || '—'}`} />
                <Fila k="Evento" v={data.event.title} />
                <Fila k="Estado del pago" v={p.status === 'confirmado' ? 'Confirmado' : p.status === 'reembolsado' ? 'Reembolsado' : p.status === 'fallido' ? 'Fallido' : 'Pendiente'} />
                <Fila k="Fecha del pago" v={fechaHora(p.paidAt)} />
                <Fila k="Valor pagado" v={money(p.charged, p.currency)} />
                {p.surcharge > 0 && <Fila k="− Recargo de la pasarela (lo pagó el participante)" v={money(p.surcharge, p.currency)} />}
                {p.refunded > 0 && <Fila k="− Reembolsado" v={money(p.refunded, p.currency)} />}
                <Fila k="Le corresponde al evento" v={money(p.eventAmount, p.currency)} />
                {p.paymentIntentId && <Fila k="Referencia Stripe" v={p.paymentIntentId} mono />}
                {p.stripe && !p.stripe.error && (
                    <>
                        <Fila k="Comisión real de Stripe" v={money(p.stripe.fee, p.stripe.currency)} />
                        <Fila k="Neto en Stripe" v={money(p.stripe.net, p.stripe.currency)} />
                        <Fila k="Stripe libera" v={fecha(p.stripe.availableOn)} />
                    </>
                )}
                {p.stripe?.error && <p className="mt-1 text-amber-700">Stripe: {p.stripe.error}</p>}
                {p.viaStripe && p.paymentIntentId && (
                    <button type="button" onClick={verificar} disabled={verifying}
                        className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-sky-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-sky-800 disabled:opacity-50">
                        {verifying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                        {p.stripe ? `Volver a verificar con Stripe (${fechaHora(p.stripe.checkedAt)})` : 'Verificar con Stripe'}
                    </button>
                )}
            </div>

            {/* Proceso B — el traslado al beneficiario */}
            <div className="mt-3 text-xs">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                        Traslado a {data.config?.beneficiaryName || 'el beneficiario del evento'}
                    </p>
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${STATUS_CLS[r.transferState] || STATUS_CLS.pendiente}`}>
                        {REGISTRATION_TRANSFER_LABELS[r.transferState]}
                    </span>
                </div>
                {!data.config?.beneficiaryName && (
                    <p className="mb-2 text-amber-700">El beneficiario del evento todavía no está configurado (pestaña «Conciliación de inscripciones»).</p>
                )}
                {data.transfers.length === 0 && p.status === 'confirmado' && (
                    <p className="mb-2 text-gray-600">Todavía no hay un traslado registrado para este pago. Si se trasladó junto con otras inscripciones, regístralo como consolidado desde «Conciliación de inscripciones».</p>
                )}
                <div className="space-y-2">
                    {data.transfers.map(t => (
                        <TransferCard key={t.id} eventId={eventId} transfer={t} canApprove={data.canApprove}
                            statusLabels={data.statusLabels} methods={data.methods} onChanged={cambio} highlightRegistrationId={r.id} />
                    ))}
                </div>
                {p.status === 'confirmado' && restante > 0.005 && (
                    <button type="button" onClick={() => setForm(true)}
                        className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-rotary-blue px-3.5 py-2 text-xs font-bold text-white">
                        <ArrowRightLeft className="h-3.5 w-3.5" /> Gestionar traslado y comprobante
                    </button>
                )}
                {p.status === 'confirmado' && restante > 0.005 && r.allocated > 0 && (
                    <p className="mt-1 text-[11px] text-gray-500">Falta por asignar a un traslado: {money(restante, p.currency)}</p>
                )}
            </div>

            {/* Historial */}
            <div className="mt-3 border-t border-gray-100 pt-3 text-xs">
                <button type="button" onClick={() => setShowHistory(v => !v)} className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-gray-500">
                    <History className="h-3.5 w-3.5" /> Historial financiero y comprobantes ({data.history.length})
                </button>
                {showHistory && (
                    <ol className="mt-2 space-y-1.5 border-l-2 border-gray-100 pl-3">
                        {data.history.map((h, i) => (
                            <li key={i}>
                                <p className="font-semibold text-gray-800">
                                    {h.label}{h.toState ? ` → ${data.statusLabels[h.toState] || h.toState}` : ''}
                                </p>
                                <p className="text-[11px] text-gray-500">
                                    {fechaHora(h.at)} · {h.actor}{h.reference ? ` · ref. ${h.reference}` : ''}{h.detail ? ` · ${h.detail}` : ''}
                                </p>
                            </li>
                        ))}
                    </ol>
                )}
            </div>

            {form && (
                <TransferFormModal eventId={eventId} config={data.config} registrations={[r]} methods={data.methods}
                    onClose={() => setForm(false)} onSaved={() => { setForm(false); cambio(); }} />
            )}
        </section>
    );
};

export default RegistrationFundsPanel;
