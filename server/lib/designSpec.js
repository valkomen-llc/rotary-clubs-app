// ════════════════════════════════════════════════════════════════════
// Plantillas IA — el CRITERIO del motor de diseño
// v4.723.0
//
// Este archivo es PURO: sin base, sin red, sin IA, sin DOM. Define qué es una
// plantilla, qué es un nodo, cómo se resuelven las variables y cómo se reparte
// el texto en líneas. Todo lo demás del módulo orquesta lo que aquí se decide.
//
// Está separado por el mismo motivo que `seoRules.js` vive aparte de
// `seoAudit.js` y que `reelSpec.js` vive aparte de `reelController.js`: un
// motor que sólo se puede ejercitar contra una base real termina sin pruebas,
// y entonces nadie se entera de que una regla cambió de signo.
//
// ── LA DECISIÓN DE FONDO: UN SOLO GRAFO DE ESCENA ───────────────────
//
// El Generador de Pendones escribe su maquetación DOS VECES: una en
// `BannerPreview.tsx` (DOM, con unidades cqw/cqh) y otra en `bannerRender.ts`
// (canvas). Funciona porque el pendón tiene tres elementos fijos. Con un editor
// donde el usuario agrega, mueve y rota capas arbitrarias, esa duplicación se
// vuelve imposible de sostener: cada tipo de nodo nuevo habría que escribirlo
// dos veces y cualquier discrepancia se ve como "la vista previa no es lo que
// descargué".
//
// Acá la plantilla COMPILA a una lista plana de nodos en coordenadas
// NORMALIZADAS (0-1 del lienzo). El editor y el exportador leen la MISMA lista.
// Consecuencias que importan:
//
//   · Cambiar de formato (1:1 → 9:16) no recalcula la plantilla: los nodos ya
//     están en fracciones.
//   · Agregar una plantilla es agregar datos, no código.
//   · El WYSIWYG deja de ser una coincidencia y pasa a ser estructural.
//
// ── EL REPARTO EN LÍNEAS SE COMPARTE, NO SE PARECE ──────────────────
//
// `layoutText` recibe la función de medir como PARÁMETRO. En el navegador se
// le pasa un contexto 2D; en las pruebas, un medidor falso. Es lo que permite
// que la vista previa (DOM) y la exportación (canvas) partan el texto en los
// MISMOS puntos: la vista previa no deja que el navegador reparta las líneas,
// las pide acá y pinta una por una. Si el navegador repartiera por su cuenta,
// un título de dos líneas en pantalla podría salir de tres en el archivo.
// ════════════════════════════════════════════════════════════════════

// La configuración de los CAMPOS VINCULADOS vive aparte, en `designFields.js`,
// y la importación va en un solo sentido: de acá hacia allá nunca, o los dos
// archivos que sostienen el criterio quedarían en un ciclo.
import { normalizeField, fieldKeyOf } from './designFields.js';

// ─── Formatos ──────────────────────────────────────────────────────────
//
// Registry con metadata `{ available }`, mismo patrón que `ENGINES` en
// `contentStudioController.js`: lo que todavía no se puede generar se DECLARA
// y la UI lo muestra como "Próximamente", en vez de esconderlo y que nadie
// sepa hacia dónde va el módulo.
export const FORMATS = {
    post_1_1: {
        id: 'post_1_1', label: 'Post cuadrado', ratio: '1:1',
        width: 1080, height: 1080, available: true,
        networks: ['Instagram', 'Facebook', 'LinkedIn', 'WhatsApp', 'X'],
    },
    post_4_5: { id: 'post_4_5', label: 'Post vertical', ratio: '4:5', width: 1080, height: 1350, available: false, networks: ['Instagram', 'Facebook'] },
    story_9_16: { id: 'story_9_16', label: 'Historia', ratio: '9:16', width: 1080, height: 1920, available: false, networks: ['Instagram', 'Facebook', 'WhatsApp'] },
    post_16_9: { id: 'post_16_9', label: 'Apaisado', ratio: '16:9', width: 1920, height: 1080, available: false, networks: ['LinkedIn', 'X', 'YouTube'] },
};

export const DEFAULT_FORMAT = 'post_1_1';

export const formatOf = (id) => FORMATS[id] || FORMATS[DEFAULT_FORMAT];
export const availableFormats = () => Object.values(FORMATS).filter(f => f.available);

// ─── Paleta institucional ──────────────────────────────────────────────
//
// Los dos primeros son los colores oficiales de Rotary International; el resto
// son los tonos de apoyo que ya usa la papelería del Distrito 4281 (el azul
// profundo del pie y el degradado dorado de la curva).
export const PALETTE = {
    royal: '#17458F',   // Rotary Royal Blue (oficial)
    gold: '#F7A81B',    // Rotary Gold (oficial)
    azure: '#0067C8',
    navy: '#0B2B5C',
    sky: '#00A2E0',
    cloud: '#EEF1F6',
    white: '#FFFFFF',
    slate: '#6B7DA0',
    ink: '#0F1E3D',
};

// Degradado dorado de la curva: el mismo que se ve en la tarjeta tradicional.
export const GOLD_GRADIENT = ['#B07E1F', '#F2CE6B', '#C9962F', '#F7E4A8', '#B8842A'];

export const FONTS = [
    { id: 'sans', label: 'Institucional (Arial)', stack: 'Arial, Helvetica, sans-serif' },
    { id: 'serif', label: 'Serif', stack: 'Georgia, "Times New Roman", serif' },
    { id: 'mono', label: 'Monoespaciada', stack: '"Courier New", monospace' },
];
export const fontStack = (id) => (FONTS.find(f => f.id === id) || FONTS[0]).stack;

// ─── Categorías de plantilla ───────────────────────────────────────────
//
// El catálogo completo que pidió el cliente. Una categoría sin plantillas
// todavía se muestra vacía a propósito: es el mapa de hacia dónde crece el
// módulo, y esconderla haría parecer que el sistema es sólo el aniversario.
export const TEMPLATE_CATEGORIES = [
    { id: 'aniversario', label: 'Aniversario', icon: 'PartyPopper' },
    { id: 'presidente', label: 'Nuevo Presidente', icon: 'Award' },
    { id: 'socio', label: 'Nuevo Socio', icon: 'UserPlus' },
    { id: 'reconocimiento', label: 'Reconocimiento', icon: 'Medal' },
    { id: 'proyecto', label: 'Proyecto', icon: 'HeartHandshake' },
    { id: 'donacion', label: 'Donación', icon: 'Gift' },
    { id: 'evento', label: 'Evento', icon: 'CalendarDays' },
    { id: 'conferencia', label: 'Conferencia', icon: 'Mic' },
    { id: 'invitacion', label: 'Invitación', icon: 'MailOpen' },
    { id: 'premiacion', label: 'Premiación', icon: 'Trophy' },
    { id: 'cumpleanos', label: 'Cumpleaños', icon: 'Cake' },
    { id: 'obituario', label: 'Obituario', icon: 'Flower2' },
    { id: 'bienvenida', label: 'Bienvenida', icon: 'DoorOpen' },
    { id: 'efemerides', label: 'Efemérides', icon: 'BookMarked' },
    { id: 'campana', label: 'Campañas', icon: 'Megaphone' },
    { id: 'dia_mundial', label: 'Día Mundial', icon: 'Globe2' },
];

// ─── Variables dinámicas ───────────────────────────────────────────────
//
// Catálogo CERRADO, por el mismo motivo que el de intenciones del CRM: una
// variable inventada no la resuelve nadie y termina impresa como `{{loQueSea}}`
// en una pieza institucional.
export const VARIABLES = {
    club: { label: 'Nombre del club', example: 'Club Rotario Cali San Fernando' },
    ciudad: { label: 'Ciudad', example: 'Cali' },
    distrito: { label: 'Distrito', example: '4281' },
    presidente: { label: 'Presidente del club', example: 'María Fernanda Ríos' },
    gobernador: { label: 'Gobernador del distrito', example: 'Fabio Enrique Véjar Montañez' },
    periodo: { label: 'Periodo rotario', example: '2026-2027' },
    anios: { label: 'Años que cumple', example: '49' },
    fecha: { label: 'Fecha', example: '4 de agosto de 2026' },
    mensaje: { label: 'Mensaje', example: 'Celebramos su compromiso con el servicio…' },
    titulo: { label: 'Título', example: '¡Felices 49 años!' },
    logo: { label: 'Logotipo', example: '(imagen)', kind: 'image' },
    imagen: { label: 'Fotografía del club', example: '(imagen)', kind: 'image' },
};

export const VARIABLE_IDS = Object.keys(VARIABLES);
const VAR_RE = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;

// Devuelve el texto con las variables sustituidas y la lista de las que no se
// pudieron resolver. NO deja el `{{marcador}}` a la vista: una variable sin
// resolver impresa en un pendón o en un post es peor que el hueco. Misma regla
// que `journeyEngine.js` con los parámetros de una plantilla de WhatsApp.
export const resolveVariables = (text, vars = {}) => {
    const missing = [];
    const out = String(text ?? '').replace(VAR_RE, (_m, name) => {
        const v = vars[name];
        if (v === undefined || v === null || String(v).trim() === '') { missing.push(name); return ''; }
        return String(v);
    });
    return { text: out.replace(/[ \t]{2,}/g, ' ').trim(), missing };
};

export const variablesUsedIn = (text) => {
    const found = new Set();
    for (const m of String(text ?? '').matchAll(VAR_RE)) found.add(m[1]);
    return [...found];
};

// ─── Nodos ─────────────────────────────────────────────────────────────
//
// Un nodo es una capa. `x/y/w/h` son fracciones del lienzo (0-1) y `fontSize`
// es fracción del ANCHO — mismo criterio que los `sizes` del pendón, para que
// el texto escale con la pieza y no con su alto.
export const NODE_TYPES = ['text', 'image', 'shape', 'icon'];

export const NODE_DEFAULTS = {
    x: 0.1, y: 0.1, w: 0.8, h: 0.1,
    rotation: 0, opacity: 1, locked: false, hidden: false,
};

export const TEXT_DEFAULTS = {
    fontSize: 0.045, fontFamily: 'sans', fontWeight: 700,
    color: PALETTE.royal, align: 'center', valign: 'top',
    lineHeight: 1.2, letterSpacing: 0, italic: false, uppercase: false,
    autoFit: true, minFontSize: 0.018,
};

export const IMAGE_DEFAULTS = { fit: 'cover', radius: 0, src: null };
export const SHAPE_DEFAULTS = { shape: 'rect', fill: PALETTE.royal, radius: 0, stroke: null, strokeWidth: 0 };

const clamp01 = (n, fb = 0) => {
    const v = Number(n);
    if (!Number.isFinite(v)) return fb;
    return Math.min(1.5, Math.max(-0.5, v));
};

// Normaliza un nodo suelto. Es la puerta por la que entra TODO lo que llega del
// navegador: el editor manda documentos completos y un nodo con `w: "mucho"`
// no puede llegar al renderizador.
export const normalizeNode = (raw, index = 0) => {
    const type = NODE_TYPES.includes(raw?.type) ? raw.type : 'text';
    const base = {
        id: String(raw?.id || `n${index}_${type}`),
        type,
        name: raw?.name ? String(raw.name).slice(0, 80) : null,
        x: clamp01(raw?.x, NODE_DEFAULTS.x),
        y: clamp01(raw?.y, NODE_DEFAULTS.y),
        w: Math.max(0.01, clamp01(raw?.w, NODE_DEFAULTS.w)),
        h: Math.max(0.005, clamp01(raw?.h, NODE_DEFAULTS.h)),
        rotation: Number.isFinite(+raw?.rotation) ? ((+raw.rotation % 360) + 360) % 360 : 0,
        opacity: Math.min(1, Math.max(0, Number.isFinite(+raw?.opacity) ? +raw.opacity : 1)),
        locked: !!raw?.locked,
        hidden: !!raw?.hidden,
        // Marca de plantilla: un nodo estructural (la curva, el pie) no se
        // borra por accidente pero SÍ se puede desbloquear a mano.
        role: raw?.role ? String(raw.role).slice(0, 40) : null,
        dropIfEmpty: !!raw?.dropIfEmpty,
        // Un nodo DECORATIVO puede depender de una variable que él no usa: la
        // placa blanca que da contraste al logotipo sobre una fotografía no
        // tiene sentido sin el logotipo. Sin esto se dibujaba igual, y salía un
        // rectángulo blanco vacío flotando sobre la foto — detectado en la
        // primera prueba de render, no en el código.
        requiresVar: raw?.requiresVar ? String(raw.requiresVar).slice(0, 40) : null,
        // ── CAMPO VINCULADO ─────────────────────────────────────────
        //
        // La CONFIGURACIÓN del campo que este nodo expone al formulario
        // público: etiqueta, ayuda, obligatorio, visible, valor por defecto y
        // —si es una imagen— cómo se adapta lo que suban. La CLAVE no está acá:
        // sigue siendo `srcVar` (imagen) o el marcador de `srcText` (texto), y
        // se deriva con `fieldKeyOf`. Guardarla dos veces se contradice en
        // cuanto alguien edita el texto del nodo.
        //
        // Sin esta línea la declaración no sobrevivía a guardar ni a publicar:
        // este normalizador RECONSTRUYE el nodo, así que todo lo que no se
        // enumere acá se pierde en silencio.
        // El `text` de una plantilla del catálogo lleva el marcador y todavía no
        // hay `srcText` —lo escribe `compileTemplate` después—, así que sirve de
        // respaldo para deducir la clase por defecto del campo.
        field: normalizeField(raw?.field, {
            key: fieldKeyOf({
                type,
                // En una plantilla del catálogo la clave todavía vive dentro de
                // `src`/`text` —`srcVar` y `srcText` los escribe `compileTemplate`
                // después—, así que se miran los dos sitios.
                srcVar: raw?.srcVar || (typeof raw?.src === 'string' ? variablesUsedIn(raw.src)[0] : null),
                srcText: raw?.srcText || raw?.text,
            }),
            nodeType: type,
        }),
    };
    if (type === 'text') {
        return {
            ...base,
            text: String(raw?.text ?? ''),
            // El texto ANTES de resolver las variables. Es lo que permite que
            // cambiar «los años que cumple» repinte el título en el acto, sin
            // volver al servidor y sin recompilar la plantilla —lo que se
            // llevaría por delante todo lo que el usuario haya movido—.
            // Editar el texto a mano lo pone en null: a partir de ahí ese nodo
            // deja de seguir a la variable, que es lo que el usuario acaba de
            // pedir al escribirlo él.
            srcText: raw?.srcText ? String(raw.srcText) : null,
            fontSize: Math.min(0.4, Math.max(0.005, Number.isFinite(+raw?.fontSize) ? +raw.fontSize : TEXT_DEFAULTS.fontSize)),
            fontFamily: FONTS.some(f => f.id === raw?.fontFamily) ? raw.fontFamily : TEXT_DEFAULTS.fontFamily,
            fontWeight: [300, 400, 500, 600, 700, 800, 900].includes(+raw?.fontWeight) ? +raw.fontWeight : TEXT_DEFAULTS.fontWeight,
            color: normalizeColor(raw?.color, TEXT_DEFAULTS.color),
            align: ['left', 'center', 'right'].includes(raw?.align) ? raw.align : TEXT_DEFAULTS.align,
            valign: ['top', 'middle', 'bottom'].includes(raw?.valign) ? raw.valign : TEXT_DEFAULTS.valign,
            lineHeight: Math.min(3, Math.max(0.8, Number.isFinite(+raw?.lineHeight) ? +raw.lineHeight : TEXT_DEFAULTS.lineHeight)),
            letterSpacing: Number.isFinite(+raw?.letterSpacing) ? +raw.letterSpacing : 0,
            italic: !!raw?.italic,
            uppercase: !!raw?.uppercase,
            autoFit: raw?.autoFit !== false,
            minFontSize: Math.max(0.004, Number.isFinite(+raw?.minFontSize) ? +raw.minFontSize : TEXT_DEFAULTS.minFontSize),
        };
    }
    if (type === 'image') {
        return {
            ...base,
            src: raw?.src ? String(raw.src) : null,
            // La variable de la que sale la imagen (`imagen`, `logo`), para que
            // cambiar la fotografía desde el panel repinte el nodo sin
            // recompilar. Mismo motivo que `srcText`.
            srcVar: raw?.srcVar ? String(raw.srcVar) : null,
            fit: ['cover', 'contain'].includes(raw?.fit) ? raw.fit : IMAGE_DEFAULTS.fit,
            radius: Math.min(0.5, Math.max(0, Number.isFinite(+raw?.radius) ? +raw.radius : 0)),
            circle: !!raw?.circle,
        };
    }
    // shape | icon
    return {
        ...base,
        shape: String(raw?.shape || SHAPE_DEFAULTS.shape),
        fill: raw?.fill && typeof raw.fill === 'object' ? normalizeGradient(raw.fill) : normalizeColor(raw?.fill, SHAPE_DEFAULTS.fill),
        radius: Math.min(0.5, Math.max(0, Number.isFinite(+raw?.radius) ? +raw.radius : 0)),
        stroke: raw?.stroke ? normalizeColor(raw.stroke, null) : null,
        strokeWidth: Math.max(0, Number.isFinite(+raw?.strokeWidth) ? +raw.strokeWidth : 0),
        path: raw?.path ? String(raw.path).slice(0, 4000) : null,
    };
};

// Sólo se aceptan colores que se puedan escribir en un atributo sin escapar.
// Es la misma cautela que `escapeAttr` en `seoRender.js`: esto termina dentro
// de un `style` del DOM y de un `fillStyle` del canvas.
const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const RGBA_RE = /^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*(0|1|0?\.\d+)\s*)?\)$/;
export const normalizeColor = (c, fallback = PALETTE.royal) => {
    const s = typeof c === 'string' ? c.trim() : '';
    if (HEX_RE.test(s) || RGBA_RE.test(s) || s === 'transparent') return s;
    return fallback;
};

export const normalizeGradient = (g) => {
    const stops = Array.isArray(g?.stops) ? g.stops.slice(0, 12).map((s, i, a) => ({
        at: Math.min(1, Math.max(0, Number.isFinite(+s?.at) ? +s.at : i / Math.max(1, a.length - 1))),
        color: normalizeColor(s?.color, PALETTE.gold),
    })) : [];
    if (stops.length < 2) return PALETTE.gold;
    return { type: g?.type === 'radial' ? 'radial' : 'linear', angle: Number.isFinite(+g?.angle) ? +g.angle : 0, stops };
};

// ─── Documento ─────────────────────────────────────────────────────────
//
// Lo que el editor guarda y lo que el exportador lee. El orden del array ES el
// orden de las capas (índice 0 = al fondo); no hay campo `z` porque dos
// verdades sobre el orden se contradicen en cuanto alguien reordena.
export const MAX_NODES = 120;

export const normalizeDocument = (raw) => {
    const format = formatOf(raw?.format);
    const nodes = (Array.isArray(raw?.nodes) ? raw.nodes : []).slice(0, MAX_NODES).map(normalizeNode);
    return {
        format: format.id,
        background: normalizeColor(raw?.background, PALETTE.white),
        nodes,
    };
};

// ─── Compilación de una plantilla ──────────────────────────────────────
//
// PLANTILLA + VARIABLES → DOCUMENTO. Es la frontera entre el catálogo (datos) y
// el editor (estado mutable): a partir de acá nadie vuelve a mirar la plantilla,
// y por eso editar una pieza generada no puede romperse cuando la plantilla
// cambie.
//
// Un nodo con `dropIfEmpty` cuya variable no se resolvió NO se dibuja. Es lo que
// permite que la misma plantilla sirva con y sin fotografía del club: sin foto,
// el marco de la foto simplemente no existe, en vez de dejar un rectángulo gris.
//
// ── `keepSlots`: NO BORRAR EL HUECO QUE ALGUIEN VA A LLENAR DESPUÉS ──
//
// Borrar el nodo es correcto cuando lo que se compila es la pieza FINAL. En el
// editor no: ahí el documento se va a publicar, y el formulario público se
// deriva de las variables que los nodos usan (`variablesOf`). Un hueco borrado
// no tiene variable, así que no genera campo — y entonces nadie puede llenarlo
// nunca. Fue exactamente lo que dejó el portal de aniversarios sin el campo del
// logotipo: el club con el que se diseñó no tenía escudo cargado, el nodo se
// borró al compilar y la plantilla se publicó sin esa mitad del formulario.
//
// Con `keepSlots` el hueco sobrevive con `src: null` y la decisión de dibujarlo
// se toma al PINTAR, donde ya se sabe si tiene contenido (`visibleNodes`).
export const compileTemplate = ({ template, variables = {}, branding = {}, keepSlots = false } = {}) => {
    if (!template) throw new Error('compileTemplate: falta la plantilla');
    const vars = { ...defaultVariables(branding), ...variables };
    const missing = new Set();
    const nodes = [];

    for (const [i, raw] of (template.nodes || []).entries()) {
        const node = normalizeNode(applyBranding(raw, branding), i);
        // Dependencia declarada: se resuelve ANTES que nada, porque afecta a
        // nodos de cualquier tipo, incluidos los que no llevan variables.
        if (node.requiresVar) {
            const v = vars[node.requiresVar];
            if (v === undefined || v === null || String(v).trim() === '') { missing.add(node.requiresVar); if (!keepSlots) continue; }
        }
        if (node.type === 'text') {
            const r = resolveVariables(node.text, vars);
            r.missing.forEach(m => missing.add(m));
            if (node.dropIfEmpty && (r.missing.length > 0 || !r.text) && !keepSlots) continue;
            // Se guarda el texto de plantilla ANTES de sustituir: es lo que
            // deja al editor volver a resolverlo sin pedir nada al servidor.
            if (variablesUsedIn(node.text).length) node.srcText = node.text;
            node.text = r.text;
        } else if (node.type === 'image') {
            const key = typeof node.src === 'string' ? variablesUsedIn(node.src)[0] : null;
            if (key) {
                node.srcVar = key;
                const v = vars[key];
                if (!v) { missing.add(key); if (node.dropIfEmpty && !keepSlots) continue; node.src = null; }
                else node.src = String(v);
            }
        }
        nodes.push(node);
    }

    return {
        templateId: template.id,
        format: template.format || DEFAULT_FORMAT,
        background: normalizeColor(template.background, PALETTE.white),
        nodes,
        missing: [...missing],
    };
};

// ─── Qué nodos se DIBUJAN ──────────────────────────────────────────────
//
// Con `keepSlots` el documento conserva los huecos vacíos, así que la decisión
// de pintarlos pasa acá. Y tiene que estar en UN solo sitio: la vista previa del
// editor, la exportación y el portal público leen la misma lista, y ésa es toda
// la promesa del módulo —lo que se ve es el archivo—. Si cada uno decidiera por
// su cuenta, un hueco visible en pantalla saldría o no saldría en el PNG según
// quién lo dibujara.
//
// La regla es la del catálogo, evaluada sobre el estado real del documento:
//
//   · `dropIfEmpty` — el nodo desaparece si su propio contenido está vacío.
//   · `requiresVar` — un nodo DECORATIVO desaparece si el nodo atado a esa
//     variable no existe o está vacío. Es la placa blanca que sólo tiene
//     sentido detrás del logotipo: sola es un rectángulo flotando.
const nodeHasContent = (node) => node.type === 'image'
    ? !!node.src
    : node.type === 'text' ? String(node.text || '').trim() !== '' : true;

// `slots: true` es el modo EDITOR: un hueco vacío se sigue viendo, porque es
// donde el administrador va a poner algo y sin verlo no lo puede seleccionar.
// Lo que se cae igual es el nodo DECORATIVO que dependía de él —la placa blanca
// sola no se puede llenar con nada, sólo estorba—.
export const visibleNodes = (nodes = [], { slots = false } = {}) => {
    const satisfied = new Map();
    for (const n of nodes) {
        const key = n.type === 'image' ? n.srcVar : null;
        if (!key) continue;
        satisfied.set(key, (satisfied.get(key) || false) || nodeHasContent(n));
    }

    return nodes.filter(n => {
        if (n.hidden) return false;
        if (n.requiresVar && !satisfied.get(n.requiresVar)) return false;
        if (n.dropIfEmpty && !nodeHasContent(n) && !slots) return false;
        return true;
    });
};

// Los colores de marca del club sustituyen los de la plantilla SÓLO donde la
// plantilla lo declara (`brand: 'primary' | 'accent'`). Sin esa marca, el color
// escrito en la plantilla manda: una curva dorada que se volviera del color
// corporativo de cada club dejaría de ser la papelería del Distrito.
const applyBranding = (raw, branding) => {
    if (!raw?.brand) return raw;
    const map = { primary: branding.primary || PALETTE.royal, accent: branding.accent || PALETTE.gold, ink: branding.ink || PALETTE.ink };
    const color = map[raw.brand];
    if (!color) return raw;
    return raw.type === 'text' ? { ...raw, color } : { ...raw, fill: color };
};

export const defaultVariables = (branding = {}) => ({
    club: branding.clubName || '',
    ciudad: branding.city || '',
    distrito: branding.district || '',
    presidente: branding.president || '',
    gobernador: branding.governor || '',
    periodo: branding.period || '',
    logo: branding.logo || '',
    imagen: branding.photo || '',
});

// ─── Reparto del texto en líneas ───────────────────────────────────────
//
// `measure(text, fontPx, weight, family, italic)` devuelve el ancho en px. Se
// INYECTA: en el navegador es un contexto 2D y en las pruebas un medidor de
// ancho fijo por carácter. Sin esa inyección, este criterio sólo se podría
// probar con un navegador y en la práctica no se probaría.
export const wrapText = (text, maxWidth, measure) => {
    const out = [];
    for (const paragraph of String(text ?? '').split('\n')) {
        const words = paragraph.split(/\s+/).filter(Boolean);
        if (!words.length) { out.push(''); continue; }
        let line = words[0];
        for (let i = 1; i < words.length; i++) {
            const test = `${line} ${words[i]}`;
            if (measure(test) > maxWidth && line) { out.push(line); line = words[i]; }
            else line = test;
        }
        out.push(line);
    }
    return out;
};

// Ajusta el cuerpo al recuadro: baja el tamaño hasta que las líneas caben en el
// alto disponible. Es imprescindible en un sistema de plantillas — el nombre de
// un club va de "Cali" a "Cali San Fernando del Valle": con tamaño fijo, uno se
// ve enano y el otro se desborda fuera de la pieza.
//
// Devuelve SIEMPRE algo dibujable: si ni con el mínimo entra, entrega las
// líneas al mínimo y avisa con `overflow`. Recortar el texto por lo bajo sería
// perder contenido sin decirlo.
export const layoutText = ({ text, boxW, boxH, fontSize, lineHeight = 1.2, minFontSize = 0, autoFit = true, measure }) => {
    if (typeof measure !== 'function') throw new Error('layoutText: falta `measure`');
    const floor = autoFit ? Math.min(fontSize, Math.max(1, minFontSize)) : fontSize;
    let size = fontSize;
    let lines = wrapText(text, boxW, t => measure(t, size));

    // Búsqueda a la baja en pasos del 6 %: converge en ~25 vueltas desde
    // cualquier tamaño razonable y evita el ping-pong de una bisección con
    // saltos de línea, que no es monótona.
    let guard = 60;
    while (autoFit && size > floor && guard-- > 0) {
        const tooTall = lines.length * size * lineHeight > boxH;
        const tooWide = lines.some(l => measure(l, size) > boxW + 0.5);
        if (!tooTall && !tooWide) break;
        size = Math.max(floor, size * 0.94);
        lines = wrapText(text, boxW, t => measure(t, size));
    }

    const height = lines.length * size * lineHeight;
    return { lines, fontSize: size, height, overflow: height > boxH + 0.5 };
};

// ─── Geometría compartida por el DOM y el canvas ───────────────────────
//
// La curva dorada del Distrito y el resto de las formas se generan como un
// atributo `d` de SVG. El mismo string lo pinta el navegador en un `<path>` y
// el exportador en un `Path2D`. Es lo que hace que la vista previa y el archivo
// descargado no puedan diferir: no hay dos dibujos, hay uno.
export const shapePath = (shape, w, h, opts = {}) => {
    const r = Math.max(0, Math.min(opts.radius ?? 0, Math.min(w, h) / 2));
    switch (shape) {
        case 'ellipse': {
            const rx = w / 2, ry = h / 2;
            return `M 0 ${ry} A ${rx} ${ry} 0 1 0 ${w} ${ry} A ${rx} ${ry} 0 1 0 0 ${ry} Z`;
        }
        case 'wave':
            // Banda ondulada: sube por la izquierda y baja a la derecha. Es la
            // silueta de la papelería del Distrito.
            return `M 0 ${h} L 0 ${h * 0.42} C ${w * 0.28} ${h * -0.06}, ${w * 0.66} ${h * 0.34}, ${w} ${h * 0.14} L ${w} ${h} Z`;
        case 'arc':
            // Arco superior (la curva que corona la tarjeta tradicional).
            return `M 0 0 L ${w} 0 L ${w} ${h * 0.52} C ${w * 0.68} ${h * 0.94}, ${w * 0.3} ${h * 0.16}, 0 ${h * 0.72} Z`;
        case 'ribbon':
            return `M 0 ${h * 0.5} C ${w * 0.25} ${h * 0.08}, ${w * 0.75} ${h * 0.92}, ${w} ${h * 0.5} L ${w} ${h} L 0 ${h} Z`;
        case 'rect':
        default:
            if (!r) return `M 0 0 L ${w} 0 L ${w} ${h} L 0 ${h} Z`;
            return `M ${r} 0 L ${w - r} 0 Q ${w} 0 ${w} ${r} L ${w} ${h - r} Q ${w} ${h} ${w - r} ${h} L ${r} ${h} Q 0 ${h} 0 ${h - r} L 0 ${r} Q 0 0 ${r} 0 Z`;
    }
};

// ─── Guías, márgenes y área segura ─────────────────────────────────────
//
// El área segura no es decorativa: en una historia de Instagram la interfaz
// tapa los bordes, y en una impresión se recorta. Se dibuja en el editor y NO
// se exporta, igual que las guías del pendón.
export const SAFE_AREA = 0.06;   // fracción del lado
export const MARGIN = 0.075;
export const SNAP_PX = 7;

// ─── Fechas rotarias ───────────────────────────────────────────────────
//
// Viven acá, con el resto del criterio, y NO en `designBranding.js`, que es
// quien las usa: ese archivo importa la base de datos, así que probar «¿cuántos
// años cumple un club fundado en 1977?» exigiría una conexión. La regla del
// sitio es separar el criterio de la orquestación justamente para que el
// criterio se pueda probar sin nada montado.

// Acepta «1974», «1974-08-04» y «04/08/1974». Un año suelto basta para calcular
// el aniversario y es lo que la mayoría de los clubes tiene a mano.
export const parseFoundation = (value) => {
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

// `today` es un PARÁMETRO, no `new Date()` por dentro: una función que consulta
// el reloj no se puede probar, y «cuántos años cumple» es exactamente el número
// que no puede salir mal en una pieza firmada por el Gobernador.
export const yearsSince = (year, today = new Date()) => {
    const y = today.getUTCFullYear() - Number(year);
    return y >= 0 && y < 200 ? y : null;
};

// El periodo rotario va del 1 de julio al 30 de junio.
export const rotaryPeriod = (today = new Date()) => {
    const y = today.getUTCFullYear();
    const start = today.getUTCMonth() >= 6 ? y : y - 1;
    return `${start}-${start + 1}`;
};

// ─── Límites ───────────────────────────────────────────────────────────
export const LIMITS = {
    message: 600,      // caracteres del mensaje generado
    title: 90,
    historySteps: 60,  // pasos de deshacer
    exportScale: 2,    // multiplicador máximo sobre el tamaño nominal
};

export default {
    FORMATS, DEFAULT_FORMAT, formatOf, availableFormats,
    PALETTE, GOLD_GRADIENT, FONTS, fontStack,
    TEMPLATE_CATEGORIES, VARIABLES, VARIABLE_IDS,
    resolveVariables, variablesUsedIn,
    NODE_TYPES, normalizeNode, normalizeColor, normalizeGradient,
    normalizeDocument, compileTemplate, defaultVariables, visibleNodes,
    wrapText, layoutText, shapePath,
    parseFoundation, yearsSince, rotaryPeriod,
    SAFE_AREA, MARGIN, SNAP_PX, LIMITS, MAX_NODES,
};
