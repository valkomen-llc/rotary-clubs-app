import React, { useEffect, useState } from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import { Link } from 'react-router-dom';
import {
    TrendingUp, Globe, Users, MoreVertical, ExternalLink, Wallet, Building2
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import {
    AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer
} from 'recharts';

// Data for Chart
const data = [
    { name: 'Jan', value: 300 },
    { name: 'Feb', value: 450 },
    { name: 'Mar', value: 380 },
    { name: 'Apr', value: 600 },
    { name: 'May', value: 800 },
    { name: 'Jun', value: 500 },
    { name: 'Jul', value: 900 },
    { name: 'Aug', value: 700 },
    { name: 'Sep', value: 1100 },
    { name: 'Oct', value: 850 },
    { name: 'Nov', value: 1200 },
    { name: 'Dec', value: 1000 },
];

const mockUsers = [
    { name: 'Lana Steiner', email: 'hi@lanadesign.com', status: 'Enrolled', progress: 70, rating: 5 },
    { name: 'Phoenix Baker', email: 'phoenix@phoenix.com', status: 'Enrolled', progress: 60, rating: 4 },
    { name: 'Candice Wu', email: 'hello@candicewu.com', status: 'Enrolled', progress: 30, rating: 4 },
    { name: 'Olivia Rhye', email: 'hello@oliviarrhye.com', status: 'Enrolled', progress: 80, rating: 0 },
];

const Dashboard: React.FC = () => {
    const { user } = useAuth();
    const [stats, setStats] = useState<any | null>(null);

    useEffect(() => {
        fetchDashboardData();
    }, []);

    const fetchDashboardData = async () => {
        try {
            const token = localStorage.getItem('rotary_token');
            const headers = { 'Authorization': `Bearer ${token}` };
            const base = import.meta.env.VITE_API_URL || '/api';

            const [statsRes] = await Promise.all([
                fetch(`${base}/admin/stats`, { headers }),
            ]);

            if (statsRes.ok) setStats(await statsRes.json());
        } catch (error) {
            console.error('Error loading dashboard:', error);
        }
    };

    return (
        <AdminLayout>
            <div className="flex justify-between items-center mb-10">
                <div>
                    <h1 className="text-3xl font-black text-gray-900 tracking-tight">Reporting overview</h1>
                </div>
                <div className="flex items-center gap-3">
                    <button className="flex items-center gap-2 bg-gray-50 border border-gray-100 px-4 py-2 rounded-xl text-sm font-bold text-gray-700 hover:bg-white transition-all">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        What's new?
                    </button>
                    <button className="bg-white border border-gray-200 px-4 py-2 rounded-xl text-sm font-bold text-gray-700 flex items-center gap-2 hover:bg-gray-50 transition-all shadow-sm">
                        Copy link
                    </button>
                    <Link to="/" target="_blank" className="bg-white border border-gray-200 px-4 py-2 rounded-xl text-sm font-bold text-gray-700 flex items-center gap-2 hover:bg-gray-50 transition-all shadow-sm">
                        View site <ExternalLink className="w-4 h-4" />
                    </Link>
                </div>
            </div>

            {/* Metric Cards Row */}
            <div className={`grid grid-cols-1 sm:grid-cols-2 ${user?.role === 'administrator' ? 'lg:grid-cols-5' : 'lg:grid-cols-4'} gap-6 mb-8`}>
                {/* Donations Card */}
                <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all group">
                    <div className="flex justify-between items-start mb-4">
                        <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center text-gray-400 group-hover:bg-rotary-blue/5 group-hover:text-rotary-blue transition-all">
                            <TrendingUp className="w-5 h-5" />
                        </div>
                        {stats?.donations !== undefined && (
                            <div className="flex items-center gap-1 text-emerald-500 bg-emerald-50 px-2 py-0.5 rounded-full text-[10px] font-bold">
                                <TrendingUp className="w-3 h-3" />
                            </div>
                        )}
                    </div>
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.15em] mb-1">Donaciones / Tienda</p>
                    <p className="text-2xl font-black text-gray-900 leading-none tracking-tight">
                        ${stats?.donations?.toLocaleString() || '0'}
                    </p>
                </div>

                {/* Available Funds Card */}
                <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all group">
                    <div className="flex justify-between items-start mb-4">
                        <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center text-gray-400 group-hover:bg-emerald-50 group-hover:text-emerald-600 transition-all">
                            <Wallet className="w-5 h-5" />
                        </div>
                    </div>
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.15em] mb-1">Fondos Disponibles (Retiro)</p>
                    <p className="text-2xl font-black text-gray-900 leading-none tracking-tight">
                        ${stats?.availableFunds?.toLocaleString() || '0'}
                    </p>
                </div>

                {/* Active Support Card */}
                <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all group">
                    <div className="flex justify-between items-start mb-4">
                        <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center text-gray-400 group-hover:bg-rose-50 group-hover:text-rose-600 transition-all">
                            <Users className="w-5 h-5" />
                        </div>
                    </div>
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.15em] mb-1">Activos ahora</p>
                    <p className="text-2xl font-black text-gray-900 leading-none tracking-tight">96</p>
                </div>

                {/* Views Card */}
                <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all group">
                    <div className="flex justify-between items-start mb-4">
                        <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center text-gray-400 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-all">
                            <Globe className="w-5 h-5" />
                        </div>
                    </div>
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.15em] mb-1">Vistas</p>
                    <p className="text-2xl font-black text-gray-900 leading-none tracking-tight">112,440</p>
                </div>

                {/* Active Clubs Card (Admins Only) */}
                {user?.role === 'administrator' && (
                    <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all group">
                        <div className="flex justify-between items-start mb-4">
                            <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center text-gray-400 group-hover:bg-amber-50 group-hover:text-amber-600 transition-all">
                                <Building2 className="w-5 h-5" />
                            </div>
                        </div>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.15em] mb-1">Clubes Activos (Subs)</p>
                        <p className="text-2xl font-black text-gray-900 leading-none tracking-tight">
                            {stats?.activeClubs || '0'}
                        </p>
                    </div>
                )}
            </div>

            {/* Website Traffic Line Chart */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 mb-8 overflow-hidden group">
                <div className="flex justify-between items-start mb-8">
                    <div>
                        <h3 className="text-lg font-black text-gray-900 tracking-tight">Website traffic</h3>
                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">Interacción global</p>
                    </div>
                    <div className="flex bg-gray-50 p-1 rounded-xl border border-gray-100">
                        {['12m', '30d', '7d', '24h'].map((range) => (
                            <button
                                key={range}
                                className={`px-3 py-1 rounded-lg text-[10px] font-black transition-all ${range === '30d' ? 'bg-white text-gray-900 shadow-sm border border-gray-100' : 'text-gray-400 hover:text-gray-600'}`}
                            >
                                {range}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={data}>
                            <defs>
                                <linearGradient id="colorTraffic" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#0c3c7c" stopOpacity={0.05} />
                                    <stop offset="95%" stopColor="#0c3c7c" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <XAxis
                                dataKey="name"
                                axisLine={false}
                                tickLine={false}
                                tick={{ fill: '#9CA3AF', fontSize: 10, fontWeight: '700' }}
                                dy={10}
                            />
                            <YAxis hide />
                            <Tooltip
                                cursor={{ stroke: '#0c3c7c', strokeWidth: 1, strokeDasharray: '4 4' }}
                                contentStyle={{ borderRadius: '15px', border: 'none', boxShadow: '0 10px 30px rgba(0,0,0,0.05)', padding: '15px' }}
                            />
                            <Area
                                type="monotone"
                                dataKey="value"
                                stroke="#0c3c7c"
                                strokeWidth={2}
                                fillOpacity={1}
                                fill="url(#colorTraffic)"
                                dot={false}
                                activeDot={{ fill: '#0c3c7c', stroke: 'white', strokeWidth: 2, r: 5 }}
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* GA4 Analytics Widget — temporarily disabled for debugging */}
            {/* <ErrorBoundary fallbackLabel="Error al cargar analíticas">
                <AnalyticsWidget hostname={siteHostname} gaId={undefined} />
            </ErrorBoundary> */}

            {/* Recently Active Table */}
            <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm overflow-hidden group hover:shadow-xl transition-all">
                <div className="flex justify-between items-center px-10 py-8 border-b border-gray-50">
                    <h3 className="text-xl font-black text-gray-900">Recently active</h3>
                    <button className="text-gray-400 hover:text-gray-600">
                        <MoreVertical className="w-5 h-5" />
                    </button>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-gray-50/50 border-b border-gray-50">
                                <th className="px-10 py-5">
                                    <div className="w-5 h-5 border-2 border-gray-200 rounded flex items-center justify-center cursor-pointer hover:border-rotary-blue transition-colors">
                                        <div className="w-2 h-2 bg-rotary-blue rounded-sm opacity-0" />
                                    </div>
                                </th>
                                <th className="px-2 py-5 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Customer</th>
                                <th className="px-6 py-5 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Status</th>
                                <th className="px-6 py-5 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Progress</th>
                                <th className="px-6 py-5 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Rating</th>
                                <th className="px-10 py-5"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {mockUsers.map((u, i) => (
                                <tr key={i} className="hover:bg-gray-50/30 transition-colors group/row">
                                    <td className="px-10 py-6">
                                        <div className="w-5 h-5 border-2 border-gray-200 rounded flex items-center justify-center cursor-pointer group-hover/row:border-rotary-blue transition-colors">
                                            <div className="w-2 h-2 bg-rotary-blue rounded-sm opacity-0" />
                                        </div>
                                    </td>
                                    <td className="px-2 py-6">
                                        <div className="flex items-center gap-4">
                                            <div className="w-10 h-10 rounded-full bg-gray-100 border-2 border-white shadow-sm flex items-center justify-center font-bold text-gray-400 overflow-hidden">
                                                {/* Placeholder for avatar */}
                                                <span>{u.name.charAt(0)}</span>
                                            </div>
                                            <div>
                                                <p className="text-sm font-black text-gray-900">{u.name}</p>
                                                <p className="text-[10px] text-gray-400 font-bold tracking-tight">{u.email}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-6">
                                        <div className="flex items-center gap-2">
                                            <div className="w-2 h-2 rounded-full bg-emerald-500" />
                                            <span className="text-xs font-bold text-gray-700">{u.status}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-6">
                                        <div className="flex items-center gap-3">
                                            <div className="w-32 h-2 bg-gray-100 rounded-full overflow-hidden shadow-inner">
                                                <div
                                                    className="h-full bg-gray-900 rounded-full transition-all duration-1000"
                                                    style={{ width: `${u.progress}%` }}
                                                />
                                            </div>
                                            <span className="text-[10px] font-black text-gray-400">{u.progress}%</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-6">
                                        <div className="flex gap-1 text-gray-200 group-hover/row:text-rotary-blue transition-colors">
                                            {[...Array(5)].map((_, starI) => (
                                                <svg
                                                    key={starI}
                                                    className={`w-3.5 h-3.5 ${starI < u.rating ? 'fill-current' : 'fill-gray-100'}`}
                                                    viewBox="0 0 20 20"
                                                >
                                                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                                </svg>
                                            ))}
                                        </div>
                                    </td>
                                    <td className="px-10 py-6 text-right">
                                        <button className="text-gray-300 hover:text-gray-500">
                                            <MoreVertical className="w-4 h-4" />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <div className="p-8 border-t border-gray-50 flex justify-between items-center text-sm font-bold text-gray-500">
                    <p>Page 1 of 10</p>
                    <div className="flex gap-2">
                        <button className="px-4 py-2 border border-gray-200 rounded-xl hover:bg-gray-50 transition-all shadow-sm">Previous</button>
                        <button className="px-4 py-2 border border-gray-200 rounded-xl hover:bg-gray-50 transition-all shadow-sm">Next</button>
                    </div>
                </div>
            </div>
        </AdminLayout>
    );
};

export default Dashboard;
