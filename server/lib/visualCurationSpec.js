// ════════════════════════════════════════════════════════════════════════════
// Curaduría Visual Inteligente — Reglas Puras y Criterio Editorial (v4.1210.0)
//
// Este archivo es PURO: sin base de datos, sin red, sin dependencias de I/O.
// Define el motor de cálculo de compatibilidad, puntuación multidimensional por
// contenedor, elegibilidad ética/editorial, deduplicación y planificación de
// rotación para sitios distritales y de clubes rotarios.
// ════════════════════════════════════════════════════════════════════════════

const num = (v, def = 0) => (Number.isFinite(Number(v)) ? Number(v) : def);
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const str = (v, max = 250) => String(v ?? '').trim().slice(0, max);
const stripAccents = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');

// ─── Ponderaciones de Puntuación Configurables ──────────────────────────────
export const DEFAULT_CURATION_WEIGHTS = {
    institutional: 0.30, // 30% Relevancia institucional (causas, servicio, TRF)
    technical: 0.20,     // 20% Calidad técnica (resolución, nitidez, iluminación)
    composition: 0.20,   // 20% Composición visual (encuadre, punto focal, espacio títulos)
    containerFit: 0.20,  // 20% Compatibilidad con el contenedor (relación de aspecto, proporciones)
    narrative: 0.10,     // 10% Impacto narrativo (acción, emociones auténticas, colaboración)
};

// ─── Reglas de Exclusividad y Diversidad Visual ────────────────────────────
export const DEFAULT_EXCLUSIVITY_RULES = {
    avoidHeroNewsDuplicates: true,      // Excluye automáticamente portadas de noticias del Hero
    detectResizedOrCropped: true,       // Identifica duplicados por dHash perceptual
    avoidHeroSlideDuplicates: true,     // No permite imágenes repetidas en el mismo slider Hero
    prioritizeClubDiversity: true,      // Distribuye equitativamente la presencia de clubes
    checkNewsCoversOnCuration: true,    // Consulta portadas vigentes de noticias antes de curar
};

/** Normaliza una URL eliminando query parameters volátiles para comparación confiable */
export function normalizeImageUrl(rawUrl = '') {
    if (!rawUrl) return '';
    try {
        const u = new URL(rawUrl);
        return `${u.origin}${u.pathname}`.toLowerCase();
    } catch {
        return String(rawUrl).split('?')[0].toLowerCase().trim();
    }
}

/**
 * Detecta si una imagen candidata coincide o colisiona con alguna portada de noticia publicada.
 * Compara por: URL exacta, URL normalizada, fileId, submissionId con mismo archivo, y hash perceptual.
 */
export function detectNewsCoverConflict(candidate = {}, publishedNewsCovers = [], exclusivityRules = DEFAULT_EXCLUSIVITY_RULES) {
    if (!publishedNewsCovers || !publishedNewsCovers.length) {
        return { hasConflict: false };
    }

    const candUrlNorm = normalizeImageUrl(candidate.url);
    const candFileId = candidate.fileId;
    const candSubId = candidate.submissionId;
    const candHash = candidate.hash || candidate.technicalMetrics?.hash;

    for (const cover of publishedNewsCovers) {
        const coverUrl = cover.image || cover.imageUrl;
        const coverUrlNorm = normalizeImageUrl(coverUrl);
        const coverPostId = cover.postId || cover.id;
        const postTitle = cover.title || 'Noticia publicada';
        const postSlug = cover.slug || '';

        // 1. Coincidencia directa o normalizada de URL
        if (candUrlNorm && coverUrlNorm && (candUrlNorm === coverUrlNorm || candidate.url === coverUrl)) {
            return {
                hasConflict: true,
                postId: coverPostId,
                postTitle,
                postSlug,
                newsCoverUrl: coverUrl,
                matchType: 'exact_url',
                reason: `Esta fotografía ya se utiliza como portada de la noticia «${postTitle}».`,
            };
        }

        // 2. Coincidencia por fileId o mediaId
        if (candFileId && cover.fileId && String(candFileId) === String(cover.fileId)) {
            return {
                hasConflict: true,
                postId: coverPostId,
                postTitle,
                postSlug,
                newsCoverUrl: coverUrl,
                matchType: 'file_id',
                reason: `Esta fotografía (archivo ${candFileId}) ya es la portada oficial de la noticia «${postTitle}».`,
            };
        }

        // 3. Coincidencia por submissionId + filename
        if (candSubId && cover.submissionId && String(candSubId) === String(cover.submissionId)) {
            if (candidate.filename && cover.filename && candidate.filename.toLowerCase() === cover.filename.toLowerCase()) {
                return {
                    hasConflict: true,
                    postId: coverPostId,
                    postTitle,
                    postSlug,
                    newsCoverUrl: coverUrl,
                    matchType: 'submission_file',
                    reason: `Esta fotografía de Rotary en Acción ya se publicó como portada en la noticia «${postTitle}».`,
                };
            }
        }

        // 4. Coincidencia por Hash Perceptual (dHash <= 8 bits de distancia Hamming)
        if (exclusivityRules?.detectResizedOrCropped && candHash && cover.hash) {
            if (areImagesNearDuplicates(candHash, cover.hash, 8)) {
                return {
                    hasConflict: true,
                    postId: coverPostId,
                    postTitle,
                    postSlug,
                    newsCoverUrl: coverUrl,
                    matchType: 'perceptual_hash',
                    reason: `La composición visual coincide perceptiblemente con la portada de la noticia «${postTitle}».`,
                };
            }
        }
    }

    return { hasConflict: false };
}

// ─── Catálogo de Contenedores Visuales de Club Platform ─────────────────────
export const CONTAINER_SPECS = {
    hero: {
        key: 'hero',
        label: 'Hero — Slider Principal',
        description: '5 imágenes de slide con rotación automática. Tamaño ideal: 1600×700px, horizontal.',
        slots: 5,
        targetAspect: 16 / 7, // ~2.28
        minWidth: 1200,
        minHeight: 500,
        preferredOrientation: 'landscape',
        allowTextOverlay: true,
        priorityThemes: ['servicio', 'accion', 'comunidad', 'impacto', 'juventud'],
        requiresHighRes: true,
    },
    foundation: {
        key: 'foundation',
        label: 'Fundación Rotaria',
        description: '1 imagen de fondo para la sección de la Fundación. Tamaño ideal: 1600×700px, panorámica.',
        slots: 1,
        targetAspect: 16 / 7,
        minWidth: 1200,
        minHeight: 500,
        preferredOrientation: 'landscape',
        allowTextOverlay: true,
        priorityThemes: ['fundacion_rotaria', 'subvencion', 'polio', 'salud', 'agua', 'educacion'],
        requiresHighRes: true,
    },
    join: {
        key: 'join',
        label: 'Sección Únete',
        description: '1 imagen motivacional para la sección de reclutamiento. Tamaño ideal: 800×600px.',
        slots: 1,
        targetAspect: 4 / 3, // ~1.33
        minWidth: 600,
        minHeight: 450,
        preferredOrientation: 'landscape',
        allowTextOverlay: false,
        priorityThemes: ['companerismo', 'liderazgo', 'jovenes', 'voluntariado', 'accion'],
        requiresHighRes: false,
    },
    homeBanner: {
        key: 'homeBanner',
        label: 'Banda del Inicio',
        description: '1 imagen destacada en la portada, se muestra completa sin recortar.',
        slots: 1,
        targetAspect: 3 / 2, // ~1.5
        minWidth: 900,
        minHeight: 600,
        preferredOrientation: 'landscape',
        allowTextOverlay: false,
        priorityThemes: ['evento', 'comunidad', 'campana'],
        requiresHighRes: false,
    },
    spotlight: {
        key: 'spotlight',
        label: 'Bloque Destacado del Inicio',
        description: '1 imagen panorámica de alto impacto previa al footer.',
        slots: 1,
        targetAspect: 16 / 7,
        minWidth: 1400,
        minHeight: 600,
        preferredOrientation: 'landscape',
        allowTextOverlay: true,
        priorityThemes: ['impacto_global', 'servicio', 'accion'],
        requiresHighRes: true,
    },
    causesHero: {
        key: 'causesHero',
        label: 'Hero — Banner (Causas)',
        description: 'Banner superior de la página de causas y áreas de interés.',
        slots: 1,
        targetAspect: 16 / 6,
        minWidth: 1200,
        minHeight: 450,
        preferredOrientation: 'landscape',
        allowTextOverlay: true,
        priorityThemes: ['areas_interes', 'comunidad', 'medio_ambiente', 'paz'],
        requiresHighRes: true,
    },
    causes: {
        key: 'causes',
        label: 'Tarjetas de Causas (Grid)',
        description: '7 tarjetas temáticas correspondientes a las causas de Rotary.',
        slots: 7,
        targetAspect: 1 / 1, // Cuadradas
        minWidth: 400,
        minHeight: 400,
        preferredOrientation: 'square',
        allowTextOverlay: false,
        priorityThemes: ['paz', 'enfermedades', 'agua', 'materno_infantil', 'educacion', 'desarrollo_economico', 'medio_ambiente'],
        requiresHighRes: false,
    },
    polio: {
        key: 'polio',
        label: 'Erradicación de la Polio',
        description: 'Imagen destacada para la causa insignia End Polio Now.',
        slots: 1,
        targetAspect: 4 / 3,
        minWidth: 800,
        minHeight: 600,
        preferredOrientation: 'landscape',
        allowTextOverlay: false,
        priorityThemes: ['polio', 'salud', 'vacunacion', 'infancia'],
        requiresHighRes: false,
    },
    aboutHero: {
        key: 'aboutHero',
        label: 'Quiénes Somos — Banner',
        description: 'Banner superior de la página institucional Quiénes Somos.',
        slots: 1,
        targetAspect: 16 / 5,
        minWidth: 1400,
        minHeight: 440,
        preferredOrientation: 'landscape',
        allowTextOverlay: true,
        priorityThemes: ['identidad', 'lideres', 'historia', 'accion'],
        requiresHighRes: true,
    },
    aboutCarousel: {
        key: 'aboutCarousel',
        label: 'Quiénes Somos — Carrusel Institucional',
        description: '5 imágenes que acompañan la historia y valores de la organización.',
        slots: 5,
        targetAspect: 8 / 5,
        minWidth: 600,
        minHeight: 375,
        preferredOrientation: 'landscape',
        allowTextOverlay: false,
        priorityThemes: ['servicio', 'valores', 'comunidad', 'alianzas'],
        requiresHighRes: false,
    },
};

// ─── 7 Áreas de Interés de Rotary ──────────────────────────────────────────
export const ROTARY_CAUSES = [
    { id: 'paz', name: 'Promoción de la paz', keywords: ['paz', 'conflicto', 'dialogo', 'convivencia', 'mediacion'] },
    { id: 'enfermedades', name: 'Prevención y tratamiento de enfermedades', keywords: ['salud', 'medico', 'enfermedad', 'hospital', 'brigada', 'vacunacion', 'cancer'] },
    { id: 'agua', name: 'Suministro de agua salubre', keywords: ['agua', 'acueducto', 'saneamiento', 'filtro', 'lavado', 'higiene', 'rio'] },
    { id: 'materno_infantil', name: 'Salud materno-infantil', keywords: ['madres', 'ninos', 'bebes', 'infantil', 'nutricion', 'lactancia', 'maternidad'] },
    { id: 'educacion', name: 'Educación básica y alfabetización', keywords: ['educacion', 'escuela', 'colegio', 'libros', 'utiles', 'alfabetizacion', 'estudiantes', 'clase'] },
    { id: 'desarrollo_economico', name: 'Desarrollo económico integral y de la comunidad', keywords: ['emprendimiento', 'economia', 'empleo', 'capacitacion', 'comunidad', 'microcredito', 'rural'] },
    { id: 'medio_ambiente', name: 'Protección del medio ambiente', keywords: ['ambiente', 'arboles', 'siembra', 'reciclaje', 'fauna', 'bosque', 'ecologia', 'sostenibilidad'] },
];

// ─── Verificación de Elegibilidad Editorial y Seguridad ───────────────────
/**
 * Evalúa si una fotografía cumple con los requisitos éticos y de autorización
 * para ser considerada candidata a publicación en el sitio institucional.
 */
export function evaluateCandidateEligibility(candidate = {}) {
    const reasons = [];
    const warnings = [];

    // 1. Autorización explícita de publicación / Consentimiento
    const hasConsent = Boolean(
        candidate.consentVerified ||
        candidate.consentAt ||
        candidate.status === 'aprobado' ||
        candidate.status === 'publicado'
    );
    if (!hasConsent) {
        reasons.push('Falta verificación de consentimiento o autorización de difusión institucional.');
    }

    // 2. Seguridad con menores de edad
    const minorsMentioned = Boolean(candidate.semanticAnalysis?.involvesMinors || candidate.involvesMinors);
    const minorsProtected = Boolean(candidate.parentalConsentVerified || candidate.consentVerified);
    if (minorsMentioned && !minorsProtected) {
        warnings.push('Aparecen menores de edad identificables: requiere confirmar autorización parental antes de publicar.');
    }

    // 3. Exclusiones técnicas absolutas (documentos escaneados, capturas de pantalla, blur severo)
    const tech = candidate.technicalMetrics || {};
    const sem = candidate.semanticAnalysis || {};

    if (sem.isScreenshot) {
        reasons.push('Es una captura de pantalla, no apta para contenedores del sitio.');
    }
    if (sem.isDocumentOrFlyer) {
        reasons.push('Es un volante o documento de texto, no una fotografía institucional.');
    }
    if (tech.sharpness !== undefined && tech.sharpness < 3.0) {
        reasons.push('Nitidez insuficiente (imagen borrosa o con desenfoque severo).');
    }
    if (tech.width && tech.height && (tech.width < 400 || tech.height < 300)) {
        reasons.push('Resolución demasiado baja para visualización de alta calidad.');
    }

    const eligible = reasons.length === 0;
    return {
        eligible,
        reasons,
        warnings,
    };
}

// ─── Puntuación Multidimensional por Contenedor ────────────────────────────
/**
 * Calcula la puntuación (0 a 100) de una fotografía candidata para un contenedor específico.
 *
 * Dimensiones:
 *  A. Relevancia Institucional (30%)
 *  B. Calidad Técnica (20%)
 *  C. Composición Visual (20%)
 *  D. Compatibilidad con el Contenedor (20%)
 *  E. Impacto Narrativo (10%)
 */
export function scoreCandidateForContainer(
    candidate = {},
    containerKey = 'hero',
    slotIndex = 0,
    customWeights = {},
    publishedNewsCovers = [],
    exclusivityRules = DEFAULT_EXCLUSIVITY_RULES
) {
    const weights = { ...DEFAULT_CURATION_WEIGHTS, ...customWeights };
    const spec = CONTAINER_SPECS[containerKey] || CONTAINER_SPECS.hero;
    const eligibility = evaluateCandidateEligibility(candidate);

    if (!eligibility.eligible) {
        return {
            containerKey,
            slotIndex,
            score: 0,
            eligible: false,
            breakdown: { institutional: 0, technical: 0, composition: 0, containerFit: 0, narrative: 0 },
            reasons: eligibility.reasons,
            facts: ['La imagen no superó los filtros de elegibilidad y seguridad editorial.'],
            interpretation: 'Requiere revisión o autorización antes de considerarse elegible.',
            warnings: eligibility.warnings,
            isEligibleForHero: false,
            conflictInfo: null,
            heroExclusionReason: null,
        };
    }

    const tech = candidate.technicalMetrics || {};
    const sem = candidate.semanticAnalysis || {};
    const facts = [];
    const reasons = [];

    // A. Relevancia Institucional (0 - 100)
    let instScore = 50;
    const topics = Array.isArray(candidate.tags) ? candidate.tags : [];
    const textContext = `${candidate.title || ''} ${candidate.description || ''} ${candidate.story || ''} ${candidate.program || ''} ${candidate.topic || ''} ${candidate.areaFocus || ''}`.toLowerCase();

    // Comprobación de temáticas prioritarias del contenedor
    const matchesPriorityTheme = spec.priorityThemes.some((t) => textContext.includes(t) || topics.includes(t));
    if (matchesPriorityTheme) {
        instScore += 25;
        facts.push(`Alineado con temáticas prioritarias para ${spec.label}.`);
    }

    // Causas específicas o Fundación Rotaria
    if (containerKey === 'foundation' && (textContext.includes('fundacion') || textContext.includes('trf') || textContext.includes('subvencion') || textContext.includes('polio'))) {
        instScore += 25;
        facts.push('Documenta proyectos o actividades vinculadas a La Fundación Rotaria.');
    } else if (containerKey === 'join' && (sem.showsFellowship || sem.peopleCount > 1 || textContext.includes('joven') || textContext.includes('socio'))) {
        instScore += 20;
        facts.push('Comunica compañerismo y sentido de pertenencia a la comunidad rotaria.');
    }

    if (sem.isRotaryBranded || sem.hasRotaryEmblem || textContext.includes('rotary') || textContext.includes('rotaract')) {
        instScore += 15;
        facts.push('Presencia visible de identidad o participación rotaria.');
    }
    if (sem.showsServiceAction) {
        instScore += 15;
        facts.push('Muestra personas en acción comunitaria y servicio real.');
    }
    instScore = clamp(instScore, 10, 100);

    // B. Calidad Técnica (0 - 100)
    let techScore = 50;
    const w = num(tech.width, 1200);
    const h = num(tech.height, 800);

    if (w >= spec.minWidth && h >= spec.minHeight) {
        techScore += 20;
        facts.push(`Resolución óptima (${w}×${h} px) para el contenedor.`);
    } else if (w < spec.minWidth * 0.7) {
        techScore -= 25;
        reasons.push(`Resolución inferior a la recomendada (${spec.minWidth} px de ancho).`);
    }

    const sharpness = num(tech.sharpness, 8);
    if (sharpness >= 12) {
        techScore += 15;
        facts.push('Excelente nitidez focal y enfoque limpio.');
    } else if (sharpness < 5) {
        techScore -= 20;
        reasons.push('Nitidez moderada/baja en detalles principales.');
    }

    const brightness = num(tech.brightness, 128);
    if (brightness >= 70 && brightness <= 200) {
        techScore += 15;
    } else {
        techScore -= 15;
        reasons.push(brightness < 70 ? 'Iluminación oscura / subexpuesta.' : 'Iluminación muy brillante / sobreexpuesta.');
    }
    techScore = clamp(techScore, 10, 100);

    // C. Composición Visual (0 - 100)
    let compScore = 50;
    if (sem.hasClearFocalPoint) {
        compScore += 20;
        facts.push('Punto focal claro y equilibrado.');
    }
    if (spec.allowTextOverlay && sem.hasSpaceForText) {
        compScore += 20;
        facts.push('Espacio negativo adecuado para textos y llamados a la acción.');
    }
    if (sem.isGoodCropCandidate) {
        compScore += 10;
        facts.push('Permite recorte al encuadre requerido sin cortar sujetos clave.');
    }
    compScore = clamp(compScore, 10, 100);

    // D. Compatibilidad con el Contenedor (0 - 100)
    let fitScore = 50;
    const currentAspect = w / (h || 1);
    const aspectDiff = Math.abs(currentAspect - spec.targetAspect) / spec.targetAspect;

    if (aspectDiff <= 0.15) {
        fitScore += 40;
        facts.push(`Proporción nativa muy cercana al aspecto del contenedor (${spec.targetAspect.toFixed(2)}).`);
    } else if (aspectDiff <= 0.35) {
        fitScore += 20;
        facts.push('Proporción adaptable mediante recorte sin pérdida significativa.');
    } else {
        fitScore -= 25;
        reasons.push(`Requiere recorte pronunciado (proporción actual ${currentAspect.toFixed(2)} vs objetivo ${spec.targetAspect.toFixed(2)}).`);
    }

    if (spec.preferredOrientation === 'landscape' && w >= h) {
        fitScore += 10;
    } else if (spec.preferredOrientation === 'landscape' && h > w) {
        fitScore -= 30;
        reasons.push('Fotografía vertical en un contenedor horizontal panorámico.');
    }
    fitScore = clamp(fitScore, 10, 100);

    // E. Impacto Narrativo (0 - 100)
    let narrScore = 50;
    if (sem.showsAuthenticEmotion || sem.emotionalImpact === 'high') {
        narrScore += 25;
        facts.push('Transmite emoción y autenticidad en los rostros y gestos.');
    }
    if (sem.showsCollaboration) {
        narrScore += 15;
        facts.push('Comunica trabajo en equipo y colaboración activa.');
    }
    if (sem.showsResultsOrBeneficiaries) {
        narrScore += 15;
        facts.push('Documenta beneficiarios reales y resultados tangibles.');
    }
    narrScore = clamp(narrScore, 10, 100);

    // Puntuación Ponderada Total
    const rawTotal = (
        instScore * weights.institutional +
        techScore * weights.technical +
        compScore * weights.composition +
        fitScore * weights.containerFit +
        narrScore * weights.narrative
    );
    const score = Math.round(clamp(rawTotal, 0, 100));

    // Explicación editorial estructurada (hechos observables vs interpretación)
    const interpretation = score >= 85
        ? `Candidata de alto impacto para ${spec.label}. Aporta valor institucional y armonía compositiva.`
        : score >= 70
        ? `Opción viable para ${spec.label}, recomendada con aprobación editorial.`
        : `Compatibilidad moderada para ${spec.label}. Se recomienda evaluar alternativas con mejor encuadre o resolución.`;

    // Evaluación específica de riesgo de recorte y encuadre inteligente
    let cropRisk = 'low';
    let requiresCropAdjustment = false;
    let elementsToPreserve = 'Sujeto principal y acción central';
    if (sem.peopleCount > 0 || sem.hasPeople) {
        elementsToPreserve = (sem.peopleCount === 1)
            ? 'Rostro y expresión del protagonista'
            : 'Rostros y personas de la actividad comunitaria';
    }

    if (spec.preferredOrientation === 'landscape' && h > w) {
        cropRisk = 'high';
        requiresCropAdjustment = true;
    } else if (aspectDiff > 0.28) {
        cropRisk = 'high';
        requiresCropAdjustment = true;
    } else if (aspectDiff > 0.15) {
        cropRisk = 'moderate';
    }

    // Punto focal inteligente sugerido (e.g. preservar rostros sin cortar torsos)
    let suggestedY = 50;
    let suggestedX = 50;
    if (sem.focalPointY !== undefined && sem.focalPointY !== null) {
        suggestedY = clamp(Math.round(sem.focalPointY), 10, 90);
    } else if (sem.peopleCount > 0) {
        // En fotos 4:3 o estándar en contenedores ultra-panorámicos (Hero), evitar object-top que solo muestra techos
        suggestedY = currentAspect < 1.6 && spec.targetAspect >= 2.0 ? 65 : 45;
    }
    if (sem.focalPointX !== undefined && sem.focalPointX !== null) {
        suggestedX = clamp(Math.round(sem.focalPointX), 10, 90);
    }

    const cropAdvice = requiresCropAdjustment
        ? 'Esta imagen requiere ajuste de encuadre antes de su publicación para evitar recortar personas o elementos clave.'
        : 'Encuadre compatible con el contenedor.';

    const allWarnings = [...(eligibility.warnings || [])];
    if (requiresCropAdjustment) {
        allWarnings.push(cropAdvice);
    }

    // Detección de conflicto con portadas de noticias
    const newsConflict = detectNewsCoverConflict(candidate, publishedNewsCovers, exclusivityRules);
    const isEligibleForHero = containerKey === 'hero' ? !newsConflict.hasConflict : true;

    if (containerKey === 'hero' && newsConflict.hasConflict) {
        allWarnings.push(
            `⚠️ Conflicto editorial: Esta fotografía ya se utiliza como portada de la noticia «${newsConflict.postTitle}». Se excluye del Hero para evitar duplicación visual.`
        );
    }

    return {
        containerKey,
        slotIndex,
        score,
        eligible: true,
        isEligibleForHero,
        conflictInfo: newsConflict.hasConflict ? newsConflict : null,
        heroExclusionReason: newsConflict.hasConflict ? newsConflict.reason : null,
        breakdown: {
            institutional: Math.round(instScore),
            technical: Math.round(techScore),
            composition: Math.round(compScore),
            containerFit: Math.round(fitScore),
            narrative: Math.round(narrScore),
        },
        reasons: facts.concat(reasons),
        facts,
        interpretation,
        warnings: allWarnings,
        cropRisk,
        requiresCropAdjustment,
        cropSuggested: {
            targetAspect: spec.targetAspect,
            zoom: 100,
            x: suggestedX,
            y: suggestedY,
            mode: (cropRisk === 'high' && h > w) ? 'contain' : 'cover',
            cropRisk,
            requiresCropAdjustment,
            advice: cropAdvice,
            elementsToPreserve,
            mobile: {
                x: suggestedX,
                y: Math.max(30, suggestedY - 10),
                zoom: 100,
            },
        },
    };
}

// ─── Planificador de Recomendaciones y Diversidad ──────────────────────────
/**
 * Toma una lista de candidatos evaluados y selecciona las mejores recomendaciones
 * garantizando diversidad de clubes de origen, diversidad temática y evitando
 * imágenes casi idénticas en el mismo contenedor (ej. en el carrusel Hero).
 */
export function planContainerRecommendations({
    candidates = [],
    containerKey = 'hero',
    slotsCount = 5,
    lockedSlots = {},
    weights = DEFAULT_CURATION_WEIGHTS,
    publishedNewsCovers = [],
    exclusivityRules = DEFAULT_EXCLUSIVITY_RULES,
} = {}) {
    const scoredList = [];

    for (const c of candidates) {
        const evaluation = scoreCandidateForContainer(
            c,
            containerKey,
            0,
            weights,
            publishedNewsCovers,
            exclusivityRules
        );
        if (evaluation.eligible && evaluation.score >= 40) {
            scoredList.push({
                candidate: c,
                evaluation,
                score: evaluation.score,
                clubName: c.club || c.clubName || 'Distrito 4281',
                hash: c.hash || c.technicalMetrics?.hash || '',
                conflict: evaluation.conflictInfo,
            });
        }
    }

    // Ordenar de mayor a menor puntuación
    scoredList.sort((a, b) => b.score - a.score);

    const recommendations = [];
    const usedHashes = new Set();
    const pickedSlideHashes = [];
    const clubOccurrences = new Map();

    for (let slot = 0; slot < slotsCount; slot++) {
        const slotKey = `${containerKey}-${slot}`;

        // Si el slot está bloqueado por el administrador, no se propone reemplazo automático
        if (lockedSlots[slotKey]) {
            recommendations.push({
                slotIndex: slot,
                slotKey,
                isLocked: true,
                lockedInfo: lockedSlots[slotKey],
                selected: null,
            });
            continue;
        }

        let picked = null;

        for (const item of scoredList) {
            // No repetir la misma imagen exacta
            if (usedHashes.has(item.candidate.id) || usedHashes.has(item.candidate.url)) continue;

            // 1. REGLA HERO vs NOTICIAS: Excluir portadas de noticias publicadas del Hero
            if (containerKey === 'hero' && exclusivityRules?.avoidHeroNewsDuplicates && item.conflict?.hasConflict) {
                // Si la fotografía colisiona con portada de noticia, buscar alternativa inteligente de la misma actividad
                const alternative = scoredList.find((alt) =>
                    alt.candidate.submissionId &&
                    alt.candidate.submissionId === item.candidate.submissionId &&
                    alt.candidate.id !== item.candidate.id &&
                    !alt.conflict?.hasConflict &&
                    !usedHashes.has(alt.candidate.id) &&
                    !usedHashes.has(alt.candidate.url)
                );

                if (alternative) {
                    picked = {
                        ...alternative,
                        isAlternative: true,
                        alternativeOf: item.candidate.title,
                        alternativeReason: `Fotografía seleccionada como alternativa de la misma actividad («${item.candidate.title}») con diferente composición para evitar duplicar la portada de la noticia «${item.conflict.postTitle}».`,
                    };
                    break;
                }
                // Si no hay alternativa en la misma solicitud, omitir este candidato conflictivo para el Hero
                continue;
            }

            // 2. REGLA HERO SLIDE DUPLICATES: Evitar fotos repetidas o casi idénticas entre diapositivas del mismo Hero
            if (containerKey === 'hero' && exclusivityRules?.avoidHeroSlideDuplicates && item.hash) {
                const isNearDupe = pickedSlideHashes.some((h) => areImagesNearDuplicates(h, item.hash, 8));
                if (isNearDupe) continue;
            }

            // 3. REGLA DE DIVERSIDAD DE CLUBES
            if (exclusivityRules?.prioritizeClubDiversity) {
                const countForClub = clubOccurrences.get(item.clubName) || 0;
                if (countForClub >= 2 && scoredList.length > slotsCount) {
                    continue;
                }
            }

            picked = item;
            break;
        }

        // Si todos los candidatos superaron el límite de diversidad, tomamos el siguiente con mayor puntaje no conflictivo
        if (!picked) {
            for (const item of scoredList) {
                if (!usedHashes.has(item.candidate.id) && !usedHashes.has(item.candidate.url)) {
                    if (containerKey === 'hero' && exclusivityRules?.avoidHeroNewsDuplicates && item.conflict?.hasConflict) {
                        continue;
                    }
                    picked = item;
                    break;
                }
            }
        }

        if (picked) {
            usedHashes.add(picked.candidate.id);
            usedHashes.add(picked.candidate.url);
            if (picked.hash) pickedSlideHashes.push(picked.hash);
            clubOccurrences.set(picked.clubName, (clubOccurrences.get(picked.clubName) || 0) + 1);

            recommendations.push({
                slotIndex: slot,
                slotKey,
                isLocked: false,
                isAlternative: Boolean(picked.isAlternative),
                alternativeReason: picked.alternativeReason || null,
                selected: {
                    id: picked.candidate.id,
                    candidateId: picked.candidate.id,
                    url: picked.candidate.url,
                    filename: picked.candidate.filename,
                    title: picked.candidate.title,
                    club: picked.clubName,
                    submissionId: picked.candidate.submissionId,
                    activityDate: picked.candidate.activityDate,
                    score: picked.score,
                    breakdown: picked.evaluation.breakdown,
                    reasons: picked.evaluation.reasons,
                    facts: picked.evaluation.facts,
                    interpretation: picked.isAlternative
                        ? `${picked.evaluation.interpretation} [${picked.alternativeReason}]`
                        : picked.evaluation.interpretation,
                    cropSuggested: picked.evaluation.cropSuggested,
                    warnings: picked.evaluation.warnings,
                    isEligibleForHero: picked.evaluation.isEligibleForHero,
                    conflictInfo: picked.conflict || null,
                    isAlternative: Boolean(picked.isAlternative),
                    alternativeOf: picked.alternativeOf || null,
                    alternativeReason: picked.alternativeReason || null,
                },
            });
        } else {
            recommendations.push({
                slotIndex: slot,
                slotKey,
                isLocked: false,
                selected: null,
                note: 'No se encontraron más candidatas elegibles no duplicadas para este espacio.',
            });
        }
    }

    return recommendations;
}

// ─── Utilidad para Hash Perceptual y Distancia Hamming ─────────────────────
export function hammingDistance(a = '', b = '') {
    if (!a || !b || a.length !== b.length) return Infinity;
    let d = 0;
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) d++;
    }
    return d;
}

export function areImagesNearDuplicates(hashA, hashB, threshold = 6) {
    if (!hashA || !hashB) return false;
    return hammingDistance(hashA, hashB) <= threshold;
}
