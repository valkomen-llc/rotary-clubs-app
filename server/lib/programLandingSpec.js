// ════════════════════════════════════════════════════════════════════
// Programas — la PÁGINA PÚBLICA por contenedores — el criterio — v4.1281.0
//
// Puro: sin base, sin red. Lo usan el controlador, las pruebas y (por
// espejo) `src/lib/programLandingSpec.ts`. Al tocar uno, tocar el otro: lo
// fija `scripts/test-programas.mjs`.
//
// La landing de un programa es una LISTA CERRADA de contenedores (portada,
// presentación, tarjetas, equipo, impacto, directorio, donaciones, historias,
// recursos, clubes, contacto), cada uno con su contenido editable, su estilo
// acotado (fondo, alineación, lado de la imagen) y sus botones de acción
// controlada. No hay HTML, CSS ni JavaScript arbitrario: el administrador
// elige entre opciones y el servidor las sanea.
//
// Lo que viene de OTRO módulo (clínicas, historias, recursos, indicadores,
// el canal de donación) se REFERENCIA, nunca se copia: `resolveLanding`
// resuelve esas referencias contra los registros publicados al pintar. En
// público un contenedor sin datos publicables NO se pinta; en la vista previa
// se pinta con marcadores («Fotografía real autorizada», «Indicadores por
// validar») para que quien edita vea qué falta.
// ════════════════════════════════════════════════════════════════════
import { normalizeLink } from './programSpec.js';

const str = (v, max) => String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
const multi = (v, max) => String(v ?? '').trim().replace(/\r\n/g, '\n').slice(0, max);
const arr = (v) => (Array.isArray(v) ? v : []);
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const bool = (v, d = false) => (typeof v === 'boolean' ? v : d);
const clampInt = (v, min, max, d) => { const n = Number.parseInt(v, 10); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d; };

export const LANDING_SCHEMA_VERSION = 1;

/** Fondos de contenedor. Los colores son los del sitio del distrito (tema). */
export const BACKGROUNDS = [
    { id: 'white', label: 'Blanco' },
    { id: 'light', label: 'Azul claro (portada)' },
    { id: 'blue', label: 'Azul institucional' },
    { id: 'navy', label: 'Azul marino' },
    { id: 'gray', label: 'Gris claro' },
];
export const BACKGROUND_IDS = BACKGROUNDS.map(b => b.id);

/** Íconos de LISTA CERRADA (se pintan con lucide en azul con detalle dorado). */
export const ICONS = [
    { id: 'book', label: 'Libro' }, { id: 'map-pin', label: 'Ubicación' }, { id: 'help', label: 'Pregunta' }, { id: 'users', label: 'Personas' },
    { id: 'family', label: 'Familia' }, { id: 'hospital', label: 'Clínica' }, { id: 'rotary', label: 'Rueda rotaria' }, { id: 'heart', label: 'Corazón' },
    { id: 'hands', label: 'Manos' }, { id: 'play', label: 'Video' }, { id: 'headphones', label: 'Audio / podcast' }, { id: 'file', label: 'Documento' },
    { id: 'layers', label: 'Recursos' }, { id: 'search', label: 'Buscar' }, { id: 'phone', label: 'Teléfono' }, { id: 'mail', label: 'Correo' },
    { id: 'star', label: 'Estrella' }, { id: 'award', label: 'Reconocimiento' }, { id: 'calendar', label: 'Calendario' }, { id: 'globe', label: 'Mundo' },
    { id: 'baby', label: 'Infancia' }, { id: 'stethoscope', label: 'Salud' }, { id: 'home', label: 'Hogar' }, { id: 'sparkles', label: 'Destellos' }, { id: 'arrow', label: 'Flecha' },
];
export const ICON_IDS = ICONS.map(i => i.id);
export const isIcon = (v) => ICON_IDS.includes(String(v || ''));

/** Las secciones de la página de DETALLE (`/programas/:slug/detalle#…`). */
export const DETAIL_ANCHORS = [
    { id: 'programa', label: 'El programa' }, { id: 'clinicas', label: 'Directorio de clínicas' }, { id: 'familias', label: 'Información y recursos para familias' },
    { id: 'historias', label: 'Historias' }, { id: 'equipo', label: 'Equipo' }, { id: 'impacto', label: 'Impacto' }, { id: 'ayudar', label: 'Cómo ayudar' },
    { id: 'noticias', label: 'Noticias y eventos' }, { id: 'aliados', label: 'Aliados' }, { id: 'contacto', label: 'Contacto y formularios' },
];
export const FORM_TARGETS = [
    { id: 'orientacion', label: 'Necesito orientación' }, { id: 'apoyo', label: 'Quiero apoyar' }, { id: 'club', label: 'Mi club quiere participar' }, { id: 'novedades', label: 'Quiero recibir novedades' },
];

/** Qué hace un botón. `donation` usa el canal de donación del programa (fuente única). */
export const BUTTON_ACTIONS = [
    { id: 'section', label: 'Ir a un contenedor de esta página' },
    { id: 'detail', label: 'Ir a la página de detalle del programa' },
    { id: 'form', label: 'Abrir un formulario' },
    { id: 'donation', label: 'Canal oficial de donación' },
    { id: 'internal', label: 'Enlace interno del sitio' },
    { id: 'external', label: 'Enlace externo' },
    { id: 'none', label: 'Sin acción (oculto)' },
];
const ACTION_IDS = BUTTON_ACTIONS.map(a => a.id);

export const shapeButton = (raw, fallback = {}) => {
    const b = obj(raw);
    const a = obj(b.action);
    const type = ACTION_IDS.includes(a.type) ? a.type : (fallback.action?.type || 'none');
    let target = str(a.target, 300);
    if (type === 'external') target = normalizeLink(target) || '';
    else if (type === 'internal') target = /^\/[^\s]*$/.test(target) && !target.startsWith('//') ? target.slice(0, 200) : '';
    else if (type === 'form') target = FORM_TARGETS.some(f => f.id === target) ? target : 'orientacion';
    else if (type === 'detail') target = DETAIL_ANCHORS.some(d => d.id === target) ? target : 'programa';
    else if (type === 'section') target = str(target, 60);
    else target = '';
    return {
        label: str(b.label, 60) || fallback.label || '',
        icon: isIcon(b.icon) ? b.icon : (fallback.icon || ''),
        variant: ['primary', 'secondary', 'gold'].includes(b.variant) ? b.variant : (fallback.variant || 'primary'),
        action: { type, target },
    };
};

export const shapeImage = (raw) => {
    const i = obj(raw);
    return {
        url: normalizeLink(i.url) || '',
        alt: str(i.alt, 200),
        mediaId: str(i.mediaId, 80) || null,
        focalX: clampInt(i.focalX, 0, 100, 50),
        focalY: clampInt(i.focalY, 0, 100, 50),
        placeholder: str(i.placeholder, 60) || 'Fotografía real autorizada',
    };
};

const makeId = (prefix, rand = Math.random) => `${prefix}-${Math.floor(rand() * 0xffffff).toString(16).padStart(6, '0')}`;

// ─── Tipos de contenedor ───────────────────────────────────────────────

/**
 * `single`: una sola instancia por página (portada, directorio, donaciones,
 * contacto). Los demás se pueden agregar varias veces con id propio.
 * `source`: el módulo del que toma datos (se muestra en el editor con su acceso).
 */
export const BLOCK_TYPES = {
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

const STYLE_DEFAULTS = {
    hero: { background: 'light', align: 'left', imageSide: 'right' },
    intro: { background: 'navy', align: 'center', imageSide: 'right' },
    cards: { background: 'white', align: 'center', imageSide: 'right' },
    feature: { background: 'blue', align: 'left', imageSide: 'right' },
    impact: { background: 'gray', align: 'center', imageSide: 'right' },
    directory: { background: 'white', align: 'center', imageSide: 'right' },
    donation: { background: 'navy', align: 'left', imageSide: 'left' },
    stories: { background: 'white', align: 'center', imageSide: 'right' },
    resources: { background: 'navy', align: 'center', imageSide: 'right' },
    clubs: { background: 'white', align: 'left', imageSide: 'right' },
    contact: { background: 'blue', align: 'center', imageSide: 'right' },
};

const shapeStyle = (type, raw) => {
    const s = obj(raw); const d = STYLE_DEFAULTS[type] || STYLE_DEFAULTS.cards;
    return {
        background: BACKGROUND_IDS.includes(s.background) ? s.background : d.background,
        align: ['left', 'center'].includes(s.align) ? s.align : d.align,
        imageSide: ['left', 'right'].includes(s.imageSide) ? s.imageSide : d.imageSide,
        overlay: clampInt(s.overlay, 0, 60, 0),
    };
};

const CONTENT_SHAPERS = {
    hero: (c) => ({
        eyebrow: str(c.eyebrow, 80), title: str(c.title, 120), tagline: str(c.tagline, 120), description: multi(c.description, 400),
        image: shapeImage(c.image), buttons: arr(c.buttons).slice(0, 2).map(b => shapeButton(b)),
    }),
    intro: (c) => ({ title: str(c.title, 120), description: multi(c.description, 800), button: shapeButton(c.button) }),
    cards: (c) => ({
        title: str(c.title, 120), description: multi(c.description, 400),
        cards: arr(c.cards).slice(0, 6).map(x => ({ id: str(obj(x).id, 40) || makeId('card'), icon: isIcon(obj(x).icon) ? obj(x).icon : 'book', title: str(obj(x).title, 80), description: multi(obj(x).description, 300), link: shapeButton(obj(x).link, { label: 'Más información' }) })),
    }),
    feature: (c) => ({ title: str(c.title, 120), description: multi(c.description, 800), image: shapeImage(c.image), button: shapeButton(c.button) }),
    impact: (c) => ({
        title: str(c.title, 120), description: multi(c.description, 400),
        items: arr(c.items).slice(0, 6).map(x => ({ id: str(obj(x).id, 40) || makeId('ind'), icon: isIcon(obj(x).icon) ? obj(x).icon : 'star', label: str(obj(x).label, 80), indicatorId: str(obj(x).indicatorId, 80) || null })),
    }),
    directory: (c) => ({
        title: str(c.title, 120), description: multi(c.description, 400), initialCount: clampInt(c.initialCount, 1, 12, 2),
        searchLabel: str(c.searchLabel, 40) || 'Buscar', contactLabel: str(c.contactLabel, 40) || 'Ver contacto',
        allButton: shapeButton(c.allButton, { label: 'Ver directorio completo', icon: 'layers', action: { type: 'detail', target: 'clinicas' } }),
        filters: { region: bool(obj(c.filters).region, true), city: bool(obj(c.filters).city, true) },
        fields: { institution: bool(obj(c.fields).institution, true), schedule: bool(obj(c.fields).schedule, false), careConditions: bool(obj(c.fields).careConditions, true) },
    }),
    donation: (c) => ({ title: str(c.title, 120), description: multi(c.description, 400), image: shapeImage(c.image), button: shapeButton(c.button, { label: 'Quiero donar', icon: 'heart', action: { type: 'donation', target: '' } }) }),
    stories: (c) => ({
        title: str(c.title, 120), description: multi(c.description, 400), mode: obj(c).mode === 'manual' ? 'manual' : 'latest',
        storyIds: arr(c.storyIds).map(x => str(x, 80)).filter(Boolean).slice(0, 12), count: clampInt(c.count, 1, 6, 3),
        linkLabel: str(c.linkLabel, 40) || 'Más información', showSummary: bool(c.showSummary, false), showDate: bool(c.showDate, false),
    }),
    resources: (c) => ({
        title: str(c.title, 120), description: multi(c.description, 400),
        items: arr(c.items).slice(0, 6).map(x => ({ id: str(obj(x).id, 40) || makeId('res'), icon: isIcon(obj(x).icon) ? obj(x).icon : 'file', label: str(obj(x).label, 60), resourceType: ['documento', 'video', 'audio', 'podcast', 'enlace', ''].includes(obj(x).resourceType) ? obj(x).resourceType : '', action: shapeButton({ action: obj(x).action }, { action: { type: 'detail', target: 'familias' } }).action })),
        button: shapeButton(c.button, { label: 'Explora los recursos', icon: 'layers', action: { type: 'detail', target: 'familias' } }),
    }),
    clubs: (c) => ({ title: str(c.title, 120), description: multi(c.description, 800), image: shapeImage(c.image), illustration: ['hands', 'none'].includes(c.illustration) ? c.illustration : 'hands', button: shapeButton(c.button, { label: 'Quiero vincular mi club', icon: 'rotary', action: { type: 'form', target: 'club' } }) }),
    contact: (c) => ({ title: str(c.title, 120), description: multi(c.description, 400), button: shapeButton(c.button, { label: 'Solicitar orientación', icon: 'mail', action: { type: 'form', target: 'orientacion' } }) }),
};

export const shapeBlock = (raw) => {
    const b = obj(raw);
    const type = BLOCK_TYPE_IDS.includes(b.type) ? b.type : null;
    if (!type) return null;
    return {
        id: /^[a-z0-9-]{3,40}$/.test(String(b.id || '')) ? String(b.id) : makeId(type),
        type,
        name: str(b.name, 60) || BLOCK_TYPES[type].label,
        enabled: b.enabled !== false,
        content: CONTENT_SHAPERS[type](obj(b.content)),
        style: shapeStyle(type, b.style),
    };
};

export const shapeLanding = (raw) => {
    const l = obj(raw);
    const seen = new Set();
    const blocks = [];
    for (const b of arr(l.blocks).slice(0, 30)) {
        const s = shapeBlock(b);
        if (!s) continue;
        while (seen.has(s.id)) s.id = makeId(s.type);
        seen.add(s.id); blocks.push(s);
    }
    const back = obj(l.settings).backLink;
    return {
        schemaVersion: LANDING_SCHEMA_VERSION,
        blocks,
        settings: { backLink: { label: str(obj(back).label, 40) || 'Volver al menú', href: /^\/[^\s]*$/.test(String(obj(back).href || '')) && !String(obj(back).href).startsWith('//') ? String(obj(back).href).slice(0, 200) : '/' } },
    };
};

/** ¿Se puede guardar como borrador? Errores por bloque. */
export const validateLanding = (l) => {
    const errors = [];
    const push = (blockId, field, message) => errors.push({ blockId, field, message });
    if (!l.blocks.length) push(null, 'blocks', 'La página necesita al menos un contenedor.');
    const singles = {};
    for (const b of l.blocks) {
        if (BLOCK_TYPES[b.type].single) { singles[b.type] = (singles[b.type] || 0) + 1; if (singles[b.type] > 1) push(b.id, 'type', `Sólo puede haber un contenedor «${BLOCK_TYPES[b.type].label}».`); }
        const buttons = [];
        const c = b.content;
        if (c.buttons) buttons.push(...c.buttons);
        if (c.button) buttons.push(c.button);
        if (c.allButton) buttons.push(c.allButton);
        if (c.cards) buttons.push(...c.cards.map(x => x.link));
        for (const btn of buttons) {
            if (!btn || !btn.label) continue;
            if (btn.action.type === 'external' && !btn.action.target) push(b.id, 'button', `El botón «${btn.label}» tiene un enlace externo inválido.`);
            if (btn.action.type === 'internal' && !btn.action.target) push(b.id, 'button', `El botón «${btn.label}» necesita una ruta interna que empiece por «/».`);
            if (btn.action.type === 'section' && btn.action.target && !l.blocks.some(x => x.id === btn.action.target)) push(b.id, 'button', `El botón «${btn.label}» apunta a un contenedor que no existe.`);
        }
        for (const img of [c.image].filter(Boolean)) if (img.url && !img.alt) push(b.id, 'image', 'La imagen necesita texto alternativo (accesibilidad).');
        if (b.type === 'hero' && !c.title) push(b.id, 'title', 'La portada necesita el nombre del programa.');
    }
    return { ok: errors.length === 0, errors };
};

// ─── Configuración inicial ─────────────────────────────────────────────

/** Textos de la referencia para el piloto; para otro programa, genéricos. */
const TEXTS = {
    'clinicas-ponseti': {
        tagline: 'Cada paso abre un futuro', heroDescription: 'Información, orientación y una red de apoyo para las familias.',
        introDescription: 'Conectamos a las familias, a los profesionales de la salud y a la red de Rotary en el Distrito {district} para acompañar el tratamiento con el método Ponseti.',
        card1: 'Qué es el método Ponseti, cómo funciona y cómo puede apoyar el desarrollo de los niños y niñas.',
        card2: 'Consulta la red de clínicas vinculadas al programa en el Distrito {district} y conoce cómo contactarlas.',
        card3: 'Respuestas a las preguntas más frecuentes de las familias sobre el programa y el proceso de atención.',
        featureDescription: 'Un equipo de profesionales de la salud y voluntarios de Rotary trabaja de manera articulada para orientar, acompañar y facilitar el acceso a la atención en las Clínicas Ponseti del Distrito.',
        clubsDescription: 'Tu club puede ser parte activa de las Clínicas Ponseti, impulsando alianzas, acciones de apoyo y la sostenibilidad del programa en el Distrito {district}.',
    },
};
const generic = (p) => ({
    tagline: '', heroDescription: p.summary || 'Información, orientación y una red de apoyo.',
    introDescription: p.summary || '', card1: 'Qué es el programa, cómo funciona y a quién acompaña.', card2: 'Consulta la red de centros vinculados al programa y conoce cómo contactarlos.',
    card3: 'Respuestas a las preguntas más frecuentes sobre el programa y el proceso de atención.',
    featureDescription: 'Un equipo de profesionales y voluntarios de Rotary trabaja de manera articulada para orientar y acompañar.',
    clubsDescription: `Tu club puede ser parte activa del programa, impulsando alianzas, acciones de apoyo y su sostenibilidad en el Distrito {district}.`,
});

/** La landing inicial de un programa, en BORRADOR, con los marcadores de la referencia. `rand` se inyecta para probarlo. */
export const defaultLanding = (program = {}, { districtNumber = null, rand = Math.random } = {}) => {
    const t = TEXTS[program.slug] || generic(program);
    const d = districtNumber ? String(districtNumber) : '';
    const tx = (s) => String(s || '').replace(/\{district\}/g, d).replace(/\s+\./g, '.').trim();
    const id = (p) => makeId(p, rand);
    const heroId = id('hero');
    const blocks = [
        { id: heroId, type: 'hero', name: 'Portada del programa', enabled: true, style: STYLE_DEFAULTS.hero, content: {
            eyebrow: d ? `Programas · Distrito ${d}` : 'Programas', title: program.name || 'Programa', tagline: t.tagline, description: tx(t.heroDescription),
            image: { url: program.heroImageUrl || '', alt: program.heroImageAlt || '', focalX: 50, focalY: 50, placeholder: 'Fotografía real autorizada' },
            buttons: [{ label: 'Necesito orientación', icon: 'family', variant: 'primary', action: { type: 'form', target: 'orientacion' } }, { label: 'Encuentra una clínica', icon: 'map-pin', variant: 'secondary', action: { type: 'section', target: 'directorio' } }],
        } },
        { id: 'presentacion', type: 'intro', name: 'Presentación del programa', enabled: true, style: STYLE_DEFAULTS.intro, content: { title: 'Una red de apoyo que transforma vidas', description: tx(t.introDescription), button: { label: 'Conoce el programa', icon: 'heart', variant: 'secondary', action: { type: 'detail', target: 'programa' } } } },
        { id: 'familias', type: 'cards', name: 'Información para familias', enabled: true, style: STYLE_DEFAULTS.cards, content: { title: 'Información para familias', description: '', cards: [
            { id: 'card-programa', icon: 'book', title: 'Conoce el programa', description: tx(t.card1), link: { label: 'Más información', icon: 'arrow', variant: 'secondary', action: { type: 'detail', target: 'programa' } } },
            { id: 'card-clinica', icon: 'map-pin', title: 'Encuentra una clínica', description: tx(t.card2), link: { label: 'Más información', icon: 'arrow', variant: 'secondary', action: { type: 'section', target: 'directorio' } } },
            { id: 'card-dudas', icon: 'help', title: 'Resuelve tus dudas', description: tx(t.card3), link: { label: 'Más información', icon: 'arrow', variant: 'secondary', action: { type: 'detail', target: 'familias' } } },
        ] } },
        { id: 'equipo', type: 'feature', name: 'Equipo y protagonistas', enabled: true, style: STYLE_DEFAULTS.feature, content: { title: 'Personas que hacen posible cada paso', description: tx(t.featureDescription), image: { url: '', alt: '', focalX: 50, focalY: 50, placeholder: 'Fotografía real autorizada' }, button: { label: 'Conoce el equipo', icon: 'users', variant: 'secondary', action: { type: 'detail', target: 'equipo' } } } },
        { id: 'impacto', type: 'impact', name: 'Impacto del programa', enabled: true, style: STYLE_DEFAULTS.impact, content: { title: '', description: '', items: [
            { id: 'ind-familias', icon: 'family', label: 'Familias acompañadas', indicatorId: null }, { id: 'ind-clinicas', icon: 'hospital', label: 'Clínicas vinculadas', indicatorId: null }, { id: 'ind-clubes', icon: 'rotary', label: 'Clubes que apoyan', indicatorId: null },
        ] } },
        { id: 'directorio', type: 'directory', name: 'Directorio de clínicas', enabled: true, style: STYLE_DEFAULTS.directory, content: CONTENT_SHAPERS.directory({ title: 'Encuentra una clínica', description: '', initialCount: 2 }) },
        { id: 'donaciones', type: 'donation', name: 'Donaciones', enabled: true, style: STYLE_DEFAULTS.donation, content: { title: 'Tu apoyo puede abrir caminos', description: 'Apoya al programa a través de su canal oficial de donación.', image: { url: '', alt: '', focalX: 50, focalY: 50, placeholder: 'Fotografía real autorizada' }, button: { label: 'Quiero donar', icon: 'heart', variant: 'secondary', action: { type: 'donation', target: '' } } } },
        { id: 'historias', type: 'stories', name: 'Historias', enabled: true, style: STYLE_DEFAULTS.stories, content: CONTENT_SHAPERS.stories({ title: 'Historias que inspiran', count: 3 }) },
        { id: 'recursos', type: 'resources', name: 'Recursos educativos', enabled: true, style: STYLE_DEFAULTS.resources, content: CONTENT_SHAPERS.resources({ title: 'Aprender también es acompañar', items: [
            { id: 'res-videos', icon: 'play', label: 'Videos para familias', resourceType: 'video', action: { type: 'detail', target: 'familias' } },
            { id: 'res-podcast', icon: 'headphones', label: 'Podcast', resourceType: 'podcast', action: { type: 'detail', target: 'familias' } },
            { id: 'res-guias', icon: 'file', label: 'Guías y recursos', resourceType: 'documento', action: { type: 'detail', target: 'familias' } },
        ] }) },
        { id: 'clubes', type: 'clubs', name: 'Vinculación de clubes', enabled: true, style: STYLE_DEFAULTS.clubs, content: { title: '¿Tu club quiere sumarse?', description: tx(t.clubsDescription), image: { url: '', alt: '', focalX: 50, focalY: 50, placeholder: '' }, illustration: 'hands', button: { label: 'Quiero vincular mi club', icon: 'rotary', variant: 'secondary', action: { type: 'form', target: 'club' } } } },
        { id: 'contacto', type: 'contact', name: 'Orientación y contacto', enabled: true, style: STYLE_DEFAULTS.contact, content: { title: 'Estamos para orientarte', description: 'Cuéntanos desde qué ciudad nos escribes y cómo podemos contactarte.', button: { label: 'Solicitar orientación', icon: 'mail', variant: 'secondary', action: { type: 'form', target: 'orientacion' } } } },
    ];
    return shapeLanding({ schemaVersion: LANDING_SCHEMA_VERSION, blocks, settings: { backLink: { label: 'Volver al menú', href: '/' } } });
};

/** Un contenedor nuevo de un tipo, con contenido vacío razonable (para «Agregar contenedor»). */
export const newBlock = (type, rand = Math.random) => {
    if (!BLOCK_TYPES[type]) return null;
    const base = defaultLanding({ name: 'Programa', slug: '' }, { rand }).blocks.find(b => b.type === type);
    const b = shapeBlock({ ...base, id: makeId(type, rand), name: BLOCK_TYPES[type].label });
    if (type === 'hero') { b.content.title = ''; b.content.eyebrow = ''; }
    return b;
};

// ─── Resolución contra las fuentes reales ──────────────────────────────

/** El destino de un botón en ESTA página. `null` = no se puede ofrecer. */
export const resolveButton = (btn, { slug, donation = null, landingBlocks = [] } = {}) => {
    if (!btn || !btn.label) return null;
    const a = btn.action || {};
    const base = { label: btn.label, icon: btn.icon || '', variant: btn.variant || 'primary' };
    if (a.type === 'section') return a.target && landingBlocks.some(b => b.id === a.target && b.enabled !== false) ? { ...base, kind: 'anchor', href: `#${a.target}` } : null;
    if (a.type === 'detail') return { ...base, kind: 'link', href: `/programas/${encodeURIComponent(slug)}/detalle#${a.target || 'programa'}` };
    if (a.type === 'form') return { ...base, kind: 'form', form: a.target || 'orientacion' };
    if (a.type === 'donation') return donation ? { ...base, kind: 'donation', donation } : null;
    if (a.type === 'internal') return a.target ? { ...base, kind: 'link', href: a.target } : null;
    if (a.type === 'external') return a.target ? { ...base, kind: 'external', href: a.target } : null;
    return null;
};

const imageOrPlaceholder = (img, preview) => {
    const i = obj(img);
    if (i.url) return { url: i.url, alt: i.alt || '', focalX: i.focalX ?? 50, focalY: i.focalY ?? 50, placeholder: false };
    return preview ? { url: '', alt: '', focalX: 50, focalY: 50, placeholder: true, placeholderLabel: i.placeholder || 'Fotografía real autorizada' } : null;
};

/**
 * Resuelve la landing contra los registros publicados.
 *   sources = { slug, clinics[], stories[], resources[], indicators[], donation|null, formsEnabled{} }
 * Devuelve bloques listos para pintar: en público sólo los que tienen algo
 * que mostrar; en vista previa todos los activos, con `notes` de lo que falta.
 */
export const resolveLanding = (landing, sources = {}, { preview = false } = {}) => {
    const { slug = '', clinics = [], stories = [], resources = [], indicators = [], donation = null, formsEnabled = {} } = sources;
    const enabled = arr(landing?.blocks).filter(b => b.enabled !== false);
    const donationOk = donation && donation.url && donation.receiver && donation.verifiedAt ? donation : null;
    const ctx = { slug, donation: donationOk, landingBlocks: enabled };
    const btn = (b, notes) => {
        const r = resolveButton(b, ctx);
        if (!r) { if (b?.label && b.action?.type === 'donation') notes.push('Botón de donación oculto: falta un canal de donación publicado y verificado.'); else if (b?.label && b.action?.type !== 'none') notes.push(`Botón «${b.label}» sin destino válido.`); return null; }
        if (r.kind === 'form' && formsEnabled[r.form] === false) { notes.push(`El formulario «${r.form}» está desactivado en el programa.`); return null; }
        return r;
    };
    const out = [];
    for (const b of enabled) {
        const notes = [];
        const c = b.content;
        let data = null; let ready = true;
        if (b.type === 'hero') data = { ...c, image: imageOrPlaceholder(c.image, preview), buttons: c.buttons.map(x => btn(x, notes)).filter(Boolean) };
        else if (b.type === 'intro' || b.type === 'contact') { data = { ...c, button: btn(c.button, notes) }; ready = Boolean(c.title || c.description); }
        else if (b.type === 'cards') { data = { ...c, cards: c.cards.filter(x => x.title).map(x => ({ ...x, link: btn(x.link, notes) })) }; ready = data.cards.length > 0; if (!ready) notes.push('Sin tarjetas con título.'); }
        else if (b.type === 'feature' || b.type === 'clubs') { data = { ...c, image: imageOrPlaceholder(c.image, preview), button: btn(c.button, notes) }; ready = Boolean(c.title); }
        else if (b.type === 'impact') {
            const items = c.items.map(it => { const ind = it.indicatorId ? indicators.find(i => i.id === it.indicatorId) : null; return { ...it, indicator: ind ? { value: ind.value, unit: ind.unit, name: ind.name, period: ind.period, mode: ind.mode, source: ind.source, updatedOn: ind.updatedOn } : null }; });
            const publicables = items.filter(i => i.indicator);
            if (publicables.length < items.length) notes.push(`${items.length - publicables.length} indicador(es) por validar: vincúlalos a un indicador publicado.`);
            data = { ...c, items: preview ? items : publicables }; ready = publicables.length > 0;
        }
        else if (b.type === 'directory') {
            const regions = {};
            for (const k of clinics) { const r = k.region || 'Sin región'; regions[r] = regions[r] || new Set(); if (k.city) regions[r].add(k.city); }
            data = { ...c, slug, clinics, facets: Object.entries(regions).sort((a, z) => a[0].localeCompare(z[0], 'es')).map(([region, cities]) => ({ region, cities: Array.from(cities).sort((a, z) => a.localeCompare(z, 'es')) })), allButton: btn(c.allButton, notes) };
            ready = clinics.length > 0; if (!ready) notes.push('Sin clínicas publicadas: el directorio no se mostrará en público.');
        }
        else if (b.type === 'donation') { data = { ...c, image: imageOrPlaceholder(c.image, preview), button: btn(c.button, notes), receiver: donationOk ? donationOk.receiver : '', disclaimer: donationOk ? donationOk.disclaimer || '' : '', verifiedAt: donationOk ? donationOk.verifiedAt : '' }; ready = Boolean(donationOk); if (!ready) notes.push('Entidad receptora y enlace por confirmar: este contenedor no se mostrará en público hasta publicar un enlace de donación verificado.'); }
        else if (b.type === 'stories') {
            const chosen = c.mode === 'manual' ? c.storyIds.map(id => stories.find(s => s.id === id)).filter(Boolean) : stories.slice(0, c.count);
            data = { ...c, slug, stories: chosen.slice(0, c.count).map(s => ({ id: s.id, title: s.title, summary: s.summary, date: s.date, image: (s.media || []).find(m => m.kind === 'image' && m.url) || null })) };
            ready = data.stories.length > 0; if (!ready) notes.push('Sin historias aprobadas: el contenedor no se mostrará en público.');
        }
        else if (b.type === 'resources') {
            const items = c.items.filter(i => i.label).map(i => ({ ...i, count: i.resourceType ? resources.filter(r => r.type === i.resourceType).length : resources.length, link: resolveButton({ label: i.label, action: i.action }, ctx) }));
            data = { ...c, items: preview ? items : items.filter(i => i.count > 0 && i.link), button: btn(c.button, notes), total: resources.length };
            ready = resources.length > 0 && data.items.length > 0; if (!ready) notes.push('Sin recursos publicados del tipo elegido: el contenedor no se mostrará en público.');
            else if (items.some(i => i.count === 0)) notes.push('Algún acceso no tiene recursos publicados de su tipo y se ocultará en público.');
        }
        if (!ready && !preview) continue;
        out.push({ id: b.id, type: b.type, name: b.name, style: b.style, data, ready, notes });
    }
    return { schemaVersion: landing?.schemaVersion || LANDING_SCHEMA_VERSION, blocks: out, settings: landing?.settings || { backLink: { label: 'Volver al menú', href: '/' } } };
};

export default { LANDING_SCHEMA_VERSION, BACKGROUNDS, ICONS, BUTTON_ACTIONS, DETAIL_ANCHORS, FORM_TARGETS, BLOCK_TYPES, shapeLanding, validateLanding, defaultLanding, newBlock, resolveLanding, resolveButton };
