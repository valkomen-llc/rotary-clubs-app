// ════════════════════════════════════════════════════════════════════════════
// Analítica de Redes Sociales — la lectura (v4.1053)
//
// ⚠️ TODA AGREGACIÓN OCURRE EN LA BASE. Es el punto 18 del pedido: un rango de
// 90 días × 8 métricas × 2 cuentas son ~1.440 filas, y sumarlas en el
// navegador significa mandárselas todas. Con el segundo cliente grande eso es
// inusable. Acá se devuelve el número, no la materia prima.
//
// ⚠️ Y NINGUNA CONSULTA DENTRO DE UN BUCLE. Las series de todas las cuentas
// salen en UNA consulta agrupada, no una por cuenta: es el punto de
// escalabilidad que ya costó una corrección en `getCentralOverview` (v4.853).
// ════════════════════════════════════════════════════════════════════════════

import db from './db.js';
import { ensureSocialAnalyticsSchema } from './ensureSocialAnalyticsSchema.js';
import { utcToDay, metricByCanonical, aggregate } from './socialMetricsSpec.js';

const str = (v) => (typeof v === 'string' ? v.trim() : '');

/** Las cuentas del alcance, con su estado de sincronización, en UNA consulta.
 *
 *  ⚠️ SIN EL TOKEN. `SELECT *` sobre `SocialAccount` lo arrastraría al
 *  navegador; acá se enumeran las columnas a propósito (regla de v4.1013). */
export const accountsWithSyncState = async ({ clubIds = null, accountIds = null }) => {
    await ensureSocialAnalyticsSchema();
    const cond = [`a.status IS NOT NULL`];
    const params = [];
    // ⚠️ `[]` NO ES `null`, Y LA DIFERENCIA ES EL AISLAMIENTO ENTERO. `null`
    // significa «sin restricción» y sólo lo recibe el operador de la
    // plataforma; `[]` significa «ninguno» —una sesión sin sitio— y tiene que
    // FORZAR el vacío. Se escribe explícito en vez de apoyarse en que
    // `= ANY('{}')` da falso en Postgres: la regla que protege esto no puede
    // depender de que quien la lea conozca esa semántica (la lección de
    // `mailboxScopeFor`, v4.932).
    if (Array.isArray(clubIds)) {
        if (!clubIds.length) {
            cond.push('FALSE');
        } else {
            params.push(clubIds);
            cond.push(`a."clubId" = ANY($${params.length}::text[])`);
        }
    }
    if (Array.isArray(accountIds) && accountIds.length) {
        params.push(accountIds);
        cond.push(`a.id = ANY($${params.length}::text[])`);
    }
    const { rows } = await db.query(
        `SELECT a.id, a."clubId", a.platform, a."platformId", a."accountName", a.avatar,
                a.status, a.permissions, a."expiresAt",
                c.name AS "clubName",
                r.status        AS "syncStatus",
                r."finishedAt"  AS "lastSyncAt",
                r."syncedThrough",
                r.error         AS "syncError",
                r."errorCode"   AS "syncErrorCode",
                r.notes         AS "syncNotes"
           FROM "SocialAccount" a
           LEFT JOIN "Club" c ON c.id = a."clubId"
           LEFT JOIN LATERAL (
                SELECT status, "finishedAt", "syncedThrough", error, "errorCode", notes
                  FROM "SocialSyncRun" s
                 WHERE s."accountId" = a.id
                 ORDER BY s."startedAt" DESC
                 LIMIT 1
           ) r ON TRUE
          WHERE ${cond.join(' AND ')}
          ORDER BY c.name NULLS LAST, a.platform ASC`,
        params
    );
    return rows;
};

/** La serie diaria de varias cuentas y métricas, en UNA consulta. */
export const dailySeries = async ({ accountIds, metrics = null, from, to }) => {
    if (!accountIds?.length) return [];
    const params = [accountIds, from, to];
    let filtro = '';
    if (Array.isArray(metrics) && metrics.length) {
        params.push(metrics);
        filtro = `AND metric = ANY($${params.length}::text[])`;
    }
    const { rows } = await db.query(
        `SELECT "accountId", platform, metric,
                to_char("metricDate", 'YYYY-MM-DD') AS "metricDate",
                value
           FROM "SocialDailyMetric"
          WHERE "accountId" = ANY($1::text[])
            AND "metricDate" BETWEEN $2::date AND $3::date
            ${filtro}
          ORDER BY "metricDate" ASC`,
        params
    );
    return rows.map((r) => ({ ...r, value: r.value === null ? null : Number(r.value) }));
};

/** El total de cada métrica en un rango, agregado EN LA BASE.
 *
 *  ⚠️ UN FLUJO SE SUMA; UN ESTADO SE TOMA EL ÚLTIMO. Sumar los seguidores de
 *  cada día daría un número sin ningún significado, y es el error más fácil de
 *  cometer acá. Quién es cuál lo dice el catálogo (`cumulative`), no una
 *  lista escrita al lado. */
export const totalsByMetric = async ({ accountIds, from, to, platform = null }) => {
    if (!accountIds?.length) return {};
    const params = [accountIds, from, to];
    let filtro = '';
    if (platform) { params.push(platform); filtro = `AND platform = $${params.length}`; }

    const { rows } = await db.query(
        `SELECT platform, metric,
                SUM(value)                                   AS "sum",
                (ARRAY_AGG(value ORDER BY "metricDate" DESC))[1] AS "last",
                COUNT(*)                                     AS "days"
           FROM "SocialDailyMetric"
          WHERE "accountId" = ANY($1::text[])
            AND "metricDate" BETWEEN $2::date AND $3::date
            AND value IS NOT NULL
            ${filtro}
          GROUP BY platform, metric`,
        params
    );

    const salida = {};
    for (const r of rows) {
        const spec = metricByCanonical(r.platform, r.metric);
        // ⚠️ SIN DATO ES `null`, NO CERO. Un cero es una afirmación —«no pasó
        // nada»— y un hueco es la verdad —«no se pudo medir»—. Es lo que
        // separa un fallo de la API de un día tranquilo (punto 14).
        const valor = spec?.cumulative ? Number(r.last) : Number(r.sum);
        const previo = salida[r.metric];
        if (previo === undefined || previo === null) salida[r.metric] = Number.isFinite(valor) ? valor : null;
        else if (Number.isFinite(valor)) salida[r.metric] = previo + valor;
    }
    return salida;
};

/** El contenido con mejor rendimiento del rango.
 *
 *  Las métricas de una pieza son LIFETIME —un acumulado que crece—, así que se
 *  toma el ÚLTIMO valor capturado dentro del rango, nunca la suma: sumar dos
 *  capturas de la misma pieza contaría dos veces lo mismo. */
export const topContent = async ({ accountIds, from, to, orderBy = 'content_views', limit = 20, mediaType = null }) => {
    if (!accountIds?.length) return [];
    const params = [accountIds, from, to, orderBy, Math.min(Number(limit) || 20, 100)];
    let filtroTipo = '';
    if (mediaType) { params.push(mediaType); filtroTipo = `AND i."mediaType" = $${params.length}`; }

    const { rows } = await db.query(
        `WITH ultimas AS (
            SELECT DISTINCT ON (m."contentId", m.metric)
                   m."contentId", m.metric, m.value
              FROM "SocialContentMetric" m
             WHERE m."accountId" = ANY($1::text[])
               AND m."metricDate" BETWEEN $2::date AND $3::date
             ORDER BY m."contentId", m.metric, m."metricDate" DESC
        )
        SELECT i.id, i."externalId", i."externalUrl", i.platform, i."mediaType",
               i.caption, i."thumbnailUrl", i."publishedAt",
               i."distributionId", i."entityType", i."entityId",
               a."accountName",
               COALESCE(jsonb_object_agg(u.metric, u.value) FILTER (WHERE u.metric IS NOT NULL), '{}'::jsonb) AS metrics,
               MAX(CASE WHEN u.metric = $4 THEN u.value END) AS "orderValue"
          FROM "SocialContentItem" i
          LEFT JOIN ultimas u ON u."contentId" = i.id
          LEFT JOIN "SocialAccount" a ON a.id = i."accountId"
         WHERE i."accountId" = ANY($1::text[])
           AND (i."publishedAt" IS NULL OR i."publishedAt"::date BETWEEN $2::date AND $3::date)
           ${filtroTipo}
         GROUP BY i.id, a."accountName"
         ORDER BY "orderValue" DESC NULLS LAST, i."publishedAt" DESC
         LIMIT $5`,
        params
    );
    return rows;
};

/** La ficha de UNA pieza, con la evolución de cada métrica. */
export const contentDetail = async ({ contentId, accountIds }) => {
    const { rows: items } = await db.query(
        `SELECT i.*, a."accountName"
           FROM "SocialContentItem" i
           LEFT JOIN "SocialAccount" a ON a.id = i."accountId"
          WHERE i.id = $1 AND i."accountId" = ANY($2::text[])`,
        [contentId, accountIds]
    );
    // ⚠️ LO AJENO RESPONDE «NO EXISTE», no «no es tuyo»: confirmar que existe
    // es la mitad de lo que hace falta para ir a buscarlo.
    if (!items.length) return null;

    const { rows: serie } = await db.query(
        `SELECT metric, to_char("metricDate",'YYYY-MM-DD') AS "metricDate", value
           FROM "SocialContentMetric"
          WHERE "contentId" = $1
          ORDER BY "metricDate" ASC`,
        [contentId]
    );
    return { item: items[0], series: serie.map((r) => ({ ...r, value: Number(r.value) })) };
};

/** El historial de sincronización de una cuenta. SÓLO AGREGA — es lo único que
 *  contesta «por qué falta la semana del 3 de agosto» dentro de seis meses. */
export const syncHistory = async ({ accountId, limit = 20 }) => {
    const { rows } = await db.query(
        `SELECT id, kind, status, to_char("rangeFrom",'YYYY-MM-DD') AS "rangeFrom",
                to_char("rangeTo",'YYYY-MM-DD') AS "rangeTo",
                to_char("syncedThrough",'YYYY-MM-DD') AS "syncedThrough",
                "rowsWritten", "apiCalls", notes, error, "errorCode",
                "startedAt", "finishedAt"
           FROM "SocialSyncRun"
          WHERE "accountId" = $1
          ORDER BY "startedAt" DESC
          LIMIT $2`,
        [accountId, Math.min(Number(limit) || 20, 100)]
    );
    return rows;
};

/** El primer y último día con dato de una cuenta: con qué histórico se cuenta
 *  de verdad. Sin esto, un rango vacío no distingue «no hubo actividad» de
 *  «todavía no se sincronizó ese período». */
export const coverage = async ({ accountIds }) => {
    if (!accountIds?.length) return {};
    const { rows } = await db.query(
        `SELECT "accountId",
                to_char(MIN("metricDate"),'YYYY-MM-DD') AS "firstDay",
                to_char(MAX("metricDate"),'YYYY-MM-DD') AS "lastDay",
                COUNT(DISTINCT "metricDate")::int       AS days
           FROM "SocialDailyMetric"
          WHERE "accountId" = ANY($1::text[])
          GROUP BY "accountId"`,
        [accountIds]
    );
    return Object.fromEntries(rows.map((r) => [r.accountId, r]));
};

export default {
    accountsWithSyncState, dailySeries, totalsByMetric, topContent,
    contentDetail, syncHistory, coverage,
};
