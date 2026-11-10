// ════════════════════════════════════════════════════════════════════
// Editar el valor de la inscripción de UN proyecto — v4.1313
//
// Se abre desde la ficha del proyecto (Postulación de Proyectos y Centro de
// Gestión del Evento). El comité cambia la LÍNEA del proyecto: 250.000 →
// 100.000, o cualquier otro valor, con un motivo obligatorio. El servidor
// decide si se puede (`amountOverridePlan`) y deja el antes/después en el
// historial. Lo que el club paga desde su perfil, el desglose de la
// inscripción y la confirmación manual leen ese mismo valor.
// ════════════════════════════════════════════════════════════════════
import { useState } from 'react';
import { AlertTriangle, Loader2, Pencil, RotateCcw, X } from 'lucide-react';

export type AmountOverride = {
    amount: number; currency: 'COP' | 'USD'; tariff: number | null; previous: number | null;
    reason: string | null; by: string | null; at: string | null;
};

export type FairPricing = { currency: 'COP' | 'USD'; first: number; second: number; tariff: number } | null;

type Props = {
    submission: {
        publicRef: string; projectName: string; projectIndex?: number; projectIndexLabel?: string;
        paymentStatus: string; amountCop: number | null; amountUsd: number | null;
        amountReceived?: number | null; amountOverride?: AmountOverride | null;
        coveredBy?: { id: string; publicRef: string | null } | null;
    };
    pricing: FairPricing;
    endpoint: string;
    headers: () => Record<string, string>;
    onClose: () => void;
    onSaved: () => void;
};

export const formatoValor = (n: number | null | undefined, currency: 'COP' | 'USD') => {
    if (n === null || n === undefined || !Number.isFinite(Number(n))) return '—';
    return currency === 'USD'
        ? `US$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        : `$${Number(n).toLocaleString('es-CO', { maximumFractionDigits: 0 })} COP`;
};

/** Mismo criterio que `parseAmountInput` del servidor (sólo para la vista previa). */
export const leerValor = (v: string): number => {
    const t = String(v ?? '').replace(/[\s$]/g, '').replace(/(COP|USD)$/i, '');
    if (!t) return NaN;
    if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+([.,]\d{1,2})?$/.test(t)) return NaN;
    const sinMiles = /^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(t) ? t.replace(/\./g, '') : t;
    return Number(sinMiles.replace(',', '.'));
};

const EditarValorProyecto = ({ submission, pricing, endpoint, headers, onClose, onSaved }: Props) => {
    const currency: 'COP' | 'USD' = pricing?.currency || (submission.amountCop ? 'COP' : 'USD');
    const actual = currency === 'USD' ? submission.amountUsd : submission.amountCop;
    const [valor, setValor] = useState<string>(actual ? String(actual) : '');
    const [motivo, setMotivo] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const paid = submission.paymentStatus === 'paid';
    const nuevo = leerValor(valor);
    const valido = Number.isFinite(nuevo) && nuevo > 0;
    const sugerencias = [
        pricing?.first ? { label: 'Tarifa primer proyecto', amount: pricing.first } : null,
        pricing?.second ? { label: 'Tarifa segundo proyecto', amount: pricing.second } : null,
    ].filter(Boolean) as { label: string; amount: number }[];

    const enviar = async (body: Record<string, unknown>) => {
        setError(null);
        if (motivo.trim().length < 5) { setError('Escribe el motivo del cambio (mínimo 5 caracteres).'); return; }
        setSaving(true);
        try {
            const res = await fetch(endpoint, { method: 'POST', headers: headers(), body: JSON.stringify({ ...body, reason: motivo.trim() }) });
            const d = await res.json().catch(() => null);
            if (!res.ok) throw new Error(d?.error || 'No se pudo cambiar el valor.');
            onSaved();
        } catch (e: any) {
            setError(e?.message || 'No se pudo cambiar el valor.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 p-4" onClick={e => { e.stopPropagation(); if (!saving) onClose(); }}>
            <div role="dialog" aria-modal="true" aria-labelledby="editar-valor-titulo"
                className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
                <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-2">
                        <Pencil size={18} className="text-blue-700" />
                        <div>
                            <h3 id="editar-valor-titulo" className="text-base font-bold text-slate-900">Editar valor de la inscripción</h3>
                            <p className="text-xs text-slate-500">{submission.publicRef} · {submission.projectIndexLabel || 'Primer proyecto'}</p>
                        </div>
                    </div>
                    <button onClick={onClose} disabled={saving} aria-label="Cerrar" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
                </div>

                <p className="mt-3 text-sm font-semibold text-slate-800">{submission.projectName}</p>

                <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-lg bg-slate-50 p-2.5">
                        <dt className="font-semibold uppercase tracking-wide text-slate-500">Valor actual</dt>
                        <dd className="mt-0.5 text-sm font-bold text-slate-900">{formatoValor(actual, currency)}</dd>
                    </div>
                    <div className="rounded-lg bg-slate-50 p-2.5">
                        <dt className="font-semibold uppercase tracking-wide text-slate-500">Tarifa de su posición</dt>
                        <dd className="mt-0.5 text-sm font-bold text-slate-900">{formatoValor(pricing?.tariff ?? null, currency)}</dd>
                    </div>
                </dl>

                {submission.amountOverride && (
                    <p className="mt-3 rounded-lg bg-violet-50 px-3 py-2 text-xs text-violet-900">
                        <strong>Valor ajustado por el comité</strong>
                        {submission.amountOverride.by ? ` · ${submission.amountOverride.by}` : ''}
                        {submission.amountOverride.at ? ` · ${new Date(submission.amountOverride.at).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' })}` : ''}
                        {submission.amountOverride.reason ? <><br />Motivo: {submission.amountOverride.reason}</> : null}
                    </p>
                )}

                <label className="mt-4 block">
                    <span className="mb-1 block text-xs font-semibold text-slate-600">Nuevo valor ({currency})</span>
                    <input
                        type="text" inputMode="decimal" autoFocus value={valor}
                        onChange={e => setValor(e.target.value)}
                        placeholder={currency === 'USD' ? '100.00' : '100000'}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-base font-semibold text-slate-900 focus:border-blue-600 focus:outline-none"
                    />
                    <span className="mt-1 block text-xs text-slate-500">
                        {valido ? `Quedará en ${formatoValor(nuevo, currency)}` : 'Escribe el valor sin símbolos, por ejemplo 100000.'}
                    </span>
                </label>

                {sugerencias.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                        {sugerencias.map(sg => (
                            <button key={sg.label} type="button" onClick={() => setValor(String(sg.amount))}
                                className="rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                                {sg.label}: {formatoValor(sg.amount, currency)}
                            </button>
                        ))}
                    </div>
                )}

                <label className="mt-4 block">
                    <span className="mb-1 block text-xs font-semibold text-slate-600">Motivo del cambio <span className="text-rose-600">*</span></span>
                    <textarea value={motivo} onChange={e => setMotivo(e.target.value)} rows={2} maxLength={1000}
                        placeholder="Ej.: tarifa especial del segundo proyecto aprobada por el comité"
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-600 focus:outline-none" />
                </label>

                <div className={`mt-3 flex gap-2 rounded-lg px-3 py-2 text-xs ${paid ? 'bg-amber-50 text-amber-900' : 'bg-sky-50 text-sky-900'}`}>
                    <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                    <p>
                        {paid
                            ? 'Este proyecto ya está pagado. Cambias el valor de su inscripción (lo que suma al recaudo y al saldo); no cambia lo recibido por la pasarela, ni genera cobros ni reembolsos.'
                            : 'El club pagará este valor desde su perfil y es el que se propone al confirmar el pago a mano. Si tenía un pago abierto con el valor anterior, se cierra.'}
                        {submission.coveredBy ? ` Su pago está registrado en ${submission.coveredBy.publicRef || 'otro proyecto de la inscripción'}.` : ''}
                    </p>
                </div>

                {error && <p role="alert" className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800">{error}</p>}

                <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-4">
                    {submission.amountOverride && pricing?.tariff ? (
                        <button type="button" onClick={() => enviar({ clear: true })} disabled={saving}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                            <RotateCcw size={13} /> Volver a la tarifa ({formatoValor(pricing.tariff, currency)})
                        </button>
                    ) : <span />}
                    <div className="flex gap-2">
                        <button type="button" onClick={onClose} disabled={saving}
                            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancelar</button>
                        <button type="button" onClick={() => enviar({ amount: valor })} disabled={saving || !valido}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-700 px-4 py-2 text-sm font-bold text-white hover:bg-blue-800 disabled:opacity-50">
                            {saving && <Loader2 size={14} className="animate-spin" />} Guardar valor
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default EditarValorProyecto;
