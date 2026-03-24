import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import {
    LayoutDashboard,
    Users,
    Building2,
    FolderKanban,
    Newspaper,
    HeartHandshake,
    Image as ImageIcon,
    Settings,
    LogOut,
    ChevronDown,
    Search,
    Bell,
    HelpCircle,
    Calendar,
    BookOpen,
    PieChart,
    Layers,
    UserPlus,
    Store,
    Receipt,
    Wallet,
    ExternalLink,
    Sparkles,
    TrendingUp,
    Eye,
    Mail,
    Bot,
    Network,
    Palette,
    Lock,
    FileText,
    Globe,
    Briefcase,
    Award,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useClub } from '../../contexts/ClubContext';
import { useSetupProgress, SETUP_ALLOWED_PATHS } from '../../hooks/useSetupProgress';


const API = import.meta.env.VITE_API_URL || '/api';
const fmtN = (n: number) => n >= 1000000 ? `${(n / 1000000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);

const AdminLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { logout, user } = useAuth();
    const { club } = useClub();
    const navigate = useNavigate();
    const location = useLocation();
    const [searchQuery, setSearchQuery] = useState('');
    const [lockedToast, setLockedToast] = useState<string | null>(null);

    // ── Setup Progress (for gating) ──
    const { pct: setupPctHook, isComplete: setupComplete } = useSetupProgress();

    // ── Header KPIs ──
    const [stats, setStats] = useState<any>(null);
    const [gaTotals, setGaTotals] = useState<{ users: number; pageViews: number }>({ users: 0, pageViews: 0 });
    const [gaMock, setGaMock] = useState(false);
    const [unreadLeads, setUnreadLeads] = useState(0);
    const [mod, setMod] = useState<Record<string, boolean>>({
        projects: true, events: true, rotaract: false, interact: false,
        ecommerce: false, dian: false, youth_exchange: false, ngse: false, rotex: false
    });

    const isSuperAdmin = user?.role === 'administrator';

    // Redirect to dashboard if trying to access locked route
    useEffect(() => {
        if (!isSuperAdmin && !setupComplete && !SETUP_ALLOWED_PATHS.includes(location.pathname)) {
            navigate('/admin/dashboard');
        }
    }, [location.pathname, setupComplete, isSuperAdmin]);

    // Auto-dismiss locked toast
    useEffect(() => {
        if (lockedToast) {
            const t = setTimeout(() => setLockedToast(null), 3000);
            return () => clearTimeout(t);
        }
    }, [lockedToast]);
    const clubHostname: string | null = (() => {
        try {
            const s = localStorage.getItem('rotary_club');
            if (s) { const c = JSON.parse(s); return c.domain || (c.subdomain ? `${c.subdomain}.clubplatform.org` : null); }
        } catch { }
        return null;
    })();

    useEffect(() => {
        // Fetch dashboard stats
        const token = localStorage.getItem('rotary_token');
        fetch(`${API}/admin/stats`, { headers: { Authorization: `Bearer ${token}` } })
            .then(r => r.ok ? r.json() : null).then(d => d && setStats(d)).catch(() => { });
        // Fetch GA4 totals
        const hp = isSuperAdmin ? '' : (clubHostname ? `&hostname=${encodeURIComponent(clubHostname)}` : '');
        fetch(`${API}/analytics/traffic?days=30${hp}`)
            .then(r => r.json())
            .then(d => { setGaMock(!!d.mock); if (d.totals) setGaTotals(d.totals); })
            .catch(() => setGaMock(true));
        // Fetch unread leads count
        const fetchUnread = () => {
            fetch(`${API}/leads?status=new`, { headers: { Authorization: `Bearer ${token}` } })
                .then(r => r.ok ? r.json() : null)
                .then(d => d && setUnreadLeads(d.total || 0))
                .catch(() => { });
        };
        fetchUnread();
        const interval = setInterval(fetchUnread, 60000); // poll every 60s
        return () => clearInterval(interval);
    }, []);

    // Fetch module settings for club users
    useEffect(() => {
        if (isSuperAdmin) return;
        const token = localStorage.getItem('rotary_token');
        // For club admins, user.clubId is their actual club. club?.id from context
        // is the platform club (origen), NOT the user's club.
        const cid = user?.clubId || club?.id;
        if (!cid || !token) return;
        fetch(`${API}/admin/clubs/${cid}/settings`, { headers: { Authorization: `Bearer ${token}` } })
            .then(r => r.ok ? r.json() : [])
            .then((settings: any[]) => {
                const map: Record<string, string> = {};
                settings.forEach((s: any) => { map[s.key] = s.value; });
                setMod({
                    projects: map['module_projects'] !== 'false',
                    events: map['module_events'] !== 'false',
                    rotaract: map['module_rotaract'] === 'true',
                    interact: map['module_interact'] === 'true',
                    ecommerce: map['module_ecommerce'] === 'true',
                    dian: map['module_dian'] === 'true',
                    youth_exchange: map['module_youth_exchange'] === 'true',
                    ngse: map['module_ngse'] === 'true',
                    rotex: map['module_rotex'] === 'true',
                });
            })
            .catch(() => {});
    }, [club, user, isSuperAdmin]);


    // Compute setup completion % from club data (no extra API call needed)
    const setupPct = React.useMemo(() => {
        if (!club) return 0;
        const checks = [
            { w: 15, ok: !!club.logo },
            { w: 15, ok: !!(club.description && (club.description as string).length > 20) },
            { w: 12, ok: !!(club as any).contact?.email || !!(club as any).city },
            { w: 10, ok: !!((club as any).colors?.primary && (club as any).colors?.primary !== '#013388') },
            { w: 10, ok: !!(Array.isArray((club as any).social) && (club as any).social.some((s: any) => s.url)) },
            { w: 8, ok: !!(club as any).domain || !!(club as any).subdomain },
        ];
        const total = checks.reduce((a, c) => a + c.w, 0);
        const done = checks.filter(c => c.ok).reduce((a, c) => a + c.w, 0);
        return Math.round((done / total) * 100);
    }, [club]);

    const pctColor = setupPct >= 80 ? 'text-emerald-600 bg-emerald-50' : setupPct >= 60 ? 'text-amber-600 bg-amber-50' : 'text-red-600 bg-red-50';

    // Define menu items based on role
    const getMenuItems = () => {
        const isSuperAdmin = user?.role === 'administrator';
        const items: any[] = [];

        items.push(
            { icon: LayoutDashboard, label: 'Overview', path: '/admin/dashboard', category: 'General' },
            { icon: PieChart, label: 'Analytics', path: '/admin/analytics', category: 'General' },
        );

        if (isSuperAdmin) {
            items.push(
                { icon: Network, label: 'Distritos', path: '/admin/distritos', category: 'Management' },
                { icon: Building2, label: 'Clubes', path: '/admin/clubes', category: 'Management' },
                { icon: Users, label: 'Super Users', path: '/admin/usuarios', category: 'Management' },
                { icon: HeartHandshake, label: 'Donaciones Globales', path: '/admin/donaciones', category: 'Management' },
                { icon: Bell, label: 'CRM y Envíos Centrales', path: '/admin/crm', category: 'Management' },
                { icon: UserPlus, label: 'Contactos & Leads', path: '/admin/leads', category: 'Management' },
            );
        } else {
            items.push(
                { icon: Building2, label: 'Mi Club', path: '/admin/mi-club', category: 'Club' },
                { icon: Users, label: 'Miembros del Club', path: '/admin/miembros', category: 'Club' },
                { icon: UserPlus, label: 'Contactos & Leads', path: '/admin/leads', category: 'Club' },
            );
        }

        // Content — conditionally show based on module settings
        if (isSuperAdmin || mod.projects) {
            items.push({ icon: FolderKanban, label: 'Proyectos', path: '/admin/proyectos', category: 'Content' });
        }
        items.push(
            { icon: Newspaper, label: 'Noticias', path: '/admin/noticias', category: 'Content' },
        );
        if (isSuperAdmin || mod.events) {
            items.push({ icon: Calendar, label: 'Eventos', path: '/admin/calendario', category: 'Content' });
        }
        items.push(
            { icon: ImageIcon, label: 'Multimedia', path: '/admin/media', category: 'Content' },
            { icon: Palette, label: 'Imágenes del Sitio', path: '/admin/imagenes-sitio', category: 'Content' },
            { icon: HelpCircle, label: 'Preguntas Frecuentes', path: '/admin/faqs', category: 'Content' },
        );
        if (isSuperAdmin) {
            items.push({ icon: BookOpen, label: 'Base IA', path: '/admin/conocimiento', category: 'Content' });
        }

        // Module-dependent sections
        if (isSuperAdmin || mod.rotaract) {
            items.push({ icon: Users, label: 'Club Rotaract', path: '/admin/rotaract', category: 'Programas' });
        }
        if (isSuperAdmin || mod.interact) {
            items.push({ icon: Users, label: 'Club Interact', path: '/admin/interact', category: 'Programas' });
        }
        if (isSuperAdmin || mod.youth_exchange) {
            items.push({ icon: Globe, label: 'Intercambios Jóvenes', path: '/admin/intercambios-jovenes', category: 'Programas' });
        }
        if (isSuperAdmin || mod.ngse) {
            items.push({ icon: Briefcase, label: 'Intercambios NGSE', path: '/admin/ngse', category: 'Programas' });
        }
        if (isSuperAdmin || mod.rotex) {
            items.push({ icon: Award, label: 'ROTEX', path: '/admin/rotex', category: 'Programas' });
        }

        // E-commerce — conditionally show
        if (isSuperAdmin || mod.ecommerce) {
            items.push(
                { icon: Store, label: 'Tienda', path: '/admin/tienda', category: 'E-commerce' },
                { icon: Receipt, label: 'Órdenes y Pagos', path: '/admin/ordenes', category: 'E-commerce' },
                { icon: Wallet, label: 'Bóveda de Fondos', path: '/admin/boveda', category: 'E-commerce' }
            );
        }

        // DIAN — conditionally show
        if (isSuperAdmin || mod.dian) {
            items.push({ icon: FileText, label: 'Estados Financieros', path: '/admin/estados-financieros', category: 'Compliance' });
        }

        // System — Integraciones + Notificaciones only for super admin
        // Settings: super admin in nav + footer; club users only in footer (not nav)
        if (isSuperAdmin) {
            items.push(
                { icon: Bot, label: 'Agentes IA', path: '/admin/agentes', category: 'System' },
                { icon: Layers, label: 'Integraciones', path: '/admin/integraciones', category: 'System' },
                { icon: Bell, label: 'Notificaciones', path: '/admin/notificaciones', category: 'System' },
                { icon: Settings, label: 'Settings', path: '/admin/configuracion', category: 'System' }
            );
        }

        return items;
    };

    const handleLogout = () => {
        logout();
        navigate('/');
    };

    const menuItems = getMenuItems();
    const categories = Array.from(new Set(menuItems.map(item => item.category)));

    return (
        <div className="flex h-screen bg-gray-50 overflow-hidden font-sans">
            {/* Sidebar */}
            <aside className="w-72 bg-white border-r border-gray-200 flex flex-col flex-shrink-0 z-20">
                {/* Brand Header */}
                <div className="p-6 pb-4">
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-3">
                            {club?.logo ? (
                                <div className="flex flex-col">
                                    <img src={club.logo} alt={club.name} className="h-10 w-auto max-w-[200px] object-contain" />
                                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mt-1">Control Panel</p>
                                </div>
                            ) : (
                                <>
                                    <div className="w-10 h-10 rounded-xl bg-rotary-blue flex items-center justify-center shadow-lg shadow-rotary-blue/20">
                                        <div className="w-5 h-5 border-2 border-white rounded-md flex items-center justify-center font-black text-white text-[8px]">R</div>
                                    </div>
                                    <div>
                                        <h1 className="font-bold text-gray-900 tracking-tight truncate max-w-[140px] leading-tight">
                                            {club?.name || 'Rotary Central'}
                                        </h1>
                                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Control Panel</p>
                                    </div>
                                </>
                            )}
                        </div>
                        <Link to="/" className="text-gray-400 hover:text-rotary-blue transition-colors">
                            <ExternalLink className="w-4 h-4" />
                        </Link>
                    </div>

                    {/* Sidebar Search */}
                    <div className="relative group">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-rotary-blue transition-colors" />
                        <input
                            type="text"
                            placeholder="Search..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-gray-50 border border-gray-200 rounded-xl py-2 pl-10 pr-4 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-rotary-blue/10 focus:border-rotary-blue transition-all"
                        />
                    </div>
                </div>

                {/* Navigation Scroll Area */}
                <nav className="flex-1 overflow-y-auto px-4 py-4 space-y-6 scrollbar-hide">
                    {categories.map((cat) => (
                        <div key={cat} className="space-y-1">
                            <p className={`px-4 text-[10px] font-black uppercase tracking-[0.2em] mb-2 ${cat === 'Setup' ? 'text-amber-500' : 'text-gray-400'}`}>{cat === 'Setup' ? '✦ Pendiente' : cat}</p>
                            {menuItems
                                .filter(item => item.category === cat)
                                .map((item: any) => {
                                    const isActive = location.pathname === item.path;
                                    const isSetup = item.badge === 'pendiente';
                                    const isLocked = !isSuperAdmin && !setupComplete && !SETUP_ALLOWED_PATHS.includes(item.path);
                                    return (
                                        <div key={item.path}>
                                            {isLocked ? (
                                                <button
                                                    onClick={() => setLockedToast('Completa la configuración del sitio para desbloquear esta sección')}
                                                    className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm text-gray-300 cursor-not-allowed opacity-60"
                                                >
                                                    <item.icon className="w-5 h-5 text-gray-300" />
                                                    <span className="flex-1 text-left">{item.label}</span>
                                                    <Lock className="w-3.5 h-3.5 text-gray-300" />
                                                </button>
                                            ) : (
                                                <Link
                                                    to={item.path}
                                                    className={`flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all text-sm group ${isActive
                                                        ? isSetup ? 'bg-amber-50 text-amber-800 font-bold' : 'bg-gray-50 text-gray-900 font-bold'
                                                        : isSetup
                                                            ? 'text-amber-700 bg-amber-50/60 hover:bg-amber-50 font-semibold border border-amber-100'
                                                            : 'text-gray-500 hover:bg-gray-50/50 hover:text-gray-900'
                                                        }`}
                                                >
                                                    <item.icon className={`w-5 h-5 transition-colors ${isActive
                                                        ? isSetup ? 'text-amber-600' : 'text-rotary-blue'
                                                        : isSetup ? 'text-amber-500' : 'text-gray-400 group-hover:text-gray-600'
                                                        }`} />
                                                    <span className="flex-1">{item.label}</span>
                                                    {isSetup && (
                                                        <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse flex-shrink-0" />
                                                    )}
                                                    {item.expandable && <ChevronDown className="w-3.5 h-3.5 text-gray-300" />}
                                                </Link>
                                            )}
                                        </div>
                                    );
                                })}
                        </div>
                    ))}
                </nav>

                {/* Sidebar Footer / User Profile */}
                <div className="p-4 border-t border-gray-100 bg-white sticky bottom-0">
                    <div className="flex flex-col gap-1 mb-4">
                        {/* Club users: Configurar Sitio with % | Super admin: Settings */}
                        {user?.role === 'administrator' ? (
                            <Link to="/admin/configuracion" className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-500 hover:text-gray-900 rounded-xl hover:bg-gray-50 transition-all group">
                                <Settings className="w-5 h-5 text-gray-400 group-hover:text-gray-600" />
                                Settings
                            </Link>
                        ) : (
                            <Link to="/admin/configuracion-sitio" className="flex items-center gap-3 px-4 py-2.5 text-sm rounded-xl hover:bg-gray-50 transition-all group font-semibold text-gray-700">
                                <Sparkles className="w-5 h-5 text-rotary-blue" />
                                <span className="flex-1">Configurar Sitio</span>
                                <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${pctColor}`}>
                                    {setupPct}%
                                </span>
                            </Link>
                        )}
                        <button onClick={handleLogout} className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-500 hover:text-red-600 rounded-xl hover:bg-red-50 transition-all group">
                            <LogOut className="w-5 h-5 text-gray-400 group-hover:text-red-500" />
                            Logout
                        </button>
                    </div>

                    <div className="p-4 rounded-2xl bg-gray-50 border border-gray-100 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-rotary-blue flex items-center justify-center text-white font-black text-xs shadow-md border-2 border-white">
                            {user?.email?.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-xs font-black text-gray-900 truncate">Admin User</p>
                            <p className="text-[10px] text-gray-400 truncate font-medium">{user?.email}</p>
                        </div>
                        <HelpCircle className="w-4 h-4 text-gray-300 cursor-pointer hover:text-gray-400" />
                    </div>
                </div>
            </aside>

            {/* Main Content Area */}
            <main className="flex-1 flex flex-col min-w-0 bg-white overflow-hidden relative">
                {/* Global Topbar */}
                <header className="h-16 flex items-center justify-between px-10 border-b border-gray-100 flex-shrink-0 z-10">
                    <div className="flex items-center gap-4">
                        <h2 className="text-sm font-bold text-gray-900">Dashboard</h2>
                        <div className="h-4 w-[1px] bg-gray-200" />
                        <p className="text-xs text-gray-400 font-medium">
                            {user?.role === 'administrator' ? 'Sistema Central' : setupComplete ? 'Gestión de Club' : `Configuración · ${setupPctHook}% completado`}
                        </p>
                    </div>

                    <div className="flex items-center gap-2">
                        {/* KPI indicators with hover tooltips */}
                        <div className="hidden lg:flex items-center gap-1">
                            {[
                                { icon: FolderKanban, value: fmtN(stats?.projects || 0), label: 'Proyectos de Servicio' },
                                { icon: Users, value: fmtN(stats?.users || 0), label: 'Socios / Miembros' },
                                { icon: Store, value: fmtN(stats?.products || 0), label: 'Productos en Tienda' },
                                { icon: Newspaper, value: fmtN(stats?.publications || 0), label: 'Publicaciones del Blog' },
                                { icon: UserPlus, value: fmtN(stats?.leads || 0), label: 'Contactos & Leads' },
                                { icon: Users, value: fmtN(gaTotals.users), label: 'Usuarios Únicos (Web)', badge: !gaMock ? 'GA4' : undefined },
                                { icon: Eye, value: fmtN(gaTotals.pageViews), label: 'Páginas Vistas (Web)', badge: !gaMock ? 'GA4' : undefined },
                            ].map((kpi, i) => (
                                <div key={i} className="relative group/kpi">
                                    <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-gray-50 rounded-lg border border-gray-100 hover:bg-white hover:shadow-sm transition-all cursor-default">
                                        <kpi.icon className="w-3.5 h-3.5 text-gray-400" />
                                        <span className="text-[11px] font-black text-gray-700">{kpi.value}</span>
                                        {kpi.badge && <span className="text-[7px] font-black text-emerald-600 bg-emerald-50 px-1 rounded">{kpi.badge}</span>}
                                    </div>
                                    {/* Tooltip */}
                                    <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 px-3 py-1.5 bg-gray-900 text-white text-[10px] font-bold rounded-lg whitespace-nowrap opacity-0 invisible group-hover/kpi:opacity-100 group-hover/kpi:visible transition-all duration-200 z-50 pointer-events-none shadow-xl">
                                        {kpi.label}
                                        <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-gray-900 rotate-45" />
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="h-8 w-[1px] bg-gray-100 mx-1" />

                        {/* Prominent action icons: Donations, Funds, Notifications, Messages */}
                        <div className="flex items-center gap-1">
                            {/* Donaciones / Tienda */}
                            <div className="relative group/don">
                                <Link to="/admin/boveda" className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg hover:bg-emerald-50 transition-all">
                                    <TrendingUp className="w-4.5 h-4.5 text-emerald-500" />
                                    <span className="text-[12px] font-black text-gray-800">${stats?.donations?.toLocaleString() || '0'}</span>
                                </Link>
                                <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 px-3 py-1.5 bg-gray-900 text-white text-[10px] font-bold rounded-lg whitespace-nowrap opacity-0 invisible group-hover/don:opacity-100 group-hover/don:visible transition-all duration-200 z-50 pointer-events-none shadow-xl">
                                    Donaciones / Tienda
                                    <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-gray-900 rotate-45" />
                                </div>
                            </div>

                            {/* Fondos Disponibles */}
                            <div className="relative group/fon">
                                <Link to="/admin/boveda" className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg hover:bg-amber-50 transition-all">
                                    <Wallet className="w-4.5 h-4.5 text-amber-500" />
                                    <span className="text-[12px] font-black text-gray-800">${stats?.availableFunds?.toLocaleString() || '0'}</span>
                                </Link>
                                <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 px-3 py-1.5 bg-gray-900 text-white text-[10px] font-bold rounded-lg whitespace-nowrap opacity-0 invisible group-hover/fon:opacity-100 group-hover/fon:visible transition-all duration-200 z-50 pointer-events-none shadow-xl">
                                    Fondos Disponibles
                                    <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-gray-900 rotate-45" />
                                </div>
                            </div>

                            <div className="h-6 w-[1px] bg-gray-200 mx-0.5" />

                            {/* Bell Notifications */}
                            <button className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg transition-all relative">
                                <Bell className="w-5 h-5" />
                                <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border-2 border-white" />
                            </button>

                            {/* Mail — unread leads */}
                            <Link
                                to="/admin/leads"
                                className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all relative"
                                title="Mensajes de formulario de contacto"
                            >
                                <Mail className="w-5 h-5" />
                                {unreadLeads > 0 && (
                                    <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center bg-blue-600 text-white text-[9px] font-black rounded-full border-2 border-white px-1">
                                        {unreadLeads > 99 ? '99+' : unreadLeads}
                                    </span>
                                )}
                            </Link>
                        </div>

                        <div className="h-8 w-[1px] bg-gray-100 mx-1" />

                        <div className="flex items-center gap-3 pl-1">
                            <div className="text-right hidden sm:block">
                                <p className="text-[10px] font-black text-gray-900 leading-none">Status</p>
                                <p className="text-[9px] text-emerald-500 font-bold uppercase tracking-widest mt-1">Live Online</p>
                            </div>
                        </div>
                    </div>
                </header>

                <div className="flex-1 overflow-y-auto px-10 py-10 scrollbar-hide">
                    <div className="max-w-7xl mx-auto">
                        {children}
                    </div>
                </div>

                {/* Locked Toast Notification */}
                {lockedToast && (
                    <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 animate-fade-in">
                        <div className="flex items-center gap-3 bg-gray-900 text-white px-5 py-3 rounded-xl shadow-2xl">
                            <Lock className="w-4 h-4 text-amber-400" />
                            <p className="text-sm font-bold">{lockedToast}</p>
                        </div>
                    </div>
                )}
            </main>
        </div >
    );
};

export default AdminLayout;
