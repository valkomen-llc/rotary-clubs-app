import { useState, useEffect, useCallback } from 'react';
import { useClub } from '../contexts/ClubContext';
import {
    DEFAULT_SITE_MODULES_CONFIG,
    resolveClubModulesConfig,
    ORIGEN_CLUB_ID,
    type SiteModulesMap
} from '../lib/siteModulesSpec';

const API = import.meta.env.VITE_API_URL || '/api';

const getInitialClubIdentifier = (club: any): string | null => {
    if (club?.id) return club.id;
    if (club?.subdomain) return club.subdomain;
    try {
        const lsClub = JSON.parse(localStorage.getItem('rotary_club') || '{}');
        if (lsClub?.id) return lsClub.id;
        if (lsClub?.subdomain) return lsClub.subdomain;
    } catch {}
    try {
        const lsUser = JSON.parse(localStorage.getItem('rotary_user') || '{}');
        if (lsUser?.clubId) return lsUser.clubId;
        if (lsUser?.club?.id) return lsUser.club?.id;
        if (lsUser?.club?.subdomain) return lsUser.club?.subdomain;
    } catch {}
    if (typeof window !== 'undefined') {
        const host = window.location.hostname.toLowerCase();
        if (host.includes('rotaryecluborigen') || host.includes('rotary-e-club-origen')) {
            return ORIGEN_CLUB_ID;
        }
    }
    return null;
};

/**
 * Hook para consultar y sincronizar los módulos habilitados del sitio actual.
 * Respeta la herencia global y las excepciones particulares de cada club.
 */
export function useSiteModulesConfig() {
    const { club } = useClub();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const initialIdent = getInitialClubIdentifier(club);
    const clubId = (club as any)?.id || initialIdent;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const clubSubdomain = (club as any)?.subdomain;
    const cacheKey = `cp_site_modules_${clubId || clubSubdomain || 'global'}`;

    const [modules, setModules] = useState<SiteModulesMap>(() => {
        try {
            const cached = localStorage.getItem(cacheKey);
            if (cached) {
                return JSON.parse(cached);
            }
        } catch {
            // ignore
        }
        return resolveClubModulesConfig(null, null, clubId || clubSubdomain);
    });

    // Sincronización instantánea cuando clubId o subdomain cambian
    useEffect(() => {
        const currentCacheKey = `cp_site_modules_${clubId || clubSubdomain || 'global'}`;
        try {
            const cached = localStorage.getItem(currentCacheKey);
            if (cached) {
                setModules(JSON.parse(cached));
                return;
            }
        } catch {}
        setModules(resolveClubModulesConfig(null, null, clubId || clubSubdomain));
    }, [clubId, clubSubdomain]);

    const [loading, setLoading] = useState<boolean>(false);

    const loadConfig = useCallback(async () => {
        try {
            setLoading(true);
            const token = localStorage.getItem('rotary_token');
            const url = clubId
                ? `${API}/site-modules/config?clubId=${encodeURIComponent(clubId)}`
                : clubSubdomain
                ? `${API}/site-modules/config?subdomain=${encodeURIComponent(clubSubdomain)}`
                : `${API}/site-modules/config`;

            const res = await fetch(url, {
                headers: token ? { Authorization: `Bearer ${token}` } : {}
            });
            if (res.ok) {
                const data = await res.json();
                if (data?.modules) {
                    setModules(data.modules);
                    try {
                        localStorage.setItem(cacheKey, JSON.stringify(data.modules));
                    } catch {
                        // ignore storage error
                    }
                }
            }
        } catch (err) {
            console.warn('[useSiteModulesConfig] Error cargando módulos:', err);
        } finally {
            setLoading(false);
        }
    }, [clubId, clubSubdomain, cacheKey]);

    useEffect(() => {
        loadConfig();
    }, [loadConfig]);

    useEffect(() => {
        const handleModulesUpdated = () => {
            loadConfig();
        };
        window.addEventListener('cp-site-modules-updated', handleModulesUpdated);
        return () => window.removeEventListener('cp-site-modules-updated', handleModulesUpdated);
    }, [loadConfig]);

    const isModuleEnabled = useCallback((moduleKey: string): boolean => {
        return modules[moduleKey] !== false;
    }, [modules]);

    return {
        modules,
        isModuleEnabled,
        loading,
        reload: loadConfig
    };
}
