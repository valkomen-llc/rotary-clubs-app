// ════════════════════════════════════════════════════════════════════
// Videos de proyectos — la vista del club para su video PROPIO (v4.1298.0)
//
// Una sola pantalla para todo el ciclo:
//   · FICHA (título, descripción, idioma, año, notas) con guardado al salir
//     de cada campo; proyecto, club, distrito y responsable en sólo lectura.
//   · ARCHIVO: recomendaciones de la configuración, zona de arrastrar y soltar
//     con avance real (PUT prefirmado), confirmación del servidor, reproductor
//     con enlace firmado, versiones anteriores, reemplazo según la política.
//   · AUTORIZACIÓN de uso del material (texto configurable, evidencia).
//   · ENVÍO a revisión, retiro, observaciones del comité e historial.
//
// «Subido correctamente» sólo se dice cuando el servidor registró la versión.
// Todo componente de este archivo vive en el ámbito del MÓDULO (v4.971).
// ════════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useRef, useState } from 'react';
import {
    AlertCircle, AlertTriangle, ArrowLeft, CheckCircle2, Clock, Download, History, Loader2, Lock, MessageSquare, PlayCircle,
    RefreshCw, Send, Undo2, Upload, UploadCloud, Video, X,
} from 'lucide-react';
import { BLUE, inputCls } from './FormFields';
import { vpFetch, vpFmtDateTime, vpPutWithProgress, vpReadMediaMeta, vpTone } from '../../lib/videoPitch';
import type { PvPortalView, PvPortalVideo } from '../../lib/projectVideo';

interface Props { token: string; onBack: () => void; onChanged?: () => void; onSessionExpired: () => void; initialAction?: 'edit' | 'replace' | null }
type Upload = { name: string; pct: number; status: 'uploading' | 'confirming' | 'done' | 'error'; error?: string; file: File };

const BLOCK = 'rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6';
const LABEL = 'mb-1.5 block text-sm font-semibold text-slate-800';

const Badge = ({ label, tone }: { label: string; tone?: string }) => {
    const t = vpTone(tone);
    return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${t.badge}`}><span className={`h-1.5 w-1.5 rounded-full ${t.dot}`} /> {label}</span>;
};
const ReadOnly = ({ label, value }: { label: string; value: string }) => (
    <div><span className={LABEL}>{label}</span><div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-[15px] text-slate-700"><Lock size={13} className="shrink-0 text-slate-400" /> <span className="break-words">{value || '—'}</span></div></div>
);

const ProjectVideoView = ({ token, onBack, onChanged, onSessionExpired, initialAction = null }: Props) => {
    const [view, setView] = useState<PvPortalView | null>(null);
    const [loading, setLoading] = useState(true);
    const [meta, setMeta] = useState({ title: '', description: '', language: 'es', productionYear: '' as string | number, notes: '' });
    const [consent, setConsent] = useState(false);
    const [saving, setSaving] = useState(false);
    const [savedAt, setSavedAt] = useState<string | null>(null);
    const [notice, setNotice] = useState<{ kind: 'ok' | 'error' | 'info'; text: string } | null>(null);
    const [upload, setUpload] = useState<Upload | null>(null);
    const [videoUrl, setVideoUrl] = useState<string | null>(null);
    const [videoBusy, setVideoBusy] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [errors, setErrors] = useState<{ field: string; message: string }[]>([]);
    const fileInput = useRef<HTMLInputElement | null>(null);
    const dirty = useRef(false);
    const initialDone = useRef(false);

    const load = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            const { res, data } = await vpFetch<PvPortalView>('/project-fair/portal/project-video', token);
            if (res.status === 401) { onSessionExpired(); return; }
            if (!res.ok || !data) throw new Error((data as any)?.error || 'No pudimos cargar tu video.');
            setView(data);
            const m = data.main;
            if (m && !dirty.current) { setMeta({ title: m.title, description: m.description, language: m.language || 'es', productionYear: m.productionYear || '', notes: m.notes }); setConsent(m.consentAccepted); }
        } catch (e: any) { setNotice({ kind: 'error', text: e?.message || 'No pudimos cargar tu video.' }); }
        finally { setLoading(false); }
    }, [token, onSessionExpired]);
    useEffect(() => { load(); }, [load]);
    useEffect(() => { window.scrollTo({ top: 0, behavior: 'smooth' }); }, []);

    const main: PvPortalVideo | null = view?.main || null;
    const cfg = view?.config;
    const canEdit = Boolean(main ? main.canEdit || main.status === 'received' : view?.canCreate);
    const canReplace = Boolean(main ? main.canReplace : view?.canCreate);

    // ── Ficha ────────────────────────────────────────────────────────
    const save = useCallback(async (silent = true, extra: Record<string, any> = {}): Promise<PvPortalVideo | null> => {
        if (!view?.available) return null;
        setSaving(true);
        try {
            const body = { id: main?.id, ...meta, productionYear: meta.productionYear === '' ? null : Number(meta.productionYear), consentAccepted: consent, ...extra };
            const { res, data } = await vpFetch<{ video?: PvPortalVideo; error?: string; savedAt?: string }>('/project-fair/portal/project-video', token, { method: 'POST', body: JSON.stringify(body) });
            if (res.status === 401) { onSessionExpired(); return null; }
            if (!res.ok || !data?.video) throw new Error(data?.error || 'No pudimos guardar.');
            dirty.current = false;
            setSavedAt(data.savedAt || new Date().toISOString());
            if (!main) await load(true);
            else setView(prev => (prev ? { ...prev, main: { ...prev.main!, ...data.video! } } : prev));
            onChanged?.();
            if (!silent) setNotice({ kind: 'ok', text: 'Ficha guardada.' });
            return data.video;
        } catch (e: any) { setNotice({ kind: 'error', text: e?.message || 'No pudimos guardar.' }); return null; }
        finally { setSaving(false); }
    }, [view?.available, main, meta, consent, token, onSessionExpired, load, onChanged]);

    const setField = (k: keyof typeof meta, v: any) => { dirty.current = true; setErrors(prev => prev.filter(e => e.field !== k)); setMeta(prev => ({ ...prev, [k]: v })); };
    const errorOf = (f: string) => errors.find(e => e.field === f)?.message || null;

    // ── Archivo ──────────────────────────────────────────────────────
    const ensureVideo = useCallback(async (): Promise<string | null> => {
        if (main?.id) return main.id;
        const created = await save(true);
        return created?.id || null;
    }, [main?.id, save]);

    const uploadFile = useCallback(async (file: File) => {
        if (!cfg) return;
        const ext = `.${file.name.split('.').pop()?.toLowerCase() || ''}`;
        if (!(cfg.accept || '').split(',').includes(ext)) { setUpload({ name: file.name, pct: 0, status: 'error', error: `Formato no admitido. Acepta ${cfg.formats?.join(', ')}.`, file }); return; }
        if (file.size > cfg.maxSizeMb * 1024 * 1024) { setUpload({ name: file.name, pct: 0, status: 'error', error: `El video supera el tope de ${cfg.maxSizeMb} MB.`, file }); return; }
        const id = await ensureVideo();
        if (!id) { setNotice({ kind: 'error', text: 'No pudimos crear la ficha del video para subir el archivo.' }); return; }
        setUpload({ name: file.name, pct: 0, status: 'uploading', file });
        try {
            const pre = await vpFetch<{ uploadUrl?: string; storageKey?: string; contentType?: string; error?: string }>(`/project-fair/portal/project-video/${id}/presign`, token, { method: 'POST', body: JSON.stringify({ filename: file.name, size: file.size }) });
            if (pre.res.status === 401) { onSessionExpired(); return; }
            if (!pre.res.ok || !pre.data?.uploadUrl) throw new Error(pre.data?.error || 'No pudimos preparar la subida.');
            await vpPutWithProgress(pre.data.uploadUrl, file, pre.data.contentType || file.type, pct => setUpload(u => (u ? { ...u, pct } : u)));
            setUpload(u => (u ? { ...u, status: 'confirming', pct: 100 } : u));
            const mediaMeta = await vpReadMediaMeta(file);
            const reg = await vpFetch<{ ok?: boolean; error?: string }>(`/project-fair/portal/project-video/${id}/versions`, token, { method: 'POST', body: JSON.stringify({ storageKey: pre.data.storageKey, filename: file.name, ...mediaMeta }) });
            if (!reg.res.ok) throw new Error(reg.data?.error || 'El servidor no aceptó el archivo.');
            setUpload(u => (u ? { ...u, status: 'done' } : u));
            setVideoUrl(null);
            setNotice({ kind: 'ok', text: 'Video recibido y guardado. Ya puedes reproducirlo abajo y, cuando estés conforme, enviarlo a revisión.' });
            await load(true);
            onChanged?.();
            setTimeout(() => setUpload(null), 2500);
        } catch (e: any) {
            setUpload(u => (u ? { ...u, status: 'error', error: e?.message || 'No se pudo subir.' } : u));
        }
    }, [cfg, ensureVideo, token, onSessionExpired, load, onChanged]);

    const openVideo = async (download = false, versionId?: string) => {
        if (!main) return;
        setVideoBusy(true);
        try {
            const { res, data } = await vpFetch<{ url?: string; error?: string }>(`/project-fair/portal/project-video/${main.id}/url?${download ? 'download=1&' : ''}${versionId ? `version=${versionId}` : ''}`, token);
            if (!res.ok || !data?.url) throw new Error(data?.error || 'No pudimos abrir el video.');
            if (download || versionId) window.open(data.url, '_blank', 'noopener'); else setVideoUrl(data.url);
        } catch (e: any) { setNotice({ kind: 'error', text: e?.message }); }
        finally { setVideoBusy(false); }
    };

    // ── Envío y retiro ───────────────────────────────────────────────
    const submit = async () => {
        if (!main || submitting) return;
        setSubmitting(true); setErrors([]);
        try {
            if (dirty.current) await save(true);
            const { res, data } = await vpFetch<{ status?: string; error?: string; errors?: { field: string; message: string }[] }>(`/project-fair/portal/project-video/${main.id}/submit`, token, { method: 'POST', body: JSON.stringify({ consentAccepted: consent }) });
            if (res.status === 401) { onSessionExpired(); return; }
            if (!res.ok) {
                if (data?.errors?.length) { setErrors(data.errors); setNotice({ kind: 'error', text: 'Revisa lo marcado antes de enviar el video.' }); }
                else setNotice({ kind: 'error', text: data?.error || 'No pudimos enviar el video.' });
                return;
            }
            setNotice({ kind: 'ok', text: data?.status === 'approved' ? 'Video recibido y registrado.' : 'Video enviado al comité. Te avisaremos por correo cuando lo revisen.' });
            await load(true); onChanged?.();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } catch { setNotice({ kind: 'error', text: 'No pudimos enviar el video. Inténtalo de nuevo.' }); }
        finally { setSubmitting(false); }
    };
    const withdraw = async () => {
        if (!main || !window.confirm('¿Retirar el video de la revisión? Podrás volver a enviarlo cuando quieras.')) return;
        const { res, data } = await vpFetch<{ error?: string }>(`/project-fair/portal/project-video/${main.id}/withdraw`, token, { method: 'POST', body: '{}' });
        if (!res.ok) { setNotice({ kind: 'error', text: data?.error || 'No pudimos retirar el video.' }); return; }
        setNotice({ kind: 'info', text: 'Video retirado de la revisión.' });
        await load(true); onChanged?.();
    };

    useEffect(() => {
        if (!view || initialDone.current || !initialAction) return;
        initialDone.current = true;
        if (initialAction === 'replace' && canReplace) fileInput.current?.click();
        if (initialAction === 'edit') document.getElementById('pv-title')?.focus();
    }, [view, initialAction, canReplace]);

    if (loading && !view) return <div className="flex items-center justify-center py-20 text-slate-500"><Loader2 className="mr-2 animate-spin" size={20} /> Cargando tu video…</div>;

    const status = view?.status || 'none';
    const cur = main?.currentVersion || null;
    const needsAttention = main && ['changes_requested', 'rejected'].includes(main.status);

    return (
        <div className="space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-slate-900"><ArrowLeft size={15} /> Volver a mi proyecto</button>
                    <h2 className="mt-2 flex items-center gap-2 text-xl font-bold text-slate-900"><UploadCloud size={20} style={{ color: BLUE }} /> Video del proyecto</h2>
                    <p className="text-[13px] text-slate-500">{view?.identity.projectName} · {view?.identity.clubName} · {view?.identity.district} · <span className="font-semibold text-emerald-700">Video propio · Sin costo de producción</span></p>
                </div>
                <div className="flex flex-col items-end gap-1">
                    {view && status !== 'none' && <Badge label={view.statusLabel} tone={view.statusTone} />}
                    {canEdit && <span className="text-[11px] text-slate-400">{saving ? 'Guardando…' : savedAt ? `Ficha guardada ${vpFmtDateTime(savedAt)}` : 'La ficha se guarda al salir de cada campo'}</span>}
                </div>
            </div>

            {notice && (
                <div className={`flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm ${notice.kind === 'ok' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : notice.kind === 'info' ? 'border-blue-200 bg-blue-50 text-blue-900' : 'border-red-200 bg-red-50 text-red-800'}`} role="status">
                    {notice.kind === 'ok' ? <CheckCircle2 size={17} className="mt-0.5 shrink-0" /> : <AlertCircle size={17} className="mt-0.5 shrink-0" />}<span>{notice.text}</span>
                    <button type="button" onClick={() => setNotice(null)} className="ml-auto text-xs font-bold opacity-60 hover:opacity-100">Cerrar</button>
                </div>
            )}
            {view && !view.available && <div className={BLOCK}><p className="flex items-start gap-2 text-sm text-slate-700"><Lock size={16} className="mt-0.5 shrink-0 text-slate-400" /> {view.reason}</p></div>}

            {/* Observaciones del comité */}
            {main && (needsAttention || main.status === 'approved') && main.reviewNote && (
                <section className={`rounded-2xl border p-5 shadow-sm ${needsAttention ? 'border-orange-200 bg-orange-50/50' : 'border-emerald-200 bg-emerald-50/50'}`}>
                    <p className="flex items-center gap-2 text-[15px] font-bold text-slate-900"><MessageSquare size={16} /> {main.status === 'changes_requested' ? 'El comité pidió correcciones' : main.status === 'rejected' ? 'El comité no aprobó el video' : 'Comentario del comité'}</p>
                    <p className="mt-1 whitespace-pre-wrap text-[14px] text-slate-800">{main.reviewNote}</p>
                    {main.status === 'changes_requested' && <p className="mt-2 text-[12px] text-slate-600">Sube una nueva versión del archivo o ajusta la ficha y vuelve a enviar el video.</p>}
                </section>
            )}

            {/* Reproductor */}
            {main && cur && (
                <section className={BLOCK}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                            <h3 className="flex items-center gap-2 text-[16px] font-bold text-slate-900"><Video size={17} style={{ color: BLUE }} /> {main.title || 'Tu video'}</h3>
                            <p className="mt-1 text-[12px] text-slate-500">{cur.fileName} · {cur.formatLabel} · {cur.sizeLabel}{cur.width && cur.height ? ` · ${cur.width}×${cur.height}` : ''}{cur.durationLabel ? ` · ${cur.durationLabel}` : ''} · versión {cur.number} · cargado el {vpFmtDateTime(cur.createdAt)}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {!videoUrl && <button type="button" onClick={() => openVideo(false)} disabled={videoBusy} className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-bold text-white disabled:opacity-60" style={{ background: BLUE }}>{videoBusy ? <Loader2 size={15} className="animate-spin" /> : <PlayCircle size={15} />} Reproducir</button>}
                            <button type="button" onClick={() => openVideo(true)} disabled={videoBusy} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60"><Download size={15} /> Descargar</button>
                        </div>
                    </div>
                    {videoUrl && <video controls src={videoUrl} className="mt-4 w-full rounded-xl bg-black" style={{ maxHeight: 480 }} />}
                    {cur.warnings.length > 0 && <ul className="mt-3 space-y-0.5">{cur.warnings.map((w, i) => <li key={i} className="flex items-start gap-1 text-[12px] text-amber-700"><AlertTriangle size={12} className="mt-0.5 shrink-0" /> {w}</li>)}</ul>}
                    <p className="mt-3 flex items-center gap-1.5 text-[12px] text-emerald-700"><CheckCircle2 size={13} /> Guardado en el almacenamiento privado de la Feria: el comité puede verlo cuando lo envíes a revisión.</p>
                </section>
            )}

            {/* Ficha */}
            {view?.available && (status !== 'none' || view.canCreate) && (
                <section className={BLOCK}>
                    <h3 className="text-[16px] font-bold text-slate-900">Información del video</h3>
                    <p className="mt-0.5 text-[13px] text-slate-500">El proyecto, el club y el distrito salen de tu postulación.</p>
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                        <ReadOnly label="Proyecto" value={`${view.identity.projectName} · ${view.identity.publicRef}`} />
                        <ReadOnly label="Club y distrito" value={`${view.identity.clubName} · ${view.identity.district}`} />
                        <ReadOnly label="Responsable" value={view.identity.responsible} />
                        <div>
                            <label className={LABEL} htmlFor="pv-title">Título del video <span className="text-red-500">*</span></label>
                            <input id="pv-title" value={meta.title} disabled={!canEdit} onChange={e => setField('title', e.target.value)} onBlur={() => { if (dirty.current) save(true); }} className={inputCls(!canEdit, Boolean(errorOf('title')))} placeholder="Ej.: Agua limpia para tres veredas" />
                            {errorOf('title') && <p className="mt-1 text-[12px] text-red-600">{errorOf('title')}</p>}
                        </div>
                        <div className="sm:col-span-2">
                            <label className={LABEL} htmlFor="pv-desc">Descripción breve</label>
                            <textarea id="pv-desc" rows={3} value={meta.description} disabled={!canEdit} onChange={e => setField('description', e.target.value)} onBlur={() => { if (dirty.current) save(true); }} className={inputCls(!canEdit)} placeholder="Qué se presenta, cuál es el impacto comunitario y qué apoyo necesita el proyecto." />
                        </div>
                        <div>
                            <label className={LABEL} htmlFor="pv-lang">Idioma principal</label>
                            <select id="pv-lang" value={meta.language} disabled={!canEdit} onChange={e => { setField('language', e.target.value); setTimeout(() => save(true), 0); }} className={inputCls(!canEdit)}>
                                {view.catalog.languages.map(l => <option key={l.key} value={l.key}>{l.label}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className={LABEL} htmlFor="pv-year">Año de producción <span className="font-normal text-slate-400">(opcional)</span></label>
                            <input id="pv-year" type="number" min={1990} max={2100} value={meta.productionYear} disabled={!canEdit} onChange={e => setField('productionYear', e.target.value)} onBlur={() => { if (dirty.current) save(true); }} className={inputCls(!canEdit)} />
                        </div>
                        <div className="sm:col-span-2">
                            <label className={LABEL} htmlFor="pv-notes">Información adicional para el comité <span className="font-normal text-slate-400">(opcional)</span></label>
                            <textarea id="pv-notes" rows={2} value={meta.notes} disabled={!canEdit} onChange={e => setField('notes', e.target.value)} onBlur={() => { if (dirty.current) save(true); }} className={inputCls(!canEdit)} />
                        </div>
                    </div>
                </section>
            )}

            {/* Archivo */}
            {view?.available && (status !== 'none' || view.canCreate) && cfg && (
                <section className={BLOCK}>
                    <h3 className="text-[16px] font-bold text-slate-900">{cur ? 'Reemplazar el archivo' : 'Archivo del video'}</h3>
                    <div className="mt-3 rounded-xl bg-slate-50 p-4">
                        <p className="text-[12px] font-bold text-slate-800">Recomendaciones del comité</p>
                        <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-[12px] text-slate-600">{cfg.recommendations.map((r, i) => <li key={i}>{r}</li>)}</ul>
                        <p className="mt-2 text-[12px] text-slate-500">Formatos: {cfg.formats?.join(', ')} · hasta {cfg.maxSizeMb} MB{cfg.maxDurationSec ? ` · duración máxima ${Math.round(cfg.maxDurationSec / 60)} min` : ''}. Un video vertical o más largo de lo sugerido se acepta igual: te avisamos.</p>
                    </div>
                    {canReplace ? (
                        <label className="mt-4 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 bg-white px-4 py-8 text-center transition hover:border-[#17458F] hover:bg-blue-50/30"
                            onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) uploadFile(f); }}>
                            <Upload size={22} style={{ color: BLUE }} />
                            <span className="text-sm font-bold text-slate-800">{cur ? 'Arrastra la nueva versión aquí o haz clic para elegirla' : 'Arrastra tu video aquí o haz clic para elegirlo'}</span>
                            <span className="text-[12px] text-slate-500">{cfg.formats?.join(', ')} · hasta {cfg.maxSizeMb} MB</span>
                            <input ref={fileInput} type="file" accept={cfg.accept} className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) uploadFile(f); if (fileInput.current) fileInput.current.value = ''; }} />
                        </label>
                    ) : (
                        <p className="mt-4 flex items-start gap-1.5 rounded-lg bg-slate-50 px-3 py-2 text-[12px] text-slate-600"><Lock size={13} className="mt-0.5 shrink-0" /> {main?.status === 'approved' ? 'El video está aprobado: ya no se reemplaza.' : main?.status === 'rejected' ? 'El video fue rechazado.' : 'El video está en manos del comité: para cambiar el archivo, retíralo primero.'}</p>
                    )}
                    {upload && (
                        <div className="mt-3 rounded-xl border border-slate-200 p-3">
                            <div className="flex items-center justify-between gap-2">
                                <p className="truncate text-sm font-semibold text-slate-800">{upload.name}</p>
                                {upload.status === 'uploading' && <span className="text-[12px] font-bold text-slate-500">Subiendo… {upload.pct}%</span>}
                                {upload.status === 'confirming' && <span className="inline-flex items-center gap-1 text-[12px] font-bold text-slate-500"><Loader2 size={12} className="animate-spin" /> Confirmando con el servidor…</span>}
                                {upload.status === 'done' && <span className="inline-flex items-center gap-1 text-[12px] font-bold text-emerald-700"><CheckCircle2 size={13} /> Recibido</span>}
                                {upload.status === 'error' && <div className="flex items-center gap-2"><button type="button" onClick={() => uploadFile(upload.file)} className="inline-flex items-center gap-1 text-[12px] font-bold hover:underline" style={{ color: BLUE }}><RefreshCw size={12} /> Reintentar</button><button type="button" onClick={() => setUpload(null)} className="text-slate-400 hover:text-slate-700"><X size={14} /></button></div>}
                            </div>
                            {(upload.status === 'uploading' || upload.status === 'confirming') && <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full transition-all" style={{ width: `${upload.pct}%`, background: BLUE }} /></div>}
                            {upload.error && <p className="mt-1 text-[12px] text-red-600">{upload.error}</p>}
                        </div>
                    )}
                    {main && main.versions.length > 1 && (
                        <details className="mt-4 text-[12px] text-slate-600">
                            <summary className="cursor-pointer font-semibold text-slate-700"><History size={12} className="mr-1 inline" /> Versiones anteriores ({main.versions.length - 1})</summary>
                            <ul className="mt-2 space-y-1">{main.versions.filter(v => !v.current).map(v => <li key={v.id} className="flex flex-wrap items-center gap-2">Versión {v.number} · {v.fileName} · {v.sizeLabel}{v.durationLabel ? ` · ${v.durationLabel}` : ''} · {vpFmtDateTime(v.createdAt)} <button type="button" onClick={() => openVideo(false, v.id)} className="font-semibold hover:underline" style={{ color: BLUE }}>ver</button></li>)}</ul>
                        </details>
                    )}
                </section>
            )}

            {/* Autorización y envío */}
            {view?.available && main && (
                <section className={BLOCK}>
                    {cfg?.requireConsent && (
                        <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 ${errorOf('consent') ? 'border-red-300 bg-red-50/40' : 'border-slate-200 bg-slate-50'}`}>
                            <input type="checkbox" checked={consent} disabled={!canEdit && !main.canSubmit} onChange={e => { setConsent(e.target.checked); setTimeout(() => save(true, { consentAccepted: e.target.checked }), 0); }} className="mt-1 h-4 w-4" />
                            <span className="text-[13px] text-slate-700">{cfg.consentText} <span className="text-red-500">*</span>
                                {main.consentAt && <span className="mt-1 block text-[11px] text-slate-400">Aceptada el {vpFmtDateTime(main.consentAt)} (versión {main.consentVersion}).</span>}
                                {errorOf('consent') && <span className="block text-[12px] text-red-600">{errorOf('consent')}</span>}
                            </span>
                        </label>
                    )}
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                        <div className="text-[13px] text-slate-600">
                            {main.submittedAt && <p className="flex items-center gap-1"><Clock size={12} /> Enviado el {vpFmtDateTime(main.submittedAt)}</p>}
                            {main.canSubmit && !main.validation.ok && <p>Faltan {main.validation.errors.length} dato(s) para enviar.</p>}
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {main.canWithdraw && <button type="button" onClick={withdraw} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50"><Undo2 size={15} /> Retirar de la revisión</button>}
                            {main.canSubmit && (
                                <button type="button" onClick={submit} disabled={submitting || saving} className="inline-flex items-center gap-1.5 rounded-xl px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60" style={{ background: BLUE }}>
                                    {submitting ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} {main.status === 'draft' ? 'Enviar a revisión' : 'Volver a enviar'}
                                </button>
                            )}
                        </div>
                    </div>
                </section>
            )}

            {/* Historial */}
            {main && main.events.length > 0 && (
                <section className={BLOCK}>
                    <h3 className="flex items-center gap-2 text-[16px] font-bold text-slate-900"><History size={17} style={{ color: BLUE }} /> Historial</h3>
                    <ol className="mt-3 space-y-2">
                        {main.events.map(e => (
                            <li key={e.id} className="flex gap-3 text-[13px]"><span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-slate-300" />
                                <div className="min-w-0"><p className="font-semibold text-slate-800">{e.title || e.type}</p>{e.detail && <p className="whitespace-pre-wrap text-slate-600">{e.detail}</p>}<p className="text-[11px] text-slate-400">{vpFmtDateTime(e.createdAt)}{e.actorName ? ` · ${e.actorRole === 'club' ? 'Tú' : 'Comité'}` : ''}</p></div>
                            </li>
                        ))}
                    </ol>
                </section>
            )}
        </div>
    );
};

export default ProjectVideoView;
