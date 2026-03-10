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

// ─── L1 Cache: in-memory per session (lang → originalText → translatedText) ───
const memoryCache: Record<string, Record<string, string>> = {};

// ─── Attribute used to mark original text on DOM nodes ───
const ORIG_ATTR = 'data-orig-text';

// ─── Selectors to SKIP when walking the DOM for translation ───
const SKIP_SELECTORS = [
    'script',
    'style',
    'noscript',
    '[data-no-translate]',
    '[data-admin]',
    '.no-translate',
    'input',
    'textarea',
    'select',
    'code',
    'pre',
    'svg',
].join(',');

// ─── Minimum text length to translate ───
const MIN_TEXT_LEN = 2;

const API_URL = import.meta.env.VITE_API_URL || '/api';

// ─── Batch-translate via /translate/bulk ───
async function batchTranslate(texts: string[], targetLang: string): Promise<Record<string, string>> {
    if (!texts.length || targetLang === 'es') return {};

    const toFetch = texts.filter(t => !memoryCache[targetLang]?.[t]);
    const result: Record<string, string> = {};

    texts.forEach(t => {
        if (memoryCache[targetLang]?.[t]) result[t] = memoryCache[targetLang][t];
    });

    if (!toFetch.length) return result;

    try {
        const resp = await fetch(`${API_URL}/translate/bulk`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ texts: toFetch, targetLang }),
        });
        if (!resp.ok) {
            toFetch.forEach(t => { result[t] = t; });
            return result;
        }
        const data = await resp.json();
        // Backend /translate/bulk returns { translations: string[] } — indexed array
        const translatedArr: string[] = Array.isArray(data.translations) ? data.translations : [];
        if (!memoryCache[targetLang]) memoryCache[targetLang] = {};
        toFetch.forEach((orig, idx) => {
            const translated = translatedArr[idx] || orig;
            memoryCache[targetLang][orig] = translated;
            result[orig] = translated;
        });
    } catch {
        toFetch.forEach(t => { result[t] = t; });
    }
    return result;
}

// ─── Single-string translate (kept for <T> component) ───
async function translateSingle(text: string, targetLang: string): Promise<string> {
    if (!text || !text.trim() || targetLang === 'es') return text;
    if (memoryCache[targetLang]?.[text]) return memoryCache[targetLang][text];

    try {
        const resp = await fetch(`${API_URL}/translate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, targetLang }),
        });
        if (!resp.ok) return text;
        const data = await resp.json();
        const translated = data.translated || text;
        if (!memoryCache[targetLang]) memoryCache[targetLang] = {};
        memoryCache[targetLang][text] = translated;
        return translated;
    } catch {
        return text;
    }
}

// ─── Collect all visible text nodes inside a root element ───
function collectTextNodes(root: Element): Text[] {
    const nodes: Text[] = [];
    const skipSet = root.querySelectorAll(SKIP_SELECTORS);
    const skipElements = new Set<Node>(Array.from(skipSet));

    const walker = document.createTreeWalker(
        root,
        NodeFilter.SHOW_TEXT,
        {
            acceptNode(node) {
                let parent = node.parentElement;
                while (parent && parent !== root) {
                    if (skipElements.has(parent)) return NodeFilter.FILTER_REJECT;
                    const style = window.getComputedStyle(parent);
                    if (style.display === 'none' || style.visibility === 'hidden') return NodeFilter.FILTER_REJECT;
                    parent = parent.parentElement;
                }
                const text = (node.textContent || '').trim();
                if (text.length < MIN_TEXT_LEN) return NodeFilter.FILTER_SKIP;
                if (/^\d+(\.\d+)?$/.test(text)) return NodeFilter.FILTER_SKIP;
                if (/^https?:\/\//.test(text)) return NodeFilter.FILTER_SKIP;
                if (/^[\w.+-]+@[\w.-]+\.\w{2,}$/.test(text)) return NodeFilter.FILTER_SKIP;
                return NodeFilter.FILTER_ACCEPT;
            }
        }
    );

    let node: Node | null;
    while ((node = walker.nextNode())) {
        nodes.push(node as Text);
    }
    return nodes;
}

// ─── Apply translations to DOM ───
function applyTranslations(nodes: Text[], translations: Record<string, string>) {
    for (const node of nodes) {
        const orig = node.parentElement?.getAttribute(ORIG_ATTR) || node.textContent || '';
        const normalized = orig.trim();
        if (translations[normalized]) {
            const leadWS = node.textContent?.match(/^\s*/)?.[0] || '';
            const trailWS = node.textContent?.match(/\s*$/)?.[0] || '';
            node.textContent = leadWS + translations[normalized] + trailWS;
        }
    }
}

// ─── Restore original Spanish text ───
function restoreOriginals(root: Element) {
    const tagged = root.querySelectorAll(`[${ORIG_ATTR}]`);
    tagged.forEach(el => {
        const origText = el.getAttribute(ORIG_ATTR);
        if (origText === null) return;
        // Find the direct text node child
        for (const child of Array.from(el.childNodes)) {
            if (child.nodeType === Node.TEXT_NODE) {
                const leadWS = child.textContent?.match(/^\s*/)?.[0] || '';
                const trailWS = child.textContent?.match(/\s*$/)?.[0] || '';
                child.textContent = leadWS + origText + trailWS;
                break;
            }
        }
        el.removeAttribute(ORIG_ATTR);
    });
}

// ─── Context ───

interface LangContextType {
    lang: string;
    setLang: (lang: string) => void;
    translate: (text: string) => Promise<string>;
    translateSync: (text: string) => string;
    isTranslating: boolean;
}

const LangContext = createContext<LangContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [lang, setLangState] = useState<string>(() =>
        localStorage.getItem('site_language') || 'es'
    );
    const [isTranslating, setIsTranslating] = useState(false);
    const translationRootRef = useRef<Element | null>(null);
    const mutationObserverRef = useRef<MutationObserver | null>(null);
    const translateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const isRunningRef = useRef(false);

    const setLang = useCallback((newLang: string) => {
        localStorage.setItem('site_language', newLang);
        setLangState(newLang);
    }, []);

    const translate = useCallback(async (text: string): Promise<string> => {
        return translateSingle(text, lang);
    }, [lang]);

    const translateSync = useCallback((text: string): string => {
        if (!text || lang === 'es') return text;
        return memoryCache[lang]?.[text] || text;
    }, [lang]);

    // ─── Main page translation engine ───
    const translatePage = useCallback(async (targetLang: string) => {
        if (isRunningRef.current) return; // prevent concurrent runs
        const root = translationRootRef.current;
        if (!root) return;

        if (targetLang === 'es') {
            restoreOriginals(root);
            setIsTranslating(false);
            return;
        }

        isRunningRef.current = true;
        setIsTranslating(true);

        // Pause MutationObserver to prevent infinite loops during DOM writes
        mutationObserverRef.current?.disconnect();

        try {
            const nodes = collectTextNodes(root);

            // Tag each node's parent with the original text
            for (const node of nodes) {
                const parent = node.parentElement;
                if (parent && !parent.hasAttribute(ORIG_ATTR)) {
                    parent.setAttribute(ORIG_ATTR, (node.textContent || '').trim());
                }
            }

            // Collect unique non-cached texts
            const uniqueTexts = [...new Set(
                nodes.map(n => (n.textContent || '').trim()).filter(t => t.length >= MIN_TEXT_LEN)
            )];

            // Batch in chunks of 40
            const CHUNK = 40;
            for (let i = 0; i < uniqueTexts.length; i += CHUNK) {
                const chunk = uniqueTexts.slice(i, i + CHUNK);
                const translations = await batchTranslate(chunk, targetLang);
                const freshNodes = collectTextNodes(root);
                applyTranslations(freshNodes, translations);
            }
        } finally {
            isRunningRef.current = false;
            setIsTranslating(false);
            // Re-connect MutationObserver
            if (mutationObserverRef.current && targetLang !== 'es') {
                mutationObserverRef.current.observe(root, {
                    childList: true,
                    subtree: true,
                    characterData: false,
                });
            }
        }
    }, []);

    // ─── Run translation whenever lang changes ───
    useEffect(() => {
        if (translateTimerRef.current) clearTimeout(translateTimerRef.current);
        translateTimerRef.current = setTimeout(() => {
            translatePage(lang);
        }, 200);
        return () => {
            if (translateTimerRef.current) clearTimeout(translateTimerRef.current);
        };
    }, [lang, translatePage]);

    // ─── MutationObserver: re-translate when new content is injected ───
    useEffect(() => {
        const root = document.getElementById('root');
        if (!root) return;
        translationRootRef.current = root;

        if (mutationObserverRef.current) {
            mutationObserverRef.current.disconnect();
            mutationObserverRef.current = null;
        }

        if (lang === 'es') return;

        const observer = new MutationObserver(() => {
            if (isRunningRef.current) return;
            if (translateTimerRef.current) clearTimeout(translateTimerRef.current);
            translateTimerRef.current = setTimeout(() => {
                translatePage(lang);
            }, 700);
        });

        observer.observe(root, { childList: true, subtree: true, characterData: false });
        mutationObserverRef.current = observer;

        return () => {
            observer.disconnect();
            mutationObserverRef.current = null;
        };
    }, [lang, translatePage]);

    return (
        <LangContext.Provider value={{ lang, setLang, translate, translateSync, isTranslating }}>
            {children}
        </LangContext.Provider>
    );
};

export const useLang = () => {
    const ctx = useContext(LangContext);
    if (!ctx) throw new Error('useLang must be used within LanguageProvider');
    return ctx;
};

// ─── Hook for auto-translating a single piece of text (for <T> component) ───
export const useTranslated = (text: string): string => {
    const { lang, translate, translateSync } = useLang();
    const [result, setResult] = useState<string>(translateSync(text));

    useEffect(() => {
        if (!text || lang === 'es') {
            setResult(text);
            return;
        }
        const cached = translateSync(text);
        if (cached !== text) {
            setResult(cached);
            return;
        }
        let cancelled = false;
        translate(text).then(translated => {
            if (!cancelled) setResult(translated);
        });
        return () => { cancelled = true; };
    }, [text, lang, translate, translateSync]);

    return result;
};
