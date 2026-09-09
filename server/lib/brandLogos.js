// ════════════════════════════════════════════════════════════════════
// UN LOGOTIPO, LISTO PARA METER EN UN PDF — v4.1018
//
// Baja la imagen de una URL, la normaliza a PNG y devuelve sus medidas
// reales. Lo consume el comprobante de conciliación: arriba el logotipo de la
// PLATAFORMA y abajo el del SITIO que originó el traslado, exactamente el
// mismo reparto que el correo (v4.996).
//
// ⚠️ ESTO NO CONTRADICE LA REGLA DE LAS FUENTES (v4.794). Aquélla dice que
// componer TEXTO en el servidor saca cuadritos, y es cierta: rasterizar un SVG
// con texto necesita una fuente instalada y en Vercel no hay ninguna. Acá no se
// compone texto: se reescala una imagen que ya existe. Un logotipo en SVG se
// convierte igual —sharp lo hace— y su tipografía viaja como trazos dentro del
// archivo, no se busca en el sistema.
//
// ⚠️ NUNCA LANZA Y SIEMPRE TIENE TOPE DE TIEMPO. Es la regla de v4.875: una
// consulta a un tercero sin `signal` espera lo que el otro extremo quiera, y
// esto corre dentro de la petición que compone el documento de un reenvío. Un
// logotipo que no llega no puede costar la conciliación: el PDF sale con el
// NOMBRE del sitio en texto, que es lo que ya hace el correo (v4.996) y lo que
// impide que se dibuje jamás un emblema «parecido» — el de Rotary es marca
// registrada y se reproduce desde su archivo o no se reproduce.
// ════════════════════════════════════════════════════════════════════

/** Cuánto se espera por un logotipo. Corto a propósito: es un adorno del
 *  documento, no su contenido. */
const TIMEOUT_MS = Number(process.env.BRAND_LOGO_TIMEOUT_MS) || 4000;

/** Lo que se admite descargar. Un logotipo institucional pesa kilobytes; un
 *  archivo de varios MB en esa URL es un error de carga, no un logotipo. */
const MAX_BYTES = 3 * 1024 * 1024;

/** El alto al que se rasteriza, en píxeles. El PDF lo dibuja a 18-26 pt (≈24-35
 *  px a 96 dpi), así que 96 px es ~3× y queda nítido impreso —criterio de
 *  aceptación del pedido— sin inflar el archivo, que viaja adjunto a un
 *  correo. `withoutEnlargement` es lo que impide que un logotipo pequeño se
 *  amplíe y se pixele. */
const RASTER_HEIGHT = 96;

/** Una imagen ya resuelta vale para los dos logotipos del mismo documento y
 *  para los documentos siguientes de la misma invocación. Sin esto, un reenvío
 *  baja el logotipo de la plataforma tantas veces como PDF componga. */
const cache = new Map();
const CACHE_MAX = 20;

/** Sólo `https`. La URL sale de la base —la carga un administrador— y termina
 *  en una petición de salida del servidor: `http` viajaría en claro y
 *  `file://` leería el disco de la función. Mismo criterio que el mapa de la
 *  sede (v4.717) y el proxy de imágenes (v4.912). */
const descargable = (url) => {
    try {
        const u = new URL(String(url));
        return u.protocol === 'https:';
    } catch { return false; }
};

/**
 * El logotipo de una URL, como PNG en base64 y con sus medidas.
 *
 * @returns `{ ok: true, dataUrl, width, height, bytes }` o `{ ok: false, motivo }`
 */
export const loadBrandLogo = async (url) => {
    const clave = String(url || '').trim();
    if (!clave) return { ok: false, motivo: 'sin logotipo configurado' };
    if (!descargable(clave)) return { ok: false, motivo: 'el logotipo no es una dirección https' };
    if (cache.has(clave)) return cache.get(clave);

    const resultado = await (async () => {
        try {
            // ⚠️ CON TOPE DE TIEMPO. Ver el encabezado: sin `signal`, un origen
            // lento cuelga el reenvío entero.
            const respuesta = await fetch(clave, {
                signal: AbortSignal.timeout(TIMEOUT_MS),
                redirect: 'follow',
            });
            if (!respuesta.ok) return { ok: false, motivo: `el origen contestó ${respuesta.status}` };

            const declarado = Number(respuesta.headers.get('content-length')) || 0;
            if (declarado > MAX_BYTES) return { ok: false, motivo: 'el logotipo pesa demasiado' };

            const crudo = Buffer.from(await respuesta.arrayBuffer());
            if (!crudo.length) return { ok: false, motivo: 'el logotipo llegó vacío' };
            if (crudo.length > MAX_BYTES) return { ok: false, motivo: 'el logotipo pesa demasiado' };

            const { default: sharp } = await import('sharp');
            // Se normaliza a PNG SIEMPRE: `addImage` de jsPDF entiende PNG y
            // JPEG, y un logotipo institucional suele ser SVG o WebP — que
            // pasarían crudos y no se dibujarían, en silencio.
            const png = await sharp(crudo)
                .resize({ height: RASTER_HEIGHT, withoutEnlargement: true, fit: 'inside' })
                .png()
                .toBuffer();
            const meta = await sharp(png).metadata();
            if (!meta?.width || !meta?.height) return { ok: false, motivo: 'no se pudo medir el logotipo' };

            return {
                ok: true,
                dataUrl: `data:image/png;base64,${png.toString('base64')}`,
                width: meta.width,
                height: meta.height,
                bytes: png.length,
            };
        } catch (e) {
            const motivo = e?.name === 'TimeoutError'
                ? 'el origen del logotipo no contestó a tiempo'
                : (e?.message || 'no se pudo leer el logotipo');
            console.warn('[MARCA] no pude preparar el logotipo:', motivo);
            return { ok: false, motivo };
        }
    })();

    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
    cache.set(clave, resultado);
    return resultado;
};

/** Vacía la caché. Sólo la usan las pruebas: en producción un logotipo que
 *  cambia se ve en el arranque en frío siguiente, y componer un PDF no es el
 *  sitio donde alguien lo mira para comprobarlo. */
export const clearBrandLogoCache = () => cache.clear();

export default { loadBrandLogo, clearBrandLogoCache };
