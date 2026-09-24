// ════════════════════════════════════════════════════════════════════
// Video Informe IA — Espejo en el Navegador (TypeScript)
// v4.1100.0
// ════════════════════════════════════════════════════════════════════

export interface VideoReportFormat {
    id: string;
    label: string;
    width: number;
    height: number;
    aspectRatio: string;
    recommendedFor: string;
}

export const REPORT_FORMATS: Record<string, VideoReportFormat> = {
    '16:9': {
        id: '16:9',
        label: '16:9 Horizontal (YouTube y Web)',
        width: 1920,
        height: 1080,
        aspectRatio: '16:9',
        recommendedFor: 'YouTube, conferencias, proyecciones y web oficial'
    },
    '9:16': {
        id: '9:16',
        label: '9:16 Vertical (Reel, Shorts y TikTok)',
        width: 1080,
        height: 1920,
        aspectRatio: '9:16',
        recommendedFor: 'Instagram Reels, TikTok, YouTube Shorts y estados'
    },
    '1:1': {
        id: '1:1',
        label: '1:1 Cuadrado (Feed Social)',
        width: 1080,
        height: 1080,
        aspectRatio: '1:1',
        recommendedFor: 'Feed de Instagram, Facebook y LinkedIn'
    },
    '4:5': {
        id: '4:5',
        label: '4:5 Vertical Feed (Instagram/Facebook)',
        width: 1080,
        height: 1350,
        aspectRatio: '4:5',
        recommendedFor: 'Feed vertical optimizado para retención'
    }
};

export interface ObjectiveOption {
    id: string;
    label: string;
    desc: string;
}

export const REPORT_OBJECTIVES: Record<string, ObjectiveOption> = {
    informe_final: { id: 'informe_final', label: 'Informe Final', desc: 'Recuento integral de la campaña con resultados consolidados.' },
    rendicion_cuentas: { id: 'rendicion_cuentas', label: 'Rendición de Resultados', desc: 'Enfoque en transparencia, fondos recaudados y destino.' },
    video_institucional: { id: 'video_institucional', label: 'Video Institucional', desc: 'Narrativa formal que destaca la misión y alcance rotario.' },
    agradecimiento: { id: 'agradecimiento', label: 'Video de Agradecimiento', desc: 'Homenaje a donantes, voluntarios y clubes aliados.' },
    resumen_impacto: { id: 'resumen_impacto', label: 'Resumen de Impacto', desc: 'Énfasis en testimonios y transformación en territorio.' },
    memoria_audiovisual: { id: 'memoria_audiovisual', label: 'Memoria Audiovisual', desc: 'Documento histórico cronológico para archivo distrital.' }
};

export interface DurationOption {
    id: string;
    label: string;
    targetSec: number;
    minSec: number;
    maxSec: number;
    scenesTarget: number;
}

export const REPORT_DURATIONS: Record<string, DurationOption> = {
    '60_90': { id: '60_90', label: '60 a 90 segundos', targetSec: 75, minSec: 60, maxSec: 90, scenesTarget: 8 },
    '120_180': { id: '120_180', label: '2 a 3 minutos', targetSec: 150, minSec: 120, maxSec: 180, scenesTarget: 14 },
    '180_300': { id: '180_300', label: '3 a 5 minutos', targetSec: 240, minSec: 180, maxSec: 300, scenesTarget: 22 },
    '300_480': { id: '300_480', label: '5 a 8 minutos', targetSec: 390, minSec: 300, maxSec: 480, scenesTarget: 32 },
    'custom': { id: 'custom', label: 'Personalizada', targetSec: 120, minSec: 30, maxSec: 600, scenesTarget: 12 }
};

export const REPORT_TONES: Record<string, { id: string; label: string; note: string }> = {
    institucional: { id: 'institucional', label: 'Institucional', note: 'Sobrio, formal y con rigor corporativo' },
    humano: { id: 'humano', label: 'Humano', note: 'Cálido, centrado en personas y dignidad' },
    emotivo: { id: 'emotivo', label: 'Emotivo', note: 'Conmovedor sin caer en sensacionalismo' },
    esperanzador: { id: 'esperanzador', label: 'Esperanzador', note: 'Enfocado en superación y futuro' },
    documental: { id: 'documental', label: 'Documental', note: 'Periodístico, ágil y testimonial' },
    informativo: { id: 'informativo', label: 'Informativo', note: 'Directo, claro y apoyado en datos' }
};

export interface MotionOption {
    id: string;
    label: string;
    isAi: boolean;
    credits: number;
    description: string;
}

export const MOTION_TYPES: Record<string, MotionOption> = {
    ken_burns: { id: 'ken_burns', label: 'Ken Burns Suave', isAi: false, credits: 0, description: 'Efecto documental cinematográfico con leve escala y deriva lenta' },
    zoom_in: { id: 'zoom_in', label: 'Zoom In', isAi: false, credits: 0, description: 'Acercamiento progresivo suave (1.00x a 1.08x)' },
    zoom_out: { id: 'zoom_out', label: 'Zoom Out', isAi: false, credits: 0, description: 'Alejamiento progresivo para revelar el contexto' },
    pan_left: { id: 'pan_left', label: 'Paneo Izquierda', isAi: false, credits: 0, description: 'Desplazamiento horizontal suave hacia la izquierda' },
    pan_right: { id: 'pan_right', label: 'Paneo Derecha', isAi: false, credits: 0, description: 'Desplazamiento horizontal suave hacia la derecha' },
    pan_up: { id: 'pan_up', label: 'Paneo Arriba', isAi: false, credits: 0, description: 'Desplazamiento vertical ascendente' },
    pan_down: { id: 'pan_down', label: 'Paneo Abajo', isAi: false, credits: 0, description: 'Desplazamiento vertical descendente' },
    slow_push: { id: 'slow_push', label: 'Push Lento', isAi: false, credits: 0, description: 'Empuje focalizado hacia el centro de interés' },
    slow_pull: { id: 'slow_pull', label: 'Pull Lento', isAi: false, credits: 0, description: 'Retroceso sutil de cámara fija' },
    still: { id: 'still', label: 'Fijo (Sin movimiento)', isAi: false, credits: 0, description: 'Plano fijo para placas con lectura de datos o logotipos' }
};

export interface VideoReportSceneAsset {
    id: string;
    url: string;
    thumbUrl?: string | null;
    mediaId?: string | null;
    durationSec: number;
    motionType: string;
    engineMode: 'motion' | 'kling';
    aiTaskId?: string | null;
    aiVideoUrl?: string | null;
}

export interface ReportVoiceLanguage {
    id: string;
    label: string;
    locale: string;
    isDefault?: boolean;
}

export const REPORT_VOICE_LANGUAGES: Record<string, ReportVoiceLanguage> = {
    'es-CO': { id: 'es-CO', label: 'Español · Colombia (Recomendado)', locale: 'es-CO', isDefault: true },
    'es-419': { id: 'es-419', label: 'Español · Latino neutro', locale: 'es-419' },
    'es-MX': { id: 'es-MX', label: 'Español · México', locale: 'es-MX' },
    'es-AR': { id: 'es-AR', label: 'Español · Argentina', locale: 'es-AR' },
    'es-ES': { id: 'es-ES', label: 'Español · España', locale: 'es-ES' },
    'en-US': { id: 'en-US', label: 'Inglés · Estados Unidos', locale: 'en-US' }
};

export function getRecommendedAssetCount(durationSec: number): number {
    if (durationSec >= 10) return 3;
    if (durationSec >= 6) return 2;
    return 1;
}

export function distributeAssetDurations(totalSec: number, count: number): number[] {
    const n = Math.max(1, Math.min(count, 4));
    const safeTotal = Math.max(3, Math.round(totalSec * 10) / 10);
    if (n === 1) return [safeTotal];
    
    const slice = Math.round((safeTotal / n) * 10) / 10;
    const result: number[] = [];
    let accumulated = 0;
    for (let i = 0; i < n - 1; i++) {
        result.push(slice);
        accumulated += slice;
    }
    const remainder = Math.max(1.5, Math.round((safeTotal - accumulated) * 10) / 10);
    result.push(remainder);
    return result;
}

export interface VideoReportSceneData {
    id: string;
    versionId: string;
    sortOrder: number;
    chapter: string;
    sceneType: 'image' | 'video' | 'motion_graphic_data' | 'map_impact' | 'testimonial';
    durationSec: number;
    narrationText: string;
    voiceAudioUrl?: string | null;
    voiceAudioDurationSec?: number | null;
    onScreenTitle?: string | null;
    onScreenSubtitle?: string | null;
    onScreenDataValue?: string | null;
    onScreenDataLabel?: string | null;
    mediaUrl?: string | null;
    mediaId?: string | null;
    thumbUrl?: string | null;
    motionType: string;
    engineMode: 'motion' | 'kling';
    aiTaskId?: string | null;
    aiVideoUrl?: string | null;
    creditsEstimated: number;
    creditsUsed: number;
    factSource?: { type?: string; claim: string; source: string } | null;
    mediaAssets?: VideoReportSceneAsset[];
}

export interface VideoReportProjectData {
    id: string;
    campaignId: string;
    clubId?: string | null;
    title: string;
    objective: string;
    audience: string;
    format: string;
    targetDurationSec: number;
    tone: string;
    productionMode: 'economico' | 'equilibrado' | 'cinematografico';
    editorialContext?: string | null;
    factualSnapshot?: any;
    status: string;
    currentVersion?: {
        id: string;
        versionNumber: number;
        label: string;
        script?: any;
        voiceConfig?: any;
        musicConfig?: any;
        outroConfig?: any;
        scenes: VideoReportSceneData[];
    } | null;
}
