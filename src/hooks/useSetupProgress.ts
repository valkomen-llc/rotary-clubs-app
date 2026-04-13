import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from './useAuth';

const API = import.meta.env.VITE_API_URL || '/api';

export interface SetupItem {
    id: string;
    label: string;
    desc: string;
    done: boolean;
    href: string;
    category: 'identity' | 'content' | 'integrations';
    weight: number;
}

export interface SetupProgress {
    pct: number;
    isComplete: boolean;
    items: SetupItem[];
    remaining: number;
    loading: boolean;
    refresh: () => void;
}

// Pages accessible during setup mode (before 100% completion)
export const SETUP_ALLOWED_PATHS = [
    '/admin/dashboard',
    '/admin/mi-club',
    '/admin/imagenes-sitio',
    '/admin/noticias',
    '/admin/proyectos',
    '/admin/calendario',
    '/admin/miembros',
    '/admin/usuarios',
    '/admin/media',
    '/admin/faqs',
    '/admin/integraciones',
    '/admin/descargas',
    '/admin/configuracion-sitio',
    '/admin/rotaract',
    '/admin/interact',
    '/admin/intercambios-jovenes',
    '/admin/ngse',
    '/admin/rotex',
    '/admin/tienda',
    '/admin/ordenes',
    '/admin/boveda',
    '/admin/estados-financieros',
];

export function useSetupProgress(): SetupProgress {
    const { token, user } = useAuth();
    const [stats, setStats] = useState<any>(null);
    const [gaConfigured, setGaConfigured] = useState(false);
    const [loading, setLoading] = useState(true);
    const [refreshKey, setRefreshKey] = useState(0);

    const club = useMemo(() => {
        try { return JSON.parse(localStorage.getItem('rotary_club') || '{}'); }
        catch { return {}; }
    }, [refreshKey]);

    const fetchData = useCallback(() => {
        if (!token) { setLoading(false); return; }
        setLoading(true);

        const headers = { Authorization: `Bearer ${token}` };

        Promise.all([
            fetch(`${API}/admin/stats`, { headers }).then(r => r.ok ? r.json() : null).catch(() => null),
            fetch(`${API}/translate/analytics`).then(r => r.json()).catch(() => null),
        ]).then(([statsData, gaData]) => {
            if (statsData) setStats(statsData);
            setGaConfigured(!!(gaData?.gaId && gaData.gaId.startsWith('G-')));
            setLoading(false);
        });
    }, [token, refreshKey]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const refresh = useCallback(() => setRefreshKey(k => k + 1), []);

    const items: SetupItem[] = useMemo(() => [
        {
            id: 'club-info', label: 'Información del club',
            desc: 'Logo, descripción, contacto, colores y redes sociales',
            done: !!(club?.logo && club?.description && club.description.length > 20),
            href: '/admin/mi-club', category: 'identity', weight: 15,
        },
        {
            id: 'hero', label: 'Imágenes principales',
            desc: 'Configura las imágenes del hero y secciones del sitio',
            done: false, // Checked via settings/hero
            href: '/admin/imagenes-sitio', category: 'identity', weight: 10,
        },
        {
            id: 'project', label: 'Primer proyecto',
            desc: 'Documenta al menos un proyecto activo del club',
            done: (stats?.projects || 0) > 0,
            href: '/admin/proyectos', category: 'content', weight: 15,
        },
        {
            id: 'news', label: 'Primera noticia',
            desc: 'Publica una noticia o artículo sobre el club',
            done: (stats?.posts || 0) > 0,
            href: '/admin/noticias', category: 'content', weight: 15,
        },
        {
            id: 'members', label: 'Directorio de socios',
            desc: 'Agrega al menos un socio al directorio',
            done: (stats?.users || 0) > 1,
            href: '/admin/usuarios', category: 'content', weight: 15,
        },
        {
            id: 'media', label: 'Galería multimedia',
            desc: 'Sube fotos o videos del club',
            done: (stats?.media || 0) > 0,
            href: '/admin/media', category: 'content', weight: 10,
        },
        {
            id: 'faqs', label: 'Preguntas frecuentes',
            desc: 'Agrega al menos una pregunta frecuente',
            done: false, // Will need API check
            href: '/admin/faqs', category: 'content', weight: 10,
        },
        {
            id: 'ga4', label: 'Google Analytics',
            desc: 'Conecta GA4 para medir el tráfico de tu sitio',
            done: gaConfigured,
            href: '/admin/integraciones', category: 'integrations', weight: 10,
        },
    ], [club, stats, gaConfigured]);

    const totalWeight = items.reduce((a, b) => a + b.weight, 0);
    const doneWeight = items.filter(i => i.done).reduce((a, b) => a + b.weight, 0);
    const pct = Math.round((doneWeight / totalWeight) * 100);

    // Super admins bypass setup requirements
    const isSuperAdmin = user?.role === 'administrator';

    return {
        pct: isSuperAdmin ? 100 : pct,
        isComplete: isSuperAdmin ? true : pct >= 100,
        items,
        remaining: items.filter(i => !i.done).length,
        loading,
        refresh,
    };
}
