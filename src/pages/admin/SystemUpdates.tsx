import React, { useState } from 'react';
import {
    GitCommit,
    AlertCircle,
    CheckCircle2,
    Clock,
    PlusCircle,
    Box,
    RefreshCw,
    Shield
} from 'lucide-react';

interface UpdateItem {
    version: string;
    date: string;
    title: string;
    type: 'hotfix' | 'feature' | 'update' | 'rollback';
    changes: Array<{
        type: 'added' | 'fixed' | 'changed' | 'removed' | 'rollback';
        text: string;
    }>;
}

export const SYSTEM_UPDATES: UpdateItem[] = [
    {
        version: "v4.6.5",
        date: "19 Abril 2026",
        title: "Global CTA Sync & History Polish",
        type: "update",
        changes: [
            { type: "added", text: "Sincronización del bloque 'Involúcrate' en Historia y Causas con el estilo institucional." },
            { type: "changed", text: "Optimización de legibilidad: Ajuste de fuente a 16px en el bloque de impacto de Origen." },
            { type: "added", text: "Vinculación total con el CMS para los nuevos bloques de llamados a la acción." }
        ]
    },
    {
        version: "v4.3.7",
        date: "18 Abril 2026",
        title: "Origen History Upgrade & Robust Detection",
        type: "update",
        changes: [
            { type: "added", text: "Implementación de contenido histórico hardcoded para Rotary E-Club Origen." },
            { type: "fixed", text: "Detección multisource: Ahora el sistema reconoce al club vía URL Params, Hash Params y Metadatos de API." },
            { type: "changed", text: "Corrección de títulos: Se eliminó el error 'undefined' en la sección de historia local." }
        ]
    },
    {
        version: "v4.3.5",
        date: "16 Abril 2026",
        title: "Role-Based Access & Decoupled Configuration",
        type: "update",
        changes: [
            { type: "added", text: "Independencia de la configuración: El Estilo del Mapa ahora es personalizable por club a través del panel de configuración." },
            { type: "changed", text: "Mejora en la herencia de logos: El tamaño del logo del header ahora es individual, con un fallback seguro al club origen." },
            { type: "fixed", text: "Seguridad de Acceso: Redirección automática de usuarios con rol 'editor' y restricción visual de acceso a la configuración global del sitio." },
            { type: "added", text: "Optimización de Onboarding: Sincronización de flujos y ampliación del gestor de contenedores de imágenes laterales para módulos activos." }
        ]
    },
    {
        version: "v4.3.4",
        date: "15 Abril 2026",
        title: "CMS Stability",
        type: "update",
        changes: [{ type: "fixed", text: "Estabilización de CMS" }]
    },
    {
        version: "v4.3.0",
        date: "13 Abril 2026",
        title: "Modelos de IA Implementados & Soporte Integrado",
        type: "feature",
        changes: [
            { type: "added", text: "Implementación de Modelos de IA especializados en soporte técnico de la plataforma." },
            { type: "added", text: "Nueva sección 'Asistencia Chat' exclusiva para Super Administradores en la barra lateral." },
            { type: "changed", text: "Optimización de la lógica de aislamiento multitenancy para mayor seguridad en el acceso a datos." }
        ]
    },
    {
        version: "v4.2.2",
        date: "07 Abril 2026",
        title: "Restauración de Mission Control Kanban & Sistema de Versiones",
        type: "update",
        changes: [
            { type: "added", text: "Implementación del módulo 'Changelog / Versiones' para Super Administradores, permitiendo la trazabilidad de todos los ajustes al sistema." },
            { type: "fixed", text: "Resolución del error de pantalla blanca (WSOD) en la navegación con HashRouter hacia Mission Control VIP." },
            { type: "changed", text: "El botón 'Enter System' ahora utiliza navegación interna en la misma pestaña mediante useNavigate()." },
            { type: "rollback", text: "Retorno a la interfaz Kanban original aprobada para el HQ CommandCenter (Mission Control VIP), reemplazando la vista Alpha Core temporal." }
        ]
    },
    {
        version: "v4.2.1",
        date: "07 Abril 2026",
        title: "Integración de Alpha Core & Telemetría (Temporal)",
        type: "feature",
        changes: [
            { type: "added", text: "DashboardOverview interactivo con monitoreo de estado para Grand Scope Engine y Membership Pulse IQ." },
            { type: "added", text: "Carga dinámica de métricas de uso y despliegue de agentes en tiempo real." }
        ]
    },
    {
        version: "v4.1.0",
        date: "06 Abril 2026",
        title: "WhatsApp Gateway & Proxy Multimedia",
        type: "feature",
        changes: [
            { type: "added", text: "Despliegue del WhatsApp CRM Dashboard con buscador de chats y funcionalidad de filtrado en tiempo real." },
            { type: "fixed", text: "Configuración del proxy seguro en el backend para la correcta renderización de imágenes, audios (OGG/MP3) y PDFs de WhatsApp." },
            { type: "added", text: "Integración de componentes de envío con soporte local para Emoji Picker y validación de archivos." }
        ]
    },
    {
        version: "v4.0.0",
        date: "28 Marzo 2026",
        title: "Arquitectura Web & Sistema Multitenant",
        type: "feature",
        changes: [
            { type: "added", text: "Lanzamiento oficial de la arquitectura SaaS multitenant para todos los Clubes Rotarios." },
            { type: "added", text: "Integración automática para el aprovisionamiento dinámico de dominios personalizados." },
            { type: "changed", text: "Refactorización de Prisma Schema para el aislamiento (isolation logic) de datos por club." }
        ]
    }
];

const getTypeStyles = (type: UpdateItem['type']) => {
    switch (type) {
        case 'hotfix': return 'bg-red-50 text-red-700 border-red-200';
        case 'feature': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
        case 'rollback': return 'bg-amber-50 text-amber-700 border-amber-200';
        case 'update':
        default: return 'bg-blue-50 text-rotary-blue border-blue-200';
    }
};

const getChangeIcon = (type: string) => {
    switch (type) {
        case 'added': return <PlusCircle className="w-3.5 h-3.5 text-emerald-500" />;
        case 'fixed': return <CheckCircle2 className="w-3.5 h-3.5 text-blue-500" />;
        case 'changed': return <RefreshCw className="w-3.5 h-3.5 text-amber-500" />;
        case 'removed': return <AlertCircle className="w-3.5 h-3.5 text-red-500" />;
        default: return <AlertCircle className="w-3.5 h-3.5 text-gray-500" />;
    }
};

const SystemUpdates: React.FC = () => {
    const [searchTerm, setSearchTerm] = useState('');

    const filteredUpdates = SYSTEM_UPDATES.filter(update => 
        update.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
        update.version.toLowerCase().includes(searchTerm.toLowerCase()) ||
        update.changes.some(c => c.text.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    return (
        <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500 p-4 md:p-8">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div className="space-y-4">
                    <div className="inline-flex flex-col space-y-2">
                        <div className="flex items-center gap-2">
                            <Shield className="w-5 h-5 text-rotary-blue flex-shrink-0" />
                            <span className="text-xs font-bold text-gray-500 uppercase tracking-widest leading-none">Security & Audit</span>
                        </div>
                        <h1 className="text-3xl md:text-4xl font-black text-gray-900 tracking-tight leading-none bg-clip-text text-transparent bg-gradient-to-r from-[#013388] to-[#175CBE]">
                            System Changelog
                        </h1>
                    </div>
                    <p className="text-gray-500 text-sm max-w-2xl leading-relaxed">
                        Registro oficial de implementaciones, despliegues y ajustes al Club Platform. 
                        Mantén el control de la versión actual y explora el historial de cambios de la infraestructura.
                    </p>
                </div>

                <div className="flex flex-col gap-3 min-w-[300px]">
                    <div className="bg-white p-3 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
                            <GitCommit className="w-5 h-5 text-rotary-blue" />
                        </div>
                        <div>
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Active Build</p>
                            <p className="text-sm font-black text-gray-900">{SYSTEM_UPDATES[0].version}</p>
                        </div>
                    </div>
                    <div className="relative">
                        <input 
                            type="text" 
                            placeholder="Buscar en el historial (ej. WhatsApp)..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full px-4 py-2.5 text-sm bg-white border border-gray-200 rounded-xl outline-none focus:border-rotary-blue focus:ring-2 focus:ring-rotary-blue/10 transition-all font-medium text-gray-900 placeholder:text-gray-400"
                        />
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden p-6 md:p-8">
                <div className="relative">
                    {/* Timeline Line */}
                    <div className="absolute left-[39px] top-4 bottom-4 w-px bg-gray-100 hidden md:block" />

                    <div className="space-y-12">
                        {filteredUpdates.map((update, index) => (
                            <div key={update.version} className="relative flex flex-col md:flex-row gap-6 md:gap-12 animate-in slide-in-from-bottom-4" style={{ animationDelay: `${index * 100}ms` }}>
                                {/* Timeline Node */}
                                <div className="hidden md:flex flex-col items-center z-10 shrink-0 w-[80px]">
                                    <div className="w-5 h-5 rounded-full border-[4px] border-white bg-rotary-blue shadow-sm mt-1" />
                                </div>

                                {/* Content */}
                                <div className="flex-1 space-y-4">
                                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                        <div className="space-y-1.5">
                                            <div className="flex items-center gap-3">
                                                <h3 className="text-xl font-black text-gray-900 tracking-tight">{update.version}</h3>
                                                <span className={`px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider border ${getTypeStyles(update.type)}`}>
                                                    {update.type}
                                                </span>
                                            </div>
                                            <h4 className="text-base font-bold text-gray-800">{update.title}</h4>
                                        </div>
                                        <div className="flex items-center gap-1.5 text-gray-400 bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-100 self-start md:self-auto">
                                            <Clock className="w-3.5 h-3.5" />
                                            <span className="text-[11px] font-bold uppercase tracking-wider">{update.date}</span>
                                        </div>
                                    </div>

                                    <div className="bg-gray-50/50 rounded-2xl border border-gray-100 p-5 space-y-3">
                                        {update.changes.map((change, i) => (
                                            <div key={i} className="flex gap-3">
                                                <div className="mt-0.5 flex-shrink-0">
                                                    {getChangeIcon(change.type)}
                                                </div>
                                                <p className="text-sm font-medium text-gray-600 leading-relaxed">
                                                    <span className="font-bold text-gray-900 uppercase text-[10px] tracking-wider mr-2 bg-white border border-gray-200 px-1.5 py-0.5 rounded shadow-sm">
                                                        {change.type}
                                                    </span>
                                                    {change.text}
                                                </p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        ))}

                        {filteredUpdates.length === 0 && (
                            <div className="py-12 text-center text-gray-500">
                                <Box className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                                <p className="font-medium text-lg">No se encontraron versiones</p>
                                <p className="text-sm">Intenta con otros términos de búsqueda.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SystemUpdates;
