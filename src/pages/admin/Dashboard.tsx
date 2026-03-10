import React, { useEffect, useState, useCallback } from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import { Link } from 'react-router-dom';
import {
    TrendingUp, Users, ExternalLink,
    Wallet, Building2, RefreshCw, BarChart3, Eye,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import {
    AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer
} from 'recharts';

const API = import.meta.env.VITE_API_URL || '/api';

const fmtN = (n: number) => n >= 1000000 ? `${(n / 1000000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);

// Fallback chart data (shown while loading or if GA4 not configured)
const FALLBACK_DATA = [
    { name: 'Jan', value: 0 }, { name: 'Feb', value: 0 }, { name: 'Mar', value: 0 },
    { name: 'Apr', value: 0 }, { name: 'May', value: 0 }, { name: 'Jun', value: 0 },
    { name: 'Jul', value: 0 }, { name: 'Aug', value: 0 }, { name: 'Sep', value: 0 },
    { name: 'Oct', value: 0 }, { name: 'Nov', value: 0 }, { name: 'Dec', value: 0 },
];

const PERIOD_MAP: Record<string, string> = { '7d': '7', '30d': '30', '90d': '90', '12m': '365' };


const Dashboard: React.FC = () => {
    const { user } = useAuth();
    const isSuperAdmin = (user as any)?.role === 'administrator';

    const [stats, setStats] = useState<any | null>(null);
    const [trafficData, setTrafficData] = useState<any[]>(FALLBACK_DATA);
    const [trafficTotals, setTrafficTotals] = useState<{ sessions: number; users: number; pageViews: number }>({ sessions: 0, users: 0, pageViews: 0 });
    const [trafficLoading, setTrafficLoading] = useState(false);
    const [trafficMock, setTrafficMock] = useState(false);
    const [period, setPeriod] = useState('30d');

    // Safely read club hostname from localStorage (no hook dependency)
    const clubHostname: string | null = (() => {
        try {
            const stored = localStorage.getItem('rotary_club');
            if (stored) {
                const c = JSON.parse(stored);
                return c.domain || (c.subdomain ? `${c.subdomain}.clubplatform.org` : null);
            }
        } catch { /* ignore */ }
        return null;
    })();

    const fetchTraffic = useCallback(async (p: string) => {
        setTrafficLoading(true);
        try {
            const days = PERIOD_MAP[p] || '30';
            // Super admin: no hostname (all sites). Club user: their hostname.
            const hostnameParam = isSuperAdmin ? '' : (clubHostname ? `&hostname=${encodeURIComponent(clubHostname)}` : '');
            const r = await fetch(`${API}/analytics/traffic?days=${days}${hostnameParam}`);
            const d = await r.json();
            setTrafficMock(!!d.mock);
            if (d.chartData && d.chartData.length > 0) {
                setTrafficData(d.chartData);
            } else {
                setTrafficData(FALLBACK_DATA);
            }
            if (d.totals) setTrafficTotals(d.totals);
        } catch {
            setTrafficMock(true);
            setTrafficData(FALLBACK_DATA);
        } finally {
            setTrafficLoading(false);
        }
    }, [isSuperAdmin, clubHostname]);

    const fetchDashboardStats = useCallback(async () => {
        try {
            const token = localStorage.getItem('rotary_token');
            const r = await fetch(`${API}/admin/stats`, { headers: { 'Authorization': `Bearer ${token}` } });
            if (r.ok) setStats(await r.json());
        } catch { /* ignore */ }
    }, []);

    useEffect(() => {
        fetchDashboardStats();
        fetchTraffic(period);
    }, []);

    const handlePeriod = (p: string) => { setPeriod(p); fetchTraffic(p); };

    return (
        <AdminLayout>
            <div className="flex justify-between items-center mb-10">
                <div>
                    <h1 className="text-3xl font-black text-gray-900 tracking-tight">Reporting overview</h1>
                    {trafficMock && (
                        <p className="text-[10px] text-amber-500 font-bold mt-1 flex items-center gap-1">
                            <BarChart3 className="w-3 h-3" />
                            GA4 no configurado — configura el Property ID en Integrations para ver datos reales
                        </p>
                    )}
                </div>
                <div className="flex items-center gap-3">
                    <button className="flex items-center gap-2 bg-gray-50 border border-gray-100 px-4 py-2 rounded-xl text-sm font-bold text-gray-700 hover:bg-white transition-all">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        What's new?
                    </button>
                    <Link to="/" target="_blank" className="bg-white border border-gray-200 px-4 py-2 rounded-xl text-sm font-bold text-gray-700 flex items-center gap-2 hover:bg-gray-50 transition-all shadow-sm">
                        View site <ExternalLink className="w-4 h-4" />
                    </Link>
                </div>
            </div>


            <div className={`grid grid-cols-1 sm:grid-cols-2 ${isSuperAdmin ? 'lg:grid-cols-5' : 'lg:grid-cols-4'} gap-6 mb-8`}>
                {/* Donations */}
                <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all group">
                    <div className="flex justify-between items-start mb-4">
                        <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center text-gray-400 group-hover:bg-rotary-blue/5 group-hover:text-rotary-blue transition-all">
                            <TrendingUp className="w-5 h-5" />
                        </div>
                    </div>
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.15em] mb-1">Donaciones / Tienda</p>
                    <p className="text-2xl font-black text-gray-900 leading-none tracking-tight">${stats?.donations?.toLocaleString() || '0'}</p>
                </div>

                {/* Funds */}
                <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all group">
                    <div className="flex justify-between items-start mb-4">
                        <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center text-gray-400 group-hover:bg-emerald-50 group-hover:text-emerald-600 transition-all">
                            <Wallet className="w-5 h-5" />
                        </div>
                    </div>
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.15em] mb-1">Fondos Disponibles</p>
                    <p className="text-2xl font-black text-gray-900 leading-none tracking-tight">${stats?.availableFunds?.toLocaleString() || '0'}</p>
                </div>

                {/* GA4 Sessions */}
                <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all group">
                    <div className="flex justify-between items-start mb-4">
                        <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center text-gray-400 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-all">
                            <Users className="w-5 h-5" />
                        </div>
                        {!trafficMock && <span className="text-[9px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">GA4</span>}
                    </div>
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.15em] mb-1">Usuarios únicos</p>
                    <p className="text-2xl font-black text-gray-900 leading-none tracking-tight">
                        {trafficLoading ? '—' : fmtN(trafficTotals.users)}
                    </p>
                </div>

                {/* GA4 Page Views */}
                <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all group">
                    <div className="flex justify-between items-start mb-4">
                        <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center text-gray-400 group-hover:bg-orange-50 group-hover:text-orange-600 transition-all">
                            <Eye className="w-5 h-5" />
                        </div>
                        {!trafficMock && <span className="text-[9px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">GA4</span>}
                    </div>
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.15em] mb-1">Páginas vistas</p>
                    <p className="text-2xl font-black text-gray-900 leading-none tracking-tight">
                        {trafficLoading ? '—' : fmtN(trafficTotals.pageViews)}
                    </p>
                </div>

                {/* Active Clubs (super admin only) */}
                {isSuperAdmin && (
                    <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all group">
                        <div className="flex justify-between items-start mb-4">
                            <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center text-gray-400 group-hover:bg-amber-50 group-hover:text-amber-600 transition-all">
                                <Building2 className="w-5 h-5" />
                            </div>
                        </div>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.15em] mb-1">Clubes Activos (Subs)</p>
                        <p className="text-2xl font-black text-gray-900 leading-none tracking-tight">{stats?.activeClubs || '0'}</p>
                    </div>
                )}
            </div>

            {/* Website Traffic Chart — GA4 */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 mb-8 overflow-hidden">
                <div className="flex justify-between items-start mb-8">
                    <div>
                        <h3 className="text-lg font-black text-gray-900 tracking-tight">
                            Website traffic
                        </h3>
                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">
                            {isSuperAdmin ? 'Todos los sitios' : (clubHostname || 'Tu sitio')} · {trafficTotals.sessions > 0 ? `${fmtN(trafficTotals.sessions)} sesiones` : 'sin datos aún'}
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="flex bg-gray-50 p-1 rounded-xl border border-gray-100">
                            {['7d', '30d', '90d', '12m'].map((p) => (
                                <button key={p} onClick={() => handlePeriod(p)}
                                    className={`px-3 py-1 rounded-lg text-[10px] font-black transition-all ${period === p ? 'bg-white text-gray-900 shadow-sm border border-gray-100' : 'text-gray-400 hover:text-gray-600'}`}>
                                    {p}
                                </button>
                            ))}
                        </div>
                        <button onClick={() => fetchTraffic(period)} disabled={trafficLoading}
                            className="p-2 text-gray-400 hover:text-rotary-blue transition-colors">
                            <RefreshCw className={`w-4 h-4 ${trafficLoading ? 'animate-spin' : ''}`} />
                        </button>
                    </div>
                </div>

                <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={trafficData}>
                            <defs>
                                <linearGradient id="colorTraffic" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#0c3c7c" stopOpacity={0.08} />
                                    <stop offset="95%" stopColor="#0c3c7c" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <XAxis dataKey="name" axisLine={false} tickLine={false}
                                tick={{ fill: '#9CA3AF', fontSize: 10, fontWeight: '700' }} dy={10} />
                            <YAxis hide />
                            <Tooltip
                                cursor={{ stroke: '#0c3c7c', strokeWidth: 1, strokeDasharray: '4 4' }}
                                contentStyle={{ borderRadius: '15px', border: 'none', boxShadow: '0 10px 30px rgba(0,0,0,0.05)', padding: '15px', fontSize: 12 }}
                                formatter={(val: number, name: string) => [fmtN(val), name === 'value' ? 'Sesiones' : name]}
                            />
                            <Area type="monotone" dataKey="value" stroke="#0c3c7c" strokeWidth={2}
                                fillOpacity={1} fill="url(#colorTraffic)" dot={false}
                                activeDot={{ fill: '#0c3c7c', stroke: 'white', strokeWidth: 2, r: 5 }} />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </AdminLayout>
    );
};

export default Dashboard;
