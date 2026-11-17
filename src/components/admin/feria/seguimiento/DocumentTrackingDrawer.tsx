// ════════════════════════════════════════════════════════════════════
// Panel de detalle documental de UN proyecto (v4.1332)
//
// Identificación, cada formulario (avance, secciones, campos obligatorios
// pendientes o con formato incorrecto, última edición, validación), cada
// archivo (estado de entrega, archivo, fecha, revisión, observaciones) y las
// acciones: ver formulario y documentación (el EXPEDIENTE), validar, pedir
// corrección, «No aplica», observar, recordar e historial.
//
// ⚠️ El comité NO edita aquí las respuestas del club: para eso está el
// expediente, con su edición auditada campo a campo.
// ════════════════════════════════════════════════════════════════════
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    X, Loader2, FileText, Download, CheckCircle2, AlertTriangle, Eye, Ban, MessageSquarePlus, Mail, History, ExternalLink, RotateCcw, Clapperboard,
} from 'lucide-react';
import { toast } from 'sonner';
import {
    docRequest, fmtDay, fmtDayTime, TONE_CLS, docStatusTone, validationTone,
    type DocumentTrackingFull, type DocRequirementFull, type TrackingConfig,
} from '../../../../lib/documentTracking';
import { Bar, Pill } from './DocumentTrackingCells';
import type { ExpedientePane } from '../expediente/ExpedienteAccionesMenu';

interface Detail {
    submission: { id: string; publicRef: string; projectName: string; clubName: string; district: string; responsible: string; email: string; workflowStatus: string; archived: boolean; updatedAt: string };
    tracking: DocumentTrackingFull;
    config: TrackingConfig;
    presentationVersions: { id: string; versionNumber: number; fileName: string; sizeLabel: string; createdAt: string; uploadedByName: string | null; note: string | null }[];
    events: { id: string; type: string; title: string; detail: string | null; actorName: string | null; createdAt: string }[];
    reminders: { id: string; recipient: string; status: string; error: string | null; sentAt: string | null; createdAt: string; actorName: string | null }[];
    access: { review: boolean; comment: boolean; remind: boolean; config: boolean };
}

interface Props {
    id: string;
    eventId: string;
    onClose: () => void;
    onChanged: () => void;
    onOpenExpediente: (pane: ExpedientePane) => void;
    onRemind: (id: string) => void;
}

type Action = { req: DocRequirementFull; kind: 'changes' | 'na' | 'obs' } | null;

const API = (import.meta as any).env?.VITE_API_URL || '/api';

const DocumentTrackingDrawer: React.FC<Props> = ({ id, eventId, onClose, onChanged, onOpenExpediente, onRemind }) => {
    const [data, setData] = useState<Detail | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState<string | null>(null);
    const [action, setAction] = useState<Action>(null);
    const [text, setText] = useState('');
    const [notify, setNotify] = useState(true);
    const [tab, setTab] = useState<'estado' | 'historial'>('estado');
    const closeRef = useRef<HTMLButtonElement>(null);

    const load = useCallback(() => {
        setError(null);
        docRequest<Detail>(`/${id}`, eventId).then(setData).catch(e => setError(e?.message || 'No se pudo cargar el detalle.'));
    }, [id, eventId]);
    useEffect(() => { load(); }, [load]);
    useEffect(() => {
        closeRef.current?.focus();
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    const run = async (key: string, fn: () => Promise<any>, ok: string) => {
        setBusy(key);
        try { await fn(); toast.success(ok); setAction(null); setText(''); load(); onChanged(); }
        catch (e: any) { toast.error(e?.message || 'No se pudo completar la acción.'); }
        finally { setBusy(null); }
    };
    const review = (req: DocRequirementFull, status: string, note?: string) => run(`rev-${req.key}-${status}`,
        () => docRequest(`/${id}/revision`, eventId, { method: 'POST', body: JSON.stringify({ requirement: req.key, status, note, notify }) }),
        status === 'validated' ? `${req.label}: validado.` : status === 'changes_requested' ? 'Corrección solicitada.' : status === 'in_review' ? 'Marcado en revisión.' : 'Revisión retirada.');
    const videoStatus = (req: DocRequirementFull, status: string, note?: string) => run(`vid-${status}`, async () => {
        const res = await fetch(`${API}/project-fair/admin/project-videos/${req.videoId}/status?evento=${encodeURIComponent(eventId)}`, {
            method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem('rotary_token')}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ status, note }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body?.error || 'No se pudo cambiar el estado del video.');
    }, 'Estado del video actualizado (en «Videos de proyectos»).');
    const applicability = (req: DocRequirementFull, value: string | null, reason?: string) => run(`na-${req.key}`,
        () => docRequest(`/${id}/aplicabilidad`, eventId, { method: 'POST', body: JSON.stringify({ requirement: req.key, applicability: value, reason }) }),
        value === 'not_applicable' ? `${req.label}: no aplica a este proyecto.` : `${req.label}: vuelve a la regla de la Convocatoria.`);
    const observe = (req: DocRequirementFull | null, note: string) => run('obs',
        () => docRequest(`/${id}/observacion`, eventId, { method: 'POST', body: JSON.stringify({ requirement: req?.key, note }) }),
        'Observación registrada en el historial.');
    const downloadPresentation = async (fileId: string) => {
        try {
            const r = await docRequest<{ url: string }>(`/${id}/presentacion/${fileId}/url`, eventId);
            window.open(r.url, '_blank', 'noopener');
        } catch (e: any) { toast.error(e?.message || 'No se pudo preparar la descarga.'); }
    };

    const t = data?.tracking;
    return (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40" role="dialog" aria-modal="true" aria-labelledby="doc-drawer-title" onClick={onClose}>
            <div className="flex h-full w-full max-w-2xl flex-col overflow-hidden bg-white shadow-2xl" onClick={e => e.stopPropagation()}>
                <header className="flex items-start gap-3 border-b border-slate-200 px-5 py-4">
                    <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Seguimiento documental</p>
                        <h2 id="doc-drawer-title" className="truncate text-lg font-bold text-slate-900">{data?.submission.projectName || 'Cargando…'}</h2>
                        {data && (
                            <p className="mt-0.5 text-xs text-slate-500">
                                <span className="font-mono">{data.submission.publicRef}</span> · {data.submission.clubName} · Distrito {data.submission.district}
                                <br />{data.submission.responsible} · {data.submission.email}
                                {t?.lastActivityAt && <> · Última actualización del club: {fmtDayTime(t.lastActivityAt)}</>}
                            </p>
                        )}
                    </div>
                    <button ref={closeRef} onClick={onClose} aria-label="Cerrar el detalle" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X size={18} /></button>
                </header>

                {error && <div className="m-5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error} <button onClick={load} className="ml-2 font-semibold underline">Reintentar</button></div>}
                {!data && !error && <div className="flex flex-1 items-center justify-center text-sm text-slate-500"><Loader2 size={16} className="mr-2 animate-spin" /> Cargando…</div>}

                {data && t && (
                    <>
                        <div className="border-b border-slate-200 px-5 py-3">
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="text-2xl font-extrabold tabular-nums text-slate-900">{t.overallPct} %</span>
                                <Pill tone={docStatusTone(t.docStatus.key)}>{t.docStatus.label}</Pill>
                                <Pill tone={validationTone(t.validation.key)}>Validación: {t.validation.label}</Pill>
                                <Pill tone={t.risk.tone}>{t.risk.label}</Pill>
                            </div>
                            <div className="mt-2"><Bar pct={t.overallPct} label={`Avance documental: ${t.overallPct} %`} /></div>
                            <div className="mt-3 flex flex-wrap gap-2">
                                <button onClick={() => onOpenExpediente('formulario')} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"><FileText size={13} /> Ver formulario</button>
                                <button onClick={() => onOpenExpediente('documentos')} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"><Eye size={13} /> Ver documentación</button>
                                {data.access.comment && <button onClick={() => { setAction({ req: null as any, kind: 'obs' }); setText(''); }} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"><MessageSquarePlus size={13} /> Registrar observación</button>}
                                {data.access.remind && !t.complete && <button onClick={() => onRemind(id)} className="inline-flex items-center gap-1.5 rounded-lg border border-[#17458F] px-3 py-1.5 text-xs font-semibold text-[#17458F] hover:bg-sky-50"><Mail size={13} /> Enviar recordatorio</button>}
                            </div>
                            <div role="tablist" aria-label="Secciones del detalle" className="mt-3 flex gap-1">
                                {(['estado', 'historial'] as const).map(k => (
                                    <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
                                        className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${tab === k ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
                                        {k === 'estado' ? 'Estado de requisitos' : <span className="inline-flex items-center gap-1"><History size={12} /> Historial</span>}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto px-5 py-4">
                            {action && (
                                <div className="mb-4 rounded-xl border border-sky-200 bg-sky-50 p-3">
                                    <p className="text-sm font-semibold text-slate-800">
                                        {action.kind === 'changes' && `Solicitar corrección · ${action.req.label}`}
                                        {action.kind === 'na' && `Marcar «No aplica» · ${action.req.label}`}
                                        {action.kind === 'obs' && 'Registrar observación interna'}
                                    </p>
                                    <label className="mt-2 block text-xs font-semibold text-slate-600">
                                        {action.kind === 'changes' ? 'Qué debe corregir el club (lo verá en «Mi Proyecto»)' : action.kind === 'na' ? 'Motivo (queda en el historial)' : 'Observación (sólo la ve el comité)'}
                                        <textarea value={text} onChange={e => setText(e.target.value)} rows={3} maxLength={2000} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal" />
                                    </label>
                                    {action.kind === 'changes' && action.req.key !== 'video' && (
                                        <label className="mt-2 flex items-center gap-2 text-xs text-slate-700"><input type="checkbox" checked={notify} onChange={e => setNotify(e.target.checked)} /> Avisar al club por correo</label>
                                    )}
                                    <div className="mt-2 flex justify-end gap-2">
                                        <button onClick={() => setAction(null)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600">Cancelar</button>
                                        <button disabled={!text.trim() || !!busy}
                                            onClick={() => action.kind === 'changes'
                                                ? (action.req.key === 'video' ? videoStatus(action.req, 'changes_requested', text.trim()) : review(action.req, 'changes_requested', text.trim()))
                                                : action.kind === 'na' ? applicability(action.req, 'not_applicable', text.trim()) : observe(action.req, text.trim())}
                                            className="inline-flex items-center gap-1 rounded-lg bg-[#17458F] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
                                            {busy && <Loader2 size={12} className="animate-spin" />} Guardar
                                        </button>
                                    </div>
                                </div>
                            )}

                            {tab === 'estado' && (
                                <div className="space-y-3">
                                    {t.requirements.map(r => (
                                        <RequirementCard key={r.key} r={r} data={data} busy={busy}
                                            onValidate={() => (r.key === 'video' ? videoStatus(r, 'approved') : review(r, 'validated'))}
                                            onInReview={() => (r.key === 'video' ? videoStatus(r, 'in_review') : review(r, 'in_review'))}
                                            onClear={() => review(r, 'clear')}
                                            onChanges={() => { setAction({ req: r, kind: 'changes' }); setText(''); }}
                                            onNotApplicable={() => { setAction({ req: r, kind: 'na' }); setText(''); }}
                                            onRestoreApplicability={() => applicability(r, null)}
                                            onObserve={() => { setAction({ req: r, kind: 'obs' }); setText(''); }}
                                            onDownload={downloadPresentation}
                                            onOpenExpediente={onOpenExpediente} />
                                    ))}
                                    <div className="rounded-xl border border-slate-200 p-3">
                                        <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-800"><Clapperboard size={14} /> Video Pitch Profesional</p>
                                        <p className="mt-1 text-xs text-slate-500">Servicio de producción. No es un requisito y no suma al avance documental; su pago no es el de la inscripción.</p>
                                        <div className="mt-2"><Pill tone={t.pitch.tone}>{t.pitch.label}</Pill>{t.pitch.number && <span className="ml-2 font-mono text-xs text-slate-500">{t.pitch.number}</span>}</div>
                                    </div>
                                </div>
                            )}

                            {tab === 'historial' && (
                                <div className="space-y-4">
                                    <section>
                                        <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Recordatorios</h3>
                                        {data.reminders.length ? (
                                            <ul className="mt-2 space-y-1.5">
                                                {data.reminders.map(r => (
                                                    <li key={r.id} className="rounded-lg border border-slate-200 px-3 py-2 text-xs">
                                                        <span className={`mr-2 inline-block rounded-full px-1.5 py-0.5 font-semibold ring-1 ${r.status === 'sent' ? TONE_CLS.emerald : r.status === 'failed' ? TONE_CLS.red : TONE_CLS.slate}`}>{r.status === 'sent' ? 'Enviado' : r.status === 'failed' ? 'Fallido' : r.status === 'cancelled' ? 'Cancelado' : 'En cola'}</span>
                                                        {fmtDayTime(r.sentAt || r.createdAt)} · a {r.recipient}{r.actorName ? ` · por ${r.actorName}` : ''}
                                                        {r.error && <span className="block text-red-700">{r.error}</span>}
                                                    </li>
                                                ))}
                                            </ul>
                                        ) : <p className="mt-1 text-xs text-slate-500">Ningún recordatorio de documentación todavía.</p>}
                                    </section>
                                    <section>
                                        <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Historial documental</h3>
                                        {data.events.length ? (
                                            <ol className="mt-2 space-y-2 border-l border-slate-200 pl-3">
                                                {data.events.map(e => (
                                                    <li key={e.id} className="text-xs">
                                                        <p className="font-semibold text-slate-800">{e.title}</p>
                                                        {e.detail && <p className="whitespace-pre-line text-slate-600">{e.detail}</p>}
                                                        <p className="text-slate-400">{fmtDayTime(e.createdAt)}{e.actorName ? ` · ${e.actorName}` : ''}</p>
                                                    </li>
                                                ))}
                                            </ol>
                                        ) : <p className="mt-1 text-xs text-slate-500">Sin eventos documentales.</p>}
                                        <button onClick={() => onOpenExpediente('historial')} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[#17458F] hover:underline"><ExternalLink size={12} /> Historial completo del expediente</button>
                                    </section>
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

const RequirementCard = ({ r, data, busy, onValidate, onInReview, onClear, onChanges, onNotApplicable, onRestoreApplicability, onObserve, onDownload, onOpenExpediente }: {
    r: DocRequirementFull; data: Detail; busy: string | null;
    onValidate: () => void; onInReview: () => void; onClear: () => void; onChanges: () => void; onNotApplicable: () => void;
    onRestoreApplicability: () => void; onObserve: () => void; onDownload: (fileId: string) => void; onOpenExpediente: (p: ExpedientePane) => void;
}) => {
    const can = data.access.review;
    const isForm = r.kind === 'form';
    const btn = 'inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-semibold disabled:opacity-50';
    return (
        <article className="rounded-xl border border-slate-200 p-3" aria-label={r.label}>
            <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                    <p className="text-sm font-semibold text-slate-900">{r.label}</p>
                    <p className="text-[11px] text-slate-500">
                        {r.mode === 'required' ? 'Obligatorio' : r.mode === 'optional' ? 'Opcional (no suma al avance)' : 'No aplica'}
                        {r.applicabilitySource === 'project' && ' · decidido para este proyecto'}
                        {r.deadline && r.applies && <> · Fecha límite {fmtDay(r.deadline)}</>}
                    </p>
                    {r.applicabilityReason && <p className="text-[11px] italic text-slate-500">Motivo: {r.applicabilityReason}</p>}
                </div>
                <div className="flex flex-wrap gap-1">
                    <Pill tone={r.status.tone || (r.complete ? 'emerald' : r.pct > 0 ? 'amber' : 'slate')}>{isForm && r.applies ? `${r.pct} % · ${r.status.label}` : r.status.label}</Pill>
                    {r.review === 'validated' && <Pill tone="emerald"><CheckCircle2 size={10} /> Validado</Pill>}
                    {r.review === 'changes_requested' && <Pill tone="orange"><AlertTriangle size={10} /> Requiere corrección</Pill>}
                    {r.review === 'in_review' && <Pill tone="indigo">En revisión</Pill>}
                    {r.reviewStale && <Pill tone="slate" title="El club cambió el contenido después de la última revisión">Cambió tras la revisión</Pill>}
                </div>
            </div>

            {r.applies && isForm && (
                <>
                    <div className="mt-2"><Bar pct={r.pct} label={`${r.label}: ${r.pct} %`} /></div>
                    <p className="mt-1 text-[11px] text-slate-500">
                        {r.requiredDone ?? 0} de {r.requiredTotal ?? 0} campos obligatorios válidos
                        {r.lastEditedAt && <> · Última edición {fmtDayTime(r.lastEditedAt)}</>}
                        {r.submitted && <> · Enviado {fmtDay(r.submittedAt)}</>}
                        {r.districtReview && <> · Aprobación del Distrito: {r.districtReview}</>}
                    </p>
                    {(r.sections || []).length > 0 && (
                        <ul className="mt-2 grid gap-1 sm:grid-cols-2">
                            {(r.sections || []).map(s => (
                                <li key={s.key} className="flex items-center gap-2 text-[11px]">
                                    {s.complete ? <CheckCircle2 size={11} className="shrink-0 text-emerald-600" aria-label="Completa" /> : <AlertTriangle size={11} className="shrink-0 text-amber-600" aria-label="Incompleta" />}
                                    <span className="truncate text-slate-700">{s.title}</span>
                                    <span className="ml-auto tabular-nums text-slate-500">{s.done}/{s.total}</span>
                                </li>
                            ))}
                        </ul>
                    )}
                    {((r.missing || []).length > 0 || (r.invalid || []).length > 0) && (
                        <details className="mt-2 text-[11px]">
                            <summary className="cursor-pointer font-semibold text-slate-700">Campos obligatorios pendientes ({(r.missing || []).length}){(r.invalid || []).length ? ` y con formato incorrecto (${(r.invalid || []).length})` : ''}</summary>
                            <ul className="mt-1 space-y-0.5 pl-3">
                                {(r.missing || []).map(m => <li key={`m-${m.sectionKey}-${m.key}`} className="text-slate-600">· {m.section} → {m.label}</li>)}
                                {(r.invalid || []).map(m => <li key={`i-${m.sectionKey}-${m.key}`} className="text-orange-700">· {m.section} → {m.label}: {m.message}</li>)}
                            </ul>
                        </details>
                    )}
                </>
            )}

            {r.applies && !isForm && (
                <div className="mt-2 text-[11px] text-slate-600">
                    {r.file ? (
                        <p className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-slate-800">{r.file.fileName || 'Archivo'}</span>
                            {r.file.versionNumber && <span>Versión {r.file.versionNumber}</span>}
                            {r.file.uploadedAt && <span>· Cargado {fmtDayTime(r.file.uploadedAt)}</span>}
                            {r.key === 'presentation' && <button onClick={() => onDownload(r.file!.id)} className="inline-flex items-center gap-1 font-semibold text-[#17458F] hover:underline"><Download size={11} /> Descargar</button>}
                        </p>
                    ) : <p>Todavía no hay un archivo entregado.</p>}
                    {r.key === 'presentation' && data.presentationVersions.length > 1 && (
                        <details className="mt-1"><summary className="cursor-pointer">Versiones anteriores ({data.presentationVersions.length - 1})</summary>
                            <ul className="mt-1 pl-3">{data.presentationVersions.slice(1).map(v => <li key={v.id}>v{v.versionNumber} · {v.fileName} · {v.sizeLabel} · {fmtDayTime(v.createdAt)} <button onClick={() => onDownload(v.id)} className="font-semibold text-[#17458F] hover:underline">Descargar</button></li>)}</ul>
                        </details>
                    )}
                    {r.key === 'video' && <p className="mt-1 text-slate-500">La revisión del video vive en «Videos de proyectos»; desde aquí se usa la misma regla y queda en su historial.</p>}
                </div>
            )}

            {r.reviewNote && (r.review || r.reviewStale) && (
                <p className="mt-2 rounded-lg bg-slate-50 px-2.5 py-1.5 text-[11px] text-slate-700"><strong>Observación del comité:</strong> {r.reviewNote}{r.reviewedBy && <span className="text-slate-400"> — {r.reviewedBy}{r.reviewedAt ? `, ${fmtDayTime(r.reviewedAt)}` : ''}</span>}</p>
            )}

            {can && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                    {r.applies && (
                        <>
                            {r.review !== 'validated' && (r.key !== 'video' || !!r.videoId) && <button disabled={!!busy || !r.complete} title={!r.complete ? (isForm ? 'Sólo se valida un formulario diligenciado al 100 %' : 'No hay archivo entregado') : undefined} onClick={onValidate} className={`${btn} border-emerald-300 text-emerald-800 hover:bg-emerald-50`}><CheckCircle2 size={11} /> Validar</button>}
                            {r.review !== 'in_review' && (r.key !== 'video' || !!r.videoId) && <button disabled={!!busy || (!isForm && !r.file)} onClick={onInReview} className={`${btn} border-indigo-300 text-indigo-800 hover:bg-indigo-50`}><Eye size={11} /> En revisión</button>}
                            {(r.key !== 'video' || !!r.videoId) && <button disabled={!!busy} onClick={onChanges} className={`${btn} border-orange-300 text-orange-800 hover:bg-orange-50`}><AlertTriangle size={11} /> Solicitar corrección</button>}
                            {r.review && r.key !== 'video' && <button disabled={!!busy} onClick={onClear} className={`${btn} border-slate-300 text-slate-600 hover:bg-slate-50`}><RotateCcw size={11} /> Quitar revisión</button>}
                        </>
                    )}
                    {r.applicabilitySource === 'project'
                        ? <button disabled={!!busy} onClick={onRestoreApplicability} className={`${btn} border-slate-300 text-slate-600 hover:bg-slate-50`}><RotateCcw size={11} /> Volver a la regla general</button>
                        : r.applies && <button disabled={!!busy} onClick={onNotApplicable} className={`${btn} border-slate-300 text-slate-600 hover:bg-slate-50`}><Ban size={11} /> No aplica a este proyecto</button>}
                    {data.access.comment && <button onClick={onObserve} className={`${btn} border-slate-300 text-slate-600 hover:bg-slate-50`}><MessageSquarePlus size={11} /> Observación</button>}
                    {isForm && <button onClick={() => onOpenExpediente('formulario')} className={`${btn} border-slate-300 text-slate-600 hover:bg-slate-50`}><FileText size={11} /> Ver formulario</button>}
                </div>
            )}
        </article>
    );
};

export default DocumentTrackingDrawer;
