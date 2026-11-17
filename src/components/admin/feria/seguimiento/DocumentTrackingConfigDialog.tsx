// ════════════════════════════════════════════════════════════════════
// Configuración del seguimiento documental de UNA edición (v4.1332)
//
// Fecha límite general y por requisito, qué es obligatorio / opcional / no
// aplica, su peso en el avance global, el semáforo, la inactividad y los
// límites de los recordatorios. NINGUNA fecha vive en el código.
//
// Junto a la fecha documental se muestra el cierre de la EDICIÓN de
// formularios (la política «Edición de proyectos después del cierre», v4.1330):
// son reglas distintas y el servidor avisa si chocan.
// ════════════════════════════════════════════════════════════════════
import React, { useEffect, useState } from 'react';
import { X, Loader2, Save, AlertTriangle, CalendarClock } from 'lucide-react';
import { toast } from 'sonner';
import { docRequest, fmtDay, fmtDayTime, type TrackingConfig } from '../../../../lib/documentTracking';

interface Payload {
    config: TrackingConfig;
    requirements: { key: string; label: string; short: string; kind: string }[];
    modes: { key: string; label: string }[];
    editingClose: { applicationsDeadline: string | null; postCloseEnabled: boolean; validity: string; until: string | null };
    warnings: string[];
    history: { at: string; by: string; changed: string[]; deadline: string | null }[];
}

const VALIDITY: Record<string, string> = { open: 'sin fecha límite adicional', until: 'hasta una fecha', individual: 'sólo con autorización individual' };
const input = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm';

const DocumentTrackingConfigDialog: React.FC<{ eventId: string; onClose: () => void; onSaved: () => void }> = ({ eventId, onClose, onSaved }) => {
    const [data, setData] = useState<Payload | null>(null);
    const [cfg, setCfg] = useState<TrackingConfig | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        docRequest<Payload>('/config', eventId).then(d => { setData(d); setCfg(d.config); }).catch(e => setError(e?.message || 'No se pudo cargar la configuración.'));
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [eventId, onClose]);

    const setReq = (key: string, patch: Partial<TrackingConfig['requirements'][string]>) =>
        setCfg(c => (c ? { ...c, requirements: { ...c.requirements, [key]: { ...c.requirements[key], ...patch } } } : c));

    const save = async () => {
        if (!cfg) return;
        setBusy(true); setError(null);
        try {
            const r = await docRequest<Payload & { changed: string[] }>('/config', eventId, { method: 'PUT', body: JSON.stringify({ config: cfg }) });
            setCfg(r.config); setData(d => (d ? { ...d, config: r.config, warnings: r.warnings, history: r.history, editingClose: r.editingClose } : d));
            toast.success(r.changed.length ? 'Configuración guardada.' : 'No había cambios.');
            onSaved();
        } catch (e: any) { setError(e?.message || 'No se pudo guardar.'); }
        finally { setBusy(false); }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-3" role="dialog" aria-modal="true" aria-labelledby="doc-cfg-title" onClick={onClose}>
            <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={e => e.stopPropagation()}>
                <header className="flex items-center gap-3 border-b border-slate-200 px-5 py-3">
                    <CalendarClock size={18} className="text-[#17458F]" />
                    <h2 id="doc-cfg-title" className="text-base font-bold text-slate-900">Fecha límite y requisitos documentales</h2>
                    <button onClick={onClose} aria-label="Cerrar" className="ml-auto rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><X size={18} /></button>
                </header>
                <div className="flex-1 space-y-5 overflow-y-auto p-5">
                    {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>}
                    {!cfg || !data ? <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 size={14} className="animate-spin" /> Cargando…</p> : (
                        <>
                            <section className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                                <p className="font-semibold text-slate-800">Tres reglas distintas</p>
                                <ul className="mt-1 list-disc space-y-0.5 pl-4">
                                    <li><strong>Cierre de postulaciones</strong> (nuevos proyectos): {data.editingClose.applicationsDeadline ? fmtDay(data.editingClose.applicationsDeadline) : 'sin fecha'} — se cambia en la Convocatoria.</li>
                                    <li><strong>Actualización documental</strong> de lo ya inscrito: {data.editingClose.postCloseEnabled ? `activada, ${VALIDITY[data.editingClose.validity] || data.editingClose.validity}${data.editingClose.until ? ` (${fmtDay(data.editingClose.until)})` : ''}` : 'desactivada'} — «Edición de proyectos después del cierre» en la Convocatoria.</li>
                                    <li><strong>Fecha límite documental</strong> (esta pantalla): la que ven los clubes en el recordatorio y la que ordena el semáforo. No reabre postulaciones.</li>
                                </ul>
                            </section>
                            {data.warnings.length > 0 && (
                                <ul className="space-y-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                                    {data.warnings.map((w, i) => <li key={i} className="flex gap-1.5"><AlertTriangle size={12} className="mt-0.5 shrink-0" /> {w}</li>)}
                                </ul>
                            )}

                            <section className="grid gap-3 sm:grid-cols-2">
                                <label className="block text-xs font-semibold text-slate-600">Fecha límite para completar o actualizar documentación
                                    <input type="date" value={cfg.deadline || ''} onChange={e => setCfg({ ...cfg, deadline: e.target.value || null })} className={`mt-1 ${input}`} />
                                </label>
                                <label className="flex items-center gap-2 self-end text-sm text-slate-700">
                                    <input type="checkbox" checked={cfg.enabled} onChange={e => setCfg({ ...cfg, enabled: e.target.checked })} /> Seguimiento documental activo (recordatorios incluidos)
                                </label>
                            </section>

                            <section>
                                <h3 className="text-sm font-semibold text-slate-800">Requisitos</h3>
                                <p className="text-xs text-slate-500">Lo «opcional» se muestra pero no suma al avance; «No aplica» lo saca. El peso decide cuánto cuenta cada uno (iguales por defecto). Un proyecto puede tener su propio «No aplica» desde su detalle.</p>
                                <div className="mt-2 overflow-x-auto">
                                    <table className="w-full min-w-[560px] text-sm">
                                        <thead className="text-left text-[11px] uppercase tracking-wide text-slate-500"><tr><th className="py-1">Requisito</th><th className="py-1">Regla</th><th className="py-1">Peso</th><th className="py-1">Fecha propia</th></tr></thead>
                                        <tbody>
                                            {data.requirements.map(r => (
                                                <tr key={r.key} className="border-t border-slate-100">
                                                    <td className="py-2 pr-2 font-medium text-slate-800">{r.label}</td>
                                                    <td className="py-2 pr-2">
                                                        <select aria-label={`Regla de ${r.label}`} value={cfg.requirements[r.key]?.mode} onChange={e => setReq(r.key, { mode: e.target.value as any })} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
                                                            {data.modes.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
                                                        </select>
                                                    </td>
                                                    <td className="py-2 pr-2"><input aria-label={`Peso de ${r.label}`} type="number" min={0.1} max={10} step={0.5} value={cfg.requirements[r.key]?.weight} onChange={e => setReq(r.key, { weight: Number(e.target.value) })} className="w-20 rounded-lg border border-slate-300 px-2 py-1.5 text-sm" /></td>
                                                    <td className="py-2"><input aria-label={`Fecha propia de ${r.label}`} type="date" value={cfg.requirements[r.key]?.deadline || ''} onChange={e => setReq(r.key, { deadline: e.target.value || null })} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm" /></td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </section>

                            <section className="grid gap-3 sm:grid-cols-3">
                                <label className="block text-xs font-semibold text-slate-600">Semáforo rojo a (días)
                                    <input type="number" min={0} max={60} value={cfg.urgentDays} onChange={e => setCfg({ ...cfg, urgentDays: Number(e.target.value) })} className={`mt-1 ${input}`} /></label>
                                <label className="block text-xs font-semibold text-slate-600">Semáforo ámbar a (días)
                                    <input type="number" min={0} max={120} value={cfg.attentionDays} onChange={e => setCfg({ ...cfg, attentionDays: Number(e.target.value) })} className={`mt-1 ${input}`} /></label>
                                <label className="block text-xs font-semibold text-slate-600">«Sin actividad» tras (días)
                                    <input type="number" min={1} max={180} value={cfg.inactivityDays} onChange={e => setCfg({ ...cfg, inactivityDays: Number(e.target.value) })} className={`mt-1 ${input}`} /></label>
                            </section>

                            <section className="grid gap-3 sm:grid-cols-3">
                                <label className="flex items-center gap-2 text-sm text-slate-700 sm:col-span-3">
                                    <input type="checkbox" checked={cfg.reminders.enabled} onChange={e => setCfg({ ...cfg, reminders: { ...cfg.reminders, enabled: e.target.checked } })} /> Permitir recordatorios de documentación
                                </label>
                                <label className="block text-xs font-semibold text-slate-600">Intervalo mínimo entre recordatorios (días)
                                    <input type="number" min={1} max={60} value={cfg.reminders.minDays} onChange={e => setCfg({ ...cfg, reminders: { ...cfg.reminders, minDays: Number(e.target.value) } })} className={`mt-1 ${input}`} /></label>
                                <label className="block text-xs font-semibold text-slate-600">Máximo por proyecto
                                    <input type="number" min={1} max={20} value={cfg.reminders.max} onChange={e => setCfg({ ...cfg, reminders: { ...cfg.reminders, max: Number(e.target.value) } })} className={`mt-1 ${input}`} /></label>
                                <label className="block text-xs font-semibold text-slate-600">Tope de la presentación (MB)
                                    <input type="number" min={1} max={200} value={cfg.presentationMaxMb} onChange={e => setCfg({ ...cfg, presentationMaxMb: Number(e.target.value) })} className={`mt-1 ${input}`} /></label>
                                <label className="block text-xs font-semibold text-slate-600 sm:col-span-3">Instrucciones adicionales del correo (opcional)
                                    <textarea rows={3} maxLength={1200} value={cfg.reminderNote} onChange={e => setCfg({ ...cfg, reminderNote: e.target.value })} className={`mt-1 ${input}`} /></label>
                            </section>

                            {data.history.length > 0 && (
                                <details className="text-xs text-slate-600">
                                    <summary className="cursor-pointer font-semibold">Cambios anteriores ({data.history.length})</summary>
                                    <ul className="mt-1 space-y-0.5 pl-3">{data.history.map((h, i) => <li key={i}>{fmtDayTime(h.at)} · {h.by} · {h.changed.join(', ') || 'sin cambios'}</li>)}</ul>
                                </details>
                            )}
                        </>
                    )}
                </div>
                <footer className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3">
                    <button onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600">Cerrar</button>
                    <button onClick={save} disabled={busy || !cfg} className="inline-flex items-center gap-1.5 rounded-lg bg-[#17458F] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                        {busy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Guardar
                    </button>
                </footer>
            </div>
        </div>
    );
};

export default DocumentTrackingConfigDialog;
