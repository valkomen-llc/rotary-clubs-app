// ════════════════════════════════════════════════════════════════════
// Programas — la página pública por contenedores — ESPEJO del navegador — v4.1281.0
//
// Duplicado a propósito (como `programSpec.ts`): el servidor decide qué se
// GUARDA y qué se SIRVE; esto decide qué se PINTA y qué ofrece el editor.
// ⚠️ SI CAMBIA `server/lib/programLandingSpec.js`, CAMBIA ESTO. Lo comprueba
// `scripts/test-programas.mjs` comparando los catálogos.
// ════════════════════════════════════════════════════════════════════

export const LANDING_SCHEMA_VERSION = 1;

export interface Labeled { id: string; label: string }
export const BACKGROUNDS: Labeled[] = [
    { id: 'white', label: 'Blanco' },
    { id: 'light', label: 'Azul claro (portada)' },
    { id: 'blue', label: 'Azul institucional' },
    { id: 'navy', label: 'Azul marino' },
    { id: 'gray', label: 'Gris claro' },
];
export const ICONS: Labeled[] = [
    { id: 'book', label: 'Libro' }, { id: 'map-pin', label: 'Ubicación' }, { id: 'help', label: 'Pregunta' }, { id: 'users', label: 'Personas' },
    { id: 'family', label: 'Familia' }, { id: 'hospital', label: 'Clínica' }, { id: 'rotary', label: 'Rueda rotaria' }, { id: 'heart', label: 'Corazón' },
    { id: 'hands', label: 'Manos' }, { id: 'play', label: 'Video' }, { id: 'headphones', label: 'Audio / podcast' }, { id: 'file', label: 'Documento' },
    { id: 'layers', label: 'Recursos' }, { id: 'search', label: 'Buscar' }, { id: 'phone', label: 'Teléfono' }, { id: 'mail', label: 'Correo' },
    { id: 'star', label: 'Estrella' }, { id: 'award', label: 'Reconocimiento' }, { id: 'calendar', label: 'Calendario' }, { id: 'globe', label: 'Mundo' },
    { id: 'baby', label: 'Infancia' }, { id: 'stethoscope', label: 'Salud' }, { id: 'home', label: 'Hogar' }, { id: 'sparkles', label: 'Destellos' }, { id: 'arrow', label: 'Flecha' },
];
export const DETAIL_ANCHORS: Labeled[] = [
    { id: 'programa', label: 'El programa' }, { id: 'clinicas', label: 'Directorio de clínicas' }, { id: 'familias', label: 'Información y recursos para familias' },
    { id: 'historias', label: 'Historias' }, { id: 'equipo', label: 'Equipo' }, { id: 'impacto', label: 'Impacto' }, { id: 'ayudar', label: 'Cómo ayudar' },
    { id: 'noticias', label: 'Noticias y eventos' }, { id: 'aliados', label: 'Aliados' }, { id: 'contacto', label: 'Contacto y formularios' },
];
export const FORM_TARGETS: Labeled[] = [
    { id: 'orientacion', label: 'Necesito orientación' }, { id: 'apoyo', label: 'Quiero apoyar' }, { id: 'club', label: 'Mi club quiere participar' }, { id: 'novedades', label: 'Quiero recibir novedades' },
];
export const BUTTON_ACTIONS: Labeled[] = [
    { id: 'section', label: 'Ir a un contenedor de esta página' },
    { id: 'detail', label: 'Ir a la página de detalle del programa' },
    { id: 'form', label: 'Abrir un formulario' },
    { id: 'donation', label: 'Canal oficial de donación' },
    { id: 'internal', label: 'Enlace interno del sitio' },
    { id: 'external', label: 'Enlace externo' },
    { id: 'none', label: 'Sin acción (oculto)' },
];
export interface BlockTypeSpec { id: string; label: string; single: boolean; source: string | null; help: string }
export const BLOCK_TYPES: Record<string, BlockTypeSpec> = {
    hero: { id: 'hero', label: 'Portada del programa', single: true, source: null, help: 'Dos columnas: texto a la izquierda, imagen a la derecha.' },
    intro: { id: 'intro', label: 'Presentación del programa', single: false, source: null, help: 'Franja de color con título, descripción y botón centrados.' },
    cards: { id: 'cards', label: 'Tarjetas informativas', single: false, source: null, help: 'Título centrado y tarjetas con ícono, título, descripción y enlace.' },
    feature: { id: 'feature', label: 'Texto e imagen (equipo)', single: false, source: null, help: 'Dos columnas: texto y botón a un lado, imagen al otro.' },
    impact: { id: 'impact', label: 'Impacto del programa', single: false, source: 'indicator', help: 'Tarjetas con indicadores publicados del programa.' },
    directory: { id: 'directory', label: 'Directorio de clínicas', single: true, source: 'clinic', help: 'Filtros y tarjetas del directorio real del programa.' },
    donation: { id: 'donation', label: 'Donaciones', single: true, source: 'donation', help: 'Imagen y caja con botón hacia el canal oficial de donación.' },
    stories: { id: 'stories', label: 'Historias', single: false, source: 'story', help: 'Tarjetas con las historias aprobadas del programa.' },
    resources: { id: 'resources', label: 'Recursos educativos', single: false, source: 'resource', help: 'Tres accesos con ícono y un botón hacia los recursos.' },
    clubs: { id: 'clubs', label: 'Vinculación de clubes', single: false, source: null, help: 'Texto y botón a un lado, ilustración al otro.' },
    contact: { id: 'contact', label: 'Orientación y contacto', single: true, source: null, help: 'Franja con texto y botón centrados hacia el formulario.' },
};
export const BLOCK_TYPE_IDS = Object.keys(BLOCK_TYPES);

/** Qué pestaña del panel gestiona la fuente de cada contenedor. */
export const SOURCE_TABS: Record<string, { tab: string; label: string }> = {
    indicator: { tab: 'gestion', label: 'Indicadores (Gestión de contenidos)' },
    clinic: { tab: 'contenidos', label: 'Directorio de clínicas (Biblioteca de contenidos)' },
    donation: { tab: 'gestion', label: 'Enlace de donación (Gestión de contenidos)' },
    story: { tab: 'contenidos', label: 'Historias (Biblioteca de contenidos)' },
    resource: { tab: 'contenidos', label: 'Recursos (Biblioteca de contenidos)' },
};

export interface ButtonAction { type: string; target: string }
export interface LandingButton { label: string; icon: string; variant: 'primary' | 'secondary' | 'gold'; action: ButtonAction }
export interface LandingImage { url: string; alt: string; mediaId?: string | null; focalX: number; focalY: number; placeholder?: string }
export interface LandingBlock { id: string; type: string; name: string; enabled: boolean; content: any; style: { background: string; align: 'left' | 'center'; imageSide: 'left' | 'right'; overlay: number } }
export interface Landing { schemaVersion: number; blocks: LandingBlock[]; settings: { backLink: { label: string; href: string } } }

/** Botón resuelto por el servidor para pintar. */
export interface ResolvedButton { label: string; icon: string; variant: string; kind: 'anchor' | 'link' | 'external' | 'form' | 'donation'; href?: string; form?: string; donation?: any }
export interface ResolvedImage { url: string; alt: string; focalX: number; focalY: number; placeholder: boolean; placeholderLabel?: string }
export interface ResolvedBlock { id: string; type: string; name: string; style: LandingBlock['style']; data: any; ready: boolean; notes: string[] }
export interface ResolvedLanding { schemaVersion: number; blocks: ResolvedBlock[]; settings: Landing['settings'] }

/** Clases de fondo y de texto por variante: los colores del sitio del distrito. */
export const BACKGROUND_CLASS: Record<string, { section: string; text: string; muted: string; card: string }> = {
    white: { section: 'bg-white', text: 'text-gray-900', muted: 'text-gray-600', card: 'bg-sky-50/70 border border-sky-100' },
    light: { section: 'bg-gradient-to-br from-sky-100 via-sky-50 to-blue-100', text: 'text-rotary-blue', muted: 'text-slate-700', card: 'bg-white/80 border border-sky-100' },
    blue: { section: 'bg-rotary-blue', text: 'text-white', muted: 'text-sky-100', card: 'bg-sky-200/90 border border-sky-200' },
    navy: { section: 'bg-rotary-navy', text: 'text-white', muted: 'text-sky-100', card: 'bg-white border border-gray-100' },
    gray: { section: 'bg-rotary-concrete bg-gray-100', text: 'text-gray-900', muted: 'text-gray-600', card: 'bg-white border border-gray-100' },
};
export const isDarkBackground = (bg: string) => bg === 'blue' || bg === 'navy';

export const validateLandingLight = (l: Landing): { blockId: string | null; message: string }[] => {
    const out: { blockId: string | null; message: string }[] = [];
    if (!l.blocks.length) out.push({ blockId: null, message: 'La página necesita al menos un contenedor.' });
    const singles: Record<string, number> = {};
    for (const b of l.blocks) {
        if (BLOCK_TYPES[b.type]?.single) { singles[b.type] = (singles[b.type] || 0) + 1; if (singles[b.type] > 1) out.push({ blockId: b.id, message: `Sólo puede haber un contenedor «${BLOCK_TYPES[b.type].label}».` }); }
        if (b.type === 'hero' && !String(b.content?.title || '').trim()) out.push({ blockId: b.id, message: 'La portada necesita el nombre del programa.' });
        if (b.content?.image?.url && !String(b.content.image.alt || '').trim()) out.push({ blockId: b.id, message: 'La imagen necesita texto alternativo.' });
    }
    return out;
};
