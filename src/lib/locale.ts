// ════════════════════════════════════════════════════════════════════════════
// Capa de locale del navegador — v4.661
//
// El idioma activo no sólo cambia las palabras: cambia cómo se escribe una
// fecha, un precio y un número. Hasta v4.660 el sitio traducía el texto pero
// seguía formateando todo con 'es-CO' fijo (69 llamadas repartidas por el
// código), así que un visitante en japonés leía "12 de abril de 2027" y
// "1.250.000" — el idioma cambiaba a medias.
//
// Este módulo es el espejo en el navegador de server/lib/translationSpec.js.
// Si allá se agrega un idioma, se agrega aquí.
// ════════════════════════════════════════════════════════════════════════════

export interface LangDef {
    code: string;
    locale: string;   // BCP-47 completo: gobierna Intl
    name: string;     // en su propio idioma, como se ve en el selector
    flag: string;
}

export const LOCALES: LangDef[] = [
    { code: 'es', locale: 'es-CO', name: 'Español', flag: 'co' },
    { code: 'en', locale: 'en-US', name: 'English', flag: 'us' },
    { code: 'fr', locale: 'fr-FR', name: 'Français', flag: 'fr' },
    { code: 'pt', locale: 'pt-BR', name: 'Português', flag: 'br' },
    { code: 'de', locale: 'de-DE', name: 'Deutsch', flag: 'de' },
    { code: 'it', locale: 'it-IT', name: 'Italiano', flag: 'it' },
    { code: 'ja', locale: 'ja-JP', name: '日本語', flag: 'jp' },
    { code: 'ko', locale: 'ko-KR', name: '한국어', flag: 'kr' },
];

export const BASE_LANG = 'es';
export const LANG_CODES = LOCALES.map(l => l.code);

/** El BCP-47 de un código corto. Cae al del sitio si no se reconoce. */
export function localeOf(code?: string): string {
    return LOCALES.find(l => l.code === code)?.locale || 'es-CO';
}

export const isSupportedLang = (code?: string): boolean =>
    !!code && LANG_CODES.includes(code);

/**
 * El locale activo, para las funciones de formato que viven FUERA de un
 * componente y por tanto no pueden usar hooks (los `fmtFecha` / `fmtCop` que
 * cada página declara arriba del archivo).
 *
 * La fuente es `<html lang>`, que LanguageProvider escribe en un
 * useLayoutEffect en cuanto cambia el idioma — antes de que se pinte nada.
 *
 * OJO: esto LEE el idioma, no suscribe a sus cambios. El componente que llame a
 * uno de esos formateadores tiene que suscribirse igualmente con `useLang()`
 * para volver a renderizarse cuando el visitante cambie de idioma; si no, la
 * fecha se queda en el formato anterior hasta el siguiente repintado. Dentro de
 * un componente, lo correcto es `useLocale()`.
 */
export function activeLocale(): string {
    if (typeof document === 'undefined') return 'es-CO';
    const attr = document.documentElement.getAttribute('lang');
    if (attr && LOCALES.some(l => l.locale === attr)) return attr;
    const short = document.documentElement.getAttribute('data-lang');
    return localeOf(short || undefined);
}

// ── Formateadores ──────────────────────────────────────────────────────────
// Intl.* es caro de construir y se llama en bucles de render (una tarjeta por
// evento, una fila por inscripción). Se memoizan por locale + opciones.

const cache = new Map<string, Intl.DateTimeFormat | Intl.NumberFormat>();

function dateFmt(locale: string, opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
    const key = `d:${locale}:${JSON.stringify(opts)}`;
    let f = cache.get(key) as Intl.DateTimeFormat | undefined;
    if (!f) { f = new Intl.DateTimeFormat(locale, opts); cache.set(key, f); }
    return f;
}

function numFmt(locale: string, opts: Intl.NumberFormatOptions): Intl.NumberFormat {
    const key = `n:${locale}:${JSON.stringify(opts)}`;
    let f = cache.get(key) as Intl.NumberFormat | undefined;
    if (!f) { f = new Intl.NumberFormat(locale, opts); cache.set(key, f); }
    return f;
}

/** Acepta Date, ISO o epoch. Devuelve null si no es una fecha válida. */
function asDate(v: unknown): Date | null {
    if (!v && v !== 0) return null;
    const d = v instanceof Date ? v : new Date(v as string | number);
    return Number.isNaN(d.getTime()) ? null : d;
}

/** Lo que se muestra cuando el dato no existe. Nunca una llave ni "Invalid Date". */
export const EMPTY = '—';

export function formatDate(
    value: unknown,
    lang?: string,
    opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' },
): string {
    const d = asDate(value);
    return d ? dateFmt(localeOf(lang), opts).format(d) : EMPTY;
}

export function formatDateShort(value: unknown, lang?: string): string {
    return formatDate(value, lang, { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function formatDateTime(value: unknown, lang?: string): string {
    const d = asDate(value);
    return d
        ? dateFmt(localeOf(lang), { dateStyle: 'medium', timeStyle: 'short' }).format(d)
        : EMPTY;
}

export function formatTime(value: unknown, lang?: string): string {
    const d = asDate(value);
    return d ? dateFmt(localeOf(lang), { hour: '2-digit', minute: '2-digit' }).format(d) : EMPTY;
}

/** Rango de fechas de un evento: colapsa el día único y el mismo mes. */
export function formatDateRange(from: unknown, to: unknown, lang?: string): string {
    const a = asDate(from), b = asDate(to);
    if (!a) return EMPTY;
    if (!b || a.getTime() === b.getTime()) return formatDate(a, lang);
    const locale = localeOf(lang);
    // Intl sabe unir un rango en el idioma correcto ("12–14 de abril de 2027",
    // "April 12–14, 2027", "2027年4月12日～14日"). Hacerlo a mano con un guion
    // acierta en español y falla en japonés.
    try {
        return dateFmt(locale, { day: 'numeric', month: 'long', year: 'numeric' })
            .formatRange(a, b);
    } catch {
        return `${formatDate(a, lang)} – ${formatDate(b, lang)}`;
    }
}

export function formatNumber(value: unknown, lang?: string, opts: Intl.NumberFormatOptions = {}): string {
    const n = Number(value);
    return Number.isFinite(n) ? numFmt(localeOf(lang), opts).format(n) : EMPTY;
}

/**
 * Importe con su moneda.
 *
 * La CIFRA y el CÓDIGO no se traducen —son datos— pero su PRESENTACIÓN sí
 * cambia con el idioma: separadores, posición del símbolo y espacios. 1.250.000
 * COP en es-CO es 1,250,000 COP en en-US. El valor es el mismo; lo que cambia
 * es cómo se lee.
 */
export function formatMoney(
    amount: unknown,
    currency = 'COP',
    lang?: string,
    opts: Intl.NumberFormatOptions = {},
): string {
    const n = Number(amount);
    if (!Number.isFinite(n)) return EMPTY;
    const cur = String(currency || 'COP').toUpperCase();
    try {
        return numFmt(localeOf(lang), {
            style: 'currency',
            currency: cur,
            // Las monedas sin céntimos de uso corriente (COP, JPY, KRW) se ven
            // mal con dos decimales: "COP 1.250.000,00".
            ...(['COP', 'JPY', 'KRW', 'CLP'].includes(cur)
                ? { minimumFractionDigits: 0, maximumFractionDigits: 0 }
                : {}),
            ...opts,
        }).format(n);
    } catch {
        // Código de moneda que Intl no reconoce: se muestra el número y el código.
        return `${formatNumber(n, lang)} ${cur}`;
    }
}

/** "hace 3 días" / "3 days ago" — en el idioma activo. */
export function formatRelative(value: unknown, lang?: string): string {
    const d = asDate(value);
    if (!d) return EMPTY;
    const diff = d.getTime() - Date.now();
    const units: [Intl.RelativeTimeFormatUnit, number][] = [
        ['year', 31536e6], ['month', 2592e6], ['day', 864e5],
        ['hour', 36e5], ['minute', 6e4], ['second', 1000],
    ];
    try {
        const rtf = new Intl.RelativeTimeFormat(localeOf(lang), { numeric: 'auto' });
        for (const [unit, ms] of units) {
            if (Math.abs(diff) >= ms || unit === 'second') {
                return rtf.format(Math.round(diff / ms), unit);
            }
        }
    } catch { /* motor sin RelativeTimeFormat */ }
    return formatDate(d, lang);
}

/** Lista natural: "A, B y C" / "A, B, and C" / "A、B、C". */
export function formatList(items: string[], lang?: string): string {
    const clean = (items || []).filter(Boolean);
    if (!clean.length) return '';
    try {
        return new Intl.ListFormat(localeOf(lang), { style: 'long', type: 'conjunction' })
            .format(clean);
    } catch {
        return clean.join(', ');
    }
}

/** El nombre del idioma en su propio idioma. Para el selector. */
export const nameOf = (code: string): string =>
    LOCALES.find(l => l.code === code)?.name || code;

export default {
    LOCALES, LANG_CODES, BASE_LANG, localeOf, isSupportedLang, nameOf, EMPTY,
    formatDate, formatDateShort, formatDateTime, formatTime, formatDateRange,
    formatNumber, formatMoney, formatRelative, formatList,
};
