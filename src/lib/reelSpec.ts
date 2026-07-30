// ════════════════════════════════════════════════════════════════════
// Creador de Reels IA — espejo en el navegador
// v4.663.0
//
// Los CATÁLOGOS (motores, estilos, transiciones, música, formatos) NO se
// duplican aquí: se piden a `GET /api/content-studio/reels/options`, para que
// el servidor sea la única fuente de verdad y no puedan quedar desfasados.
//
// Lo que vive acá son los TIPOS y las constantes que la pantalla necesita antes
// de la primera respuesta (cuántas fotos pide, el rango de duración por escena)
// más el formateo de la línea de tiempo, que se recalcula al arrastrar y no
// puede pagar un viaje a la API en cada movimiento. El servidor vuelve a
// calcularlo al crear el Reel y su resultado es el que manda.
// ════════════════════════════════════════════════════════════════════

export const SCENE_COUNT = 3;
export const TARGET_TOTAL_SEC = 15;
export const MIN_SCENE_SEC = 4;
export const MAX_SCENE_SEC = 6;

export type ReelStatus =
    | 'draft' | 'analyzing' | 'directing' | 'generating'
    | 'scoring' | 'assembling' | 'validating'
    | 'ready' | 'needs_review' | 'error';

export type SceneStatus =
    | 'pending' | 'generating' | 'rendering' | 'validating'
    | 'ready' | 'needs_review' | 'error';

export interface QualityReport {
    verdict: 'ready' | 'needs_review';
    failures: string[];
    warnings: string[];
    checkedAt: string;
    measured?: Record<string, unknown>;
}

// El control de fidelidad tiene TRES estados, no dos. `unavailable` significa
// que no se pudo mirar —el proveedor no entregó fotograma— y se muestra tal
// cual: dar por buena una escena que nadie comprobó sería peor que decirlo.
export interface FidelityReport {
    state: 'ok' | 'failed' | 'unavailable';
    score: number | null;
    issues: string[];
    reason?: string | null;
    frameUrl?: string | null;
    deformation?: boolean;
    identityDrift?: boolean;
    brandAltered?: boolean;
    textIllegible?: boolean;
    colorShift?: boolean;
    anatomyErrors?: boolean;
}

export interface SceneAnalysis {
    summary: string;
    subject: string;
    hasPeople: boolean;
    hasBrand: boolean;
    hasText: boolean;
    hasFoodOrLiquid: boolean;
    hasNature: boolean;
    shotSize: 'wide' | 'medium' | 'close';
    energy: number;
    riskNotes: string[];
}

export interface ReelScene {
    id: string;
    projectId: string;
    position: number;
    sourceIndex: number;
    sourceImageUrl: string;
    sourceMediaId: string | null;
    style: string | null;
    styleLabel: string | null;
    transitionOut: string | null;
    transitionLabel: string | null;
    prompt: string | null;
    analysis: SceneAnalysis | null;
    note: string | null;
    durationSec: number | null;
    generatedDurationSec: number | null;
    engine: string | null;
    engineLabel: string | null;
    status: SceneStatus;
    statusLabel: string;
    statusDetail: string | null;
    attempts: number;
    videoUrl: string | null;
    posterUrl: string | null;
    width: number | null;
    height: number | null;
    bitrateKbps: number | null;
    sizeBytes: number | null;
    quality: QualityReport | null;
    fidelity: FidelityReport | null;
    creditsEstimated: number;
}

export interface FidelitySummary {
    checked: number;
    failed: number;
    unavailable: number;
    total: number;
    averageScore: number | null;
    label: string;
}

export interface Reel {
    id: string;
    title: string;
    clubId: string | null;
    organizationName: string | null;
    format: string;
    formatLabel: string;
    qualityTier: string;
    qualityLabel: string;
    motionStyle: string;
    transition: string;
    musicStyle: string;
    musicStyleLabel: string | null;
    config: {
        timing?: {
            requested: number[];
            generated: number[];
            finalDurationSec: number;
            overlapTotal: number;
        };
        withMusic?: boolean;
        sourceImages?: { id: string | null; url: string }[];
    };
    engine: string;
    engineLabel: string;
    engineModel: string | null;
    direction: {
        order: number[];
        musicStyle: string;
        energy: number;
        rationale: string;
        fromModel: boolean;
    } | null;
    musicProvider: string | null;
    musicUrl: string | null;
    renderProvider: string | null;
    renderProviderLabel: string | null;
    status: ReelStatus;
    statusLabel: string;
    statusDetail: string | null;
    progress: number;
    notes: string[];
    videoUrl: string | null;
    posterUrl: string | null;
    durationSec: number | null;
    width: number | null;
    height: number | null;
    bitrateKbps: number | null;
    sizeBytes: number | null;
    hasAudio: boolean | null;
    quality: QualityReport | null;
    fidelitySummary: FidelitySummary;
    creditsEstimated: number;
    processingMs: number | null;
    mediaId: string | null;
    createdAt: string;
    updatedAt: string;
    scenes: ReelScene[];
}

export interface ReelOptions {
    formats: { id: string; label: string; isDefault: boolean; tiers: { id: string; label: string; width: number; height: number }[] }[];
    defaultFormat: string;
    defaultQualityTier: string;
    engines: { id: string; label: string; available: boolean; isDefault: boolean; fidelity: number; creditEstimate: number; note?: string }[];
    defaultEngine: string;
    motionStyles: { id: string; label: string; description: string; intensity: number }[];
    defaultMotionStyle: string;
    transitions: { id: string; label: string; description: string; overlap: number }[];
    defaultTransition: string;
    musicStyles: { id: string; label: string; mood: string; bpm: number }[];
    defaultMusicStyle: string;
    musicProviders: { id: string; label: string; available: boolean; isDefault: boolean; note?: string }[];
    render: {
        provider: string | null;
        providerLabel: string | null;
        available: boolean;
        candidates: { id: string; label: string; available: boolean; envKey: string; note?: string }[];
        unavailableReason: string | null;
    };
    timing: { sceneCount: number; targetTotalSec: number; minSceneSec: number; maxSceneSec: number };
    usage: { spent: number; generations: number; limit: number | null; remaining: number | null; exceeded: boolean };
}

// Un estado terminal es en el que el Reel deja de moverse solo: o está listo, o
// hay algo que decidir. Es lo que corta el sondeo.
export const isTerminal = (status: ReelStatus): boolean =>
    status === 'ready' || status === 'needs_review' || status === 'error';

export const isSceneTerminal = (status: SceneStatus): boolean =>
    status === 'ready' || status === 'needs_review' || status === 'error';

// Duración de la pieza montada: la suma de los tramos menos lo que se comen los
// fundidos. Se recalcula al arrastrar el control de una escena, por eso vive
// acá y no se le pide al servidor.
export const timelineDuration = (
    scenes: { durationSec: number | null; transitionOut: string | null }[],
    overlaps: Record<string, number>
): number => {
    const total = scenes.reduce((sum, s) => sum + (s.durationSec || 0), 0);
    const lost = scenes
        .slice(0, -1)
        .reduce((sum, s) => sum + (overlaps[s.transitionOut || 'fade'] ?? 0.5), 0);
    return Number((total - lost).toFixed(2));
};

export const formatSeconds = (sec: number | null | undefined): string => {
    if (sec == null) return '—';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

export const formatBytes = (bytes: number | null | undefined): string => {
    if (!bytes) return '—';
    const mb = bytes / (1024 * 1024);
    return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb.toFixed(1)} MB`;
};
