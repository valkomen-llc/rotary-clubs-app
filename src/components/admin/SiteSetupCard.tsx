import React, { useEffect, useState } from 'react';
import {
    CheckCircle2, Circle, ChevronRight, Sparkles, X, Bot,
} from 'lucide-react';

const API = import.meta.env.VITE_API_URL || '/api';

interface CheckItem {
    id: string;
    label: string;
    desc: string;
    done: boolean;
    href: string;
    category: 'Identidad' | 'Contenido' | 'Integraciones';
    weight: number; // contribution to % (out of 100)
}

interface Props {
    stats: any; // from /api/admin/stats
    onOpenWizard: () => void;
}

const SiteSetupCard: React.FC<Props> = ({ stats, onOpenWizard }) => {
    const [dismissed, setDismissed] = useState(false);
    const [gaConfigured, setGaConfigured] = useState(false);
    const [expanded, setExpanded] = useState(true);

    // Read club from localStorage (same pattern as Dashboard, avoids hook issues)
    const club = (() => {
        try { return JSON.parse(localStorage.getItem('rotary_club') || '{}'); }
        catch { return {}; }
    })();

    // Check GA4 Measurement ID configured
    useEffect(() => {
        fetch(`${API}/translate/analytics`)
            .then(r => r.json())
            .then(d => setGaConfigured(!!(d?.gaId && d.gaId.startsWith('G-'))))
            .catch(() => setGaConfigured(false));
    }, []);

    if (dismissed) return null;

    const ITEMS: CheckItem[] = [
        {
            id: 'logo',
            label: 'Logo del club',
            desc: 'Sube el logo oficial PNG con fondo transparente',
            done: !!(club?.logo),
            href: '/admin/mi-club',
            category: 'Identidad',
            weight: 12,
        },
        {
            id: 'colors',
            label: 'Colores personalizados',
            desc: 'Define los colores institucionales del club',
            done: !!(club?.colors?.primary && club?.colors?.primary !== '#013388'),
            href: '/admin/mi-club',
            category: 'Identidad',
            weight: 8,
        },
        {
            id: 'description',
            label: 'Descripción del club',
            desc: 'Escribe una descripción corta de la misión del club',
            done: !!(club?.description && club.description.length > 20),
            href: '/admin/mi-club',
            category: 'Identidad',
            weight: 10,
        },
        {
            id: 'contact',
            label: 'Información de contacto',
            desc: 'Añade email, teléfono y dirección',
            done: !!(club?.contact?.email || stats?.clubCity),
            href: '/admin/mi-club',
            category: 'Identidad',
            weight: 10,
        },
        {
            id: 'social',
            label: 'Redes sociales',
            desc: 'Conecta al menos una red social del club',
            done: !!(Array.isArray(club?.social) && club.social.some((s: any) => s.url)),
            href: '/admin/mi-club',
            category: 'Identidad',
            weight: 8,
        },
        {
            id: 'project',
            label: 'Primer proyecto',
            desc: 'Documenta al menos un proyecto activo del club',
            done: (stats?.projects || 0) > 0,
            href: '/admin/proyectos',
            category: 'Contenido',
            weight: 12,
        },
        {
            id: 'news',
            label: 'Primera noticia',
            desc: 'Publica una noticia o artículo sobre el club',
            done: (stats?.posts || 0) > 0,
            href: '/admin/noticias',
            category: 'Contenido',
            weight: 10,
        },
        {
            id: 'members',
            label: 'Directorio de socios',
            desc: 'Agrega al menos un socio al directorio',
            done: (stats?.users || 0) > 1, // > 1 because admin itself is a user
            href: '/admin/usuarios',
            category: 'Contenido',
            weight: 10,
        },
        {
            id: 'media',
            label: 'Galería multimedia',
            desc: 'Sube fotos o videos del club',
            done: (stats?.media || 0) > 0,
            href: '/admin/media',
            category: 'Contenido',
            weight: 8,
        },
        {
            id: 'ga4',
            label: 'Google Analytics 4',
            desc: 'Conecta GA4 para medir el tráfico de tu sitio',
            done: gaConfigured,
            href: '/admin/integraciones',
            category: 'Integraciones',
            weight: 12,
        },
    ];

    const totalWeight = ITEMS.reduce((a, b) => a + b.weight, 0);
    const doneWeight = ITEMS.filter(i => i.done).reduce((a, b) => a + b.weight, 0);
    const pct = Math.round((doneWeight / totalWeight) * 100);
    const remaining = ITEMS.filter(i => !i.done).length;

    const categories = ['Identidad', 'Contenido', 'Integraciones'] as const;
    const catColor: Record<string, string> = {
        'Identidad': 'text-rotary-blue bg-rotary-blue/10',
        'Contenido': 'text-violet-600 bg-violet-50',
        'Integraciones': 'text-emerald-600 bg-emerald-50',
    };

    // If 100% done, show a celebration card
    if (pct === 100) {
        return (
            <div className="bg-gradient-to-r from-emerald-50 to-green-50 border border-emerald-100 rounded-2xl p-6 mb-8 flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500 flex items-center justify-center flex-shrink-0">
                    <CheckCircle2 className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1">
                    <p className="font-black text-emerald-800">¡Sitio web 100% configurado!</p>
                    <p className="text-sm text-emerald-600">El sitio de {club?.name || 'tu club'} está completamente configurado. Sigue publicando contenido.</p>
                </div>
                <button onClick={() => setDismissed(true)} className="text-emerald-400 hover:text-emerald-600">
                    <X className="w-5 h-5" />
                </button>
            </div>
        );
    }
    return (
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm mb-8 overflow-hidden">
            {/* Header */}
            <div
                className="flex items-center justify-between px-6 py-5 cursor-pointer hover:bg-gray-50/50 transition-colors"
                onClick={() => setExpanded(e => !e)}
            >
                <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-rotary-blue/10 flex items-center justify-center flex-shrink-0">
                        <Sparkles className="w-5 h-5 text-rotary-blue" />
                    </div>
                    <div>
                        <div className="flex items-center gap-3">
                            <h3 className="font-black text-gray-900 text-sm">Configuración del sitio web</h3>
                            <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${pct >= 80 ? 'bg-emerald-50 text-emerald-700' : pct >= 50 ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-600'}`}>
                                {pct}% completado
                            </span>
                        </div>
                        <p className="text-[11px] text-gray-400 font-medium mt-0.5">
                            {remaining} {remaining === 1 ? 'paso pendiente' : 'pasos pendientes'} para tener tu sitio 100% listo
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={e => { e.stopPropagation(); setDismissed(true); }}
                        className="p-1.5 text-gray-300 hover:text-gray-500 rounded-lg hover:bg-gray-100 transition-colors"
                    >
                        <X className="w-4 h-4" />
                    </button>
                    <ChevronRight className={`w-4 h-4 text-gray-400 transition-transform ${expanded ? 'rotate-90' : ''}`} />
                </div>
            </div>

            {/* Progress bar */}
            <div className="px-6 pb-4">
                <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                        className="h-full rounded-full transition-all duration-700 ease-out"
                        style={{
                            width: `${pct}%`,
                            background: pct >= 80
                                ? 'linear-gradient(90deg, #10b981, #059669)'
                                : pct >= 50
                                    ? 'linear-gradient(90deg, #f59e0b, #d97706)'
                                    : 'linear-gradient(90deg, #0c3c7c, #3b82f6)',
                        }}
                    />
                </div>
                <div className="flex justify-between mt-1.5">
                    <span className="text-[10px] text-gray-400">0%</span>
                    <span className="text-[10px] text-gray-400">100%</span>
                </div>
            </div>

            {/* Open wizard CTA */}
            <div className="px-6 pb-5">
                <button
                    onClick={onOpenWizard}
                    className="w-full flex items-center justify-center gap-2.5 bg-rotary-blue text-white px-5 py-3 rounded-xl font-bold text-sm hover:bg-rotary-blue/90 transition-all shadow-lg shadow-rotary-blue/20 group"
                >
                    <Bot className="w-4 h-4" />
                    Continuar configuración con asistente IA
                    <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </button>
            </div>

            {/* Checklist */}
            {expanded && (
                <div className="border-t border-gray-50 px-6 py-4 space-y-8">
                    {categories.map(cat => {
                        const catItems = ITEMS.filter(i => i.category === cat);
                        const catDone = catItems.filter(i => i.done).length;
                        return (
                            <div key={cat}>
                                <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-2">
                                        <span className={`text-[10px] font-black px-2.5 py-1 rounded-full ${catColor[cat]}`}>
                                            {cat}
                                        </span>
                                    </div>
                                    <span className="text-[10px] font-bold text-gray-400">
                                        {catDone}/{catItems.length}
                                    </span>
                                </div>
                                <div className="space-y-2">
                                    {catItems.map(item => (
                                        <div
                                            key={item.id}
                                            className={`flex items-center gap-3 p-3 rounded-xl border ${item.done
                                                ? 'border-emerald-100 bg-emerald-50/40'
                                                : 'border-gray-100 bg-gray-50/40'
                                                }`}
                                        >
                                            <div className="flex-shrink-0">
                                                {item.done
                                                    ? <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                                                    : <Circle className="w-5 h-5 text-gray-300" />
                                                }
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className={`text-sm font-bold truncate ${item.done ? 'text-emerald-700 line-through decoration-emerald-300' : 'text-gray-700'}`}>
                                                    {item.label}
                                                </p>
                                                {!item.done && (
                                                    <p className="text-[11px] text-gray-400 truncate">{item.desc}</p>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default SiteSetupCard;
