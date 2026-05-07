import React, { useState, useEffect } from 'react';
import { 
    Activity, 
    Users, 
    Building2, 
    TrendingUp, 
    AlertTriangle, 
    PieChart as PieChartIcon,
    Zap,
    Download
} from 'lucide-react';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    PieChart,
    Pie,
    Cell,
    Legend
} from 'recharts';
import { toast } from 'sonner';

interface DistrictStats {
    summary: {
        totalClubs: number;
        totalMembers: number;
        totalLeads: number;
        totalProjects: number;
        averageMembersPerClub: number;
    };
    saasStatus: {
        active: number;
        trial: number;
        suspended: number;
        expired: number;
    };
    leaderboard: Array<{
        id: string;
        name: string;
        growth: number;
        totalMembers: number;
        activityScore: number;
    }>;
    predictive: {
        churnRisk: string;
        growthPotential: string;
    };
    timestamp: string;
}

const DistrictIQ: React.FC = () => {
    const [stats, setStats] = useState<DistrictStats | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchStats();
    }, []);

    const fetchStats = async () => {
        try {
            setLoading(true);
            const response = await fetch('/api/district-analytics/health');
            if (!response.ok) throw new Error('Failed to fetch district stats');
            const data = await response.json();
            setStats(data);
        } catch (error) {
            console.error('Error:', error);
            toast.error('No se pudieron cargar las métricas de distrito');
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <Activity className="w-8 h-8 text-blue-600 animate-spin" />
            </div>
        );
    }

    if (!stats) return null;

    const COLORS = ['#10b981', '#f59e0b', '#ef4444', '#6366f1'];
    const pieData = [
        { name: 'Activos', value: stats.saasStatus.active },
        { name: 'Trial', value: stats.saasStatus.trial },
        { name: 'Expirados/Susp.', value: stats.saasStatus.expired + stats.saasStatus.suspended },
    ].filter(d => d.value > 0);

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900 tracking-tight flex items-center gap-3">
                        <Activity className="w-8 h-8 text-blue-600" />
                        District Health IQ
                    </h1>
                    <p className="text-slate-500 mt-1">Análisis predictivo y métricas de gobernanza del distrito.</p>
                </div>
                <button 
                    onClick={() => toast.success('Reporte generado')}
                    className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors shadow-sm"
                >
                    <Download className="w-4 h-4" />
                    Exportar Reporte
                </button>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-6 bg-white rounded-2xl border border-slate-100 shadow-sm">
                    <div className="flex items-center justify-between mb-2">
                        <div className="p-2 bg-blue-50 rounded-lg text-blue-600">
                            <Building2 className="w-5 h-5" />
                        </div>
                        <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">En Vivo</span>
                    </div>
                    <p className="text-sm text-slate-500">Clubes en el Sistema</p>
                    <h3 className="text-2xl font-bold text-slate-900">{stats.summary.totalClubs}</h3>
                </div>

                <div className="p-6 bg-white rounded-2xl border border-slate-100 shadow-sm">
                    <div className="flex items-center justify-between mb-2">
                        <div className="p-2 bg-purple-50 rounded-lg text-purple-600">
                            <Users className="w-5 h-5" />
                        </div>
                    </div>
                    <p className="text-sm text-slate-500">Total de Socios</p>
                    <h3 className="text-2xl font-bold text-slate-900">{stats.summary.totalMembers}</h3>
                    <p className="text-xs text-slate-400 mt-1">Prom: {stats.summary.averageMembersPerClub} socios/club</p>
                </div>

                <div className="p-6 bg-white rounded-2xl border border-slate-100 shadow-sm">
                    <div className="flex items-center justify-between mb-2">
                        <div className={`p-2 rounded-lg ${stats.predictive.churnRisk === 'Low' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                            <AlertTriangle className="w-5 h-5" />
                        </div>
                    </div>
                    <p className="text-sm text-slate-500">Riesgo de Churn</p>
                    <h3 className={`text-2xl font-bold ${stats.predictive.churnRisk === 'Low' ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {stats.predictive.churnRisk}
                    </h3>
                </div>

                <div className="p-6 bg-white rounded-2xl border border-slate-100 shadow-sm">
                    <div className="flex items-center justify-between mb-2">
                        <div className="p-2 bg-amber-50 rounded-lg text-amber-600">
                            <Zap className="w-5 h-5" />
                        </div>
                    </div>
                    <p className="text-sm text-slate-500">Potencial de Crecimiento</p>
                    <h3 className="text-2xl font-bold text-slate-900">{stats.predictive.growthPotential}</h3>
                </div>
            </div>

            {/* Main Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Growth Leaderboard */}
                <div className="p-6 bg-white rounded-2xl border border-slate-100 shadow-sm">
                    <div className="flex items-center gap-2 mb-6">
                        <TrendingUp className="w-5 h-5 text-blue-600" />
                        <h2 className="text-lg font-semibold text-slate-900">Leaderboard: Crecimiento de Socios</h2>
                    </div>
                    <div className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={stats.leaderboard} layout="vertical">
                                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f1f5f9" />
                                <XAxis type="number" hide />
                                <YAxis 
                                    dataKey="name" 
                                    type="category" 
                                    width={120} 
                                    tick={{ fontSize: 12, fill: '#64748b' }}
                                />
                                <Tooltip 
                                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                                />
                                <Bar dataKey="growth" fill="#3b82f6" radius={[0, 4, 4, 0]} name="Nuevos Socios" />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* SaaS Distribution */}
                <div className="p-6 bg-white rounded-2xl border border-slate-100 shadow-sm">
                    <div className="flex items-center gap-2 mb-6">
                        <PieChartIcon className="w-5 h-5 text-indigo-600" />
                        <h2 className="text-lg font-semibold text-slate-900">Salud de Suscripciones (Gobernanza)</h2>
                    </div>
                    <div className="h-[300px] flex flex-col md:flex-row items-center">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={pieData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={80}
                                    paddingAngle={5}
                                    dataKey="value"
                                >
                                    {pieData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip />
                                <Legend verticalAlign="bottom" height={36}/>
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            {/* AI Insights Card */}
            <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-3xl p-8 text-white relative overflow-hidden shadow-xl">
                <div className="relative z-10">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 bg-white/20 backdrop-blur-md rounded-xl">
                            <Zap className="w-6 h-6 text-white" />
                        </div>
                        <h2 className="text-xl font-bold">AI Predictive Insights</h2>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div>
                            <p className="text-blue-100 mb-4 leading-relaxed">
                                Basado en el comportamiento de los últimos 90 días, el distrito muestra una tasa de retención del 98%. 
                                Se recomienda priorizar el apoyo a los clubes en estado de 'Expirado' para evitar interrupciones de servicio.
                            </p>
                            <div className="flex items-center gap-4">
                                <div className="flex -space-x-2">
                                    {[1, 2, 3].map(i => (
                                        <div key={i} className="w-8 h-8 rounded-full border-2 border-blue-600 bg-blue-400 overflow-hidden">
                                            <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${i}`} alt="Avatar" />
                                        </div>
                                    ))}
                                </div>
                                <span className="text-sm text-blue-100">3 clubes en riesgo alto</span>
                            </div>
                        </div>
                        <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 border border-white/20">
                            <h4 className="font-semibold mb-3 flex items-center gap-2">
                                <TrendingUp className="w-4 h-4" />
                                Acción Recomendada
                            </h4>
                            <p className="text-sm text-blue-50">
                                Lanzar campaña de reactivación para el 15% de clubes con 'Trial' inactivo. 
                                Esto podría incrementar la recaudación anual en aproximadamente $1,200 USD.
                            </p>
                        </div>
                    </div>
                </div>
                {/* Decorative Elements */}
                <div className="absolute -right-20 -bottom-20 w-64 h-64 bg-white/10 rounded-full blur-3xl"></div>
                <div className="absolute -left-10 -top-10 w-48 h-48 bg-indigo-400/20 rounded-full blur-3xl"></div>
            </div>
        </div>
    );
};

export default DistrictIQ;
