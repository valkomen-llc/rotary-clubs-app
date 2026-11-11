import { useEffect, useState } from 'react';
import { acApi } from './agentCenterApi';
import type { Meta, AuditEntry } from './agentCenterApi';
import { Kpi, ErrorNote, SectionHeader, StatePill, fmtDate } from './agentCenterUi';

interface Overview {
    templates: { total: number; byStatus: Record<string, number> };
    installations: { total: number; byState: Record<string, number>; enabled: number; sites: number };
    byTeam: Record<string, { templates: number; installations: number }>;
    siteTypes: { enabled: string[]; total: number };
    settings: { killSwitch: boolean };
    recentAudit: AuditEntry[];
    migratedNow: { templatesCreated: number; installationsCreated: number } | null;
    runtime: { tasks: Record<string, number>; pendingApprovals: number; runs30d: Record<string, number>; activeSchedules: number };
    usage30d: { calls: number; costUsd: number; errors: number };
}

export default function CommandOverview({ meta, onNavigate }: { meta: Meta; onNavigate: (s: string) => void }) {
    const [data, setData] = useState<Overview | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        acApi<Overview>('/overview').then(setData).catch(e => setError(e.message));
    }, []);

    if (error) return <ErrorNote message={error} />;
    if (!data) return <div className="text-sm text-gray-400">Calculando el estado del ecosistema…</div>;

    const st = data.installations.byState;
    const siteTypeLabel = (t: string) => meta.siteTypes.find(s => s.type === t)?.label || t;

    return (
        <div className="space-y-6">
            {data.settings.killSwitch && (
                <div className="bg-red-50 border border-red-200 rounded-2xl px-4 py-3 text-sm text-red-700">
                    <b>Interruptor general activado:</b> ningún agente ejecuta tareas en la plataforma. Se cambia en Ajustes.
                </div>
            )}
            {data.migratedNow && (data.migratedNow.templatesCreated > 0) && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-3 text-sm text-emerald-800">
                    Se registraron {data.migratedNow.templatesCreated} agentes heredados como plantillas y {data.migratedNow.installationsCreated} instalaciones, con su configuración tal como estaba. Nada se borró.
                </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
                <Kpi label="Agentes en el catálogo" value={data.templates.total} hint={`${data.templates.byStatus.published || 0} publicados`} />
                <Kpi label="Instalaciones" value={data.installations.total} hint={`${data.installations.enabled} encendidas`} />
                <Kpi label="Sitios con agentes" value={data.installations.sites} />
                <Kpi label="Activos" value={(st.active || 0) + (st.running || 0)} hint="con herramientas y motor" />
                <Kpi label="Solo perfil" value={st.profile_only || 0} hint="conversan, no ejecutan" />
                <Kpi label="Tipos de sitio integrados" value={`${data.siteTypes.enabled.length}/${data.siteTypes.total}`} />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
                <Kpi label="Tareas pendientes" value={(data.runtime.tasks.queued || 0) + (data.runtime.tasks.running || 0)} />
                <Kpi label="Completadas" value={data.runtime.tasks.succeeded || 0} />
                <Kpi label="Fallidas" value={(data.runtime.tasks.dead || 0) + (data.runtime.tasks.failed || 0)} />
                <Kpi label="Aprobaciones pendientes" value={data.runtime.pendingApprovals} hint={data.runtime.pendingApprovals ? 'esperan una decisión' : ''} />
                <Kpi label="Programaciones activas" value={data.runtime.activeSchedules} />
                <Kpi label="Consumo IA (30 días)" value={`US$ ${Number(data.usage30d.costUsd || 0).toFixed(2)}`} hint={`${data.usage30d.calls || 0} llamadas · estimado`} />
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
                <SectionHeader title="Equipos de agentes" subtitle="Plantillas e instalaciones por equipo." />
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                    {meta.teams.map(t => {
                        const c = data.byTeam[t.key] || { templates: 0, installations: 0 };
                        return (
                            <button key={t.key} type="button" onClick={() => onNavigate('agentes')}
                                className="text-left rounded-xl border border-gray-100 hover:border-blue-200 hover:bg-blue-50/40 transition-colors p-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300">
                                <p className="font-bold text-gray-800 text-sm">{t.label}</p>
                                <p className="text-xs text-gray-500 mt-0.5">{t.help}</p>
                                <p className="text-xs text-gray-600 mt-2 tabular-nums"><b>{c.templates}</b> plantillas · <b>{c.installations}</b> instalaciones</p>
                            </button>
                        );
                    })}
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3 min-w-0">
                    <SectionHeader title="Estado de las instalaciones" />
                    <div className="flex flex-wrap gap-2">
                        {Object.keys(meta.installationStates).map(k => (
                            <span key={k} className="inline-flex items-center gap-2 text-sm">
                                <StatePill state={k} title={meta.installationStates[k].help} />
                                <b className="tabular-nums text-gray-700">{st[k] || 0}</b>
                            </span>
                        ))}
                    </div>
                    <p className="text-xs text-gray-500">Integrados: {data.siteTypes.enabled.map(siteTypeLabel).join(', ') || 'ningún tipo de sitio'}.
                        {' '}<button type="button" className="text-rotary-blue font-semibold hover:underline" onClick={() => onNavigate('tipos')}>Cambiar</button></p>
                </div>
                <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3 min-w-0">
                    <SectionHeader title="Cambios recientes" actions={<button type="button" className="text-xs font-bold text-rotary-blue hover:underline" onClick={() => onNavigate('gobierno')}>Ver auditoría</button>} />
                    {data.recentAudit.length === 0 ? <p className="text-sm text-gray-400">Sin cambios registrados todavía.</p> : (
                        <ul className="divide-y divide-gray-50">
                            {data.recentAudit.map(a => (
                                <li key={a.id} className="py-2 flex flex-wrap justify-between gap-2 text-sm">
                                    <span className="text-gray-700">{meta.auditActions[a.action] || a.action}</span>
                                    <span className="text-xs text-gray-400">{fmtDate(a.createdAt)}</span>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>
        </div>
    );
}
