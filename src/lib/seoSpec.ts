// ════════════════════════════════════════════════════════════════════════════
// SEO Inteligente — espejo mínimo para el navegador
//
// Sólo lo que el panel necesita para PINTAR: límites (para las barras de
// longitud), etiquetas de severidad y de eje, y el vocabulario de procedencia.
//
// Está duplicado a propósito, igual que `ADMIN_ROLES` o `NATIONAL_LANGS`: el
// servidor no puede importar TypeScript y el navegador no puede importar del
// servidor. Lo que NO se duplica es el criterio: acá no hay ninguna regla que
// decida nada. Quien decide si un título es válido es `seoAI.validateMeta` en el
// servidor; esto sólo dibuja la barra.
//
// Si cambia un límite en `server/lib/seoSpec.js`, cambiarlo acá — lo comprueba
// `npm run test:seo`.
// ════════════════════════════════════════════════════════════════════════════

export const LIMITS = {
    title: { min: 30, max: 60, hardMax: 70 },
    description: { min: 70, max: 155, hardMax: 200 },
    ogTitle: { min: 20, max: 88, hardMax: 95 },
    ogDescription: { min: 50, max: 200, hardMax: 300 },
    altText: { min: 5, max: 125 },
} as const;

export type Severity = 'critical' | 'high' | 'medium' | 'low';
export type Axis = 'indexability' | 'metadata' | 'content' | 'structured' | 'technical';
export type Provenance = 'measured' | 'reported' | 'estimated' | 'unavailable';
export type IntegrationState = 'connected' | 'disconnected' | 'not_configured' | 'unavailable';

export const SEVERITY_LABEL: Record<Severity, string> = {
    critical: 'Crítico',
    high: 'Alto',
    medium: 'Medio',
    low: 'Bajo',
};

export const SEVERITY_STYLE: Record<Severity, string> = {
    critical: 'bg-red-100 text-red-800 border-red-200',
    high: 'bg-orange-100 text-orange-800 border-orange-200',
    medium: 'bg-amber-100 text-amber-800 border-amber-200',
    low: 'bg-slate-100 text-slate-700 border-slate-200',
};

export const AXIS_LABEL: Record<Axis, string> = {
    indexability: 'Indexación',
    metadata: 'Metadatos',
    content: 'Contenido',
    structured: 'Datos estructurados',
    technical: 'Técnico',
};

export const AXIS_HINT: Record<Axis, string> = {
    indexability: 'Si el buscador puede ver la página y sabe cuál es su dirección buena.',
    metadata: 'Título, descripción y las etiquetas con las que se ve al compartir.',
    content: 'Estructura del texto, imágenes descritas y enlaces internos.',
    structured: 'El JSON-LD que habilita los resultados enriquecidos.',
    technical: 'robots.txt, sitemap, velocidad y respuestas del servidor.',
};

/**
 * Cómo se presenta un número según de dónde salga.
 *
 * Es la traducción a pantalla de la regla del módulo: un dato medido y una
 * estimación de un modelo NO se pintan igual, y lo que no se pudo medir se
 * muestra vacío con su motivo — nunca como un cero.
 */
export const PROVENANCE_LABEL: Record<Provenance, string> = {
    measured: 'Medido',
    reported: 'Informado por el proveedor',
    estimated: 'Estimado por IA',
    unavailable: 'Sin dato',
};

export const PROVENANCE_STYLE: Record<Provenance, string> = {
    measured: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    reported: 'bg-sky-50 text-sky-700 border-sky-200',
    estimated: 'bg-violet-50 text-violet-700 border-violet-200',
    unavailable: 'bg-slate-50 text-slate-500 border-slate-200',
};

export const INTEGRATION_LABEL: Record<IntegrationState, string> = {
    connected: 'Conectado',
    disconnected: 'Sin autorizar',
    not_configured: 'Sin configurar',
    unavailable: 'No se pudo comprobar',
};

export const INTEGRATION_STYLE: Record<IntegrationState, string> = {
    connected: 'bg-emerald-100 text-emerald-800',
    disconnected: 'bg-amber-100 text-amber-800',
    not_configured: 'bg-slate-100 text-slate-600',
    // `unavailable` se pinta DISTINTO de "sin configurar" a propósito: presentar
    // «no se pudo comprobar» como si fuera un estado tranquilo manda a buscar el
    // problema donde no está. Misma regla que el panel de diagnóstico del CRM.
    unavailable: 'bg-violet-100 text-violet-800',
};

/** Color de una nota 0-100. El corte no es estético: 90 es «listo», 70 «sirve». */
export function scoreTone(score: number | null | undefined): string {
    if (score == null) return 'text-slate-400';
    if (score >= 90) return 'text-emerald-600';
    if (score >= 70) return 'text-lime-600';
    if (score >= 50) return 'text-amber-600';
    return 'text-red-600';
}

/** Estado de una longitud respecto de su rango recomendado. */
export function lengthState(len: number, range: { min: number; max: number }): 'short' | 'ok' | 'long' {
    if (len < range.min) return 'short';
    if (len > range.max) return 'long';
    return 'ok';
}

export const KIND_LABEL: Record<string, string> = {
    home: 'Portada',
    about: 'Institucional',
    contact: 'Contacto',
    blog_index: 'Listado de blog',
    post: 'Noticia',
    projects_index: 'Listado de proyectos',
    project: 'Proyecto',
    events_index: 'Listado de eventos',
    event: 'Evento',
    shop_index: 'Tienda',
    product: 'Producto',
    generic: 'Página',
    private: 'Privada',
};
