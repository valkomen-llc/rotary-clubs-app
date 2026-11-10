// ════════════════════════════════════════════════════════════════════
// Sustituir una postulación por otra del mismo club, con su pago — v4.1311
//
// Se abre desde la ficha del proyecto que SE RETIRA. Dos pasos, los dos
// resueltos por el servidor:
//   1. Verificar: la base, Stripe y la Bóveda, contra lo que el comité informa.
//      Cualquier diferencia se muestra y bloquea.
//   2. Aplicar: con la huella de lo verificado, en una sola transacción.
// La pantalla no decide nada: pinta el veredicto (`plan`) que devuelve el
// servidor (`server/lib/projectFairSubstitution.js`).
// ════════════════════════════════════════════════════════════════════
import React, { useState } from 'react';
import { AlertTriangle, ArrowRightLeft, CheckCircle2, Loader2, ShieldCheck, X, XCircle } from 'lucide-react';

type Check = { key: string; label: string; ok: boolean; detail: string | null; blocking: boolean };
type PaymentFacts = {
    status: string | null; origin: string | null; amountReceived: number | null; chargeCurrency: string | null;
    amountCop: number | null; amountUsd: number | null; paidAt: string | null;
    stripePaymentIntentId: string | null; stripeSessionId: string | null; manualPaymentRef: string | null;
};
type ProjectSide = {
    id: string; publicRef: string; projectName: string; clubName: string; district: string;
    responsable: string; email: string; workflowStatus: string; payment: PaymentFacts;
};
type StripeFacts = { found: boolean; id?: string; livemode?: boolean; status?: string; refunded?: boolean; billingName?: string | null; billingEmail?: string | null; error?: string } | null;
export type SubstitutionPlan = {
    ok: boolean; alreadyApplied: boolean; checks: Check[]; blocking: string[]; fingerprint: string;
    retired: ProjectSide | null; kept: ProjectSide | null;
    payer: { name: string | null; email: string | null; gatewayName: string | null; gatewayEmail: string | null } | null;
    retiredStripe: StripeFacts; keptStripe: StripeFacts;
    replacedPayment: { kind: string; label: string; realMoney: boolean | null };
    ledger: { retiredMovement: { found: boolean } | null; keptMovement: { found: boolean } | null };
    expected: { amount: number | null; currency: 'COP' | 'USD' };
};

type Props = {
    submission: { publicRef: string; projectName: string; clubName: string; amountCop: number | null; amountUsd: number | null };
    endpoint: (path: string) => string;
    headers: () => Record<string, string>;
    onClose: () => void;
    onApplied: () => void;
};

const money = (n: number | null | undefined, currency?: string | null) => {
    if (n === null || n === undefined) return '—';
    const c = String(currency || '').toUpperCase();
    return c === 'USD'
        ? `US$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        : `$${Number(n).toLocaleString('es-CO', { maximumFractionDigits: 0 })}${c ? ` ${c}` : ''}`;
};
const when = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' }) : '—');

const Fact = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="flex justify-between gap-3 border-b border-slate-100 py-1 text-xs">
        <span className="font-semibold text-slate-500">{label}</span>
        <span className="break-all text-right text-slate-800">{children}</span>
    </div>
);

const SustituirPostulacion = ({ submission, endpoint, headers, onClose, onApplied }: Props) => {
    const [keptRef, setKeptRef] = useState('');
    const [amount, setAmount] = useState(String(submission.amountCop ?? submission.amountUsd ?? ''));
    const [currency, setCurrency] = useState<'COP' | 'USD'>(submission.amountCop != null ? 'COP' : 'USD');
    const [plan, setPlan] = useState<SubstitutionPlan | null>(null);
    const [reason, setReason] = useState('');
    const [reviewed, setReviewed] = useState(false);
    const [busy, setBusy] = useState<'verify' | 'apply' | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [done, setDone] = useState(false);

    const body = () => ({ retiredRef: submission.publicRef, keptRef: keptRef.trim().toUpperCase(), amount: amount === '' ? null : Number(amount), currency });

    const verify = async () => {
        setBusy('verify'); setError(null); setPlan(null); setReviewed(false);
        try {
            const res = await fetch(endpoint('sustitucion/verificar'), { method: 'POST', headers: headers(), body: JSON.stringify(body()) });
            const d = await res.json().catch(() => null);
            if (!res.ok || !d?.plan) throw new Error(d?.error || 'No se pudo verificar.');
            setPlan(d.plan);
            if (d.plan.kept && !reason) {
                setReason(`Consolidación administrativa solicitada por la organización. El proyecto que participará es «${d.plan.kept.projectName}» (${d.plan.kept.publicRef}). El pago oficial fue reasignado al proyecto conservado.`);
            }
        } catch (e: any) {
            setError(e?.message || 'No se pudo verificar.');
        } finally { setBusy(null); }
    };

    const apply = async () => {
        if (!plan) return;
        setBusy('apply'); setError(null);
        try {
            const res = await fetch(endpoint('sustitucion/aplicar'), {
                method: 'POST', headers: headers(),
                body: JSON.stringify({ ...body(), reason, fingerprint: plan.fingerprint, confirm: true }),
            });
            const d = await res.json().catch(() => null);
            if (d?.plan) setPlan(d.plan);
            if (!res.ok) throw new Error(d?.error || 'No se aplicó la sustitución.');
            setDone(true);
            onApplied();
        } catch (e: any) {
            setError(e?.message || 'No se aplicó la sustitución.');
        } finally { setBusy(null); }
    };

    const off = plan?.retired?.payment;
    const prev = plan?.kept?.payment;
    const canApply = !!plan?.ok && reviewed && reason.trim().length >= 10 && !busy && !done;

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 p-4" onClick={e => e.stopPropagation()}>
            <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="sustituir-titulo">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-2">
                        <ArrowRightLeft size={20} className="text-blue-700" />
                        <div>
                            <h3 id="sustituir-titulo" className="text-base font-bold text-slate-900">Sustituir por otro proyecto del club</h3>
                            <p className="text-xs text-slate-500">{submission.publicRef} · {submission.projectName}</p>
                        </div>
                    </div>
                    <button onClick={onClose} aria-label="Cerrar" className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
                </div>

                <p className="mt-4 text-xs leading-relaxed text-slate-600">
                    Este proyecto se <strong>archiva</strong> y su pago pasa a <strong>respaldar la inscripción</strong> del proyecto que se conserva.
                    El dinero no cambia de lugar: la transacción, su referencia, la persona que pagó y el comprobante se quedan como están.
                    No se crea ningún cobro nuevo. El pago anterior del proyecto conservado se identifica y se guarda; no se elimina ni se reembolsa.
                </p>

                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <label className="block sm:col-span-1">
                        <span className="mb-1 block text-xs font-semibold text-slate-600">Proyecto que se conserva</span>
                        <input value={keptRef} onChange={e => { setKeptRef(e.target.value); setPlan(null); }} placeholder="FP-XXXXXX"
                            className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm uppercase" disabled={done} />
                    </label>
                    <label className="block">
                        <span className="mb-1 block text-xs font-semibold text-slate-600">Importe del pago oficial informado</span>
                        <input value={amount} onChange={e => { setAmount(e.target.value.replace(/[^\d.]/g, '')); setPlan(null); }} inputMode="decimal"
                            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" disabled={done} />
                    </label>
                    <label className="block">
                        <span className="mb-1 block text-xs font-semibold text-slate-600">Moneda</span>
                        <select value={currency} onChange={e => { setCurrency(e.target.value as 'COP' | 'USD'); setPlan(null); }}
                            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" disabled={done}>
                            <option value="COP">COP</option>
                            <option value="USD">USD</option>
                        </select>
                    </label>
                </div>
                <button onClick={verify} disabled={!keptRef.trim() || !amount || !!busy || done}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-800 hover:bg-slate-50 disabled:opacity-50">
                    {busy === 'verify' ? <Loader2 size={13} className="animate-spin" /> : <ShieldCheck size={13} />} Verificar en la base, Stripe y la Bóveda
                </button>

                {error && (
                    <p className="mt-3 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800"><AlertTriangle size={14} className="mt-0.5 shrink-0" /> {error}</p>
                )}

                {plan && (
                    <div className="mt-4 space-y-4">
                        {plan.alreadyApplied && (
                            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
                                Esta sustitución ya estaba aplicada. No hay nada que cambiar.
                            </p>
                        )}
                        {!plan.alreadyApplied && (
                            <div className={`rounded-xl border p-3 ${plan.ok ? 'border-emerald-200 bg-emerald-50/50' : 'border-red-200 bg-red-50/50'}`}>
                                <p className={`text-xs font-bold ${plan.ok ? 'text-emerald-900' : 'text-red-900'}`}>
                                    {plan.ok ? 'Todas las comprobaciones pasan.' : 'Hay diferencias: no se puede aplicar. Revísalas antes de continuar.'}
                                </p>
                                <ul className="mt-2 space-y-1.5">
                                    {plan.checks.map(c => (
                                        <li key={c.key} className="flex items-start gap-2 text-xs">
                                            {c.ok ? <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-emerald-600" /> : <XCircle size={14} className="mt-0.5 shrink-0 text-red-600" />}
                                            <span>
                                                <span className="font-semibold text-slate-800">{c.label}</span>
                                                {c.detail && <span className="block text-slate-500">{c.detail}</span>}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {plan.retired && plan.kept && (
                            <div className="grid gap-3 sm:grid-cols-2">
                                <div className="rounded-xl border border-slate-200 p-3">
                                    <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-500">Se archiva</p>
                                    <p className="text-sm font-semibold text-slate-900">{plan.retired.publicRef} · {plan.retired.projectName}</p>
                                    <p className="text-xs text-slate-500">{plan.retired.clubName} · {plan.retired.district}</p>
                                    <p className="text-xs text-slate-500">Responsable: {plan.retired.responsable}</p>
                                </div>
                                <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-3">
                                    <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-emerald-700">Se conserva</p>
                                    <p className="text-sm font-semibold text-slate-900">{plan.kept.publicRef} · {plan.kept.projectName}</p>
                                    <p className="text-xs text-slate-500">{plan.kept.clubName} · {plan.kept.district}</p>
                                    <p className="text-xs text-slate-500">Responsable: {plan.kept.responsable} (no cambia)</p>
                                </div>
                            </div>
                        )}

                        {off && (
                            <div className="rounded-xl border border-slate-200 p-3">
                                <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-500">Pago oficial que respaldará la inscripción</p>
                                <Fact label="Valor de la inscripción">{money(plan.expected.currency === 'USD' ? off.amountUsd : off.amountCop, plan.expected.currency)}</Fact>
                                <Fact label="Recibido por la pasarela">{money(off.amountReceived, off.chargeCurrency)}</Fact>
                                <Fact label="Fecha del pago">{when(off.paidAt)}</Fact>
                                <Fact label="Referencia">{off.stripePaymentIntentId || off.stripeSessionId || off.manualPaymentRef || '—'}</Fact>
                                <Fact label="Origen">{off.origin === 'manual_admin' ? 'Confirmación administrativa' : 'Stripe'}{plan.retiredStripe?.found ? ` · ${plan.retiredStripe.livemode ? 'modo real' : 'modo de pruebas'} · ${plan.retiredStripe.status}` : ''}</Fact>
                                <Fact label="Pagado por">{plan.payer?.name || '—'}{plan.payer?.email ? ` · ${plan.payer.email}` : ''}</Fact>
                                {(plan.payer?.gatewayName || plan.payer?.gatewayEmail) && (
                                    <Fact label="Titular en la pasarela">{[plan.payer?.gatewayName, plan.payer?.gatewayEmail].filter(Boolean).join(' · ')}</Fact>
                                )}
                                <Fact label="Movimiento en la Bóveda">{plan.ledger.retiredMovement?.found ? 'Registrado (no se modifica)' : 'Sin movimiento'}</Fact>
                            </div>
                        )}

                        {prev && (
                            <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3">
                                <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-amber-800">Pago anterior del proyecto conservado</p>
                                <p className="mb-1 text-xs font-semibold text-amber-950">{plan.replacedPayment.label}</p>
                                <Fact label="Estado">{prev.status || '—'}</Fact>
                                <Fact label="Importe">{money(prev.amountReceived, prev.chargeCurrency)}</Fact>
                                <Fact label="Referencia">{prev.stripePaymentIntentId || prev.stripeSessionId || prev.manualPaymentRef || '—'}</Fact>
                                <Fact label="Movimiento en la Bóveda">{plan.ledger.keptMovement?.found ? 'Registrado (se conserva)' : 'Sin movimiento'}</Fact>
                                <p className="mt-1 text-[11px] text-amber-900/80">Se guarda entero en el historial de la ficha y deja de contarse como pago de la inscripción. No se elimina ni se reembolsa.</p>
                            </div>
                        )}

                        {plan.ok && !done && (
                            <div className="space-y-3">
                                <label className="block">
                                    <span className="mb-1 block text-xs font-semibold text-slate-600">Motivo (queda en la auditoría de las dos fichas)</span>
                                    <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3}
                                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                                </label>
                                <label className="flex items-start gap-2 text-xs text-slate-700">
                                    <input type="checkbox" checked={reviewed} onChange={e => setReviewed(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-slate-300" />
                                    Revisé las comprobaciones y autorizo la sustitución en mi nombre.
                                </label>
                                <button onClick={apply} disabled={!canApply}
                                    className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-4 py-2 text-sm font-bold text-white hover:bg-blue-800 disabled:opacity-50">
                                    {busy === 'apply' ? <Loader2 size={14} className="animate-spin" /> : <ArrowRightLeft size={14} />} Aplicar sustitución
                                </button>
                            </div>
                        )}

                        {done && (
                            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
                                <p className="font-bold">Sustitución aplicada.</p>
                                <p className="mt-1">{plan.retired?.publicRef} quedó archivado. {plan.kept?.publicRef} queda respaldado por el pago oficial. Las dos fichas tienen el registro de auditoría.</p>
                                <button onClick={onClose} className="mt-2 rounded-lg border border-emerald-300 bg-white px-3 py-1.5 font-semibold text-emerald-800 hover:bg-emerald-100">Cerrar</button>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default SustituirPostulacion;
