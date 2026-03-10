import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';

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

// ─── Cache layers ────────────────────────────────────────────────────────────
// L0: localStorage — persists across page loads and navigation (instant apply)
// L1: in-memory (memCache) — fastest, per session
// L2: API (Gemini via /translate/bulk) — network, only for new texts

const memCache: Record<string, Record<string, string>> = {};

function loadLocalCache(lang: string): Record<string, string> {
    try {
        return JSON.parse(localStorage.getItem(`_t_${lang}`) || '{}');
    } catch { return {}; }
}

function saveLocalCache(lang: string, entries: Record<string, string>) {
    try {
        const existing = loadLocalCache(lang);
        const merged = { ...existing, ...entries };
        localStorage.setItem(`_t_${lang}`, JSON.stringify(merged));
    } catch { /* ignore storage full */ }
}

function primeMemCache(lang: string) {
    if (!memCache[lang]) {
        memCache[lang] = loadLocalCache(lang);
    }
}

// ─── Constants ────────────────────────────────────────────────────────────────
const ORIG_ATTR = 'data-ot'; // "original text"
const MIN_LEN = 2;
const API_URL = import.meta.env.VITE_API_URL || '/api';
const SKIP_SELECTORS = [
    'script', 'style', 'noscript',
    '[data-no-translate]',
    'input', 'textarea', 'select',
    'code', 'pre', 'svg',
].join(',');

// ─── DOM helpers ─────────────────────────────────────────────────────────────
function collectTextNodes(root: Element): Text[] {
    const nodes: Text[] = [];
    const skipSet = new Set<Node>(Array.from(root.querySelectorAll(SKIP_SELECTORS)));

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
            let p = node.parentElement;
            while (p && p !== root) {
                if (skipSet.has(p)) return NodeFilter.FILTER_REJECT;
                p = p.parentElement;
            }
            const t = (node.textContent || '').trim();
            if (t.length < MIN_LEN) return NodeFilter.FILTER_SKIP;
            if (/^\d+(\.\d+)?$/.test(t)) return NodeFilter.FILTER_SKIP;
            if (/^https?:\/\//.test(t)) return NodeFilter.FILTER_SKIP;
            return NodeFilter.FILTER_ACCEPT;
        }
    });

    let node: Node | null;
    while ((node = walker.nextNode())) nodes.push(node as Text);
    return nodes;
}

function applyCache(root: Element, lang: string): Text[] {
    const cache = memCache[lang] || {};
    const nodes = collectTextNodes(root);

    for (const node of nodes) {
        const parent = node.parentElement;
        if (!parent) continue;
        // Store original text on first encounter
        if (!parent.hasAttribute(ORIG_ATTR)) {
            parent.setAttribute(ORIG_ATTR, (node.textContent || '').trim());
        }
        const orig = parent.getAttribute(ORIG_ATTR) || '';
        const translated = cache[orig];
        if (translated) {
            const lead = node.textContent?.match(/^\s*/)?.[0] || '';
            const trail = node.textContent?.match(/\s*$/)?.[0] || '';
            node.textContent = lead + translated + trail;
        }
    }
    return nodes;
}

function restoreOriginals(root: Element) {
    root.querySelectorAll(`[${ORIG_ATTR}]`).forEach(el => {
        const orig = el.getAttribute(ORIG_ATTR);
        if (orig === null) return;
        for (const child of Array.from(el.childNodes)) {
            if (child.nodeType === Node.TEXT_NODE) {
                const lead = child.textContent?.match(/^\s*/)?.[0] || '';
                const trail = child.textContent?.match(/\s*$/)?.[0] || '';
                child.textContent = lead + orig + trail;
                break;
            }
        }
        el.removeAttribute(ORIG_ATTR);
    });
}

// ─── API: batch-fetch missing translations ────────────────────────────────────
async function fetchMissing(texts: string[], lang: string): Promise<Record<string, string>> {
    const toFetch = texts.filter(t => !memCache[lang]?.[t]);
    if (!toFetch.length) return {};

    const result: Record<string, string> = {};
    const CHUNK = 40;

    for (let i = 0; i < toFetch.length; i += CHUNK) {
        const chunk = toFetch.slice(i, i + CHUNK);
        try {
            const resp = await fetch(`${API_URL}/translate/bulk`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ texts: chunk, targetLang: lang }),
            });
            if (!resp.ok) continue;
            const data = await resp.json();
            const arr: string[] = Array.isArray(data.translations) ? data.translations : [];
            chunk.forEach((orig, idx) => {
                const translated = arr[idx] || orig;
                if (!memCache[lang]) memCache[lang] = {};
                memCache[lang][orig] = translated;
                result[orig] = translated;
            });
        } catch { /* network error — keep originals */ }
    }

    if (Object.keys(result).length) {
        saveLocalCache(lang, result);
    }
    return result;
}

// ─── Context ──────────────────────────────────────────────────────────────────
interface LangContextType {
    lang: string;
    setLang: (lang: string) => void;
    translate: (text: string) => Promise<string>;
    translateSync: (text: string) => string;
    isTranslating: boolean;
}

const LangContext = createContext<LangContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [lang, setLangState] = useState<string>(() => {
        const stored = localStorage.getItem('site_language') || 'es';
        // Prime memory cache immediately so first paint is translated
        if (stored !== 'es') primeMemCache(stored);
        return stored;
    });

    const rootRef = useRef<Element | null>(null);
    const observerRef = useRef<MutationObserver | null>(null);
    const pendingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const fetchingRef = useRef(false);

    const setLang = useCallback((newLang: string) => {
        localStorage.setItem('site_language', newLang);
        if (newLang !== 'es') primeMemCache(newLang);
        setLangState(newLang);
    }, []);

    // Kept for <T> component compatibility
    const translate = useCallback(async (text: string): Promise<string> => {
        if (!text || lang === 'es') return text;
        if (memCache[lang]?.[text]) return memCache[lang][text];
        const result = await fetchMissing([text], lang);
        return result[text] || text;
    }, [lang]);

    const translateSync = useCallback((text: string): string => {
        if (!text || lang === 'es') return text;
        return memCache[lang]?.[text] || text;
    }, [lang]);

    // ── Core: apply cache instantly, then silently fetch what's missing ──────
    const syncPage = useCallback(async (targetLang: string, root: Element) => {
        if (targetLang === 'es') {
            restoreOriginals(root);
            return;
        }

        // STEP 1 — instant: apply everything already cached (L0+L1)
        applyCache(root, targetLang);

        // STEP 2 — background: find untranslated nodes & fetch silently
        if (fetchingRef.current) return;
        fetchingRef.current = true;
        try {
            const nodes = collectTextNodes(root);
            const missing = [...new Set(
                nodes
                    .map(n => n.parentElement?.getAttribute(ORIG_ATTR) || (n.textContent || '').trim())
                    .filter(t => t.length >= MIN_LEN && !memCache[targetLang]?.[t])
            )];

            if (!missing.length) return;

            // Pause observer during DOM writes
            observerRef.current?.disconnect();
            const fresh = await fetchMissing(missing, targetLang);

            if (Object.keys(fresh).length) {
                // Apply newly fetched translations
                const freshNodes = collectTextNodes(root);
                for (const node of freshNodes) {
                    const orig = node.parentElement?.getAttribute(ORIG_ATTR) || (node.textContent || '').trim();
                    if (fresh[orig]) {
                        const lead = node.textContent?.match(/^\s*/)?.[0] || '';
                        const trail = node.textContent?.match(/\s*$/)?.[0] || '';
                        node.textContent = lead + fresh[orig] + trail;
                    }
                }
            }
        } finally {
            fetchingRef.current = false;
            // Reconnect observer
            if (observerRef.current && targetLang !== 'es') {
                observerRef.current.observe(root, { childList: true, subtree: true, characterData: false });
            }
        }
    }, []);

    // ── Language change effect ────────────────────────────────────────────────
    useEffect(() => {
        const root = rootRef.current || document.getElementById('root');
        if (!root) return;
        rootRef.current = root;

        if (pendingRef.current) clearTimeout(pendingRef.current);
        // Small delay to let React finish rendering current page
        pendingRef.current = setTimeout(() => syncPage(lang, root), 80);

        return () => { if (pendingRef.current) clearTimeout(pendingRef.current); };
    }, [lang, syncPage]);

    // ── MutationObserver: handle new content (route changes, async data) ─────
    useEffect(() => {
        const root = document.getElementById('root');
        if (!root) return;
        rootRef.current = root;

        if (observerRef.current) {
            observerRef.current.disconnect();
            observerRef.current = null;
        }

        if (lang === 'es') return;

        const observer = new MutationObserver(() => {
            if (fetchingRef.current) return;
            if (pendingRef.current) clearTimeout(pendingRef.current);
            pendingRef.current = setTimeout(() => {
                const r = rootRef.current;
                if (r) syncPage(lang, r);
            }, 300);
        });

        observer.observe(root, { childList: true, subtree: true, characterData: false });
        observerRef.current = observer;

        return () => { observer.disconnect(); observerRef.current = null; };
    }, [lang, syncPage]);

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

// ─── Hook for <T> component (single-string auto-translate) ───────────────────
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
