// ════════════════════════════════════════════════════════════════════
// Plantillas IA — espejo del criterio en el navegador
// v4.728.0
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

import type { LinkedField } from './designFields';

export interface DesignFormat {
    id: string; label: string; ratio: string;
    width: number; height: number; available: boolean; networks: string[];
}

export const FORMATS: Record<string, DesignFormat> = {
    post_1_1: { id: 'post_1_1', label: 'Post cuadrado', ratio: '1:1', width: 1080, height: 1080, available: true, networks: ['Instagram', 'Facebook', 'LinkedIn', 'WhatsApp', 'X'] },
    // Activo desde v4.833, cuando entraron las plantillas de Infografías de
    // Campaña autorizadas para esta proporción. Se activó en el servidor y NO
    // acá: el espejo quedó diciendo que el formato no existe mientras el
    // servidor generaba piezas en él. Lo venía marcando `test:design` desde
    // entonces — un espejo que no se corrige deja de servir para nada.
    post_4_5: { id: 'post_4_5', label: 'Post vertical', ratio: '4:5', width: 1080, height: 1350, available: true, networks: ['Instagram', 'Facebook'] },
    story_9_16: { id: 'story_9_16', label: 'Historia', ratio: '9:16', width: 1080, height: 1920, available: false, networks: ['Instagram', 'Facebook', 'WhatsApp'] },
    post_16_9: { id: 'post_16_9', label: 'Apaisado', ratio: '16:9', width: 1920, height: 1080, available: false, networks: ['LinkedIn', 'X', 'YouTube'] },
};

export const DEFAULT_FORMAT = 'post_1_1';
export const formatOf = (id?: string | null): DesignFormat => FORMATS[id || ''] || FORMATS[DEFAULT_FORMAT];

export const PALETTE = {
    royal: '#17458F', gold: '#F7A81B', azure: '#0067C8', navy: '#0B2B5C',
    sky: '#00A2E0', cloud: '#EEF1F6', white: '#FFFFFF', slate: '#6B7DA0', ink: '#0F1E3D',
} as const;

// ─── Tipografías ───────────────────────────────────────────────────────
//
// Dos clases, y la diferencia importa:
//
//   · Las del SISTEMA están siempre disponibles y no cuestan una descarga.
//     Ninguna pieza ya guardada puede quedarse sin su letra.
//   · Las EMPAQUETADAS (`web: true`) viajan con la aplicación en
//     `public/fonts/` y las carga `designFonts.ts` ANTES de medir y de
//     dibujar. Son las que reproducen el carácter de las piezas de referencia
//     del Distrito —una sans condensada pesada en mayúsculas— que ningún stack
//     del sistema tiene.
//
// La cautela que hasta v4.836 prohibía toda fuente web sigue en pie; lo que
// cambió es que ahora se RESUELVE en vez de evitarse. El peligro que enunciaba
// era que la fuente llegara para la vista previa y no para la exportación:
// como las dos leen ESTA misma cadena y comparten `document.fonts`, esperar
// `document.fonts.ready` las deja ver lo mismo, y si la descarga falla caen
// JUNTAS al respaldo. La paridad se conserva siempre; lo que se degrada es el
// parecido con la referencia, y eso se dice. Ver `designFonts.ts`.
//
// ⚠️ La cadena de una familia empaquetada TERMINA en tipografías del sistema a
// propósito. Sin respaldo, un fallo de descarga dejaría el texto en la letra
// por omisión del navegador, que puede ser una serif — y una pieza
// institucional compuesta en Times es peor que una compuesta en Arial.
//
// ⚠️ `sans` se queda PRIMERA: `fontStack` cae a `FONTS[0]` cuando el id no se
// reconoce, así que moverla cambiaría la letra de todo documento guardado con
// una familia que después se retire.
export const FONTS = [
    { id: 'sans', label: 'Institucional (Arial)', stack: 'Arial, Helvetica, sans-serif' },
    // Open Sans es la tipografía de marca de Rotary International; no se
    // eligió por gusto. Oswald es la condensada de los titulares y las cifras.
    { id: 'brand', label: 'Rotary (Open Sans)', stack: '"Open Sans", "Segoe UI", Arial, Helvetica, sans-serif', web: true },
    { id: 'condensed', label: 'Condensada (Oswald)', stack: 'Oswald, "Arial Narrow", Impact, "Arial Black", sans-serif', web: true },
    { id: 'system', label: 'Del sistema', stack: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' },
    { id: 'verdana', label: 'Verdana', stack: 'Verdana, Geneva, sans-serif' },
    { id: 'tahoma', label: 'Tahoma', stack: 'Tahoma, Geneva, sans-serif' },
    { id: 'trebuchet', label: 'Trebuchet', stack: '"Trebuchet MS", "Lucida Grande", sans-serif' },
    { id: 'impact', label: 'Impact (titulares)', stack: 'Impact, "Arial Black", sans-serif' },
    { id: 'serif', label: 'Serif', stack: 'Georgia, "Times New Roman", serif' },
    { id: 'times', label: 'Times', stack: '"Times New Roman", Times, serif' },
    { id: 'palatino', label: 'Palatino', stack: '"Palatino Linotype", "Book Antiqua", Palatino, serif' },
    { id: 'garamond', label: 'Garamond', stack: 'Garamond, "Times New Roman", serif' },
    { id: 'mono', label: 'Monoespaciada', stack: '"Courier New", monospace' },
];

/** Las familias que dependen de una descarga. Es el CRITERIO —vive acá, no en
 *  el cargador— porque lo consumen las dos puntas: `designFonts.ts` para saber
 *  qué pedir y la pantalla para avisar cuando una pieza salió con la letra de
 *  respaldo. */
export const WEB_FONTS = FONTS.filter(f => (f as { web?: boolean }).web);
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
    /** Un nodo DECORATIVO que sólo tiene sentido si otra variable tiene valor
     *  (la placa blanca que da contraste al logotipo). Ver `applyPublicValues`. */
    requiresVar?: string | null;
    /** El nodo desaparece si su PROPIA variable viene vacía. */
    dropIfEmpty?: boolean;
    /** La CONFIGURACIÓN del campo vinculado que este nodo expone al formulario
     *  público: etiqueta, ayuda, obligatorio, visible, valor por defecto y —si
     *  es imagen— cómo se adapta lo que suban.
     *
     *  La CLAVE no está acá: es `srcVar` (imagen) o el marcador de `srcText`
     *  (texto), y se deriva con `fieldKeyOf`. Guardarla dos veces se contradice
     *  en cuanto alguien edita el texto del nodo. */
    field?: LinkedField | null;
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
    /** Forma con la que se RECORTA la fotografía (`MASK_SHAPES`). Manda sobre
     *  `circle` y `radius`: son tres formas de decir lo mismo y hace falta un
     *  orden, o el resultado dependería de en qué rama caiga cada renderizador. */
    mask?: string | null;
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
/** Las formas con las que se puede RECORTAR una fotografía. Es un catálogo
 *  CERRADO y no la lista entera de `shapePath`: un recorte con `rect` es lo que
 *  ya hace `radius`, y una forma inventada dejaría la foto sin dibujar sin
 *  decir por qué. Al agregar una máscara, agregarla acá y a `shapePath`.
 *  Espejo de `designSpec.js` — lo comprueba `test:design`. */
export const MASK_SHAPES = ['sweep', 'sweepLeft', 'dome', 'arc', 'wave', 'ribbon', 'ellipse'];

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
        // ── Las formas de las piezas de referencia del Distrito ────────
        //
        // No son adorno: son el rasgo que hace reconocible la papelería de una
        // campaña. La fotografía no entra en un rectángulo sino en un lienzo
        // recortado por una curva ancha, y el pie no es una banda recta sino
        // un arco. Las dos se declaran acá —en el ÚNICO sitio donde vive la
        // geometría— y las leen por igual el DOM y el canvas.
        case 'sweep':
            // Barrido: el borde inferior baja hacia la DERECHA. Es la máscara
            // de la fotografía cuando el texto entra por la izquierda.
            return `M 0 0 L ${w} 0 L ${w} ${h} C ${w * 0.62} ${h * 1.02}, ${w * 0.3} ${h * 0.72}, 0 ${h * 0.55} Z`;
        case 'sweepLeft':
            // El mismo barrido, espejado. Hace falta como forma propia porque
            // no hay reflejo: rotar 180° voltearía también la fotografía.
            return `M 0 0 L ${w} 0 L ${w} ${h * 0.55} C ${w * 0.7} ${h * 0.72}, ${w * 0.38} ${h * 1.02}, 0 ${h} Z`;
        case 'dome':
            // Arco: la banda del pie, con el borde superior curvo. A
            // diferencia de `wave`, no se sale del recuadro por arriba —lo que
            // permite apoyarla contra el borde del lienzo sin dejar un hueco—.
            return `M 0 ${h} L 0 ${h * 0.45} C ${w * 0.3} ${h * 0.02}, ${w * 0.7} ${h * 0.02}, ${w} ${h * 0.45} L ${w} ${h} Z`;
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

export const variablesUsedIn = (text?: string | null): string[] => {
    const found = new Set<string>();
    for (const m of String(text ?? '').matchAll(VAR_RE)) found.add(m[1]);
    return [...found];
};

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

// ─── Lo mismo, pero para el PORTAL PÚBLICO ─────────────────────────────
//
// `applyVariables` nunca quita un nodo, y eso es correcto en el editor: un
// hueco vacío es donde el administrador va a poner algo, y verlo es la única
// forma de seleccionarlo. En el portal público es exactamente al revés — quien
// entra no puede seleccionar nada, así que un nodo sin valor no es un hueco
// editable: es un defecto impreso en la pieza que se va a descargar.
//
// Concretamente: sin logotipo, la plantilla de aniversario dejaba la PLACA
// BLANCA que existe sólo para darle contraste, flotando vacía sobre la
// fotografía. Es el mismo `requiresVar` que ya resolvía eso en el servidor
// (`compileTemplate` y `applyPublicValues`), traído acá porque la vista previa
// del portal se arma en el navegador y no pasa por ninguno de los dos.
//
// Espejo de `applyPublicValues` en `server/lib/designPublish.js`. Si cambia
// uno, cambiar el otro.
// `fillable` son las claves que el formulario OFRECE. Sin ella —el camino de
// siempre— se re-resuelve todo, y ahí está el defecto que dejaba la pieza en
// blanco: un nodo cuyo marcador no lo ofrece el formulario ni quedó congelado
// al publicar se resolvía contra un diccionario vacío, así que su texto
// desaparecía y nadie podía escribirlo. La pieza salía con el pie institucional
// y hueco todo lo demás.
//
// La regla es corta: **no se borra lo que nadie puede llenar**. Un marcador que
// el formulario no ofrece deja el nodo tal como se publicó.
export const applyPublicValues = (
    nodes: DesignNode[],
    vars: Record<string, string>,
    fillable?: string[],
): DesignNode[] => {
    const tiene = (key?: string | null) => {
        if (!key) return false;
        const v = vars[key];
        return v !== undefined && v !== null && String(v).trim() !== '';
    };
    const puedeLlenarse = fillable ? new Set(fillable) : null;
    const resoluble = (key: string) => !puedeLlenarse || puedeLlenarse.has(key) || vars[key] !== undefined;

    const out: DesignNode[] = [];
    for (const n of nodes) {
        if (n.requiresVar && !tiene(n.requiresVar) && resoluble(n.requiresVar)) continue;
        if (isText(n) && n.srcText) {
            if (!variablesUsedIn(n.srcText).every(resoluble)) { out.push(n); continue; }
            const text = resolveVariables(n.srcText, vars);
            if (n.dropIfEmpty && !text) continue;
            out.push(text === n.text ? n : { ...n, text });
            continue;
        }
        if (isImage(n) && n.srcVar) {
            if (!resoluble(n.srcVar)) { out.push(n); continue; }
            const src = vars[n.srcVar] || null;
            if (!src && n.dropIfEmpty) continue;
            out.push(src === n.src ? n : { ...n, src });
            continue;
        }
        out.push(n);
    }
    return out;
};

// ─── Qué nodos se DIBUJAN ──────────────────────────────────────────────
//
// El documento conserva los huecos vacíos —hace falta para que el formulario
// público pueda derivar sus campos—, así que la decisión de pintarlos se toma
// acá. Y en UN solo sitio: la vista previa del editor, la exportación y el
// portal público llaman a esta función, que es lo que sostiene que lo que se ve
// sea el archivo. Espejo de `visibleNodes` en `server/lib/designSpec.js`.
const nodeHasContent = (n: DesignNode): boolean =>
    isImage(n) ? !!n.src : isText(n) ? String(n.text || '').trim() !== '' : true;

// `slots: true` es el modo EDITOR: un hueco vacío se sigue viendo, porque es
// donde el administrador va a poner algo y sin verlo no lo puede seleccionar.
// Lo que se cae igual es el nodo DECORATIVO que dependía de él —la placa blanca
// sola no se puede llenar con nada, sólo estorba—.
// `fusedId` es el nodo que la Composición con IA va a FUNDIR con la imagen de
// base. No se dibuja ni siquiera en modo editor: esa fotografía no ocupa un
// recuadro, la integra el modelo dentro del lienzo, así que pintar su hueco
// enseña algo que no va a pasar. Quién es ese nodo lo decide `fusedPhotoId`, en
// `designCompose.ts`.
// ── QUÉ NODO RESPONDE POR UNA VARIABLE ─────────────────────────────────
//
// Espejo de `designSpec.js`. Hasta v4.836 sólo respondían las IMÁGENES, así que
// la pastilla del botón de las Infografías de Campaña —`requiresVar: 'cta'`, una
// variable de TEXTO— se caía siempre y el llamado a la acción salió como texto
// suelto en toda pieza generada. Un nodo de texto responde por su variable sólo
// si ES la variable entera: con texto mezclado no se puede saber, y darla por
// satisfecha sería el error contrario y peor.
const PURE_VAR = /^\{\{\s*([a-zA-Z0-9_]+)\s*\}\}$/;
const answersFor = (n: DesignNode): string | null => {
    if (isImage(n)) return n.srcVar || null;
    if (!isText(n) || !n.srcText) return null;
    const m = String(n.srcText).trim().match(PURE_VAR);
    return m ? m[1] : null;
};

export const visibleNodes = (nodes: DesignNode[], { slots = false, fusedId = null as string | null } = {}): DesignNode[] => {
    const satisfied = new Map<string, boolean>();
    for (const n of nodes) {
        const key = answersFor(n);
        if (!key) continue;
        satisfied.set(key, (satisfied.get(key) || false) || nodeHasContent(n));
    }
    return nodes.filter(n => {
        if (n.hidden) return false;
        if (fusedId && n.id === fusedId) return false;
        if (n.requiresVar && !satisfied.get(n.requiresVar)) return false;
        if (n.dropIfEmpty && !nodeHasContent(n) && !slots) return false;
        return true;
    });
};

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

// ─── La fundación del club y los años que cumple ───────────────────────
//
// ESPEJO de `parseFoundation` / `yearsSince` del servidor
// (`server/lib/designSpec.js`), duplicado a propósito como el resto del
// criterio compartido: el portal público calcula los años EN VIVO mientras la
// persona escribe la fundación, y una petición por pulsación para restar dos
// números sería absurda. Si cambia uno, cambiar el otro — lo comprueba
// `test:design` comparando las salidas.
export const parseFoundation = (value: unknown): { iso: string | null; year: number | null } => {
    const s = String(value || '').trim();
    if (!s) return { iso: null, year: null };
    if (/^\d{4}$/.test(s)) return { iso: null, year: +s };
    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return { iso: `${iso[1]}-${iso[2]}-${iso[3]}`, year: +iso[1] };
    const dmy = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (dmy) return { iso: `${dmy[3]}-${String(dmy[2]).padStart(2, '0')}-${String(dmy[1]).padStart(2, '0')}`, year: +dmy[3] };
    const loose = s.match(/\b(1[89]\d{2}|20\d{2})\b/);
    return loose ? { iso: null, year: +loose[1] } : { iso: null, year: null };
};

export const yearsSince = (year: number | string, today: Date = new Date()): number | null => {
    const y = today.getUTCFullYear() - Number(year);
    return y >= 0 && y < 200 ? y : null;
};
