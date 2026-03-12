import React, { createContext, useContext, useEffect, useState } from 'react';
import type { ClubConfig } from '../config/clubConfig';
import { getClubByHostname, DEFAULT_CLUB } from '../config/clubConfig';

declare global {
    interface Window {
        gtag: (...args: any[]) => void;
    }
}

interface ClubContextType {
    club: ClubConfig;
    isLoading: boolean;
    isMainPlatform: boolean;
    isAppPortal: boolean;
    isDraft: boolean;
}

const ClubContext = createContext<ClubContextType | undefined>(undefined);

export const ClubProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [club, setClub] = useState<ClubConfig | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const hostname = window.location.hostname;
    const isMainPlatform = hostname === 'clubplatform.org' || hostname === 'www.clubplatform.org';
    const isAppPortal = hostname === 'app.clubplatform.org' || hostname === 'localhost' && window.location.port === '5174';

    useEffect(() => {
        // If this is the main platform domain, skip club lookup
        if (isMainPlatform) {
            setClub(getClubByHostname(hostname));
            setIsLoading(false);
            return;
        }

        // Super admin portal: provide platform-level config
        if (isAppPortal) {
            const platformClub: ClubConfig = {
                ...DEFAULT_CLUB,
                id: 'platform',
                name: 'Rotary Platform',
                domain: 'app.clubplatform.org',
                logoText: 'Rotary Platform',
                logo: 'https://www.rotary.org/sites/all/themes/rotary_rotaryorg/images/defined/rotary-logo-color.png',
                isMainPlatform: true,
                onboardingCompleted: true,
                status: 'active',
                colors: { primary: '#17458F', secondary: '#F7A81B' },
            };
            setClub(platformClub);
            setIsLoading(false);
            return;
        }
        const fetchClub = async () => {
            try {
                const hostname = window.location.hostname;
                const urlParams = new URLSearchParams(window.location.search);
                const clubOverride = urlParams.get('club');

                const queryDomain = clubOverride || hostname;

                const response = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/clubs/by-domain?domain=${queryDomain}`);

                if (response.ok) {
                    const data = await response.json();
                    setClub(data);
                    document.title = data.name;

                    // Update Favicon
                    if (data.favicon) {
                        let link: HTMLLinkElement | null = document.querySelector("link[rel~='icon']");
                        if (!link) {
                            link = document.createElement('link');
                            link.rel = 'icon';
                            document.getElementsByTagName('head')[0].appendChild(link);
                        }
                        link.href = data.favicon;
                    }

                    // Sync with Google Analytics
                    if (typeof window.gtag === 'function') {
                        window.gtag('config', 'G-XXXXXXXXXX', {
                            'club_id': data.id,
                            'club_name': data.name,
                            'subdomain': data.subdomain,
                            'custom_map': { 'dimension1': 'club_id' }
                        });
                        window.gtag('set', 'user_properties', {
                            'current_club': data.subdomain
                        });
                    }
                } else {
                    // Fallback to local config if API fails or club not found
                    setClub(getClubByHostname(hostname));
                }
            } catch (error) {
                console.error('Error loading club config:', error);
                setClub(getClubByHostname(window.location.hostname));
            } finally {
                setIsLoading(false);
            }
        };

        fetchClub();
    }, []);

    if (isLoading) {
        return <div className="min-h-screen flex items-center justify-center bg-rotary-blue text-white">Cargando...</div>;
    }

    if (!club) {
        return <div className="min-h-screen flex items-center justify-center bg-red-600 text-white">Error: Club no encontrado</div>;
    }

    const isDraft = club?.status === 'draft';

    return (
        <ClubContext.Provider value={{ club, isLoading, isMainPlatform, isAppPortal, isDraft }}>
            {children}
        </ClubContext.Provider>
    );
};

export const useClub = () => {
    const context = useContext(ClubContext);
    if (context === undefined) {
        throw new Error('useClub must be used within a ClubProvider');
    }
    return context;
};
