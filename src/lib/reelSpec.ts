// ════════════════════════════════════════════════════════════════════
// Creador de Reels IA — espejo en el navegador
// v4.668.0
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
    | 'draft' | 'queued' | 'analyzing' | 'directing' | 'expanding' | 'generating'
    | 'scoring' | 'assembling' | 'validating'
    | 'ready' | 'needs_review' | 'error' | 'cancelled';

export type SceneStatus =
    | 'pending' | 'expanding' | 'generating' | 'rendering' | 'validating'
    | 'ready' | 'needs_review' | 'error';

export interface QualityReport {
    verdict: 'ready' | 'needs_review';
    failures: string[];
    warnings: string[];
    checkedAt: string;
    measured?: Record<string, unknown>;
}

// Un fotograma extraído del clip y su comparación con la fotografía original.
// Se guarda para que el veredicto automático sea revisable: poder mirar QUÉ se
// comparó es lo que separa una comprobación de una afirmación.
export interface FrameCheck {
    at: number;
    position: 'inicio' | 'medio' | 'fin' | string;
    frameUrl: string | null;
    comparisonUrl?: string | null;
    score?: number | null;
    structural?: { structure: number | null; colour: number | null; score: number | null } | null;
}

// El control de fidelidad tiene TRES estados, no dos. `unavailable` significa
// que no se pudo mirar. Desde v4.664 es un caso raro: los fotogramas se sacan
// del propio clip con FFmpeg, así que ya no depende de que el proveedor mande
// una portada.
/**
 * Fidelidad humana de una escena (v4.705): si en el clip hay alguien que no
 * está en la fotografía.
 *
 * Es una pregunta distinta de la fidelidad general y por eso viaja aparte: una
 * persona inventada puede estar perfectamente dibujada y ser perfectamente ella
 * misma, así que no es deformación ni deriva de identidad. Hasta v4.704 no se
 * medía, y por eso una escena con un rostro fantasma pasaba con 8/10.
 *
 * `null` en un indicador significa que esa comprobación no se pudo hacer, y se
 * pinta distinto de «bien». El campo entero es `null` cuando la fotografía no
 * tiene personas.
 */
export interface PeopleFidelity {
    verdict: 'ok' | 'failed';
    label: string;
    reason: string | null;
    /** Personas que contó el análisis de la fotografía, al dirigir. */
    sourceCount: number | null;
    /** Personas que el control contó en la mitad original de la comparación. */
    originalSeen: number | null;
    /** Personas que contó en el fotograma del clip. */
    clipSeen: number | null;
    countStable: boolean | null;
    /** Hubo desvío de recuento y no se corroboró: ruido de conteo, no un sujeto de más. */
    countNoise?: boolean;
    identitiesPreserved: boolean | null;
    occlusionsPreserved: boolean | null;
    facesConsistent: boolean | null;
    noNewSubjects: boolean | null;
    newSubjects?: boolean;
    occlusionBroken?: boolean;
    faceConsistency: number | null;
    countDelta: number | null;
    /** Por encima de ocho personas el recuento no decide solo. */
    countReliable: boolean | null;
    /** ¿La animación conserva quién hace qué? `null` = sin dato del modelo. */
    actionsConsistent?: boolean | null;
    actionReversed?: boolean;
    /** Señal explícita vista una sola vez: ruido de lectura, no defecto. */
    signalNoise?: boolean;
    framesChecked?: number;
}

/**
 * Un logotipo comprobado de cerca (v4.715). El recorte se compara a resolución
 * NATIVA, no dentro de la comparación de escena completa: ahí un estampado de
 * camiseta llega con las letras a 9 px y no lo lee ningún modelo.
 */
export interface BrandLogoCheck {
    label: string;
    region?: { label?: string; x: number; y: number; w: number; h: number };
    framesChecked: number;
    /** Parecido del recorte al original, 0-1. Determinista (sharp). */
    structuralScore: number | null;
    /** Estabilidad del recorte entre fotogramas del propio clip, 0-1. */
    temporalScore: number | null;
    /** Nota del logotipo, 0-10. */
    score: number | null;
    method: string;
    sameDesign: boolean | null;
    inventedGlyphs: boolean | null;
    geometryBroken: boolean | null;
    colorChanged: boolean | null;
    textKeptRatio: number | null;
    textOriginal: string | null;
    textRendered: string | null;
    comparisonUrl: string | null;
    issues: string[];
    altered: boolean;
    /** `vision` cuando decidió el modelo; `metrics` cuando no hubo modelo. */
    decidedBy?: 'vision' | 'metrics';
    metricsWarn?: boolean;
}

export interface BrandFidelity {
    state: 'ok' | 'failed' | 'unavailable';
    label: string;
    logos: BrandLogoCheck[];
    alteredCount?: number;
    total?: number;
    score?: number | null;
    reason?: string | null;
}

export interface FidelityReport {
    /** Nivel de vida de la escena, 0-100. `null` si no se pudo juzgar. */
    lifeScore?: number | null;
    /**
     * De dónde salió el juicio. `frames` es determinista: o el clip no cambia
     * un píxel, o su cambio se explica desplazando el encuadre (v4.787).
     * `still-motion` es la escena resuelta sin motor: no tiene vida interna por
     * construcción y no se finge medirla.
     */
    lifeSource?: 'vision' | 'frames' | 'still-motion' | null;
    /** Cambio medido entre fotogramas, 0-100. Determinista, sin proveedor. */
    lifeChange?: number | null;
    /** El cambio del clip se explica moviendo el encuadre: es cámara, no escena. */
    cameraOnly?: boolean;
    /** Qué parte del cambio explica ese desplazamiento, 0-1. */
    cameraExplained?: number | null;
    /** La escena se resolvió sustituyéndola por la fotografía en movimiento. */
    substituted?: boolean;
    state: 'ok' | 'failed' | 'unavailable';
    score: number | null;
    semanticScore?: number | null;
    structuralScore?: number | null;
    // 'estructural + visión' | 'sólo estructural' — se muestra, porque la
    // estructural sola no detecta un logotipo redibujado en su mismo sitio.
    method?: string | null;
    framesChecked?: number;
    issues: string[];
    reason?: string | null;
    frames?: FrameCheck[];
    text?: {
        keptRatio: number;
        /** Palabras comparadas. Sobre tres, una proporción no significa nada. */
        words?: number;
        /** Hubo desvío y no descalificó: ruido de transcripción, no texto roto. */
        noise?: boolean;
        samples: { ratio: number; original: string; rendered: string }[];
    } | null;
    deformation?: boolean;
    identityDrift?: boolean;
    brandAltered?: boolean;
    textIllegible?: boolean;
    colorShift?: boolean;
    anatomyErrors?: boolean;
    people?: PeopleFidelity | null;
    brand?: BrandFidelity | null;
}

export interface SceneAnalysis {
    summary: string;
    subject: string;
    hasPeople: boolean;
    /** Censo de la fotografía (v4.705): contra esto se contrasta el clip. */
    personCount?: number;
    peopleDensity?: 'none' | 'sparse' | 'dense';
    occludedPeople?: boolean;
    /** Descripción corta por persona: el mapa de sujetos que viaja al prompt. */
    subjects?: string[];
    /** Preservación estricta aplicada a ESTA escena. */
    strictPeople?: boolean;
    /** Intensidad efectiva tras acotarla por lo que hay en la foto. */
    resolvedIntensity?: string;
    /** Por qué se acotó. Se muestra: una escena más quieta sin motivo parece un fallo. */
    intensityReason?: string | null;
    hasBrand: boolean;
    /** Dónde vive cada marca, normalizado 0-1. Es lo que permite mirarla de cerca. */
    brandRegions?: { label?: string; x: number; y: number; w: number; h: number }[];
    hasText: boolean;
    hasFoodOrLiquid: boolean;
    hasNature: boolean;
    shotSize: 'wide' | 'medium' | 'close';
    energy: number;
    riskNotes: string[];
}

// Adaptación del lienzo al formato del Reel. `action:'skip'` significa que la
// foto ya estaba en formato y no se tocó, que es el buen caso.
export interface ExpansionReport {
    action?: 'skip' | 'expand';
    ok?: boolean;
    failed?: boolean;
    reason?: string;
    /**
     * Qué le pasa a la foto si nadie interviene. Va aparte del motivo porque es
     * la CONSECUENCIA: «demasiado apaisada» no le dice a nadie que va a perder
     * a las personas de los bordes.
     */
    consequence?: string | null;
    orientation?: string;
    grows?: 'vertical' | 'horizontal';
    growth?: number;
    generatedFraction?: number;
    sourceWidth?: number;
    sourceHeight?: number;
    state?: string;
    analysis?: { photoType?: string; warnings?: string[]; protect?: string[] };
    verification?: { preservation: number | null; structure: number | null; colour: number | null; width: number | null; height: number | null };
    judgement?: { verdict: 'ok' | 'failed' | 'unverified'; reason: string };
}

export interface ReelScene {
    id: string;
    projectId: string;
    position: number;
    sourceIndex: number;
    sourceImageUrl: string;
    sourceMediaId: string | null;
    expandedImageUrl?: string | null;
    animationSourceUrl?: string | null;
    expansionProvider?: string | null;
    expansionReport?: ExpansionReport | null;
    expansionAttempts?: number;
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
    frames?: FrameCheck[];
    creditsEstimated: number;
}

// Un copy de publicación, en su versión vigente. El historial son filas con
// `isCurrent:false`: nunca se sobrescribe un texto, se inserta otra versión.
export interface ReelCopy {
    id: string;
    platform: string;
    platformLabel: string;
    locale: string;
    version: number;
    isCurrent: boolean;
    title: string | null;
    subtitle: string | null;
    hook: string | null;
    category: string | null;
    marketingGoal: string | null;
    audience: string | null;
    keywords: string[];
    description: string | null;
    cta: string | null;
    hashtags: string[];
    fullText: string | null;
    charCount: number | null;
    maxChars: number | null;
    source: 'ai' | 'manual' | 'translation' | string;
    provider: string | null;
    model: string | null;
    isFavorite: boolean;
    createdAt: string;
}

// Narración: guion + voz, versionada igual que los copies.
export interface ReelNarration {
    id: string;
    version: number;
    isCurrent: boolean;
    script: string;
    words: number | null;
    rationale: string | null;
    language: string;
    languageLabel: string;
    style: string;
    styleLabel: string;
    gender: string;
    speed: number;
    audioUrl: string | null;
    ttsProvider: string | null;
    ttsProviderLabel: string | null;
    // null = el proveedor no controla el acento. Se muestra, porque prometer
    // «acento colombiano» con un motor que no lo elige sería falso.
    accentControlled: boolean | null;
    actualSec: number | null;
    targetSec: number | null;
    driftSec: number | null;
    withinTolerance: boolean | null;
    timing: { attempts?: { attempt: number; words: number; actualSec: number; driftSec: number }[]; budget?: Record<string, number>; leadInSec?: number; stretch?: number } | null;
    source: string;
    createdAt: string;
    summary: string;
}

export interface PublicationContext {
    type: string;
    typeLabel: string;
    tone: string;
    focus: string;
    interestArea: string;
    areaLabel: string;
    areaDescription: string;
}

export interface FidelitySummary {
    checked: number;
    failed: number;
    unavailable: number;
    total: number;
    framesChecked?: number;
    averageScore: number | null;
    label: string;
}

export interface Reel {
    id: string;
    title: string;
    description?: string | null;
    tags?: string[];
    clubId: string | null;
    organizationName: string | null;
    userId?: string | null;
    userEmail?: string | null;
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
    // Segundos que faltan, aproximadamente. `null` en estados terminales.
    etaSec?: number | null;
    cancellable?: boolean;
    retryable?: boolean;
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
    savedToLibraryAt?: string | null;
    createdAt: string;
    updatedAt: string;
    scenes: ReelScene[];
    copies?: ReelCopy[];
    narration?: ReelNarration | null;
    publicationType?: string;
    interestArea?: string;
    context?: PublicationContext;
}

// ─── Auditoría de consumo (v4.669) ─────────────────────────────────────────
//
// Espejo del informe que arma `usageReport` en el servidor. `costKnown: false`
// no significa «gastó cero»: significa que gastó unidades y no hay tarifa
// configurada para convertirlas a dinero. La pantalla dice esa diferencia con
// palabras en vez de pintar un «$0» que nadie sabría interpretar.
export interface ReelUsageOperation {
    operation: string;
    label: string;
    target: string | null;
    model: string | null;
    units: number;
    unit: string | null;
    credits: number;
    ms: number;
    status: 'ok' | 'error';
    detail: string | null;
    at: string;
}

export interface ReelUsageProvider {
    id: string;
    label: string;
    role: string | null;
    note: string | null;
    unitLabel: string | null;
    calls: number;
    errors: number;
    ms: number;
    credits: number;
    units: number;
    costUsd: number | null;
    costKnown: boolean;
    operations: ReelUsageOperation[];
    violations: { operation: string; label: string; scope: string; expected: string | null }[];
}

export interface ReelUsageReport {
    available: boolean;
    reason?: string;
    providers: ReelUsageProvider[];
    totals: {
        calls: number;
        errors: number;
        ms: number;
        credits: number;
        costUsd: number | null;
        costKnown: boolean;
        violations: number;
    } | null;
    contract: { id: string; label: string; role: string; note: string; allows: string[] }[];
    operations: { id: string; label: string; provider: string; scope: string }[];
    processingMs: number | null;
    // Diagnóstico del montaje. Administrativo: el comando, el código de salida
    // y la cola de stderr no se le muestran al usuario del Reel.
    render?: {
        environment: {
            ok: boolean; binary: boolean; executable: boolean; tmpWritable: boolean;
            version: string | null; error: string | null;
        };
        provider: string | null;
        diagnostics: {
            provider: string;
            message: string;
            code: string | null;
            ffmpeg: { label: string; args: string[]; exitCode: number | null; timedOut: boolean; stderrTail: string } | null;
            at: string;
        }[];
    };
}

export interface ReelOptions {
    formats: { id: string; label: string; isDefault: boolean; tiers: { id: string; label: string; width: number; height: number }[] }[];
    defaultFormat: string;
    defaultQualityTier: string;
    engines: { id: string; label: string; available: boolean; isDefault: boolean; fidelity: number; creditEstimate: number; note?: string }[];
    defaultEngine: string;
    motionStyles: { id: string; label: string; description: string; intensity: number }[];
    defaultMotionStyle: string;
    motionIntensities?: { id: string; label: string; description: string; isDefault: boolean }[];
    defaultMotionIntensity?: string;
    transitions: { id: string; label: string; description: string; overlap: number }[];
    defaultTransition: string;
    musicStyles: { id: string; label: string; mood: string; bpm: number }[];
    defaultMusicStyle: string;
    musicProviders: {
        id: string; label: string; available: boolean; isDefault: boolean; note?: string;
        // 'cleared' = datos de entrenamiento licenciados. 'unclear' = no
        // divulgados o en litigio. Se muestra en el panel: para una pieza
        // institucional que se publica en YouTube, es el dato que decide.
        licensing?: 'cleared' | 'unclear' | string;
        licensingNote?: string;
        mode?: 'sync' | 'async' | string;
    }[];
    musicChain?: string[];
    render: {
        provider: string | null;
        providerLabel: string | null;
        available: boolean;
        candidates: { id: string; label: string; available: boolean; envKey: string; note?: string }[];
        unavailableReason: string | null;
    };
    expansion: {
        available: boolean;
        provider: string;
        providerLabel: string | null;
        providers: { id: string; label: string; available: boolean; isDefault: boolean; preservation: number; note?: string }[];
        photoTypes: { id: string; label: string }[];
        settings: Record<string, number | string | boolean>;
        note: string;
    };
    context?: {
        types: { id: string; label: string; tone: string; focus: string; isDefault: boolean }[];
        areas: { id: string; label: string; description: string; isDefault: boolean }[];
        defaultType: string;
        defaultArea: string;
    };
    narration?: {
        available: boolean;
        provider: string | null;
        providers: { id: string; label: string; available: boolean; accentControl: boolean; isDefault: boolean; note?: string }[];
        languages: { id: string; label: string; wordsPerSecond: number; isDefault: boolean }[];
        styles: { id: string; label: string; pace: number; isDefault: boolean }[];
        genders: { id: string; label: string }[];
        defaultLanguage: string;
        defaultStyle: string;
        toleranceSec: number;
        accentControlled: boolean | null;
        unavailableReason: string | null;
    };
    copy?: {
        platforms: { id: string; label: string; maxChars: number; sweetSpot: number; maxHashtags: number; priority: string }[];
        categories: string[];
        goals: string[];
        exportFormats: string[];
    };
    timing: {
        sceneCount: number;
        minSceneCount?: number;
        maxSceneCount?: number;
        targetTotalSec: number;
        minSceneSec: number;
        maxSceneSec: number;
    };
    // ── Presets de pieza (v4.783) ──
    //
    // Opcionales en el TIPO a propósito: la pantalla tiene que seguir
    // funcionando contra un servidor que todavía no los sirva —durante el
    // despliegue conviven las dos versiones—, y sin `?` el typecheck obligaría
    // a fingir que siempre están.
    presets?: {
        id: string;
        label: string;
        description: string;
        sceneCounts: number[];
        defaultSceneCount: number;
        totalSec: Record<number, number>;
        contextSchema: string | null;
        motionStyle: string;
        motionIntensity: string;
        transition: string;
        musicStyle: string;
        onScreenText: boolean;
        closingCard: boolean;
        requireExpansion: boolean;
        hasNarrative: boolean;
        isDefault: boolean;
    }[];
    defaultPreset?: string;
    emergency?: {
        disasters: { id: string; label: string; magnitudeHint: string; freeText: boolean; isDefault: boolean }[];
        needs: { id: string; label: string }[];
        ctas: { id: string; label: string; isDefault: boolean }[];
        defaultDisaster: string;
        defaultCta: string;
    };
    usage: { spent: number; generations: number; limit: number | null; remaining: number | null; exceeded: boolean };
}

// Un estado terminal es en el que el Reel deja de moverse solo: o está listo, o
// hay algo que decidir. Es lo que corta el sondeo.
export const isTerminal = (status: ReelStatus): boolean =>
    status === 'ready' || status === 'needs_review' || status === 'error' || status === 'cancelled';

// Texto del tiempo restante. Devuelve null cuando no hay nada que esperar, para
// que la tarjeta no pinte un hueco. Nunca promete: es «aprox.» en la interfaz.
export const formatEta = (sec: number | null | undefined): string | null => {
    if (sec == null || sec <= 0) return null;
    if (sec < 60) return `${sec} s`;
    const m = Math.floor(sec / 60);
    const r = sec % 60;
    return r < 5 ? `${m} min` : `${m} min ${r} s`;
};

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
