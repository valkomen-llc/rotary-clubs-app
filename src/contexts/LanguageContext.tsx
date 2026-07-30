import React, {
    createContext, useContext,
    useState, useEffect, useLayoutEffect,
    useCallback, useRef, useMemo,
} from 'react';
import {
    ATTRS, looksLikeData, applyAll as domApplyAll,
    restoreAll as domRestoreAll, collectMissing as domCollectMissing,
} from '../lib/domTranslator';
import {
    LOCALES, BASE_LANG, localeOf, isSupportedLang,
    formatDate, formatDateShort, formatDateTime, formatTime, formatDateRange,
    formatNumber, formatMoney, formatRelative, formatList,
} from '../lib/locale';

// ════════════════════════════════════════════════════════════════════════════
// Idioma activo del sitio público — v4.661
//
// El sitio NO tiene un catálogo cerrado de cadenas: casi todo lo visible es
// contenido que el administrador carga en español (eventos, noticias, proyectos,
// páginas). Por eso la traducción se hace sobre el DOM ya pintado: se recogen
// los textos que hay, se traducen una vez, se guardan y se reaplican al
// instante en las visitas siguientes.
//
// Qué cubre esta capa, y qué NO:
//   ✔ nodos de texto
//   ✔ atributos visibles: placeholder, title, alt, aria-label, value de botón
//   ✔ el título de la pestaña
//   ✔ contenido inyectado después (modales, avisos, respuestas del servidor)
//   ✔ re-render de React sobre un texto ya traducido (characterData)
//   ✘ fechas, cifras y monedas — esas NO se traducen, se FORMATEAN con el
//     locale activo: ver src/lib/locale.ts y el hook useLocale() de abajo.
// ════════════════════════════════════════════════════════════════════════════

// Se reexporta con el nombre viejo: lo consumen el Navbar y PublicTopBar.
export const SUPPORTED_LANGUAGES = LOCALES.map(({ code, name, flag }) => ({ code, name, flag }));
export { LOCALES, BASE_LANG, localeOf };

/** Lista de idiomas con el idioma por defecto del sitio SIEMPRE de primero. */
export function orderLanguages(defaultCode?: string) {
    const idx = defaultCode ? SUPPORTED_LANGUAGES.findIndex(l => l.code === defaultCode) : -1;
    if (idx <= 0) return SUPPORTED_LANGUAGES;
    const copy = [...SUPPORTED_LANGUAGES];
    const [preferred] = copy.splice(idx, 1);
    return [preferred, ...copy];
}

// ─── Caché ──────────────────────────────────────────────────────────────────
// L0 localStorage — sobrevive a la recarga y se aplica antes del primer pintado
// L1 memoria      — la consulta más rápida
// L2 servidor     — sólo para lo que nadie ha traducido todavía

const memCache: Record<string, Record<string, string>> = {};

function loadLS(lang: string): Record<string, string> {
    try { return JSON.parse(localStorage.getItem(`_t_${lang}`) || '{}'); }
    catch { return {}; }
}

function saveLS(lang: string, entries: Record<string, string>) {
    try {
        const merged = { ...loadLS(lang), ...entries };
        localStorage.setItem(`_t_${lang}`, JSON.stringify(merged));
    } catch {
        // Cuota llena: se descarta la caché de ese idioma y se reintenta. Perder
        // la caché sólo cuesta una llamada de red; dejarla rota cuesta que no se
        // guarde nada nunca más.
        try {
            localStorage.removeItem(`_t_${lang}`);
            localStorage.setItem(`_t_${lang}`, JSON.stringify(entries));
        } catch { /* sin espacio: se sigue con la caché en memoria */ }
    }
}

function primeCache(lang: string) {
    if (!memCache[lang]) memCache[lang] = loadLS(lang);
}
function getCached(lang: string, text: string): string | undefined {
    return memCache[lang]?.[text];
}

// ─── Servidor ───────────────────────────────────────────────────────────────
const API_URL = import.meta.env.VITE_API_URL || '/api';
const CHUNK = 60;

// Textos que ya se pidieron y fallaron: no se vuelven a pedir en esta sesión.
// Sin esto, un proveedor caído convierte cada repintado en una tanda de
// peticiones que van a fallar igual.
const failed: Record<string, Set<string>> = {};

async function fetchMissing(texts: string[], lang: string): Promise<Record<string, string>> {
    const bad = (failed[lang] ||= new Set());
    const toFetch = texts.filter(t => !getCached(lang, t) && !bad.has(t));
    if (!toFetch.length) return {};

    const result: Record<string, string> = {};
    for (let i = 0; i < toFetch.length; i += CHUNK) {
        const chunk = toFetch.slice(i, i + CHUNK);
        try {
            const r = await fetch(`${API_URL}/translate/bulk`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ texts: chunk, targetLang: lang, page: location.pathname }),
            });
            if (!r.ok) { chunk.forEach(t => bad.add(t)); continue; }
            const data = await r.json();
            const arr: string[] = Array.isArray(data.translations) ? data.translations : [];
            memCache[lang] ||= {};
            chunk.forEach((orig, idx) => {
                const tr = arr[idx];
                if (typeof tr === 'string' && tr && tr !== orig) {
                    memCache[lang][orig] = tr;
                    result[orig] = tr;
                } else {
                    // El servidor devolvió el original: o no era traducible o el
                    // proveedor falló. En ambos casos, no insistir.
                    bad.add(orig);
                }
            });
        } catch {
            chunk.forEach(t => bad.add(t));
        }
    }

    if (Object.keys(result).length) {
        saveLS(lang, result);
        fetch(`${API_URL}/translate/log-domain`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                lang, domain: location.hostname, page: location.pathname,
                count: Object.keys(result).length,
            }),
        }).catch(() => { });
    }
    return result;
}

// ─── Persistencia de la elección ────────────────────────────────────────────
// localStorage para esta pantalla; cookie para que el servidor sepa el idioma
// desde la primera petición (y para que sobreviva a un dominio con varias
// pestañas). Un año: la elección de idioma no caduca en una sesión.
const COOKIE = 'site_language';

function writeCookie(lang: string) {
    try {
        document.cookie = `${COOKIE}=${encodeURIComponent(lang)}; path=/; max-age=31536000; SameSite=Lax`;
    } catch { /* sin cookies: manda localStorage */ }
}

function readCookie(): string | null {
    try {
        const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]*)`));
        return m ? decodeURIComponent(m[1]) : null;
    } catch { return null; }
}

/** Marca el idioma en <html lang>. Lo usan el lector de pantalla, el corrector
 *  del navegador, la partición silábica del CSS y los buscadores. */
function syncDocumentLang(lang: string) {
    try {
        document.documentElement.setAttribute('lang', localeOf(lang));
        document.documentElement.setAttribute('data-lang', lang);
    } catch { /* ignorar */ }
}

// ─── Contexto ───────────────────────────────────────────────────────────────
interface LangCtx {
    lang: string;
    locale: string;
    languageChosen: boolean;
    setLang: (l: string) => void;
    applyDefaultLanguage: (code?: string) => void;
    translate: (text: string) => Promise<string>;
    translateSync: (text: string) => string;
    isTranslating: boolean;
}
const LangContext = createContext<LangCtx | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [lang, setLangState] = useState<string>(() => {
        // Prioridad: elección del visitante > cookie > idioma por defecto del
        // sitio > español. La cookie entra antes que el default para que la
        // elección sobreviva a un borrado parcial del almacenamiento.
        const stored = localStorage.getItem('site_language')
            || readCookie()
            || localStorage.getItem('site_default_language')
            || BASE_LANG;
        const safe = isSupportedLang(stored) ? stored : BASE_LANG;
        if (safe !== BASE_LANG) primeCache(safe);
        return safe;
    });

    const [languageChosen, setLanguageChosen] = useState<boolean>(
        () => !!localStorage.getItem('site_language') || !!readCookie(),
    );
    const [isTranslating, setIsTranslating] = useState(false);

    const rootRef = useRef<Element | null>(null);
    const observerRef = useRef<MutationObserver | null>(null);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const busy = useRef(false);
    const langRef = useRef(lang);
    langRef.current = lang;

    const setLang = useCallback((l: string) => {
        if (!isSupportedLang(l)) return;
        localStorage.setItem('site_language', l);
        writeCookie(l);
        if (l !== BASE_LANG) primeCache(l);
        setLangState(l);
        setLanguageChosen(true);
    }, []);

    // Idioma por defecto del sitio (identidad). Se cachea para la próxima visita
    // pero NO cuenta como elección del visitante: si el administrador lo cambia,
    // quien nunca eligió verá el nuevo. Si el visitante ya eligió, esto no hace
    // nada.
    const applyDefaultLanguage = useCallback((code?: string) => {
        if (!code || !isSupportedLang(code)) return;
        localStorage.setItem('site_default_language', code);
        if (localStorage.getItem('site_language') || readCookie()) return;
        if (code !== BASE_LANG) primeCache(code);
        setLangState(prev => (prev === code ? prev : code));
    }, []);

    const translate = useCallback(async (text: string) => {
        if (!text || lang === BASE_LANG) return text;
        const cached = getCached(lang, text);
        if (cached) return cached;
        const r = await fetchMissing([text], lang);
        return r[text] ?? text;
    }, [lang]);

    const translateSync = useCallback((text: string) => {
        if (!text || lang === BASE_LANG) return text;
        return getCached(lang, text) ?? text;
    }, [lang]);

    // ── Antes del pintado: volcar lo que ya está en caché ───────────────────
    // useLayoutEffect corre tras las mutaciones del DOM y ANTES de que el
    // navegador pinte, así que lo ya traducido nunca se ve primero en español.
    useLayoutEffect(() => {
        const root = document.getElementById('root');
        if (!root) return;
        rootRef.current = root;
        syncDocumentLang(lang);
        if (lang === BASE_LANG) domRestoreAll(root);
        else domApplyAll(root, memCache[lang] ?? {});
    }, [lang]);

    // ── Traducir lo que falte, y reaccionar a lo que aparezca después ───────
    // Un solo efecto para el barrido inicial y para el observador: así hay un
    // único sitio donde se conecta y se desconecta, que es lo que evita que
    // nuestras propias escrituras se lean como cambios del usuario.
    useEffect(() => {
        const root = document.getElementById('root');
        if (!root) return;
        rootRef.current = root;

        observerRef.current?.disconnect();
        observerRef.current = null;
        if (lang === BASE_LANG) { setIsTranslating(false); return; }

        let alive = true;

        const observer = new MutationObserver(() => {
            if (busy.current) return;               // son nuestras propias escrituras
            if (timerRef.current) clearTimeout(timerRef.current);
            timerRef.current = setTimeout(sweep, 150);
        });

        async function sweep() {
            const r = rootRef.current;
            if (!r || !alive || busy.current || langRef.current !== lang) return;

            busy.current = true;
            observer.disconnect();
            try {
                // Primero lo que ya está en caché: instantáneo y sin red.
                domApplyAll(r, memCache[lang] ?? {});

                const missing = domCollectMissing(r, memCache[lang] ?? {});
                if (missing.length) {
                    setIsTranslating(true);
                    const fresh = await fetchMissing(missing, lang);
                    if (alive && Object.keys(fresh).length) domApplyAll(r, memCache[lang] ?? {});
                }

                // El título de la pestaña también es texto visible.
                const title = document.title?.trim();
                if (title && !looksLikeData(title)) {
                    const tr = getCached(lang, title);
                    if (tr) document.title = tr;
                }
            } finally {
                busy.current = false;
                if (alive) setIsTranslating(false);
                if (alive && langRef.current === lang) {
                    observer.observe(r, {
                        childList: true, subtree: true,
                        characterData: true,        // React repinta texto EN SITIO
                        attributes: true,
                        attributeFilter: [...ATTRS, 'value'],
                    });
                }
            }
        }

        sweep();
        observerRef.current = observer;

        return () => {
            alive = false;
            if (timerRef.current) clearTimeout(timerRef.current);
            observer.disconnect();
            observerRef.current = null;
        };
    }, [lang]);

    const value = useMemo<LangCtx>(() => ({
        lang,
        locale: localeOf(lang),
        languageChosen,
        setLang,
        applyDefaultLanguage,
        translate,
        translateSync,
        isTranslating,
    }), [lang, languageChosen, setLang, applyDefaultLanguage, translate, translateSync, isTranslating]);

    return (
        <LangContext.Provider value={value}>
            {children}
            <TranslationProgress active={isTranslating} />
        </LangContext.Provider>
    );
};

// ─── Indicador de traducción en curso ───────────────────────────────────────
// Una barra fina arriba mientras se resuelve algo que nunca se había traducido.
// No tapa la página a propósito: el contenido en español se lee mientras llega
// su traducción, que es preferible a una pantalla en blanco esperando a un
// servicio de terceros. Lo ya traducido no pasa por aquí — se aplica antes del
// pintado y no parpadea.
const TranslationProgress: React.FC<{ active: boolean }> = ({ active }) => (
    <div
        aria-hidden={!active}
        data-no-translate
        style={{
            position: 'fixed', top: 0, left: 0, right: 0, height: 2, zIndex: 9999,
            pointerEvents: 'none', opacity: active ? 1 : 0,
            transition: 'opacity .25s ease',
        }}
    >
        <div style={{
            height: '100%', width: '40%', borderRadius: 2,
            background: 'linear-gradient(90deg,transparent,#f7a81b,#17458f,transparent)',
            animation: active ? 'rc-tr-slide 1.1s ease-in-out infinite' : 'none',
        }} />
        <style>{`@keyframes rc-tr-slide{0%{transform:translateX(-100%)}100%{transform:translateX(350%)}}`}</style>
    </div>
);

// ─── Hooks ──────────────────────────────────────────────────────────────────
export const useLang = () => {
    const ctx = useContext(LangContext);
    if (!ctx) throw new Error('useLang debe usarse dentro de LanguageProvider');
    return ctx;
};

/** Traduce una cadena suelta (la que no está en el DOM: un aria-label calculado,
 *  el asunto de un correo, el texto de un `alert`). */
export const useTranslated = (text: string): string => {
    const { lang, translate, translateSync } = useLang();
    const [result, setResult] = useState<string>(() => translateSync(text));

    useEffect(() => {
        if (!text || lang === BASE_LANG) { setResult(text); return; }
        const cached = translateSync(text);
        if (cached !== text) { setResult(cached); return; }
        let cancelled = false;
        translate(text).then(t => { if (!cancelled) setResult(t); });
        return () => { cancelled = true; };
    }, [text, lang, translate, translateSync]);

    return result;
};

/**
 * Formateadores atados al idioma activo.
 *
 * Fechas, horas, cifras y monedas NO se traducen: se formatean. Este hook es la
 * forma correcta de mostrarlas — evita el 'es-CO' fijo que dejaba las fechas en
 * español aunque el resto de la página estuviera en japonés.
 *
 *   const { date, money } = useLocale();
 *   <p>{date(evento.startsAt)} — {money(cat.price, cat.currency)}</p>
 */
export const useLocale = () => {
    const { lang, locale } = useLang();
    return useMemo(() => ({
        lang,
        locale,
        date: (v: unknown, o?: Intl.DateTimeFormatOptions) => formatDate(v, lang, o),
        dateShort: (v: unknown) => formatDateShort(v, lang),
        dateTime: (v: unknown) => formatDateTime(v, lang),
        time: (v: unknown) => formatTime(v, lang),
        dateRange: (a: unknown, b: unknown) => formatDateRange(a, b, lang),
        number: (v: unknown, o?: Intl.NumberFormatOptions) => formatNumber(v, lang, o),
        money: (v: unknown, currency?: string, o?: Intl.NumberFormatOptions) =>
            formatMoney(v, currency, lang, o),
        relative: (v: unknown) => formatRelative(v, lang),
        list: (items: string[]) => formatList(items, lang),
    }), [lang, locale]);
};
