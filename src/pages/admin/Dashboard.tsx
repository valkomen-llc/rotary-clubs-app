import React, { useState, useEffect } from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import { Link, useNavigate } from 'react-router-dom';
import {
    ExternalLink, Newspaper, FolderKanban, CalendarDays, Image,
    Globe, Lock, Rocket, CheckCircle2, ChevronRight,
    Sparkles, Users, BarChart3, Settings, ArrowRight,
    ShoppingBag, FileText, Shield,
} from 'lucide-react';
import MissionControl from '../../components/admin/MissionControl';
import AgentProgressBar from '../../components/admin/AgentProgressBar';
import AgentActivityDashboard from '../../components/admin/AgentActivityDashboard';
import OnboardingWizard from '../../components/admin/OnboardingWizard';
import { useAuth } from '../../hooks/useAuth';
import { useSetupProgress } from '../../hooks/useSetupProgress';

const API = import.meta.env.VITE_API_URL || '/api';

// ── Setup checklist items ──────────────────────────────────────────────
interface CheckItem {
    id: string; label: string; desc: string;
    done: boolean; href: string;
    category: 'identity' | 'content' | 'integrations';
    weight: number; icon: React.ReactNode;
}

const CATEGORY_META = {
    identity: { label: 'Identidad del Club', color: 'text-blue-700 bg-blue-50 border-blue-100', ring: '#3b82f6' },
    content: { label: 'Contenido del Sitio', color: 'text-violet-700 bg-violet-50 border-violet-100', ring: '#8b5cf6' },
    integrations: { label: 'Integraciones', color: 'text-emerald-700 bg-emerald-50 border-emerald-100', ring: '#10b981' },
};

// ── Quick action cards ────────────────────────────────────────────────
const QUICK_ACTIONS = [
    { label: 'Crear Noticia', icon: <Newspaper className="w-5 h-5" />, href: '/admin/noticias', color: 'from-blue-500 to-blue-600' },
    { label: 'Nuevo Proyecto', icon: <FolderKanban className="w-5 h-5" />, href: '/admin/proyectos', color: 'from-violet-500 to-violet-600' },
    { label: 'Nuevo Evento', icon: <CalendarDays className="w-5 h-5" />, href: '/admin/eventos', color: 'from-amber-500 to-amber-600' },
    { label: 'Subir Imágenes', icon: <Image className="w-5 h-5" />, href: '/admin/media', color: 'from-emerald-500 to-emerald-600' },
];

// ══════════════════════════════════════════════════════════════════════════
// ── Club Admin Dashboard ─────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════
const ClubAdminDashboard: React.FC = () => {
    const navigate = useNavigate();
    const { token } = useAuth();
    const [stats, setStats] = useState<any>(null);
    const [gaConfigured, setGaConfigured] = useState(false);
    const [showWizard, setShowWizard] = useState(false);
    const [publishing, setPublishing] = useState(false);

    const club = (() => {
        try { return JSON.parse(localStorage.getItem('rotary_club') || '{}'); }
        catch { return {}; }
    })();

    useEffect(() => {
        const headers = { Authorization: `Bearer ${token}` };
        fetch(`${API}/admin/stats`, { headers }).then(r => r.json()).then(setStats).catch(() => {});
        fetch(`${API}/translate/analytics`).then(r => r.json())
            .then(d => setGaConfigured(!!(d?.gaId && d.gaId.startsWith('G-')))).catch(() => {});
    }, [token]);

    // ── Build checklist ──
    const items: CheckItem[] = [
        {
            id: 'club-info', label: 'Información del club',
            desc: 'Logo, descripción, contacto, colores y redes sociales',
            done: !!(club?.logo && club?.description && club.description.length > 20),
            href: '/admin/mi-club', category: 'identity', weight: 15,
            icon: <Settings className="w-4 h-4" />,
        },
        {
            id: 'hero', label: 'Imágenes principales',
            desc: 'Configura las imágenes del hero y secciones del sitio',
            done: false, // will need to check from settings
            href: '/admin/imagenes-sitio', category: 'identity', weight: 10,
            icon: <Image className="w-4 h-4" />,
        },
        {
            id: 'project', label: 'Primer proyecto',
            desc: 'Documenta al menos un proyecto activo del club',
            done: (stats?.projects || 0) > 0,
            href: '/admin/proyectos', category: 'content', weight: 15,
            icon: <FolderKanban className="w-4 h-4" />,
        },
        {
            id: 'news', label: 'Primera noticia',
            desc: 'Publica una noticia o artículo sobre el club',
            done: (stats?.posts || 0) > 0,
            href: '/admin/noticias', category: 'content', weight: 15,
            icon: <Newspaper className="w-4 h-4" />,
        },
        {
            id: 'members', label: 'Directorio de socios',
            desc: 'Agrega al menos un socio al directorio',
            done: (stats?.users || 0) > 1,
            href: '/admin/usuarios', category: 'content', weight: 15,
            icon: <Users className="w-4 h-4" />,
        },
        {
            id: 'media', label: 'Galería multimedia',
            desc: 'Sube fotos o videos del club',
            done: (stats?.media || 0) > 0,
            href: '/admin/media', category: 'content', weight: 10,
            icon: <Image className="w-4 h-4" />,
        },
        {
            id: 'faqs', label: 'Preguntas frecuentes',
            desc: 'Agrega preguntas frecuentes para los visitantes',
            done: false,
            href: '/admin/faqs', category: 'content', weight: 10,
            icon: <BarChart3 className="w-4 h-4" />,
        },
        {
            id: 'ga4', label: 'Google Analytics',
            desc: 'Conecta GA4 para medir el tráfico de tu sitio',
            done: gaConfigured,
            href: '/admin/integraciones', category: 'integrations', weight: 10,
            icon: <BarChart3 className="w-4 h-4" />,
        },
    ];

    const totalWeight = items.reduce((a, b) => a + b.weight, 0);
    const doneWeight = items.filter(i => i.done).reduce((a, b) => a + b.weight, 0);
    const pct = Math.round((doneWeight / totalWeight) * 100);
    const remaining = items.filter(i => !i.done).length;
    const isComplete = pct >= 100;

    const siteStatus = club?.status === 'active' ? 'live' : 'draft';
    const canPublish = isComplete && siteStatus === 'draft';

    // ── Publish site handler ──
    const handlePublish = async () => {
        if (!canPublish || !club?.id) return;
        setPublishing(true);
        try {
            await fetch(`${API}/admin/clubs/${club.id}/publish`, {
                method: 'PATCH',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            });
            window.location.reload();
        } catch { /* ignore */ }
        setPublishing(false);
    };

    const categories = ['identity', 'content', 'integrations'] as const;

    // SVG circular progress ring
    const ringSize = 120;
    const strokeWidth = 8;
    const radius = (ringSize - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const dashOffset = circumference - (pct / 100) * circumference;
    const ringColor = pct >= 100 ? '#10b981' : pct >= 60 ? '#f59e0b' : '#3b82f6';

    return (
        <>
            {showWizard && <OnboardingWizard onDismiss={() => setShowWizard(false)} />}

            {/* ── Welcome Header ── */}
            <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-6 mb-6">
                <div className="flex items-center gap-6 flex-wrap">
                    {/* Progress Ring */}
                    <div className="relative flex-shrink-0">
                        <svg width={ringSize} height={ringSize} className="-rotate-90">
                            <circle cx={ringSize / 2} cy={ringSize / 2} r={radius} fill="none" stroke="#f3f4f6" strokeWidth={strokeWidth} />
                            <circle cx={ringSize / 2} cy={ringSize / 2} r={radius} fill="none"
                                stroke={ringColor} strokeWidth={strokeWidth} strokeLinecap="round"
                                strokeDasharray={circumference} strokeDashoffset={dashOffset}
                                style={{ transition: 'stroke-dashoffset 1s ease-out' }}
                            />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <span className="text-2xl font-black text-gray-900">{pct}%</span>
                            <span className="text-[8px] font-bold text-gray-400 uppercase tracking-wider">Completado</span>
                        </div>
                    </div>

                    {/* Club Info */}
                    <div className="flex-1 min-w-0">
                        <h1 className="text-2xl font-black text-gray-900 tracking-tight">
                            ¡Bienvenido! 👋
                        </h1>
                        <p className="text-sm text-gray-500 font-medium mt-1">
                            <span className="font-bold text-gray-700">{club?.name || 'Tu Club'}</span>
                            {club?.domain && <span className="text-gray-400"> · {club.domain}</span>}
                        </p>
                        {isComplete ? (
                            <p className="text-sm text-emerald-600 font-bold mt-2 flex items-center gap-1.5">
                                <CheckCircle2 className="w-4 h-4" />
                                Configuración completa — tu sitio está listo para producción
                            </p>
                        ) : (
                            <p className="text-sm text-gray-400 mt-2">
                                Completa {remaining} {remaining === 1 ? 'paso más' : 'pasos más'} para publicar tu sitio web con dominio .org
                            </p>
                        )}
                    </div>

                    {/* Status Badge + Action */}
                    <div className="flex flex-col items-end gap-2 flex-shrink-0">
                        {siteStatus === 'live' ? (
                            <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 px-4 py-2 rounded-xl">
                                <Globe className="w-4 h-4 text-emerald-600" />
                                <div>
                                    <p className="text-[10px] font-black text-emerald-700 uppercase tracking-wider">En producción</p>
                                    <p className="text-[11px] text-emerald-600 font-medium">{club?.domain || 'sitio activo'}</p>
                                </div>
                            </div>
                        ) : canPublish ? (
                            <button
                                onClick={handlePublish}
                                disabled={publishing}
                                className="flex items-center gap-2 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white px-5 py-3 rounded-xl font-bold text-sm hover:from-emerald-600 hover:to-emerald-700 transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50"
                            >
                                <Rocket className="w-4 h-4" />
                                {publishing ? 'Publicando...' : 'Publicar sitio web'}
                            </button>
                        ) : (
                            <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 px-4 py-2 rounded-xl">
                                <Lock className="w-4 h-4 text-gray-400" />
                                <div>
                                    <p className="text-[10px] font-black text-gray-500 uppercase tracking-wider">Borrador</p>
                                    <p className="text-[11px] text-gray-400 font-medium">Completa al 100% para publicar</p>
                                </div>
                            </div>
                        )}
                        <Link
                            to="/" target="_blank"
                            className="text-[11px] font-bold text-gray-400 hover:text-gray-600 flex items-center gap-1 transition-colors"
                        >
                            Vista previa <ExternalLink className="w-3 h-3" />
                        </Link>
                    </div>
                </div>
            </div>

            {/* ── Site Setup Checklist ── */}
            <div className="bg-white border border-gray-100 rounded-2xl shadow-sm mb-6 overflow-hidden">
                <div className="px-6 py-5 border-b border-gray-50">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center">
                                <Sparkles className="w-4 h-4 text-blue-600" />
                            </div>
                            <div>
                                <h2 className="font-black text-gray-900 text-sm">Configuración del sitio web</h2>
                                <p className="text-[11px] text-gray-400 mt-0.5">
                                    {isComplete ? '¡Todo listo! Tu sitio está completo.' : `${remaining} pasos pendientes para publicar`}
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={() => setShowWizard(true)}
                            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-blue-700 transition-all shadow-sm"
                        >
                            <Sparkles className="w-3.5 h-3.5" />
                            Configurar con IA
                        </button>
                    </div>

                    {/* Progress bar */}
                    <div className="mt-4">
                        <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden">
                            <div
                                className="h-full rounded-full transition-all duration-1000 ease-out"
                                style={{
                                    width: `${pct}%`,
                                    background: pct >= 100
                                        ? 'linear-gradient(90deg, #10b981, #059669)'
                                        : pct >= 60
                                            ? 'linear-gradient(90deg, #f59e0b, #d97706)'
                                            : 'linear-gradient(90deg, #3b82f6, #2563eb)',
                                }}
                            />
                        </div>
                    </div>
                </div>

                {/* Checklist by category */}
                <div className="px-6 py-5 space-y-6">
                    {categories.map(catKey => {
                        const meta = CATEGORY_META[catKey];
                        const catItems = items.filter(i => i.category === catKey);
                        const catDone = catItems.filter(i => i.done).length;
                        return (
                            <div key={catKey}>
                                <div className="flex items-center justify-between mb-3">
                                    <span className={`text-[10px] font-black px-2.5 py-1 rounded-full border ${meta.color}`}>
                                        {meta.label}
                                    </span>
                                    <span className="text-[10px] font-bold text-gray-400">{catDone}/{catItems.length}</span>
                                </div>
                                <div className="space-y-2">
                                    {catItems.map(item => (
                                        <div
                                            key={item.id}
                                            onClick={() => navigate(item.href)}
                                            className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all group ${item.done
                                                ? 'border-emerald-100 bg-emerald-50/30'
                                                : 'border-gray-100 bg-gray-50/30 hover:bg-white hover:border-gray-200 hover:shadow-sm'
                                                }`}
                                        >
                                            <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${item.done ? 'bg-emerald-100 text-emerald-600' : 'bg-gray-100 text-gray-400 group-hover:bg-blue-50 group-hover:text-blue-500'}`}>
                                                {item.icon}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className={`text-sm font-bold ${item.done ? 'text-emerald-700 line-through decoration-emerald-300' : 'text-gray-700'}`}>
                                                    {item.label}
                                                </p>
                                                {!item.done && (
                                                    <p className="text-[11px] text-gray-400 truncate">{item.desc}</p>
                                                )}
                                            </div>
                                            {item.done
                                                ? <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                                                : <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-blue-400 flex-shrink-0" />
                                            }
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* ── Quick Actions ── */}
            <div className="mb-6">
                <h3 className="text-xs font-black text-gray-400 uppercase tracking-wider mb-3 px-1">⚡ Acciones rápidas</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {QUICK_ACTIONS.map(action => (
                        <button
                            key={action.label}
                            onClick={() => navigate(action.href)}
                            className="group bg-white border border-gray-100 rounded-xl p-4 hover:shadow-md hover:border-gray-200 transition-all text-left"
                        >
                            <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${action.color} flex items-center justify-center text-white mb-3 group-hover:scale-110 transition-transform`}>
                                {action.icon}
                            </div>
                            <p className="text-sm font-bold text-gray-700 group-hover:text-gray-900">{action.label}</p>
                            <div className="flex items-center gap-1 mt-1">
                                <span className="text-[10px] font-bold text-gray-400 group-hover:text-blue-500 transition-colors">Ir</span>
                                <ArrowRight className="w-3 h-3 text-gray-300 group-hover:text-blue-400 group-hover:translate-x-0.5 transition-all" />
                            </div>
                        </button>
                    ))}
                </div>
            </div>

            {/* ── Completa tu plataforma: Module Cards ── */}
            {(() => {
                const modules = club?.modules || {};
                const MODULE_DEFS = [
                    { key: 'projects', enabled: modules.projects !== false, label: 'Proyectos y Causas', icon: <FolderKanban className="w-5 h-5" />, href: '/admin/proyectos', color: 'from-violet-500 to-violet-600', bg: 'bg-violet-50', text: 'text-violet-600',
                      calc: () => {
                        let p = 0; if ((stats?.projects || 0) > 0) p += 50; if ((stats?.projects || 0) >= 3) p += 50; return p;
                      },
                      tip: 'Crea al menos 3 proyectos para completar' },
                    { key: 'events', enabled: modules.events !== false, label: 'Eventos y Calendario', icon: <CalendarDays className="w-5 h-5" />, href: '/admin/calendario', color: 'from-amber-500 to-amber-600', bg: 'bg-amber-50', text: 'text-amber-600',
                      calc: () => 0,
                      tip: 'Crea tu primer evento' },
                    { key: 'rotaract', enabled: !!modules.rotaract, label: 'Club Rotaract', icon: <Shield className="w-5 h-5" />, href: '/admin/configuracion', color: 'from-pink-500 to-pink-600', bg: 'bg-pink-50', text: 'text-pink-600',
                      calc: () => 0,
                      tip: 'Configura la información de Rotaract' },
                    { key: 'interact', enabled: !!modules.interact, label: 'Club Interact', icon: <Users className="w-5 h-5" />, href: '/admin/configuracion', color: 'from-sky-500 to-sky-600', bg: 'bg-sky-50', text: 'text-sky-600',
                      calc: () => 0,
                      tip: 'Configura la información de Interact' },
                    { key: 'ecommerce', enabled: !!modules.ecommerce, label: 'Tienda Virtual', icon: <ShoppingBag className="w-5 h-5" />, href: '/admin/tienda', color: 'from-emerald-500 to-emerald-600', bg: 'bg-emerald-50', text: 'text-emerald-600',
                      calc: () => {
                        let p = 0; if ((stats?.products || 0) > 0) p += 50; if ((stats?.products || 0) >= 3) p += 50; return p;
                      },
                      tip: 'Agrega productos a tu tienda' },
                    { key: 'dian', enabled: !!modules.dian, label: 'Estados Financieros (DIAN)', icon: <FileText className="w-5 h-5" />, href: '/admin/configuracion', color: 'from-gray-500 to-gray-600', bg: 'bg-gray-100', text: 'text-gray-600',
                      calc: () => 0,
                      tip: 'Sube los estados financieros' },
                    { key: 'gallery', enabled: true, label: 'Galería Multimedia', icon: <Image className="w-5 h-5" />, href: '/admin/media', color: 'from-teal-500 to-teal-600', bg: 'bg-teal-50', text: 'text-teal-600',
                      calc: () => {
                        let p = 0; if ((stats?.media || 0) > 0) p += 50; if ((stats?.media || 0) >= 5) p += 50; return p;
                      },
                      tip: 'Sube fotos y videos del club' },
                ];

                const activeModules = MODULE_DEFS.filter(m => m.enabled);
                if (activeModules.length === 0) return null;

                const totalPct = Math.round(activeModules.reduce((a, m) => a + m.calc(), 0) / activeModules.length);

                return (
                    <div className="bg-white border border-gray-100 rounded-2xl shadow-sm mb-6 overflow-hidden">
                        <div className="px-6 py-5 border-b border-gray-50">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                                        <Rocket className="w-4 h-4 text-white" />
                                    </div>
                                    <div>
                                        <h2 className="font-black text-gray-900 text-sm">🚀 Completa tu plataforma</h2>
                                        <p className="text-[11px] text-gray-400 mt-0.5">
                                            Configura los módulos que activaste · Progreso general: <span className="font-bold text-gray-600">{totalPct}%</span>
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="p-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                            {activeModules.map(mod => {
                                const pctVal = mod.calc();
                                const ringSize = 44;
                                const sw = 4;
                                const r = (ringSize - sw) / 2;
                                const circ = 2 * Math.PI * r;
                                const offset = circ - (pctVal / 100) * circ;
                                const ringCol = pctVal >= 100 ? '#10b981' : pctVal >= 50 ? '#f59e0b' : '#6366f1';
                                return (
                                    <div
                                        key={mod.key}
                                        onClick={() => navigate(mod.href)}
                                        className="bg-gray-50/60 hover:bg-white border border-gray-100 hover:border-gray-200 rounded-2xl p-4 cursor-pointer hover:shadow-md transition-all group"
                                    >
                                        <div className="flex items-start justify-between mb-3">
                                            <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${mod.color} flex items-center justify-center text-white group-hover:scale-110 transition-transform`}>
                                                {mod.icon}
                                            </div>
                                            <div className="relative flex-shrink-0">
                                                <svg width={ringSize} height={ringSize} className="-rotate-90">
                                                    <circle cx={ringSize/2} cy={ringSize/2} r={r} fill="none" stroke="#f3f4f6" strokeWidth={sw} />
                                                    <circle cx={ringSize/2} cy={ringSize/2} r={r} fill="none" stroke={ringCol} strokeWidth={sw} strokeLinecap="round"
                                                        strokeDasharray={circ} strokeDashoffset={offset}
                                                        style={{ transition: 'stroke-dashoffset .8s ease-out' }} />
                                                </svg>
                                                <div className="absolute inset-0 flex items-center justify-center">
                                                    <span className="text-[10px] font-black text-gray-700">{pctVal}%</span>
                                                </div>
                                            </div>
                                        </div>
                                        <p className="text-xs font-bold text-gray-800 mb-0.5">{mod.label}</p>
                                        <p className="text-[10px] text-gray-400 leading-tight">{mod.tip}</p>
                                        <div className="flex items-center gap-1 mt-2">
                                            <span className="text-[10px] font-bold text-gray-400 group-hover:text-indigo-500 transition-colors">Configurar</span>
                                            <ArrowRight className="w-3 h-3 text-gray-300 group-hover:text-indigo-400 group-hover:translate-x-0.5 transition-all" />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                );
            })()}

            {/* ── Stats Summary ── */}
            {stats && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                        { label: 'Noticias', value: stats.posts || 0, icon: <Newspaper className="w-4 h-4" />, color: 'text-blue-600 bg-blue-50' },
                        { label: 'Proyectos', value: stats.projects || 0, icon: <FolderKanban className="w-4 h-4" />, color: 'text-violet-600 bg-violet-50' },
                        { label: 'Socios', value: stats.users || 0, icon: <Users className="w-4 h-4" />, color: 'text-amber-600 bg-amber-50' },
                        { label: 'Media', value: stats.media || 0, icon: <Image className="w-4 h-4" />, color: 'text-emerald-600 bg-emerald-50' },
                    ].map(s => (
                        <div key={s.label} className="bg-white border border-gray-100 rounded-xl p-4 flex items-center gap-3">
                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${s.color}`}>{s.icon}</div>
                            <div>
                                <p className="text-xl font-black text-gray-900">{s.value}</p>
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{s.label}</p>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </>
    );
};

// ══════════════════════════════════════════════════════════════════════════
// ── Main Dashboard Page ──────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════
const Dashboard: React.FC = () => {
    const { user } = useAuth();
    const isSuperAdmin = user?.role === 'administrator';

    return (
        <AdminLayout>
            {isSuperAdmin ? (
                <>
                    {/* Super Admin: Agent Progress + Mission Control */}
                    <div className="flex justify-between items-center mb-8 gap-4">
                        <AgentProgressBar />
                        <div className="flex items-center gap-3 flex-shrink-0">
                            <Link to="/" target="_blank" className="bg-white border border-gray-200 px-4 py-2 rounded-xl text-sm font-bold text-gray-700 flex items-center gap-2 hover:bg-gray-50 transition-all shadow-sm">
                                View site <ExternalLink className="w-4 h-4" />
                            </Link>
                        </div>
                    </div>
                    <MissionControl />
                    <div className="mt-8">
                        <AgentActivityDashboard />
                    </div>
                </>
            ) : (
                /* Club Admin: Configuration-focused dashboard */
                <ClubAdminDashboard />
            )}
        </AdminLayout>
    );
};

export default Dashboard;
