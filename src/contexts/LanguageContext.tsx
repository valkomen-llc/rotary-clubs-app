import React, {
    createContext, useContext,
    useState, useEffect, useLayoutEffect,
    useCallback, useRef,
} from 'react';

export const SUPPORTED_LANGUAGES = [
    { code: 'es', name: 'Español', flag: '🇪🇸' },
    { code: 'en', name: 'English', flag: '🇺🇸' },
    { code: 'fr', name: 'Français', flag: '🇫🇷' },
    { code: 'pt', name: 'Português', flag: '🇧🇷' },
    { code: 'de', name: 'Deutsch', flag: '🇩🇪' },
    { code: 'it', name: 'Italiano', flag: '🇮🇹' },
    { code: 'ja', name: '日本語', flag: '🇯🇵' },
    { code: 'ko', name: '한국어', flag: '🇰🇷' },
];

// ─── Cache ────────────────────────────────────────────────────────────────────
// L0  localStorage  — survives page reloads, applied before first paint
// L1  memCache      — in-memory, fastest lookup
// L2  Gemini API    — only for brand-new untranslated strings

const memCache: Record<string, Record<string, string>> = {};

function loadLS(lang: string): Record<string, string> {
    try { return JSON.parse(localStorage.getItem(`_t_${lang}`) || '{}'); }
    catch { return {}; }
}
function saveLS(lang: string, entries: Record<string, string>) {
    try {
        const merged = { ...loadLS(lang), ...entries };
        localStorage.setItem(`_t_${lang}`, JSON.stringify(merged));
    } catch { /* storage full — ignore */ }
}
/** Hydrate L1 from L0 once per language */
function primeCache(lang: string) {
    if (!memCache[lang]) memCache[lang] = loadLS(lang);
}
function getCached(lang: string, text: string): string | undefined {
    return memCache[lang]?.[text];
}

// ─── DOM ──────────────────────────────────────────────────────────────────────
const ORIG_ATTR = 'data-ot';
const MIN_LEN = 2;
const SKIP = [
    'script', 'style', 'noscript', '[data-no-translate]',
    'input', 'textarea', 'select', 'code', 'pre', 'svg',
].join(',');

function getNodes(root: Element): Text[] {
    const skip = new Set<Node>(Array.from(root.querySelectorAll(SKIP)));
    const out: Text[] = [];
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
            let p = node.parentElement;
            while (p && p !== root) {
                if (skip.has(p)) return NodeFilter.FILTER_REJECT;
                p = p.parentElement;
            }
            const t = (node.textContent || '').trim();
            if (t.length < MIN_LEN) return NodeFilter.FILTER_SKIP;
            if (/^\d+(\.\d+)?$/.test(t)) return NodeFilter.FILTER_SKIP;
            if (/^https?:\/\//.test(t)) return NodeFilter.FILTER_SKIP;
            return NodeFilter.FILTER_ACCEPT;
        },
    });
    let n: Node | null;
    while ((n = w.nextNode())) out.push(n as Text);
    return out;
}

/** Apply everything in memCache[lang] to the DOM synchronously */
function applyAll(root: Element, lang: string) {
    const cache = memCache[lang] ?? {};
    const nodes = getNodes(root);
    for (const node of nodes) {
        const parent = node.parentElement;
        if (!parent) continue;
        // Record original text on first visit
        if (!parent.hasAttribute(ORIG_ATTR)) {
            parent.setAttribute(ORIG_ATTR, (node.textContent || '').trim());
        }
        const orig = parent.getAttribute(ORIG_ATTR) ?? '';
        const tr = cache[orig];
        if (tr) {
            const lead = node.textContent?.match(/^\s*/)?.[0] ?? '';
            const trail = node.textContent?.match(/\s*$/)?.[0] ?? '';
            node.textContent = lead + tr + trail;
        }
    }
    return nodes;
}

/** Restore original Spanish text */
function restoreAll(root: Element) {
    root.querySelectorAll(`[${ORIG_ATTR}]`).forEach(el => {
        const orig = el.getAttribute(ORIG_ATTR);
        if (orig === null) return;
        for (const child of Array.from(el.childNodes)) {
            if (child.nodeType === Node.TEXT_NODE) {
                const lead = child.textContent?.match(/^\s*/)?.[0] ?? '';
                const trail = child.textContent?.match(/\s*$/)?.[0] ?? '';
                child.textContent = lead + orig + trail;
                break;
            }
        }
        el.removeAttribute(ORIG_ATTR);
    });
}

// ─── API ──────────────────────────────────────────────────────────────────────
const API_URL = import.meta.env.VITE_API_URL || '/api';
const CHUNK = 40;

async function fetchMissing(
    texts: string[],
    lang: string,
): Promise<Record<string, string>> {
    const toFetch = texts.filter(t => !getCached(lang, t));
    if (!toFetch.length) return {};

    const result: Record<string, string> = {};
    for (let i = 0; i < toFetch.length; i += CHUNK) {
        const chunk = toFetch.slice(i, i + CHUNK);
        try {
            const r = await fetch(`${API_URL}/translate/bulk`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ texts: chunk, targetLang: lang }),
            });
            if (!r.ok) continue;
            const data = await r.json();
            const arr: string[] = Array.isArray(data.translations)
                ? data.translations : [];
            if (!memCache[lang]) memCache[lang] = {};
            chunk.forEach((orig, idx) => {
                const tr = arr[idx] || orig;
                memCache[lang][orig] = tr;
                result[orig] = tr;
            });
        } catch { /* network error */ }
    }
    if (Object.keys(result).length) {
        saveLS(lang, result);
        // Fire-and-forget: log this domain/page to usage panel
        fetch(`${API_URL}/translate/log-domain`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                lang,
                domain: window.location.hostname,
                page: window.location.pathname,
                count: Object.keys(result).length,
            }),
        }).catch(() => { });
    }
    return result;
}

// ─── Context ──────────────────────────────────────────────────────────────────
interface LangCtx {
    lang: string;
    setLang: (l: string) => void;
    translate: (text: string) => Promise<string>;
    translateSync: (text: string) => string;
    isTranslating: boolean;
}
const LangContext = createContext<LangCtx | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [lang, setLangState] = useState<string>(() => {
        const stored = localStorage.getItem('site_language') || 'es';
        if (stored !== 'es') primeCache(stored); // hydrate L1 from L0 synchronously
        return stored;
    });

    const rootRef = useRef<Element | null>(null);
    const observerRef = useRef<MutationObserver | null>(null);
    const bgTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const fetching = useRef(false);

    const setLang = useCallback((l: string) => {
        localStorage.setItem('site_language', l);
        if (l !== 'es') primeCache(l);
        setLangState(l);
    }, []);

    const translate = useCallback(async (text: string) => {
        if (!text || lang === 'es') return text;
        if (getCached(lang, text)) return getCached(lang, text)!;
        const r = await fetchMissing([text], lang);
        return r[text] ?? text;
    }, [lang]);

    const translateSync = useCallback((text: string) => {
        if (!text || lang === 'es') return text;
        return getCached(lang, text) ?? text;
    }, [lang]);

    // ── INSTANT: apply cached translations BEFORE browser paints ─────────────
    // useLayoutEffect fires synchronously after DOM mutations, before paint.
    useLayoutEffect(() => {
        const root = document.getElementById('root');
        if (!root) return;
        rootRef.current = root;

        if (lang === 'es') {
            restoreAll(root);
            return;
        }
        // Apply everything already in L0/L1 cache — zero network, zero delay
        applyAll(root, lang);
    }, [lang]);

    // ── BACKGROUND: silently fetch whatever wasn't cached yet ─────────────────
    useEffect(() => {
        const root = rootRef.current;
        if (!root || lang === 'es' || fetching.current) return;

        const run = async () => {
            fetching.current = true;
            observerRef.current?.disconnect();
            try {
                const nodes = getNodes(root);
                const missing = [
                    ...new Set(
                        nodes
                            .map(n =>
                                n.parentElement?.getAttribute(ORIG_ATTR) ??
                                (n.textContent ?? '').trim()
                            )
                            .filter(t => t.length >= MIN_LEN && !getCached(lang, t))
                    ),
                ];
                if (!missing.length) return;

                const fresh = await fetchMissing(missing, lang);
                if (!Object.keys(fresh).length) return;

                // Apply newly translated strings
                const freshNodes = getNodes(root);
                for (const node of freshNodes) {
                    const orig = node.parentElement?.getAttribute(ORIG_ATTR)
                        ?? (node.textContent ?? '').trim();
                    const tr = fresh[orig];
                    if (tr) {
                        const lead = node.textContent?.match(/^\s*/)?.[0] ?? '';
                        const trail = node.textContent?.match(/\s*$/)?.[0] ?? '';
                        node.textContent = lead + tr + trail;
                    }
                }
            } finally {
                fetching.current = false;
                // reconnect observer after DOM writes
                if (observerRef.current && lang !== 'es') {
                    observerRef.current.observe(root, {
                        childList: true, subtree: true, characterData: false,
                    });
                }
            }
        };

        run();
    }, [lang]);

    // ── MutationObserver: re-apply when new content is injected ───────────────
    useEffect(() => {
        const root = document.getElementById('root');
        if (!root) return;
        rootRef.current = root;

        if (observerRef.current) { observerRef.current.disconnect(); observerRef.current = null; }
        if (lang === 'es') return;

        const observer = new MutationObserver(() => {
            if (fetching.current) return;
            if (bgTimer.current) clearTimeout(bgTimer.current);
            bgTimer.current = setTimeout(() => {
                const r = rootRef.current;
                if (!r) return;
                // First apply cache instantly, then fetch missing
                applyAll(r, lang);
                if (!fetching.current) {
                    fetching.current = true;
                    observer.disconnect();
                    const nodes = getNodes(r);
                    const missing = [
                        ...new Set(
                            nodes
                                .map(n =>
                                    n.parentElement?.getAttribute(ORIG_ATTR) ??
                                    (n.textContent ?? '').trim()
                                )
                                .filter(t => t.length >= MIN_LEN && !getCached(lang, t))
                        ),
                    ];
                    if (missing.length) {
                        fetchMissing(missing, lang).then(fresh => {
                            if (Object.keys(fresh).length) applyAll(r, lang);
                        }).finally(() => {
                            fetching.current = false;
                            observer.observe(r, { childList: true, subtree: true, characterData: false });
                        });
                    } else {
                        fetching.current = false;
                        observer.observe(r, { childList: true, subtree: true, characterData: false });
                    }
                }
            }, 200);
        });

        observer.observe(root, { childList: true, subtree: true, characterData: false });
        observerRef.current = observer;
        return () => { observer.disconnect(); observerRef.current = null; };
    }, [lang]);

    return (
        <LangContext.Provider value={{ lang, setLang, translate, translateSync, isTranslating: false }}>
            {children}
        </LangContext.Provider>
    );
};

export const useLang = () => {
    const ctx = useContext(LangContext);
    if (!ctx) throw new Error('useLang must be used within LanguageProvider');
    return ctx;
};

// ─── <T> component hook (single-string) ──────────────────────────────────────
export const useTranslated = (text: string): string => {
    const { lang, translate, translateSync } = useLang();
    const [result, setResult] = useState<string>(() => translateSync(text));

    useEffect(() => {
        if (!text || lang === 'es') { setResult(text); return; }
        const cached = translateSync(text);
        if (cached !== text) { setResult(cached); return; }
        let cancelled = false;
        translate(text).then(t => { if (!cancelled) setResult(t); });
        return () => { cancelled = true; };
    }, [text, lang, translate, translateSync]);

    return result;
};
