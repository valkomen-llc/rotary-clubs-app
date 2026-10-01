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
    | 'image_library'
    | 'ai_reels'
    | 'video_library'
    | 'rotary_in_action'
    | 'accounts'
    | 'distribution'
    | 'queue'
    | 'editor';

export interface ContentStudioToolsConfig {
    video: boolean;
    post: boolean;
    outro: boolean;
    pendones: boolean;
    library: boolean;
    image_library: boolean;
    ai_reels: boolean;
    video_library: boolean;
    rotary_in_action: boolean;
    accounts: boolean;
    distribution: boolean;
    queue: boolean;
    editor: boolean;
}

export const DEFAULT_STUDIO_TOOLS: ContentStudioToolsConfig = {
    video: true,
    post: true,
    outro: true,
    pendones: true,
    library: true,
    image_library: true,
    ai_reels: true,
    video_library: true,
    rotary_in_action: true,
    accounts: true,
    distribution: true,
    queue: true,
    editor: false
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
        key: 'image_library',
        tab: 'library_images',
        label: 'Biblioteca de Imágenes',
        description: 'Publicaciones e imágenes fotográficas generadas por IA del sitio',
        category: 'assets',
        iconName: 'Image'
    },
    {
        key: 'ai_reels',
        tab: 'library_reels',
        label: 'Reels IA',
        description: 'Videos verticales cinemáticos generados desde fotografías con IA',
        category: 'assets',
        iconName: 'Sparkles'
    },
    {
        key: 'video_library',
        tab: 'library_videos',
        label: 'Videoteca y Video Informes',
        description: 'Video informes, clips renderizados y proyectos de video',
        category: 'assets',
        iconName: 'Film'
    },
    {
        key: 'rotary_in_action',
        tab: 'rotary_in_action',
        label: 'Rotary en Acción',
        description: 'Captación de historias de clubes, banco de testimonios y trazabilidad institucional',
        category: 'production',
        iconName: 'HeartHandshake'
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
    },
    {
        key: 'editor',
        tab: 'editor',
        label: 'Editor de Video',
        description: 'Editor multipista profesional con biblioteca multimedia, subtítulos IA y render HD',
        category: 'production',
        iconName: 'Film'
    }
];

export const TAB_TO_TOOL_MAP: Record<string, ContentStudioToolKey> = {
    create: 'video',
    post: 'post',
    outros: 'outro',
    pendones: 'pendones',
    library: 'library',
    rotary_in_action: 'rotary_in_action',
    accounts: 'accounts',
    distribution: 'distribution',
    queue: 'queue',
    editor: 'editor'
};

export const TOOL_TO_TAB_MAP: Record<ContentStudioToolKey, string> = {
    video: 'create',
    post: 'post',
    outro: 'outros',
    pendones: 'pendones',
    library: 'library',
    image_library: 'library',
    ai_reels: 'library',
    video_library: 'library',
    rotary_in_action: 'rotary_in_action',
    accounts: 'accounts',
    distribution: 'distribution',
    queue: 'queue',
    editor: 'editor'
};

/**
 * Obtiene el token de autenticación del usuario administrador (prioriza 'rotary_token').
 */
export function getStudioAuthToken(): string {
    if (typeof window === 'undefined') return '';
    try {
        return localStorage.getItem('rotary_token') || localStorage.getItem('token') || '';
    } catch {
        return '';
    }
}

export function useContentStudioFeatures(clubId?: string) {
    const [features, setFeatures] = useState<ContentStudioToolsConfig>(DEFAULT_STUDIO_TOOLS);
    const [loading, setLoading] = useState(true);
    const [isGlobalAdmin, setIsGlobalAdmin] = useState(false);

    const fetchFeatures = useCallback(async () => {
        try {
            setLoading(true);
            const token = getStudioAuthToken();
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
                        image_library: data.features.image_library !== false,
                        ai_reels: data.features.ai_reels !== false,
                        video_library: data.features.video_library !== false,
                        rotary_in_action: data.features.rotary_in_action !== false,
                        accounts: data.features.accounts !== false,
                        distribution: data.features.distribution !== false,
                        queue: data.features.queue !== false,
                        editor: Boolean(data.features.editor)
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
