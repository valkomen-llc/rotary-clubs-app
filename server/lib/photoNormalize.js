/**
 * Normalización de una fotografía ANTES de que la consuma un motor
 * generativo, un compositor o una medición (v4.1029).
 *
 * ⚠️ LA CAUSA DEL DEFECTO REPORTADO —«fotografías rotadas 90° en el Reel»— es
 * que ninguna pieza del pipeline aplicaba la orientación EXIF. Un teléfono
 * guarda la foto vertical como un archivo APAISADO más una etiqueta
 * `Orientation: 6` que le dice al visor «girala 90° al mostrarla». El
 * navegador la gira; `sharp(...).metadata()` devuelve el ancho y el alto CRUDOS
 * —sin girar—; y los motores de imagen y de video de la pasarela reciben la
 * URL del archivo y leen los píxeles tal como están: acostados. Así que
 * `planExpansion` decidía «horizontal» sobre una foto que era vertical, la
 * adaptación al 9:16 se hacía sobre la geometría equivocada, y el clip salía
 * girado. Nada daba error: cada pieza hacía bien su parte sobre un dato mal
 * leído.
 *
 * Por qué apareció como una REGRESIÓN: las fotos subidas desde el panel pasan
 * por `compressImage` en el navegador, que dibuja en un canvas —y el canvas ya
 * aplica la orientación— y re-codifica sin EXIF. Las fotos de una Solicitud de
 * Contenido NO: llegan del teléfono con el EXIF intacto y se promueven a la
 * Biblioteca con `CopyObject`, byte a byte (v4.968). El módulo nunca vio una
 * foto con EXIF hasta que el flujo de solicitudes empezó a alimentarlo.
 *
 * Reglas:
 *
 *  - La orientación se resuelve UNA vez, físicamente, y el resultado no
 *    depende de ningún metadato: `rotate()` sin argumento aplica el EXIF y
 *    sharp descarta la etiqueta al re-codificar. Lo que sale de acá se puede
 *    mandar a cualquier motor sin que tenga que interpretar nada.
 *  - Se decide ANTES de gastar créditos. Es un paso de preparación, no una
 *    comprobación posterior: un clip girado ya costó una generación.
 *  - Una foto que ya está derecha NO se re-codifica (`changed: false`): no se
 *    pierde una generación de JPEG sin motivo. Sí se re-codifica lo que un
 *    motor no lee (TIFF, HEIF residual): un formato que la pasarela rechaza es
 *    una tarea que falla con un error del proveedor que no explica nada.
 *  - Nunca lanza: devuelve `{ ok:false, reason }` y el llamador decide si
 *    sigue con la original. Un fallo leyendo el EXIF no puede costar la
 *    escena entera.
 *  - El CRITERIO es puro (`needsOrientationFix`, `orientedDimensions`,
 *    `isUpright`) y la I/O recibe `sharp` inyectado: así se prueba con una
 *    foto sintética que lleve `Orientation: 6` y sin instalar nada más.
 *
 * Lo comparten el Creador de Reels (adaptación, animación y respaldo) y
 * cualquier otro módulo que mande una fotografía a un motor. Un segundo punto
 * de normalización se separaría de éste en silencio.
 */

/** Orientaciones EXIF que giran o espejan la imagen (2-8). 1 es «derecha». */
export const needsOrientationFix = (orientation) => {
    const o = Number(orientation);
    return Number.isInteger(o) && o >= 2 && o <= 8;
};

/** Las orientaciones 5-8 intercambian ancho y alto al aplicarse. */
export const swapsAxes = (orientation) => {
    const o = Number(orientation);
    return o >= 5 && o <= 8;
};

/** El tamaño que la fotografía TIENE una vez aplicada su orientación. Es lo
 *  que hay que usar para planificar cualquier adaptación de lienzo. */
export const orientedDimensions = ({ width, height, orientation = 1 } = {}) => {
    const w = Number(width) || 0;
    const h = Number(height) || 0;
    return swapsAxes(orientation) ? { width: h, height: w } : { width: w, height: h };
};

/** Tras normalizar, la imagen es «derecha» si no queda orientación pendiente
 *  y sus medidas coinciden con las orientadas del original. */
export const isUpright = ({ orientation = 1, width, height }, expected = null) => {
    if (needsOrientationFix(orientation)) return false;
    if (!expected) return true;
    return Number(width) === Number(expected.width) && Number(height) === Number(expected.height);
};

/** Formatos que un motor de imagen o de video lee tal cual. Lo demás se
 *  re-codifica aunque esté derecho. */
export const ENGINE_READABLE_FORMATS = ['jpeg', 'jpg', 'png', 'webp'];
export const isEngineReadable = (format) => ENGINE_READABLE_FORMATS.includes(String(format || '').toLowerCase());

/**
 * Normaliza el buffer de una fotografía.
 *
 * @returns {{ ok:boolean, buffer:Buffer, changed:boolean, orientation:number,
 *             width:number, height:number, format:string, contentType:string,
 *             extension:string, reason:string|null }}
 */
export const normalizePhoto = async (buffer, { sharp = null, quality = 92 } = {}) => {
    const fail = (reason) => ({
        ok: false, buffer, changed: false, orientation: 1,
        width: null, height: null, format: null, contentType: null, extension: null, reason
    });
    if (!buffer || !buffer.length) return fail('No hay imagen que normalizar.');
    let lib = sharp;
    try { if (!lib) lib = (await import('sharp')).default; }
    catch (e) { return fail(`sharp no está disponible: ${e.message}`); }

    let meta;
    try { meta = await lib(buffer, { failOn: 'none' }).metadata(); }
    catch (e) { return fail(`No se pudo leer la imagen: ${e.message}`); }
    if (!meta.width || !meta.height) return fail('La imagen no declara tamaño.');

    const orientation = Number(meta.orientation) || 1;
    const format = String(meta.format || '').toLowerCase();
    const expected = orientedDimensions({ width: meta.width, height: meta.height, orientation });
    const fix = needsOrientationFix(orientation);
    const reencode = !isEngineReadable(format);

    if (!fix && !reencode) {
        return {
            ok: true, buffer, changed: false, orientation: 1,
            width: meta.width, height: meta.height, format,
            contentType: format === 'png' ? 'image/png' : (format === 'webp' ? 'image/webp' : 'image/jpeg'),
            extension: format === 'png' ? 'png' : (format === 'webp' ? 'webp' : 'jpg'),
            reason: null
        };
    }

    try {
        // `rotate()` sin argumento aplica la orientación EXIF y deja la
        // etiqueta en 1. PNG conserva el alfa; todo lo demás sale JPEG.
        const keepPng = format === 'png';
        let pipeline = lib(buffer, { failOn: 'none' }).rotate();
        pipeline = keepPng ? pipeline.png() : pipeline.jpeg({ quality, mozjpeg: true });
        const out = await pipeline.toBuffer();
        const after = await lib(out, { failOn: 'none' }).metadata();
        const upright = isUpright({ orientation: after.orientation || 1, width: after.width, height: after.height }, expected);
        if (!upright) {
            return fail(`La normalización no dejó la imagen derecha (${after.width}x${after.height}, orientación ${after.orientation || 1}; se esperaba ${expected.width}x${expected.height}).`);
        }
        return {
            ok: true, buffer: out, changed: true, orientation: 1,
            width: after.width, height: after.height,
            format: keepPng ? 'png' : 'jpeg',
            contentType: keepPng ? 'image/png' : 'image/jpeg',
            extension: keepPng ? 'png' : 'jpg',
            reason: fix
                ? `Orientación EXIF ${orientation} aplicada físicamente (${meta.width}x${meta.height} → ${after.width}x${after.height}).`
                : `Formato ${format} re-codificado a ${keepPng ? 'PNG' : 'JPEG'} para que el motor lo lea.`
        };
    } catch (e) {
        return fail(`No se pudo normalizar la imagen: ${e.message}`);
    }
};
