// ════════════════════════════════════════════════════════════════════════════
// La carpeta de una solicitud en la Biblioteca — el CRITERIO (v4.1004)
//
// PURO a propósito: sin base, sin S3, sin red. Cómo se llama la carpeta, cómo
// se resuelve un nombre repetido, qué se dice cuando una sincronización queda a
// medias y qué archivo falta — todo eso se decide acá, separado de la
// orquestación (`submissionMediaFolder.js`), por el mismo motivo que
// `mediaFolders.js` vive aparte de `server/routes/media.js`.
//
// ⚠️ EL NOMBRE NO ES LA LLAVE. La relación entre una solicitud y su carpeta se
// persiste por ID en las DOS puntas —`ContributionSubmission.mediaFolderId` y
// `MediaFolder.sourceType/sourceId`—, nunca comparando cadenas. Renombrar la
// carpeta desde la Biblioteca no puede romper el vínculo, y dos solicitudes con
// el mismo título tienen que poder convivir. El nombre es para que una persona
// la reconozca; el id es para que el código la encuentre.
// ════════════════════════════════════════════════════════════════════════════
import { MAX_NAME, normalizeFolderName, folderKey } from './mediaFolders.js';

/** La carpeta raíz donde cuelgan todas las solicitudes de un sitio. */
export const ROOT_FOLDER_NAME = 'Solicitudes de contenido';

/** Qué es esta carpeta, en `MediaFolder.sourceType`. Catálogo CERRADO. */
export const FOLDER_SOURCES = {
    root: 'submission_root',
    submission: 'content_submission',
};

/** Cuántos caracteres deja el sufijo de desempate («…(12)»). */
const SUFFIX_ROOM = 6;

/**
 * Limpia un texto libre para que sirva de nombre de carpeta.
 *
 * `/` y `\` no se RECHAZAN: se reemplazan por un guion. Un título de una
 * actividad puede llevarlos con toda legitimidad («entrega 2026/2027») y
 * rechazar la solicitud por eso sería dejarla sin carpeta por un carácter.
 * Los de control se quitan — rompen el JSON de la respuesta.
 */
export function sanitizeFolderText(raw) {
    // eslint-disable-next-line no-control-regex
    return normalizeFolderName(String(raw ?? '').replace(/[/\\]/g, '-').replace(/[\u0000-\u001f\u007f]/g, ' '));
}

/**
 * Recorta a `max` sin partir palabras.
 *
 * El ejemplo real del cliente —«Entrega mercados, medicamentos, ropa, entrega a
 * ayudas a cuerpo de bomberos Sevilla»— mide 82 caracteres y el tope de una
 * carpeta son 60 (`MAX_NAME`), así que el recorte NO es un caso raro: es el
 * caso normal. Cortar a la mitad de una palabra se lee como un error del
 * sistema; cortar por palabra entera se lee como un nombre corto.
 */
export function trimToWords(raw, max = MAX_NAME) {
    const text = sanitizeFolderText(raw);
    if (text.length <= max) return text;
    const corte = text.slice(0, max);
    const espacio = corte.lastIndexOf(' ');
    // Si la primera palabra ya no cabe, se corta duro: mejor un nombre feo que
    // ninguno. Con `espacio` muy temprano el nombre quedaría casi vacío.
    const base = espacio > max * 0.4 ? corte.slice(0, espacio) : corte;
    return base.replace(/[\s,;:.\-–—]+$/u, '').trim() || corte.trim();
}

/**
 * El nombre de la carpeta de una solicitud.
 *
 * Va de lo más descriptivo a lo más genérico y SIEMPRE devuelve algo: una
 * solicitud sin título ni descripción —que existe, el formulario no los exige
 * todos— tiene que tener carpeta igual. El último escalón lleva el id
 * recortado, que es lo único que no se repite nunca.
 */
export function submissionFolderName(submission = {}) {
    const candidatos = [
        submission.title,
        // La primera frase de la historia: un párrafo entero no es un nombre.
        String(submission.description || submission.story || '').split(/[.\n]/)[0],
        [submission.club, submission.activityDate].filter(Boolean).join(' — '),
        submission.senderName,
    ];
    for (const c of candidatos) {
        const nombre = trimToWords(c, MAX_NAME - SUFFIX_ROOM);
        if (nombre.length >= 3) return nombre;
    }
    const id = String(submission.id || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 8);
    return `Solicitud ${id || 'sin identificar'}`;
}

/**
 * Un nombre libre dentro de sus hermanas.
 *
 * `taken` son los nombres que ya existen en esa carpeta padre. La comparación
 * ignora la caja, igual que el índice único de la base (`LOWER(name)`): con una
 * comparación sensible a mayúsculas se elegiría un nombre «libre» que la base
 * rechaza, y el alta fallaría con un error del driver que no explica nada.
 */
export function freeFolderName(base, taken = []) {
    const usados = new Set((taken || []).map(folderKey));
    const limpio = trimToWords(base, MAX_NAME - SUFFIX_ROOM) || 'Solicitud';
    if (!usados.has(folderKey(limpio))) return limpio;
    for (let i = 2; i <= 99; i++) {
        const intento = `${limpio} (${i})`;
        if (!usados.has(folderKey(intento))) return intento;
    }
    // Con cien homónimas se deja de contar: el sufijo largo se va a los
    // milisegundos, que no se repiten dentro de la misma carpeta en la
    // práctica. Antes eso que devolver un nombre que la base va a rechazar.
    return trimToWords(`${limpio} ${Date.now().toString(36)}`, MAX_NAME);
}

/** La ruta que se le enseña a una persona: «Solicitudes de contenido / X». */
export function folderPathLabel(name, root = ROOT_FOLDER_NAME) {
    return `${root} / ${sanitizeFolderText(name) || '…'}`;
}

// ─── El desenlace de una sincronización ────────────────────────────────────

/**
 * Qué se le dice a quien acaba de sincronizar.
 *
 * ⚠️ UN ARCHIVO QUE FALLA NO CANCELA EL ARTÍCULO, y el mensaje tiene que
 * decirlo con números: «9 de 10 archivos sincronizados» le dice a alguien qué
 * pasó y qué le falta; «no se pudo sincronizar» lo manda a suponer que perdió
 * las diez. Es el requisito literal del pedido.
 *
 * Devuelve `{ tone, headline, detail, retryable }` — `tone` gobierna el color y
 * `retryable` si se ofrece el botón de reintentar los pendientes.
 */
export function describeSync({ total = 0, promoted = 0, already = 0, failed = 0 } = {}) {
    const enBiblioteca = Number(promoted) + Number(already);
    const t = Number(total);
    if (!t) {
        return { tone: 'neutral', headline: 'La solicitud no trae archivos.', detail: 'El artículo sale sin portada ni galería.', retryable: false };
    }
    if (failed > 0 && enBiblioteca === 0) {
        return {
            tone: 'error',
            headline: `Ningún archivo llegó a la Biblioteca (0 de ${t}).`,
            detail: 'El borrador se conserva: se puede reintentar sin regenerar el artículo.',
            retryable: true,
        };
    }
    if (failed > 0) {
        return {
            tone: 'warn',
            headline: `${enBiblioteca} de ${t} archivos sincronizados.`,
            detail: `${failed} quedó pendiente. Reintentar archivo pendiente.`,
            retryable: true,
        };
    }
    return {
        tone: 'ok',
        headline: `${enBiblioteca} de ${t} archivos sincronizados.`,
        detail: promoted ? 'Ya están en la Biblioteca, dentro de la carpeta de la solicitud.' : 'Ya estaban en la Biblioteca.',
        retryable: false,
    };
}

/** Los archivos que todavía no llegaron, con su motivo si lo hay. */
export function pendingFiles(files = []) {
    return (files || [])
        .filter(f => !f?.mediaId)
        .map(f => ({ id: f.id, filename: f.filename || 'archivo', error: f.promoteError || null }));
}

/**
 * ¿Qué hay que hacer con estos archivos? Es lo que hace la sincronización
 * barata de repetir: con todo promovido, correrla otra vez no copia nada.
 *
 * `promote` son los que todavía no tienen fila de `Media` —los únicos que
 * gastan una copia de S3— y `inLibrary` los que ya la tienen, que es lo que se
 * le pasa a `adoptFilesIntoFolder` para que caigan en su carpeta. Acomodar NO
 * copia nada: llena una columna vacía, así que se puede pedir siempre.
 */
export function syncPlan(files = []) {
    const lista = files || [];
    const promover = lista.filter(f => !f?.mediaId);
    const enBiblioteca = lista.filter(f => f?.mediaId);
    return {
        promote: promover.map(f => f.id),
        inLibrary: enBiblioteca.map(f => f.mediaId),
        nothingToPromote: promover.length === 0,
        total: lista.length,
    };
}
export default {
    ROOT_FOLDER_NAME, FOLDER_SOURCES, sanitizeFolderText, trimToWords,
    submissionFolderName, freeFolderName, folderPathLabel, describeSync,
    pendingFiles, syncPlan,
};
