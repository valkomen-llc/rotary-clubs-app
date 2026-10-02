// ════════════════════════════════════════════════════════════════════════════
// Tipos y Modelos del Editor de Video Profesional — v4.1141.0
// ════════════════════════════════════════════════════════════════════════════

export type AspectRatio = '16:9' | '9:16' | '1:1' | '4:5';
export type Resolution = '1080p' | '720p';
export type TrackType = 'video' | 'audio' | 'text' | 'subtitles';
export type ClipType = 'video' | 'image' | 'audio' | 'text';

export interface SubtitleSegment {
    id: string;
    start: number;
    end: number;
    text: string;
    translations?: Record<string, string>; // Mapa de textos por idioma: { es: "...", en: "...", fr: "..." }
    duration?: number;
    trackId?: string;
    translated?: boolean;
    sourceText?: string;
    lang?: string;
    style?: Partial<SubtitleStyle>;
}

export interface SubtitleStyle {
    fontFamily: string;
    fontSize: number;
    color: string;
    backgroundColor: string;
    position: 'bottom' | 'center' | 'top';
    align: 'left' | 'center' | 'right';
    fontWeight: 'normal' | 'bold' | '900';
    borderRadius: number;
}

export interface SubtitleTrackVersion {
    language: string;
    languageName?: string;
    isOriginal?: boolean;
    segments: SubtitleSegment[];
    provider?: string;
    createdAt?: string;
    updatedAt?: string;
}

export interface SubtitleConfig {
    segments: SubtitleSegment[];
    style: SubtitleStyle;
    sourceLanguage?: string;
    sourceLanguageName?: string;
    activeLanguage?: string;
    availableLanguages?: string[];
    translations?: Record<string, SubtitleTrackVersion>;
    originalSegments?: SubtitleSegment[];
    transcript?: string;
    language?: string;
}

export interface Track {
    id: string;
    name: string;
    type: TrackType;
    order: number;
    muted: boolean;
    locked: boolean;
    visible: boolean;
}

export interface Clip {
    id: string;
    trackId: string;
    type: ClipType;
    name: string;
    url?: string;
    startTime: number;    // Segundo de inicio en la línea de tiempo
    duration: number;     // Duración en segundos en la línea de tiempo
    trimStart?: number;   // Recorte inicial del recurso
    volume?: number;      // 0 a 200 (porcentaje)
    muted?: boolean;
    text?: string;        // Para clips de tipo texto
    style?: {
        fontFamily?: string;
        fontSize?: number;
        color?: string;
        backgroundColor?: string;
        fontWeight?: string;
        align?: 'left' | 'center' | 'right';
        x?: number;        // porcentaje -50 a 50
        y?: number;        // porcentaje -50 a 50
    };
    transition?: {
        type: 'fade' | 'dissolve' | 'slide_left' | 'slide_right' | 'zoom_in';
        duration: number;
    };
    transform?: {
        scale: number;
        x: number;
        y: number;
    };
}

export interface VideoEditorProjectData {
    id: string;
    title: string;
    clubId?: string | null;
    userId?: string | null;
    userEmail?: string | null;
    format: AspectRatio;
    resolution: Resolution;
    duration: number;
    fps?: number;
    tracks: Track[];
    clips: Clip[];
    subtitles: SubtitleConfig;
    transcript?: {
        text?: string;
        language?: string;
        provider?: string;
    };
    transitions?: any[];
    config?: Record<string, any>;
    status: 'draft' | 'saving' | 'saved' | 'processing' | 'rendering' | 'completed' | 'error';
    renderStatus: 'idle' | 'rendering' | 'completed' | 'error';
    renderProgress: number;
    renderStage?: string;
    errorDetail?: string | null;
    videoUrl?: string | null;
    s3Key?: string | null;
    thumbUrl?: string | null;
    createdAt?: string;
    updatedAt?: string;
}

export interface MediaLibraryItem {
    id: string;
    filename: string;
    url: string;
    type: 'image' | 'video' | 'audio' | 'document';
    thumbUrl?: string | null;
    sourceType?: string;
    sourceLabel?: string;
    createdAt?: string;
}
