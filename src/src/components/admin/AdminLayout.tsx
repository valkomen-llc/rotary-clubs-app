import React, { useState, useEffect, useRef } from 'react';
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
    Layout,
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
    X,
    Menu,
    FileText,
    Globe,
    Briefcase,
    Award,
    Terminal,
    QrCode,
    ShieldCheck,
    Upload,
    MessageSquare,
    Video,
    Share2,
    Activity
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useClub } from '../../contexts/ClubContext';
import { useSetupProgress, SETUP_ALLOWED_PATHS } from '../../hooks/useSetupProgress';
import { SYSTEM_UPDATES } from '../../pages/SystemUpdates';

const API = import.meta.env.VITE_API_URL || '/api';
const fmtN = (n: number) => n >= 1000000 ? `${(n / 1000000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);

interface MenuItem {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    icon: any;
    label: string;
    path: string;
    category: string;
    keywords?: string[];
    badge?: string;
    expandable?: boolean;
}

const AdminLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { logout, user, isImpersonating, revertImpersonation } = useAuth();
    const { club } = useClub();
    const navigate = useNavigate();
    const location = useLocation();
    const [searchQuery, setSearchQuery] = useState('');
    const [searchFocused, setSearchFocused] = useState(false);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const [lockedToast, setLockedToast] = useState<string | null>(null);
    const [sidebarOpen, setSidebarOpen] = useState(false);

    // ── Setup Progress (for gating) ──
    const { pct: setupPctHook, isComplete: setupComplete } = useSetupProgress();

    // ── Header KPIs ──
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [stats, setStats] = useState<any>(null);
    const [gaTotals, setGaTotals] = useState<{ users: number; pageViews: number }>({ users: 0, pageViews: 0 });
    const [gaMock, setGaMock] = useState(false);
    const [unreadLeads, setUnreadLeads] = useState(0);
    const [platformLogo, setPlatformLogo] = useState<string | null>(() => {
        try {
            const cached = localStorage.getItem('cp_platform_logo');
            return cached ? JSON.parse(cached).url : null;
        } catch { return null; }
    });
    const [platformLogoSize, setPlatformLogoSize] = useState<number>(48);
    const [mod, setMod] = useState<Record<string, boolean>>(() => {
        // Read modules from localStorage for immediate sidebar rendering
        try {
            const stored = JSON.parse(localStorage.getItem('rotary_club') || '{}');
            const m = stored.modules || {};
            return {
                projects: m.projects !== false,
                events: m.events !== false,
                rotaract: !!m.rotaract,
                interact: !!m.interact,
                ecommerce: !!m.ecommerce,
                dian: !!m.dian,
                youth_exchange: !!m.youth_exchange,
                ngse: !!m.ngse,
                rotex: !!m.rotex,
            };
        } catch {
            return {
                projects: true, events: true, rotaract: false, interact: false,
                ecommerce: false, dian: false, youth_exchange: false, ngse: false, rotex: false
            };
        }
    });

    // ── Domain-based super admin detection ──
    // If user is on a club-specific domain, always treat as club context
    const PLATFORM_HOSTS = ['clubplatform.org', 'www.clubplatform.org', 'app.clubplatform.org', 'localhost'];
    const currentHost = window.location.hostname;
    const isOnClubDomain = !PLATFORM_HOSTS.includes(currentHost);

    // isSuperAdmin = on the platform domain AND role is administrator
    const isSuperAdmin = !isOnClubDomain && user?.role === 'administrator';

    // Skip setup gating if the club already has a published custom domain
    const hasPublishedDomain = isOnClubDomain;

    // Hostname for GA4 filtering and Ver mi Sitio button
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const safeDomain = (club as any)?.domain;
    // Treat "localhost" and "*.clubplatform.org" as non-custom domains so we properly fallback to the subdomain parameter query
    const cleanDomain = (typeof safeDomain === 'string' && safeDomain.trim() !== '' && !safeDomain.includes('localhost') && !safeDomain.includes('clubplatform.org')) ? safeDomain.trim() : null;
    
    const clubHostname: string | null = isOnClubDomain
        ? currentHost
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        : (cleanDomain || ((club as any)?.subdomain ? `${(club as any).subdomain}.clubplatform.org` : null));

    // Link "Ver mi Sitio" (Fallback approach using ?club= to bypass DNS Wildcard issues)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const paramKey = (club as any)?.type === 'association' ? 'asociacion' : ((club as any)?.type === 'district' ? 'distrito' : 'club');
    const verMiSitioUrl = cleanDomain 
        ? `https://${cleanDomain}` 
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        : ((club as any)?.subdomain ? `https://app.clubplatform.org/?${paramKey}=${(club as any).subdomain}` : null);

    // Redirect to dashboard if trying to access locked route
    useEffect(() => {
        if (!isSuperAdmin && !setupComplete && !hasPublishedDomain && !SETUP_ALLOWED_PATHS.includes(location.pathname)) {
            navigate(user?.role === 'editor' ? '/admin/analytics' : '/admin/dashboard');
        }
    }, [location.pathname, setupComplete, isSuperAdmin, hasPublishedDomain, user?.role, navigate]);

    // Forcefully remove tracking/preview query parameters from the admin dashboard URL
    // so they do not permanently pollute the club context.
    useEffect(() => {
        const search = window.location.search;
        if (search.includes('club=') || search.includes('asociacion=') || search.includes('distrito=')) {
            const cleanUrl = window.location.protocol + "//" + window.location.host + window.location.pathname + window.location.hash;
            window.history.replaceState(null, '', cleanUrl);
            window.location.reload();
        }
    }, []);

    // Auto-dismiss locked toast
    useEffect(() => {
        if (lockedToast) {
            const t = setTimeout(() => setLockedToast(null), 3000);
            return () => clearTimeout(t);
        }
    }, [lockedToast]);

    useEffect(() => {
        // Fetch dashboard stats
        const token = localStorage.getItem('rotary_token');

        // Fetch platform logo if super admin
        if (isSuperAdmin) {
            fetch(`${API}/platform-config/logo`)
                .then(r => r.json())
                .then(data => {
                    if (data.url) setPlatformLogo(data.url);
                    if (data.size) setPlatformLogoSize(data.size);
                    try { localStorage.setItem('cp_platform_logo', JSON.stringify({ url: data.url, size: data.size })); } catch { }
                })
                .catch(() => {});
        }

        // For club domains, pass the club.id from context; for platform, no filter
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const clubId = (club as any)?.id;
        const statsUrl = clubId ? `${API}/admin/stats?clubId=${clubId}` : `${API}/admin/stats`;
        fetch(statsUrl, { headers: { Authorization: `Bearer ${token}` } })
            .then(r => r.ok ? r.json() : null).then(d => d && setStats(d)).catch(() => { });

        // Fetch GA4 totals
        if (clubHostname) {
            fetch(`${API}/analytics/traffic?days=30&hostname=${encodeURIComponent(clubHostname)}`)
                .then(r => r.json())
                .then(d => { setGaMock(!!d.mock); if (d.totals) setGaTotals(d.totals); })
                .catch(() => setGaMock(true));
        } else if (isSuperAdmin) {
            fetch(`${API}/analytics/traffic?days=30`)
                .then(r => r.json())
                .then(d => { setGaMock(!!d.mock); if (d.totals) setGaTotals(d.totals); })
                .catch(() => setGaMock(true));
        } else {
            // No hostname available — show zeros
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setGaMock(true);
            setGaTotals({ users: 0, pageViews: 0 });
        }
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

    // ⌘K / Ctrl+K keyboard shortcut for search
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                searchInputRef.current?.focus();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    // Fetch module settings for club users
    useEffect(() => {
        if (isSuperAdmin) return;
        const token = localStorage.getItem('rotary_token');
        // For club admins, user.clubId is their actual club. club?.id from context
        // is the platform club (origen), NOT the user's club.
        const storedClub = (() => { try { return JSON.parse(localStorage.getItem('rotary_club') || '{}'); } catch { return {}; } })();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cid = user?.clubId || user?.club?.id || storedClub?.id || club?.id;
        if (!cid || !token) return;
        fetch(`${API}/admin/clubs/${cid}/settings`, { headers: { Authorization: `Bearer ${token}` } })
            .then(r => r.ok ? r.json() : [])
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .then((settings: any[]) => {
                if (!Array.isArray(settings) || settings.length === 0) return;
                const map: Record<string, string> = {};
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            { w: 12, ok: !!(club as any).contact?.email || !!(club as any).city },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            { w: 10, ok: !!((club as any).colors?.primary && (club as any).colors?.primary !== '#013388') },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            { w: 10, ok: !!(Array.isArray((club as any).social) && (club as any).social.some((s: any) => s.url)) },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
        const items: MenuItem[] = [];

        // FIRST OPTION: Asistencia Chat (ONLY FOR SUPER ADMINS)
        if (isSuperAdmin) {
            items.push({ 
                icon: MessageSquare, 
                label: 'Asistencia Chat', 
                path: '/admin/asistencia', 
                category: 'General', 
                keywords: ['ayuda', 'soporte', 'chat', 'ia', 'antigravity'],
                badge: 'ia'
            });
        }

        if (user?.role !== 'editor') {
            items.push({ icon: LayoutDashboard, label: 'Overview', path: '/admin/dashboard', category: 'General', keywords: ['inicio', 'panel', 'dashboard', 'resumen'] });
        }
        items.push(
            { icon: PieChart, label: 'Analytics', path: '/admin/analytics', category: 'General', keywords: ['estadisticas', 'visitas', 'trafico', 'ga4'] }
        );

        if (isSuperAdmin) {
            items.push(
                { icon: Terminal, label: 'Mission Control VIP', path: '/admin/mission-control-vip', category: 'General', keywords: ['agentes', 'mission control', 'gateway', 'vip'] },
                { icon: Layout, label: 'Sistema Footer', path: '/admin/sistema-footer', category: 'General', keywords: ['footer', 'skin', 'logo', 'pie de pagina'] },
                { icon: QrCode, label: 'WhatsApp QR Gateway', path: '/admin/whatsapp-qr', category: 'General', keywords: ['whatsapp', 'qr', 'web', 'grupos'] },
                { icon: ShieldCheck, label: 'System Updates', path: '/admin/system-updates', category: 'General', keywords: ['updates', 'versiones', 'changelog', 'sistema'] },
            );
        }

        // Management items for District/Super Admins
        if (isSuperAdmin || user?.role === 'district_admin') {
            items.push(
                { icon: Activity, label: 'District Health IQ', path: '/admin/district-iq', category: 'Management', keywords: ['salud', 'distrito', 'analitica', 'prediccion', 'iq'], badge: 'ia' },
            );
        }

        if (isSuperAdmin) {
            items.push(
                { icon: Network, label: 'Distritos', path: '/admin/distritos', category: 'Management', keywords: ['distrito', '4271', '4281'] },
                { icon: Building2, label: 'Clubes', path: '/admin/clubes', category: 'Management', keywords: ['club', 'gestionar'] },
                { icon: Globe, label: 'Asociaciones', path: '/admin/asociaciones', category: 'Management', keywords: ['latir', 'emar', 'red', 'asociacion', 'colrotarios'] },
                { icon: Network, label: 'Zonas', path: '/admin/zonas', category: 'Management', keywords: ['zona'] },
                { icon: Briefcase, label: 'Programas de Intercambio', path: '/admin/programas-intercambio', category: 'Management', keywords: ['programa', 'intercambio'] },
                { icon: FolderKanban, label: 'Ferias de Proyectos', path: '/admin/ferias-proyectos', category: 'Management', keywords: ['feria', 'proyectos'] },
                { icon: Calendar, label: 'Eventos/Convenciones', path: '/admin/eventos-convenciones', category: 'Management', keywords: ['evento', 'convencion'] },
                { icon: Users, label: 'Super Users', path: '/admin/usuarios', category: 'Management', keywords: ['usuario', 'admin'] },
                { icon: HeartHandshake, label: 'Donaciones Globales', path: '/admin/donaciones', category: 'Management', keywords: ['donacion', 'aportes'] },
                { icon: Bell, label: 'CRM y Envíos Centrales', path: '/admin/crm', category: 'Management', keywords: ['crm', 'email', 'campana', 'whatsapp'] },
                { icon: UserPlus, label: 'Contactos & Leads', path: '/admin/leads', category: 'Management', keywords: ['contacto', 'lead', 'formulario'] },
                { icon: Video, label: 'Content Studio', path: '/admin/content-studio', category: 'Management', keywords: ['video', 'reels', 'tiktok', 'ia', 'shorts'], badge: 'ia' },
                { icon: Share2, label: 'Hub Social', path: '/admin/social-hub', category: 'Management', keywords: ['facebook', 'linkedin', 'twitter', 'x', 'oauth', 'conexiones'], badge: 'premium' },
            );
        } else {
            const isAssoc = club?.type === 'association';
            const isDistrict = club?.type === 'district';
            const orgTypeLabel = isAssoc ? 'Asociación' : isDistrict ? 'Distrito' : 'Sitio';
            
            items.push(
                { icon: ShieldCheck, label: 'Solicitudes Técnicas', path: '/admin/technical-requests', category: orgTypeLabel, keywords: ['dominio', 'transferencia', 'soporte', 'tecnico', 'ayuda'] },
                { icon: Settings, label: 'Configuración', path: '/admin/configuracion', category: orgTypeLabel, keywords: ['logo', 'nombre', 'perfil', 'identidad', 'contacto', 'redes', 'facturacion', 'stripe', 'pago', 'configurar'], badge: 'config' }
            );

            if (user?.role !== 'editor') {
                items.push(
                    { icon: Users, label: `Miembros de${isAssoc ? ' la ' : 'l '}${orgTypeLabel}`, path: '/admin/miembros', category: orgTypeLabel, keywords: ['socio', 'miembro', 'directorio'] }
                );
            }

            items.push(
                { icon: UserPlus, label: 'Contactos & Leads', path: '/admin/leads', category: orgTypeLabel, keywords: ['contacto', 'lead', 'formulario'] }
            );
        }

        // Content — conditionally show based on module settings
        if (isSuperAdmin || mod.projects) {
            items.push({ icon: FolderKanban, label: 'Proyectos', path: '/admin/proyectos', category: 'Content', keywords: ['proyecto', 'obra', 'servicio'] });
        }
        items.push(
            { icon: Newspaper, label: 'Noticias', path: '/admin/noticias', category: 'Content', keywords: ['noticia', 'articulo', 'blog', 'publicacion'] },
        );
        if (isSuperAdmin || mod.events) {
            items.push({ icon: Calendar, label: 'Eventos', path: '/admin/eventos', category: 'Content', keywords: ['evento', 'calendario', 'reunion', 'fecha'] });
        }
        items.push(
            { icon: ImageIcon, label: 'Multimedia', path: '/admin/media', category: 'Content', keywords: ['foto', 'video', 'imagen', 'galeria', 'archivo'] },
            { icon: Palette, label: 'Imágenes del Sitio', path: '/admin/imagenes-sitio', category: 'Content', keywords: ['hero', 'banner', 'portada', 'diseno'] },
            { icon: Upload, label: 'Centro de Descargas', path: '/admin/descargas', category: 'Content', keywords: ['descargas', 'archivos', 'manuales', 'plantillas'] }
        );

        if (user?.role !== 'editor') {
            items.push(
                { icon: HelpCircle, label: 'Preguntas Frecuentes', path: '/admin/faqs', category: 'Content', keywords: ['faq', 'pregunta', 'ayuda'] }
            );
        }

        if (isSuperAdmin) {
            items.push({ icon: BookOpen, label: 'Base IA', path: '/admin/conocimiento', category: 'Content' });
        }

        // Module-dependent sections (Programas)
        if (user?.role !== 'editor') {
            const isOrigenAdmin = user?.role === 'club_admin' && (club?.id === '857498f8-4836-4c5b-95b2-80d8c073edfc' || club?.subdomain === 'rotaryecluborigen');
            if (user?.role === 'crowdfunder' || isSuperAdmin || isOrigenAdmin) {
                items.push({ 
                    icon: Wallet, 
                    label: 'Mi Inversión', 
                    path: '/admin/inversion', 
                    category: 'Finanzas',
                    keywords: ['wallet', 'inversion', 'ganancia', 'capital', 'dominio', 'crowdfund'],
                    badge: 'premium'
                });
            }

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

    // Dynamic page title from current route
    const currentPageTitle = React.useMemo(() => {
        const match = menuItems.find(item => item.path === location.pathname);
        return match?.label || 'Dashboard';
    }, [location.pathname, menuItems]);

    return (
        <div className="flex flex-col h-screen bg-gray-50 overflow-hidden font-sans">
            {/* System Upgrade / Version Banner */}
            <div className="bg-[#1B2B4D] text-white w-full py-2 px-4 flex sm:flex-row flex-col items-center justify-center gap-2 sm:gap-3 text-xs font-medium z-[100] flex-shrink-0">
                <div className="flex items-center gap-2 text-center">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400 animate-pulse flex-shrink-0" />
                    <span>Estamos desarrollando mejoras en la plataforma. Los módulos y herramientas se habilitarán progresivamente.</span>
                </div>
                <div className="hidden sm:block h-3 w-[1px] bg-slate-600 mx-1" />
                <Link to="/system-updates" className="flex items-center gap-1.5 text-amber-400 hover:text-amber-300 transition-colors font-bold tracking-wide">
                    <span>Release {SYSTEM_UPDATES[0].version}</span>
                    <FileText className="w-3 h-3" />
                </Link>
            </div>

            {/* Impersonation Banner */}
            {isImpersonating && (
                <div className="bg-gradient-to-r from-red-600 to-red-700 text-white w-full py-2.5 px-4 flex items-center justify-center gap-4 text-sm font-bold z-[100] shadow-md flex-shrink-0">
                    <span className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-red-300 animate-pulse border border-white" />
                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                        Estás simulando la vista como {user?.role === 'district_admin' ? 'Distrito' : 'Club'} ({(user as any)?.district?.name || (user as any)?.club?.name || user?.email})
                    </span>
                    <div className="h-4 w-[1px] bg-red-400/50 mx-2" />
                    <button 
                        onClick={revertImpersonation} 
                        className="bg-red-800/50 hover:bg-red-800 px-4 py-1.5 rounded-full transition-all flex items-center gap-1.5 shadow-inner border border-red-500/30"
                    >
                        Volver a Super Administrador
                    </button>
                </div>
            )}

            <div className="flex flex-1 overflow-hidden relative">
                {/* Mobile Overlay */}
                {sidebarOpen && (
                    <div
                        className="fixed inset-0 bg-black/40 z-30 lg:hidden backdrop-blur-sm"
                        onClick={() => setSidebarOpen(false)}
                    />
                )}
                {/* Sidebar */}
                <aside className={`fixed lg:static inset-y-0 left-0 w-72 bg-white border-r border-gray-200 flex flex-col flex-shrink-0 z-40 transform transition-transform duration-300 ease-in-out ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
                    {/* Brand Header */}
                    <div className="p-6 pb-4">
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-3">
                                {isSuperAdmin ? (
                                    <div className="flex flex-col">
                                        {platformLogo ? (
                                            <img 
                                                src={platformLogo} 
                                                alt="ClubPlatform Premium" 
                                                className="h-auto w-auto object-contain rounded-lg" 
                                                style={{ maxHeight: `${Math.min(platformLogoSize * 1.5, 64)}px`, maxWidth: '220px' }}
                                            />
                                        ) : (
                                            <img src="/images/platform_logo_premium.png" alt="ClubPlatform Premium" className="h-auto max-h-12 w-auto max-w-[220px] object-contain rounded-lg" />
                                        )}
                                        <p className="text-[10px] text-amber-600 font-black uppercase tracking-[0.1em] mt-1.5 flex items-center gap-1.5">
                                            <Sparkles className="w-2.5 h-2.5" />
                                            System Administrator
                                        </p>
                                    </div>
                                ) : club?.logo ? (
                                    <div className="flex flex-col">
                                        <img src={club.logo} alt={club.name} className="h-auto max-h-12 w-auto max-w-[220px] object-contain" />
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
                                ref={searchInputRef}
                                type="text"
                                placeholder="Buscar sección..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                onFocus={() => setSearchFocused(true)}
                                onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && searchQuery.trim()) {
                                        const q = searchQuery.toLowerCase();
                                        const match = menuItems.find(item =>
                                            item.label.toLowerCase().includes(q) ||
                                            (item.keywords && item.keywords.some((k: string) => k.includes(q)))
                                        );
                                        if (match) {
                                            navigate(match.path);
                                            setSearchQuery('');
                                            searchInputRef.current?.blur();
                                        }
                                    }
                                    if (e.key === 'Escape') {
                                        setSearchQuery('');
                                        searchInputRef.current?.blur();
                                    }
                                }}
                                className="w-full bg-gray-50 border border-gray-200 rounded-xl py-2 pl-10 pr-8 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-rotary-blue/10 focus:border-rotary-blue transition-all"
                            />
                            {searchQuery && (
                                <button
                                    onClick={() => { setSearchQuery(''); searchInputRef.current?.focus(); }}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                >
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            )}
                            {!searchQuery && !searchFocused && (
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-gray-300 font-mono">⌘K</span>
                            )}

                            {/* Search Results Dropdown */}
                            {searchQuery.trim() && searchFocused && (() => {
                                const q = searchQuery.toLowerCase();
                                const results = menuItems.filter(item =>
                                    item.label.toLowerCase().includes(q) ||
                                    item.category.toLowerCase().includes(q) ||
                                    (item.keywords && item.keywords.some((k: string) => k.includes(q)))
                                );
                                return results.length > 0 ? (
                                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-50 py-1 max-h-64 overflow-y-auto">
                                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                                        {results.map((item: any) => (
                                            <Link
                                                key={item.path}
                                                to={item.path}
                                                onClick={() => { setSearchQuery(''); setSearchFocused(false); }}
                                                className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors"
                                            >
                                                <item.icon className="w-4 h-4 text-gray-400" />
                                                <span className="flex-1">{item.label}</span>
                                                <span className="text-[10px] text-gray-300 uppercase">{item.category}</span>
                                            </Link>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-50 p-4 text-center">
                                        <p className="text-sm text-gray-400">Sin resultados para "{searchQuery}"</p>
                                    </div>
                                );
                            })()}
                        </div>
                    </div>

                    {/* Navigation Scroll Area */}
                    <nav className="flex-1 overflow-y-auto px-4 py-4 space-y-6 scrollbar-hide">
                        {categories.map((cat) => (
                            <div key={cat} className="space-y-1">
                                <p className={`px-4 text-[10px] font-black uppercase tracking-[0.2em] mb-2 ${cat === 'Setup' ? 'text-amber-500' : 'text-gray-400'}`}>{cat === 'Setup' ? '✦ Pendiente' : cat}</p>
                                {menuItems
                                    .filter(item => item.category === cat)
                                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                    .map((item: any) => {
                                        const isActive = location.pathname === item.path;
                                        const isSetup = item.badge === 'pendiente';
                                        const isLocked = !isSuperAdmin && !setupComplete && !hasPublishedDomain && !SETUP_ALLOWED_PATHS.includes(item.path);
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
                                                        {item.badge === 'config' && user?.role !== 'administrator' && (
                                                            <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full ${pctColor} border`}>
                                                                {setupPct}%
                                                            </span>
                                                        )}
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
                            {/* Unified configuration link is now in the main menu items */}
                            <div className="h-4"></div>
                            <button onClick={handleLogout} className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-500 hover:text-red-600 rounded-xl hover:bg-red-50 transition-all group">
                                <LogOut className="w-5 h-5 text-gray-400 group-hover:text-red-500" />
                                Logout
                            </button>
                            <div className="flex justify-center mt-2">
                                <span className="text-[10px] font-black tracking-widest text-gray-300 uppercase py-1 px-2 border border-gray-100 rounded-full bg-gray-50/50">
                                    Release {SYSTEM_UPDATES[0].version}
                                </span>
                            </div>
                        </div>

                        <div className="p-4 rounded-2xl bg-gray-50 border border-gray-100 flex items-center gap-3 mt-4">
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
                    <header className="h-16 flex items-center justify-between px-4 lg:px-10 border-b border-gray-100 flex-shrink-0 z-10">
                        <div className="flex items-center gap-3">
                            {/* Hamburger button — mobile only */}
                            <button
                                onClick={() => setSidebarOpen(true)}
                                className="lg:hidden p-2 -ml-1 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                            >
                                <Menu className="w-5 h-5" />
                            </button>
                            <h2 className="text-sm font-bold text-gray-900">{currentPageTitle}</h2>
                            <div className="h-4 w-[1px] bg-gray-200 hidden sm:block" />
                            <p className="text-xs text-gray-400 font-medium hidden sm:block">
                                {user?.role === 'administrator' ? 'Sistema Central' : (setupComplete || hasPublishedDomain) ? 'Gestión de Sitio' : `Configuración · ${setupPctHook}% completado`}
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
                                {user?.role === 'administrator' ? (
                                    <a
                                        href="#/admin/mission-control-vip"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-[#013388] hover:bg-blue-900 text-white rounded-lg transition-all border border-[#013388] shadow-md group"
                                    >
                                        <Terminal className="w-3.5 h-3.5 text-[#F7A81B]" />
                                        <span className="text-[10px] font-black uppercase tracking-wider">Enter System [⌘+K]</span>
                                        <ExternalLink className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                                    </a>
                                ) : verMiSitioUrl ? (
                                    <a
                                        href={verMiSitioUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg transition-all border border-emerald-200 group"
                                    >
                                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                        <span className="text-[11px] font-bold">Abrir Sitio</span>
                                        <ExternalLink className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                                    </a>
                                ) : (
                                    <div className="text-right hidden sm:block">
                                        <p className="text-[10px] font-black text-gray-900 leading-none">Status</p>
                                        <p className="text-[9px] text-emerald-500 font-bold uppercase tracking-widest mt-1">Live Online</p>
                                    </div>
                                )}
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
            </div>
            
        </div>
    );
};

export default AdminLayout;
