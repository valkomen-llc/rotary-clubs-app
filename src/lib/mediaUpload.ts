// ════════════════════════════════════════════════════════════════════
// Subida de archivos a la Biblioteca Multimedia — el camino compartido
// v4.784.0
//
// UN SOLO CAMINO PARA SUBIR. La regla de v4.700 dice que toda casilla de imagen
// del panel ofrece las dos vías —subir un archivo nuevo o elegir uno ya
// cargado—, y esa regla no se puede cumplir en pantallas nuevas si el «subir»
// vive escrito a mano dentro de una de ellas.
//
// Hasta v4.783 la subida existía sólo en `MediaLibrary.tsx`, con sus tres pasos
// y su manejo de HEIC escritos ahí. Copiarla al Creador de Reels habría dado
// dos caminos hacia S3 que se separan en silencio — que es exactamente el
// problema que `sendCampaign` arrastra en el CRM y que este archivo existe para
// no repetir.
//
// ─── POR QUÉ TRES PASOS Y NO UNO ───────────────────────────────────────────
//
//   1. `GET /media/presigned-url` — se pide permiso para escribir en S3.
//   2. `PUT` directo a S3 — el archivo NO pasa por nuestra API.
//   3. `POST /media/save` — se registra la fila en `Media`.
//
// El paso 2 es lo que evita el tope de ~4,5 MB del cuerpo de una función en
// Vercel: una foto de móvil pesa 2-5 MB y mandarla por el cuerpo fallaría con
// las más grandes. Es el mismo motivo por el que `/save` existe además de
// `/upload`, y está documentado en la sección de HEIC de CLAUDE.md.
//
// El paso 3 es lo que hace que el archivo APAREZCA EN LA BIBLIOTECA. Sin él, el
// objeto quedaría en S3 sin fila: invisible en el panel e imposible de volver a
// elegir. Por eso subir y registrar no son dos operaciones separables.
// ════════════════════════════════════════════════════════════════════

import { compressImage } from '../utils/compressImage';
import { isHeicFile } from './heicImages';

const API = import.meta.env.VITE_API_URL || '/api';

/** Lo que devuelve una subida correcta: la fila de `Media` recién creada. */
export interface UploadedMedia {
    id: string;
    filename: string;
    url: string;
    type: 'image' | 'video' | 'document';
}

export interface UploadOptions {
    /** Sitio al que pertenece el archivo. Vacío = el del usuario. */
    clubId?: string | null;
    /** Carpeta de la Biblioteca donde cae. `null` = la raíz. */
    folderId?: string | null;
    /**
     * Tope del lado más largo. 4096 por defecto, igual que la Biblioteca: es
     * holgado para 4K y sigue evitando subir un archivo de 25 MB de cámara.
     */
    maxDimension?: number;
    /** Progreso, para poder mostrar «subiendo 2 de 5». */
    onProgress?: (done: number, total: number, currentName: string) => void;
}

export interface UploadResult {
    uploaded: UploadedMedia[];
    /** Los que fallaron, con su motivo. Se informan por nombre: «falló uno de
     *  cinco» sin decir cuál obliga a adivinar. */
    failed: { name: string; reason: string }[];
}

const authHeaders = (): Record<string, string> => ({
    Authorization: `Bearer ${localStorage.getItem('rotary_token')}`
});

/**
 * Sube un archivo y lo registra en la Biblioteca.
 *
 * Lanza si algo falla, para que quien llama decida: `uploadMediaFiles` lo
 * atrapa y sigue con los demás, porque en una tanda de cinco fotos que falle
 * una no es motivo para perder las otras cuatro.
 */
const uploadOne = async (file: File, opts: UploadOptions): Promise<UploadedMedia> => {
    // ── HEIC no pasa por `compressImage` ──
    //
    // Esa función dibuja en un canvas y NINGÚN navegador salvo Safari sabe
    // decodificar HEIC, así que la carga falla y devuelve el archivo intacto de
    // todos modos. Saltearlo ahorra el intento y deja claro, al leer el código,
    // que de este formato se encarga el servidor (v4.739-741).
    const heic = isHeicFile({ filename: file.name, mimetype: file.type });
    const processed = heic
        ? file
        : await compressImage(file, { maxDimension: opts.maxDimension ?? 4096, quality: 1.0 });

    const clubId = opts.clubId || '';

    // 1. Permiso para escribir en S3.
    const presignRes = await fetch(
        `${API}/media/presigned-url?fileName=${encodeURIComponent(processed.name)}` +
        `&fileType=${encodeURIComponent(processed.type)}&clubId=${encodeURIComponent(clubId)}`,
        { headers: authHeaders() }
    );
    if (!presignRes.ok) {
        throw new Error(`no se pudo preparar la subida (${presignRes.status})`);
    }
    const { uploadUrl, fileUrl, key } = await presignRes.json();

    // 2. Directo a S3, sin pasar por nuestra API.
    const s3Res = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': processed.type },
        body: processed
    });
    if (!s3Res.ok) throw new Error(`el almacenamiento rechazó el archivo (${s3Res.status})`);

    // 3. La fila en `Media`. Es lo que lo hace visible en la Biblioteca.
    const saveRes = await fetch(`${API}/media/save`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
            clubId,
            fileName: processed.name,
            fileUrl,
            s3Key: key,
            fileType: processed.type,
            fileSize: processed.size,
            folderId: opts.folderId ?? null
        })
    });
    if (!saveRes.ok) {
        // El objeto ya está en S3 pero sin fila. Se dice con esas palabras: el
        // archivo no se perdió, simplemente no aparece en la Biblioteca, y eso
        // se arregla volviendo a subirlo.
        throw new Error(`se subió pero no se pudo registrar en la Biblioteca (${saveRes.status})`);
    }

    const row = await saveRes.json();

    // ── SE USA LO QUE DEVUELVE EL SERVIDOR, NO LO QUE SE MANDÓ ──
    //
    // No es una preferencia de estilo: con un HEIC, `/media/save` lo BAJA de
    // S3, lo convierte a JPEG y guarda la fila con OTRO nombre y OTRA URL
    // (v4.739-741). Quedarse con `processed.name` y `fileUrl` daría una tarjeta
    // apuntando al `.heic` original, que ningún navegador salvo Safari dibuja:
    // el usuario subiría su foto y vería un recuadro roto.
    const uploaded: UploadedMedia = {
        id: row?.id || key,
        filename: row?.filename || processed.name,
        url: row?.url || fileUrl,
        type: row?.type || 'image'
    };

    // Una conversión de HEIC que no salió deja un archivo que el navegador no
    // puede dibujar. El servidor lo dice en `conversion.error`; callarlo aquí
    // dejaría al usuario con una foto invisible y sin motivo.
    if (row?.conversion?.from === 'heic' && !row.conversion.to) {
        throw new Error(
            `es un HEIC que no se pudo convertir (${row.conversion.error || 'motivo desconocido'}). ` +
            'Quedó guardado en la Biblioteca, pero hay que convertirlo desde ahí para poder usarlo.'
        );
    }

    return uploaded;
};

/**
 * Sube varios archivos, en serie.
 *
 * EN SERIE Y NO EN PARALELO a propósito: cada uno hace un PUT a S3 con el
 * archivo entero, y cinco fotos de móvil a la vez saturan la subida de una
 * conexión doméstica —que es desde donde se sube en una emergencia—. En serie
 * el progreso además es honesto: «3 de 5» significa que tres están arriba.
 *
 * NUNCA LANZA. Un archivo que falla se anota y se sigue con el siguiente: en
 * una tanda de cinco, perder las otras cuatro por una sería el intercambio
 * equivocado. Quien llama decide qué hacer con `failed`.
 */
export const uploadMediaFiles = async (
    files: File[],
    opts: UploadOptions = {}
): Promise<UploadResult> => {
    const uploaded: UploadedMedia[] = [];
    const failed: { name: string; reason: string }[] = [];

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        opts.onProgress?.(i, files.length, file.name);
        try {
            uploaded.push(await uploadOne(file, opts));
        } catch (e) {
            failed.push({ name: file.name, reason: e instanceof Error ? e.message : 'error desconocido' });
        }
    }
    opts.onProgress?.(files.length, files.length, '');

    return { uploaded, failed };
};

/**
 * Los tipos que acepta una casilla de imagen, para el `accept` del `<input>`.
 *
 * HEIC va incluido: es el formato por defecto del iPhone y el servidor lo
 * convierte a JPEG al subirlo (v4.739-741). Dejarlo fuera del `accept` haría
 * que el selector del sistema no mostrara las fotos del usuario, que es
 * exactamente el archivo que más se sube.
 */
export const IMAGE_ACCEPT = 'image/*,.heic,.heif';

/**
 * Lo que acepta una casilla de VIDEO. Se enumeran los contenedores además de
 * `video/*` porque el navegador manda el tipo vacío con algunos archivos y sin
 * la extensión el diálogo los dejaría fuera — el mismo motivo por el que
 * `IMAGE_ACCEPT` nombra `.heic` aparte.
 */
export const VIDEO_ACCEPT = 'video/*,.mp4,.webm,.mov,.ogv';
