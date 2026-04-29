import React, { useState, useEffect } from 'react';
import { Construction, X, ChevronRight } from 'lucide-react';
import { useClub } from '../contexts/ClubContext';
import { useNavigate } from 'react-router-dom';

const DevelopmentBanner: React.FC = () => {
    const { club, developmentBannerVisible, setDevelopmentBannerVisible } = useClub();
    const [shouldRender, setShouldRender] = useState(false);
    const navigate = useNavigate();

    // The audio mentions it should appear 10 to 15 seconds after navigating.
    useEffect(() => {
        if (!club || !club.developmentBannerActive) return;

        const timer = setTimeout(() => {
            setShouldRender(true);
        }, 15000); // 15 seconds delay

        return () => clearTimeout(timer);
    }, [club]);

    if (!club || !club.developmentBannerActive || !developmentBannerVisible || !shouldRender) return null;

    const handleSupportClick = () => {
        const phoneNumber = '573205028376';
        const currentUrl = window.location.href;
        const clubName = club?.name || 'mi club rotario';
        const message = `Activar sitio y ecosistema digital para mi club rotario ${clubName} ${currentUrl}`;
        const whatsappUrl = `https://wa.me/${phoneNumber}?text=${encodeURIComponent(message)}`;
        window.open(whatsappUrl, '_blank');
    };

    return (
        <div className="sticky top-0 flex items-center justify-center overflow-hidden bg-yellow-500 px-6 py-2 z-[99998] shadow-lg border-b border-yellow-600/50 animate-in slide-in-from-top duration-300">
            <div className="flex items-center gap-x-4 w-full justify-center relative flex-wrap sm:flex-nowrap gap-y-2">
                <div className="flex items-center gap-x-4">
                    <div className="flex items-center gap-3 flex-shrink-0">
                        <Construction className="w-5 h-5 text-yellow-900 animate-pulse" />
                        <div className="bg-yellow-600/80 px-4 py-1 rounded-lg shadow-inner border border-yellow-700/20">
                            <span className="font-black uppercase tracking-[0.25em] text-[10px] text-yellow-950">Desarrollo</span>
                        </div>
                    </div>
                    <p className="text-[12px] leading-6 text-yellow-950 font-medium">
                        {club.developmentBannerMessage || 'Sitio en construcción. Para poder publicar el sitio o llevar a un entorno de producción, por favor contacta a soporte.'}
                    </p>
                </div>

                <button 
                    onClick={handleSupportClick}
                    className="flex items-center gap-1 bg-yellow-900 text-yellow-50 px-3 py-1 text-xs font-bold rounded-md hover:bg-yellow-800 transition-colors ml-4 shadow-sm"
                >
                    Contacta aquí a soporte <ChevronRight className="w-3 h-3" />
                </button>

                <button 
                    type="button" 
                    onClick={() => setDevelopmentBannerVisible(false)} 
                    className="absolute right-0 p-1.5 hover:bg-yellow-600/20 rounded-full transition-colors group"
                    title="Cerrar (se reactivará en 10s)"
                >
                    <X className="h-4 w-4 text-yellow-900/50 group-hover:text-yellow-900 transition-colors" />
                </button>
            </div>
        </div>
    );
};

export default DevelopmentBanner;
