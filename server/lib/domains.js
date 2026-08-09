// Normalización de dominios — el CRITERIO de a qué sitio pertenece una visita.
//
// PURO a propósito: sin base y sin red, para poder probarlo. Lo consumen el
// alta y la edición de un sitio (al GUARDAR) y la resolución por dominio (al
// BUSCAR), que son los dos extremos que tienen que coincidir.
//
// POR QUÉ IMPORTA: si las dos puntas no normalizan igual, el sitio no resuelve
// y el visitante NO ve un error —ve el sitio «Origen», con «Nombre del club» y
// fotos genéricas—. Es un fallo mudo: parece un sitio a medio configurar y en
// realidad el dominio no está atado a nada.

/**
 * La forma canónica de un dominio: minúsculas, sin protocolo, sin usuario, sin
 * puerto, sin ruta, sin punto final y sin `www.`.
 *
 * `www.` se quita ACÁ y no sólo al comparar: guardado y consultado tienen que
 * reducirse a lo mismo, o se depende de que quien busca pruebe las variantes.
 */
export function canonicalDomain(value) {
    let d = String(value ?? '').trim().toLowerCase();
    if (!d) return '';
    d = d.replace(/^[a-z][a-z0-9+.-]*:\/\//, '');  // protocolo
    d = d.replace(/^[^/@]*@/, '');                  // usuario:clave@
    d = d.replace(/[/?#].*$/, '');                  // ruta, query, ancla
    d = d.replace(/:\d+$/, '');                     // puerto
    d = d.replace(/\.+$/, '');                      // punto final
    d = d.replace(/^www\./, '');
    return d;
}

/**
 * Las formas con las que hay que comparar contra lo GUARDADO.
 *
 * Aunque al guardar se canonice, en la base hay filas escritas antes de que
 * eso existiera y por caminos que no pasaban por la normalización (el alta
 * hasta v4.743, el registro público, importaciones). Por eso se comparan las
 * variantes en vez de confiar en que lo almacenado esté limpio.
 */
export function domainCandidates(value) {
    const clean = canonicalDomain(value);
    if (!clean) return [];
    return [...new Set([clean, `www.${clean}`])];
}

/** La primera etiqueta del dominio: `rotary4281.org` → `rotary4281`. */
export function subdomainLabel(value) {
    return canonicalDomain(value).split('.')[0] || '';
}

/**
 * ¿Estos dos dominios son el mismo sitio? Ignora protocolo, `www.`, puerto,
 * ruta y mayúsculas.
 */
export function sameDomain(a, b) {
    const ca = canonicalDomain(a);
    return !!ca && ca === canonicalDomain(b);
}

export default { canonicalDomain, domainCandidates, subdomainLabel, sameDomain };
