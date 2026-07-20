import React, { useEffect, useState, useCallback } from 'react';
import {
    TrendingUp, Users, Eye, Activity, RefreshCw, Loader2,
    Facebook, Instagram, BarChart3, AlertCircle
} from 'lucide-react';
import { toast } from 'sonner';

const API = import.meta.env.VITE_API_URL || '/api';
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('rotary_token')}` });

interface AccountMetric {
    accountId: string;
    platform: string;
    accountName: string | null;
    avatar: string | null;
    status: string;
    capturedAt: string | null;
    metrics: Record<string, any>;
}
interface Overview {
    accounts: AccountMetric[];
    totals: { accounts: number; followers: number; reach: number; impressions: number };
}

const num = (v: any) => {
    const n = Number(v || 0);
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return String(n);
};

const StatCard: React.FC<{ icon: React.FC<any>; label: string; value: string; tint: string }> = ({ icon: Icon, label, value, tint }) => (
    <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm">
        <div className={`w-11 h-11 rounded-2xl flex items-center justify-center mb-3 ${tint}`}>
            <Icon className="w-5 h-5" />
        </div>
        <p className="text-3xl font-black text-gray-900 tracking-tight">{value}</p>
        <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400 mt-1">{label}</p>
    </div>
);

const MetricsDashboard: React.FC = () => {
    const [data, setData] = useState<Overview | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const resp = await fetch(`${API}/social/insights/overview`, { headers: authHeaders() });
            if (resp.ok) setData(await resp.json());
            else toast.error('No se pudieron cargar las métricas');
        } catch {
            toast.error('Error de conexión al cargar métricas');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const refresh = async () => {
        setRefreshing(true);
        try {
            const resp = await fetch(`${API}/social/insights/refresh`, { method: 'POST', headers: authHeaders() });
            const r = await resp.json();
            if (resp.ok) {
                toast.success(`Métricas actualizadas: ${r.refreshed} cuenta(s)`);
                await load();
            } else {
                toast.error(r.error || 'No se pudo actualizar');
            }
        } catch {
            toast.error('Error al actualizar métricas');
        } finally {
            setRefreshing(false);
        }
    };

    if (loading) {
        return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 text-gray-300 animate-spin" /></div>;
    }

    const totals = data?.totals || { accounts: 0, followers: 0, reach: 0, impressions: 0 };
    const accounts = data?.accounts || [];
    const noData = accounts.every(a => !a.capturedAt);

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                    <h3 className="text-2xl font-black text-gray-900 flex items-center gap-2">
                        <BarChart3 className="w-6 h-6 text-indigo-600" /> Dashboard Ejecutivo
                    </h3>
                    <p className="text-sm text-gray-500 mt-1">Insights de Facebook e Instagram de las cuentas conectadas.</p>
                </div>
                <button
                    onClick={refresh}
                    disabled={refreshing}
                    className="bg-indigo-600 text-white font-bold px-5 py-3 rounded-2xl shadow-lg hover:bg-indigo-700 transition-all flex items-center gap-2 disabled:opacity-50"
                >
                    {refreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    Actualizar métricas
                </button>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard icon={Users} label="Seguidores" value={num(totals.followers)} tint="bg-blue-50 text-blue-600" />
                <StatCard icon={Eye} label="Alcance" value={num(totals.reach)} tint="bg-emerald-50 text-emerald-600" />
                <StatCard icon={TrendingUp} label="Impresiones" value={num(totals.impressions)} tint="bg-amber-50 text-amber-600" />
                <StatCard icon={Activity} label="Cuentas" value={String(totals.accounts)} tint="bg-fuchsia-50 text-fuchsia-600" />
            </div>

            {noData && (
                <div className="bg-amber-50 border border-amber-100 rounded-3xl p-6 flex items-start gap-4">
                    <AlertCircle className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                        <p className="text-sm font-bold text-amber-900">Todavía no hay métricas capturadas</p>
                        <p className="text-xs text-amber-700 mt-1">
                            Tocá "Actualizar métricas" para la primera captura. Los Insights de Meta requieren los permisos
                            <code className="mx-1 px-1 bg-amber-100 rounded">read_insights</code> /
                            <code className="mx-1 px-1 bg-amber-100 rounded">instagram_manage_insights</code>
                            aprobados en App Review. El cron <code className="px-1 bg-amber-100 rounded">social-maintenance</code> también captura snapshots a diario.
                        </p>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {accounts.map(acc => (
                    <div key={acc.accountId} className="bg-white rounded-3xl p-5 border border-gray-100 shadow-sm">
                        <div className="flex items-center gap-3 mb-4">
                            {acc.avatar
                                ? <img src={acc.avatar} alt="" className="w-10 h-10 rounded-xl object-cover" />
                                : <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center">
                                    {acc.platform === 'instagram' ? <Instagram className="w-5 h-5 text-pink-500" /> : <Facebook className="w-5 h-5 text-blue-600" />}
                                </div>}
                            <div className="min-w-0">
                                <p className="font-black text-gray-900 text-sm truncate">{acc.accountName || acc.accountId}</p>
                                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                                    {acc.platform} · {acc.capturedAt ? new Date(acc.capturedAt).toLocaleDateString() : 'sin datos'}
                                </p>
                            </div>
                        </div>
                        {acc.capturedAt ? (
                            <div className="grid grid-cols-3 gap-2">
                                <div className="bg-gray-50 rounded-xl p-3 text-center">
                                    <p className="text-lg font-black text-gray-900">{num(acc.metrics.followers)}</p>
                                    <p className="text-[9px] font-bold uppercase text-gray-400">Seguidores</p>
                                </div>
                                <div className="bg-gray-50 rounded-xl p-3 text-center">
                                    <p className="text-lg font-black text-gray-900">{num(acc.metrics.reach || acc.metrics.page_impressions_unique)}</p>
                                    <p className="text-[9px] font-bold uppercase text-gray-400">Alcance</p>
                                </div>
                                <div className="bg-gray-50 rounded-xl p-3 text-center">
                                    <p className="text-lg font-black text-gray-900">{num(acc.metrics.impressions || acc.metrics.page_impressions)}</p>
                                    <p className="text-[9px] font-bold uppercase text-gray-400">Impres.</p>
                                </div>
                            </div>
                        ) : (
                            <p className="text-xs text-gray-400 font-medium">Sin snapshot todavía.</p>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
};

export default MetricsDashboard;
