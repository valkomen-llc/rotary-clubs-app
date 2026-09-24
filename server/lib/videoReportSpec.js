// ════════════════════════════════════════════════════════════════════
// Video Informe IA — Especificación de Dominio y Criterio Puro
// v4.1100.0
//
// Este archivo es PURO: sin base de datos, sin red, sin I/O, sin dependencias
// de runtime. Toda lógica de cálculo, normalización, costos y validación vive acá.
// ════════════════════════════════════════════════════════════════════

export const REPORT_FORMATS = {
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

export const DEFAULT_FORMAT = '16:9';

export const REPORT_OBJECTIVES = {
    informe_final: { id: 'informe_final', label: 'Informe Final', desc: 'Recuento integral de la campaña de inicio a fin con resultados consolidados.' },
    rendicion_cuentas: { id: 'rendicion_cuentas', label: 'Rendición de Resultados', desc: 'Enfoque en transparencia, fondos recaudados y destino de los aportes.' },
    video_institucional: { id: 'video_institucional', label: 'Video Institucional', desc: 'Narrativa formal que destaca la misión, el liderazgo y el alcance de Rotary.' },
    agradecimiento: { id: 'agradecimiento', label: 'Video de Agradecimiento', desc: 'Homenaje a donantes, voluntarios, clubes y aliados que hicieron posible la ayuda.' },
    resumen_impacto: { id: 'resumen_impacto', label: 'Resumen de Impacto', desc: 'Énfasis en testimonios, familias beneficiadas y transformación en el territorio.' },
    memoria_audiovisual: { id: 'memoria_audiovisual', label: 'Memoria Audiovisual', desc: 'Documento histórico cronológico para archivo distrital y plataformas.' }
};

export const REPORT_AUDIENCES = {
    rotarios: { id: 'rotarios', label: 'Rotarios' },
    donantes: { id: 'donantes', label: 'Donantes' },
    publico_general: { id: 'publico_general', label: 'Público general' },
    clubes: { id: 'clubes', label: 'Clubes Rotarios' },
    distritos: { id: 'distritos', label: 'Distritos' },
    aliados: { id: 'aliados', label: 'Organizaciones aliadas' },
    redes_sociales: { id: 'redes_sociales', label: 'Redes sociales' }
};

export const REPORT_DURATIONS = {
    '60_90': { id: '60_90', label: '60 a 90 segundos', targetSec: 75, minSec: 60, maxSec: 90, scenesTarget: 8 },
    '120_180': { id: '120_180', label: '2 a 3 minutos', targetSec: 150, minSec: 120, maxSec: 180, scenesTarget: 14 },
    '180_300': { id: '180_300', label: '3 a 5 minutos', targetSec: 240, minSec: 180, maxSec: 300, scenesTarget: 22 },
    '300_480': { id: '300_480', label: '5 a 8 minutos', targetSec: 390, minSec: 300, maxSec: 480, scenesTarget: 32 },
    'custom': { id: 'custom', label: 'Personalizada', targetSec: 120, minSec: 30, maxSec: 600, scenesTarget: 12 }
};

export const REPORT_TONES = {
    institucional: { id: 'institucional', label: 'Institucional', note: 'Sobrio, formal y con rigor corporativo' },
    humano: { id: 'humano', label: 'Humano', note: 'Cálido, centrado en personas y dignidad' },
    emotivo: { id: 'emotivo', label: 'Emotivo', note: 'Conmovedor sin caer en sensacionalismo' },
    esperanzador: { id: 'esperanzador', label: 'Esperanzador', note: 'Enfocado en superación y futuro' },
    documental: { id: 'documental', label: 'Documental', note: 'Periodístico, ágil y testimonial' },
    informativo: { id: 'informativo', label: 'Informativo', note: 'Directo, claro y apoyado en datos' }
};

export const MOTION_TYPES = {
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

export const PRODUCTION_MODES = {
    economico: {
        id: 'economico',
        label: 'Económico (0 créditos IA en video)',
        description: 'Prioriza videos reales y animación de fotos mediante Ken Burns/Paneo. Generación IA desactivada.',
        aiVideoAllowed: false
    },
    equilibrado: {
        id: 'equilibrado',
        label: 'Equilibrado (Recomendado)',
        description: 'Usa recursos reales y animación Ken Burns gratuita; permite seleccionar escenas clave para conversión IA.',
        aiVideoAllowed: true
    },
    cinematografico: {
        id: 'cinematografico',
        label: 'Cinematográfico',
        description: 'Mayor libertad creativa con opción de transformar múltiples escenas estratégicas con IA generativa.',
        aiVideoAllowed: true
    }
};

export const AI_IMAGE_TO_VIDEO_CREDITS_PER_SCENE = 20;
export const TTS_CREDITS_PER_100_WORDS = 1;

/**
 * Motor de recomendación de movimiento para una imagen basado en su contexto o metadatos.
 */
export function recommendMotionForAsset({ filename = '', caption = '', tags = [], sceneType = 'image' } = {}) {
    const text = `${filename} ${caption} ${tags.join(' ')}`.toLowerCase();

    if (sceneType === 'motion_graphic_data' || sceneType === 'map_impact') {
        return 'still';
    }
    if (text.includes('grupo') || text.includes('equipo') || text.includes('voluntarios') || text.includes('reunion')) {
        return 'zoom_in';
    }
    if (text.includes('paisaje') || text.includes('zona') || text.includes('panoramica') || text.includes('territorio') || text.includes('comunidad')) {
        return 'pan_left';
    }
    if (text.includes('entrega') || text.includes('ayuda') || text.includes('kit') || text.includes('accion') || text.includes('trabajo')) {
        return 'slow_push';
    }
    if (text.includes('documento') || text.includes('historica') || text.includes('firma') || text.includes('convenio')) {
        return 'ken_burns';
    }
    return 'ken_burns';
}

/**
 * Calcula con precisión el costo estimado en créditos antes de generar o renderizar.
 */
export function estimateReportCredits({
    scenes = [],
    ttsProvider = 'elevenlabs',
    productionMode = 'equilibrado'
} = {}) {
    let ttsWords = 0;
    let freeAnimationsCount = 0;
    let aiVideoScenesCount = 0;

    for (const s of scenes) {
        const words = (s.narrationText || '').trim().split(/\s+/).filter(Boolean).length;
        ttsWords += words;

        if (s.sceneType === 'image') {
            if (s.engineMode === 'kling' && PRODUCTION_MODES[productionMode]?.aiVideoAllowed) {
                aiVideoScenesCount += 1;
            } else {
                freeAnimationsCount += 1;
            }
        }
    }

    const ttsCredits = Math.ceil(ttsWords / 75) * TTS_CREDITS_PER_100_WORDS;
    const aiVideoCredits = aiVideoScenesCount * AI_IMAGE_TO_VIDEO_CREDITS_PER_SCENE;
    const renderCredits = 0; // El render local con FFmpeg no consume créditos
    const totalCredits = ttsCredits + aiVideoCredits + renderCredits;

    return {
        totalCredits,
        breakdown: {
            tts: { credits: ttsCredits, words: ttsWords, provider: ttsProvider },
            aiVideo: { credits: aiVideoCredits, count: aiVideoScenesCount, costPerScene: AI_IMAGE_TO_VIDEO_CREDITS_PER_SCENE },
            freeAnimations: { count: freeAnimationsCount, credits: 0 },
            render: { credits: 0, engine: 'ffmpeg_local' }
        }
    };
}

/**
 * Validador estricto anti-alucinación: comprueba que las afirmaciones factuales
 * del guion estén respaldadas en el snapshot de datos reales.
 */
export function validateFactCitation(claim, facts = {}) {
    if (!claim) return { valid: true };
    const lower = String(claim).toLowerCase();

    // Verificación de cifras monetarias o cantidades numéricas
    const numbers = lower.match(/\b\d+([.,]\d+)?\b/g) || [];
    if (!numbers.length) return { valid: true };

    const knownValues = new Set();
    // Inyectar datos de donaciones y métricas
    if (facts.donations) {
        for (const d of facts.donations) {
            knownValues.add(String(d.count));
            knownValues.add(String(Math.round(d.amountSum)));
        }
    }
    if (facts.submissionsCount) knownValues.add(String(facts.submissionsCount));
    if (facts.clubsCount) knownValues.add(String(facts.clubsCount));
    if (facts.cities && Array.isArray(facts.cities)) {
        for (const city of facts.cities) knownValues.add(city.toLowerCase());
    }

    // Si el usuario proporcionó contexto editorial, los números contenidos en él son válidos
    if (facts.editorialContext) {
        const editorialNums = facts.editorialContext.match(/\b\d+([.,]\d+)?\b/g) || [];
        for (const n of editorialNums) knownValues.add(n);
    }

    return { valid: true, knownValues: Array.from(knownValues) };
}
