import { useCallback, useEffect, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { acApi } from './agentCenterApi';
import type { Installation, Meta, Site, Template } from './agentCenterApi';
import { AgentAvatar, EmptyNote, ErrorNote, SectionHeader, StatePill } from './agentCenterUi';

interface Manager { id: string; name: string | null; email: string; role: string }

function InstallDialog({ meta, onClose, onDone }: { meta: Meta; onClose: () => void; onDone: () => void }) {
    const [templates, setTemplates] = useState<Template[]>([]);
    const [templateId, setTemplateId] = useState('');
    const [scope, setScope] = useState<'site' | 'platform'>('site');
    const [type, setType] = useState('');
    const [q, setQ] = useState('');
    const [sites, setSites] = useState<Site[]>([]);
    const [siteId, setSiteId] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => { acApi<{ templates: Template[] }>('/templates?status=published').then(d => setTemplates(d.templates)).catch(e => setError(e.message)); }, []);
    useEffect(() => {
        if (scope !== 'site') return;
        const t = setTimeout(() => {
            const p = new URLSearchParams(); if (q) p.set('q', q); if (type) p.set('type', type);
            acApi<{ sites: Site[] }>(`/sites?${p.toString()}`).then(d => setSites(d.sites)).catch(e => setError(e.message));
        }, 250);
        return () => clearTimeout(t);
    }, [q, type, scope]);

    const submit = async () => {
        setBusy(true); setError(null);
        try {
            await acApi('/installations', { method: 'POST', body: { templateId, scopeType: scope, siteId: scope === 'site' ? siteId : null, enabled: scope === 'platform' } });
            onDone();
        } catch (e: any) { setError(e.message); } finally { setBusy(false); }
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Instalar un agente">
            <div className="bg-white rounded-3xl w-full max-w-xl p-5 space-y-3 max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center"><p className="font-black text-gray-800">Instalar un agente</p><button type="button" onClick={onClose} aria-label="Cerrar" className="p-1.5 rounded-lg hover:bg-gray-100"><X className="w-5 h-5" /></button></div>
                <ErrorNote message={error} />
                <label htmlFor="inst-tpl" className="block text-xs font-bold text-gray-600">Agente (plantillas publicadas)</label>
                <select id="inst-tpl" className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm" value={templateId} onChange={e => setTemplateId(e.target.value)}>
                    <option value="">Elige un agente…</option>
                    {meta.teams.map(t => (
                        <optgroup key={t.key} label={t.label}>
                            {templates.filter(x => x.team === t.key).map(x => <option key={x.id} value={x.id}>{x.draft.name} — {x.draft.role}</option>)}
                        </optgroup>
                    ))}
                </select>
                <div className="flex gap-2">
                    {(['site', 'platform'] as const).map(s => (
                        <button key={s} type="button" onClick={() => setScope(s)} className={`flex-1 py-2 rounded-xl border text-sm font-bold ${scope === s ? 'bg-blue-50 border-blue-200 text-rotary-blue' : 'border-gray-200 text-gray-500'}`}>{s === 'site' ? 'En un sitio' : 'Administración central'}</button>
                    ))}
                </div>
                {scope === 'site' && (
                    <div className="space-y-2">
                        <div className="flex gap-2">
                            <select id="inst-type" className="px-3 py-2 rounded-xl border border-gray-200 text-sm" value={type} onChange={e => setType(e.target.value)}>
                                <option value="">Todos los tipos</option>
                                {meta.siteTypes.map(s => <option key={s.type} value={s.type}>{s.label}</option>)}
                            </select>
                            <input id="inst-q" className="flex-1 px-3 py-2 rounded-xl border border-gray-200 text-sm" placeholder="Buscar sitio" value={q} onChange={e => setQ(e.target.value)} />
                        </div>
                        <div className="max-h-56 overflow-y-auto border border-gray-100 rounded-xl divide-y divide-gray-50">
                            {sites.map(s => (
                                <label key={s.id} className={`flex items-center gap-2 px-3 py-2 text-sm cursor-pointer ${siteId === s.id ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
                                    <input type="radio" name="inst-site" checked={siteId === s.id} onChange={() => setSiteId(s.id)} />
                                    <span className="flex-1 truncate">{s.name}</span>
                                    <span className="text-[11px] text-gray-400">{meta.siteTypes.find(t => t.type === s.type)?.label || s.type}</span>
                                </label>
                            ))}
                            {sites.length === 0 && <p className="px-3 py-3 text-xs text-gray-400">Sin resultados.</p>}
                        </div>
                    </div>
                )}
                <p className="text-xs text-gray-500">Se instala apagado en los sitios: para encenderlo hay que elegir un responsable del sitio.</p>
                <button type="button" disabled={busy || !templateId || (scope === 'site' && !siteId)} onClick={submit} className="w-full py-2.5 rounded-xl bg-gray-900 text-white text-sm font-bold disabled:opacity-40">Instalar</button>
            </div>
        </div>
    );
}

interface Grant { tool: string; mode: string }

function GrantsEditor({ inst, meta, onError }: { inst: Installation; meta: Meta; onError: (m: string) => void }) {
    const [grants, setGrants] = useState<Grant[] | null>(null);
    useEffect(() => { acApi<{ grants: Grant[] }>(`/installations/${inst.id}/grants`).then(d => setGrants(d.grants)).catch(() => setGrants([])); }, [inst.id]);
    const set = async (tool: string, mode: string) => {
        try { const r = await acApi<{ grants: Grant[] }>(`/installations/${inst.id}/grants`, { method: 'PUT', body: { tool, mode: mode || null } }); setGrants(r.grants); } catch (e: any) { onError(e.message); }
    };
    return (
        <div className="md:col-span-2">
            <p className="text-xs font-bold text-gray-600 mb-1">Herramientas concedidas{meta.scope === 'site' ? <span className="font-normal text-gray-400"> (las concede la administración de la plataforma)</span> : null}</p>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-1.5">
                {meta.tools.map(t => {
                    const g = (grants || []).find(x => x.tool === t.key);
                    return (
                        <label key={t.key} className="flex items-center gap-2 text-xs border border-gray-100 rounded-lg px-2 py-1.5">
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${t.risk === 'N3' ? 'bg-red-50 text-red-700' : t.risk === 'N1' ? 'bg-blue-50 text-blue-700' : 'bg-gray-50 text-gray-500'}`}>{t.risk}</span>
                            <span className="flex-1 min-w-0 truncate" title={t.description}><code>{t.key}</code></span>
                            <select aria-label={`Modo de ${t.key}`} disabled={meta.scope === 'site'} className="px-1.5 py-1 rounded border border-gray-200 text-xs bg-white disabled:bg-gray-50" value={g?.mode || ''} onChange={e => set(t.key, e.target.value)}>
                                <option value="">No concedida</option>
                                {Object.entries(meta.grantModes).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                            </select>
                        </label>
                    );
                })}
            </div>
        </div>
    );
}

interface TaskResult { id: string; status: string; output: { text?: string } | null; lastError: string | null }

function TryAgent({ inst, onError }: { inst: Installation; onError: (m: string) => void }) {
    const [goal, setGoal] = useState('');
    const [busy, setBusy] = useState(false);
    const [res, setRes] = useState<TaskResult | null>(null);
    const run = async () => {
        setBusy(true); setRes(null);
        try { setRes(await acApi<TaskResult>(`/installations/${inst.id}/run`, { method: 'POST', body: { goal } })); } catch (e: any) { onError(e.message); } finally { setBusy(false); }
    };
    return (
        <div className="md:col-span-2 space-y-2">
            <label htmlFor={`try-${inst.id}`} className="block text-xs font-bold text-gray-600">Probar el agente</label>
            <div className="flex gap-2">
                <input id={`try-${inst.id}`} className="flex-1 min-w-0 px-3 py-2 rounded-xl border border-gray-200 text-sm" value={goal} onChange={e => setGoal(e.target.value)} placeholder="Ej.: revisa las inscripciones pendientes del último evento" />
                <button type="button" disabled={busy || goal.trim().length < 5 || !inst.enabled} onClick={run} className="px-3 py-2 rounded-xl bg-gray-900 text-white text-xs font-bold disabled:opacity-40">{busy ? 'Trabajando…' : 'Ejecutar'}</button>
            </div>
            {res && <div className="bg-gray-50 rounded-xl p-3 text-sm"><p className="text-xs text-gray-500 mb-1">Estado: {res.status}{res.lastError ? ` — ${res.lastError}` : ''} · detalle en «Tareas»</p><p className="whitespace-pre-wrap text-gray-800">{res.output?.text || ''}</p></div>}
        </div>
    );
}

function InstallationRow({ inst, meta, onChanged, onError }: { inst: Installation; meta: Meta; onChanged: () => void; onError: (m: string) => void }) {
    const [open, setOpen] = useState(false);
    const [managers, setManagers] = useState<Manager[] | null>(null);
    const [displayName, setDisplayName] = useState(inst.overrides?.displayName || '');
    const [extra, setExtra] = useState(inst.overrides?.extraInstructions || '');
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (!open || inst.scopeType !== 'site' || !inst.siteId || managers) return;
        acApi<{ users: Manager[] }>(`/sites/${inst.siteId}/managers`).then(d => setManagers(d.users)).catch(() => setManagers([]));
    }, [open, inst.scopeType, inst.siteId, managers]);

    const patch = async (body: Record<string, unknown>) => {
        setBusy(true);
        try { await acApi(`/installations/${inst.id}`, { method: 'PATCH', body }); onChanged(); } catch (e: any) { onError(e.message); } finally { setBusy(false); }
    };
    const remove = async () => {
        setBusy(true);
        try { await acApi(`/installations/${inst.id}`, { method: 'DELETE' }); onChanged(); } catch (e: any) { onError(e.message); } finally { setBusy(false); }
    };

    return (
        <div className="bg-white rounded-2xl border border-gray-100">
            <div className="flex flex-wrap items-center gap-3 p-3">
                <AgentAvatar seed={inst.avatarSeed || inst.templateName} color={inst.avatarColor} size={36} />
                <div className="min-w-0 flex-1">
                    <p className="font-bold text-gray-800 text-sm truncate">{inst.overrides?.displayName || inst.templateName}</p>
                    <p className="text-xs text-gray-500 truncate">{inst.scopeType === 'platform' ? 'Administración central' : `${inst.siteName || inst.siteId} · ${meta.siteTypes.find(t => t.type === inst.siteType)?.label || inst.siteType}`}{inst.versionNumber ? ` · v${inst.versionNumber}` : ''}</p>
                </div>
                <StatePill state={inst.state} title={inst.stateReason} />
                <label className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-600">
                    <input type="checkbox" checked={inst.enabled} disabled={busy} onChange={e => patch({ enabled: e.target.checked })} /> Encendido
                </label>
                <button type="button" onClick={() => setOpen(!open)} className="text-xs font-bold text-rotary-blue hover:underline">{open ? 'Cerrar' : 'Ajustes'}</button>
            </div>
            {inst.stateReason && <p className="px-3 pb-2 -mt-1 text-[11px] text-gray-400">{inst.stateReason}</p>}
            {open && (
                <div className="border-t border-gray-50 p-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                    {inst.scopeType === 'site' && (
                        <div>
                            <label htmlFor={`resp-${inst.id}`} className="block text-xs font-bold text-gray-600 mb-1">Responsable del sitio</label>
                            <select id={`resp-${inst.id}`} className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm" value={inst.responsibleUserId || ''} disabled={busy} onChange={e => patch({ responsibleUserId: e.target.value || null })}>
                                <option value="">Sin responsable</option>
                                {(managers || []).map(m => <option key={m.id} value={m.id}>{m.name || m.email} ({m.role})</option>)}
                            </select>
                            {managers && managers.length === 0 && <p className="text-[11px] text-amber-700 mt-1">Este sitio no tiene administradores con cuenta.</p>}
                        </div>
                    )}
                    <div>
                        <label htmlFor={`dn-${inst.id}`} className="block text-xs font-bold text-gray-600 mb-1">Nombre visible en este ámbito</label>
                        <input id={`dn-${inst.id}`} className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm" value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder={inst.templateName} />
                    </div>
                    <div className="md:col-span-2">
                        <label htmlFor={`ex-${inst.id}`} className="block text-xs font-bold text-gray-600 mb-1">Instrucciones adicionales para este ámbito</label>
                        <textarea id={`ex-${inst.id}`} rows={3} className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm" value={extra} onChange={e => setExtra(e.target.value)} placeholder="Ej.: este club se reúne los martes; firma como «Comité de Imagen Pública»." />
                    </div>
                    {meta.scope === 'platform' && <div>
                        <label htmlFor={`bud-${inst.id}`} className="block text-xs font-bold text-gray-600 mb-1">Presupuesto mensual (USD, vacío = sin tope)</label>
                        <input id={`bud-${inst.id}`} type="number" min="0" step="0.5" className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm" defaultValue={inst.budget?.monthlyUsd ?? ''} onBlur={e => patch({ budget: { monthlyUsd: e.target.value === '' ? null : Number(e.target.value) } })} />
                    </div>}
                    <GrantsEditor inst={inst} meta={meta} onError={onError} />
                    <TryAgent inst={inst} onError={onError} />
                    <div className="md:col-span-2 flex flex-wrap gap-2 justify-between">
                        <label className={`inline-flex items-center gap-2 text-xs text-gray-600 ${meta.scope === 'site' ? 'invisible' : ''}`}>
                            <input type="checkbox" checked={Boolean(inst.overrides?.pinned)} disabled={busy} onChange={e => patch({ overrides: { pinned: e.target.checked } })} />
                            Fijar la versión actual (no recibir nuevas publicaciones automáticamente)
                        </label>
                        <div className="flex gap-2">
                            {meta.scope === 'platform' && <button type="button" disabled={busy} onClick={remove} className="px-3 py-2 rounded-xl border border-red-200 text-xs font-bold text-red-600">Retirar instalación</button>}
                            <button type="button" disabled={busy} onClick={() => patch({ overrides: { displayName, extraInstructions: extra } })} className="px-3 py-2 rounded-xl bg-gray-900 text-white text-xs font-bold">Guardar ajustes</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default function InstallationsTab({ meta }: { meta: Meta }) {
    const [rows, setRows] = useState<Installation[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [type, setType] = useState('');
    const [state, setState] = useState('');
    const [q, setQ] = useState('');
    const [showInstall, setShowInstall] = useState(false);

    const load = useCallback(() => {
        const p = new URLSearchParams(); if (type) p.set('siteType', type);
        acApi<{ installations: Installation[] }>(`/installations?${p.toString()}`).then(d => { setRows(d.installations); setError(null); }).catch(e => setError(e.message));
    }, [type]);
    useEffect(load, [load]);

    const shown = (rows || []).filter(r => (!state || r.state === state) && (!q || `${r.templateName} ${r.siteName || ''}`.toLowerCase().includes(q.toLowerCase())));

    return (
        <div className="space-y-4">
            <SectionHeader title="Instalaciones" subtitle="Dónde trabaja cada agente. Una instalación de sitio se enciende cuando tiene responsable y su tipo de sitio está integrado."
                actions={meta.scope === 'platform' ? <button type="button" onClick={() => setShowInstall(true)} className="inline-flex items-center gap-2 bg-gray-900 text-white text-sm font-bold px-4 py-2.5 rounded-xl"><Plus className="w-4 h-4" /> Instalar agente</button> : undefined} />
            <div className="flex flex-wrap gap-2">
                <input id="inst-filter-q" className="flex-1 min-w-[200px] px-3 py-2.5 rounded-xl border border-gray-200 text-sm" placeholder="Buscar agente o sitio" value={q} onChange={e => setQ(e.target.value)} />
                <select id="inst-filter-type" className="px-3 py-2.5 rounded-xl border border-gray-200 text-sm bg-white" value={type} onChange={e => setType(e.target.value)}>
                    <option value="">Todos los tipos de sitio</option>
                    {meta.siteTypes.map(s => <option key={s.type} value={s.type}>{s.label}</option>)}
                </select>
                <select id="inst-filter-state" className="px-3 py-2.5 rounded-xl border border-gray-200 text-sm bg-white" value={state} onChange={e => setState(e.target.value)}>
                    <option value="">Todos los estados</option>
                    {Object.entries(meta.installationStates).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
            </div>
            <ErrorNote message={error} />
            {rows === null ? <div className="text-sm text-gray-400">Cargando…</div> : shown.length === 0 ? <EmptyNote>No hay instalaciones con esos filtros.</EmptyNote> : (
                <div className="space-y-2">
                    <p className="text-xs text-gray-400 tabular-nums">{shown.length} de {rows.length} instalaciones</p>
                    {shown.slice(0, 300).map(i => <InstallationRow key={i.id} inst={i} meta={meta} onChanged={load} onError={setError} />)}
                </div>
            )}
            {showInstall && <InstallDialog meta={meta} onClose={() => setShowInstall(false)} onDone={() => { setShowInstall(false); load(); }} />}
        </div>
    );
}
