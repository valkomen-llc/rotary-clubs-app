// ════════════════════════════════════════════════════════════════════
// Celdas del grupo «Seguimiento documental» de Proyectos postulados (v4.1332)
//
// Cada celda dice el porcentaje Y el estado en TEXTO (no sólo color), es un
// botón que abre el detalle del proyecto y su barra es una `progressbar` con
// nombre accesible. Nada se calcula aquí: todo viene del servidor.
// ════════════════════════════════════════════════════════════════════
import React from 'react';
import { CheckCircle2, AlertTriangle, Clock, CircleDashed, Ban, Eye } from 'lucide-react';
import { TONE_CLS, barColor, docStatusTone, validationTone, type DocumentsCompact, type DocRequirementCompact } from '../../../../lib/documentTracking';

export const Bar = ({ pct, label }: { pct: number; label: string }) => (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}
        className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
        <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: barColor(pct) }} />
    </div>
);

export const Pill = ({ tone = 'slate', children, title }: { tone?: string; children: React.ReactNode; title?: string }) => (
    <span title={title} className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${TONE_CLS[tone] || TONE_CLS.slate}`}>{children}</span>
);

const ReviewMark = ({ r }: { r: DocRequirementCompact }) => {
    if (r.review === 'validated') return <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-emerald-700"><CheckCircle2 size={10} aria-hidden /> Validado</span>;
    if (r.review === 'changes_requested') return <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-orange-700"><AlertTriangle size={10} aria-hidden /> Corrección</span>;
    if (r.review === 'in_review') return <span className="text-[10px] font-semibold text-indigo-700">En revisión</span>;
    if (r.reviewStale) return <span className="text-[10px] font-semibold text-slate-500" title="El club cambió el contenido después de la última revisión">Cambió tras revisar</span>;
    return null;
};

const cellBtn = 'group block w-full rounded-lg px-1.5 py-1 text-left hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500';

/** Formulación / FDD: porcentaje + barra + estado. */
export const FormCell = ({ r, project, onOpen }: { r?: DocRequirementCompact; project: string; onOpen: () => void }) => {
    if (!r) return <td className="px-2 py-3 text-xs text-slate-400">—</td>;
    if (!r.applies) {
        return (
            <td className="px-2 py-3">
                <button type="button" onClick={onOpen} className={cellBtn} aria-label={`${r.short} de ${project}: no aplica. Abrir detalle`}>
                    <Pill tone="slate"><Ban size={10} aria-hidden /> No aplica</Pill>
                </button>
            </td>
        );
    }
    return (
        <td className="min-w-[112px] px-2 py-3">
            <button type="button" onClick={onOpen} className={cellBtn} aria-label={`${r.short} de ${project}: ${r.pct} %, ${r.status.label}. Abrir detalle`}>
                <span className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-bold tabular-nums text-slate-800">{r.pct} %</span>
                    {r.mode === 'optional' && <span className="text-[9px] font-semibold uppercase text-slate-400">opcional</span>}
                </span>
                <Bar pct={r.pct} label={`${r.short}: ${r.pct} %`} />
                <span className="mt-1 flex flex-wrap items-center gap-1">
                    <span className="text-[11px] text-slate-500">{r.status.label}{r.submitted ? ' · enviado' : ''}</span>
                    <ReviewMark r={r} />
                </span>
            </button>
        </td>
    );
};

const FILE_ICON: Record<string, React.ReactNode> = {
    pending: <Clock size={10} aria-hidden />, uploaded: <CircleDashed size={10} aria-hidden />, in_review: <Eye size={10} aria-hidden />,
    validated: <CheckCircle2 size={10} aria-hidden />, changes_requested: <AlertTriangle size={10} aria-hidden />,
    rejected: <AlertTriangle size={10} aria-hidden />, not_applicable: <Ban size={10} aria-hidden />,
};

/** Presentación / Video: estado de entrega (cargado ≠ validado). */
export const FileCell = ({ r, project, onOpen }: { r?: DocRequirementCompact; project: string; onOpen: () => void }) => {
    if (!r) return <td className="px-2 py-3 text-xs text-slate-400">—</td>;
    return (
        <td className="px-2 py-3">
            <button type="button" onClick={onOpen} className={cellBtn} aria-label={`${r.short} de ${project}: ${r.status.label}. Abrir detalle`}>
                <Pill tone={r.status.tone || 'slate'}>{FILE_ICON[r.status.key]}{r.status.label}</Pill>
                {r.mode === 'optional' && r.applies && <span className="mt-0.5 block text-[9px] font-semibold uppercase text-slate-400">opcional</span>}
                {r.reviewStale && <span className="mt-0.5 block text-[10px] text-slate-500">Nueva versión</span>}
            </button>
        </td>
    );
};

/** Video Pitch Profesional: servicio aparte (no suma al avance). */
export const PitchCell = ({ d }: { d: DocumentsCompact }) => (
    <td className="px-2 py-3">
        <Pill tone={d.pitch.tone} title="Servicio de producción profesional. No es un requisito ni suma al avance documental; su pago no es el de la inscripción.">{d.pitch.label}</Pill>
        {d.pitch.number && <span className="mt-0.5 block font-mono text-[10px] text-slate-400">{d.pitch.number}</span>}
    </td>
);

/** Avance documental global + semáforo + validación. */
export const OverallCell = ({ d, project, onOpen }: { d: DocumentsCompact; project: string; onOpen: () => void }) => (
    <td className="min-w-[150px] px-2 py-3">
        <button type="button" onClick={onOpen} className={cellBtn}
            aria-label={`Avance documental de ${project}: ${d.overallPct} %, ${d.docStatus.label}. Validación: ${d.validation.label}. ${d.risk.label}. Abrir detalle`}>
            <span className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-extrabold tabular-nums text-slate-900">{d.overallPct} %</span>
                <Pill tone={d.risk.tone}>{d.risk.label}</Pill>
            </span>
            <Bar pct={d.overallPct} label={`Avance documental: ${d.overallPct} %`} />
            <span className="mt-1 flex flex-wrap items-center gap-1">
                <Pill tone={docStatusTone(d.docStatus.key)}>{d.docStatus.label}</Pill>
                <Pill tone={validationTone(d.validation.key)}>{d.validation.label}</Pill>
            </span>
            {d.reminderCount > 0 && <span className="mt-0.5 block text-[10px] text-slate-500">{d.reminderCount} recordatorio{d.reminderCount === 1 ? '' : 's'} · último {new Date(d.lastReminderAt as string).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })}</span>}
        </button>
    </td>
);

/** Resumen compacto para la vista de tarjetas del móvil. */
export const MobileDocSummary = ({ d, onOpen, project }: { d: DocumentsCompact; onOpen: () => void; project: string }) => (
    <button type="button" onClick={onOpen} className="mt-3 block w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-left" aria-label={`Abrir seguimiento documental de ${project}`}>
        <span className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-600">Avance documental</span>
            <span className="text-sm font-extrabold tabular-nums text-slate-900">{d.overallPct} %</span>
        </span>
        <Bar pct={d.overallPct} label={`Avance documental: ${d.overallPct} %`} />
        <span className="mt-2 flex flex-wrap gap-1">
            {d.requirements.filter(r => r.applies).map(r => (
                <Pill key={r.key} tone={r.complete ? 'emerald' : r.kind === 'form' ? (r.pct > 0 ? 'amber' : 'slate') : (r.status.tone || 'slate')}>
                    {r.short}: {r.kind === 'form' ? `${r.pct} %` : r.status.label}
                </Pill>
            ))}
            <Pill tone={d.risk.tone}>{d.risk.label}</Pill>
        </span>
    </button>
);
