// La portada del Command Center para quien administra UN sitio (v4.1317).
import { useEffect, useState } from 'react';
import { acApi } from './agentCenterApi';
import type { Installation, Meta } from './agentCenterApi';
import { AgentAvatar, EmptyNote, ErrorNote, Kpi, SectionHeader, StatePill, fmtDate } from './agentCenterUi';

interface SiteOverviewData {
    site: { id: string; name: string; type: string } | null;
    policy: { enabled: boolean; allowedTeams: string[] } | null;
    installations: Installation[];
    pendingApprovals: number;
    recentTasks: { id: string; title: string; status: string; createdAt: string; agentName: string | null }[];
    usage30d: { calls: number; costUsd: number; errors: number };
}

export default function SiteOverview({ meta, onNavigate }: { meta: Meta; onNavigate: (s: string) => void }) {
    const [d, setD] = useState<SiteOverviewData | null>(null);
    const [error, setError] = useState<string | null>(null);
    useEffect(() => { acApi<SiteOverviewData>('/site-overview').then(setD).catch(e => setError(e.message)); }, []);
    if (error) return <ErrorNote message={error} />;
    if (!d) return <div className="text-sm text-gray-400">Cargando…</div>;
    const pending = d.installations.filter(i => i.state === 'installed');
    return (
        <div className="space-y-5">
            {d.policy && !d.policy.enabled && <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-xl px-4 py-3">La plataforma todavía no integró los agentes con este tipo de sitio. Cuando lo haga, aparecerán aquí.</div>}
            {pending.length > 0 && (
                <div className="bg-blue-50 border border-blue-100 text-sm text-blue-900 rounded-xl px-4 py-3">
                    {pending.length === 1 ? 'Un agente llegó a tu sitio' : `${pending.length} agentes llegaron a tu sitio`} y espera{pending.length === 1 ? '' : 'n'} que elijas un responsable para encender{pending.length === 1 ? 'lo' : 'los'}.
                    {' '}<button type="button" onClick={() => onNavigate('instalaciones')} className="font-bold underline">Revisar</button>
                </div>
            )}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Kpi label="Agentes del sitio" value={d.installations.length} hint={`${d.installations.filter(i => i.enabled).length} encendidos`} />
                <Kpi label="Aprobaciones pendientes" value={d.pendingApprovals} />
                <Kpi label="Llamadas de IA (30 días)" value={d.usage30d.calls || 0} />
                <Kpi label="Consumo estimado" value={`US$ ${Number(d.usage30d.costUsd || 0).toFixed(2)}`} hint="30 días" />
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
                <SectionHeader title={`Agentes de ${d.site?.name || 'tu sitio'}`} />
                {d.installations.length === 0 ? <EmptyNote>Todavía no hay agentes instalados en este sitio.</EmptyNote> : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                        {d.installations.map(i => (
                            <div key={i.id} className="flex items-center gap-3 border border-gray-100 rounded-xl p-3">
                                <AgentAvatar seed={i.avatarSeed || i.templateName} color={i.avatarColor} size={36} />
                                <div className="min-w-0 flex-1"><p className="font-bold text-sm text-gray-800 truncate">{i.overrides?.displayName || i.templateName}</p><p className="text-xs text-gray-500">{meta.teams.find(t => t.key === i.team)?.label}</p></div>
                                <StatePill state={i.state} title={i.stateReason} />
                            </div>
                        ))}
                    </div>
                )}
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
                <SectionHeader title="Tareas recientes" actions={<button type="button" onClick={() => onNavigate('tareas')} className="text-xs font-bold text-rotary-blue">Ver todas</button>} />
                {d.recentTasks.length === 0 ? <p className="text-sm text-gray-400 mt-2">Sin tareas todavía.</p> : (
                    <ul className="divide-y divide-gray-50 mt-2">{d.recentTasks.map(t => <li key={t.id} className="py-2 flex justify-between gap-2 text-sm"><span className="truncate">{t.title} <span className="text-xs text-gray-400">· {t.agentName}</span></span><span className="text-xs text-gray-400 whitespace-nowrap">{meta.taskStates[t.status] || t.status} · {fmtDate(t.createdAt)}</span></li>)}</ul>
                )}
            </div>
        </div>
    );
}
