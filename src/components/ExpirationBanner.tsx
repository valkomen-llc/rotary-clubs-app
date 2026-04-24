import React from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { useClub } from '../contexts/ClubContext';

const ExpirationBanner: React.FC = () => {
    const { club, bannerVisible, setBannerVisible } = useClub();

    if (!club || !club.expirationBannerActive) return null;

    const currentYear = new Date().getFullYear();
    const nextYear = currentYear + 1;
    const defaultMessage = `Sitio en periodo de renovación ${currentYear}-${nextYear}. Evite suspensión, contacte a soporte técnico para asegurar la continuidad de los servicios.`;
    const message = club.expirationBannerMessage || defaultMessage;

    return (
        <div className="sticky top-0 flex items-center gap-x-6 overflow-hidden bg-red-600 px-6 py-2 z-[99999] shadow-lg border-b border-red-700/50">
            <div className="flex items-center gap-x-4 flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-shrink-0">
                    <AlertTriangle className="w-4 h-4 text-yellow-300 animate-pulse" />
                    <strong className="font-black uppercase tracking-[0.2em] text-[10px] bg-red-800/80 px-2 py-0.5 rounded shadow-inner text-white">Vencimiento</strong>
                </div>
                
                {/* Marquee-like container for full text visibility if very long */}
                <div className="overflow-hidden relative flex-1">
                    <p className="text-sm leading-6 text-white font-bold whitespace-nowrap animate-marquee">
                        {message}
                    </p>
                </div>
            </div>
            
            <style>{`
                @keyframes marquee {
                    0% { transform: translateX(0); }
                    100% { transform: translateX(-10%); }
                }
                .animate-marquee {
                    display: inline-block;
                    animation: marquee 20s linear infinite alternate;
                }
                .animate-marquee:hover {
                    animation-play-state: paused;
                }
            `}</style>
        </div>
    );
};

export default ExpirationBanner;
