// ════════════════════════════════════════════════════════════════════
// «Mi Proyecto» — Avance documental del proyecto (v4.1332)
//
// El club ve EXACTAMENTE la misma cifra que ve el comité en «Proyectos
// postulados»: la calcula el servidor con el mismo motor
// (`GET /portal/document-status`). Muestra qué falta, la fecha límite y las
// correcciones que pidió el comité, con su texto.
// ════════════════════════════════════════════════════════════════════
import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, CircleDashed, ClipboardCheck, Clock } from 'lucide-react';
import { BLUE } from './FormFields';
import { leerJson } from '../../lib/leerJson';

const API = (import.meta as any).env?.VITE_API_URL || '/api';

export interface ClubDocRequirement {
    key: string; kind: 'form' | 'file'; label: string; short: string; applies: boolean; counts: boolean;
    pct: number; complete: boolean; status: { key: string; label: string; tone?: string }; deadline: string | null;
    correction: string | null; validated: boolean;
    sections?: { title: string; pct: number; complete: boolean }[]; missingCount?: number; invalidCount?: number;
}
export interface ClubDocStatus {
    overallPct: number; docStatus: { key: string; label: string }; complete: boolean;
    risk: { key: string; label: string; tone: string; daysLeft: number | null };
    deadline: string | null;
    pending: { key: string; label: string; detail: string }[];
    requirements: ClubDocRequirement[];
}

const fmtDay = (d?: string | null) => (d ? new Date(`${d}T12:00:00-05:00`).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Bogota' }) : '');
const RISK_CLS: Record<string, string> = {
    red: 'bg-red-50 text-red-800 ring-red-200', amber: 'bg-amber-50 text-amber-800 ring-amber-200', sky: 'bg-sky-50 text-sky-800 ring-sky-200',
    emerald: 'bg-emerald-50 text-emerald-800 ring-emerald-200', slate: 'bg-slate-100 text-slate-700 ring-slate-200',
};

const DocumentProgressPanel = ({ token, refreshKey = 0, onLoaded }: { token: string; refreshKey?: number; onLoaded?: (s: ClubDocStatus | null) => void }) => {
    const [data, setData] = useState<ClubDocStatus | null>(null);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        let vivo = true;
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 20_000);
        fetch(`${API}/project-fair/portal/document-status`, { headers: { Authorization: `Bearer ${token}` }, signal: ctrl.signal })
            .then(async res => {
                const { data: body } = await leerJson<any>(res);
                if (!vivo) return;
                if (!res.ok || !body?.tracking) { setFailed(true); onLoaded?.(null); return; }
                if (body.enabled === false) { setData(null); onLoaded?.(null); return; }
                setData(body.tracking); setFailed(false); onLoaded?.(body.tracking);
            })
            .catch(() => { if (vivo) { setFailed(true); onLoaded?.(null); } })
            .finally(() => clearTimeout(timer));
        return () => { vivo = false; ctrl.abort(); clearTimeout(timer); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token, refreshKey]);

    // Información de apoyo: si no carga, «Mi Proyecto» sigue igual.
    if (!data) return failed ? null : null;
    const corrections = data.requirements.filter(r => r.applies && r.correction);
    return (
        <section aria-labelledby="avance-documental" className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: `${BLUE}12`, color: BLUE }}><ClipboardCheck size={19} /></span>
                <div className="min-w-0 flex-1">
                    <h2 id="avance-documental" className="text-lg font-bold text-slate-900">Avance documental del proyecto</h2>
                    <p className="text-[13px] text-slate-500">
                        Formularios diligenciados y documentos entregados que tu proyecto necesita.
                        {data.deadline && <> Fecha límite para completarlos: <strong className="text-slate-700">{fmtDay(data.deadline)}</strong>.</>}
                    </p>
                </div>
                <div className="text-right">
                    <p className="text-3xl font-extrabold tabular-nums" style={{ color: data.complete ? '#059669' : BLUE }}>{data.overallPct} %</p>
                    <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${RISK_CLS[data.risk.tone] || RISK_CLS.slate}`}>{data.complete ? 'Documentación completa' : data.risk.label}</span>
                </div>
            </div>
            <div role="progressbar" aria-label={`Avance documental: ${data.overallPct} %`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={data.overallPct}
                className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-200">
                <div className="h-full rounded-full" style={{ width: `${data.overallPct}%`, background: data.complete ? '#10B981' : BLUE }} />
            </div>

            <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                {data.requirements.filter(r => r.applies).map(r => (
                    <li key={r.key} className="flex items-start gap-2 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                        {r.complete ? <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-600" aria-hidden />
                            : r.correction ? <AlertTriangle size={16} className="mt-0.5 shrink-0 text-orange-600" aria-hidden />
                                : r.kind === 'form' && r.pct > 0 ? <CircleDashed size={16} className="mt-0.5 shrink-0 text-amber-600" aria-hidden />
                                    : <Clock size={16} className="mt-0.5 shrink-0 text-slate-400" aria-hidden />}
                        <span className="min-w-0 text-[13px]">
                            <span className="font-semibold text-slate-800">{r.label}</span>
                            {!r.counts && <span className="ml-1 text-[11px] text-slate-400">(opcional)</span>}
                            <span className="block text-slate-500">
                                {r.kind === 'form' ? `${r.pct} % · ${r.status.label}` : r.status.label}
                                {r.validated && ' · validado por el comité'}
                                {r.kind === 'form' && !r.complete && (r.missingCount || r.invalidCount)
                                    ? ` · ${r.missingCount ? `${r.missingCount} campo${r.missingCount === 1 ? '' : 's'} obligatorio${r.missingCount === 1 ? '' : 's'} por responder` : ''}${r.invalidCount ? `${r.missingCount ? ', ' : ''}${r.invalidCount} con formato por corregir` : ''}`
                                    : ''}
                            </span>
                            {r.kind === 'form' && !r.complete && (r.sections || []).some(s => !s.complete) && (
                                <span className="block text-[11px] text-slate-400">Por completar: {(r.sections || []).filter(s => !s.complete).map(s => s.title).slice(0, 4).join(' · ')}</span>
                            )}
                        </span>
                    </li>
                ))}
            </ul>

            {corrections.length > 0 && (
                <div className="mt-4 space-y-2">
                    {corrections.map(r => (
                        <div key={r.key} className="rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-[13px] text-orange-900">
                            <strong>El comité pidió una corrección en «{r.label}»:</strong> <span className="whitespace-pre-line">{r.correction}</span>
                        </div>
                    ))}
                </div>
            )}
        </section>
    );
};

export default DocumentProgressPanel;
