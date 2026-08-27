import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import {
    LayoutDashboard,
    Users,
    Building2,
    FolderKanban,
    Newspaper,
    Megaphone,
    HeartHandshake,
    Heart,
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
    Percent,
    ExternalLink,
    Sparkles,
    Eye,
    Mail,
    Send,
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
    Activity,
    Brain,
    FileBarChart2,
    GraduationCap,
    CalendarClock,
    Languages,
    // Se usa en el ítem "Mi Proyecto" y faltaba: sin él, el panel de cualquier
    // administrador que además tenga un proyecto postulado quedaba en blanco.
    ClipboardList,
    // Ítem «Slider Global». Un icono que se nombra y no se importa NO lo ve el
    // typecheck de este archivo si el símbolo existe en otro alcance: revienta
    // al PINTAR y deja el panel en blanco. Es lo que pasó con ClipboardList.
    LayoutTemplate,
    // Ítem «Usuarios y permisos» (v4.937). Igual que el de arriba: un icono
    // que se nombra y no se importa NO lo ve el typecheck si el símbolo existe
    // en otro alcance —revienta al PINTAR y deja el panel en blanco—.
    UserCog
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useProjectFairLink } from '../../lib/useProjectFairLink';
import { isOnPlatformDomain, isPlatformSuperAdmin } from '../../lib/platformAdmin';
import { useClub } from '../../contexts/ClubContext';
import { useLang } from '../../contexts/LanguageContext';
import { formatMoney } from '../../lib/locale';
import { useSetupProgress, SETUP_ALLOWED_PATHS } from '../../hooks/useSetupProgress';
// ⚠️ El número de versión sale de un módulo MINÚSCULO, no del changelog.
// `SYSTEM_UPDATES` vive en `pages/SystemUpdates.tsx` —el historial entero de
// la plataforma, 1,1 MB— y AdminLayout lo usa TODO el panel: importarlo acá
// hacía que cada pantalla descargara el changelog para escribir «Release
// 4.879.0» en la barra. Y crecía con cada despliegue. No reintroducirlo.
import { APP_VERSION } from '../../lib/appVersion';
import {
    canOpenPath, initialsOf, displayNameOf,
} from '../../lib/institutionalAccess';
// ⚠️ Los permisos EFECTIVOS los resuelve el SERVIDOR y viajan resueltos
// (`/api/rbac/me`). Acá sólo se consultan — ver `useSiteAccess`.
import { useSiteAccess } from '../../hooks/useSiteAccess';
// El rótulo del menú para un usuario institucional. Es criterio, no una cadena
// suelta en el JSX: la pantalla y su prueba leen la misma tabla.
import { menuLabelFor } from '../../lib/rbacSpec';

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

/**
 * Un importe de la barra superior, con su moneda — y una línea POR MONEDA.
 *
 * v4.843 — Acá salían los dos números que el cliente reportó: «$50,010» y
 * «$47,507.75». Eran `SUM` sin `GROUP BY currency` con un «$» escrito a mano
 * delante, o sea 10 dólares más 50.000 pesos y 8,91 más 47.498,84. La Bóveda
 * ya se había corregido en v4.841; esta barra consulta OTRO endpoint
 * (`/admin/stats`) y seguía mezclando.
 *
 * Es un componente aparte y SIN estado propio a propósito: se usa dos veces y
 * dentro de un `.map`, y un hook ahí depende del largo de la lista — el
 * defecto que dejó una portada en blanco en v4.689.
 *
 * Con una sola moneda se ve exactamente como antes, que es el caso de casi
 * todos los sitios. Sólo el que recibe en varias gana la segunda línea.
 */
const MoneyByCurrency: React.FC<{
    rows?: { currency: string; amount: number }[];
    legacy?: number;
}> = ({ rows, legacy }) => {
    // El formato depende del idioma activo; sin la suscripción se quedaría con
    // el anterior hasta el siguiente repintado.
    useLang();

    // Sin `rows` —un servidor todavía sin desplegar— se cae al campo suelto,
    // que el servidor conserva sobre la moneda PRINCIPAL y nunca sobre la
    // mezcla. Muestra de menos, que es el lado seguro.
    const lista = rows?.length ? rows : [{ currency: '', amount: legacy || 0 }];

    if (lista.length === 1) {
        return (
            <span className="text-[12px] font-black text-gray-800" data-no-translate>
                {formatMoney(lista[0].amount, lista[0].currency || 'USD')}
            </span>
        );
    }

    // Las monedas van UNA AL LADO DE LA OTRA, separadas por un filete: apiladas
    // ocupaban dos renglones en una barra de una línea y empujaban todo lo
    // demás. El orden lo da el servidor y pone primero la del sitio.
    //
    // Se escribe el CÓDIGO y no el símbolo: el peso colombiano en es-CO se
    // formatea «$ 50.000» y el dólar «US$ 10,00», los dos empiezan por «$», y
    // juntos a once píxeles el primero se lee como dólares de un vistazo.
    // «COP 50.000» no se confunde con nada. Con una sola moneda se conserva el
    // símbolo, que es como se veía antes.
    return (
        <span className="flex items-center gap-2" data-no-translate>
            {lista.map((r, i) => (
                <React.Fragment key={r.currency}>
                    {i > 0 && <span className="w-px h-4 bg-gray-200" aria-hidden="true" />}
                    <span className="text-[12px] font-black text-gray-800 whitespace-nowrap">
                        {formatMoney(r.amount, r.currency, undefined, { currencyDisplay: 'code' })}
                    </span>
                </React.Fragment>
            ))}
        </span>
    );
};

const AdminLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { logout, user, isImpersonating, revertImpersonation } = useAuth();
    // ⚠️ TODO HOOK ARRIBA DEL COMPONENTE, ANTES DE CUALQUIER `return`. React
    // identifica cada hook por su ORDEN de llamada: uno escrito debajo de un
    // return temprano no corre en el primer render y sí en el segundo, y React
    // aborta el árbol entero — pantalla en blanco (v4.689). Lo comprueba
    // `npm run check:hooks`.
    const acceso = useSiteAccess();
    // El menú del avatar del encabezado. Va acá arriba, con el resto de los
    // hooks: `check:hooks` y la lección de v4.689.
    const [menuPerfilAbierto, setMenuPerfilAbierto] = React.useState(false);
    const anclaPerfil = React.useRef<HTMLDivElement | null>(null);
    // ¿Este usuario tiene además un proyecto postulado en la feria?
    const projectLink = useProjectFairLink(!!user);
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
    const { isProduction } = useClub();

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
    const currentHost = window.location.hostname;
    const isOnClubDomain = !isOnPlatformDomain();

    // Super administrador de la PLATAFORMA: rol `administrator` en el dominio
    // de la plataforma. El mismo rol en el sitio de un club administra ese
    // club. La regla vive en `src/lib/platformAdmin.ts`, compartida con el
    // guardián de rutas.
    const isSuperAdmin = isPlatformSuperAdmin(user);
    
    // For UI logic, if we are on a custom domain, we treat the user as a club admin even if they have the 'administrator' role
    const isUIAdmin = isSuperAdmin && !isOnClubDomain;

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
    const paramKey = ((club as any)?.type === 'association' || (club as any)?.type === 'Programa de Intercambio') ? 'asociacion' : ((club as any)?.type === 'district' ? 'distrito' : 'club');
    const verMiSitioUrl = cleanDomain 
        ? `https://${cleanDomain}` 
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        : ((club as any)?.subdomain ? `https://app.clubplatform.org/?${paramKey}=${(club as any).subdomain}` : null);

    // Redirect to dashboard if trying to access locked route
    useEffect(() => {
        if (!isSuperAdmin && !setupComplete && !hasPublishedDomain && !SETUP_ALLOWED_PATHS.includes(location.pathname)) {
            navigate(user?.role === 'editor' ? '/admin/analytics' : (isProduction ? '/admin/analytics' : '/admin/dashboard'));
        }
    }, [location.pathname, setupComplete, isSuperAdmin, hasPublishedDomain, user?.role, navigate, isProduction]);

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

        if (isUIAdmin) {
            items.push({ icon: LayoutDashboard, label: 'Overview', path: '/admin/dashboard', category: 'General', keywords: ['inicio', 'panel', 'dashboard', 'resumen'] });
        }
        
        // Analytics is ALWAYS in general, but becomes the first item in Production
        items.push(
            { icon: PieChart, label: 'Analytics', path: '/admin/analytics', category: 'General', keywords: ['estadisticas', 'visitas', 'trafico', 'ga4'] }
        );

        // SEO Inteligente (v4.703) — va para TODO administrador de sitio, no sólo
        // para el global: el posicionamiento es de cada sitio y quien lo
        // administra es quien corrige sus títulos y sus imágenes.
        items.push(
            { icon: Search, label: 'SEO Inteligente', path: '/admin/seo', category: 'General', keywords: ['seo', 'posicionamiento', 'google', 'buscador', 'metadatos', 'sitemap', 'robots', 'open graph', 'compartir', 'whatsapp', 'indexacion', 'keywords', 'palabras clave', 'schema'], badge: 'ia' }
        );

        // Email Marketing (v4.438) — administrador global + administradores de sitios
        // tipo "Evento o Convención". Campañas de correo masivo tipo Mailchimp.
        if (isSuperAdmin || club?.type === 'Evento o Convención') {
            items.push({
                icon: Send,
                label: 'Email Marketing',
                path: '/admin/email-marketing',
                category: 'General',
                keywords: ['email', 'marketing', 'campaña', 'campana', 'newsletter', 'boletin', 'correo', 'mailing', 'difusion', 'mailchimp'],
            });
        }
        
        // Overview for non-super-admins moves to Configuration
        if (!isUIAdmin && user?.role !== 'editor') {
            items.push({ 
                icon: LayoutDashboard, 
                label: 'Overview / Wizard', 
                path: '/admin/dashboard?view=wizard', 
                category: 'Configuración e Identidad', 
                keywords: ['inicio', 'panel', 'dashboard', 'resumen', 'onboarding', 'wizard'] 
            });
        }

        if (isSuperAdmin) {
            items.push(
                { icon: Terminal, label: 'Mission Control VIP', path: '/admin/mission-control-vip', category: 'General', keywords: ['agentes', 'mission control', 'gateway', 'vip'] },
                { icon: Layout, label: 'Sistema Footer', path: '/admin/sistema-footer', category: 'General', keywords: ['footer', 'skin', 'logo', 'pie de pagina'] },
                { icon: QrCode, label: 'WhatsApp QR Gateway', path: '/admin/whatsapp-qr', category: 'Comunicaciones y CRM', keywords: ['whatsapp', 'qr', 'web', 'grupos'] },
                { icon: MessageSquare, label: 'WhatsApp CRM', path: '/admin/crm?tab=wa-chat', category: 'Comunicaciones y CRM', keywords: ['crm', 'whatsapp', 'api', 'mensajes', 'campañas'] },
                { icon: ShieldCheck, label: 'System Updates', path: '/admin/system-updates', category: 'General', keywords: ['updates', 'versiones', 'changelog', 'sistema'] },
                { icon: Megaphone, label: 'Publicaciones / Difusión', path: '/admin/publicaciones', category: 'Management', keywords: ['publicacion', 'difusion', 'blog', 'noticia', 'articulo', 'replicar', 'multi club', 'broadcast'] },
                { icon: FileBarChart2, label: 'Informes Ejecutivos', path: '/admin/informes-ejecutivos', category: 'Management', keywords: ['informes', 'ejecutivos', 'insights', 'reportes', 'kpi', 'pdf', 'madurez', 'ecosistema', 'analitica'], badge: 'ia' },
                { icon: GraduationCap, label: 'Capacitaciones y Soporte', path: '/admin/capacitaciones', category: 'Management', keywords: ['capacitacion', 'soporte', 'agenda', 'calendario', 'reservas', 'citas', 'entrenamiento', 'acompañamiento', 'disponibilidad'] },
            );
        }

        // Management items for District/Super Admins
        if (isSuperAdmin || user?.role === 'district_admin') {
            items.push(
                { icon: Activity, label: 'District Health IQ', path: '/admin/district-iq', category: 'Management', keywords: ['salud', 'distrito', 'analitica', 'prediccion', 'iq'], badge: 'ia' },
            );
        }

        // Centro de Inteligencia — visible para todos los roles autenticados.
        // Super admin ve todos los cerebros; club/district admins ven el suyo
        // + el cerebro maestro (filtrado en backend).
        items.push({
            icon: Brain,
            label: 'Centro de Inteligencia',
            path: '/admin/inteligencia',
            category: isSuperAdmin ? 'Management' : 'General',
            keywords: ['cerebro', 'brain', 'ai core', 'memoria', 'embedding', 'knowledge', 'inteligencia', 'maestro'],
            badge: 'ia',
        });

        // Content Studio AI — visible para todos los roles. Cada sitio ve sólo
        // sus propias publicaciones de la biblioteca (filtrado por clubId en
        // backend). Super admin ve todas las publicaciones de todos los clubs.
        // v4.406: agregado al menú General para clubs/distritos/asociaciones.
        items.push({
            icon: Video,
            label: 'Content Studio',
            path: '/admin/content-studio',
            category: isSuperAdmin ? 'Management' : 'General',
            keywords: ['content', 'studio', 'video', 'reels', 'publicacion', 'ia', 'shorts', 'imagen', 'social', 'instagram', 'facebook'],
            badge: 'ia',
        });

        // Aniversarios IA (v4.895) — módulo INDEPENDIENTE de Plantillas IA, del
        // operador de la plataforma. La configuración gobierna piezas que salen
        // firmadas por clubes de todo el ecosistema, así que no es contenido de
        // un sitio; la ruta y el servidor lo comprueban igual, esconder un
        // enlace no protege un endpoint.
        if (isSuperAdmin) {
            items.push({
                icon: Sparkles,
                label: 'Aniversarios IA',
                path: '/admin/aniversarios-ia',
                category: 'Management',
                keywords: ['aniversario', 'aniversarios', 'cumpleanos del club', 'felicitacion', 'ia', 'generador', 'pieza', 'instrucciones'],
                badge: 'ia',
            });
        }

        if (isSuperAdmin) {
            items.push(
                { icon: Network, label: 'Distritos', path: '/admin/distritos', category: 'Management', keywords: ['distrito', '4271', '4281'] },
                { icon: Building2, label: 'Clubes', path: '/admin/clubes', category: 'Management', keywords: ['club', 'gestionar'] },
                { icon: Globe, label: 'Asociaciones', path: '/admin/asociaciones', category: 'Management', keywords: ['latir', 'emar', 'red', 'asociacion', 'colrotarios'] },
                { icon: Network, label: 'Zonas', path: '/admin/zonas', category: 'Management', keywords: ['zona'] },
                { icon: Briefcase, label: 'Programas de Intercambio', path: '/admin/programas-intercambio', category: 'Management', keywords: ['programa', 'intercambio'] },
                { icon: FolderKanban, label: 'Ferias de Proyectos', path: '/admin/ferias-proyectos', category: 'Management', keywords: ['feria', 'proyectos'] },
                { icon: Wallet, label: 'Postulación de Proyectos', path: '/admin/postulaciones-pagos', category: 'Management', keywords: ['postulacion de proyectos', 'postulaciones y pagos', 'ediciones', 'versiones', 'postulaciones', 'pagos', 'stripe', 'trazabilidad', 'feria', 'proyectos', 'recaudo', 'alertas', 'reportes', 'auditoria', 'convocatoria', 'configuracion', 'inscripcion', 'trm', 'grants'] },
                { icon: Calendar, label: 'Eventos/Convenciones', path: '/admin/eventos-convenciones', category: 'Management', keywords: ['evento', 'convencion'] },
                { icon: Users, label: 'Super Users', path: '/admin/usuarios', category: 'Management', keywords: ['usuario', 'admin'] },
                { icon: HeartHandshake, label: 'Donaciones Globales', path: '/admin/donaciones', category: 'Management', keywords: ['donacion', 'aportes'] },
                { icon: Megaphone, label: 'Campañas de Contribución', path: '/admin/campanas-contribucion', category: 'Management', keywords: ['campana', 'campaña', 'contribucion', 'emergencia', 'terremoto', 'donaciones', 'acopio', 'maneras de contribuir'] },
                { icon: LayoutTemplate, label: 'Slider Global / Llamados a la Acción', path: '/admin/slider-global', category: 'Management', keywords: ['slider', 'slide', 'carrusel', 'llamado', 'accion', 'destacado', 'bloque destacado', 'polio', 'end polio', 'banner', 'portada', 'global', 'spotlight'] },
                { icon: Mail, label: 'Notificaciones de Aportes', path: '/admin/notificaciones-aportes', category: 'Management', keywords: ['notificacion', 'notificaciones', 'correo', 'email', 'recibo', 'confirmacion', 'aporte', 'aportes', 'donacion', 'colrotarios', 'remitente', 'plantilla'] },
                { icon: Bell, label: 'Comunicaciones CRM', path: '/admin/crm', category: 'General', keywords: ['crm', 'email', 'campana', 'whatsapp'] },
                { icon: UserPlus, label: 'Contactos & Leads', path: '/admin/leads', category: 'Management', keywords: ['contacto', 'lead', 'formulario'] },
                { icon: Mail, label: 'Bandeja de Entrada', path: '/admin/email', category: 'Management', keywords: ['email', 'correo', 'buzon', 'entrada', 'mensajes'] },
                { icon: Share2, label: 'Hub Social', path: '/admin/social-hub', category: 'Management', keywords: ['facebook', 'instagram', 'meta', 'redes', 'sociales', 'oauth', 'conexiones', 'metricas', 'insights', 'mensajes', 'comentarios', 'bandeja', 'webhooks'], badge: 'premium' },
            );
        } else {
            const isAssoc = club?.type === 'association' || club?.type === 'Programa de Intercambio';
            const isDistrict = club?.type === 'district';
            const orgTypeLabel = isAssoc ? 'Asociación' : isDistrict ? 'Distrito' : 'Sitio';
            
            // Reordering based on isProduction
            const categoryLabel = isProduction ? 'Gestión de Sitio' : orgTypeLabel;

            items.push(
                { icon: ShieldCheck, label: 'Solicitudes Técnicas', path: '/admin/technical-requests', category: 'Configuración e Identidad', keywords: ['dominio', 'transferencia', 'soporte', 'tecnico', 'ayuda'] },
                { icon: CalendarClock, label: 'Reservar Capacitación', path: '/admin/agenda-soporte', category: 'General', keywords: ['capacitacion', 'soporte', 'agenda', 'reservar', 'cita', 'entrenamiento', 'ayuda', 'acompañamiento'] },
                { icon: Settings, label: 'Configuración / Identidad', path: '/admin/configuracion', category: 'Configuración e Identidad', keywords: ['logo', 'nombre', 'perfil', 'identidad', 'contacto', 'redes', 'facturacion', 'stripe', 'pago', 'configurar'], badge: 'config' },
                { icon: Globe, label: 'Dominio y Publicación', path: '/admin/configuracion?tab=avanzado', category: 'Configuración e Identidad', keywords: ['dominio', 'publicar', 'dns', 'ssl'] }
            );

            if (user?.role !== 'editor') {
                items.push(
                    { icon: Users, label: `Socios y Junta Directiva`, path: '/admin/miembros', category: 'Contenido', keywords: ['socio', 'miembro', 'directorio'] }
                );
            }

            // Usuarios y permisos (v4.937). Va en Configuración e Identidad y no
            // en una categoría propia: es donde ya se administra el sitio, y las
            // pantallas que se olvidan son siempre las del segundo lugar. El
            // filtro por permiso lo hace `canPath` sobre el módulo `users`, no
            // una condición escrita acá.
            items.push(
                { icon: UserCog, label: 'Usuarios y permisos', path: '/admin/usuarios-permisos', category: 'Configuración e Identidad', keywords: ['usuario', 'rol', 'permiso', 'acceso', 'rbac', 'equipo'] }
            );

            items.push(
                { icon: UserPlus, label: 'Contactos & Leads', path: '/admin/leads', category: 'General', keywords: ['contacto', 'lead', 'formulario'] },
                { icon: Mail, label: 'Bandeja de Entrada', path: '/admin/email', category: 'General', keywords: ['email', 'correo', 'buzon', 'entrada', 'mensajes'] }
            );
        }

        // v4.599 — Módulos de la Feria de Proyectos. Antes vivían sólo dentro del
        // bloque de super admin, así que no aparecían en el sitio propio de la
        // feria (dominio de club), que es justo donde el equipo los necesita.
        // Se reconoce el sitio de una feria por cualquiera de los campos donde
        // puede venir el tipo, sin depender de mayúsculas ni de una variante
        // concreta ('Feria de Proyectos', 'project_fair', …).
        const fairTypeHint = `${(club as any)?.type || ''} ${(club as any)?.organizationType || ''} ${(club as any)?.category || ''}`.toLowerCase();
        const isProjectFairSite = /feria de proyectos|project[ _-]?fair/.test(fairTypeHint);
        if (isProjectFairSite && !isSuperAdmin) {
            // Categoría 'General': en un sitio publicado la barra lateral sólo
            // renderiza un conjunto fijo de categorías, y 'Management' no está
            // entre ellas — por eso los módulos se calculaban pero no se veían.
            items.push(
                { icon: Wallet, label: 'Postulación de Proyectos', path: '/admin/postulaciones-pagos', category: 'General', keywords: ['postulacion de proyectos', 'postulaciones y pagos', 'ediciones', 'versiones', 'postulaciones', 'pagos', 'stripe', 'trazabilidad', 'feria', 'proyectos', 'recaudo', 'alertas', 'reportes', 'auditoria', 'convocatoria', 'configuracion', 'inscripcion', 'formulario', 'trm', 'grants'] },
            );
        }

        // v4.620 — Quien además postuló un proyecto entra a formularlo desde su
        // propio panel, sin tener que conocer la dirección del panel del club.
        if (projectLink.hasProject) {
            items.push(
                { icon: ClipboardList, label: 'Mi Proyecto', path: projectLink.path, category: 'General', keywords: ['mi proyecto', 'formulacion', 'postulacion', 'feria'] },
            );
        }

        // Content — conditionally show based on module settings
        if (isSuperAdmin || mod.projects) {
            items.push({ icon: FolderKanban, label: 'Proyectos', path: '/admin/proyectos', category: 'General', keywords: ['proyecto', 'obra', 'servicio'] });
        }
        items.push(
            { icon: Newspaper, label: 'Noticias', path: '/admin/noticias', category: 'General', keywords: ['noticia', 'articulo', 'blog', 'publicacion'] },
        );
        if (isSuperAdmin || mod.events) {
            items.push({ icon: Calendar, label: 'Eventos', path: '/admin/eventos', category: 'General', keywords: ['evento', 'calendario', 'reunion', 'fecha'] });
        }
        items.push(
            { icon: ImageIcon, label: 'Multimedia', path: '/admin/media', category: 'Contenido', keywords: ['foto', 'video', 'imagen', 'galeria', 'archivo'] },
            { icon: Palette, label: 'Imágenes del Sitio', path: '/admin/imagenes-sitio', category: 'Contenido', keywords: ['hero', 'banner', 'portada', 'diseno'] },
            { icon: HeartHandshake, label: 'Bloques de Pago', path: '/admin/bloques-pago', category: 'Contenido', keywords: ['aportes', 'donaciones', 'membresia', 'cuota', 'pago', 'stripe', 'bloques'] },
            { icon: Heart, label: 'Maneras de Contribuir', path: '/admin/maneras-de-contribuir', category: 'Contenido', keywords: ['maneras', 'contribuir', 'aportes', 'donar', 'textos', 'pagina'] },
            { icon: Upload, label: 'Centro de Descargas', path: '/admin/descargas', category: 'Contenido', keywords: ['descargas', 'archivos', 'manuales', 'plantillas'] }
        );

        if (user?.role !== 'editor') {
            items.push(
                { icon: HelpCircle, label: 'Preguntas Frecuentes', path: '/admin/faqs', category: 'Contenido', keywords: ['faq', 'pregunta', 'ayuda'] }
            );
        }

        if (isSuperAdmin) {
            items.push({ icon: BookOpen, label: 'Base IA', path: '/admin/conocimiento', category: 'Contenido' });
        }

        // Module-dependent sections (Programas)
        if (user?.role !== 'editor') {
            const isOrigenAdmin = user?.role === 'club_admin' && (club?.id === '857498f8-4836-4c5b-95b2-80d8c073edfc' || club?.subdomain === 'rotaryecluborigen');
            // ⚠️ …o quien tenga el permiso. La condición de siempre se conserva
            // entera —nadie pierde la entrada— y se le suma la vía del RBAC, que
            // es lo que la hace parte del menú base de un usuario institucional
            // sin escribir una segunda lista de navegación (v4.941).
            if (user?.role === 'crowdfunder' || isSuperAdmin || isOrigenAdmin || acceso.has('investment.view')) {
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
                { icon: Receipt, label: 'Órdenes y Pagos', path: '/admin/ordenes', category: 'E-commerce' }
            );
        }

        // v4.411 — La Bóveda vive en Finanzas (no E-commerce). Disponible para
        // todo club admin: las donaciones llegan a clubes sin tienda activa.
        items.push({
            icon: Wallet,
            label: 'Bóveda de Fondos',
            path: '/admin/boveda',
            category: 'Finanzas',
            keywords: ['donacion', 'aporte', 'retiro', 'balance', 'wallet', 'fondos', 'stripe']
        });

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
                { icon: Languages, label: 'Traducciones', path: '/admin/traducciones', category: 'System' },
                { icon: Bell, label: 'Notificaciones', path: '/admin/notificaciones', category: 'System' },
                { icon: Settings, label: 'Settings', path: '/admin/configuracion', category: 'System' }
            );
        }

        // ⚠️ «MI PERFIL» YA NO ES UNA ENTRADA DEL SIDEBAR (v4.941), y lo que se
        // quitó es el PUNTO DE ACCESO, no la funcionalidad: la ruta
        // `/admin/perfil` sigue viva, sigue en `ALWAYS_VISIBLE_ROUTES` y sigue
        // siendo donde se cambia la contraseña temporal. Se llega por el avatar
        // del encabezado y por la tarjeta de abajo — dos puertas, ninguna
        // escondida—. Dejarla también en la lista de módulos la ponía a competir
        // con las herramientas del sitio, que es lo que hay que ver ahí.
        //
        // ⚠️ Al quitarla, comprobar que el aviso de contraseña temporal siga
        // teniendo salida: el servidor redirige a `/admin/perfil?cambiar=1` y
        // esa navegación no depende del menú.

        return items;
    };

    // Un desplegable que sólo se cierra con su propio botón deja al usuario
    // atrapado: se cierra al pulsar fuera y con Escape, que es lo que cualquiera
    // intenta primero.
    React.useEffect(() => {
        if (!menuPerfilAbierto) return;
        const fuera = (e: MouseEvent) => {
            if (anclaPerfil.current && !anclaPerfil.current.contains(e.target as Node)) setMenuPerfilAbierto(false);
        };
        const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuPerfilAbierto(false); };
        document.addEventListener('mousedown', fuera);
        document.addEventListener('keydown', escape);
        return () => {
            document.removeEventListener('mousedown', fuera);
            document.removeEventListener('keydown', escape);
        };
    }, [menuPerfilAbierto]);

    // Y se cierra al navegar: si no, queda abierto sobre la pantalla siguiente.
    React.useEffect(() => { setMenuPerfilAbierto(false); }, [location.pathname]);

    const handleLogout = () => {
        logout();
        navigate('/');
    };

    // ⚠️ EL MENÚ SE FILTRA POR PERMISO EN UN SOLO SITIO (v4.932).
    //
    // `getMenuItems` arma la lista con decenas de `push` repartidos por trescientas
    // líneas; poner la comprobación en cada uno dejaría el número treinta y uno
    // fuera del filtro, y el fallo sería MUDO —una herramienta que no le toca
    // aparecería en el menú de quien menos acceso tiene—. Acá se filtra la lista
    // ENTERA, así que una entrada nueva nace acotada sola.
    //
    // Para cualquier rol administrativo `canOpenPath` devuelve `true` sin mirar
    // nada: el menú de todos los que ya existían no cambia ni una entrada.
    //
    // ⚠️ v4.937 — EL RECORTE POR RBAC SÓLO ALCANZA A QUIEN TIENE UN ACCESO
    // ACOTADO, y quién lo tiene lo decide el SERVIDOR: `acceso.restricted`
    // viaja resuelto en `/api/rbac/me` (ver `isRestrictedGrant`). El registro
    // de módulos no cubre TODAS las rutas del panel —quedan fuera
    // Capacitaciones, Rotaract, ROTEX, Solicitudes Técnicas y una decena más—,
    // y el `canOpenPath` del RBAC esconde lo no registrado por ser el lado
    // seguro: aplicárselo a quien siempre tuvo el menú entero le borraría esas
    // entradas en silencio. Al registrar un módulo nuevo, sumar sus rutas a
    // `MODULES` en `rbacSpec` — no ensanchar esta condición.
    //
    // ⚠️ v4.939 — Y CON PERMISOS RESUELTOS, MANDA EL RBAC; `canOpenPath` de
    // v4.932 queda de RESPALDO para cuando no hay ninguno. Aquél lee
    // `user.permissions`, que es la FOTO del ingreso guardada en
    // `localStorage`: una cuenta institucional cuyo token no la traiga se
    // quedaba con TODO escondido —el panel vacío que se reportó—. El servidor
    // sí sabe sus permisos, y es de donde salen ahora.
    //
    // Mientras `acceso.loading` no se recorta nada: un menú que aparece a
    // medias y se completa medio segundo después se lee peor que uno que tarda.
    // ⚠️ EL RÓTULO DE «BANDEJA DE ENTRADA» CAMBIA PARA UN USUARIO INSTITUCIONAL
    // (v4.941): ve «Correo Institucional». Es un cambio de NOMBRE y nada más —
    // misma ruta, mismo módulo, mismos endpoints, misma bandeja—, y el criterio
    // vive en `rbacSpec` para que la pantalla y su prueba lean la misma tabla.
    // Se decide por el ROL de la sesión, no por lo que vea el menú: un
    // administrador de sitio sigue leyendo «Bandeja de Entrada».
    const esInstitucional = user?.role === 'institutional_user';
    const menuItems = getMenuItems()
        .filter(item => {
            if (acceso.loading) return true;
            if (acceso.grant) return acceso.restricted ? acceso.canPath(item.path) : true;
            return canOpenPath(user as any, item.path);
        })
        .map(item => ({ ...item, label: menuLabelFor(item.path, item.label, { institutional: esInstitucional }) }));
    // El orden de producción está fijado a propósito; lo que NO puede pasar es
    // pintar la cabecera de una categoría que quedó sin entradas — es lo que
    // dejaba un panel con seis títulos y nada debajo.
    const categories = (isProduction && !isUIAdmin
        ? ['General', 'Contenido', 'Finanzas', 'Programas', 'E-commerce', 'Compliance', 'Configuración e Identidad']
        : Array.from(new Set(menuItems.map(item => item.category)))
    ).filter(cat => menuItems.some(item => item.category === cat));

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
                {/* El historial de lanzamientos es interno de la plataforma: quien
                    administra el sitio de un club ve el aviso, pero no la lista de
                    lo que vamos publicando. El enlace se oculta Y la ruta se
                    protege en `App.tsx`; esconderlo solo no sería suficiente. */}
                {isSuperAdmin && (
                    <>
                        <div className="hidden sm:block h-3 w-[1px] bg-slate-600 mx-1" />
                        <Link to="/system-updates" className="flex items-center gap-1.5 text-amber-400 hover:text-amber-300 transition-colors font-bold tracking-wide">
                            <span>Release {APP_VERSION}</span>
                            <FileText className="w-3 h-3" />
                        </Link>
                    </>
                )}
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

                        {/*
                          ⚠️ UN MENÚ CORTO SE EXPLICA. Sin esta línea, quien entra
                          y ve dos entradas —o una— no distingue «no me toca» de
                          «el panel está roto», y lo reporta como una avería. Es
                          la misma regla que `skipped` en los centros de acopio y
                          que el resumen del control de personas del Reel: un
                          vacío sin motivo es indistinguible de un fallo.
                        */}
                        {!acceso.loading && acceso.restricted && (
                            <div className="mx-1 rounded-xl border border-sky-100 bg-sky-50/60 px-4 py-3">
                                <p className="text-[11px] font-bold uppercase tracking-wide text-sky-700">Acceso por permisos</p>
                                <p className="mt-1 text-[11px] leading-relaxed text-sky-900/80">
                                    {acceso.grant?.roleLabel
                                        ? <>Estás entrando como <span className="font-semibold">{acceso.grant.roleLabel}</span>, así que ves sólo las herramientas de ese rol.</>
                                        : <>Ves sólo las herramientas que tu cuenta tiene habilitadas.</>}
                                    {' '}Quien administre el sitio puede ampliarlas en <span className="font-semibold">Usuarios y permisos</span>.
                                </p>
                            </div>
                        )}
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
                            {/* Mismo criterio: el número de versión es información
                                interna de la plataforma. */}
                            {isSuperAdmin && (
                                <div className="flex justify-center mt-2">
                                    <span className="text-[10px] font-black tracking-widest text-gray-300 uppercase py-1 px-2 border border-gray-100 rounded-full bg-gray-50/50">
                                        Release {APP_VERSION}
                                    </span>
                                </div>
                            )}
                        </div>

                        {/* ⚠️ EL AVATAR ES DE LA PERSONA, NO DEL SITIO (v4.932).
                            Pintaba `club.avatarUrl` y el literal «Admin User»: con
                            varias personas entrando al mismo sitio, todas se veían
                            igual y ninguna se veía a sí misma. La fotografía sale del
                            perfil; el nombre, de sus datos; y sin fotografía van sus
                            INICIALES, que ya distinguen a dos personas. El logotipo
                            del sitio sigue arriba, que es donde identifica al sitio. */}
                        <button
                            type="button"
                            onClick={() => navigate('/admin/perfil')}
                            title="Ver mi perfil"
                            className="w-full p-4 rounded-2xl bg-gray-50 border border-gray-100 flex items-center gap-3 mt-4 text-left hover:bg-gray-100 transition-colors"
                        >
                            {(user as any)?.avatarUrl ? (
                                <img
                                    src={(user as any).avatarUrl}
                                    alt=""
                                    className="w-10 h-10 rounded-full object-cover shadow-md border-2 border-white flex-shrink-0"
                                />
                            ) : (
                                <div className="w-10 h-10 rounded-full bg-rotary-blue flex items-center justify-center text-white font-black text-xs shadow-md border-2 border-white flex-shrink-0">
                                    {initialsOf(user as any, user?.email || '')}
                                </div>
                            )}
                            <div className="flex-1 min-w-0">
                                <p className="text-xs font-black text-gray-900 truncate">
                                    {displayNameOf(user as any, user?.email || '')}
                                </p>
                                <p className="text-[10px] text-gray-400 truncate font-medium" data-no-translate>{user?.email}</p>
                            </div>
                            <HelpCircle className="w-4 h-4 text-gray-300" />
                        </button>
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
                                {/* Saldo actual, por moneda.
                                    v4.844 — Hay UN solo indicador de dinero. Había
                                    dos —lo recaudado en bruto y lo disponible— y
                                    con dos monedas cada uno eran cuatro cifras en
                                    la barra: nadie las lee. Queda la que se puede
                                    usar, ya descontadas las comisiones, y las
                                    monedas van UNA AL LADO DE LA OTRA en vez de
                                    apiladas. El bruto sigue en la Bóveda, en la
                                    tarjeta de cada moneda. */}
                                {/* ⚠️ EN EL PANEL DE LA PLATAFORMA ESTE CHIP MIDE OTRA
                                    COSA, y por eso cambia de icono y de rótulo.
                                    v4.863 — En el sitio de un club es su SALDO: dinero
                                    suyo que va a recibir. En el panel de Club Platform
                                    es la UTILIDAD: lo que la plataforma comisionó por
                                    prestar el servicio. Hasta v4.862 mostraba «US$ 0,00»
                                    —el saldo del sitio «Origen», que no recauda nada— y
                                    era una cifra que no significaba nada.

                                    Se decide por CONTEXTO DE PLATAFORMA (`isUIAdmin`:
                                    operador Y fuera del dominio de un club), no por
                                    «no hay club»: en el dominio de la plataforma
                                    `by-domain` devuelve «Origen», así que «no hay club»
                                    nunca es cierto para el operador. Es la misma lección
                                    que la Bóveda Central (v4.853). Un operador que entra
                                    por el dominio de un club está mirando ESE club y ve
                                    su saldo, como corresponde. */}
                                <div className="relative group/fon">
                                    {/* `aria-label` porque el contenido del enlace son
                                        cifras: sin él, el lector de pantalla lo anuncia
                                        como «COP 47.499 USD 8,91» y no dice qué es. */}
                                    <Link
                                        to="/admin/boveda"
                                        aria-label={isUIAdmin ? 'Comisionado por la plataforma' : 'Saldo actual del club'}
                                        className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg transition-all ${isUIAdmin ? 'hover:bg-emerald-50' : 'hover:bg-amber-50'}`}
                                    >
                                        {isUIAdmin
                                            ? <Percent className="w-4.5 h-4.5 text-emerald-600 flex-shrink-0" />
                                            : <Wallet className="w-4.5 h-4.5 text-amber-500 flex-shrink-0" />}
                                        <MoneyByCurrency
                                            rows={isUIAdmin ? stats?.platformRevenueByCurrency : stats?.availableFundsByCurrency}
                                            legacy={isUIAdmin ? 0 : stats?.availableFunds}
                                        />
                                    </Link>
                                    <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 px-3 py-1.5 bg-gray-900 text-white text-[10px] font-bold rounded-lg whitespace-nowrap opacity-0 invisible group-hover/fon:opacity-100 group-hover/fon:visible transition-all duration-200 z-50 pointer-events-none shadow-xl">
                                        {/* NO dice «disponible para retiro»: eso es otra
                                            cosa y en la Bóveda vale otro número. Acá está
                                            lo NETO recibido —descontadas las comisiones—,
                                            que incluye lo que Stripe todavía no liberó.
                                            Dos rótulos iguales con dos cifras distintas en
                                            el mismo módulo es el defecto que esta
                                            reingeniería vino a quitar.

                                            Y por lo mismo el de la plataforma dice
                                            «comisionado», no «saldo»: esa plata no es un
                                            saldo que se pueda retirar, es la utilidad
                                            acumulada por prestar el servicio. */}
                                        {isUIAdmin
                                            ? 'Comisionado por la plataforma · acumulado'
                                            : 'Saldo actual · neto recibido'}
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

                                {/*
                                  ⚠️ EL AVATAR DE LA PERSONA, ENTRE MENSAJES Y «ABRIR SITIO» (v4.941).
                                  Es uno de los dos puntos de acceso al perfil desde que «Mi perfil»
                                  dejó de ocupar una entrada del sidebar; el otro es la tarjeta de
                                  abajo. La funcionalidad no cambió: los dos llevan a la MISMA ruta
                                  y a la MISMA pantalla — no hay un segundo sistema de perfiles.

                                  Es de la PERSONA, no del sitio (v4.932): fotografía si la tiene y,
                                  si no, sus iniciales. El logotipo del sitio sigue en la barra
                                  lateral, que es donde identifica al sitio.
                                */}
                                <div className="relative" ref={anclaPerfil}>
                                    <button
                                        type="button"
                                        onClick={() => setMenuPerfilAbierto(v => !v)}
                                        aria-haspopup="menu"
                                        aria-expanded={menuPerfilAbierto}
                                        aria-label={`Mi cuenta: ${displayNameOf(user as any, user?.email || '')}`}
                                        title="Mi cuenta"
                                        className={`ml-0.5 rounded-full transition-all ring-2 ${menuPerfilAbierto ? 'ring-rotary-blue' : 'ring-transparent hover:ring-gray-200'}`}
                                    >
                                        {(user as any)?.avatarUrl ? (
                                            <img src={(user as any).avatarUrl} alt="" className="w-8 h-8 rounded-full object-cover block" />
                                        ) : (
                                            <span className="w-8 h-8 rounded-full bg-rotary-blue text-white text-[10px] font-black flex items-center justify-center">
                                                {initialsOf(user as any, user?.email || '')}
                                            </span>
                                        )}
                                    </button>

                                    {menuPerfilAbierto && (
                                        <div
                                            role="menu"
                                            className="absolute right-0 top-full mt-2 w-64 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden z-[120]"
                                        >
                                            <div className="px-4 py-3 border-b border-gray-50">
                                                <p className="text-sm font-bold text-gray-900 truncate">
                                                    {displayNameOf(user as any, user?.email || '')}
                                                </p>
                                                {/* El correo es un DATO, no lenguaje: no se traduce (v4.662). */}
                                                <p className="text-[11px] text-gray-500 truncate" data-no-translate>{user?.email}</p>
                                                {(user as any)?.position && (
                                                    <p className="text-[11px] text-gray-400 truncate mt-0.5">{(user as any).position}</p>
                                                )}
                                                {acceso.grant?.roleLabel && (
                                                    <p className="text-[10px] font-black uppercase tracking-wider text-rotary-blue mt-1.5">
                                                        {acceso.grant.roleLabel}
                                                    </p>
                                                )}
                                            </div>
                                            <div className="py-1">
                                                <button
                                                    role="menuitem"
                                                    onClick={() => { setMenuPerfilAbierto(false); navigate('/admin/perfil'); }}
                                                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-all text-left"
                                                >
                                                    <UserPlus className="w-4 h-4 text-gray-400" />
                                                    Mi perfil
                                                </button>
                                                {/* Lleva a la MISMA pantalla, a su sección de contraseña:
                                                    duplicarla sería un segundo sitio donde cambiarla. */}
                                                <button
                                                    role="menuitem"
                                                    onClick={() => { setMenuPerfilAbierto(false); navigate('/admin/perfil?cambiar=1'); }}
                                                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-all text-left"
                                                >
                                                    <Lock className="w-4 h-4 text-gray-400" />
                                                    Cambiar contraseña
                                                </button>
                                            </div>
                                            <div className="py-1 border-t border-gray-50">
                                                <button
                                                    role="menuitem"
                                                    onClick={() => { setMenuPerfilAbierto(false); handleLogout(); }}
                                                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-500 hover:bg-red-50 hover:text-red-600 transition-all text-left"
                                                >
                                                    <LogOut className="w-4 h-4 text-gray-400" />
                                                    Cerrar sesión
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
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
