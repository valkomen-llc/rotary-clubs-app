// ════════════════════════════════════════════════════════════════════
// Plantillas IA — biblioteca de elementos institucionales
// v4.720.0
//
// Cada elemento es un trazo SVG en un lienzo de 100×100. Se guarda como el
// atributo `d` de un `<path>` porque ése es el string que comparten el editor
// (DOM, `<path d>`) y la exportación (canvas, `new Path2D(d)`): un solo dibujo,
// dos consumidores. Ver la nota de `shapePath` en `designSpec.js`.
//
// ── POR QUÉ NO HAY UNA RUEDA ROTARY AQUÍ ────────────────────────────
//
// El emblema de Rotary es una marca registrada con especificaciones de uso
// propias (proporciones, colores y zona de resguardo) y su reproducción sale
// del Brand Center, no de un trazo que dibujemos nosotros. Un engranaje
// "parecido" es exactamente el tipo de pieza que el Distrito no puede publicar.
// Por eso el emblema entra como IMAGEN —el logotipo oficial del club, subido o
// tomado de la Biblioteca Multimedia, igual que en el Generador de Pendones— y
// lo que hay acá son elementos decorativos genéricos.
//
// Al agregar un elemento: trazo en viewBox 100×100, un solo `path`, sin texto.
// ════════════════════════════════════════════════════════════════════

import { PALETTE } from './designSpec.js';

export const ELEMENT_CATEGORIES = [
    { id: 'celebracion', label: 'Celebración' },
    { id: 'reconocimiento', label: 'Reconocimiento' },
    { id: 'marcos', label: 'Marcos y cintas' },
    { id: 'formas', label: 'Formas y fondos' },
];

// `defaultFill` es una sugerencia: el usuario lo cambia desde el panel de
// propiedades. Se declara para que un elemento recién arrastrado se vea
// razonable sin tocar nada.
export const ELEMENTS = [
    // ── Celebración ────────────────────────────────────────────────
    {
        id: 'confeti', label: 'Confeti', category: 'celebracion', defaultFill: PALETTE.gold, ratio: 1,
        path: 'M8 12 L18 8 L14 18 Z M34 6 L42 10 L36 17 Z M62 9 L71 6 L69 16 Z M88 14 L96 11 L92 21 Z '
            + 'M14 38 L23 34 L20 44 Z M44 32 L52 36 L46 43 Z M74 35 L83 31 L80 42 Z '
            + 'M6 62 L15 58 L12 69 Z M38 60 L47 64 L41 71 Z M68 63 L77 59 L74 70 Z M92 58 L99 62 L94 69 Z '
            + 'M20 86 L29 82 L26 93 Z M52 84 L60 88 L54 95 Z M80 88 L89 84 L86 95 Z',
    },
    {
        id: 'globos', label: 'Globos', category: 'celebracion', defaultFill: PALETTE.gold, ratio: 1,
        path: 'M30 4 C43 4 51 15 51 27 C51 40 42 52 30 58 C18 52 9 40 9 27 C9 15 17 4 30 4 Z '
            + 'M30 58 L27 66 L33 66 Z M30 66 C30 78 24 84 27 96 M70 20 C81 20 88 29 88 39 '
            + 'C88 50 80 60 70 65 C60 60 52 50 52 39 C52 29 59 20 70 20 Z M70 65 L67 72 L73 72 Z '
            + 'M70 72 C70 82 76 87 73 97',
    },
    {
        id: 'estrellas', label: 'Estrellas', category: 'celebracion', defaultFill: PALETTE.gold, ratio: 1,
        path: 'M50 6 L58 30 L83 30 L63 45 L70 69 L50 54 L30 69 L37 45 L17 30 L42 30 Z '
            + 'M16 66 L20 78 L32 78 L22 85 L26 97 L16 90 L6 97 L10 85 L0 78 L12 78 Z '
            + 'M84 66 L88 78 L100 78 L90 85 L94 97 L84 90 L74 97 L78 85 L68 78 L80 78 Z',
    },
    {
        id: 'destello', label: 'Destello', category: 'celebracion', defaultFill: PALETTE.gold, ratio: 1,
        path: 'M50 0 C54 34 66 46 100 50 C66 54 54 66 50 100 C46 66 34 54 0 50 C34 46 46 34 50 0 Z',
    },
    // ── Reconocimiento ─────────────────────────────────────────────
    {
        id: 'medalla', label: 'Medalla', category: 'reconocimiento', defaultFill: PALETTE.gold, ratio: 1,
        path: 'M30 2 L44 40 L28 46 Z M70 2 L56 40 L72 46 Z '
            + 'M50 40 C68 40 82 54 82 72 C82 90 68 100 50 100 C32 100 18 90 18 72 C18 54 32 40 50 40 Z',
    },
    {
        id: 'laurel', label: 'Laurel', category: 'reconocimiento', defaultFill: PALETTE.gold, ratio: 1,
        path: 'M34 96 C10 80 6 48 22 16 C30 26 32 34 30 42 C24 36 18 34 12 36 C18 44 24 48 32 48 '
            + 'C28 56 28 62 30 68 C24 64 18 64 12 66 C18 74 26 78 34 76 Z '
            + 'M66 96 C90 80 94 48 78 16 C70 26 68 34 70 42 C76 36 82 34 88 36 C82 44 76 48 68 48 '
            + 'C72 56 72 62 70 68 C76 64 82 64 88 66 C82 74 74 78 66 76 Z',
    },
    {
        id: 'insignia', label: 'Insignia', category: 'reconocimiento', defaultFill: PALETTE.royal, ratio: 1,
        path: 'M50 2 L62 12 L78 10 L82 26 L96 34 L88 48 L96 62 L82 70 L78 86 L62 84 L50 94 '
            + 'L38 84 L22 86 L18 70 L4 62 L12 48 L4 34 L18 26 L22 10 L38 12 Z',
    },
    // ── Marcos y cintas ────────────────────────────────────────────
    {
        id: 'cinta', label: 'Cinta', category: 'marcos', defaultFill: PALETTE.gold, ratio: 2.6,
        path: 'M0 20 L12 0 L88 0 L100 20 L88 40 L12 40 Z',
    },
    {
        id: 'banderin', label: 'Banderín', category: 'marcos', defaultFill: PALETTE.royal, ratio: 1,
        path: 'M6 4 L94 4 L94 62 L50 96 L6 62 Z',
    },
    {
        id: 'marco', label: 'Marco', category: 'marcos', defaultFill: PALETTE.gold, ratio: 1,
        path: 'M0 0 L100 0 L100 100 L0 100 Z M6 6 L6 94 L94 94 L94 6 Z',
    },
    {
        id: 'subrayado', label: 'Subrayado', category: 'marcos', defaultFill: PALETTE.gold, ratio: 12,
        path: 'M0 0 L100 0 L100 100 L0 100 Z',
    },
    // ── Formas y fondos ────────────────────────────────────────────
    { id: 'circulo', label: 'Círculo', category: 'formas', defaultFill: PALETTE.royal, ratio: 1, shape: 'ellipse' },
    { id: 'rectangulo', label: 'Rectángulo', category: 'formas', defaultFill: PALETTE.royal, ratio: 1.6, shape: 'rect' },
    { id: 'onda', label: 'Onda', category: 'formas', defaultFill: PALETTE.navy, ratio: 3, shape: 'wave' },
    { id: 'arco', label: 'Arco', category: 'formas', defaultFill: PALETTE.navy, ratio: 3, shape: 'arc' },
    { id: 'ondulado', label: 'Cinta ondulada', category: 'formas', defaultFill: PALETTE.gold, ratio: 4, shape: 'ribbon' },
];

export const elementById = (id) => ELEMENTS.find(e => e.id === id) || null;

export const elementsByCategory = () =>
    ELEMENT_CATEGORIES.map(c => ({ ...c, items: ELEMENTS.filter(e => e.category === c.id) }));

// Convierte un elemento de la biblioteca en un nodo del documento, centrado en
// el lienzo y con un tamaño de partida sensato. Los elementos con `shape` usan
// la geometría paramétrica de `designSpec.shapePath`; los que traen `path`, su
// propio trazo en viewBox 100×100.
export const elementToNode = (element, { at = { x: 0.5, y: 0.5 }, size = 0.22 } = {}) => {
    if (!element) return null;
    const w = size;
    const h = size / (element.ratio || 1);
    return {
        id: `el_${element.id}_${Math.round(at.x * 1000)}_${Math.round(at.y * 1000)}`,
        type: element.path ? 'icon' : 'shape',
        name: element.label,
        x: Math.max(0, at.x - w / 2),
        y: Math.max(0, at.y - h / 2),
        w, h,
        rotation: 0, opacity: 1,
        shape: element.shape || 'rect',
        path: element.path || null,
        fill: element.defaultFill,
    };
};

export default { ELEMENT_CATEGORIES, ELEMENTS, elementById, elementsByCategory, elementToNode };
