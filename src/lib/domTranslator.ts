// ════════════════════════════════════════════════════════════════════════════
// Motor de traducción sobre el DOM — v4.661
//
// Recoge del árbol ya pintado todo lo que un visitante puede LEER, lo sustituye
// por su traducción y sabe deshacerlo. Está aparte de LanguageContext para que
// se pueda probar sin montar React: es la pieza con más aristas del módulo.
//
// Cubre nodos de texto y atributos visibles (placeholder, title, alt,
// aria-label, y el value de los botones). NO toca fechas ni cifras: eso no se
// traduce, se formatea con el locale activo (src/lib/locale.ts).
// ════════════════════════════════════════════════════════════════════════════

export const MIN_LEN = 2;

// Qué NO se recorre buscando texto. `input` y `textarea` no tienen texto dentro
// —su placeholder se trata como atributo—; `select` SÍ se recorre, porque sus
// `option` son texto visible que el visitante lee.
export const SKIP_TEXT = [
    'script', 'style', 'noscript', 'template', 'svg', 'code', 'pre',
    'input', 'textarea', '[data-no-translate]', '[translate="no"]', '.notranslate',
].join(',');

// Atributos que el usuario lee. `value` sólo cuenta en botones: en un campo de
// texto es el DATO que escribió la persona, y traducirlo corrompería lo que va
// a enviar.
export const ATTRS = [
    'placeholder', 'title', 'alt', 'aria-label', 'aria-placeholder', 'aria-description',
];

export const ATTR_SELECTOR = [
    ...ATTRS.map(a => `[${a}]`),
    'input[type="submit"][value]',
    'input[type="button"][value]',
    'input[type="reset"][value]',
].join(',');

const NO_TRANSLATE_CLOSEST = '[data-no-translate],[translate="no"],.notranslate';

/**
 * ¿Esto es un DATO en vez de lenguaje?
 * Espejo en el navegador de `isTranslatable` (server/lib/translationSpec.js).
 * Filtrar aquí ahorra el viaje de red; el servidor vuelve a filtrar igual,
 * porque es el que no se puede saltar.
 */
export function looksLikeData(t: string): boolean {
    if (!t || t.length < MIN_LEN) return true;
    if (!/\p{L}/u.test(t)) return true;                        // sin letras: cifras o puntuación
    if (/^\d+([.,]\d+)*$/.test(t)) return true;
    if (/^https?:\/\//i.test(t) || /^www\./i.test(t)) return true;
    if (/^[\w.+-]+@[\w-]+\.[\w.]+$/.test(t)) return true;
    if (/^[+()\d][\d\s()+-]{5,}$/.test(t)) return true;
    if (/^[$€£¥]?\s*[\d][\d.,\s]*\s*(?:USD|COP|EUR|GBP|JPY|KRW|BRL|MXN)?$/i.test(t)) return true;
    return false;
}

// ─── Estado por nodo ────────────────────────────────────────────────────────
// De cada nodo se guardan DOS cosas: el original en español y lo último que
// escribimos nosotros. Con las dos se distingue un cambio NUESTRO de un cambio
// de React — que es lo que permite observar `characterData` sin entrar en bucle
// y sin tomar por original un texto que ya estaba traducido.
//
// El original va POR NODO, no por elemento: un elemento con varios nodos (el
// copyright del pie: año + nombre + "Todos los derechos reservados.") acababa
// con todos sus nodos pisados por la misma traducción.
interface NodeState { original: string; applied: string | null }

const textState = new WeakMap<Text, NodeState>();
type AttrState = Record<string, { original: string; applied: string | null }>;
const attrState = new WeakMap<Element, AttrState>();

export function originalOf(node: Text): string {
    const current = (node.textContent || '').trim();
    let st = textState.get(node);
    if (!st) {
        st = { original: current, applied: null };
        textState.set(node, st);
    } else if (current !== (st.applied ?? st.original)) {
        // Ni es lo que escribimos ni es el original conocido: React repintó el
        // nodo con contenido nuevo, y ese contenido es el nuevo original.
        st.original = current;
        st.applied = null;
    }
    return st.original;
}

export function writeText(node: Text, value: string): void {
    const raw = node.textContent || '';
    const lead = raw.match(/^\s*/)?.[0] ?? '';
    const trail = raw.match(/\s*$/)?.[0] ?? '';
    node.textContent = lead + value + trail;
    const st = textState.get(node);
    if (st) st.applied = value;
}

function attrsOf(el: Element): string[] {
    const list = ATTRS.filter(a => el.hasAttribute(a));
    if (el.tagName === 'INPUT'
        && ['submit', 'button', 'reset'].includes((el as HTMLInputElement).type)
        && el.hasAttribute('value')) {
        list.push('value');
    }
    return list;
}

export function originalAttr(el: Element, attr: string): string {
    const current = (el.getAttribute(attr) || '').trim();
    let st = attrState.get(el);
    if (!st) { st = {}; attrState.set(el, st); }
    const entry = st[attr];
    if (!entry) {
        st[attr] = { original: current, applied: null };
        return current;
    }
    if (current !== (entry.applied ?? entry.original)) {
        entry.original = current;
        entry.applied = null;
    }
    return entry.original;
}

export function writeAttr(el: Element, attr: string, value: string): void {
    el.setAttribute(attr, value);
    const st = attrState.get(el);
    if (st?.[attr]) st[attr].applied = value;
}

// ─── Recorridos ─────────────────────────────────────────────────────────────

export function getTextNodes(root: Element): Text[] {
    const skip = new Set<Node>(Array.from(root.querySelectorAll(SKIP_TEXT)));
    const out: Text[] = [];
    const w = root.ownerDocument!.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode(node: Node) {
            let p = node.parentElement;
            while (p && p !== root) {
                if (skip.has(p)) return NodeFilter.FILTER_REJECT;
                p = p.parentElement;
            }
            return looksLikeData((node.textContent || '').trim())
                ? NodeFilter.FILTER_SKIP
                : NodeFilter.FILTER_ACCEPT;
        },
    });
    let n: Node | null;
    while ((n = w.nextNode())) out.push(n as Text);
    return out;
}

export function getAttrTargets(root: Element): Array<{ el: Element; attr: string }> {
    const out: Array<{ el: Element; attr: string }> = [];
    const els: Element[] = [root, ...Array.from(root.querySelectorAll(ATTR_SELECTOR))];
    for (const el of els) {
        if (!el || el.nodeType !== 1) continue;
        if (el.closest(NO_TRANSLATE_CLOSEST)) continue;
        for (const attr of attrsOf(el)) {
            if (!looksLikeData(originalAttr(el, attr))) out.push({ el, attr });
        }
    }
    return out;
}

// ─── Aplicar, restaurar, inventariar ────────────────────────────────────────

/** Vuelca al DOM todo lo que ya esté traducido. Síncrono y sin red. */
export function applyAll(root: Element, cache: Record<string, string>): number {
    let n = 0;
    for (const node of getTextNodes(root)) {
        const tr = cache[originalOf(node)];
        if (tr) { writeText(node, tr); n++; }
    }
    for (const { el, attr } of getAttrTargets(root)) {
        const tr = cache[originalAttr(el, attr)];
        if (tr) { writeAttr(el, attr, tr); n++; }
    }
    return n;
}

/** Devuelve el sitio a su idioma original. */
export function restoreAll(root: Element): number {
    let n = 0;
    const w = root.ownerDocument!.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = w.nextNode())) {
        const st = textState.get(node as Text);
        if (st && st.applied !== null) {
            writeText(node as Text, st.original);
            st.applied = null;
            n++;
        }
    }
    for (const el of Array.from(root.querySelectorAll(ATTR_SELECTOR))) {
        const st = attrState.get(el);
        if (!st) continue;
        for (const [attr, entry] of Object.entries(st)) {
            if (entry.applied !== null) {
                el.setAttribute(attr, entry.original);
                entry.applied = null;
                n++;
            }
        }
    }
    // Restos del esquema anterior (original guardado en el elemento padre).
    root.querySelectorAll('[data-ot]').forEach(el => el.removeAttribute('data-ot'));
    return n;
}

/** Lo que falta por traducir bajo `root`, sin repetidos. */
export function collectMissing(root: Element, cache: Record<string, string>): string[] {
    const set = new Set<string>();
    for (const node of getTextNodes(root)) {
        const o = originalOf(node);
        if (!looksLikeData(o) && !cache[o]) set.add(o);
    }
    for (const { el, attr } of getAttrTargets(root)) {
        const o = originalAttr(el, attr);
        if (!looksLikeData(o) && !cache[o]) set.add(o);
    }
    return [...set];
}

export default {
    ATTRS, ATTR_SELECTOR, SKIP_TEXT, MIN_LEN,
    looksLikeData, getTextNodes, getAttrTargets,
    originalOf, originalAttr, writeText, writeAttr,
    applyAll, restoreAll, collectMissing,
};
