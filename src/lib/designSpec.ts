// ════════════════════════════════════════════════════════════════════
// Plantillas IA — espejo del criterio en el navegador
// v4.720.0
//
// Espejo de `server/lib/designSpec.js`. Está duplicado a propósito, igual que
// `ADMIN_ROLES` y que `NATIONAL_LANGS`: el servidor decide qué acepta y guarda,
// el navegador decide qué pinta. **Si cambia una lista, cambiar la otra** — lo
// comprueba `npm run test:design`, que carga los dos módulos y los compara
// valor por valor y salida por salida. Sin esa prueba, la vista previa y el
// archivo exportado se separarían en silencio, que es la avería más cara que
// puede tener un editor visual.
//
// Lo que vive acá es lo que el navegador NECESITA para dibujar: la geometría,
// el reparto del texto en líneas y los tipos. Lo que decide el servidor —qué
// plantillas hay, qué variables existen, qué se guarda— no se copia.
// ════════════════════════════════════════════════════════════════════

export interface DesignFormat {
    id: string; label: string; ratio: string;
    width: number; height: number; available: boolean; networks: string[];
}

export const FORMATS: Record<string, DesignFormat> = {
    post_1_1: { id: 'post_1_1', label: 'Post cuadrado', ratio: '1:1', width: 1080, height: 1080, available: true, networks: ['Instagram', 'Facebook', 'LinkedIn', 'WhatsApp', 'X'] },
    post_4_5: { id: 'post_4_5', label: 'Post vertical', ratio: '4:5', width: 1080, height: 1350, available: false, networks: ['Instagram', 'Facebook'] },
    story_9_16: { id: 'story_9_16', label: 'Historia', ratio: '9:16', width: 1080, height: 1920, available: false, networks: ['Instagram', 'Facebook', 'WhatsApp'] },
    post_16_9: { id: 'post_16_9', label: 'Apaisado', ratio: '16:9', width: 1920, height: 1080, available: false, networks: ['LinkedIn', 'X', 'YouTube'] },
};

export const DEFAULT_FORMAT = 'post_1_1';
export const formatOf = (id?: string | null): DesignFormat => FORMATS[id || ''] || FORMATS[DEFAULT_FORMAT];

export const PALETTE = {
    royal: '#17458F', gold: '#F7A81B', azure: '#0067C8', navy: '#0B2B5C',
    sky: '#00A2E0', cloud: '#EEF1F6', white: '#FFFFFF', slate: '#6B7DA0', ink: '#0F1E3D',
} as const;

export const FONTS = [
    { id: 'sans', label: 'Institucional (Arial)', stack: 'Arial, Helvetica, sans-serif' },
    { id: 'serif', label: 'Serif', stack: 'Georgia, "Times New Roman", serif' },
    { id: 'mono', label: 'Monoespaciada', stack: '"Courier New", monospace' },
];
export const fontStack = (id?: string): string => (FONTS.find(f => f.id === id) || FONTS[0]).stack;

// ─── Nodos ─────────────────────────────────────────────────────────────

export type NodeType = 'text' | 'image' | 'shape' | 'icon';

export interface GradientStop { at: number; color: string }
export interface Gradient { type: 'linear' | 'radial'; angle: number; stops: GradientStop[] }
export type Fill = string | Gradient;

export interface BaseNode {
    id: string;
    type: NodeType;
    name?: string | null;
    /** Fracciones del lienzo (0-1). */
    x: number; y: number; w: number; h: number;
    rotation: number;
    opacity: number;
    locked?: boolean;
    hidden?: boolean;
    role?: string | null;
}

export interface TextNode extends BaseNode {
    type: 'text';
    text: string;
    /** El texto ANTES de resolver las variables, o `null` si el usuario lo
     *  escribió a mano. Ver `applyVariables`. */
    srcText?: string | null;
    /** Fracción del ANCHO del lienzo, igual criterio que los `sizes` del pendón. */
    fontSize: number;
    fontFamily: string;
    fontWeight: number;
    color: string;
    align: 'left' | 'center' | 'right';
    valign: 'top' | 'middle' | 'bottom';
    lineHeight: number;
    letterSpacing: number;
    italic: boolean;
    uppercase: boolean;
    autoFit: boolean;
    minFontSize: number;
}

export interface ImageNode extends BaseNode {
    type: 'image';
    src: string | null;
    /** La variable de la que sale la imagen (`imagen`, `logo`). */
    srcVar?: string | null;
    fit: 'cover' | 'contain';
    radius: number;
    circle?: boolean;
}

export interface ShapeNode extends BaseNode {
    type: 'shape' | 'icon';
    shape: string;
    fill: Fill;
    radius: number;
    stroke: string | null;
    strokeWidth: number;
    path: string | null;
}

export type DesignNode = TextNode | ImageNode | ShapeNode;

export interface DesignDocument {
    format: string;
    background: string;
    nodes: DesignNode[];
}

export const isText = (n: DesignNode): n is TextNode => n.type === 'text';
export const isImage = (n: DesignNode): n is ImageNode => n.type === 'image';
export const isShape = (n: DesignNode): n is ShapeNode => n.type === 'shape' || n.type === 'icon';
export const isGradient = (f: Fill): f is Gradient => typeof f === 'object' && f !== null && Array.isArray((f as Gradient).stops);

// ─── Reparto del texto en líneas ───────────────────────────────────────
//
// `measure` se INYECTA. En el editor y en la exportación es el MISMO contexto
// 2D, así que las dos parten el texto en los mismos puntos. La vista previa NO
// deja que el navegador reparta las líneas: pide las líneas acá y pinta una por
// una. Si dejara al navegador hacerlo, un título de dos líneas en pantalla
// podría salir de tres en el archivo descargado.

export type Measure = (text: string, fontPx: number) => number;

export const wrapText = (text: string, maxWidth: number, measure: Measure): string[] => {
    const out: string[] = [];
    for (const paragraph of String(text ?? '').split('\n')) {
        const words = paragraph.split(/\s+/).filter(Boolean);
        if (!words.length) { out.push(''); continue; }
        let line = words[0];
        for (let i = 1; i < words.length; i++) {
            const test = `${line} ${words[i]}`;
            if (measure(test, 0) > maxWidth && line) { out.push(line); line = words[i]; }
            else line = test;
        }
        out.push(line);
    }
    return out;
};

export interface TextLayout { lines: string[]; fontSize: number; height: number; overflow: boolean }

export const layoutText = ({
    text, boxW, boxH, fontSize, lineHeight = 1.2, minFontSize = 0, autoFit = true, measure,
}: {
    text: string; boxW: number; boxH: number; fontSize: number;
    lineHeight?: number; minFontSize?: number; autoFit?: boolean; measure: Measure;
}): TextLayout => {
    if (typeof measure !== 'function') throw new Error('layoutText: falta `measure`');
    const floor = autoFit ? Math.min(fontSize, Math.max(1, minFontSize)) : fontSize;
    let size = fontSize;
    let lines = wrapText(text, boxW, (t) => measure(t, size));

    let guard = 60;
    while (autoFit && size > floor && guard-- > 0) {
        const tooTall = lines.length * size * lineHeight > boxH;
        const tooWide = lines.some(l => measure(l, size) > boxW + 0.5);
        if (!tooTall && !tooWide) break;
        size = Math.max(floor, size * 0.94);
        lines = wrapText(text, boxW, (t) => measure(t, size));
    }

    const height = lines.length * size * lineHeight;
    return { lines, fontSize: size, height, overflow: height > boxH + 0.5 };
};

// ─── Geometría compartida ──────────────────────────────────────────────
//
// El mismo string `d` lo pinta el DOM en un `<path>` y el exportador en un
// `Path2D`. No hay dos dibujos, hay uno: por eso la vista previa y el archivo
// no pueden diferir.
export const shapePath = (shape: string, w: number, h: number, opts: { radius?: number } = {}): string => {
    const r = Math.max(0, Math.min(opts.radius ?? 0, Math.min(w, h) / 2));
    switch (shape) {
        case 'ellipse': {
            const rx = w / 2, ry = h / 2;
            return `M 0 ${ry} A ${rx} ${ry} 0 1 0 ${w} ${ry} A ${rx} ${ry} 0 1 0 0 ${ry} Z`;
        }
        case 'wave':
            return `M 0 ${h} L 0 ${h * 0.42} C ${w * 0.28} ${h * -0.06}, ${w * 0.66} ${h * 0.34}, ${w} ${h * 0.14} L ${w} ${h} Z`;
        case 'arc':
            return `M 0 0 L ${w} 0 L ${w} ${h * 0.52} C ${w * 0.68} ${h * 0.94}, ${w * 0.3} ${h * 0.16}, 0 ${h * 0.72} Z`;
        case 'ribbon':
            return `M 0 ${h * 0.5} C ${w * 0.25} ${h * 0.08}, ${w * 0.75} ${h * 0.92}, ${w} ${h * 0.5} L ${w} ${h} L 0 ${h} Z`;
        case 'rect':
        default:
            if (!r) return `M 0 0 L ${w} 0 L ${w} ${h} L 0 ${h} Z`;
            return `M ${r} 0 L ${w - r} 0 Q ${w} 0 ${w} ${r} L ${w} ${h - r} Q ${w} ${h} ${w - r} ${h} L ${r} ${h} Q 0 ${h} 0 ${h - r} L 0 ${r} Q 0 0 ${r} 0 Z`;
    }
};

// ─── Guías del editor ──────────────────────────────────────────────────
export const SAFE_AREA = 0.06;
export const MARGIN = 0.075;
export const SNAP_PX = 7;
export const HISTORY_STEPS = 60;

// ─── Ayudas del editor ─────────────────────────────────────────────────

let _measureCtx: CanvasRenderingContext2D | null = null;
/** Un único contexto de medición para toda la aplicación: crear un canvas por
 *  cada medida es lo que vuelve lento un editor con decenas de capas. */
export const measureContext = (): CanvasRenderingContext2D => {
    if (_measureCtx) return _measureCtx;
    const c = document.createElement('canvas');
    c.width = c.height = 1;
    _measureCtx = c.getContext('2d')!;
    return _measureCtx;
};

/** El medidor de un nodo de texto a un ancho de lienzo dado. Lo usan por igual
 *  la vista previa y la exportación — ése es el punto. */
export const measurerFor = (node: TextNode, canvasW: number, ctx?: CanvasRenderingContext2D): Measure => {
    const c = ctx || measureContext();
    return (text: string, fontPx: number) => {
        const px = fontPx || node.fontSize * canvasW;
        c.font = `${node.italic ? 'italic ' : ''}${node.fontWeight} ${px}px ${fontStack(node.fontFamily)}`;
        const base = c.measureText(text).width;
        return base + (node.letterSpacing || 0) * canvasW * Math.max(0, text.length - 1);
    };
};

/** El texto tal cual se dibuja (mayúsculas aplicadas). Se resuelve en un solo
 *  sitio para que la MEDIDA y el DIBUJO usen la misma cadena: medir el texto en
 *  minúsculas y pintarlo en mayúsculas desborda el recuadro. */
export const renderedText = (node: TextNode): string => (node.uppercase ? node.text.toLocaleUpperCase('es') : node.text);

export const layoutFor = (node: TextNode, canvasW: number, canvasH: number, ctx?: CanvasRenderingContext2D): TextLayout =>
    layoutText({
        text: renderedText(node),
        boxW: node.w * canvasW,
        boxH: node.h * canvasH,
        fontSize: node.fontSize * canvasW,
        lineHeight: node.lineHeight,
        minFontSize: node.minFontSize * canvasW,
        autoFit: node.autoFit,
        measure: measurerFor(node, canvasW, ctx),
    });

/** Desplazamiento vertical dentro del recuadro según `valign`.
 *
 *  Se REDONDEA a píxel entero, y no por prolijidad: con `valign: 'middle'` el
 *  desplazamiento es fraccionario, y el DOM y el canvas no redondean igual —
 *  medido, eso dejaba la exportación 1 px por encima de la vista previa en la
 *  plantilla clásica. Un entero da el mismo resultado en los dos caminos. */
export const verticalOffset = (node: TextNode, layout: TextLayout, boxH: number): number => {
    if (node.valign === 'middle') return Math.round(Math.max(0, (boxH - layout.height) / 2));
    if (node.valign === 'bottom') return Math.round(Math.max(0, boxH - layout.height));
    return 0;
};

// ─── Variables en vivo ─────────────────────────────────────────────────
//
// Cambiar «los años que cumple» o la fotografía repinta la pieza en el acto,
// sin volver al servidor. La alternativa —recompilar la plantilla en cada
// cambio— se llevaría por delante todo lo que el usuario haya movido, que es
// el defecto clásico de un editor con plantillas.
//
// Un nodo cuyo texto se editó A MANO tiene `srcText: null` y ya no sigue a la
// variable. Es la regla que hace previsible el sistema: lo que escribiste vos
// no lo pisa nadie. Misma idea que `putAuto` respetando las traducciones
// manuales.

const VAR_RE = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;

export const resolveVariables = (text: string, vars: Record<string, string>): string =>
    String(text ?? '')
        .replace(VAR_RE, (_m, name: string) => {
            const v = vars[name];
            return v === undefined || v === null ? '' : String(v);
        })
        .replace(/[ \t]{2,}/g, ' ')
        .trim();

export const applyVariables = (nodes: DesignNode[], vars: Record<string, string>): DesignNode[] =>
    nodes.map(n => {
        if (isText(n) && n.srcText) {
            const text = resolveVariables(n.srcText, vars);
            return text === n.text ? n : { ...n, text };
        }
        if (isImage(n) && n.srcVar) {
            const src = vars[n.srcVar] || null;
            return src === n.src ? n : { ...n, src };
        }
        return n;
    });

export const uid = (prefix = 'n'): string => `${prefix}_${Math.random().toString(36).slice(2, 9)}`;

/** Duplicar desplaza un poco la copia: superpuesta exactamente, el usuario cree
 *  que no pasó nada y vuelve a pulsar. */
export const duplicateNode = <T extends DesignNode>(node: T): T => ({
    ...node,
    id: uid(node.type),
    name: node.name ? `${node.name} (copia)` : null,
    x: Math.min(0.95, node.x + 0.025),
    y: Math.min(0.95, node.y + 0.025),
    locked: false,
});
