// Piloto controlado (Fase 5, v4.1319) — sitios, workflows, fechas y metas; las
// métricas salen de las ejecuciones, de la opinión de quien revisó cada
// hallazgo, del Consumo de IA y de las aprobaciones. La decisión es humana.
import { useCallback, useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { acApi } from './agentCenterApi';
import type { Meta, Site } from './agentCenterApi';
import { EmptyNote, ErrorNote, Kpi, SectionHeader, fmtDate } from './agentCenterUi';
import SitePicker from './SitePicker';

interface Goals { minUseful: number; maxFalsePositive: number; minRated: number; minutesPerFinding: number }
interface Pilot { id: string; name: string; status: string; siteIds: string[]; workflowKeys: string[]; startsAt: string; endsAt: string | null; goals: Partial<Goals>; notes: string | null; conclusion: any; createdAt: string }
interface Metrics { runs: number; successRate: number | null; findings: number; rated: number; usefulRate: number | null; falsePositiveRate: number | null; estimatedMinutesSaved: number; costUsd: number; costPerSite: number | null; approvalsDecided: number; approvalsRejectedRate: number | null }
interface PilotDetail { pilot: Pilot; goals: Goals; metrics: Metrics; verdict: { status: string; reason: string }; bySite: (Metrics & { siteId: string; siteName: string })[]; byWorkflow: (Metrics & { workflowKey: string; label: string })[] }
interface CustomWf { id: string; name: string; status: string }

const pct = (v: number | null) => (v == null ? '—' : `${Math.round(v * 100)} %`);
const VERDICT: Record<string, { label: string; cls: string }> = {
    pass: { label: 'Cumple las metas', cls: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
    review: { label: 'No cumple las metas', cls: 'border-amber-200 bg-amber-50 text-amber-800' },
    insufficient: { label: 'Faltan opiniones', cls: 'border-gray-200 bg-gray-50 text-gray-700' },
};
const DECISIONS: Record<string, string> = { scale: 'Escalar', adjust: 'Ajustar y repetir', stop: 'Detener' };
const toLocalInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

function PilotForm({ meta, customs, onSaved, onCancel }: { meta: Meta; customs: CustomWf[]; onSaved: (p: Pilot) => void; onCancel: () => void }) {
    const [name, setName] = useState('');
    const [sites, setSites] = useState<Site[]>([]);
    const [pick, setPick] = useState('');
    const [keys, setKeys] = useState<string[]>([]);
    const [startsAt, setStartsAt] = useState(toLocalInput(new Date()));
    const [endsAt, setEndsAt] = useState(toLocalInput(new Date(Date.now() + 30 * 86400_000)));
    const [goals, setGoals] = useState<Goals>({ minUseful: 0.6, maxFalsePositive: 0.2, minRated: 20, minutesPerFinding: 5 });
    const [notes, setNotes] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const options = [...Object.values(meta.workflows).map(w => ({ key: w.key, label: w.label })), ...customs.filter(c => c.status === 'published').map(c => ({ key: `custom:${c.id}`, label: `${c.name} (constructor)` }))];
    const toggle = (k: string) => setKeys(prev => (prev.includes(k) ? prev.filter(x => x !== k) : [...prev, k]));
    const save = async () => {
        setBusy(true); setError(null);
        try {
            const p = await acApi<Pilot>('/pilots', { method: 'POST', body: { name, siteIds: sites.map(s => s.id), workflowKeys: keys, startsAt: new Date(`${startsAt}T00:00:00`).toISOString(), endsAt: endsAt ? new Date(`${endsAt}T23:59:59`).toISOString() : null, goals, notes, status: 'active' } });
            onSaved(p);
        } catch (e: any) { setError(e.message); } finally { setBusy(false); }
    };
    return (
        <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-4">
            <ErrorNote message={error} />
            <label className="block text-sm font-bold text-gray-700">Nombre
                <input className="mt-1 w-full px-3 py-2 rounded-xl border border-gray-200 text-sm font-normal" value={name} onChange={e => setName(e.target.value)} placeholder="Piloto de inscripciones — Conferencia 2026" />
            </label>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <div className="space-y-2">
                    <p className="text-sm font-bold text-gray-700">Sitios del piloto</p>
                    <SitePicker meta={meta} value={pick} idPrefix="pilot-site" onChange={(id, site) => { setPick(id); if (site && !sites.some(s => s.id === id)) setSites(prev => [...prev, site]); }} />
                    <div className="flex flex-wrap gap-1.5">{sites.map(s => (
                        <span key={s.id} className="inline-flex items-center gap-1 text-xs bg-blue-50 text-rotary-blue rounded-lg pl-2 pr-1 py-1">{s.name}
                            <button type="button" aria-label={`Quitar ${s.name}`} onClick={() => setSites(prev => prev.filter(x => x.id !== s.id))} className="p-0.5 rounded hover:bg-blue-100"><X className="w-3 h-3" /></button>
                        </span>
                    ))}</div>
                </div>
                <div className="space-y-2">
                    <p className="text-sm font-bold text-gray-700">Workflows que se miden</p>
                    <div className="max-h-56 overflow-y-auto border border-gray-100 rounded-xl divide-y divide-gray-50">{options.map(o => (
                        <label key={o.key} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-gray-50"><input type="checkbox" checked={keys.includes(o.key)} onChange={() => toggle(o.key)} /> {o.label}</label>
                    ))}</div>
                </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
                <label className="text-xs font-bold text-gray-600">Inicio<input type="date" className="mt-1 w-full px-2 py-1.5 rounded-lg border border-gray-200 text-sm font-normal" value={startsAt} onChange={e => setStartsAt(e.target.value)} /></label>
                <label className="text-xs font-bold text-gray-600">Fin<input type="date" className="mt-1 w-full px-2 py-1.5 rounded-lg border border-gray-200 text-sm font-normal" value={endsAt} onChange={e => setEndsAt(e.target.value)} /></label>
                <label className="text-xs font-bold text-gray-600">Útiles (meta %)<input type="number" min="0" max="100" className="mt-1 w-full px-2 py-1.5 rounded-lg border border-gray-200 text-sm font-normal" value={Math.round(goals.minUseful * 100)} onChange={e => setGoals({ ...goals, minUseful: Number(e.target.value) / 100 })} /></label>
                <label className="text-xs font-bold text-gray-600">Falsos positivos (tope %)<input type="number" min="0" max="100" className="mt-1 w-full px-2 py-1.5 rounded-lg border border-gray-200 text-sm font-normal" value={Math.round(goals.maxFalsePositive * 100)} onChange={e => setGoals({ ...goals, maxFalsePositive: Number(e.target.value) / 100 })} /></label>
                <label className="text-xs font-bold text-gray-600">Opiniones mínimas<input type="number" min="1" className="mt-1 w-full px-2 py-1.5 rounded-lg border border-gray-200 text-sm font-normal" value={goals.minRated} onChange={e => setGoals({ ...goals, minRated: Number(e.target.value) })} /></label>
                <label className="text-xs font-bold text-gray-600">Minutos por hallazgo a mano<input type="number" min="0" className="mt-1 w-full px-2 py-1.5 rounded-lg border border-gray-200 text-sm font-normal" value={goals.minutesPerFinding} onChange={e => setGoals({ ...goals, minutesPerFinding: Number(e.target.value) })} /></label>
            </div>
            <textarea aria-label="Notas del piloto" rows={2} className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm" placeholder="Objetivo, responsables, criterios del comité (opcional)" value={notes} onChange={e => setNotes(e.target.value)} />
            <div className="flex gap-2">
                <button type="button" disabled={busy || name.trim().length < 3 || !sites.length || !keys.length} onClick={save} className="px-4 py-2 rounded-xl bg-gray-900 text-white text-sm font-bold disabled:opacity-40">Iniciar piloto</button>
                <button type="button" onClick={onCancel} className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-bold">Cancelar</button>
            </div>
        </div>
    );
}

function PilotView({ id, onChanged }: { id: string; onChanged: () => void }) {
    const [d, setD] = useState<PilotDetail | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [decision, setDecision] = useState('');
    const [note, setNote] = useState('');
    const load = useCallback(() => { acApi<PilotDetail>(`/pilots/${id}`).then(setD).catch(e => setError(e.message)); }, [id]);
    useEffect(load, [load]);
    const conclude = async () => { try { await acApi(`/pilots/${id}/conclude`, { method: 'POST', body: { decision, note } }); load(); onChanged(); } catch (e: any) { setError(e.message); } };
    if (!d) return <div className="text-sm text-gray-400">{error || 'Calculando métricas…'}</div>;
    const m = d.metrics; const v = VERDICT[d.verdict.status] || VERDICT.insufficient;
    const c = d.pilot.conclusion;
    return (
        <div className="space-y-4">
            <ErrorNote message={error} />
            <div className={`rounded-2xl border px-4 py-3 ${v.cls}`}><p className="font-black">{v.label}</p><p className="text-sm">{d.verdict.reason} Metas: {pct(d.goals.minUseful)} útiles, tope {pct(d.goals.maxFalsePositive)} de falsos positivos, {d.goals.minRated} opiniones.</p></div>
            <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
                <Kpi label="Ejecuciones" value={m.runs} hint={`éxito ${pct(m.successRate)}`} />
                <Kpi label="Hallazgos" value={m.findings} />
                <Kpi label="Calificados" value={m.rated} />
                <Kpi label="Útiles" value={pct(m.usefulRate)} />
                <Kpi label="Falsos positivos" value={pct(m.falsePositiveRate)} />
                <Kpi label="Tiempo ahorrado" value={`${Math.round(m.estimatedMinutesSaved / 6) / 10} h`} hint="útiles × minutos a mano" />
                <Kpi label="Costo IA" value={`US$ ${m.costUsd.toFixed(2)}`} hint={m.costPerSite != null ? `US$ ${m.costPerSite.toFixed(2)} por sitio` : undefined} />
                <Kpi label="Aprobaciones rechazadas" value={pct(m.approvalsRejectedRate)} hint={`${m.approvalsDecided} decididas`} />
            </div>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <div className="bg-white rounded-2xl border border-gray-100 overflow-x-auto">
                    <p className="font-black text-gray-800 px-4 pt-4">Por sitio</p>
                    <table className="w-full text-sm mt-2"><thead><tr className="text-left text-[11px] uppercase tracking-wider text-gray-400 border-b border-gray-100"><th className="px-4 py-2">Sitio</th><th className="px-4 py-2 text-right">Ejecuciones</th><th className="px-4 py-2 text-right">Útiles</th><th className="px-4 py-2 text-right">F. positivos</th><th className="px-4 py-2 text-right">Costo</th></tr></thead>
                        <tbody>{d.bySite.map(s => <tr key={s.siteId} className="border-b border-gray-50"><td className="px-4 py-1.5">{s.siteName}</td><td className="px-4 py-1.5 text-right tabular-nums">{s.runs}</td><td className="px-4 py-1.5 text-right tabular-nums">{pct(s.usefulRate)}</td><td className="px-4 py-1.5 text-right tabular-nums">{pct(s.falsePositiveRate)}</td><td className="px-4 py-1.5 text-right tabular-nums">US$ {s.costUsd.toFixed(2)}</td></tr>)}</tbody></table>
                </div>
                <div className="bg-white rounded-2xl border border-gray-100 overflow-x-auto">
                    <p className="font-black text-gray-800 px-4 pt-4">Por workflow</p>
                    <table className="w-full text-sm mt-2"><thead><tr className="text-left text-[11px] uppercase tracking-wider text-gray-400 border-b border-gray-100"><th className="px-4 py-2">Workflow</th><th className="px-4 py-2 text-right">Ejecuciones</th><th className="px-4 py-2 text-right">Hallazgos</th><th className="px-4 py-2 text-right">Útiles</th><th className="px-4 py-2 text-right">F. positivos</th></tr></thead>
                        <tbody>{d.byWorkflow.map(w => <tr key={w.workflowKey} className="border-b border-gray-50"><td className="px-4 py-1.5">{w.label}</td><td className="px-4 py-1.5 text-right tabular-nums">{w.runs}</td><td className="px-4 py-1.5 text-right tabular-nums">{w.findings}</td><td className="px-4 py-1.5 text-right tabular-nums">{pct(w.usefulRate)}</td><td className="px-4 py-1.5 text-right tabular-nums">{pct(w.falsePositiveRate)}</td></tr>)}</tbody></table>
                </div>
            </div>
            {c ? (
                <div className="bg-white rounded-2xl border border-gray-100 p-4 text-sm"><p className="font-black text-gray-800">Concluido: {DECISIONS[c.decision] || c.decision}</p><p className="text-xs text-gray-500">{fmtDate(c.at)} · al cerrar: {VERDICT[c.verdict?.status]?.label || '—'} — {c.metrics?.runs ?? 0} ejecuciones, {pct(c.metrics?.usefulRate ?? null)} útiles, {pct(c.metrics?.falsePositiveRate ?? null)} falsos positivos, US$ {Number(c.metrics?.costUsd || 0).toFixed(2)}. Las cifras de arriba se recalculan hoy con las opiniones que lleguen después.</p>{c.note && <p className="text-gray-700 mt-1 whitespace-pre-wrap">{c.note}</p>}</div>
            ) : (
                <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-2">
                    <p className="font-black text-gray-800">Concluir el piloto</p>
                    <p className="text-xs text-gray-500">Congela las métricas y el veredicto de hoy. La decisión es del comité, no del sistema.</p>
                    <div className="flex flex-wrap gap-2">{Object.entries(DECISIONS).map(([k, l]) => <button key={k} type="button" aria-pressed={decision === k} onClick={() => setDecision(k)} className={`px-3 py-1.5 rounded-xl border text-sm font-bold ${decision === k ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 text-gray-600'}`}>{l}</button>)}</div>
                    <textarea aria-label="Nota de la conclusión" rows={2} className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm" placeholder="Por qué (opcional)" value={note} onChange={e => setNote(e.target.value)} />
                    <button type="button" disabled={!decision} onClick={conclude} className="px-4 py-2 rounded-xl bg-gray-900 text-white text-sm font-bold disabled:opacity-40">Concluir</button>
                </div>
            )}
        </div>
    );
}

export default function PilotTab({ meta }: { meta: Meta }) {
    const [pilots, setPilots] = useState<Pilot[] | null>(null);
    const [customs, setCustoms] = useState<CustomWf[]>([]);
    const [creating, setCreating] = useState(false);
    const [open, setOpen] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const load = useCallback(() => {
        acApi<{ pilots: Pilot[] }>('/pilots').then(d => setPilots(d.pilots)).catch(e => setError(e.message));
        acApi<{ workflows: CustomWf[] }>('/custom-workflows').then(d => setCustoms(d.workflows)).catch(() => setCustoms([]));
    }, []);
    useEffect(load, [load]);
    return (
        <div className="space-y-5">
            <SectionHeader title="Piloto controlado" subtitle="Elige unos sitios y unos workflows por un tiempo. Quien revisa cada informe califica sus hallazgos (útil, no útil, falso positivo); de ahí salen las métricas: tiempo ahorrado, porcentaje útil, falsos positivos, costo por sitio y aprobaciones rechazadas."
                actions={!creating ? <button type="button" onClick={() => setCreating(true)} className="px-4 py-2.5 rounded-xl bg-gray-900 text-white text-sm font-bold">Nuevo piloto</button> : undefined} />
            <ErrorNote message={error} />
            {creating && <PilotForm meta={meta} customs={customs} onCancel={() => setCreating(false)} onSaved={(p) => { setCreating(false); setOpen(p.id); load(); }} />}
            {pilots === null ? <div className="text-sm text-gray-400">Cargando…</div> : pilots.length === 0 && !creating ? <EmptyNote>Sin pilotos. Crea uno con los sitios y workflows que quieres medir.</EmptyNote> : (
                <div className="space-y-3">{pilots.map(p => (
                    <div key={p.id} className="bg-white rounded-2xl border border-gray-100">
                        <button type="button" onClick={() => setOpen(open === p.id ? null : p.id)} className="w-full text-left px-4 py-3 flex flex-wrap items-center gap-3">
                            <span className="flex-1 min-w-0"><b className="text-gray-800">{p.name}</b><span className="block text-xs text-gray-500">{p.siteIds.length} sitios · {p.workflowKeys.length} workflows · {new Date(p.startsAt).toLocaleDateString('es-CO')} → {p.endsAt ? new Date(p.endsAt).toLocaleDateString('es-CO') : 'sin fin'}</span></span>
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-lg ${p.status === 'finished' ? 'bg-gray-100 text-gray-600' : p.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-rotary-blue'}`}>{meta.pilotStates[p.status] || p.status}</span>
                        </button>
                        {open === p.id && <div className="border-t border-gray-50 p-4"><PilotView id={p.id} onChanged={load} /></div>}
                    </div>
                ))}</div>
            )}
        </div>
    );
}
