// ════════════════════════════════════════════════════════════════════
// ¿Esta dirección es un ARCHIVO del build, no una página?
// v4.789.0
//
// `vercel.json` reescribe TODO lo que no es `/api/` a la función, así que un
// archivo del build que no existe —porque el navegador tiene el `index.html`
// de un despliegue anterior y pide `/assets/ContentStudio-VIEJO.js`— no da 404:
// cae en el catch-all y recibe **el documento de la aplicación, con estado 200
// y `Content-Type: text/html`**.
//
// Lo que pasa entonces del lado del navegador es el defecto reportado: el
// `import()` de `React.lazy` intenta interpretar HTML como un módulo, falla, y
// como React CACHEA la promesa rechazada, ese componente ya no vuelve a cargar
// en toda la sesión. La pantalla queda en blanco y sólo se arregla recargando.
//
// Reconocer estas direcciones y responder 404 de verdad es lo que convierte un
// error de sintaxis mudo en un fallo limpio que el cliente puede atrapar.
//
// El criterio vive aparte y es PURO para poder probarlo: acertar qué es un
// archivo y qué es una ruta de la aplicación es todo el asunto, y equivocarse
// hacia el otro lado —dar por archivo una página real— dejaría al visitante sin
// esa página.
// ════════════════════════════════════════════════════════════════════

// Las extensiones que produce el build o que se sirven como estáticos. No es
// «cualquier cosa con punto»: una ruta de la aplicación puede llevarlo
// perfectamente —`/eventos/xii-feria-2027.valledupar`, un slug con punto— y
// tratarla como archivo la dejaría sin servir.
const ASSET_EXTENSIONS = new Set([
    'js', 'mjs', 'cjs', 'css', 'map',
    'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'avif', 'ico', 'bmp',
    'woff', 'woff2', 'ttf', 'otf', 'eot',
    'mp4', 'webm', 'mp3', 'wav', 'ogg',
    'json', 'txt', 'xml', 'webmanifest', 'wasm', 'pdf', 'zip',
]);

// Carpetas que Vite emite y que, por tanto, sólo pueden contener archivos.
// Cualquier cosa bajo ellas que llegue hasta acá es un archivo que no existe.
const ASSET_PREFIXES = ['/assets/'];

/**
 * ¿La petición es por un archivo del build?
 *
 * Se usa para NO devolverle el documento de la aplicación: un archivo que no
 * está tiene que dar 404, no HTML.
 *
 * Se decide por la extensión y por la carpeta, nunca por «tiene un punto».
 * `robots.txt` y `sitemap.xml` no llegan hasta acá —tienen su propia ruta— y
 * si llegaran, un 404 sería la respuesta correcta igualmente.
 */
export const isBuildAssetPath = (pathname) => {
    const p = String(pathname || '');
    if (!p.startsWith('/')) return false;
    if (ASSET_PREFIXES.some(prefix => p.startsWith(prefix))) return true;

    // Sólo la última parte de la ruta, y sin la query —que Express ya no
    // incluye en `req.path`, pero esta función también se prueba suelta—.
    const last = p.split('?')[0].split('#')[0].split('/').pop() || '';
    const dot = last.lastIndexOf('.');
    if (dot <= 0 || dot === last.length - 1) return false;

    return ASSET_EXTENSIONS.has(last.slice(dot + 1).toLowerCase());
};
