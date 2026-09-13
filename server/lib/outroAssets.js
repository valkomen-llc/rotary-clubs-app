/**
 * Un outro GUARDADO, resuelto para quien pregunta (v4.1040)
 * =========================================================
 *
 * Hay DOS consumidores del mismo catálogo y hasta v4.1039 sólo uno sabía
 * resolverlo:
 *
 *   · la versión con outro de un video de la Biblioteca Multimedia
 *     (`libraryOutroController`, v4.1039), y
 *   · el outro de un Reel, que se elige desde la Biblioteca de Reels del
 *     Estudio de Contenido (`setReelOutro`, v4.1040).
 *
 * Con la resolución escrita dos veces, el día que cambie de dónde sale la
 * miniatura —o el alcance por sitio— una de las dos se queda atrás y el fallo
 * es MUDO: las dos siguen devolviendo un outro, y lo que se separa es cuál se
 * le ofrece a quién. Por eso vive acá y las dos lo importan.
 *
 * Reglas que sostiene:
 *
 * - EL AISLAMIENTO VA EN EL `WHERE`. Un administrador de sitio sólo alcanza
 *   los outros de SU sitio; el operador de la plataforma, cualquiera. Un
 *   outro ajeno responde «no existe»: confirmar que existe es la mitad de lo
 *   que hace falta para ir a buscarlo.
 *
 * - UN OUTRO SIN ARCHIVO NO SE PUEDE USAR. `videoUrl` es lo único que hace
 *   montable un outro; sin él no hay nada que enganchar y ofrecerlo sería un
 *   control que no lleva a ninguna parte.
 *
 * - LO DECLARADO ES UNA REFERENCIA, NO LA MEDIDA. `declared` viaja para poder
 *   pintar la ficha antes de tocar el archivo; quien monta vuelve a MEDIR el
 *   MP4 (`probeMp4`), y lo medido manda. Son dos cosas distintas y confundir-
 *   las es cómo se le pide a ffmpeg la pista de audio de un archivo mudo.
 */
import db from './db.js';
import { ensureOutroSchema } from './ensureOutroSchema.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * La fila de `OutroProject`, acotada al sitio de quien pregunta.
 * Devuelve `null` —nunca lanza— para un id mal formado, inexistente o ajeno.
 */
export const loadOutroProject = async (id, user) => {
    if (!UUID_RE.test(String(id || ''))) return null;
    await ensureOutroSchema();
    const operador = user?.role === 'administrator';
    const scoped = operador ? '' : ' AND "clubId" = $2';
    const params = operador ? [id] : [id, user?.clubId || null];
    const { rows } = await db.query(`SELECT * FROM "OutroProject" WHERE id = $1${scoped}`, params);
    return rows[0] || null;
};

/**
 * La forma con la que los dos módulos trabajan un outro elegido.
 *
 * La miniatura sale de lo que el outro ya guardó: la que dejó al entrar a la
 * Biblioteca, y si no, el fotograma de su imagen de origen. No se compone una
 * nueva — un outro sin miniatura se pinta sin ella, que es un hueco, no un
 * error.
 */
export const outroAssetFrom = (row) => ({
    id: row.id,
    mediaId: row.mediaId || null,
    url: row.videoUrl,
    title: row.title || 'Outro',
    posterUrl: row.config?.library?.thumbUrl || row.sourceImageUrl || null,
    declared: {
        durationSec: row.durationSec,
        width: row.width,
        height: row.height,
        hasAudio: row.hasAudio,
        sizeBytes: Number(row.sizeBytes) || 0
    }
});
