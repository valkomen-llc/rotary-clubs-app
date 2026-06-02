// Normaliza el contenido de los artículos para que el texto fluya y corte entre
// palabras (no a mitad de palabra) en el sitio público.
//
// CAUSA REAL del texto "mocho": el contenido pegado desde Word/PDF/Google Docs
// suele traer TODOS los espacios entre palabras como `&nbsp;` (espacio de
// no-quiebre, U+00A0). Como no hay espacios "normales" donde cortar la línea, el
// navegador se ve forzado a partir las palabras a la mitad en el margen. La
// solución es convertir esos espacios de no-quiebre en espacios normales.
//
// Además eliminamos caracteres invisibles de ancho cero (U+200B, U+00AD guion
// suave, U+2060 word joiner, U+FEFF BOM) y la etiqueta <wbr>, que también pueden
// alterar el quiebre. Se conservan ZWJ/ZWNJ (U+200C/U+200D) para no romper emojis.

// Caracteres a ELIMINAR (ancho cero, sin espacio visible).
const invisibleChars = () => new RegExp('[\\u00AD\\u200B\\u2060\\uFEFF]', 'g');
// Espacios de no-quiebre a CONVERTIR en espacio normal (para permitir el corte).
const noBreakSpaces = () => new RegExp('[\\u00A0\\u202F]', 'g');
const WBR_TAG = /<wbr\s*\/?>(?:<\/wbr>)?/gi;

// Para texto plano YA decodificado (resúmenes, textContent). No usa el DOM, por
// lo que NO re-codifica los espacios como entidades `&nbsp;`.
export const cleanArticleText = (text?: string | null): string =>
    typeof text === 'string'
        ? text.replace(invisibleChars(), '').replace(noBreakSpaces(), ' ')
        : '';

// Para contenido HTML (cuerpo del artículo). En el navegador deja que el DOM
// decodifique las entidades, normaliza cada nodo de texto y re-serializa; así
// los `&nbsp;` se convierten en espacios normales reales. En entornos sin DOM
// (servidor) limpia tanto los caracteres literales como sus entidades HTML.
export const cleanArticleHtml = (html?: string | null): string => {
    if (typeof html !== 'string' || html.length === 0) return '';

    const withoutWbr = html.replace(WBR_TAG, '');

    if (typeof document !== 'undefined') {
        const container = document.createElement('div');
        container.innerHTML = withoutWbr;
        const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
        let node = walker.nextNode();
        while (node) {
            if (node.nodeValue) {
                node.nodeValue = node.nodeValue
                    .replace(invisibleChars(), '')
                    .replace(noBreakSpaces(), ' ');
            }
            node = walker.nextNode();
        }
        return container.innerHTML;
    }

    // Sin DOM: convertimos entidades de espacio de no-quiebre a espacio normal y
    // eliminamos invisibles (literales y entidades).
    return withoutWbr
        .replace(/&nbsp;|&#x0*a0;|&#0*160;|&#x0*202f;|&#0*8239;/gi, ' ')
        .replace(/&#x0*(?:ad|200b|2060|feff);|&#0*(?:173|8203|8288|65279);|&(?:shy|ZeroWidthSpace|NoBreak);/gi, '')
        .replace(invisibleChars(), '')
        .replace(noBreakSpaces(), ' ');
};
