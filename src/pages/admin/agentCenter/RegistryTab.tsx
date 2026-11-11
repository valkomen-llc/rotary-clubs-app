import { useCallback, useEffect, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { acApi } from './agentCenterApi';
import type { Meta, Template } from './agentCenterApi';
import { AgentAvatar, EmptyNote, ErrorNote, OriginBadge, SectionHeader, TemplateStatusPill } from './agentCenterUi';
import TemplateEditor from './TemplateEditor';

export default function RegistryTab({ meta }: { meta: Meta }) {
    const [templates, setTemplates] = useState<Template[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [team, setTeam] = useState('');
    const [status, setStatus] = useState('');
    const [q, setQ] = useState('');
    const [openId, setOpenId] = useState<string | null>(null);
    const [creating, setCreating] = useState(false);

    const load = useCallback(() => {
        const p = new URLSearchParams();
        if (team) p.set('team', team);
        if (status) p.set('status', status);
        if (q.trim()) p.set('q', q.trim());
        acApi<{ templates: Template[] }>(`/templates?${p.toString()}`)
            .then(d => { setTemplates(d.templates); setError(null); })
            .catch(e => setError(e.message));
    }, [team, status, q]);

    useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

    const create = async () => {
        setCreating(true);
        try {
            const t = await acApi<Template>('/templates', { method: 'POST', body: { team: team || 'comunicaciones', level: 'any', draft: { name: 'Nuevo agente', role: 'Describe su función' } } });
            setOpenId(t.id);
            load();
        } catch (e: any) { setError(e.message); } finally { setCreating(false); }
    };

    const byTeam = meta.teams.map(t => ({ team: t, items: (templates || []).filter(x => x.team === t.key) })).filter(g => g.items.length > 0);

    return (
        <div className="space-y-5">
            <SectionHeader
                title="Agentes"
                subtitle="El catálogo de plantillas. Una plantilla define al agente; publicar crea una versión inmutable que reciben sus instalaciones. Los agentes heredados conservan su configuración."
                actions={<button type="button" onClick={create} disabled={creating} className="inline-flex items-center gap-2 bg-gray-900 text-white text-sm font-bold px-4 py-2.5 rounded-xl hover:bg-black disabled:opacity-50"><Plus className="w-4 h-4" /> Nueva plantilla</button>}
            />
            <div className="flex flex-wrap gap-2">
                <label className="relative flex-1 min-w-[220px]">
                    <span className="sr-only">Buscar</span>
                    <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input id="ac-registry-q" value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por nombre o rol"
                        className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
                </label>
                <select id="ac-registry-team" value={team} onChange={e => setTeam(e.target.value)} className="px-3 py-2.5 rounded-xl border border-gray-200 text-sm bg-white">
                    <option value="">Todos los equipos</option>
                    {meta.teams.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                </select>
                <select id="ac-registry-status" value={status} onChange={e => setStatus(e.target.value)} className="px-3 py-2.5 rounded-xl border border-gray-200 text-sm bg-white">
                    <option value="">Todos los estados</option>
                    {Object.entries(meta.templateStates).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
            </div>
            <ErrorNote message={error} />
            {templates === null ? <div className="text-sm text-gray-400">Cargando el catálogo…</div>
                : byTeam.length === 0 ? <EmptyNote>No hay plantillas con esos filtros.</EmptyNote>
                    : byTeam.map(g => (
                        <div key={g.team.key} className="space-y-2">
                            <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-gray-500">{g.team.label} <span className="text-gray-300">{g.items.length}</span></h3>
                            <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-3">
                                {g.items.map(t => (
                                    <button key={t.id} type="button" onClick={() => setOpenId(t.id)}
                                        className="text-left bg-white rounded-2xl border border-gray-100 hover:border-blue-200 hover:shadow-sm transition p-4 flex gap-3 min-w-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300">
                                        <AgentAvatar seed={t.avatarSeed || t.draft.name} color={t.avatarColor} size={44} />
                                        <div className="min-w-0 flex-1">
                                            <div className="flex flex-wrap items-center gap-1.5">
                                                <span className="font-black text-gray-800 truncate">{t.draft.name || t.key}</span>
                                                <TemplateStatusPill status={t.status} />
                                                <OriginBadge origin={t.origin} />
                                            </div>
                                            <p className="text-xs text-gray-500 line-clamp-2 mt-0.5">{t.draft.role}</p>
                                            <p className="text-[11px] text-gray-400 mt-1.5 tabular-nums">
                                                {t.currentVersion ? `v${t.currentVersion}` : 'sin publicar'} · {t.installationCount || 0} instalaciones ({t.enabledCount || 0} encendidas) · {meta.levels[t.level] ? (t.level === 'platform' ? 'sólo central' : t.level === 'site' ? 'sitios' : 'plataforma y sitios') : t.level}
                                                {t.draft.needsAdaptation ? ' · por adaptar' : ''}
                                            </p>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    ))}
            {openId && <TemplateEditor id={openId} meta={meta} onClose={() => { setOpenId(null); load(); }} onChanged={load} />}
        </div>
    );
}
