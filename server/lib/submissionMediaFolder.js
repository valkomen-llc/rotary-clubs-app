// ════════════════════════════════════════════════════════════════════════════
// La carpeta de una solicitud — la I/O (v4.1004)
//
// «Solicitudes de contenido / [nombre de la solicitud]» dentro de la Biblioteca
// Multimedia del SITIO, con los archivos originales adentro. La orquestación
// vive acá; el criterio —cómo se llama, cómo se desempata, qué se dice cuando
// una sincronización queda a medias— vive en `submissionFolders.js`, que es
// puro y se prueba sin base.
//
// ⚠️ TRES INVARIANTES QUE SOSTIENEN EL MÓDULO
//
//   1. LA RELACIÓN ES POR ID, NUNCA POR NOMBRE. Se persiste en las dos puntas:
//      `ContributionSubmission.mediaFolderId` y `MediaFolder.sourceId`.
//      Renombrar la carpeta desde la Biblioteca es legítimo y no rompe nada.
//
//   2. ES IDEMPOTENTE. La carpeta se busca por id antes de crearse, y el
//      índice único parcial `MediaFolder_source_key` cierra la carrera: dos
//      vueltas simultáneas del cron no crean dos carpetas. Correr la
//      sincronización diez veces hace trabajo la primera.
//
//   3. LA CARPETA VIVE EN EL ESPACIO DEL TENANT. `clubId` es el sitio, el
//      mismo que ya decide dónde nace el Post y a qué prefijo de S3 se copia
//      el archivo. Una solicitud del Distrito 4281 no puede tocar la
//      Biblioteca de otro sitio porque su carpeta ni siquiera existe ahí.
// ════════════════════════════════════════════════════════════════════════════
import crypto from 'node:crypto';
import db from './db.js';
import { ensureMediaFolderSchema } from './ensureMediaFolderSchema.js';
import { ROOT_FOLDER_NAME, FOLDER_SOURCES, submissionFolderName, freeFolderName, folderPathLabel } from './submissionFolders.js';

const nuevoId = () => crypto.randomUUID();

/** Lee una carpeta por lo que ES, no por cómo se llama. */
async function bySource(sourceType, sourceId, clubId) {
    const { rows } = await db.query(
        `SELECT id, name, "parentId", "clubId" FROM "MediaFolder"
          WHERE "sourceType" = $1 AND "sourceId" = $2 AND "clubId" IS NOT DISTINCT FROM $3`,
        [sourceType, sourceId, clubId]
    );
    return rows[0] || null;
}

/**
 * Crea la carpeta o devuelve la que ya estaba.
 *
 * El `ON CONFLICT DO NOTHING` va A SECAS —sin nombrar columnas— porque los tres
 * índices únicos de `MediaFolder` son PARCIALES y apuntarlos por columnas
 * exigiría repetir su predicado o la sentencia falla entera (v4.648). A secas
 * cubre los tres: el de la fuente, el del nombre en la raíz y el del nombre
 * entre hermanas. Cuando no devuelve fila hay dos motivos posibles y se
 * distinguen: ya existía la carpeta de esta fuente (se relee) o el nombre está
 * ocupado por otra (se prueba el siguiente).
 */
async function createFolder({ name, parentId, clubId, sourceType, sourceId, createdBy }) {
    const { rows } = await db.query(
        `INSERT INTO "MediaFolder" (id, name, "clubId", "parentId", "createdBy", "sourceType", "sourceId")
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT DO NOTHING
         RETURNING id, name, "parentId", "clubId"`,
        [nuevoId(), name, clubId, parentId, createdBy || null, sourceType, sourceId]
    );
    return rows[0] || null;
}

/** Los nombres ya usados entre las hermanas de una carpeta. */
async function siblingNames(parentId, clubId) {
    const { rows } = await db.query(
        `SELECT name FROM "MediaFolder"
          WHERE "clubId" IS NOT DISTINCT FROM $1
            AND "parentId" IS NOT DISTINCT FROM $2`,
        [clubId, parentId]
    );
    return rows.map(r => r.name);
}

/**
 * La raíz «Solicitudes de contenido» del sitio.
 *
 * Su `sourceId` es el propio sitio (o la cadena `platform` cuando no hay uno):
 * así hay UNA raíz por sitio y se encuentra por id aunque alguien la renombre.
 * Si un sitio ya tiene una carpeta con ese nombre creada a mano, se ADOPTA en
 * vez de crear una segunda: dos carpetas homónimas serían indistinguibles para
 * quien las mira, y el índice de nombre además lo impediría.
 */
export async function ensureRootFolder(clubId, { createdBy = null } = {}) {
    await ensureMediaFolderSchema();
    const marca = clubId || 'platform';
    const existente = await bySource(FOLDER_SOURCES.root, marca, clubId);
    if (existente) return existente;

    // Adopción de una carpeta homónima creada a mano.
    const { rows: homonima } = await db.query(
        `SELECT id, name, "parentId", "clubId" FROM "MediaFolder"
          WHERE "clubId" IS NOT DISTINCT FROM $1 AND "parentId" IS NULL AND LOWER(name) = LOWER($2)`,
        [clubId, ROOT_FOLDER_NAME]
    );
    if (homonima[0]) {
        await db.query(
            `UPDATE "MediaFolder" SET "sourceType" = $2, "sourceId" = $3, "updatedAt" = NOW()
              WHERE id = $1 AND "sourceId" IS NULL`,
            [homonima[0].id, FOLDER_SOURCES.root, marca]
        );
        return homonima[0];
    }

    const creada = await createFolder({
        name: ROOT_FOLDER_NAME, parentId: null, clubId,
        sourceType: FOLDER_SOURCES.root, sourceId: marca, createdBy,
    });
    // Sin fila: otra vuelta ganó la carrera. Se relee por las dos vías.
    return creada || await bySource(FOLDER_SOURCES.root, marca, clubId) || homonima[0] || null;
}

/**
 * La carpeta de UNA solicitud, creándola si hace falta.
 *
 * Devuelve `{ ok, folder, root, path, created, reason }`. NUNCA lanza: esto
 * corre dentro del workflow del artículo y dentro del cron, y quedarse sin
 * carpeta no puede costar el borrador — la sincronización lo dice y sigue.
 */
export async function ensureSubmissionFolder({ submission, clubId = null, createdBy = null } = {}) {
    try {
        if (!submission?.id) return { ok: false, reason: 'sin_solicitud' };
        await ensureMediaFolderSchema();

        // 1. ¿Ya la tiene? Por id, en las dos puntas. La de la solicitud manda
        //    —es la que consultan las pantallas— y si apunta a una carpeta que
        //    ya no existe se vuelve a resolver en vez de quedar colgada.
        const yaEsta = await bySource(FOLDER_SOURCES.submission, submission.id, clubId);
        if (yaEsta) {
            if (submission.mediaFolderId !== yaEsta.id) await linkSubmission(submission.id, yaEsta.id);
            const raiz = yaEsta.parentId ? await folderById(yaEsta.parentId) : null;
            return { ok: true, folder: yaEsta, root: raiz, path: folderPathLabel(yaEsta.name, raiz?.name || ROOT_FOLDER_NAME), created: false };
        }

        const root = await ensureRootFolder(clubId, { createdBy });
        if (!root) return { ok: false, reason: 'sin_raiz' };

        const base = submissionFolderName(submission);
        const hermanas = await siblingNames(root.id, clubId);
        let nombre = freeFolderName(base, hermanas);
        let carpeta = await createFolder({
            name: nombre, parentId: root.id, clubId,
            sourceType: FOLDER_SOURCES.submission, sourceId: submission.id, createdBy,
        });
        if (!carpeta) {
            // O ya existía la de esta solicitud (carrera) o el nombre se ocupó
            // entre la lectura y el INSERT. Se distinguen releyendo por fuente.
            carpeta = await bySource(FOLDER_SOURCES.submission, submission.id, clubId);
            if (!carpeta) {
                nombre = freeFolderName(base, await siblingNames(root.id, clubId));
                carpeta = await createFolder({
                    name: nombre, parentId: root.id, clubId,
                    sourceType: FOLDER_SOURCES.submission, sourceId: submission.id, createdBy,
                }) || await bySource(FOLDER_SOURCES.submission, submission.id, clubId);
            }
        }
        if (!carpeta) return { ok: false, reason: 'sin_carpeta' };

        await linkSubmission(submission.id, carpeta.id);
        return { ok: true, folder: carpeta, root, path: folderPathLabel(carpeta.name, root.name), created: true };
    } catch (e) {
        console.warn('[solicitudes] no pude asegurar la carpeta:', e?.message);
        return { ok: false, reason: 'error', detalle: e?.message };
    }
}

/** Ata la solicitud a su carpeta. Mejor esfuerzo: un fallo acá no puede costar
 *  la promoción de los archivos, que es lo que de verdad importa. */
async function linkSubmission(submissionId, folderId) {
    try {
        await db.query(`UPDATE "ContributionSubmission" SET "mediaFolderId" = $2, "updatedAt" = NOW() WHERE id = $1`, [submissionId, folderId]);
    } catch (e) {
        console.warn('[solicitudes] no pude atar la solicitud a su carpeta:', e?.message);
    }
}

export async function folderById(id) {
    if (!id) return null;
    try {
        const { rows } = await db.query(`SELECT id, name, "parentId", "clubId", "sourceType", "sourceId" FROM "MediaFolder" WHERE id = $1`, [id]);
        return rows[0] || null;
    } catch { return null; }
}

/**
 * Mete en la carpeta los archivos que YA están en la Biblioteca y todavía no
 * la tienen. No copia ni mueve un solo byte: llena una columna que estaba
 * vacía. Es lo que hace que una solicitud anterior a v4.1004 —cuyos archivos ya
 * se promovieron sueltos— quede ordenada sin volver a gastar una copia de S3.
 *
 * ⚠️ SÓLO LLENA EL HUECO (`"folderId" IS NULL`). Si alguien movió esa foto a
 * otra carpeta desde la Biblioteca, esa es una decisión humana y no se pisa —
 * misma regla que `putAuto` con las traducciones.
 */
export async function adoptFilesIntoFolder(mediaIds = [], folderId) {
    const ids = (Array.isArray(mediaIds) ? mediaIds : []).filter(Boolean);
    if (!ids.length || !folderId) return { moved: 0 };
    try {
        const r = await db.query(
            `UPDATE "Media" SET "folderId" = $1 WHERE id = ANY($2::text[]) AND "folderId" IS NULL`,
            [folderId, ids]
        );
        return { moved: r.rowCount || 0 };
    } catch (e) {
        console.warn('[solicitudes] no pude acomodar los archivos en la carpeta:', e?.message);
        return { moved: 0, error: e?.message };
    }
}

/**
 * «Usado en»: de qué solicitud —y de qué artículo— es cada carpeta.
 *
 * Es la punta que faltaba de la trazabilidad: desde la Biblioteca se puede
 * llegar a la solicitud y al artículo, no sólo al revés. DEGRADA a `{}`: la
 * Biblioteca tiene que seguir listando carpetas aunque el módulo de
 * solicitudes no esté disponible.
 */
export async function folderUsage(folderIds = []) {
    const ids = (Array.isArray(folderIds) ? folderIds : []).filter(Boolean);
    if (!ids.length) return {};
    try {
        const { rows } = await db.query(
            `SELECT f.id AS "folderId", s.id AS "submissionId", s.title, s.club, s."campaignId",
                    c.name AS "campaignName", a.id AS "articleId", a.status AS "articleStatus", a."postId"
               FROM "MediaFolder" f
               JOIN "ContributionSubmission" s ON s.id = f."sourceId"
               LEFT JOIN "ContributionCampaign" c ON c.id = s."campaignId"
               LEFT JOIN "SubmissionArticle" a ON a."submissionId" = s.id
              WHERE f.id = ANY($1::text[]) AND f."sourceType" = $2`,
            [ids, FOLDER_SOURCES.submission]
        );
        return Object.fromEntries(rows.map(r => [r.folderId, {
            submissionId: r.submissionId, title: r.title, club: r.club,
            campaignId: r.campaignId, campaignName: r.campaignName,
            articleId: r.articleId, articleStatus: r.articleStatus, postId: r.postId,
        }]));
    } catch (e) {
        console.warn('[solicitudes] uso de carpetas degradado:', e?.message);
        return {};
    }
}

export default {
    ensureRootFolder, ensureSubmissionFolder, folderById, adoptFilesIntoFolder, folderUsage,
};
