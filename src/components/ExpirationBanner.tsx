import React from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { useClub } from '../contexts/ClubContext';

const ExpirationBanner: React.FC = () => {
    const { club, bannerVisible, setBannerVisible } = useClub();

    if (!club || !club.expirationBannerActive) return null;

    const currentYear = new Date().getFullYear();
    const nextYear = currentYear + 1;
    const defaultMessage = `Vencimiento Sitio en periodo de renovación ${currentYear}-${nextYear}. Evite suspensión, contacte a soporte técnico para asegurar su continuidad.`;
    const message = club.expirationBannerMessage || defaultMessage;

    return (
        <div className="sticky top-0 flex items-center justify-center overflow-hidden bg-red-600 px-6 py-2 z-[99999] shadow-lg border-b border-red-700/50">
            <div className="flex items-center gap-x-2 text-center">
                <AlertTriangle className="w-4 h-4 text-yellow-300 animate-pulse flex-shrink-0" />
                <p className="text-sm leading-6 text-white font-normal">
                    {message}
                </p>
            </div>
        </div>
    );
};

export default ExpirationBanner;
