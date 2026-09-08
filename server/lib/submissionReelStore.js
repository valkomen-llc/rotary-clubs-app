// ════════════════════════════════════════════════════════════════════
// Los Reels que salieron de una solicitud — la I/O (v4.1010)
//
// El CRITERIO vive en `submissionReel.js` y es puro; acá está lo único que
// necesita la base. Están separados por el mismo motivo que
// `contentSubmissionSpec` lo está de `contentSubmissionStore`: un criterio que
// sólo se puede ejercitar contra Postgres termina sin pruebas.
// ════════════════════════════════════════════════════════════════════
import db from './db.js';

/** Estados del motor que ya no van a cambiar solos. */
const TERMINALES = new Set(['ready', 'needs_review', 'error', 'cancelled']);

/** Lo que la ficha de la solicitud necesita saber de un Reel, y nada más. */
const shape = (r) => ({
    id: r.id,
    title: r.title,
    status: r.status,
    statusDetail: r.statusDetail || null,
    videoUrl: r.videoUrl || null,
    thumbUrl: r.thumbUrl || null,
    durationSec: r.durationSec != null ? Number(r.durationSec) : null,
    format: r.format,
    credits: Number(r.creditsEstimated) || 0,
    mediaId: r.mediaId || null,
    savedToLibraryAt: r.savedToLibraryAt || null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    // Que el trabajo siga en marcha se DERIVA del estado, no se guarda: un
    // booleano aparte sería una segunda verdad que se contradice en cuanto el
    // barrido avance la fila sin actualizarlo.
    working: !TERMINALES.has(String(r.status)),
});

/**
 * Los Reels de varias solicitudes, en UNA consulta.
 *
 * Por lote y no de a uno porque lo consume también el listado de la bandeja:
 * una consulta por fila dejaría la bandeja con cincuenta consultas por vista
 * (el punto de escalabilidad de `getCentralOverview`, v4.853).
 *
 * ⚠️ NUNCA LANZA. La ficha de una solicitud no puede caerse porque la tabla de
 * Reels todavía no exista en esta base o la consulta falle: se devuelve el mapa
 * vacío y la sección simplemente no se pinta. Misma regla que `originsFor`
 * (v4.967) — una solicitud no se pierde por no poder leer lo que salió de ella.
 */
export async function reelsForSubmissions(submissionIds = []) {
    const ids = [...new Set((submissionIds || []).filter(Boolean).map(String))];
    if (!ids.length) return {};
    try {
        const { rows } = await db.query(
            `SELECT id, title, status, "statusDetail", "videoUrl", "thumbUrl",
                    "durationSec", format, "creditsEstimated", "mediaId",
                    "savedToLibraryAt", "submissionId", "createdAt", "updatedAt"
               FROM "ReelProject"
              WHERE "submissionId" = ANY($1::text[])
              ORDER BY "createdAt" DESC`,
            [ids]
        );
        const mapa = {};
        for (const r of rows) (mapa[r.submissionId] ||= []).push(shape(r));
        return mapa;
    } catch {
        return {};
    }
}

/** Los de UNA solicitud. Se apoya en el de lote: un segundo SELECT se
 *  separaría del primero en silencio el día que cambie una columna. */
export async function reelsForSubmission(submissionId) {
    const mapa = await reelsForSubmissions([submissionId]);
    return mapa[String(submissionId)] || [];
}

export default { reelsForSubmissions, reelsForSubmission };
