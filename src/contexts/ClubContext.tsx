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
    const [error, setError] = useState<string | null>(null);
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
                    if (response.status >= 500) {
                        setError('Database connection error. Please check quotas.');
                    }
                    // Fallback to local config if API fails or club not found
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

    if (isLoading) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-[#0B1120] text-white">
                <div className="w-10 h-10 border-2 border-white/20 border-t-blue-500 rounded-full animate-spin mb-4" />
                <p className="text-sm text-gray-400 font-medium tracking-wide">Cargando plataforma...</p>
            </div>
        );
    }

    if (error && !club?.id) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-[#0B1120] p-6 text-center">
                <div className="w-16 h-16 bg-red-500/10 rounded-2xl flex items-center justify-center mb-6 border border-red-500/20">
                    <span className="text-2xl">⚠️</span>
                </div>
                <h1 className="text-2xl font-black text-white mb-2">Mantenimiento de Infraestructura</h1>
                <p className="text-gray-400 max-w-md leading-relaxed">
                    Estamos experimentando una alta demanda en nuestros servidores. 
                    Por favor, intenta de nuevo en unos minutos o contacta a soporte si el problema persiste.
                </p>
                <button 
                    onClick={() => window.location.reload()}
                    className="mt-8 px-6 py-2.5 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-900/20"
                >
                    Reintentar conexión
                </button>
            </div>
        );
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
