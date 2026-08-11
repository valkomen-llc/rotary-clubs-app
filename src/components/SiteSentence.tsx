// ════════════════════════════════════════════════════════════════════
// La frase con el nombre del sitio, pintada — v4.759.0
//
// Es una línea, y está acá y no repetida en cada página por lo que envuelve: la
// marca `data-no-translate` sobre el nombre. Escrita a mano en tres pantallas,
// la que se olvide no da ningún error — simplemente deja que el traductor
// convierta «Club Rotario Bogotá» en otra cosa, y eso no se ve hasta que
// alguien mira el sitio en otro idioma.
// ════════════════════════════════════════════════════════════════════

import type { SiteSentenceParts } from '../lib/siteName';

/**
 * El nombre va en su propio `<span>` marcado: es IDENTIDAD, no lenguaje.
 * Lo de alrededor sí se traduce, como cualquier otro texto del sitio.
 */
const SiteSentence = ({ parts }: { parts: SiteSentenceParts }) => (
    <>
        {parts.before}
        {parts.name ? <span data-no-translate>{parts.name}</span> : null}
        {parts.after}
    </>
);

export default SiteSentence;
