// Workflows — los del catálogo y los del constructor, sus ejecuciones,
// informes (con la opinión de quien revisa cada hallazgo) y programaciones.
// Reemplaza el botón muerto «Programación».
import { useCallback, useEffect, useState } from 'react';
import { Play, X } from 'lucide-react';
import { acApi } from './agentCenterApi';
import type { Meta, WorkflowDef } from './agentCenterApi';
import { EmptyNote, ErrorNote, SectionHeader, fmtDate } from './agentCenterUi';
import SitePicker from './SitePicker';

interface RunRow { id: string; workflowKey: string; siteName: string | null; trigger: string; status: string; aiNote: string | null; error: string | null; startedAt: string; findings: number | null; customName?: string | null; feedbackCount?: number }
interface RunFull extends RunRow { report: any; aiSummary: string | null; input: any }
interface Schedule { id: string; workflowKey: string; siteName: string | null; cadence: string; cadenceLabel: string; enabled: boolean; nextRunAt: string | null; lastRunAt: string | null; customName?: string | null }
interface Finding { ref: string; label: string; severity: string | null }
interface FeedbackRow { findingRef: string; verdict: string; note: string | null }

/** El nombre de un workflow: del catálogo o del constructor. */
const wfLabel = (meta: Meta, key: string, customName?: string | null) => meta.workflows[key]?.label || (key.startsWith('custom:') ? `${customName || 'Workflow del constructor'} (constructor)` : key);
const SEV_LABEL: Record<string, string> = { high: 'Alta', medium: 'Media', low: 'Baja' };
const VERDICT_STYLE: Record<string, string> = { useful: 'bg-emerald-600 text-white border-emerald-600', not_useful: 'bg-gray-600 text-white border-gray-600', false_positive: 'bg-red-600 text-white border-red-600' };

const LABELS: Record<string, string> = { missing_receipt: 'Sin comprobante', possible_duplicate: 'Posible duplicado', payment_state_mismatch: 'Pago y estado no cuadran', stale_pending: 'Pendiente hace días', incomplete_data: 'Datos incompletos' };

function ReportView({ run }: { run: RunFull }) {
    const r = run.report || {};
    if (r.kind === 'event_registration_review') return (
        <div className="space-y-3">
            {(r.events || []).map((e: any) => (
                <div key={e.eventId} className="bg-white rounded-2xl border border-gray-100 p-4">
                    <p className="font-bold text-gray-800">{e.title || e.eventId} <span className="text-xs font-normal text-gray-500">· {e.total} inscripciones ({e.active} activas)</span></p>
                    <div className="flex flex-wrap gap-2 my-2">{Object.entries(e.counts || {}).map(([k, v]) => <span key={k} className="text-xs bg-amber-50 text-amber-800 px-2 py-0.5 rounded-lg">{LABELS[k] || k}: <b>{String(v)}</b></span>)}</div>
                    {(e.findings || []).length === 0 ? <p className="text-sm text-emerald-700">Sin hallazgos.</p> : (
                        <table className="w-full text-xs"><tbody>{e.findings.map((f: any, i: number) => (
                            <tr key={i} className="border-b border-gray-50 align-top"><td className="py-1 pr-2 font-bold whitespace-nowrap">{LABELS[f.kind] || f.kind}</td><td className="py-1 pr-2 text-gray-500 whitespace-nowrap">{f.code || f.registrationId}</td><td className="py-1 text-gray-700">{f.evidence}</td></tr>
                        ))}</tbody></table>
                    )}
                </div>
            ))}
        </div>
    );
    if (r.kind === 'fair_submission_review') return (
        <div className="bg-white rounded-2xl border border-gray-100 p-4 overflow-x-auto">
            <p className="text-sm text-gray-600 mb-2">{r.complete} completas · {r.withMissing} con faltantes · {r.withIssues} con observaciones</p>
            <table className="w-full text-xs"><thead><tr className="text-left text-gray-400"><th className="py-1 pr-2">Ref.</th><th className="py-1 pr-2">Proyecto</th><th className="py-1 pr-2">Falta</th><th className="py-1">Observaciones</th></tr></thead>
                <tbody>{(r.submissions || []).map((s: any) => (
                    <tr key={s.submissionId} className="border-t border-gray-50 align-top"><td className="py-1 pr-2 whitespace-nowrap">{s.ref}</td><td className="py-1 pr-2">{s.project?.name}<span className="block text-gray-400">{s.project?.club}</span></td><td className="py-1 pr-2 text-red-700">{s.missing.map((m: any) => m.label).join(', ') || '—'}</td><td className="py-1 text-gray-700">{s.issues.map((i: any) => i.evidence).join(' · ') || '—'}</td></tr>
                ))}</tbody></table>
        </div>
    );
    if (r.kind === 'institutional_comms') return (
        <div className="space-y-3">
            {r.newsDraft && <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2 text-sm text-emerald-800">Noticia creada como borrador. Publicarla espera tu decisión en «Aprobaciones».</div>}
            {[['Noticia', `${r.drafts?.title || ''}\n\n${r.drafts?.news || ''}`, r.tone?.news], ['Redes', r.drafts?.social, r.tone?.social], ['WhatsApp', r.drafts?.whatsapp, r.tone?.whatsapp], ['Correo', `${r.drafts?.email_subject || ''}\n\n${r.drafts?.email_body || ''}`, r.tone?.email]].map(([label, text, tone]: any) => (
                <div key={label} className="bg-white rounded-2xl border border-gray-100 p-4">
                    <p className="text-xs font-bold text-gray-500">{label}</p>
                    <p className="text-sm text-gray-800 whitespace-pre-wrap mt-1">{text}</p>
                    {tone && !tone.ok && <p className="text-xs text-amber-700 mt-2">Revisión de tono: {tone.flags.join(' · ')}</p>}
                </div>
            ))}
        </div>
    );
    if (r.kind === 'project_formulation') return (
        <div className="space-y-3">
            {r.check?.missing?.length > 0 && <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2 text-sm text-amber-900">Falta en la idea: {r.check.missing.map((m: any) => m.label).join(' · ')}</div>}
            {r.draft ? (
                <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-2 text-sm">
                    <p className="font-black text-gray-800">{r.draft.title}</p>
                    {[['Problema', r.draft.problem], ['Beneficiarios', r.draft.beneficiaries], ['Presupuesto aproximado', r.draft.budgetOutline]].map(([k, v]: any) => v ? <p key={k}><b>{k}:</b> {String(v)}</p> : null)}
                    {[['Objetivos', r.draft.objectives], ['Actividades', r.draft.activities], ['Riesgos', r.draft.risks], ['Preguntas para el club', r.draft.missingInfo]].map(([k, v]: any) => Array.isArray(v) && v.length ? <div key={k}><b>{k}:</b><ul className="list-disc pl-5">{v.map((x: any, i: number) => <li key={i}>{typeof x === 'string' ? x : JSON.stringify(x)}</li>)}</ul></div> : null)}
                    {Array.isArray(r.draft.indicators) && r.draft.indicators.length > 0 && <div><b>Indicadores:</b><ul className="list-disc pl-5">{r.draft.indicators.map((x: any, i: number) => <li key={i}>{x.name}{x.target ? ` — meta: ${x.target}` : ''}</li>)}</ul></div>}
                </div>
            ) : <p className="text-sm text-gray-600 whitespace-pre-wrap">{r.rawText || 'Sin borrador (el agente de formulación no está instalado o no respondió).'}</p>}
        </div>
    );
    if (r.kind === 'site_audit') return (
        <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-2">
            <p className="text-xs text-gray-500">Noticias (60 días): {r.metrics?.newsLast60} · Eventos próximos: {r.metrics?.upcomingEvents} · Proyectos: {r.metrics?.projects} · SEO: {r.metrics?.seoScore ?? '—'}/100</p>
            {(r.findings || []).length === 0 ? <p className="text-sm text-emerald-700">Sin hallazgos.</p> : (
                <table className="w-full text-xs"><tbody>{r.findings.map((f: any, i: number) => (
                    <tr key={i} className="border-b border-gray-50 align-top"><td className="py-1 pr-2 font-bold">{f.severity === 'high' ? 'Alta' : f.severity === 'medium' ? 'Media' : 'Baja'}</td><td className="py-1 pr-2 text-gray-700">{f.finding}</td><td className="py-1 text-rotary-blue">{f.task}</td></tr>
                ))}</tbody></table>
            )}
        </div>
    );
    if (r.kind === 'district_report') return (
        <div className="space-y-3">
            <div className="bg-white rounded-2xl border border-gray-100 p-4 text-sm">
                <p className="text-gray-700"><b>{r.clubs}</b> clubes · <b>{r.totals?.news}</b> noticias publicadas · <b>{r.totals?.events}</b> eventos · <b>{r.totals?.projects}</b> proyectos (últimos {r.days} días)</p>
                {r.quietClubs?.length > 0 && <p className="text-xs text-amber-700 mt-1">Sin actividad publicada: {r.quietClubs.slice(0, 30).join(', ')}{r.quietClubs.length > 30 ? '…' : ''}</p>}
                {r.validation ? <p className="text-xs text-emerald-700 mt-2">Validado el {new Date(r.validation.at).toLocaleString('es-CO')}{r.validation.note ? ` — ${r.validation.note}` : ''}</p> : <p className="text-xs text-gray-500 mt-2">BORRADOR: falta la validación del distrito.</p>}
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 p-4 overflow-x-auto">
                <table className="w-full text-xs"><thead><tr className="text-left text-gray-400"><th className="py-1">Club</th><th className="py-1 text-right">Noticias</th><th className="py-1 text-right">Eventos</th><th className="py-1 text-right">Proyectos</th></tr></thead>
                    <tbody>{(r.perClub || []).map((c: any) => <tr key={c.clubId} className="border-t border-gray-50"><td className="py-1">{c.name}</td><td className="py-1 text-right tabular-nums">{c.news}</td><td className="py-1 text-right tabular-nums">{c.events}</td><td className="py-1 text-right tabular-nums">{c.projects}</td></tr>)}</tbody></table>
            </div>
        </div>
    );
    if (r.kind === 'membership_review') return (
        <div className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {[['Socios', r.metrics?.total], ['Activos', r.metrics?.active], ['Junta', r.metrics?.board], ['Honorarios', r.metrics?.honorary], ['Altas (90 días)', r.metrics?.newLast90], ['Bajas (90 días)', r.metrics?.deactivatedLast90], ['Sin foto', r.metrics?.withoutPhoto], ['Sin descripción', r.metrics?.withoutDescription]].map(([k, v]) => (
                    <div key={String(k)} className="bg-white rounded-xl border border-gray-100 px-3 py-2"><p className="text-[10px] uppercase tracking-wider text-gray-400 font-bold">{k}</p><p className="text-lg font-black text-gray-800 tabular-nums">{v ?? '—'}</p></div>
                ))}
            </div>
            <p className="text-xs text-gray-500">Sólo cifras agregadas: el informe no contiene nombres ni datos de ningún socio.</p>
            {(r.findings || []).length === 0 ? <p className="text-sm text-emerald-700">Sin hallazgos.</p> : (
                <div className="bg-white rounded-2xl border border-gray-100 p-4"><table className="w-full text-xs"><tbody>{r.findings.map((f: any, i: number) => (
                    <tr key={i} className="border-b border-gray-50 align-top"><td className="py-1 pr-2 font-bold">{SEV_LABEL[f.severity] || f.severity}</td><td className="py-1 pr-2 text-gray-700">{f.finding}</td><td className="py-1 text-rotary-blue">{f.action}</td></tr>
                ))}</tbody></table></div>
            )}
        </div>
    );
    if (r.kind === 'finance_review') return (
        <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-2">
            <p className="text-xs text-gray-500">Sólo lectura: nada de esto modificó saldos ni pagos.</p>
            {(r.findings || []).length === 0 ? <p className="text-sm text-emerald-700">Sin hallazgos: el libro mayor y los pagos del sitio cuadran.</p> : (
                <table className="w-full text-xs"><tbody>{r.findings.map((f: any, i: number) => (
                    <tr key={i} className="border-b border-gray-50 align-top"><td className="py-1 pr-2 font-bold whitespace-nowrap">{f.kind}</td><td className="py-1 pr-2 text-gray-500 whitespace-nowrap">{f.ref}</td><td className="py-1 text-gray-700">{f.evidence}</td></tr>
                ))}</tbody></table>
            )}
        </div>
    );
    if (r.kind === 'custom') return (
        <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-2">
            <p className="text-sm text-gray-700"><b>{r.name}</b> · versión {r.version}{r.stoppedAt ? ` · se detuvo en el paso ${r.stoppedAt} (condición)` : ''}</p>
            <ol className="space-y-2">{(r.steps || []).map((st: any) => (
                <li key={st.n} className={`rounded-xl border px-3 py-2 text-xs ${st.ok ? 'border-gray-100' : 'border-red-200 bg-red-50'}`}>
                    <p className="font-bold text-gray-800">{st.n}. {st.label || st.type}{st.tool ? ` · ${st.tool}` : ''}{st.templateKey ? ` · ${st.templateKey}` : ''} <span className="font-normal text-gray-400">{st.ms != null ? `${st.ms} ms` : ''}</span></p>
                    {st.error && <p className="text-red-700">{st.error}</p>}
                    {st.approvalId && <p className="text-amber-700">Acción propuesta: espera la decisión en «Aprobaciones».</p>}
                    {st.output?.text ? <p className="text-gray-700 whitespace-pre-wrap mt-1">{st.output.text}</p> : st.output && !st.approvalId ? <pre className="text-[11px] text-gray-500 whitespace-pre-wrap max-h-40 overflow-y-auto mt-1">{typeof st.output === 'string' ? st.output : JSON.stringify(st.output, null, 2)}</pre> : null}
                </li>
            ))}</ol>
        </div>
    );
    return <pre className="text-xs whitespace-pre-wrap">{JSON.stringify(r, null, 2)}</pre>;
}

/** Opinión de quien revisa: la base de las métricas del piloto. */
function FeedbackPanel({ runId, meta }: { runId: string; meta: Meta }) {
    const [findings, setFindings] = useState<Finding[] | null>(null);
    const [fb, setFb] = useState<Record<string, string>>({});
    const [error, setError] = useState<string | null>(null);
    useEffect(() => {
        acApi<{ feedback: FeedbackRow[]; findings: Finding[] }>(`/workflow-runs/${runId}/feedback`)
            .then(d => { setFindings(d.findings); setFb(Object.fromEntries(d.feedback.map(f => [f.findingRef, f.verdict]))); })
            .catch(e => setError(e.message));
    }, [runId]);
    const rate = async (ref: string, verdict: string) => {
        const next = fb[ref] === verdict ? 'clear' : verdict;
        try {
            const d = await acApi<{ feedback: FeedbackRow[] }>(`/workflow-runs/${runId}/feedback`, { method: 'POST', body: { findingRef: ref, verdict: next } });
            setFb(Object.fromEntries(d.feedback.map(f => [f.findingRef, f.verdict])));
        } catch (e: any) { setError(e.message); }
    };
    const rows: Finding[] = [{ ref: 'run', label: 'El informe completo', severity: null }, ...(findings || [])];
    const rated = rows.filter(r => fb[r.ref]).length;
    return (
        <div className="bg-white rounded-2xl border border-violet-100 p-4 space-y-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-black text-gray-800">¿Te sirvió?</p>
                <p className="text-xs text-gray-500">{rated} de {rows.length} calificados · alimenta las métricas del piloto</p>
            </div>
            <ErrorNote message={error} />
            {findings === null ? <p className="text-sm text-gray-400">Cargando…</p> : (
                <ul className="divide-y divide-gray-50">{rows.map(f => (
                    <li key={f.ref} className="py-2 flex flex-wrap items-center gap-2">
                        <span className="flex-1 min-w-[200px] text-xs text-gray-700">{f.severity ? <b className="mr-1">{SEV_LABEL[f.severity] || f.severity}</b> : null}{f.severity ? " " : null}{f.label}</span>
                        <span className="flex gap-1">{Object.entries(meta.feedbackVerdicts).map(([k, label]) => (
                            <button key={k} type="button" aria-pressed={fb[f.ref] === k} onClick={() => rate(f.ref, k)}
                                className={`px-2 py-1 rounded-lg border text-[11px] font-bold ${fb[f.ref] === k ? VERDICT_STYLE[k] : 'border-gray-200 text-gray-500 hover:text-gray-800'}`}>{label}</button>
                        ))}</span>
                    </li>
                ))}</ul>
            )}
        </div>
    );
}

function RunDetail({ id, meta, onClose }: { id: string; meta: Meta; onClose: () => void }) {
    const [run, setRun] = useState<RunFull | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [note, setNote] = useState('');
    useEffect(() => { acApi<RunFull>(`/workflow-runs/${id}`).then(setRun).catch(e => setError(e.message)); }, [id]);
    const validate = async () => { try { setRun(await acApi<RunFull>(`/workflow-runs/${id}/validate`, { method: 'POST', body: { note } })); } catch (e: any) { setError(e.message); } };
    return (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40" role="dialog" aria-modal="true" aria-label="Informe del workflow">
            <div className="w-full max-w-3xl h-full bg-gray-50 overflow-y-auto">
                <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-center gap-3">
                    <p className="font-black text-gray-800 flex-1 truncate">{run ? wfLabel(meta, run.workflowKey, run.report?.name) : 'Informe'} · {run?.siteName}</p>
                    <button type="button" onClick={onClose} aria-label="Cerrar" className="p-2 rounded-xl hover:bg-gray-100"><X className="w-5 h-5" /></button>
                </div>
                <div className="p-5 space-y-4">
                    <ErrorNote message={error || run?.error || null} />
                    {run?.aiSummary && <div className="bg-white rounded-2xl border border-blue-100 p-4"><p className="text-xs font-bold text-rotary-blue mb-1">Resumen del agente (borrador asistido por IA)</p><p className="text-sm text-gray-800 whitespace-pre-wrap">{run.aiSummary}</p></div>}
                    {run?.aiNote && <p className="text-xs text-gray-500">{run.aiNote}</p>}
                    {run && <ReportView run={run} />}
                    {run?.status === 'succeeded' && <FeedbackPanel runId={run.id} meta={meta} />}
                    {run?.workflowKey === 'district_report' && run.status === 'succeeded' && !run.report?.validation && (
                        <div className="bg-white rounded-2xl border border-emerald-200 p-4 flex flex-wrap gap-2 items-center">
                            <input aria-label="Nota de validación" className="flex-1 min-w-[200px] px-3 py-2 rounded-xl border border-gray-200 text-sm" placeholder="Nota de validación (opcional)" value={note} onChange={e => setNote(e.target.value)} />
                            <button type="button" onClick={validate} className="px-3 py-2 rounded-xl bg-emerald-600 text-white text-sm font-bold">Validar informe</button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function RunForm({ wf, meta, onDone }: { wf: WorkflowDef; meta: Meta; onDone: (msg: string) => void }) {
    const [siteId, setSiteId] = useState(meta.scope === 'site' ? (meta.siteId || '') : '');
    const [idea, setIdea] = useState('');
    const [days, setDays] = useState('90');
    const [eventId, setEventId] = useState('');
    const [brief, setBrief] = useState('');
    const [cadence, setCadence] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const input = wf.key === 'institutional_comms' ? { brief }
        : wf.key === 'project_formulation' ? { idea }
        : wf.key === 'district_report' ? { days: Number(days) || 90 }
        : wf.key === 'site_audit' || wf.key === 'membership_review' || wf.key === 'finance_review' ? {}
        : wf.key === 'event_registration_review' ? (eventId ? { eventId } : {}) : (eventId ? { submissionId: eventId } : {});
    const run = async () => {
        setBusy(true); setError(null);
        try { await acApi('/workflow-runs', { method: 'POST', body: { workflowKey: wf.key, siteId, input } }); onDone('Workflow ejecutado: el informe está en la lista.'); }
        catch (e: any) { setError(e.message); } finally { setBusy(false); }
    };
    const schedule = async () => {
        setBusy(true); setError(null);
        try { await acApi('/schedules', { method: 'POST', body: { workflowKey: wf.key, siteId, cadence, input } }); onDone('Programación creada.'); }
        catch (e: any) { setError(e.message); } finally { setBusy(false); }
    };
    return (
        <div className="space-y-2 border-t border-gray-50 pt-3">
            <ErrorNote message={error} />
            {meta.scope === 'platform' && <SitePicker meta={meta} value={siteId} onChange={id => setSiteId(id)} idPrefix={`wf-${wf.key}`} fixedType={wf.key === 'district_report' ? 'district' : undefined} />}
            {wf.key === 'project_formulation' ? <textarea aria-label="Idea del proyecto" rows={4} className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm" placeholder="Describe la idea: qué problema, a quién beneficia, dónde, cuánto cuesta y en qué plazo" value={idea} onChange={e => setIdea(e.target.value)} />
            : wf.key === 'district_report' ? <label className="flex items-center gap-2 text-sm text-gray-600">Período <select aria-label="Período" className="px-2 py-1.5 rounded-lg border border-gray-200 text-sm bg-white" value={days} onChange={e => setDays(e.target.value)}><option value="30">30 días</option><option value="90">90 días</option><option value="180">180 días</option><option value="365">1 año</option></select></label>
            : wf.key === 'site_audit' || wf.key === 'membership_review' || wf.key === 'finance_review' ? null
            : wf.key === 'institutional_comms'
                ? <textarea aria-label="Qué se quiere comunicar" rows={3} className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm" placeholder="Qué se quiere comunicar, para quién y con qué datos" value={brief} onChange={e => setBrief(e.target.value)} />
                : <input aria-label="Id opcional" className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm" placeholder={wf.key === 'event_registration_review' ? 'Id del evento (opcional: sin él, los eventos con inscripciones)' : 'Id de la postulación (opcional: sin él, todas)'} value={eventId} onChange={e => setEventId(e.target.value)} />}
            <div className="flex flex-wrap gap-2 items-center">
                <button type="button" disabled={busy || !siteId} onClick={run} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gray-900 text-white text-sm font-bold disabled:opacity-40"><Play className="w-4 h-4" /> Ejecutar ahora</button>
                {!['institutional_comms', 'project_formulation'].includes(wf.key) && (
                    <>
                        <select aria-label="Programación" className="px-3 py-2 rounded-xl border border-gray-200 text-sm bg-white" value={cadence} onChange={e => setCadence(e.target.value)}>
                            <option value="">Programar…</option>
                            <option value="daily@07:00">Todos los días 07:00</option>
                            <option value="weekly@1@07:00">Cada lunes 07:00</option>
                            {wf.triggers.filter(t => t.startsWith('event@')).map(t => <option key={t} value={t}>{meta.eventTypes[t.slice(6)] || t}</option>)}
                        </select>
                        <button type="button" disabled={busy || !siteId || !cadence} onClick={schedule} className="px-3 py-2 rounded-xl border border-gray-200 text-sm font-bold disabled:opacity-40">Guardar programación</button>
                    </>
                )}
            </div>
        </div>
    );
}

export default function WorkflowsTab({ meta }: { meta: Meta }) {
    const [runs, setRuns] = useState<RunRow[] | null>(null);
    const [schedules, setSchedules] = useState<Schedule[]>([]);
    const [open, setOpen] = useState<string | null>(null);
    const [form, setForm] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const load = useCallback(() => {
        acApi<{ runs: RunRow[] }>('/workflow-runs').then(d => setRuns(d.runs)).catch(e => setError(e.message));
        acApi<{ schedules: Schedule[] }>('/schedules').then(d => setSchedules(d.schedules)).catch(() => setSchedules([]));
    }, []);
    useEffect(load, [load]);
    const seed = async () => { try { const r = await acApi<{ created: number }>('/pilots/seed', { method: 'POST' }); setNotice(r.created ? `Se crearon ${r.created} agentes piloto como borrador en «Agentes»: revísalos, publícalos e instálalos en los sitios del piloto.` : 'Los agentes piloto ya existían.'); } catch (e: any) { setError(e.message); } };
    const toggleSchedule = async (s: Schedule) => { try { await acApi(`/schedules/${s.id}`, { method: 'PUT', body: { workflowKey: s.workflowKey, siteId: undefined, cadence: s.cadence, enabled: !s.enabled } }); load(); } catch (e: any) { setError(e.message); } };
    const removeSchedule = async (s: Schedule) => { try { await acApi(`/schedules/${s.id}`, { method: 'DELETE' }); load(); } catch (e: any) { setError(e.message); } };
    const wfs = Object.values(meta.workflows);
    return (
        <div className="space-y-5">
            <SectionHeader title="Workflows" subtitle="Los del catálogo. Los hallazgos los calcula el sistema con reglas verificables; el agente piloto, si está instalado en el sitio, sólo redacta el resumen. Califica cada hallazgo en el informe: esa opinión mide el piloto. Los workflows propios se arman en «Constructor». Nada se publica ni se decide solo."
                actions={meta.scope === 'platform' ? <button type="button" onClick={seed} className="px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-bold">Crear agentes piloto</button> : undefined} />
            <ErrorNote message={error} />
            {notice && <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm rounded-xl px-4 py-2.5">{notice}</div>}
            <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-3">
                {wfs.map(wf => (
                    <div key={wf.key} className="bg-white rounded-2xl border border-gray-100 p-4 space-y-2 min-w-0">
                        <p className="font-black text-gray-800">{wf.label}</p>
                        <ol className="text-xs text-gray-600 list-decimal pl-4 space-y-0.5">{wf.steps.map(s => <li key={s}>{s}</li>)}</ol>
                        <p className="text-[11px] text-red-700">Nunca: {wf.never.join(' · ')}</p>
                        <button type="button" onClick={() => setForm(form === wf.key ? null : wf.key)} className="text-sm font-bold text-rotary-blue">{form === wf.key ? 'Cerrar' : 'Ejecutar o programar'}</button>
                        {form === wf.key && <RunForm wf={wf} meta={meta} onDone={(m) => { setNotice(m); setForm(null); load(); }} />}
                    </div>
                ))}
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 p-4">
                <p className="font-black text-gray-800 mb-2">Programaciones</p>
                {schedules.length === 0 ? <p className="text-sm text-gray-400">Sin programaciones.</p> : (
                    <ul className="divide-y divide-gray-50">{schedules.map(s => (
                        <li key={s.id} className="py-2 flex flex-wrap items-center gap-3 text-sm">
                            <span className="flex-1 min-w-0"><b className="text-gray-800">{wfLabel(meta, s.workflowKey, s.customName)}</b> · {s.siteName}<span className="block text-xs text-gray-500">{s.cadence.startsWith('event@') ? `Cuando ocurre: ${meta.eventTypes[s.cadence.slice(6)] || s.cadence.slice(6)}` : s.cadenceLabel}{s.nextRunAt ? ` · próxima ${fmtDate(s.nextRunAt)}` : ''}{s.lastRunAt ? ` · última ${fmtDate(s.lastRunAt)}` : ''}</span></span>
                            <label className="inline-flex items-center gap-1.5 text-xs font-bold"><input type="checkbox" checked={s.enabled} onChange={() => toggleSchedule(s)} /> Activa</label>
                            <button type="button" onClick={() => removeSchedule(s)} className="text-xs font-bold text-red-600">Eliminar</button>
                        </li>
                    ))}</ul>
                )}
            </div>
            <div className="space-y-2">
                <p className="font-black text-gray-800">Ejecuciones</p>
                {runs === null ? <div className="text-sm text-gray-400">Cargando…</div> : runs.length === 0 ? <EmptyNote>Todavía no hay ejecuciones.</EmptyNote> : (
                    <div className="bg-white rounded-2xl border border-gray-100 overflow-x-auto">
                        <table className="w-full text-sm"><thead><tr className="text-left text-[11px] uppercase tracking-wider text-gray-400 border-b border-gray-100"><th className="px-4 py-2.5">Workflow</th><th className="px-4 py-2.5">Sitio</th><th className="px-4 py-2.5">Disparo</th><th className="px-4 py-2.5">Estado</th><th className="px-4 py-2.5">Cuándo</th></tr></thead>
                            <tbody>{runs.map(r => (
                                <tr key={r.id} onClick={() => setOpen(r.id)} className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer">
                                    <td className="px-4 py-2 text-gray-800">{wfLabel(meta, r.workflowKey, r.customName)}{r.findings != null ? <span className="text-xs text-gray-400"> · {r.findings} hallazgos</span> : null}{r.feedbackCount ? <span className="text-xs text-violet-600"> · {r.feedbackCount} calificados</span> : null}</td>
                                    <td className="px-4 py-2 text-gray-600">{r.siteName}</td>
                                    <td className="px-4 py-2 text-gray-500">{r.trigger}</td>
                                    <td className="px-4 py-2"><span className={`text-xs font-bold ${r.status === 'succeeded' ? 'text-emerald-700' : r.status === 'failed' ? 'text-red-600' : 'text-violet-700'}`}>{r.status === 'succeeded' ? 'Completado' : r.status === 'failed' ? 'Falló' : 'En curso'}</span></td>
                                    <td className="px-4 py-2 text-gray-500 whitespace-nowrap tabular-nums">{fmtDate(r.startedAt)}</td>
                                </tr>
                            ))}</tbody></table>
                    </div>
                )}
            </div>
            {open && <RunDetail id={open} meta={meta} onClose={() => setOpen(null)} />}
        </div>
    );
}
