// ════════════════════════════════════════════════════════════════════
// Confirmar a mano el pago de una inscripción a un evento — v4.1310
//
// La misma ventana que «Confirmar pago manualmente» de Postulación de
// Proyectos (v4.1308), para los inscritos al evento: nacionales,
// internacionales y CADRE. El comprobante sube DIRECTO a S3 (prefijo privado
// de ESTA inscripción) y el servidor lo comprueba al confirmar; la
// confirmación deja su fila de pago y termina en el mismo final que Stripe y
// PayPal (código, cuenta, historial y, si se marca, el correo).
//
// Componente de nivel superior: declararlo dentro de la ficha lo haría un tipo
// nuevo en cada render y los campos perderían el foco tras cada letra.
// ════════════════════════════════════════════════════════════════════
import { useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, Paperclip, ShieldCheck, X } from 'lucide-react';
import { money } from '../../../lib/eventRegistrationSpec';
import { leerJson, describirNoJson } from '../../../lib/leerJson';
import {
    subirComprobanteManual, fechaLocalParaInput, fechaInputAIso, type ComprobanteSubido,
} from '../../../lib/comprobantePagoManual';
import { MANUAL_PAYMENT_METHODS, MANUAL_CURRENCIES } from '../../../../server/lib/eventManualPayment.js';

const API = (import.meta as any).env?.VITE_API_URL || '/api';
const auth = () => ({ Authorization: `Bearer ${localStorage.getItem('rotary_token')}` });

const inputCls = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100';
const labelCls = 'mb-1 block text-xs font-semibold text-gray-700';

export interface ManualPaymentTarget {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    registrationCode: string | null;
    publicRef: string;
    categoryLabel: string;
    chargeAmount: number | null;
    chargeCurrency: string | null;
}

const ManualPaymentModal = ({ registration, onClose, onConfirmed }: {
    registration: ManualPaymentTarget;
    onClose: () => void;
    onConfirmed: () => void;
}) => {
    const esperadoMoneda = MANUAL_CURRENCIES.includes(String(registration.chargeCurrency || '')) ? String(registration.chargeCurrency) : 'COP';
    const [step, setStep] = useState<'edit' | 'confirm'>('edit');
    const [form, setForm] = useState({
        reference: '',
        paidAt: fechaLocalParaInput(),
        amount: registration.chargeAmount ? String(registration.chargeAmount) : '',
        currency: esperadoMoneda,
        paymentMethod: MANUAL_PAYMENT_METHODS[0],
        evidence: '',
        reason: '',
        notify: true,
    });
    const [receipt, setReceipt] = useState<ComprobanteSubido | null>(null);
    const [uploading, setUploading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const fileRef = useRef<HTMLInputElement | null>(null);

    const base = `${API}/event-registrations/admin/registrations/${registration.id}`;
    const set = (patch: Partial<typeof form>) => setForm(f => ({ ...f, ...patch }));

    const adjuntar = async (file: File | null | undefined) => {
        if (!file) return;
        setError('');
        setUploading(true);
        try {
            setReceipt(await subirComprobanteManual({ file, prepararUrl: `${base}/manual-payment/receipt-url`, headers: auth() }));
        } catch (e: any) {
            setError(e?.message || 'No se pudo subir el comprobante.');
        } finally {
            setUploading(false);
            if (fileRef.current) fileRef.current.value = '';
        }
    };

    const revisar = () => {
        setError('');
        if (uploading) return setError('Espera a que termine de subir el comprobante.');
        if (!form.reference.trim() || !form.paidAt || !form.amount || !form.reason.trim()) return setError('Completa los campos obligatorios.');
        if (!receipt && !form.evidence.trim()) return setError('Adjunta el comprobante o escribe la referencia del soporte.');
        if (form.reason.trim().length < 5) return setError('El motivo debe tener al menos 5 caracteres.');
        const fecha = new Date(form.paidAt);
        if (Number.isNaN(fecha.getTime()) || fecha.getTime() > Date.now() + 10 * 60 * 1000) return setError('La fecha del pago no es válida o está en el futuro.');
        if (!(Number(form.amount) > 0)) return setError('El valor pagado debe ser un monto positivo.');
        setStep('confirm');
    };

    const confirmar = async () => {
        setSaving(true);
        setError('');
        try {
            const res = await fetch(`${base}/manual-payment`, {
                method: 'POST',
                headers: { ...auth(), 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    reference: form.reference,
                    paidAt: fechaInputAIso(form.paidAt),
                    amount: Number(form.amount),
                    currency: form.currency,
                    paymentMethod: form.paymentMethod,
                    evidence: form.evidence,
                    reason: form.reason,
                    notify: form.notify,
                    receipt: receipt ? { key: receipt.key, name: receipt.name, contentType: receipt.contentType } : null,
                }),
            });
            const leida = await leerJson<any>(res);
            if (!leida.esJson) throw new Error(describirNoJson(res, leida.crudo));
            if (!res.ok) throw new Error(leida.data?.error || 'No se pudo confirmar el pago.');
            onConfirmed();
        } catch (e: any) {
            // Con un error la ventana NO se cierra: lo escrito sigue ahí.
            setError(e?.message || 'No se pudo confirmar el pago.');
            setStep('edit');
        } finally {
            setSaving(false);
        }
    };

    const declarado = Number(form.amount) || 0;
    const esperado = Number(registration.chargeAmount) || 0;
    const difiere = esperado > 0 && (form.currency !== esperadoMoneda || Math.abs(declarado - esperado) > 0.009);
    const nombre = `${registration.firstName} ${registration.lastName}`.trim();

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 p-4" onClick={e => e.stopPropagation()}>
            <div role="dialog" aria-modal="true" aria-label="Confirmar pago manualmente"
                className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
                <div className="flex items-start justify-between gap-3 border-b border-gray-100 pb-3">
                    <div className="flex items-start gap-2">
                        <ShieldCheck className="mt-0.5 h-5 w-5 text-emerald-600" />
                        <div>
                            <h3 className="text-base font-bold text-gray-900">Confirmar pago manualmente</h3>
                            <p className="text-xs text-gray-500">{nombre} · {registration.registrationCode || registration.publicRef} · {registration.categoryLabel}</p>
                        </div>
                    </div>
                    <button type="button" onClick={onClose} aria-label="Cerrar" className="rounded-lg p-1 text-gray-400 hover:bg-gray-100">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {error && (
                    <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
                    </div>
                )}

                {step === 'edit' ? (
                    <div className="mt-4 space-y-3.5">
                        <p className="text-xs leading-relaxed text-gray-600">
                            Registra un pago hecho por fuera de la pasarela (transferencia, consignación, COLROTARIOS…) cuando exista evidencia verificable.
                            La inscripción quedará con el pago confirmado, recibirá su código y sumará a los indicadores del evento.
                        </p>
                        {esperado > 0 && (
                            <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-700">
                                Valor de la inscripción: <strong>{money(esperado, esperadoMoneda)}</strong>
                            </p>
                        )}

                        <div>
                            <label className={labelCls}>Referencia o ID de transacción *</label>
                            <input type="text" className={inputCls} value={form.reference} onChange={e => set({ reference: e.target.value })}
                                placeholder="Ej. Bancolombia #9482710" />
                        </div>

                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <div>
                                <label className={labelCls}>Fecha y hora del pago *</label>
                                <input type="datetime-local" className={inputCls} value={form.paidAt} onChange={e => set({ paidAt: e.target.value })} />
                            </div>
                            <div>
                                <label className={labelCls}>Medio de pago *</label>
                                <select className={inputCls} value={form.paymentMethod} onChange={e => set({ paymentMethod: e.target.value })}>
                                    {MANUAL_PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                                </select>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <div>
                                <label className={labelCls}>Valor pagado *</label>
                                <input type="number" min="0" step="any" className={inputCls} value={form.amount} onChange={e => set({ amount: e.target.value })} />
                            </div>
                            <div>
                                <label className={labelCls}>Moneda *</label>
                                <select className={inputCls} value={form.currency} onChange={e => set({ currency: e.target.value })}>
                                    <option value="COP">COP (Pesos colombianos)</option>
                                    <option value="USD">USD (Dólares)</option>
                                </select>
                            </div>
                        </div>

                        <div>
                            <label className={labelCls}>Comprobante de pago *</label>
                            <p className="text-[11px] text-gray-500">PDF, JPG, PNG o WebP de hasta 10 MB. Se guarda en un almacenamiento privado.</p>
                            <input ref={fileRef} type="file" className="hidden"
                                accept="application/pdf,image/jpeg,image/png,image/webp,.pdf,.jpg,.jpeg,.png,.webp"
                                onChange={e => adjuntar(e.target.files?.[0])} />
                            {receipt ? (
                                <div className="mt-1.5 flex items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs">
                                    <span className="flex min-w-0 items-center gap-2 text-emerald-900">
                                        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                                        <span className="truncate font-semibold">{receipt.name}</span>
                                        <span className="shrink-0 text-emerald-700">{(receipt.size / 1024 / 1024).toFixed(2)} MB</span>
                                    </span>
                                    <span className="flex shrink-0 gap-1.5">
                                        <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
                                            className="rounded-md border border-emerald-300 bg-white px-2 py-1 font-semibold text-emerald-800 hover:bg-emerald-100">Reemplazar</button>
                                        <button type="button" onClick={() => setReceipt(null)} disabled={uploading}
                                            className="rounded-md border border-gray-300 bg-white px-2 py-1 font-semibold text-gray-600 hover:bg-gray-100">Quitar</button>
                                    </span>
                                </div>
                            ) : (
                                <button type="button" disabled={uploading}
                                    onClick={() => fileRef.current?.click()}
                                    onDragOver={e => e.preventDefault()}
                                    onDrop={e => { e.preventDefault(); adjuntar(e.dataTransfer.files?.[0]); }}
                                    className="mt-1.5 flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 px-3 py-4 text-xs font-semibold text-gray-600 hover:border-blue-400 hover:bg-blue-50/50 disabled:opacity-60">
                                    {uploading
                                        ? <><Loader2 className="h-4 w-4 animate-spin" /> Subiendo comprobante…</>
                                        : <><Paperclip className="h-4 w-4" /> Adjuntar comprobante (o arrástralo aquí)</>}
                                </button>
                            )}
                        </div>

                        <div>
                            <label className={labelCls}>Referencia del soporte {receipt ? '(opcional)' : '*'}</label>
                            <input type="text" className={inputCls} value={form.evidence} onChange={e => set({ evidence: e.target.value })}
                                placeholder="Ej. # extracto bancario, recibo físico o enlace al soporte" />
                            {!receipt && <p className="mt-0.5 text-[11px] text-gray-500">Si no tienes el archivo, describe aquí un soporte verificable.</p>}
                        </div>

                        <div>
                            <label className={labelCls}>Motivo de la confirmación manual *</label>
                            <textarea rows={2} className={inputCls} value={form.reason} onChange={e => set({ reason: e.target.value })}
                                placeholder="Ej. pagó por transferencia a la cuenta del comité; consignación directa…" />
                        </div>

                        <label className="flex cursor-pointer items-start gap-2 text-xs text-gray-700">
                            <input type="checkbox" className="mt-0.5 h-3.5 w-3.5 accent-emerald-600" checked={form.notify}
                                onChange={e => set({ notify: e.target.checked })} />
                            Enviar a {registration.email} el correo de inscripción confirmada (el mismo que recibe quien paga en línea).
                        </label>

                        <div className="mt-5 flex justify-end gap-2 border-t border-gray-100 pt-3">
                            <button type="button" onClick={onClose}
                                className="rounded-lg border border-gray-300 px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50">Cancelar</button>
                            <button type="button" onClick={revisar}
                                className="rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-800">Continuar a revisión</button>
                        </div>
                    </div>
                ) : (
                    <div className="mt-4 space-y-4">
                        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-900">
                            <p className="flex items-center gap-1.5 font-bold text-amber-800"><AlertTriangle className="h-4 w-4" /> Confirmación explícita requerida</p>
                            <p className="mt-1 leading-relaxed">
                                La inscripción de <strong>{nombre}</strong> pasará a <strong>Pago confirmado</strong>, recibirá su código de inscripción y quedará registrada a tu nombre en el historial.
                            </p>
                        </div>
                        {difiere && (
                            <div className="rounded-xl border border-orange-200 bg-orange-50 p-3 text-xs text-orange-900">
                                El valor declarado ({money(declarado, form.currency)}) es distinto del valor de la inscripción ({money(esperado, esperadoMoneda)}). Revisa el soporte antes de confirmar: lo recibido queda registrado tal como lo escribas.
                            </div>
                        )}
                        <dl className="space-y-1.5 rounded-xl border border-gray-200 bg-gray-50 p-3.5 text-xs text-gray-800">
                            {([
                                ['Referencia', form.reference],
                                ['Fecha del pago', new Date(form.paidAt).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' })],
                                ['Valor y moneda', money(declarado, form.currency)],
                                ['Medio de pago', form.paymentMethod],
                                ['Comprobante adjunto', receipt ? receipt.name : 'Sin archivo'],
                                ...(form.evidence.trim() ? [['Referencia del soporte', form.evidence]] : []),
                                ['Correo al participante', form.notify ? 'Sí' : 'No'],
                            ] as [string, string][]).map(([k, v]) => (
                                <div key={k} className="flex justify-between gap-3 border-b border-gray-200 py-1 last:border-0">
                                    <dt className="font-semibold text-gray-500">{k}</dt>
                                    <dd className="break-all text-right">{v}</dd>
                                </div>
                            ))}
                            <div className="pt-1">
                                <dt className="font-semibold text-gray-500">Motivo</dt>
                                <dd className="italic">{form.reason}</dd>
                            </div>
                        </dl>
                        <div className="flex justify-end gap-2 border-t border-gray-100 pt-3">
                            <button type="button" onClick={() => setStep('edit')} disabled={saving}
                                className="rounded-lg border border-gray-300 px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50">Modificar datos</button>
                            <button type="button" onClick={confirmar} disabled={saving}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50">
                                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                                Confirmar pago
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ManualPaymentModal;
