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

import type { Clip, SubtitleConfig, SubtitleSegment, SubtitleTrackVersion, Track } from './types';

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
 * Normaliza cualquier variante de código de idioma al estándar ISO corto (es, en, fr, pt, de, it, ja, ko).
 * Resuelve variantes como 'SPANISH', 'Spanish', 'es-CO', 'ENGLISH', 'English', etc.
 */
export function normalizeLangCode(raw?: string | null): string {
    if (!raw || typeof raw !== 'string') return 'es';
    const clean = raw.trim().toLowerCase();
    if (clean === 'spanish' || clean === 'espanol' || clean === 'español' || clean.startsWith('es-') || clean.startsWith('es_') || clean === 'es') return 'es';
    if (clean === 'english' || clean === 'ingles' || clean === 'inglés' || clean.startsWith('en-') || clean.startsWith('en_') || clean === 'en') return 'en';
    if (clean === 'french' || clean === 'frances' || clean === 'francés' || clean.startsWith('fr-') || clean.startsWith('fr_') || clean === 'fr') return 'fr';
    if (clean === 'portuguese' || clean === 'portugues' || clean === 'português' || clean.startsWith('pt-') || clean.startsWith('pt_') || clean === 'pt') return 'pt';
    if (clean === 'german' || clean === 'aleman' || clean === 'alemán' || clean.startsWith('de-') || clean.startsWith('de_') || clean === 'de') return 'de';
    if (clean === 'italian' || clean === 'italiano' || clean.startsWith('it-') || clean.startsWith('it_') || clean === 'it') return 'it';
    if (clean === 'japanese' || clean === 'japones' || clean === 'japonés' || clean.startsWith('ja-') || clean.startsWith('ja_') || clean === 'ja') return 'ja';
    if (clean === 'korean' || clean === 'coreano' || clean.startsWith('ko-') || clean.startsWith('ko_') || clean === 'ko') return 'ko';
    return clean;
}

/**
 * Obtiene el texto específico para el idioma activo de un segmento,
 * consultando seg.translations con normalización de claves, el catálogo global
 * y manteniendo consistencia reactiva en todo el canvas y timeline.
 *
 * Orden de resolución (contenido independiente del estilo):
 * 1) translations del segmento en idioma activo
 * 2) catálogo global en idioma activo (match estricto por id)
 * 3) translations del segmento en idioma de respaldo (origen)
 * 4) catálogo global en idioma de respaldo
 * 5) seg.text como último recurso (puede estar rancio; nunca debe
 *    anteponerse a una traducción existente)
 */
export function getSegmentText(
    segment?: SubtitleSegment | null,
    activeLang?: string,
    fallbackLang?: string,
    translationsCatalog?: Record<string, SubtitleTrackVersion> | null,
    segmentIndex: number = -1
): string {
    if (!segment) return '';
    const normActive = normalizeLangCode(activeLang);
    const normFallback = normalizeLangCode(fallbackLang || 'es');
    const segIdLower = (segment.id || '').toLowerCase();

    // 1. Buscar en segment.translations haciendo match con normalización de claves
    if (segment.translations && typeof segment.translations === 'object') {
        for (const [k, v] of Object.entries(segment.translations)) {
            if (normalizeLangCode(k) === normActive && typeof v === 'string' && v.trim()) {
                return v;
            }
        }
    }

    // 2. Buscar en el catálogo global de traducciones si existe (coincidencia ID, timestamps o índice)
    if (translationsCatalog && typeof translationsCatalog === 'object') {
        for (const [k, ver] of Object.entries(translationsCatalog)) {
            if (normalizeLangCode(k) === normActive && Array.isArray(ver?.segments)) {
                const match = ver.segments.find(s => 
                    (s.id && segment.id && (s.id === segment.id || (segIdLower && s.id.toLowerCase() === segIdLower))) ||
                    (Math.abs(s.start - segment.start) < 0.08 && Math.abs(s.end - segment.end) < 0.08)
                ) || (segmentIndex >= 0 ? ver.segments[segmentIndex] : undefined);
                if (match?.text && typeof match.text === 'string' && match.text.trim()) {
                    return match.text;
                }
            }
        }
    }

    // 3. Si normActive !== normFallback: comprobar si segment.text ya contiene la versión activa
    // (es decir, no es igual al texto original de respaldo)
    if (normActive !== normFallback && segment.text && segment.text.trim()) {
        const fallbackInTrs = segment.translations ?
            Object.entries(segment.translations).find(([k]) => normalizeLangCode(k) === normFallback)?.[1] : undefined;
        if (!fallbackInTrs || fallbackInTrs.trim() !== segment.text.trim()) {
            return segment.text;
        }
    }

    // 4. Traducción del segmento en el idioma de respaldo (origen)
    if (segment.translations && typeof segment.translations === 'object') {
        for (const [k, v] of Object.entries(segment.translations)) {
            if (normalizeLangCode(k) === normFallback && typeof v === 'string' && v.trim()) {
                return v;
            }
        }
    }

    // 5. Catálogo global para el idioma de respaldo
    if (translationsCatalog && typeof translationsCatalog === 'object') {
        for (const [k, ver] of Object.entries(translationsCatalog)) {
            if (normalizeLangCode(k) === normFallback && Array.isArray(ver?.segments)) {
                const match = ver.segments.find(s => 
                    (s.id && segment.id && (s.id === segment.id || (segIdLower && s.id.toLowerCase() === segIdLower))) ||
                    (Math.abs(s.start - segment.start) < 0.08 && Math.abs(s.end - segment.end) < 0.08)
                ) || (segmentIndex >= 0 ? ver.segments[segmentIndex] : undefined);
                if (match?.text && typeof match.text === 'string' && match.text.trim()) {
                    return match.text;
                }
            }
        }
    }

    // 6. Último recurso: texto directo del segmento
    return segment.text || '';
}

/**
 * Resuelve y retorna los segmentos con el texto correspondiente al idioma activo.
 * Garantiza que cada segmento tenga el texto de la versión activa en seg.text y su mapa translations poblado.
 *
 * Contenido y estilo son independientes: esta función solo resuelve QUÉ texto
 * mostrar; nunca altera `style` (fuente, tamaño, color, fondo, posición, etc.).
 */
export function resolveActiveSubtitleSegments(
    subtitles?: SubtitleConfig | null,
    targetLang?: string
): SubtitleSegment[] {
    if (!subtitles || !Array.isArray(subtitles.segments)) return [];
    const sourceLang = normalizeLangCode(subtitles.sourceLanguage || 'es');
    const activeLang = normalizeLangCode(targetLang || subtitles.activeLanguage || subtitles.language || sourceLang);

    // Encontrar la versión correspondiente en el catálogo de traducciones con normalización de claves
    let versionSegments: SubtitleSegment[] | undefined;
    let sourceVersionSegments: SubtitleSegment[] | undefined;
    if (subtitles.translations && typeof subtitles.translations === 'object') {
        for (const [k, ver] of Object.entries(subtitles.translations)) {
            if (normalizeLangCode(k) === activeLang && Array.isArray(ver?.segments)) {
                versionSegments = ver.segments;
            }
            if (normalizeLangCode(k) === sourceLang && Array.isArray(ver?.segments)) {
                sourceVersionSegments = ver.segments;
            }
        }
    }

    return subtitles.segments.map((seg, idx) => {
        const segTranslations: Record<string, string> = {};
        const segIdLower = (seg.id || '').toLowerCase();

        // Copiar traducciones existentes normalizando claves
        if (seg.translations && typeof seg.translations === 'object') {
            for (const [k, v] of Object.entries(seg.translations)) {
                if (typeof v === 'string') {
                    segTranslations[normalizeLangCode(k)] = v;
                }
            }
        }

        // Registrar el texto fuente SIN etiquetar erróneamente el texto activo como origen:
        if (!segTranslations[sourceLang]) {
            if (Array.isArray(sourceVersionSegments)) {
                const srcMatch = sourceVersionSegments.find(vs => 
                    (vs.id && seg.id && (vs.id === seg.id || (segIdLower && vs.id.toLowerCase() === segIdLower))) ||
                    (Math.abs(vs.start - seg.start) < 0.08 && Math.abs(vs.end - seg.end) < 0.08)
                ) || sourceVersionSegments[idx];
                if (srcMatch?.text) {
                    segTranslations[sourceLang] = srcMatch.text;
                }
            } else if (activeLang === sourceLang && seg.text) {
                segTranslations[sourceLang] = seg.text;
            }
        }

        // Obtener texto para activeLang del catálogo o de translations
        let resolvedText = segTranslations[activeLang];
        if (!resolvedText && Array.isArray(versionSegments)) {
            const match = versionSegments.find(vs => 
                (vs.id && seg.id && (vs.id === seg.id || (segIdLower && vs.id.toLowerCase() === segIdLower))) ||
                (Math.abs(vs.start - seg.start) < 0.08 && Math.abs(vs.end - seg.end) < 0.08)
            ) || versionSegments[idx];
            if (match?.text) {
                resolvedText = match.text;
                segTranslations[activeLang] = match.text;
            }
        }

        // Si no se encontró en catálogo ni mapa:
        if (!resolvedText) {
            if (activeLang === sourceLang) {
                resolvedText = seg.text || segTranslations[sourceLang] || '';
                if (resolvedText) segTranslations[sourceLang] = resolvedText;
            } else if (seg.text && (!segTranslations[sourceLang] || seg.text !== segTranslations[sourceLang])) {
                resolvedText = seg.text;
                segTranslations[activeLang] = seg.text;
            } else {
                resolvedText = segTranslations[sourceLang] || seg.text || '';
            }
        }

        return {
            ...seg,
            text: resolvedText,
            translations: segTranslations
        };
    });
}

/**
 * Única fuente de verdad del subtítulo visible: combina segmento + idioma
 * activo + traducción correspondiente + estilo intacto.
 *
 * Panel lateral, línea de tiempo, canvas/vista previa, inspector y reproducción
 * deben consumir esta resolución para mostrar siempre el mismo texto.
 * Idempotente: aplicarla dos veces no cambia el resultado.
 */
export function getVisibleSubtitleSegments(
    subtitles?: SubtitleConfig | null,
    targetLang?: string
): SubtitleSegment[] {
    return resolveActiveSubtitleSegments(subtitles, targetLang);
}

/**
 * Cambia el idioma activo de subtítulos sin regenerar con IA y sin modificar timestamps.
 * Retorna una nueva configuración de SubtitleConfig con los textos correspondientes al nuevo idioma
 * asignados directamente a seg.text y sincronizados en translations.
 */
export function switchSubtitleLanguage(
    subtitles: SubtitleConfig,
    targetLang: string
): SubtitleConfig {
    if (!subtitles) return subtitles;
    const sourceLang = normalizeLangCode(subtitles.sourceLanguage || 'es');
    const currentActive = normalizeLangCode(subtitles.activeLanguage || subtitles.language || sourceLang);
    const targetNorm = normalizeLangCode(targetLang);

    // Normalizar catálogo de traducciones existente preservando las versiones guardadas
    const currentTranslations: Record<string, SubtitleTrackVersion> = {};
    if (subtitles.translations && typeof subtitles.translations === 'object') {
        for (const [k, ver] of Object.entries(subtitles.translations)) {
            if (ver && typeof ver === 'object') {
                currentTranslations[normalizeLangCode(k)] = ver;
            }
        }
    }

    // 1. Respaldar traducciones existentes por segmento
    const segmentsWithSavedCurrent = (subtitles.segments || []).map((seg, idx) => {
        const trs: Record<string, string> = {};
        const segIdLower = (seg.id || '').toLowerCase();

        if (seg.translations && typeof seg.translations === 'object') {
            for (const [k, v] of Object.entries(seg.translations)) {
                if (typeof v === 'string') trs[normalizeLangCode(k)] = v;
            }
        }

        // Si el catálogo ya tenía una versión para currentActive, preservarla
        const existingCurrentVer = currentTranslations[currentActive]?.segments;
        if (!trs[currentActive] && Array.isArray(existingCurrentVer)) {
            const match = existingCurrentVer.find(s => 
                (s.id && seg.id && (s.id === seg.id || (segIdLower && s.id.toLowerCase() === segIdLower))) ||
                (Math.abs(s.start - seg.start) < 0.08 && Math.abs(s.end - seg.end) < 0.08)
            ) || existingCurrentVer[idx];
            if (match?.text) {
                trs[currentActive] = match.text;
            }
        }

        // Solo asociar seg.text al idioma saliente si currentActive es el original o si la ranura está vacía
        // Y seg.text no es una traducción de otro idioma
        if (seg.text && !trs[currentActive]) {
            if (currentActive === sourceLang) {
                trs[sourceLang] = seg.text;
            } else if (!trs[sourceLang]) {
                trs[sourceLang] = seg.text;
            }
        }

        return {
            ...seg,
            translations: trs
        };
    });

    // 2. Si no existía entrada para sourceLang en el catálogo, asegurar que exista
    if (!currentTranslations[sourceLang]) {
        currentTranslations[sourceLang] = {
            language: sourceLang,
            languageName: subtitles.sourceLanguageName || (sourceLang === 'es' ? 'Español' : sourceLang.toUpperCase()),
            isOriginal: true,
            segments: segmentsWithSavedCurrent.map(s => ({
                ...s,
                text: s.translations?.[sourceLang] || s.text
            }))
        };
    }

    // 3. Resolver segmentos para targetNorm consultando el catálogo de la versión destino
    const targetVersionSegments = currentTranslations[targetNorm]?.segments;
    const resolvedSegments = segmentsWithSavedCurrent.map((seg, idx) => {
        const trs: Record<string, string> = { ...(seg.translations || {}) };
        const segIdLower = (seg.id || '').toLowerCase();
        let targetText = trs[targetNorm];

        if (!targetText && Array.isArray(targetVersionSegments)) {
            const match = targetVersionSegments.find(s => 
                (s.id && seg.id && (s.id === seg.id || (segIdLower && s.id.toLowerCase() === segIdLower))) ||
                (Math.abs(s.start - seg.start) < 0.08 && Math.abs(s.end - seg.end) < 0.08)
            ) || targetVersionSegments[idx];
            if (match?.text) {
                targetText = match.text;
                trs[targetNorm] = match.text;
            }
        }

        if (!targetText) {
            if (targetNorm !== sourceLang && seg.text && (!trs[sourceLang] || seg.text !== trs[sourceLang])) {
                targetText = seg.text;
            } else {
                targetText = trs[sourceLang] || seg.text || '';
            }
        }

        // Garantizar que la traducción quede persistida en el mapa
        trs[targetNorm] = targetText;

        return {
            ...seg,
            text: targetText,
            translations: trs
        };
    });

    // 4. Actualizar o crear registro de targetNorm en currentTranslations
    if (!currentTranslations[targetNorm] || targetNorm !== sourceLang) {
        currentTranslations[targetNorm] = {
            ...(currentTranslations[targetNorm] || {}),
            language: targetNorm,
            isOriginal: targetNorm === sourceLang,
            segments: resolvedSegments
        };
    }

    const available = Array.from(new Set([
        sourceLang,
        targetNorm,
        ...Object.keys(currentTranslations),
        ...(subtitles.availableLanguages ? subtitles.availableLanguages.map(normalizeLangCode) : [])
    ]));

    return {
        ...subtitles,
        activeLanguage: targetNorm,
        language: targetNorm,
        sourceLanguage: sourceLang,
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
    const sourceLang = normalizeLangCode(subtitles.sourceLanguage || 'es');
    const currentActive = normalizeLangCode(subtitles.activeLanguage || subtitles.language || sourceLang);
    const lang = normalizeLangCode(targetLang || currentActive);

    // Normalizar catálogo de traducciones
    const currentTranslations: Record<string, SubtitleTrackVersion> = {};
    if (subtitles.translations && typeof subtitles.translations === 'object') {
        for (const [k, ver] of Object.entries(subtitles.translations)) {
            if (ver && typeof ver === 'object') {
                currentTranslations[normalizeLangCode(k)] = ver;
            }
        }
    }

    const segTargetLower = (segmentId || '').toLowerCase();
    const updatedSegments = (subtitles.segments || []).map(seg => {
        const matches = seg.id === segmentId || (seg.id && segTargetLower && seg.id.toLowerCase() === segTargetLower);
        if (!matches) return seg;
        const trs: Record<string, string> = {};
        if (seg.translations && typeof seg.translations === 'object') {
            for (const [k, v] of Object.entries(seg.translations)) {
                if (typeof v === 'string') trs[normalizeLangCode(k)] = v;
            }
        }
        trs[lang] = newText;
        return {
            ...seg,
            text: (lang === currentActive) ? newText : seg.text,
            translations: trs
        };
    });

    // Actualizar también la pista de ese idioma en translations
    if (currentTranslations[lang]) {
        currentTranslations[lang] = {
            ...currentTranslations[lang],
            segments: (currentTranslations[lang].segments || []).map(s => {
                const matches = s.id === segmentId || (s.id && segTargetLower && s.id.toLowerCase() === segTargetLower);
                if (!matches) return s;
                return { ...s, text: newText };
            }),
            updatedAt: new Date().toISOString()
        };
    } else {
        currentTranslations[lang] = {
            language: lang,
            isOriginal: lang === sourceLang,
            segments: updatedSegments.map(s => ({
                ...s,
                text: s.translations?.[lang] || s.text
            })),
            updatedAt: new Date().toISOString()
        };
    }

    return {
        ...subtitles,
        sourceLanguage: sourceLang,
        activeLanguage: currentActive,
        language: currentActive,
        segments: updatedSegments,
        translations: currentTranslations
    };
}


