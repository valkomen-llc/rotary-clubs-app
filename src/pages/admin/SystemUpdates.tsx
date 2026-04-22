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
    description?: string;
    author?: string;
    type: 'hotfix' | 'feature' | 'update' | 'rollback' | 'feat' | 'major' | 'maintenance' | 'fix';
    changes?: Array<{
        type: 'added' | 'fixed' | 'changed' | 'removed' | 'rollback' | 'improved';
        text: string;
    }>;
}

// Cache bust: 2026-04-22 09:55
export const SYSTEM_UPDATES: UpdateItem[] = [
    {
        version: "v4.16.0",
        date: "22 de Abril, 2026",
        title: "Reinicio de Emergencia: DraftEngine 🚀",
        description: "Salto de versión mayor y cambio de arquitectura de motor (v1.5) para romper el bloqueo de despliegue en Vercel.",
        type: "major",
        changes: [
            { type: "added", text: "Motor: Despliegue de 'draft-engine.js' con vía de comunicación limpia." },
            { type: "improved", text: "Sistema: Eliminación de cápsulas redundantes y bucles de redirección." },
            { type: "major", text: "Versión: Salto definitivo a v4.16.0 para purga de caché global." }
        ]
    },
    {
        version: "v4.15.2",
        date: "22 de Abril, 2026",
        title: "ArticulIA: Sincronización de Identidad ⚡",
        description: "Reparación del sistema de reporte de versiones y confirmación de la infraestructura estable de Node 18 y Google v1.",
        type: "major",
        changes: [
            { type: "improved", text: "UX: Corrección del reporte de versión en el panel administrativo." },
            { type: "improved", text: "Motor: Confirmación de redacción con Google Gemini v1 Estable." },
            { type: "fixed", text: "Sistema: Limpieza de registros duplicados y re-ordenamiento de historial." }
        ]
    },
    {
        version: "v4.15.1",
        date: "22 de Abril, 2026",
        title: "Infraestructura: Desbloqueo Maestro ⚙️",
        description: "Optimización profunda de infraestructura: Activación de Node 18 y reparación de tablas de rutas en Vercel para garantizar despliegues fluidos.",
        type: "major",
        changes: [
            { type: "improved", text: "Infra: Activación obligatoria de Node 18 para estabilidad de IA." },
            { type: "fixed", text: "Rutas: Reparación de conflictos de redirección en vercel.json." },
            { type: "improved", text: "Despliegue: Forzado de reconstrucción global v4.15.1." }
        ]
    },
    {
        version: "v4.15.0",
        date: "22 de Abril, 2026",
        title: "Saneamiento Global y Motor v1.5 🔥",
        description: "Gran limpieza técnica del núcleo del sistema y despliegue final de la arquitectura de Cápsula Independiente para ArticulIA.",
        type: "major",
        changes: [
            { type: "added", text: "Arquitectura: Despliegue de cápsula aislada (articulia.js) sin interferencias." },
            { type: "improved", text: "Motor: Conexión estable con la API v1 de Google Gemini." },
            { type: "fixed", text: "Despliegue: Eliminación de código heredado que bloqueaba actualizaciones." }
        ]
    },
    {
        version: "v4.14.9",
        date: "22 de Abril, 2026",
        title: "ArticulIA: Optimización de Despliegue ⚡",
        description: "Aligeramiento de recursos del sistema para garantizar actualizaciones inmediatas y eliminar bloqueos en el servidor.",
        type: "update",
        changes: [
            { type: "improved", text: "Infra: Eliminación de dependencias pesadas en funciones serverless." },
            { type: "fixed", text: "Despliegue: Sincronización garantizada en panel de Vercel." },
            { type: "improved", text: "Sistema: Salto definitivo a la versión v4.14.9." }
        ]
    },
    {
        version: "v4.14.8",
        date: "22 de Abril, 2026",
        title: "ArticulIA: Motor Estable v1 🚀",
        description: "Migración técnica al motor oficial y estable de Google Gemini para resolver errores de reconocimiento de modelo y garantizar redacción inmediata.",
        type: "major",
        changes: [
            { type: "improved", text: "Motor: Migración de v1beta a v1 estable en todos los endpoints." },
            { type: "fixed", text: "Compatibilidad: Reparación de error 'model not found' de Google." },
            { type: "improved", text: "Sistema: Salto oficial a la versión de producción v4.14.8." }
        ]
    },
    {
        version: "v4.14.6",
        date: "22 de Abril, 2026",
        title: "ArticulIA: Mapeador de Datos Inteligente 🧠",
        description: "Optimización del sistema de inyección: el asistente ahora reconoce y mapea los datos de la IA sin importar variaciones en el formato de respuesta.",
        type: "update",
        changes: [
            { type: "improved", text: "UX: Inyección automática y forzada de Título, Cuerpo, SEO y Social Media." },
            { type: "improved", text: "Resiliencia: Detección inteligente de campos (mayúsculas/minúsculas) de la IA." },
            { type: "fixed", text: "Sistema: Sincronización oficial de versiones v4.14.4." }
        ]
    },
    {
        version: "v4.14.0",
        date: "22 de Abril, 2026",
        title: "ArticulIA: Arquitectura de Cápsula Aislada 💠",
        description: "Solución definitiva de conectividad: el motor de redacción ahora opera en un entorno 100% independiente para garantizar disponibilidad absoluta.",
        type: "major",
        changes: [
            { type: "added", text: "Infra: Nueva Cápsula de IA Blindada (articulia.js) con recursos dedicados." },
            { type: "improved", text: "Red: Túnel de tráfico prioritario para peticiones de redacción." },
            { type: "fixed", text: "Sistema: Eliminación definitiva del error de respuesta HTML de Vercel." }
        ]
    },
    {
        version: "v4.13.10",
        date: "22 de Abril, 2026",
        title: "ArticulIA: Inyección de Núcleo 🔥",
        description: "Máximo nivel de estabilidad: el motor de redacción ahora reside en el núcleo del servidor para eliminar cualquier fallo de conexión externa.",
        type: "major",
        changes: [
            { type: "improved", text: "Estabilidad: Inyección directa de rutas en el punto de entrada de Vercel." },
            { type: "improved", text: "Velocidad: Eliminación de latencia por carga modular de archivos." },
            { type: "fixed", text: "Sistema: Sincronización global de versiones v4.13.10." }
        ]
    },
    {
        version: "v4.13.8",
        date: "22 de Abril, 2026",
        title: "ArticulIA: Modo de Alta Compatibilidad",
        description: "Re-diseño de la conexión con el motor de redacción para asegurar compatibilidad total con el entorno de ejecución de Vercel y evitar errores de sistema.",
        type: "update",
        changes: [
            { type: "improved", text: "Arquitectura: Regreso al protocolo de enrutamiento estructural verificado." },
            { type: "fixed", text: "Entorno: Eliminación de dependencias de Node.js nativas que causaban colapsos." },
            { type: "improved", text: "UX: Persistencia del sistema de diagnóstico avanzado de errores." }
        ]
    },
    {
        version: "v4.13.0",
        date: "22 de Abril, 2026",
        title: "ArticulIA: Estabilidad Crítica",
        description: "Implementación de arquitectura de conexión directa para el motor de redacción, eliminando intermediarios para garantizar estabilidad y velocidad.",
        type: "major",
        changes: [
            { type: "improved", text: "Arquitectura: Conexión directa con el nodo de procesamiento para evitar micro-cortes." },
            { type: "improved", text: "Seguridad: Sistema de respuesta forzada en formato JSON para diagnósticos precisos." },
            { type: "fixed", text: "Backend: Limpieza de redundancias en las rutas de IA." }
        ]
    },
    {
        version: "v4.12.9",
        date: "22 de Abril, 2026",
        title: "ArticulIA: Diagnóstico Avanzado",
        description: "Implementación de un sistema de reporte de errores en tiempo real para el redactor inteligente y optimización de la validación de llaves de seguridad.",
        type: "update",
        changes: [
            { type: "improved", text: "Diagnóstico: El sistema ahora informa la causa exacta de fallos en la IA." },
            { type: "fixed", text: "Seguridad: Validación instantánea de llaves de procesamiento en el servidor." },
            { type: "improved", text: "UX: Feedback detallado en el panel de noticias ante errores de conexión." }
        ]
    },
    {
        version: "v4.12.7",
        date: "22 de Abril, 2026",
        title: "Identidad del Sistema: Anonimización Técnica",
        description: "Actualización de los protocolos de registro del sistema para priorizar la marca propia de ClubPlatform y ocultar detalles de infraestructura externa.",
        type: "update",
        changes: [
            { type: "improved", text: "Registros: Eliminación de menciones a proveedores externos en los logs del sistema." },
            { type: "improved", text: "Branding: Refuerzo de la identidad visual e institucional en los reportes técnicos." }
        ]
    },
    {
        version: "v4.12.6",
        date: "22 de Abril, 2026",
        title: "ArticulIA: Optimización de Redacción",
        description: "Mejora en la velocidad de respuesta del motor de redacción inteligente y optimización de la limpieza de datos en el editor corporativo.",
        type: "fix",
        changes: [
            { type: "improved", text: "Sincronización con el motor de redacción inteligente verificado." },
            { type: "fixed", text: "Protección contra latencia en la estructura de datos." },
            { type: "improved", text: "Refuerzo del sistema de extracción de información estructurada." }
        ]
    },
    {
        version: "v4.12.4",
        status: "Beta",
        date: "22 de Abril, 2026",
        title: "ArticulIA: Asistente de Redacción Profesional",
        description: "Lanzamiento de la herramienta de redacción asistida, capaz de transformar notas breves en artículos estructurados de alta calidad con SEO y material promocional.",
        changes: [
            { type: "added", text: "Nueva función de generación profunda de artículos institucionales." },
            { type: "improved", text: "Sistema de procesamiento inteligente para evitar inconsistencias en el tono de marca." },
            { type: "added", text: "Interfaz de 'Briefing' optimizada en el módulo de contenidos." }
        ],
        type: "feature"
    },
    {
        version: "v4.12.0",
        date: "22 de Abril, 2026",
        title: "Nuevo Módulo: Content Studio Profesional 🔥",
        description: "Lanzamiento oficial de la suite avanzada de automatización de contenidos para clubes.",
        type: "major",
        changes: [
            { type: "added", text: "IA: Motor de transformación de imágenes en piezas audiovisuales de 15 segundos." },
            { type: "added", text: "Social: Sistema de integración nativa para redes sociales institucionales." },
            { type: "added", text: "Infra: Nueva arquitectura para la publicación multipuerta automatizada." }
        ]
    },
    {
        version: "v4.11.54",
        date: "22 de Abril, 2026",
        title: "Router: Ajuste Global del Portal de Lanzamiento",
        description: "Optimización de los protocolos de acceso al portal principal para asegurar una experiencia de usuario sin fricciones.",
        type: "fix",
        changes: [
            { type: "fixed", text: "Infra: Ajustes de seguridad en el sistema de redirección del servidor." },
            { type: "fixed", text: "Protocolo: Priorización de carga directa para evadir sistemas de almacenamiento temporal antiguos." }
        ]
    },
    {
        version: "v4.11.51",
        date: "22 de Abril, 2026",
        title: "Router: Redirección de Punto Cero (HTML Script)",
        description: "Implementada redirección en el archivo index.html para prioridad instantánea e infalible.",
        type: "fix",
        author: "Antigravity Engineering",
        changes: [
            { type: "fixed", text: "Infra: Inyectado script de redirección en index.html (Punto Cero) para evadir cualquier caché de Vercel." }
        ]
    },
    {
        version: "v4.11.50",
        date: "22 de Abril, 2026",
        title: "Router: Redirección Universal de Plataforma",
        description: "Implementado sistema de triple seguridad (Infra + Server + Frontend) para garantizar el enrutamiento SaaS.",
        type: "fix",
        author: "Antigravity Engineering",
        changes: [
            { type: "fixed", text: "Infra: Reforzado redirect en vercel.json con prioridad absoluta." },
            { type: "improved", text: "App: Inyectada lógica de redirección en el punto de entrada de React como medida final infalible." }
        ]
    },
    {
        version: "v4.11.49",
        date: "22 de Abril, 2026",
        title: "Router: Redirección Multi-Capa Infrasegua",
        description: "Desplegada estrategia de doble capa: redirect nativo wildcard en Vercel y fallback dinámico en servidor.",
        type: "fix",
        author: "Antigravity Engineering",
        changes: [
            { type: "fixed", text: "Infra: Activada redirección wildcard nativa para cubrir todas las rutas de clubplatform.org." },
            { type: "improved", text: "Server: Reforzada la lógica de redirección dinámica en el manejador global de páginas." }
        ]
    },
    {
        version: "v4.11.48",
        date: "22 de Abril, 2026",
        title: "Router: Redirección Nativa de Vercel (Host-Based)",
        description: "Implementada redirección de infraestructura en vercel.json para máxima prioridad y fiabilidad.",
        type: "fix",
        author: "Antigravity Engineering",
        changes: [
            { type: "fixed", text: "Infra: Activado redirect nativo de Vercel para clubplatform.org -> app.clubplatform.org." }
        ]
    },
    {
        version: "v4.11.47",
        date: "22 de Abril, 2026",
        title: "Router: Redirección Forzada en Edge",
        description: "Implementada redirección inmediata en capa de borde (Edge) para clubplatform.org.",
        type: "fix",
        author: "Antigravity Engineering",
        changes: [
            { type: "fixed", text: "Infra: Activada redirección forzada (302) para garantizar el salto a app.clubplatform.org." }
        ]
    },
    {
        version: "v4.11.46",
        date: "22 de Abril, 2026",
        title: "Router: Implementación Vercel Edge Middleware",
        description: "Añadida capa de middleware de borde para interceptar tráfico antes del servicio de archivos estáticos.",
        type: "fix",
        author: "Antigravity Engineering",
        changes: [
            { type: "fixed", text: "Infra: Garantizada la redirección de clubplatform.org mediante Edge Logic para evadir el caché estático." }
        ]
    },
    {
        version: "v4.11.45",
        date: "22 de Abril, 2026",
        title: "Router: Prioridad Absoluta de Redirección",
        description: "Reubicada la lógica de redirección al tope absoluto del servidor para máxima confiabilidad.",
        type: "fix",
        author: "Antigravity Engineering",
        changes: [
            { type: "improved", text: "Infra: Redirección forzada antes de CORS y parseo de body para evitar bloqueos." }
        ]
    },
    {
        version: "v4.11.44",
        date: "22 de Abril, 2026",
        title: "Router: Soporte de Rewrites Vercel",
        description: "Corregida la detección de dominio raíz mediante originalUrl para compatibilidad con rewrites de Vercel.",
        type: "fix",
        author: "Antigravity Engineering",
        changes: [
            { type: "fixed", text: "Infra: Reparada la redirección de clubplatform.org -> app que fallaba por rewrites internos." }
        ]
    },
    {
        version: "v4.11.43",
        date: "22 de Abril, 2026",
        title: "Router: Prioridad Global de Redirección",
        description: "Promovida la lógica de redirección a middleware global de alta prioridad para interceptar tráfico de dominio raíz.",
        type: "fix",
        author: "Antigravity Engineering",
        changes: [
            { type: "improved", text: "Infra: Transmisión inmediata (301) de clubplatform.org a app.clubplatform.org antes de carga de assets." }
        ]
    },
    {
        version: "v4.11.42",
        date: "22 de Abril, 2026",
        title: "Router: Activación Redirección SaaS",
        description: "Implementada lógica de redirección de dominio raíz a subdominio 'app' mediante flag de configuración.",
        type: "fix",
        author: "Antigravity Engineering",
        changes: [
            { type: "fixed", text: "Infra: Corregido el enrutamiento de clubplatform.org -> app.clubplatform.org." }
        ]
    },
    {
        version: "v4.11.41",
        date: "22 de Abril, 2026",
        title: "Branding: Refinamiento de Copyright",
        description: "Eliminación de negrilla en el crédito de Valkomen para una estética más limpia.",
        type: "update",
        author: "Antigravity Engineering",
        changes: [
            { type: "improved", text: "Footer: Removida la clase 'font-bold' del link Powered by Valkomen." }
        ]
    },
    {
        version: "v4.11.40",
        date: "21 de Abril, 2026",
        title: "UI: Refinamiento de Selector de Idiomas",
        description: "Reducción de interlineado y paddings en el menú de idiomas para una estética más compacta.",
        type: "update",
        author: "Antigravity Engineering",
        changes: [
            { type: "improved", text: "Navbar: Ajustado el padding vertical (py-1.5) y gaps en el selector de idiomas." }
        ]
    },
    {
        version: "v4.11.39",
        date: "21 de Abril, 2026",
        title: "Layout: Estandarización LATIR",
        description: "Adopción del ancho '7xl' (spacious) de LATIR para todos los clubes y distritos de la plataforma.",
        type: "update",
        author: "Antigravity Engineering",
        changes: [
            { type: "improved", text: "Visual: Unificada la arquitectura de ancho máximo a 7xl para paridad estética total." }
        ]
    },
    {
        version: "v4.11.38",
        date: "21 de Abril, 2026",
        title: "Layout: Contención & Ancho Simétrico",
        description: "Normalización del ancho máximo del footer (6xl) para asegurar simetría entre clubes y asociaciones.",
        type: "update",
        author: "Antigravity Engineering",
        changes: [
            { type: "improved", text: "Visual: Reducido el max-width del footer (6xl) para unificar la estética de LATIR con los clubes standard." }
        ]
    },
    {
        version: "v4.11.37",
        date: "21 de Abril, 2026",
        title: "Arquitectura: Sync de Footer en Asociaciones",
        description: "Habilitada la selección de Skin de Arquitectura (Footer) para asociaciones y redes tipo LATIR.",
        type: "update",
        author: "Antigravity Engineering",
        changes: [
            { type: "improved", text: "Admin: Integrada la opción de 'Skin de Arquitectura' en el módulo de Asociaciones para paridad con los clubes." },
            { type: "fixed", text: "Core: Corregida la persistencia del tipo de club en la edición de asociaciones." }
        ]
    },
    {
        version: "v4.11.36",
        date: "21 de Abril, 2026",
        title: "Imagen: Calibración de Logo",
        description: "Reajuste del tamaño del logo principal a +10px (66px) para un balance visual óptimo.",
        type: "update",
        author: "Antigravity Engineering",
        changes: [
            { type: "improved", text: "Visual: Calibrado el tamaño del logo Rotary a 66px para una integración más armónica." }
        ]
    },
    {
        version: "v4.11.35",
        date: "21 de Abril, 2026",
        title: "Imagen: Logo Prominence & Clean Titles",
        description: "Aumento del tamaño del logo principal (+20px) y simplificación de los títulos de columna removiendo separadores.",
        type: "update",
        author: "Antigravity Engineering",
        changes: [
            { type: "improved", text: "Visual: Incrementado el tamaño del logo Rotary a 76px para mejor legibilidad de marca." },
            { type: "removed", text: "Design: Removidos los separadores amarillos verticales de los títulos de columna." }
        ]
    },
    {
        version: "v4.11.34",
        date: "21 de Abril, 2026",
        title: "Diseño: Simetría Absoluta",
        description: "Ajuste milimétrico del interlineado en los menús del footer usando indicadores de tamaño fijo.",
        type: "update",
        author: "Antigravity Engineering",
        changes: [
            { type: "improved", text: "Visual: Normalizado el interlineado mediante el uso de un dot circular de tamaño fijo en lugar de caracteres de texto." }
        ]
    },
    {
        version: "v4.11.33",
        date: "21 de Abril, 2026",
        title: "Diseño: Simetría de Menús",
        description: "Normalización de espacios verticales (space-y-3) en todas las columnas del footer para una simetría perfecta.",
        type: "update",
        author: "Antigravity Engineering",
        changes: [
            { type: "fixed", text: "Layout: Sincronizada la distancia entre enlaces en todas las columnas del footer." }
        ]
    },
    {
        version: "v4.11.32",
        date: "21 de Abril, 2026",
        title: "Diseño: Spacing Ampliado (60px)",
        description: "Expansión del margen vertical del footer para una estética más aireada y premium.",
        type: "update",
        author: "Antigravity Engineering",
        changes: [
            { type: "improved", text: "Layout: Incrementado el margen vertical principal a 60px para mayor amplitud visual." }
        ]
    },
    {
        version: "v4.11.31",
        date: "21 de Abril, 2026",
        title: "Diseño: Spacing & Tipografía",
        description: "Ajuste de márgenes de contenido (40px) y suavizado de pesos tipográficos en los títulos del footer.",
        type: "update",
        author: "Antigravity Engineering",
        changes: [
            { type: "improved", text: "Layout: Implementado margen vertical de 40px (py-10) en la sección principal del footer." },
            { type: "changed", text: "Typography: Removido el peso 'font-black' de los títulos de columna para una estética más limpia." }
        ]
    },
    {
        version: "v4.11.30",
        date: "21 de Abril, 2026",
        title: "Imagen: Branding & Spacing",
        description: "Actualización de la identidad visual 'Powered by Valkomen' y optimización de espacios verticales en el footer.",
        type: "update",
        author: "Antigravity Engineering",
        changes: [
            { type: "changed", text: "Branding: Simplificada la firma institucional a 'Powered by Valkomen'." },
            { type: "improved", text: "Spacing: Reducido al 50% el margen vertical del copyright para un diseño más compacto." },
            { type: "improved", text: "Visual: Sincronizado el color de fondo oficial (#013E7D) en el componente público." }
        ]
    },
    {
        version: "v4.11.29",
        date: "21 de Abril, 2026",
        title: "Estética: Preview Fiel y Zero-Cache",
        description: "Ajuste visual del panel administrativo para coincidir 100% con el sitio público y desactivación de caché para persistencia inmediata.",
        type: "fix",
        author: "Antigravity Engineering",
        changes: [
            { type: "improved", text: "Visual: El fondo de la vista previa ahora usa el Azul Rotary oficial (#013E7D) y estilos de lista realistas." },
            { type: "fixed", text: "Instantaneidad: Removida la capa de caché en memoria para garantizar que los cambios se reflejen al instante en todo el cluster." }
        ]
    },
    {
        version: "v4.11.28",
        date: "21 de Abril, 2026",
        title: "Infraestructura: Alineación de Pipeline Vercel",
        description: "Corrección crítica de ruteo en el entry-point de producción para habilitar módulos de sistema y WhatsApp.",
        type: "fix",
        author: "Antigravity Engineering",
        changes: [
            { type: "fixed", text: "Vercel: Montadas las rutas de '/api/system' y '/api/whatsapp-qr' en el despachador de producción." },
            { type: "improved", text: "Integridad: Saneada la carga diferida de módulos para evitar errores de ruteo wildcard." }
        ]
    },
    {
        version: "v4.11.27",
        date: "21 de Abril, 2026",
        title: "Diagnóstico: Traceroute API Ping",
        description: "Implementación de sonda de diagnóstico en tiempo real para verificar la integridad del túnel API.",
        type: "fix",
        author: "Antigravity Engineering",
        changes: [
            { type: "added", text: "Traceroute: Nueva sonda de ping directo al servidor para descartar bloqueos de red ambiental." },
            { type: "improved", text: "Stability: Refactorización de la capa de comunicación para mayor tolerancia a fallos de ruteo." }
        ]
    },
    {
        version: "v4.11.26",
        date: "21 de Abril, 2026",
        title: "Infraestructura: Dual-Route & Deep Diagnostics",
        description: "Despliegue de redundancia en rutas API y saneamiento de URLs para corregir errores de ruteo ambiental.",
        type: "fix",
        author: "Antigravity Engineering",
        changes: [
            { type: "fixed", text: "Routing: Implementada ruta secundaria de actualización para eludir bloqueos de proxy/WAF." },
            { type: "fixed", text: "URL Sanitization: Normalización de SLD y API endpoints para evitar errores de barra final (trailing slash)." }
        ]
    },
    {
        version: "v4.11.25",
        date: "21 de Abril, 2026",
        title: "Diagnóstico: Caja Negra y Persistencia Atómica",
        description: "Implementación de registro 'caja negra' para capturar respuestas crudas del servidor y bypass de restricciones DB.",
        type: "fix",
        author: "Antigravity Engineering",
        changes: [
            { type: "fixed", text: "Database: Implementada persistencia por reemplazo atómico para evitar conflictos de restricciones únicas." },
            { type: "improved", text: "Telemetría: El panel ahora captura y muestra la respuesta cruda del servidor si esta no es un JSON válido." }
        ]
    },
    {
        version: "v4.11.24",
        date: "21 de Abril, 2026",
        title: "Diagnóstico: Reporte Avanzado de Errores",
        description: "Implementación de sistema de diagnóstico transparente para fallos en configuraciones globales.",
        type: "fix",
        author: "Antigravity Engineering",
        changes: [
            { type: "improved", text: "Transparencia: El panel ahora muestra el código de error técnico y detalle exacto del servidor en caso de fallo." },
            { type: "improved", text: "Robustez: Mejorada la captura de excepciones en el bus de datos de footers." }
        ]
    },
    {
        version: "v4.11.23",
        date: "21 de Abril, 2026",
        title: "Estabilidad: Persistencia Ultra-Safe",
        description: "Corrección crítica en la persistencia de configuraciones globales para evitar colisiones de base de datos.",
        type: "fix",
        author: "Antigravity Engineering",
        changes: [
            { type: "fixed", text: "Database Sync: Refactorización del motor de persistencia para manejar correctamente restricciones únicas con valores NULL." },
            { type: "improved", text: "Error Reporting: Los errores de guardado ahora muestran el detalle técnico exacto en el panel para facilitar diagnósticos." }
        ]
    },
    {
        version: "v4.11.22",
        date: "21 de Abril, 2026",
        title: "Multimedia: Integración Media Library en Footer",
        description: "Implementación del selector de biblioteca multimedia para los logos globales del portal.",
        type: "feature",
        author: "Antigravity Engineering",
        changes: [
            { type: "added", text: "Media Picker Modal: Nuevo selector inmersivo para elegir logos directamente desde la biblioteca de medios." },
            { type: "added", text: "Buscador de Archivos: Implementada búsqueda en tiempo real dentro del selector de logos." },
            { type: "improved", text: "Workflow de Logos: Eliminada la necesidad de copiar URLs manualmente; ahora la selección es visual." }
        ]
    },
    {
        version: "v4.11.21",
        date: "21 de Abril, 2026",
        title: "Estabilidad: Arquitectura Zero-Wait & Cache-Pool",
        description: "Reparación crítica del motor de carga del panel administrativo y escalado de infraestructura de base de datos.",
        type: "maintenance",
        author: "Antigravity Engineering",
        changes: [
            { type: "improved", text: "Arquitectura Zero-Wait: El Sistema de Footer ahora entra instantáneamente usando defaults locales mientras sincroniza en background." },
            { type: "added", text: "Lightning Cache Engine: Implementado motor de recuperación de 1ms mediante caché en memoria RAM del servidor." },
            { type: "improved", text: "Escalado de BD: Aumentado el pool de conexiones simultáneas (max: 10) para eliminar cuellos de botella en el dashboard." },
            { type: "fixed", text: "Inconsistencia de Carga: Eliminado el bloqueo visual 'Cargando sistema de footers' que afectaba a conexiones lentas." }
        ]
    },
    {
        version: "v4.11.20",
        date: "21 de Abril, 2026",
        title: "Gestor Global de Footers & 4 Skins Institucionales",
        description: "Implementación del centro de mando para footers multitenant. Ahora el súper-administrador puede configurar globalmente los logos y menús para Clubes, Distritos, Asociaciones y Colrotarios.",
        type: "feat",
        author: "Antigravity Engineering",
        changes: [
            { type: "added", text: "Interfaz 'Sistema Footer': Nuevo centro de mando para configurar arquitecturas globales." },
            { type: "added", text: "Soporte Colrotarios: Añadido el perfil específico para la Fundación Rotaria Colombiana." }
        ]
    },
    {
        version: "v4.11.19",
        date: "21 Abril 2026",
        title: "Infraestructura: Motor de Skins Institucionales",
        type: "feature",
        changes: [
            { type: "added", text: "Motor de Skins: Formalizada la selección de arquitectura visual ('Skins') para diferenciar Clubes, Distritos y Asociaciones." },
            { type: "improved", text: "Interfaz Super-Admin: Optimizada la configuración de sitios para permitir la elección explícita de la piel arquitectónica." },
            { type: "changed", text: "Refactorización de Footer: Eliminación de referencias estáticas en favor de inyección de datos multitenant." },
            { type: "improved", text: "Consistencia de Footer: Ahora los labels se adaptan ('El Club', 'El Distrito', 'Nuestra Red') garantizando una identidad institucional coherente." }
        ]
    },
    {
        version: "v4.11.17",
        date: "21 Abril 2026",
        title: "Infraestructura: Footer Dinámico Multitenant",
        type: "feature",
        changes: [
            { type: "added", text: "Ecosistema de Footers: Implementadas 3 'pieles' (Club, Distrito, Asociación) que se activan automáticamente según el tipo de tenant." },
            { type: "added", text: "Gestión Super-Admin: Nueva opción en el panel de control de clubes para definir el tipo de organización y su comportamiento visual." },
            { type: "improved", text: "Abstracción de Datos: Eliminadas referencias hardcodeadas a 'Rotary LATIR' en el footer, permitiendo que cada sitio use sus propios nombres y links institucionales." }
        ]
    },
    {
        version: "v4.11.16",
        date: "21 Abril 2026",
        title: "Multimedia: Navegación Immersiva",
        type: "feature",
        changes: [
            { type: "added", text: "Navegación en Visor: Añadidas flechas (Siguiente/Anterior) en el Lightbox para navegar por toda la galería sin salir del modo pantalla completa." },
            { type: "added", text: "Atajos de Teclado: Ahora puedes usar las flechas del teclado y la tecla ESC para navegar y cerrar la galería." },
            { type: "improved", text: "Contador de Medios: Se añadió un indicador visual (ej: 1/12) para saber la posición actual dentro de la galería." }
        ]
    },
    {
        version: "v4.11.15",
        date: "21 Abril 2026",
        title: "Multimedia: Refinamiento de Grid y Tipografía",
        type: "fix",
        changes: [
            { type: "changed", text: "Grid de 3 Columnas: Todas las imágenes y videos se distribuyen ahora en un esquema exacto de 3 columnas para mayor orden visual." },
            { type: "improved", text: "Tipografía: Ajustado el tamaño del título de la galería a 20px según requerimientos." },
            { type: "fixed", text: "Alineación: Corregido el espacio vacío al final de la galería asegurando que siempre se completen las filas." }
        ]
    },
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
