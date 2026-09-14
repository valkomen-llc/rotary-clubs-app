// ════════════════════════════════════════════════════════════════════════════
// Analítica de Redes Sociales — la API interna (v4.1053)
//
//   GET  /api/social/analytics/scope            qué sitios y cuentas alcanza quien pregunta
//   GET  /api/social/analytics/overview         KPIs + series del rango
//   GET  /api/social/analytics/content          contenido con mejor rendimiento
//   GET  /api/social/analytics/content/:id      la ficha de una pieza
//   GET  /api/social/analytics/sync/:accountId  historial de sincronización
//   POST /api/social/analytics/sync             resincronizar (backfill o incremental)
//   POST /api/social/analytics/probe/:accountId qué métricas responde este token
//
// ⚠️ EL AISLAMIENTO VA EN EL `WHERE`, NO EN LA PANTALLA. Esconder un selector
// no protege un endpoint de quien lo conoce (regla del sitio desde v4.868): el
// alcance se resuelve en UN solo punto —`resolveScope`— por el que pasan las
// siete rutas, y una cuenta ajena responde **404, no 403** — confirmar que
// existe es la mitad de lo que hace falta para ir a buscarla.
//
// ⚠️ Y EL SITIO SALE DEL TOKEN. Sólo el operador de la plataforma puede pedir
// otro por query, que es lo que su rol ya permite en el resto del módulo
// social. Si `clubId` viniera del cuerpo, acotar las cuentas a un sitio no
// serviría de nada.
// ════════════════════════════════════════════════════════════════════════════

import prisma from '../lib/prisma.js';
import {
    resolveRange, previousRange, canonicalMetrics, metricByCanonical,
    compare, engagementRate, aggregate, utcToDay, isDayKey, TRACKING_START,
    UI_ONLY_METRICS, METRICS, SYNC_STATES, GRAPH_VERSION, INSIGHTS_SCOPES,
    noteSeverity, isLimitNote, needsPermissionCheck,
} from '../lib/socialMetricsSpec.js';
import {
    accountsWithSyncState, dailySeries, totalsByMetric, topContent,
    contentDetail, syncHistory, coverage,
} from '../lib/socialAnalyticsStore.js';
import { syncAccount, insightsReadiness } from '../lib/socialAnalyticsSync.js';
import { verifyAccountInsights } from '../lib/metaPermissionCheck.js';
import { probeAccount } from '../lib/metaInsights.js';
import { tokenOf } from '../lib/socialPublishingService.js';
import { decryptToken } from '../lib/tokenCrypto.js';
import { auditSocial } from '../lib/socialAudit.js';

const str = (v) => (typeof v === 'string' ? v.trim() : '');
const isOperator = (req) => req.user?.role === 'administrator';

// ─── El alcance ─────────────────────────────────────────────────────────────
//
// Devuelve QUÉ sitios puede mirar quien pregunta y QUÉ cuentas de ellos. Un
// administrador de club o distrito queda atado a su sitio; el operador de la
// plataforma puede pedir uno por query — y sin pedirlo, los ve todos.
const resolveScope = async (req) => {
    const pedido = str(req.query.clubId) || str(req.body?.clubId);
    if (isOperator(req)) {
        return { operator: true, clubIds: pedido ? [pedido] : null, requested: pedido || null };
    }
    const propio = str(req.user?.clubId);
    // ⚠️ `[]` NO ES `null`. Con `null` el store no filtra —«todos los
    // sitios»— y una sesión sin sitio vería el ecosistema entero. La lista
    // vacía fuerza el vacío, que es el lado seguro (la lección de
    // `mailboxScopeFor`, v4.932).
    if (!propio) return { operator: false, clubIds: [], requested: null };
    return { operator: false, clubIds: [propio], requested: propio };
};

/** Las cuentas que el alcance alcanza, ya resueltas. Es lo que se usa para
 *  acotar TODA consulta posterior: ningún endpoint recibe un id de cuenta y
 *  comprueba después de quién es. */
const accountsInScope = async (req, { accountIds = null } = {}) => {
    const scope = await resolveScope(req);
    if (Array.isArray(scope.clubIds) && !scope.clubIds.length) return { scope, accounts: [] };
    const pedidas = accountIds
        || (str(req.query.accountId) ? [str(req.query.accountId)] : null)
        || (Array.isArray(req.body?.accountIds) ? req.body.accountIds.map(str).filter(Boolean) : null);
    const accounts = await accountsWithSyncState({ clubIds: scope.clubIds, accountIds: pedidas });
    return { scope, accounts };
};

/** La forma en que una cuenta viaja al navegador. **Sin un solo token.** */
const publicAccount = (a) => ({
    id: a.id,
    clubId: a.clubId,
    clubName: a.clubName || null,
    platform: a.platform,
    accountName: a.accountName,
    avatar: a.avatar,
    status: a.status,
    // El estado de la sincronización, RESUELTO: la pantalla pinta, no decide.
    sync: (() => {
        const estado = a.syncStatus || 'never';
        const notas = Array.isArray(a.syncNotes) ? a.syncNotes : [];
        return {
            status: estado,
            label: SYNC_STATES[estado]?.label || 'Sin sincronizar',
            tone: SYNC_STATES[estado]?.tone || 'neutral',
            lastSyncAt: a.lastSyncAt || null,
            syncedThrough: a.syncedThrough ? utcToDay(a.syncedThrough) : null,
            error: a.syncError || null,
            // ⚠️ CADA NOTA VIAJA CON SU SEVERIDAD, RESUELTA EN EL SERVIDOR.
            // Con la distinción hecha en el navegador habría dos criterios
            // sobre lo mismo, y lo que se separaría es si a alguien se le
            // manda a revisar permisos por una retención de 30 días —que es
            // exactamente lo que pasaba—.
            notes: notas.map((n) => ({ ...n, severity: noteSeverity(n) })),
            limits: notas.filter(isLimitNote).length,
            failures: notas.filter((n) => !isLimitNote(n)).length,
            // ⚠️ EL BOTÓN «COMPROBAR PERMISOS CON META» SÓLO CON EVIDENCIA
            // REAL de un problema de autorización. Una limitación de Meta no
            // se arregla con ningún permiso: ofrecerlo ahí manda a dar vueltas.
            needsPermissionCheck: needsPermissionCheck({ status: estado, notes: notas }),
        };
    })(),
    // ⚠️ SI FALTA EL PERMISO SE DICE ACÁ, con su salida. Sin esto la pantalla
    // enseñaría ceros y nadie sabría que lo que falta es autorizar de nuevo.
    insights: insightsReadiness(a),
});

// ════════════════════════════════════════════════════════════════════════════
// GET /analytics/scope
// ════════════════════════════════════════════════════════════════════════════
export const getAnalyticsScope = async (req, res) => {
    try {
        const { scope, accounts } = await accountsInScope(req);
        // El operador necesita la lista de sitios para el selector; un
        // administrador de sitio no: ya está en el suyo.
        let sites = [];
        if (scope.operator) {
            const conCuenta = await prisma.socialAccount.findMany({
                where: { status: 'active', clubId: { not: null } },
                select: { clubId: true, club: { select: { id: true, name: true } } },
                distinct: ['clubId'],
            });
            sites = conCuenta
                .filter((c) => c.club)
                .map((c) => ({ id: c.club.id, name: c.club.name }))
                .sort((a, b) => a.name.localeCompare(b.name));
        }
        res.json({
            operator: scope.operator,
            sites,
            accounts: accounts.map(publicAccount),
            trackingStart: TRACKING_START,
            graphVersion: GRAPH_VERSION,
            insightsScopes: INSIGHTS_SCOPES,
            // Lo que la pantalla de Meta muestra y la API no da. Se manda para
            // que el panel pueda explicarlo en vez de dejar un hueco.
            unavailable: UI_ONLY_METRICS,
        });
    } catch (e) {
        console.error('[analytics] scope:', e.message);
        res.status(500).json({ error: 'No se pudo resolver el alcance', detail: e.message });
    }
};

// ════════════════════════════════════════════════════════════════════════════
// GET /analytics/overview
// ════════════════════════════════════════════════════════════════════════════
export const getAnalyticsOverview = async (req, res) => {
    try {
        const { accounts } = await accountsInScope(req);
        const hoy = utcToDay(new Date());
        const rango = resolveRange({
            preset: str(req.query.preset) || 'last_28',
            from: str(req.query.from), to: str(req.query.to), today: hoy,
        });
        const anterior = previousRange(rango);
        const plataforma = str(req.query.platform) || null;

        const elegidas = plataforma ? accounts.filter((a) => a.platform === plataforma) : accounts;
        const ids = elegidas.map((a) => a.id);

        if (!ids.length) {
            return res.json({
                range: rango, previous: anterior, accounts: [], kpis: [], series: [],
                // ⚠️ «No hay cuentas» no es «no hay datos», y no es un error.
                empty: 'sin_cuentas',
            });
        }

        const [totales, previos, serie, cobertura] = await Promise.all([
            totalsByMetric({ accountIds: ids, from: rango.from, to: rango.to, platform: plataforma }),
            anterior ? totalsByMetric({ accountIds: ids, from: anterior.from, to: anterior.to, platform: plataforma }) : {},
            dailySeries({ accountIds: ids, from: rango.from, to: rango.to }),
            coverage({ accountIds: ids }),
        ]);

        // Las canónicas que estas plataformas pueden dar.
        const canonicas = [...new Set(elegidas.flatMap((a) => canonicalMetrics({ platform: a.platform })))];

        const kpis = canonicas.map((canonical) => {
            const spec = elegidas.map((a) => metricByCanonical(a.platform, canonical)).find(Boolean);
            const cmp = compare({ current: totales[canonical] ?? null, previous: previos[canonical] ?? null });
            return {
                metric: canonical,
                label: spec?.label || canonical,
                cumulative: !!spec?.cumulative,
                unit: spec?.unit || null,
                ...cmp,
            };
        // Una métrica sin ningún dato no se pinta como cero: se omite del
        // resumen y el panel lo dice en la sección de cobertura.
        }).filter((k) => k.current !== null);

        // Engagement rate: sólo con denominador. Un porcentaje sobre cero no
        // significa nada, así que no se calcula.
        const tasa = engagementRate({ engagement: totales.engagement, views: totales.views });
        if (tasa !== null) {
            const tasaPrev = engagementRate({ engagement: previos.engagement, views: previos.views });
            kpis.push({
                metric: 'engagement_rate', label: 'Tasa de interacción', unit: '%',
                ...compare({ current: tasa, previous: tasaPrev }),
            });
        }

        res.json({
            range: rango,
            previous: anterior,
            accounts: elegidas.map(publicAccount),
            kpis,
            series: serie,
            coverage: cobertura,
        });
    } catch (e) {
        console.error('[analytics] overview:', e.message);
        res.status(500).json({ error: 'No se pudieron leer las estadísticas', detail: e.message });
    }
};

// ════════════════════════════════════════════════════════════════════════════
// GET /analytics/content
// ════════════════════════════════════════════════════════════════════════════
export const getAnalyticsContent = async (req, res) => {
    try {
        const { accounts } = await accountsInScope(req);
        const plataforma = str(req.query.platform) || null;
        const elegidas = plataforma ? accounts.filter((a) => a.platform === plataforma) : accounts;
        const ids = elegidas.map((a) => a.id);
        if (!ids.length) return res.json({ items: [], empty: 'sin_cuentas' });

        const hoy = utcToDay(new Date());
        const rango = resolveRange({
            preset: str(req.query.preset) || 'last_28',
            from: str(req.query.from), to: str(req.query.to), today: hoy,
        });

        const items = await topContent({
            accountIds: ids, from: rango.from, to: rango.to,
            orderBy: str(req.query.orderBy) || 'content_views',
            limit: Number(req.query.limit) || 20,
            mediaType: str(req.query.mediaType) || null,
        });

        res.json({
            range: rango,
            items: items.map((i) => ({
                id: i.id,
                externalId: i.externalId,
                externalUrl: i.externalUrl,
                platform: i.platform,
                mediaType: i.mediaType,
                caption: i.caption,
                thumbnailUrl: i.thumbnailUrl,
                publishedAt: i.publishedAt,
                accountName: i.accountName,
                metrics: i.metrics || {},
                engagementRate: engagementRate({
                    engagement: (i.metrics?.content_engagement ?? null)
                        ?? ((i.metrics?.content_reactions || 0) + (i.metrics?.content_comments || 0) + (i.metrics?.content_shares || 0) + (i.metrics?.content_likes || 0)),
                    views: i.metrics?.content_views ?? i.metrics?.content_reach ?? null,
                }),
                // ⚠️ DE DÓNDE SALIÓ. Es el punto 10 del pedido: saber qué
                // contenido generado por Club Platform rinde mejor. El vínculo
                // sale de `ContentDistribution`, que ya guardaba el id de Meta.
                origin: i.distributionId
                    ? { distributionId: i.distributionId, entityType: i.entityType, entityId: i.entityId }
                    : null,
            })),
        });
    } catch (e) {
        console.error('[analytics] content:', e.message);
        res.status(500).json({ error: 'No se pudo leer el contenido', detail: e.message });
    }
};

// ════════════════════════════════════════════════════════════════════════════
// GET /analytics/content/:id
// ════════════════════════════════════════════════════════════════════════════
export const getAnalyticsContentDetail = async (req, res) => {
    try {
        const { accounts } = await accountsInScope(req);
        const ids = accounts.map((a) => a.id);
        if (!ids.length) return res.status(404).json({ error: 'No se encontró ese contenido' });

        const detalle = await contentDetail({ contentId: str(req.params.id), accountIds: ids });
        // Lo ajeno «no existe»: no se confirma que exista en otro sitio.
        if (!detalle) return res.status(404).json({ error: 'No se encontró ese contenido' });

        res.json({
            item: {
                id: detalle.item.id,
                externalId: detalle.item.externalId,
                externalUrl: detalle.item.externalUrl,
                platform: detalle.item.platform,
                mediaType: detalle.item.mediaType,
                caption: detalle.item.caption,
                thumbnailUrl: detalle.item.thumbnailUrl,
                publishedAt: detalle.item.publishedAt,
                accountName: detalle.item.accountName,
                origin: detalle.item.distributionId
                    ? { distributionId: detalle.item.distributionId, entityType: detalle.item.entityType, entityId: detalle.item.entityId }
                    : null,
            },
            series: detalle.series,
        });
    } catch (e) {
        console.error('[analytics] content detail:', e.message);
        res.status(500).json({ error: 'No se pudo leer el contenido', detail: e.message });
    }
};

// ════════════════════════════════════════════════════════════════════════════
// GET /analytics/sync/:accountId
// ════════════════════════════════════════════════════════════════════════════
export const getAnalyticsSyncHistory = async (req, res) => {
    try {
        const { accounts } = await accountsInScope(req, { accountIds: [str(req.params.accountId)] });
        if (!accounts.length) return res.status(404).json({ error: 'No se encontró esa cuenta' });
        res.json({
            account: publicAccount(accounts[0]),
            runs: await syncHistory({ accountId: accounts[0].id, limit: Number(req.query.limit) || 20 }),
        });
    } catch (e) {
        console.error('[analytics] sync history:', e.message);
        res.status(500).json({ error: 'No se pudo leer el historial', detail: e.message });
    }
};

// ════════════════════════════════════════════════════════════════════════════
// POST /analytics/sync
//
// Resincronizar a mano. `mode: 'backfill'` vuelve a pedir desde el inicio del
// tracking; sin él, se pide desde donde quedó.
// ════════════════════════════════════════════════════════════════════════════
export const postAnalyticsSync = async (req, res) => {
    try {
        const pedidas = Array.isArray(req.body?.accountIds)
            ? req.body.accountIds.map(str).filter(Boolean)
            : (str(req.body?.accountId) ? [str(req.body.accountId)] : null);
        const { scope, accounts } = await accountsInScope(req, { accountIds: pedidas });
        if (!accounts.length) return res.status(404).json({ error: 'No hay cuentas que sincronizar en tu alcance' });

        const modo = str(req.body?.mode) === 'backfill' ? 'backfill' : 'auto';
        const desde = isDayKey(req.body?.from) ? str(req.body.from) : null;
        const hasta = isDayKey(req.body?.to) ? str(req.body.to) : null;

        const resultados = [];
        for (const acc of accounts) {
            resultados.push(await syncAccount({ account: acc, mode: modo, from: desde, to: hasta }));
        }

        await auditSocial({
            action: 'analytics_sync',
            clubId: scope.operator ? (scope.requested || null) : str(req.user?.clubId),
            userId: req.user?.id,
            detail: { mode: modo, accounts: accounts.length, ok: resultados.filter((r) => r.ok).length },
        }).catch(() => {});

        res.json({
            mode: modo,
            // ⚠️ NO ES ATÓMICO Y SE DICE. Cada cuenta reporta su desenlace con
            // su motivo: «se sincronizaron 3» habiendo tocado 1 es el defecto
            // que el desglose existe para no tener (v4.886).
            results: resultados,
            synced: resultados.filter((r) => r.ok).length,
            failed: resultados.filter((r) => !r.ok).length,
        });
    } catch (e) {
        console.error('[analytics] sync:', e.message);
        res.status(500).json({ error: 'No se pudo sincronizar', detail: e.message });
    }
};

// ════════════════════════════════════════════════════════════════════════════
// POST /analytics/probe/:accountId
//
// ⚠️ QUÉ MÉTRICAS RESPONDE ESTE TOKEN, DE VERDAD. Es lo que convierte el
// catálogo en una afirmación comprobable: Meta deprecó ~85 métricas el
// 15/06/2026 y una lista escrita en el código se queda vieja sola. Cuesta una
// llamada por métrica, así que se pide a propósito — no corre en cada vuelta.
// ════════════════════════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════════════════════════
// POST /analytics/verify/:accountId — ¿qué puede leer esta cuenta DE VERDAD?
//
// ⚠️ NO LEE NUESTROS REGISTROS: LE PREGUNTA A META. Es la diferencia con todo
// lo demás de esta pantalla, que pinta lo guardado. Acá se inspecciona el
// token y se hace una consulta real a la arista de estadísticas, y el
// veredicto —incluido el motivo del bloqueo, si lo hay— sale de lo que Meta
// conteste. Lo aprendido se guarda, así que corrige el estado de la cuenta sin
// mandar a nadie a reautorizar para arreglar un dato que ya se midió.
// ════════════════════════════════════════════════════════════════════════════
export const postAnalyticsVerify = async (req, res) => {
    try {
        const { accounts } = await accountsInScope(req, { accountIds: [str(req.params.accountId)] });
        // Una cuenta de otro sitio «no existe»: confirmar que existe es la
        // mitad de lo que hace falta para ir a buscarla.
        if (!accounts.length) return res.status(404).json({ error: 'No se encontró esa cuenta' });
        const acc = accounts[0];

        const veredicto = await verifyAccountInsights({ accountId: acc.id });

        await auditSocial({
            action: 'analytics_verify', clubId: acc.clubId, userId: req.user?.id,
            detail: {
                accountId: acc.id, ok: veredicto.ok, state: veredicto.state,
                blocker: veredicto.blocker || null, scope: veredicto.scope || null,
                metaCode: veredicto.audit?.metaCode ?? null,
            },
        }).catch(() => {});

        // La cuenta se relee: la comprobación acaba de escribir sus permisos y
        // devolver la copia anterior enseñaría el estado que se vino a
        // corregir.
        const { accounts: frescas } = await accountsInScope(req, { accountIds: [acc.id] });
        res.json({
            account: publicAccount(frescas[0] || acc),
            verification: veredicto,
        });
    } catch (e) {
        console.error('[analytics] verify:', e.message);
        res.status(500).json({ error: 'No se pudo comprobar los permisos', detail: e.message });
    }
};

export const postAnalyticsProbe = async (req, res) => {
    try {
        const { accounts } = await accountsInScope(req, { accountIds: [str(req.params.accountId)] });
        if (!accounts.length) return res.status(404).json({ error: 'No se encontró esa cuenta' });
        const acc = accounts[0];

        const listo = insightsReadiness(acc);
        if (!listo.ok) return res.json({ account: publicAccount(acc), skipped: listo });

        const token = decryptToken(await tokenOf(acc.id));
        const informe = await probeAccount({
            platform: acc.platform, platformId: acc.platformId, accessToken: token,
        });

        await auditSocial({
            action: 'analytics_probe', clubId: acc.clubId, userId: req.user?.id,
            detail: { accountId: acc.id, disponibles: informe.metrics.filter((m) => m.available).length },
        }).catch(() => {});

        res.json({ account: publicAccount(acc), probe: informe });
    } catch (e) {
        console.error('[analytics] probe:', e.message);
        res.status(500).json({ error: 'No se pudo comprobar la cuenta', detail: e.message });
    }
};

// ════════════════════════════════════════════════════════════════════════════
// GET /analytics/catalog — la matriz de métricas, tal como está declarada.
// Sirve para que la pantalla explique qué se mide y qué no, sin repetir la
// lista en el navegador.
// ════════════════════════════════════════════════════════════════════════════
export const getAnalyticsCatalog = async (_req, res) => {
    res.json({
        graphVersion: GRAPH_VERSION,
        metrics: METRICS.map((m) => ({
            canonical: m.canonical, platform: m.platform, level: m.level, label: m.label,
            source: m.source, metric: m.metric, endpoint: m.endpoint, permission: m.permission,
            period: m.period, historyDays: m.historyDays, cumulative: !!m.cumulative,
            status: m.status, deprecatedOn: m.deprecatedOn || null, replacedBy: m.replacedBy || null,
            note: m.note || null,
        })),
        unavailable: UI_ONLY_METRICS,
    });
};

export default {
    getAnalyticsScope, getAnalyticsOverview, getAnalyticsContent,
    getAnalyticsContentDetail, getAnalyticsSyncHistory, postAnalyticsSync,
    postAnalyticsProbe, getAnalyticsCatalog,
};
