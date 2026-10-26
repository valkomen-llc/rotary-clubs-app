// «Registrar traslado» — v4.1250. Individual (una inscripción) o consolidado
// (varias inscripciones del evento en UNA operación, con un solo comprobante).
// Registrar un traslado NO mueve dinero: deja constancia de una operación hecha
// por fuera (banco o payout de Stripe). El servidor vuelve a validar todo.
import { useMemo, useState } from 'react';
import { X, Loader2, Landmark, AlertCircle, Upload } from 'lucide-react';
import { fundsApi, money, type FundsConfig, type FundsRegistration } from './eventFundsApi';

const inputCls = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500';
const labelCls = 'mb-1 block text-xs font-semibold text-gray-600';

/** Lo que todavía se puede trasladar de una inscripción. */
export const restanteDe = (r: FundsRegistration) => Math.max(0, Math.round((r.payment.eventAmount - r.allocated) * 100) / 100);

const TransferFormModal = ({ eventId, config, registrations, methods, onClose, onSaved }: {
    eventId: string;
    config: FundsConfig | null;
    /** Las inscripciones que cubre este traslado (una = individual). */
    registrations: FundsRegistration[];
    methods: { id: string; label: string }[];
    onClose: () => void;
    onSaved: () => void;
}) => {
    const currency = registrations[0]?.payment.currency || 'USD';
    const mezcla = registrations.some(r => r.payment.currency !== currency);
    const [montos, setMontos] = useState<Record<string, string>>(
        () => Object.fromEntries(registrations.map(r => [r.id, String(restanteDe(r))])));
    const asignado = useMemo(() => Math.round(registrations.reduce((s, r) => s + (Number(montos[r.id]) || 0), 0) * 100) / 100, [montos, registrations]);
    const [amount, setAmount] = useState<string>(() => String(Math.round(registrations.reduce((s, r) => s + restanteDe(r), 0) * 100) / 100));
    const [transferDate, setTransferDate] = useState('');
    const [reference, setReference] = useState('');
    const [method, setMethod] = useState(methods[0]?.id || '');
    const [notes, setNotes] = useState('');
    const [status, setStatus] = useState<'pendiente' | 'registrado' | 'pendiente_verificacion'>('pendiente');
    const [file, setFile] = useState<File | null>(null);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const diferencia = Math.round(((Number(amount) || 0) - asignado) * 100) / 100;
    const kind = registrations.length > 1 ? 'consolidado' : 'individual';

    const guardar = async () => {
        setSaving(true); setError('');
        try {
            const form = new FormData();
            form.append('kind', kind);
            form.append('currency', currency);
            form.append('amount', String(Number(amount) || 0));
            form.append('allocations', JSON.stringify(registrations.map(r => ({ registrationId: r.id, amount: Number(montos[r.id]) || 0 }))));
            form.append('transferDate', transferDate);
            form.append('reference', reference);
            form.append('method', method);
            form.append('notes', notes);
            form.append('status', status);
            if (file) form.append('document', file);
            await fundsApi.createTransfer(eventId, form);
            onSaved();
        } catch (e: any) {
            setError(e?.message || 'No se pudo registrar el traslado.');
        } finally { setSaving(false); }
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Registrar traslado">
            <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
                <div className="flex items-start justify-between border-b border-gray-100 px-6 py-4">
                    <div>
                        <h3 className="flex items-center gap-2 font-bold text-gray-900"><Landmark className="h-4 w-4 text-sky-700" /> Registrar traslado {kind === 'consolidado' ? 'consolidado' : 'individual'}</h3>
                        <p className="mt-0.5 text-xs text-gray-500">
                            Deja constancia de una operación hecha hacia la cuenta oficial del evento. No mueve dinero.
                        </p>
                    </div>
                    <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100"><X className="h-5 w-5" /></button>
                </div>

                <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4 text-sm">
                    {!config?.beneficiaryName ? (
                        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                            Configura primero el beneficiario del evento en la pestaña «Conciliación de inscripciones» → Beneficiario del evento.
                        </div>
                    ) : (
                        <div className="rounded-xl border border-sky-100 bg-sky-50/60 p-3 text-xs text-sky-900">
                            Beneficiario: <strong>{config.beneficiaryName}</strong>
                            {config.bankName && <> · {config.bankName}</>}
                            {config.accountMasked && <> · cuenta {config.accountMasked}</>}
                        </div>
                    )}
                    {mezcla && (
                        <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800">
                            Las inscripciones elegidas se cobraron en monedas distintas. Un traslado es de una sola moneda: COP y USD no se mezclan.
                        </p>
                    )}

                    <div>
                        <p className={labelCls}>Inscripciones que cubre ({registrations.length}) — valor asignado a cada una</p>
                        <div className="divide-y divide-gray-100 rounded-xl border border-gray-200">
                            {registrations.map(r => (
                                <div key={r.id} className="flex items-center gap-3 px-3 py-2">
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate font-semibold text-gray-900">{r.name || 'Participante'}</p>
                                        <p className="text-[11px] text-gray-500">{r.code} · le corresponde al evento {money(r.payment.eventAmount, r.payment.currency)}{r.allocated > 0 ? ` · ya asignado ${money(r.allocated, r.payment.currency)}` : ''}</p>
                                    </div>
                                    <input type="number" min="0" step="0.01" value={montos[r.id] ?? ''}
                                        onChange={e => setMontos(m => ({ ...m, [r.id]: e.target.value }))}
                                        className="w-32 rounded-lg border border-gray-300 px-2 py-1.5 text-right text-sm" aria-label={`Valor asignado a ${r.name || r.code}`} />
                                    <span className="w-10 text-xs text-gray-500">{r.payment.currency}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                            <label className={labelCls}>Valor del traslado ({currency})</label>
                            <input type="number" min="0" step="0.01" className={inputCls} value={amount} onChange={e => setAmount(e.target.value)} />
                            <p className={`mt-1 text-[11px] ${Math.abs(diferencia) > 0.005 ? 'text-amber-700' : 'text-gray-400'}`}>
                                Asignado a inscripciones: {money(asignado, currency)}
                                {Math.abs(diferencia) > 0.005 && <> · diferencia por conciliar {money(diferencia, currency)}</>}
                            </p>
                        </div>
                        <div>
                            <label className={labelCls}>Fecha del traslado</label>
                            <input type="date" className={inputCls} value={transferDate} onChange={e => setTransferDate(e.target.value)} />
                        </div>
                        <div>
                            <label className={labelCls}>Referencia (bancaria, de Stripe o del payout)</label>
                            <input type="text" className={inputCls} value={reference} onChange={e => setReference(e.target.value)} placeholder="Ej. 17208637 o po_1Q…" />
                        </div>
                        <div>
                            <label className={labelCls}>Método</label>
                            <select className={`${inputCls} bg-white`} value={method} onChange={e => setMethod(e.target.value)}>
                                {methods.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className={labelCls}>Estado</label>
                            <select className={`${inputCls} bg-white`} value={status} onChange={e => setStatus(e.target.value as typeof status)}>
                                <option value="pendiente">Pendiente de traslado (todavía no se hizo)</option>
                                <option value="registrado">Traslado registrado (ya se hizo)</option>
                                <option value="pendiente_verificacion">Pendiente de verificación</option>
                            </select>
                            <p className="mt-1 text-[11px] text-gray-400">«Confirmado» se marca después, con el comprobante y la referencia.</p>
                        </div>
                        <div>
                            <label className={labelCls}>Comprobante PDF (opcional ahora)</label>
                            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-gray-300 px-3 py-2 text-xs text-gray-600 hover:bg-gray-50">
                                <Upload className="h-4 w-4" /> {file ? file.name : 'Elegir PDF (máx. 10 MB)'}
                                <input type="file" accept="application/pdf" className="hidden" onChange={e => setFile(e.target.files?.[0] || null)} />
                            </label>
                        </div>
                    </div>
                    <div>
                        <label className={labelCls}>Observaciones</label>
                        <textarea rows={2} className={inputCls} value={notes} onChange={e => setNotes(e.target.value)} />
                    </div>
                    {error && <p className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}</p>}
                </div>

                <div className="flex justify-end gap-2 border-t border-gray-100 px-6 py-3">
                    <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-gray-600 hover:bg-gray-100">Cancelar</button>
                    <button type="button" onClick={guardar} disabled={saving || mezcla || !config?.beneficiaryName || !(Number(amount) > 0)}
                        className="inline-flex items-center gap-2 rounded-lg bg-rotary-blue px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
                        {saving && <Loader2 className="h-4 w-4 animate-spin" />} Registrar traslado
                    </button>
                </div>
            </div>
        </div>
    );
};

export default TransferFormModal;
