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

    const fetchDashboardStats = useCallback(async () => {
        try {
            const token = localStorage.getItem('rotary_token');
            const r = await fetch(`${API}/admin/stats`, { headers: { 'Authorization': `Bearer ${token}` } });
            if (r.ok) setStats(await r.json());
        } catch { /* ignore */ }
    }, []);

    useEffect(() => {
        fetchDashboardStats();
    }, []);

    return (
        <AdminLayout>
            <div className="flex justify-between items-center mb-10">
                <div>
                    <h1 className="text-3xl font-black text-gray-900 tracking-tight">Reporting overview</h1>
                </div>
                <div className="flex items-center gap-3">
                    <Link to="/admin/analytics" className="flex items-center gap-2 px-4 py-2 bg-gray-50 hover:bg-gray-100 rounded-xl text-xs font-bold text-gray-500 hover:text-gray-900 transition-all border border-gray-100">
                        <Eye className="w-3.5 h-3.5" />
                        Ver Analytics
                    </Link>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-8">
                {[
                    { label: 'Total Users', value: fmtN(stats?.users || 0), change: '+12%', icon: Users, color: 'from-blue-500 to-cyan-400' },
                    { label: 'Projects', value: fmtN(stats?.projects || 0), change: '+3', icon: TrendingUp, color: 'from-violet-500 to-purple-400' },
                    ...(isSuperAdmin ? [
                        { label: 'Clubs', value: fmtN(stats?.clubs || 0), change: '+2', icon: Building2, color: 'from-amber-500 to-yellow-400' },
                        { label: 'Donations', value: `$${fmtN(stats?.totalDonations || 0)}`, change: '+8%', icon: Wallet, color: 'from-emerald-500 to-green-400' },
                    ] : [
                        { label: 'Posts', value: fmtN(stats?.posts || 0), change: '+5', icon: ExternalLink, color: 'from-pink-500 to-rose-400' },
                        { label: 'Media', value: fmtN(stats?.media || 0), change: '+10', icon: Wallet, color: 'from-emerald-500 to-green-400' },
                    ]),
                ].map((card) => (
                    <div key={card.label} className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm hover:shadow-lg transition-all group">
                        <div className="flex justify-between items-start mb-4">
                            <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${card.color} flex items-center justify-center shadow-md`}>
                                <card.icon className="w-5 h-5 text-white" />
                            </div>
                            <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">{card.change}</span>
                        </div>
                        <p className="text-2xl font-black text-gray-900 mb-1">{card.value}</p>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{card.label}</p>
                    </div>
                ))}
            </div>

            {/* Mission Control — AI Agents Panel (full width, responsive height) */}
            <MissionControl />
        </AdminLayout>
    );
};

export default Dashboard;
