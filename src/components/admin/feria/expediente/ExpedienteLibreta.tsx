// ════════════════════════════════════════════════════════════════════════════
// Expediente → «Libreta» de presentación (v4.1324.0)
//
// Resumen editorial para presentadores y moderadores. «Preparar» COPIA lo que
// el club escribió (cada bloque dice de qué campo salió); nada se inventa. El
// mensaje breve se escribe a mano. Cada guardado es una versión; aprobarla es
// un paso aparte, y si alguien escribió cifras que el expediente no tiene, el
// servidor lo avisa antes.
// ════════════════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Download, Loader2, NotebookPen, Save, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import type { BookletBlock, BookletVersion, DossierCaps } from '../../../../lib/projectDossier';
import { DossierApiError, dossierRequest } from '../../../../lib/projectDossier';

const BLUE = '#17458F';
type Lang = 'es' | 'en';

interface Props {
    submissionId: string; eventId: string; access: DossierCaps;
    project: { publicRef: string; projectName: string; clubName: string; district: string; edition: string };
    /** Ruta del campo → «Formulario · Campo», para decir de dónde salió cada bloque. */
    fieldLabels?: Record<string, string>;
}

const ExpedienteLibreta = ({ submissionId, eventId, access, project, fieldLabels = {} }: Props) => {
    const [lang, setLang] = useState<Lang>('es');
    const [booklets, setBooklets] = useState<Record<Lang, { current: BookletVersion | null; versions: any[] }> | null>(null);
    const [blocks, setBlocks] = useState<BookletBlock[] | null>(null);
    const [dirty, setDirty] = useState(false);
    const [note, setNote] = useState<string | null>(null);
    const [busy, setBusy] = useState<string | null>(null);

    const load = useCallback(async () => {
        try {
            const d = await dossierRequest<any>(`/postulaciones/${submissionId}/libreta`, eventId);
            setBooklets(d.booklets);
        } catch (e: any) { toast.error(e?.message || 'No se pudo cargar la libreta'); }
    }, [submissionId, eventId]);
    useEffect(() => { load(); }, [load]);

    const current = booklets?.[lang]?.current || null;
    useEffect(() => { setBlocks(current ? current.content.blocks : null); setDirty(false); setNote(null); }, [current, lang]);

    const prepare = async () => {
        if (dirty && !window.confirm('Hay cambios sin guardar en la libreta. ¿Reemplazarlos por una propuesta nueva?')) return;
        setBusy('prepare');
        try {
            const d = await dossierRequest<any>(`/postulaciones/${submissionId}/libreta/preparar`, eventId, { method: 'POST', body: { lang } });
            setBlocks(d.proposal.blocks); setDirty(true);
            setNote(lang === 'en'
                ? (d.translationMode === 'approved' ? 'Propuesta armada con la traducción APROBADA.' : d.translationMode === 'draft' ? 'Propuesta armada con la traducción en BORRADOR: revísala antes de aprobar.' : 'El proyecto no está traducido: los bloques narrativos quedaron en español.')
                : 'Propuesta armada con lo que escribió el club. Edítala y guárdala.');
        } catch (e: any) { toast.error(e?.message); } finally { setBusy(null); }
    };

    const save = async () => {
        if (!blocks) return;
        setBusy('save');
        try {
            const d = await dossierRequest<any>(`/postulaciones/${submissionId}/libreta`, eventId, { method: 'PUT', body: { lang, content: { blocks } } });
            toast.success(`Libreta guardada (versión ${d.booklet.versionNumber}).`);
            if (d.audit?.length) toast.warning(`Atención: hay cifras que no aparecen en el expediente (${d.audit.map((a: any) => a.numbers.join(', ')).join('; ')}).`);
            await load();
        } catch (e: any) { toast.error(e?.message); } finally { setBusy(null); }
    };

    const approve = async (acknowledge = false) => {
        setBusy('approve');
        try {
            await dossierRequest<any>(`/postulaciones/${submissionId}/libreta/aprobar`, eventId, { method: 'POST', body: { lang, acknowledge } });
            toast.success('Libreta aprobada.');
            await load();
        } catch (e: any) {
            if (e instanceof DossierApiError && e.body?.needsAcknowledge) {
                const list = (e.body.audit || []).map((a: any) => `${a.label}: ${a.numbers.join(', ')}`).join('\n');
                if (window.confirm(`${e.message}\n\n${list}\n\n¿Las confirmaste? Aprobar de todos modos.`)) { setBusy(null); return approve(true); }
            } else toast.error(e?.message);
        } finally { setBusy(null); }
    };

    const download = async (which: 'one' | 'bilingual') => {
        const list = which === 'bilingual'
            ? (['es', 'en'] as Lang[]).map(l => booklets?.[l]?.current).filter(Boolean) as BookletVersion[]
            : current ? [current] : [];
        if (!list.length) { toast.error('Guarda la libreta antes de descargarla.'); return; }
        setBusy(`pdf-${which}`);
        try {
            const { buildBookletPdf } = await import('../../../../lib/projectDossierPdf');
            const doc = await buildBookletPdf(project, list.map(v => ({ lang: v.lang, blocks: v.content.blocks, status: v.status, versionNumber: v.versionNumber })));
            doc.save(`${project.publicRef}-libreta-${which === 'bilingual' ? 'bilingue' : list[0].lang}.pdf`);
        } catch (e: any) { toast.error(e?.message || 'No se pudo generar el PDF'); } finally { setBusy(null); }
    };

    if (!booklets) return <div className="flex items-center justify-center py-16 text-slate-500"><Loader2 size={18} className="mr-2 animate-spin" /> Cargando libreta…</div>;
    const audit = current?.content.audit || [];

    return (
        <div className="space-y-4">
            <section className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-center gap-2">
                    <p className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-900"><NotebookPen size={15} style={{ color: BLUE }} /> Libreta de presentación</p>
                    <div className="ml-auto flex rounded-lg border border-slate-300 p-0.5 text-xs font-semibold">
                        {(['es', 'en'] as Lang[]).map(l => (
                            <button key={l} onClick={() => { if (dirty && !window.confirm('Hay cambios sin guardar. ¿Cambiar de idioma y descartarlos?')) return; setLang(l); }}
                                className={`rounded-md px-3 py-1 ${lang === l ? 'text-white' : 'text-slate-600'}`} style={lang === l ? { background: BLUE } : undefined}>
                                {l === 'es' ? 'Español' : 'English'}
                            </button>
                        ))}
                    </div>
                </div>
                <p className="mt-1 text-xs text-slate-500">Para presentadores, moderadores y visitantes internacionales. Se arma con los datos del expediente; no se inventan resultados, testimonios ni cifras. Debe aprobarse antes de usarse públicamente.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                    {access.translate && <button onClick={prepare} disabled={!!busy} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700">{busy === 'prepare' ? <Loader2 size={13} className="animate-spin" /> : <Wand2 size={13} />} {current ? 'Volver a preparar desde el expediente' : 'Preparar libreta'}</button>}
                    {access.translate && blocks && <button onClick={save} disabled={!!busy || !dirty} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold text-white disabled:opacity-50" style={{ background: BLUE }}>{busy === 'save' ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Guardar versión</button>}
                    {access.approveTranslation && current && current.status === 'draft' && !dirty && <button onClick={() => approve()} disabled={!!busy} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white"><CheckCircle2 size={13} /> Aprobar libreta</button>}
                    {access.export && current && <button onClick={() => download('one')} disabled={!!busy} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700"><Download size={13} /> PDF ({lang === 'es' ? 'español' : 'inglés'})</button>}
                    {access.export && booklets.es.current && booklets.en.current && <button onClick={() => download('bilingual')} disabled={!!busy} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700"><Download size={13} /> PDF bilingüe</button>}
                </div>
                {current && (
                    <p className="mt-2 text-[11px] text-slate-500">Versión {current.versionNumber} · {current.status === 'approved' ? `Aprobada por ${current.approvedBy}` : 'Borrador'} · guardada por {current.createdBy} el {new Date(current.createdAt).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' })}{booklets[lang].versions.length > 1 ? ` · ${booklets[lang].versions.length} versiones` : ''}</p>
                )}
                {note && <p className="mt-2 rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-800">{note}</p>}
                {audit.length > 0 && !dirty && <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">Cifras que no aparecen en el expediente: {audit.map(a => `${a.label} (${a.numbers.join(', ')})`).join(' · ')}.</p>}
            </section>

            {!blocks && <p className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">Todavía no hay libreta en {lang === 'es' ? 'español' : 'inglés'}. {access.translate ? 'Usa «Preparar libreta» para armarla con los datos del expediente.' : ''}</p>}
            {blocks?.map((b, i) => (
                <div key={b.key} className="rounded-xl border border-slate-200 bg-white p-4">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                        <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: BLUE }}>{b.label}</p>
                        {b.source && <span className="text-[11px] text-slate-400" title={b.source}>· de «{fieldLabels[b.source] || b.source}»</span>}
                        {b.manual && <span className="text-[11px] text-slate-400">· se escribe a mano</span>}
                        {b.untranslated && <span className="rounded bg-amber-100 px-1.5 text-[10px] font-semibold text-amber-800">sin traducir</span>}
                    </div>
                    {access.translate ? (
                        <textarea value={b.text} rows={b.key === 'message' ? 3 : Math.min(8, Math.max(2, Math.ceil(b.text.length / 80)))} aria-label={b.label}
                            onChange={e => { const v = e.target.value; setBlocks(list => (list || []).map((x, j) => (j === i ? { ...x, text: v } : x))); setDirty(true); }}
                            className="w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm leading-relaxed" />
                    ) : <p className="whitespace-pre-line text-sm text-slate-800">{b.text || '—'}</p>}
                </div>
            ))}
        </div>
    );
};

export default ExpedienteLibreta;
