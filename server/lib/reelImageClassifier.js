// ════════════════════════════════════════════════════════════════════════════
// Clasificador y Auditor de Calidad de Imágenes para Reels Verticales 9:16
//
// ⚠️ POR QUÉ EXISTE:
// Los clubes rotarios suelen adjuntar en los formularios de aportes no solo
// fotografías de la actividad, sino también:
//  - Banners publicitarios o cabeceras
//  - Tarjetas de invitación digital / convocatorias
//  - Afiches / flyers con tipografía masiva
//  - Infografías o capturas de pantalla
//
// Animar estas piezas gráficas en un Reel vertical 9:16 con Kling o modelos de
// video motion deforma los textos, recorta caras de afiches y produce videos
// estáticos de baja calidad. Un Reel necesita FOTOGRAFÍAS REALES del evento,
// personas y labor comunitaria.
//
// Este módulo audita cada archivo y dictamina si la solicitud es ÓPTIMA para
// generación automática (mínimo 5 fotografías reales de actividad) o si
// requiere revisión y mapeo humano de fotografías.
// ════════════════════════════════════════════════════════════════════════════

export const MIN_OPTIMAL_REEL_PHOTOS = 5;

// Palabras clave que identifican piezas gráficas / no-fotografías
const GRAPHIC_FILENAME_PATTERNS = [
    { pattern: /(?:^|[_\-. ])(?:banner|cabecera|header|portada)(?:[_\-. ]|$)/i, type: 'banner', label: 'Banner publicitario' },
    { pattern: /(?:^|[_\-. ])(?:invitacion|invitación|invitation|tarjeta|tarjeton|convocatoria)(?:[_\-. ]|$)/i, type: 'invitacion', label: 'Tarjeta de invitación' },
    { pattern: /(?:^|[_\-. ])(?:flyer|flier|afiche|volante|folleto|poster)(?:[_\-. ]|$)/i, type: 'flyer', label: 'Afiche / Flyer publicitario' },
    { pattern: /(?:^|[_\-. ])(?:infografia|infografía|infographic|diagrama|esquema)(?:[_\-. ]|$)/i, type: 'infografia', label: 'Infografía o diseño gráfico' },
    { pattern: /(?:^|[_\-. ])(?:screenshot|pantallazo|captura)(?:[_\-. ]|$)/i, type: 'captura', label: 'Captura de pantalla' },
    { pattern: /(?:^|[_\-. ])(?:doc|documento|carta|acta|resolucion|resolución|recibo|factura)(?:[_\-. ]|$)/i, type: 'documento', label: 'Documento o acta' },
];

/**
 * Clasifica una imagen individual para determinar si califica como fotografía
 * genuina de actividad o como pieza gráfica publicitaria.
 *
 * @param {Object} file - Archivo de ContributionSubmissionFile
 * @param {Object} mediaAnalysis - Análisis de SubmissionArticleMedia (medidas y visión)
 * @returns {Object} Clasificación detallada
 */
export function classifyImageForReel(file = {}, mediaAnalysis = null) {
    const filename = String(file?.filename || file?.name || '').toLowerCase();
    const kind = file?.kind || 'image';
    const analysis = mediaAnalysis?.analysis || {};
    const measured = analysis.measured || {};
    const vision = analysis.vision || {};
    const coverNote = String(mediaAnalysis?.coverNote || '').toLowerCase();

    // 1. Si no es imagen (ej: video o documento), no es fotografía
    if (kind !== 'image') {
        return {
            fileId: file.id || file.fileId,
            filename: file.filename || 'Archivo',
            isRealPhoto: false,
            isGraphic: true,
            type: kind,
            label: kind === 'video' ? 'Video' : 'Documento',
            reason: `Archivo tipo ${kind}`,
        };
    }

    // 2. Comprobación de visión artificial previa (si existe)
    if (vision.screenshot || coverNote.includes('captura')) {
        return {
            fileId: file.id || file.fileId,
            filename: file.filename,
            isRealPhoto: false,
            isGraphic: true,
            type: 'captura',
            label: 'Captura de pantalla',
            reason: 'La IA de visión detectó una captura de pantalla',
        };
    }

    if (vision.document || coverNote.includes('documento')) {
        return {
            fileId: file.id || file.fileId,
            filename: file.filename,
            isRealPhoto: false,
            isGraphic: true,
            type: 'documento',
            label: 'Documento con texto plano',
            reason: 'La IA de visión detectó un documento escaneado o digital',
        };
    }

    // 3. Comprobación por patrones en el nombre del archivo
    for (const { pattern, type, label } of GRAPHIC_FILENAME_PATTERNS) {
        if (pattern.test(filename)) {
            return {
                fileId: file.id || file.fileId,
                filename: file.filename,
                isRealPhoto: false,
                isGraphic: true,
                type,
                label,
                reason: `Identificado como ${label.toLowerCase()} por nombre de archivo`,
            };
        }
    }

    // 4. Comprobación por proporciones geométricas atípicas de banners
    const w = Number(measured.width);
    const h = Number(measured.height);
    if (w > 0 && h > 0) {
        const ratio = w / h;
        // Banners web ultra-anchos horizontales (ej: 1200x300, 1920x400)
        if (ratio >= 2.4) {
            return {
                fileId: file.id || file.fileId,
                filename: file.filename,
                isRealPhoto: false,
                isGraphic: true,
                type: 'banner',
                label: 'Banner horizontal ultra-panorámico',
                reason: `Proporción panorámica ${ratio.toFixed(1)}:1 típica de banners publicitarios`,
            };
        }
        // Banners verticales extremos tipo rascacielos / marcalibros
        if (ratio <= 0.42) {
            return {
                fileId: file.id || file.fileId,
                filename: file.filename,
                isRealPhoto: false,
                isGraphic: true,
                type: 'banner',
                label: 'Banner vertical estrecho',
                reason: `Proporción ultra-vertical ${ratio.toFixed(1)}:1 no apta para Reel`,
            };
        }
    }

    // 5. Señales de visión sobre actividad / personas
    // Si la visión analizó y explícitamente encontró que NO muestra actividad, NO tiene personas y relevancia baja
    if (vision && typeof vision.showsActivity === 'boolean') {
        if (!vision.showsActivity && !vision.people && vision.relevance <= 2) {
            return {
                fileId: file.id || file.fileId,
                filename: file.filename,
                isRealPhoto: false,
                isGraphic: true,
                type: 'grafico',
                label: 'Pieza gráfica sin actividad',
                reason: 'La IA no detectó actividad comunitaria ni personas en la imagen',
            };
        }
    }

    // 6. Si superó todos los filtros, es una FOTOGRAFÍA GENUINA de la actividad
    return {
        fileId: file.id || file.fileId,
        filename: file.filename,
        isRealPhoto: true,
        isGraphic: false,
        type: 'fotografia',
        label: 'Fotografía de actividad',
        reason: 'Fotografía genuina apta para animación cinematográfica vertical',
    };
}

/**
 * Realiza una auditoría completa sobre todas las imágenes de una solicitud
 * para certificar si es óptima para generar un Reel vertical 9:16.
 *
 * @param {Array} files - Lista de archivos de ContributionSubmissionFile
 * @param {Object} mediaMap - Mapa de análisis por fileId (SubmissionArticleMedia)
 * @returns {Object} Resumen de auditoría para Centro de Control y UI
 */
export function auditSubmissionPhotosForReel(files = [], mediaMap = {}) {
    const images = (Array.isArray(files) ? files : []).filter(f => f.kind === 'image');
    const totalImages = images.length;

    const classified = images.map(f => {
        const mediaAnalysis = mediaMap[f.id] || null;
        const result = classifyImageForReel(f, mediaAnalysis);
        return {
            ...result,
            s3Key: f.s3Key || null,
            mediaUrl: f.mediaUrl || null,
            bytes: f.bytes || 0,
            sortOrder: f.sortOrder ?? 0,
            selected: result.isRealPhoto, // preseleccionadas por defecto solo las fotos reales
        };
    });

    const realPhotos = classified.filter(c => c.isRealPhoto);
    const graphicItems = classified.filter(c => c.isGraphic);

    const realPhotoCount = realPhotos.length;
    const graphicCount = graphicItems.length;

    // Regla de Oro: Mínimo 5 fotografías reales para ser ÓPTIMA
    const isOptimal = realPhotoCount >= MIN_OPTIMAL_REEL_PHOTOS;

    let status = 'optimo';
    let statusBadge = 'Óptimo para Reel';
    let statusMessage = '';

    if (isOptimal) {
        status = 'optimo';
        statusBadge = `Óptimo (${realPhotoCount} fotos reales)`;
        statusMessage = `Verificado por IA: Se auditaron ${realPhotoCount} fotografías genuinas de la actividad. Garantiza suficiente material cinematográfico para las 5 escenas del Reel.`;
    } else if (realPhotoCount > 0) {
        status = 'requiere_mapeo';
        statusBadge = `Requiere Mapeo (${realPhotoCount} fotos, ${graphicCount} gráficos)`;
        statusMessage = `Atención: Solo se identificaron ${realPhotoCount} fotografía(s) real(es) de la actividad de ${totalImages} archivos adjuntos (${graphicCount} son banners, afiches o invitaciones). Kling AI requiere al menos 5 fotos para generar el Reel sin deformar diseños gráficos.`;
    } else {
        status = 'sin_fotografias';
        statusBadge = 'Sin fotografías de actividad';
        statusMessage = 'No se detectaron fotografías de la actividad (todos los archivos adjuntos son piezas gráficas, afiches o documentos). No es apto para Reel cinematográfico.';
    }

    return {
        totalImages,
        realPhotoCount,
        graphicCount,
        isOptimal,
        canAutoGenerate: isOptimal,
        status,
        statusBadge,
        statusMessage,
        graphicTypes: [...new Set(graphicItems.map(g => g.label))],
        items: classified,
    };
}
