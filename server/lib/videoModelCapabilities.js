// ─────────────────────────────────────────────────────────────────────────────
// CAPACIDADES DE LOS MODELOS IMAGE-TO-VIDEO (v4.1030)
//
// Qué acepta cada modelo ANTES de llamar al proveedor: duraciones, relación de
// aspecto, resolución, audio nativo, cantidad de imágenes y qué campos
// opcionales entiende. Es la ÚNICA fuente de esos datos: `VIDEO_ENGINES`
// (reelSpec.js) toma de acá sus `durations`, y `createKieVideoTask`
// (kieService.js) NORMALIZA la petición contra esto antes de armar el payload.
//
// POR QUÉ EXISTE. El reporte que lo originó: «KIE createTask
// (kling-2.6/image-to-video): la duración no está dentro del rango de opciones
// permitidas». La primera generación de esa escena había pasado con `5`; al
// ingerir el clip se guardó su duración MEDIDA (`5.04`), y el relanzamiento
// la mandó tal cual. Kling sólo acepta `5` o `10`. Fue una validación de
// PARÁMETROS —nuestro payload—, no un fallo del modelo, y llegó al proveedor
// porque nadie comprobaba el payload contra lo que el modelo declara.
//
// Es PURO: sin base, sin red, sin variables de entorno. Se prueba con
// `npm run test:reels:capabilities`.
// ─────────────────────────────────────────────────────────────────────────────

// La duración pedida se ajusta a la más cercana que el modelo entrega si la
// diferencia es de fracciones de segundo (la deriva de un clip medido: 5.04,
// 4.96); si no, a la siguiente por ARRIBA, para que nunca falte metraje —
// sobrar lo resuelve el montaje, faltar deja un hueco.
export const DURATION_SNAP_TOLERANCE_SEC = 0.5;

// Cada familia se identifica por el id del modelo de la pasarela. Los ids son
// configurables por entorno (KIE los renombra), así que se casa por PATRÓN y
// no por igualdad. La lista es CERRADA: un modelo que ninguna familia
// reconozca cae en `generic`, que declara lo mínimo y lo dice.
const FAMILIES = [
    {
        id: 'kling_i2v',
        match: /^kling[-_]?[\d.]*\/image-to-video/i,
        capabilities: {
            durations: [5, 10],
            aspectRatios: null,          // la hereda de la imagen: NO recibe aspect_ratio
            resolutions: ['1080p'],
            sound: true,                 // `sound` es obligatorio; true enciende el audio nativo
            imageCount: 1,
            optionalFields: ['negative_prompt'],
            promptMaxChars: 2500,
            fields: ['prompt', 'image_urls', 'duration', 'sound']
        }
    },
    {
        id: 'seedance_i2v',
        match: /seedance.*i2v|seedance.*image-to-video/i,
        capabilities: {
            durations: [5, 10],
            aspectRatios: ['9:16', '16:9', '1:1'],
            resolutions: ['1080p'],
            sound: false,
            imageCount: 1,
            optionalFields: [],
            promptMaxChars: 2000,
            fields: ['prompt', 'image_urls', 'duration', 'aspect_ratio', 'resolution']
        }
    },
    {
        id: 'veo3_i2v',
        match: /veo-?3.*image-to-video/i,
        capabilities: {
            durations: [8],
            aspectRatios: ['9:16', '16:9'],
            resolutions: ['1080p'],
            sound: true,
            imageCount: 1,
            optionalFields: [],
            promptMaxChars: 2000,
            fields: ['prompt', 'image_urls', 'duration', 'aspect_ratio', 'resolution']
        }
    },
    {
        id: 'minimax_i2v',
        match: /hailuo.*i2v|minimax.*i2v/i,
        capabilities: {
            durations: [6, 10],
            aspectRatios: null,
            resolutions: ['1080p'],
            sound: false,
            imageCount: 1,
            optionalFields: [],
            promptMaxChars: 2000,
            fields: ['prompt', 'image_urls', 'duration', 'aspect_ratio', 'resolution']
        }
    }
];

const GENERIC = {
    id: 'generic',
    known: false,
    durations: [5, 10],
    aspectRatios: null,
    resolutions: ['1080p'],
    sound: false,
    imageCount: 1,
    optionalFields: [],
    promptMaxChars: 2000,
    fields: ['prompt', 'image_urls', 'duration', 'aspect_ratio', 'resolution']
};

/** Capacidades declaradas del modelo. Nunca lanza: un id desconocido cae en
 *  `generic` con `known: false`, para que quien llama pueda decirlo. */
export const getModelCapabilities = (model) => {
    const id = String(model || '').trim();
    const family = FAMILIES.find(f => f.match.test(id));
    if (!family) return { ...GENERIC, model: id };
    return { id: family.id, known: true, model: id, ...family.capabilities };
};

/** Ajusta una duración a las que el modelo entrega. Devuelve `null` si no hay
 *  ninguna (nunca inventa una). */
export const snapDuration = (want, durations, tolerance = DURATION_SNAP_TOLERANCE_SEC) => {
    const list = (Array.isArray(durations) ? durations : []).map(Number).filter(d => Number.isFinite(d) && d > 0).sort((a, b) => a - b);
    if (!list.length) return null;
    const w = Number(want);
    if (!Number.isFinite(w) || w <= 0) return list[0];
    if (list.includes(w)) return w;
    const near = list.map(d => ({ d, diff: Math.abs(d - w) })).sort((a, b) => a.diff - b.diff)[0];
    if (near.diff <= tolerance) return near.d;
    const above = list.find(d => d >= w);
    return above ?? list[list.length - 1];
};

/** Un fallo de VALIDACIÓN es nuestro, no del proveedor: no se reintenta, no se
 *  cobra, y se corrige el payload. `kind` es lo que lee la clasificación. */
export class GenerationValidationError extends Error {
    constructor(message, issues = []) {
        super(message);
        this.name = 'GenerationValidationError';
        this.kind = 'validation';
        this.issues = issues;
    }
}

/**
 * Comprueba una petición contra las capacidades del modelo SIN cambiarla.
 * `errors` impide llamar al proveedor; `warnings` se pueden normalizar.
 */
export const validateGenerationRequest = (req = {}) => {
    const caps = getModelCapabilities(req.model);
    const errors = [];
    const warnings = [];

    const images = Array.isArray(req.imageUrls) ? req.imageUrls.filter(Boolean) : (req.imageUrl ? [req.imageUrl] : []);
    if (!images.length) errors.push('falta la imagen de origen (image_urls vacío)');
    else if (images.length > caps.imageCount) errors.push(`el modelo recibe ${caps.imageCount} imagen(es) y se mandaron ${images.length}`);

    if (!String(req.prompt || '').trim()) errors.push('falta el prompt');
    else if (String(req.prompt).length > caps.promptMaxChars) warnings.push(`el prompt mide ${String(req.prompt).length} caracteres y el tope es ${caps.promptMaxChars}: se recorta`);

    const dur = Number(req.duration);
    if (!caps.durations.includes(dur)) {
        const snapped = snapDuration(dur, caps.durations);
        if (snapped == null) errors.push('el modelo no declara ninguna duración');
        else warnings.push(`la duración pedida (${req.duration}s) no está entre las que entrega el modelo [${caps.durations.join(', ')}]: se ajusta a ${snapped}s`);
    }

    if (req.enableAudio && !caps.sound) warnings.push('el modelo no genera audio nativo: se pide mudo');
    if (req.negativePrompt && !caps.optionalFields.includes('negative_prompt')) warnings.push('el modelo no declara negative_prompt: no se envía');
    if (req.aspectRatio && Array.isArray(caps.aspectRatios) && !caps.aspectRatios.includes(req.aspectRatio)) {
        warnings.push(`la relación de aspecto ${req.aspectRatio} no está entre las del modelo [${caps.aspectRatios.join(', ')}]: se usa ${caps.aspectRatios[0]}`);
    }
    if (req.resolution && !caps.resolutions.includes(req.resolution)) {
        warnings.push(`la resolución ${req.resolution} no está entre las del modelo [${caps.resolutions.join(', ')}]: se usa ${caps.resolutions[0]}`);
    }
    if (!caps.known) warnings.push(`el modelo «${caps.model}» no está en el catálogo de capacidades: se manda la forma genérica`);

    return { ok: errors.length === 0, errors, warnings, capabilities: caps };
};

/**
 * Devuelve la petición YA AJUSTADA a lo que el modelo acepta, con la lista de
 * ajustes hechos (nunca silenciosos: quien llama los anota). Lanza
 * `GenerationValidationError` sólo con lo que no se puede corregir.
 */
export const normalizeGenerationRequest = (req = {}) => {
    const { ok, errors, capabilities: caps } = validateGenerationRequest(req);
    if (!ok) throw new GenerationValidationError(`petición inválida para ${caps.model}: ${errors.join('; ')}`, errors);

    const adjustments = [];
    const out = { ...req, model: caps.model };

    const dur = Number(req.duration);
    const snapped = caps.durations.includes(dur) ? dur : snapDuration(dur, caps.durations);
    if (snapped !== dur) { adjustments.push(`duración ${req.duration}s → ${snapped}s`); }
    out.duration = snapped;

    if (String(req.prompt).length > caps.promptMaxChars) {
        out.prompt = String(req.prompt).slice(0, caps.promptMaxChars).replace(/\s+\S*$/, '').trim();
        adjustments.push(`prompt recortado a ${out.prompt.length} caracteres`);
    }
    if (req.enableAudio && !caps.sound) { out.enableAudio = false; adjustments.push('audio nativo apagado: el modelo no lo genera'); }
    if (req.negativePrompt && !caps.optionalFields.includes('negative_prompt')) { out.negativePrompt = null; adjustments.push('negative_prompt omitido: el modelo no lo declara'); }
    if (req.aspectRatio && Array.isArray(caps.aspectRatios) && !caps.aspectRatios.includes(req.aspectRatio)) {
        out.aspectRatio = caps.aspectRatios[0];
        adjustments.push(`relación de aspecto ${req.aspectRatio} → ${out.aspectRatio}`);
    }
    if (req.resolution && !caps.resolutions.includes(req.resolution)) {
        out.resolution = caps.resolutions[0];
        adjustments.push(`resolución ${req.resolution} → ${out.resolution}`);
    }

    return { request: out, adjustments, capabilities: caps };
};
