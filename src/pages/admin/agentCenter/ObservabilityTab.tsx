// Observabilidad — alertas, rendimiento por agente y workflow, presupuestos (v4.1318).
import { useCallback, useEffect, useState } from 'react';
import { acApi } from './agentCenterApi';
import type { Meta } from './agentCenterApi';
import { EmptyNote, ErrorNote, Kpi, SectionHeader, fmtDate } from './agentCenterUi';

interface Alert { id: string; kind: string; label: string; severity: string; message: string; status: string; siteName: string | null; createdAt: string; lastSeenAt: string }
interface Analytics {
    days: number; totals: { runs: number; succeeded: number; failed: number; costUsd: number; successRate: number | null };
    byAgent: { templateId: string; agent: string; team: string; runs: number; succeeded: number; failed: number; avgSeconds: number | null; costUsd: number; tokens: number; sites: number }[];
    byWorkflow: { workflowKey: string; runs: number; succeeded: number; failed: number; withAi: number; sites: number }[];
    bySite: { siteId: string; siteName: string | null; runs: number; failed: number; costUsd: number }[];
}
interface Budgets { platformMonthlyUsd: number | null; sites: Record<string, number> }

const SEV: Record<string, string> = { high: 'border-red-200 bg-red-50 text-red-800', medium: 'border-amber-200 bg-amber-50 text-amber-800', low: 'border-gray-200 bg-gray-50 text-gray-700' };
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)} %` : '—');

function BudgetsPanel({ onError }: { onError: (m: string) => void }) {
    const [b, setB] = useState<Budgets | null>(null);
    const [siteId, setSiteId] = useState('');
    const [siteUsd, setSiteUsd] = useState('');
    const load = useCallback(() => { acApi<Budgets>('/budgets').then(setB).catch(e => onError(e.message)); }, [onError]);
    useEffect(load, [load]);
    const save = async (patch: Partial<Budgets>) => { try { setB(await acApi<Budgets>('/budgets', { method: 'PUT', body: patch })); } catch (e: any) { onError(e.message); } };
    if (!b) return null;
    return (
        <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
            <p className="font-black text-gray-800">Presupuestos mensuales (USD)</p>
            <p className="text-xs text-gray-500">El primer tope que se alcance detiene el gasto: el del agente (en su instalación), el del sitio o el de la plataforma. Al 80 % se abre una alerta.</p>
            <label className="flex flex-wrap items-center gap-2 text-sm">Plataforma
                <input aria-label="Presupuesto de la plataforma" type="number" min="0" step="1" className="w-32 px-3 py-1.5 rounded-xl border border-gray-200 text-sm" defaultValue={b.platformMonthlyUsd ?? ''} onBlur={e => save({ platformMonthlyUsd: e.target.value === '' ? null : Number(e.target.value) })} />
                <span className="text-xs text-gray-400">vacío = sin tope</span>
            </label>
            <div className="flex flex-wrap gap-2 items-center text-sm">
                <input aria-label="Id del sitio" className="w-64 px-3 py-1.5 rounded-xl border border-gray-200 text-sm" placeholder="Id del sitio" value={siteId} onChange={e => setSiteId(e.target.value)} />
                <input aria-label="USD por mes" type="number" min="0" className="w-28 px-3 py-1.5 rounded-xl border border-gray-200 text-sm" placeholder="USD" value={siteUsd} onChange={e => setSiteUsd(e.target.value)} />
                <button type="button" disabled={!siteId} onClick={() => { save({ sites: { [siteId]: Number(siteUsd) || 0 } }); setSiteId(''); setSiteUsd(''); }} className="px-3 py-1.5 rounded-xl border border-gray-200 text-xs font-bold disabled:opacity-40">Guardar tope del sitio</button>
            </div>
            {Object.keys(b.sites).length > 0 && <ul className="text-xs text-gray-600 space-y-1">{Object.entries(b.sites).map(([k, v]) => <li key={k} className="flex gap-2 items-center"><code>{k}</code> · US$ {v} <button type="button" onClick={() => save({ sites: { [k]: 0 } })} className="text-red-600 font-bold">Quitar</button></li>)}</ul>}
        </div>
    );
}

export default function ObservabilityTab({ meta }: { meta: Meta }) {
    const [alerts, setAlerts] = useState<Alert[] | null>(null);
    const [a, setA] = useState<Analytics | null>(null);
    const [days, setDays] = useState(30);
    const [error, setError] = useState<string | null>(null);
    const load = useCallback(() => {
        acApi<{ alerts: Alert[] }>('/alerts').then(d => setAlerts(d.alerts)).catch(e => setError(e.message));
        acApi<Analytics>(`/analytics?days=${days}`).then(setA).catch(e => setError(e.message));
    }, [days]);
    useEffect(load, [load]);
    const setStatus = async (id: string, status: string) => { try { await acApi(`/alerts/${id}/status`, { method: 'POST', body: { status } }); load(); } catch (e: any) { setError(e.message); } };
    const recompute = async () => { try { await acApi('/alerts/compute', { method: 'POST' }); load(); } catch (e: any) { setError(e.message); } };
    return (
        <div className="space-y-5">
            <SectionHeader title="Observabilidad" subtitle="Alertas que se abren y se resuelven solas según los hechos, y el rendimiento de cada agente y workflow."
                actions={<div className="flex gap-2">{meta.scope === 'platform' && <button type="button" onClick={recompute} className="px-3 py-2 rounded-xl border border-gray-200 text-sm font-bold">Revisar ahora</button>}<div className="flex gap-1 bg-white border border-gray-100 rounded-xl p-1">{[7, 30, 90].map(d => <button key={d} type="button" onClick={() => setDays(d)} className={`px-3 py-1.5 rounded-lg text-sm font-bold ${days === d ? 'bg-gray-100 text-gray-800' : 'text-gray-400'}`}>{d} días</button>)}</div></div>} />
            <ErrorNote message={error} />
            <div className="space-y-2">
                <p className="font-black text-gray-800">Alertas abiertas</p>
                {alerts === null ? <div className="text-sm text-gray-400">Cargando…</div> : alerts.length === 0 ? <EmptyNote>Sin alertas abiertas.</EmptyNote> : alerts.map(al => (
                    <div key={al.id} className={`rounded-2xl border px-4 py-3 flex flex-wrap items-center gap-3 ${SEV[al.severity] || SEV.low}`}>
                        <div className="min-w-0 flex-1"><p className="font-bold text-sm">{al.label}{al.siteName ? ` · ${al.siteName}` : ''}</p><p className="text-sm">{al.message}</p><p className="text-[11px] opacity-70">Desde {fmtDate(al.createdAt)} · visto {fmtDate(al.lastSeenAt)}{al.status === 'acknowledged' ? ' · reconocida' : ''}</p></div>
                        {al.status === 'open' && <button type="button" onClick={() => setStatus(al.id, 'acknowledged')} className="text-xs font-bold underline">Reconocer</button>}
                        <button type="button" onClick={() => setStatus(al.id, 'resolved')} className="text-xs font-bold underline">Resolver</button>
                    </div>
                ))}
            </div>
            {a && (
                <>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <Kpi label="Ejecuciones" value={a.totals.runs} hint={`${a.days} días`} />
                        <Kpi label="Tasa de éxito" value={a.totals.successRate == null ? '—' : `${Math.round(a.totals.successRate * 100)} %`} />
                        <Kpi label="Fallidas" value={a.totals.failed} />
                        <Kpi label="Costo de las ejecuciones" value={`US$ ${a.totals.costUsd.toFixed(2)}`} />
                    </div>
                    <div className="bg-white rounded-2xl border border-gray-100 overflow-x-auto">
                        <p className="font-black text-gray-800 px-4 pt-4">Por agente</p>
                        <table className="w-full text-sm mt-2"><thead><tr className="text-left text-[11px] uppercase tracking-wider text-gray-400 border-b border-gray-100"><th className="px-4 py-2">Agente</th><th className="px-4 py-2 text-right">Ejecuciones</th><th className="px-4 py-2 text-right">Éxito</th><th className="px-4 py-2 text-right">Tiempo medio</th><th className="px-4 py-2 text-right">Tokens</th><th className="px-4 py-2 text-right">Costo</th><th className="px-4 py-2 text-right">Sitios</th></tr></thead>
                            <tbody>{a.byAgent.length === 0 ? <tr><td colSpan={7} className="px-4 py-3 text-gray-400">Sin ejecuciones en el período.</td></tr> : a.byAgent.map(r => (
                                <tr key={r.templateId} className="border-b border-gray-50"><td className="px-4 py-1.5">{r.agent}<span className="text-xs text-gray-400"> · {meta.teams.find(t => t.key === r.team)?.short}</span></td><td className="px-4 py-1.5 text-right tabular-nums">{r.runs}</td><td className="px-4 py-1.5 text-right tabular-nums">{pct(r.succeeded, r.runs)}</td><td className="px-4 py-1.5 text-right tabular-nums">{r.avgSeconds != null ? `${r.avgSeconds} s` : '—'}</td><td className="px-4 py-1.5 text-right tabular-nums">{r.tokens.toLocaleString('es-CO')}</td><td className="px-4 py-1.5 text-right tabular-nums">US$ {r.costUsd.toFixed(4)}</td><td className="px-4 py-1.5 text-right tabular-nums">{r.sites}</td></tr>
                            ))}</tbody></table>
                    </div>
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                        <div className="bg-white rounded-2xl border border-gray-100 p-4">
                            <p className="font-black text-gray-800 mb-2">Por workflow</p>
                            {a.byWorkflow.length === 0 ? <p className="text-sm text-gray-400">Sin ejecuciones.</p> : <ul className="divide-y divide-gray-50">{a.byWorkflow.map(w => <li key={w.workflowKey} className="py-1.5 flex justify-between gap-2 text-sm"><span>{meta.workflows[w.workflowKey]?.label || w.workflowKey}</span><span className="text-xs text-gray-500 tabular-nums">{w.runs} · éxito {pct(w.succeeded, w.runs)} · con IA {w.withAi} · {w.sites} sitios</span></li>)}</ul>}
                        </div>
                        {meta.scope === 'platform' && (
                            <div className="bg-white rounded-2xl border border-gray-100 p-4">
                                <p className="font-black text-gray-800 mb-2">Por sitio</p>
                                {a.bySite.length === 0 ? <p className="text-sm text-gray-400">Sin ejecuciones.</p> : <ul className="divide-y divide-gray-50">{a.bySite.map(s => <li key={s.siteId || 'central'} className="py-1.5 flex justify-between gap-2 text-sm"><span>{s.siteName || 'Administración central'}</span><span className="text-xs text-gray-500 tabular-nums">{s.runs} ejecuciones · {s.failed} fallidas · US$ {s.costUsd.toFixed(4)}</span></li>)}</ul>}
                            </div>
                        )}
                    </div>
                </>
            )}
            {meta.scope === 'platform' && <BudgetsPanel onError={setError} />}
        </div>
    );
}
