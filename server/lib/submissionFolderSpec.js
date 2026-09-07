// ════════════════════════════════════════════════════════════════════════════
// La carpeta de una solicitud en la Biblioteca — el CRITERIO — v4.1004
//
// PURO a propósito: sin base, sin S3, sin red. Cómo se llama la carpeta raíz,
// cómo se deriva el nombre de la subcarpeta de una solicitud y qué cuenta como
// «esta carpeta es de esta solicitud» vive acá, separado de la orquestación
// (`submissionFolders.js`), por el mismo motivo que `mediaFolders.js` vive
// aparte de `routes/media.js`: un criterio que sólo se puede ejercitar contra
// una base real termina sin pruebas.
//
// ⚠️ LA RELACIÓN NO ES EL NOMBRE, Y ÉSA ES LA REGLA DE LA QUE CUELGA TODO.
// Dos solicitudes pueden llamarse igual, un título se corrige, y `MAX_NAME`
// recorta a 60 caracteres —el ejemplo real del Distrito mide 82—: buscar la
// carpeta por su nombre encontraría la de otra solicitud, o ninguna, y el
// fallo sería MUDO (una carpeta nueva por cada reproceso, con el material
// repartido entre ellas). La identidad es `(clubId, sourceType, sourceId)` y
// el nombre es sólo lo que se lee en la pantalla: se puede renombrar sin
// romper nada.
// ════════════════════════════════════════════════════════════════════════════
import { MAX_NAME, normalizeFolderName, validateFolderName } from './mediaFolders.js';

/** Qué clase de cosa originó una carpeta. Catálogo CERRADO: una carpeta con un
 *  origen que nadie declaró no se puede reportar ni resolver de vuelta. */
export const FOLDER_SOURCES = {
    submission_root: { id: 'submission_root', label: 'Solicitudes de contenido' },
    submission: { id: 'submission', label: 'Solicitud de contenido' },
};
export const isFolderSource = (id) => Object.prototype.hasOwnProperty.call(FOLDER_SOURCES, String(id || ''));

/**
 * El nombre de la carpeta raíz.
 *
 * Es una CONSTANTE del código y no un ajuste de la campaña a propósito: la
 * raíz la comparten todas las solicitudes de un sitio, así que dejarla
 * configurable daría dos sitios con dos nombres para lo mismo y ninguna forma
 * de decirle a alguien dónde mirar. Renombrarla a mano desde la Biblioteca
 * SIGUE funcionando —la identidad es el origen, no el nombre—, que es la
 * salida para quien la quiera llamar de otra forma.
 */
export const SUBMISSION_ROOT_NAME = 'Solicitudes de contenido';

/** Cuánto puede medir el nombre derivado. Es el tope de la Biblioteca: un
 *  nombre más largo lo rechaza `validateFolderName` y la carpeta no se crearía. */
export const FOLDER_NAME_MAX = MAX_NAME;

/**
 * Recorta a `max` SIN PARTIR PALABRAS y sin dejar el corte en un signo.
 *
 * Un nombre cortado a mitad de palabra —«…cuerpo de bombe»— se lee como un
 * error del sistema, que es exactamente lo que este módulo no puede producir
 * sobre una carpeta que el equipo va a ver todos los días. Si la primera
 * palabra ya se pasa, se corta seco: es la única salida.
 */
export function trimToWords(raw, max = FOLDER_NAME_MAX) {
    const value = normalizeFolderName(raw);
    if (value.length <= max) return value;
    const duro = value.slice(0, max);
    const corte = duro.lastIndexOf(' ');
    const base = corte > Math.floor(max * 0.4) ? duro.slice(0, corte) : duro;
    return base.replace(/[\s,;:.–—-]+$/u, '').trim() || duro.trim();
}

/**
 * Quita lo que la Biblioteca no admite en un nombre de carpeta.
 *
 * `/` y `\` se leen como separadores de ruta en cuanto alguien arma una migaja
 * de pan (`mediaFolders.js` los prohíbe por eso), y los de control rompen el
 * JSON de la respuesta. NO se quitan tildes ni ñ: los clubes escriben en
 * español y una carpeta llamada «Entrega de mercados en Sevilla» tiene que
 * decir eso.
 */
export function sanitizeFolderName(raw) {
    // eslint-disable-next-line no-control-regex
    const PROHIBIDOS = /[/\\\u0000-\u001f\u007f]/g;
    return normalizeFolderName(String(raw ?? '').replace(PROHIBIDOS, ' '));
}

/**
 * El nombre de la subcarpeta de una solicitud.
 *
 * Sale del TÍTULO, que es lo que quien envió el material escribió para
 * describir su actividad y lo que el equipo reconoce. Sin título se cae al
 * club y a la fecha —«Rotary Sevilla · 2026-08-14»—, que identifica sin
 * inventar nada; y sin ninguno de los dos, al id corto, que es feo y es cierto.
 *
 * Nunca devuelve vacío: una carpeta sin nombre no se puede crear.
 */
export function submissionFolderName(submission = {}) {
    const titulo = sanitizeFolderName(submission.title);
    if (titulo) return trimToWords(titulo);

    const club = sanitizeFolderName(submission.club || submission.participatingClubs);
    const fecha = String(submission.activityDate || submission.createdAt || '').slice(0, 10);
    const compuesto = [club, /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : ''].filter(Boolean).join(' · ');
    if (compuesto) return trimToWords(compuesto);

    const corto = String(submission.id || '').slice(0, 8);
    return corto ? `Solicitud ${corto}` : 'Solicitud sin título';
}

/**
 * Libera el nombre cuando ya hay una carpeta hermana llamada igual.
 *
 * Dos solicitudes con el mismo título son normales —«Entrega de mercados» se
 * repite cada mes— y el índice único de la Biblioteca las rechazaría. El
 * sufijo va con el id corto y no con un contador: es estable entre reprocesos,
 * así que la misma solicitud recibe siempre el mismo nombre y no se acumulan
 * «(2)», «(3)» con cada intento.
 *
 * `taken` es el conjunto de claves (`folderKey`) ya usadas entre las hermanas.
 */
export function freeFolderName(base, { taken = new Set(), id = '' } = {}) {
    const clave = (s) => normalizeFolderName(s).toLocaleLowerCase('es');
    const inicial = trimToWords(base || 'Solicitud');
    if (!taken.has(clave(inicial))) return inicial;

    const corto = String(id || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 6);
    if (corto) {
        const sufijo = ` · ${corto}`;
        const conSufijo = `${trimToWords(inicial, Math.max(8, FOLDER_NAME_MAX - sufijo.length))}${sufijo}`;
        if (!taken.has(clave(conSufijo))) return conSufijo;
    }
    // Último recurso: un contador. No debería llegar acá —el id corto es único
    // en la práctica— pero devolver un nombre que ya existe haría fallar el
    // INSERT con un error del driver que no explica nada.
    for (let n = 2; n <= 99; n += 1) {
        const sufijo = ` (${n})`;
        const candidato = `${trimToWords(inicial, Math.max(8, FOLDER_NAME_MAX - sufijo.length))}${sufijo}`;
        if (!taken.has(clave(candidato))) return candidato;
    }
    return inicial;
}

/**
 * ¿Este nombre derivado se puede guardar tal cual?
 *
 * Es la MISMA puerta que la Biblioteca aplica a un nombre escrito a mano
 * (`validateFolderName`): con dos criterios, el workflow podría crear una
 * carpeta que la pantalla después no deja renombrar. Se comprueba acá para
 * fallar con el motivo escrito en vez de con el error del índice.
 */
export function checkDerivedName(raw) {
    return validateFolderName(raw);
}

/** La migaja de pan que se le muestra a una persona: «Solicitudes de contenido
 *  › Entrega de mercados». Se compone, no se guarda: guardarla sería una
 *  segunda verdad que se contradice en cuanto alguien renombra la raíz. */
export function folderPathLabel(rootName, folderName) {
    return [normalizeFolderName(rootName), normalizeFolderName(folderName)].filter(Boolean).join(' › ');
}

export default {
    FOLDER_SOURCES, isFolderSource, SUBMISSION_ROOT_NAME, FOLDER_NAME_MAX,
    trimToWords, sanitizeFolderName, submissionFolderName, freeFolderName,
    checkDerivedName, folderPathLabel,
};
