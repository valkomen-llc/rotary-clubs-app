import React, { useState, useRef, useEffect } from 'react';
import { Globe, ChevronDown, ExternalLink } from 'lucide-react';
import { useLang, SUPPORTED_LANGUAGES } from '../contexts/LanguageContext';

// Barra superior estilo Rotary.org (Endpolio.org · My Rotary · selector de
// idioma), idéntica a la del Navbar del sitio, para reutilizar en las páginas
// públicas del calendario. El español va de primero en el selector.
const orderedLanguages = [
    ...SUPPORTED_LANGUAGES.filter((l) => l.code === 'es'),
    ...SUPPORTED_LANGUAGES.filter((l) => l.code !== 'es'),
];

const PublicTopBar: React.FC = () => {
    const { lang, setLang } = useLang();
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    const current = SUPPORTED_LANGUAGES.find((l) => l.code === lang) || SUPPORTED_LANGUAGES[0];

    useEffect(() => {
        const onClick = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', onClick);
        return () => document.removeEventListener('mousedown', onClick);
    }, []);

    return (
        <div className="bg-rotary-topbar text-white relative z-[60]" data-no-translate>
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex items-center justify-end gap-6 sm:gap-8 py-4 text-sm">
                    <a href="https://app.clubplatform.org/"
                        className="flex items-center gap-1.5 font-bold text-white hover:text-white/80 transition-colors">
                        Iniciar sesión <ExternalLink className="w-3.5 h-3.5" />
                    </a>

                    <div className="relative" ref={ref}>
                        <button onClick={() => setOpen(!open)} className="flex items-center gap-1.5 font-bold text-white hover:text-white/80 transition-colors">
                            <Globe className="w-4 h-4" />
                            <span>{current.name}</span>
                            <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
                        </button>

                        {open && (
                            <div className="absolute top-full right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-100 py-2 z-[70]">
                                {orderedLanguages.map((l) => (
                                    <button key={l.code} onClick={() => { setLang(l.code); setOpen(false); }}
                                        className={`w-full flex items-center gap-3 px-4 py-1.5 text-sm hover:bg-sky-50 transition-colors ${current.code === l.code ? 'text-rotary-blue font-medium' : 'text-gray-700'}`}>
                                        <div className="w-5 h-3.5 overflow-hidden rounded-sm flex-shrink-0 shadow-sm border border-black/5">
                                            <img src={`https://flagcdn.com/w40/${l.flag}.png`} alt="" className="w-full h-full object-cover" />
                                        </div>
                                        <span>{l.name}</span>
                                        {current.code === l.code && <span className="ml-auto w-2 h-2 bg-rotary-blue rounded-full" />}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PublicTopBar;
