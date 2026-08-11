// ════════════════════════════════════════════════════════════════════
// El nombre del SITIO dentro de una frase — v4.759.0
//
// Varias cabeceras públicas hablaban «del Rotary Club»: un nombre escrito en el
// código, idéntico en los cientos de sitios alojados. En el sitio del Distrito
// 4281 el subtítulo de Noticias decía «Actualizaciones del Rotary Club», que no
// es el nombre de nadie — y en la Feria de Proyectos habría dicho lo mismo.
//
// Acá vive el CRITERIO de cómo se mete el nombre del sitio en una frase. Es
// PURO —no toca el DOM ni el contexto—, así que se puede probar sin navegador.
//
// ── POR QUÉ «de» Y NO «del» ─────────────────────────────────────────
//
// La frase original llevaba artículo («del Rotary Club») y con un nombre real
// eso deja de funcionar: los sitios se llaman «Distrito 4281», «Club Rotario
// Bogotá», «Rotary E-Club Origen» y también «Feria de Proyectos Rotary
// Colombia», que es FEMENINO. Un «del» fijo produciría «del Feria de
// Proyectos». Deducir el género de un nombre propio no se puede hacer bien, así
// que se elimina el artículo: «de <nombre>» es la única forma que es correcta
// para todos. No reintroducir «del» ni «de la».
//
// ── POR QUÉ NO HAY NOMBRE DE RESPALDO ───────────────────────────────
//
// Cuando el nombre todavía no llegó —el contexto del sitio se resuelve por red
// y el primer render puede no tenerlo— la frase se arma SIN él. Poner un nombre
// genérico de respaldo es volver a escribir el nombre de otro, que es
// exactamente el defecto que esto corrige. Y no se deja un hueco: la variante
// sin nombre es una frase completa.
// ════════════════════════════════════════════════════════════════════

/** El nombre del sitio, o cadena vacía si todavía no llegó. */
export const siteName = (club: unknown): string => {
    const raw = (club as { name?: unknown } | null | undefined)?.name;
    return typeof raw === 'string' ? raw.trim() : '';
};

/**
 * Una frase partida en tres, para que el nombre se pueda pintar aparte.
 *
 * Va partida porque el nombre del sitio es IDENTIDAD, no lenguaje: el traductor
 * del sitio público traduce lo que encuentra en el DOM, y «Distrito 4281» o
 * «Club Rotario Bogotá» no se traducen — se marcan con `data-no-translate`, que
 * es la misma regla que ya protege el nombre de la plataforma. Con la frase en
 * una sola cadena no habría dónde poner esa marca.
 */
export type SiteSentenceParts = { before: string; name: string; after: string };

/**
 * Arma la frase con el nombre del sitio cuando lo hay, y sin él cuando no.
 *
 * `withoutName` no es un descarte: es la misma frase escrita para leerse sin el
 * nombre. Tiene que ser una oración completa, no la de arriba recortada.
 */
export const siteSentence = (
    name: string,
    { before, after, withoutName }: { before: string; after: string; withoutName: string },
): SiteSentenceParts => {
    const n = (name || '').trim();
    if (!n) return { before: withoutName, name: '', after: '' };
    return { before, name: n, after };
};

/** La frase entera en texto plano. Para `useSEO`, títulos y atributos. */
export const siteSentenceText = (parts: SiteSentenceParts): string =>
    `${parts.before}${parts.name}${parts.after}`;

export default { siteName, siteSentence, siteSentenceText };
