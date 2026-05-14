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
    type: 'hotfix' | 'feature' | 'update' | 'rollback' | 'feat' | 'major' | 'maintenance' | 'fix' | 'improvement' | 'bugfix' | 'urgent' | 'patch';
    changes?: Array<{
        type: 'added' | 'fixed' | 'changed' | 'removed' | 'rollback' | 'improved' | 'major' | 'fix';
        text: string;
    }>;
    details?: string[];
}

// DISTRICT HEALTH IQ V4.190 | 2026-05-13 (EMAIL PERSISTENCE 📧)
// Cache bust: 2026-05-13 15:45 (EMAIL DB WIRED 🔌)
export const SYSTEM_UPDATES: UpdateItem[] = [
    {
        version: 'v4.296',
        date: '2026-05-14',
        title: 'Recuperación: Restauración de Estado Maestro 🛡️',
        description: 'Reversión absoluta a la arquitectura probada y estable para reactivar la plataforma.',
        type: 'major',
        details: [
            'Restauración total de api/index.js original con motor de SEO e inyección.',
            'Reversión de vercel.json a las reglas de enrutamiento estables de v4.282.',
            'Restauración del motor de base de datos y controladores de clubes originales.',
            'Eliminación de cualquier bloqueo de red en dominios externos .org.',
            'Garantía de disponibilidad inmediata para todos los clubes de la red.'
        ]
    },
    {
        version: 'v4.295',
        date: '2026-05-14',
        title: 'Sistema: Estabilización Maestra de Rutas 🛰️',
        description: 'Corrección definitiva del enrutamiento Vercel para reactivar todos los sitios.',
        type: 'major',
        details: [
            'Implementación de Regex de enrutamiento avanzado para separar API de Frontend.',
            'Priorización absoluta de peticiones de datos de clubes sobre archivos estáticos.',
            'Eliminación del conflicto que causaba el estado "Cargando Club" permanente.',
            'Restauración de la comunicación bidireccional entre dominios .org y la base de datos.',
            'Optimización del puente api/index.js para respuestas en milisegundos.'
        ]
    },
    {
        version: 'v4.294',
        date: '2026-05-14',
        title: 'Estabilización: Reversión de Seguridad 🛡️',
        description: 'Restauración del núcleo estable del sistema para garantizar la carga de todos los sitios.',
        type: 'major',
        details: [
            'Reversión quirúrgica a la arquitectura de conexión estable (Safe Mode).',
            'Eliminación de la complejidad en db.js para restaurar carga inmediata.',
            'Sincronización total de Prisma y PG Pool bajo el modelo singleton original.',
            'Corrección definitiva del estado "Cargando Club" en dominios .org.',
            'Mantenimiento de los 60s para IA en un entorno de ejecución blindado.'
        ]
    },
    {
        version: 'v4.293',
        date: '2026-05-14',
        title: 'Arquitectura: Optimización de Conexiones Prisma 💎',
        description: 'Eliminación del bloqueo de carga mediante separación de clientes de base de datos.',
        type: 'major',
        details: [
            'Separación de Prisma Client y PG Pool para evitar colisiones en Vercel.',
            'Incremento del tiempo de espera de conexión a 10s para despertar a Neon DB.',
            'Refactorización del controlador de dominios para carga prioritaria.',
            'Eliminación del estado de espera infinito en colrotarios.org y otros dominios.',
            'Mejora en la estabilidad de las peticiones públicas de alta demanda.'
        ]
    },
    {
        version: 'v4.292',
        date: '2026-05-14',
        title: 'Emergencia: Reactivación de Ecosistema 🆘',
        description: 'Intervención crítica para restaurar la carga de todos los sitios web de la red.',
        type: 'major',
        details: [
            'Reestructuración total de vercel.json para forzar el enrutamiento público.',
            'Eliminación de bloqueos en el puente de API para carga instantánea de clubes.',
            'Forzado de recompilación limpia mediante Cache Bust en producción.',
            'Sincronización de dominios externos (colrotarios.org, cluborigen.org).',
            'Restauración de la visibilidad de contenidos multimedia y textos institucionales.'
        ]
    },
    {
        version: 'v4.291',
        date: '2026-05-14',
        title: 'Servicios: Restauración de Sitios Públicos 🚀',
        description: 'Corrección de la conexión a la base de datos Neon y reactivación de dominios externos.',
        type: 'major',
        details: [
            'Estabilización de la conexión con Neon DB para eliminar el estado "Cargando Club".',
            'Sincronización de variables de entorno para soporte total en Vercel Serverless.',
            'Optimización del tiempo de espera de conexión para inicios en frío (Cold Starts).',
            'Restauración de la carga de imágenes, textos y videos en todos los sitios .org.',
            'Garantía de persistencia para el enrutamiento de dominios personalizados.'
        ]
    },
    {
        version: 'v4.290',
        date: '2026-05-14',
        title: 'IA: Purgado de Identidad y Estabilidad de Red 🛠️',
        description: 'Eliminación total de KIE.ai y optimización de la conexión a la biblioteca multimedia.',
        type: 'fix',
        details: [
            'Eliminación de todas las menciones a "KIE.ai" y sustitución por OpenAI DALL-E 3 HD.',
            'Optimización de la conexión a la base de datos para entornos serverless (Vercel).',
            'Corrección del estado "Cargando biblioteca..." mediante simplificación de variables de entorno.',
            'Refuerzo de la identidad visual del Content Studio para reflejar tecnología de punta.',
            'Mejora en la resiliencia de la biblioteca global para administradores del sistema.'
        ]
    },
    {
        version: 'v4.289',
        date: '2026-05-14',
        title: 'Biblioteca: Acceso Total Multi-Sitio 🌍',
        description: 'Apertura completa de la biblioteca multimedia para administradores globales.',
        type: 'feature',
        details: [
            'Eliminación de filtros por Club ID: Ahora el Administrador ve TODO el contenido de la plataforma.',
            'Carga masiva de medios de todos los sitios registrados en Club Platform.',
            'Sincronización de rutas /api en Vercel para evitar pérdida de subdirectorios.',
            'Mejora en la velocidad de indexación de la biblioteca global.',
            'Garantía de visibilidad para imágenes institucionales y de proyectos compartidos.'
        ]
    },
    {
        version: 'v4.288',
        date: '2026-05-14',
        title: 'Infraestructura: Restauración de Enrutamiento 🌐',
        description: 'Corrección de errores 404 y reconexión total de la biblioteca de medios.',
        type: 'maintenance',
        details: [
            'Implementación de reglas de Rewrites para soporte total de navegación SPA.',
            'Conexión garantizada del endpoint /api con el puente api/index.js.',
            'Eliminación de errores 404 NOT_FOUND en refrescos de página.',
            'Restauración de la carga de imágenes en la biblioteca del Content Studio.',
            'Mantenimiento de los límites extendidos de ejecución para IA (60s).'
        ]
    },
    {
        version: 'v4.287',
        date: '2026-05-14',
        title: 'Biblioteca: Restauración de Visibilidad Global 🖼️',
        description: 'Corrección del motor de búsqueda de medios para administradores del sistema.',
        type: 'fix',
        details: [
            'Habilitación de vista global de imágenes para Super Administradores.',
            'Eliminación del filtro restrictivo de Club ID en la biblioteca de medios.',
            'Optimización de la consulta SQL para carga instantánea de miniaturas.',
            'Mejora en la resiliencia de la conexión entre el Content Studio y el repositorio.',
            'Corrección de visualización de carpetas compartidas en el ecosistema rotario.'
        ]
    },
    {
        version: 'v4.286',
        date: '2026-05-14',
        title: 'Sistema: Estabilización de Despliegue v2 🛰️',
        description: 'Corrección estructural de rutas de Vercel y registro de servicios de IA.',
        type: 'maintenance',
        details: [
            'Creación de puente api/index.js para cumplimiento de arquitectura Vercel.',
            'Sincronización de rutas del Content Studio en el servidor principal.',
            'Corrección de patrón de funciones en vercel.json para detectar server.js.',
            'Eliminación de errores 404 en el endpoint de generación de publicaciones.',
            'Optimización de la cadena de despliegue para procesos de IA pesados.'
        ]
    },
    {
        version: 'v4.285',
        date: '2026-05-14',
        title: 'Infraestructura: Restauración de Producción 📡',
        description: 'Corrección de errores críticos en la configuración de despliegue de Vercel.',
        type: 'maintenance',
        details: [
            'Restauración del modo "Zero Config" de Vercel para garantizar la carga del frontend.',
            'Corrección del archivo vercel.json para evitar conflictos de compilación.',
            'Actualización de la interfaz de actualizaciones para soporte total de TypeScript.',
            'Bypass de caché de construcción para una instalación limpia en el servidor.',
            'Optimización de tiempos de espera para IA mantenida bajo nueva estructura.'
        ]
    },
    {
        version: 'v4.284',
        date: '2026-05-14',
        title: 'Sistema: Optimización Rayo de IA ⚡',
        description: 'Mejora radical de los tiempos de carga y prevención de congelamientos.',
        type: 'improvement',
        details: [
            'Ampliación del tiempo de ejecución del servidor a 60 segundos (Vercel maxDuration).',
            'Reducción del payload de imagen a 500px para análisis instantáneo de GPT-4o.',
            'Aumento de la memoria asignada a procesos de IA (1024MB) para mayor fluidez.',
            'Optimización de la cadena de peticiones para reducir la latencia inicial.',
            'Mejora en la gestión de timeouts en conexiones pesadas de DALL-E 3 HD.'
        ]
    },
    {
        version: 'v4.283',
        date: '2026-05-14',
        title: 'IA: Outpainting Cinematográfico 4K 🎬',
        description: 'Restauración del motor de recreación profunda para conversiones Portrait sin recortes.',
        type: 'feature',
        details: [
            'Habilitación de lienzo Vertical Nativo (1024x1792) para expansión de fondo real.',
            'Refuerzo del prompt cinematográfico para evitar pixelación y mejorar nitidez.',
            'Activación forzada de DALL-E 3 HD para resultados listos para impresión y redes.',
            'Mejora en la detección de bordes para una recreación coherente de cielo y suelo.',
            'Optimización de la composición institucional para mantener integridad de rostros.'
        ]
    },
    {
        version: 'v4.282',
        date: '2026-05-14',
        title: 'Sistema: Blindaje de Base de Datos 🛡️',
        description: 'Eliminación de errores críticos por falta de identificación de club.',
        type: 'fix',
        details: [
            'Implementación de validación Null-Safety para consultas de Prisma.',
            'Fallback institucional automático cuando no se detecta un Club ID.',
            'Refuerzo del motor de generación para administradores globales.',
            'Eliminación de paradas críticas en el flujo de análisis visual.',
            'Mejora en la resiliencia de la conexión entre el Content Studio y el CRM.'
        ]
    },
    {
        version: 'v4.281',
        date: '2026-05-14',
        title: 'IA: Outpainting Portrait y Descarga Directa 🚀',
        description: 'Corrección de errores de descarga y optimización de formato para el muro (Feed).',
        type: 'fix',
        details: [
            'Implementación de Proxy de Descarga para eliminar errores de seguridad (CORS).',
            'Ajuste de formato Portrait (4:5) para Facebook, Instagram y LinkedIn.',
            'Refuerzo del motor de Outpainting para evitar recortes y priorizar la recreación de fondos.',
            'Optimización de la vista previa para reflejar el formato real de publicación en el muro.',
            'Sincronización de reglas de storytelling profesional en el motor de generación.'
        ]
    },
    {
        version: 'v4.280',
        date: '2026-05-14',
        title: 'IA: Motor Profesional de Redes Sociales 📊',
        description: 'Evolución a plataforma de gestión total con reglas de engagement por red social.',
        type: 'feature',
        details: [
            'Soporte completo para LinkedIn con reglas de liderazgo e impacto social.',
            'Selector de Tipo de Publicación (Storytelling, Eventos, Fundraising, etc.).',
            'Adaptación dinámica de formato: Landscape (16:9) para X y Portrait (9:16) para IG/FB.',
            'Botón de descarga directa de imágenes generadas en alta resolución.',
            'Implementación de reglas de caracteres optimizadas para máximo alcance orgánico.'
        ]
    },
    {
        version: 'v4.279',
        date: '2026-05-14',
        title: 'IA: Motor Dual con Fallback Inteligente 🚀',
        description: 'Garantía de continuidad mediante el uso de motores alternativos de imagen.',
        type: 'improvement',
        details: [
            'Implementación de reintento automático con DALL-E 2 si DALL-E 3 no está disponible.',
            'Eliminación del error "The model does not exist" mediante detección de permisos.',
            'Ajuste dinámico de resolución y calidad según el motor de IA seleccionado.',
            'Mantenimiento de la alta fidelidad en los copies generados por GPT-4o.',
            'Optimización de la comunicación servidor-servidor para evitar bloqueos por cuotas.'
        ]
    },
    {
        version: 'v4.278',
        date: '2026-05-14',
        title: 'Sistema: Extracción Quirúrgica de Datos 🦾',
        description: 'Implementación de parseo avanzado mediante patrones Regex para eliminar fallos de formato.',
        type: 'fix',
        details: [
            'Nuevo motor de extracción que ignora texto conversacional de la IA.',
            'Optimización ultra-ligera de imagen (600px) para máxima velocidad.',
            'Reducción de temperatura del modelo (0.1) para mayor precisión técnica.',
            'Refuerzo del aislamiento de tokens JSON en el flujo de datos.',
            'Estabilización de la comunicación servidor-servidor para recreaciones 4K.'
        ]
    },
    {
        version: 'v4.277',
        date: '2026-05-14',
        title: 'Sistema: Estabilidad Crítica de IA 🛡️',
        description: 'Refuerzo del pipeline de datos para garantizar la generación en condiciones extremas.',
        type: 'improvement',
        details: [
            'Optimización de carga binaria (800px / 60% Q) para cumplir con límites de Vercel.',
            'Implementación de motor de parseo JSON permisivo para mayor resiliencia.',
            'Eliminación de restricciones de formato rígido para evitar bloqueos de OpenAI.',
            'Refuerzo del motor de Outpainting para recreaciones verticales de alta fidelidad.',
            'Mejora en la gestión de memoria durante el procesamiento de fotos panorámicas.'
        ]
    },
    {
        version: 'v4.276',
        date: '2026-05-14',
        title: 'Sistema: Transparencia de Errores IA 📡',
        description: 'Implementación de reportes detallados para fallos de OpenAI en tiempo real.',
        type: 'improvement',
        details: [
            'Propagación de mensajes de error directos desde GPT-4o y DALL-E 3.',
            'Simplificación de la estructura de mensajes Vision para mayor estabilidad.',
            'Optimización del buffer de imagen para evitar bloqueos por tamaño de archivo.',
            'Mejora en la captura de logs para diagnóstico de recreación Portrait.',
            'Refuerzo de la integridad de respuestas JSON en condiciones de alta latencia.'
        ]
    },
    {
        version: 'v4.275',
        date: '2026-05-14',
        title: 'IA: Outpainting y Recreación Vertical 🖼️',
        description: 'Eliminación del recorte estático en favor de una expansión generativa completa.',
        type: 'feature',
        details: [
            'Implementación de flujo de Outpainting mediante ingeniería de prompts en GPT-4o.',
            'Generación de fondos expandidos para convertir fotos horizontales a Portrait (9:16).',
            'Sincronización de rostros e identidad visual mediante descripción técnica detallada.',
            'Eliminación de la dependencia de "object-cover" en la vista previa del sistema.',
            'Refuerzo de la calidad HD en DALL-E 3 para resultados listos para redes sociales.'
        ]
    },
    {
        version: 'v4.274',
        date: '2026-05-14',
        title: 'IA: Optimización de Carga y Resolución ⚡',
        description: 'Mejora en la velocidad de respuesta mediante pre-procesamiento de imagen.',
        type: 'improvement',
        details: [
            'Implementación de re-dimensionado automático (800px) para el motor Vision.',
            'Reducción drástica del tamaño del payload enviado a OpenAI.',
            'Mejora en la precisión de DALL-E 3 para recreaciones institucionales.',
            'Refuerzo de los roles de sistema para respuestas JSON más consistentes.',
            'Estabilización del pipeline de generación bajo condiciones de red variables.'
        ]
    },
    {
        version: 'v4.273',
        date: '2026-05-14',
        title: 'IA: Inyección Directa de Datos (Base64) 🚀',
        description: 'Eliminación definitiva de errores de accesibilidad de imagen mediante procesamiento binario.',
        type: 'improvement',
        details: [
            'Implementación de conversión automática de imagen a Base64 en el servidor.',
            'Eliminación de la dependencia de URLs públicas para el análisis de GPT-4o.',
            'Optimización del flujo de datos para garantizar el procesamiento de fotos privadas o protegidas.',
            'Mejora en la estabilidad del pipeline de DALL-E 3 para recreaciones 4K.',
            'Sincronización total del controlador de Content Studio con funciones OAuth.'
        ]
    },
    {
        version: 'v4.272',
        date: '2026-05-14',
        title: 'Sistema: Restauración de Módulos OAuth 🛠️',
        description: 'Reparación de la comunicación interna para servicios autenticados.',
        type: 'fix',
        details: [
            'Corrección de la firma de tokens OAuth para el acceso a imágenes.',
            'Validación de rutas protegidas en el backend.',
            'Estabilización de las sesiones de usuario para herramientas IA.'
        ]
    },
    {
        version: 'v4.271',
        date: '2026-05-14',
        title: 'IA: Diagnóstico y Alta Fidelidad 🧠',
        description: 'Mejora en la precisión del análisis de imágenes y sistema de registro de errores.',
        type: 'improvement',
        details: [
            'Configuración de GPT-4o en modo "High Detail" para un análisis visual más profundo.',
            'Implementación de sistema de captura de errores detallados de OpenAI.',
            'Optimización del formato de respuesta JSON para evitar cortes de contenido.',
            'Mejora en los mensajes de error para facilitar el diagnóstico del usuario.',
            'Refuerzo en la persistencia de datos durante la transformación 4K.'
        ]
    },
    {
        version: 'v4.270',
        date: '2026-05-14',
        title: 'IA: Activación del Pipeline 4K 🚀',
        description: 'Integración final de la infraestructura de OpenAI para generación de medios en alta fidelidad.',
        type: 'feature',
        details: [
            'Activación de la API Key oficial para procesamiento GPT-4o y DALL-E 3.',
            'Implementación del modelo de imágenes de nueva generación (HD) en formato vertical.',
            'Optimización de la comunicación servidor-IA para reducir latencias de red.',
            'Sincronización de variables de entorno críticas en el despliegue de producción.',
            'Refuerzo de la identidad visual de Rotary mediante ingeniería de prompts avanzada.'
        ]
    },
    {
        version: 'v4.269',
        date: '2026-05-14',
        title: 'Backend: Robustez y Manejo de Nulos 🛡️',
        description: 'Mejora en la lógica del servidor para soportar administradores globales sin club asignado.',
        type: 'fix',
        details: [
            'Implementación de validación condicional para clubId en Prisma.',
            'Corrección del error fatal "Argument id must not be null" en el controlador de IA.',
            'Valores por defecto (fallback) para contexto institucional cuando el club no es detectado.',
            'Refuerzo en el mapeo opcional de proyectos de servicio.',
            'Optimización de la resiliencia del pipeline de generación de publicaciones.'
        ]
    },
    {
        version: 'v4.268',
        date: '2026-05-14',
        title: 'Seguridad: Corrección de Autenticación 🔑',
        description: 'Reparación de la llave de acceso para la generación de contenido por IA.',
        type: 'fix',
        details: [
            'Sincronización de la clave "rotary_token" para llamadas seguras al backend.',
            'Corrección del error "Invalid token" que bloqueaba la generación con IA.',
            'Refuerzo de los encabezados de autorización en cargas de archivos.',
            'Mejora en la persistencia de sesión durante el proceso de generación.',
            'Optimización de los tiempos de respuesta en el generador de publicaciones.'
        ]
    },
    {
        version: 'v4.267',
        date: '2026-05-14',
        title: 'Sistema: Unificación de Notificaciones 🔔',
        description: 'Migración completa a Sonner para mayor estabilidad en las alertas del sistema.',
        type: 'improvement',
        details: [
            'Sustitución de react-hot-toast por Sonner en el Generador de Publicaciones.',
            'Implementación de Event Logging en el botón principal para diagnóstico de ejecución.',
            'Mejora en la respuesta táctica del botón (active state) al hacer clic.',
            'Optimización de la biblioteca de medios para una selección más fluida.',
            'Corrección de posibles conflictos de renderizado en el modal de previsualización.'
        ]
    },
    {
        version: 'v4.266',
        date: '2026-05-14',
        title: 'UX/IA: Estabilidad y Visibilidad 💎',
        description: 'Mejoras críticas en la visibilidad del generador y control de tiempos de espera.',
        type: 'improvement',
        details: [
            'Nuevo diseño de botón "Generar con IA" con alto contraste (Blue Power) para evitar confusión visual.',
            'Implementación de Timeout de seguridad (2 min) en el cliente para procesos pesados de IA.',
            'Refuerzo visual del estado "Deshabilitado" con guía dinámica para el usuario.',
            'Optimización de la carga de previsualización con bordes suavizados y sombras de profundidad.',
            'Mejora en la legibilidad de copies y hashtags generados.'
        ]
    },
    {
        version: 'v4.265',
        date: '2026-05-14',
        title: 'Content Studio: Corrección de Integración 🛠️',
        description: 'Reparación de la conexión con la Biblioteca Multimedia y selector de imágenes.',
        type: 'fix',
        details: [
            'Corrección de prop "isOpen" en el componente MediaPicker para apertura correcta.',
            'Ajuste en el manejador "onSelect" para soportar selección de imágenes individuales.',
            'Optimización de la lógica de renderizado condicional del modal.',
            'Sincronización de metadatos de archivos (filename) al seleccionar desde biblioteca.',
            'Mejora en la estabilidad del selector dual (Subir/Biblioteca).'
        ]
    },
    {
        version: 'v4.264',
        date: '2026-05-14',
        title: 'Content Studio: Selector Dual de Medios 📤',
        description: 'Implementación de carga directa de archivos y mejoras en la selección de imágenes.',
        type: 'improvement',
        details: [
            'Nueva opción de "Subir Imagen" directamente desde el equipo local.',
            'Integración simplificada con la Biblioteca Multimedia global del club.',
            'Corrección de error en el botón de selección (+) del Generador de Publicaciones.',
            'Optimización del flujo de carga con feedback visual en tiempo real.',
            'Persistencia de metadatos para imágenes subidas mediante IA.'
        ]
    },
    {
        version: 'v4.263',
        date: '2026-05-14',
        title: 'UX: Reorganización del Content Studio 🎨',
        description: 'Mejoras en el flujo de trabajo del Generador de Publicaciones según feedback de usuario.',
        type: 'improvement',
        details: [
            'Botón de Generación movido a la columna de configuración para un flujo más intuitivo.',
            'Previsualización condicional: el área de vista previa solo se activa tras una generación exitosa.',
            'Sistema de logs avanzado en frontend y backend para diagnóstico de errores en tiempo real.',
            'Manejo de errores robusto con feedback detallado vía Toasts.',
            'Reset automático de vista previa al cambiar la imagen base.'
        ]
    },
    {
        version: 'v4.262',
        date: '2026-05-14',
        title: 'IA Performance: Optimización de Latencia ⚡',
        description: 'Mejoras en el motor de generación para reducir tiempos de respuesta y evitar timeouts.',
        type: 'update',
        details: [
            'Migración a GPT-4o (Omni) para análisis visual y textual ultra-rápido.',
            'Consolidación de procesos IA en una sola fase para reducir latencia de red.',
            'Incremento de maxDuration en Vercel a 60s para procesamiento de imágenes HD.',
            'Corrección de error de comunicación en el módulo de Generador de Publicaciones.',
            'Optimización de prompts para recreación visual más fiel en formato Portrait.'
        ]
    },
    {
        version: 'v4.261',
        date: '2026-05-14',
        title: 'IA Engine: Conversión Portrait 4K 📸',
        description: 'Implementación del motor de recreación visual para adaptar fotos panorámicas a formatos verticales.',
        type: 'feature',
        details: [
            'Integración de GPT-4 Vision para análisis profundo de composición original.',
            'Recreación de escenas mediante DALL-E 3 en formato Portrait (1024x1792).',
            'Eliminación de distorsión y pixelación en conversiones de aspecto (Aspect Ratio).',
            'Sincronización de contexto institucional para preservación de marca Rotary en imágenes IA.',
            'Badge de "IA Optimizada" en previsualización de Content Studio.'
        ]
    },
    {
        version: 'v4.260',
        date: '2026-05-14',
        title: 'Content Studio: Generador de Publicaciones ✨',
        description: 'Lanzamiento del nuevo módulo de generación de contenido IA para redes sociales.',
        type: 'feature',
        details: [
            'Nuevo selector de imágenes integrado con la Biblioteca de Medios.',
            'Generación automática de copies para Facebook, Instagram y X (Twitter).',
            'Adaptación inteligente a formatos 4:5 (FB) y 9:16 (IG/TikTok).',
            'Configuración de IA para áreas de interés rotario y optimización visual.',
            'Vista previa multi-plataforma en tiempo real con sugerencia de hashtags.'
        ]
    },
    {
        version: 'v4.258',
        date: '2026-05-14',
        title: 'Sincronización de Base de Datos 🛡️',
        description: 'Parche crítico para la infraestructura de correos institucionales.',
        type: 'fix',
        details: [
            'Sincronización manual de columnas de verificación en producción.',
            'Corrección del error "column verified does not exist" al crear cuentas.',
            'Estabilización del servicio de aprovisionamiento de dominios.'
        ]
    },
    {
        version: 'v4.256',
        date: '2026-05-14',
        title: 'Alta Resolución y Medios Pro 📸',
        description: 'Optimización masiva del procesamiento de imágenes en toda la plataforma administrativa.',
        type: 'improvement',
        details: [
            'Soporte para imágenes 4K (4096px) en la Librería de Medios.',
            'Calidad de procesamiento al 100% (Lossless) para recortes de noticias y eventos.',
            'Preservación de formato PNG original para mantener transparencias y nitidez profesional.',
            'Aumento de límites de compresión para evitar pixelación en pantallas grandes.',
            'TIP: Si ves imágenes pixeladas, realiza una nueva subida de archivo para aplicar la calidad 4K.'
        ]
    },
    {
        version: 'v4.254',
        date: '2026-05-13',
        title: 'Categorías Inteligentes 🧠',
        description: 'Implementación de filtrado dinámico basado en el contenido real del club.',
        type: 'feature',
        details: [
            'Detección automática de categorías más utilizadas por cada club.',
            'Ranking de las 5 categorías principales para optimizar la navegación.',
            'Eliminación de filtros vacíos o genéricos que no aplican al contenido actual.'
        ]
    },
    {
        version: 'v4.253',
        date: '2026-05-13',
        title: 'Integridad de Marca Rotary Origen 🛡️',
        description: 'Blindaje de la identidad institucional para clubes con nombres similares a programas de intercambio.',
        type: 'fix',
        details: [
            'Implementación de lógica estricta startsWith(\'rye\') para evitar falsos positivos de branding.',
            'Sincronización de base de datos para asegurar el tipo "club" en Rotary E-Club Origen.',
            'Actualización global de componentes (Navbar, Footer, Sidebar, JoinSection) con validación estricta de subdominio.'
        ]
    },
    {
        version: 'v4.250',
        date: '2026-05-13',
        title: 'UX de Administración Simplificada',
        description: 'Abstracción total de la complejidad técnica para administradores de clubes.',
        type: 'feature',
        details: [
            'Interfaz de correo enfocada 100% en el uso institucional',
            'Ocultamiento de configuraciones DNS/Resend para no super-admins',
            'Nuevo indicador de "Seguridad y Actividad" para la cuenta del club'
        ]
    },
    {
        version: 'v4.212',
        date: '2026-05-13',
        title: 'Fix de Identidad Comillada',
        description: 'Optimización del campo "Nombre" en el remitente para asegurar que clientes institucionales muestren el correo correcto.',
        type: 'fix',
        details: [
            'Implementación de formato comillado: ""correo@dominio.org""',
            'Mejora en la visualización para clientes Roundcube y Outlook',
            'Soporte robusto para dominios no verificados vía platform relay'
        ]
    },
    {
        version: 'v4.210',
        date: '2026-05-13',
        title: 'Habilitación de Auto-SMTP Institucional',
        description: 'Implementación de envío directo vía SMTP utilizando las credenciales de la cuenta institucional recién creada.',
        type: 'feature',
        details: [
            'Detección automática de servidor de correo (mail.dominio.com)',
            'Autenticación directa para asegurar identidad 1:1',
            'Fallback automático a relay de plataforma en caso de error'
        ]
    },
    {
        version: 'v4.208',
        date: '2026-05-13',
        title: 'Simplificación de Identidad de Remitente',
        description: 'Ajuste final en el formato de remitente para forzar la visualización del correo institucional en el cliente del destinatario.',
        type: 'improvement',
        details: [
            'Cambio de formato a "correo@dominio.org <noreply@clubplatform.org>"',
            'Eliminación de comillas y paréntesis para evitar filtrado de clientes',
            'Optimización de compatibilidad con Gmail y Outlook'
        ]
    },
    {
        version: 'v4.207',
        date: '2026-05-13',
        title: 'Corrección de Referencia de Correo',
        description: 'Saneamiento de variables internas en el motor de despacho para asegurar la entrega de correos institucionales.',
        type: 'fix',
        details: [
            'Corrección de error "customFrom is not defined"',
            'Estandarización de parámetros de remitente en EmailService',
            'Validación de flujo de envío vía platform relay'
        ]
    },
    {
        version: 'v4.206',
        date: '2026-05-13',
        title: 'Mejora de Identidad de Remitente',
        description: 'Optimización de los encabezados de correo para mostrar el nombre del club y el correo institucional como identidad principal.',
        type: 'improvement',
        details: [
            'Detección dinámica del nombre del club para el campo "From"',
            'Formateo profesional: "Nombre Club (correo@dominio.org)"',
            'Sincronización de metadatos de remitente en el relay de plataforma'
        ]
    },
    {
        version: 'v4.205',
        date: '2026-05-13',
        title: 'Fix de Entregabilidad y Cumplimiento',
        description: 'Ajuste en el motor de correo para cumplir con las políticas de verificación de dominio de proveedores externos.',
        type: 'fix',
        details: [
            'Implementación de patrón Reply-To para asegurar la recepción de respuestas',
            'Uso de dominio verificado de plataforma como remitente técnico',
            'Personalización del nombre del remitente con la cuenta institucional'
        ]
    },
    {
        version: 'v4.200',
        date: '2026-05-13',
        title: 'Arquitectura Multi-Dominio de Correo',
        description: 'Soporte dinámico para correos institucionales en múltiples dominios (Clubes, Distritos y Proyectos).',
        type: 'feature',
        details: [
            'Detección automática de dominio de remitente según el contexto del sitio',
            'Configuración de Reply-To dinámico para asegurar la entrega',
            'Escalabilidad garantizada para cientos de dominios personalizados'
        ]
    },
    {
        version: 'v4.198',
        date: '2026-05-13',
        title: 'Habilitación de Envío (SMTP Relay)',
        description: 'Activación del sistema de retransmisión de correo para cuentas institucionales sin configuración manual.',
        type: 'feature',
        details: [
            'Implementación de SMTP Fallback para cuentas de plataforma',
            'Soporte para envío desde dominios institucionales vía relay central',
            'Limpieza de instancias redundantes de Prisma'
        ]
    },
    {
        version: 'v4.197',
        date: '2026-05-13',
        title: 'Sincronización de Producción Finalizada',
        description: 'Confirmación de la estructura de base de datos en el entorno de producción para el módulo de correos.',
        type: 'update',
        details: [
            'Sincronización manual de esquemas en PostgreSQL (Neon)',
            'Validación de persistencia de cuentas de correo',
            'Preparación para aprovisionamiento DNS'
        ]
    },
    {
        version: 'v4.196',
        date: '2026-05-13',
        title: 'Optimización de Base de Datos y Errores',
        description: 'Migración a instancia única de Prisma y mejora en el reporte de errores del backend.',
        type: 'update',
        details: [
            'Uso de instancia global de PrismaClient para evitar fugas de conexión',
            'Reporte detallado de errores en el proceso de creación de cuentas',
            'Sincronización de contexto de club en el frontend'
        ]
    },
    {
        version: 'v4.195',
        date: '2026-05-13',
        title: 'Fix Crítico: Sincronización de Token',
        description: 'Corrección en la recuperación del token de autenticación (Key mismatch) en el módulo de correos.',
        type: 'fix',
        details: [
            'Corrección de localStorage key (token -> rotary_token)',
            'Uso del hook useAuth para gestión centralizada de tokens',
            'Limpieza de diagnósticos de seguridad'
        ]
    },
    {
        version: 'v4.191',
        date: '2026-05-13',
        title: 'Estabilidad de Sesión y Fix de API',
        description: 'Sincronización de claves JWT y corrección del punto de entrada en Vercel para asegurar persistencia.',
        type: 'fix',
        details: [
            'Sincronización de JWT_SECRET fallback en middleware y controladores',
            'Corrección de api/index.js para incluir rutas de email-accounts',
            'Inyección de dotenv en el entry point de Vercel'
        ]
    },
    {
        version: 'v4.190',
        date: '13 de Mayo, 2026',
        title: '📧 Persistencia Total del Ecosistema de Correo',
        description: 'Implementación de la capa de persistencia para cuentas de correo institucionales, permitiendo la gestión estable de múltiples remitentes por club.',
        type: 'major',
        changes: [
            { type: 'added', text: 'Nueva tabla EmailAccount en la base de datos para almacenamiento permanente de credenciales y perfiles de correo.' },
            { type: 'added', text: 'Endpoints de API (/api/email-accounts) para creación, listado y eliminación de cuentas de correo.' },
            { type: 'fixed', text: 'Resolución del problema de pérdida de datos tras refrescar el navegador en el panel administrativo.' },
            { type: 'improved', text: 'Sincronización dinámica de la cuenta activa y estados de carga en la interfaz de gestión de correo.' }
        ]
    },
    {
        version: 'v4.189',
        date: '13 de Mayo, 2026',
        title: '🚀 Despacho de Correo Real vía API',
        description: 'Conexión del front-end con el servicio de comunicaciones del backend para envío efectivo de emails.',
        type: 'feature',
        changes: [
            { type: 'added', text: 'Integración del botón "Enviar" con el endpoint /api/communications/send para despacho real.' },
            { type: 'improved', text: 'Soporte para múltiples proveedores de salida (Resend/SMTP) según la configuración del club.' },
            { type: 'added', text: 'Registro automático de comunicaciones enviadas en la base de datos (CommunicationLog).' },
            { type: 'improved', text: 'Validación de tokens de autenticación en cada despacho para máxima seguridad.' }
        ]
    },
    {
        version: 'v4.188',
        date: '13 de Mayo, 2026',
        title: '📦 Persistencia en Bandeja de Enviados',
        description: 'Implementación de persistencia para que los correos enviados se guarden y visualicen correctamente.',
        type: 'improvement',
        changes: [
            { type: 'added', text: 'Los correos redactados ahora se guardan en la carpeta de "Enviados" con su historial completo.' },
            { type: 'improved', text: 'Lógica de estado dinámico para la gestión de hilos de correo en tiempo real.' },
            { type: 'improved', text: 'Preparación de infraestructura de salida para vinculación con API externa (AWS SES/Resend).' }
        ]
    },
    {
        version: 'v4.187',
        date: '13 de Mayo, 2026',
        title: '🔗 Lógica de Cuentas y Carpetas Integrada',
        description: 'Sincronización total entre la selección de cuentas, carpetas y el remitente de correos.',
        type: 'improvement',
        changes: [
            { type: 'fixed', text: 'Sincronización dinámica del remitente en el modal de redacción según la cuenta activa seleccionada.' },
            { type: 'fixed', text: 'Activación de la navegación por carpetas (Recibidos, Destacados, Enviados, etc.) con filtrado reactivo.' },
            { type: 'improved', text: 'Persistencia de nuevas cuentas (ej. admin) en el selector de remitentes y directorio institucional.' },
            { type: 'fixed', text: 'Corrección de la lógica de cambio de cuenta para evitar visualizaciones en blanco.' }
        ]
    },
    {
        version: 'v4.186',
        date: '13 de Mayo, 2026',
        title: '📤 Funcionalidad Completa de Correo',
        description: 'Activación del flujo de redacción, lectura y envío de correos corporativos.',
        type: 'feature',
        changes: [
            { type: 'added', text: 'Módulo de redacción (Compose) con soporte para adjuntos y validación de campos.' },
            { type: 'fixed', text: 'Corrección del árbol de renderizado para visualización instantánea de mensajes seleccionados.' },
            { type: 'improved', text: 'Simulación de envío con estados de carga (loading) y notificaciones de éxito.' },
            { type: 'fixed', text: 'Activación del botón "Redactar" vinculado al nuevo modal de composición.' }
        ]
    },
    {
        version: 'v4.185',
        date: '13 de Mayo, 2026',
        title: '🌐 Detección Inteligente de Dominio',
        description: 'Sincronización automática del dominio de correo con el dominio personalizado activo del sitio.',
        type: 'improvement',
        changes: [
            { type: 'improved', text: 'Priorización de dominios personalizados (ej. rotarynuevocali.org) sobre subdominios técnicos en el creador de correos.' },
            { type: 'fixed', text: 'Corrección del sufijo de correo en el modal de creación para coincidir con la URL de navegación.' }
        ]
    },
    {
        version: 'v4.184',
        date: '13 de Mayo, 2026',
        title: '⚡ Configuración de Correo Cero-Técnica',
        description: 'Simplificación total del flujo de creación de cuentas corporativas con auto-aprovisionamiento DNS.',
        type: 'feature',
        changes: [
            { type: 'added', text: 'Nueva interfaz de creación "Un-Clic" que solo requiere nombre y contraseña.' },
            { type: 'added', text: 'Sincronización automática de registros MX, SPF y DKIM mediante Club Platform Gateway.' },
            { type: 'improved', text: 'Diseño de panel administrativo simplificado que elimina la complejidad técnica de los DNS.' },
            { type: 'added', text: 'Indicadores visuales de éxito de configuración automática para mayor tranquilidad del usuario.' }
        ]
    },
    {
        version: 'v4.183',
        date: '13 de Mayo, 2026',
        title: '🏢 Gestor de Cuentas Corporativas',
        description: 'Capacidad para crear y administrar correos corporativos directamente desde el panel del club.',
        type: 'feature',
        changes: [
            { type: 'added', text: 'Wizard de creación de cuentas con auto-configuración de alias (ej. tesoreria@club.com).' },
            { type: 'added', text: 'Panel de verificación DNS en tiempo real para registros MX, SPF y DKIM.' },
            { type: 'added', text: 'Gestión de límites de almacenamiento y cuotas de cuentas por club.' },
            { type: 'improved', text: 'Interfaz dual: Alterna entre lectura de bandeja y administración de infraestructura.' }
        ]
    },
    {
        version: 'v4.182',
        date: '13 de Mayo, 2026',
        title: '📧 Nueva Bandeja de Entrada Integrada',
        description: 'Lanzamiento del módulo de gestión de correos corporativos y transaccionales para clubes.',
        type: 'feature',
        changes: [
            { type: 'added', text: 'Bandeja de entrada premium con diseño de 3 columnas para lectura eficiente.' },
            { type: 'added', text: 'Soporte para múltiples cuentas corporativas bajo el dominio del club.' },
            { type: 'added', text: 'Visualización de adjuntos e historial de conversación vinculado al CRM.' },
            { type: 'improved', text: 'Navegación administrativa actualizada con acceso directo desde el menú General.' }
        ]
    },
    {
        version: 'v4.181',
        date: '13 de Mayo, 2026',
        title: '🖋️ Refinamiento Tipográfico de Encabezados',
        description: 'Ajuste de peso visual en los títulos de sección para una apariencia más limpia y menos pesada.',
        type: 'improvement',
        changes: [
            { type: 'improved', text: 'Sustitución de font-black (900) por font-semibold (600) en todos los encabezados de módulos administrativos.' },
            { type: 'improved', text: 'Mejora en el equilibrio visual entre el título y la descripción de sección.' }
        ]
    },
    {
        version: 'v4.180',
        date: '13 de Mayo, 2026',
        title: '🛠️ Correcciones Críticas de UI y Sintaxis',
        description: 'Resolución de errores de renderizado y lógica estructural en el panel administrativo.',
        type: 'fix',
        changes: [
            { type: 'fixed', text: 'FAQs: Corrección de error de sintaxis JSX y restauración de AdminLayout.' },
            { type: 'fixed', text: 'Eventos: Resolución de iconos faltantes (CalendarDays, LayoutGrid) que causaban blank screen.' },
            { type: 'fixed', text: 'Estabilización general del flujo de renderizado en el dashboard.' }
        ]
    },
    {
        version: 'v4.179',
        date: '13 de Mayo, 2026',
        title: '🛠️ Corrección de Sintaxis JSX',
        description: 'Reparación de error estructural en el módulo de Proyectos que impedía el despliegue en Vercel.',
        type: 'fix',
        changes: [
            { type: 'fixed', text: 'Restauración del fragmento de React en Projects.tsx para permitir múltiples elementos de nivel superior.' }
        ]
    },
    {
        version: 'v4.178',
        date: '13 de Mayo, 2026',
        title: '✨ Estandarización de UX Administrativa',
        description: 'Implementación de un lenguaje visual premium unificado a través de todos los módulos del panel de control.',
        type: 'improvement',
        changes: [
            { type: 'improved', text: 'Encabezados estandarizados con iconografía de alta fidelidad y tipografía optimizada.' },
            { type: 'improved', text: 'Sincronización de métricas y contadores dinámicos en los títulos de sección.' },
            { type: 'improved', text: 'Mejora en la responsividad y jerarquía visual de las acciones principales.' },
            { type: 'improved', text: 'Módulos actualizados: Noticias, Proyectos, Eventos, Socios, Multimedia, Tienda y FAQs.' }
        ]
    },
    {
        version: 'v4.177',
        date: '13 de Mayo, 2026',
        title: '🖼️ Corrección de Renderizado de Imágenes',
        description: 'Optimización de la carga de medios en el panel administrativo y páginas públicas para asegurar la visibilidad de portadas de noticias.',
        type: 'fix',
        changes: [
            { type: 'fixed', text: 'Resolución de error de carga en Gestión de Noticias (CORS/crossOrigin restrictions).' },
            { type: 'fixed', text: 'Corrección de visibilidad de imágenes en Eventos, Proyectos y Tienda.' },
            { type: 'fixed', text: 'Optimización de previsualización SEO y tarjetas de redes sociales.' }
        ]
    },
    {
        version: 'v4.176',
        date: '13 de Mayo, 2026',
        title: '📋 Reorganización del Menú Administrativo',
        description: 'Optimización de la jerarquía del panel de control para una mejor usabilidad y enfoque en gestión de contenido.',
        type: 'major',
        changes: [
            { type: 'improved', text: 'General: Analytics, Leads, Noticias, Eventos y Proyectos centralizados como pilares operativos.' },
            { type: 'improved', text: 'Contenido: Nuevo enfoque en activos visuales y directorio de Socios y Junta Directiva.' },
            { type: 'improved', text: 'Configuración: Consolidación de Overview e Identidad en una única categoría técnica.' }
        ]
    },
    {
        version: 'v4.175',
        date: '13 de Mayo, 2026',
        title: '⚓ Recuperación de Navegación & Reglas de Producción',
        description: 'Corrección de la lógica de detección de producción y limpieza del menú lateral para administradores de clubes.',
        type: 'major',
        changes: [
            { type: 'fixed', text: 'Producción: Detección automática basada en dominios personalizados (independiente del estado "borrador").' },
            { type: 'fixed', text: 'Sidebar: Se eliminó el "Overview" duplicado en la sección General para administradores de clubes.' },
            { type: 'improved', text: 'Auth: Refuerzo de la distinción entre Super Admin (Plataforma) y Admin (Club).' }
        ]
    },
    {
        version: 'v4.174',
        date: '13 de Mayo, 2026',
        title: '🏠 Dashboard Dinámico & Smart Navigation',
        description: 'Implementación de enrutamiento inteligente basado en el ciclo de vida del sitio. Analytics ahora es la página principal para sitios activos.',
        type: 'major',
        changes: [
            { type: 'added', text: 'Navigation: Analytics habilitado como "Home" principal para sitios en producción.' },
            { type: 'improved', text: 'Estructura: El asistente "Overview" se ha movido a Configuración para sitios publicados.' },
            { type: 'improved', text: 'UI: Nueva categoría "Gestión de Sitio" para centralizar operaciones de miembros y leads.' },
            { type: 'added', text: 'Context: Sistema de detección automática de estado de producción (site.status, domainConnected).' }
        ]
    },
    {
        version: 'v4.173',
        date: '12 de Mayo, 2026',
        title: '♻️ WhatsApp QR — Stack Evolution restaurado',
        description: 'Se restauró toda la integración con Evolution API que había quedado revertida tras v4.172: cliente REST en el backend (reemplazando whatsapp-web.js + Puppeteer que no corre en Vercel serverless), enriquecimiento de nombres de grupos y contactos, header colapsable cuando hay sesión, nombre real de archivos adjuntos, mark-as-read al abrir un chat, disparador manual (Nuevo Mensaje) a cualquier número, y limit de 25 MB en el body parser.',
        type: 'fix'
    },
    {
        version: 'v4.172',
        date: '12 de Mayo, 2026',
        title: '🛡️ Paridad de Marca RYE 4281',
        description: 'Consolidación de la identidad visual y administrativa para RYE 4281 como Programa de Intercambio en todo el ecosistema.',
        type: 'improvement',
        changes: [
            { type: 'improved', text: 'Dashboard: Reemplazo global de etiquetas "Asociación" por "Programa de Intercambio" para entidades RYE.' },
            { type: 'improved', text: 'Admin Layout: Sincronización de la versión del sistema a v4.172.' },
            { type: 'fixed', text: 'Navegación: Clasificación correcta de RYE 4281 en la sección de Programas de Intercambio.' }
        ]
    },
    {
        version: 'v4.171',
        date: '12 de Mayo, 2026',
        title: '🚀 CRM Premium & Sincronización Global',
        description: 'Activación del CRM de WhatsApp con chat en tiempo real y sincronización masiva de entidades para nuevos clubes (RYE 4281).',
        type: 'major',
        changes: [
            { type: 'added', text: 'CRM: Chat de WhatsApp Business en tiempo real habilitado.' },
            { type: 'improved', text: 'Sincronización: Conexión exitosa del club RYE 4281 al ecosistema Latir.' },
            { type: 'fixed', text: 'Infraestructura: Corrección de dominios y aprovisionamiento en Vercel.' }
        ]
    },
    {
        version: 'v4.142',
        date: '08 de Mayo, 2026',
        title: '🌐 Corrección Definitiva de Redirección',
        description: 'Se implementó el uso de trust proxy y req.hostname para una detección precisa del dominio en Vercel, solucionando problemas de redirección con www.',
        type: 'fix'
    },
    {
        version: 'v4.141',
        date: '08 de Mayo, 2026',
        title: '🌐 Redirección Agresiva Anti-Caché',
        description: 'Se implementó una lógica de redirección más agresiva utilizando x-forwarded-host y desactivando la caché del navegador para asegurar la transición inmediata al subdominio app.',
        type: 'fix'
    },
    {
        version: 'v4.140',
        date: '08 de Mayo, 2026',
        title: '🌐 Optimización de Redirección Global',
        description: 'Se robusteció la lógica de redirección SaaS para manejar variaciones en el host y asegurar que todas las rutas del dominio principal apunten correctamente a la app.',
        type: 'update'
    },
    {
        version: 'v4.139',
        date: '08 de Mayo, 2026',
        title: '🌐 Redirección SaaS Inteligente',
        description: 'Se implementó la capacidad de redireccionar el dominio principal (clubplatform.org) directamente a la aplicación (app), gestionable por super administradores.',
        type: 'update'
    },
    {
        version: 'v4.138',
        date: '06 de Mayo, 2026',
        title: '🛠️ Estabilidad de Compilación',
        description: 'Se corrigió un error de sintaxis JSX (etiqueta div sin cerrar) en el módulo District IQ que impedía el despliegue en producción.',
        type: 'fix'
    },
    {
        version: 'v4.137',
        date: '06 de Mayo, 2026',
        title: '🎨 Estandarización de Interfaz Premium',
        description: 'Se refinó la tipografía y el espaciado de District Health IQ para que coincida exactamente con el estilo premium de Analytics, asegurando una experiencia cohesiva.',
        type: 'update'
    },
    {
        version: 'v4.136',
        date: '06 de Mayo, 2026',
        title: '🎨 Sincronización de Interfaz',
        description: 'Se integró el módulo District Health IQ dentro de la estructura estándar del panel administrativo, incluyendo barra lateral y cabecera institucional.',
        type: 'update'
    },
    {
        version: 'v4.135',
        date: '06 de Mayo, 2026',
        title: '🔠 Corrección de Esquema (Leads)',
        description: 'Se ajustó la sensibilidad a mayúsculas en la consulta de base de datos para el conteo de prospectos (Leads), restaurando la visualización del módulo District IQ.',
        type: 'fix'
    },
    {
        version: 'v4.134',
        date: '06 de Mayo, 2026',
        title: '🧠 Estabilidad District Health IQ',
        description: 'Se corrigió un error en el enrutamiento y la lógica de consulta de base de datos que impedía la carga de métricas globales del distrito.',
        type: 'fix'
    },
    {
        version: 'v4.133',
        date: '06 de Mayo, 2026',
        title: '🎨 Gestión de Logo de Plataforma',
        description: 'Los super administradores ahora pueden subir y ajustar el tamaño del logo de la plataforma directamente desde la configuración avanzada.',
        type: 'update'
    },
    {
        version: 'v4.132',
        date: '06 de Mayo, 2026',
        title: '🎨 Logo Premium Admin',
        description: 'Se implementó un logo diferenciado y premium para el panel de super administradores.',
        type: 'update'
    },
    {
        version: 'v4.131',
        date: '06 de Mayo, 2026',
        title: '💼 Automatización Crowdfund',
        description: 'Las comisiones por activación de dominios se registran ahora automáticamente tras el pago del plan anual.',
        type: 'update'
    },
    {
        version: 'v4.130',
        date: '06 de Mayo, 2026',
        title: '💼 Visibilidad de Inversión',
        description: 'Se habilitó el acceso a la sección de Mi Inversión para los administradores del Rotary E-Club Origen.',
        type: 'update'
    },
    {
        version: 'v4.129',
        date: '06 de Mayo, 2026',
        title: '🛠️ Estabilidad en Configuración',
        description: 'Corrección de crash en la sección de Identidad del club y validación de datos para redes sociales y perfiles de ADN.',
        type: 'update'
    },
    {
        version: 'v4.128',
        date: '06 de Mayo, 2026',
        title: '🛠️ Corrección Crítica JSX',
        description: 'Reparación de etiquetas mal cerradas en el componente CrowdfundWallet que impedían la compilación en producción (Vercel).',
        type: 'update'
    },
    {
        version: 'v4.127',
        date: '06 de Mayo, 2026',
        title: '🎨 Consistencia Visual Crowdfunder',
        description: 'Ajuste del diseño de la Billetera de Inversión para integrarse perfectamente con el Layout global de administración, manteniendo la barra lateral y el encabezado unificado.',
        type: 'update'
    },
    {
        version: 'v4.126',
        date: '06 de Mayo, 2026',
        title: '💰 Billetera de Inversión (Crowdfunder)',
        description: 'Nueva sección de Wallet para clubes con rol de Crowdfunder. Permite visualizar capital invertido, dominios activos vs. disponibles y ganancias recurrentes por la gestión de activos en la plataforma.',
        type: 'update'
    },
    {
        version: 'v4.125',
        date: '06 de Mayo, 2026',
        title: '🌐 Corrección de Enrutamiento en Vercel',
        description: 'Implementación de vercel.json para garantizar que todas las rutas de la API (/api/*) sean procesadas correctamente por el servidor Express. Esto resuelve los errores 404 en la carga de identidad del club.',
        type: 'update'
    },
    {
        version: 'v4.124',
        date: '06 de Mayo, 2026',
        title: '🛡️ Estabilización de Conexiones (Singleton)',
        description: 'Implementación forzada del patrón Singleton para Prisma en todos los entornos. Se eliminaron múltiples instancias en controladores que saturaban la base de datos, resolviendo el estado de "Cargando Club" en producción.',
        type: 'update'
    },
    {
        version: 'v4.123',
        date: '06 de Mayo, 2026',
        title: '🛠️ Reparación de Referencia Crítica',
        description: 'Corrección de un error de referencia (importación faltante) que causaba el colapso total de la API, impidiendo la carga de logos y contenido.',
        type: 'update'
    },
    {
        version: 'v4.121',
        date: '06 de Mayo, 2026',
        title: '🛡️ Resolución de Identidad Blindada',
        description: 'Añadido sistema de fallback preventivo en el servidor para garantizar que ningún club se quede sin identidad visual, incluso ante latencias extremas de base de datos.',
        type: 'update'
    },
    {
        version: 'v4.120',
        date: '06 de Mayo, 2026',
        title: 'Restauración Crítica de Rutas Core 🚀',
        description: 'Implementación de importaciones estáticas para rutas de clubes y públicas, asegurando disponibilidad inmediata y eliminando el estado "Cargando Club".',
        type: 'update'
    },
    {
        version: 'v4.119',
        date: '06 de Mayo, 2026',
        title: 'Hotfix: Estabilidad de API y Multimedia 🔧',
        description: 'Corrección crítica de CORS y gestión de conexiones de base de datos para restaurar la carga de sitios.',
        type: 'update'
    },
    {
        version: 'v4.118',
        date: '06 de Mayo, 2026',
        title: 'Phase 11: District Health IQ (Official) 🧠',
        description: 'Lanzamiento oficial del motor de inteligencia para Distritos. Analítica predictiva y salud SaaS.',
        type: 'feature'
    },
    {
        version: 'v4.113',
        date: '06 de Mayo, 2026',
        title: 'Fase 10: Automatización de Pagos & Webhooks 🤖',
        description: 'Activación del ciclo de confirmación automática de trámites técnicos.',
        type: 'feature',
        changes: [
            { type: "major", text: "Stripe: Webhook 'checkout.session.completed' habilitado para servicios técnicos." },
            { type: "added", text: "Automatización: Cambio de estado automático a 'Pagado' y 'En Proceso' tras el cobro." },
            { type: "improved", text: "Trazabilidad: Registro de metadatos financieros en la solicitud técnica." }
        ]
    },
    {
        version: 'v4.112',
        date: '06 de Mayo, 2026',
        title: 'INFRA: Fase 9 - Consolidación de Infraestructura 🏢',
        description: 'Estabilización de las solicitudes técnicas y pagos Stripe mediante rutas nativas.',
        type: 'feature',
        changes: [
            { type: "fix", text: "Infraestructura: Rutas de registro consolidadas en el punto de entrada para evitar fallos serverless." },
            { type: "improved", text: "Estabilidad: Despliegue de Zero-Dependencies para trámites de dominio." }
        ]
    },
    {
        version: 'v4.107',
        date: '06 de Mayo, 2026',
        title: 'ADMIN: Phase 9 - Technical Requests (Domain Transfer) 🌐',
        description: 'Lanzamiento del centro de solicitudes técnicas y gestión de dominios.',
        type: 'feature',
        changes: [
            { type: "major", text: "Phase 9: Infraestructura de 'Solicitudes Técnicas' desplegada." },
            { type: "added", text: "Dominios: Nuevo flujo de transferencia con costo estandarizado de $29.00 USD." },
            { type: "added", text: "Backend: API de solicitudes técnicas con trazabilidad de estado y pagos." }
        ]
    },
    {
        version: 'v4.106',
        date: '06 de Mayo, 2026',
        title: 'AGENTIC: Phase 8 - Membership IQ (CRM Pulse) 🐺',
        description: 'Activación del motor de análisis predictivo de socios y conversión de leads.',
        type: 'feature',
        changes: [
            { type: "major", text: "Phase 8: Membership IQ activado. El tablero ahora muestra métricas reales de salud del club." },
            { type: "added", text: "Analytics: Nuevo endpoint '/api/analytics/crm-pulse' conectado a la base de datos de socios y leads." },
            { type: "improved", text: "UI: Barra de métricas 'Live Pulse' integrada en la consola de implementaciones IA." }
        ]
    },
    {
        version: 'v4.105',
        date: '06 de Mayo, 2026',
        title: 'AGENTIC: Phase 7 - Content Engine (IA Redacción) 🐲',
        description: 'Activación de la infraestructura para agentes de redacción y peritaje de calidad.',
        type: 'feature',
        changes: [
            { type: "major", text: "Phase 7: Content Engine habilitado. El backend ahora permite que los agentes guarden redacciones IA directamente." },
            { type: "added", text: "Database: Nuevo campo 'details' (JSON) en FundingOpportunity para albergar plantillas de WhatsApp." },
            { type: "improved", text: "API: Controlador polymorphic para actualizaciones granulares de estatus, prioridad y metadatos IA." }
        ]
    },
    {
        version: 'v4.104',
        date: '06 de Mayo, 2026',
        title: 'GOVERNANCE: Phase 5 - Stripe Autogestión 🏢',
        description: 'Lanzamiento final del sistema de Gobernanza SaaS. Reactivación automática de servicios, soporte para Distritos y facturación inteligente.',
        type: 'feature',
        changes: [
            { type: "major", text: "Phase 5: Stripe Autogestión activada. Renovación inmediata con un solo click para toda la plataforma." },
            { type: "added", text: "Soporte Polymorphic: Districts y Asociaciones ahora cuentan con panel de facturación y dominios propios." },
            { type: "added", text: "Vercel Cron v2: Automatización total de suspensiones y alertas IA para gobernadores y presidentes." },
            { type: "fixed", text: "UI: Reparado el scroll en modales de gestión (Asociaciones/Clubes/Distritos) para pantallas pequeñas." }
        ]
    },
    {
        version: "v4.101.1",
        date: "05 de Mayo, 2026",
        title: "MESSAGING: Centro de Comunicación SaaS",
        description: "Lanzamiento de la Fase 4 con herramientas de notificación omnicanal para renovaciones.",
        type: "feat",
        changes: [
            { type: "added", text: "Dashboard: Centro de Comunicación integrado para envío de alertas vía WhatsApp y Email." },
            { type: "added", text: "Database: Nuevos campos de contacto de facturación (billingContactEmail/Phone)." },
            { type: "improved", text: "UI: Botón de notificación rápida en la lista de clubes con plantillas dinámicas." }
        ]
    },
    {
        version: "v4.100.0",
        date: "05 de Mayo, 2026",
        title: "REPORTING: Exportación de Datos Administrativos",
        description: "Lanzamiento de la Fase 3 con herramientas de exportación para conciliación financiera.",
        type: "feat",
        changes: [
            { type: "added", text: "Dashboard: Botón de exportación a CSV para la base de datos de clubes." },
            { type: "improved", text: "Auditoría: El reporte incluye estatus SaaS, fechas de expiración y conteo de usuarios." },
            { type: "improved", text: "UI: Nueva barra de herramientas con acciones globales en el panel de clubes." }
        ]
    },
    {
        version: "v4.99.0",
        date: "05 de Mayo, 2026",
        title: "SYNC+: Persistencia de Control SaaS",
        description: "Sincronización total del backend para permitir la persistencia de cambios manuales en estados de suscripción.",
        type: "update",
        changes: [
            { type: "fixed", text: "Backend: Los cambios manuales en 'subscriptionStatus' ahora se guardan correctamente." },
            { type: "fixed", text: "Database: Mapeo de campos SaaS en controladores de creación y actualización." },
            { type: "improved", text: "Integridad: Sincronización de estados financieros con la capa de persistencia." }
        ]
    },
    {
        version: "v4.98.0",
        date: "05 de Mayo, 2026",
        title: "OPERATIONS: Control Manual de Suscripciones",
        description: "Lanzamiento de herramientas para la gestión manual de estados SaaS y fechas de expiración.",
        type: "feat",
        changes: [
            { type: "added", text: "Dashboard: Campos de estado SaaS y fecha de expiración en el editor de clubes." },
            { type: "improved", text: "Finanzas: Cálculo de ARR basado en la tarifa anual de $299 USD." },
            { type: "fixed", text: "Métricas: Sincronización de contadores financieros con los nuevos estados manuales." }
        ]
    },
    {
        version: "v4.97.1",
        date: "05 de Mayo, 2026",
        title: "HOTFIX: Reparación de Dashboard Administrativo",
        description: "Corrección de error de sintaxis que bloqueaba el despliegue de la Fase 4 en producción.",
        type: "hotfix",
        changes: [
            { type: "fixed", text: "Syntax: Cierre de función handleImpersonate restaurado." },
            { type: "improved", text: "Build: Estabilización del flujo de CI/CD para métricas financieras." }
        ]
    },
    {
        version: "v4.97.0",
        date: "05 de Mayo, 2026",
        title: "FINANCIAL: Oversight y Métricas de Red",
        description: "Lanzamiento de la Fase 4 con herramientas de supervisión financiera y proyección de ingresos SaaS.",
        type: "feat",
        changes: [
            { type: "added", text: "Dashboard: Barra de métricas con MRR, nodos activos y renovaciones próximas." },
            { type: "improved", text: "Visibilidad: Proyección financiera en tiempo real para SuperAdmin." }
        ]
    },
    {
        version: "v4.96.0",
        date: "05 de Mayo, 2026",
        title: "DASHBOARD+: Filtros y Búsqueda Avanzada",
        description: "Optimización del panel de administración para gestionar grandes volúmenes de clubes con herramientas de filtrado en tiempo real.",
        type: "feat",
        changes: [
            { type: "added", text: "Búsqueda: Barra de búsqueda global por nombre, ciudad o subdominio." },
            { type: "added", text: "Filtros: Segmentación rápida por estado de suscripción (Activos, Prospectos, Vencidos)." },
            { type: "improved", text: "UI: Nueva barra de herramientas superior en la gestión de clubes." }
        ]
    },
    {
        version: "v4.95.4",
        date: "05 de Mayo, 2026",
        title: "ROUTING: Actualización de Enlaces de Acceso",
        description: "Transición de subdominios a enlaces parametrizados para garantizar el acceso inmediato a todos los clubes sin dependencia de DNS wildcard.",
        type: "fix",
        changes: [
            { type: "improved", text: "Dashboard: Enlaces de acceso cambiados a formato ?club= para mayor fiabilidad." },
            { type: "fixed", text: "Reachability: Eliminación de cuellos de botella por propagación de subdominios." }
        ]
    },
    {
        version: "v4.95.3",
        date: "05 de Mayo, 2026",
        title: "SYNC: Despliegue Masivo de Subdominios",
        description: "Actualización de la estructura de subdominios para 52 clubes de los distritos de Colombia, asegurando coherencia en los enlaces de la plataforma.",
        type: "feat",
        changes: [
            { type: "added", text: "Database: Actualización de 52 subdominios (santafedebogota, yumbo-arroyohondo, etc)." },
            { type: "improved", text: "Despliegue: Sincronización forzada para reflejar cambios en producción." }
        ]
    },
    {
        version: "v4.95.2",
        date: "05 de Mayo, 2026",
        title: "DEPLOY: Sincronización de Etiquetas (Nuclear)",
        description: "Forzado de despliegue para asegurar que los cambios en las etiquetas de suscripción se reflejen en todos los nodos de la red.",
        type: "fix",
        changes: [
            { type: "improved", text: "Cache: Invalidez de caché forzada en el punto de entrada de la API." },
            { type: "fixed", text: "Sync: Garantía de visualización del estado 'Inactivo' para clubes prospectos." }
        ]
    },
    {
        version: "v4.95.1",
        date: "05 de Mayo, 2026",
        title: "FIX: Claridad en Estados de Suscripción",
        description: "Se corrigió la etiqueta de los clubes que aún no han contratado el servicio para que aparezcan como 'Inactivos' en lugar de 'Expirados'.",
        type: "fix",
        changes: [
            { type: "improved", text: "UI: Nueva etiqueta 'Inactivo' (gris) para suscripciones no iniciadas." },
            { type: "fixed", text: "Lógica: Diferenciación semántica entre 'Expirado' (vencido) e 'Inactivo' (nuevo)." }
        ]
    },
    {
        version: "v4.95.0",
        date: "05 de Mayo, 2026",
        title: "AUTOMATION: Suspensión Automática por Falta de Pago",
        description: "Se ha activado el sistema de protección de recursos que suspende automáticamente los sitios vencidos tras el periodo de gracia.",
        type: "feat",
        changes: [
            { type: "added", text: "Cron: Lógica de suspensión automática activada (5 días de gracia)." },
            { type: "improved", text: "Seguridad: Desactivación automática de acceso y dominios para clubes expirados." },
            { type: "added", text: "Notificaciones: Sistema de alertas críticas para clubes suspendidos." }
        ]
    },
    {
        version: "v4.94.0",
        date: "05 de Mayo, 2026",
        title: "DASHBOARD: Gestión Global de Suscripciones SaaS",
        description: "Nueva visualización centralizada para el SuperAdmin que permite monitorear el estado financiero y técnico de cada club.",
        type: "feat",
        changes: [
            { type: "added", text: "Visibilidad: Nueva columna de 'Suscripción' en la gestión de clubes." },
            { type: "added", text: "Alertas: Indicadores visuales de expiración (Activo, Vencido, Pendiente)." },
            { type: "added", text: "Control: Fecha exacta de vencimiento visible para seguimiento comercial." }
        ]
    },
    {
        version: "v4.93.4",
        date: "05 de Mayo, 2026",
        title: "DEPLOY: Sincronización Forzada de Servidor",
        description: "Se ha forzado un despliegue completo para asegurar que todos los cambios de branding y descripciones institucionales estén activos.",
        type: "feat",
        changes: [
            { type: "improved", text: "Branding: Sincronización total de logotipo y descripciones en Stripe." },
            { type: "fix", text: "Despliegue: Eliminación de caché persistente en el entorno de producción." }
        ]
    },
    {
        version: "v4.93.3",
        date: "05 de Mayo, 2026",
        title: "BRANDING: Logo de Producto y Refinamiento",
        description: "Se ha actualizado el logotipo al oficial de 'Club Platform for Rotary' y se han refinado los textos para asociaciones.",
        type: "update",
        changes: [
            { type: "improved", text: "Branding: Logotipo oficial de la plataforma activado." },
            { type: "improved", text: "Textos: Eliminación de referencias genéricas a 'Club' en descripciones de asociaciones." }
        ]
    },
    {
        version: "v4.93.1",
        date: "05 de Mayo, 2026",
        title: "BRANDING: Mejora Visual en Checkout",
        description: "Se ha añadido el logotipo institucional y una descripción detallada de los beneficios de la plataforma en la página de pago de Stripe.",
        type: "update",
        changes: [
            { type: "added", text: "Branding: Imagen de producto Club Platform activada en Stripe Checkout." },
            { type: "improved", text: "Transparencia: Descripción detallada de servicios (Hosting, IA, Seguridad) visible para el usuario al pagar." }
        ]
    },
    {
        version: "v4.93.0",
        date: "05 de Mayo, 2026",
        title: "RELEASE: Sistema Automatizado de Renovaciones SaaS",
        description: "Se ha completado la infraestructura de cobro automático, notificaciones por IA y gestión de suscripciones.",
        type: "major",
        changes: [
            { type: "added", text: "Cron Job: Cobrador automático activado con inteligencia artificial (Gemini) para WhatsApp y Email." },
            { type: "added", text: "Billing: Portal de facturación de Stripe integrado en el dashboard administrativo." },
            { type: "improved", text: "Webhooks: Sincronización mágica de pagos; la plataforma se reactiva automáticamente al detectar el pago." },
            { type: "changed", text: "Acceso: Se han restringido los ajustes avanzados solo para Super Administradores." }
        ]
    },
    {
        version: "v4.92.4",
        date: "05 de Mayo, 2026",
        title: "FEATURE: Gestión de Redes Sociales",
        description: "Se han reintegrado los campos de redes sociales en la pestaña de Identidad para facilitar la gestión de la presencia digital del club.",
        type: "feature",
        changes: [
            { type: "added", text: "Social: Inputs para Facebook, Instagram, X (Twitter), LinkedIn y YouTube ahora disponibles en Identidad." }
        ]
    },
    {
        version: "v4.92.3",
        date: "05 de Mayo, 2026",
        title: "SECURITY: Restricción de Ajustes Avanzados",
        description: "Se ha ocultado la pestaña de configuración avanzada para administradores de clubes, restringiéndola exclusivamente al Super Administrador.",
        type: "fix",
        changes: [
            { type: "fixed", text: "Privacidad: La gestión de dominios y configuraciones globales ahora solo es visible para el rol 'administrator'." }
        ]
    },
    {
        version: "v4.92.2",
        date: "05 de Mayo, 2026",
        title: "FIX: Ajuste de Tarifa de Renovación",
        description: "Sincronización del precio de renovación con el catálogo oficial de productos ($299 USD).",
        type: "fix",
        changes: [
            { type: "fixed", text: "Checkout: Se actualizó el monto de renovación de $150 a $299 USD para el primer pago de los clubes." }
        ]
    },
    {
        version: "v4.92.1",
        date: "05 de Mayo, 2026",
        title: "FIX: Permisos y Etiquetas de Renovación",
        description: "Corrección de acceso al portal de pagos para roles administrativos y sincronización de etiquetas de estado.",
        type: "fix",
        changes: [
            { type: "fixed", text: "Acceso Billing: Se habilitó el acceso al portal de Stripe para editores y usuarios administrativos del club." },
            { type: "fixed", text: "UI Sync: Forzado el estado 'Vencida' en la interfaz cuando el banner de renovación está activo." },
            { type: "improved", text: "Seguridad: Limpieza de variables de entorno en el historial de despliegue." }
        ]
    },
    {
        version: "v4.92.0",
        date: "05 de Mayo, 2026",
        title: "Botón de Renovación Directa y Sincronización",
        description: "Implementación de acceso directo a pagos desde la barra de vencimiento y mejoras en la sincronización de estado tras la renovación.",
        type: "feat",
        changes: [
            { type: "added", text: "CTA Directo: Se añadió un botón de 'Renovar Ahora' en la barra de alerta roja para facilitar el flujo de pago." },
            { type: "improved", text: "Sincronización: El sistema ahora detecta automáticamente el éxito del pago y actualiza el estado del sitio sin recargas manuales." },
            { type: "fix", text: "Conectividad: Se optimizaron las rutas de despliegue para superar bloqueos de red locales." }
        ]
    },
    {
        version: "v4.91.0",
        date: "05 de Mayo, 2026",
        title: "Consolidación de Configuración del Club",
        description: "Reorganización estructural del panel de control para mejorar la UX y centralizar la gestión administrativa.",
        type: "major",
        changes: [
            { type: "improved", text: "Consolidación: Se unificaron las secciones de configuración, anteriormente dispersas, en un panel jerárquico único." },
            { type: "fixed", text: "Navegación: Corregido el overflow de menús laterales en dispositivos de escritorio de baja resolución." }
        ]
    },
    {
        version: "v4.90.6",
        date: "05 de Mayo, 2026",
        title: "FIX: Estabilidad del Portal de Facturación",
        description: "Se optimizó el manejo de errores en la conexión con Stripe para evitar fallos de red silenciosos.",
        type: "patch",
        changes: [
            { type: "fixed", text: "Robustez: Implementado parseo seguro de respuestas del servidor para reportar errores técnicos de Stripe de forma clara." },
            { type: "improved", text: "UX: Mensajes amigables para clubes que aún no han realizado su primer pago de suscripción." }
        ]
    },
    {
        version: "v4.90.5",
        date: "05 de Mayo, 2026",
        title: "Permisos: Visibilidad del Portal de Facturación",
        description: "Se actualizó la matriz de permisos para permitir que los administradores globales (Súper Admins) puedan auditar y asistir a los clubes en su facturación.",
        type: "patch",
        changes: [
            { type: "fixed", text: "Visibilidad: El botón de Facturación y Suscripción ahora es visible para los Súper Administradores en el panel de configuración de cualquier club." }
        ]
    },
    {
        version: "v4.90.4",
        date: "05 de Mayo, 2026",
        title: "Renovación Autónoma SaaS & Portal de Facturación",
        description: "Implementación del ecosistema de autogestión financiera para los clubes.",
        type: "major",
        changes: [
            { type: "added", text: "Automatización de Renovaciones (Cron Job): Generación dinámica de mensajes persuasivos usando IA y envío masivo vía WhatsApp Business API." },
            { type: "added", text: "Portal de Autoservicio: Integración de Billing Portal de Stripe para gestionar métodos de pago y descargar facturas." },
            { type: "fixed", text: "Reactivación Automática: Webhook para extender la fecha de expiración y habilitar el estatus 'active' automáticamente tras el pago." }
        ]
    },
    {
        version: "v4.90.3",
        date: "29 de Abril, 2026",
        title: "FIX: Persistencia de Leads y Checkout",
        description: "Core Fix: Persistencia de Formularios y Checkout",
        changes: [
            { type: "added", text: "Implementación real del flujo de Checkout: ahora las donaciones y pagos de membresía se guardan en la base de datos." },
            { type: "improved", text: "Mejora en la resolución de clubId para el formulario de contacto (fallback automático vía URL)." },
            { type: "added", text: "Enriquecimiento de metadatos en leads para trazabilidad de dominio y origen." },
            { type: "fixed", text: "Corrección en el trigger de orquestación de agentes para nuevos contactos." }
        ],
        type: "fix"
    },
    {
        version: "v4.90.2",
        date: "29 de Abril, 2026",
        title: "Refinamiento de Mensajería WhatsApp",
        description: "Optimización del copy automatizado para el contacto con soporte técnico.",
        type: "patch" as const,
        changes: [
            { type: "improved", text: "Mensajería: Se eliminó la redundancia de 'mi club rotario' en el mensaje de WhatsApp para una comunicación más limpia y profesional." }
        ]
    },
    {
        version: "v4.90.1",
        date: "29 de Abril, 2026",
        title: "Integración de Soporte WhatsApp",
        description: "Automatización del contacto a soporte desde el banner de desarrollo con mensajes personalizados por club.",
        type: "patch" as const,
        changes: [
            { type: "added", text: "Banner Desarrollo: El botón de soporte ahora abre WhatsApp con un mensaje pre-llenado que incluye el nombre del club y el enlace del sitio." },
            { type: "improved", text: "UX: Configurado el número de soporte oficial (+57 320 5028376) para atención inmediata." }
        ]
    },
    {
        version: "v4.90.0",
        date: "29 de Abril, 2026",
        title: "Modo Desarrollo y Estabilización Administrativa",
        description: "Implementación del sistema de banners de 'Modo Desarrollo' y optimización de formularios para clubes con dominios propios.",
        type: "major" as const,
        changes: [
            { type: "added", text: "Superadmin: Nuevo sistema de 'Banner de Desarrollo' para marcar sitios en construcción." },
            { type: "fixed", text: "Estabilidad: Corregido error crítico de enrutamiento que causaba pantalla en blanco tras inyectar componentes globales." },
            { type: "improved", text: "Gestión: El campo 'Subdominio' ahora es opcional en la gestión de clubes para facilitar el manejo de dominios externos." },
            { type: "improved", text: "UI: El banner de desarrollo incluye una espera de 15 segundos antes de aparecer para una experiencia menos intrusiva." }
        ]
    },
    {
        version: "v4.89.0",
        date: "25 de Abril, 2026",
        title: "Galería Multimedia: Soporte de Videos Directos",
        description: "Los videos subidos directamente a la plataforma (S3) ahora se reproducen correctamente en la galería multimedia del blog, junto con los de YouTube.",
        type: "feature" as const,
        changes: [
            { type: "fixed", text: "Videos subidos a S3 ahora se reproducen con reproductor HTML5 nativo." },
            { type: "fixed", text: "Lightbox ahora detecta YouTube vs archivos directos automáticamente." },
            { type: "improved", text: "Thumbnails de video muestran previsualización real del archivo." },
            { type: "improved", text: "Video principal del artículo también soporta archivos directos." }
        ]
    },
    {
        version: "v4.88.4",
        date: "25 de Abril, 2026",
        title: "Fix Upload Dependencies",
        description: "Agregadas dependencias faltantes (multer, multer-s3) al registro de paquetes para compatibilidad con Vercel serverless.",
        type: "urgent" as const,
        changes: [
            { type: "fixed", text: "multer y multer-s3 agregados a package.json (faltaban como dependencias directas)." },
            { type: "fixed", text: "Resuelto ERR_MODULE_NOT_FOUND en subida de archivos en producción." }
        ]
    },
    {
        version: "v4.88.3",
        date: "25 de Abril, 2026",
        title: "Upload Engine Rewrite",
        description: "Motor de subida completamente reescrito con S3 client minimalista integrado, eliminando dependencia de storage.js para subidas.",
        type: "urgent" as const,
        changes: [
            { type: "fixed", text: "S3 client creado directamente en media.js — ya no carga storage.js pesado." },
            { type: "fixed", text: "Carga paralela de multer + AWS SDK en un solo await." },
            { type: "improved", text: "Tiempo de cold-start para subidas reducido dramáticamente." }
        ]
    },
    {
        version: "v4.88.2",
        date: "25 de Abril, 2026",
        title: "Media Library Stability Fix",
        description: "Corregida regresión en la carga de archivos: multer y todas las dependencias ahora son 100% lazy-loaded.",
        type: "urgent" as const,
        changes: [
            { type: "fixed", text: "Eliminado import top-level de multer que causaba fallo en la carga del módulo." },
            { type: "fixed", text: "GET /api/media ahora solo depende de express, db y auth para respuesta instantánea." },
            { type: "improved", text: "Subida de archivos usa multer lazy-loaded para compatibilidad total con Vercel." }
        ]
    },
    {
        version: "v4.88.1",
        date: "25 de Abril, 2026",
        title: "Media Upload Fix",
        description: "Reparada la subida de archivos en la Librería de Medios, corrigiendo la compatibilidad de módulos en el servidor.",
        type: "urgent" as const,
        changes: [
            { type: "fixed", text: "Corregida la incompatibilidad CJS/ESM en los comandos de AWS S3." },
            { type: "fixed", text: "Instancia local de multer para parseo inmediato de archivos sin dependencias pesadas." },
            { type: "improved", text: "Separación de lazy-loaders para S3 Client y AWS Commands." }
        ]
    },
    {
        version: "v4.88.0",
        date: "25 de Abril, 2026",
        title: "Media Library Cold-Start Fix",
        description: "Se resolvió el timeout crítico en la Librería de Medios causado por la inicialización de módulos nativos pesados (sharp/S3) durante el arranque en frío del servidor.",
        type: "urgent" as const,
        changes: [
            { type: "fixed", text: "Convertida la importación de sharp y S3 a carga diferida (lazy loading)." },
            { type: "fixed", text: "La ruta GET /api/media ahora responde instantáneamente sin cargar módulos innecesarios." },
            { type: "improved", text: "Los módulos pesados solo se cargan cuando se necesitan (upload, delete)." }
        ]
    },
    {
        version: "v4.87.3",
        date: "25 de Abril, 2026",
        title: "Forensic Media Library Inspection",
        description: "Se implementaron herramientas de diagnóstico forense para identificar fallas en la visibilidad de archivos en sitios individuales.",
        type: "urgent" as const,
        changes: [
            { type: "fixed", text: "Reparada inconsistencia de districtId en clubes del distrito 4271." },
            { type: "improved", text: "Inyección de hooks de diagnóstico para auditoría de sesión en tiempo real." }
        ]
    },
    {
        version: "v4.87.1",
        date: "25 de Abril, 2026",
        title: "Media Library District Scope Fix",
        description: "Se habilitó la visibilidad de archivos multimedia de todos los clubes del distrito para administradores de distrito.",
        type: "improvement" as const,
        changes: [
            { type: "fixed", text: "Corregido el alcance de la consulta de medios para roles de district_admin." },
            { type: "improved", text: "Agregación automática de archivos huérfanos en la vista de distrito." }
        ]
    },
    {
        version: "v4.87.0",
        date: "24 de Abril, 2026",
        title: "Lead Dashboard Stabilization & Forensic Recovery",
        description: "Estabilización final del panel de leads. Se restauraron 62 registros históricos desde S3 y se corrigió la lógica de agregación para administradores de distrito.",
        type: "improvement" as const,
        changes: [
            { type: "fixed", text: "Forensic Lead Recovery (62 records)" },
            { type: "fixed", text: "District aggregation logic patch" },
            { type: "improved", text: "Status casing normalization" }
        ]
    },
    {
        version: "v4.86.9",
        date: "24 de Abril, 2026",
        title: "Trazabilidad de Carga & Lead Recovery Init",
        description: "Se habilitó telemetría avanzada y se inició el proceso de recuperación de leads históricos mediante escaneo de S3.",
        type: "improvement" as const
    },
    {
        version: "v4.86.7",
        date: "24 de Abril, 2026",
        title: "Doble Protección de Timeout",
        description: "Se implementó una capa redundante de timeout por software para garantizar que el servidor responda incluso si los servicios de infraestructura (S3) no responden a tiempo.",
        type: "improvement" as const
    },
    {
        version: "v4.86.6",
        date: "24 de Abril, 2026",
        title: "Mitigación de Timeouts (S3)",
        description: "Se configuraron tiempos de espera agresivos (5s) en la conexión con la infraestructura de almacenamiento para evitar bloqueos prolongados y caídas por timeout de función.",
        type: "improvement" as const
    },
    {
        version: "v4.86.5",
        date: "24 de Abril, 2026",
        title: "Estabilidad de Respuesta del Servidor",
        description: "Se corrigió un fallo en el procesamiento de errores del frontend (clonación de respuesta) y se habilitaron herramientas de diagnóstico de red en tiempo real.",
        type: "improvement" as const
    },
    {
        version: "v4.86.4",
        date: "24 de Abril, 2026",
        title: "Diagnóstico Avanzado de Errores",
        description: "Se mejoró el sistema de alertas para capturar errores de texto plano del servidor y se migró la persistencia de configuración global a Prisma para mayor estabilidad.",
        type: "improvement" as const
    },
    {
        version: "v4.86.3",
        date: "24 de Abril, 2026",
        title: "Robustez en Conexión de Carga",
        description: "Se optimizó el enrutamiento de API para mejorar la compatibilidad en redes restringidas y se habilitó el soporte oficial para logos en formato SVG.",
        type: "improvement" as const
    },
    {
        version: "v4.86.2",
        date: "24 de Abril, 2026",
        title: "Estabilización de Carga de Archivos",
        description: "Se corrigieron errores críticos en los selectores de archivos y se optimizó el procesamiento de imágenes (toBlob) para evitar bloqueos en la subida. Se activó el recorte inteligente (auto-trim) en el servidor para logos.",
        type: "improvement" as const
    },
    {
        version: "v4.86.1",
        date: "24 de Abril, 2026",
        title: "Reparación de Logo en Login",
        description: "Se corrigió un error en el fetch del logo del panel de administración que impedía su visualización. Se aplicó también el rebranding de 'Club Platform for Rotary' en el footer del login.",
        type: "bugfix" as const
    },
    {
        version: "v4.86.0",
        date: "24 de Abril, 2026",
        title: "Rebranding: Club Platform for Rotary",
        description: "Actualización de la identidad de marca en el footer: transición de 'Valkomen' a 'Club Platform for Rotary' con enlace directo al portal administrativo.",
        type: "feature" as const
    },
    {
        version: "v4.85.9",
        date: "24 de Abril, 2026",
        title: "BUGFIX: Funcionamiento del Botón de Cierre",
        description: "Corrección de un error de referencia que impedía cerrar el banner de vencimiento. El botón 'X' ahora funciona correctamente y activa el ciclo de reactivación de 10 segundos.",
        type: "bugfix" as const
    },
    {
        version: "v4.85.8",
        date: "24 de Abril, 2026",
        title: "Penalty Mode: Auto-Reactivación",
        description: "Mejora del sistema de penalización: el banner ahora permite ser cerrado pero se reactiva automáticamente cada 10 segundos, manteniendo la presión administrativa de forma inteligente.",
        type: "feature" as const
    },
    {
        version: "v4.85.7",
        date: "24 de Abril, 2026",
        title: "Banner: Ajuste de Copy y Tipografía",
        description: "Actualización del mensaje de advertencia para incluir 'bloqueos' y ajuste preciso del tamaño de fuente a 13px para mayor claridad.",
        type: "feature" as const
    },
    {
        version: "v4.85.6",
        date: "24 de Abril, 2026",
        title: "Aviso: Restauración de Etiqueta Premium",
        description: "Restauración del diseño original de la etiqueta 'Vencimiento' en caja de alto contraste, manteniendo el texto centrado y estático para una legibilidad óptima.",
        type: "feature" as const
    },
    {
        version: "v4.85.5",
        date: "24 de Abril, 2026",
        title: "Banner: Estética Estática y Centrada",
        description: "Ajuste final del banner de vencimiento: centrado del texto, eliminación de negritas y desactivación de animaciones para una presentación más sobria y directa.",
        type: "feature" as const
    },
    {
        version: "v4.85.4",
        date: "24 de Abril, 2026",
        title: "Penalty Mode & Marquee Alerts",
        description: "Activación del modo de penalización: el banner ahora es no-cerrable (X removida) y cuenta con un efecto 'marquee' para asegurar que el mensaje completo sea legible sin importar su longitud.",
        type: "feature" as const
    },
    {
        version: "v4.85.3",
        date: "24 de Abril, 2026",
        title: "Dynamic Alerts & Sticky Layout",
        description: "Implementación de años de renovación dinámicos (Auto-update 2026-2027) y sistema de 'Sticky Stacking' para que el banner permanezca visible durante el desplazamiento sin cubrir el menú principal.",
        type: "feature" as const
    },
    {
        version: "v4.85.2",
        date: "24 de Abril, 2026",
        title: "Aesthetix: Optimización de Banner Global",
        description: "Refinamiento estético del banner de notificaciones para garantizar una visualización en una sola línea y mejorar la legibilidad en dispositivos móviles y escritorio.",
        type: "feature" as const
    },
    {
        version: "v4.85.1",
        date: "24 de Abril, 2026",
        title: "HOTFIX: Restauración de Visibilidad Administrativa",
        description: "Corrección crítica de error de sintaxis en el controlador central que impedía la visualización de datos en las tablas de gestión (Clubes, Usuarios, Asociaciones).",
        type: "urgent" as const
    },
    {
        version: "v4.85.0",
        date: "24 de Abril, 2026",
        title: "Supervisión: Alertas de Vencimiento (v4.85.0) 🚨🛡️",
        description: "Nueva herramienta de gestión para Super Administradores sobre el estado de suscripción de los clubes.",
        type: "update",
        changes: [
            { type: "added", text: "Superadmin: Implementado panel de 'Supervisión Administrativa' para activar banners de advertencia por vencimiento." },
            { type: "added", text: "Frontend: Nuevo componente global de alerta profesional para sitios con periodos de renovación pendientes." },
            { type: "improved", text: "Backend: Extendida la infraestructura de datos de Clubes para soportar estados de suspensión y avisos globales." }
        ]
    },
    {
        version: "v4.84.0",
        date: "24 de Abril, 2026",
        title: "Enrutamiento: Navegación Limpia (v4.84.0) 🔗💎",
        description: "Optimización de enlaces permanentes para la Conferencia LATIR.",
        type: "update",
        changes: [
            { type: "fixed", text: "Navegación: Eliminado el símbolo '#' (hash) de la redirección de /conferencia para un acceso más rápido y limpio." },
            { type: "improved", text: "Estabilidad: Sincronización del enrutamiento de Vercel con el motor de navegación de la aplicación." }
        ]
    },
    {
        version: "v4.83.0",
        date: "24 de Abril, 2026",
        title: "SISTEMA ACTUALIZADO: Multimedia & Eventos (v4.83.0) 🚀💎",
        description: "Reparación del sistema de eventos LATIR e incremento masivo en capacidad de carga multimedia.",
        type: "update",
        changes: [
            { type: "fixed", text: "Eventos: Restaurada la carga de detalles mediante la sincronización del campo 'metadata' en la base de datos." },
            { type: "improved", text: "Conferencia: Reparado el enlace /conferencia y optimizada la navegación en la sección especial de LATIR." },
            { type: "improved", text: "Multimedia: Límite de subida aumentado de 15MB a 50MB para soportar videos de WhatsApp y fotos pesadas." },
            { type: "added", text: "Admin: Nuevo sistema de reporte de errores detallado en la subida de imágenes de portada y galería." }
        ]
    },
    {
        version: "v4.80.0",
        date: "23 de Abril, 2026",
        title: "Núcleo: Estabilidad Elástica (v4.80.0) 🛡️🛠️",
        description: "Hibridación de lógica v4.69 con motor de datos Prisma para sanar el login y la identidad.",
        type: "update",
        changes: [
            { type: "fixed", text: "Infraestructura: Migración de Auth y Clubs a Prisma para eliminar el 'Server Error'." },
            { type: "improved", text: "Identidad: Restauración total de multimedia y logos mediante consulta resiliente." },
            { type: "fixed", text: "Compilación: Reparación de error de sintaxis en MissionControlVIP que bloqueaba despliegues." }
        ]
    },
    {
        version: "v4.79.0",
        date: "23 de Abril, 2026",
        title: "Núcleo: Restauración Atómica (v4.79.0) 🛡️💎",
        description: "Reversión total sincronizada (Frontend + Backend) para sanar la identidad.",
        type: "rollback",
        changes: [
            { type: "rollback", text: "Integridad: Sincronización de ClubContext y useSiteImages con el Backend estable." },
            { type: "fixed", text: "Identidad: Eliminación definitiva del estado 'Cargando Club' perpetuo." },
            { type: "improved", text: "Estabilidad: Restauración total del flujo de multimedia en el sitio público y admin." }
        ]
    },
    {
        version: "v4.78.0",
        date: "23 de Abril, 2026",
        title: "Núcleo: Identidad de Alta Fidelidad (v4.78.0) 🛡️🎯",
        description: "Buscador blindado contra filtros de status y errores de dominio.",
        type: "major",
        changes: [
            { type: "added", text: "Buscador: Implementada coincidencia Case-Insensitive (LOWER) y limpieza de www." },
            { type: "fixed", text: "Failsafe: Se eliminó el filtro de status para asegurar carga de identidad en cualquier estado." },
            { type: "improved", text: "Log: Añadida telemetría de identidad (IDENTITY_PROBE) para diagnóstico en vivo." }
        ]
    },
    {
        version: "v4.77.0",
        date: "23 de Abril, 2026",
        title: "Núcleo: Restauración de Estabilidad (v4.77.0) 🛡️📉",
        description: "Rollback total a v4.69.0 para recuperar la integridad visual del sitio.",
        type: "rollback",
        changes: [
            { type: "rollback", text: "Código: Reversión completa a la estructura estable de la v4.69.0." },
            { type: "removed", text: "Banner: Eliminada la barra de urgencia que bloqueaba el renderizado del Header." },
            { type: "fixed", text: "Identidad: Restauración inmediata de logos y multimedia para Nuevo Cali." }
        ]
    },
    {
        version: "v4.69.0",
        date: "23 de Abril, 2026",
        title: "Datos & CRM: Sonda de Rescate (v4.69.0) 🏹🛡️",
        description: "Búsqueda focalizada por contenido ('Maria') en tablas sospechosas.",
        type: "major",
        changes: [
            { type: "added", text: "Diagnóstico: Escaneo inteligente de tablas tipo Lead/Contact/Multimedia." },
            { type: "fixed", text: "Visibilidad: Corrección del spinner infinito y auditoría de datos por nombre." },
            { type: "improved", text: "Rescate: Localización precisa de los 11 contactos de la galería." }
        ]
    },
    {
        version: "v4.52.0",
        date: "23 de Abril, 2026",
        title: "Omnicanalidad & Social Hub: Despliegue Épico 🚀💎",
        description: "Versión final consolidada con selector de Fan Pages y optimización visual.",
        type: "major",
        changes: [
            { type: "added", text: "Social Hub: Selector dinámico de Fan Pages para Facebook." },
            { type: "improved", text: "UI: Contraste premium en el panel de omnicanalidad." },
            { type: "fixed", text: "Sintaxis: Limpieza de etiquetas redundantes en el motor de proyectos." }
        ]
    },
    {
        version: "v4.51.0",
        date: "23 de Abril, 2026",
        title: "Omnicanalidad Social: Full Roll-out 🚀💎",
        description: "Despliegue final y total del ecosistema de publicación masiva.",
        type: "major",
        changes: [
            { type: "added", text: "Social Hub: Activación global del motor de conexiones OAuth." },
            { type: "added", text: "Omnicanalidad: Integración total en Noticias, Proyectos y Eventos." },
            { type: "improved", text: "Estabilidad: Purga profunda de caché y sincronización de versiones." }
        ]
    },
    {
        version: "v4.50.0",
        date: "23 de Abril, 2026",
        title: "Hub Social & Omnicanalidad 🚀🌐",
        description: "Unificación de la estrategia digital del club en un solo ecosistema.",
        type: "major",
        changes: [
            { type: "added", text: "Social Hub: Nuevo centro de mando para gestionar conexiones OAuth oficiales." },
            { type: "added", text: "Omnicanalidad: Panel de lanzamiento integrado en Noticias, Proyectos y Eventos." },
            { type: "improved", text: "UX: Vista previa social en tiempo real y toggles de publicación rápida." },
            { type: "major", text: "Estrategia: Capacidad de difusión multidispositivo sincronizada." }
        ]
    },
    {
        version: "v4.49.0",
        date: "23 de Abril, 2026",
        title: "Pie de Página Omnicanal 🌐✨",
        description: "Visualización dinámica de redes sociales en el sitio público.",
        type: "major",
        changes: [
            { type: "added", text: "Sitio: Integrados iconos de las 6 redes sociales (LinkedIn, TikTok, etc.) en el Footer público." },
            { type: "improved", text: "API: Mapeo automático de enlaces sociales desde la administración a la web pública." },
            { type: "fixed", text: "Consistencia: Sincronización de llaves de datos entre el panel y el sitio web." }
        ]
    },
    {
        version: "v4.48.1",
        date: "23 de Abril, 2026",
        title: "Build Fix: Compatibilidad de Iconos 🛠️",
        description: "Reparación de error de exportación de Lucide para Tiktok.",
        type: "patch",
        changes: [
            { type: "fixed", text: "Vercel: Sustituido icono Tiktok por Music para asegurar compatibilidad con el motor de build." }
        ]
    },
    {
        version: "v4.48.0",
        date: "23 de Abril, 2026",
        title: "Omnicanalidad: Soporte TikTok 🎵✨",
        description: "Integración de TikTok y consolidación del ecosistema social.",
        type: "major",
        changes: [
            { type: "added", text: "Redes: Incorporado soporte nativo para TikTok en el perfil del club." },
            { type: "improved", text: "Integridad: Sincronización total de guardado para el set completo de redes (6 canales)." },
            { type: "major", text: "Estética: Finalizada la expansión de iconos sociales en el panel Mi Sitio." }
        ]
    },
    {
        version: "v4.47.0",
        date: "23 de Abril, 2026",
        title: "Conectividad Social: LinkedIn & Fix Guardado 🔗",
        description: "Reparación de persistencia social y soporte para LinkedIn.",
        type: "major",
        changes: [
            { type: "fixed", text: "Guardado: Reparada la comunicación con el servidor para redes sociales individuales." },
            { type: "added", text: "Redes: Incorporado campo de LinkedIn en Perfil de Mi Sitio y Configuraciones." },
            { type: "improved", text: "UI: Restaurada integridad de iconos de Lucide en el panel administrativo." }
        ]
    },
    {
        version: "v4.46.0",
        date: "23 de Abril, 2026",
        title: "Identidad Visual: Precision Auto-Crop 🎞️",
        description: "Implementación de motor de detección de bordes para logos institucionales.",
        type: "major",
        changes: [
            { type: "improved", text: "Estética: Recorte automático de márgenes blancos en logos de clubes/distritos/asociaciones." },
            { type: "major", text: "Consistencia: Sincronización del motor de precisión en Onboarding y Ajustes." },
            { type: "improved", text: "UX: Pre-selección inteligente del área de contenido para imágenes corporativas." }
        ]
    },
    {
        version: "v4.45.0",
        date: "22 de Abril, 2026",
        title: "Content Studio: Black Box Diagnostics 📡",
        description: "Visibilidad técnica de estados de IA y telemetría profunda de video.",
        type: "major",
        changes: [
            { type: "improved", text: "Diagnóstico: Implementada visualización de estados internos de KIE.ai." },
            { type: "fix", text: "Infraestructura: Añadido campo de persistencia para respuestas crudas de la IA." },
            { type: "major", text: "Transparencia: Ahora el sistema muestra el estado técnico real de los videos." }
        ]
    },
    {
        version: "v4.44.0",
        date: "22 de Abril, 2026",
        title: "Content Studio: Advanced Telemetry 📡",
        description: "Optimización del mapeo de estados y monitoreo profundo de la IA.",
        type: "major",
        changes: [
            { type: "improved", text: "Telemetría: Soporte ampliado para estados SUCCESS, ERROR y RUNNING de KIE.ai." },
            { type: "fix", text: "Estabilidad: Refuerzo del radar de seguimiento para evitar bloqueos en procesamiento." },
            { type: "major", text: "Diagnóstico: Mejorada la visibilidad interna del progreso de renderizado." }
        ]
    },
    {
        version: "v4.43.0",
        date: "22 de Abril, 2026",
        title: "Content Studio: Library Sovereignty 🗑️",
        description: "Habilitación de gestión total de proyectos y borrado de biblioteca.",
        type: "major",
        changes: [
            { type: "fix", text: "Biblioteca: Habilitado botón de eliminación para proyectos fallidos o atascados." },
            { type: "improved", text: "Interfaz: Implementación de confirmación de borrado y estados consistentes." },
            { type: "major", text: "Control: Capacidad total para limpiar la biblioteca y reintentar generaciones." }
        ]
    },
    {
        version: "v4.42.0",
        date: "22 de Abril, 2026",
        title: "Content Studio: Auto-Radar Tracking 📡",
        description: "Implementación de monitoreo automático para el estado de generación de videos.",
        type: "major",
        changes: [
            { type: "improved", text: "Biblioteca: Implementado Auto-Polling cada 30 segundos para proyectos en proceso." },
            { type: "fix", text: "Experiencia: Los videos cambian a 'Listo' automáticamente sin refrescar." },
            { type: "major", text: "Sincronización: Conectividad proactiva con el estado de tareas de KIE.ai." }
        ]
    },
    {
        version: "v4.41.0",
        date: "22 de Abril, 2026",
        title: "Content Studio: AI Key Bridge 🗝️",
        description: "Validación de credenciales y activación del motor de generación por IA.",
        type: "major",
        changes: [
            { type: "fix", text: "Database: Confirmada sincronización exitosa de tablas (VideoProject)." },
            { type: "improved", text: "Seguridad: Implementado validador de configuración para KIE_API_KEY." },
            { type: "major", text: "Generación: El sistema está listo para enviar tareas a KIE.ai." }
        ]
    },
    {
        version: "v4.40.0",
        date: "22 de Abril, 2026",
        title: "Content Studio: Auto-Sync Active ⚙️",
        description: "Automatización de la sincronización de base de datos durante el despliegue de Vercel.",
        type: "major",
        changes: [
            { type: "improved", text: "Infraestructura: Inyección de db push automático en el proceso de build." },
            { type: "fix", text: "Base de Datos: Resolución garantizada de tablas faltantes (VideoProject)." },
            { type: "major", text: "Autonomía: El sistema ahora auto-repara discrepancias de esquema." }
        ]
    },
    {
        version: "v4.39.0",
        date: "22 de Abril, 2026",
        title: "Content Studio: Database Readiness 🏗️",
        description: "Preparación y validación de la infraestructura de tablas para el motor de video.",
        type: "major",
        changes: [
            { type: "fix", text: "Database: Requerimiento de sincronización de tabla VideoProject." },
            { type: "improved", text: "Estabilidad: Refuerzo de la integridad del esquema Prisma." },
            { type: "major", text: "Infraestructura: Preparación para almacenamiento de tareas KIE.ai." }
        ]
    },
    {
        version: "v4.38.0",
        date: "22 de Abril, 2026",
        title: "Content Studio: Transparencia Total 🔓",
        description: "Sincronización del frontend para reportar errores técnicos detallados del servidor.",
        type: "major",
        changes: [
            { type: "improved", text: "Frontend: Activación de lectura de mensajes de error dinámicos." },
            { type: "fix", text: "Transparencia: Eliminación de mensajes de error genéricos y hardcoded." },
            { type: "major", text: "Diagnóstico: Capacidad total para identificar fallos de DB en vivo." }
        ]
    },
    {
        version: "v4.37.0",
        date: "22 de Abril, 2026",
        title: "Content Studio: Integrity & Telemetry 📡",
        description: "Mejora de la trazabilidad de errores en el motor de video y reporte detallado.",
        type: "major",
        changes: [
            { type: "improved", text: "Telemetría: Activación de reportes de error detallados desde Prisma." },
            { type: "fix", text: "Diagnóstico: Preparación para identificar fallos de integridad de datos." },
            { type: "major", text: "Estabilidad: Refuerzo del log de errores en el servidor." }
        ]
    },
    {
        version: "v4.36.0",
        date: "22 de Abril, 2026",
        title: "Content Studio: Remotion Sync 🎬",
        description: "Sincronización del controlador de video con el esquema de base de datos (kieJobId).",
        type: "major",
        changes: [
            { type: "fix", text: "Motor: Reparación del mapeo de externalTaskId -> kieJobId." },
            { type: "fixed", text: "Database: Persistencia garantizada de los IDs de tarea de KIE.ai." },
            { type: "improved", text: "Render: Desbloqueo del flujo de renderizado de video por IA." }
        ]
    },
    {
        version: "v4.35.0",
        date: "22 de Abril, 2026",
        title: "ArticulIA: SEO Precision Update ⚖️",
        description: "Control estricto de longitud de caracteres para SEO (60 para Títulos, 160 para Descripciones).",
        type: "major",
        changes: [
            { type: "major", text: "Motor: Límites estrictos inyectados en el prompt de la IA." },
            { type: "added", text: "Frontend: Auto-recorte inteligente en espacios para no exceder límites." },
            { type: "improved", text: "Sincronización: Título, Cuerpo y SEO alineados perfectamente." }
        ]
    },
    {
        version: "v4.30.0",
        date: "22 de Abril, 2026",
        title: "ArticulIA: Sincronización Estructural 🏗️",
        description: "Alineación total de la IA con el esquema de datos real y blindaje contra sobreescritura.",
        type: "major",
        changes: [
            { type: "major", text: "Motor: Corrección de campos (category/tags) para alineación con DB." },
            { type: "fixed", text: "React: Migración a actualizaciones funcionales en TODOS los inputs." },
            { type: "improved", text: "Blindaje: Quill ya no puede borrar el título durante la generación." }
        ]
    },
    {
        version: "v4.25.0",
        date: "22 de Abril, 2026",
        title: "ArticulIA: Estabilidad Atómica (Final) ☢️",
        description: "Reparación crítica del cierre de estado (Stale Closure) para garantizar la población de campos.",
        type: "major",
        changes: [
            { type: "major", text: "Motor: Implementación de actualización funcional (prev => ...) en formData." },
            { type: "fixed", text: "Sync: Reparación del bug de 'Título Vacío' mediante inyección forzada." },
            { type: "improved", text: "Estado: Sincronización total de Título, Cuerpo y Categorías garantizada." }
        ]
    },
    {
        version: "v4.21.0",
        date: "22 de Abril, 2026",
        title: "ArticulIA: Sincronización Atómica 🧱",
        description: "Nueva arquitectura de actualización de estado para garantizar que Título, Cuerpo y Categorías se pinten simultáneamente.",
        type: "major",
        changes: [
            { type: "major", text: "Motor: Actualización atómica de formData para evitar race-conditions." },
            { type: "added", text: "Estabilidad: Fallback de categorías 'Rotary, Comunidad, Acción' garantizado." },
            { type: "improved", text: "Sync: Los campos se pueblan de forma coordinada y síncrona." }
        ]
    },
    {
        version: "v4.20.0",
        date: "22 de Abril, 2026",
        title: "ArticulIA: Estabilidad Galáctica 🌌",
        description: "Salto de arquitectura mayor para garantizar la captura del 100% de los datos de redacción.",
        type: "major",
        changes: [
            { type: "major", text: "Motor: Nuevo sistema de captura universal noticia_titulo + noticia_categorias." },
            { type: "added", text: "Título: Generación automática de emergencia desde el contenido." },
            { type: "improved", text: "Categorías: Soporte para múltiples formatos y sugerencias inteligentes." }
        ]
    },
    {
        version: "v4.18.2",
        date: "22 de Abril, 2026",
        title: "ArticulIA: Integración Total 🚀",
        description: "Automatización completa de Título, Cuerpo y Categorías en un solo clic.",
        type: "update",
        changes: [
            { type: "added", text: "Motor: Generación automática de categorías sugeridas." },
            { type: "fixed", text: "Sincronía: Título y Cuerpo ahora se inyectan simultáneamente." },
            { type: "improved", text: "Estabilidad: Blindaje total de captura de datos v4.18.2." }
        ]
    },
    {
        version: "v4.18.1",
        date: "22 de Abril, 2026",
        title: "ArticulIA: Estabilidad Total 💎",
        description: "Reparación de sintaxis en el motor de redacción y activación final de v4.18.1.",
        type: "update",
        changes: [
            { type: "fixed", text: "Compilación: Eliminado error de sintaxis en el mapeo de redes sociales." },
            { type: "improved", text: "Estabilidad: Captura de campos optimizada y blindaje de títulos activo." },
            { type: "major", text: "Sistema: Salto a la versión de producción v4.18.1." }
        ]
    },
    {
        version: "v4.18.0",
        date: "22 de Abril, 2026",
        title: "ArticulIA: Estabilidad Galáctica 🌌",
        description: "Salto de versión mayor para purgar definitivamente el caché de Vercel y activar las mejoras de redacción.",
        type: "major",
        changes: [
            { type: "major", text: "Sistema: Salto definitivo a v4.18.0." },
            { type: "fixed", text: "Motor: Blindaje total de títulos y captura de datos activada." },
            { type: "improved", text: "Cache: Purga masiva de Vercel y Vite." }
        ]
    },
    {
        version: "v4.17.1",
        date: "22 de Abril, 2026",
        title: "ArticulIA: Estabilidad Absoluta 💎",
        description: "Salto de versión para romper estancamiento de caché y activar blindaje total de redacción.",
        type: "major",
        changes: [
            { type: "major", text: "Sistema: Salto forzado a v4.17.1 para purga de Vercel." },
            { type: "fixed", text: "Motor: Activación del blindaje de títulos y captura multi-formato." },
            { type: "improved", text: "Cache: Disruptor temporal inyectado en el core del servidor." }
        ]
    },
    {
        version: "v4.16.4",
        date: "22 de Abril, 2026",
        title: "ArticulIA: Blindaje Anti-Errores 🛡️",
        description: "Máxima estabilidad en la captura de datos. Implementación de 'Self-Healing' que asegura que el título siempre se genere, incluso con fallos de la IA.",
        type: "update",
        changes: [
            { type: "added", text: "Motor: Autocorrección de títulos basada en el contenido." },
            { type: "improved", text: "Estabilidad: Manejo de respuestas en formato Array y Objetos complejos." },
            { type: "major", text: "Sistema: Salto a la versión definitiva v4.16.4." }
        ]
    },
    {
        version: "v4.16.3",
        date: "22 de Abril, 2026",
        title: "ArticulIA: Refuerzo de Captura 🛡️",
        description: "Mejora en la detección de campos para asegurar que el título y otros metadatos se capturen correctamente sin importar el formato de la IA.",
        type: "update",
        changes: [
            { type: "improved", text: "Interfaz: Mapeo avanzado de campos (titular, headline, etc.)." },
            { type: "fixed", text: "Servidor: Eliminación de redundancia en prompts." },
            { type: "improved", text: "Sistema: Actualización a la versión de estabilidad v4.16.3." }
        ]
    },
    {
        version: "v4.16.2",
        date: "22 de Abril, 2026",
        title: "ArticulIA: Sincronización SEO-News 🔗",
        description: "Unificación total del motor de redacción con el módulo de SEO para garantizar estabilidad 100% y compatibilidad con Gemini 1.5.",
        type: "update",
        changes: [
            { type: "added", text: "Motor: Migración exitosa al endpoint central /api/ai/generate-article." },
            { type: "improved", text: "Estabilidad: Réplica exacta de la lógica de redacción del módulo SEO." },
            { type: "major", text: "Sistema: Eliminación de cápsulas redundantes y activación de v4.16.2." }
        ]
    },
    {
        version: "v4.16.1",
        date: "22 de Abril, 2026",
        title: "ArticulIA: Formato JSON Estricto 💎",
        description: "Optimización final del motor de redacción: Activación de 'Strict JSON Mode' para eliminar errores de formato de la IA.",
        type: "update",
        changes: [
            { type: "improved", text: "Motor: Activación de responseMimeType: application/json." },
            { type: "fixed", text: "Estabilidad: Eliminación de bloques de texto innecesarios de Gemini." },
            { type: "improved", text: "Sistema: Salto a la versión de precisión v4.16.1." }
        ]
    },
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
        date: "21 de Abril, 2026",
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
        case 'hotfix': 
        case 'urgent': return 'bg-red-50 text-red-700 border-red-200';
        case 'feature': 
        case 'feat': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
        case 'rollback': return 'bg-amber-50 text-amber-700 border-amber-200';
        case 'improvement': 
        case 'patch':
        case 'bugfix':
        case 'update':
        default: return 'bg-blue-50 text-rotary-blue border-blue-200';
    }
};

const getChangeIcon = (type: string) => {
    switch (type) {
        case 'added': return <PlusCircle className="w-3.5 h-3.5 text-emerald-500" />;
        case 'fixed': 
        case 'fix':
        case 'improved':
        case 'major': return <CheckCircle2 className="w-3.5 h-3.5 text-blue-500" />;
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
        update.changes?.some(c => c.text.toLowerCase().includes(searchTerm.toLowerCase()))
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
                                        {update.changes?.map((change, i) => (
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
