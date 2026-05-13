import React, { useState, useEffect } from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import { Link, useNavigate } from 'react-router-dom';
import {
    ExternalLink, Newspaper, FolderKanban, CalendarDays, Image,
    Lock, Rocket, CheckCircle2, ChevronRight,
    Sparkles, Users, BarChart3, Settings,
} from 'lucide-react';
import DashboardOverview from './DashboardOverview';
import { useAuth } from '../../hooks/useAuth';
import { useClub } from '../../contexts/ClubContext';

const API = import.meta.env.VITE_API_URL || '/api';

interface CheckItem {
    id: string; label: string; desc: string;
    done: boolean; href: string;
    category: 'identity' | 'content' | 'integrations';
    weight: number; icon: React.ReactNode;
}

const getCategoryMeta = (type?: string, name?: string) => {
    const isClub = type === 'club';
    const isRYE = name?.toLowerCase().includes('rye');
    
    return {
        identity: { 
            label: isClub ? 'Identidad del Club' : isRYE ? 'Identidad del Programa' : 'Identidad Institucional', 
            color: 'text-blue-700 bg-blue-50 border-blue-100', 
            ring: '#3b82f6' 
        },
        content: { 
            label: isRYE ? 'Contenido del Programa' : 'Contenido del Sitio', 
            color: 'text-violet-700 bg-violet-50 border-violet-100', 
            ring: '#8b5cf6' 
        },
        integrations: { label: 'Integraciones', color: 'text-emerald-700 bg-emerald-50 border-emerald-100', ring: '#10b981' },
    };
};

const ClubAdminDashboard: React.FC = () => {
    const navigate = useNavigate();
    const { token } = useAuth();
    const [stats, setStats] = useState<any>(null);
    const [gaConfigured, setGaConfigured] = useState(false);
    const [publishing, setPublishing] = useState(false);

    const { club } = useClub();

    useEffect(() => {
        const headers = { Authorization: `Bearer ${token}` };
        fetch(`${API}/admin/stats`, { headers }).then(r => r.json()).then(setStats).catch(() => {});
        fetch(`${API}/translate/analytics`).then(r => r.json())
            .then(d => setGaConfigured(!!(d?.gaId && d.gaId.startsWith('G-')))).catch(() => {});
    }, [token]);

    const modules = club?.modules || {};

    const items: CheckItem[] = [
        {
            id: 'club-info', label: club?.type === 'club' ? 'Información del club' : club?.name?.toLowerCase().includes('rye') ? 'Información del programa' : 'Información institucional',
            desc: club?.type === 'club' ? 'Logo, descripción, contacto, colores y redes sociales' : 'Logo, branding, contacto y redes de la organización',
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
        ...(modules.projects !== false ? [{
            id: 'project', label: 'Primer proyecto',
            desc: 'Documenta al menos un proyecto activo del club',
            done: (stats?.projects || 0) > 0,
            href: '/admin/proyectos', category: 'content' as const, weight: 15,
            icon: <FolderKanban className="w-4 h-4" />,
        }] : []),
        {
            id: 'news', label: club?.type === 'club' ? 'Primera noticia' : 'Primera publicación',
            desc: club?.type === 'club' ? 'Publica una noticia o artículo sobre el club' : 'Carga una noticia o boletín institucional',
            done: (stats?.posts || 0) > 0,
            href: '/admin/noticias', category: 'content', weight: 15,
            icon: <Newspaper className="w-4 h-4" />,
        },
        ...(modules.members !== false ? [{
            id: 'members', label: club?.type === 'club' ? 'Directorio de socios' : 'Directorio de líderes',
            desc: club?.type === 'club' ? 'Agrega al menos un socio al directorio' : 'Gestiona los representantes y directores',
            done: (stats?.users || 0) > 1,
            href: '/admin/miembros', category: 'content', weight: 15,
            icon: <Users className="w-4 h-4" />,
        }] : []),
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

    const ringSize = 120;
    const strokeWidth = 8;
    const radius = (ringSize - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const dashOffset = circumference - (pct / 100) * circumference;
    const ringColor = pct >= 100 ? '#10b981' : pct >= 60 ? '#f59e0b' : '#3b82f6';

    return (
        <>
            <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-6 mb-6">
                <div className="flex items-center gap-6 flex-wrap">
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

                    <div className="flex-1 min-w-0">
                        <h1 className="text-2xl font-black text-gray-900 tracking-tight">¡Bienvenido! 👋</h1>
                        <p className="text-sm text-gray-500 font-medium mt-1">
                            {club?.type === 'club' ? 'Club: ' : club?.name?.toLowerCase().includes('rye') ? 'Programa: ' : 'Organización: '} <span className="font-bold text-gray-700">{club?.name || 'Tu Institución'}</span>
                        </p>
                        {isComplete ? (
                            <p className="text-sm text-emerald-600 font-bold mt-2 flex items-center gap-1.5 underline">Sitio listo para publicar</p>
                        ) : (
                            <p className="text-sm text-gray-400 mt-2">Completa {remaining} pasos para publicar.</p>
                        )}
                    </div>

                    <div className="flex flex-col items-end gap-2 flex-shrink-0">
                        {canPublish ? (
                            <button onClick={handlePublish} className="bg-emerald-500 text-white px-5 py-3 rounded-xl font-bold text-sm shadow-lg">Publicar sitio</button>
                        ) : (
                            <div className="bg-gray-50 border border-gray-200 px-4 py-2 rounded-xl text-[10px] uppercase font-black text-gray-400">Borrador</div>
                        )}
                    </div>
                </div>
            </div>

            <div className="bg-white border border-gray-100 rounded-2xl shadow-sm mb-6 overflow-hidden p-6 space-y-6">
                {categories.map(catKey => {
                    const meta = getCategoryMeta(club?.type, club?.name)[catKey];
                    const catItems = items.filter(i => i.category === catKey);
                    return (
                        <div key={catKey}>
                            <span className={`text-[10px] font-black px-2.5 py-1 rounded-full border ${meta.color} mb-3 inline-block`}>{meta.label}</span>
                            <div className="space-y-2">
                                {catItems.map(item => (
                                    <div key={item.id} onClick={() => navigate(item.href)} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${item.done ? 'bg-emerald-50/50' : 'bg-gray-50/30'}`}>
                                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${item.done ? 'bg-emerald-100 text-emerald-600' : 'bg-gray-100 text-gray-400'}`}>{item.icon}</div>
                                        <div className="flex-1 text-sm font-bold">{item.label}</div>
                                        {item.done && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                                    </div>
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>
        </>
    );
};

const Dashboard: React.FC = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const { club, isProduction } = useClub();
    const isSuperAdmin = user?.role === 'administrator';
    const urlParams = new URLSearchParams(window.location.search);
    const isViewingWizard = urlParams.get('view') === 'wizard';

    useEffect(() => {
        if (user?.role === 'editor') {
            navigate('/admin/analytics', { replace: true });
        } else if (isProduction && !isSuperAdmin && !isViewingWizard) {
            navigate('/admin/analytics', { replace: true });
        }
    }, [user, navigate, isProduction, isSuperAdmin, isViewingWizard]);

    if (user?.role === 'editor') return null;
    if (isProduction && !isSuperAdmin && !isViewingWizard) return null;

    return (
        <AdminLayout>
            {isSuperAdmin ? <DashboardOverview /> : <ClubAdminDashboard />}
        </AdminLayout>
    );
};

export default Dashboard;
