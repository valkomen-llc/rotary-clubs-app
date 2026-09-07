// ════════════════════════════════════════════════════════════════════════════
// La carpeta de una solicitud — la I/O — v4.1004
//
// Resuelve (crea u obtiene) «Solicitudes de contenido › [la solicitud]» dentro
// del espacio multimedia del SITIO y devuelve su id. Es lo único que ata el
// material de una solicitud a un lugar de la Biblioteca, y por eso vive aparte
// del criterio (`submissionFolderSpec.js`), que es puro y se prueba solo.
//
// ⚠️ NO ES UNA SEGUNDA BIBLIOTECA NI UN SEGUNDO REGISTRO DE ARCHIVOS. Las
// carpetas son las de siempre (`MediaFolder`) y los archivos las de siempre
// (`Media."folderId"`): lo único nuevo es QUIÉN las crea y con qué origen
// anotado. Escribir una estructura propia daría dos verdades sobre dónde está
// una foto, y se contradirían en cuanto alguien la moviera desde la Librería.
//
// ⚠️ NADA DE ESTO PUEDE TUMBAR UNA PROMOCIÓN. Toda función devuelve
// `{ ok, reason }` y NUNCA lanza: corre dentro del workflow del artículo, del
// cron y del botón del panel. Si la carpeta no se puede resolver, los archivos
// se promueven IGUAL —quedan en la raíz de la Biblioteca, que es exactamente
// donde quedaban antes de esta versión— y se anota el motivo. Perder el
// material por no poder ordenarlo sería cambiar un problema de orden por uno
// de contenido.
// ════════════════════════════════════════════════════════════════════════════
import db from './db.js';
import ensureMediaFolderSchema from './ensureMediaFolderSchema.js';
import { folderKey } from './mediaFolders.js';
import {
    SUBMISSION_ROOT_NAME, submissionFolderName, freeFolderName, checkDerivedName, folderPathLabel,
} from './submissionFolderSpec.js';

/** El `sourceId` de la carpeta raíz. Es una constante y no el id de nada:
 *  la raíz es UNA por sitio, y el índice único la garantiza. */
export const ROOT_SOURCE_ID = 'submissions';
export const ROOT_SOURCE_TYPE = 'submission_root';
export const SUBMISSION_SOURCE_TYPE = 'submission';

const str = (v, max = 200) => (v === null || v === undefined || v === '' ? null : String(v).trim().slice(0, max));

/** Las carpetas hermanas de un padre, dentro de un sitio. */
const siblingsOf = async (clubId, parentId) => {
    const { rows } = await db.query(
        `SELECT id, name FROM "MediaFolder"
          WHERE "clubId" IS NOT DISTINCT FROM $1 AND "parentId" IS NOT DISTINCT FROM $2`,
        [clubId, parentId]
    );
    return rows;
};

/** La carpeta de un origen, si ya existe. */
const findBySource = async (clubId, sourceType, sourceId) => {
    const { rows } = await db.query(
        `SELECT * FROM "MediaFolder"
          WHERE "clubId" IS NOT DISTINCT FROM $1 AND "sourceType" = $2 AND "sourceId" = $3
          LIMIT 1`,
        [clubId, sourceType, sourceId]
    );
    return rows[0] || null;
};

/**
 * Inserta una carpeta y, ante un choque de índice, VUELVE A LEER.
 *
 * Es la idempotencia de verdad: entre el SELECT y el INSERT caben dos vueltas
 * del cron, el sondeo del navegador y el webhook —los tres llaman al mismo
 * `advance`—, así que comprobar antes no alcanza. El que pierde la carrera lee
 * la fila del que ganó en vez de fallar. No se usa `ON CONFLICT` porque los
 * índices en juego son PARCIALES y tendría que repetir su predicado exacto o
 * la sentencia falla entera (v4.648).
 */
const insertOrRead = async ({ name, clubId, parentId, sourceType, sourceId, campaignId, createdBy }) => {
    try {
        const { rows } = await db.query(
            `INSERT INTO "MediaFolder" (id, name, "clubId", "parentId", "createdBy", "sourceType", "sourceId", "campaignId")
             VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7) RETURNING *`,
            [name, clubId, parentId, createdBy, sourceType, sourceId, campaignId]
        );
        return { row: rows[0], created: true };
    } catch (e) {
        if (e?.code !== '23505') throw e;
        const existente = await findBySource(clubId, sourceType, sourceId);
        if (existente) return { row: existente, created: false };
        // El choque fue por NOMBRE, no por origen: hay una carpeta hermana que
        // ya se llama así y no es de esta solicitud. Se ADOPTA sólo si no tiene
        // dueño; si lo tiene, quien llama libera el nombre y reintenta.
        const { rows } = await db.query(
            `SELECT * FROM "MediaFolder"
              WHERE "clubId" IS NOT DISTINCT FROM $1 AND "parentId" IS NOT DISTINCT FROM $2 AND LOWER(name) = LOWER($3)
              LIMIT 1`,
            [clubId, parentId, name]
        );
        const hermana = rows[0] || null;
        if (hermana && !hermana.sourceId) {
            const { rows: adoptadas } = await db.query(
                `UPDATE "MediaFolder" SET "sourceType" = $2, "sourceId" = $3, "campaignId" = COALESCE($4, "campaignId"), "updatedAt" = NOW()
                  WHERE id = $1 AND "sourceId" IS NULL RETURNING *`,
                [hermana.id, sourceType, sourceId, campaignId]
            );
            if (adoptadas[0]) return { row: adoptadas[0], created: false, adopted: true };
        }
        return { row: null, created: false, clash: true, sibling: hermana };
    }
};

/**
 * La carpeta raíz «Solicitudes de contenido» del sitio.
 *
 * Si ya hay una carpeta con ese nombre creada a mano, se ADOPTA en vez de
 * crear una segunda: dos carpetas iguales en la raíz no se distinguen y el
 * índice de nombres de la Biblioteca rechazaría la segunda de todos modos.
 * Adoptar no le cambia el nombre ni le mueve nada: sólo le anota de qué es.
 */
export async function ensureRootFolder({ clubId = null, createdBy = null } = {}) {
    const existente = await findBySource(clubId, ROOT_SOURCE_TYPE, ROOT_SOURCE_ID);
    if (existente) return { ok: true, folder: existente, created: false };
    const r = await insertOrRead({
        name: SUBMISSION_ROOT_NAME, clubId, parentId: null,
        sourceType: ROOT_SOURCE_TYPE, sourceId: ROOT_SOURCE_ID, campaignId: null, createdBy,
    });
    if (r.row) return { ok: true, folder: r.row, created: r.created, adopted: r.adopted || false };
    // Hay una carpeta «Solicitudes de contenido» que YA es de otra cosa. No se
    // le pisa el origen: se cuelga la de esta solicitud de la raíz de la
    // Biblioteca y se DICE, en vez de meterla dentro de algo que no es suyo.
    return { ok: false, reason: 'raiz_ocupada', detalle: `Ya hay una carpeta llamada «${SUBMISSION_ROOT_NAME}» con otro origen: las solicitudes quedan en la raíz de la Biblioteca.` };
}

/**
 * La carpeta de UNA solicitud: «Solicitudes de contenido › [su título]».
 *
 * Idempotente por `(clubId, sourceType, sourceId)`: llamarla diez veces
 * devuelve la misma fila. El nombre se deriva del título y se libera con el id
 * corto si otra hermana ya lo usa —estable entre reprocesos, así que no se
 * acumulan «(2)», «(3)»—.
 *
 * Si la raíz no se pudo resolver, la carpeta se crea igual COLGADA DE LA RAÍZ
 * de la Biblioteca: tener el material junto en una carpeta con el nombre de la
 * solicitud sigue siendo mejor que tenerlo suelto.
 */
export async function ensureSubmissionFolder({ submission, clubId = null, campaignId = null, createdBy = null }) {
    try {
        if (!submission?.id) return { ok: false, reason: 'sin_solicitud' };
        await ensureMediaFolderSchema();

        const yaEsta = await findBySource(clubId, SUBMISSION_SOURCE_TYPE, submission.id);
        if (yaEsta) {
            // La campaña se completa si faltaba (una carpeta de antes de que la
            // columna existiera). Nunca se PISA un valor ya escrito.
            if (campaignId && !yaEsta.campaignId) {
                await db.query(`UPDATE "MediaFolder" SET "campaignId" = $2, "updatedAt" = NOW() WHERE id = $1 AND "campaignId" IS NULL`, [yaEsta.id, campaignId]);
                yaEsta.campaignId = campaignId;
            }
            const raiz = yaEsta.parentId ? (await db.query(`SELECT * FROM "MediaFolder" WHERE id = $1`, [yaEsta.parentId])).rows[0] || null : null;
            return { ok: true, folder: yaEsta, root: raiz, created: false, path: folderPathLabel(raiz?.name || '', yaEsta.name) };
        }

        const raiz = await ensureRootFolder({ clubId, createdBy });
        const parentId = raiz.ok ? raiz.folder.id : null;
        const notas = raiz.ok ? [] : [raiz.detalle];

        const hermanas = await siblingsOf(clubId, parentId);
        const tomadas = new Set(hermanas.map(f => folderKey(f.name)));
        const base = submissionFolderName(submission);
        let nombre = freeFolderName(base, { taken: tomadas, id: submission.id });

        const juicio = checkDerivedName(nombre);
        if (!juicio.ok) return { ok: false, reason: 'nombre_invalido', detalle: juicio.error, notes: notas };
        nombre = juicio.name;

        let r = await insertOrRead({
            name: nombre, clubId, parentId,
            sourceType: SUBMISSION_SOURCE_TYPE, sourceId: submission.id, campaignId, createdBy,
        });
        if (!r.row && r.clash) {
            // La hermana homónima tiene dueño: se libera el nombre con el id
            // corto y se reintenta UNA vez. Un bucle acá sería peor que fallar.
            tomadas.add(folderKey(nombre));
            const otro = checkDerivedName(freeFolderName(base, { taken: tomadas, id: submission.id }));
            if (otro.ok) {
                r = await insertOrRead({
                    name: otro.name, clubId, parentId,
                    sourceType: SUBMISSION_SOURCE_TYPE, sourceId: submission.id, campaignId, createdBy,
                });
            }
        }
        if (!r.row) return { ok: false, reason: 'nombre_ocupado', detalle: `No se pudo crear la carpeta «${nombre}»: ya hay una con ese nombre.`, notes: notas };

        return {
            ok: true, folder: r.row, root: raiz.ok ? raiz.folder : null, created: r.created,
            path: folderPathLabel(raiz.ok ? raiz.folder.name : '', r.row.name), notes: notas,
        };
    } catch (e) {
        console.warn('[submissions] no pude resolver la carpeta:', e?.message);
        return { ok: false, reason: 'error', detalle: str(e?.message, 300) };
    }
}

/**
 * Mete en la carpeta los archivos de la solicitud que ya están en la
 * Biblioteca y todavía no tienen ninguna.
 *
 * Es lo que hace que esto valga también para lo VIEJO —una solicitud promovida
 * antes de v4.1004 tiene sus `Media` sin carpeta— y lo hace sin mover ni
 * copiar un solo byte: es un UPDATE de una columna.
 *
 * ⚠️ NO SE PISA UNA CARPETA YA ELEGIDA (`WHERE "folderId" IS NULL`). Si
 * alguien movió esa foto a otra carpeta desde la Librería, ésa es su decisión
 * y volver a traerla acá sería desobedecerla en cada sincronización.
 */
export async function fileFolderBackfill({ folderId, mediaIds = [] }) {
    const ids = [...new Set((Array.isArray(mediaIds) ? mediaIds : []).filter(Boolean))];
    if (!folderId || !ids.length) return { ok: true, moved: 0 };
    try {
        const { rowCount } = await db.query(
            `UPDATE "Media" SET "folderId" = $1 WHERE id = ANY($2) AND "folderId" IS NULL`,
            [folderId, ids]
        );
        return { ok: true, moved: rowCount || 0 };
    } catch (e) {
        console.warn('[submissions] no pude asignar la carpeta a los archivos:', e?.message);
        return { ok: false, reason: 'error', detalle: str(e?.message, 300), moved: 0 };
    }
}

/**
 * La ficha de la carpeta para la pantalla: id, nombre, ruta y cuántos archivos
 * tiene DE VERDAD (no los que el plan espera).
 *
 * DEGRADA a `null`: la pintan el editor de Noticias y la ficha de la solicitud,
 * y ninguna de las dos puede quedarse sin cargar porque falte una carpeta.
 */
export async function submissionFolderView({ clubId = null, submissionId }) {
    try {
        if (!submissionId) return null;
        await ensureMediaFolderSchema();
        const folder = await findBySource(clubId, SUBMISSION_SOURCE_TYPE, submissionId);
        if (!folder) return null;
        const [{ rows: cuenta }, { rows: padres }] = await Promise.all([
            db.query(`SELECT COUNT(*)::int AS n FROM "Media" WHERE "folderId" = $1`, [folder.id]),
            folder.parentId
                ? db.query(`SELECT id, name FROM "MediaFolder" WHERE id = $1`, [folder.parentId])
                : Promise.resolve({ rows: [] }),
        ]);
        const raiz = padres[0] || null;
        return {
            id: folder.id,
            name: folder.name,
            parentId: folder.parentId,
            rootName: raiz?.name || null,
            path: folderPathLabel(raiz?.name || '', folder.name),
            fileCount: cuenta[0]?.n || 0,
            // La dirección de la Librería parada en esa carpeta. Se compone acá
            // para que las dos pantallas que enlazan no la escriban a mano y se
            // separen en silencio (la lección de `inboxLink`, v4.999).
            libraryUrl: `/admin/media?folder=${encodeURIComponent(folder.id)}`,
        };
    } catch (e) {
        console.warn('[submissions] ficha de carpeta degradada:', e?.message);
        return null;
    }
}

/**
 * De vuelta: qué solicitud originó esta carpeta. Es la mitad que falta de la
 * trazabilidad —desde la Librería, «¿de dónde salió esto?»— y sale del origen
 * anotado, no de una búsqueda por nombre.
 */
export async function folderOrigin(folderId) {
    try {
        if (!folderId) return null;
        const { rows } = await db.query(
            `SELECT f."sourceType", f."sourceId", f."campaignId", s.title, s.club, s.status,
                    a.id AS "articleId", a."postId", a.status AS "articleStatus"
               FROM "MediaFolder" f
               LEFT JOIN "ContributionSubmission" s ON s.id = f."sourceId" AND f."sourceType" = $2
               LEFT JOIN "SubmissionArticle" a ON a."submissionId" = f."sourceId" AND f."sourceType" = $2
              WHERE f.id = $1`,
            [folderId, SUBMISSION_SOURCE_TYPE]
        );
        const r = rows[0];
        if (!r?.sourceId) return null;
        return {
            sourceType: r.sourceType,
            submissionId: r.sourceType === SUBMISSION_SOURCE_TYPE ? r.sourceId : null,
            campaignId: r.campaignId,
            submission: r.title || r.club ? { title: r.title, club: r.club, status: r.status } : null,
            article: r.articleId ? { id: r.articleId, postId: r.postId, status: r.articleStatus } : null,
        };
    } catch (e) {
        console.warn('[submissions] origen de carpeta degradado:', e?.message);
        return null;
    }
}

export default {
    ROOT_SOURCE_ID, ROOT_SOURCE_TYPE, SUBMISSION_SOURCE_TYPE,
    ensureRootFolder, ensureSubmissionFolder, fileFolderBackfill, submissionFolderView, folderOrigin,
};
