// ════════════════════════════════════════════════════════════════════════════
// Utilidades del Timeline y Motor de Sincronización Audiovisual — v4.1148.0
//
// Fuente de verdad unificada para:
// - Cálculo dinámico de la duración total del proyecto.
// - Sondeo preciso de metadatos multimedia (HTML5 Video / Audio metadata).
// - División matemática no destructiva de clips (Split via trimStart/sourceStart).
// - División sincronizada de subtítulos IA.
// - Extracción / Separación de audio con supresión de duplicación acústica.
// - Snapping magnético inteligente a cabezal, cortes y bordes.
// ════════════════════════════════════════════════════════════════════════════

import type { Clip, SubtitleConfig, SubtitleSegment, Track } from './types';

/**
 * Calcula la duración global del proyecto dinámicamente como el límite superior
 * de todos los elementos temporales presentes (clips de video, audio, texto y subtítulos).
 *
 * projectDuration = max(startTime + duration, subtitle.end)
 *
 * @param clips Lista de clips del proyecto
 * @param subtitles Configuración de subtítulos con sus segmentos
 * @param minDuration Holgura mínima para líneas de tiempo vacías (predeterminado 10s)
 */
export function computeProjectDuration(
    clips: Clip[] = [],
    subtitles?: SubtitleConfig | null,
    minDuration: number = 10
): number {
    let maxEnd = 0;

    if (Array.isArray(clips)) {
        for (const clip of clips) {
            const start = Number(clip.startTime) || 0;
            const dur = Number(clip.duration) || 0;
            const clipEnd = start + dur;
            if (clipEnd > maxEnd) {
                maxEnd = clipEnd;
            }
        }
    }

    const segments = subtitles?.segments;
    if (Array.isArray(segments)) {
        for (const seg of segments) {
            const segEnd = Number(seg.end) || 0;
            if (segEnd > maxEnd) {
                maxEnd = segEnd;
            }
        }
    }

    const calculated = Math.max(minDuration, maxEnd);
    // Redondear a 2 decimales para evitar artefactos de punto flotante de JS (ej. 25.000000000002)
    return Number(calculated.toFixed(2));
}

/**
 * Inspecciona los metadatos reales de un archivo o URL de video/audio en el navegador
 * para determinar su duración exacta en segundos antes o al momento de agregarlo a la línea de tiempo.
 */
export function probeMediaDuration(source: string | File): Promise<number> {
    return new Promise((resolve) => {
        const isFile = typeof File !== 'undefined' && source instanceof File;
        let url = '';
        let isAudio = false;

        if (isFile) {
            url = URL.createObjectURL(source);
            isAudio = source.type.startsWith('audio');
        } else if (typeof source === 'string') {
            url = source;
            const clean = source.split('?')[0].toLowerCase();
            isAudio = clean.endsWith('.mp3') || clean.endsWith('.wav') || clean.endsWith('.m4a') || clean.endsWith('.aac') || clean.endsWith('.ogg');
        } else {
            return resolve(10);
        }

        const element = document.createElement(isAudio ? 'audio' : 'video');
        let resolved = false;

        const cleanup = () => {
            if (resolved) return;
            resolved = true;
            if (isFile && url) {
                try {
                    URL.revokeObjectURL(url);
                } catch {
                    // ignorar
                }
            }
            element.removeAttribute('src');
            element.load();
        };

        const timer = setTimeout(() => {
            cleanup();
            resolve(10); // Valor fallback razonable si el recurso tarda en responder
        }, 5000);

        element.preload = 'metadata';
        element.onloadedmetadata = () => {
            clearTimeout(timer);
            const dur = element.duration;
            cleanup();
            if (dur && !isNaN(dur) && isFinite(dur) && dur > 0) {
                resolve(Number(dur.toFixed(2)));
            } else {
                resolve(10);
            }
        };

        element.onerror = () => {
            clearTimeout(timer);
            cleanup();
            resolve(10);
        };

        element.src = url;
    });
}

/**
 * Divide un clip en un punto temporal específico sin duplicar el archivo físico,
 * conservando la referencia al recurso original mediante startTime, duration y trimStart.
 */
export function splitClip(clip: Clip, atTime: number): [Clip, Clip] | null {
    if (atTime <= clip.startTime || atTime >= (clip.startTime + clip.duration)) {
        return null;
    }

    const firstDuration = Number((atTime - clip.startTime).toFixed(2));
    const secondDuration = Number((clip.duration - firstDuration).toFixed(2));

    if (firstDuration <= 0.1 || secondDuration <= 0.1) {
        return null;
    }

    const firstClip: Clip = {
        ...clip,
        duration: firstDuration
    };

    const secondClip: Clip = {
        ...JSON.parse(JSON.stringify(clip)),
        id: `clip-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        name: clip.name ? (clip.name.includes('(Parte') ? clip.name : `${clip.name} (Parte 2)`) : 'Clip (Parte 2)',
        startTime: atTime,
        duration: secondDuration,
        trimStart: Number(((clip.trimStart || 0) + firstDuration).toFixed(2))
    };

    return [firstClip, secondClip];
}

/**
 * Divide un segmento de subtítulo en el timestamp indicado, distribuyendo el texto
 * de forma proporcional entre ambas partes.
 */
export function splitSubtitleSegment(seg: SubtitleSegment, atTime: number): [SubtitleSegment, SubtitleSegment] | null {
    if (atTime <= seg.start || atTime >= seg.end) {
        return null;
    }

    const totalDuration = seg.end - seg.start;
    if (totalDuration <= 0.2) return null;

    const fraction = (atTime - seg.start) / totalDuration;
    const words = (seg.text || '').trim().split(/\s+/);

    let text1 = seg.text;
    let text2 = seg.text;

    if (words.length > 1) {
        const splitIndex = Math.max(1, Math.min(words.length - 1, Math.round(words.length * fraction)));
        text1 = words.slice(0, splitIndex).join(' ');
        text2 = words.slice(splitIndex).join(' ');
    }

    const seg1Translations: Record<string, string> = {};
    const seg2Translations: Record<string, string> = {};
    if (seg.translations) {
        for (const [lang, fullText] of Object.entries(seg.translations)) {
            const trWords = (fullText || '').trim().split(/\s+/);
            if (trWords.length > 1) {
                const sIdx = Math.max(1, Math.min(trWords.length - 1, Math.round(trWords.length * fraction)));
                seg1Translations[lang] = trWords.slice(0, sIdx).join(' ');
                seg2Translations[lang] = trWords.slice(sIdx).join(' ');
            } else {
                seg1Translations[lang] = fullText;
                seg2Translations[lang] = fullText;
            }
        }
    }

    const seg1: SubtitleSegment = {
        ...seg,
        end: Number(atTime.toFixed(2)),
        text: text1,
        translations: Object.keys(seg1Translations).length > 0 ? seg1Translations : seg.translations
    };

    const seg2: SubtitleSegment = {
        ...JSON.parse(JSON.stringify(seg)),
        id: `sub-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        start: Number(atTime.toFixed(2)),
        text: text2,
        translations: Object.keys(seg2Translations).length > 0 ? seg2Translations : seg.translations
    };

    return [seg1, seg2];
}

/**
 * Separa / extrae el audio de un clip de video:
 * 1. Silencia el clip de video original (`muted: true`).
 * 2. Genera un clip independiente de audio con el mismo source, startTime, duration y trimStart.
 * 3. Asigna la pista de voz o audio compatible.
 */
export function separateAudioFromVideo(
    videoClip: Clip,
    tracks: Track[]
): { updatedVideoClip: Clip; newAudioClip: Clip; targetTrackId: string } {
    const updatedVideoClip: Clip = {
        ...videoClip,
        muted: true
    };

    // Buscar una pista de audio disponible (preferir locución/voz, luego música, o la primera de tipo audio)
    let audioTrack = tracks.find(t => t.id === 'track-voice') ||
                     tracks.find(t => t.id === 'track-music') ||
                     tracks.find(t => t.type === 'audio');

    const targetTrackId = audioTrack ? audioTrack.id : 'track-voice';

    const newAudioClip: Clip = {
        id: `clip-audio-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        trackId: targetTrackId,
        type: 'audio',
        name: `${videoClip.name || 'Video'} (Audio Extraído)`,
        url: videoClip.url,
        startTime: videoClip.startTime,
        duration: videoClip.duration,
        trimStart: videoClip.trimStart || 0,
        volume: videoClip.volume ?? 100,
        muted: false
    };

    return {
        updatedVideoClip,
        newAudioClip,
        targetTrackId
    };
}

/**
 * Calcula el punto magnético más cercano si la diferencia está dentro del umbral (threshold en segundos).
 */
export function findSnapPoint(
    candidateTime: number,
    snapTargets: number[],
    threshold: number = 0.25
): number | null {
    let closest: number | null = null;
    let minDiff = threshold;

    for (const target of snapTargets) {
        const diff = Math.abs(candidateTime - target);
        if (diff < minDiff) {
            minDiff = diff;
            closest = target;
        }
    }

    return closest;
}

/**
 * Formatea un tiempo en segundos al estándar de edición de video (MM:SS.ms).
 * Ejemplo: 39.42 -> 00:39.42
 */
export function formatTimecode(seconds: number = 0): string {
    const s = Math.max(0, Number(seconds) || 0);
    const mins = Math.floor(s / 60);
    const secs = Math.floor(s % 60);
    const ms = Math.floor((s % 1) * 100);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(ms).padStart(2, '0')}`;
}

/**
 * Obtiene el texto específico para el idioma activo de un segmento,
 * consultando seg.translations[activeLang] y manteniendo compatibilidad hacia atrás.
 */
export function getSegmentText(
    segment?: SubtitleSegment | null,
    activeLang?: string,
    fallbackLang?: string
): string {
    if (!segment) return '';
    if (activeLang && segment.translations && typeof segment.translations[activeLang] === 'string' && segment.translations[activeLang].trim()) {
        return segment.translations[activeLang];
    }
    if (fallbackLang && segment.translations && typeof segment.translations[fallbackLang] === 'string' && segment.translations[fallbackLang].trim()) {
        return segment.translations[fallbackLang];
    }
    return segment.text || '';
}

/**
 * Resuelve y retorna los segmentos con el texto correspondiente al idioma activo.
 * Garantiza que cada segmento tenga el texto de la versión activa en seg.text y su mapa translations poblado.
 */
export function resolveActiveSubtitleSegments(
    subtitles?: SubtitleConfig | null,
    targetLang?: string
): SubtitleSegment[] {
    if (!subtitles || !Array.isArray(subtitles.segments)) return [];
    const sourceLang = subtitles.sourceLanguage || 'es';
    const activeLang = targetLang || subtitles.activeLanguage || subtitles.language || sourceLang;
    const versionSegments = subtitles.translations?.[activeLang]?.segments;

    return subtitles.segments.map((seg, idx) => {
        const segTranslations: Record<string, string> = {
            ...(seg.translations || {})
        };

        // Si el segmento no tiene guardado el idioma fuente en translations, guardarlo
        if (!segTranslations[sourceLang] && seg.text) {
            segTranslations[sourceLang] = seg.text;
        }

        // Obtener traducción desde el mapa del segmento o desde la versión histórica en translations
        let resolvedText = segTranslations[activeLang];
        if (!resolvedText && Array.isArray(versionSegments)) {
            const match = versionSegments.find(vs => vs.id === seg.id) || versionSegments[idx];
            if (match?.text) {
                resolvedText = match.text;
                segTranslations[activeLang] = match.text;
            }
        }

        if (!resolvedText) {
            resolvedText = segTranslations[sourceLang] || seg.text || '';
        }

        return {
            ...seg,
            text: resolvedText,
            translations: segTranslations
        };
    });
}

/**
 * Cambia el idioma activo de subtítulos sin regenerar con IA y sin modificar timestamps.
 * Retorna una nueva configuración de SubtitleConfig con los textos correspondientes al nuevo idioma.
 */
export function switchSubtitleLanguage(
    subtitles: SubtitleConfig,
    targetLang: string
): SubtitleConfig {
    if (!subtitles) return subtitles;
    const sourceLang = subtitles.sourceLanguage || 'es';
    const currentActive = subtitles.activeLanguage || subtitles.language || sourceLang;

    // Respaldar el texto actual del idioma saliente en translations
    const currentTranslations = { ...(subtitles.translations || {}) };
    const segmentsWithSavedCurrent = (subtitles.segments || []).map(seg => {
        const trs = { ...(seg.translations || {}) };
        if (seg.text) {
            trs[currentActive] = seg.text;
        }
        return {
            ...seg,
            translations: trs
        };
    });

    if (currentTranslations[currentActive]) {
        currentTranslations[currentActive] = {
            ...currentTranslations[currentActive],
            segments: segmentsWithSavedCurrent.map(s => ({ ...s, text: s.translations?.[currentActive] || s.text }))
        };
    } else {
        currentTranslations[currentActive] = {
            language: currentActive,
            isOriginal: currentActive === sourceLang,
            segments: segmentsWithSavedCurrent.map(s => ({ ...s, text: s.translations?.[currentActive] || s.text }))
        };
    }

    // Resolver segmentos para targetLang
    const resolvedSegments = segmentsWithSavedCurrent.map((seg, idx) => {
        const trs = { ...(seg.translations || {}) };
        let targetText = trs[targetLang];

        if (!targetText && currentTranslations[targetLang]?.segments) {
            const match = currentTranslations[targetLang].segments.find(s => s.id === seg.id) || currentTranslations[targetLang].segments[idx];
            if (match?.text) {
                targetText = match.text;
                trs[targetLang] = match.text;
            }
        }

        if (!targetText) {
            targetText = trs[sourceLang] || seg.text;
        }

        return {
            ...seg,
            text: targetText,
            translations: trs
        };
    });

    // Actualizar registro del targetLang en translations si no existía
    if (!currentTranslations[targetLang]) {
        currentTranslations[targetLang] = {
            language: targetLang,
            isOriginal: targetLang === sourceLang,
            segments: resolvedSegments
        };
    }

    const available = Array.from(new Set([
        sourceLang,
        ...Object.keys(currentTranslations),
        ...(subtitles.availableLanguages || [])
    ]));

    return {
        ...subtitles,
        activeLanguage: targetLang,
        language: targetLang,
        availableLanguages: available,
        segments: resolvedSegments,
        translations: currentTranslations
    };
}

/**
 * Modifica el texto de un segmento para el idioma activo SIN sobrescribir los otros idiomas.
 */
export function updateSubtitleSegmentText(
    subtitles: SubtitleConfig,
    segmentId: string,
    newText: string,
    targetLang?: string
): SubtitleConfig {
    const sourceLang = subtitles.sourceLanguage || 'es';
    const lang = targetLang || subtitles.activeLanguage || subtitles.language || sourceLang;
    const currentTranslations = { ...(subtitles.translations || {}) };

    const updatedSegments = (subtitles.segments || []).map(seg => {
        if (seg.id !== segmentId) return seg;
        const trs = { ...(seg.translations || {}) };
        trs[lang] = newText;
        return {
            ...seg,
            text: (lang === (subtitles.activeLanguage || sourceLang)) ? newText : seg.text,
            translations: trs
        };
    });

    // Actualizar también la pista de ese idioma en translations
    if (currentTranslations[lang]) {
        currentTranslations[lang] = {
            ...currentTranslations[lang],
            segments: (currentTranslations[lang].segments || []).map(s => {
                if (s.id !== segmentId) return s;
                return { ...s, text: newText };
            }),
            updatedAt: new Date().toISOString()
        };
    }

    return {
        ...subtitles,
        segments: updatedSegments,
        translations: currentTranslations
    };
}

