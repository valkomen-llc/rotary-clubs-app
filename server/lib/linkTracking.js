// ════════════════════════════════════════════════════════════════════
// Medición de una redirección — el CRITERIO
//
// PURO a propósito: sin base, sin red, sin `process.env` y sin `node:crypto`.
// Decide qué se cuenta como clic humano, de dónde vino y con qué dispositivo,
// y esas tres decisiones tienen que poder probarse sin infraestructura — mismo
// reparto que `linkRedirects.js` frente a `linkRedirectStore.js`, y que
// `seoRules.js` frente a `seoAudit.js`.
//
// LO QUE ESTE MÓDULO NO HACE: adivinar. Si el navegador no manda `Referer` y no
// hay UTM, la visita es DIRECTA/DESCONOCIDA y se dice así. Atribuirle un clic a
// WhatsApp porque «suele compartirse por ahí» es inventar la única cifra por la
// que alguien va a tomar una decisión.
// ════════════════════════════════════════════════════════════════════

// ── Bots, rastreadores y vistas previas ─────────────────────────────────────
//
// Importa MÁS que en una web normal: una dirección corta se comparte por
// WhatsApp, y WhatsApp pide el enlace UNA VEZ POR CHAT para dibujar la tarjeta
// de vista previa. Contar eso como visita infla el número justo en el caso de
// uso principal del módulo, y lo infla en proporción a lo bien que se compartió.
//
// El bot SÍ se redirige —la vista previa necesita llegar al destino para sacar
// el título y la imagen— y SÍ se cuenta, pero en su propio contador: se muestra
// aparte, nunca sumado a los clics.
export const BOT_SIGNATURES = [
    // Vistas previas de mensajería y redes. Son las que más ruido meten.
    { re: /whatsapp/i, kind: 'preview', label: 'Vista previa de WhatsApp' },
    { re: /facebookexternalhit|facebookcatalog|facebookbot/i, kind: 'preview', label: 'Vista previa de Facebook' },
    { re: /instagram/i, kind: 'preview', label: 'Vista previa de Instagram' },
    { re: /twitterbot/i, kind: 'preview', label: 'Vista previa de X' },
    { re: /telegrambot/i, kind: 'preview', label: 'Vista previa de Telegram' },
    { re: /slackbot|slack-imgproxy/i, kind: 'preview', label: 'Vista previa de Slack' },
    { re: /discordbot/i, kind: 'preview', label: 'Vista previa de Discord' },
    { re: /linkedinbot/i, kind: 'preview', label: 'Vista previa de LinkedIn' },
    { re: /skypeuripreview|redditbot|pinterest|vkshare|tumblr|nuzzel/i, kind: 'preview', label: 'Vista previa de otra red' },
    { re: /embedly|outbrain|iframely|snapchat|quora link preview/i, kind: 'preview', label: 'Vista previa de otra red' },

    // Buscadores.
    { re: /googlebot|google-inspectiontool|storebot-google|adsbot-google/i, kind: 'crawler', label: 'Google' },
    { re: /bingbot|adidxbot|bingpreview/i, kind: 'crawler', label: 'Bing' },
    { re: /yandex(bot|images)/i, kind: 'crawler', label: 'Yandex' },
    { re: /duckduckbot|baiduspider|applebot|petalbot|seznambot/i, kind: 'crawler', label: 'Otro buscador' },
    { re: /ahrefsbot|semrushbot|mj12bot|dotbot|screaming frog/i, kind: 'crawler', label: 'Rastreador de SEO' },

    // Comprobaciones automáticas y herramientas.
    { re: /uptimerobot|pingdom|statuscake|newrelic|datadog|betteruptime/i, kind: 'monitor', label: 'Monitor de disponibilidad' },
    { re: /vercel|lighthouse|chrome-lighthouse|pagespeed|gtmetrix/i, kind: 'monitor', label: 'Comprobación de la plataforma' },
    { re: /curl\/|wget\/|python-requests|python-urllib|go-http-client|java\/|okhttp|axios\/|node-fetch|libwww-perl|httpie|postman/i, kind: 'tool', label: 'Herramienta automática' },
    { re: /headlesschrome|phantomjs|puppeteer|playwright|selenium/i, kind: 'tool', label: 'Navegador automatizado' },

    // Genéricos, al final: `bot` aparece dentro de muchas cadenas legítimas
    // (`Cubot`, un teléfono real), así que se exige un límite de palabra.
    { re: /\b(bot|crawler|spider|scraper|archiver|monitoring)\b/i, kind: 'crawler', label: 'Rastreador' },
];

/**
 * ¿Esto es una persona o una máquina?
 *
 * Mira el user-agent y también las cabeceras de INTENCIÓN que el propio
 * navegador declara: `Sec-Purpose: prefetch` es Chrome precargando el enlace
 * porque el usuario pasó el cursor por encima, y eso no es un clic — nadie
 * decidió nada todavía.
 *
 * Un user-agent VACÍO cuenta como automático: todo navegador real manda uno, y
 * lo que llega sin él es casi siempre un script.
 */
export function classifyAgent(userAgent, headers = {}) {
    const ua = String(userAgent ?? '').trim();
    // Las cabeceras se buscan SIN distinguir mayúsculas. Express ya las entrega
    // en minúsculas, pero esta función también la llama la prueba y podría
    // llamarla otro camino: si la búsqueda dependiera de cómo vino escrita, un
    // `Purpose: prefetch` legítimo se contaría como clic humano.
    const bajas = {};
    for (const [k, v] of Object.entries(headers || {})) bajas[String(k).toLowerCase()] = v;
    const h = (name) => String(bajas[String(name).toLowerCase()] ?? '').toLowerCase();

    const purpose = h('sec-purpose') || h('purpose') || h('x-purpose') || h('x-moz');
    if (/prefetch|prerender|preview/.test(purpose)) {
        return { isBot: true, botKind: 'prefetch', botLabel: 'Precarga del navegador' };
    }
    if (!ua) return { isBot: true, botKind: 'tool', botLabel: 'Sin identificar' };

    const hit = BOT_SIGNATURES.find(s => s.re.test(ua));
    if (hit) return { isBot: true, botKind: hit.kind, botLabel: hit.label };

    return { isBot: false, botKind: '', botLabel: '' };
}

// ── Dispositivo, navegador y sistema ────────────────────────────────────────
//
// Se lee del user-agent y nada más. No se agrega una librería: son decenas de
// megabytes de tablas para distinguir modelos de teléfono que esta pantalla no
// muestra. Lo que hace falta son tres respuestas gruesas y fiables.

/** `movil` | `tablet` | `desktop`. El orden importa: un iPad dice «Macintosh». */
export function parseUserAgent(userAgent) {
    const ua = String(userAgent ?? '');
    if (!ua) return { device: 'desconocido', browser: '', os: '' };

    const esTablet = /\b(ipad|tablet|playbook|silk)\b/i.test(ua)
        || (/android/i.test(ua) && !/mobile/i.test(ua));
    const esMovil = !esTablet && /\b(mobi|iphone|ipod|android|blackberry|iemobile|opera mini)\b/i.test(ua);
    const device = esTablet ? 'tablet' : esMovil ? 'movil' : 'desktop';

    // El orden es el que evita los falsos positivos: Edge dice «Chrome» y
    // «Safari»; Chrome dice «Safari»; Opera dice «Chrome».
    let browser = 'Otro';
    if (/\bedg(e|a|ios)?\//i.test(ua)) browser = 'Edge';
    else if (/\b(opr|opera)\//i.test(ua)) browser = 'Opera';
    else if (/\bsamsungbrowser\//i.test(ua)) browser = 'Samsung Internet';
    else if (/\bfxios\/|\bfirefox\//i.test(ua)) browser = 'Firefox';
    else if (/\bcrios\/|\bchrome\//i.test(ua)) browser = 'Chrome';
    else if (/\bsafari\//i.test(ua)) browser = 'Safari';

    let os = 'Otro';
    if (/\bwindows nt\b/i.test(ua)) os = 'Windows';
    else if (/\b(iphone|ipad|ipod)\b/i.test(ua) || /\bcpu (iphone )?os \d/i.test(ua)) os = 'iOS';
    else if (/\bmac os x\b|\bmacintosh\b/i.test(ua)) os = 'macOS';
    else if (/\bandroid\b/i.test(ua)) os = 'Android';
    else if (/\bcros\b/i.test(ua)) os = 'ChromeOS';
    else if (/\blinux\b/i.test(ua)) os = 'Linux';

    return { device, browser, os };
}

// ── De dónde vino ───────────────────────────────────────────────────────────

/** Los cinco parámetros de campaña, tal como los escribió quien armó el enlace. */
export const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];

/**
 * Lee los UTM de la query con la que llegó la visita.
 *
 * Se leen ANTES de resolver el salto —son parte del clic, no del destino— y se
 * guardan aunque el enlace esté configurado para no propagarlos: medir y
 * reenviar son dos decisiones distintas.
 */
export function readUtm(search) {
    const raw = String(search ?? '');
    const qs = raw.startsWith('?') ? raw.slice(1) : raw;
    const out = { utmSource: '', utmMedium: '', utmCampaign: '', utmContent: '', utmTerm: '' };
    if (!qs) return out;
    let params;
    try { params = new URLSearchParams(qs); } catch { return out; }
    const camel = {
        utm_source: 'utmSource', utm_medium: 'utmMedium', utm_campaign: 'utmCampaign',
        utm_content: 'utmContent', utm_term: 'utmTerm',
    };
    for (const k of UTM_KEYS) {
        const v = params.get(k);
        if (v) out[camel[k]] = String(v).trim().slice(0, 120);
    }
    return out;
}

/**
 * Las fuentes que se reconocen POR EVIDENCIA. Cada una exige que el `Referer`
 * lo diga: no hay ninguna regla que deduzca la plataforma de otra cosa.
 */
export const SOURCE_RULES = [
    { kind: 'whatsapp', label: 'WhatsApp', re: /(^|\.)(whatsapp\.com|wa\.me)$/i },
    { kind: 'facebook', label: 'Facebook', re: /(^|\.)(facebook\.com|fb\.com|fb\.me)$/i },
    { kind: 'instagram', label: 'Instagram', re: /(^|\.)(instagram\.com)$/i },
    { kind: 'x', label: 'X (Twitter)', re: /(^|\.)(twitter\.com|x\.com|t\.co)$/i },
    { kind: 'linkedin', label: 'LinkedIn', re: /(^|\.)(linkedin\.com|lnkd\.in)$/i },
    { kind: 'telegram', label: 'Telegram', re: /(^|\.)(telegram\.org|t\.me)$/i },
    { kind: 'tiktok', label: 'TikTok', re: /(^|\.)(tiktok\.com)$/i },
    { kind: 'youtube', label: 'YouTube', re: /(^|\.)(youtube\.com|youtu\.be)$/i },
    { kind: 'google', label: 'Google', re: /(^|\.)(google\.[a-z.]+|googleusercontent\.com)$/i },
    { kind: 'bing', label: 'Bing', re: /(^|\.)(bing\.com)$/i },
    { kind: 'email', label: 'Correo', re: /(^|\.)(mail\.google\.com|outlook\.[a-z.]+|mail\.yahoo\.com)$/i },
];

/** El host de un `Referer`, o cadena vacía si no se puede leer. */
export function referrerHost(referrer) {
    const r = String(referrer ?? '').trim();
    if (!r) return '';
    try { return new URL(r).hostname.toLowerCase().replace(/^www\./, ''); }
    catch { return ''; }
}

/**
 * De dónde vino este clic, con la evidencia que lo sostiene.
 *
 * El orden NO es negociable y es la regla del módulo:
 *   1. UTM  — lo declaró quien armó el enlace. Es la evidencia más fuerte.
 *   2. Referer — lo declaró el navegador.
 *   3. Nada — `directo`. Y se dice «Directo o desconocido», porque las dos
 *      cosas se ven igual desde acá: WhatsApp en el móvil NO manda `Referer`,
 *      así que su tráfico legítimo cae aquí. Rotularlo «Directo» a secas haría
 *      creer que nadie llegó por el enlace que se compartió.
 *
 * `evidence` viaja a la pantalla justamente para que ese matiz se pueda leer.
 */
export function attributeSource({ referrer = '', utm = {} } = {}) {
    const host = referrerHost(referrer);

    if (utm.utmSource) {
        return { kind: 'campana', label: utm.utmSource, referrerHost: host, evidence: 'utm' };
    }

    if (host) {
        const hit = SOURCE_RULES.find(s => s.re.test(host));
        if (hit) return { kind: hit.kind, label: hit.label, referrerHost: host, evidence: 'referrer' };
        return { kind: 'referencia', label: host, referrerHost: host, evidence: 'referrer' };
    }

    return { kind: 'directo', label: 'Directo o desconocido', referrerHost: '', evidence: 'ninguna' };
}

// ── El identificador del visitante ──────────────────────────────────────────

/**
 * La SEMILLA del identificador seudónimo. El hash lo hace el store, que es
 * quien tiene la sal; acá vive la decisión de QUÉ entra en él.
 *
 * LA IP NO SE GUARDA EN NINGUNA PARTE. Entra en la semilla y sale como hash; lo
 * que se persiste es el hash. Es lo que permite contar visitantes sin conservar
 * un dato que identifica a una persona.
 *
 * El `clubId` entra a propósito: sin él, la misma persona tendría el mismo
 * identificador en los enlaces de dos organizaciones distintas del ecosistema,
 * y eso es exactamente el rastreo entre sitios que no queremos poder hacer.
 */
export function visitorSeed({ clubId = '', ip = '', userAgent = '' } = {}) {
    const ipLimpia = String(ip ?? '').trim().split(',')[0].trim().toLowerCase();
    // Un user-agent completo es casi una huella; se recorta a la parte estable.
    const ua = String(userAgent ?? '').trim().slice(0, 180);
    return `${clubId} ${ipLimpia} ${ua}`;
}

/**
 * ¿Se puede identificar al visitante? Sin IP y sin user-agent, la semilla sería
 * la misma para todo el mundo y el contador de «visitantes únicos» diría 1 para
 * siempre. Ante la duda, el clic se cuenta y el visitante NO.
 */
export function canIdentifyVisitor({ ip = '', userAgent = '' } = {}) {
    return Boolean(String(ip ?? '').trim() || String(userAgent ?? '').trim());
}

// ── El salto ────────────────────────────────────────────────────────────────

/**
 * El código HTTP que corresponde.
 *
 * 302 por defecto, y es la decisión importante: un 301 lo cachean el navegador
 * y los proxies durante meses, así que un destino corregido sigue llevando al
 * viejo para quien ya lo visitó — y además deja de contar el clic, porque el
 * navegador ya no vuelve a preguntar. Un enlace medible NO puede ser permanente
 * salvo que alguien lo elija a sabiendas.
 *
 * Para un método que no es GET se usan 307/308: 301 y 302 autorizan al
 * navegador a cambiar el método a GET y perder el cuerpo.
 */
export function redirectStatus({ permanent = false, method = 'GET' } = {}) {
    const m = String(method ?? 'GET').toUpperCase();
    const seguro = m === 'GET' || m === 'HEAD';
    if (permanent) return seguro ? 301 : 308;
    return seguro ? 302 : 307;
}

/**
 * La query que se propaga al destino.
 *
 * `forwardQuery` es del enlace, no global: propagarla es lo correcto para una
 * inscripción —los UTM tienen que llegar al formulario para que su propia
 * analítica los vea— y es ruido para un destino que no los entiende. Los UTM
 * se MIDEN siempre, se propaguen o no.
 */
export function forwardedSearch(search, { forwardQuery = true } = {}) {
    if (!forwardQuery) return '';
    const raw = String(search ?? '');
    if (!raw || raw === '?') return '';
    return raw.startsWith('?') ? raw : '?' + raw;
}

// ── La forma del clic ───────────────────────────────────────────────────────

/** Un valor de cabecera puede venir percent-encoded (Vercel manda la ciudad así). */
function decodeSafe(value) {
    const v = String(value ?? '').trim();
    if (!v) return '';
    try { return decodeURIComponent(v); } catch { return v; }
}

/**
 * Todo lo que se sabe de una visita, en UN solo sitio.
 *
 * Existe para que el camino no pueda divergir: la resolución pública, la prueba
 * y cualquier otro consumidor arman el evento con esta función y no leyendo
 * cabeceras por su cuenta.
 */
export function describeClick({ headers = {}, search = '', userAgent = '', ip = '', method = 'GET', clubId = '' } = {}) {
    const bajas = {};
    for (const [k, v] of Object.entries(headers || {})) bajas[String(k).toLowerCase()] = v;
    const h = (...names) => {
        for (const n of names) {
            const v = bajas[String(n).toLowerCase()];
            if (v) return String(Array.isArray(v) ? v[0] : v);
        }
        return '';
    };

    const agente = classifyAgent(userAgent, headers);
    const utm = readUtm(search);
    const referrer = h('referer', 'referrer');
    const fuente = attributeSource({ referrer, utm });
    const dispositivo = parseUserAgent(userAgent);

    // El país lo entrega la red, no la IP: no hace falta conservarla para
    // saberlo. Los tres nombres cubren Vercel, Cloudflare y un proxy propio.
    // Se valida ANTES de recortar: recortando primero, un valor basura como
    // `XYZ1` se convierte en `XY`, que parece un país y no lo es.
    const pais = h('x-vercel-ip-country', 'cf-ipcountry', 'x-geo-country').trim().toUpperCase();
    const region = decodeSafe(h('x-vercel-ip-country-region', 'x-geo-region')).slice(0, 80);
    const ciudad = decodeSafe(h('x-vercel-ip-city', 'cf-ipcity', 'x-geo-city')).slice(0, 120);

    return {
        ...agente,
        ...utm,
        ...dispositivo,
        referrer: String(referrer).slice(0, 500),
        referrerHost: fuente.referrerHost,
        sourceKind: fuente.kind,
        sourceLabel: String(fuente.label).slice(0, 120),
        sourceEvidence: fuente.evidence,
        country: /^[A-Z]{2}$/.test(pais) ? pais : '',
        region,
        city: ciudad,
        userAgent: String(userAgent ?? '').slice(0, 400),
        method: String(method ?? 'GET').toUpperCase(),
        seed: visitorSeed({ clubId, ip, userAgent }),
        identifiable: canIdentifyVisitor({ ip, userAgent }),
    };
}

// ── Períodos de la pantalla de estadísticas ─────────────────────────────────

export const PERIODS = {
    hoy: { label: 'Hoy', days: 1 },
    d7: { label: 'Últimos 7 días', days: 7 },
    d30: { label: 'Últimos 30 días', days: 30 },
    d90: { label: 'Últimos 90 días', days: 90 },
    todo: { label: 'Todo el historial', days: 0 },
};

/**
 * La zona en la que se cuentan los DÍAS. La función corre en UTC y «hoy» no
 * significa lo mismo en Bogotá que en Madrid: con los cortes en UTC, un clic de
 * las 8 de la noche en Colombia cae en el día siguiente y el gráfico se lee mal
 * justo en la franja de más tráfico. Es la misma decisión que la ventana horaria
 * del CRM y que la franja de la Distribución.
 */
export const DEFAULT_STATS_TZ = 'America/Bogota';

/**
 * El día al que pertenece un instante, en la zona pedida. `YYYY-MM-DD`.
 *
 * PURO: `Intl` es cálculo, no E/S. Se usa al ESCRIBIR el agregado diario y al
 * LEER el rango, y tiene que ser la misma función en los dos sitios — con dos
 * formas de decidir el día, el gráfico y el contador dirían cosas distintas
 * sobre el mismo clic.
 */
export function dayKey(date, timeZone = DEFAULT_STATS_TZ) {
    const d = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(d.getTime())) return '';
    try {
        // `en-CA` da exactamente `YYYY-MM-DD`.
        return new Intl.DateTimeFormat('en-CA', {
            timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
        }).format(d);
    } catch {
        return d.toISOString().slice(0, 10);
    }
}

/** Suma días a una clave `YYYY-MM-DD` sin pasar por la zona horaria. */
export function shiftDayKey(key, days) {
    const [y, m, d] = String(key).split('-').map(Number);
    if (!y || !m || !d) return '';
    const t = Date.UTC(y, m - 1, d) + days * 86400000;
    return new Date(t).toISOString().slice(0, 10);
}

/**
 * El rango de un período, en claves de día. `now` es un PARÁMETRO —igual que en
 * `designSpec` y en `lifecycleSpec`— porque una función que consulta el reloj
 * por dentro no se puede probar.
 *
 * El día se cuenta ENTERO: acotar «últimos 7 días» a esta misma hora de hace una
 * semana deja fuera media jornada y el número no cuadra con el gráfico.
 */
export function periodRange(period, now = new Date(), timeZone = DEFAULT_STATS_TZ) {
    const spec = PERIODS[period] || PERIODS.d30;
    const hoy = dayKey(now, timeZone);
    if (!spec.days) return { fromDay: null, toDay: hoy, days: 0, label: spec.label, timeZone };
    return {
        fromDay: shiftDayKey(hoy, -(spec.days - 1)),
        toDay: hoy,
        days: spec.days,
        label: spec.label,
        timeZone,
    };
}

/**
 * Rellena los días sin clics del rango. Sin esto el gráfico une dos puntos
 * lejanos con una recta y hace creer que hubo tráfico donde no lo hubo.
 */
export function fillDays(rows, { fromDay, toDay } = {}) {
    if (!fromDay || !toDay) return Array.isArray(rows) ? rows : [];
    const porDia = new Map((rows || []).map(r => [String(r.day), r]));
    const out = [];
    let cursor = fromDay;
    // Tope defensivo: un rango absurdo no puede colgar la respuesta.
    for (let i = 0; i < 400 && cursor <= toDay; i++) {
        const hit = porDia.get(cursor);
        out.push({
            day: cursor,
            clicks: Number(hit?.clicks || 0),
            uniques: Number(hit?.uniques || 0),
            bots: Number(hit?.bots || 0),
        });
        cursor = shiftDayKey(cursor, 1);
    }
    return out;
}

export default {
    BOT_SIGNATURES, classifyAgent, parseUserAgent,
    UTM_KEYS, readUtm, SOURCE_RULES, referrerHost, attributeSource,
    visitorSeed, canIdentifyVisitor,
    redirectStatus, forwardedSearch, describeClick,
    PERIODS, DEFAULT_STATS_TZ, dayKey, shiftDayKey, periodRange, fillDays,
};
