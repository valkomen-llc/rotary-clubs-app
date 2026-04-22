import React, { createContext, useContext, useEffect, useState } from 'react';
import type { ClubConfig } from '../config/clubConfig';
import { getClubByHostname } from '../config/clubConfig';

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

export const ClubContext = createContext<ClubContextType | undefined>(undefined);

export const ClubProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [club, setClub] = useState<ClubConfig | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const hostname = window.location.hostname;
    const isMainPlatform = hostname === 'clubplatform.org' || hostname === 'www.clubplatform.org';
    const isAppPortal = hostname === 'app.clubplatform.org' || hostname === 'localhost' && window.location.port === '5174';

    useEffect(() => {
        // --- REDIRECCIÓN ESPECIAL CONFERENCIA LATIR ---
        const currentPath = window.location.pathname.toLowerCase();
        const currentHash = window.location.hash.toLowerCase();
        if (currentPath.includes('/conferencia') || currentHash.includes('/conferencia')) {
            window.location.href = 'https://rotarylatir.org/#/eventos/2038324a-0e04-497c-9328-fbaeb9ce2992';
            return;
        }

        // FORCED REDIRECTION RULE (Nuclear Option)
        // If we are on the main domain root, redirect to app subdomain IMMEDIATELY.
        if (isMainPlatform && window.location.pathname === '/') {
            console.log('Forced Domain Redirect: clubplatform.org -> app.clubplatform.org');
            window.location.replace('https://app.clubplatform.org/');
            return;
        }

        const fetchClub = async () => {
            try {
                const hostname = window.location.hostname;
                const urlParams = new URLSearchParams(window.location.search);
                const clubOverride = urlParams.get('club') || urlParams.get('asociacion') || urlParams.get('distrito');

                const queryDomain = clubOverride || hostname;
                let finalDomainQuery = queryDomain;

                // CRITICAL AESTHETIC FIX FOR DASHBOARD
                // If a user is logged in, and we are on the base app domain with no override,
                // we MUST fetch the data for the logged-in user's club instead of falling back to "origen"!
                if (!clubOverride && (hostname === 'app.clubplatform.org' || hostname === 'localhost')) {
                    try {
                        const lsUserStr = localStorage.getItem('rotary_user');
                        if (lsUserStr) {
                            const lsUser = JSON.parse(lsUserStr);
                            if (lsUser?.club?.subdomain) {
                                finalDomainQuery = lsUser.club.subdomain;
                            }
                        }
                    } catch (e) { }
                }

                const response = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/clubs/by-domain?domain=${finalDomainQuery}`);

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
