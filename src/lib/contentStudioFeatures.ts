// ════════════════════════════════════════════════════════════════════════════
// Control Central de Capacidades del Estudio de Contenido (v4.1134.0)
//
// Tipos, constantes y hook para el sistema de capabilities/features multi-tenant
// del Estudio de Contenido.
// ════════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback } from 'react';

export type ContentStudioToolKey = 
    | 'video'
    | 'post'
    | 'outro'
    | 'pendones'
    | 'library'
    | 'accounts'
    | 'distribution'
    | 'queue';

export interface ContentStudioToolsConfig {
    video: boolean;
    post: boolean;
    outro: boolean;
    pendones: boolean;
    library: boolean;
    accounts: boolean;
    distribution: boolean;
    queue: boolean;
}

export const DEFAULT_STUDIO_TOOLS: ContentStudioToolsConfig = {
    video: true,
    post: true,
    outro: true,
    pendones: true,
    library: true,
    accounts: true,
    distribution: true,
    queue: true
};

export interface ContentStudioToolMeta {
    key: ContentStudioToolKey;
    tab: string;
    label: string;
    description: string;
    category: 'production' | 'branding' | 'assets' | 'management';
    iconName: string;
}

export const CONTENT_STUDIO_TOOLS_METADATA: ContentStudioToolMeta[] = [
    {
        key: 'video',
        tab: 'create',
        label: 'Creador de Video',
        description: 'Generación de videos y reels cinematográficos con IA',
        category: 'production',
        iconName: 'Video'
    },
    {
        key: 'post',
        tab: 'post',
        label: 'Generador de Publicaciones',
        description: 'Copys persuasivos e imágenes automáticas optimizadas para redes',
        category: 'production',
        iconName: 'Image'
    },
    {
        key: 'outro',
        tab: 'outros',
        label: 'Outro IA',
        description: 'Cierres animados y motion graphics con identidad de marca',
        category: 'branding',
        iconName: 'Clapperboard'
    },
    {
        key: 'pendones',
        tab: 'pendones',
        label: 'Pendones',
        description: 'Diseño y renderizado de pendones para eventos y programas',
        category: 'branding',
        iconName: 'Flag'
    },
    {
        key: 'library',
        tab: 'library',
        label: 'Biblioteca',
        description: 'Historial de publicaciones, videos, reels e informes respaldados',
        category: 'assets',
        iconName: 'Layers'
    },
    {
        key: 'accounts',
        tab: 'accounts',
        label: 'Cuentas Sociales',
        description: 'Vinculación y permisos de páginas de Facebook, Instagram y canales sociales',
        category: 'management',
        iconName: 'Share2'
    },
    {
        key: 'distribution',
        tab: 'distribution',
        label: 'Distribución',
        description: 'Distribución multicanal y listas de difusión a grupos',
        category: 'management',
        iconName: 'Megaphone'
    },
    {
        key: 'queue',
        tab: 'queue',
        label: 'Cola de Envío',
        description: 'Monitoreo de publicaciones programadas y pendientes',
        category: 'management',
        iconName: 'Clock'
    }
];

export const TAB_TO_TOOL_MAP: Record<string, ContentStudioToolKey> = {
    create: 'video',
    post: 'post',
    outros: 'outro',
    pendones: 'pendones',
    library: 'library',
    accounts: 'accounts',
    distribution: 'distribution',
    queue: 'queue'
};

export const TOOL_TO_TAB_MAP: Record<ContentStudioToolKey, string> = {
    video: 'create',
    post: 'post',
    outro: 'outros',
    pendones: 'pendones',
    library: 'library',
    accounts: 'accounts',
    distribution: 'distribution',
    queue: 'queue'
};

export function useContentStudioFeatures(clubId?: string) {
    const [features, setFeatures] = useState<ContentStudioToolsConfig>(DEFAULT_STUDIO_TOOLS);
    const [loading, setLoading] = useState(true);
    const [isGlobalAdmin, setIsGlobalAdmin] = useState(false);

    const fetchFeatures = useCallback(async () => {
        try {
            setLoading(true);
            const token = localStorage.getItem('token');
            const url = clubId ? `/api/content-studio/features?clubId=${encodeURIComponent(clubId)}` : '/api/content-studio/features';
            const res = await fetch(url, {
                headers: {
                    ...(token ? { Authorization: `Bearer ${token}` } : {})
                }
            });
            if (res.ok) {
                const data = await res.json();
                if (data.features) {
                    setFeatures({
                        video: data.features.video !== false,
                        post: data.features.post !== false,
                        outro: data.features.outro !== false,
                        pendones: data.features.pendones !== false,
                        library: data.features.library !== false,
                        accounts: data.features.accounts !== false,
                        distribution: data.features.distribution !== false,
                        queue: data.features.queue !== false
                    });
                }
                setIsGlobalAdmin(!!data.isGlobalAdmin);
            }
        } catch (err) {
            console.error('[useContentStudioFeatures] Error:', err);
        } finally {
            setLoading(false);
        }
    }, [clubId]);

    useEffect(() => {
        fetchFeatures();
    }, [fetchFeatures]);

    const isTabEnabled = useCallback((tabValue: string): boolean => {
        if (isGlobalAdmin) return true;
        const toolKey = TAB_TO_TOOL_MAP[tabValue];
        if (!toolKey) return true; // tabs no gobernadas por esta matriz (ej. aniversarios, plantillas)
        return features[toolKey] !== false;
    }, [features, isGlobalAdmin]);

    const isToolEnabled = useCallback((toolKey: ContentStudioToolKey): boolean => {
        if (isGlobalAdmin) return true;
        return features[toolKey] !== false;
    }, [features, isGlobalAdmin]);

    return {
        features,
        loading,
        isGlobalAdmin,
        isTabEnabled,
        isToolEnabled,
        refetch: fetchFeatures
    };
}
