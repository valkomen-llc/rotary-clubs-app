// ════════════════════════════════════════════════════════════════════════════
// Recursos que cambian con el idioma — v4.699
//
// Algunas piezas gráficas están rotuladas y por tanto tienen idioma: el logo
// de la feria dice «Feria de Proyectos» o «Projects Fair» según la versión.
// Esas piezas siguen al IDIOMA ACTIVO del sitio, con el mismo criterio que ya
// rige los botones de registro desde v4.652.
//
// La división es BINARIA y deliberada: no hay una versión por idioma, hay dos.
//   · nacional      → español de Colombia (`es`, `es-CO`)
//   · internacional → todo lo demás: inglés, francés, portugués, alemán,
//                     italiano, japonés y coreano
//
// No es que al japonés le toque el logo en inglés por descuido: es que el
// cliente mantiene DOS versiones de cada pieza, la colombiana y la
// internacional, y esta última está rotulada en inglés.
// ════════════════════════════════════════════════════════════════════════════

/**
 * Idiomas que reciben la versión nacional.
 *
 * Espejo en el navegador de `DEFAULT_NATIONAL_LOCALES`
 * (server/lib/eventRegistrationSpec.js). Está duplicado a propósito, igual que
 * `ADMIN_ROLES`: allá decide qué categorías de registro se ofrecen, aquí qué
 * archivo se pinta. Si cambia una lista, cambiar la otra.
 *
 * La comparación es EXACTA: `es-MX` o `es-ES` no son `es-CO`, son visitantes de
 * fuera. En este sitio el selector ofrece un solo español y es el colombiano,
 * por eso `es` cuenta como nacional.
 */
export const NATIONAL_LANGS = ['es', 'es-CO'];

/** ¿Este idioma activo recibe la versión nacional (Colombia)? */
export function isNationalLang(lang?: string | null): boolean {
    const value = String(lang || '').trim().toLowerCase();
    if (!value) return false;
    return NATIONAL_LANGS.some(l => l.toLowerCase() === value);
}

/**
 * Elige entre la pieza nacional y la internacional.
 *
 * `national` es la que ya existía y sigue siendo la de referencia: si no se ha
 * cargado una versión internacional, se usa ella en todos los idiomas. Eso es
 * lo que hace que activar esta función no rompa ningún sitio de los que no la
 * usan — que son casi todos.
 *
 * Nunca devuelve un hueco: entre una pieza en el idioma equivocado y ninguna
 * pieza, se prefiere la primera.
 */
export function pickLocalizedAsset(
    national?: string | null,
    international?: string | null,
    lang?: string | null,
): string | undefined {
    const nat = (national || '').trim();
    const intl = (international || '').trim();
    if (isNationalLang(lang)) return nat || intl || undefined;
    return intl || nat || undefined;
}

export default { NATIONAL_LANGS, isNationalLang, pickLocalizedAsset };
