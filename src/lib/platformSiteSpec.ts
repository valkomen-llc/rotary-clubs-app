// ════════════════════════════════════════════════════════════════════
// Sitio web de Club Platform — ESPEJO del navegador — v4.1348.0
//
// Duplicado a propósito (como `programLandingSpec.ts`): el servidor decide qué
// se GUARDA y qué se SIRVE; esto decide qué se PINTA y qué ofrece el editor.
// ⚠️ SI CAMBIA `server/lib/platformSiteSpec.js`, CAMBIA ESTO. Lo comprueba
// `scripts/test-platform-site.mjs` comparando los catálogos.
// ════════════════════════════════════════════════════════════════════

export const SITE_SCHEMA_VERSION = 1;
export const ADMIN_HOST = 'app.clubplatform.org';
export const PREVIEW_BASE = '/vista-previa/sitio-institucional';

export interface Labeled { id: string; label: string }
export const BACKGROUNDS: Labeled[] = [
    { id: 'white', label: 'Blanco' },
    { id: 'light', label: 'Azul claro' },
    { id: 'gray', label: 'Gris con textura (como las cifras del inicio de un sitio)' },
    { id: 'geo', label: 'Azul institucional con textura (como «Somos gente de acción»)' },
    { id: 'blue', label: 'Azul institucional' },
    { id: 'navy', label: 'Azul marino' },
];
export const ICONS: Labeled[] = [
    { id: 'globe', label: 'Mundo / sitio web' }, { id: 'monitor', label: 'Pantalla' }, { id: 'layout', label: 'Panel' }, { id: 'chart', label: 'Analítica' },
    { id: 'megaphone', label: 'Comunicación' }, { id: 'mail', label: 'Correo' }, { id: 'message', label: 'Mensajería' }, { id: 'users', label: 'Personas' },
    { id: 'shield', label: 'Seguridad y permisos' }, { id: 'zap', label: 'Automatización' }, { id: 'plug', label: 'Integraciones' }, { id: 'bot', label: 'Inteligencia artificial' },
    { id: 'search', label: 'Buscadores (SEO)' }, { id: 'languages', label: 'Idiomas' }, { id: 'calendar', label: 'Eventos' }, { id: 'folder', label: 'Proyectos' },
    { id: 'image', label: 'Multimedia' }, { id: 'file', label: 'Contenidos' }, { id: 'card', label: 'Pagos' }, { id: 'layers', label: 'Módulos' },
    { id: 'settings', label: 'Configuración' }, { id: 'palette', label: 'Identidad visual' }, { id: 'rocket', label: 'Publicación' }, { id: 'refresh', label: 'Evolución' },
    { id: 'heart', label: 'Corazón' }, { id: 'star', label: 'Estrella' }, { id: 'check', label: 'Verificado' }, { id: 'sparkles', label: 'Destellos' },
    { id: 'help', label: 'Pregunta' }, { id: 'arrow', label: 'Flecha' },
];
export const SPACINGS: Labeled[] = [{ id: 'compact', label: 'Compacto' }, { id: 'normal', label: 'Normal' }, { id: 'wide', label: 'Amplio' }];
export const ANIMATIONS: Labeled[] = [{ id: 'none', label: 'Sin animación' }, { id: 'fade', label: 'Aparecer' }, { id: 'rise', label: 'Aparecer subiendo' }];
export const BUTTON_ACTIONS: Labeled[] = [
    { id: 'section', label: 'Ir a un contenedor de esta página' },
    { id: 'page', label: 'Ir a otra página del sitio' },
    { id: 'contact', label: 'Ir al formulario de contacto' },
    { id: 'app', label: 'Entrar al panel (app.clubplatform.org)' },
    { id: 'external', label: 'Enlace externo' },
    { id: 'none', label: 'Sin acción (oculto)' },
];
export const ACCENTS: (Labeled & { hex: string })[] = [{ id: 'gold', label: 'Dorado', hex: '#E29C00' }, { id: 'sky', label: 'Celeste', hex: '#38bdf8' }, { id: 'white', label: 'Blanco', hex: '#ffffff' }];

export interface BlockTypeSpec { id: string; label: string; single: boolean; source: string | null; help: string }
export const BLOCK_TYPES: Record<string, BlockTypeSpec> = {
    hero: { id: 'hero', label: 'Portada', single: true, source: null, help: 'Antetítulo, título, descripción, dos botones y una composición visual del producto o una imagen real.' },
    about: { id: 'about', label: 'Qué es Club Platform', single: false, source: null, help: 'Texto y un recorrido de tres pasos: plataforma central → sitios → herramientas.' },
    solutions: { id: 'solutions', label: 'Ecosistema de soluciones', single: false, source: null, help: 'Tarjetas de capacidades. Sólo las marcadas como verificadas llegan al público.' },
    steps: { id: 'steps', label: 'Cómo funciona', single: false, source: null, help: 'Pasos numerados del proceso de adopción.' },
    architecture: { id: 'architecture', label: 'Tecnología y arquitectura', single: true, source: null, help: 'Diagrama: el sistema central conectado con sus servicios.' },
    benefits: { id: 'benefits', label: 'Beneficios', single: false, source: null, help: 'Lista de beneficios concretos con ícono.' },
    sites: { id: 'sites', label: 'Sitios del ecosistema', single: true, source: 'sites', help: 'Sitios reales y publicados que tú eliges. Sólo nombre, logotipo y enlace público.' },
    feature: { id: 'feature', label: 'Texto e imagen', single: false, source: null, help: 'Dos columnas: texto y botón a un lado, imagen al otro.' },
    text: { id: 'text', label: 'Texto', single: false, source: null, help: 'Título y párrafos. Para páginas como condiciones o privacidad.' },
    faq: { id: 'faq', label: 'Preguntas frecuentes', single: false, source: null, help: 'Preguntas y respuestas desplegables.' },
    contact: { id: 'contact', label: 'Llamado final y contacto', single: true, source: 'leads', help: 'Texto de cierre y el formulario real de solicitud de información.' },
};
export const BLOCK_TYPE_IDS = Object.keys(BLOCK_TYPES);

export const ROLE_LABELS: Record<string, string> = { admin: 'Administrador central', editor: 'Editor del sitio institucional', reviewer: 'Revisor' };
export const REVIEW_LABELS: Record<string, string> = { draft: 'Borrador', in_review: 'En revisión', changes_requested: 'Con cambios solicitados', approved: 'Aprobado para publicar' };

export interface ButtonAction { type: string; target: string }
export interface SiteButton { label: string; icon: string; variant: 'primary' | 'secondary' | 'gold'; action: ButtonAction }
export interface SiteImage { url: string; alt: string; focalX: number; focalY: number }
export interface BlockStyle { background: string; align: 'left' | 'center'; imageSide: 'left' | 'right'; spacing: string; animation: string }
export interface SiteBlock { id: string; type: string; name: string; enabled: boolean; content: any; style: BlockStyle }
export interface PageSeo { title: string; description: string; image: string; noindex: boolean }
export interface SitePage { id: string; slug: string; title: string; navLabel: string; showInNav: boolean; enabled: boolean; seo: PageSeo; blocks: SiteBlock[] }
export interface NavLink { id: string; label: string; action: ButtonAction }
export interface SiteSettings {
    name: string; tagline: string; language: string; logoUrl: string; accent: string; header: 'dark' | 'light';
    nav: { links: NavLink[]; cta: SiteButton; showLogin: boolean };
    footer: { text: string; note: string; links: NavLink[] };
    contact: { email: string };
    seo: { title: string; description: string; image: string; organization: boolean };
}
export interface Site { schemaVersion: number; settings: SiteSettings; pages: SitePage[] }

export interface ResolvedButton { label: string; icon?: string; variant?: string; kind: 'anchor' | 'link' | 'external'; href: string; sameTab?: boolean; id?: string; current?: boolean }
export interface ResolvedImage { url: string; alt: string; focalX: number; focalY: number; placeholder: boolean }
export interface ResolvedBlock { id: string; type: string; name: string; style: BlockStyle; data: any; ready: boolean; notes: string[] }
export interface ResolvedChrome {
    name: string; tagline: string; logoUrl: string; accent: string; header: 'dark' | 'light'; language: string; home: string;
    nav: ResolvedButton[]; cta: ResolvedButton | null; showLogin: boolean; loginHref: string;
    footer: { text: string; note: string; links: ResolvedButton[] };
}
export interface ResolvedPage {
    schemaVersion: number; page: { id: string; slug: string; title: string; isHome: boolean }; blocks: ResolvedBlock[]; chrome: ResolvedChrome;
    seo: { title: string; description: string; image: string; noindex: boolean; path: string; siteName: string };
}

/** Fondos: los MISMOS del sitio de un club (ver `programLandingSpec.ts`). `geo` se aplica en línea (`SITE_ACTION_BG`). */
export const BACKGROUND_CLASS: Record<string, { section: string; dark: boolean }> = {
    white: { section: 'bg-white', dark: false },
    light: { section: 'bg-gradient-to-br from-sky-100 via-sky-50 to-blue-100', dark: false },
    gray: { section: 'bg-rotary-concrete', dark: false },
    geo: { section: '', dark: true },
    blue: { section: 'bg-rotary-blue', dark: true },
    navy: { section: 'bg-rotary-navy', dark: true },
};
export const isDarkBackground = (bg: string) => Boolean(BACKGROUND_CLASS[bg]?.dark);

export const slugify = (v: string) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

/** Lo que el editor avisa antes de ir al servidor (el servidor repite y amplía la validación). */
export const validateSiteLight = (site: Site): { pageId: string; blockId: string | null; message: string }[] => {
    const out: { pageId: string; blockId: string | null; message: string }[] = [];
    for (const p of site.pages) {
        if (!p.blocks.length && p.enabled) out.push({ pageId: p.id, blockId: null, message: `La página «${p.title}» necesita al menos un contenedor.` });
        const singles: Record<string, number> = {};
        for (const b of p.blocks) {
            if (BLOCK_TYPES[b.type]?.single) { singles[b.type] = (singles[b.type] || 0) + 1; if (singles[b.type] > 1) out.push({ pageId: p.id, blockId: b.id, message: `Sólo puede haber un contenedor «${BLOCK_TYPES[b.type].label}» por página.` }); }
            if (b.type === 'hero' && !String(b.content?.title || '').trim()) out.push({ pageId: p.id, blockId: b.id, message: 'La portada necesita un título.' });
            const imgs = [b.content?.image, ...(Array.isArray(b.content?.items) ? b.content.items.map((x: any) => x?.image) : [])].filter(Boolean);
            if (imgs.some((i: any) => i.url && !String(i.alt || '').trim())) out.push({ pageId: p.id, blockId: b.id, message: 'Cada imagen necesita texto alternativo (accesibilidad).' });
        }
    }
    return out;
};
