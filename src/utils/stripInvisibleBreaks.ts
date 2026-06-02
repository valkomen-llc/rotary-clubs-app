// Limpia caracteres invisibles que generan puntos de quiebre de línea DENTRO de
// las palabras, haciendo que el texto se "corte" a mitad de palabra al final de
// cada línea (ej. "en-cuentro", "Interca-mbios", "u-n").
//
// Estos caracteres suelen colarse en texto generado por IA o pegado desde otras
// fuentes (Word, PDF, web) y NO se pueden neutralizar con CSS: el espacio de
// ancho cero (U+200B) siempre habilita un quiebre, sin importar `word-break`,
// `overflow-wrap` ni `hyphens`. La única solución robusta es eliminarlos del
// contenido.
//
// Se eliminan: guion suave (U+00AD), espacio de ancho cero (U+200B) y BOM/espacio
// de ancho cero sin quiebre (U+FEFF), más la etiqueta <wbr> (punto de quiebre
// explícito). Se conservan ZWJ/ZWNJ (U+200C/U+200D) para no romper emojis.

const INVISIBLE_BREAK_CHARS = new RegExp('[\\u00AD\\u200B\\uFEFF]', 'g');
const WBR_TAG = /<wbr\s*\/?>(?:<\/wbr>)?/gi;

export const stripInvisibleBreaks = (html?: string | null): string =>
    (html || '')
        .replace(WBR_TAG, '')
        .replace(INVISIBLE_BREAK_CHARS, '');
