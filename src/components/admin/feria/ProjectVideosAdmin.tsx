// ════════════════════════════════════════════════════════════════════
// Videos de proyectos — Postulación de Proyectos (v4.1298.0)
//
// El módulo audiovisual UNIFICADO de la Feria, con dos pestañas:
//
//   · «Videos propios»: lo que los clubes suben directamente (sin costo).
//     Bandeja con indicadores, búsqueda, filtros y ordenamiento; ficha con
//     reproductor (enlace firmado), metadatos, versiones, aprobación,
//     correcciones con motivo, rechazo, observaciones internas e historial;
//     y la configuración por edición (formatos, topes, duraciones,
//     recomendaciones, política de reemplazo, autorización, flujo).
//   · «Video Pitch Profesional»: el módulo de producción de pago que ya existe
//     (`VideoPitchAdmin`), sin cambios: planes, pagos, guiones, entrega.
//
// Arriba, un resumen con los indicadores de las dos modalidades, cada uno
// leído de SU endpoint: no hay segunda fuente de datos.
// Todo componente de este archivo vive en el ámbito del MÓDULO (v4.971).
// ════════════════════════════════════════════════════════════════════
import React, { useCallback, useEffect, useState } from 'react';
import {
    AlertTriangle, ArrowUpDown, CheckCircle2, ChevronLeft, ChevronRight, Clapperboard, Download, FileText, History, Loader2, MessageSquare,
    PlayCircle, RefreshCw, Save, Search, Send, Settings, UploadCloud, Video, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { leerJson } from '../../../lib/leerJson';
import { VP_API, vpFmtDateTime, vpTone } from '../../../lib/videoPitch';
import type { PvConfig, PvEvent, PvStatus, PvVersion, PvVideo } from '../../../lib/projectVideo';
import VideoPitchAdmin from './VideoPitchAdmin';

const BLUE = '#17458F';
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('rotary_token')}` });
const api = async <T,>(path: string, init: RequestInit = {}): Promise<{ res: Response; data: T | null }> => {
    const res = await fetch(`${VP_API}${path}`, { ...init, headers: { ...authHeaders(), ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...(init.headers || {}) }, signal: typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal ? AbortSignal.timeout(60_000) : undefined });
    const { data } = await leerJson<T>(res);
    return { res, data };
};
const ev = (path: string, eventId: string) => `${path}${path.includes('?') ? '&' : '?'}evento=${encodeURIComponent(eventId || '')}`;

interface Row {
    id: string; submissionId: string; publicRef: string; projectName: string; clubName: string; district: string; responsible: string; email: string;
    status: PvStatus; statusLabel: string; statusTone: string; title: string; fileName: string | null; durationLabel: string | null; sizeLabel: string | null;
    format: string | null; versionCount: number; versionNumber: number | null; hasFile: boolean; consentAccepted: boolean; projectStateLabel: string;
    submittedAt: string | null; reviewedAt: string | null; approvedAt: string | null; updatedAt: string; createdAt: string;
}
interface Access { view: boolean; manage: boolean; config: boolean; comment: boolean }
interface ListResponse { rows: Row[]; total: number; page: number; pageSize: number; kpis: Record<string, number>; filters: { statuses: { key: PvStatus; label: string }[]; districts: string[] }; access: Access }
interface Detail {
    video: PvVideo; submission: { id: string; publicRef: string; projectName: string; clubName: string; district: string; responsible: string; email: string; phone: string | null; projectStateLabel: string };
    versions: PvVersion[]; events: PvEvent[]; notifications: { kind: string; recipient: string; status: string; error: string | null; createdAt: string }[];
    allowedTransitions: { key: PvStatus; label: string; needsNote: boolean }[]; config: PvConfig; access: Access;
}
const KPIS: [string, string][] = [['total', 'Proyectos con video'], ['received', 'Recibidos'], ['pending', 'Pendientes de revisión'], ['approved', 'Aprobados'], ['observed', 'Con observaciones']];

const Badge = ({ label, tone }: { label: string; tone?: string }) => { const t = vpTone(tone); return <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold ${t.badge}`}><span className={`h-1.5 w-1.5 rounded-full ${t.dot}`} /> {label}</span>; };
const Card = ({ title, icon: Icon, right, children }: { title: string; icon: any; right?: React.ReactNode; children: React.ReactNode }) => (
    <section className="rounded-xl border border-slate-200 bg-white p-5"><div className="mb-4 flex flex-wrap items-center justify-between gap-2"><h3 className="flex items-center gap-2 text-sm font-bold text-slate-800"><Icon size={16} style={{ color: BLUE }} /> {title}</h3>{right}</div>{children}</section>
);
const Btn = ({ children, onClick, disabled, kind = 'secondary', title }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean; kind?: 'primary' | 'secondary' | 'danger' | 'success'; title?: string }) => (
    <button type="button" onClick={onClick} disabled={disabled} title={title} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${kind === 'primary' ? 'text-white hover:opacity-90' : kind === 'danger' ? 'border border-red-200 text-red-700 hover:bg-red-50' : kind === 'success' ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'border border-slate-300 text-slate-700 hover:bg-slate-50'}`} style={kind === 'primary' ? { background: BLUE } : undefined}>{children}</button>
);
const SortableTh = ({ k, sort, onToggle, children }: { k: string; sort: string; onToggle: (k: string) => void; children: React.ReactNode }) => (
    <th className="cursor-pointer select-none px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500 hover:text-slate-800" onClick={() => onToggle(k)}><span className="inline-flex items-center gap-1">{children} {sort === k && <ArrowUpDown size={11} />}</span></th>
);

// ── Ficha ────────────────────────────────────────────────────────────
const VideoDrawer = ({ id, eventId, onClose, onChanged }: { id: string; eventId: string; onClose: () => void; onChanged: () => void }) => {
    const [d, setD] = useState<Detail | null>(null);
    const [videoUrl, setVideoUrl] = useState<string | null>(null);
    const [target, setTarget] = useState<PvStatus | ''>('');
    const [note, setNote] = useState('');
    const [comment, setComment] = useState('');
    const [internal, setInternal] = useState(true);
    const [adminNotes, setAdminNotes] = useState('');
    const [busy, setBusy] = useState<string | null>(null);

    const load = useCallback(async () => {
        const { res, data } = await api<Detail & { error?: string }>(ev(`/project-fair/admin/project-videos/${id}`, eventId));
        if (!res.ok || !data?.video) { toast.error((data as any)?.error || 'No se pudo abrir la ficha'); onClose(); return; }
        setD(data); setAdminNotes(data.video.adminNotes || '');
    }, [id, eventId, onClose]);
    useEffect(() => { load(); }, [load]);

    const open = async (version: PvVersion, download = false) => {
        const { res, data } = await api<{ url?: string; error?: string }>(ev(`/project-fair/admin/project-videos/${id}/versions/${version.id}/url${download ? '?download=1' : ''}`, eventId));
        if (!res.ok || !data?.url) { toast.error(data?.error || 'No se pudo abrir el video'); return; }
        if (download || !version.current) window.open(data.url, '_blank', 'noopener'); else setVideoUrl(data.url);
    };
    const changeStatus = async () => {
        if (!target || !d) return;
        const t = d.allowedTransitions.find(x => x.key === target);
        if (t?.needsNote && !note.trim()) { toast.error('Indica el motivo: el club lo verá en su perfil.'); return; }
        if (!window.confirm(`¿Cambiar el estado a «${t?.label}»?${['approved', 'changes_requested', 'rejected'].includes(target) ? ' El club recibirá un correo.' : ''}`)) return;
        setBusy('status');
        try {
            const { res, data } = await api<Detail & { error?: string }>(ev(`/project-fair/admin/project-videos/${id}/status`, eventId), { method: 'POST', body: JSON.stringify({ status: target, note }) });
            if (!res.ok || !data?.video) throw new Error((data as any)?.error || 'No se pudo cambiar el estado');
            setD(data); setTarget(''); setNote(''); onChanged(); toast.success(`Estado: ${data.video.statusLabel}`);
        } catch (e: any) { toast.error(e?.message); } finally { setBusy(null); }
    };
    const sendComment = async () => {
        if (!comment.trim()) return;
        setBusy('comment');
        try {
            const { res, data } = await api<{ error?: string }>(ev(`/project-fair/admin/project-videos/${id}/comments`, eventId), { method: 'POST', body: JSON.stringify({ text: comment, internal }) });
            if (!res.ok) throw new Error(data?.error || 'No se pudo guardar');
            setComment(''); load();
        } catch (e: any) { toast.error(e?.message); } finally { setBusy(null); }
    };
    const saveNotes = async () => {
        setBusy('notes');
        try {
            const { res, data } = await api<Detail & { error?: string }>(ev(`/project-fair/admin/project-videos/${id}`, eventId), { method: 'PATCH', body: JSON.stringify({ adminNotes }) });
            if (!res.ok || !data?.video) throw new Error((data as any)?.error || 'No se pudo guardar');
            setD(data); toast.success('Notas guardadas');
        } catch (e: any) { toast.error(e?.message); } finally { setBusy(null); }
    };

    const v = d?.video; const cur = v?.currentVersion || null;
    return (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40" onClick={onClose}>
            <div className="h-full w-full max-w-4xl overflow-y-auto bg-slate-50 shadow-2xl" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
                {!d || !v ? <div className="flex h-full items-center justify-center text-slate-500"><Loader2 className="mr-2 animate-spin" size={20} /> Cargando ficha…</div> : (
                    <>
                        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white px-6 py-4">
                            <div className="flex items-start justify-between gap-4">
                                <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2"><Badge label={v.statusLabel} tone={v.statusTone} /><span className="text-[11px] text-slate-400">Postulación {d.submission.publicRef} · {d.submission.projectStateLabel}</span></div>
                                    <h2 className="mt-1 truncate text-xl font-bold text-slate-900">{v.title || 'Video sin título'}</h2>
                                    <p className="text-sm text-slate-500">{d.submission.projectName} · {d.submission.clubName} · {d.submission.district} · {d.submission.responsible} ({d.submission.email})</p>
                                </div>
                                <button onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
                            </div>
                        </header>
                        <div className="space-y-4 p-6">
                            <Card title="Video" icon={Video} right={cur ? <span className="text-[11px] text-slate-500">{cur.fileName} · {cur.formatLabel} · {cur.sizeLabel}{cur.width ? ` · ${cur.width}×${cur.height}` : ''}{cur.durationLabel ? ` · ${cur.durationLabel}` : ''} · v{cur.number}</span> : undefined}>
                                {!cur && <p className="text-sm text-slate-400">El club todavía no cargó el archivo.</p>}
                                {cur && (
                                    <>
                                        {videoUrl ? <video controls src={videoUrl} className="w-full rounded-xl bg-black" style={{ maxHeight: 460 }} /> : (
                                            <div className="flex flex-wrap gap-2"><Btn kind="primary" onClick={() => open(cur)}><PlayCircle size={13} /> Reproducir</Btn><Btn onClick={() => open(cur, true)}><Download size={13} /> Descargar</Btn></div>
                                        )}
                                        {cur.warnings.length > 0 && <ul className="mt-3 space-y-0.5">{cur.warnings.map((w, i) => <li key={i} className="flex items-start gap-1 text-[12px] text-amber-700"><AlertTriangle size={12} className="mt-0.5 shrink-0" /> {w}</li>)}</ul>}
                                    </>
                                )}
                                <dl className="mt-4 grid gap-3 text-[13px] sm:grid-cols-2">
                                    <div className="sm:col-span-2"><dt className="font-semibold text-slate-500">Descripción</dt><dd className="whitespace-pre-wrap text-slate-800">{v.description || '—'}</dd></div>
                                    <div><dt className="font-semibold text-slate-500">Idioma · Año</dt><dd className="text-slate-800">{v.language || '—'}{v.productionYear ? ` · ${v.productionYear}` : ''}</dd></div>
                                    <div><dt className="font-semibold text-slate-500">Autorización de uso</dt><dd className="text-slate-800">{v.consentAccepted ? `Aceptada el ${vpFmtDateTime(v.consentAt)} (${v.consentVersion})` : 'No aceptada'}</dd></div>
                                    {v.notes && <div className="sm:col-span-2"><dt className="font-semibold text-slate-500">Información adicional del club</dt><dd className="whitespace-pre-wrap text-slate-800">{v.notes}</dd></div>}
                                    <div><dt className="font-semibold text-slate-500">Enviado</dt><dd className="text-slate-800">{vpFmtDateTime(v.submittedAt)}</dd></div>
                                    {v.reviewNote && <div><dt className="font-semibold text-slate-500">Última decisión</dt><dd className="whitespace-pre-wrap text-slate-800">{v.reviewNote}</dd></div>}
                                </dl>
                                {d.versions.length > 1 && (
                                    <div className="mt-4 border-t border-slate-200 pt-3 text-[12px]"><p className="font-semibold text-slate-700">Versiones ({d.versions.length})</p>
                                        <ul className="mt-1 space-y-1">{d.versions.map(x => <li key={x.id} className="flex flex-wrap items-center gap-2 text-slate-600">v{x.number}{x.current ? ' (vigente)' : ''} · {x.fileName} · {x.sizeLabel}{x.durationLabel ? ` · ${x.durationLabel}` : ''} · {vpFmtDateTime(x.createdAt)} <button type="button" onClick={() => open(x, true)} className="font-semibold hover:underline" style={{ color: BLUE }}>descargar</button></li>)}</ul></div>
                                )}
                            </Card>

                            <Card title="Revisión" icon={CheckCircle2}>
                                {d.access.manage ? (
                                    <>
                                        <div className="flex flex-wrap gap-2">
                                            {d.allowedTransitions.map(t => <button key={t.key} type="button" onClick={() => setTarget(t.key)} className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${target === t.key ? 'border-blue-400 bg-blue-50 text-blue-900' : 'border-slate-300 text-slate-700 hover:bg-slate-50'}`}>→ {t.label}</button>)}
                                            {!d.allowedTransitions.length && <span className="text-xs text-slate-400">Sin transiciones desde este estado{v.status === 'draft' ? ' (el club no lo ha enviado)' : v.status === 'withdrawn' ? ' (el club lo retiró)' : ''}.</span>}
                                        </div>
                                        {target && (
                                            <div className="mt-3 flex flex-col gap-2 rounded-lg bg-slate-50 p-3">
                                                <textarea value={note} onChange={e => setNote(e.target.value)} rows={3} placeholder={d.allowedTransitions.find(t => t.key === target)?.needsNote ? 'Motivo u observaciones para el club (obligatorio)' : 'Comentario para el club (opcional)'} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                                                <div className="flex gap-2"><Btn kind="primary" onClick={changeStatus} disabled={busy !== null}>{busy === 'status' ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />} Aplicar</Btn><Btn onClick={() => { setTarget(''); setNote(''); }}>Cancelar</Btn></div>
                                            </div>
                                        )}
                                        <div className="mt-4 border-t border-slate-200 pt-4">
                                            <label className="text-[11px] font-semibold text-slate-500">Notas internas<textarea value={adminNotes} onChange={e => setAdminNotes(e.target.value)} rows={2} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-normal" /></label>
                                            <div className="mt-2"><Btn onClick={saveNotes} disabled={busy !== null}>{busy === 'notes' ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Guardar notas</Btn></div>
                                        </div>
                                    </>
                                ) : <p className="text-sm text-slate-500">Tu perfil puede consultar, no revisar.</p>}
                            </Card>

                            {d.access.comment && (
                                <Card title="Observación" icon={MessageSquare}>
                                    <textarea value={comment} onChange={e => setComment(e.target.value)} rows={2} placeholder={internal ? 'Nota interna (sólo el comité)' : 'Observación para el club (la verá en su perfil)'} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2"><label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={internal} onChange={e => setInternal(e.target.checked)} /> Nota interna</label><Btn kind="primary" onClick={sendComment} disabled={busy !== null || !comment.trim()}>{busy === 'comment' ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} Guardar</Btn></div>
                                </Card>
                            )}

                            <Card title={`Historial (${d.events.length})`} icon={History}>
                                <ol className="space-y-2">{d.events.map(e => <li key={e.id} className="flex gap-3 text-[13px]"><span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${e.visibility === 'internal' ? 'bg-slate-300' : 'bg-blue-400'}`} /><div className="min-w-0"><p className="font-semibold text-slate-800">{e.title || e.type}{e.visibility === 'internal' && <span className="ml-1 rounded bg-slate-100 px-1 text-[10px] font-semibold text-slate-500">interno</span>}</p>{e.detail && <p className="whitespace-pre-wrap text-slate-600">{e.detail}</p>}<p className="text-[11px] text-slate-400">{vpFmtDateTime(e.createdAt)}{e.actorName ? ` · ${e.actorName}${e.actorRole ? ` (${e.actorRole})` : ''}` : ''}</p></div></li>)}</ol>
                                {d.notifications.length > 0 && <p className="mt-3 text-[11px] text-slate-400">Correos: {d.notifications.map(n => `${n.kind} (${n.status})`).join(', ')}</p>}
                            </Card>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

// ── Configuración ────────────────────────────────────────────────────
const VideoConfig = ({ eventId }: { eventId: string }) => {
    const [data, setData] = useState<{ config: PvConfig; own: boolean; updatedAt: string | null; updatedBy: string | null; formats: { key: string; label: string }[]; replacementPolicies: { key: string; label: string }[]; access: { config: boolean } } | null>(null);
    const [draft, setDraft] = useState<PvConfig | null>(null);
    const [recsText, setRecsText] = useState('');
    const [busy, setBusy] = useState(false);
    const load = useCallback(async () => {
        const { res, data } = await api<any>(ev('/project-fair/admin/project-videos/config', eventId));
        if (!res.ok || !data?.config) { toast.error(data?.error || 'No se pudo cargar la configuración'); return; }
        setData(data); setDraft(data.config); setRecsText((data.config.recommendations || []).join('\n'));
    }, [eventId]);
    useEffect(() => { load(); }, [load]);
    const save = async () => {
        if (!draft) return;
        setBusy(true);
        try {
            const { res, data } = await api<{ error?: string }>(ev('/project-fair/admin/project-videos/config', eventId), { method: 'PUT', body: JSON.stringify({ ...draft, recommendations: recsText.split('\n').map(s => s.trim()).filter(Boolean) }) });
            if (!res.ok) throw new Error(data?.error || 'No se pudo guardar');
            toast.success('Configuración guardada'); load();
        } catch (e: any) { toast.error(e?.message); } finally { setBusy(false); }
    };
    if (!data || !draft) return <div className="flex items-center gap-2 py-10 text-slate-500"><Loader2 className="animate-spin" size={18} /> Cargando configuración…</div>;
    const canEdit = data.access.config;
    const input = 'mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-normal text-slate-900 disabled:bg-slate-100';
    const f = (label: string, el: React.ReactNode, span = false) => <label className={`text-[11px] font-semibold text-slate-500 ${span ? 'sm:col-span-2' : ''}`}>{label}{el}</label>;
    return (
        <Card title={`Configuración de videos propios${data.own ? '' : ' (valores heredados)'}`} icon={Settings} right={data.updatedAt ? <span className="text-[11px] text-slate-400">Guardada {vpFmtDateTime(data.updatedAt)} por {data.updatedBy}</span> : undefined}>
            <p className="mb-4 text-[12px] text-slate-500">Vale para esta edición de la Feria. La configuración comercial de los planes del Video Pitch Profesional va aparte, en su pestaña. {!canEdit && 'Tu perfil puede consultar, no editar.'}</p>
            <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex items-center gap-2 text-sm text-slate-700 sm:col-span-2"><input type="checkbox" disabled={!canEdit} checked={draft.enabled} onChange={e => setDraft({ ...draft, enabled: e.target.checked })} /> Recepción de videos propios habilitada</label>
                {f('Formatos permitidos', <div className="mt-1 flex flex-wrap gap-3">{data.formats.map(fm => <label key={fm.key} className="flex items-center gap-1.5 text-sm font-normal text-slate-700"><input type="checkbox" disabled={!canEdit} checked={draft.allowedFormats.includes(fm.key)} onChange={e => setDraft({ ...draft, allowedFormats: e.target.checked ? [...draft.allowedFormats, fm.key] : draft.allowedFormats.filter(x => x !== fm.key) })} /> {fm.label}</label>)}</div>)}
                {f('Tamaño máximo por archivo (MB)', <input type="number" min={10} max={5000} disabled={!canEdit} value={draft.maxSizeMb} onChange={e => setDraft({ ...draft, maxSizeMb: Number(e.target.value) })} className={input} />)}
                {f('Duración sugerida mínima (segundos)', <input type="number" min={0} disabled={!canEdit} value={draft.recommendedMinSec} onChange={e => setDraft({ ...draft, recommendedMinSec: Number(e.target.value) })} className={input} />)}
                {f('Duración sugerida máxima (segundos)', <input type="number" min={0} disabled={!canEdit} value={draft.recommendedMaxSec} onChange={e => setDraft({ ...draft, recommendedMaxSec: Number(e.target.value) })} className={input} />)}
                {f('Duración máxima reglamentaria (segundos; 0 = sin tope)', <input type="number" min={0} disabled={!canEdit} value={draft.maxDurationSec} onChange={e => setDraft({ ...draft, maxDurationSec: Number(e.target.value) })} className={input} />)}
                {f('Resolución recomendada', <input disabled={!canEdit} value={draft.recommendedResolution} onChange={e => setDraft({ ...draft, recommendedResolution: e.target.value })} className={input} />)}
                {f('Número máximo de videos activos por proyecto', <input type="number" min={1} max={10} disabled={!canEdit} value={draft.maxActiveVideos} onChange={e => setDraft({ ...draft, maxActiveVideos: Number(e.target.value) })} className={input} />)}
                {f('Fecha límite de recepción (vacío = sin límite)', <input type="date" disabled={!canEdit} value={draft.deadline} onChange={e => setDraft({ ...draft, deadline: e.target.value })} className={input} />)}
                {f('Política de reemplazo', <select disabled={!canEdit} value={draft.replacementPolicy} onChange={e => setDraft({ ...draft, replacementPolicy: e.target.value })} className={input}>{data.replacementPolicies.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}</select>)}
                {f('Flujo de revisión', <select disabled={!canEdit} value={draft.reviewFlow} onChange={e => setDraft({ ...draft, reviewFlow: e.target.value })} className={input}><option value="committee">Pasa por revisión del comité</option><option value="auto_receive">Sólo se registra (queda aprobado al recibirse)</option></select>)}
                {f('Recomendaciones para los clubes (una por línea)', <textarea rows={7} disabled={!canEdit} value={recsText} onChange={e => setRecsText(e.target.value)} className={input} />, true)}
                <label className="flex items-center gap-2 text-sm text-slate-700 sm:col-span-2"><input type="checkbox" disabled={!canEdit} checked={draft.requireConsent} onChange={e => setDraft({ ...draft, requireConsent: e.target.checked })} /> Exigir la autorización de uso del material antes de enviar</label>
                {f('Texto de la autorización', <textarea rows={4} disabled={!canEdit} value={draft.consentText} onChange={e => setDraft({ ...draft, consentText: e.target.value })} className={input} />, true)}
                <label className="flex items-center gap-2 text-sm text-slate-700 sm:col-span-2" title="Llave para una galería futura: hoy ningún video se publica solo."><input type="checkbox" disabled={!canEdit} checked={draft.publicVisibility} onChange={e => setDraft({ ...draft, publicVisibility: e.target.checked })} /> Permitir visibilidad pública de los videos aprobados (sólo una llave: nada se publica automáticamente)</label>
            </div>
            {canEdit && <div className="mt-4"><Btn kind="primary" onClick={save} disabled={busy}>{busy ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Guardar configuración</Btn></div>}
        </Card>
    );
};

// ── Bandeja de videos propios ────────────────────────────────────────
const OwnVideosAdmin = ({ eventId, onKpis }: { eventId: string; onKpis?: (k: Record<string, number>) => void }) => {
    const [mode, setMode] = useState<'list' | 'config'>('list');
    const [data, setData] = useState<ListResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [q, setQ] = useState(''); const [qApplied, setQApplied] = useState('');
    const [status, setStatus] = useState(''); const [district, setDistrict] = useState('');
    const [sort, setSort] = useState('updatedAt'); const [dir, setDir] = useState<'asc' | 'desc'>('desc');
    const [page, setPage] = useState(1);
    const [detailId, setDetailId] = useState<string | null>(() => new URLSearchParams(window.location.search).get('pv') || null);

    useEffect(() => { const t = setTimeout(() => { setQApplied(q); setPage(1); }, 350); return () => clearTimeout(t); }, [q]);
    const load = useCallback(async () => {
        setLoading(true); setError(null);
        try {
            const params = new URLSearchParams({ evento: eventId || '', q: qApplied, status, district, sort, dir, page: String(page), pageSize: '20' });
            const { res, data } = await api<ListResponse & { error?: string }>(`/project-fair/admin/project-videos?${params}`);
            if (!res.ok || !data?.rows) throw new Error((data as any)?.error || 'No se pudo cargar la bandeja');
            setData(data); onKpis?.(data.kpis);
        } catch (e: any) { setError(e?.message || 'Error'); } finally { setLoading(false); }
    }, [eventId, qApplied, status, district, sort, dir, page, onKpis]);
    useEffect(() => { load(); }, [load]);
    const openDetail = (id: string | null) => { setDetailId(id); const url = new URL(window.location.href); if (id) url.searchParams.set('pv', id); else url.searchParams.delete('pv'); window.history.replaceState(null, '', url.toString()); };
    const toggleSort = (k: string) => { if (sort === k) setDir(x => (x === 'asc' ? 'desc' : 'asc')); else { setSort(k); setDir('desc'); } };
    const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-slate-500">Material cargado directamente por los clubes, sin proceso de contratación.</p>
                <div className="flex gap-2">
                    <div className="flex rounded-lg border border-slate-300 p-0.5"><button type="button" onClick={() => setMode('list')} className={`rounded-md px-3 py-1 text-xs font-semibold ${mode === 'list' ? 'bg-slate-900 text-white' : 'text-slate-600'}`}>Bandeja</button><button type="button" onClick={() => setMode('config')} className={`inline-flex items-center gap-1 rounded-md px-3 py-1 text-xs font-semibold ${mode === 'config' ? 'bg-slate-900 text-white' : 'text-slate-600'}`}><Settings size={12} /> Configuración</button></div>
                    {mode === 'list' && <Btn onClick={load} disabled={loading}><RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Actualizar</Btn>}
                </div>
            </div>
            {mode === 'config' && <VideoConfig eventId={eventId} />}
            {mode === 'list' && (<>
                {error && <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"><AlertTriangle size={16} className="mt-0.5 shrink-0" /> {error}<button onClick={load} className="ml-auto font-bold underline">Reintentar</button></div>}
                {data && <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">{KPIS.map(([k, label]) => <button key={k} type="button" onClick={() => { setStatus(k === 'received' ? 'received' : k === 'approved' ? 'approved' : ''); setPage(1); }} className="rounded-xl border border-slate-200 bg-white p-3 text-left hover:border-slate-300"><p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold text-slate-900">{data.kpis[k] ?? 0}</p></button>)}</div>}
                <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3">
                    <div className="relative min-w-[220px] flex-1"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por proyecto, club, distrito, título o correo…" className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm" /></div>
                    <select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }} className="rounded-lg border border-slate-300 px-2 py-2 text-sm"><option value="">Todos los estados</option>{data?.filters.statuses.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}</select>
                    <select value={district} onChange={e => { setDistrict(e.target.value); setPage(1); }} className="rounded-lg border border-slate-300 px-2 py-2 text-sm"><option value="">Todos los distritos</option>{data?.filters.districts.map(d => <option key={d} value={d}>{d}</option>)}</select>
                </div>
                <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                    <table className="w-full min-w-[900px] text-sm">
                        <thead className="border-b border-slate-200 bg-slate-50"><tr>
                            <SortableTh k="projectName" sort={sort} onToggle={toggleSort}>Proyecto</SortableTh><SortableTh k="clubName" sort={sort} onToggle={toggleSort}>Club</SortableTh><SortableTh k="district" sort={sort} onToggle={toggleSort}>Distrito</SortableTh>
                            <th className="px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">Video</th><SortableTh k="status" sort={sort} onToggle={toggleSort}>Estado</SortableTh><SortableTh k="submittedAt" sort={sort} onToggle={toggleSort}>Enviado</SortableTh><SortableTh k="updatedAt" sort={sort} onToggle={toggleSort}>Actualizado</SortableTh><th className="px-3 py-2" />
                        </tr></thead>
                        <tbody>
                            {loading && !data && <tr><td colSpan={8} className="px-3 py-10 text-center text-slate-400"><Loader2 className="mr-2 inline animate-spin" size={16} /> Cargando…</td></tr>}
                            {data && !data.rows.length && <tr><td colSpan={8} className="px-3 py-10 text-center text-slate-400">No hay videos propios con estos filtros.</td></tr>}
                            {data?.rows.map(r => (
                                <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50">
                                    <td className="max-w-[240px] px-3 py-2"><button onClick={() => openDetail(r.id)} className="truncate text-left font-semibold hover:underline" style={{ color: BLUE }}>{r.projectName}</button><p className="text-[11px] text-slate-400">{r.publicRef} · {r.responsible}</p></td>
                                    <td className="max-w-[160px] truncate px-3 py-2 text-slate-700">{r.clubName}</td><td className="px-3 py-2 text-slate-700">{r.district}</td>
                                    <td className="max-w-[220px] px-3 py-2"><p className="truncate text-slate-800">{r.title || <span className="text-slate-400">Sin título</span>}</p><p className="text-[11px] text-slate-400">{r.hasFile ? `${r.format?.toUpperCase()} · ${r.sizeLabel}${r.durationLabel ? ` · ${r.durationLabel}` : ''} · v${r.versionNumber}` : 'sin archivo'}</p></td>
                                    <td className="px-3 py-2"><Badge label={r.statusLabel} tone={r.statusTone} /></td><td className="px-3 py-2 text-[12px] text-slate-500">{vpFmtDateTime(r.submittedAt)}</td><td className="px-3 py-2 text-[12px] text-slate-500">{vpFmtDateTime(r.updatedAt)}</td>
                                    <td className="px-3 py-2 text-right"><button onClick={() => openDetail(r.id)} className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50">Abrir</button></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {data && data.total > data.pageSize && <div className="flex items-center justify-between text-sm text-slate-600"><span>{data.total} videos · página {data.page} de {totalPages}</span><div className="flex gap-1"><Btn onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}><ChevronLeft size={13} /> Anterior</Btn><Btn onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>Siguiente <ChevronRight size={13} /></Btn></div></div>}
                {detailId && <VideoDrawer id={detailId} eventId={eventId} onClose={() => openDetail(null)} onChanged={load} />}
            </>)}
        </div>
    );
};

// ── El módulo unificado ──────────────────────────────────────────────
const Tile = ({ label, value, hint }: { label: string; value: number | undefined; hint?: string }) => (
    <div className="rounded-xl border border-slate-200 bg-white p-3"><p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 text-xl font-bold text-slate-900">{value ?? '—'}</p>{hint && <p className="text-[10px] text-slate-400">{hint}</p>}</div>
);

const ProjectVideosHub = ({ eventId }: { eventId: string }) => {
    const [tab, setTab] = useState<'own' | 'pitch'>(() => (new URLSearchParams(window.location.search).get('videos') === 'pitch' ? 'pitch' : 'own'));
    const [ownKpis, setOwnKpis] = useState<Record<string, number> | null>(null);
    const [pitchKpis, setPitchKpis] = useState<Record<string, number> | null>(null);
    const setOwn = useCallback((k: Record<string, number>) => setOwnKpis(k), []);
    useEffect(() => {
        (async () => {
            const { res, data } = await api<{ kpis?: Record<string, number> }>(`/project-fair/admin/video-pitch?evento=${encodeURIComponent(eventId || '')}&pageSize=5`);
            if (res.ok && data?.kpis) setPitchKpis(data.kpis);
        })();
    }, [eventId]);
    useEffect(() => {
        if (ownKpis) return;
        (async () => { const { res, data } = await api<{ kpis?: Record<string, number> }>(`/project-fair/admin/project-videos?evento=${encodeURIComponent(eventId || '')}&pageSize=5`); if (res.ok && data?.kpis) setOwnKpis(data.kpis); })();
    }, [eventId, ownKpis]);
    const pick = (t: 'own' | 'pitch') => { setTab(t); const url = new URL(window.location.href); url.searchParams.set('videos', t); window.history.replaceState(null, '', url.toString()); };
    return (
        <div className="space-y-5">
            <div>
                <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900"><Video size={20} style={{ color: BLUE }} /> Videos de proyectos</h2>
                <p className="text-sm text-slate-500">Los recursos audiovisuales de todos los proyectos de la edición: los videos que los clubes suben por su cuenta y las solicitudes de Video Pitch Profesional. Un mismo proyecto puede tener ambos; sus procesos no se mezclan.</p>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
                <Tile label="Con video propio" value={ownKpis?.total} hint="videos propios" /><Tile label="Pend. revisión" value={ownKpis?.pending} hint="videos propios" /><Tile label="Aprobados" value={ownKpis?.approved} hint="videos propios" /><Tile label="Con observaciones" value={ownKpis?.observed} hint="videos propios" />
                <Tile label="Solicitudes" value={pitchKpis?.total} hint="Video Pitch" /><Tile label="Pend. de pago" value={pitchKpis?.pending_payment} hint="Video Pitch" /><Tile label="En producción" value={pitchKpis?.in_production} hint="Video Pitch" /><Tile label="Entregados" value={pitchKpis?.delivered} hint="Video Pitch" />
            </div>
            <div className="flex gap-1 border-b border-slate-200">
                {([['own', 'Videos propios', UploadCloud], ['pitch', 'Video Pitch Profesional', Clapperboard]] as const).map(([k, label, Icon]) => (
                    <button key={k} onClick={() => pick(k)} className={`inline-flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-semibold ${tab === k ? 'border-blue-700 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}><Icon size={15} /> {label}</button>
                ))}
            </div>
            {tab === 'own' ? <OwnVideosAdmin eventId={eventId} onKpis={setOwn} /> : <VideoPitchAdmin eventId={eventId} />}
            <p className="flex items-center gap-1 text-[11px] text-slate-400"><FileText size={11} /> Ningún video se publica solo: la aprobación del comité y la autorización de difusión son decisiones separadas.</p>
        </div>
    );
};

export default ProjectVideosHub;
