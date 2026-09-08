/**
 * Espejo MÍNIMO de `server/lib/publicMedia.js`: sólo componer la dirección.
 *
 * Quien DECIDE si un archivo se puede servir sin sesión es el servidor —acá no
 * están `servability`, `isPrivateKey` ni el catálogo de prefijos privados—. Con
 * dos criterios, la pantalla ofrecería el enlace público de un documento que la
 * API contesta con 404, y lo que se separaría en silencio es qué archivos de
 * una organización quedan al alcance de cualquiera.
 *
 * Lo que sí vive acá es armar la ruta, porque el panel la escribe para copiarla
 * y pedirla al servidor costaría un viaje de red por archivo. Se compara por
 * SALIDAS con el módulo del servidor en `npm run test:public-media`.
 */

/** El nombre saneado con el que se compone una clave o un enlace legible. */
export function canonicalObjectName(name: string, maxLength = 120): string {
    const original = String(name ?? '').trim();
    const punto = original.lastIndexOf('.');
    const tieneExt = punto > 0 && punto < original.length - 1;

    const base = tieneExt ? original.slice(0, punto) : original;
    const ext = tieneExt ? original.slice(punto + 1) : '';

    const limpio = (texto: string) => texto
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/ñ/g, 'n').replace(/Ñ/g, 'N')
        .replace(/[^A-Za-z0-9]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');

    let nombre = limpio(base).slice(0, maxLength);
    if (!nombre) nombre = 'archivo';

    const extension = limpio(ext).toLowerCase().slice(0, 12);
    return extension ? `${nombre}.${extension}` : nombre;
}

/** La ruta pública y estable de un archivo de la Biblioteca. */
export function publicMediaPath(id: string, filename = ''): string | null {
    const clave = String(id ?? '').trim();
    if (!clave) return null;
    const bonito = canonicalObjectName(filename);
    return bonito && bonito !== 'archivo'
        ? `/api/public/media/${encodeURIComponent(clave)}/${encodeURIComponent(bonito)}`
        : `/api/public/media/${encodeURIComponent(clave)}`;
}

/**
 * La misma dirección, absoluta y sobre el dominio desde el que se está mirando
 * el panel — que es el dominio del sitio, o sea el que hay que compartir.
 */
export function publicMediaUrl(id: string, filename = '', origin?: string): string | null {
    const ruta = publicMediaPath(id, filename);
    if (!ruta) return null;
    const base = (origin ?? (typeof window !== 'undefined' ? window.location.origin : '')).replace(/\/+$/, '');
    return base ? `${base}${ruta}` : ruta;
}

/**
 * Qué archivos se comparten por la vía estable de la plataforma.
 *
 * Los DOCUMENTOS, siempre: son los que se reparten por WhatsApp y se imprimen
 * en un pendón, y son donde el nombre del archivo —con sus tildes, comas y
 * paréntesis— rompía el enlace en el móvil.
 *
 * Una imagen o un video conservan su dirección directa a propósito: se pintan
 * decenas por pantalla y hacerlas pasar por nuestra función sería una
 * invocación por miniatura. Su clave, además, ya nace saneada.
 */
export function prefersStableLink(type: string): boolean {
    return String(type ?? '').toLowerCase() === 'document';
}
