import React, { useCallback, useEffect, useState } from 'react';
import {
    AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, Legend,
} from 'recharts';
import {
    Users, UserCheck, UserX, MailWarning, MailCheck, Eye, MousePointerClick,
    Workflow, Megaphone, TrendingUp, TrendingDown, Minus, RefreshCw, Clock,
    AlertTriangle, AlertCircle, Info, CheckCircle2, Inbox, Send, Target,
} from 'lucide-react';
import { toast } from 'sonner';

const API = import.meta.env.VITE_API_URL || '/api';
const authHeaders = () => ({ 'Authorization': `Bearer ${localStorage.getItem('rotary_token')}` });

type PeriodKey = '7d' | '30d' | '90d';

interface Delta { current: number; previous: number; deltaPct: number; }
interface Kpis {
    contactsTotal: number; subscribed: number; unsubscribed: number; noEmail: number;
    pending: number; withFailures: number; reachable: number;
    campaignsTotal: number; campaignsSent: number; campaignsActive: number;
    campaignsSending: number; campaignsScheduled: number; campaignsFailed: number;
    automationsTotal: number; automationsActive: number;
    emailsSentAllTime: number; sentRecipients: number; failedRecipients: number;
    uniqueOpens: number; uniqueClicks: number;
    deliveryRate: number; openRate: number; clickRate: number; unsubRate: number;
    emailsSentPeriod: number; opensPeriod: number; clicksPeriod: number; newContactsPeriod: number;
}
interface SeriesPoint { date: string; sent: number; opens: number; clicks: number; contacts: number; contactsCumulative: number; }
interface CampaignRow {
    id: string; name: string; subject: string; status: string; sentAt?: string | null;
    createdAt: string; sentCount: number; failedCount: number; totalRecipients: number;
    uniqueOpens: number; uniqueClicks: number; openRate: number; clickRate: number;
}
interface AlertItem { level: 'success' | 'info' | 'warning' | 'danger'; title: string; message: string; }
interface DashboardData {
    generatedAt: string;
    period: { key: PeriodKey; label: string; days: number; from: string; to: string };
    kpis: Kpis;
    comparison: { emailsSent: Delta; opens: Delta; clicks: Delta; newContacts: Delta };
    series: SeriesPoint[];
    recentCampaigns: CampaignRow[];
    topCampaigns: CampaignRow[];
    alerts: AlertItem[];
    empty?: boolean;
}

const PERIODS: { key: PeriodKey; label: string }[] = [
    { key: '7d', label: '7 días' },
    { key: '30d', label: '30 días' },
    { key: '90d', label: '90 días' },
];

const fmt = (n?: number) => (n ?? 0).toLocaleString('es-CO');
const pct = (n?: number) => `${(n ?? 0).toLocaleString('es-CO')}%`;
const shortDay = (d: string) => {
    const [, m, day] = d.split('-');
    return `${day}/${m}`;
};

const tooltipStyle = {
    borderRadius: '12px', border: '1px solid #e2e8f0',
    boxShadow: '0 10px 40px rgba(0,0,0,0.08)', padding: '8px 12px', fontSize: 12, fontWeight: 600,
};

const ALERT_META = {
    danger: { cls: 'bg-rose-50 border-rose-200 text-rose-800', icon: <AlertTriangle className="w-4 h-4 text-rose-500" /> },
    warning: { cls: 'bg-amber-50 border-amber-200 text-amber-800', icon: <AlertCircle className="w-4 h-4 text-amber-500" /> },
    info: { cls: 'bg-sky-50 border-sky-200 text-sky-800', icon: <Info className="w-4 h-4 text-sky-500" /> },
    success: { cls: 'bg-emerald-50 border-emerald-200 text-emerald-800', icon: <CheckCircle2 className="w-4 h-4 text-emerald-500" /> },
} as const;

const STATUS_META: Record<string, { label: string; cls: string }> = {
    draft: { label: 'Borrador', cls: 'bg-gray-100 text-gray-600' },
    scheduled: { label: 'Programada', cls: 'bg-violet-100 text-violet-700' },
    sending: { label: 'Enviando', cls: 'bg-amber-100 text-amber-700' },
    sent: { label: 'Enviada', cls: 'bg-emerald-100 text-emerald-700' },
    failed: { label: 'Fallida', cls: 'bg-rose-100 text-rose-700' },
};

const DeltaBadge: React.FC<{ delta: number }> = ({ delta }) => {
    if (delta === 0) return (
        <span className="inline-flex items-center gap-0.5 text-[11px] font-bold text-gray-400"><Minus className="w-3 h-3" /> 0%</span>
    );
    const up = delta > 0;
    return (
        <span className={`inline-flex items-center gap-0.5 text-[11px] font-bold ${up ? 'text-emerald-600' : 'text-rose-500'}`}>
            {up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {up ? '+' : ''}{delta.toLocaleString('es-CO')}%
        </span>
    );
};

interface BigCard { label: string; value: string; icon: React.ElementType; color: string; delta?: number; sub?: string; }
interface MiniCard { label: string; value: string; icon: React.ElementType; color: string; }

const EmailDashboard: React.FC = () => {
    const [period, setPeriod] = useState<PeriodKey>('30d');
    const [data, setData] = useState<DashboardData | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const fetchDashboard = useCallback(async (p: PeriodKey, silent = false) => {
        if (silent) setRefreshing(true); else setLoading(true);
        try {
            const res = await fetch(`${API}/email-marketing/dashboard?period=${p}`, { headers: authHeaders() });
            if (!res.ok) throw new Error();
            setData(await res.json());
        } catch {
            toast.error('No se pudo cargar el panel');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => { fetchDashboard(period); }, [period, fetchDashboard]);

    if (loading && !data) {
        return <div className="p-16 text-center text-gray-400 flex flex-col items-center gap-3">
            <RefreshCw className="w-6 h-6 animate-spin" /> Cargando panel…
        </div>;
    }
    if (!data) return null;

    const k = data.kpis;
    const c = data.comparison;

    const bigCards: BigCard[] = [
        { label: 'Contactos', value: fmt(k.contactsTotal), icon: Users, color: 'text-purple-600 bg-purple-50', delta: c.newContacts.deltaPct, sub: `+${fmt(k.newContactsPeriod)} en el período` },
        { label: 'Suscritos', value: fmt(k.subscribed), icon: UserCheck, color: 'text-emerald-600 bg-emerald-50', sub: `${fmt(k.reachable)} alcanzables` },
        { label: 'Enviados', value: fmt(k.emailsSentPeriod), icon: MailCheck, color: 'text-sky-600 bg-sky-50', delta: c.emailsSent.deltaPct, sub: `${fmt(k.emailsSentAllTime)} histórico` },
        { label: 'Tasa de apertura', value: pct(k.openRate), icon: Eye, color: 'text-indigo-600 bg-indigo-50', delta: c.opens.deltaPct, sub: `${fmt(k.uniqueOpens)} aperturas únicas` },
        { label: 'Tasa de clic', value: pct(k.clickRate), icon: MousePointerClick, color: 'text-amber-600 bg-amber-50', delta: c.clicks.deltaPct, sub: `${fmt(k.uniqueClicks)} clics únicos` },
        { label: 'Automatizaciones', value: fmt(k.automationsActive), icon: Workflow, color: 'text-fuchsia-600 bg-fuchsia-50', sub: `${fmt(k.automationsTotal)} en total` },
    ];

    const miniCards: MiniCard[] = [
        { label: 'Tasa de entrega', value: pct(k.deliveryRate), icon: Send, color: 'text-emerald-600 bg-emerald-50' },
        { label: 'Dados de baja', value: fmt(k.unsubscribed), icon: UserX, color: 'text-rose-600 bg-rose-50' },
        { label: 'Sin email', value: fmt(k.noEmail), icon: Inbox, color: 'text-gray-500 bg-gray-100' },
        { label: 'Con rebotes/fallos', value: fmt(k.withFailures), icon: MailWarning, color: 'text-orange-600 bg-orange-50' },
        { label: 'Pendientes', value: fmt(k.pending), icon: Clock, color: 'text-violet-600 bg-violet-50' },
        { label: 'Campañas activas', value: fmt(k.campaignsActive), icon: Megaphone, color: 'text-blue-600 bg-blue-50' },
    ];

    const chartData = data.series.map((s) => ({ ...s, day: shortDay(s.date) }));
    const hasActivity = data.series.some((s) => s.sent || s.opens || s.clicks);
    const hasGrowth = data.series.some((s) => s.contacts);

    return (
        <div className="space-y-6">
            {/* Selector de período */}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="inline-flex bg-gray-100 rounded-xl p-1">
                    {PERIODS.map((p) => (
                        <button
                            key={p.key}
                            onClick={() => setPeriod(p.key)}
                            className={`px-3.5 py-1.5 text-sm font-bold rounded-lg transition-all ${period === p.key ? 'bg-white text-rotary-blue shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            {p.label}
                        </button>
                    ))}
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-400">
                    <span>{data.period.label} · vs período anterior</span>
                    <button
                        onClick={() => fetchDashboard(period, true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:text-rotary-blue hover:border-blue-200 transition-all font-bold"
                    >
                        <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} /> Actualizar
                    </button>
                </div>
            </div>

            {/* Alertas de entregabilidad */}
            {data.alerts.length > 0 && (
                <div className="grid gap-2 md:grid-cols-2">
                    {data.alerts.map((a, i) => {
                        const meta = ALERT_META[a.level];
                        return (
                            <div key={i} className={`flex items-start gap-2.5 rounded-xl border px-4 py-3 ${meta.cls}`}>
                                <div className="mt-0.5 shrink-0">{meta.icon}</div>
                                <div>
                                    <p className="text-sm font-bold">{a.title}</p>
                                    <p className="text-xs opacity-90 leading-snug">{a.message}</p>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* KPIs principales */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                {bigCards.map((m) => (
                    <div key={m.label} className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
                        <div className="flex items-center justify-between mb-2">
                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${m.color}`}>
                                <m.icon className="w-5 h-5" />
                            </div>
                            {m.delta !== undefined && <DeltaBadge delta={m.delta} />}
                        </div>
                        <p className="text-2xl font-black text-gray-800 leading-tight">{m.value}</p>
                        <p className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">{m.label}</p>
                        {m.sub && <p className="text-[11px] text-gray-400 mt-1 truncate">{m.sub}</p>}
                    </div>
                ))}
            </div>

            {/* KPIs secundarios */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                {miniCards.map((m) => (
                    <div key={m.label} className="bg-white p-3 rounded-xl border border-gray-100 shadow-sm flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${m.color}`}>
                            <m.icon className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                            <p className="text-lg font-black text-gray-800 leading-tight">{m.value}</p>
                            <p className="text-[10px] text-gray-400 uppercase font-bold tracking-wider truncate">{m.label}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* Gráficas */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                    <div className="flex items-center gap-2 mb-4">
                        <TrendingUp className="w-4 h-4 text-rotary-blue" />
                        <h3 className="font-bold text-gray-800">Actividad de correo</h3>
                        <span className="text-xs text-gray-400">· envíos, aperturas y clics por día</span>
                    </div>
                    {hasActivity ? (
                        <ResponsiveContainer width="100%" height={260}>
                            <AreaChart data={chartData} margin={{ top: 5, right: 8, left: -18, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="gSent" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#3b82f6" stopOpacity={0.35} /><stop offset="100%" stopColor="#3b82f6" stopOpacity={0} /></linearGradient>
                                    <linearGradient id="gOpens" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#6366f1" stopOpacity={0.3} /><stop offset="100%" stopColor="#6366f1" stopOpacity={0} /></linearGradient>
                                    <linearGradient id="gClicks" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#f59e0b" stopOpacity={0.3} /><stop offset="100%" stopColor="#f59e0b" stopOpacity={0} /></linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                                <XAxis dataKey="day" tick={{ fontSize: 10, fill: '#94a3b8' }} interval="preserveStartEnd" axisLine={false} tickLine={false} minTickGap={24} />
                                <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} allowDecimals={false} />
                                <Tooltip contentStyle={tooltipStyle} />
                                <Legend wrapperStyle={{ fontSize: 11, fontWeight: 700 }} />
                                <Area type="monotone" dataKey="sent" name="Enviados" stroke="#3b82f6" strokeWidth={2} fill="url(#gSent)" />
                                <Area type="monotone" dataKey="opens" name="Aperturas" stroke="#6366f1" strokeWidth={2} fill="url(#gOpens)" />
                                <Area type="monotone" dataKey="clicks" name="Clics" stroke="#f59e0b" strokeWidth={2} fill="url(#gClicks)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    ) : <EmptyChart text="Aún no hay actividad de envíos en este período." />}
                </div>

                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                    <div className="flex items-center gap-2 mb-4">
                        <Users className="w-4 h-4 text-purple-600" />
                        <h3 className="font-bold text-gray-800">Crecimiento de contactos</h3>
                    </div>
                    {hasGrowth ? (
                        <ResponsiveContainer width="100%" height={260}>
                            <BarChart data={chartData} margin={{ top: 5, right: 8, left: -18, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                                <XAxis dataKey="day" tick={{ fontSize: 10, fill: '#94a3b8' }} interval="preserveStartEnd" axisLine={false} tickLine={false} minTickGap={24} />
                                <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} allowDecimals={false} />
                                <Tooltip contentStyle={tooltipStyle} />
                                <Bar dataKey="contacts" name="Nuevos contactos" fill="#a855f7" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    ) : <EmptyChart text="Sin contactos nuevos en este período." />}
                </div>
            </div>

            {/* Campañas recientes + Top */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
                        <Megaphone className="w-4 h-4 text-rotary-blue" />
                        <h3 className="font-bold text-gray-800">Campañas recientes</h3>
                    </div>
                    {data.recentCampaigns.length === 0 ? (
                        <div className="p-10 text-center text-gray-400 text-sm">Aún no hay campañas.</div>
                    ) : (
                        <div className="divide-y divide-gray-50">
                            {data.recentCampaigns.map((c2) => {
                                const meta = STATUS_META[c2.status] || STATUS_META.draft;
                                const sentLike = c2.status === 'sent' || c2.status === 'failed';
                                return (
                                    <div key={c2.id} className="px-5 py-3 flex items-center gap-4 hover:bg-gray-50/60 transition-colors">
                                        <div className="min-w-0 flex-1">
                                            <p className="font-semibold text-gray-800 text-sm truncate">{c2.name}</p>
                                            <p className="text-xs text-gray-400 truncate">{c2.subject}</p>
                                        </div>
                                        {sentLike ? (
                                            <div className="hidden sm:flex items-center gap-5 text-center shrink-0">
                                                <div><p className="text-sm font-bold text-emerald-600">{fmt(c2.sentCount)}</p><p className="text-[9px] text-gray-400 uppercase font-bold">Env.</p></div>
                                                <div><p className="text-sm font-bold text-indigo-600">{pct(c2.openRate)}</p><p className="text-[9px] text-gray-400 uppercase font-bold">Aper.</p></div>
                                                <div><p className="text-sm font-bold text-amber-600">{pct(c2.clickRate)}</p><p className="text-[9px] text-gray-400 uppercase font-bold">Clic</p></div>
                                            </div>
                                        ) : (
                                            <span className="text-xs text-gray-300 shrink-0 hidden sm:block">Sin métricas</span>
                                        )}
                                        <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase shrink-0 ${meta.cls}`}>{meta.label}</span>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
                        <Target className="w-4 h-4 text-emerald-600" />
                        <h3 className="font-bold text-gray-800">Mejor rendimiento</h3>
                        <span className="text-[11px] text-gray-400">· por apertura</span>
                    </div>
                    {data.topCampaigns.length === 0 ? (
                        <div className="p-10 text-center text-gray-400 text-sm">Sin campañas enviadas todavía.</div>
                    ) : (
                        <div className="divide-y divide-gray-50">
                            {data.topCampaigns.map((c2, i) => (
                                <div key={c2.id} className="px-5 py-3 flex items-center gap-3">
                                    <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-black shrink-0 ${i === 0 ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'}`}>{i + 1}</span>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-semibold text-gray-800 truncate">{c2.name}</p>
                                        <p className="text-[11px] text-gray-400">{fmt(c2.sentCount)} enviados · {pct(c2.clickRate)} clic</p>
                                    </div>
                                    <span className="text-sm font-black text-indigo-600 shrink-0">{pct(c2.openRate)}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <p className="text-center text-[11px] text-gray-300">
                Actualizado {new Date(data.generatedAt).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </p>
        </div>
    );
};

const EmptyChart: React.FC<{ text: string }> = ({ text }) => (
    <div className="h-[260px] flex items-center justify-center text-sm text-gray-300 text-center px-6">{text}</div>
);

export default EmailDashboard;
