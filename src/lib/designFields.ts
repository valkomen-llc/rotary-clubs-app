// ════════════════════════════════════════════════════════════════════
// Plantillas IA — CAMPOS VINCULADOS · espejo en el navegador
// v4.724.0
//
// Espejo de `server/lib/designFields.js`. Está duplicado a propósito, igual que
// `designSpec.ts` y que `ADMIN_ROLES`: el servidor decide qué acepta y guarda,
// el navegador decide qué pinta. **Si cambia uno, cambiar el otro** — lo
// comprueba `npm run test:design`, que carga los dos y compara las SALIDAS de
// las funciones, no sólo las constantes.
//
// Acá vive lo que el editor necesita para ofrecer la sección «Campo vinculado»:
// las clases de campo con su etiqueta, cómo se normaliza un nombre interno y
// cómo se lee la clave de un nodo. Lo que decide el servidor —qué se guarda,
// cómo se adapta una imagen— no se copia.
// ════════════════════════════════════════════════════════════════════

export interface Box { x: number; y: number; w: number; h: number }

export interface ImageRules {
    fit: 'cover' | 'contain';
    trim: boolean;
    transparent: boolean;
    crop: boolean;
    safeArea: number;
    /** El RECUADRO de referencia: dónde y de qué tamaño dejó el elemento la
     *  plantilla. No es una segunda verdad sobre el tamaño actual —ése es
     *  `x/y/w/h` del nodo—: es la constante que responde «¿el 100 % de qué?» y
     *  la que deja volver atrás. */
    frame?: Box | null;
}

export interface FieldKind {
    id: string;
    label: string;
    input: 'image' | 'text' | 'textarea' | 'number';
    help?: string;
    accept?: string;
    image?: ImageRules;
    maxChars?: number;
}

export const FIELD_KINDS: Record<string, FieldKind> = {
    logo: {
        id: 'logo', label: 'Logotipo', input: 'image',
        help: 'El escudo de tu club. Un PNG con fondo transparente queda mejor.',
        accept: 'image/png,image/svg+xml,image/jpeg,image/webp',
        image: { fit: 'contain', trim: true, transparent: true, crop: false, safeArea: 0.02 },
    },
    foto: {
        id: 'foto', label: 'Fotografía', input: 'image',
        help: 'Se adapta sola al espacio de la plantilla.',
        accept: 'image/*',
        image: { fit: 'cover', trim: false, transparent: false, crop: true, safeArea: 0 },
    },
    firma: {
        id: 'firma', label: 'Firma', input: 'image',
        help: 'Una firma escaneada sobre fondo transparente o blanco.',
        accept: 'image/png,image/jpeg,image/webp',
        image: { fit: 'contain', trim: true, transparent: true, crop: false, safeArea: 0.02 },
    },
    sello: {
        id: 'sello', label: 'Sello', input: 'image',
        help: 'El sello institucional, preferiblemente en PNG con fondo transparente.',
        accept: 'image/png,image/svg+xml,image/webp',
        image: { fit: 'contain', trim: true, transparent: true, crop: false, safeArea: 0.02 },
    },
    qr: {
        id: 'qr', label: 'Código QR', input: 'image',
        help: 'Subí el QR ya generado. No se recorta su margen: es lo que necesitan los lectores para leerlo.',
        accept: 'image/png,image/svg+xml',
        image: { fit: 'contain', trim: false, transparent: true, crop: false, safeArea: 0.04 },
    },
    texto: { id: 'texto', label: 'Texto', input: 'text', maxChars: 90 },
    texto_largo: { id: 'texto_largo', label: 'Texto largo', input: 'textarea', maxChars: 600 },
    numero: { id: 'numero', label: 'Número', input: 'number', maxChars: 4 },
    fecha: { id: 'fecha', label: 'Fecha', input: 'text', maxChars: 40 },
};

export const KIND_IDS = Object.keys(FIELD_KINDS);
export const isImageKind = (kind?: string | null): boolean => FIELD_KINDS[kind || '']?.input === 'image';

/** Las clases que le sirven a un nodo. Un campo de imagen no va en un texto:
 *  ofrecerlo daría un campo que el nodo no puede consumir. */
export const kindsForNode = (nodeType: 'text' | 'image'): FieldKind[] =>
    Object.values(FIELD_KINDS).filter(k => (nodeType === 'image' ? k.input === 'image' : k.input !== 'image'));

const KIND_BY_KEY: Record<string, string> = {
    logo: 'logo', imagen: 'foto', mensaje: 'texto_largo', anios: 'numero', fecha: 'fecha',
};

export const defaultKindFor = (key?: string | null, nodeType: 'text' | 'image' = 'text'): string => {
    if (key && KIND_BY_KEY[key]) return KIND_BY_KEY[key];
    return nodeType === 'image' ? 'foto' : 'texto';
};

// ─── El nombre interno ─────────────────────────────────────────────────
//
// Se normaliza duro porque termina dentro de un `{{marcador}}` que se busca con
// una expresión regular. El editor lo normaliza mientras se escribe para que se
// vea lo que va a quedar guardado, no lo que se tecleó.
export const normalizeKey = (raw: string): string => String(raw || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^[^a-z]+/, '')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32);

export const validateKey = (raw: string): { ok: boolean; key: string; error: string | null } => {
    const key = normalizeKey(raw);
    if (!key) return { ok: false, key: '', error: 'El nombre interno tiene que empezar por una letra.' };
    if (key.length < 3) return { ok: false, key, error: 'El nombre interno necesita al menos 3 caracteres.' };
    return { ok: true, key, error: null };
};

// ─── La declaración ────────────────────────────────────────────────────

export interface LinkedField {
    kind: string;
    label: string;
    help: string;
    placeholder: string;
    required: boolean;
    visible: boolean;
    defaultValue: string;
    image?: ImageRules;
    maxChars?: number;
}

export const FIELD_LIMITS = { label: 60, help: 160, placeholder: 60, value: 600 };

/** La declaración con la que nace un campo recién marcado. Todo vacío salvo la
 *  clase y la visibilidad: la etiqueta la resuelve el catálogo si nadie la
 *  escribe, y un campo marcado existe para que alguien lo llene. */
export const newField = (key: string, nodeType: 'text' | 'image'): LinkedField => {
    const kind = defaultKindFor(key, nodeType);
    const spec = FIELD_KINDS[kind];
    return {
        kind,
        label: '', help: '', placeholder: '',
        required: false, visible: true, defaultValue: '',
        ...(spec.input === 'image' ? { image: { ...(spec.image as ImageRules) } } : { maxChars: spec.maxChars }),
    };
};

// ─── La clave de un nodo ───────────────────────────────────────────────
//
// Se DERIVA del nodo; no se guarda aparte. Un texto sólo declara campo cuando
// la variable ocupa TODO su contenido: `Al {{club}}` es una frase con un dato
// adentro, no un campo, y dejar que el público reescriba la frase entera
// rompería la redacción de la pieza.
const SOLE_VARIABLE = /^\s*\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}\s*$/;

export const fieldKeyOf = (node: { type?: string; srcVar?: string | null; srcText?: string | null } | null): string | null => {
    if (!node) return null;
    if (node.type === 'image') return node.srcVar || null;
    if (node.type === 'text') return SOLE_VARIABLE.exec(node.srcText || '')?.[1] || null;
    return null;
};

// ─── El recuadro de referencia ─────────────────────────────────────────
//
// Espejo de las mismas funciones en `server/lib/designFields.js`. Lo usa el
// panel de la Cabecera: es lo que hace que «Tamaño del logo (100 %)» signifique
// siempre lo mismo y que «Restablecer» tenga a dónde volver.

interface WithFrame { x: number; y: number; w: number; h: number; field?: { image?: ImageRules | null } | null }

/** A qué escala está el elemento respecto del recuadro de la plantilla. Se
 *  DERIVA del ancho actual; no se guarda, justamente para que no pueda
 *  contradecir al nodo. */
export const frameScaleOf = (node: WithFrame | null): number => {
    const frame = node?.field?.image?.frame;
    if (!frame?.w || !node?.w) return 1;
    return node.w / frame.w;
};

/** El recuadro que le toca a una escala dada, creciendo desde su CENTRO actual:
 *  agrandar un logotipo colocado a ojo no puede moverlo de sitio. */
export const scaledBox = (node: WithFrame, scale: number): Box => {
    const frame = node?.field?.image?.frame;
    if (!frame?.w || !frame?.h) return { x: node.x, y: node.y, w: node.w, h: node.h };
    const s = Math.min(4, Math.max(0.1, Number(scale) || 1));
    const w = frame.w * s;
    const h = frame.h * s;
    const cx = node.x + node.w / 2;
    const cy = node.y + node.h / 2;
    return { x: cx - w / 2, y: cy - h / 2, w, h };
};

/** Volver al recuadro de la plantilla, posición y tamaño. */
export const resetBox = (node: WithFrame): Box | null => {
    const frame = node?.field?.image?.frame;
    return frame ? { x: frame.x, y: frame.y, w: frame.w, h: frame.h } : null;
};

export default {
    FIELD_KINDS, KIND_IDS, isImageKind, kindsForNode, defaultKindFor,
    normalizeKey, validateKey, newField, fieldKeyOf, FIELD_LIMITS,
    frameScaleOf, scaledBox, resetBox,
};
