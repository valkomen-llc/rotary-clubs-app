import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ClubConfig } from '../config/clubConfig';
import { getClubByHostname } from '../config/clubConfig';
import {
    BOOT_RETRY_DELAYS_MS, SLOW_NOTICE_MS, classifyBootResponse, fetchWithTimeout,
    readLastGoodSite, writeLastGoodSite, sameSite, sleep,
} from '../lib/siteBoot';

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
    const [, setError] = useState<string | null>(null);
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

    const [slowBoot, setSlowBoot] = useState(false);
    const [bootFailed, setBootFailed] = useState(false);
    // Un solo arranque a la vez: un «Reintentar» pulsado dos veces, o un
    // refresco del panel encima de un arranque, no abren cargas en paralelo.
    const loading = useRef<Promise<void> | null>(null);

    /** El dominio que se pregunta: el override de la URL, la sesión del panel o el host. */
    const siteQuery = (): string => {
        const host = window.location.hostname;
        const urlParams = new URLSearchParams(window.location.search);
        const clubOverride = urlParams.get('club') || urlParams.get('asociacion') || urlParams.get('distrito');
        if (clubOverride) return clubOverride;
        if (host === 'app.clubplatform.org' || host === 'localhost') {
            try {
                const lsUser = JSON.parse(localStorage.getItem('rotary_user') || 'null');
                if (lsUser?.club?.subdomain) return lsUser.club.subdomain;
            } catch { /* sesión ilegible: se pregunta por el host */ }
        }
        return host;
    };

    /** Lo que se hace con una configuración recibida: estado, título, ícono, analítica. */
    const applyClub = (data: any) => {
        const host = window.location.hostname;
        // Force "Programa de Intercambio" type for RYE subdomains (Branding Parity)
        if (data.subdomain?.toLowerCase().startsWith('rye') || host.toLowerCase().startsWith('rye')) {
            data.type = 'Programa de Intercambio';
        }
        setClub(prev => (prev && sameSite(prev, data) ? prev : data));
        if (data.name) document.title = data.name;
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
            window.gtag('set', {
                'club_id': data.id,
                'club_name': data.name,
                'subdomain': data.subdomain,
                'site_category': data.category || data.type || 'club'
            });
            window.gtag('set', 'user_properties', {
                'current_club': data.subdomain,
                'current_club_id': data.id
            });
        }
    };

    /**
     * Arranque y refresco, en UN solo camino (hasta v4.1179 el refresco era una
     * copia a mano del arranque, sin tope y sin manejo de errores).
     *
     * - Con una copia buena guardada, se pinta AL INSTANTE y se actualiza en
     *   segundo plano: una visita repetida no espera al servidor.
     * - Sin copia, se espera con tope por intento y reintentos acotados; si se
     *   agotan, pantalla con su motivo y «Reintentar». Nunca un giro sin fin.
     * - Un 4xx no se reintenta: el servidor contestó que no hay sitio, y se
     *   usa la configuración de respaldo como siempre.
     */
    const loadClub = useCallback(({ initial = false, fresh = false }: { initial?: boolean; fresh?: boolean } = {}) => {
        if (loading.current) return loading.current;
        const run = (async () => {
            const query = siteQuery();
            const cached = initial ? readLastGoodSite<any>(query) : null;
            if (initial) {
                setBootFailed(false);
                if (cached) {
                    applyClub(cached);
                    setIsLoading(false);
                } else {
                    setIsLoading(true);
                }
            }
            const slowTimer = initial && !cached ? setTimeout(() => setSlowBoot(true), SLOW_NOTICE_MS) : null;
            try {
                let lastStatus: number | null = null;
                for (const delay of BOOT_RETRY_DELAYS_MS) {
                    if (delay) await sleep(delay);
                    try {
                        const url = `${import.meta.env.VITE_API_URL || '/api'}/clubs/by-domain?domain=${encodeURIComponent(query)}${fresh ? '&fresh=1' : ''}&t=${Date.now()}`;
                        const response = await fetchWithTimeout(url);
                        lastStatus = response.status;
                        const outcome = classifyBootResponse(response.status);
                        if (outcome === 'ok') {
                            const data = await response.json();
                            writeLastGoodSite(query, data);
                            applyClub(data);
                            setError(null);
                            return;
                        }
                        if (outcome === 'fallback') break;
                    } catch (e) {
                        lastStatus = null;
                        console.warn('[site] intento de carga fallido:', (e as Error)?.message || e);
                    }
                }
                // Se agotaron los intentos (o el servidor dijo que no hay sitio).
                if (cached || !initial) {
                    // Se queda lo que ya se está mostrando: es mejor que nada.
                    return;
                }
                if (lastStatus !== null && classifyBootResponse(lastStatus) === 'fallback') {
                    setClub(getClubByHostname(window.location.hostname));
                    return;
                }
                setError('Network error or platform maintenance.');
                setBootFailed(true);
            } finally {
                if (slowTimer) clearTimeout(slowTimer);
                setSlowBoot(false);
                if (initial) setIsLoading(false);
            }
        })();
        loading.current = run;
        run.finally(() => { if (loading.current === run) loading.current = null; });
        return run;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {


        // FORCED REDIRECTION RULE (Nuclear Option)
        // If we are on the main domain root, redirect to app subdomain IMMEDIATELY.
        if (isMainPlatform && window.location.pathname === '/') {
            console.log('Forced Domain Redirect: clubplatform.org -> app.clubplatform.org');
            window.location.replace('https://app.clubplatform.org/');
            return;
        }

        void loadClub({ initial: true });
    }, []);

    if (isLoading) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-[#0B1120] text-white px-6 text-center">
                <div className="w-10 h-10 border-2 border-white/20 border-t-blue-500 rounded-full animate-spin mb-4" />
                <p className="text-sm text-gray-400 font-medium tracking-wide">Cargando plataforma...</p>
                {slowBoot && (
                    <p className="mt-3 text-xs text-gray-500 max-w-sm">
                        Está tardando más de lo normal. Seguimos intentando; no hace falta recargar.
                    </p>
                )}
            </div>
        );
    }

    if (bootFailed) {
        // Se agotaron los intentos y no hay copia guardada. Antes de v4.1180 esto
        // era un giro sin fin; ahora se dice y se ofrece la salida.
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-[#0B1120] text-white px-6 text-center">
                <p className="text-base font-semibold mb-2">No pudimos cargar el sitio</p>
                <p className="text-sm text-gray-400 max-w-md mb-6">
                    El servidor no respondió a tiempo. Suele resolverse en unos segundos.
                </p>
                <button
                    type="button"
                    onClick={() => { void loadClub({ initial: true }); }}
                    className="px-5 py-2.5 rounded-full bg-blue-600 hover:bg-blue-500 text-sm font-semibold"
                >
                    Reintentar
                </button>
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
            club: club as ClubConfig,
            isLoading, 
            isMainPlatform, 
            isAppPortal, 
            isDraft,
            isProduction,
            bannerVisible, 
            setBannerVisible, 
            developmentBannerVisible, 
            setDevelopmentBannerVisible,
            refreshClub: () => loadClub({ fresh: true }),
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
