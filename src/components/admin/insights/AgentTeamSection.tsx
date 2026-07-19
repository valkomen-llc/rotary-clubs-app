import React from 'react';
import type { AgentTeam, AgentTeamMember } from '../../../lib/reportTypes';
import { Icon } from './icon';
import ReportChart from './ReportChart';

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('');

const SummaryStat: React.FC<{ label: string; value: React.ReactNode; icon: string; accent: string }> = ({ label, value, icon, accent }) => (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-2" style={{ backgroundColor: `${accent}14`, color: accent }}>
            <Icon name={icon} size={17} />
        </div>
        <p className="text-2xl font-black text-slate-900 tracking-tight leading-none">{value}</p>
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-1">{label}</p>
    </div>
);

const AgentCard: React.FC<{ agent: AgentTeamMember }> = ({ agent }) => {
    const shown = agent.skills.slice(0, 4);
    const rest = agent.skills.length - shown.length;
    return (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex flex-col gap-2.5">
            <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl flex items-center justify-center text-white font-black text-sm shrink-0 shadow-sm" style={{ backgroundColor: agent.avatarColor }}>
                    {initials(agent.name)}
                </div>
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                        <p className="text-sm font-black text-slate-900 truncate">{agent.name}</p>
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${agent.active ? 'bg-emerald-500' : 'bg-slate-300'}`} title={agent.active ? 'Activo' : 'Inactivo'} />
                    </div>
                    <p className="text-[11px] text-slate-500 font-medium leading-tight line-clamp-2">{agent.role}</p>
                </div>
            </div>
            {shown.length > 0 && (
                <div className="flex flex-wrap gap-1">
                    {shown.map((s) => (
                        <span key={s.key} className="text-[9px] font-bold px-1.5 py-0.5 rounded-md" style={{ backgroundColor: `${agent.areaColor}12`, color: agent.areaColor }}>{s.label}</span>
                    ))}
                    {rest > 0 && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-500">+{rest}</span>}
                </div>
            )}
            <div className="flex items-center gap-3 pt-1 border-t border-slate-50 text-[10px] text-slate-400 font-bold">
                <span className="flex items-center gap-1"><Icon name="MessagesSquare" size={12} /> {agent.stats.conversations}</span>
                <span className="flex items-center gap-1"><Icon name="Zap" size={12} /> {agent.stats.actions}</span>
                {agent.stats.successRate != null && <span className="flex items-center gap-1 text-emerald-500"><Icon name="CheckCircle2" size={12} /> {agent.stats.successRate}%</span>}
                <span className="ml-auto text-[9px] uppercase tracking-wide text-slate-300">{agent.aiModel}</span>
            </div>
        </div>
    );
};

const AgentTeamSection: React.FC<{ team: AgentTeam; accent?: string }> = ({ team, accent = '#0c3c7c' }) => {
    if (!team?.available) return null;
    const s = team.summary;
    return (
        <section className="rp-block bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-6 py-4 flex items-center gap-3 border-b border-slate-50" style={{ background: 'linear-gradient(90deg, #8b5cf60d, transparent)' }}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-sm" style={{ background: 'linear-gradient(135deg, #8b5cf6, #6366f1)' }}>
                    <Icon name="Bot" size={19} />
                </div>
                <div>
                    <h3 className="text-lg font-black text-slate-900 tracking-tight">Equipo de Marketing IA</h3>
                    <p className="text-[11px] text-slate-400 font-medium">{s.totalAgents} agentes · {s.areasCovered} áreas · {s.totalSkills} skills disponibles</p>
                </div>
            </div>
            <div className="p-6 space-y-6">
                {/* Resumen del equipo */}
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
                    <SummaryStat label="Agentes" value={s.totalAgents} icon="Users" accent="#8b5cf6" />
                    <SummaryStat label="Activos" value={s.activeAgents} icon="BadgeCheck" accent="#10b981" />
                    <SummaryStat label="Áreas" value={s.areasCovered} icon="LayoutGrid" accent="#3b82f6" />
                    <SummaryStat label="Skills" value={s.totalSkills} icon="Sparkles" accent="#E29C00" />
                    <SummaryStat label="Conversaciones" value={s.conversations.toLocaleString('es')} icon="MessagesSquare" accent="#0ea5e9" />
                    <SummaryStat label="Acciones" value={s.actions.toLocaleString('es')} icon="Zap" accent="#ec4899" />
                    <SummaryStat label="Éxito" value={s.successRate != null ? `${s.successRate}%` : '—'} icon="TrendingUp" accent="#14b8a6" />
                </div>

                {/* Gráficos: distribución por área + ranking de actividad */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="bg-slate-50/60 rounded-2xl p-4 border border-slate-100">
                        <ReportChart block={{ type: 'donut', title: 'Agentes por área', data: team.areaDistribution, valueFormat: 'number', height: 220 }} />
                    </div>
                    {team.activityRanking.some((r) => r.value > 0) && (
                        <div className="bg-slate-50/60 rounded-2xl p-4 border border-slate-100">
                            <ReportChart block={{ type: 'hbar', title: 'Actividad por agente', data: team.activityRanking, valueFormat: 'number', height: 220 }} />
                        </div>
                    )}
                </div>

                {/* Roster por área */}
                {team.areas.map((area) => (
                    <div key={area.key}>
                        <div className="flex items-center gap-2 mb-3">
                            <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white" style={{ backgroundColor: area.color }}>
                                <Icon name={area.icon} size={14} />
                            </div>
                            <h4 className="text-sm font-black text-slate-800">{area.label}</h4>
                            <span className="text-[10px] font-bold text-slate-400">· {area.agentCount} agente(s)</span>
                            <div className="flex-1 h-px bg-slate-100 ml-2" />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                            {area.agents.map((a) => <AgentCard key={a.id} agent={a} />)}
                        </div>
                    </div>
                ))}

                <p className="text-[10px] text-slate-400 leading-relaxed bg-slate-50 rounded-xl px-3 py-2 border border-slate-100 flex items-start gap-2">
                    <Icon name="Info" size={13} className="mt-0.5 shrink-0" />
                    Cada agente ejecuta tareas reales en su área (contenido, SEO, redes, email, WhatsApp, analítica, diseño, tecnología) según sus skills. Las recomendaciones de este informe se apoyan en este equipo.
                </p>
            </div>
        </section>
    );
};

export default AgentTeamSection;
