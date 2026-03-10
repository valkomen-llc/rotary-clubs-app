import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

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

// L1 cache: in-memory per session (lang -> originalText -> translatedText)
const memoryCache: Record<string, Record<string, string>> = {};

interface LangContextType {
    lang: string;
    setLang: (lang: string) => void;
    translate: (text: string) => Promise<string>;
    translateSync: (text: string) => string; // Returns cached or original
    isTranslating: boolean;
}

const LangContext = createContext<LangContextType | undefined>(undefined);
const API_URL = import.meta.env.VITE_API_URL || '/api';

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [lang, setLangState] = useState<string>(() =>
        localStorage.getItem('site_language') || 'es'
    );
    const [isTranslating, setIsTranslating] = useState(false);

    const setLang = useCallback((newLang: string) => {
        localStorage.setItem('site_language', newLang);
        setLangState(newLang);
    }, []);

    // Translate a single string via Gemini (L1 memory -> L2 BD -> L3 Gemini API)
    const translate = useCallback(async (text: string): Promise<string> => {
        if (!text || !text.trim()) return text;
        if (lang === 'es') return text; // Spanish is the master language

        // L1: memory cache
        if (memoryCache[lang]?.[text]) return memoryCache[lang][text];

        try {
            const resp = await fetch(`${API_URL}/translate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text, targetLang: lang }),
            });
            if (!resp.ok) return text;
            const data = await resp.json();
            const translated = data.translated || text;
            // Save to L1 memory cache
            if (!memoryCache[lang]) memoryCache[lang] = {};
            memoryCache[lang][text] = translated;
            return translated;
        } catch {
            return text;
        }
    }, [lang]);

    // Sync version — returns cached translation or original
    const translateSync = useCallback((text: string): string => {
        if (!text || lang === 'es') return text;
        return memoryCache[lang]?.[text] || text;
    }, [lang]);

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

// Hook for auto-translating a piece of text
export const useTranslated = (text: string): string => {
    const { lang, translate, translateSync } = useLang();
    const [result, setResult] = useState<string>(translateSync(text));

    useEffect(() => {
        if (!text || lang === 'es') {
            setResult(text);
            return;
        }
        // Try cache first
        const cached = translateSync(text);
        if (cached !== text) {
            setResult(cached);
            return;
        }
        // Call API
        let cancelled = false;
        translate(text).then(translated => {
            if (!cancelled) setResult(translated);
        });
        return () => { cancelled = true; };
    }, [text, lang, translate, translateSync]);

    return result;
};
