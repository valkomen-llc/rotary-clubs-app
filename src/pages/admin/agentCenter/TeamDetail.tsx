// ════════════════════════════════════════════════════════════════════
// Centro de Equipos de IA — la vista de un equipo (v4.1331.0)
//
// /admin/agentes?s=resumen&team=<clave>
// Encabezado, indicadores, responsabilidades y límites, con qué trabaja en la
// Dirección IA y el REGISTRO PAGINADO de sus agentes. No es un segundo
// registro: «Ver detalles» abre la misma ficha (TemplateEditor), «Instalar»
// usa POST /installations, «Asignar tarea» usa POST /installations/:id/run y
// «Configurar» lleva a Instalaciones. El servidor decide qué ve cada alcance.
// Cada componente vive a nivel de módulo (nunca dentro de otro).
// ════════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, BrainCircuit, ChevronLeft, ChevronRight, Play, Search, Settings2, UserPlus, X } from 'lucide-react';
import { acApi } from './agentCenterApi';
import type { Meta, Site, TeamAgent, TeamAgentInstallation, TeamDetailData, Template } from './agentCenterApi';
import { AgentAvatar, EmptyNote, ErrorNote, Kpi, StatePill, TemplateStatusPill, fmtDate } from './agentCenterUi';
import { TeamIcon, TeamStatusPill } from './TeamCards';
import TemplateEditor from './TemplateEditor';
import SitePicker from './SitePicker';

type Navigate = (s: string, extra?: Record<string, string | null>) => void;

const btn = 'inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-700 hover:border-blue-200 hover:text-rotary-blue disabled:opacity-40 disabled:hover:text-gray-700';
const btnPrimary = 'inline-flex items-center gap-1.5 text-sm font-bold px-3.5 py-2 rounded-xl bg-gray-900 text-white hover:bg-black disabled:opacity-40';
const inputCls = 'w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200';
const OPERATIVE = ['active', 'running'];

interface TaskResult { id: string; status: string; output: { text?: string } | null; lastError: string | null }

// ── Asignar una tarea a una instalación (el mismo endpoint de «Probar el agente») ──
function AssignTask({ inst, onError, onNavigate }: { inst: TeamAgentInstallation; onError: (m: string) => void; onNavigate: Navigate }) {
    const [goal, setGoal] = useState('');
    const [busy, setBusy] = useState(false);
    const [res, setRes] = useState<TaskResult | null>(null);
    const run = async () => {
        setBusy(true); setRes(null);
        try { setRes(await acApi<TaskResult>(`/installations/${inst.id}/run`, { method: 'POST', body: { goal } })); } catch (e) { onError((e as Error).message); } finally { setBusy(false); }
    };
    return (
        <div className="space-y-2 mt-2">
            <label htmlFor={`assign-${inst.id}`} className="block text-xs font-bold text-gray-600">Asignar una tarea</label>
            <div className="flex flex-col sm:flex-row gap-2">
                <input id={`assign-${inst.id}`} className={inputCls} value={goal} onChange={e => setGoal(e.target.value)} placeholder="Ej.: identifica las inscripciones sin comprobante del último evento" />
                <button type="button" disabled={busy || goal.trim().length < 5} onClick={run} className={btnPrimary}><Play className="w-4 h-4" />{busy ? 'Trabajando…' : 'Asignar'}</button>
            </div>
            <p className="text-[11px] text-gray-400">La tarea se ejecuta con las herramientas concedidas a esta instalación; lo que proponga con efecto externo espera aprobación.</p>
            {res && (
                <div className="bg-gray-50 rounded-xl p-3 text-sm">
                    <p className="text-xs text-gray-500 mb-1">Estado: {res.status}{res.lastError ? ` — ${res.lastError}` : ''} · <button type="button" className="font-bold text-rotary-blue" onClick={() => onNavigate('tareas')}>Ver en Tareas</button></p>
                    <p className="whitespace-pre-wrap text-gray-800">{res.output?.text || ''}</p>
                </div>
            )}
        </div>
    );
}

// ── Instalar (sólo la plataforma: POST /installations) ──
function InstallPanel({ meta, agent, onDone, onError }: { meta: Meta; agent: TeamAgent; onDone: () => void; onError: (m: string) => void }) {
    const [siteId, setSiteId] = useState('');
    const [busy, setBusy] = useState(false);
    const install = async (scopeType: 'site' | 'platform') => {
        setBusy(true);
        try {
            await acApi('/installations', { method: 'POST', body: { templateId: agent.id, scopeType, siteId: scopeType === 'site' ? siteId : null, enabled: scopeType === 'platform' } });
            onDone();
        } catch (e) { onError((e as Error).message); } finally { setBusy(false); }
    };
    return (
        <div className="border border-gray-100 rounded-xl p-3 space-y-2 mt-2">
            <p className="text-xs font-bold text-gray-600">Instalar «{agent.name}»</p>
            <SitePicker meta={meta} value={siteId} idPrefix={`team-install-${agent.id}`} onChange={(id: string, _s: Site | null) => setSiteId(id)} />
            <div className="flex flex-wrap gap-2">
                <button type="button" className={btnPrimary} disabled={busy || !siteId} onClick={() => install('site')}>Instalar en el sitio elegido</button>
                {agent.level !== 'site' && <button type="button" className={btn} disabled={busy} onClick={() => install('platform')}>En la administración central</button>}
            </div>
            <p className="text-[11px] text-gray-400">Llega apagado a un sitio: el sitio elige su responsable y lo enciende. Se aplican las mismas reglas de siempre (tipo de sitio, equipo principal, nivel).</p>
        </div>
    );
}

// ── Una fila del registro del equipo ──
function AgentRow({ agent, data, meta, platform, onOpen, onReload, onError, onNavigate, onRemove }: {
    agent: TeamAgent; data: TeamDetailData; meta: Meta; platform: boolean; onOpen: (id: string) => void; onReload: () => void;
    onError: (m: string) => void; onNavigate: Navigate; onRemove: (id: string) => void;
}) {
    const [panel, setPanel] = useState<'' | 'details' | 'installs' | 'install' | 'task'>('');
    const teamLabel = (k: string) => meta.teams.find(t => t.key === k)?.label || k;
    const own = agent.installations.find(i => OPERATIVE.includes(i.state)) || null;
    const toggle = (p: typeof panel) => setPanel(cur => (cur === p ? '' : p));
    return (
        <div className="bg-white rounded-2xl border border-gray-100 p-4 min-w-0">
            <div className="flex gap-3 min-w-0">
                <AgentAvatar seed={agent.avatarSeed || agent.name} color={agent.avatarColor} size={44} />
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-black text-gray-800 truncate">{agent.emoji ? `${agent.emoji} ` : ''}{agent.name}</span>
                        <StatePill state={agent.state} title={agent.installations[0]?.stateReason || ''} />
                        {platform && agent.status !== 'published' && <TemplateStatusPill status={agent.status} />}
                    </div>
                    <p className="text-xs text-gray-600 mt-0.5 line-clamp-2"><span className="font-semibold">Especialidad:</span> {agent.role || '—'}</p>
                    {agent.description && <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{agent.description}</p>}
                    <div className="flex flex-wrap gap-1 mt-2">
                        {agent.divisionLabel && <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500 bg-gray-50 border border-gray-100 px-1.5 py-0.5 rounded" title="Categoría original del catálogo">{agent.divisionLabel}</span>}
                        {agent.membership && <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${agent.membership === 'primary' ? 'bg-blue-50 text-rotary-blue border-blue-100' : 'bg-orange-50 text-orange-700 border-orange-100'}`}>{data.membershipKinds[agent.membership]}</span>}
                        {agent.primaryTeam !== data.team.key && <span className="text-[10px] font-semibold text-gray-500 px-1.5 py-0.5">Principal: {teamLabel(agent.primaryTeam)}</span>}
                        {agent.teams.filter(k => k !== data.team.key && k !== agent.primaryTeam).map(k => <span key={k} className="text-[10px] font-semibold text-gray-400 px-1.5 py-0.5">También: {teamLabel(k)}</span>)}
                    </div>
                    <p className="text-[11px] text-gray-400 mt-1.5 tabular-nums">
                        {platform ? `${agent.installCount} ${agent.installCount === 1 ? 'instalación' : 'instalaciones'}` : (agent.installCount ? 'Instalado en tu sitio' : 'Disponible para tu organización')}
                        {' · '}Herramientas: {agent.tools.length ? agent.tools.slice(0, 5).join(', ') + (agent.tools.length > 5 ? '…' : '') : 'ninguna autorizada'}
                        {' · '}Última ejecución: {agent.lastRun ? `${fmtDate(agent.lastRun.at)} (${agent.lastRun.status})` : '—'}
                    </p>
                </div>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-3">
                {platform
                    ? <button type="button" className={btn} onClick={() => onOpen(agent.id)}>Ver detalles</button>
                    : <button type="button" className={btn} onClick={() => toggle('details')} aria-expanded={panel === 'details'}>Ver detalles</button>}
                {agent.installCount > 0 && <button type="button" className={btn} onClick={() => toggle('installs')} aria-expanded={panel === 'installs'}>{platform ? 'Ver instalaciones' : 'Ver instalación'}</button>}
                {platform && agent.status === 'published' && agent.level !== 'platform' && <button type="button" className={btn} onClick={() => toggle('install')} aria-expanded={panel === 'install'}>Instalar</button>}
                {platform && <button type="button" className={btn} onClick={() => onOpen(agent.id)}>Configurar</button>}
                {!platform && agent.installCount > 0 && <button type="button" className={btn} onClick={() => onNavigate('instalaciones')}>Configurar</button>}
                {!platform && own && <button type="button" className={btn} onClick={() => toggle('task')} aria-expanded={panel === 'task'}>Asignar tarea</button>}
                {agent.installCount > 0 && <button type="button" className={btn} onClick={() => onNavigate('tareas')}>Ver ejecuciones</button>}
                {platform && agent.membership === 'manual' && <button type="button" className={`${btn} text-red-600`} onClick={() => onRemove(agent.id)}>Quitar del equipo</button>}
            </div>
            {panel === 'details' && (
                <div className="mt-3 bg-gray-50 rounded-xl p-3 text-sm text-gray-700 space-y-1">
                    <p>{agent.description || agent.role}</p>
                    <p className="text-xs text-gray-500">Equipo principal: {teamLabel(agent.primaryTeam)}{agent.teams.length > 1 ? ` · Colabora con: ${agent.teams.filter(k => k !== agent.primaryTeam).map(teamLabel).join(', ')}` : ''}</p>
                    {agent.installations[0] && <p className="text-xs text-gray-500">Estado en tu sitio: {meta.installationStates[agent.installations[0].state]?.label || agent.installations[0].state}{agent.installations[0].stateReason ? ` — ${agent.installations[0].stateReason}` : ''}</p>}
                    {!agent.installCount && <p className="text-xs text-gray-500">No está instalado en tu sitio. La administración de la plataforma lo instala; después eliges su responsable y lo enciendes.</p>}
                </div>
            )}
            {panel === 'installs' && (
                <ul className="mt-3 divide-y divide-gray-50 border border-gray-100 rounded-xl">
                    {agent.installations.map(i => (
                        <li key={i.id} className="px-3 py-2 text-sm">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="font-semibold text-gray-700 truncate">{i.scopeType === 'platform' ? 'Administración central' : (i.siteName || i.siteId)}</span>
                                <span className="flex items-center gap-2">
                                    <StatePill state={i.state} title={i.stateReason} />
                                    <span className="text-[11px] text-gray-400">{i.toolCount} herramientas · {i.lastRunAt ? fmtDate(i.lastRunAt) : 'sin ejecuciones'}</span>
                                </span>
                            </div>
                            {i.stateReason && <p className="text-[11px] text-gray-400 mt-0.5">{i.stateReason}</p>}
                            {platform && OPERATIVE.includes(i.state) && <AssignTask inst={i} onError={onError} onNavigate={onNavigate} />}
                        </li>
                    ))}
                    {agent.moreInstallations > 0 && <li className="px-3 py-2 text-xs text-gray-400">y {agent.moreInstallations} más: ver «Instalaciones».</li>}
                </ul>
            )}
            {panel === 'install' && <InstallPanel meta={meta} agent={agent} onError={onError} onDone={() => { setPanel(''); onReload(); }} />}
            {panel === 'task' && own && <AssignTask inst={own} onError={onError} onNavigate={onNavigate} />}
        </div>
    );
}

// ── Configurar el equipo (sólo la plataforma) ──
interface ConfigForm { label: string; summary: string; icon: string; sortOrder: number; visible: boolean; responsibilities: string; divisions: string[] }

function TeamConfigPanel({ data, onClose, onSaved }: { data: TeamDetailData; onClose: () => void; onSaved: () => void }) {
    const t = data.team;
    const [form, setForm] = useState<ConfigForm>({ label: t.label, summary: t.summary, icon: t.icon, sortOrder: t.sortOrder, visible: t.visible, responsibilities: t.responsibilities.join('\n'), divisions: [...t.divisions] });
    const [q, setQ] = useState('');
    const [found, setFound] = useState<Template[]>([]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);

    useEffect(() => {
        if (q.trim().length < 2) { setFound([]); return; }
        const h = setTimeout(() => {
            acApi<{ templates: Template[] }>(`/templates?q=${encodeURIComponent(q.trim())}&status=published`).then(d => setFound(d.templates.slice(0, 20))).catch(() => setFound([]));
        }, 250);
        return () => clearTimeout(h);
    }, [q]);

    const save = async () => {
        setBusy(true); setError(null); setNotice(null);
        try {
            await acApi(`/teams/${t.key}`, { method: 'PUT', body: { ...form, sortOrder: Number(form.sortOrder), responsibilities: form.responsibilities } });
            setNotice('Equipo guardado.');
            onSaved();
        } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
    };
    const associate = async (id: string) => {
        setError(null); setNotice(null);
        try {
            const r = await acApi<{ added: number; alreadyPrimary: number }>(`/teams/${t.key}/members`, { method: 'POST', body: { add: [id] } });
            setNotice(r.added ? 'Agente asociado al equipo (sin copiarlo).' : r.alreadyPrimary ? 'Ese agente ya tiene este equipo como principal.' : 'Ya estaba asociado.');
            onSaved();
        } catch (e) { setError((e as Error).message); }
    };
    const toggleDivision = (d: string) => setForm(f => ({ ...f, divisions: f.divisions.includes(d) ? f.divisions.filter(x => x !== d) : [...f.divisions, d] }));

    return (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40" role="dialog" aria-modal="true" aria-label={`Configurar el equipo ${t.label}`}>
            <div className="w-full max-w-xl h-full bg-gray-50 overflow-y-auto shadow-2xl">
                <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-5 py-4 flex items-center gap-3">
                    <TeamIcon icon={form.icon} />
                    <p className="font-black text-gray-800 flex-1 truncate">Configurar «{t.label}»</p>
                    <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100" aria-label="Cerrar"><X className="w-5 h-5" /></button>
                </div>
                <div className="p-5 space-y-4">
                    <ErrorNote message={error} />
                    {notice && <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm rounded-xl px-4 py-2.5">{notice}</div>}
                    <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
                        <div><label htmlFor="team-cfg-label" className="block text-xs font-bold text-gray-600 mb-1">Nombre</label><input id="team-cfg-label" className={inputCls} value={form.label} maxLength={60} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} /></div>
                        <div><label htmlFor="team-cfg-summary" className="block text-xs font-bold text-gray-600 mb-1">Descripción</label><input id="team-cfg-summary" className={inputCls} value={form.summary} maxLength={240} onChange={e => setForm(f => ({ ...f, summary: e.target.value }))} /></div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label htmlFor="team-cfg-icon" className="block text-xs font-bold text-gray-600 mb-1">Ícono</label>
                                <select id="team-cfg-icon" className={`${inputCls} bg-white`} value={form.icon} onChange={e => setForm(f => ({ ...f, icon: e.target.value }))}>
                                    {Object.entries(data.icons).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                                </select>
                            </div>
                            <div><label htmlFor="team-cfg-order" className="block text-xs font-bold text-gray-600 mb-1">Orden de presentación</label><input id="team-cfg-order" type="number" min={0} max={99} className={inputCls} value={form.sortOrder} onChange={e => setForm(f => ({ ...f, sortOrder: Number(e.target.value) }))} /></div>
                        </div>
                        <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={form.visible} onChange={e => setForm(f => ({ ...f, visible: e.target.checked }))} />Visible para los administradores de los sitios</label>
                        <div><label htmlFor="team-cfg-resp" className="block text-xs font-bold text-gray-600 mb-1">Responsabilidades (una por línea)</label><textarea id="team-cfg-resp" rows={6} className={inputCls} value={form.responsibilities} onChange={e => setForm(f => ({ ...f, responsibilities: e.target.value }))} /></div>
                        <div>
                            <p className="text-xs font-bold text-gray-600 mb-1">Categorías asociadas</p>
                            <p className="text-[11px] text-gray-400 mb-2">Los agentes de estas categorías del catálogo también colaboran con este equipo, sin copiarse ni cambiar su equipo principal. De origen: {t.originDivisions.map(d => data.divisions[d] || d).join(', ') || 'ninguna'}.</p>
                            <div className="flex flex-wrap gap-1.5">
                                {Object.entries(data.divisions).filter(([d]) => !t.originDivisions.includes(d)).map(([d, label]) => (
                                    <label key={d} className={`text-xs px-2 py-1 rounded-lg border cursor-pointer ${form.divisions.includes(d) ? 'bg-blue-50 border-blue-200 text-rotary-blue' : 'bg-white border-gray-200 text-gray-600'}`}>
                                        <input type="checkbox" className="sr-only" checked={form.divisions.includes(d)} onChange={() => toggleDivision(d)} />{label}
                                    </label>
                                ))}
                            </div>
                        </div>
                        <div className="flex justify-end"><button type="button" className={btnPrimary} disabled={busy} onClick={save}>{busy ? 'Guardando…' : 'Guardar equipo'}</button></div>
                    </div>
                    <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-2">
                        <p className="text-sm font-black text-gray-800">Asociar agentes</p>
                        <p className="text-[11px] text-gray-400">Un agente puede colaborar con varios equipos sin duplicarse. Asociarlo NO le da permisos: su instalación sigue sujeta a la política de su equipo principal y a sus herramientas concedidas.</p>
                        <label htmlFor="team-cfg-search" className="sr-only">Buscar agentes</label>
                        <input id="team-cfg-search" className={inputCls} value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar en el catálogo por nombre o rol" />
                        <ul className="divide-y divide-gray-50">
                            {found.map(tp => (
                                <li key={tp.id} className="py-2 flex items-center gap-2 text-sm">
                                    <span className="flex-1 min-w-0 truncate">{tp.draft.name} <span className="text-xs text-gray-400">· {tp.team}</span></span>
                                    <button type="button" className={btn} onClick={() => associate(tp.id)} disabled={tp.team === t.key}><UserPlus className="w-3.5 h-3.5" />{tp.team === t.key ? 'Principal' : 'Asociar'}</button>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function TeamDetail({ meta, teamKey, onBack, onNavigate }: { meta: Meta; teamKey: string; onBack: () => void; onNavigate: Navigate }) {
    const platform = meta.scope === 'platform';
    const [data, setData] = useState<TeamDetailData | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [page, setPage] = useState(1);
    const [q, setQ] = useState('');
    const [view, setView] = useState('all');
    const [openId, setOpenId] = useState<string | null>(null);
    const [config, setConfig] = useState(false);

    const load = useCallback(() => {
        const p = new URLSearchParams({ page: String(page), pageSize: '24', view });
        if (q.trim()) p.set('q', q.trim());
        acApi<TeamDetailData>(`/teams/${encodeURIComponent(teamKey)}?${p.toString()}`)
            .then(d => { setData(d); setError(null); })
            .catch(e => setError(e.message));
    }, [teamKey, page, q, view]);

    useEffect(() => { const h = setTimeout(load, q ? 250 : 0); return () => clearTimeout(h); }, [load, q]);
    useEffect(() => { setPage(1); }, [q, view, teamKey]);

    const remove = async (id: string) => {
        if (!window.confirm('¿Quitar este agente del equipo? No se borra: sigue en su equipo principal y en sus instalaciones.')) return;
        try { await acApi(`/teams/${teamKey}/members`, { method: 'POST', body: { remove: [id] } }); load(); } catch (e) { setError((e as Error).message); }
    };

    const t = data?.team;
    const c = data?.counts;
    const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

    return (
        <div className="space-y-5">
            <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-500 hover:text-rotary-blue"><ArrowLeft className="w-4 h-4" />Resumen · Equipos de agentes</button>
            <ErrorNote message={error} />
            {!data || !t ? (!error && <div className="text-sm text-gray-400">Cargando el equipo…</div>) : (
                <>
                    <div className="bg-white rounded-2xl border border-gray-100 p-5">
                        <div className="flex flex-wrap items-start gap-4">
                            <TeamIcon icon={t.icon} size="lg" />
                            <div className="min-w-0 flex-1">
                                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-gray-400">Equipo de agentes · {data.scope === 'platform' ? 'Sistema central' : (data.site?.name || 'tu organización')}</p>
                                <h2 className="text-xl md:text-2xl font-black text-gray-800">{t.label}</h2>
                                <p className="text-sm text-gray-500 mt-0.5 max-w-3xl">{t.mission || t.summary}</p>
                                <div className="flex flex-wrap items-center gap-2 mt-2">
                                    <TeamStatusPill status={t.status} />
                                    {!t.visible && <span className="text-[11px] font-semibold text-gray-400">Oculto para los sitios</span>}
                                    {c && <span className="text-xs text-gray-500 tabular-nums">{c.templates} {data.scope === 'site' ? 'disponibles' : 'plantillas'} · {c.installed} instalados · {c.active} activos{c.profileOnly ? ` · ${c.profileOnly} solo perfil` : ''}</span>}
                                </div>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <button type="button" className={btnPrimary} onClick={() => onNavigate('direccion', { team: t.key })}><BrainCircuit className="w-4 h-4" />Iniciar con Dirección IA</button>
                                {platform && <button type="button" className="inline-flex items-center gap-1.5 text-sm font-bold px-3.5 py-2 rounded-xl border border-gray-200 text-gray-700 hover:border-gray-300" onClick={() => setConfig(true)}><Settings2 className="w-4 h-4" />Configurar equipo</button>}
                            </div>
                        </div>
                    </div>

                    {c && (
                        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
                            <Kpi label={data.scope === 'site' ? 'Disponibles' : 'Plantillas'} value={c.templates} hint={data.scope === 'site' ? 'para tu organización' : `${c.published} publicadas`} />
                            <Kpi label="Instalaciones" value={c.installed} hint={data.scope === 'site' ? 'en tu sitio' : `${c.sites} ${c.sites === 1 ? 'sitio' : 'sitios'}`} />
                            <Kpi label="Agentes activos" value={c.active} hint={c.profileOnly ? `${c.profileOnly} solo perfil` : 'aceptan tareas'} />
                            <Kpi label="Tareas pendientes" value={c.pendingTasks} />
                            <Kpi label="Ejecuciones (30 días)" value={c.runs30d} hint={c.lastRunAt ? `última ${fmtDate(c.lastRunAt)}` : 'sin ejecuciones'} />
                        </div>
                    )}

                    <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                        <div className="bg-white rounded-2xl border border-gray-100 p-5 min-w-0">
                            <p className="text-sm font-black text-gray-800 mb-2">Responsabilidades y capacidades</p>
                            <ul className="space-y-1 text-sm text-gray-600 list-disc pl-5">{t.responsibilities.map(r => <li key={r}>{r}</li>)}</ul>
                        </div>
                        <div className="bg-white rounded-2xl border border-gray-100 p-5 min-w-0">
                            <p className="text-sm font-black text-gray-800 mb-2">Límites</p>
                            <ul className="space-y-1 text-sm text-gray-600 list-disc pl-5">{t.guardrails.map(r => <li key={r}>{r}</li>)}</ul>
                            <p className="text-[11px] text-gray-400 mt-2">Asignar un agente a un equipo no le da permisos: los dan las herramientas concedidas y las aprobaciones de cada instalación.</p>
                        </div>
                        <div className="bg-white rounded-2xl border border-gray-100 p-5 min-w-0">
                            <p className="text-sm font-black text-gray-800 mb-2">En la Dirección IA</p>
                            {data.capabilities.length ? (
                                <div className="flex flex-wrap gap-1.5">{data.capabilities.map(k => <span key={k.key} className="text-[11px] font-semibold px-2 py-1 rounded-lg bg-orange-50 text-orange-700 border border-orange-100">{k.label}</span>)}</div>
                            ) : <p className="text-sm text-gray-400">Ninguna capacidad del Director usa este equipo todavía.</p>}
                            {data.workflows.length > 0 && <p className="text-xs text-gray-500 mt-3"><b>Workflows:</b> {data.workflows.map(w => w.label).join(' · ')}</p>}
                            {t.director && <p className="text-xs text-gray-500 mt-3">El Director de Inteligencia y Operaciones Institucionales trabaja desde este equipo y coordina a los demás.</p>}
                        </div>
                    </div>

                    <div className="space-y-3">
                        <div className="flex flex-wrap items-end justify-between gap-3">
                            <div>
                                <p className="text-lg font-black text-gray-800">Agentes del equipo</p>
                                <p className="text-sm text-gray-500">{data.total} {data.total === 1 ? 'agente' : 'agentes'}{data.scope === 'site' ? ' instalados o disponibles para tu organización' : ' en el catálogo'}. Los mismos agentes del registro: un agente puede aparecer en varios equipos.</p>
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <label className="relative flex-1 min-w-[220px]">
                                <span className="sr-only">Buscar en el equipo</span>
                                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                                <input id="team-agents-q" value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por nombre o especialidad" className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
                            </label>
                            <select id="team-agents-view" aria-label="Mostrar" value={view} onChange={e => setView(e.target.value)} className="px-3 py-2.5 rounded-xl border border-gray-200 text-sm bg-white">
                                {Object.entries(data.views).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                            </select>
                        </div>
                        {data.agents.length === 0 ? <EmptyNote>{data.q || data.view !== 'all' ? 'No hay agentes con esos filtros.' : 'Este equipo todavía no tiene agentes para este alcance.'}</EmptyNote> : (
                            <div className="grid grid-cols-1 2xl:grid-cols-2 gap-3">
                                {data.agents.map(a => <AgentRow key={a.id} agent={a} data={data} meta={meta} platform={platform} onOpen={setOpenId} onReload={load} onError={setError} onNavigate={onNavigate} onRemove={remove} />)}
                            </div>
                        )}
                        {pages > 1 && (
                            <div className="flex items-center justify-center gap-3 text-sm">
                                <button type="button" className={btn} disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}><ChevronLeft className="w-4 h-4" />Anterior</button>
                                <span className="text-gray-500 tabular-nums">Página {data.page} de {pages}</span>
                                <button type="button" className={btn} disabled={page >= pages} onClick={() => setPage(p => p + 1)}>Siguiente<ChevronRight className="w-4 h-4" /></button>
                            </div>
                        )}
                    </div>
                    {config && <TeamConfigPanel data={data} onClose={() => setConfig(false)} onSaved={load} />}
                    {openId && <TemplateEditor id={openId} meta={meta} onClose={() => { setOpenId(null); load(); }} onChanged={load} />}
                </>
            )}
        </div>
    );
}
