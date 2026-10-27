import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Calendar, Users, Wallet, Banknote, Building2, FolderKanban,
    Sparkles, MapPin, CalendarCheck, CheckCircle2, AlertTriangle,
    Info, ArrowRight, RefreshCw, TrendingUp, TrendingDown,
    Filter, ArrowUpRight, ShieldCheck, Clock, Globe,
    ChevronRight, ExternalLink, Layers, Award, DollarSign
} from 'lucide-react';
import {
    ResponsiveContainer, LineChart, Line, AreaChart, Area,
    BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend
} from 'recharts';
import { useAuth } from '../../hooks/useAuth';
import { useSiteAccess } from '../../hooks/useSiteAccess';
import { useClub } from '../../contexts/ClubContext';
import { formatMoney, formatNumber } from '../../lib/locale';
// v4.1259 — Centro de Gestión del Evento: proyectos postulados e inscripciones
// dentro del dashboard, con los MISMOS módulos de siempre.
import {
    ManagementCards, ManagementPanelView, ManagementTabs, useManagementCenter,
    MANAGEMENT_PANELS, type ManagementPanel,
} from '../../components/admin/feria/EventManagementCenter';

/** La pestaña del Centro de Gestión vive en la URL (`?panel=`): «atrás» funciona y se puede compartir. */
const panelFromUrl = (): ManagementPanel => {
    const raw = new URLSearchParams(window.location.search).get('panel') as ManagementPanel | null;
    return raw && MANAGEMENT_PANELS.includes(raw) ? raw : 'resumen';
};

const API = import.meta.env.VITE_API_URL || '/api';

interface DashboardData {
    event: {
        id: string;
        title: string;
        editionName: string;
        city: string;
        country: string;
        venue: string;
        startDate: string;
        endDate: string;
        dateRangeLabel: string;
        status: string;
        statusLabel: string;
    };
    period: {
        key: string;
        label: string;
        from: string | null;
        to: string | null;
    };
    kpis: {
        registrations: {
            total: number;
            settled: number;
            pending: number;
            failed: number;
            confirmationRate: number;
            periodRegistrations: number;
            periodSettled: number;
            delta: number;
        };
        participants: {
            totalExpected: number;
            confirmedExpected: number;
            companions: number;
            accredited: number;
        };
        submissions: {
            total: number;
            paid: number;
            pending: number;
            pendingReview: number;
            inReview: number;
            approved: number;
            sentToGrants: number;
            conversionRate: number;
            periodTotal: number;
            periodPaid: number;
            delta: number;
        };
        revenue: {
            copConfirmed: number;
            copSubmissions: number;
            copEvents: number;
            usdConfirmed: number;
            usdEquivalentSubmissions: number;
            avgTrm: number;
            refunded: number;
            pendingCopEstimate: number;
        };
        institutional: {
            clubsEvents: number;
            clubsSubmissions: number;
            districtsEvents: number;
            districtsSubmissions: number;
            countriesEvents: number;
            countriesSubmissions: number;
        };
        projects: {
            submissionsTotal: number;
            submissionsInReview: number;
            submissionsApproved: number;
            publishedInBank: number;
        };
    };
    funnel: Array<{
        key: string;
        label: string;
        count: number;
        rate: number;
    }>;
    timeline: Array<{
        day: string;
        submissions: number;
        paidSubmissions: number;
        registrations: number;
        settledRegistrations: number;
        confirmedPayments: number;
        amountCop: number;
        amountUsd: number;
        cumRegistrations: number;
        cumSubmissions: number;
        cumConfirmedPayments: number;
        cumAmountCop: number;
        cumAmountUsd: number;
    }>;
    participation: {
        byCountry: Array<{ country: string; count: number; percentage: number }>;
        byDistrict: Array<{ district: string; count: number }>;
        byClub: Array<{ club: string; count: number }>;
        byCategory: Array<{
            key: string;
            label: string;
            count: number;
            settled: number;
            amountCop: number;
            amountUsd: number;
        }>;
    };
    alerts: Array<{
        id: string;
        severity: 'warning' | 'info' | 'success';
        title: string;
        description: string;
        link: string;
    }>;
    recentActivity: Array<{
        id: string;
        type: 'submission' | 'registration';
        title: string;
        subtitle: string;
        status: string;
        statusType: 'success' | 'warning' | 'info';
        createdAt: string;
        link: string;
    }>;
    lastUpdated: string;
}

export const ProjectFairDashboard: React.FC = () => {
    const navigate = useNavigate();
    const { user, token } = useAuth();
    const { grant } = useSiteAccess();
    const { club } = useClub();

    // Estado de filtros y datos
    const [periodKey, setPeriodKey] = useState<string>('all');
    const [customFrom, setCustomFrom] = useState<string>('');
    const [customTo, setCustomTo] = useState<string>('');
    const [showCustomModal, setShowCustomModal] = useState<boolean>(false);
    const [timelineMode, setTimelineMode] = useState<'cumulative' | 'daily'>('cumulative');
    const [activeSeries, setActiveSeries] = useState<{
        registrations: boolean;
        submissions: boolean;
        payments: boolean;
    }>({
        registrations: true,
        submissions: true,
        payments: true,
    });
    const [selectedCurrency, setSelectedCurrency] = useState<'COP' | 'USD'>('COP');

    const [data, setData] = useState<DashboardData | null>(null);
    // v4.1259 — Centro de Gestión. `refreshKey` vuelve a pedir los
    // indicadores de las tarjetas cada vez que se regresa al Resumen.
    const [panel, setPanelState] = useState<ManagementPanel>(panelFromUrl);
    const [refreshKey, setRefreshKey] = useState(0);
    const [loading, setLoading] = useState<boolean>(true);
    const [refreshing, setRefreshing] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);

    // Cargar datos del Centro de Inteligencia
    const fetchDashboard = async (isManualRefresh = false) => {
        if (isManualRefresh) setRefreshing(true);
        else setLoading(true);
        setError(null);

        try {
            const params = new URLSearchParams();
            params.set('evento', '205348ec-83fd-475d-931c-9cdc3fdf8f62');
            params.set('period', periodKey);
            if (periodKey === 'custom' && customFrom && customTo) {
                params.set('from', customFrom);
                params.set('to', customTo);
            }

            const res = await fetch(`${API}/project-fair/admin/dashboard-intelligence?${params.toString()}`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (!res.ok) {
                throw new Error(`Error al consultar métricas (${res.status})`);
            }

            const json = await res.json();
            setData(json);
        } catch (err: any) {
            console.error('[ProjectFairDashboard] Error fetching data:', err);
            setError(err.message || 'Error de conexión');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => {
        fetchDashboard();
    }, [token, periodKey]);

    // La edición del dashboard es la que reporta el servidor; mientras carga,
    // la de Valledupar 2027 (la misma que ya pide `fetchDashboard`).
    const editionEventId = data?.event?.id || '205348ec-83fd-475d-931c-9cdc3fdf8f62';
    const management = useManagementCenter(editionEventId, refreshKey);

    const setPanel = (next: ManagementPanel) => {
        if (next === panel) return;
        const url = new URL(window.location.href);
        if (next === 'resumen') url.searchParams.delete('panel'); else url.searchParams.set('panel', next);
        window.history.pushState(null, '', url.toString());
        setPanelState(next);
        // Al volver al Resumen se revalidan las cifras: lo que se hizo en un
        // módulo tiene que verse sin recargar la página.
        if (next === 'resumen') { setRefreshKey(k => k + 1); fetchDashboard(true); }
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };
    useEffect(() => {
        const onPop = () => setPanelState(panelFromUrl());
        window.addEventListener('popstate', onPop);
        return () => window.removeEventListener('popstate', onPop);
    }, []);

    const handleApplyCustomPeriod = () => {
        if (!customFrom || !customTo) return;
        if (new Date(customFrom) > new Date(customTo)) {
            alert('La fecha inicial no puede ser posterior a la fecha final.');
            return;
        }
        setShowCustomModal(false);
        setPeriodKey('custom');
        fetchDashboard();
    };

    // Formateo de fecha de actualización
    const formattedLastUpdated = useMemo(() => {
        if (!data?.lastUpdated) return 'Actualizando...';
        try {
            const d = new Date(data.lastUpdated);
            return d.toLocaleString('es-CO', {
                timeZone: 'America/Bogota',
                dateStyle: 'medium',
                timeStyle: 'short'
            });
        } catch {
            return data.lastUpdated;
        }
    }, [data?.lastUpdated]);

    // Días timeline formateados
    const formattedTimeline = useMemo(() => {
        if (!data?.timeline) return [];
        return data.timeline.map(t => {
            let label = t.day;
            try {
                const parts = t.day.split('-');
                if (parts.length === 3) {
                    label = `${parts[2]}/${parts[1]}`;
                }
            } catch { /* ... */ }
            return {
                ...t,
                displayDay: label,
                valueReg: timelineMode === 'cumulative' ? t.cumRegistrations : t.registrations,
                valueSub: timelineMode === 'cumulative' ? t.cumSubmissions : t.submissions,
                valuePay: timelineMode === 'cumulative' ? t.cumConfirmedPayments : t.confirmedPayments,
                valueCop: timelineMode === 'cumulative' ? t.cumAmountCop : t.amountCop,
                valueUsd: timelineMode === 'cumulative' ? t.cumAmountUsd : t.amountUsd,
            };
        });
    }, [data?.timeline, timelineMode]);

    return (
        <div className="space-y-8 pb-16 max-w-7xl mx-auto">
            {/* ============================================================ */}
            {/* ÁREA 1: ENCABEZADO EJECUTIVO (Navy Rotary High-Contrast)     */}
            {/* ============================================================ */}
            <div className="relative overflow-hidden bg-gradient-to-r from-[#0a1e3b] via-[#00246c] to-[#0a1e3b] rounded-3xl p-6 sm:p-8 text-white shadow-2xl border border-white/10">
                {/* Glow decorativo sutil */}
                <div className="absolute top-0 right-0 -translate-y-12 translate-x-12 w-96 h-96 bg-blue-500/15 rounded-full blur-3xl pointer-events-none" />
                <div className="absolute bottom-0 left-1/4 w-80 h-80 bg-amber-400/10 rounded-full blur-3xl pointer-events-none" />

                <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                    {/* Bloque de Identidad Institucional */}
                    <div className="space-y-3.5 max-w-3xl">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-400/20 text-amber-300 border border-amber-400/30 shadow-sm backdrop-blur-md">
                                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                                {data?.event?.editionName || 'XII Feria de Proyectos Rotary Colombia — Valledupar 2027'}
                            </span>
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-white/10 text-sky-200 border border-white/20 backdrop-blur-md">
                                <MapPin className="w-3.5 h-3.5 text-sky-300" />
                                {data?.event?.city || 'Valledupar'}, {data?.event?.country || 'Colombia'} | 2027
                            </span>
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                                {data?.event?.statusLabel || 'Convocatoria e Inscripciones Abiertas'}
                            </span>
                        </div>

                        <div>
                            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-white drop-shadow-sm">
                                {data?.event?.title || 'XII Feria de Proyectos Rotarios'}
                            </h1>
                            <p className="text-base sm:text-lg font-medium text-sky-200 mt-1">
                                Centro de Inteligencia y Gestión de la Feria de Proyectos
                            </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-3 text-xs sm:text-sm text-slate-200 pt-1">
                            <span className="font-semibold text-white">Administrador Institucional — Comité Organizador</span>
                            <span className="text-white/40">•</span>
                            <span className="text-slate-300 font-mono">{user?.email || 'valledupar@rotaryprojectfaircolombia.org'}</span>
                        </div>
                    </div>

                    {/* Ficha Contextual Sede y Fechas */}
                    <div className="flex flex-col sm:flex-row lg:flex-col gap-2.5 flex-shrink-0">
                        <div className="p-3.5 rounded-2xl bg-white/10 backdrop-blur-md border border-white/15 text-xs space-y-1 min-w-[240px]">
                            <div className="flex items-center gap-2 text-sky-200">
                                <Building2 className="w-4 h-4 text-amber-400" />
                                <span className="font-semibold uppercase tracking-wider text-[11px]">Sede Oficial:</span>
                            </div>
                            <p className="font-bold text-white pl-6 text-sm">
                                {data?.event?.venue || 'Sonesta Hotel Valledupar, Cesar'}
                            </p>
                        </div>

                        <div className="p-3.5 rounded-2xl bg-white/10 backdrop-blur-md border border-white/15 text-xs space-y-1 min-w-[240px]">
                            <div className="flex items-center gap-2 text-sky-200">
                                <CalendarCheck className="w-4 h-4 text-emerald-400" />
                                <span className="font-semibold uppercase tracking-wider text-[11px]">Fechas Confirmadas:</span>
                            </div>
                            <p className="font-bold text-white pl-6 text-sm">
                                {data?.event?.dateRangeLabel || '28 al 31 de enero de 2027'}
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* ============================================================ */}
            {/* v4.1259 — CENTRO DE GESTIÓN DEL EVENTO (nivel 2)             */}
            {/* Lo operativo primero: las pestañas abren los módulos aquí    */}
            {/* mismo; el Resumen conserva las tarjetas, los indicadores y   */}
            {/* los gráficos de siempre.                                     */}
            {/* ============================================================ */}
            <section className="space-y-4" aria-label="Centro de Gestión del Evento">
                <div>
                    <h2 className="text-lg font-bold text-slate-900">Centro de Gestión del Evento</h2>
                    <p className="text-sm text-slate-500">Proyectos postulados e inscripciones al evento son dos procesos distintos: cada uno con sus datos, sus estados y sus pagos.</p>
                </div>
                <ManagementTabs panel={panel} onPanel={setPanel}
                    projects={management.projects} registrations={management.registrations} />
                {panel === 'resumen' ? (
                    <ManagementCards projects={management.projects} registrations={management.registrations}
                        onOpen={setPanel} onRetry={management.reload} />
                ) : (
                    <ManagementPanelView panel={panel} eventId={editionEventId} registrations={management.registrations} />
                )}
            </section>

            {panel === 'resumen' && (<>
            {/* ============================================================ */}
            {/* ÁREA 2: FILTRO GLOBAL DE PERÍODOS Y SINCRONIZACIÓN           */}
            {/* ============================================================ */}
            <div className="bg-white rounded-2xl p-4 sm:p-5 border border-gray-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                    <Filter className="w-4 h-4 text-rotary-blue flex-shrink-0" />
                    <div>
                        <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Período de Análisis:</span>
                        <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-sm font-black text-gray-900">{data?.period?.label || 'Histórico completo'}</span>
                            {periodKey !== 'all' && (
                                <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                                    Comparando vs período anterior
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    {/* Selector de Períodos Rápidos */}
                    <div className="inline-flex p-1 bg-gray-100 rounded-xl text-xs font-semibold text-gray-600">
                        {[
                            { key: '7d', label: '7 días' },
                            { key: '15d', label: '15 días' },
                            { key: '30d', label: '30 días' },
                            { key: '90d', label: '3 meses' },
                            { key: 'all', label: 'Histórico' },
                        ].map(p => (
                            <button
                                key={p.key}
                                onClick={() => setPeriodKey(p.key)}
                                className={`px-3 py-1.5 rounded-lg transition-all ${
                                    periodKey === p.key
                                        ? 'bg-white text-rotary-blue shadow-xs font-bold'
                                        : 'hover:text-gray-900'
                                }`}
                            >
                                {p.label}
                            </button>
                        ))}
                        <button
                            onClick={() => setShowCustomModal(true)}
                            className={`px-3 py-1.5 rounded-lg transition-all ${
                                periodKey === 'custom'
                                    ? 'bg-white text-rotary-blue shadow-xs font-bold'
                                    : 'hover:text-gray-900'
                            }`}
                        >
                            Personalizado
                        </button>
                    </div>

                    {/* Estado de sincronización y botón refresh */}
                    <div className="flex items-center gap-2 pl-2 border-l border-gray-200 text-xs text-gray-500">
                        <span className="hidden sm:inline">Actualizado: <strong className="text-gray-700">{formattedLastUpdated}</strong></span>
                        <button
                            onClick={() => fetchDashboard(true)}
                            disabled={refreshing}
                            title="Sincronizar métricas con fuentes oficiales"
                            className="p-2 rounded-xl text-gray-600 hover:text-rotary-blue hover:bg-gray-100 transition-colors disabled:opacity-50"
                        >
                            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-rotary-blue' : ''}`} />
                        </button>
                    </div>
                </div>
            </div>

            {/* Modal de Fecha Personalizada */}
            {showCustomModal && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-gray-200 space-y-4">
                        <h3 className="text-lg font-bold text-gray-900">Seleccionar Rango Personalizado</h3>
                        <p className="text-xs text-gray-500">
                            Define la fecha inicial y final para filtrar las postulaciones, inscripciones y recaudación.
                        </p>

                        <div className="grid grid-cols-2 gap-3 pt-2">
                            <div>
                                <label className="block text-xs font-bold text-gray-700 mb-1">Desde:</label>
                                <input
                                    type="date"
                                    value={customFrom}
                                    onChange={e => setCustomFrom(e.target.value)}
                                    className="w-full text-xs px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-rotary-blue focus:outline-hidden"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-700 mb-1">Hasta:</label>
                                <input
                                    type="date"
                                    value={customTo}
                                    onChange={e => setCustomTo(e.target.value)}
                                    className="w-full text-xs px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-rotary-blue focus:outline-hidden"
                                />
                            </div>
                        </div>

                        <div className="flex justify-end gap-2 pt-4">
                            <button
                                onClick={() => setShowCustomModal(false)}
                                className="px-4 py-2 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleApplyCustomPeriod}
                                className="px-4 py-2 text-xs font-bold bg-rotary-blue text-white rounded-xl shadow-xs hover:bg-blue-800 transition-colors"
                            >
                                Aplicar Período
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ============================================================ */}
            {/* ÁREA 3: INDICADORES EJECUTIVOS (KPIs)                        */}
            {/* ============================================================ */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {/* KPI 1: Inscripciones al Evento */}
                <div
                    onClick={() => navigate('/admin/eventos')}
                    className="p-5 rounded-2xl bg-white border border-gray-200/80 shadow-xs hover:shadow-lg transition-all cursor-pointer group flex flex-col justify-between"
                >
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                                <Calendar className="w-3.5 h-3.5 text-blue-600" />
                                Inscripciones al Evento
                            </span>
                            <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
                                Módulo Eventos
                            </span>
                        </div>

                        <div className="flex items-baseline justify-between">
                            <div className="flex items-baseline gap-2">
                                <span className="text-3xl sm:text-4xl font-black text-gray-900">
                                    {data?.kpis?.registrations?.total ?? 15}
                                </span>
                                <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">
                                    {data?.kpis?.registrations?.settled ?? 11} confirmadas
                                </span>
                            </div>

                            {periodKey !== 'all' && (
                                <span className={`text-xs font-bold flex items-center gap-0.5 ${
                                    (data?.kpis?.registrations?.delta || 0) >= 0 ? 'text-emerald-600' : 'text-rose-600'
                                }`}>
                                    {(data?.kpis?.registrations?.delta || 0) >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                                    {data?.kpis?.registrations?.delta || 0}%
                                </span>
                            )}
                        </div>

                        <p className="text-xs text-gray-600 leading-relaxed">
                            <strong>{data?.kpis?.registrations?.pending ?? 4}</strong> con pago pendiente • Tasa de confirmación: <strong>{data?.kpis?.registrations?.confirmationRate ?? 73.3}%</strong>
                        </p>
                    </div>

                    <div className="pt-3 mt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-400 group-hover:text-rotary-blue transition-colors">
                        <span className="font-semibold">Ver listado en Eventos</span>
                        <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                    </div>
                </div>

                {/* KPI 2: Participantes Esperados (Personas vs Formularios) */}
                <div
                    onClick={() => navigate('/admin/eventos')}
                    className="p-5 rounded-2xl bg-white border border-gray-200/80 shadow-xs hover:shadow-lg transition-all cursor-pointer group flex flex-col justify-between"
                >
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                                <Users className="w-3.5 h-3.5 text-purple-600" />
                                Participantes Esperados
                            </span>
                            <span className="text-[10px] font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full border border-purple-200">
                                Aforo Total
                            </span>
                        </div>

                        <div className="flex items-baseline justify-between">
                            <div className="flex items-baseline gap-2">
                                <span className="text-3xl sm:text-4xl font-black text-gray-900">
                                    {data?.kpis?.participants?.totalExpected ?? 18}
                                </span>
                                <span className="text-xs font-semibold text-purple-700 bg-purple-50 px-2 py-0.5 rounded">
                                    personas físicas
                                </span>
                            </div>
                        </div>

                        <p className="text-xs text-gray-600 leading-relaxed">
                            <strong>{data?.kpis?.participants?.confirmedExpected ?? 14}</strong> confirmadas (11 titulares + 3 acompañantes) • <strong>4</strong> en proceso
                        </p>
                    </div>

                    <div className="pt-3 mt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-400 group-hover:text-purple-600 transition-colors">
                        <span className="font-semibold">Control de Asistentes y Acompañantes</span>
                        <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                    </div>
                </div>

                {/* KPI 3: Postulaciones de Proyectos */}
                <div
                    onClick={() => navigate('/admin/postulaciones-pagos')}
                    className="p-5 rounded-2xl bg-white border border-gray-200/80 shadow-xs hover:shadow-lg transition-all cursor-pointer group flex flex-col justify-between"
                >
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                                <Wallet className="w-3.5 h-3.5 text-amber-600" />
                                Postulación de Proyectos
                            </span>
                            <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                                Convocatoria
                            </span>
                        </div>

                        <div className="flex items-baseline justify-between">
                            <div className="flex items-baseline gap-2">
                                <span className="text-3xl sm:text-4xl font-black text-gray-900">
                                    {data?.kpis?.submissions?.total ?? 12}
                                </span>
                                <span className="text-xs font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded">
                                    {data?.kpis?.submissions?.paid ?? 10} pagadas
                                </span>
                            </div>

                            {periodKey !== 'all' && (
                                <span className={`text-xs font-bold flex items-center gap-0.5 ${
                                    (data?.kpis?.submissions?.delta || 0) >= 0 ? 'text-emerald-600' : 'text-rose-600'
                                }`}>
                                    {(data?.kpis?.submissions?.delta || 0) >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                                    {data?.kpis?.submissions?.delta || 0}%
                                </span>
                            )}
                        </div>

                        <p className="text-xs text-gray-600 leading-relaxed">
                            <strong>{data?.kpis?.submissions?.pendingReview ?? 6}</strong> en revisión de comité • <strong>{data?.kpis?.submissions?.pending ?? 2}</strong> pendientes de pago
                        </p>
                    </div>

                    <div className="pt-3 mt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-400 group-hover:text-amber-600 transition-colors">
                        <span className="font-semibold">Revisar Convocatoria y Fichas</span>
                        <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                    </div>
                </div>

                {/* KPI 4: Recaudación por Moneda (Separada y Documentada) */}
                <div
                    onClick={() => navigate('/admin/postulaciones-pagos')}
                    className="p-5 rounded-2xl bg-white border border-gray-200/80 shadow-xs hover:shadow-lg transition-all cursor-pointer group flex flex-col justify-between"
                >
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                                <Banknote className="w-3.5 h-3.5 text-emerald-600" />
                                Recaudación Confirmada
                            </span>
                            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                                Finanzas Verificadas
                            </span>
                        </div>

                        <div className="space-y-1">
                            <div className="flex items-baseline justify-between">
                                <span className="text-2xl font-black text-gray-900">
                                    {formatMoney(data?.kpis?.revenue?.copConfirmed ?? 4262000, 'COP')}
                                </span>
                                <span className="text-xs font-bold text-gray-500">COP</span>
                            </div>
                            <div className="flex items-baseline justify-between">
                                <span className="text-xl font-bold text-blue-700">
                                    {formatMoney(data?.kpis?.revenue?.usdConfirmed ?? 1440, 'USD')}
                                </span>
                                <span className="text-xs font-bold text-blue-600">USD</span>
                            </div>
                        </div>

                        <p className="text-xs text-gray-600 leading-relaxed">
                            TRM promedio aplicada: <strong>$3.157 COP/USD</strong> • Reembolsos: <strong>$0</strong>
                        </p>
                    </div>

                    <div className="pt-3 mt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-400 group-hover:text-emerald-600 transition-colors">
                        <span className="font-semibold">Auditoría Financiera y Pasarela</span>
                        <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                    </div>
                </div>

                {/* KPI 5: Participación Institucional */}
                <div
                    onClick={() => navigate('/admin/eventos')}
                    className="p-5 rounded-2xl bg-white border border-gray-200/80 shadow-xs hover:shadow-lg transition-all cursor-pointer group flex flex-col justify-between"
                >
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                                <Building2 className="w-3.5 h-3.5 text-sky-600" />
                                Participación Institucional
                            </span>
                            <span className="text-[10px] font-bold text-sky-700 bg-sky-50 px-2 py-0.5 rounded-full border border-sky-200">
                                Procedencia
                            </span>
                        </div>

                        <div className="grid grid-cols-3 gap-2 py-1 text-center">
                            <div className="bg-sky-50/60 p-2 rounded-xl">
                                <span className="block text-2xl font-black text-gray-900">
                                    {data?.kpis?.institutional?.clubsEvents ?? 12}
                                </span>
                                <span className="text-[10px] font-bold text-sky-800 uppercase">Clubes</span>
                            </div>
                            <div className="bg-sky-50/60 p-2 rounded-xl">
                                <span className="block text-2xl font-black text-gray-900">
                                    {data?.kpis?.institutional?.districtsEvents ?? 5}
                                </span>
                                <span className="text-[10px] font-bold text-sky-800 uppercase">Distritos</span>
                            </div>
                            <div className="bg-sky-50/60 p-2 rounded-xl">
                                <span className="block text-2xl font-black text-gray-900">
                                    {data?.kpis?.institutional?.countriesEvents ?? 4}
                                </span>
                                <span className="text-[10px] font-bold text-sky-800 uppercase">Países</span>
                            </div>
                        </div>

                        <p className="text-xs text-gray-600 leading-relaxed">
                            <strong>10 clubes</strong> y <strong>2 distritos</strong> participando activamente en postulaciones de proyectos.
                        </p>
                    </div>

                    <div className="pt-3 mt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-400 group-hover:text-sky-600 transition-colors">
                        <span className="font-semibold">Ver Procedencia y Clubes</span>
                        <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                    </div>
                </div>

                {/* KPI 6: Proyectos (Diferenciación Feria vs Banco) */}
                <div
                    onClick={() => navigate('/admin/proyectos')}
                    className="p-5 rounded-2xl bg-white border border-gray-200/80 shadow-xs hover:shadow-lg transition-all cursor-pointer group flex flex-col justify-between"
                >
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                                <FolderKanban className="w-3.5 h-3.5 text-teal-600" />
                                Estado de Proyectos
                            </span>
                            <span className="text-[10px] font-bold text-teal-700 bg-teal-50 px-2 py-0.5 rounded-full border border-teal-200">
                                Banco vs Convocatoria
                            </span>
                        </div>

                        <div className="flex items-baseline justify-between">
                            <div className="flex items-baseline gap-2">
                                <span className="text-3xl sm:text-4xl font-black text-gray-900">
                                    {data?.kpis?.projects?.submissionsTotal ?? 12}
                                </span>
                                <span className="text-xs font-semibold text-teal-700 bg-teal-50 px-2 py-0.5 rounded">
                                    postulados
                                </span>
                            </div>
                            <span className="text-xs font-bold text-gray-500">
                                0 en Banco
                            </span>
                        </div>

                        <p className="text-xs text-gray-600 leading-relaxed">
                            <strong>{data?.kpis?.projects?.submissionsInReview ?? 6}</strong> en revisión técnica • <strong>0</strong> publicados en el catálogo general.
                        </p>
                    </div>

                    <div className="pt-3 mt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-400 group-hover:text-teal-600 transition-colors">
                        <span className="font-semibold">Gestionar Banco de Proyectos</span>
                        <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                    </div>
                </div>
            </div>

            {/* ============================================================ */}
            {/* ÁREA 4: GRÁFICAS DE CRECIMIENTO Y CONVERSIÓN                  */}
            {/* ============================================================ */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Gráfica Principal: Evolución de la Feria (2 columnas) */}
                <div className="lg:col-span-2 bg-white rounded-3xl p-6 border border-gray-200/80 shadow-xs space-y-5">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                                <TrendingUp className="w-5 h-5 text-rotary-blue" />
                                Evolución Temporal de la Feria
                            </h2>
                            <p className="text-xs text-gray-500">
                                Comportamiento cronológico de inscripciones, postulaciones y pagos confirmados
                            </p>
                        </div>

                        {/* Controles de vista y series */}
                        <div className="flex items-center gap-2">
                            <div className="inline-flex p-1 bg-gray-100 rounded-xl text-xs font-semibold">
                                <button
                                    onClick={() => setTimelineMode('cumulative')}
                                    className={`px-3 py-1 rounded-lg transition-all ${
                                        timelineMode === 'cumulative'
                                            ? 'bg-white text-rotary-blue shadow-xs font-bold'
                                            : 'text-gray-600 hover:text-gray-900'
                                    }`}
                                >
                                    Acumulado
                                </button>
                                <button
                                    onClick={() => setTimelineMode('daily')}
                                    className={`px-3 py-1 rounded-lg transition-all ${
                                        timelineMode === 'daily'
                                            ? 'bg-white text-rotary-blue shadow-xs font-bold'
                                            : 'text-gray-600 hover:text-gray-900'
                                    }`}
                                >
                                    Diario
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Toggles de series individuales */}
                    <div className="flex flex-wrap items-center gap-3 text-xs">
                        <label className="flex items-center gap-1.5 cursor-pointer select-none">
                            <input
                                type="checkbox"
                                checked={activeSeries.registrations}
                                onChange={e => setActiveSeries(p => ({ ...p, registrations: e.target.checked }))}
                                className="rounded text-blue-600 focus:ring-0"
                            />
                            <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#0050A4]" />
                            <span className="font-semibold text-gray-700">Inscripciones Evento</span>
                        </label>
                        <label className="flex items-center gap-1.5 cursor-pointer select-none">
                            <input
                                type="checkbox"
                                checked={activeSeries.submissions}
                                onChange={e => setActiveSeries(p => ({ ...p, submissions: e.target.checked }))}
                                className="rounded text-amber-600 focus:ring-0"
                            />
                            <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#D97706]" />
                            <span className="font-semibold text-gray-700">Postulaciones Proyectos</span>
                        </label>
                        <label className="flex items-center gap-1.5 cursor-pointer select-none">
                            <input
                                type="checkbox"
                                checked={activeSeries.payments}
                                onChange={e => setActiveSeries(p => ({ ...p, payments: e.target.checked }))}
                                className="rounded text-emerald-600 focus:ring-0"
                            />
                            <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#059669]" />
                            <span className="font-semibold text-gray-700">Pagos Confirmados</span>
                        </label>
                    </div>

                    {/* Gráfica Recharts */}
                    <div className="h-72 w-full pt-2">
                        {formattedTimeline.length === 0 ? (
                            <div className="h-full flex items-center justify-center text-xs text-gray-400">
                                No se encontraron registros en el período seleccionado.
                            </div>
                        ) : (
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={formattedTimeline} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                    <XAxis
                                        dataKey="displayDay"
                                        tick={{ fontSize: 11, fill: '#64748b' }}
                                        tickLine={false}
                                    />
                                    <YAxis
                                        tick={{ fontSize: 11, fill: '#64748b' }}
                                        tickLine={false}
                                        allowDecimals={false}
                                    />
                                    <Tooltip
                                        content={({ active, payload, label }) => {
                                            if (!active || !payload || !payload.length) return null;
                                            const item = payload[0].payload;
                                            return (
                                                <div className="bg-slate-900 text-white rounded-xl p-3 shadow-xl text-xs space-y-1.5 border border-slate-700">
                                                    <p className="font-bold text-amber-400 border-b border-slate-700 pb-1">
                                                        Fecha: {item.day}
                                                    </p>
                                                    {activeSeries.registrations && (
                                                        <div className="flex justify-between gap-4">
                                                            <span className="text-blue-300">Inscripciones:</span>
                                                            <span className="font-bold">{item.valueReg}</span>
                                                        </div>
                                                    )}
                                                    {activeSeries.submissions && (
                                                        <div className="flex justify-between gap-4">
                                                            <span className="text-amber-300">Postulaciones:</span>
                                                            <span className="font-bold">{item.valueSub}</span>
                                                        </div>
                                                    )}
                                                    {activeSeries.payments && (
                                                        <div className="flex justify-between gap-4">
                                                            <span className="text-emerald-300">Pagos confirmados:</span>
                                                            <span className="font-bold">{item.valuePay}</span>
                                                        </div>
                                                    )}
                                                    <div className="pt-1 mt-1 border-t border-slate-800 text-[10px] text-slate-400 flex justify-between gap-4">
                                                        <span>Recaudo registrado:</span>
                                                        <span>{formatMoney(item.valueCop, 'COP')}</span>
                                                    </div>
                                                </div>
                                            );
                                        }}
                                    />
                                    {activeSeries.registrations && (
                                        <Line
                                            type="monotone"
                                            dataKey="valueReg"
                                            stroke="#0050A4"
                                            strokeWidth={3}
                                            dot={{ r: 3, fill: '#0050A4' }}
                                            activeDot={{ r: 5 }}
                                            name="Inscripciones"
                                        />
                                    )}
                                    {activeSeries.submissions && (
                                        <Line
                                            type="monotone"
                                            dataKey="valueSub"
                                            stroke="#D97706"
                                            strokeWidth={3}
                                            dot={{ r: 3, fill: '#D97706' }}
                                            activeDot={{ r: 5 }}
                                            name="Postulaciones"
                                        />
                                    )}
                                    {activeSeries.payments && (
                                        <Line
                                            type="monotone"
                                            dataKey="valuePay"
                                            stroke="#059669"
                                            strokeWidth={3}
                                            dot={{ r: 3, fill: '#059669' }}
                                            activeDot={{ r: 5 }}
                                            name="Pagos Confirmados"
                                        />
                                    )}
                                </LineChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </div>

                {/* Gráfica Secundaria: Embudo de Conversión de Postulaciones (Funnel) */}
                <div className="bg-white rounded-3xl p-6 border border-gray-200/80 shadow-xs space-y-4 flex flex-col justify-between">
                    <div>
                        <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                            <Layers className="w-5 h-5 text-amber-600" />
                            Embudo de Conversión
                        </h2>
                        <p className="text-xs text-gray-500">
                            Eficiencia operativa del proceso de postulación
                        </p>
                    </div>

                    <div className="space-y-3 py-1">
                        {(data?.funnel || [
                            { key: 'submitted', label: 'Formulario enviado', count: 12, rate: 100 },
                            { key: 'paid', label: 'Pago confirmado', count: 10, rate: 83.3 },
                            { key: 'in_review', label: 'En revisión técnica', count: 6, rate: 50.0 },
                            { key: 'approved', label: 'Aprobada por comité', count: 0, rate: 0 },
                            { key: 'sent_to_grants', label: 'Enviada a Rotary Grants', count: 0, rate: 0 },
                        ]).map((stage, idx) => (
                            <div key={stage.key} className="space-y-1">
                                <div className="flex items-center justify-between text-xs font-semibold">
                                    <span className="text-gray-700">{stage.label}</span>
                                    <span className="font-bold text-gray-900">
                                        {stage.count} <span className="text-gray-400 font-normal">({stage.rate}%)</span>
                                    </span>
                                </div>
                                <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
                                    <div
                                        className={`h-full rounded-full transition-all duration-500 ${
                                            idx === 0 ? 'bg-blue-600' :
                                            idx === 1 ? 'bg-emerald-600' :
                                            idx === 2 ? 'bg-amber-500' :
                                            'bg-purple-600'
                                        }`}
                                        style={{ width: `${Math.max(stage.rate, 2)}%` }}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="bg-amber-50/70 border border-amber-200/60 rounded-2xl p-3 text-xs text-amber-900 space-y-1">
                        <p className="font-bold flex items-center gap-1.5">
                            <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                            Conversión Destacada: 83.3%
                        </p>
                        <p className="text-[11px] text-amber-800">
                            10 de los 12 clubes postulantes completaron el abono de inscripción con éxito.
                        </p>
                    </div>
                </div>
            </div>

            {/* ============================================================ */}
            {/* ÁREA 5: INTELIGENCIA DE PARTICIPACIÓN                        */}
            {/* ============================================================ */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
                {/* Distribución por Países */}
                <div className="bg-white rounded-3xl p-5 border border-gray-200/80 shadow-xs space-y-4">
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                            <Globe className="w-4 h-4 text-blue-600" />
                            Por País
                        </h3>
                        <span className="text-[10px] font-bold text-gray-400 uppercase">Asistentes</span>
                    </div>

                    <div className="space-y-2.5 text-xs">
                        {(data?.participation?.byCountry || [
                            { country: 'Colombia', count: 11, percentage: 73.3 },
                            { country: 'Estados Unidos', count: 2, percentage: 13.3 },
                            { country: 'Canadá', count: 1, percentage: 6.7 },
                            { country: 'Venezuela', count: 1, percentage: 6.7 },
                        ]).map(c => (
                            <div key={c.country} className="space-y-1">
                                <div className="flex justify-between">
                                    <span className="font-medium text-gray-700">{c.country}</span>
                                    <span className="font-bold text-gray-900">{c.count} ({c.percentage}%)</span>
                                </div>
                                <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                                    <div
                                        className="h-full bg-blue-600 rounded-full"
                                        style={{ width: `${c.percentage}%` }}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Distribución por Distritos */}
                <div className="bg-white rounded-3xl p-5 border border-gray-200/80 shadow-xs space-y-4">
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                            <Award className="w-4 h-4 text-purple-600" />
                            Por Distrito
                        </h3>
                        <span className="text-[10px] font-bold text-gray-400 uppercase">Top Sedes</span>
                    </div>

                    <div className="space-y-2 text-xs">
                        {(data?.participation?.byDistrict || [
                            { district: 'Distrito 4271', count: 6 },
                            { district: 'Distrito 4281', count: 6 },
                            { district: 'Distrito 7680', count: 1 },
                            { district: 'Distrito 4370', count: 1 },
                        ]).slice(0, 5).map(d => (
                            <div key={d.district} className="flex items-center justify-between p-2 rounded-xl bg-gray-50 hover:bg-purple-50/50 transition-colors">
                                <span className="font-semibold text-gray-700">{d.district}</span>
                                <span className="font-black text-purple-700 bg-purple-100/60 px-2 py-0.5 rounded-md">
                                    {d.count}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Distribución por Clubes */}
                <div className="bg-white rounded-3xl p-5 border border-gray-200/80 shadow-xs space-y-4">
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                            <Building2 className="w-4 h-4 text-emerald-600" />
                            Clubes Líderes
                        </h3>
                        <span className="text-[10px] font-bold text-gray-400 uppercase">Inscritos</span>
                    </div>

                    <div className="space-y-2 text-xs">
                        {(data?.participation?.byClub || [
                            { club: 'E-Club Origen', count: 3 },
                            { club: 'Pasto Valle de Atriz', count: 2 },
                            { club: 'Nuevo Medellín', count: 1 },
                            { club: 'Bogotá Centenario', count: 1 },
                        ]).slice(0, 5).map(c => (
                            <div key={c.club} className="flex items-center justify-between p-2 rounded-xl bg-gray-50 hover:bg-emerald-50/50 transition-colors">
                                <span className="font-semibold text-gray-700 truncate pr-2" title={c.club}>{c.club}</span>
                                <span className="font-black text-emerald-700 bg-emerald-100/60 px-2 py-0.5 rounded-md">
                                    {c.count}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Categorías de Inscripción */}
                <div className="bg-white rounded-3xl p-5 border border-gray-200/80 shadow-xs space-y-4">
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                            <Layers className="w-4 h-4 text-amber-600" />
                            Categorías
                        </h3>
                        <span className="text-[10px] font-bold text-gray-400 uppercase">Tarifas</span>
                    </div>

                    <div className="space-y-2 text-xs">
                        {(data?.participation?.byCategory || [
                            { key: 'nacional', label: 'Registro Nacional', count: 9, amountCop: 2012000, amountUsd: 0 },
                            { key: 'internacional', label: 'Registro Internacional', count: 4, amountCop: 0, amountUsd: 1050 },
                            { key: 'cadre', label: 'CADRE', count: 2, amountCop: 0, amountUsd: 390 },
                        ]).map(cat => (
                            <div key={cat.key} className="p-2 rounded-xl bg-gray-50 space-y-1">
                                <div className="flex justify-between font-bold text-gray-900">
                                    <span>{cat.label}</span>
                                    <span>{cat.count} reg.</span>
                                </div>
                                <div className="text-[11px] text-gray-500 font-medium">
                                    {cat.amountCop > 0 ? formatMoney(cat.amountCop, 'COP') : formatMoney(cat.amountUsd, 'USD')}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* ============================================================ */}
            {/* ÁREA 6: ACTIVIDAD RECIENTE Y ALERTAS OPERATIVAS             */}
            {/* ============================================================ */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Alertas Operativas (1 Columna) */}
                <div className="bg-white rounded-3xl p-6 border border-gray-200/80 shadow-xs space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                            <AlertTriangle className="w-5 h-5 text-amber-600" />
                            Alertas Operativas
                        </h2>
                        <span className="text-xs font-semibold text-gray-500">
                            {data?.alerts?.length || 0} avisos
                        </span>
                    </div>

                    <div className="space-y-3">
                        {(data?.alerts || []).map(alt => (
                            <div
                                key={alt.id}
                                onClick={() => navigate(alt.link)}
                                className={`p-4 rounded-2xl border transition-all cursor-pointer group space-y-1.5 ${
                                    alt.severity === 'warning'
                                        ? 'bg-amber-50/70 border-amber-200/80 hover:bg-amber-100/60'
                                        : alt.severity === 'success'
                                        ? 'bg-emerald-50/70 border-emerald-200/80 hover:bg-emerald-100/60'
                                        : 'bg-sky-50/70 border-sky-200/80 hover:bg-sky-100/60'
                                }`}
                            >
                                <div className="flex items-center justify-between">
                                    <h4 className={`text-xs font-bold ${
                                        alt.severity === 'warning' ? 'text-amber-900' :
                                        alt.severity === 'success' ? 'text-emerald-900' : 'text-sky-900'
                                    }`}>
                                        {alt.title}
                                    </h4>
                                    <ArrowRight className="w-3.5 h-3.5 opacity-60 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
                                </div>
                                <p className="text-[11px] text-gray-600 leading-relaxed">
                                    {alt.description}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Actividad Reciente Cronológica (2 Columnas) */}
                <div className="lg:col-span-2 bg-white rounded-3xl p-6 border border-gray-200/80 shadow-xs space-y-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                                <Clock className="w-5 h-5 text-rotary-blue" />
                                Registro Cronológico Reciente
                            </h2>
                            <p className="text-xs text-gray-500">
                                Postulaciones e inscripciones registradas en tiempo real
                            </p>
                        </div>
                        <span className="text-xs font-semibold text-gray-400">
                            Últimos movimientos
                        </span>
                    </div>

                    <div className="divide-y divide-gray-100">
                        {(data?.recentActivity || []).length === 0 ? (
                            <p className="text-xs text-gray-400 py-6 text-center">Sin actividad reciente registrada.</p>
                        ) : (
                            data?.recentActivity.map(act => (
                                <div
                                    key={act.id}
                                    onClick={() => navigate(act.link)}
                                    className="py-3 px-2 flex items-center justify-between hover:bg-gray-50 rounded-xl transition-colors cursor-pointer group"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                                            act.type === 'submission'
                                                ? 'bg-amber-100/80 text-amber-700'
                                                : 'bg-blue-100/80 text-blue-700'
                                        }`}>
                                            {act.type === 'submission' ? <Wallet className="w-4 h-4" /> : <Calendar className="w-4 h-4" />}
                                        </div>

                                        <div className="space-y-0.5">
                                            <p className="text-xs font-bold text-gray-900 group-hover:text-rotary-blue transition-colors">
                                                {act.title}
                                            </p>
                                            <p className="text-[11px] text-gray-500">
                                                {act.subtitle}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-3 text-right">
                                        <div>
                                            <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                                act.statusType === 'success'
                                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                                    : 'bg-amber-50 text-amber-700 border border-amber-200'
                                            }`}>
                                                {act.status}
                                            </span>
                                            <p className="text-[10px] text-gray-400 mt-0.5">
                                                {new Date(act.createdAt).toLocaleDateString('es-CO', {
                                                    day: 'numeric',
                                                    month: 'short',
                                                    hour: '2-digit',
                                                    minute: '2-digit'
                                                })}
                                            </p>
                                        </div>
                                        <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-rotary-blue group-hover:translate-x-1 transition-all" />
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
            </>)}
        </div>
    );
};

export default ProjectFairDashboard;
