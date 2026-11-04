// ════════════════════════════════════════════════════════════════════
// Estadísticas de descarga de los documentos de un evento — la I/O — v4.1279.0
//
// Acá viven las sentencias; el criterio (qué se cuenta, qué es repetición,
// qué es un bot, cómo se recorta un período) está en `eventDocumentStats.js`,
// puro y probado.
//
// ⚠️ LA DESCARGA SE REGISTRA EN UNA SOLA SENTENCIA (CTEs), como el clic de un
// enlace corto (v4.993) y la vista de un artículo (v4.1000): en Vercel la
// función se congela al cerrar la respuesta y «medir después de redirigir» no
// existe. Visitante, solicitud, agregado diario, versión y contadores del
// documento se resuelven en un viaje, y la decisión «¿cuenta o es una
// repetición?» la toma la base con el valor REAL de la visita anterior
// (`prevSeenAt`), así que dos solicitudes simultáneas del mismo visitante no
// se cuentan dos veces.
//
// NINGUNA función de registro lanza: medir es secundario, el visitante ya va
// camino del archivo. Un fallo se registra en el log y la descarga NO se
// cuenta (nunca se presenta como exitosa una solicitud que no se registró).
// ════════════════════════════════════════════════════════════════════
import crypto from 'node:crypto';
import db from './db.js';
import { ensureEventDocumentSchema } from './ensureEventDocumentSchema.js';
import { visitorKeyFor, STATS_TZ } from './linkRedirectStore.js';
import { dayKey } from './linkTracking.js';
import { zonedWallToUtc } from './timezone.js';
import { DEFAULT_RESOURCE_KEY, REPEAT_WINDOW_SEC, resolveRange, documentState, fillDownloadDays } from './eventDocumentStats.js';

const nuevoId = () => crypto.randomUUID();
const isoOrNull = (v) => {
    if (!v) return null;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
};

/**
 * El documento lógico y la versión que corresponde al archivo VIGENTE del
 * evento, creándolos si hacen falta. Es idempotente: se llama en cada
 * descarga y en cada lectura del panel, y sólo escribe la primera vez que ve
 * una URL nueva. Al reemplazar la guía, la URL cambia (lleva un UUID) y nace
 * una versión nueva; las anteriores y sus descargas se conservan.
 *
 * `EventDocument` no se modifica dos veces en la misma sentencia (Postgres no
 * lo garantiza): fijar `currentVersionId` es una segunda sentencia, sólo
 * cuando cambió.
 */
export async function ensureDocumentVersion({ event, document, resourceKey = DEFAULT_RESOURCE_KEY, now = new Date() }) {
    if (!event?.id || !document?.url) return null;
    await ensureEventDocumentSchema();
    const { rows } = await db.query(
        `WITH d AS (
             INSERT INTO "EventDocument" (id, "eventId", "clubId", "resourceKey", title, "createdAt", "updatedAt")
             VALUES ($1, $2, $3, $4, $5, $6::timestamptz, $6::timestamptz)
             ON CONFLICT ("eventId", "resourceKey")
             DO UPDATE SET title = EXCLUDED.title,
                           "clubId" = COALESCE("EventDocument"."clubId", EXCLUDED."clubId")
             RETURNING id, "currentVersionId"
         ),
         v AS (
             INSERT INTO "EventDocumentVersion"
                 (id, "documentId", "versionNumber", url, "fileName", "sizeBytes", "uploadedAt", "firstSeenAt")
             SELECT $7, d.id,
                    COALESCE((SELECT MAX(x."versionNumber") FROM "EventDocumentVersion" x WHERE x."documentId" = d.id), 0) + 1,
                    $8, $5, $9, $10::timestamptz, $6::timestamptz
               FROM d
             ON CONFLICT ("documentId", url)
             DO UPDATE SET "fileName" = EXCLUDED."fileName",
                           "sizeBytes" = COALESCE(EXCLUDED."sizeBytes", "EventDocumentVersion"."sizeBytes"),
                           "uploadedAt" = COALESCE("EventDocumentVersion"."uploadedAt", EXCLUDED."uploadedAt")
             RETURNING id, "documentId"
         )
         SELECT v.id AS "versionId", v."documentId" AS "documentId", d."currentVersionId" AS "currentVersionId"
           FROM v JOIN d ON d.id = v."documentId"`,
        [
            nuevoId(), event.id, event.clubId || null, resourceKey, String(document.fileName || '').slice(0, 200), now,
            nuevoId(), String(document.url).slice(0, 2000), Number(document.sizeBytes) > 0 ? Math.round(Number(document.sizeBytes)) : null,
            isoOrNull(document.uploadedAt),
        ]
    );
    const row = rows[0];
    if (!row) return null;
    if (row.currentVersionId !== row.versionId) {
        await db.query(
            `UPDATE "EventDocument" SET "currentVersionId" = $2, "updatedAt" = $3::timestamptz WHERE id = $1`,
            [row.documentId, row.versionId, now]
        );
    }
    return { documentId: row.documentId, versionId: row.versionId, resourceKey };
}

/**
 * Registra una solicitud válida de descarga. UNA sentencia. Nunca lanza.
 *
 *   · bot / precarga → sólo su contador (ni fila, ni visitante);
 *   · visitante identificable que ya descargó hace menos de
 *     `REPEAT_WINDOW_SEC` → se registra como REPETICIÓN, no suma;
 *   · lo demás → fila de descarga, agregado diario, versión y documento.
 */
export async function recordDownload({ doc, event, hit, now = new Date() }) {
    if (!doc?.documentId || !doc?.versionId || !event?.id) return { ok: false, reason: 'sin_documento' };
    try {
        const dia = dayKey(now, STATS_TZ);
        if (hit?.isBot) {
            await db.query(
                `WITH d AS (
                     INSERT INTO "EventDocumentDaily" ("documentId", "eventId", "clubId", day, downloads, uniques, bots, repeats)
                     VALUES ($1, $2, $3, $4::date, 0, 0, 1, 0)
                     ON CONFLICT ("documentId", day)
                     DO UPDATE SET bots = "EventDocumentDaily".bots + 1
                 )
                 UPDATE "EventDocument" SET "botHits" = "botHits" + 1, "updatedAt" = $5::timestamptz WHERE id = $1`,
                [doc.documentId, event.id, event.clubId || null, dia, now]
            );
            return { ok: true, counted: false, bot: true };
        }

        const vk = hit?.identifiable ? visitorKeyFor(hit.seed) : '';
        const { rows } = await db.query(
            `WITH v AS (
                 INSERT INTO "EventDocumentVisitor" ("documentId", "visitorKey", "firstSeenAt", "lastSeenAt", "prevSeenAt", downloads)
                 SELECT $1, $2, $3::timestamptz, $3::timestamptz, NULL, 1 WHERE $2 <> ''
                 ON CONFLICT ("documentId", "visitorKey")
                 DO UPDATE SET "prevSeenAt" = "EventDocumentVisitor"."lastSeenAt",
                               "lastSeenAt" = EXCLUDED."lastSeenAt",
                               downloads = "EventDocumentVisitor".downloads
                                   + CASE WHEN "EventDocumentVisitor"."lastSeenAt" < $3::timestamptz - ($4::int * interval '1 second') THEN 1 ELSE 0 END
                 RETURNING ("prevSeenAt" IS NULL) AS nuevo,
                           ("prevSeenAt" IS NULL OR "prevSeenAt" < $3::timestamptz - ($4::int * interval '1 second')) AS cuenta
             ),
             c AS (
                 SELECT COALESCE((SELECT nuevo FROM v), FALSE) AS nuevo,
                        COALESCE((SELECT cuenta FROM v), TRUE) AS cuenta
             ),
             e AS (
                 INSERT INTO "EventDocumentDownload"
                     (id, "documentId", "versionId", "eventId", "clubId", "createdAt", "visitorKey", "isNewVisitor",
                      source, "referrerHost", "sourceKind", "sourceLabel", device, browser, os, country, city)
                 SELECT $5, $1, $6, $7, $8, $3::timestamptz, $2, c.nuevo,
                        $9, $10, $11, $12, $13, $14, $15, $16, $17
                   FROM c WHERE c.cuenta
             ),
             d AS (
                 INSERT INTO "EventDocumentDaily" ("documentId", "eventId", "clubId", day, downloads, uniques, bots, repeats)
                 SELECT $1, $7, $8, $18::date,
                        CASE WHEN c.cuenta THEN 1 ELSE 0 END,
                        CASE WHEN c.cuenta AND c.nuevo THEN 1 ELSE 0 END,
                        0,
                        CASE WHEN c.cuenta THEN 0 ELSE 1 END
                   FROM c
                 ON CONFLICT ("documentId", day)
                 DO UPDATE SET downloads = "EventDocumentDaily".downloads + EXCLUDED.downloads,
                               uniques = "EventDocumentDaily".uniques + EXCLUDED.uniques,
                               repeats = "EventDocumentDaily".repeats + EXCLUDED.repeats
             ),
             ver AS (
                 UPDATE "EventDocumentVersion"
                    SET downloads = downloads + 1, "lastDownloadAt" = $3::timestamptz
                  WHERE id = $6 AND (SELECT cuenta FROM c)
             )
             UPDATE "EventDocument"
                SET "totalDownloads" = "totalDownloads" + CASE WHEN c.cuenta THEN 1 ELSE 0 END,
                    "uniqueVisitors" = "uniqueVisitors" + CASE WHEN c.cuenta AND c.nuevo THEN 1 ELSE 0 END,
                    "repeatHits" = "repeatHits" + CASE WHEN c.cuenta THEN 0 ELSE 1 END,
                    "lastDownloadAt" = CASE WHEN c.cuenta THEN $3::timestamptz ELSE "lastDownloadAt" END,
                    "updatedAt" = $3::timestamptz
               FROM c
              WHERE "EventDocument".id = $1
              RETURNING c.cuenta AS counted, c.nuevo AS "newVisitor"`,
            [
                doc.documentId, vk, now, REPEAT_WINDOW_SEC,
                nuevoId(), doc.versionId, event.id, event.clubId || null,
                hit?.source || 'section', hit?.referrerHost || '', hit?.sourceKind || 'directo', hit?.sourceLabel || '',
                hit?.device || 'desconocido', hit?.browser || '', hit?.os || '', hit?.country || '', hit?.city || '',
                dia,
            ]
        );
        const r = rows[0] || {};
        return { ok: true, counted: r.counted !== false, repeat: r.counted === false, newVisitor: Boolean(r.newVisitor), bot: false };
    } catch (e) {
        console.error('[event-documents] no se pudo registrar la descarga:', e?.message);
        return { ok: false, reason: e?.message };
    }
}

const docRow = async (eventId, resourceKey) => {
    const { rows } = await db.query(
        `SELECT id, "eventId", "clubId", "resourceKey", title, "currentVersionId",
                "totalDownloads", "uniqueVisitors", "botHits", "repeatHits", "lastDownloadAt", "createdAt"
           FROM "EventDocument" WHERE "eventId" = $1 AND "resourceKey" = $2 LIMIT 1`,
        [eventId, resourceKey]
    );
    return rows[0] || null;
};

const versionRows = async (documentId) => {
    const { rows } = await db.query(
        `SELECT id, "versionNumber", url, "fileName", "sizeBytes", "uploadedAt", "firstSeenAt", downloads, "lastDownloadAt"
           FROM "EventDocumentVersion" WHERE "documentId" = $1 ORDER BY "versionNumber" DESC, "firstSeenAt" DESC`,
        [documentId]
    );
    return rows.map(v => ({ ...v, sizeBytes: v.sizeBytes === null ? null : Number(v.sizeBytes) }));
};

/**
 * Lo que pinta la TARJETA del panel junto al archivo: total histórico,
 * descargas de la versión vigente y última descarga. Sincroniza antes la
 * versión vigente (si hay archivo guardado) para que una guía recién subida
 * aparezca con «0 descargas» y no con «sin datos».
 */
export async function summaryFor({ event, currentDocument, resourceKey = DEFAULT_RESOURCE_KEY, now = new Date() }) {
    await ensureEventDocumentSchema();
    if (currentDocument?.url) await ensureDocumentVersion({ event, document: currentDocument, resourceKey, now });
    const doc = await docRow(event.id, resourceKey);
    const state = documentState({ hasRow: Boolean(doc), currentDocument });
    if (!doc) return { state, totalDownloads: 0, uniqueVisitors: 0, lastDownloadAt: null, current: null };
    let current = null;
    if (doc.currentVersionId && currentDocument?.url) {
        const { rows } = await db.query(
            `SELECT id, "versionNumber", "fileName", downloads, "lastDownloadAt", "firstSeenAt"
               FROM "EventDocumentVersion" WHERE id = $1 AND "documentId" = $2 LIMIT 1`,
            [doc.currentVersionId, doc.id]
        );
        current = rows[0] || null;
    }
    return {
        state,
        totalDownloads: doc.totalDownloads,
        uniqueVisitors: doc.uniqueVisitors,
        lastDownloadAt: doc.lastDownloadAt,
        current,
    };
}

function inicioDeDia(clave) {
    const [y, m, d] = String(clave).split('-').map(Number);
    if (!y || !m || !d) return null;
    return zonedWallToUtc(y, m, d, 0, STATS_TZ);
}

function finDeDia(clave) {
    const [y, m, d] = String(clave).split('-').map(Number);
    if (!y || !m || !d) return null;
    // El primer instante del día SIGUIENTE (límite exclusivo).
    const t = new Date(Date.UTC(y, m - 1, d) + 86400000);
    return zonedWallToUtc(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate(), 0, STATS_TZ);
}

const agrupar = (rows, campo, max = 8) => rows
    .filter(r => r[campo] !== null && r[campo] !== undefined)
    .map(r => ({ key: String(r[campo]), value: Number(r.n) || 0 }))
    .slice(0, max);

/**
 * Las ESTADÍSTICAS completas del documento, para el panel:
 *   · cabecera (hoy, 7, 30 días, versión vigente) desde contadores y diario;
 *   · serie diaria del rango (rellenada: un día sin descargas se ve vacío);
 *   · desgloses del rango (desde dónde, dispositivo, país, fuente) y las
 *     últimas solicitudes, leyendo solicitudes acotadas por `(documentId,
 *     createdAt)`;
 *   · versiones con sus descargas (el histórico que sobrevive al reemplazo).
 * Sin fila en la base: `{ state: 'none' }` y el panel dice «sin datos».
 */
export async function statsFor({ event, currentDocument, resourceKey = DEFAULT_RESOURCE_KEY, period = 'd30', from, to, now = new Date() }) {
    await ensureEventDocumentSchema();
    if (currentDocument?.url) await ensureDocumentVersion({ event, document: currentDocument, resourceKey, now });
    const rango = resolveRange({ period, from, to }, now, STATS_TZ);
    const doc = await docRow(event.id, resourceKey);
    const state = documentState({ hasRow: Boolean(doc), currentDocument });
    if (!doc) return { state, document: null, period: rango, totals: null, series: [], versions: [], breakdown: null, recent: [] };

    const hoy = dayKey(now, STATS_TZ);
    const desde7 = dayKey(new Date(now.getTime() - 6 * 86400000), STATS_TZ);
    const desde30 = dayKey(new Date(now.getTime() - 29 * 86400000), STATS_TZ);

    const desde = rango.fromDay ? inicioDeDia(rango.fromDay) : null;
    const hasta = rango.toDay ? finDeDia(rango.toDay) : null;
    const condRango = desde && hasta
        ? `"documentId" = $1 AND "createdAt" >= $2::timestamptz AND "createdAt" < $3::timestamptz`
        : `"documentId" = $1`;
    const paramsRango = desde && hasta ? [doc.id, desde, hasta] : [doc.id];

    const [cabecera, serie, versions, porFuente, porDispositivo, porPais, porOrigen, recientes, unicos] = await Promise.all([
        db.query(
            `SELECT COALESCE(SUM(downloads) FILTER (WHERE day = $2::date), 0)::int  AS hoy,
                    COALESCE(SUM(downloads) FILTER (WHERE day >= $3::date), 0)::int AS d7,
                    COALESCE(SUM(downloads) FILTER (WHERE day >= $4::date), 0)::int AS d30,
                    COALESCE(SUM(repeats), 0)::int AS repeats
               FROM "EventDocumentDaily" WHERE "documentId" = $1`,
            [doc.id, hoy, desde7, desde30]
        ),
        rango.fromDay
            ? db.query(
                `SELECT to_char(day, 'YYYY-MM-DD') AS day, downloads, uniques, bots, repeats
                   FROM "EventDocumentDaily"
                  WHERE "documentId" = $1 AND day >= $2::date AND day <= $3::date
                  ORDER BY day ASC`,
                [doc.id, rango.fromDay, rango.toDay]
            )
            : db.query(
                `SELECT to_char(day, 'YYYY-MM-DD') AS day, downloads, uniques, bots, repeats
                   FROM "EventDocumentDaily" WHERE "documentId" = $1 ORDER BY day ASC`,
                [doc.id]
            ),
        versionRows(doc.id),
        db.query(`SELECT source AS k, COUNT(*)::int AS n FROM "EventDocumentDownload" WHERE ${condRango} GROUP BY source ORDER BY n DESC`, paramsRango),
        db.query(`SELECT device AS k, COUNT(*)::int AS n FROM "EventDocumentDownload" WHERE ${condRango} GROUP BY device ORDER BY n DESC`, paramsRango),
        db.query(`SELECT country AS k, COUNT(*)::int AS n FROM "EventDocumentDownload" WHERE ${condRango} AND country <> '' GROUP BY country ORDER BY n DESC LIMIT 8`, paramsRango),
        db.query(`SELECT "sourceKind" AS k, "sourceLabel" AS label, COUNT(*)::int AS n FROM "EventDocumentDownload" WHERE ${condRango} GROUP BY "sourceKind", "sourceLabel" ORDER BY n DESC LIMIT 8`, paramsRango),
        db.query(
            `SELECT "createdAt", source, device, browser, os, country, city, "sourceKind", "sourceLabel", "versionId", "isNewVisitor"
               FROM "EventDocumentDownload" WHERE ${condRango} ORDER BY "createdAt" DESC LIMIT 20`,
            paramsRango
        ),
        db.query(`SELECT COUNT(DISTINCT "visitorKey") FILTER (WHERE "visitorKey" <> '')::int AS n, COUNT(*)::int AS total FROM "EventDocumentDownload" WHERE ${condRango}`, paramsRango),
    ]);

    const current = doc.currentVersionId && currentDocument?.url
        ? versions.find(v => v.id === doc.currentVersionId) || null
        : null;

    return {
        state,
        document: {
            id: doc.id, resourceKey: doc.resourceKey, title: doc.title, createdAt: doc.createdAt,
            currentVersionId: current ? current.id : null,
        },
        period: rango,
        totals: {
            all: doc.totalDownloads,
            uniqueVisitors: doc.uniqueVisitors,
            bots: doc.botHits,
            repeats: doc.repeatHits,
            today: cabecera.rows[0]?.hoy || 0,
            last7: cabecera.rows[0]?.d7 || 0,
            last30: cabecera.rows[0]?.d30 || 0,
            lastDownloadAt: doc.lastDownloadAt,
            currentVersion: current ? current.downloads : 0,
            periodDownloads: unicos.rows[0]?.total || 0,
            periodUniques: unicos.rows[0]?.n || 0,
        },
        series: fillDownloadDays(serie.rows, rango),
        versions: versions.map(v => ({ ...v, current: Boolean(current) && v.id === current.id })),
        breakdown: {
            sources: agrupar(porFuente.rows, 'k'),
            devices: agrupar(porDispositivo.rows, 'k'),
            countries: agrupar(porPais.rows, 'k'),
            origins: porOrigen.rows.map(r => ({ key: String(r.k), label: String(r.label || ''), value: Number(r.n) || 0 })),
        },
        recent: recientes.rows,
    };
}

export default { ensureDocumentVersion, recordDownload, summaryFor, statsFor };
