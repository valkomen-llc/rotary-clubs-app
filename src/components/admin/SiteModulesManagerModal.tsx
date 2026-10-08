// ════════════════════════════════════════════════════════════════════════════
// Modal de Gestión Centralizada de Módulos por Sitio (Club Platform SaaS)
//
// Permite a los superadministradores activar/desactivar opciones y grupos
// de la barra lateral tanto a nivel general como de manera individual por club.
// ════════════════════════════════════════════════════════════════════════════

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    X,
    Sliders,
    Search,
    RotateCcw,
    Check,
    Building2,
    Globe,
    ShieldCheck,
    CheckCircle2,
    Layers,
    Wallet,
    LayoutDashboard,
    Settings,
    UserCog,
    PieChart,
    Video,
    UserPlus,
    Mail,
    CalendarClock,
    FolderKanban,
    Newspaper,
    Calendar,
    Users,
    Image as ImageIcon,
    Palette,
    HeartHandshake,
    Upload,
    Megaphone,
    HelpCircle,
    Store,
    Receipt,
    Award,
    Briefcase,
    FileText,
    Brain,
    Sparkles,
    Eye,
    EyeOff,
    CheckSquare,
    Square,
    Save,
    Info,
    ChevronDown,
    ChevronUp
} from 'lucide-react';
import { toast } from 'sonner';
import {
    SITE_MODULES_CATALOG,
    SITE_MODULE_GROUPS,
    DEFAULT_SITE_MODULES_CONFIG,
    ORIGEN_CLUB_ID,
    type SiteModuleItem,
    type SiteModulesMap
} from '../../lib/siteModulesSpec';

interface ClubOption {
    id: string;
    name: string;
    city?: string;
    domain?: string | null;
    subdomain?: string | null;
    type?: string;
    hasCustomOverride?: boolean;
    isOrigenException?: boolean;
}

interface SiteModulesManagerModalProps {
    isOpen?: boolean;
    onClose?: () => void;
    initialClubId?: string | null;
    onSaved?: () => void;
    inline?: boolean;
}

const getModuleIcon = (iconName: string) => {
    switch (iconName) {
        case 'Wallet': return <Wallet className="w-5 h-5 text-emerald-600" />;
        case 'LayoutDashboard': return <LayoutDashboard className="w-5 h-5 text-blue-600" />;
        case 'ShieldCheck': return <ShieldCheck className="w-5 h-5 text-sky-600" />;
        case 'Settings': return <Settings className="w-5 h-5 text-slate-600" />;
        case 'Globe': return <Globe className="w-5 h-5 text-indigo-600" />;
        case 'UserCog': return <UserCog className="w-5 h-5 text-violet-600" />;
        case 'PieChart': return <PieChart className="w-5 h-5 text-cyan-600" />;
        case 'Search': return <Search className="w-5 h-5 text-amber-600" />;
        case 'Brain': return <Brain className="w-5 h-5 text-pink-600" />;
        case 'Video': return <Video className="w-5 h-5 text-rose-600" />;
        case 'UserPlus': return <UserPlus className="w-5 h-5 text-blue-500" />;
        case 'Mail': return <Mail className="w-5 h-5 text-sky-500" />;
        case 'CalendarClock': return <CalendarClock className="w-5 h-5 text-emerald-500" />;
        case 'FolderKanban': return <FolderKanban className="w-5 h-5 text-amber-500" />;
        case 'Newspaper': return <Newspaper className="w-5 h-5 text-indigo-500" />;
        case 'Calendar': return <Calendar className="w-5 h-5 text-teal-600" />;
        case 'Users': return <Users className="w-5 h-5 text-violet-500" />;
        case 'ImageIcon': return <ImageIcon className="w-5 h-5 text-teal-500" />;
        case 'Palette': return <Palette className="w-5 h-5 text-purple-500" />;
        case 'HeartHandshake': return <HeartHandshake className="w-5 h-5 text-rose-500" />;
        case 'Upload': return <Upload className="w-5 h-5 text-slate-500" />;
        case 'Megaphone': return <Megaphone className="w-5 h-5 text-orange-500" />;
        case 'HelpCircle': return <HelpCircle className="w-5 h-5 text-gray-500" />;
        case 'Store': return <Store className="w-5 h-5 text-emerald-600" />;
        case 'Receipt': return <Receipt className="w-5 h-5 text-blue-600" />;
        case 'Award': return <Award className="w-5 h-5 text-amber-600" />;
        case 'Briefcase': return <Briefcase className="w-5 h-5 text-indigo-600" />;
        case 'FileText': return <FileText className="w-5 h-5 text-slate-600" />;
        default: return <Layers className="w-5 h-5 text-blue-600" />;
    }
};

const getTierBadge = (tier: string) => {
    switch (tier) {
        case 'basic':
            return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200 uppercase tracking-wider">Básico</span>;
        case 'pro':
            return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 uppercase tracking-wider">Pro</span>;
        case 'premium':
            return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 uppercase tracking-wider">Premium</span>;
        case 'enterprise':
            return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200 uppercase tracking-wider">Institucional</span>;
        default:
            return null;
    }
};

export const SiteModulesManagerModal: React.FC<SiteModulesManagerModalProps> = ({
    isOpen = false,
    onClose,
    initialClubId,
    onSaved,
    inline = false
}) => {
    const [selectedClubId, setSelectedClubId] = useState<string>(initialClubId || 'global');
    const [clubs, setClubs] = useState<ClubOption[]>([]);
    const [modulesConfig, setModulesConfig] = useState<SiteModulesMap>({ ...DEFAULT_SITE_MODULES_CONFIG });
    const [hasCustomOverride, setHasCustomOverride] = useState(false);
    const [loadingClubs, setLoadingClubs] = useState(false);
    const [loadingConfig, setLoadingConfig] = useState(false);
    const [saving, setSaving] = useState(false);
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const [clubSearch, setClubSearch] = useState('');
    const [selectedGroupFilter, setSelectedGroupFilter] = useState<string>('all');
    const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

    const token = localStorage.getItem('rotary_token');

    // 1. Cargar lista de clubes
    useEffect(() => {
        if (!isOpen && !inline) return;
        let isMounted = true;
        const fetchClubs = async () => {
            try {
                setLoadingClubs(true);
                const res = await fetch('/api/site-modules/all-clubs', {
                    headers: { Authorization: `Bearer ${token}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    if (isMounted && Array.isArray(data.clubs)) {
                        setClubs(data.clubs);
                    }
                }
            } catch (err) {
                console.error('[SiteModulesManager] Error cargando clubes:', err);
            } finally {
                if (isMounted) setLoadingClubs(false);
            }
        };
        fetchClubs();
        return () => { isMounted = false; };
    }, [isOpen, token]);

    // 2. Cargar configuración según el ámbito seleccionado ('global' o clubId)
    const loadConfig = useCallback(async (targetScope: string) => {
        try {
            setLoadingConfig(true);
            const url = targetScope === 'global'
                ? '/api/site-modules/config?clubId=global'
                : `/api/site-modules/config?clubId=${encodeURIComponent(targetScope)}`;

            const res = await fetch(url, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (res.ok) {
                const data = await res.json();
                if (data.modules) {
                    setModulesConfig(data.modules);
                    setHasCustomOverride(Boolean(data.hasCustomOverride));
                    setHasUnsavedChanges(false);
                }
            } else {
                toast.error('Error al cargar la configuración del sitio');
            }
        } catch (err) {
            console.error('[SiteModulesManager] Error cargando configuración:', err);
            toast.error('Error de conexión al cargar módulos');
        } finally {
            setLoadingConfig(false);
        }
    }, [token]);

    useEffect(() => {
        if (!isOpen) return;
        loadConfig(selectedClubId || 'global');
    }, [isOpen, selectedClubId, loadConfig]);

    if (!isOpen) return null;

    const isGlobalScope = selectedClubId === 'global' || !selectedClubId;
    const selectedClub = clubs.find(c => c.id === selectedClubId);

    // Filtrar lista de clubes para selector
    const filteredClubs = clubs.filter(c => {
        if (!clubSearch.trim()) return true;
        const q = clubSearch.toLowerCase();
        return c.name.toLowerCase().includes(q) ||
               (c.city && c.city.toLowerCase().includes(q)) ||
               (c.subdomain && c.subdomain.toLowerCase().includes(q));
    });

    // Conteo de módulos activos
    const totalCount = SITE_MODULES_CATALOG.length;
    const activeCount = Object.values(modulesConfig).filter(Boolean).length;
    const disabledCount = totalCount - activeCount;

    // Toggle individual de módulo
    const handleToggle = (key: string) => {
        setModulesConfig(prev => ({
            ...prev,
            [key]: !prev[key]
        }));
        setHasUnsavedChanges(true);
    };

    // Toggle grupal (activar o desactivar todo el grupo)
    const handleToggleGroup = (groupName: string, enable: boolean) => {
        const groupMods = SITE_MODULES_CATALOG.filter(m => m.group === groupName);
        setModulesConfig(prev => {
            const next = { ...prev };
            groupMods.forEach(m => {
                next[m.key] = enable;
            });
            return next;
        });
        setHasUnsavedChanges(true);
    };

    // Restablecer a valores predeterminados
    const handleApplyDefaults = () => {
        const defaults = { ...DEFAULT_SITE_MODULES_CONFIG };
        if (selectedClubId === ORIGEN_CLUB_ID) {
            defaults.finance_investment = true;
            defaults.finance_vault = true;
        }
        setModulesConfig(defaults);
        setHasUnsavedChanges(true);
        toast.info('Se han cargado los valores predeterminados. Presiona "Guardar Cambios" para confirmar.');
    };

    // Restablecer club a configuración general
    const handleResetToGlobal = async () => {
        if (isGlobalScope || !selectedClub) return;
        try {
            setSaving(true);
            const res = await fetch('/api/site-modules/config', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                    clubId: selectedClub.id,
                    resetToGlobal: true
                })
            });
            const data = await res.json();
            if (res.ok) {
                toast.success(`El sitio ${selectedClub.name} ahora hereda la configuración general.`);
                if (data.modules) {
                    setModulesConfig(data.modules);
                }
                setHasCustomOverride(false);
                setHasUnsavedChanges(false);
                window.dispatchEvent(new CustomEvent('cp-site-modules-updated'));
                if (onSaved) onSaved();
            } else {
                toast.error(data.error || 'Error al restablecer configuración');
            }
        } catch (err) {
            console.error('[SiteModulesManager] Error restableciendo:', err);
            toast.error('Error al restablecer a configuración general');
        } finally {
            setSaving(false);
        }
    };

    // Guardar cambios
    const handleSave = async () => {
        try {
            setSaving(true);
            const res = await fetch('/api/site-modules/config', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                    clubId: selectedClubId,
                    modules: modulesConfig
                })
            });
            const data = await res.json();
            if (res.ok) {
                toast.success(data.message || 'Configuración guardada exitosamente.');
                setHasUnsavedChanges(false);
                if (!isGlobalScope) {
                    setHasCustomOverride(true);
                }
                window.dispatchEvent(new CustomEvent('cp-site-modules-updated'));
                if (onSaved) onSaved();
            } else {
                toast.error(data.error || 'Error al guardar configuración');
            }
        } catch (err) {
            console.error('[SiteModulesManager] Error guardando:', err);
            toast.error('Error de conexión al guardar configuración');
        } finally {
            setSaving(false);
        }
    };

    // Filtrar módulos mostrados por grupo seleccionado
    const displayedGroups = selectedGroupFilter === 'all'
        ? SITE_MODULE_GROUPS
        : [selectedGroupFilter];

    if (!isOpen && !inline) return null;

    const modalContent = (
        <div className={`bg-white w-full ${inline ? 'rounded-2xl border border-gray-200 shadow-sm' : 'max-w-5xl rounded-2xl shadow-2xl border border-gray-200'} flex flex-col ${inline ? 'min-h-[650px]' : 'max-h-[92vh]'} overflow-hidden`}>
            {/* CABECERA */}
            <div className="p-5 md:px-6 md:py-5 border-b border-gray-200 bg-slate-900 text-white flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-600/30 border border-blue-400/40 flex items-center justify-center text-blue-300">
                        <Sliders className="w-5 h-5" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h2 className="text-base font-bold text-white tracking-tight">
                                Gestión de Módulos por Sitio
                            </h2>
                            <span className="bg-blue-600 text-[10px] font-black px-2 py-0.5 rounded text-white uppercase tracking-wider">
                                SaaS Multi-tenant
                            </span>
                        </div>
                        <p className="text-xs text-slate-300 mt-0.5">
                            Controla dinámicamente qué módulos y grupos aparecen en la barra lateral de cada club rotario.
                        </p>
                    </div>
                </div>
                {onClose && (
                    <button
                        onClick={onClose}
                        className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors"
                        title="Cerrar"
                    >
                        <X className="w-5 h-5" />
                    </button>
                )}
            </div>

                {/* SELECTOR DE ÁMBITO (GLOBAL VS CLUB ESPECÍFICO) */}
                <div className="p-4 bg-slate-50 border-b border-gray-200 flex flex-col md:flex-row md:items-center justify-between gap-3 shrink-0">
                    <div className="flex items-center gap-2 flex-1 max-w-xl">
                        <span className="text-xs font-bold text-gray-700 whitespace-nowrap">Ámbito:</span>
                        <div className="relative flex-1">
                            <select
                                value={selectedClubId}
                                onChange={(e) => setSelectedClubId(e.target.value)}
                                className="w-full pl-3 pr-8 py-2 rounded-xl border border-gray-300 bg-white text-xs font-bold text-gray-800 focus:outline-hidden focus:ring-2 focus:ring-[#013388]/30 shadow-xs appearance-none"
                            >
                                <option value="global">
                                    🌐 Configuración General (Predeterminada para todos los sitios)
                                </option>
                                <optgroup label="Sitios y Clubes Rotarios">
                                    {clubs.map((c) => (
                                        <option key={c.id} value={c.id}>
                                            {c.name} {c.city ? `(${c.city})` : ''} {c.hasCustomOverride ? '• [Personalizada]' : ''}
                                        </option>
                                    ))}
                                </optgroup>
                            </select>
                            <ChevronDown className="w-4 h-4 text-gray-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                        </div>
                    </div>

                    {/* BADGES DE ESTADO Y ACCIONES DE HERENCIA */}
                    <div className="flex items-center gap-2">
                        {isGlobalScope ? (
                            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-100 text-[#013388] text-[11px] font-bold">
                                <Globe className="w-3.5 h-3.5" />
                                <span>Aplica por defecto a nuevos y existentes clubes</span>
                            </div>
                        ) : (
                            <>
                                {hasCustomOverride ? (
                                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 text-[11px] font-bold">
                                        <ShieldCheck className="w-3.5 h-3.5" />
                                        <span>Excepción particular activa</span>
                                    </div>
                                ) : (
                                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-200 text-slate-700 text-[11px] font-bold">
                                        <Layers className="w-3.5 h-3.5" />
                                        <span>Heredando configuración general</span>
                                    </div>
                                )}

                                {hasCustomOverride && (
                                    <button
                                        onClick={handleResetToGlobal}
                                        disabled={saving}
                                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold text-gray-600 bg-white border border-gray-300 hover:bg-gray-100 transition-colors shadow-xs"
                                        title="Eliminar excepción y heredar la configuración general"
                                    >
                                        <RotateCcw className="w-3 h-3" />
                                        <span>Restablecer a general</span>
                                    </button>
                                )}
                            </>
                        )}

                        <button
                            onClick={handleApplyDefaults}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-slate-600 hover:text-slate-900 bg-white border border-gray-200 hover:border-gray-300 transition-colors shadow-xs"
                            title="Restablecer valores predeterminados seguros"
                        >
                            <span>Valores estándar</span>
                        </button>
                    </div>
                </div>

                {/* FILTROS POR GRUPO Y RESUMEN RÁPIDO */}
                <div className="px-5 py-2.5 bg-white border-b border-gray-200 flex items-center justify-between gap-3 text-xs overflow-x-auto shrink-0">
                    <div className="flex items-center gap-1.5">
                        <span className="text-gray-400 font-bold uppercase text-[10px]">Filtrar grupo:</span>
                        <button
                            onClick={() => setSelectedGroupFilter('all')}
                            className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                                selectedGroupFilter === 'all'
                                    ? 'bg-[#013388] text-white shadow-xs'
                                    : 'text-gray-600 hover:bg-gray-100'
                            }`}
                        >
                            Todos ({totalCount})
                        </button>
                        {SITE_MODULE_GROUPS.map((grp) => {
                            const groupMods = SITE_MODULES_CATALOG.filter(m => m.group === grp);
                            const groupActiveCount = groupMods.filter(m => modulesConfig[m.key]).length;
                            return (
                                <button
                                    key={grp}
                                    onClick={() => setSelectedGroupFilter(grp)}
                                    className={`px-2.5 py-1 rounded-lg font-bold transition-all whitespace-nowrap ${
                                        selectedGroupFilter === grp
                                            ? 'bg-[#013388] text-white shadow-xs'
                                            : 'text-gray-600 hover:bg-gray-100'
                                    }`}
                                >
                                    {grp} ({groupActiveCount}/{groupMods.length})
                                </button>
                            );
                        })}
                    </div>

                    <div className="flex items-center gap-3 text-[11px] font-semibold shrink-0">
                        <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                            ✓ {activeCount} visibles
                        </span>
                        <span className="text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
                            ✕ {disabledCount} ocultos
                        </span>
                    </div>
                </div>

                {/* CUERPO DEL TABLERO DE MÓDULOS */}
                <div className="flex-1 overflow-y-auto p-5 md:p-6 bg-[#F8FAFC] space-y-6">
                    {displayedGroups.map((groupName) => {
                        const groupMods = SITE_MODULES_CATALOG.filter(m => m.group === groupName);
                        const allGroupEnabled = groupMods.every(m => modulesConfig[m.key]);
                        const someGroupEnabled = groupMods.some(m => modulesConfig[m.key]);
                        const isCollapsed = collapsedGroups[groupName] || false;

                        return (
                            <div key={groupName} className="bg-white rounded-xl border border-gray-200 shadow-xs overflow-hidden">
                                {/* CABECERA DE GRUPO */}
                                <div className="p-3.5 bg-slate-50/80 border-b border-gray-200 flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => setCollapsedGroups(prev => ({ ...prev, [groupName]: !prev[groupName] }))}
                                            className="text-gray-500 hover:text-gray-800 p-0.5"
                                        >
                                            {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                                        </button>
                                        <h3 className="text-xs font-black text-gray-900 uppercase tracking-wider">
                                            {groupName}
                                        </h3>
                                        <span className="text-[11px] font-semibold text-gray-500">
                                            ({groupMods.filter(m => modulesConfig[m.key]).length} de {groupMods.length} activos)
                                        </span>
                                        {!someGroupEnabled && (
                                            <span className="text-[10px] font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-md">
                                                Grupo oculto automáticamente en barra lateral
                                            </span>
                                        )}
                                    </div>

                                    {/* ACCIÓN MAESTRA DE GRUPO */}
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => handleToggleGroup(groupName, !allGroupEnabled)}
                                            className="text-[11px] font-bold text-[#013388] hover:underline px-2 py-1 rounded hover:bg-blue-50"
                                        >
                                            {allGroupEnabled ? 'Desactivar grupo' : 'Activar grupo completo'}
                                        </button>
                                    </div>
                                </div>

                                {/* LISTA DE MÓDULOS DEL GRUPO */}
                                {!isCollapsed && (
                                    <div className="divide-y divide-gray-100">
                                        {groupMods.map((module) => {
                                            const isEnabled = modulesConfig[module.key] || false;
                                            return (
                                                <div
                                                    key={module.key}
                                                    className={`p-3.5 flex items-center justify-between gap-4 transition-colors ${
                                                        isEnabled ? 'hover:bg-blue-50/20' : 'bg-gray-50/50 hover:bg-gray-100/50 opacity-80'
                                                    }`}
                                                >
                                                    <div className="flex items-start gap-3 min-w-0 flex-1">
                                                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
                                                            isEnabled ? 'bg-white border-gray-200 shadow-xs' : 'bg-gray-100 border-gray-200'
                                                        }`}>
                                                            {getModuleIcon(module.icon)}
                                                        </div>
                                                        <div className="min-w-0 flex-1">
                                                            <div className="flex items-center gap-2">
                                                                <h4 className={`text-xs font-bold leading-tight ${isEnabled ? 'text-gray-900' : 'text-gray-500'}`}>
                                                                    {module.label}
                                                                </h4>
                                                                {getTierBadge(module.tier)}
                                                                <span className="text-[10px] text-gray-400 font-mono">
                                                                    {module.routes[0]}
                                                                </span>
                                                            </div>
                                                            <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">
                                                                {module.description}
                                                            </p>
                                                        </div>
                                                    </div>

                                                    {/* SWITCH INTERRUPTOR */}
                                                    <div className="shrink-0 flex items-center gap-2">
                                                        <span className={`text-[11px] font-bold ${isEnabled ? 'text-emerald-700' : 'text-gray-400'}`}>
                                                            {isEnabled ? 'Visible' : 'Oculto'}
                                                        </span>
                                                        <button
                                                            type="button"
                                                            role="switch"
                                                            aria-checked={isEnabled}
                                                            onClick={() => handleToggle(module.key)}
                                                            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                                                                isEnabled ? 'bg-emerald-600' : 'bg-gray-300'
                                                            }`}
                                                        >
                                                            <span
                                                                aria-hidden="true"
                                                                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                                                                    isEnabled ? 'translate-x-5' : 'translate-x-0'
                                                                }`}
                                                            />
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* PIE DE PÁGINA CON BOTÓN GUARDAR */}
                <div className="p-4 bg-white border-t border-gray-200 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                        {hasUnsavedChanges && (
                            <span className="text-amber-700 font-bold flex items-center gap-1">
                                <Info className="w-4 h-4 text-amber-500" />
                                Tienes cambios sin guardar.
                            </span>
                        )}
                        {!hasUnsavedChanges && (
                            <span className="text-gray-400 flex items-center gap-1">
                                <Check className="w-3.5 h-3.5 text-emerald-500" />
                                Configuración sincronizada con la base de datos.
                            </span>
                        )}
                    </div>

                    <div className="flex items-center gap-3">
                        {onClose && (
                            <button
                                onClick={onClose}
                                className="px-4 py-2 rounded-xl text-xs font-bold text-gray-700 hover:bg-gray-100 transition-colors"
                            >
                                Cancelar
                            </button>
                        )}
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-xs font-black bg-[#013388] text-white hover:bg-blue-900 transition-colors shadow-sm disabled:opacity-50"
                        >
                            <Save className="w-4 h-4" />
                            <span>{saving ? 'Guardando...' : 'Guardar Cambios'}</span>
                        </button>
                    </div>
                </div>
            </div>
    );

    if (inline) {
        return modalContent;
    }

    return (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 md:p-6 overflow-y-auto">
            {modalContent}
        </div>
    );
};

export default SiteModulesManagerModal;
