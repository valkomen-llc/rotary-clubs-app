// HEIC en el navegador — espejo mínimo del criterio de `server/lib/heicImages.js`.
//
// Acá sólo hace falta RECONOCER un HEIC, no convertirlo: la conversión ocurre
// en el servidor con FFmpeg, porque ningún navegador salvo Safari sabe
// decodificar este formato —que es justamente el problema que se está
// resolviendo—. Traer un decodificador WASM al bundle para adivinar lo que el
// servidor ya sabe sería pagar megabytes por duplicar una respuesta.
//
// Duplicado a propósito, como `entityTypes.ts` y `mediaFolders.ts`. Si cambia
// uno, cambiar el otro — lo comprueba `npm run test:heic`.

export const HEIC_EXTENSIONS = ['.heic', '.heif', '.hif'];

export const HEIC_MIME_TYPES = [
    'image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence',
];

/**
 * ¿Es un archivo que el navegador no va a poder dibujar?
 *
 * Mira el MIME **y** la extensión, y basta con que uno de los dos lo diga: al
 * elegir un `.heic`, varios navegadores mandan el tipo vacío o
 * `application/octet-stream`.
 */
export function isHeicFile({ filename, mimetype }: { filename?: string | null; mimetype?: string | null } = {}): boolean {
    const mime = String(mimetype || '').toLowerCase().split(';')[0].trim();
    if (HEIC_MIME_TYPES.includes(mime)) return true;
    const name = String(filename || '').toLowerCase();
    return HEIC_EXTENSIONS.some(ext => name.endsWith(ext));
}

/** El nombre que llevará el archivo convertido: mismo nombre, extensión .jpg. */
export function jpegNameFor(filename?: string | null): string {
    const name = String(filename || 'imagen');
    const withoutExt = name.replace(/\.(heic|heif|hif)$/i, '');
    return `${withoutExt || 'imagen'}.jpg`;
}
