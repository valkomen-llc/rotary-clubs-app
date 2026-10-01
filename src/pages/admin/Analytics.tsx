import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import AdminLayout from '../../components/admin/AdminLayout';
import SocialAnalytics from '../../components/admin/analytics/SocialAnalytics';
import { useAuth } from '../../hooks/useAuth';
import { useClub } from '../../contexts/ClubContext';
import { isPlatformSuperAdmin, isOnPlatformDomain } from '../../lib/platformAdmin';
import {
    AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip,
    ResponsiveContainer,
} from 'recharts';
import {
    Users, Eye, TrendingUp, Globe, RefreshCw,
    MapPin, FileText, BarChart3, Share2, Search,
    ChevronDown, ArrowRight,
    Activity, AlertCircle, Calendar,
    Building2, Smartphone, Compass
} from 'lucide-react';

const API = import.meta.env.VITE_API_URL || '/api';

const fmtN = (n: number) =>
    n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M`
        : n >= 1_000 ? `${(n / 1_000).toFixed(1)}k`
            : String(n ?? 0);

const fmtDur = (secs: number) => {
    if (!secs) return '0s';
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return m ? `${m}m ${s}s` : `${s}s`;
};

const PERIOD_MAP: Record<string, string> = { '7d': '7', '30d': '30', '90d': '90', '12m': '365' };
const COLORS = ['#0c3c7c', '#3b82f6', '#60a5fa', '#93c5fd', '#bfdbfe', '#10b981', '#f59e0b'];

export interface SiteItem {
    id: string;
    name: string;
    group: 'platform' | 'districts' | 'clubs' | 'programs';
    category: string;
    type: string;
    domain: string;
    subdomain: string;
    hostnames: string[];
    status: string;
    districtId?: string;
    districtName?: string;
}

export interface SitePerformanceItem extends SiteItem {
    sessions: number;
    users: number;
    pageViews: number;
    pagesPerSession: number;
    avgDurationSec: number;
    changePct: number;
    hasTraffic: boolean;
    lastActivity: string;
}

interface TrafficData {
    chartData: { name: string; value: number; users: number; pageViews: number }[];
    totals: {
        sessions: number;
        users: number;
        pageViews: number;
        pagesPerSession?: number;
        avgDurationSec?: number;
        bounceRate?: number;
    };
    topPages: { path: string; views: number; users?: number; siteName?: string; hostName?: string }[];
    topCountries: { country: string; sessions: number }[];
    topCities: { city: string; country: string; region: string; sessions: number }[];
    sources?: { source: string; sessions: number }[];
    devices?: { device: string; sessions: number }[];
    browsers?: { browser: string; sessions: number }[];
    siteInfo?: SiteItem | null;
    status?: 'ok' | 'no_traffic' | 'not_configured' | 'error';
    configured?: boolean;
    emptyReason?: string | null;
    mock?: boolean;
    error?: string;
}

interface EcosystemStatus {
    totalRegistered: number;
    totalPublished: number;
    totalWithDomain: number;
    recentlyAdded: number;
    days: number;
}

interface RealtimeData {
    activeUsers: number;
    activeSitesCount: number;
    pages: { path: string; users: number }[];
    countries: { country: string; users: number }[];
    status: string;
}

const Skeleton = ({ h = 'h-8', w = 'w-24' }: { h?: string; w?: string }) => (
    <div className={`${h} ${w} bg-gray-100 rounded-lg animate-pulse`} />
);

// ── Interactive World SVG Map Component ──────────────────────────────────────
const SVGWorldMap: React.FC<{ topCountries: { country: string; sessions: number }[] }> = ({ topCountries }) => {
    const maxSessions = topCountries[0]?.sessions || 1;
    const countryMap = useMemo(() => {
        const map = new Map<string, number>();
        topCountries.forEach(c => map.set(c.country.toLowerCase(), c.sessions));
        return map;
    }, [topCountries]);

    // Simplified regional centroids for choropleth pins
    const REGIONS = [
        { name: 'Colombia', cx: 310, cy: 260, r: 8, key: 'colombia' },
        { name: 'Estados Unidos', cx: 230, cy: 155, r: 12, key: 'united states' },
        { name: 'México', cx: 220, cy: 195, r: 9, key: 'mexico' },
        { name: 'España', cx: 480, cy: 155, r: 7, key: 'spain' },
        { name: 'Perú', cx: 295, cy: 295, r: 7, key: 'peru' },
        { name: 'Chile', cx: 310, cy: 360, r: 7, key: 'chile' },
        { name: 'Argentina', cx: 340, cy: 350, r: 8, key: 'argentina' },
        { name: 'Brasil', cx: 360, cy: 290, r: 10, key: 'brazil' },
        { name: 'Alemania', cx: 510, cy: 135, r: 7, key: 'germany' },
        { name: 'Francia', cx: 490, cy: 145, r: 7, key: 'france' },
        { name: 'Reino Unido', cx: 480, cy: 125, r: 7, key: 'united kingdom' },
        { name: 'Canadá', cx: 220, cy: 110, r: 9, key: 'canada' },
    ];

    return (
        <div className="relative w-full h-[280px] bg-slate-50/70 rounded-2xl border border-gray-100 p-4 flex flex-col justify-between overflow-hidden">
            <div className="flex items-center justify-between text-xs text-gray-500 font-semibold mb-2">
                <span className="flex items-center gap-1.5 text-rotary-blue font-bold">
                    <Compass className="w-3.5 h-3.5" /> Distribución geográfica interactiva
                </span>
                <span className="text-[11px] text-gray-400">Tráfico geolocalizado en el período</span>
            </div>

            <div className="relative flex-1 flex items-center justify-center">
                <svg viewBox="0 0 1000 500" className="w-full h-full max-h-[220px] opacity-80" fill="#E2E8F0" stroke="#CBD5E1" strokeWidth="1">
                    {/* Simplified continent outlines */}
                    <path d="M150,120 Q180,80 260,90 Q320,100 280,180 Q220,230 180,200 Z" fill="#E2E8F0" />
                    <path d="M260,230 Q330,220 380,280 Q350,380 300,420 Q280,360 270,280 Z" fill="#E2E8F0" />
                    <path d="M460,90 Q540,80 560,140 Q520,180 470,160 Z" fill="#E2E8F0" />
                    <path d="M470,180 Q560,190 550,290 Q500,370 470,300 Z" fill="#E2E8F0" />
                    <path d="M570,90 Q750,70 820,150 Q780,250 630,210 Q580,160 570,90 Z" fill="#E2E8F0" />
                    <path d="M750,310 Q850,300 870,380 Q780,410 740,360 Z" fill="#E2E8F0" />

                    {/* Regional activity markers */}
                    {REGIONS.map((reg) => {
                        const sessions = countryMap.get(reg.key) || 0;
                        const hasTraffic = sessions > 0;
                        const radius = hasTraffic ? Math.min(16, 6 + (sessions / maxSessions) * 10) : reg.r * 0.7;
                        const color = hasTraffic ? '#0c3c7c' : '#94A3B8';

                        return (
                            <g key={reg.name} className="transition-all hover:opacity-100 cursor-pointer group">
                                <circle
                                    cx={reg.cx}
                                    cy={reg.cy}
                                    r={radius}
                                    fill={color}
                                    opacity={hasTraffic ? 0.85 : 0.25}
                                    stroke="#FFFFFF"
                                    strokeWidth={hasTraffic ? 2 : 1}
                                />
                                {hasTraffic && (
                                    <circle
                                        cx={reg.cx}
                                        cy={reg.cy}
                                        r={radius + 4}
                                        fill="none"
                                        stroke="#3b82f6"
                                        strokeWidth="1.5"
                                        opacity="0.4"
                                        className="animate-ping"
                                    />
                                )}
                                <title>{`${reg.name}: ${fmtN(sessions)} sesiones`}</title>
                            </g>
                        );
                    })}
                </svg>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-gray-100 text-[11px] text-gray-400">
                <span>Top países con actividad:</span>
                <div className="flex items-center gap-3">
                    {topCountries.slice(0, 4).map((c, idx) => (
                        <span key={c.country} className="flex items-center gap-1 font-semibold text-gray-700">
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                            {c.country}: <strong className="text-gray-900">{fmtN(c.sessions)}</strong>
                        </span>
                    ))}
                </div>
            </div>
        </div>
    );
};

// ── Main Analytics Page Component ───────────────────────────────────────────
const AnalyticsPage: React.FC = () => {
    const { token, user } = useAuth();
    const { club, isLoading: clubLoading } = useClub();
    const location = useLocation();
    const navigate = useNavigate();

    // Check platform domain & superadmin
    const isPlatformDomain = isOnPlatformDomain();
    const isGlobalAdmin = isPlatformSuperAdmin(user);
    // Tenant mode is true if NOT a platform superadmin on a platform domain
    const isTenantMode = !isGlobalAdmin || !isPlatformDomain;

    // View tab (Web vs Social) — supports both ?vista=social and ?view=social
    const vista: 'web' | 'social' =
        new URLSearchParams(location.search).get('vista') === 'social' ||
        new URLSearchParams(location.search).get('view') === 'social'
            ? 'social'
            : 'web';
    const irA = (v: 'web' | 'social') =>
        navigate(v === 'social' ? '/admin/analytics?vista=social' : '/admin/analytics', { replace: true });

    // Build single-site item from club context when in tenant mode
    const currentClubSite: SiteItem | null = useMemo(() => {
        if (!club?.id) return null;
        const currentHost = typeof window !== 'undefined' ? window.location.hostname : '';
        const isCustomHost = Boolean(currentHost && !currentHost.includes('clubplatform.org') && currentHost !== 'localhost' && currentHost !== '127.0.0.1');

        const effectiveDomain = isCustomHost ? currentHost : (club.domain || '');
        const hostnames = new Set<string>();
        if (effectiveDomain) {
            const clean = effectiveDomain.replace(/^https?:\/\//, '').replace(/\/$/, '');
            hostnames.add(clean);
            if (!clean.startsWith('www.')) hostnames.add(`www.${clean}`);
        }
        if (club.domain) {
            const cleanD = club.domain.replace(/^https?:\/\//, '').replace(/\/$/, '');
            hostnames.add(cleanD);
            if (!cleanD.startsWith('www.')) hostnames.add(`www.${cleanD}`);
        }
        if (club.subdomain) {
            hostnames.add(`${club.subdomain}.clubplatform.org`);
        }

        const isDistrict = club.type === 'district' || (club as any)?.category === 'district' || (club as any)?.organizationType === 'Distrito Rotario';

        return {
            id: club.id,
            name: club.name || 'Club Rotario',
            group: isDistrict ? 'districts' : 'clubs',
            category: (club as any)?.category || club.type || (isDistrict ? 'district' : 'club'),
            type: isDistrict ? 'Distrito' : (club.type || 'Club Rotario'),
            domain: effectiveDomain,
            subdomain: club.subdomain || '',
            hostnames: Array.from(hostnames),
            status: club.status || 'published',
        };
    }, [club]);

    // Context readiness: if tenant mode, wait until club context is resolved to prevent global data flash
    const contextReady = !isTenantMode || !clubLoading;

    // State: Sites Catalogue & Selection
    const [sites, setSites] = useState<SiteItem[]>([]);
    const [selectedSite, setSelectedSite] = useState<SiteItem | null>(null); // null = "Todos los sitios" (only in global mode)
    const [searchSite, setSearchSite] = useState('');
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const [initialFetchDone, setInitialFetchDone] = useState(false);

    // State: Analytics Metrics
    const [data, setData] = useState<TrafficData | null>(null);
    const [loading, setLoading] = useState(true);
    const [period, setPeriod] = useState('30d');
    const [metric, setMetric] = useState<'value' | 'users' | 'pageViews'>('value');
    const [geoTab, setGeoTab] = useState<'cities' | 'countries' | 'map'>('cities');

    // State: Custom Date Range
    const [customRange, setCustomRange] = useState({ start: '', end: '' });
    const [showCustomPicker, setShowCustomPicker] = useState(false);

    // State: Sites Performance Table (Nivel 1)
    const [perfSites, setPerfSites] = useState<SitePerformanceItem[]>([]);
    const [perfLoading, setPerfLoading] = useState(false);
    const [perfSearch, setPerfSearch] = useState('');
    const [perfTypeFilter, setPerfTypeFilter] = useState('all');
    const [perfStatusFilter, setPerfStatusFilter] = useState('all');

    // State: Realtime & Ecosystem Status (Nivel 4)
    const [realtime, setRealtime] = useState<RealtimeData | null>(null);
    const [ecosystem, setEcosystem] = useState<EcosystemStatus | null>(null);

    // Auth headers helper
    const authHeaders = useCallback((): HeadersInit => {
        const t = token || localStorage.getItem('rotary_token');
        return t ? { Authorization: `Bearer ${t}` } : {};
    }, [token]);

    // 1. Fetch Catalogue of Authorized Sites
    const fetchSites = useCallback(async () => {
        try {
            const r = await fetch(`${API}/analytics/sites`, { headers: authHeaders() });
            if (r.ok) {
                const res = await r.json();
                const fetchedSites: SiteItem[] = res.sites || [];
                setSites(fetchedSites);
                if (isTenantMode && fetchedSites.length > 0) {
                    const currentHost = typeof window !== 'undefined' ? window.location.hostname : '';
                    const matched = fetchedSites.find(s =>
                        s.id === club?.id ||
                        (s as any).alternateId === club?.id ||
                        (s as any).clubId === club?.id ||
                        (s as any).districtId === club?.id ||
                        s.domain === currentHost ||
                        s.hostnames?.includes(currentHost) ||
                        (club?.subdomain && s.subdomain === club.subdomain)
                    ) || fetchedSites[0];

                    setSelectedSite(matched);
                }
            }
        } catch (err) {
            console.error('[Analytics] Failed to fetch sites catalogue:', err);
        }
    }, [authHeaders, isTenantMode, club]);

    // 2. Fetch Traffic Data (Consolidated or Site-Specific)
    const fetchTraffic = useCallback(async (p: string, site: SiteItem | null, range = customRange) => {
        setLoading(true);
        try {
            const days = PERIOD_MAP[p] || '30';
            const params = new URLSearchParams();
            params.set('days', days);

            if (site) {
                params.set('siteId', site.id);
            } else if (isTenantMode && currentClubSite?.id) {
                params.set('siteId', currentClubSite.id);
            } else if (!isTenantMode) {
                params.set('siteId', 'all');
            }

            if (p === 'custom' && range.start && range.end) {
                params.set('startDate', range.start);
                params.set('endDate', range.end);
            }

            const r = await fetch(`${API}/analytics/traffic?${params.toString()}`, { headers: authHeaders() });
            const d = await r.json();
            setData(d);
        } catch (err) {
            console.error('[Analytics] Error fetching traffic:', err);
            setData(null);
        } finally {
            setLoading(false);
        }
    }, [authHeaders, customRange, isTenantMode, currentClubSite]);

    // 3. Fetch Sites Performance Comparative Table (Global only)
    const fetchPerformance = useCallback(async (p: string) => {
        if (isTenantMode) return;
        setPerfLoading(true);
        try {
            const days = PERIOD_MAP[p] || '30';
            const r = await fetch(`${API}/analytics/sites-performance?days=${days}`, { headers: authHeaders() });
            if (r.ok) {
                const res = await r.json();
                setPerfSites(res.sites || []);
            }
        } catch (err) {
            console.error('[Analytics] Error fetching sites performance:', err);
        } finally {
            setPerfLoading(false);
        }
    }, [authHeaders, isTenantMode]);

    // 4. Fetch Realtime & Ecosystem Status
    const fetchRealtimeAndEcosystem = useCallback(async () => {
        try {
            const [rtRes, ecoRes] = await Promise.all([
                fetch(`${API}/analytics/realtime`, { headers: authHeaders() }).then(r => r.json()).catch(() => null),
                fetch(`${API}/analytics/ecosystem-status`, { headers: authHeaders() }).then(r => r.json()).catch(() => null)
            ]);
            if (rtRes) setRealtime(rtRes);
            if (ecoRes) setEcosystem(ecoRes);
        } catch {
            // non-blocking
        }
    }, [authHeaders]);

    // Initial mount once tenant context is resolved
    useEffect(() => {
        if (!contextReady) return;
        if (initialFetchDone) return;
        setInitialFetchDone(true);

        if (isTenantMode) {
            const targetSite = currentClubSite;
            if (targetSite) {
                setSelectedSite(targetSite);
            }
            fetchSites();
            fetchTraffic(period, targetSite);
            fetchRealtimeAndEcosystem();
        } else {
            fetchSites();
            fetchTraffic(period, null);
            fetchPerformance(period);
            fetchRealtimeAndEcosystem();
        }
    }, [contextReady, isTenantMode, currentClubSite, period, fetchSites, fetchTraffic, fetchPerformance, fetchRealtimeAndEcosystem, initialFetchDone]);

    // Change site selection (disabled in tenant mode)
    const handleSelectSite = (site: SiteItem | null) => {
        if (isTenantMode) return;
        setSelectedSite(site);
        setDropdownOpen(false);
        fetchTraffic(period, site);
    };

    // Change period
    const handlePeriod = (p: string) => {
        if (p === 'custom') {
            setShowCustomPicker(true);
            return;
        }
        setShowCustomPicker(false);
        setPeriod(p);
        fetchTraffic(p, selectedSite || (isTenantMode ? currentClubSite : null));
        if (!isTenantMode) {
            fetchPerformance(p);
        }
    };

    const handleApplyCustomRange = () => {
        if (!customRange.start || !customRange.end) return;
        setPeriod('custom');
        setShowCustomPicker(false);
        fetchTraffic('custom', selectedSite || (isTenantMode ? currentClubSite : null), customRange);
    };

    // Filter sites in dropdown
    const filteredSites = useMemo(() => {
        if (!searchSite.trim()) return sites;
        const q = searchSite.toLowerCase();
        return sites.filter(s =>
            s.name.toLowerCase().includes(q) ||
            s.domain.toLowerCase().includes(q) ||
            s.subdomain.toLowerCase().includes(q) ||
            (s.districtName && s.districtName.toLowerCase().includes(q))
        );
    }, [sites, searchSite]);

    // Filter performance table sites
    const filteredPerfSites = useMemo(() => {
        let list = perfSites;
        if (perfTypeFilter !== 'all') {
            list = list.filter(s => s.group === perfTypeFilter || s.category === perfTypeFilter);
        }
        if (perfStatusFilter === 'traffic') {
            list = list.filter(s => s.hasTraffic);
        } else if (perfStatusFilter === 'no_traffic') {
            list = list.filter(s => !s.hasTraffic);
        }
        if (perfSearch.trim()) {
            const q = perfSearch.toLowerCase();
            list = list.filter(s =>
                s.name.toLowerCase().includes(q) ||
                s.domain.toLowerCase().includes(q) ||
                s.subdomain.toLowerCase().includes(q) ||
                (s.districtName && s.districtName.toLowerCase().includes(q))
            );
        }
        return list;
    }, [perfSites, perfTypeFilter, perfStatusFilter, perfSearch]);

    // Extracted Metrics
    const totals = data?.totals ?? { sessions: 0, users: 0, pageViews: 0, pagesPerSession: 0, avgDurationSec: 0, bounceRate: 0 };
    const chartData = (data?.chartData?.length ?? 0) > 0 ? data!.chartData : [];
    const topPages = data?.topPages ?? [];
    const topCountries = data?.topCountries ?? [];
    const topCities = data?.topCities ?? [];
    const sources = data?.sources ?? [];
    const devices = data?.devices ?? [];
    const browsers = data?.browsers ?? [];

    const maxPageViews = topPages[0]?.views || 1;
    const maxCountrySessions = topCountries[0]?.sessions || 1;
    const maxCitySessions = topCities[0]?.sessions || 1;
    const maxSourceSessions = sources[0]?.sessions || 1;

    const metricLabel = metric === 'value' ? 'Sesiones' : metric === 'users' ? 'Usuarios' : 'Páginas vistas';
    const activeSite = isTenantMode ? (selectedSite || currentClubSite || sites[0] || null) : selectedSite;
    const isGlobal = !isTenantMode && !selectedSite;

    if (!contextReady) {
        return (
            <AdminLayout wide>
                <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-4">
                        <Skeleton h="h-12" w="w-12" />
                        <div className="space-y-2">
                            <Skeleton h="h-7" w="w-48" />
                            <Skeleton h="h-4" w="w-32" />
                        </div>
                    </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
                            <Skeleton h="h-8" w="w-8" />
                            <div className="mt-4 space-y-2">
                                <Skeleton h="h-3" w="w-20" />
                                <Skeleton h="h-7" w="w-16" />
                            </div>
                        </div>
                    ))}
                </div>
            </AdminLayout>
        );
    }

    return (
        <AdminLayout wide>
            {/* ─── Tabs de Navegación (Sitio Web vs Redes Sociales) ───────────── */}
            <div className="flex gap-1 bg-gray-50 p-1 rounded-2xl border border-gray-100 mb-8 w-fit">
                {([
                    { id: 'web' as const, label: 'Sitio web', icon: BarChart3 },
                    { id: 'social' as const, label: 'Redes Sociales', icon: Share2 },
                ]).map((v) => (
                    <button
                        key={v.id}
                        onClick={() => irA(v.id)}
                        className={`px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-all ${
                            vista === v.id
                                ? 'bg-white text-rotary-blue shadow-sm border border-gray-100'
                                : 'text-gray-400 hover:text-gray-700'
                        }`}
                    >
                        <v.icon className="w-4 h-4" /> {v.label}
                    </button>
                ))}
            </div>

            {vista === 'social' && <SocialAnalytics />}

            {vista === 'web' && (<>
            {/* ─── Header: Selector de Sitio + Rango de Período ──────────────── */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-8">
                {/* Left: Title + Selected Site Context */}
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-sky-100 flex items-center justify-center flex-shrink-0">
                        <BarChart3 className="w-6 h-6 text-rotary-blue" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2.5">
                            <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Analíticas</h1>
                            {!isGlobal && !isTenantMode && (
                                <button
                                    onClick={() => handleSelectSite(null)}
                                    className="inline-flex items-center gap-1.5 px-3 py-1 bg-sky-50 text-rotary-blue hover:bg-sky-100 text-xs font-bold rounded-lg transition-colors border border-sky-100"
                                >
                                    ← Volver a Todos los sitios
                                </button>
                            )}
                        </div>
                        <p className="text-sm text-gray-500 mt-0.5">
                            {isGlobal ? (
                                `Métricas consolidadas del ecosistema (${sites.length} sitios activos)`
                            ) : (
                                `Métricas del sitio · ${activeSite?.name || 'Club'} ${activeSite?.domain ? `(${activeSite.domain})` : ''}`
                            )}
                        </p>
                    </div>
                </div>

                {/* Right: Site Selector Dropdown & Period Switcher */}
                <div className="flex flex-wrap items-center gap-3">
                    {/* ── Selector Dinámico: Sitio analizado ── */}
                    {isTenantMode ? (
                        /* Modo Sitio Independiente: Indicador fijo de contexto, sin desplegable ni opción global */
                        <div className="flex items-center gap-2.5 px-3.5 py-2 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-800 shadow-sm">
                            <Globe className="w-3.5 h-3.5 text-rotary-blue" />
                            <span className="max-w-[200px] truncate">{activeSite?.name || 'Club'}</span>
                            <span className="text-[10px] px-2 py-0.5 bg-sky-50 text-rotary-blue rounded-md font-semibold border border-sky-100">
                                {activeSite?.type || 'Club'}
                            </span>
                        </div>
                    ) : (
                        /* Modo Administrador Global: Desplegable completo con Todos los sitios */
                        <div className="relative">
                            <button
                                onClick={() => setDropdownOpen(!dropdownOpen)}
                                className="flex items-center gap-2.5 px-4 py-2 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-800 shadow-sm hover:border-rotary-blue transition-all"
                            >
                                <Globe className="w-3.5 h-3.5 text-rotary-blue" />
                                <span className="max-w-[180px] truncate">
                                    {isGlobal ? '🌐 Todos los sitios' : selectedSite?.name}
                                </span>
                                <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                            </button>

                            {/* Dropdown Menu */}
                            {dropdownOpen && (
                                <div className="absolute right-0 mt-2 w-80 bg-white border border-gray-100 rounded-2xl shadow-xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                                    {/* Search box */}
                                    <div className="p-3 border-b border-gray-100 bg-gray-50/50">
                                        <div className="relative">
                                            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-gray-400" />
                                            <input
                                                type="text"
                                                value={searchSite}
                                                onChange={(e) => setSearchSite(e.target.value)}
                                                placeholder="Buscar distrito, club o dominio..."
                                                className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-rotary-blue"
                                            />
                                        </div>
                                    </div>

                                    {/* Options List */}
                                    <div className="max-h-80 overflow-y-auto p-2 space-y-1">
                                        {/* Global option */}
                                        <button
                                            onClick={() => handleSelectSite(null)}
                                            className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold transition-colors ${
                                                isGlobal ? 'bg-rotary-blue text-white' : 'text-gray-700 hover:bg-gray-100'
                                            }`}
                                        >
                                            <span className="flex items-center gap-2">
                                                <Globe className="w-3.5 h-3.5" /> Todos los sitios
                                            </span>
                                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/20">Consolidado</span>
                                        </button>

                                        <div className="h-px bg-gray-100 my-1" />

                                        {/* Categorized groups */}
                                        {filteredSites.length === 0 ? (
                                            <p className="text-center text-xs text-gray-400 py-4">No se encontraron sitios</p>
                                        ) : (
                                            filteredSites.map((site) => (
                                                <button
                                                    key={site.id}
                                                    onClick={() => handleSelectSite(site)}
                                                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-left text-xs transition-colors ${
                                                        selectedSite?.id === site.id ? 'bg-sky-50 text-rotary-blue font-bold' : 'text-gray-700 hover:bg-gray-50'
                                                    }`}
                                                >
                                                    <div className="min-w-0 pr-2">
                                                        <p className="truncate font-semibold">{site.name}</p>
                                                        <p className="text-[10px] text-gray-400 truncate font-mono">
                                                            {site.domain || `${site.subdomain}.clubplatform.org`}
                                                        </p>
                                                    </div>
                                                    <span className="text-[9px] px-2 py-0.5 bg-gray-100 text-gray-600 rounded-md flex-shrink-0 font-medium">
                                                        {site.type}
                                                    </span>
                                                </button>
                                            ))
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── Period Selector ── */}
                    <div className="flex bg-gray-50 p-1 rounded-xl border border-gray-100">
                        {['7d', '30d', '90d', '12m'].map((p) => (
                            <button
                                key={p}
                                onClick={() => handlePeriod(p)}
                                className={`px-3 py-1.5 rounded-lg text-[11px] font-black transition-all ${
                                    period === p && !showCustomPicker
                                        ? 'bg-white text-gray-900 shadow-sm border border-gray-100'
                                        : 'text-gray-400 hover:text-gray-700'
                                }`}
                            >
                                {p}
                            </button>
                        ))}
                        <button
                            onClick={() => handlePeriod('custom')}
                            className={`px-3 py-1.5 rounded-lg text-[11px] font-black transition-all flex items-center gap-1 ${
                                period === 'custom' || showCustomPicker
                                    ? 'bg-white text-gray-900 shadow-sm border border-gray-100'
                                    : 'text-gray-400 hover:text-gray-700'
                            }`}
                        >
                            <Calendar className="w-3 h-3" /> Personalizado
                        </button>
                    </div>

                    {/* Refresh */}
                    <button
                        onClick={() => {
                            fetchTraffic(period, selectedSite || (isTenantMode ? currentClubSite : null));
                            if (!isTenantMode) {
                                fetchPerformance(period);
                            }
                            fetchRealtimeAndEcosystem();
                        }}
                        disabled={loading}
                        className="p-2.5 bg-white border border-gray-100 rounded-xl text-gray-400 hover:text-rotary-blue transition-colors shadow-sm"
                        title="Actualizar métricas"
                    >
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </div>

            {/* Custom Date Range Popover */}
            {showCustomPicker && (
                <div className="bg-white border border-gray-100 rounded-2xl p-4 mb-6 shadow-sm flex flex-wrap items-center gap-4 animate-in fade-in">
                    <span className="text-xs font-bold text-gray-700">Rango de fechas:</span>
                    <input
                        type="date"
                        value={customRange.start}
                        onChange={(e) => setCustomRange(prev => ({ ...prev, start: e.target.value }))}
                        className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg text-gray-700 focus:outline-none focus:border-rotary-blue"
                    />
                    <span className="text-xs text-gray-400">hasta</span>
                    <input
                        type="date"
                        value={customRange.end}
                        onChange={(e) => setCustomRange(prev => ({ ...prev, end: e.target.value }))}
                        className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg text-gray-700 focus:outline-none focus:border-rotary-blue"
                    />
                    <button
                        onClick={handleApplyCustomRange}
                        disabled={!customRange.start || !customRange.end}
                        className="px-4 py-1.5 bg-rotary-blue text-white text-xs font-bold rounded-lg hover:bg-sky-900 transition-colors disabled:opacity-50"
                    >
                        Aplicar rango
                    </button>
                </div>
            )}

            {/* ─── Realtime Indicator Banner (Nivel 4) ────────────────────────── */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-gradient-to-r from-sky-50 via-indigo-50/40 to-white border border-sky-100 rounded-2xl px-6 py-3.5 mb-6 shadow-sm">
                <div className="flex items-center gap-3">
                    <span className="relative flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                    </span>
                    <p className="text-xs font-bold text-gray-800">
                        {realtime?.activeUsers ? (
                            <>
                                <strong className="text-emerald-700">{realtime.activeUsers} visitantes activos</strong> en este momento
                                {isGlobal && realtime.activeSitesCount > 0 && ` a lo largo de ${realtime.activeSitesCount} sitios`}
                            </>
                        ) : (
                            isGlobal
                                ? 'Modo tiempo real activo · Monitoreo continuo de visitantes del ecosistema'
                                : 'Modo tiempo real activo · Monitoreo de visitantes en vivo'
                        )}
                    </p>
                </div>
                {isGlobal && ecosystem && (
                    <div className="flex items-center gap-4 text-xs font-medium text-gray-500">
                        <span><strong>{ecosystem.totalPublished}</strong> sitios publicados</span>
                        <span><strong>{ecosystem.totalWithDomain}</strong> con dominio activo</span>
                    </div>
                )}
                {!isGlobal && (
                    <span className="text-xs font-semibold text-gray-500">
                        Métricas en tiempo real del sitio
                    </span>
                )}
            </div>

            {/* ─── Estado del Tracking / Avisos ───────────────────────────────── */}
            {data?.status === 'not_configured' && (
                <div className="bg-amber-50 border border-amber-100 rounded-2xl px-6 py-4 mb-6 flex items-center gap-3">
                    <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0" />
                    <div>
                        <p className="text-sm font-bold text-amber-800">Tracking pendiente de configuración</p>
                        <p className="text-xs text-amber-700 mt-0.5">
                            Configura el Property ID numérico y el Service Account JSON en <strong>Integraciones</strong> para consultar métricas reales en vivo.
                        </p>
                    </div>
                </div>
            )}

            {data?.status === 'no_traffic' && (
                <div className="bg-blue-50/50 border border-blue-100 rounded-2xl px-6 py-3.5 mb-6 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Activity className="w-4 h-4 text-rotary-blue flex-shrink-0" />
                        <p className="text-xs font-semibold text-gray-700">
                            {isGlobal ? 'Sin tráfico registrado en el período seleccionado en los sitios.' : `Sin visitas registradas para ${activeSite?.name || 'el sitio'} en este período.`}
                        </p>
                    </div>
                    <span className="text-[11px] text-gray-400">Tracking configurado y operativo</span>
                </div>
            )}

            {/* ─── KPI Cards (Nivel 1 & 2) ────────────────────────────────────── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
                {[
                    {
                        label: isGlobal ? 'Sitios en el Ecosistema' : 'Sesiones Totales',
                        value: isGlobal ? (ecosystem?.totalPublished || sites.length) : totals.sessions,
                        icon: isGlobal ? Globe : TrendingUp,
                        color: 'text-rotary-blue',
                        bg: 'bg-rotary-blue/5',
                        raw: isGlobal
                    },
                    {
                        label: 'Usuarios únicos',
                        value: totals.users,
                        icon: Users,
                        color: 'text-violet-500',
                        bg: 'bg-violet-50'
                    },
                    {
                        label: 'Páginas vistas',
                        value: totals.pageViews,
                        icon: Eye,
                        color: 'text-emerald-500',
                        bg: 'bg-emerald-50'
                    },
                    {
                        label: 'Páginas / sesión',
                        value: totals.pagesPerSession || (totals.sessions ? parseFloat((totals.pageViews / totals.sessions).toFixed(1)) : 0),
                        icon: FileText,
                        color: 'text-orange-500',
                        bg: 'bg-orange-50',
                        raw: true
                    },
                ].map((kpi) => (
                    <div key={kpi.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 hover:shadow-md transition-all">
                        <div className="flex items-center justify-between mb-4">
                            <div className={`w-10 h-10 rounded-xl ${kpi.bg} flex items-center justify-center`}>
                                <kpi.icon className={`w-5 h-5 ${kpi.color}`} />
                            </div>
                        </div>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.15em] mb-1.5">{kpi.label}</p>
                        {loading ? (
                            <Skeleton h="h-7" w="w-20" />
                        ) : (
                            <p className="text-2xl font-black text-gray-900 tracking-tight">
                                {kpi.raw ? kpi.value : fmtN(kpi.value as number)}
                            </p>
                        )}
                    </div>
                ))}
            </div>

            {/* ─── Tráfico Web (Gráfica Principal) ────────────────────────────── */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 mb-8">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
                    <div>
                        <h2 className="text-lg font-black text-gray-900">
                            {isGlobal ? 'Tráfico web del ecosistema' : `Tráfico web: ${activeSite?.name || 'Sitio'}`}
                        </h2>
                        <p className="text-xs text-gray-400 font-medium mt-0.5">
                            {loading ? 'Cargando datos...' : `${fmtN(totals.sessions)} sesiones · ${fmtN(totals.users)} usuarios · ${fmtN(totals.pageViews)} páginas`}
                        </p>
                    </div>
                    <div className="flex bg-gray-50 p-1 rounded-xl border border-gray-100">
                        {(['value', 'users', 'pageViews'] as const).map((m) => (
                            <button
                                key={m}
                                onClick={() => setMetric(m)}
                                className={`px-3 py-1.5 rounded-lg text-[11px] font-black transition-all ${
                                    metric === m ? 'bg-white text-gray-900 shadow-sm border border-gray-100' : 'text-gray-400 hover:text-gray-700'
                                }`}
                            >
                                {m === 'value' ? 'Sesiones' : m === 'users' ? 'Usuarios' : 'Páginas'}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="h-[280px]">
                    {loading ? (
                        <div className="h-full flex items-end gap-1 px-2">
                            {Array.from({ length: 24 }).map((_, i) => (
                                <div
                                    key={i}
                                    className="flex-1 bg-gray-100 rounded-t-md animate-pulse"
                                    style={{ height: `${20 + Math.random() * 60}%` }}
                                />
                            ))}
                        </div>
                    ) : (
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={chartData}>
                                <defs>
                                    <linearGradient id="gaTraffic" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#0c3c7c" stopOpacity={0.15} />
                                        <stop offset="95%" stopColor="#0c3c7c" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <XAxis
                                    dataKey="name"
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fill: '#9CA3AF', fontSize: 10, fontWeight: '700' }}
                                    dy={8}
                                />
                                <YAxis hide />
                                <Tooltip
                                    cursor={{ stroke: '#0c3c7c', strokeWidth: 1, strokeDasharray: '4 4' }}
                                    contentStyle={{
                                        borderRadius: '16px',
                                        border: 'none',
                                        boxShadow: '0 10px 40px rgba(0,0,0,0.08)',
                                        padding: '12px 16px',
                                        fontSize: 12
                                    }}
                                    formatter={(val: number) => [fmtN(val), metricLabel]}
                                />
                                <Area
                                    type="monotone"
                                    dataKey={metric}
                                    stroke="#0c3c7c"
                                    strokeWidth={2.5}
                                    fill="url(#gaTraffic)"
                                    dot={false}
                                    activeDot={{ fill: '#0c3c7c', stroke: 'white', strokeWidth: 2, r: 5 }}
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    )}
                </div>
            </div>

            {/* ─── Rendimiento por Sitio (Sección Especial Nivel 1) ───────────── */}
            {isGlobal && (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 mb-8">
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
                        <div>
                            <div className="flex items-center gap-2">
                                <Building2 className="w-5 h-5 text-rotary-blue" />
                                <h3 className="text-lg font-black text-gray-900">Rendimiento por sitio</h3>
                            </div>
                            <p className="text-xs text-gray-400 font-medium mt-0.5">
                                Comparativa descriptiva de actividad en todos los sitios de Club Platform
                            </p>
                        </div>

                        {/* Search & Filters */}
                        <div className="flex flex-wrap items-center gap-3">
                            <div className="relative">
                                <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-gray-400" />
                                <input
                                    type="text"
                                    value={perfSearch}
                                    onChange={(e) => setPerfSearch(e.target.value)}
                                    placeholder="Buscar sitio o dominio..."
                                    className="pl-8 pr-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-rotary-blue w-48"
                                />
                            </div>

                            <select
                                value={perfTypeFilter}
                                onChange={(e) => setPerfTypeFilter(e.target.value)}
                                className="text-xs font-bold bg-gray-50 border border-gray-200 rounded-xl px-3 py-1.5 text-gray-700 focus:outline-none"
                            >
                                <option value="all">Todos los tipos</option>
                                <option value="districts">Distritos</option>
                                <option value="clubs">Clubes Rotarios</option>
                                <option value="programs">Programas / Ferias</option>
                                <option value="platform">Plataforma</option>
                            </select>

                            <select
                                value={perfStatusFilter}
                                onChange={(e) => setPerfStatusFilter(e.target.value)}
                                className="text-xs font-bold bg-gray-50 border border-gray-200 rounded-xl px-3 py-1.5 text-gray-700 focus:outline-none"
                            >
                                <option value="all">Todo el tráfico</option>
                                <option value="traffic">Con visitas</option>
                                <option value="no_traffic">Sin visitas</option>
                            </select>
                        </div>
                    </div>

                    {/* Table */}
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                            <thead>
                                <tr className="border-b border-gray-100 text-[10px] font-black uppercase tracking-wider text-gray-400 pb-3">
                                    <th className="py-3 px-3">Sitio</th>
                                    <th className="py-3 px-3">Tipo</th>
                                    <th className="py-3 px-3">Dominio</th>
                                    <th className="py-3 px-3 text-right">Sesiones</th>
                                    <th className="py-3 px-3 text-right">Usuarios</th>
                                    <th className="py-3 px-3 text-right">Páginas</th>
                                    <th className="py-3 px-3 text-right">Pág/Ses</th>
                                    <th className="py-3 px-3 text-right">Tiempo</th>
                                    <th className="py-3 px-3 text-center">Variación</th>
                                    <th className="py-3 px-3 text-right">Acción</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50 font-medium">
                                {perfLoading ? (
                                    Array.from({ length: 5 }).map((_, i) => (
                                        <tr key={i}>
                                            <td colSpan={10} className="py-3"><Skeleton h="h-8" w="w-full" /></td>
                                        </tr>
                                    ))
                                ) : filteredPerfSites.length === 0 ? (
                                    <tr>
                                        <td colSpan={10} className="text-center text-gray-400 py-8">
                                            No se encontraron sitios con los filtros aplicados.
                                        </td>
                                    </tr>
                                ) : (
                                    filteredPerfSites.map((site) => (
                                        <tr key={site.id} className="hover:bg-gray-50/70 transition-colors group">
                                            <td className="py-3.5 px-3">
                                                <div className="flex items-center gap-2.5">
                                                    <div className="w-7 h-7 rounded-lg bg-sky-50 text-rotary-blue flex items-center justify-center font-bold text-xs flex-shrink-0">
                                                        {site.name.charAt(0)}
                                                    </div>
                                                    <span className="font-bold text-gray-900 truncate max-w-[200px]">{site.name}</span>
                                                </div>
                                            </td>
                                            <td className="py-3.5 px-3">
                                                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-gray-100 text-gray-600">
                                                    {site.type}
                                                </span>
                                            </td>
                                            <td className="py-3.5 px-3">
                                                <span className="text-gray-500 font-mono text-[11px] truncate block max-w-[160px]">
                                                    {site.domain || `${site.subdomain}.clubplatform.org`}
                                                </span>
                                            </td>
                                            <td className="py-3.5 px-3 text-right font-bold text-gray-900">
                                                {fmtN(site.sessions)}
                                            </td>
                                            <td className="py-3.5 px-3 text-right text-gray-600">
                                                {fmtN(site.users)}
                                            </td>
                                            <td className="py-3.5 px-3 text-right text-gray-600">
                                                {fmtN(site.pageViews)}
                                            </td>
                                            <td className="py-3.5 px-3 text-right text-gray-500">
                                                {site.pagesPerSession || 0}
                                            </td>
                                            <td className="py-3.5 px-3 text-right text-gray-500">
                                                {fmtDur(site.avgDurationSec)}
                                            </td>
                                            <td className="py-3.5 px-3 text-center">
                                                <span
                                                    className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                                                        site.changePct > 0
                                                            ? 'bg-emerald-50 text-emerald-700'
                                                            : site.changePct < 0
                                                                ? 'bg-rose-50 text-rose-700'
                                                                : 'bg-gray-100 text-gray-500'
                                                    }`}
                                                >
                                                    {site.changePct > 0 ? `+${site.changePct}%` : `${site.changePct}%`}
                                                </span>
                                            </td>
                                            <td className="py-3.5 px-3 text-right">
                                                <button
                                                    onClick={() => {
                                                        setSelectedSite(site);
                                                        fetchTraffic(period, site);
                                                        window.scrollTo({ top: 0, behavior: 'smooth' });
                                                    }}
                                                    className="inline-flex items-center gap-1 px-3 py-1 bg-sky-50 text-rotary-blue hover:bg-rotary-blue hover:text-white rounded-lg text-xs font-bold transition-all shadow-sm"
                                                >
                                                    Ver analítica <ArrowRight className="w-3 h-3" />
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* ─── Páginas más visitadas & Ubicaciones ────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                {/* Top Pages */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                    <div className="flex items-center justify-between mb-5">
                        <div className="flex items-center gap-2">
                            <FileText className="w-4 h-4 text-rotary-blue" />
                            <h3 className="text-sm font-black text-gray-900">Páginas más visitadas</h3>
                        </div>
                        <span className="text-[10px] font-bold text-gray-400">
                            {isGlobal ? 'Consolidado del ecosistema' : (activeSite?.name || 'Sitio')}
                        </span>
                    </div>

                    {loading ? (
                        <div className="space-y-4">
                            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} h="h-6" w="w-full" />)}
                        </div>
                    ) : topPages.length === 0 ? (
                        <p className="text-sm text-gray-400 text-center py-8">Sin datos de páginas en este período</p>
                    ) : (
                        <div className="space-y-3.5">
                            {topPages.map((p, i) => (
                                <div key={i} className="group">
                                    <div className="flex items-center justify-between mb-1 text-xs">
                                        <div className="flex items-center gap-2 min-w-0 max-w-[75%]">
                                            <span className="font-bold text-gray-700 truncate group-hover:text-rotary-blue transition-colors">
                                                {p.path || '/'}
                                            </span>
                                            {isGlobal && p.siteName && (
                                                <span className="text-[9px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 font-semibold truncate flex-shrink-0">
                                                    {p.siteName}
                                                </span>
                                            )}
                                        </div>
                                        <span className="font-black text-gray-700">{fmtN(p.views)}</span>
                                    </div>
                                    <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-rotary-blue/80 rounded-full transition-all duration-700"
                                            style={{ width: `${(p.views / maxPageViews) * 100}%` }}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Ubicaciones Geográficas (Ciudades / Países / Mapa) */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                    <div className="flex items-center justify-between mb-5">
                        <div className="flex items-center gap-2">
                            <MapPin className="w-4 h-4 text-violet-500" />
                            <h3 className="text-sm font-black text-gray-900">Ubicaciones</h3>
                        </div>
                        <div className="flex bg-gray-50 p-0.5 rounded-lg border border-gray-100">
                            {(['cities', 'countries', 'map'] as const).map((t) => (
                                <button
                                    key={t}
                                    onClick={() => setGeoTab(t)}
                                    className={`px-3 py-1 rounded-md text-[10px] font-black transition-all ${
                                        geoTab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400 hover:text-gray-700'
                                    }`}
                                >
                                    {t === 'cities' ? 'Ciudades' : t === 'countries' ? 'Países' : 'Mapa'}
                                </button>
                            ))}
                        </div>
                    </div>

                    {loading ? (
                        <div className="space-y-4">
                            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} h="h-8" w="w-full" />)}
                        </div>
                    ) : geoTab === 'map' ? (
                        <SVGWorldMap topCountries={topCountries} />
                    ) : geoTab === 'cities' ? (
                        topCities.length === 0 ? (
                            <p className="text-sm text-gray-400 text-center py-8">Sin datos de ciudades aún</p>
                        ) : (
                            <div className="space-y-3">
                                {topCities.map((c, i) => (
                                    <div key={i} className="flex items-center gap-3">
                                        <div
                                            className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-black text-white flex-shrink-0"
                                            style={{ backgroundColor: COLORS[i % COLORS.length] }}
                                        >
                                            {i + 1}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between mb-1">
                                                <div className="min-w-0">
                                                    <span className="text-xs font-black text-gray-800 truncate block">{c.city}</span>
                                                    <span className="text-[10px] text-gray-400 font-medium">
                                                        {c.region ? `${c.region}, ` : ''}{c.country}
                                                    </span>
                                                </div>
                                                <span className="text-xs font-black text-gray-500 ml-2 flex-shrink-0">{fmtN(c.sessions)}</span>
                                            </div>
                                            <div className="w-full h-1 bg-gray-100 rounded-full overflow-hidden">
                                                <div
                                                    className="h-full rounded-full transition-all duration-700"
                                                    style={{
                                                        width: `${(c.sessions / maxCitySessions) * 100}%`,
                                                        backgroundColor: COLORS[i % COLORS.length]
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )
                    ) : (
                        topCountries.length === 0 ? (
                            <p className="text-sm text-gray-400 text-center py-8">Sin datos de países aún</p>
                        ) : (
                            <div className="space-y-3">
                                {topCountries.map((c, i) => (
                                    <div key={i} className="flex items-center gap-3">
                                        <div
                                            className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black text-white flex-shrink-0"
                                            style={{ backgroundColor: COLORS[i % COLORS.length] }}
                                        >
                                            {i + 1}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between mb-1">
                                                <span className="text-xs font-bold text-gray-700 truncate">{c.country || 'Desconocido'}</span>
                                                <span className="text-xs font-black text-gray-500 ml-2">{fmtN(c.sessions)}</span>
                                            </div>
                                            <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                                <div
                                                    className="h-full rounded-full transition-all duration-700"
                                                    style={{
                                                        width: `${(c.sessions / maxCountrySessions) * 100}%`,
                                                        backgroundColor: COLORS[i % COLORS.length]
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )
                    )}
                </div>
            </div>

            {/* ─── Fuentes de Tráfico & Dispositivos ──────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                {/* Traffic Sources */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                    <div className="flex items-center gap-2 mb-5">
                        <Share2 className="w-4 h-4 text-emerald-500" />
                        <h3 className="text-sm font-black text-gray-900">Fuentes de tráfico principales</h3>
                    </div>
                    {loading ? (
                        <div className="space-y-4">
                            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} h="h-6" w="w-full" />)}
                        </div>
                    ) : sources.length === 0 ? (
                        <p className="text-sm text-gray-400 text-center py-8">Sin datos de fuentes aún</p>
                    ) : (
                        <div className="space-y-3.5">
                            {sources.map((s, i) => (
                                <div key={i}>
                                    <div className="flex items-center justify-between text-xs mb-1">
                                        <span className="font-bold text-gray-700">{s.source}</span>
                                        <span className="font-black text-gray-900">{fmtN(s.sessions)}</span>
                                    </div>
                                    <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-emerald-500 rounded-full transition-all duration-700"
                                            style={{ width: `${(s.sessions / maxSourceSessions) * 100}%` }}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Devices & Browsers */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                    <div className="flex items-center gap-2 mb-5">
                        <Smartphone className="w-4 h-4 text-orange-500" />
                        <h3 className="text-sm font-black text-gray-900">Dispositivos y navegadores</h3>
                    </div>
                    {loading ? (
                        <div className="space-y-4">
                            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} h="h-6" w="w-full" />)}
                        </div>
                    ) : (
                        <div className="space-y-6">
                            {/* Devices */}
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-wider text-gray-400 mb-2">Dispositivos</p>
                                <div className="grid grid-cols-3 gap-2">
                                    {devices.map((d, i) => (
                                        <div key={i} className="bg-gray-50 rounded-xl p-3 text-center border border-gray-100">
                                            <p className="text-[10px] text-gray-500 font-bold uppercase">{d.device}</p>
                                            <p className="text-base font-black text-gray-900 mt-0.5">{fmtN(d.sessions)}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Top Browsers */}
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-wider text-gray-400 mb-2">Navegadores</p>
                                <div className="flex flex-wrap gap-2">
                                    {browsers.map((b, i) => (
                                        <span key={i} className="inline-flex items-center gap-1.5 px-3 py-1 bg-gray-50 border border-gray-100 rounded-lg text-xs font-semibold text-gray-700">
                                            {b.browser}: <strong>{fmtN(b.sessions)}</strong>
                                        </span>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* ─── Comparativa Sesiones vs Usuarios (Día a Día) ─────────────── */}
            {!loading && chartData.length > 0 && (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 mb-8">
                    <div className="flex items-center gap-2 mb-6">
                        <BarChart3 className="w-4 h-4 text-rotary-blue" />
                        <h3 className="text-sm font-black text-gray-900">Comparativa sesiones vs usuarios por día</h3>
                    </div>
                    <div className="h-[200px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={chartData} barSize={6} barGap={2}>
                                <XAxis
                                    dataKey="name"
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fill: '#D1D5DB', fontSize: 9, fontWeight: '700' }}
                                    dy={6}
                                />
                                <YAxis hide />
                                <Tooltip
                                    contentStyle={{
                                        borderRadius: '16px',
                                        border: 'none',
                                        boxShadow: '0 10px 40px rgba(0,0,0,0.08)',
                                        padding: '12px 16px',
                                        fontSize: 12
                                    }}
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
            </>)}
        </AdminLayout>
    );
};

export default AnalyticsPage;
