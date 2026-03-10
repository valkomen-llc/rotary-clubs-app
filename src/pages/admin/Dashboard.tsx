import React, { useEffect, useState, useCallback } from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import { Link } from 'react-router-dom';
import {
    TrendingUp, Users, ExternalLink,
    Wallet, Building2, Eye,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import MissionControl from '../../components/admin/MissionControl';

const API = import.meta.env.VITE_API_URL || '/api';

const fmtN = (n: number) => n >= 1000000 ? `${(n / 1000000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);

const Dashboard: React.FC = () => {
    const { user } = useAuth();
    const isSuperAdmin = (user as any)?.role === 'administrator';

    const [stats, setStats] = useState<any | null>(null);
    const [trafficTotals, setTrafficTotals] = useState<{ sessions: number; users: number; pageViews: number }>({ sessions: 0, users: 0, pageViews: 0 });
    const [trafficLoading, setTrafficLoading] = useState(false);
    const [trafficMock, setTrafficMock] = useState(false);

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

    const fetchTraffic = useCallback(async () => {
        setTrafficLoading(true);
        try {
            const hostnameParam = isSuperAdmin ? '' : (clubHostname ? `&hostname=${encodeURIComponent(clubHostname)}` : '');
            const r = await fetch(`${API}/analytics/traffic?days=30${hostnameParam}`);
            const d = await r.json();
            setTrafficMock(!!d.mock);
            if (d.totals) setTrafficTotals(d.totals);
        } catch {
            setTrafficMock(true);
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
        fetchTraffic();
    }, []);

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
                    <Link to="/" target="_blank" className="bg-white border border-gray-200 px-4 py-2 rounded-xl text-sm font-bold text-gray-700 flex items-center gap-2 hover:bg-gray-50 transition-all shadow-sm">
                        View site <ExternalLink className="w-4 h-4" />
                    </Link>
                </div>
            </div>

            {/* KPI Cards */}
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

                {/* GA4 Users */}
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

            {/* Mission Control — AI Agents Panel */}
            <MissionControl />
        </AdminLayout>
    );
};

export default Dashboard;
