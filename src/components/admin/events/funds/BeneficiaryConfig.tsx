// El beneficiario del evento — v4.1250. A quién se trasladan los fondos de las
// inscripciones (para la XIII Conferencia, Concorrotarios) y quiénes reciben
// los comprobantes. Se configura POR EVENTO: nada fijo en el código, y otro
// evento puede tener otro beneficiario. Sólo un administrador del sitio edita;
// los demás ven la cuenta enmascarada.
import { useState } from 'react';
import { Landmark, Loader2, Plus, Trash2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { fundsApi, fechaHora, type FundsConfig } from './eventFundsApi';

const inputCls = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50';
const labelCls = 'mb-1 block text-xs font-semibold text-gray-600';

const BeneficiaryConfig = ({ eventId, config, canApprove, onSaved }: {
    eventId: string;
    config: FundsConfig | null;
    canApprove: boolean;
    onSaved: () => void;
}) => {
    const [open, setOpen] = useState(!config?.beneficiaryName);
    const [form, setForm] = useState({
        beneficiaryName: config?.beneficiaryName || '',
        bankName: config?.bankName || '',
        accountNumber: config?.accountNumber || '',
        accountType: config?.accountType || '',
        accountCurrency: config?.accountCurrency || '',
        beneficiaryTaxId: config?.beneficiaryTaxId || '',
        notes: config?.notes || '',
    });
    const [recipients, setRecipients] = useState(config?.recipients?.length ? config.recipients : [{ name: '', email: '', role: '' }]);
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
    const set = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }));

    const guardar = async () => {
        setSaving(true); setMsg(null);
        try {
            await fundsApi.saveConfig(eventId, { ...form, recipients: recipients.filter(r => r.email.trim()) });
            setMsg({ ok: true, text: 'Beneficiario guardado.' });
            onSaved();
        } catch (e: any) {
            setMsg({ ok: false, text: e?.message || 'No se pudo guardar.' });
        } finally { setSaving(false); }
    };

    return (
        <div className="rounded-2xl border border-gray-200 bg-white">
            <button type="button" onClick={() => setOpen(v => !v)} className="flex w-full items-center justify-between px-4 py-3 text-left">
                <span className="flex items-center gap-2 text-sm font-bold text-gray-900">
                    <Landmark className="h-4 w-4 text-sky-700" /> Beneficiario del evento
                    {config?.beneficiaryName
                        ? <span className="font-normal text-gray-500">· {config.beneficiaryName}{config.accountMasked ? ` · cuenta ${config.accountMasked}` : ''}</span>
                        : <span className="font-normal text-amber-700">· sin configurar</span>}
                </span>
                <span className="text-xs text-gray-400">{open ? 'Ocultar' : 'Ver / editar'}</span>
            </button>
            {open && (
                <div className="space-y-3 border-t border-gray-100 p-4 text-sm">
                    {!canApprove && <p className="text-xs text-gray-500">Sólo un administrador del sitio puede cambiar el beneficiario y sus datos bancarios.</p>}
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="sm:col-span-2">
                            <label className={labelCls}>Nombre del beneficiario *</label>
                            <input className={inputCls} disabled={!canApprove} value={form.beneficiaryName} onChange={e => set('beneficiaryName', e.target.value)} placeholder="Concorrotarios" />
                        </div>
                        <div>
                            <label className={labelCls}>Entidad bancaria</label>
                            <input className={inputCls} disabled={!canApprove} value={form.bankName} onChange={e => set('bankName', e.target.value)} />
                        </div>
                        <div>
                            <label className={labelCls}>Cuenta oficial</label>
                            <input className={inputCls} disabled={!canApprove} value={form.accountNumber} onChange={e => set('accountNumber', e.target.value)}
                                placeholder={config?.accountMasked || ''} />
                            {config?.accountMasked && !config.accountVisible && <p className="mt-1 text-[11px] text-gray-400">Se muestra enmascarada.</p>}
                        </div>
                        <div>
                            <label className={labelCls}>Tipo de cuenta</label>
                            <input className={inputCls} disabled={!canApprove} value={form.accountType} onChange={e => set('accountType', e.target.value)} placeholder="Ahorros / Corriente" />
                        </div>
                        <div>
                            <label className={labelCls}>Moneda de la cuenta</label>
                            <input className={inputCls} disabled={!canApprove} value={form.accountCurrency} onChange={e => set('accountCurrency', e.target.value.toUpperCase().slice(0, 3))} placeholder="COP" />
                        </div>
                        <div>
                            <label className={labelCls}>Identificación (NIT), si aplica</label>
                            <input className={inputCls} disabled={!canApprove} value={form.beneficiaryTaxId} onChange={e => set('beneficiaryTaxId', e.target.value)} />
                        </div>
                        <div className="sm:col-span-2">
                            <label className={labelCls}>Observaciones</label>
                            <textarea rows={2} className={inputCls} disabled={!canApprove} value={form.notes} onChange={e => set('notes', e.target.value)} />
                        </div>
                    </div>
                    <div>
                        <p className={labelCls}>Responsables autorizados (reciben los comprobantes)</p>
                        <div className="space-y-2">
                            {recipients.map((r, i) => (
                                <div key={i} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1.2fr_1fr_auto]">
                                    <input className={inputCls} disabled={!canApprove} value={r.name} placeholder="Nombre"
                                        onChange={e => setRecipients(list => list.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} />
                                    <input className={inputCls} disabled={!canApprove} value={r.email} placeholder="correo@concorrotarios.org"
                                        onChange={e => setRecipients(list => list.map((x, j) => j === i ? { ...x, email: e.target.value } : x))} />
                                    <input className={inputCls} disabled={!canApprove} value={r.role} placeholder="Tesorería"
                                        onChange={e => setRecipients(list => list.map((x, j) => j === i ? { ...x, role: e.target.value } : x))} />
                                    {canApprove && (
                                        <button type="button" onClick={() => setRecipients(list => list.filter((_, j) => j !== i))}
                                            className="rounded-lg p-2 text-gray-400 hover:bg-gray-100" aria-label="Quitar responsable"><Trash2 className="h-4 w-4" /></button>
                                    )}
                                </div>
                            ))}
                        </div>
                        {canApprove && (
                            <button type="button" onClick={() => setRecipients(list => [...list, { name: '', email: '', role: '' }])}
                                className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-sky-700"><Plus className="h-3.5 w-3.5" /> Agregar responsable</button>
                        )}
                    </div>
                    {config?.updatedByName && <p className="text-[11px] text-gray-400">Actualizado por {config.updatedByName} · {fechaHora(config.updatedAt)}</p>}
                    {msg && (
                        <p className={`flex items-center gap-1.5 text-xs ${msg.ok ? 'text-emerald-700' : 'text-red-700'}`}>
                            {msg.ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />} {msg.text}
                        </p>
                    )}
                    {canApprove && (
                        <button type="button" onClick={guardar} disabled={saving || !form.beneficiaryName.trim()}
                            className="inline-flex items-center gap-2 rounded-lg bg-rotary-blue px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
                            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Guardar beneficiario
                        </button>
                    )}
                </div>
            )}
        </div>
    );
};

export default BeneficiaryConfig;
