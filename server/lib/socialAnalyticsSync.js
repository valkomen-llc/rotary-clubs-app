// ════════════════════════════════════════════════════════════════════════════
// Analítica de Redes Sociales — la sincronización (v4.1053)
//
// Meta Graph API → este servicio → base histórica → API interna → dashboard.
//
// ⚠️ EL PANEL NO CONSULTA A META. Es el punto 13 del pedido y la decisión de
// la que cuelga todo lo demás: con una llamada por tarjeta, abrir el dashboard
// serían decenas de consultas, la ventana de Meta se agotaría en una tarde y
// el histórico no existiría — al deprecar una métrica se perdería también el
// pasado. Acá se construye la serie; el dashboard sólo la lee.
//
// ⚠️ NUNCA LANZA. Corre dentro de un cron y dentro del sondeo de una pantalla:
// toda función devuelve su resultado con el motivo escrito. Un fallo
// sincronizando una cuenta no puede dejar sin sincronizar a las demás ni
// tumbar la invocación.
// ════════════════════════════════════════════════════════════════════════════

import db from './db.js';
import prisma from './prisma.js';
import { decryptToken } from './tokenCrypto.js';
import { tokenOf } from './socialPublishingService.js';
import { ensureSocialAnalyticsSchema } from './ensureSocialAnalyticsSchema.js';
import {
    TRACKING_START, INSIGHTS_SCOPES, isDayKey, utcToDay, addDays, daysBetween,
} from './socialMetricsSpec.js';
import {
    fetchAccountSeries, fetchAccountNode, fetchContentItems, fetchContentMetrics,
} from './metaInsights.js';

const str = (v) => (typeof v === 'string' ? v.trim() : '');

// El reclamo vence: una corrida que murió a mitad —la función se congeló, el
// proceso se cayó— no puede dejar la cuenta bloqueada para siempre. Es la
// misma ventana de rescate que `ingestScene` en el Creador de Reels.
const CLAIM_TTL_MIN = Number(process.env.SOCIAL_ANALYTICS_CLAIM_MIN || 15);

// Cuántas piezas se miden por vuelta. Cada una cuesta una llamada: sin tope,
// una cuenta con mil publicaciones se come la invocación entera.
const CONTENT_BUDGET = Number(process.env.SOCIAL_ANALYTICS_CONTENT_BUDGET || 25);

// ─── Escritura idempotente ──────────────────────────────────────────────────
//
// ⚠️ `ON CONFLICT` SOBRE LA LLAVE (cuenta × día × métrica). Es lo que hace que
// resincronizar el mismo rango no duplique ni un día: sin él, el segundo
// backfill dejaría la serie contando doble y nadie lo vería hasta mirar un
// total que no cuadra. No es un índice parcial, así que va a secas (v4.648).
const writeDailyRows = async ({ clubId, accountId, platform, rows }) => {
    if (!rows.length) return 0;
    let escritas = 0;
    // De a lotes: una sentencia por fila serían cientos de viajes a la base.
    const LOTE = 200;
    for (let i = 0; i < rows.length; i += LOTE) {
        const trozo = rows.slice(i, i + LOTE);
        const valores = [];
        const params = [];
        trozo.forEach((r, j) => {
            const b = j * 7;
            valores.push(`($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}::date, $${b + 5}, $${b + 6}, $${b + 7})`);
            params.push(clubId, accountId, platform, r.metricDate, r.canonical, r.value, r.sourceMetric || null);
        });
        const { rowCount } = await db.query(
            `INSERT INTO "SocialDailyMetric"
                ("clubId","accountId",platform,"metricDate",metric,value,"sourceMetric")
             VALUES ${valores.join(',')}
             ON CONFLICT ("accountId","metricDate",metric) DO UPDATE
                SET value = EXCLUDED.value,
                    "sourceMetric" = EXCLUDED."sourceMetric",
                    "updatedAt" = CURRENT_TIMESTAMP`,
            params
        );
        escritas += rowCount || 0;
    }
    return escritas;
};

// ─── El reclamo ─────────────────────────────────────────────────────────────
//
// ⚠️ DOS VUELTAS DEL CRON NO SINCRONIZAN LA MISMA CUENTA. El precio de que lo
// hicieran no es una fila duplicada —de eso se ocupa el ON CONFLICT— sino
// gastar dos veces la ventana de consultas de Meta y que la segunda reciba un
// límite que retrasa a todas las demás cuentas del ecosistema.
const claimAccount = async ({ accountId, clubId, platform, kind, rangeFrom, rangeTo }) => {
    const { rows } = await db.query(
        `SELECT id FROM "SocialSyncRun"
          WHERE "accountId" = $1 AND status = 'running'
            AND "claimedAt" > (CURRENT_TIMESTAMP - ($2 || ' minutes')::interval)
          LIMIT 1`,
        [accountId, String(CLAIM_TTL_MIN)]
    );
    if (rows.length) return null;

    const ins = await db.query(
        `INSERT INTO "SocialSyncRun"
            ("clubId","accountId",platform,kind,status,"rangeFrom","rangeTo","claimedAt")
         VALUES ($1,$2,$3,$4,'running',$5::date,$6::date,CURRENT_TIMESTAMP)
         RETURNING id`,
        [clubId || null, accountId, platform, kind, rangeFrom || null, rangeTo || null]
    );
    return ins.rows[0]?.id || null;
};

/** Todo final de intento libera el reclamo, con su motivo. Un final que no
 *  libere hace esperar el TTL entero a un reintento legítimo. */
const closeRun = async (runId, patch = {}) => {
    if (!runId) return;
    await db.query(
        `UPDATE "SocialSyncRun"
            SET status = $2, "syncedThrough" = COALESCE($3::date, "syncedThrough"),
                "rowsWritten" = $4, "apiCalls" = $5, notes = $6::jsonb,
                error = $7, "errorCode" = $8,
                "claimedAt" = NULL, "finishedAt" = CURRENT_TIMESTAMP
          WHERE id = $1`,
        [
            runId, patch.status || 'ok', patch.syncedThrough || null,
            patch.rowsWritten || 0, patch.apiCalls || 0,
            JSON.stringify(patch.notes || []), patch.error || null, patch.errorCode || null,
        ]
    ).catch(() => {});
};

/** Hasta dónde llegó la última sincronización buena de esta cuenta.
 *  Es el punto desde el que arranca la incremental — y lo que hace que no se
 *  vuelva a pedir a Meta lo que ya está guardado. */
export const lastSyncedThrough = async (accountId) => {
    const { rows } = await db.query(
        `SELECT MAX("syncedThrough") AS d FROM "SocialSyncRun"
          WHERE "accountId" = $1 AND status IN ('ok','partial')`,
        [accountId]
    );
    return rows[0]?.d ? utcToDay(rows[0].d) : null;
};

// ─── ¿Esta cuenta puede leer estadísticas? ──────────────────────────────────
//
// ⚠️ SE COMPRUEBA ANTES DE GASTAR UNA LLAMADA. Sin `read_insights` (Facebook)
// o `instagram_manage_insights` (Instagram), la arista responde error de
// permiso: pedirla igual gasta la ventana de Meta para recibir siempre el
// mismo rechazo. Y el motivo que se guarda es el que el panel enseña — «faltan
// permisos» y «no hubo actividad» no se pueden ver iguales (punto 14).
export const insightsReadiness = (account) => {
    const scope = INSIGHTS_SCOPES[account?.platform];
    if (!scope) return { ok: false, state: 'error', reason: 'Plataforma sin adaptador de estadísticas.' };
    if (str(account.status) !== 'active') {
        return { ok: false, state: 'disconnected', reason: `La cuenta está en estado «${account.status}».` };
    }
    const permisos = Array.isArray(account.permissions) ? account.permissions : [];
    // ⚠️ UNA LISTA VACÍA NO ES «NO TIENE PERMISOS». Hay conexiones anteriores
    // a que se guardara el detalle, y darlas por incapaces dejaría sin
    // analítica a una cuenta que sí puede. Ante la duda se intenta: el error
    // real de Meta es más fiable que una lista que quizá nunca se llenó.
    if (permisos.length && !permisos.includes(scope)) {
        return {
            ok: false, state: 'no_permission',
            reason: `Esta conexión no concedió «${scope}», que es el permiso con el que Meta entrega las estadísticas.`,
            fix: 'Volvé a pulsar «Conectar Meta» y autorizá de nuevo la cuenta: el permiso se pide desde la versión 4.1053.',
        };
    }
    // ⚠️ Y UN POSITIVO TAMPOCO ES PRUEBA. `metaSync` guarda en `permissions` lo
    // que se PIDIÓ (`META_SCOPES`), no lo que Meta concedió: si la aplicación
    // todavía no tiene aprobado `read_insights` en App Review, la lista lo
    // llevará igual. Esta puerta sirve para el NEGATIVO conocido —una conexión
    // anterior a v4.1053, que son todas hoy— y para nada más; quien de verdad
    // decide es el error de Meta, que `classifyMetaError` traduce a
    // `no_permission` con el mismo motivo y la misma salida. No leerla como
    // una verificación de permisos.
    return { ok: true, state: 'ok', reason: null };
};

// ════════════════════════════════════════════════════════════════════════════
// SINCRONIZAR UNA CUENTA
// ════════════════════════════════════════════════════════════════════════════

export const syncAccount = async ({ account, mode = 'auto', from = null, to = null, today = null, withContent = true }) => {
    await ensureSocialAnalyticsSchema();
    const hoy = isDayKey(today) ? today : utcToDay(new Date());
    const base = { accountId: account.id, platform: account.platform, accountName: account.accountName || null };

    const listo = insightsReadiness(account);
    if (!listo.ok) {
        // No se reclama ni se gasta una llamada: se registra el motivo para que
        // la pantalla pueda decirlo y se sigue.
        await db.query(
            `INSERT INTO "SocialSyncRun" ("clubId","accountId",platform,kind,status,error,"errorCode","finishedAt")
             VALUES ($1,$2,$3,$4,$5,$6,$7,CURRENT_TIMESTAMP)`,
            [account.clubId || null, account.id, account.platform, 'incremental', listo.state, listo.reason, listo.state]
        ).catch(() => {});
        return { ...base, ok: false, state: listo.state, reason: listo.reason, fix: listo.fix || null, rows: 0 };
    }

    // Desde dónde. La incremental arranca donde terminó la anterior, con un día
    // de solape: Meta consolida las cifras del día en curso durante horas, así
    // que volver a pedir el último día es lo que corrige un valor provisional.
    const ultimo = await lastSyncedThrough(account.id);
    const desde = isDayKey(from) ? from
        : (mode === 'backfill' || !ultimo) ? TRACKING_START
        : addDays(ultimo, -1);
    const hasta = isDayKey(to) ? to : hoy;

    if (daysBetween(desde, hasta) < 0) {
        return { ...base, ok: true, state: 'ok', rows: 0, reason: 'Ya estaba al día.' };
    }

    const kind = (mode === 'backfill' || !ultimo) ? 'backfill' : 'incremental';
    const runId = await claimAccount({
        accountId: account.id, clubId: account.clubId, platform: account.platform,
        kind, rangeFrom: desde, rangeTo: hasta,
    });
    if (!runId) {
        return { ...base, ok: true, state: 'running', rows: 0, reason: 'Ya hay una sincronización en curso para esta cuenta.' };
    }

    let token;
    try {
        token = decryptToken(await tokenOf(account.id));
    } catch (e) {
        await closeRun(runId, { status: 'error', error: `No se pudo leer la credencial: ${e.message}`, errorCode: 'error' });
        return { ...base, ok: false, state: 'error', reason: 'No se pudo leer la credencial de la cuenta.', rows: 0 };
    }

    const avisos = [];
    let escritas = 0;
    let llamadas = 0;
    let estado = 'ok';

    // 1) La serie diaria.
    const serie = await fetchAccountSeries({
        platform: account.platform, platformId: account.platformId,
        accessToken: token, from: desde, to: hasta, today: hoy,
    });
    llamadas += serie.calls || 0;
    avisos.push(...(serie.notes || []));
    if (!serie.ok) {
        await closeRun(runId, {
            status: serie.state, apiCalls: llamadas, notes: avisos,
            error: serie.error, errorCode: serie.state,
        });
        return { ...base, ok: false, state: serie.state, reason: serie.error, rows: 0 };
    }
    if (serie.state === 'partial') estado = 'partial';
    escritas += await writeDailyRows({
        clubId: account.clubId, accountId: account.id, platform: account.platform, rows: serie.rows,
    });

    // 2) Los campos del nodo — seguidores de HOY.
    //
    // Sólo cuando el rango llega a hoy: es el valor actual, no una serie, y
    // escribirlo en una fecha pasada sería afirmar un dato que nadie midió.
    if (hasta === hoy) {
        const nodo = await fetchAccountNode({
            platform: account.platform, platformId: account.platformId, accessToken: token, today: hoy,
        });
        llamadas += nodo.calls || 0;
        if (nodo.ok) {
            escritas += await writeDailyRows({
                clubId: account.clubId, accountId: account.id, platform: account.platform, rows: nodo.rows,
            });
        } else {
            avisos.push({ metric: 'followers', code: nodo.state, reason: nodo.error });
            if (estado === 'ok') estado = 'partial';
        }
    }

    // 3) El contenido.
    if (withContent) {
        const c = await syncContent({ account, token, from: desde, to: hasta, today: hoy });
        llamadas += c.calls || 0;
        escritas += c.rows || 0;
        if (c.notes?.length) avisos.push(...c.notes);
        if (!c.ok && estado === 'ok') estado = 'partial';
    }

    await closeRun(runId, {
        status: estado, syncedThrough: hasta, rowsWritten: escritas,
        apiCalls: llamadas, notes: avisos,
    });
    return { ...base, ok: true, state: estado, rows: escritas, calls: llamadas, from: desde, to: hasta, notes: avisos };
};

// ════════════════════════════════════════════════════════════════════════════
// CONTENIDO
// ════════════════════════════════════════════════════════════════════════════

/** Ata una pieza de Meta con la difusión que la originó en Club Platform.
 *
 *  ⚠️ EL VÍNCULO YA EXISTÍA Y NO SE INVENTA UNO NUEVO. `ContentDistribution`
 *  guarda el `externalId` que devolvió Meta desde v4.1013: eso es lo que
 *  permite preguntar qué contenido nuestro rinde mejor. Con una segunda tabla
 *  de correspondencia habría dos verdades sobre de dónde salió cada pieza, y
 *  se contradirían en cuanto alguien republicara. */
const linkToDistribution = async ({ clubId, externalId }) => {
    if (!str(externalId)) return null;
    const { rows } = await db.query(
        `SELECT id, "entityType", "entityId" FROM "ContentDistribution"
          WHERE "clubId" = $1 AND "externalId" = $2 AND status = 'published'
          ORDER BY "createdAt" DESC LIMIT 1`,
        [clubId, externalId]
    ).catch(() => ({ rows: [] }));
    return rows[0] || null;
};

export const syncContent = async ({ account, token, from, to, today }) => {
    const hoy = isDayKey(today) ? today : utcToDay(new Date());
    const avisos = [];
    let llamadas = 0;
    let filas = 0;

    const lista = await fetchContentItems({
        platform: account.platform, platformId: account.platformId,
        accessToken: token, from, to,
    });
    llamadas += lista.calls || 0;
    if (!lista.ok) {
        avisos.push({ metric: 'contenido', code: lista.state, reason: lista.error });
        return { ok: false, rows: 0, calls: llamadas, notes: avisos };
    }

    // Las más recientes primero: si el presupuesto no alcanza, lo que se mide
    // es lo que la gente está mirando ahora.
    const items = lista.items
        .sort((a, b) => String(b.publishedAt || '').localeCompare(String(a.publishedAt || '')))
        .slice(0, CONTENT_BUDGET);

    for (const it of items) {
        const origen = await linkToDistribution({ clubId: account.clubId, externalId: it.externalId });
        const { rows } = await db.query(
            `INSERT INTO "SocialContentItem"
                ("clubId","accountId",platform,"externalId","externalUrl","mediaType",
                 caption,"thumbnailUrl","publishedAt","distributionId","entityType","entityId")
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::timestamp,$10,$11,$12)
             ON CONFLICT ("accountId","externalId") DO UPDATE
                SET "externalUrl" = COALESCE(EXCLUDED."externalUrl", "SocialContentItem"."externalUrl"),
                    caption = COALESCE(EXCLUDED.caption, "SocialContentItem".caption),
                    "thumbnailUrl" = COALESCE(EXCLUDED."thumbnailUrl", "SocialContentItem"."thumbnailUrl"),
                    "mediaType" = COALESCE(EXCLUDED."mediaType", "SocialContentItem"."mediaType"),
                    -- El vínculo con la difusión NO se pisa con null: una
                    -- vuelta que no lo resuelva no puede borrar el que ya
                    -- estaba.
                    "distributionId" = COALESCE(EXCLUDED."distributionId", "SocialContentItem"."distributionId"),
                    "entityType" = COALESCE(EXCLUDED."entityType", "SocialContentItem"."entityType"),
                    "entityId" = COALESCE(EXCLUDED."entityId", "SocialContentItem"."entityId"),
                    "updatedAt" = CURRENT_TIMESTAMP
             RETURNING id`,
            [
                account.clubId, account.id, account.platform, it.externalId, it.externalUrl,
                it.mediaType, it.caption, it.thumbnailUrl, it.publishedAt,
                origen?.id || null, origen?.entityType || null, origen?.entityId || null,
            ]
        ).catch((e) => { avisos.push({ metric: 'contenido', code: 'error', reason: e.message }); return { rows: [] }; });

        const contentId = rows[0]?.id;
        if (!contentId) continue;

        // Lo que el nodo ya dio, sin gastar otra llamada.
        const delNodo = Object.entries(it.nodeMetrics || {})
            .map(([canonical, value]) => ({ metricDate: hoy, canonical, value, sourceMetric: canonical }));

        const insights = await fetchContentMetrics({
            platform: account.platform, externalId: it.externalId,
            accessToken: token, isReel: str(it.mediaType) === 'reel',
        });
        llamadas += insights.calls || 0;
        const deInsights = (insights.metrics || []).map((m) => ({ ...m, metricDate: hoy }));
        if (!insights.ok) avisos.push({ metric: `contenido:${it.externalId}`, code: insights.state, reason: insights.error });

        const todas = [...delNodo, ...deInsights];
        if (!todas.length) continue;

        const valores = [];
        const params = [];
        todas.forEach((m, j) => {
            const b = j * 7;
            valores.push(`($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}::date, $${b + 6}, $${b + 7})`);
            params.push(account.clubId, contentId, account.id, account.platform, m.metricDate, m.canonical, m.value);
        });
        const w = await db.query(
            `INSERT INTO "SocialContentMetric"
                ("clubId","contentId","accountId",platform,"metricDate",metric,value)
             VALUES ${valores.join(',')}
             ON CONFLICT ("contentId","metricDate",metric) DO UPDATE
                SET value = EXCLUDED.value, "capturedAt" = CURRENT_TIMESTAMP`,
            params
        ).catch(() => ({ rowCount: 0 }));
        filas += w.rowCount || 0;
    }

    if (lista.items.length > items.length) {
        avisos.push({
            metric: 'contenido', code: 'presupuesto',
            reason: `Se midieron ${items.length} de ${lista.items.length} piezas en esta vuelta; el resto entra en la siguiente.`,
        });
    }
    return { ok: true, rows: filas, calls: llamadas, notes: avisos };
};

// ════════════════════════════════════════════════════════════════════════════
// EL BARRIDO
// ════════════════════════════════════════════════════════════════════════════

/** Las cuentas que hay que sincronizar. SIN el token: lo lee `syncAccount`
 *  cuando de verdad lo necesita, y así ninguna respuesta puede arrastrarlo. */
export const accountsToSync = async ({ clubId = null } = {}) => {
    const where = { status: 'active' };
    if (clubId) where.clubId = clubId;
    return prisma.socialAccount.findMany({
        where,
        select: {
            id: true, clubId: true, platform: true, platformId: true, pageId: true,
            accountName: true, avatar: true, status: true, permissions: true, expiresAt: true,
        },
        orderBy: { createdAt: 'asc' },
    });
};

/** Una vuelta del cron.
 *
 *  ⚠️ CON PRESUPUESTO DE TIEMPO. La función corta a los 300 s: se atienden las
 *  cuentas que quepan y el resto espera al ciclo siguiente — no se pierden,
 *  porque la incremental siempre arranca donde quedó la anterior. Es el patrón
 *  del barrido de Reels (v4.670). */
export const sweepAnalytics = async ({ timeBudgetMs = 90000, clubId = null, today = null } = {}) => {
    await ensureSocialAnalyticsSchema();
    const arranque = Date.now();
    const cuentas = await accountsToSync({ clubId });
    const resultados = [];
    let pendientes = 0;

    for (const acc of cuentas) {
        if (Date.now() - arranque > timeBudgetMs) { pendientes += 1; continue; }
        try {
            resultados.push(await syncAccount({ account: acc, mode: 'auto', today }));
        } catch (e) {
            // Una excepción inesperada de una cuenta no puede llevarse el
            // barrido: se anota y se sigue con las demás.
            resultados.push({ accountId: acc.id, platform: acc.platform, ok: false, state: 'error', reason: e.message });
        }
    }
    return {
        accounts: cuentas.length,
        synced: resultados.filter((r) => r.ok).length,
        failed: resultados.filter((r) => !r.ok).length,
        // Cuantas filas de serie diaria se escribieron de verdad. Es la unica
        // medida que distingue «se atendieron ocho cuentas» de «se atendieron
        // ocho cuentas y ninguna traia nada nuevo».
        rows: resultados.reduce((n, r) => n + (r.rows || 0), 0),
        pending: pendientes,
        results: resultados,
    };
};

export default {
    syncAccount, syncContent, sweepAnalytics, accountsToSync,
    lastSyncedThrough, insightsReadiness,
};
