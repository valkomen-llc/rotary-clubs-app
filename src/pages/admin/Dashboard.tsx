import React, { useState, useEffect } from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import { Link, useNavigate } from 'react-router-dom';
import {
    ExternalLink, Newspaper, FolderKanban, CalendarDays, Image,
    Lock, Rocket, CheckCircle2, ChevronRight,
    Sparkles, Users, BarChart3, Settings,
} from 'lucide-react';
import MissionControl from '../../components/admin/MissionControl';
import AgentProgressBar from '../../components/admin/AgentProgressBar';
import AgentActivityDashboard from '../../components/admin/AgentActivityDashboard';
import { useAuth } from '../../hooks/useAuth';
import { useSetupProgress } from '../../hooks/useSetupProgress';
import { Terminal } from 'lucide-react';

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



// ══════════════════════════════════════════════════════════════════════════
// ── Club Admin Dashboard ─────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════
const ClubAdminDashboard: React.FC = () => {
    const navigate = useNavigate();
    const { token } = useAuth();
    const [stats, setStats] = useState<any>(null);
    const [gaConfigured, setGaConfigured] = useState(false);

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

    const modules = club?.modules || {};

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
            done: false,
            href: '/admin/imagenes-sitio', category: 'identity', weight: 10,
            icon: <Image className="w-4 h-4" />,
        },
        // Conditional modules based on onboarding step 5 selections
        ...(modules.projects !== false ? [{
            id: 'project', label: 'Primer proyecto',
            desc: 'Documenta al menos un proyecto activo del club',
            done: (stats?.projects || 0) > 0,
            href: '/admin/proyectos', category: 'content' as const, weight: 15,
            icon: <FolderKanban className="w-4 h-4" />,
        }] : []),
        {
            id: 'news', label: 'Primera noticia',
            desc: 'Publica una noticia o artículo sobre el club',
            done: (stats?.posts || 0) > 0,
            href: '/admin/noticias', category: 'content', weight: 15,
            icon: <Newspaper className="w-4 h-4" />,
        },
        ...(modules.events !== false ? [{
            id: 'events', label: 'Primer evento',
            desc: 'Crea tu primer evento en el calendario',
            done: (club?.eventsCount || 0) > 0,
            href: '/admin/calendario', category: 'content' as const, weight: 10,
            icon: <CalendarDays className="w-4 h-4" />,
        }] : []),
        {
            id: 'members', label: 'Directorio de socios',
            desc: 'Agrega al menos un socio al directorio',
            done: (stats?.users || 0) > 1,
            href: '/admin/miembros', category: 'content', weight: 15,
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
                        {canPublish ? (
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
                            to={`/preview/${club?.subdomain || ''}`} target="_blank"
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
                        <Link
                            to="/admin/configuracion-sitio"
                            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-blue-700 transition-all shadow-sm"
                        >
                            <Sparkles className="w-3.5 h-3.5" />
                            Configurar Sitio
                        </Link>
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
                    
                    {/* Mission Control Launchpad */}
                    <div className="bg-[#0A0F1C] rounded-2xl p-8 mb-8 border border-gray-800 shadow-2xl relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-64 h-64 bg-[#00A2E0]/10 rounded-full blur-[60px] pointer-events-none group-hover:bg-[#00A2E0]/20 transition-all duration-700" />
                        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                            <div>
                                <h3 className="text-xl font-black text-white flex items-center gap-3 tracking-tight">
                                    <Terminal className="w-6 h-6 text-[#00A2E0]" />
                                    Gateway Control Plane
                                </h3>
                                <p className="text-sm text-gray-400 mt-2 max-w-lg">
                                    Accede al centro de comando inmersivo para orquestar a los agentes de IA, monitorear operaciones en vivo y revisar logs de red neuronal.
                                </p>
                            </div>
                            <Link to="/admin/agentes" className="bg-[#00A2E0]/10 hover:bg-[#00A2E0]/20 border border-[#00A2E0]/30 text-[#00A2E0] px-6 py-3 rounded-xl font-bold transition-all whitespace-nowrap hidden md:block shadow-[0_0_20px_rgba(0,162,224,0.1)] hover:shadow-[0_0_30px_rgba(0,162,224,0.2)]">
                                Enter System [⌘+K]
                            </Link>
                        </div>
                    </div>

                    <div>
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
