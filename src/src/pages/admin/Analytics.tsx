import React, { useEffect, useState, useCallback } from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import { useClub } from '../../contexts/ClubContext';
import {
    AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip,
    ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';
import {
    Users, Eye, TrendingUp, Globe, RefreshCw,
    MapPin, FileText, BarChart3,
} from 'lucide-react';

const API = import.meta.env.VITE_API_URL || '/api';

const fmtN = (n: number) =>
    n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M`
        : n >= 1_000 ? `${(n / 1_000).toFixed(1)}k`
            : String(n ?? 0);

const PERIOD_MAP: Record<string, string> = { '7d': '7', '30d': '30', '90d': '90', '12m': '365' };
const COLORS = ['#0c3c7c', '#3b82f6', '#60a5fa', '#93c5fd', '#bfdbfe'];

interface TrafficData {
    chartData: { name: string; value: number; users: number; pageViews: number }[];
    totals: { sessions: number; users: number; pageViews: number };
    topPages: { path: string; views: number }[];
    topCountries: { country: string; sessions: number }[];
    topCities: { city: string; country: string; region: string; sessions: number }[];
    mock?: boolean;
    error?: string;
}

const Skeleton = ({ h = 'h-8', w = 'w-24' }: { h?: string; w?: string }) => (
    <div className={`${h} ${w} bg-gray-100 rounded-lg animate-pulse`} />
);

const PLATFORM_HOSTS = ['clubplatform.org', 'www.clubplatform.org', 'app.clubplatform.org', 'localhost'];

const AnalyticsPage: React.FC = () => {
    const { club } = useClub();

    // Detect if we're on a club-specific domain vs the platform itself
    const currentHost = window.location.hostname;
    const isOnClubDomain = !PLATFORM_HOSTS.includes(currentHost);

    // The hostname to filter GA4 by — always use actual browser hostname for club sites
    const clubHostname: string | null = isOnClubDomain
        ? currentHost
        : ((club as any)?.domain || ((club as any)?.subdomain ? `${(club as any).subdomain}.clubplatform.org` : null));

    // Only show global (unfiltered) data when on the platform domain AND no specific club loaded
    const showGlobal = !isOnClubDomain && !clubHostname;

    const [data, setData] = useState<TrafficData | null>(null);
    const [loading, setLoading] = useState(true);
    const [period, setPeriod] = useState('30d');
    const [metric, setMetric] = useState<'value' | 'users' | 'pageViews'>('value');
    const [geoTab, setGeoTab] = useState<'countries' | 'cities'>('cities');

    const fetchData = useCallback(async (p: string) => {
        setLoading(true);
        try {
            const days = PERIOD_MAP[p] || '30';
            const hostnameParam = showGlobal ? '' : (clubHostname ? `&hostname=${encodeURIComponent(clubHostname)}` : '');
            const r = await fetch(`${API}/analytics/traffic?days=${days}${hostnameParam}`);
            const d = await r.json();
            setData(d);
        } catch {
            setData(null);
        } finally {
            setLoading(false);
        }
    }, [showGlobal, clubHostname]);

    useEffect(() => { fetchData(period); }, []);

    const handlePeriod = (p: string) => { setPeriod(p); fetchData(p); };

    const totals = data?.totals ?? { sessions: 0, users: 0, pageViews: 0 };
    const chartData = (data?.chartData?.length ?? 0) > 0 ? data!.chartData : [];
    const topPages = data?.topPages ?? [];
    const topCountries = data?.topCountries ?? [];
    const topCities = data?.topCities ?? [];
    const maxPageViews = topPages[0]?.views || 1;
    const maxCountrySessions = topCountries[0]?.sessions || 1;
    const maxCitySessions = topCities[0]?.sessions || 1;

    const metricLabel = metric === 'value' ? 'Sesiones' : metric === 'users' ? 'Usuarios' : 'Páginas vistas';

    return (
        <AdminLayout>
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
                <div>
                    <h1 className="text-3xl font-black text-gray-900 tracking-tight">Analytics</h1>
                    <p className="text-sm text-gray-400 font-medium mt-1">
                        {showGlobal
                            ? 'Todos los sitios de la plataforma'
                            : clubHostname || 'Tu sitio web'}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <div className="flex bg-gray-50 p-1 rounded-xl border border-gray-100">
                        {['7d', '30d', '90d', '12m'].map((p) => (
                            <button key={p} onClick={() => handlePeriod(p)}
                                className={`px-3 py-1.5 rounded-lg text-[11px] font-black transition-all ${period === p ? 'bg-white text-gray-900 shadow-sm border border-gray-100' : 'text-gray-400 hover:text-gray-700'}`}>
                                {p}
                            </button>
                        ))}
                    </div>
                    <button onClick={() => fetchData(period)} disabled={loading}
                        className="p-2.5 bg-white border border-gray-100 rounded-xl text-gray-400 hover:text-rotary-blue transition-colors shadow-sm">
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </div>

            {/* GA4 not configured notice */}
            {data?.mock && (
                <div className="bg-amber-50 border border-amber-100 rounded-2xl px-6 py-4 mb-6 flex items-center gap-3">
                    <BarChart3 className="w-5 h-5 text-amber-500 flex-shrink-0" />
                    <p className="text-sm font-bold text-amber-700">
                        GA4 no configurado — ve a <strong>Integraciones</strong> y guarda el Property ID y el JSON de la Service Account para ver datos reales.
                    </p>
                </div>
            )}

            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
                {[
                    { label: 'Sesiones', value: totals.sessions, icon: TrendingUp, color: 'text-rotary-blue', bg: 'bg-rotary-blue/5' },
                    { label: 'Usuarios únicos', value: totals.users, icon: Users, color: 'text-violet-500', bg: 'bg-violet-50' },
                    { label: 'Páginas vistas', value: totals.pageViews, icon: Eye, color: 'text-emerald-500', bg: 'bg-emerald-50' },
                    { label: 'Páginas / sesión', value: totals.sessions ? parseFloat((totals.pageViews / totals.sessions).toFixed(1)) : 0, icon: FileText, color: 'text-orange-500', bg: 'bg-orange-50', raw: true },
                ].map((kpi) => (
                    <div key={kpi.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 hover:shadow-md transition-all">
                        <div className="flex items-center justify-between mb-4">
                            <div className={`w-10 h-10 rounded-xl ${kpi.bg} flex items-center justify-center`}>
                                <kpi.icon className={`w-5 h-5 ${kpi.color}`} />
                            </div>
                        </div>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.15em] mb-1.5">{kpi.label}</p>
                        {loading
                            ? <Skeleton h="h-7" w="w-20" />
                            : <p className="text-2xl font-black text-gray-900 tracking-tight">
                                {kpi.raw ? kpi.value : fmtN(kpi.value as number)}
                            </p>
                        }
                    </div>
                ))}
            </div>

            {/* Traffic Chart */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 mb-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
                    <div>
                        <h2 className="text-lg font-black text-gray-900">Tráfico web</h2>
                        <p className="text-xs text-gray-400 font-medium mt-0.5">
                            {loading ? '…' : `${fmtN(totals.sessions)} sesiones · ${fmtN(totals.users)} usuarios · ${fmtN(totals.pageViews)} páginas`}
                        </p>
                    </div>
                    <div className="flex bg-gray-50 p-1 rounded-xl border border-gray-100">
                        {(['value', 'users', 'pageViews'] as const).map((m) => (
                            <button key={m} onClick={() => setMetric(m)}
                                className={`px-3 py-1.5 rounded-lg text-[11px] font-black transition-all ${metric === m ? 'bg-white text-gray-900 shadow-sm border border-gray-100' : 'text-gray-400 hover:text-gray-700'}`}>
                                {m === 'value' ? 'Sesiones' : m === 'users' ? 'Usuarios' : 'Páginas'}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="h-[280px]">
                    {loading ? (
                        <div className="h-full flex items-end gap-1 px-2">
                            {Array.from({ length: 20 }).map((_, i) => (
                                <div key={i} className="flex-1 bg-gray-100 rounded-t-md animate-pulse"
                                    style={{ height: `${20 + Math.random() * 60}%` }} />
                            ))}
                        </div>
                    ) : (
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={chartData}>
                                <defs>
                                    <linearGradient id="gaTraffic" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#0c3c7c" stopOpacity={0.1} />
                                        <stop offset="95%" stopColor="#0c3c7c" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <XAxis dataKey="name" axisLine={false} tickLine={false}
                                    tick={{ fill: '#9CA3AF', fontSize: 10, fontWeight: '700' }} dy={8} />
                                <YAxis hide />
                                <Tooltip
                                    cursor={{ stroke: '#0c3c7c', strokeWidth: 1, strokeDasharray: '4 4' }}
                                    contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 40px rgba(0,0,0,0.08)', padding: '12px 16px', fontSize: 12 }}
                                    formatter={(val: number) => [fmtN(val), metricLabel]}
                                />
                                <Area type="monotone" dataKey={metric} stroke="#0c3c7c" strokeWidth={2.5}
                                    fill="url(#gaTraffic)" dot={false}
                                    activeDot={{ fill: '#0c3c7c', stroke: 'white', strokeWidth: 2, r: 5 }} />
                            </AreaChart>
                        </ResponsiveContainer>
                    )}
                </div>
            </div>

            {/* Top Pages + Geo Tabs (Countries / Cities) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                {/* Top Pages */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                    <div className="flex items-center gap-2 mb-5">
                        <FileText className="w-4 h-4 text-rotary-blue" />
                        <h3 className="text-sm font-black text-gray-900">P\u00e1ginas m\u00e1s visitadas</h3>
                    </div>
                    {loading ? (
                        <div className="space-y-4">
                            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} h="h-6" w="w-full" />)}
                        </div>
                    ) : topPages.length === 0 ? (
                        <p className="text-sm text-gray-400 text-center py-8">Sin datos a\u00fan</p>
                    ) : (
                        <div className="space-y-3">
                            {topPages.map((p, i) => (
                                <div key={i} className="group">
                                    <div className="flex items-center justify-between mb-1">
                                        <p className="text-xs font-bold text-gray-700 truncate max-w-[75%] group-hover:text-rotary-blue transition-colors">
                                            {p.path || '/'}
                                        </p>
                                        <span className="text-xs font-black text-gray-500">{fmtN(p.views)}</span>
                                    </div>
                                    <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                        <div className="h-full bg-rotary-blue/80 rounded-full transition-all duration-700"
                                            style={{ width: `${(p.views / maxPageViews) * 100}%` }} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Geo tab: Countries / Cities */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                    <div className="flex items-center justify-between mb-5">
                        <div className="flex items-center gap-2">
                            <MapPin className="w-4 h-4 text-violet-500" />
                            <h3 className="text-sm font-black text-gray-900">Ubicaciones</h3>
                        </div>
                        <div className="flex bg-gray-50 p-0.5 rounded-lg border border-gray-100">
                            {(['cities', 'countries'] as const).map((t) => (
                                <button key={t} onClick={() => setGeoTab(t)}
                                    className={`px-3 py-1 rounded-md text-[10px] font-black transition-all ${geoTab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400 hover:text-gray-700'
                                        }`}>
                                    {t === 'cities' ? 'Ciudades' : 'Pa\u00edses'}
                                </button>
                            ))}
                        </div>
                    </div>

                    {loading ? (
                        <div className="space-y-4">
                            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} h="h-8" w="w-full" />)}
                        </div>
                    ) : geoTab === 'cities' ? (
                        topCities.length === 0
                            ? <p className="text-sm text-gray-400 text-center py-8">Sin datos de ciudades a\u00fan</p>
                            : <div className="space-y-3">
                                {topCities.map((c, i) => (
                                    <div key={i} className="flex items-center gap-3">
                                        <div className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-black text-white flex-shrink-0"
                                            style={{ backgroundColor: COLORS[i % COLORS.length] }}>
                                            {i + 1}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between mb-1">
                                                <div className="min-w-0">
                                                    <span className="text-xs font-black text-gray-800 truncate block">{c.city}</span>
                                                    <span className="text-[10px] text-gray-400 font-medium">{c.region ? `${c.region}, ` : ''}{c.country}</span>
                                                </div>
                                                <span className="text-xs font-black text-gray-500 ml-2 flex-shrink-0">{fmtN(c.sessions)}</span>
                                            </div>
                                            <div className="w-full h-1 bg-gray-100 rounded-full overflow-hidden">
                                                <div className="h-full rounded-full transition-all duration-700"
                                                    style={{ width: `${(c.sessions / maxCitySessions) * 100}%`, backgroundColor: COLORS[i % COLORS.length] }} />
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                    ) : (
                        topCountries.length === 0
                            ? <p className="text-sm text-gray-400 text-center py-8">Sin datos de pa\u00edses a\u00fan</p>
                            : <div className="space-y-3">
                                {topCountries.map((c, i) => (
                                    <div key={i} className="flex items-center gap-3">
                                        <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black text-white flex-shrink-0"
                                            style={{ backgroundColor: COLORS[i % COLORS.length] }}>
                                            {i + 1}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between mb-1">
                                                <span className="text-xs font-bold text-gray-700 truncate">{c.country || 'Desconocido'}</span>
                                                <span className="text-xs font-black text-gray-500 ml-2">{fmtN(c.sessions)}</span>
                                            </div>
                                            <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                                <div className="h-full rounded-full transition-all duration-700"
                                                    style={{ width: `${(c.sessions / maxCountrySessions) * 100}%`, backgroundColor: COLORS[i % COLORS.length] }} />
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                    )}
                </div>
            </div>

            {/* Sessions by day bar chart */}
            {!loading && chartData.length > 0 && (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 mb-6">
                    <div className="flex items-center gap-2 mb-6">
                        <BarChart3 className="w-4 h-4 text-rotary-blue" />
                        <h3 className="text-sm font-black text-gray-900">Comparativa sesiones vs usuarios por día</h3>
                    </div>
                    <div className="h-[200px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={chartData} barSize={6} barGap={2}>
                                <XAxis dataKey="name" axisLine={false} tickLine={false}
                                    tick={{ fill: '#D1D5DB', fontSize: 9, fontWeight: '700' }} dy={6} />
                                <YAxis hide />
                                <Tooltip
                                    contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 40px rgba(0,0,0,0.08)', padding: '12px 16px', fontSize: 12 }}
                                    formatter={(val: number, name: string) => [fmtN(val), name === 'value' ? 'Sesiones' : 'Usuarios']}
                                />
                                <Bar dataKey="value" fill="#0c3c7c" radius={[4, 4, 0, 0]} opacity={0.85} />
                                <Bar dataKey="users" fill="#60a5fa" radius={[4, 4, 0, 0]} opacity={0.6} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                    <div className="flex items-center gap-6 mt-4">
                        <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded bg-rotary-blue" />
                            <span className="text-[11px] font-bold text-gray-500">Sesiones</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded bg-blue-400" />
                            <span className="text-[11px] font-bold text-gray-500">Usuarios</span>
                        </div>
                    </div>
                </div>
            )}

            {/* Countries pie chart */}
            {!loading && topCountries.length > 0 && (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8">
                    <div className="flex items-center gap-2 mb-6">
                        <Globe className="w-4 h-4 text-emerald-500" />
                        <h3 className="text-sm font-black text-gray-900">Distribución por país (sesiones)</h3>
                    </div>
                    <div className="flex flex-col sm:flex-row items-center gap-8">
                        <div className="w-48 h-48 flex-shrink-0">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie data={topCountries} dataKey="sessions" nameKey="country"
                                        cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3}>
                                        {topCountries.map((_, i) => (
                                            <Cell key={i} fill={COLORS[i % COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip
                                        contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 40px rgba(0,0,0,0.08)', padding: '12px 16px', fontSize: 12 }}
                                        formatter={(val: number) => [fmtN(val), 'Sesiones']}
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                        <div className="flex-1 space-y-3 w-full">
                            {topCountries.map((c, i) => (
                                <div key={i} className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <div className="w-3 h-3 rounded-full flex-shrink-0"
                                            style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                                        <span className="text-sm font-bold text-gray-700">{c.country || 'Desconocido'}</span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <span className="text-sm font-black text-gray-900">{fmtN(c.sessions)}</span>
                                        <span className="text-[10px] text-gray-400 w-10 text-right">
                                            {((c.sessions / totals.sessions) * 100).toFixed(1)}%
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </AdminLayout>
    );
};

export default AnalyticsPage;
