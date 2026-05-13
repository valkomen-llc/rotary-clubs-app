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
    bannerVisible: boolean;
    setBannerVisible: (visible: boolean) => void;
    developmentBannerVisible: boolean;
    setDevelopmentBannerVisible: (visible: boolean) => void;
    refreshClub: () => Promise<void>;
    isProduction: boolean;
}

export const ClubContext = createContext<ClubContextType | undefined>(undefined);

export const ClubProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [club, setClub] = useState<ClubConfig | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [bannerVisible, setBannerVisible] = useState(true);
    const [developmentBannerVisible, setDevelopmentBannerVisible] = useState(true);

    // Auto-reactivation logic (Penalty mode)
    useEffect(() => {
        if (!bannerVisible) {
            const timer = setTimeout(() => {
                setBannerVisible(true);
            }, 10000);
            return () => clearTimeout(timer);
        }
    }, [bannerVisible]);

    useEffect(() => {
        if (!developmentBannerVisible) {
            const timer = setTimeout(() => {
                setDevelopmentBannerVisible(true);
            }, 10000);
            return () => clearTimeout(timer);
        }
    }, [developmentBannerVisible]);
    const hostname = window.location.hostname;
    const isMainPlatform = hostname === 'clubplatform.org' || hostname === 'www.clubplatform.org';
    const isAppPortal = hostname === 'app.clubplatform.org' || hostname === 'localhost' && window.location.port === '5174';

    useEffect(() => {


        // FORCED REDIRECTION RULE (Nuclear Option)
        // If we are on the main domain root, redirect to app subdomain IMMEDIATELY.
        if (isMainPlatform && window.location.pathname === '/') {
            console.log('Forced Domain Redirect: clubplatform.org -> app.clubplatform.org');
            window.location.replace('https://app.clubplatform.org/');
            return;
        }

        const fetchClub = async () => {
            setIsLoading(true);
            try {
                const hostname = window.location.hostname;
                const urlParams = new URLSearchParams(window.location.search);
                const clubOverride = urlParams.get('club') || urlParams.get('asociacion') || urlParams.get('distrito');

                const queryDomain = clubOverride || hostname;
                let finalDomainQuery = queryDomain;

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

                // Cache busting with timestamp
                const response = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/clubs/by-domain?domain=${finalDomainQuery}&t=${Date.now()}`);

                if (response.ok) {
                    const data = await response.json();
                    
                    // Force "Programa de Intercambio" type for RYE subdomains (Branding Parity)
                    if (data.subdomain?.toLowerCase().includes('rye') || hostname.toLowerCase().includes('rye')) {
                        data.type = 'Programa de Intercambio';
                    }
                    
                    setClub(data);
                    document.title = data.name;

                    if (data.favicon) {
                        let link: HTMLLinkElement | null = document.querySelector("link[rel~='icon']");
                        if (!link) {
                            link = document.createElement('link');
                            link.rel = 'icon';
                            document.getElementsByTagName('head')[0].appendChild(link);
                        }
                        link.href = data.favicon;
                    }

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
                    if (response.status >= 500) {
                        setError('Database connection error. Please check quotas.');
                    }
                    setClub(getClubByHostname(hostname));
                }
            } catch (error) {
                console.error('Error loading club config:', error);
                setError('Network error or platform maintenance.');
                setClub(getClubByHostname(window.location.hostname));
            } finally {
                setIsLoading(false);
            }
        };

        fetchClub();
    }, []);

    const refreshClub = async () => {
        // Reuse logic from useEffect if possible, but for now we repeat it or refactor
        // To avoid duplication, I will refactor the useEffect to call this function.
    };

    if (isLoading) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-[#0B1120] text-white">
                <div className="w-10 h-10 border-2 border-white/20 border-t-blue-500 rounded-full animate-spin mb-4" />
                <p className="text-sm text-gray-400 font-medium tracking-wide">Cargando plataforma...</p>
            </div>
        );
    }

    const PLATFORM_HOSTS = ['clubplatform.org', 'www.clubplatform.org', 'app.clubplatform.org', 'localhost'];
    const isDraft = club?.status === 'draft';
    const isProduction = !isDraft && (
        club?.status === 'active' || 
        club?.status === 'published' || 
        !!(club as any)?.production || 
        !!(club as any)?.isPublished || 
        !!(club as any)?.domainConnected ||
        (!!club?.domain && !club.domain.includes('clubplatform.org')) ||
        (!PLATFORM_HOSTS.includes(window.location.hostname))
    );

    return (
        <ClubContext.Provider value={{ 
            club, 
            isLoading, 
            isMainPlatform, 
            isAppPortal, 
            isDraft,
            isProduction,
            bannerVisible, 
            setBannerVisible, 
            developmentBannerVisible, 
            setDevelopmentBannerVisible,
            refreshClub: async () => {
                const hostname = window.location.hostname;
                const urlParams = new URLSearchParams(window.location.search);
                const clubOverride = urlParams.get('club') || urlParams.get('asociacion') || urlParams.get('distrito');
                const queryDomain = clubOverride || hostname;
                let finalDomainQuery = queryDomain;
                
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

                const response = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/clubs/by-domain?domain=${finalDomainQuery}&t=${Date.now()}`);
                if (response.ok) {
                    const data = await response.json();
                    setClub(data);
                }
            }
        }}>
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
