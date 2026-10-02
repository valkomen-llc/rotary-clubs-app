// ════════════════════════════════════════════════════════════════════════════
// Motor de Estilos, Tipografías y Plantillas de Texto / Subtítulos — v4.1150.0
// Club Platform Video Editor
// ════════════════════════════════════════════════════════════════════════════

import type { CSSProperties } from 'react';
import type { SubtitleStyle } from './types';

export interface FontOption {
    name: string;
    family: string;
    category: 'sans-serif' | 'serif' | 'display' | 'monospace';
    weights: string[];
    sample: string;
}

export const AVAILABLE_FONTS: FontOption[] = [
    {
        name: 'Inter',
        family: 'Inter, sans-serif',
        category: 'sans-serif',
        weights: ['300', '400', '500', '600', '700', '800', '900'],
        sample: 'Subtítulos claros y modernos'
    },
    {
        name: 'Montserrat',
        family: 'Montserrat, sans-serif',
        category: 'sans-serif',
        weights: ['400', '500', '600', '700', '800', '900'],
        sample: 'Impacto viral para Reels y TikTok'
    },
    {
        name: 'Roboto',
        family: 'Roboto, sans-serif',
        category: 'sans-serif',
        weights: ['300', '400', '500', '700', '900'],
        sample: 'Estándar universal de legibilidad'
    },
    {
        name: 'Poppins',
        family: 'Poppins, sans-serif',
        category: 'sans-serif',
        weights: ['400', '500', '600', '700', '800'],
        sample: 'Geométrica, limpia y amigable'
    },
    {
        name: 'Outfit',
        family: 'Outfit, sans-serif',
        category: 'sans-serif',
        weights: ['400', '500', '600', '700', '800'],
        sample: 'Elegancia contemporánea'
    },
    {
        name: 'Bebas Neue',
        family: '"Bebas Neue", sans-serif',
        category: 'display',
        weights: ['400'],
        sample: 'TÍTULOS CONDENSADOS EN MAYÚSCULAS'
    },
    {
        name: 'Oswald',
        family: 'Oswald, sans-serif',
        category: 'display',
        weights: ['400', '500', '600', '700'],
        sample: 'Fuerza periodística y deportiva'
    },
    {
        name: 'Playfair Display',
        family: '"Playfair Display", serif',
        category: 'serif',
        weights: ['400', '600', '700', '900'],
        sample: 'Estilo editorial y refinado'
    },
    {
        name: 'Space Grotesk',
        family: '"Space Grotesk", sans-serif',
        category: 'display',
        weights: ['400', '500', '600', '700'],
        sample: 'Vanguardista y tecnológica'
    },
    {
        name: 'Cinzel',
        family: 'Cinzel, serif',
        category: 'serif',
        weights: ['400', '600', '700'],
        sample: 'Elegancia clásica cinematográfica'
    }
];

const loadedFonts = new Set<string>();

/**
 * Carga dinámicamente tipografías desde Google Fonts sin bloquear la interfaz.
 */
export function loadGoogleFont(fontName: string): void {
    if (typeof window === 'undefined' || !fontName) return;
    const cleanName = fontName.replace(/["']/g, '').split(',')[0].trim();
    if (loadedFonts.has(cleanName) || ['sans-serif', 'serif', 'monospace', 'Arial', 'Helvetica', 'Times New Roman'].includes(cleanName)) {
        return;
    }

    try {
        const linkId = `gfont-${cleanName.toLowerCase().replace(/\s+/g, '-')}`;
        if (document.getElementById(linkId)) {
            loadedFonts.add(cleanName);
            return;
        }

        const link = document.createElement('link');
        link.id = linkId;
        link.rel = 'stylesheet';
        link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(cleanName)}:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;0,900;1,400;1,700&display=swap`;
        document.head.appendChild(link);
        loadedFonts.add(cleanName);
    } catch {
        // Fallback silencioso si no hay conexión externa
    }
}

/**
 * Estilo base por defecto para subtítulos con legibilidad premium.
 */
export const DEFAULT_SUBTITLE_STYLE: SubtitleStyle = {
    fontFamily: 'Inter, sans-serif',
    fontSize: 24,
    color: '#FFFFFF',
    backgroundColor: '#000000',
    backgroundOpacity: 75,
    backgroundPadding: 8,
    borderRadius: 8,
    backgroundEnabled: true,
    position: 'bottom',
    align: 'center',
    fontWeight: 'bold',
    fontStyle: 'normal',
    textDecoration: 'none',
    textTransform: 'none',
    opacity: 100,
    letterSpacing: 0,
    lineHeight: 1.25,
    strokeColor: '#000000',
    strokeWidth: 0,
    shadowColor: '#000000',
    shadowBlur: 4,
    shadowOffsetX: 0,
    shadowOffsetY: 2,
    shadowOpacity: 50,
    x: 0,
    y: 0,
    scale: 1,
    rotation: 0
};

/**
 * Resuelve el estilo efectivo combinando valores por defecto, estilos globales y anulaciones por elemento.
 */
export function resolveEffectiveStyle(
    elementStyle?: Partial<SubtitleStyle> | null,
    globalStyle?: Partial<SubtitleStyle> | null
): SubtitleStyle {
    return {
        ...DEFAULT_SUBTITLE_STYLE,
        ...(globalStyle || {}),
        ...(elementStyle || {})
    };
}

/**
 * Convierte color hex o rgba + opacidad porcentual en cadena CSS rgba(r,g,b,a).
 */
export function hexToRgba(hexOrRgba?: string, opacityPercent: number = 100): string {
    if (!hexOrRgba) return 'transparent';
    const alpha = Math.max(0, Math.min(1, opacityPercent / 100));

    if (hexOrRgba.startsWith('rgba')) {
        return hexOrRgba.replace(/rgba?\(([^)]+)\)/, (_, values) => {
            const parts = values.split(',').map((v: string) => v.trim());
            return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${alpha})`;
        });
    }

    if (hexOrRgba.startsWith('rgb')) {
        return hexOrRgba.replace(/rgb\(([^)]+)\)/, (_, values) => {
            return `rgba(${values}, ${alpha})`;
        });
    }

    if (hexOrRgba.startsWith('#')) {
        let hex = hexOrRgba.replace('#', '');
        if (hex.length === 3) {
            hex = hex.split('').map(c => c + c).join('');
        }
        const num = parseInt(hex, 16);
        const r = (num >> 16) & 255;
        const g = (num >> 8) & 255;
        const b = num & 255;
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    return hexOrRgba;
}

/**
 * Genera el mapa de CSSProperties a partir del modelo SubtitleStyle.
 */
export function computeCssProperties(style: SubtitleStyle): CSSProperties {
    const bgEnabled = style.backgroundEnabled ?? (style.backgroundColor && style.backgroundColor !== 'transparent');
    const bgColor = bgEnabled
        ? hexToRgba(style.backgroundColor || '#000000', style.backgroundOpacity ?? 75)
        : 'transparent';

    let textShadow = 'none';
    if ((style.shadowOpacity ?? 0) > 0 && ((style.shadowBlur ?? 0) > 0 || (style.shadowOffsetX ?? 0) !== 0 || (style.shadowOffsetY ?? 0) !== 0)) {
        const shadowColor = hexToRgba(style.shadowColor || '#000000', style.shadowOpacity ?? 50);
        textShadow = `${style.shadowOffsetX || 0}px ${style.shadowOffsetY || 2}px ${style.shadowBlur || 4}px ${shadowColor}`;
    }

    const stroke = (style.strokeWidth ?? 0) > 0 && style.strokeColor
        ? `${style.strokeWidth}px ${style.strokeColor}`
        : 'none';

    return {
        fontFamily: style.fontFamily,
        fontSize: `${style.fontSize}px`,
        fontWeight: (style.fontWeight as any) || 'bold',
        fontStyle: style.fontStyle || 'normal',
        textDecoration: style.textDecoration || 'none',
        textTransform: style.textTransform || 'none',
        color: style.color || '#FFFFFF',
        opacity: (style.opacity ?? 100) / 100,
        letterSpacing: style.letterSpacing ? `${style.letterSpacing}px` : undefined,
        lineHeight: style.lineHeight || 1.25,
        textAlign: style.align || 'center',
        backgroundColor: bgColor,
        padding: bgEnabled ? `${style.backgroundPadding ?? 8}px ${Math.round((style.backgroundPadding ?? 8) * 1.5)}px` : '0',
        borderRadius: `${style.borderRadius ?? 8}px`,
        textShadow,
        WebkitTextStroke: stroke,
        display: 'inline-block',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        boxSizing: 'border-box'
    };
}

// ════════════════════════════════════════════════════════════════════════════
// Catálogo Extenso de Plantillas Visuales de Texto y Subtítulos
// ════════════════════════════════════════════════════════════════════════════

export interface TextTemplate {
    id: string;
    name: string;
    category: 'basic' | 'subtitles' | 'titles' | 'lowerThird' | 'modern' | 'social';
    description: string;
    sampleText: string;
    isSubtitleFriendly?: boolean;
    style: Partial<SubtitleStyle>;
}

export const TEXT_TEMPLATES: TextTemplate[] = [
    // ── BÁSICO ────────────────────────────────────────────────────────────────
    {
        id: 'tpl-basic-clean',
        name: 'Texto Simple',
        category: 'basic',
        description: 'Blanco puro sin fondo, máxima claridad',
        sampleText: 'Texto Claro y Minimalista',
        isSubtitleFriendly: true,
        style: {
            fontFamily: 'Inter, sans-serif',
            fontSize: 26,
            color: '#FFFFFF',
            backgroundColor: '#000000',
            backgroundEnabled: false,
            fontWeight: '600',
            align: 'center',
            shadowOpacity: 60,
            shadowBlur: 6,
            shadowOffsetX: 0,
            shadowOffsetY: 2,
            strokeWidth: 0
        }
    },
    {
        id: 'tpl-basic-box',
        name: 'Caja Oscura Clásica',
        category: 'basic',
        description: 'Píldora negra semitransparente legible',
        sampleText: 'Caja con Fondo Oscuro',
        isSubtitleFriendly: true,
        style: {
            fontFamily: 'Inter, sans-serif',
            fontSize: 24,
            color: '#FFFFFF',
            backgroundColor: '#000000',
            backgroundOpacity: 80,
            backgroundPadding: 8,
            borderRadius: 8,
            backgroundEnabled: true,
            fontWeight: 'bold',
            align: 'center'
        }
    },
    {
        id: 'tpl-basic-outline',
        name: 'Contorno Alto Contraste',
        category: 'basic',
        description: 'Texto blanco con trazo negro pronunciado',
        sampleText: 'CONTRASTE TOTAL',
        isSubtitleFriendly: true,
        style: {
            fontFamily: 'Montserrat, sans-serif',
            fontSize: 28,
            color: '#FFFFFF',
            backgroundEnabled: false,
            fontWeight: '800',
            textTransform: 'uppercase',
            strokeColor: '#000000',
            strokeWidth: 2,
            shadowOpacity: 70,
            shadowBlur: 4,
            shadowOffsetX: 0,
            shadowOffsetY: 2
        }
    },

    // ── SUBTÍTULOS ────────────────────────────────────────────────────────────
    {
        id: 'tpl-sub-viral',
        name: 'Subtítulo Viral / Reels',
        category: 'subtitles',
        description: 'Montserrat en mayúsculas con fondo negro dinámico',
        sampleText: '¡SUBTÍTULO VIRAL REELS!',
        isSubtitleFriendly: true,
        style: {
            fontFamily: 'Montserrat, sans-serif',
            fontSize: 26,
            color: '#FACC15', // Amarillo brillante
            backgroundColor: '#000000',
            backgroundOpacity: 90,
            backgroundPadding: 10,
            borderRadius: 10,
            backgroundEnabled: true,
            fontWeight: '800',
            textTransform: 'uppercase',
            letterSpacing: 0.5,
            strokeWidth: 0
        }
    },
    {
        id: 'tpl-sub-netflix',
        name: 'Subtítulo Cine / Netflix',
        category: 'subtitles',
        description: 'Amarillo suave con sombra difusa para películas',
        sampleText: 'Diálogo con estilo cinematográfico.',
        isSubtitleFriendly: true,
        style: {
            fontFamily: 'Roboto, sans-serif',
            fontSize: 24,
            color: '#FFEA00',
            backgroundColor: 'transparent',
            backgroundEnabled: false,
            fontWeight: '500',
            shadowColor: '#000000',
            shadowBlur: 6,
            shadowOffsetX: 1,
            shadowOffsetY: 2,
            shadowOpacity: 90
        }
    },
    {
        id: 'tpl-sub-rotary',
        name: 'Píldora Azul Rotary',
        category: 'subtitles',
        description: 'Identidad institucional con Azul Rotary y texto nítido',
        sampleText: 'Rotary Club Platform Internacional',
        isSubtitleFriendly: true,
        style: {
            fontFamily: 'Outfit, sans-serif',
            fontSize: 22,
            color: '#FFFFFF',
            backgroundColor: '#013388', // Azul Rotary Oficial
            backgroundOpacity: 90,
            backgroundPadding: 8,
            borderRadius: 12,
            backgroundEnabled: true,
            fontWeight: '600',
            align: 'center'
        }
    },
    {
        id: 'tpl-sub-minimal-white',
        name: 'Minimalista Blanco',
        category: 'subtitles',
        description: 'Subtítulo sutil para documentales y testimonios',
        sampleText: 'Voz clara del testimonio de la comunidad.',
        isSubtitleFriendly: true,
        style: {
            fontFamily: 'Inter, sans-serif',
            fontSize: 21,
            color: '#F8FAFC',
            backgroundColor: '#0F172A',
            backgroundOpacity: 65,
            backgroundPadding: 6,
            borderRadius: 6,
            backgroundEnabled: true,
            fontWeight: '500',
            letterSpacing: 0.2
        }
    },

    // ── TÍTULOS ───────────────────────────────────────────────────────────────
    {
        id: 'tpl-title-hero',
        name: 'Hero Impacto Oswald',
        category: 'titles',
        description: 'Titular robusto de gran formato para aperturas',
        sampleText: 'TRANSFORMANDO COMUNIDADES',
        isSubtitleFriendly: false,
        style: {
            fontFamily: 'Oswald, sans-serif',
            fontSize: 44,
            color: '#FFFFFF',
            backgroundColor: '#000000',
            backgroundOpacity: 85,
            backgroundPadding: 12,
            borderRadius: 12,
            backgroundEnabled: true,
            fontWeight: '700',
            textTransform: 'uppercase',
            letterSpacing: 1.5,
            align: 'center'
        }
    },
    {
        id: 'tpl-title-bebas',
        name: 'Titular Urbano Bebas',
        category: 'titles',
        description: 'Condensado enérgico con sombra profunda',
        sampleText: 'PROYECTO DE SERVICIO 2026',
        isSubtitleFriendly: false,
        style: {
            fontFamily: '"Bebas Neue", sans-serif',
            fontSize: 48,
            color: '#F8FAFC',
            backgroundEnabled: false,
            fontWeight: '400',
            textTransform: 'uppercase',
            letterSpacing: 2,
            strokeColor: '#000000',
            strokeWidth: 1.5,
            shadowColor: '#000000',
            shadowBlur: 10,
            shadowOffsetX: 2,
            shadowOffsetY: 4,
            shadowOpacity: 80
        }
    },
    {
        id: 'tpl-title-elegant',
        name: 'Elegancia Editorial',
        category: 'titles',
        description: 'Serif distinguida para galas y aniversarios',
        sampleText: 'Gala Anual de Reconocimiento',
        isSubtitleFriendly: false,
        style: {
            fontFamily: '"Playfair Display", serif',
            fontSize: 34,
            color: '#FDE68A', // Oro suave
            backgroundEnabled: false,
            fontWeight: '700',
            fontStyle: 'italic',
            letterSpacing: 0.5,
            shadowColor: '#000000',
            shadowBlur: 8,
            shadowOffsetX: 0,
            shadowOffsetY: 3,
            shadowOpacity: 70
        }
    },

    // ── TERCIO INFERIOR (LOWER THIRDS) ─────────────────────────────────────────
    {
        id: 'tpl-lt-rotary',
        name: 'Rótulo Ejecutivo Rotary',
        category: 'lowerThird',
        description: 'Franja corporativa para nombres y cargos directivos',
        sampleText: 'Ing. Carlos Mendoza · Gobernador de Distrito',
        isSubtitleFriendly: false,
        style: {
            fontFamily: 'Outfit, sans-serif',
            fontSize: 20,
            color: '#FFFFFF',
            backgroundColor: '#013388',
            backgroundOpacity: 95,
            backgroundPadding: 8,
            borderRadius: 6,
            backgroundEnabled: true,
            fontWeight: '700',
            align: 'left',
            position: 'custom',
            x: -20,
            y: 35
        }
    },
    {
        id: 'tpl-lt-news',
        name: 'Franja de Noticiero',
        category: 'lowerThird',
        description: 'Barra lateral acentuada con contraste institucional',
        sampleText: 'CONFERENCIA DISTRITAL 2026',
        isSubtitleFriendly: false,
        style: {
            fontFamily: 'Montserrat, sans-serif',
            fontSize: 20,
            color: '#1E293B',
            backgroundColor: '#FFFFFF',
            backgroundOpacity: 95,
            backgroundPadding: 8,
            borderRadius: 4,
            backgroundEnabled: true,
            fontWeight: '800',
            textTransform: 'uppercase',
            align: 'left',
            position: 'custom',
            x: -18,
            y: 36
        }
    },
    {
        id: 'tpl-lt-amber',
        name: 'Rótulo Dorado Solidario',
        category: 'lowerThird',
        description: 'Tercio inferior dorado para oradores y líderes',
        sampleText: 'Dra. María Ospina — Líder de Proyecto',
        isSubtitleFriendly: false,
        style: {
            fontFamily: 'Inter, sans-serif',
            fontSize: 20,
            color: '#FFFFFF',
            backgroundColor: '#D97706', // Ámbar / Dorado
            backgroundOpacity: 90,
            backgroundPadding: 8,
            borderRadius: 8,
            backgroundEnabled: true,
            fontWeight: 'bold',
            align: 'left',
            position: 'custom',
            x: -20,
            y: 34
        }
    },

    // ── MODERNO & REDES SOCIALES ──────────────────────────────────────────────
    {
        id: 'tpl-mod-neon',
        name: 'Brillo Neón Cyber',
        category: 'modern',
        description: 'Resplandor cian moderno con alta visibilidad',
        sampleText: 'TECNOLOGÍA E INNOVACIÓN',
        isSubtitleFriendly: true,
        style: {
            fontFamily: 'Montserrat, sans-serif',
            fontSize: 26,
            color: '#38BDF8', // Cyan brillante
            backgroundColor: '#0F172A',
            backgroundOpacity: 85,
            backgroundPadding: 8,
            borderRadius: 12,
            backgroundEnabled: true,
            fontWeight: '800',
            textTransform: 'uppercase',
            shadowColor: '#38BDF8',
            shadowBlur: 14,
            shadowOffsetX: 0,
            shadowOffsetY: 0,
            shadowOpacity: 90
        }
    },
    {
        id: 'tpl-soc-badge',
        name: 'Badge / Etiqueta Llamativa',
        category: 'social',
        description: 'Caja compacta para llamados a la acción',
        sampleText: '🔥 ¡NUEVO EVENTO CONFIRMADO!',
        isSubtitleFriendly: false,
        style: {
            fontFamily: 'Poppins, sans-serif',
            fontSize: 22,
            color: '#FFFFFF',
            backgroundColor: '#E11D48', // Carmesí vibrante
            backgroundOpacity: 95,
            backgroundPadding: 8,
            borderRadius: 20, // Píldora redondeada
            backgroundEnabled: true,
            fontWeight: '700',
            align: 'center'
        }
    },
    {
        id: 'tpl-soc-gradient',
        name: 'Acento Esmeralda Acción',
        category: 'social',
        description: 'Fondo verde esmeralda para donaciones e impacto',
        sampleText: 'APOYO AL BANCO DE ALIMENTOS',
        isSubtitleFriendly: true,
        style: {
            fontFamily: 'Montserrat, sans-serif',
            fontSize: 24,
            color: '#FFFFFF',
            backgroundColor: '#059669', // Esmeralda Rotary
            backgroundOpacity: 90,
            backgroundPadding: 8,
            borderRadius: 10,
            backgroundEnabled: true,
            fontWeight: '800',
            textTransform: 'uppercase',
            letterSpacing: 0.5
        }
    }
];

export const TEMPLATE_CATEGORIES = [
    { id: 'all', name: 'Todos' },
    { id: 'basic', name: 'Básico' },
    { id: 'subtitles', name: 'Subtítulos' },
    { id: 'titles', name: 'Títulos' },
    { id: 'lowerThird', name: 'Tercio Inferior' },
    { id: 'modern', name: 'Moderno' },
    { id: 'social', name: 'Redes Sociales' }
] as const;

/**
 * Aplica un estilo visual a toda la colección de subtítulos preservando
 * textos, marcas de tiempo y traducciones individuales.
 *
 * Contenido y estilo son independientes: solo se fusiona `style`
 * (fuente, tamaño, color, fondo, posición, sombra, etc.). El texto de cada
 * idioma permanece intacto. El estilo también se propaga a las versiones del
 * catálogo `translations` para que conmutar de idioma jamás revierta lo visual.
 */
export function applyStyleToAllSubtitles(
    subtitles: {
        style?: SubtitleStyle;
        segments?: Array<any>;
        translations?: Record<string, any>;
        [key: string]: any;
    },
    newStyle: Partial<SubtitleStyle>
) {
    const updatedGlobalStyle: SubtitleStyle = {
        ...(subtitles.style || DEFAULT_SUBTITLE_STYLE),
        ...newStyle
    };

    const updatedSegments = (subtitles.segments || []).map(seg => ({
        ...seg,
        style: {
            ...(seg.style || {}),
            ...newStyle
        }
    }));

    // Sincronizar el mismo estilo en cada versión de idioma del catálogo
    // (solo style; text/start/end de cada idioma no se tocan).
    const updatedTranslations: Record<string, any> = {};
    if (subtitles.translations && typeof subtitles.translations === 'object') {
        for (const [langKey, langObj] of Object.entries(subtitles.translations)) {
            if (langObj && Array.isArray((langObj as any).segments)) {
                updatedTranslations[langKey] = {
                    ...(langObj as any),
                    segments: (langObj as any).segments.map((seg: any) => ({
                        ...seg,
                        style: {
                            ...(seg.style || {}),
                            ...newStyle
                        }
                    }))
                };
            } else {
                updatedTranslations[langKey] = langObj;
            }
        }
    }

    return {
        ...subtitles,
        style: updatedGlobalStyle,
        segments: updatedSegments,
        translations: updatedTranslations
    };
}
