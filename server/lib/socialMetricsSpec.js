// ════════════════════════════════════════════════════════════════════════════
// Analítica de Redes Sociales — el CRITERIO (v4.1053)
//
// **Puro**: sin base, sin red, sin Meta, sin DOM. Declara qué métrica existe,
// de dónde sale, qué permiso necesita, hasta dónde llega su historia y cómo se
// compara un período contra el anterior.
//
// Vive aparte de la orquestación por el mismo motivo que `seoRules.js` vive
// aparte de `seoAudit.js`: un motor que sólo se ejercita contra la Graph API y
// una base real termina sin pruebas, y entonces nadie se entera de que una
// regla cambió de signo.
//
// ⚠️ EL CATÁLOGO ES UNA HIPÓTESIS; EL PROBE ES LA VERDAD. Meta deprecó ~85
// métricas de alcance e impresiones el 15 de junio de 2026 y venía de deprecar
// `impressions` y `page_fans` el 15 de noviembre de 2025. Una lista escrita a
// mano en el código se queda vieja SOLA y el fallo es MUDO: la consulta
// devuelve error de métrica inválida y el panel enseña un hueco que se lee
// como «no hubo actividad». Por eso cada métrica declara su `status` y su
// `deprecatedOn`, y `metaInsights.probeAccount` confirma contra la API REAL
// cuáles responde el token de ESTE sitio. Al agregar una métrica, agregarla
// acá con su estado — nunca escribirla suelta en una consulta.
//
// ⚠️ «DISPONIBLE EN LA PANTALLA DE META» NO ES «DISPONIBLE POR API». El Panel
// Profesional de Facebook muestra cosas que la Graph API no expone (ver
// `UI_ONLY_METRICS`). Se declaran igual, con su motivo, para que el dashboard
// pueda decir por qué no están en vez de dejar un hueco sin explicación.
// ════════════════════════════════════════════════════════════════════════════

const str = (v) => (typeof v === 'string' ? v.trim() : '');
// ⚠️ `Number(null)` ES 0, Y `Number('')` TAMBIÉN. Leído a secas, un hueco se
// vuelve una afirmación —«no pasó nada»— que es exactamente lo que el punto 14
// del pedido prohíbe: un fallo de la API no se puede pintar como «0
// visualizaciones». Es la trampa que este repositorio ya pagó con `previewSec`
// (v4.954) y con la duración del máster (v4.1049). Un cero MEDIDO sí es cero.
const num = (v) => {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
};

// ─── La versión de la Graph API ─────────────────────────────────────────────
//
// ⚠️ AISLADA A PROPÓSITO DE LA QUE PUBLICA. `metaService.js` y
// `socialPublishService.js` fijan v18.0 — que EXPIRÓ el 12 de septiembre de
// 2025 y hoy sólo funciona porque Meta redirige a la versión soportada más
// antigua. Subirla ahí cambiaría el camino por el que salen hoy las
// publicaciones de producción, y eso es otra decisión con otro riesgo: este
// módulo no la toca. Analytics estrena su propia versión, configurable por
// entorno para corregirla sin desplegar.
//
// No se elige v21.0: muere el 2 de octubre de 2026.
export const GRAPH_VERSION = str(process.env.META_INSIGHTS_GRAPH_VERSION) || 'v23.0';
export const graphBase = () => `https://graph.facebook.com/${GRAPH_VERSION}`;

// ─── Permisos ───────────────────────────────────────────────────────────────
//
// ⚠️ LOS DOS QUE FALTAN SON LOS QUE SOSTIENEN TODO ESTE MÓDULO.
// `metaService.REQUIRED_SCOPES` pide siete permisos y ninguno es de lectura de
// estadísticas: sin `read_insights` la arista `/{page-id}/insights` responde
// error de permiso, y sin `instagram_manage_insights` lo mismo en Instagram.
// Se agregan de forma ADITIVA —una conexión que ya existe sigue publicando
// igual— y hasta que cada cuenta se vuelva a autorizar, el panel lo DICE con
// esas palabras en vez de enseñar ceros.
export const INSIGHTS_SCOPES = {
    facebook: 'read_insights',
    instagram: 'instagram_manage_insights',
};

// ─── Qué significa el estado de una métrica ─────────────────────────────────
export const METRIC_STATUS = {
    live: 'Disponible por API',
    deprecated: 'Meta la retiró',
    ui_only: 'Disponible en la pantalla de Meta, no por API',
};

// ─── Nivel ──────────────────────────────────────────────────────────────────
export const METRIC_LEVELS = ['account', 'content'];

// ════════════════════════════════════════════════════════════════════════════
// EL CATÁLOGO
//
// Cada entrada declara lo que el punto 16 del pedido exige: plataforma,
// endpoint, campo REAL de Meta, permiso, period, disponibilidad histórica,
// nivel y notas de deprecación.
//
//   canonical       cómo la llama el dashboard (la capa normalizada)
//   source          'insights' (arista /insights) | 'node' (campo del nodo)
//   metric          el nombre EXACTO que viaja a Meta
//   period          day | lifetime | total_over_range | null (campo de nodo)
//   historyDays     hasta dónde llega su historia. null = sin límite conocido
//   cumulative      true si el valor es un estado (seguidores), no un flujo
//
// ⚠️ `cumulative` DECIDE CÓMO SE AGREGA UN RANGO. Un flujo —visualizaciones,
// interacciones— se SUMA; un estado —seguidores— se toma el ÚLTIMO del rango.
// Sumar seguidores día a día daría un número sin ningún significado, y es el
// error más fácil de cometer en un módulo de analítica.
// ════════════════════════════════════════════════════════════════════════════
export const METRICS = [
    // ── Facebook · cuenta ───────────────────────────────────────────────────
    {
        canonical: 'followers', platform: 'facebook', level: 'account',
        label: 'Seguidores', source: 'node', metric: 'followers_count',
        endpoint: '/{page-id}?fields=followers_count',
        permission: 'pages_read_engagement', period: null,
        historyDays: 0, cumulative: true, status: 'live',
        note: 'Campo del nodo, no insights: es el valor de HOY. La serie histórica la construye esta plataforma capturándolo cada día.',
    },
    {
        canonical: 'followers_gained', platform: 'facebook', level: 'account',
        label: 'Seguidores ganados', source: 'insights', metric: 'page_fan_adds',
        endpoint: '/{page-id}/insights', permission: 'read_insights', period: 'day',
        historyDays: 730, cumulative: false, status: 'live',
    },
    {
        canonical: 'followers_lost', platform: 'facebook', level: 'account',
        label: 'Dejaron de seguir', source: 'insights', metric: 'page_fan_removes',
        endpoint: '/{page-id}/insights', permission: 'read_insights', period: 'day',
        historyDays: 730, cumulative: false, status: 'live',
    },
    {
        canonical: 'views', platform: 'facebook', level: 'account',
        label: 'Visualizaciones', source: 'insights', metric: 'page_views_total',
        endpoint: '/{page-id}/insights', permission: 'read_insights', period: 'day',
        historyDays: 730, cumulative: false, status: 'live',
        note: 'Meta reemplazó «impresiones» por «visualizaciones» (views). Si el probe la reprueba, el panel lo dice en vez de enseñar cero.',
    },
    {
        canonical: 'engagement', platform: 'facebook', level: 'account',
        label: 'Interacciones', source: 'insights', metric: 'page_post_engagements',
        endpoint: '/{page-id}/insights', permission: 'read_insights', period: 'day',
        historyDays: 730, cumulative: false, status: 'live',
    },
    {
        canonical: 'video_views', platform: 'facebook', level: 'account',
        label: 'Reproducciones de video', source: 'insights', metric: 'page_video_views',
        endpoint: '/{page-id}/insights', permission: 'read_insights', period: 'day',
        historyDays: 730, cumulative: false, status: 'live',
    },
    // ── Facebook · deprecadas. Se declaran para poder EXPLICARLAS ───────────
    //
    // ⚠️ NO SE BORRAN DEL CATÁLOGO. Una métrica que desaparece del código sin
    // dejar rastro convierte «esto ya no se puede medir» en «esto nunca
    // existió», y entonces alguien la vuelve a pedir dentro de seis meses. La
    // serie histórica que se haya alcanzado a capturar antes de la
    // deprecación SIGUE VALIENDO y se sigue mostrando: lo que se corta es el
    // futuro, no el pasado.
    {
        canonical: 'impressions', platform: 'facebook', level: 'account',
        label: 'Impresiones', source: 'insights', metric: 'page_impressions',
        endpoint: '/{page-id}/insights', permission: 'read_insights', period: 'day',
        historyDays: 730, cumulative: false, status: 'deprecated',
        deprecatedOn: '2026-06-15', replacedBy: 'views',
        note: 'Meta retiró impresiones y alcance únicos el 15/06/2026. Se reemplaza por «visualizaciones».',
    },
    {
        canonical: 'reach', platform: 'facebook', level: 'account',
        label: 'Alcance', source: 'insights', metric: 'page_impressions_unique',
        endpoint: '/{page-id}/insights', permission: 'read_insights', period: 'day',
        historyDays: 730, cumulative: false, status: 'deprecated',
        deprecatedOn: '2026-06-15', replacedBy: 'views',
        note: 'El alcance único de Página se retiró el 15/06/2026 sin reemplazo uno a uno.',
    },

    // ── Facebook · contenido ────────────────────────────────────────────────
    {
        canonical: 'content_impressions', platform: 'facebook', level: 'content',
        label: 'Impresiones', source: 'insights', metric: 'post_impressions',
        endpoint: '/{post-id}/insights', permission: 'read_insights', period: 'lifetime',
        historyDays: null, cumulative: true, status: 'deprecated',
        deprecatedOn: '2026-06-15', replacedBy: 'content_views',
    },
    {
        canonical: 'content_views', platform: 'facebook', level: 'content',
        label: 'Visualizaciones', source: 'insights', metric: 'post_video_views',
        endpoint: '/{post-id}/insights', permission: 'read_insights', period: 'lifetime',
        historyDays: null, cumulative: true, status: 'live',
    },
    {
        canonical: 'content_engagement', platform: 'facebook', level: 'content',
        label: 'Interacciones', source: 'insights', metric: 'post_engaged_users',
        endpoint: '/{post-id}/insights', permission: 'read_insights', period: 'lifetime',
        historyDays: null, cumulative: true, status: 'live',
    },
    {
        canonical: 'content_reactions', platform: 'facebook', level: 'content',
        label: 'Reacciones', source: 'node', metric: 'reactions.summary(total_count)',
        endpoint: '/{post-id}?fields=reactions.summary(total_count)',
        permission: 'pages_read_engagement', period: null,
        historyDays: null, cumulative: true, status: 'live',
        note: 'Sale del nodo, no de insights: se puede leer sin read_insights.',
    },
    {
        canonical: 'content_comments', platform: 'facebook', level: 'content',
        label: 'Comentarios', source: 'node', metric: 'comments.summary(total_count)',
        endpoint: '/{post-id}?fields=comments.summary(total_count)',
        permission: 'pages_read_engagement', period: null,
        historyDays: null, cumulative: true, status: 'live',
    },
    {
        canonical: 'content_shares', platform: 'facebook', level: 'content',
        label: 'Compartidos', source: 'node', metric: 'shares',
        endpoint: '/{post-id}?fields=shares',
        permission: 'pages_read_engagement', period: null,
        historyDays: null, cumulative: true, status: 'live',
    },

    // ── Instagram · cuenta ──────────────────────────────────────────────────
    {
        canonical: 'followers', platform: 'instagram', level: 'account',
        label: 'Seguidores', source: 'node', metric: 'followers_count',
        endpoint: '/{ig-user-id}?fields=followers_count',
        permission: 'instagram_basic', period: null,
        historyDays: 0, cumulative: true, status: 'live',
        note: 'Valor de HOY. Instagram no devuelve historia de seguidores: la serie la construye esta plataforma.',
    },
    {
        canonical: 'followers_gained', platform: 'instagram', level: 'account',
        label: 'Seguidores ganados', source: 'insights', metric: 'follower_count',
        endpoint: '/{ig-user-id}/insights', permission: 'instagram_manage_insights', period: 'day',
        // ⚠️ TREINTA DÍAS. Es el límite que hace IMPOSIBLE el backfill de
        // Instagram a julio de 2026, y no se puede sortear: Meta devuelve un
        // conjunto vacío, no un error. Se declara para que el backfill no
        // pida lo que no existe y para que el panel lo diga.
        historyDays: 30, cumulative: false, status: 'live',
        minFollowers: 100,
        note: 'Sólo los últimos 30 días. No existe para cuentas con menos de 100 seguidores.',
    },
    {
        canonical: 'views', platform: 'instagram', level: 'account',
        label: 'Visualizaciones', source: 'insights', metric: 'views',
        endpoint: '/{ig-user-id}/insights', permission: 'instagram_manage_insights', period: 'day',
        historyDays: 730, cumulative: false, status: 'live',
        note: 'Reemplaza a «impressions», retirada por Meta.',
    },
    {
        canonical: 'reach', platform: 'instagram', level: 'account',
        label: 'Alcance', source: 'insights', metric: 'reach',
        endpoint: '/{ig-user-id}/insights', permission: 'instagram_manage_insights', period: 'day',
        historyDays: 730, cumulative: false, status: 'live',
    },
    {
        canonical: 'engagement', platform: 'instagram', level: 'account',
        label: 'Interacciones', source: 'insights', metric: 'accounts_engaged',
        endpoint: '/{ig-user-id}/insights', permission: 'instagram_manage_insights', period: 'day',
        historyDays: 730, cumulative: false, status: 'live',
        metricType: 'total_value',
    },
    {
        canonical: 'impressions', platform: 'instagram', level: 'account',
        label: 'Impresiones', source: 'insights', metric: 'impressions',
        endpoint: '/{ig-user-id}/insights', permission: 'instagram_manage_insights', period: 'day',
        historyDays: 730, cumulative: false, status: 'deprecated',
        deprecatedOn: '2025-01-08', replacedBy: 'views',
    },
    {
        canonical: 'profile_views', platform: 'instagram', level: 'account',
        label: 'Visitas al perfil', source: 'insights', metric: 'profile_views',
        endpoint: '/{ig-user-id}/insights', permission: 'instagram_manage_insights', period: 'day',
        historyDays: 730, cumulative: false, status: 'deprecated',
        deprecatedOn: '2025-01-08',
    },

    // ── Instagram · contenido ───────────────────────────────────────────────
    {
        canonical: 'content_views', platform: 'instagram', level: 'content',
        label: 'Visualizaciones', source: 'insights', metric: 'views',
        endpoint: '/{ig-media-id}/insights', permission: 'instagram_manage_insights', period: 'lifetime',
        historyDays: null, cumulative: true, status: 'live',
    },
    {
        canonical: 'content_reach', platform: 'instagram', level: 'content',
        label: 'Alcance', source: 'insights', metric: 'reach',
        endpoint: '/{ig-media-id}/insights', permission: 'instagram_manage_insights', period: 'lifetime',
        historyDays: null, cumulative: true, status: 'live',
    },
    {
        canonical: 'content_saves', platform: 'instagram', level: 'content',
        label: 'Guardados', source: 'insights', metric: 'saved',
        endpoint: '/{ig-media-id}/insights', permission: 'instagram_manage_insights', period: 'lifetime',
        historyDays: null, cumulative: true, status: 'live',
    },
    {
        canonical: 'content_likes', platform: 'instagram', level: 'content',
        label: 'Me gusta', source: 'node', metric: 'like_count',
        endpoint: '/{ig-media-id}?fields=like_count',
        permission: 'instagram_basic', period: null,
        historyDays: null, cumulative: true, status: 'live',
    },
    {
        canonical: 'content_comments', platform: 'instagram', level: 'content',
        label: 'Comentarios', source: 'node', metric: 'comments_count',
        endpoint: '/{ig-media-id}?fields=comments_count',
        permission: 'instagram_basic', period: null,
        historyDays: null, cumulative: true, status: 'live',
    },
    {
        canonical: 'content_shares', platform: 'instagram', level: 'content',
        label: 'Compartidos', source: 'insights', metric: 'shares',
        endpoint: '/{ig-media-id}/insights', permission: 'instagram_manage_insights', period: 'lifetime',
        historyDays: null, cumulative: true, status: 'live',
    },
    {
        canonical: 'content_watch_time', platform: 'instagram', level: 'content',
        label: 'Tiempo de reproducción', source: 'insights', metric: 'ig_reels_video_view_total_time',
        endpoint: '/{ig-media-id}/insights', permission: 'instagram_manage_insights', period: 'lifetime',
        historyDays: null, cumulative: true, status: 'live',
        unit: 'ms', reelsOnly: true,
    },
];

export const metricsFor = ({ platform, level = null, includeDeprecated = false } = {}) =>
    METRICS.filter((m) => m.platform === str(platform)
        && (!level || m.level === level)
        && (includeDeprecated || m.status === 'live'));

export const metricByCanonical = (platform, canonical) =>
    METRICS.find((m) => m.platform === str(platform) && m.canonical === str(canonical)) || null;

/** Las métricas VIGENTES que se piden a la arista `/insights`. Un campo del
 *  nodo no viaja acá: se lee con `fields=`, que es otra consulta. */
export const insightMetricNames = ({ platform, level = 'account' }) =>
    metricsFor({ platform, level })
        .filter((m) => m.source === 'insights')
        .map((m) => m.metric);

/** Las canónicas que el dashboard puede pintar para una plataforma. */
export const canonicalMetrics = ({ platform, level = 'account' }) =>
    [...new Set(metricsFor({ platform, level }).map((m) => m.canonical))];

// ─── Lo que la pantalla de Meta muestra y la API no da ──────────────────────
//
// ⚠️ SE DECLARA PARA PODER DECIRLO. Las capturas del Panel Profesional que
// originaron este módulo vienen de `professional_dashboard/profile_insights`,
// que es un PERFIL profesional: la Graph API cubre Páginas y cuentas de
// Instagram Business, no perfiles. Fabricar una aproximación y presentarla
// como el dato sería exactamente lo que el pedido prohíbe.
export const UI_ONLY_METRICS = [
    {
        id: 'net_followers_by_content_type',
        label: 'Seguidores netos por tipo de contenido',
        reason: 'Meta no expone el desglose de altas y bajas por formato en ninguna arista de la Graph API.',
    },
    {
        id: 'traffic_source_breakdown',
        label: 'Cómo encuentran las personas tu contenido',
        reason: 'El desglose por Reels, Feed, Grupos y Tu página sólo existe en la pantalla de Meta.',
    },
    {
        id: 'follower_vs_non_follower',
        label: 'Seguidores frente a no seguidores',
        reason: 'La Graph API no desglosa la interacción por si quien la hizo sigue la cuenta. En Instagram existe el alcance por seguidores; en Facebook, no.',
    },
    {
        id: 'trending_topics',
        label: 'Temas del momento y populares entre tus seguidores',
        reason: 'Son recomendaciones de la pantalla de Meta, sin arista pública.',
    },
    {
        id: 'top_fans',
        label: 'Fans destacados',
        reason: 'No existe arista pública que los devuelva.',
    },
    {
        id: 'profile_professional_dashboard',
        label: 'Estadísticas de un perfil profesional',
        reason: 'La Graph API sólo alcanza Páginas y cuentas de Instagram Business. Un perfil profesional personal no tiene arista de insights.',
    },
    // ⚠️ LA DEMOGRAFÍA NO ES UNA SERIE DIARIA, Y ÉSA ES TODA LA RAZÓN POR LA
    // QUE NO ESTÁ EN `METRICS`. Las aristas `audience_*` de Instagram son de
    // período `lifetime` y **no aceptan `since`/`until`**: devuelven una FOTO
    // del momento en que se pregunta, así que no hay histórico que pedir ni
    // día al que atribuirlas. Las de Facebook (`page_fans_country`,
    // `page_fans_gender_age`) entraron en la depreciación del 15/06/2026.
    //
    // Guardarlas como si fueran una serie sería inventar la fecha del dato, y
    // pintarlas contra un rango haría creer que responden al período elegido.
    // Se declaran acá —con su motivo— en vez de aproximarlas: es el punto 16
    // del pedido. Cuando se implementen, van como INSTANTÁNEA con su fecha de
    // captura, no como una fila de `SocialDailyMetric`.
    {
        id: 'audience_demographics',
        label: 'Audiencia: edad, género y ubicación',
        reason: 'Las aristas `audience_*` de Instagram devuelven una foto del momento y no aceptan rango de fechas; las equivalentes de Facebook las retiró Meta el 15/06/2026. No hay histórico que construir, así que todavía no se guardan.',
        planned: true,
    },
];

// ════════════════════════════════════════════════════════════════════════════
// FECHAS Y RANGOS
//
// Todo en `YYYY-MM-DD`, la forma en que se guarda un día en la serie.
// ════════════════════════════════════════════════════════════════════════════

export const TRACKING_START = str(process.env.SOCIAL_ANALYTICS_START) || '2026-07-01';

const DAY_MS = 86400000;

export const isDayKey = (v) => /^\d{4}-\d{2}-\d{2}$/.test(str(v));

/** ⚠️ SE ARMA CON LAS PARTES, NUNCA CON `new Date('2026-08-14')`. Eso es
 *  medianoche UTC y, leído en Bogotá, devuelve el día ANTERIOR — la lección de
 *  v4.991, que costó una versión. La función corre en UTC en producción. */
export const dayToUtc = (key) => {
    if (!isDayKey(key)) return null;
    const [y, m, d] = str(key).split('-').map(Number);
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    const dt = new Date(Date.UTC(y, m - 1, d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
    return dt;
};

export const utcToDay = (dt) => {
    const d = dt instanceof Date ? dt : new Date(dt);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
};

export const addDays = (key, n) => {
    const dt = dayToUtc(key);
    if (!dt) return null;
    return utcToDay(new Date(dt.getTime() + n * DAY_MS));
};

export const daysBetween = (from, to) => {
    const a = dayToUtc(from); const b = dayToUtc(to);
    if (!a || !b) return null;
    return Math.round((b.getTime() - a.getTime()) / DAY_MS);
};

// ─── Los rangos que ofrece la pantalla ──────────────────────────────────────
export const DATE_PRESETS = [
    { id: 'last_7', label: 'Últimos 7 días', days: 7 },
    { id: 'last_28', label: 'Últimos 28 días', days: 28 },
    { id: 'last_30', label: 'Últimos 30 días', days: 30 },
    { id: 'last_90', label: 'Últimos 90 días', days: 90 },
    { id: 'since_start', label: `Desde el ${TRACKING_START}`, days: null },
    { id: 'custom', label: 'Personalizado', days: null },
];
export const DATE_PRESET_IDS = DATE_PRESETS.map((p) => p.id);

/** Resuelve un rango a `{ from, to }`. `today` entra como PARÁMETRO: una
 *  función que consulta el reloj por dentro no se puede probar. */
export const resolveRange = ({ preset = 'last_28', from = null, to = null, today } = {}) => {
    const hoy = isDayKey(today) ? str(today) : utcToDay(new Date());
    const id = DATE_PRESET_IDS.includes(str(preset)) ? str(preset) : 'last_28';

    if (id === 'custom') {
        const a = isDayKey(from) ? str(from) : null;
        const b = isDayKey(to) ? str(to) : null;
        if (!a || !b) return resolveRange({ preset: 'last_28', today: hoy });
        // Un rango invertido es un error de dedo: se endereza.
        const [ini, fin] = daysBetween(a, b) < 0 ? [b, a] : [a, b];
        return { preset: id, from: ini, to: fin > hoy ? hoy : fin };
    }
    if (id === 'since_start') return { preset: id, from: TRACKING_START, to: hoy };

    const days = DATE_PRESETS.find((p) => p.id === id)?.days || 28;
    // Incluye hoy: «últimos 7 días» son hoy y los seis anteriores.
    return { preset: id, from: addDays(hoy, -(days - 1)), to: hoy };
};

/** El período ANTERIOR, de la misma longitud y pegado al inicio del actual.
 *  Es contra lo que se compara un KPI. */
export const previousRange = ({ from, to } = {}) => {
    const largo = daysBetween(from, to);
    if (largo === null || largo < 0) return null;
    const fin = addDays(from, -1);
    return { from: addDays(fin, -largo), to: fin };
};

// ─── El troceo del backfill ─────────────────────────────────────────────────
//
// ⚠️ META ACOTA UNA CONSULTA DE INSIGHTS A 93 DÍAS. Pedir julio a hoy de una
// sola vez no devuelve un error claro: devuelve menos de lo pedido, y el
// histórico queda con un hueco que nadie ve. Se trocea siempre.
export const MAX_WINDOW_DAYS = 93;

export const splitWindows = ({ from, to, maxDays = MAX_WINDOW_DAYS } = {}) => {
    if (!isDayKey(from) || !isDayKey(to)) return [];
    const total = daysBetween(from, to);
    if (total === null || total < 0) return [];
    const ventanas = [];
    let ini = from;
    // Guardia: un rango absurdo no puede colgar el proceso.
    for (let i = 0; i <= 400 && daysBetween(ini, to) >= 0; i += 1) {
        const fin = addDays(ini, maxDays - 1);
        // ⚠️ `daysBetween(a, b)` es b − a: POSITIVO significa que `to` queda
        // MÁS ALLÁ de esta ventana, así que el corte es el tope de Meta, no el
        // final del rango. Con el signo al revés el troceo devolvía UNA sola
        // ventana de 257 días y Meta habría contestado menos de lo pedido —sin
        // error— dejando un hueco en el histórico que nadie ve.
        const corte = daysBetween(fin, to) > 0 ? fin : to;
        ventanas.push({ from: ini, to: corte });
        if (corte === to) break;
        ini = addDays(corte, 1);
    }
    return ventanas;
};

/** Desde dónde se puede pedir de verdad una métrica.
 *
 *  ⚠️ NO SE PIDE LO QUE NO EXISTE. `follower_count` de Instagram guarda 30
 *  días: pedirle julio devuelve vacío —no un error— y el backfill quedaría
 *  intentándolo en cada vuelta para siempre. Devuelve además el MOTIVO, que es
 *  lo que el panel enseña en vez de un cero. */
export const effectiveStart = ({ metric, from, today }) => {
    const hoy = isDayKey(today) ? str(today) : utcToDay(new Date());
    const pedido = isDayKey(from) ? str(from) : TRACKING_START;
    const limite = metric?.historyDays;
    if (!Number.isFinite(limite) || limite === null) return { from: pedido, clamped: false, reason: null };
    if (limite === 0) {
        return {
            from: hoy, clamped: pedido !== hoy,
            reason: 'Meta sólo devuelve el valor de hoy: la serie se construye capturándolo cada día.',
        };
    }
    const masViejo = addDays(hoy, -(limite - 1));
    if (daysBetween(pedido, masViejo) > 0) {
        return {
            from: masViejo, clamped: true,
            reason: `Meta guarda ${limite} días de esta métrica: no hay dato anterior al ${masViejo}.`,
        };
    }
    return { from: pedido, clamped: false, reason: null };
};

// ════════════════════════════════════════════════════════════════════════════
// AGREGACIÓN Y COMPARACIÓN
// ════════════════════════════════════════════════════════════════════════════

/** Agrega una serie diaria a UN número, según la métrica sea flujo o estado.
 *
 *  ⚠️ DEVUELVE `null` CUANDO NO HAY NINGÚN DATO, NO CERO. Un cero es una
 *  afirmación —«no pasó nada»— y un hueco es la verdad —«no se pudo medir»—.
 *  Es la regla del sitio y acá es lo que separa un fallo de la API de un día
 *  tranquilo. */
export const aggregate = ({ rows = [], cumulative = false } = {}) => {
    const datos = rows
        .filter((r) => r && isDayKey(r.metricDate) && num(r.value) !== null)
        .sort((a, b) => (a.metricDate < b.metricDate ? -1 : 1));
    if (!datos.length) return null;
    if (cumulative) return num(datos[datos.length - 1].value);
    return datos.reduce((t, r) => t + num(r.value), 0);
};

/** La comparación de un KPI contra el período anterior.
 *
 *  ⚠️ NO SE INVENTA UN PORCENTAJE CUANDO EL ANTERIOR ES CERO. Pasar de 0 a 40
 *  no es «+∞ %» ni «+100 %»: es una cifra que no se puede expresar en
 *  porcentaje, y presentarla igual es el número engañoso que el pedido
 *  prohíbe. Se devuelve la variación absoluta y `percent: null`, y la pantalla
 *  dice «sin base de comparación». */
export const compare = ({ current = null, previous = null } = {}) => {
    const c = num(current); const p = num(previous);
    if (c === null) return { current: null, previous: p, delta: null, percent: null, basis: 'sin_dato' };
    if (p === null) return { current: c, previous: null, delta: null, percent: null, basis: 'sin_periodo_anterior' };
    const delta = c - p;
    if (p === 0) {
        return { current: c, previous: 0, delta, percent: null, basis: c === 0 ? 'sin_movimiento' : 'sin_base' };
    }
    return { current: c, previous: p, delta, percent: (delta / Math.abs(p)) * 100, basis: 'ok' };
};

/** Engagement rate: interacciones sobre lo que se vio.
 *  Sin denominador NO se calcula — un porcentaje sobre cero no significa nada. */
export const engagementRate = ({ engagement = null, views = null } = {}) => {
    const e = num(engagement); const v = num(views);
    if (e === null || v === null || v <= 0) return null;
    return (e / v) * 100;
};

// ════════════════════════════════════════════════════════════════════════════
// ESTADOS DE LA SINCRONIZACIÓN
//
// ⚠️ «SIN DATOS» Y «ERROR» SON COSAS DISTINTAS, y el punto 14 del pedido es
// exactamente eso: nunca representar un fallo de la API como «0
// visualizaciones». El catálogo es CERRADO: un estado inventado no se puede
// pintar ni filtrar.
// ════════════════════════════════════════════════════════════════════════════
export const SYNC_STATES = {
    never:        { label: 'Sin sincronizar',        tone: 'neutral', blocking: true },
    running:      { label: 'Sincronizando',          tone: 'info',    blocking: false },
    ok:           { label: 'Sincronización completa', tone: 'ok',      blocking: false },
    partial:      { label: 'Sincronizada en parte',  tone: 'warn',    blocking: false },
    no_permission:{ label: 'Permisos insuficientes', tone: 'warn',    blocking: true },
    token_expired:{ label: 'Token vencido',          tone: 'warn',    blocking: true },
    disconnected: { label: 'Cuenta desconectada',    tone: 'warn',    blocking: true },
    rate_limited: { label: 'Meta limitó las consultas', tone: 'warn', blocking: false },
    provider_down:{ label: 'Meta no disponible',     tone: 'warn',    blocking: false },
    error:        { label: 'Error de sincronización', tone: 'error',   blocking: true },
};
export const SYNC_STATE_KEYS = Object.keys(SYNC_STATES);
export const syncStateOf = (k) => SYNC_STATES[str(k)] || null;

/** Traduce el fallo de Meta a uno de los estados de arriba.
 *
 *  Los códigos son los de la Graph API. Ante la duda se devuelve `error`: un
 *  estado que no se reconoce no se disfraza de uno que sí. */
export const classifyMetaError = (err = {}) => {
    const code = num(err.code);
    const sub = num(err.error_subcode);
    const msg = str(err.message).toLowerCase();

    if (code === 190 || sub === 463 || sub === 467) return 'token_expired';
    if (code === 10 || (code >= 200 && code <= 299)) return 'no_permission';
    if (msg.includes('permission')) return 'no_permission';
    if (code === 4 || code === 17 || code === 32 || code === 613 || sub === 2446079) return 'rate_limited';
    if (msg.includes('rate limit') || msg.includes('too many calls')) return 'rate_limited';
    if (code === 1 || code === 2 || code === 500 || code === 503) return 'provider_down';
    // Una métrica que Meta retiró NO es un error de la cuenta: es el catálogo
    // que se quedó viejo. Se distingue para poder reclasificarla sola.
    if (code === 100 && (msg.includes('metric') || msg.includes('nonexisting field'))) return 'invalid_metric';
    return 'error';
};

/** ¿Vale la pena reintentar? Ante la duda, NO: un reintento que se va a
 *  repetir igual gasta presupuesto de la ventana de Meta y retrasa a los
 *  demás. Es la regla de `retryable` en las notificaciones (v4.855). */
export const isRetryable = (state) => state === 'rate_limited' || state === 'provider_down';

export default {
    GRAPH_VERSION, graphBase, INSIGHTS_SCOPES, METRIC_STATUS, METRIC_LEVELS,
    METRICS, metricsFor, metricByCanonical, insightMetricNames, canonicalMetrics,
    UI_ONLY_METRICS, TRACKING_START, isDayKey, dayToUtc, utcToDay, addDays,
    daysBetween, DATE_PRESETS, DATE_PRESET_IDS, resolveRange, previousRange,
    MAX_WINDOW_DAYS, splitWindows, effectiveStart, aggregate, compare,
    engagementRate, SYNC_STATES, SYNC_STATE_KEYS, syncStateOf, classifyMetaError,
    isRetryable,
};
