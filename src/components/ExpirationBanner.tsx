import React from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { useClub } from '../contexts/ClubContext';

const ExpirationBanner: React.FC = () => {
    const { club, bannerVisible, setBannerVisible } = useClub();

    if (!club || !club.expirationBannerActive || !bannerVisible) return null;

    const currentYear = new Date().getFullYear();
    const nextYear = currentYear + 1;

    return (
        <div className="sticky top-0 flex items-center justify-center overflow-hidden bg-red-600 px-6 py-2 z-[99999] shadow-lg border-b border-red-700/50 animate-in slide-in-from-top duration-300">
            <div className="flex items-center gap-x-4 w-full justify-center relative">
                <div className="flex items-center gap-x-4">
                    <div className="flex items-center gap-3 flex-shrink-0">
                        <AlertTriangle className="w-5 h-5 text-yellow-300 animate-pulse" />
                        <div className="bg-red-800/80 px-4 py-1 rounded-lg shadow-inner border border-red-900/20">
                            <span className="font-black uppercase tracking-[0.25em] text-[11px] text-white">Vencimiento</span>
                        </div>
                    </div>
                    <p className="text-[13px] leading-6 text-white font-normal">
                        Sitio en periodo de renovación {currentYear}-{nextYear}. Evite suspensión y bloqueos, contacte a soporte para asegurar su continuidad.
                    </p>
                </div>

                <button 
                    type="button" 
                    onClick={() => setBannerVisible(false)} 
                    className="absolute right-0 p-1.5 hover:bg-red-500/20 rounded-full transition-colors group"
                    title="Cerrar (se reactivará en 10s)"
                >
                    <X className="h-4 w-4 text-white/50 group-hover:text-white transition-colors" />
                </button>
            </div>
        </div>
    );
};

export default ExpirationBanner;
