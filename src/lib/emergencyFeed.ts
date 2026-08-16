// ════════════════════════════════════════════════════════════════════════
// Espejo en el navegador de `server/lib/emergencyFeed.js` — v4.825
//
// Sólo lo que el editor necesita para avisar EN VIVO con el mismo criterio
// del servidor: qué dirección se acepta, cuándo la configuración no hace lo
// que promete, y cómo se rotula una cifra o un corte.
//
// Está duplicado A PROPÓSITO, igual que `contributionSpec.ts`, y por el mismo
// motivo: el servidor no puede importar del bundle ni al revés. `test:
// contribution` carga los dos y compara LAS SALIDAS de las funciones, no las
// constantes — si cambia uno, cambiar el otro.
// ════════════════════════════════════════════════════════════════════════

const str = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);
const arr = (v: unknown) => (Array.isArray(v) ? v : []);

export interface FeedSource {
    id: string;
    name: string;
    url: string;
    kind: string;
    format: string;
    active: boolean;
}

export interface EmergencyFeed {
    enabled: boolean;
    autoPublish: boolean;
    maxJumpPct: number;
    intervalMinutes: number;
    sources: FeedSource[];
}

export const FEED_METRICS: Record<string, { label: string; rises: boolean }> = {
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
export const metricLabel = (k: string) => FEED_METRICS[k]?.label || '';

export const SOURCE_KINDS: Record<string, { label: string; canPublish: boolean }> = {
    oficial: { label: 'Oficial — puede publicar', canPublish: true },
    secundaria: { label: 'Secundaria — sólo avisa', canPublish: false },
};

export const SOURCE_FORMATS: Record<string, { label: string }> = {
    texto: { label: 'Texto de la página' },
    imagen: { label: 'Infografía (imagen)' },
    json: { label: 'JSON / API' },
};

export const DEFAULT_MAX_JUMP_PCT = 40;
export const MAX_SOURCES = 12;

// El cron pasa cada 15 minutos: ése es el PISO, no la frecuencia.
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

// Plantillas de fuente: fijan la AUTORIDAD y el FORMATO, que es la parte que
// no se puede deducir mirando una página. La DIRECCIÓN se pega a mano — una
// nota o una infografía tienen una distinta cada día, y dejarla escrita sería
// prometer una integración que no existe.
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

export function normalizeSource(raw: any, i = 0): FeedSource {
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

export function normalizeFeed(raw: any): EmergencyFeed {
    const pct = Number(raw?.maxJumpPct);
    const min = Number(raw?.intervalMinutes);
    return {
        enabled: raw?.enabled === true,
        autoPublish: raw?.autoPublish === true,
        maxJumpPct: Number.isFinite(pct) && pct > 0 && pct <= 500 ? Math.round(pct) : DEFAULT_MAX_JUMP_PCT,
        intervalMinutes: INTERVAL_OPTIONS.some(o => o.minutes === min) ? min : DEFAULT_INTERVAL_MINUTES,
        sources: arr(raw?.sources).slice(0, MAX_SOURCES).map(normalizeSource),
    };
}

export function validateFeed(feed: any): string[] {
    const f = normalizeFeed(feed);
    const errors: string[] = [];
    if (!f.enabled) return errors;
    const activas = f.sources.filter(s => s.active);
    if (!activas.length) errors.push('La lectura automática está encendida y no hay ninguna fuente activa.');
    for (const s of activas) {
        if (!s.name) errors.push(`Una fuente no tiene nombre: es lo que se publica junto a la cifra.`);
        if (!isFetchableUrl(s.url)) {
            errors.push(`La fuente «${s.name || s.id}» necesita una dirección https válida.`);
        }
    }
    if (f.autoPublish && !activas.some(s => SOURCE_KINDS[s.kind]?.canPublish)) {
        errors.push('La publicación automática está encendida pero ninguna fuente activa es oficial: nada se publicaría solo.');
    }
    return errors;
}

export function isFetchableUrl(raw: unknown): boolean {
    const s = str(raw, 600);
    if (!s) return false;
    try {
        const u = new URL(s);
        if (u.protocol !== 'https:') return false;
        const h = u.hostname.toLowerCase();
        if (!h || h === 'localhost' || h.endsWith('.localhost')) return false;
        if (/^\d+\.\d+\.\d+\.\d+$/.test(h) || h.includes(':')) return false;
        return true;
    } catch { return false; }
}

const APROX = /\b(m[áa]s\s+de|cerca\s+de|alrededor\s+de|aproximadamente|unos|unas|casi|hasta)\b/i;

export function parseFigure(raw: unknown): { value: number; approx: boolean } | null {
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

export function formatFigure(n: number): string {
    if (!Number.isFinite(n)) return '';
    return Math.round(n).toLocaleString('es-CO');
}

export function parseCutoff(raw: unknown): string {
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

export function formatCutoff(iso: unknown): string {
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

export default {
    FEED_METRICS, METRIC_KEYS, metricLabel, SOURCE_KINDS, SOURCE_FORMATS,
    DEFAULT_MAX_JUMP_PCT, MAX_SOURCES, INTERVAL_OPTIONS, DEFAULT_INTERVAL_MINUTES,
    FEED_PRESETS, normalizeSource, normalizeFeed,
    validateFeed, isFetchableUrl, parseFigure, formatFigure, parseCutoff, formatCutoff,
};
