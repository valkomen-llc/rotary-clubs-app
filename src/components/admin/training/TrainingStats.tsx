import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../../hooks/useAuth';
import { Loader2, CalendarCheck, Building2, Clock, XCircle, RefreshCw, Star, TrendingUp } from 'lucide-react';

const API = import.meta.env.VITE_API_URL || '/api';

const TrainingStats: React.FC = () => {
    const { token } = useAuth();
    const H = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);
    const [stats, setStats] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [range, setRange] = useState<'30' | '90' | '365' | 'all'>('90');

    useEffect(() => {
        (async () => {
            setLoading(true);
            const qs = new URLSearchParams();
            if (range !== 'all') qs.set('from', new Date(Date.now() - Number(range) * 86400000).toISOString());
            const res = await fetch(`${API}/training/admin/stats?${qs}`, { headers: H });
            if (res.ok) setStats(await res.json());
            setLoading(false);
        })();
    }, [H, range]);

    if (loading || !stats) return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-gray-300" /></div>;

    const cards = [
        { label: 'Capacitaciones', value: stats.total, icon: CalendarCheck, color: 'indigo' },
        { label: 'Sitios atendidos', value: stats.sitesAttended, icon: Building2, color: 'blue' },
        { label: 'Horas invertidas', value: stats.hoursInvested, icon: Clock, color: 'emerald' },
        { label: 'Asistencia', value: stats.attendanceRate != null ? `${stats.attendanceRate}%` : '—', icon: TrendingUp, color: 'green' },
        { label: 'Cancelaciones', value: stats.cancellations, icon: XCircle, color: 'red' },
        { label: 'Reprogramaciones', value: stats.reschedules, icon: RefreshCw, color: 'amber' },
        { label: 'Pendientes', value: stats.pending, icon: Clock, color: 'orange' },
        { label: 'Seguimientos', value: stats.followUps, icon: RefreshCw, color: 'purple' },
    ];
    const colorCls: Record<string, string> = {
        indigo: 'from-indigo-500 to-indigo-600', blue: 'from-blue-500 to-blue-600', emerald: 'from-emerald-500 to-emerald-600',
        green: 'from-green-500 to-green-600', red: 'from-red-500 to-red-600', amber: 'from-amber-500 to-amber-600',
        orange: 'from-orange-500 to-orange-600', purple: 'from-purple-500 to-purple-600',
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-end">
                <select value={range} onChange={e => setRange(e.target.value as any)} className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm">
                    <option value="30">Últimos 30 días</option>
                    <option value="90">Últimos 90 días</option>
                    <option value="365">Último año</option>
                    <option value="all">Todo</option>
                </select>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {cards.map(c => (
                    <div key={c.label} className="bg-white rounded-2xl border border-gray-100 p-4">
                        <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${colorCls[c.color]} flex items-center justify-center mb-2`}>
                            <c.icon className="w-5 h-5 text-white" />
                        </div>
                        <div className="text-2xl font-black text-gray-900">{c.value}</div>
                        <div className="text-xs text-gray-500 font-semibold">{c.label}</div>
                    </div>
                ))}
            </div>

            <div className="grid lg:grid-cols-2 gap-6">
                <div className="bg-white rounded-2xl border border-gray-100 p-5">
                    <h3 className="font-black text-gray-900 mb-3">Temas más solicitados</h3>
                    {stats.topTypes.length === 0 ? <p className="text-sm text-gray-400">Sin datos aún.</p> : (
                        <div className="space-y-2">
                            {stats.topTypes.map((t: any) => {
                                const max = stats.topTypes[0].count || 1;
                                return (
                                    <div key={t.name}>
                                        <div className="flex justify-between text-xs font-semibold text-gray-600 mb-0.5"><span>{t.name}</span><span>{t.count}</span></div>
                                        <div className="h-2 rounded-full bg-gray-100 overflow-hidden"><div className="h-full bg-indigo-500 rounded-full" style={{ width: `${(t.count / max) * 100}%` }} /></div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                <div className="bg-white rounded-2xl border border-gray-100 p-5">
                    <h3 className="font-black text-gray-900 mb-3">Satisfacción <span className="text-xs font-normal text-gray-400">({stats.satisfaction.responses} respuestas)</span></h3>
                    <div className="space-y-3">
                        {[['satisfaction', 'Satisfacción general'], ['usefulness', 'Utilidad'], ['clarity', 'Claridad'], ['attention', 'Atención']].map(([k, label]) => {
                            const v = stats.satisfaction[k];
                            return (
                                <div key={k} className="flex items-center gap-2">
                                    <span className="text-sm text-gray-600 flex-1">{label}</span>
                                    <div className="flex gap-0.5">
                                        {[1, 2, 3, 4, 5].map(n => <Star key={n} className={`w-4 h-4 ${v != null && n <= Math.round(v) ? 'fill-amber-400 text-amber-400' : 'text-gray-200'}`} />)}
                                    </div>
                                    <span className="text-sm font-black text-gray-900 w-8 text-right">{v ?? '—'}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default TrainingStats;
