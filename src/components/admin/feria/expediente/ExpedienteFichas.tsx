// ════════════════════════════════════════════════════════════════════════════
// Expediente → «Fichas PDF» (v4.1324.0)
//
// Tres fichas: español, inglés y bilingüe. Se ven ANTES de descargar (vista
// previa en la misma pantalla). La inglesa usa la traducción APROBADA; si no
// la hay, se puede sacar el borrador y el PDF lo dice en cada página.
// ════════════════════════════════════════════════════════════════════════════
import { useEffect, useState } from 'react';
import { Download, Eye, FileText, Loader2, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import type { DocumentPayload, TranslationStatus } from '../../../../lib/projectDossier';
import { dossierRequest, TRANSLATION_META } from '../../../../lib/projectDossier';

const BLUE = '#17458F';
type Kind = 'es' | 'en' | 'bilingual';

const KINDS: { key: Kind; title: string; sub: string }[] = [
    { key: 'es', title: 'Ficha en español', sub: 'Ficha completa del proyecto con los datos del formulario.' },
    { key: 'en', title: 'Project Profile — English', sub: 'Con la traducción aprobada. Sin aprobación sale marcada como borrador.' },
    { key: 'bilingual', title: 'Ficha bilingüe ES / EN', sub: 'Portada común, versión completa en español y después en inglés.' },
];

/** Pide los datos de la ficha y dibuja el PDF. Exportado para el menú de la tabla. */
export const makeDossierPdf = async (submissionId: string, eventId: string, kind: Kind, opts: { includeContact?: boolean; useDraft?: boolean } = {}) => {
    const qs = new URLSearchParams({ lang: kind });
    if (opts.includeContact) qs.set('contact', '1');
    if (opts.useDraft) qs.set('use', 'current');
    const payload = await dossierRequest<DocumentPayload>(`/postulaciones/${submissionId}/expediente/documento?${qs}`, eventId);
    const { buildDossierPdf, pdfFileName } = await import('../../../../lib/projectDossierPdf');
    const doc = await buildDossierPdf(payload);
    return { doc, payload, fileName: pdfFileName(payload) };
};

const ExpedienteFichas = ({ submissionId, eventId, canExport, translation, initialKind }: {
    submissionId: string; eventId: string; canExport: boolean; translation: TranslationStatus; initialKind?: Kind | null;
}) => {
    const [kind, setKind] = useState<Kind>(initialKind || 'es');
    const [includeContact, setIncludeContact] = useState(false);
    const [useDraft, setUseDraft] = useState(false);
    const [busy, setBusy] = useState<string | null>(null);
    const [preview, setPreview] = useState<{ url: string; name: string; doc: any; mode?: string } | null>(null);

    useEffect(() => () => { if (preview?.url) URL.revokeObjectURL(preview.url); }, [preview]);

    const build = async (action: 'preview' | 'download', k: Kind = kind) => {
        setBusy(`${action}-${k}`);
        try {
            const { doc, payload, fileName } = await makeDossierPdf(submissionId, eventId, k, { includeContact, useDraft });
            if (action === 'download') { doc.save(fileName); toast.success('Ficha descargada. La descarga queda registrada.'); }
            else {
                const url = URL.createObjectURL(doc.output('blob'));
                setPreview(p => { if (p?.url) URL.revokeObjectURL(p.url); return { url, name: fileName, doc, mode: payload.translation?.mode }; });
                setKind(k);
            }
        } catch (e: any) { toast.error(e?.message || 'No se pudo generar la ficha'); } finally { setBusy(null); }
    };

    if (!canExport) {
        return <p className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">Tu perfil puede leer el expediente pero no descargar fichas. Pide el permiso de exportación al administrador del módulo.</p>;
    }
    const tMeta = TRANSLATION_META[translation.state];
    const approvedExists = !!translation.approvedVersionId;

    return (
        <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
                {KINDS.map(k => (
                    <div key={k.key} className={`flex flex-col rounded-xl border bg-white p-4 ${kind === k.key ? 'border-blue-300 ring-2 ring-blue-100' : 'border-slate-200'}`}>
                        <p className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-900"><FileText size={15} style={{ color: BLUE }} /> {k.title}</p>
                        <p className="mt-1 flex-1 text-xs text-slate-500">{k.sub}</p>
                        {k.key !== 'es' && (
                            <p className="mt-2 text-[11px]"><span className={`rounded-full px-2 py-0.5 font-semibold ring-1 ${tMeta.cls}`}>Traducción: {tMeta.label}</span></p>
                        )}
                        <div className="mt-3 flex gap-2">
                            <button onClick={() => build('preview', k.key)} disabled={!!busy} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-300 px-2 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50">
                                {busy === `preview-${k.key}` ? <Loader2 size={13} className="animate-spin" /> : <Eye size={13} />} Vista previa
                            </button>
                            <button onClick={() => build('download', k.key)} disabled={!!busy} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-bold text-white disabled:opacity-50" style={{ background: BLUE }}>
                                {busy === `download-${k.key}` ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} Descargar
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            <div className="flex flex-wrap gap-x-5 gap-y-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600">
                <label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={includeContact} onChange={e => setIncludeContact(e.target.checked)} /> Incluir correo y WhatsApp del responsable</label>
                {approvedExists && <label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={useDraft} onChange={e => setUseDraft(e.target.checked)} /> Usar la traducción vigente (borrador) en vez de la última aprobada</label>}
                <span className="text-slate-400">Las fichas nunca incluyen el documento de identidad ni datos de pago.</span>
            </div>

            {!approvedExists && translation.state !== 'not_started' && (
                <p className="flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-3 text-xs text-amber-900"><ShieldAlert size={14} className="mt-0.5 shrink-0" /> La traducción todavía no está aprobada: las fichas en inglés y bilingüe saldrán marcadas «BORRADOR · DRAFT — NOT APPROVED» en cada página.</p>
            )}
            {translation.state === 'not_started' && (
                <p className="flex items-start gap-2 rounded-xl bg-slate-100 px-4 py-3 text-xs text-slate-700"><ShieldAlert size={14} className="mt-0.5 shrink-0" /> Este proyecto no está traducido: en la ficha inglesa los textos narrativos dirán «Translation pending».</p>
            )}

            {preview && (
                <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                    <header className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-2.5">
                        <p className="text-sm font-semibold text-slate-800">Vista previa · {preview.name}</p>
                        <button onClick={() => { preview.doc.save(preview.name); toast.success('Ficha descargada.'); }} className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold text-white" style={{ background: BLUE }}><Download size={13} /> Descargar esta ficha</button>
                    </header>
                    <iframe title="Vista previa de la ficha" src={preview.url} className="h-[70vh] w-full bg-slate-100" />
                </section>
            )}
        </div>
    );
};

export default ExpedienteFichas;
