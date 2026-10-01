// ════════════════════════════════════════════════════════════════════════════
// Modal de Configuración Central de Herramientas del Estudio de Contenido (v4.1135.0)
//
// Permite al Administrador General de Club Platform activar/desactivar las
// 8 herramientas tanto A NIVEL GENERAL (para todos los sitios) como de manera
// personalizada por sitio en el modelo multi-tenant.
// ════════════════════════════════════════════════════════════════════════════

import React, { useState, useEffect, useCallback } from 'react';
import {
    X,
    Video,
    Image as ImageIcon,
    Clapperboard,
    Flag,
    Layers,
    Share2,
    Megaphone,
    Clock,
    Film,
    Sliders,
    RotateCcw,
    Check,
    Building,
    Globe,
    ShieldCheck,
    CheckCircle2,
    XCircle,
    Undo2,
    Sparkles,
    HeartHandshake
} from 'lucide-react';
import { toast } from 'sonner';
import {
    CONTENT_STUDIO_TOOLS_METADATA,
    DEFAULT_STUDIO_TOOLS,
    getStudioAuthToken,
    type ContentStudioToolKey,
    type ContentStudioToolsConfig
} from '../../../lib/contentStudioFeatures';

interface ClubOption {
    id: string;
    name: string;
    city?: string;
    domain?: string | null;
    subdomain?: string | null;
    type?: string;
    hasCustomConfig?: boolean;
}

interface ContentStudioToolsConfigModalProps {
    isOpen: boolean;
    onClose: () => void;
    initialClubId?: string | null;
    onSaved?: () => void;
}

const getToolIcon = (iconName: string) => {
    switch (iconName) {
        case 'Video':
            return <Video className="w-5 h-5 text-indigo-600" />;
        case 'Image':
        case 'ImageIcon':
            return <ImageIcon className="w-5 h-5 text-emerald-600" />;
        case 'Clapperboard':
            return <Clapperboard className="w-5 h-5 text-purple-600" />;
        case 'Flag':
            return <Flag className="w-5 h-5 text-amber-600" />;
        case 'Layers':
            return <Layers className="w-5 h-5 text-blue-600" />;
        case 'Share2':
            return <Share2 className="w-5 h-5 text-pink-600" />;
        case 'Megaphone':
            return <Megaphone className="w-5 h-5 text-rose-600" />;
        case 'Clock':
            return <Clock className="w-5 h-5 text-cyan-600" />;
        case 'Film':
            return <Film className="w-5 h-5 text-purple-600" />;
        case 'Sparkles':
            return <Sparkles className="w-5 h-5 text-violet-600" />;
        case 'HeartHandshake':
            return <HeartHandshake className="w-5 h-5 text-rose-500" />;
        default:
            return <Sliders className="w-5 h-5 text-indigo-600" />;
    }
};

const ContentStudioToolsConfigModal: React.FC<ContentStudioToolsConfigModalProps> = ({
    isOpen,
    onClose,
    initialClubId,
    onSaved
}) => {
    // Por defecto inicia siempre en la configuración general ('global')
    const [selectedClubId, setSelectedClubId] = useState<string>(initialClubId || 'global');
    const [clubs, setClubs] = useState<ClubOption[]>([]);
    const [toolsConfig, setToolsConfig] = useState<ContentStudioToolsConfig>({ ...DEFAULT_STUDIO_TOOLS });
    const [isCustomConfig, setIsCustomConfig] = useState(false);
    const [loadingClubs, setLoadingClubs] = useState(false);
    const [loadingFeatures, setLoadingFeatures] = useState(false);
    const [saving, setSaving] = useState(false);
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

    // Cargar lista de clubes para selector opcional por sitio
    useEffect(() => {
        if (!isOpen) return;

        let isMounted = true;
        const fetchClubs = async () => {
            try {
                setLoadingClubs(true);
                const token = getStudioAuthToken();

                // Intentar endpoint central de features
                const res = await fetch('/api/content-studio/features/all', {
                    headers: {
                        ...(token ? { Authorization: `Bearer ${token}` } : {})
                    }
                });

                if (res.ok) {
                    const data = await res.json();
                    if (isMounted && Array.isArray(data.clubs)) {
                        setClubs(data.clubs);
                        return;
                    }
                }

                // Fallback secundario a /api/admin/clubs
                const resAdmin = await fetch('/api/admin/clubs', {
                    headers: {
                        ...(token ? { Authorization: `Bearer ${token}` } : {})
                    }
                });
                if (resAdmin.ok) {
                    const dataAdmin = await resAdmin.json();
                    if (isMounted && Array.isArray(dataAdmin)) {
                        setClubs(dataAdmin);
                    }
                }
            } catch (err) {
                console.error('[ContentStudioToolsConfigModal] Error cargando clubes:', err);
            } finally {
                if (isMounted) setLoadingClubs(false);
            }
        };

        fetchClubs();

        return () => {
            isMounted = false;
        };
    }, [isOpen]);

    // Cargar configuración según el ámbito seleccionado ('global' o club específico)
    const loadFeatures = useCallback(async (targetScope: string) => {
        try {
            setLoadingFeatures(true);
            const token = getStudioAuthToken();
            const url = targetScope === 'global'
                ? '/api/content-studio/features?clubId=global'
                : `/api/content-studio/features?clubId=${encodeURIComponent(targetScope)}`;

            const res = await fetch(url, {
                headers: {
                    ...(token ? { Authorization: `Bearer ${token}` } : {})
                }
            });

            if (res.ok) {
                const data = await res.json();
                if (data.features) {
                    setToolsConfig({
                        video: data.features.video !== false,
                        post: data.features.post !== false,
                        outro: data.features.outro !== false,
                        pendones: data.features.pendones !== false,
                        library: data.features.library !== false,
                        image_library: data.features.image_library !== false,
                        ai_reels: data.features.ai_reels !== false,
                        video_library: data.features.video_library !== false,
                        rotary_in_action: data.features.rotary_in_action !== false,
                        accounts: data.features.accounts !== false,
                        distribution: data.features.distribution !== false,
                        queue: data.features.queue !== false,
                        editor: Boolean(data.features.editor)
                    });
                    setIsCustomConfig(!!data.hasCustomConfig);
                    setHasUnsavedChanges(false);
                }
            } else {
                const errData = await res.json().catch(() => null);
                console.error('[ContentStudioToolsConfigModal] Error en respuesta de features:', errData);
            }
        } catch (err) {
            console.error('[ContentStudioToolsConfigModal] Error cargando configuración:', err);
            toast.error('Error al cargar configuración de herramientas');
        } finally {
            setLoadingFeatures(false);
        }
    }, []);

    useEffect(() => {
        if (!isOpen) return;
        loadFeatures(selectedClubId || 'global');
    }, [isOpen, selectedClubId, loadFeatures]);

    if (!isOpen) return null;

    const isGlobalScope = selectedClubId === 'global' || !selectedClubId;
    const selectedClub = clubs.find(c => c.id === selectedClubId);

    const handleToggle = (key: ContentStudioToolKey) => {
        setToolsConfig(prev => ({
            ...prev,
            [key]: !prev[key]
        }));
        setHasUnsavedChanges(true);
    };

    const handleApplyDefaults = () => {
        setToolsConfig({ ...DEFAULT_STUDIO_TOOLS });
        setHasUnsavedChanges(true);
        toast.info('Se han activado las 8 herramientas. Presiona "Guardar" para confirmar los cambios.');
    };

    const handleResetToGlobal = async () => {
        if (isGlobalScope || !selectedClub) return;

        try {
            setSaving(true);
            const token = getStudioAuthToken();
            const res = await fetch('/api/content-studio/features', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {})
                },
                body: JSON.stringify({
                    clubId: selectedClub.id,
                    resetToGlobal: true
                })
            });

            const data = await res.json();
            if (res.ok && data.ok) {
                toast.success(`El sitio ${selectedClub.name} ahora hereda la configuración general.`);
                if (data.features) {
                    setToolsConfig(data.features);
                }
                setIsCustomConfig(false);
                setHasUnsavedChanges(false);
                if (onSaved) onSaved();
            } else {
                toast.error(data.error || 'Error al restablecer a configuración general');
            }
        } catch (err) {
            console.error('[ContentStudioToolsConfigModal] Error restableciendo:', err);
            toast.error('Error al restablecer a configuración general');
        } finally {
            setSaving(false);
        }
    };

    const handleSave = async () => {
        try {
            setSaving(true);
            const token = getStudioAuthToken();
            const res = await fetch('/api/content-studio/features', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {})
                },
                body: JSON.stringify({
                    clubId: isGlobalScope ? 'global' : selectedClubId,
                    features: toolsConfig
                })
            });

            const data = await res.json();
            if (res.ok && data.ok) {
                if (isGlobalScope) {
                    toast.success('Configuración general de herramientas guardada para todos los sitios');
                } else {
                    toast.success(`Configuración guardada para ${selectedClub?.name || 'el sitio'}`);
                    setIsCustomConfig(true);
                }
                setHasUnsavedChanges(false);
                if (onSaved) onSaved();
            } else {
                toast.error(data.error || 'Error al guardar la configuración');
            }
        } catch (err) {
            console.error('[ContentStudioToolsConfigModal] Error guardando:', err);
            toast.error('Error de conexión al guardar configuración');
        } finally {
            setSaving(false);
        }
    };

    const activeCount = Object.values(toolsConfig).filter(Boolean).length;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[92vh] border border-gray-100">
                {/* Header */}
                <div className="px-6 py-5 border-b border-gray-100 bg-gradient-to-r from-gray-50 via-white to-indigo-50/30 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-200">
                            <Sliders className="w-5 h-5" />
                        </div>
                        <div>
                            <h2 className="text-xl font-black text-gray-900 tracking-tight flex items-center gap-2">
                                Herramientas de Estudio de Contenido
                                <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">
                                    Central
                                </span>
                            </h2>
                            <p className="text-xs text-gray-500 font-medium">
                                Control de acceso y visibilidad de herramientas administrado a nivel general y por sitio.
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                        aria-label="Cerrar modal"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Subheader / Selector de Ámbito y Sitio */}
                <div className="px-6 py-4 bg-gray-50/70 border-b border-gray-100 flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
                    <div className="flex-1 w-full md:w-auto">
                        <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 flex items-center gap-1.5">
                            {isGlobalScope ? (
                                <Globe className="w-3.5 h-3.5 text-indigo-600" />
                            ) : (
                                <Building className="w-3.5 h-3.5 text-indigo-600" />
                            )}
                            Ámbito / Sitio a Configurar
                        </label>
                        <div className="relative">
                            <select
                                value={selectedClubId}
                                onChange={(e) => setSelectedClubId(e.target.value)}
                                disabled={loadingFeatures || saving}
                                className="w-full bg-white border border-gray-200 text-gray-900 text-sm font-semibold rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all shadow-sm"
                            >
                                <option value="global">
                                    🌐 Configuración General (Aplica a todos los sitios)
                                </option>
                                {clubs.length > 0 && (
                                    <optgroup label="── Opcional: Personalizar por Sitio Específico ──">
                                        {clubs.map(c => (
                                            <option key={c.id} value={c.id}>
                                                🏢 {c.name} {c.city ? `(${c.city})` : ''} {c.hasCustomConfig ? '• (Personalizado)' : ''}
                                            </option>
                                        ))}
                                    </optgroup>
                                )}
                            </select>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 self-end md:self-center flex-wrap">
                        {!isGlobalScope && isCustomConfig && (
                            <button
                                type="button"
                                onClick={handleResetToGlobal}
                                disabled={loadingFeatures || saving}
                                className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-xl transition-all shadow-sm"
                                title="Elimina la personalización exclusiva para que este sitio herede las reglas generales"
                            >
                                <Undo2 className="w-3.5 h-3.5" />
                                Heredar reglas generales
                            </button>
                        )}

                        <button
                            type="button"
                            onClick={handleApplyDefaults}
                            disabled={loadingFeatures || saving}
                            className="flex items-center gap-2 px-3.5 py-2 text-xs font-bold text-gray-700 bg-white hover:bg-gray-100 border border-gray-200 rounded-xl transition-all shadow-sm hover:shadow"
                            title="Activa las 8 herramientas a la vez"
                        >
                            <RotateCcw className="w-3.5 h-3.5 text-gray-500" />
                            Aplicar configuración predeterminada
                        </button>
                    </div>
                </div>

                {/* Banner Informativo del Ámbito Activo */}
                <div className="px-6 py-2.5 bg-indigo-50/40 border-b border-indigo-100/50 flex items-center justify-between text-xs">
                    {isGlobalScope ? (
                        <div className="flex items-center gap-2 text-indigo-900 font-medium">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                            <span>
                                <strong>Configuración General Activa:</strong> Los módulos habilitados aquí rigen por defecto para todos los sitios de Club Platform.
                            </span>
                        </div>
                    ) : (
                        <div className="flex items-center gap-2 text-gray-800 font-medium">
                            <span className="w-2 h-2 rounded-full bg-amber-500" />
                            <span>
                                <strong>Personalización para {selectedClub?.name || 'este sitio'}:</strong>{' '}
                                {isCustomConfig
                                    ? 'Cuenta con personalización exclusiva que sobrescribe la regla general.'
                                    : 'Actualmente hereda la configuración general de la plataforma.'}
                            </span>
                        </div>
                    )}
                </div>

                {/* Tools Grid */}
                <div className="p-6 overflow-y-auto space-y-4 flex-1">
                    {loadingFeatures ? (
                        <div className="py-16 text-center">
                            <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                            <p className="text-sm font-semibold text-gray-500">Cargando herramientas...</p>
                        </div>
                    ) : (
                        <>
                            <div className="flex items-center justify-between px-1">
                                <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                                    Disponibilidad de Módulos ({activeCount} de {CONTENT_STUDIO_TOOLS_METADATA.length} activos)
                                </span>
                                <span className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-gray-100 text-gray-700">
                                    {isGlobalScope ? 'Ámbito: Todos los sitios' : `Sitio: ${selectedClub?.name || 'Personalizado'}`}
                                </span>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                                {CONTENT_STUDIO_TOOLS_METADATA.map((tool) => {
                                    const isActive = toolsConfig[tool.key] !== false;
                                    return (
                                        <div
                                            key={tool.key}
                                            onClick={() => handleToggle(tool.key)}
                                            className={`p-4 rounded-2xl border transition-all cursor-pointer select-none flex items-start gap-3.5 ${
                                                isActive
                                                    ? 'bg-white border-indigo-100 hover:border-indigo-300 shadow-sm'
                                                    : 'bg-gray-50/80 border-gray-200/80 opacity-75 hover:opacity-100'
                                            }`}
                                        >
                                            <div className={`p-2.5 rounded-xl flex-shrink-0 transition-colors ${
                                                isActive ? 'bg-indigo-50' : 'bg-gray-100'
                                            }`}>
                                                {getToolIcon(tool.iconName)}
                                            </div>

                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center justify-between gap-2 mb-1">
                                                    <h3 className="text-sm font-bold text-gray-900 tracking-tight">
                                                        {tool.label}
                                                    </h3>
                                                    <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full flex items-center gap-1 ${
                                                        isActive
                                                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60'
                                                            : 'bg-gray-200 text-gray-600'
                                                    }`}>
                                                        {isActive ? (
                                                            <>
                                                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                                                Activo
                                                            </>
                                                        ) : (
                                                            <>
                                                                <XCircle className="w-3 h-3 text-gray-400" />
                                                                Inactivo
                                                            </>
                                                        )}
                                                    </span>
                                                </div>
                                                <p className="text-xs text-gray-500 leading-snug line-clamp-2">
                                                    {tool.description}
                                                </p>
                                            </div>

                                            {/* Toggle switch visual */}
                                            <div className="pt-1">
                                                <div
                                                    className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors ${
                                                        isActive ? 'bg-indigo-600' : 'bg-gray-300'
                                                    }`}
                                                >
                                                    <div
                                                        className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                                                            isActive ? 'translate-x-5' : 'translate-x-0'
                                                        }`}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            <div className="bg-amber-50/70 border border-amber-200/60 rounded-2xl p-4 flex items-start gap-3 mt-4">
                                <ShieldCheck className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                                <div className="text-xs text-amber-800 leading-relaxed">
                                    <strong>Aislamiento Multi-Tenant Estricto:</strong> Cuando una herramienta está inactiva para un sitio, no se visualiza en la barra de navegación ni se puede ejecutar por API o enlace directo. El Administrador General de Club Platform conserva acceso a todas las herramientas en todo momento.
                                </div>
                            </div>
                        </>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex items-center justify-between">
                    <div className="text-xs font-semibold text-gray-500">
                        {hasUnsavedChanges ? (
                            <span className="text-amber-600 font-bold flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                                Cambios pendientes por guardar
                            </span>
                        ) : (
                            <span className="text-gray-400">Configuración sincronizada</span>
                        )}
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-sm font-semibold text-gray-600 hover:text-gray-900 transition-colors"
                        >
                            Cerrar
                        </button>
                        <button
                            type="button"
                            onClick={handleSave}
                            disabled={saving || loadingFeatures}
                            className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold shadow-md shadow-indigo-200 transition-all disabled:opacity-50"
                        >
                            {saving ? (
                                <>
                                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                    Guardando...
                                </>
                            ) : (
                                <>
                                    <Check className="w-4 h-4" />
                                    {isGlobalScope ? 'Guardar Configuración General' : 'Guardar Configuración del Sitio'}
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ContentStudioToolsConfigModal;
