// ════════════════════════════════════════════════════════════════════
// EXCHANGE — cuentas y accesos de consulta (v4.1335)
//
// · Las cuentas de origen (Mercury) y destino (Colrotarios) de ESTA edición:
//   nada escrito en el código. Sólo quien administra la configuración ve el
//   número completo; una cuenta enmascarada que vuelve no pisa la guardada.
// · Los accesos de CONSULTA (el administrador del evento): ligados al usuario
//   en su primer uso, con o sin descarga, y revocables con motivo.
//
// ⚠️ Componentes de NIVEL SUPERIOR (regla del proyecto).
// ════════════════════════════════════════════════════════════════════
import React, { useEffect, useState } from 'react';
import { X, Loader2, ShieldCheck, UserPlus, Ban } from 'lucide-react';
import { toast } from 'sonner';
import { exchangeRequest, fmtDateTime, type ExchangeConfigData, type ExchangeAccount } from '../../../../lib/exchange';

const FIELDS: { key: keyof ExchangeAccount; label: string; placeholder?: string }[] = [
    { key: 'label', label: 'Nombre corto', placeholder: 'Mercury' },
    { key: 'institution', label: 'Entidad' },
    { key: 'holder', label: 'Titular' },
    { key: 'accountNumber', label: 'Número de cuenta' },
    { key: 'accountType', label: 'Tipo de cuenta' },
    { key: 'currency', label: 'Moneda', placeholder: 'USD' },
];

export const AccountFields: React.FC<{ title: string; value: Record<string, string>; onChange: (k: string, v: string) => void }> = ({ title, value, onChange }) => (
    <fieldset className="rounded-xl border border-slate-200 p-3">
        <legend className="px-1 text-xs font-bold uppercase tracking-wide text-slate-500">{title}</legend>
        <div className="grid gap-2 sm:grid-cols-2">
            {FIELDS.map(f => (
                <label key={f.key} className="block text-xs font-semibold text-slate-600">{f.label}
                    <input value={value[f.key] || ''} onChange={e => onChange(f.key, e.target.value)} placeholder={f.placeholder}
                        className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm" />
                </label>
            ))}
        </div>
    </fieldset>
);

const toForm = (a: ExchangeAccount | null) => Object.fromEntries(FIELDS.map(f => [f.key, a?.[f.key] || ''])) as Record<string, string>;

const ExchangeSettings: React.FC<{ eventId: string | null; onClose: () => void }> = ({ eventId, onClose }) => {
    const [cfg, setCfg] = useState<ExchangeConfigData | null>(null);
    const [origin, setOrigin] = useState<Record<string, string>>({});
    const [destination, setDestination] = useState<Record<string, string>>({});
    const [maxMb, setMaxMb] = useState('10');
    const [busy, setBusy] = useState(false);
    const [email, setEmail] = useState('');
    const [canDownload, setCanDownload] = useState(true);
    const [note, setNote] = useState('');
    const [revoking, setRevoking] = useState<string | null>(null);
    const [reason, setReason] = useState('');

    const load = () => exchangeRequest<ExchangeConfigData>('/config', eventId).then(d => {
        setCfg(d);
        setOrigin(toForm(d.accounts.origin));
        setDestination(toForm(d.accounts.destination));
        setMaxMb(String(d.accounts.maxReceiptMb || 10));
    }).catch(e => toast.error(e?.message || 'No se pudo cargar la configuración.'));
    useEffect(() => { load(); }, [eventId]); // eslint-disable-line react-hooks/exhaustive-deps

    const guardar = async () => {
        setBusy(true);
        try {
            await exchangeRequest('/config', eventId, { method: 'PUT', body: JSON.stringify({ origin, destination, maxReceiptMb: Number(maxMb) }) });
            toast.success('Cuentas guardadas.');
            load();
        } catch (e: any) { toast.error(e?.message || 'No se pudo guardar.'); }
        finally { setBusy(false); }
    };
    const conceder = async () => {
        try {
            const r = await exchangeRequest<{ linkedUser: boolean }>('/accesos', eventId, { method: 'POST', body: JSON.stringify({ email, canDownload, note }) });
            toast.success(r.linkedUser ? 'Acceso concedido.' : 'Acceso concedido: se ligará a la cuenta cuando esa persona entre por primera vez.');
            setEmail(''); setNote('');
            load();
        } catch (e: any) { toast.error(e?.message || 'No se pudo conceder el acceso.'); }
    };
    const revocar = async (id: string) => {
        try {
            await exchangeRequest(`/accesos/${encodeURIComponent(id)}/revocar`, eventId, { method: 'POST', body: JSON.stringify({ reason }) });
            toast.success('Acceso revocado.');
            setRevoking(null); setReason('');
            load();
        } catch (e: any) { toast.error(e?.message || 'No se pudo revocar.'); }
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-4" onClick={onClose}>
            <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl" onClick={e => e.stopPropagation()}
                role="dialog" aria-modal="true" aria-label="Exchange: cuentas y accesos">
                <header className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
                    <h2 className="text-base font-bold text-slate-900">Exchange — cuentas y accesos de esta edición</h2>
                    <button type="button" onClick={onClose} aria-label="Cerrar" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X size={18} /></button>
                </header>
                <div className="flex-1 space-y-4 overflow-y-auto p-5">
                    {!cfg && <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 size={14} className="animate-spin" /> Cargando…</p>}
                    {cfg && (
                        <>
                            <p className="text-xs text-slate-600">Las cuentas se muestran en cada transferencia y se guardan con ella al registrar sus datos (un cambio posterior no reescribe lo ya registrado). Quien sólo consulta ve el número enmascarado.</p>
                            <AccountFields title="Cuenta de origen (recibe los pagos)" value={origin} onChange={(k, v) => setOrigin(p => ({ ...p, [k]: v }))} />
                            <AccountFields title="Cuenta de destino (recibe el traslado)" value={destination} onChange={(k, v) => setDestination(p => ({ ...p, [k]: v }))} />
                            <label className="block max-w-xs text-xs font-semibold text-slate-600">Tamaño máximo de cada soporte (MB, hasta 10)
                                <input type="number" min="1" max="10" value={maxMb} onChange={e => setMaxMb(e.target.value)} className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm" /></label>
                            <div className="flex justify-end">
                                <button type="button" onClick={guardar} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-sky-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                                    {busy && <Loader2 size={14} className="animate-spin" />} Guardar cuentas
                                </button>
                            </div>

                            <section className="rounded-xl border border-slate-200 p-3">
                                <h3 className="flex items-center gap-1.5 text-sm font-bold text-slate-800"><ShieldCheck size={15} /> Accesos de consulta (administradores del evento)</h3>
                                <p className="mt-1 text-xs text-slate-600">Ven la columna Exchange y los comprobantes de ESTA edición, sin datos personales de los responsables. No registran, corrigen ni concilian. También tiene acceso de consulta quien administra el evento de la edición con permiso de pagos.</p>
                                <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
                                    <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="correo@dominio.org" aria-label="Correo de la persona" className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm" />
                                    <button type="button" onClick={conceder} disabled={!email.trim()} className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"><UserPlus size={13} /> Conceder</button>
                                    <input value={note} onChange={e => setNote(e.target.value)} placeholder="Nota (cargo, evento)" aria-label="Nota del acceso" className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm" />
                                    <label className="flex items-center gap-1.5 text-xs text-slate-700"><input type="checkbox" checked={canDownload} onChange={e => setCanDownload(e.target.checked)} /> Puede descargar</label>
                                </div>
                                <ul className="mt-3 divide-y divide-slate-100 text-sm">
                                    {cfg.grants.length === 0 && <li className="py-2 text-xs text-slate-400">Sin accesos concedidos.</li>}
                                    {cfg.grants.map(g => (
                                        <li key={g.id} className={`py-2 ${g.revokedAt ? 'text-slate-400' : ''}`}>
                                            <div className="flex flex-wrap items-center justify-between gap-2">
                                                <span className="min-w-0">
                                                    <span className="font-semibold" data-no-translate>{g.email}</span>
                                                    <span className="ml-2 text-xs">{g.canDownload ? 'consulta y descarga' : 'sólo consulta'} · {g.linkedUser ? 'ligado a la cuenta' : 'se liga en el primer ingreso'}</span>
                                                </span>
                                                {!g.revokedAt && (
                                                    <button type="button" onClick={() => { setRevoking(g.id); setReason(''); }} className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 hover:underline"><Ban size={12} /> Revocar</button>
                                                )}
                                            </div>
                                            <p className="text-xs text-slate-500">Concedido {fmtDateTime(g.grantedAt)}{g.grantedByName ? ` por ${g.grantedByName}` : ''}{g.lastUsedAt ? ` · último uso ${fmtDateTime(g.lastUsedAt)}` : ''}{g.note ? ` · ${g.note}` : ''}</p>
                                            {g.revokedAt && <p className="text-xs">Revocado {fmtDateTime(g.revokedAt)}{g.revokedByName ? ` por ${g.revokedByName}` : ''}: {g.revokedReason}</p>}
                                            {revoking === g.id && (
                                                <div className="mt-2 flex gap-2">
                                                    <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Motivo" aria-label="Motivo de la revocación" className="flex-1 rounded-lg border border-slate-300 px-2 py-1 text-xs" />
                                                    <button type="button" onClick={() => revocar(g.id)} className="rounded-lg bg-red-600 px-2.5 py-1 text-xs font-semibold text-white">Revocar</button>
                                                    <button type="button" onClick={() => setRevoking(null)} className="text-xs text-slate-500">Cancelar</button>
                                                </div>
                                            )}
                                        </li>
                                    ))}
                                </ul>
                            </section>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ExchangeSettings;
