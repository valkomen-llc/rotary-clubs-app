// ════════════════════════════════════════════════════════════════════════════
// Modal de Configuración Central de Herramientas del Estudio de Contenido (v4.1134.0)
//
// Permite al Administrador General de Club Platform activar/desactivar las
// 8 herramientas de manera independiente por sitio en el modelo multi-tenant.
// Incluye selector de sitio, interruptores en tiempo real y acción rápida
// de «Aplicar configuración predeterminada».
// ════════════════════════════════════════════════════════════════════════════

import React, { useState, useEffect } from 'react';
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
    Sliders,
    RotateCcw,
    Check,
    Building,
    Search,
    ShieldCheck,
    CheckCircle2,
    XCircle
} from 'lucide-react';
import { toast } from 'sonner';
import {
    CONTENT_STUDIO_TOOLS_METADATA,
    DEFAULT_STUDIO_TOOLS,
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
    const [clubs, setClubs] = useState<ClubOption[]>([]);
    const [selectedClubId, setSelectedClubId] = useState<string>(initialClubId || '');
    const [searchClub, setSearchClub] = useState('');
    const [toolsConfig, setToolsConfig] = useState<ContentStudioToolsConfig>({ ...DEFAULT_STUDIO_TOOLS });
    const [loadingClubs, setLoadingClubs] = useState(false);
    const [loadingFeatures, setLoadingFeatures] = useState(false);
    const [saving, setSaving] = useState(false);
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

    // Cargar clubes disponibles
    useEffect(() => {
        if (!isOpen) return;
        const fetchClubs = async () => {
            try {
                setLoadingClubs(true);
                const token = localStorage.getItem('token');
                const res = await fetch('/api/admin/clubs', {
                    headers: {
                        ...(token ? { Authorization: `Bearer ${token}` } : {})
                    }
                });
                if (res.ok) {
                    const data = await res.json();
                    if (Array.isArray(data)) {
                        setClubs(data);
                        if (!selectedClubId && data.length > 0) {
                            setSelectedClubId(initialClubId || data[0].id);
                        }
                    }
                }
            } catch (err) {
                console.error('[ContentStudioToolsConfigModal] Error cargando clubes:', err);
                toast.error('Error al cargar la lista de sitios');
            } finally {
                setLoadingClubs(false);
            }
        };

        fetchClubs();
    }, [isOpen, initialClubId]);

    // Cargar configuración cuando cambia el club seleccionado
    useEffect(() => {
        if (!isOpen || !selectedClubId) return;

        const loadClubFeatures = async () => {
            try {
                setLoadingFeatures(true);
                const token = localStorage.getItem('token');
                const res = await fetch(`/api/content-studio/features?clubId=${encodeURIComponent(selectedClubId)}`, {
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
                            accounts: data.features.accounts !== false,
                            distribution: data.features.distribution !== false,
                            queue: data.features.queue !== false
                        });
                        setHasUnsavedChanges(false);
                    }
                }
            } catch (err) {
                console.error('[ContentStudioToolsConfigModal] Error cargando features del club:', err);
                toast.error('Error al cargar configuración de herramientas');
            } finally {
                setLoadingFeatures(false);
            }
        };

        loadClubFeatures();
    }, [isOpen, selectedClubId]);

    if (!isOpen) return null;

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
        toast.info('Se han activado todas las herramientas (predeterminado). Guarda los cambios para persistir.');
    };

    const handleSave = async () => {
        if (!selectedClubId) {
            toast.error('Selecciona un sitio primero');
            return;
        }

        try {
            setSaving(true);
            const token = localStorage.getItem('token');
            const res = await fetch('/api/content-studio/features', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {})
                },
                body: JSON.stringify({
                    clubId: selectedClubId,
                    features: toolsConfig
                })
            });

            const data = await res.json();
            if (res.ok && data.ok) {
                toast.success(`Configuración guardada para ${selectedClub?.name || 'el sitio'}`);
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
    const filteredClubs = clubs.filter(c => 
        (c.name || '').toLowerCase().includes(searchClub.toLowerCase()) ||
        (c.city || '').toLowerCase().includes(searchClub.toLowerCase()) ||
        (c.domain || '').toLowerCase().includes(searchClub.toLowerCase())
    );

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
                                Control de acceso y visibilidad de herramientas administrado por sitio.
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Subheader / Selector de Sitio */}
                <div className="px-6 py-4 bg-gray-50/70 border-b border-gray-100 flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
                    <div className="flex-1 w-full md:w-auto">
                        <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5 flex items-center gap-1.5">
                            <Building className="w-3.5 h-3.5 text-indigo-600" />
                            Sitio a Configurar
                        </label>
                        <div className="relative">
                            <select
                                value={selectedClubId}
                                onChange={(e) => setSelectedClubId(e.target.value)}
                                disabled={loadingClubs || saving}
                                className="w-full bg-white border border-gray-200 text-gray-900 text-sm font-semibold rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all shadow-sm"
                            >
                                {loadingClubs ? (
                                    <option value="">Cargando sitios...</option>
                                ) : (
                                    clubs.map(c => (
                                        <option key={c.id} value={c.id}>
                                            {c.name} {c.city ? `(${c.city})` : ''}
                                        </option>
                                    ))
                                )}
                            </select>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 self-end md:self-center">
                        <button
                            type="button"
                            onClick={handleApplyDefaults}
                            disabled={loadingFeatures || saving}
                            className="flex items-center gap-2 px-3.5 py-2 text-xs font-bold text-gray-700 bg-white hover:bg-gray-100 border border-gray-200 rounded-xl transition-all shadow-sm hover:shadow"
                            title="Restablece todas las 8 herramientas a estado activo"
                        >
                            <RotateCcw className="w-3.5 h-3.5 text-gray-500" />
                            Aplicar configuración predeterminada
                        </button>
                    </div>
                </div>

                {/* Tools Grid */}
                <div className="p-6 overflow-y-auto space-y-4 flex-1">
                    {loadingFeatures ? (
                        <div className="py-16 text-center">
                            <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                            <p className="text-sm font-semibold text-gray-500">Cargando herramientas del sitio...</p>
                        </div>
                    ) : (
                        <>
                            <div className="flex items-center justify-between px-1">
                                <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                                    Disponibilidad de Módulos ({activeCount} de 8 activos)
                                </span>
                                {selectedClub && (
                                    <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2.5 py-1 rounded-lg">
                                        Tenant: <strong className="text-gray-800">{selectedClub.domain || selectedClub.subdomain || selectedClub.name}</strong>
                                    </span>
                                )}
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
                                    <strong>Aislamiento Multi-Tenant Estricto:</strong> Cuando una herramienta está inactiva para este sitio, no se visualiza en la barra de navegación ni se puede ejecutar por API o enlace directo. El Administrador General de Club Platform conserva acceso a todas las herramientas en todo momento.
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
                                    Guardar Configuración
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
