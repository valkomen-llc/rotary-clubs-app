import React, { useState, useEffect } from 'react';
import {
    AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
    Globe, Users, Eye, Clock, TrendingUp, MapPin, RefreshCw,
    AlertCircle, ExternalLink, BarChart3,
} from 'lucide-react';

const API = import.meta.env.VITE_API_URL || '/api';

interface TopPage { path: string; title: string; views: number; users: number }
interface TopCountry { country: string; sessions: number }
interface ChartPoint { date: string; sessions: number; users: number }
interface Totals { sessions: number; users: number; pageViews: number; avgDurationSecs: number }
interface AnalyticsData {
    totals: Totals;
    chartData: ChartPoint[];
    topPages: TopPage[];
    topCountries: TopCountry[];
    days: number;
    hostname: string;
    mock?: boolean;
    error?: string;
}

const fmt = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
const fmtDur = (s: number) => {
    if (!s) return '0s';
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return m ? `${m}m ${sec}s` : `${sec}s`;
};

const PERIOD_OPTIONS = [
    { label: '7d', value: '7' },
    { label: '30d', value: '30' },
    { label: '90d', value: '90' },
];

interface Props {
    hostname: string;
    clubName?: string;
    gaId?: string;
}

const AnalyticsWidget: React.FC<Props> = ({ hostname, gaId }) => {
    const [data, setData] = useState<AnalyticsData | null>(null);
    const [loading, setLoading] = useState(true);
    const [days, setDays] = useState('30');
    const [metric, setMetric] = useState<'sessions' | 'users'>('sessions');

    const load = async (d = days) => {
        setLoading(true);
        try {
            const r = await fetch(`${API}/analytics/club-stats?hostname=${encodeURIComponent(hostname)}&days=${d}`);
            setData(await r.json());
        } catch { /* keep previous */ }
        finally { setLoading(false); }
    };

    useEffect(() => { load(); }, [hostname]);

    const changePeriod = (d: string) => { setDays(d); load(d); };

    const isConfigured = !data?.mock;
    const siteUrl = hostname.includes('localhost') ? `http://${hostname}` : `https://${hostname}`;

    return (
        <div className="bg-white border border-gray-100 rounded-[2rem] shadow-sm overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-8 pt-8 pb-6 border-b border-gray-50">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-orange-50 flex items-center justify-center">
                        <BarChart3 className="w-5 h-5 text-orange-500" />
                    </div>
                    <div>
                        <h3 className="text-lg font-black text-gray-900">Analíticas del sitio</h3>
                        <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[10px] text-gray-400 font-mono">{hostname}</span>
                            <a href={siteUrl} target="_blank" rel="noopener noreferrer"
                                className="text-gray-300 hover:text-orange-500 transition-colors">
                                <ExternalLink className="w-3 h-3" />
                            </a>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    {/* Period selector */}
                    <div className="flex bg-gray-50 border border-gray-100 rounded-xl p-1">
                        {PERIOD_OPTIONS.map(opt => (
                            <button key={opt.value} onClick={() => changePeriod(opt.value)}
                                className={`px-3 py-1 rounded-lg text-[10px] font-black transition-all ${days === opt.value ? 'bg-white text-gray-900 shadow-sm border border-gray-100' : 'text-gray-400 hover:text-gray-600'}`}>
                                {opt.label}
                            </button>
                        ))}
                    </div>
                    <button onClick={() => load()} disabled={loading}
                        className="p-2 text-gray-400 hover:text-orange-500 transition-colors">
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </div>

            {/* Not configured state */}
            {data?.mock && (
                <div className="mx-8 mt-6 mb-2 flex items-start gap-3 bg-amber-50 border border-amber-100 rounded-2xl p-4">
                    <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                    <div>
                        <p className="text-xs font-black text-amber-800">GA4 no configurado</p>
                        <p className="text-[11px] text-amber-700 font-medium mt-0.5">
                            Ve a <strong>Integrations</strong> y configura el GA4 Property ID y las credenciales de Service Account para ver métricas reales.
                        </p>
                    </div>
                </div>
            )}

            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 px-8 py-6">
                {[
                    { label: 'Sesiones', value: data?.totals.sessions ?? 0, icon: TrendingUp, color: 'text-orange-500', bg: 'bg-orange-50' },
                    { label: 'Usuarios', value: data?.totals.users ?? 0, icon: Users, color: 'text-blue-500', bg: 'bg-blue-50' },
                    { label: 'Páginas vistas', value: data?.totals.pageViews ?? 0, icon: Eye, color: 'text-violet-500', bg: 'bg-violet-50' },
                    { label: 'Duración media', value: fmtDur(data?.totals.avgDurationSecs ?? 0), icon: Clock, color: 'text-emerald-500', bg: 'bg-emerald-50', raw: true },
                ].map(kpi => (
                    <div key={kpi.label} className="bg-gray-50 border border-gray-100 rounded-2xl p-4">
                        <div className={`w-8 h-8 rounded-xl ${kpi.bg} flex items-center justify-center ${kpi.color} mb-3`}>
                            <kpi.icon className="w-4 h-4" />
                        </div>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">{kpi.label}</p>
                        <p className="text-xl font-black text-gray-900">
                            {loading ? '—' : (kpi.raw ? kpi.value : fmt(kpi.value as number))}
                        </p>
                    </div>
                ))}
            </div>

            {/* Chart */}
            <div className="px-8 pb-6">
                <div className="flex items-center justify-between mb-4">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Tráfico — últimos {days} días</p>
                    <div className="flex gap-2">
                        {(['sessions', 'users'] as const).map(m => (
                            <button key={m} onClick={() => setMetric(m)}
                                className={`px-3 py-1 rounded-lg text-[10px] font-black transition-all ${metric === m ? 'bg-orange-50 text-orange-600 border border-orange-100' : 'text-gray-400 hover:text-gray-600'}`}>
                                {m === 'sessions' ? 'Sesiones' : 'Usuarios'}
                            </button>
                        ))}
                    </div>
                </div>

                {!loading && data?.chartData && data.chartData.length > 0 ? (
                    <div className="h-48">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={data.chartData}>
                                <defs>
                                    <linearGradient id={`ga4grad-${hostname}`} x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#f97316" stopOpacity={0.12} />
                                        <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <XAxis dataKey="date" axisLine={false} tickLine={false}
                                    tick={{ fill: '#9CA3AF', fontSize: 9, fontWeight: '700' }} dy={8} />
                                <YAxis hide />
                                <Tooltip
                                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 8px 24px rgba(0,0,0,0.06)', padding: '10px 14px', fontSize: 12 }}
                                    cursor={{ stroke: '#f97316', strokeWidth: 1, strokeDasharray: '4 4' }}
                                />
                                <Area type="monotone" dataKey={metric} stroke="#f97316" strokeWidth={2}
                                    fillOpacity={1} fill={`url(#ga4grad-${hostname})`}
                                    dot={false} activeDot={{ fill: '#f97316', stroke: 'white', strokeWidth: 2, r: 4 }} />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                ) : (
                    <div className="h-48 flex items-center justify-center bg-gray-50 rounded-2xl">
                        {loading ? (
                            <RefreshCw className="w-5 h-5 text-gray-300 animate-spin" />
                        ) : (
                            <div className="text-center">
                                <BarChart3 className="w-7 h-7 text-gray-300 mx-auto mb-2" />
                                <p className="text-xs text-gray-400 font-medium">Sin datos para mostrar</p>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Top Pages + Countries */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 px-8 pb-8">
                {/* Top Pages */}
                <div>
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                        <Eye className="w-3 h-3" /> Páginas más visitadas
                    </p>
                    {loading ? (
                        <div className="space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="h-8 bg-gray-50 rounded-xl animate-pulse" />)}</div>
                    ) : data?.topPages?.length ? (
                        <div className="space-y-2">
                            {data.topPages.map((p, i) => {
                                const maxViews = data.topPages[0]?.views || 1;
                                const pct = Math.round((p.views / maxViews) * 100);
                                return (
                                    <div key={i} className="flex items-center gap-3">
                                        <span className="text-[10px] font-black text-gray-300 w-4">{i + 1}</span>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between mb-1">
                                                <span className="text-[11px] font-bold text-gray-700 truncate max-w-[180px]">
                                                    {p.path === '/' ? 'Inicio' : p.path}
                                                </span>
                                                <span className="text-[10px] text-gray-400 font-mono ml-2">{fmt(p.views)}</span>
                                            </div>
                                            <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                                                <div className="h-full bg-orange-400 rounded-full" style={{ width: `${pct}%` }} />
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <p className="text-xs text-gray-400 italic">Sin datos disponibles</p>
                    )}
                </div>

                {/* Top Countries */}
                <div>
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                        <MapPin className="w-3 h-3" /> Países principales
                    </p>
                    {loading ? (
                        <div className="space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="h-8 bg-gray-50 rounded-xl animate-pulse" />)}</div>
                    ) : data?.topCountries?.length ? (
                        <div className="space-y-2">
                            {data.topCountries.map((c, i) => {
                                const maxS = data.topCountries[0]?.sessions || 1;
                                const pct = Math.round((c.sessions / maxS) * 100);
                                return (
                                    <div key={i} className="flex items-center gap-3">
                                        <span className="text-[10px] font-black text-gray-300 w-4">{i + 1}</span>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between mb-1">
                                                <span className="text-[11px] font-bold text-gray-700 flex items-center gap-1.5">
                                                    <Globe className="w-3 h-3 text-gray-300" />{c.country}
                                                </span>
                                                <span className="text-[10px] text-gray-400 font-mono">{fmt(c.sessions)}</span>
                                            </div>
                                            <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                                                <div className="h-full bg-blue-400 rounded-full" style={{ width: `${pct}%` }} />
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <p className="text-xs text-gray-400 italic">Sin datos disponibles</p>
                    )}
                </div>
            </div>

            {/* GA4 link */}
            {gaId && isConfigured && (
                <div className="px-8 pb-6">
                    <a href={`https://analytics.google.com`} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 text-[11px] font-black text-orange-500 hover:text-orange-600 transition-colors">
                        <BarChart3 className="w-3.5 h-3.5" /> Ver informe completo en Google Analytics
                        <ExternalLink className="w-3 h-3" />
                    </a>
                </div>
            )}
        </div>
    );
};

export default AnalyticsWidget;
