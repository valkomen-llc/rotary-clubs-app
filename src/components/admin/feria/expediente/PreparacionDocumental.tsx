// v4.1324 — «Estado de preparación documental» (Resumen del expediente):
// original, formularios, traducción inglesa, fichas y libreta, con un acceso
// directo a cada pestaña. Es la vista de trabajo editorial que pidió el equipo
// de la gobernadora para saber qué proyectos están listos.
import type { ReactNode } from 'react';
import { ArrowRight, FileCheck2 } from 'lucide-react';
import type { DossierPayload } from '../../../../lib/projectDossier';
import { TRANSLATION_META } from '../../../../lib/projectDossier';

type Pane = 'formulario' | 'traduccion' | 'fichas' | 'libreta';

const Chip = ({ cls, children }: { cls: string; children: ReactNode }) => <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ${cls}`}>{children}</span>;

const PreparacionDocumental = ({ data, onGo }: { data: DossierPayload; onGo: (p: Pane) => void }) => {
    const t = data.translation.en;
    const tm = TRANSLATION_META[t.state];
    const bEs = data.booklets.find(b => b.lang === 'es');
    const bEn = data.booklets.find(b => b.lang === 'en');
    const bookletChip = (b?: { status: string }) => (b ? (b.status === 'approved' ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-amber-50 text-amber-800 ring-amber-200') : 'bg-slate-100 text-slate-600 ring-slate-200');
    const rows: { label: string; chip: ReactNode; pane: Pane }[] = [
        {
            label: 'Proyecto postulado', pane: 'formulario',
            chip: <Chip cls="bg-slate-100 text-slate-700 ring-slate-200">Original disponible · {data.forms.map(f => `${f.key === 'master' ? 'Formulación' : 'FDD'} ${f.started ? `${f.completionPct}%` : 'sin iniciar'}`).join(' · ')}</Chip>,
        },
        { label: 'Traducción inglesa', pane: 'traduccion', chip: <Chip cls={tm.cls}>{tm.label}{t.total ? ` · ${t.counts.reviewed}/${t.total} revisados` : ''}</Chip> },
        {
            label: 'Ficha PDF', pane: 'fichas',
            chip: <Chip cls={t.approvedVersionId ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-slate-100 text-slate-600 ring-slate-200'}>{t.approvedVersionId ? 'Español, inglés y bilingüe listas' : 'Español lista · inglés por aprobar'}</Chip>,
        },
        {
            label: 'Libreta de presentación', pane: 'libreta',
            chip: <span className="flex flex-wrap gap-1"><Chip cls={bookletChip(bEs)}>ES: {bEs ? (bEs.status === 'approved' ? 'aprobada' : 'borrador') : 'por preparar'}</Chip><Chip cls={bookletChip(bEn)}>EN: {bEn ? (bEn.status === 'approved' ? 'aprobada' : 'borrador') : 'por preparar'}</Chip></span>,
        },
    ];
    return (
        <section className="rounded-xl border border-slate-200 bg-white p-4">
            <h4 className="mb-2 inline-flex items-center gap-1.5 text-sm font-bold text-slate-900"><FileCheck2 size={15} className="text-[#17458F]" /> Estado de preparación documental</h4>
            <ul className="divide-y divide-slate-100">
                {rows.map(r => (
                    <li key={r.label} className="flex flex-wrap items-center gap-2 py-2">
                        <span className="w-44 text-sm text-slate-700">{r.label}</span>
                        <span className="min-w-0 flex-1">{r.chip}</span>
                        <button onClick={() => onGo(r.pane)} className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:underline">Abrir <ArrowRight size={12} /></button>
                    </li>
                ))}
            </ul>
            <p className="mt-2 text-[11px] text-slate-400">Independiente del estado de la postulación y del pago: traducir o preparar documentos no cambia ninguno de los dos.</p>
        </section>
    );
};

export default PreparacionDocumental;
