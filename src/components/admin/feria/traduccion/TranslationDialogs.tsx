// ════════════════════════════════════════════════════════════════════════════
// Diálogos del seguimiento de traducciones (v4.1356.0)
//
//   · Asignar / reasignar / quitar el Cadre de los proyectos seleccionados.
//   · Recordatorios a los Cadres: primero la VISTA PREVIA (a quién, qué
//     proyectos, el correo real); sólo con la confirmación se envía.
//   · Fecha límite de traducción y preferencias de aviso de la edición.
//
// Todos los permisos los decide el servidor; aquí sólo se pinta.
// ════════════════════════════════════════════════════════════════════════════
import { useEffect, useState, type ReactNode } from 'react';
import { CalendarClock, Loader2, Mail, UserPlus, X } from 'lucide-react';
import { toast } from 'sonner';
import { dossierRequest } from '../../../../lib/projectDossier';
import type { Assignable, TranslationConfig } from '../../../../lib/translationTracking';

const BLUE = '#17458F';
const input = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm';

const Modal = ({ title, icon, onClose, children, footer, labelId }: { title: string; icon: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; labelId: string }) => {
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);
    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/50 p-3" role="dialog" aria-modal="true" aria-labelledby={labelId} onClick={onClose}>
            <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={e => e.stopPropagation()}>
                <header className="flex items-center gap-3 border-b border-slate-200 px-5 py-3">
                    {icon}
                    <h2 id={labelId} className="text-base font-bold text-slate-900">{title}</h2>
                    <button onClick={onClose} aria-label="Cerrar" className="ml-auto rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><X size={18} /></button>
                </header>
                <div className="flex-1 space-y-4 overflow-y-auto p-5">{children}</div>
                {footer && <footer className="flex flex-wrap justify-end gap-2 border-t border-slate-200 px-5 py-3">{footer}</footer>}
            </div>
        </div>
    );
};

// ── Asignar ────────────────────────────────────────────────────────────────
export const AssignCadreDialog = ({ eventId, rows, assignable, onClose, onDone }: {
    eventId: string; rows: { id: string; publicRef: string; projectName: string; assignee?: string | null }[];
    assignable: Assignable[]; onClose: () => void; onDone: () => void;
}) => {
    const [email, setEmail] = useState(assignable[0]?.email || '');
    const [notify, setNotify] = useState(true);
    const [note, setNote] = useState('');
    const [busy, setBusy] = useState(false);
    const submit = async () => {
        setBusy(true);
        try {
            const r = await dossierRequest<any>('/traducciones/asignar', eventId, { method: 'POST', body: { ids: rows.map(x => x.id), email, notify, note } });
            toast.success(email
                ? `${r.changed} proyecto(s) asignados a ${email}.${r.notified ? (r.notified.status === 'sent' ? ' Se le avisó por correo.' : ` El correo falló: ${r.notified.error}`) : ''}`
                : `${r.changed} proyecto(s) quedaron sin Cadre asignado.`);
            onDone(); onClose();
        } catch (e: any) { toast.error(e?.message || 'No se pudo asignar.'); } finally { setBusy(false); }
    };
    return (
        <Modal labelId="tr-assign-title" title="Asignar Cadre responsable" icon={<UserPlus size={18} className="text-[#17458F]" />} onClose={onClose}
            footer={<>
                <button onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">Cancelar</button>
                <button onClick={submit} disabled={busy || !rows.length} className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-bold text-white disabled:opacity-50" style={{ background: BLUE }}>
                    {busy && <Loader2 size={14} className="animate-spin" />} {email ? 'Asignar' : 'Quitar asignación'}
                </button>
            </>}>
            {!rows.length ? (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">Activa «Seleccionar» en la tabla y marca los proyectos que quieres asignar.</p>
            ) : (
                <>
                    <div>
                        <p className="text-xs font-semibold text-slate-600">{rows.length} proyecto(s)</p>
                        <ul className="mt-1 max-h-40 space-y-0.5 overflow-y-auto rounded-lg border border-slate-200 p-2 text-xs text-slate-700">
                            {rows.map(r => <li key={r.id}><span className="font-mono">{r.publicRef}</span> · {r.projectName}{r.assignee ? <span className="text-slate-400"> (hoy: {r.assignee})</span> : null}</li>)}
                        </ul>
                    </div>
                    {assignable.length === 0 ? (
                        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">No hay Cadres configurados. Agrégalos por correo en Convocatoria → «Perfiles del módulo de gestión» → «Cadres».</p>
                    ) : (
                        <label className="block text-xs font-semibold text-slate-600">Persona responsable
                            <select value={email} onChange={e => setEmail(e.target.value)} className={`mt-1 ${input}`}>
                                {assignable.map(a => <option key={a.email} value={a.email}>{a.name ? `${a.name} — ${a.email}` : a.email} · {a.roleLabel}</option>)}
                                <option value="">— Sin Cadre asignado —</option>
                            </select>
                        </label>
                    )}
                    <label className="block text-xs font-semibold text-slate-600">Nota (opcional, queda en la bitácora)
                        <input value={note} onChange={e => setNote(e.target.value)} maxLength={500} className={`mt-1 ${input}`} />
                    </label>
                    {email && (
                        <label className="flex items-center gap-2 text-sm text-slate-700">
                            <input type="checkbox" checked={notify} onChange={e => setNotify(e.target.checked)} /> Avisarle por correo (un solo correo con todos los proyectos)
                        </label>
                    )}
                    <p className="text-[11px] text-slate-500">Asignar no da permisos: la persona tiene que estar en Cadres, Revisores o Traductores de la Convocatoria. Nadie recibe un proyecto del que es responsable.</p>
                </>
            )}
        </Modal>
    );
};

// ── Recordatorios ──────────────────────────────────────────────────────────
export const CadreRemindersDialog = ({ eventId, selectedIds, scopes, onClose, onSent }: {
    eventId: string; selectedIds: string[]; scopes: { key: string; label: string }[]; onClose: () => void; onSent: () => void;
}) => {
    const [scope, setScope] = useState(selectedIds.length ? 'seleccion' : 'pendientes');
    const [preview, setPreview] = useState<any>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    useEffect(() => {
        let vivo = true;
        setPreview(null); setError(null);
        dossierRequest<any>('/traducciones/recordatorios', eventId, { method: 'POST', body: { scope, ids: selectedIds } })
            .then(d => { if (vivo) setPreview(d); })
            .catch((e: any) => { if (vivo) setError(e?.message || 'No se pudo preparar el envío.'); });
        return () => { vivo = false; };
    }, [scope, eventId, selectedIds]);
    const send = async () => {
        setBusy(true);
        try {
            const r = await dossierRequest<any>('/traducciones/recordatorios', eventId, { method: 'POST', body: { scope, ids: selectedIds, confirm: true } });
            toast.success(`Recordatorios: ${r.sent} enviado(s)${r.failed ? `, ${r.failed} fallido(s)` : ''}${r.duplicates ? `, ${r.duplicates} ya enviado(s) hoy` : ''}.`);
            onSent(); onClose();
        } catch (e: any) { toast.error(e?.message || 'No se pudo enviar.'); } finally { setBusy(false); }
    };
    const available = scopes.filter(s => s.key !== 'seleccion' || selectedIds.length);
    return (
        <Modal labelId="tr-rem-title" title="Recordatorios a los Cadres" icon={<Mail size={18} className="text-[#17458F]" />} onClose={onClose}
            footer={<>
                <button onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">Cancelar</button>
                <button onClick={send} disabled={busy || !preview?.willSend} className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-bold text-white disabled:opacity-50" style={{ background: BLUE }}>
                    {busy && <Loader2 size={14} className="animate-spin" />} Enviar {preview?.willSend ? `${preview.willSend} correo(s)` : ''}
                </button>
            </>}>
            <label className="block text-xs font-semibold text-slate-600">A quién
                <select value={scope} onChange={e => setScope(e.target.value)} className={`mt-1 ${input}`}>
                    {available.map(s => <option key={s.key} value={s.key}>{s.key === 'seleccion' ? `${s.label} (${selectedIds.length})` : s.label}</option>)}
                </select>
            </label>
            {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
            {!preview && !error && <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 size={14} className="animate-spin" /> Preparando la vista previa…</p>}
            {preview && (
                <>
                    <p className="text-sm text-slate-700"><strong>{preview.willSend}</strong> correo(s) a Cadres, con <strong>{preview.projects}</strong> proyecto(s). {preview.skipped ? `${preview.skipped} proyecto(s) quedan fuera (verificados o sin Cadre).` : ''} Un correo por persona; el mismo envío no sale dos veces el mismo día.</p>
                    {preview.recipients.length > 0 && (
                        <ul className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2 text-xs text-slate-700">
                            {preview.recipients.map((r: any) => (
                                <li key={r.email}><strong>{r.name || r.email}</strong>{r.name ? ` (${r.email})` : ''}: {r.projects.map((p: any) => `${p.publicRef} · ${p.label}`).join(' — ')}</li>
                            ))}
                        </ul>
                    )}
                    {preview.sample && (
                        <details className="rounded-lg border border-slate-200">
                            <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-slate-700">Vista previa del correo a {preview.sample.to}</summary>
                            <iframe title="Vista previa del recordatorio" sandbox="" srcDoc={preview.sample.html} className="h-80 w-full border-t border-slate-200" />
                        </details>
                    )}
                </>
            )}
        </Modal>
    );
};

// ── Fecha límite y avisos ──────────────────────────────────────────────────
export const TranslationConfigDialog = ({ eventId, onClose, onSaved }: { eventId: string; onClose: () => void; onSaved: () => void }) => {
    const [cfg, setCfg] = useState<TranslationConfig | null>(null);
    const [busy, setBusy] = useState(false);
    useEffect(() => {
        dossierRequest<{ config: TranslationConfig }>('/traducciones/config', eventId).then(d => setCfg(d.config)).catch((e: any) => toast.error(e?.message || 'No se pudo cargar.'));
    }, [eventId]);
    const save = async () => {
        if (!cfg) return;
        setBusy(true);
        try {
            await dossierRequest('/traducciones/config', eventId, { method: 'PUT', body: { config: cfg } });
            toast.success('Configuración de traducciones guardada.');
            onSaved(); onClose();
        } catch (e: any) { toast.error(e?.message || 'No se pudo guardar.'); } finally { setBusy(false); }
    };
    return (
        <Modal labelId="tr-cfg-title" title="Fecha límite y avisos de traducción" icon={<CalendarClock size={18} className="text-[#17458F]" />} onClose={onClose}
            footer={<>
                <button onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">Cancelar</button>
                <button onClick={save} disabled={busy || !cfg} className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-bold text-white disabled:opacity-50" style={{ background: BLUE }}>{busy && <Loader2 size={14} className="animate-spin" />} Guardar</button>
            </>}>
            {!cfg ? <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 size={14} className="animate-spin" /> Cargando…</p> : (
                <>
                    <p className="text-xs text-slate-500">Independiente del cierre de postulaciones y de la fecha límite documental. La ven los Cadres en los recordatorios y en el bloque de indicadores.</p>
                    <label className="block text-xs font-semibold text-slate-600">Fecha límite de traducción
                        <input type="date" value={cfg.deadline || ''} onChange={e => setCfg({ ...cfg, deadline: e.target.value || null })} className={`mt-1 ${input}`} />
                    </label>
                    <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={cfg.notifyOnAssignment} onChange={e => setCfg({ ...cfg, notifyOnAssignment: e.target.checked })} /> Avisar al Cadre cuando se le asignan proyectos</label>
                    <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={cfg.notifyOnInvalidation} onChange={e => setCfg({ ...cfg, notifyOnInvalidation: e.target.checked })} /> Avisar al Cadre cuando el club cambia un texto que él ya verificó</label>
                    <label className="block text-xs font-semibold text-slate-600">Nota para los recordatorios (opcional)
                        <textarea value={cfg.reminderNote || ''} onChange={e => setCfg({ ...cfg, reminderNote: e.target.value || null })} rows={3} maxLength={1000} className={`mt-1 ${input}`} />
                    </label>
                </>
            )}
        </Modal>
    );
};
