// ════════════════════════════════════════════════════════════════════════════
// Analítica de Redes Sociales — la I/O contra la Graph API (v4.1053)
//
// El CRITERIO —qué métrica existe, hasta dónde llega, cómo se compara— vive en
// `socialMetricsSpec.js` y es puro. Acá vive lo que habla con Meta: paginación,
// reintentos, retroceso exponencial, límite de consultas y la traducción de un
// fallo a algo que se pueda decir en una pantalla.
//
// ⚠️ ESTO NO ES UN SEGUNDO MOTOR DE META. Quien PUBLICA sigue siendo
// `services/socialPublishService.js` y quien conecta, `services/metaService.js`:
// este módulo sólo LEE estadísticas y no tiene ni una llamada que escriba. Lo
// fija una prueba que lee el archivo. Con dos caminos que publiquen, el día que
// se corrija el manejo de un rechazo una mitad se queda atrás y el fallo es
// MUDO — las dos siguen publicando.
//
// ⚠️ NINGUNA CONSULTA SIN TOPE DE TIEMPO (regla del sitio, v4.875). Esto corre
// dentro de un cron con presupuesto: una respuesta que nunca llega se come la
// invocación entera y deja sin sincronizar a las demás cuentas.
// ════════════════════════════════════════════════════════════════════════════

import {
    graphBase, classifyMetaError, isRetryable, splitWindows,
    effectiveStart, metricsFor, isDayKey, utcToDay,
} from './socialMetricsSpec.js';

const TIMEOUT_MS = Number(process.env.META_INSIGHTS_TIMEOUT_MS || 15000);
const MAX_RETRIES = Number(process.env.META_INSIGHTS_MAX_RETRIES || 3);
const MAX_PAGES = 20;

const str = (v) => (typeof v === 'string' ? v.trim() : '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** El retroceso entre reintentos. Crece exponencialmente y lleva una pizca de
 *  azar: sin ella, veinte cuentas que fallan a la vez vuelven a fallar a la
 *  vez, todas en el mismo milisegundo. */
const backoffMs = (intento) => Math.round((2 ** intento) * 1000 * (1 + Math.random() * 0.3));

/** Una llamada a la Graph API, con tope de tiempo y sin filtrar el token a los
 *  registros.
 *
 *  ⚠️ LA URL LLEVA EL TOKEN Y NO SE REGISTRA NUNCA, ni entera ni recortada:
 *  lo único que se propaga es lo que contesta Meta. Es la misma regla que
 *  `readGranularScopes` en `metaService.js`. */
const callGraph = async (url) => {
    try {
        const resp = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok || data?.error) {
            const err = data?.error || { message: `HTTP ${resp.status}`, code: resp.status };
            return { ok: false, state: classifyMetaError(err), error: str(err.message) || 'error de Meta', code: err.code ?? null, data };
        }
        return { ok: true, data };
    } catch (e) {
        const agotado = e?.name === 'TimeoutError' || e?.name === 'AbortError';
        return {
            ok: false,
            state: agotado ? 'provider_down' : 'error',
            error: agotado ? `Meta no respondió en ${Math.round(TIMEOUT_MS / 1000)} s` : (e?.message || 'error de red'),
            code: null,
        };
    }
};

/** La misma llamada, reintentando SÓLO lo que vale la pena reintentar.
 *
 *  ⚠️ UN PERMISO QUE FALTA NO MEJORA POR INSISTIR, y un token vencido tampoco:
 *  reintentarlos gasta el presupuesto de la ventana de Meta y retrasa a las
 *  cuentas que sí se podían sincronizar. Sólo se reintenta el límite de
 *  consultas y la caída del proveedor (`isRetryable`). */
export const graphGet = async (url, { retries = MAX_RETRIES } = {}) => {
    let ultimo = null;
    for (let intento = 0; intento <= retries; intento += 1) {
        const r = await callGraph(url);
        if (r.ok) return { ...r, attempts: intento + 1 };
        ultimo = r;
        if (!isRetryable(r.state) || intento === retries) break;
        await sleep(backoffMs(intento));
    }
    return { ...ultimo, attempts: retries + 1 };
};

/** Recorre una arista paginada.
 *
 *  ⚠️ SIN SEGUIR `paging.next` UNA CUENTA CON MUCHAS PUBLICACIONES PIERDE EL
 *  RESTO EN SILENCIO: la lista sale corta y no hay ningún error que mirar. Es
 *  la misma lección que `/me/accounts` en `metaService.js`. */
export const graphPaged = async (primeraUrl, { maxPages = MAX_PAGES } = {}) => {
    const filas = [];
    let url = primeraUrl;
    let llamadas = 0;
    for (let vuelta = 0; url && vuelta < maxPages; vuelta += 1) {
        const r = await graphGet(url);
        llamadas += r.attempts || 1;
        if (!r.ok) return { ok: false, state: r.state, error: r.error, rows: filas, calls: llamadas };
        filas.push(...(r.data?.data || []));
        url = r.data?.paging?.next || null;
    }
    return { ok: true, rows: filas, calls: llamadas, truncated: !!url };
};

// ════════════════════════════════════════════════════════════════════════════
// EL PROBE — qué responde DE VERDAD este token
//
// ⚠️ ES LO QUE HACE QUE EL CATÁLOGO NO SE MUERA SOLO. Meta deprecó ~85
// métricas el 15 de junio de 2026: una lista escrita en el código se queda
// vieja y el fallo es MUDO — la consulta devuelve «métrica inválida» y el
// panel enseña un hueco que se lee como «no hubo actividad». El probe pide
// cada métrica POR SEPARADO contra la cuenta real y clasifica lo que pasa.
//
// Se pide de a una a propósito: en un lote, UNA métrica retirada hace fallar
// la consulta ENTERA y las demás se perderían con ella — no se sabría cuál
// fue. Cuesta una llamada por métrica y se corre rara vez.
// ════════════════════════════════════════════════════════════════════════════
export const probeAccount = async ({ platform, platformId, accessToken, today = null }) => {
    const hoy = isDayKey(today) ? today : utcToDay(new Date());
    const tok = encodeURIComponent(accessToken);
    const metricas = metricsFor({ platform, level: 'account', includeDeprecated: true });
    const resultado = { platform, checkedAt: new Date().toISOString(), metrics: [], calls: 0 };

    for (const m of metricas) {
        let url;
        if (m.source === 'node') {
            url = `${graphBase()}/${platformId}?fields=${encodeURIComponent(m.metric)}&access_token=${tok}`;
        } else {
            const tipo = m.metricType ? `&metric_type=${m.metricType}` : '';
            url = `${graphBase()}/${platformId}/insights?metric=${encodeURIComponent(m.metric)}`
                + `&period=${m.period || 'day'}${tipo}`
                + `&since=${hoy}&until=${hoy}&access_token=${tok}`;
        }
        const r = await graphGet(url, { retries: 1 });
        resultado.calls += r.attempts || 1;
        resultado.metrics.push({
            canonical: m.canonical,
            metric: m.metric,
            declared: m.status,
            // `available` es lo que la API contestó HOY, que es lo único que
            // se puede afirmar. `declared` es lo que decía el catálogo: la
            // diferencia entre los dos es justamente lo que hay que corregir.
            available: r.ok,
            state: r.ok ? 'live' : r.state,
            error: r.ok ? null : r.error,
        });
    }
    return resultado;
};

// ════════════════════════════════════════════════════════════════════════════
// CUENTA — la serie diaria
// ════════════════════════════════════════════════════════════════════════════

/** Lee la arista `/insights` de una cuenta para un rango, troceada.
 *
 *  Devuelve filas `{ metricDate, canonical, sourceMetric, value }` listas para
 *  la serie histórica, más lo que NO se pudo traer con su motivo. */
export const fetchAccountSeries = async ({
    platform, platformId, accessToken, from, to, today = null, metrics = null,
}) => {
    const hoy = isDayKey(today) ? today : utcToDay(new Date());
    const tok = encodeURIComponent(accessToken);
    const catalogo = (metrics || metricsFor({ platform, level: 'account' }))
        .filter((m) => m.source === 'insights');

    const filas = [];
    const avisos = [];
    let llamadas = 0;
    let estado = 'ok';

    for (const m of catalogo) {
        // ⚠️ NO SE PIDE LO QUE NO EXISTE. `follower_count` de Instagram guarda
        // 30 días: pedirle julio devuelve un conjunto VACÍO —no un error— y el
        // backfill lo reintentaría en cada vuelta para siempre.
        const ventana = effectiveStart({ metric: m, from, today: hoy });
        if (ventana.clamped) {
            avisos.push({
                metric: m.canonical, code: 'historia_acotada',
                from: ventana.from, requested: from, reason: ventana.reason,
            });
        }
        if (m.historyDays === 0) continue; // se captura como campo del nodo, no acá

        for (const v of splitWindows({ from: ventana.from, to })) {
            const tipo = m.metricType ? `&metric_type=${m.metricType}` : '';
            const url = `${graphBase()}/${platformId}/insights?metric=${encodeURIComponent(m.metric)}`
                + `&period=${m.period || 'day'}${tipo}`
                + `&since=${v.from}&until=${v.to}&access_token=${tok}`;
            const r = await graphGet(url);
            llamadas += r.attempts || 1;

            if (!r.ok) {
                // Una métrica retirada NO es un fallo de la cuenta: es el
                // catálogo que se quedó viejo. Se anota como tal y las demás
                // siguen — si una sola tumbara la corrida, una deprecación de
                // Meta dejaría al sitio entero sin analítica.
                avisos.push({ metric: m.canonical, code: r.state, reason: r.error, from: v.from, to: v.to });
                if (r.state === 'token_expired' || r.state === 'no_permission') {
                    // Éstos sí son de la cuenta y afectan a TODAS las métricas:
                    // seguir pidiendo es gastar llamadas para el mismo error.
                    return { ok: false, state: r.state, error: r.error, rows: filas, notes: avisos, calls: llamadas };
                }
                if (estado === 'ok') estado = 'partial';
                continue;
            }

            for (const item of r.data?.data || []) {
                for (const punto of item.values || []) {
                    // `end_time` es el corte del día que el punto describe.
                    const dia = str(punto.end_time).slice(0, 10);
                    if (!isDayKey(dia)) continue;
                    const bruto = punto.value;
                    // Un valor que viene como objeto es un desglose (por tipo,
                    // por edad…). Acá se guarda el TOTAL; el desglose tiene su
                    // propia lectura y su propia tabla.
                    const valor = (bruto !== null && typeof bruto === 'object')
                        ? Object.values(bruto).reduce((t, x) => t + (Number(x) || 0), 0)
                        : Number(bruto);
                    if (!Number.isFinite(valor)) continue;
                    filas.push({ metricDate: dia, canonical: m.canonical, sourceMetric: m.metric, value: valor });
                }
            }
        }
    }
    return { ok: true, state: estado, rows: filas, notes: avisos, calls: llamadas };
};

/** Los campos del NODO —seguidores, sobre todo—. Es el valor de HOY.
 *
 *  ⚠️ NI FACEBOOK NI INSTAGRAM DEVUELVEN LA HISTORIA DE SEGUIDORES: sólo el
 *  número actual. La serie la construye esta plataforma capturándolo cada día,
 *  y por eso un backfill de seguidores a julio es imposible — se dice, no se
 *  inventa. */
export const fetchAccountNode = async ({ platform, platformId, accessToken, today = null }) => {
    const hoy = isDayKey(today) ? today : utcToDay(new Date());
    const tok = encodeURIComponent(accessToken);
    const campos = metricsFor({ platform, level: 'account' }).filter((m) => m.source === 'node');
    if (!campos.length) return { ok: true, rows: [], calls: 0 };

    const lista = [...new Set(campos.map((m) => m.metric))].join(',');
    const r = await graphGet(`${graphBase()}/${platformId}?fields=${encodeURIComponent(lista)}&access_token=${tok}`);
    if (!r.ok) return { ok: false, state: r.state, error: r.error, rows: [], calls: r.attempts || 1 };

    const filas = [];
    for (const m of campos) {
        const v = Number(r.data?.[m.metric]);
        if (!Number.isFinite(v)) continue;
        filas.push({ metricDate: hoy, canonical: m.canonical, sourceMetric: m.metric, value: v });
    }
    return { ok: true, rows: filas, calls: r.attempts || 1 };
};

// ════════════════════════════════════════════════════════════════════════════
// CONTENIDO
// ════════════════════════════════════════════════════════════════════════════

const FB_POST_FIELDS = [
    'id', 'created_time', 'message', 'permalink_url', 'full_picture',
    'status_type', 'attachments{media_type,type}',
    'reactions.summary(total_count).limit(0)',
    'comments.summary(total_count).limit(0)',
    'shares',
].join(',');

const IG_MEDIA_FIELDS = [
    'id', 'timestamp', 'caption', 'permalink', 'media_type', 'media_product_type',
    'thumbnail_url', 'media_url', 'like_count', 'comments_count',
].join(',');

/** Las piezas publicadas en un rango, con lo que el NODO ya da sin
 *  `read_insights` (reacciones, comentarios, compartidos). */
export const fetchContentItems = async ({ platform, platformId, accessToken, from, to }) => {
    const tok = encodeURIComponent(accessToken);
    const desde = isDayKey(from) ? `&since=${from}` : '';
    // `until` va un día después: Meta lo trata como corte exclusivo en algunas
    // aristas, y sin eso se pierde la última jornada del rango.
    const hasta = isDayKey(to) ? `&until=${to}` : '';

    if (platform === 'facebook') {
        const r = await graphPaged(
            `${graphBase()}/${platformId}/posts?fields=${FB_POST_FIELDS}&limit=50${desde}${hasta}&access_token=${tok}`
        );
        if (!r.ok) return { ok: false, state: r.state, error: r.error, items: [], calls: r.calls };
        return {
            ok: true, calls: r.calls,
            items: r.rows.map((p) => ({
                externalId: str(p.id),
                externalUrl: str(p.permalink_url) || null,
                mediaType: str(p.attachments?.data?.[0]?.media_type) || str(p.status_type) || null,
                caption: str(p.message) || null,
                thumbnailUrl: str(p.full_picture) || null,
                publishedAt: p.created_time || null,
                nodeMetrics: {
                    content_reactions: Number(p.reactions?.summary?.total_count) || 0,
                    content_comments: Number(p.comments?.summary?.total_count) || 0,
                    content_shares: Number(p.shares?.count) || 0,
                },
            })),
        };
    }

    if (platform === 'instagram') {
        const r = await graphPaged(
            `${graphBase()}/${platformId}/media?fields=${IG_MEDIA_FIELDS}&limit=50${desde}${hasta}&access_token=${tok}`
        );
        if (!r.ok) return { ok: false, state: r.state, error: r.error, items: [], calls: r.calls };
        return {
            ok: true, calls: r.calls,
            items: r.rows.map((m) => ({
                externalId: str(m.id),
                externalUrl: str(m.permalink) || null,
                // `media_product_type` es lo que distingue un Reel de un post.
                mediaType: str(m.media_product_type) === 'REELS' ? 'reel' : (str(m.media_type).toLowerCase() || null),
                caption: str(m.caption) || null,
                thumbnailUrl: str(m.thumbnail_url) || str(m.media_url) || null,
                publishedAt: m.timestamp || null,
                nodeMetrics: {
                    content_likes: Number(m.like_count) || 0,
                    content_comments: Number(m.comments_count) || 0,
                },
            })),
        };
    }
    return { ok: false, state: 'error', error: 'plataforma no soportada', items: [], calls: 0 };
};

/** Las métricas de UNA pieza. Son lifetime: el acumulado de hoy. */
export const fetchContentMetrics = async ({ platform, externalId, accessToken, isReel = false }) => {
    const tok = encodeURIComponent(accessToken);
    const catalogo = metricsFor({ platform, level: 'content' })
        .filter((m) => m.source === 'insights')
        .filter((m) => !m.reelsOnly || isReel);
    if (!catalogo.length) return { ok: true, metrics: [], calls: 0 };

    const lista = catalogo.map((m) => m.metric).join(',');
    const r = await graphGet(
        `${graphBase()}/${externalId}/insights?metric=${encodeURIComponent(lista)}&access_token=${tok}`
    );
    if (!r.ok) {
        // ⚠️ EN LOTE, UNA MÉTRICA RETIRADA TUMBA LA CONSULTA ENTERA. Cuando eso
        // pasa se vuelve a pedir de a una: es más caro y es la única forma de
        // quedarse con las que sí viven en vez de perderlas todas.
        if (r.state !== 'invalid_metric') return { ok: false, state: r.state, error: r.error, metrics: [], calls: r.attempts || 1 };
        const salida = []; let llamadas = r.attempts || 1;
        for (const m of catalogo) {
            const uno = await graphGet(`${graphBase()}/${externalId}/insights?metric=${encodeURIComponent(m.metric)}&access_token=${tok}`);
            llamadas += uno.attempts || 1;
            if (!uno.ok) continue;
            for (const item of uno.data?.data || []) {
                const v = Number(item.values?.[0]?.value);
                if (Number.isFinite(v)) salida.push({ canonical: m.canonical, sourceMetric: m.metric, value: v });
            }
        }
        return { ok: true, state: 'partial', metrics: salida, calls: llamadas };
    }

    const porNombre = new Map(catalogo.map((m) => [m.metric, m]));
    const metricas = [];
    for (const item of r.data?.data || []) {
        const m = porNombre.get(str(item.name));
        if (!m) continue;
        const bruto = item.values?.[0]?.value ?? item.total_value?.value;
        const v = Number(bruto);
        if (Number.isFinite(v)) metricas.push({ canonical: m.canonical, sourceMetric: m.metric, value: v });
    }
    return { ok: true, metrics: metricas, calls: r.attempts || 1 };
};

export default {
    graphGet, graphPaged, probeAccount, fetchAccountSeries,
    fetchAccountNode, fetchContentItems, fetchContentMetrics,
};
