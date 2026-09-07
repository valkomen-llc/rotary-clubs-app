// ════════════════════════════════════════════════════════════════════════════
// Analítica de un artículo — la I/O — v4.1000
//
// Qué se mide: vistas, visitantes únicos (hash con sal, sin IP), tiempo de
// lectura (lo reporta el navegador al salir), profundidad de desplazamiento,
// clics en enlaces del artículo, fuente (UTM → Referer → «Directo o
// desconocido»), dispositivo, país y ciudad (cabeceras del borde).
//
// Qué NO se mide, y se dice: sesiones en el sentido de Google Analytics (una
// visita a un artículo es una vista; no hay un identificador de sesión que
// cruce páginas), ni compartidos (el navegador no los reporta).
//
// EL REGISTRO ES UNA SOLA IDA A LA BASE (CTEs), como el clic de un enlace
// corto (v4.993): en Vercel la función se congela al cerrar la respuesta y
// «medir después» no existe.
// ════════════════════════════════════════════════════════════════════════════
import crypto from 'node:crypto';
import db from './db.js';
import { ensureArticleAnalyticsSchema } from './ensureArticleAnalyticsSchema.js';
import { visitorKeyFor, STATS_TZ } from './linkRedirectStore.js';
import { dayKey, shiftDayKey } from './linkTracking.js';
import { describeHit, IMPACT_PERIODS, buildImpactFacts, impactSentence, summaryIsFaithful } from './submissionArticleSpec.js';
import { routeToModel, getDefaultModel } from './ai-router.js';

const nuevoId = () => crypto.randomUUID();

/** Registra una vista, una salida o un clic. NUNCA lanza. */
export async function recordArticleHit({ post, headers = {}, body = {}, ip = '', userAgent = '', now = new Date() }) {
    if (!post?.id) return { ok: false, reason: 'sin_post' };
    try {
        await ensureArticleAnalyticsSchema();
        const hit = describeHit({ headers, body, userAgent, ip, clubId: post.clubId || '' });
        const dia = dayKey(now, STATS_TZ);
        if (hit.isBot) {
            await db.query(
                `INSERT INTO "ArticleViewDaily" ("postId", "clubId", day, bots) VALUES ($1, $2, $3::date, 1)
                 ON CONFLICT ("postId", day) DO UPDATE SET bots = "ArticleViewDaily".bots + 1`,
                [post.id, post.clubId || null, dia]
            );
            return { ok: true, counted: false, bot: true };
        }
        const vk = hit.identifiable ? visitorKeyFor(hit.seed) : '';

        if (hit.kind === 'view') {
            await db.query(
                `WITH v AS (
                     INSERT INTO "ArticleViewVisitor" ("postId", "visitorKey", "firstSeenAt", "lastSeenAt", views)
                     SELECT $1, $2, $3::timestamptz, $3::timestamptz, 1 WHERE $2 <> ''
                     ON CONFLICT ("postId", "visitorKey") DO UPDATE SET "lastSeenAt" = EXCLUDED."lastSeenAt", views = "ArticleViewVisitor".views + 1
                     RETURNING ("firstSeenAt" = $3::timestamptz) AS nuevo
                 ),
                 n AS (SELECT COALESCE((SELECT nuevo FROM v), FALSE) AS nuevo),
                 e AS (
                     INSERT INTO "ArticleViewEvent" (id, "postId", "clubId", kind, "viewId", "visitorKey", "isNewVisitor", referrer, "referrerHost",
                         "sourceKind", "sourceLabel", "utmSource", "utmMedium", "utmCampaign", "utmContent", "utmTerm", device, browser, os, country, city, "createdAt")
                     SELECT $4, $1, $5, 'view', $6, $2, n.nuevo, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $3::timestamptz FROM n
                 )
                 INSERT INTO "ArticleViewDaily" ("postId", "clubId", day, views, uniques)
                 SELECT $1, $5, $21::date, 1, CASE WHEN n.nuevo THEN 1 ELSE 0 END FROM n
                 ON CONFLICT ("postId", day) DO UPDATE SET views = "ArticleViewDaily".views + 1, uniques = "ArticleViewDaily".uniques + EXCLUDED.uniques`,
                [post.id, vk, now, nuevoId(), post.clubId || null, hit.viewId, hit.referrer, hit.referrerHost,
                 hit.sourceKind, hit.sourceLabel, hit.utmSource, hit.utmMedium, hit.utmCampaign, hit.utmContent, hit.utmTerm,
                 hit.device, hit.browser, hit.os, hit.country, hit.city, dia]
            );
            return { ok: true, counted: true };
        }
        if (hit.kind === 'leave') {
            // El tiempo de lectura: sólo si viene una duración con sentido.
            await db.query(
                `WITH e AS (
                     INSERT INTO "ArticleViewEvent" (id, "postId", "clubId", kind, "viewId", "visitorKey", "durationSec", "scrollPct", device, "createdAt")
                     VALUES ($1, $2, $3, 'leave', $4, $5, $6, $7, $8, $9::timestamptz)
                 )
                 INSERT INTO "ArticleViewDaily" ("postId", "clubId", day, seconds, samples)
                 VALUES ($2, $3, $10::date, $6, CASE WHEN $6 > 0 THEN 1 ELSE 0 END)
                 ON CONFLICT ("postId", day) DO UPDATE SET seconds = "ArticleViewDaily".seconds + EXCLUDED.seconds, samples = "ArticleViewDaily".samples + EXCLUDED.samples`,
                [nuevoId(), post.id, post.clubId || null, hit.viewId, vk, hit.durationSec, hit.scrollPct, hit.device, now, dia]
            );
            return { ok: true, counted: true };
        }
        await db.query(
            `WITH e AS (
                 INSERT INTO "ArticleViewEvent" (id, "postId", "clubId", kind, "viewId", "visitorKey", target, device, "createdAt")
                 VALUES ($1, $2, $3, 'click', $4, $5, $6, $7, $8::timestamptz)
             )
             INSERT INTO "ArticleViewDaily" ("postId", "clubId", day, clicks) VALUES ($2, $3, $9::date, 1)
             ON CONFLICT ("postId", day) DO UPDATE SET clicks = "ArticleViewDaily".clicks + 1`,
            [nuevoId(), post.id, post.clubId || null, hit.viewId, vk, hit.target, hit.device, now, dia]
        );
        return { ok: true, counted: true };
    } catch (e) {
        console.warn('[articles] no pude registrar la vista:', e.message);
        return { ok: false, reason: e.message };
    }
}

const sumar = (rows, k) => rows.reduce((a, r) => a + Number(r[k] || 0), 0);

/** Rellena los días sin vistas: sin eso el gráfico une dos puntos lejanos con
 *  una recta y hace creer que hubo tráfico donde no lo hubo (v4.993). Es
 *  propio y no `fillDays` de los enlaces porque aquél no lleva `views`. */
const rellenarDias = (rows, fromDay, toDay) => {
    const porDia = new Map(rows.map(r => [r.day, r]));
    const out = [];
    let cursor = fromDay;
    for (let i = 0; i < 400 && cursor <= toDay; i++) {
        const h = porDia.get(cursor);
        out.push({ day: cursor, views: Number(h?.views || 0), uniques: Number(h?.uniques || 0), clicks: Number(h?.clicks || 0) });
        cursor = shiftDayKey(cursor, 1);
    }
    return out;
};

/**
 * Las estadísticas de un artículo, acotadas al sitio en el `WHERE`.
 * Totales y serie salen del AGREGADO diario; los desgloses, de los eventos
 * del período. Las 24 horas salen de eventos (el agregado es por día).
 */
export async function articleStats({ postId, clubId = null, period = 'todo', publishedAt = null, now = new Date() }) {
    await ensureArticleAnalyticsSchema();
    const p = IMPACT_PERIODS[period] ? period : 'todo';
    const hoy = dayKey(now, STATS_TZ);
    const site = clubId ? `AND "clubId" = $2` : `AND $2::text IS NULL`;
    const params = [postId, clubId];

    const { rows: diario } = await db.query(`SELECT day::text AS day, views, uniques, clicks, seconds, samples, bots FROM "ArticleViewDaily" WHERE "postId" = $1 ${site} ORDER BY day`, params);
    const desde = IMPACT_PERIODS[p].days ? shiftDayKey(hoy, -(IMPACT_PERIODS[p].days - 1)) : null;
    let ventana = desde ? diario.filter(d => d.day >= desde) : diario;
    let desdeTs = null;
    if (IMPACT_PERIODS[p].hours) {
        desdeTs = new Date(now.getTime() - IMPACT_PERIODS[p].hours * 3600000);
        const { rows: h } = await db.query(
            `SELECT COUNT(*) FILTER (WHERE kind = 'view')::int AS views, COUNT(*) FILTER (WHERE kind = 'view' AND "isNewVisitor")::int AS uniques,
                    COUNT(*) FILTER (WHERE kind = 'click')::int AS clicks,
                    COALESCE(SUM("durationSec") FILTER (WHERE kind = 'leave'),0)::bigint AS seconds, COUNT(*) FILTER (WHERE kind = 'leave' AND "durationSec" > 0)::int AS samples
               FROM "ArticleViewEvent" WHERE "postId" = $1 ${site} AND "createdAt" >= $3`,
            [...params, desdeTs]
        );
        ventana = [{ day: hoy, ...h[0] }];
    }
    const totals = { views: sumar(ventana, 'views'), uniques: sumar(ventana, 'uniques'), clicks: sumar(ventana, 'clicks'), seconds: sumar(ventana, 'seconds'), samples: sumar(ventana, 'samples'), bots: sumar(ventana, 'bots') };
    const allTime = { views: sumar(diario, 'views'), uniques: sumar(diario, 'uniques'), clicks: sumar(diario, 'clicks'), seconds: sumar(diario, 'seconds'), samples: sumar(diario, 'samples') };

    const filtroEventos = desdeTs ? `AND "createdAt" >= $3` : (desde ? `AND "createdAt" >= $3::date` : '');
    const paramsEventos = desdeTs ? [...params, desdeTs] : (desde ? [...params, desde] : params);
    const agrupado = async (col) => {
        const { rows } = await db.query(
            `SELECT COALESCE(NULLIF(${col}, ''), 'Desconocido') AS label, COUNT(*)::int AS views
               FROM "ArticleViewEvent" WHERE "postId" = $1 ${site} AND kind = 'view' ${filtroEventos}
               GROUP BY 1 ORDER BY 2 DESC LIMIT 10`,
            paramsEventos
        );
        return rows;
    };
    const [sources, devices, countries, referrers] = await Promise.all([agrupado('"sourceLabel"'), agrupado('device'), agrupado('country'), agrupado('"referrerHost"')]);
    const { rows: ultimo } = await db.query(`SELECT MAX("createdAt") AS at FROM "ArticleViewEvent" WHERE "postId" = $1 ${site} AND kind = 'view'`, params);
    const { rows: scroll } = await db.query(`SELECT AVG("scrollPct")::int AS avg FROM "ArticleViewEvent" WHERE "postId" = $1 ${site} AND kind = 'leave' ${filtroEventos}`, paramsEventos);

    const serieBase = diario.map(d => ({ day: d.day, views: Number(d.views), uniques: Number(d.uniques), clicks: Number(d.clicks) }));
    const primerDia = serieBase[0]?.day || (publishedAt ? dayKey(new Date(publishedAt), STATS_TZ) : hoy);
    const series = rellenarDias(serieBase, desde && desde > primerDia ? desde : primerDia, hoy);
    const pico = serieBase.reduce((b, d) => (d.views > (b?.views || 0) ? d : b), null);

    const facts = buildImpactFacts({ publishedAt, totals: allTime, series: serieBase, sources, now });
    return {
        period: p, periods: Object.entries(IMPACT_PERIODS).map(([id, v]) => ({ id, label: v.label })),
        totals: { ...totals, avgSeconds: totals.samples ? Math.round(totals.seconds / totals.samples) : 0, avgScroll: Number(scroll[0]?.avg) || 0 },
        allTime: { ...allTime, avgSeconds: allTime.samples ? Math.round(allTime.seconds / allTime.samples) : 0 },
        sources: sources.map(s => ({ ...s, pct: totals.views ? Math.round(s.views * 100 / Math.max(1, sumar(sources, 'views'))) : 0 })),
        devices, countries, referrers,
        series,
        publishedAt, lastViewAt: ultimo[0]?.at || null, peakDay: pico?.day || null, peakViews: pico?.views || 0,
        facts,
        // Lo que NO se mide, dicho: presentar «0 compartidos» sería afirmar.
        notMeasured: ['sesiones (no hay identificador de sesión entre páginas)', 'compartidos (el navegador no los reporta)'],
    };
}

/**
 * El informe: los HECHOS los calcula el código y el modelo sólo los redacta.
 * Un texto que traiga un número que no está en los hechos se descarta y sale
 * la frase determinista. Sin modelo, la frase determinista.
 */
export async function impactSummary(facts) {
    const base = impactSentence(facts);
    if (!facts?.views) return { text: base, source: 'plantilla' };
    try {
        const slug = await getDefaultModel();
        if (!slug) return { text: base, source: 'plantilla' };
        const raw = await routeToModel(slug,
            'Sos analista de comunicación de un club Rotary. Redactá en español, en 2 o 3 frases, una conclusión sobre el impacto de un artículo usando EXCLUSIVAMENTE los números que te doy. No agregues ninguna cifra ni porcentaje que no esté en los datos. Sin markdown.',
            `Datos:\n${JSON.stringify({ visualizaciones: facts.views, unicos: facts.uniques, clics: facts.clicks, tiempo_promedio_seg: facts.avgSeconds, redes_pct: facts.socialPct, fuentes: facts.sources.slice(0, 4), primeras_48h_pct: facts.firstTwoDaysPct, dias_desde_publicacion: facts.daysSincePublished })}\n\nReferencia (podés mejorarla, no contradecirla): ${base}`,
            [], { maxTokens: 300 });
        const texto = String(raw || '').trim();
        if (texto.length > 40 && texto.length < 900 && summaryIsFaithful(texto, facts)) return { text: texto, source: 'modelo' };
        return { text: base, source: 'plantilla', note: 'El modelo devolvió cifras que no están en los datos; se muestra la conclusión calculada.' };
    } catch (e) {
        return { text: base, source: 'plantilla', note: e.message };
    }
}

export default { recordArticleHit, articleStats, impactSummary };
