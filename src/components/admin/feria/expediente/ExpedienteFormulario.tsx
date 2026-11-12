// ════════════════════════════════════════════════════════════════════════════
// Expediente → «Formulario completo» (v4.1324.0)
//
// TODOS los campos reales de la postulación, agrupados como en los formularios
// (registro inicial, Formulación, Solicitud del FDD), también los vacíos
// («No informado»). En edición se usan los MISMOS controles del formulario del
// club (`FormField`), así un número sigue siendo número y una lista sigue
// siendo lista. Antes de guardar se muestra el resumen de lo que cambia; las
// cifras exigen motivo. El servidor vuelve a validar todo y rechaza (409) si
// otra persona cambió un campo mientras tanto.
// ════════════════════════════════════════════════════════════════════════════
import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, Lock, Pencil, Save, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { FormField } from '../../../project-forms/FormFields';
import type { DossierField, DossierPayload } from '../../../../lib/projectDossier';
import { DossierApiError, dossierRequest, isEmptyValue, plainValue } from '../../../../lib/projectDossier';
import DossierValue from './DossierValue';

const BLUE = '#17458F';

interface Props {
    data: DossierPayload;
    eventId: string;
    startInEdit?: boolean;
    wide?: boolean;
    onSaved: (next: Partial<DossierPayload>) => void;
    onDirtyChange?: (dirty: boolean) => void;
    onReload: () => void;
}

const same = (a: any, b: any) => JSON.stringify(a ?? '') === JSON.stringify(b ?? '');
const summaryOf = (f: DossierField, v: any) => {
    if (isEmptyValue(v)) return '(vacío)';
    if (f.type === 'matrix' || f.type === 'repeater') return 'tabla modificada';
    const t = plainValue(f, v);
    return t.length > 90 ? `${t.slice(0, 90)}…` : t;
};

const ExpedienteFormulario = ({ data, eventId, startInEdit = false, wide = false, onSaved, onDirtyChange, onReload }: Props) => {
    const [editing, setEditing] = useState(startInEdit && data.access.edit);
    const [draft, setDraft] = useState<Record<string, any>>({});
    const [reason, setReason] = useState('');
    const [confirming, setConfirming] = useState(false);
    const [saving, setSaving] = useState(false);
    const [query, setQuery] = useState('');
    const [hideEmpty, setHideEmpty] = useState(false);
    const [conflict, setConflict] = useState<string | null>(null);

    const fields = useMemo(() => {
        const out: DossierField[] = [];
        data.dossier.groups.forEach(g => g.sections.forEach(s => s.fields.forEach(f => out.push(f))));
        return out;
    }, [data.dossier]);
    const byPath = useMemo(() => new Map(fields.map(f => [f.path, f])), [fields]);
    const changes = useMemo(() => Object.entries(draft)
        .filter(([path, v]) => byPath.has(path) && !same(v, byPath.get(path)!.value))
        .map(([path, v]) => ({ field: byPath.get(path)!, value: v })), [draft, byPath]);
    const needsReason = changes.some(c => c.field.sensitive);
    const filledCount = fields.filter(f => f.filled).length;

    useEffect(() => { onDirtyChange?.(changes.length > 0); }, [changes.length, onDirtyChange]);
    // Avisar antes de cerrar la pestaña del navegador con cambios sin guardar.
    useEffect(() => {
        if (!changes.length) return undefined;
        const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
        window.addEventListener('beforeunload', h);
        return () => window.removeEventListener('beforeunload', h);
    }, [changes.length]);

    const q = query.trim().toLowerCase();
    const visible = (f: DossierField) => {
        if (hideEmpty && !f.filled && !(f.path in draft)) return false;
        if (!q) return true;
        return f.label.toLowerCase().includes(q) || plainValue(f, f.value).toLowerCase().includes(q);
    };

    const cancel = () => {
        if (changes.length && !window.confirm(`Hay ${changes.length} cambio(s) sin guardar. ¿Descartarlos?`)) return;
        setDraft({}); setReason(''); setConfirming(false); setEditing(false); setConflict(null);
    };

    const save = async () => {
        if (needsReason && reason.trim().length < 5) { toast.error('Escribe el motivo del cambio de cifras.'); return; }
        setSaving(true); setConflict(null);
        try {
            const res = await dossierRequest<any>(`/postulaciones/${data.submission.id}/expediente`, eventId, {
                method: 'PATCH',
                body: { edits: changes.map(c => ({ path: c.field.path, value: c.value, before: c.field.value })), reason: reason.trim() },
            });
            toast.success(`Cambios guardados (${res.changed.length} campo${res.changed.length === 1 ? '' : 's'}). Quedan en el historial.`);
            setDraft({}); setReason(''); setConfirming(false); setEditing(false);
            onSaved({ dossier: res.dossier, translation: res.translation });
        } catch (e: any) {
            if (e instanceof DossierApiError && e.status === 409) setConflict(e.message);
            toast.error(e?.message || 'No se pudo guardar');
        } finally { setSaving(false); }
    };

    const anchorId = (g: string, s: string) => `exp-${g}-${s}`.replace(/[^\w-]/g, '-');
    const index = data.dossier.groups.flatMap(g => g.sections.filter(s => s.fields.some(visible)).map(s => ({ id: anchorId(g.key, s.key), label: `${g.source === 'submission' ? 'Registro inicial' : g.title} · ${s.title}`.slice(0, 80) })));

    return (
        <div className="space-y-4">
            {/* Barra de herramientas fija dentro del panel */}
            <div className="sticky top-0 z-[5] -mx-6 border-b border-slate-200 bg-slate-50/95 px-6 py-3 backdrop-blur">
                <div className="flex flex-wrap items-center gap-2">
                    <div className="relative min-w-[180px] flex-1">
                        <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar un campo o un texto…" aria-label="Buscar en el formulario"
                            className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-8 pr-3 text-sm" />
                    </div>
                    <select aria-label="Ir a la sección" className="max-w-[46%] rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs text-slate-700"
                        value="" onChange={e => { const el = document.getElementById(e.target.value); el?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>
                        <option value="">Índice de secciones…</option>
                        {index.map(i => <option key={i.id} value={i.id}>{i.label}</option>)}
                    </select>
                    <label className="inline-flex items-center gap-1.5 text-xs text-slate-600">
                        <input type="checkbox" checked={hideEmpty} onChange={e => setHideEmpty(e.target.checked)} /> Ocultar vacíos
                    </label>
                    {data.access.edit && !editing && (
                        <button onClick={() => setEditing(true)} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold text-white" style={{ background: BLUE }}>
                            <Pencil size={13} /> Editar información
                        </button>
                    )}
                    {editing && (
                        <>
                            <button onClick={cancel} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700"><X size={13} /> Cancelar</button>
                            <button onClick={() => setConfirming(true)} disabled={!changes.length || saving}
                                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold text-white disabled:opacity-50" style={{ background: BLUE }}>
                                <Save size={13} /> Guardar cambios{changes.length ? ` (${changes.length})` : ''}
                            </button>
                        </>
                    )}
                </div>
                <p className="mt-2 text-[11px] text-slate-500">
                    {fields.length} campos · {filledCount} diligenciados. {editing
                        ? 'Modo edición: cada cambio queda auditado (valor anterior, nuevo, quién y cuándo). Pagos, estados, club y archivos no se editan aquí.'
                        : 'Lectura del formulario tal como lo diligenció el club.'}
                </p>
                {editing && changes.length > 0 && <p className="mt-1 text-[11px] font-semibold text-amber-700">Tienes {changes.length} cambio(s) sin guardar.</p>}
            </div>

            {conflict && (
                <div className="flex flex-wrap items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                    <AlertTriangle size={16} /> <span className="flex-1">{conflict}</span>
                    <button onClick={() => { setDraft({}); setConflict(null); onReload(); }} className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold">Recargar el expediente</button>
                </div>
            )}

            {confirming && (
                <div className="rounded-xl border border-blue-200 bg-white p-4 shadow-sm" role="dialog" aria-label="Confirmar cambios">
                    <p className="text-sm font-bold text-slate-900">Vas a modificar {changes.length} campo{changes.length === 1 ? '' : 's'} de la postulación</p>
                    <ul className="mt-2 max-h-56 space-y-1.5 overflow-y-auto text-xs">
                        {changes.map(c => (
                            <li key={c.field.path} className="rounded-lg bg-slate-50 px-3 py-2">
                                <span className="font-semibold text-slate-800">{c.field.label}</span>{c.field.sensitive && <span className="ml-1.5 rounded bg-amber-100 px-1.5 text-[10px] font-bold text-amber-800">cifras</span>}
                                <div className="mt-0.5 text-slate-500"><span className="line-through">{summaryOf(c.field, c.field.value)}</span> → <span className="text-slate-800">{summaryOf(c.field, c.value)}</span></div>
                            </li>
                        ))}
                    </ul>
                    <label className="mt-3 block text-xs font-semibold text-slate-700">
                        Motivo del cambio {needsReason ? <span className="text-red-600">(obligatorio: cambian cifras)</span> : <span className="font-normal text-slate-400">(opcional)</span>}
                        <textarea value={reason} onChange={e => setReason(e.target.value)} rows={2} maxLength={1000}
                            placeholder="Ej.: corrección solicitada por el club por correo del 12 de noviembre"
                            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal" />
                    </label>
                    <p className="mt-2 text-[11px] text-slate-500">Si este proyecto ya tiene traducción, los campos que cambies quedarán marcados como <b>desactualizados</b> en la versión inglesa (la versión aprobada se conserva).</p>
                    <div className="mt-3 flex flex-wrap justify-end gap-2">
                        <button onClick={() => setConfirming(false)} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700">Seguir editando</button>
                        <button onClick={save} disabled={saving || (needsReason && reason.trim().length < 5)}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">
                            {saving ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />} Confirmar y guardar
                        </button>
                    </div>
                </div>
            )}

            {data.dossier.groups.map(g => {
                const sections = g.sections.filter(s => s.fields.some(visible));
                if (!sections.length) return null;
                return (
                    <section key={g.key} className="rounded-xl border border-slate-200 bg-white">
                        <header className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3">
                            <h3 className="text-sm font-bold text-slate-900">{g.title}</h3>
                            {g.source === 'form' && (g.started
                                ? <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">Avance {g.completionPct}%{g.formStatus === 'submitted' ? ' · Enviado' : ''}</span>
                                : <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800">El club no ha iniciado este formulario</span>)}
                        </header>
                        <div className="divide-y divide-slate-100">
                            {sections.map(s => (
                                <div key={s.key} id={anchorId(g.key, s.key)} className="scroll-mt-28 px-4 py-3">
                                    <h4 className="mb-2 text-[11px] font-bold uppercase tracking-wide" style={{ color: BLUE }}>
                                        {s.title}{s.district && <span className="ml-2 font-semibold normal-case text-slate-400">· espacio institucional</span>}
                                    </h4>
                                    <dl className={`grid gap-x-6 gap-y-3 ${wide ? 'lg:grid-cols-2' : ''}`}>
                                        {s.fields.filter(visible).map(f => {
                                            const long = ['textarea', 'matrix', 'repeater'].includes(f.type);
                                            const value = f.path in draft ? draft[f.path] : f.value;
                                            const changed = f.path in draft && !same(draft[f.path], f.value);
                                            return (
                                                <div key={f.path} className={`${long && wide ? 'lg:col-span-2' : ''} ${changed ? 'rounded-lg bg-amber-50/60 p-2 ring-1 ring-amber-200' : ''}`}>
                                                    {editing && f.editable ? (
                                                        <div className="grid">
                                                            <FormField field={{ key: f.key, label: f.label, type: f.type, options: f.options || undefined, maxLength: f.maxLength || undefined, columns: f.columns || undefined, rows: f.rows || undefined, help: f.help || undefined } as any}
                                                                value={value} answers={{}} disabled={saving}
                                                                onChange={(v: any) => setDraft(d => ({ ...d, [f.path]: v }))} />
                                                            {f.sensitive && <p className="mt-1 text-[11px] text-amber-700">Campo con cifras: el cambio exige motivo.</p>}
                                                        </div>
                                                    ) : (
                                                        <>
                                                            <dt className="mb-0.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                                                                {f.label}
                                                                {editing && !f.editable && <span title={f.lockReason || 'No editable'} className="inline-flex items-center gap-1 normal-case text-slate-400"><Lock size={11} /> <span className="font-normal">{f.lockReason}</span></span>}
                                                            </dt>
                                                            <dd><DossierValue field={f} value={value} /></dd>
                                                        </>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </dl>
                                </div>
                            ))}
                        </div>
                    </section>
                );
            })}
            {q && !fields.some(visible) && <p className="py-8 text-center text-sm text-slate-500">Ningún campo coincide con «{query}».</p>}
        </div>
    );
};

export default ExpedienteFormulario;
