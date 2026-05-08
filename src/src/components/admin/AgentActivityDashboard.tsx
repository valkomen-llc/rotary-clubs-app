import React, { useState, useEffect, useCallback } from 'react';
import {
    Activity, Zap, MessageSquare, TrendingUp, Clock,
    CheckCircle2, Bot, Sparkles,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';

const API_URL = import.meta.env.VITE_API_URL || '/api';
const avatarUrl = (seed: string) => `https://api.dicebear.com/9.x/adventurer/svg?seed=${seed}&backgroundColor=transparent`;

const TOOL_EMOJIS: Record<string, string> = {
    create_news_post: '📰',
    create_project: '🚀',
    create_calendar_event: '📅',
    create_publication: '📱',
    update_site_setting: '⚙️',
    tool_execution: '🔧',
};

const TOOL_LABELS: Record<string, string> = {
    create_news_post: 'Noticia creada',
    create_project: 'Proyecto creado',
    create_calendar_event: 'Evento agendado',
    create_publication: 'Publicación programada',
    update_site_setting: 'Config. actualizada',
    tool_execution: 'Acción ejecutada',
};

interface AgentStat {
    agentName: string; agentId: string;
    totalActions: number; successCount: number;
    uniqueTools: number; lastActive: string;
    tools: string[]; conversations: number; totalMessages: number;
}

interface ActivityItem {
    id: string; agentName: string; action: string;
    tool: string; details: any; success: boolean; createdAt: string;
}

interface WeeklyPoint { day: string; actions: number; activeAgents: number; }

interface Totals {
    toolsExecuted: number; toolsSuccessful: number;
    totalConversations: number; totalMessages: number;
    activeAgents: number;
}

const AGENT_COLORS: Record<string, string> = {
    Diana: '#3B82F6', Martín: '#8B5CF6', Camila: '#EC4899',
    Rafael: '#10B981', Valentina: '#F59E0B', Santiago: '#0EA5E9',
    Lucía: '#6366F1', Andrés: '#F97316', Isabel: '#EF4444',
};

const AGENT_SEEDS: Record<string, string> = {
    Diana: 'Diana', Martín: 'Martin', Camila: 'Camila',
    Rafael: 'Rafael', Valentina: 'Valentina', Santiago: 'Santiago',
    Lucía: 'Lucia', Andrés: 'Andres', Isabel: 'Isabel',
};

/* ─── Mini Bar Chart ─── */
const MiniChart: React.FC<{ data: WeeklyPoint[] }> = ({ data }) => {
    const maxVal = Math.max(...data.map(d => parseInt(String(d.actions)) || 1), 1);
    const days = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

    return (
        <div className="flex items-end gap-1 h-16">
            {data.map((d, i) => {
                const height = Math.max(((parseInt(String(d.actions)) || 0) / maxVal) * 100, 8);
                const dayName = days[new Date(d.day).getDay()] || '';
                return (
                    <div key={i} className="flex flex-col items-center gap-1 flex-1">
                        <div
                            className="w-full rounded-t-md transition-all duration-500"
                            style={{
                                height: `${height}%`,
                                background: `linear-gradient(180deg, #3B82F6, #6366F1)`,
                                minHeight: '3px',
                            }}
                            title={`${d.actions} acciones`}
                        />
                        <span className="text-[7px] font-bold text-gray-400">{dayName}</span>
                    </div>
                );
            })}
        </div>
    );
};

/* ─── Stat Card ─── */
const StatCard: React.FC<{
    icon: React.ReactNode; label: string; value: number | string;
    sub?: string; color: string;
}> = ({ icon, label, value, sub, color }) => (
    <div className="bg-white rounded-2xl border border-gray-100 px-4 py-3 shadow-sm hover:shadow-md transition-shadow">
        <div className="flex items-center gap-2 mb-1.5">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: color + '15' }}>
                <span style={{ color }}>{icon}</span>
            </div>
            <span className="text-[9px] font-black uppercase text-gray-400 tracking-wider">{label}</span>
        </div>
        <p className="text-2xl font-black text-gray-900 leading-none">{value}</p>
        {sub && <p className="text-[10px] text-gray-400 font-medium mt-0.5">{sub}</p>}
    </div>
);

/* ─── Main Component ─── */
const AgentActivityDashboard: React.FC = () => {
    const { token } = useAuth();
    const [stats, setStats] = useState<AgentStat[]>([]);
    const [activity, setActivity] = useState<ActivityItem[]>([]);
    const [timeline, setTimeline] = useState<WeeklyPoint[]>([]);
    const [totals, setTotals] = useState<Totals>({
        toolsExecuted: 0, toolsSuccessful: 0,
        totalConversations: 0, totalMessages: 0, activeAgents: 0,
    });
    const [loading, setLoading] = useState(true);

    const fetchStats = useCallback(async () => {
        try {
            const res = await fetch(`${API_URL}/agents/activity/stats`, {
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token || localStorage.getItem('rotary_token')}`,
                },
            });
            if (res.ok) {
                const data = await res.json();
                setStats(data.agentStats || []);
                setActivity(data.recentActivity || []);
                setTimeline(data.weeklyTimeline || []);
                setTotals(data.totals || {});
            }
        } catch (e) { console.error('Failed to load agent stats:', e); }
        finally { setLoading(false); }
    }, [token]);

    useEffect(() => { fetchStats(); }, [fetchStats]);

    const timeAgo = (date: string) => {
        const mins = Math.floor((Date.now() - new Date(date).getTime()) / 60000);
        if (mins < 1) return 'ahora';
        if (mins < 60) return `hace ${mins}m`;
        const hrs = Math.floor(mins / 60);
        if (hrs < 24) return `hace ${hrs}h`;
        return `hace ${Math.floor(hrs / 24)}d`;
    };

    if (loading) {
        return (
            <div className="bg-white rounded-[2rem] border border-gray-100 p-8 shadow-sm">
                <div className="flex items-center gap-3 animate-pulse">
                    <div className="w-8 h-8 rounded-xl bg-gray-100" />
                    <div className="h-5 w-48 bg-gray-100 rounded-lg" />
                </div>
                <div className="grid grid-cols-4 gap-3 mt-6">
                    {[1, 2, 3, 4].map(i => <div key={i} className="h-24 bg-gray-50 rounded-2xl animate-pulse" />)}
                </div>
            </div>
        );
    }

    const hasData = stats.length > 0 || activity.length > 0;

    return (
        <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm overflow-hidden hover:shadow-xl transition-all">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-50 bg-gradient-to-r from-gray-50 to-white">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-200">
                            <Activity className="w-4.5 h-4.5 text-white" />
                        </div>
                        <div>
                            <h3 className="text-sm font-black text-gray-900">Actividad de Agentes</h3>
                            <p className="text-[10px] text-gray-400 font-medium">Resumen de operaciones y conversaciones</p>
                        </div>
                    </div>
                    {totals.activeAgents > 0 && (
                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-100">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            <span className="text-[9px] font-black text-emerald-600">
                                {totals.activeAgents} agente{totals.activeAgents > 1 ? 's' : ''} activo{totals.activeAgents > 1 ? 's' : ''}
                            </span>
                        </div>
                    )}
                </div>
            </div>

            <div className="px-6 py-5">
                {!hasData ? (
                    /* Empty state */
                    <div className="text-center py-10">
                        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-violet-100 to-indigo-100 flex items-center justify-center mx-auto mb-4">
                            <Bot className="w-8 h-8 text-violet-400" />
                        </div>
                        <h4 className="text-sm font-black text-gray-700 mb-1">Sin actividad registrada</h4>
                        <p className="text-xs text-gray-400 max-w-xs mx-auto">
                            Cuando los agentes ejecuten acciones (crear noticias, proyectos, eventos), su actividad aparecerá aquí.
                        </p>
                        <div className="flex items-center justify-center gap-2 mt-4">
                            <Sparkles className="w-3.5 h-3.5 text-violet-400" />
                            <span className="text-[10px] font-bold text-violet-500">Pídele a un agente que cree algo para comenzar</span>
                        </div>
                    </div>
                ) : (
                    <>
                        {/* Stat cards */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
                            <StatCard
                                icon={<Zap className="w-3.5 h-3.5" />}
                                label="Acciones"
                                value={totals.toolsExecuted}
                                sub={`${totals.toolsSuccessful} exitosas`}
                                color="#8B5CF6"
                            />
                            <StatCard
                                icon={<MessageSquare className="w-3.5 h-3.5" />}
                                label="Conversaciones"
                                value={totals.totalConversations}
                                sub={`${totals.totalMessages} mensajes`}
                                color="#3B82F6"
                            />
                            <StatCard
                                icon={<Bot className="w-3.5 h-3.5" />}
                                label="Agentes activos"
                                value={totals.activeAgents}
                                sub="con actividad"
                                color="#10B981"
                            />
                            <StatCard
                                icon={<TrendingUp className="w-3.5 h-3.5" />}
                                label="Efectividad"
                                value={totals.toolsExecuted > 0
                                    ? `${Math.round((totals.toolsSuccessful / totals.toolsExecuted) * 100)}%`
                                    : '—'}
                                sub="tasa de éxito"
                                color="#F59E0B"
                            />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            {/* Left: Weekly chart + Agent ranking */}
                            <div className="space-y-4">
                                {/* Weekly chart */}
                                {timeline.length > 0 && (
                                    <div className="bg-gray-50 rounded-2xl p-4">
                                        <div className="flex items-center justify-between mb-3">
                                            <span className="text-[9px] font-black text-gray-400 uppercase tracking-wider">Últimos 7 días</span>
                                            <span className="text-[9px] font-bold text-gray-300">
                                                {timeline.reduce((s, d) => s + parseInt(String(d.actions)), 0)} total
                                            </span>
                                        </div>
                                        <MiniChart data={timeline} />
                                    </div>
                                )}

                                {/* Top agents */}
                                <div>
                                    <span className="text-[9px] font-black text-gray-400 uppercase tracking-wider block mb-2">Agentes más activos</span>
                                    <div className="space-y-2">
                                        {stats.slice(0, 5).map((agent, i) => {
                                            const color = AGENT_COLORS[agent.agentName] || '#6366F1';
                                            const seed = AGENT_SEEDS[agent.agentName] || agent.agentName;
                                            const maxActions = stats[0]?.totalActions || 1;
                                            const pct = Math.round((agent.totalActions / maxActions) * 100);

                                            return (
                                                <div key={agent.agentId || i} className="flex items-center gap-2.5 group">
                                                    <div
                                                        className="w-8 h-8 rounded-full overflow-hidden border-2 flex-shrink-0"
                                                        style={{ borderColor: color, background: color + '15' }}
                                                    >
                                                        <img src={avatarUrl(seed)} alt={agent.agentName} className="w-full h-full" />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center justify-between mb-0.5">
                                                            <span className="text-[11px] font-black text-gray-700">{agent.agentName}</span>
                                                            <span className="text-[9px] font-bold text-gray-400">
                                                                {agent.totalActions} acción{agent.totalActions !== 1 ? 'es' : ''}
                                                            </span>
                                                        </div>
                                                        <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                                            <div
                                                                className="h-full rounded-full transition-all duration-700"
                                                                style={{ width: `${pct}%`, background: color }}
                                                            />
                                                        </div>
                                                        <div className="flex items-center gap-3 mt-0.5">
                                                            <span className="text-[8px] text-gray-400 font-medium">
                                                                💬 {agent.conversations} conv.
                                                            </span>
                                                            <span className="text-[8px] text-gray-400 font-medium">
                                                                📨 {agent.totalMessages} msgs
                                                            </span>
                                                            {agent.tools?.length > 0 && (
                                                                <span className="text-[8px] text-gray-400 font-medium">
                                                                    🔧 {agent.tools.length} herramienta{agent.tools.length > 1 ? 's' : ''}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>

                            {/* Right: Activity feed */}
                            <div>
                                <span className="text-[9px] font-black text-gray-400 uppercase tracking-wider block mb-2">Actividad reciente</span>
                                <div className="space-y-1 max-h-72 overflow-y-auto pr-1">
                                    {activity.slice(0, 12).map((item) => {
                                        const color = AGENT_COLORS[item.agentName] || '#6366F1';
                                        const seed = AGENT_SEEDS[item.agentName] || item.agentName;
                                        const emoji = TOOL_EMOJIS[item.tool] || TOOL_EMOJIS[item.action] || '📋';
                                        const label = TOOL_LABELS[item.tool] || TOOL_LABELS[item.action] || item.action;

                                        return (
                                            <div
                                                key={item.id}
                                                className="flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-gray-50 transition-colors"
                                            >
                                                <div className="w-6 h-6 rounded-full overflow-hidden border flex-shrink-0"
                                                    style={{ borderColor: color + '40', background: color + '10' }}>
                                                    <img src={avatarUrl(seed)} alt="" className="w-full h-full" />
                                                </div>
                                                <span className="text-sm flex-shrink-0">{emoji}</span>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-[10px] text-gray-700 font-bold truncate">
                                                        <span style={{ color }}>{item.agentName}</span> — {label}
                                                    </p>
                                                    {item.details?.title && (
                                                        <p className="text-[9px] text-gray-400 truncate">"{item.details.title}"</p>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-1 flex-shrink-0">
                                                    {item.success ? (
                                                        <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                                                    ) : (
                                                        <span className="w-3 h-3 text-[10px]">❌</span>
                                                    )}
                                                    <span className="text-[8px] font-bold text-gray-300 flex items-center gap-0.5">
                                                        <Clock className="w-2.5 h-2.5" />
                                                        {timeAgo(item.createdAt)}
                                                    </span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                    {activity.length === 0 && (
                                        <p className="text-xs text-gray-400 text-center py-4">Sin actividad reciente</p>
                                    )}
                                </div>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default AgentActivityDashboard;
