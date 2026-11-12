// ════════════════════════════════════════════════════════════════════════════
// Expediente → «Traducción» (v4.1324.0)
//
// Editor bilingüe de dos columnas: «Español — Original» y «English —
// Translation». La IA hace el primer borrador (sólo de los textos narrativos);
// una persona lo corrige, marca cada campo como revisado y quien tiene permiso
// lo aprueba. Regenerar UN campo no toca los demás; «Regenerar todo» respeta
// lo revisado y lo corregido a mano. Si el español cambia después, el campo
// queda «desactualizado» con el original anterior a la vista.
// ════════════════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, BookOpen, CheckCircle2, Languages, Loader2, RefreshCw, Save, ShieldCheck, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import type { DossierCaps, TranslationField, TranslationStatus } from '../../../../lib/projectDossier';
import { DossierApiError, dossierRequest, FIELD_META, TRANSLATION_META } from '../../../../lib/projectDossier';
import GlosarioModal from './GlosarioModal';

const BLUE = '#17458F';
type Filter = 'all' | 'pending' | 'outdated' | 'warnings';

interface Props {
    submissionId: string;
    eventId: string;
    access: DossierCaps;
    wide?: boolean;
    autoStart?: boolean;
    onStatusChange: (s: TranslationStatus) => void;
    onDirtyChange?: (dirty: boolean) => void;
}

const fmtWhen = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' }) : '');

const ExpedienteTraduccion = ({ submissionId, eventId, access, wide = false, autoStart = false, onStatusChange, onDirtyChange }: Props) => {
    const [status, setStatus] = useState<TranslationStatus | null>(null);
    const [versions, setVersions] = useState<{ id: string; versionNumber: number; approvedBy: string | null; approvedAt: string; note: string | null }[]>([]);
    const [edits, setEdits] = useState<Record<string, { text: string; reviewed: boolean }>>({});
    const [busy, setBusy] = useState<string | null>(null);
    const [filter, setFilter] = useState<Filter>('all');
    const [includeReviewed, setIncludeReviewed] = useState(false);
    const [showGlossary, setShowGlossary] = useState(false);
    const [autoStarted, setAutoStarted] = useState(false);
    // El aviso al padre va por una ref: si dependiera de la función, un padre
    // que la recree en cada render dispararía la carga en bucle.
    const notify = useRef(onStatusChange);
    notify.current = onStatusChange;

    const load = useCallback(async () => {
        try {
            const d = await dossierRequest<{ status: TranslationStatus; versions: any[] }>(`/postulaciones/${submissionId}/traduccion/en`, eventId);
            setStatus(d.status); setVersions(d.versions || []); notify.current(d.status);
        } catch (e: any) { toast.error(e?.message || 'No se pudo cargar la traducción'); }
    }, [submissionId, eventId]);
    useEffect(() => { load(); }, [load]);

    const dirtyCount = Object.keys(edits).length;
    useEffect(() => { onDirtyChange?.(dirtyCount > 0); }, [dirtyCount, onDirtyChange]);

    const apply = (s: TranslationStatus) => { setStatus(s); notify.current(s); };

    const generate = useCallback(async (paths?: string[]) => {
        setBusy(paths?.length === 1 ? paths[0] : 'all');
        try {
            const d = await dossierRequest<any>(`/postulaciones/${submissionId}/traduccion/en/generar`, eventId, { method: 'POST', body: paths ? { paths } : { includeReviewed } });
            apply(d.status);
            if (paths) setEdits(e => { const n = { ...e }; paths.forEach(p => delete n[p]); return n; });
            if (d.translated === 0) toast.info(d.message || 'No había campos pendientes.');
            else toast.success(`${d.translated} campo(s) traducidos. Revísalos antes de aprobar.${d.errors?.length ? ` Algunos fallaron: ${d.errors[0]}` : ''}`);
        } catch (e: any) {
            if (e instanceof DossierApiError && e.body?.status) apply(e.body.status);
            toast.error(e?.message || 'No se pudo traducir');
        } finally { setBusy(null); }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [submissionId, eventId, includeReviewed]);

    // «Traducir al inglés» desde el menú de la tabla: arranca solo, una vez.
    useEffect(() => {
        if (autoStart && !autoStarted && status && status.state === 'not_started' && access.translate && status.total > 0) {
            setAutoStarted(true);
            generate();
        }
    }, [autoStart, autoStarted, status, access.translate, generate]);

    const save = async (extra?: Record<string, { text: string; reviewed: boolean }>) => {
        const payload = { ...edits, ...(extra || {}) };
        const fields = Object.entries(payload).map(([path, v]) => ({ path, text: v.text, reviewed: v.reviewed }));
        if (!fields.length) return;
        setBusy('save');
        try {
            const d = await dossierRequest<any>(`/postulaciones/${submissionId}/traduccion/en`, eventId, { method: 'PUT', body: { fields } });
            apply(d.status); setEdits({});
            toast.success(`Traducción guardada (${d.saved} campo${d.saved === 1 ? '' : 's'}).`);
        } catch (e: any) { toast.error(e?.message || 'No se pudo guardar'); } finally { setBusy(null); }
    };

    const markAllReviewed = () => {
        if (!status?.fields) return;
        const extra: Record<string, { text: string; reviewed: boolean }> = {};
        for (const f of status.fields) {
            const cur = edits[f.path];
            const text = cur?.text ?? f.text ?? '';
            if (text.trim() && f.state !== 'outdated' && !f.reviewed) extra[f.path] = { text, reviewed: true };
        }
        if (!Object.keys(extra).length) { toast.info('No hay campos traducidos pendientes de marcar (los desactualizados se revisan uno por uno).'); return; }
        save(extra);
    };

    const approve = async (acknowledgeWarnings = false) => {
        if (dirtyCount) { toast.error('Guarda los cambios antes de aprobar.'); return; }
        setBusy('approve');
        try {
            const d = await dossierRequest<any>(`/postulaciones/${submissionId}/traduccion/en/aprobar`, eventId, { method: 'POST', body: { acknowledgeWarnings } });
            apply(d.status);
            toast.success(`Versión inglesa aprobada (versión ${d.version.versionNumber}).`);
            load();
        } catch (e: any) {
            if (e instanceof DossierApiError && e.body?.needsAcknowledge) {
                if (window.confirm(`${e.message}\n\n¿Aprobar de todos modos?`)) { setBusy(null); return approve(true); }
            } else toast.error(e?.message || 'No se pudo aprobar');
        } finally { setBusy(null); }
    };

    const fields = status?.fields || [];
    const shown = useMemo(() => fields.filter(f => {
        if (filter === 'pending') return f.state === 'missing' || f.state === 'draft';
        if (filter === 'outdated') return f.state === 'outdated';
        if (filter === 'warnings') return f.warnings.length > 0;
        return true;
    }), [fields, filter]);

    if (!status) return <div className="flex items-center justify-center py-16 text-slate-500"><Loader2 size={18} className="mr-2 animate-spin" /> Cargando traducción…</div>;
    const meta = TRANSLATION_META[status.state];
    const generating = busy === 'all' || status.state === 'generating';

    return (
        <div className="space-y-4">
            <section className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Traducción inglesa</p>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                            <span className={`rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${meta.cls}`}>{meta.label}</span>
                            <span className="text-xs text-slate-500">{status.counts.reviewed} de {status.total} campos revisados</span>
                            {status.counts.outdated > 0 && <span className="text-xs font-semibold text-red-700">· {status.counts.outdated} desactualizado(s)</span>}
                            {status.warnings > 0 && <span className="text-xs font-semibold text-amber-700">· {status.warnings} con avisos</span>}
                        </div>
                        {status.approvedAt && <p className="mt-1 text-xs text-slate-500">Última aprobación: {fmtWhen(status.approvedAt)} por {status.approvedBy}{status.state !== 'approved' ? ' — hubo cambios después; la versión aprobada se conserva y la ficha inglesa la sigue usando.' : ''}</p>}
                        {status.lastError && <p className="mt-1 text-xs text-red-700">Último error: {status.lastError}</p>}
                        <p className="mt-1 text-[11px] text-slate-400">El estado de traducción es independiente del estado de la postulación y del pago.</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <button onClick={() => setShowGlossary(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700"><BookOpen size={13} /> Glosario</button>
                        {access.translate && (
                            <button onClick={() => generate()} disabled={!!busy || status.total === 0}
                                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold text-white disabled:opacity-50" style={{ background: BLUE }}>
                                {generating ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                                {status.state === 'not_started' || status.state === 'error' ? 'Traducir proyecto al inglés' : 'Regenerar pendientes'}
                            </button>
                        )}
                        {access.approveTranslation && (
                            <button onClick={() => approve()} disabled={!!busy || status.state === 'approved'}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">
                                {busy === 'approve' ? <Loader2 size={13} className="animate-spin" /> : <ShieldCheck size={13} />} Aprobar versión inglesa
                            </button>
                        )}
                    </div>
                </div>
                {access.translate && status.state !== 'not_started' && (
                    <label className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-slate-500">
                        <input type="checkbox" checked={includeReviewed} onChange={e => setIncludeReviewed(e.target.checked)} />
                        Al regenerar, rehacer también los campos ya revisados o corregidos a mano (se guardan en el historial)
                    </label>
                )}
                {generating && <p className="mt-3 rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-800"><Loader2 size={12} className="mr-1.5 inline animate-spin" /> Traduciendo con IA… un proyecto completo puede tardar hasta un minuto. Sólo se envían los textos narrativos: nombres, correos, teléfonos, cifras y documentos se conservan.</p>}
                {status.total === 0 && <p className="mt-3 text-xs text-slate-500">Este proyecto todavía no tiene textos narrativos para traducir.</p>}
            </section>

            {status.total > 0 && (
                <div className="sticky top-0 z-[5] -mx-6 flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50/95 px-6 py-2.5 backdrop-blur">
                    {([['all', `Todos (${fields.length})`], ['pending', `Por revisar (${status.counts.missing + status.counts.draft})`], ['outdated', `Desactualizados (${status.counts.outdated})`], ['warnings', `Con avisos (${status.warnings})`]] as [Filter, string][]).map(([k, l]) => (
                        <button key={k} onClick={() => setFilter(k)} className={`rounded-full px-3 py-1 text-xs font-semibold ${filter === k ? 'text-white' : 'border border-slate-300 bg-white text-slate-600'}`} style={filter === k ? { background: BLUE } : undefined}>{l}</button>
                    ))}
                    <div className="ml-auto flex flex-wrap gap-2">
                        {access.translate && <button onClick={markAllReviewed} disabled={!!busy} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"><CheckCircle2 size={13} /> Marcar todos como revisados</button>}
                        {access.translate && <button onClick={() => save()} disabled={!dirtyCount || !!busy} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50" style={{ background: BLUE }}>{busy === 'save' ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Guardar borrador{dirtyCount ? ` (${dirtyCount})` : ''}</button>}
                    </div>
                </div>
            )}

            {shown.map((f: TranslationField, i) => {
                const prevSection = i > 0 ? shown[i - 1].sectionTitle + shown[i - 1].groupKey : null;
                const edit = edits[f.path];
                const text = edit?.text ?? f.text ?? '';
                const reviewed = edit?.reviewed ?? f.reviewed;
                const fm = FIELD_META[f.state];
                return (
                    <div key={f.path}>
                        {prevSection !== f.sectionTitle + f.groupKey && <h4 className="mb-2 mt-4 text-[11px] font-bold uppercase tracking-wide" style={{ color: BLUE }}>{f.sectionTitle}</h4>}
                        <article className={`rounded-xl border bg-white ${f.state === 'outdated' ? 'border-red-200' : edit ? 'border-amber-300' : 'border-slate-200'}`} aria-label={`Traducción de ${f.label}`}>
                            <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-2">
                                <span className="text-sm font-semibold text-slate-800">{f.label}</span>
                                {f.labelEn && <span className="text-xs text-slate-400">· {f.labelEn}</span>}
                                <span className={`ml-auto rounded-full px-2 py-0.5 text-[11px] font-semibold ${fm.cls}`}>{fm.label}</span>
                                {f.origin && <span className="text-[11px] text-slate-400">{f.origin === 'ai' ? 'IA' : 'Corregido a mano'}</span>}
                            </div>
                            <div className={`grid gap-0 ${wide ? 'md:grid-cols-2' : 'sm:grid-cols-2'}`}>
                                <div className="border-b border-slate-100 p-4 sm:border-b-0 sm:border-r">
                                    <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">Español — Original</p>
                                    <p className="whitespace-pre-line text-sm leading-relaxed text-slate-800">{f.source}</p>
                                    {f.state === 'outdated' && f.previousSource && (
                                        <div className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800">
                                            <p className="font-semibold">El original cambió después de traducirse. Antes decía:</p>
                                            <p className="mt-0.5 whitespace-pre-line text-red-700/90">{f.previousSource}</p>
                                        </div>
                                    )}
                                </div>
                                <div className="p-4">
                                    <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">English — Translation</p>
                                    {access.translate ? (
                                        <textarea value={text} rows={Math.min(14, Math.max(3, Math.ceil(Math.max(text.length, f.source.length) / 70)))}
                                            onChange={e => setEdits(x => ({ ...x, [f.path]: { text: e.target.value, reviewed: false } }))}
                                            placeholder="Sin traducir todavía" aria-label={`Traducción al inglés de ${f.label}`}
                                            className="w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm leading-relaxed" />
                                    ) : (
                                        <p className="whitespace-pre-line text-sm leading-relaxed text-slate-800">{text || <span className="italic text-slate-400">Sin traducir todavía</span>}</p>
                                    )}
                                    {f.warnings.length > 0 && (
                                        <ul className="mt-2 space-y-1">
                                            {f.warnings.map(w => <li key={w.code} className="flex items-start gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900"><AlertTriangle size={12} className="mt-0.5 shrink-0" /> {w.message}</li>)}
                                        </ul>
                                    )}
                                    {access.translate && (
                                        <div className="mt-2 flex flex-wrap items-center gap-3">
                                            <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                                                <input type="checkbox" checked={reviewed} disabled={!text.trim()}
                                                    onChange={e => setEdits(x => ({ ...x, [f.path]: { text, reviewed: e.target.checked } }))} />
                                                Revisado
                                            </label>
                                            <button onClick={() => generate([f.path])} disabled={!!busy}
                                                className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:underline disabled:opacity-50">
                                                {busy === f.path ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Regenerar este campo
                                            </button>
                                            {f.updatedAt && <span className="text-[11px] text-slate-400">{fmtWhen(f.updatedAt)}{f.updatedBy ? ` · ${f.updatedBy}` : ''}</span>}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </article>
                    </div>
                );
            })}
            {status.total > 0 && !shown.length && <p className="py-8 text-center text-sm text-slate-500">No hay campos en este filtro.</p>}

            {versions.length > 0 && (
                <section className="rounded-xl border border-slate-200 bg-white p-4">
                    <h4 className="mb-2 inline-flex items-center gap-1.5 text-sm font-bold text-slate-900"><Languages size={15} /> Versiones aprobadas</h4>
                    <ul className="space-y-1 text-xs text-slate-600">
                        {versions.map(v => <li key={v.id}>Versión {v.versionNumber} · {fmtWhen(v.approvedAt)} · {v.approvedBy}{v.note ? ` — ${v.note}` : ''}</li>)}
                    </ul>
                </section>
            )}

            {showGlossary && <GlosarioModal eventId={eventId} canManage={access.config} onClose={() => setShowGlossary(false)} />}
        </div>
    );
};

export default ExpedienteTraduccion;
