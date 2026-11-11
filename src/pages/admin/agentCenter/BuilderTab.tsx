// Constructor visual de workflows (Fase 6, v4.1319) — pasos LINEALES: una
// herramienta de lectura o borrador, un agente instalado, una condición que
// detiene, o una acción N2/N3 que espera aprobación humana. Sin bucles, máximo
// 12 pasos; borrador → versión publicada inmutable; programable por sitio.
import { useCallback, useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowLeft, Play, Plus, Trash2 } from 'lucide-react';
import { acApi } from './agentCenterApi';
import type { Meta } from './agentCenterApi';
import { EmptyNote, ErrorNote, SectionHeader, fmtDate } from './agentCenterUi';
import SitePicker from './SitePicker';

interface Step { type: string; tool?: string; args?: Record<string, string>; templateKey?: string; prompt?: string; path?: string; summary?: string; label?: string }
interface Trigger { kind: 'manual' | 'schedule' | 'event'; cadence?: string; event?: string }
interface CustomWf {
    id: string; name: string; description: string | null; team: string; siteId: string | null; siteName: string | null; status: string;
    publishedVersion: number | null; draft: { trigger?: Trigger; steps?: Step[] }; editable: boolean; updatedAt: string;
    versions?: { version: number; changelog: string | null; publishedAt: string }[]; validation?: { ok: boolean; errors: string[] };
}
interface AgentOption { key: string; name: string }

const CADENCES: Record<string, string> = { 'daily@07:00': 'Todos los días 07:00', 'weekly@1@07:00': 'Cada lunes 07:00', 'weekly@5@16:00': 'Cada viernes 16:00', 'every@240': 'Cada 4 horas' };
const STATUS: Record<string, string> = { draft: 'Borrador', published: 'Publicado', archived: 'Archivado' };

function StepEditor({ step, n, total, meta, agents, onChange, onRemove, onMove }: {
    step: Step; n: number; total: number; meta: Meta; agents: AgentOption[];
    onChange: (s: Step) => void; onRemove: () => void; onMove: (d: -1 | 1) => void;
}) {
    const toolPool = meta.tools.filter(t => (step.type === 'approval' ? ['N2', 'N3'].includes(t.risk) : ['N0', 'N1'].includes(t.risk) && t.key !== 'delegate_task'));
    const tool = meta.tools.find(t => t.key === step.tool);
    const props = tool?.parameters?.properties || {};
    const set = (patch: Partial<Step>) => onChange({ ...step, ...patch });
    return (
        <li className="bg-white rounded-2xl border border-gray-100 p-4 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
                <span className="w-7 h-7 rounded-full bg-gray-900 text-white text-xs font-black flex items-center justify-center shrink-0">{n}</span>
                <select aria-label={`Tipo del paso ${n}`} className="px-2 py-1.5 rounded-lg border border-gray-200 text-sm bg-white" value={step.type} onChange={e => onChange({ type: e.target.value, label: step.label })}>
                    {Object.entries(meta.stepTypes).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
                <input aria-label={`Nombre del paso ${n}`} className="flex-1 min-w-[160px] px-2 py-1.5 rounded-lg border border-gray-200 text-sm" placeholder="Nombre del paso (opcional)" value={step.label || ''} onChange={e => set({ label: e.target.value })} />
                <button type="button" aria-label="Subir" disabled={n === 1} onClick={() => onMove(-1)} className="p-1.5 rounded-lg border border-gray-200 disabled:opacity-30"><ArrowUp className="w-4 h-4" /></button>
                <button type="button" aria-label="Bajar" disabled={n === total} onClick={() => onMove(1)} className="p-1.5 rounded-lg border border-gray-200 disabled:opacity-30"><ArrowDown className="w-4 h-4" /></button>
                <button type="button" aria-label="Quitar el paso" onClick={onRemove} className="p-1.5 rounded-lg border border-gray-200 text-red-600"><Trash2 className="w-4 h-4" /></button>
            </div>
            <p className="text-[11px] text-gray-400">{meta.stepTypes[step.type]?.help}</p>
            {(step.type === 'tool' || step.type === 'approval') && (
                <>
                    <select aria-label={`Herramienta del paso ${n}`} className="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-sm bg-white" value={step.tool || ''} onChange={e => set({ tool: e.target.value, args: {} })}>
                        <option value="">Elige…</option>
                        {toolPool.map(t => <option key={t.key} value={t.key}>{t.key} · {t.risk} — {t.description.slice(0, 80)}</option>)}
                    </select>
                    {Object.entries(props).map(([k, def]) => (
                        <label key={k} className="block text-xs font-bold text-gray-600">{k}{tool?.parameters?.required?.includes(k) ? ' *' : ''}
                            <input className="mt-1 w-full px-2 py-1.5 rounded-lg border border-gray-200 text-sm font-normal" placeholder={def.description || (k === 'content' ? '{{steps.2.text}}' : '')} value={step.args?.[k] || ''} onChange={e => set({ args: { ...(step.args || {}), [k]: e.target.value } })} />
                        </label>
                    ))}
                    {step.type === 'approval' && <input aria-label="Resumen para quien aprueba" className="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-sm" placeholder="Qué verá quien aprueba (p. ej. Publicar el boletín de {{input.mes}})" value={step.summary || ''} onChange={e => set({ summary: e.target.value })} />}
                </>
            )}
            {step.type === 'agent' && (
                <>
                    <select aria-label={`Agente del paso ${n}`} className="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-sm bg-white" value={step.templateKey || ''} onChange={e => set({ templateKey: e.target.value })}>
                        <option value="">Elige un agente publicado…</option>
                        {agents.map(a => <option key={a.key} value={a.key}>{a.name}</option>)}
                    </select>
                    <textarea aria-label={`Instrucción del paso ${n}`} rows={3} className="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-sm" placeholder="Qué debe hacer, con los datos de pasos anteriores: {{steps.1.findings}}" value={step.prompt || ''} onChange={e => set({ prompt: e.target.value })} />
                </>
            )}
            {step.type === 'stop_if_empty' && <input aria-label={`Valor que mira el paso ${n}`} className="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-sm" placeholder="steps.1.findings" value={step.path || ''} onChange={e => set({ path: e.target.value })} />}
        </li>
    );
}

function Editor({ id, meta, agents, onBack }: { id: string; meta: Meta; agents: AgentOption[]; onBack: () => void }) {
    const [wf, setWf] = useState<CustomWf | null>(null);
    const [steps, setSteps] = useState<Step[]>([]);
    const [trigger, setTrigger] = useState<Trigger>({ kind: 'manual' });
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [team, setTeam] = useState('direccion');
    const [changelog, setChangelog] = useState('');
    const [runSite, setRunSite] = useState('');
    const [inputText, setInputText] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const apply = (w: CustomWf) => { setWf(w); setSteps(w.draft?.steps || []); setTrigger(w.draft?.trigger || { kind: 'manual' }); setName(w.name); setDescription(w.description || ''); setTeam(w.team); };
    useEffect(() => { acApi<CustomWf>(`/custom-workflows/${id}`).then(apply).catch(e => setError(e.message)); }, [id]);
    const act = async (fn: () => Promise<string>) => { setBusy(true); setError(null); setNotice(null); try { setNotice(await fn()); } catch (e: any) { setError(e.message); } finally { setBusy(false); } };
    const save = () => act(async () => { const w = await acApi<CustomWf>(`/custom-workflows/${id}`, { method: 'PUT', body: { name, description, team, draft: { trigger, steps } } }); apply(w); return w.validation?.ok ? 'Borrador guardado: listo para publicar.' : 'Borrador guardado, con observaciones.'; });
    const publish = () => act(async () => { await acApi(`/custom-workflows/${id}`, { method: 'PUT', body: { name, description, team, draft: { trigger, steps } } }); const w = await acApi<CustomWf & { schedule?: { id: string } | null }>(`/custom-workflows/${id}/publish`, { method: 'POST', body: { changelog } }); apply(w); setChangelog(''); return `Versión ${w.publishedVersion} publicada${w.schedule ? ' y programada en su sitio' : ''}.`; });
    const archive = () => act(async () => { const r = await acApi<{ schedulesDisabled: number }>(`/custom-workflows/${id}`, { method: 'DELETE' }); onBack(); return `Archivado (${r.schedulesDisabled} programaciones apagadas).`; });
    const run = () => act(async () => {
        const input = Object.fromEntries(inputText.split('\n').map(l => l.split('=')).filter(p => p.length >= 2 && p[0].trim()).map(([k, ...v]) => [k.trim(), v.join('=').trim()]));
        const siteId = wf?.siteId || (meta.scope === 'site' ? meta.siteId : runSite);
        const r = await acApi<{ run: { status: string; report?: { stoppedAt?: number | null } } }>('/workflow-runs', { method: 'POST', body: { workflowKey: `custom:${id}`, siteId, input } });
        return r.run.report?.stoppedAt ? `Ejecutado: se detuvo en el paso ${r.run.report.stoppedAt} (condición). El informe está en «Workflows».` : 'Ejecutado: el informe está en «Workflows».';
    });
    const schedule = (cadence: string) => act(async () => { await acApi('/schedules', { method: 'POST', body: { workflowKey: `custom:${id}`, siteId: meta.scope === 'site' ? meta.siteId : runSite, cadence, input: {} } }); return 'Programación creada (se ve en «Workflows»).'; });
    const move = (i: number, d: -1 | 1) => setSteps(prev => { const a = [...prev]; const j = i + d; [a[i], a[j]] = [a[j], a[i]]; return a; });
    if (!wf) return <div className="text-sm text-gray-400">{error || 'Cargando…'}</div>;
    const ro = !wf.editable;
    return (
        <div className="space-y-4">
            <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-sm font-bold text-rotary-blue"><ArrowLeft className="w-4 h-4" /> Todos los workflows</button>
            <ErrorNote message={error} />
            {notice && <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm rounded-xl px-4 py-2.5">{notice}</div>}
            {ro && <div className="bg-blue-50 border border-blue-100 text-rotary-blue text-sm rounded-xl px-4 py-2.5">Workflow compartido por la plataforma: puedes ejecutarlo y programarlo en tu sitio, no editarlo.</div>}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">
                <div className="xl:col-span-2 space-y-3">
                    <fieldset disabled={ro} className="bg-white rounded-2xl border border-gray-100 p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
                        <label className="text-xs font-bold text-gray-600 md:col-span-2">Nombre<input className="mt-1 w-full px-2 py-1.5 rounded-lg border border-gray-200 text-sm font-normal" value={name} onChange={e => setName(e.target.value)} /></label>
                        <label className="text-xs font-bold text-gray-600">Equipo<select className="mt-1 w-full px-2 py-1.5 rounded-lg border border-gray-200 text-sm font-normal bg-white" value={team} onChange={e => setTeam(e.target.value)}>{meta.teams.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}</select></label>
                        <label className="text-xs font-bold text-gray-600 md:col-span-3">Descripción<input className="mt-1 w-full px-2 py-1.5 rounded-lg border border-gray-200 text-sm font-normal" value={description} onChange={e => setDescription(e.target.value)} /></label>
                        <div className="md:col-span-3 flex flex-wrap items-center gap-2 text-sm">
                            <span className="text-xs font-bold text-gray-600">Disparo</span>
                            <select aria-label="Disparo" className="px-2 py-1.5 rounded-lg border border-gray-200 text-sm bg-white" value={trigger.kind} onChange={e => setTrigger({ kind: e.target.value as Trigger['kind'] })}>
                                <option value="manual">Manual</option><option value="schedule">Programado</option><option value="event">Cuando ocurre un evento</option>
                            </select>
                            {trigger.kind === 'schedule' && <select aria-label="Cadencia" className="px-2 py-1.5 rounded-lg border border-gray-200 text-sm bg-white" value={trigger.cadence || ''} onChange={e => setTrigger({ kind: 'schedule', cadence: e.target.value })}><option value="">Elige…</option>{Object.entries(CADENCES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>}
                            {trigger.kind === 'event' && <select aria-label="Evento" className="px-2 py-1.5 rounded-lg border border-gray-200 text-sm bg-white" value={trigger.event || ''} onChange={e => setTrigger({ kind: 'event', event: e.target.value })}><option value="">Elige…</option>{Object.entries(meta.eventTypes).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>}
                            {trigger.kind !== 'manual' && !wf.siteId && <span className="text-[11px] text-gray-400">Compartido: cada sitio lo programa desde aquí.</span>}
                        </div>
                    </fieldset>
                    <fieldset disabled={ro}>
                        <ol className="space-y-2">{steps.map((s, i) => (
                            <StepEditor key={i} step={s} n={i + 1} total={steps.length} meta={meta} agents={agents}
                                onChange={(ns) => setSteps(prev => prev.map((x, j) => (j === i ? ns : x)))}
                                onRemove={() => setSteps(prev => prev.filter((_, j) => j !== i))} onMove={(d) => move(i, d)} />
                        ))}</ol>
                        {!ro && steps.length < meta.maxSteps && (
                            <div className="flex flex-wrap gap-2 mt-2">{Object.entries(meta.stepTypes).map(([k, v]) => (
                                <button key={k} type="button" onClick={() => setSteps(prev => [...prev, { type: k }])} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-dashed border-gray-300 text-xs font-bold text-gray-600 hover:border-gray-400"><Plus className="w-3.5 h-3.5" /> {v.label}</button>
                            ))}</div>
                        )}
                        <p className="text-[11px] text-gray-400 mt-2">Máximo {meta.maxSteps} pasos, en orden, sin bucles. Un paso usa lo anterior con {'{{steps.N.campo}}'} y la entrada con {'{{input.campo}}'}. El sitio nunca lo elige un paso: es el de la ejecución.</p>
                    </fieldset>
                </div>
                <div className="space-y-3">
                    <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-2 text-sm">
                        <p className="font-black text-gray-800">{STATUS[wf.status] || wf.status}{wf.publishedVersion ? ` · v${wf.publishedVersion}` : ''}</p>
                        <p className="text-xs text-gray-500">{wf.siteId ? `Sólo para ${wf.siteName || 'su sitio'}` : 'Compartido con todos los sitios'}</p>
                        {wf.validation && (wf.validation.ok ? <p className="text-xs text-emerald-700">El borrador guardado es válido.</p> : <ul className="text-xs text-red-700 list-disc pl-4">{wf.validation.errors.map(e => <li key={e}>{e}</li>)}</ul>)}
                        {!ro && (
                            <>
                                <button type="button" disabled={busy} onClick={save} className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm font-bold">Guardar borrador</button>
                                <input aria-label="Cambios de esta versión" className="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-sm" placeholder="Qué cambia en esta versión" value={changelog} onChange={e => setChangelog(e.target.value)} />
                                <button type="button" disabled={busy} onClick={publish} className="w-full px-3 py-2 rounded-xl bg-gray-900 text-white text-sm font-bold">Publicar versión</button>
                            </>
                        )}
                        {(wf.versions || []).length > 0 && <ul className="text-[11px] text-gray-500 space-y-0.5 pt-1">{wf.versions!.map(v => <li key={v.version}>v{v.version} · {fmtDate(v.publishedAt)}{v.changelog ? ` — ${v.changelog}` : ''}</li>)}</ul>}
                    </div>
                    {wf.publishedVersion && (
                        <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-2">
                            <p className="font-black text-gray-800">Ejecutar la versión publicada</p>
                            {!wf.siteId && meta.scope === 'platform' && <SitePicker meta={meta} value={runSite} onChange={id2 => setRunSite(id2)} idPrefix={`cw-${id}`} />}
                            <textarea aria-label="Entrada" rows={2} className="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-xs font-mono" placeholder={'Entrada opcional, una por línea:\nmes=noviembre'} value={inputText} onChange={e => setInputText(e.target.value)} />
                            <button type="button" disabled={busy || (!wf.siteId && meta.scope === 'platform' && !runSite)} onClick={run} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gray-900 text-white text-sm font-bold disabled:opacity-40"><Play className="w-4 h-4" /> Ejecutar ahora</button>
                            {!wf.siteId && (
                                <div className="flex flex-wrap gap-1.5 pt-1">{Object.entries(CADENCES).map(([k, l]) => <button key={k} type="button" disabled={busy || (meta.scope === 'platform' && !runSite)} onClick={() => schedule(k)} className="px-2 py-1 rounded-lg border border-gray-200 text-[11px] font-bold disabled:opacity-40">Programar: {l}</button>)}</div>
                            )}
                        </div>
                    )}
                    {!ro && <button type="button" disabled={busy} onClick={archive} className="text-xs font-bold text-red-600">Archivar este workflow</button>}
                </div>
            </div>
        </div>
    );
}

export default function BuilderTab({ meta }: { meta: Meta }) {
    const [list, setList] = useState<CustomWf[] | null>(null);
    const [agents, setAgents] = useState<AgentOption[]>([]);
    const [open, setOpen] = useState<string | null>(null);
    const [name, setName] = useState('');
    const [shared, setShared] = useState(true);
    const [siteId, setSiteId] = useState('');
    const [error, setError] = useState<string | null>(null);
    const load = useCallback(() => { acApi<{ workflows: CustomWf[] }>('/custom-workflows').then(d => setList(d.workflows)).catch(e => setError(e.message)); }, []);
    useEffect(() => {
        load();
        // Los agentes elegibles: la plataforma ve las plantillas publicadas; un sitio, lo que tiene instalado.
        if (meta.scope === 'platform') acApi<{ templates: { key: string; draft: { name?: string } }[] }>('/templates?status=published').then(d => setAgents(d.templates.map(t => ({ key: t.key, name: t.draft?.name || t.key })))).catch(() => setAgents([]));
        else acApi<{ installations: { templateKey: string; templateName: string }[] }>('/installations').then(d => setAgents([...new Map(d.installations.map(i => [i.templateKey, { key: i.templateKey, name: i.templateName }])).values()])).catch(() => setAgents([]));
    }, [load, meta.scope]);
    const create = async () => {
        try {
            const w = await acApi<CustomWf>('/custom-workflows', { method: 'POST', body: { name, team: 'direccion', siteId: meta.scope === 'platform' && !shared ? siteId : undefined, draft: { trigger: { kind: 'manual' }, steps: [{ type: 'tool', tool: 'site_context', label: 'Contexto del sitio' }] } } });
            setName(''); setOpen(w.id); load();
        } catch (e: any) { setError(e.message); }
    };
    if (open) return <Editor id={open} meta={meta} agents={agents} onBack={() => { setOpen(null); load(); }} />;
    return (
        <div className="space-y-5">
            <SectionHeader title="Constructor de workflows" subtitle="Arma tus propios workflows con pasos en orden: leer datos, pedirle algo a un agente, detenerse si no hay nada que hacer y proponer acciones que una persona aprueba. Cada publicación es una versión que no cambia; se ejecutan, programan y miden igual que los del catálogo." />
            <ErrorNote message={error} />
            <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-2">
                <p className="font-black text-gray-800">Nuevo workflow</p>
                <div className="flex flex-wrap gap-2 items-center">
                    <input aria-label="Nombre del workflow" className="flex-1 min-w-[220px] px-3 py-2 rounded-xl border border-gray-200 text-sm" placeholder="Boletín mensual de membresía" value={name} onChange={e => setName(e.target.value)} />
                    {meta.scope === 'platform' && <label className="inline-flex items-center gap-1.5 text-sm"><input type="checkbox" checked={shared} onChange={e => setShared(e.target.checked)} /> Compartido con todos los sitios</label>}
                    <button type="button" disabled={name.trim().length < 3 || (meta.scope === 'platform' && !shared && !siteId)} onClick={create} className="px-4 py-2 rounded-xl bg-gray-900 text-white text-sm font-bold disabled:opacity-40">Crear</button>
                </div>
                {meta.scope === 'platform' && !shared && <SitePicker meta={meta} value={siteId} onChange={id => setSiteId(id)} idPrefix="cw-new" />}
            </div>
            {list === null ? <div className="text-sm text-gray-400">Cargando…</div> : list.length === 0 ? <EmptyNote>Todavía no hay workflows propios.</EmptyNote> : (
                <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-3">{list.map(w => (
                    <button key={w.id} type="button" onClick={() => setOpen(w.id)} className="text-left bg-white rounded-2xl border border-gray-100 p-4 hover:border-gray-200 min-w-0">
                        <p className="font-black text-gray-800 truncate">{w.name}</p>
                        <p className="text-xs text-gray-500">{STATUS[w.status] || w.status}{w.publishedVersion ? ` · v${w.publishedVersion}` : ''} · {(w.draft?.steps || []).length} pasos · {meta.teams.find(t => t.key === w.team)?.short}</p>
                        <p className="text-[11px] text-gray-400">{w.siteId ? (w.siteName || 'Un sitio') : 'Compartido'}{w.editable ? '' : ' · sólo lectura'} · {fmtDate(w.updatedAt)}</p>
                    </button>
                ))}</div>
            )}
        </div>
    );
}
