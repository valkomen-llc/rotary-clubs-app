// ════════════════════════════════════════════════════════════════════
// Recordatorios de documentación (v4.1332)
//
// 1. Elegir a quién: selección, todos los incompletos, sólo Formulación, sólo
//    FDD o sólo documentos.
// 2. VISTA PREVIA: el servidor arma el plan —quién lo recibe, quién no y por
//    qué— y el correo real del primer destinatario. Nada sale todavía.
// 3. Confirmación explícita → envío. Un correo por responsable (con todos sus
//    proyectos), registrado antes de salir; fallidos con su error y reintento.
// ════════════════════════════════════════════════════════════════════
import React, { useEffect, useState } from 'react';
import { X, Loader2, Mail, Send, RefreshCw, CheckCircle2, AlertTriangle, ListChecks } from 'lucide-react';
import { toast } from 'sonner';
import { docRequest, fmtDay, fmtDayTime, TONE_CLS } from '../../../../lib/documentTracking';

interface Props {
    eventId: string;
    selectedIds: string[];
    scopes: { key: string; label: string }[];
    onClose: () => void;
    onSent: () => void;
}
interface PlanItem { id: string; publicRef: string; projectName: string; clubName: string; email: string; overallPct: number; pending: string[]; send: boolean; code: string | null; reason: string | null; reminderCount: number; lastReminderAt: string | null }
interface Plan {
    preview: true; plan: PlanItem[]; recipients: { email: string; name: string; projects: { id: string; publicRef: string; projectName: string }[] }[];
    willSend: number; projects: number; skipped: number; sample: { to: string; subject: string; html: string } | null;
    deadline: string | null; limits: { enabled: boolean; minDays: number; max: number };
}
interface LogRow { id: string; recipient: string; status: string; error: string | null; attempts: number; sentAt: string | null; createdAt: string; actorName: string | null; submissionIds: string[]; snapshot: any }

const DocumentRemindersDialog: React.FC<Props> = ({ eventId, selectedIds, scopes, onClose, onSent }) => {
    const [view, setView] = useState<'nuevo' | 'registro'>('nuevo');
    const [scope, setScope] = useState(selectedIds.length ? 'seleccion' : 'incompletos');
    const [plan, setPlan] = useState<Plan | null>(null);
    const [busy, setBusy] = useState(false);
    const [checked, setChecked] = useState(false);
    const [result, setResult] = useState<any>(null);
    const [log, setLog] = useState<LogRow[] | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    const loadLog = () => docRequest<{ reminders: LogRow[] }>('/recordatorios', eventId).then(d => setLog(d.reminders)).catch(e => setError(e?.message));
    useEffect(() => { if (view === 'registro') loadLog(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [view]);

    const preview = async () => {
        setBusy(true); setError(null); setPlan(null); setChecked(false); setResult(null);
        try {
            setPlan(await docRequest<Plan>('/recordatorios', eventId, { method: 'POST', body: JSON.stringify({ scope, ids: scope === 'seleccion' ? selectedIds : [] }) }));
        } catch (e: any) { setError(e?.message || 'No se pudo preparar la vista previa.'); }
        finally { setBusy(false); }
    };
    const send = async () => {
        if (!plan || !checked) return;
        setBusy(true); setError(null);
        try {
            const r = await docRequest('/recordatorios', eventId, { method: 'POST', body: JSON.stringify({ scope, ids: scope === 'seleccion' ? selectedIds : [], confirm: true }) });
            setResult(r); setPlan(null);
            toast.success(`Recordatorios enviados: ${r.sent}${r.failed ? ` · ${r.failed} fallido(s)` : ''}.`);
            onSent();
        } catch (e: any) { setError(e?.message || 'No se pudo enviar.'); }
        finally { setBusy(false); }
    };
    const retry = async (id: string) => {
        try {
            const r = await docRequest(`/recordatorios/${id}/reintentar`, eventId, { method: 'POST', body: '{}' });
            toast[r.status === 'sent' ? 'success' : 'error'](r.status === 'sent' ? 'Reenviado.' : r.status === 'cancelled' ? 'La documentación ya está completa: no se reintentó.' : (r.error || 'Volvió a fallar.'));
            loadLog(); onSent();
        } catch (e: any) { toast.error(e?.message || 'No se pudo reintentar.'); }
    };

    const skipped = plan?.plan.filter(p => !p.send) || [];
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-3" role="dialog" aria-modal="true" aria-labelledby="doc-rem-title" onClick={onClose}>
            <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={e => e.stopPropagation()}>
                <header className="flex items-center gap-3 border-b border-slate-200 px-5 py-3">
                    <Mail size={18} className="text-[#17458F]" />
                    <h2 id="doc-rem-title" className="text-base font-bold text-slate-900">Recordatorios de documentación</h2>
                    <div role="tablist" className="ml-auto flex gap-1">
                        <button role="tab" aria-selected={view === 'nuevo'} onClick={() => setView('nuevo')} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${view === 'nuevo' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>Nuevo envío</button>
                        <button role="tab" aria-selected={view === 'registro'} onClick={() => setView('registro')} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${view === 'registro' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>Registro de envíos</button>
                    </div>
                    <button onClick={onClose} aria-label="Cerrar" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><X size={18} /></button>
                </header>

                <div className="flex-1 overflow-y-auto p-5">
                    {error && <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>}

                    {view === 'nuevo' && (
                        <>
                            <fieldset>
                                <legend className="text-sm font-semibold text-slate-800">¿A quién?</legend>
                                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                                    {scopes.map(s => {
                                        const disabled = s.key === 'seleccion' && !selectedIds.length;
                                        return (
                                            <label key={s.key} className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${scope === s.key ? 'border-[#17458F] bg-sky-50' : 'border-slate-200'} ${disabled ? 'opacity-50' : 'cursor-pointer'}`}>
                                                <input type="radio" name="scope" value={s.key} checked={scope === s.key} disabled={disabled} onChange={() => { setScope(s.key); setPlan(null); setResult(null); }} className="mt-0.5" />
                                                <span>{s.label}{s.key === 'seleccion' && <span className="block text-xs text-slate-500">{selectedIds.length ? `${selectedIds.length} marcado(s) en la tabla` : 'Activa «Seleccionar» en la tabla y marca proyectos'}</span>}</span>
                                            </label>
                                        );
                                    })}
                                </div>
                            </fieldset>
                            <p className="mt-3 text-xs text-slate-500">Sólo reciben quienes ya postularon, no están archivados, retirados ni rechazados, tienen algo pendiente y pueden editar sus formularios. Un responsable con varios proyectos recibe UN correo con el detalle de cada uno. El intervalo mínimo y el tope por proyecto los fija la configuración.</p>
                            <div className="mt-3 flex justify-end">
                                <button onClick={preview} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg border border-[#17458F] px-4 py-2 text-sm font-semibold text-[#17458F] hover:bg-sky-50 disabled:opacity-50">
                                    {busy && !plan ? <Loader2 size={14} className="animate-spin" /> : <ListChecks size={14} />} Preparar vista previa
                                </button>
                            </div>

                            {plan && (
                                <div className="mt-4 space-y-4">
                                    <div className="grid grid-cols-3 gap-2 text-center">
                                        <div className="rounded-xl bg-emerald-50 p-3"><p className="text-2xl font-extrabold text-emerald-700">{plan.willSend}</p><p className="text-xs text-emerald-800">correo(s) a enviar</p></div>
                                        <div className="rounded-xl bg-sky-50 p-3"><p className="text-2xl font-extrabold text-sky-700">{plan.projects}</p><p className="text-xs text-sky-800">proyecto(s) incluidos</p></div>
                                        <div className="rounded-xl bg-slate-100 p-3"><p className="text-2xl font-extrabold text-slate-700">{plan.skipped}</p><p className="text-xs text-slate-600">no lo recibirán</p></div>
                                    </div>
                                    <p className="text-xs text-slate-500">Fecha límite en el correo: <strong>{plan.deadline ? fmtDay(plan.deadline) : 'sin fecha (no se menciona ninguna)'}</strong> · Intervalo mínimo {plan.limits.minDays} día(s) · máximo {plan.limits.max} por proyecto.</p>
                                    {plan.recipients.length > 0 && (
                                        <details open className="rounded-xl border border-slate-200 p-3 text-sm">
                                            <summary className="cursor-pointer font-semibold text-slate-800">Destinatarios ({plan.recipients.length})</summary>
                                            <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto text-xs">
                                                {plan.recipients.map(r => <li key={r.email}><strong>{r.email}</strong>{r.name ? ` · ${r.name}` : ''} — {r.projects.map(p => `${p.publicRef} ${p.projectName}`).join(' · ')}</li>)}
                                            </ul>
                                        </details>
                                    )}
                                    {skipped.length > 0 && (
                                        <details className="rounded-xl border border-slate-200 p-3 text-sm">
                                            <summary className="cursor-pointer font-semibold text-slate-800">No lo recibirán ({skipped.length})</summary>
                                            <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto text-xs text-slate-600">
                                                {skipped.map(p => <li key={p.id}>{p.publicRef} · {p.projectName} — {p.reason}</li>)}
                                            </ul>
                                        </details>
                                    )}
                                    {plan.sample && (
                                        <div className="rounded-xl border border-slate-200">
                                            <p className="border-b border-slate-200 px-3 py-2 text-xs text-slate-600"><strong>Vista previa</strong> · Para: {plan.sample.to} · Asunto: {plan.sample.subject}</p>
                                            <iframe title="Vista previa del correo" sandbox="" srcDoc={plan.sample.html} className="h-80 w-full" />
                                        </div>
                                    )}
                                    {plan.willSend > 0 ? (
                                        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
                                            <label className="flex items-center gap-2 text-sm text-amber-900">
                                                <input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)} />
                                                Revisé la vista previa y autorizo enviar {plan.willSend} correo(s).
                                            </label>
                                            <button onClick={send} disabled={!checked || busy} className="inline-flex items-center gap-1.5 rounded-lg bg-[#17458F] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                                                {busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Confirmar y enviar
                                            </button>
                                        </div>
                                    ) : <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">No hay a quién enviar un recordatorio ahora.</p>}
                                </div>
                            )}

                            {result && (
                                <div className="mt-4 rounded-xl border border-slate-200 p-3 text-sm">
                                    <p className="font-semibold text-slate-800">Resultado: {result.sent} enviado(s){result.failed ? `, ${result.failed} fallido(s)` : ''}{result.duplicates ? `, ${result.duplicates} omitido(s) por duplicado` : ''}.</p>
                                    <ul className="mt-2 space-y-1 text-xs">
                                        {(result.outcomes || []).map((o: any, i: number) => (
                                            <li key={i} className="flex items-center gap-1.5">
                                                {o.status === 'sent' ? <CheckCircle2 size={12} className="text-emerald-600" /> : <AlertTriangle size={12} className="text-amber-600" />}
                                                {o.email} · {o.status === 'sent' ? 'Enviado' : o.status === 'duplicate' ? 'Ya enviado hoy (no se repitió)' : `Fallido: ${o.error}`}
                                            </li>
                                        ))}
                                    </ul>
                                    {result.failed > 0 && <button onClick={() => setView('registro')} className="mt-2 text-xs font-semibold text-[#17458F] underline">Ver el registro y reintentar</button>}
                                </div>
                            )}
                        </>
                    )}

                    {view === 'registro' && (
                        !log ? <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 size={14} className="animate-spin" /> Cargando…</p>
                            : !log.length ? <p className="text-sm text-slate-500">Todavía no se ha enviado ningún recordatorio de documentación en esta edición.</p>
                                : (
                                    <div className="overflow-x-auto">
                                        <table className="w-full min-w-[640px] text-xs">
                                            <thead className="bg-slate-50 text-left uppercase tracking-wide text-slate-500">
                                                <tr><th className="px-2 py-2">Fecha</th><th className="px-2 py-2">Destinatario</th><th className="px-2 py-2">Proyectos</th><th className="px-2 py-2">Estado</th><th className="px-2 py-2">Por</th><th className="px-2 py-2" /></tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {log.map(r => (
                                                    <tr key={r.id}>
                                                        <td className="whitespace-nowrap px-2 py-2">{fmtDayTime(r.sentAt || r.createdAt)}</td>
                                                        <td className="px-2 py-2">{r.recipient}</td>
                                                        <td className="px-2 py-2">{(r.snapshot?.projects || []).map((p: any) => `${p.publicRef} (${p.overallPct} %)`).join(' · ') || r.submissionIds.length}</td>
                                                        <td className="px-2 py-2">
                                                            <span className={`inline-block rounded-full px-1.5 py-0.5 font-semibold ring-1 ${r.status === 'sent' ? TONE_CLS.emerald : r.status === 'failed' ? TONE_CLS.red : TONE_CLS.slate}`}>{r.status === 'sent' ? 'Enviado' : r.status === 'failed' ? 'Fallido' : r.status === 'cancelled' ? 'Cancelado' : 'En cola'}</span>
                                                            {r.error && <span className="block text-red-700">{r.error}</span>}
                                                            {r.attempts > 1 && <span className="block text-slate-400">{r.attempts} intentos</span>}
                                                        </td>
                                                        <td className="px-2 py-2">{r.actorName || '—'}</td>
                                                        <td className="px-2 py-2">{r.status === 'failed' && <button onClick={() => retry(r.id)} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2 py-1 font-semibold text-slate-700 hover:bg-slate-50"><RefreshCw size={11} /> Reintentar</button>}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )
                    )}
                </div>
            </div>
        </div>
    );
};

export default DocumentRemindersDialog;
