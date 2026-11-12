// ════════════════════════════════════════════════════════════════════════════
// Operaciones documentales en lote sobre los proyectos SELECCIONADOS (v4.1324)
//
//   · Fichas PDF (español, inglés o bilingüe): un ZIP con un PDF por proyecto.
//     El servidor descarta lo que esté fuera de la edición y lo dice.
//   · Traducir al inglés: proyecto por proyecto, en SECUENCIA, con progreso y
//     botón para detener. Cada proyecto es su propia petición (ninguna se acerca
//     al tope de la función), y la pantalla sigue respondiendo.
//   · Estado de traducción de la selección: cuáles faltan.
// ════════════════════════════════════════════════════════════════════════════
import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, FileDown, Languages, Loader2, Square, X, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import type { DocumentPayload, TranslationState } from '../../../../lib/projectDossier';
import { dossierRequest, TRANSLATION_META } from '../../../../lib/projectDossier';

interface Row { id: string; publicRef: string; projectName: string }
type StateMap = Record<string, { en: { state: TranslationState; label: string; total: number; counts: Record<string, number> } }>;

const ExpedientesLote = ({ rows, eventId, access, onClose, onChanged }: {
    rows: Row[]; eventId: string; access: { translate?: boolean; export?: boolean }; onClose: () => void; onChanged?: () => void;
}) => {
    const [states, setStates] = useState<StateMap | null>(null);
    const [kind, setKind] = useState<'es' | 'en' | 'bilingual'>('bilingual');
    const [running, setRunning] = useState<null | 'pdf' | 'translate'>(null);
    const [progress, setProgress] = useState<{ done: number; total: number; log: { ref: string; ok: boolean; msg: string }[] }>({ done: 0, total: 0, log: [] });
    const stop = useRef(false);

    const loadStates = async () => {
        try {
            const d = await dossierRequest<{ states: StateMap }>(`/expedientes/estado?ids=${rows.map(r => r.id).join(',')}`, eventId);
            setStates(d.states);
        } catch (e: any) { toast.error(e?.message || 'No se pudo consultar el estado'); setStates({}); }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { loadStates(); }, []);

    const pdfs = async () => {
        setRunning('pdf'); setProgress({ done: 0, total: rows.length, log: [] });
        try {
            const all: DocumentPayload[] = [];
            const skipped: string[] = [];
            // De a 15 por petición: cada lote es corto y el progreso se ve.
            for (let i = 0; i < rows.length; i += 15) {
                const ids = rows.slice(i, i + 15).map(r => r.id);
                const d = await dossierRequest<{ documents: DocumentPayload[]; skipped: string[] }>('/expedientes/documentos', eventId, { method: 'POST', body: { ids, lang: kind } });
                all.push(...d.documents); skipped.push(...d.skipped);
            }
            const { buildDossierZip, downloadBlob } = await import('../../../../lib/projectDossierPdf');
            const blob = await buildDossierZip(all, (done, total) => setProgress(p => ({ ...p, done, total })));
            downloadBlob(blob, `fichas-${kind === 'es' ? 'espanol' : kind === 'en' ? 'ingles' : 'bilingues'}-${all.length}-proyectos.zip`);
            toast.success(`${all.length} ficha(s) descargadas en un ZIP.${skipped.length ? ` ${skipped.length} fuera de esta edición no se incluyeron.` : ''}`);
        } catch (e: any) { toast.error(e?.message || 'No se pudo generar el paquete'); } finally { setRunning(null); }
    };

    const translate = async () => {
        const targets = rows.filter(r => {
            const st = states?.[r.id]?.en;
            return st && st.total > 0 && ['not_started', 'error', 'draft', 'outdated'].includes(st.state);
        });
        if (!targets.length) { toast.info('Ningún proyecto seleccionado tiene campos pendientes de traducir.'); return; }
        if (!window.confirm(`Se traducirán con IA los campos pendientes de ${targets.length} proyecto(s), uno por uno. Lo revisado y lo corregido a mano se respeta. ¿Continuar?`)) return;
        stop.current = false;
        setRunning('translate'); setProgress({ done: 0, total: targets.length, log: [] });
        for (const r of targets) {
            if (stop.current) break;
            try {
                const d = await dossierRequest<any>(`/postulaciones/${r.id}/traduccion/en/generar`, eventId, { method: 'POST', body: {} });
                setProgress(p => ({ ...p, done: p.done + 1, log: [...p.log, { ref: r.publicRef, ok: true, msg: `${d.translated} campo(s)` }] }));
            } catch (e: any) {
                setProgress(p => ({ ...p, done: p.done + 1, log: [...p.log, { ref: r.publicRef, ok: false, msg: e?.message || 'error' }] }));
            }
        }
        setRunning(null);
        await loadStates();
        onChanged?.();
    };

    const counts = Object.values(states || {}).reduce<Record<string, number>>((acc, s) => { acc[s.en.state] = (acc[s.en.state] || 0) + 1; return acc; }, {});
    const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;

    return (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-900/50 sm:items-center sm:p-4" onClick={() => !running && onClose()}>
            <div role="dialog" aria-label="Documentación en lote" className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl" onClick={e => e.stopPropagation()}>
                <header className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
                    <div>
                        <h3 className="text-base font-bold text-slate-900">Documentación de {rows.length} proyecto(s) seleccionado(s)</h3>
                        <p className="mt-0.5 text-xs text-slate-500">Fichas PDF en un ZIP y traducción al inglés, sólo de proyectos de esta edición.</p>
                    </div>
                    <button onClick={onClose} disabled={!!running} aria-label="Cerrar" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 disabled:opacity-40"><X size={18} /></button>
                </header>
                <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
                    <section>
                        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Traducciones de la selección</p>
                        {!states ? <p className="text-sm text-slate-500"><Loader2 size={14} className="mr-1 inline animate-spin" /> Consultando…</p> : (
                            <div className="flex flex-wrap gap-1.5">
                                {Object.entries(counts).map(([k, n]) => <span key={k} className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${TRANSLATION_META[k as TranslationState]?.cls || ''}`}>{TRANSLATION_META[k as TranslationState]?.label || k}: {n}</span>)}
                                {!Object.keys(counts).length && <span className="text-sm text-slate-500">Sin datos.</span>}
                            </div>
                        )}
                    </section>

                    {access.export && (
                        <section className="rounded-xl border border-slate-200 p-4">
                            <p className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-900"><FileDown size={15} /> Fichas PDF</p>
                            <div className="mt-2 flex flex-wrap gap-2">
                                {([['es', 'Español'], ['en', 'Inglés'], ['bilingual', 'Bilingüe']] as const).map(([k, l]) => (
                                    <label key={k} className={`cursor-pointer rounded-lg border px-3 py-1.5 text-xs font-semibold ${kind === k ? 'border-blue-300 bg-blue-50 text-blue-800' : 'border-slate-300 text-slate-600'}`}>
                                        <input type="radio" name="kind" className="sr-only" checked={kind === k} onChange={() => setKind(k)} /> {l}
                                    </label>
                                ))}
                                <button onClick={pdfs} disabled={!!running} className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-[#17458F] px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50">
                                    {running === 'pdf' ? <Loader2 size={13} className="animate-spin" /> : <FileDown size={13} />} Descargar ZIP
                                </button>
                            </div>
                            <p className="mt-2 text-[11px] text-slate-500">Las fichas en inglés sin traducción aprobada salen marcadas como borrador en cada página.</p>
                        </section>
                    )}

                    {access.translate && (
                        <section className="rounded-xl border border-slate-200 p-4">
                            <p className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-900"><Languages size={15} /> Traducir al inglés</p>
                            <p className="mt-1 text-xs text-slate-500">Traduce los campos pendientes (sin traducir, borradores de IA o desactualizados). Después cada traducción se revisa y aprueba en su expediente.</p>
                            <div className="mt-2 flex gap-2">
                                <button onClick={translate} disabled={!!running || !states} className="inline-flex items-center gap-1.5 rounded-lg bg-[#17458F] px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50">
                                    {running === 'translate' ? <Loader2 size={13} className="animate-spin" /> : <Languages size={13} />} Traducir pendientes
                                </button>
                                {running === 'translate' && <button onClick={() => { stop.current = true; }} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700"><Square size={12} /> Detener</button>}
                            </div>
                        </section>
                    )}

                    {running || progress.log.length ? (
                        <section aria-live="polite">
                            <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-[#17458F] transition-all" style={{ width: `${pct}%` }} /></div>
                            <p className="mt-1 text-xs text-slate-600">{progress.done} de {progress.total}</p>
                            <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs">
                                {progress.log.map((l, i) => <li key={i} className="flex items-center gap-1.5">{l.ok ? <CheckCircle2 size={12} className="text-emerald-600" /> : <XCircle size={12} className="text-red-600" />} <span className="font-mono">{l.ref}</span> · {l.msg}</li>)}
                            </ul>
                        </section>
                    ) : null}
                </div>
            </div>
        </div>
    );
};

export default ExpedientesLote;
