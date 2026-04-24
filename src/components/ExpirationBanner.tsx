import React from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { useClub } from '../contexts/ClubContext';

const ExpirationBanner: React.FC = () => {
    const { club, isAppPortal } = useClub();
    const [isVisible, setIsVisible] = React.useState(true);

    if (!club || !club.expirationBannerActive || !isVisible) return null;

    // Use a professional default message if none is provided
    const defaultMessage = "Sitio en periodo de renovación. Contacte a soporte para asegurar la continuidad de los servicios y evitar la suspensión.";
    const message = club.expirationBannerMessage || defaultMessage;

    return (
        <div className="relative isolate flex items-center gap-x-6 overflow-hidden bg-red-600 px-6 py-2.5 sm:px-3.5 sm:before:flex-1 animate-in slide-in-from-top duration-500 z-[9999]">
            <div className="absolute left-[max(-7rem,calc(50%-52rem))] top-1/2 -z-10 -translate-y-1/2 transform-gpu blur-2xl" aria-hidden="true">
                <div className="aspect-[577/310] w-[36.0625rem] bg-gradient-to-r from-[#ff80b5] to-[#9089fc] opacity-30" style={{ clipPath: 'polygon(74.8% 41.9%, 97.2% 73.2%, 100% 34.9%, 92.5% 0.4%, 87.5% 0%, 75% 28.6%, 58.5% 54.6%, 50.1% 56.8%, 46.9% 44%, 48.3% 17.4%, 24.7% 53.9%, 0% 27.9%, 11.9% 74.2%, 24.9% 54.1%, 44.1% 35.2%, 74.8% 41.9%)' }}></div>
            </div>
            <div className="absolute left-[max(45rem,calc(50%+8rem))] top-1/2 -z-10 -translate-y-1/2 transform-gpu blur-2xl" aria-hidden="true">
                <div className="aspect-[577/310] w-[36.0625rem] bg-gradient-to-r from-[#ff80b5] to-[#9089fc] opacity-30" style={{ clipPath: 'polygon(74.8% 41.9%, 97.2% 73.2%, 100% 34.9%, 92.5% 0.4%, 87.5% 0%, 75% 28.6%, 58.5% 54.6%, 50.1% 56.8%, 46.9% 44%, 48.3% 17.4%, 24.7% 53.9%, 0% 27.9%, 11.9% 74.2%, 24.9% 54.1%, 44.1% 35.2%, 74.8% 41.9%)' }}></div>
            </div>
            <div className="flex items-center gap-x-4 flex-1 min-w-0">
                <p className="text-sm leading-6 text-white flex items-center gap-2 truncate">
                    <AlertTriangle className="w-4 h-4 text-yellow-300 animate-pulse flex-shrink-0" />
                    <strong className="font-black uppercase tracking-[0.2em] text-[10px] bg-red-700/50 px-2 py-0.5 rounded flex-shrink-0">Vencimiento</strong>
                    <span className="text-red-50 font-medium truncate">{message}</span>
                </p>
            </div>
            <div className="flex flex-1 justify-end">
                <button type="button" onClick={() => setIsVisible(false)} className="-m-3 p-3 focus-visible:outline-offset-[-4px] hover:bg-red-500/20 rounded-full transition-colors">
                    <span className="sr-only">Dismiss</span>
                    <X className="h-5 w-5 text-white" aria-hidden="true" />
                </button>
            </div>
        </div>
    );
};

export default ExpirationBanner;
