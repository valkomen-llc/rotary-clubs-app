// ════════════════════════════════════════════════════════════════════
// Miniaturas de la Biblioteca Multimedia
// v4.786.0
//
// POR QUÉ EXISTE. Hasta v4.785 la Biblioteca no tenía miniaturas: cada tarjeta
// de la rejilla cargaba EL ARCHIVO ORIGINAL (`item.url`, la foto completa de
// 2-8 MB) para pintarse a 200 px. Pintar la primera pantalla del selector eran
// ~60 tarjetas × ~3 MB ≈ 180 MB de descarga — las tarjetas aparecían vacías y
// se llenaban de a una, que es exactamente como se reportó. El lazy loading y
// la ventana de 60 ya existían y no podían arreglarlo: el problema no era
// cuándo se descargaba cada imagen sino CUÁNTO pesaba.
//
// QUÉ HACE. Una variante WebP de ~400 px por imagen, subida a S3 junto al
// original y guardada en `Media."thumbUrl"`. La rejilla pinta `thumbUrl || url`
// — una fila sin miniatura se ve como siempre, así que el despliegue no rompe
// nada y el backfill puede avanzar a su ritmo.
//
// El CRITERIO (qué se miniaturiza, con qué clave, a qué tamaño) vive acá y es
// puro; la I/O de S3 la hace quien llama, que ya tiene sus credenciales.
// ════════════════════════════════════════════════════════════════════

// 400 px de lado mayor: el doble de los ~200 px a los que se pinta la tarjeta,
// para que se vea nítida en pantallas de alta densidad. WebP con calidad 78
// deja una foto típica en 15-40 KB — unas 100 veces menos que el original.
export const THUMB_MAX_DIMENSION = 400;
export const THUMB_QUALITY = 78;

/**
 * Si a este archivo le corresponde miniatura.
 *
 * Sólo imágenes rasterizadas que sharp pueda decodificar:
 *   · un SVG pesa poco y escala solo — miniaturizarlo sería rasterizar algo
 *     que el navegador ya pinta perfecto y liviano;
 *   · un GIF puede ser animado y la miniatura congelaría la animación sin
 *     avisar; además suele ser pequeño;
 *   · un HEIC no lo decodifica sharp (sin HEVC, v4.739) — su camino es la
 *     CONVERSIÓN a JPEG, que ya existe, y el JPEG resultante sí pasa por acá;
 *   · videos y documentos no son imágenes.
 */
export const shouldThumbnail = ({ type = null, filename = '', mimetype = '' } = {}) => {
    if (type && type !== 'image') return false;
    const name = String(filename || '').toLowerCase();
    const mime = String(mimetype || '').toLowerCase();
    if (mime.includes('svg') || name.endsWith('.svg')) return false;
    if (mime.includes('gif') || name.endsWith('.gif')) return false;
    if (mime.includes('heic') || mime.includes('heif')) return false;
    if (name.endsWith('.heic') || name.endsWith('.heif')) return false;
    // Sin tipo declarado, se decide por la extensión: es el mismo criterio
    // doble (MIME y extensión) que la detección de HEIC, y por el mismo motivo
    // — varios navegadores mandan el MIME vacío.
    if (!type && !mime.startsWith('image/')) {
        return /\.(jpe?g|png|webp|avif|tiff?|bmp)$/i.test(name);
    }
    return true;
};

/**
 * La clave S3 de la miniatura, derivada de la del original.
 *
 * Vive en una carpeta hermana `thumbs/` para poder vaciarla o regenerarla con
 * una regla de ciclo de vida sin tocar los originales — mismo criterio que
 * `public-tmp/` en el portal de plantillas. La extensión SIEMPRE es `.webp`
 * porque el contenido siempre lo es, venga de donde venga el original.
 */
export const thumbKeyFor = (s3Key) => {
    const key = String(s3Key || '').replace(/^\/+/, '');
    if (!key) return null;
    const slash = key.lastIndexOf('/');
    const dir = slash === -1 ? '' : key.slice(0, slash + 1);
    const base = (slash === -1 ? key : key.slice(slash + 1)).replace(/\.[^.]+$/, '');
    return `${dir}thumbs/${base}.webp`;
};

/**
 * Genera el buffer WebP de la miniatura.
 *
 * `withoutEnlargement`: una imagen ya menor de 400 px no se agranda — agrandar
 * no añade información y pesa más. `rotate()` sin argumentos aplica la
 * orientación EXIF, como en todo el sitio (v4.721): sin eso una foto de móvil
 * entra acostada a la rejilla.
 *
 * LANZA si el formato no se puede decodificar; quien llama decide qué hacer —
 * en la subida se sigue sin miniatura, que es exactamente lo que había antes.
 */
export const generateThumbBuffer = async (buffer) => {
    const sharp = (await import('sharp')).default;
    return sharp(buffer, { failOn: 'none' })
        .rotate()
        .resize({
            width: THUMB_MAX_DIMENSION,
            height: THUMB_MAX_DIMENSION,
            fit: 'inside',
            withoutEnlargement: true
        })
        .webp({ quality: THUMB_QUALITY })
        .toBuffer();
};
