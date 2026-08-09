// HEIC/HEIF → JPEG. Lo que hace que una foto de iPhone se vea en la Librería.
//
// EL PROBLEMA: HEIC es el formato con el que un iPhone guarda las fotos por
// omisión. Ningún navegador salvo Safari lo dibuja en un `<img>`, así que en la
// Librería de Medios —y en el sitio publicado, y en el selector de imágenes—
// una foto subida desde un iPhone aparecía rota. No era un fallo de la
// Librería: es que el archivo no se puede mostrar en la web.
//
// POR QUÉ NO SHARP: declara el formato `heif` y LEE el contenedor —da ancho,
// alto y orientación—, pero sus binarios precompilados no traen el
// decodificador HEVC, que es con el que un iPhone comprime. Medido con seis
// archivos HEIC reales: `metadata()` responde bien y `.jpeg()` falla en todos.
//
// POR QUÉ NO FFMPEG (v4.741): decodifica HEVC, pero un HEIC de iPhone guarda la
// foto como una REJILLA de mosaicos (`Tile Grid`) más imágenes auxiliares —la
// miniatura y el mapa de ganancia HDR—. FFmpeg 7.0 expone la rejilla como
// «stream group» y NO la ensambla: la selección automática de stream termina
// eligiendo un mosaico suelto o el mapa de ganancia. El mapa de ganancia es una
// imagen en escala de grises, casi negra con manchas blancas, y es exactamente
// lo que apareció en la Librería después de convertir. La rejilla se agregó a
// ffmpeg en 7.1 y el binario que empaquetamos es el 7.0.2.
//
// LO QUE SE USA: libheif (`heic-decode`), que es la implementación de
// referencia del formato: reconstruye la rejilla, elige la imagen PRIMARIA y
// deja fuera las auxiliares. Pesa 6,2 MB, holgado dentro del tope de 250 MB de
// la función. Devuelve píxeles crudos y sharp codifica el JPEG.
//
// Y SE COMPRUEBA LO DECODIFICADO: las dimensiones tienen que coincidir con las
// que declara el contenedor. Es la comprobación que habría atrapado el mapa de
// ganancia —tiene otro tamaño que la foto— antes de que reemplazara al
// original. Decodificar sin mirar lo que salió fue el error de fondo.

let _sharp = null;
const getSharp = async () => {
    if (!_sharp) {
        const mod = await import('sharp');
        _sharp = mod.default || mod;
    }
    return _sharp;
};

// ─── Criterio PURO (probable sin ffmpeg, sin sharp y sin red) ────────────────

/** Extensiones de la familia HEIF que un teléfono produce. */
export const HEIC_EXTENSIONS = ['.heic', '.heif', '.hif'];

/** Tipos MIME de la familia HEIF. */
export const HEIC_MIME_TYPES = [
    'image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence',
];

/**
 * ¿Es un archivo que el navegador no va a poder dibujar?
 *
 * Mira el MIME **y** la extensión, y basta con que uno de los dos lo diga. No
 * es cinturón y tirantes: al elegir un `.heic`, varios navegadores mandan el
 * tipo vacío —no lo conocen—, y algunos clientes de escritorio mandan
 * `application/octet-stream`. Fiarse sólo del MIME dejaría pasar justamente el
 * caso del iPhone, que es el que hay que resolver.
 */
export function isHeicFile({ filename, mimetype } = {}) {
    const mime = String(mimetype || '').toLowerCase().split(';')[0].trim();
    if (HEIC_MIME_TYPES.includes(mime)) return true;
    const name = String(filename || '').toLowerCase();
    return HEIC_EXTENSIONS.some(ext => name.endsWith(ext));
}

/** El nombre que llevará el archivo convertido: mismo nombre, extensión .jpg. */
export function jpegNameFor(filename) {
    const name = String(filename || 'imagen');
    const withoutExt = name.replace(/\.(heic|heif|hif)$/i, '');
    return `${withoutExt || 'imagen'}.jpg`;
}

/** La clave de S3 del archivo convertido, al lado del original. */
export function jpegKeyFor(s3Key) {
    if (!s3Key) return null;
    return String(s3Key).replace(/\.(heic|heif|hif)$/i, '') + '.jpg';
}

/**
 * Traduce la orientación EXIF (1-8) a las operaciones que hay que APLICAR.
 *
 * Por qué se aplica y no se declara: FFmpeg entrega los píxeles sin los metadatos
 * del contenedor, así que la rotación se pierde. Se podría volver a ETIQUETAR el
 * JPEG y dejar que cada visor la interprete, pero entonces una foto vertical se
 * vería acostada en cualquier consumidor que no lea EXIF —y esta plataforma
 * dibuja imágenes en canvas en varios sitios (Generador de Pendones, Plantillas
 * IA), donde el comportamiento no es uniforme—. Se hornea una sola vez, acá.
 *
 * El orden es ESPEJAR y DESPUÉS ROTAR. Con el orden inverso, las cuatro
 * orientaciones espejadas (2, 4, 5, 7) salen invertidas. Lo comprueba
 * `test:heic` contra la rotación automática de sharp, que es la implementación
 * de referencia.
 */
export function orientationOps(orientation) {
    const n = Number(orientation);
    switch (n) {
        case 2: return { flop: true, rotate: 0 };
        case 3: return { flop: false, rotate: 180 };
        case 4: return { flop: true, rotate: 180 };
        // 5 y 7 son las transpuestas, y son las que se escriben mal si uno las
        // deduce en vez de medirlas: al espejar PRIMERO, la rotación que les
        // toca es la contraria a la de su pareja no espejada (5 lleva 270 y no
        // 90; 7 lleva 90 y no 270). Comprobado contra la rotación automática de
        // sharp en `test:heic`.
        case 5: return { flop: true, rotate: 270 };
        case 6: return { flop: false, rotate: 90 };
        case 7: return { flop: true, rotate: 90 };
        case 8: return { flop: false, rotate: 270 };
        // 1 es «ya está derecha». Cualquier otra cosa —0, undefined, un valor
        // fuera de rango— se trata igual: no se inventa una rotación.
        default: return { flop: false, rotate: 0 };
    }
}

// ─── Conversión ──────────────────────────────────────────────────────────────

/** Calidad del JPEG resultante. Alta: esto sustituye al original en la ficha. */
const JPEG_QUALITY = 90;

let _decodeHeic = null;
const getDecoder = async () => {
    if (!_decodeHeic) {
        const mod = await import('heic-decode');
        _decodeHeic = mod.default || mod;
    }
    return _decodeHeic;
};

/**
 * De todas las imágenes que hay dentro del archivo, ¿cuál es la foto?
 *
 * Un HEIC lleva varias: la foto, la miniatura y —en un iPhone— el mapa de
 * ganancia HDR. `heic-decode` devuelve la lista y toma la PRIMERA, que suele
 * ser la primaria pero no lo garantiza; es la misma clase de suposición que
 * hacía ffmpeg cuando eligió el mapa de ganancia y llenó la Librería de
 * imágenes negras.
 *
 * Acá se elige por TAMAÑO: la que coincide con lo que declara el contenedor.
 * Se admite el intercambio ancho/alto porque el decodificador puede haber
 * aplicado ya la rotación. Sin dimensiones del contenedor no hay con qué
 * decidir y se toma la primera, que es lo que se hacía antes.
 *
 * PURA: recibe medidas, devuelve un índice. Devuelve -1 si ninguna encaja.
 */
export function pickPrimaryImage(container, images) {
    const list = Array.isArray(images) ? images : [];
    if (!list.length) return -1;

    const cw = Number(container?.width) || 0;
    const ch = Number(container?.height) || 0;
    if (!cw || !ch) return 0;

    const exact = list.findIndex(i => Number(i?.width) === cw && Number(i?.height) === ch);
    if (exact !== -1) return exact;

    const swapped = list.findIndex(i => Number(i?.width) === ch && Number(i?.height) === cw);
    if (swapped !== -1) return swapped;

    return -1;
}

/**
 * ¿Lo que se decodificó es la foto, o alguna de las imágenes auxiliares?
 *
 * Un HEIC de iPhone lleva dentro la foto, una miniatura y el mapa de ganancia
 * HDR. Las tres son «imágenes» del archivo y ninguna librería avisa si se
 * entrega la equivocada: lo que se ve es una imagen en escala de grises, casi
 * negra, que reemplazó a la foto. Pasó en producción (v4.739-v4.740).
 *
 * El contraste es contra las dimensiones que declara el CONTENEDOR, que sharp
 * sabe leer aunque no sepa decodificar los píxeles. La foto tiene esas
 * dimensiones y las auxiliares no. Se admite el intercambio ancho/alto porque
 * el decodificador puede haber aplicado ya la rotación del contenedor.
 *
 * PURA: recibe los dos tamaños y contesta. Devuelve `{ ok, swapped, error }`.
 */
export function checkDecodedSize(container, decoded) {
    const cw = Number(container?.width) || 0;
    const ch = Number(container?.height) || 0;
    const dw = Number(decoded?.width) || 0;
    const dh = Number(decoded?.height) || 0;

    if (!dw || !dh) return { ok: false, swapped: false, error: 'La imagen decodificada no tiene tamaño.' };
    // Sin dimensiones del contenedor no hay contra qué contrastar. No se
    // inventa un veredicto: se acepta y quien mire el resultado decide.
    if (!cw || !ch) return { ok: true, swapped: false, error: null };

    if (dw === cw && dh === ch) return { ok: true, swapped: false, error: null };
    if (dw === ch && dh === cw) return { ok: true, swapped: true, error: null };

    return {
        ok: false,
        swapped: false,
        error: `Lo decodificado mide ${dw}×${dh} y el archivo declara ${cw}×${ch}: `
            + 'no es la imagen principal (puede ser la miniatura o el mapa de ganancia HDR).',
    };
}

/**
 * Convierte un HEIC/HEIF a JPEG. Devuelve `{ buffer, width, height, orientation }`.
 *
 * Lanza si no se pudo, y también si lo que salió no supera la comprobación de
 * tamaño. Quien llama decide qué hacer con eso — en la subida se guarda el
 * original sin convertir y se avisa, porque perder el archivo sería peor que no
 * poder mostrarlo.
 */
export async function convertHeicToJpeg(input, { maxDimension = 4096 } = {}) {
    const sharp = await getSharp();
    const decodeHeic = await getDecoder();

    // El contenedor se lee con sharp: sabe hacerlo aunque no sepa decodificar
    // los píxeles. De acá salen la orientación y el tamaño con el que después
    // se contrasta lo decodificado.
    let container = { width: 0, height: 0, orientation: 1 };
    try {
        const meta = await sharp(input).metadata();
        container = { width: meta.width || 0, height: meta.height || 0, orientation: meta.orientation || 1 };
    } catch {
        // Sin contenedor legible se sigue: la comprobación de tamaño se salta
        // sola y la orientación se asume derecha. Rotar a ciegas sería peor.
    }

    // `.all()` da la LISTA de imágenes del archivo con sus medidas, sin
    // decodificar ninguna: elegir por tamaño no cuesta trabajo de más.
    const source = Buffer.isBuffer(input) ? input : Buffer.from(input);
    const images = await decodeHeic.all({ buffer: source });
    let decoded;
    try {
        const index = pickPrimaryImage(container, images);
        if (index === -1) {
            const sizes = images.map(i => `${i.width}×${i.height}`).join(', ');
            throw new Error(
                `Ninguna de las imágenes del archivo (${sizes}) coincide con lo que declara `
                + `(${container.width}×${container.height}). No se puede saber cuál es la foto.`
            );
        }
        const chosen = images[index];
        decoded = { width: chosen.width, height: chosen.height, data: (await chosen.decode()).data };
    } finally {
        images.dispose?.();
    }

    const verdict = checkDecodedSize(container, decoded);
    if (!verdict.ok) throw new Error(verdict.error);

    let pipeline = sharp(Buffer.from(decoded.data), {
        raw: { width: decoded.width, height: decoded.height, channels: 4 },
    });

    // La orientación se aplica sólo si el decodificador NO la aplicó ya. Que
    // las dimensiones vengan intercambiadas respecto del contenedor significa
    // que sí lo hizo, y rotar otra vez dejaría la foto acostada.
    const { flop, rotate } = verdict.swapped ? { flop: false, rotate: 0 } : orientationOps(container.orientation);
    if (flop) pipeline = pipeline.flop();
    if (rotate) pipeline = pipeline.rotate(rotate);

    if (Math.max(decoded.width, decoded.height) > maxDimension) {
        pipeline = pipeline.resize({
            width: maxDimension, height: maxDimension,
            fit: 'inside', withoutEnlargement: true,
        });
    }

    const buffer = await pipeline.jpeg({ quality: JPEG_QUALITY, mozjpeg: true }).toBuffer();
    const final = await sharp(buffer).metadata();
    return { buffer, width: final.width, height: final.height, orientation: container.orientation };
}

export default { isHeicFile, jpegNameFor, jpegKeyFor, orientationOps, checkDecodedSize, convertHeicToJpeg };
