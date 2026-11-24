// ════════════════════════════════════════════════════════════════════════════
// Columna «Traducción EN» de Proyectos postulados (v4.1356.0)
//
// El estado del seguimiento (gris, azul, naranja, verde, rojo) y DOS barras
// independientes: cuánto está traducido y cuánto revisó una persona. Una
// traducción de la IA nunca cuenta como revisada. Abajo, el Cadre asignado.
// La celda es un botón: abre la pestaña «Traducción» del expediente.
// ════════════════════════════════════════════════════════════════════════════
import { AlertTriangle, UserRound } from 'lucide-react';
import { TRACKING_META, type TranslationTracking } from '../../../../lib/translationTracking';

const Bar = ({ label, pct, cls }: { label: string; pct: number | null; cls: string }) => (
    <div className="flex items-center gap-1.5">
        <span className="w-[58px] shrink-0 text-[10px] text-slate-500">{label}</span>
        <span className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-200" aria-hidden="true">
            <span className={`block h-full rounded-full ${cls}`} style={{ width: `${pct ?? 0}%` }} />
        </span>
        <span className="w-8 text-right text-[10px] font-semibold tabular-nums text-slate-600">{pct === null ? '—' : `${pct} %`}</span>
    </div>
);

export const TranslationSummaryInline = ({ t }: { t: TranslationTracking }) => {
    const meta = TRACKING_META[t.state];
    return (
        <>
            <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${meta.cls}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} aria-hidden="true" /> {meta.label}
            </span>
            {t.state !== 'no_content' && (
                <span className="mt-1.5 block space-y-0.5">
                    <Bar label="Traducción" pct={t.translatedPct} cls="bg-sky-500" />
                    <Bar label="Revisión" pct={t.reviewedPct} cls={t.state === 'verified' ? 'bg-emerald-600' : 'bg-blue-600'} />
                </span>
            )}
            {(t.outdated > 0 || t.warnings > 0 || t.legacyApproved) && (
                <span className="mt-1 flex flex-wrap gap-x-2 text-[10px] font-semibold">
                    {t.outdated > 0 && <span className="text-red-700">{t.outdated} desactualizado{t.outdated === 1 ? '' : 's'}</span>}
                    {t.warnings > 0 && <span className="inline-flex items-center gap-0.5 text-amber-700"><AlertTriangle size={10} aria-hidden="true" />{t.warnings} con avisos</span>}
                    {t.legacyApproved && <span className="text-slate-500">Aprobada antes: falta verificar</span>}
                </span>
            )}
        </>
    );
};

interface Props { t: TranslationTracking | null | undefined; project: string; onOpen: () => void }

const TranslationCell = ({ t, project, onOpen }: Props) => {
    if (!t) return <td className="px-3 py-3 text-xs text-slate-400">—</td>;
    return (
        <td className="px-3 py-3 align-middle">
            <button type="button" onClick={onOpen}
                aria-label={`Traducción al inglés de ${project}: ${t.label}${t.translatedPct !== null ? `, traducción ${t.translatedPct} %, revisión ${t.reviewedPct} %` : ''}. Abrir la traducción`}
                className="block w-full rounded-lg p-1 text-left hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#17458F]">
                <TranslationSummaryInline t={t} />
                {t.assignee ? (
                    <span className="mt-1 flex max-w-[180px] items-center gap-1 truncate text-[10px] text-slate-500" title={t.assignee.email}>
                        <UserRound size={10} aria-hidden="true" /> {t.assignee.name || t.assignee.email}
                    </span>
                ) : t.state !== 'no_content' && t.state !== 'verified' ? (
                    <span className="mt-1 block text-[10px] italic text-slate-400">Sin Cadre asignado</span>
                ) : null}
            </button>
        </td>
    );
};

export default TranslationCell;
