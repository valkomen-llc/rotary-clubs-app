// ════════════════════════════════════════════════════════════════════
// Generador de Outros IA — espejo en el navegador
// v4.646.0
//
// Los CATÁLOGOS (estilos, voces, motores, formatos) NO se duplican aquí: se
// piden a `GET /api/content-studio/outros/options`, para que el servidor sea la
// única fuente de verdad y no puedan quedar desfasados.
//
// Lo que sí vive acá es el cálculo del presupuesto de locución, porque tiene que
// correr en cada tecla mientras se escribe y no puede pagar un viaje a la API en
// cada pulsación. Es idéntico al de `server/lib/outroSpec.js`; el servidor lo
// vuelve a calcular al crear el outro y su resultado es el que manda.
// ════════════════════════════════════════════════════════════════════

export type OutroStatus = 'pending' | 'generating' | 'rendering' | 'validating' | 'ready' | 'needs_review' | 'error';

export interface OutroVoice {
    enabled: boolean;
    language: string;
    gender: string;
    pace: string;
    tone: string;
    volume: string;
}

export interface OutroQualityReport {
    verdict: 'ready' | 'needs_review';
    failures: string[];
    warnings: string[];
    checkedAt: string;
    measured?: Record<string, unknown>;
}

export interface SourceReport {
    width: number | null;
    height: number | null;
    upscaleFactor: number | null;
    sharpness: number | null;
    aspectRatio: number | null;
    warnings: string[];
    ok: boolean;
}

export interface Outro {
    id: string;
    title: string;
    clubId: string | null;
    organizationName: string | null;
    sourceImageUrl: string;
    sourceReport: SourceReport | null;
    style: string;
    styleLabel: string;
    format: string;
    speechText: string | null;
    speechUsed: string | null;
    voice: OutroVoice;
    config: {
        durationSec: number;
        resolution: string;
        master: { width: number; height: number };
        voiceEnabled: boolean;
        notes: string[];
    };
    engine: string;
    engineLabel: string;
    engineModel: string | null;
    kieJobId: string | null;
    status: OutroStatus;
    statusLabel: string;
    statusDetail: string | null;
    attempts: number;
    videoUrl: string | null;
    durationSec: number | null;
    width: number | null;
    height: number | null;
    bitrateKbps: number | null;
    sizeBytes: number | null;
    hasAudio: boolean | null;
    quality: OutroQualityReport | null;
    creditsEstimated: number;
    mediaId: string | null;
    parentId: string | null;
    version: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface OutroOptions {
    version: string;
    targetDurationSec: number;
    formats: { id: string; label: string; master: { width: number; height: number }; isDefault?: boolean }[];
    defaultFormat: string;
    styles: { id: string; label: string; description: string }[];
    defaultStyle: string;
    engines: {
        id: string; label: string; nativeAudio: boolean; durations: number[];
        aspectRatios: string[]; resolutions: string[]; creditEstimate: number;
        creditEstimateAudio: number;
        note: string; available: boolean; isDefault: boolean;
    }[];
    voice: {
        languages: { id: string; label: string }[];
        genders: { id: string; label: string }[];
        paces: { id: string; label: string }[];
        tones: { id: string; label: string }[];
        volumes: { id: string; label: string }[];
        defaults: OutroVoice;
    };
    statuses: { id: OutroStatus; label: string; terminal: boolean }[];
    credits: { spent: number; generations: number; limit: number | null; remaining: number | null; exceeded: boolean };
    providerConfigured: boolean;
}

// Palabras por segundo por idioma. Copia exacta de VOICE_LANGUAGES del servidor.
const WORDS_PER_SECOND: Record<string, number> = {
    'es-CO': 2.5, 'es-MX': 2.5, 'es-AR': 2.4, 'es-ES': 2.6, 'es-419': 2.5,
    'en-US': 2.7, 'en-GB': 2.6, 'pt-BR': 2.5, 'fr-FR': 2.4, 'it-IT': 2.5
};
const PACE_FACTOR: Record<string, number> = { slow: 0.85, normal: 1, fast: 1.15 };
const SPEECH_PADDING_SEC = 0.7;

export const countWords = (text: string): number =>
    String(text || '').trim().split(/\s+/).filter(Boolean).length;

export interface SpeechFit {
    availableSec: number;
    wordsPerSecond: number;
    maxWords: number;
    words: number;
    fits: boolean;
    overflowWords: number;
    estimatedSec: number;
}

export const checkSpeechFit = (
    text: string,
    { durationSec = 5, language = 'es-CO', pace = 'normal' }: { durationSec?: number; language?: string; pace?: string } = {}
): SpeechFit => {
    const wps = (WORDS_PER_SECOND[language] ?? 2.5) * (PACE_FACTOR[pace] ?? 1);
    const availableSec = Math.max(0, durationSec - SPEECH_PADDING_SEC);
    const maxWords = Math.max(1, Math.floor(availableSec * wps));
    const words = countWords(text);
    return {
        availableSec: Number(availableSec.toFixed(2)),
        wordsPerSecond: Number(wps.toFixed(2)),
        maxWords,
        words,
        fits: words <= maxWords,
        overflowWords: Math.max(0, words - maxWords),
        estimatedSec: Number((words / wps).toFixed(2))
    };
};

// Estados que todavía se están cocinando: mientras haya alguno, la pantalla
// sigue sondeando al servidor.
export const isPending = (status: OutroStatus): boolean =>
    ['pending', 'generating', 'rendering', 'validating'].includes(status);

export const STATUS_STYLES: Record<OutroStatus, { chip: string; dot: string }> = {
    pending:      { chip: 'bg-gray-100 text-gray-600 border-gray-200',        dot: 'bg-gray-400' },
    generating:   { chip: 'bg-indigo-50 text-indigo-700 border-indigo-200',   dot: 'bg-indigo-500 animate-pulse' },
    rendering:    { chip: 'bg-blue-50 text-blue-700 border-blue-200',         dot: 'bg-blue-500 animate-pulse' },
    validating:   { chip: 'bg-violet-50 text-violet-700 border-violet-200',   dot: 'bg-violet-500 animate-pulse' },
    ready:        { chip: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
    needs_review: { chip: 'bg-amber-50 text-amber-700 border-amber-200',      dot: 'bg-amber-500' },
    error:        { chip: 'bg-red-50 text-red-700 border-red-200',            dot: 'bg-red-500' }
};

export const formatBytes = (bytes: number | null): string => {
    if (!bytes) return '—';
    const mb = bytes / (1024 * 1024);
    return mb >= 1 ? `${mb.toFixed(1)} MB` : `${(bytes / 1024).toFixed(0)} KB`;
};
