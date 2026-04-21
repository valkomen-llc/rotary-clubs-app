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

// Cache bust: 2026-04-20 19:25
export const SYSTEM_UPDATES: UpdateItem[] = [
    {
        version: "v4.11.14",
        date: "21 Abril 2026",
        title: "Multimedia: Galería Adaptativa y Multi-Video",
        type: "feature",
        changes: [
            { type: "added", text: "Nueva Galería Bento: Adaptación automática a diferentes formatos de imagen." },
            { type: "added", text: "Soporte Multi-Video: Ahora puedes agregar múltiples videos de YouTube/Vimeo por noticia." },
            { type: "added", text: "Lightbox Inmersivo: Visualización de fotos y videos en pantalla completa con transiciones fluidas." },
            { type: "improved", text: "Admin: Nueva pestaña de gestión multimedia para colecciones mixtas de foto y video." }
        ]
    },
    {
        version: "v4.11.13",
        date: "21 Abril 2026",
        title: "Estabilidad: Supervivencia de Enlaces y SEO",
        type: "fix",
        changes: [
            { type: "fixed", text: "Corregido el error 'Error loading page' cuando se accede desde Facebook con parámetros fbclid." },
            { type: "added", text: "Implementada lógica de 'Supervivencia SEO': Si la inyección de metadatos falla, el sitio carga el contenido normal sin colapsar." },
            { type: "changed", text: "Optimización del motor de rutas para ignorar parámetros de rastreo externos en la búsqueda de artículos." }
        ]
    },
    {
        version: "v4.11.12",
        date: "21 Abril 2026",
        title: "Comunidad: Engagement Global de Grupos",
        type: "feature",
        changes: [
            { type: "added", text: "Nuevo campo 'Frase para Grupos (CTA)' para mensajes personalizados en grupos internacionales." },
            { type: "added", text: "Motor de IA 'Embajador Global' para sugerir CTAs en otros idiomas y contextos rotarios." },
            { type: "fixed", text: "Lógica de persistencia optimizada para campos multi-mensaje en redes sociales." },
            { type: "changed", text: "Mejora visual en la pestaña de Redes con campo destacado para alcance comunitario." }
        ]
    },
    {
        version: "v4.11.11",
        date: "21 Abril 2026",
        title: "IA: Motor de Copy de Alta Precisión",
        type: "feature",
        changes: [
            { type: "changed", text: "Optimización profunda del prompt de IA para generar copys sociales vinculados al contenido del blog." },
            { type: "added", text: "Lógica de 'teaser persuasivo' para aumentar el CTR (Click-Through Rate) desde redes sociales." },
            { type: "fixed", text: "Mejora en la detección de detalles clave de la noticia para evitar mensajes genéricos." }
        ]
    },
    {
        version: "v4.11.10",
        date: "21 Abril 2026",
        title: "Social: Centro de Optimización Multiplataforma",
        type: "feature",
        changes: [
            { type: "added", text: "Nueva pestaña de 'Redes Sociales' para optimización independiente de Facebook y LinkedIn." },
            { type: "added", text: "Generador de micro-blogging con IA integrado en el flujo de publicación." },
            { type: "added", text: "Previsualización real del post en Facebook y LinkedIn dentro del editor." },
            { type: "changed", text: "Migración de la herramienta de Imagen Social Personalizada a la nueva pestaña de Redes." },
            { type: "fixed", text: "Auto-curación de base de datos para el nuevo campo de copy estratégico." }
        ]
    },
    {
        version: "v4.11.9",
        date: "21 Abril 2026",
        title: "SEO: URLs Limpias y Previsualización Dinámica",
        type: "major",
        changes: [
            { type: "changed", text: "Migración de HashRouter a BrowserRouter para habilitar URLs limpias y profesionales." },
            { type: "added", text: "Implementación de Inyección Dinámica de Metadatos (SSR-Lite) para previsualización en Facebook/WhatsApp." },
            { type: "added", text: "Manejo de redirecciones automáticas de enlaces antiguos con '#' para no perder tráfico anterior." },
            { type: "fixed", text: "Corrección de la 'ceguera' de los rastreadores en artículos individuales del blog." }
        ]
    },
    {
        version: "v4.11.8",
        date: "21 Abril 2026",
        title: "Arquitectura: Auto-Heal Gen-2",
        type: "maintenance",
        changes: [
            { type: "changed", text: "Ampliación de la lógica auto-curativa para cubrir consultas iniciales de Prisma (findUnique)." },
            { type: "fixed", text: "Parcheo preventivo del esquema de base de datos incluso antes del guardado." }
        ]
    },
    {
        version: "v4.11.7",
        date: "21 Abril 2026",
        title: "Arquitectura: Sistema Auto-Curativo",
        type: "maintenance",
        changes: [
            { type: "added", text: "Implementación de lógica auto-curativa que detecta columnas faltantes y las crea automáticamente (Auto-Migration)." },
            { type: "fixed", text: "Resolución definitiva del error 'seoImage does not exist' mediante parcheo en tiempo real." },
            { type: "changed", text: "Optimización de la comunicación entre Prisma y la base de datos de producción." }
        ]
    },
    {
        version: "v4.11.6",
        date: "21 Abril 2026",
        title: "Diagnóstico: Errores Transparentes",
        type: "hotfix",
        changes: [
            { type: "added", text: "Mejora en la visualización de errores para mostrar detalles técnicos del servidor en el panel." },
            { type: "fixed", text: "Preparación para sincronización de columnas de base de datos faltantes." }
        ]
    },
    {
        version: "v4.11.5",
        date: "21 Abril 2026",
        title: "Arquitectura: Estabilidad Crítica",
        type: "maintenance",
        changes: [
            { type: "changed", text: "Migración completa del motor de guardado de noticias de SQL crudo a Prisma para máxima fiabilidad." },
            { type: "fixed", text: "Corregido error que dejaba el botón de guardado en estado infinito (Guardando...)." },
            { type: "added", text: "Mejora en los mensajes de error del panel administrativo para diagnosticar fallos de red." }
        ]
    },
    {
        version: "v4.11.4",
        date: "21 Abril 2026",
        title: "Motor de IA: Precisión SEO",
        type: "hotfix",
        changes: [
            { type: "fixed", text: "Ajuste estricto en el prompt de IA para limitar la Meta Descripción a 155 caracteres." },
            { type: "changed", text: "Refuerzo de las 'Reglas de Oro' en el sistema para evitar truncamiento en Google." }
        ]
    },
    {
        version: "v4.11.3",
        date: "21 Abril 2026",
        title: "Salud SEO: Contadores Inteligentes",
        type: "feature",
        changes: [
            { type: "added", text: "Indicadores visuales en tiempo real para Título SEO (60 carac.) y Meta Descripción (160 carac.)." },
            { type: "added", text: "Alertas críticas cuando el contenido excede los límites de truncamiento de Google." },
            { type: "changed", text: "Mejora visual en la pestaña de SEO con tarjetas de estado dinámicas." }
        ]
    },
    {
        version: "v4.11.2",
        date: "21 Abril 2026",
        title: "Estabilidad: Persistencia SEO",
        type: "hotfix",
        changes: [
            { type: "fixed", text: "Blindaje del backend para asegurar el guardado de noticias incluso con campos SEO incompletos." },
            { type: "changed", text: "Mejora en la robustez de las consultas raw de base de datos para evitar errores de red." }
        ]
    },
    {
        version: "v4.11.1",
        date: "21 Abril 2026",
        title: "Motor de IA: Hotfix SEO",
        type: "hotfix",
        changes: [
            { type: "fixed", text: "Corregido prompt del sistema para obligar a la IA a devolver Keywords y Tags." }
        ]
    },
    {
        version: "v4.11.0",
        date: "21 Abril 2026",
        title: "SEO Social: Imagen Independiente",
        type: "feature",
        changes: [
            { type: "added", text: "Nueva opción para subir una imagen de previsualización (OpenGraph) diferente a la portada del artículo." },
            { type: "changed", text: "Actualización de previsualización SEO para mostrar en tiempo real la imagen social personalizada." },
            { type: "fixed", text: "Sincronización de base de datos para persistir metadatos de imágenes SEO." }
        ]
    },
    {
        version: "v4.10.0",
        date: "21 Abril 2026",
        title: "Maestría en SEO & UX: Interfaz Dual",
        type: "update",
        changes: [
            { type: "changed", text: "Reestructuración total de la pestaña SEO: Diseño en dos columnas para mayor eficiencia." },
            { type: "added", text: "Generación automática de Keywords y Tags mediante IA para todas las noticias." },
            { type: "fixed", text: "Sincronización de versiones para asegurar la carga inmediata de optimizaciones." }
        ]
    },
    {
        version: "v4.9.0",
        date: "20 Abril 2026",
        title: "Motor de IA: SEO Autónomo",
        type: "feature",
        changes: [
            { type: "added", text: "Nueva integración de IA para automatizar metadatos SEO (Título, Descripción y Slug)." },
            { type: "added", text: "Botón 'Redactar con IA' en el editor de noticias para optimización en un clic." },
            { type: "changed", text: "Despliegue de infraestructura backend para sugerencias contextuales de contenido." }
        ]
    },
    {
        version: "v4.8.7",
        date: "20 Abril 2026",
        title: "News URL Slug Engine (Final Polish)",
        type: "update",
        changes: [
            { type: "changed", text: "Promoción del campo 'Slug' a la parte superior derecha (Pestaña SEO) para acceso inmediato." },
            { type: "added", text: "Estilización mejorada: Fondo resaltado (light gray) y fuente monoespaciada para el slug." },
            { type: "fixed", text: "Corrección de visibilidad: Eliminada la necesidad de scroll para encontrar el ajuste de URL." }
        ]
    },
    {
        version: "v4.8.6",
        date: "20 Abril 2026",
        title: "News URL Slug Engine",
        type: "feature",
        changes: [
            { type: "added", text: "Implementación de campo 'Slug' personalizado en ajustes SEO de noticias." },
            { type: "added", text: "Nueva función de generación automática de slug amigable desde el título." },
            { type: "added", text: "Ruteo dinámico: el blog ahora resuelve artículos tanto por ID como por Slug personalizado." },
            { type: "changed", text: "Mejora de interfaz SEO: El campo de slug se posicionó junto al título para acceso rápido." }
        ]
    },
    {
        version: "v4.8.5",
        date: "20 Abril 2026",
        title: "News Cover Image Engine Refinement",
        type: "update",
        changes: [
            { type: "changed", text: "Refactorización del CropModal a componente aislado para mayor estabilidad de estado." },
            { type: "added", text: "Mejora de visibilidad: Recuadro de recorte con borde de alto contraste (Rotary Blue)." },
            { type: "added", text: "Nuevos controles de rotación (0-360°) y visualización de zoom en el editor." },
            { type: "added", text: "Sistema de Image Proxy en Media Hub para evitar bloqueos de CORS al re-recortar imágenes." }
        ]
    },
    {
        version: "v4.8.4",
        date: "20 Abril 2026",
        title: "Advanced Blog Image Cropping Engine",
        type: "feature",
        changes: [
            { type: "added", text: "Integración de react-easy-crop para el manejo preciso de portadas en noticias." },
            { type: "added", text: "Nueva interfaz de recorte (CropModal) con controles de zoom y aspect ratio 16:6." },
            { type: "changed", text: "Flujo de subida optimizado: las imágenes se recortan localmente antes de la persistencia en el servidor." },
            { type: "added", text: "Botón de re-encuadre rápido en la previsualización de imágenes existentes." }
        ]
    },
    {
        version: "v4.8.3",
        date: "20 Abril 2026",
        title: "Member Directory Reordering Engine",
        type: "feature",
        changes: [
            { type: "added", text: "Herramienta de reordenamiento visual (Drag & Drop) para socios del club." },
            { type: "added", text: "Nueva columna de posición en base de datos para persistencia del orden personalizado." },
            { type: "changed", text: "Sincronización total del orden del backend con las vistas públicas de Socios y Junta Directiva." }
        ]
    },
    {
        version: "v4.8.2",
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
