// ════════════════════════════════════════════════════════════════════════
// Lectura automatizada del «Panorama de la emergencia» — v4.825
//
// El CRITERIO, y nada más: sin base, sin red, sin IA, sin DOM. Qué fuente
// autoriza qué, cómo se lee una cifra, cuándo una lectura se puede publicar
// sola y cuándo tiene que mirarla una persona.
//
// ── POR QUÉ NO SE PUBLICA LO ÚLTIMO QUE APAREZCA EN INTERNET ────────────
//
// Se midió, sobre el propio sismo de San José del Palmar, con cortes de
// pocas horas de diferencia:
//
//   Infobae        14/08              284 fallecidos   102.000+ personas
//   ABC Economía   14/08              287 fallecidos
//   UNGRD (X)      14/08 4:30 p. m.   288 fallecidos   145.601 personas
//   El Contraste   15/08 6:30 a. m.   294 fallecidos   115.461 personas
//   UNGRD          15/08 6:30 p. m.   289 fallecidos
//
// Los fallecidos van 284 → 287 → 288 → 294 → 289 y las personas afectadas
// BAJAN de 145.601 a 115.461. Publicar «lo último» pondría una cifra
// distinta cada pocas horas —a veces hacia atrás, a veces contradiciendo a
// la propia UNGRD— firmada por Rotary. Eso no es un fallo técnico: es
// desinformación institucional.
//
// De ahí las cuatro reglas de este archivo:
//
//   1. UNA FUENTE CANÓNICA FIJA LA CIFRA. Las demás avisan de que hay
//      balance nuevo; su número nunca se publica solo. Es la misma jerarquía
//      que ya rige el módulo (`validateStats`: sin fuente no se publica).
//
//   2. UN RETROCESO NO SE RECHAZA: SE MARCA. Consolidar un balance quita
//      duplicados, así que una cifra puede bajar con toda legitimidad — la
//      UNGRD misma pasó de 294 a 289. Lo que no puede es bajar EN SILENCIO
//      y sola. Rechazarlo dejaría la página clavada en la cifra más alta que
//      alguien haya publicado nunca, que es el error opuesto y peor.
//
//   3. EL MODELO EXTRAE, EL CÓDIGO DECIDE. `parseExtraction` descarta lo que
//      no es del catálogo, lo que no es un entero y lo que viene con
//      calificador («más de», «cerca de»). Misma regla que
//      `templateComposer.js`, `seoAI.js` y `validateEmergencyCopy`.
//
//   4. LA AUTOMATIZACIÓN SÓLO TOCA LO QUE SE DECLARA SUYO (`metricKey`). Un
//      indicador escrito a mano no lo pisa nunca, igual que `putAuto`
//      respeta una traducción manual. Sin esa regla, la primera lectura
//      buena se lleva por delante lo que alguien corrigió.
// ════════════════════════════════════════════════════════════════════════

const str = (v, max) => String(v ?? '').trim().slice(0, max);
const arr = v => (Array.isArray(v) ? v : []);

// ─── Las métricas ───────────────────────────────────────────────────────
//
// Catálogo CERRADO, como las intenciones del CRM y los íconos sugeribles: lo
// que el modelo conteste fuera de acá se descarta. Una métrica inventada no
// la consume ningún indicador y terminaría publicada sin que nadie la
// hubiera pedido.
//
// `rises` NO significa «prohibido bajar» (ver regla 2 arriba): significa que
// bajar es lo bastante raro como para que no ocurra sola. Desaparecidos,
// personas y familias afectadas se mueven en los dos sentidos con toda
// normalidad —a alguien se lo encuentra, un censo se depura—, así que ahí un
// descenso no dice nada y no se marca.
export const FEED_METRICS = {
    fallecidos: { label: 'Personas fallecidas', rises: true },
    heridos: { label: 'Personas heridas', rises: true },
    desaparecidos: { label: 'Personas desaparecidas', rises: false },
    rescatados: { label: 'Personas rescatadas', rises: true },
    personas: { label: 'Personas afectadas', rises: false },
    familias: { label: 'Familias afectadas', rises: false },
    viviendasDestruidas: { label: 'Viviendas destruidas', rises: true },
    viviendasAveriadas: { label: 'Viviendas averiadas', rises: true },
    municipios: { label: 'Municipios afectados', rises: true },
    departamentos: { label: 'Departamentos afectados', rises: true },
};

export const METRIC_KEYS = Object.keys(FEED_METRICS);

export const metricLabel = k => FEED_METRICS[k]?.label || '';

// ─── Las fuentes ────────────────────────────────────────────────────────
//
// `oficial` es la única que AUTORIZA publicar. La distinción no es de
// prestigio: es de responsabilidad. Un medio que cita a la UNGRD introduce
// un eslabón más —y la tabla de arriba muestra que ese eslabón se equivoca—,
// así que sirve para enterarse de que hay balance nuevo y para nada más.
export const SOURCE_KINDS = {
    oficial: { label: 'Oficial — puede publicar', canPublish: true },
    secundaria: { label: 'Secundaria — sólo avisa', canPublish: false },
};

/** Formato en el que llega la cifra. Decide CÓMO se lee, no si vale. */
export const SOURCE_FORMATS = {
    texto: { label: 'Texto de la página' },
    imagen: { label: 'Infografía (imagen)' },
    json: { label: 'JSON / API' },
};

export const DEFAULT_MAX_JUMP_PCT = 40;   // salto máximo que se publica solo
export const MIN_POLL_MINUTES = 15;       // el piso: lo que tarda el cron en volver
export const MAX_SOURCES = 12;

// ─── Cada cuánto se consulta ────────────────────────────────────────────
//
// El cron pasa cada 15 minutos: ése es el PISO, no la frecuencia. Cada
// campaña elige la suya y el barrido saltea las que todavía no toca — cada
// vuelta gasta una llamada al modelo POR FUENTE, y un balance oficial no
// cambia doce veces por hora.
export const INTERVAL_OPTIONS = [
    { minutes: 15, label: 'Cada 15 minutos', hint: 'Lo más seguido posible. Para las primeras horas de una emergencia.' },
    { minutes: 30, label: 'Cada 30 minutos', hint: '' },
    { minutes: 60, label: 'Cada hora', hint: 'Lo habitual: los balances oficiales se publican una o dos veces al día.' },
    { minutes: 180, label: 'Cada 3 horas', hint: '' },
    { minutes: 360, label: 'Cada 6 horas', hint: '' },
    { minutes: 720, label: 'Dos veces al día', hint: '' },
    { minutes: 1440, label: 'Una vez al día', hint: 'Para una emergencia ya estabilizada.' },
];
export const DEFAULT_INTERVAL_MINUTES = 60;

// ─── Fuentes conocidas ──────────────────────────────────────────────────
//
// Plantillas para no tener que adivinar la AUTORIDAD y el FORMATO, que es la
// parte que no se puede deducir mirando una página: si una fuente puede fijar
// la cifra o sólo avisar, y si el balance viene como texto o como infografía.
//
// La DIRECCIÓN se pega a mano a propósito. Una nota de prensa o una
// infografía tienen una dirección distinta cada día, y dejar una escrita acá
// sería prometer una integración que no existe: son plantillas, no un
// conector. `url` es el punto de partida, no el sitio del que se lee.
export const FEED_PRESETS = [
    {
        id: 'ungrd-noticias',
        name: 'UNGRD',
        url: 'https://portal.gestiondelriesgo.gov.co/Paginas/Noticias.aspx',
        kind: 'oficial',
        format: 'texto',
        note: 'La entidad que publica el balance oficial. Es la única clase de fuente que puede fijar la cifra.',
    },
    {
        id: 'ungrd-infografia',
        name: 'UNGRD — balance (infografía)',
        url: '',
        kind: 'oficial',
        format: 'imagen',
        note: 'La UNGRD publica el balance como IMAGEN. Pegá la dirección de la imagen, no la de la página que la contiene.',
    },
    {
        id: 'medio',
        name: '',
        url: '',
        kind: 'secundaria',
        format: 'texto',
        note: 'Un medio de comunicación. Avisa de que hay balance nuevo; su cifra nunca se publica sola.',
    },
    {
        id: 'api',
        name: '',
        url: '',
        kind: 'oficial',
        format: 'json',
        note: 'Un endpoint que devuelve JSON. Si algún día hay uno estructurado, es el camino más fiable.',
    },
];

export function normalizeSource(raw, i = 0) {
    const kind = SOURCE_KINDS[str(raw?.kind, 20)] ? str(raw?.kind, 20) : 'secundaria';
    const format = SOURCE_FORMATS[str(raw?.format, 20)] ? str(raw?.format, 20) : 'texto';
    return {
        id: str(raw?.id, 40) || `src-${i}`,
        name: str(raw?.name, 120),
        url: str(raw?.url, 600),
        kind,
        format,
        active: raw?.active !== false,
    };
}

// ─── La configuración de la campaña ─────────────────────────────────────
//
// ADITIVA (regla del sitio): una campaña guardada antes de v4.825 no trae
// `feed` y `normalizeFeed` la deja apagada. Encenderla es un acto explícito.
export function normalizeFeed(raw) {
    const pct = Number(raw?.maxJumpPct);
    const min = Number(raw?.intervalMinutes);
    return {
        enabled: raw?.enabled === true,
        // APAGADA por omisión, y no por prudencia genérica: es la decisión
        // que pone una cifra en una página pública sin que nadie la mire.
        autoPublish: raw?.autoPublish === true,
        maxJumpPct: Number.isFinite(pct) && pct > 0 && pct <= 500 ? Math.round(pct) : DEFAULT_MAX_JUMP_PCT,
        // Se acota al catálogo: un valor libre dejaría poner «cada minuto» y
        // el cron no puede darlo —pasa cada 15—, así que sería una promesa
        // que la pantalla hace y la infraestructura no cumple.
        intervalMinutes: INTERVAL_OPTIONS.some(o => o.minutes === min) ? min : DEFAULT_INTERVAL_MINUTES,
        sources: arr(raw?.sources).slice(0, MAX_SOURCES).map(normalizeSource),
    };
}

/**
 * ¿Le toca a esta campaña en esta vuelta del cron?
 *
 * Puro y con `now` por parámetro para poder probarlo. `force` es «Leer
 * ahora»: el usuario pidió mirar, y hacerle esperar al intervalo sería
 * desobedecerlo.
 */
export function shouldRunNow({ feed, lastRunAt, now = new Date(), force = false } = {}) {
    const f = normalizeFeed(feed);
    if (!f.enabled) return { run: false, reason: 'apagada' };
    if (!f.sources.some(s => s.active && isFetchableUrl(s.url))) return { run: false, reason: 'sin_fuentes' };
    if (force) return { run: true, reason: '' };
    const t = lastRunAt ? new Date(lastRunAt).getTime() : 0;
    if (!t || Number.isNaN(t)) return { run: true, reason: '' };
    const faltan = t + f.intervalMinutes * 60_000 - (now instanceof Date ? now.getTime() : Date.now());
    return faltan > 0
        ? { run: false, reason: 'todavia_no', minutesLeft: Math.ceil(faltan / 60_000) }
        : { run: true, reason: '' };
}

export function validateFeed(feed) {
    const f = normalizeFeed(feed);
    const errors = [];
    if (!f.enabled) return errors;
    const activas = f.sources.filter(s => s.active);
    if (!activas.length) errors.push('La lectura automática está encendida y no hay ninguna fuente activa.');
    for (const s of activas) {
        if (!s.name) errors.push(`Una fuente no tiene nombre: es lo que se publica junto a la cifra.`);
        if (!isFetchableUrl(s.url)) {
            errors.push(`La fuente «${s.name || s.id}» necesita una dirección https válida.`);
        }
    }
    // Encender la auto-publicación sin una fuente que la autorice es un
    // interruptor que no hace nada: se dice, en vez de dejarlo pasar.
    if (f.autoPublish && !activas.some(s => SOURCE_KINDS[s.kind]?.canPublish)) {
        errors.push('La publicación automática está encendida pero ninguna fuente activa es oficial: nada se publicaría solo.');
    }
    return errors;
}

/**
 * Sólo `https`. Es una dirección que el SERVIDOR va a descargar y cuyo
 * contenido acaba en una página pública: el mismo criterio que el mapa de la
 * sede (v4.717) y las redirecciones (v4.781). `http`, `data:`, `file:` y
 * `javascript:` no entran.
 */
export function isFetchableUrl(raw) {
    const s = str(raw, 600);
    if (!s) return false;
    try {
        const u = new URL(s);
        if (u.protocol !== 'https:') return false;
        // Sin host no hay nada que descargar, y un host local apuntaría a la
        // propia red de la función (SSRF).
        const h = u.hostname.toLowerCase();
        if (!h || h === 'localhost' || h.endsWith('.localhost')) return false;
        if (/^\d+\.\d+\.\d+\.\d+$/.test(h) || h.includes(':')) return false;
        return true;
    } catch { return false; }
}

// ─── Leer una cifra ─────────────────────────────────────────────────────
//
// El separador de miles en Colombia es el PUNTO: «14.705» son catorce mil
// setecientos cinco, no catorce coma siete. Se aceptan sólo grupos de tres
// dígitos, que es lo que hace la lectura inequívoca; cualquier otra cosa se
// rechaza en vez de adivinarse. Estas cifras son enteros —personas, casas,
// municipios—: un decimal es señal de que se leyó mal.
const APROX = /\b(m[áa]s\s+de|cerca\s+de|alrededor\s+de|aproximadamente|unos|unas|casi|hasta)\b/i;

export function parseFigure(raw) {
    const s = str(raw, 60);
    if (!s) return null;
    const approx = APROX.test(s);
    const limpio = s.replace(APROX, '').trim();
    const m = limpio.match(/^\s*(\d{1,3}(?:\.\d{3})+|\d+)\s*$/);
    if (!m) return null;
    const n = Number(m[1].replace(/\./g, ''));
    if (!Number.isInteger(n) || n < 0 || n > 100_000_000) return null;
    return { value: n, approx };
}

/** «289» → «289»; «14705» → «14.705». Lo que se imprime en la página. */
export function formatFigure(n) {
    if (!Number.isFinite(n)) return '';
    return Math.round(n).toLocaleString('es-CO');
}

// ─── Lo que devuelve el modelo ──────────────────────────────────────────
//
// El modelo EXTRAE; acá se decide qué sobrevive. Se descarta —y se dice por
// qué— lo que no está en el catálogo, lo que no es un entero legible y lo
// que viene con calificador: «más de 102.000» no es una cifra, es una cota,
// y publicarla como dato sería afirmar algo que la fuente no afirmó.
export function parseExtraction(raw) {
    let obj = raw;
    if (typeof raw === 'string') {
        const m = raw.match(/\{[\s\S]*\}/);
        if (!m) return { figures: [], cutoff: '', descartes: ['La respuesta del modelo no traía JSON.'] };
        try { obj = JSON.parse(m[0]); } catch {
            return { figures: [], cutoff: '', descartes: ['La respuesta del modelo no era JSON válido.'] };
        }
    }
    const descartes = [];
    const figures = [];
    const vistas = new Set();
    for (const f of arr(obj?.figures)) {
        const metric = str(f?.metric, 40);
        if (!FEED_METRICS[metric]) { descartes.push(`«${metric || '(sin nombre)'}» no está en el catálogo.`); continue; }
        if (vistas.has(metric)) { descartes.push(`«${metricLabel(metric)}» venía dos veces.`); continue; }
        const cifra = parseFigure(f?.value);
        if (!cifra) { descartes.push(`«${metricLabel(metric)}»: «${str(f?.value, 40)}» no es una cifra legible.`); continue; }
        vistas.add(metric);
        figures.push({
            metric,
            value: cifra.value,
            approx: cifra.approx,
            quote: str(f?.quote, 300),
        });
    }
    return { figures, cutoff: parseCutoff(obj?.cutoff), descartes };
}

/**
 * La FECHA DE CORTE, que es el dato que ordena todo lo demás. Se acepta ISO
 * y `dd/mm/aaaa [hh:mm]`, que es como la escribe la UNGRD. Sin corte no hay
 * lectura: es lo único que distingue un balance nuevo de la copia de uno
 * viejo dando vueltas por Internet.
 */
export function parseCutoff(raw) {
    const s = str(raw, 40);
    if (!s) return '';
    const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ ,T]+(\d{1,2}):(\d{2}))?/);
    if (dmy) {
        const [, d, mo, y, h = '0', mi = '0'] = dmy;
        const t = Date.UTC(+y, +mo - 1, +d, +h, +mi);
        return Number.isNaN(t) ? '' : new Date(t).toISOString();
    }
    const t = new Date(s).getTime();
    return Number.isNaN(t) ? '' : new Date(t).toISOString();
}

// ─── El juicio ──────────────────────────────────────────────────────────
//
// Devuelve SIEMPRE una propuesta: `autoPublish` dice si puede aplicarse
// sola, `warnings` por qué no. Descartar en silencio es lo que este módulo
// lleva media docena de versiones aprendiendo a no hacer.
export function judgeReading({ figure, source, cutoff, current, publishedCutoff, feed, now }) {
    const f = normalizeFeed(feed);
    const src = normalizeSource(source);
    const warnings = [];
    const ahora = now instanceof Date ? now.getTime() : Date.now();

    if (!FEED_METRICS[figure?.metric]) {
        return { ok: false, autoPublish: false, warnings: ['Métrica desconocida.'], reason: 'metrica' };
    }
    const corte = parseCutoff(cutoff);
    if (!corte) {
        return { ok: false, autoPublish: false, warnings: ['La lectura no trae fecha de corte.'], reason: 'sin_corte' };
    }
    // Un corte en el futuro es una fecha mal leída, no un balance anticipado.
    // Se toleran doce horas: la función corre en UTC y los cortes se
    // publican en hora de Colombia.
    if (new Date(corte).getTime() > ahora + 12 * 3600e3) {
        return { ok: false, autoPublish: false, warnings: ['La fecha de corte está en el futuro.'], reason: 'corte_futuro' };
    }
    // Más viejo que lo publicado: no es una actualización. Es la guarda que
    // impide que una nota antigua recirculada retroceda la página.
    const previo = parseCutoff(publishedCutoff);
    if (previo && new Date(corte).getTime() <= new Date(previo).getTime()) {
        return { ok: false, autoPublish: false, warnings: ['El corte no es más nuevo que el ya publicado.'], reason: 'viejo' };
    }

    let autoPublish = f.enabled && f.autoPublish;

    if (!SOURCE_KINDS[src.kind]?.canPublish) {
        autoPublish = false;
        warnings.push(`«${src.name || 'la fuente'}» es secundaria: avisa del balance, pero su cifra no se publica sola.`);
    }
    if (figure.approx) {
        autoPublish = false;
        warnings.push('La cifra viene con un calificador («más de», «cerca de»): es una cota, no un dato.');
    }

    const antes = Number.isFinite(current) ? current : null;
    let delta = null;
    let deltaPct = null;
    if (antes !== null) {
        delta = figure.value - antes;
        deltaPct = antes > 0 ? Math.abs(delta) / antes * 100 : (delta === 0 ? 0 : Infinity);
        if (delta < 0 && FEED_METRICS[figure.metric].rises) {
            autoPublish = false;
            warnings.push(
                `Retrocede: ${formatFigure(antes)} → ${formatFigure(figure.value)}. `
                + 'Puede ser una consolidación legítima o una lectura equivocada; conviene mirarla.',
            );
        }
        if (deltaPct > f.maxJumpPct) {
            autoPublish = false;
            warnings.push(
                `El salto es del ${Math.round(deltaPct)} %, por encima del ${f.maxJumpPct} % configurado.`,
            );
        }
    }

    return {
        ok: true,
        autoPublish,
        warnings,
        reason: '',
        metric: figure.metric,
        label: metricLabel(figure.metric),
        before: antes,
        after: figure.value,
        delta,
        deltaPct: deltaPct === null || deltaPct === Infinity ? null : Math.round(deltaPct * 10) / 10,
        cutoff: corte,
        sourceId: src.id,
        sourceName: src.name,
    };
}

/**
 * La llave de deduplicación. La misma lectura vista dos veces —el cron cada
 * quince minutos sobre una página que no cambió— no puede dejar dos
 * propuestas. Mismo mecanismo que `dedupeKey` en `crmEventBus.js`.
 */
export function readingKey({ campaignId, sourceId, metric, cutoff, value }) {
    return [
        str(campaignId, 40), str(sourceId, 40), str(metric, 40),
        parseCutoff(cutoff), String(value),
    ].join('|');
}

// ─── Aplicar una lectura a los indicadores ──────────────────────────────
//
// SÓLO toca el indicador que declara ser esa métrica (`metricKey`). Uno
// escrito a mano no se pisa jamás: es la regla de `putAuto` con las
// traducciones, y acá importa más, porque lo que se pisaría es una cifra que
// alguien corrigió a sabiendas.
//
// Si ningún indicador la declara, se AGREGA. La alternativa —descartar la
// lectura— dejaría al operador sin forma de estrenar una métrica salvo
// escribiéndola a mano, que es justo el trabajo que esto viene a quitar.
export function applyReading(stats, reading, { addIfMissing = true } = {}) {
    const lista = arr(stats).map(s => ({ ...s }));
    const i = lista.findIndex(s => str(s?.metricKey, 40) === reading.metric);
    const valor = formatFigure(reading.after);
    const fuente = reading.sourceName
        ? `${reading.sourceName}, corte ${formatCutoff(reading.cutoff)}`
        : `Corte ${formatCutoff(reading.cutoff)}`;

    if (i >= 0) {
        lista[i] = { ...lista[i], value: valor, source: fuente, updatedAt: reading.cutoff };
        return { stats: lista, added: false };
    }
    if (!addIfMissing) return { stats: lista, added: false };
    lista.push({
        id: `stat-${reading.metric}`,
        metricKey: reading.metric,
        label: reading.label,
        value: valor,
        source: fuente,
        updatedAt: reading.cutoff,
        // Nace ACTIVO: el operador acaba de aplicar la lectura a propósito.
        // Nacer apagado obligaría a un segundo gesto que nadie adivina.
        active: true,
    });
    return { stats: lista, added: true };
}

/** «2026-08-15T18:30:00Z» → «15/08/2026 6:30 p. m.», que es como se cita. */
export function formatCutoff(iso) {
    const t = new Date(str(iso, 40)).getTime();
    if (Number.isNaN(t)) return '';
    const d = new Date(t);
    const dd = String(d.getUTCDate()).padStart(2, '0');
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const hh = d.getUTCHours();
    const mi = String(d.getUTCMinutes()).padStart(2, '0');
    if (hh === 0 && mi === '00') return `${dd}/${mm}/${d.getUTCFullYear()}`;
    const ampm = hh < 12 ? 'a. m.' : 'p. m.';
    const h12 = hh % 12 === 0 ? 12 : hh % 12;
    return `${dd}/${mm}/${d.getUTCFullYear()} ${h12}:${mi} ${ampm}`;
}

/** El corte más nuevo ya publicado para esa métrica. */
export function publishedCutoffOf(stats, metric) {
    for (const s of arr(stats)) {
        if (str(s?.metricKey, 40) === metric) return str(s?.updatedAt, 40);
    }
    return '';
}

/** El valor publicado para esa métrica, como número. */
export function publishedValueOf(stats, metric) {
    for (const s of arr(stats)) {
        if (str(s?.metricKey, 40) !== metric) continue;
        const f = parseFigure(s?.value);
        return f ? f.value : null;
    }
    return null;
}

// ─── El prompt de extracción ────────────────────────────────────────────
//
// Corto y en positivo, como el resto del sitio. Se le pide lo que SÍ debe
// hacer —copiar lo que está escrito— y se le da la salida honesta: si no lo
// ve, lo omite. Sin esa salida, un modelo rellena.
//
// El catálogo se arma desde `FEED_METRICS` y no desde una segunda lista: una
// métrica nueva quedaría fuera del prompt y no se extraería nunca.
export function buildExtractionPrompt() {
    const catalogo = METRIC_KEYS.map(k => `- ${k}: ${FEED_METRICS[k].label}`).join('\n');
    return [
        'Sos un lector de balances oficiales de emergencias en Colombia.',
        'Te dan una página o una infografía de un reporte de afectaciones.',
        '',
        'Devolvé SÓLO un objeto JSON con esta forma:',
        '{"cutoff":"dd/mm/aaaa hh:mm","figures":[{"metric":"fallecidos","value":"289","quote":"289 Personas Fallecidas"}]}',
        '',
        'Métricas posibles (usá exactamente estas claves):',
        catalogo,
        '',
        'Reglas:',
        '- `value` se copia TAL CUAL aparece, con sus puntos de miles.',
        '- `quote` es el fragmento donde lo leíste, para que se pueda verificar.',
        '- `cutoff` es la fecha y hora de corte que declara el reporte.',
        '- Incluí sólo las métricas que estén escritas. Si una no aparece, omitila.',
        '- Si el documento no es un balance de afectaciones, devolvé {"figures":[]}.',
    ].join('\n');
}

export default {
    FEED_METRICS, METRIC_KEYS, metricLabel, SOURCE_KINDS, SOURCE_FORMATS,
    DEFAULT_MAX_JUMP_PCT, MIN_POLL_MINUTES, MAX_SOURCES,
    INTERVAL_OPTIONS, DEFAULT_INTERVAL_MINUTES, FEED_PRESETS, shouldRunNow,
    normalizeSource, normalizeFeed, validateFeed, isFetchableUrl,
    parseFigure, formatFigure, parseExtraction, parseCutoff,
    judgeReading, readingKey, applyReading, formatCutoff,
    publishedCutoffOf, publishedValueOf, buildExtractionPrompt,
};
