// ════════════════════════════════════════════════════════════════════════════
// Traducción Inteligente de Subtítulos con IA — v4.1141.0
//
// Integra el motor de traducción multilingüe de Club Platform
// (translationProviders.js) para traducir segmentos de subtítulos
// preservando con absoluta precisión los timestamps (inicio y fin) de cada clip.
// ════════════════════════════════════════════════════════════════════════════

import { translateBatch } from './translationProviders.js';
import { LOCALES } from './translationSpec.js';

export async function translateSubtitles(segments, targetLang) {
    if (!Array.isArray(segments) || segments.length === 0) {
        return { targetLang, segments: [] };
    }

    const validLang = LOCALES.find(l => l.code === targetLang)?.code || 'en';

    // Extraer solo los textos manteniendo el orden exacto del array
    const texts = segments.map(s => String(s.text || '').trim());

    // Traducir en lote mediante la infraestructura existente de Club Platform
    const { translations, provider } = await translateBatch(texts, validLang);

    // Reconstruir segmentos manteniendo marcas de tiempo y propiedades
    const translatedSegments = segments.map((seg, idx) => ({
        ...seg,
        text: translations[idx] || seg.text,
        translated: true,
        sourceText: seg.text,
        lang: validLang
    }));

    return {
        targetLang: validLang,
        provider,
        segments: translatedSegments,
        count: translatedSegments.length
    };
}
