// Limpia caracteres invisibles que generan puntos de quiebre de línea DENTRO de
// las palabras, haciendo que el texto se "corte" a mitad de palabra al final de
// cada línea (ej. "en-cuentro", "Interca-mbios", "u-n").
//
// Estos caracteres (espacio de ancho cero U+200B, guion suave U+00AD, BOM
// U+FEFF, word joiner U+2060) y la etiqueta <wbr> se cuelan en texto generado
// por IA o pegado desde Word/PDF/web. Ningún CSS (word-break, hyphens) los
// neutraliza: U+200B siempre habilita un quiebre.
//
// PUNTO CLAVE: a menudo el contenido NO guarda el carácter literal, sino su
// ENTIDAD HTML (ej. "&#8203;", "&#xfeff;"). El navegador la decodifica recién al
// renderizar, por eso un editor como Quill (que normaliza el HTML) se ve limpio
// pero el sitio público se ve roto. Por eso, en el navegador, limpiamos DESPUÉS
// de decodificar las entidades, recorriendo los nodos de texto del DOM ya
// construido. En entornos sin DOM (servidor) limpiamos tanto los caracteres
// literales como sus entidades HTML.
//
// Se conservan ZWJ/ZWNJ (U+200C/U+200D) para no romper emojis.

const invisibleChars = () => new RegExp('[\\u00AD\\u200B\\u2060\\uFEFF]', 'g');
const WBR_TAG = /<wbr\s*\/?>(?:<\/wbr>)?/gi;
const INVISIBLE_ENTITIES =
    /&#x0*(?:ad|200b|2060|feff);|&#0*(?:173|8203|8288|65279);|&(?:shy|ZeroWidthSpace|NoBreak);/gi;

export const stripInvisibleBreaks = (html?: string | null): string => {
    if (typeof html !== 'string' || html.length === 0) return '';

    // Quitamos siempre las etiquetas de quiebre explícito.
    const withoutWbr = html.replace(WBR_TAG, '');

    if (typeof document !== 'undefined') {
        // Navegador: dejamos que el DOM decodifique las entidades y luego
        // eliminamos los caracteres reales de cada nodo de texto.
        const container = document.createElement('div');
        container.innerHTML = withoutWbr;
        const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
        let node = walker.nextNode();
        while (node) {
            if (node.nodeValue) {
                node.nodeValue = node.nodeValue.replace(invisibleChars(), '');
            }
            node = walker.nextNode();
        }
        return container.innerHTML;
    }

    // Sin DOM (servidor): limpiamos caracteres literales y sus entidades HTML.
    return withoutWbr.replace(INVISIBLE_ENTITIES, '').replace(invisibleChars(), '');
};
