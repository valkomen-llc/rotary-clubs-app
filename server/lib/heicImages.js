// HEIC/HEIF → JPEG. Lo que hace que una foto de iPhone se vea en la Librería.
//
// EL PROBLEMA: HEIC es el formato con el que un iPhone guarda las fotos por
// omisión. Ningún navegador salvo Safari lo dibuja en un `<img>`, así que en la
// Librería de Medios —y en el sitio publicado, y en el selector de imágenes—
// una foto subida desde un iPhone aparecía rota. No era un fallo de la
// Librería: es que el archivo no se puede mostrar en la web.
//
// POR QUÉ FFMPEG Y NO SHARP: sharp declara el formato `heif` y LEE el
// contenedor —da ancho, alto y orientación—, pero sus binarios precompilados
// no traen el decodificador HEVC, que es con el que un iPhone comprime. Medido
// con seis archivos HEIC reales: `sharp(file).metadata()` responde bien y
// `.jpeg()` falla en todos. FFmpeg sí lo decodifica, ya viaja con la
// aplicación desde v4.664 (`ffmpeg-static`, ver el Creador de Reels) y no suma
// un byte al paquete.
//
// EL REPARTO: FFmpeg DECODIFICA a PNG —sin pérdida, para no encadenar dos
// compresiones con pérdida— y sharp CODIFICA el JPEG y aplica la orientación.
import { spawn } from 'child_process';
import { mkdtemp, writeFile, readFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';

let _ffmpegPath = null;
const ffmpegBin = async () => {
    if (_ffmpegPath) return _ffmpegPath;
    if (process.env.FFMPEG_PATH) return (_ffmpegPath = process.env.FFMPEG_PATH);
    const mod = await import('ffmpeg-static');
    _ffmpegPath = mod.default || mod;
    return _ffmpegPath;
};

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

/** Calidad del JPEG resultante. Alta: esto reemplaza al original. */
const JPEG_QUALITY = 90;

/** Tope de espera de FFmpeg. Una foto tarda 1-3 s; más que esto es que algo colgó. */
const FFMPEG_TIMEOUT_MS = 60_000;

const runFfmpeg = async (args) => {
    const bin = await ffmpegBin();
    return new Promise((resolve, reject) => {
        // `stdout` se DESCARTA en el descriptor, no se abre como tubería: con
        // `pipe` y nadie leyendo, el búfer del sistema se llena y ffmpeg queda
        // bloqueado escribiendo. No falla, se cuelga. Misma regla que el
        // Creador de Reels.
        const proc = spawn(bin, args, { stdio: ['ignore', 'ignore', 'pipe'] });
        let stderr = '';
        proc.stderr.on('data', d => { stderr += d.toString(); if (stderr.length > 8000) stderr = stderr.slice(-8000); });
        const timer = setTimeout(() => { proc.kill('SIGKILL'); reject(new Error('La conversión tardó demasiado.')); }, FFMPEG_TIMEOUT_MS);
        proc.on('error', (err) => { clearTimeout(timer); reject(err); });
        proc.on('close', (code) => {
            clearTimeout(timer);
            if (code === 0) return resolve();
            reject(new Error(`ffmpeg salió con código ${code}: ${stderr.slice(-400)}`));
        });
    });
};

/**
 * Convierte un HEIC/HEIF a JPEG. Devuelve `{ buffer, width, height, orientation }`.
 *
 * Lanza si no se pudo. Quien llama decide qué hacer con eso — en la subida se
 * guarda el original sin convertir y se avisa, porque perder el archivo sería
 * peor que no poder mostrarlo.
 */
export async function convertHeicToJpeg(input, { maxDimension = 4096 } = {}) {
    const sharp = await getSharp();

    // La orientación se lee del CONTENEDOR con sharp, que sí sabe leerlo aunque
    // no sepa decodificar los píxeles. Es el dato que ffmpeg no nos va a dar.
    let orientation = 1;
    try {
        const meta = await sharp(input).metadata();
        orientation = meta.orientation || 1;
    } catch {
        // Sin orientación legible se asume derecha: rotar a ciegas sería peor.
    }

    // Carpeta temporal propia por operación. FFmpeg necesita un ARCHIVO: el
    // demuxer de MP4/HEIF salta por el contenedor y no puede leer de una
    // tubería —comprobado: «partial file»—.
    const dir = await mkdtemp(path.join(tmpdir(), 'heic-'));
    try {
        const src = path.join(dir, 'source.heic');
        const out = path.join(dir, 'decoded.png');
        await writeFile(src, input);

        // PNG intermedio, sin pérdida: encadenar el JPEG de ffmpeg con el
        // nuestro comprimiría dos veces la misma foto.
        //
        // `-noautorotate` a propósito: la rotación se aplica UNA sola vez, más
        // abajo y con la orientación del contenedor. Dejar que ffmpeg rote
        // además daría una foto girada dos veces.
        await runFfmpeg(['-y', '-hide_banner', '-loglevel', 'error', '-noautorotate',
            '-i', src, '-frames:v', '1', '-update', '1', out]);

        const decoded = await readFile(out);
        const { flop, rotate } = orientationOps(orientation);

        let pipeline = sharp(decoded, { failOn: 'none' });
        if (flop) pipeline = pipeline.flop();
        if (rotate) pipeline = pipeline.rotate(rotate);

        const meta = await sharp(decoded).metadata();
        if (Math.max(meta.width || 0, meta.height || 0) > maxDimension) {
            pipeline = pipeline.resize({
                width: maxDimension, height: maxDimension,
                fit: 'inside', withoutEnlargement: true,
            });
        }

        const buffer = await pipeline.jpeg({ quality: JPEG_QUALITY, mozjpeg: true }).toBuffer();
        const final = await sharp(buffer).metadata();
        return { buffer, width: final.width, height: final.height, orientation };
    } finally {
        // `/tmp` no se vacía solo entre invocaciones de una función serverless.
        await rm(dir, { recursive: true, force: true }).catch(() => { });
    }
}

export default { isHeicFile, jpegNameFor, jpegKeyFor, orientationOps, convertHeicToJpeg };
