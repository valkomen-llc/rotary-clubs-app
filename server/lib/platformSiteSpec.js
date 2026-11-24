// ════════════════════════════════════════════════════════════════════
// Sitio web de Club Platform — el criterio — v4.1348.0
//
// Puro: sin base, sin red. Lo usan el controlador, las pruebas y (por espejo)
// `src/lib/platformSiteSpec.ts`. Al tocar uno, tocar el otro: lo fija
// `scripts/test-platform-site.mjs`.
//
// El sitio institucional de la PLATAFORMA se arma con el mismo motor que la
// página por contenedores de Programas (v4.1281): una LISTA CERRADA de
// contenedores con contenido editable, estilo acotado y botones de acción
// controlada. Nunca HTML, CSS ni JavaScript: el administrador elige entre
// opciones y el servidor las sanea. Lo que cambia frente a Programas:
//
//   · es un sitio, no una página: varias PÁGINAS con su dirección y su SEO;
//   · no pertenece a un club: su dueño es la administración central y sus
//     datos viven en tablas `PlatformSite*`, fuera de todo tenant;
//   · una capacidad (tarjeta de «Ecosistema de soluciones») sólo llega al
//     público si está marcada como VERIFICADA: lo que está en desarrollo se
//     puede redactar, pero no se anuncia;
//   · los sitios del ecosistema se REFERENCIAN por id y se resuelven contra
//     datos públicos (nombre, logotipo, dominio): nada interno de un club.
// ════════════════════════════════════════════════════════════════════

const str = (v, max) => String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
const multi = (v, max) => String(v ?? '').trim().replace(/\r\n/g, '\n').slice(0, max);
const arr = (v) => (Array.isArray(v) ? v : []);
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const bool = (v, d = false) => (typeof v === 'boolean' ? v : d);
const clampInt = (v, min, max, d) => { const n = Number.parseInt(v, 10); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d; };
const oneOf = (v, list, d) => (list.includes(v) ? v : d);

export const SITE_SCHEMA_VERSION = 1;
/** La fila única del sitio institucional. */
export const PLATFORM_SITE_ID = 'main';
/** El tipo de sitio: NO es un club ni un tenant ordinario. */
export const PLATFORM_SITE_TYPE = 'platform';
export const PLATFORM_SITE_TYPE_LABEL = 'Sitio institucional de plataforma';
export const ADMIN_HOST = 'app.clubplatform.org';
export const DEFAULT_PUBLIC_HOST = 'clubplatform.org';

export const normalizeLink = (raw) => {
    const value = str(raw, 800);
    if (!value) return null;
    let url;
    try { url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`); } catch { return null; }
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    if (!url.hostname || !url.hostname.includes('.')) return null;
    if (url.username || url.password) return null;
    return url.toString();
};

/** Un nombre de host público: minúsculas, sin esquema, sin ruta, sin puerto. */
export const normalizeHost = (raw) => {
    const v = String(raw ?? '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '');
    return /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/.test(v) ? v : '';
};

// ─── Catálogos cerrados ────────────────────────────────────────────────

export const BACKGROUNDS = [
    { id: 'white', label: 'Blanco' },
    { id: 'light', label: 'Azul claro' },
    { id: 'gray', label: 'Gris con textura (como las cifras del inicio de un sitio)' },
    { id: 'geo', label: 'Azul institucional con textura (como «Somos gente de acción»)' },
    { id: 'blue', label: 'Azul institucional' },
    { id: 'navy', label: 'Azul marino' },
];
export const BACKGROUND_IDS = BACKGROUNDS.map(b => b.id);

export const ICONS = [
    { id: 'globe', label: 'Mundo / sitio web' }, { id: 'monitor', label: 'Pantalla' }, { id: 'layout', label: 'Panel' }, { id: 'chart', label: 'Analítica' },
    { id: 'megaphone', label: 'Comunicación' }, { id: 'mail', label: 'Correo' }, { id: 'message', label: 'Mensajería' }, { id: 'users', label: 'Personas' },
    { id: 'shield', label: 'Seguridad y permisos' }, { id: 'zap', label: 'Automatización' }, { id: 'plug', label: 'Integraciones' }, { id: 'bot', label: 'Inteligencia artificial' },
    { id: 'search', label: 'Buscadores (SEO)' }, { id: 'languages', label: 'Idiomas' }, { id: 'calendar', label: 'Eventos' }, { id: 'folder', label: 'Proyectos' },
    { id: 'image', label: 'Multimedia' }, { id: 'file', label: 'Contenidos' }, { id: 'card', label: 'Pagos' }, { id: 'layers', label: 'Módulos' },
    { id: 'settings', label: 'Configuración' }, { id: 'palette', label: 'Identidad visual' }, { id: 'rocket', label: 'Publicación' }, { id: 'refresh', label: 'Evolución' },
    { id: 'heart', label: 'Corazón' }, { id: 'star', label: 'Estrella' }, { id: 'check', label: 'Verificado' }, { id: 'sparkles', label: 'Destellos' },
    { id: 'help', label: 'Pregunta' }, { id: 'arrow', label: 'Flecha' },
];
export const ICON_IDS = ICONS.map(i => i.id);
export const isIcon = (v) => ICON_IDS.includes(String(v || ''));

export const SPACINGS = [{ id: 'compact', label: 'Compacto' }, { id: 'normal', label: 'Normal' }, { id: 'wide', label: 'Amplio' }];
export const ANIMATIONS = [{ id: 'none', label: 'Sin animación' }, { id: 'fade', label: 'Aparecer' }, { id: 'rise', label: 'Aparecer subiendo' }];

/** Qué hace un botón. */
export const BUTTON_ACTIONS = [
    { id: 'section', label: 'Ir a un contenedor de esta página' },
    { id: 'page', label: 'Ir a otra página del sitio' },
    { id: 'contact', label: 'Ir al formulario de contacto' },
    { id: 'app', label: 'Entrar al panel (app.clubplatform.org)' },
    { id: 'external', label: 'Enlace externo' },
    { id: 'none', label: 'Sin acción (oculto)' },
];
const ACTION_IDS = BUTTON_ACTIONS.map(a => a.id);

/**
 * Direcciones que una página del sitio NO puede tomar: son rutas de la
 * aplicación. El sitio y la aplicación comparten el mismo despliegue, así que
 * una página llamada «admin» o «login» taparía (o sería tapada por) la ruta
 * real. `api` y `admin` además no deben quedar nunca detrás de contenido
 * editable.
 */
export const RESERVED_SLUGS = [
    'admin', 'api', 'login', 'registro', 'restablecer', 'verify-email', 'assets', 'static', 'sitemap.xml', 'robots.txt', 'favicon.ico',
    'blog', 'proyectos', 'eventos', 'contacto', 'programas', 'cursos', 'mis-cursos', 'aportes', 'checkout', 'tienda', 'shop', 'cart', 'order',
    'quienes-somos', 'nuestras-causas', 'mi-proyecto', 'mi-inscripcion', 'capacitaciones', 'descargas', 'donacion', 'r', 'l', 'vista-previa', 'presentacion',
];

export const slugify = (v) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

const makeId = (prefix, rand = Math.random) => `${prefix}-${Math.floor(rand() * 0xffffff).toString(16).padStart(6, '0')}`;
const idOr = (v, prefix) => (/^[a-z0-9-]{3,40}$/.test(String(v || '')) ? String(v) : makeId(prefix));

export const shapeButton = (raw, fallback = {}) => {
    const b = obj(raw);
    const a = obj(b.action);
    const type = ACTION_IDS.includes(a.type) ? a.type : (fallback.action?.type || 'none');
    let target = str(a.target, 300);
    if (type === 'external') target = normalizeLink(target) || '';
    else if (type === 'page') target = slugify(target);
    else if (type === 'section') target = /^[a-z0-9-]{3,40}$/.test(target) ? target : '';
    else target = '';
    return {
        label: str(b.label, 60) || fallback.label || '',
        icon: isIcon(b.icon) ? b.icon : (fallback.icon || ''),
        variant: oneOf(b.variant, ['primary', 'secondary', 'gold'], fallback.variant || 'primary'),
        action: { type, target },
    };
};

export const shapeImage = (raw) => {
    const i = obj(raw);
    return {
        url: normalizeLink(i.url) || '',
        alt: str(i.alt, 200),
        focalX: clampInt(i.focalX, 0, 100, 50),
        focalY: clampInt(i.focalY, 0, 100, 50),
    };
};

// ─── Tipos de contenedor ───────────────────────────────────────────────

/** `single`: una sola instancia por página. `source`: de dónde toma datos reales. */
export const BLOCK_TYPES = {
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

const STYLE_DEFAULTS = {
    hero: { background: 'navy', align: 'left', imageSide: 'right' },
    about: { background: 'white', align: 'left', imageSide: 'right' },
    solutions: { background: 'gray', align: 'center', imageSide: 'right' },
    steps: { background: 'white', align: 'center', imageSide: 'right' },
    architecture: { background: 'geo', align: 'center', imageSide: 'right' },
    benefits: { background: 'white', align: 'center', imageSide: 'right' },
    sites: { background: 'light', align: 'center', imageSide: 'right' },
    feature: { background: 'white', align: 'left', imageSide: 'right' },
    text: { background: 'white', align: 'left', imageSide: 'right' },
    faq: { background: 'gray', align: 'center', imageSide: 'right' },
    contact: { background: 'blue', align: 'left', imageSide: 'right' },
};

const shapeStyle = (type, raw) => {
    const s = obj(raw); const d = STYLE_DEFAULTS[type] || STYLE_DEFAULTS.text;
    return {
        background: oneOf(s.background, BACKGROUND_IDS, d.background),
        align: oneOf(s.align, ['left', 'center'], d.align),
        imageSide: oneOf(s.imageSide, ['left', 'right'], d.imageSide),
        spacing: oneOf(s.spacing, SPACINGS.map(x => x.id), 'normal'),
        animation: oneOf(s.animation, ANIMATIONS.map(x => x.id), 'rise'),
    };
};

const items = (v, max, fn) => arr(v).slice(0, max).map(x => fn(obj(x)));

const CONTENT_SHAPERS = {
    hero: (c) => ({
        eyebrow: str(c.eyebrow, 80), title: str(c.title, 140), description: multi(c.description, 500),
        buttons: arr(c.buttons).slice(0, 2).map(b => shapeButton(b)),
        // `product`: una composición esquemática del panel (no es una captura ni
        // inventa cifras). `image`: una captura o fotografía REAL.
        visual: oneOf(c.visual, ['product', 'image', 'none'], 'product'),
        image: shapeImage(c.image),
    }),
    about: (c) => ({
        title: str(c.title, 120), description: multi(c.description, 1200),
        flow: items(c.flow, 4, x => ({ id: idOr(x.id, 'flow'), icon: isIcon(x.icon) ? x.icon : 'layers', label: str(x.label, 60), description: multi(x.description, 200) })),
        image: shapeImage(c.image), button: shapeButton(c.button),
    }),
    solutions: (c) => ({
        title: str(c.title, 120), description: multi(c.description, 500),
        items: items(c.items, 12, x => ({
            id: idOr(x.id, 'sol'), icon: isIcon(x.icon) ? x.icon : 'layers', title: str(x.title, 80), description: multi(x.description, 320),
            image: shapeImage(x.image), link: shapeButton(x.link),
            // La regla del módulo: lo que no está verificado no se anuncia.
            verified: bool(x.verified, false),
        })),
    }),
    steps: (c) => ({
        title: str(c.title, 120), description: multi(c.description, 500),
        steps: items(c.steps, 8, x => ({ id: idOr(x.id, 'step'), title: str(x.title, 80), description: multi(x.description, 300) })),
    }),
    architecture: (c) => ({
        title: str(c.title, 120), description: multi(c.description, 600),
        hub: { label: str(obj(c.hub).label, 60) || 'Club Platform', caption: str(obj(c.hub).caption, 80) },
        nodes: items(c.nodes, 8, x => ({ id: idOr(x.id, 'node'), icon: isIcon(x.icon) ? x.icon : 'layers', label: str(x.label, 50), description: multi(x.description, 200) })),
    }),
    benefits: (c) => ({
        title: str(c.title, 120), description: multi(c.description, 500),
        items: items(c.items, 9, x => ({ id: idOr(x.id, 'ben'), icon: isIcon(x.icon) ? x.icon : 'check', title: str(x.title, 80), description: multi(x.description, 300) })),
    }),
    sites: (c) => ({
        title: str(c.title, 120), description: multi(c.description, 500),
        siteIds: arr(c.siteIds).map(x => str(x, 80)).filter(Boolean).slice(0, 24),
        showLogo: bool(c.showLogo, true), showLink: bool(c.showLink, true),
    }),
    feature: (c) => ({ title: str(c.title, 120), description: multi(c.description, 1200), image: shapeImage(c.image), button: shapeButton(c.button) }),
    text: (c) => ({ title: str(c.title, 120), body: multi(c.body, 8000) }),
    faq: (c) => ({
        title: str(c.title, 120), description: multi(c.description, 500),
        items: items(c.items, 20, x => ({ id: idOr(x.id, 'faq'), question: str(x.question, 200), answer: multi(x.answer, 1200) })),
    }),
    contact: (c) => ({
        title: str(c.title, 120), description: multi(c.description, 600),
        formEnabled: bool(c.formEnabled, true),
        formTitle: str(c.formTitle, 80) || 'Solicitar información',
        submitLabel: str(c.submitLabel, 40) || 'Enviar solicitud',
        successMessage: multi(c.successMessage, 300) || 'Recibimos tu solicitud. El equipo de Club Platform te responderá por correo.',
        consentText: multi(c.consentText, 400) || 'Autorizo el uso de estos datos para responder mi solicitud.',
        button: shapeButton(c.button),
    }),
};

export const shapeBlock = (raw) => {
    const b = obj(raw);
    const type = BLOCK_TYPE_IDS.includes(b.type) ? b.type : null;
    if (!type) return null;
    return {
        id: idOr(b.id, type),
        type,
        name: str(b.name, 60) || BLOCK_TYPES[type].label,
        enabled: b.enabled !== false,
        content: CONTENT_SHAPERS[type](obj(b.content)),
        style: shapeStyle(type, b.style),
    };
};

const shapeSeo = (raw) => {
    const s = obj(raw);
    return { title: str(s.title, 70), description: str(s.description, 170), image: normalizeLink(s.image) || '', noindex: bool(s.noindex, false) };
};

export const shapePage = (raw, { home = false } = {}) => {
    const p = obj(raw);
    const seen = new Set(); const blocks = [];
    for (const b of arr(p.blocks).slice(0, 30)) {
        const s = shapeBlock(b);
        if (!s) continue;
        while (seen.has(s.id)) s.id = makeId(s.type);
        seen.add(s.id); blocks.push(s);
    }
    const title = str(p.title, 80) || (home ? 'Inicio' : 'Página');
    return {
        id: idOr(p.id, 'page'),
        // La portada no tiene dirección propia: es «/».
        slug: home ? '' : slugify(p.slug || title),
        title,
        navLabel: str(p.navLabel, 30) || title,
        showInNav: bool(p.showInNav, !home),
        enabled: home ? true : p.enabled !== false,
        seo: shapeSeo(p.seo),
        blocks,
    };
};

/** Acentos de la identidad de Club Platform (lista cerrada, no un selector libre). */
export const ACCENTS = [{ id: 'gold', label: 'Dorado', hex: '#E29C00' }, { id: 'sky', label: 'Celeste', hex: '#38bdf8' }, { id: 'white', label: 'Blanco', hex: '#ffffff' }];

/** Un enlace de menú o de pie sirve si tiene texto y un destino real (un `javascript:` queda sin destino). */
const usableLink = (l) => Boolean(l.label) && l.action.type !== 'none' && (l.action.type !== 'external' || Boolean(l.action.target));

const shapeSettings = (raw) => {
    const s = obj(raw); const nav = obj(s.nav); const footer = obj(s.footer); const seo = obj(s.seo); const contact = obj(s.contact);
    const email = str(contact.email, 160).toLowerCase();
    return {
        name: str(s.name, 80) || 'Club Platform for Rotary',
        tagline: str(s.tagline, 140),
        language: oneOf(s.language, ['es', 'en', 'pt'], 'es'),
        logoUrl: normalizeLink(s.logoUrl) || '',
        accent: oneOf(s.accent, ACCENTS.map(a => a.id), 'gold'),
        header: oneOf(s.header, ['dark', 'light'], 'dark'),
        nav: {
            // Enlaces a contenedores de la portada; las páginas con «Mostrar en el menú» se suman solas.
            links: items(nav.links, 8, x => ({ id: idOr(x.id, 'nav'), label: str(x.label, 30), action: shapeButton({ label: 'x', action: x.action }).action })).filter(usableLink),
            cta: shapeButton(nav.cta, { label: 'Solicitar información', variant: 'gold', action: { type: 'contact', target: '' } }),
            showLogin: bool(nav.showLogin, true),
        },
        footer: {
            text: multi(footer.text, 400),
            note: str(footer.note, 200),
            links: items(footer.links, 8, x => ({ id: idOr(x.id, 'foot'), label: str(x.label, 40), action: shapeButton({ label: 'x', action: x.action }).action })).filter(usableLink),
        },
        contact: { email: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? email : '' },
        seo: {
            title: str(seo.title, 70), description: str(seo.description, 170), image: normalizeLink(seo.image) || '',
            organization: bool(seo.organization, true),
        },
    };
};

export const shapeSite = (raw) => {
    const s = obj(raw);
    const input = arr(s.pages).slice(0, 12);
    const pages = []; const slugs = new Set(['']); const ids = new Set();
    input.forEach((p, i) => {
        const page = shapePage(p, { home: i === 0 });
        while (ids.has(page.id)) page.id = makeId('page');
        ids.add(page.id);
        if (i > 0) {
            if (!page.slug) page.slug = `pagina-${i + 1}`;
            let base = page.slug; let n = 2;
            while (slugs.has(page.slug)) page.slug = `${base}-${n++}`.slice(0, 60);
            slugs.add(page.slug);
        }
        pages.push(page);
    });
    if (!pages.length) pages.push(shapePage({ title: 'Inicio', blocks: [] }, { home: true }));
    return { schemaVersion: SITE_SCHEMA_VERSION, settings: shapeSettings(s.settings), pages };
};

/** ¿Se puede guardar como borrador? Errores por página y contenedor. */
export const validateSite = (site) => {
    const errors = [];
    const push = (pageId, blockId, field, message) => errors.push({ pageId, blockId, field, message });
    const pageSlugs = site.pages.map(p => p.slug);
    site.pages.forEach((p, i) => {
        if (i > 0 && RESERVED_SLUGS.includes(p.slug)) push(p.id, null, 'slug', `La dirección «/${p.slug}» está reservada por la aplicación. Elige otra.`);
        if (!p.blocks.length && p.enabled) push(p.id, null, 'blocks', `La página «${p.title}» necesita al menos un contenedor.`);
        const singles = {};
        for (const b of p.blocks) {
            if (BLOCK_TYPES[b.type].single) { singles[b.type] = (singles[b.type] || 0) + 1; if (singles[b.type] > 1) push(p.id, b.id, 'type', `Sólo puede haber un contenedor «${BLOCK_TYPES[b.type].label}» por página.`); }
            const c = b.content;
            const buttons = [...arr(c.buttons), c.button, ...arr(c.items).map(x => x.link)].filter(Boolean);
            for (const btn of buttons) {
                if (!btn.label) continue;
                if (btn.action.type === 'external' && !btn.action.target) push(p.id, b.id, 'button', `El botón «${btn.label}» tiene un enlace externo inválido.`);
                if (btn.action.type === 'section' && btn.action.target && !p.blocks.some(x => x.id === btn.action.target)) push(p.id, b.id, 'button', `El botón «${btn.label}» apunta a un contenedor que no existe en esta página.`);
                if (btn.action.type === 'page' && !pageSlugs.includes(btn.action.target)) push(p.id, b.id, 'button', `El botón «${btn.label}» apunta a una página que no existe.`);
            }
            const images = [c.image, ...arr(c.items).map(x => x.image)].filter(Boolean);
            for (const img of images) if (img.url && !img.alt) push(p.id, b.id, 'image', 'Cada imagen necesita texto alternativo (accesibilidad).');
            if (b.type === 'hero' && !c.title) push(p.id, b.id, 'title', 'La portada necesita un título.');
            if (b.type === 'hero' && c.visual === 'image' && !c.image.url) push(p.id, b.id, 'image', 'La portada está configurada con imagen, pero no tiene ninguna. Sube una o elige otra composición.');
        }
    });
    return { ok: errors.length === 0, errors };
};

/**
 * Lo que falta para PUBLICAR (más estricto que guardar). `blocking` impide
 * publicar; `warnings` se muestran y se dejan pasar.
 */
export const publishChecklist = (site) => {
    const blocking = []; const warnings = [];
    const home = site.pages[0];
    const v = validateSite(site);
    for (const e of v.errors) blocking.push(e.message);
    if (!home.blocks.some(b => b.enabled && b.type === 'hero')) blocking.push('La portada del sitio necesita un contenedor «Portada» activo.');
    if (!(site.settings.seo.title || home.seo.title)) warnings.push('Falta el metatítulo del sitio (SEO).');
    if (!(site.settings.seo.description || home.seo.description)) warnings.push('Falta la metadescripción del sitio (SEO).');
    if (!(site.settings.seo.image || home.seo.image)) warnings.push('Falta la imagen para compartir (Open Graph).');
    const all = site.pages.flatMap(p => p.blocks.filter(b => b.enabled));
    for (const b of all.filter(x => x.type === 'solutions')) {
        const pend = b.content.items.filter(i => i.title && !i.verified).length;
        if (pend) warnings.push(`«${b.name}»: ${pend} capacidad(es) sin verificar no se mostrarán en público.`);
        if (!b.content.items.some(i => i.title && i.verified)) warnings.push(`«${b.name}» no tiene ninguna capacidad verificada: el contenedor no se mostrará.`);
    }
    const contact = all.find(x => x.type === 'contact');
    if (!contact) warnings.push('El sitio no tiene un contenedor de contacto: los botones «Solicitar información» no tendrán destino.');
    else if (contact.content.formEnabled && !site.settings.contact.email) warnings.push('No hay correo de contacto configurado: las solicitudes quedarán sólo en el panel.');
    return { ok: blocking.length === 0, blocking, warnings };
};

// ─── Contenido inicial ─────────────────────────────────────────────────

const btn = (label, type, target = '', variant = 'primary', icon = '') => ({ label, icon, variant, action: { type, target } });

/**
 * El sitio inicial, en BORRADOR. Los textos son la propuesta editorial del
 * encargo. Las capacidades listadas corresponden a módulos que existen en el
 * código de la plataforma (ver `docs/claude/sitio-web-de-club-platform.md`);
 * aun así nacen SIN verificar: quien publica las confirma una por una.
 */
export const defaultSite = () => shapeSite({
    settings: {
        name: 'Club Platform for Rotary',
        tagline: 'Ecosistema digital para Rotary',
        nav: {
            links: [
                { id: 'nav-que-es', label: 'Qué es', action: { type: 'section', target: 'que-es' } },
                { id: 'nav-soluciones', label: 'Soluciones', action: { type: 'section', target: 'soluciones' } },
                { id: 'nav-como', label: 'Cómo funciona', action: { type: 'section', target: 'como-funciona' } },
                { id: 'nav-tecnologia', label: 'Tecnología', action: { type: 'section', target: 'tecnologia' } },
                { id: 'nav-faq', label: 'Preguntas', action: { type: 'section', target: 'preguntas' } },
            ],
            cta: btn('Solicitar información', 'contact', '', 'gold'),
            showLogin: true,
        },
        footer: { text: 'Club Platform for Rotary es una plataforma tecnológica para clubes, distritos y programas del ecosistema Rotary.', note: 'Club Platform no es un sitio oficial de Rotary International.', links: [] },
        seo: {
            title: 'Club Platform for Rotary — Plataforma digital para clubes Rotary',
            description: 'Presencia web, contenidos, comunicación, herramientas administrativas y analítica en un ecosistema digital para clubes y distritos Rotary.',
            organization: true,
        },
    },
    pages: [{
        id: 'inicio', title: 'Inicio', navLabel: 'Inicio',
        blocks: [
            { id: 'portada', type: 'hero', name: 'Portada', content: {
                eyebrow: 'Plataforma digital para el ecosistema Rotary',
                title: 'La tecnología que conecta y fortalece la gestión de los clubes Rotary.',
                description: 'Club Platform integra presencia web, comunicación, contenidos, herramientas administrativas y analítica en un ecosistema digital diseñado para acompañar la transformación tecnológica de los clubes.',
                buttons: [btn('Conocer la plataforma', 'section', 'que-es', 'gold'), btn('Solicitar información', 'contact', '', 'secondary')],
                visual: 'product',
            } },
            { id: 'que-es', type: 'about', name: 'Qué es Club Platform', content: {
                title: 'Qué es Club Platform',
                description: 'Club Platform es una plataforma tecnológica pensada para el ecosistema Rotary. Desde un sistema central se crean y administran los sitios web de clubes, distritos, eventos y programas, y cada equipo gestiona sus contenidos y consulta su información desde un mismo panel.',
                flow: [
                    { id: 'flow-central', icon: 'layout', label: 'Plataforma central', description: 'Un solo sistema administra el ecosistema, sus usuarios y sus servicios.' },
                    { id: 'flow-sitios', icon: 'globe', label: 'Sitios del ecosistema', description: 'Cada club, distrito o evento tiene su sitio, con su dominio y su identidad.' },
                    { id: 'flow-herramientas', icon: 'layers', label: 'Herramientas y servicios', description: 'Contenidos, comunicación y analítica compartidos por todos los sitios.' },
                ],
            } },
            { id: 'soluciones', type: 'solutions', name: 'Ecosistema de soluciones', content: {
                title: 'Un ecosistema de soluciones',
                description: 'Capacidades de la plataforma que cada equipo activa según lo que necesita.',
                items: [
                    { id: 'sol-sitios', icon: 'globe', title: 'Sitios web institucionales', description: 'Sitios para clubes, distritos, eventos y ferias de proyectos sobre una misma plantilla institucional, con dominio propio.' },
                    { id: 'sol-contenidos', icon: 'file', title: 'Gestión de contenidos', description: 'Noticias, proyectos, eventos y biblioteca multimedia administrados desde el panel de cada sitio.' },
                    { id: 'sol-analitica', icon: 'chart', title: 'Analíticas', description: 'Métricas de visitas por sitio y consolidadas del ecosistema, y analítica de redes sociales.' },
                    { id: 'sol-comunicacion', icon: 'megaphone', title: 'Herramientas de comunicación', description: 'Correo electrónico con editor visual de plantillas, publicación en redes sociales y mensajería.' },
                    { id: 'sol-usuarios', icon: 'shield', title: 'Administración de usuarios', description: 'Usuarios, roles y permisos por sitio, con accesos diferenciados para cada equipo.' },
                    { id: 'sol-automatizaciones', icon: 'zap', title: 'Automatizaciones', description: 'Envíos programados y flujos automáticos de correo y de seguimiento.' },
                    { id: 'sol-integraciones', icon: 'plug', title: 'Integraciones', description: 'Pasarelas de pago para aportes e inscripciones, redes sociales y analítica web.' },
                    { id: 'sol-ia', icon: 'bot', title: 'Asistentes de inteligencia artificial', description: 'Apoyo para redactar noticias y preparar publicaciones, siempre con revisión de una persona antes de publicar.' },
                ],
            } },
            { id: 'como-funciona', type: 'steps', name: 'Cómo funciona', content: {
                title: 'Cómo funciona',
                description: 'El proceso de adopción, paso a paso.',
                steps: [
                    { id: 'step-1', title: 'Configuración', description: 'Se prepara el entorno digital del club.' },
                    { id: 'step-2', title: 'Personalización', description: 'Se adapta la identidad, el contenido y la estructura.' },
                    { id: 'step-3', title: 'Publicación', description: 'Se habilita la presencia web institucional.' },
                    { id: 'step-4', title: 'Gestión', description: 'El equipo administra contenidos y consulta información desde su panel.' },
                ],
            } },
            { id: 'tecnologia', type: 'architecture', name: 'Tecnología y arquitectura', content: {
                title: 'Tecnología y arquitectura',
                description: 'Un sistema central presta los mismos servicios a todos los sitios. Cada sitio conserva sus datos, sus usuarios y su identidad.',
                hub: { label: 'Club Platform', caption: 'Sistema central' },
                nodes: [
                    { id: 'node-sitios', icon: 'globe', label: 'Sitios institucionales', description: 'Cada sitio se sirve en su propio dominio.' },
                    { id: 'node-contenidos', icon: 'file', label: 'Administración de contenidos', description: 'Un panel por sitio.' },
                    { id: 'node-analitica', icon: 'chart', label: 'Analítica', description: 'Por sitio y consolidada.' },
                    { id: 'node-usuarios', icon: 'shield', label: 'Usuarios y permisos', description: 'Roles por sitio.' },
                    { id: 'node-servicios', icon: 'layers', label: 'Servicios compartidos', description: 'Multimedia, correo, traducción y SEO.' },
                    { id: 'node-integraciones', icon: 'plug', label: 'Integraciones', description: 'Pagos, redes sociales y analítica.' },
                ],
            } },
            { id: 'beneficios', type: 'benefits', name: 'Beneficios', content: {
                title: 'Beneficios',
                items: [
                    { id: 'ben-central', icon: 'layout', title: 'Gestión centralizada', description: 'Los sitios del ecosistema se administran desde un mismo sistema.' },
                    { id: 'ben-identidad', icon: 'palette', title: 'Identidad digital consistente', description: 'Todos los sitios parten de una misma plantilla institucional.' },
                    { id: 'ben-simple', icon: 'settings', title: 'Administración simplificada', description: 'Cada equipo edita su sitio desde el panel, sin conocimientos técnicos.' },
                    { id: 'ben-escala', icon: 'layers', title: 'Escalabilidad', description: 'La misma plataforma sirve a un club, a un distrito o a un evento.' },
                    { id: 'ben-info', icon: 'chart', title: 'Información consolidada', description: 'Las métricas de cada sitio y las del conjunto, en un solo lugar.' },
                    { id: 'ben-evolucion', icon: 'refresh', title: 'Evolución tecnológica progresiva', description: 'Las mejoras de la plataforma llegan a todos los sitios.' },
                ],
            } },
            { id: 'sitios', type: 'sites', name: 'Sitios del ecosistema', content: { title: 'Sitios del ecosistema', description: 'Algunos de los sitios que funcionan sobre Club Platform.', siteIds: [] } },
            { id: 'preguntas', type: 'faq', name: 'Preguntas frecuentes', content: {
                title: 'Preguntas frecuentes',
                items: [
                    { id: 'faq-1', question: '¿Qué necesita un club para tener su sitio en Club Platform?', answer: 'El nombre del club, su identidad visual y una persona responsable de administrar el sitio. La configuración inicial se hace desde el panel.' },
                    { id: 'faq-2', question: '¿Quién administra el contenido del sitio?', answer: 'El equipo del propio club, desde su panel. Cada persona entra con su usuario y ve sólo lo que su rol le permite.' },
                    { id: 'faq-3', question: '¿Se puede personalizar el sitio?', answer: 'Sí. Cada sitio adapta su identidad, sus imágenes, sus textos, su menú y las secciones que muestra.' },
                    { id: 'faq-4', question: '¿El sitio puede usar un dominio propio?', answer: 'Sí. Un sitio puede publicarse en su propio dominio; mientras se configura, funciona en una dirección provisional de la plataforma.' },
                    { id: 'faq-5', question: '¿Qué tipos de sitio admite la plataforma?', answer: 'Clubes, distritos, asociaciones, eventos o convenciones, ferias de proyectos, programas de intercambio y zonas.' },
                    { id: 'faq-6', question: '¿Cómo solicito información o soporte?', answer: 'Con el formulario de esta página. El equipo de Club Platform responde por correo.' },
                ],
            } },
            { id: 'contacto', type: 'contact', name: 'Llamado final y contacto', content: {
                title: 'Conoce Club Platform',
                description: 'Cuéntanos sobre tu club o distrito y te mostramos cómo funcionaría la plataforma en tu caso.',
                formEnabled: true,
            } },
        ],
    }],
});

export const newBlock = (type, rand = Math.random) => {
    if (!BLOCK_TYPE_IDS.includes(type)) return null;
    const seeds = {
        solutions: { items: [{ icon: 'layers', title: 'Nueva capacidad', description: '' }] },
        steps: { steps: [{ title: 'Primer paso', description: '' }] },
        benefits: { items: [{ icon: 'check', title: 'Nuevo beneficio', description: '' }] },
        faq: { items: [{ question: 'Nueva pregunta', answer: '' }] },
        architecture: { hub: { label: 'Club Platform', caption: 'Sistema central' }, nodes: [{ icon: 'globe', label: 'Sitios institucionales' }] },
    };
    return shapeBlock({ id: makeId(type, rand), type, name: BLOCK_TYPES[type].label, enabled: true, content: { title: BLOCK_TYPES[type].label, ...(seeds[type] || {}) } });
};

export const newPage = (title, rand = Math.random) => shapePage({ id: makeId('page', rand), title: str(title, 80) || 'Nueva página', showInNav: true, blocks: [{ id: makeId('text', rand), type: 'text', content: { title: str(title, 80) || 'Nueva página', body: '' } }] });

// ─── Resolución para pintar ────────────────────────────────────────────

/** Un botón guardado → lo que el navegador pinta. `null` = no se muestra. */
export const resolveButton = (b, { page, site, base = '', shown = (x) => x.enabled }) => {
    if (!b || !b.label) return null;
    const out = { label: b.label, icon: b.icon, variant: b.variant };
    const t = b.action?.type; const target = b.action?.target || '';
    const home = `${base}/` || '/';
    if (t === 'section') {
        if (!target) return null;
        // Un ancla de la portada, pedida desde otra página, vuelve a la portada.
        const here = page.blocks.some(x => x.id === target && shown(x));
        if (here) return { ...out, kind: 'anchor', href: `#${target}` };
        const inHome = site.pages[0].blocks.some(x => x.id === target && shown(x));
        return inHome ? { ...out, kind: 'link', href: `${home}#${target}` } : null;
    }
    if (t === 'page') {
        const p = site.pages.find(x => x.slug === target && x.enabled);
        return p ? { ...out, kind: 'link', href: p.slug ? `${base}/${p.slug}` : home } : null;
    }
    if (t === 'contact') {
        const here = page.blocks.find(x => x.type === 'contact' && shown(x));
        if (here) return { ...out, kind: 'anchor', href: `#${here.id}` };
        const inHome = site.pages[0].blocks.find(x => x.type === 'contact' && shown(x));
        return inHome ? { ...out, kind: 'link', href: `${home}#${inHome.id}` } : null;
    }
    if (t === 'app') return { ...out, kind: 'external', href: `https://${ADMIN_HOST}/`, sameTab: true };
    if (t === 'external') return target ? { ...out, kind: 'external', href: target } : null;
    return null;
};

/**
 * ¿Este contenedor tiene con qué pintarse en público? Va aparte de la
 * resolución porque un botón o un enlace del menú que apunta a un contenedor
 * que NO se va a pintar tampoco debe pintarse: sería un ancla a ninguna parte.
 */
export const blockReadiness = (b, sitesById = new Map()) => {
    const c = b.content; const notes = []; let ready = true;
    if (b.type === 'hero') ready = Boolean(c.title);
    else if (b.type === 'about' || b.type === 'feature') ready = Boolean(c.title || c.description);
    else if (b.type === 'solutions') {
        const filled = c.items.filter(i => i.title);
        const pend = filled.filter(i => !i.verified).length;
        if (pend) notes.push(`${pend} capacidad(es) sin verificar: no se muestran en público.`);
        ready = filled.some(i => i.verified);
        if (!ready) notes.push('Ninguna capacidad verificada: el contenedor no se mostrará en público.');
    }
    else if (b.type === 'steps') ready = c.steps.some(x => x.title);
    else if (b.type === 'architecture') ready = c.nodes.some(x => x.label);
    else if (b.type === 'benefits') ready = c.items.some(x => x.title);
    else if (b.type === 'sites') {
        ready = c.siteIds.some(id => sitesById.has(id));
        if (!ready) notes.push('Sin sitios elegidos (o ya no están publicados): el contenedor no se mostrará en público.');
    }
    else if (b.type === 'text') ready = Boolean(c.title || c.body);
    else if (b.type === 'faq') {
        ready = c.items.some(i => i.question && i.answer);
        if (c.items.some(i => i.question && !i.answer)) notes.push('Hay preguntas sin respuesta: no se muestran.');
    }
    else if (b.type === 'contact') ready = Boolean(c.title || c.formEnabled);
    return { ready, notes };
};

const img = (i, preview) => (i?.url ? { ...i, placeholder: false } : (preview ? { url: '', alt: '', focalX: 50, focalY: 50, placeholder: true } : null));

/**
 * La página lista para pintar. En PÚBLICO un contenedor sin datos publicables
 * no se pinta y una capacidad sin verificar no llega; en VISTA PREVIA todo se
 * pinta con su aviso, para que quien edita vea qué falta.
 *
 * `sources.sites`: filas públicas de sitios del ecosistema `{ id, name, logo, url }`.
 * `base`: prefijo de las direcciones (la vista previa privada vive bajo una ruta).
 */
export const resolvePage = (site, pageSlug = '', sources = {}, { preview = false, base = '' } = {}) => {
    const page = site.pages.find(p => p.slug === (pageSlug || '') && (p.enabled || preview));
    if (!page) return null;
    const sitesById = new Map(arr(sources.sites).map(s => [s.id, s]));
    const shown = (x) => x.enabled && (preview || blockReadiness(x, sitesById).ready);
    const ctx = { page, site, base, shown };
    const rb = (b) => resolveButton(b, ctx);
    const blocks = [];
    for (const b of page.blocks) {
        if (!b.enabled) continue;
        const c = b.content; const { ready, notes } = blockReadiness(b, sitesById); let data = c;
        if (!ready && !preview) continue;
        if (b.type === 'hero') data = { ...c, buttons: c.buttons.map(rb).filter(Boolean), image: c.visual === 'image' ? img(c.image, preview) : null };
        else if (b.type === 'about') data = { ...c, flow: c.flow.filter(f => f.label), image: img(c.image, false), button: rb(c.button) };
        else if (b.type === 'solutions') data = { ...c, items: c.items.filter(i => i.title && (preview || i.verified)).map(i => ({ ...i, image: img(i.image, false), link: rb(i.link) })) };
        else if (b.type === 'steps') data = { ...c, steps: c.steps.filter(x => x.title) };
        else if (b.type === 'architecture') data = { ...c, nodes: c.nodes.filter(x => x.label) };
        else if (b.type === 'benefits') data = { ...c, items: c.items.filter(i => i.title) };
        else if (b.type === 'sites') data = { title: c.title, description: c.description, sites: c.siteIds.map(id => sitesById.get(id)).filter(Boolean).map(x => ({ id: x.id, name: x.name, logo: c.showLogo ? (x.logo || '') : '', url: c.showLink ? (x.url || '') : '', kind: x.kind || '' })) };
        else if (b.type === 'feature') data = { ...c, image: img(c.image, preview), button: rb(c.button) };
        else if (b.type === 'faq') data = { ...c, items: c.items.filter(i => i.question && i.answer) };
        else if (b.type === 'contact') data = { ...c, button: rb(c.button) };
        // Los avisos son para quien edita: al público no le llega ninguno.
        blocks.push({ id: b.id, type: b.type, name: b.name, style: b.style, data, ready, notes: preview ? notes : [] });
    }
    const s = site.settings;
    const nav = [
        ...s.nav.links.map(l => ({ id: l.id, ...resolveButton({ label: l.label, action: l.action }, ctx) })).filter(l => l.href),
        ...site.pages.slice(1).filter(p => p.enabled && p.showInNav).map(p => ({ id: p.id, label: p.navLabel, kind: 'link', href: `${base}/${p.slug}`, current: p.id === page.id })),
    ];
    const home = site.pages[0];
    return {
        schemaVersion: site.schemaVersion,
        page: { id: page.id, slug: page.slug, title: page.title, isHome: page.id === home.id },
        blocks,
        chrome: {
            name: s.name, tagline: s.tagline, logoUrl: s.logoUrl, accent: s.accent, header: s.header, language: s.language, home: `${base}/` || '/',
            nav, cta: resolveButton(s.nav.cta, ctx), showLogin: s.nav.showLogin, loginHref: `https://${ADMIN_HOST}/`,
            footer: { text: s.footer.text, note: s.footer.note, links: s.footer.links.map(l => ({ id: l.id, ...resolveButton({ label: l.label, action: l.action }, ctx) })).filter(l => l.href) },
        },
        seo: seoFor(site, page),
    };
};

/** Título, descripción e imagen de una página, con el sitio como respaldo. */
export const seoFor = (site, page) => {
    const s = site.settings; const home = site.pages[0]; const isHome = page.id === home.id;
    const siteTitle = s.seo.title || s.name;
    return {
        title: page.seo.title || (isHome ? siteTitle : `${page.title} | ${s.name}`),
        description: page.seo.description || s.seo.description || s.tagline || '',
        image: page.seo.image || s.seo.image || '',
        noindex: page.seo.noindex,
        path: isHome ? '/' : `/${page.slug}`,
        siteName: s.name,
    };
};

/** Datos estructurados de la portada: la organización y el sitio. Sin cifras ni valoraciones. */
export const structuredData = (site, host) => {
    const s = site.settings; const url = `https://${host}/`;
    if (!s.seo.organization) return null;
    return {
        '@context': 'https://schema.org',
        '@graph': [
            { '@type': 'Organization', '@id': `${url}#organization`, name: s.name, url, ...(s.logoUrl ? { logo: s.logoUrl } : {}), ...(s.contact.email ? { email: s.contact.email } : {}) },
            { '@type': 'WebSite', '@id': `${url}#website`, url, name: s.name, inLanguage: s.language, publisher: { '@id': `${url}#organization` } },
        ],
    };
};

/** El `sitemap.xml` del sitio institucional: sólo páginas publicadas e indexables. */
export const sitemapXml = (site, host, lastmod = null) => {
    const esc = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const urls = site.pages.filter(p => p.enabled && !p.seo.noindex).map((p, i) => `  <url><loc>${esc(`https://${host}${i === 0 ? '/' : `/${p.slug}`}`)}</loc>${lastmod ? `<lastmod>${esc(String(lastmod).slice(0, 10))}</lastmod>` : ''}<priority>${i === 0 ? '1.0' : '0.7'}</priority></url>`);
    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
};

/** `robots.txt`: el panel y la API nunca; todo cerrado mientras el sitio no esté en vivo. */
export const robotsTxt = (host, { live = false } = {}) => (live
    ? `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\nDisallow: /login\nDisallow: /vista-previa\n\nSitemap: https://${host}/sitemap.xml\n`
    : 'User-agent: *\nDisallow: /\n');

/** Qué cambió entre dos versiones, en palabras, para el historial. */
export const diffSummary = (prev, next) => {
    const out = [];
    if (!prev) return ['Primera publicación del sitio.'];
    const pp = new Map(prev.pages.map(p => [p.id, p]));
    const np = new Map(next.pages.map(p => [p.id, p]));
    for (const p of next.pages) if (!pp.has(p.id)) out.push(`Página nueva: «${p.title}».`);
    for (const p of prev.pages) if (!np.has(p.id)) out.push(`Página eliminada: «${p.title}».`);
    for (const p of next.pages) {
        const old = pp.get(p.id); if (!old) continue;
        const ob = new Map(old.blocks.map(b => [b.id, b]));
        const nb = new Map(p.blocks.map(b => [b.id, b]));
        for (const b of p.blocks) {
            const o = ob.get(b.id);
            if (!o) out.push(`«${p.title}»: contenedor nuevo «${b.name}».`);
            else if (JSON.stringify(o) !== JSON.stringify(b)) out.push(`«${p.title}»: cambios en «${b.name}»${o.enabled !== b.enabled ? (b.enabled ? ' (ahora visible)' : ' (ahora oculto)') : ''}.`);
        }
        for (const b of old.blocks) if (!nb.has(b.id)) out.push(`«${p.title}»: contenedor eliminado «${b.name}».`);
        if (old.blocks.map(b => b.id).filter(id => nb.has(id)).join() !== p.blocks.map(b => b.id).filter(id => ob.has(id)).join()) out.push(`«${p.title}»: contenedores reordenados.`);
        if (JSON.stringify(old.seo) !== JSON.stringify(p.seo) || old.slug !== p.slug || old.title !== p.title) out.push(`«${p.title}»: cambios en dirección, título o SEO.`);
    }
    if (JSON.stringify(prev.settings) !== JSON.stringify(next.settings)) out.push('Cambios en diseño, menú, pie o SEO del sitio.');
    return out.length ? out.slice(0, 40) : ['Sin cambios de contenido respecto de la versión anterior.'];
};

// ─── Roles y flujo editorial ───────────────────────────────────────────

/**
 * Quién puede qué. `admin` es el administrador central (rol `administrator`
 * de la plataforma): no se asigna desde este módulo. `editor` y `reviewer`
 * se conceden por persona. Quien no está en la lista no tiene acceso.
 */
export const ROLES = {
    admin: { label: 'Administrador central', abilities: ['view', 'edit', 'review', 'publish', 'domain', 'members', 'leads'] },
    editor: { label: 'Editor del sitio institucional', abilities: ['view', 'edit', 'leads'] },
    reviewer: { label: 'Revisor', abilities: ['view', 'review'] },
};
export const ASSIGNABLE_ROLES = ['editor', 'reviewer'];

/**
 * ¿Administrador CENTRAL? La regla de siempre de la plataforma
 * (`campaignScope.isOperator`, `programAccess.isPlatformOperator`):
 * `superadmin`, o `administrator` SIN club asignado. Un `administrator` con
 * club es el administrador local de ese club y NO hereda lo global: el sitio
 * institucional no es suyo.
 */
export const isCentralAdmin = (user) => {
    const role = String(user?.role || '');
    if (role === 'superadmin' || user?.isSuperAdmin === true) return true;
    return role === 'administrator' && !user?.clubId;
};
export const can = (role, ability) => Boolean(ROLES[role]?.abilities.includes(ability));

/** Borrador → En revisión → Aprobado → Publicado. `changes_requested` vuelve a borrador con nota. */
export const REVIEW_STATES = {
    draft: { label: 'Borrador' },
    in_review: { label: 'En revisión' },
    changes_requested: { label: 'Con cambios solicitados' },
    approved: { label: 'Aprobado para publicar' },
};

/**
 * ¿Se puede publicar esta versión del borrador? El administrador central
 * publica; si la revisión es obligatoria, además hace falta que ESA versión
 * del borrador esté aprobada (una edición posterior invalida la aprobación).
 */
export const canPublishNow = ({ role, requireReview, reviewStatus, reviewedVersion, draftVersion }) => {
    if (!can(role, 'publish')) return { ok: false, reason: 'Sólo un administrador central puede publicar el sitio institucional.' };
    if (!requireReview) return { ok: true };
    if (reviewStatus === 'approved' && Number(reviewedVersion) === Number(draftVersion)) return { ok: true };
    return { ok: false, reason: 'La revisión es obligatoria: este borrador todavía no fue aprobado (o cambió después de aprobarse).' };
};

/** Hechos validados de la plataforma: el ÚNICO contexto que recibe el asistente de redacción. */
export const PLATFORM_FACTS = [
    'Club Platform for Rotary es una plataforma tecnológica multisitio para el ecosistema Rotary.',
    'El panel de administración central está en app.clubplatform.org.',
    'Tipos de sitio que admite: clubes, distritos, asociaciones, eventos o convenciones, ferias de proyectos, programas de intercambio y zonas.',
    'Cada sitio puede publicarse en su propio dominio y se administra desde su panel.',
    'Módulos existentes: sitios web, noticias, proyectos, eventos e inscripciones, biblioteca multimedia, analíticas del sitio y de redes sociales, correo electrónico con editor visual, publicación en redes sociales, usuarios y roles, SEO, traducción del sitio público y herramientas de inteligencia artificial para redactar contenidos.',
    'Club Platform no es un sitio oficial de Rotary International.',
    'No hay clientes, cifras, precios, plazos ni resultados validados para comunicar: no deben mencionarse.',
];

export default {
    SITE_SCHEMA_VERSION, PLATFORM_SITE_ID, PLATFORM_SITE_TYPE, PLATFORM_SITE_TYPE_LABEL, ADMIN_HOST, DEFAULT_PUBLIC_HOST,
    BACKGROUNDS, ICONS, SPACINGS, ANIMATIONS, BUTTON_ACTIONS, BLOCK_TYPES, ACCENTS, RESERVED_SLUGS, ROLES, ASSIGNABLE_ROLES, REVIEW_STATES, PLATFORM_FACTS,
    normalizeLink, normalizeHost, slugify, shapeSite, shapePage, shapeBlock, validateSite, publishChecklist, defaultSite, newBlock, newPage,
    resolvePage, resolveButton, blockReadiness, seoFor, structuredData, sitemapXml, robotsTxt, diffSummary, can, canPublishNow, isCentralAdmin,
};
